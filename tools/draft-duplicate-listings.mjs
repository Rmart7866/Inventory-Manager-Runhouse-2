// draft-duplicate-listings.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Sets the non-dropship half of a duplicate-barcode pair to DRAFT.
//
// THE PROBLEM. 3,021 footwear barcodes sit on more than one product, across 91
// sets where both products are ACTIVE. Receiving scans a shoe into every listing
// that carries the barcode, but a sale only ever decrements one of them, so the
// other accumulates stock that does not exist. The fix is to leave one listing
// live per shoe and draft the rest.
//
// WHICH ONE SURVIVES. Dropship product is footwear stocked at Needham, so the
// listing carrying Needham stock is the dropship one and it stays. When neither
// side is stocked at Needham the tie breaks on the fingerprint the inventory
// tool leaves behind: an "Athletic" tag, the canonical vendor spelling, a
// compact tag set and a short style-code handle. The old hand-made listing
// carries long marketing tags instead.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. Only `status` changes. Title, tags, barcodes, SKUs, prices and inventory
//      are never touched, and DRAFT is reversible from the admin.
//   3. A product holding real store stock is REFUSED unless you pass
//      --include-stocked. Drafting pulls a product from POS too, so hiding a
//      listing that Walpole or Falmouth is selling off the shelf is worse than
//      the phantom stock it fixes. Move that stock to the surviving listing
//      first. Needham counts do not block: those are dropship availability the
//      tool writes, not shoes on a shelf.
//   4. Every product is re-read live before it is touched. If it is no longer
//      ACTIVE, or the title moved, or the partner listing is not ACTIVE, it is
//      skipped. Never draft both halves of a pair.
//   5. Rollback file written before the first mutation. Every change is
//      ACTIVE to DRAFT, so rolling back means setting exactly those back.
//
// Plan file: {safe:[...], stocked:[...], excluded:[...]} as built by the
// duplicate-barcode scan. Each row needs drop, drop_title, keep.
//
// Usage:
//   node tools/draft-duplicate-listings.mjs <plan.json>                  # dry run, safe tier
//   node tools/draft-duplicate-listings.mjs <plan.json> --apply
//   node tools/draft-duplicate-listings.mjs <plan.json> --include-stocked --apply

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const INCLUDE_STOCKED = process.argv.includes('--include-stocked');
const PLAN = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));

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

const READ = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product {
  id title status
  variants(first:100){ nodes{ inventoryItem { inventoryLevels(first:12){ nodes{
    location { id name } quantities(names:["on_hand"]) { name quantity } } } } } }
} } }`;

const UPDATE = `mutation($id:ID!){
  productUpdate(product:{ id:$id, status: DRAFT }) {
    product { id status } userErrors { field message } } }`;

const NEEDHAM = 'gid://shopify/Location/77957136639';

function storeStock(p) {
  let n = 0;
  for (const v of p.variants.nodes)
    for (const lv of v.inventoryItem?.inventoryLevels?.nodes || []) {
      if (lv.location.id === NEEDHAM) continue;
      const oh = (lv.quantities || []).find(q => q.name === 'on_hand')?.quantity ?? 0;
      if (oh > 0) n += oh;
    }
  return n;
}

async function main() {
  if (!PLAN) throw new Error('pass the plan json path');
  const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
  const rows = INCLUDE_STOCKED ? [...plan.safe, ...plan.stocked] : plan.safe;
  const { graphql } = createShopifyClient(loadDevVars());

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'}  ${rows.length} candidate products` +
    (INCLUDE_STOCKED ? '  (including listings that hold store stock)' : '  (safe tier only)'));

  // verify live, in batches, before deciding anything
  const ids = [...new Set(rows.flatMap(r => [r.drop, r.keep]))].map(i => 'gid://shopify/Product/' + i);
  const live = {};
  for (let i = 0; i < ids.length; i += 6) {
    const d = await graphql(READ, { ids: ids.slice(i, i + 6) });
    for (const n of d.data.nodes) if (n) live[n.id.split('/').pop()] = { title: n.title, status: n.status, stock: storeStock(n) };
  }

  const go = [], skip = [];
  for (const r of rows) {
    const d = live[r.drop], k = live[r.keep];
    if (!d) { skip.push([r, 'product not found']); continue; }
    if (d.status !== 'ACTIVE') { skip.push([r, 'already ' + d.status]); continue; }
    if (d.title !== r.drop_title) { skip.push([r, 'title changed since the plan was built']); continue; }
    if (!k || k.status !== 'ACTIVE') { skip.push([r, 'surviving listing is not ACTIVE, would leave the shoe unlisted']); continue; }
    if (d.stock > 0 && !INCLUDE_STOCKED) { skip.push([r, 'holds ' + d.stock + ' units of store stock']); continue; }
    go.push({ ...r, live_stock: d.stock });
  }

  console.log(`\n  will draft   ${go.length}`);
  console.log(`  skipped      ${skip.length}`);
  for (const g of go)
    console.log(`    DRAFT ${g.drop}  ${g.vendor || ''}  ${g.drop_title.slice(0, 60)}` +
      (g.live_stock ? `   [holds ${g.live_stock} store units]` : ''));
  for (const [r, why] of skip) console.log(`    skip  ${r.drop}  ${r.drop_title.slice(0, 52)}  -> ${why}`);

  if (!APPLY) { console.log('\nDry run only. Re-run with --apply to write.\n'); return; }
  if (!go.length) { console.log('\nNothing to do.\n'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rb = path.join(ROOT, `draft-duplicates-rollback-${stamp}.json`);
  fs.writeFileSync(rb, JSON.stringify(go.map(g => ({ id: g.drop, title: g.drop_title, from: 'ACTIVE', to: 'DRAFT' })), null, 1));
  console.log(`\nrollback -> ${path.basename(rb)}`);

  let ok = 0, failed = 0;
  for (const g of go) {
    const d = await graphql(UPDATE, { id: 'gid://shopify/Product/' + g.drop });
    const errs = d.data.productUpdate.userErrors;
    if (errs.length) { failed++; console.log(`  FAIL ${g.drop}  ${JSON.stringify(errs)}`); }
    else { ok++; console.log(`  ok   ${g.drop}  ${g.drop_title.slice(0, 56)}`); }
  }
  console.log(`\ndrafted ${ok}, failed ${failed}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
