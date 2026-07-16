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
import { requireAuth, requireAdmin, WriteGateError } from './auth.js';
import {
  readCatalog, readCatalogMeta, writeCatalog,
  acquireBuildLock, releaseBuildLock,
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
  const payload = await buildCatalog(client, { activeOnly: scope === 'active' });
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
    const payload = await buildCatalog(client, { limit, activeOnly: scope === 'active' });
    payload.truncated = true;
    return rawCatalog(JSON.stringify(payload), request, env, 'bypass-limit');
  }

  // fresh=1 rebuilds inline and waits. This is the slow path on purpose, about
  // 150 seconds and about 170 Shopify requests, and exists for "I just changed
  // Shopify and need to see it now". It is not what the tool calls on page load.
  //
  // It takes the ADMIN_TOKEN, not the browser's CATALOG_TOKEN. Reading the
  // catalog is a cheap KV lookup, so a bundle-readable token is proportionate
  // for it. Forcing a rebuild burns the Shopify API budget, so it is not.
  if (fresh) {
    const admin = requireAdmin(request, env);
    if (!admin.ok) {
      return json({ error: 'Forbidden', reason: admin.reason }, 403, request, env);
    }
    const { payload } = await rebuild(env, scope);
    return rawCatalog(JSON.stringify(payload), request, env, 'rebuilt');
  }

  const hit = await readCatalog(env, scope);
  if (hit) return rawCatalog(hit, request, env, 'hit');

  // Cold miss. Do NOT rebuild inline and make this caller wait 150 seconds.
  // Kick the build off in the background and tell the client to come back.
  // waitUntil keeps the isolate alive after the response is sent.
  const got = await acquireBuildLock(env, scope);
  if (got) {
    ctx.waitUntil(
      rebuild(env, scope)
        .catch((err) => console.error('background rebuild failed:', err?.stack || String(err)))
        .finally(() => releaseBuildLock(env, scope))
    );
  }
  return json(
    {
      error: 'Catalog not built yet',
      building: true,
      hint: 'The catalog is being built now, this takes about 150 seconds. Retry shortly.',
    },
    503,
    request,
    env,
    { 'Retry-After': '30' }
  );
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
      '/catalog': { handler: handleCatalog, forWrite: false },
      '/catalog/status': { handler: handleStatus, forWrite: false },
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

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, request, env, { Allow: 'GET, OPTIONS' });
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

  // Cron trigger. Rebuilds the catalog so GET /catalog is always a warm KV read.
  // Cron handlers get a far longer wall-clock budget than a request, which is
  // exactly why the slow build lives here.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const started = Date.now();
        try {
          const { meta } = await rebuild(env, 'all');
          console.log(
            `cron rebuild ok in ${Math.round((Date.now() - started) / 1000)}s`,
            JSON.stringify(meta.counts),
            `${(meta.sizeBytes / 1048576).toFixed(2)} MB`
          );
        } catch (err) {
          // Leave the previous catalog in place. A stale catalog is better than
          // no catalog, and /catalog/status exposes the age so staleness is
          // visible rather than silent.
          console.error('cron rebuild FAILED, keeping previous catalog:', err?.stack || String(err));
        }
      })()
    );
  },
};
