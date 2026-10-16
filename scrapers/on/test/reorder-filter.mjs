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

console.log('\nThe re-order season is chosen by overlap with stock, not by the date');
{
  // A re-order season is already in the warehouse, a pre-order season is not.
  // Measured 2026-10-16: FW26 96.1 percent in stock, SS27 27.7, FW27 15.9.
  const catalogs = {
    FW26: Array.from({ length: 100 }, (_, i) => ({ productId: '3FW' + i })),   // 96 in stock
    SS27: Array.from({ length: 100 }, (_, i) => ({ productId: '3SS' + i })),   // 20 in stock
    FW27: Array.from({ length: 100 }, (_, i) => ({ productId: '3F7' + i })),
  };
  const stocked = new Set([
    ...Array.from({ length: 96 }, (_, i) => '3FW' + i),
    ...Array.from({ length: 20 }, (_, i) => '3SS' + i),
  ]);
  sb.fetch = async (url) => {
    const s = String(url).match(/seasonName=([A-Z0-9]+)/)[1];
    return { ok: !!catalogs[s], status: catalogs[s] ? 200 : 404, json: async () => catalogs[s] || [] };
  };
  const got = await x.fetchReorderCatalog('acct', stocked);
  eq('keeps the season that is actually in the warehouse', got.season, 'FW26');
  eq('and ignores the pre-order seasons', got.ids.has('3SS1'), false);
  eq('keeping all of the live catalog', got.footwear, 100);
}

console.log('\nApparel is matched against apparel, not against footwear');
{
  // ON's article code carries the group in its first digit: 1 apparel,
  // 2 accessories, 3 footwear. The catalog holds all three. Scoring a
  // footwear-only slice against apparel stock would reject every season.
  const mixed = [
    ...Array.from({ length: 60 }, (_, i) => ({ productId: '1AP' + i })),   // apparel
    ...Array.from({ length: 60 }, (_, i) => ({ productId: '3FW' + i })),   // footwear
  ];
  sb.fetch = async (url) => {
    const s = String(url).match(/seasonName=([A-Z0-9]+)/)[1];
    return { ok: s === 'FW26', status: s === 'FW26' ? 200 : 404, json: async () => (s === 'FW26' ? mixed : []) };
  };
  // apparel stock only: 58 of the 60 apparel products are in the warehouse
  const apparelStock = new Set(Array.from({ length: 58 }, (_, i) => '1AP' + i));
  const got = await x.fetchReorderCatalog('acct', apparelStock);
  eq('an apparel export still finds its season', got.season, 'FW26');
  eq('and keeps the apparel products', got.ids.has('1AP0'), true);
  eq('without dragging footwear in', got.ids.has('3FW0'), false);
}

console.log('\nBoth groups at once still clears the bar');
{
  // A combined Shoes + Apparel export puts 1xx and 3xx codes in the same
  // stock set, so the catalog slice has to widen to both. Measured on the
  // live account: footwear 335 products at 96.1 percent in stock, apparel
  // 451 at about 86, so the combined slice sits near 90 and clears 80.
  const cat = [
    ...Array.from({ length: 335 }, (_, i) => ({ productId: '3FW' + i })),
    ...Array.from({ length: 451 }, (_, i) => ({ productId: '1AP' + i })),
    ...Array.from({ length: 100 }, (_, i) => ({ productId: '2AC' + i })),  // accessories, not exported
  ];
  sb.fetch = async (url) => {
    const s = String(url).match(/seasonName=([A-Z0-9]+)/)[1];
    return { ok: s === 'FW26', status: s === 'FW26' ? 200 : 404, json: async () => (s === 'FW26' ? cat : []) };
  };
  const stocked = new Set([
    ...Array.from({ length: 322 }, (_, i) => '3FW' + i),
    ...Array.from({ length: 387 }, (_, i) => '1AP' + i),
  ]);
  const got = await x.fetchReorderCatalog('acct', stocked);
  eq('a combined export still finds the season', got.season, 'FW26');
  eq('shoes kept', got.ids.has('3FW0'), true);
  eq('apparel kept', got.ids.has('1AP0'), true);
  eq('accessories left out, they were not exported', got.ids.has('2AC0'), false);
  eq('the slice is both groups, not one', got.footwear, 786);
}

console.log('\nNo season resembling a re-order season THROWS');
{
  // Everything looks like pre-order: nothing is in stock. Filtering on any of
  // them would drop the lot, so refuse.
  sb.fetch = async () => ({ ok: true, status: 200,
    json: async () => Array.from({ length: 50 }, (_, i) => ({ productId: '3XX' + i })) });
  // Real stock, but none of it is in any catalog: every season looks like
  // pre-order, so there is nothing safe to filter on.
  let threw = null;
  try { await x.fetchReorderCatalog('acct', new Set(['3ZZ1', '3ZZ2'])); } catch (e) { threw = e.message; }
  eq('refuses rather than zero the catalog', /no on season looked like a re-order season/i.test(threw || ''), true);
  eq('and says what it checked', /percent in stock/.test(threw || ''), true);

  // And no stock at all is its own, clearer failure.
  threw = null;
  try { await x.fetchReorderCatalog('acct', new Set()); } catch (e) { threw = e.message; }
  eq('no stock to match against is reported separately', /no on stock to match a season/i.test(threw || ''), true);
}

console.log('\ndropOutDate must never become the filter again');
{
  const src = fs.readFileSync(SRC, 'utf8');
  const body = src.slice(src.indexOf('async fetchInventoryFromApi'), src.indexOf('async extractONRunningInventory'));
  eq('the row loop does not branch on dropOutDate', /dropOutDate/.test(body), false);
  eq('the row loop does filter on the catalog', /catalog\.ids\.has/.test(body), true);
}

console.log('\nThe short-file guard measures CATALOG COVERAGE, not a share of the matrix');
{
  // The first version compared kept rows against all rows considered and threw
  // under 30 percent. The matrix is mostly discontinued stock and how much
  // varies by group: shoes came out at 35 percent, apparel at 20. So it fired
  // on every apparel and combined export and the scrape reported "no inventory
  // data found". Real coverage of the catalog is about 96 percent for both.
  const src = fs.readFileSync(SRC, 'utf8');
  const body = src.slice(src.indexOf('async fetchInventoryFromApi'), src.indexOf('async extractONRunningInventory'));
  eq('the ratio-of-rows guard is gone', /kept \/ considered/.test(body), false);
  eq('coverage of the catalog is what is measured', /coverage\s*<\s*0\.5/.test(body), true);
  eq('and it counts distinct colorways', /keptColorways/.test(body), true);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
