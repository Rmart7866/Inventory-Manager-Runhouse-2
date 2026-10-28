// move-redo-location.mjs, The Run House.
//
// Moves the Redo "free returns" line item from one location to another, so
// orders carrying it route to that store instead.
//
// WHAT THIS PRODUCT IS. `re:do` is the returns app. It drops a line item into
// the cart, product handle
// free-returns-on-shoes-only-does-not-apply-to-printed-apparel, UNLISTED, five
// variants all sharing the SKU x-redo. Inventory is NOT tracked on it and the
// quantities are a nominal million, so this is not a stock move in any real
// sense.
//
// WHY THE LOCATION STILL MATTERS. Shopify assigns an order to a location that
// STOCKS every line item. The Redo line was stocked at Walpole and nowhere
// else, so every order containing it was pulled to Walpole. Stocking it at
// Scituate instead moves that routing.
//
// ORDER OF OPERATIONS IS LOAD BEARING. The new location is activated BEFORE
// the old one is deactivated, so the item is never stocked at zero locations
// even for a moment. An item stocked nowhere cannot be fulfilled at all.
//
//   node tools/move-redo-location.mjs                      # dry run
//   node tools/move-redo-location.mjs --apply
//   node tools/move-redo-location.mjs --from Scituate --to Walpole --apply   # undo
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const FROM = arg('from', 'Walpole');
const TO = arg('to', 'Scituate');
const HANDLE = arg('handle', 'free-returns-on-shoes-only-does-not-apply-to-printed-apparel');
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
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 1200 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}

const locs = (await gql(`query{ locations(first:40){ nodes{ id name isActive fulfillsOnlineOrders } } }`)).locations.nodes;
const from = locs.find((l) => l.name === FROM);
const to = locs.find((l) => l.name === TO);
if (!from) { console.error('No location named ' + FROM); process.exit(1); }
if (!to) { console.error('No location named ' + TO); process.exit(1); }
console.log('from: ' + from.name + '  active=' + from.isActive + '  fulfillsOnlineOrders=' + from.fulfillsOnlineOrders);
console.log('to  : ' + to.name + '  active=' + to.isActive + '  fulfillsOnlineOrders=' + to.fulfillsOnlineOrders);
if (!to.isActive || !to.fulfillsOnlineOrders) {
  console.error('\nREFUSING: ' + to.name + ' is not an active location that fulfills online orders, ' +
    'so moving the Redo line there would make orders carrying it unfulfillable.');
  process.exit(1);
}

const d = await gql(`query($h:String!){ productByHandle(handle:$h){ id title status
  variants(first:50){ nodes{ id title sku inventoryItem{ id tracked
    inventoryLevels(first:20){ nodes{ id location{ id name } quantities(names:["on_hand"]){ quantity } } } } } } } }`, { h: HANDLE });
const p = d.productByHandle;
if (!p) { console.error('No product with handle ' + HANDLE); process.exit(1); }
console.log('\n' + p.title.slice(0, 70) + '   [' + p.status + ']');

const plan = [];
for (const v of p.variants.nodes) {
  const lv = v.inventoryItem.inventoryLevels.nodes;
  const atFrom = lv.find((x) => x.location.name === FROM);
  const atTo = lv.find((x) => x.location.name === TO);
  plan.push({ variant: v.title, sku: v.sku, inventoryItemId: v.inventoryItem.id, tracked: v.inventoryItem.tracked,
    fromLevelId: atFrom ? atFrom.id : null, fromQty: atFrom ? atFrom.quantities[0].quantity : null,
    alreadyAtTo: !!atTo, others: lv.filter((x) => x.location.name !== FROM && x.location.name !== TO).map((x) => x.location.name) });
  console.log('   ' + v.title.padEnd(10) + ' tracked=' + v.inventoryItem.tracked +
    '   ' + FROM + (atFrom ? '=' + atFrom.quantities[0].quantity : ': absent') +
    '   ' + TO + (atTo ? '=' + atTo.quantities[0].quantity : ': absent') +
    (plan[plan.length-1].others.length ? '   also at ' + plan[plan.length-1].others.join(',') : ''));
}

const toActivate = plan.filter((x) => !x.alreadyAtTo);
const toDeactivate = plan.filter((x) => x.fromLevelId);
console.log('\nwould activate at ' + TO + ': ' + toActivate.length);
console.log('would deactivate at ' + FROM + ': ' + toDeactivate.length);
if (!toActivate.length && !toDeactivate.length) { console.log('Nothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'redo-location-rollback-' + stamp + '.json');
fs.writeFileSync(rb, JSON.stringify({ at: new Date().toISOString(), handle: HANDLE, from: FROM, to: TO, before: plan }, null, 2));
console.log('\nRollback written: ' + rb);

// ACTIVATE FIRST. An item stocked at no location cannot be fulfilled at all.
const ACT = `mutation($inventoryItemId:ID!,$locationId:ID!,$onHand:Int){
  inventoryActivate(inventoryItemId:$inventoryItemId, locationId:$locationId, available:$onHand){
    userErrors{ field message } } }`;
let on = 0;
for (const x of toActivate) {
  const d2 = await gql(ACT, { inventoryItemId: x.inventoryItemId, locationId: to.id, onHand: x.fromQty != null ? x.fromQty : 1000000 });
  const e = d2.inventoryActivate.userErrors || [];
  if (e.length) console.log('  activate FAILED ' + x.variant + ' ' + JSON.stringify(e).slice(0, 180));
  else on++;
}
console.log('activated at ' + TO + ': ' + on + ' / ' + toActivate.length);
if (on !== toActivate.length) {
  console.error('\nSTOPPING before deactivating ' + FROM + ', because not every variant reached ' + TO +
    '. Leaving both in place is safe; leaving neither is not.');
  process.exit(1);
}

const DEACT = `mutation($id:ID!){ inventoryDeactivate(inventoryLevelId:$id){ userErrors{ field message } } }`;
let off = 0;
for (const x of toDeactivate) {
  try {
    const d3 = await gql(DEACT, { id: x.fromLevelId });
    const e = d3.inventoryDeactivate.userErrors || [];
    if (e.length) console.log('  deactivate FAILED ' + x.variant + ' ' + JSON.stringify(e).slice(0, 180));
    else off++;
  } catch (err) { console.log('  deactivate THREW ' + x.variant + ' ' + String(err.message).slice(0, 180)); }
}
console.log('deactivated at ' + FROM + ': ' + off + ' / ' + toDeactivate.length);
