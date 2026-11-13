// feeds-client.js against a fake Worker: the scheduled files load into the
// cards exactly as dropped files do (2026-11-13).
//   - a stripped, gzipped workbook arrives as the .xlsx bytes, named .xlsx
//   - ON's CSV and images file arrive together, as one drop
//   - a CSV brand still arrives as text
//   - a file a person dropped is never replaced
// Node has the browser's fetch, Response, File and DecompressionStream, so the
// real file runs unchanged. Run: node test/feeds-client.mjs
// House style: no em dashes.
import fs from 'node:fs';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };

const xlsxBytes = Buffer.from('PK\x03\x04 pretend stripped workbook');
const feeds = {
  puma: { meta: { file: 'Master ATS nightly-x.xlsx', verdict: 'PASS', format: 'xlsx', wholesaleStripped: true, capturedAt: new Date().toISOString() }, file: gzipSync(xlsxBytes) },
  brooks: { meta: { file: 'brooks-fullcatalog-x.csv', verdict: 'BLOCKED', format: 'csv', capturedAt: new Date().toISOString() }, file: 'Handle,SKU,On hand (new)\n' },
  on: { meta: { file: 'on-running-inventory-1.csv', verdict: 'PASS', format: 'csv', capturedAt: new Date().toISOString() }, file: 'Handle,SKU\n', images: '{"kind":"on-images","map":{}}' },
  saucony: { meta: { file: 'CatalogUPCs-x.xlsx', verdict: 'PASS', format: 'xlsx', wholesaleStripped: true, capturedAt: new Date().toISOString() }, file: gzipSync(xlsxBytes) },
};
const fakeFetch = async (url) => {
  const u = new URL(url); const b = u.searchParams.get('brand'); const f = feeds[b];
  if (!f) return new Response('{"error":"no file"}', { status: 404 });
  if (u.searchParams.get('images') === '1') return f.images ? new Response(f.images) : new Response('', { status: 404 });
  if (u.searchParams.get('file') === '1') return new Response(f.file);
  return new Response(JSON.stringify({ feed: f.meta }));
};

const calls = [];
const zone = (id) => ({ id, parentNode: { insertBefore() {}, firstChild: null } });
const brands = {};
for (const b of ['asics', 'brooks', 'on', 'saucony', 'merrell', 'puma', 'altra', 'newbalance', 'hoka']) brands[b] = b === 'on' ? { allFile: null } : { file: null };
brands.saucony.file = { name: 'my-own-drop.xlsx' };   // a person already dropped this one
const sb = {
  console, fetch: fakeFetch, Response, File, DecompressionStream, setTimeout,
  document: { getElementById: (id) => (/dropzone$/.test(id) ? zone(id) : null), createElement: () => ({ style: {} }), addEventListener() {} },
  CatalogClient: { hasWriteSecret: () => true, WORKER_URL: 'https://w.example', CATALOG_TOKEN: 't', writeSecret: () => 's' },
  BrandConverter: {
    brands,
    handleFile: (brand, file) => calls.push({ brand, files: [file] }),
    handleOnFiles: (slot, files) => calls.push({ brand: 'on', slot, files }),
  },
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../feeds-client.js', import.meta.url), 'utf8'), sb);
const FC = sb.FeedsClient;
for (const b of ['puma', 'brooks', 'on', 'saucony', 'merrell']) await FC.load(b);

const puma = calls.find((c) => c.brand === 'puma');
ok(puma && puma.files[0].name.endsWith('.xlsx'), 'the workbook arrives named .xlsx');
ok(puma && Buffer.from(await puma.files[0].arrayBuffer()).equals(xlsxBytes), 'and as the unpacked workbook bytes, not the gzip');
ok(brands.puma.feed && brands.puma.feed.verdict === 'PASS', 'its verdict is kept for the Write guard');
const brooks = calls.find((c) => c.brand === 'brooks');
ok(brooks && (await brooks.files[0].text()).startsWith('Handle,'), 'a CSV brand still arrives as text');
ok(brands.brooks.feed && brands.brooks.feed.verdict === 'BLOCKED', 'a BLOCKED verdict is kept, so Write skips it');
const on = calls.find((c) => c.brand === 'on');
ok(on && on.slot === 'all' && on.files.length === 2, 'ON gets its CSV and images file in one drop', on && on.files.map((f) => f.name));
ok(on && /-images\.json$/.test(on.files[1].name), 'the images file is named as the card expects');
ok(!calls.some((c) => c.brand === 'saucony'), 'a file a person dropped is never replaced');
ok(!calls.some((c) => c.brand === 'merrell'), 'a brand with no scheduled file is left alone');
ok(sb.FeedsClient.FORMAT.newbalance === 'xlsx' && sb.FeedsClient.FORMAT.on === 'on', 'every scheduled brand has a format');

// The formats here and in the Worker must agree, or a file loads as the wrong kind.
const worker = fs.readFileSync(new URL('../worker/src/feeds.js', import.meta.url), 'utf8');
const wf = JSON.parse('{' + worker.match(/FEED_FORMAT = \{([\s\S]*?)\};/)[1].replace(/\/\/.*$/gm, '').replace(/(\w+):/g, '"$1":').replace(/'/g, '"').replace(/,\s*$/, '') + '}');
const agree = Object.keys(wf).every((b) => (wf[b] === 'xlsx') === (FC.FORMAT[b] === 'xlsx'));
ok(agree && Object.keys(wf).length === Object.keys(FC.FORMAT).length, 'the client and the Worker agree on every brand\'s format');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
