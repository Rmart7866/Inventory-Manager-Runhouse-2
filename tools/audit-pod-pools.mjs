// audit-pod-pools.mjs, The Run House. READ ONLY, writes nothing to Shopify.
//
// Print-on-demand race merch works like this: one blank garment is bought from
// the supplier, and every team, charity and event gets its OWN Shopify listing
// of it with their logo. TF3085 has 41 listings and TF2934 has 50.
//
// SHOPIFY CANNOT SHARE A STOCK POOL. An inventory item belongs to exactly one
// variant, so those listings each hold their own number and the matching figures
// are a human copying the base by hand. Verified 2026-10-23: base and mirror
// carry different inventoryItem ids.
//
// AND NOTHING DECREMENTS THE BASE when a mirror sells. So a pool can be sold
// several times over and the base still reads whatever was last typed into it.
// This report measures that, per size, so the exposure is a number rather than
// a worry.
//
// THE JOIN is supplier style code plus colour code plus size. The style code is
// in the product TITLE, parsed exactly as sheets-worker/src/open-orders.js does
// it. The colour code and size are variant options.
//
// THE COLOUR FIELD IS USED AS A NOTES COLUMN, which is the one thing that stops
// this joining cleanly: a mirror's colour option often carries the logo code too,
//   base   "Navy-050"
//   mirror "Navy-050 with Full Chest Logo (B102)"
// so 305 of 357 pools had no base until the colour was normalised back to the
// "<Name>-<3 digits>" shape. Normalising in the matcher, rather than rewriting
// 305 live variant option values, is deliberate.
//
//   node tools/audit-pod-pools.mjs
//   node tools/audit-pod-pools.mjs --codes TF3085,TF2934 --csv pod-audit.csv
//   node tools/audit-pod-pools.mjs --all          # every listing with a style code
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const CODES = arg('codes', 'TF3085,TF2934').split(',').map((s) => s.trim()).filter(Boolean);
const ALL = process.argv.includes('--all');
const CSV = arg('csv', '');
const LOCATION = arg('location', 'Warehouse');

const ROOT = new URL('..', import.meta.url).pathname;
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
async function gql(q, v = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 900 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// Same pattern as sheets-worker: 4 digits + letter + 3 digits with an optional
// colour suffix, or two letters plus 4 digits.
const SUPPLIER_SKU = /\b(\d{4}[A-Za-z]\d{3}(?:-\d{3})?|[A-Za-z]{2}\d{4})\b/;
// A colour code is "<Name>-<3 digits>". Anything after it is a note, usually a
// logo: "Navy-050 with Full Chest Logo (B102)" is the Navy-050 pool.
const COLOUR_CODE = /^([A-Za-z][A-Za-z /]*?-\d{3})\b/;

const Q = `query($q:String!,$c:String){ products(first:50, after:$c, query:$q){
  pageInfo{hasNextPage endCursor}
  nodes{ id handle title status
    variants(first:60){ nodes{ id title selectedOptions{ name value }
      inventoryItem{ id tracked
        inventoryLevels(first:12){ nodes{ location{ id name } quantities(names:["on_hand","available","committed"]){ name quantity } } } } } } } } }`;

const products = [];
const queries = ALL ? ['status:active'] : CODES.map((c) => 'title:*' + c + '*');
for (const q of queries) {
  let c = null;
  do { const d = await gql(Q, { q, c }); products.push(...d.products.nodes);
    c = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (c);
}
const seen = new Set();
const rows = products.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
console.log('listings scanned: ' + rows.length + (ALL ? '  (all active)' : '  for ' + CODES.join(', ')));

const qtyAt = (v, name) => {
  const l = v.inventoryItem.inventoryLevels.nodes.find((x) => x.location.name === name);
  if (!l) return null;
  const g = (k) => (l.quantities.find((x) => x.name === k) || {}).quantity;
  return { onHand: g('on_hand') ?? 0, available: g('available') ?? 0, committed: g('committed') ?? 0 };
};
// A BASE listing is the plain garment: its title has no " - " event prefix.
// Every mirror is "<event or team> - <garment> (<code>)".
const isBase = (title) => !/ - /.test(String(title));

const pools = new Map();
const noStyle = [];
for (const p of rows.filter((x) => x.status === 'ACTIVE')) {
  const style = (String(p.title).match(SUPPLIER_SKU) || [])[1];
  if (!style) { noStyle.push(p); continue; }
  for (const v of p.variants.nodes) {
    const size = (v.selectedOptions.find((o) => /size/i.test(o.name)) || {}).value || String(v.title).split(' / ')[0];
    const rawColour = (v.selectedOptions.find((o) => /colou?r/i.test(o.name)) || {}).value
      || (String(v.title).split(' / ')[1] || '');
    const m = COLOUR_CODE.exec(String(rawColour).trim());
    const colour = m ? m[1] : String(rawColour).trim();
    const key = style + ' | ' + (colour || '(no colour)') + ' | ' + size;
    if (!pools.has(key)) pools.set(key, { style, colour, size, base: null, mirrors: [] });
    const slot = pools.get(key);
    const rec = { product: p, variant: v, raw: rawColour, q: qtyAt(v, LOCATION) };
    if (isBase(p.title)) slot.base = rec; else slot.mirrors.push(rec);
  }
}

const withBase = [...pools.values()].filter((s) => s.base);
const orphans  = [...pools.values()].filter((s) => !s.base && s.mirrors.length);
const negatives = [];
const overs = [];
let mirrorUnits = 0, baseUnits = 0;
for (const s of withBase) {
  const b = s.base.q ? s.base.q.onHand : 0;
  baseUnits += b;
  let poolMirror = 0;
  for (const m of s.mirrors) {
    const q = m.q ? m.q.onHand : 0;
    poolMirror += q;
    if (q < 0) negatives.push({ s, m, q });
  }
  mirrorUnits += poolMirror;
  if (poolMirror > b) overs.push({ s, base: b, mirror: poolMirror, over: poolMirror - b });
}
for (const s of orphans) for (const m of s.mirrors) { const q = m.q ? m.q.onHand : 0; if (q < 0) negatives.push({ s, m, q }); }

console.log('\n================ ' + LOCATION + ' POOL AUDIT ================');
console.log('pools (style + colour + size)      : ' + pools.size);
console.log('  with a base listing              : ' + withBase.length);
console.log('  mirrors only, NO base to sync to : ' + orphans.length);
console.log('\nunits the base listings say are on hand : ' + baseUnits);
console.log('units the mirror listings offer         : ' + mirrorUnits);
if (baseUnits > 0) console.log('mirrors are offering                    : ' + (mirrorUnits / baseUnits).toFixed(1) + 'x the base');

console.log('\n---- ALREADY NEGATIVE: sold and owed (' + negatives.length + ') ----');
negatives.sort((a, b) => a.q - b.q).slice(0, 25).forEach(({ s, m, q }) =>
  console.log('   ' + String(q).padStart(5) + '   ' + (s.style + ' ' + s.colour + ' ' + s.size).padEnd(34) + m.product.title.slice(0, 54)));
if (negatives.length > 25) console.log('   ... and ' + (negatives.length - 25) + ' more');

console.log('\n---- POOLS OFFERING MORE THAN THE BASE HOLDS (' + overs.length + ') ----');
overs.sort((a, b) => b.over - a.over).slice(0, 20).forEach(({ s, base, mirror, over }) =>
  console.log('   base ' + String(base).padStart(4) + '   mirrors ' + String(mirror).padStart(5) + '   over by ' + String(over).padStart(5) + '   ' + s.style + ' ' + s.colour + ' ' + s.size + '  (' + s.mirrors.length + ' listings)'));

console.log('\n---- ORPHANED BY THE COLOUR FIELD (' + orphans.length + ' pools) ----');
console.log('These mirrors have no base to sync from, because their colour option');
console.log('carries a logo note that no base listing matches:');
const byRaw = {};
orphans.forEach((s) => s.mirrors.forEach((m) => { byRaw[m.raw] = (byRaw[m.raw] || 0) + 1; }));
Object.entries(byRaw).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) =>
  console.log('   ' + String(v).padStart(4) + '  ' + JSON.stringify(k).slice(0, 72)));

if (noStyle.length) {
  console.log('\n---- NO STYLE CODE IN THE TITLE (' + noStyle.length + '), cannot be pooled ----');
  noStyle.slice(0, 8).forEach((p) => console.log('   ' + p.title.slice(0, 74)));
}

if (CSV) {
  const out = [['style', 'colour', 'size', 'role', 'listing', 'handle', 'on_hand', 'available', 'committed', 'raw_colour_option', 'flag'].join(',')];
  const esc = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  for (const s of [...pools.values()]) {
    const push = (rec, role) => {
      const q = rec.q || { onHand: '', available: '', committed: '' };
      const flags = [];
      if (q.onHand < 0) flags.push('NEGATIVE');
      if (role === 'mirror' && s.base && q.onHand !== (s.base.q ? s.base.q.onHand : 0)) flags.push('differs from base');
      if (role === 'mirror' && !s.base) flags.push('no base to sync from');
      out.push([s.style, s.colour, s.size, role, rec.product.title, rec.product.handle,
        q.onHand, q.available, q.committed, rec.raw, flags.join('; ')].map(esc).join(','));
    };
    if (s.base) push(s.base, 'base');
    s.mirrors.forEach((m) => push(m, 'mirror'));
  }
  const p = path.join(ROOT, CSV);
  fs.writeFileSync(p, out.join('\n'));
  console.log('\nCSV written: ' + p + '   (' + (out.length - 1) + ' rows)');
}
console.log('\nREAD ONLY. Nothing was written to Shopify.');
