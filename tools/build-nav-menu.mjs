// build-nav-menu.mjs, The Run House.
//
// Builds the restructured storefront navigation as a NEW menu, leaving the live
// one alone.
//
// WHERE THE MENU LIVES, because this is easy to get wrong: a Shopify menu is in
// admin under Content > Menus, NOT in the theme, and it is GLOBAL. Editing
// `main-menu` changes every theme that points at it, live included, with no
// preview. What makes a safe preview possible is that the header reads
// `section.settings.menu`, so a menu is a PER THEME setting: this writes a new
// menu, and a duplicate theme's header can be pointed at it for review before
// anything public changes.
//
// WHY THE SHAPE CHANGED. The theme renders exactly three levels (header.liquid
// loops link, child, grandchild, then stops). The old nav spent one of them on a
// single "Shop" item, so everything was crammed into
// Shop > Men > Apparel with no room to subdivide: Apparel was one link instead
// of ten and footwear had no subnavigation at all despite the collections
// existing. Promoting the sections to the top level gives that level back.
//
// WHAT IS AND IS NOT GENDERED, checked against every collection's rule
// 2026-10-21. Only three things carry gender: all-shoes by product type, the
// width collections, and apparel. Trail, Race Day, Carbon Plate, Stability, Max
// Cushion, Cross Country, Pickleball and every accessory have no gender in the
// rule and no gendered variant, so putting them under both Men's and Women's
// was duplicating one link under two headings. That is how Cross Country ended
// up in the old nav four times. Trail is the exception: it was split into
// mens-trail and womens-trail by tools/split-trail-by-gender.mjs because the
// volume justifies it (255 and 252).
//
//   node tools/build-nav-menu.mjs                 # dry run, prints the tree
//   node tools/build-nav-menu.mjs --apply         # writes the new menu
//   node tools/build-nav-menu.mjs --apply --handle main-menu-v3
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const HANDLE = arg('handle', 'main-menu-v2');
const TITLE = arg('title', 'Main menu (restructured)');

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

// c = a collection handle, p = a page handle. Every link is a RESOURCE
// reference, never a hardcoded absolute URL: the old menu had three of those
// (Women's Apparel, Merrell, Watches) and an absolute URL breaks on a preview
// theme and on any other domain.
const TREE = [
  ['Men\'s', { c: 'mens-running-walking-footwear' }, [
    ['Running & Walking', { c: 'mens-running-walking-footwear' }],
    ['Trail',             { c: 'mens-trail' }],
    ['Wide',              { c: 'mens-wide-running-and-walking-shoes' }],
    ['Extra Wide',        { c: 'mens-extra-wide-running-and-walking-shoes' }],
    ['Narrow',            { c: 'narrow-mens-running-and-walking-shoes' }],
    ['Apparel',           { c: 'mens-apparel-2' }, [
      ['Tops',                  { c: 'mens-tops' }],
      ['Hoodies & Sweatshirts', { c: 'mens-hoodies' }],
      ['Shorts',                { c: 'mens-shorts' }],
      ['Pants & Joggers',       { c: 'mens-pants' }],
      ['Jackets & Vests',       { c: 'mens-jackets' }],
      ['Tights & Leggings',     { c: 'mens-tights' }],
    ]],
  ]],
  ['Women\'s', { c: 'womens-road-running-shoes' }, [
    ['Running & Walking', { c: 'womens-road-running-shoes' }],
    ['Trail',             { c: 'womens-trail' }],
    ['Wide',              { c: 'womens-wide-running-and-walking-shoes' }],
    ['Extra Wide',        { c: 'womens-extra-wide-running-and-walking-shoes' }],
    ['Narrow',            { c: 'narrow-womens-running-walking-shoes' }],
    ['Apparel',           { c: 'womens-apparel-1' }, [
      ['Sports Bras',           { c: 'womens-sports-bras' }],
      ['Tops',                  { c: 'womens-tops' }],
      ['Tights & Leggings',     { c: 'womens-tights' }],
      ['Shorts',                { c: 'womens-shorts' }],
      ['Pants & Joggers',       { c: 'womens-pants' }],
      ['Hoodies & Sweatshirts', { c: 'womens-hoodies' }],
      ['Jackets & Vests',       { c: 'womens-jackets' }],
      ['Skirts & Skorts',       { c: 'womens-skirts' }],
    ]],
  ]],
  // Ungendered, by what the shoe is for. None of these carry gender in their
  // rule, which is why listing them under both genders duplicated one link
  // under two headings in the old nav.
  ['Shoes', { c: 'maximum-cushion-running-shoes' }, [
    ['Trail',          { c: 'trail-running-shoes' }],
    ['Race Day',       { c: 'race-shoes' }],
    ['Carbon Plate',   { c: 'carbon-plate-running-shoes' }],
    ['Stability',      { c: 'stability-running-walking-shoes' }],
    ['Max Cushion',    { c: 'maximum-cushion-running-shoes' }],
    ['Cross Country',  { c: 'cross-country-spikes' }],
    ['Pickleball',     { c: 'pickleball-shoes' }],
    ['Recovery',       { c: 'recovery' }],
    ['Waterproof',     { c: 'gore-tex-and-waterproof-shoes' }],
  ]],
  // Stanley is NOT repeated here: it is a brand, it lives under Brands, and
  // having it in both places was one of the duplicates in the old nav.
  ['Accessories', { c: 'accessories' }, [
    ['Socks',            { c: 'socks-1' }],
    ['Sunglasses',       { c: 'sunglasses' }],
    ['Hats & Headwear',  { c: 'headwear' }],
    ['Hydration',        { c: 'hydration' }],
    ['Storage & Belts',  { c: 'storage-belts' }],
    ['Insoles',          { c: 'insoles' }],
    ['Visibility',       { c: 'visibility' }],
    ['Watches',          { c: 'watches' }],
    ['Gift Cards',       { c: 'gift-cards' }],
  ]],
  // Alphabetical, which is how a brand list is scanned. Every one was checked
  // for ACTIVE products first so none of these is a dead link: Reebok (11) and
  // Speedland (13) are dropped for being spent, Goodr (16) and Oofos (13) added
  // because they are stocked running brands that were never listed. Under
  // Armour, Nike, Knockaround and Detour are deliberately absent.
  ['Brands', { c: 'hoka' }, [
    ['Altra',                 { c: 'altra' }],
    ['ASICS',                 { c: 'asics-running-shoes' }],
    ['Brooks',                { c: 'brooks' }],
    ['Charles River Apparel', { c: 'charles-river-apparel' }],
    ['Diadora',               { c: 'diadora' }],
    ['Goodr',                 { c: 'goodr' }],
    ['Hoka',                  { c: 'hoka' }],
    ['Merrell',               { c: 'merrell' }],
    ['New Balance',           { c: 'new-balance' }],
    ['On Running',            { c: 'on-running' }],
    ['Oofos',                 { c: 'oofos' }],
    ['Puma',                  { c: 'puma' }],
    ['Saucony',               { c: 'saucony' }],
    ['Stanley',               { c: 'stanley' }],
  ]],
  // Absorbs the old "Featured" and the old top-level "Race Apparel". A nav slot
  // for one race goes stale the moment the race ends, which is how the store
  // ended up with Falmouth collections for 2023, 2024, 2026 and "prior
  // collections". Seasonal promotion belongs in the Home Banner instead.
  ['Team & Race', { p: 'team-stores' }, [
    ['Team Stores',        { p: 'team-stores' }],
    ['Race Merchandise',   { p: 'race-stores' }],
    ['Falmouth Road Race', { c: 'asics-falmouth-road-race-2026' }],
    ['Cross Country',      { c: 'cross-country-spikes' }],
  ]],
  // `sale`, NOT `discount-collection`: the latter is a 23,002 product utility
  // set covering the whole catalogue.
  ['Sale', { c: 'sale' }],
  ['Membership', { p: 'run-house-membership' }],
];

// Resolve every handle to a real id up front, so a typo is caught before a
// single write and never becomes a dead link in the menu.
const collIds = new Map(); let cc = null;
do { const d = await gql(`query($c:String){ collections(first:250, after:$c){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`, { c: cc });
  d.collections.nodes.forEach((n) => collIds.set(n.handle, n.id));
  cc = d.collections.pageInfo.hasNextPage ? d.collections.pageInfo.endCursor : null; } while (cc);
const pageIds = new Map(); let pc = null;
do { const d = await gql(`query($c:String){ pages(first:250, after:$c){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`, { c: pc });
  d.pages.nodes.forEach((n) => pageIds.set(n.handle, n.id));
  pc = d.pages.pageInfo.hasNextPage ? d.pages.pageInfo.endCursor : null; } while (pc);
console.log('resolved ' + collIds.size + ' collections and ' + pageIds.size + ' pages');

const missing = [];
function resolve(target) {
  if (target.c) {
    const id = collIds.get(target.c);
    if (!id) { missing.push('collection/' + target.c); return null; }
    return { type: 'COLLECTION', resourceId: id };
  }
  const id = pageIds.get(target.p);
  if (!id) { missing.push('page/' + target.p); return null; }
  return { type: 'PAGE', resourceId: id };
}
function build(nodes, depth = 0) {
  return nodes.map(([title, target, kids]) => {
    const r = resolve(target);
    const item = { title, type: r ? r.type : 'HTTP', ...(r ? { resourceId: r.resourceId } : { url: '/' }) };
    if (kids && kids.length) item.items = build(kids, depth + 1);
    return item;
  });
}
const items = build(TREE);

let n1 = 0, n2 = 0, n3 = 0;
console.log('\n=== the tree ===');
for (const a of items) {
  n1++;
  console.log(a.title);
  for (const b of a.items || []) {
    n2++;
    console.log('   ' + b.title);
    for (const c of b.items || []) { n3++; console.log('      ' + c.title); }
  }
}
console.log('\ntop level ' + n1 + ', second ' + n2 + ', third ' + n3 + '  (the theme renders exactly 3)');
if (missing.length) {
  console.error('\nREFUSING: these handles do not exist, fix them before writing:');
  [...new Set(missing)].forEach((m) => console.error('   ' + m));
  process.exit(1);
}

const already = await gql(`query{ menus(first:30){ nodes{ id handle title } } }`);
const existing = already.menus.nodes.find((m) => m.handle === HANDLE);
console.log('\ntarget menu: ' + HANDLE + (existing ? '  (exists, will be UPDATED: ' + existing.id + ')' : '  (will be CREATED)'));
console.log('live main-menu is NOT touched by this script.');

if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const res = existing
  ? await gql(`mutation($id:ID!,$title:String!,$handle:String!,$items:[MenuItemUpdateInput!]!){
      menuUpdate(id:$id, title:$title, handle:$handle, items:$items){ menu{ id handle } userErrors{ field message } } }`,
      { id: existing.id, title: TITLE, handle: HANDLE, items })
  : await gql(`mutation($title:String!,$handle:String!,$items:[MenuItemCreateInput!]!){
      menuCreate(title:$title, handle:$handle, items:$items){ menu{ id handle } userErrors{ field message } } }`,
      { title: TITLE, handle: HANDLE, items });
const payload = res.menuUpdate || res.menuCreate;
if (payload.userErrors && payload.userErrors.length) {
  console.error('FAILED: ' + JSON.stringify(payload.userErrors, null, 1));
  process.exit(1);
}
console.log('\nwrote menu ' + payload.menu.handle + '  ' + payload.menu.id);
console.log('Next: duplicate the live theme, open its header section, and set the');
console.log('menu setting to "' + TITLE + '". Nothing public changes until you do.');
