// split-trail-by-gender.mjs, The Run House.
//
// Makes Trail browsable per gender, which the nav needs and a smart collection
// cannot express on its own.
//
// WHY A TAG AND NOT A RULE. The Trail collection's rule is ANY of seven tags
// ("trail running", "Trail Shoes", "Ghost Trail", "Road to Trail",
// "Cloudsurfer Trail 2", "Speedgoat 6", "trail-running"), and a Shopify smart
// collection is all-AND or all-OR, never mixed. So "(any of those seven) AND
// (this gender)" is not expressible. One flat tag per gender makes it an ALL
// rule, exactly the trick the apparel:<group> tags use.
//
// UNISEX GOES IN BOTH. Measured 2026-10-21 the collection holds 497 active
// products: 245 men's, 242 women's and 10 unisex. A unisex trail shoe belongs
// under both headings, so it gets both tags rather than being dropped from each.
//
// ADD ONLY. The source of truth stays the existing Trail collection, so this
// can be re-run after new trail shoes arrive and it only fills the gaps.
//
//   node tools/split-trail-by-gender.mjs
//   node tools/split-trail-by-gender.mjs --apply
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

const rows = []; let cursor = null;
do {
  const d = await gql(`query($c:String){ collectionByHandle(handle:"trail-running-shoes"){
    products(first:250, after:$c){ pageInfo{hasNextPage endCursor}
      nodes{ id handle title status productType tags } } } }`, { c: cursor });
  rows.push(...d.collectionByHandle.products.nodes);
  cursor = d.collectionByHandle.products.pageInfo.hasNextPage ? d.collectionByHandle.products.pageInfo.endCursor : null;
} while (cursor);
const active = rows.filter((p) => p.status === 'ACTIVE');
console.log('Trail collection: ' + rows.length + ' products, ' + active.length + ' active');

const plan = [], skipped = [];
for (const p of active) {
  const t = String(p.productType || '');
  const want = [];
  // Gender comes from the product TYPE, the same signal the gendered footwear
  // collections already use, so the two can never disagree.
  if (/^men'?s shoes$/i.test(t)) want.push('trail:mens');
  else if (/^women'?s shoes$/i.test(t)) want.push('trail:womens');
  else if (/^unisex shoes$/i.test(t)) want.push('trail:mens', 'trail:womens');
  else { skipped.push(p); continue; }
  const have = new Set(p.tags.map((x) => x.trim().toLowerCase()));
  const add = want.filter((x) => !have.has(x));
  if (add.length) plan.push({ p, add });
}
const tally = {};
plan.forEach(({ add }) => add.forEach((t) => { tally[t] = (tally[t] || 0) + 1; }));
console.log('\ntags to add: ' + plan.length + ' products');
Object.entries(tally).forEach(([k, v]) => console.log('   ' + String(v).padStart(4) + '  ' + k));
if (skipped.length) {
  console.log('\nskipped, product type is not a gendered shoe type (' + skipped.length + '):');
  skipped.slice(0, 10).forEach((p) => console.log('   ' + JSON.stringify(p.productType) + '  ' + p.title.slice(0, 50)));
}

const COLLECTIONS = [
  { handle: 'mens-trail', title: "Men's Trail Running Shoes", tag: 'trail:mens',
    body: '<p>Trail running shoes for men, from door-to-trail to technical mountain terrain.</p>' },
  { handle: 'womens-trail', title: "Women's Trail Running Shoes", tag: 'trail:womens',
    body: '<p>Trail running shoes for women, from door-to-trail to technical mountain terrain.</p>' },
];
const existing = new Map(); let cc = null;
do { const d = await gql(`query($c:String){ collections(first:250, after:$c){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`, { c: cc });
  d.collections.nodes.forEach((n) => existing.set(n.handle, n.id));
  cc = d.collections.pageInfo.hasNextPage ? d.collections.pageInfo.endCursor : null; } while (cc);
const toCreate = COLLECTIONS.filter((c) => !existing.has(c.handle));
console.log('\ncollections to create: ' + toCreate.length);
COLLECTIONS.forEach((c) => console.log('   ' + (existing.has(c.handle) ? 'exists ' : 'CREATE ') + c.handle + '   ALL [TAG=' + c.tag + ', inventory>0]'));

if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'trail-split-rollback-' + stamp + '.json');
const fd = fs.openSync(rb, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  tagged: plan.map(({ p, add }) => ({ id: p.id, handle: p.handle, added: add })),
  created: toCreate.map((c) => c.handle) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + rb);

const ADD = `mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors{ field message } } }`;
let n = 0, bad = 0;
for (const { p, add } of plan) {
  const d = await gql(ADD, { id: p.id, tags: add });
  const e = d.tagsAdd.userErrors || [];
  if (e.length) { bad++; console.log('  FAILED ' + p.handle + ' ' + JSON.stringify(e)); } else n++;
  if (n % 100 === 0) console.log('  ... ' + n + ' / ' + plan.length);
  await new Promise((s) => setTimeout(s, 140));
}
console.log(`tagged ${n}, failed ${bad}`);

// Published to the Online Store so the new nav links are not dead ends.
let pubId = null;
{
  const d = await gql(`query{ publications(first:20){ nodes{ id name } } }`);
  const on = d.publications.nodes.find((x) => /online store/i.test(x.name));
  pubId = on ? on.id : null;
}
const CREATE = `mutation($input: CollectionInput!){ collectionCreate(input:$input){ collection{ id handle } userErrors{ field message } } }`;
for (const c of toCreate) {
  const d = await gql(CREATE, { input: { handle: c.handle, title: c.title, descriptionHtml: c.body,
    sortOrder: 'BEST_SELLING',
    ruleSet: { appliedDisjunctively: false, rules: [
      { column: 'TAG', relation: 'EQUALS', condition: c.tag },
      { column: 'VARIANT_INVENTORY', relation: 'GREATER_THAN', condition: '0' },
    ] } } });
  const e = d.collectionCreate.userErrors || [];
  if (e.length) { console.log('  FAILED ' + c.handle + ' ' + JSON.stringify(e)); continue; }
  console.log('  created ' + c.handle);
  if (pubId) await gql(`mutation($id:ID!,$input:[PublicationInput!]!){ publishablePublish(id:$id, input:$input){ userErrors{ field message } } }`,
    { id: d.collectionCreate.collection.id, input: [{ publicationId: pubId }] });
  await new Promise((s) => setTimeout(s, 300));
}
console.log('\ndone');
