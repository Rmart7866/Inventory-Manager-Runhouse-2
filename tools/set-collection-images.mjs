// set-collection-images.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Gives a collection a cover image by borrowing the photo of a product already
// in it. Built for the 19 Altra collections, which were created with none, so
// every card on the brand page rendered as a grey tile.
//
// WHY BORROW RATHER THAN UPLOAD. The photo is already on the store's CDN and
// already represents the collection, so there is nothing to source, nothing to
// licence and no new file to manage. The collection gets its own copy, so
// removing the product later does not blank the collection.
//
// WHICH PRODUCT. The first ACTIVE, in-stock product in the collection, in the
// collection's own sort order, so the cover matches what a shopper sees at the
// top of the page. An out of stock product would show a shoe you cannot buy.
//
// SAFETY:
//   1. Dry run by default.
//   2. ONLY collections that have NO image are touched, so a cover a human
//      chose is never replaced. Re-running is a no-op.
//   3. Nothing but the image is written.
//   4. A rollback file lists every collection it set, and the undo is to clear
//      that image again.
//
// Usage:
//   node tools/set-collection-images.mjs --prefix altra
//   node tools/set-collection-images.mjs --prefix altra --apply
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
const PREFIX = arg('--prefix', 'altra');

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

const COLLECTIONS = `query($q: String) {
  collections(first: 60, query: $q) {
    nodes {
      id handle title
      image { url }
      products(first: 12) {
        nodes { title status totalInventory featuredMedia { preview { image { url } } } }
      }
    }
  }
}`;
const UPDATE = `mutation($input: CollectionInput!) {
  collectionUpdate(input: $input) { collection { id handle image { url } } userErrors { field message } }
}`;

async function main() {
  const r = await client.graphql(COLLECTIONS, { q: `handle:${PREFIX}*` });
  const cols = r.data.collections.nodes;
  console.log(`${cols.length} collection(s) matching handle:${PREFIX}*`);

  const plans = [];
  let haveImage = 0, noCandidate = 0;
  for (const c of cols) {
    if (c.image) { haveImage++; continue; }
    const pick = c.products.nodes.find((p) => p.status === 'ACTIVE' && (p.totalInventory || 0) > 0 && p.featuredMedia?.preview?.image?.url)
      || c.products.nodes.find((p) => p.featuredMedia?.preview?.image?.url);
    if (!pick) { noCandidate++; console.log(`   no usable product photo: ${c.handle}`); continue; }
    plans.push({ id: c.id, handle: c.handle, title: c.title, src: pick.featuredMedia.preview.image.url, from: pick.title });
  }

  console.log(`\n${plans.length} to set, ${haveImage} already have a cover, ${noCandidate} with no usable photo.`);
  for (const p of plans) console.log(`   ${p.handle.padEnd(28)} <- ${p.from.slice(0, 52)}`);

  if (!plans.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to set ${plans.length} cover image(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `collection-image-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ note: 'Cover images SET on collections that had none. Undo is to clear the image.', prefix: PREFIX, collections: plans }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      const rr = await client.graphql(UPDATE, { input: { id: p.id, image: { src: p.src, altText: p.title } } });
      const errs = rr.data?.collectionUpdate?.userErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${p.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      done++;
    } catch (e) { failed++; console.log(`  FAIL ${p.handle}: ${e.message.slice(0, 140)}`); }
  }
  console.log(`\nSet ${done} cover image(s), ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
