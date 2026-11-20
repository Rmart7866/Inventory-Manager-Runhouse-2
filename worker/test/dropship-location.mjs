// The dropship location is ONE setting (src/dropship.js, 2026-11-18): unset it
// is Needham exactly as before; at the cutover it is Dropship Warehouse, the
// real Needham store is never written, and open orders still assigned to the
// old location stay visible to Late orders and tracking while they clear.
// Run: node test/dropship-location.mjs
// House style: no em dashes.
import { dropshipId, dropshipName, dropshipWatchIds, dropshipPrevious, isAt } from '../src/dropship.js';
import { openNeedhamLines, shapePrep } from '../src/late-orders.js';
import { createProducts } from '../src/products.js';
import { makeSalesAccumulator } from '../src/size-sales.js';
import { dropshipSales } from '../src/sales.js';

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

console.log('\nNew products: the feed quantity always lands at the dropship location');
{
  const sets = [];
  const fake = { async graphql(q, v) {
    if (q.includes('productSet')) { sets.push(v); return { data: { productSet: { product: { id: 'gid://shopify/Product/1', handle: 'h', variants: { nodes: [] } }, userErrors: [] } } }; }
    return { data: { products: { nodes: [] }, publications: { nodes: [] } } };
  } };
  const spec = { handle: 'new-shoe', title: 'New Shoe', productType: "Men's Shoes", vendor: 'HOKA', variants: [{ sku: 'X-9', options: { Size: '9' }, price: '100', quantity: 7 }] };
  // The configured list as it stands: Needham and three stores, no Dropship Warehouse.
  const LIST = NEEDHAM + ',gid://shopify/Location/71668531455,' + WALPOLE + ',gid://shopify/Location/73726886143';
  await createProducts(fake, [spec], DW, LIST).catch(() => null);
  const inv = JSON.stringify(sets[0] || {});
  const q = (sets[0] && JSON.stringify(sets[0]).match(/"inventoryQuantities":(\[[^\]]*\])/)) || null;
  const iq = q ? JSON.parse(q[1]) : [];
  const at = (loc) => (iq.find((x) => x.locationId === loc) || {}).quantity;
  ok(iq.length > 0, 'productSet carries inventory quantities', inv.slice(0, 200));
  ok(at(DW) === 7, 'Dropship Warehouse gets the 7 even though the configured list never names it', iq);
  ok(at(NEEDHAM) === 0 && at(WALPOLE) === 0, 'Needham and Walpole are activated at 0, stores like any other');
}

console.log('\nHistory across the cutover: Sizes page and sales report');
const CUT = '2026-11-20T06:00:00-05:00';
const prevEnv = { DROPSHIP_PREVIOUS_ID: NEEDHAM, DROPSHIP_PREVIOUS_NAME: 'Needham', DROPSHIP_SINCE: CUT };
const prev = dropshipPrevious(prevEnv);
ok(prev && prev.id === NEEDHAM && prev.name === 'Needham' && prev.until === Date.parse(CUT), 'the previous location reads from the settings');
ok(dropshipPrevious({}) === null && dropshipPrevious({ DROPSHIP_PREVIOUS_ID: NEEDHAM }) === null, 'unset, or with no cutover time, there is none');
{
  const acc = makeSalesAccumulator([DW], new Date('2026-12-01T00:00:00Z'), prev);
  const order = (id, at, retail) => acc.onObject({ id, createdAt: at, retailLocation: retail ? { id: retail } : null });
  const line = (oid, lid) => { acc.onObject({ __parentId: oid, id: 'fo' + lid, status: 'CLOSED', assignedLocation: { location: { id: NEEDHAM } } }); acc.onObject({ __parentId: 'fo' + lid, lineItem: { id: lid } });
    acc.onObject({ __parentId: oid, id: lid, currentQuantity: 1, product: { handle: 'h' + lid, title: 'Shoe', productType: "Men's Shoes", vendor: 'HOKA' }, variant: { selectedOptions: [{ name: 'Size', value: '9' }] } }); };
  order('o1', '2026-11-10T12:00:00Z'); line('o1', 'l1');            // online, from Needham, before: dropship
  order('o2', '2026-11-25T12:00:00Z'); line('o2', 'l2');            // online, from Needham, after: the store
  order('o3', '2026-11-10T12:00:00Z', NEEDHAM); line('o3', 'l3');   // POS at Needham, before: the store
  const r = acc.result();
  const hs = ((r.byLoc[NEEDHAM] || {}).men || []).map((x) => x.h).sort();
  ok(hs.join() === 'hl2,hl3', 'Sizes: a pre-cutover online Needham sale is dropship, the later one and POS are the store', hs);
}
{
  const ord = (id, at, where) => ({ id, createdAt: at, channelInformation: { channelDefinition: { channelName: 'Online Store' } },
    lineItems: { nodes: [{ id: 'li' + id, vendor: 'HOKA', quantity: 1, product: { productType: "Men's Shoes" }, discountedTotalSet: { shopMoney: { amount: '100' } } }] },
    fulfillmentOrders: { nodes: [{ assignedLocation: { name: where }, lineItems: { nodes: [{ lineItem: { id: 'li' + id } }] } }] } });
  const fake = { async graphql() { return { data: { orders: { nodes: [ord('a', '2026-11-10T12:00:00Z', 'Needham'), ord('b', '2026-11-25T12:00:00Z', 'Needham'), ord('c', '2026-11-25T12:00:00Z', 'Dropship Warehouse')], pageInfo: { hasNextPage: false } } } }; } };
  const rep = await dropshipSales(fake, { since: '2026-11-01', dropshipNames: ['Dropship Warehouse'], previous: prev });
  ok(rep.totals.pairs === 2, 'sales: the pre-cutover Needham sale and the Dropship Warehouse one count, the later Needham one does not', rep.totals);
  ok(/Dropship Warehouse \(Needham before 2026-11-20\)/.test(rep.definition), 'and the definition says so', rep.definition);
}

console.log('\nAfter the cutover Needham is a STORE (owner, 2026-11-20): only its pre-cutover orders count');
{
  const { dropshipWatch, countsAsDropship } = await import('../src/dropship.js');
  const N = 'gid://shopify/Location/77957136639', DW = 'gid://shopify/Location/97494139135', W = 'gid://shopify/Location/1';
  const env = { DROPSHIP_LOCATION_ID: DW, DROPSHIP_WATCH_IDS: N, DROPSHIP_SINCE: '2026-11-21T05:00:00Z' };
  const w = dropshipWatch(env);
  ok(countsAsDropship(DW, '2026-11-25T12:00:00Z', w), 'an order at Dropship Warehouse counts');
  ok(countsAsDropship(N, '2026-11-20T12:00:00Z', w), 'an order placed at Needham BEFORE the cutover still counts (it is still to ship)');
  ok(!countsAsDropship(N, '2026-11-22T12:00:00Z', w), 'an order placed at Needham AFTER the cutover is the store\'s own, not dropship');
  ok(!countsAsDropship(W, '2026-11-20T12:00:00Z', w), 'another store never counts');
  ok(!countsAsDropship(N, '', w), 'no order date at a watched store: not counted');
  const before = dropshipWatch({ NEEDHAM_LOCATION_ID: N });
  ok(countsAsDropship(N, '2026-11-22T12:00:00Z', before), 'before the cutover settings, Needham counts as always');
  ok(countsAsDropship(N, '', N) && !countsAsDropship(W, '', [N]), 'the plain id / list form still works');
  const order = { createdAt: '2026-11-22T12:00:00Z', fulfillmentOrders: [{ status: 'OPEN', assignedLocation: { location: { id: N } },
    lineItems: [{ remainingQuantity: 1, lineItem: { vendor: 'HOKA', title: 'Clifton 10', variantTitle: '9' } }] }] };
  ok(openNeedhamLines(order, w).length === 0, 'Late orders: a new Needham store order is not listed');
  ok(openNeedhamLines({ ...order, createdAt: '2026-11-19T12:00:00Z' }, w).length === 1, 'Late orders: an old one still is');
  ok(shapePrep(order, w).lines.length === 0, 'Draft in HOKA/ON/Brooks: a new Needham store order cannot be drafted');
}

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
