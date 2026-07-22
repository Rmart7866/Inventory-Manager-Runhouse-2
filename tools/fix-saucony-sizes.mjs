// fix-saucony-sizes.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Repairs Saucony men's variants that carry a size label the brand does not
// make. The old converter read quantities out of a wide grid by COLUMN POSITION
// and mapped those positions with a hardcoded ladder that assumed a clean 0.5
// step. Saucony's real men's ladder skips 13.5 and 14.5:
//
//   real   7.0 7.5 ... 12.5 13.0 | 14.0 15.0
//   old    7.0 7.5 ... 12.5 13.0 | 13.5 14.0
//                                   ^^^^ ^^^^
//
// So the last two slots were written one rung low. On these products:
//
//   the variant labelled "13.5" actually holds size 14.0 stock
//   the variant labelled "14.0" actually holds size 15.0 stock
//   there is no "15.0" variant at all
//
// THE FIX IS A RENAME, NOT A DELETE. The shoes are real, only the labels are
// wrong, so shifting both labels up one rung makes every variant describe what
// it actually contains. Renaming keeps the variant id, its inventory, and its
// order history, and it is completely reversible. Deleting and recreating would
// throw all three away to reach the same end state.
//
// ORDER MATTERS. "14.0" is renamed to "15.0" FIRST, then "13.5" to "14.0". Doing
// it the other way round collides two variants on the same option value.
//
// The SKU carries the size too (S100997-1021-13.5), so it is shifted with the
// label. That is what lets the feed match the variant afterwards.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. Only Saucony products that HAVE a 13.5 variant are touched at all.
//   3. A product with no 13.5 is already correct and is skipped. A product
//      carrying BOTH 15.0 and 13.5 is half-done (the first rename landed, the
//      second did not) and is FINISHED, not skipped, or the phantom 13.5 would
//      survive. A product with both 15.0 and 14.0 and a 13.5 does not fit the
//      pattern at all and is left alone.
//   4. Only the Size option value and the SKU change. Inventory, price,
//      barcode, images, and every other variant are untouched. The SKU goes in
//      inventoryItem.sku; ProductVariantsBulkInput has no top-level sku field,
//      and passing one is rejected for the whole variant.
//   5. A rollback file with the exact before-state is written BEFORE the first
//      mutation, so an interrupted run is still reversible.
//
// Run:  node tools/fix-saucony-sizes.mjs                 # dry run, shows the plan
//       node tools/fix-saucony-sizes.mjs --apply
//       node tools/fix-saucony-sizes.mjs --rollback saucony-size-rollback-<stamp>.json --apply
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
      id handle title status productType
      options { name }
      variants(first: 100) {
        nodes { id sku inventoryQuantity selectedOptions { name value } }
      }
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

// Size labels are written with one decimal by the converter ("14.0"), but a
// human editing in Shopify may leave "14". Compare numerically so both match.
const num = (s) => { const m = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(String(s || '')); return m ? parseFloat(m[1]) : null; };
const sizeOptionName = (p) => (p.options || []).map((o) => o.name).find((n) => /size/i.test(n)) || 'Size';
const sizeOf = (v) => {
  const o = (v.selectedOptions || []).find((x) => /size/i.test(x.name)) || (v.selectedOptions || [])[0];
  return o ? o.value : '';
};

async function fetchSaucony(client) {
  const out = [];
  let cursor = null;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor });
    const conn = body.data.products;
    out.push(...conn.nodes);
    const t = throttleOf(body);
    if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
      await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

// Shift a size out of a SKU: "S100997-1021-13.5" -> "S100997-1021-14.0".
// Only the trailing size token is touched, and only when it is the size we
// expect, so a SKU in any other shape is left exactly as it is.
function shiftSku(sku, fromSize, toSize) {
  if (!sku) return sku;
  const tail = new RegExp('-' + fromSize.replace('.', '\\.') + '$');
  if (tail.test(sku)) return sku.replace(tail, '-' + toSize);
  const tailPlain = new RegExp('-' + String(parseFloat(fromSize)).replace('.', '\\.') + '$');
  if (tailPlain.test(sku)) return sku.replace(tailPlain, '-' + toSize);
  return sku; // unrecognised shape, leave it
}

function planFor(p) {
  const variants = p.variants?.nodes || [];
  const has = (n) => variants.find((v) => num(sizeOf(v)) === n);
  const v135 = has(13.5);
  if (!v135) return { skip: 'no 13.5 variant' };
  // A product carrying BOTH 15.0 and 13.5 is half-done: the 14.0 -> 15.0 step
  // landed and the 13.5 -> 14.0 step did not. It must be finished, not skipped,
  // or the phantom 13.5 survives. Only a product with 15.0 and no 13.5 is done,
  // and that is already caught by the !v135 return above.
  const v15 = has(15);
  const v14 = has(14);
  if (v15 && v14) return { skip: 'has 15.0 and 14.0 already, shape not recognised' };

  // 14.0 -> 15.0 first, then 13.5 -> 14.0, so the two never collide.
  const steps = [];
  if (v14 && !v15) steps.push({ id: v14.id, from: sizeOf(v14), to: '15.0', sku: v14.sku, newSku: shiftSku(v14.sku, sizeOf(v14), '15.0'), qty: v14.inventoryQuantity });
  steps.push({ id: v135.id, from: sizeOf(v135), to: '14.0', sku: v135.sku, newSku: shiftSku(v135.sku, sizeOf(v135), '14.0'), qty: v135.inventoryQuantity });
  return { steps, optionName: sizeOptionName(p) };
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Rolling back ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  for (const e of entries) {
    // Reverse order: put the lower label back first, then the upper one.
    const steps = [...e.steps].reverse().map((s) => ({
      id: s.id,
      optionValues: [{ optionName: e.optionName, name: s.from }],
      ...(s.sku ? { inventoryItem: { sku: s.sku } } : {}),
    }));
    console.log(`  ${e.handle}: ` + [...e.steps].reverse().map((s) => `${s.to} -> ${s.from}`).join(', '));
    if (!apply) continue;
    for (const v of steps) {
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
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  process.stderr.write('Fetching Saucony products...\n');
  const products = await fetchSaucony(client);
  console.log(`${products.length} Saucony products fetched.\n`);

  // --only <handle> restricts the run to one product. Used to prove the mutation
  // on a zero-stock product before touching the rest.
  const onlyArg = argv.indexOf('--only');
  const only = onlyArg >= 0 ? argv[onlyArg + 1] : null;

  const plans = [];
  const skipped = {};
  for (const p of products) {
    if (only && p.handle !== only) continue;
    const r = planFor(p);
    if (r.skip) { skipped[r.skip] = (skipped[r.skip] || 0) + 1; continue; }
    plans.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, optionName: r.optionName, steps: r.steps });
  }

  console.log(`PLAN: ${plans.length} products to fix${apply ? '' : '  (DRY RUN, nothing is written)'}\n`);
  let units = 0;
  for (const p of plans.slice(0, 30)) {
    console.log(`  [${p.status}] ${p.title}`);
    for (const s of p.steps) {
      console.log(`      size ${s.from} -> ${s.to}   (${s.qty} units)` + (s.sku ? `   sku ${s.sku} -> ${s.newSku}` : '   no sku'));
    }
  }
  if (plans.length > 30) console.log(`  ...and ${plans.length - 30} more`);
  plans.forEach((p) => p.steps.forEach((s) => { units += s.qty || 0; }));
  console.log(`\n  ${plans.length} products, ${plans.reduce((t, p) => t + p.steps.length, 0)} variants relabelled, ${units} units preserved.`);
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped)) console.log(`  ${n}  ${why}`);
  }

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `saucony-size-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans, null, 2));
  console.log(`\nRollback file: ${rbFile}\n`);

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      for (const s of p.steps) {
        const v = { id: s.id, optionValues: [{ optionName: p.optionName, name: s.to }] };
        // sku is NOT a top-level field on ProductVariantsBulkInput; it lives on
        // inventoryItem. Passing it at the top level is rejected outright, which
        // is how the first run failed on every variant that had a SKU.
        if (s.newSku && s.newSku !== s.sku) v.inventoryItem = { sku: s.newSku };
        const r = await client.graphql(UPDATE, { productId: p.id, variants: [v] });
        const ue = r.data.productVariantsBulkUpdate.userErrors;
        if (ue.length) throw new Error(JSON.stringify(ue));
        await throttle(client, r);
      }
      done++;
      console.log(`  ok  ${p.handle}`);
    } catch (err) {
      failed++;
      console.log(`  FAIL ${p.handle}: ${err.message}`);
    }
  }
  console.log(`\nFixed ${done}, failed ${failed}.`);
  console.log(`Undo with: node tools/fix-saucony-sizes.mjs --rollback ${rbFile} --apply`);
}

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
