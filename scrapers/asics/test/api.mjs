// Exercise the ASICS API path without a browser, using the real response shapes
// recorded from the live portal on 2026-10-14.
//
// What this is guarding. The API path decides the QUANTITY that gets written to
// Shopify, so a quiet mistake here is a wrong stock number on every ASICS shoe.
// Two traps are pinned deliberately:
//
//   1. maxQuantityDisplayed is a DISPLAY cap, not stock. The rendered grid stops
//      at 30 and 983 rows of the 2026-10-06 scrape sat at exactly that ceiling.
//      quantityAvailable is the real number and is what must be read.
//   2. Width is gender dependent. "B" is Standard on a women's shoe and Narrow
//      on a men's, so the class must come from widthTranslationCode, never from
//      the bare width code.
//
// Run: node scrapers/asics/test/api.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content.js');

// The content script decorates the page on load, so stub only enough for the
// class declaration to evaluate. Nothing here is exercised by the API path.
const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
  setAttribute: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  get textContent() { return ''; }, set textContent(v) {}, set innerHTML(v) {} });
const sb = {
  console: { log: noop, warn: noop, error: noop },
  setTimeout: noop, setInterval: noop, clearInterval: noop, fetch: () => Promise.reject(new Error('no network in tests')),
  location: { href: 'https://b2b.asics.com/dashboard', pathname: '/dashboard' },
  navigator: { userAgent: '' }, performance: { now: () => 0 },
  MutationObserver: class { observe() {} },
  document: { readyState: 'complete', addEventListener: noop, createElement: el,
    querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: noop, contains: () => false, removeChild: noop },
    head: { appendChild: noop } },
};
sb.window = sb;
vm.createContext(sb);
// A top level `class` is a lexical binding, so it never lands on the context's
// global. Export it explicitly rather than changing content.js for the test.
vm.runInContext(
  fs.readFileSync(SRC, 'utf8') + '\n;globalThis.__Extractor = EnhancedASICSInventoryExtractor;',
  sb
);
const Extractor = sb.__Extractor;
if (!Extractor) { console.log('  FAIL  content.js did not evaluate'); process.exit(1); }

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const x = Object.create(Extractor.prototype);

console.log('\ncompactSizes unpacks to material number, barcode and US size');
{
  const real = '|x6|u6|e39|g5|c24.5|b36.5|#000000020062974001|@197298969734|a0|s31|m04:'
             + '|x6H|u6.5|e39.5|g5.5|c25|b37|#000000020062974002|@197298969611|a1|s32|m04:';
  const out = x.parseCompactSizes(real);
  eq('two sizes parsed', out.length, 2);
  eq('material number', out[0].variantNo, '000000020062974001');
  eq('barcode', out[0].barcode, '197298969734');
  eq('US size', out[0].sizeUS, '6');
  eq('half size kept as written', out[1].sizeUS, '6H');
  eq('empty input is not a crash', x.parseCompactSizes('').length, 0);
  eq('null input is not a crash', x.parseCompactSizes(null).length, 0);
}

console.log('\nWidth class comes from widthTranslationCode, because width is gender dependent');
{
  const mens = x.widthFromCatalog({ width: 'B', widthLabel: 'Narrow (B)', widthTranslationCode: 'narrow' });
  eq("men's B is Narrow, not wide", mens.isWide, false);
  eq("men's B keeps its code", mens.code, 'B');
  const womens = x.widthFromCatalog({ width: 'B', widthLabel: 'Standard (B)', widthTranslationCode: 'standard' });
  eq("women's B is Standard, same code, not wide", womens.isWide, false);
  eq("women's B name", womens.name, 'Standard');
  const womensWide = x.widthFromCatalog({ width: 'D', widthLabel: 'Wide (D)', widthTranslationCode: 'wide' });
  eq("women's D is WIDE even though D is standard for men", womensWide.isWide, true);
  const xw = x.widthFromCatalog({ width: '4E', widthLabel: 'Extra wide (4E)', widthTranslationCode: 'extraWide' });
  eq('4E is wide', xw.isWide, true);
  eq('missing width falls back to standard, not wide', x.widthFromCatalog({}).isWide, false);
}

console.log('\nQuantity is the real number, never the 30 display cap');
{
  const colorways = [{
    itemCode: '1011C244', itemName: 'SONICBLAST 2', colorCode: '100', colorName: 'WHITE/BLACK',
    gender: '1', width: 'D', widthLabel: 'Standard (D)', widthTranslationCode: 'standard',
    compactSizes: '|x8|#000000020063901060|@111111111111|a1|s33|m04:',
  }];
  const av = { availability: [{ stock: { '100': [
    { variantNo: '000000020063901060', quantityAvailable: 1374, maxQuantityDisplayed: 30, sizeKey: '8', sizeUS: '8' },
    { variantNo: 'unknown-variant',     quantityAvailable: 0,    maxQuantityDisplayed: 30, sizeKey: '9', sizeUS: '9' },
  ] } }] };
  const recs = x.recordsFromAvailability(av, colorways);
  eq('both sizes kept', recs.length, 2);
  eq('1374 survives, the 30 cap is ignored', recs[0].quantity, 1374);
  eq('zero stays zero', recs[1].quantity, 0);
  eq('barcode joined on material number', recs[0].barcode, '111111111111');
  eq('a size with no barcode is blank, not undefined', recs[1].barcode, '');
  eq('gender code 1 is Men', recs[0].gender, 'Men');
  eq('style carried through', recs[0].styleId, '1011C244');
  eq('color name carried through', recs[0].colorName, 'WHITE/BLACK');
}

console.log('\nGender codes map the way ASICS own item codes do');
{
  const g = Extractor.API_GENDER;
  eq('1 -> Men  (1011)',    g['1'], 'Men');
  eq('2 -> Women (1012)',   g['2'], 'Women');
  eq('3 -> Kids  (1014)',   g['3'], 'Kids');
  eq('4 -> Unisex (1013)',  g['4'], 'Unisex');
}

console.log('\nA colorway the catalog never described is dropped, not invented');
{
  const av = { availability: [{ stock: { '999': [{ variantNo: 'v', quantityAvailable: 5, sizeUS: '8' }] } }] };
  eq('unknown color code yields no rows', x.recordsFromAvailability(av, []).length, 0);
  eq('empty availability yields no rows', x.recordsFromAvailability({}, []).length, 0);
}

console.log('\nSizes come out in ladder order, because CSV row order IS variant order');
{
  // The ON API path shipped unsorted and created products whose size dropdown
  // read 5, 10.5, 6.5, 7. Same risk here, so the order is pinned.
  const colorways = [{
    itemCode: '1011C127', itemName: 'GEL-NIMBUS 28', colorCode: '001', colorName: 'BLACK',
    gender: '1', width: 'D', widthLabel: 'Standard (D)', widthTranslationCode: 'standard',
    compactSizes: '',
  }];
  const jumbled = ['10', '6.5', '7', '5', '11.5', '8'].map((z, i) => ({
    variantNo: 'v' + i, quantityAvailable: 1, sizeUS: z, sizeKey: z,
  }));
  const recs = x.recordsFromAvailability({ availability: [{ stock: { '001': jumbled } }] }, colorways);
  eq('sizes sort as numbers, so 10 does not land before 6.5',
     recs.map((r) => r.sizeUS).join(','), '5,6.5,7,8,10,11.5');
}

console.log('\nASICS own sorting field wins when present');
{
  const colorways = [{
    itemCode: '1011C127', itemName: 'GEL-NIMBUS 28', colorCode: '001', colorName: 'BLACK',
    gender: '1', width: 'D', widthLabel: 'Standard (D)', widthTranslationCode: 'standard', compactSizes: '',
  }];
  const sized = [
    { variantNo: 'a', quantityAvailable: 1, sizeUS: '7',  sizeKey: '7',  sorting: 33 },
    { variantNo: 'b', quantityAvailable: 1, sizeUS: '6',  sizeKey: '6',  sorting: 31 },
    { variantNo: 'c', quantityAvailable: 1, sizeUS: '6.5', sizeKey: '6H', sorting: 32 },
  ];
  const recs = x.recordsFromAvailability({ availability: [{ stock: { '001': sized } }] }, colorways);
  eq('ladder order from the sorting field', recs.map((r) => r.sizeUS).join(','), '6,6.5,7');
}

console.log('\n202 is a throttle, not an answer, and must never read as success');
{
  // Under load the availability route answers 202 Accepted with an EMPTY body.
  // 202 is a 2xx, so res.ok is true: treating it as success yields a style with
  // no sizes, which downstream reads as "out of stock everywhere" and zeroes it.
  const mk = (status, body) => ({ status, ok: status >= 200 && status < 300, text: async () => body });
  const y = Object.create(Extractor.prototype);
  // The load-time stub is a no-op so the page decoration does not run. The
  // backoff genuinely awaits setTimeout, so fire it immediately from here on,
  // otherwise the retry never resolves and the test hangs instead of failing.
  sb.setTimeout = (fn) => { if (typeof fn === 'function') fn(); return 0; };

  let calls = 0;
  sb.fetch = async () => { calls++; return calls < 3 ? mk(202, '') : mk(200, '{"availability":[]}'); };
  const got = await y.apiGet('/x');
  eq('retries through 202 and returns the real body', JSON.stringify(got), '{"availability":[]}');
  eq('it actually retried', calls >= 3, true);

  sb.fetch = async () => mk(202, '');
  let threw = null;
  try { await y.apiGet('/x'); } catch (e) { threw = e.message; }
  eq('a style stuck on 202 THROWS rather than returning nothing',
     /202|throttl/i.test(threw || ''), true);

  sb.fetch = async () => mk(200, '   ');
  threw = null;
  try { await y.apiGet('/x'); } catch (e) { threw = e.message; }
  eq('an empty 200 body throws too', /empty/i.test(threw || ''), true);

  sb.fetch = async () => mk(500, 'boom');
  threw = null;
  try { await y.apiGet('/x'); } catch (e) { threw = e.message; }
  eq('a 500 still throws', /500/.test(threw || ''), true);
}

console.log('\nEvery style on the link list is guaranteed into the feed');
{
  const L = Extractor.API_ALWAYS_INCLUDE;
  eq('all 49 carried styles are listed', L.length, 49);
  eq('no duplicates', new Set(L).size, L.length);
  // The three that each filter would otherwise have dropped.
  eq('the kids style the store carries is on the floor', L.includes('1014A396'), true);
  eq('a 1013 unisex style is on the floor', L.includes('1013A176'), true);
  eq('the style used throughout these tests is carried', L.includes('1011C127'), true);
  eq('every entry looks like an ASICS item code',
     L.every((c) => /^[0-9A-Z]{8}$/.test(c)), true);
}

console.log('\nConcurrency stays at the measured ceiling');
eq('six, because twelve gets a 429 with no throughput gain', Extractor.API_CONCURRENCY, 6);
eq('footwear collection', Extractor.API_FOOTWEAR_COLLECTION, 3100);
eq('running only, 179 of the 577 footwear styles are court and field', Extractor.API_RUNNING_ONLY, true);
// The store carries 1014A396 NOVABLAST 6 GS, a kids shoe. Excluding kids
// dropped exactly that style, and a dropped style gets ZEROED, so kids stay in.
eq('kids are NOT excluded, the store carries a GS style', Extractor.API_INCLUDE_KIDS, undefined);
// Every season. A season window would have to be refreshed by hand alongside
// API_ALWAYS_INCLUDE, and a style that fell out of both would zero silently.
eq('no season filter, so no style can age out of the feed', Extractor.API_SEASONS, null);

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
