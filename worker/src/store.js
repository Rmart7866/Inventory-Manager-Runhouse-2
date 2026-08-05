// store.js, The Run House.
//
// KV-backed storage for the built catalog.
//
// WHY. Building the catalog means paging the whole Shopify store, about 170
// requests and 149 seconds measured against the live shop, because the footwear
// gate is a productType test we can only apply after fetching. That is far too
// slow to sit in front of a page load, it needs more subrequests than a free
// Worker gets, and a request that long is fragile. So a cron trigger builds the
// catalog on a schedule and writes it here, and GET /catalog just reads it.
// Reads are a single KV lookup, low tens of milliseconds.
//
// The tradeoff is staleness, bounded by the cron interval. The brief accepts
// this: "the catalog does not change second to second".
//
// KV limits worth knowing: 25 MB per value. The catalog is about 4.5 MB of JSON
// today at 3,567 footwear products, so there is roughly 5x headroom. buildMeta
// records the size so growth is visible before it becomes a failure.
//
// House style: no em dashes. Use commas, periods, or the word "to".

const KEY_PREFIX = 'catalog:v1';
const LOCK_TTL_SECONDS = 300; // longer than a build (about 150s), so a crashed build self-clears

export function catalogKey(scope) {
  return `${KEY_PREFIX}:${scope}`;
}

// Apparel is its own value, written by the same build. Keeping it out of the
// footwear key is what stops the payload every staff browser fetches from
// growing, and what guarantees the footwear known set never meets a garment.
export function apparelKey(scope) {
  return `${KEY_PREFIX}:apparel:${scope}`;
}

function lockKey(scope) {
  return `${KEY_PREFIX}:lock:${scope}`;
}

// Read the stored catalog as a raw JSON string. Returns null on a miss.
// We keep it as text rather than parsing: the router serves it straight through,
// so parsing and re-serialising 4.5 MB would be pure waste.
export async function readCatalog(env, scope) {
  return env.CATALOG.get(catalogKey(scope), 'text');
}

// Read just the metadata (generatedAt, counts, sizeBytes) without pulling the
// whole 4.5 MB value. KV metadata is returned alongside the key listing, so this
// is the cheap way to answer "how fresh is the catalog".
export async function readCatalogMeta(env, scope) {
  const { metadata } = await env.CATALOG.getWithMetadata(catalogKey(scope), { type: 'stream' });
  return metadata || null;
}

// KV metadata is capped at 1024 BYTES, which is small and easy to grow into
// without noticing. Over the cap the put fails, the build throws, and the catalog
// silently stops updating, which is the one failure this system is worst at
// showing, because a stale catalog still serves.
//
// The hazard is specifically an UNBOUNDED map. counts.byType is keyed by product
// type and counts.byBrand by vendor, so both widen every time a supplier uses a
// new category: they were 324 and 96 bytes on the first apparel build and there
// is no ceiling on them. Those stay in the payload body only.
//
// A map with a fixed, known set of keys is not the hazard and is worth keeping,
// because /catalog/status is the ONLY cheap way to read it. byStatus is the
// example: Shopify has exactly three statuses, so it is about 50 bytes forever,
// and it exists to make a drift like a bulk archive visible without pulling the
// 12.76 MB body. Dropping it defeated the reason it is computed.
const BOUNDED_MAPS = new Set(['byStatus']);

function metaCounts(counts) {
  const out = {};
  for (const [k, v] of Object.entries(counts || {})) {
    if (typeof v !== 'object' || v === null) out[k] = v;
    else if (BOUNDED_MAPS.has(k)) out[k] = v;
  }
  return out;
}

export async function writeCatalog(env, scope, payload) {
  const body = JSON.stringify(payload);
  const meta = {
    generatedAt: payload.generatedAt,
    counts: metaCounts(payload.counts),
    sizeBytes: body.length,
  };
  await env.CATALOG.put(catalogKey(scope), body, { metadata: meta });
  return meta;
}

// The apparel catalog. Same shape of call, its own key, so a failure to write it
// cannot corrupt or truncate the footwear catalog.
export async function readApparel(env, scope) {
  return env.CATALOG.get(apparelKey(scope), 'text');
}

export async function readApparelMeta(env, scope) {
  const { metadata } = await env.CATALOG.getWithMetadata(apparelKey(scope), { type: 'stream' });
  return metadata || null;
}

export async function writeApparel(env, scope, payload) {
  const body = JSON.stringify(payload);
  const meta = {
    generatedAt: payload.generatedAt,
    counts: metaCounts(payload.counts),
    sizeBytes: body.length,
  };
  await env.CATALOG.put(apparelKey(scope), body, { metadata: meta });
  return meta;
}

// Best-effort build lock, so a cold cache plus several staff opening the tool at
// once does not fire several 170-request rebuilds at Shopify simultaneously.
//
// Honest about what this is: KV is eventually consistent, so two isolates can
// both read "no lock" and both proceed. It narrows a stampede, it does not make
// it impossible. That is acceptable here because the cron keeps the value warm,
// so a cold miss is already the rare path, and the downside of losing the race is
// a duplicated build, not a correctness problem.
export async function acquireBuildLock(env, scope) {
  const existing = await env.CATALOG.get(lockKey(scope), 'text');
  if (existing) return false;
  await env.CATALOG.put(lockKey(scope), String(Date.now()), { expirationTtl: LOCK_TTL_SECONDS });
  return true;
}

export async function releaseBuildLock(env, scope) {
  await env.CATALOG.delete(lockKey(scope));
}

// On-demand refresh flag. A fetch handler's waitUntil is killed after about 30
// seconds, so it cannot run the multi-minute build. Instead the refresh request
// sets this flag, and the frequent cron (which has a 15 minute budget) sees it
// and does the build. Expires after an hour so a stuck flag self-clears.
function refreshKey(scope) {
  return `${KEY_PREFIX}:refresh:${scope}`;
}

export async function requestRefresh(env, scope) {
  await env.CATALOG.put(refreshKey(scope), String(Date.now()), { expirationTtl: 3600 });
}

export async function isRefreshRequested(env, scope) {
  return !!(await env.CATALOG.get(refreshKey(scope)));
}

export async function clearRefresh(env, scope) {
  await env.CATALOG.delete(refreshKey(scope));
}
