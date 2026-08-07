// activate-needham-variants.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Stocks at Needham the variants that were never stocked there.
//
// WHAT IS ACTUALLY WRONG. In Shopify every variant has a "stocked at this
// location" flag per location. A variant where it is off has no inventory level
// at all, so there is no number to update: an inventory import row for it lands
// on nothing, and the direct write used to count it "not found" and skip. Staff
// see this as "it only updates the half sizes", because on the affected products
// the half sizes are stocked and the whole sizes are not.
//
// Measured 2026-08-07: 113 Needham products hold 708 such variants. On
// hoka-mens-clifton-11-virtual-blue-soft-cobalt it is every whole size, and two
// of them (9 and 10) are already NOT_FULFILLABLE at -1, meaning somebody has
// ordered a size the location cannot supply. That is the cancellation this is
// meant to stop.
//
// ACTIVATES AT ZERO, ON PURPOSE. This tool creates the level and nothing more. It
// does not invent stock, because it has no feed to read and a guessed quantity is
// worse than none. Once the level exists the ordinary inventory push fills in the
// real number, and worker/src/inventory.js now activates-with-quantity for
// anything new it meets from here on, so this is a one-off repair of the backlog.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. Needham only. The location comes from wrangler.toml and every write names
//      it explicitly, so no other location is touched.
//   3. Footwear stocked at Needham only. A product with no Needham presence at
//      all is not "partially stocked", it is simply not ours, and is skipped.
//   4. Nothing that already has a level is touched, so a re-run is a no-op.
//   5. Quantity is always 0. This cannot raise or lower a number that exists.
//   6. Rollback file written before the first mutation, holding the inventory
//      level ids created, so `--rollback <file> --apply` deactivates exactly
//      those and nothing else.
//
// Run:  node tools/activate-needham-variants.mjs                       # dry run, everything
//       node tools/activate-needham-variants.mjs --handle hoka-mens-... # one product
//       node tools/activate-needham-variants.mjs --handle hoka-... --apply
//       node tools/activate-needham-variants.mjs --apply                # the lot
//       node tools/activate-needham-variants.mjs --rollback needham-activate-*.json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const APPLY = has('--apply');
const HANDLE = val('--handle');
const ROLLBACK = val('--rollback');
const LIMIT = Number(val('--limit') || 0);

function env() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
function needhamId() {
  const toml = fs.readFileSync(path.join(ROOT, 'worker', 'wrangler.toml'), 'utf8');
  const m = toml.match(/NEEDHAM_LOCATION_ID\s*=\s*"([^"]+)"/);
  if (!m || !m[1]) throw new Error('NEEDHAM_LOCATION_ID is not set in wrangler.toml, refusing to guess');
  return m[1];
}

const E = env();
const SHOP = (E.SHOP_URL || '').replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';
const NEEDHAM = needhamId();

let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!r.ok) throw new Error('token exchange HTTP ' + r.status);
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function gql(query, variables = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query, variables }),
  });
  if ((r.status === 429 || r.status >= 500) && attempt < 5) {
    await new Promise((s) => setTimeout(s, 1000 * Math.pow(2, attempt)));
    return gql(query, variables, attempt + 1);
  }
  const b = await r.json();
  if ((b.errors || []).some((e) => e.extensions?.code === 'THROTTLED') && attempt < 8) {
    await new Promise((s) => setTimeout(s, 2000));
    return gql(query, variables, attempt + 1);
  }
  if (b.errors) throw new Error('GraphQL: ' + JSON.stringify(b.errors));
  return b;
}

// ---- rollback -------------------------------------------------------------
const DEACTIVATE = `mutation($id: ID!){ inventoryDeactivate(inventoryLevelId: $id){ userErrors{ field message } } }`;
if (ROLLBACK) {
  const entries = JSON.parse(fs.readFileSync(ROLLBACK, 'utf8'));
  console.log(`Rollback: ${entries.length} inventory level(s) to deactivate${APPLY ? '' : '  (DRY RUN)'}`);
  let done = 0, failed = 0;
  for (const e of entries) {
    if (!APPLY) { console.log(`  would deactivate  ${e.sku}`); continue; }
    try {
      const b = await gql(DEACTIVATE, { id: e.levelId });
      const ue = b.data.inventoryDeactivate.userErrors || [];
      if (ue.length) { failed++; console.log(`  FAILED ${e.sku}: ${ue.map((x) => x.message).join('; ')}`); }
      else { done++; }
    } catch (err) { failed++; console.log(`  FAILED ${e.sku}: ${err.message}`); }
  }
  if (APPLY) console.log(`\ndeactivated ${done}, failed ${failed}`);
  process.exit(0);
}

// ---- find the gaps --------------------------------------------------------
// One paged pass over footwear. For each variant we need its inventory item and
// whether a Needham level exists, which is exactly what inventoryLevel(locationId)
// answers: null means not stocked there.
const SCAN = `
query($cursor: String, $q: String, $loc: ID!) {
  products(first: 25, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      handle title productType status
      variants(first: 100) {
        nodes {
          sku
          selectedOptions { name value }
          inventoryItem { id inventoryLevel(locationId: $loc) { id quantities(names: ["on_hand"]) { name quantity } } }
        }
      }
    }
  }
}`;

const q = HANDLE ? `handle:${JSON.stringify(HANDLE)}` : 'product_type:*Shoes*';
const gaps = [];
let scanned = 0, cursor = null;
process.stdout.write('Scanning');
for (;;) {
  const b = await gql(SCAN, { cursor, q, loc: NEEDHAM });
  const conn = b.data.products;
  for (const p of conn.nodes) {
    if (!HANDLE && !/shoes$/i.test(p.productType || '')) continue;
    scanned++;
    const vs = p.variants.nodes;
    const stocked = vs.filter((v) => v.inventoryItem?.inventoryLevel);
    const missing = vs.filter((v) => v.inventoryItem && !v.inventoryItem.inventoryLevel);
    // Only products we actually carry at Needham. One with no level anywhere is
    // not partially stocked, it is somebody else's product.
    if (!stocked.length || !missing.length) continue;
    for (const v of missing) {
      gaps.push({
        handle: p.handle,
        title: p.title,
        size: (v.selectedOptions.find((o) => /size/i.test(o.name)) || {}).value || '',
        sku: v.sku || '',
        inventoryItemId: v.inventoryItem.id,
      });
    }
  }
  if (scanned % 200 < 25) process.stdout.write('.');
  if (!conn.pageInfo.hasNextPage) break;
  if (LIMIT && gaps.length >= LIMIT) break;
  cursor = conn.pageInfo.endCursor;
}
console.log('');

const byHandle = new Map();
for (const g of gaps) (byHandle.get(g.handle) || byHandle.set(g.handle, []).get(g.handle)).push(g);

console.log(`\nScanned ${scanned} footwear products.`);
console.log(`${byHandle.size} product(s) have variants that are not stocked at Needham, ${gaps.length} variant(s) in total.\n`);
for (const [h, list] of [...byHandle.entries()].slice(0, HANDLE ? 50 : 12)) {
  console.log(`  ${h}`);
  console.log(`      ${list.length} not stocked: ${list.map((g) => g.size || g.sku).join(', ')}`);
}
if (!HANDLE && byHandle.size > 12) console.log(`  ...and ${byHandle.size - 12} more products`);

if (!gaps.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) {
  console.log(`\nDRY RUN. Nothing was written. Re-run with --apply to stock these ${gaps.length} variant(s) at Needham, each at 0.`);
  console.log('They stay at 0 until the next inventory push sets the real number.');
  process.exit(0);
}

// ---- apply ----------------------------------------------------------------
const ACTIVATE = `
mutation($item: ID!, $loc: ID!) {
  inventoryActivate(inventoryItemId: $item, locationId: $loc, onHand: 0) {
    inventoryLevel { id }
    userErrors { field message }
  }
}`;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rollbackPath = path.join(ROOT, `needham-activate-rollback-${stamp}.json`);
const created = [];
fs.writeFileSync(rollbackPath, '[]');
console.log(`\nRollback file: ${path.basename(rollbackPath)}`);
console.log(`Activating ${gaps.length} variant(s) at Needham, each at 0...\n`);

let done = 0, failed = 0;
for (const g of gaps) {
  try {
    const b = await gql(ACTIVATE, { item: g.inventoryItemId, loc: NEEDHAM });
    const r = b.data.inventoryActivate || {};
    const ue = r.userErrors || [];
    if (ue.length) {
      failed++;
      console.log(`  FAILED  ${g.handle}  ${g.size}: ${ue.map((x) => x.message).join('; ')}`);
    } else {
      done++;
      created.push({ handle: g.handle, size: g.size, sku: g.sku, levelId: r.inventoryLevel?.id });
      fs.writeFileSync(rollbackPath, JSON.stringify(created, null, 2));
      if (done % 25 === 0) process.stdout.write(`  ${done}/${gaps.length}\n`);
    }
  } catch (err) {
    failed++;
    console.log(`  FAILED  ${g.handle}  ${g.size}: ${err.message}`);
  }
}

console.log(`\nStocked ${done} variant(s) at Needham, ${failed} failed.`);
console.log(`Rollback: node tools/activate-needham-variants.mjs --rollback ${path.basename(rollbackPath)} --apply`);
console.log('Now run the normal inventory push to fill in the real quantities.');
