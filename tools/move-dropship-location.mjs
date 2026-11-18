// move-dropship-location.mjs, The Run House. DRY RUN unless you pass --apply.
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
// WHAT MOVES (owner, 2026-11-18): MOVE and REVIEW. STAY and NEGATIVE stay at
// Needham, and the store scan that follows the move sets the real shelf
// counts, so a few store pairs carried across with REVIEW come back that way.
//
// HOW A SIZE MOVES, and why in this order. There is no "transfer" between
// locations that is not a whole purchase order flow, so it is two writes:
//   1. LOWER Needham to its committed units, guarded by compareQuantity, so a
//      count that changed since it was read (a sale) is refused, not clobbered
//   2. STOCK Dropship Warehouse with exactly the units removed (activate the
//      item there if it is new, otherwise a guarded set)
//   3. if 2 fails, put those units straight back at Needham
// Lowering first means a failure can only ever leave stock MISSING for a
// moment, never counted twice and oversold. Every step is journalled as it
// happens, so --restore can undo the run and a rerun never moves a size twice
// (after a move Needham holds only its committed units, so the fresh plan has
// nothing left to move for that size).
//
// It refuses to start unless the nightly writes are paused
// (~/.runhouse-autowrite-off), because a run writing Needham mid move would
// put dropship numbers back there, and unless Dropship Warehouse is active,
// fulfils online orders and is in a shipping profile. And it refuses while an
// earlier journal has a size lowered at Needham and never stocked or put back.
//
//   node tools/move-dropship-location.mjs                    dry run, writes the plan
//   node tools/move-dropship-location.mjs --apply --limit 5  move 5 sizes, a live test
//   node tools/move-dropship-location.mjs --apply            move everything planned
//   node tools/move-dropship-location.mjs --restore <journal.jsonl>   undo a run
//
// AFTER A FULL MOVE, at once: set DROPSHIP_LOCATION_ID / _NAME in
// wrangler.toml to Dropship Warehouse, DROPSHIP_WATCH_IDS to Needham, deploy,
// push the staff site, then remove the off switch. Until the Worker says
// Dropship Warehouse, every write still goes to Needham.
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

const OFF_SWITCH = path.join(os.homedir(), '.runhouse-autowrite-off');
const argOf = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };

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
  // ONE tool instance with the live catalog loaded, so every feed row is also
  // put through alignInventoryToCatalog, exactly as the nightly write does.
  // That is what turns a feed SKU into the store's OWN spelling of it (Brooks
  // keeps two dialects, 110496015-020-750-2E and 1104962E020.070); without it
  // the first dry run read 2,861 fed Brooks variants as unfed.
  const T = loadTool();
  await T.CatalogClient.fetchCatalog(true);
  for (const [brand, file] of Object.entries(FILES)) {
    if (!file) { used[brand] = 'no file'; continue; }
    try {
      await T.InventoryTracker.load(brand).catch(() => null);
      const conv = T.BRAND_CONFIG[brand].converter();
      const buf = fs.readFileSync(D + file);
      const f = { name: file, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), text: async () => buf.toString('utf8') };
      conv.selectedProducts = new Set();
      const inv = T.BRAND_CONFIG[brand].multiFile ? await conv.convert([f]) : await conv.convert(f);
      const s = conv.allFeedSkus && conv.allFeedSkus.size ? conv.allFeedSkus : new Set(inv.map((r) => String(r.SKU).toUpperCase()));
      s.forEach((x) => all.add(String(x).toUpperCase()));
      // The store's own spelling of the same rows, as the nightly write sends them.
      T.alignInventoryToCatalog(brand, inv).forEach((r) => r.SKU && all.add(String(r.SKU).toUpperCase()));
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

// ---- the apply step --------------------------------------------------------

const SET = `mutation($input: InventorySetQuantitiesInput!){ inventorySetQuantities(input:$input){
  userErrors{ field message code } inventoryAdjustmentGroup{ createdAt } } }`;
const ACTIVATE = `mutation($i:ID!,$l:ID!,$q:Int!){ inventoryActivate(inventoryItemId:$i, locationId:$l, onHand:$q){
  inventoryLevel{ id } userErrors{ field message } } }`;

// Current on hand and committed per item at a location. An item with no level
// there (never stocked) is simply absent from the map.
export async function levelsAt(c, loc, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const body = await c.graphql(`query($ids:[ID!]!,$loc:ID!){ nodes(ids:$ids){ ... on InventoryItem { id
      inventoryLevel(locationId:$loc){ quantities(names:["on_hand","committed"]){ name quantity } } } } }`, { ids: ids.slice(i, i + 100), loc });
    for (const n of body.data.nodes) {
      if (!n || !n.inventoryLevel) continue;
      const q = Object.fromEntries(n.inventoryLevel.quantities.map((x) => [x.name, x.quantity]));
      out.set(n.id, { onHand: q.on_hand || 0, committed: q.committed || 0 });
    }
    await throttle(body);
  }
  return out;
}

// One guarded inventorySetQuantities. Lines are { item, from, to }; `from` is
// the compareQuantity, so a number that moved since the read is refused.
async function setMany(c, loc, lines, uri) {
  try {
    const body = await c.graphql(SET, { input: {
      name: 'on_hand', reason: 'correction', referenceDocumentUri: uri, ignoreCompareQuantity: false,
      quantities: lines.map((l) => ({ inventoryItemId: l.item, locationId: loc, quantity: l.to, compareQuantity: l.from })),
    } });
    await throttle(body);
    const ue = (body.data && body.data.inventorySetQuantities && body.data.inventorySetQuantities.userErrors) || [];
    return ue.length ? { error: ue[0].message } : { ok: true };
  } catch (e) { return { error: e.message }; }
}

// The whole batch in one call; if it is refused (one size changed under us),
// one at a time so a single sale cannot hold back 249 other sizes.
async function setGuarded(c, loc, lines, uri) {
  if (!lines.length) return { done: [], failed: [] };
  const r = await setMany(c, loc, lines, uri);
  if (r.ok) return { done: lines, failed: [] };
  const done = [], failed = [];
  for (const l of lines) {
    const r1 = await setMany(c, loc, [l], uri);
    if (r1.ok) done.push(l); else failed.push({ ...l, why: r1.error });
  }
  return { done, failed };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export function readJournal(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

// Per item, from a journal: units still owed back to Needham and units that
// reached Dropship Warehouse, net of reverts and restores.
export function netOf(entries) {
  const m = new Map();
  const at = (id) => { if (!m.has(id)) m.set(id, { item: id, owed: 0, atTarget: 0 }); return m.get(id); };
  for (const e of entries) for (const x of e.items || []) {
    const r = at(x.item);
    if (e.t === 'lowered') r.owed += x.units;
    else if (e.t === 'reverted') r.owed -= x.units;
    else if (e.t === 'added') r.atTarget += x.units;
    else if (e.t === 'restored') { r.owed -= x.needham; r.atTarget -= x.target; }
  }
  return [...m.values()];
}

// A size lowered at Needham that is neither at Dropship Warehouse nor back:
// stock that exists and is on no shelf in Shopify. Never start over that.
export function stuckOf(entries) { return netOf(entries).filter((r) => r.owed > r.atTarget); }

export function unfinishedJournals(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /^dropship-move-journal-.*\.jsonl$/.test(f))
    .map((f) => ({ file: path.join(dir, f), stuck: stuckOf(readJournal(path.join(dir, f))) })).filter((j) => j.stuck.length);
}

export async function preflight(c, { offSwitch = OFF_SWITCH, journalDir = OUT_DIR, profileChecked = false } = {}) {
  const problems = [];
  if (!fs.existsSync(offSwitch)) problems.push('the nightly writes are not paused: touch ' + offSwitch + ' first, so no run writes Needham mid move');
  const loc = (await c.graphql(`{ l: location(id:"${TARGET}"){ name isActive fulfillsOnlineOrders } }`)).data.l;
  if (!loc || !loc.isActive) problems.push('Dropship Warehouse is missing or inactive');
  else if (!loc.fulfillsOnlineOrders) problems.push('Dropship Warehouse does not fulfil online orders');
  if (!profileChecked) {
    try {
      const body = await c.graphql(`{ deliveryProfiles(first:25){ nodes{ name profileLocationGroups{ locationGroup{ locations(first:250){ nodes{ id } } } } } } }`);
      const inProfile = body.data.deliveryProfiles.nodes.some((p) => p.profileLocationGroups.some((g) => g.locationGroup.locations.nodes.some((l) => l.id === TARGET)));
      if (!inProfile) problems.push('Dropship Warehouse is in no shipping profile: add it to General first, or online orders cannot route there');
    } catch (e) { problems.push('could not read the shipping profiles (' + String(e.message).slice(0, 120) + '); check by hand, then pass --profile-checked'); }
  }
  for (const j of unfinishedJournals(journalDir)) problems.push(j.stuck.length + ' sizes in ' + path.basename(j.file) + ' were lowered at Needham and never stocked or put back: run --restore on it first');
  return problems;
}

// Move the planned sizes. Numbers are re-read per batch, never taken from the
// plan, and the units moved are on hand minus committed AT THAT MOMENT.
export async function applyMove(c, itemIds, { journal, uri, log = console.log, batch = 250, concurrency = 6 } = {}) {
  const J = (e) => fs.appendFileSync(journal, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n');
  const res = { moved: 0, units: 0, skipped: [], reverted: 0 };
  for (let i = 0; i < itemIds.length; i += batch) {
    const ids = itemIds.slice(i, i + batch);
    const nd = await levelsAt(c, NEEDHAM, ids);
    const want = [];
    for (const id of ids) {
      const q = nd.get(id);
      if (!q) { res.skipped.push({ item: id, why: 'no Needham level' }); continue; }
      const units = q.onHand - Math.max(0, q.committed);
      if (units > 0) want.push({ item: id, from: q.onHand, to: q.onHand - units, units });
    }
    // 1. lower Needham
    const low = await setGuarded(c, NEEDHAM, want, uri);
    low.failed.forEach((f) => res.skipped.push({ item: f.item, why: 'Needham changed since read: ' + f.why }));
    if (!low.done.length) continue;
    J({ t: 'lowered', items: low.done });
    // 2. stock Dropship Warehouse
    const tg = await levelsAt(c, TARGET, low.done.map((l) => l.item));
    const added = [], failed = [];
    const active = low.done.filter((l) => tg.has(l.item));
    const fresh = low.done.filter((l) => !tg.has(l.item));
    const set = await setGuarded(c, TARGET, active.map((l) => ({ item: l.item, from: tg.get(l.item).onHand, to: tg.get(l.item).onHand + l.units, units: l.units })), uri);
    added.push(...set.done);
    set.failed.forEach((f) => failed.push({ ...low.done.find((l) => l.item === f.item), why: f.why }));
    await pool(fresh, concurrency, async (l) => {
      try {
        const body = await c.graphql(ACTIVATE, { i: l.item, l: TARGET, q: l.units });
        await throttle(body);
        const ue = body.data.inventoryActivate.userErrors || [];
        if (ue.length) failed.push({ ...l, why: ue[0].message }); else added.push({ item: l.item, from: 0, to: l.units, units: l.units });
      } catch (e) { failed.push({ ...l, why: e.message }); }
    });
    if (added.length) J({ t: 'added', items: added });
    // 3. anything not stocked goes straight back to Needham
    if (failed.length) {
      const back = await setGuarded(c, NEEDHAM, failed.map((f) => ({ item: f.item, from: f.to, to: f.from, units: f.units })), uri);
      if (back.done.length) J({ t: 'reverted', items: back.done });
      res.reverted += back.done.length;
      failed.forEach((f) => res.skipped.push({ item: f.item, why: 'Dropship Warehouse refused: ' + f.why }));
      if (back.failed.length) {
        J({ t: 'stuck', items: back.failed });
        throw new Error('STOPPED: ' + back.failed.length + ' sizes were lowered at Needham and could neither be stocked at Dropship Warehouse nor put back. Run --restore ' + journal);
      }
    }
    res.moved += added.length;
    res.units += added.reduce((t, a) => t + a.units, 0);
    log('  ' + Math.min(i + batch, itemIds.length) + ' of ' + itemIds.length + ' planned: ' + res.moved + ' sizes, ' + res.units + ' units moved, ' + res.skipped.length + ' skipped');
  }
  return res;
}

// Undo a run from its journal: take back what reached Dropship Warehouse, then
// give Needham what it is owed. If some of it sold at Dropship Warehouse in the
// meantime, only what is still there goes back, so nothing is counted twice.
export async function restoreMove(c, entries, { journal, uri, log = console.log, batch = 250 } = {}) {
  const J = (e) => fs.appendFileSync(journal, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n');
  const todo = netOf(entries).filter((r) => r.owed > 0 || r.atTarget > 0);
  const res = { restored: 0, units: 0, failed: [] };
  for (let i = 0; i < todo.length; i += batch) {
    const part = todo.slice(i, i + batch), ids = part.map((r) => r.item);
    const tg = await levelsAt(c, TARGET, ids);
    const take = part.filter((r) => r.atTarget > 0 && tg.has(r.item)).map((r) => {
      const cur = tg.get(r.item).onHand, n = Math.max(0, Math.min(r.atTarget, cur));
      return { item: r.item, from: cur, to: cur - n, units: n };
    }).filter((l) => l.units > 0);
    const took = await setGuarded(c, TARGET, take, uri);
    took.failed.forEach((f) => res.failed.push({ item: f.item, why: 'Dropship Warehouse changed: ' + f.why }));
    const tookBy = new Map(took.done.map((l) => [l.item, l.units]));
    const failedTake = new Set(took.failed.map((f) => f.item));
    const nd = await levelsAt(c, NEEDHAM, ids);
    const give = part.filter((r) => !failedTake.has(r.item) && nd.has(r.item)).map((r) => {
      const t = tookBy.get(r.item) || 0;
      const n = Math.max(0, r.owed - (r.atTarget - t));   // units that sold at the target are not returned
      return { item: r.item, from: nd.get(r.item).onHand, to: nd.get(r.item).onHand + n, units: n, target: t };
    }).filter((l) => l.units > 0 || l.target > 0);
    const gave = await setGuarded(c, NEEDHAM, give.filter((l) => l.units > 0), uri);
    gave.failed.forEach((f) => res.failed.push({ item: f.item, why: 'Needham changed: ' + f.why }));
    const gaveSet = new Set(gave.done.map((l) => l.item));
    const rec = give.filter((l) => gaveSet.has(l.item) || l.units === 0).map((l) => ({ item: l.item, needham: l.units, target: l.target }));
    if (rec.length) J({ t: 'restored', items: rec });
    res.restored += rec.length; res.units += rec.reduce((t, r) => t + r.needham, 0);
    log('  restored ' + res.restored + ' sizes, ' + res.units + ' units back at Needham, ' + res.failed.length + ' failed');
  }
  return res;
}

async function main() {
  const c = client();
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const uri = 'gid://runhouse/DropshipMove/' + stamp;

  if (process.argv.includes('--restore')) {
    const file = argOf('--restore');
    if (!file || !fs.existsSync(file)) throw new Error('--restore needs a journal file');
    const r = await restoreMove(c, readJournal(file), { journal: file, uri });
    console.log('\nRESTORE: ' + r.restored + ' sizes, ' + r.units + ' units back at Needham, ' + r.failed.length + ' failed' + (r.failed.length ? ' (rerun --restore to retry them)' : ''));
    if (r.failed.length) process.exitCode = 1;
    return;
  }
  const APPLY = process.argv.includes('--apply');
  const LIMIT = argOf('--limit') ? Number(argOf('--limit')) : Infinity;
  if (APPLY) {
    const problems = await preflight(c, { profileChecked: process.argv.includes('--profile-checked') });
    if (problems.length) { console.error('REFUSED, nothing written:\n  - ' + problems.join('\n  - ')); process.exitCode = 1; return; }
  }
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
    l.moveUnits = (b === 'MOVE' || b === 'REVIEW') ? Math.max(0, l.onHand - Math.max(0, l.committed)) : 0;
    plan[b].push(l);
  }

  process.stderr.write('reading open orders assigned to Needham...\n');
  const orders = await openNeedhamOrders(c);

  const units = (a, k = 'onHand') => a.reduce((t, x) => t + x[k], 0);
  console.log('\nNEEDHAM LEVELS WITH STOCK OR COMMITMENTS: ' + levels.length);
  for (const b of ['MOVE', 'REVIEW', 'STAY', 'NEGATIVE']) {
    const a = plan[b];
    console.log('  ' + b.padEnd(9) + String(a.length).padStart(6) + ' variants  ' + String(units(a)).padStart(8) + ' on hand' + ((b === 'MOVE' || b === 'REVIEW') ? '  (' + units(a, 'moveUnits') + ' would move, ' + units(a, 'committed') + ' committed stay)' : ''));
  }
  const byV = (a) => { const o = {}; a.forEach((x) => { const k = x.vendor || '(none)'; o[k] = o[k] || [0, 0]; o[k][0]++; o[k][1] += x.onHand; }); return Object.entries(o).sort((p, q) => q[1][1] - p[1][1]); };
  console.log('\nMOVE by brand:'); byV(plan.MOVE).forEach(([k, [n, u]]) => console.log('  ' + k.padEnd(18) + String(n).padStart(6) + ' variants ' + String(u).padStart(8) + ' units'));
  console.log('\nREVIEW by brand (supplier stock no feed lists):'); byV(plan.REVIEW).forEach(([k, [n, u]]) => console.log('  ' + k.padEnd(18) + String(n).padStart(6) + ' variants ' + String(u).padStart(8) + ' units'));
  console.log('\nSTAY, the largest:'); byV(plan.STAY).slice(0, 12).forEach(([k, [n, u]]) => console.log('  ' + k.padEnd(28) + String(n).padStart(6) + ' variants ' + String(u).padStart(8) + ' units'));

  const dropOrders = orders.filter((o) => o.drop), storeOrders = orders.filter((o) => o.store);
  console.log('\nOPEN ORDERS ASSIGNED TO NEEDHAM: ' + orders.length + ' | with dropship lines ' + dropOrders.length + ' (' + dropOrders.reduce((t, o) => t + o.drop, 0) + ' units) | with store lines ' + storeOrders.length + ' (' + storeOrders.reduce((t, o) => t + o.store, 0) + ' units)');
  console.log('  oldest: ' + orders.slice(-5).map((o) => o.order + ' ' + o.at).join(', '));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'dropship-move-plan-' + stamp + '.csv');
  const rows = [['bucket', 'sku', 'variant', 'vendor', 'type', 'status', 'needham_on_hand', 'committed', 'would_move', 'inventory_item_id']]
    .concat(levels.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name))
      .map((l) => [l.bucket, l.sku, l.name, l.vendor, l.type, l.status, l.onHand, l.committed, l.moveUnits, l.itemId]));
  fs.writeFileSync(file, rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  const ofile = path.join(OUT_DIR, 'dropship-move-open-orders-' + stamp + '.csv');
  fs.writeFileSync(ofile, [['order', 'created', 'dropship_units', 'store_units']].concat(orders.map((o) => [o.order, o.at, o.drop, o.store])).map((r) => r.map(csvCell).join(',')).join('\n') + '\n');
  console.log('\nplan: ' + file + '\norders: ' + ofile);
  if (!APPLY) { console.log('DRY RUN. Nothing was written.'); return; }

  const ids = plan.MOVE.concat(plan.REVIEW).filter((l) => l.moveUnits > 0).map((l) => l.itemId).slice(0, LIMIT);
  const journal = path.join(OUT_DIR, 'dropship-move-journal-' + stamp + '.jsonl');
  console.log('\nAPPLY: moving ' + ids.length + ' sizes, journal ' + journal);
  const r = await applyMove(c, ids, { journal, uri });
  console.log('\nMOVED ' + r.moved + ' sizes, ' + r.units + ' units to Dropship Warehouse. ' + r.skipped.length + ' skipped' + (r.reverted ? ', ' + r.reverted + ' put back at Needham' : '') + '.');
  const why = {}; r.skipped.forEach((x) => { const k = String(x.why).slice(0, 80); why[k] = (why[k] || 0) + 1; });
  Object.entries(why).slice(0, 8).forEach(([k, n]) => console.log('  skipped ' + n + ': ' + k));
  console.log('Undo: node tools/move-dropship-location.mjs --restore ' + journal);
  if (Number.isFinite(LIMIT)) console.log('This was a --limit test. Check those sizes in Shopify, then run --apply without --limit.');
  else console.log('NEXT, at once: point DROPSHIP_LOCATION_ID / _NAME at Dropship Warehouse, DROPSHIP_WATCH_IDS at Needham, deploy, push, then remove ' + OFF_SWITCH);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
}
