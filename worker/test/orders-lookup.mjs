// Order lookup: reading what was typed, and the re:do line kept out.
import { orderQuery, shapeOrder } from '../src/orders-lookup.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };

console.log('\nWhat was typed');
check('an order number, with or without #', orderQuery('#92972') === 'name:92972' && orderQuery('92972') === 'name:92972' && orderQuery(' # 92972 ') === 'name:92972');
check('an email', orderQuery(' Coach@Example.com ') === 'email:Coach@Example.com');
check('a name is a plain search', orderQuery('Ann Smith') === 'Ann Smith' && orderQuery("O'Brien") === "O'Brien");
check('search syntax cannot be injected through a name', orderQuery('smith OR status:any (x)') === 'smith OR status any x');
check('nothing typed is no search', orderQuery('  ') === null && orderQuery('()') === null);

console.log('\nThe re:do line');
const li = (title, vendor) => ({ title, quantity: 1, currentQuantity: 1, variantTitle: 'M', sku: 'S', image: null, product: { vendor } });
const o = shapeOrder({
  id: 'gid://shopify/Order/1', name: '#92972', createdAt: '2026-11-06T10:00:00Z', cancelledAt: null,
  displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'UNFULFILLED', sourceName: 'web', email: 'a@b.c', phone: null,
  shippingAddress: { name: 'Ann Smith', address1: '1 Main St', address2: null, city: 'Walpole', provinceCode: 'MA', zip: '02081', phone: '555' },
  currentTotalPriceSet: { shopMoney: { amount: '64.00' } },
  lineItems: { nodes: [li('Club Tee', 'The Run House'), li('Free returns', 're:do')] },
  fulfillmentOrders: { nodes: [
    { status: 'OPEN', assignedLocation: { name: 'Warehouse' }, lineItems: { nodes: [{ lineItem: { product: { vendor: 'The Run House' } } }] } },
    { status: 'OPEN', assignedLocation: { name: 'Scituate' }, lineItems: { nodes: [{ lineItem: { product: { vendor: 're:do' } } }] } },
  ] },
  fulfillments: [
    { status: 'SUCCESS', displayStatus: 'FULFILLED', createdAt: '2026-11-06T11:00:00Z', location: { name: 'Scituate' }, trackingInfo: [], fulfillmentLineItems: { nodes: [{ lineItem: { product: { vendor: 're:do' } } }] } },
    { status: 'SUCCESS', displayStatus: 'IN_TRANSIT', createdAt: '2026-11-06T12:00:00Z', location: { name: 'Warehouse' }, trackingInfo: [{ number: '1Z9', url: 'https://ups/1Z9', company: 'UPS' }], fulfillmentLineItems: { nodes: [{ lineItem: { product: { vendor: 'The Run House' } } }] } },
  ],
});
check('the re:do line is not listed as an item', o.items.length === 1 && o.items[0].title === 'Club Tee');
check('and its location is not where the order ships from', o.shipsFrom.length === 1 && o.shipsFrom[0].location === 'Warehouse');
check('it is reported as one flag instead', o.redo === true);
check('the re:do line\'s own tracking-less shipment is left out', o.shipments.length === 1);
check('tracking comes through with its link', o.shipments[0].tracking[0].url === 'https://ups/1Z9' && o.shipments[0].status === 'IN_TRANSIT');
// A Shopify Collective order: no fulfillment orders visible, the brand ships it
const c = shapeOrder({ id: 'x', name: '#2', createdAt: '', cancelledAt: null, displayFinancialStatus: 'PAID', displayFulfillmentStatus: 'FULFILLED', sourceName: 'web', email: '', phone: '', shippingAddress: null,
  currentTotalPriceSet: null, lineItems: { nodes: [li('Sock', 'Comrad')] }, fulfillmentOrders: { nodes: [] },
  fulfillments: [{ displayStatus: 'CONFIRMED', createdAt: '', location: { name: 'Comrad via Shopify Collective' }, trackingInfo: [{ number: '9', url: 'u', company: 'DHL eCommerce' }], fulfillmentLineItems: { nodes: [{ lineItem: { product: { vendor: 'Comrad' } } }] } }] });
check('a Collective order says the brand ships it', c.shipsFrom.length === 1 && /Shopify Collective/.test(c.shipsFrom[0].location));
check('the phone falls back to the shipping address', o.phone === '555' && o.total === 64);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
