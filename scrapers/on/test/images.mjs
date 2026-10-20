// images.mjs, The Run House.
//
// ON is LOOKUP ONLY for photography. Brooks and ASICS publish dealer imagery
// at a URL you can build from the code already in the SKU, so Stage 4 derives
// it. ON's asset ids are opaque uuids, so the only way to get an ON photo is
// to be handed one, and the only thing that hands them over is the catalog
// response the scrape already fetches for the re-order filter.
//
// Verified against the live host on 2026-10-16: unauthenticated GET returns
// 200 image/png at about 1 MB, and three different bogus uuids all return 404
// rather than a placeholder, which is the Puma lesson from CLAUDE.md.
//
// Run: node scrapers/on/test/images.mjs
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
const sb = { console: { log: noop, warn: noop, error: noop },
  setTimeout: noop, setInterval: noop, clearInterval: noop, fetch: () => Promise.reject(new Error('x')),
  location: { href: 'https://backstage.on-running.com/', hostname: 'backstage.on-running.com', pathname: '/' },
  navigator: { userAgent: '' }, performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  MutationObserver: class { observe() {} },
  document: { readyState: 'complete', addEventListener: noop, createElement: el,
    querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: noop, contains: () => false, removeChild: noop }, head: { appendChild: noop } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(SRC, 'utf8') + '\n;globalThis.__C = UnifiedShopifyConverter;', sb);

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const conv = new sb.__C('ON Running');
const inv = (styleId, sizes) => sizes.map((z) => ({
  styleId, colorCode: 'BLA', colorName: 'Black', productName: 'Cloudmonster 3',
  gender: 'Men', sizeUS: z, size: z, quantity: 3,
}));

console.log('\nWith no assets the CSV is exactly as it was');
{
  conv._onAssets = new Map();
  const rows = conv.convertToShopifyFormat(inv('3MG10931043', ['8', '9']), {});
  eq('one row per variant, no extras', rows.length, 2);
  eq('image columns stay empty', rows[0]['Image Src'], '');
}

console.log('\nWith assets, image one rides the first variant row');
{
  conv._onAssets = new Map([['3MG10931043', ['https://library.on.com/a', 'https://library.on.com/b', 'https://library.on.com/c']]]);
  const rows = conv.convertToShopifyFormat(inv('3MG10931043', ['8', '9']), {});
  eq('first variant carries image 1', rows[0]['Image Src'], 'https://library.on.com/a');
  eq('at position 1', rows[0]['Image Position'], '1');
  eq('with alt text', /Cloudmonster 3/.test(rows[0]['Image Alt Text'] || ''), true);
  eq('the second variant is NOT given an image', rows[1]['Image Src'], '');
}

console.log('\nThe rest of the gallery follows as image-only rows');
{
  conv._onAssets = new Map([['3MG10931043', ['u1', 'u2', 'u3']]]);
  const rows = conv.convertToShopifyFormat(inv('3MG10931043', ['8', '9']), {});
  eq('two variants plus two extra image rows', rows.length, 4);
  eq('extra row keeps the handle, which is what joins it', !!rows[2].Handle, true);
  eq('same handle as the variants', rows[2].Handle, rows[0].Handle);
  eq('image 2', rows[2]['Image Src'], 'u2');
  eq('position 2', rows[2]['Image Position'], '2');
  eq('image 3 at position 3', rows[3]['Image Position'], '3');
  // An extra row must not carry a price or a size, or Shopify reads it as a variant.
  eq('no option value on an image row', rows[2]['Option1 Value'], undefined);
}

console.log('\nA style with no assets in a mixed run is simply left alone');
{
  conv._onAssets = new Map([['3MG10931043', ['u1']]]);
  const rows = conv.convertToShopifyFormat(
    inv('3MG10931043', ['8']).concat(inv('3WF99999999', ['7'])), {});
  const withImg = rows.filter((r) => r['Image Src']);
  eq('only the one that has assets gets an image', withImg.length, 1);
}

console.log('\nThe sidecar is parked for a click, never auto-downloaded');
{
  // A browser gives a page ONE download per user gesture. Firing a second
  // straight after the CSV is silently dropped, and retrying gets the site
  // flagged so NEITHER arrives. Verified on backstage 2026-10-20: one file of
  // two landed the first time, none the second.
  const src = fs.readFileSync(SRC, 'utf8');
  const body = src.slice(src.indexOf('async extractONRunningInventory'));
  const dls = (body.match(/this\.downloadCSV\(/g) || []).length;
  eq('extractONRunningInventory downloads exactly once', dls, 1);
  eq('the sidecar is parked instead', /_pendingImages\s*=/.test(body), true);
  eq('and a button is offered', /showImagesButton\(\)/.test(body), true);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
