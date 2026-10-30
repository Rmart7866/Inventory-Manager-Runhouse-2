// product-title-parts.mjs, The Run House.
//
// ONE PARSER FOR THE PRODUCT TITLE, shared by the alt text and SEO title
// backfills. Both have to split a title the same way, and this repo has been
// bitten enough times by two copies of one rule drifting apart that a shared
// module is cheaper than the test that would otherwise be needed to keep them
// equal.
//
// House style: no em dashes. Use commas, periods, or the word "to".

// A TRAILING CODE IN A TITLE IS NOISE. The store writes accessory and shoe
// titles with the supplier code on the end, "Amphipod AirFlow Lite Pack (235)"
// and "Hoka Cielo X LD Spike (1123097-RYCM)". In alt text a screen reader
// reads it aloud; in an SEO title it spends characters a shopper never
// searched for. It is only treated as a code when it CONTAINS A DIGIT, so a
// real parenthetical like "(Wide Fit)" survives.
export const TRAILING_CODE = /\s*\((?=[^)]*\d)[A-Za-z0-9][A-Za-z0-9.\- ]*\)\s*$/;

// THE COLOUR SEPARATOR IS A HYPHEN FOLLOWED BY A SPACE, and the capture is
// GREEDY so it splits at the LAST one.
//
// Both details came out of real dry runs. The store is mostly consistent about
// "<model> - <colour>" but HOKA writes "Cielo X 2 MD- Ceramic" with no space
// before the hyphen, so requiring a space on both sides misses it. And a lazy
// capture splits at the FIRST hyphen, which turned
// "Gasparilla 2026 - ASICS Men's Short Sleeve Tee - Celadon" into a product
// called "Gasparilla 2026" in a colour called "ASICS Men's Short Sleeve Tee".
//
// Requiring a space AFTER the hyphen is what leaves hyphenated NAMES alone:
// "Ergo-Lite" and "3-Pack" have none.
const COLOUR_SPLIT = /^(.*)\s*-\s+([^-]*)$/;

export function titleParts(title) {
  const clean = String(title || '').replace(TRAILING_CODE, '').trim();
  if (!clean) return { model: '', colour: '' };
  const m = COLOUR_SPLIT.exec(clean);
  return m ? { model: m[1].trim(), colour: m[2].trim() } : { model: clean, colour: '' };
}

// A NOUN IS ONLY ADDED WHEN WE ARE SURE WHAT THE THING IS.
//
// Measured 2026-10-30, the products with no SEO title carry 205 DISTINCT
// product types, and the tail is full of values that are not nouns at all:
// "Premiums Sport" (120), "Inventory" (52), "Companions" (18), "Big Kahuna"
// (18), "Campeones" (16), which are Collective marketplace categories. An
// earlier pass appended the type to everything and produced "AirFlow Lite Pack
// Storage" and "Clip Light Visibility", which reads as keyword stuffing.
//
// So this is an ALLOWLIST and the default is nothing. A title with no noun is
// still a perfectly good title; a title with the wrong noun is worse than
// both.
const NOUNS = {
  spikes: 'Track Spikes',
  socks: 'Running Socks',
  sunglasses: 'Sunglasses', sunglass: 'Sunglasses',
  sandals: 'Sandals',
  'insoles & inserts': 'Insoles',
  't-shirts': 'T-Shirt', 'short sleeve': 'Short Sleeve Shirt',
  'long sleeves': 'Long Sleeve Shirt',
  hoodies: 'Hoodie', crewnecks: 'Crewneck', 'half-zips': 'Half-Zip',
  jackets: 'Jacket', vests: 'Vest',
  shorts: 'Shorts', pants: 'Pants', 'tights/leggings': 'Leggings',
  tanks: 'Tank Top', 'sports bras': 'Sports Bra',
};

export function nounFor(productType) {
  const ty = String(productType || '').trim();
  if (/shoes?$/i.test(ty)) return 'Running Shoes';
  const key = ty.toLowerCase().replace(/^(men's|women's|unisex|kids'|youth)\s+/i, '');
  return NOUNS[key] || '';
}

// Does the model text already say what the thing is? "Women's Jersey Long
// Sleeve T-Shirt" needs no "T-Shirt" appended, and "Brooks Running Shoes
// Ghost" needs no "Running Shoes".
export function alreadySays(model, noun) {
  if (!noun) return true;
  const last = noun.split(' ').pop().replace(/s$/i, '');
  return new RegExp('\\b' + last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?\\b', 'i').test(model);
}
