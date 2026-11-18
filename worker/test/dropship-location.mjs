// The dropship location is ONE setting (src/dropship.js, 2026-11-18): unset it
// is Needham exactly as before; at the cutover it is Dropship Warehouse, the
// real Needham store is never written, and open orders still assigned to the
// old location stay visible to Late orders and tracking while they clear.
// Run: node test/dropship-location.mjs
// House style: no em dashes.
import { dropshipId, dropshipName, dropshipWatchIds, isAt } from '../src/dropship.js';
import { openNeedhamLines, shapePrep } from '../src/late-orders.js';

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const NEEDHAM = 'gid://shopify/Location/77957136639', DW = 'gid://shopify/Location/97494139135', WALPOLE = 'gid://shopify/Location/68029448447';

console.log('\nUnset: Needham, exactly as before');
const before = { NEEDHAM_LOCATION_ID: NEEDHAM };
ok(dropshipId(before) === NEEDHAM && dropshipName(before) === 'Needham', 'id and name fall back to Needham');
ok(JSON.stringify(dropshipWatchIds(before)) === JSON.stringify([NEEDHAM]), 'only Needham is watched');
ok(dropshipId({}) === null, 'nothing configured is null, so the inventory route refuses to write');

console.log('\nAt the cutover: Dropship Warehouse, Needham only watched for its old orders');
const after = { NEEDHAM_LOCATION_ID: NEEDHAM, DROPSHIP_LOCATION_ID: DW, DROPSHIP_LOCATION_NAME: 'Dropship Warehouse', DROPSHIP_WATCH_IDS: NEEDHAM };
ok(dropshipId(after) === DW && dropshipName(after) === 'Dropship Warehouse', 'writes go to Dropship Warehouse');
ok(JSON.stringify(dropshipWatchIds(after)) === JSON.stringify([DW, NEEDHAM]), 'open orders at both are watched during the changeover');
ok(JSON.stringify(dropshipWatchIds({ ...after, DROPSHIP_WATCH_IDS: '' })) === JSON.stringify([DW]), 'and only Dropship Warehouse once the old list is emptied');
ok(isAt(DW, [DW, NEEDHAM]) && !isAt(WALPOLE, [DW, NEEDHAM]) && isAt(NEEDHAM, NEEDHAM) && !isAt(null, NEEDHAM), 'isAt takes one id or a list');

console.log('\nLate orders and Draft in HOKA see both during the changeover, never a store');
const fo = (loc, title) => ({ status: 'OPEN', assignedLocation: { location: { id: loc } }, lineItems: [{ remainingQuantity: 1, lineItem: { vendor: 'HOKA', title, variantTitle: '9', sku: 'X', variant: { barcode: '1' } } }] });
const order = { fulfillmentOrders: [fo(NEEDHAM, 'old order line'), fo(DW, 'new order line'), fo(WALPOLE, 'shelf line')] };
const seen = openNeedhamLines(order, dropshipWatchIds(after)).map((l) => l.title);
ok(seen.includes('old order line') && seen.includes('new order line') && !seen.includes('shelf line'), 'old Needham and Dropship Warehouse lines, not Walpole', seen);
ok(openNeedhamLines(order, NEEDHAM).map((l) => l.title).join() === 'old order line', 'a single id still works as before');
ok(shapePrep({ name: '#1', fulfillmentOrders: order.fulfillmentOrders }, dropshipWatchIds(after)).lines.length === 2, 'Draft in HOKA picks up both');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
