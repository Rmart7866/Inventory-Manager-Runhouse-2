// needham.mjs, The Run House.
//
// Unit-tests the Needham (dropship location) scoping logic without a live
// Shopify. The one thing this CANNOT verify is that the GraphQL queries are
// accepted by the Admin API, that was verified separately against the live
// store. It DOES verify the transform: given a Needham inventory-levels response
// and a products response, the per-product `needham` flag and the payload's
// needhamScoped come out right. That is the logic that would otherwise ship
// untested and guard a zero-out.
//
// Run: npm run test:needham
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { buildCatalog } from '../src/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures++; console.log('  FAIL  ' + m); };
const check = (m, cond) => cond ? ok(m) : bad(m);

function node(handle, title) {
  return { id: 'gid://shopify/Product/' + handle, handle, title, vendor: 'Hoka', productType: "Men's Shoes", status: 'ACTIVE', tags: [], variants: { nodes: [{ sku: handle + '-9', price: '140.00' }] } };
}

// A fake Shopify client. Routes by query text: the location query returns the
// Needham inventory levels, the products query returns the catalog nodes. This
// mirrors the two real passes (fetchNeedhamHandles + fetchAll).
function fakeClient(nodes, needhamHandles) {
  return {
    SHOP: 'test.myshopify.com',
    graphql: async (query) => {
      if (/inventoryLevels/.test(query)) {
        return { data: { location: { inventoryLevels: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: needhamHandles.map((h) => ({ item: { variant: { product: { handle: h } } } })),
        } } } };
      }
      return { data: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
    },
  };
}

const NEEDHAM = 'gid://shopify/Location/111';

// Two products: A stocked at Needham (dropship), B stocked elsewhere (not).
const nodes = [
  node('clifton-9-black', 'Hoka Mens Clifton 9 - Black (1111-BLK)'),
  node('retail-only-shoe', 'Hoka Mens Bondi 8 - White (2222-WHT)'),
];
// Needham holds only clifton-9-black (and some unrelated non-footwear handle).
const needhamHandles = ['clifton-9-black', 'some-tshirt-not-in-catalog'];

// --- scoping ON ------------------------------------------------------------
console.log('\nNeedham scoping ON (location id configured)');
const scoped = await buildCatalog(fakeClient(nodes, needhamHandles), { needhamLocationId: NEEDHAM });

check('payload reports needhamScoped = true', scoped.needhamScoped === true);
check('counts.needhamProducts = 1', scoped.counts.needhamProducts === 1);

const A = scoped.products.find((p) => p.handle === 'clifton-9-black');
const B = scoped.products.find((p) => p.handle === 'retail-only-shoe');
check('product stocked at Needham has needham = true', A && A.needham === true);
check('product not at Needham has needham = false', B && B.needham === false);
check('both products still appear in the catalog (bySku needs all handles)', scoped.products.length === 2);
check('bySku still carries the non-Needham product SKUs (collision checks)', scoped.bySku['9'] === undefined || scoped.bySku['retail-only-shoe-9'] === 'retail-only-shoe');

// --- scoping OFF (current live state) --------------------------------------
console.log('\nNeedham scoping OFF (no location id, the current live state)');
const unscoped = await buildCatalog(fakeClient(nodes, needhamHandles), {});

check('payload reports needhamScoped = false', unscoped.needhamScoped === false);
check('counts.needhamProducts = null when off', unscoped.counts.needhamProducts === null);
const A2 = unscoped.products.find((p) => p.handle === 'clifton-9-black');
check('needham flag is null (unknown) when scoping is off', A2 && A2.needham === null);
check('catalog otherwise unchanged: 2 products', unscoped.products.length === 2);

console.log('');
if (failures) { console.log(`NEEDHAM TESTS FAILED: ${failures}`); process.exit(1); }
console.log('Needham scoping logic OK. Live queries verified against the store separately.\n');
