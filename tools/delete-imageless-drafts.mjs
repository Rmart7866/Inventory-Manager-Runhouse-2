// delete-imageless-drafts.mjs, The Run House. DRY RUN unless you pass --apply.
//
// DELETES draft footwear that has stock but no image, so it can be recreated
// through Stage 4 with photos attached. Deletion is PERMANENT: Shopify has no
// undo, so everything here exists to make sure only the intended products go.
//
// WHY DELETE RATHER THAN FIX IN PLACE. These are Stage 4 creations from before
// the image pipeline existed. They carry stock the inventory sync keeps writing,
// but no photo, so they cannot be published: a bare listing is worse than no
// listing. Recreating them through the current path gives them their gallery,
// their specs and their tags in one pass, and frees the handle to be reused.
//
// THE FOUR THINGS THAT MAKE THIS SAFE, all re-checked live per product
// immediately before the delete, never trusted from a snapshot:
//   1. status is DRAFT
//   2. it has NO media at all, not merely no featured image
//   3. it has NEVER been published to any channel, and publishedAt is null.
//      A product that was never on a channel could never have been bought,
//      online or in store, which is the strongest evidence there is no order
//      history to break.
//   4. the vendor is one you asked for (--vendor, repeatable)
// Anything that fails a check is skipped and reported, not deleted.
//
// A record of every product, its handle, title, variant SKUs and inventory is
// written BEFORE the first delete. That file is the only trace left afterwards,
// so keep it until the products are recreated.
//
// A NOTE ON CHECKING ORDER HISTORY BY SKU: do not. New Balance shares one
// colorway code across widths, so `sku:M8607B2` matches the live standard width
// product as well as every draft width. That produced three false positives when
// this set was audited. The publication check above is the reliable signal.
//
// Usage:
//   node tools/delete-imageless-drafts.mjs --vendor HOKA --vendor "New Balance" --vendor ASICS
//   node tools/delete-imageless-drafts.mjs --vendor HOKA --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VENDORS = argv.reduce((a, x, i) => (x === '--vendor' && argv[i + 1] ? a.concat(argv[i + 1]) : a), []);
if (!VENDORS.length) { console.error('Refusing to run with no --vendor. Name the brands explicitly.'); process.exit(1); }
// Vendor spellings vary in this catalogue (HOKA and Hoka, ASICS and Asics).
const wanted = new Set(VENDORS.map((v) => v.toLowerCase()));

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

const SCAN = `query($cursor: String) {
  products(first: 250, after: $cursor, query: "status:draft") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title vendor productType status totalInventory createdAt publishedAt
      media(first: 1) { nodes { id } }
      resourcePublications(first: 12) { nodes { isPublished } }
      variants(first: 100) { nodes { sku inventoryQuantity } }
    }
  }
}`;

const RECHECK = `query($id: ID!) {
  product(id: $id) {
    id handle title vendor status publishedAt
    media(first: 1) { nodes { id } }
    resourcePublications(first: 12) { nodes { isPublished } }
  }
}`;

const DELETE = `mutation($input: ProductDeleteInput!) {
  productDelete(input: $input) { deletedProductId userErrors { field message } }
}`;

const isShoe = (p) => (p.productType || '').toLowerCase().endsWith('shoes');
const neverPublished = (p) => !p.publishedAt && !(p.resourcePublications?.nodes || []).some((x) => x.isPublished);
const hasNoMedia = (p) => !(p.media?.nodes || []).length;

async function main() {
  let cursor = null; const all = [];
  for (;;) {
    const b = await client.graphql(SCAN, { cursor });
    const conn = b.data.products; all.push(...conn.nodes);
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    process.stderr.write(`  scanned ${all.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');

  const targets = all.filter((p) =>
    isShoe(p) && (p.totalInventory || 0) > 0 && hasNoMedia(p)
    && neverPublished(p) && wanted.has((p.vendor || '').toLowerCase()));

  const byVendor = {};
  for (const p of targets) byVendor[p.vendor] = (byVendor[p.vendor] || 0) + 1;
  console.log(`\n${targets.length} product(s) to DELETE PERMANENTLY.`);
  console.log('   by vendor:', JSON.stringify(byVendor));
  console.log('   units:', targets.reduce((t, p) => t + (p.totalInventory || 0), 0).toLocaleString());
  console.log('   variants:', targets.reduce((t, p) => t + p.variants.nodes.length, 0));
  console.log('\nSample:');
  for (const p of targets.slice(0, 10)) {
    console.log(`   ${String(p.totalInventory).padStart(5)}  ${(p.vendor || '?').padEnd(12)} ${p.title.slice(0, 56)}`);
  }
  if (targets.length > 10) console.log(`   ... and ${targets.length - 10} more`);
  if (!targets.length) return;

  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to delete these ${targets.length} product(s). THIS CANNOT BE UNDONE.`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `deleted-drafts-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'Products PERMANENTLY DELETED. There is no undo. This file is the only record: recreate them through Stage 4 from the supplier feed using the handles and SKUs below.',
    vendors: VENDORS,
    products: targets.map((p) => ({
      id: p.id, handle: p.handle, title: p.title, vendor: p.vendor,
      totalInventory: p.totalInventory, createdAt: p.createdAt,
      skus: p.variants.nodes.map((v) => v.sku).filter(Boolean),
    })),
  }, null, 1));
  console.log(`\nRecord written to ${path.basename(file)} BEFORE the first delete. Keep it.`);

  let deleted = 0, skipped = 0, failed = 0;
  for (const p of targets) {
    // Re-read live. A snapshot is not good enough to delete on.
    const fresh = (await client.graphql(RECHECK, { id: p.id })).data.product;
    if (!fresh) { skipped++; console.log(`  SKIP ${p.handle}: gone already`); continue; }
    if (fresh.status !== 'DRAFT') { skipped++; console.log(`  SKIP ${p.handle}: status is now ${fresh.status}`); continue; }
    if (!hasNoMedia(fresh)) { skipped++; console.log(`  SKIP ${p.handle}: it has media now`); continue; }
    if (!neverPublished(fresh)) { skipped++; console.log(`  SKIP ${p.handle}: it has been published`); continue; }
    if (!wanted.has((fresh.vendor || '').toLowerCase())) { skipped++; console.log(`  SKIP ${p.handle}: vendor is now ${fresh.vendor}`); continue; }

    const r = await client.graphql(DELETE, { input: { id: p.id } });
    const errs = r.data?.productDelete?.userErrors || [];
    if (errs.length) { failed++; console.log(`  FAIL ${p.handle}: ${errs.map((e) => e.message).join('; ')}`); }
    else deleted++;
    if ((deleted + failed + skipped) % 10 === 0) process.stderr.write(`  ${deleted}/${targets.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nDeleted ${deleted}, skipped ${skipped}, failed ${failed}.`);
  console.log('Run Refresh in the tool, then recreate them through Stage 4 with images.');
}

main().catch((e) => { console.error(e); process.exit(1); });
