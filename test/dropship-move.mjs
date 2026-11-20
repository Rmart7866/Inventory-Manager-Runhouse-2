// The Needham to Dropship Warehouse move (tools/move-dropship-location.mjs),
// against a SIMULATED store, never the real one. Pins: it refuses to start
// unless the nightly writes are paused and the location is ready; committed
// units stay at Needham; a sale between read and write is skipped, not
// clobbered; a refused activation is put straight back; a rerun moves
// nothing twice; and --restore puts every unit back.
// Run: node test/dropship-move.mjs
// House style: no em dashes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyMove, restoreMove, preflight, readJournal, stuckOf, levelsAt } from '../tools/move-dropship-location.mjs';

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const N = 'gid://shopify/Location/77957136639', DW = 'gid://shopify/Location/97494139135';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dsmove-'));

// A tiny fake Shopify: levels[loc][item] = { onHand, committed }.
function fakeShop({ levels, inProfile = true, refuseActivate = new Set(), saleOnSet = null }) {
  return {
    writes: 0,
    async graphql(q, v = {}) {
      if (q.includes('deliveryProfiles')) return { data: { deliveryProfiles: { nodes: [{ name: 'General', profileLocationGroups: [{ locationGroup: { locations: { nodes: inProfile ? [{ id: DW }] : [{ id: N }] } } }] }] } } };
      if (q.includes('l: location(')) return { data: { l: { name: 'Dropship Warehouse', isActive: true, fulfillsOnlineOrders: true } } };
      if (q.includes('nodes(ids:')) return { data: { nodes: v.ids.map((id) => { const l = levels[v.loc][id]; return { id, inventoryLevel: l ? { quantities: [{ name: 'on_hand', quantity: l.onHand }, { name: 'committed', quantity: l.committed }] } : null }; }) } };
      if (q.includes('inventorySetQuantities')) {
        this.writes++;
        if (saleOnSet && saleOnSet.n-- === 0) levels[N][saleOnSet.item].onHand -= 1;   // a sale lands between read and write
        const qs = v.input.quantities;
        const bad = qs.find((x) => !levels[x.locationId][x.inventoryItemId] || levels[x.locationId][x.inventoryItemId].onHand !== x.compareQuantity);
        if (bad) return { data: { inventorySetQuantities: { userErrors: [{ message: 'The compareQuantity value does not match' }] } } };
        qs.forEach((x) => { levels[x.locationId][x.inventoryItemId].onHand = x.quantity; });
        return { data: { inventorySetQuantities: { userErrors: [] } } };
      }
      if (q.includes('inventoryActivate')) {
        this.writes++;
        if (refuseActivate.has(v.i)) return { data: { inventoryActivate: { userErrors: [{ message: 'refused' }] } } };
        levels[v.l][v.i] = { onHand: v.q, committed: 0 };
        return { data: { inventoryActivate: { userErrors: [] } } };
      }
      throw new Error('unexpected query ' + q.slice(0, 60));
    },
  };
}
const quiet = () => {};

console.log('\nIt refuses to start until it is safe');
{
  const shop = fakeShop({ levels: { [N]: {}, [DW]: {} }, inProfile: false });
  const p = await preflight(shop, { offSwitch: path.join(TMP, 'no-switch'), journalDir: TMP });
  ok(p.some((x) => /not paused/.test(x)), 'nightly writes not paused: refused');
  ok(p.some((x) => /no shipping profile/.test(x)), 'Dropship Warehouse in no shipping profile: refused');
  fs.writeFileSync(path.join(TMP, 'switch'), '');
  const p2 = await preflight(fakeShop({ levels: { [N]: {}, [DW]: {} } }), { offSwitch: path.join(TMP, 'switch'), journalDir: TMP });
  ok(p2.length === 0, 'paused and in a profile: it may start', p2);
  // One way, once: after the cutover Needham's levels are the store's own shelf.
  const toml = path.join(TMP, 'wrangler.toml');
  fs.writeFileSync(toml, 'DROPSHIP_LOCATION_ID = "' + DW + '"\n');
  const p3 = await preflight(fakeShop({ levels: { [N]: {}, [DW]: {} } }), { offSwitch: path.join(TMP, 'switch'), journalDir: TMP, tomlPath: toml });
  ok(p3.some((x) => /cutover is already done/.test(x)), 'setting already on Dropship Warehouse: a second move is refused', p3);
  fs.writeFileSync(toml, 'DROPSHIP_LOCATION_ID = "' + N + '"\n');
  const p4 = await preflight(fakeShop({ levels: { [N]: {}, [DW]: {} } }), { offSwitch: path.join(TMP, 'switch'), journalDir: TMP, tomlPath: toml });
  ok(p4.length === 0, 'setting still on Needham: it may start', p4);
}

console.log('\nA move');
const levels = { [N]: {
  a: { onHand: 300, committed: 0 },     // plain dropship stock
  b: { onHand: 40, committed: 2 },      // two promised to open orders
  c: { onHand: 12, committed: 0 },      // a sale will land on this one mid write
  d: { onHand: 9, committed: 0 },       // Dropship Warehouse refuses to stock it
  e: { onHand: 5, committed: 0 },       // already stocked at Dropship Warehouse
}, [DW]: { e: { onHand: 1, committed: 0 } } };
const shop = fakeShop({ levels, refuseActivate: new Set(['d']), saleOnSet: { n: 0, item: 'c' } });
const journal = path.join(TMP, 'dropship-move-journal-test.jsonl');
const r = await applyMove(shop, ['a', 'b', 'c', 'd', 'e'], { journal, uri: 'gid://test/1', log: quiet });
ok(levels[N].a.onHand === 0 && levels[DW].a.onHand === 300, 'all 300 moved');
ok(levels[N].b.onHand === 2 && levels[DW].b.onHand === 38, 'committed units stay at Needham for their open orders, the rest moved', [levels[N].b, levels[DW].b]);
ok(levels[N].c.onHand === 11 && !levels[DW].c, 'a sale between read and write: skipped, Needham keeps the real 11, nothing clobbered', levels[N].c);
ok(levels[N].d.onHand === 9 && !levels[DW].d, 'refused at Dropship Warehouse: the 9 are put straight back at Needham', levels[N].d);
ok(levels[N].e.onHand === 0 && levels[DW].e.onHand === 6, 'already stocked there: added on top with a guarded set');
ok(r.moved === 3 && r.units === 343 && r.reverted === 1, 'summary counts', r);
ok(stuckOf(readJournal(journal)).length === 0, 'nothing left lowered without a home');

console.log('\nA rerun moves nothing twice');
const w = shop.writes;
const r2 = await applyMove(shop, ['a', 'b', 'e'], { journal, uri: 'gid://test/2', log: quiet });
ok(r2.moved === 0 && shop.writes === w, 'no writes at all on a rerun', r2);
ok(levels[DW].a.onHand === 300 && levels[DW].b.onHand === 38, 'Dropship Warehouse still holds exactly one copy');

console.log('\nRestore puts it all back');
levels[DW].a.onHand -= 4;   // four pairs sold at Dropship Warehouse after the move
const back = await restoreMove(shop, readJournal(journal), { journal, uri: 'gid://test/3', log: quiet });
ok(levels[N].a.onHand === 296 && levels[DW].a.onHand === 0, 'sold pairs are not returned twice: 296 back, not 300', [levels[N].a, levels[DW].a]);
ok(levels[N].b.onHand === 40 && levels[DW].b.onHand === 0, 'b whole again at Needham, committed included');
ok(levels[N].e.onHand === 5 && levels[DW].e.onHand === 1, 'e back to exactly where it started on both sides', [levels[N].e, levels[DW].e]);
ok(levels[N].d.onHand === 9 && levels[N].c.onHand === 11, 'the reverted and skipped sizes are untouched');
const again = await restoreMove(shop, readJournal(journal), { journal, uri: 'gid://test/4', log: quiet });
ok(again.restored === 0 && levels[N].a.onHand === 296, 'a second restore does nothing', again);
ok(back.failed.length === 0, 'no restore failures');

console.log('\nlevelsAt reads both quantities');
const m = await levelsAt(shop, N, ['b', 'zz']);
ok(m.get('b').committed === 2 && !m.has('zz'), 'committed read, unknown items absent');

fs.rmSync(TMP, { recursive: true, force: true });
console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
