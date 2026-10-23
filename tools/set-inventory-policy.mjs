// set-inventory-policy.mjs, The Run House.
//
// Turns OFF "Continue selling when out of stock" on named products.
//
// WHY THIS MATTERS MORE THAN IT SOUNDS. inventoryPolicy CONTINUE tells Shopify
// to sell a variant no matter what the inventory says, so tying a listing's
// stock to anything is decorative while it is set. Measured 2026-10-23 on the
// four LA 2027 Rival II listings: 553 of 576 variants were CONTINUE, and the
// audit found pools already at -61. The base garment listings were correctly
// DENY the whole time, which is why only the mirrors went negative.
//
// The mix WITHIN a listing (245 CONTINUE / 7 DENY on one, 27 / 9 on another)
// looks accidental rather than chosen, which is part of why this is worth doing
// in one sweep rather than by hand.
//
// NAMED PRODUCTS ONLY. This takes explicit handles, never a search, because
// CONTINUE is a legitimate setting elsewhere: made-to-order and preorder
// listings rely on it. Switching one of those to DENY would silently stop it
// selling. TF3085 and TF2934 have 91 listings between them and only the four
// LA 2027 ones are in scope here.
//
//   node tools/set-inventory-policy.mjs --handles a,b,c
//   node tools/set-inventory-policy.mjs --handles a,b,c --apply
//   node tools/set-inventory-policy.mjs --handles a --policy CONTINUE --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const POLICY = (arg('policy', 'DENY') || 'DENY').toUpperCase();
const HANDLES = (arg('handles', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

if (!HANDLES.length) { console.error('--handles is required. This tool never guesses which products to change.'); process.exit(1); }
if (!['DENY', 'CONTINUE'].includes(POLICY)) { console.error('--policy must be DENY or CONTINUE'); process.exit(1); }

const ROOT = new URL('..', import.meta.url).pathname;
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
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 900 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const plan = [];
for (const h of HANDLES) {
  const head = await gql(`query($h:String!){ productByHandle(handle:$h){ id title status } }`, { h });
  const p = head.productByHandle;
  if (!p) { console.log('MISSING  ' + h); continue; }
  let vars = [], c = null;
  do {
    const d = await gql(`query($id:ID!,$c:String){ product(id:$id){ variants(first:100, after:$c){
      pageInfo{hasNextPage endCursor} nodes{ id title inventoryPolicy } } } }`, { id: p.id, c });
    vars = vars.concat(d.product.variants.nodes);
    c = d.product.variants.pageInfo.hasNextPage ? d.product.variants.pageInfo.endCursor : null;
  } while (c);
  const change = vars.filter((v) => v.inventoryPolicy !== POLICY);
  plan.push({ p, vars, change });
  const tally = {}; vars.forEach((v) => { tally[v.inventoryPolicy] = (tally[v.inventoryPolicy] || 0) + 1; });
  console.log('\n' + p.status + '  ' + p.title.slice(0, 64));
  console.log('   ' + h);
  console.log('   ' + vars.length + ' variants, now ' + JSON.stringify(tally) + '  ->  ' + change.length + ' to set ' + POLICY);
}
const total = plan.reduce((s, x) => s + x.change.length, 0);
console.log('\nvariants to change: ' + total + ' across ' + plan.length + ' products');
if (!total) { console.log('Nothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'inventory-policy-rollback-' + stamp + '.json');
const fd = fs.openSync(rb, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP, setTo: POLICY,
  products: plan.map(({ p, change }) => ({ id: p.id, handle: p.title,
    variants: change.map((v) => ({ id: v.id, title: v.title, was: v.inventoryPolicy })) })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + rb);

const M = `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){
  productVariantsBulkUpdate(productId:$productId, variants:$variants){ userErrors{ field message } } }`;
let done = 0, bad = 0;
for (const { p, change } of plan) {
  for (let i = 0; i < change.length; i += 100) {
    const chunk = change.slice(i, i + 100).map((v) => ({ id: v.id, inventoryPolicy: POLICY }));
    const d = await gql(M, { productId: p.id, variants: chunk });
    const e = d.productVariantsBulkUpdate.userErrors || [];
    if (e.length) { bad += chunk.length; console.log('  FAILED ' + p.title.slice(0, 40) + ' ' + JSON.stringify(e).slice(0, 200)); }
    else { done += chunk.length; console.log('  ' + p.title.slice(0, 50) + '  ' + done + ' / ' + total); }
    await new Promise((s) => setTimeout(s, 300));
  }
}
console.log(`\nset ${POLICY} on ${done} variants, failed ${bad}.`);
