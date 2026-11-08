// Shoe sales per shop, for the Shoe sizes page: how many pairs of each style
// left each shop's shelf in the last 30 and 90 days, and in which sizes. Put
// next to what is on the shelf now (size-coverage.js) that gives sell
// through, sold / (sold + on hand), and weeks of stock left.
//
// WHERE A SALE HAPPENED, PER LINE. Read off real orders 2026-11-08: a POS
// sale carries retailLocation, the shop it rang up in. An online order has
// none, and each of its lines sits in a FULFILLMENT ORDER assigned to the
// shop that ships it. Placing a whole order by its fulfillments is wrong
// here: the re:do returns line is assigned to Scituate (see CLAUDE.md), so
// nearly every online order "ships from two shops", and measured over 90
// days that would have thrown away 962 orders, 140 of them Walpole and
// Falmouth. So each line is placed on its own: retailLocation first, else
// the location of the CLOSED fulfillment order holding it. A line whose
// fulfillment order is still open has not left a shelf and is not counted
// yet; it counts once it ships.
//
// The bulk file cannot hold fulfillments' own line items (Shopify refuses a
// connection inside a list field), which is why this reads fulfillmentOrders,
// a connection, instead. Its rows can arrive before or after the order's line
// items, so shoe lines are held until the whole file is read.
//
// WHY A BULK QUERY, and why inside the catalog rebuild. 90 days is about
// 10,000 orders (750 a week), far past paging. Shopify runs ONE bulk query
// per app at a time and runBulkQuery cancels whatever it finds, so this runs
// straight after the catalog's own bulk query, in the same rebuild that
// already holds the build lock, and in its own try: a failure here leaves the
// catalogs and the size coverage exactly as they were, and keeps the previous
// sales numbers.
//
// Needham is left out, the same as the coverage: it is the dropship location.
// Only men's and women's shoes, the same types the coverage counts. Quantity
// is currentQuantity, so refunded and removed items are already netted out.
// Only aggregates are stored: no order, no customer.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { runBulkQuery, streamJsonl } from './bulk.js';
import { normSize, genderOf, modelOf } from './size-coverage.js';

export const SALES_KEY = 'sizesales';
export const DAYS = 90;

export const salesQuery = (since) => `{
  orders(query: "created_at:>=${since}") {
    edges { node {
      id createdAt test cancelledAt
      retailLocation { id }
      fulfillmentOrders { edges { node {
        id status assignedLocation { location { id } }
        lineItems { edges { node { lineItem { id } } } }
      } } }
      lineItems { edges { node {
        id currentQuantity
        variant { selectedOptions { name value } }
        product { handle title vendor productType tags featuredImage { url(transform: { maxWidth: 120 }) } }
      } } }
    } }
  }
}`;

// Aggregate the bulk file's rows. Pure, so the test drives it. now is a Date
// so "the last 30 days" is testable.
export function makeSalesAccumulator(skipLocationIds = [], now = new Date()) {
  const skip = new Set(skipLocationIds.filter(Boolean));
  const d30 = now.getTime() - 30 * 86400e3;
  const orders = new Map(); // order id -> { retail, recent }, absent when not counted
  const foLoc = new Map(); // fulfillment order id -> location id, CLOSED ones only
  const lineLoc = new Map(); // line item id -> location id it shipped from
  const pending = []; // shoe lines, placed once every row is in
  const seen = { orders: 0, lines: 0, pairs: 0, unshipped: 0 };
  const onObject = (o) => {
    if (!o.__parentId) {
      seen.orders++;
      if (!o.test && !o.cancelledAt) orders.set(o.id, { retail: (o.retailLocation && o.retailLocation.id) || null, recent: Date.parse(o.createdAt) >= d30 });
      return;
    }
    if ('status' in o && 'assignedLocation' in o) { // a fulfillment order
      if (o.status === 'CLOSED' && o.assignedLocation && o.assignedLocation.location) foLoc.set(o.id, o.assignedLocation.location.id);
      return;
    }
    if (o.lineItem && !('currentQuantity' in o)) { // a fulfillment order's line
      const loc = foLoc.get(o.__parentId);
      if (loc) lineLoc.set(o.lineItem.id, loc);
      return;
    }
    const ord = orders.get(o.__parentId);
    if (!ord) return;
    const p = o.product, q = Number(o.currentQuantity) || 0;
    if (!p || q <= 0) return;
    const g = genderOf(p.productType);
    if (!g) return;
    const opts = (o.variant && o.variant.selectedOptions) || [];
    const so = opts.find((x) => /size/i.test(x.name)) || opts[0] || {};
    const size = normSize(so.value);
    if (!size) return;
    pending.push({ id: o.id, ord, p, g, size, q });
  };
  const result = () => {
    const data = new Map(); // loc -> gender -> handle -> record
    for (const l of pending) {
      const loc = l.ord.retail || lineLoc.get(l.id);
      if (!loc) { seen.unshipped += l.q; continue; }
      if (skip.has(loc)) continue;
      seen.lines++; seen.pairs += l.q;
      let byG = data.get(loc); if (!byG) data.set(loc, (byG = { men: new Map(), women: new Map() }));
      let r = byG[l.g].get(l.p.handle);
      if (!r) {
        const mw = modelOf(l.p);
        byG[l.g].set(l.p.handle, (r = { h: l.p.handle, t: l.p.title, v: l.p.vendor || '', m: mw.m, w: mw.w, img: (l.p.featuredImage && l.p.featuredImage.url) || '', d30: 0, d90: 0, sz: {} }));
      }
      r.d90 += l.q; if (l.ord.recent) r.d30 += l.q;
      r.sz[l.size] = (r.sz[l.size] || 0) + l.q;
    }
    const byLoc = {};
    for (const [loc, byG] of data) byLoc[loc] = { men: [...byG.men.values()], women: [...byG.women.values()] };
    return { byLoc, seen };
  };
  return { onObject, result };
}

// Run the bulk query, aggregate, store. Called from rebuild().
export async function writeSizeSales(env, client, needhamLocationId, now = new Date()) {
  const since = new Date(now.getTime() - DAYS * 86400e3).toISOString().slice(0, 10);
  const url = await runBulkQuery(client, salesQuery(since));
  const acc = makeSalesAccumulator([needhamLocationId], now);
  await streamJsonl(url, acc.onObject);
  const { byLoc, seen } = acc.result();
  const body = JSON.stringify({ at: now.toISOString(), since, days: DAYS, byLoc, seen });
  await env.CATALOG.put(SALES_KEY, body);
  return { ...seen, bytes: body.length };
}
