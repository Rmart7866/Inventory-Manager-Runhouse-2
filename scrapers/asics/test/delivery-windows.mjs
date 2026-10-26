// delivery-windows.mjs, The Run House.
//
// availability[] IS ONE ENTRY PER DELIVERY WINDOW, NOT CHUNKS TO CONCATENATE.
//
// Each entry carries what ASICS can ship on its own atpDate, and the later
// windows are mostly zeros. recordsFromAvailability looped all of them and
// pushed a record per window with no dedupe. A Shopify inventory CSV applies
// the LAST row it sees for a variant, so the zeros won.
//
// Measured on the real output of the fast scrape,
// asics-inventory-api-2026-10-14_1205.csv:
//
//     39,131 rows for 8,037 unique variants
//     5,703 variants duplicated, up to 15 times
//     3,066 variants whose LAST row was 0 while an earlier row was not
//
// Importing that file zeroed three thousand shoes that had stock. On real
// styles: TF3085 Red Medium is 302 in the first window and 0 in the next two;
// 1011C244 size 10.5 is 173 now, 83 in November and 0 in four later windows.
//
// Run: node scrapers/asics/test/delivery-windows.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const raw = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const cut = raw.indexOf('function initializeExtractor()');
const Extractor = new Function('window', 'document', 'sessionStorage', 'console',
  raw.slice(0, cut) + '\nreturn EnhancedASICSInventoryExtractor;'
)({ location: { pathname: '/', href: '' }, addEventListener() {} },
  { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} },
    querySelector: () => null, querySelectorAll: () => [] },
  { getItem: () => null, setItem() {} }, { log() {}, warn() {}, error() {} });
const x = Object.create(Extractor.prototype);

const COLORWAYS = [{
  itemCode: '1011C244', itemName: 'SONICBLAST 2', colorCode: '100', colorName: 'WHITE',
  gender: 1, width: 'D', widthTranslationCode: 'standard', widthLabel: 'Standard (D)', compactSizes: '',
}];
const win = (date, qty) => ({ atpType: null, atpDate: date, date: date,
  stock: { '100': [{ sizeUS: '10.5', quantityAvailable: qty, variantNo: '1', sorting: 1 }] } });

console.log('\nSix windows, the real shape, must give ONE row');
{
  const recs = x.recordsFromAvailability({ availability: [
    win('2026-10-24', 173), win('2026-11-11', 83), win('2026-12-01', 0),
    win('2027-03-01', 0), win('2027-03-24', 0), win('2027-05-28', 0),
  ] }, COLORWAYS);
  eq('one row, not six', recs.length, 1);
  eq('and it is the at once figure', recs[0].quantity, 173);
}

console.log('\nThe zero that used to win must not win');
{
  const recs = x.recordsFromAvailability({ availability: [win('2026-10-24', 302), win('2026-11-03', 0)] }, COLORWAYS);
  eq('one row', recs.length, 1);
  eq('302, not 0', recs[0].quantity, 302);
}

console.log('\nThe window is chosen by DATE, not by array position');
{
  // Nothing documents the order, so a reversed response must still work.
  const recs = x.recordsFromAvailability({ availability: [win('2027-05-28', 0), win('2026-10-24', 161)] }, COLORWAYS);
  eq('still one row', recs.length, 1);
  eq('and still the earliest date', recs[0].quantity, 161);
}

console.log('\nDegenerate shapes');
{
  eq('a single window is unchanged', x.recordsFromAvailability({ availability: [win('2026-10-24', 7)] }, COLORWAYS)[0].quantity, 7);
  eq('no windows gives no rows', x.recordsFromAvailability({ availability: [] }, COLORWAYS).length, 0);
  eq('a missing availability key gives no rows', x.recordsFromAvailability({}, COLORWAYS).length, 0);
  eq('null does not throw', x.recordsFromAvailability(null, COLORWAYS).length, 0);
  // A genuine zero in the at once window is a real zero and must survive.
  eq('a real zero at once is still reported', x.recordsFromAvailability({ availability: [win('2026-10-24', 0), win('2026-11-11', 50)] }, COLORWAYS)[0].quantity, 0);
}

console.log('\nEvery colour and size in the chosen window still comes through');
{
  const many = { atpDate: '2026-10-24', date: '2026-10-24', stock: {
    '100': [{ sizeUS: '9', quantityAvailable: 4, sorting: 1 }, { sizeUS: '10', quantityAvailable: 5, sorting: 2 }],
    '400': [{ sizeUS: '9', quantityAvailable: 6, sorting: 1 }],
  } };
  const cw = COLORWAYS.concat([{ ...COLORWAYS[0], colorCode: '400', colorName: 'AQUA' }]);
  const recs = x.recordsFromAvailability({ availability: [many, win('2027-01-01', 0)] }, cw);
  eq('three rows, two colours', recs.length, 3);
  eq('no duplicates', new Set(recs.map((r) => r.colorCode + '|' + r.sizeUS)).size, 3);
}

console.log('\nThe source must not loop every block any more');
{
  const loops = /for \(const block of \(av && av\.availability\) \|\| \[\]\)/.test(raw);
  loops ? bad('it still iterates every delivery window') : ok('the loop over all windows is gone');
  const picks = /sort\(\(a, b\) =>[\s\S]{0,160}atpDate/.test(raw);
  picks ? ok('the earliest window is selected by date') : bad('no date based selection found');
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
