// asics-headless-run.mjs, The Run House.
//
// Captures the whole ASICS link list without a human driving Chrome, then
// hands the file to the guardrail. It WRITES NOTHING TO SHOPIFY. The output is
// the same 19 column inventory CSV the extension produces, so the import step
// is unchanged: a staff member still presses the button, or does not, on the
// strength of the verdict printed at the end.
//
//   node tools/asics-headless-run.mjs --setup       log the profile in, once
//   node tools/asics-headless-run.mjs               capture, check, write a CSV
//   node tools/asics-headless-run.mjs --limit 3     the first 3 links only
//   node tools/asics-headless-run.mjs --links f.txt a local list instead of Firestore
//   node tools/asics-headless-run.mjs --accept      record this run as the baseline
//
// WHY A BROWSER AT ALL. b2b.asics.com has no feed and sits behind a staff
// session with an AWS WAF token challenge, so the only way in is a browser
// that logged in normally. That is why the scraper is a Chrome extension. This
// is the same idea with the human removed from the clicking, not from the
// deciding.
//
// IT DOES NOT REIMPLEMENT ANY OF THE SCRAPER. Both extension files are read
// off disk and evaluated, so there is exactly one copy of every rule that
// decides a number:
//
//   content.js     the readiness gate, findColors/findSizes, the API only
//                  singlet path, locationForScrapedUrl
//   background.js  convertToInventoryCSV, which is the converter that actually
//                  decides the Location column. Fixing the content script's
//                  copy alone once fixed nothing that mattered.
//
// So a selector fix in the extension reaches this for free, and a bug fixed
// here cannot drift away from what staff run by hand.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { check, rowsFromCSV, POD_STYLES, POD_LOCATION, LIMITS } from './inventory-guardrail.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const PROFILE = path.join(os.homedir(), '.runhouse-scrape-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

// Firebase config is public by construction, the same values the page ships.
const FB_PROJECT = 'run-house-inventory-system';
const FB_KEY = 'AIzaSyA2BcP17tc5wJm2_j5T846oP6eqrbV-HO4';

// set only once a PASS or BLOCK has been printed, see the exit guard at the
// bottom of this file
let verdictReached = false;

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(name);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const WAIT_PER_PAGE = Number(arg('--wait', '12')) * 1000;

// ------------------------------------------------------- the link list -----
// THE SAME LIST STAFF USE, read from the same place the page reads it. A
// second copy of the list on disk would drift, and the first symptom of that
// drift is a style silently not being updated, which looks like nothing.
async function loadLinks() {
  const local = arg('--links', '');
  if (local) {
    return fs.readFileSync(local, 'utf8').split('\n').map(l => l.trim())
      .filter(l => l.startsWith('http'))
      .map(line => {
        const parts = line.split(/\s+/);
        const url = parts[0];
        // The derivation applies here too. A local list is used for a re-run
        // of a few links, and it would be the one run where a singlet
        // quietly went to Needham.
        return { url, location: parts.slice(1).join(' ').trim() || locationForUrl(url), label: '' };
      });
  }
  const url = 'https://firestore.googleapis.com/v1/projects/' + FB_PROJECT +
    '/databases/(default)/documents/b2b-links/asics/links?key=' + FB_KEY + '&pageSize=300';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Firestore returned ' + res.status + ' for the link list');
  const body = await res.json();
  const docs = body.documents || [];
  const flat = docs.map(d => Object.fromEntries(
    Object.entries(d.fields || {}).map(([k, v]) => [k, Object.values(v)[0]])));
  return flat
    .filter(l => l.active !== false)
    .map(l => ({ url: l.url, label: l.label || '', location: l.locationName || locationForUrl(l.url) }));
}

// PRINT ON DEMAND GOES TO THE WAREHOUSE, AND THE LINK LIST CANNOT SAY SO.
//
// The extension takes the location as a word after the URL on the pasted line.
// The Firestore list has no field for it and `copyActive` emits the bare url,
// so the two singlet entries come across with no location at all and the
// converter's fallback sends them to Needham. That is exactly the 2026-10-27
// write that had to be repaired by hand.
//
// Deriving it from the STYLE closes that off here regardless of what the list
// says, and the guardrail refuses the file if anything slips through anyway.
// POD_STYLES is imported rather than retyped so there is one list.
// The style a link is ASKING for. The portal appends colorCode and
// deliveryDate as the page loads, so this reads the path and nothing else.
export function styleFromUrl(url) {
  return ((/\/products\/([^/?#]+)/.exec(String(url || '')) || [])[1] || '').toUpperCase();
}

// Did we read the page we asked for? Returns '' when it matches, or the
// reason it does not. A mismatch means a stale document, a redirect, or a
// url rewrite, and in every case the rows belong to a different product.
export function styleMismatch(url, reported) {
  const wanted = styleFromUrl(url);
  if (!wanted) return '';
  const got = String(reported || '').toUpperCase();
  return got === wanted ? '' : 'asked for ' + wanted + ', the page reported ' + (reported || '(nothing)');
}

export function locationForUrl(url) {
  const u = String(url || '').toUpperCase();
  return POD_STYLES.some(s => u.includes('/PRODUCTS/' + s)) ? POD_LOCATION : '';
}

// ------------------------------------------------------------- the CSV -----
// THE REAL BACKGROUND CONVERTER, not a copy of it. background.js ends with
// chrome.runtime listeners, so it gets a stub; convertToInventoryCSV and its
// three helpers touch no chrome API, only chrome.storage in the chunk methods
// this never calls.
export function loadBackgroundConverter(root = ROOT) {
  const src = fs.readFileSync(path.join(root, 'scrapers/asics/background.js'), 'utf8');
  const noop = () => {};
  const chrome = {
    runtime: { onMessage: { addListener: noop }, onStartup: { addListener: noop },
      onInstalled: { addListener: noop }, lastError: null },
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
    downloads: { download: async () => 1 },
    action: { onClicked: { addListener: noop } },
    tabs: { query: async () => [], sendMessage: async () => {} },
  };
  const make = new Function('chrome', 'console', src + '\n;return csvManager;');
  return make(chrome, { log: noop, warn: noop, error: noop });
}

// ------------------------------------------------------- the CDP client ----
let nextId = 1;

// A DEAD TARGET USED TO MAKE THIS EXIT 0, SILENTLY, HAVING DONE NOTHING.
//
// The original client returned a promise that only ever settled when a reply
// arrived. If the page target went away mid run, which it does when the tab is
// closed or the renderer crashes, no reply ever came, the await never
// resolved, nothing else was queued, the event loop drained and NODE EXITED
// WITH CODE 0. No verdict, no CSV, no error, and a caller checking the exit
// code reads success. For a job meant to run unattended three times a day
// that is the worst failure shape available: the stock goes stale and
// everything says it worked. Observed on the 2026-10-29 full run, which
// stopped after link 32 and exited 0.
//
// Three things stop it: every call has a deadline, a socket close or error
// rejects everything outstanding, and main() refuses to exit 0 without having
// printed a verdict.
const CDP_TIMEOUT_MS = 60000;

function cdp(ws) {
  const pending = new Map();
  let dead = null;
  const killAll = (why) => {
    dead = why;
    for (const [, p] of pending) p.rej(new Error(why));
    pending.clear();
  };
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).ok(m); pending.delete(m.id); }
  });
  ws.addEventListener('close', () => killAll('the browser target closed mid run'));
  ws.addEventListener('error', () => killAll('the browser connection errored mid run'));

  return (method, params = {}) => new Promise((res, rej) => {
    if (dead) return rej(new Error(dead));
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pending.delete(id)) rej(new Error(method + ' got no reply in ' + (CDP_TIMEOUT_MS / 1000) + 's'));
    }, CDP_TIMEOUT_MS);
    pending.set(id, {
      ok: (m) => { clearTimeout(timer); m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result); },
      rej: (e) => { clearTimeout(timer); rej(e); },
    });
    try { ws.send(JSON.stringify({ id, method, params })); }
    catch (e) { clearTimeout(timer); pending.delete(id); rej(new Error(method + ': ' + e.message)); }
  });
}

async function findExisting(port) {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1500) });
    return (await r.json()).find((t) => t.type === 'page') || null;
  } catch (e) { return null; }
}

function profileUrlCount() {
  const hist = path.join(PROFILE, 'Default', 'History');
  if (!fs.existsSync(hist)) return 0;
  try {
    const tmp = path.join(os.tmpdir(), 'rh-asics-history.sqlite');
    fs.copyFileSync(hist, tmp);
    const out = execFileSync('sqlite3', ['-readonly', tmp, 'select count(*) from urls;'], { encoding: 'utf8' });
    try { fs.unlinkSync(tmp); } catch (e) {}
    return Number(out.trim()) || 0;
  } catch (e) { return -1; }
}

// ------------------------------------------------------------- the run -----
async function main() {
  if (has('--setup')) {
    // macOS hands a url to a RUNNING Chrome and ignores --user-data-dir, so a
    // distinct debugging port is what forces a genuinely separate browser.
    // Without it the login lands in the staff member's everyday profile and
    // this one stays empty, with no symptom but a later "not logged in".
    const links = await loadLinks();
    const target = (links[0] || {}).url || 'https://b2b.asics.com/';
    console.log('Opening a SEPARATE Chrome on the dedicated profile.');
    console.log('Log into b2b.asics.com, open the product page it lands on, then close the window.\n');
    console.log('  profile: ' + PROFILE);
    const p = spawn(CHROME, ['--user-data-dir=' + PROFILE, '--remote-debugging-port=' + (PORT + 1),
      '--no-first-run', '--no-default-browser-check', '--new-window', target],
      { stdio: 'ignore', detached: true });
    p.unref();
    await wait(4000);
    const up = await findExisting(PORT + 1);
    console.log(up ? '\nconfirmed: a separate browser is running on this profile'
      : '\nWARNING: no browser appeared on port ' + (PORT + 1) + '. Quit Chrome entirely and retry.');
    verdictReached = true;          // --setup is not a run, so it has no verdict to reach
    return 0;
  }

  const links = await loadLinks();
  const limit = Number(arg('--limit', '0'));
  const todo = limit > 0 ? links.slice(0, limit) : links;
  if (!todo.length) { console.error('The link list is empty.'); return 1; }

  // A DUPLICATE LINK BECOMES DUPLICATE ROWS, and the guardrail would then
  // block on DUPLICATE VARIANTS, which reads like the delivery-window bug
  // rather than like a list someone pasted an entry into twice. Say it here,
  // where the cause is obvious. Checked 2026-10-29: 47 links, 47 distinct
  // styles, so this is prevention rather than a current problem.
  const seenStyle = new Map();
  for (const l of todo) {
    const st = styleFromUrl(l.url);
    if (!st) { console.log('WARNING: no style in this url, it will be skipped: ' + l.url); continue; }
    if (seenStyle.has(st)) {
      console.log('WARNING: style ' + st + ' is in the list twice ("' + seenStyle.get(st) +
        '" and "' + (l.label || l.url.slice(-30)) + '"). Every row for it will be duplicated.');
    } else seenStyle.set(st, l.label || l.url.slice(-30));
  }

  const pod = todo.filter(l => l.location === POD_LOCATION);
  console.log('links    : ' + todo.length + (limit ? ' (limited from ' + links.length + ')' : '') +
    ', ' + pod.length + ' print on demand to ' + POD_LOCATION);
  const visited = profileUrlCount();
  console.log('profile  : ' + PROFILE + ', ' +
    (visited < 0 ? 'history unreadable' : visited + ' urls visited') +
    (visited === 0 ? '  (NEVER LOGGED IN, run --setup first)' : ''));

  // the same config shape the extension builds, so locationForScrapedUrl works
  const config = {
    format: 'inventory', currentIndex: 0,
    urls: todo.map(l => l.url),
    locationByUrl: Object.fromEntries(todo.filter(l => l.location).map(l => [l.url, l.location])),
  };

  // A LEAKED HEADLESS CHROME HOLDS THE PROFILE LOCK, and the next run then
  // fails with "no browser available", which reads like a launch problem. So
  // the process this run starts is killed on ANY exit path, including a throw
  // that escapes the loop, and never the setup window that it did not start.
  let chrome = null;
  const killOwn = () => { if (chrome) { try { chrome.kill(); } catch (e) {} chrome = null; } };
  process.once('exit', killOwn);
  process.once('SIGINT', () => { killOwn(); process.exit(130); });
  process.once('SIGTERM', () => { killOwn(); process.exit(143); });

  let target = await findExisting(PORT + 1);
  if (target) console.log('chrome   : reusing the browser already open on this profile');
  else {
    console.log('chrome   : launching headless on this profile');
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
      '--disable-gpu', '--window-size=1600,1200', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 40 && !target; i++) { await wait(300); target = await findExisting(PORT); }
  }
  if (!target) {
    console.error('No browser available. If a Chrome window is open on ' + PROFILE +
      ', close it: it holds the profile lock.');
    return 1;
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');

  // content.js, functions only, cut before the part that builds UI
  const csrc = fs.readFileSync(path.join(ROOT, 'scrapers/asics/content.js'), 'utf8');
  const cut = csrc.indexOf('function initializeExtractor()');
  if (cut < 0) throw new Error('content.js no longer has initializeExtractor, the injection cut point moved');
  const inject = csrc.slice(0, cut) + '\nwindow.__RH = EnhancedASICSInventoryExtractor;' +
    '\nwindow.__RHC = UnifiedShopifyConverter;';

  const records = [];
  const failures = [];
  // COUNT WHAT WAS ATTEMPTED, NOT TOTAL MINUS FAILURES. That arithmetic is
  // only right when every link was tried, and on an abort it is badly wrong in
  // the flattering direction: a run that died after 4 links reported "827 rows
  // from 45 of 47 links", which reads like a nearly complete run.
  let attempted = 0;
  let t0 = Date.now();

  // ONE RETRY PER LINK, BECAUSE A TRANSIENT RENDER IS NOT A REASON TO LOSE A
  // RUN. The grid draws several seconds after navigation and occasionally does
  // not draw at all on a cold page. A failed link blocks the whole file by
  // design, so without a retry one slow page throws away the other 46 and the
  // next scheduled run inherits the same odds. Two attempts, then it counts.
  const ATTEMPTS = 2;
  let abortRun = false;   // an expired session or a dead browser, both fail everything left

  for (let i = 0; i < todo.length && !abortRun; i++) {
    const link = todo[i];
    config.currentIndex = i;    // the index BEING scraped, see locationForScrapedUrl
    const tag = '[' + (i + 1) + '/' + todo.length + '] ' + (link.label || link.url.slice(-24));
    attempted++;
    let lastErr = '';
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        // PROVE THE DOCUMENT ACTUALLY CHANGED BEFORE READING IT.
        //
        // Page.navigate returns as soon as the navigation is STARTED, and the
        // previous document stays live until the new one commits. So a check
        // like "readyState is complete and window.__RH exists" can be answered
        // TRUE by the page we just left, and then the readiness gate passes on
        // the old grid and its rows get attributed to this url. That is a
        // silent wrong number on two products at once, which is the worst
        // shape a bug can take here.
        //
        // A new document wipes globals, so a token set before navigating is
        // gone once the new page is really in place. That plus the style check
        // further down is what makes the read trustworthy.
        const token = 'nav' + Date.now() + '_' + i;
        await send('Runtime.evaluate', { expression: 'window.__RH_NAV = ' + JSON.stringify(token) });
        await send('Page.navigate', { url: link.url });
        let committed = false;
        for (let t = 0; t < 60 && !committed; t++) {
        await wait(500);
        const r = await send('Runtime.evaluate', { returnByValue: true, expression:
          '(window.__RH_NAV === undefined) && document.readyState === "complete"' });
        committed = !!r.result.value;
        }
        if (!committed) throw new Error('navigation never committed a new document');

        // CHECK THE SESSION BEFORE WAITING ON A GRID THAT WILL NEVER DRAW.
        // A login page never satisfies the readiness gate, so testing this
        // afterwards costs the full 40 second timeout twice per link, and the
        // run takes an hour to tell you it needed a password.
        const where = (await send('Runtime.evaluate',
          { expression: 'location.href', returnByValue: true })).result.value;
        if (/authentication|login|signin/i.test(where)) {
          // STOP THE WHOLE RUN. An expired session fails every remaining
          // page, and a file missing most of the list is exactly the partial
          // scrape that reads downstream as stock disappearing.
          console.error('\n' + tag + ' redirected to a login page.');
          console.error('SESSION EXPIRED. Stopping, so this cannot produce a partial file.');
          console.error('Re-run with --setup, log in, then run again.');
          failures.push({ url: link.url, error: 'session expired' });
          lastErr = '';            // already recorded, do not record it twice below
          abortRun = true;
          break;
        }

        // The context is known fresh, so inject exactly once. content.js
        // declares classes at the top level and evaluating it twice in one
        // context throws "Identifier has already been declared".
        const ev = await send('Runtime.evaluate', { expression: inject });
        if (ev.exceptionDetails) throw new Error('injecting content.js: ' + ev.exceptionDetails.text);

        // THE REAL READINESS GATE DECIDES WHEN THE PAGE IS DRAWN. The grid
        // renders several seconds after navigation, so a fixed sleep reads an
        // empty page and reports zero of everything. Polling the extension's
        // own gate also means a garment and a shoe are judged by the rule
        // that was fixed for them, rather than by a guess made here.
        let ready = false;
        for (let t = 0; t < 40 && !ready; t++) {
          const r = await send('Runtime.evaluate', { returnByValue: true, expression:
            `(() => { const x = Object.create(window.__RH.prototype);
               try { return JSON.stringify(x.checkPageReadinessEnhanced()); } catch (e) { return '{}'; } })()` });
          let checks = {};
          try { checks = JSON.parse(r.result.value || '{}'); } catch (e) {}
          ready = !!checks.hasCompleteData;
          if (!ready) await wait(1000);
        }
        if (!ready) throw new Error('grid never rendered, readiness gate stayed shut');

        // and now the real extraction, API only styles included
        const out = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression:
        `(async () => {
          const x = Object.create(window.__RH.prototype);
          x.shopifySettings = { locationName: 'Needham', exportType: 'inventory', format: 'inventory' };
          try { x.shopifyConverter = new window.__RHC(); } catch (e) {}
          const info = x.getProductInfo() || {};
          const style = info.styleId;
          let rows;
          if (window.__RH.API_ONLY_STYLES.indexOf(style) !== -1) {
            // No DOM fallback on purpose: the grid caps at 30 and these run
            // into the hundreds, so writing nothing beats writing a 30.
            rows = await x.extractSingletInventoryFromApi(style);
          } else {
            rows = x.extractInventoryData();
          }
          const loc = x.locationForScrapedUrl(${JSON.stringify(config)}, location.href);
          return JSON.stringify({ style, source: window.__RH.API_ONLY_STYLES.indexOf(style) !== -1 ? 'api' : 'page',
            loc, rows: (rows || []).map(r => ({ ...r, locationName: loc || r.locationName || '' })) });
        })()` });

        if (out.exceptionDetails) throw new Error(out.exceptionDetails.text + ' ' +
        ((out.exceptionDetails.exception || {}).description || '').slice(0, 200));
        const got = JSON.parse(out.result.value);

        // THE STYLE READ MUST BE THE STYLE ASKED FOR. Cheap, and it is the
        // decisive check: it catches a stale document, a portal redirect, and
        // the url rewriting that appends colorCode and deliveryDate. Without it
        // a wrong page's rows would be written under this line's location.
        const mismatch = styleMismatch(link.url, got.style);
        if (mismatch) throw new Error('wrong page: ' + mismatch);
        // ZERO ROWS IS NOT AUTOMATICALLY A FAILURE. An API only singlet whose
        // call failed deliberately returns nothing rather than a capped 30, and
        // a style really can be discontinued. But it is never SILENT: it is
        // retried, then recorded, so the verdict can refuse the file.
        if (!got.rows.length) throw new Error('extracted 0 rows (' + got.source + ')');

        records.push(...got.rows);
        console.log(tag + '  ' + String(got.rows.length).padStart(4) + ' rows, ' + got.source +
          ', ' + (got.loc || 'Needham') + (attempt > 1 ? '  (retry ' + attempt + ')' : ''));
        lastErr = '';
        break;
      } catch (e) {
        lastErr = e.message;
        // A DEAD CONNECTION WILL FAIL EVERY REMAINING LINK, so stop now. Seen
        // 2026-10-29 when the browser was killed mid run: without this the
        // run ground through all 47 links retrying each one against a socket
        // that was never coming back, which wastes ten minutes and buries the
        // real cause under 94 identical failures.
        if (/target closed|connection errored|got no reply/.test(e.message)) {
          console.error('\n' + tag + '  ' + e.message);
          console.error('THE BROWSER IS GONE. Stopping, because every remaining link would fail the');
          console.error('same way and produce a partial file. Nothing was written.');
          failures.push({ url: link.url, error: e.message });
          lastErr = '';            // already recorded, do not record it twice below
          abortRun = true;
          break;
        }
        if (attempt < ATTEMPTS) {
          console.log(tag + '  attempt ' + attempt + ' failed (' + e.message.slice(0, 60) + '), retrying');
          await wait(3000);
        }
      }
    }
    if (lastErr) {
      failures.push({ url: link.url, error: lastErr });
      console.log(tag + '  FAILED after ' + ATTEMPTS + ' attempts, ' + lastErr.slice(0, 80));
    }
    if (i < todo.length - 1) await wait(WAIT_PER_PAGE);
  }

  try { ws.close(); } catch (e) {}
  killOwn();

  const succeeded = attempted - failures.length;
  const never = todo.length - attempted;
  console.log('\ncaptured : ' + records.length + ' rows from ' + succeeded + ' of ' +
    todo.length + ' links in ' + Math.round((Date.now() - t0) / 1000) + 's' +
    (never > 0 ? '   (' + never + ' never attempted, the run stopped early)' : ''));

  if (!records.length) { console.error('\nNothing captured. No file written.'); return 1; }

  // THE REAL CONVERTER BUILDS THE FILE. This is the one that decides Location.
  const csv = loadBackgroundConverter().convertToInventoryCSV(records);
  // SECONDS, NOT MINUTES. Two runs inside one minute wrote the same filename
  // and the second silently replaced the first, which matters precisely when
  // comparing a re-run against the run before it.
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '');
  const out = path.join(os.homedir(), 'Downloads', 'asics-headless-' + stamp + '.csv');
  fs.writeFileSync(out, csv);
  console.log('csv      : ' + out);

  // ------------------------------------------------------ the verdict -----
  const BASELINE = path.join(ROOT, 'inventory-guardrail-baseline.json');
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const rows = rowsFromCSV(csv);
  const res = check(rows, baseline);

  console.log('');
  // A FAILED LINK IS A BLOCK IN ITS OWN RIGHT. The guardrail sees only the
  // file, so a run that skipped half the list looks to it like stock that
  // genuinely vanished. Only the runner knows a page failed, so it says so.
  if (failures.length || never > 0) {
    console.log('  BLOCK  ' + failures.length + ' link(s) failed and ' + never + ' were never attempted, ' +
      'out of ' + todo.length + '. This file is incomplete, and the styles missing from it would read ' +
      'downstream as stock disappearing:');
    failures.slice(0, 8).forEach(f => console.log('           ' + f.error + '  ' + f.url.slice(-42)));
    if (failures.length > 8) console.log('           and ' + (failures.length - 8) + ' more');
  }
  res.warnings.forEach(w => console.log('  WARN   ' + w));
  res.blocks.forEach(b => console.log('  BLOCK  ' + b));

  // A LINK NEVER ATTEMPTED IS AS BAD AS ONE THAT FAILED. Both leave a hole
  // that reads downstream as stock disappearing, and only the runner knows
  // the hole is there, because the guardrail only ever sees the file.
  const ok = res.ok && !failures.length && never === 0;
  console.log('\n' + (ok ? 'PASS. Safe to import ' + path.basename(out)
    : 'BLOCKED. Do not import this file.'));
  verdictReached = true;

  if (has('--accept') && ok) {
    // the same shape the guardrail's own CLI writes, so a baseline recorded by
    // either one is readable by the other
    const groupZeroShare = {};
    for (const [b, s] of Object.entries(res.summary.brands)) {
      if (s.rows >= 20 && s.rows / res.summary.rows >= LIMITS.minGroupShare) {
        groupZeroShare[b] = s.zeros / s.rows;
      }
    }
    fs.writeFileSync(BASELINE, JSON.stringify({ at: new Date().toISOString(), file: path.basename(out),
      rows: res.summary.rows, units: res.summary.units, atCapShare: res.summary.atCapShare,
      cap: res.summary.cap, zeroShare: res.summary.zeroShare, groupZeroShare,
      locations: res.summary.locations }, null, 2));
    console.log('baseline recorded.');
  } else if (has('--accept')) {
    console.log('NOT recorded as the baseline: a blocked run must not become the new normal.');
  }
  return ok ? 0 : 1;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  // THE LAST LINE OF DEFENCE AGAINST A SILENT SUCCESS. Whatever goes wrong,
  // and however it goes wrong, this process does not get to exit 0 unless it
  // actually reached a verdict and said so.
  process.on('exit', (code) => {
    if (!verdictReached && code === 0) {
      console.error('\nNO VERDICT REACHED, so this run decided nothing. Treat it as a failure,');
      console.error('not as "no changes". Nothing was written.');
      process.exitCode = 1;
    }
  });
  main()
    .then((c) => { process.exitCode = c; })
    .catch((e) => {
      console.error('\nFAILED: ' + e.message);
      process.exitCode = 1;
    });
}
