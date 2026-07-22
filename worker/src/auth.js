// auth.js, The Run House.
//
// Two auth modes, and a hard gate between them.
//
//   AUTH_MODE = "bearer"   Stage 1 only. A shared token the browser sends.
//   AUTH_MODE = "access"   Cloudflare Access JWT. Real identity, per person.
//
// READ THIS BEFORE ADDING A WRITE ROUTE.
//
// Bearer mode is NOT authentication. The Inventory Manager is public JavaScript
// on GitHub Pages, so any token it holds is readable by anyone who opens
// devtools. The token stops the workers.dev URL being found and scraped by
// accident. It stops nothing deliberate.
//
// That trade is acceptable for Stage 1 because GET /catalog is read only and the
// worst case is disclosure of our own product catalog. Note it is not purely
// public data: the payload includes about 680 DRAFT products, which are
// unreleased. The tool needs them (a draft's handle is still taken), so they
// cannot simply be filtered out. Judge the trade with that in mind.
//
// That trade is NOT acceptable for a write route. A public token on a write
// endpoint means anyone can set inventory to zero across the store. The dry-run
// diff in the brief lives in the BROWSER, so it protects against a bad feed, not
// against a caller who skips the UI and posts straight to the Worker.
//
// So requireAuth({ forWrite: true }) refuses to run in bearer mode. That is a
// deliberate tripwire: Stage 3 cannot ship until AUTH_MODE is "access", which
// needs a Cloudflare zone. therunhouse.com is not on Cloudflare and is not
// moving, but a SEPARATE domain (eg runhouse-tools.com, about 10 dollars a year)
// added to Cloudflare touches none of the existing DNS and unlocks Access. That
// is the intended path out of bearer mode.
//
// Env bindings:
//   AUTH_MODE            "bearer" | "access"
//   CATALOG_TOKEN        bearer mode. Shared token, public by construction.
//   ADMIN_TOKEN          gates the expensive rebuild path. NEVER in the bundle.
//   ACCESS_TEAM_DOMAIN   access mode. eg therunhouse.cloudflareaccess.com
//   ACCESS_AUD           access mode. The Application Audience (AUD) tag.
//   DEV_BYPASS_AUTH      "true" only in .dev.vars, never a deployed secret.
//
// House style: no em dashes. Use commas, periods, or the word "to".

// --- constant time compare -------------------------------------------------
// A plain === on a secret leaks its prefix through timing. The tokens here are
// low value, but this costs nothing and removes the question.
function timingSafeEqual(a, b) {
  const ab = new TextEncoder().encode(String(a || ''));
  const bb = new TextEncoder().encode(String(b || ''));
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function bearerFrom(request) {
  const h = request.headers.get('Authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// --- Cloudflare Access -----------------------------------------------------
// JWKS cache at module scope, shared across requests in a warm isolate.
const _jwksCache = new Map();
const JWKS_TTL_MS = 60 * 60 * 1000; // Access rotates keys about every 6 weeks

function b64urlToBytes(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(teamDomain) {
  const hit = _jwksCache.get(teamDomain);
  if (hit && Date.now() < hit.expiry) return hit.keys;

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs fetch failed: HTTP ${res.status}`);
  const jwks = await res.json();

  const keys = new Map();
  for (const jwk of jwks.keys || []) {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    keys.set(jwk.kid, key);
  }
  _jwksCache.set(teamDomain, { keys, expiry: Date.now() + JWKS_TTL_MS });
  return keys;
}

// The Worker verifies the Access JWT itself rather than trusting that Access is
// in front of it, because a Worker is also reachable at its workers.dev
// subdomain and at any other bound route, and Access does not guard those.
async function verifyAccessJwt(request, env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  // Fail closed. A missing binding must never mean "no auth required".
  if (!teamDomain || !aud) return { ok: false, reason: 'Access is not configured on this Worker' };

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (!token) return { ok: false, reason: 'No Access token on request' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Malformed Access token' };

  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    return { ok: false, reason: 'Unreadable Access token' };
  }

  if (header.alg !== 'RS256') return { ok: false, reason: `Unexpected token alg ${header.alg}` };

  let keys;
  try {
    keys = await getKeys(teamDomain);
  } catch {
    return { ok: false, reason: 'Could not fetch Access public keys' };
  }
  const key = keys.get(header.kid);
  if (!key) return { ok: false, reason: 'Unknown Access signing key' };

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!valid) return { ok: false, reason: 'Bad Access token signature' };

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now >= payload.exp) return { ok: false, reason: 'Access token expired' };
  if (payload.nbf && now < payload.nbf) return { ok: false, reason: 'Access token not yet valid' };

  // Without the aud check, ANY valid token from this Cloudflare team, including
  // one for an unrelated internal app, would be accepted here.
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(aud)) return { ok: false, reason: 'Access token audience mismatch' };
  if (payload.iss !== `https://${teamDomain}`) return { ok: false, reason: 'Access token issuer mismatch' };

  return { ok: true, identity: { email: payload.email, sub: payload.sub } };
}

// --- public surface --------------------------------------------------------

export class WriteGateError extends Error {}

// requireAuth(request, env, { forWrite })
//   -> { ok: true, identity } | { ok: false, reason }
// Throws WriteGateError if a write is attempted without real identity. That is
// not a runtime condition to handle, it is a "this must not ship" condition.
export async function requireAuth(request, env, opts = {}) {
  const mode = env.AUTH_MODE || 'bearer';

  // THE HARD GATE. A shared token that lives in public JavaScript cannot
  // authorise a write. Do not soften this to a warning, and do not add an
  // env var that bypasses it. Move to AUTH_MODE=access instead.
  //
  // TEMPORARY, OWNER-DIRECTED: ALLOW_BEARER_WRITES=true opens the write routes in
  // bearer mode so create can go live before the Access gate exists. This means
  // the route is callable by anyone who reads the public token, so it is guarded
  // downstream by being CREATE-ONLY (products.js never overwrites an existing
  // product) and DRAFT-ONLY. REMOVE this before the tool is "done":
  //   wrangler secret delete ALLOW_BEARER_WRITES   (restores the hard gate)
  var bearerWritesOpen = (env.ALLOW_BEARER_WRITES === 'true');
  if (opts.forWrite && mode !== 'access' && !bearerWritesOpen) {
    throw new WriteGateError(
      'Refusing to serve a write route in AUTH_MODE=' + mode + '. ' +
      'Writes require per-person identity (AUTH_MODE=access). See src/auth.js.'
    );
  }

  // Local development only. .dev.vars is gitignored and wrangler never uploads
  // it. Still gated on forWrite, so it cannot be used to sneak past the gate.
  if (env.DEV_BYPASS_AUTH === 'true') {
    return { ok: true, identity: { email: 'dev-bypass@localhost', dev: true } };
  }

  if (mode === 'access') return verifyAccessJwt(request, env);

  if (mode === 'bearer') {
    if (!env.CATALOG_TOKEN) return { ok: false, reason: 'CATALOG_TOKEN is not configured' };
    const got = bearerFrom(request);
    if (!got) return { ok: false, reason: 'No bearer token on request' };
    if (!timingSafeEqual(got, env.CATALOG_TOKEN)) return { ok: false, reason: 'Bad token' };
    // Deliberately anonymous. Bearer mode cannot tell you WHO called, which is
    // exactly why it cannot authorise a write.
    return { ok: true, identity: { email: null, anonymous: true } };
  }

  return { ok: false, reason: `Unknown AUTH_MODE ${mode}` };
}

// The rebuild path is the expensive one: about 170 Shopify requests and 150
// seconds. Reading the catalog is a cheap KV lookup, so the browser token is
// enough for it. Forcing a rebuild is not something a bundle-readable token
// should be able to trigger, so it takes a separate admin token that is never
// shipped to the browser.
export function requireAdmin(request, env) {
  if (env.DEV_BYPASS_AUTH === 'true') return { ok: true };
  if (!env.ADMIN_TOKEN) return { ok: false, reason: 'ADMIN_TOKEN is not configured' };
  // X-Admin-Token is checked BEFORE the bearer, and this order matters. ?fresh=1
  // passes through requireAuth first, so the Authorization bearer is already
  // spent on the CATALOG_TOKEN by the time we get here. If we read the bearer
  // first, it would always be the catalog token, never the admin one, and this
  // gate could never pass. So the admin token rides in its own header and wins.
  const got = request.headers.get('X-Admin-Token') || bearerFrom(request);
  if (!got) return { ok: false, reason: 'Rebuild requires the admin token' };
  if (!timingSafeEqual(got, env.ADMIN_TOKEN)) return { ok: false, reason: 'Bad admin token' };
  return { ok: true };
}
