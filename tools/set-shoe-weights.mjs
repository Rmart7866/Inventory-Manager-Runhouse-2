// set-shoe-weights.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Sets the shipping weight of every footwear variant to 2 pounds. The store's
// shoe weights are inconsistent (measured: 0, 0.1, 1, 1.5 lb across products),
// which makes calculated shipping rates wrong. Shoes are close enough in weight
// that one flat value is the sane fix, and 2 lb is the chosen value.
//
// SCOPE: every product whose productType ends in "Shoes" (Men's / Women's /
// Unisex / Running / Kids' Shoes), any vendor, any location. Weight is a product
// attribute, not location inventory, so this is not Needham-scoped. Non-footwear
// is never touched.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. Only variants whose weight is not already exactly 2.0 lb are updated, so a
//      re-run is a no-op and the plan shows the true remaining count.
//   3. Nothing but weight changes. SKU, barcode, price, inventory are untouched.
//   4. Rollback file (the previous value + unit of every changed variant) is
//      written before the first mutation. --rollback restores them exactly.
//
// Run:  node tools/set-shoe-weights.mjs                 # dry run
//       node tools/set-shoe-weights.mjs --apply
//       node tools/set-shoe-weights.mjs --rollback <file> --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGET_VALUE = 2.0;
const TARGET_UNIT = 'POUNDS';

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
query($cursor: String) {
  products(first: 40, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title productType
      variants(first: 100) { nodes { id inventoryItem { measurement { weight { value unit } } } } }
    }
  }
}`;

const UPDATE = `
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id }
    userErrors { field message }
  }
}`;

const isFootwear = (t) => /shoes$/i.test(t || '');
const weightOf = (v) => v.inventoryItem?.measurement?.weight || null;
const atTarget = (w) => w && Number(w.value) === TARGET_VALUE && w.unit === TARGET_UNIT;
const setWeight = (id, value, unit) => ({ id, inventoryItem: { measurement: { weight: { value, unit } } } });

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

async function fetchAll(client) {
  const out = []; let cursor = null; let pages = 0;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor });
    for (const n of body.data.products.nodes) if (isFootwear(n.productType)) out.push(n);
    await throttle(client, body);
    if (++pages % 20 === 0) process.stderr.write(`  ...${pages} pages, ${out.length} footwear so far\n`);
    if (!body.data.products.pageInfo.hasNextPage) break;
    cursor = body.data.products.pageInfo.endCursor;
  }
  return out;
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = entries.reduce((t, e) => t + e.changes.length, 0);
  console.log(`Restoring ${n} variant weights across ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  let done = 0;
  for (const e of entries) {
    if (!apply) continue;
    const variants = e.changes.map((c) => setWeight(c.id, c.fromValue, c.fromUnit || TARGET_UNIT));
    const r = await client.graphql(UPDATE, { productId: e.id, variants });
    const ue = r.data.productVariantsBulkUpdate.userErrors;
    if (ue.length) console.log(`  FAIL ${e.title}: ${JSON.stringify(ue)}`);
    else if (++done % 50 === 0) console.log(`  ...restored ${done}/${entries.length}`);
    await throttle(client, r);
  }
  console.log(apply ? '\nRolled back.' : '\nDry run, nothing written. Add --apply.');
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const rbArg = argv.indexOf('--rollback');
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  process.stderr.write('Fetching all footwear...\n');
  const products = await fetchAll(client);

  const plans = [];
  const fromDist = {};
  let already = 0, noVariants = 0;
  for (const p of products) {
    const changes = [];
    for (const v of p.variants?.nodes || []) {
      const w = weightOf(v);
      if (atTarget(w)) { already++; continue; }
      const label = w ? `${w.value} ${w.unit}` : '(none)';
      fromDist[label] = (fromDist[label] || 0) + 1;
      changes.push({ id: v.id, fromValue: w ? Number(w.value) : null, fromUnit: w ? w.unit : null });
    }
    if (!changes.length) { noVariants++; continue; }
    plans.push({ id: p.id, title: p.title, productType: p.productType, changes });
  }

  const totVars = plans.reduce((t, p) => t + p.changes.length, 0);
  console.log(`\nPLAN: set ${totVars} variant(s) across ${plans.length} product(s) to ${TARGET_VALUE} ${TARGET_UNIT}${apply ? '' : '   (DRY RUN, nothing is written)'}`);
  console.log(`Footwear scanned: ${products.length} products. Variants already at ${TARGET_VALUE} lb: ${already}. Products already all-correct: ${noVariants}.`);
  console.log('\nCurrent weights being replaced:');
  for (const [w, n] of Object.entries(fromDist).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${w}`);
  console.log('\nSample products to change:');
  for (const p of plans.slice(0, 8)) console.log(`  ${p.title.slice(0, 60).padEnd(62)} [${p.productType}]  ${p.changes.length} variants`);

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do, all footwear already at target.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `shoe-weight-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans, null, 2));
  console.log(`\nRollback file: ${rbFile}\n`);

  let done = 0, failed = 0, n = 0;
  for (const p of plans) {
    try {
      const variants = p.changes.map((c) => setWeight(c.id, TARGET_VALUE, TARGET_UNIT));
      const r = await client.graphql(UPDATE, { productId: p.id, variants });
      const ue = r.data.productVariantsBulkUpdate.userErrors;
      if (ue.length) throw new Error(JSON.stringify(ue));
      done++; n += p.changes.length;
      if (done % 50 === 0) console.log(`  ...${done}/${plans.length} products (${n} variants)`);
      await throttle(client, r);
    } catch (err) { failed++; console.log(`  FAIL ${p.title}: ${err.message}`); }
  }
  console.log(`\nSet ${n} variant weights on ${done} products, failed ${failed}.`);
  console.log(`Undo with: node tools/set-shoe-weights.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
