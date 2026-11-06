// SanMar supplier data for team store requests: live stock per colour and
// size, and each colour's high resolution flat photos. Read only, through
// SanMar's PromoStandards web services, with the login in the Worker
// secrets SANMAR_USER and SANMAR_PASSWORD (never in the page bundle).
//
// Two services, measured 2026-11-06 on PC380:
//   Inventory 2.0.0      one row per colour and size, quantityAvailable is
//                        the total across SanMar's warehouses
//   Media Content 1.1.0  (1.0.0 is refused, "Not Supported") per colour
//                        Front and Rear flats at cdnm.sanmar.com/imglib/mresjpg,
//                        1200 x 1800, the photos Dan's render_mockups.py uses
//
// THE COLOUR JOIN IS THE CAREFUL PART. SanMar abbreviates its colour names
// ("Ath Maroon", "Ht Cardinal", "Tr Nvy/Gld/Wht") where our catalog spells
// them out, so a name match finds about 62%. Its photo FILENAMES spell them
// out though ("PC380_athleticmaroon_flat_front.jpg"), so the second segment
// of a filename is a second key. That segment is not always the colour:
// two-tone and shared photos carry just the first colour ("black" on a
// Black/Gold garment), so a filename key is used ONLY when it points at
// exactly one SanMar colour. An unmatched colour reports no data rather
// than borrowing a neighbour's stock or photo. Measured on 13 styles: 172
// of our colours, 168 joined after the heathered rule below.

const INV_URL = 'https://ws.sanmar.com:8080/promostandards/InventoryServiceBindingV2final';
const MEDIA_URL = 'https://ws.sanmar.com:8080/promostandards/MediaContentServiceBinding';
const INV_NS = 'http://www.promostandards.org/WSDL/Inventory/2.0.0/';
const MEDIA_NS = 'http://www.promostandards.org/WSDL/MediaService/1.0.0/';
export const SUPPLIER_TTL = 30 * 60; // seconds; stock moves, but not by the minute
const PREFIX = 'sanmar:';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One normaliser for both sides of the join. "Heathered Navy" on our side
// is "heathernavy" in SanMar's filenames.
export function colorKey(s) {
  return String(s || '').toLowerCase().replace(/heathered/g, 'heather').replace(/[^a-z0-9]/g, '');
}

// SanMar's size labels in ours.
export function sizeKey(s) {
  const t = String(s || '').trim().toUpperCase();
  return { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL', XXXXXL: '5XL', OSFA: 'One Size' }[t] || String(s || '').trim();
}

const tags = (s, t) => [...s.matchAll(new RegExp('<(?:\\w+:)?' + t + '>([^<]*)<', 'g'))].map((m) => m[1]);
const blocks = (s, t) => [...s.matchAll(new RegExp('<(?:\\w+:)?' + t + '>([\\s\\S]*?)<\\/(?:\\w+:)?' + t + '>', 'g'))].map((m) => m[1]);
const unxml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function soap(env, url, ns, req, version, extra, action) {
  const body = '<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="' + ns + '" xmlns:shar="' + ns + 'SharedObjects/"><soapenv:Header/><soapenv:Body><ns:' + req + '>' +
    '<shar:wsVersion>' + version + '</shar:wsVersion><shar:id>' + esc(env.SANMAR_USER) + '</shar:id><shar:password>' + esc(env.SANMAR_PASSWORD) + '</shar:password>' + extra +
    '</ns:' + req + '></soapenv:Body></soapenv:Envelope>';
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: action }, body });
  const x = await r.text();
  const fault = tags(x, 'faultstring')[0];
  if (!r.ok || fault) throw new Error('SanMar ' + r.status + (fault ? ': ' + fault : ''));
  return x;
}

// Pure: turn the two SOAP replies into { colors, alias }. Exported for the test.
export function parseSupplier(invXml, mediaXml) {
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
      if (!/\/imglib\/mresjpg\//.test(u)) continue;
      // Flats, or form shots (a ghost mannequin, SanMar's women's styles):
      // the kinds of photo our catalog's are. Never a model or a prop shot.
      // The page still checks each one is the SAME shot before using it.
      if (cls.includes('Front') && /_(flat|form)_front\./i.test(u) && !col(c).f) col(c).f = u;
      if (cls.includes('Rear') && /_(flat|form)_back\./i.test(u) && !col(c).b) col(c).b = u;
    }
  }
  const alias = {};
  // A filename key only when it names exactly one SanMar colour. SanMar
  // sometimes lists ONE colour twice under two spellings ("Ht Kelly Green"
  // and "HtKllyGrn", measured on DT6100), each holding part of the size run.
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
  // ...and SanMar's own names always win.
  for (const c of Object.keys(colors)) alias[colorKey(c)] = c;
  return { colors, alias };
}

export async function supplierFor(env, style) {
  style = String(style || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{2,20}$/.test(style)) return { error: 'Not a style code' };
  const key = PREFIX + style;
  const hit = await env.CATALOG.get(key, 'json');
  if (hit) return hit;
  const [inv, media] = await Promise.all([
    soap(env, INV_URL, INV_NS, 'GetInventoryLevelsRequest', '2.0.0', '<shar:productId>' + esc(style) + '</shar:productId>', 'getInventoryLevels'),
    soap(env, MEDIA_URL, MEDIA_NS, 'GetMediaContentRequest', '1.1.0', '<shar:mediaType>Image</shar:mediaType><shar:productId>' + esc(style) + '</shar:productId>', 'getMediaContent'),
  ]);
  const out = { at: new Date().toISOString(), ...parseSupplier(inv, media) };
  // SanMar reports a problem as a message inside an ordinary 200 reply, not
  // as a fault, so say what it said. And never cache a failure: a hiccup
  // must not stick for half an hour.
  if (!Object.keys(out.colors).length) {
    const said = tags(inv, 'description').map(unxml).filter(Boolean).slice(0, 2).join(' | ');
    return { error: 'SanMar sent no stock for ' + style + (said ? ': ' + said : '') };
  }
  await env.CATALOG.put(key, JSON.stringify(out), { expirationTtl: SUPPLIER_TTL });
  return out;
}

// GET /team-requests/supplier?styles=PC380,DT6100  (staff, write secret)
export async function handleSupplier(request, env) {
  if (!env.SANMAR_USER || !env.SANMAR_PASSWORD) return { status: 503, body: { error: 'SanMar login is not set on the Worker' } };  const url = new URL(request.url);
  const styles = [...new Set(String(url.searchParams.get('styles') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  const out = {};
  // A few at a time: SanMar's service is not fast and a store has dozens.
  for (let i = 0; i < styles.length; i += 4) {
    await Promise.all(styles.slice(i, i + 4).map(async (s) => {
      try { out[s] = await supplierFor(env, s); } catch (e) { out[s] = { error: String(e.message || e).slice(0, 200) }; }
    }));
  }
  return { body: { styles: out } };
}

// GET /team-requests/photo?u=<SanMar flat>. SanMar's image CDN sends no CORS
// header, so a browser can SHOW its photos but cannot draw one into a canvas
// it then exports, which is what a mockup is. This passes one through, and
// ONLY SanMar's high resolution image library: it is not an open proxy.
export async function handlePhoto(request) {
  const u = new URL(request.url).searchParams.get('u') || '';
  if (!/^https:\/\/cdnm\.sanmar\.com\/imglib\/mresjpg\/[A-Za-z0-9/_.-]+\.jpg$/i.test(u) || u.includes('..')) {
    return new Response('Not a SanMar product photo', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  const r = await fetch(u, { cf: { cacheTtl: 7 * 86400, cacheEverything: true } });
  if (!r.ok) return new Response('SanMar answered ' + r.status, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
  return new Response(r.body, {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800', 'Access-Control-Allow-Origin': '*' },
  });
}
