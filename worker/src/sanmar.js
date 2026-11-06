// Supplier data for team store requests: live stock per colour and size, and
// each colour's high resolution photos. Read only, through the suppliers'
// PromoStandards web services, with each supplier's login in Worker secrets
// (never in the page bundle). Two suppliers carry the whole builder catalog:
//
//   SanMar         145 styles  SANMAR_USER / SANMAR_PASSWORD
//   Charles River   16 styles  CRA_USER / CRA_PASSWORD, through Essent's
//                              hosting, addresses from the PromoStandards
//                              directory (company code "Charles")
//
// Both speak Inventory 2.0.0 and Media Content 1.1.0 (SanMar refuses 1.0.0
// as "Not Supported"), so one request builder and one parser serve both.
//
// THE COLOUR JOIN IS THE CAREFUL PART. SanMar abbreviates its colour names
// ("Ath Maroon", "Ht Cardinal", "Tr Nvy/Gld/Wht") where our catalog spells
// them out, so a name match finds about 62%. Its photo FILENAMES spell them
// out though ("PC380_athleticmaroon_flat_front.jpg"), so the second segment
// of a filename is a second key. That segment is not always the colour:
// two-tone and shared photos carry just the first colour ("black" on a
// Black/Gold garment), so a filename key is used ONLY when it points at
// exactly one colour. An unmatched colour reports no data rather than
// borrowing a neighbour's stock or photo. Measured 2026-11-06 over all 145
// SanMar styles: 2,071 of 2,107 of our colours joined, 98.3%.

export const SUPPLIERS = {
  sanmar: {
    name: 'SanMar', user: 'SANMAR_USER', pass: 'SANMAR_PASSWORD', prefix: 'sanmar:',
    inv: 'https://ws.sanmar.com:8080/promostandards/InventoryServiceBindingV2final',
    media: 'https://ws.sanmar.com:8080/promostandards/MediaContentServiceBinding',
    // Flats, or form shots (a ghost mannequin, SanMar's women's styles): the
    // kinds of photo our catalog's are. Never a model or a prop shot.
    front: /\/imglib\/mresjpg\/.*_(flat|form)_front\.jpg$/i,
    back: /\/imglib\/mresjpg\/.*_(flat|form)_back\.jpg$/i,
  },
  cra: {
    name: 'Charles River', user: 'CRA_USER', pass: 'CRA_PASSWORD', prefix: 'cra:',
    inv: 'https://ordertrax.essent.com/sites/charlesriverapparel/inventoryV2/InventoryV2.svc',
    media: 'https://ordertrax.essent.com/sites/charlesriverapparel/mediacontent/MediaContent.svc',
    // Their filenames carry no shot type, so any Front or Rear photo on their
    // own image host is a candidate. The page still checks it is the SAME
    // shot as our catalog photo before drawing on it, which is what keeps a
    // model shot out.
    front: /^https:\/\/www\.charlesriverapparel\.com\/prodimg\//i,
    back: /^https:\/\/www\.charlesriverapparel\.com\/prodimg\//i,
  },
};
const INV_NS = 'http://www.promostandards.org/WSDL/Inventory/2.0.0/';
const MEDIA_NS = 'http://www.promostandards.org/WSDL/MediaService/1.0.0/';
export const SUPPLIER_TTL = 30 * 60; // seconds; stock moves, but not by the minute

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One normaliser for both sides of the join. "Heathered Navy" on our side
// is "heathernavy" in SanMar's filenames.
export function colorKey(s) {
  return String(s || '').toLowerCase().replace(/heathered/g, 'heather').replace(/[^a-z0-9]/g, '');
}

// Supplier size labels in ours.
export function sizeKey(s) {
  const t = String(s || '').trim().toUpperCase();
  return { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL', XXXXXL: '5XL', OSFA: 'One Size' }[t] || String(s || '').trim();
}

// Tags may carry a namespace prefix ("ns2:") or attributes (Essent writes
// xmlns on them), so both are allowed.
const tags = (s, t) => [...s.matchAll(new RegExp('<(?:\\w+:)?' + t + '(?:\\s[^>]*)?>([^<]*)<', 'g'))].map((m) => m[1]);
const blocks = (s, t) => [...s.matchAll(new RegExp('<(?:\\w+:)?' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?' + t + '>', 'g'))].map((m) => m[1]);
const unxml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export const hasLogin = (env, sup) => !!(env[SUPPLIERS[sup].user] && env[SUPPLIERS[sup].pass]);

async function soap(env, cfg, url, ns, req, version, extra, action) {
  const body = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="' + ns + '" xmlns:shar="' + ns + 'SharedObjects/"><soapenv:Header/><soapenv:Body><ns:' + req + '>' +
    '<shar:wsVersion>' + version + '</shar:wsVersion><shar:id>' + esc(env[cfg.user]) + '</shar:id><shar:password>' + esc(env[cfg.pass]) + '</shar:password>' + extra +
    '</ns:' + req + '></soapenv:Body></soapenv:Envelope>';
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action }, body });
  const x = await r.text();
  const fault = tags(x, 'faultstring')[0];
  if (!r.ok || fault) throw new Error(cfg.name + ' ' + r.status + (fault ? ': ' + fault : ''));
  return x;
}

// Pure: turn the two SOAP replies into { colors, alias }. Exported for the test.
export function parseSupplier(invXml, mediaXml, sup = 'sanmar') {
  const cfg = SUPPLIERS[sup];
  const colors = {};
  const col = (n) => (colors[n] = colors[n] || { q: {}, f: null, b: null });
  for (const p of blocks(invXml, 'PartInventory')) {
    const c = unxml(tags(p, 'partColor')[0] || ''), size = sizeKey(unxml(tags(p, 'labelSize')[0] || ''));
    const qa = blocks(p, 'quantityAvailable')[0] || '', v = Number(tags(qa, 'value')[0]);
    if (!c || !size || !Number.isFinite(v)) continue;
    col(c).q[size] = (col(c).q[size] || 0) + v;
  }
  const bySlug = {};
  for (const m of blocks(mediaXml, 'MediaContent')) {
    const c = unxml(tags(m, 'color')[0] || ''); if (!c) continue;
    const cls = tags(m, 'classTypeName'), urls = tags(m, 'url').map(unxml);
    for (const u of urls) {
      const parts = u.split('/').pop().split('?')[0].toLowerCase().replace(/\.[a-z]+$/, '').split('_');
      if (parts.length > 2 && parts[1]) (bySlug[colorKey(parts[1])] = bySlug[colorKey(parts[1])] || new Set()).add(c);
      // The page still checks each photo is the SAME shot before using it.
      if (cls.includes('Front') && cfg.front.test(u) && !col(c).f) col(c).f = u;
      if (cls.includes('Rear') && cfg.back.test(u) && !col(c).b) col(c).b = u;
    }
  }
  const alias = {};
  // A filename key only when it names exactly one colour. SanMar sometimes
  // lists ONE colour twice under two spellings ("Ht Kelly Green" and
  // "HtKllyGrn", measured on DT6100), each holding part of the size run.
  // Those show the SAME front photo, so a key naming several colours that all
  // share one photo is one garment: its stock is MERGED, once, into the
  // listing with the most sizes. A key shared by DIFFERENT garments ("black"
  // on Black/Gold and on a plaid) is dropped: borrowing a neighbour's stock or
  // photo is worse than having none.
  const merged = {};
  for (const [k, set] of Object.entries(bySlug)) {
    const all = [...set];
    if (all.length === 1) { alias[k] = all[0]; continue; }
    const f0 = colors[all[0]] && colors[all[0]].f;
    const same = f0 && all.every((c) => colors[c] && colors[c].f === f0);
    const live = all.filter((c) => colors[c] && Object.keys(colors[c].q).length);
    if (!same || !live.length) continue;
    const group = live.slice().sort().join('|');
    if (!merged[group]) {
      const primary = live.slice().sort((x, y) => Object.keys(colors[y].q).length - Object.keys(colors[x].q).length)[0];
      const q = {};
      for (const c of live) for (const [sz, v] of Object.entries(colors[c].q)) q[sz] = (q[sz] || 0) + v;
      colors[primary] = { ...colors[primary], q };
      merged[group] = primary;
    }
    alias[k] = merged[group];
  }
  // ...and the supplier's own names always win.
  for (const c of Object.keys(colors)) alias[colorKey(c)] = c;
  return { colors, alias };
}

// One style from one supplier, through a 30 minute cache. write:false is for
// the availability sweep, which must not spend a KV write per style.
export async function supplierFor(env, style, sup = 'sanmar', { write = true } = {}) {
  const cfg = SUPPLIERS[sup];
  style = String(style || '').trim().toUpperCase();
  if (!cfg || !/^[A-Z0-9-]{2,20}$/.test(style)) return { error: 'Not a style code' };
  if (!hasLogin(env, sup)) return { error: cfg.name + ' login is not set on the Worker' };
  const key = cfg.prefix + style;
  const hit = await env.CATALOG.get(key, 'json');
  if (hit) return hit;
  const [inv, media] = await Promise.all([
    soap(env, cfg, cfg.inv, INV_NS, 'GetInventoryLevelsRequest', '2.0.0', '<shar:productId>' + esc(style) + '</shar:productId>', 'getInventoryLevels'),
    soap(env, cfg, cfg.media, MEDIA_NS, 'GetMediaContentRequest', '1.1.0', '<shar:mediaType>Image</shar:mediaType><shar:productId>' + esc(style) + '</shar:productId>', 'getMediaContent'),
  ]);
  const out = { at: new Date().toISOString(), sup, ...parseSupplier(inv, media, sup) };
  // A supplier reports a problem as a message inside an ordinary 200 reply,
  // not as a fault, so say what it said. And never cache a failure: a
  // hiccup must not stick for half an hour.
  if (!Object.keys(out.colors).length) {
    const said = tags(inv, 'description').map(unxml).filter(Boolean).slice(0, 2).join(' | ');
    return { error: cfg.name + ' sent no stock for ' + style + (said ? ': ' + said : '') };
  }
  if (write) await env.CATALOG.put(key, JSON.stringify(out), { expirationTtl: SUPPLIER_TTL });
  return out;
}

const listParam = (url, k) => [...new Set(String(url.searchParams.get(k) || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];

// GET /team-requests/supplier?styles=PC380,DT6100&cra=5726  (staff, write secret)
// `styles` are SanMar's, `cra` Charles River's; the page knows which is which
// from where the catalog's swatches are hosted.
export async function handleSupplier(request, env) {
  const url = new URL(request.url);
  const jobs = [...listParam(url, 'styles').map((s) => [s, 'sanmar']), ...listParam(url, 'cra').map((s) => [s, 'cra'])].slice(0, 30);
  if (!jobs.length) return { status: 400, body: { error: 'Which styles?' } };
  if (jobs.every(([, sup]) => !hasLogin(env, sup))) return { status: 503, body: { error: 'No supplier login is set on the Worker' } };
  const out = {};
  // A few at a time: these services are not fast and a store has dozens.
  for (let i = 0; i < jobs.length; i += 4) {
    await Promise.all(jobs.slice(i, i + 4).map(async ([s, sup]) => {
      try { out[s] = await supplierFor(env, s, sup); } catch (e) { out[s] = { error: String(e.message || e).slice(0, 200) }; }
    }));
  }
  return { body: { styles: out } };
}

// ---------- availability for the CUSTOMER builder ----------
// The builder shows every product's colours the moment it opens, so it needs
// all 161 styles at once, and asking the suppliers live for 161 styles takes
// about two minutes. A sweep on the Worker's 15 minute tick refreshes the 20
// stalest styles into ONE snapshot, so a full pass takes about two hours and
// the builder reads one small key. Stock levels are not sensitive; they are
// what a supplier's own site shows a logged in dealer.
export const AVAIL_KEY = 'supplier:avail';
export const LOW_STOCK = 24; // the same threshold as TeamReqUtils.LOW_STOCK

// out: a core size (S to XL, or every size when it has none) at zero.
// low: one under LOW_STOCK. Judged on the supplier's own size run.
export function stateOf(q) {
  const sizes = Object.keys(q || {});
  let core = sizes.filter((s) => ['S', 'M', 'L', 'XL'].includes(s));
  if (!core.length) core = sizes;
  if (!core.length) return 'ok';
  if (core.some((s) => q[s] === 0)) return 'out';
  if (core.some((s) => q[s] < LOW_STOCK)) return 'low';
  return 'ok';
}

// Alias key -> 'out' | 'low' for the colours that are not ok. Keyed by the
// join key, so the builder looks up colorKey(its own colour name).
export function availOf(d) {
  const out = {};
  for (const [k, c] of Object.entries(d.alias || {})) {
    const st = stateOf(d.colors[c] && d.colors[c].q);
    if (st !== 'ok') out[k] = st;
  }
  return out;
}

// Which supplier a catalog style comes from: where its swatches are hosted.
export function supplierOfStyle(p) {
  const sw = (p.c || []).map((c) => String(c[1] || ''));
  if (sw.some((u) => u[0] === '^' || /cdnm\.sanmar\.com/.test(u))) return 'sanmar';
  if (sw.some((u) => u[0] === '`' || /charlesriverapparel\.com/.test(u))) return 'cra';
  return null;
}

export async function refreshAvailability(env, catalogUrl, { batch = 20 } = {}) {
  const snap = (await env.CATALOG.get(AVAIL_KEY, 'json')) || { styles: {} };
  const D = await (await fetch(catalogUrl)).json();
  const all = D.cats.flatMap((c) => c.p).map((p) => [p.s, supplierOfStyle(p)]).filter(([, sup]) => sup && hasLogin(env, sup));
  // Stalest first, never-seen first of all.
  all.sort((a, b) => String((snap.styles[a[0]] || {}).at || '').localeCompare(String((snap.styles[b[0]] || {}).at || '')));
  let done = 0, failed = 0;
  for (const [s, sup] of all.slice(0, batch)) {
    try {
      const d = await supplierFor(env, s, sup, { write: false });
      if (d.error) { failed++; continue; } // keep the previous entry: stale beats absent
      snap.styles[s] = { at: d.at, av: availOf(d) };
      done++;
    } catch (e) { failed++; }
  }
  snap.at = new Date().toISOString();
  await env.CATALOG.put(AVAIL_KEY, JSON.stringify(snap));
  return { done, failed, of: all.length };
}

// GET /team-requests/stock/public, for the customer builder. Read only, no
// token, one KV read; the storefront origins get CORS.
export async function handleStockPublic(request, env, cors) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });
  const snap = (await env.CATALOG.get(AVAIL_KEY, 'json')) || { styles: {} };
  const styles = {};
  for (const [s, v] of Object.entries(snap.styles || {})) styles[s] = v.av || {};
  return new Response(JSON.stringify({ at: snap.at || null, styles }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...cors },
  });
}

// GET /team-requests/photo?u=<supplier photo>. Neither supplier's image host
// sends a CORS header, so a browser can SHOW the photos but cannot draw one
// into a canvas it then exports, which is what a mockup is. This passes one
// through, ONLY from the two suppliers' product image libraries: it is not
// an open proxy.
const PHOTO_OK = [
  /^https:\/\/cdnm\.sanmar\.com\/imglib\/mresjpg\/[A-Za-z0-9/_.-]+\.jpg$/i,
  /^https:\/\/www\.charlesriverapparel\.com\/prodimg\/[A-Za-z0-9/_.-]+\.(png|jpe?g)$/i,
];
export async function handlePhoto(request) {
  const u = new URL(request.url).searchParams.get('u') || '';
  if (!PHOTO_OK.some((re) => re.test(u)) || u.includes('..')) {
    return new Response('Not a supplier product photo', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  const r = await fetch(u, { cf: { cacheTtl: 7 * 86400, cacheEverything: true } });
  if (!r.ok) return new Response('The supplier answered ' + r.status, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  return new Response(r.body, {
    headers: { 'Content-Type': r.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=604800', 'Access-Control-Allow-Origin': '*' },
  });
}
