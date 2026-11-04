// team-sales.mjs, The Run House.
//
// Team store sales: which line belongs to which store, and what counts as
// money. Every case is a shape measured on the live store 2026-11-04: tag
// rule stores, the one store that needs ALL its tags, hand picked stores.
//
// Run: node test/team-sales.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { aggregate, buildMatcher } from '../src/teamreq-sales.js';
import worker from '../src/index.js';

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('  ok    ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
};

const stores = [
  { h: 'redbrook', n: 'Redbrook Community Store', tags: ['Redbrook Comm'], all: false, ids: [] },
  { h: 'keefe', n: 'Keefe Tech Online Store', tags: ['Keefe Tech', 'KT Hockey'], all: false, ids: [] },
  { h: 'both-tags', n: 'Needs Both', tags: ['Club A', 'Season 26'], all: true, ids: [] },
  { h: 'picked', n: 'Hand Picked', tags: [], all: false, ids: ['gid://shopify/Product/9'] },
];

console.log('\nMatching a line to its store');
const m = buildMatcher(stores);
const P = (id, tags, title) => ({ id: 'gid://shopify/Product/' + id, tags, title: title || 'P' + id });
check('a tag rule store matches its tag', JSON.stringify(m(P(1, ['Redbrook Comm']))) === '[0]');
check('tags match regardless of case, as Shopify rules do', JSON.stringify(m(P(1, ['redbrook comm']))) === '[0]');
check('any of several tags is enough on an OR store', JSON.stringify(m(P(2, ['KT Hockey']))) === '[1]');
check('an ALL store needs every tag', m(P(3, ['Club A'])).length === 0 && JSON.stringify(m(P(3, ['Club A', 'Season 26']))) === '[2]');
check('a hand picked store matches on product id', JSON.stringify(m(P(9, []))) === '[3]');
check('an unrelated product matches nothing', m(P(5, ['Shoes'])).length === 0);

console.log('\nWhat counts as money');
const line = (parent, q, price, product) => ({ __parentId: parent, currentQuantity: q, discountedUnitPriceAfterAllDiscountsSet: { shopMoney: { amount: String(price) } }, product });
const rows = [
  { id: 'o1', createdAt: '2026-10-01T12:00:00Z' },
  line('o1', 2, 25, P(1, ['Redbrook Comm'], 'Tee')),
  line('o1', 1, 45, P(1, ['Redbrook Comm'], 'Hoodie')),
  { id: 'o2', createdAt: '2026-10-05T12:00:00Z', cancelledAt: '2026-10-06T00:00:00Z' },
  line('o2', 5, 25, P(1, ['Redbrook Comm'], 'Tee')),
  { id: 'o3', createdAt: '2026-10-07T12:00:00Z', test: true },
  line('o3', 5, 25, P(1, ['Redbrook Comm'], 'Tee')),
  { id: 'o4', createdAt: '2026-10-09T12:00:00Z' },
  line('o4', 0, 25, P(1, ['Redbrook Comm'], 'Tee')),
  line('o4', 1, 20, P(2, ['Keefe Tech', 'Redbrook Comm'], 'Cap')),
];
const a = aggregate(stores, rows);
const red = a.stores[0], keefe = a.stores[1];
check('revenue is quantity times the price after discounts', red.revenue === 2 * 25 + 45 + 20, String(red.revenue));
check('a cancelled order is not counted', red.units === 4, String(red.units));
check('a test order is not counted', red.orders === 2, String(red.orders));
check('a fully refunded line (quantity now 0) adds nothing', red.top.find((t) => t.t === 'Tee').u === 2);
check('one item in two stores counts in both', keefe.revenue === 20 && keefe.orders === 1);
check('the last sale date is the newest order', red.last === '2026-10-09');
check('the best sellers are listed, biggest first', red.top[0].t === 'Hoodie' || red.top[0].r >= red.top[1].r);
check('a store with no sales is still listed, at zero', a.stores[3].revenue === 0 && a.stores[3].units === 0);
check('the totals count a sale in two stores ONCE', a.total.revenue === 2 * 25 + 45 + 20 && a.total.units === 4 && a.total.orders === 2, JSON.stringify(a.total));

console.log('\nRevenue stays behind the write secret');
const KV = { m: new Map(), async get(k, t) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v) : v; }, async put(k, v) { this.m.set(k, v); }, async delete(k) { this.m.delete(k); }, async list() { return { keys: [], list_complete: true }; } };
const ENV = { CATALOG: KV, AUTH_MODE: 'bearer', CATALOG_TOKEN: 'tok', WRITE_SECRET: 'sec', ALLOW_BEARER_WRITES: 'true', SHOP_URL: 'x.myshopify.com', CLIENT_ID: 'x', CLIENT_SECRET: 'y' };
const call = (path, o = {}) => worker.fetch(new Request('https://w.example' + path, { method: o.method || 'GET', headers: o.headers || {}, body: o.body ? JSON.stringify(o.body) : undefined }), ENV, {});
let r = await call('/team-requests/sales/status', { headers: { Authorization: 'Bearer tok' } });
check('the public token alone cannot read sales', r.status === 403);
r = await call('/team-requests/sales/fund', { method: 'POST', headers: { Authorization: 'Bearer tok', 'X-Write-Secret': 'sec', 'Content-Type': 'application/json' }, body: { h: 'redbrook', pct: 140, paid: 0 } });
check('a fundraising percentage over 100 is refused', r.status === 400);
r = await call('/team-requests/sales/fund', { method: 'POST', headers: { Authorization: 'Bearer tok', 'X-Write-Secret': 'sec', 'Content-Type': 'application/json' }, body: { h: 'redbrook', pct: 10, paid: 12.5 } });
const fj = await r.json();
check('a store keeps its percentage and what was paid', r.status === 200 && fj.fund.redbrook.pct === 10 && fj.fund.redbrook.paid === 12.5);
r = await call('/team-requests/sales/run', { method: 'POST', headers: { Authorization: 'Bearer tok', 'X-Write-Secret': 'sec', 'Content-Type': 'application/json' }, body: { since: 'last year' } });
check('a run needs a real start date', r.status === 400);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
