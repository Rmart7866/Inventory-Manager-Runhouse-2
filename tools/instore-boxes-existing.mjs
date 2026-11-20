// instore-boxes-existing.mjs, The Run House. Owner, 2026-11-20.
//
// Boxes on the Needham shelf whose barcode would not scan: photographed in
// ~/Desktop/"Products to create ", decoded with macOS Vision (every check
// digit verified; 6053 read from three crops; 6079 from the ASICS barcode
// file, the label barcode being unreadable). This part handles the ones whose
// product ALREADY exists: set the variant's barcode to the box's (most held
// none, or a 10 digit "19125..." placeholder), then add the boxes to Needham's
// on hand (activating the Needham level first where the cleanup removed it).
//
// Every variant is pinned by its exact SKU, and the script refuses a SKU that
// is missing, whose product title does not carry the expected colour, or
// whose size option disagrees. Dry run by default; --apply writes, and saves
// a rollback file of every old barcode and Needham quantity.
// House style: no em dashes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEEDHAM = 'gid://shopify/Location/77957136639';
const APPLY = process.argv.includes('--apply');

// sku, the box barcode, boxes on the shelf, a colour word the title must carry, photos
export const LINES = [
  ['ON-3WG10030664-WHI-6', '7615537620152', 1, 'White Frost', '6053'],
  ['ON-3WG10030664-WHI-655', '7615537620176', 1, 'White Frost', '6055'],
  ['ON-3WG10030664-WHI-955', '7615537620244', 2, 'White Frost', '6056 6057'],
  ['ON-3WG10030664-WHI-1055', '7615537620268', 1, 'White Frost', '6058'],
  ['ON-3WG10033388-ECL-6', '7615537620466', 1, 'Eclipse Ivory', '6054'],
  ['ON-3WG10033388-ECL-11', '7615537620565', 1, 'Eclipse Ivory', '6061'],
  ['ON-3WG10034861-TRU-10', '7615537619965', 1, 'Truffle Ivory', '6059'],
  ['ON-3WG10034096-CIN-1055', '7615537620114', 1, 'Cinder Ivory', '6060'],
  ['ON-3WF10093149-TAN-955', '7615537210711', 1, 'Tangerine Silver', '6062'],
  ['ON-3WF10093149-TAN-10', '7615537210728', 1, 'Tangerine Silver', '6063'],
  ['ON-3WG10054723-SEE-1055', '7615537622224', 1, 'Seedling Ivory', '6064'],
  ['ON-3WF10103126-TAN-1055', '7615537214245', 1, 'Tangerine Ivory', '6070'],
  ['120492090-453-650-B', '195394777208', 1, 'Spellbound/Yucca/Pink', '6072 (6073 same box)'],
  ['120465133-475-750-B', '195394773958', 1, 'Skyway/Blazing Bell/Pink', '6074'],
  ['120465133-133-855-B', '195394769593', 1, 'White/Harbor Mist/Metallic', '6075'],
  ['1012B899-002-655', '199023061997', 1, 'BLACK/FEATHER GREY', '6078'],
  ['1012B899-004-7', '199023214737', 1, 'BLACK/TARO PURPLE', '6079'],
  ['1012B899-402-855', '199023092052', 1, 'MIDNIGHT/BLUEBELL', '6080'],
  ['1012B899-402-10', '199023091994', 1, 'MIDNIGHT/BLUEBELL', '6081'],
];
// Pure: the size a SKU names, as the Size option should read (ON 955 = 9.5, Brooks 650 = 6.0).
export function sizeFromSku(sku) {
  const on = sku.match(/^ON-.*-(\d+?)(55)?$/);
  if (on) return Number(on[1]) + (on[2] ? 0.5 : 0);
  // Brooks: 550 = 5.0, 555 = 5.5, 1050 = 10.0 (the last two digits 50 / 55).
  const br = sku.match(/^\d{9}-\d{3}-(\d+)(50|55)-/);
  if (br) return Number(br[1]) + (br[2] === '55' ? 0.5 : 0);
  const as = sku.match(/^1012B\d+-\d{3}-(\d+?)(55)?$/);
  if (as) return Number(as[1]) + (as[2] ? 0.5 : 0);
  return null;
}
export function validCheckDigit(c) {
  const d = [...c].map(Number);
  if (d.length === 12) { const s = d.slice(0, 11).reduce((t, x, i) => t + x * (i % 2 === 0 ? 3 : 1), 0); return (10 - (s % 10)) % 10 === d[11]; }
  if (d.length === 13) { const s = d.slice(0, 12).reduce((t, x, i) => t + x * (i % 2 === 0 ? 1 : 3), 0); return (10 - (s % 10)) % 10 === d[12]; }
  return false;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  const c = createShopifyClient(env);
  const gql = async (q, v) => { const r = await c.graphql(q, v); if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300)); return r.data; };
  const plan = [], problems = [];
  for (const [sku, bc, qty, colour, imgs] of LINES) {
    if (!validCheckDigit(bc)) { problems.push(sku + ': barcode ' + bc + ' fails its check digit'); continue; }
    const d = await gql(`query($q:String){ productVariants(first:5, query:$q){ nodes{ id sku barcode selectedOptions{ name value }
      product{ id title status } inventoryItem{ id level: inventoryLevel(locationId:"${NEEDHAM}"){ quantities(names:["on_hand"]){ quantity } } } } } }`, { q: 'sku:"' + sku + '"' });
    const vs = d.productVariants.nodes.filter((v) => v.sku === sku);
    if (vs.length !== 1) { problems.push(sku + ': ' + vs.length + ' variants carry this exact SKU'); continue; }
    const v = vs[0];
    const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
    if (!norm(v.product.title).includes(norm(colour))) { problems.push(sku + ': title "' + v.product.title + '" does not carry ' + colour); continue; }
    const sizeOpt = v.selectedOptions.find((o) => /size/i.test(o.name));
    if (!sizeOpt || Number(String(sizeOpt.value).replace(/[^0-9.]/g, '')) !== sizeFromSku(sku)) { problems.push(sku + ': size option ' + (sizeOpt && sizeOpt.value) + ' disagrees with the SKU'); continue; }
    const dup = (await gql(`query($q:String){ productVariants(first:5, query:$q){ nodes{ sku product{ status title } } } }`, { q: 'barcode:' + bc })).productVariants.nodes.filter((x) => x.sku !== sku);
    plan.push({ sku, bc, qty, imgs, variant: v.id, product: v.product.id, title: v.product.title, status: v.product.status, item: v.inventoryItem.id,
      oldBarcode: v.barcode || '', needham: v.inventoryItem.level ? v.inventoryItem.level.quantities[0].quantity : null, alsoOn: dup.map((x) => x.sku + ' (' + x.product.status + ')') });
  }
  for (const p of plan) console.log(`${p.sku.padEnd(24)} ${p.title.slice(0, 50).padEnd(50)} size ok | barcode ${p.oldBarcode || '(none)'} -> ${p.bc}${p.alsoOn.length ? '  [same barcode also on ' + p.alsoOn.join(', ') + ']' : ''} | Needham ${p.needham === null ? 'not stocked' : p.needham} -> ${(p.needham || 0) + p.qty}  (photos ${p.imgs})`);
  if (problems.length) { console.log('\nREFUSED:\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log(`\n${plan.length} variants, ${plan.reduce((t, p) => t + p.qty, 0)} boxes.`);
  if (!APPLY) { console.log('DRY RUN. Nothing written.'); process.exit(0); }

  const out = path.join(os.homedir(), 'Library', 'Logs', 'runhouse-autowrite');
  fs.mkdirSync(out, { recursive: true });
  const rb = path.join(out, 'instore-boxes-existing-rollback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(rb, JSON.stringify(plan, null, 1));
  console.log('rollback: ' + rb);
  for (const p of plan) {
    if (p.oldBarcode !== p.bc) {
      const u = await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p, variants:$v){ userErrors{ message } } }`, { p: p.product, v: [{ id: p.variant, barcode: p.bc }] });
      if (u.productVariantsBulkUpdate.userErrors.length) { console.log('BARCODE FAILED ' + p.sku + ' ' + JSON.stringify(u.productVariantsBulkUpdate.userErrors)); continue; }
    }
    if (p.needham === null) {
      const a = await gql(`mutation($i:ID!,$l:ID!,$q:Int){ inventoryActivate(inventoryItemId:$i, locationId:$l, onHand:$q){ userErrors{ message } } }`, { i: p.item, l: NEEDHAM, q: p.qty });
      if (a.inventoryActivate.userErrors.length) { console.log('STOCK FAILED ' + p.sku + ' ' + JSON.stringify(a.inventoryActivate.userErrors)); continue; }
    } else {
      const a = await gql(`mutation($in:InventorySetQuantitiesInput!){ inventorySetQuantities(input:$in){ userErrors{ message } } }`,
        { in: { name: 'on_hand', reason: 'received', referenceDocumentUri: 'logistics://runhouse/instore-boxes/2026-11-20',
          quantities: [{ inventoryItemId: p.item, locationId: NEEDHAM, quantity: p.needham + p.qty, compareQuantity: p.needham }] } });
      if (a.inventorySetQuantities.userErrors.length) { console.log('STOCK FAILED ' + p.sku + ' ' + JSON.stringify(a.inventorySetQuantities.userErrors)); continue; }
    }
    console.log('done ' + p.sku);
  }
}
