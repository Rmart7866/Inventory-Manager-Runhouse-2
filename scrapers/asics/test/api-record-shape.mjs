// api-record-shape.mjs, The Run House.
//
// THE COLORWAYS HANDED TO recordsFromAvailability MUST BE CATALOG ROWS.
//
// extractInventoryDataFromApi was added so the link scraper would stop writing
// 30 where ASICS has 302. It read the right quantities and then threw away the
// product identity, because it built its colorway objects out of the PAGE:
//
//     { styleId, productName, gender: "Men's", width, colorCode, colorName }
//
// while recordsFromAvailability, written for the fast path, reads CATALOG row
// fields:
//
//     { itemCode, itemName, gender: 1, widthLabel, widthTranslationCode,
//       colorCode, colorName, compactSizes }
//
// Only colorName overlapped. So every record came back with styleId undefined,
// an empty product name and an empty gender, and because the array was not
// empty the DOM fallback never fired. The scrape ran, reported records, and
// produced nothing that could join to a Shopify product.
//
// quantity-cap.mjs did not catch this because it only regex matches the source
// for the presence of the function. This file RUNS it.
//
// Run: node scrapers/asics/test/api-record-shape.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

// Load the class without the extension's top level side effects: cut the file
// just before initializeExtractor(), which is where the DOM work starts.
const raw = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const cut = raw.indexOf('function initializeExtractor()');
if (cut < 0) { console.log('  FAIL  could not find initializeExtractor to cut at'); process.exit(1); }

const store = new Map();
const sandbox = {
  window: { location: { pathname: '/', href: 'about:blank' }, addEventListener() {} },
  document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, querySelector: () => null, querySelectorAll: () => [] },
  sessionStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  },
  console: { log() {}, warn() {}, error() {} },
};

const Extractor = new Function(
  'window', 'document', 'sessionStorage', 'console',
  raw.slice(0, cut) + '\nreturn EnhancedASICSInventoryExtractor;'
)(sandbox.window, sandbox.document, sandbox.sessionStorage, sandbox.console);

// ---------------------------------------------------------------- fixtures

// One catalog row per colorway, the shape /aac/products actually returns.
// TF3085 is the men's Rival II Singlet, the LA 2027 base garment.
const CATALOG = [
  {
    itemCode: 'TF3085', itemName: "Men's Rival II Singlet", colorCode: '90',
    colorName: 'BLACK', gender: 1, width: 'D', widthTranslationCode: 'standard',
    widthLabel: 'Standard (D)', collection: 3100,
    compactSizes: '#1001|@00123456789012|xS:#1002|@00123456789013|xM',
  },
  {
    itemCode: 'TF3085', itemName: "Men's Rival II Singlet", colorCode: '23',
    colorName: 'RED', gender: 1, width: 'D', widthTranslationCode: 'standard',
    widthLabel: 'Standard (D)', collection: 3100,
    compactSizes: '#1003|@00123456789014|xM',
  },
  // A colour on the same style that the page is NOT showing, plus an unrelated
  // style, so the filters have something to exclude.
  {
    itemCode: 'TF3085', itemName: "Men's Rival II Singlet", colorCode: '50',
    colorName: 'NAVY', gender: 1, width: 'D', widthTranslationCode: 'standard',
    widthLabel: 'Standard (D)', collection: 3100, compactSizes: '',
  },
  {
    itemCode: '1011B956', itemName: 'NOVABLAST 5', colorCode: '001',
    colorName: 'WHITE', gender: 2, width: 'B', widthTranslationCode: 'standard',
    widthLabel: 'Standard (B)', collection: 3100, compactSizes: '',
  },
];

// The real figures measured off TF3085 on 2026-10-23, the ones the page caps.
const AVAILABILITY = {
  availability: [{
    stock: {
      '90': [
        { sizeUS: 'S', quantityAvailable: 161, variantNo: '1001', sorting: 1 },
        { sizeUS: 'M', quantityAvailable: 205, variantNo: '1002', sorting: 2 },
      ],
      '23': [
        { sizeUS: 'M', quantityAvailable: 302, variantNo: '1003', sorting: 2 },
      ],
    },
  }],
};

function makeExtractor(pageColors) {
  // Object.create, not new: the constructor builds the floating Auto-Scrape
  // button and wires chrome.runtime listeners, none of which this is about.
  // The two methods under test touch neither the DOM nor the instance state.
  const x = Object.create(Extractor.prototype);
  x.apiCalls = [];
  x.apiGet = async (url) => {
    x.apiCalls.push(url);
    if (url.indexOf('/availability') !== -1) return AVAILABILITY;
    return { data: CATALOG };
  };
  x.apiWait = async () => {};
  x.apiEased = () => {};
  x.getProductInfo = () => ({ productName: "Men's Rival II Singlet", styleId: 'TF3085', width: { code: 'D', name: 'Standard' }, gender: "Men's" });
  x.basketNoFromUrl = () => '100671391';
  x.findColors = () => pageColors;
  return x;
}

// ------------------------------------------------- the bug, pinned directly

console.log('\nThe old hand built shape loses every identity field');
{
  const x = makeExtractor([]);
  const pageShaped = [
    { styleId: 'TF3085', colorCode: '90', colorName: 'BLACK', productName: "Men's Rival II Singlet", gender: "Men's", width: { code: 'D' } },
    { styleId: 'TF3085', colorCode: '23', colorName: 'RED', productName: "Men's Rival II Singlet", gender: "Men's", width: { code: 'D' } },
  ];
  const recs = x.recordsFromAvailability(AVAILABILITY, pageShaped);
  eq('it still returns rows, which is why this went unnoticed', recs.length, 3);
  eq('but the style id is missing', recs[0].styleId, undefined);
  eq('the product name is empty', recs[0].productName, '');
  eq('and the gender is empty', recs[0].gender, '');
}

console.log('\nA catalog row fills them in');
{
  const x = makeExtractor([]);
  const recs = x.recordsFromAvailability(AVAILABILITY, CATALOG.filter((r) => r.itemCode === 'TF3085'));
  eq('three size rows', recs.length, 3);
  eq('style id', recs[0].styleId, 'TF3085');
  eq('product name', recs[0].productName, "Men's Rival II Singlet");
  eq('gender, decoded from the numeric code', recs[0].gender, 'Men');
  eq('width name, gender aware', recs[0].width.name, 'Standard');
  const black = recs.find((r) => r.colorCode === '90');
  eq('colour name comes from the catalog row', black && black.colorName, 'BLACK');
  const barcoded = recs.filter((r) => r.barcode).length;
  eq('barcodes come off compactSizes', barcoded, 3);
}

// ------------------------------------------------- the function end to end

console.log('\nextractInventoryDataFromApi, end to end');
{
  const x = makeExtractor([{ code: '090', name: 'BLACK' }, { code: '023', name: 'RED' }]);
  const recs = await x.extractInventoryDataFromApi();
  eq('it returns records', Array.isArray(recs) && recs.length, 3);
  eq('every record carries the style', recs.every((r) => r.styleId === 'TF3085'), true);
  eq('every record carries the name', recs.every((r) => r.productName === "Men's Rival II Singlet"), true);
  eq('every record carries a gender', recs.every((r) => r.gender === 'Men'), true);
  const red = recs.find((r) => r.colorCode === '23' && r.sizeUS === 'M');
  eq('Red M is the REAL 302, not the page cap of 30', red && red.quantity, 302);
  eq('and nothing is sitting at exactly 30', recs.some((r) => r.quantity === 30), false);
}

console.log('\nThe page decides WHICH colours, the catalog decides what they are');
{
  const x = makeExtractor([{ code: '090', name: 'BLACK' }, { code: '023', name: 'RED' }]);
  await x.extractInventoryDataFromApi();
  const availUrl = x.apiCalls.find((u) => u.indexOf('/availability') !== -1);
  eq('Navy is on the style but not on the page, so it is not asked for', availUrl.indexOf('50:'), -1);
  eq('Black is', availUrl.indexOf('90:') !== -1, true);
  eq('Red is', availUrl.indexOf('23:') !== -1, true);
  eq('and the unrelated style never reaches the URL', availUrl.indexOf('1011B956'), -1);
}

console.log('\nLeading zeros, because the page prints 090 and the catalog says 90');
{
  const x = makeExtractor([{ code: '090', name: 'BLACK' }]);
  const recs = await x.extractInventoryDataFromApi();
  eq('"090" on the page matches "90" in the catalog', recs.length, 2);
  eq('so only Black comes back', recs.every((r) => r.colorCode === '90'), true);
}

console.log('\nA colour set that matches nothing must not read as no stock');
{
  // If the page markup changes and findColors starts returning something that
  // cannot be matched, falling through to every colour of the style is right.
  // Returning an empty array would be read downstream as out of stock.
  const x = makeExtractor([{ code: 'XYZ', name: 'NOT A CODE' }]);
  const recs = await x.extractInventoryDataFromApi();
  eq('it falls back to the whole style rather than to nothing', recs.length, 3);
}

console.log('\nGuards');
{
  const x = makeExtractor([{ code: '090', name: 'BLACK' }]);
  x.getProductInfo = () => ({ productName: 'Unknown Product', styleId: 'Unknown', width: {}, gender: '' });
  eq('the literal string "Unknown" style id is refused', await x.extractInventoryDataFromApi(), null);

  const y = makeExtractor([{ code: '090', name: 'BLACK' }]);
  y.basketNoFromUrl = () => '';
  eq('no basket number in the path is refused', await y.extractInventoryDataFromApi(), null);

  const z = makeExtractor([{ code: '090', name: 'BLACK' }]);
  z.getProductInfo = () => ({ productName: 'x', styleId: 'TF9999', width: {}, gender: '' });
  eq('a style the catalog does not carry is refused, so the DOM can try', await z.extractInventoryDataFromApi(), null);
}

console.log('\nThe catalog is fetched once, not once per page');
{
  store.clear();
  Extractor._catalogRows = null;
  Extractor._catalogBasket = null;
  const x = makeExtractor([{ code: '090', name: 'BLACK' }]);
  await x.extractInventoryDataFromApi();
  const first = x.apiCalls.filter((u) => u.indexOf('/aac/products?basketNo=') !== -1).length;
  eq('the first scrape fetches it', first, 1);

  // A fresh extractor is what the next link gets, because navigating tears the
  // content script down. sessionStorage is what carries the catalog across.
  Extractor._catalogRows = null;
  Extractor._catalogBasket = null;
  const y = makeExtractor([{ code: '090', name: 'BLACK' }]);
  const recs = await y.extractInventoryDataFromApi();
  const second = y.apiCalls.filter((u) => u.indexOf('/aac/products?basketNo=') !== -1).length;
  eq('the next link reads it back from sessionStorage', second, 0);
  eq('and still gets its records', recs.length, 2);
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
