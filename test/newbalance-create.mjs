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
// handle, which concatenated their size lists and produced a product carrying
// every size twice. Shopify rejects that on create.
const R = (o) => Object.assign({ model: 'Fresh Foam X 1080v14', genderRaw: 'Mens', color: 'BLACK', widthLabel: '', widthCode: 'D' }, o);
const shareName = [R({ colorwayCode: 'M1080B14' }), R({ colorwayCode: 'M1080K14' })];
NB._markAmbiguous(shareName);
eq('the first gets its code', shareName[0].dedupe, 'M1080B14');
eq('the second gets its code', shareName[1].dedupe, 'M1080K14');
yes('so the handles differ',
    NB.buildHandle('Fresh Foam X 1080v14', 'BLACK', 'Mens', '', shareName[0].dedupe)
    !== NB.buildHandle('Fresh Foam X 1080v14', 'BLACK', 'Mens', '', shareName[1].dedupe));

// 4E and 6E are both Extra Wide, so the colorway code is identical and cannot
// separate them. The width code has to come along.
const shareWidth = [R({ colorwayCode: 'M9284SA', widthCode: '4E', widthLabel: 'Extra Wide' }),
                    R({ colorwayCode: 'M9284SA', widthCode: '6E', widthLabel: 'Extra Wide' })];
NB._markAmbiguous(shareWidth);
eq('one colorway in two width codes: 4E', shareWidth[0].dedupe, 'M9284SA-4E');
eq('and 6E', shareWidth[1].dedupe, 'M9284SA-6E');

// The overwhelming majority are not ambiguous and must keep the handle they
// have, because the picker matches live products on it first.
const alone = [R({ colorwayCode: 'M1080B14' })];
NB._markAmbiguous(alone);
eq('a colorway with no rival is left alone', alone[0].dedupe, '');
eq('so its handle is unchanged',
   NB.buildHandle('Fresh Foam X 1080v14', 'BLACK', 'Mens', '', alone[0].dedupe),
   'mens-fresh-foam-x-1080v14-black');

console.log('\nThe width marker stays last, because the tag rule reads it off the end');
eq('title', NB.buildTitle('880v15', 'BLACK', 'Womens', 'Wide', 'W880C15'),
   'New Balance Womens 880v15 - BLACK W880C15 (Wide)');
eq('handle', NB.buildHandle('880v15', 'BLACK', 'Womens', 'Wide', 'W880C15'),
   'womens-880v15-black-w880c15-wide');

console.log('\nNothing to create when the tracker found nothing');
eq('empty comparison', NB.generateNewProductCSV({ newProducts: [], newColorways: [] }), null);
eq('no comparison at all', NB.generateNewProductCSV(null), null);

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
