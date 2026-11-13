#!/usr/bin/env node
// wolverine-headless-run.mjs, The Run House.
//
// Saucony and Merrell stock, overnight, with nobody at the keyboard. Both are
// Wolverine brands on the same ordering portal ("Envoy"), one shared login:
//
//   https://saucony.orderwwwbrands.com/envoy/catalogs
//   https://merrell.orderwwwbrands.com/envoy/catalogs
//
// HOW THE FILE IS GOT. The catalogs page's "Export UPCs" action posts a hidden
// form to /api/b2b/products/excel with one field, formJSON:
//
//   { language, includeInventory, collectionCode, limitToExternalInventory, includePrices }
//
// and the answer IS the "CatalogUPCs-...xlsx" staff download by hand, the file
// saucony-converter.js and merrell-converter.js already read. includeInventory
// defaults to OFF in that dialog, so it is set here. Found 2026-11-13 from the
// files' own download origin, then verified the same day: both brands answered
// in about 20 seconds, the server's own filenames, and run through the real
// converters they match the hand downloads (Saucony 9,727 rows both times).
//
// ONE REQUEST PER BRAND PER RUN. No per-style sweep, so nothing like the
// ASICS quota lockout of the same night.
//
// It WRITES NOTHING TO SHOPIFY. It saves the files to ~/Downloads, judges
// each with the inventory guardrail against its own baseline, and prints a
// verdict. A person still drops the file and presses Write.
//
//   node tools/wolverine-headless-run.mjs --setup                 log the profile in, once (one login covers both)
//   node tools/wolverine-headless-run.mjs                         download + judge both brands
//   node tools/wolverine-headless-run.mjs --brand saucony         one brand
//   node tools/wolverine-headless-run.mjs --keepalive             one visit, keeps the login warm
//   node tools/wolverine-headless-run.mjs --accept-file <xlsx> --brand <b>   record a checked file as that brand's baseline
//
// House style: no em dashes.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { check, rowsFromCSV, LIMITS, BASELINE_VERSION } from './inventory-guardrail.mjs';
import { closeChrome } from './headless-close.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PROFILE = path.join(os.homedir(), '.runhouse-wolverine-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9533;
// The At-Once catalog of each brand: what ships now, which is what a shopper
// buys. Codes read off the live catalogs page 2026-11-13. If Wolverine renames
// one the run fails loudly (no file), it does not quietly fetch another season.
export const BRANDS = {
  saucony: { url: 'https://saucony.orderwwwbrands.com/envoy/catalogs', collection: 'US-SA-AO-PERFORMANCE', converter: 'saucony-converter.js', global: 'SauconyConverter' },
  merrell: { url: 'https://merrell.orderwwwbrands.com/envoy/catalogs', collection: 'US-MERRELL-FOOT-COPY-74', converter: 'merrell-converter.js', global: 'MerrellConverter' },
};
const baselineFor = (b) => path.join(ROOT, 'inventory-guardrail-baseline-' + b + '.json');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let verdictReached = false;

async function findExisting(port) {
  try {
    const list = await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(2000) })).json();
    return list.find((t) => t.type === 'page') || null;
  } catch (e) { return null; }
}

function notify(title, msg) {
  try { execFileSync('osascript', ['-e', 'display notification "' + msg + '" with title "' + title + '"']); } catch (e) { /* the log is the record */ }
}

// A CDP client with a deadline on every call and a dead socket rejecting all
// that is outstanding: a hung await must never let node exit 0 having done nothing.
let nextId = 1;
function cdp(ws) {
  const pending = new Map(); let dead = null;
  const killAll = (why) => { dead = why; for (const [, p] of pending) p.rej(new Error(why)); pending.clear(); };
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id).ok(m); pending.delete(m.id); } });
  ws.addEventListener('close', () => killAll('the browser target closed mid run'));
  ws.addEventListener('error', () => killAll('the browser connection errored mid run'));
  return (method, params = {}, ms = 90000) => new Promise((res, rej) => {
    if (dead) return rej(new Error(dead));
    const id = nextId++;
    const timer = setTimeout(() => { if (pending.delete(id)) rej(new Error(method + ' got no reply in ' + ms / 1000 + 's')); }, ms);
    pending.set(id, { ok: (m) => { clearTimeout(timer); m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// The real converter, the one inventory.html loads, so the verdict judges the
// rows the tool would actually write.
export function convertWith(brand, buf) {
  const require = createRequire(import.meta.url);
  const XLSX = require('xlsx');
  const sb = { console: { log() {}, warn() {}, error() {} }, module: { exports: {} }, XLSX };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, BRANDS[brand].converter), 'utf8') + '\n;globalThis.__C = ' + BRANDS[brand].global + ';', sb);
  const C = sb.__C;
  return C.convert({ name: brand + '.xlsx', arrayBuffer: async () => buf }).then((inv) => ({ inv, csv: C.generateInventoryCSV() }));
}

function judge(brand, csv, file, accept) {
  const BASELINE = baselineFor(brand);
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const res = check(rowsFromCSV(csv), baseline);
  res.warnings.forEach((w) => console.log('  WARN   ' + w));
  res.blocks.forEach((b) => console.log('  BLOCK  ' + b));
  console.log((res.ok ? '  PASS. Safe to import ' : '  BLOCKED. Do not import ') + path.basename(file));
  const onlyNoBaseline = !res.ok && res.blocks.length > 0 && res.blocks.every((b) => /^NO BASELINE/.test(b));
  if (accept && (res.ok || onlyNoBaseline)) {
    const groupZeroShare = {};
    for (const [b, s] of Object.entries(res.summary.brands)) if (s.rows >= 20 && s.rows / res.summary.rows >= LIMITS.minGroupShare) groupZeroShare[b] = s.zeros / s.rows;
    fs.writeFileSync(BASELINE, JSON.stringify({ v: BASELINE_VERSION, at: new Date().toISOString(), file: path.basename(file),
      rows: res.summary.rows, units: res.summary.units, atCapShare: res.summary.atCapShare, cap: res.summary.cap,
      zeroShare: res.summary.zeroShare, groupZeroShare, locations: res.summary.locations }, null, 2));
    console.log('  ' + brand + ' baseline recorded: later runs are judged against ' + path.basename(file) + '.');
    return true;   // recording it is what was asked, and it succeeded
  } else if (accept) console.log('  NOT recorded as the baseline: a blocked file must not become the new normal.');
  return res.ok;
}

async function main() {
  if (has('--setup')) {
    // A distinct port forces a separate browser: macOS otherwise hands the url
    // to the Chrome already running and the login lands in the wrong profile.
    // The orange first tab is there because the Brooks login twice went into
    // the everyday Chrome, which looks just like this window.
    const marker = 'data:text/html,' + encodeURIComponent('<title>SAUCONY + MERRELL SCRAPER LOGIN</title><body style="margin:0;background:#f97316;color:#111;font:700 32px system-ui;display:grid;place-items:center;height:100vh;text-align:center"><div>SAUCONY + MERRELL SCRAPER LOGIN WINDOW<br><span style="font-size:21px;font-weight:500">Log in in the NEXT tab of THIS window (one login covers both brands).<br>Leave the window open; it is closed for you once you are in.</span></div></body>');
    console.log('Opening a SEPARATE Chrome on ' + PROFILE + '. Log in there.');
    spawn(CHROME, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1), '--no-first-run', '--no-default-browser-check',
      '--new-window', marker, BRANDS.saucony.url, BRANDS.merrell.url], { stdio: 'ignore', detached: true }).unref();
    await wait(4000);
    console.log((await findExisting(PORT + 1)) ? 'confirmed: a separate browser is running on this profile' : 'WARNING: no browser appeared. Quit Chrome and retry.');
    verdictReached = true; return 0;
  }

  const acceptFile = arg('--accept-file', '');
  if (acceptFile) {
    const brand = arg('--brand', '');
    if (!BRANDS[brand]) { console.error('--accept-file needs --brand saucony or --brand merrell'); verdictReached = true; return 1; }
    const { csv } = await convertWith(brand, fs.readFileSync(acceptFile));
    verdictReached = true;
    return judge(brand, csv, acceptFile, true) ? 0 : 1;
  }

  const KEEPALIVE = has('--keepalive');
  const only = arg('--brand', '');
  const todo = only ? [only] : Object.keys(BRANDS);
  if (todo.some((b) => !BRANDS[b])) { console.error('unknown --brand ' + only); verdictReached = true; return 1; }
  const stamp0 = new Date().toLocaleString();

  if (await findExisting(PORT)) {
    console.log(stamp0 + '  skipped: another Wolverine run is using the profile, and keeps it alive');
    verdictReached = true; return KEEPALIVE ? 0 : 1;
  }
  let chrome = null;
  const killOwn = () => { if (chrome) { try { chrome.kill(); } catch (e) {} chrome = null; } };
  const shutOwn = async () => { const c = chrome; chrome = null; await closeChrome(c, PORT); };
  process.once('exit', killOwn);
  process.once('SIGINT', () => { killOwn(); process.exit(130); });
  process.once('SIGTERM', () => { killOwn(); process.exit(143); });
  let target = await findExisting(PORT + 1);   // the setup window, if it is still open
  const port = target ? PORT + 1 : PORT;
  if (!target) {
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 40 && !target; i++) { await wait(300); target = await findExisting(PORT); }
  }
  if (!target) { console.error(stamp0 + '  No browser available. Close any Chrome window open on ' + PROFILE + '.'); verdictReached = true; return 1; }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = cdp(ws);
  await send('Page.enable');

  let allOk = true;
  for (const brand of todo) {
    const B = BRANDS[brand];
    await send('Page.navigate', { url: B.url });
    let where = '';
    for (let t = 0; t < 30; t++) {
      await wait(1000);
      where = (await send('Runtime.evaluate', { returnByValue: true, expression: 'document.readyState + " " + location.href' })).result.value || '';
      if (/^complete /.test(where) && (/\/envoy\/catalogs/.test(where) || /login/i.test(where))) break;
    }
    if (/login/i.test(where) || !/\/envoy\/catalogs/.test(where)) {
      console.error(stamp0 + '  SESSION EXPIRED: the profile is logged out of the Wolverine portal. Run: node tools/wolverine-headless-run.mjs --setup, and log in. No file written.');
      notify('Saucony / Merrell scraper logged out', 'Run: node tools/wolverine-headless-run.mjs --setup, and log in');
      await shutOwn(); verdictReached = true; return 1;
    }
    if (KEEPALIVE) { console.log(stamp0 + '  ' + brand + ' alive: ' + where.replace(/^complete /, '').split('?')[0]); continue; }

    console.log('\n=== ' + brand + '  (' + B.collection + ')');
    const t0 = Date.now();
    const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const formJSON = JSON.stringify({ language: 'en', includeInventory: true, collectionCode: ${JSON.stringify(B.collection)}, limitToExternalInventory: false, includePrices: true });
      const r = await fetch('/api/b2b/products/excel', { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'formJSON=' + encodeURIComponent(formJSON) });
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return JSON.stringify({ status: r.status, type: r.headers.get('content-type') || '', disp: r.headers.get('content-disposition') || '', b64: btoa(bin) });
    })()` }, 300000);
    const o = JSON.parse(r.result.value);
    const buf = Buffer.from(o.b64, 'base64');
    // A real CatalogUPCs file is about 700 to 800 KB. A login page or an error
    // answers with HTML or a few bytes, and must never be saved as stock.
    if (o.status !== 200 || !/xlsx|spreadsheet|octet/.test(o.type) || buf.length < 50000 || buf.slice(0, 2).toString() !== 'PK') {
      console.error('  REFUSED: the portal did not send a workbook (status ' + o.status + ', ' + o.type + ', ' + buf.length + ' bytes). No file written.');
      allOk = false; continue;
    }
    const server = (o.disp.match(/filename="?([^";]+)/) || [])[1] || ('CatalogUPCs-' + brand + '.xlsx');
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
    const out = path.join(os.homedir(), 'Downloads', server.replace(/\s*\.xlsx$/i, '').trim() + ' nightly-' + stamp + '.xlsx');
    fs.writeFileSync(out, buf);
    let inv, csv;
    try { ({ inv, csv } = await convertWith(brand, buf)); }
    catch (e) { console.error('  REFUSED: the converter could not read it: ' + e.message); allOk = false; continue; }
    const units = inv.reduce((t, x) => t + (Number(x['On hand (new)']) || 0), 0);
    console.log('  file   : ' + out);
    console.log('  rows   : ' + inv.length + ' sizes, ' + units + ' units, in ' + Math.round((Date.now() - t0) / 1000) + 's');
    if (!judge(brand, csv, out, false)) allOk = false;
  }

  try { ws.close(); } catch (e) {}
  await shutOwn();
  verdictReached = true;
  if (KEEPALIVE) return 0;
  console.log('\n' + (allOk ? 'PASS for ' + todo.join(' and ') : 'NOT ALL PASSED. Check the lines above before importing anything.'));
  return allOk ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  process.on('exit', (code) => {
    if (!verdictReached && code === 0) { console.error('\nNO VERDICT REACHED. Treat this run as a failure. Nothing was written.'); process.exitCode = 1; }
  });
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('FAILED: ' + e.message); process.exitCode = 1; });
}
