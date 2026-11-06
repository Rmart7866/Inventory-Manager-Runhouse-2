// Order lookup for phone calls: find an order by number, email or name and
// see its items, status, where it ships from and its tracking. Read only.
// Behind the write secret, because an order carries a customer's name,
// email, phone and address.
//
// This app has read_orders but NOT read_customers, so `order.customer` is
// refused ("Access denied for customer field"). The order's OWN email,
// phone and shipping address are readable, and the order search still
// matches a customer's name ("smith" finds orders), so lookup by all three
// works without it. Measured 2026-11-06.
//
// The re:do returns line (vendor "re:do") rides on most orders and is
// routed to its own location on purpose (see CLAUDE.md, the Redo section).
// Nothing ships from there, so it is left out of the items, of "ships from"
// and of the shipments (it is marked fulfilled on its own, with no
// tracking), and reported as one flag instead.
//
// Shopify COLLECTIVE items are shipped by the brand, and their fulfillment
// orders belong to the brand, so this app sees none. Their shipment does
// say where it came from ("Comrad via Shopify Collective"), so "ships from"
// is built from both the fulfillment orders and the shipments.

import { createShopifyClient } from './shopify.js';

// What was typed, as a Shopify order search. Pure, for the test.
export function orderQuery(raw) {
  const q = String(raw || '').trim().slice(0, 100);
  if (!q) return null;
  const num = q.replace(/^#\s*/, '');
  if (/^\d{3,8}$/.test(num)) return 'name:' + num;
  if (q.includes('@')) return 'email:' + q.replace(/[\s"'\\]/g, '');
  // A name or anything else: Shopify's own free text order search, with
  // anything that could change the meaning of the search removed.
  const text = q.replace(/[^\p{L}\p{N}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

const isRedo = (li) => !!(li && li.product && /^re:do$/i.test(li.product.vendor || ''));

// One order from the API into what the page shows. Pure, for the test.
export function shapeOrder(o) {
  const items = (o.lineItems.nodes || []);
  const redo = items.some(isRedo);
  const realLines = (nodes) => (nodes || []).some((x) => !isRedo(x.lineItem));
  const shipsFrom = (o.fulfillmentOrders.nodes || [])
    .filter((f) => realLines(f.lineItems.nodes))
    .map((f) => ({ location: f.assignedLocation ? f.assignedLocation.name : '', status: f.status }));
  const ships = (o.fulfillments || []).filter((f) => !f.fulfillmentLineItems || realLines(f.fulfillmentLineItems.nodes));
  for (const f of ships) {
    const where = f.location && f.location.name;
    if (where && !shipsFrom.some((x) => x.location === where)) shipsFrom.push({ location: where, status: 'CLOSED' });
  }
  const a = o.shippingAddress;
  return {
    id: o.id, name: o.name, at: o.createdAt, cancelled: o.cancelledAt || null,
    financial: o.displayFinancialStatus, fulfillment: o.displayFulfillmentStatus,
    source: o.sourceName || '', email: o.email || '', phone: o.phone || (a && a.phone) || '',
    shipTo: a ? { name: a.name || '', line: [a.address1, a.address2].filter(Boolean).join(', '), city: a.city || '', province: a.provinceCode || '', zip: a.zip || '' } : null,
    total: o.currentTotalPriceSet ? Number(o.currentTotalPriceSet.shopMoney.amount) : null,
    items: items.filter((li) => !isRedo(li)).map((li) => ({
      title: li.title, variant: li.variantTitle || '', sku: li.sku || '', qty: li.quantity, current: li.currentQuantity,
      image: li.image ? li.image.url : null,
    })),
    shipsFrom, redo,
    shipments: ships.map((f) => ({
      status: f.displayStatus || f.status, at: f.createdAt, from: (f.location && f.location.name) || '',
      tracking: (f.trackingInfo || []).map((t) => ({ number: t.number || '', url: t.url || '', company: t.company || '' })),
    })),
  };
}

const FIELDS = `id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus sourceName email phone
  shippingAddress{ name address1 address2 city provinceCode zip phone }
  currentTotalPriceSet{ shopMoney{ amount } }
  lineItems(first: 50){ nodes{ title quantity currentQuantity variantTitle sku image{ url(transform:{ maxWidth: 120 }) } product{ vendor } } }
  fulfillmentOrders(first: 10){ nodes{ status assignedLocation{ name } lineItems(first: 50){ nodes{ lineItem{ product{ vendor } } } } } }
  fulfillments(first: 10){ status displayStatus createdAt location{ name } trackingInfo{ number url company }
    fulfillmentLineItems(first: 50){ nodes{ lineItem{ product{ vendor } } } } }`;

// GET /orders/lookup?q=  (staff, write secret)
export async function handleOrderLookup(request, env) {
  const query = orderQuery(new URL(request.url).searchParams.get('q'));
  if (!query) return { status: 400, body: { error: 'Type an order number, an email or a name.' } };
  const client = createShopifyClient(env);
  const r = await client.graphql(`query($q:String){ orders(first: 20, sortKey: CREATED_AT, reverse: true, query:$q){ nodes{ ${FIELDS} } } }`, { q: query });
  return { body: { query, orders: r.data.orders.nodes.map(shapeOrder) } };
}
