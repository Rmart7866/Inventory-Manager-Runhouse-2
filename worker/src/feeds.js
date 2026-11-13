// feeds.js, The Run House. Built 2026-11-12 on owner request: the scheduled
// scraper files should arrive in the inventory tool by themselves, so a person
// only has to look and press Write.
//
// The scheduled runners (tools/asics-headless-run.mjs --full-catalog,
// tools/brooks-headless-run.mjs) upload the CSV they just wrote plus its
// verdict; the inventory tool reads the newest one per brand and loads it
// into the card as if it had been dropped there. NOTHING HERE WRITES TO
// SHOPIFY: the file is data for a person to review.
//
// Both routes need the WRITE SECRET on top of the bearer token (needsWriteSecret
// in index.js): the files carry stock and RETAIL price, never wholesale, but
// they are still not for the public bundle token.
//
// Storage: KV, one key for the meta and one for the CSV per brand. A full
// ASICS catalog is a few MB, far under the 25 MB KV value limit; anything
// bigger than MAX_BYTES is refused rather than truncated.
//
// House style: no em dashes.

export const FEED_BRANDS = ['asics', 'brooks'];
export const MAX_BYTES = 20 * 1024 * 1024;
const metaKey = (b) => 'feed:' + b;
const csvKey = (b) => 'feed:' + b + ':csv';

// Validate an upload. Returns { ok, error } so a test can drive it.
export function validateFeed(brand, csv, meta) {
  if (!FEED_BRANDS.includes(brand)) return { ok: false, error: 'brand must be one of ' + FEED_BRANDS.join(', ') };
  if (typeof csv !== 'string' || !csv.length) return { ok: false, error: 'empty file' };
  if (csv.length > MAX_BYTES) return { ok: false, error: 'file over ' + MAX_BYTES + ' bytes' };
  // The scraper inventory CSV, nothing else: a product CSV or an HTML error
  // page would load into the tool as nonsense.
  if (!/^Handle,/.test(csv) || !/SKU/.test(csv.slice(0, 400)) || !/On hand \(new\)/.test(csv.slice(0, 600))) {
    return { ok: false, error: 'not a scraper inventory CSV (no Handle, SKU and On hand (new) header)' };
  }
  if (!['PASS', 'BLOCKED'].includes(String(meta && meta.verdict))) return { ok: false, error: 'verdict must be PASS or BLOCKED' };
  return { ok: true };
}

export async function putFeed(env, brand, csv, meta) {
  const v = validateFeed(brand, csv, meta);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const record = {
    brand,
    file: String(meta.file || '').slice(0, 200),
    verdict: meta.verdict,
    reasons: (Array.isArray(meta.reasons) ? meta.reasons : []).slice(0, 12).map((r) => String(r).slice(0, 300)),
    rows: Number(meta.rows) || null,
    styles: Number(meta.styles) || null,
    units: Number(meta.units) || null,
    capturedAt: String(meta.capturedAt || ''),
    uploadedAt: new Date().toISOString(),
    bytes: csv.length,
  };
  // CSV first: a meta pointing at a missing CSV is the worse half-write.
  await env.CATALOG.put(csvKey(brand), csv);
  await env.CATALOG.put(metaKey(brand), JSON.stringify(record));
  return { status: 200, body: { ok: true, feed: record } };
}

export async function getFeed(env, brand, withCsv) {
  if (!FEED_BRANDS.includes(brand)) return { status: 400, body: { error: 'unknown brand' } };
  const meta = await env.CATALOG.get(metaKey(brand), 'json');
  if (!meta) return { status: 404, body: { error: 'no file yet for ' + brand } };
  if (!withCsv) return { status: 200, body: { feed: meta } };
  const csv = await env.CATALOG.get(csvKey(brand));
  if (!csv) return { status: 404, body: { error: 'file missing for ' + brand } };
  return { status: 200, raw: csv, type: 'text/csv; charset=utf-8', meta };
}
