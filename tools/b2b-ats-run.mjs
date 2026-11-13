// b2b-ats-run.mjs, The Run House.
//
// ONE RUNNER FOR EVERY BRAND ON THE SAME B2B PLATFORM. Puma (pumab2b.com) and
// Altra (b2b.altrarunning.com) sit on one ordering platform, and both give
// their available-to-sell file as ONE request:
//
//   /api/catalogs/<catalog id>.csv?csv[customer]=<no>&csv[data]=availability
//       &csv[date]=<today>&csv[include_future_date]=false&csv[exclude_zero_quantity]=false
//
// an Excel workbook despite the .csv: one row per size with "Quantity
// Available", which the brand's converter already reads. Found 2026-11-13 from
// the files' own download origin (Puma's "Master ATS", Altra's "Fall 26 US").
// New Balance's export is described as identical, so it is the likely third.
//
// NOTHING ACCOUNT SPECIFIC IS WRITTEN HERE, because this repo is public. The
// customer number is read from /api/customers and the catalog from
// /api/catalogs by a per-brand RULE each run.
//
// ONE REQUEST PER RUN, so nothing like the ASICS quota lockout. It WRITES
// NOTHING TO SHOPIFY: it saves the file to ~/Downloads, runs it through the
// brand's real converter, judges it against that brand's baseline and prints
// a verdict. A person still drops the file and presses Write.
//
// Each brand has a thin entry file (tools/puma-headless-run.mjs,
// tools/altra-headless-run.mjs) that passes its config to runAts().
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
import { uploadWorkbook } from './feed-upload.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The last verdict, so the upload to the inventory tool carries it.
let lastJudgement = null;

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

// The brand's real converter, the one inventory.html loads, so the verdict
// judges the rows the tool would actually write.
export async function convertWith(cfg, buf) {
  const require = createRequire(import.meta.url);
  const XLSX = require('xlsx');
  // The timers the browser gives a converter for free (Altra's yields with
  // setTimeout between batches).
  const sb = { console: { log() {}, warn() {}, error() {} }, module: { exports: {} }, XLSX, setTimeout, clearTimeout, setInterval, clearInterval };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, cfg.converter), 'utf8') + '\n;globalThis.__C = ' + cfg.converterGlobal + ';', sb);
  const C = sb.__C;
  const inv = await C.convert({ name: cfg.key + '-ats.xlsx', arrayBuffer: async () => buf, text: async () => buf.toString() });
  return { inv, csv: C.generateInventoryCSV() };
}

function judge(cfg, csv, file, accept) {
  const BASELINE = path.join(ROOT, 'inventory-guardrail-baseline-' + cfg.key + '.json');
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const res = check(rowsFromCSV(csv), baseline);
  lastJudgement = { verdict: res.ok ? 'PASS' : 'BLOCKED', reasons: res.blocks.concat(res.warnings), rows: res.summary.rows, units: res.summary.units };
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
    console.log('  ' + cfg.label + ' baseline recorded: later runs are judged against ' + path.basename(file) + '.');
    return true;
  } else if (accept) console.log('  NOT recorded as the baseline: a blocked file must not become the new normal.');
  return res.ok;
}

// The catalog rule runs IN THE PAGE, so it travels as data:
//   { name: 'Master / ATS' }                      exactly that catalog
//   { pattern: '^Fall \\d\\d US$|...', ... }        the ATS catalog whose name matches,
//                                                   preferring one whose dates cover today
export async function runAts(cfg) {
  const argv = process.argv;
  const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
  const has = (n) => argv.includes(n);
  const PROFILE = path.join(os.homedir(), '.runhouse-' + cfg.key + '-profile');
  const PORT = cfg.port;
  const me = 'node tools/' + cfg.key + '-headless-run.mjs';

  if (has('--setup')) {
    // A distinct port forces a separate browser; the orange first tab is there
    // because the Brooks login twice went into the everyday Chrome instead.
    const L = cfg.label.toUpperCase();
    const marker = 'data:text/html,' + encodeURIComponent('<title>' + L + ' SCRAPER LOGIN</title><body style="margin:0;background:#f97316;color:#111;font:700 34px system-ui;display:grid;place-items:center;height:100vh;text-align:center"><div>' + L + ' SCRAPER LOGIN WINDOW<br><span style="font-size:22px;font-weight:500">Log in to the ' + cfg.label + ' B2B in the NEXT tab of THIS window.<br>Leave the window open; it is closed for you once you are in.</span></div></body>');
    console.log('Opening a SEPARATE Chrome on ' + PROFILE + '. Log into the ' + cfg.label + ' B2B there.');
    spawn(CHROME, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1), '--no-first-run', '--no-default-browser-check',
      '--new-window', marker, cfg.loginUrl || cfg.home], { stdio: 'ignore', detached: true }).unref();
    await wait(4000);
    console.log((await findExisting(PORT + 1)) ? 'confirmed: a separate browser is running on this profile' : 'WARNING: no browser appeared. Quit Chrome and retry.');
    return 0;
  }

  const acceptFile = arg('--accept-file', '');
  if (acceptFile) {
    const { csv } = await convertWith(cfg, fs.readFileSync(acceptFile));
    return judge(cfg, csv, acceptFile, true) ? 0 : 1;
  }

  const KEEPALIVE = has('--keepalive');
  const stamp0 = new Date().toLocaleString();
  if (await findExisting(PORT)) { console.log(stamp0 + '  skipped: another ' + cfg.label + ' run is using the profile'); return KEEPALIVE ? 0 : 1; }
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
  if (!target) { console.error(stamp0 + '  No browser available. Close any Chrome window open on ' + PROFILE + '.'); return 1; }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = cdp(ws);
  await send('Page.enable');
  await send('Page.navigate', { url: cfg.home });
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
  // NO NETWORK IS NOT A LOGOUT. On 2026-11-13 the Puma keep-alive reported
  // "logged out" at 2:20 and 3:29 with "Failed to fetch": the Mac had been
  // asleep and the check ran on wake before wifi was back, while the login
  // itself was fine (alive at 5:08 with no new login). A thrown fetch says
  // so and asks for nothing; only an HTTP refusal means log in again.
  if (!who.ok && /TypeError|Failed to fetch|NetworkError|ERR_/i.test(String(who.status))) {
    console.error(stamp0 + '  NO NETWORK: could not reach ' + new URL(cfg.home).host + ' (' + who.status + '). Not a logout; the next run will try again. No file written.');
    try { ws.close(); } catch (e) {}
    await shutOwn(); return 1;
  }
  if (!who.ok) {
    console.error(stamp0 + '  SESSION EXPIRED: the profile is logged out of the ' + cfg.label + ' B2B (' + (who.status || 'no customer') + '). Run: ' + me + ' --setup, and log in. No file written.');
    notify(cfg.label + ' scraper logged out', 'Run: ' + me + ' --setup, and log in');
    try { ws.close(); } catch (e) {}
    await shutOwn(); return 1;
  }
  if (KEEPALIVE) {
    console.log(stamp0 + '  alive: ' + new URL(cfg.home).host + ', ' + who.customers + ' customer account(s)');
    try { ws.close(); } catch (e) {}
    await shutOwn(); return 0;
  }
  if (who.customers !== 1) console.log('  NOTE: ' + who.customers + ' customer accounts on this login; using the first.');

  const t0 = Date.now();
  const today = new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD, local
  const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    const rule = ${JSON.stringify(cfg.catalog)};
    const cats = await (await fetch('/api/catalogs', { credentials: 'include', headers: { Accept: 'application/json' } })).json();
    const live = cats.filter((c) => !c.archived);
    let cat;
    // BY ID: New Balance's drop ship catalog does not appear in the list at
    // all, yet answers when asked for by id (2026-11-13). If NB replaces it,
    // the file request below fails and the run refuses; it never falls back.
    if (rule.id) cat = { _id: rule.id, name: rule.label || rule.id };
    else if (rule.name) cat = live.find((c) => c.name === rule.name);
    else {
      const re = new RegExp(rule.pattern, 'i');
      const m = live.filter((c) => re.test(c.name || '') && (!rule.classification || c.classification === rule.classification));
      // Prefer the one whose dates cover today, then the newest.
      const covers = (c) => { const d = c.dates || {}; const s = Date.parse(d.start || d.start_date || c.start_date || ''), e = Date.parse(d.end || d.end_date || c.end_date || ''); const t = Date.now(); return (!s || s <= t) && (!e || e >= t); };
      m.sort((a, b) => (covers(b) - covers(a)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
      cat = m[0];
    }
    if (!cat) return JSON.stringify({ error: 'no catalog matches ' + JSON.stringify(rule) + ': ' + live.map((c) => c.name + ' (' + c.classification + ')').join(', ') });
    const q = new URLSearchParams({ 'csv[customer]': ${JSON.stringify(who.customer)}, 'csv[data]': 'availability', 'csv[date]': ${JSON.stringify(today)},
      'csv[include_future_date]': 'false', 'csv[exclude_zero_quantity]': 'false' });
    const r = await fetch('/api/catalogs/' + cat._id + '.csv?' + q, { credentials: 'include' });
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return JSON.stringify({ status: r.status, type: r.headers.get('content-type') || '', name: cat.name, b64: btoa(bin) });
  })()` }, 600000);
  try { ws.close(); } catch (e) {}
  await shutOwn();
  const o = JSON.parse(r.result.value);
  if (o.error) { console.error('  REFUSED: ' + o.error + '. No file written.'); return 1; }
  const buf = Buffer.from(o.b64, 'base64');
  // A real file is hundreds of KB to several MB. A login page or an error is
  // HTML or a few bytes and must never be saved as stock.
  if (o.status !== 200 || buf.length < 100000 || buf.slice(0, 2).toString() !== 'PK') {
    console.error('  REFUSED: ' + cfg.label + ' did not send a workbook (status ' + o.status + ', ' + o.type + ', ' + buf.length + ' bytes). No file written.');
    return 1;
  }
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
  const out = path.join(os.homedir(), 'Downloads', cfg.filePrefix + ' nightly-' + stamp + '.xlsx');
  fs.writeFileSync(out, buf);
  let inv, csv;
  try { ({ inv, csv } = await convertWith(cfg, buf)); }
  catch (e) { console.error('  REFUSED: the converter could not read it: ' + e.message); return 1; }
  const units = inv.reduce((t, x) => t + (Number(x['On hand (new)']) || 0), 0);
  console.log('  catalog: ' + o.name);
  console.log('  file   : ' + out);
  console.log('  rows   : ' + inv.length + ' sizes, ' + units + ' units, in ' + Math.round((Date.now() - t0) / 1000) + 's');
  const ok = judge(cfg, csv, out, false);
  // To the inventory tool, PASS or BLOCKED (the card keeps Write off on a
  // blocked file), with the wholesale columns stripped first. Never fatal.
  await uploadWorkbook(cfg.key, buf, { ...lastJudgement, file: path.basename(out), capturedAt: new Date().toISOString() });
  return ok ? 0 : 1;
}

// Entry helper for the thin per-brand files: a verdict or an explicit failure,
// never a silent exit 0.
export function main(cfg) {
  let done = false;
  process.on('exit', (code) => {
    if (!done && code === 0) { console.error('\nNO VERDICT REACHED. Treat this run as a failure. Nothing was written.'); process.exitCode = 1; }
  });
  runAts(cfg).then((c) => { done = true; process.exitCode = c; })
    .catch((e) => { done = true; console.error('FAILED: ' + e.message); process.exitCode = 1; });
}
