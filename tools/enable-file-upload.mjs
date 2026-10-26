// enable-file-upload.mjs, The Run House.
//
// Turns the logo file upload on for a product, by adding its handle to the
// allowlists in the LIVE theme's snippets/product-form.liquid.
//
// THE FEATURE IS HARDCODED IN THE THEME, not an app and not a metafield. The
// upload block posts to Cloudinary (cloud drc8rx5xh, preset logo_uploads) and
// records the result on the line item as properties[_file_url], _file_name,
// _file_size, _file_type, _cloudinary_id, plus FLOW TRIGGER, LOGO STATUS and
// two fulfillment notes. None of the inventory tooling touches it.
//
// THERE ARE TWO ALLOWLISTS AND BOTH MUST CONTAIN THE HANDLE. They are the same
// variable name, `file_upload_products`, assigned twice in the same file:
//
//   around L29   gates the MARKUP, the upload box inside the product form
//   around L499  gates the SCRIPT, the Cloudinary logic after {%- endform -%}
//
// In only the first, a customer gets a file input that does nothing. In only
// the second, the script runs against markup that is not there. They have
// already drifted: measured 2026-10-26 the first held 19 entries and the
// second 20, the second carried one handle twice, and the FIRST entry of the
// first list is two handles concatenated with no comma between them
//
//   ...performance-tee-lst353ls2026-los-angeles-marathon-sponsors-partners...
//
// so that entry matches no product at all and that long sleeve tee has been
// silently missing its upload box. Left alone here because enabling a product
// nobody asked about is not this script's job, but it wants fixing.
//
// THE LIVE THEME IS READ FROM THE API, never hardcoded. Theme ids on this shop
// change often and the live one has been renamed more than once, so the role
// is the only reliable handle on it.
//
//   node tools/enable-file-upload.mjs                      # dry run, shows the diff
//   node tools/enable-file-upload.mjs --apply
//   node tools/enable-file-upload.mjs --restore <backup>   # put the file back
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const RESTORE_AT = process.argv.indexOf('--restore');
const RESTORE = RESTORE_AT >= 0 ? process.argv[RESTORE_AT + 1] : null;
const ROOT = new URL('..', import.meta.url).pathname;
const KEY = 'snippets/product-form.liquid';

// The four LA 2027 singlet listings. Danielle's email says the definitive list
// is coming separately, so trimming this is a one line edit.
const HANDLES = [
  '2027-asics-la-marathon-charities-asics-mens-rival-ii-singlet-tf3085',
  '2026-los-angeles-marathon-womens-performance-tank',
  '2026-asics-los-angeles-marathon-run-clubs-asics-mens-rival-ii-singlet',
  '2026-asics-los-angeles-marathon-run-clubs-asics-womens-rival-ii-singlet',
];

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
  if (r.status === 429 && attempt < 5) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); return rest(p, init, attempt + 1); }
  if (!r.ok) throw new Error('REST ' + r.status + ' ' + p + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

const live = (await rest('themes.json')).themes.find((t) => t.role === 'main');
if (!live) { console.error('No theme has role main.'); process.exit(1); }
console.log('live theme: ' + live.id + '  ' + JSON.stringify(live.name));

if (RESTORE) {
  const value = fs.readFileSync(RESTORE, 'utf8');
  console.log('restoring ' + KEY + ' from ' + RESTORE + '  (' + value.length + ' chars)');
  await rest(`themes/${live.id}/assets.json`, { method: 'PUT', body: JSON.stringify({ asset: { key: KEY, value } }) });
  console.log('restored.');
  process.exit(0);
}

const got = await rest(`themes/${live.id}/assets.json?asset[key]=${encodeURIComponent(KEY)}`);
const original = got.asset.value;
console.log(KEY + ': ' + original.length + ' chars');

// Every `assign file_upload_products = '...'`, in file order.
const RE = /(\{%-?\s*assign\s+file_upload_products\s*=\s*')([^']*)('\s*\|\s*split:\s*','\s*-?%\})/g;
const found = [...original.matchAll(RE)];
if (found.length < 2) {
  console.error('Expected at least 2 file_upload_products assignments, found ' + found.length +
    '. The theme has changed shape; read it before trusting this script.');
  process.exit(1);
}
console.log('allowlists found: ' + found.length);

let updated = original;
let added = 0;
for (let i = found.length - 1; i >= 0; i--) {
  const m = found[i];
  const current = m[2].split(',').map((h) => h.trim()).filter(Boolean);
  const missing = HANDLES.filter((h) => current.indexOf(h) === -1);
  const line = original.slice(0, m.index).split('\n').length;
  console.log('\n######## allowlist ' + (i + 1) + ', line ~' + line + ': ' + current.length + ' handles');
  if (!missing.length) { console.log('   all four already present'); continue; }
  missing.forEach((h) => console.log('   + ' + h));
  added += missing.length;
  const next = current.concat(missing).join(',');
  updated = updated.slice(0, m.index) + m[1] + next + m[3] + updated.slice(m.index + m[0].length);
}

console.log('\nhandles to add across both lists: ' + added);
if (!added) { console.log('Nothing to do.'); process.exit(0); }
console.log('file grows from ' + original.length + ' to ' + updated.length + ' chars');

// Nothing outside the two assign statements may change.
const normalise = (s) => s.replace(RE, '$1LIST$3');
if (normalise(original) !== normalise(updated)) {
  console.error('REFUSING: the edit changed something outside the two allowlists.');
  process.exit(1);
}
console.log('verified: only the two allowlists differ');

if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(ROOT, 'product-form-backup-' + stamp + '.liquid');
fs.writeFileSync(backup, original);
console.log('\nBackup written: ' + backup);
console.log('  restore with: node tools/enable-file-upload.mjs --restore ' + backup);

await rest(`themes/${live.id}/assets.json`, { method: 'PUT', body: JSON.stringify({ asset: { key: KEY, value: updated } }) });
console.log('wrote ' + KEY + ' to theme ' + live.id);
