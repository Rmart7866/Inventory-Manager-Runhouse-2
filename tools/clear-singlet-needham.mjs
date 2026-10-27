// clear-singlet-needham.mjs, The Run House.
//
// Removes Needham inventory from the Rival II singlet listings. Singlets are
// print on demand race merch held at the WAREHOUSE and nowhere else, so a
// Needham level on one is always wrong.
//
// HOW THEY GOT ONE. On 2026-10-27 a link scrape ran against an extension that
// had not been reloaded, so it was still executing the pre-fix content.js: the
// per line Warehouse location never reached the CSV and every row, singlets
// included, said Needham. The singlet rows then MATCHED, because
// backfill-singlet-skus.mjs had just given those variants SKUs, and 45 Needham
// levels were created carrying page-capped numbers.
//
// That is the exact failure CLAUDE.md warns about: a few hundred singlets in
// Needham read as real dropship footwear stock.
//
// WHAT IT DOES. Sets the Needham on-hand to 0 and then deactivates the level
// so the location is not merely emptied but gone, which is the state the other
// singlet variants are in. Warehouse is never read or written here.
//
//   node tools/clear-singlet-needham.mjs            # dry run
//   node tools/clear-singlet-needham.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOT = new URL('..', import.meta.url).pathname;
const WRONG = 'Needham';

const HANDLES = [
  'asics-mens-rival-ii-singlet-black-tf3085', 'asics-mens-rival-ii-singlet-navy-tf3085',
  'asics-mens-rival-ii-singlet-royal-tf3085', 'asics-mens-rival-ii-singlet-white-tf3085',
  'asics-womens-rival-ii-singlet-black-tf2934', 'asics-womens-rival-ii-singlet-navy-tf2934',
  'asics-womens-rival-ii-singlet-royal-tf2934', 'asics-womens-rival-ii-singlet-white-tf2934',
  // the LA mirrors, checked too. They have no SKUs so the import could not
  // have reached them, but it costs one query each to be sure.
  '2027-asics-la-marathon-charities-asics-mens-rival-ii-singlet-tf3085',
  '2026-los-angeles-marathon-womens-performance-tank',
  '2026-asics-los-angeles-marathon-run-clubs-asics-mens-rival-ii-singlet',
  '2026-asics-los-angeles-marathon-run-clubs-asics-womens-rival-ii-singlet',
];

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

const locs = await gql(`query{ locations(first:30){ nodes{ id name } } }`);
const needham = locs.locations.nodes.find((l) => l.name === WRONG);
if (!needham) { console.error('No location named ' + WRONG); process.exit(1); }
console.log('clearing: ' + needham.name + '  ' + needham.id);

const found = [];
for (const h of HANDLES) {
  const d = await gql(`query($h:String!){ productByHandle(handle:$h){ handle title
    variants(first:300){ nodes{ sku selectedOptions{ value }
      inventoryItem{ id inventoryLevels(first:12){ nodes{ id location{ id name } quantities(names:["on_hand"]){ quantity } } } } } } } }`, { h });
  const p = d.productByHandle;
  if (!p) { console.log('MISSING ' + h); continue; }
  let n = 0;
  for (const v of p.variants.nodes) {
    const lvl = v.inventoryItem.inventoryLevels.nodes.find((x) => x.location.name === WRONG);
    if (!lvl) continue;
    n++;
    found.push({ handle: h, label: v.selectedOptions.map((o) => o.value).join(' / '),
      sku: v.sku || '', inventoryItemId: v.inventoryItem.id, was: lvl.quantities[0].quantity });
  }
  console.log('  ' + h.slice(0, 54).padEnd(56) + (n ? n + ' Needham level(s)' : 'clean'));
}

const nonZero = found.filter((f) => f.was !== 0);
console.log('\nNeedham levels found: ' + found.length + ', of which non zero: ' + nonZero.length);
if (!found.length) { console.log('Nothing to do.'); process.exit(0); }
found.slice(0, 10).forEach((f) => console.log('   ' + f.sku.padEnd(16) + f.label.padEnd(24) + ' on hand ' + f.was));
if (found.length > 10) console.log('   ... and ' + (found.length - 10) + ' more');

if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to zero and deactivate them.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'singlet-needham-rollback-' + stamp + '.json');
fs.writeFileSync(rb, JSON.stringify({ at: new Date().toISOString(), location: WRONG, before: found }, null, 2));
console.log('\nRollback written: ' + rb);

// Zero first, because a level with stock on it cannot always be deactivated.
const SET = `mutation($input: InventorySetQuantitiesInput!){
  inventorySetQuantities(input:$input){ userErrors{ field message } } }`;
let zeroed = 0;
for (let i = 0; i < found.length; i += 100) {
  const chunk = found.slice(i, i + 100);
  const d = await gql(SET, { input: { name: 'on_hand', reason: 'correction', ignoreCompareQuantity: true,
    quantities: chunk.map((f) => ({ inventoryItemId: f.inventoryItemId, locationId: needham.id, quantity: 0 })) } });
  const e = d.inventorySetQuantities.userErrors || [];
  if (e.length) console.log('  zero FAILED ' + JSON.stringify(e).slice(0, 200));
  else { zeroed += chunk.length; console.log('  zeroed ' + zeroed + ' / ' + found.length); }
}

const DEACT = `mutation($inventoryItemId: ID!, $locationId: ID!){
  inventoryDeactivate(inventoryItemId:$inventoryItemId, locationId:$locationId){ userErrors{ field message } } }`;
let off = 0, failed = 0;
for (const f of found) {
  try {
    const d = await gql(DEACT, { inventoryItemId: f.inventoryItemId, locationId: needham.id });
    const e = d.inventoryDeactivate.userErrors || [];
    if (e.length) { failed++; if (failed <= 3) console.log('  deactivate kept at 0 for ' + f.sku + ': ' + JSON.stringify(e).slice(0, 140)); }
    else off++;
  } catch (err) { failed++; }
}
console.log(`\nzeroed ${zeroed}, deactivated ${off}, left at zero ${failed}.`);
