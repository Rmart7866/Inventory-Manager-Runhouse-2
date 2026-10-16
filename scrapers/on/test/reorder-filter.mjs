// reorder-filter.mjs, The Run House.
//
// products-matrix/v3 returns stock for ON's whole range, including colorways
// this account cannot re-order. Backstage calls the same endpoint and filters
// it against /api/catalog/products, so the scraper has to as well or the file
// carries stock nobody can buy.
//
// Measured against the live order screen on 2026-10-16: 5,819 in-stock shoe
// rows, 2,459 of them not orderable, 268,358 units. Cloud 6 had 48 colorways
// in the matrix and exactly 21 on the order screen, and this filter reproduces
// 76 of 76 shoe model rows.
//
// The two traps pinned here:
//   AGE IS NOT THE TEST. Cloudsurfer Next and Cloudsurfer 2 are old and still
//   orderable. Filtering on dropOutDate was 67 percent accurate and wrong in
//   both directions, so it must not creep back in.
//   A SHORT FILE IS WORSE THAN NO FILE. A dropped colorway reads as removed
//   downstream and zeroes real stock, so an implausible match rate must throw.
//
// Run: node scrapers/on/test/reorder-filter.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content.js');
const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
  setAttribute: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  get textContent() { return ''; }, set textContent(v) {}, set innerHTML(v) {} });
const sb = {
  console: { log: noop, warn: noop, error: noop },
  // noop at LOAD time so the page decoration and init do not run, swapped for
  // an immediate timer below once the class is in hand.
  setTimeout: noop, setInterval: noop, clearInterval: noop,
  location: { href: 'https://backstage.on-running.com/', hostname: 'backstage.on-running.com', pathname: '/' },
  navigator: { userAgent: '' }, performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  MutationObserver: class { observe() {} },
  document: { readyState: 'complete', addEventListener: noop, createElement: el,
    querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: noop, contains: () => false, removeChild: noop }, head: { appendChild: noop } },
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(SRC, 'utf8') + '\n;globalThis.__E = (typeof ONRunningInventoryExtractor !== "undefined") ? ONRunningInventoryExtractor : null;', sb);

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const Cls = sb.__E;
if (!Cls) { console.log('  FAIL  could not reach the extractor class'); process.exit(1); }
// Now the class exists, let timers actually fire so the retry backoff resolves.
sb.setTimeout = (f) => { if (typeof f === 'function') f(); return 0; };
const x = Object.create(Cls.prototype);

console.log('\nSeason names follow ON, SS first half of the year, FW second');
eq('16 Oct 2026 is FW26', x.onSeasonName(new Date('2026-10-16T00:00:00Z')), 'FW26');
eq('1 Jul 2026 is FW26',  x.onSeasonName(new Date('2026-07-01T12:00:00Z')), 'FW26');
eq('30 Jun 2026 is SS26', x.onSeasonName(new Date('2026-06-30T12:00:00Z')), 'SS26');
eq('2 Jan 2027 is SS27',  x.onSeasonName(new Date('2027-01-02T12:00:00Z')), 'SS27');
eq('31 Dec 2027 is FW27', x.onSeasonName(new Date('2027-12-31T12:00:00Z')), 'FW27');

console.log('\nA thin season is skipped, not accepted as the live catalog');
{
  // A season that has not opened yet answers with a handful of products. Taking
  // it would filter almost everything away and zero the lot.
  const big = Array.from({ length: 200 }, (_, i) => ({ productId: '3MF1000' + i }));
  const thin = [{ productId: '3MF999' }];
  let calls = [];
  sb.fetch = async (url) => {
    calls.push(String(url).match(/seasonName=([A-Z0-9]+)/)[1]);
    const season = calls[calls.length - 1];
    const body = season === 'SS27' ? thin : (season === 'FW26' ? big : []);
    return { ok: true, status: 200, json: async () => body };
  };
  const got = await x.fetchReorderCatalog('acct');
  eq('settles on the season with a real catalog', got.season, 'FW26');
  eq('and reports its footwear count', got.footwear, 200);
}

console.log('\nNo usable catalog THROWS rather than filtering everything away');
{
  sb.fetch = async () => ({ ok: true, status: 200, json: async () => [] });
  let threw = null;
  try { await x.fetchReorderCatalog('acct'); } catch (e) { threw = e.message; }
  eq('refuses when every season is empty', /could not read the on re-order catalog/i.test(threw || ''), true);
  sb.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });
  threw = null;
  try { await x.fetchReorderCatalog('acct'); } catch (e) { threw = e.message; }
  eq('refuses when the catalog is forbidden', /could not read/i.test(threw || ''), true);
}

console.log('\ndropOutDate must never become the filter again');
{
  const src = fs.readFileSync(SRC, 'utf8');
  const body = src.slice(src.indexOf('async fetchInventoryFromApi'), src.indexOf('async extractONRunningInventory'));
  eq('the row loop does not branch on dropOutDate', /dropOutDate/.test(body), false);
  eq('the row loop does filter on the catalog', /catalog\.ids\.has/.test(body), true);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
