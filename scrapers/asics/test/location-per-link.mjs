// location-per-link.mjs, The Run House.
//
// The ASICS URL list can send some products to a different Shopify location.
//
// WHY THIS EXISTS. Nearly every ASICS link is dropship footwear counted at
// Needham, and locationName was hardcoded to 'Needham' in four places with the
// UI field marked LOCKED. But the Rival II singlets (TF3085 men's, TF2934
// women's) are race merch blanks held at the WAREHOUSE and printed to order:
// 91 Shopify listings draw on those two styles. They come from the same portal
// in the same scrape, so a per-run location would mean two separate runs and a
// standing chance of pointing one at the wrong place. Writing 300 singlets into
// Needham would look exactly like real dropship stock.
//
// A line with no location still reads Needham, so every existing list keeps
// working untouched. That is the property this file mostly guards.
//
// Run: node scrapers/asics/test/location-per-link.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

// ---- the URL list parser, lifted from startAutoScraping -------------------
function parseList(urlInput) {
  const urlLines = urlInput.split('\n').map((l) => l.trim()).filter((l) => l && l.startsWith('http'));
  const urls = [], locationByUrl = {};
  urlLines.forEach((line) => {
    const parts = line.split(/\s+/);
    const url = parts[0];
    const loc = parts.slice(1).join(' ').trim();
    urls.push(url);
    if (loc) locationByUrl[url] = loc;
  });
  return { urls, locationByUrl };
}

const SAMPLE = [
  'https://b2b.asics.com/orders/100671391/products/ZK1234',
  'https://b2b.asics.com/orders/100671391/products/TF3085?colorCode=23  Warehouse',
  '   ',
  'not a url at all',
  'https://b2b.asics.com/orders/100671391/products/TF2934?colorCode=01   Warehouse',
  'https://b2b.asics.com/orders/100671391/products/1011B890',
].join('\n');

const { urls, locationByUrl } = parseList(SAMPLE);

console.log('\nThe list still parses the way it always did');
eq('4 usable urls, the blank and the non-url dropped', urls.length, 4);
eq('a plain line keeps its url intact', urls[0], 'https://b2b.asics.com/orders/100671391/products/ZK1234');
eq('a line WITH a location keeps only the url',
  urls[1], 'https://b2b.asics.com/orders/100671391/products/TF3085?colorCode=23');
eq('urls stays an array of strings, so the navigation loop is untouched',
  typeof urls[0], 'string');

console.log('\nOnly the lines that asked for a location get one');
eq('TF3085 -> Warehouse', locationByUrl['https://b2b.asics.com/orders/100671391/products/TF3085?colorCode=23'], 'Warehouse');
eq('TF2934 -> Warehouse', locationByUrl['https://b2b.asics.com/orders/100671391/products/TF2934?colorCode=01'], 'Warehouse');
eq('a plain line is absent from the map', locationByUrl['https://b2b.asics.com/orders/100671391/products/ZK1234'], undefined);
eq('only two entries in the map', Object.keys(locationByUrl).length, 2);

// ---- locationForScrapedUrl, ON THE REAL CLASS -----------------------------
//
// THE OLD VERSION OF THIS TEST IS WHY THE BUG SHIPPED. It pulled the method's
// TEXT out of content.js with a regex and ran it as a standalone function, so
// it proved the logic was right and proved nothing about whether anything could
// CALL it. The method was defined inside UnifiedShopifyConverter while its only
// caller sits on EnhancedASICSInventoryExtractor, so every real scrape threw
// "TypeError: this.locationForScrapedUrl is not a function" right after
// extracting its rows, and this test stayed green through all of it.
//
// So: load the actual class and call the actual method on an instance of it.
const cut = src.indexOf('function initializeExtractor()');
const Extractor = new Function('window', 'document', 'sessionStorage', 'console',
  src.slice(0, cut) + '\nreturn EnhancedASICSInventoryExtractor;'
)({ location: { pathname: '/', href: '' }, addEventListener() {} },
  { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }),
    head: { appendChild() {} }, querySelector: () => null, querySelectorAll: () => [] },
  { getItem: () => null, setItem() {} },
  { log() {}, warn() {}, error() {} });

const instance = Object.create(Extractor.prototype);
typeof instance.locationForScrapedUrl === 'function'
  ? ok('locationForScrapedUrl is callable on EnhancedASICSInventoryExtractor')
  : bad('locationForScrapedUrl is NOT on the extractor, so every scrape throws on it');

// And it must NOT be on the converter, where it cannot be reached.
const Converter = new Function('window', 'document', 'console',
  src.slice(0, cut) + '\nreturn UnifiedShopifyConverter;'
)({ location: { pathname: '/', href: '' } }, { addEventListener() {} }, { log() {}, warn() {} });
typeof Object.create(Converter.prototype).locationForScrapedUrl === 'undefined'
  ? ok('and it is not left behind on UnifiedShopifyConverter')
  : bad('it is still on the converter, where nothing calls it');

const lookup = (config, href) => instance.locationForScrapedUrl(config, href);

console.log('\nThe lookup survives the portal rewriting the address');
// CONVENTION: currentIndex is the index of the line BEING SCRAPED, because
// config.currentIndex++ runs after extraction, not before. The fixtures below
// used to pair currentIndex 1 with urls[0]'s href, which is the off-by-one
// this function shipped with.
eq('matches on the url the run was TOLD to visit',
  lookup({ urls, locationByUrl, currentIndex: 1 },
    'https://b2b.asics.com/orders/100671391/products/TF3085?colorCode=23&deliveryDate=2026-10-24'), 'Warehouse');
eq('matches on the path when the index is out of range (resumed run)',
  lookup({ urls, locationByUrl, currentIndex: 99 },
    'https://b2b.asics.com/orders/100671391/products/TF2934?colorCode=01&deliveryDate=2026-10-23'), 'Warehouse');
eq('a footwear url gets NO location, so the row falls back to Needham',
  lookup({ urls, locationByUrl, currentIndex: 0 },
    'https://b2b.asics.com/orders/100671391/products/ZK1234?colorCode=50'), '');

// THE REGRESSION THAT MATTERS. urls[3] is footwear listed straight after a
// Warehouse line, and the off-by-one handed it urls[2]'s location, so a
// footwear style's stock would have been written to the Warehouse. It was
// harmless only because the two real singlets happen to sit last in the live
// list, which is one reordering away from not being true.
eq('footwear listed AFTER a Warehouse line does not inherit Warehouse',
  lookup({ urls, locationByUrl, currentIndex: 3 },
    'https://b2b.asics.com/orders/100671391/products/1011B890?colorCode=001'), '');
// and the line before one, for the same reason in the other direction
eq('a Warehouse line still gets Warehouse when a plain line precedes it',
  lookup({ urls, locationByUrl, currentIndex: 2 },
    'https://b2b.asics.com/orders/100671391/products/TF2934?colorCode=01'), 'Warehouse');
eq('an empty map is cheap and returns nothing',
  lookup({ urls: [], locationByUrl: {}, currentIndex: 1 }, 'https://b2b.asics.com/x'), '');
eq('a config with no map at all does not throw', lookup({}, 'https://b2b.asics.com/x'), '');

console.log('\nThe CSV row builder prefers the variant location');
const row = /variant\.locationName \|\| csvSettings\.locationName \|\| 'Needham'/.test(src);
row ? ok("row reads variant.locationName, then the run setting, then Needham")
    : bad('the row builder no longer prefers variant.locationName');

// AND THE ONE THAT MATTERS IS IN background.js.
//
// content.js has a converter, but the file staff actually import is rebuilt
// from the stored chunks by UnifiedCSVManager.convertToInventoryCSV, and that
// one had 'Needham' written into the Location column as a literal. So the per
// line location was being carried all the way to the export and then dropped
// at the last step, silently, with the CSV looking completely normal. This
// RUNS the background converter rather than reading it.
console.log('\nThe background converter is the one that writes the file');
{
  const bgSrc = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');
  const cut = bgSrc.indexOf('const csvManager = new UnifiedCSVManager()');
  if (cut < 0) { bad('could not find where background.js stops being class definitions'); }
  else {
    const Manager = new Function('chrome', 'console',
      bgSrc.slice(0, cut) + '\nreturn UnifiedCSVManager;'
    )({ runtime: { onMessage: { addListener() {} } } }, { log() {}, warn() {}, error() {} });
    const mgr = Object.create(Manager.prototype);

    const base = {
      styleId: 'TF3085', productName: "Men's Rival II Singlet", colorCode: '90',
      colorName: 'BLACK', gender: 'Men', width: { code: 'D', name: 'Standard', isWide: false },
    };
    const csv = mgr.convertToInventoryCSV([
      { ...base, sizeUS: 'S', quantity: 161, locationName: 'Warehouse' },
      { ...base, sizeUS: 'M', quantity: 205, locationName: 'Warehouse' },
      // A footwear line in the same run, with no location on it.
      { ...base, styleId: 'ZK1234', productName: 'NOVABLAST 5', sizeUS: '9', quantity: 4 },
    ]);
    const lines = csv.split('\n');
    const locIdx = 11;   // Handle,Title,O1N,O1V,O2N,O2V,O3N,O3V,SKU,HS,COO,Location
    eq('the header still names Location in column 12', lines[0].split(',')[11], 'Location');
    const singlets = lines.slice(1).filter((l) => l.indexOf('TF3085') !== -1 || l.toLowerCase().indexOf('rival') !== -1);
    const shoes = lines.slice(1).filter((l) => l.indexOf('ZK1234') !== -1 || l.toLowerCase().indexOf('novablast') !== -1);
    eq('both singlet rows are there', singlets.length, 2);
    eq('the singlet rows say Warehouse', singlets.every((l) => l.split(',')[locIdx] === 'Warehouse'), true);
    eq('and the real quantity survives, not the page cap', singlets.some((l) => l.trim().endsWith('205')), true);
    eq('the footwear row is there', shoes.length, 1);
    eq('and still says Needham', shoes[0].split(',')[locIdx], 'Needham');
    eq('so one run can carry both', new Set(lines.slice(1).map((l) => l.split(',')[locIdx])).size, 2);
  }
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
