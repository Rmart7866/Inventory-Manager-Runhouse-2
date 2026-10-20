// apply-umap-prices.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Drops Brooks shelf prices to the lowest price Brooks CURRENTLY permits under
// their UMAP Footwear Schedule A, for the styles whose promotional window is
// open today.
//
// WHY THIS IS SAFE TO DO. UMAP is a floor on the ADVERTISED price, and these
// windows are Brooks' own authorised promotions. Being priced above the floor
// is money left on the table, being below it is the breach. So this only ever
// LOWERS a price to the floor, never below, and never raises one.
//
// COMPARE AT PRICE IS DELIBERATELY NOT TOUCHED. Owner instruction. Note that a
// struck through compare at price is itself an advertised price, so if Brooks
// ever query the display it is that, not this script, that needs revisiting.
//
// EVERY WINDOW HAS AN END, AND THE END IS A BREACH IF MISSED. Ghost 17 reverts
// to 119.95 on 2026-11-20. Three others step DOWN again on 2026-11-20 and more
// follow in December, see the schedule. This script reads the window dates and
// refuses to act on a window that is not open today, but it cannot put a price
// back for you. Re-run it on the dates below.
//
// Run:  node tools/apply-umap-prices.mjs            (dry run, prints the plan)
//       node tools/apply-umap-prices.mjs --apply    (writes, with a rollback file)
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

const APPLY = process.argv.includes('--apply');
const TODAY = new Date();

// Brooks UMAP Footwear Schedule A, the windows that matter right now. Prices
// here are ADVERTISED prices, the same numbers a shopper sees, not wholesale.
// styles are the men's and women's six digit ids Brooks lists per product.
const SCHEDULE = [
  { product: 'Glycerin Max 2',    styles: ['110479', '120468'], price: 149.95, from: '2026-10-01', to: '2026-11-19' },
  { product: 'Glycerin Flex',     styles: ['110478', '120467'], price: 129.95, from: '2026-10-01', to: '2026-11-19' },
  { product: 'Adrenaline GTS 25', styles: ['110454', '120443'], price: 124.95, from: '2026-10-01', to: '2026-11-19' },
  { product: 'Ghost 17',          styles: ['110442', '120431'], price: 109.95, from: '2026-06-01', to: '2026-11-19' },
];

function openToday(w) {
  const t = TODAY.toISOString().slice(0, 10);
  return (!w.from || t >= w.from) && (!w.to || t <= w.to);
}

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
  if ((r.status === 429 || r.status >= 500) && attempt < 5) {
    await new Promise((s) => setTimeout(s, 1000 * Math.pow(2, attempt)));
    return gql(query, variables, attempt + 1);
  }
  const b = await r.json();
  if ((b.errors || []).some((e) => e.extensions?.code === 'THROTTLED') && attempt < 8) {
    await new Promise((s) => setTimeout(s, 2000));
    return gql(query, variables, attempt + 1);
  }
  if (b.errors) throw new Error(JSON.stringify(b.errors).slice(0, 400));
  return b.data;
}

const live = SCHEDULE.filter(openToday);
const closed = SCHEDULE.filter((w) => !openToday(w));
console.log(`UMAP windows open today (${TODAY.toISOString().slice(0, 10)}): ${live.length} of ${SCHEDULE.length}`);
for (const w of closed) console.log(`  skipped, window not open: ${w.product} (${w.from} to ${w.to})`);
if (!live.length) { console.log('Nothing to do.'); process.exit(0); }

const priceByStyle = new Map();
for (const w of live) for (const s of w.styles) priceByStyle.set(s, { price: w.price, product: w.product, to: w.to });

// Pull every ACTIVE Brooks product and match on the six digit style in the SKU.
const Q = `query($c:String){ products(first:250, after:$c, query:"vendor:Brooks status:active"){
  pageInfo{ hasNextPage endCursor }
  nodes{ id title handle variants(first:100){ nodes{ id sku price compareAtPrice } } } } }`;

let cursor = null, products = [];
do {
  const d = await gql(Q, { c: cursor });
  products.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  process.stderr.write(`\r  scanning ${products.length} Brooks products`);
} while (cursor);
process.stderr.write('\n');

const plan = [];
for (const p of products) {
  const edits = [];
  for (const v of p.variants.nodes) {
    const m = /^(\d{6})/.exec(v.sku || '');
    if (!m) continue;
    const rule = priceByStyle.get(m[1]);
    if (!rule) continue;
    const cur = parseFloat(v.price);
    // ONLY EVER DOWN, and only to the floor. Anything already at or under the
    // permitted price is left exactly as it is.
    if (!(cur > rule.price + 0.001)) continue;
    edits.push({ variantId: v.id, sku: v.sku, was: v.price, now: rule.price.toFixed(2),
      compareAtPrice: v.compareAtPrice, product: rule.product });
  }
  if (edits.length) plan.push({ id: p.id, title: p.title, handle: p.handle, edits });
}

const byProduct = {};
for (const p of plan) for (const e of p.edits) {
  const k = `${e.product}  ${e.was} -> ${e.now}`;
  byProduct[k] = (byProduct[k] || 0) + 1;
}
console.log(`\nProducts to change : ${plan.length}`);
console.log(`Variant price edits: ${plan.reduce((a, p) => a + p.edits.length, 0)}\n`);
for (const [k, n] of Object.entries(byProduct).sort()) console.log(`  ${String(n).padStart(5)}  ${k}`);

if (!APPLY) {
  console.log('\nDRY RUN. Pass --apply to write.');
  console.log('compareAtPrice is not touched.');
  process.exit(0);
}

// Rollback BEFORE anything is written, and flushed to disk, so a crash midway
// still leaves a complete record of what the prices were.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rollbackPath = `umap-price-rollback-${stamp}.json`;
const fd = fs.openSync(rollbackPath, 'w');
fs.writeSync(fd, JSON.stringify({ when: stamp, note: 'price only, compareAtPrice untouched', plan }, null, 1));
fs.fsyncSync(fd);
fs.closeSync(fd);
console.log(`\nrollback written to ${rollbackPath}`);

const M = `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){
  productVariantsBulkUpdate(productId:$productId, variants:$variants){
    userErrors{ field message } } }`;

let ok = 0, failed = 0;
for (const p of plan) {
  const variants = p.edits.map((e) => ({ id: e.variantId, price: e.now }));
  try {
    const d = await gql(M, { productId: p.id, variants });
    const errs = d.productVariantsBulkUpdate.userErrors;
    if (errs && errs.length) { failed++; console.log(`  FAILED ${p.title}: ${JSON.stringify(errs).slice(0, 160)}`); }
    else { ok++; }
  } catch (e) { failed++; console.log(`  FAILED ${p.title}: ${e.message.slice(0, 160)}`); }
  process.stderr.write(`\r  ${ok + failed}/${plan.length} products`);
}
process.stderr.write('\n');
console.log(`\ndone. ${ok} products updated, ${failed} failed.`);
console.log(`REVERSION DATES, these are breaches if missed:`);
for (const w of live) console.log(`  ${w.to}  ${w.product} window closes`);
