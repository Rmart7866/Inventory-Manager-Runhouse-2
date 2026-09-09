// clear-bogus-specs.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Deletes specs.* metafields that were written from a BLANK registry cell and so
// are not measurements at all.
//
// THE BUG. stamp-specs.mjs (Color Swatch) coerced registry cells with
// `Number(s)`, and `Number("")` is 0, which `Number.isFinite` accepts. So every
// unverified cell was stamped as a real value: a blank stack_height_mm became
// `specs.stack_height = 0.0`, and `specs.forefoot_stack`, derived as
// stack - drop, came out NEGATIVE (a 7mm drop shoe reads -7.0mm forefoot).
// 21 of the 134 registry rows are deliberately blank, carrying confidence "low"
// and source_note "verify", so this was the normal state of unverified data, not
// an edge case. It reached 251 products across 20 models, mostly the ON range.
//
// `num()` is fixed at the source, but that only stops NEW bad writes.
// metafieldsSet cannot clear a field by skipping it, so the values already in
// Shopify have to be deleted, which is what this does.
//
// WHAT IT DELETES, and nothing else:
//   specs.stack_height    where the value is 0
//   specs.forefoot_stack  where the value is 0 or negative
//   specs.heel_drop       where the value is 0
// specs.model, firmness_1_5, stability and plate are left alone: those came
// from cells that were actually filled in. A real 0mm drop shoe does not exist
// in this catalogue, and a real 0mm stack cannot, so there is no true value
// being thrown away here.
//
// It does NOT invent the missing numbers. Heel drop and stack height are
// published specs; the registry rows are blank because nobody verified them.
// Fill them in shoe-model-registry.csv and re-run stamp-specs.mjs to restore
// them properly.
//
// Usage:
//   node tools/clear-bogus-specs.mjs            # dry run, prints the plan
//   node tools/clear-bogus-specs.mjs --apply
//   node tools/clear-bogus-specs.mjs --rollback specs-clear-rollback-<ts>.json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const ROLLBACK = (() => {
  const i = process.argv.indexOf('--rollback');
  return i > 0 ? process.argv[i + 1] : null;
})();

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

const SCAN = `query($cursor: String) {
  products(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title vendor
      model:    metafield(namespace: "specs", key: "model")          { value }
      drop:     metafield(namespace: "specs", key: "heel_drop")      { id value }
      stack:    metafield(namespace: "specs", key: "stack_height")   { id value }
      forefoot: metafield(namespace: "specs", key: "forefoot_stack") { id value }
    }
  }
}`;

const DELETE = `mutation($ids: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $ids) { deletedMetafields { key } userErrors { field message } }
}`;

// A value written from a blank cell. Only these three keys are derived from a
// number, so only these can be wrong in this specific way.
function bogus(product) {
  const out = [];
  const n = (m) => (m && m.value != null ? parseFloat(m.value) : null);
  if (n(product.stack) === 0) out.push({ key: 'stack_height', value: product.stack.value });
  const f = n(product.forefoot);
  if (f !== null && f <= 0) out.push({ key: 'forefoot_stack', value: product.forefoot.value });
  if (n(product.drop) === 0) out.push({ key: 'heel_drop', value: product.drop.value });
  return out;
}

async function scan() {
  const hits = [];
  let cursor = null, seen = 0;
  for (;;) {
    const body = await client.graphql(SCAN, { cursor });
    const conn = body.data.products;
    seen += conn.nodes.length;
    for (const p of conn.nodes) {
      if (!p.model || !p.model.value) continue;   // never stamped, not ours
      const bad = bogus(p);
      if (bad.length) hits.push({ id: p.id, title: p.title, vendor: p.vendor, model: p.model.value, fields: bad });
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
    process.stderr.write(`  scanned ${seen}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  return { hits, seen };
}

async function main() {
  if (ROLLBACK) {
    console.log('Rollback is not supported: a deleted metafield can only be restored by');
    console.log('filling the registry row in and re-running stamp-specs.mjs, which is the');
    console.log('correct fix anyway. The rollback file records exactly what was removed.');
    process.exit(1);
  }

  const { hits, seen } = await scan();
  const byModel = {};
  let fieldCount = 0;
  for (const h of hits) { byModel[h.model] = (byModel[h.model] || 0) + 1; fieldCount += h.fields.length; }

  console.log(`\nScanned ${seen} products.`);
  console.log(`${hits.length} carry a spec written from a blank registry cell, ${fieldCount} metafields in total.\n`);
  for (const [m, n] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${m}`);
  }
  if (hits.length) {
    console.log('\nExample:');
    const e = hits[0];
    console.log(`   ${e.title}`);
    for (const f of e.fields) console.log(`     delete specs.${f.key} (currently ${f.value})`);
  }

  if (!hits.length) { console.log('\nNothing to do.'); return; }

  if (!APPLY) {
    console.log(`\nDRY RUN. Pass --apply to delete these ${fieldCount} metafields.`);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `specs-clear-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'specs.* metafields deleted because they were written from a blank registry cell. To restore properly, fill the row in shoe-model-registry.csv and re-run stamp-specs.mjs.',
    products: hits,
  }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first delete.`);

  let deleted = 0, failed = 0;
  for (let i = 0; i < hits.length; i += 25) {
    const chunk = hits.slice(i, i + 25);
    const ids = [];
    for (const h of chunk) for (const f of h.fields) ids.push({ ownerId: h.id, namespace: 'specs', key: f.key });
    const body = await client.graphql(DELETE, { ids });
    const res = body.data.metafieldsDelete;
    const errs = (res && res.userErrors) || [];
    if (errs.length) { failed += ids.length; console.log(`  chunk ${i / 25}: ${errs.map((e) => e.message).join('; ')}`); }
    else deleted += (res.deletedMetafields || []).length;
    process.stderr.write(`  deleted ${deleted}/${fieldCount}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nDeleted ${deleted} metafields across ${hits.length} products. ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
