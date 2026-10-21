// group-collective-colorways.mjs, The Run House.
//
// Collective lists some garments as ONE PRODUCT PER COLOUR instead of one
// product with a Color option. This gives those the same treatment the shoes
// get: a cw-group: tag so the collection grid collapses them into one card with
// a swatch row, and the custom.* metafields so the product page shows the
// swatches.
//
// IT ONLY APPLIES TO SOME OF THEM. Measured 2026-10-21 over 2,140 active
// Collective products: 695 already carry Color as a real multi-value option and
// need nothing. Of the clothing that does not, 401 are candidates and they fall
// into 87 clusters covering 244 products. The rest are single colourways where
// a group of one renders as an ordinary card anyway.
//
// THE COLOUR NAME COMES FROM THE OPTION FIRST. 92 candidates carry a Color
// option with a single value, which is a clean name the vendor chose: "Fogged
// In", "Steely", "Cloud", "Charcoal". Only when there is no such option is the
// name parsed out of the title, from a trailing parenthesis or after the last
// dash. That order matters because Comrad lists six products all titled
// "Knee-High Compression Socks - Solid" with no colour in the title at all.
//
// THREE GUARDS, all must pass, same as the ON apparel grouping:
//   the derived model must not just be the vendor name,
//   every member of a group must share one product type,
//   every member must have a DISTINCT colour.
// A group failing any of them is reported and left alone. A wrong group hides
// unrelated products behind a swatch row, which is worse than no grouping: an
// ungrouped collection simply shows one card per product, as it does today.
//
//   node tools/group-collective-colorways.mjs
//   node tools/group-collective-colorways.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
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

const Q = `query($q:String!,$c:String){ products(first:200, after:$c, query:$q){
  pageInfo{hasNextPage endCursor}
  nodes{ id handle title vendor productType status tags
    category{ fullName }
    options{ name optionValues{ name } }
    metafields(first:20, namespace:"custom"){ nodes{ key value } } } } }`;
const all = []; let cursor = null;
do { const d = await gql(Q, { q: 'tag:collective AND status:active', c: cursor });
  all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);
console.log('active collective products: ' + all.length);

const mfOf = (p, k) => { const n = p.metafields.nodes.find((m) => m.key === k); return n ? n.value : ''; };
const colourOpt = (p) => p.options.find((o) => /colou?r/i.test(o.name));
// "Clothing > " with the separator. "Clothing Accessories" must not match.
const isClothing = (p) => p.category && /^Apparel & Accessories > Clothing > /.test(p.category.fullName);

const COLOURS = ['black','white','navy','blue','red','green','pink','purple','grey','gray','beige','brown',
 'orange','yellow','teal','aqua','mint','sand','ivory','charcoal','olive','burgundy','maroon','coral','lilac',
 'lavender','cream','tan','khaki','rose','blush','plum','mauve','sage','stone','slate','taupe','camo','tie dye',
 'ombre','ombré','rainbow','heather','denim','bone','clay','ember','frost','glacier','jet','onyx','berry',
 'cobalt','crimson','emerald','fuchsia','gold','silver','bronze','copper','peach','apricot','lemon','lime',
 'solid','stripes','sequin'];
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// The model: the title with the colour words and any bracketed or trailing
// colour taken out, so two colourways of one garment reduce to the same string.
function modelOf(title) {
  let t = ' ' + String(title || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')                 // "(Black/Gray)", "(2 pair pack)"
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ') + ' ';
  for (const c of COLOURS) t = t.split(' ' + c + ' ').join(' ');
  return t.replace(/\s+/g, ' ').trim();
}
// The colour NAME. The vendor's own single-value option wins; then a trailing
// parenthesis; then whatever follows the last dash, en dash included.
function colourOf(p) {
  const o = colourOpt(p);
  if (o && o.optionValues.length === 1) return o.optionValues[0].name.trim();
  const paren = /\(([^)]{2,40})\)\s*$/.exec(p.title);
  if (paren && !/pack|pair|standard|wide|mmhg/i.test(paren[1])) return paren[1].trim();
  const parts = String(p.title).split(/\s+[-–—]\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (last && last.length <= 40 && !/pack|pair|standard|wide|mmhg/i.test(last)) return last;
  }
  return '';
}

const cands = all.filter((p) => isClothing(p) && !(colourOpt(p) && colourOpt(p).optionValues.length > 1));
console.log('clothing candidates (no real colour option): ' + cands.length);

const groups = new Map();
for (const p of cands) {
  const model = modelOf(p.title);
  if (!model || slug(model) === slug(p.vendor)) continue;      // brand-name guard
  const colour = colourOf(p);
  if (!colour) continue;                                      // no colour, no colourway
  const key = slug(p.vendor) + '--' + slug(model);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ p, colour });
}

const good = [], rejected = [];
for (const [key, members] of groups) {
  if (members.length < 2) continue;
  const types = new Set(members.map((m) => m.p.productType || ''));
  const colours = new Set(members.map((m) => m.colour.toLowerCase()));
  if (types.size > 1) { rejected.push(key + '  mixed product types: ' + [...types].join(' | ')); continue; }
  if (colours.size !== members.length) { rejected.push(key + '  repeated colour, not distinct colourways'); continue; }
  good.push([key, members.slice().sort((a, b) => a.colour.localeCompare(b.colour))]);
}
good.sort((a, b) => b[1].length - a[1].length);
console.log('\ngroups that pass all three guards : ' + good.length);
console.log('products inside them              : ' + good.reduce((s, [, v]) => s + v.length, 0));
console.log('\nlargest groups:');
good.slice(0, 12).forEach(([k, v]) => {
  console.log('  x' + String(v.length).padStart(2) + '  ' + k.slice(0, 54).padEnd(56) + v.map((m) => m.colour).slice(0, 5).join(', '));
});
if (rejected.length) {
  console.log('\nREJECTED by the guards (' + rejected.length + '), left ungrouped:');
  rejected.slice(0, 10).forEach((r) => console.log('   ' + r));
}

// Build the writes: a cw-group tag for the collection grid, style_siblings and
// color_name for the product page. No model_widths or width_class: these are
// garments and the theme renders WIDTH pills off model_widths.
const tagOps = [], mfOps = [];
for (const [key, members] of good) {
  const ids = members.map((m) => m.p.id);
  const tag = 'cw-group:' + key;
  for (const { p, colour } of members) {
    const existing = p.tags.find((t) => /^cw-group:/i.test(t.trim()));
    if (!existing) tagOps.push({ p, tag });
    const sibNow = mfOf(p, 'style_siblings');
    const sibNext = JSON.stringify(ids);
    if (sibNow !== sibNext) mfOps.push({ ownerId: p.id, handle: p.handle, namespace: 'custom',
      key: 'style_siblings', type: 'list.product_reference', value: sibNext });
    if (mfOf(p, 'color_name') !== colour) mfOps.push({ ownerId: p.id, handle: p.handle, namespace: 'custom',
      key: 'color_name', type: 'single_line_text_field', value: colour });
  }
}
console.log('\ncw-group tags to add : ' + tagOps.length);
console.log('metafields to write  : ' + mfOps.length);

if (!tagOps.length && !mfOps.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'collective-groups-rollback-' + stamp + '.json');
const fd = fs.openSync(rb, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  tags: tagOps.map(({ p, tag }) => ({ id: p.id, handle: p.handle, tag })),
  metafields: mfOps.map((o) => ({ handle: o.handle, key: o.key })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + rb);

const ADD = `mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors{ field message } } }`;
let n = 0, bad = 0;
for (const { p, tag } of tagOps) {
  const d = await gql(ADD, { id: p.id, tags: [tag] });
  const e = d.tagsAdd.userErrors || [];
  if (e.length) { bad++; console.log('  FAILED tag ' + p.handle + ' ' + JSON.stringify(e)); } else n++;
  await new Promise((s) => setTimeout(s, 140));
}
console.log(`cw-group tags added ${n}, failed ${bad}`);

const SET = `mutation($metafields:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$metafields){ userErrors{ field message } } }`;
let m = 0, mbad = 0;
for (let i = 0; i < mfOps.length; i += 25) {
  const chunk = mfOps.slice(i, i + 25).map(({ ownerId, namespace, key, type, value }) => ({ ownerId, namespace, key, type, value }));
  const d = await gql(SET, { metafields: chunk });
  const e = d.metafieldsSet.userErrors || [];
  if (e.length) {
    // metafieldsSet is atomic, so retry singly and name the one that is wrong.
    for (const one of chunk) {
      const r = await gql(SET, { metafields: [one] });
      const re = r.metafieldsSet.userErrors || [];
      if (re.length) { mbad++; console.log('  REJECTED ' + one.key + ' ' + (re[0].message || '').slice(0, 80)); } else m++;
      await new Promise((s) => setTimeout(s, 120));
    }
  } else m += chunk.length;
  await new Promise((s) => setTimeout(s, 200));
}
console.log(`metafields written ${m}, failed ${mbad}`);
