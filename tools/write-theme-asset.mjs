// Write one asset into a theme. Backs the old value up first and takes --restore.
//
// REFUSES THE LIVE THEME unless --force is passed, because the whole point of
// working in a draft theme is that a mistake cannot reach shoppers. The live
// theme is found by ROLE, never by id, for the reason recorded in CLAUDE.md.
//
//   node tools/write-theme-asset.mjs --theme <id|name> <key> --from <file>
//   node tools/write-theme-asset.mjs --theme <id|name> <key> --restore <backup>
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i === -1 ? null : argv[i + 1]; };
const has = (n) => argv.includes(n);

const THEME = flag('--theme');
const FROM = flag('--from');
const RESTORE = flag('--restore');
const KEY = argv.find((a, i) => !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--')));

if (!THEME || !KEY || (!FROM && !RESTORE)) {
  console.error('usage: node tools/write-theme-asset.mjs --theme <id|name> <key> --from <file>');
  console.error('       node tools/write-theme-asset.mjs --theme <id|name> <key> --restore <backup>');
  process.exit(2);
}

function env() {
  const txt = fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
const E = env();
const SHOP = (E.SHOP_URL || '').replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';
let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) });
  if (!r.ok) throw new Error('token exchange HTTP ' + r.status);
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function rest(p, init = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/${p}`, { ...init,
    headers: { 'X-Shopify-Access-Token': await token(), 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (r.status === 429 && attempt < 6) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); return rest(p, init, attempt + 1); }
  if (!r.ok) throw new Error('REST ' + r.status + ' ' + p + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

const themes = (await rest('themes.json')).themes;
const target = themes.find((t) => String(t.id) === String(THEME))
            || themes.find((t) => (t.name || '').toLowerCase() === String(THEME).toLowerCase());
if (!target) {
  console.error('No theme matches ' + JSON.stringify(THEME) + '. Available:');
  for (const t of themes) console.error('  ' + t.id + '  ' + t.role.padEnd(11) + ' ' + JSON.stringify(t.name));
  process.exit(1);
}
if (target.role === 'main' && !has('--force')) {
  console.error('REFUSING to write to the LIVE theme (' + target.id + ' ' + JSON.stringify(target.name) + ').');
  console.error('Work in a draft theme. Pass --force only if you truly mean to change the live site.');
  process.exit(1);
}
console.log('theme: ' + target.id + '  ' + target.role + '  ' + JSON.stringify(target.name));

// Back up whatever is there now, so every write is reversible.
const dir = path.join(ROOT, 'theme-backups');
fs.mkdirSync(dir, { recursive: true });
let existing = null;
try {
  const got = await rest(`themes/${target.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}`);
  existing = got.asset.value;
} catch (e) { if (!/REST 404/.test(e.message)) throw e; }

if (existing !== null) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = path.join(dir, `${target.id}.${KEY.replace(/[\/]/g, '__')}.${stamp}.bak`);
  fs.writeFileSync(bak, existing);
  console.log('backed up ' + existing.length.toLocaleString() + ' chars to ' + path.relative(ROOT, bak));
} else {
  console.log('no existing asset at ' + KEY + ', this creates it');
}

const value = fs.readFileSync(RESTORE || FROM, 'utf8');
console.log((RESTORE ? 'restoring ' : 'writing ') + value.length.toLocaleString() + ' chars to ' + KEY);
await rest(`themes/${target.id}/assets.json`, { method: 'PUT', body: JSON.stringify({ asset: { key: KEY, value } }) });

// VERIFY, BUT RETRY FIRST. The assets endpoint is read-after-write
// inconsistent: a GET issued straight after the PUT can still serve the
// previous value, which made this report a confident mismatch on a write
// that had in fact succeeded. A safety check that cries wolf gets ignored,
// so it retries before it complains.
let back = null;
for (let a = 0; a < 5; a++) {
  back = await rest(`themes/${target.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}`);
  if (back.asset.value.length === value.length) break;
  await new Promise((s) => setTimeout(s, 1200 * (a + 1)));
}
if (back.asset.value.length === value.length) {
  console.log('OK, read back ' + back.asset.value.length.toLocaleString() + ' chars');
} else {
  console.log('WARNING: read back ' + back.asset.value.length + ' chars, expected ' + value.length
    + ' after 5 attempts. Re-read it before trusting this write.');
}
