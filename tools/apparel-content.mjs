// apparel-content.mjs, The Run House.
//
// Writes SEO descriptions and the shopify.* CATEGORY METAFIELDS for supplier
// apparel, from ON's own published product data.
//
// WHERE THE STATS COME FROM, and why this route and not another. ON's Backstage
// B2B feed carries stock and prices but no copy, and the tool's review modal
// starts every description empty, so the 2026-10-20 drop created 282 garments
// with nothing in the description at all. ON's PUBLIC site has the real
// numbers: fabric composition, garment weight in grams, the feature list, the
// recycled content claim and the country of origin.
//
// The join is EXACT, not fuzzy. www.on.com/en-us/products.xml is a plain
// sitemap of about 3,900 product URLs, and every URL ENDS WITH THE ARTICLE
// CODE, the same code that sits inside our variant SKUs:
//
//   .../3-core-shorts-1wf1015/womens/black-apparel-1WF10150553
//   SKU ON-1WF10150553-BLA-L
//
// So nothing is guessed from a name. The page itself is a Nuxt app and the data
// is in a flattened __NUXT_DATA__ array where every value is an index into one
// shared array, so it has to be resolved rather than read. Measured 2026-10-20:
// 269 of our 282 garments matched on the full article code, and the remaining
// 13 matched on the 7 character STYLE prefix, a colourway we carry that ON does
// not sell direct. 100 style pages covered all 282 products, and all 100
// yielded a weight, a fabric composition and a feature list.
//
// robots.txt disallows /api and /pdp. This fetches neither, only the sitemap
// and ordinary product pages, one per STYLE rather than one per colourway, with
// a delay between them. Pages are cached under the gitignored on-pdp-cache/ so
// a re-run costs nothing.
//
// THE DESCRIPTION IS NOT A COPY OF ON'S. The intro is composed here from the
// facts, because publishing ON's own marketing sentence verbatim would put a
// duplicate of their meta description on our page, which is the opposite of SEO
// friendly. ON's FEATURE BULLETS are reproduced, which is what the 41 ON
// garments already live on this store do.
//
// THE CATEGORY METAFIELDS are not plain text. Shopify stores them as
// list.metaobject_reference pointing at entries of the reserved shopify--*
// metaobject definitions, and this app has read_metaobjects but NOT
// write_metaobjects, so a value whose metaobject does not already exist on the
// store cannot be created here. Those are reported and skipped rather than
// failing the run. Empty on this store as of 2026-10-20, so never written:
// size-type, liner-type, pocket-type, hood-design, hood-type, clothing-fit.
//
//   node tools/apparel-content.mjs --since 2026-10-20
//   node tools/apparel-content.mjs --since 2026-10-20 --apply
//   node tools/apparel-content.mjs --since 2026-10-20 --only descriptions --apply
//   node tools/apparel-content.mjs --since 2026-10-20 --only metafields --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const APPLY = process.argv.includes('--apply');
const SINCE = arg('since', '');
const VENDOR = arg('vendor', 'ON Running');
const ONLY = arg('only', 'both');           // descriptions | metafields | both
const DO_DESC = ONLY === 'both' || ONLY === 'descriptions';
const DO_MF = ONLY === 'both' || ONLY === 'metafields';
const LIMIT = parseInt(arg('limit', '0'), 10) || 0;

const ROOT = new URL('..', import.meta.url).pathname;
const CACHE = path.join(ROOT, 'on-pdp-cache');
fs.mkdirSync(CACHE, { recursive: true });

// ---------------------------------------------------------------- Shopify ---
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
async function gql(query, variables = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 900 * (attempt + 1))); return gql(query, variables, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

// ------------------------------------------------------------------ on.com ---
// curl, not fetch: this runs on macOS where node's fetch is fine but the cache
// wants a file on disk anyway, and curl follows on.com's locale redirect.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
function curlTo(url, out) {
  execFileSync('curl', ['-sL', '-A', UA, '-H', 'Accept-Language: en-US,en;q=0.9',
    '--max-time', '45', '-o', out, url], { stdio: ['ignore', 'ignore', 'ignore'] });
  return fs.existsSync(out) && fs.statSync(out).size > 0;
}

// The flattened Nuxt payload: every value is an index into one array, so a
// plain JSON.parse gives numbers where strings belong. Resolve by index.
function nuxtResolve(arr) {
  return function res(i, depth = 0) {
    if (depth > 10) return null;
    if (!Number.isInteger(i) || i < 0 || i >= arr.length) return null;
    const v = arr[i];
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      if (v.length === 2 && ['Reactive', 'ShallowReactive', 'EmptyRef', 'Ref'].includes(v[0])) return res(v[1], depth + 1);
      return v.map((x) => res(x, depth + 1));
    }
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = res(x, depth + 1);
    return o;
  };
}
function statsFromHtml(html) {
  const m = /id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let arr; try { arr = JSON.parse(m[1]); } catch (e) { return null; }
  const res = nuxtResolve(arr);
  // The product style object is the one carrying BOTH usps and materials. Any
  // other heuristic picked up the recommendation carousel's stubs.
  let si = -1;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v && typeof v === 'object' && !Array.isArray(v) && 'usps' in v && 'materials' in v) { si = i; break; }
  }
  const out = {};
  if (si >= 0) {
    const st = res(si) || {};
    for (const k of ['slug', 'sku', 'subtype', 'fit', 'weight', 'materials', 'usps',
      'countryOfOrigin', 'sustainabilityClaims', 'careInstructions']) {
      if (st[k] !== undefined && st[k] !== null && st[k] !== '' &&
          !(Array.isArray(st[k]) && !st[k].length)) out[k] = st[k];
    }
  }
  const md = /<meta[^>]+name="description"[^>]+content="([^"]{0,500})"/.exec(html)
    || /<meta[^>]+content="([^"]{0,500})"[^>]+name="description"/.exec(html);
  if (md) out.metaDescription = md[1];
  return out;
}

// ------------------------------------------------------------------- copy ---
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const he = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');

// One sentence frame per garment type, so the opening line reads like a human
// wrote it about THAT garment rather than a template about clothing. {m} is the
// model, the rest is filled from ON's own feature list and weight.
const FRAME = {
  'T-Shirts':        'a lightweight running tee built for everyday miles',
  'Long Sleeves':    'a long sleeve running top for cool-weather miles',
  'Tanks':           'a breathable running tank for warm-weather training',
  'Shorts':          'lightweight running shorts',
  'Tights/Leggings': 'supportive running tights',
  'Pants':           'running pants for cold and transitional weather',
  'Sweatpants':      'relaxed training sweatpants for warm-ups and rest days',
  'Hoodies':         'a soft training hoodie for warm-ups and recovery',
  'Crewnecks':       'a training crewneck for layering before and after a run',
  'Half-Zips':       'a half-zip running top with adjustable ventilation',
  'Full Zips':       'a full-zip training layer',
  'Jackets':         'a running jacket',
  'Vests':           'a running vest for core warmth without sleeve bulk',
  'Sports Bras':     'a supportive running bra',
  'Socks':           'running socks',
  'Gloves':          'running gloves',
  'Headwear':        'a running cap',
};
// The same garments when the fabric says cotton, so a Club tee is not sold as a
// performance top. Only the types ON actually makes in cotton need an entry.
const LIFESTYLE_FRAME = {
  'T-Shirts':     'a soft cotton tee for travel, recovery and everyday wear',
  'Long Sleeves': 'a soft cotton long sleeve for travel and recovery days',
  'Hoodies':      'a cotton hoodie for warm-ups, travel and rest days',
  'Crewnecks':    'a cotton crewneck for layering off the run',
  'Sweatpants':   'cotton sweatpants for warm-ups, travel and rest days',
  'Pants':        'relaxed cotton pants for travel and rest days',
  'Tanks':        'a soft cotton tank for training and everyday wear',
};
const PLURAL = new Set(['Shorts', 'Tights/Leggings', 'Pants', 'Sweatpants', 'Socks', 'Gloves']);

// A feature bullet is marketing prose, and only SOME of it survives being
// spliced into a sentence. "Concealed zippered back pocket" reads fine after
// "with"; "Recovery, all-day wear, soft touch" does not, and that is a real
// bullet from the Club Boxy-T. So the splice requires a bullet that names a
// PART of the garment and carries no comma list, and when nothing qualifies the
// sentence simply ends early and the bullet list does the work. A clumsy
// sentence on 282 live product pages is worse than a short one.
const PART_RE = /\b(pocket|brief|waistband|waist|zip|zipper|hem|hood|drawcord|drawstring|mesh|panel|seam|cuff|thumbhole|vent|strap|liner|cord|sleeve|collar|neckline|gusset|shoulder|lining|cup|band)\b/i;
function leadFeatures(usps) {
  return (usps || [])
    .map((u) => String(u).replace(/\s+/g, ' ').trim().replace(/\.$/, ''))
    // ON writes some bullets as a sentence opener. Spliced after "with" they
    // read "with designed with inner brief", so the lead-in comes off first.
    .map((u) => u.replace(/^(Designed with|Designed for|Featuring|Comes with|Built with|Made with|Includes)\s+/i, ''))
    .filter((u) => PART_RE.test(u) && !u.includes(',') && u.split(' ').length <= 8)
    .slice(0, 2);
}
const lcFirst = (s) => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const ucFirst = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function buildDescription(p, st) {
  const gender = /wom/i.test(p.gender) ? "Women's" : /men/i.test(p.gender) ? "Men's" : 'Unisex';
  const model = p.model;
  // A COTTON top is a lifestyle piece, not running kit, and ON's own bullets say
  // so ("For travel and recovery"). Calling a 100% cotton Club tee "built for
  // everyday miles" is the kind of wrong a shopper notices and a returns desk
  // pays for, so the fabric picks the frame.
  const cottonTop = /cotton\s+(9\d|100)%/i.test(String(st.materials || ''))
    && LIFESTYLE_FRAME[p.type] !== undefined;
  const frame = (cottonTop ? LIFESTYLE_FRAME[p.type] : FRAME[p.type]) || 'a running garment';
  const are = PLURAL.has(p.type) ? 'are' : 'is';
  const weight = st.weight && /^\d+$/.test(String(st.weight)) ? String(st.weight) : '';
  const lead = leadFeatures(st.usps);

  // Opening sentence. Original wording, ON's facts.
  let intro = 'The <strong>On ' + esc(gender + ' ' + model) + '</strong> ' + are + ' ' + frame;
  if (lead.length) intro += ', with ' + lcFirst(esc(lead[0])) + (lead[1] ? ' and ' + lcFirst(esc(lead[1])) : '');
  intro += '.';
  // Each clause is its own sentence, so each one is capitalised. Joining them
  // with ". " and capitalising only the first produced "Weighs just 120 g.
  // shown in Barberry." on every product in the first dry run.
  const bits = [];
  if (weight) bits.push('Weighs just ' + weight + ' g');
  if (st.fit) bits.push(ucFirst(String(st.fit)) + ' fit');
  if (p.color) bits.push('Shown in ' + esc(p.color));
  const second = bits.length ? '<p>' + bits.map(ucFirst).join('. ') + '.</p>' : '';

  const out = ['<p>' + intro + '</p>'];
  if (second) out.push(second);
  if ((st.usps || []).length) {
    out.push('<h3>Features</h3>');
    out.push('<ul>' + st.usps.map((u) => '<li>' + esc(String(u).trim()) + '</li>').join('') + '</ul>');
  }
  const specs = [];
  if (weight) specs.push(['Weight', weight + ' g']);
  if (st.materials) specs.push(['Fabric', String(st.materials).trim()]);
  if ((st.sustainabilityClaims || []).length) specs.push(['Recycled content', st.sustainabilityClaims.join(' ')]);
  if (st.fit) specs.push(['Fit', String(st.fit).replace(/^./, (c) => c.toUpperCase())]);
  if (p.color) specs.push(['Color', p.color]);
  if (p.sizeRange) specs.push(['Sizes', p.sizeRange]);
  if (p.article) specs.push(['Style number', p.article]);
  if ((st.countryOfOrigin || []).length) specs.push(['Made in', st.countryOfOrigin.join(', ')]);
  if (specs.length) {
    out.push('<h3>Specs</h3>');
    out.push('<ul>' + specs.map(([k, v]) => '<li><strong>' + esc(k) + ':</strong> ' + esc(v) + '</li>').join('') + '</ul>');
  }
  return out.join('\n');
}

// ------------------------------------------------------- category metafields --
// ON's fabric string to the ONE dominant fibre Shopify's Fabric list allows.
// Order matters: the first match wins, and the string is checked for the fibre
// with the highest stated percentage first where that is parseable.
function fabricOf(materials) {
  const s = String(materials || '');
  const pct = [...s.matchAll(/([A-Za-z]+)\s+(\d{1,3})%/g)].map((m) => [m[1], parseInt(m[2], 10)]);
  const order = pct.sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const MAP = { polyester: 'Polyester', cotton: 'Cotton', elastane: 'Lycra', polyamide: 'Nylon',
    nylon: 'Nylon', wool: 'Wool', merino: 'Merino', viscose: 'Viscose', modal: 'Modal',
    lyocell: 'Lyocell', acrylic: 'Acrylic', rayon: 'Rayon', fleece: 'Fleece', mesh: 'Mesh', silk: 'Silk' };
  for (const f of order) { const k = MAP[f.toLowerCase()]; if (k) return k; }
  for (const [k, v] of Object.entries(MAP)) if (new RegExp(k, 'i').test(s)) return v;
  return '';
}
// A feature bullet to Shopify's Activewear clothing features vocabulary. Only
// phrases that clearly mean the listed value, never a loose guess: a wrong
// filter value is worse than a missing one because a shopper filters on it.
const FEATURE_RULES = [
  [/moisture[- ]wicking|wicks|drytec/i, 'Moisture wicking'],
  [/quick[- ]dry/i, 'Quick drying'],
  [/breathab/i, 'Breathable design'],
  [/reflect/i, 'Reflective'],
  [/high[- ]visibil/i, 'High-visibility accents'],
  [/four[- ]way stretch|4[- ]way stretch/i, 'Four-way stretch'],
  [/adjustable waist|drawcord|drawstring wais|elastic waist/i, 'Adjustable waistband'],
  [/chafing|chafe/i, 'Anti-chafing design'],
  [/mesh panel|perforated mesh|mesh back/i, 'Mesh panels'],
  [/odou?r[- ]resist|antimicrobial|anti-microbial/i, 'Odor resistant'],
  [/ventilat|airflow|air flow/i, 'Ventilation'],
  [/seamless|unnoticeable seam|bonded hem|bonded seam/i, 'Seamless'],
  [/flatlock/i, 'Flatlock seams'],
  [/thumbhole|thumb hole|thumb loop/i, 'Thumbholes'],
  [/compress/i, 'Compression'],
  [/zipped pocket|zippered pocket|zip pocket|concealed zipper|secure pocket/i, 'Sweatproof pockets'],
  [/hidden pocket|concealed pocket|drop-in pocket/i, 'Hidden pockets'],
  [/removable pad|removable cup/i, 'Removable padding'],
  [/upf|uv protect|sun protect/i, 'UV protection'],
  [/waterproof|water-repellent|water repellent|dwr/i, 'Waterproof coating'],
  [/temperature regulat|thermoregulat/i, 'Temperature regulation'],
  [/body contour|contouring/i, 'Body contouring fit'],
];
function featuresOf(usps) {
  const hit = new Set();
  for (const u of usps || []) for (const [re, val] of FEATURE_RULES) if (re.test(u)) hit.add(val);
  return [...hit];
}
// Colour name to Shopify's 19 colour values. The store's shopify--color-pattern
// definition also holds supplier-specific labels, but a plain colour is what a
// shopper filters on, so this maps to the generic family.
const COLOR_RULES = [
  [/black|eclipse|midnight|basalt|onyx|shadow/i, 'Black'],
  [/white|ivory|undyed|flurry|chalk|frost/i, 'White'],
  [/navy|indigo|abyss|apollo/i, 'Navy'],
  [/blue|glacier|jay|brume|azure|cobalt|sky/i, 'Blue'],
  [/grey|gray|hare|alloy|cinder|ash|silver|fog|stone|slate/i, 'Gray'],
  [/green|olive|laurel|juniper|agave|sage|moss|forest|lime|limelight/i, 'Green'],
  [/red|ruby|ember|cherry|crimson|auburn/i, 'Red'],
  [/pink|bubblegum|blush|rose|foxglove|magenta/i, 'Pink'],
  [/purple|orchid|violet|lilac|lavender|urchin/i, 'Purple'],
  [/orange|tangerine|coral|rust|clay/i, 'Orange'],
  [/yellow|gold|lemon|mustard|citrus/i, 'Yellow'],
  [/beige|sand|desert|bark|tan|khaki|taupe|espresso|crater|barberry|stellar|dune/i, 'Beige'],
  [/brown|chocolate|cocoa|coffee/i, 'Brown'],
];
function colorOf(name) {
  const s = String(name || '');
  if (/[|/]/.test(s) || /\b\w+\s+\w+\b/.test(s.trim()) && COLOR_RULES.filter(([re]) => re.test(s)).length > 1) {
    // Two colours named, which is what Multicolor is for.
    const hits = new Set(COLOR_RULES.filter(([re]) => re.test(s)).map(([, v]) => v));
    if (hits.size > 1) return 'Multicolor';
  }
  for (const [re, v] of COLOR_RULES) if (re.test(s)) return v;
  return '';
}
const SLEEVE = { 'T-Shirts': 'Short', 'Long Sleeves': 'Long', 'Tanks': 'Sleeveless',
  'Hoodies': 'Long', 'Crewnecks': 'Long', 'Half-Zips': 'Long', 'Jackets': 'Long',
  'Vests': 'Sleeveless', 'Sports Bras': 'Sleeveless', 'Full Zips': 'Long' };
const NECKLINE = { 'T-Shirts': 'Crew', 'Long Sleeves': 'Crew', 'Crewnecks': 'Crew',
  'Hoodies': 'Hooded', 'Half-Zips': 'Mock' };

function metafieldPlan(p, st, MO) {
  const want = {};
  const put = (key, names) => {
    const defn = MO[key];
    if (!defn) return;
    const ids = [];
    for (const n of [].concat(names)) { if (n && defn[n]) ids.push(defn[n]); }
    if (ids.length) want[key] = ids;
  };
  put('target-gender', /wom/i.test(p.gender) ? 'Female' : /men/i.test(p.gender) ? 'Male' : 'Unisex');
  put('age-group', 'Adults');
  put('activity', 'Running');
  const fab = fabricOf(st.materials); if (fab) put('fabric', fab);
  const col = colorOf(p.color); if (col) put('color-pattern', col);
  if (SLEEVE[p.type]) put('sleeve-length-type', SLEEVE[p.type]);
  if (NECKLINE[p.type]) put('neckline', NECKLINE[p.type]);
  if (/\bcrop\b/i.test(p.model)) put('top-length-type', 'Crop top');
  const feats = featuresOf(st.usps); if (feats.length) put('activewear-clothing-features', feats);
  return want;
}

// ------------------------------------------------------------------- main ---
const PQ = `query($q: String!, $cursor: String) {
  products(first: 50, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title productType status descriptionHtml
      metafields(first: 40, namespace: "custom") { nodes { key value } }
      options { name optionValues { name } }
      variants(first: 1) { nodes { sku } } }
  }
}`;
const search = ['vendor:\'' + VENDOR + '\''].concat(SINCE ? ['created_at:>=' + SINCE] : []).join(' AND ');
const raw = []; let cursor = null;
do { const d = await gql(PQ, { q: search, cursor }); raw.push(...d.products.nodes);
  cursor = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null; } while (cursor);

const isFootwear = (t) => /shoes$/i.test(String(t || '').trim());
const mf = (p, k) => { const n = p.metafields.nodes.find((m) => m.key === k); return n ? n.value : ''; };
const articleOf = (sku) => { const m = /ON-([0-9][A-Z]{2}\d{6,})/.exec(String(sku || '').toUpperCase()); return m ? m[1] : ''; };
const modelOf = (title) => {
  let t = he(String(title || '')).replace(/^ON\s+/i, '').replace(/^(Men'?s|Women'?s|Unisex)\s+/i, '');
  const i = t.lastIndexOf(' - '); if (i > 0) t = t.slice(0, i);
  return t.replace(/\s+/g, ' ').trim();
};
const products = raw.filter((p) => p.productType && !isFootwear(p.productType)).map((p) => {
  const sizes = (p.options.find((o) => /size/i.test(o.name)) || {}).optionValues || [];
  return { id: p.id, handle: p.handle, title: he(p.title), type: p.productType, status: p.status,
    descriptionHtml: p.descriptionHtml || '', sku: (p.variants.nodes[0] || {}).sku || '',
    article: articleOf((p.variants.nodes[0] || {}).sku), model: modelOf(p.title),
    color: mf(p, 'color_name'), gender: mf(p, 'gender'),
    sizeRange: sizes.length ? sizes[0].name + ' to ' + sizes[sizes.length - 1].name : '' };
});
console.log(`${VENDOR} garments: ${products.length}` + (SINCE ? '  (since ' + SINCE + ')' : ''));

// Sitemap, cached.
const smFile = path.join(CACHE, 'on-products.xml');
if (!fs.existsSync(smFile) || fs.statSync(smFile).size < 1000) {
  console.log('fetching on.com product sitemap ...');
  if (!curlTo('https://www.on.com/en-us/products.xml', smFile)) { console.error('could not fetch the sitemap'); process.exit(1); }
}
const sm = fs.readFileSync(smFile, 'utf8');
const byArticle = {}, byStyle = {};
for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const a = /-([0-9][A-Z]{2}\d{6,})$/.exec(m[1]);
  if (!a) continue;
  const code = a[1].toUpperCase();
  byArticle[code] = m[1];
  (byStyle[code.slice(0, 7)] = byStyle[code.slice(0, 7)] || []).push(m[1]);
}
console.log('sitemap URLs with an article code: ' + Object.keys(byArticle).length);

// One page per STYLE.
const needed = new Map();
for (const p of products) {
  if (!p.article) continue;
  const st = p.article.slice(0, 7);
  if (needed.has(st)) continue;
  const url = byArticle[p.article] || (byStyle[st] || []).sort()[0];
  if (url) needed.set(st, url);
}
console.log('styles to resolve: ' + needed.size);
let fetched = 0, cached = 0, failed = 0;
const STATS = {};
for (const [style, url] of needed) {
  const f = path.join(CACHE, style + '.html');
  if (!fs.existsSync(f) || fs.statSync(f).size < 50000) {
    if (!curlTo(url, f)) { failed++; continue; }
    fetched++;
    await new Promise((s) => setTimeout(s, 600));
  } else cached++;
  const s = statsFromHtml(fs.readFileSync(f, 'utf8'));
  if (s && (s.usps || s.materials)) STATS[style] = s; else failed++;
}
console.log(`pages: fetched ${fetched}, cached ${cached}, unusable ${failed}  |  styles with stats: ${Object.keys(STATS).length}`);

const MO = {};
if (DO_MF) {
  const TYPES = ['color-pattern', 'target-gender', 'age-group', 'sleeve-length-type', 'neckline',
    'top-length-type', 'fabric', 'activity', 'activewear-clothing-features'];
  for (const t of TYPES) {
    try {
      const d = await gql(`query($t:String!){ metaobjects(type:$t, first:250){ nodes{ id displayName } } }`, { t: 'shopify--' + t });
      MO[t] = Object.fromEntries(d.metaobjects.nodes.map((n) => [n.displayName, n.id]));
    } catch (e) { MO[t] = null; }
  }
  console.log('\nshopify--* value sets available: ' + Object.entries(MO).map(([k, v]) => k + '=' + (v ? Object.keys(v).length : 'none')).join(', '));
}

const descOps = [], mfOps = [], noStats = [], samples = [];
for (const p of products) {
  const st = STATS[(p.article || '').slice(0, 7)];
  if (!st) { noStats.push(p.handle + '  ' + (p.sku || 'no sku')); continue; }
  if (DO_DESC) {
    const html = buildDescription(p, st);
    if (html.trim() && html.trim() !== p.descriptionHtml.trim()) {
      descOps.push({ p, html });
      // One sample per garment TYPE, so a dry run shows every sentence frame
      // rather than three colourways of the same tee.
      if (!samples.some((s) => s.p.type === p.type)) samples.push({ p, html });
    }
  }
  if (DO_MF) {
    const want = metafieldPlan(p, st, MO);
    for (const [key, ids] of Object.entries(want)) {
      mfOps.push({ ownerId: p.id, handle: p.handle, namespace: 'shopify', key,
        type: 'list.metaobject_reference', value: JSON.stringify(ids) });
    }
  }
}
if (LIMIT) { descOps.length = Math.min(descOps.length, LIMIT); mfOps.length = Math.min(mfOps.length, LIMIT); }

console.log(`\ndescriptions to write: ${descOps.length}`);
console.log(`category metafields to write: ${mfOps.length}`);
if (noStats.length) {
  console.log(`\nno ON stats found for ${noStats.length}:`);
  noStats.slice(0, 12).forEach((h) => console.log('   ' + h));
}
const keyT = {}; mfOps.forEach((o) => { keyT[o.key] = (keyT[o.key] || 0) + 1; });
if (mfOps.length) { console.log('\nby metafield:'); Object.entries(keyT).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  shopify.' + k)); }

if (!APPLY) {
  for (const s of samples) {
    console.log('\n' + '='.repeat(72) + '\n' + s.p.handle + '   [' + s.p.type + ']\n' + '='.repeat(72));
    console.log(s.html);
  }
  console.log('\nDRY RUN. Re-run with --apply to write.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(ROOT, 'apparel-content-rollback-' + stamp + '.json');
const fd = fs.openSync(file, 'w');
fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), shop: SHOP,
  descriptions: descOps.map(({ p }) => ({ id: p.id, handle: p.handle, was: p.descriptionHtml })),
  metafields: mfOps.map((o) => ({ ownerId: o.ownerId, handle: o.handle, key: o.key })) }, null, 2));
fs.fsyncSync(fd); fs.closeSync(fd);
console.log('\nRollback written: ' + file);

if (descOps.length) {
  const UP = `mutation($input: ProductInput!) { productUpdate(input: $input) { userErrors { field message } } }`;
  let n = 0, bad = 0;
  for (const { p, html } of descOps) {
    const d = await gql(UP, { input: { id: p.id, descriptionHtml: html } });
    const e = d.productUpdate.userErrors || [];
    if (e.length) { bad++; console.log('  FAILED ' + p.handle + ' ' + JSON.stringify(e)); } else n++;
    if (n % 25 === 0) console.log('  descriptions ... ' + n + ' / ' + descOps.length);
    await new Promise((s) => setTimeout(s, 180));
  }
  console.log(`descriptions written ${n}, failed ${bad}`);
}
if (mfOps.length) {
  const SET = `mutation($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`;
  let n = 0, bad = 0;
  for (let i = 0; i < mfOps.length; i += 25) {
    const chunk = mfOps.slice(i, i + 25).map(({ ownerId, namespace, key, type, value }) => ({ ownerId, namespace, key, type, value }));
    const d = await gql(SET, { metafields: chunk });
    const e = d.metafieldsSet.userErrors || [];
    if (e.length) { bad += chunk.length; console.log('  FAILED chunk ' + i + ' ' + JSON.stringify(e).slice(0, 300)); } else n += chunk.length;
    if (i % 250 === 0) console.log('  metafields ... ' + n + ' / ' + mfOps.length);
    await new Promise((s) => setTimeout(s, 250));
  }
  console.log(`metafields written ${n}, failed ${bad}`);
}
