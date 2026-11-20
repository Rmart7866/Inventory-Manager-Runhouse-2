// instore-boxes-fixups.mjs, The Run House. Owner, 2026-11-20.
//
// Part 3 of the Needham boxes that would not scan: three that needed an
// in-place fix rather than a new product.
//   - Brooks Women's Ghost 18 Grey/Morganite/Coconut 8.5: the product exists
//     (titled "Grey/ Morganite/ Coconut", no SKUs); set the 8.5 barcode.
//   - Saucony Women's Endorphin Speed 5 Black White: the product has no size 6;
//     add it (SKU in its siblings' pattern, same price, 2 lb), first in order.
//   - New Balance Women's 860v15 Fairweather Blue (Wide) 8: a DRAFT whose 8
//     carries a 10 digit placeholder; set the box barcode. Status untouched.
// Then each box is put on hand at Needham. Dry run by default; --apply writes.
// House style: no em dashes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const NEEDHAM = 'gid://shopify/Location/77957136639';
const DW = 'gid://shopify/Location/97494139135';
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const c = createShopifyClient(env);
const gql = async (q, v) => { const r = await c.graphql(q, v); if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300)); return r.data; };
const P = (h) => gql(`query($h:String!){ productByHandle(handle:$h){ id title status options{ name values } variants(first:40){ nodes{ id sku barcode price compareAtPrice
  selectedOptions{ name value } inventoryItem{ id n: inventoryLevel(locationId:"${NEEDHAM}"){ quantities(names:["on_hand"]){ quantity } } } } } } }`, { h }).then((d) => d.productByHandle);
const sizeIs = (v, s) => v.selectedOptions.some((o) => /size/i.test(o.name) && Number(o.value) === s);
async function toNeedham(item, level, qty) {
  if (!level) return gql(`mutation($i:ID!,$l:ID!,$q:Int){ inventoryActivate(inventoryItemId:$i, locationId:$l, onHand:$q){ userErrors{ message } } }`, { i: item, l: NEEDHAM, q: qty });
  const now = level.quantities[0].quantity;
  return gql(`mutation($in:InventorySetQuantitiesInput!){ inventorySetQuantities(input:$in){ userErrors{ message } } }`,
    { in: { name: 'on_hand', reason: 'received', referenceDocumentUri: 'logistics://runhouse/instore-boxes/2026-11-20', quantities: [{ inventoryItemId: item, locationId: NEEDHAM, quantity: now + qty, compareQuantity: now }] } });
}

// 1. Brooks Ghost 18 Morganite 8.5
const g = await P('brooks-womens-ghost-18-grey-morganite-coconut');
const g85 = g.variants.nodes.find((v) => sizeIs(v, 8.5));
console.log(`Brooks: ${g.status} ${g.title} 8.5 barcode ${g85.barcode || '(none)'} -> 195394873085, Needham ${g85.inventoryItem.n ? g85.inventoryItem.n.quantities[0].quantity : 'not stocked'} +1`);
// 2. Saucony size 6
const s = await P('endorphin-speed-5-black-white');
const has6 = s.variants.nodes.find((v) => sizeIs(v, 6));
const s7 = s.variants.nodes.find((v) => sizeIs(v, 7));
const optName = s.options.find((o) => /size/i.test(o.name)).name;
console.log(`Saucony: ${s.status} ${s.title} size 6 ${has6 ? 'ALREADY EXISTS' : 'missing, add S11007-01-6.0 at $' + s7.price + ' barcode 195021145660, Needham 1'}`);
// 3. NB 860v15 Wide 8
const n = await P('womens-fresh-foam-x-860v15-fairweather-blue-wide');
const n8 = n.variants.nodes.find((v) => v.sku === 'W86038B  D  08');
console.log(`NB: ${n.status} ${n.title} 8 (${n8.sku}) barcode ${n8.barcode} -> 198689547227, Needham ${n8.inventoryItem.n ? n8.inventoryItem.n.quantities[0].quantity : 'not stocked'} +1`);
if (has6) { console.log('REFUSED: Saucony size 6 already exists'); process.exit(1); }
if (!APPLY) { console.log('DRY RUN. Nothing written.'); process.exit(0); }

const errs = (d) => { const k = Object.keys(d)[0]; const e = d[k].userErrors || []; if (e.length) throw new Error(k + ' ' + JSON.stringify(e)); return d[k]; };
errs(await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p, variants:$v){ userErrors{ message } } }`, { p: g.id, v: [{ id: g85.id, barcode: '195394873085' }] }));
errs(await toNeedham(g85.inventoryItem.id, g85.inventoryItem.n, 1));
console.log('done Brooks Ghost 18 Morganite 8.5');

const made = errs(await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkCreate(productId:$p, variants:$v){ productVariants{ id inventoryItem{ id } } userErrors{ message } } }`,
  { p: s.id, v: [{ optionValues: [{ optionName: optName, name: '6.0' }], price: s7.price, compareAtPrice: s7.compareAtPrice, barcode: '195021145660', inventoryPolicy: 'DENY',
    inventoryItem: { sku: 'S11007-01-6.0', tracked: true, measurement: { weight: { value: 2, unit: 'POUNDS' } } },
    inventoryQuantities: [{ locationId: NEEDHAM, availableQuantity: 1 }, { locationId: DW, availableQuantity: 0 }] }] }));
const nv = made.productVariants[0];
errs(await gql(`mutation($p:ID!,$pos:[ProductVariantPositionInput!]!){ productVariantsBulkReorder(productId:$p, positions:$pos){ userErrors{ message } } }`, { p: s.id, pos: [{ id: nv.id, position: 1 }] }));
console.log('done Saucony Endorphin Speed 5 Black White size 6');

errs(await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p, variants:$v){ userErrors{ message } } }`, { p: n.id, v: [{ id: n8.id, barcode: '198689547227' }] }));
errs(await toNeedham(n8.inventoryItem.id, n8.inventoryItem.n, 1));
console.log('done NB 860v15 Fairweather Blue Wide 8');
