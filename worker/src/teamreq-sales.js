// teamreq-sales.js, The Run House. READ ONLY against Shopify.
//
// Sales per team store, and what each team has earned from fundraising.
//
// HOW A SALE IS TIED TO A STORE. A team store is a collection. Measured
// 2026-11-04 over the 476 stores in the builder's list: 473 are smart
// collections whose rules are all TAG EQUALS (42 with more than one tag, one
// of those requiring ALL its tags), and 3 are hand picked. So a line item
// belongs to a store when its product carries the store's tag (any of them,
// or all of them for the AND store), or, for a hand picked store, when its
// product id is in the collection. The tags come back on the order's own
// line items, so one bulk query is enough.
//
// WHY A BULK OPERATION, and why it is started and polled rather than awaited.
// A year of orders is about 39,000 (750 a week, most of them POS), far past
// what paging can do inside a request. Shopify runs ONE bulk query per app at
// a time, and the nightly catalog rebuild uses it too and CANCELS whatever it
// finds (bulk.js runBulkQuery). So this run never cancels anything: it
// refuses to start while a rebuild holds the lock or any bulk query is
// running, and if a rebuild later cancels it, the page is told so plainly.
//
// THE MONEY. Revenue is what was actually paid: currentQuantity (refunds and
// removed items already netted out) times the unit price after every
// discount. Test and cancelled orders are skipped. Fundraising is a MARKUP
// added for the team, the same way the builder adds it, so the team's share
// of a sale is revenue x pct / (100 + pct). Only aggregates leave this file:
// no customer, no order numbers.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';
import { streamJsonl } from './bulk.js';
import { isBuildLocked } from './store.js';

// The builder's catalog, which carries the list of team stores. If the
// builder's CURL constant moves to a new hashed filename, move this too.
const BUILDER_CATALOG = 'https://cdn.shopify.com/s/files/1/0631/6877/4399/files/trh-builder-catalog-be7a99fd83.json';
const RUN_KEY = 'treqsales:run';
const RESULT_KEY = 'treqsales:result';
const FUND_KEY = 'treqfund';

const ORDERS_QUERY = (since) => `{
  orders(query: "created_at:>=${since}") {
    edges { node {
      id createdAt cancelledAt test
      lineItems { edges { node {
        currentQuantity
        discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } }
        product { id title tags }
      } } }
    } }
  }
}`;

// Every team store: the builder's list plus any collection this tool built.
async function storeHandles(env) {
  const out = new Map();
  try {
    const D = await (await fetch(BUILDER_CATALOG)).json();
    for (const s of D.stores || []) out.set(s[1], s[0]);
  } catch (e) { /* fall through, built stores still count */ }
  let cursor;
  do {
    const page = await env.CATALOG.list({ prefix: 'treq:', cursor });
    for (const k of page.keys) {
      const ch = k.metadata && k.metadata.ch;
      if (ch && !out.has(ch)) out.set(ch, k.metadata.t ? k.metadata.t + ' Team Store' : ch);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

// Turn collections into a matcher. Pure, so the test can drive it.
export function buildMatcher(stores) {
  const byTag = new Map(), byId = new Map();
  stores.forEach((s, i) => {
    for (const t of s.tags) { const k = t.toLowerCase(); if (!byTag.has(k)) byTag.set(k, []); byTag.get(k).push(i); }
    for (const id of s.ids) { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(i); }
  });
  return function match(product) {
    if (!product) return [];
    const hit = new Set(byId.get(product.id) || []);
    const tags = new Set((product.tags || []).map((t) => String(t).toLowerCase()));
    for (const t of tags) for (const i of byTag.get(t) || []) {
      const s = stores[i];
      if (!s.all || s.tags.every((x) => tags.has(x.toLowerCase()))) hit.add(i);
    }
    return [...hit];
  };
}

async function loadStores(client, env) {
  const handles = await storeHandles(env);
  const list = [...handles.keys()];
  const stores = [];
  for (let i = 0; i < list.length; i += 50) {
    const q = list.slice(i, i + 50).map((h) => 'handle:' + h).join(' OR ');
    const body = await client.graphql(`query($q:String){ collections(first:50, query:$q){ nodes{ handle title
      ruleSet{ appliedDisjunctively rules{ column relation condition } }
      products(first:250){ nodes{ id } } } } }`, { q });
    for (const c of body.data.collections.nodes) {
      const rules = (c.ruleSet && c.ruleSet.rules) || [];
      const tags = rules.filter((r) => r.column === 'TAG' && r.relation === 'EQUALS').map((r) => r.condition);
      stores.push({
        h: c.handle, n: c.title || handles.get(c.handle) || c.handle,
        tags,
        all: !!(c.ruleSet && !c.ruleSet.appliedDisjunctively && tags.length > 1),
        // Hand picked stores have no rule, so their products are listed.
        ids: c.ruleSet ? [] : c.products.nodes.map((p) => p.id),
      });
    }
  }
  return stores;
}

// Aggregate one bulk result. Exported so the test can feed it rows.
export function aggregate(stores, rows) {
  const match = buildMatcher(stores);
  const per = stores.map(() => ({ orders: new Set(), units: 0, revenue: 0, last: '', top: new Map() }));
  const orders = new Map();
  let lines = 0, matched = 0;
  // Totals count each line ONCE. A product tagged into two stores (a club's
  // track and cross country stores share gear) belongs in both store rows,
  // but adding the rows up would count that sale twice.
  const total = { orders: new Set(), units: 0, revenue: 0 };
  for (const o of rows) {
    if (!o.__parentId) { orders.set(o.id, o.cancelledAt || o.test ? null : o.createdAt); continue; }
    const at = orders.get(o.__parentId);
    if (!at) continue;
    lines++;
    const q = Number(o.currentQuantity) || 0;
    if (q <= 0) continue;
    const hits = match(o.product);
    if (!hits.length) continue;
    matched++;
    const rev = q * Number(o.discountedUnitPriceAfterAllDiscountsSet?.shopMoney?.amount || 0);
    total.orders.add(o.__parentId); total.units += q; total.revenue += rev;
    for (const i of hits) {
      const p = per[i];
      p.orders.add(o.__parentId); p.units += q; p.revenue += rev;
      if (at > p.last) p.last = at;
      const k = o.product.title || o.product.id;
      const t = p.top.get(k) || { t: k, u: 0, r: 0 };
      t.u += q; t.r += rev; p.top.set(k, t);
    }
  }
  return {
    lines, matched,
    total: { orders: total.orders.size, units: total.units, revenue: Math.round(total.revenue * 100) / 100 },
    stores: stores.map((s, i) => ({
      h: s.h, n: s.n,
      orders: per[i].orders.size, units: per[i].units, revenue: Math.round(per[i].revenue * 100) / 100,
      last: per[i].last ? per[i].last.slice(0, 10) : '',
      top: [...per[i].top.values()].sort((a, b) => b.r - a.r).slice(0, 8).map((x) => ({ t: x.t, u: x.u, r: Math.round(x.r * 100) / 100 })),
    })),
  };
}

async function currentOp(client) {
  const b = await client.graphql('{ currentBulkOperation(type: QUERY) { id status } }');
  return b.data.currentBulkOperation;
}

// POST /team-requests/sales/run { since }
export async function handleSalesRun(request, env) {
  let b;
  try { b = await request.json(); } catch { b = {}; }
  const since = String(b.since || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return { status: 400, body: { error: 'since must be YYYY-MM-DD' } };
  if (since < new Date(Date.now() - 3 * 366 * 86400000).toISOString().slice(0, 10)) return { status: 400, body: { error: 'At most three years back.' } };

  if (await isBuildLocked(env, 'all')) return { status: 409, body: { error: 'The nightly catalog rebuild is running and Shopify allows one of these at a time. Try again in a few minutes.' } };
  const client = createShopifyClient(env);
  const cur = await currentOp(client);
  if (cur && (cur.status === 'RUNNING' || cur.status === 'CREATED')) return { status: 409, body: { error: 'Another Shopify bulk job is running (usually the catalog rebuild). Try again in a few minutes.' } };

  const stores = await loadStores(client, env);
  const sub = await client.graphql(`mutation($q:String!){ bulkOperationRunQuery(query:$q){ bulkOperation{ id status } userErrors{ message } } }`, { q: ORDERS_QUERY(since) });
  const r = sub.data.bulkOperationRunQuery;
  if (r.userErrors.length) return { status: 502, body: { error: 'Shopify refused the sales job: ' + r.userErrors.map((e) => e.message).join('; ') } };
  const run = { id: r.bulkOperation.id, since, at: new Date().toISOString(), state: 'running', stores };
  await env.CATALOG.put(RUN_KEY, JSON.stringify(run), { expirationTtl: 6 * 3600 });
  return { body: { ok: true, state: 'running', since } };
}

// GET /team-requests/sales/status: progress while running, the result after.
export async function handleSalesStatus(request, env) {
  const fund = (await env.CATALOG.get(FUND_KEY, 'json')) || {};
  const last = await env.CATALOG.get(RESULT_KEY, 'json');
  const run = await env.CATALOG.get(RUN_KEY, 'json');
  if (!run || run.state !== 'running') return { body: { state: run ? run.state : 'idle', error: run && run.error, result: last, fund } };

  const client = createShopifyClient(env);
  const b = await client.graphql('query($id:ID!){ node(id:$id){ ... on BulkOperation { status errorCode objectCount url } } }', { id: run.id });
  const op = b.data.node;
  if (!op) return { body: { state: 'running', objects: 0, result: last, fund } };
  if (op.status === 'RUNNING' || op.status === 'CREATED') return { body: { state: 'running', objects: Number(op.objectCount) || 0, since: run.since, result: last, fund } };
  if (op.status !== 'COMPLETED') {
    run.state = 'failed';
    run.error = op.status === 'CANCELED'
      ? 'The sales job was cancelled, most likely by the catalog rebuild, which takes priority. Run it again.'
      : 'Shopify could not finish the sales job (' + (op.errorCode || op.status) + '). Run it again.';
    await env.CATALOG.put(RUN_KEY, JSON.stringify(run), { expirationTtl: 6 * 3600 });
    return { body: { state: 'failed', error: run.error, result: last, fund } };
  }

  // Completed: read the file once. Mark it first so a second poll that lands
  // while this one is reading does not read it again.
  run.state = 'processing';
  await env.CATALOG.put(RUN_KEY, JSON.stringify(run), { expirationTtl: 6 * 3600 });
  const rows = [];
  const match = buildMatcher(run.stores);
  await streamJsonl(op.url, (o) => {
    // Keep only orders and the lines that belong to a team store, so memory
    // stays small however big the year is.
    if (!o.__parentId) rows.push({ id: o.id, createdAt: o.createdAt, cancelledAt: o.cancelledAt, test: o.test });
    else if (match(o.product).length) rows.push(o);
  });
  const agg = aggregate(run.stores, rows);
  const result = { since: run.since, at: new Date().toISOString(), orderRows: rows.filter((x) => !x.__parentId).length, ...agg };
  await env.CATALOG.put(RESULT_KEY, JSON.stringify(result));
  run.state = 'done';
  await env.CATALOG.put(RUN_KEY, JSON.stringify(run), { expirationTtl: 6 * 3600 });
  return { body: { state: 'done', result, fund } };
}

// POST /team-requests/sales/fund { h, pct, paid }: the fundraising markup a
// store carries and what has been paid to the team so far. Staff typed.
export async function handleSalesFund(request, env) {
  let b;
  try { b = await request.json(); } catch { b = null; }
  const h = String((b && b.h) || '').slice(0, 200);
  if (!h) return { status: 400, body: { error: 'Which store?' } };
  const pct = Number(b.pct), paid = Number(b.paid);
  if (!(pct >= 0 && pct <= 100)) return { status: 400, body: { error: 'Fundraising must be 0 to 100 percent' } };
  if (!(paid >= 0)) return { status: 400, body: { error: 'Paid must be zero or more' } };
  const fund = (await env.CATALOG.get(FUND_KEY, 'json')) || {};
  fund[h] = { pct, paid: Math.round(paid * 100) / 100, at: new Date().toISOString() };
  await env.CATALOG.put(FUND_KEY, JSON.stringify(fund));
  return { body: { ok: true, fund } };
}
