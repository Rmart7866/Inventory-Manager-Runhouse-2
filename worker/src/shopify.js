// shopify.js, Worker port. The Run House.
//
// Admin GraphQL client, adapted from the Color Swatch shopify.js. The retry,
// throttle, and token-exchange logic is the same logic, reshaped for Workers.
//
// WHY THIS IS NOT A VERBATIM COPY. The original computes SHOP, ENDPOINT, and
// API_VERSION at module scope from process.env. A Worker has no process.env,
// and bindings are not readable at module scope at all, they arrive per request
// on the `env` argument. So the module-level constants become a factory:
// createShopifyClient(env) closes over the bindings and returns the same
// { graphql, throttleOf, SHOP, API_VERSION } surface the callers expect.
//
// READ ONLY BY DESIGN. The original also exports setMetafields (a write). That
// is deliberately NOT ported. Stage 1 must not be able to write to Shopify even
// by accident, so the write path does not exist in this file. Writes arrive in
// Stage 3 behind a dry-run diff, as its own reviewable change.
//
// Env bindings:
//   SHOP_URL           therunhouse.myshopify.com  (or the full admin host)
//   CLIENT_ID          Dev Dashboard app Client ID      (secret)
//   CLIENT_SECRET      Dev Dashboard app Client Secret  (secret)
//   ADMIN_API_TOKEN    optional legacy static shpat_ token, bypasses the exchange
//   API_VERSION        optional, defaults to 2026-01
//
// House style: no em dashes. Use commas, periods, or the word "to".

const DEFAULT_API_VERSION = '2026-01';

// Token cache lives at module scope, so it survives across requests inside a
// warm isolate. That is the Worker equivalent of the original's module-level
// _token. Keyed by shop + client id so two configs can never share a token.
// A cold isolate just re-exchanges, which costs one extra subrequest.
const _tokenCache = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeShop(raw) {
  return String(raw || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .trim();
}

export function createShopifyClient(env) {
  const SHOP = normalizeShop(env.SHOP_URL);
  const API_VERSION = env.API_VERSION || DEFAULT_API_VERSION;
  const ENDPOINT = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
  const TOKEN_URL = `https://${SHOP}/admin/oauth/access_token`;

  function assertConfig() {
    if (!SHOP) throw new Error('SHOP_URL is not set');
    const hasStatic = !!env.ADMIN_API_TOKEN;
    const hasCCG = !!(env.CLIENT_ID && env.CLIENT_SECRET);
    if (!hasStatic && !hasCCG) {
      throw new Error('Set CLIENT_ID and CLIENT_SECRET (dev dashboard app), or a static ADMIN_API_TOKEN');
    }
  }

  // Dev-dashboard apps (post January 2026) no longer expose a permanent token.
  // We exchange Client ID + Secret for a short-lived token via the client
  // credentials grant, valid for about 24 hours, and cache it. A legacy static
  // ADMIN_API_TOKEN still works if you have one.
  async function getToken() {
    if (env.ADMIN_API_TOKEN) return env.ADMIN_API_TOKEN;

    const cacheKey = `${SHOP}|${env.CLIENT_ID}`;
    const hit = _tokenCache.get(cacheKey);
    if (hit && Date.now() < hit.expiry - 60000) return hit.token;

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.CLIENT_ID,
        client_secret: env.CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) {
      // Do not echo the response body. On a bad exchange Shopify can reflect
      // request detail, and this string can reach a log or an error response.
      throw new Error(`Token exchange failed: HTTP ${res.status}`);
    }
    const j = await res.json();
    _tokenCache.set(cacheKey, {
      token: j.access_token,
      expiry: Date.now() + (j.expires_in || 86399) * 1000,
    });
    return j.access_token;
  }

  // One GraphQL request with retry. Handles the cost-based throttle (waits for
  // the bucket to refill), HTTP 429, and transient 5xx / network errors.
  async function graphql(query, variables = {}, attempt = 0) {
    assertConfig();
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': await getToken(),
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      if (attempt < 5) {
        await sleep(1000 * Math.pow(2, attempt));
        return graphql(query, variables, attempt + 1);
      }
      throw err;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt < 6) {
        const retryAfter = Number(res.headers.get('retry-after')) || Math.pow(2, attempt);
        await sleep(retryAfter * 1000);
        return graphql(query, variables, attempt + 1);
      }
      throw new Error(`HTTP ${res.status} from Shopify after retries`);
    }

    // A 401 means the cached token went stale early (app reinstalled, scopes
    // changed, secret rotated). Drop it and retry once with a fresh exchange.
    // The original script did not need this: it was a short-lived process, where
    // a warm Worker isolate can hold a token across many hours.
    if (res.status === 401 && !env.ADMIN_API_TOKEN && attempt < 2) {
      _tokenCache.delete(`${SHOP}|${env.CLIENT_ID}`);
      return graphql(query, variables, attempt + 1);
    }

    const body = await res.json();

    // Cost-based throttle: Shopify returns a THROTTLED error plus the current
    // bucket state. Wait for enough to refill, then retry.
    const throttled = (body.errors || []).some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled) {
      const status = body.extensions?.cost?.throttleStatus;
      let waitMs = 1000;
      if (status) {
        const need = (body.extensions?.cost?.requestedQueryCost || 100) - status.currentlyAvailable;
        waitMs = Math.max(500, Math.ceil((need / status.restoreRate) * 1000));
      }
      if (attempt < 8) {
        await sleep(waitMs);
        return graphql(query, variables, attempt + 1);
      }
      throw new Error('Still throttled after retries');
    }

    if (body.errors && body.errors.length) {
      throw new Error('GraphQL errors: ' + JSON.stringify(body.errors));
    }
    return body;
  }

  return { graphql, throttleOf, SHOP, API_VERSION };
}

// Pull throttle headroom out of a response so the caller can pace itself.
export function throttleOf(body) {
  return body?.extensions?.cost?.throttleStatus || null;
}
