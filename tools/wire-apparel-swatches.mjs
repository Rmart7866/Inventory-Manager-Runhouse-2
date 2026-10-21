// wire-apparel-swatches.mjs, The Run House.
//
// Gives supplier apparel the same colour swatch grid the shoes have, by writing
// the custom.* metafields snippets/colorway-swatches.liquid reads.
//
// NO THEME CHANGE IS NEEDED, and that is the whole point. The snippet is pure
// display and entirely metafield driven:
//
//   custom.style_siblings   the swatch tiles          renders when size > 1
//   custom.color_name       the label under COLOR     already written at create
//   custom.gender           the Men's / Women's tabs  already written at create
//   custom.gender_sibling   the other gender's link   renders when size > 0
//   custom.model_widths     the WIDTH pill set        renders when size > 1
//
// So apparel gets swatches by writing style_siblings and gender_sibling, and
// gets NO width pills simply by leaving model_widths and width_class unset. A
// garment has no width, and the pill row would be a lie.
//
// GROUPING. Footwear groups on model plus WIDTH CLASS, because a D and a 2E are
// different shoes to a runner. None of that describes a garment, so the key
// here is model plus GENDER: every colourway of the women's Club Boxy-T is one
// swatch row, and the men's version is a gender tab, not a tile. Model comes off
// the title, gender off the metafield the create route writes.
//
// ACTIVE ONLY, same rule as the footwear path. A swatch tile is a link, and a
// DRAFT product's URL 404s for a shopper, so a draft is never put in anyone's
// swatch row and never gets a row of its own. Activate first, then run this.
// Re-running is free: it diffs against what is already stored and writes only
// what changed, so a run on a correct catalogue writes nothing.
//
//   node tools/wire-apparel-swatches.mjs                      # dry run
//   node tools/wire-apparel-swatches.mjs --apply
//   node tools/wire-apparel-swatches.mjs --status any          # preview drafts
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
};
const APPLY = process.argv.includes('--apply');
const VENDOR = arg('vendor', 'ON Running');
const STATUS = arg('status', 'active').toLowerCase();   // 'active' or 'any'

if (STATUS === 'any' && APPLY) {
  console.error('--status any is a PREVIEW only. A draft sibling is a link that 404s,');
  console.error('so it must never be written into a live swatch row. Activate first.');
  process.exit(1);
}

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
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 900 * (attempt + 1))); return gql(query, variables, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

const Q = `query($q: String!, $cursor: String) {
  products(first: 50, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title status productType
      metafields(first: 30, namespace: "custom") { nodes { key value type } } }
  }
}`;

const search = ['vendor:\'' + VENDOR + '\''].concat(STATUS === 'active' ? ['status:active'] : []).join(' AND ');
const all = []; let cursor = null;
do { const d = await gql(Q, { q: search, cursor }); all.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);

const isFootwearType = (t) => /shoes$/i.test(String(t || '').trim());
const mfOf = (p, key) => { const n = p.metafields.nodes.find((m) => m.key === key); return n ? n.value : ''; };

// Model off the title: drop the vendor and gender prefix, then the colour after
// the last " - ". Same shape the converter's own model tag uses, and a two-tone
// colour ("Sand | Ivory") cannot confuse it because the split is on the dash.
function modelOf(title) {
  let t = String(title || '').trim();
  t = t.replace(/^ON\s+/i, '').replace(/^(Men'?s|Women'?s|Unisex)\s+/i, '');
  const i = t.lastIndexOf(' - ');
  if (i > 0) t = t.slice(0, i);
  return t.replace(/\s+/g, ' ').trim().toUpperCase();
}
function genderOf(p) {
  const g = String(mfOf(p, 'gender')).toLowerCase();
  if (/wom/.test(g)) return "Women's";
  if (/men/.test(g)) return "Men's";
  if (/uni/.test(g)) return 'Unisex';
  const h = p.handle || '';
  if (/wom[ae]n/.test(h)) return "Women's";
  if (/-men|^men/.test(h)) return "Men's";
  return '';
}
const colorOf = (p) => {
  const c = mfOf(p, 'color_name');
  if (c) return c;
  const parts = String(p.title || '').split(' - ');
  return parts.length > 1 ? parts[parts.length - 1].trim() : '';
};

const garments = all.filter((p) => p.productType && !isFootwearType(p.productType));
console.log(`${VENDOR} products (${STATUS}): ${all.length}  |  garments: ${garments.length}`);

const noGender = garments.filter((p) => !genderOf(p));
if (noGender.length) {
  console.log(`\nskipping ${noGender.length} with no gender, they cannot be grouped:`);
  noGender.slice(0, 10).forEach((p) => console.log('  ' + p.handle));
}
const usable = garments.filter((p) => genderOf(p));

// style group = model + gender, the swatch row. gender family = model, which is
// what links the men's and women's versions of one garment.
const byStyle = new Map(), byModel = new Map();
for (const p of usable) {
  const sk = modelOf(p.title) + '|' + genderOf(p);
  if (!byStyle.has(sk)) byStyle.set(sk, []); byStyle.get(sk).push(p);
  const mk = modelOf(p.title);
  if (!byModel.has(mk)) byModel.set(mk, []); byModel.get(mk).push(p);
}
const byColor = (a, b) => String(colorOf(a)).localeCompare(String(colorOf(b)));

const inputs = [], perProduct = [];
for (const p of usable) {
  const style = byStyle.get(modelOf(p.title) + '|' + genderOf(p)).slice().sort(byColor);
  // One representative per other gender, the alphabetically first colourway, so
  // the tab is stable between runs rather than flipping with inventory.
  const others = new Map();
  for (const o of byModel.get(modelOf(p.title))) {
    const og = genderOf(o);
    if (og === genderOf(p)) continue;
    const cur = others.get(og);
    if (!cur || byColor(o, cur) < 0) others.set(og, o);
  }
  // color_name is NOT written here, deliberately. Stage 4 writes it correctly
  // for everything it creates (282 of 323 ON garments have it). The remaining
  // 41 are older products whose titles end in the GENDER and the article code,
  // so the title fallback produced "WOMEN (1WE11821907)" and that string is
  // what the PDP prints as the swatch label. A wrong colour name is worse than
  // a missing one, exactly as with the group tags, so those are reported at the
  // end for a human to fill in instead.
  const want = {
    style_siblings: style.map((x) => x.id),
    gender_sibling: [...others.values()].map((x) => x.id),
  };
  // DIFF, so a correct product is not rewritten. A list metafield is compared
  // as JSON because order is meaningful, it is the tile order on the page.
  const changed = {};
  for (const [key, val] of Object.entries(want)) {
    const isList = key.endsWith('_siblings') || key === 'gender_sibling';
    const now = mfOf(p, key);
    if (isList) {
      if (!val.length) continue;                       // never write an empty list
      const next = JSON.stringify(val);
      if (now !== next) changed[key] = next;
    } else if (val && now !== val) changed[key] = val;
  }
  if (!Object.keys(changed).length) continue;
  perProduct.push({ p, changed, rowSize: style.length, genders: [...others.keys()] });
  for (const [key, value] of Object.entries(changed)) {
    inputs.push({ ownerId: p.id, namespace: 'custom', key,
      type: (key.endsWith('_siblings') || key === 'gender_sibling') ? 'list.product_reference' : 'single_line_text_field',
      value });
  }
}

const rows = [...byStyle.entries()].filter(([, v]) => v.length > 1);
console.log(`\nswatch rows with more than one colourway: ${rows.length}`);
console.log('largest rows:');
rows.sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([k, v]) =>
  console.log('  ' + String(v.length).padStart(3) + '  ' + k.replace('|', '  ') + '   ' + v.map(colorOf).sort().join(', ')));
const single = [...byStyle.entries()].filter(([, v]) => v.length === 1).length;
console.log(`\none-colourway styles (no tiles rendered, by design): ${single}`);
const paired = [...byModel.values()].filter((v) => new Set(v.map(genderOf)).size > 1).length;
console.log(`garments carried in both genders (gender tabs render): ${paired}`);
console.log(`\nproducts to update: ${perProduct.length}  |  metafields to write: ${inputs.length}`);

// The swatch LABEL comes from custom.color_name, so a product without one
// shows a blank label even when its tiles render. These need a human.
const noColor = usable.filter((p) => !mfOf(p, 'color_name'));
if (noColor.length) {
  console.log(`\nNO custom.color_name, so their swatch tile has no label (${noColor.length}).`);
  console.log('Set these by hand in the product library, the title cannot be parsed for a colour:');
  noColor.slice(0, 25).forEach((p) => console.log('   ' + p.handle + '   ' + p.title));
  if (noColor.length > 25) console.log('   ... and ' + (noColor.length - 25) + ' more');
}
const keyTally = {};
inputs.forEach((i) => { keyTally[i.key] = (keyTally[i.key] || 0) + 1; });
Object.entries(keyTally).forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  custom.' + k));

console.log('\nNOT written for apparel, so the theme renders no width pills:');
console.log('  custom.model_widths, custom.width_class, custom.width_code');

if (!inputs.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) {
  console.log('\nsample:');
  perProduct.slice(0, 4).forEach(({ p, changed, rowSize, genders }) => {
    console.log('  ' + p.handle + '   row of ' + rowSize + (genders.length ? ', gender tab to ' + genders.join('/') : ''));
    Object.keys(changed).forEach((k) => console.log('      custom.' + k + ' = ' + String(changed[k]).slice(0, 110)));
  });
  console.log('\nDRY RUN. Re-run with --apply to write.' + (STATUS === 'any' ? '\n(--status any cannot be applied, see the header.)' : ''));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = new URL('../apparel-swatches-rollback-' + stamp + '.json', import.meta.url);
const fd = fs.openSync(file, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  before: perProduct.map(({ p, changed }) => ({ id: p.id, handle: p.handle,
    keys: Object.keys(changed), was: Object.keys(changed).map((k) => ({ key: k, value: mfOf(p, k) })) })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + file.pathname);

const SET = `mutation($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { userErrors { field message } } }`;
let done = 0, failed = 0;
for (let i = 0; i < inputs.length; i += 25) {
  const chunk = inputs.slice(i, i + 25);
  const d = await gql(SET, { metafields: chunk });
  const errs = d.metafieldsSet.userErrors || [];
  if (errs.length) { failed += chunk.length; console.log('  FAILED chunk ' + i + '  ' + JSON.stringify(errs).slice(0, 300)); }
  else { done += chunk.length; console.log('  ... ' + done + ' / ' + inputs.length); }
  await new Promise((s) => setTimeout(s, 250));
}
console.log(`\nWrote ${done} metafields, failed ${failed}.`);
