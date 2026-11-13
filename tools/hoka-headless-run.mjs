#!/usr/bin/env node
// hoka-headless-run.mjs, The Run House.
//
// HOKA stock, overnight, with nobody at the keyboard. HOKA is the one brand
// whose ATS file is not handed over: the portal (hokaus.deckersb2b.deckers.com)
// builds it and EMAILS a link, "Your Dynamic ATS Report will be emailed to you
// after generated", to needham@. So a run is three steps, found and verified
// 2026-11-13:
//
//   1. ask:   GET /order-center/api/v1/draftOrders/report/atsReport?seasonId=...
//             (auth is the portal's SessionToken, sent as "authorization:
//             Bearer <t>" AND "_t: <t>", which is what its own code does).
//             It answers 200 with an empty body; the email follows. Measured:
//             asked 11:08, email 11:09.
//   2. wait:  the needham@ Apps Script (tools/tracking-mailbox.gs) posts the
//             emailed link to the Worker (/feeds/link, allowlisted to Deckers'
//             report bucket); this polls for a link NEWER than the request.
//   3. fetch: the link opens without a login. The workbook is the
//             "<Season>_..._ATS_Report_<n>.xlsx" hoka-converter.js reads.
//
// The portal's own report list (/report/list) stays empty for these, so the
// email is the only way the file comes back. Checked 2026-11-13.
//
// It WRITES NOTHING TO SHOPIFY: it saves the file to ~/Downloads, runs it
// through the real converter with every model ticked, judges it against its
// own baseline and prints a verdict. A person still drops it and presses Write.
//
//   node tools/hoka-headless-run.mjs --setup                  log the profile in, once
//   node tools/hoka-headless-run.mjs                          ask, wait, download, judge
//   node tools/hoka-headless-run.mjs --keepalive              one visit, keeps the login warm
//   node tools/hoka-headless-run.mjs --accept-file <xlsx>     record a checked file as the baseline
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
import { reportLinks } from './feed-upload.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PROFILE = path.join(os.homedir(), '.runhouse-hoka-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9733;
const HOME = 'https://hokaus.deckersb2b.deckers.com/order-center/';
const BASELINE = path.join(ROOT, 'inventory-guardrail-baseline-hoka.json');
const WAIT_FOR_LINK_MIN = 45;   // the portal says "up to 30 mins"
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

// The real converter, every model ticked. In the tool the picker decides what
// is written; for the verdict the whole file is judged.
export async function convertWith(buf, name) {
  const require = createRequire(import.meta.url);
  const XLSX = require('xlsx');
  const sb = { console: { log() {}, warn() {}, error() {} }, module: { exports: {} }, XLSX,
    FileReader: class { readAsArrayBuffer(f) { f.arrayBuffer().then((b) => this.onload({ target: { result: b } })); } readAsText(f) { f.text().then((t) => this.onload({ target: { result: t } })); } } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'hoka-converter.js'), 'utf8') + '\n;globalThis.__C = HokaConverter;', sb);
  const C = sb.__C;
  const f = { name: name || 'hoka-ats.xlsx', arrayBuffer: async () => buf, text: async () => buf.toString() };
  const products = await C.scanFile(f);
  C.selectedProducts = new Set(products.map((p) => p.name).filter(Boolean));
  const inv = await C.convert(f);
  return { inv, csv: C.generateInventoryCSV(), models: products.length };
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
    console.log('  HOKA baseline recorded: later runs are judged against ' + path.basename(file) + '.');
    return true;
  } else if (accept) console.log('  NOT recorded as the baseline: a blocked file must not become the new normal.');
  return res.ok;
}

async function downloadAndJudge(url, t0) {
  // The Worker only ever holds Deckers report-bucket links (feeds.js), and
  // this checks again before fetching anything.
  if (!/^https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/us\.assets\.b2b\.deckers\.com\/company_\d+\/DynamicReports\/[^?#]*ATS_Report[^?#]*\.xlsx$/i.test(url)) {
    console.error('  REFUSED: the link is not a Deckers ATS report. No file written.'); return 1;
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(300000) });
  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok || buf.length < 100000 || buf.slice(0, 2).toString() !== 'PK') {
    console.error('  REFUSED: the report link did not give a workbook (status ' + r.status + ', ' + buf.length + ' bytes). No file written.'); return 1;
  }
  const server = decodeURIComponent(url.split('/').pop()).replace(/_\d+\.xlsx$/i, '').replace(/\.xlsx$/i, '');
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
  const out = path.join(os.homedir(), 'Downloads', server + ' nightly-' + stamp + '.xlsx');
  fs.writeFileSync(out, buf);
  let inv, csv, models;
  try { ({ inv, csv, models } = await convertWith(buf, path.basename(out))); }
  catch (e) { console.error('  REFUSED: the converter could not read it: ' + e.message); return 1; }
  const units = inv.reduce((s, x) => s + (Number(x['On hand (new)']) || 0), 0);
  console.log('  file   : ' + out);
  console.log('  rows   : ' + inv.length + ' sizes over ' + models + ' models, ' + units + ' units, in ' + Math.round((Date.now() - t0) / 60000) + ' min');
  return judge(csv, out, false) ? 0 : 1;
}

async function main() {
  if (has('--setup')) {
    const marker = 'data:text/html,' + encodeURIComponent('<title>HOKA SCRAPER LOGIN</title><body style="margin:0;background:#f97316;color:#111;font:700 34px system-ui;display:grid;place-items:center;height:100vh;text-align:center"><div>HOKA SCRAPER LOGIN WINDOW<br><span style="font-size:22px;font-weight:500">Log in to the HOKA B2B in the NEXT tab of THIS window.<br>Leave the window open; it is closed for you once you are in.</span></div></body>');
    console.log('Opening a SEPARATE Chrome on ' + PROFILE + '. Log into the HOKA B2B there.');
    spawn(CHROME, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1), '--no-first-run', '--no-default-browser-check',
      '--new-window', marker, HOME], { stdio: 'ignore', detached: true }).unref();
    await wait(4000);
    console.log((await findExisting(PORT + 1)) ? 'confirmed: a separate browser is running on this profile' : 'WARNING: no browser appeared. Quit Chrome and retry.');
    verdictReached = true; return 0;
  }

  const acceptFile = arg('--accept-file', '');
  if (acceptFile) {
    const { csv } = await convertWith(fs.readFileSync(acceptFile), path.basename(acceptFile));
    verdictReached = true;
    return judge(csv, acceptFile, true) ? 0 : 1;
  }

  const KEEPALIVE = has('--keepalive');
  const stamp0 = new Date().toLocaleString();
  if (await findExisting(PORT)) { console.log(stamp0 + '  skipped: another HOKA run is using the profile'); verdictReached = true; return KEEPALIVE ? 0 : 1; }
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
  await wait(8000);

  // Logged in is "the season list answers with the session token". The
  // portal keeps the token in storage, not a cookie, so a dead session is a
  // 401 here, never an empty season list read as "nothing to do".
  const t0 = Date.now();
  const r = JSON.parse((await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const tok = sessionStorage.getItem('SessionToken') || localStorage.getItem('SessionToken');
    if (!tok) return JSON.stringify({ ok: false, why: 'no session token' });
    const H = { Accept: 'application/json', authorization: 'Bearer ' + tok, _t: tok };
    const s = await fetch('/order-center/api/v1/catalog/seasons', { headers: H });
    if (!s.ok) return JSON.stringify({ ok: false, why: 'seasons ' + s.status });
    const rows = (((await s.json()).data || {}).rows) || [];
    const season = rows.find((x) => x.defaultSeason) || rows[0];
    if (!season) return JSON.stringify({ ok: false, why: 'no season' });
    if (${KEEPALIVE}) return JSON.stringify({ ok: true, keepalive: true, season: season.seasonName });
    // A price list is required; the season's own one ("HOKA-F26") if offered.
    // It changes only the price columns, never the stock.
    const pb = await fetch('/order-center/api/v1/order/option/priceBook', { headers: H });
    const books = pb.ok ? ((await pb.json()).data || []) : [];
    const book = books.find((b) => b.name === 'HOKA-' + season.seasonCode) || books[0] || {};
    const q = new URLSearchParams({ seasonId: String(season.seasonId), purchaseLimitIds: '', specialOrderForms: '', includeImage: 'false',
      useAtpLabels: 'false', includeSummaryTab: 'false', priceBookId: String(book.value || '') });
    const a = await fetch('/order-center/api/v1/draftOrders/report/atsReport?' + q, { headers: H });
    return JSON.stringify({ ok: a.ok, why: 'atsReport ' + a.status, season: season.seasonName, book: book.name || '' });
  })()` })).result.value);
  try { ws.close(); } catch (e) {}
  await shutOwn();
  if (!r.ok) {
    console.error(stamp0 + '  SESSION EXPIRED or refused (' + r.why + '): log the HOKA profile in again with --setup. No file written.');
    notify('HOKA scraper logged out', 'Run: node tools/hoka-headless-run.mjs --setup, and log in');
    verdictReached = true; return 1;
  }
  if (KEEPALIVE) { console.log(stamp0 + '  alive: HOKA B2B, ' + r.season); verdictReached = true; return 0; }
  console.log(stamp0 + '  asked for the ' + r.season + ' ATS report (price list ' + r.book + '); waiting for the email link');

  // A link received after the request was made (minus a minute of clock
  // slack). An older link would be yesterday's stock.
  const since = t0 - 60000;
  for (let i = 0; i < WAIT_FOR_LINK_MIN; i++) {
    const fresh = (await reportLinks('hoka')).find((l) => Date.parse(l.receivedAt) >= since);
    if (fresh) {
      console.log('  link   : arrived after ' + Math.round((Date.now() - t0) / 60000) + ' min (' + fresh.subject + ')');
      const code = await downloadAndJudge(fresh.url, t0);
      verdictReached = true; return code;
    }
    await wait(60000);
  }
  console.error('  NO LINK after ' + WAIT_FOR_LINK_MIN + ' minutes. Is the needham@ Apps Script running (tools/tracking-mailbox.gs)? No file written.');
  notify('HOKA report did not arrive', 'No ATS report link after ' + WAIT_FOR_LINK_MIN + ' minutes');
  verdictReached = true; return 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  process.on('exit', (code) => {
    if (!verdictReached && code === 0) { console.error('\nNO VERDICT REACHED. Treat this run as a failure. Nothing was written.'); process.exitCode = 1; }
  });
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('FAILED: ' + e.message); process.exitCode = 1; });
}
