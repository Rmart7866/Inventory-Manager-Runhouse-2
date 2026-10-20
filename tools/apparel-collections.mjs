// apparel-collections.mjs, The Run House.
//
// Builds the store's apparel navigation: a garment-group tag on every tagged
// garment, then the smart collections that key on it.
//
// WHY A GROUP TAG AND NOT THE PRODUCT TYPE. 5,837 products on this store carry
// an apparel product type, but The Run House's OWN printed and team gear is the
// largest vendor in most of them (188 Hoodies, 174 T-Shirts, 80 Shorts), so a
// type-keyed collection becomes a spirit-wear page. Outside ON the types are
// also inconsistent: "Clothing", "Bra", "Legging", "Pant", "Shirts & Tops", and
// 293 women's products with no type at all. So the opt-in set is what the two
// existing apparel collections already use, the `womens apparel` / `mens
// apparel` / `unisex apparel` tags, which is 1,390 products across 42 vendors.
//
// WHY NOT THE CATEGORY EITHER. 1,382 of those 1,390 do have a taxonomy
// category, but only ON's sit at a LEAF: 220 of the others stop at the parent
// "Activewear Pants", which lumps shorts, tights, joggers and track pants into
// one bucket, and 313 stop at bare "Activewear", which says nothing at all. So
// the category is useless for the garment split and perfect for the brand
// collection, and this tool uses it for exactly that.
//
// WHY A TAG AT ALL, rather than a cleverer rule. A Shopify smart collection is
// either all-AND or all-OR, never mixed. So
//   tag = "womens apparel" AND (type = T-Shirts OR type = Tanks OR ...)
// cannot be expressed, and one tag per group is what makes the AND form
// possible. `apparel:tops` follows the namespaced-tag convention the store
// already uses for `cw-group:`, `model:` and `family:`.
//
// CLASSIFICATION reads the product TYPE first and falls back to the TITLE,
// because the title is the only signal left for the products with no type.
// Measured 2026-10-20: 1,375 of 1,390 classified, 15 did not, mostly merino
// "Bottoms" base layers and a few untyped ASICS pieces. Those are listed and
// left alone, never guessed into a group.
//
// ADD ONLY for tags, and collections are created only when absent. A re-run
// changes nothing that is already right.
//
//   node tools/apparel-collections.mjs                      # dry run, both phases
//   node tools/apparel-collections.mjs --only tags --apply
//   node tools/apparel-collections.mjs --only collections --apply
//   node tools/apparel-collections.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const ONLY = arg('only', 'both');
const DO_TAGS = ONLY === 'both' || ONLY === 'tags';
const DO_COLL = ONLY === 'both' || ONLY === 'collections';
const PUBLISH = !process.argv.includes('--no-publish');
const MIN = parseInt(arg('min', '10'), 10);

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

// ------------------------------------------------------------- the groups ---
// Ordered, first match wins. Bra before everything that could also match a top,
// legging and tight before short so "Zero Short Tights" is a tight, and the
// loose shirt and top words LAST so "Tank Top" does not beat "tank".
const RULES = [
  [/sports?\s*bra|\bbra\b|bralette/i,                         'sports-bras'],
  [/legging|\btights?\b/i,                                    'tights'],
  [/\bshorts?\b/i,                                            'shorts'],
  [/hoodie|sweatshirt|crewneck|crew\s*neck|half[-\s]?zip|quarter[-\s]?zip|1\/4\s*zip|full[-\s]?zip|midlayer|first layer|pullover/i, 'hoodies'],
  [/jacket|\bvest\b|windbreaker|\bshell\b|anorak|parka/i,      'jackets'],
  [/jogger|sweatpant|\bpants?\b|trouser|\bbottoms?\b/i,        'pants'],
  [/\bsocks?\b/i,                                             'socks'],
  [/glove|mitten/i,                                           'gloves'],
  [/\bhats?\b|\bcaps?\b|beanie|headband|visor|headwear/i,      'headwear'],
  [/skort|\bskirt\b/i,                                        'skirts'],
  [/\bdress\b|romper|jumpsuit|bodysuit|unitard/i,             'dresses'],
  [/\btank\b|singlet/i,                                       'tops'],
  [/tee\b|t-?shirts?\b|\bshirts?\b|\btops?\b|jersey|polo|sweater|long[-\s]?sleeve|short[-\s]?sleeve|\bcrop\b/i, 'tops'],
];
const groupOf = (p) => {
  for (const src of [p.productType, p.title]) {
    for (const [re, g] of RULES) if (re.test(String(src || ''))) return g;
  }
  return '';
};
const genderOf = (p) => {
  const t = (p.tags || []).map((x) => String(x).toLowerCase());
  if (t.includes('womens apparel')) return 'womens';
  if (t.includes('mens apparel')) return 'mens';
  if (t.includes('unisex apparel')) return 'unisex';
  return '';
};

// Socks, gloves and headwear are deliberately absent from the collection plan:
// socks-1 (392 products) and headwear (59) already cover them store wide, and a
// second page for the same thing splits the SEO and confuses merchandising.
const LABEL = {
  tops: 'Tops', 'sports-bras': 'Sports Bras', shorts: 'Shorts',
  tights: 'Tights & Leggings', hoodies: 'Hoodies & Sweatshirts',
  pants: 'Pants & Joggers', jackets: 'Jackets & Vests',
  dresses: 'Dresses & One-Pieces', skirts: 'Skirts & Skorts',
};
const BLURB = {
  tops: 'Running tees, tanks and long sleeve tops from the brands we stock, in technical and everyday fabrics.',
  'sports-bras': 'Running bras from low to high support, in the sizes and cup ranges we carry.',
  shorts: 'Running shorts with and without a liner, from racing splits to longer everyday inseams.',
  tights: 'Running tights and leggings in full, seven-eighths and short lengths, for every season.',
  hoodies: 'Hoodies, crewnecks, half-zips and sweatshirts for warm-ups, recovery and the walk home.',
  pants: 'Running pants, joggers and sweatpants for cold weather, travel and rest days.',
  jackets: 'Running jackets, wind shells and vests for wind, rain and winter miles.',
  dresses: 'Running dresses, rompers and one-piece kit.',
  skirts: 'Running skirts and skorts with built-in shorts.',
};
const GENDER_LABEL = { womens: "Women's", mens: "Men's", unisex: 'Unisex' };

// ------------------------------------------------------------------- scan ---
const PQ = `query($q:String!,$c:String){ products(first:250, after:$c, query:$q){
  pageInfo{hasNextPage endCursor} nodes{ id handle title vendor productType status tags } } }`;
const all = []; let cursor = null;
do { const d = await gql(PQ, { q: "tag:'womens apparel' OR tag:'mens apparel' OR tag:'unisex apparel'", c: cursor });
  all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);
console.log('products carrying an apparel tag: ' + all.length);

const tagPlan = [], unclassified = [], noGender = [];
const grid = {};
for (const p of all) {
  const g = groupOf(p), gd = genderOf(p);
  if (!g) { unclassified.push(p); continue; }
  if (!gd) { noGender.push(p); continue; }
  const k = gd + '|' + g;
  grid[k] = grid[k] || { all: 0, active: 0 };
  grid[k].all++; if (p.status === 'ACTIVE') grid[k].active++;
  const want = 'apparel:' + g;
  if (!p.tags.some((t) => t.trim().toLowerCase() === want)) tagPlan.push({ p, tag: want });
}
console.log('classified: ' + (all.length - unclassified.length - noGender.length)
  + '  |  no group: ' + unclassified.length + '  |  no gender: ' + noGender.length);
if (unclassified.length) {
  console.log('\nno group from type or title, left alone:');
  unclassified.slice(0, 20).forEach((p) => console.log('   ' + (p.productType || '(no type)').padEnd(18) + p.title.slice(0, 56)));
}

const tally = {};
tagPlan.forEach(({ tag }) => { tally[tag] = (tally[tag] || 0) + 1; });
console.log('\ngroup tags to ADD: ' + tagPlan.length);
Object.entries(tally).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  ' + k));

// ------------------------------------------------------------ collections ---
const SORT = 'CREATED_DESC';   // newest first, so a fresh drop leads the page
const plan = [];
// The ON brand collection, which is the one case where the TAXONOMY CATEGORY is
// the right rule: aa-1 is Clothing, so it takes every ON garment and NO ON
// shoe (shoes are aa-8, a different branch), it needs no tag of its own, and it
// picks up future ON apparel automatically because the create route sets a
// category. VENDOR matching is case insensitive, verified 2026-10-20: products
// with vendor "ON Running" sit in the collection whose rule says "On Running".
plan.push({
  handle: 'on-apparel', title: 'On Apparel',
  descriptionHtml: '<p>Running apparel from On. Swiss-engineered tees, shorts, tights, bras and outerwear, dropshipped from our Needham stock.</p>',
  rules: [
    { column: 'VENDOR', relation: 'EQUALS', condition: 'On Running' },
    { column: 'PRODUCT_CATEGORY_ID_WITH_DESCENDANTS', relation: 'EQUALS', condition: 'gid://shopify/TaxonomyCategory/aa-1' },
    { column: 'VARIANT_INVENTORY', relation: 'GREATER_THAN', condition: '0' },
  ],
});
for (const gd of ['womens', 'mens', 'unisex']) {
  for (const g of Object.keys(LABEL)) {
    const cell = grid[gd + '|' + g];
    if (!cell || cell.all < MIN) continue;
    plan.push({
      handle: gd + '-' + g, title: GENDER_LABEL[gd] + ' ' + LABEL[g],
      descriptionHtml: '<p>' + GENDER_LABEL[gd] + ' ' + BLURB[g] + '</p>',
      size: cell,
      rules: [
        { column: 'TAG', relation: 'EQUALS', condition: gd + ' apparel' },
        { column: 'TAG', relation: 'EQUALS', condition: 'apparel:' + g },
        { column: 'VARIANT_INVENTORY', relation: 'GREATER_THAN', condition: '0' },
      ],
    });
  }
}

// Which already exist? A handle collision means do not create, so a re-run is
// safe and an existing curated collection is never overwritten.
const CQ = `query($c:String){ collections(first:250, after:$c){ pageInfo{hasNextPage endCursor} nodes{ id handle title } } }`;
const existing = new Map(); let cc = null;
do { const d = await gql(CQ, { c: cc }); d.collections.nodes.forEach((n) => existing.set(n.handle, n));
  cc = d.collections.pageInfo.hasNextPage ? d.collections.pageInfo.endCursor : null; } while (cc);
const toCreate = plan.filter((c) => !existing.has(c.handle));
const already = plan.filter((c) => existing.has(c.handle));

console.log('\ncollections planned: ' + plan.length + '  |  to create: ' + toCreate.length + '  |  already exist: ' + already.length);
for (const c of plan) {
  const mark = existing.has(c.handle) ? 'exists ' : 'CREATE ';
  const sz = c.size ? String(c.size.all).padStart(5) + ' (' + c.size.active + ' active now)' : '    by vendor + category';
  console.log('  ' + mark + c.title.padEnd(32) + sz + '   [' + c.handle + ']');
}
if (already.length) console.log('\n(an existing handle is never overwritten, so those are left exactly as they are)');

if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'apparel-collections-rollback-' + stamp + '.json');
const fd = fs.openSync(rb, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  tagsAdded: tagPlan.map(({ p, tag }) => ({ id: p.id, handle: p.handle, tag })),
  collectionsToCreate: toCreate.map((c) => c.handle) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + rb);

if (DO_TAGS && tagPlan.length) {
  const ADD = `mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors{ field message } } }`;
  let n = 0, bad = 0;
  for (const { p, tag } of tagPlan) {
    const d = await gql(ADD, { id: p.id, tags: [tag] });
    const e = d.tagsAdd.userErrors || [];
    if (e.length) { bad++; console.log('  FAILED ' + p.handle + ' ' + JSON.stringify(e)); } else n++;
    if (n % 100 === 0) console.log('  tags ... ' + n + ' / ' + tagPlan.length);
    await new Promise((s) => setTimeout(s, 150));
  }
  console.log(`group tags added ${n}, failed ${bad}`);
}

if (DO_COLL && toCreate.length) {
  // The Online Store publication, so a created collection is actually reachable.
  let pubId = null;
  if (PUBLISH) {
    const d = await gql(`query{ publications(first:20){ nodes{ id name } } }`);
    const on = d.publications.nodes.find((p) => /online store/i.test(p.name));
    pubId = on ? on.id : null;
    console.log('\nOnline Store publication: ' + (pubId || 'NOT FOUND, collections will be created unpublished'));
  }
  const CREATE = `mutation($input: CollectionInput!) {
    collectionCreate(input: $input) { collection { id handle title } userErrors { field message } } }`;
  let n = 0, bad = 0;
  for (const c of toCreate) {
    const input = { handle: c.handle, title: c.title, descriptionHtml: c.descriptionHtml,
      sortOrder: SORT,
      ruleSet: { appliedDisjunctively: false, rules: c.rules } };
    const d = await gql(CREATE, { input });
    const e = d.collectionCreate.userErrors || [];
    if (e.length) { bad++; console.log('  FAILED ' + c.handle + '  ' + JSON.stringify(e)); continue; }
    const id = d.collectionCreate.collection.id;
    n++;
    console.log('  created ' + c.title + '  [' + c.handle + ']');
    if (pubId) {
      const p = await gql(`mutation($id:ID!,$input:[PublicationInput!]!){ publishablePublish(id:$id, input:$input){ userErrors{ field message } } }`,
        { id, input: [{ publicationId: pubId }] });
      const pe = p.publishablePublish.userErrors || [];
      if (pe.length) console.log('      published: FAILED ' + JSON.stringify(pe));
    }
    await new Promise((s) => setTimeout(s, 350));
  }
  console.log(`collections created ${n}, failed ${bad}`);
}
