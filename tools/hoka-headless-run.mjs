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
import { reportLinks, uploadWorkbook } from './feed-upload.mjs';
import { autoWrite } from './auto-write.mjs';

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
// The last verdict, so the upload to the inventory tool carries it.
let lastJudgement = null;
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
    console.log('  HOKA baseline recorded: later runs are judged against ' + path.basename(file) + '.');
    return true;
  } else if (accept) console.log('  NOT recorded as the baseline: a blocked file must not become the new normal.');
  return res.ok;
}

const REPORT_LINK_RE = /^https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/us\.assets\.b2b\.deckers\.com\/company_\d+\/DynamicReports\/[^?#]*ATS_Report[^?#]*\.xlsx$/i;

// One workbook out of several season reports: the first report's sheet and
// header, every other report's data rows appended. Refuses a header that does
// not match, because the converter reads columns by POSITION.
export function mergeReports(bufs) {
  const require = createRequire(import.meta.url);
  const XLSX = require('xlsx');
  let header = null, name = 'ATS Report', rows = [];
  for (const b of bufs) {
    const wb = XLSX.read(b);
    name = header ? name : wb.SheetNames[0];
    const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, raw: true });
    if (!all.length) continue;
    if (!header) header = all[0];
    else if (JSON.stringify(all[0]) !== JSON.stringify(header)) throw new Error('the season reports have different columns');
    rows = rows.concat(all.slice(1));
  }
  const out = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([header].concat(rows)), name);
  return Buffer.from(XLSX.write(out, { type: 'buffer', bookType: 'xlsx' }));
}

async function downloadAndJudge(links, t0) {
  const parts = [];
  for (const l of links) {
    // The Worker only ever holds Deckers report-bucket links (feeds.js), and
    // this checks again before fetching anything.
    if (!REPORT_LINK_RE.test(l.url)) { console.error('  REFUSED: a link is not a Deckers ATS report. No file written.'); return 1; }
    const r = await fetch(l.url, { signal: AbortSignal.timeout(300000) });
    const b = Buffer.from(await r.arrayBuffer());
    // A one-model season (Bondi 9) is about 70 KB, so the floor is low; a
    // login page or an error is HTML and fails the PK test anyway.
    if (!r.ok || b.length < 20000 || b.slice(0, 2).toString() !== 'PK') {
      console.error('  REFUSED: ' + l.subject + ' did not give a workbook (status ' + r.status + ', ' + b.length + ' bytes). No file written.'); return 1;
    }
    parts.push(b);
  }
  let buf;
  try { buf = parts.length === 1 ? parts[0] : mergeReports(parts); }
  catch (e) { console.error('  REFUSED: could not join the season reports: ' + e.message + '. No file written.'); return 1; }
  const url = links[0].url;
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
  const ok = judge(csv, out, false);
  // To the inventory tool, wholesale stripped first. Never fatal.
  await uploadWorkbook('hoka', buf, { ...lastJudgement, file: path.basename(out), capturedAt: new Date().toISOString() });
  // Then write it to Needham, PASS only, with the tool's own code and its
  // guards (tools/auto-write.mjs). A refusal writes nothing and says why.
  await autoWrite('hoka', [{ name: path.basename(out), buf }], { verdict: lastJudgement && lastJudgement.verdict, source: path.basename(out) });
  return ok ? 0 : 1;
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
    // EVERY IN-SEASON SEASON, never "the default". The default is just the
    // season somebody last picked in the portal (2026-11-16 it had been left
    // on "Fall 2026 Bondi 9", and the run got a one-model report), and HOKA
    // keeps Bondi 9 in a season of its own: the Fall 2026 report alone left
    // out about 73,000 Needham units of it, which would all read as removed.
    // Preseason (Spring 2027, Fall 2027) is future stock and stays out.
    const live = rows.filter((x) => /in-?season/i.test(String(x.seasonType || '')));
    const seasons = live.length ? live : rows.filter((x) => x.defaultSeason);
    if (!seasons.length) return JSON.stringify({ ok: false, why: 'no season' });
    if (${KEEPALIVE}) return JSON.stringify({ ok: true, keepalive: true, season: seasons.map((x) => x.seasonName).join(' + ') });
    // A price list is required; the season's own one ("HOKA-F26") if offered.
    // It changes only the price columns, never the stock.
    const pb = await fetch('/order-center/api/v1/order/option/priceBook', { headers: H });
    const books = pb.ok ? ((await pb.json()).data || []) : [];
    // THE REPORT IS OF THE WORKING ORDER'S SEASON, NOT THE seasonId SENT.
    // Measured 2026-11-16: two requests naming Bondi 9 and Fall 2026 came
    // back as two identical Fall 2026 reports, because the account's working
    // order (the HOKA cart) was a Fall 2026 draft. HOKA's own site switches
    // season by CREATING a draft for it (POST /draftOrders {seasonId}) and,
    // when the cart holds items, DELETING the old draft first. So, owner
    // decision 2026-11-17:
    //   - the cart must be EMPTY, or HOKA is refused for the night untouched
    //     (staff mid-order, or the Draft in HOKA extension, own that cart);
    //   - each other season is switched to exactly as the site does it, by
    //     opening a draft for it, its report asked for, and two minutes
    //     left (HOKA emailed in 15 s) so the report is built while that
    //     draft is still the working order;
    //   - then the cart is switched back to its own season THE SAME WAY and
    //     checked: that season, empty. Nothing is ever added, submitted or
    //     deleted. LEARNED 2026-11-17: HOKA DISCARDS an empty working draft
    //     the moment another is opened, so "go back to the original id"
    //     (workOn) found nothing and left the account with no valid cart
    //     until the next page load made one. The original id is not kept.
    const D = '/order-center/api/v1/draftOrders';
    const J = Object.assign({ 'Content-Type': 'application/json' }, H);
    const summary = async () => { const x = await fetch(D + '/workingOrder/summary', { headers: H }); return x.ok ? ((await x.json()).data || null) : null; };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const s0 = await summary();
    if (!s0 || !s0.draftOrderId) return JSON.stringify({ ok: false, why: 'could not read the HOKA cart' });
    if ((s0.totalQty || 0) > 0 || (s0.totalProducts || 0) > 0) return JSON.stringify({ ok: false, busy: true, why: 'the HOKA cart has ' + s0.totalQty + ' units in it' });
    const switchTo = async (season) => {
      const c = await fetch(D, { method: 'POST', headers: J, body: JSON.stringify({ seasonId: season.seasonId }) });
      if (!c.ok) throw new Error('could not switch the cart to ' + season.seasonName + ' (' + c.status + ')');
      const s1 = await summary();
      if (!s1 || s1.seasonId !== season.seasonId) throw new Error('the cart did not switch to ' + season.seasonName);
      if ((s1.totalQty || 0) > 0) throw new Error('the ' + season.seasonName + ' cart is not empty');
    };
    const ask = async (season) => {
      const book = books.find((b) => b.name === 'HOKA-' + season.seasonCode) || books.find((b) => b.name === 'HOKA-' + String(season.seasonCode).split(' ')[0]) || books[0] || {};
      const q = new URLSearchParams({ seasonId: String(season.seasonId), purchaseLimitIds: '', specialOrderForms: '', includeImage: 'false',
        useAtpLabels: 'false', includeSummaryTab: 'false', priceBookId: String(book.value || '') });
      const a = await fetch(D + '/report/atsReport?' + q, { headers: H });
      if (!a.ok) throw new Error('atsReport ' + a.status + ' for ' + season.seasonName);
      return { name: season.seasonName, book: book.name || '' };
    };
    const homeId = s0.seasonId;
    const home = rows.find((x) => x.seasonId === homeId) || { seasonId: homeId, seasonName: 'season ' + homeId };
    const asked = [], notes = [];
    let err = null, moved = false;
    try {
      for (const season of seasons.filter((x) => x.seasonId !== homeId)) {
        await switchTo(season); moved = true;
        asked.push(await ask(season));
        await wait(120000);
      }
    } catch (e) { err = e.message; }
    // Always put the cart back on its own season, whatever happened above.
    if (moved || err) {
      try { await switchTo(home); }
      catch (e) { return JSON.stringify({ ok: false, why: 'COULD NOT PUT THE HOKA CART BACK ON ' + home.seasonName + ' (' + e.message + '); opening HOKA in a browser makes a new cart' }); }
    }
    if (err) return JSON.stringify({ ok: false, why: err + ' (cart put back on ' + home.seasonName + ')' });
    if (seasons.some((x) => x.seasonId === homeId)) {
      try { asked.push(await ask(home)); } catch (e) { return JSON.stringify({ ok: false, why: e.message }); }
    } else notes.push('the cart was on ' + home.seasonName + ', not an in-season season; it was put back there');
    return JSON.stringify({ ok: true, seasons: asked, season: asked.map((x) => x.name).join(' + '), book: asked.map((x) => x.book).join(', '), notes });
  })()` }, 600000)).result.value);
  try { ws.close(); } catch (e) {}
  await shutOwn();
  (r.notes || []).forEach((n) => console.log('  note   : ' + n));
  if (!r.ok && (r.busy || !/^(no session token|seasons \d+)$/.test(r.why))) {
    // Not a login problem: a busy cart, or a step of the season switch.
    console.error(stamp0 + '  REFUSED: ' + r.why + '. No file written.');
    notify('HOKA not run', r.why);
    verdictReached = true; return 1;
  }
  if (!r.ok) {
    console.error(stamp0 + '  SESSION EXPIRED or refused (' + r.why + '): log the HOKA profile in again with --setup. No file written.');
    notify('HOKA scraper logged out', 'Run: node tools/hoka-headless-run.mjs --setup, and log in');
    verdictReached = true; return 1;
  }
  if (KEEPALIVE) { console.log(stamp0 + '  alive: HOKA B2B, ' + r.season); verdictReached = true; return 0; }
  console.log(stamp0 + '  asked for the ' + r.season + ' ATS report (price list ' + r.book + '); waiting for the email link');

  // The link to OUR report: EMAILED after the request was made (minus a
  // minute of clock slack) and titled exactly "<Season> ATS Report". Both
  // halves were learned on the first live run, 2026-11-16: the mailbox
  // script's first pass forwarded two days of reports at once, so a link's
  // receivedAt said "just now" on an old one, and the one it took was
  // "Fall 2026 Bondi 9 ATS Report", a single model somebody had asked for
  // (71 KB). That would read as every other HOKA model gone.
  const since = t0 - 60000;
  const wants = r.seasons.map((x) => (x.name + ' ATS Report').toLowerCase());
  const got = {};
  for (let i = 0; i < WAIT_FOR_LINK_MIN; i++) {
    const links = await reportLinks('hoka');
    for (const w of wants) {
      if (got[w]) continue;
      const l = links.find((x) => Date.parse(x.emailedAt || x.receivedAt) >= since && String(x.subject || '').trim().toLowerCase() === w);
      if (l) { got[w] = l; console.log('  link   : ' + l.subject + ', after ' + Math.round((Date.now() - t0) / 60000) + ' min'); }
    }
    if (wants.every((w) => got[w])) {
      const code = await downloadAndJudge(wants.map((w) => got[w]), t0);
      verdictReached = true; return code;
    }
    await wait(60000);
  }
  // A missing season is a refusal, not a smaller file: its stock would all
  // read as removed.
  const missing = wants.filter((w) => !got[w]);
  if (Object.keys(got).length) {
    console.error('  NO LINK for ' + missing.join(', ') + ' after ' + WAIT_FOR_LINK_MIN + ' minutes. A partial set is never used. No file written.');
    notify('HOKA report did not arrive', 'Missing: ' + missing.join(', '));
    verdictReached = true; return 1;
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
