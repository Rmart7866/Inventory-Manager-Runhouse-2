// attach-brooks-images.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Attaches Brooks product photography to Brooks products that have NO media,
// pulling it straight from the supplier CDN. Shopify fetches each URL itself,
// so nothing is uploaded from here.
//
// WHY THIS EXISTS. Stage 4 now attaches Brooks photos at create time, but the
// products created before that landed bare: 59 drafts carrying about 52,000
// units that cannot be published, because a listing with no photo is worse than
// no listing, plus 3 that are ACTIVE and photoless on the storefront today.
//
// WHAT MAKES IT SAFE:
//   1. ADD ONLY, and only to products with NO media at all. A product that has
//      even one image is skipped, so nothing can be reordered, replaced or have
//      a hand picked featured image displaced.
//   2. The no-media check is re-read LIVE per product immediately before the
//      write, never trusted from the scan.
//   3. ARCHIVED products are skipped by default. They are retired, and giving a
//      retired listing photos achieves nothing.
//   4. Every angle URL is HEAD checked first. A 404 handed to Shopify as an
//      originalSource leaves FAILED media sitting on the product.
//   5. The image code must round trip: it is derived from the variant SKU, and
//      the product must carry exactly one code across all its variants. A
//      product whose variants disagree is skipped rather than guessed at.
//
// THE CODE IS NOT A SUBSTRING OF THE SKU. "110442865-048-750-D" is style
// 110442, then a token that is NOT the colour and varies within a style, then
// the colour 048. The image code is those two joined, "110442048". This must
// stay identical to _imageKeyPatterns.brooks in product-enrichment.js.
//
// A rollback file listing every media id created is written BEFORE the first
// write. Undo is productDeleteMedia with those ids.
//
// Usage:
//   node tools/attach-brooks-images.mjs
//   node tools/attach-brooks-images.mjs --apply
//   node tools/attach-brooks-images.mjs --include-archived --apply
//   node tools/attach-brooks-images.mjs --limit 5 --apply      # try a few first
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const INCLUDE_ARCHIVED = argv.includes('--include-archived');
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = parseInt(argOf('--limit', '0'), 10) || 0;

const HOST = 'https://epicurobrooksimages.epicurosaas.com/images/products';
// Lateral first: the flat side profile is the featured image. Must match
// BROOKS_ANGLES in product-enrichment.js, or a product created by Stage 4 and
// one repaired by this tool would lead with different shots.
const ANGLES = [
  { suffix: 'l', word: 'lateral' }, { suffix: 'a', word: 'angle' }, { suffix: 'm', word: 'medial' },
  { suffix: 'h', word: 'heel' }, { suffix: 'o', word: 'top' }, { suffix: 's', word: 'sole' },
];
// NO QUERY STRING: any parameter routes the request through the CDN's resizer,
// which re-encodes the 2048px master down to about 166 KB.
const urlFor = (code, suffix) => `${HOST}/brooks__${code}__${suffix}.jpg`;
const codeFromSku = (sku) => { const m = /^(\d{6})\d{3}-(\d{3})-/.exec(String(sku || '').trim()); return m ? m[1] + m[2] : ''; };

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

const SCAN = `query($cursor:String){products(first:250,after:$cursor,query:"vendor:Brooks"){
  pageInfo{hasNextPage endCursor}
  nodes{id handle title status productType createdAt totalInventory
    media(first:1){nodes{id}} variants(first:100){nodes{sku}}}}}`;

const RECHECK = `query($id:ID!){product(id:$id){id handle title status
  media(first:1){nodes{id}}}}`;

const CREATE = `mutation($id:ID!,$media:[CreateMediaInput!]!){
  productCreateMedia(productId:$id,media:$media){
    media{ ... on MediaImage { id fileStatus } }
    mediaUserErrors{field message code}
    product{id}}}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function head(url) {
  for (let a = 1; a <= 3; a++) {
    try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; }
    catch { if (a === 3) return false; await sleep(300 * a); }
  }
  return false;
}

async function main() {
  let cursor = null; const all = [];
  for (;;) {
    const b = await client.graphql(SCAN, { cursor });
    const c = b.data.products; all.push(...c.nodes);
    process.stderr.write(`  scanned ${all.length}\r`);
    if (!c.pageInfo.hasNextPage) break;
    cursor = c.pageInfo.endCursor;
  }
  process.stderr.write(' '.repeat(40) + '\r');

  const skipped = { hasMedia: 0, archived: 0, noCode: 0, mixedCode: 0, noPhotos: 0 };
  const candidates = [];
  for (const p of all) {
    if ((p.media?.nodes || []).length) { skipped.hasMedia++; continue; }
    if (p.status === 'ARCHIVED' && !INCLUDE_ARCHIVED) { skipped.archived++; continue; }
    const codes = [...new Set((p.variants?.nodes || []).map((v) => codeFromSku(v.sku)).filter(Boolean))];
    if (!codes.length) { skipped.noCode++; continue; }
    // Variants disagreeing about the colorway means the code is a guess, and a
    // guess here attaches another shoe's photography.
    if (codes.length > 1) { skipped.mixedCode++; continue; }
    candidates.push({ ...p, code: codes[0] });
  }

  process.stderr.write('  checking which angles exist...\r');
  let i = 0;
  const targets = [];
  const worker = async () => {
    for (;;) {
      const c = candidates[i++]; if (!c) return;
      const found = [];
      for (const a of ANGLES) if (await head(urlFor(c.code, a.suffix))) found.push(a);
      if (found.length) targets.push({ ...c, angles: found }); else skipped.noPhotos++;
      process.stderr.write(`  checking angles ${targets.length + skipped.noPhotos}/${candidates.length}\r`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  process.stderr.write(' '.repeat(50) + '\r');

  targets.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const picked = LIMIT ? targets.slice(0, LIMIT) : targets;

  const byStatus = {};
  for (const t of picked) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  console.log(`\n${picked.length} product(s) to give photos, ${picked.reduce((n, t) => n + t.angles.length, 0)} images.`);
  console.log('   by status:', JSON.stringify(byStatus));
  console.log('   units unblocked:', picked.reduce((n, t) => n + (t.totalInventory || 0), 0).toLocaleString());
  console.log('   skipped:', JSON.stringify(skipped));
  console.log('\nSample:');
  for (const t of picked.slice(0, 10)) {
    console.log(`   ${t.code}  ${t.status.padEnd(7)} ${String(t.angles.length)} pics  ${t.title.slice(0, 54)}`);
  }
  if (picked.length > 10) console.log(`   ... and ${picked.length - 10} more`);
  if (!picked.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to attach photos to these ${picked.length} product(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `brooks-media-rollback-${stamp}.json`);
  const record = { note: 'Media ADDED to products that had none. Undo: productDeleteMedia with these mediaIds.', products: [] };
  fs.writeFileSync(file, JSON.stringify(record, null, 1));
  console.log(`\nRollback record at ${path.basename(file)}, written before the first write and updated as it goes.`);

  let done = 0, failed = 0, skippedLive = 0, images = 0;
  for (const t of picked) {
    // Re-read live. A scan is not good enough to write on.
    const fresh = (await client.graphql(RECHECK, { id: t.id })).data.product;
    if (!fresh) { skippedLive++; console.log(`  SKIP ${t.handle}: gone`); continue; }
    if ((fresh.media?.nodes || []).length) { skippedLive++; console.log(`  SKIP ${t.handle}: it has media now`); continue; }
    if (fresh.status === 'ARCHIVED' && !INCLUDE_ARCHIVED) { skippedLive++; console.log(`  SKIP ${t.handle}: archived now`); continue; }

    const media = t.angles.map((a) => ({
      originalSource: urlFor(t.code, a.suffix),
      mediaContentType: 'IMAGE',
      alt: `${t.title} ${a.word}`,
    }));
    try {
      const r = await client.graphql(CREATE, { id: t.id, media });
      const errs = r.data?.productCreateMedia?.mediaUserErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${t.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      const made = (r.data.productCreateMedia.media || []).map((m) => m.id);
      images += made.length; done++;
      record.products.push({ id: t.id, handle: t.handle, title: t.title, code: t.code, mediaIds: made });
      fs.writeFileSync(file, JSON.stringify(record, null, 1));
    } catch (e) {
      failed++; console.log(`  FAIL ${t.handle}: ${String(e.message).slice(0, 140)}`);
    }
    if ((done + failed) % 10 === 0) process.stderr.write(`  ${done}/${picked.length}\r`);
  }
  process.stderr.write(' '.repeat(40) + '\r');
  console.log(`\nAttached ${images} images to ${done} product(s). Skipped live ${skippedLive}, failed ${failed}.`);
  console.log('Shopify fetches each image asynchronously. Re-run without --apply in a minute to confirm none are still bare.');
}

main().catch((e) => { console.error(e); process.exit(1); });
