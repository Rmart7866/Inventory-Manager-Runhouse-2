// Read one asset out of the LIVE theme and print it. READ ONLY, writes nothing.
// The live theme is resolved by ROLE, never by id, for the reason recorded in
// CLAUDE.md: ids on this shop change and the live theme has been renamed.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const KEY = process.argv[2];
if (!KEY) { console.error('usage: node tools/read-theme-asset.mjs <assets/key.liquid> [--list <substr>] [--theme <id|name>]'); process.exit(2); }
const LIST = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] || '' : null;

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
async function rest(p, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/${p}`, {
    headers: { 'X-Shopify-Access-Token': await token(), 'Content-Type': 'application/json' } });
  if (r.status === 429 && attempt < 5) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); return rest(p, attempt + 1); }
  if (!r.ok) throw new Error('REST ' + r.status + ' ' + p + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

// By default this reads the LIVE theme, resolved by ROLE rather than by id for
// the reason recorded in CLAUDE.md. --theme <id|name> targets another one, which
// is what you want when working on an unpublished theme: an id is accepted
// because an unpublished theme has no role to resolve by, and a name is matched
// case insensitively so you do not have to look the id up first.
const themes = (await rest('themes.json')).themes;
const wantIdx = process.argv.indexOf('--theme');
let live;
if (wantIdx !== -1) {
  const want = String(process.argv[wantIdx + 1] || '').trim();
  live = themes.find((t) => String(t.id) === want)
      || themes.find((t) => (t.name || '').toLowerCase() === want.toLowerCase());
  if (!live) {
    console.error('No theme matches ' + JSON.stringify(want) + '. Available:');
    for (const t of themes) console.error('  ' + t.id + '  ' + t.role.padEnd(11) + ' ' + JSON.stringify(t.name));
    process.exit(1);
  }
} else {
  live = themes.find((t) => t.role === 'main');
  if (!live) { console.error('No theme has role main.'); process.exit(1); }
}
console.error('theme: ' + live.id + '  ' + live.role + '  ' + JSON.stringify(live.name));

if (LIST !== null) {
  const all = (await rest(`themes/${live.id}/assets.json`)).assets
    .map((a) => a.key).filter((k) => k.includes(LIST)).sort();
  console.log(all.join('\n'));
  process.exit(0);
}

const got = await rest(`themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}`);
process.stdout.write(got.asset.value);
