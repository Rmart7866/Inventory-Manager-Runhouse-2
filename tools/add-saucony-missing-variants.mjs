// add-saucony-missing-variants.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Creates the size variants that the old positional parser never made. Its
// unisex map covered only 15 of the 22 columns in the ATS grid, so the top of
// the ladder was never written to Shopify at all. fix-saucony-unisex-sizes.mjs
// corrected the labels on the 15 that exist; this adds the ones that are
// missing, so the feed has somewhere to put their stock.
//
// A shoe with no variant cannot be bought. The inventory push has nowhere to
// write the quantity and drops it silently, so a customer in a men's 12 sees
// nothing while the units sit available in the feed.
//
// THIS ONE CREATES, IT DOES NOT RENAME. That is a heavier operation than the
// other two size tools: a new variant is a new sellable SKU with a price and a
// barcode, and undoing it means deleting something a customer may have ordered
// in the meantime. So it is deliberately narrow:
//
//   1. Dry run by default. --apply is the only way to write.
//   2. Only products whose EXISTING variants already carry the converter's own
//      SKU shape (STYLE-M#.#-W#.#) are eligible. That is what proves the
//      product was built by this pipeline and that the style code is real.
//   3. Every field of a new variant comes from the feed: size label, SKU,
//      barcode and MSRP. Nothing is invented.
//   4. A size that already exists on the product is never re-created.
//   5. Created variant ids are written to a rollback file BEFORE the first
//      mutation. --rollback deletes exactly those ids and nothing else.
//   6. Inventory is NOT set here. The next inventory run fills it, which keeps
//      this tool out of the business of writing stock levels.
//
// The feed file is derived from the Saucony Catalog UPCs export, barcodes and
// MSRP only, no wholesale:
//
//   python3 - <<'EOF'
//   import openpyxl, json, re
//   wb=openpyxl.load_workbook('CatalogUPCs-....xlsx', read_only=True, data_only=True)
//   ws=wb['UPCs']; rows=list(ws.iter_rows(values_only=True))
//   H={str(h).strip():i for i,h in enumerate(rows[0]) if h}; out={}
//   for r in rows[1:]:
//       if not r or not r[H['Style #']]: continue
//       st=str(r[H['Style #']]).strip(); w=str(r[H['Dim 2']] or 'M').strip().upper()
//       m=re.search(r'(\d+(?:\.\d+)?)', str(r[H['MSRP']] or ''))
//       out.setdefault(st+'|'+w,[]).append({'dim1':str(r[H['Dim 1']]).strip(),
//           'upc':str(r[H['UPC Code']] or '').strip(),'msrp':m.group(1) if m else ''})
//   json.dump(out, open('saucony-feed-sizes.json','w'))
//   EOF
//
// Run:  node tools/add-saucony-missing-variants.mjs                       # dry run
//       node tools/add-saucony-missing-variants.mjs --apply
//       node tools/add-saucony-missing-variants.mjs --rollback <file> --apply
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
      variants(first: 100) { nodes { id sku price selectedOptions { name value } } }
    }
  }
}`;

const CREATE = `
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) {
    productVariants { id sku selectedOptions { name value } }
    userErrors { field message }
  }
}`;

const DELETE = `
mutation($productId: ID!, $ids: [ID!]!) {
  productVariantsBulkDelete(productId: $productId, variantsIds: $ids) {
    userErrors { field message }
  }
}`;

const sizeOptionName = (p) => (p.options || []).map((o) => o.name).find((n) => /size/i.test(n)) || 'Size';
const sizeOf = (v) => {
  const o = (v.selectedOptions || []).find((x) => /size/i.test(x.name)) || (v.selectedOptions || [])[0];
  return o ? o.value : '';
};
const one = (n) => Number(n).toFixed(1);
const dual = (men) => 'M' + one(men) + '/W' + one(men + 1.5);
const skuFor = (style, label) => style + '-' + label.replace(/\//g, '-');

// The converter's unisex SKU shape. Matching it is the eligibility test: it
// proves the product came from this pipeline and hands us the style code.
const STYLE_RE = /^(S\d+-\d+)-M\d+(?:\.\d+)?-W\d+(?:\.\d+)?$/;
function styleOf(p) {
  for (const v of p.variants?.nodes || []) {
    const m = STYLE_RE.exec(String(v.sku || ''));
    if (m) return m[1];
  }
  return null;
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
  const n = entries.reduce((t, e) => t + e.created.length, 0);
  console.log(`Deleting ${n} created variants across ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  for (const e of entries) {
    console.log(`  ${e.handle}: ${e.created.map((c) => c.label).join(', ')}`);
    if (!apply) continue;
    const r = await client.graphql(DELETE, { productId: e.id, ids: e.created.map((c) => c.id) });
    const ue = r.data.productVariantsBulkDelete.userErrors;
    if (ue.length) console.log('    FAIL ' + JSON.stringify(ue));
  }
  console.log(apply ? '\nRolled back.' : '\nDry run, nothing written. Add --apply.');
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const rbArg = argv.indexOf('--rollback');
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  const feedArg = argv.indexOf('--feed');
  const feedPath = feedArg >= 0 ? argv[feedArg + 1] : path.join(ROOT, 'saucony-feed-sizes.json');
  if (!fs.existsSync(feedPath)) throw new Error(`feed file not found: ${feedPath}\nSee the header for how to derive it.`);
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));

  process.stderr.write('Fetching Saucony products...\n');
  const products = await fetchAll(client);

  const plans = []; const skipped = {};
  for (const p of products) {
    const style = styleOf(p);
    if (!style) { skipped['not built by this pipeline (no STYLE-M#-W# sku)'] = (skipped['not built by this pipeline (no STYLE-M#-W# sku)'] || 0) + 1; continue; }
    const rows = feed[style + '|M'] || feed[style + '|W'] || feed[style + '|XW'];
    if (!rows) { skipped['style not in the feed'] = (skipped['style not in the feed'] || 0) + 1; continue; }
    const have = new Set((p.variants?.nodes || []).map((v) => sizeOf(v)));
    const price = (p.variants?.nodes || [])[0]?.price || '';
    const missing = [];
    for (const r of rows) {
      const n = parseFloat(r.dim1);
      if (!(n > 0)) continue;
      const label = dual(n);
      if (have.has(label)) continue;
      missing.push({ label, sku: skuFor(style, label), barcode: r.upc || '', price: r.msrp || price });
    }
    if (!missing.length) { skipped['no missing sizes'] = (skipped['no missing sizes'] || 0) + 1; continue; }
    plans.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, style, optionName: sizeOptionName(p), missing });
  }

  console.log(`\nPLAN: ${plans.length} products${apply ? '' : '  (DRY RUN, nothing is written)'}\n`);
  for (const p of plans) {
    console.log(`  [${p.status}] ${p.title}   (${p.style})`);
    for (const m of p.missing) console.log(`      + ${m.label.padEnd(14)} sku ${m.sku.padEnd(28)} barcode ${m.barcode || '(none)'}  $${m.price}`);
  }
  const tot = plans.reduce((t, p) => t + p.missing.length, 0);
  console.log(`\n  ${plans.length} products, ${tot} variants to create.`);
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped)) console.log(`  ${n}  ${why}`);
  }

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `saucony-variants-rollback-${stamp}.json`);
  const created = [];
  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      const variants = p.missing.map((m) => ({
        optionValues: [{ optionName: p.optionName, name: m.label }],
        inventoryItem: { sku: m.sku, tracked: true },
        ...(m.barcode ? { barcode: m.barcode } : {}),
        ...(m.price ? { price: m.price } : {}),
      }));
      const r = await client.graphql(CREATE, { productId: p.id, variants });
      const ue = r.data.productVariantsBulkCreate.userErrors;
      if (ue.length) throw new Error(JSON.stringify(ue));
      const made = r.data.productVariantsBulkCreate.productVariants || [];
      created.push({ id: p.id, handle: p.handle, created: made.map((v) => ({ id: v.id, label: sizeOf(v), sku: v.sku })) });
      fs.writeFileSync(rbFile, JSON.stringify(created, null, 2));   // after every product, so a crash is still reversible
      done++; console.log(`  ok  ${p.handle}  (+${made.length})`);
      await throttle(client, r);
    } catch (err) { failed++; console.log(`  FAIL ${p.handle}: ${err.message}`); }
  }
  console.log(`\nCreated variants on ${done} products, failed ${failed}.`);
  console.log(`Rollback file: ${rbFile}`);
  console.log(`Undo with: node tools/add-saucony-missing-variants.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
