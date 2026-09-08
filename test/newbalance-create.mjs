// newbalance-create.mjs, The Run House.
//
// Pins the contract between newbalance-converter.js and product-enrichment.js.
//
// WHY. New Balance shipped with generateNewProductCSV writing the LEGACY Shopify
// import header ("Handle", "Option1 Value", "Variant SKU") while every other
// brand writes the Matrixify header ("URL handle", "Option1 value", "SKU").
// Nothing threw. applyToCSV and buildCreateSpecs both look their columns up by
// name, so every handle read as empty, the review inherited nothing, and Create
// in Shopify said "Nothing to create" with no clue why. A column rename is
// invisible to a syntax check and to the eye, so it needs a test.
//
// Run: node test/newbalance-create.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const sandbox = {
  console,
  window: {},
  document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {} },
  module: { exports: {} },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'newbalance-converter.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'product-enrichment.js'), 'utf8'), sandbox);
const NB = sandbox.NewBalanceConverter;
const PE = sandbox.ProductEnrichment;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));
const yes = (m, c, extra) => (c ? ok(m) : bad(m, extra));

// One brand-new colorway (two sizes) and one new colorway of a carried model, in
// a width, so both halves of the comparison are exercised.
const V = (o) => [{}, Object.assign({
  gender: 'Womens', model: '880V15', category: 'Running', price: '145.00', width: '',
}, o)];
NB.productVariantData = [
  V({ handle: 'womens-880v15-black', title: "New Balance Womens 880v15 - BLACK", color: 'BLACK',
      sku: 'W880B15  B  07', size: '7', quantity: 4, barcode: '196652000001' }),
  V({ handle: 'womens-880v15-black', title: "New Balance Womens 880v15 - BLACK", color: 'BLACK',
      sku: 'W880B15  B  08', size: '8', quantity: 2, barcode: '196652000002' }),
  V({ handle: 'mens-880v15-blue-wide', title: "New Balance Mens 880v15 - BLUE (Wide)", color: 'BLUE',
      gender: 'Mens', width: 'Wide', sku: 'M880C15  2E 09', size: '9', quantity: 1, barcode: '196652000003' }),
];
const comparison = {
  newProducts: [{ handle: 'womens-880v15-black',
    variants: { '7': { sku: 'W880B15  B  07', quantity: 4 }, '8': { sku: 'W880B15  B  08', quantity: 2 } } }],
  newColorways: [{ handle: 'mens-880v15-blue-wide',
    variants: { '9': { sku: 'M880C15  2E 09', quantity: 1 } } }],
};

console.log('\nThe CSV uses the header the enrichment path reads');
const csv = NB.generateNewProductCSV(comparison);
yes('a CSV is produced', !!csv);
const header = (csv || '').split('\n')[0].split(',').map((h) => h.replace(/^"|"$/g, ''));
// These are the exact names applyToCSV and buildCreateSpecs index by. Renaming
// any one of them breaks Stage 4 silently.
for (const col of ['Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type',
                   'Tags', 'Price', 'SKU', 'Barcode', 'Option1 value', 'SEO title', 'SEO description']) {
  yes('header carries "' + col + '"', header.indexOf(col) >= 0, header.slice(0, 12));
}
yes('and NOT the legacy "Variant SKU"', header.indexOf('Variant SKU') === -1);

console.log('\nA new colorway of a carried model is included, not just a new model');
yes('both handles are in the CSV',
    csv.indexOf('womens-880v15-black') >= 0 && csv.indexOf('mens-880v15-blue-wide') >= 0);

console.log('\nThe CSV drives Stage 4');
const specs = PE.buildCreateSpecs('newbalance', NB, comparison, {});
eq('two products to create', specs.length, 2);
const w = specs.find((s) => s.handle === 'womens-880v15-black');
const m = specs.find((s) => s.handle === 'mens-880v15-blue-wide');
eq('title survives', w && w.title, "New Balance Womens 880v15 - BLACK");
eq('vendor is the canonical spelling', w && w.vendor, 'New Balance');
eq("women's type", w && w.productType, "Women's Shoes");
eq("men's type", m && m.productType, "Men's Shoes");
eq('both sizes become variants', w && w.variants.length, 2);
eq('sku survives whole, spaces and all', w && w.variants[0].sku, 'W880B15  B  07');
eq('barcode survives', w && w.variants[0].barcode, '196652000001');
// Feed stock has to reach the spec or products get created empty at Needham.
eq('feed stock reaches the variant', w && w.variants[0].quantity, 4);
eq('and for the new colorway too', m && m.variants[0].quantity, 1);
yes('color_name metafield is set',
    !!(w && w.metafields.some((f) => f.key === 'color_name' && f.value === 'BLACK')),
    w && w.metafields);

console.log('\nDraft only, which is what makes create safe');
yes('status is Draft in the CSV', /"Draft"/.test(csv));
yes('not published to the online store', /"FALSE"/.test(csv));

console.log('\nTwo colorways that read as one product are told apart');
// New Balance reuses a Color Name across different colorways, and maps several
// width CODES onto one width CLASS. Either collision merged two records into one
// handle, which concatenated their size lists into a product carrying every size
// twice. Shopify rejects that on create.
//
// The handle takes the colorway code because it must be STABLE (the picker
// matches live products on it first). The title takes something readable,
// because a customer sees it.
const R = (o) => Object.assign({ model: 'AC Runner', genderRaw: 'Mens', color: 'BLACK', widthLabel: '', widthCode: 'D' }, o);

// 1. Different colorways, one Color Name. Nothing in the feed tells them apart,
//    so the title gets an ordinal ordered by colorway code.
const shareName = [R({ colorwayCode: 'MACR13XO' }), R({ colorwayCode: 'MACR113W' })];
NB._markAmbiguous(shareName);
const byCode = (c) => shareName.find((r) => r.colorwayCode === c);
eq('handle takes the code', byCode('MACR113W').handleDedupe, 'MACR113W');
eq('and for the other', byCode('MACR13XO').handleDedupe, 'MACR13XO');
eq('the first by code gets no ordinal', byCode('MACR113W').titleSuffix, '');
eq('the second gets 2', byCode('MACR13XO').titleSuffix, '2');
yes('ordering does not depend on row order', byCode('MACR113W').titleSuffix === ''
    && byCode('MACR13XO').titleSuffix === '2');
eq('so the titles differ and carry no code',
   NB.buildTitle('AC Runner', 'BLACK', 'Mens', '', byCode('MACR13XO').titleSuffix, byCode('MACR13XO').titleWidth),
   'New Balance Mens AC Runner - BLACK 2');

// 2. One colorway, two width codes of the same class. Here the code IS readable,
//    and parsers.js accepts a bare width code in parentheses.
const shareWidth = [R({ colorwayCode: 'M9284SA', widthCode: '4E', widthLabel: 'Extra Wide' }),
                    R({ colorwayCode: 'M9284SA', widthCode: '6E', widthLabel: 'Extra Wide' })];
NB._markAmbiguous(shareWidth);
eq('handle carries code and width code', shareWidth[0].handleDedupe, 'M9284SA-4E');
eq('the title says (4E), not (Extra Wide)',
   NB.buildTitle('928 V4', 'BLACK COFFEE', 'Mens', 'Extra Wide', shareWidth[0].titleSuffix, shareWidth[0].titleWidth),
   'New Balance Mens 928 V4 - BLACK COFFEE (4E)');
eq('and (6E) for the other',
   NB.buildTitle('928 V4', 'BLACK COFFEE', 'Mens', 'Extra Wide', shareWidth[1].titleSuffix, shareWidth[1].titleWidth),
   'New Balance Mens 928 V4 - BLACK COFFEE (6E)');
eq('no ordinal, one colorway needs none', shareWidth[0].titleSuffix, '');

// 3. BOTH at once, which MX608V5 WHITE Extra Wide really is: several colorways,
//    each sold in 4E and 6E. Treating these as either/or left them sharing a
//    title. The ordinal is per COLORWAY, so one colorway keeps its number across
//    both of its widths and the width code separates those.
const both = [R({ colorwayCode: 'MX608AW5', widthCode: '4E', widthLabel: 'Extra Wide' }),
              R({ colorwayCode: 'MX608AW5', widthCode: '6E', widthLabel: 'Extra Wide' }),
              R({ colorwayCode: 'MX608HR5', widthCode: '4E', widthLabel: 'Extra Wide' }),
              R({ colorwayCode: 'MX608HR5', widthCode: '6E', widthLabel: 'Extra Wide' })];
NB._markAmbiguous(both);
const t = (r) => NB.buildTitle('MX608V5', 'WHITE', 'Mens', 'Extra Wide', r.titleSuffix, r.titleWidth);
const titles = both.map(t);
eq('four distinct titles', new Set(titles).size, 4);
yes('one colorway keeps one ordinal across its widths',
    both.filter((r) => r.colorwayCode === 'MX608AW5').every((r) => r.titleSuffix === both[0].titleSuffix), titles);
console.log('        ' + titles.join('\n        '));

// The overwhelming majority are not ambiguous and must keep the handle they
// have, because the picker matches live products on it first.
const alone = [R({ colorwayCode: 'MACR113W' })];
NB._markAmbiguous(alone);
eq('a colorway with no rival is left alone', alone[0].handleDedupe, '');
eq('so its handle is unchanged',
   NB.buildHandle('AC Runner', 'BLACK', 'Mens', '', alone[0].handleDedupe),
   'mens-ac-runner-black');
eq('and its title is unchanged',
   NB.buildTitle('AC Runner', 'BLACK', 'Mens', '', alone[0].titleSuffix, alone[0].titleWidth),
   'New Balance Mens AC Runner - BLACK');

console.log('\nThe width marker stays last, because the tag rule reads it off the end');
eq('title', NB.buildTitle('880v15', 'BLACK', 'Womens', 'Wide', '2'),
   'New Balance Womens 880v15 - BLACK 2 (Wide)');
eq('handle', NB.buildHandle('880v15', 'BLACK', 'Womens', 'Wide', 'W880C15'),
   'womens-880v15-black-w880c15-wide');

console.log('\nNothing to create when the tracker found nothing');
eq('empty comparison', NB.generateNewProductCSV({ newProducts: [], newColorways: [] }), null);
eq('no comparison at all', NB.generateNewProductCSV(null), null);

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
