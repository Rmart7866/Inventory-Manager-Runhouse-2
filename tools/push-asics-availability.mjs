// push-asics-availability.mjs, The Run House.
//
// Writes ASICS B2B availability onto the LA 2027 print-on-demand singlet
// listings, at the WAREHOUSE and nowhere else.
//
// WHAT THE NUMBER MEANS. These listings sell to order: the blank is bought from
// ASICS and printed, so the figure a shopper sees should be what ASICS can
// ship, not what is on a shelf. They are very different, TF3085 Black Medium is
// 205 at ASICS and was 4 at the Warehouse.
//
// WHY NOT THE SCRAPER'S CSV. The ASICS scraper emits a Shopify inventory CSV
// keyed on the handle and option values IT generates, and these listings match
// none of them: different handles, the colour spelled "Black" where the base
// garment says "Black-090", and a third option the scraper leaves blank. The
// scraper's per-line Warehouse location handles the BASE listings; this handles
// the LA ones.
//
// ONE GARMENT, EIGHT VARIANTS. The Charities listings carry a third option,
// "Event Logo(s)", with 7 values that do not change the garment or the price,
// so one size and colour is 7 variants there plus 1 in Run Clubs. Every one of
// them gets the same ASICS figure. That is 8x the real availability in
// aggregate, which is survivable only because ASICS stock is deep and because
// inventoryPolicy is now DENY on all 576 variants, so each one stops at its own
// number instead of running to -61 as one did.
//
// SIZES AND COLOURS ARE SPELLED DIFFERENTLY ON EVERY SIDE, which is most of the
// work here. ASICS says S/M/L/XL/2XL, Shopify says Small/Medium/Large/Xlarge/
// 2Xlarge. ASICS uses numeric colour codes, Shopify uses names. ASICS carries
// sizes these listings do not sell (4XS through XS on the men's), and those are
// simply not written.
//
//   node tools/push-asics-availability.mjs
//   node tools/push-asics-availability.mjs --apply
//   node tools/push-asics-availability.mjs --file asics-availability.json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const FILE = arg('file', 'asics-availability.json');
const LOCATION_NAME = 'Warehouse';

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

// Read off the B2B page 2026-10-23. These same codes are already embedded in
// the base garment listings as "Black-090", "Navy-050" and so on.
const COLOUR = { '90': 'Black', '50': 'Navy', '43': 'Royal', '01': 'White', '23': 'Red', '94': 'Steel Grey' };
const SIZE = { 'XS': 'XSmall', 'S': 'Small', 'M': 'Medium', 'L': 'Large', 'XL': 'Xlarge', '2XL': '2Xlarge', '3XL': '3Xlarge' };
const TARGETS = [
  { style: 'TF3085', handle: '2027-asics-la-marathon-charities-asics-mens-rival-ii-singlet-tf3085' },
  { style: 'TF3085', handle: '2026-asics-los-angeles-marathon-run-clubs-asics-mens-rival-ii-singlet' },
  { style: 'TF2934', handle: '2026-los-angeles-marathon-womens-performance-tank' },
  { style: 'TF2934', handle: '2026-asics-los-angeles-marathon-run-clubs-asics-womens-rival-ii-singlet' },
];

const avail = JSON.parse(fs.readFileSync(path.join(ROOT, FILE), 'utf8'));
console.log('availability captured ' + (avail.capturedAt || '(unknown)') + ', basket ' + (avail.basketNo || '-'));

const locs = await gql(`query{ locations(first:30){ nodes{ id name } } }`);
const warehouse = locs.locations.nodes.find((l) => l.name === LOCATION_NAME);
if (!warehouse) { console.error('No location named ' + LOCATION_NAME); process.exit(1); }
console.log('target location: ' + warehouse.name + '  ' + warehouse.id);

const changes = [], missing = [], unmapped = new Set();
for (const t of TARGETS) {
  const stock = avail[t.style];
  if (!stock) { console.error('no availability captured for ' + t.style); continue; }
  const head = await gql(`query($h:String!){ productByHandle(handle:$h){ id title } }`, { h: t.handle });
  if (!head.productByHandle) { console.log('MISSING product ' + t.handle); continue; }
  let vars = [], c = null;
  do {
    const d = await gql(`query($id:ID!,$c:String){ product(id:$id){ variants(first:100, after:$c){
      pageInfo{hasNextPage endCursor}
      nodes{ id title selectedOptions{ name value }
        inventoryItem{ id inventoryLevels(first:12){ nodes{ location{ id name } quantities(names:["on_hand"]){ quantity } } } } } } } }`,
      { id: head.productByHandle.id, c });
    vars = vars.concat(d.product.variants.nodes);
    c = d.product.variants.pageInfo.hasNextPage ? d.product.variants.pageInfo.endCursor : null;
  } while (c);

  let hit = 0, miss = 0;
  for (const v of vars) {
    const size = (v.selectedOptions.find((o) => /^size$/i.test(o.name)) || {}).value;
    const colour = (v.selectedOptions.find((o) => /^colou?r$/i.test(o.name)) || {}).value;
    const code = Object.keys(COLOUR).find((k) => COLOUR[k].toLowerCase() === String(colour).toLowerCase());
    const asicsSize = Object.keys(SIZE).find((k) => SIZE[k].toLowerCase() === String(size).toLowerCase());
    if (!code || !asicsSize) { unmapped.add(JSON.stringify({ size, colour })); miss++; continue; }
    const qty = stock[code] && stock[code][asicsSize];
    if (qty == null) { missing.push(t.style + ' ' + colour + ' ' + size + '  not stocked by ASICS'); miss++; continue; }
    const lvl = v.inventoryItem.inventoryLevels.nodes.find((x) => x.location.name === LOCATION_NAME);
    const now = lvl ? (lvl.quantities[0] || {}).quantity ?? 0 : null;
    if (now === qty) { hit++; continue; }
    changes.push({ handle: t.handle, title: head.productByHandle.title, variantId: v.id,
      inventoryItemId: v.inventoryItem.id, label: colour + ' / ' + size, now, qty });
    hit++;
  }
  console.log('\n' + head.productByHandle.title.slice(0, 62));
  console.log('   ' + vars.length + ' variants, ' + hit + ' mapped to ASICS, ' + miss + ' not');
}

console.log('\nvariants to update: ' + changes.length);
const sample = {};
changes.forEach((c) => { if (!sample[c.label]) sample[c.label] = c; });
Object.values(sample).slice(0, 14).forEach((c) =>
  console.log('   ' + c.label.padEnd(22) + String(c.now).padStart(5) + '  ->  ' + String(c.qty).padStart(5)));
if (unmapped.size) { console.log('\nsize/colour combinations with no ASICS equivalent, left alone:'); [...unmapped].slice(0, 10).forEach((u) => console.log('   ' + u)); }
if (missing.length) { console.log('\nnot stocked by ASICS in that size (' + missing.length + '), left alone'); }

if (!changes.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'asics-availability-rollback-' + stamp + '.json');
const fd = fs.openSync(rb, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP, location: LOCATION_NAME,
  before: changes.map((c) => ({ handle: c.handle, label: c.label, inventoryItemId: c.inventoryItemId, was: c.now })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + rb);

// setQuantities with on_hand, Warehouse only. Nothing here can reach Needham.
const SET = `mutation($input: InventorySetQuantitiesInput!){
  inventorySetQuantities(input:$input){ userErrors{ field message } } }`;
let done = 0, bad = 0;
for (let i = 0; i < changes.length; i += 100) {
  const chunk = changes.slice(i, i + 100);
  const d = await gql(SET, { input: {
    name: 'on_hand', reason: 'correction', ignoreCompareQuantity: true,
    quantities: chunk.map((c) => ({ inventoryItemId: c.inventoryItemId, locationId: warehouse.id, quantity: c.qty })),
  } });
  const e = d.inventorySetQuantities.userErrors || [];
  if (e.length) { bad += chunk.length; console.log('  FAILED chunk ' + i + ' ' + JSON.stringify(e).slice(0, 220)); }
  else { done += chunk.length; console.log('  ... ' + done + ' / ' + changes.length); }
  await new Promise((s) => setTimeout(s, 350));
}
console.log(`\nwrote ${done} variants at ${LOCATION_NAME}, failed ${bad}.`);
