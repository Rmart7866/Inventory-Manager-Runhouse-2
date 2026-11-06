// Shoe size coverage per location: for each shop, gender and size, how many
// units sit on the shelf and how many of the styles that shop carries have
// that size in stock. "Women's 8 at Falmouth: 12 of 40 styles" is the
// question staff ask, so styles carried is the denominator, not the catalog.
//
// It is computed INSIDE the nightly catalog rebuild, from the bulk file that
// rebuild already reads (every footwear variant's on hand at every location),
// so it costs Shopify nothing extra and is at most a day old (the Refresh
// button on the inventory tool rebuilds it too). Stored under its own key,
// written after the two catalogs and inside its own try, so a failure here can
// never disturb them.
//
// Needham is left out: it is the DROPSHIP location and its numbers are the
// suppliers' stock, not a shelf. Only the "Men's Shoes" and "Women's Shoes"
// types count, the same as the reset page's shoe buttons; Unisex and Kids'
// are separate types and would blur both columns.

export const SIZES_KEY = 'sizecoverage';

// "9.0" and "9" are one size; the store spells both (see CLAUDE.md). Anything
// that is not a plain number or half size (a width, "One Size") is not a shoe
// size here.
export function normSize(s) {
  const t = String(s || '').trim().replace(/\.0+$/, '').replace(/^(\d+)\.50*$/, '$1.5');
  return /^\d{1,2}(\.5)?$/.test(t) ? t : null;
}

export function genderOf(productType) {
  const t = String(productType || '').trim().toLowerCase();
  if (t === "men's shoes" || t === 'mens shoes') return 'men';
  if (t === "women's shoes" || t === 'womens shoes') return 'women';
  return null;
}

// Fed one inventory level at a time by the catalog assembler. Pure.
export function makeSizeAccumulator(skipLocationIds = []) {
  const skip = new Set(skipLocationIds.filter(Boolean));
  // loc -> gender -> handle -> { t, img, sizes: Map(size -> units) }
  const data = new Map();
  const onLevel = (p, rawSize, locationId, qty) => {
    if (!locationId || skip.has(locationId)) return;
    const g = genderOf(p.productType), size = normSize(rawSize);
    if (!g || !size || !(qty > 0)) return; // only what is on a shelf
    let byG = data.get(locationId); if (!byG) data.set(locationId, (byG = { men: new Map(), women: new Map() }));
    let st = byG[g].get(p.handle); if (!st) byG[g].set(p.handle, (st = { t: p.title, img: p.image || '', sizes: new Map() }));
    st.sizes.set(size, (st.sizes.get(size) || 0) + qty);
  };
  const result = () => {
    const out = {};
    for (const [loc, byG] of data) {
      out[loc] = {};
      for (const g of ['men', 'women']) {
        const styles = [], sizes = {};
        for (const [h, st] of byG[g]) {
          const inStock = {};
          for (const [sz, u] of st.sizes) {
            inStock[sz] = u;
            sizes[sz] = sizes[sz] || { units: 0, styles: 0 };
            sizes[sz].units += u; sizes[sz].styles += 1;
          }
          styles.push({ h, t: st.t, img: st.img, s: inStock });
        }
        styles.sort((a, b) => a.t.localeCompare(b.t));
        out[loc][g] = { carried: styles.length, sizes, styles };
      }
    }
    return out;
  };
  return { onLevel, result };
}

// After the rebuild: name the locations and store. Separate from the catalog
// writes on purpose.
export async function writeSizeCoverage(env, client, sizes) {
  if (!sizes) return null;
  const r = await client.graphql('{ locations(first: 50){ nodes{ id name isActive } } }');
  const names = new Map(r.data.locations.nodes.filter((l) => l.isActive).map((l) => [l.id, l.name]));
  const locations = Object.entries(sizes).filter(([id]) => names.has(id))
    .map(([id, v]) => ({ id, name: names.get(id), men: v.men, women: v.women }))
    .sort((a, b) => (b.men.carried + b.women.carried) - (a.men.carried + a.women.carried));
  const body = JSON.stringify({ at: new Date().toISOString(), locations });
  await env.CATALOG.put(SIZES_KEY, body);
  return { locations: locations.length, bytes: body.length };
}

// GET /sizes  (staff, write secret): the last stored coverage.
export async function handleSizes(request, env) {
  const hit = await env.CATALOG.get(SIZES_KEY, 'json');
  if (!hit) return { status: 404, body: { error: 'No size data yet. It is built with the nightly catalog refresh, or press Refresh in the inventory tool.' } };
  return { body: hit };
}
