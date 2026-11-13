#!/usr/bin/env node
// on-headless-run.mjs, The Run House.
//
// ON stock, overnight, with nobody at the keyboard. The ON scraper already
// reads ON's own API rather than the page: ONE POST to products-matrix/v3
// returns stock for ON's whole range, then up to six small catalog calls pick
// the re-order season (what "purchasable" means on Backstage). About seven
// requests a run, so nothing like the ASICS quota lockout.
//
// IT REIMPLEMENTS NOTHING. scrapers/on/content.js is read off disk and
// evaluated in a logged-in Backstage page, cut at its "Bootstrapping" marker
// so the extension's page hooks never run, and its own fetchInventoryFromApi
// and convertToInventoryCSV build the file. Every rule staff rely on comes
// with it: footwear only, not-yet-launched stock left out, the re-order
// season filter, and the refusal when no season looks like a re-order one.
//
// ONE DELIBERATE DIFFERENCE: when the API fails, the extension falls back to
// reading the page, which only sees the colour band, not numbers. A night run
// REFUSES instead; an approximate file is worse than none.
//
// And it writes the image sidecar (on-running-inventory-<n>-images.json) next
// to the CSV, which the extension can only offer behind a second click
// because Chrome allows one download per gesture.
//
// It WRITES NOTHING TO SHOPIFY: it saves both files to ~/Downloads, judges the
// CSV against its own baseline and prints a verdict.
//
//   node tools/on-headless-run.mjs --setup                  log the profile into Backstage, once
//   node tools/on-headless-run.mjs                          capture, save, judge
//   node tools/on-headless-run.mjs --keepalive              one visit, keeps the login warm
//   node tools/on-headless-run.mjs --accept-file <csv>      record a checked file as the baseline
//
// House style: no em dashes.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { check, rowsFromCSV, LIMITS, BASELINE_VERSION } from './inventory-guardrail.mjs';
import { closeChrome } from './headless-close.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PROFILE = path.join(os.homedir(), '.runhouse-on-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9833;
const HOME = 'https://backstage.on-running.com/';
const BASELINE = path.join(ROOT, 'inventory-guardrail-baseline-on.json');
const CUT = '// Bootstrapping';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(n);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let verdictReached = false;

// The class half of the scraper. Exported so a test can pin the cut point.
export function extractorSource() {
  const src = fs.readFileSync(path.join(ROOT, 'scrapers/on/content.js'), 'utf8');
  const i = src.indexOf(CUT);
  if (i === -1) throw new Error('scrapers/on/content.js has no "' + CUT + '" marker; the runner cannot cut the classes out safely');
  return src.slice(0, i);
}

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
    console.log('  ON baseline recorded: later runs are judged against ' + path.basename(file) + '.');
    return true;
  } else if (accept) console.log('  NOT recorded as the baseline: a blocked file must not become the new normal.');
  return res.ok;
}

async function main() {
  if (has('--setup')) {
    const marker = 'data:text/html,' + encodeURIComponent('<title>ON SCRAPER LOGIN</title><body style="margin:0;background:#f97316;color:#111;font:700 34px system-ui;display:grid;place-items:center;height:100vh;text-align:center"><div>ON SCRAPER LOGIN WINDOW<br><span style="font-size:22px;font-weight:500">Log in to ON Backstage in the NEXT tab of THIS window.<br>Leave the window open; it is closed for you once you are in.</span></div></body>');
    console.log('Opening a SEPARATE Chrome on ' + PROFILE + '. Log into Backstage there.');
    spawn(CHROME, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1), '--no-first-run', '--no-default-browser-check',
      '--new-window', marker, HOME], { stdio: 'ignore', detached: true }).unref();
    await wait(4000);
    console.log((await findExisting(PORT + 1)) ? 'confirmed: a separate browser is running on this profile' : 'WARNING: no browser appeared. Quit Chrome and retry.');
    verdictReached = true; return 0;
  }

  const acceptFile = arg('--accept-file', '');
  if (acceptFile) { verdictReached = true; return judge(fs.readFileSync(acceptFile, 'utf8'), acceptFile, true) ? 0 : 1; }

  const KEEPALIVE = has('--keepalive');
  const stamp0 = new Date().toLocaleString();
  if (await findExisting(PORT)) { console.log(stamp0 + '  skipped: another ON run is using the profile'); verdictReached = true; return KEEPALIVE ? 0 : 1; }
  let chrome = null;
  const killOwn = () => { if (chrome) { try { chrome.kill(); } catch (e) {} chrome = null; } };
  const shutOwn = async () => { const c = chrome; chrome = null; await closeChrome(c, PORT); };
  process.once('exit', killOwn);
  process.once('SIGINT', () => { killOwn(); process.exit(130); });
  process.once('SIGTERM', () => { killOwn(); process.exit(143); });
  let target = await findExisting(PORT + 1);   // the setup window, if still open
  if (!target) {
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run',
      '--no-default-browser-check', '--disable-gpu', '--window-size=1500,1000', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 40 && !target; i++) { await wait(300); target = await findExisting(PORT); }
  }
  if (!target) { console.error(stamp0 + '  No browser available. Close any Chrome window open on ' + PROFILE + '.'); verdictReached = true; return 1; }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = cdp(ws);
  await send('Page.enable');
  await send('Page.navigate', { url: HOME });
  await wait(9000);

  // Logged in is "Backstage knows the account". The scraper reads the account
  // id from the page's own user/profile, so no account id is written here.
  const who = JSON.parse((await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    try { const p = JSON.parse(localStorage.getItem('user/profile') || '{}'); const a = (p.accounts || []);
      return JSON.stringify({ ok: !!(a[0] && a[0].id), accounts: a.length, href: location.href.split('?')[0] }); }
    catch (e) { return JSON.stringify({ ok: false, href: location.href }); }
  })()` })).result.value);
  if (!who.ok || /login|signin|auth/i.test(who.href)) {
    console.error(stamp0 + '  SESSION EXPIRED: the profile is logged out of Backstage (' + who.href + '). Run: node tools/on-headless-run.mjs --setup, and log in. No file written.');
    notify('ON scraper logged out', 'Run: node tools/on-headless-run.mjs --setup, and log in');
    try { ws.close(); } catch (e) {}
    await shutOwn(); verdictReached = true; return 1;
  }
  if (KEEPALIVE) {
    console.log(stamp0 + '  alive: Backstage, ' + who.accounts + ' account(s)');
    try { ws.close(); } catch (e) {}
    await shutOwn(); verdictReached = true; return 0;
  }

  const t0 = Date.now();
  const ev = await send('Runtime.evaluate', { expression: extractorSource() + '\n;window.__RHON = ONRunningInventoryExtractor;' });
  if (ev.exceptionDetails) throw new Error('loading the ON scraper classes: ' + ev.exceptionDetails.text);
  const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
    try {
      const x = new window.__RHON();
      x.loadShopifySettings();
      // THE NEEDHAM ACCOUNT, BY NAME. This login holds four ON accounts
      // (Needham, Scituate, Falmouth, the parent LLC, 2026-11-13) and the
      // scraper otherwise takes the FIRST, which is Needham today only by
      // order. Stock from another account would be written as Needham
      // dropship stock, so exactly one name match or nothing.
      const accts = (JSON.parse(localStorage.getItem('user/profile') || '{}').accounts || []).filter((a) => /needham/i.test(a.name || ''));
      if (accts.length !== 1) return JSON.stringify({ error: accts.length + ' ON accounts are named Needham; expected exactly one' });
      x.shopifySettings.onAccountId = accts[0].id;
      // SHOES AND APPAREL, the extension's "Both", because that is what staff
      // run: the 12 Nov hand file held 4,718 footwear and 3,031 apparel sizes.
      // The tool zeroes what a file leaves out, so a footwear-only night file
      // would read every ON garment at Needham as removed. NO DOM FALLBACK:
      // a failure refuses.
      const data = await x.fetchInventoryFromApi(['shoes', 'apparel']);
      if (!data || !data.length) return JSON.stringify({ error: 'the ON API returned no rows' });
      const csv = x.shopifyConverter.convertToInventoryCSV(data, x.shopifySettings);
      // The article code's first digit is the group: 1 apparel, 3 footwear.
      const shoes = (csv.match(/,ON-3[A-Z0-9]/g) || []).length, garments = (csv.match(/,ON-1[A-Z0-9]/g) || []).length;
      if (!shoes || !garments) return JSON.stringify({ error: 'expected both footwear and apparel, got ' + shoes + ' footwear and ' + garments + ' apparel rows' });
      const assets = x.shopifyConverter._onAssets;
      const map = {}; if (assets) for (const [code, urls] of assets) map[code] = urls;
      return JSON.stringify({ rows: data.length, csv, map });
    } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); }
  })()` }, 600000);
  try { ws.close(); } catch (e) {}
  await shutOwn();
  const o = JSON.parse(r.result.value);
  if (o.error) { console.error('  REFUSED: ' + o.error + '. No file written.'); verdictReached = true; return 1; }

  const n = Date.now();
  const out = path.join(os.homedir(), 'Downloads', 'on-running-inventory-' + n + '.csv');
  fs.writeFileSync(out, o.csv);
  const images = Object.keys(o.map).length;
  if (images) {
    fs.writeFileSync(out.replace(/\.csv$/, '-images.json'), JSON.stringify({ kind: 'on-images', generatedAt: new Date().toISOString(),
      products: images, images: Object.values(o.map).reduce((t, u) => t + u.length, 0), map: o.map }, null, 1));
  }
  const units = rowsFromCSV(o.csv).reduce((t, x) => t + (Number(x.qty) || 0), 0);
  console.log('  file   : ' + out + (images ? '  (+ images file, ' + images + ' products)' : ''));
  console.log('  rows   : ' + o.rows + ' sizes, in ' + Math.round((Date.now() - t0) / 1000) + 's');
  const ok = judge(o.csv, out, false);
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
