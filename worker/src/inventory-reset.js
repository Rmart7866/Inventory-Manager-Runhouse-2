// Inventory reset: set a chosen slice of stock at ONE location to zero, by
// brand, product type, tag or collection, with one click buttons for every
// men's and every women's shoe. Staff only (write secret), and the first
// tool here that writes to a PHYSICAL store as a routine, so it carries the
// three guards zero-falmouth-feetures.mjs proved on 2026-11-04:
//
//   1. COMMITTED stock is never zeroed. Those items are skipped and listed,
//      because an order already promised from that shelf becomes unpickable
//      the moment the shelf reads 0. The server re-reads committed itself
//      before writing rather than trusting the page.
//   2. compareQuantity rides on every line, so a count that changed between
//      the preview and the write is refused, never clobbered.
//   3. The location is an id the server resolves and checks, never a name
//      match on the client's say so, and staff must type its name to write.
//
// Only four locations, by owner decision 2026-11-06: an ALLOWLIST, so a
// location added to Shopify later is not resettable until someone adds it
// here on purpose. Scituate in particular stays out (closed, and it holds
// the re:do returns line item, see CLAUDE.md). Every reset is stored, so it
// can be undone from the page.

import { createShopifyClient } from './shopify.js';

export const ALLOWED = ['Needham', 'Warehouse', 'Walpole', 'Falmouth'];
const LOG_PREFIX = 'invreset:';
// The one click buttons, each a fixed search in the store's OWN product
// types and tags, measured 2026-11-06. A button replaces the other filters.
const T = (xs) => '(' + xs.map((x) => 'product_type:"' + x + '"').join(' OR ') + ')';
export const APPAREL_TYPES = ['T-Shirts', 'T-Shirt', 'Hoodies', 'Jackets', 'Jacket', 'Tanks', 'Shorts', 'Long Sleeves', 'Pants', 'Pant', 'Half-Zips',
  'Crewnecks', 'Sweatshirts', 'Sweatshirt', 'Sports Bras', 'Bra', 'Tights/Leggings', 'Legging', 'Matching Sets', 'Full Zips', 'Vests',
  'Short Sleeve', 'Uniforms', 'Skirts & Dresses', 'Jumpsuits & Rompers', 'Sweatpants', 'shirt', 'Skorts', 'Active Dress', 'Sweater', 'Clothing', 'Singlets'];
export const PRESETS = {
  mens: { label: "All men's shoes", q: 'product_type:"Men\'s Shoes"' }, // 2,728
  womens: { label: "All women's shoes", q: 'product_type:"Women\'s Shoes"' }, // 2,791
  // The type alone is 189; the store's Socks collection keys on the sock
  // and socks TAGS (compression socks, untyped Collective socks), 413. Two
  // garments carry a sock tag by mistake, so those types are excluded.
  socks: { label: 'Socks', q: '(product_type:"Socks" OR tag:"sock" OR tag:"socks") AND -product_type:"Hoodies" AND -product_type:"Crewnecks"' },
  insoles: { label: 'Insoles', q: 'product_type:"Insoles & Inserts"' }, // 50
  // Garments only: socks, headwear, gloves and sunglasses are not apparel
  // here, and Compression is left out because it holds socks and sleeves.
  apparel: { label: 'Apparel', q: T(APPAREL_TYPES) }, // about 6,900
  nutrition: { label: 'Nutrition', q: T(['Nutrition', 'Energy Chews']) }, // 76
};

// Every product tag, for the Tag box: 4,202 of them on 2026-11-06, 17 pages
// of the top level productTags query in 4 seconds. Shop.productTags cannot
// page past 250, which is why it is not used. Kept a day under its own key,
// OUTSIDE the invreset: prefix, so it can never appear as a reset in history.
const TAGS_KEY = 'invtags';
async function allTags(env, client) {
  const hit = await env.CATALOG.get(TAGS_KEY, 'json');
  if (hit && Date.now() - new Date(hit.at).getTime() < 24 * 3600 * 1000) return hit.tags;
  const tags = [];
  let cursor = null;
  for (let i = 0; i < 60; i++) {
    const r = await client.graphql('query($c:String){ productTags(first: 250, after:$c){ pageInfo{ hasNextPage endCursor } edges{ node } } }', { c: cursor });
    const t = r.data.productTags;
    for (const e of t.edges) if (e.node) tags.push(e.node);
    if (!t.pageInfo.hasNextPage) break;
    cursor = t.pageInfo.endCursor;
  }
  tags.sort((a, b) => a.localeCompare(b));
  await env.CATALOG.put(TAGS_KEY, JSON.stringify({ at: new Date().toISOString(), tags }));
  return tags;
}

async function readJson(request) { try { return await request.json(); } catch (e) { return {}; } }

async function allowedLocations(client) {
  const r = await client.graphql('{ locations(first: 50){ nodes{ id name isActive } } }');
  return r.data.locations.nodes.filter((l) => l.isActive && ALLOWED.includes(l.name))
    .map((l) => ({ id: l.id, name: l.name, dropship: l.name === 'Needham' }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Shopify's product search from the picked filters: OR inside a group, AND
// across groups. Pure, for the test. Refuses an empty filter, so a reset can
// never be "everything at a location" by accident.
export function buildQuery(f) {
  const q = (v) => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  // A button is its own fixed search and ignores everything else, so "all
  // socks" can never quietly become "socks from one brand".
  if (f.preset) return PRESETS[f.preset] ? PRESETS[f.preset].q : null;
  const groups = [
    (f.vendors || []).map((v) => 'vendor:' + q(v)),
    (f.types || []).map((v) => 'product_type:' + q(v)),
    (f.tags || []).map((v) => 'tag:' + q(v)),
    (f.collections || []).map((c) => 'collection_id:' + String(c).split('/').pop().replace(/\D/g, '')),
  ].filter((g) => g.length);
  if (!groups.length) return null;
  return groups.map((g) => (g.length > 1 ? '(' + g.join(' OR ') + ')' : g[0])).join(' AND ');
}

const q2 = (l) => {
  const get = (n) => ((l.quantities || []).find((x) => x.name === n) || {}).quantity || 0;
  return { onHand: get('on_hand'), committed: get('committed') };
};

// GET /inventory-reset/options: locations, brands and product types.
export async function handleResetOptions(request, env) {
  const client = createShopifyClient(env);
  const [locs, shop, tags] = await Promise.all([
    allowedLocations(client),
    client.graphql('{ shop{ productVendors(first: 250){ edges{ node } } productTypes(first: 250){ edges{ node } } } }'),
    allTags(env, client),
  ]);
  return { body: {
    locations: locs, allowed: ALLOWED,
    presets: Object.entries(PRESETS).map(([k, p]) => ({ key: k, label: p.label })),
    vendors: shop.data.shop.productVendors.edges.map((e) => e.node).sort((a, b) => a.localeCompare(b)),
    types: shop.data.shop.productTypes.edges.map((e) => e.node).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    tags,
  } };
}

// GET /inventory-reset/collections?q=  a few collections by title, for the picker.
export async function handleResetCollections(request, env) {
  const q = String(new URL(request.url).searchParams.get('q') || '').trim().slice(0, 60);
  if (q.length < 2) return { body: { collections: [] } };
  const client = createShopifyClient(env);
  const r = await client.graphql('query($q:String){ collections(first: 15, query:$q){ nodes{ id title handle productsCount{ count } } } }', { q: 'title:*' + q.replace(/[*"\\]/g, '') + '*' });
  return { body: { collections: r.data.collections.nodes.map((c) => ({ id: c.id, title: c.title, handle: c.handle, n: c.productsCount ? c.productsCount.count : 0 })) } };
}

// POST /inventory-reset/scan { locationId, filters, cursor }: ONE page of the
// search, 25 products, and the variants of those that hold stock at the
// location. The page loops; one page per request keeps every request small
// whatever the selection (all men's shoes is about 110 pages).
export async function handleResetScan(request, env) {
  const b = await readJson(request);
  const query = buildQuery(b.filters || {});
  if (!query) return { status: 400, body: { error: 'Pick at least one brand, type, tag, collection or shoe button.' } };
  const client = createShopifyClient(env);
  const locs = await allowedLocations(client);
  const loc = locs.find((l) => l.id === b.locationId);
  if (!loc) return { status: 400, body: { error: 'That location cannot be reset here.' } };
  const page = await client.graphql(`query($q:String,$c:String,$loc:ID!){ products(first:25, after:$c, query:$q){ pageInfo{ hasNextPage endCursor }
    nodes{ id title handle vendor productType status featuredImage{ url(transform:{ maxWidth: 160 }) } variants(first:100){ nodes{ id title sku
      inventoryItem{ id tracked inventoryLevel(locationId:$loc){ quantities(names:["on_hand","committed"]){ name quantity } } } } } } } }`,
  { q: query, c: b.cursor || null, loc: loc.id });
  let total = null;
  if (!b.cursor) total = (await client.graphql('query($q:String){ productsCount(query:$q, limit: null){ count } }', { q: query })).data.productsCount.count;
  const rows = [];
  for (const p of page.data.products.nodes) {
    for (const v of p.variants.nodes) {
      const lvl = v.inventoryItem && v.inventoryItem.inventoryLevel;
      if (!lvl) continue; // not stocked at this location at all
      const { onHand, committed } = q2(lvl);
      if (!onHand && !committed) continue; // already empty
      rows.push({ item: v.inventoryItem.id, product: p.title, handle: p.handle, image: p.featuredImage ? p.featuredImage.url : null, vendor: p.vendor, type: p.productType, status: p.status,
        variant: v.title, sku: v.sku || '', tracked: v.inventoryItem.tracked, onHand, committed });
    }
  }
  const pi = page.data.products.pageInfo;
  return { body: { query, location: loc, rows, scanned: page.data.products.nodes.length, total, next: pi.hasNextPage ? pi.endCursor : null } };
}

const SET = `mutation($input: InventorySetQuantitiesInput!){ inventorySetQuantities(input:$input){
  userErrors{ field message code } inventoryAdjustmentGroup{ createdAt } } }`;

// Re-read the CURRENT on hand and committed for these items at the location.
async function currentLevels(client, locId, ids) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const r = await client.graphql(`query($ids:[ID!]!,$loc:ID!){ nodes(ids:$ids){ ... on InventoryItem { id
      inventoryLevel(locationId:$loc){ quantities(names:["on_hand","committed"]){ name quantity } } } } }`, { ids: ids.slice(i, i + 100), loc: locId });
    for (const n of r.data.nodes) if (n && n.inventoryLevel) out.set(n.id, q2(n.inventoryLevel));
  }
  return out;
}

async function writeOnHand(client, locId, lines, uri) {
  for (let i = 0; i < lines.length; i += 100) {
    const chunk = lines.slice(i, i + 100);
    const d = await client.graphql(SET, { input: {
      name: 'on_hand', reason: 'correction', referenceDocumentUri: uri, ignoreCompareQuantity: false,
      quantities: chunk.map((c) => ({ inventoryItemId: c.item, locationId: locId, quantity: c.to, compareQuantity: c.from })),
    } });
    const errs = (d.data && d.data.inventorySetQuantities.userErrors) || [];
    if (errs.length || d.errors) return { written: i, error: (errs[0] && errs[0].message) || JSON.stringify(d.errors).slice(0, 200) };
  }
  return { written: lines.length };
}

// POST /inventory-reset/apply { locationId, confirm, lines:[{item, from}], filters, by }
export async function handleResetApply(request, env) {
  const b = await readJson(request);
  const client = createShopifyClient(env);
  const locs = await allowedLocations(client);
  const loc = locs.find((l) => l.id === b.locationId);
  if (!loc) return { status: 400, body: { error: 'That location cannot be reset here.' } };
  if (String(b.confirm || '').trim().toLowerCase() !== loc.name.toLowerCase()) return { status: 400, body: { error: 'Type the location name, ' + loc.name + ', to confirm.' } };
  const lines = (Array.isArray(b.lines) ? b.lines : []).filter((l) => l && /^gid:\/\/shopify\/InventoryItem\/\d+$/.test(l.item) && Number.isInteger(l.from));
  if (!lines.length) return { status: 400, body: { error: 'Nothing to reset.' } };
  if (lines.length > 3000) return { status: 400, body: { error: 'At most 3,000 items in one reset. Narrow the filters.' } };
  // Guard 1, on the server: committed stock is skipped whatever the page sent.
  const now = await currentLevels(client, loc.id, [...new Set(lines.map((l) => l.item))]);
  const skipped = [], go = [];
  for (const l of lines) {
    const c = now.get(l.item);
    if (!c) { skipped.push({ item: l.item, why: 'no longer stocked here' }); continue; }
    if (c.committed > 0) { skipped.push({ item: l.item, why: c.committed + ' committed to orders' }); continue; }
    if (c.onHand === 0) continue; // already zero, nothing to do
    go.push({ item: l.item, from: l.from, to: 0 }); // guard 2: from is what staff SAW
  }
  const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 7);
  const res = await writeOnHand(client, loc.id, go, 'runhouse://inventory-reset/' + id);
  const rec = { id, at: new Date().toISOString(), by: String(b.by || '').slice(0, 40), location: loc, filters: b.filters || {},
    wrote: go.slice(0, res.written), skipped, error: res.error || null, undone: null };
  if (rec.wrote.length) await env.CATALOG.put(LOG_PREFIX + id, JSON.stringify(rec), { metadata: { at: rec.at, loc: loc.name, n: rec.wrote.length, by: rec.by } });
  const units = rec.wrote.reduce((a, l) => a + Math.max(0, l.from), 0); // shelf units; below zero counts are not units
  if (res.error) return { status: 409, body: { id, written: res.written, units, skipped, error: 'Stopped after ' + res.written + ' of ' + go.length + ': ' + res.error + (/compare/i.test(res.error) ? '. A count changed since the preview; find the items again.' : '') } };
  return { body: { id, written: res.written, units, skipped } };
}

// GET /inventory-reset/history: the last 30 resets, newest first.
export async function handleResetHistory(request, env) {
  const out = [];
  let cursor;
  do {
    const p = await env.CATALOG.list({ prefix: LOG_PREFIX, cursor });
    for (const k of p.keys) out.push({ id: k.name.slice(LOG_PREFIX.length), ...(k.metadata || {}) });
    cursor = p.list_complete ? null : p.cursor;
  } while (cursor);
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { body: { resets: out.slice(0, 30) } };
}

// POST /inventory-reset/undo { id }: put every count back to what it was,
// comparing against the 0 that was written, so anything sold or counted
// since is refused rather than overwritten.
export async function handleResetUndo(request, env) {
  const b = await readJson(request);
  const rec = await env.CATALOG.get(LOG_PREFIX + String(b.id || ''), 'json');
  if (!rec) return { status: 404, body: { error: 'No such reset.' } };
  if (rec.undone) return { status: 409, body: { error: 'Already undone ' + rec.undone + '.' } };
  const client = createShopifyClient(env);
  const res = await writeOnHand(client, rec.location.id, rec.wrote.map((l) => ({ item: l.item, from: 0, to: l.from })), 'runhouse://inventory-reset/' + rec.id + '/undo');
  if (res.error) return { status: 409, body: { error: 'Undo stopped after ' + res.written + ': ' + res.error + '. Something changed at ' + rec.location.name + ' since the reset.' } };
  rec.undone = new Date().toISOString();
  await env.CATALOG.put(LOG_PREFIX + rec.id, JSON.stringify(rec), { metadata: { at: rec.at, loc: rec.location.name, n: rec.wrote.length, by: rec.by, undone: rec.undone } });
  return { body: { restored: res.written } };
}
