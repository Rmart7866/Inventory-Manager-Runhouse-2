// Supplier shipping emails to tracking: what is read out of an email, and
// every reason an email is sent to review instead of written.
import { parseShipEmail, decide, lastNameMatches, vendorKey, brandOfSender, truthOf, isLive, brandOfTitle, emailHasName, nameInItems } from '../src/tracking.js';

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
check('FedEx digits right after "Tracking number:"', parseShipEmail({ body: '93307_Smith shipped via FedEx. Tracking number: 771234567890' }).tracking[0].company === 'FedEx');
const brooks = parseShipEmail({ from: 'Brooks <orders@brooksrunning.com>', subject: 'Your order 92264_Smith is shipped.', body: 'Your order has been shipped.\nShip to:\n12 Main St\nTracking numbers:\n771234567890\n771234567891\nSHIPPED:\nGhost 16 UPC 195719632110' });
check('Brooks: bare numbers under "Tracking numbers:", carrier never named', brooks.brand === 'brooks' && brooks.tracking.map((t) => t.number).join() === '771234567890,771234567891' && brooks.tracking[0].company === 'FedEx');
check('and the UPC further down is still not tracking', !brooks.tracking.some((t) => t.number === '195719632110'));
check('a Brooks email with only Brooks\' own order number has no PO', parseShipEmail({ subject: 'Your order BROOKS00DRP3048424 is shipped.', body: 'Tracking numbers:\n771234567890' }).pos.length === 0);
check('the same tracking twice is one', parseShipEmail({ body: '93307_Smith 1Z999AA10123456784 1z999aa10123456784' }).tracking.length === 1);

console.log('\nNames and brands');
const ord = (o) => ({ id: 'gid://shopify/Order/1', name: '#93307', cancelledAt: null, shippingAddress: { lastName: 'Smith' }, billingAddress: { lastName: 'Smith' }, fulfillments: [], fulfillmentOrders: [], ...o });
check('last name: case and punctuation do not matter', lastNameMatches('smith', ord({})) && lastNameMatches("O'Brien", ord({ shippingAddress: { lastName: 'OBrien' } })));
check('a truncated name matches, a short one does not', lastNameMatches('Vandenb', ord({ shippingAddress: { lastName: 'Vandenberg' } })) && !lastNameMatches('Li', ord({ shippingAddress: { lastName: 'Lin' }, billingAddress: null })));
check('capitals never matter', lastNameMatches('JENKINS', ord({ shippingAddress: { lastName: 'Jenkins' } })));
check('two word last name: either word, or both run together', ['Martinez', 'GARCIA', 'GarciaMartinez'].every((p) => lastNameMatches(p, ord({ shippingAddress: { lastName: 'Garcia Martinez' }, billingAddress: null }))));
check('hyphenated too', lastNameMatches('Jones', ord({ shippingAddress: { lastName: 'Smith-Jones' }, billingAddress: null })));
check('but a word of a ONE word name is not enough, nor a 2 letter word', !lastNameMatches('Mart', ord({ shippingAddress: { lastName: 'Garcia Martinez' }, billingAddress: null })) && !lastNameMatches('De', ord({ shippingAddress: { lastName: 'De Vries' }, billingAddress: null })));
check('accents ignored, and an accented PO is read whole', lastNameMatches('Pena', ord({ shippingAddress: { lastName: 'Peña' } })) && parseShipEmail({ body: '93307_Peña 1Z999AA10123456784' }).pos[0].last === 'Peña');
check('an in-store sale says so, not "does not match"', /in-store sale/.test(decide(hoka, ord({ shippingAddress: null, billingAddress: null, sourceName: 'pos', fulfillmentOrders: [] }), NEEDHAM).reason));
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

console.log('\nInternational orders');
const intl = decide(hoka, ord({ shippingAddress: { lastName: 'Smith', countryCodeV2: 'MX' }, fulfillmentOrders: mixed.fulfillmentOrders }), NEEDHAM);
check('an order shipping abroad is never given the supplier tracking, even when everything else matches', intl.status === 'skip' && /MX/.test(intl.reason) && !intl.groups.length);
check('a US order still goes through', decide(hoka, ord({ shippingAddress: { lastName: 'Smith', countryCodeV2: 'US' }, fulfillmentOrders: mixed.fulfillmentOrders }), NEEDHAM).status === 'ready');

console.log('\nIn-store special orders');
const POS = (o) => ord({ sourceName: 'pos', shippingAddress: null, billingAddress: null, email: 'jsmith77@example.com', fulfillmentOrders: [], ...o });
const tillF = (id, lines, trk = []) => ({ id, status: 'SUCCESS', trackingInfo: trk, lineItems: lines });
const custom = (title, vendor = '') => ({ vendor, title, quantity: 1 });
check('brand off the item name: "Hoka Clifton" and a bare "Clifton 11" are HOKA, "Nimbus 28" is not', brandOfTitle('Hoka Clifton 11 Men\u2019s 11.5 (2E)') === 'hoka' && brandOfTitle('Clifton 11 Women\u2019s 8.5') === 'hoka' && brandOfTitle('Nimbus 28 Women\u2019s 8.5') === null);
const pos1 = decide(hoka, POS({ fulfillments: [tillF('F1', [custom('Ghost 18', 'Brooks'), custom('Hoka Clifton 11 Men 11.5')])] }), NEEDHAM);
check('PO name in the email: tracking goes onto the till fulfillment', pos1.status === 'ready' && pos1.kind === 'update' && pos1.fulfillments.join() === 'F1');
const pos2 = decide(hoka, POS({ email: 'runner@example.com', fulfillments: [tillF('F1', [custom('Clifton 11 Women 8.5')])] }), NEEDHAM);
check('name not in the email: held, with Add anyway', pos2.status === 'review' && pos2.canOverride === true);
check('Add anyway, after a person checked the name, makes it ready', decide(hoka, POS({ email: 'runner@example.com', fulfillments: [tillF('F1', [custom('Clifton 11 Women 8.5')])] }), NEEDHAM, { override: true }).status === 'ready');
check('an in-store sale with no HOKA item stays held, even with override', decide(hoka, POS({ fulfillments: [tillF('F1', [custom('Nimbus 28')])] }), NEEDHAM, { override: true }).status === 'review');
check('a till fulfillment that already has tracking is never overwritten', decide(hoka, POS({ fulfillments: [tillF('F1', [custom('Hoka Bondi 9')], [{ number: '1Z000' }])] }), NEEDHAM).status === 'review');
const both = decide(hoka, POS({ fulfillments: [tillF('F1', [custom('Hoka Bondi 9 Women 7.5')]), tillF('F2', [custom('Bondi 9 - BERRY JAM', 'HOKA')])] }), NEEDHAM);
check('special order AND a shelf pair: only the typed special order gets the tracking', both.status === 'ready' && both.fulfillments.join() === 'F1');
check('only a catalog HOKA pair: held for a person', decide(hoka, POS({ fulfillments: [tillF('F2', [custom('Bondi 9 - BERRY JAM', 'HOKA')])] }), NEEDHAM).canOverride === true);
check('Shopify search found the name: ready, no button needed', decide(hoka, POS({ email: 'runner@example.com', fulfillments: [tillF('F1', [custom('Clifton 11 Women 8.5')])] }), NEEDHAM, { nameFound: true }).status === 'ready');
check('a name that is in the order\'s own items proves nothing', nameInItems(POS({ fulfillments: [tillF('F1', [custom('Jenkins Elementary - Youth Hoodie')])] }), 'JENKINS') && !nameInItems(POS({ fulfillments: [tillF('F1', [custom('Clifton 11')])] }), 'Jenkins'));
check('the email check needs 3 letters and ignores case', emailHasName('J.SMITH@x.com', 'smith') && !emailHasName('li.x@y.com', 'Li'));

console.log('\nWhich brands are live');
const LIVE = { TRACKING_MODE: 'live', TRACKING_LIVE_BRANDS: 'hoka' };
check('HOKA live, Brooks and an unknown sender stay dry', isLive(LIVE, 'hoka') && !isLive(LIVE, 'brooks') && !isLive(LIVE, null));
check('dry mode is dry for every brand, list or not', !isLive({ TRACKING_MODE: 'dry', TRACKING_LIVE_BRANDS: 'hoka' }, 'hoka') && !isLive({}, 'hoka'));
check('live with no list means every known or unknown brand', isLive({ TRACKING_MODE: 'live' }, 'brooks'));

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
