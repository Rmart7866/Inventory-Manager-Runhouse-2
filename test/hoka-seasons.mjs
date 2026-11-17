// HOKA's nightly report is EVERY in-season season joined (2026-11-16): the
// default season is whatever somebody last picked in the portal, and Bondi 9
// lives in a season of its own. Also the one day of date slack, because HOKA
// dates the report by its own clock. Made up rows only.
// Run: node test/hoka-seasons.mjs
// House style: no em dashes.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { mergeReports } from '../tools/hoka-headless-run.mjs';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const book = (rows) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'ATS Report'); return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); };
const H = ['Division', 'Sales Category', 'Seasonality', 'PLM Season', 'ATS Date', 'Product Name', 'Product Color', 'Product Number', 'Size', 'SKU', 'UPC', 'Available', 'Quantity'];
const row = (sku, q) => ["Men's", 'FOOTWEAR', 'x', 'x', '01/01/2026', 'M EXAMPLE 1', 'BLACK', 'X-BLK', '09D', sku, '000', '01/01/2026', q];

console.log('\nJoining the season reports');
const m = XLSX.read(mergeReports([book([H, row('A-1', 5), row('A-2', 6)]), book([H, row('B-1', 7)])]));
const rows = XLSX.utils.sheet_to_json(m.Sheets[m.SheetNames[0]], { header: 1 });
ok(rows.length === 4 && rows[3][9] === 'B-1', 'one header, every season\'s rows after it', rows.length);
ok(JSON.stringify(rows[0]) === JSON.stringify(H), 'the header is kept as is, the converter reads by position');
let threw = false;
try { mergeReports([book([H, row('A-1', 5)]), book([H.slice().reverse(), row('B-1', 7)])]); } catch (e) { threw = true; }
ok(threw, 'reports with different columns are refused, never joined');

console.log('\nThe runner asks for every in-season season, never the default');
const src = fs.readFileSync(new URL('../tools/hoka-headless-run.mjs', import.meta.url), 'utf8');
ok(/in-\?season/.test(src) && !/rows\.find\(\(x\) => x\.defaultSeason\) \|\| rows\[0\]/.test(src), 'seasons are chosen by type, not by "default"');
ok(/A partial set is never used/.test(src), 'a missing season report is a refusal, not a smaller file');

console.log('\nHOKA dates the report by its own clock');
const sb = { console: { log() {}, warn() {}, error() {} }, module: { exports: {} } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../hoka-converter.js', import.meta.url), 'utf8') + '\n;globalThis.__C = HokaConverter;', sb);
const fmt = (d) => (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
ok(sb.__C.isAvailableNow(day(0)), 'today is available');
ok(sb.__C.isAvailableNow(day(1)), 'tomorrow (the server\'s day after 7 PM Eastern) is available');
ok(!sb.__C.isAvailableNow(day(3)), 'three days out is still future stock');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
