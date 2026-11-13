// A 429 asking for HOURS is a lockout, not a throttle, and the sweep must stop.
//
// Measured 2026-11-13: the overnight full catalog read about 1,000 styles, then
// every stock call answered 429 "Too Many Attempts." with Retry-After 17954
// (five hours). The braking retry loop treated that as a throttle and spent
// three more hours retrying before the run could refuse. This pins:
//
//   1. a 429 with a long Retry-After stops at once, with the time it lifts;
//   2. after that, no further request is even sent;
//   3. a SHORT 429 is still braked and retried, as before;
//   4. the sweep checks the lockout before its retry pass.
//
// Run: node scrapers/asics/test/rate-lockout.mjs
// House style: no em dashes.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content.js');
const src = fs.readFileSync(SRC, 'utf8');

const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
  setAttribute: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  get textContent() { return ''; }, set textContent(v) {}, set innerHTML(v) {} });
let calls = 0;
let answer = () => ({ status: 200, body: '{"ok":1}', headers: {} });
const sb = {
  console: { log: noop, warn: noop, error: noop },
  setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 5)),   // real timers, squeezed
  clearTimeout, setInterval: noop, clearInterval: noop, Date,
  fetch: async () => {
    calls++;
    const a = answer();
    return { status: a.status, ok: a.status >= 200 && a.status < 300,
      headers: { get: (k) => a.headers[k.toLowerCase()] ?? null }, text: async () => a.body };
  },
  location: { href: 'https://b2b.asics.com/dashboard', pathname: '/dashboard' },
  navigator: { userAgent: '' }, performance: { now: () => 0 },
  MutationObserver: class { observe() {} },
  document: { readyState: 'complete', addEventListener: noop, createElement: el,
    querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: noop, contains: () => false, removeChild: noop }, head: { appendChild: noop } },
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(src + '\n;globalThis.__X = EnhancedASICSInventoryExtractor;', sb);
const X = sb.__X;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const reset = () => { X._lockedUntil = 0; X._cooldownUntil = 0; X._gapMs = 0; X._lastStart = 0; X._throttleHits = 0; X._okStreak = 0; X.API_MIN_GAP_MS = 0; calls = 0; };
const x = Object.create(X.prototype);

// 1. the night's real answer
reset();
answer = () => ({ status: 429, body: '{"message":"Too Many Attempts."}', headers: { 'retry-after': '17954' } });
let msg = '';
try { await x.apiGet('/aac/products/1011C127/availability'); } catch (e) { msg = e.message; }
/RATE LIMIT/.test(msg) && /until about/.test(msg) ? ok('a 5 hour Retry-After stops with the time it lifts') : bad('lockout message', msg);
calls === 1 ? ok('it stopped after ONE request, no braking retries') : bad('requests made on a lockout', calls);
X._lockedUntil > Date.now() + 4.9 * 3600e3 ? ok('the lock time is taken from Retry-After') : bad('lock time', X._lockedUntil - Date.now());

// 2. nothing else is sent while locked
const before = calls;
try { await x.apiGet('/aac/products/1012B670/availability'); } catch (e) { msg = e.message; }
calls === before && /RATE LIMIT/.test(msg) ? ok('while locked, the next call never reaches the network') : bad('calls while locked', calls - before);

// 3. a short 429 is a throttle and is still retried
reset();
let n = 0;
answer = () => (++n < 3 ? { status: 429, body: '', headers: { 'retry-after': '5' } } : { status: 200, body: '{"ok":1}', headers: {} });
let got = null;
try { got = await x.apiGet('/aac/baskets/current'); } catch (e) { got = 'threw ' + e.message; }
got && got.ok === 1 && calls === 3 ? ok('a 5 second 429 is braked and retried until it answers') : bad('short throttle', { got, calls });
X._lockedUntil === 0 ? ok('a short throttle does not set the lockout') : bad('lock set on a short 429', X._lockedUntil);

// 4. wiring inside the sweep
const sweep = src.slice(src.indexOf('async fetchInventoryFromApi('), src.indexOf('async fetchInventoryFromApi(') + 12000);
/_lockedUntil = 0;/.test(sweep) ? ok('the sweep clears a stale lockout when it starts') : bad('no reset at sweep start');
/while \(queue\.length\) \{\s*\n\s*if \(EnhancedASICSInventoryExtractor\._lockedUntil\) break;/.test(sweep) ? ok('workers stop taking styles once locked') : bad('worker loop does not check the lock');
const iLock = sweep.indexOf('A lockout ends the run here');
const iRetry = sweep.indexOf('one more pass over whatever failed');
iLock > 0 && iRetry > 0 && iLock < iRetry ? ok('the lockout refuses BEFORE the retry pass') : bad('order of lockout check and retry pass', { iLock, iRetry });

console.log(failures ? '\n' + failures + ' FAILED' : '\nall passed');
process.exit(failures ? 1 : 0);
