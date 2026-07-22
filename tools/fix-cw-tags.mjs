// fix-cw-tags.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Two jobs, both driven by a report from audit-cw-tags.mjs:
//
//   --repair    (default) Fix products whose cw-group: tag is WRONG. The cause
//               was the inheritance index in catalog-client.js being keyed
//               without gender, so a new Women's or Unisex Hoka colorway
//               inherited the MEN'S sibling's whole tag set. That means three
//               things are wrong on each product, not one: the cw-group tag,
//               the Men / Women tag, and the product type. All three are fixed.
//
//   --backfill  Add the cw-group: tag to products that have NONE. Unrelated to
//               the bug above, these simply predate the tagging. Only the tag is
//               touched, never the type or any other tag.
//
// WHY THIS LIVES IN tools/ AND NOT IN THE WORKER. worker/src/tag-groups.js is
// deliberately a compute-only port: "The Worker must only ever COMPUTE the tag",
// and the tagsAdd / tagsRemove mutations were dropped from it on purpose. That
// stays true. This is a local one-off CLI, the same shape as the original Color
// Swatch CLI, run by hand off worker/.dev.vars. It adds no route, no endpoint,
// and no public surface. Nothing here is reachable from the browser bundle.
//
// SAFETY, in order:
//   1. Dry run by default. --apply is the only way to write.
//   2. Surgical. Only the cw-group tag, the gender tag, and the product type are
//      ever touched, via tagsAdd / tagsRemove (additive and subtractive, not a
//      replace) and a productType-only productUpdate. Every other tag and every
//      other field is left exactly as it is.
//   3. Re-reads each product's CURRENT state immediately before writing and
//      recomputes from the live title, so a stale report can never drive a
//      write. A product that no longer disagrees is skipped.
//   4. Refuses any product whose title has no parseable gender: the expected tag
//      would be genderless, which is not an improvement. Those need the TITLE
//      fixed first, which this tool will not do.
//   5. Writes a rollback file recording the exact before-state (tags AND type)
//      of every product it changes, BEFORE the first mutation, so an interrupted
//      run is still fully reversible.
//
// Run:  node tools/audit-cw-tags.mjs --out cw-tag-audit.json
//       node tools/fix-cw-tags.mjs --repair                  # dry run
//       node tools/fix-cw-tags.mjs --repair --apply
//       node tools/fix-cw-tags.mjs --backfill                # dry run
//       node tools/fix-cw-tags.mjs --backfill --apply --status ACTIVE,DRAFT
//       node tools/fix-cw-tags.mjs --rollback cw-tag-rollback-<stamp>.json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';
import { parseProduct } from '../worker/src/parsers.js';
import { groupTagFor, TAG_PREFIX } from '../worker/src/tag-groups.js';

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

const READ_ONE = `
query($id: ID!) {
  product(id: $id) {
    id handle title vendor status tags productType
    variants(first: 1) { nodes { sku } }
  }
}`;

// Batched form of READ_ONE. The freshness guarantee (safety note 3) is about
// reading live state immediately before planning, not about doing it one
// request at a time, so a backfill of hundreds of products reads in chunks
// instead of one round trip each.
const READ_MANY = `
query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Product {
      id handle title vendor status tags productType
      variants(first: 1) { nodes { sku } }
    }
  }
}`;
const READ_CHUNK = 50;

const TAGS_REMOVE = `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`;
const TAGS_ADD = `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`;
const TYPE_SET = `mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { product { id productType } userErrors { field message } } }`;

// GENDER TAGS. Only these exact strings are ever considered a gender tag, so a
// model or color name can never be mistaken for one. Matching is
// case-insensitive and apostrophe-insensitive. A tag on this list whose gender
// does not match the product's is removed; anything not on this list is left
// alone, whatever it is.
const GENDER_TAGS = {
  "men": "Men's", "mens": "Men's", "man": "Men's",
  "mens shoes": "Men's", "men shoes": "Men's",
  "women": "Women's", "womens": "Women's", "woman": "Women's",
  "womens shoes": "Women's", "women shoes": "Women's",
  "unisex": 'Unisex', "unisex shoes": 'Unisex',
};
const normTag = (t) => String(t).toLowerCase().replace(/[’'`]/g, '').replace(/\s+/g, ' ').trim();
function genderOfTag(tag) { return GENDER_TAGS[normTag(tag)] || null; }

// The tool's own convention, from the converters: "Men" / "Women", and NOTHING
// for Unisex (hoka-converter.js only pushes a gender tag when gender !== Unisex).
// Matching that keeps repaired products identical to freshly created ones.
function canonicalGenderTag(gender) {
  if (gender === "Men's") return 'Men';
  if (gender === "Women's") return 'Women';
  return null; // Unisex carries no gender tag
}

function typeForGender(gender) {
  if (gender === "Men's") return "Men's Shoes";
  if (gender === "Women's") return "Women's Shoes";
  if (gender === 'Unisex') return 'Unisex Shoes';
  return null;
}

// Re-derive the truth for one product from its LIVE state. Returns { skip } when
// there is nothing to do or it is not safe to touch. Never trusts the report for
// anything but the product id.
function planFor(node, mode) {
  const sku = (node.variants?.nodes || [])[0]?.sku || '';
  const parsed = parseProduct({ title: node.title, sku, vendor: node.vendor });
  if (!parsed.ok) return { skip: 'title does not parse' };
  if (!parsed.gender) return { skip: 'title has no gender, fix the title first' };

  const expected = groupTagFor(parsed);
  if (!expected) return { skip: 'no expected tag' };

  const tags = node.tags || [];
  const cw = tags.filter((t) => String(t).startsWith(TAG_PREFIX));

  const remove = [];
  const add = [];

  if (mode === 'backfill') {
    if (cw.length) return { skip: 'already has a cw-group tag' };
    add.push(expected);
    // Backfill is tag-only on purpose. These products predate the tagging and
    // their type is not evidence of this bug, so it is not ours to change.
    return { remove, add, newType: null, before: { tags, productType: node.productType }, handle: node.handle, title: node.title };
  }

  // repair mode
  if (!cw.length) return { skip: 'no cw-group tag at all, that is --backfill' };
  if (cw.length === 1 && cw[0] === expected) {
    // The cw-group is right, but the gender tag or type may still be wrong on a
    // product this bug touched, so fall through rather than skipping outright.
  } else {
    for (const t of cw) if (t !== expected) remove.push(t);
    if (!cw.includes(expected)) add.push(expected);
  }

  // Gender tag: drop any gender tag that contradicts the title, add ours.
  const wantTag = canonicalGenderTag(parsed.gender);
  for (const t of tags) {
    const g = genderOfTag(t);
    if (g && g !== parsed.gender) remove.push(t);
  }
  if (wantTag && !tags.some((t) => normTag(t) === normTag(wantTag))) add.push(wantTag);

  // Product type, only when it contradicts the title's gender.
  const wantType = typeForGender(parsed.gender);
  const curType = node.productType || '';
  const newType = (wantType && normTag(curType) !== normTag(wantType) && /shoes$/i.test(curType)) ? wantType : null;

  if (!remove.length && !add.length && !newType) return { skip: 'already correct' };
  return { remove, add, newType, before: { tags, productType: curType }, handle: node.handle, title: node.title };
}

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Rolling back ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  for (const e of entries) {
    const now = await client.graphql(READ_ONE, { id: e.id });
    const p = now.data.product;
    if (!p) { console.log(`  ${e.handle}: gone, skipped`); continue; }
    const cur = p.tags || [];
    const want = e.before.tags || [];
    const toRemove = cur.filter((t) => !want.includes(t));
    const toAdd = want.filter((t) => !cur.includes(t));
    console.log(`  ${e.handle}: -[${toRemove.join(', ')}] +[${toAdd.join(', ')}]` +
      (e.before.productType && e.before.productType !== p.productType ? ` type -> ${e.before.productType}` : ''));
    if (!apply) continue;
    if (toRemove.length) await client.graphql(TAGS_REMOVE, { id: e.id, tags: toRemove });
    if (toAdd.length) await client.graphql(TAGS_ADD, { id: e.id, tags: toAdd });
    if (e.before.productType && e.before.productType !== p.productType) {
      await client.graphql(TYPE_SET, { p: { id: e.id, productType: e.before.productType } });
    }
  }
  console.log(apply ? '\nRolled back.' : '\nDry run, nothing written. Add --apply.');
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const mode = argv.includes('--backfill') ? 'backfill' : 'repair';
  const rbArg = argv.indexOf('--rollback');
  const repArg = argv.indexOf('--report');
  const stArg = argv.indexOf('--status');
  const statuses = stArg >= 0 ? argv[stArg + 1].split(',').map((s) => s.trim().toUpperCase()) : ['ACTIVE', 'DRAFT'];
  const client = createShopifyClient(loadDevVars());

  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  const reportPath = repArg >= 0 ? argv[repArg + 1] : path.join(ROOT, 'cw-tag-audit.json');
  if (!fs.existsSync(reportPath)) {
    throw new Error(`report not found: ${reportPath}\nRun: node tools/audit-cw-tags.mjs --out ${reportPath}`);
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const candidates = (mode === 'backfill' ? report.buckets?.missing : report.buckets?.wrong) || [];
  const exArg = argv.indexOf('--exclude');
  const excluded = new Set(exArg >= 0 ? argv[exArg + 1].split(',').map((s) => s.trim()).filter(Boolean) : []);

  const inScope = candidates.filter((r) => statuses.includes(r.status) && !excluded.has(r.handle));
  console.log(`mode: ${mode}   statuses: ${statuses.join(',')}`);
  if (excluded.size) console.log(`excluded by hand: ${[...excluded].join(', ')}`);
  console.log(`${candidates.length} candidates in the audit, ${inScope.length} in scope. Re-checking each against live Shopify state.\n`);

  const plans = [];
  const skipped = {};
  for (let i = 0; i < inScope.length; i += READ_CHUNK) {
    const chunk = inScope.slice(i, i + READ_CHUNK);
    const body = await client.graphql(READ_MANY, { ids: chunk.map((r) => r.id) });
    await throttle(client, body);
    if (i) process.stderr.write(`  ...checked ${i}/${inScope.length}\n`);
    for (const node of body.data.nodes) {
      if (!node || !node.id) { skipped['product no longer exists'] = (skipped['product no longer exists'] || 0) + 1; continue; }
      const p = planFor(node, mode);
      if (p.skip) { skipped[p.skip] = (skipped[p.skip] || 0) + 1; continue; }
      plans.push({ id: node.id, status: node.status, ...p });
    }
  }

  console.log(`PLAN: ${plans.length} products to change${apply ? '' : '  (DRY RUN, nothing is written)'}\n`);
  const preview = plans.length > 40 ? plans.slice(0, 40) : plans;
  for (const p of preview) {
    console.log(`  [${p.status}] ${p.handle}`);
    if (p.remove.length) console.log(`      remove: ${p.remove.join(', ')}`);
    if (p.add.length) console.log(`      add:    ${p.add.join(', ')}`);
    if (p.newType) console.log(`      type:   ${p.before.productType} -> ${p.newType}`);
  }
  if (plans.length > preview.length) console.log(`  ...and ${plans.length - preview.length} more (see the plan file)`);
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped)) console.log(`  ${n}  ${why}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const planFile = path.join(ROOT, `cw-tag-plan-${mode}-${stamp}.json`);
  fs.writeFileSync(planFile, JSON.stringify(plans, null, 2));
  console.log(`\nFull plan written to ${planFile}`);

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply to make these changes.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const rbFile = path.join(ROOT, `cw-tag-rollback-${mode}-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans.map((p) => ({ id: p.id, handle: p.handle, before: p.before })), null, 2));
  console.log(`Rollback file: ${rbFile}\n`);

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      if (p.remove.length) {
        const r = await client.graphql(TAGS_REMOVE, { id: p.id, tags: p.remove });
        if (r.data.tagsRemove.userErrors.length) throw new Error('tagsRemove: ' + JSON.stringify(r.data.tagsRemove.userErrors));
      }
      if (p.add.length) {
        const r = await client.graphql(TAGS_ADD, { id: p.id, tags: p.add });
        if (r.data.tagsAdd.userErrors.length) throw new Error('tagsAdd: ' + JSON.stringify(r.data.tagsAdd.userErrors));
        await throttle(client, r);
      }
      if (p.newType) {
        const r = await client.graphql(TYPE_SET, { p: { id: p.id, productType: p.newType } });
        if (r.data.productUpdate.userErrors.length) throw new Error('productUpdate: ' + JSON.stringify(r.data.productUpdate.userErrors));
      }
      done++;
      if (plans.length <= 40) console.log(`  ok  ${p.handle}`);
      else if (done % 50 === 0) console.log(`  ...${done}/${plans.length}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL ${p.handle}: ${err.message}`);
    }
  }
  console.log(`\nChanged ${done}, failed ${failed}.`);
  console.log(`Undo with: node tools/fix-cw-tags.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
