// attach-draft-images.mjs, The Run House.
//
// Attaches supplier CDN photography to DRAFT SHOE products that carry stock
// and have no image at all.
//
// WHY THESE AND NOT EVERY DRAFT. Measured 2026-10-30: 1,129 draft products
// carry stock, but most of that is not real. 214 are Collective, whose unit
// counts are nominal (one vendor shows 609,939 units across 8 products), 331
// are The Run House's own printed merch, and of the 584 supplier drafts only
// 109 have had their inventory touched since 1 October. The rest trail back to
// August 2023, so their numbers are fiction and no amount of photography makes
// them publishable. Filtered to shoes, that leaves 78 products holding 68,474
// units, of which 41 have no image.
//
// THE URL IS HANDED TO SHOPIFY, NOT DOWNLOADED. Same as Stage 4: every view is
// HEAD checked first, because coverage is partial on every host and a url that
// is not there leaves FAILED media on the product, then the surviving urls go
// to productSet and Shopify fetches them itself.
//
// productSet IS A FULL SYNC MUTATION AND THAT IS WORTH A PAUSE. It is the only
// way to add media in API 2026-01: productCreateMedia is gone, productUpdate
// does not take media, and fileCreate cannot attach to a product. Verified by
// experiment before this tool was written, on one real draft: passing only
// { id, files } left title, vendor, type, status, description, tags, seo,
// category, options, all 12 variants, their prices and all 2,224 units
// untouched, and added 5 READY images at 2000px. If that ever stops being
// true, this tool is the thing that breaks.
//
//   node tools/attach-draft-images.mjs                 dry run
//   node tools/attach-draft-images.mjs --limit 3       try three
//   node tools/attach-draft-images.mjs --apply         attach, with a rollback
//   node tools/attach-draft-images.mjs --restore <f>   delete what it added
//
// It never publishes anything. Status is not in the payload, so a draft stays
// a draft; what to sell is a commercial decision, not this tool's.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { titleParts } from './product-title-parts.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', '0'));
const RESTORE = arg('--restore', '');
const SINCE = arg('--since', '2026-10-01');

// PUMA'S CDN 404s A REQUEST WITH NO BROWSER USER AGENT, measured 2026-10-30,
// so the HEAD check here sends one or it measures itself rather than the
// catalogue. Shopify's own fetcher is unaffected, confirmed by the five Puma
// images that came back READY.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0 Safari/537.36';

// the app's own key and url logic, so this cannot drift from Stage 4
const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'product-enrichment.js'), 'utf8'), sandbox);
const PE = sandbox.ProductEnrichment || sandbox.window.ProductEnrichment;

// vendor as Shopify spells it, to the brand key the app uses
const BRAND = { asics: 'asics', brooks: 'brooks', saucony: 'saucony', hoka: 'hoka',
  'new balance': 'newbalance', puma: 'puma', 'on running': 'on', merrell: 'merrell', altra: 'altra' };

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
  if (j.errors && attempt < 5) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

// Alt text, the same shape backfill-alt-text.mjs writes, plus which view it is.
function altFor(title, word) {
  const { model, colour } = titleParts(title);
  let a = model;
  if (!/\bshoes?\b/i.test(a)) a += ' running shoe';
  if (colour && !new RegExp(colour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(a)) a += ' in ' + colour;
  a = (a + ', ' + word + ' view').replace(/\s+/g, ' ').trim();
  return a.length > 125 ? a.slice(0, 122).replace(/\s+\S*$/, '') + '...' : a;
}

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = rows.flatMap((r) => r.mediaIds || []);
  console.log('deleting ' + ids.length + ' media added by ' + path.basename(file));
  for (let i = 0; i < ids.length; i += 20) {
    const d = await gql(`mutation($ids:[ID!]!){ fileDelete(fileIds:$ids){ userErrors{ message } } }`,
      { ids: ids.slice(i, i + 20) });
    (d.fileDelete.userErrors || []).forEach((e) => console.log('  ' + e.message));
    await new Promise((s) => setTimeout(s, 400));
  }
  console.log('done');
}

async function main() {
  if (RESTORE) return restore(RESTORE);
  console.log('mode    : ' + (APPLY ? 'APPLY, this attaches media' : 'dry run, nothing is written'));
  console.log('filter  : DRAFT, in stock, product type ends in "shoes", no media, inventory touched since ' + SINCE);

  const Q = `query($a:String){ products(first:100, after:$a, query:"status:DRAFT AND inventory_total:>0") {
    pageInfo{ hasNextPage endCursor }
    edges{ node{ id handle title vendor productType totalInventory
      mediaCount{ count }
      variants(first:1){ edges{ node{ sku inventoryItem{ inventoryLevels(first:3){ edges{ node{ updatedAt } } } } } } }
    } } } }`;

  const targets = [];
  let after = null, seen = 0;
  for (let page = 0; page < 12; page++) {
    const d = await gql(Q, { a: after });
    for (const e of d.products.edges) {
      const p = e.node; seen++;
      if (!/shoes$/i.test(p.productType || '')) continue;
      if (p.mediaCount.count > 0) continue;
      const brand = BRAND[(p.vendor || '').toLowerCase()];
      if (!brand) continue;
      const lv = p.variants.edges[0]?.node.inventoryItem.inventoryLevels.edges || [];
      const newest = lv.map((x) => x.node.updatedAt).sort().pop() || '';
      if (newest.slice(0, 10) < SINCE) continue;
      const sku = p.variants.edges[0]?.node.sku || '';
      targets.push({ id: p.id, handle: p.handle, title: p.title, vendor: p.vendor,
        brand, sku, units: p.totalInventory, updated: newest.slice(0, 10) });
    }
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }
  console.log('scanned : ' + seen + ' drafts with stock, ' + targets.length + ' are shoes with no image and fresh inventory\n');

  const plan = [], blocked = [];
  for (const t of targets) {
    const src = PE.REMOTE_IMAGE_SOURCES[t.brand];
    if (!src) { blocked.push({ ...t, why: 'no image source for this brand' }); continue; }
    if (src.supplied) { blocked.push({ ...t, why: 'SUPPLIED only, needs the scraper sidecar' }); continue; }
    const key = PE._imageKeyIn(t.brand, t.sku);
    if (!key) { blocked.push({ ...t, why: 'no colorway key from sku "' + t.sku + '"' }); continue; }
    const files = [];
    for (const v of src.views) {
      const url = src.urlFor(key, v);
      try {
        const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12000) });
        if (r.ok) files.push({ originalSource: url, contentType: 'IMAGE', alt: altFor(t.title, v.word) });
      } catch (e) { /* a miss is a miss */ }
    }
    if (!files.length) { blocked.push({ ...t, why: 'keyed ' + key + ' but the host has no views' }); continue; }
    plan.push({ ...t, key, files });
    if (LIMIT && plan.length >= LIMIT) break;
  }

  console.log('TO ATTACH: ' + plan.length + ' products, ' + plan.reduce((a, p) => a + p.files.length, 0) + ' images');
  plan.forEach((p) => console.log('  ' + String(p.files.length) + ' views  ' + String(p.units).padStart(5) + 'u  ' +
    p.vendor.padEnd(13) + p.title.slice(0, 50)));
  if (blocked.length) {
    console.log('\nBLOCKED: ' + blocked.length);
    blocked.forEach((b) => console.log('  ' + b.vendor.padEnd(13) + b.handle.slice(0, 40).padEnd(42) + b.why));
  }

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to attach.'); return; }
  if (!plan.length) { console.log('\nNothing to attach.'); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '').slice(0, 12);
  const roll = path.join(ROOT, 'draft-images-rollback-' + stamp + '.json');
  const done = [];
  fs.writeFileSync(roll, JSON.stringify(done, null, 2));
  console.log('\nrollback: ' + path.basename(roll));

  let okCount = 0, failedMedia = 0;
  for (const p of plan) {
    const res = await gql(`mutation($input:ProductSetInput!){ productSet(synchronous:true, input:$input){
      product{ id media(first:12){ edges{ node{ id ... on MediaImage { status } } } } }
      userErrors{ field message } } }`, { input: { id: p.id, files: p.files } });
    const errs = res.productSet.userErrors || [];
    if (errs.length) { console.log('  ERROR ' + p.handle + ': ' + errs.map((e) => e.message).join('; ')); continue; }
    const media = res.productSet.product.media.edges.map((e) => e.node);
    const bad = media.filter((m) => m.status === 'FAILED').length;
    failedMedia += bad;
    done.push({ handle: p.handle, id: p.id, mediaIds: media.map((m) => m.id) });
    fs.writeFileSync(roll, JSON.stringify(done, null, 2));
    okCount++;
    console.log('  ' + String(media.length) + ' attached' + (bad ? ', ' + bad + ' FAILED' : '') + '  ' + p.title.slice(0, 54));
    await new Promise((s) => setTimeout(s, 500));
  }
  console.log('\nattached to ' + okCount + ' / ' + plan.length + ' products' + (failedMedia ? ', ' + failedMedia + ' media FAILED' : ', no failures'));
  console.log('undo with:  node tools/attach-draft-images.mjs --restore ' + path.basename(roll));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
