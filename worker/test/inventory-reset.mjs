// Inventory reset: the query builder and the three guards, against a
// stand-in Shopify. Nothing here reaches a real store.
import { buildQuery, handleResetOptions, handleResetScan, handleResetApply, handleResetUndo } from '../src/inventory-reset.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };

console.log('\nThe search');
check('one group needs no brackets', buildQuery({ vendors: ['Feetures'] }) === 'vendor:"Feetures"');
check('OR inside a group, AND across groups', buildQuery({ vendors: ['Hoka', 'On Running'], tags: ['clearance'] }) === '(vendor:"Hoka" OR vendor:"On Running") AND tag:"clearance"');
check('the men\'s shoes button is the Men\'s Shoes type, apostrophe and all', buildQuery({ preset: 'mens' }) === 'product_type:"Men\'s Shoes"');
check('a button ignores any other filter sent with it', buildQuery({ preset: 'insoles', vendors: ['Hoka'] }) === 'product_type:"Insoles & Inserts"');
check('socks use the store\'s sock tags too, but never a hoodie', /tag:"socks"/.test(buildQuery({ preset: 'socks' })) && /-product_type:"Hoodies"/.test(buildQuery({ preset: 'socks' })));
check('apparel is garments, not socks or the compression type', /"Hoodies"/.test(buildQuery({ preset: 'apparel' })) && !/Socks|Compression/.test(buildQuery({ preset: 'apparel' })));
check('unisex is the Unisex Shoes type', buildQuery({ preset: 'unisex' }) === 'product_type:"Unisex Shoes"');
check('spikes are the Spikes type plus spikes typed unisex, never team apparel tagged track and field', /product_type:"Spikes"/.test(buildQuery({ preset: 'spikes' })) && !/track and field/.test(buildQuery({ preset: 'spikes' })));
check('an unknown button is refused', buildQuery({ preset: 'everything' }) === null);
check('a quote in a value cannot break out of the search', buildQuery({ tags: ['a" OR vendor:"x'] }) === 'tag:"a\\" OR vendor:\\"x"');
check('a collection is its numeric id', buildQuery({ collections: ['gid://shopify/Collection/123'] }) === 'collection_id:123');
check('no filter at all is refused, never "everything here"', buildQuery({}) === null && buildQuery({ vendors: [] }) === null);

// ---- a stand-in Shopify ----
const LOCS = [
  { id: 'gid://shopify/Location/1', name: 'Walpole', isActive: true },
  { id: 'gid://shopify/Location/2', name: 'Scituate', isActive: true },
  { id: 'gid://shopify/Location/3', name: 'Needham', isActive: true },
  { id: 'gid://shopify/Location/4', name: 'Run Bus', isActive: true },
];
const LEVEL = { 'gid://shopify/InventoryItem/11': { on_hand: 5, committed: 0 }, 'gid://shopify/InventoryItem/12': { on_hand: 3, committed: 2 }, 'gid://shopify/InventoryItem/13': { on_hand: 0, committed: 0 } };
const writes = [];
let tagCalls = 0;
const qty = (it) => ['on_hand', 'committed'].map((n) => ({ name: n, quantity: LEVEL[it][n] }));
globalThis.fetch = async (url, init) => {
  const { query, variables } = JSON.parse(init.body);
  const ok = (data) => new Response(JSON.stringify({ data }));
  if (/locations\(/.test(query)) return ok({ locations: { nodes: LOCS } });
  if (/productVendors/.test(query)) return ok({ shop: { productVendors: { edges: [{ node: 'Hoka' }] }, productTypes: { edges: [{ node: "Men's Shoes" }] } } });
  if (/productTags\(first/.test(query)) { tagCalls++; return ok({ productTags: variables.c ? { pageInfo: { hasNextPage: false, endCursor: null }, edges: [{ node: 'zebra' }] } : { pageInfo: { hasNextPage: true, endCursor: 'p2' }, edges: [{ node: 'clearance' }, { node: 'Walpole XC' }] } }); }
  if (/productsCount/.test(query)) return ok({ productsCount: { count: 1 } });
  if (/products\(first:25/.test(query)) return ok({ products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'p1', title: 'Sock', handle: 'sock', vendor: 'Feetures', productType: 'Socks', status: 'ACTIVE', variants: { nodes:
    Object.keys(LEVEL).map((it, i) => ({ id: 'v' + i, title: 'M', sku: 'S' + i, inventoryItem: { id: it, tracked: true, inventoryLevel: { quantities: qty(it) } } })) } }] } });
  if (/nodes\(ids/.test(query)) return ok({ nodes: variables.ids.map((id) => ({ id, inventoryLevel: LEVEL[id] ? { quantities: qty(id) } : null })) });
  if (/inventorySetQuantities/.test(query)) {
    const inp = variables.input; writes.push(inp);
    const bad = inp.quantities.find((x) => LEVEL[x.inventoryItemId].on_hand !== x.compareQuantity);
    if (bad) return ok({ inventorySetQuantities: { userErrors: [{ message: 'The compareQuantity does not match', code: 'COMPARE_QUANTITY_STALE' }] } });
    inp.quantities.forEach((x) => { LEVEL[x.inventoryItemId].on_hand = x.quantity; });
    return ok({ inventorySetQuantities: { userErrors: [], inventoryAdjustmentGroup: { createdAt: 'now' } } });
  }
  throw new Error('unexpected query ' + query.slice(0, 60));
};
const kv = {};
const env = { SHOP_URL: 'x.myshopify.com', ADMIN_API_TOKEN: 't', CATALOG: { get: async (k, t) => (k in kv ? (t === 'json' ? JSON.parse(kv[k].v) : kv[k].v) : null), put: async (k, v, o) => { kv[k] = { v, m: o && o.metadata }; }, list: async () => ({ keys: [], list_complete: true }) } };
const post = (body) => new Request('https://w/x', { method: 'POST', body: JSON.stringify(body) });

console.log('\nLocations');
let r = await handleResetOptions(new Request('https://w/x'), env);
check('only the allowed locations are offered, never Scituate or the Run Bus', !r.body.locations.some((l) => l.name === 'Scituate' || l.name === 'Run Bus') && r.body.locations.length === 2);
check('the page is told the buttons', r.body.presets.map((p) => p.key).join() === 'mens,womens,unisex,spikes,socks,insoles,apparel,nutrition');
check('every tag, across pages, sorted, for the Tag box', JSON.stringify(r.body.tags) === '["clearance","Walpole XC","zebra"]' && tagCalls === 2);
await handleResetOptions(new Request('https://w/x'), env);
check('the tag list is kept a day, not fetched every time', tagCalls === 2);
check('and kept OUTSIDE the reset history prefix', Object.keys(kv).every((k) => !k.startsWith('invreset:')));
check('Needham is offered, marked as the dropship location', r.body.locations.find((l) => l.name === 'Needham').dropship === true);
r = await handleResetScan(post({ locationId: 'gid://shopify/Location/2', filters: { vendors: ['Feetures'] } }), env);
check('a scan at Scituate is refused, whatever the page sends', r.status === 400);
r = await handleResetApply(post({ locationId: 'gid://shopify/Location/2', confirm: 'Scituate', lines: [{ item: 'gid://shopify/InventoryItem/11', from: 5 }] }), env);
check('and so is a reset there', r.status === 400 && !writes.length);

console.log('\nThe scan');
r = await handleResetScan(post({ locationId: 'gid://shopify/Location/1', filters: {} }), env);
check('no filter is refused', r.status === 400);
r = await handleResetScan(post({ locationId: 'gid://shopify/Location/1', filters: { vendors: ['Feetures'] } }), env);
check('stocked items come back, an empty one is left out', r.body.rows.length === 2 && r.body.total === 1);
check('committed is reported for the page to show', r.body.rows.find((x) => x.sku === 'S1').committed === 2);

console.log('\nThe reset');
const lines = [{ item: 'gid://shopify/InventoryItem/11', from: 5 }, { item: 'gid://shopify/InventoryItem/12', from: 3 }, { item: 'gid://shopify/InventoryItem/13', from: 0 }];
r = await handleResetApply(post({ locationId: 'gid://shopify/Location/1', confirm: 'walpol', lines }), env);
check('the location name must be typed to confirm', r.status === 400 && !writes.length);
r = await handleResetApply(post({ locationId: 'gid://shopify/Location/1', confirm: 'walpole', lines, by: 'Ryan' }), env);
const w = writes[0];
check('only the item with nothing committed is written', !r.status && r.body.written === 1 && w.quantities.length === 1 && w.quantities[0].inventoryItemId.endsWith('/11'));
check('the committed one is skipped and said why, even though the page sent it', r.body.skipped.length === 1 && /committed/.test(r.body.skipped[0].why));
check('on hand to 0, comparing against what staff saw, as a correction', w.name === 'on_hand' && w.quantities[0].quantity === 0 && w.quantities[0].compareQuantity === 5 && w.reason === 'correction' && w.ignoreCompareQuantity === false);
check('the shelf now reads 0, and the committed one keeps its 3', LEVEL['gid://shopify/InventoryItem/11'].on_hand === 0 && LEVEL['gid://shopify/InventoryItem/12'].on_hand === 3);
const id = r.body.id;

console.log('\nA count that moved, and undo');
LEVEL['gid://shopify/InventoryItem/11'].on_hand = 0; LEVEL['gid://shopify/InventoryItem/13'].on_hand = 4;
r = await handleResetApply(post({ locationId: 'gid://shopify/Location/1', confirm: 'Walpole', lines: [{ item: 'gid://shopify/InventoryItem/13', from: 1 }] }), env);
check('a count that changed since the preview is refused, not clobbered', r.status === 409 && /changed since the preview/.test(r.body.error) && LEVEL['gid://shopify/InventoryItem/13'].on_hand === 4);
r = await handleResetUndo(post({ id }), env);
check('undo puts the 5 back', !r.status && LEVEL['gid://shopify/InventoryItem/11'].on_hand === 5);
r = await handleResetUndo(post({ id }), env);
check('and cannot run twice', r.status === 409);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
