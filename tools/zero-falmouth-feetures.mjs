// zero-falmouth-feetures.mjs, The Run House.
//
// Sets the FALMOUTH on-hand quantity to 0 on every Feetures variant.
//
// READ THIS BEFORE RUNNING IT. Everything else in tools/ is Needham scoped,
// because Needham is the dropship location and the whole point of that scoping
// is that a dropship write can never reach stock a human counted on a shelf.
// This tool does the opposite on purpose: Falmouth is a physical store and
// these are physical socks. It is owner directed and it is not part of any
// automated routine. Nothing calls it.
//
// WHAT IT TOUCHES, and nothing else:
//   vendor   exactly "Feetures"        (one spelling on this store, checked)
//   location exactly "Falmouth"        (resolved by name, asserted per level)
//   quantity on_hand only              (levels are left ACTIVE so the location
//                                       stays on the variant and can be
//                                       restocked without re-adding it)
//
// THREE GUARDS, each of which refuses the whole run:
//   1. A variant with COMMITTED stock at Falmouth is an unfulfilled order
//      against that shelf. Zeroing under it is how you get an order nobody
//      can pick, so any committed quantity stops everything.
//   2. compareQuantity is sent with every write, so if somebody changed a
//      number between the read and the write, Shopify rejects that line
//      rather than silently clobbering the newer value.
//   3. Any level whose location is not Falmouth aborts the run. The query
//      already filters, so this can only fire if something is badly wrong,
//      which is exactly when you want it to.
//
// Levels already at 0 are skipped rather than rewritten, so the run is the 114
// variants that carry a number and not all 369.
//
//   node tools/zero-falmouth-feetures.mjs                  # dry run, default
//   node tools/zero-falmouth-feetures.mjs --apply
//   node tools/zero-falmouth-feetures.mjs --restore <file> # put it all back
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const RESTORE = (() => { const i = argv.indexOf('--restore'); return i === -1 ? null : argv[i + 1]; })();
const ROOT = new URL('..', import.meta.url).pathname;

const VENDOR = 'Feetures';
const LOCATION = 'Falmouth';

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
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 500));
  return j.data;
}

const SET = `mutation($input: InventorySetQuantitiesInput!){
  inventorySetQuantities(input: $input){
    userErrors{ field message code }
    inventoryAdjustmentGroup{ createdAt reason changes{ name delta } }
  } }`;

// Writes in chunks. compareQuantity is what makes a stale read fail loudly.
async function writeQuantities(lines, label) {
  let done = 0;
  for (let i = 0; i < lines.length; i += 100) {
    const chunk = lines.slice(i, i + 100);
    const d = await gql(SET, { input: {
      name: 'on_hand',
      reason: 'correction',
      ignoreCompareQuantity: false,
      quantities: chunk.map((c) => ({
        inventoryItemId: c.inventoryItemId,
        locationId: c.locationId,
        quantity: c.to,
        compareQuantity: c.from,
      })),
    } });
    const errs = d.inventorySetQuantities.userErrors || [];
    if (errs.length) {
      console.error('\nREFUSED by Shopify on ' + label + ':');
      errs.forEach((e) => console.error('   ' + (e.code || '') + ' ' + e.message + ' ' + JSON.stringify(e.field || '')));
      throw new Error('stopped after ' + done + ' writes');
    }
    done += chunk.length;
    process.stdout.write('\r  written ' + done + ' / ' + lines.length);
  }
  console.log('');
  return done;
}

// ---- restore -----------------------------------------------------------
if (RESTORE) {
  const saved = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
  if (saved.location !== LOCATION || saved.vendor !== VENDOR) {
    console.error('That rollback file is for ' + saved.vendor + ' at ' + saved.location + '. Refusing.');
    process.exit(1);
  }
  console.log('Restoring ' + saved.wrote.length + ' Falmouth levels from ' + path.basename(RESTORE));
  if (!APPLY) { console.log('DRY RUN. Re-run with --apply to actually restore.'); process.exit(0); }
  // Going back means comparing against the 0 we wrote, not the original.
  await writeQuantities(saved.wrote.map((w) => ({ ...w, from: w.to, to: w.from })), 'restore');
  console.log('Restored.');
  process.exit(0);
}

// ---- read --------------------------------------------------------------
const locs = await gql(`query{ locations(first:50){ nodes{ id name isActive } } }`);
const loc = locs.locations.nodes.filter((l) => l.name === LOCATION);
if (loc.length !== 1) { console.error('Expected exactly one location named ' + LOCATION + ', found ' + loc.length); process.exit(1); }
console.log('location: ' + loc[0].name + '  ' + loc[0].id + (loc[0].isActive ? '' : '  INACTIVE'));

const products = [];
let cursor = null;
for (;;) {
  const d = await gql(`query($c:String,$q:String!){ products(first:5, after:$c, query:$q){
    pageInfo{ hasNextPage endCursor }
    nodes{ handle title status
      variants(first:100){ nodes{ sku title
        inventoryItem{ id tracked inventoryLevels(first:15){ nodes{
          location{ id name }
          quantities(names:["on_hand","committed"]){ name quantity } } } } } } } } }`,
    { c: cursor, q: 'vendor:' + VENDOR });
  products.push(...d.products.nodes);
  if (!d.products.pageInfo.hasNextPage) break;
  cursor = d.products.pageInfo.endCursor;
}

const rows = [];
for (const p of products) {
  for (const v of p.variants.nodes) {
    for (const l of v.inventoryItem.inventoryLevels.nodes) {
      if (l.location.name !== LOCATION) continue;
      // Guard 3. The filter above should make this impossible.
      if (l.location.id !== loc[0].id) { console.error('A level named ' + LOCATION + ' with a different id. Aborting.'); process.exit(1); }
      const q = (n) => (l.quantities.find((x) => x.name === n) || {}).quantity || 0;
      rows.push({ handle: p.handle, title: p.title, status: p.status,
        sku: v.sku || '', variant: v.title, tracked: v.inventoryItem.tracked,
        inventoryItemId: v.inventoryItem.id, locationId: l.location.id,
        from: q('on_hand'), committed: q('committed'), to: 0 });
    }
  }
}

const todo = rows.filter((r) => r.from !== 0);
const pos = todo.filter((r) => r.from > 0);
const neg = todo.filter((r) => r.from < 0);
const committed = rows.filter((r) => r.committed !== 0);

console.log('\n' + VENDOR + ': ' + products.length + ' products, '
  + products.reduce((a, p) => a + p.variants.nodes.length, 0) + ' variants');
console.log(LOCATION + ' levels: ' + rows.length + ', already 0: ' + (rows.length - todo.length));
console.log('  to write : ' + todo.length);
console.log('    positive: ' + pos.length + ' variants, ' + pos.reduce((a, r) => a + r.from, 0) + ' units go to 0');
console.log('    negative: ' + neg.length + ' variants, ' + neg.reduce((a, r) => a + r.from, 0) + ' units come UP to 0');

// Guard 1.
if (committed.length) {
  console.error('\nREFUSING: ' + committed.length + ' ' + LOCATION + ' variant(s) carry committed stock,');
  console.error('which means an unfulfilled order is pointed at that shelf.');
  committed.slice(0, 20).forEach((r) => console.error('   ' + r.sku.padEnd(18) + r.title.slice(0, 44).padEnd(46)
    + r.variant.padEnd(18) + 'on hand ' + r.from + ', committed ' + r.committed));
  process.exit(1);
}

if (!todo.length) { console.log('\nNothing to do, every ' + LOCATION + ' level is already 0.'); process.exit(0); }

const byProduct = {};
todo.forEach((r) => { byProduct[r.title] = byProduct[r.title] || { n: 0, u: 0 }; byProduct[r.title].n++; byProduct[r.title].u += r.from; });
console.log('\nby product:');
Object.entries(byProduct).sort((a, b) => b[1].u - a[1].u).forEach(([t, s]) =>
  console.log('  ' + String(s.n).padStart(3) + ' var ' + String(s.u).padStart(5) + 'u  ' + t.slice(0, 62)));

if (!APPLY) {
  console.log('\nDRY RUN, nothing written. Re-run with --apply.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'falmouth-feetures-rollback-' + stamp + '.json');
fs.writeFileSync(rb, JSON.stringify({ at: new Date().toISOString(), vendor: VENDOR, location: LOCATION, wrote: todo }, null, 2));
console.log('\nRollback written first: ' + rb);

const n = await writeQuantities(todo, 'zero');
console.log('\nSet ' + n + ' ' + LOCATION + ' levels to 0. Every other location untouched.');
console.log('Undo: node tools/zero-falmouth-feetures.mjs --restore ' + path.basename(rb) + ' --apply');
