// index.js, The Run House Inventory Manager Worker.
//
// Stage 1 routes:
//   GET /catalog          the live footwear catalog as JSON, served from KV
//   GET /catalog/status   freshness only, cheap, does not pull the 4.5 MB body
//
// plus a cron trigger that rebuilds the catalog on a schedule.
//
// There is no write route, and the Shopify client in this Worker has no write
// method (see shopify.js), so this deployment cannot modify the store even if a
// route were mis-wired. /inventory (Stage 3) and /products (Stage 4) arrive
// later, each behind its own dry-run diff.
//
// WHY CRON AND NOT AN INLINE FETCH. Building the catalog takes about 170 Shopify
// requests and 149 seconds, measured. See store.js. The cron builds it, this
// router only reads it.
//
// AUTH. Stage 1 runs in AUTH_MODE=bearer: a shared token the public browser
// bundle carries. That is a speed bump, not authentication, and it is only
// proportionate because every route here is a read. See src/auth.js, which
// refuses to serve a write route in this mode.
//
// The one exception is ?fresh=1, which forces a 150 second, 170 request rebuild.
// That takes a separate ADMIN_TOKEN that never reaches the browser.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';
import { buildCatalog } from './catalog.js';
import { createProducts } from './products.js';
import { requireAuth, requireAdmin, WriteGateError } from './auth.js';
import {
  readCatalog, readCatalogMeta, writeCatalog,
  acquireBuildLock, releaseBuildLock,
  requestRefresh, isRefreshRequested, clearRefresh,
} from './store.js';

// CORS is a browser rule, not authentication. It is here so the tool can call us
// from its own origin during the GitHub Pages to Cloudflare Pages transition,
// and it stops a random site from reading our responses in a victim's browser.
// It stops nothing else. verifyAccess is what actually guards this Worker.
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    // Access identity rides on a cookie same-origin, and on the
    // Cf-Access-Jwt-Assertion header cross-origin. Both need credentials.
    h['Access-Control-Allow-Credentials'] = 'true';
    h['Access-Control-Allow-Headers'] = 'Authorization, Cf-Access-Jwt-Assertion, Content-Type';
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
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

// Serve an already-serialised catalog string without re-parsing it.
// private + max-age=0 keeps catalog data out of a shared laptop's disk cache.
function rawCatalog(body, request, env, cacheState) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'X-Catalog-Cache': cacheState,
      ...corsHeaders(request, env),
    },
  });
}

// Build the catalog and store it. Shared by the cron and by ?fresh=1.
async function rebuild(env, scope) {
  const client = createShopifyClient(env);
  const payload = await buildCatalog(client, {
    activeOnly: scope === 'active',
    needhamLocationId: env.NEEDHAM_LOCATION_ID || null,
  });
  const meta = await writeCatalog(env, scope, payload);
  return { payload, meta };
}

async function handleCatalog(request, env, ctx) {
  const url = new URL(request.url);
  const fresh = url.searchParams.get('fresh') === '1';
  const scope = url.searchParams.get('active') === '1' ? 'active' : 'all';

  // limit is a development affordance only. It bypasses KV entirely, because a
  // truncated catalog must never be stored where the tool would trust it as the
  // whole picture.
  const limitRaw = url.searchParams.get('limit');
  if (limitRaw) {
    const limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit < 1) {
      return json({ error: 'limit must be a positive number' }, 400, request, env);
    }
    const client = createShopifyClient(env);
    const payload = await buildCatalog(client, {
      limit,
      activeOnly: scope === 'active',
      needhamLocationId: env.NEEDHAM_LOCATION_ID || null,
    });
    payload.truncated = true;
    return rawCatalog(JSON.stringify(payload), request, env, 'bypass-limit');
  }

  // fresh=1 requests an on-demand refresh, for "I just added products and want
  // them now" without waiting for the daily rebuild. The build takes a few
  // minutes, which a fetch handler CANNOT run: its waitUntil is killed after
  // about 30 seconds. So this only FLAGS a rebuild, and the frequent cron (which
  // has a 15 minute budget) does the actual build within a few minutes.
  //
  // Anyone authenticated can request it (the browser's CATALOG_TOKEN is enough,
  // so a refresh button works), rate-limited by a cooldown so it cannot be
  // spammed. The ADMIN_TOKEN bypasses the cooldown.
  if (fresh) {
    const isAdmin = requireAdmin(request, env).ok;
    const cooldown = Number(env.REFRESH_COOLDOWN_SECONDS || 600);
    const meta = await readCatalogMeta(env, scope);
    const ageSeconds = meta ? Math.max(0, Math.round((Date.now() - Date.parse(meta.generatedAt)) / 1000)) : Infinity;

    if (!isAdmin && ageSeconds < cooldown) {
      return json(
        {
          refreshing: false,
          reason: 'recently refreshed',
          ageSeconds,
          hint: `Catalog was refreshed ${ageSeconds}s ago. It also refreshes daily on its own. Try again in ${cooldown - ageSeconds}s.`,
        },
        429, request, env, { 'Retry-After': String(cooldown - ageSeconds) }
      );
    }

    await requestRefresh(env, scope);
    return json(
      {
        refreshing: true,
        hint: 'Refresh queued. The catalog rebuilds within a few minutes. Poll /catalog/status for the new timestamp.',
      },
      202, request, env
    );
  }

  const hit = await readCatalog(env, scope);
  if (hit) return rawCatalog(hit, request, env, 'hit');

  // Cold miss (KV empty). The build takes minutes, which a fetch handler cannot
  // run, so flag a rebuild for the cron and tell the caller to come back.
  await requestRefresh(env, scope);
  return json(
    {
      error: 'Catalog not built yet',
      building: true,
      hint: 'The catalog is being built, this takes a few minutes. Retry shortly.',
    },
    503,
    request,
    env,
    { 'Retry-After': '60' }
  );
}

// POST /products, Stage 4 write. Only reachable once the write gate is open
// (auth.js throws in bearer mode before this runs). Body: { products: [spec,...] }.
// Every product is created as DRAFT by products.js. Returns a per-product result.
async function handleCreateProducts(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || !Array.isArray(body.products)) {
    return json({ error: 'Expected JSON body { products: [ ... ] }' }, 400, request, env);
  }
  if (body.products.length === 0) return json({ error: 'No products to create' }, 400, request, env);
  if (body.products.length > 50) {
    return json({ error: 'Too many products in one request (max 50)' }, 400, request, env);
  }
  const client = createShopifyClient(env);
  const results = await createProducts(client, body.products);
  const created = results.filter((r) => r.ok).length;
  return json({ created, total: results.length, results }, 200, request, env);
}

async function handleStatus(request, env) {
  const scope = new URL(request.url).searchParams.get('active') === '1' ? 'active' : 'all';
  const meta = await readCatalogMeta(env, scope);
  if (!meta) return json({ built: false, scope }, 200, request, env);
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(meta.generatedAt)) / 1000));
  return json({ built: true, scope, ageSeconds, ...meta }, 200, request, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // Every route in this table is a read. `forWrite` stays false because there
    // is nothing here that writes. When Stage 3 adds POST /inventory, it must
    // pass forWrite: true, and auth.js will refuse to serve it until AUTH_MODE
    // is "access". That refusal is the point, do not route around it.
    const routes = {
      '/catalog': { handler: handleCatalog, forWrite: false, methods: ['GET'] },
      '/catalog/status': { handler: handleStatus, forWrite: false, methods: ['GET'] },
      // Stage 4 WRITE. forWrite:true, so auth.js refuses it in bearer mode (501).
      // Inert in production until AUTH_MODE becomes a real identity/secret gate.
      '/products': { handler: handleCreateProducts, forWrite: true, methods: ['POST'] },
    };
    const route = routes[url.pathname];
    if (!route) return json({ error: 'Not found' }, 404, request, env);

    let auth;
    try {
      auth = await requireAuth(request, env, { forWrite: route.forWrite });
    } catch (err) {
      if (err instanceof WriteGateError) {
        console.error('WRITE GATE:', err.message);
        return json({ error: 'Route disabled', reason: err.message }, 501, request, env);
      }
      throw err;
    }
    if (!auth.ok) {
      // The reason is safe to return: it describes the token, not the store.
      return json({ error: 'Unauthorized', reason: auth.reason }, 401, request, env);
    }

    if (route.methods && route.methods.indexOf(request.method) === -1) {
      return json({ error: 'Method not allowed' }, 405, request, env, { Allow: route.methods.concat('OPTIONS').join(', ') });
    }

    try {
      return await route.handler(request, env, ctx);
    } catch (err) {
      // Log the detail for `wrangler tail`, return a generic message. Shopify
      // errors can quote request content, which we do not want to echo.
      console.error(`${url.pathname} failed:`, err?.stack || String(err));
      return json({ error: 'Catalog request failed' }, 502, request, env);
    }
  },

  // Cron trigger. This is where the slow build lives, because a scheduled handler
  // has a multi-minute budget and a fetch handler's waitUntil does not. Two
  // schedules invoke this (see wrangler.toml):
  //   - the daily one always rebuilds (the routine refresh),
  //   - the frequent one rebuilds only if a refresh was requested (the button),
  //     so it is a cheap flag check that does nothing most of the time.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const scope = 'all';
        const isDaily = event.cron === '0 9 * * *';
        const requested = await isRefreshRequested(env, scope);
        if (!isDaily && !requested) return; // frequent tick, nothing to do

        // A lock keeps the daily tick and a same-minute frequent tick from
        // building twice at once. TTL clears it if a build dies.
        const got = await acquireBuildLock(env, scope);
        if (!got) return;

        const started = Date.now();
        try {
          const { meta } = await rebuild(env, scope);
          await clearRefresh(env, scope);
          console.log(
            `${isDaily ? 'daily' : 'requested'} rebuild ok in ${Math.round((Date.now() - started) / 1000)}s`,
            JSON.stringify(meta.counts),
            `${(meta.sizeBytes / 1048576).toFixed(2)} MB`
          );
        } catch (err) {
          // Leave the previous catalog in place. A stale catalog beats none, and
          // /catalog/status exposes the age so staleness is visible.
          console.error('rebuild FAILED, keeping previous catalog:', err?.stack || String(err));
        } finally {
          await releaseBuildLock(env, scope);
        }
      })()
    );
  },
};
