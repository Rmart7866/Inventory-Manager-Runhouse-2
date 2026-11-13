// The headless runners must SAVE the login a visit was handed. A hard kill
// was logging both supplier profiles out (2026-11-13, see
// tools/headless-close.mjs). Two halves, the same lesson as method-wiring:
//
//   1. behaviour: closeChrome really persists a cookie set just before close,
//      on a throwaway profile against a local page. Skipped, loudly, when
//      Chrome is not installed.
//   2. wiring: no normal exit path in either runner hard kills Chrome. The
//      exit and signal handlers may (they cannot wait), nothing else.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { closeChrome } from '../tools/headless-close.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 2. wiring, cheap and always runs
for (const f of ['tools/asics-headless-run.mjs', 'tools/brooks-headless-run.mjs', 'tools/wolverine-headless-run.mjs', 'tools/puma-headless-run.mjs', 'tools/hoka-headless-run.mjs']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lines = src.split('\n');
  const bad = lines.map((l, i) => [l, i + 1]).filter(([l]) =>
    /(killOwn\(\)|chrome\.kill\()/.test(l) &&
    !/const killOwn = /.test(l) &&                       // the definition itself
    !/process\.once\('(SIGINT|SIGTERM)'/.test(l));      // the signal handlers
  ok(bad.length === 0, f + ': no hard kill on a normal exit path' + (bad.length ? ' (line ' + bad.map((b) => b[1]).join(', ') + ')' : ''));
  ok(/import \{ closeChrome \} from '\.\/headless-close\.mjs'/.test(src), f + ': uses closeChrome');
}

// ---- 1. behaviour
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!fs.existsSync(CHROME)) {
  console.log('skip  behaviour half: no Chrome at ' + CHROME);
} else {
  const server = http.createServer((req, res) => {
    const v = new URL(req.url, 'http://x').searchParams.get('v');
    if (v) res.setHeader('Set-Cookie', 'probe=' + v + '; Max-Age=86400; Path=/');
    res.end('ok');
  });
  await new Promise((r) => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-close-'));
  const PORT = 9600 + Math.floor(Math.random() * 300);

  async function launch() {
    const p = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
    let t = null;
    for (let i = 0; i < 60 && !t; i++) { await wait(250); try { t = (await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()).find((x) => x.type === 'page'); } catch (e) {} }
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const pend = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    return { p, send, ws };
  }
  try {
    let s = await launch();
    await s.send('Page.navigate', { url: base + '/?v=OLD' }); await wait(1200);
    s.ws.close(); ok(await closeChrome(s.p, PORT, 200) === 'closed', 'closeChrome closes through the browser, no kill needed');

    s = await launch();
    await s.send('Page.navigate', { url: base + '/?v=NEW' }); await wait(1200);
    s.ws.close(); await closeChrome(s.p, PORT, 200);

    s = await launch();
    await s.send('Page.navigate', { url: base + '/' }); await wait(1200);
    const got = (await s.send('Runtime.evaluate', { returnByValue: true, expression: 'document.cookie' })).result.result.value;
    ok(got === 'probe=NEW', 'the cookie reissued on the last visit survives a restart (got "' + got + '")');
    s.ws.close(); await closeChrome(s.p, PORT, 0);
    ok(await closeChrome(null, PORT) === 'none', 'closeChrome leaves alone a browser it did not start');
  } finally {
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
