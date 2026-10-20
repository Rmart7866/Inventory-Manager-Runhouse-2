// on-apparel-type.mjs, The Run House.
//
// ONE ON feed file carries footwear and apparel through ONE dropzone, split by
// the article code's first digit (1 apparel, 3 footwear). Until 2026-10-20 the
// converter did not look at that digit when it built a new product, so every
// garment was emitted with footwear's shape.
//
// WHAT THAT COST. Six 3" Core Shorts drafts were created typed "Women's
// Shoes". That is the same string footwear uses, so worker/src/products.js,
// which gates on a type ending in "shoes", also gave them the Athletic Shoes
// taxonomy leaf and a 2 lb shipping weight. Category is the field Shopify
// applies the Massachusetts footwear exemption from, so a pair of shorts was
// set up to sell as tax exempt footwear. The sizes were alphabetical too, so
// the product page opened on Large.
//
// Three things are pinned here:
//   1. the gate itself, so footwear keeps its gendered "* Shoes" type,
//   2. the garment vocabulary, which is NOT free: it has to be the vocabulary
//      the Worker's classify() admits to the apparel catalog, or the tool
//      cannot read back what it just created and offers it as new again,
//   3. the size ladder, apparel only, bras included.
//
// Run: node test/on-apparel-type.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sb = { console: { log: () => {}, warn: () => {}, error: () => {} }, setTimeout, fetch: () => {},
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../on-converter.js', import.meta.url), 'utf8'), sb);
const OC = sb.OnConverter;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

console.log('\nThe article code decides, not the title');
for (const [sku, want] of [
  ['ON-1WF10150553-BLA-L', true],    // 1xx apparel
  ['ON-1MG30670561-GLA-L', true],
  ['ON-3MF10074782-ASH-7', false],   // 3xx footwear
  ['ON-3WF30375314-BLK-8', false],
  ['ON-2UF1330069-BLK-OS', false],   // 2xx accessories, not apparel
  ['', false],
  ['NOT-A-SKU', false],
]) eq(sku || '(blank)', OC.isApparelSku(sku), want);

console.log('\nEvery garment type is one the Worker will admit to the apparel catalog');
// Copied from APPAREL_TYPE_RE in worker/src/catalog.js. classify() only lets
// these into the apparel payload, so a type outside the list creates a product
// this tool cannot see next week, which is how a duplicate gets made.
const CLASSIFY_ADMITS = new RegExp('^(' + [
  'tanks?', 'hoodies', 'sweatshirts', 't-shirts?', 'short sleeve', 'long sleeves',
  'crewnecks', 'half-zips', 'full zips', 'jackets?', 'vests', 'shorts', 'pants',
  'sweatpants', 'joggers', 'tights/leggings', 'skorts', 'sports bras', 'socks',
  'gloves', 'headwear', 'uniforms', 'compression', 'active dress',
].join('|') + ')$', 'i');

const emitted = new Set(OC.APPAREL_TYPE_RULES.map((r) => r[1]));
emitted.add('T-Shirts');   // the fallback
let strays = [...emitted].filter((t) => !CLASSIFY_ADMITS.test(t));
strays.length ? bad('types outside classify()', strays) : ok('all ' + emitted.size + ' types admitted');

let noCat = [...emitted].filter((t) => !OC.APPAREL_CATEGORY_PATH[t]);
noCat.length ? bad('types with no category path', noCat) : ok('all ' + emitted.size + ' types have a category path');

let notShoes = [...emitted].filter((t) => /shoes$/i.test(t));
notShoes.length ? bad('a garment type that reads as footwear', notShoes)
  : ok('no garment type ends in "shoes", so the weight and category gate cannot fire');

console.log('\nStacked words resolve the way a human reads them');
// Every one of these is a real model name from the 2026-10-20 FW26 feed, and
// each is a case where an earlier rule would have won by accident.
for (const [model, want] of [
  ['Endurance Bra Zip', 'Sports Bras'],          // bra, NOT a half-zip
  ['Climate Zip Hoodie', 'Hoodies'],             // hoodie, NOT a full zip
  ['Focus Tech Zip Hoodie', 'Hoodies'],
  ['Core 1/4 Zip', 'Half-Zips'],
  ['Core Long-T 1', 'Long Sleeves'],             // long sleeve, NOT a t-shirt
  ['Studio Long-T Crop', 'Long Sleeves'],        // long sleeve beats crop
  ['Train Long Sleeve Crop', 'Long Sleeves'],
  ['Core Track Jacket', 'Jackets'],              // jacket, NOT track pants
  ['Core Track Pants', 'Pants'],
  ['Focus Tech Sweatpants', 'Sweatpants'],       // sweatpants, NOT pants
  ['Club Crew Swing', 'Crewnecks'],
  ['Performance Volt Vest', 'Vests'],
  ['3" Core Shorts', 'Shorts'],
  ['Performance Tights 7/8', 'Tights/Leggings'],
  ['Zero Half Tights', 'Tights/Leggings'],       // tights, NOT a half-zip
  ['Core Tank 1', 'Tanks'],
  ['Performance-T 3', 'T-Shirts'],
  ['Club Boxy-T', 'T-Shirts'],
  // A "Crop" here is a cropped TOP, never a bottom. Shopify has a Crop Tops
  // leaf, but classify() does not admit "Crop Tops", so filing these as
  // T-Shirts is deliberate: readable beats precise when the alternative is a
  // product the tool goes blind to.
  ['Performance Crop', 'T-Shirts'],
  ['Zero Crop', 'T-Shirts'],
]) eq(model.padEnd(24) + ' -> ' + want, OC.apparelTypeFor(model), want);

console.log('\nThe size ladder, apparel only');
const order = (sizes) => OC.sortApparelVariants(sizes.map((s) => ({ size: s }))).map((v) => v.size).join(' ');
eq('alphabetical feed order becomes a ladder',
  order(['L', 'M', 'S', 'XL', 'XS', 'XXL']), 'XS S M L XL XXL');
eq('word spellings rank the same as the short forms',
  order(['Large', 'X-Small', 'Medium', 'Small']), 'X-Small Small Medium Large');
eq('2XL and XXL are one rung, not two',
  order(['2XL', 'L', 'XS']), 'XS L 2XL');
eq('a bra keeps its cup next to its band',
  order(['S', 'XS D-DD', 'XS', 'S D-DD']), 'XS XS D-DD S S D-DD');
eq('one size does not jump the queue', order(['OS', 'M', 'S']), 'S M OS');
// An unrecognised label must never be promoted past a known one, only sink.
eq('an unknown size sinks and keeps its feed order',
  order(['L', 'WEIRD', 'S', 'ALSO WEIRD']), 'S L WEIRD ALSO WEIRD');

console.log('\nFootwear is not sorted by this, its sizes already arrive in order');
// Shoe sizes come from the portal's size header (7.0, 7.5, 8.0 ...). Ranking
// them as words would be the same bug in reverse, so the gate is what protects
// them: sortApparelVariants is only ever called for a 1xx article code.
eq('a shoe size is not on the apparel ladder', OC.apparelSizeRank('10.5').rank, -1);
eq('and neither is a whole shoe size', OC.apparelSizeRank('9').rank, -1);

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
