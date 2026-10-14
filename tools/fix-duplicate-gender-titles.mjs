// fix-duplicate-gender-titles.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Repairs titles that carry the gender twice, "Altra Womens Women's Experience
// Wild 3 - Gray". 23 of them are live on the site.
//
// WHY THEY EXIST. Stage 4 builds a title as brand + gender + model, and takes
// the model straight from the supplier feed. Altra's Fall 26 export already has
// the gender inside Style Name for part of the range, so the two concatenate.
// The fix belongs here rather than in the converter's title builder because
// these products are already created and live.
//
// WHICH ONE IS DROPPED. The second. The store convention is
// "<Brand> <Gender> <Model> - <Colour>", so the first gender word is in the
// right place and the duplicate inside the model name is the intruder.
//
// SAFETY:
//   1. Dry run by default, and it prints every before and after pair.
//   2. Only the title is written, through a title-only productUpdate. Handles
//      are never touched, so no URL changes and no redirects to manage.
//   3. Only products whose title actually matches the doubled pattern.
//   4. A rollback file with the previous title of every product is written
//      BEFORE the first write.
//
// Usage:
//   node tools/fix-duplicate-gender-titles.mjs --vendor Altra
//   node tools/fix-duplicate-gender-titles.mjs --vendor Altra --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VENDOR = arg('--vendor', 'Altra');

// "Altra Womens Women's Experience Wild 3" -> drop the second gender word.
const DOUBLED = /\b(mens|womens|men's|women's|unisex)\s+(mens|womens|men's|women's|unisex)\b/i;

function fixTitle(t) {
  const m = t.match(DOUBLED);
  if (!m) return null;
  const fixed = t.replace(DOUBLED, '$1').replace(/\s{2,}/g, ' ').trim();
  return fixed === t ? null : fixed;
}

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
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

const PRODUCTS = `query($a: String, $q: String) {
  products(first: 250, after: $a, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title status }
  }
}`;
const UPDATE = `mutation($input: ProductInput!) {
  productUpdate(input: $input) { userErrors { field message } }
}`;

async function main() {
  const products = [];
  let after = null;
  for (;;) {
    const r = await client.graphql(PRODUCTS, { a: after, q: `vendor:'${VENDOR}'` });
    products.push(...r.data.products.nodes);
    if (!r.data.products.pageInfo.hasNextPage) break;
    after = r.data.products.pageInfo.endCursor;
  }
  const plans = [];
  for (const p of products) {
    const fixed = fixTitle(p.title);
    if (fixed) plans.push({ id: p.id, handle: p.handle, was: p.title, now: fixed, status: p.status });
  }
  console.log(`${products.length} ${VENDOR} product(s), ${plans.length} with a doubled gender.`);
  for (const pl of plans) {
    console.log(`   ${pl.status.padEnd(7)} ${pl.was}`);
    console.log(`        -> ${pl.now}`);
  }
  if (!plans.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to rewrite these ${plans.length} title(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `title-fix-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ note: 'Titles rewritten. Undo by writing `was` back.', vendor: VENDOR, products: plans }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let done = 0, failed = 0;
  for (const pl of plans) {
    try {
      const r = await client.graphql(UPDATE, { input: { id: pl.id, title: pl.now } });
      const errs = r.data?.productUpdate?.userErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${pl.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      done++;
    } catch (e) { failed++; console.log(`  FAIL ${pl.handle}: ${e.message.slice(0, 120)}`); }
  }
  console.log(`\nRewrote ${done} title(s), ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
