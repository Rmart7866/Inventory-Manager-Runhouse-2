// brooks-full-catalog.mjs, The Run House.
//
// The Brooks "Full catalog" button (2026-11-12) reads FastTrack's own stock
// feed instead of 89 pages: every style shippable now, shoes and apparel, in
// about 90 seconds, written as ONE file the tool takes like HOKA's ATS report.
// Every rule that decides a number is pinned here with the REAL code:
//   scrapers/brooks/content.js     the feed reply to page identical records
//   scrapers/brooks/background.js  the CSV builder both paths share
//   brooks-converter.js            alignToStore, the store's own SKUs
//
// Run: node test/brooks-full-catalog.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : bad(m, { got: a, want: b }));
const yes = (m, c, x) => (c ? ok(m) : bad(m, x));
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

const src = read('scrapers/brooks/content.js');
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } };
const H = vm.runInNewContext(['brooksNowQuantity', 'brooksFeedQuantity', 'brooksFeedGender', 'brooksRetailPrice', 'brooksCatalogRecords']
  .map(fnSrc).join('\n') + '\n;({brooksNowQuantity, brooksFeedQuantity, brooksFeedGender, brooksRetailPrice, brooksCatalogRecords})');

const NOW = Date.parse('2026-11-12T15:30:00Z');
const iso = (ms) => new Date(ms).toISOString();

// ---------- 1. which stock counts ----------
console.log('\nOnly stock shippable now counts, the way the page grid shows it');
eq('NOW counts and FUTURE never does (the ASICS delivery window bug)',
  H.brooksNowQuantity([{ orderType: 'NOW', quantity: 335, availableFromDateUtc: iso(NOW) }, { orderType: 'FUTURE', quantity: 900, availableFromDateUtc: '2027-05-01T07:00:00Z' }], NOW + 3600e3), 335);
eq('NOW stock arriving next week is not shippable today (MD 2 White/Spark, 2026-11-16)',
  H.brooksNowQuantity([{ orderType: 'NOW', quantity: 7, availableFromDateUtc: '2026-11-16T08:00:00Z' }], NOW + 3600e3), 0);
eq('an entry stamped a few seconds after the sweep began still counts (the 3,866 unit mistake)',
  H.brooksNowQuantity([{ orderType: 'NOW', quantity: 17, availableFromDateUtc: iso(NOW + 90e3) }], NOW + 3600e3), 17);
yes('the cutoff is taken per request, never once for the whole sweep',
  /brooksCatalogRecords\(product, retail\[list\[i\]\], Date\.now\(\)\)/.test(src) && /const cutoff = \(nowMs \|\| Date\.now\(\)\) \+ 3600e3/.test(src));

console.log('\nThe 100 cap and the low stock rounding are the page path\'s, exactly (owner: keep the cap)');
eq('335 is written as 100, as the grid\'s "100+" is', H.brooksFeedQuantity(335), 100);
eq('3 or fewer is 0, 4 to 10 is 1, above 10 is itself', [0, 3, 4, 10, 11, 50].map(H.brooksFeedQuantity), [0, 0, 1, 1, 11, 50]);
const sec = vm.runInNewContext('(' + (() => { const i = src.indexOf('    applyInventorySecurity(quantity) {'); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return 'function ' + src.slice(i + 4, k + 1); } })() + ')');
yes('and agrees with the page\'s own applyInventorySecurity below the cap',
  [0, 1, 3, 4, 7, 10, 11, 64, 99].every((q) => sec(q) === H.brooksFeedQuantity(q)));

console.log('\nGender and price');
eq('the feed\'s gender words, WOMEN tested before MEN', ['Womens', 'Mens', 'Unisex', ''].map(H.brooksFeedGender), ['WOMEN', 'MEN', 'UNISEX', 'UNISEX']);
const prices = [{ key: { productId: '110511066' }, value: [
  { validityDateFromUtc: '2025-01-01T00:00:00Z', validityDateToUtc: '2025-12-31T00:00:00Z', rrpMin: 150, wspMin: 1 },
  { validityDateFromUtc: '2026-01-01T00:00:00Z', validityDateToUtc: '2027-12-31T00:00:00Z', rrpMin: 170, wspMin: 2 }] }];
eq('the retail price in force now, not last year\'s', H.brooksRetailPrice(prices, NOW), '170.00');
eq('no price is an empty string, never a guess', H.brooksRetailPrice([], NOW), '');
yes('wholesale is never read: the function names no wsp field', !/wsp/i.test(fnSrc('brooksRetailPrice')));

// ---------- 2. records identical to a page scrape ----------
console.log('\nA feed reply becomes the records a page scrape builds');
const leaf = (size, width, q, extra = []) => ({ productId: 'x', attributes: width ? { size, width } : { size }, inventoryItems: [{ orderType: 'NOW', quantity: q, availableFromDateUtc: iso(NOW) }, ...extra] });
const shoe = {
  productId: '110511', title: 'Ghost Max 4 SE', attributes: { gender: 'Mens' },
  children: [
    { colorCode: '066', attributes: { color: 'OysterMushroom/Alloy/Cloud', colorcode: '066' }, title: '066 - OysterMushroom/All',
      children: [leaf('7.0', 'D', 17), leaf('7.5', 'D', 2), leaf('7.0', '2E', 0), leaf('7.5', '2E', 0)] },
  ],
};
const recs = H.brooksCatalogRecords(shoe, '170.00', NOW);
eq('a width with no stock in any size is left out, as the page leaves out an unavailable colour', recs.map((r) => r.width), ['D', 'D']);
eq('style is the colourway\'s own 9 digit code, colour and name from the feed', [recs[0].styleId, recs[0].colorCode, recs[0].colorName], ['110511066', '066', 'OysterMushroom/Alloy/Cloud']);
eq('quantities are rounded the page\'s way, 17 stays, 2 becomes 0', recs.map((r) => r.availableQuantity), [17, 0]);
eq('gender, name, MSRP and size carried like the page record', [recs[0].gender, recs[0].productName, recs[0].msrp, recs[0].size, recs[0].sizeUS], ['MEN', 'Ghost Max 4 SE', '170.00', '7.0', '7.0']);
const garment = { productId: '221754', title: 'Dash 2-in-1 Short', attributes: { gender: 'Womens' },
  children: [{ colorCode: '456', attributes: { color: 'Halogen Blue' }, children: [leaf('XS', '', 40), leaf('M', '', 12)] }] };
const g = H.brooksCatalogRecords(garment, '58.00', NOW);
eq('a garment has no width and a size word', g.map((r) => [r.size, r.width, r.gender]), [['XS', '', 'WOMEN'], ['M', '', 'WOMEN']]);

// The background's CSV builder, the one BOTH paths use.
const chromeStub = { runtime: { onMessage: { addListener() {} }, onStartup: { addListener() {} }, onInstalled: { addListener() {} } },
  storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } }, downloads: { download: async () => {} }, tabs: { query: async () => [] } };
const bsb = { console: { log() {}, warn() {}, error() {} }, chrome: chromeStub, setTimeout, Date, encodeURIComponent };
vm.createContext(bsb);
const bg = read('scrapers/brooks/background.js');
vm.runInContext(bg + '\n;globalThis.M = brooksCSVManager;', bsb);
const csv = bsb.M.convertToBrooksInventoryCSV([...recs, ...g]).split('\n');
const head = csv[0].split(',');
const at = (line, col) => line.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, ''))[head.indexOf(col)];
eq('the same SKUs a page scrape writes, shoe and garment', csv.slice(1).map((l) => at(l, 'SKU')), ['110511066-066-750-D', '110511066-066-755-D', '221754456-456-XS', '221754456-456-M']);
eq('the MSRP column carries the retail price', at(csv[1], 'MSRP'), '170.00');
yes('the full catalog is ONE file through its own action, never the 10,000 row chunks',
  /message\.action === 'downloadFullCatalog'/.test(bg) && /brooks-fullcatalog-\$\{stampForFilename\(\)\}\.csv/.test(bg) && /sendToBackground\('downloadFullCatalog'/.test(src));

// ---------- 3. a partial sweep writes nothing ----------
console.log('\nA partial sweep, or no login, writes no file');
const run = (() => { const i = src.indexOf('    async runFullCatalog(btn) {'); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } })();
yes('any failed style refuses the file, and the refusal comes before the write',
  /if \(failed\.length\) \{[\s\S]*?return;\s*\}/.test(run) && run.indexOf('if (failed.length)') < run.indexOf("sendToBackground('downloadFullCatalog'"));
yes('no token, no run', /if \(!\(await this\.waitForBrooksToken\(20000\)\)\) \{[\s\S]*?return;/.test(run));
yes('no styles listed, no file', /if \(!styles\.size\) \{[^}]*return; \}/.test(run));
const manifest = JSON.parse(read('scrapers/brooks/manifest.json'));
const tokenEntry = manifest.content_scripts.find((c) => (c.js || []).includes('token.js'));
yes('token.js runs in the page\'s own world at document_start, FastTrack only',
  tokenEntry && tokenEntry.world === 'MAIN' && tokenEntry.run_at === 'document_start' && tokenEntry.matches.join() === '*://fasttrack.brooksrunning.com/*', tokenEntry);
const tok = read('scrapers/brooks/token.js');
yes('token.js only relays to its own window and never calls fetch itself',
  /window\.postMessage\(\{ source: 'rh-brooks-token', token: value \}, window\.location\.origin\)/.test(tok) && !/pageFetch\(\s*['"`]/.test(tok));

// ---------- 4. the tool aligns to the store's own SKUs ----------
console.log('\nThe tool writes each row under the SKU the live listing actually carries');
const store = new Set([
  '110496004-020-750-D', '110496015-020-750-D',   // Ghost Max 4, two listings of one colour
  '110496004-151-750-D',                           // only the 004 listing has this colour
  '1105111D066.070',                               // Brooks's own item number
  '221754001-456-M',                               // a garment under another prefix
  '110509020-020-750-D',                           // carried exactly as the file spells it
  '1104181D090',                                   // colourway level, names no size
].map((s) => s.toUpperCase()));
const sb = {
  console: { log() {}, warn() {}, error() {} }, setTimeout, Papa: { parse: () => ({ data: [] }) },
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } },
  CatalogClient: { existingSkus: (b) => (b === 'brooks' ? store : null) },
};
sb.window = sb; vm.createContext(sb);
vm.runInContext(read('brooks-converter.js') + '\n;globalThis.B = BrooksConverter;', sb);
const B = sb.B;
eq('three spellings, one identity', ['110496015-020-750-D', '1104961D020.075', '110496020-020-755-D'].map((s) => B._brooksKey(s)),
  ['110496|020|7.0|D', '110496|020|7.5|D', '110496|020|7.5|D']);
eq('widths: 1D is D, 2E stays 2E, garments have none', ['1105111D066.070', '1105112E066.070', '221754001-456-M'].map((s) => B._brooksKey(s)),
  ['110511|066|7.0|D', '110511|066|7.0|2E', '221754|456|M|']);
eq('a colourway level code and a garbage SKU never decode, so never match', [B._brooksKey('1104181D090'), B._brooksKey('ABC'), B._brooksKey('110496015-020-760-D')], [null, null, null]);
const row = (sku, q) => ({ Handle: 'h', Title: 'Ghost Max 4 - X', SKU: sku, 'On hand (new)': String(q) });
const aligned = B.alignToStore([row('110496020-020-750-D', 40), row('110496151-151-750-D', 9), row('110511066-066-750-D', 17), row('221754456-456-M', 12), row('110509020-020-750-D', 5), row('120999001-001-750-B', 3)]);
const bySku = Object.fromEntries(aligned.map((r) => [r.SKU, r['On hand (new)']]));
eq('a full catalog row reaches BOTH Ghost Max 4 listings of that colour', [bySku['110496004-020-750-D'], bySku['110496015-020-750-D']], ['40', '40']);
eq('and a colour only one listing carries reaches that one', bySku['110496004-151-750-D'], '9');
eq('Brooks\'s own item number on the store matches the scraper\'s spelling', bySku['1105111D066.070'], '17');
eq('a garment under another prefix matches', bySku['221754001-456-M'], '12');
eq('an exact SKU stays exactly as it was', bySku['110509020-020-750-D'], '5');
eq('a row no listing carries is kept as is: that is a new product', bySku['120999001-001-750-B'], '3');
eq('the feed spellings that were translated are gone, nothing is written twice',
  ['110496020-020-750-D', '110496151-151-750-D', '110511066-066-750-D', '221754456-456-M'].filter((s) => s in bySku), []);
eq('the counts say what happened', B.alignStats, { rows: 6, exact: 1, translated: 4, extraListings: 1, unmatched: 1 });
const exactWins = B.alignToStore([row('110496020-020-750-D', 40), row('110496015-020-750-D', 33)]);
eq('when the file carries a listing\'s SKU exactly, that row wins over a translated one',
  Object.fromEntries(exactWins.map((r) => [r.SKU, r['On hand (new)']])), { '110496004-020-750-D': '40', '110496015-020-750-D': '33' });
const bare = { ...sb, CatalogClient: undefined }; vm.createContext(bare);
vm.runInContext(read('brooks-converter.js') + '\n;globalThis.B = BrooksConverter;', bare);
eq('with no catalog loaded, rows pass through untouched', bare.B.alignToStore([row('110496020-020-750-D', 1)]).map((r) => r.SKU), ['110496020-020-750-D']);
const conv = read('brooks-converter.js');
yes('both scanFile and convert align before anything reads a SKU, and before allFeedSkus is built',
  (conv.match(/var allRows = self\.alignToStore\(parsed\.data\.filter/g) || []).length === 2 &&
  conv.indexOf('var allRows = self.alignToStore', conv.indexOf('convert: function')) < conv.indexOf('self.allFeedSkus = new Set()'));
yes('the page loads the new converter (cache buster bumped)', /brooks-converter\.js\?v=6"/.test(read('inventory.html')));

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
