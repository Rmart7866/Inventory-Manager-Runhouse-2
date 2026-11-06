// The Team stores tab: reading the site's directory, explaining a hidden
// store, and the cache rules.
import { siteHandles, whyHidden, handleStores, STORES_KEY } from '../src/teamreq-stores.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };

console.log('\nReading the site\'s Team Stores page');
const page = '<ul><li><a href="/collections/altra" class="dropdown__link">Altra</a></li></ul>' +
  '<div class="ts-grid" data-ts-grid><a href="/collections/3-dudes-brews"\n                 class="ts-card"\n                 data-search="3 dudes brews"><span>3</span></a>' +
  '<a href="/collections/agawam" class="ts-card" data-search="agawam">Agawam</a></div>';
const got = siteHandles(page);
check('store cards are read, across line breaks', got.has('3-dudes-brews') && got.has('agawam'));
check('the site menu\'s brand links are not stores', !got.has('altra') && got.size === 2);

console.log('\nWhy a store is not on the site');
check('every reason that applies, in words', whyHidden({ dir: false, live: false, products: 0 }) === 'not in the directory, unpublished, no products');
check('only the one that applies', whyHidden({ dir: true, live: true, products: 0 }) === 'no products');
check('a store whose collection was deleted says so', whyHidden({ missing: true }) === 'No such collection in Shopify');

console.log('\nCache');
const kv = {};
const KV = { get: async (k) => (k in kv ? JSON.parse(kv[k]) : null), put: async (k, v) => { kv[k] = v; }, list: async () => ({ keys: [], list_complete: true }) };
kv[STORES_KEY] = JSON.stringify({ at: new Date().toISOString(), stores: [{ h: 'agawam' }] });
let r = await handleStores(new Request('https://w/team-requests/stores'), { CATALOG: KV });
check('a fresh list is served from the cache, no Shopify call', r.body.stores[0].h === 'agawam' && !r.body.error);
// A refresh that fails keeps the last good list
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network down'); };
r = await handleStores(new Request('https://w/team-requests/stores?fresh=1'), { CATALOG: KV, SHOP_URL: 'x.myshopify.com' });
globalThis.fetch = realFetch;
check('a failed refresh keeps the last good list, and says so', r.body.stores && r.body.stores[0].h === 'agawam' && /Could not refresh/.test(r.body.error || ''));
r = await handleStores(new Request('https://w/team-requests/stores?fresh=1'), { CATALOG: { ...KV, get: async () => null }, SHOP_URL: 'x.myshopify.com' });
check('with nothing cached, a failure is an error, not an empty list', r.status === 502);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
