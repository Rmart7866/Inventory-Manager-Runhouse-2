#!/usr/bin/env node
// puma-headless-run.mjs, The Run House.
//
// Puma stock, overnight, with nobody at the keyboard. The "Master ATS" file
// staff download from pumab2b.com is ONE request:
//
//   /api/catalogs/<Master / ATS id>.csv?csv[customer]=<no>&csv[data]=availability
//       &csv[date]=<today>&csv[include_future_date]=false&csv[exclude_zero_quantity]=false
//
// It answers with an Excel workbook despite the .csv: every Puma style, one
// row per size with "Quantity Available", which puma-converter.js already
// reads. Found 2026-11-13 from the file's own download origin.
//
// NOTHING ACCOUNT SPECIFIC IS WRITTEN HERE, because this repo is public. The
// customer number is read from /api/customers and the catalog from
// /api/catalogs BY NAME ("Master / ATS", the standing all-season ATS catalog;
// the seasonal ones are named "Fall-Holiday 2026 / ATS" and so on) each run.
//
// ONE REQUEST PER RUN: nothing like the ASICS quota lockout, and none of the
// 3,000 lines of page scraping in scrapers/puma.
//
// It WRITES NOTHING TO SHOPIFY. It saves the file to ~/Downloads, runs it
// through the real converter, judges it against its own baseline and prints a
// verdict. A person still drops the file and presses Write.
//
//   node tools/puma-headless-run.mjs --setup                  log the profile in, once
//   node tools/puma-headless-run.mjs                          download, convert, judge
//   node tools/puma-headless-run.mjs --keepalive              one visit, keeps the login warm
//   node tools/puma-headless-run.mjs --accept-file <xlsx>     record a checked file as the baseline
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
const PROFILE = path.join(os.homedir(), '.runhouse-puma-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9633;
const HOME = 'https://pumab2b.com/';
const CATALOG_NAME = 'Master / ATS';
const BASELINE = path.join(ROOT, 'inventory-guardrail-baseline-puma.json');
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
export async function convertWith(buf) {
  const require = createRequire(import.meta.url);
  const XLSX = require('xlsx');
  const sb = { console: { log() {}, warn() {}, error() {} }, module: { exports: {} }, XLSX };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'puma-converter.js'), 'utf8') + '\n;globalThis.__C = PumaConverter;', sb);
  const C = sb.__C;
  const inv = await C.convert({ name: 'puma-master-ats.xlsx', arrayBuffer: async () => buf, text: async () => buf.toString() });
  return { inv, csv: C.generateInventoryCSV() };
}

function judge(csv, file, accept) {
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
    console.log('  Puma baseline recorded: later runs are judged against ' + path.basename(file) + '.');
    return true;
  } else if (accept) console.log('  NOT recorded as the baseline: a blocked file must not become the new normal.');
  return res.ok;
}

async function main() {
  if (has('--setup')) {
    // A distinct port forces a separate browser; the orange first tab is there
    // because the Brooks login twice went into the everyday Chrome instead.
    const marker = 'data:text/html,' + encodeURIComponent('<title>PUMA SCRAPER LOGIN</title><body style="margin:0;background:#f97316;color:#111;font:700 34px system-ui;display:grid;place-items:center;height:100vh;text-align:center"><div>PUMA SCRAPER LOGIN WINDOW<br><span style="font-size:22px;font-weight:500">Log in to the Puma B2B in the NEXT tab of THIS window.<br>Leave the window open; it is closed for you once you are in.</span></div></body>');
    console.log('Opening a SEPARATE Chrome on ' + PROFILE + '. Log into the Puma B2B there.');
    spawn(CHROME, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1), '--no-first-run', '--no-default-browser-check',
      '--new-window', marker, HOME], { stdio: 'ignore', detached: true }).unref();
    await wait(4000);
    console.log((await findExisting(PORT + 1)) ? 'confirmed: a separate browser is running on this profile' : 'WARNING: no browser appeared. Quit Chrome and retry.');
    verdictReached = true; return 0;
  }

  const acceptFile = arg('--accept-file', '');
  if (acceptFile) {
    const { csv } = await convertWith(fs.readFileSync(acceptFile));
    verdictReached = true;
    return judge(csv, acceptFile, true) ? 0 : 1;
  }

  const KEEPALIVE = has('--keepalive');
  const stamp0 = new Date().toLocaleString();
  if (await findExisting(PORT)) { console.log(stamp0 + '  skipped: another Puma run is using the profile'); verdictReached = true; return KEEPALIVE ? 0 : 1; }
  let chrome = null;
  const killOwn = () => { if (chrome) { try { chrome.kill(); } catch (e) {} chrome = null; } };
  const shutOwn = async () => { const c = chrome; chrome = null; await closeChrome(c, PORT); };
  process.once('exit', killOwn);
  process.once('SIGINT', () => { killOwn(); process.exit(130); });
  process.once('SIGTERM', () => { killOwn(); process.exit(143); });
  let target = await findExisting(PORT + 1);   // the setup window, if still open
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
  await send('Page.navigate', { url: HOME });
  await wait(6000);

  // Logged in is "the customer list answers". A dead session answers 401 or
  // an HTML login page, and that must never be read as an empty account.
  const who = JSON.parse((await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    try {
      const r = await fetch('/api/customers', { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!r.ok) return JSON.stringify({ ok: false, status: r.status });
      const j = await r.json(); const c = (j.results || [])[0];
      return JSON.stringify({ ok: !!(c && c.number), customer: c && c.number, customers: (j.results || []).length });
    } catch (e) { return JSON.stringify({ ok: false, status: String(e) }); }
  })()` })).result.value);
  if (!who.ok) {
    console.error(stamp0 + '  SESSION EXPIRED: the profile is logged out of the Puma B2B (' + (who.status || 'no customer') + '). Run: node tools/puma-headless-run.mjs --setup, and log in. No file written.');
    notify('Puma scraper logged out', 'Run: node tools/puma-headless-run.mjs --setup, and log in');
    try { ws.close(); } catch (e) {}
    await shutOwn(); verdictReached = true; return 1;
  }
  if (KEEPALIVE) {
    console.log(stamp0 + '  alive: pumab2b.com, ' + who.customers + ' customer account(s)');
    try { ws.close(); } catch (e) {}
    await shutOwn(); verdictReached = true; return 0;
  }
  if (who.customers !== 1) console.log('  NOTE: ' + who.customers + ' customer accounts on this login; using the first.');

  const t0 = Date.now();
  const today = new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local
  const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const cats = await (await fetch('/api/catalogs', { credentials: 'include', headers: { Accept: 'application/json' } })).json();
    const cat = cats.find((c) => c.name === ${JSON.stringify(CATALOG_NAME)} && !c.archived);
    if (!cat) return JSON.stringify({ error: 'no catalog named ${CATALOG_NAME}: ' + cats.map((c) => c.name).join(', ') });
    const q = new URLSearchParams({ 'csv[customer]': ${JSON.stringify(who.customer)}, 'csv[data]': 'availability', 'csv[date]': ${JSON.stringify(today)},
      'csv[include_future_date]': 'false', 'csv[exclude_zero_quantity]': 'false' });
    const r = await fetch('/api/catalogs/' + cat._id + '.csv?' + q, { credentials: 'include' });
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return JSON.stringify({ status: r.status, type: r.headers.get('content-type') || '', b64: btoa(bin) });
  })()` }, 600000);
  try { ws.close(); } catch (e) {}
  await shutOwn();
  const o = JSON.parse(r.result.value);
  if (o.error) { console.error('  REFUSED: ' + o.error + '. No file written.'); verdictReached = true; return 1; }
  const buf = Buffer.from(o.b64, 'base64');
  // A real Master ATS is several MB. A login page or an error is HTML or a few
  // bytes and must never be saved as stock.
  if (o.status !== 200 || buf.length < 200000 || buf.slice(0, 2).toString() !== 'PK') {
    console.error('  REFUSED: Puma did not send a workbook (status ' + o.status + ', ' + o.type + ', ' + buf.length + ' bytes). No file written.');
    verdictReached = true; return 1;
  }
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
  const out = path.join(os.homedir(), 'Downloads', 'Master ATS nightly-' + stamp + '.xlsx');
  fs.writeFileSync(out, buf);
  let inv, csv;
  try { ({ inv, csv } = await convertWith(buf)); }
  catch (e) { console.error('  REFUSED: the converter could not read it: ' + e.message); verdictReached = true; return 1; }
  const units = inv.reduce((t, x) => t + (Number(x['On hand (new)']) || 0), 0);
  console.log('  file   : ' + out);
  console.log('  rows   : ' + inv.length + ' sizes, ' + units + ' units, in ' + Math.round((Date.now() - t0) / 1000) + 's');
  const ok = judge(csv, out, false);
  verdictReached = true;
  return ok ? 0 : 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  process.on('exit', (code) => {
    if (!verdictReached && code === 0) { console.error('\nNO VERDICT REACHED. Treat this run as a failure. Nothing was written.'); process.exitCode = 1; }
  });
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('FAILED: ' + e.message); process.exitCode = 1; });
}
