// fix-la-singlet-listings.mjs, The Run House.
//
// Listing hygiene on the four LA 2027 print-on-demand singlet listings. The
// INVENTORY side of Danielle's request is done and lives in
// tools/push-asics-availability.mjs; this is the metadata those four were
// created without.
//
// WHAT IT CHANGES, and why each one is safe:
//
// - CATEGORY, from "Clothing Tops > T-Shirts" to "Activewear > Tops > Tank
//   Tops" (aa-1-1-2-3). A singlet is a sleeveless running top, not a tee. The
//   category is what the Google and Meta feeds read and what the shopify.*
//   category metafields hang off, so a wrong one is a real cost. It is NOT a
//   tax change: Massachusetts exempts clothing under $175 either way, unlike
//   the footwear case where the leaf is load bearing.
//
// - SEO title and description, which were null on all four. Written here from
//   the facts rather than copied from anywhere, one per listing so the four do
//   not compete with each other for the same phrase.
//
// - VENDOR and TYPE on the women's Charities listing only, which reads
//   vendor "The Run House" and an EMPTY type while its three siblings read
//   "ASICS" and "Singlets". It is an ASICS garment, so the odd one out is the
//   one that is wrong. Worth knowing: vendor feeds the vendor-keyed
//   collections, so this moves that listing out of any "The Run House" vendor
//   collection and into the ASICS one, alongside its siblings.
//
// WHAT IT DELIBERATELY DOES NOT TOUCH:
//
// - THE HANDLE on the women's Charities listing, which is still
//   "2026-los-angeles-marathon-womens-performance-tank" while the title says
//   2027. Changing a handle changes the live URL, and Danielle is sending
//   these to the McCourt team, so a link already in an email would break.
//   Needs a decision plus a redirect, not a script.
// - THE WEIGHT, 0.5 lb against 0.2 lb on the base garments. Shipping is rated
//   off it, so guessing low undercharges real postage on every order. Someone
//   should weigh a printed singlet in its mailer.
// - THE "Event Logo(s)" OPTION, which multiplies one garment into 7 or 8
//   variants that all carry the same ASICS figure. Owner has kept it as a
//   variant option deliberately.
// - INVENTORY, policy, prices and media. Nothing here writes those.
//
//   node tools/fix-la-singlet-listings.mjs            # dry run
//   node tools/fix-la-singlet-listings.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const ROOT = new URL('..', import.meta.url).pathname;
const CATEGORY = 'gid://shopify/TaxonomyCategory/aa-1-1-2-3';

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
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 1200 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}

// One entry per listing. The SEO copy is written from the facts of the garment
// and the event, and each is distinct, because four near identical snippets
// would have the four listings competing for one phrase.
const TARGETS = [
  {
    handle: '2027-asics-la-marathon-charities-asics-mens-rival-ii-singlet-tf3085',
    seoTitle: "2027 ASICS LA Marathon Charity Singlet, Men's Rival II",
    seoDescription: "Custom printed ASICS Men's Rival II singlet for 2027 Los Angeles Marathon " +
      "charity teams. Lightweight, breathable race day fit with your logo. XS to 2XL.",
  },
  {
    handle: '2026-los-angeles-marathon-womens-performance-tank',
    seoTitle: "2027 ASICS LA Marathon Charity Singlet, Women's Rival II",
    seoDescription: "Custom printed ASICS Women's Rival II singlet for 2027 Los Angeles Marathon " +
      "charity teams. Lightweight, breathable race day fit with your logo. XS to 2XL.",
    vendor: 'ASICS',
    productType: 'Singlets',
  },
  {
    handle: '2026-asics-los-angeles-marathon-run-clubs-asics-mens-rival-ii-singlet',
    seoTitle: "2027 ASICS LA Marathon Run Club Singlet, Men's Rival II",
    seoDescription: "Custom printed ASICS Men's Rival II singlet for 2027 Los Angeles Marathon " +
      "run clubs and sponsors. Six colors, XS to 2XL, printed to order.",
  },
  {
    handle: '2026-asics-los-angeles-marathon-run-clubs-asics-womens-rival-ii-singlet',
    seoTitle: "2027 ASICS LA Marathon Run Club Singlet, Women's Rival II",
    seoDescription: "Custom printed ASICS Women's Rival II singlet for 2027 Los Angeles Marathon " +
      "run clubs and sponsors. Six colors, XS to 2XL, printed to order.",
  },
];

const Q_READ = `query($h:String!){ productByHandle(handle:$h){
  id handle title vendor productType seo{ title description } category{ id fullName } } }`;

const changes = [];
const rollback = [];

for (const t of TARGETS) {
  const d = await gql(Q_READ, { h: t.handle });
  const p = d.productByHandle;
  if (!p) { console.log('MISSING  ' + t.handle); continue; }

  const input = { id: p.id };
  const diffs = [];

  if (!p.category || p.category.id !== CATEGORY) {
    input.category = CATEGORY;
    diffs.push('category: ' + (p.category ? p.category.fullName.replace('Apparel & Accessories > Clothing > ', '') : 'NONE') +
      '  ->  Activewear > Activewear Tops > Tank Tops');
  }
  if ((p.seo.title || '') !== t.seoTitle || (p.seo.description || '') !== t.seoDescription) {
    input.seo = { title: t.seoTitle, description: t.seoDescription };
    diffs.push('seo title: ' + JSON.stringify(p.seo.title) + '  ->  ' + JSON.stringify(t.seoTitle));
    diffs.push('seo desc : ' + (p.seo.description ? 'set' : 'null') + '  ->  ' + t.seoDescription.length + ' chars');
  }
  if (t.vendor && p.vendor !== t.vendor) {
    input.vendor = t.vendor;
    diffs.push('vendor   : ' + JSON.stringify(p.vendor) + '  ->  ' + JSON.stringify(t.vendor) +
      '   (moves it between vendor keyed collections)');
  }
  if (t.productType && p.productType !== t.productType) {
    input.productType = t.productType;
    diffs.push('type     : ' + JSON.stringify(p.productType) + '  ->  ' + JSON.stringify(t.productType));
  }

  console.log('\n######## ' + p.title.slice(0, 62));
  console.log('   ' + p.handle);
  if (!diffs.length) { console.log('   nothing to change'); continue; }
  diffs.forEach((l) => console.log('   ' + l));

  changes.push({ handle: p.handle, input });
  rollback.push({ handle: p.handle, id: p.id, vendor: p.vendor, productType: p.productType,
    seo: p.seo, category: p.category ? p.category.id : null });
}

console.log('\nlistings to update: ' + changes.length);
if (!changes.length) { console.log('Nothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'la-singlet-listing-rollback-' + stamp + '.json');
fs.writeFileSync(rb, JSON.stringify(rollback, null, 2));
console.log('\nRollback written: ' + rb);

const M = `mutation($p:ProductUpdateInput!){ productUpdate(product:$p){
  product{ handle } userErrors{ field message } } }`;
let done = 0, bad = 0;
for (const c of changes) {
  const r = await gql(M, { p: c.input });
  const errs = r.productUpdate.userErrors || [];
  if (errs.length) { bad++; console.log('  FAILED ' + c.handle + '  ' + JSON.stringify(errs).slice(0, 220)); }
  else { done++; console.log('  updated ' + c.handle); }
}
console.log('\nupdated ' + done + ', failed ' + bad + '.');
