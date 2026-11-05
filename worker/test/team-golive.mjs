// team-golive.mjs, The Run House.
//
// Go live publishes one team store. What must never regress: it touches only
// the request's own build, only DRAFT to ACTIVE, keeps team gear out of the
// ad and shopping feeds, and refuses without a person confirming approval.
//
// Run: node test/team-golive.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { pickChannels, livePlan } from '../src/teamreq-live.js';
import worker from '../src/index.js';

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('  ok    ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
};

// The channel names on the live store, 2026-11-05.
const pubs = ['Online Store', 'Facebook & Instagram', 'Google & YouTube', 'Point of Sale', 'Shop', 'Headless'].map((name, i) => ({ id: 'p' + i, name }));

console.log('\nChannels');
const team = pickChannels(pubs, false).map((p) => p.name);
check('team gear goes to the Online Store', team.includes('Online Store'));
check('and point of sale and the rest', team.includes('Point of Sale') && team.includes('Shop'));
check('but NOT the Facebook and Google feeds', !team.some((n) => /Facebook|Google/.test(n)), team.join(', '));
check('a searchable race store goes everywhere', pickChannels(pubs, true).length === pubs.length);

console.log('\nWhat changes');
const ids = ['a', 'b', 'c', 'd'];
const plan = livePlan([{ id: 'a', status: 'DRAFT', title: 'A' }, { id: 'b', status: 'ACTIVE', title: 'B' }, { id: 'c', status: 'ARCHIVED', title: 'C' }, null], ids);
check('a draft is activated', plan.activate.length === 1 && plan.activate[0].id === 'a');
check('an active product is left alone', plan.already.length === 1);
check('an ARCHIVED product is never revived', plan.archived.length === 1 && !plan.activate.some((n) => n.id === 'c'));
check('a product that is gone is counted, not guessed', plan.missing.length === 1 && plan.missing[0] === 'd');

console.log('\nThe gate');
const KV = { m: new Map(), async get(k, t) { const v = this.m.get(k); return v == null ? null : t === 'json' ? JSON.parse(v.v) : v.v; }, async put(k, v, o = {}) { this.m.set(k, { v, meta: o.metadata }); }, async delete(k) { this.m.delete(k); }, async list({ prefix }) { return { keys: [...this.m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name, metadata: this.m.get(name).meta })), list_complete: true }; } };
const ENV = { CATALOG: KV, AUTH_MODE: 'bearer', CATALOG_TOKEN: 'tok', WRITE_SECRET: 'sec', ALLOW_BEARER_WRITES: 'true', SHOP_URL: 'x.myshopify.com', CLIENT_ID: 'x', CLIENT_SECRET: 'y' };
const call = (path, o = {}) => worker.fetch(new Request('https://w.example' + path, { method: o.method || 'POST', headers: o.headers || {}, body: o.body ? JSON.stringify(o.body) : undefined }), ENV, {});
const STAFF = { Authorization: 'Bearer tok', 'X-Write-Secret': 'sec', 'Content-Type': 'application/json' };
const id = '0000000aa-bbbbbb';
await KV.put('treq:' + id, JSON.stringify({ id, status: 'progress', req: {}, work: { team: 'T' }, log: [] }));
let r = await call('/team-requests/golive', { headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: { id } });
check('go live needs the write secret', r.status === 403);
r = await call('/team-requests/golive', { headers: STAFF, body: { id } });
check('nothing built yet: refused before any Shopify call', r.status === 400 && /Create the drafts first/.test((await r.json()).error));
await KV.put('treq:' + id, JSON.stringify({ id, status: 'progress', req: {}, work: { team: 'T' }, build: { products: [{ id: 'gid://shopify/Product/1' }] }, log: [] }));
r = await call('/team-requests/golive', { headers: STAFF, body: { id, dryRun: false } });
check('a real go live without the approval confirmation is refused', r.status === 400 && /customer approved/.test((await r.json()).error));
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('network down'); };
r = await call('/team-requests/golive', { headers: STAFF, body: { id, dryRun: false, approved: true } });
globalThis.fetch = realFetch;
check('if Shopify cannot be read, nothing is changed', r.status === 502 && /nothing was changed/.test((await r.json()).error));

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
