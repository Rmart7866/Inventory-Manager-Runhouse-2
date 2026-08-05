// known-set.mjs, The Run House.
//
// Unit-tests CatalogClient.buildKnownSets, the browser-side half of Needham
// scoping: given a catalog payload, it must put ONLY Needham-stocked dropship
// products into the known set when scoping is on, and fall back to all footwear
// (with a warning) when it is off. This is the filter that decides what can be
// flagged for zeroing, so it is worth a test.
//
// Run: npm run test:known-set
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const CatalogClient = require(join(HERE, '..', '..', 'catalog-client.js'));

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures++; console.log('  FAIL  ' + m); };
const check = (m, cond) => cond ? ok(m) : bad(m);

// productType matters: the scoped known set keeps only the dropship footwear
// types (Men's / Women's / Unisex Shoes), so a fixture without one is excluded
// and every scoped assertion below reads as an empty set. The live catalog
// always carries it, see buildCatalogFrom.
function product(handle, needham, productType) {
  return { handle, title: 'Hoka ' + handle, vendor: 'Hoka', brand: 'HOKA', productType: productType || "Men's Shoes", skus: [handle + '-9'], needham };
}

// Three active Hoka products: two at Needham, one not.
const base = {
  statusByHandle: { 'clifton-9': 'ACTIVE', 'bondi-8': 'ACTIVE', 'retail-only': 'ACTIVE' },
  products: [product('clifton-9', true), product('bondi-8', true), product('retail-only', false)],
};

console.log('\nScoped catalog (needhamScoped = true)');
const scoped = CatalogClient.buildKnownSets({ ...base, needhamScoped: true }, 'hoka', null);
check('known set has exactly the 2 Needham products', scoped.colorways.size === 2);
check('includes clifton-9 (at Needham)', scoped.colorways.has('clifton-9'));
check('EXCLUDES retail-only (not at Needham)', !scoped.colorways.has('retail-only'));

console.log('\nUnscoped catalog (needhamScoped = false, current live state)');
// Silence the expected warning for clean test output.
const warn = console.warn; console.warn = () => {};
const unscoped = CatalogClient.buildKnownSets({ ...base, needhamScoped: false }, 'hoka', null);
console.warn = warn;
check('falls back to ALL 3 footwear when scoping is off', unscoped.colorways.size === 3);
check('includes retail-only in the fallback (cannot tell it apart)', unscoped.colorways.has('retail-only'));

console.log('\nBrand filtering still applies');
const mixed = {
  needhamScoped: true,
  statusByHandle: { 'hoka-a': 'ACTIVE', 'saucony-b': 'ACTIVE' },
  products: [product('hoka-a', true), { handle: 'saucony-b', title: 'x', vendor: 'Saucony', brand: 'SAUCONY', skus: [], needham: true }],
};
const hokaOnly = CatalogClient.buildKnownSets(mixed, 'hoka', null);
check('only the requested brand is in the set', hokaOnly.colorways.size === 1 && hokaOnly.colorways.has('hoka-a'));

console.log('');
if (failures) { console.log(`KNOWN-SET TESTS FAILED: ${failures}`); process.exit(1); }
console.log('buildKnownSets Needham scoping OK.\n');
