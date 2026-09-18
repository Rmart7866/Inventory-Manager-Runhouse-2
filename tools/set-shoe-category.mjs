// set-shoe-category.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Sets the Shopify taxonomy category "Athletic Shoes" on footwear that has no
// category, because in Massachusetts a missing category is charging customers
// tax they do not owe.
//
// THE EVIDENCE, from real orders rather than theory. MA exempts footwear under
// $175, and Shopify applies that rule FROM THE PRODUCT CATEGORY. Across MA shoe
// line items since 2026-05-01:
//
//   Apparel & Accessories > Shoes    9 under $175   0 wrongly taxed
//   Athletic Shoes                   6 under $175   0 wrongly taxed
//   (no category)                    3 under $175   2 WRONGLY TAXED
//   Uncategorized                    2 under $175   2 WRONGLY TAXED
//
// Order #87853 shows Shopify knows the whole rule, not just the threshold: a
// $180 shoe was taxed $0.31, which is ($180 - $175) x 6.25%. That is why this
// is a category fix and NOT a `taxable` flag or a price rule in code. A flag
// could not express partial tax above the threshold, and turning it off would
// also stop collecting in the states that do tax footwear.
//
// WHAT IT TOUCHES: products whose type ends in "shoes" AND whose category is
// missing or "Uncategorized". Anything already carrying a real category is left
// alone, including the 1,324 sitting at the less precise "Apparel & Accessories
// > Shoes", which tax correctly and are somebody's earlier decision.
//
// A rollback file recording each product's prior category is written BEFORE the
// first write. --restore puts them back.
//
// Usage:
//   node tools/set-shoe-category.mjs
//   node tools/set-shoe-category.mjs --apply
//   node tools/set-shoe-category.mjs --limit 5 --apply
//   node tools/set-shoe-category.mjs --restore shoe-category-rollback-<stamp>.json --apply
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
const RESTORE = argOf('--restore', '');

// Must match ATHLETIC_SHOES_CATEGORY in worker/src/products.js, which puts the
// same value on every shoe created from here on.
const ATHLETIC_SHOES = 'gid://shopify/TaxonomyCategory/aa-8-1';

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

const SCAN = `query($cursor:String){products(first:100,after:$cursor,query:"product_type:*Shoes*"){
  pageInfo{hasNextPage endCursor}
  nodes{ id handle title vendor productType status category{id fullName} }}}`;
const SET = `mutation($input:ProductInput!){productUpdate(input:$input){
  product{id category{id fullName}} userErrors{field message}}}`;

const needsCategory = (p) => !p.category || /^uncategorized$/i.test(p.category.fullName || '');

async function main() {
  if (RESTORE) {
    const rb = JSON.parse(fs.readFileSync(path.resolve(RESTORE), 'utf8'));
    console.log(`\nRestore ${rb.products.length} product(s) to their prior category.`);
    if (!APPLY) { console.log('DRY RUN. Pass --apply to restore.'); return; }
    let done = 0, failed = 0;
    for (const p of rb.products) {
      const r = await client.graphql(SET, { input: { id: p.id, category: p.wasCategoryId || null } });
      const e = r.data?.productUpdate?.userErrors || [];
      if (e.length) { failed++; console.log(`  FAIL ${p.handle}: ${e.map((x) => x.message).join('; ')}`); }
      else done++;
      if ((done + failed) % 25 === 0) process.stderr.write(`  ${done}/${rb.products.length}\r`);
    }
    process.stderr.write(' '.repeat(30) + '\r');
    console.log(`\nRestored ${done}, failed ${failed}.`);
    return;
  }

  let cur = null; const all = [];
  for (;;) {
    const r = await client.graphql(SCAN, { cursor: cur });
    const p = r.data.products; all.push(...p.nodes);
    process.stderr.write(`  scanned ${all.length}\r`);
    if (!p.pageInfo.hasNextPage) break; cur = p.pageInfo.endCursor;
  }
  process.stderr.write(' '.repeat(30) + '\r');

  const targets = all.filter(needsCategory);
  const picked = LIMIT ? targets.slice(0, LIMIT) : targets;
  const byWhy = {};
  for (const t of targets) { const k = t.category ? t.category.fullName : '(no category)'; byWhy[k] = (byWhy[k] || 0) + 1; }
  const byStatus = {};
  for (const t of targets) byStatus[t.status] = (byStatus[t.status] || 0) + 1;

  console.log(`\nshoe products scanned: ${all.length}`);
  console.log(`  already carrying a real category, LEFT ALONE: ${all.length - targets.length}`);
  console.log(`  to set to Athletic Shoes: ${targets.length}`);
  console.log('     by current value:', JSON.stringify(byWhy));
  console.log('     by status       :', JSON.stringify(byStatus));
  if (!picked.length) { console.log('\nNothing to do.'); return; }
  console.log('\nSample:');
  for (const t of picked.slice(0, 8)) console.log(`   ${t.status.padEnd(8)} ${(t.vendor || '?').padEnd(12)} ${t.title.slice(0, 48)}`);
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to categorise ${picked.length} product(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `shoe-category-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'Product category set to Athletic Shoes. Undo with --restore on this file.',
    setTo: ATHLETIC_SHOES,
    products: picked.map((p) => ({ id: p.id, handle: p.handle, title: p.title,
      wasCategoryId: p.category ? p.category.id : null, wasCategory: p.category ? p.category.fullName : null })),
  }, null, 1));
  console.log(`\nRollback written to ${path.basename(file)} BEFORE the first write.`);

  let done = 0, failed = 0;
  for (const p of picked) {
    try {
      const r = await client.graphql(SET, { input: { id: p.id, category: ATHLETIC_SHOES } });
      const e = r.data?.productUpdate?.userErrors || [];
      if (e.length) { failed++; console.log(`  FAIL ${p.handle}: ${e.map((x) => x.message).join('; ')}`); }
      else done++;
    } catch (err) { failed++; console.log(`  FAIL ${p.handle}: ${String(err.message).slice(0, 110)}`); }
    if ((done + failed) % 25 === 0) process.stderr.write(`  ${done}/${picked.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nCategorised ${done}, failed ${failed}.`);
  console.log(`Undo: node tools/set-shoe-category.mjs --restore ${path.basename(file)} --apply`);
}
main().catch((e) => { console.error(e); process.exit(1); });
