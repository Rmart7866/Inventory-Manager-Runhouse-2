// create-batches.mjs, The Run House.
//
// Stage 4 creates in batches of 20. From 2026-07-23 to 2026-11-10 every run
// created its FIRST batch and then threw "readyChunk is not defined": the
// batch was a parameter of the step that sends it, but the step after the
// create, which registers what was made, used it too and could not see it. So
// a run of 45 made 20 and stopped. This drives the real _doCreate with a fake
// Shopify and fake dialog, and requires every batch to go through.
//
// Run: node test/create-batches.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const els = {};
const el = (id) => els[id] || (els[id] = { id, style: {}, disabled: false, textContent: '', innerHTML: '', className: '' });
const sent = [], marked = [];
const sandbox = {
  console: { log() {}, warn() {}, error() {} }, setTimeout,
  fetch: () => Promise.resolve({ ok: false }),
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, getElementById: el, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } },
  CatalogClient: {
    createProducts: (specs) => { sent.push(specs.length); return Promise.resolve({ __status: 200, results: specs.map((s) => ({ ok: true, handle: s.handle })) }); },
    markCreated: (brand, made) => marked.push(made.length),
  },
  showToast() {},
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

console.log('\n45 products, batches of 20, no photos');
const specs = Array.from({ length: 45 }, (_, i) => ({ handle: 'h' + i, title: 'T' + i, variants: [{ sku: 'S' + i }] }));
PE._doCreate('brooks', specs, null, false);
await new Promise((r) => setTimeout(r, 50));
eq('three batches reach Shopify, 20, 20 and 5', sent, [20, 20, 5]);
eq('and every batch is registered as created', marked, [20, 20, 5]);
eq('the dialog says Created 45, not "before stopping"', /Created <strong>45<\/strong> draft products/.test(el('s4-msg').innerHTML), true);
eq('and no error is shown', /error/.test(el('s4-msg').className), false);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
