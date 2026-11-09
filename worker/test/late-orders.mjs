// Late orders: only lines still open at Needham count as waiting on a supplier.
import { openNeedhamLines, shapePrep, orderedMarker } from '../src/late-orders.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };
const N = 'gid://shopify/Location/77957136639';
const FO = (status, loc, lines) => ({ status, assignedLocation: { location: { id: loc } }, lineItems: lines });
const L = (vendor, qty) => ({ remainingQuantity: qty, lineItem: { vendor, title: vendor + ' shoe', variantTitle: '9' } });

const rows = openNeedhamLines({ fulfillmentOrders: [
  FO('OPEN', N, [L('HOKA', 1), L('Brooks', 0)]),
  FO('OPEN', 'gid://shopify/Location/WALPOLE', [L('HOKA', 1)]),
  FO('CLOSED', N, [L('ASICS', 1)]),
  FO('IN_PROGRESS', N, [L('ON Running', 2)]),
] }, N);
console.log('\nWhat counts as waiting');
check('an open Needham line with something left to ship', rows.some((r) => r.vendor === 'HOKA' && r.qty === 1));
check('a line already shipped in full does not', !rows.some((r) => r.vendor === 'Brooks'));
check('a shop line is not a supplier wait', rows.filter((r) => r.vendor === 'HOKA').length === 1);
check('a closed fulfillment order does not, an in progress one does', !rows.some((r) => r.vendor === 'ASICS') && rows.some((r) => r.vendor === 'ON Running' && r.qty === 2));

console.log('\nAlready ordered: the PO posted as a timeline comment');
const C = (text, at = '2026-11-09T10:00:00Z') => ({ __typename: 'CommentEvent', createdAt: at, rawMessage: text });
check('a comment holding this order\'s PO marks it ordered', orderedMarker('#93307', [C('93307_Smith')]).text === '93307_Smith');
check('upper case and extra words are fine', !!orderedMarker('#93307', [C('ordered HOKA 93307_SMITH thx')]));
check('another order\'s PO does not count, nor a longer number', !orderedMarker('#93307', [C('93308_Smith'), C('193307_Smith')]));
check('a comment without the PO does not count, nor a non comment event', !orderedMarker('#93307', [C('called customer'), { __typename: 'BasicEvent', message: '93307_Smith' }]));

console.log('\nOrder prep for a supplier cart');
const PL = (vendor, qty, upc) => ({ remainingQuantity: qty, lineItem: { vendor, title: vendor + ' shoe', variantTitle: '9', sku: 'S-' + vendor, variant: { barcode: upc } } });
const order = (country) => ({ id: 'gid://shopify/Order/123', name: '#93307', shippingAddress: { firstName: 'Ann', lastName: 'Van Dyke', address1: '1 Main St', address2: '', city: 'Needham', provinceCode: 'MA', zip: '02492', countryCodeV2: country, phone: '555' },
  fulfillmentOrders: [FO('OPEN', N, [PL('HOKA', 1, '198-605519741'), PL('Brooks', 0, '1')]), FO('OPEN', 'gid://shopify/Location/WALPOLE', [PL('HOKA', 1, '2')])] });
const us = shapePrep(order('US'), N);
check('only open Needham lines, with a clean UPC and quantity', us.lines.length === 1 && us.lines[0].upc === '198605519741' && us.lines[0].qty === 1);
check('the PO is order number and last name, spaces removed', us.po === '93307_VanDyke');
check('a US order carries its ship-to address, state as a code', us.address && us.address.state === 'MA' && us.address.street1 === '1 Main St' && !us.international);
const intl = shapePrep(order('AE'), N);
check('an international order gives NO address: the supplier ships to the store', intl.international && intl.address === null);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
