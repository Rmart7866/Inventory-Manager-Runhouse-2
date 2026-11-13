// tools/strip-wholesale.mjs: the wholesale columns go, retail stays, nothing
// else moves. Made-up workbooks of the real column shapes (WHSL on two
// sheets for Wolverine, "Wholesale Price" for the ATS exports); no supplier
// data belongs in this public repo. Run: node test/strip-wholesale.mjs
// House style: no em dashes.
import { createRequire } from 'node:module';
import { stripWholesale, wholesaleColumns, WHOLESALE_RE } from '../tools/strip-wholesale.mjs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const book = (sheets) => { const wb = XLSX.utils.book_new(); for (const [n, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), n); return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); };
const read = (buf) => { const wb = XLSX.read(buf); const o = {}; for (const n of wb.SheetNames) o[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }); return o; };

console.log('\nWolverine shape: WHSL on both sheets, MSRP kept');
const wol = book({
  UPCs: [['Style', 'Color', 'Dim 2', 'Size', 'UPC', 'WHSL', 'MSRP', 'On Hand'], ['X00001', '10', 'M', '05.0', '0195019000001', 1, 2, '50+'], ['X00001', '10', 'W', '10.5', '0195019000002', 1, 2, 3]],
  Styles: [['Style', 'Name', 'WHSL', 'MSRP', 'Season', 'Gender', 'Cat'], ['X00001', 'Example Shoe', 1, 2, 'AW26', 'M', 'Run']],
});
const w = stripWholesale(wol);
const wr = read(w.buf);
ok(w.removed.length === 2 && w.removed.every((r) => /WHSL$/.test(r)), 'WHSL removed from both sheets', w.removed);
ok(!wr.UPCs[0].includes('WHSL') && !wr.Styles[0].includes('WHSL'), 'no WHSL header left anywhere');
ok(wr.UPCs[0].includes('MSRP') && wr.Styles[0].includes('MSRP'), 'MSRP kept on both sheets');
ok(wr.UPCs[1][3] === '05.0' && wr.UPCs[1][6] === '50+', 'a zero padded size and a "50+" stay text');
ok(wr.UPCs[1][4] === '0195019000001', 'a UPC stays text, leading zero kept');
ok(JSON.stringify(wr.UPCs[2]) === JSON.stringify(['X00001', '10', 'W', '10.5', '0195019000002', 2, 3]), 'every other cell is unchanged and in order', wr.UPCs[2]);

console.log('\nATS shape: "Wholesale Price" goes, "Retail Price" and "Retail Date" stay');
const ats = book({ 'Master  ATS': [['Style Name', 'Style Number', 'Size', 'UPC/EAN', 'SKU', 'Wholesale Price', 'Retail Price', 'Retail Date', 'Quantity Available'], ['Example', '000001', '9', '4099683000000', '000001-01-9', 1, 2, 46000, '99+']] });
const a = read(stripWholesale(ats).buf)['Master  ATS'];
ok(!a[0].includes('Wholesale Price') && a[0].includes('Retail Price') && a[0].includes('Retail Date'), 'wholesale gone, both retail columns kept', a[0]);
ok(a[1].join('|') === 'Example|000001|9|4099683000000|000001-01-9|2|46000|99+', 'the row closes up around the removed cell', a[1]);

console.log('\nThe deny list');
for (const h of ['WHSL', 'Wholesale Price', 'wholesale', 'Unit Cost', 'Dealer Price', 'Net Price', 'Landed Cost']) ok(WHOLESALE_RE.test(h), 'removes "' + h + '"');
for (const h of ['MSRP', 'Retail Price', 'Retail Date', 'SRP', 'Quantity Available', 'Costume Size', 'Network']) ok(!WHOLESALE_RE.test(h), 'keeps "' + h + '"');
ok(wholesaleColumns(stripWholesale(ats).buf).length === 0 && wholesaleColumns(ats).length === 1, 'the after-check sees what the strip removed');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
