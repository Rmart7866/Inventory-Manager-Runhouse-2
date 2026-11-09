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
// TRACKING_MODE. "dry" (the default) only records what it WOULD write and
// sends nothing at all, not even by hand; "live" writes ready ones as they
// arrive, and a staff member can press Add tracking on one held item.
// TRACKING_LIVE_BRANDS narrows live to a list of brand keys: HOKA went live
// alone on 2026-11-09 after a week of its dry run matched staff 27 of 27,
// while Brooks, with 3 checks, stays dry. A brand not on the list, or an
// email whose brand is unknown, is handled exactly as in dry run. Writing needs the app scope
// write_merchant_managed_fulfillment_orders; without it Shopify refuses and
// the refusal is recorded on the item.
//
// FedEx numbers are plain 12 or 15 digit strings, the same shape as a UPC
// barcode, which shoe emails can carry. So a FedEx number is only taken from
// a fedex.com tracking link or right after a "Tracking number(s):" label. A
// UPC read as tracking would mark an order shipped with a number that tracks
// nothing.
//
// WHO SENDS THESE, read off needham@ 2026-11-08 over 90 days: only HOKA
// (deckersb2b.deckers.com, "Your Hoka B2B order# <PO> is on its way!", FedEx)
// and Brooks (brooksrunning.com, "Your order <PO> is shipped.", a bare FedEx
// number under "Tracking numbers:"). Some Brooks emails carry Brooks' own
// BROOKS00DRP number instead of our PO; those go to a person. Some HOKA POs
// carry a FIRST name ("92803_Linda"); the name check sends those to a person
// too, rather than guess.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';

const EVENT = 'trk:'; // trk:<inverted time>-<msg id>, newest first in a list
const SEEN = 'trkmsg:'; // trkmsg:<mailbox message id>, so a message is handled once
const SEEN_TTL = 120 * 86400;

// Is this brand live? Pure, so the test pins it.
export function liveBrands(env) {
  if (env.TRACKING_MODE !== 'live') return [];
  return String(env.TRACKING_LIVE_BRANDS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export function isLive(env, brand) {
  if (env.TRACKING_MODE !== 'live') return false;
  const list = liveBrands(env);
  // No list at all means every brand; an unknown brand is never live under a list.
  return !String(env.TRACKING_LIVE_BRANDS || '').trim() || (!!brand && list.includes(brand));
}
// Each email's record is kept six months (owner decision 2026-11-08), long
// enough to judge the dry run and look back at a dispute, then cleans itself up.
const EVENT_TTL = 183 * 86400;

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
  for (const m of text.matchAll(/(?<![\dA-Za-z])(\d{4,7})_(\p{L}[\p{L}'\-]*)/gu)) {
    pos.set(m[1] + '_' + m[2].toLowerCase(), { order: m[1], last: m[2] });
  }
  const trk = new Map();
  const add = (n, company) => { const k = n.toUpperCase(); if (!trk.has(k)) trk.set(k, { number: k, company }); };
  for (const m of text.matchAll(/\b1Z[0-9A-Z]{16}\b/gi)) add(m[0], 'UPS');
  for (const m of text.matchAll(/(?<!\d)(9[2-5]\d{18,20})(?!\d)/g)) add(m[1], 'USPS');
  for (const m of text.matchAll(/fedex\.com\/[^\s"'<>]*?(?:trknbr|tracknumbers|tracknum)=(\d{12,22})/gi)) add(m[1], 'FedEx');
  // A bare 12 or 15 digit number right after a "Tracking number(s):" label.
  // Brooks writes exactly that, as a link through SendGrid, and never names
  // the carrier (read off real emails 2026-11-08); 12 and 15 digits are
  // FedEx's lengths. Anchored on the label, so a UPC elsewhere in the email
  // is still never taken.
  for (const m of text.matchAll(/track(?:ing)?\s*(?:numbers?|no\.?|#)?\s*[:#]?\s*((?:\d{12}|\d{15})(?:[\s,]+(?:\d{12}|\d{15}))*)(?!\d)/gi)) {
    for (const n of m[1].split(/[\s,]+/)) add(n, 'FedEx');
  }
  return { brand: brandOfSender(from), pos: [...pos.values()], tracking: [...trk.values()] };
}

// Case, punctuation, spaces and accents never matter: "JENKINS", "O'Brien"
// and "Peña" compare as jenkins, obrien and pena.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');

// Last names agree when, ignoring case and punctuation:
//   - they are equal ("GarciaMartinez" and "Garcia Martinez" included);
//   - one is the other cut short (a supplier's PO field can truncate), from 4
//     letters up so "Li" never matches "Lin";
//   - the PO is ONE WORD of a two word last name, from 3 letters up: staff
//     write "Martinez" for "Garcia Martinez" as often as "Garcia". Seen on a
//     real HOKA order 2026-11-09. The order number has to match as well, so
//     this cannot reach a stranger's order.
export function lastNameMatches(poLast, order) {
  const p = norm(poLast);
  if (p.length < 2) return false;
  return [order.shippingAddress, order.billingAddress].some((a) => {
    const n = norm(a && a.lastName);
    if (!n) return false;
    if (n === p) return true;
    if (p.length >= 4 && n.length >= 4 && (n.startsWith(p) || p.startsWith(n))) return true;
    const words = String(a.lastName).split(/[\s\-]+/).map(norm).filter((w) => w.length >= 3);
    return words.length > 1 && words.includes(p);
  });
}

// An in-store (POS) sale carries no address, and the app cannot read the
// customer, so there is no name to check the PO against.
const hasName = (o) => [o.shippingAddress, o.billingAddress].some((a) => a && norm(a.lastName));

// IN-STORE SPECIAL ORDERS. Read off the held HOKA items 2026-11-09: a shoe
// ordered at the Walpole till is rung up as a CUSTOM line with no vendor
// ("Hoka Clifton 11 Men's 11.5 (2E)", or just "Clifton 11 Women's 8.5"), the
// till marks the whole sale fulfilled, and HOKA ships the shoe later. So
// there is no open line, no vendor and no address. The brand is read off the
// item name (the brand or one of its model names), the tracking goes onto the
// till's fulfillment of that item, and the name is checked against the
// order's email address, the only name a POS order carries that this app can
// read. A name that is not in the email waits for a person to check it.
const MODEL_WORDS = {
  hoka: ['hoka', 'clifton', 'bondi', 'arahi', 'gaviota', 'mach', 'rincon', 'speedgoat', 'challenger', 'kawana', 'transport', 'skyflow', 'skyward', 'mafate', 'tecton', 'cielo', 'rocket', 'solimar', 'stinson', 'torrent', 'zinal', 'anacapa', 'kaha', 'hopara', 'elevon', 'ora'],
  brooks: ['brooks', 'ghost', 'glycerin', 'adrenaline', 'launch', 'hyperion', 'levitate', 'cascadia', 'caldera', 'divide', 'ariel', 'beast', 'addiction', 'revel', 'catamount'],
};
export function brandOfTitle(title) {
  const words = new Set(String(title || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  for (const [k, list] of Object.entries(MODEL_WORDS)) if (list.some((w) => words.has(w))) return k;
  return null;
}
const isBrandLine = (l, brand) => vendorKey(l.vendor) === brand || ((!l.vendor || /run ?house/i.test(l.vendor)) && brandOfTitle(l.title) === brand);
export function emailHasName(email, last) {
  const p = norm(last), local = norm(String(email || '').split('@')[0]);
  return p.length >= 3 && local.includes(p);
}

// A special order is the CUSTOM line typed at the till. A catalog line of
// the same brand in the same sale is usually a pair off the shelf the
// customer took home (#89618 had both, 2026-11-09), so it never gets the
// tracking when a custom line is there; a sale with only catalog lines waits
// for a person, because nothing says which pair is shipping.
const isCustomLine = (l) => !l.vendor || /run ?house/i.test(l.vendor);

function decideInStore(parsed, order, po, opts, review) {
  const B = (parsed.brand || '').toUpperCase();
  if (!parsed.brand) return review(order.name + ' is an in-store sale and the sender brand is unknown');
  const fs = (order.fulfillments || []).filter((f) => f.id);
  const customOnes = fs.filter((f) => (f.lineItems || []).some((l) => isCustomLine(l) && isBrandLine(l, parsed.brand)));
  const catalogOnes = fs.filter((f) => (f.lineItems || []).some((l) => !isCustomLine(l) && isBrandLine(l, parsed.brand)));
  if (!customOnes.length && !catalogOnes.length) return review(order.name + ' is an in-store sale with no ' + B + ' item on it');
  if (!customOnes.length && !opts.override) {
    return { ...review(order.name + ' is an in-store sale whose ' + B + ' item is a catalog pair, not a typed special order, so it may have gone home with the customer. Check which pair is shipping, then press Add anyway.'), canOverride: true };
  }
  const useCustom = customOnes.length > 0;
  const lineOk = (l) => isBrandLine(l, parsed.brand) && (useCustom ? isCustomLine(l) : true);
  const withBrand = useCustom ? customOnes : catalogOnes;
  const open = withBrand.filter((f) => !(f.trackingInfo || []).length);
  if (!open.length) return review(order.name + ': its ' + B + ' item already has other tracking');
  if (!emailHasName(order.email, po.last) && !opts.override) {
    return { ...review(order.name + ' is an in-store special order and "' + po.last + '" is not in its email address, so the name cannot be checked. Check it, then press Add anyway.'), canOverride: true };
  }
  const lines = open.flatMap((f) => f.lineItems.filter(lineOk).map((l) => ({ id: '', qty: l.quantity || 1, vendor: l.vendor || B, title: l.title })));
  return { status: 'ready', kind: 'update', reason: '', fulfillments: open.map((f) => f.id), groups: [{ fo: 'in-store', lines }] };
}

// What to do with one parsed email and its order. Pure, so the test drives
// every refusal. Returns { status: 'ready' | 'already' | 'review', reason, groups }.
export function decide(parsed, order, needhamId, opts = {}) {
  const review = (reason) => ({ status: 'review', reason, groups: [] });
  if (parsed.pos.length !== 1) return review(parsed.pos.length ? 'More than one PO in this email (' + parsed.pos.map((p) => p.order + '_' + p.last).join(', ') + '), so the tracking cannot be matched to one order' : 'No PO found');
  if (!parsed.tracking.length) return review('No tracking number found');
  const po = parsed.pos[0];
  if (!order) return review('No order #' + po.order);
  if (order.cancelledAt) return review('Order ' + order.name + ' is cancelled');
  const onOrder = new Set();
  for (const f of order.fulfillments || []) for (const t of f.trackingInfo || []) if (t.number) onOrder.add(String(t.number).toUpperCase());
  if (parsed.tracking.every((t) => onOrder.has(t.number))) return { status: 'already', reason: 'Tracking already on ' + order.name, groups: [] };
  if (!hasName(order)) return decideInStore(parsed, order, po, opts, review);
  if (!lastNameMatches(po.last, order)) return review('PO name "' + po.last + '" does not match the name on order ' + order.name);
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

const ORDER_Q = `query($q:String){ orders(first: 5, query:$q){ nodes{ id name cancelledAt sourceName email
  shippingAddress{ lastName } billingAddress{ lastName }
  fulfillments{ id status trackingInfo{ number } fulfillmentLineItems(first: 50){ nodes{ quantity lineItem{ vendor title } } } }
  fulfillmentOrders(first: 20){ nodes{ id status assignedLocation{ location{ id } }
    lineItems(first: 50){ nodes{ id remainingQuantity lineItem{ vendor title } } } } } } } }`;

async function findOrder(client, num) {
  const r = await client.graphql(ORDER_Q, { q: 'name:' + num });
  const o = r.data.orders.nodes.find((x) => x.name === '#' + num);
  if (!o) return null;
  return {
    ...o,
    fulfillments: o.fulfillments.map((f) => ({ ...f, lineItems: f.fulfillmentLineItems.nodes.map((n) => ({ ...n.lineItem, quantity: n.quantity })) })),
    fulfillmentOrders: o.fulfillmentOrders.nodes.map((f) => ({ ...f, lineItems: f.lineItems.nodes })),
  };
}

const FULFILL = `mutation($f: FulfillmentInput!){ fulfillmentCreate(fulfillment: $f){ fulfillment{ id status } userErrors{ field message } } }`;

// The write. notifyCustomer is on by owner decision (2026-11-08): the
// customer gets Shopify's shipping email with the tracking.
const TRACK_UPDATE = `mutation($id: ID!, $t: FulfillmentTrackingInput!){ fulfillmentTrackingInfoUpdate(fulfillmentId: $id, trackingInfoInput: $t, notifyCustomer: true){ fulfillment{ id } userErrors{ field message } } }`;

async function writeTracking(client, plan, tracking) {
  const company = tracking[0].company;
  // An in-store special order: the till already fulfilled it, so the
  // tracking goes ONTO that fulfillment (and Shopify emails the customer).
  if (plan.kind === 'update') {
    try {
      for (const id of plan.fulfillments) {
        const r = await client.graphql(TRACK_UPDATE, { id, t: { company, numbers: tracking.map((t) => t.number) } });
        if (r.errors) return { ok: false, error: r.errors.map((e) => e.message).join('; ') };
        const ue = r.data.fulfillmentTrackingInfoUpdate.userErrors;
        if (ue.length) return { ok: false, error: ue.map((e) => e.message).join('; ') };
      }
      return { ok: true, id: plan.fulfillments.join(',') };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e).slice(0, 300) };
    }
  }
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

async function plan(env, client, parsed, opts = {}) {
  const order = parsed.pos.length === 1 ? await findOrder(client, parsed.pos[0].order) : null;
  const d = decide(parsed, order, env.NEEDHAM_LOCATION_ID, opts);
  return { d, order: order ? { id: order.id, name: order.name } : null };
}

async function save(env, ev) {
  const short = ev.groups.reduce((a, g) => a + g.lines.reduce((b, l) => b + l.qty, 0), 0);
  await env.CATALOG.put(EVENT + ev.key, JSON.stringify(ev), { expirationTtl: EVENT_TTL, metadata: {
    at: ev.at, st: ev.status, b: ev.parsed.brand || '', po: ev.parsed.pos.map((p) => p.order + '_' + p.last).join(' ').slice(0, 60),
    o: ev.order ? ev.order.name : '', i: ev.order ? String(ev.order.id).split('/').pop() : '', t: ev.parsed.tracking.map((t) => t.company + ' ' + t.number).join(', ').slice(0, 160),
    n: short, r: String(ev.reason || ev.error || '').slice(0, 300), ov: ev.status === 'review' && ev.canOverride ? 1 : 0,
    // g: what staff actually did (reconcileTracking).
    g: ev.truth ? ev.truth.r : '', gr: ev.truth ? String(ev.truth.note || '').slice(0, 160) : '',
  } });
}

// POST /tracking/ingest  { id, from, subject, date, body }  (Apps Script)
export async function handleTrackingIngest(request, env) {
  const b = await readJson(request);
  const msgId = String(b.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  if (!msgId) return { status: 400, body: { error: 'id required' } };
  // A message is handled once. The exception is one that went to a person or
  // was ignored: sent again (backfill), it is read again, so a reader fix
  // reaches mail already looked at. It keeps its one record. Anything matched
  // or written is never redone.
  const prior = await env.CATALOG.get(SEEN + msgId, 'json');
  if (prior && !['review', 'ignored'].includes(prior.status)) return { body: { ...prior, duplicate: true } };
  const parsed = parseShipEmail({ from: b.from, subject: String(b.subject || '').slice(0, 500), body: String(b.body || '').slice(0, 40000) });
  if (!parsed.pos.length && !parsed.tracking.length) {
    await env.CATALOG.put(SEEN + msgId, JSON.stringify({ status: 'ignored' }), { expirationTtl: SEEN_TTL });
    return { body: { status: 'ignored' } };
  }
  const client = createShopifyClient(env);
  const { d, order } = await plan(env, client, parsed);
  const live = isLive(env, parsed.brand);
  const ev = {
    key: (prior && prior.key) || String(9e15 - Date.now()).padStart(16, '0') + '-' + msgId, msg: msgId, at: new Date().toISOString(),
    from: String(b.from || '').slice(0, 120), subject: String(b.subject || '').slice(0, 200),
    parsed, order, status: d.status, reason: d.reason, groups: d.groups, mode: live ? 'live' : 'dry', canOverride: !!d.canOverride,
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
  return { body: { mode: env.TRACKING_MODE === 'live' ? 'live' : 'dry', live: liveBrands(env), events: out.slice(0, 150) } };
}

// POST /tracking/apply { key }  (staff, write secret): write ONE item now, in
// live mode only, after planning it again against the order as it is now.
export async function handleTrackingApply(request, env) {
  // The dry run sends nothing, by owner decision 2026-11-08: not even one
  // item by hand. Live mode is the only way a tracking reaches a customer.
  const b = await readJson(request);
  const ev = await env.CATALOG.get(EVENT + String(b.key || ''), 'json');
  if (!ev) return { status: 404, body: { error: 'Not found' } };
  if (!isLive(env, ev.parsed.brand)) return { status: 409, body: { error: 'Dry run for ' + (ev.parsed.brand || 'this sender').toUpperCase() + ': tracking is not sent.' } };
  if (ev.status === 'written') return { status: 409, body: { error: 'Already written' } };
  const client = createShopifyClient(env);
  // override: a person checked the name on an in-store special order whose
  // email does not carry it. Every other check still applies.
  const { d, order } = await plan(env, client, ev.parsed, { override: b.override === true });
  ev.order = order; ev.groups = d.groups; ev.reason = d.reason; ev.canOverride = !!d.canOverride;
  if (b.override === true) ev.overridden = true;
  if (d.status !== 'ready') { ev.status = d.status; await save(env, ev); return { status: 409, body: { error: d.reason || d.status, status: d.status } }; }
  const w = await writeTracking(client, d, ev.parsed.tracking);
  ev.status = w.ok ? 'written' : 'error'; ev.error = w.error || ''; ev.fulfillment = w.id || '';
  ev.by = String(b.by || '').slice(0, 40); ev.appliedAt = new Date().toISOString();
  await save(env, ev);
  return w.ok ? { body: { status: 'written' } } : { status: 502, body: { error: w.error } };
}

// WHAT STAFF ACTUALLY DID, the ground truth for the dry run. Every 15 minutes
// (index.js scheduled) up to 15 unreconciled items from the last 21 days are
// compared with the order as it stands now:
//   match         the order carries this tracking on exactly the lines planned
//   other-items   this tracking, but on different lines than planned
//   other-tracking the planned lines shipped with a different number
//   added-anyway  sent to review, but staff added this tracking after all
//   left-alone    sent to review and staff did not use this tracking
// An order not yet shipped stays unreconciled and is checked again later.
const TRUTH_Q = `query($id: ID!){ order(id: $id){ fulfillments{ trackingInfo{ number }
  fulfillmentLineItems(first: 50){ nodes{ quantity lineItem{ id vendor } } } } } }`;

export function truthOf(ev, order) {
  const want = new Set(ev.parsed.tracking.map((t) => t.number.toUpperCase()));
  const fs = (order && order.fulfillments) || [];
  const withOurs = fs.filter((f) => (f.trackingInfo || []).some((t) => want.has(String(t.number || '').toUpperCase())));
  const plannedVendors = new Set((ev.groups || []).flatMap((g) => g.lines.map((l) => vendorKey(l.vendor))));
  if (ev.status === 'review') {
    if (withOurs.length) return { r: 'added-anyway', note: 'Staff added this tracking after it was sent to review' };
    const elapsed = Date.now() - Date.parse(ev.at);
    return elapsed > 7 * 86400e3 ? { r: 'left-alone', note: 'Not used on the order within 7 days' } : null;
  }
  if (withOurs.length) {
    const got = new Set(withOurs.flatMap((f) => f.fulfillmentLineItems.nodes.map((n) => vendorKey(n.lineItem.vendor))));
    const same = got.size === plannedVendors.size && [...got].every((v) => plannedVendors.has(v));
    return same ? { r: 'match', note: 'Staff used this tracking on the same items' } : { r: 'other-items', note: 'Staff used this tracking on ' + [...got].join(', ') };
  }
  const shippedPlanned = fs.some((f) => f.fulfillmentLineItems.nodes.some((n) => plannedVendors.has(vendorKey(n.lineItem.vendor))));
  if (shippedPlanned) return { r: 'other-tracking', note: 'Those items shipped with a different tracking number' };
  return null;
}

export async function reconcileTracking(env) {
  const client = createShopifyClient(env);
  const since = Date.now() - 21 * 86400e3;
  let done = 0, cursor;
  do {
    const p = await env.CATALOG.list({ prefix: EVENT, cursor, limit: 200 });
    for (const k of p.keys) {
      const m = k.metadata || {};
      if (done >= 15) break;
      if (Date.parse(m.at) < since) { cursor = null; break; }
      if (m.g || !m.i || !['ready', 'review'].includes(m.st)) continue;
      const ev = await env.CATALOG.get(k.name, 'json');
      if (!ev || !ev.order) continue;
      const r = await client.graphql(TRUTH_Q, { id: ev.order.id });
      const t = truthOf(ev, r.data.order);
      done++;
      if (!t) continue;
      ev.truth = { ...t, at: new Date().toISOString() };
      await save(env, ev);
    }
    cursor = done >= 15 || p.list_complete ? null : p.cursor;
  } while (cursor);
  return done;
}
