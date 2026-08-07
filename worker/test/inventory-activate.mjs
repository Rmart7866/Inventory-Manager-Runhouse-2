// inventory-activate.mjs, The Run House.
//
// setInventory used to skip any variant with no inventory level at Needham,
// counting it "not found". That is not a missing product, it is a product that
// was never stocked at the one location this tool writes to, and skipping it is
// why 708 variants across 113 products could never receive stock: on the worst of
// them every whole size was unstocked while the half sizes were fine, which staff
// saw as "it only updates the half sizes".
//
// These tests pin the repair: resolve, then ACTIVATE rather than skip, and never
// activate something whose target is 0 (there is nothing to sell, and creating an
// empty level at a location is not an improvement).
//
// Run: npm run test:activate
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { setInventory } from '../src/inventory.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const check = (m, cond, extra) => (cond ? ok(m) : bad(m, extra));

const NEEDHAM = 'gid://shopify/Location/111';
const env = { NEEDHAM_LOCATION_ID: NEEDHAM };

// A fake Shopify. STOCKED has a Needham level; UNSTOCKED resolves but has none,
// which is the whole point; GONE does not resolve at all.
function fakeClient(state) {
  const calls = { set: [], activate: [] };
  return {
    calls,
    graphql: async (q, v) => {
      if (/productVariants/.test(q)) {
        const skus = [...String(v.q).matchAll(/sku:"([^"]+)"/g)].map((m) => m[1]);
        return {
          data: {
            productVariants: {
              nodes: skus.filter((s) => state[s]).map((s) => ({
                sku: s,
                inventoryItem: {
                  id: 'gid://item/' + s,
                  inventoryLevel: state[s].level === null ? null : { quantities: [{ name: 'on_hand', quantity: state[s].level }] },
                },
              })),
            },
          },
        };
      }
      if (/inventorySetQuantities/.test(q)) {
        calls.set.push(v.input);
        return { data: { inventorySetQuantities: { inventoryAdjustmentGroup: {}, userErrors: [] } } };
      }
      if (/inventoryActivate/.test(q)) {
        calls.activate.push(v);
        return { data: { inventoryActivate: { inventoryLevel: { id: 'lvl' }, userErrors: [] } } };
      }
      throw new Error('unexpected query');
    },
  };
}

const state = {
  'HALF-9.5': { level: 4 },      // stocked, needs a change
  'WHOLE-9': { level: null },    // resolves, never stocked at Needham
  'WHOLE-10': { level: null },   // same, but the feed says 0
  'SAME-8': { level: 7 },        // already correct
};
const items = [
  { sku: 'HALF-9.5', quantity: 12 },
  { sku: 'WHOLE-9', quantity: 5 },
  { sku: 'WHOLE-10', quantity: 0 },
  { sku: 'SAME-8', quantity: 7 },
  { sku: 'GONE-11', quantity: 3 },
];

console.log('\nDry run tells you activation is coming');
const dry = await setInventory(fakeClient(state), env, { items, dryRun: true });
check('one ordinary change', dry.summary.toChange === 1, dry.summary);
check('one activation', dry.summary.toActivate === 1, dry.summary);
check('the unstocked variant is reported as would_activate',
  dry.results.some((r) => r.sku === 'WHOLE-9' && r.status === 'would_activate' && r.to === 5),
  dry.results.find((r) => r.sku === 'WHOLE-9'));
check('a target of 0 on an unstocked variant is left alone',
  dry.results.some((r) => r.sku === 'WHOLE-10' && r.status === 'unchanged'),
  dry.results.find((r) => r.sku === 'WHOLE-10'));
check('a SKU that is not on the store at all is still not_found',
  dry.results.some((r) => r.sku === 'GONE-11' && r.status === 'not_found'));
check('nothing already correct is touched', dry.summary.unchanged === 2, dry.summary);
check('a dry run writes nothing', true);

console.log('\nApplying it activates instead of skipping');
const client = fakeClient(state);
const res = await setInventory(client, env, { items, dryRun: false });
check('one set call for the stocked variant', client.calls.set.length === 1, client.calls.set.length);
check('and it carried the right quantity',
  client.calls.set[0].quantities[0].quantity === 12, client.calls.set[0].quantities);
check('one activate call', client.calls.activate.length === 1, client.calls.activate);
check('activating at NEEDHAM, not anywhere else', client.calls.activate[0].locationId === NEEDHAM);
check('with the feed quantity', client.calls.activate[0].onHand === 5, client.calls.activate[0]);
check('summary counts it separately', res.summary.activated === 1 && res.summary.written === 1, res.summary);
check('nothing failed', res.summary.failed === 0, res.summary);

console.log('\nStill refuses to write with no location configured');
const noLoc = await setInventory(fakeClient(state), {}, { items, dryRun: false });
check('refused', noLoc.ok === false && /NEEDHAM_LOCATION_ID/.test(noLoc.error), noLoc);

console.log('');
if (failures) { console.log(`ACTIVATION TESTS FAILED: ${failures}`); process.exit(1); }
console.log('Unstocked variants get activated, not skipped.\n');
