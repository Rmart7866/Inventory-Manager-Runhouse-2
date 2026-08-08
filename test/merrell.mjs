// merrell.mjs, The Run House.
//
// Runs MerrellConverter against the REAL At Once export, because the things most
// likely to be wrong are facts about the file rather than logic: which column is
// the size, what "50+" means, and above all which size runs are women's. Merrell
// has no gender column, so a bad guess there mislabels a whole product line.
//
// Run: node test/merrell.mjs [path/to/CatalogUPCs-Merrell.xlsx]
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

const FILE = process.argv[2] || path.join(ROOT, 'CatalogUPCs-Merrell At Once .xlsx');

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const check = (m, c, x) => (c ? ok(m) : bad(m, x));
const eq = (m, a, b) => check(`${m} (${JSON.stringify(a)})`, a === b, { got: a, want: b });

// XLSX is a browser global in the app; the same library is what the tool loads.
let XLSX;
try { XLSX = require('xlsx'); } catch { XLSX = null; }

const sandbox = { console, module: { exports: {} }, XLSX };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'merrell-converter.js'), 'utf8'), sandbox);
const C = sandbox.MerrellConverter;

console.log('\nGender read off the size run');
// The shapes actually present in the file, measured across all 971 runs.
eq("5.0 to 11.0 is women's", C.genderFromSizeRun(5.0, 11.0), 'women');
eq("6.0 to 11.0 is women's too (SPEEDARC SURGE BOA)", C.genderFromSizeRun(6.0, 11.0), 'women');
eq("7.0 to 15.0 is men's", C.genderFromSizeRun(7.0, 15.0), 'men');
eq('3.5 to 15.0 is unisex (the SE styles)', C.genderFromSizeRun(3.5, 15.0), 'unisex');
eq('4.5 to 13.0 is unisex', C.genderFromSizeRun(4.5, 13.0), 'unisex');
eq('an empty run falls back to men', C.genderFromSizeRun(0, 0), 'men');
check("a 6.0 start is NOT men's, which a bottom-only rule would get wrong",
  C.genderFromSizeRun(6.0, 11.0) !== 'men');

console.log('\nSize labels');
eq('zero-padded 05.0 becomes 5.0', C.sizeLabel('women', '05.0'), '5.0');
eq('09.5 stays a half size', C.sizeLabel('men', '09.5'), '9.5');
eq('unisex gets the dual label', C.sizeLabel('unisex', '03.5'), 'M3.5/W5.0');

console.log('\nCapped quantities');
eq('"50+" counts as 100, same as Saucony', C._qty('50+'), 100);
eq('a plain number passes through', C._qty(7), 7);
eq('blank is zero', C._qty(''), 0);

console.log('\nHandles');
eq('women\'s', C.getProductHandle('MOAB SPEED 2 ALLURE', 'PETALITE', 'women', 'M'),
  'merrell-womens-moab-speed-2-allure-petalite');
eq('men\'s wide gets the suffix', C.getProductHandle('AGILITY PEAK 6', 'BLACK', 'men', 'W'),
  'merrell-mens-agility-peak-6-black-wide');
check('a handle is always legal', /^[a-z0-9-]+$/.test(
  C.getProductHandle('CHAM REDUX SE X HARRIS TWEED', 'DARK WALNUT/OLIVE', 'men', 'M')));

if (!XLSX) {
  console.log('\n  skip  the xlsx library is not installed, skipping the live-file checks');
} else if (!fs.existsSync(FILE)) {
  console.log(`\n  skip  ${path.basename(FILE)} is not on this machine`);
} else {
  console.log('\nAgainst the real export');
  const buf = fs.readFileSync(FILE);
  const recs = await C.parseExcel({ arrayBuffer: async () => buf });
  check('records parsed', recs.length > 900, recs.length);
  const g = recs.reduce((m, r) => { m[r.genderType] = (m[r.genderType] || 0) + 1; return m; }, {});
  console.log('    gender split:', JSON.stringify(g));
  check("both men's and women's are found", g.men > 300 && g.women > 300, g);
  check('every record has a style number', recs.every((r) => r.styleNumber));
  check('every record has sizes', recs.every((r) => r.sizes.length));
  check('every size carries a UPC', recs.every((r) => r.sizes.every((s) => s.upc)));

  // The women's lines are a real-world cross-check on the gender rule.
  const womensLine = /ALLURE|JELLY|SIREN|BRAVADA/i;
  const named = recs.filter((r) => womensLine.test(r.productName));
  const right = named.filter((r) => r.genderType === 'women').length;
  check(`women's-line names land on women's (${right} of ${named.length})`,
    named.length > 0 && right / named.length > 0.85, { named: named.length, right });

  // No unisex product should carry a plain numeric label, and no gendered one a dual label.
  const uni = recs.filter((r) => r.genderType === 'unisex');
  check('unisex sizes are dual-labelled', uni.every((r) => r.sizes.every((s) => /^M[\d.]+\/W[\d.]+$/.test(s.size))), uni[0]?.sizes[0]);
  const gen = recs.filter((r) => r.genderType !== 'unisex');
  check('gendered sizes are plain numbers', gen.every((r) => r.sizes.every((s) => /^\d+\.\d$/.test(s.size))));

  const inv = await C.convert({ arrayBuffer: async () => buf });
  check('convert produced rows', inv.length > 10000, inv.length);
  check('every row is at Needham', inv.every((r) => r.Location === 'Needham'));
  check('every row has a SKU', inv.every((r) => r.SKU));
  check('every row has a barcode', inv.every((r) => r.Barcode));
  check('quantities are numbers', inv.every((r) => typeof r['On hand (new)'] === 'number'));
  const units = inv.reduce((t, r) => t + r['On hand (new)'], 0);
  console.log(`    ${inv.length.toLocaleString()} rows, ${units.toLocaleString()} units`);
  check('allFeedSkus covers the whole file', C.allFeedSkus.size >= new Set(inv.map((r) => r.SKU)).size);

  const products = await C.scanFile({ arrayBuffer: async () => buf });
  check('picker products built', products.length > 100, products.length);
  check('each has colorways', products.every((p) => p.colorways.length));
  console.log(`    ${products.length} picker rows, e.g. "${products[0].name}" with ${products[0].colorways.length} colorway(s)`);

  // The whole point of the new-product CSV is Stage 4, so it must be well formed.
  const handles = [...new Set(inv.map((r) => r.Handle))].slice(0, 3);
  const csv = C.generateNewProductCSV({ newProducts: handles.map((h) => ({ handle: h })), newColorways: [] });
  check('new-product CSV generated', !!csv && csv.split('\n').length > 3);
  const hdr = csv.split('\n')[0];
  check('CSV declares Merrell as the vendor', csv.includes('"Merrell"'));
  check('CSV is draft only', csv.includes('"Draft"'));
  check('header has the expected column count', hdr.split('","').length === 57, hdr.split('","').length);
}

console.log('');
if (failures) { console.log(`MERRELL TESTS FAILED: ${failures}`); process.exit(1); }
console.log('Merrell converter OK.\n');
