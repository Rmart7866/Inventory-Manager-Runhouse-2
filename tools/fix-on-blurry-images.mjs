// fix-on-blurry-images.mjs, The Run House.
//
// Replaces ON product images that were uploaded at thumbnail size.
//
// WHAT WENT WRONG. ON's product photography lives on Contentful, and a
// Contentful URL takes sizing parameters. The BARE url is the original; adding
// `?w=200` returns a 200 pixel crop. Eight ON Club garments were created from a
// sized url, so the file sitting on Shopify's CDN IS 200x200. It cannot be
// sharpened, it has to be replaced from source.
//
//   bare                      4000 x 4000, 3.4 MB
//   ?w=2500&fm=png            2500 x 2500, 1.7 MB   <- what this uploads
//   ?w=200                     200 x  200           <- what is on Shopify now
//
// This is the same trap as ASICS on Scene7, where the default preset serves
// 320x159 and the url needs `?scl=1`. Check the size a CDN returns BY DEFAULT
// before trusting it, per host, every time.
//
// 2500 and PNG are not arbitrary: every other ON flat on this store is a
// 2500x2500 PNG, and PNG keeps the cut-out's transparency. Matching them
// matters more than squeezing out the last pixels of the 4000px original.
//
// WHERE THE FULL URL COMES FROM. The Shopify copy keeps the original filename,
// and `on-pdp-cache/` already holds the on.com product pages fetched by
// apparel-content.mjs, which reference the full Contentful paths. So the
// filename is the join: index the cache, look the filename up, rebuild the url.
// A product whose filename is not in the cache is reported and skipped, never
// guessed at.
//
// THE OLD IMAGE IS DELETED ONLY AFTER THE NEW ONE IS READY. Shopify processes
// an uploaded image asynchronously, so a create that is still PROCESSING is not
// yet a usable image, and deleting first would leave a product with none.
//
//   node tools/fix-on-blurry-images.mjs            # dry run
//   node tools/fix-on-blurry-images.mjs --apply
//   node tools/fix-on-blurry-images.mjs --max-width 800
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const MAXW = parseInt(arg('max-width', '800'), 10);
const ROOT = new URL('..', import.meta.url).pathname;
const CACHE = path.join(ROOT, 'on-pdp-cache');
const WANT = '?w=2500&fm=png';

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

// index every Contentful asset the cached on.com pages mention, by filename
if (!fs.existsSync(CACHE)) { console.error('No on-pdp-cache directory. Run tools/apparel-content.mjs first.'); process.exit(1); }
const index = new Map();
for (const f of fs.readdirSync(CACHE)) {
  const html = fs.readFileSync(path.join(CACHE, f), 'utf8');
  const re = /https:\/\/images\.ctfassets\.net\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[a-f0-9]+\/([A-Za-z0-9._-]+\.(?:png|jpg|jpeg))/g;
  let m;
  while ((m = re.exec(html))) if (!index.has(m[1])) index.set(m[1], m[0]);
}
console.log('contentful assets indexed from ' + fs.readdirSync(CACHE).length + ' cached pages: ' + index.size);

let after = null, all = [];
do {
  const d = await gql(`query($c:String){ products(first:250, after:$c, query:"vendor:'On Running' OR vendor:'ON Running'"){
    pageInfo{hasNextPage endCursor}
    nodes{ id handle title
      media(first:20){ nodes{ ... on MediaImage { id image{ url width height } } } } } } }`, { c: after });
  all = all.concat(d.products.nodes);
  after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (after);

const jobs = [];
const skipped = [];
for (const p of all) {
  const small = p.media.nodes.filter((m) => (m.image.width || 0) < MAXW);
  if (!small.length) continue;
  for (const m of small) {
    const file = m.image.url.split('/').pop().split('?')[0];
    const base = index.get(file);
    if (!base) { skipped.push(p.handle + '  ' + m.image.width + 'px  ' + file); continue; }
    jobs.push({ productId: p.id, handle: p.handle, oldMediaId: m.id,
      was: m.image.width + 'x' + m.image.height, src: base + WANT, file });
  }
}

console.log('\nimages under ' + MAXW + 'px that can be replaced: ' + jobs.length);
jobs.forEach((j) => console.log('   ' + j.was.padEnd(10) + ' -> 2500x2500   ' + j.handle));
if (skipped.length) {
  console.log('\nsmall but NOT in the cache, left alone (' + skipped.length + '):');
  skipped.slice(0, 30).forEach((s) => console.log('   ' + s));
}
if (!jobs.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'on-blurry-rollback-' + stamp + '.json');
fs.writeFileSync(rb, JSON.stringify(jobs, null, 2));
console.log('\nRollback written: ' + rb);

const CREATE = `mutation($productId:ID!,$media:[CreateMediaInput!]!){
  productCreateMedia(productId:$productId, media:$media){
    media{ ... on MediaImage { id status } } mediaUserErrors{ field message } } }`;
const STATUS = `query($id:ID!){ node(id:$id){ ... on MediaImage { id status image{ width height } } } }`;
const DELETE = `mutation($productId:ID!,$mediaIds:[ID!]!){
  productDeleteMedia(productId:$productId, mediaIds:$mediaIds){ mediaUserErrors{ field message } } }`;

let done = 0, failed = 0;
for (const j of jobs) {
  try {
    const c = await gql(CREATE, { productId: j.productId,
      media: [{ originalSource: j.src, mediaContentType: 'IMAGE', alt: j.handle }] });
    const errs = c.productCreateMedia.mediaUserErrors || [];
    if (errs.length) { failed++; console.log('  create FAILED ' + j.handle + ' ' + JSON.stringify(errs).slice(0, 180)); continue; }
    const newId = c.productCreateMedia.media[0].id;

    // WAIT FOR READY. A PROCESSING image is not yet usable, and deleting the
    // old one before the new is ready leaves the product with no image.
    let st = 'PROCESSING', dims = null;
    for (let i = 0; i < 20 && st === 'PROCESSING'; i++) {
      await new Promise((s) => setTimeout(s, 1500));
      const q = await gql(STATUS, { id: newId });
      st = q.node ? q.node.status : 'UNKNOWN';
      dims = q.node && q.node.image ? q.node.image.width + 'x' + q.node.image.height : null;
    }
    if (st !== 'READY') {
      failed++;
      console.log('  ' + j.handle + ': new image is ' + st + ', KEEPING the old one');
      continue;
    }
    const d2 = await gql(DELETE, { productId: j.productId, mediaIds: [j.oldMediaId] });
    const de = d2.productDeleteMedia.mediaUserErrors || [];
    if (de.length) console.log('  ' + j.handle + ': new image ' + dims + ' added, old one NOT deleted ' + JSON.stringify(de).slice(0, 140));
    else { done++; console.log('  ' + j.handle + ': replaced, now ' + dims); }
  } catch (e) { failed++; console.log('  THREW ' + j.handle + ' ' + String(e.message).slice(0, 180)); }
}
console.log(`\nreplaced ${done}, failed ${failed}.`);
