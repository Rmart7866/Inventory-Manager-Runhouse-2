// catchup.mjs, The Run House.
//
// RERUNS A NIGHTLY JOB THE MAC SLEPT THROUGH, as soon as the Mac is properly
// awake again. Owner request 2026-11-16, after a weekend with the lid shut.
//
// WHY launchd ALONE IS NOT ENOUGH. launchd does run a missed calendar job on
// the next wake, but with the lid closed the next wake is a DARK WAKE: the
// Mac is up for a few seconds, usually with no network, and goes back to
// sleep. Measured 2026-11-16: every nightly job started at 6:12 AM in one,
// failed ("no network", "browser target closed mid run"), and launchd counted
// it as run, so opening the lid at 8:12 started nothing. Worse, a run the
// Mac slept underneath can HANG (ON's sat for two hours), and launchd will
// not start a job that is still running, so that brand stays frozen.
//
// WHAT IT DOES, every 15 minutes (launchd also fires an overdue interval on
// wake, so this is within moments of opening the lid):
//   1. Nothing at all without a network. A dark wake has none, so it cannot
//      waste a run.
//   2. A job still running long past its normal length is stuck: its Chrome
//      is closed THROUGH THE BROWSER (Browser.close, the graceful path, so
//      the login is saved, see headless-close.mjs), and only if that fails is
//      the process stopped.
//   3. A job whose newest file in ~/Downloads is older than its latest
//      scheduled time (within the last 20 hours) is started with launchctl
//      kickstart: the SAME installed job, same log, same verdict, same auto
//      write. A failed attempt waits 30 minutes before the next try, so a
//      logged out brand does not run every 15 minutes all day.
//   4. While anything it started runs, caffeinate holds the Mac awake.
//
// It reads the schedules from the installed plists, so a schedule change
// needs nothing here. It never writes to Shopify itself.
//
//   node tools/catchup.mjs            one pass, what launchd runs
//   node tools/catchup.mjs --dry      say what it would do, start nothing
//
// House style: no em dashes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const AGENTS = path.join(HOME, 'Library', 'LaunchAgents');
const DL = path.join(HOME, 'Downloads');
const STATE = path.join(HOME, '.runhouse-catchup.json');
const LOG = process.env.CATCHUP_LOG || path.join(HOME, 'Library', 'Logs', 'runhouse-catchup.log');
const DRY = process.argv.includes('--dry');
const RETRY_MIN = 30;
const WINDOW_H = 20;

// What each nightly job leaves behind when it got a file, and how long a
// normal run takes before it counts as stuck. Every pattern must match for
// the job to count as done (Wolverine is two brands in one run).
export const JOBS = [
  { label: 'com.therunhouse.asics-fullcatalog', port: 9333, files: [/^asics-linkapi-\d{4}-/], maxMin: 45 },
  { label: 'com.therunhouse.wolverine-nightly', port: 9533, files: [/Performance At-Once nightly-.*\.xlsx$/, /^CatalogUPCs-Merrell At Once nightly-.*\.xlsx$/], maxMin: 20 },
  { label: 'com.therunhouse.puma-nightly', port: 9633, files: [/^Master ATS nightly-.*\.xlsx$/], maxMin: 20 },
  { label: 'com.therunhouse.altra-nightly', port: 9933, files: [/^Altra ATS nightly-.*\.xlsx$/], maxMin: 20 },
  { label: 'com.therunhouse.newbalance-nightly', port: 10033, files: [/^Consumer Drop Ship CDS ASAP nightly-.*\.xlsx$/], maxMin: 30 },
  { label: 'com.therunhouse.on-nightly', port: 9833, files: [/^on-running-inventory-\d+\.csv$/], maxMin: 20 },
  { label: 'com.therunhouse.brooks-fullcatalog', port: 9433, files: [/^brooks-fullcatalog-\d{4}-/], maxMin: 20 },
  { label: 'com.therunhouse.hoka-nightly', port: 9733, files: [/^(?!Altra|Master).*ATS.* nightly-.*\.xlsx$/i], maxMin: 30 },
];

function log(s) {
  const line = new Date().toLocaleString() + '  ' + s;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch (e) { /* never fatal */ }
}

// The newest scheduled time at or before now, from a StartCalendarInterval
// (one dict or a list; Hour and Minute are all these jobs use).
export function lastSlot(cal, now = new Date()) {
  const list = Array.isArray(cal) ? cal : cal ? [cal] : [];
  let best = null;
  for (const c of list) {
    for (const back of [0, 1]) {
      const d = new Date(now);
      d.setDate(d.getDate() - back);
      d.setHours(c.Hour ?? 0, c.Minute ?? 0, 0, 0);
      if (d <= now && (!best || d > best)) best = d;
    }
  }
  return best;
}

// Has the job produced its file since the slot? Pure, for the test.
export function isMissed(slot, newestByPattern, now = new Date()) {
  if (!slot) return false;
  if (now - slot > WINDOW_H * 3600e3) return false;
  return newestByPattern.some((t) => !t || t < slot);
}

function newestFile(re, names) {
  let best = 0;
  for (const n of names) {
    if (!re.test(n) || /SMOKETEST/.test(n)) continue;
    try { const t = fs.statSync(path.join(DL, n)).mtimeMs; if (t > best) best = t; } catch (e) {}
  }
  return best ? new Date(best) : null;
}

function plist(label) {
  const f = path.join(AGENTS, label + '.plist');
  if (!fs.existsSync(f)) return null;
  return JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', f], { encoding: 'utf8' }));
}

// The PID of a running launchd job, or null.
function runningPid(label) {
  try {
    const out = execFileSync('launchctl', ['list', label], { encoding: 'utf8' });
    const m = out.match(/"PID"\s*=\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch (e) { return null; }
}

function minutesRunning(pid) {
  try {
    const et = execFileSync('ps', ['-o', 'etime=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    // [[dd-]hh:]mm:ss
    const [dpart, rest] = et.includes('-') ? et.split('-') : ['0', et];
    const p = rest.split(':').map(Number);
    while (p.length < 3) p.unshift(0);
    return Number(dpart) * 1440 + p[0] * 60 + p[1] + p[2] / 60;
  } catch (e) { return 0; }
}

async function online() {
  try { const r = await fetch('https://captive.apple.com/hotspot-detect.html', { signal: AbortSignal.timeout(6000) }); return r.ok; }
  catch (e) { return false; }
}

async function closeBrowser(port) {
  try {
    const v = await (await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(3000) })).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); setTimeout(() => j(new Error('timeout')), 3000); });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    return true;
  } catch (e) { return false; }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// One pass at a time: launchd can fire the load and an overdue interval
// together, and two passes would race on the state file. A lock older than
// an hour belongs to a pass the Mac slept through, and is taken over.
const LOCK = path.join(HOME, '.runhouse-catchup.lock');
function takeLock() {
  try { fs.writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); return true; }
  catch (e) {
    try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 3600e3) { fs.writeFileSync(LOCK, String(process.pid)); return true; } } catch (e2) {}
    return false;
  }
}

async function main() {
  if (!DRY && !takeLock()) return;
  try { await pass(); } finally { if (!DRY) try { fs.unlinkSync(LOCK); } catch (e) {} }
}

async function pass() {
  if (!(await online())) { return; } // a dark wake, or no wifi: try again next pass, quietly
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const names = fs.readdirSync(DL);
  const now = new Date();
  const started = [];

  for (const job of JOBS) {
    const p = plist(job.label);
    if (!p) continue; // not installed (HOKA until its mailbox script is in)
    const short = job.label.replace('com.therunhouse.', '');
    const pid = runningPid(job.label);
    if (pid) {
      const mins = minutesRunning(pid);
      if (mins > job.maxMin) {
        log(short + ': STUCK, running ' + Math.round(mins) + ' min (normal is under ' + job.maxMin + '). Closing its Chrome through the browser.');
        if (!DRY) {
          await closeBrowser(job.port);
          await wait(30000);
          if (runningPid(job.label)) { try { process.kill(pid, 'SIGTERM'); } catch (e) {} log(short + ': still running after the close, stopped it'); await wait(5000); }
        }
      }
      // Still running (normally, or would not stop): leave it. Cleared: fall
      // through and rerun it now rather than in 15 minutes.
      if (DRY || runningPid(job.label)) continue;
    }
    const slot = lastSlot(p.StartCalendarInterval, now);
    const newest = job.files.map((re) => newestFile(re, names));
    if (!isMissed(slot, newest, now)) continue;
    const last = state[job.label] || 0;
    if (now - last < RETRY_MIN * 60e3) continue;
    log(short + ': missed its ' + slot.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' run (newest file ' +
      (newest.every(Boolean) ? new Date(Math.min(...newest)).toLocaleString() : 'none') + '). ' + (DRY ? 'Would start it.' : 'Starting it now.'));
    if (DRY) continue;
    state[job.label] = now.getTime();
    try { execFileSync('launchctl', ['kickstart', 'gui/' + process.getuid() + '/' + job.label]); started.push(job.label); }
    catch (e) { log(short + ': could not start: ' + e.message); }
  }
  if (!DRY) fs.writeFileSync(STATE, JSON.stringify(state));

  // Hold the Mac awake while what we started runs (up to an hour).
  if (started.length) {
    await wait(3000);
    for (const l of started) {
      const pid = runningPid(l);
      if (pid) spawn('caffeinate', ['-i', '-w', String(pid), '-t', '3600'], { detached: true, stdio: 'ignore' }).unref();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { log('catch up FAILED: ' + e.message); process.exitCode = 1; });
}
