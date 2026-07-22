// fix-saucony-unisex-sizes.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Companion to fix-saucony-sizes.mjs, which repaired the men's ladder. Unisex
// was broken by the same positional parsing, in two different ways.
//
// PATTERN A, the whole ladder shifted up by 3.5 sizes.
// The old converter's unisex map started at "M7.0/W8.5", but column 9 of the ATS
// grid is really M3.5/W5.0. Unisex is listed in men's numbers and runs lower
// than men's, so it spans the full 22-column grid while the hardcoded map only
// covered 15 columns starting 7 rungs in. Every label on these products is
// therefore 3.5 sizes too big:
//
//   labelled  M7.0/W8.5  M7.5/W9.0  ...  M14.0/W15.5     (15 variants)
//   really    M3.5/W5.0  M4.0/W5.5  ...  M10.5/W12.0
//
// Fixed by subtracting 3.5 from the men's number on every variant. In ASCENDING
// order: the new labels (3.5 to 10.5) overlap the old ones (7.0 to 14.0), so
// renaming M7.0 to M3.5 first is what frees M7.0 for the variant currently
// called M10.5. Descending would collide immediately.
//
// PATTERN B, the top two rungs, the unisex form of the men's 13.5 bug.
// Saucony's ladder skips 13.5, so a product carrying M13.5/W15.0 has the same
// off-by-one-rung at the top that the men's products had:
//
//   labelled  ... M13.0/W14.5  M13.5/W15.0  M14.0/W15.5
//   really    ... M13.0/W14.5  M14.0/W15.5  M15.0/W16.5
//
// Fixed by renaming M14.0 to M15.0 FIRST, then M13.5 to M14.0, exactly as in the
// men's tool.
//
// RENAME, NOT DELETE, for the same reason as the men's fix: the shoes are real
// and only the labels are wrong, so renaming keeps the variant id, its
// inventory, and its order history, and is reversible.
//
// WHAT IS NOT DONE HERE. Pattern A products end at M10.5/W12.0 and the real
// ladder continues to M15.0/W16.5, so they are still MISSING their top rungs.
// Creating variants is a different and more dangerous operation than renaming
// one, so it is left out on purpose: the feed will report those sizes as
// uncovered and they can be added deliberately.
//
// Products left alone: anything whose ladder does not match either pattern, the
// XC spikes and Soarin/Unleash models (different, non-converter ladders), and
// the Elite 2 colourway that legitimately starts at M5.
//
// Run:  node tools/fix-saucony-unisex-sizes.mjs                # dry run
//       node tools/fix-saucony-unisex-sizes.mjs --apply
//       node tools/fix-saucony-unisex-sizes.mjs --rollback <file> --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';

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

const QUERY = `
query($cursor: String) {
  products(first: 50, after: $cursor, query: "vendor:Saucony") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status
      options { name }
      variants(first: 100) { nodes { id sku inventoryQuantity selectedOptions { name value } } }
    }
  }
}`;

const UPDATE = `
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id sku selectedOptions { name value } }
    userErrors { field message }
  }
}`;

const sizeOptionName = (p) => (p.options || []).map((o) => o.name).find((n) => /size/i.test(n)) || 'Size';
const sizeOf = (v) => {
  const o = (v.selectedOptions || []).find((x) => /size/i.test(x.name)) || (v.selectedOptions || [])[0];
  return o ? o.value : '';
};
// Men's number out of a dual label. Handles "M7.0/W8.5" and "M7/W8.5".
const mensOf = (label) => { const m = /^M(\d+(?:\.\d+)?)\s*\//.exec(String(label || '')); return m ? parseFloat(m[1]) : null; };
const one = (n) => Number(n).toFixed(1);
// The converter's own dual label: women's is men's + 1.5.
const dual = (men) => 'M' + one(men) + '/W' + one(men + 1.5);
// The SKU carries the label with the slash turned into a dash.
const skuFor = (sku, oldLabel, newLabel) => {
  if (!sku) return sku;
  const tail = '-' + oldLabel.replace(/\//g, '-');
  return sku.endsWith(tail) ? sku.slice(0, -tail.length) + '-' + newLabel.replace(/\//g, '-') : sku;
};

function planFor(p) {
  const variants = (p.variants?.nodes || []).filter((v) => mensOf(sizeOf(v)) !== null);
  if (!variants.length) return { skip: 'not a dual-size product' };
  const sorted = [...variants].sort((a, b) => mensOf(sizeOf(a)) - mensOf(sizeOf(b)));
  const mens = sorted.map((v) => mensOf(sizeOf(v)));
  const lo = mens[0];

  // PATTERN A: the converter's broken 15-slot run, starting at M7.0.
  if (lo === 7 && sorted.length === 15) {
    const steps = sorted.map((v) => {          // ascending, so labels never collide
      const from = sizeOf(v), to = dual(mensOf(from) - 3.5);
      return { id: v.id, from, to, sku: v.sku, newSku: skuFor(v.sku, from, to), qty: v.inventoryQuantity };
    });
    return { pattern: 'A (whole ladder -3.5)', steps, optionName: sizeOptionName(p) };
  }

  // PATTERN B: carries an M13.5, which Saucony's ladder does not have.
  const v135 = sorted.find((v) => mensOf(sizeOf(v)) === 13.5);
  if (v135) {
    if (sorted.some((v) => mensOf(sizeOf(v)) === 15)) return { skip: 'has M13.5 and M15.0, shape not recognised' };
    const v14 = sorted.find((v) => mensOf(sizeOf(v)) === 14);
    const steps = [];
    if (v14) { const from = sizeOf(v14), to = dual(15); steps.push({ id: v14.id, from, to, sku: v14.sku, newSku: skuFor(v14.sku, from, to), qty: v14.inventoryQuantity }); }
    const from = sizeOf(v135), to = dual(14);
    steps.push({ id: v135.id, from, to, sku: v135.sku, newSku: skuFor(v135.sku, from, to), qty: v135.inventoryQuantity });
    return { pattern: 'B (top two rungs)', steps, optionName: sizeOptionName(p) };
  }

  return { skip: 'ladder does not match either pattern' };
}

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

async function fetchAll(client) {
  const out = []; let cursor = null;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor });
    out.push(...body.data.products.nodes);
    await throttle(client, body);
    if (!body.data.products.pageInfo.hasNextPage) break;
    cursor = body.data.products.pageInfo.endCursor;
  }
  return out;
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Rolling back ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  for (const e of entries) {
    const steps = [...e.steps].reverse();     // undo in the opposite order
    console.log(`  ${e.handle}: ` + steps.map((s) => `${s.to} -> ${s.from}`).join(', '));
    if (!apply) continue;
    for (const s of steps) {
      const v = { id: s.id, optionValues: [{ optionName: e.optionName, name: s.from }] };
      if (s.sku) v.inventoryItem = { sku: s.sku };
      const r = await client.graphql(UPDATE, { productId: e.id, variants: [v] });
      const ue = r.data.productVariantsBulkUpdate.userErrors;
      if (ue.length) console.log('    FAIL ' + JSON.stringify(ue));
    }
  }
  console.log(apply ? '\nRolled back.' : '\nDry run, nothing written. Add --apply.');
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const rbArg = argv.indexOf('--rollback');
  const onlyArg = argv.indexOf('--only');
  const only = onlyArg >= 0 ? argv[onlyArg + 1] : null;
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  process.stderr.write('Fetching Saucony products...\n');
  const products = await fetchAll(client);

  const plans = []; const skipped = {};
  for (const p of products) {
    if (only && p.handle !== only) continue;
    const r = planFor(p);
    if (r.skip) { skipped[r.skip] = (skipped[r.skip] || 0) + 1; continue; }
    plans.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, pattern: r.pattern, optionName: r.optionName, steps: r.steps });
  }

  console.log(`\nPLAN: ${plans.length} products${apply ? '' : '  (DRY RUN, nothing is written)'}\n`);
  for (const p of plans) {
    const units = p.steps.reduce((t, s) => t + (s.qty || 0), 0);
    console.log(`  [${p.status}] ${p.title}`);
    console.log(`      pattern ${p.pattern}, ${p.steps.length} variants, ${units} units`);
    console.log(`      ${p.steps[0].from} -> ${p.steps[0].to}   ...   ${p.steps[p.steps.length - 1].from} -> ${p.steps[p.steps.length - 1].to}`);
  }
  const totV = plans.reduce((t, p) => t + p.steps.length, 0);
  const totU = plans.reduce((t, p) => t + p.steps.reduce((a, s) => a + (s.qty || 0), 0), 0);
  console.log(`\n  ${plans.length} products, ${totV} variants relabelled, ${totU} units preserved.`);
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped)) console.log(`  ${n}  ${why}`);
  }

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `saucony-unisex-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans, null, 2));
  console.log(`\nRollback file: ${rbFile}\n`);

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      for (const s of p.steps) {
        const v = { id: s.id, optionValues: [{ optionName: p.optionName, name: s.to }] };
        if (s.newSku && s.newSku !== s.sku) v.inventoryItem = { sku: s.newSku };
        const r = await client.graphql(UPDATE, { productId: p.id, variants: [v] });
        const ue = r.data.productVariantsBulkUpdate.userErrors;
        if (ue.length) throw new Error(JSON.stringify(ue));
        await throttle(client, r);
      }
      done++; console.log(`  ok  ${p.handle}`);
    } catch (err) { failed++; console.log(`  FAIL ${p.handle}: ${err.message}`); }
  }
  console.log(`\nFixed ${done}, failed ${failed}.`);
  console.log(`Undo with: node tools/fix-saucony-unisex-sizes.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
