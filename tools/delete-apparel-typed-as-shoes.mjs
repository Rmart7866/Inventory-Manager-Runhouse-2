// delete-apparel-typed-as-shoes.mjs, The Run House.
//
// Deletes the DRAFT products that Stage 4 created as apparel while typing them
// as footwear, so they can be recreated correctly.
//
// WHY THEY HAVE TO GO RATHER THAN BE PATCHED. On 2026-10-20 the ON converter
// typed every garment "Women's Shoes", and worker/src/products.js gates both
// the 2 lb shipping weight and the Athletic Shoes taxonomy leaf on a type
// ending in "shoes". Category is the field Shopify applies the Massachusetts
// footwear exemption from, so six pairs of running shorts were set up to sell
// as tax exempt footwear. On top of that the Size option values were created in
// alphabetical order (L, M, S, XL, XS, XXL), and option VALUE order is the one
// thing that is far easier to get right at creation than to repair after.
// Create is create-only, so a fixed converter cannot overwrite these; the
// handle has to be free first.
//
// THE FILTER IS THE SAFETY, not a list of handles. Every one of these must hold:
//   - status DRAFT. A published or sold product is never touched.
//   - vendor ON Running.
//   - the product type ends in "shoes", the same test the Worker gates on.
//   - EVERY variant SKU is an ON 1xx article code, which is apparel. 3xx is
//     footwear and 2xx is accessories, so a real shoe can never match.
//   - at least one SKU, because a product with none cannot be proven apparel.
// A product that fails any of them is listed and skipped, not deleted.
//
// Dry run by default. --apply writes, and the rollback file is written and
// fsynced BEFORE the first delete.
//
//   node tools/delete-apparel-typed-as-shoes.mjs            # dry run
//   node tools/delete-apparel-typed-as-shoes.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');

function env() {
  const txt = fs.readFileSync(new URL('../worker/.dev.vars', import.meta.url), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
const E = env();
const SHOP = (E.SHOP_URL || '').replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';

let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error('token exchange HTTP ' + r.status);
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function gql(query, variables = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors && attempt < 4) {
    await new Promise((s) => setTimeout(s, 800 * (attempt + 1)));
    return gql(query, variables, attempt + 1);
  }
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const isFootwearType = (t) => /shoes$/i.test(String(t || '').trim());
// The ON article code's first digit: 1 apparel, 2 accessories, 3 footwear.
const articleGroup = (sku) => (/^ON-([0-9])/.exec(String(sku || '').toUpperCase()) || [])[1] || '';

const Q = `query($cursor: String) {
  products(first: 50, after: $cursor, query: "vendor:'ON Running' AND status:draft") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status productType createdAt
      category { id fullName }
      tags
      options { name optionValues { name } }
      variants(first: 100) { nodes { sku price inventoryItem { measurement { weight { value unit } } } } }
    }
  }
}`;

const all = [];
let cursor = null;
do {
  const d = await gql(Q, { cursor });
  all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (cursor);
console.log('ON Running drafts scanned: ' + all.length);

const doomed = [], skipped = [];
for (const p of all) {
  const skus = p.variants.nodes.map((v) => v.sku).filter(Boolean);
  const groups = [...new Set(skus.map(articleGroup))];
  const why = [];
  if (p.status !== 'DRAFT') why.push('not a draft');
  if (!isFootwearType(p.productType)) why.push('type is not footwear: ' + JSON.stringify(p.productType));
  if (!skus.length) why.push('no SKU, cannot prove it is apparel');
  else if (groups.length !== 1 || groups[0] !== '1') why.push('SKUs are not all 1xx apparel: ' + JSON.stringify(groups));
  (why.length ? skipped : doomed).push({ p, why });
}

console.log('\nTo delete: ' + doomed.length);
for (const { p } of doomed) {
  console.log('  ' + p.handle);
  console.log('      type ' + JSON.stringify(p.productType)
    + ' | category ' + (p.category ? p.category.fullName : '(none)')
    + ' | weight ' + (p.variants.nodes[0]?.inventoryItem?.measurement?.weight?.value ?? '(none)'));
  console.log('      sizes ' + (p.options.find((o) => o.name === 'Size')?.optionValues.map((v) => v.name).join(' > ') || '-'));
}
if (skipped.length) {
  console.log('\nSkipped: ' + skipped.length + ' (a draft that is not apparel typed as footwear)');
  for (const { p, why } of skipped.slice(0, 20)) console.log('  ' + p.handle + '  ' + why.join('; '));
  if (skipped.length > 20) console.log('  ... and ' + (skipped.length - 20) + ' more');
}

if (!doomed.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to delete.'); process.exit(0); }

// Rollback FIRST, and on disk before a single delete goes out. A deleted
// product cannot be restored by API, so this file is the only record of what
// was there: handles, titles, SKUs, prices and sizes, enough to recreate by
// hand if the recreate from the tool does not happen.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = new URL('../apparel-shoe-drafts-rollback-' + stamp + '.json', import.meta.url);
const fd = fs.openSync(file, 'w');
fs.writeSync(fd, JSON.stringify({ deletedAt: new Date().toISOString(), shop: SHOP, products: doomed.map(({ p }) => p) }, null, 2));
fs.fsyncSync(fd);
fs.closeSync(fd);
console.log('\nRollback written: ' + file.pathname);

const DEL = `mutation($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }`;
let done = 0, failed = 0;
for (const { p } of doomed) {
  const d = await gql(DEL, { input: { id: p.id } });
  const errs = d.productDelete.userErrors || [];
  if (errs.length) { failed++; console.log('  FAILED  ' + p.handle + '  ' + JSON.stringify(errs)); }
  else { done++; console.log('  deleted ' + p.handle); }
  await new Promise((s) => setTimeout(s, 250));
}
console.log('\nDeleted ' + done + ', failed ' + failed + '.');
