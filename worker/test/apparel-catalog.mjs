// apparel-catalog.mjs, The Run House.
//
// The apparel split. One pass over the store now produces two payloads, and the
// property that matters most is NEGATIVE: nothing that is not a shoe may appear
// in the footwear catalog, because that payload is what feeds the known set that
// decides what gets zeroed. Most of this file tests that apparel stays out.
//
// Run: npm run test:apparel
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { assembleBulkObjects, buildCatalogFrom, buildApparelFrom, classify } from '../src/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const check = (m, cond, extra) => (cond ? ok(m) : bad(m, extra));

const NEEDHAM = 'gid://shopify/Location/111';
const OTHER = 'gid://shopify/Location/999';

console.log('\nWhat counts as footwear');
for (const t of ["Men's Shoes", "Women's Shoes", 'Unisex Shoes', "Womens's Shoes", 'Athletic Footwear', 'Footwear'])
  check(`${t} is footwear`, classify(t, 'On Running') === 'footwear', classify(t, 'On Running'));
check('a typo\'d type still lands (Mens\'s Shoes)', classify("Mens's Shoes", 'Hoka') === 'footwear');

console.log('\nWhat counts as apparel, and for whom');
for (const t of ['T-Shirts', 'Sports Bras', 'Shorts', 'Tights/Leggings', 'Hoodies', 'Half-Zips', 'Vests', 'Socks', 'Headwear'])
  check(`${t} from a supplier brand is apparel`, classify(t, 'On Running') === 'apparel', classify(t, 'On Running'));
check('the same type from The Run House is NOT carried', classify('Hoodies', 'The Run House') === null);
check('nor from Bella + Canvas', classify('T-Shirts', 'Bella + Canvas') === null);
check('a blank product type is not carried', classify('', 'On Running') === null);
check('Spikes are not carried (shoes, but not dropship)', classify('Spikes', 'Saucony') === null);
check('Sandals are not carried', classify('Sandals', 'Hoka') === null);
check('Nutrition is not carried', classify('Nutrition', 'On Running') === null);

// --- one bulk stream, mixed ---------------------------------------------------
// A shoe at Needham, an ON tee at Needham, an ON tee stocked elsewhere, a Run
// House hoodie at Needham (must be ignored entirely), and an ON shoe sitting on
// the "Athletic Footwear" type that the old gate could not see.
const jsonl = [
  { id: 'gid://P/1', handle: 'cloudmonster-2-black', title: 'ON Mens Cloudmonster 2 - Black (3MF10121043)', vendor: 'On Running', productType: "Men's Shoes", status: 'ACTIVE', tags: [] },
  { id: 'gid://V/1', sku: 'ON-3MF10121043-BLA-9', price: '170.00', selectedOptions: [{ name: 'Size', value: '9' }], inventoryItem: { id: 'gid://I/1' }, __parentId: 'gid://P/1' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 4 }], __parentId: 'gid://V/1' },

  { id: 'gid://P/2', handle: 'on-focus-t-women-1we11860553', title: "ON Women's Focus-T - Black", vendor: 'On Running', productType: 'T-Shirts', status: 'ACTIVE', tags: [] },
  { id: 'gid://V/2', sku: 'ON-1WE11860553-BLA-XS', price: '60.00', selectedOptions: [{ name: 'Size', value: 'X-Small' }], inventoryItem: { id: 'gid://I/2' }, __parentId: 'gid://P/2' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 7 }], __parentId: 'gid://V/2' },
  { id: 'gid://V/3', sku: 'ON-1WE11860553-BLA-S', price: '60.00', selectedOptions: [{ name: 'Size', value: 'Small' }], inventoryItem: { id: 'gid://I/3' }, __parentId: 'gid://P/2' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 2 }], __parentId: 'gid://V/3' },

  { id: 'gid://P/3', handle: 'on-club-hoodie-men-1me10030553', title: "ON Men's Club Hoodie - Black", vendor: 'ON Running', productType: 'Hoodies', status: 'DRAFT', tags: [] },
  { id: 'gid://V/4', sku: 'ON-1ME10030553-BLA-M', price: '130.00', selectedOptions: [{ name: 'Size', value: 'Medium' }], inventoryItem: { id: 'gid://I/4' }, __parentId: 'gid://P/3' },
  { location: { id: OTHER }, quantities: [{ name: 'on_hand', quantity: 5 }], __parentId: 'gid://V/4' },

  { id: 'gid://P/4', handle: 'runhouse-team-hoodie', title: 'The Run House Team Hoodie', vendor: 'The Run House', productType: 'Hoodies', status: 'ACTIVE', tags: [] },
  { id: 'gid://V/5', sku: 'RH-HOODIE-M', price: '55.00', selectedOptions: [{ name: 'Size', value: 'Medium' }], inventoryItem: { id: 'gid://I/5' }, __parentId: 'gid://P/4' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 40 }], __parentId: 'gid://V/5' },

  { id: 'gid://P/5', handle: 'on-cloudsurfer-2-white', title: 'ON Womens Cloudsurfer 2 - White (3WF10103334)', vendor: 'On Running', productType: 'Athletic Footwear', status: 'ACTIVE', tags: [] },
  { id: 'gid://V/6', sku: 'ON-3WF10103334-WHI-8', price: '160.00', selectedOptions: [{ name: 'Size', value: '8' }], inventoryItem: { id: 'gid://I/6' }, __parentId: 'gid://P/5' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 1 }], __parentId: 'gid://V/6' },
];

console.log('\nOne pass splits into two payloads');
const { raw, apparelRaw, needham } = assembleBulkObjects(jsonl, NEEDHAM);
check('2 footwear products', raw.length === 2, raw.map((p) => p.handle));
check('2 apparel products', apparelRaw.length === 2, apparelRaw.map((p) => p.handle));
check('the Athletic Footwear shoe is now visible', raw.some((p) => p.handle === 'on-cloudsurfer-2-white'));
check('The Run House hoodie is in neither', ![...raw, ...apparelRaw].some((p) => p.handle === 'runhouse-team-hoodie'));

console.log('\nThe footwear catalog contains no garments');
const foot = buildCatalogFrom(raw, needham, { needhamLocationId: NEEDHAM, shop: 'test.myshopify.com' });
const APPAREL_HANDLES = ['on-focus-t-women-1we11860553', 'on-club-hoodie-men-1me10030553', 'runhouse-team-hoodie'];
check('no apparel handle in products', !foot.products.some((p) => APPAREL_HANDLES.includes(p.handle)));
check('no apparel handle in statusByHandle', !APPAREL_HANDLES.some((h) => h in foot.statusByHandle));
check('no apparel SKU in bySku', !Object.keys(foot.bySku).some((s) => /1WE|1ME|RH-HOODIE/.test(s)), Object.keys(foot.bySku));
check('the apparel product at Needham is NOT counted as a dropship product', foot.counts.needhamProducts === 2, foot.counts.needhamProducts);
check('footwear payload has no apparel key', !('apparel' in foot) && !('_apparel' in foot));

console.log('\nThe apparel catalog');
const app = buildApparelFrom(apparelRaw, needham, { needhamLocationId: NEEDHAM, shop: 'test.myshopify.com' });
check('2 products', app.counts.products === 2, app.counts.products);
check('3 variants', app.counts.variants === 3, app.counts.variants);
const tee = app.products.find((p) => p.handle === 'on-focus-t-women-1we11860553');
check('the article code is extracted', tee.codes.includes('1WE11860553'), tee.codes);
check('byCode joins the code to the handle', app.byCode['1WE11860553'] === 'on-focus-t-women-1we11860553');
check('sizes keep the STORE spelling and order', JSON.stringify(tee.sizes) === JSON.stringify(['X-Small', 'Small']), tee.sizes);
check('brand is resolved', tee.brand === 'ON', tee.brand);
check('Needham on-hand carried (7 + 2)', tee.needhamOnHand === 9, tee.needhamOnHand);
const hood = app.products.find((p) => p.handle === 'on-club-hoodie-men-1me10030553');
check('an apparel product stocked elsewhere is needham false', hood.needham === false && hood.needhamOnHand === 0);
check('draft status is preserved', hood.status === 'DRAFT');
check('no swatch or width machinery leaks in', !('cwGroup' in tee) && !('widthTag' in tee) && !('needhamVariants' in tee));

console.log('\nA code claimed twice is published as ambiguous, never guessed');
const dupe = [
  { id: 'gid://P/9', handle: 'bra-black-1we10400553', title: 'Bra Black', vendor: 'On Running', productType: 'Sports Bras', status: 'DRAFT', tags: [] },
  { id: 'gid://V/9', sku: 'ON-1WE10400553-BLA-S', price: '70.00', selectedOptions: [{ name: 'Size', value: 'Small' }], inventoryItem: { id: 'gid://I/9' }, __parentId: 'gid://P/9' },
  { id: 'gid://P/10', handle: 'bra-iris-1we10400553', title: 'Bra Iris', vendor: 'On Running', productType: 'Sports Bras', status: 'DRAFT', tags: [] },
  { id: 'gid://V/10', sku: 'ON-1WE10400553-IRI-S', price: '70.00', selectedOptions: [{ name: 'Size', value: 'Small' }], inventoryItem: { id: 'gid://I/10' }, __parentId: 'gid://P/10' },
];
const dupeApp = buildApparelFrom(assembleBulkObjects(dupe, NEEDHAM).apparelRaw, null, {});
check('the ambiguous code is NOT in byCode', !('1WE10400553' in dupeApp.byCode));
check('it is reported instead', dupeApp.ambiguousCodes.length === 1 && dupeApp.ambiguousCodes[0].handles.length === 2, dupeApp.ambiguousCodes);

console.log('\nScoping off behaves the same as before');
const off = assembleBulkObjects(jsonl, null);
check('no Needham data', off.needham === null);
const appOff = buildApparelFrom(off.apparelRaw, off.needham, {});
check('apparel needham flags are null', appOff.products.every((p) => p.needham === null));
check('needhamScoped false', appOff.needhamScoped === false);

console.log('');
if (failures) { console.log(`APPAREL CATALOG TESTS FAILED: ${failures}`); process.exit(1); }
console.log('Apparel split OK. The footwear catalog stays footwear.\n');
