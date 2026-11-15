// auto-write.mjs, The Run House.
//
// WRITES A SCHEDULED FILE TO NEEDHAM BY ITSELF, the step a person used to do
// by dropping the file on the inventory tool and pressing "Write all inventory
// to Shopify". Owner decision 2026-11-14: "just have it write so I dont have to
// work on weekend". Each nightly runner calls this after a PASS verdict.
//
// IT RUNS THE TOOL'S OWN CODE, NOT A COPY. inventory.html's scripts are loaded
// into a vm in the page's order (the converters, catalog-client.js,
// inventory-tracker.js, brand-picker.js, main.js), and the same steps run in
// the same order as a person pressing the buttons:
//
//   scan the file, tick what the picker ticks (BrandPicker._onShopify: on
//   Shopify by handle, then by model), convert, alignInventoryToCatalog,
//   maskLowStock, InventoryTracker.compare, zero the removed colourways that
//   hold Needham stock, the ASICS post process, Needham rows only, then the
//   Worker's /inventory dry run and the write.
//
// So a new product is never written (it is not ticked, and its SKUs are not on
// Shopify anyway), a Warehouse row is held back exactly as the button holds it
// back, and the Worker writes Needham and nothing else.
//
// WHY IT REFUSES, every one of which is a person's job on a weekday:
//   - the verdict is not PASS (the guardrail already judged the file)
//   - ~/.runhouse-autowrite-off exists (the owner's off switch)
//   - it would zero 40% or more of the brand's live colourways, the share the
//     tracker report already calls "almost always a partial or wrong file"
//   - it would take 25% or more of the stocked variants it touches to 0
//   - Needham units for the variants in the file would fall by half or more
//   - the catalog is missing or not Needham scoped
//   - the runner was started with --no-write (a hand run)
// A refusal writes NOTHING, raises a macOS notification and says why in
// ~/Library/Logs/runhouse-autowrite.log. Thresholds were checked against
// real files before this went live, see LIMITS.
//
// EVERY WRITE LEAVES A ROLLBACK FILE of what each variant was before, in
// ~/Library/Logs/runhouse-autowrite/. To undo a run:
//   node tools/auto-write.mjs --restore <rollback.json>          dry run
//   node tools/auto-write.mjs --restore <rollback.json> --apply  write it back
//
// By hand, against a file (dry run unless --apply):
//   node tools/auto-write.mjs <brand> <file> [<images.json>] [--apply]
//
// House style: no em dashes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
const CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36';   // public by construction, see catalog-client.js
const SECRET_FILE = path.join(os.homedir(), '.runhouse-write-secret');
const OFF_SWITCH = path.join(os.homedir(), '.runhouse-autowrite-off');
const LOG = process.env.AUTOWRITE_LOG || path.join(os.homedir(), 'Library', 'Logs', 'runhouse-autowrite.log');
const ROLLBACK_DIR = path.join(os.homedir(), 'Library', 'Logs', 'runhouse-autowrite');

export const LIMITS = {
  removedShare: 0.4,   // the tracker report's own hard warning
  zeroedShare: 0.25,   // of the stocked variants this run would change or keep
  unitsKept: 0.5,      // Needham units after / before, for the variants in the file
  minUnitsForShare: 200, // below this the unit check is noise
};

// The scripts inventory.html loads, in its order, that the write path needs.
const SCRIPTS = ['barcode-data.js', 'saucony-converter.js', 'hoka-converter.js', 'catalog-client.js',
  'inventory-tracker.js', 'puma-converter.js', 'newbalance-converter.js', 'on-converter.js',
  'asics-converter.js', 'brooks-converter.js', 'merrell-converter.js', 'altra-converter.js',
  'brand-picker.js', 'main.js'];

export const BRANDS = ['saucony', 'merrell', 'puma', 'altra', 'newbalance', 'hoka', 'asics', 'brooks', 'on'];

function log(line) {
  const s = new Date().toISOString() + '  ' + line;
  console.log(line);
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, s + '\n'); } catch (e) { /* the log is never fatal */ }
}

function notify(msg) {
  try { execFile('osascript', ['-e', 'display notification ' + JSON.stringify(msg) + ' with title "Run House auto write"']); } catch (e) { /* never fatal */ }
}

// A browser File, as much of one as the converters use.
function fileFrom(name, buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  return { name, size: buf.length, type: '', arrayBuffer: async () => ab, text: async () => buf.toString('utf8'), __buf: buf };
}

// The page, minus the DOM. Every element lookup finds nothing, which the
// scripts already handle because a card can be absent.
export function loadTool() {
  const require = createRequire(import.meta.url);
  const XLSX = require('xlsx');
  const Papa = require('papaparse');
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, appendChild: noop,
    setAttribute: noop, getAttribute: () => null, addEventListener: noop, removeEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], insertAdjacentHTML: noop, remove: noop, textContent: '', innerHTML: '', value: '', dataset: {} });
  const store = {};
  class FileReader {
    readAsArrayBuffer(f) { f.arrayBuffer().then((r) => this.onload && this.onload({ target: { result: r } }), (e) => this.onerror && this.onerror(e)); }
    readAsText(f) { f.text().then((r) => this.onload && this.onload({ target: { result: r } }), (e) => this.onerror && this.onerror(e)); }
  }
  const quiet = { log: noop, info: noop, warn: noop, error: noop, table: noop, group: noop, groupEnd: noop, groupCollapsed: noop };
  const sb = {
    console: process.env.AUTOWRITE_DEBUG ? console : quiet,
    XLSX, Papa, FileReader, fetch, URL, Blob, TextDecoder, TextEncoder, DecompressionStream, Response, AbortSignal,
    setTimeout, clearTimeout, setInterval, clearInterval, Promise,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    navigator: { userAgent: 'node' }, location: { href: 'https://local/inventory.html', search: '', hostname: 'local' },
    alert: noop, confirm: () => false, prompt: () => null,
    document: { readyState: 'loading', addEventListener: noop, getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [], createElement: el, body: el(), head: el() },
  };
  sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  for (const f of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
  const g = (name) => vm.runInContext(name, sb);
  return { sb, CatalogClient: g('CatalogClient'), InventoryTracker: g('InventoryTracker'), BrandPicker: g('BrandPicker'),
    BRAND_CONFIG: g('BRAND_CONFIG'), maskLowStock: g('maskLowStock'), alignInventoryToCatalog: g('alignInventoryToCatalog') };
}

// The rows the Write button would send for this brand, built the way the page
// builds them. files: [{ name, buf }], the CSV or workbook first, ON's images
// json after it.
export async function planBrand(brand, files) {
  if (!BRANDS.includes(brand)) throw new Error('unknown brand ' + brand);
  const T = loadTool();
  const config = T.BRAND_CONFIG[brand];
  const converter = config.converter();
  if (!converter) throw new Error('no converter for ' + brand);

  const catalog = await T.CatalogClient.fetchCatalog(true);
  if (!catalog || !Array.isArray(catalog.products) || !catalog.products.length) throw new Error('the live catalog is empty');
  if (catalog.needhamScoped === false) throw new Error('the catalog is not Needham scoped, refusing to judge removals against it');

  // Load the known sets first, as _scanBrand does, so the converter has its
  // known models and the picker can answer "on Shopify".
  const sets = await T.InventoryTracker.load(brand);
  converter._knownProducts = sets.models;
  const fobjs = files.map((f) => fileFrom(f.name, f.buf));
  const products = config.multiFile ? await converter.scanFiles(fobjs) : await converter.scanFile(fobjs[0]);

  // The picker's default ticks, renderItem's order of signals.
  const selected = new Set();
  let newCount = 0;
  for (const p of products) {
    const on = T.BrandPicker._onShopify(brand, p);
    let checked;
    if (on !== null) checked = on;
    else if (converter._knownProducts) checked = converter._knownProducts.has(p.model || p.name);
    else if (p.isDefault !== undefined) checked = p.isDefault;
    else checked = true;
    if (checked) selected.add(p.name); else newCount++;
  }
  converter.selectedProducts = selected;
  if (!selected.size) throw new Error('nothing in the file is on Shopify, so nothing would be ticked');

  let inventory = config.multiFile ? await converter.convert(fobjs) : await converter.convert(fobjs[0]);
  inventory = T.alignInventoryToCatalog(brand, inventory);
  inventory = T.maskLowStock(brand, inventory);

  const comparison = T.InventoryTracker.compare(inventory, brand);
  const liveTotal = comparison.summary.totalInDB || 0;
  const removed = (comparison.removedColorways || []).filter((cw) => (cw.needhamOnHand || 0) > 0);
  if (removed.length) inventory = inventory.concat(T.InventoryTracker.generateRemovedRows(removed));
  if (config.postProcess) inventory = config.postProcess(inventory);

  // writeAllInventory's row rule: Needham only, a SKU, a number.
  const items = [], heldBack = {};
  for (const row of inventory) {
    const sku = String(row.SKU || '').trim();
    if (!sku) continue;
    const loc = String(row.Location || 'Needham').trim();
    if (loc && loc.toLowerCase() !== 'needham') { heldBack[loc] = (heldBack[loc] || 0) + 1; continue; }
    let q = parseInt(row['On hand (new)'], 10); if (!(q >= 0)) q = 0;
    items.push({ sku, quantity: q });
  }
  return {
    brand, items, heldBack,
    scanned: products.length, ticked: selected.size, notTicked: newCount,
    removed: removed.length, removedUnits: removed.reduce((t, r) => t + (r.needhamOnHand || 0), 0),
    liveColorways: liveTotal, removedShare: liveTotal ? removed.length / liveTotal : 0,
    catalogBuiltAt: catalog.generatedAt || null,
  };
}

function secret() {
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch (e) { return ''; }
}

async function postInventory(items, dryRun) {
  const r = await fetch(WORKER + '/inventory', {
    method: 'POST', signal: AbortSignal.timeout(300000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CATALOG_TOKEN, 'X-Write-Secret': secret() },
    body: JSON.stringify({ items, dryRun }),
  });
  let b; try { b = await r.json(); } catch (e) { b = { error: 'non JSON reply' }; }
  if (r.status !== 200 || !b.ok) throw new Error('the writer answered ' + r.status + ': ' + (b.reason || b.error || 'not ok'));
  return b;
}

// The Worker's dry run, in the button's chunks of 1,000, with the before
// numbers the checks below need.
export async function dryRun(items) {
  const out = { change: [], unchanged: 0, unchangedUnits: 0, unchangedStocked: 0, notFound: 0, activate: 0 };
  for (let i = 0; i < items.length; i += 1000) {
    const b = await postInventory(items.slice(i, i + 1000), true);
    for (const r of b.results) {
      if (r.status === 'would_set' || r.status === 'would_activate') {
        out.change.push({ sku: r.sku, from: r.from, to: r.to });
        if (r.status === 'would_activate') out.activate++;
      } else if (r.status === 'unchanged') {
        out.unchanged++; out.unchangedUnits += r.onHand || 0; if ((r.onHand || 0) > 0) out.unchangedStocked++;
      } else if (r.status === 'not_found') out.notFound++;
    }
  }
  return out;
}

// The checks that turn a weekend write into a refusal. Pure, so the test can
// pin each one.
export function judge(plan, dry) {
  const blocks = [];
  if (plan.removedShare >= LIMITS.removedShare) {
    blocks.push('it would zero ' + plan.removed + ' of ' + plan.liveColorways + ' live colourways (' + Math.round(plan.removedShare * 100) + '%), the share that means a partial or wrong file');
  }
  const stocked = dry.change.filter((c) => (c.from || 0) > 0);
  const zeroed = stocked.filter((c) => c.to === 0).length;
  const stockedTotal = stocked.length + dry.unchangedStocked;
  const zeroedShare = stockedTotal ? zeroed / stockedTotal : 0;
  if (zeroedShare >= LIMITS.zeroedShare) {
    blocks.push('it would take ' + zeroed + ' of ' + stockedTotal + ' stocked variants to 0 (' + Math.round(zeroedShare * 100) + '%)');
  }
  const before = dry.change.reduce((t, c) => t + (c.from || 0), 0) + dry.unchangedUnits;
  const after = dry.change.reduce((t, c) => t + (c.to || 0), 0) + dry.unchangedUnits;
  if (before >= LIMITS.minUnitsForShare && after / before < LIMITS.unitsKept) {
    blocks.push('Needham units would fall from ' + before + ' to ' + after + ' (' + Math.round((1 - after / before) * 100) + '% down)');
  }
  return { ok: blocks.length === 0, blocks, zeroed, stockedTotal, before, after };
}

async function writeChanges(change) {
  const done = [], failed = [];
  for (let i = 0; i < change.length; i += 250) {
    const slice = change.slice(i, i + 250).map((c) => ({ sku: c.sku, quantity: c.to }));
    try {
      const b = await postInventory(slice, false);
      for (const r of b.results) {
        if (r.status === 'set' || r.status === 'activated') done.push({ sku: r.sku, from: r.from, to: r.to });
        else if (r.status === 'failed') failed.push({ sku: r.sku, error: r.error });
      }
    } catch (e) { slice.forEach((s) => failed.push({ sku: s.sku, error: e.message })); }
  }
  return { done, failed };
}

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');

// The whole step, as the runners call it. Never throws: a failure is logged,
// notified, and returned as { ok: false }.
export async function autoWrite(brand, files, { verdict, apply = true, source = '' } = {}) {
  const label = brand.toUpperCase();
  try {
    if (verdict !== 'PASS') { log('[' + label + '] auto write SKIPPED: the verdict was ' + (verdict || 'missing') + ', not PASS'); return { ok: false, skipped: true }; }
    if (process.argv.includes('--no-write')) { log('[' + label + '] auto write SKIPPED: --no-write'); return { ok: false, skipped: true }; }
    if (fs.existsSync(OFF_SWITCH)) { log('[' + label + '] auto write SKIPPED: ' + OFF_SWITCH + ' exists (the off switch)'); return { ok: false, skipped: true }; }
    if (!secret()) throw new Error('no write secret in ' + SECRET_FILE);

    const plan = await planBrand(brand, files);
    const dry = await dryRun(plan.items);
    const j = judge(plan, dry);
    const held = Object.entries(plan.heldBack).map(([k, v]) => v + ' for ' + k).join(', ');
    log('[' + label + '] ' + (source ? source + ': ' : '') + plan.ticked + ' of ' + plan.scanned + ' products on Shopify, ' + plan.items.length + ' Needham rows'
      + (held ? ', held back ' + held : '') + ', ' + plan.removed + ' removed colourways zeroed (' + plan.removedUnits + ' units)');
    log('[' + label + '] dry run: ' + dry.change.length + ' to change (' + dry.activate + ' newly stocked at Needham, ' + j.zeroed + ' to 0), '
      + dry.unchanged + ' already match, ' + dry.notFound + ' not on Shopify. Needham units ' + j.before + ' to ' + j.after);
    if (!j.ok) {
      j.blocks.forEach((b) => log('[' + label + '] REFUSED: ' + b));
      log('[' + label + '] NOTHING WRITTEN. The file is still loaded on the inventory tool card for a person to look at.');
      notify(label + ': not written. ' + j.blocks[0]);
      return { ok: false, refused: true, blocks: j.blocks };
    }
    if (!dry.change.length) { log('[' + label + '] already in sync, nothing to write'); return { ok: true, written: 0 }; }
    if (!apply) { log('[' + label + '] dry run only (no --apply), nothing written'); return { ok: true, dryRun: true, changes: dry.change.length }; }

    const w = await writeChanges(dry.change);
    fs.mkdirSync(ROLLBACK_DIR, { recursive: true });
    const rb = path.join(ROLLBACK_DIR, brand + '-' + stamp() + '-rollback.json');
    fs.writeFileSync(rb, JSON.stringify({ brand, at: new Date().toISOString(), source, written: w.done, failed: w.failed }, null, 1));
    log('[' + label + '] WROTE ' + w.done.length + ' of ' + dry.change.length + ' to Needham' + (w.failed.length ? ', ' + w.failed.length + ' FAILED' : '') + '. Rollback: ' + rb);
    if (w.failed.length) notify(label + ': ' + w.failed.length + ' variants failed to write, see the log');
    return { ok: w.failed.length === 0, written: w.done.length, failed: w.failed.length, rollback: rb };
  } catch (e) {
    log('[' + label + '] auto write FAILED, nothing written: ' + e.message);
    notify(label + ': auto write failed. ' + e.message);
    return { ok: false, error: e.message };
  }
}

// Undo a run: put every variant back to its "from". A variant that was newly
// stocked (from null) goes back to 0. Dry run unless --apply.
async function restore(file, apply) {
  const rb = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = rb.written.map((w) => ({ sku: w.sku, quantity: w.from == null ? 0 : w.from }));
  const dry = await dryRun(items);
  console.log('restore ' + rb.brand + ' ' + rb.at + ': ' + dry.change.length + ' variants to put back, ' + dry.unchanged + ' already there');
  if (!apply) { console.log('dry run, add --apply to write'); return 0; }
  const w = await writeChanges(dry.change);
  log('[' + String(rb.brand).toUpperCase() + '] RESTORED ' + w.done.length + ' variants from ' + path.basename(file) + (w.failed.length ? ', ' + w.failed.length + ' failed' : ''));
  return w.failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const rest = args.filter((a) => a !== '--apply');
  (async () => {
    if (rest[0] === '--restore') return restore(rest[1], apply);
    const [brand, ...paths] = rest;
    if (!brand || !paths.length) { console.log('usage: node tools/auto-write.mjs <brand> <file> [<images.json>] [--apply]\n       node tools/auto-write.mjs --restore <rollback.json> [--apply]'); return 2; }
    const files = paths.map((p) => ({ name: path.basename(p), buf: fs.readFileSync(p) }));
    // By hand the verdict is the person's: the file was looked at.
    const r = await autoWrite(brand, files, { verdict: 'PASS', apply, source: 'by hand ' + path.basename(paths[0]) });
    return r.ok ? 0 : 1;
  })().then((c) => { process.exitCode = c; }, (e) => { console.error(e); process.exitCode = 1; });
}
