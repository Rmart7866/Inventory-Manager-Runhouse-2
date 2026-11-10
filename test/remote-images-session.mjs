// remote-images-session.mjs, The Run House.
//
// Stage 4 looks supplier photos up on the brand's CDN. It used to do that ONCE
// per session: the dialog only probed while the photo index was empty, and the
// probe replaced the index. So the first create of a session got photos and
// every later create got none, its colourways never looked up (reported
// 2026-11-10 on Brooks apparel; true of every CDN brand). Pinned here with the
// real product-enrichment.js and a fake CDN.
//
// Run: node test/remote-images-session.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const asked = [];
const sandbox = {
  console: { log() {}, warn() {}, error() {} }, setTimeout,
  // The fake CDN: every Brooks garment has mf and mb, nothing else.
  fetch: (url) => { asked.push(url); return Promise.resolve({ ok: /__(mf|mb)\.jpg$/.test(url) }); },
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, getElementById: () => null, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(fs.readFileSync(new URL('../product-enrichment.js', import.meta.url), 'utf8'), sandbox); }
catch { /* the file ends in DOM wiring a shim cannot satisfy; the object is built by then */ }
const PE = sandbox.ProductEnrichment;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : bad(m, { got: a, want: b }));

const spec = (sku) => ({ variants: [{ sku }] });
const first = [spec('221754001-001-XS'), spec('221754001-368-XS')];
const second = [spec('221749515-515-M'), spec('221754001-001-S')];   // one new colourway, one already looked up

console.log('\nTwo creates in one session, Brooks apparel');
eq('before anything, the first batch needs both colourways', PE.remoteCodesNeeded('brooks', first), ['221754001', '221754368']);
await PE.loadRemoteImages('brooks', first);
eq('the first create finds their photos', Object.keys(PE._imageIndexRemote).sort(), ['221754001', '221754368']);
eq('the second batch needs ONLY its new colourway (the old one was already asked)', PE.remoteCodesNeeded('brooks', second), ['221749515']);
const before = asked.length;
await PE.loadRemoteImages('brooks', second);
eq('so the second create probes just that one colourway, 4 views', asked.length - before, 4);
eq('and the index now holds all three, the first create\'s photos kept', Object.keys(PE._imageIndexRemote).sort(), ['221749515', '221754001', '221754368']);
eq('each with its photos, model front first', PE._imageIndexRemote['221749515'].map((x) => x.name), ['221749515_01_front.jpg', '221749515_02_back.jpg']);
eq('a third create of the same products asks the CDN nothing', PE.remoteCodesNeeded('brooks', [...first, ...second]), []);

console.log('\nSwitching brand starts clean');
PE._resetImagesForBrand('newbalance');
eq('a Brooks code is needed again once the brand changed and came back', (PE._resetImagesForBrand('brooks'), PE.remoteCodesNeeded('brooks', first)), ['221754001', '221754368']);

const src = fs.readFileSync(new URL('../product-enrichment.js', import.meta.url), 'utf8');
console.log('\nThe dialog asks per batch, not once per session');
(/if \(remoteSrc && self\.remoteCodesNeeded\(brand, specs\)\.length\)/.test(src) && !/if \(remoteSrc && !self\._imageIndexRemote\)/.test(src))
  ? ok('the create dialog probes whenever a colourway has not been looked up') : bad('the dialog still probes only while the index is empty');

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
