// backfill-singlet-skus.mjs, The Run House.
//
// Puts SKUs on the base Rival II singlet listings so the ordinary ASICS link
// scrape can reach them, in the exact format the scraper already generates.
//
// WHY SKUs AND NOT THE HANDLE. A Shopify inventory CSV import matches on the
// SKU. The proof is already in the repo's own output: the scraper generates
// handles like `1013a187-250`, NO such product exists on this store, and those
// imports have worked for months. What does exist is the variant SKU
// `1013A187-250-9`. So a row joins by SKU or it joins by nothing, and the
// singlet listings carry 0 SKUs on all 52 variants, which is why a scraped
// TF3085 file has always matched nothing.
//
// THE FORMAT IS THE SCRAPER'S, NOT A NEW ONE. generateSKU in
// scrapers/asics/background.js builds `<styleId>-<colorCode>-<size>` from what
// it reads off the B2B page: a two digit colour code and ASICS' own size token.
// So Black Small on the men's singlet is TF3085-90-S. Changing either side of
// that pairing breaks the join, so if generateSKU ever changes, this must too.
//
//   colour: the Shopify option carries the code already, "Black-090" -> 90,
//           "White-001" -> 01. Take the trailing digits, drop to two.
//   size:   XSmall -> XS, Small -> S, ... 3XLarge -> 3XL.
//
// SAFE BY CONSTRUCTION. It only ever writes a SKU to a variant that has NONE.
// A variant that already carries one is reported and skipped, never
// overwritten, because a SKU is a join key and silently changing one would
// repoint whatever else reads it.
//
//   node tools/backfill-singlet-skus.mjs            # dry run
//   node tools/backfill-singlet-skus.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOT = new URL('..', import.meta.url).pathname;

const HANDLES = [
  ['TF3085', 'asics-mens-rival-ii-singlet-black-tf3085'],
  ['TF3085', 'asics-mens-rival-ii-singlet-navy-tf3085'],
  ['TF3085', 'asics-mens-rival-ii-singlet-royal-tf3085'],
  ['TF3085', 'asics-mens-rival-ii-singlet-white-tf3085'],
  ['TF2934', 'asics-womens-rival-ii-singlet-black-tf2934'],
  ['TF2934', 'asics-womens-rival-ii-singlet-navy-tf2934'],
  ['TF2934', 'asics-womens-rival-ii-singlet-royal-tf2934'],
  ['TF2934', 'asics-womens-rival-ii-singlet-white-tf2934'],
];

const SIZE = { xsmall: 'XS', small: 'S', medium: 'M', large: 'L', xlarge: 'XL',
               '2xlarge': '2XL', '3xlarge': '3XL', '4xlarge': '4XL' };
const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function colourCode(value) {
  const m = /(\d{2,3})\s*$/.exec(String(value || ''));
  if (!m) return null;
  return String(parseInt(m[1], 10)).padStart(2, '0');
}
function sizeToken(value) { return SIZE[norm(value)] || null; }

function env() {
  const txt = fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
const E = env();
const SHOP = (E.SHOP_URL || '').replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';
let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) });
  if (!r.ok) throw new Error('token exchange HTTP ' + r.status);
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function gql(q, v = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 1200 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}

const plan = [];
const skipped = [];
const unmapped = [];

for (const [style, handle] of HANDLES) {
  const d = await gql(`query($h:String!){ productByHandle(handle:$h){ id title
    variants(first:40){ nodes{ id title sku selectedOptions{ name value } } } } }`, { h: handle });
  const p = d.productByHandle;
  if (!p) { console.log('MISSING product ' + handle); continue; }
  console.log('\n######## ' + p.title.slice(0, 58));
  for (const v of p.variants.nodes) {
    const size = (v.selectedOptions.find((o) => /^size$/i.test(o.name)) || {}).value;
    const colour = (v.selectedOptions.find((o) => /^colou?r$/i.test(o.name)) || {}).value;
    const cc = colourCode(colour);
    const st = sizeToken(size);
    if (!cc || !st) { unmapped.push(handle + '  ' + colour + ' / ' + size); continue; }
    const sku = style + '-' + cc + '-' + st;
    if (v.sku) {
      if (v.sku !== sku) skipped.push(handle + '  ' + colour + ' / ' + size + '  has ' + v.sku + ', would be ' + sku);
      continue;
    }
    plan.push({ productId: p.id, variantId: v.id, sku, label: colour + ' / ' + size });
    console.log('   ' + (colour + ' / ' + size).padEnd(26) + '  ->  ' + sku);
  }
}

console.log('\nvariants to give a SKU: ' + plan.length);
if (unmapped.length) { console.log('\nNOT MAPPED, left alone:'); unmapped.forEach((u) => console.log('   ' + u)); }
if (skipped.length) { console.log('\nALREADY HAS A DIFFERENT SKU, never overwritten:'); skipped.forEach((u) => console.log('   ' + u)); }
if (!plan.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'singlet-sku-rollback-' + stamp + '.json');
fs.writeFileSync(rb, JSON.stringify(plan.map((p) => ({ variantId: p.variantId, label: p.label, was: '', now: p.sku })), null, 2));
console.log('\nRollback written: ' + rb);

const M = `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){
  productVariantsBulkUpdate(productId:$productId, variants:$variants){ userErrors{ field message } } }`;
const byProduct = new Map();
plan.forEach((p) => { if (!byProduct.has(p.productId)) byProduct.set(p.productId, []); byProduct.get(p.productId).push(p); });
let done = 0, bad = 0;
for (const [productId, items] of byProduct) {
  const d = await gql(M, { productId, variants: items.map((i) => ({ id: i.variantId, inventoryItem: { sku: i.sku } })) });
  const e = d.productVariantsBulkUpdate.userErrors || [];
  if (e.length) { bad += items.length; console.log('  FAILED ' + productId + ' ' + JSON.stringify(e).slice(0, 220)); }
  else { done += items.length; console.log('  ... ' + done + ' / ' + plan.length); }
}
console.log(`\nwrote ${done} SKUs, failed ${bad}.`);
