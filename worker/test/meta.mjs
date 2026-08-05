// meta.mjs, The Run House.
//
// KV metadata is capped at 1024 bytes and a write over the cap fails the whole
// build, leaving a catalog that silently stops updating. So what goes in there is
// worth a test: the bounded status mix stays (it is the cheap way to spot drift),
// the unbounded type and brand breakdowns do not, and the result has real headroom
// against the cap even with an absurd number of product types.
//
// Run: npm run test:meta
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { writeCatalog, writeApparel } from '../src/store.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const check = (m, cond, extra) => (cond ? ok(m) : bad(m, extra));

// A KV stub that records what it was handed.
function fakeEnv() {
  const puts = [];
  return { puts, CATALOG: { put: async (key, body, opts) => { puts.push({ key, body, metadata: opts && opts.metadata }); } } };
}

const footwearPayload = {
  generatedAt: '2026-08-05T18:14:03.759Z',
  counts: { products: 4090, skus: 47151, models: 786, unparsed: 26, needhamProducts: 3377, byStatus: { ARCHIVED: 299, ACTIVE: 3072, DRAFT: 745 } },
  products: [], bySku: {}, byModel: {},
};

console.log('\nFootwear metadata');
const env1 = fakeEnv();
const meta1 = await writeCatalog(env1, 'all', footwearPayload);
check('the status mix survives, it is bounded and it is the drift signal', JSON.stringify(meta1.counts.byStatus) === JSON.stringify({ ARCHIVED: 299, ACTIVE: 3072, DRAFT: 745 }), meta1.counts);
check('scalar counters survive', meta1.counts.products === 4090 && meta1.counts.skus === 47151);
check('sizeBytes recorded', meta1.sizeBytes === JSON.stringify(footwearPayload).length);
const size1 = JSON.stringify(meta1).length;
check(`fits the 1024 byte cap (${size1} bytes)`, size1 < 1024, size1);

console.log('\nApparel metadata drops the unbounded breakdowns');
// Deliberately absurd: 120 product types and 40 brands, far past anything real.
const byType = {}; for (let i = 0; i < 120; i++) byType['Some Garment Category ' + i] = i;
const byBrand = {}; for (let i = 0; i < 40; i++) byBrand['BRAND_NUMBER_' + i] = i;
const apparelPayload = {
  generatedAt: '2026-08-05T18:14:03.759Z',
  counts: { products: 1397, variants: 7852, withSku: 97, codes: 19, ambiguousCodes: 2, byType, byBrand },
  products: [], byCode: {}, ambiguousCodes: [],
};
const env2 = fakeEnv();
const meta2 = await writeApparel(env2, 'all', apparelPayload);
check('byType is not in metadata', !('byType' in meta2.counts));
check('byBrand is not in metadata', !('byBrand' in meta2.counts));
check('scalar counters survive', meta2.counts.products === 1397 && meta2.counts.codes === 19);
const size2 = JSON.stringify(meta2).length;
check(`still fits comfortably with 120 product types (${size2} bytes)`, size2 < 400, size2);

console.log('\nThe breakdowns are still in the payload body');
check('byType survives in the body', Object.keys(JSON.parse(env2.puts[0].body).counts.byType).length === 120);
check('byStatus survives in the body', !!JSON.parse(env1.puts[0].body).counts.byStatus);

console.log('\nBoth writes go to their own key');
check('footwear key', env1.puts[0].key === 'catalog:v1:all', env1.puts[0].key);
check('apparel key', env2.puts[0].key === 'catalog:v1:apparel:all', env2.puts[0].key);

console.log('');
if (failures) { console.log(`META TESTS FAILED: ${failures}`); process.exit(1); }
console.log('KV metadata stays inside the cap.\n');
