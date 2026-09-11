// publish-stocked-drafts.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Takes DRAFT footwear that is carrying stock and makes it sellable: status to
// ACTIVE, then published to the Online Store.
//
// WHY BOTH STEPS. A draft created by Stage 4 is published to NO sales channel at
// all, so flipping status alone leaves it just as invisible. Measured on this
// store: a comparable live product sits on Online Store, Point of Sale, Shop,
// Meta, Google and others, while these sit on nothing. Online Store only by
// default, on purpose, so the storefront can be eyeballed before anything
// reaches POS or an ad feed. --publication adds more by name.
//
// WHAT IT REFUSES TO TOUCH, which is the whole point of the file:
//   1. Products drafted on purpose to fix DUPLICATE BARCODES. tools/
//      draft-duplicate-listings.mjs flipped 52 of those on 2026-09-01 because
//      the same barcode on two live listings makes receiving credit stock to a
//      listing that never sells it. Republishing recreates that, and they are
//      the highest stock drafts in the catalogue, so a naive "publish the big
//      ones" hits them first. Pass --rollback-file to name the run to respect.
//   2. Anything with no featured image. A bare listing is worse than no listing.
//   3. Anything with no price.
//   4. Anything whose exact title is already on an ACTIVE product, which is the
//      same duplicate shape as 1, just not from that run.
//   5. Anything not a shoe, out of stock, or not touched by an inventory write
//      recently (--days, default 7). A draft nothing has updated is a retired
//      product, not a forgotten one.
//
// A rollback file recording each product's prior status is written before the
// first write. Undo is productUpdate back to DRAFT plus publishableUnpublish.
//
// Usage:
//   node tools/publish-stocked-drafts.mjs
//   node tools/publish-stocked-drafts.mjs --days 14
//   node tools/publish-stocked-drafts.mjs --apply
//   node tools/publish-stocked-drafts.mjs --publication "Point of Sale" --apply
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
const DAYS = parseInt(argOf('--days', '7'), 10);
const PUBLICATIONS = argv.reduce((acc, a, i) => (a === '--publication' && argv[i + 1] ? acc.concat(argv[i + 1]) : acc), ['Online Store']);
const RB_FILE = argOf('--rollback-file', 'draft-duplicates-rollback-2026-09-01T17-01-46-383Z.json');

const WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
const CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36';

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

const SET_STATUS = `mutation($input: ProductInput!) {
  productUpdate(input: $input) { product { id status } userErrors { field message } }
}`;
const PUBLISH = `mutation($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) { userErrors { field message } }
}`;

const daysSince = (v) => (v ? (Date.now() - Date.parse(v)) / 86400000 : 9999);

async function main() {
  const res = await fetch(WORKER + '/catalog', { headers: { Authorization: 'Bearer ' + CATALOG_TOKEN } });
  if (!res.ok) throw new Error('catalog fetch failed: HTTP ' + res.status);
  const cat = await res.json();
  const ps = cat.products || [];

  // Titles already live, so a draft twin is never republished alongside one.
  const liveTitles = new Set(ps.filter((p) => p.status === 'ACTIVE').map((p) => (p.title || '').trim().toLowerCase()));

  // The deliberate duplicate-barcode drafts.
  let deliberate = new Set();
  const rbPath = path.join(ROOT, RB_FILE);
  if (fs.existsSync(rbPath)) {
    deliberate = new Set(JSON.parse(fs.readFileSync(rbPath, 'utf8')).map((x) => 'gid://shopify/Product/' + x.id));
    console.log(`Respecting ${deliberate.size} deliberate drafts from ${RB_FILE}`);
  } else {
    console.log(`WARNING: ${RB_FILE} not found. Products drafted to fix duplicate barcodes will NOT be excluded.`);
  }

  const isShoe = (p) => (p.productType || '').toLowerCase().endsWith('shoes');
  const skipped = { duplicateRun: 0, noImage: 0, noPrice: 0, titleLive: 0 };
  const picked = [];
  for (const p of ps) {
    if (p.status !== 'DRAFT' || !isShoe(p)) continue;
    if (!(p.totalOnHand > 0)) continue;
    if (daysSince(p.updatedAt) > DAYS) continue;
    if (deliberate.has(p.id)) { skipped.duplicateRun++; continue; }
    if (!p.image) { skipped.noImage++; continue; }
    if (!p.price) { skipped.noPrice++; continue; }
    if (liveTitles.has((p.title || '').trim().toLowerCase())) { skipped.titleLive++; continue; }
    picked.push(p);
  }
  picked.sort((a, b) => (b.totalOnHand || 0) - (a.totalOnHand || 0));

  console.log(`\nSkipped: ${skipped.duplicateRun} from the duplicate-barcode run, ${skipped.noImage} with no image, ${skipped.noPrice} with no price, ${skipped.titleLive} whose title is already live.`);
  console.log(`\n${picked.length} product(s) to publish, ${picked.reduce((t, p) => t + (p.totalOnHand || 0), 0).toLocaleString()} units.`);
  console.log(`Publications: ${PUBLICATIONS.join(', ')}`);
  for (const p of picked.slice(0, 12)) {
    console.log(`   ${String(p.totalOnHand).padStart(5)}  ${(p.vendor || '?').slice(0, 12).padEnd(12)} ${p.title.slice(0, 58)}`);
  }
  if (picked.length > 12) console.log(`   ... and ${picked.length - 12} more`);
  if (!picked.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to publish these ${picked.length} product(s).`); return; }

  const pubs = (await client.graphql(`{ publications(first:30){ nodes{ id name } } }`)).data.publications.nodes;
  const targets = PUBLICATIONS.map((name) => {
    const hit = pubs.find((x) => x.name === name);
    if (!hit) throw new Error(`publication not found: ${name}. Available: ${pubs.map((x) => x.name).join(', ')}`);
    return { publicationId: hit.id };
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `publish-drafts-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'Products moved DRAFT to ACTIVE and published. Undo: productUpdate status DRAFT, and publishableUnpublish from the same publications.',
    publications: PUBLICATIONS,
    products: picked.map((p) => ({ id: p.id, handle: p.handle, title: p.title, was: 'DRAFT', totalOnHand: p.totalOnHand })),
  }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let active = 0, published = 0, failed = 0;
  for (const p of picked) {
    try {
      const r = await client.graphql(SET_STATUS, { input: { id: p.id, status: 'ACTIVE' } });
      const e1 = r.data?.productUpdate?.userErrors || [];
      if (e1.length) { failed++; console.log(`  FAIL status ${p.handle}: ${e1.map((x) => x.message).join('; ')}`); continue; }
      active++;
      const r2 = await client.graphql(PUBLISH, { id: p.id, input: targets });
      const e2 = r2.data?.publishablePublish?.userErrors || [];
      if (e2.length) console.log(`  FAIL publish ${p.handle}: ${e2.map((x) => x.message).join('; ')}`);
      else published++;
    } catch (err) {
      failed++; console.log(`  FAIL ${p.handle}: ${String(err.message).slice(0, 120)}`);
    }
    if ((active + failed) % 10 === 0) process.stderr.write(`  ${active}/${picked.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\n${active} set ACTIVE, ${published} published to ${PUBLICATIONS.join(' + ')}, ${failed} failed.`);
  console.log('Run Refresh in the tool so the catalog picks up the new statuses.');
}

main().catch((e) => { console.error(e); process.exit(1); });
