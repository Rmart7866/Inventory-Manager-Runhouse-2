// index.js, The Run House SHEETS Worker.
//
// One route, one job: GET /orders/open, the open unfulfilled ONLINE order lines
// behind the "ONLINE SALES ORDERS" Google Sheet.
//
// WHY THIS IS A SEPARATE WORKER FROM runhouse-inventory-worker.
//
//   1. THAT WORKER IS LOAD BEARING AND STALE. Its live deployment dates from
//      2026-08-05 and src/ has moved on since. Bundling a sheet feature into the
//      next deploy of it would ship two months of untested drift to the tool
//      staff use every day. A broken spreadsheet is an annoyance; a broken
//      inventory tool stops work.
//
//   2. THE TOKENS ARE NOT COMPARABLE. That Worker's CATALOG_TOKEN is public by
//      construction, it ships inside the browser bundle, and it guards PRODUCT
//      data that is already on the storefront. This route returns CUSTOMER data:
//      names, ship-to cities, order numbers and personalisation text. Those do
//      not belong behind the same token, and keeping them in separate Workers
//      makes that structural rather than a flag someone can mis-set.
//
// AUTH. A single ORDERS_TOKEN, sent as a bearer. Nothing here is ever loaded by
// a browser, so there is no public token to compensate for. If ORDERS_TOKEN is
// unset the route is REFUSED, not opened: it fails closed.
//
// NO WRITES. There is no write route and no mutation anywhere in this Worker.
// createShopifyClient is imported from the inventory Worker rather than copied,
// so the two cannot drift, and that client has no write method either.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from '../../worker/src/shopify.js';
import { openOnlineOrders, fulfilledLines } from './open-orders.js';

// Constant time compare, so a wrong token cannot be narrowed down by timing.
// Deliberately NOT imported from the inventory Worker's auth.js: that module
// also carries Access JWT verification this Worker has no use for.
function timingSafeEqual(a, b) {
  const x = String(a || ''), y = String(b || '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(body, status, request, env, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // Customer data must not sit in a shared machine's disk cache.
      'Cache-Control': 'private, no-store',
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

function authorise(request, env) {
  if (!env.ORDERS_TOKEN) {
    return { ok: false, status: 503, reason: 'ORDERS_TOKEN is not configured; this route is closed.' };
  }
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  const got = m ? m[1].trim() : (request.headers.get('X-Orders-Token') || '').trim();
  if (!got) return { ok: false, status: 401, reason: 'No token on request' };
  if (!timingSafeEqual(got, env.ORDERS_TOKEN)) return { ok: false, status: 401, reason: 'Bad token' };
  return { ok: true };
}

const CSV_COLS = ['lineId', 'order', 'date', 'quantity', 'lineName', 'sku', 'vendor',
  'shipFrom', 'route', 'routeNote', 'hasPersonalisation', 'personalisation', 'upcharge',
  'customer', 'shipCity', 'channel', 'financialStatus', 'fulfillmentStatus', 'unmatched'];

// Quote EVERY field. These titles carry commas, quotes and the odd newline, and
// a half quoted CSV is the classic way a spreadsheet silently shifts a column.
function toCsv(rows) {
  const esc = (v) => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
  return [CSV_COLS.join(',')]
    .concat(rows.map((r) => CSV_COLS.map((c) => esc(r[c])).join(',')))
    .join('\r\n');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (url.pathname === '/health') {
      return json({ ok: true, worker: 'runhouse-sheets-worker', configured: Boolean(env.ORDERS_TOKEN) }, 200, request, env);
    }
    const known = ['/orders/open', '/orders/fulfilled'];
    if (known.indexOf(url.pathname) === -1) {
      return json({ error: 'Not found' }, 404, request, env);
    }
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, request, env, { Allow: 'GET, OPTIONS' });
    }

    const auth = authorise(request, env);
    if (!auth.ok) return json({ error: 'Unauthorized', reason: auth.reason }, auth.status, request, env);

    try {
      const client = createShopifyClient(env);

      // Recently fulfilled lines, so the sheet can stamp ship date and tracking
      // onto a row at the moment it moves to Closed. By then the line is gone
      // from /orders/open, which is why this is a separate lookup.
      if (url.pathname === '/orders/fulfilled') {
        const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '60', 10) || 60, 1), 365);
        return json(await fulfilledLines(client, { days }), 200, request, env);
      }

      // ?includeFootwear=1 turns the default shoe filter off.
      const includeFootwear = url.searchParams.get('includeFootwear') === '1';
      const data = await openOnlineOrders(client, { includeFootwear });
      if (url.searchParams.get('format') !== 'csv') return json(data, 200, request, env);
      return new Response(toCsv(data.rows), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'private, no-store',
          ...corsHeaders(request, env),
        },
      });
    } catch (err) {
      // Log the detail for `wrangler tail`, return something generic. Shopify
      // errors can quote request content, which must not be echoed to a caller.
      console.error(url.pathname + ' failed:', err?.stack || String(err));
      return json({ error: 'Request failed' }, 502, request, env);
    }
  },
};
