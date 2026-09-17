// refresh-asics-media.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Replaces the undersized ASICS product photos that Stage 4 attached before the
// scl=1 fix, with the full resolution originals.
//
// WHAT WENT WRONG. REMOTE_IMAGE_SOURCES.asics built its URL with no parameters,
// and Scene7 answers a bare request with its DEFAULT rendition, which on the
// ASICS preset is 320x159. Shopify fetched exactly what it was asked for, so
// every product created through the new pull got three images that look like
// photographs at thumbnail size and fall apart anywhere else. Asking for
// "?scl=1", scale factor 1, returns the native asset at about 3000x1500.
//
// New Balance is on Scene7 too and was never affected: its preset defaults to
// 2400px. Same platform, different preset, which is why the fix is per brand.
//
// TARGETING IS DELIBERATELY NARROW. Only media exactly 320 pixels wide, on an
// ASICS product, whose SKU yields a code. 320 is Scene7's default width and is
// this bug's signature. ASICS products also carry OLDER small images from years
// of hand uploads, 455x341, 500x375, 550x412 and so on; those are somebody
// else's decision and are left alone.
//
// ORDER OF OPERATIONS: add the good images, wait for Shopify to finish
// fetching them, and only then delete the small ones. The reverse would leave a
// product with no photograph at all if the fetch failed.
//
// Usage:
//   node tools/refresh-asics-media.mjs
//   node tools/refresh-asics-media.mjs --apply
//   node tools/refresh-asics-media.mjs --limit 1 --apply    # try one first
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = parseInt(argOf('--limit', '0'), 10) || 0;

const SCENE7_DEFAULT_WIDTH = 320;
// Must stay in step with REMOTE_IMAGE_SOURCES.asics in product-enrichment.js.
const VIEWS = [
  { id: 'SR_RT_GLB', word: 'lateral' },
  { id: 'SB_FR_GLB', word: 'quarter' },
  { id: 'SR_LT_GLB', word: 'medial' },
];
const urlFor = (code, id) => `https://images.asics.com/is/image/asics/${String(code).replace(/-/g, '_')}_${id}?scl=1`;
const codeFromSku = (sku) => { const m = /(\d{4,}[A-Z]\d{2,})-(\d{3})/.exec(String(sku || '').toUpperCase()); return m ? m[1] + '-' + m[2] : ''; };

function devVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(devVars());

const SCAN = `query($cursor:String){products(first:60,after:$cursor,query:"vendor:ASICS OR vendor:Asics"){
  pageInfo{hasNextPage endCursor}
  nodes{id handle title
    media(first:20){nodes{ ... on MediaImage{ id alt image{ width height } } }}
    variants(first:1){nodes{sku}}}}}`;
const ADD = `mutation($id:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$id,media:$media){
  media{ ... on MediaImage{ id fileStatus } } mediaUserErrors{field message code}}}`;
const STATUS = `query($id:ID!){product(id:$id){media(first:30){nodes{ ... on MediaImage{ id fileStatus image{width} } }}}}`;
const DEL = `mutation($id:ID!,$ids:[ID!]!){productDeleteMedia(productId:$id,mediaIds:$ids){
  deletedMediaIds mediaUserErrors{field message code}}}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function head(url) {
  try { const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } }); return r.ok; }
  catch { return false; }
}

async function main() {
  let cur = null; const all = [];
  for (;;) {
    const r = await client.graphql(SCAN, { cursor: cur });
    const p = r.data.products; all.push(...p.nodes);
    process.stderr.write(`  scanned ${all.length}\r`);
    if (!p.pageInfo.hasNextPage) break; cur = p.pageInfo.endCursor;
  }
  process.stderr.write(' '.repeat(30) + '\r');

  const skipped = { noCode: 0, noSmall: 0 };
  const targets = [];
  for (const p of all) {
    const media = (p.media.nodes || []).filter(Boolean);
    const small = media.filter((m) => m.image && m.image.width === SCENE7_DEFAULT_WIDTH);
    if (!small.length) { skipped.noSmall++; continue; }
    const code = codeFromSku((p.variants.nodes[0] || {}).sku);
    if (!code) { skipped.noCode++; continue; }
    targets.push({ ...p, code, small, keep: media.length - small.length });
  }
  const picked = LIMIT ? targets.slice(0, LIMIT) : targets;

  console.log(`\nASICS products scanned: ${all.length}`);
  console.log(`  carrying ${SCENE7_DEFAULT_WIDTH}px Scene7 defaults: ${targets.length}`);
  console.log(`  images to replace: ${targets.reduce((a, b) => a + b.small.length, 0)}`);
  console.log(`  skipped: ${skipped.noSmall} with no 320px image, ${skipped.noCode} with no derivable code`);
  if (!picked.length) { console.log('\nNothing to do.'); return; }
  console.log('\nSample:');
  for (const t of picked.slice(0, 6)) console.log(`   ${t.code.padEnd(14)} ${t.small.length} small, ${t.keep} other  ${t.title.slice(0, 44)}`);
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to refresh ${picked.length} product(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `asics-media-refresh-${stamp}.json`);
  const record = { note: 'Small Scene7 default images replaced with scl=1 originals. Lists what was added and what was deleted.', products: [] };
  fs.writeFileSync(file, JSON.stringify(record, null, 1));
  console.log(`\nRecord at ${path.basename(file)}, written before the first write.`);

  let fixed = 0, failed = 0, added = 0, removed = 0;
  for (const t of picked) {
    // Only views that actually exist, so a 404 never becomes FAILED media.
    const present = [];
    for (const v of VIEWS) if (await head(urlFor(t.code, v.id))) present.push(v);
    if (!present.length) { failed++; console.log(`  SKIP ${t.handle}: no scl=1 views found for ${t.code}`); continue; }

    const r = await client.graphql(ADD, { id: t.id, media: present.map((v) => ({
      originalSource: urlFor(t.code, v.id), mediaContentType: 'IMAGE', alt: `${t.title} ${v.word}` })) });
    const errs = r.data?.productCreateMedia?.mediaUserErrors || [];
    if (errs.length) { failed++; console.log(`  FAIL add ${t.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
    const newIds = (r.data.productCreateMedia.media || []).map((m) => m.id);

    // Wait for Shopify to finish fetching before removing the old ones.
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await sleep(1500);
      const st = await client.graphql(STATUS, { id: t.id });
      const nodes = (st.data.product.media.nodes || []).filter((m) => newIds.includes(m.id));
      if (nodes.length === newIds.length && nodes.every((m) => m.fileStatus === 'READY')) { ready = true; break; }
      if (nodes.some((m) => m.fileStatus === 'FAILED')) break;
    }
    if (!ready) { failed++; console.log(`  FAIL ${t.handle}: new media did not reach READY, old images LEFT IN PLACE`); continue; }

    const d = await client.graphql(DEL, { id: t.id, ids: t.small.map((m) => m.id) });
    const derr = d.data?.productDeleteMedia?.mediaUserErrors || [];
    if (derr.length) console.log(`  WARN ${t.handle}: added ok but delete failed: ${derr.map((e) => e.message).join('; ')}`);
    else removed += t.small.length;

    added += newIds.length; fixed++;
    record.products.push({ handle: t.handle, code: t.code, addedMediaIds: newIds, deletedMediaIds: t.small.map((m) => m.id) });
    fs.writeFileSync(file, JSON.stringify(record, null, 1));
    process.stderr.write(`  ${fixed}/${picked.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nRefreshed ${fixed} product(s): ${added} full size images added, ${removed} small ones removed, ${failed} failed.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
