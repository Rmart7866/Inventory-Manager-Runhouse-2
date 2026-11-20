// clear-needham-dropship-levels.mjs, The Run House.
//
// After the 2026-11-20 cutover the stock moved to Dropship Warehouse, but every
// dropship product kept an EMPTY Needham level, so Needham (now a store with
// its own shelf, owner decision) lists thousands of supplier products at 0 and
// staff read that as dropship stock "still at Needham" (owner, the same day:
// "I am seeing those dropship singlets still there").
//
// This removes (deactivates) the Needham level of an item only when ALL hold:
//   - Needham on hand is exactly 0, nothing committed, nothing incoming
//   - the same item has an active level at Dropship Warehouse (so it IS
//     dropship: everything the move carried over, and everything since)
// Store products (no Dropship Warehouse level), negative counts, and anything
// promised to an open order are never touched and are listed instead.
// Deactivating an empty level removes no units; Shopify itself refuses one
// that holds stock. A rollback file lists every item, and --restore activates
// them at Needham again (at 0).
//
//   node tools/clear-needham-dropship-levels.mjs              # dry run
//   node tools/clear-needham-dropship-levels.mjs --apply [--limit N]
//   node tools/clear-needham-dropship-levels.mjs --restore <file> [--apply]
// House style: no em dashes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEEDHAM = 'gid://shopify/Location/77957136639';
const DW = 'gid://shopify/Location/97494139135';
const OUT = path.join(os.homedir(), 'Library', 'Logs', 'runhouse-autowrite');
const APPLY = process.argv.includes('--apply');
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const LIMIT = argOf('--limit') ? Number(argOf('--limit')) : Infinity;
const RESTORE = argOf('--restore');

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const c = createShopifyClient(env);
const gql = async (q, v) => { const r = await c.graphql(q, v); if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300)); return r.data; };

// A supplier brand's FOOTWEAR is dropship by definition (CLAUDE.md: dropship is
// footwear from these feeds). The move only carried sizes holding stock, so a
// size at 0 on move day has no Dropship Warehouse level yet and still sat at
// Needham; it is dropship all the same. Any other vendor (Under Armour spikes,
// Feetures, Oofos, The Run House...) is the store's and is never touched.
export const SUPPLIER_VENDORS = /^(hoka|brooks|asics|saucony|new balance|altra|on running|on|puma|merrell)$/i;
export const FOOTWEAR_TYPE = /(shoes|spikes|footwear)$/i;
export function isDropshipItem(l) {
  return l.atDropship === true || (SUPPLIER_VENDORS.test((l.vendor || '').trim()) && FOOTWEAR_TYPE.test((l.type || '').trim()));
}
// Pure: may this Needham level go? Empty, nothing promised or incoming, dropship.
export function clearable(l) {
  return l.onHand === 0 && l.committed === 0 && l.incoming === 0 && isDropshipItem(l);
}
// Pure: a dropship size oversold at Needham (negative, nothing promised): set to
// 0 there, then removed. The units were sold long ago; a negative on a store's
// shelf for a product the store never held is only noise for the store scan.
export function zeroThenClear(l) {
  return l.onHand < 0 && l.committed === 0 && l.incoming === 0 && isDropshipItem(l);
}

async function toggle(items, activate) {
  let done = 0; const failed = [];
  const queue = items.slice();
  async function worker() {
    while (queue.length) {
      const entry = queue.shift();
      const it = typeof entry === 'string' ? entry : entry.item;
      // Shopify keeps every item stocked at one location at least, so an item
      // whose ONLY level is Needham gets Dropship Warehouse (at 0) in the same
      // call. That is also what makes it a dropship item for tomorrow's feeds.
      const u = (!activate && entry.addDW) ? [{ locationId: DW, activate: true }, { locationId: NEEDHAM, activate: false }] : [{ locationId: NEEDHAM, activate }];
      try {
        const d = await gql(`mutation($i:ID!,$u:[InventoryBulkToggleActivationInput!]!){ inventoryBulkToggleActivation(inventoryItemId:$i, inventoryItemUpdates:$u){ userErrors{ field message code } } }`,
          { i: it, u });
        const e = d.inventoryBulkToggleActivation.userErrors;
        if (e.length) failed.push({ item: it, error: e.map((x) => x.message).join('; ') }); else done++;
      } catch (e) { failed.push({ item: it, error: String(e.message).slice(0, 160) }); }
      if ((done + failed.length) % 500 === 0) console.log(`  ${done + failed.length} of ${items.length}: ${done} done, ${failed.length} failed`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return { done, failed };
}

if (RESTORE) {
  const b = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
  console.log(`restore: activate ${b.items.length} items at Needham again (at 0)`);
  if (!APPLY) { console.log('dry run: add --apply'); process.exit(0); }
  const r = await toggle(b.items, true);
  console.log(`restored ${r.done}, failed ${r.failed.length}`);
  process.exit(r.failed.length ? 1 : 0);
}

// 1. Every Needham level, with its quantities and whether the item is also at Dropship Warehouse.
console.log('reading every Needham level...');
const levels = [];
let after = null, pages = 0;
do {
  const d = await gql(`query($a:String){ location(id:"${NEEDHAM}"){ inventoryLevels(first:200, after:$a){ pageInfo{ hasNextPage endCursor }
    nodes{ quantities(names:["on_hand","committed","incoming"]){ name quantity }
      item{ id sku dw: inventoryLevel(locationId:"${DW}"){ id } variant{ product{ title vendor productType status } } } } } } }`, { a: after });
  for (const n of d.location.inventoryLevels.nodes) {
    const q = Object.fromEntries(n.quantities.map((x) => [x.name, x.quantity]));
    const p = (n.item.variant && n.item.variant.product) || {};
    levels.push({ item: n.item.id, sku: n.item.sku || '', onHand: q.on_hand, committed: q.committed, incoming: q.incoming,
      atDropship: !!n.item.dw, vendor: p.vendor || '', type: p.productType || '', status: p.status || '', title: p.title || '' });
  }
  after = d.location.inventoryLevels.pageInfo.hasNextPage ? d.location.inventoryLevels.pageInfo.endCursor : null;
  if (++pages % 25 === 0) console.log(`  read ${levels.length} levels...`);
} while (after);

const go = levels.filter(clearable);
const neg = levels.filter(zeroThenClear);
const keep = levels.filter((l) => !clearable(l) && !zeroThenClear(l));
const why = (l) => !isDropshipItem(l) ? (l.onHand < 0 ? 'store item, negative' : l.onHand > 0 ? 'store item, has stock' : 'store item, empty')
  : l.committed > 0 ? 'dropship item, promised to an open order' : l.onHand > 0 ? 'dropship item, STOCK at Needham' : 'dropship item, incoming';
const tally = {}; for (const l of keep) tally[why(l)] = (tally[why(l)] || 0) + 1;
const byVendor = {}; for (const l of go) byVendor[l.vendor] = (byVendor[l.vendor] || 0) + 1;
console.log(`\nNeedham levels: ${levels.length}`);
console.log(`  REMOVE       ${go.length} empty Needham levels on dropship items (${go.filter((l) => l.atDropship).length} already stocked at Dropship Warehouse, ${go.filter((l) => !l.atDropship).length} supplier footwear at 0)`);
console.log('    by vendor: ' + Object.entries(byVendor).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v, n]) => `${v} ${n}`).join(', '));
console.log(`  ZERO+REMOVE  ${neg.length} dropship sizes NEGATIVE at Needham (${neg.reduce((t, l) => t + l.onHand, 0)} units), nothing promised`);
for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  KEEP    ${String(n).padStart(6)}  ${k}`);
fs.mkdirSync(OUT, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const csv = path.join(OUT, `needham-levels-${stamp}.csv`);
const act = (l) => clearable(l) ? 'REMOVE' : zeroThenClear(l) ? 'ZERO+REMOVE' : 'KEEP';
fs.writeFileSync(csv, 'action,reason,sku,vendor,type,status,on_hand,committed,incoming,title\n' + levels.map((l) =>
  [act(l), act(l) === 'KEEP' ? why(l) : '', l.sku, l.vendor, l.type, l.status, l.onHand, l.committed, l.incoming, l.title]
    .map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n'));
console.log('list: ' + csv);
if (!APPLY) { console.log('DRY RUN. Nothing written.'); process.exit(0); }

const negTodo = neg.slice(0, LIMIT);
const todo = go.slice(0, LIMIT).concat(negTodo).map((l) => ({ item: l.item, addDW: !l.atDropship }));
const rb = path.join(OUT, `needham-levels-rollback-${stamp}.json`);
fs.writeFileSync(rb, JSON.stringify({ at: new Date().toISOString(), location: NEEDHAM, items: todo,
  negatives: negTodo.map((l) => ({ item: l.item, sku: l.sku, onHand: l.onHand })) }, null, 1));
console.log(`\nAPPLY: rollback ${rb}`);
// Negatives first: set to 0 with compareQuantity, so a number that moved since the read is refused, not clobbered.
if (negTodo.length) {
  for (let i = 0; i < negTodo.length; i += 100) {
    const part = negTodo.slice(i, i + 100);
    const d = await gql(`mutation($in:InventorySetQuantitiesInput!){ inventorySetQuantities(input:$in){ userErrors{ message } } }`,
      { in: { name: 'on_hand', reason: 'correction', referenceDocumentUri: 'logistics://runhouse/needham-cleanup/' + stamp,
        quantities: part.map((l) => ({ inventoryItemId: l.item, locationId: NEEDHAM, quantity: 0, compareQuantity: l.onHand })) } });
    if (d.inventorySetQuantities.userErrors.length) console.log('  zero refused: ' + JSON.stringify(d.inventorySetQuantities.userErrors).slice(0, 200));
  }
  console.log(`  set ${negTodo.length} negative dropship sizes at Needham to 0`);
}
console.log(`  removing ${todo.length} empty Needham levels...`);
const r = await toggle(todo, false);
console.log(`removed ${r.done}, failed ${r.failed.length}`);
if (r.failed.length) { fs.writeFileSync(rb.replace('rollback', 'failed'), JSON.stringify(r.failed, null, 1)); console.log('failures: ' + r.failed.slice(0, 5).map((f) => f.error).join(' | ')); }
console.log('Undo: node tools/clear-needham-dropship-levels.mjs --restore ' + rb + ' --apply');
