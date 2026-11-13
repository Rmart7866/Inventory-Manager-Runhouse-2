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

// EACH BRAND HAS ONE FORMAT, fixed here, so a file can never arrive in the
// shape another brand's card expects (2026-11-13):
//   csv   the scraper inventory CSV (stock and retail only): ASICS, Brooks, ON
//   xlsx  the supplier's own workbook, WHOLESALE COLUMNS STRIPPED on the Mac
//         (tools/strip-wholesale.mjs) and gzipped, because the rewritten
//         workbook is about twice the size and New Balance's would pass the
//         25 MB KV limit otherwise (45 MB stripped, 19 MB gzipped)
// and ON's images sidecar rides beside its CSV as a second part.
export const FEED_FORMAT = {
  asics: 'csv', brooks: 'csv', on: 'csv',
  saucony: 'xlsx', merrell: 'xlsx', puma: 'xlsx', altra: 'xlsx', newbalance: 'xlsx', hoka: 'xlsx',
};
export const FEED_BRANDS = Object.keys(FEED_FORMAT);
export const MAX_BYTES = 24 * 1024 * 1024;   // under KV's 25 MB value limit
const metaKey = (b) => 'feed:' + b;
const csvKey = (b) => 'feed:' + b + ':csv';
const fileKey = (b) => 'feed:' + b + ':xlsxgz';
const imagesKey = (b) => 'feed:' + b + ':images';

// An Excel upload: gzip bytes, a .xlsx name, and the uploader's word that the
// wholesale columns are gone. The Worker cannot read inside a gzipped
// workbook cheaply, so the runner proves the strip (it re-reads the result
// and refuses a file that still has one) and the Worker refuses any upload
// that does not say it was done.
export function validateWorkbook(brand, bytes, meta) {
  if (FEED_FORMAT[brand] !== 'xlsx') return { ok: false, error: brand + ' takes ' + (FEED_FORMAT[brand] || 'nothing') + ', not a workbook' };
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (!u.length) return { ok: false, error: 'empty file' };
  if (u.length > MAX_BYTES) return { ok: false, error: 'file over ' + MAX_BYTES + ' bytes' };
  if (u[0] !== 0x1f || u[1] !== 0x8b) return { ok: false, error: 'not gzip' };
  if (!/\.xlsx$/i.test(String(meta && meta.file || ''))) return { ok: false, error: 'file name must end in .xlsx' };
  if (!meta || meta.wholesaleStripped !== true) return { ok: false, error: 'refused: the upload does not say its wholesale columns were stripped' };
  if (!['PASS', 'BLOCKED'].includes(String(meta.verdict))) return { ok: false, error: 'verdict must be PASS or BLOCKED' };
  return { ok: true };
}

// Validate an upload. Returns { ok, error } so a test can drive it.
export function validateFeed(brand, csv, meta) {
  if (!FEED_BRANDS.includes(brand)) return { ok: false, error: 'brand must be one of ' + FEED_BRANDS.join(', ') };
  if (FEED_FORMAT[brand] !== 'csv') return { ok: false, error: brand + ' takes a stripped workbook, not a CSV' };
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

// body: a string for a CSV brand, bytes (ArrayBuffer / Uint8Array) for a
// workbook brand. The brand's FEED_FORMAT decides which is accepted.
export async function putFeed(env, brand, body, meta) {
  const isFile = typeof body !== 'string';
  const v = isFile ? validateWorkbook(brand, body, meta) : validateFeed(brand, body, meta);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const size = isFile ? (body.byteLength || body.length) : body.length;
  const record = {
    brand,
    format: isFile ? 'xlsx' : 'csv',
    file: String(meta.file || '').slice(0, 200),
    verdict: meta.verdict,
    reasons: (Array.isArray(meta.reasons) ? meta.reasons : []).slice(0, 12).map((r) => String(r).slice(0, 300)),
    rows: Number(meta.rows) || null,
    styles: Number(meta.styles) || null,
    units: Number(meta.units) || null,
    capturedAt: String(meta.capturedAt || ''),
    uploadedAt: new Date().toISOString(),
    bytes: size,
    wholesaleStripped: isFile ? true : undefined,
  };
  // File first: a meta pointing at a missing file is the worse half-write.
  await env.CATALOG.put(isFile ? fileKey(brand) : csvKey(brand), body);
  await env.CATALOG.put(metaKey(brand), JSON.stringify(record));
  return { status: 200, body: { ok: true, feed: record } };
}

// ON's images sidecar: { kind: 'on-images', map: { code: [url, ...] } }.
export async function putImages(env, brand, text) {
  if (brand !== 'on') return { status: 400, body: { error: 'only ON has an images file' } };
  let j; try { j = JSON.parse(text); } catch (e) { return { status: 400, body: { error: 'images file is not JSON' } }; }
  if (!j || j.kind !== 'on-images' || typeof j.map !== 'object') return { status: 400, body: { error: 'not an ON images file' } };
  if (text.length > MAX_BYTES) return { status: 400, body: { error: 'images file too big' } };
  await env.CATALOG.put(imagesKey(brand), text);
  return { status: 200, body: { ok: true, products: Object.keys(j.map).length } };
}

// part: undefined (meta only), 'file' (the CSV or the gzipped workbook), or 'images'.
export async function getFeed(env, brand, part) {
  if (!FEED_BRANDS.includes(brand)) return { status: 400, body: { error: 'unknown brand' } };
  const meta = await env.CATALOG.get(metaKey(brand), 'json');
  if (!meta) return { status: 404, body: { error: 'no file yet for ' + brand } };
  if (!part) return { status: 200, body: { feed: meta } };
  if (part === 'images') {
    const t = await env.CATALOG.get(imagesKey(brand));
    if (!t) return { status: 404, body: { error: 'no images file for ' + brand } };
    return { status: 200, raw: t, type: 'application/json; charset=utf-8', meta };
  }
  if (meta.format === 'xlsx') {
    const b = await env.CATALOG.get(fileKey(brand), 'arrayBuffer');
    if (!b) return { status: 404, body: { error: 'file missing for ' + brand } };
    return { status: 200, raw: b, type: 'application/gzip', meta };
  }
  const csv = await env.CATALOG.get(csvKey(brand));
  if (!csv) return { status: 404, body: { error: 'file missing for ' + brand } };
  return { status: 200, raw: csv, type: 'text/csv; charset=utf-8', meta };
}

// ---------------------------------------------------------------------------
// REPORT LINKS, 2026-11-13. HOKA does not hand its ATS report over: the
// portal builds it and EMAILS a link (DeckersB2B <no-reply@deckersb2b.deckers.com>,
// subject "<Season> ATS Report") to needham@, measured at about a minute.
// The needham@ Apps Script (tools/tracking-mailbox.gs) posts that link here;
// tools/hoka-headless-run.mjs asks for the report, then reads the newest link
// from here and downloads it. The link opens without a login, so it is held
// behind the write secret like the files themselves.
//
// AN ALLOWLIST, NOT A MATCH ON ANY URL. Only Deckers' own report bucket is
// accepted, so a forged or odd email can never point the nightly runner at
// some other download.
export const LINK_BRANDS = ['hoka'];
const linkKey = (b) => 'feedlink:' + b;
const HOKA_LINK = /^https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/us\.assets\.b2b\.deckers\.com\/company_\d+\/DynamicReports\/[^?#]*ATS_Report[^?#]*\.xlsx$/i;

export function validateLink(brand, url) {
  if (!LINK_BRANDS.includes(brand)) return { ok: false, error: 'brand must be one of ' + LINK_BRANDS.join(', ') };
  if (typeof url !== 'string' || url.length > 600) return { ok: false, error: 'url missing or too long' };
  if (!HOKA_LINK.test(url)) return { ok: false, error: 'not a Deckers DynamicReports ATS_Report link' };
  return { ok: true };
}

// Keeps the newest ten, newest first, deduplicated by url.
export async function putLink(env, brand, url, meta = {}) {
  const v = validateLink(brand, url);
  if (!v.ok) return { status: 400, body: { error: v.error } };
  const list = (await env.CATALOG.get(linkKey(brand), 'json')) || [];
  if (list.some((x) => x.url === url)) return { status: 200, body: { ok: true, duplicate: true } };
  const rec = { url, subject: String(meta.subject || '').slice(0, 160), emailedAt: String(meta.emailedAt || ''), receivedAt: new Date().toISOString() };
  await env.CATALOG.put(linkKey(brand), JSON.stringify([rec].concat(list).slice(0, 10)));
  return { status: 200, body: { ok: true, link: rec } };
}

export async function getLinks(env, brand) {
  if (!LINK_BRANDS.includes(brand)) return { status: 400, body: { error: 'unknown brand' } };
  return { status: 200, body: { links: (await env.CATALOG.get(linkKey(brand), 'json')) || [] } };
}
