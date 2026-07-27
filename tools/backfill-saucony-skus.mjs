// backfill-saucony-skus.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Fills in SKUs (and barcodes) on Saucony products that were created without any
// variant SKU at all. About 100 Saucony products live on the store with blank
// SKUs, created by an early tool version that wrote the title but never the SKU.
// They carry NO style code in the title, only a colour NAME, so the barcode and
// missing-variant tools (which key off the variant's own SKU) can never see
// them. This one matches by COLORWAY instead: model + gender + width + colour,
// derived from the title with the very same CatalogClient.colorwayKeyFromTitle
// the detection path uses, so the feed side and the store side key identically.
//
// A blank SKU is why these products reappear as "new" every scan and why the
// inventory sync has no key to write stock against. Giving them the SKU the
// pipeline would have written makes them matchable and sellable again.
//
// SCOPE, deliberately narrow:
//   1. Dry run by default. --apply is the only way to write.
//   2. ONLY products whose colorway is in the CURRENT feed are touched. That is
//      what limits this to current models (Ride 19, Endorphin Pro 5, Speed 5,
//      ...). A discontinued shell is not in the feed, so it is skipped, never
//      guessed at. There is no current feed row to give it a SKU anyway.
//   3. DUPLICATE GUARD. If the same colorway already exists on a SKU'd product,
//      the SKU-less one is a duplicate. Backfilling it would mint a colliding
//      SKU, so it is skipped and reported as an archive candidate, not written.
//   4. Every SKU and barcode comes from the feed. Style number + the pipeline's
//      own size label build the SKU (STYLE-COLOR-SIZE); the UPC is the barcode.
//      Nothing is invented. A variant whose size is not in the feed is left as
//      is rather than guessed.
//   5. An existing barcode is never overwritten. SKUs are only ever SET on blank
//      variants (a target has no SKU by definition), never changed.
//   6. Product type is corrected too: many of these are typed "Running Shoes",
//      which is outside dropship scope, so they would not sync even with a SKU.
//      The type is set to the gendered "Men's/Women's/Unisex Shoes" the rest of
//      the catalog uses. Original type is saved for rollback.
//   7. Rollback file written before the first mutation. Undo clears exactly the
//      SKUs and barcodes this run set and restores the original product type.
//
// PREREQ: python3 tools/build-saucony-colorway-feed.py   (writes the feed json)
//
// Run:  node tools/backfill-saucony-skus.mjs                 # dry run
//       node tools/backfill-saucony-skus.mjs --apply
//       node tools/backfill-saucony-skus.mjs --rollback <file> --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const require = createRequire(import.meta.url);
const CatalogClient = require(path.join(ROOT, 'catalog-client.js'));

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  env.SHOP_URL = env.SHOP_URL || 'therunhouse.myshopify.com';
  env.API_VERSION = env.API_VERSION || '2026-01';
  return env;
}

// ===== the pipeline's own size + SKU logic, ported verbatim from saucony-converter.js
const genderFromSizeRun = (minSize) => {
  if (!(minSize > 0)) return 'men';
  if (minSize <= 4.0) return 'unisex';
  if (minSize <= 5.5) return 'women';
  return 'men';
};
const formatSize = (n) => Number(n).toFixed(1);
const sizeLabel = (genderType, dim1) => {
  const n = parseFloat(dim1);
  if (!(n > 0)) return String(dim1 || '').trim();
  if (genderType === 'unisex') return 'M' + formatSize(n) + '/W' + formatSize(n + 1.5);
  return formatSize(n);
};
const skuFor = (style, label) => style + '-' + label.replace(/\//g, '-');
const GENDER_PREFIX = { men: "Men's", women: "Women's", unisex: 'Unisex' };
const GENDER_TYPE = { men: "Men's Shoes", women: "Women's Shoes", unisex: 'Unisex Shoes' };
const WIDTH_WORD = { M: '', W: ' Wide', XW: ' Extra Wide' };

// Numeric size for a Shopify variant label. Unisex dual "M8.0/W9.5" -> 8.0.
const numSize = (label) => {
  const dualM = /^M(\d+(?:\.\d+)?)\s*\//.exec(String(label || ''));
  if (dualM) return parseFloat(dualM[1]);
  const plain = /^(\d+(?:\.\d+)?)$/.exec(String(label || '').trim());
  return plain ? parseFloat(plain[1]) : null;
};
const sizeOf = (v) => {
  const o = (v.selectedOptions || []).find((x) => /size/i.test(x.name)) || (v.selectedOptions || [])[0];
  return o ? o.value : '';
};

// Build the colorway index from the feed. key -> { styleNumber, genderType,
// productType, sizesByNum: Map(number -> {label, sku, upc}) }.
function buildFeedIndex(feed) {
  const idx = new Map();
  let collisions = 0;
  for (const rec of feed) {
    const nums = rec.sizes.map((s) => parseFloat(s.dim1)).filter((n) => n > 0);
    const gt = genderFromSizeRun(nums.length ? Math.min(...nums) : 0);
    const widthWord = WIDTH_WORD[rec.width] || '';
    // Synthesize the exact title shape the store carries, so the key matches the
    // Shopify side through the identical colorwayKeyFromTitle normalization.
    const title = `${GENDER_PREFIX[gt]} Saucony ${rec.productName} - ${rec.colorName}${widthWord}`;
    const key = CatalogClient.colorwayKeyFromTitle(title, 'Saucony');
    if (!key) continue;
    const sizesByNum = new Map();
    for (const s of rec.sizes) {
      const n = parseFloat(s.dim1);
      if (!(n > 0)) continue;
      const label = sizeLabel(gt, s.dim1);
      sizesByNum.set(n, { label, sku: skuFor(rec.styleNumber, label), upc: String(s.upc || '').trim() });
    }
    if (idx.has(key)) { collisions++; continue; } // first record wins; distinct colorways should not collide
    idx.set(key, { styleNumber: rec.styleNumber, genderType: gt, productType: GENDER_TYPE[gt], sizesByNum });
  }
  return { idx, collisions };
}

const QUERY = `
query($cursor: String) {
  products(first: 50, after: $cursor, query: "vendor:Saucony") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status productType
      variants(first: 100) { nodes { id sku barcode selectedOptions { name value } } }
    }
  }
}`;

const UPDATE_VARIANTS = `
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id sku barcode }
    userErrors { field message }
  }
}`;

const UPDATE_PRODUCT = `
mutation($input: ProductInput!) {
  productUpdate(input: $input) { product { id productType } userErrors { field message } }
}`;

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

async function fetchAll(client) {
  const out = []; let cursor = null;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor });
    out.push(...body.data.products.nodes);
    await throttle(client, body);
    if (!body.data.products.pageInfo.hasNextPage) break;
    cursor = body.data.products.pageInfo.endCursor;
  }
  return out;
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Rolling back ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  for (const e of entries) {
    console.log(`  ${e.handle}: clear ${e.fills.length} SKUs` + (e.typeFrom != null ? `, type -> ${e.typeFrom}` : ''));
    if (!apply) continue;
    if (e.fills.length) {
      const variants = e.fills.map((f) => ({ id: f.id, inventoryItem: { sku: '' }, ...(f.barcodeSet ? { barcode: '' } : {}) }));
      const r = await client.graphql(UPDATE_VARIANTS, { productId: e.id, variants });
      const ue = r.data.productVariantsBulkUpdate.userErrors;
      if (ue.length) console.log('    FAIL variants ' + JSON.stringify(ue));
      await throttle(client, r);
    }
    if (e.typeFrom != null) {
      const r = await client.graphql(UPDATE_PRODUCT, { input: { id: e.id, productType: e.typeFrom } });
      const ue = r.data.productUpdate.userErrors;
      if (ue.length) console.log('    FAIL type ' + JSON.stringify(ue));
      await throttle(client, r);
    }
  }
  console.log(apply ? '\nRolled back.' : '\nDry run, nothing written. Add --apply.');
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const rbArg = argv.indexOf('--rollback');
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  const feedPath = path.join(ROOT, 'saucony-colorway-feed.json');
  if (!fs.existsSync(feedPath)) throw new Error(`feed not found: ${feedPath}\nRun: python3 tools/build-saucony-colorway-feed.py`);
  const { idx: feed, collisions } = buildFeedIndex(JSON.parse(fs.readFileSync(feedPath, 'utf8')));
  console.log(`Feed: ${feed.size} colorways${collisions ? ` (${collisions} key collisions skipped)` : ''}`);

  process.stderr.write('Fetching Saucony products...\n');
  const products = await fetchAll(client);

  // Colorway keys that already carry a SKU, so a SKU-less match is a duplicate.
  const skuedKeys = new Map();
  for (const p of products) {
    if (!(p.variants?.nodes || []).some((v) => v.sku && v.sku.trim())) continue;
    const k = CatalogClient.colorwayKeyFromTitle(p.title, 'Saucony');
    if (k && !skuedKeys.has(k)) skuedKeys.set(k, p.handle);
  }

  const plans = []; const skipped = {};
  const bump = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  for (const p of products) {
    const vs = p.variants?.nodes || [];
    if (vs.some((v) => v.sku && v.sku.trim())) continue;            // has SKUs, not a target
    if (p.status !== 'ACTIVE' && p.status !== 'DRAFT') { bump('archived (retired), left alone'); continue; }
    const key = CatalogClient.colorwayKeyFromTitle(p.title, 'Saucony');
    if (!key) { bump('no colorway key derivable from title'); continue; }
    const rec = feed.get(key);
    if (!rec) { bump('colorway not in current feed (discontinued), skipped'); continue; }
    if (skuedKeys.has(key)) { bump('DUPLICATE of a SKU-d product (archive candidate, not backfilled)'); continue; }

    const fills = [];
    let unmatched = 0;
    for (const v of vs) {
      const n = numSize(sizeOf(v));
      const fs2 = n == null ? null : rec.sizesByNum.get(n);
      if (!fs2) { unmatched++; continue; }
      const setBarcode = !String(v.barcode || '').trim() && !!fs2.upc; // never overwrite a barcode
      fills.push({ id: v.id, size: sizeOf(v), sku: fs2.sku, barcode: setBarcode ? fs2.upc : null, barcodeSet: setBarcode });
    }
    // Correct the product type when it is not the gendered "* Shoes" type.
    const typeFrom = (p.productType !== rec.productType) ? (p.productType || '') : null;
    if (!fills.length && typeFrom == null) { bump('nothing to fill (no size matched, type already correct)'); continue; }
    plans.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, key, style: rec.styleNumber, fills, unmatched, typeFrom, typeTo: rec.productType });
  }

  console.log(`\nPLAN: ${plans.length} products${apply ? '' : '   (DRY RUN, nothing is written)'}\n`);
  for (const p of plans) {
    console.log(`  [${p.status}] ${p.title}`);
    console.log(`      style ${p.style}  |  ${p.fills.length} SKUs` +
      (p.typeFrom != null ? `  |  type "${p.typeFrom}" -> "${p.typeTo}"` : '  |  type ok') +
      (p.unmatched ? `  |  ${p.unmatched} variant(s) with no feed size (left as is)` : ''));
    for (const f of p.fills.slice(0, 4)) console.log(`        ${String(f.size).padEnd(12)} ${f.sku}${f.barcode ? '  bc ' + f.barcode : ''}`);
    if (p.fills.length > 4) console.log(`        ...and ${p.fills.length - 4} more`);
  }
  const totSku = plans.reduce((t, p) => t + p.fills.length, 0);
  const totType = plans.filter((p) => p.typeFrom != null).length;
  console.log(`\n  ${plans.length} products, ${totSku} SKUs to set, ${totType} product-type fixes.`);
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${why}`);
  }

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `saucony-sku-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans, null, 2));
  console.log(`\nRollback file: ${rbFile}\n`);

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      if (p.fills.length) {
        const variants = p.fills.map((f) => ({ id: f.id, inventoryItem: { sku: f.sku }, ...(f.barcode ? { barcode: f.barcode } : {}) }));
        const r = await client.graphql(UPDATE_VARIANTS, { productId: p.id, variants });
        const ue = r.data.productVariantsBulkUpdate.userErrors;
        if (ue.length) throw new Error('variants: ' + JSON.stringify(ue));
        await throttle(client, r);
      }
      if (p.typeFrom != null) {
        const r = await client.graphql(UPDATE_PRODUCT, { input: { id: p.id, productType: p.typeTo } });
        const ue = r.data.productUpdate.userErrors;
        if (ue.length) throw new Error('type: ' + JSON.stringify(ue));
        await throttle(client, r);
      }
      done++;
      console.log(`  ok  ${p.handle}  (+${p.fills.length} SKUs${p.typeFrom != null ? ', type fixed' : ''})`);
    } catch (err) { failed++; console.log(`  FAIL ${p.handle}: ${err.message}`); }
  }
  console.log(`\nDone: ${done} products updated, ${failed} failed, ${totSku} SKUs set.`);
  console.log(`Undo with: node tools/backfill-saucony-skus.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
