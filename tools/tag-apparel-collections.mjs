// tag-apparel-collections.mjs, The Run House.
//
// Adds the tags the store's apparel navigation actually keys on, to supplier
// garments that are missing them.
//
// WHY THESE EXACT STRINGS. The apparel collections are smart collections keyed
// on literal tags, read off the live store 2026-10-20:
//
//   Women's Apparel  [womens-apparel-1]  TAG = "womens apparel" AND inventory > 0
//   Men's Apparel    [mens-apparel-2]    TAG = "mens apparel"   AND inventory > 0
//   Women's          [womens]            TAG = "women" OR "women's"
//   Men's            [mens-1]            TAG = "Men's" OR "men" OR "mens"
//   Socks            [socks-1]           TAG = "sock" OR "socks"
//   Hats & Headwear  [headwear]          TAG = "Hats" OR "headband"
//
// A garment without them is reachable only by direct link: in no apparel
// collection, in no gender collection, so effectively not on the site. That is
// what happened to the 2026-10-20 ON drop. The review modal pre-fills its Tags
// box with "<vendor>, <model>", and applyToCSV used to let that REPLACE the
// converter's tags rather than add to them, so all 365 garments were created
// carrying exactly ["ON Running", "<model>"]. Footwear never noticed because
// inheritance from a live sibling puts its tags back; apparel has no sibling.
// product-enrichment.js now unions instead of replacing, and this backfills
// what was already created.
//
// The lowercase spellings are deliberate: they are what the 41 ON garments
// already live on the store carry, so they are the proven form.
//
// ADD ONLY. Never removes a tag, never rewrites one, same rule as
// catalog-tags.js: an unexpected result here is a missing tag, never a lost
// one. A product that already has a tag is left alone for that tag.
//
//   node tools/tag-apparel-collections.mjs --since 2026-10-20
//   node tools/tag-apparel-collections.mjs --since 2026-10-20 --apply
//   node tools/tag-apparel-collections.mjs --apply          # every ON garment
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const APPLY = process.argv.includes('--apply');
const SINCE = arg('since', '');
const VENDOR = arg('vendor', 'ON Running');

function env() {
  const txt = fs.readFileSync(new URL('../worker/.dev.vars', import.meta.url), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
const E = env();
const SHOP = (E.SHOP_URL || '').replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';

let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error('token exchange HTTP ' + r.status);
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function gql(query, variables = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 800 * (attempt + 1))); return gql(query, variables, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const Q = `query($q: String!, $cursor: String) {
  products(first: 50, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title status productType tags
      metafield(namespace: "custom", key: "gender") { value } }
  }
}`;

const search = ['vendor:\'' + VENDOR + '\''].concat(SINCE ? ['created_at:>=' + SINCE] : []).join(' AND ');
const all = []; let cursor = null;
do { const d = await gql(Q, { q: search, cursor }); all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);

const isFootwearType = (t) => /shoes$/i.test(String(t || '').trim());
const garments = all.filter((p) => p.productType && !isFootwearType(p.productType));
console.log(`${VENDOR} products scanned: ${all.length}  |  garments: ${garments.length}` + (SINCE ? '  (since ' + SINCE + ')' : ''));

// Gender comes from the custom.gender metafield the create route writes, and
// falls back to the handle. Never guessed from the garment type: a sports bra
// is women's but a vest is not, and a wrong gender tag puts a product in the
// wrong collection, which is worse than leaving it out of both.
function genderKey(p) {
  const mf = String((p.metafield && p.metafield.value) || '').toLowerCase();
  if (/wom/.test(mf)) return 'womens';
  if (/^men|[^o]men/.test(mf)) return 'mens';
  if (/uni/.test(mf)) return 'unisex';
  const h = p.handle || '';
  if (/-womens?-|^womens?-|-women$/.test(h)) return 'womens';
  if (/-mens?-|^mens?-|-men$/.test(h)) return 'mens';
  if (/unisex/.test(h)) return 'unisex';
  return '';
}

const plan = [], skipped = [];
for (const p of garments) {
  const g = genderKey(p);
  if (!g) { skipped.push({ p, why: 'no gender on the product, not guessing one' }); continue; }
  const want = [
    g + ' apparel',                                             // the apparel collection
    g === 'mens' ? 'men' : g === 'womens' ? 'women' : 'unisex',  // the gender collection
    p.productType,                                               // the garment type
  ];
  const have = new Set(p.tags.map((t) => t.trim().toLowerCase()));
  const add = want.filter((t) => t && !have.has(t.toLowerCase()));
  if (add.length) plan.push({ p, add, tags: p.tags.concat(add) });
}

const tally = {};
plan.forEach(({ add }) => add.forEach((t) => { tally[t] = (tally[t] || 0) + 1; }));
console.log(`\nto change: ${plan.length} of ${garments.length}  (already correct: ${garments.length - plan.length - skipped.length})`);
console.log('\ntags to ADD:');
Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  ' + JSON.stringify(k)));
if (skipped.length) {
  console.log(`\nskipped: ${skipped.length}`);
  skipped.slice(0, 15).forEach(({ p, why }) => console.log('  ' + p.handle + '  ' + why));
  if (skipped.length > 15) console.log('  ... and ' + (skipped.length - 15) + ' more');
}
console.log('\nsample of the result:');
plan.slice(0, 5).forEach(({ p, add, tags }) => {
  console.log('  ' + p.handle);
  console.log('      was ' + JSON.stringify(p.tags));
  console.log('      add ' + JSON.stringify(add));
  console.log('      now ' + JSON.stringify(tags));
});

if (!plan.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = new URL('../apparel-tags-rollback-' + stamp + '.json', import.meta.url);
const fd = fs.openSync(file, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  products: plan.map(({ p, add }) => ({ id: p.id, handle: p.handle, tagsBefore: p.tags, added: add })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + file.pathname);

// tagsAdd is add-only by construction: it cannot remove a tag even if this
// script had the wrong idea about what is already there.
const ADD = `mutation($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`;
let done = 0, failed = 0;
for (const { p, add } of plan) {
  const d = await gql(ADD, { id: p.id, tags: add });
  const errs = d.tagsAdd.userErrors || [];
  if (errs.length) { failed++; console.log('  FAILED  ' + p.handle + '  ' + JSON.stringify(errs)); }
  else { done++; if (done % 25 === 0) console.log('  ... ' + done + ' / ' + plan.length); }
  await new Promise((s) => setTimeout(s, 180));
}
console.log(`\nTagged ${done}, failed ${failed}.`);
