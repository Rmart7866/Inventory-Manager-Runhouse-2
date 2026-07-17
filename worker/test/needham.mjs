// needham.mjs, The Run House.
//
// Unit-tests the bulk reassembly + Needham scoping without a live Shopify. The
// live bulk operation (submit, poll, download JSONL) is exercised against the
// store separately; this tests the PURE logic that turns the flat JSONL objects
// into the catalog payload: footwear filtering, the needham flag, the on-hand
// total, needhamScoped. That is the logic that guards a zero-out, so it is worth
// a test.
//
// Run: npm run test:needham
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { assembleBulkObjects, buildCatalogFrom } from '../src/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures++; console.log('  FAIL  ' + m); };
const check = (m, cond) => cond ? ok(m) : bad(m);

const NEEDHAM = 'gid://shopify/Location/111';
const OTHER = 'gid://shopify/Location/999';

// Bulk JSONL objects, in emit order (parent before child). Product A is footwear
// at Needham with stock; B is footwear stocked only elsewhere; C is a non-footwear
// hat that is also at Needham (must be ignored, it is not a shoe).
const jsonl = [
  { id: 'gid://P/1', handle: 'clifton-9-black', title: 'Hoka Mens Clifton 9 - Black (1111-BLK)', vendor: 'Hoka', productType: "Men's Shoes", status: 'ACTIVE', tags: [] },
  { id: 'gid://V/1', sku: '1111-BLK-9', price: '140.00', selectedOptions: [{ name: 'Size', value: '9' }], inventoryItem: { id: 'gid://I/1' }, __parentId: 'gid://P/1' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 3 }], __parentId: 'gid://V/1' },
  { id: 'gid://V/2', sku: '1111-BLK-10', price: '140.00', selectedOptions: [{ name: 'Size', value: '10' }], inventoryItem: { id: 'gid://I/2' }, __parentId: 'gid://P/1' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 2 }], __parentId: 'gid://V/2' },

  { id: 'gid://P/2', handle: 'retail-only-shoe', title: 'Hoka Mens Bondi 8 - White (2222-WHT)', vendor: 'Hoka', productType: "Men's Shoes", status: 'ACTIVE', tags: [] },
  { id: 'gid://V/3', sku: '2222-WHT-9', price: '160.00', selectedOptions: [{ name: 'Size', value: '9' }], inventoryItem: { id: 'gid://I/3' }, __parentId: 'gid://P/2' },
  { location: { id: OTHER }, quantities: [{ name: 'on_hand', quantity: 4 }], __parentId: 'gid://V/3' },

  { id: 'gid://P/3', handle: 'a-hat', title: 'A Hat', vendor: 'X', productType: 'Headwear', status: 'ACTIVE', tags: [] },
  { id: 'gid://V/4', sku: 'HAT', price: '20.00', selectedOptions: [{ name: 'Size', value: 'OS' }], inventoryItem: { id: 'gid://I/4' }, __parentId: 'gid://P/3' },
  { location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 9 }], __parentId: 'gid://V/4' },
];

// --- reassembly -------------------------------------------------------------
console.log('\nBulk reassembly (footwear only, Needham on-hand + sizes)');
const { raw, needham } = assembleBulkObjects(jsonl, NEEDHAM);
check('keeps the 2 footwear products, drops the hat',
  raw.length === 2 && raw.some((p) => p.handle === 'clifton-9-black') && raw.some((p) => p.handle === 'retail-only-shoe') && !raw.some((p) => p.handle === 'a-hat'));
check('footwear product carries its variants', raw[0].variants.nodes.length === 2 && raw[0].variants.nodes[0].sku === '1111-BLK-9');
check('Needham on-hand summed across variants (3 + 2)', needham.onHand.get('clifton-9-black') === 5);
check('per-size variants captured for zero rows', needham.variants.get('clifton-9-black')['9'].quantity === 3 && needham.variants.get('clifton-9-black')['10'].sku === '1111-BLK-10');
check('product stocked only elsewhere is NOT in the Needham map', !needham.onHand.has('retail-only-shoe'));
check('the non-footwear hat at Needham is ignored', !needham.onHand.has('a-hat'));

// --- payload, scoping ON ----------------------------------------------------
console.log('\nbuildCatalogFrom with Needham scoping ON');
const scoped = buildCatalogFrom(raw, needham, { needhamLocationId: NEEDHAM, shop: 'test.myshopify.com' });
check('needhamScoped = true', scoped.needhamScoped === true);
check('counts.needhamProducts = 1', scoped.counts.needhamProducts === 1);
const A = scoped.products.find((p) => p.handle === 'clifton-9-black');
const B = scoped.products.find((p) => p.handle === 'retail-only-shoe');
check('Needham product has needham = true', A && A.needham === true);
check('Needham product carries on-hand total 5', A && A.needhamOnHand === 5);
check('Needham product carries per-size variants', A && A.needhamVariants && A.needhamVariants['9'].quantity === 3);
check('non-Needham product has needham = false, on-hand 0', B && B.needham === false && B.needhamOnHand === 0);
check('bySku carries every footwear SKU (collision checks)', scoped.bySku['2222-WHT-9'] === 'retail-only-shoe');

// --- payload, scoping OFF ---------------------------------------------------
console.log('\nbuildCatalogFrom with Needham scoping OFF');
const { raw: raw2, needham: needham2 } = assembleBulkObjects(jsonl, null);
check('no Needham data when scoping off', needham2 === null);
const unscoped = buildCatalogFrom(raw2, needham2, { needhamLocationId: null, shop: 'test.myshopify.com' });
check('needhamScoped = false', unscoped.needhamScoped === false);
check('needham flag is null when off', unscoped.products[0].needham === null);
check('still filters to footwear (2 products)', unscoped.products.length === 2);

console.log('');
if (failures) { console.log(`NEEDHAM TESTS FAILED: ${failures}`); process.exit(1); }
console.log('Bulk reassembly + Needham scoping OK. Live bulk op verified against the store separately.\n');
