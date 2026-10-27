// singlet-api-only.mjs, The Run House.
//
// THE SINGLETS GO THROUGH THE LINK LIST LIKE EVERYTHING ELSE, but their
// quantities come from the availability API rather than the rendered grid, and
// there is no fall back to the grid for them.
//
// Why they are special, and only they:
//
//   They are print on demand race merch. One blank is bought from ASICS per
//   order and held at the Warehouse, so supplier availability is the right
//   number, exactly like a dropship shoe. What differs is DEPTH: ASICS carries
//   these in the hundreds and the grid prints "30+" over 30, so a page scrape
//   writes 30 against a real 161 or 302.
//
// Why the missing fall back is the point, not an oversight:
//
//   tools/backfill-singlet-skus.mjs put SKUs on all 52 base variants, in the
//   format the converter generates, so a scraped singlet row now JOINS to a
//   real listing. Before that it matched nothing and was harmless. Now a quiet
//   fall back to the grid would overwrite a real 161 with a 30. Reading nothing
//   is recoverable; writing 30s over real stock is not.
//
// Run: node scrapers/asics/test/singlet-api-only.mjs
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
)({ location: { pathname: '/orders/100671391/products/TF3085', href: 'https://b2b.asics.com/orders/100671391/products/TF3085' }, addEventListener() {} },
  { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} },
    querySelector: () => null, querySelectorAll: () => [] },
  { getItem: () => null, setItem() {} }, { log() {}, warn() {}, error() {} });

// The real at-once figures measured on TF3085, 2026-10-23, and the later
// windows that must not win.
const AV = { availability: [
  { atpDate: '2026-10-24', date: '2026-10-24', stock: {
      '90': [{ sizeUS: 'S', quantityAvailable: 161, sorting: 10 },
             { sizeUS: 'M', quantityAvailable: 205, sorting: 11 },
             { sizeUS: 'L', quantityAvailable: 0,   sorting: 12 }],
      '23': [{ sizeUS: 'M', quantityAvailable: 302, sorting: 11 }] } },
  { atpDate: '2026-10-26', date: '2026-10-26', stock: {
      '90': [{ sizeUS: 'S', quantityAvailable: 0, sorting: 10 }] } },
] };

function make({ colors = [{ code: '90', name: 'BLACK' }, { code: '23', name: 'RED' }], basket = '100671391', apiThrows = null } = {}) {
  const x = Object.create(Extractor.prototype);
  x.calls = [];
  x.apiGet = async (url) => { x.calls.push(url); if (apiThrows) throw new Error(apiThrows); return AV; };
  x.apiWait = async () => {}; x.apiEased = () => {};
  x.findColors = () => colors;
  x.basketNoFromUrl = () => basket;
  x.getProductInfo = () => ({ productName: 'M RIVAL II SINGLET', styleId: 'TF3085', width: { code: 'D', name: 'Standard', isWide: false }, gender: "Men's" });
  return x;
}

console.log('\nThe style list is the whole of the difference');
{
  eq('TF3085 is API only', Extractor.API_ONLY_STYLES.indexOf('TF3085') !== -1, true);
  eq('TF2934 is API only', Extractor.API_ONLY_STYLES.indexOf('TF2934') !== -1, true);
  eq('a dropship shoe is NOT', Extractor.API_ONLY_STYLES.indexOf('1013A141'), -1);
  eq('and the list is only those two', Extractor.API_ONLY_STYLES.length, 2);
}

console.log('\nIt reads the at once window, uncapped');
{
  const x = make();
  const recs = await x.extractSingletInventoryFromApi('TF3085');
  eq('four rows from the first window only', recs.length, 4);
  const s = recs.find((r) => r.colorCode === '90' && r.sizeUS === 'S');
  eq('Black Small is the real 161, not the page cap', s.quantity, 161);
  eq('Black Medium is 205', recs.find((r) => r.colorCode === '90' && r.sizeUS === 'M').quantity, 205);
  eq('Red Medium is 302', recs.find((r) => r.colorCode === '23' && r.sizeUS === 'M').quantity, 302);
  eq('nothing sits at exactly 30', recs.some((r) => r.quantity === 30), false);
  eq('a genuine zero survives', recs.find((r) => r.sizeUS === 'L').quantity, 0);
  eq('the later window did not overwrite Small with 0', s.quantity, 161);
}

console.log('\nThe records carry what the SKU is built from');
{
  const x = make();
  const recs = await x.extractSingletInventoryFromApi('TF3085');
  const s = recs.find((r) => r.colorCode === '90' && r.sizeUS === 'S');
  eq('styleId', s.styleId, 'TF3085');
  eq('colorCode, two digits as the page prints it', s.colorCode, '90');
  eq('sizeUS, the ASICS token', s.sizeUS, 'S');
  // generateSKU in background.js builds style-code-size, which must equal the
  // SKU written onto the live listing by backfill-singlet-skus.mjs.
  eq('so the SKU joins', s.styleId + '-' + s.colorCode + '-' + s.sizeUS, 'TF3085-90-S');
  eq('colour name came off the page', s.colorName, 'BLACK');
}

console.log('\nOnly the colours the page shows are asked for');
{
  const x = make({ colors: [{ code: '90', name: 'BLACK' }] });
  await x.extractSingletInventoryFromApi('TF3085');
  const url = x.calls[0];
  eq('Black is requested', url.indexOf('90:') !== -1, true);
  eq('Red is not', url.indexOf('23:'), -1);
  eq('and the basket number is on the call', url.indexOf('basketNo=100671391') !== -1, true);
}

console.log('\nIt refuses rather than guessing');
{
  let threw = null;
  try { await make({ basket: '' }).extractSingletInventoryFromApi('TF3085'); } catch (e) { threw = e.message; }
  eq('no basket number throws', /basket number/.test(threw || ''), true);

  threw = null;
  try { await make({ colors: [] }).extractSingletInventoryFromApi('TF3085'); } catch (e) { threw = e.message; }
  eq('no colours throws', /colours/.test(threw || ''), true);

  threw = null;
  try { await make({ apiThrows: 'ASICS API 403' }).extractSingletInventoryFromApi('TF3085'); } catch (e) { threw = e.message; }
  eq('an API failure propagates', threw, 'ASICS API 403');
}

console.log('\nAnd the caller must NOT fall back to the capped grid');
{
  // The gate writes an empty array on failure and says why. If it ever calls
  // extractInventoryData for an API only style, a real 161 becomes a 30.
  // Just the API only branch, stopping at the else, or the slice would
  // include the footwear path and always look like a fall back.
  const from = raw.indexOf('API_ONLY_STYLES.indexOf(styleNow)');
  const gate = raw.slice(from, raw.indexOf('} else {', from));
  /extractInventoryData\(\)/.test(gate)
    ? bad('the API only branch can still reach the page grid')
    : ok('the API only branch never calls extractInventoryData');
  /inventoryData = \[\]/.test(gate) ? ok('it writes no rows on failure') : bad('no empty result on failure');
  /caps at 30/.test(gate) ? ok('and the error says why') : bad('the error does not explain itself');
}

console.log('\nFootwear still reads the page');
{
  const tail = raw.slice(raw.indexOf('} else {', raw.indexOf('API_ONLY_STYLES.indexOf(styleNow)')));
  /inventoryData = this\.extractInventoryData\(\);/.test(tail.slice(0, 200))
    ? ok('the else branch is the untouched DOM path')
    : bad('footwear no longer reads the page grid');
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
