// The ON night runner loads the REAL scraper classes, cut at the
// "Bootstrapping" marker. If that marker moves, or the methods it calls
// change name, the runner would load the extension's page hooks or call
// nothing, so this pins the cut and the surface it relies on.
// Run: node test/on-headless.mjs
// House style: no em dashes.
import vm from 'node:vm';
import fs from 'node:fs';
import { extractorSource } from '../tools/on-headless-run.mjs';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if (!c) fails++; };

const src = extractorSource();
ok(/class ONRunningInventoryExtractor\b/.test(src), 'the cut keeps the extractor class');
ok(/class UnifiedShopifyConverter\b/.test(src), 'the cut keeps the converter class');
ok(!/initializeONRunningExtractor\(\);/.test(src), 'the cut drops the extension bootstrapping (no page hooks)');
ok(!/chrome\.runtime\.onMessage/.test(src), 'the cut drops the extension message listener');

// It evaluates on its own, and the methods the runner calls exist.
const sb = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {} }, document: {}, window: {} };
vm.createContext(sb);
vm.runInContext(src + '\n;globalThis.__X = ONRunningInventoryExtractor;', sb);
const X = sb.__X;
ok(typeof X === 'function', 'the class half evaluates without the page');
for (const m of ['fetchInventoryFromApi', 'fetchReorderCatalog', 'loadShopifySettings', 'onApiAccountId']) ok(typeof X.prototype[m] === 'function', 'extractor has ' + m);
const conv = vm.runInContext('new UnifiedShopifyConverter("ON Running")', sb);
ok(typeof conv.convertToInventoryCSV === 'function', 'converter has convertToInventoryCSV');

// "Both" in the extension is shoes AND apparel; the runner must ask for both,
// or the tool reads every garment as removed and zeroes it.
const runner = fs.readFileSync(new URL('../tools/on-headless-run.mjs', import.meta.url), 'utf8');
ok(/fetchInventoryFromApi\(\['shoes', 'apparel'\]\)/.test(runner), 'the runner asks for shoes and apparel');
ok(/needham/i.test(runner) && /accts\.length !== 1/.test(runner), 'the runner pins the Needham account by name');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
