// GET /store-wall?shop=walpole  (public, read only)
//
// "On the shoe wall at Walpole" for the storefront's store pages: the shoes
// that shop has the most sizes of ON ITS SHELF, from the nightly size
// coverage (size-coverage.js, KV `sizecoverage`), which already holds every
// shop's shelf stock per style. Shopify gives a theme per-store stock on
// product pages only, which is why this comes from here.
//
// Public on purpose, like /team-requests/stock/public: an anonymous shopper's
// browser calls it from therunhouse.com. It returns names, photos and handles
// only, never units or size counts, so it says what is on a wall and nothing
// about how much. One KV read; at most a day old, the same as the data.
//
// Rules: a style must have at least MIN_SIZES sizes on that shelf (the owner's
// rule that anything advertised has real depth), one card per model (the
// cw-group model, so five colourways of one shoe are one card), the deepest
// first, up to MAX per gender. Needham never appears: the coverage leaves it
// out because its stock is the suppliers', not a shelf.
import { SIZES_KEY } from './size-coverage.js';

export const MIN_SIZES = 4;
export const MAX = 8;

// Pure: the wall for one shop out of the stored coverage.
export function wallFor(coverage, shop) {
  const want = String(shop || '').trim().toLowerCase();
  const loc = (coverage && coverage.locations || []).find((l) => String(l.name || '').toLowerCase() === want);
  if (!loc) return null;
  const pick = (g) => {
    // s is { size: units on the shelf }; depth is how many sizes are there.
    const n = (s) => (s && s.s && typeof s.s === 'object' ? Object.keys(s.s).length : 0);
    const styles = ((loc[g] && loc[g].styles) || []).filter((s) => n(s) >= MIN_SIZES);
    styles.sort((a, b) => n(b) - n(a) || String(a.t).localeCompare(String(b.t)));
    const seen = new Set(), out = [];
    for (const s of styles) {
      const key = s.m || s.h;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ h: s.h, t: s.t, img: s.img || '', v: s.v || '' });
      if (out.length >= MAX) break;
    }
    return out;
  };
  return { shop: loc.name, women: pick('women'), men: pick('men') };
}

export async function handleStoreWall(request, env, cors) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
  const shop = new URL(request.url).searchParams.get('shop') || '';
  const hit = await env.CATALOG.get(SIZES_KEY, 'json');
  const wall = hit ? wallFor(hit, shop) : null;
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', ...cors };
  if (!wall) return new Response(JSON.stringify({ shop, women: [], men: [] }), { status: 200, headers });
  return new Response(JSON.stringify({ at: hit.at, ...wall }), { status: 200, headers });
}
