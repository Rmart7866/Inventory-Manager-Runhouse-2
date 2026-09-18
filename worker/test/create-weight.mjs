// create-weight.mjs, The Run House.
//
// A shoe created through Stage 4 must arrive with a shipping weight, and a
// garment must not.
//
// WHY. buildProductSetInput used to send inventoryItem: { sku, tracked } with no
// weight, which Shopify stores as 0 lb, so calculated shipping came out wrong.
// It showed up as orders shipping with no weight, and by the time it was noticed
// it had reached 13,458 footwear variants across 926 products. The catalogue was
// normalised with tools/set-shoe-weights.mjs; this is the half that stops the
// backlog re-forming on the next drop.
//
// The other half of the contract is that this route ALSO creates ON apparel,
// where 2 lb is plainly wrong, so the weight is gated on the product type.
//
// 2 lb must match tools/set-shoe-weights.mjs. If one moves, both move.
//
// Run: node test/create-weight.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { buildProductSetInput } from '../src/products.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));
const yes = (m, c, extra) => (c ? ok(m) : bad(m, extra));

const NEEDHAM = 'gid://shopify/Location/111';
const build = (productType, variants) =>
  buildProductSetInput({ title: 'T', productType, variants }, NEEDHAM, [NEEDHAM]);
const weightOf = (input, i = 0) => input.variants[i].inventoryItem.measurement?.weight;

console.log('\nEvery footwear type gets 2 lb');
for (const t of ["Men's Shoes", "Women's Shoes", 'Unisex Shoes', 'Running Shoes', "Kids' Shoes"]) {
  const w = weightOf(build(t, [{ size: '9', sku: 'A' }]));
  eq(`${t} value`, w && w.value, 2.0);
  eq(`${t} unit`, w && w.unit, 'POUNDS');
}

console.log('\nApparel is left alone, because 2 lb would be wrong on a tee');
for (const t of ['T-Shirts', 'Hoodies', 'Sports Bras', 'Shorts', 'Socks', 'Headwear']) {
  eq(`${t} carries no weight`, weightOf(build(t, [{ size: 'M', sku: 'B' }])), undefined);
}
eq('and a missing product type carries none', weightOf(build(undefined, [{ size: 'M', sku: 'C' }])), undefined);
eq('nor an empty one', weightOf(build('', [{ size: 'M', sku: 'C' }])), undefined);

console.log('\nEvery variant of a shoe, not just the first');
const many = build("Men's Shoes", [
  { size: '9', sku: 'A' }, { size: '9.5', sku: 'B' }, { size: '10', sku: 'C' },
]);
eq('three variants built', many.variants.length, 3);
yes('all three weigh 2 lb', many.variants.every((v) => v.inventoryItem.measurement?.weight?.value === 2.0),
    many.variants.map((v) => v.inventoryItem.measurement));

console.log('\nA caller may override per variant');
const ov = build("Men's Shoes", [{ size: '9', sku: 'A', weight: 2.5 }, { size: '10', sku: 'B' }]);
eq('the override is honoured', weightOf(ov, 0).value, 2.5);
eq('and the default still applies to the rest', weightOf(ov, 1).value, 2.0);

console.log('\nNothing else about the variant moved');
const v = build("Men's Shoes", [{ size: '9', sku: 'SKU-1', price: '150.00', barcode: '123', quantity: 4 }]).variants[0];
eq('sku', v.inventoryItem.sku, 'SKU-1');
eq('tracked', v.inventoryItem.tracked, true);
eq('price', v.price, '150.00');
eq('barcode', v.barcode, '123');
yes('inventory still only real at Needham',
    v.inventoryQuantities.every((q) => (q.locationId === NEEDHAM ? q.quantity === 4 : q.quantity === 0)),
    v.inventoryQuantities);

console.log('\nFootwear also gets the athletic shoes category, apparel does not');
eq('shoes', build("Men's Shoes", [{ size: '9', sku: 'A' }]).category, 'gid://shopify/TaxonomyCategory/aa-8-1');
eq('and every footwear type', build('Running Shoes', [{ size: '9', sku: 'A' }]).category, 'gid://shopify/TaxonomyCategory/aa-8-1');
eq('a sports bra gets none', build('Sports Bras', [{ size: 'M', sku: 'B' }]).category, undefined);
eq('nor does a missing type', build(undefined, [{ size: 'M', sku: 'C' }]).category, undefined);
eq('a caller may override it',
   buildProductSetInput({ title: 'T', productType: "Men's Shoes", category: 'gid://shopify/TaxonomyCategory/aa-8',
     variants: [{ size: '9', sku: 'A' }] }, NEEDHAM, [NEEDHAM]).category,
   'gid://shopify/TaxonomyCategory/aa-8');

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
