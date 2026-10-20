// apparel-category.mjs, The Run House.
//
// A created product's CATEGORY is load bearing for three separate systems: the
// Massachusetts sales tax exemption, which Shopify applies from the category and
// which covers CLOTHING under $175 as well as footwear; the shopify.* category
// metafields, which only exist once a category is set; and the Google and Meta
// feeds. So "no category" is a real defect, and a WRONG category is worse,
// because it looks deliberate.
//
// THE BUG THIS FILE EXISTS FOR. buildProductSetInput decides between footwear
// and apparel with one test, "does the product type end in shoes". The ON
// converter typed every garment "Women's Shoes", so that test said footwear and
// six pairs of running shorts were created on 2026-10-20 with the Athletic Shoes
// leaf and a 2 lb shipping weight. They were set up to sell as tax exempt
// footwear. The converter now emits a garment type, and this file pins the half
// of the fix that lives in the Worker.
//
// It also pins the agreement between two tables that must not drift:
// APPAREL_CATEGORIES here keys its leaves on the product type, and classify()
// in catalog.js decides which types reach the apparel catalog at all. A type in
// one and not the other is a product the tool creates and then cannot read back,
// so the picker offers it as new again and a duplicate gets made.
//
// Run: node test/apparel-category.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { buildProductSetInput } from '../src/products.js';
import { classify } from '../src/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const NEEDHAM = 'gid://shopify/Location/111';
const SHOES = 'gid://shopify/TaxonomyCategory/aa-8-1';
const leaf = (id) => 'gid://shopify/TaxonomyCategory/' + id;

const spec = (productType, extra = {}) => Object.assign({
  title: 'X', handle: 'x', vendor: 'ON Running', productType,
  variants: [{ size: 'M', sku: 'ON-1WF1-BLA-M', price: '69.99' }],
}, extra);
const build = (t, extra) => buildProductSetInput(spec(t, extra), NEEDHAM, [NEEDHAM]);

console.log('\nFootwear is unchanged, this is the behaviour that was already right');
for (const t of ["Men's Shoes", "Women's Shoes", 'Unisex Shoes', 'Running Shoes']) {
  const out = build(t);
  eq(t + ' -> athletic shoes leaf', out.category, SHOES);
  eq(t + ' -> 2 lb', out.variants[0].inventoryItem.measurement.weight.value, 2.0);
}

console.log('\nA garment gets its own leaf, and NOT the shoe weight');
for (const [type, id] of [
  ['Shorts', 'aa-1-1-1-3'],
  ['Vests', 'aa-1-1-8-1'],
  ['T-Shirts', 'aa-1-1-2-2'],
  ['Sports Bras', 'aa-1-1-6'],
  ['Hoodies', 'aa-1-1-7-2'],
  ['Tights/Leggings', 'aa-1-1-1-5'],
  ['Socks', 'aa-1-18-2'],
]) {
  const out = build(type);
  eq(type + ' -> ' + id, out.category, leaf(id));
  eq(type + ' carries no weight', out.variants[0].inventoryItem === undefined
    || out.variants[0].inventoryItem.measurement === undefined, true);
  eq(type + ' is not the shoe leaf', out.category === SHOES, false);
}

console.log('\nCase and spacing do not decide a tax category');
eq('lower cased type still resolves', build('shorts').category, leaf('aa-1-1-1-3'));
eq('padded type still resolves', build('  Vests  ').category, leaf('aa-1-1-8-1'));

console.log('\nAn explicit category from the caller still wins');
eq('spec.category overrides footwear', build("Men's Shoes", { category: leaf('aa-1-1-1-3') }).category, leaf('aa-1-1-1-3'));
eq('spec.category overrides apparel', build('Shorts', { category: SHOES }).category, SHOES);

console.log('\nAn unknown type gets NO category rather than a guessed one');
for (const t of ['', 'Gift Card', 'Nutrition', 'Something New']) {
  eq(JSON.stringify(t) + ' -> none', build(t).category, undefined);
}

console.log('\nThe two tables agree, so nothing is created that cannot be read back');
// Every type the converter can emit, from APPAREL_TYPE_RULES in
// on-converter.js. Each must be admitted by classify() AND have a leaf here.
const EMITTED = ['Sports Bras', 'Socks', 'Gloves', 'Headwear', 'Vests', 'Hoodies',
  'Crewnecks', 'Jackets', 'Half-Zips', 'Full Zips', 'Sweatpants', 'Joggers',
  'Tights/Leggings', 'Shorts', 'Pants', 'Skorts', 'Active Dress', 'Tanks',
  'Long Sleeves', 'T-Shirts', 'Sweatshirts', 'Compression'];
const notAdmitted = EMITTED.filter((t) => classify(t, 'ON Running') !== 'apparel');
notAdmitted.length ? bad('classify() refuses a type the tool emits', notAdmitted)
  : ok('classify() admits all ' + EMITTED.length + ' emitted types');
const noLeaf = EMITTED.filter((t) => !build(t).category);
noLeaf.length ? bad('emitted type with no taxonomy leaf', noLeaf)
  : ok('all ' + EMITTED.length + ' emitted types resolve a leaf');

// And the reverse: a leaf that no longer reaches the apparel catalog is dead
// weight, and a sign the two lists have started to drift.
const SHOP_LIVE = ['Sports Bras', 'Crewnecks', 'T-Shirts', 'Hoodies', 'Shorts'];
const liveNoLeaf = SHOP_LIVE.filter((t) => !build(t).category);
liveNoLeaf.length ? bad('a type already live on the store has no leaf', liveNoLeaf)
  : ok('the 5 types already on the store all resolve a leaf');

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
