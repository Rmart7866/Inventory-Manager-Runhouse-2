// headless-probe.mjs, The Run House.
//
// PROOF OF CONCEPT ONLY. Writes nothing to Shopify, writes nothing anywhere.
// It answers one question: can a scheduled job on this Mac reach a supplier
// portal with a logged-in browser profile and run the SAME extraction code the
// Chrome extension runs?
//
// WHY THIS SHAPE
//
// The extension scrapes because it rides the staff member's authenticated
// session. A Cloudflare Worker cannot, and a server posting credentials walks
// into ASICS' AWS WAF token challenge (their own localStorage carries
// aws_waf_token_challenge_attempts). So the browser has to be a real one, on
// this machine, with a profile that logged in normally.
//
// It does NOT copy or reuse the staff member's everyday Chrome profile. Chrome
// locks a profile directory, so a scheduled run would collide with whoever is
// using Chrome, and a half-copied profile is a good way to corrupt a login.
// This uses its OWN directory, logged into once by hand.
//
// AND IT DOES NOT REIMPLEMENT THE SCRAPER. It reads scrapers/asics/content.js
// off disk and evaluates the extraction functions inside the page, so there is
// exactly one copy of that logic. Fix a selector in the extension and this
// picks it up for free. That is the whole point of doing it this way.
//
//   node tools/headless-probe.mjs --setup     open the profile to log in once
//   node tools/headless-probe.mjs             run the probe, read only
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';

const SETUP = process.argv.includes('--setup');
const ROOT = new URL('..', import.meta.url).pathname;
const PROFILE = path.join(os.homedir(), '.runhouse-scrape-profile');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
// NO B2B URL IN THE REPO. This one is public, and a portal order number is an
// account identifier even though it grants nothing without the session. Pass
// the page to probe instead:
//
//   RH_PROBE_URL='https://b2b.asics.com/orders/<order>/products/1013A141' \
//     node tools/headless-probe.mjs
//
// The order number is the basketNo the scraper already reads off the URL, so
// any product link copied out of the portal works.
const TEST_URL = process.env.RH_PROBE_URL || '';
if (!TEST_URL) {
  console.error('Set RH_PROBE_URL to a b2b product page. See the comment at the top of this file.');
  process.exit(1);
}

if (!fs.existsSync(CHROME)) { console.error('Chrome not found at ' + CHROME); process.exit(1); }
fs.mkdirSync(PROFILE, { recursive: true });

if (SETUP) {
  // MACOS HANDS THE URL TO A RUNNING CHROME AND IGNORES --user-data-dir.
  //
  // The first version of this just spawned the Chrome binary. If Chrome was
  // already open, macOS passed the url to that instance instead of starting a
  // new browser, so the login landed in the staff member's everyday profile
  // and this one stayed completely empty: zero cookies, zero urls visited.
  //
  // --user-data-dir alone is not enough. A distinct --remote-debugging-port
  // forces a genuinely separate browser process, and the window title makes it
  // obvious which one you are looking at.
  console.log('Opening a SEPARATE Chrome window on the dedicated profile.');
  console.log('If a window does not appear, quit Chrome entirely and re-run this.\n');
  console.log('  1. log into b2b.asics.com in the window that opens');
  console.log('  2. open any product page, so the session is really established');
  console.log('  3. close that window');
  console.log('  4. node tools/headless-probe.mjs\n');
  console.log('Profile: ' + PROFILE);
  const p = spawn(CHROME, [
    '--user-data-dir=' + PROFILE,
    '--remote-debugging-port=' + (PORT + 1),
    '--no-first-run', '--no-default-browser-check',
    '--new-window', TEST_URL,
  ], { stdio: 'ignore', detached: true });
  p.unref();
  // Confirm a browser actually came up on OUR port rather than being absorbed
  // by an existing Chrome. Without this the failure is silent.
  setTimeout(async () => {
    try {
      const r = await fetch('http://127.0.0.1:' + (PORT + 1) + '/json/version');
      const v = await r.json();
      console.log('\nconfirmed: a separate browser is running on this profile');
      console.log('  ' + (v.Browser || 'Chrome'));
    } catch (e) {
      console.log('\nWARNING: no separate browser appeared on port ' + (PORT + 1) + '.');
      console.log('Chrome probably handed the tab to an instance that was already');
      console.log('running. Quit Chrome completely, then run --setup again.');
    }
    process.exit(0);
  }, 4000);
}

// ---- a tiny CDP client. Node 22 ships WebSocket, so no dependency ----------
let nextId = 1;
function cdp(ws) {
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  return (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// THE EXISTENCE OF A COOKIES FILE PROVES NOTHING. Chrome creates an empty one
// on first launch, and the first version of this probe reported "cookies:
// present" against a database holding zero rows for every host, which pointed
// the diagnosis in the wrong direction entirely. Count what is actually in the
// profile instead: a profile that has never visited a url has never logged in.
function profileEvidence() {
  const hist = path.join(PROFILE, 'Default', 'History');
  if (!fs.existsSync(hist)) return 'never launched';
  try {
    // a running Chrome holds a lock, so read a copy
    const tmp = path.join(os.tmpdir(), 'rh-history-probe.sqlite');
    fs.copyFileSync(hist, tmp);
    const out = execFileSync('sqlite3', ['-readonly', tmp, 'select count(*) from urls;'],
      { encoding: 'utf8' }).trim();
    try { fs.unlinkSync(tmp); } catch (e) {}
    return Number(out) > 0 ? out + ' urls visited' : 'NEVER NAVIGATED, the login went somewhere else';
  } catch (e) { return 'could not read history (' + String(e.message).slice(0, 40) + ')'; }
}
console.log('profile : ' + PROFILE);
console.log('history : ' + profileEvidence());

// ONE BROWSER PER PROFILE DIRECTORY, SO REUSE WHAT IS THERE.
//
// Chrome locks a user-data-dir. If the --setup browser is still open, a second
// Chrome cannot start on the same profile and the only symptom is "never
// opened its debugging port", which reads like a launch failure and is not.
// So look for a browser already serving this profile first and drive that.
// A scheduled run gets a clean launch because nothing else is using it.
async function findExisting(port) {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1500) });
    const list = await r.json();
    return list.find((t) => t.type === 'page') || null;
  } catch (e) { return null; }
}

let chrome = null;
let target = await findExisting(PORT + 1);
if (target) {
  console.log('chrome  : reusing the browser already open on this profile (setup window)');
} else {
  chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=1600,1200', 'about:blank',
  ], { stdio: 'ignore' });
}

let ws = null;
try {
  for (let i = 0; i < 40 && !target; i++) {
    await wait(300);
    target = await findExisting(PORT);
  }
  if (!target) throw new Error('no browser available. If a Chrome window is open on ' +
    PROFILE + ', close it, or it holds the profile lock.');
  console.log('chrome  : up, driving ' + target.webSocketDebuggerUrl.slice(0, 48) + '...');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = cdp(ws);
  await send('Page.enable');
  await send('Runtime.enable');

  await send('Page.navigate', { url: TEST_URL });

  // WAIT FOR THE GRID, DO NOT JUST SLEEP. The colour swatches and the quantity
  // grid are rendered by the portal's own JS several seconds after navigation,
  // so a fixed sleep reads an empty page and reports zero of everything. That
  // is the same trap the extension's readiness gate exists for, and a
  // scheduled run has nobody watching to notice it guessed wrong.
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await wait(1000);
    const r = await send('Runtime.evaluate', { returnByValue: true, expression:
      `document.querySelectorAll('li div.flex.items-center.gap-2').length > 0 &&
       document.querySelectorAll('.grid.grid-flow-col.items-center').length > 0` });
    ready = !!r.result.value;
  }
  console.log('render  : ' + (ready ? 'grid rendered' : 'TIMED OUT after 40s, the page never drew its grid'));
  if (ready) await wait(2500);   // let the last rows settle

  const urlNow = (await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })).result.value;
  const authed = !/authentication|login/i.test(urlNow);
  console.log('\nlanded  : ' + urlNow.slice(0, 92));
  console.log('session : ' + (authed ? 'AUTHENTICATED' : 'NOT logged in, redirected to the login page'));

  // inject the real extension code, functions only, nothing that touches the DOM
  const src = fs.readFileSync(path.join(ROOT, 'scrapers/asics/content.js'), 'utf8');
  const cut = src.indexOf('function initializeExtractor()');
  const inject = src.slice(0, cut) + '\nwindow.__RH = EnhancedASICSInventoryExtractor;';
  const ev = await send('Runtime.evaluate', { expression: inject, returnByValue: false });
  console.log('inject  : ' + (ev.exceptionDetails ? 'FAILED ' + ev.exceptionDetails.text
    : 'scrapers/asics/content.js evaluated, ' + (inject.length / 1024).toFixed(0) + ' KB'));

  const probe = `(() => {
    const x = Object.create(window.__RH.prototype);
    const info = x.getProductInfo();
    const colors = x.findColors();
    const sizes = x.findSizes();
    const matrix = x.findQuantityMatrix();
    return JSON.stringify({ style: info.styleId, colours: colors.length,
      sizes: sizes.length, rows: matrix.length,
      wouldEmit: Math.min(colors.length, matrix.length) * sizes.length });
  })()`;
  const out = await send('Runtime.evaluate', { expression: probe, returnByValue: true, awaitPromise: true });
  if (out.exceptionDetails) console.log('extract : FAILED ' + out.exceptionDetails.text);
  else console.log('extract : ' + out.result.value);

  console.log('\nVERDICT : ' + (authed
    ? 'the mechanism works. A scheduled job can reach the portal and run the extension code.'
    : 'mechanism is fine, but the profile is not logged in. Run --setup, log in, then re-run.'));
} catch (e) {
  console.error('\nFAILED: ' + e.message);
} finally {
  try { if (ws) ws.close(); } catch (e) {}
  // only kill a browser this run started; never the setup window
  if (chrome) chrome.kill();
}
