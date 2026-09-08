// bulk-fields.mjs, The Run House.
//
// The bulk reassembler is a WHITELIST, and that is the trap this file exists for.
//
// makeBulkAssembler copies named fields off each product line of the JSONL into
// the node buildCatalog later reads. Add a field to the bulk query and to the
// output mapping, forget the copy in the middle, and nothing breaks loudly: the
// field simply arrives empty on every product in production. That is what
// happened to createdAt. The paged dev path passes its nodes straight through,
// so it looked right locally, while the deployed catalog had createdAt: '' on
// all 4,570 products. Catalog Tagging then scoped every run to zero products and
// reported a clean catalog, which reads as "the tagging is broken" because the
// answer is indistinguishable from there being nothing to do.
//
// So: assert the round trip, JSONL in, payload out, for the fields the front end
// actually depends on. A field that only the query knows about is not carried.
//
// Run: node test/bulk-fields.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { assembleBulkObjects, buildCatalogFrom } from '../src/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const check = (m, cond, extra) => (cond ? ok(m) : bad(m, extra));

const NEEDHAM = 'gid://shopify/Location/111';
const PID = 'gid://shopify/Product/1';
const VID = 'gid://shopify/ProductVariant/11';

// assembleBulkObjects takes the parsed objects, in the order bulk emits them:
// the product line first, then its variants, then each variant's levels.
const productLine = {
  id: PID, handle: 'nb-880v15-black', title: "New Balance Mens 880v15 - BLACK",
  vendor: 'New Balance', productType: "Men's Shoes", status: 'ACTIVE',
  tags: ['New Balance'], descriptionHtml: '', updatedAt: '2026-09-08T12:00:00Z',
  createdAt: '2026-09-07T09:30:00Z',
  featuredImage: { url: 'https://cdn.example/x.jpg' },
};
const jsonl = [
  productLine,
  { id: VID, __parentId: PID, sku: 'M880B15  D  09', price: '144.99',
    selectedOptions: [{ name: 'Size', value: '9' }], inventoryItem: { id: 'gid://I/1' } },
  { __parentId: VID, location: { id: NEEDHAM }, quantities: [{ name: 'on_hand', quantity: 4 }] },
];

const { raw, needham } = assembleBulkObjects(jsonl, NEEDHAM);
check('the product survives the assembler', raw.length === 1, raw.map((p) => p.handle));

console.log('\nFields the front end depends on survive JSONL to payload');
const cat = buildCatalogFrom(raw, needham, { needhamLocationId: NEEDHAM, shop: 'test.myshopify.com' });
const p = cat.products[0];

// createdAt is the one that was actually lost. Catalog Tagging's "added in the
// last N days" scope is built entirely on it, and an empty value silently means
// "no products match" rather than any kind of error.
check('createdAt', p.createdAt === '2026-09-07T09:30:00Z', p.createdAt);
check('updatedAt', p.updatedAt === '2026-09-08T12:00:00Z', p.updatedAt);
check('image', p.image === 'https://cdn.example/x.jpg', p.image);
check('title', p.title === "New Balance Mens 880v15 - BLACK", p.title);
check('vendor', p.vendor === 'New Balance', p.vendor);
check('productType', p.productType === "Men's Shoes", p.productType);
check('status', p.status === 'ACTIVE', p.status);
check('tags', Array.isArray(p.tags) && p.tags.includes('New Balance'), p.tags);
check('needham on-hand', p.needhamOnHand === 4, p.needhamOnHand);

console.log('\nA product with no createdAt does not fake one');
const bare = { ...productLine };
delete bare.createdAt;
const noDate = assembleBulkObjects([bare, jsonl[1], jsonl[2]], NEEDHAM);
const cat2 = buildCatalogFrom(noDate.raw, noDate.needham, { needhamLocationId: NEEDHAM, shop: 't' });
check('empty string, not undefined or a made up date', cat2.products[0].createdAt === '', cat2.products[0].createdAt);

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
