// Late orders: only lines still open at Needham count as waiting on a supplier.
import { openNeedhamLines } from '../src/late-orders.js';

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

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
