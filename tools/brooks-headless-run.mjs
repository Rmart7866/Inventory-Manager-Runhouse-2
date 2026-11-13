// brooks-headless-run.mjs, The Run House. Built 2026-11-12 on owner request.
//
// The Brooks FULL CATALOG with nobody at the keyboard: every style FastTrack
// lists as shippable now, shoes and apparel, in one file in Downloads, judged
// by the guardrail. It WRITES NOTHING TO SHOPIFY; a person still imports.
//
//   node tools/brooks-headless-run.mjs --setup          log the profile in, once
//   node tools/brooks-headless-run.mjs                  sweep, check, write a CSV
//   node tools/brooks-headless-run.mjs --smoke 3        the whole path on 3 styles, always blocked
//   node tools/brooks-headless-run.mjs --keepalive      one visit, keeps the login warm
//   node tools/brooks-headless-run.mjs --accept-file <csv>   record a checked file as the baseline
//
// IT REIMPLEMENTS NOTHING. Everything that decides a number is read off disk
// from the extension and evaluated in the page:
//   scrapers/brooks/token.js       picks up the bearer token FastTrack itself sends
//   scrapers/brooks/content.js     brooksFullCatalogSweep and the record helpers,
//                                  the same function the Full catalog button runs
//   scrapers/brooks/background.js  convertToBrooksInventoryCSV, the file builder
// A fix in the extension reaches this for free.
//
// A sweep takes about 90 seconds (measured 2026-11-12: 298 styles, 0 errors),
// so unlike ASICS this can run several times a day.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { check, rowsFromCSV, LIMITS, BASELINE_VERSION } from './inventory-guardrail.mjs';
import { uploadFeed } from './feed-upload.mjs';
import { closeChrome } from './headless-close.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PROFILE = path.join(os.homedir(), '.runhouse-brooks-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9433;
const HOME = 'https://fasttrack.brooksrunning.com/home';
const BASELINE = path.join(ROOT, 'inventory-guardrail-baseline-brooks-fullcatalog.json');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let verdictReached = false;

// A CDP client with a deadline on every call, and a dead socket rejecting
// everything outstanding: the ASICS runner's lesson, a hung await that lets
// node drain and exit 0 having done nothing.
let nextId = 1;
function cdp(ws) {
  const pending = new Map(); let dead = null;
  const killAll = (why) => { dead = why; for (const [, p] of pending) p.rej(new Error(why)); pending.clear(); };
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id).ok(m); pending.delete(m.id); } });
  ws.addEventListener('close', () => killAll('the browser target closed mid run'));
  ws.addEventListener('error', () => killAll('the browser connection errored mid run'));
  return (method, params = {}) => new Promise((res, rej) => {
    if (dead) return rej(new Error(dead));
    const id = nextId++;
    const timer = setTimeout(() => { if (pending.delete(id)) rej(new Error(method + ' got no reply in 60s')); }, 60000);
    pending.set(id, { ok: (m) => { clearTimeout(timer); m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function findExisting(port) {
  try { return (await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1500) })).json()).find((t) => t.type === 'page') || null; } catch (e) { return null; }
}
function notify(title, text) {
  try { execFileSync('osascript', ['-e', 'display notification ' + JSON.stringify(text) + ' with title ' + JSON.stringify(title)]); } catch (e) { /* a courtesy; the log is the record */ }
}

// The real file builder. background.js ends in chrome listeners, so it gets a stub.
export function loadBrooksBackground(root = ROOT) {
  const src = fs.readFileSync(path.join(root, 'scrapers/brooks/background.js'), 'utf8');
  const noop = () => {};
  const chrome = { runtime: { onMessage: { addListener: noop }, onStartup: { addListener: noop }, onInstalled: { addListener: noop } },
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } }, downloads: { download: async () => 1 },
    tabs: { query: async () => [], sendMessage: async () => {} } };
  return new Function('chrome', 'console', src + '\n;return brooksCSVManager;')(chrome, { log: noop, warn: noop, error: noop });
}

// Top level functions out of content.js, by name, so the page runs the
// extension's own sweep rather than a copy.
export function extensionFunctions(root = ROOT) {
  const src = fs.readFileSync(path.join(root, 'scrapers/brooks/content.js'), 'utf8');
  const take = (name) => {
    let i = src.indexOf('async function ' + name + '(');
    if (i < 0) i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('content.js has no function ' + name + ', the runner must be updated');
    let d = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); }
    throw new Error('unbalanced braces reading ' + name);
  };
  return ['brooksNowQuantity', 'brooksFeedQuantity', 'brooksFeedGender', 'brooksRetailPrice', 'brooksCatalogRecords', 'brooksFullCatalogSweep'].map(take).join('\n');
}

let lastJudgement = null;
function judge(csv, file, accept) {
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const res = check(rowsFromCSV(csv), baseline);
  lastJudgement = { verdict: res.ok ? 'PASS' : 'BLOCKED', reasons: res.blocks.concat(res.warnings), rows: res.summary.rows, units: res.summary.units };
  console.log('');
  res.warnings.forEach((w) => console.log('  WARN   ' + w));
  res.blocks.forEach((b) => console.log('  BLOCK  ' + b));
  console.log('\n' + (res.ok ? 'PASS. Safe to import ' + path.basename(file) : 'BLOCKED. Do not import this file.'));
  verdictReached = true;
  // The one block accept may clear is the missing baseline, as the guardrail's own --accept.
  const onlyNoBaseline = !res.ok && res.blocks.length > 0 && res.blocks.every((b) => /^NO BASELINE/.test(b));
  if (accept && (res.ok || onlyNoBaseline)) {
    const groupZeroShare = {};
    for (const [b, s] of Object.entries(res.summary.brands)) if (s.rows >= 20 && s.rows / res.summary.rows >= LIMITS.minGroupShare) groupZeroShare[b] = s.zeros / s.rows;
    fs.writeFileSync(BASELINE, JSON.stringify({ v: BASELINE_VERSION, at: new Date().toISOString(), file: path.basename(file),
      rows: res.summary.rows, units: res.summary.units, atCapShare: res.summary.atCapShare, cap: res.summary.cap,
      zeroShare: res.summary.zeroShare, groupZeroShare, locations: res.summary.locations }, null, 2));
    console.log('Brooks full catalog baseline recorded: later runs are judged against ' + path.basename(file) + '.');
  } else if (accept) console.log('NOT recorded as the baseline: a blocked run must not become the new normal.');
  return res.ok ? 0 : 1;
}

async function main() {
  if (has('--setup')) {
    // A distinct port forces a separate browser: macOS otherwise hands the
    // url to the Chrome already running and the login lands in the wrong profile.
    console.log('Opening a SEPARATE Chrome on ' + PROFILE + '. Log into FastTrack there, then close that window.');
    // An unmistakable first tab. Twice on 2026-11-12 the login went into the
    // everyday Chrome instead, because this window looks just like it.
    const marker = 'data:text/html,' + encodeURIComponent('<title>BROOKS SCRAPER LOGIN</title><body style="margin:0;background:#f97316;color:#111;font:700 34px system-ui;display:grid;place-items:center;height:100vh;text-align:center"><div>BROOKS SCRAPER LOGIN WINDOW<br><span style="font-size:22px;font-weight:500">Log in to FastTrack in the NEXT tab of THIS window.<br>Then close this whole window.</span></div></body>');
    spawn(CHROME, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1), '--no-first-run', '--no-default-browser-check', '--new-window', marker, HOME],
      { stdio: 'ignore', detached: true }).unref();
    await wait(4000);
    console.log((await findExisting(PORT + 1)) ? 'confirmed: a separate browser is running on this profile' : 'WARNING: no browser appeared. Quit Chrome and retry.');
    verdictReached = true; return 0;
  }
  const acceptFile = arg('--accept-file', '');
  if (acceptFile) return judge(fs.readFileSync(acceptFile, 'utf8'), acceptFile, true);
  const KEEPALIVE = has('--keepalive');
  const SMOKE = Math.max(0, Number(arg('--smoke', '0')) || 0);
  const stamp0 = new Date().toLocaleString();

  if (await findExisting(PORT)) {
    // Another run holds the profile, and keeps the login warm itself.
    console.log(stamp0 + '  skipped: another Brooks run is using the profile');
    verdictReached = true; return KEEPALIVE ? 0 : 1;
  }
  let chrome = null;
  const killOwn = () => { if (chrome) { try { chrome.kill(); } catch (e) {} chrome = null; } };
  // Every normal exit closes through the browser so the reissued login is SAVED;
  // killOwn stays for the exit and signal handlers, which cannot wait. See
  // headless-close.mjs for why a kill was logging the profile out.
  const shutOwn = async () => { const c = chrome; chrome = null; await closeChrome(c, PORT); };
  process.once('exit', killOwn);
  process.once('SIGINT', () => { killOwn(); process.exit(130); });
  process.once('SIGTERM', () => { killOwn(); process.exit(143); });
  let target = await findExisting(PORT + 1);
  if (!target) {
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 40 && !target; i++) { await wait(300); target = await findExisting(PORT); }
  }
  if (!target) { console.error(stamp0 + '  No browser available. Close any Chrome window open on ' + PROFILE + '.'); verdictReached = true; return 1; }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = cdp(ws);
  await send('Page.enable'); await send('Runtime.enable');
  // token.js before FastTrack's own code, plus a listener keeping the latest token.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(ROOT, 'scrapers/brooks/token.js'), 'utf8') +
    "\n;window.addEventListener('message', function (e) { if (e.data && e.data.source === 'rh-brooks-token') window.__rhToken = e.data.token; });" });
  await send('Page.navigate', { url: HOME });

  let where = '', token = false;
  for (let t = 0; t < 45 && !token; t++) {
    await wait(1000);
    const r = await send('Runtime.evaluate', { returnByValue: true, expression: 'JSON.stringify({ href: location.href, token: !!window.__rhToken })' });
    const s = JSON.parse(r.result.value || '{}'); where = s.href || ''; token = s.token;
    if (/authentication\/login|\/login/i.test(where)) break;
  }
  if (/authentication\/login|\/login/i.test(where) || !token) {
    const why = /login/i.test(where) ? 'SESSION EXPIRED: the profile is logged out of FastTrack' : 'FastTrack sent no login token in 45 seconds';
    console.error(stamp0 + '  ' + why + '. Run: node tools/brooks-headless-run.mjs --setup, and log in. No file written.');
    notify('Brooks scraper logged out', 'Run: node tools/brooks-headless-run.mjs --setup, and log in');
    verdictReached = true; await shutOwn(); return 1;
  }
  if (KEEPALIVE) { console.log(stamp0 + '  alive: ' + where); verdictReached = true; await shutOwn(); return 0; }

  const ev = await send('Runtime.evaluate', { expression: extensionFunctions() + '\n;window.__rhSweep = brooksFullCatalogSweep;' });
  if (ev.exceptionDetails) throw new Error('injecting the sweep: ' + ev.exceptionDetails.text);
  const t0 = Date.now();
  if (SMOKE) console.log('SMOKE TEST: ' + SMOKE + ' styles only. The file will be blocked by design.');
  await send('Runtime.evaluate', { expression: `window.__RHB = { done: 0, total: 0, finished: false, error: null, records: null, styles: 0 };
    (async () => { const S = window.__RHB; try {
      let account = '9284'; try { const a = JSON.parse(localStorage.getItem('accountId')); if (/^\\d+$/.test(String(a))) account = String(a); } catch (e) {}
      const out = await window.__rhSweep({ getToken: () => window.__rhToken, account, maxStyles: ${SMOKE}, onProgress: (d, t) => { S.done = d; S.total = t; } });
      S.records = out.records; S.styles = out.styles;
    } catch (e) { S.error = String(e && e.message || e); } S.finished = true; })(); 'started'` });

  let last = '';
  for (;;) {
    await wait(5000);
    const s = JSON.parse((await send('Runtime.evaluate', { returnByValue: true, expression: 'JSON.stringify({ d: __RHB.done, t: __RHB.total, f: __RHB.finished, e: __RHB.error })' })).result.value);
    const line = 'progress : ' + s.d + ' / ' + s.t + ' styles, ' + Math.round((Date.now() - t0) / 1000) + 's';
    if (line !== last && (s.d % 50 === 0 || s.f)) { console.log(line); last = line; }
    if (s.f) { if (s.e) { console.error('\n' + s.e + '. No file written.'); verdictReached = true; await shutOwn(); return 1; } break; }
    if (Date.now() - t0 > 30 * 60000) { console.error('\nThe sweep ran past 30 minutes (normal is about 90 seconds). No file written.'); verdictReached = true; await shutOwn(); return 1; }
  }
  const count = (await send('Runtime.evaluate', { returnByValue: true, expression: '__RHB.records.length' })).result.value;
  const records = [];
  for (let i = 0; i < count; i += 4000) records.push(...JSON.parse((await send('Runtime.evaluate', { returnByValue: true, expression: 'JSON.stringify(__RHB.records.slice(' + i + ',' + (i + 4000) + '))' })).result.value));
  try { ws.close(); } catch (e) {}
  await shutOwn();
  if (!records.length) { console.error('Nothing captured. No file written.'); verdictReached = true; return 1; }

  const csv = loadBrooksBackground().convertToBrooksInventoryCSV(records);
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
  const out = path.join(os.homedir(), 'Downloads', 'brooks-fullcatalog-' + (SMOKE ? 'SMOKETEST-' : '') + stamp + '.csv');
  fs.writeFileSync(out, csv);
  const units = records.reduce((a, r) => a + (r.availableQuantity || 0), 0);
  console.log('\ncaptured : ' + records.length + ' sizes, ' + new Set(records.map((r) => String(r.styleId).slice(0, 6))).size + ' styles, ' +
    units + ' units, in ' + Math.round((Date.now() - t0) / 1000) + 's');
  console.log('csv      : ' + out);
  if (SMOKE) { console.log('\nBLOCKED. Smoke test of ' + SMOKE + ' styles: never import this file, every other style would read as removed.'); verdictReached = true; return 0; }
  const code = judge(csv, out, has('--accept'));
  await uploadFeed('brooks', csv, { ...lastJudgement, file: path.basename(out), styles: new Set(records.map((r) => String(r.styleId).slice(0, 6))).size, capturedAt: new Date().toISOString() });
  return code;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  process.on('exit', (code) => { if (!verdictReached && code === 0) { console.error('\nNO VERDICT REACHED. Treat this run as a failure; nothing was written.'); process.exitCode = 1; } });
  main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('\nFAILED: ' + e.message); process.exitCode = 1; });
}
