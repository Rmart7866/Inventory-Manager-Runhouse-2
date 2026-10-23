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

// ---- locationForScrapedUrl, taken from the real file ----------------------
const m = /^\s*locationForScrapedUrl\(config, href\) \{[\s\S]*?\n    \}/m.exec(src);
if (!m) { bad('could not find locationForScrapedUrl in content.js'); process.exit(1); }
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext('var fn = function(config, href) {' + m[0].replace(/^\s*locationForScrapedUrl\(config, href\) \{/, '') .replace(/\}\s*$/, '') + '};', sandbox);
const lookup = sandbox.fn;

console.log('\nThe lookup survives the portal rewriting the address');
const cfg = { urls, locationByUrl, currentIndex: 2 };   // just scraped urls[1]
eq('matches on the url the run was TOLD to visit',
  lookup(cfg, 'https://b2b.asics.com/orders/100671391/products/TF3085?colorCode=23&deliveryDate=2026-10-24'), 'Warehouse');
eq('matches on the path when the index has moved on (resumed run)',
  lookup({ urls, locationByUrl, currentIndex: 99 },
    'https://b2b.asics.com/orders/100671391/products/TF2934?colorCode=01&deliveryDate=2026-10-23'), 'Warehouse');
eq('a footwear url gets NO location, so the row falls back to Needham',
  lookup({ urls, locationByUrl, currentIndex: 1 },
    'https://b2b.asics.com/orders/100671391/products/ZK1234?colorCode=50'), '');
eq('an empty map is cheap and returns nothing',
  lookup({ urls: [], locationByUrl: {}, currentIndex: 1 }, 'https://b2b.asics.com/x'), '');
eq('a config with no map at all does not throw', lookup({}, 'https://b2b.asics.com/x'), '');

console.log('\nThe CSV row builder prefers the variant location');
const row = /variant\.locationName \|\| csvSettings\.locationName \|\| 'Needham'/.test(src);
row ? ok("row reads variant.locationName, then the run setting, then Needham")
    : bad('the row builder no longer prefers variant.locationName');

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
