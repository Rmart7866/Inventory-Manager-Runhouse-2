// tracking.js, The Run House. Supplier shipping emails to Shopify tracking.
//
// Suppliers (HOKA first) email needham@therunhouse.com when a dropship order
// ships, with the tracking number and our PO, which is "<order number>_<last
// name>", e.g. 93307_Smith. A Google Apps Script inside that mailbox
// (tools/tracking-mailbox.gs) sends each such email here; this file reads the
// PO and tracking out of it, finds the order, and adds the tracking to the
// right lines, which sends the customer Shopify's shipping email.
//
// WHY EVERY CHECK BELOW EXISTS. A wrong match emails a stranger a tracking
// number for someone else's shoes, so anything not clear cut goes to a review
// list on tracking.html and nothing is written:
//   - exactly ONE PO in the email; a batch notice cannot say which tracking
//     belongs to which order;
//   - the PO's last name must match the order's shipping or billing last
//     name, which catches a typo'd order number pointing at a stranger;
//   - only lines still open at NEEDHAM, the dropship location, and only the
//     SENDING brand's lines: a HOKA email must never ship the Brooks pair in
//     the same order. When the sender's brand is unknown, the order's open
//     Needham lines must all be one brand;
//   - a tracking number already on the order is a no-op, so a resent email
//     or a re-run does nothing.
//
// TRACKING_MODE. "dry" (the default) only records what it WOULD write; "live"
// writes ready ones as they arrive. A staff member can press Apply on one
// ready item in either mode. Writing needs the app scope
// write_merchant_managed_fulfillment_orders; without it Shopify refuses and
// the refusal is recorded on the item.
//
// FedEx numbers are plain 12 or 15 digit strings, the same shape as a UPC
// barcode, which shoe emails can carry. So a FedEx number is only taken from
// a fedex.com tracking link, or when the email names FedEx AND the number
// sits right after the word "tracking". A UPC read as tracking would mark an
// order shipped with a number that tracks nothing.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';

const EVENT = 'trk:'; // trk:<inverted time>-<msg id>, newest first in a list
const SEEN = 'trkmsg:'; // trkmsg:<mailbox message id>, so a message is handled once
const SEEN_TTL = 120 * 86400;

async function readJson(request) { try { return await request.json(); } catch (e) { return {}; } }

// The brand KEY of a vendor name or a sender, compared loosely so "On
// Running", "ON Running" and "on" agree.
export function vendorKey(v) {
  const k = String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (k === 'hokaoneone') return 'hoka';
  if (k === 'onrunning' || k === 'on') return 'on';
  return k;
}

// Sender address to brand key. Wolverine (Saucony AND Merrell) and VF (Altra
// among others) are deliberately absent: one sender, several brands, so the
// order's own lines must decide.
const SENDERS = [
  [/hoka|deckers/i, 'hoka'], [/brooks/i, 'brooks'], [/asics/i, 'asics'],
  [/on-running|onrunning|@on\.com|\.on\.com/i, 'on'], [/newbalance|\bnb\.com/i, 'newbalance'],
  [/puma/i, 'puma'], [/saucony/i, 'saucony'], [/merrell/i, 'merrell'], [/altra/i, 'altra'],
];
export function brandOfSender(from) {
  for (const [re, k] of SENDERS) if (re.test(String(from || ''))) return k;
  return null;
}

// PO and tracking out of one email. Pure.
export function parseShipEmail({ from = '', subject = '', body = '' }) {
  const text = subject + '\n' + body;
  const pos = new Map();
  for (const m of text.matchAll(/(?<![\dA-Za-z])(\d{4,7})_([A-Za-z][A-Za-z'\-]*)/g)) {
    pos.set(m[1] + '_' + m[2].toLowerCase(), { order: m[1], last: m[2] });
  }
  const trk = new Map();
  const add = (n, company) => { const k = n.toUpperCase(); if (!trk.has(k)) trk.set(k, { number: k, company }); };
  for (const m of text.matchAll(/\b1Z[0-9A-Z]{16}\b/gi)) add(m[0], 'UPS');
  for (const m of text.matchAll(/(?<!\d)(9[2-5]\d{18,20})(?!\d)/g)) add(m[1], 'USPS');
  for (const m of text.matchAll(/fedex\.com\/[^\s"'<>]*?(?:trknbr|tracknumbers|tracknum)=(\d{12,22})/gi)) add(m[1], 'FedEx');
  if (/fedex/i.test(text)) {
    for (const m of text.matchAll(/track(?:ing)?\s*(?:number|no\.?|#)?\s*[:#]?\s*(\d{12}|\d{15})(?!\d)/gi)) add(m[1], 'FedEx');
  }
  return { brand: brandOfSender(from), pos: [...pos.values()], tracking: [...trk.values()] };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

// Last names agree: equal, or one is the other cut short (a supplier's PO
// field can truncate), but only from 4 letters up so "Li" never matches "Lin".
export function lastNameMatches(poLast, order) {
  const p = norm(poLast);
  if (p.length < 2) return false;
  return [order.shippingAddress, order.billingAddress].some((a) => {
    const n = norm(a && a.lastName);
    if (!n) return false;
    if (n === p) return true;
    return p.length >= 4 && n.length >= 4 && (n.startsWith(p) || p.startsWith(n));
  });
}

// What to do with one parsed email and its order. Pure, so the test drives
// every refusal. Returns { status: 'ready' | 'already' | 'review', reason, groups }.
export function decide(parsed, order, needhamId) {
  const review = (reason) => ({ status: 'review', reason, groups: [] });
  if (parsed.pos.length !== 1) return review(parsed.pos.length ? 'More than one PO in this email (' + parsed.pos.map((p) => p.order + '_' + p.last).join(', ') + '), so the tracking cannot be matched to one order' : 'No PO found');
  if (!parsed.tracking.length) return review('No tracking number found');
  const po = parsed.pos[0];
  if (!order) return review('No order #' + po.order);
  if (order.cancelledAt) return review('Order ' + order.name + ' is cancelled');
  if (!lastNameMatches(po.last, order)) return review('PO name "' + po.last + '" does not match the name on order ' + order.name);
  const onOrder = new Set();
  for (const f of order.fulfillments || []) for (const t of f.trackingInfo || []) if (t.number) onOrder.add(String(t.number).toUpperCase());
  if (parsed.tracking.every((t) => onOrder.has(t.number))) return { status: 'already', reason: 'Tracking already on ' + order.name, groups: [] };
  const open = [];
  for (const fo of order.fulfillmentOrders || []) {
    if (!['OPEN', 'IN_PROGRESS'].includes(fo.status)) continue;
    if (!fo.assignedLocation || !fo.assignedLocation.location || fo.assignedLocation.location.id !== needhamId) continue;
    for (const l of fo.lineItems || []) if (l.remainingQuantity > 0) open.push({ fo: fo.id, id: l.id, qty: l.remainingQuantity, vendor: l.lineItem.vendor, title: l.lineItem.title });
  }
  if (!open.length) return review('Nothing left to ship from Needham on ' + order.name + (onOrder.size ? ' (it already has other tracking)' : ''));
  let pick;
  if (parsed.brand) {
    pick = open.filter((l) => vendorKey(l.vendor) === parsed.brand);
    if (!pick.length) return review('No open ' + parsed.brand.toUpperCase() + ' items from Needham on ' + order.name + ' (open: ' + [...new Set(open.map((l) => l.vendor))].join(', ') + ')');
  } else {
    const brands = new Set(open.map((l) => vendorKey(l.vendor)));
    if (brands.size !== 1) return review('Sender brand unknown and ' + order.name + ' has several brands open: ' + [...new Set(open.map((l) => l.vendor))].join(', '));
    pick = open;
  }
  const groups = [];
  for (const l of pick) {
    let g = groups.find((x) => x.fo === l.fo);
    if (!g) groups.push((g = { fo: l.fo, lines: [] }));
    g.lines.push({ id: l.id, qty: l.qty, vendor: l.vendor, title: l.title });
  }
  return { status: 'ready', reason: '', groups };
}

const ORDER_Q = `query($q:String){ orders(first: 5, query:$q){ nodes{ id name cancelledAt
  shippingAddress{ lastName } billingAddress{ lastName }
  fulfillments{ trackingInfo{ number } }
  fulfillmentOrders(first: 20){ nodes{ id status assignedLocation{ location{ id } }
    lineItems(first: 50){ nodes{ id remainingQuantity lineItem{ vendor title } } } } } } } }`;

async function findOrder(client, num) {
  const r = await client.graphql(ORDER_Q, { q: 'name:' + num });
  const o = r.data.orders.nodes.find((x) => x.name === '#' + num);
  if (!o) return null;
  return { ...o, fulfillmentOrders: o.fulfillmentOrders.nodes.map((f) => ({ ...f, lineItems: f.lineItems.nodes })) };
}

const FULFILL = `mutation($f: FulfillmentInput!){ fulfillmentCreate(fulfillment: $f){ fulfillment{ id status } userErrors{ field message } } }`;

// The write. notifyCustomer is on by owner decision (2026-11-08): the
// customer gets Shopify's shipping email with the tracking.
async function writeTracking(client, plan, tracking) {
  const company = tracking[0].company;
  const f = {
    notifyCustomer: true,
    trackingInfo: { company, numbers: tracking.map((t) => t.number) },
    lineItemsByFulfillmentOrder: plan.groups.map((g) => ({ fulfillmentOrderId: g.fo, fulfillmentOrderLineItems: g.lines.map((l) => ({ id: l.id, quantity: l.qty })) })),
  };
  try {
    const r = await client.graphql(FULFILL, { f });
    if (r.errors) return { ok: false, error: r.errors.map((e) => e.message).join('; ') };
    const ue = r.data.fulfillmentCreate.userErrors;
    if (ue.length) return { ok: false, error: ue.map((e) => e.message).join('; ') };
    return { ok: true, id: r.data.fulfillmentCreate.fulfillment.id };
  } catch (e) {
    const m = String(e && e.message || e);
    return { ok: false, error: /access denied|scope/i.test(m) ? 'The app cannot write fulfillments yet: add write_merchant_managed_fulfillment_orders to the Inventory Manager app' : m.slice(0, 300) };
  }
}

async function plan(env, client, parsed) {
  const order = parsed.pos.length === 1 ? await findOrder(client, parsed.pos[0].order) : null;
  const d = decide(parsed, order, env.NEEDHAM_LOCATION_ID);
  return { d, order: order ? { id: order.id, name: order.name } : null };
}

async function save(env, ev) {
  const short = ev.groups.reduce((a, g) => a + g.lines.reduce((b, l) => b + l.qty, 0), 0);
  await env.CATALOG.put(EVENT + ev.key, JSON.stringify(ev), { metadata: {
    at: ev.at, st: ev.status, b: ev.parsed.brand || '', po: ev.parsed.pos.map((p) => p.order + '_' + p.last).join(' ').slice(0, 60),
    o: ev.order ? ev.order.name : '', i: ev.order ? String(ev.order.id).split('/').pop() : '', t: ev.parsed.tracking.map((t) => t.company + ' ' + t.number).join(', ').slice(0, 160),
    n: short, r: String(ev.reason || ev.error || '').slice(0, 300),
  } });
}

// POST /tracking/ingest  { id, from, subject, date, body }  (Apps Script)
export async function handleTrackingIngest(request, env) {
  const b = await readJson(request);
  const msgId = String(b.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!msgId) return { status: 400, body: { error: 'id required' } };
  const prior = await env.CATALOG.get(SEEN + msgId, 'json');
  if (prior) return { body: { ...prior, duplicate: true } };
  const parsed = parseShipEmail({ from: b.from, subject: String(b.subject || '').slice(0, 500), body: String(b.body || '').slice(0, 40000) });
  if (!parsed.pos.length && !parsed.tracking.length) {
    await env.CATALOG.put(SEEN + msgId, JSON.stringify({ status: 'ignored' }), { expirationTtl: SEEN_TTL });
    return { body: { status: 'ignored' } };
  }
  const client = createShopifyClient(env);
  const { d, order } = await plan(env, client, parsed);
  const live = env.TRACKING_MODE === 'live';
  const ev = {
    key: String(9e15 - Date.now()).padStart(16, '0') + '-' + msgId, msg: msgId, at: new Date().toISOString(),
    from: String(b.from || '').slice(0, 120), subject: String(b.subject || '').slice(0, 200),
    parsed, order, status: d.status, reason: d.reason, groups: d.groups, mode: live ? 'live' : 'dry',
  };
  if (d.status === 'ready' && live) {
    const w = await writeTracking(client, d, parsed.tracking);
    ev.status = w.ok ? 'written' : 'error'; ev.error = w.error || ''; ev.fulfillment = w.id || '';
  }
  await save(env, ev);
  await env.CATALOG.put(SEEN + msgId, JSON.stringify({ status: ev.status, key: ev.key }), { expirationTtl: SEEN_TTL });
  return { body: { status: ev.status, reason: ev.reason || ev.error || '' } };
}

// GET /tracking/log  (staff): the last 150, newest first, from list metadata.
export async function handleTrackingLog(request, env) {
  const out = [];
  let cursor;
  do {
    const p = await env.CATALOG.list({ prefix: EVENT, cursor, limit: 150 });
    for (const k of p.keys) out.push({ key: k.name.slice(EVENT.length), ...(k.metadata || {}) });
    cursor = p.list_complete || out.length >= 150 ? null : p.cursor;
  } while (cursor);
  return { body: { mode: env.TRACKING_MODE === 'live' ? 'live' : 'dry', events: out.slice(0, 150) } };
}

// POST /tracking/apply { key }  (staff, write secret): write ONE item now,
// whatever the mode, after planning it again against the order as it is now.
export async function handleTrackingApply(request, env) {
  const b = await readJson(request);
  const ev = await env.CATALOG.get(EVENT + String(b.key || ''), 'json');
  if (!ev) return { status: 404, body: { error: 'Not found' } };
  if (ev.status === 'written') return { status: 409, body: { error: 'Already written' } };
  const client = createShopifyClient(env);
  const { d, order } = await plan(env, client, ev.parsed);
  ev.order = order; ev.groups = d.groups; ev.reason = d.reason;
  if (d.status !== 'ready') { ev.status = d.status; await save(env, ev); return { status: 409, body: { error: d.reason || d.status, status: d.status } }; }
  const w = await writeTracking(client, d, ev.parsed.tracking);
  ev.status = w.ok ? 'written' : 'error'; ev.error = w.error || ''; ev.fulfillment = w.id || '';
  ev.by = String(b.by || '').slice(0, 40); ev.appliedAt = new Date().toISOString();
  await save(env, ev);
  return w.ok ? { body: { status: 'written' } } : { status: 502, body: { error: w.error } };
}
