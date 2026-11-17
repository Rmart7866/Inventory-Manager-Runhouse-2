// Saucony apparel (2026-11-17): the Apparel At-Once catalog through the same
// converter as the shoes. A garment must never come out as a shoe, the shoes
// must come out exactly as before, and the nightly runner joins the two files
// by column name. Made-up rows and numbers only.
// Run: node test/saucony-apparel.mjs
// House style: no em dashes.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { mergeCatalogUPCs } from '../tools/wolverine-headless-run.mjs';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };

const book = (head, rows) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head].concat(rows)), 'UPCs'); return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); };
const SHOE_HEAD = ['Style #', 'Style', 'Color Description', 'NRF Color', 'SKU Code', 'UPC Code', 'Dim 1', 'Dim 2', 'WHSL', 'MSRP', 'On Hand', 'ATP Date 1', 'Future 1', 'ATP Date 2', 'Future 2', 'ATP Date 3', 'Future 3'];
const APP_HEAD = ['Style #', 'Style', 'Color Description', 'NRF Color', 'SKU Code', 'UPC Code', 'Dim 1', 'Dim 2', 'WHSL', 'MSRP', 'On Hand', 'ATP Date 1', 'Future 1'];
const shoe = (sz, q) => ['S20001-1', 'EXAMPLE RUNNER 1 - BLACK', 'BLACK', '001', 'x', '000000000001' + sz, sz, 'M', 1, 100, q, '', '', '', '', '', ''];
const garment = (style, name, sz, q) => [style, name, 'BLACK', '001', 'x', '1111' + style.slice(-3) + sz, sz, '00', 1, 50, q, '', ''];
const shoes = book(SHOE_HEAD, [shoe('07.0', 5), shoe('07.5', 6), shoe('08.0', 0)]);
const app = book(APP_HEAD, [
  garment('SAM800001-BK', 'EXAMPLE 5" SHORT - BLACK', 'M', 3), garment('SAM800001-BK', 'EXAMPLE 5" SHORT - BLACK', 'S', 2),
  garment('SAM800001-BK', 'EXAMPLE 5" SHORT - BLACK', 'XXL', 1), garment('SAM800001-BK', 'EXAMPLE 5" SHORT - BLACK', '2XL', 9),
  garment('SAW800002-BK', 'EXAMPLE SHORT SLEEVE - BLACK', 'M', 4),
  garment('SAU800003-BK', 'EXAMPLE HAT - BLACK', 'O/S', 7),
  garment('SAU800004-WH', 'EXAMPLE ARM SLEEVES - WHITE', 'S', 1),
]);

const load = () => {
  const sb = { console: { log() {}, warn() {}, error() {} }, XLSX, setTimeout };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(new URL('../on-converter.js', import.meta.url), 'utf8') + '\n' + fs.readFileSync(new URL('../saucony-converter.js', import.meta.url), 'utf8') + '\n;globalThis.__C = SauconyConverter;', sb);
  return sb.__C;
};
const file = (b) => ({ name: 'x.xlsx', arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) });

console.log('\nThe runner joins the two catalogs by column name');
const joined = mergeCatalogUPCs(shoes, [app]);
const jr = XLSX.utils.sheet_to_json(XLSX.read(joined).Sheets.UPCs, { header: 1 });
ok(jr.length === 1 + 3 + 7, 'one header, every shoe and garment row', jr.length);
ok(jr[4][0] === 'SAM800001-BK' && jr[4][10] === 3 && jr[4][6] === 'M', 'a garment row lands under the right columns despite fewer of them', jr[4]);

const C = load();
const prods = await C.scanFile(file(joined));
C.selectedProducts = new Set();
const inv = await C.convert(file(joined));
const by = (sku) => inv.find((r) => r.SKU === sku);

console.log('\nShoes are untouched');
ok(inv.filter((r) => r.SKU.startsWith('S20001')).length === 3 && by('S20001-1-7.5')['On hand (new)'] === 6, 'the shoe rows read as before', inv.filter((r) => r.SKU.startsWith('S2')).map((r) => r.SKU));
ok(prods.find((p) => !p.apparel) && !prods.find((p) => !p.apparel).name.includes('SHORT'), 'the shoe is a shoe product in the picker');

console.log('\nGarments');
ok(prods.filter((p) => p.apparel).length === 4, 'four garment products, all flagged apparel', prods.map((p) => p.name + ':' + p.apparel));
ok(by('SAM800001-BK-2XL') && by('SAM800001-BK-2XL')['On hand (new)'] === 1 && !by('SAM800001-BK-XXL'), 'XXL and 2XL are one size, the first row wins, no duplicate variant');
ok(by('SAU800003-BK-OS'), 'O/S is OS', inv.map((r) => r.SKU));
ok(prods.find((p) => /SHORT SLEEVE/.test(p.name)).gender === "Women's" && prods.find((p) => /HAT/.test(p.name)).gender === 'Unisex', 'gender from the SAM / SAW / SAU letter');
ok(C.apparelTypeFor('EXAMPLE SHORT SLEEVE') === 'T-Shirts' && C.apparelTypeFor('EXAMPLE 5" SHORT') === 'Shorts', 'a short sleeve is a T-shirt, a short is Shorts');
ok(C.apparelTypeFor('TRIUMPH SLEEVELESS') === 'Tanks' && C.apparelTypeFor('FORTIFY ARM SLEEVES') === 'Compression' && C.apparelTypeFor('FORTIFY LINED HALF TIGHT') === 'Tights/Leggings', 'sleeveless is a tank, arm sleeves are Compression, a half tight is a tight');
ok(C.isApparelStyle('SAW800482-FCH') && !C.isApparelStyle('S20934-1') && !C.isApparelStyle('S10981-1019'), 'the style number decides, a shoe never reads as a garment');

console.log('\nA new garment is never created as a shoe');
const handles = [...new Set(inv.map((r) => r.Handle))];
const csv = C.generateNewProductCSV({ newProducts: handles.map((h) => ({ handle: h })), newColorways: [] });
const recs = XLSX.utils.sheet_to_json(XLSX.read(csv, { type: 'string' }).Sheets.Sheet1);
const firsts = recs.filter((r) => r.Title);
const garmentRows = firsts.filter((r) => !/Runner/.test(r.Title));
ok(garmentRows.length === 4 && garmentRows.every((r) => !/shoes$/i.test(r.Type) && !/> Shoes$/.test(r['Product category'])), 'no garment carries a shoe type or the shoe category', garmentRows.map((r) => r.Type));
ok(garmentRows.every((r) => /(mens|womens|unisex) apparel/.test(r.Tags)), 'every garment carries the apparel collection tag', garmentRows.map((r) => r.Tags));
ok(firsts.find((r) => /Runner/.test(r.Title)).Type === "Men's Shoes", 'the shoe still comes out a shoe');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
