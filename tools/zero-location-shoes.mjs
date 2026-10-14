// zero-location-shoes.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Sets on-hand to 0 for FOOTWEAR at ONE named store location, so the shelves
// can be counted back in from scratch. Built for a Falmouth stock take.
//
// READ THIS FIRST. Everything else in this repo is Needham scoped and REFUSES
// to touch a physical store, on purpose: worker/src/inventory.js will not write
// without NEEDHAM_LOCATION_ID, and every removed/zero decision is computed
// against the Needham known set precisely so Falmouth, Walpole and Scituate can
// never be altered by a supplier feed. This tool deliberately steps outside
// that, which is why it is a standalone script a human has to run by hand with
// an explicit location name, and not a route, a button, or anything the
// inventory pipeline can reach.
//
// WHAT MAKES IT SAFE:
//   1. ONE LOCATION, named on the command line, and the name is re-read live
//      from Shopify and compared before a single write. A typo'd or renamed
//      location aborts rather than guessing.
//   2. FOOTWEAR ONLY, from an explicit type allowlist printed in the dry run.
//      Nothing else at that location is touched, and no other location is
//      read or written.
//   3. A ROLLBACK FILE holding every prior quantity is written BEFORE the
//      first write, and --restore replays it exactly.
//   4. Dry run by default. --apply is required, and it prints what it is about
//      to do first.
//
// NEGATIVES ARE RAISED TO ZERO, not left alone. A stock take starts from a
// known state, and a line sitting at -3 is not one. They are counted separately
// in the summary so the number is visible rather than buried.
//
// Usage:
//   node tools/zero-location-shoes.mjs --location Falmouth
//   node tools/zero-location-shoes.mjs --location Falmouth --apply
//   node tools/zero-location-shoes.mjs --restore falmouth-zero-rollback-<stamp>.json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LOCATION_NAME = argOf('--location', '');
const RESTORE = argOf('--restore', '');
const INCLUDE_SPIKES = !argv.includes('--no-spikes');

// Explicit, not a regex, so adding a type is a deliberate act. Printed in the
// dry run so the operator sees exactly what is in scope.
const SHOE_TYPES = ["Men's Shoes", "Women's Shoes", "Unisex Shoes", "Kids' Shoes",
                    'Athletic Footwear', 'Footwear'];
const SPIKE_TYPES = ['Spikes'];

function devVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(devVars());

const LOCATIONS = `{ locations(first: 50) { nodes { id name isActive } } }`;
const LEVELS = `query($id:ID!,$cursor:String){ location(id:$id){ id name
  inventoryLevels(first:100, after:$cursor){ pageInfo{ hasNextPage endCursor }
    nodes{ quantities(names:["on_hand"]){ name quantity }
      item{ id sku variant{ title product{ title productType vendor } } } } } } }`;
const SET = `mutation($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup { createdAt reason }
    userErrors { field message code }
  }
}`;

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

async function resolveLocation(name) {
  const r = await client.graphql(LOCATIONS, {});
  const hits = r.data.locations.nodes.filter((l) => l.name.toLowerCase() === name.toLowerCase());
  if (!hits.length) {
    console.error(`No location named ${JSON.stringify(name)}. Available: ` +
      r.data.locations.nodes.map((l) => l.name).join(', '));
    process.exit(1);
  }
  if (hits.length > 1) { console.error(`More than one location named ${name}. Refusing to guess.`); process.exit(1); }
  return hits[0];
}

async function readLevels(locId) {
  let cur = null; const out = [];
  for (;;) {
    const r = await client.graphql(LEVELS, { id: locId, cursor: cur });
    const loc = r.data.location;
    const lv = loc.inventoryLevels;
    for (const n of lv.nodes) {
      const v = n.item?.variant; if (!v) continue;
      out.push({
        inventoryItemId: n.item.id, sku: n.item.sku || '', size: v.title,
        product: v.product.title, type: v.product.productType || '', vendor: v.product.vendor || '',
        onHand: (n.quantities || []).find((q) => q.name === 'on_hand')?.quantity ?? 0,
      });
    }
    process.stderr.write(`  read ${out.length} levels\r`);
    if (!lv.pageInfo.hasNextPage) break;
    cur = lv.pageInfo.endCursor;
  }
  process.stderr.write(' '.repeat(40) + '\r');
  return out;
}

async function writeZeros(locId, rows, label) {
  let done = 0, failed = 0;
  for (const batch of chunk(rows, 200)) {
    const r = await client.graphql(SET, { input: {
      name: 'on_hand',
      reason: 'correction',
      ignoreCompareQuantity: true,
      quantities: batch.map((x) => ({ inventoryItemId: x.inventoryItemId, locationId: locId, quantity: x.quantity })),
    }});
    const errs = r.data?.inventorySetQuantities?.userErrors || [];
    if (errs.length) { failed += batch.length; console.log('  FAIL batch: ' + errs.map((e) => e.message).join('; ')); }
    else done += batch.length;
    process.stderr.write(`  ${label} ${done}/${rows.length}\r`);
  }
  process.stderr.write(' '.repeat(40) + '\r');
  return { done, failed };
}

async function main() {
  if (RESTORE) {
    const file = path.resolve(RESTORE);
    const rb = JSON.parse(fs.readFileSync(file, 'utf8'));
    const loc = await resolveLocation(rb.locationName);
    if (loc.id !== rb.locationId) { console.error('That rollback file is for a different location id. Refusing.'); process.exit(1); }
    console.log(`\nRestore ${rb.rows.length} line(s) at ${loc.name} to their pre-reset quantities.`);
    if (!APPLY) { console.log('DRY RUN. Pass --apply to restore.'); return; }
    const res = await writeZeros(loc.id, rb.rows.map((x) => ({ inventoryItemId: x.inventoryItemId, quantity: x.was })), 'restoring');
    console.log(`\nRestored ${res.done}, failed ${res.failed}.`);
    return;
  }

  if (!LOCATION_NAME) { console.error('Name the location: --location Falmouth'); process.exit(1); }
  const loc = await resolveLocation(LOCATION_NAME);
  console.log(`\nLocation: ${loc.name}  (${loc.id.split('/').pop()})${loc.isActive ? '' : '  INACTIVE'}`);

  const levels = await readLevels(loc.id);
  const inScopeTypes = SHOE_TYPES.concat(INCLUDE_SPIKES ? SPIKE_TYPES : []);
  const wanted = new Set(inScopeTypes.map((t) => t.toLowerCase()));
  const targets = levels.filter((x) => wanted.has(x.type.toLowerCase()) && x.onHand !== 0);

  const byType = {};
  for (const x of targets) { const t = x.type; byType[t] = byType[t] || { lines: 0, units: 0 }; byType[t].lines++; byType[t].units += x.onHand; }
  console.log(`\nIN SCOPE (${inScopeTypes.join(', ')}):`);
  for (const [t, s] of Object.entries(byType).sort((a, b) => b[1].units - a[1].units)) {
    console.log(`   ${String(s.units).padStart(6)} units  ${String(s.lines).padStart(5)} lines   ${t}`);
  }
  const neg = targets.filter((x) => x.onHand < 0);
  console.log(`\n   ${targets.length} line(s) to set to 0, ${targets.reduce((a, b) => a + b.onHand, 0)} units total`);
  console.log(`   of those, ${neg.length} are already NEGATIVE and will be raised to 0`);

  const skipped = levels.filter((x) => !wanted.has(x.type.toLowerCase()) && x.onHand !== 0);
  console.log(`   NOT touched at this location: ${skipped.length} line(s), ${skipped.reduce((a, b) => a + b.onHand, 0)} units`);
  console.log(`   NOT touched anywhere else: every other location is neither read nor written`);

  if (!targets.length) { console.log('\nNothing to do.'); return; }
  if (!APPLY) {
    console.log('\nSample:');
    for (const x of targets.slice(0, 8)) console.log(`   ${String(x.onHand).padStart(4)}  ${x.vendor.padEnd(12)} ${x.product.slice(0, 44)}  ${x.size}`);
    console.log(`\nDRY RUN. Pass --apply to zero these ${targets.length} line(s) at ${loc.name}.`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `${loc.name.toLowerCase()}-zero-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'on_hand set to 0 at this location for the listed lines. Undo with --restore on this file.',
    locationId: loc.id, locationName: loc.name, types: inScopeTypes,
    rows: targets.map((x) => ({ inventoryItemId: x.inventoryItemId, sku: x.sku, product: x.product, size: x.size, was: x.onHand })),
  }, null, 1));
  console.log(`\nRollback written to ${path.basename(file)} BEFORE the first write. Keep it until the count is signed off.`);

  const res = await writeZeros(loc.id, targets.map((x) => ({ inventoryItemId: x.inventoryItemId, quantity: 0 })), 'zeroing');
  console.log(`\nZeroed ${res.done} line(s), failed ${res.failed}, at ${loc.name}.`);
  console.log(`Undo: node tools/zero-location-shoes.mjs --restore ${path.basename(file)} --apply`);
}

main().catch((e) => { console.error(e); process.exit(1); });
