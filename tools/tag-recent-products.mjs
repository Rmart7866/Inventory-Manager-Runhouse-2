// tag-recent-products.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Adds the cw-group, width and gender tags to products created in the last N
// days. The same job as the dashboard's Catalog Tagging panel, run from the CLI.
//
// WHY IT EXISTS. Create-time tagging is inherit-only: product-enrichment copies
// tags from a live width-specific sibling and sets nothing when there is none.
// The cw-group tag carries the width class, so that is stricter than "a new
// model": a new WIDTH of a carried model has no carrier either. On the
// 2026-09-08 New Balance drop, 77 of 88 products launched with nothing but
// their brand and model tag. catalog-tags.js now tags them automatically once
// they go ACTIVE, but only for handles created while the queue was watching, so
// a drop made before that shipped still needs one pass.
//
// THE TAGS COME FROM THE WORKER CATALOG, which computed them with its own
// parsers.js and tag-groups.js. That is the point: the tag written has to equal
// the tag the storefront groups on, and this file must never recompute it. If
// the catalog is stale, refresh it first, this only reads.
//
// SAFETY, in order:
//   1. Dry run by default. --apply is the only way to write.
//   2. ADD ONLY. tagsAdd, never tagsRemove. It cannot strip a tag a human put
//      on a product, so the worst case is a tag that did not get added.
//   3. Product type is corrected only when it disagrees with the parsed gender,
//      and only via a productType-only productUpdate.
//   4. ACTIVE and DRAFT only. Archived products are never touched.
//   5. A rollback file is written before the first write, listing exactly what
//      each product gained.
//
// Usage:
//   node tools/tag-recent-products.mjs                 # dry run, last 3 days
//   node tools/tag-recent-products.mjs --days 7
//   node tools/tag-recent-products.mjs --vendor "New Balance"
//   node tools/tag-recent-products.mjs --apply
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
const DAYS = parseInt(arg('--days', '3'), 10);
const VENDOR = arg('--vendor', null);

const WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
const CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36';   // read-only, public by construction

// Canonical gender tag and product type, matching catalog-tags.js GENDER_TAG /
// GENDER_TYPE so a CLI run and a panel run agree.
const GENDER_TAG = { "Men's": "Men's Shoes", "Women's": "Women's Shoes", 'Unisex': 'Unisex Shoes' };
const GENDER_TYPE = { "Men's": "Men's Shoes", "Women's": "Women's Shoes", 'Unisex': 'Unisex Shoes' };
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

const ADD_TAGS = `mutation($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
}`;
const SET_TYPE = `mutation($input: ProductInput!) {
  productUpdate(input: $input) { userErrors { field message } }
}`;

async function catalog() {
  const res = await fetch(WORKER + '/catalog', { headers: { Authorization: 'Bearer ' + CATALOG_TOKEN } });
  if (!res.ok) throw new Error('catalog fetch failed: HTTP ' + res.status);
  return res.json();
}

// Mirrors computePlan in catalog-tags.js. Add only, no removals, ever.
function planFor(p) {
  if (!TAGGABLE[p.status] || !p.id) return null;
  const tags = p.tags || [];
  const has = (t) => tags.indexOf(t) !== -1;
  const add = [];
  if (p.widthTag && !has(p.widthTag)) add.push(p.widthTag);
  if (p.cwGroup && !has(p.cwGroup)) add.push(p.cwGroup);
  const canon = GENDER_TAG[p.gender];
  if (canon && !has(canon)) add.push(canon);
  const wantType = GENDER_TYPE[p.gender];
  const newType = (wantType && p.productType !== wantType) ? wantType : null;
  if (!add.length && !newType) return null;
  return { id: p.id, handle: p.handle, title: p.title, add, newType, was: tags.slice() };
}

async function main() {
  const cat = await catalog();
  const cutoff = Date.now() - DAYS * 86400000;
  const inScope = (cat.products || []).filter((p) => {
    if (!p.createdAt) return false;
    const t = Date.parse(p.createdAt);
    if (isNaN(t) || t < cutoff) return false;
    if (VENDOR && p.vendor !== VENDOR) return false;
    return true;
  });

  console.log(`Catalog built ${cat.generatedAt}`);
  console.log(`${inScope.length} product(s) created in the last ${DAYS} day(s)${VENDOR ? ', vendor ' + VENDOR : ''}.`);
  if (!inScope.length) {
    console.log('\nNothing in scope. If that looks wrong, the catalog snapshot may predate the products: hit Refresh, or use --days.');
    return;
  }

  const plans = inScope.map(planFor).filter(Boolean);
  const counts = { width: 0, cw: 0, gender: 0, type: 0 };
  for (const pl of plans) {
    for (const t of pl.add) {
      if (/^cw-group:/.test(t)) counts.cw++;
      else if (t === 'wide' || t === 'extra wide' || t === 'narrow') counts.width++;
      else counts.gender++;
    }
    if (pl.newType) counts.type++;
  }

  console.log(`\n${plans.length} product(s) need a tag.`);
  console.log(`   cw-group tags to add : ${counts.cw}`);
  console.log(`   width tags to add    : ${counts.width}`);
  console.log(`   gender tags to add   : ${counts.gender}`);
  console.log(`   product type fixes   : ${counts.type}`);
  console.log('\nSample:');
  for (const pl of plans.slice(0, 5)) {
    console.log(`   ${pl.title.slice(0, 62)}`);
    console.log(`      add ${JSON.stringify(pl.add)}${pl.newType ? '  type -> ' + pl.newType : ''}`);
  }

  if (!plans.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to tag these ${plans.length} product(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `recent-tag-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'Tags ADDED to recently created products. Add-only, so the undo is to remove exactly the tags listed under add (and restore was/productType if a type changed).',
    generatedAt: cat.generatedAt, days: DAYS, vendor: VENDOR, products: plans,
  }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let tagged = 0, typed = 0, failed = 0;
  for (const pl of plans) {
    try {
      if (pl.add.length) {
        const r = await client.graphql(ADD_TAGS, { id: pl.id, tags: pl.add });
        const errs = r.data?.tagsAdd?.userErrors || [];
        if (errs.length) { failed++; console.log(`  FAIL ${pl.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
        tagged++;
      }
      if (pl.newType) {
        const r = await client.graphql(SET_TYPE, { input: { id: pl.id, productType: pl.newType } });
        const errs = r.data?.productUpdate?.userErrors || [];
        if (errs.length) { console.log(`  type FAIL ${pl.handle}: ${errs.map((e) => e.message).join('; ')}`); }
        else typed++;
      }
    } catch (e) {
      failed++; console.log(`  FAIL ${pl.handle}: ${e.message.slice(0, 120)}`);
    }
    if ((tagged + failed) % 25 === 0) process.stderr.write(`  ${tagged}/${plans.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nTagged ${tagged} product(s), ${typed} type fix(es), ${failed} failed.`);
  console.log('Run Refresh in the tool so the catalog picks the new tags up.');
}

main().catch((e) => { console.error(e); process.exit(1); });
