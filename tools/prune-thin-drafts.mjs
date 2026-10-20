// prune-thin-drafts.mjs, The Run House.
//
// Deletes the DRAFT products from a recent create batch that are too thin to be
// worth listing: fewer than --min-units total on hand across every size.
//
// WHY A SIZE RUN OF THREE IS NOT WORTH A LISTING. A dropship garment with 4
// units left is three sizes of one colorway, so most shoppers who click it find
// their size gone. It costs a product page, a photo set, a description and a
// row in every collection, and it earns a bounce. The ON re-order catalog keeps
// selling end-of-life colorways right down to the last unit, so a create batch
// straight off the feed always carries a long thin tail.
//
// THE FILTER IS THE SAFETY. Every one of these must hold:
//   - status DRAFT. A published or sold product is never touched.
//   - vendor matches --vendor.
//   - createdAt is on or after --since. Nothing from an older batch.
//   - total on hand across all variants is strictly under --min-units.
// A product failing any of them is counted and skipped, not deleted.
//
// Dry run by default. --apply writes, and the rollback file is written and
// fsynced BEFORE the first delete, because a deleted product cannot be restored
// through the API.
//
//   node tools/prune-thin-drafts.mjs --since 2026-10-20 --min-units 10
//   node tools/prune-thin-drafts.mjs --since 2026-10-20 --min-units 10 --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const APPLY = process.argv.includes('--apply');
const SINCE = arg('since', '');
const MIN_UNITS = parseInt(arg('min-units', '10'), 10);
const VENDOR = arg('vendor', 'ON Running');
// A type filter, so a run can be scoped to garments and leave shoes alone.
// 'apparel' means the type does NOT end in "shoes", the same test the Worker
// gates the shoe weight and category on.
const ONLY = arg('only', 'apparel');

if (!SINCE) { console.error('--since YYYY-MM-DD is required, so an old batch can never be caught.'); process.exit(1); }
if (!Number.isFinite(MIN_UNITS) || MIN_UNITS < 1) { console.error('--min-units must be a positive integer.'); process.exit(1); }

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
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 800 * (attempt + 1))); return gql(query, variables, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const Q = `query($q: String!, $cursor: String) {
  products(first: 50, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title status productType createdAt
      variants(first: 100) { nodes { sku inventoryQuantity selectedOptions { name value } } } }
  }
}`;

const search = `vendor:'${VENDOR}' AND status:draft AND created_at:>=${SINCE}`;
const all = []; let cursor = null;
do { const d = await gql(Q, { q: search, cursor }); all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);

const isFootwearType = (t) => /shoes$/i.test(String(t || '').trim());
const units = (p) => p.variants.nodes.reduce((a, v) => a + (v.inventoryQuantity || 0), 0);

const scoped = all.filter((p) => (ONLY === 'apparel' ? !isFootwearType(p.productType)
  : ONLY === 'footwear' ? isFootwearType(p.productType) : true));
const doomed = scoped.filter((p) => units(p) < MIN_UNITS);
const kept = scoped.filter((p) => units(p) >= MIN_UNITS);

console.log(`${VENDOR} drafts created on or after ${SINCE}: ${all.length}`);
console.log(`scoped to --only ${ONLY}: ${scoped.length}`);
console.log(`\nunder ${MIN_UNITS} units, to delete: ${doomed.length}`);
console.log(`at or over ${MIN_UNITS} units, kept:   ${kept.length}`);

const byType = {};
doomed.forEach((p) => { byType[p.productType] = (byType[p.productType] || 0) + 1; });
console.log('\nto delete, by type:');
Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  ' + k));

console.log('\nthe thin tail, units then handle:');
doomed.slice().sort((a, b) => units(a) - units(b)).forEach((p) => {
  const sizes = p.variants.nodes.filter((v) => (v.inventoryQuantity || 0) > 0).length;
  console.log('  ' + String(units(p)).padStart(4) + 'u  ' + String(sizes).padStart(2) + ' size' + (sizes === 1 ? ' ' : 's') + '  ' + p.handle);
});
console.log('\nunits removed in total: ' + doomed.reduce((a, p) => a + units(p), 0)
  + ' of ' + scoped.reduce((a, p) => a + units(p), 0));

if (!doomed.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to delete.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = new URL('../thin-drafts-rollback-' + stamp + '.json', import.meta.url);
const fd = fs.openSync(file, 'w');
fs.writeSync(fd, JSON.stringify({ deletedAt: new Date().toISOString(), shop: SHOP, since: SINCE, minUnits: MIN_UNITS, products: doomed }, null, 2));
fs.fsyncSync(fd);
fs.closeSync(fd);
console.log('\nRollback written: ' + file.pathname);

const DEL = `mutation($input: ProductDeleteInput!) { productDelete(input: $input) { deletedProductId userErrors { field message } } }`;
let done = 0, failed = 0;
for (const p of doomed) {
  const d = await gql(DEL, { input: { id: p.id } });
  const errs = d.productDelete.userErrors || [];
  if (errs.length) { failed++; console.log('  FAILED  ' + p.handle + '  ' + JSON.stringify(errs)); }
  else { done++; if (done % 20 === 0) console.log('  ... ' + done + ' / ' + doomed.length); }
  await new Promise((s) => setTimeout(s, 220));
}
console.log(`\nDeleted ${done}, failed ${failed}.`);
