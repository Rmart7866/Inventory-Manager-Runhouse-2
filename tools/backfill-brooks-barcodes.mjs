// backfill-brooks-barcodes.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Fills in barcodes on Brooks variants that have none.
//
// WHY BROOKS HAS NONE. Every other brand has a barcode source wired in: ASICS
// and ON are baked into barcode-data.js, Hoka carries barcodes in its own feed,
// Saucony was backfilled from the Catalog UPCs export. The Brooks scraper CSV
// has no barcode column and nothing fills the gap, so brooks-converter.js
// writes row.Barcode, which is always empty, and every Brooks product the tool
// has ever created went to Shopify bare. Measured 2026-08-04: all 314 variants
// across the 20 Ghost Max 4 products created that day had no barcode. A bare
// variant is a shoe that cannot be scanned at the till.
//
// THE TWO SKU DIALECTS. Brooks's own variant code is the ITEM_NUMBER in the UPC
// workbook, and the store's older, hand-created products use it verbatim:
//
//     1104962E020.070   =  style 110464 | dim 2E | color 020 | size 7.0
//
// The tool-created products use the scraper's dialect instead:
//
//     110496015-020-750-2E  =  style 110496 + scraper suffix | color 020
//                              | size 7.0 as "750" | dim 2E
//
// which is why an earlier attempt at this join "did not line up". Decode the
// dialect first and it does: 6,024 tool-format Brooks SKUs in the live catalog,
// 5,844 of them resolve, and 314 of 314 on the products created 2026-08-04.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. ONLY variants whose barcode is currently empty are touched. An existing
//      barcode is never overwritten, however wrong it looks: this fills gaps, it
//      does not arbitrate disagreements.
//   3. The lookup is exact. A SKU that does not decode, or decodes to an
//      ITEM_NUMBER the workbook does not carry, is skipped and counted, never
//      guessed at. A wrong barcode is worse than none: it scans as a different
//      shoe.
//   4. A barcode already in use by another variant in the same run is refused,
//      because a duplicate means the decode is wrong, not that two shoes share
//      a code.
//   5. Nothing but the barcode changes. Size, SKU, price, inventory and status
//      are all left alone. Draft products stay drafts.
//   6. Rollback file written before the first mutation. Every change is empty to
//      non-empty, so rolling back means clearing exactly those barcodes.
//
// Feed:  python3 tools/build-brooks-barcode-feed.py    (writes brooks-barcode-feed.json)
//
// Run:  node tools/backfill-brooks-barcodes.mjs                       # dry run, all Brooks
//       node tools/backfill-brooks-barcodes.mjs --title "Ghost Max"   # just that model
//       node tools/backfill-brooks-barcodes.mjs --created 2026-08-04  # just that day
//       node tools/backfill-brooks-barcodes.mjs --title "Ghost Max" --created 2026-08-04 --apply
//       node tools/backfill-brooks-barcodes.mjs --rollback <file> --apply
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
query($cursor: String, $q: String) {
  products(first: 50, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status
      variants(first: 100) { nodes { id sku barcode } }
    }
  }
}`;

const UPDATE = `
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id barcode }
    userErrors { field message }
  }
}`;

// Brooks's own variant code for a tool-created SKU, or null if it does not
// decode. Null means "skip", never "guess".
//
//   110496015-020-750-2E  ->  1104962E020.070
//   120485026-173-555-B   ->  1204851B173.055
//
// Width: the workbook writes a single-letter width as "1D" / "1B", so a
// one-character dim gets the implicit 1. Two-character dims (2A, 2E, 4E) are
// already in that shape.
//
// Size: the dialect writes size 7.0 as "750" and 7.5 as "755", ie the whole
// number followed by 50 or 55, while ITEM_NUMBER writes tenths, ".070" / ".075".
const TOOL_SKU = /^(\d{6})\d*-(\d{3})-(\d+)-([A-Z0-9]{1,2})$/;
const ITEM_SKU = /^\d{6}[0-9][A-Z]\d{3}\.\d{3}$/;

export function brooksItemNumber(sku) {
  const s = String(sku || '').trim().toUpperCase();
  if (!s) return null;
  if (ITEM_SKU.test(s)) return s; // already Brooks's own code, use it as is
  const m = TOOL_SKU.exec(s);
  if (!m) return null;
  const [, style, color, sizeCode, dim] = m;
  const dimCode = dim.length === 2 ? dim : '1' + dim;
  const whole = sizeCode.slice(0, -2);
  const tail = sizeCode.slice(-2);
  if (!whole || (tail !== '50' && tail !== '55')) return null;
  const size = parseFloat(whole) + (tail === '55' ? 0.5 : 0);
  if (!Number.isFinite(size)) return null;
  return `${style}${dimCode}${color}.${String(Math.round(size * 10)).padStart(3, '0')}`;
}

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

async function fetchAll(client, q) {
  const out = []; let cursor = null;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor, q });
    out.push(...body.data.products.nodes);
    await throttle(client, body);
    if (!body.data.products.pageInfo.hasNextPage) break;
    cursor = body.data.products.pageInfo.endCursor;
  }
  return out;
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  const n = entries.reduce((t, e) => t + e.fills.length, 0);
  console.log(`Clearing ${n} barcodes across ${entries.length} products${apply ? '' : ' (DRY RUN)'}`);
  console.log('Every one of these was empty before the run, so clearing restores the before-state.\n');
  for (const e of entries) {
    console.log(`  ${e.handle}: ${e.fills.length} variants`);
    if (!apply) continue;
    const r = await client.graphql(UPDATE, { productId: e.id, variants: e.fills.map((f) => ({ id: f.id, barcode: '' })) });
    const ue = r.data.productVariantsBulkUpdate.userErrors;
    if (ue.length) console.log('    FAIL ' + JSON.stringify(ue));
  }
  console.log(apply ? '\nRolled back.' : '\nDry run, nothing written. Add --apply.');
}

function argOf(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const client = createShopifyClient(loadDevVars());
  const rb = argOf(argv, '--rollback');
  if (rb) return rollback(client, rb, apply);

  const feedPath = argOf(argv, '--feed') || path.join(ROOT, 'brooks-barcode-feed.json');
  if (!fs.existsSync(feedPath)) {
    throw new Error(`feed not found: ${feedPath}\nBuild it first:  python3 tools/build-brooks-barcode-feed.py`);
  }
  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));

  // Scope. Both filters are Shopify-side, so a targeted run costs one page.
  const title = argOf(argv, '--title');
  const created = argOf(argv, '--created');
  let q = 'vendor:Brooks';
  if (title) q += ` AND title:*${title}*`;
  if (created) q += ` AND created_at:>=${created}`;
  process.stderr.write(`Fetching Brooks products (${q})...\n`);
  const products = await fetchAll(client, q);

  const plans = [];
  const seenCodes = new Map();  // barcode -> first sku that claimed it
  let alreadyHave = 0, noDecode = 0, notInFeed = 0, duplicate = 0, totalVariants = 0;

  for (const p of products) {
    const fills = [];
    for (const v of p.variants?.nodes || []) {
      totalVariants++;
      if (v.barcode) { alreadyHave++; continue; }
      const item = brooksItemNumber(v.sku);
      if (!item) { noDecode++; continue; }
      const code = feed[item];
      if (!code) { notInFeed++; continue; }
      if (seenCodes.has(code)) { duplicate++; continue; }
      seenCodes.set(code, v.sku);
      fills.push({ id: v.id, sku: v.sku, item, barcode: code });
    }
    if (fills.length) plans.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, fills });
  }

  const fillCount = plans.reduce((t, e) => t + e.fills.length, 0);
  console.log(`\nProducts matched: ${products.length}, variants: ${totalVariants}`);
  console.log(`  already have a barcode : ${alreadyHave}`);
  console.log(`  SKU does not decode    : ${noDecode}`);
  console.log(`  not in the UPC file    : ${notInFeed}`);
  console.log(`  duplicate code refused : ${duplicate}`);
  console.log(`  TO FILL                : ${fillCount} across ${plans.length} products\n`);

  for (const e of plans) {
    const s = e.fills[0];
    console.log(`  ${e.status.padEnd(7)} ${e.title.slice(0, 50).padEnd(52)} ${e.fills.length} variants   eg ${s.sku} -> ${s.item} -> ${s.barcode}`);
  }

  if (!fillCount) { console.log('\nNothing to fill.'); return; }
  if (!apply) {
    console.log('\nDRY RUN, nothing written. Add --apply to write.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `brooks-barcode-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans, null, 2));
  console.log(`\nRollback written to ${path.basename(rbFile)}. Undo with:`);
  console.log(`  node tools/backfill-brooks-barcodes.mjs --rollback ${path.basename(rbFile)} --apply\n`);

  let done = 0, failed = 0;
  for (const e of plans) {
    const r = await client.graphql(UPDATE, { productId: e.id, variants: e.fills.map((f) => ({ id: f.id, barcode: f.barcode })) });
    const ue = r.data.productVariantsBulkUpdate.userErrors;
    if (ue.length) { failed += e.fills.length; console.log(`  FAIL ${e.handle}: ${JSON.stringify(ue)}`); }
    else { done += e.fills.length; console.log(`  ok   ${e.handle}: ${e.fills.length}`); }
    await throttle(client, r);
  }
  console.log(`\nFilled ${done} barcodes, ${failed} failed.`);
}

// Only when run as a script. brooksItemNumber is exported for reuse and for
// tests, and importing it must not kick off a Shopify fetch.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
