// keepalive-guard.mjs, The Run House (2026-11-24, owner: "fix the keep alives").
//
// Runs one supplier keep-alive with a HARD TIME LIMIT. A keep-alive is meant
// to take seconds: open the portal, make one call, close. On the night of
// 2026-11-23 the HOKA one hung for 19 hours instead, holding the HOKA profile,
// so every HOKA run after it skipped ("another HOKA run is using the
// profile") and the session it existed to keep warm expired under it.
//
// When the limit passes, the Chrome on that brand's profile is closed THROUGH
// THE BROWSER (Browser.close over its debugging port, then wait for it to
// exit), never killed, for the reason in tools/headless-close.mjs: a killed
// Chrome loses the cookie the portal just reissued and logs the profile out.
// Only then is the stuck node process ended.
//
//   node tools/keepalive-guard.mjs --profile <dir> [--limit 240] -- <runner.mjs> [args...]
//
// House style: no em dashes.
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';

const argv = process.argv.slice(2);
const cut = argv.indexOf('--');
const own = cut < 0 ? argv : argv.slice(0, cut);
const run = cut < 0 ? [] : argv.slice(cut + 1);
const opt = (k, d) => { const i = own.indexOf(k); return i >= 0 ? own[i + 1] : d; };
const PROFILE = String(opt('--profile', '')).replace(/^~/, os.homedir());
const LIMIT = Number(opt('--limit', 240)) * 1000;
const stamp = () => new Date().toLocaleString('en-US');
if (!PROFILE || !run.length) { console.error('usage: keepalive-guard.mjs --profile <dir> [--limit s] -- <runner.mjs> [args]'); process.exit(2); }

// Chrome processes on this profile, with the debugging port each was given.
function chromesOnProfile() {
  let out = '';
  try { out = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); } catch { return []; }
  return out.split('\n').filter((l) => l.includes('--user-data-dir=' + PROFILE) && !l.includes('--type=')).map((l) => {
    const pid = Number(l.trim().split(/\s+/)[0]);
    const port = Number((l.match(/--remote-debugging-port=(\d+)/) || [])[1] || 0);
    return { pid, port };
  });
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function closeThroughBrowser({ pid, port }) {
  if (!port) return 'no debugging port, left running';
  try {
    const v = await (await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(5000) })).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); setTimeout(() => rej(new Error('no socket')), 5000); });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  } catch (e) { return 'could not reach it (' + e.message + '), left running'; }
  for (let i = 0; i < 30 && alive(pid); i++) await sleep(500);
  return alive(pid) ? 'asked to close, still running after 15 s' : 'closed through the browser';
}

const child = spawn(process.execPath, run, { stdio: 'inherit' });
let timedOut = false;
const timer = setTimeout(async () => {
  timedOut = true;
  console.log(stamp() + '  GUARD: the keep-alive passed its ' + LIMIT / 1000 + ' s limit. Closing its Chrome through the browser.');
  for (const c of chromesOnProfile()) console.log('  GUARD: Chrome ' + c.pid + ' on port ' + c.port + ': ' + await closeThroughBrowser(c));
  await sleep(2000);
  if (child.exitCode === null) { child.kill('SIGTERM'); console.log('  GUARD: ended the stuck keep-alive process ' + child.pid + '.'); }
}, LIMIT);
child.on('exit', (code) => {
  clearTimeout(timer);
  process.exit(timedOut ? 3 : (code == null ? 1 : code));
});
