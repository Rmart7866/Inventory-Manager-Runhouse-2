// Supplier shipping emails to tracking: what is read out of an email, and
// every reason an email is sent to review instead of written.
import { parseShipEmail, decide, lastNameMatches, vendorKey, brandOfSender, truthOf } from '../src/tracking.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };
const NEEDHAM = 'gid://shopify/Location/77957136639';

console.log('\nReading the email');
const hoka = parseShipEmail({ from: 'HOKA <noreply@hoka.com>', subject: 'Your order has shipped', body: 'PO Number: 93307_Smith\nTracking Number: 1Z999AA10123456784\nUPS Ground' });
check('the PO is order number and last name', hoka.pos.length === 1 && hoka.pos[0].order === '93307' && hoka.pos[0].last === 'Smith');
check('a UPS number and its carrier', hoka.tracking.length === 1 && hoka.tracking[0].number === '1Z999AA10123456784' && hoka.tracking[0].company === 'UPS');
check('the sender gives the brand', hoka.brand === 'hoka' && brandOfSender('orders@deckers.com') === 'hoka' && brandOfSender('ship@wolverine.com') === null);
check('USPS by its 22 digit shape', parseShipEmail({ body: 'PO 93307_Smith tracking 9400111899223817465012' }).tracking[0].company === 'USPS');
check('FedEx from a fedex.com link', parseShipEmail({ body: '93307_Smith https://www.fedex.com/fedextrack/?trknbr=771234567890' }).tracking[0].number === '771234567890');
const upc = parseShipEmail({ body: 'PO 93307_Smith Item UPC 195719632110 qty 1. Tracking: 1Z999AA10123456784' });
check('a 12 digit UPC is NOT read as FedEx tracking', upc.tracking.length === 1 && upc.tracking[0].company === 'UPS');
check('FedEx digits only when FedEx is named and they follow "tracking"', parseShipEmail({ body: '93307_Smith shipped via FedEx. Tracking number: 771234567890' }).tracking[0].company === 'FedEx');
check('the same tracking twice is one', parseShipEmail({ body: '93307_Smith 1Z999AA10123456784 1z999aa10123456784' }).tracking.length === 1);

console.log('\nNames and brands');
const ord = (o) => ({ id: 'gid://shopify/Order/1', name: '#93307', cancelledAt: null, shippingAddress: { lastName: 'Smith' }, billingAddress: { lastName: 'Smith' }, fulfillments: [], fulfillmentOrders: [], ...o });
check('last name: case and punctuation do not matter', lastNameMatches('smith', ord({})) && lastNameMatches("O'Brien", ord({ shippingAddress: { lastName: 'OBrien' } })));
check('a truncated name matches, a short one does not', lastNameMatches('Vandenb', ord({ shippingAddress: { lastName: 'Vandenberg' } })) && !lastNameMatches('Li', ord({ shippingAddress: { lastName: 'Lin' }, billingAddress: null })));
check('vendor spellings agree', vendorKey('On Running') === 'on' && vendorKey('ON Running') === 'on' && vendorKey('HOKA ONE ONE') === 'hoka');

console.log('\nDeciding');
const FO = (id, loc, lines, status = 'OPEN') => ({ id, status, assignedLocation: { location: { id: loc } }, lineItems: lines });
const L = (id, vendor, qty = 1) => ({ id, remainingQuantity: qty, lineItem: { vendor, title: vendor + ' shoe' } });
const mixed = ord({ fulfillmentOrders: [FO('FO1', NEEDHAM, [L('a', 'HOKA'), L('b', 'Brooks')]), FO('FO2', 'gid://shopify/Location/WALPOLE', [L('c', 'HOKA')])] });
const d1 = decide(hoka, mixed, NEEDHAM);
check('a HOKA email ships only the HOKA line at Needham', d1.status === 'ready' && d1.groups.length === 1 && d1.groups[0].fo === 'FO1' && d1.groups[0].lines.map((l) => l.id).join() === 'a');
check('a line at a shop, not Needham, is never touched', !JSON.stringify(d1.groups).includes('"c"'));
check('a name that does not match goes to review', decide(hoka, ord({ shippingAddress: { lastName: 'Jones' }, billingAddress: { lastName: 'Jones' }, fulfillmentOrders: mixed.fulfillmentOrders }), NEEDHAM).status === 'review');
check('no such order goes to review', decide(hoka, null, NEEDHAM).status === 'review');
check('a cancelled order goes to review', decide(hoka, ord({ cancelledAt: '2026-11-01', fulfillmentOrders: mixed.fulfillmentOrders }), NEEDHAM).status === 'review');
const two = parseShipEmail({ from: 'hoka.com', body: '93307_Smith and 93308_Jones 1Z999AA10123456784' });
check('two POs in one email go to review', decide(two, mixed, NEEDHAM).status === 'review');
check('tracking already on the order does nothing', decide(hoka, ord({ fulfillments: [{ trackingInfo: [{ number: '1z999aa10123456784' }] }], fulfillmentOrders: mixed.fulfillmentOrders }), NEEDHAM).status === 'already');
check('no open HOKA line goes to review, naming what is open', /Brooks/.test(decide(hoka, ord({ fulfillmentOrders: [FO('FO1', NEEDHAM, [L('b', 'Brooks')])] }), NEEDHAM).reason));
check('a closed fulfillment order is not reopened', decide(hoka, ord({ fulfillmentOrders: [FO('FO1', NEEDHAM, [L('a', 'HOKA')], 'CLOSED')] }), NEEDHAM).status === 'review');
const anon = parseShipEmail({ from: 'ship@wolverine.com', body: '93307_Smith 1Z999AA10123456784' });
check('unknown sender, one brand open: ships it', decide(anon, ord({ fulfillmentOrders: [FO('FO1', NEEDHAM, [L('s', 'Saucony', 2)])] }), NEEDHAM).status === 'ready');
check('unknown sender, two brands open: review', decide(anon, mixed, NEEDHAM).status === 'review');

console.log('\nWhat staff actually did');
const ev = { at: new Date().toISOString(), status: 'ready', parsed: hoka, groups: d1.groups };
const F = (num, vendor) => ({ trackingInfo: [{ number: num }], fulfillmentLineItems: { nodes: [{ quantity: 1, lineItem: { id: 'x', vendor } }] } });
check('same tracking on the same brand: match', truthOf(ev, { fulfillments: [F('1Z999AA10123456784', 'HOKA')] }).r === 'match');
check('same tracking on another brand: other-items', truthOf(ev, { fulfillments: [F('1Z999AA10123456784', 'Brooks')] }).r === 'other-items');
check('the planned brand shipped with another number: other-tracking', truthOf(ev, { fulfillments: [F('1Z000', 'HOKA')] }).r === 'other-tracking');
check('not shipped yet: ask again later', truthOf(ev, { fulfillments: [] }) === null);
check('review, then staff used it: added-anyway', truthOf({ ...ev, status: 'review' }, { fulfillments: [F('1Z999AA10123456784', 'HOKA')] }).r === 'added-anyway');
check('review and untouched for a week: left-alone', truthOf({ ...ev, status: 'review', at: new Date(Date.now() - 8 * 86400e3).toISOString() }, { fulfillments: [] }).r === 'left-alone');

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
