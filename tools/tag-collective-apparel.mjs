// tag-collective-apparel.mjs, The Run House.
//
// Puts the Collective dropship garments into the apparel navigation. Measured
// 2026-10-21: 505 active products whose taxonomy category is under
// "Apparel & Accessories > Clothing > " carried none of the tags the apparel
// collections key on, so they were reachable by direct link only.
//
// WHY A VENDOR VERDICT AND NOT A TITLE RULE. Collective is a marketplace, so
// titles follow 40 different house styles and most carry no gender word at all:
// "The Glee Halter Tank Top", "Ombré Pink Purple - (Standard & Extra Wide)",
// "Uluwatu Seapine". Reading gender off those titles found a signal on only 75
// of 558. Reading it off the VENDOR resolves 495, because these vendors sell one
// thing: Fitglutes is women's activewear (zero of 390 titles mention men's,
// male, boxer or unisex; the vocabulary is leggings 143, sports bras 123,
// shorts 102, crop 74, tennis skirts, 2-piece sets 195), and Crazy Compression,
// Comrad, MudGear, Wrightsock, Minus33, WORN and VIM & VIGR sell socks.
//
// THE TITLE STILL WINS WHERE IT SPEAKS. A per-product gender word overrides the
// vendor verdict, so Swift Running's "Men's Running Tank Top" is tagged men's
// inside a vendor with no verdict, and a men's or unisex item appearing in
// Fitglutes later is excluded automatically rather than mis-tagged. Nothing in
// Fitglutes trips that today, which is the point: the guard costs nothing now
// and catches the stray when it arrives.
//
// SOCKS GET NO GENDER TAG. The apparel collections are gender gated and there
// is no Unisex Apparel collection, so a "unisex apparel" tag would put them in
// nothing. What makes them reachable today is the `socks` tag, which the live
// Socks collection (392 products) keys on, plus `apparel:socks` so they are one
// command away from a unisex collection if one is ever made.
//
// ADD ONLY, via tagsAdd. A product that already carries a tag is left alone.
//
//   node tools/tag-collective-apparel.mjs
//   node tools/tag-collective-apparel.mjs --apply
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

// Vendors that sell exactly one gender, or only socks. A vendor absent here
// falls through to the title rule and is reported if that says nothing either.
const VENDOR_VERDICT = [
  [/^Fitglutes/i,            'womens'],
  [/^Trime' Luxe/i,          'womens'],
  [/^Goal Five/i,            'womens'],
  [/^COMFORT BOUTIQUE/i,     'womens'],
  [/^Varlo$/i,               'womens'],
  [/^Trophy Yoga/i,          'mens'],
  [/^Crazy Compression/i,    'socks'],
  [/^Comrad/i,               'socks'],
  [/^MudGear/i,              'socks'],
  [/^Minus33/i,              'socks'],
  [/^Wrightsock/i,           'socks'],
  [/^WORN$/i,                'socks'],
  [/^VIM & VIGR/i,           'socks'],
  [/^Fulton$/i,              'socks'],
];
const verdictFor = (vendor) => {
  for (const [re, v] of VENDOR_VERDICT) if (re.test(String(vendor || '').trim())) return v;
  return '';
};

// Same group vocabulary and the same first-match-wins ordering as
// tools/apparel-collections.mjs, so a Collective garment and an ON garment land
// in the same collection for the same reason.
const GROUP_RULES = [
  [/sports?\s*bra|\bbra\b|bralette/i,                         'sports-bras'],
  [/\bsocks?\b|compression sock|crew sock|ankle sock|knee.high/i, 'socks'],
  [/legging|\btights?\b/i,                                    'tights'],
  [/\bshorts?\b/i,                                            'shorts'],
  [/hoodie|sweatshirt|crewneck|crew\s*neck|half[-\s]?zip|quarter[-\s]?zip|1\/4\s*zip|full[-\s]?zip|midlayer|pullover/i, 'hoodies'],
  [/jacket|\bvest\b|windbreaker|\bshell\b|anorak|parka/i,      'jackets'],
  [/jogger|sweatpant|\bpants?\b|trouser|\bbottoms?\b/i,        'pants'],
  [/glove|mitten/i,                                           'gloves'],
  [/\bhats?\b|\bcaps?\b|beanie|headband|visor|headwear/i,      'headwear'],
  [/skort|\bskirt\b/i,                                        'skirts'],
  [/\bdress\b|romper|jumpsuit|bodysuit|unitard/i,             'dresses'],
  [/\btank\b|singlet/i,                                       'tops'],
  [/tee\b|t-?shirts?\b|\bshirts?\b|\btops?\b|jersey|polo|sweater|long[-\s]?sleeve|short[-\s]?sleeve|\bcrop\b/i, 'tops'],
];
const groupOf = (hay) => {
  for (const [re, g] of GROUP_RULES) if (re.test(hay)) return g;
  return '';
};

// Title-level gender, which overrides the vendor verdict when present.
const W_RE = /\b(women|womens|women'?s|ladies|female)\b/i;
const M_RE = /\b(men|mens|men'?s|male)\b/i;
const U_RE = /\bunisex\b/i;

const Q = `query($q:String!,$c:String){ products(first:250, after:$c, query:$q){
  pageInfo{hasNextPage endCursor}
  nodes{ id handle title vendor productType status tags category{ fullName } } } }`;
const all = []; let cursor = null;
do { const d = await gql(Q, { q: 'tag:collective AND status:active', c: cursor });
  all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);

// PRECISE clothing test. "Clothing > " with the separator, because
// "Apparel & Accessories > Clothing Accessories" starts with the same letters
// and that mistake counted 506 sunglasses and watches as garments on the first
// pass. Those were correctly categorised all along.
const isClothing = (p) => p.category && /^Apparel & Accessories > Clothing > /.test(p.category.fullName);
const APPAREL_TAGS = ['womens apparel', 'mens apparel', 'unisex apparel'];
const rows = all.filter((p) => isClothing(p) && !p.tags.some((t) => APPAREL_TAGS.includes(t.trim().toLowerCase())));
console.log('active collective products       : ' + all.length);
console.log('of those, real clothing untagged : ' + rows.length);

const plan = [], unresolved = [];
for (const p of rows) {
  const hay = p.title + ' ' + (p.productType || '') + ' ' + (p.category ? p.category.fullName : '');
  const titleGender = U_RE.test(hay) ? 'unisex'
    : (W_RE.test(hay) && !M_RE.test(hay)) ? 'womens'
    : (M_RE.test(hay) && !W_RE.test(hay)) ? 'mens' : '';
  const verdict = verdictFor(p.vendor);
  const group = groupOf(hay) || (verdict === 'socks' ? 'socks' : '');

  const want = [];
  // A SOCK IS A SOCK whatever the vendor. Orange Mud and PYNRS have no vendor
  // verdict because they sell a mixed range, but "6\" Merino Wool Sock" and
  // "Road Logo Crew Sock" need no verdict to classify: the garment word is
  // right there, and socks take no gender tag either way.
  const isSock = verdict === 'socks' || group === 'socks';
  if (isSock && !titleGender) {
    // Socks: no gender tag, see the header. `socks` is what the live Socks
    // collection keys on, and it is the only thing that makes them reachable
    // today.
    want.push('socks', 'apparel:socks');
  } else {
    const gender = titleGender || verdict;
    if (!gender || gender === 'socks') { unresolved.push(p); continue; }
    if (gender === 'unisex') { unresolved.push(p); continue; }   // no unisex collection exists yet
    want.push(gender + ' apparel');
    want.push(gender === 'mens' ? 'men' : 'women');
    if (group) want.push('apparel:' + group);
  }
  const have = new Set(p.tags.map((t) => t.trim().toLowerCase()));
  const add = want.filter((t) => t && !have.has(t.toLowerCase()));
  if (add.length) plan.push({ p, add });
}

const tally = {};
plan.forEach(({ add }) => add.forEach((t) => { tally[t] = (tally[t] || 0) + 1; }));
console.log('\nproducts to tag : ' + plan.length);
console.log('tags to ADD:');
Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  ' + JSON.stringify(k)));

if (unresolved.length) {
  console.log('\nLEFT ALONE, no vendor verdict and no gender in the title (' + unresolved.length + ').');
  console.log('These need a human, or a vendor verdict adding to VENDOR_VERDICT:');
  unresolved.forEach((p) => console.log('   ' + p.vendor.slice(0, 28).padEnd(30) + p.title.slice(0, 48)));
}
console.log('\nsample of what will be written:');
plan.slice(0, 6).forEach(({ p, add }) => console.log('   ' + p.handle.slice(0, 46).padEnd(48) + JSON.stringify(add)));

if (!plan.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'collective-tags-rollback-' + stamp + '.json');
const fd = fs.openSync(rb, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  added: plan.map(({ p, add }) => ({ id: p.id, handle: p.handle, vendor: p.vendor, tagsBefore: p.tags, added: add })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + rb);

const ADD = `mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors{ field message } } }`;
let n = 0, bad = 0;
for (const { p, add } of plan) {
  const d = await gql(ADD, { id: p.id, tags: add });
  const e = d.tagsAdd.userErrors || [];
  if (e.length) { bad++; console.log('  FAILED ' + p.handle + ' ' + JSON.stringify(e)); } else n++;
  if (n % 100 === 0) console.log('  ... ' + n + ' / ' + plan.length);
  await new Promise((s) => setTimeout(s, 150));
}
console.log(`\ntagged ${n}, failed ${bad}.`);
