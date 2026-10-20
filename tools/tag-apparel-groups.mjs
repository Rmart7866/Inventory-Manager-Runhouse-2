// tag-apparel-groups.mjs, The Run House.
//
// Writes the cw-group: tag that makes a garment's colourways COLLAPSE INTO ONE
// CARD on a collection page, the same way the shoes do.
//
// HOW THE STOREFRONT GROUPING ACTUALLY WORKS, because it is not the PDP swatch
// system and the two are easy to confuse:
//
//   PDP swatches      snippets/colorway-swatches.liquid, reads the custom.*
//                     metafields (style_siblings, gender_sibling, color_name).
//                     tools/wire-apparel-swatches.mjs writes those.
//   COLLECTION cards   snippets/shoe-collection-grid.liquid, groups products
//                     that share a cw-group:<key> TAG into one card with a
//                     swatch row under the price. This file writes that tag.
//
// Both have to agree about what a group is, so this uses the SAME definition as
// the metafield tool: model plus GENDER. Footwear groups on model plus width
// class, because a D and a 2E are different shoes to a runner; a garment has no
// width, and the men's and women's cut of one tee are genuinely separate
// products with separate size runs, so gender is the right second axis.
//
// THIS IS NOT A DRIFT OF THE PORTED TAG RULE. worker/src/parsers.js and
// group.js compute FOOTWEAR cw-group keys and are byte-for-byte Color Swatch
// copies; nothing here touches them, and they never see apparel because
// classify() keeps garments out of the footwear catalog. The storefront grid
// does not parse the key, it only groups products whose key strings are equal
// (see groupKeyOf in the snippet), so adding an apparel key cannot change any
// footwear tag or any footwear grouping. `npm run parity` is unaffected.
//
// The suffix vocabularies are disjoint on purpose, so an apparel key can never
// collide with a footwear one:
//   footwear   cw-group:<model>--standard | --wide | --xwide | --narrow
//   apparel    cw-group:<model>--womens   | --mens | --unisex
//
// ALL STATUSES, unlike the metafield tool. A metafield sibling is a LINK, so a
// draft in a swatch row would 404 and that tool is ACTIVE only. A tag is not a
// link: the collection grid only ever sees published products, so tagging a
// draft now means its card groups correctly the moment it goes live, with no
// second run to remember.
//
// ADD ONLY, same rule as catalog-tags.js. A product that already carries a
// cw-group tag is left alone rather than re-keyed, so a hand correction in the
// product library survives.
//
//   node tools/tag-apparel-groups.mjs
//   node tools/tag-apparel-groups.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
// ON ONLY BY DEFAULT, and this is the important limit on this tool.
//
// The group key is derived from the TITLE, cut at the last " - ", which is
// correct only where the title is machine generated as "<model> - <colour>".
// That holds for the ON garments Stage 4 creates and nowhere else. The first
// dry run over all 42 vendors proved it: other brands use " - " as a BRAND
// separator, so "90 Degree by Reflex - Powerlux High Rise Leggings" gave a
// model of "90 Degree by Reflex" and 18 unrelated products, leggings, a fleece
// hoodie, a zip jacket, men's pants, collapsed into ONE card. Same for Mono B
// (11), Relay Active (7) and Alyth Active (7).
//
// A wrong group is far worse than no group: an ungrouped collection just shows
// one card per product, which is what it does today, while a wrong group HIDES
// products behind a swatch row they have nothing to do with. So other vendors
// need per-brand title knowledge before they can be grouped, and until someone
// has it they stay out. --all-vendors exists for testing that work, not for
// production use.
const ALL_VENDORS = process.argv.includes('--all-vendors');
const VENDOR = arg('vendor', ALL_VENDORS ? '' : 'ON Running');

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

// The opt-in set is the apparel tags, the same set the collections use, so a
// product in one of the 16 new collections is exactly a product considered here.
const Q = `query($q:String!,$c:String){ products(first:250, after:$c, query:$q){
  pageInfo{hasNextPage endCursor} nodes{ id handle title vendor productType status tags
    metafield(namespace:"custom", key:"gender"){ value } } } }`;
const search = ["tag:'womens apparel' OR tag:'mens apparel' OR tag:'unisex apparel'"]
  .concat(VENDOR ? ["vendor:'" + VENDOR + "'"] : []).join(' AND ');
const all = []; let cursor = null;
do { const d = await gql(Q, { q: search, c: cursor }); all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);
console.log('tagged apparel scanned: ' + all.length);

const isFootwearType = (t) => /shoes$/i.test(String(t || '').trim());
// Model off the TITLE, cut at the last " - ", which is the same split
// snippets/shoe-collection-grid.liquid's modelTitle() uses to label the card.
// If these two disagreed, products would group under one key and then show a
// card titled after one of them.
function modelOf(title) {
  let t = String(title || '').trim().replace(/\s*\([^)]*\)\s*$/, '');
  t = t.replace(/^ON\s+/i, '').replace(/^(Men'?s|Women'?s|Unisex)\s+/i, '');
  const i = t.lastIndexOf(' - ');
  if (i > 0) t = t.slice(0, i);
  return t.replace(/\s+/g, ' ').trim();
}
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function genderOf(p) {
  const t = p.tags.map((x) => String(x).toLowerCase());
  if (t.includes('womens apparel')) return 'womens';
  if (t.includes('mens apparel')) return 'mens';
  if (t.includes('unisex apparel')) return 'unisex';
  const mf = String((p.metafield && p.metafield.value) || '').toLowerCase();
  if (/wom/.test(mf)) return 'womens';
  if (/men/.test(mf)) return 'mens';
  return '';
}

// The colour is whatever follows the last " - ". A title with no " - " has no
// colour to group by, so it can only ever be a group of one.
function colorOf(title) {
  const t = String(title || '').trim().replace(/\s*\([^)]*\)\s*$/, '');
  const i = t.lastIndexOf(' - ');
  return i > 0 ? t.slice(i + 3).trim() : '';
}

const plan = [], skipped = [], hasAlready = [], rejected = [];
const groups = new Map();
for (const p of all) {
  if (isFootwearType(p.productType)) continue;
  const g = genderOf(p), m = modelOf(p.title), col = colorOf(p.title);
  if (!g || !m) { skipped.push(p.handle + '  ' + (!g ? 'no gender' : 'no model from the title')); continue; }
  // THE BRAND-NAME GUARD. If the derived model is just the vendor, the title's
  // " - " was a brand separator and the key is meaningless.
  if (slug(m) === slug(p.vendor)) { skipped.push(p.handle + '  model came out as the vendor name'); continue; }
  if (!col) { skipped.push(p.handle + '  no colour after a " - ", cannot be a colourway'); continue; }
  const key = slug(m) + '--' + g;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(Object.assign({}, p, { _color: col }));
}

// A group is only real if its members differ ONLY by colour. Two further
// checks, because the model string alone has been wrong before: every member
// must be the same GARMENT TYPE, and every member must be a DISTINCT colour. A
// group failing either is reported and left untagged.
const multi = [];
for (const [key, members] of groups) {
  if (members.length < 2) continue;      // a group of one needs no tag: it
                                         // already renders as a normal card,
                                         // and a later run picks up the pair.
  const types = new Set(members.map((m) => m.productType));
  const colors = new Set(members.map((m) => m._color.toLowerCase()));
  if (types.size > 1) { rejected.push(key + '  mixed garment types: ' + [...types].join(', ')); continue; }
  if (colors.size !== members.length) { rejected.push(key + '  repeated colour, so these are not colourways of one garment'); continue; }
  multi.push([key, members]);
}
for (const [key, members] of multi) {
  const want = 'cw-group:' + key;
  for (const p of members) {
    const existing = p.tags.find((t) => /^cw-group:/i.test(t.trim()));
    if (existing) { if (existing.trim().toLowerCase() !== want.toLowerCase()) hasAlready.push(p.handle + '  has ' + existing + ', would be ' + want); continue; }
    plan.push({ p, tag: want });
  }
}
console.log('group keys: ' + groups.size + '  |  keys with more than one colourway: ' + multi.length);
console.log('products that will collapse into a grouped card: ' + multi.reduce((s, [, v]) => s + v.length, 0));
console.log('\nbiggest groups:');
multi.sort((a, b) => b[1].length - a[1].length).slice(0, 10).forEach(([k, v]) =>
  console.log('  ' + String(v.length).padStart(3) + '  cw-group:' + k.padEnd(38) + v[0].title.replace(/ - .*$/, '')));
console.log('\ntags to ADD: ' + plan.length);
if (rejected.length) {
  console.log('\ngroups REJECTED by the same-type / distinct-colour checks: ' + rejected.length);
  rejected.slice(0, 10).forEach((r) => console.log('   ' + r));
}
if (hasAlready.length) {
  console.log('\nalready carry a DIFFERENT cw-group tag, left alone (add-only):');
  hasAlready.slice(0, 10).forEach((h) => console.log('   ' + h));
}
if (skipped.length) {
  console.log('\nskipped ' + skipped.length + ':');
  skipped.slice(0, 10).forEach((h) => console.log('   ' + h));
}

if (!plan.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'apparel-groups-rollback-' + stamp + '.json');
const fd = fs.openSync(rb, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  added: plan.map(({ p, tag }) => ({ id: p.id, handle: p.handle, tag })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + rb);

const ADD = `mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors{ field message } } }`;
let n = 0, bad = 0;
for (const { p, tag } of plan) {
  const d = await gql(ADD, { id: p.id, tags: [tag] });
  const e = d.tagsAdd.userErrors || [];
  if (e.length) { bad++; console.log('  FAILED ' + p.handle + ' ' + JSON.stringify(e)); } else n++;
  if (n % 100 === 0) console.log('  ... ' + n + ' / ' + plan.length);
  await new Promise((s) => setTimeout(s, 150));
}
console.log(`\ncw-group tags added ${n}, failed ${bad}.`);
