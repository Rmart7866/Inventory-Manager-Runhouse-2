// late-orders.js, The Run House. Dropship orders still waiting on the
// supplier: every line open at NEEDHAM, oldest first, for late-orders.html.
//
// READ ONLY against Shopify. The only thing it stores is the staff's own
// chase notes ("HOKA says backorder, ships 11/20"), under latechase:<order>,
// so the next person can see the rep was already asked.
//
// "Late" is one number for every brand, owner decision 2026-11-09: a late
// order is late whoever makes the shoe. The page holds the number (5 days by
// default, changeable there); this file just reports days waiting.
//
// Measured 2026-11-09: 278 candidate orders, 49 open Needham lines, 3.5 s,
// six pages of a query filtered to unshipped and partial orders, so it is
// read live rather than cached.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';

const CHASE = 'latechase:';
const CHASE_TTL = 180 * 86400;
const LOOKBACK_DAYS = 90;

async function readJson(request) { try { return await request.json(); } catch (e) { return {}; } }

// One order's open Needham lines, as rows. Pure, so the test drives it.
export function openNeedhamLines(order, needhamId) {
  const lines = [];
  for (const fo of order.fulfillmentOrders || []) {
    if (!['OPEN', 'IN_PROGRESS'].includes(fo.status)) continue;
    if (!fo.assignedLocation || !fo.assignedLocation.location || fo.assignedLocation.location.id !== needhamId) continue;
    for (const l of fo.lineItems || []) {
      if (l.remainingQuantity > 0) lines.push({ vendor: l.lineItem.vendor || '', title: l.lineItem.title || '', variant: l.lineItem.variantTitle || '', qty: l.remainingQuantity });
    }
  }
  return lines;
}

const Q = `query($c:String, $q:String){ orders(first: 50, after:$c, sortKey: CREATED_AT, reverse: true, query:$q){ pageInfo{ hasNextPage endCursor }
  nodes{ id name createdAt test
    shippingAddress{ lastName countryCodeV2 } billingAddress{ lastName }
    fulfillmentOrders(first: 10){ nodes{ status assignedLocation{ location{ id } }
      lineItems(first: 30){ nodes{ remainingQuantity lineItem{ vendor title variantTitle } } } } } } } }`;

// GET /orders/late  (staff, write secret)
export async function handleLateOrders(request, env) {
  const client = createShopifyClient(env);
  const needham = env.NEEDHAM_LOCATION_ID;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400e3).toISOString().slice(0, 10);
  const q = 'created_at:>=' + since + ' -status:cancelled (fulfillment_status:unshipped OR fulfillment_status:partial)';
  const rows = [];
  let cursor = null, pages = 0;
  do {
    const r = await client.graphql(Q, { c: cursor, q });
    for (const o of r.data.orders.nodes) {
      if (o.test) continue;
      const items = openNeedhamLines({ fulfillmentOrders: o.fulfillmentOrders.nodes.map((f) => ({ ...f, lineItems: f.lineItems.nodes })) }, needham);
      if (!items.length) continue;
      const last = (o.shippingAddress && o.shippingAddress.lastName) || (o.billingAddress && o.billingAddress.lastName) || '';
      const num = o.name.replace(/^#/, '');
      rows.push({
        id: o.id.split('/').pop(), name: o.name, at: o.createdAt,
        days: Math.floor((Date.now() - Date.parse(o.createdAt)) / 86400e3),
        po: num + (last ? '_' + last.replace(/\s+/g, '') : ''),
        country: (o.shippingAddress && o.shippingAddress.countryCodeV2) || '',
        brands: [...new Set(items.map((i) => i.vendor).filter(Boolean))], items,
      });
    }
    cursor = r.data.orders.pageInfo.hasNextPage ? r.data.orders.pageInfo.endCursor : null;
  } while (cursor && ++pages < 20);

  // What the shipping email reader knows about each order, newest first.
  const mail = new Map();
  let c2;
  do {
    const p = await env.CATALOG.list({ prefix: 'trk:', cursor: c2 });
    for (const k of p.keys) {
      const m = k.metadata || {};
      if (m.o && !mail.has(m.o)) mail.set(m.o, { st: m.st, r: m.r || '', t: m.t || '', at: m.at });
    }
    c2 = p.list_complete ? null : p.cursor;
  } while (c2);
  // Chase notes.
  const chase = new Map();
  let c3;
  do {
    const p = await env.CATALOG.list({ prefix: CHASE, cursor: c3 });
    for (const k of p.keys) chase.set(k.name.slice(CHASE.length), k.metadata || {});
    c3 = p.list_complete ? null : p.cursor;
  } while (c3);

  for (const row of rows) {
    row.mail = mail.get(row.name) || null;
    row.chase = chase.get(row.id) || null;
  }
  rows.sort((a, b) => b.days - a.days || String(a.at).localeCompare(String(b.at)));
  return { body: { at: new Date().toISOString(), rows } };
}

// ORDER PREP, for the "Prep in HOKA" button (extensions/order-prep). Everything
// a supplier cart needs for ONE order: its open Needham lines with UPC and
// quantity, the PO, and the ship-to address. An order shipping abroad comes to
// the store first (owner, 2026-11-09), so its address is withheld and the
// supplier ships to the account's own ship-to. Pure, so the test drives it.
export function shapePrep(order, needhamId) {
  const lines = [];
  for (const fo of order.fulfillmentOrders || []) {
    if (!['OPEN', 'IN_PROGRESS'].includes(fo.status)) continue;
    if (!fo.assignedLocation || !fo.assignedLocation.location || fo.assignedLocation.location.id !== needhamId) continue;
    for (const l of fo.lineItems || []) {
      if (!(l.remainingQuantity > 0)) continue;
      const li = l.lineItem || {};
      lines.push({ vendor: li.vendor || '', title: li.title || '', variant: li.variantTitle || '', sku: li.sku || (li.variant && li.variant.sku) || '', upc: String((li.variant && li.variant.barcode) || '').replace(/\D/g, ''), qty: l.remainingQuantity });
    }
  }
  const a = order.shippingAddress || null;
  const country = (a && a.countryCodeV2) || '';
  const last = (a && a.lastName) || (order.billingAddress && order.billingAddress.lastName) || '';
  const num = String(order.name || '').replace(/^#/, '');
  return {
    id: String(order.id || '').split('/').pop(), name: order.name, po: num + (last ? '_' + last.replace(/\s+/g, '') : ''),
    international: !!country && country !== 'US',
    address: a && (!country || country === 'US') ? {
      firstName: a.firstName || '', lastName: a.lastName || '', phone: a.phone || order.phone || '',
      street1: a.address1 || '', street2: a.address2 || '', city: a.city || '', state: a.provinceCode || '', zip: a.zip || '', country: country || 'US',
    } : null,
    lines,
  };
}

const PREP_Q = `query($id: ID!){ order(id: $id){ id name phone
  shippingAddress{ firstName lastName address1 address2 city provinceCode zip countryCodeV2 phone } billingAddress{ lastName }
  fulfillmentOrders(first: 10){ nodes{ status assignedLocation{ location{ id } }
    lineItems(first: 30){ nodes{ remainingQuantity lineItem{ vendor title variantTitle sku variant{ sku barcode } } } } } } } }`;

// GET /orders/prep?id=<order id>  (staff, write secret): one order, shaped for a cart.
export async function handleOrderPrep(request, env) {
  const id = String(new URL(request.url).searchParams.get('id') || '').replace(/\D/g, '');
  if (!id) return { status: 400, body: { error: 'An order id is needed' } };
  const client = createShopifyClient(env);
  const r = await client.graphql(PREP_Q, { id: 'gid://shopify/Order/' + id });
  const o = r.data && r.data.order;
  if (!o) return { status: 404, body: { error: 'No such order' } };
  const prep = shapePrep({ ...o, fulfillmentOrders: o.fulfillmentOrders.nodes.map((f) => ({ ...f, lineItems: f.lineItems.nodes })) }, env.NEEDHAM_LOCATION_ID);
  if (!prep.lines.length) return { status: 409, body: { error: 'Nothing open at Needham on ' + o.name } };
  return { body: prep };
}

// GET /orders/late/chase?id=<order id>  (staff): every note on one order.
export async function handleLateChaseGet(request, env) {
  const id = String(new URL(request.url).searchParams.get('id') || '').replace(/\D/g, '');
  const rec = id ? await env.CATALOG.get(CHASE + id, 'json') : null;
  return { body: { notes: (rec && rec.notes) || [] } };
}

// POST /orders/late/chase { id, note, by }  (staff, write secret): add a note.
export async function handleLateChase(request, env) {
  const b = await readJson(request);
  const id = String(b.id || '').replace(/\D/g, '');
  const note = String(b.note || '').trim().slice(0, 300);
  if (!id || !note) return { status: 400, body: { error: 'An order and a note are needed' } };
  const rec = (await env.CATALOG.get(CHASE + id, 'json')) || { notes: [] };
  const entry = { at: new Date().toISOString(), by: String(b.by || '').trim().slice(0, 40), note };
  rec.notes = [entry, ...rec.notes].slice(0, 20);
  await env.CATALOG.put(CHASE + id, JSON.stringify(rec), { expirationTtl: CHASE_TTL, metadata: { at: entry.at, by: entry.by, note: note.slice(0, 200), n: rec.notes.length } });
  return { body: { ok: true, notes: rec.notes } };
}
