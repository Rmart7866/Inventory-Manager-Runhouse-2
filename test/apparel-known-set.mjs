// apparel-known-set.mjs, The Run House.
//
// Apparel is dropshipped as of 2026-10-16, so it now goes through a known set
// and can be ZEROED. This pins the safety properties of that set.
//
// The one that matters most is Needham scoping. The 13 ON apparel products on
// the store today hold 63 units across Walpole, Falmouth and Warehouse and
// NONE at Needham: that is physical stock a human counted, and a dropship
// write must never reach it.
//
// Run: node test/apparel-known-set.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sb = { console: { log() {}, warn() {}, error() {} }, setTimeout() {}, fetch: () => {},
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../catalog-client.js', import.meta.url), 'utf8'), sb);
const CC = sb.CatalogClient;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const cat = (products) => ({ needhamScoped: true, products });
const P = (o) => Object.assign({
  brand: 'ON', status: 'ACTIVE', needham: true, skus: ['ON-1WE1-BLA-S'], codes: ['1WE1'],
  needhamOnHand: 5, needhamVariants: { Small: { sku: 'ON-1WE1-BLA-S', quantity: 5 } },
  title: 'ON Thing', handle: 'on-thing', modelKey: 'ON THING',
}, o);

console.log('\nNeedham scoping, the guard that protects physical store stock');
{
  const k = CC.buildApparelKnownSets(cat([
    P({ handle: 'at-needham', needham: true }),
    P({ handle: 'at-walpole', needham: false, needhamOnHand: 0 }),
  ]), 'on');
  eq('a Needham garment is in the known set', k.colorways.has('at-needham'), true);
  eq('a garment stocked elsewhere is NOT, so it cannot be zeroed', k.colorways.has('at-walpole'), false);
  eq('but it is still known as carried, so it is not offered as new',
     k.existingHandles.has('at-walpole'), true);
}

console.log('\nOnly live products count as carried');
{
  const k = CC.buildApparelKnownSets(cat([
    P({ handle: 'live', status: 'ACTIVE' }),
    P({ handle: 'draft', status: 'DRAFT' }),
    P({ handle: 'gone', status: 'ARCHIVED' }),
  ]), 'on');
  eq('active is in the removal set', k.colorways.has('live'), true);
  eq('draft is NOT a removal target', k.colorways.has('draft'), false);
  eq('but a draft suppresses re-creation', k.existingHandles.has('draft'), true);
  eq('archived suppresses nothing', k.existingHandles.has('gone'), false);
}

console.log('\nA product with no SKUs is never a removal target');
{
  // Same guard footwear has. 49 of the 61 ON apparel variants on the store have
  // no SKU, and zeroing something we cannot even address is the worst outcome.
  const k = CC.buildApparelKnownSets(cat([P({ handle: 'no-sku', skus: [] })]), 'on');
  eq('not in the removal set', k.colorways.has('no-sku'), false);
  eq('still suppresses creation by handle', k.existingHandles.has('no-sku'), true);
}

console.log('\nOther brands stay out');
{
  const k = CC.buildApparelKnownSets(cat([
    P({ handle: 'on-one', brand: 'ON' }),
    P({ handle: 'rh-tee', brand: 'UNKNOWN' }),
    P({ handle: 'brooks-tee', brand: 'BROOKS' }),
  ]), 'on');
  eq('only ON', k.colorways.size, 1);
  eq('and it is the right one', k.colorways.has('on-one'), true);
}

console.log('\nThe zero row has the per size detail it needs');
{
  const k = CC.buildApparelKnownSets(cat([P({ handle: 'tee' })]), 'on');
  const cw = k.colorways.get('tee');
  eq('per size quantity', cw.variants.Small.quantity, 5);
  eq('per size sku', cw.variants.Small.sku, 'ON-1WE1-BLA-S');
  eq('on-hand total, so a 0 to 0 change is skipped', cw.needhamOnHand, 5);
}

console.log('\nNo footwear machinery is invented for apparel');
{
  const k = CC.buildApparelKnownSets(cat([P({})]), 'on');
  eq('nothing to inherit, there is no sibling tag to copy', k.inherit.size, 0);
  eq('no title-derived colorway keys, apparel titles are not that shape', k.existingCwKeys.size, 0);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
