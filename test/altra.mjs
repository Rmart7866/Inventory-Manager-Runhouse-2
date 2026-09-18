// altra.mjs, The Run House.
//
// Runs AltraConverter against the REAL "Fall 26 (US)" ATS export, because the
// things most likely to be wrong are facts about the file rather than logic:
// what "99+" means, how many ways one export spells a gender, and whether the
// image code the whole brand hangs on actually comes out of the columns.
//
// Run: node test/altra.mjs [path/to/Fall 26 US.xlsx]
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);
const FILE = process.argv[2] || '/Users/ryanmartin/Downloads/Fall 26 US (1).xlsx';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const check = (m, c, x) => (c ? ok(m) : bad(m, x));
const eq = (m, a, b) => check(`${m} (${JSON.stringify(a)})`, a === b, { got: a, want: b });

let XLSX; try { XLSX = require('xlsx'); } catch { XLSX = null; }
const sandbox = { console, module: { exports: {} }, XLSX, setTimeout, Promise, Map, Set };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'altra-converter.js'), 'utf8'), sandbox);
const C = sandbox.AltraConverter;

console.log('\nThe export spells gender eight ways and all of them must land on three');
for (const g of ['WOMENS', "WOMEN'S", "Women's", 'womens']) eq(g, C.normalizeGender(g), 'Womens');
for (const g of ['MENS', "MEN'S", "Men's", 'mens']) eq(g, C.normalizeGender(g), 'Mens');
for (const g of ['UNISEX', 'Adult Unisex']) eq(g, C.normalizeGender(g), 'Unisex');
eq('blank gives nothing, so the row is skipped rather than guessed', C.normalizeGender(''), '');
check('"WOMENS" must not be read as Mens, it contains "MEN"', C.normalizeGender('WOMENS') === 'Womens');

console.log('\n"99+" is a floor, not a number');
eq('"99+" counts as 99', C.parseQty('99+'), 99);
eq('a plain number passes through', C.parseQty(8), 8);
eq('blank is zero', C.parseQty(''), 0);
check('and it is never NaN, which Shopify would silently store as 0',
  Number.isFinite(C.parseQty('99+')) && Number.isFinite(C.parseQty('junk')));

console.log('\nWidth is a footshape, only MED or WIDE');
eq('MED carries no marker, the store convention', C.widthLabelFor('MED'), '');
eq('WIDE becomes a plain word parsers.js already reads', C.widthLabelFor('WIDE'), 'Wide');
eq('blank is standard', C.widthLabelFor(''), '');

console.log('\nSizes are plain here, unlike the zero padded New Balance export');
eq('5.5 stays 5.5', C.normalizeSize('5.5'), '5.5');
eq('6 stays 6', C.normalizeSize('6'), '6');
eq('6.0 loses the trailing zero', C.normalizeSize('6.0'), '6');
eq('junk is dropped', C.normalizeSize('x'), '');

console.log('\nThe image code, which the whole brand hangs on');
eq('Style Number plus Color Code', C.colorwayCode('AL0A85UH', '72C'), 'AL0A85UH72C');
eq('and it uppercases', C.colorwayCode('al0a85uh', '72c'), 'AL0A85UH72C');

console.log('\nThe gender prefix is stripped from the style name, it is already a column');
eq('"W TORIN 9"', C.formatModelName('W TORIN 9'), 'Torin 9');
eq('"M LONE PEAK 9"', C.formatModelName('M LONE PEAK 9'), 'Lone Peak 9');
check('a model whose real name starts with M is not damaged',
  C.formatModelName('MONT BLANC') === 'Mont Blanc', C.formatModelName('MONT BLANC'));

console.log('\nHandles carry the colorway code, so two colours sharing a name cannot collide');
const h1 = C.buildHandle('Torin 9', 'BLACK', 'Womens', '', 'AL0A85UH72C');
const h2 = C.buildHandle('Torin 9', 'BLACK', 'Womens', '', 'AL0A85UH001');
check('same model, same colour NAME, different code, different handle', h1 !== h2, { h1, h2 });
check('wide is distinguishable from standard',
  C.buildHandle('Torin 9', 'BLACK', 'Womens', 'Wide', 'AL0A85UH72C') !== h1);

if (!fs.existsSync(FILE)) {
  console.log(`\n(skipping the real-file pass, ${path.basename(FILE)} not found)`);
} else if (!XLSX) {
  console.log('\n(skipping the real-file pass, xlsx not installed)');
} else {
  console.log('\nAgainst the real export');
  const buf = fs.readFileSync(FILE);
  const file = { name: path.basename(FILE), size: buf.length, lastModified: 0,
    arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) };
  const products = await C.scanFile(file);
  check(`the picker gets products (${products.length})`, products.length > 0);
  check('every product has a gender', products.every((p) => ['Mens', 'Womens', 'Unisex'].includes(p.gender)),
    products.filter((p) => !['Mens', 'Womens', 'Unisex'].includes(p.gender)).slice(0, 3).map((p) => p.name));
  check('every colorway has a handle', products.every((p) => p.colorways.every((c) => !!c.handle)));
  const handles = products.flatMap((p) => p.colorways.map((c) => c.handle));
  eq('no duplicate handles', handles.length - new Set(handles).size, 0);
  check('inventory is counted', products.reduce((t, p) => t + p.totalInventory, 0) > 0);

  await C.convert(file);
  check(`inventory rows built (${C.inventoryData.length})`, C.inventoryData.length > 0);
  check('every row has a SKU', C.inventoryData.every((r) => !!r.SKU));
  check('every row has a barcode', C.inventoryData.every((r) => !!r.Barcode));
  check('every quantity is a finite number', C.inventoryData.every((r) => Number.isFinite(r['On hand (new)'])));
  check('every row is Needham scoped', C.inventoryData.every((r) => r.Location === 'Needham'));
  const prices = C.productVariantData.map((e) => parseFloat(e[1].price)).filter((n) => Number.isFinite(n));
  check(`prices are RETAIL, never wholesale (min $${Math.min(...prices)})`, Math.min(...prices) >= 90,
    { min: Math.min(...prices) });
  const csv = C.generateNewProductCSV({ newProducts: [], newColorways: handles.slice(0, 3).map((h) => ({ handle: h })) });
  check('the new product CSV uses the Matrixify header', !!csv && csv.split('\n')[0].includes('"URL handle"'));
  check('and not the legacy one, which fails silently in Stage 4', !!csv && !csv.split('\n')[0].includes('"Variant SKU"'));
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
