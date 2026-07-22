// backfill-saucony-barcodes.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Fills in barcodes on Saucony variants that have none. Saucony's loadUPCs was
// never wired to a dropzone, so the old ATS export carried no barcodes at all
// and every product built from it went to Shopify bare. The Catalog UPCs export
// has a UPC on every size row, so they can be filled in now.
//
// Barcodes are what the in-store scanner reads, so a bare variant is a shoe that
// cannot be scanned at the till.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. ONLY variants whose barcode is currently empty are touched. An existing
//      barcode is never overwritten, however wrong it might look: this tool
//      fills gaps, it does not arbitrate disagreements.
//   3. The style comes from the variant's own SKU and the width from the
//      product title, so the feed lookup is exact. A style/width the feed does
//      not carry is skipped rather than guessed at, because the wrong barcode
//      is worse than none: it scans as a different shoe.
//   4. Nothing but the barcode changes. Size, SKU, price and inventory are all
//      left alone.
//   5. Rollback file written before the first mutation. Since every change is
//      empty to non-empty, rolling back means clearing exactly those barcodes.
//
// Reads the same saucony-feed-sizes.json as add-saucony-missing-variants.mjs.
// See that file's header for how to derive it from the Catalog UPCs export.
//
// Run:  node tools/backfill-saucony-barcodes.mjs                # dry run
//       node tools/backfill-saucony-barcodes.mjs --apply
//       node tools/backfill-saucony-barcodes.mjs --rollback <file> --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const QUERY = `
query($cursor: String) {
  products(first: 50, after: $cursor, query: "vendor:Saucony") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status
      variants(first: 100) { nodes { id sku barcode selectedOptions { name value } } }
    }
  }
}`;

const UPDATE = `
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id barcode }
    userErrors { field message }
  }
}`;

const sizeOf = (v) => {
  const o = (v.selectedOptions || []).find((x) => /size/i.test(x.name)) || (v.selectedOptions || [])[0];
  return o ? o.value : '';
};
// Numeric size for a variant. Unisex is a dual label written in men's numbers,
// which is the number the feed's Dim 1 holds, so take the men's side.
const numSize = (label) => {
  const dualM = /^M(\d+(?:\.\d+)?)\s*\//.exec(String(label || ''));
  if (dualM) return parseFloat(dualM[1]);
  const plain = /^(\d+(?:\.\d+)?)$/.exec(String(label || '').trim());
  return plain ? parseFloat(plain[1]) : null;
};
// Width from the title, matching the converter's own labelling.
const widthOf = (title) => /extra wide/i.test(title) ? 'XW' : (/\bwide\b/i.test(title) ? 'W' : 'M');
const STYLE_RE = /^(S\d+-\d+)-/;
const styleOf = (p) => {
  for (const v of p.variants?.nodes || []) {
    const m = STYLE_RE.exec(String(v.sku || ''));
    if (m) return m[1];
  }
  return null;
};

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
  const n = entries.reduce((t, e) => t + e.fills.length, 0);
  console.log(`Clearing ${n} barcodes across ${entries.length} products${apply ? '' : ' (DRY RUN)'}`);
  console.log('Every one of these was empty before the run, so clearing restores the before-state.\n');
  for (const e of entries) {
    console.log(`  ${e.handle}: ${e.fills.length} variants`);
    if (!apply) continue;
    const r = await client.graphql(UPDATE, { productId: e.id, variants: e.fills.map((f) => ({ id: f.id, barcode: '' })) });
    const ue = r.data.productVariantsBulkUpdate.userErrors;
    if (ue.length) console.log('    FAIL ' + JSON.stringify(ue));
  }
  console.log(apply ? '\nRolled back.' : '\nDry run, nothing written. Add --apply.');
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const rbArg = argv.indexOf('--rollback');
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  const feedArg = argv.indexOf('--feed');
  const feedPath = feedArg >= 0 ? argv[feedArg + 1] : path.join(ROOT, 'saucony-feed-sizes.json');
  if (!fs.existsSync(feedPath)) throw new Error(`feed file not found: ${feedPath}\nSee add-saucony-missing-variants.mjs for how to derive it.`);
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));

  process.stderr.write('Fetching Saucony products...\n');
  const products = await fetchAll(client);

  const plans = []; const skipped = {};
  let alreadyHave = 0;
  for (const p of products) {
    const style = styleOf(p);
    if (!style) { skipped['no style code in any SKU'] = (skipped['no style code in any SKU'] || 0) + 1; continue; }
    const key = style + '|' + widthOf(p.title);
    const rows = feed[key];
    if (!rows) { skipped['style/width not in the feed'] = (skipped['style/width not in the feed'] || 0) + 1; continue; }
    const byNum = new Map();
    for (const r of rows) { const n = parseFloat(r.dim1); if (n > 0 && r.upc) byNum.set(n, r.upc); }

    const fills = [];
    for (const v of p.variants?.nodes || []) {
      if (String(v.barcode || '').trim()) { alreadyHave++; continue; }   // never overwrite
      const n = numSize(sizeOf(v));
      if (n === null) continue;
      const upc = byNum.get(n);
      if (!upc) continue;
      fills.push({ id: v.id, size: sizeOf(v), sku: v.sku, barcode: upc });
    }
    if (!fills.length) { skipped['nothing to fill'] = (skipped['nothing to fill'] || 0) + 1; continue; }
    plans.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, key, fills });
  }

  console.log(`\nPLAN: ${plans.length} products${apply ? '' : '  (DRY RUN, nothing is written)'}\n`);
  for (const p of plans.slice(0, 25)) {
    console.log(`  [${p.status}] ${p.title}   (${p.key})`);
    console.log(`      ${p.fills.length} variants: ` + p.fills.slice(0, 4).map((f) => `${f.size}=${f.barcode}`).join('  ') + (p.fills.length > 4 ? '  ...' : ''));
  }
  if (plans.length > 25) console.log(`  ...and ${plans.length - 25} more`);
  const tot = plans.reduce((t, p) => t + p.fills.length, 0);
  console.log(`\n  ${plans.length} products, ${tot} barcodes to fill. ${alreadyHave} variants already had one and are untouched.`);
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped)) console.log(`  ${n}  ${why}`);
  }

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `saucony-barcode-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans, null, 2));
  console.log(`\nRollback file: ${rbFile}\n`);

  let done = 0, failed = 0, n = 0;
  for (const p of plans) {
    try {
      const r = await client.graphql(UPDATE, { productId: p.id, variants: p.fills.map((f) => ({ id: f.id, barcode: f.barcode })) });
      const ue = r.data.productVariantsBulkUpdate.userErrors;
      if (ue.length) throw new Error(JSON.stringify(ue));
      done++; n += p.fills.length;
      if (plans.length <= 40) console.log(`  ok  ${p.handle}  (+${p.fills.length})`);
      else if (done % 25 === 0) console.log(`  ...${done}/${plans.length}`);
      await throttle(client, r);
    } catch (err) { failed++; console.log(`  FAIL ${p.handle}: ${err.message}`); }
  }
  console.log(`\nFilled ${n} barcodes on ${done} products, failed ${failed}.`);
  console.log(`Undo with: node tools/backfill-saucony-barcodes.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
