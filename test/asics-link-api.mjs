// The ASICS link list from the data feed (tools/asics-headless-run.mjs
// --link-api, 2026-11-14) and the session check that guards every run.
//   - classifySession: alive, logged out, locked out, no network, from ASICS's
//     own answers, never from the address bar
//   - the zero fill: a size in the colourway's catalog run that the stock call
//     left out is written as 0 (as the product page shows it), named by the
//     REAL US size ("6.5"), never ASICS' size key ("6H")
//   - the fill is off for every other caller (Scrape All, full catalog)
// Run: node test/asics-link-api.mjs
// House style: no em dashes.
import fs from 'node:fs';
import vm from 'node:vm';
import { classifySession } from '../tools/asics-headless-run.mjs';

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };

console.log('\nThe session check reads ASICS, not the address bar');
ok(classifySession({ basket: 200, json: true, stock: 200 }).state === 'ok', 'basket 200 JSON is alive');
ok(classifySession({ basket: 401, json: true }).state === 'logged-out', 'basket 401 is logged out');
ok(classifySession({ basket: 200, json: false }).state === 'logged-out', 'an HTML answer (a login page) is logged out');
const lk = classifySession({ basket: 200, json: true, stock: 429, retryAfter: '17954' });
ok(lk.state === 'locked' && /until about/.test(lk.detail), 'a 429 asking for hours is a lockout, with when it lifts', lk);
ok(classifySession({ basket: 200, json: true, stock: 429, retryAfter: '5' }).state === 'ok', 'a short 429 is a throttle, not a lockout');
ok(classifySession({ basket: 'ERR TypeError: Failed to fetch' }).state === 'no-network', 'a thrown fetch is no network, not a logout');
ok(classifySession(null).state === 'no-network', 'no answer at all is no network');

console.log('\nThe zero fill');
const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop, setAttribute: noop, addEventListener: noop,
  querySelector: () => null, querySelectorAll: () => [], get textContent() { return ''; }, set textContent(v) {}, set innerHTML(v) {} });
const sb = { console: { log: noop, warn: noop, error: noop }, setTimeout: noop, setInterval: noop, clearInterval: noop,
  fetch: () => Promise.reject(new Error('no network in tests')), location: { href: 'https://b2b.asics.com/dashboard', pathname: '/dashboard' },
  navigator: { userAgent: '' }, performance: { now: () => 0 }, MutationObserver: class { observe() {} },
  document: { readyState: 'complete', addEventListener: noop, createElement: el, querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: noop, contains: () => false, removeChild: noop }, head: { appendChild: noop } } };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../scrapers/asics/content.js', import.meta.url), 'utf8') + '\n;globalThis.__X = EnhancedASICSInventoryExtractor;', sb);
const x = Object.create(sb.__X.prototype);
// One colourway whose catalog run is 6, 6.5, 7, 13.5; the stock call returns only 7.
const colorways = [{ itemCode: 'X0001', itemName: 'EXAMPLE', colorCode: '001', colorName: 'BLACK', gender: '1', width: 'D', widthTranslationCode: 'standard', widthLabel: 'Standard (D)',
  compactSizes: '|#V6|@100006|x6|u6:|#V65|@100065|x6H|u6.5:|#V7|@100007|x7|u7:|#V135|@100135|x13H|u13.5' }];
const av = { availability: [{ atpDate: '2026-11-14', stock: { '001': [{ variantNo: 'V7', quantityAvailable: 3, sizeKey: '7', sizeUS: '7', sorting: 3 }] } }] };
const filled = x.recordsFromAvailability(av, colorways, true);
const by = Object.fromEntries(filled.map((r) => [r.sizeUS, r.quantity]));
ok(by['7'] === 3, 'the real size keeps its real number', by);
ok(by['6'] === 0 && by['6.5'] === 0 && by['13.5'] === 0, 'every other catalog size is written as 0', by);
ok(!('6H' in by) && !('13H' in by), 'filled rows use the US size, never the "6H" key', Object.keys(by));
ok(filled.find((r) => r.sizeUS === '6.5').barcode === '100065', 'a filled row still carries its barcode');
ok(filled.length === 4, 'no size twice', filled.length);
const plain = x.recordsFromAvailability(av, colorways);
ok(plain.length === 1 && plain[0].sizeUS === '7', 'without the flag nothing is filled (Scrape All, full catalog unchanged)', plain.length);

// Wiring: only the link list turns it on, and the 1 AM job runs the link list.
const src = fs.readFileSync(new URL('../scrapers/asics/content.js', import.meta.url), 'utf8');
ok(/recordsFromAvailability\(av, colorways, FULL && Array\.isArray\(opts\.onlyStyles\) && opts\.onlyStyles\.length > 0\)/.test(src), 'the fill is on only when onlyStyles is given');
const nightly = fs.readFileSync(new URL('../tools/asics-fullcatalog-nightly.sh', import.meta.url), 'utf8');
ok(/asics-headless-run\.mjs --link-api\s*$/m.test(nightly), 'the 1 AM job runs --link-api');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
