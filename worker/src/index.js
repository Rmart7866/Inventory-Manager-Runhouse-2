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
import { createProducts, createStagedUploads } from './products.js';
import { zeroInventory, setInventory } from './inventory.js';
import { applyTagChanges, applyMetafields } from './tags.js';
import { fetchProductDetail, updateProduct, updatePrices, addProductMedia } from './product-edit.js';
import { requireAuth, requireAdmin, requireWriteSecret, WriteGateError } from './auth.js';
import {
  readCatalog, readCatalogMeta, writeCatalog,
  readApparel, readApparelMeta, writeApparel,
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
    h['Access-Control-Allow-Headers'] = 'Authorization, Cf-Access-Jwt-Assertion, Content-Type, X-Write-Secret';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
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
//
// One pass over the store produces two payloads, footwear and apparel, written to
// two separate KV keys. The footwear write happens FIRST and is the one that
// matters: if the apparel write then fails, the footwear catalog is already safely
// in place and the tool carries on exactly as before with a stale apparel copy.
async function rebuild(env, scope) {
  const client = createShopifyClient(env);
  const { footwear, apparel } = await buildCatalog(client, {
    activeOnly: scope === 'active',
    needhamLocationId: env.NEEDHAM_LOCATION_ID || null,
  });
  const meta = await writeCatalog(env, scope, footwear);
  let apparelMeta = null;
  try {
    apparelMeta = await writeApparel(env, scope, apparel);
  } catch (err) {
    console.error('apparel write failed, footwear catalog is unaffected:', err?.stack || String(err));
  }
  return { payload: footwear, meta, apparelMeta };
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
    const { footwear } = await buildCatalog(client, {
      limit,
      activeOnly: scope === 'active',
      needhamLocationId: env.NEEDHAM_LOCATION_ID || null,
    });
    footwear.truncated = true;
    return rawCatalog(JSON.stringify(footwear), request, env, 'bypass-limit');
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
  const results = await createProducts(client, body.products, env.NEEDHAM_LOCATION_ID || null, env.DROPSHIP_LOCATION_IDS || '');
  const created = results.filter((r) => r.ok).length;
  return json({ created, total: results.length, results }, 200, request, env);
}

// POST /staged-uploads, Stage 4 image support. Body: { files: [{filename,
// mimeType, fileSize}] }. Returns Shopify's signed upload targets so the browser
// can PUT the image bytes, then reference each resourceUrl when creating products.
async function handleStagedUploads(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || !Array.isArray(body.files) || body.files.length === 0) {
    return json({ error: 'Expected JSON body { files: [ {filename, mimeType} ] }' }, 400, request, env);
  }
  if (body.files.length > 250) {
    return json({ error: 'Too many files in one request (max 250)' }, 400, request, env);
  }
  const client = createShopifyClient(env);
  const targets = await createStagedUploads(client, body.files);
  return json({ targets }, 200, request, env);
}

// POST /inventory, Stage 3 write. Zeroes Needham on-hand for a list of SKUs.
// Guarded by requireWriteSecret ON TOP OF requireAuth (see the route table), so
// the public bundle token alone cannot call it. Body:
//   { skus: ["S100981-1019-M7.0-W8.5", ...], dryRun: true|false }
// dryRun defaults TRUE: a caller must explicitly ask to write. Delegates all the
// Needham-scoping and zero-only safety to inventory.js.
async function handleZeroInventory(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  const client = createShopifyClient(env);

  // Full-sync path: explicit { sku, quantity } targets. Writes each to Needham,
  // zeroes included. Used by "Write all inventory to Shopify".
  if (body && Array.isArray(body.items)) {
    if (body.items.length > 8000) return json({ error: 'Too many items in one request (max 8000)' }, 400, request, env);
    const result = await setInventory(client, env, { items: body.items, dryRun: body.dryRun !== false });
    return json(result, result.ok ? 200 : 400, request, env);
  }

  // Zero-only path: a list of SKUs to set to 0. Used by "Clear all removed".
  if (!body || !Array.isArray(body.skus)) {
    return json({ error: 'Expected JSON body { skus: [...] } or { items: [{sku,quantity}] }, with dryRun' }, 400, request, env);
  }
  if (body.skus.length > 2000) {
    return json({ error: 'Too many SKUs in one request (max 2000)' }, 400, request, env);
  }
  const result = await zeroInventory(client, env, { skus: body.skus, dryRun: body.dryRun === true });
  return json(result, result.ok ? 200 : 400, request, env);
}

// POST /tags/apply, catalog tagging WRITE. Body: { changes: [{id, add, remove,
// productType}, ...] }. The browser computes the plan from the cached catalog and
// sends it in chunks. Write-gated (forWrite + write secret), same as /inventory.
async function handleApplyTags(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || !Array.isArray(body.changes)) {
    return json({ error: 'Expected JSON body { changes: [ {id, add, remove, productType} ] }' }, 400, request, env);
  }
  if (body.changes.length > 250) {
    return json({ error: 'Too many changes in one request (max 250 per chunk)' }, 400, request, env);
  }
  const client = createShopifyClient(env);
  const result = await applyTagChanges(client, body.changes);
  return json(result, 200, request, env);
}

// POST /tags/metafields/apply, swatch sibling metafields WRITE. Body:
// { inputs: [{ownerId, namespace, key, type, value}, ...] }. Browser-computed,
// chunked, write-gated.
async function handleApplyMetafields(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || !Array.isArray(body.inputs)) {
    return json({ error: 'Expected JSON body { inputs: [ {ownerId, namespace, key, type, value} ] }' }, 400, request, env);
  }
  if (body.inputs.length > 250) {
    return json({ error: 'Too many metafield inputs in one request (max 250 per chunk)' }, 400, request, env);
  }
  const client = createShopifyClient(env);
  const result = await applyMetafields(client, body.inputs);
  return json(result, 200, request, env);
}

// GET /product?id=... : full detail for the Product Library (description, image,
// per-variant prices), which the cached catalog does not carry. Read-only.
async function handleProductDetail(request, env) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'Expected ?id=<product gid>' }, 400, request, env);
  const client = createShopifyClient(env);
  const detail = await fetchProductDetail(client, id);
  if (!detail) return json({ error: 'Product not found' }, 404, request, env);
  return json({ product: detail }, 200, request, env);
}

// POST /product/update : { id, descriptionHtml?, productType? }. Edits one
// existing product's description (and optionally type). Write-gated.
async function handleProductUpdate(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || !body.id) {
    return json({ error: 'Expected JSON body { id, descriptionHtml? }' }, 400, request, env);
  }
  const client = createShopifyClient(env);
  const result = await updateProduct(client, body);
  return json(result, result.ok ? 200 : 400, request, env);
}

// POST /product/prices : { productId, variants: [{id, price}] }. Sets variant
// prices for one product. Write-gated.
async function handleProductPrices(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || !body.productId || !Array.isArray(body.variants)) {
    return json({ error: 'Expected JSON body { productId, variants: [{id, price}] }' }, 400, request, env);
  }
  if (body.variants.length > 100) {
    return json({ error: 'Too many variants in one request (max 100)' }, 400, request, env);
  }
  const client = createShopifyClient(env);
  const result = await updatePrices(client, body);
  return json(result, result.ok ? 200 : 400, request, env);
}

// POST /product/media : { id, originalSource, alt? }. Appends one image (already
// staged via /staged-uploads) to an existing product. Write-gated.
async function handleProductMedia(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { body = null; }
  if (!body || !body.id || !body.originalSource) {
    return json({ error: 'Expected JSON body { id, originalSource, alt? }' }, 400, request, env);
  }
  const client = createShopifyClient(env);
  const result = await addProductMedia(client, body);
  return json(result, result.ok ? 200 : 400, request, env);
}

// GET /catalog/apparel : the apparel catalog, for the apparel page. Read only,
// same bearer as /catalog. Kept a separate route rather than a flag on /catalog
// so the footwear payload is never even optionally larger.
async function handleApparel(request, env) {
  const scope = new URL(request.url).searchParams.get('active') === '1' ? 'active' : 'all';
  const hit = await readApparel(env, scope);
  if (hit) return rawCatalog(hit, request, env, 'hit');
  // Apparel is written by the same build as the footwear catalog, so a miss means
  // no build has run since this shipped. Ask for one, same as the cold path.
  await requestRefresh(env, scope);
  return json(
    {
      error: 'Apparel catalog not built yet',
      building: true,
      hint: 'The apparel catalog is built alongside the main one. It appears after the next rebuild, within a few minutes.',
    },
    503, request, env, { 'Retry-After': '60' }
  );
}

async function handleApparelStatus(request, env) {
  const scope = new URL(request.url).searchParams.get('active') === '1' ? 'active' : 'all';
  const meta = await readApparelMeta(env, scope);
  if (!meta) return json({ built: false, scope }, 200, request, env);
  const ageSeconds = Math.max(0, Math.round((Date.now() - Date.parse(meta.generatedAt)) / 1000));
  return json({ built: true, scope, ageSeconds, ...meta }, 200, request, env);
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
      // Apparel, its own read-only value in KV, built by the same cron.
      '/catalog/apparel': { handler: handleApparel, forWrite: false, methods: ['GET'] },
      '/catalog/apparel/status': { handler: handleApparelStatus, forWrite: false, methods: ['GET'] },
      // Stage 4 WRITE. forWrite:true, so auth.js refuses it in bearer mode (501).
      // Inert in production until AUTH_MODE becomes a real identity/secret gate.
      '/products': { handler: handleCreateProducts, forWrite: true, methods: ['POST'] },
      // Signed image-upload targets for product photos (also a write-scoped op).
      '/staged-uploads': { handler: handleStagedUploads, forWrite: true, methods: ['POST'] },
      // Stage 3 WRITE. Zeroes Needham on-hand. forWrite:true keeps it behind the
      // same hard gate, and needsWriteSecret adds a SECOND secret that is not in
      // the public bundle, because this route is destructive (see auth.js). Both
      // must pass. Zero-only and Needham-scoped in inventory.js.
      '/inventory': { handler: handleZeroInventory, forWrite: true, needsWriteSecret: true, methods: ['POST'] },
      // Catalog tagging WRITE (width / cw-group / gender tags + product type).
      // Same hard gate as /inventory: forWrite + a write secret not in the bundle.
      '/tags/apply': { handler: handleApplyTags, forWrite: true, needsWriteSecret: true, methods: ['POST'] },
      '/tags/metafields/apply': { handler: handleApplyMetafields, forWrite: true, needsWriteSecret: true, methods: ['POST'] },
      // Product Library. /product is a READ (full detail the cached catalog does
      // not carry: description, image, per-variant prices), gated by the catalog
      // bearer only. The two edits write to a single existing product and sit
      // behind the same hard gate as /inventory (forWrite + write secret).
      '/product': { handler: handleProductDetail, forWrite: false, methods: ['GET'] },
      '/product/update': { handler: handleProductUpdate, forWrite: true, needsWriteSecret: true, methods: ['POST'] },
      '/product/prices': { handler: handleProductPrices, forWrite: true, needsWriteSecret: true, methods: ['POST'] },
      '/product/media': { handler: handleProductMedia, forWrite: true, needsWriteSecret: true, methods: ['POST'] },
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

    // Destructive routes need the write secret ON TOP OF the bearer token, so
    // the bundle-readable token alone cannot trigger them.
    if (route.needsWriteSecret) {
      const w = requireWriteSecret(request, env);
      if (!w.ok) return json({ error: 'Write forbidden', reason: w.reason }, 403, request, env);
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
          const { meta, apparelMeta } = await rebuild(env, scope);
          await clearRefresh(env, scope);
          console.log(
            `${isDaily ? 'daily' : 'requested'} rebuild ok in ${Math.round((Date.now() - started) / 1000)}s`,
            JSON.stringify(meta.counts),
            `${(meta.sizeBytes / 1048576).toFixed(2)} MB`,
            apparelMeta
              ? `apparel ${apparelMeta.counts.products}p/${apparelMeta.counts.variants}v ${(apparelMeta.sizeBytes / 1048576).toFixed(2)} MB`
              : 'apparel NOT written'
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
