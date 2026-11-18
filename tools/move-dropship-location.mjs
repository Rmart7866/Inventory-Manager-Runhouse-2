// move-dropship-location.mjs, The Run House. DRY RUN ONLY for now.
//
// Plans the move of dropship stock from NEEDHAM to DROPSHIP WAREHOUSE (owner
// decision 2026-11-18: Needham is a real store, dropship gets its own
// location). It reads, sorts and reports; it writes nothing. The apply step is
// deliberately not built until this plan has been reviewed.
//
// WHY A SORT AND NOT "MOVE EVERYTHING". Needham holds two kinds of stock in
// the same numbers: supplier availability written nightly by the dropship
// runs, and the Needham store's own shelf. Only the first may move. So each
// non-zero Needham level is put in one bucket:
//
//   MOVE      the SKU is in a supplier's current feed: the nightly run owns
//             this number, so it is dropship by definition
//   REVIEW    a supplier-brand shoe, spike or garment the tool tracks, at
//             Needham, that NO current feed lists: old dropship stock the
//             supplier dropped, or real shelf stock. A person decides
//   STAY      everything else: The Run House's own gear, accessories,
//             nutrition, brands the tool does not scrape. Store stock
//   NEGATIVE  below zero, reported on its own and never moved
//
// COMMITTED units (promised to an open order) stay at Needham until that
// order ships, because its fulfillment order points at Needham; only the
// uncommitted part of a MOVE level moves.
//
// It also lists every OPEN fulfillment order still assigned to Needham, split
// into dropship lines and store lines, which is what Late orders, Draft in
// HOKA and tracking keep watching through DROPSHIP_WATCH_IDS.
//
//   node tools/move-dropship-location.mjs           dry run, writes the plan
//
// Outputs (gitignored, never committed): a summary on screen, and
// ~/Library/Logs/runhouse-autowrite/dropship-move-plan-<stamp>.csv
//
// House style: no em dashes.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';
import { loadTool } from './auto-write.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEEDHAM = 'gid://shopify/Location/77957136639';
const TARGET = 'gid://shopify/Location/97494139135';   // Dropship Warehouse, created 2026-11-18
const OUT_DIR = path.join(os.homedir(), 'Library', 'Logs', 'runhouse-autowrite');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv.includes('--apply')) {
  console.error('REFUSED: the apply step is not built yet, on purpose. Review the dry run plan first.');
  process.exit(1);
}

function client() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, 'worker', '.dev.vars'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  env.SHOP_URL = env.SHOP_URL || 'therunhouse.myshopify.com';
  env.API_VERSION = env.API_VERSION || '2026-01';
  return createShopifyClient(env);
}
async function throttle(body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.25) await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
}

// Every supplier feed's SKUs, through the tool's own converters, from the
// newest scheduled file per brand in ~/Downloads.
async function feedSkus() {
  const D = path.join(os.homedir(), 'Downloads') + '/';
  const newest = (re) => fs.readdirSync(D).filter((f) => re.test(f) && !/SMOKE|TEST/.test(f)).map((f) => [f, fs.statSync(D + f).mtimeMs]).sort((a, b) => b[1] - a[1])[0]?.[0];
  const FILES = {
    saucony: newest(/^CatalogUPCs-Autumn.*nightly.*\.xlsx$/), merrell: newest(/^CatalogUPCs-Merrell.*nightly.*\.xlsx$/),
    hoka: newest(/^Fall 2026 Bondi 9.*nightly.*\.xlsx$/), brooks: newest(/^brooks-fullcatalog-2026.*\.csv$/),
    asics: newest(/^asics-linkapi-2026.*\.csv$/), puma: newest(/^Master ATS nightly.*\.xlsx$/),
    newbalance: newest(/^Consumer Drop Ship CDS ASAP nightly.*\.xlsx$/), altra: newest(/^Altra ATS nightly.*\.xlsx$/),
    on: newest(/^on-running-inventory-\d+\.csv$/),
  };
  const all = new Set(), used = {};
  for (const [brand, file] of Object.entries(FILES)) {
    if (!file) { used[brand] = 'no file'; continue; }
    try {
      const T = loadTool(); const conv = T.BRAND_CONFIG[brand].converter();
      const buf = fs.readFileSync(D + file);
      const f = { name: file, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), text: async () => buf.toString('utf8') };
      conv.selectedProducts = new Set();
      const inv = T.BRAND_CONFIG[brand].multiFile ? await conv.convert([f]) : await conv.convert(f);
      const s = conv.allFeedSkus && conv.allFeedSkus.size ? conv.allFeedSkus : new Set(inv.map((r) => String(r.SKU).toUpperCase()));
      s.forEach((x) => all.add(String(x).toUpperCase()));
      // The tool also writes the store's own SKU spelling (alignInventoryToCatalog).
      inv.forEach((r) => r.SKU && all.add(String(r.SKU).toUpperCase()));
      used[brand] = file + ' (' + s.size + ' skus)';
    } catch (e) { used[brand] = 'could not read: ' + e.message; }
  }
  return { all, used };
}

const BRAND_VENDOR = /^(saucony|asics|hoka|hoka one one|new balance|brooks|brooks running|on|on running|puma|altra|merrell)$/i;
const TRACKED_TYPE = /(shoes$|^athletic footwear$|^footwear$|^spikes$|tanks?|hoodies|sweatshirts|t-shirts?|short sleeve|long sleeves|crewnecks|half-zips|full zips|jackets?|vests|shorts|pants|sweatpants|joggers|tights\/leggings|skorts|sports bras)/i;

async function needhamLevels(c) {
  const out = []; let after = null, pages = 0;
  for (;;) {
    const body = await c.graphql(`query($a:String){ location(id:"${NEEDHAM}"){ inventoryLevels(first:200, after:$a){ pageInfo{hasNextPage endCursor}
      nodes{ quantities(names:["on_hand","committed"]){ name quantity }
        item{ id variant{ id sku displayName product{ title vendor productType status } } } } } } }`, { a: after });
    const d = body.data.location.inventoryLevels;
    for (const n of d.nodes) {
      const q = Object.fromEntries(n.quantities.map((x) => [x.name, x.quantity]));
      if (!q.on_hand && !q.committed) continue;
      const v = n.item.variant; if (!v) continue;
      out.push({ itemId: n.item.id, sku: v.sku || '', name: v.displayName, vendor: v.product.vendor || '', type: v.product.productType || '', status: v.product.status, onHand: q.on_hand || 0, committed: q.committed || 0 });
    }
    pages++; if (pages % 20 === 0) process.stderr.write('  read ' + pages + ' pages of Needham levels...\n');
    await throttle(body);
    if (!d.pageInfo.hasNextPage) break; after = d.pageInfo.endCursor;
  }
  return out;
}

async function openNeedhamOrders(c) {
  const since = new Date(Date.now() - 120 * 86400e3).toISOString().slice(0, 10);
  const out = []; let after = null;
  for (;;) {
    const body = await c.graphql(`query($a:String,$q:String){ orders(first:50, after:$a, query:$q){ pageInfo{hasNextPage endCursor}
      nodes{ name createdAt fulfillmentOrders(first:10){ nodes{ status assignedLocation{ location{ id } }
        lineItems(first:30){ nodes{ remainingQuantity lineItem{ vendor product{ productType } } } } } } } } }`,
      { a: after, q: 'created_at:>=' + since + ' -status:cancelled (fulfillment_status:unshipped OR fulfillment_status:partial)' });
    const d = body.data.orders;
    for (const o of d.nodes) {
      let drop = 0, store = 0;
      for (const fo of o.fulfillmentOrders.nodes) {
        if (!['OPEN', 'IN_PROGRESS'].includes(fo.status) || fo.assignedLocation?.location?.id !== NEEDHAM) continue;
        for (const l of fo.lineItems.nodes) {
          if (!(l.remainingQuantity > 0)) continue;
          const dropship = BRAND_VENDOR.test(String(l.lineItem.vendor || '').trim()) && TRACKED_TYPE.test(String(l.lineItem.product?.productType || ''));
          if (dropship) drop += l.remainingQuantity; else store += l.remainingQuantity;
        }
      }
      if (drop || store) out.push({ order: o.name, at: o.createdAt.slice(0, 10), drop, store });
    }
    await throttle(body);
    if (!d.pageInfo.hasNextPage) break; after = d.pageInfo.endCursor;
  }
  return out;
}

const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

async function main() {
  const c = client();
  const loc = await c.graphql(`{ a: location(id:"${NEEDHAM}"){ name isActive } b: location(id:"${TARGET}"){ name isActive fulfillsOnlineOrders hasActiveInventory } }`);
  console.log('from: ' + loc.data.a.name + '   to: ' + loc.data.b.name + ' (active ' + loc.data.b.isActive + ', online ' + loc.data.b.fulfillsOnlineOrders + ', holds stock ' + loc.data.b.hasActiveInventory + ')');

  process.stderr.write('reading the supplier feeds...\n');
  const { all: feed, used } = await feedSkus();
  for (const [b, u] of Object.entries(used)) console.log('  feed ' + b.padEnd(10) + u);

  process.stderr.write('reading every Needham level...\n');
  const levels = await needhamLevels(c);
  const plan = { MOVE: [], REVIEW: [], STAY: [], NEGATIVE: [] };
  for (const l of levels) {
    let b;
    if (l.onHand < 0) b = 'NEGATIVE';
    else if (l.sku && feed.has(l.sku.toUpperCase())) b = 'MOVE';
    else if (BRAND_VENDOR.test(l.vendor.trim()) && TRACKED_TYPE.test(l.type)) b = 'REVIEW';
    else b = 'STAY';
    l.bucket = b;
    l.moveUnits = b === 'MOVE' ? Math.max(0, l.onHand - l.committed) : 0;
    plan[b].push(l);
  }

  process.stderr.write('reading open orders assigned to Needham...\n');
  const orders = await openNeedhamOrders(c);

  const units = (a, k = 'onHand') => a.reduce((t, x) => t + x[k], 0);
  console.log('\nNEEDHAM LEVELS WITH STOCK OR COMMITMENTS: ' + levels.length);
  for (const b of ['MOVE', 'REVIEW', 'STAY', 'NEGATIVE']) {
    const a = plan[b];
    console.log('  ' + b.padEnd(9) + String(a.length).padStart(6) + ' variants  ' + String(units(a)).padStart(8) + ' on hand' + (b === 'MOVE' ? '  (' + units(a, 'moveUnits') + ' would move, ' + units(a, 'committed') + ' committed stay)' : ''));
  }
  const byV = (a) => { const o = {}; a.forEach((x) => { const k = x.vendor || '(none)'; o[k] = o[k] || [0, 0]; o[k][0]++; o[k][1] += x.onHand; }); return Object.entries(o).sort((p, q) => q[1][1] - p[1][1]); };
  console.log('\nMOVE by brand:'); byV(plan.MOVE).forEach(([k, [n, u]]) => console.log('  ' + k.padEnd(18) + String(n).padStart(6) + ' variants ' + String(u).padStart(8) + ' units'));
  console.log('\nREVIEW by brand (supplier stock no feed lists):'); byV(plan.REVIEW).forEach(([k, [n, u]]) => console.log('  ' + k.padEnd(18) + String(n).padStart(6) + ' variants ' + String(u).padStart(8) + ' units'));
  console.log('\nSTAY, the largest:'); byV(plan.STAY).slice(0, 12).forEach(([k, [n, u]]) => console.log('  ' + k.padEnd(28) + String(n).padStart(6) + ' variants ' + String(u).padStart(8) + ' units'));

  const dropOrders = orders.filter((o) => o.drop), storeOrders = orders.filter((o) => o.store);
  console.log('\nOPEN ORDERS ASSIGNED TO NEEDHAM: ' + orders.length + ' | with dropship lines ' + dropOrders.length + ' (' + dropOrders.reduce((t, o) => t + o.drop, 0) + ' units) | with store lines ' + storeOrders.length + ' (' + storeOrders.reduce((t, o) => t + o.store, 0) + ' units)');
  console.log('  oldest: ' + orders.slice(-5).map((o) => o.order + ' ' + o.at).join(', '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const file = path.join(OUT_DIR, 'dropship-move-plan-' + stamp + '.csv');
  const rows = [['bucket', 'sku', 'variant', 'vendor', 'type', 'status', 'needham_on_hand', 'committed', 'would_move', 'inventory_item_id']]
    .concat(levels.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name))
      .map((l) => [l.bucket, l.sku, l.name, l.vendor, l.type, l.status, l.onHand, l.committed, l.moveUnits, l.itemId]));
  fs.writeFileSync(file, rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  const ofile = path.join(OUT_DIR, 'dropship-move-open-orders-' + stamp + '.csv');
  fs.writeFileSync(ofile, [['order', 'created', 'dropship_units', 'store_units']].concat(orders.map((o) => [o.order, o.at, o.drop, o.store])).map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  console.log('\nplan: ' + file + '\norders: ' + ofile + '\nDRY RUN. Nothing was written.');
}

main().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
