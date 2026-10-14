// set-shoe-taxable.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Unticks "Charge tax on this product" on FOOTWEAR variants priced under the
// Massachusetts exemption threshold of $175, and leaves every variant at or
// above it alone.
//
// WHY THE SPLIT. Massachusetts exempts footwear only up to $175 PER ITEM and
// taxes the part above it, so a $200 shoe genuinely owes tax on $25. The flag
// is all or nothing, so unticking it on a $200 shoe stops collecting tax that
// is actually due. Unticking it under $175 costs nothing in MA, because the
// exemption already brings that line to zero.
//
// WHAT IT DOES NOT DO. Orders through Shopify's Shop app are taxed by Shopify
// as a marketplace facilitator, not by this setting: measured over orders since
// 2026-06-01, Shop charged tax on 94 percent of shoe lines that already had the
// box unticked. Nor does it change anything for the online store outside
// Massachusetts, which collects nothing today because the shop is not
// registered anywhere else. The flag's only measurable effect is MA at $175+,
// which is exactly what this tool leaves untouched.
//
// THE CATEGORY IS THE REAL EXEMPTION and must stay set. Shopify applies the MA
// footwear rule from the product category, which is why 80 shoe lines were
// over-taxed until the category backfill on 2026-09-18 and none have been
// since. This tool never touches the category, see tools/set-shoe-category.mjs.
//
// SAFETY, in order:
//   1. Dry run by default. --apply is the only way to write.
//   2. ONE FIELD. Only variant.taxable is written, through
//      productVariantsBulkUpdate. Price, SKU, inventory and category are never
//      in the payload.
//   3. THRESHOLD GUARD. A variant at or above --threshold is skipped and
//      counted, so the taxable part of a MA sale keeps being collected.
//   4. ACTIVE and DRAFT only. Archived products are left as they are.
//   5. A rollback file holding every variant's PRIOR value is written BEFORE
//      the first write, and --restore replays it exactly.
//
// Usage:
//   node tools/set-shoe-taxable.mjs                       # dry run
//   node tools/set-shoe-taxable.mjs --apply
//   node tools/set-shoe-taxable.mjs --threshold 175 --apply
//   node tools/set-shoe-taxable.mjs --restore shoe-taxable-rollback-<stamp>.json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const THRESHOLD = parseFloat(arg('--threshold', '175'));
const RESTORE = arg('--restore', null);
const TAGGABLE = { ACTIVE: true, DRAFT: true };

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(loadDevVars());

const PRODUCTS = `query($a: String) {
  products(first: 40, after: $a, query: "product_type:*Shoes*") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status productType
      category { fullName }
      variants(first: 100) {
        pageInfo { hasNextPage }
        nodes { id title price taxable }
      }
    }
  }
}`;

// productVariantsBulkUpdate is the only supported way to write a variant field
// since productVariantUpdate was removed. One call per product, all its
// variants in one payload, which also keeps the request count down.
const BULK_UPDATE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    userErrors { field message }
  }
}`;

async function fetchShoes() {
  const out = [];
  let after = null;
  let truncated = 0;
  for (;;) {
    const r = await client.graphql(PRODUCTS, { a: after });
    const page = r.data.products;
    for (const p of page.nodes) {
      if (p.variants.pageInfo.hasNextPage) truncated++;
      out.push(p);
    }
    process.stderr.write(`  read ${out.length} products\r`);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  process.stderr.write(' '.repeat(32) + '\r');
  // A product with more than 100 variants would be read short, which would
  // silently leave some variants untouched. Say so rather than hide it.
  if (truncated) console.log(`WARNING: ${truncated} product(s) have more than 100 variants and were read short.`);
  return out;
}

function plan(products) {
  const plans = [];
  const skipped = { archived: 0, aboveThreshold: 0, alreadyOff: 0, noPrice: 0 };
  for (const p of products) {
    if (!TAGGABLE[p.status]) { skipped.archived += p.variants.nodes.length; continue; }
    const variants = [];
    for (const v of p.variants.nodes) {
      const price = parseFloat(v.price);
      if (!isFinite(price)) { skipped.noPrice++; continue; }
      if (price >= THRESHOLD) { skipped.aboveThreshold++; continue; }
      if (v.taxable === false) { skipped.alreadyOff++; continue; }
      variants.push({ id: v.id, title: v.title, price });
    }
    if (variants.length) plans.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, variants });
  }
  return { plans, skipped };
}

async function restore(file) {
  const data = JSON.parse(fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8'));
  console.log(`Restoring ${data.products.length} product(s) from ${path.basename(file)}.`);
  if (!APPLY) { console.log('DRY RUN. Pass --apply to write the previous values back.'); return; }
  let done = 0, failed = 0;
  for (const p of data.products) {
    const variants = p.variants.map((v) => ({ id: v.id, taxable: v.wasTaxable }));
    try {
      const r = await client.graphql(BULK_UPDATE, { productId: p.id, variants });
      const errs = r.data?.productVariantsBulkUpdate?.userErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${p.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      done++;
    } catch (e) { failed++; console.log(`  FAIL ${p.handle}: ${e.message.slice(0, 120)}`); }
  }
  console.log(`Restored ${done} product(s), ${failed} failed.`);
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  console.log(`Reading footwear from Shopify. Threshold ${THRESHOLD.toFixed(2)}.`);
  const products = await fetchShoes();
  console.log(`${products.length} product(s) with a footwear type.`);

  const { plans, skipped } = plan(products);
  const variantCount = plans.reduce((n, p) => n + p.variants.length, 0);

  console.log('\nPLAN');
  console.log(`   ${String(variantCount).padStart(6)}  variants to untick, across ${plans.length} product(s)`);
  console.log(`   ${String(skipped.aboveThreshold).padStart(6)}  left ticked, priced ${THRESHOLD} or over, MA taxes the excess`);
  console.log(`   ${String(skipped.alreadyOff).padStart(6)}  already unticked`);
  console.log(`   ${String(skipped.archived).padStart(6)}  archived, not touched`);
  if (skipped.noPrice) console.log(`   ${String(skipped.noPrice).padStart(6)}  no readable price, skipped`);

  console.log('\nSample:');
  for (const p of plans.slice(0, 6)) {
    console.log(`   ${p.title.slice(0, 60)}  [${p.status}]`);
    console.log(`      ${p.variants.length} variant(s), e.g. ${p.variants[0].title} at $${p.variants[0].price.toFixed(2)}`);
  }

  if (!plans.length) { console.log('\nNothing to do.'); return; }
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to untick ${variantCount} variant(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `shoe-taxable-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'Charge-tax flag turned OFF on footwear variants under the threshold. Undo with --restore on this file, which writes wasTaxable back.',
    threshold: THRESHOLD,
    products: plans.map((p) => ({ id: p.id, handle: p.handle, variants: p.variants.map((v) => ({ id: v.id, price: v.price, wasTaxable: true })) })),
  }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let done = 0, failed = 0;
  for (const p of plans) {
    const variants = p.variants.map((v) => ({ id: v.id, taxable: false }));
    try {
      const r = await client.graphql(BULK_UPDATE, { productId: p.id, variants });
      const errs = r.data?.productVariantsBulkUpdate?.userErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${p.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      done++;
    } catch (e) { failed++; console.log(`  FAIL ${p.handle}: ${e.message.slice(0, 120)}`); }
    if ((done + failed) % 50 === 0) process.stderr.write(`  ${done + failed}/${plans.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nUnticked ${done} product(s), ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
