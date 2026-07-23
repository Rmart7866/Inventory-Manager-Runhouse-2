// apply-product-content.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Writes product DESCRIPTIONS and the standard product CATEGORY onto products
// created in a given window, driven by a copy file keyed by base model.
//
// WHY DESCRIPTIONS ARE MODEL LEVEL. Every colourway of a model shares the same
// description, which is the assumption the whole enrichment pipeline already
// makes ("Every colorway of a model carries identical description/category/tags,
// verified against the store"). So the copy file has one entry per base model
// and this tool fans it out across that model's colourways. 342 products, 40
// pieces of copy.
//
// WHY ORIGINAL COPY. The descriptions already in the store are manufacturer copy
// pasted in with the brand's own markup (description__title,
// js-short-description-expander). Search engines treat that as duplicate content
// and rank the brand's own page above ours for the brand's own words, so
// original copy is the point of the exercise, not a nicety.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. Descriptions are only written where the description is currently EMPTY,
//      unless --overwrite is passed. Hand-written copy is never clobbered by
//      accident.
//   3. A model with no entry in the copy file is skipped. Nothing is generated
//      here; this tool only applies what it is given.
//   4. Category is set only where it is missing, unless --overwrite.
//   5. Rollback file records each product's previous descriptionHtml and
//      category, written before the first mutation.
//
// Run:  node tools/apply-product-content.mjs --copy copy.json --since 2026-07-22
//       node tools/apply-product-content.mjs --copy copy.json --since 2026-07-22 --apply
//       node tools/apply-product-content.mjs --rollback <file> --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Apparel & Accessories > Shoes > Athletic Shoes. Verified against the shop's
// own taxonomy query; it is a leaf, which Shopify requires for assignment.
const CATEGORY_GID = 'gid://shopify/TaxonomyCategory/aa-8-1';

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  env.SHOP_URL = env.SHOP_URL || 'therunhouse.myshopify.com';
  env.API_VERSION = env.API_VERSION || '2026-01';
  return env;
}

const QUERY = `
query($cursor: String, $q: String!) {
  products(first: 100, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title status vendor descriptionHtml category { id fullName } }
  }
}`;

const UPDATE = `
mutation($p: ProductUpdateInput!) {
  productUpdate(product: $p) {
    product { id }
    userErrors { field message }
  }
}`;

// Base model key: brand + model, with gender, width and colourway stripped. The
// same derivation used to build the copy file, so the two always line up.
const BRAND = { HOKA: 'hoka', ASICS: 'asics', Saucony: 'saucony', 'ON Running': 'on', Brooks: 'brooks', Puma: 'puma', 'New Balance': 'new-balance' };
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function modelKeyOf(p) {
  const base = String(p.title || '')
    .replace(/ - [^-]*$/, '')
    .replace(/\b(Men'?s?|Women'?s?|Unisex'?s?)\b/gi, ' ')
    .replace(/\b(Wide|Extra Wide)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/^(hoka|asics|saucony|on)\s+/i, '');
  return (BRAND[p.vendor] || slug(p.vendor)) + '-' + slug(base);
}

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

async function fetchAll(client, q) {
  const out = []; let cursor = null;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor, q });
    out.push(...body.data.products.nodes);
    await throttle(client, body);
    if (!body.data.products.pageInfo.hasNextPage) break;
    cursor = body.data.products.pageInfo.endCursor;
  }
  return out;
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Restoring ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  for (const e of entries) {
    console.log(`  ${e.handle}: description ${e.before.description ? 'restored' : 'cleared'}, category -> ${e.before.category || '(none)'}`);
    if (!apply) continue;
    const p = { id: e.id, descriptionHtml: e.before.description || '' };
    if (e.before.category) p.category = e.before.category;
    const r = await client.graphql(UPDATE, { p });
    const ue = r.data.productUpdate.userErrors;
    if (ue.length) console.log('    FAIL ' + JSON.stringify(ue));
  }
  console.log(apply ? '\nRestored.' : '\nDry run, nothing written. Add --apply.');
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const overwrite = argv.includes('--overwrite');
  const rbArg = argv.indexOf('--rollback');
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  const copyArg = argv.indexOf('--copy');
  const sinceArg = argv.indexOf('--since');
  if (copyArg < 0) throw new Error('--copy <file.json> is required');
  const since = sinceArg >= 0 ? argv[sinceArg + 1] : null;
  if (!since) throw new Error('--since YYYY-MM-DD is required');
  const copy = JSON.parse(fs.readFileSync(argv[copyArg + 1], 'utf8'));

  process.stderr.write(`Fetching products created on or after ${since}...\n`);
  const products = await fetchAll(client, `created_at:>=${since}`);
  console.log(`${products.length} products in window.\n`);

  const plans = []; const skipped = {}; const noCopy = new Set();
  for (const p of products) {
    const key = modelKeyOf(p);
    const html = copy[key] && copy[key].html;
    const hasDesc = !!String(p.descriptionHtml || '').trim();
    const hasCat = !!(p.category && p.category.id);

    const wantDesc = html && (overwrite || !hasDesc);
    const wantCat = !hasCat || overwrite;
    if (!html) { noCopy.add(key); }
    if (!wantDesc && !wantCat) { skipped['already has description and category'] = (skipped['already has description and category'] || 0) + 1; continue; }

    plans.push({
      id: p.id, handle: p.handle, title: p.title, status: p.status, key,
      setDesc: !!wantDesc, setCat: !!wantCat,
      html: wantDesc ? html : null,
      before: { description: p.descriptionHtml || '', category: (p.category && p.category.id) || null },
    });
  }

  const dn = plans.filter((p) => p.setDesc).length, cn = plans.filter((p) => p.setCat).length;
  console.log(`PLAN${apply ? '' : ' (DRY RUN, nothing is written)'}`);
  console.log(`  products to touch     : ${plans.length}`);
  console.log(`  descriptions to write : ${dn}`);
  console.log(`  categories to set     : ${cn}   -> Apparel & Accessories > Shoes > Athletic Shoes`);
  const byModel = {};
  plans.forEach((p) => { if (p.setDesc) byModel[p.key] = (byModel[p.key] || 0) + 1; });
  console.log('\n  descriptions by model:');
  Object.entries(byModel).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`    ${String(n).padStart(3)}  ${k}`));
  if (noCopy.size) {
    console.log(`\n  MODELS WITH NO COPY (description skipped, category still set): ${noCopy.size}`);
    [...noCopy].sort().forEach((k) => console.log('    ' + k));
  }
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped)) console.log(`  ${n}  ${why}`);
  }

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `product-content-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans.map((p) => ({ id: p.id, handle: p.handle, before: p.before })), null, 2));
  console.log(`\nRollback file: ${rbFile}\n`);

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      const input = { id: p.id };
      if (p.setDesc) input.descriptionHtml = p.html;
      if (p.setCat) input.category = CATEGORY_GID;
      const r = await client.graphql(UPDATE, { p: input });
      const ue = r.data.productUpdate.userErrors;
      if (ue.length) throw new Error(JSON.stringify(ue));
      done++;
      if (done % 25 === 0) console.log(`  ...${done}/${plans.length}`);
      await throttle(client, r);
    } catch (err) { failed++; console.log(`  FAIL ${p.handle}: ${err.message}`); }
  }
  console.log(`\nUpdated ${done}, failed ${failed}.`);
  console.log(`Undo with: node tools/apply-product-content.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
