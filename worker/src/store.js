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

export async function writeCatalog(env, scope, payload) {
  const body = JSON.stringify(payload);
  const meta = {
    generatedAt: payload.generatedAt,
    counts: payload.counts,
    sizeBytes: body.length,
  };
  await env.CATALOG.put(catalogKey(scope), body, { metadata: meta });
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
