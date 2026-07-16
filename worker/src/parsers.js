'use strict';

// The Run House colorway parser.
//
// One universal title parser handles model, color, and gender for every brand.
// Width is the only genuinely per brand fact, so only the brands that bury width
// inside the SKU (Brooks, HOKA, and New Balance) get a brand specific width rule.
// Everyone else reads width from the title marker.
//
// Output of parseProduct() is the raw, factual breakdown of one product. It does
// NOT decide siblings, that is the grouping step. It just answers: what is the
// style code, color code, gender, model key, color name, and width of this product.
//
// Grouping keys off modelKey + width, both of which come from the title. The SKU
// is only one way to get the style and color codes. A product with a blank or
// odd format SKU still groups: parseProduct recovers the code from the title's
// trailing "(code)" when present, and otherwise synthesizes a stable code from
// the model and color names. A missing SKU is therefore no longer fatal.
//
// House style: no em dashes anywhere, in code or comments. Use commas, periods,
// or the word "to".

// ---------------------------------------------------------------------------
// Brand normalization
// ---------------------------------------------------------------------------
const BRANDS = {
  'asics':        { key: 'ASICS',       titleTokens: ['ASICS'] },
  'brooks':       { key: 'BROOKS',      titleTokens: ['Brooks'] },
  'hoka':         { key: 'HOKA',        titleTokens: ['HOKA ONE ONE', 'HOKA'] },
  'hoka one one': { key: 'HOKA',        titleTokens: ['HOKA ONE ONE', 'HOKA'] },
  'on running':   { key: 'ON',          titleTokens: ['ON Running', 'ON'] },
  'on':           { key: 'ON',          titleTokens: ['ON Running', 'ON'] },
  'puma':         { key: 'PUMA',        titleTokens: ['Puma'] },
  'saucony':      { key: 'SAUCONY',     titleTokens: ['Saucony'] },
  'new balance':  { key: 'NEW_BALANCE', titleTokens: ['New Balance'] },
};

function brandFor(vendor) {
  const k = String(vendor || '').trim().toLowerCase();
  return BRANDS[k] || { key: 'UNKNOWN', titleTokens: [String(vendor || '')] };
}

// ---------------------------------------------------------------------------
// Shared regexes
// ---------------------------------------------------------------------------
const GENDER_RE = /\b(Men'?s|Women'?s|Unisex|Kids'?|Youth|Boys'?|Girls'?)\b/i;

const TITLE_WIDTH_RE =
  /\(\s*(extra ?wide|x-?wide|wide|narrow|[0-9]?[a-e]{1,4})\s*\)|\bwide\b/i;

const WIDTH_SCRUB_RE =
  /\(\s*(?:extra ?wide|x-?wide|wide|narrow|[0-9]?[a-e]{1,4})\s*\)/gi;

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Lowercase, hyphenated, alnum only. Used to synthesize a stable style or color
// code from the title when the SKU has none. Same input always gives the same
// code, so two colorways of one model produce one shared synthetic style code.
function slugForCode(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function canonGender(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.startsWith('men')) return "Men's";
  if (s.startsWith('women')) return "Women's";
  if (s.startsWith('unisex')) return 'Unisex';
  if (s.startsWith('youth')) return 'Youth';
  if (s.startsWith('kid')) return "Kids'";
  if (s.startsWith('boy')) return "Boys'";
  if (s.startsWith('girl')) return "Girls'";
  return raw;
}

function normWidthLabel(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[()]/g, '').trim().toUpperCase();
  const map = {
    'WIDE': 'WIDE',
    'EXTRA WIDE': 'XWIDE', 'EXTRAWIDE': 'XWIDE', 'X-WIDE': 'XWIDE', 'XWIDE': 'XWIDE',
    'NARROW': 'NARROW',
  };
  return map[s] || s;
}

// ---------------------------------------------------------------------------
// Title parser (universal)
// ---------------------------------------------------------------------------
function parseTitle(title, brand) {
  const t = String(title || '').trim();

  // Lift a trailing " - <width>" segment (optionally with a code in parens) off
  // the end before splitting, so a "Model - Color - Width (2E)" title splits on
  // the color rather than on the width. Width detection below still reads the
  // original title, so the lifted width is not lost. A tail is treated as width
  // only when nothing but a width word and/or a parenthetical remains.
  let tBody = t;
  const ld = t.lastIndexOf(' - ');
  if (ld >= 0) {
    const tail = t.slice(ld + 3).trim();
    const tailNoWidth = tail
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(extra ?wide|x-?wide|wide|narrow)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (tailNoWidth === '' && /\b(wide|narrow)\b/i.test(tail)) tBody = t.slice(0, ld).trim();
  }

  let pre, color;
  const tSplit = tBody.replace(/\s*\(([^)]{5,})\)\s*$/, (mm, inner) => (/\d/.test(inner) ? '' : mm)).trim();
  const sd = tSplit.lastIndexOf(' - ');
  if (sd >= 0) {
    pre = tSplit.slice(0, sd);
    color = tSplit.slice(sd + 3);
  } else {
    let m = tSplit.match(/^(.*?\d+\s*(?:x-?wide|extra ?wide|wide|narrow)?)\s*-\s*(\S.*)$/i);
    if (!m) m = tSplit.match(/^(.*?\S)(?:\s+-\s*|\s*-\s+)(\S.*)$/);
    if (m) { pre = m[1]; color = m[2]; }
    else { pre = tSplit; color = ''; }
  }

  // No separator at all: the color is glued to the model by a space, eg
  // "Cloudrunner 2 Eclipse/Black" or "Cloudmonster 2 Asphalt Lime", sometimes
  // with a width stuck on the end. Strip a trailing width word, then split after
  // the model version number (the last token containing a digit). A deny list
  // keeps sub-model phrases like "LITE SHOW" from being read as a color. This
  // only fires when nothing else found a color, so it cannot touch the clean
  // "Model - Color" titles that already parse.
  if (!color) {
    const body = tSplit.replace(/\s*\b(extra ?wide|x-?wide|wide|narrow)\b\s*$/i, '').trim();
    const toks = body.split(/\s+/);
    let li = -1;
    for (let i = 0; i < toks.length; i++) if (/\d/.test(toks[i])) li = i;
    if (li >= 0 && li < toks.length - 1) {
      const cand = toks.slice(li + 1).join(' ').replace(/[-\s]+$/, '').trim();
      const NONCOLOR = /^(lite show|af pkl|running shoes?|shoes?|trail|sneakers?)$/i;
      if (cand && !NONCOLOR.test(cand)) { pre = toks.slice(0, li + 1).join(' '); color = cand; }
    }
  }

  const gm = pre.match(GENDER_RE) || t.match(GENDER_RE);
  const gender = gm ? canonGender(gm[1]) : null;

  const wm = t.match(TITLE_WIDTH_RE);
  const titleWide = !!wm;
  const titleWidthCode = wm ? normWidthLabel(wm[1] || wm[0]) : null;

  color = color
    .replace(WIDTH_SCRUB_RE, '')
    .replace(/\s*\([^)]*\d[^)]*\)\s*$/, '')
    .replace(/\s*\bwide\b\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  let model = pre.replace(WIDTH_SCRUB_RE, '').replace(/\bwide\b/gi, '');
  for (const tok of brand.titleTokens) {
    if (tok) model = model.replace(new RegExp('\\b' + escapeRe(tok) + '\\b', 'i'), ' ');
  }
  const modelGenderless = model.replace(GENDER_RE, ' ').replace(/\s+/g, ' ').trim();
  const modelGendered = gender ? (gender + ' ' + modelGenderless).trim() : modelGenderless;

  return {
    gender,
    colorName: color,
    modelKey: modelGendered,
    modelKeyGenderless: modelGenderless,
    titleWide,
    titleWidthCode,
  };
}

// ---------------------------------------------------------------------------
// Per brand SKU shape
// ---------------------------------------------------------------------------
const BROOKS_WIDTH = /^(2A|B|D|2E|4E|6E|EE|EEEE)$/i;
const HOKA_WIDTH = /(EEEE|EE|2E|4E|[B-E])$/i;

const SKU_PARSERS = {
  ASICS(sku) {
    const p = sku.split('-');
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth: null };
  },
  PUMA(sku) {
    const p = sku.split('-');
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth: null };
  },
  SAUCONY(sku) {
    const p = sku.split('-');
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth: null };
  },
  ON(sku) {
    const p = sku.replace(/^ON-/i, '').split('-');
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth: null };
  },
  BROOKS(sku) {
    const p = sku.split('-');
    const last = p[p.length - 1] || '';
    const skuWidth = BROOKS_WIDTH.test(last) ? last.toUpperCase() : null;
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth };
  },
  HOKA(sku) {
    const p = sku.split('-');
    const sizeTok = p[p.length - 1] || '';
    let skuWidth = null;
    if (/\d/.test(sizeTok)) {
      const m = sizeTok.match(HOKA_WIDTH);
      if (m) skuWidth = m[1].toUpperCase();
    }
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth };
  },
  NEW_BALANCE(sku) {
    const p = sku.split('-');
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth: null };
  },
  UNKNOWN(sku) {
    const p = sku.split('-');
    return { styleCode: p[0] || null, colorCode: p[1] || null, skuWidth: null };
  },
};

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------
// parseProduct({ title, sku, vendor }) -> the factual breakdown of one product.
//   width        resolved width code, used as part of the swatch grouping key
//   widthSource  where the width came from: 'sku', 'title', or 'default'
//   codeSource   where style/color came from: 'sku', 'title-code', or 'title-synth'
//   warnings     soft problems worth logging during a backfill run
function parseProduct(input) {
  const { title, sku, vendor } = input || {};
  const brand = brandFor(vendor);
  const warnings = [];

  const t = parseTitle(title, brand);
  const skuParse = (SKU_PARSERS[brand.key] || SKU_PARSERS.UNKNOWN)(String(sku || ''));

  // Style and color codes. The SKU is the preferred source. When it yields no
  // usable code (blank, or a format the brand parser does not split, like a
  // single token New Balance or dotted On code), recover the code from the
  // title's trailing "(code)", then fall back to a synthesized code. Grouping
  // keys off modelKey + width, not these codes, so this only affects metafields
  // and dedupe, never which group a product lands in.
  let { styleCode, colorCode, skuWidth } = skuParse;
  let codeSource = (styleCode && colorCode) ? 'sku' : null;

  if (!styleCode || !colorCode) {
    const paren = String(title || '').match(/\(([^)]*\d[^)]*)\)\s*$/);
    if (paren) {
      const cand = (SKU_PARSERS[brand.key] || SKU_PARSERS.UNKNOWN)(paren[1].trim());
      if (cand.styleCode && cand.colorCode) {
        styleCode = styleCode || cand.styleCode;
        colorCode = colorCode || cand.colorCode;
        if (cand.skuWidth && !skuWidth) skuWidth = cand.skuWidth;
        codeSource = codeSource || 'title-code';
      }
    }
  }
  if (!styleCode || !colorCode) {
    if (t.modelKey && t.colorName) {
      styleCode = styleCode || ('T-' + slugForCode(t.modelKey));
      colorCode = colorCode || slugForCode(t.colorName);
      codeSource = codeSource || 'title-synth';
    }
  }

  // Resolve width. A textual title marker (Wide, Extra Wide, Narrow) is gender
  // proof and wins over a SKU letter code, whose meaning shifts by gender.
  let width = 'STD';
  let widthSource = 'default';
  const titleTextual = t.titleWidthCode && /^(WIDE|XWIDE|NARROW)$/.test(t.titleWidthCode);
  if (titleTextual) {
    width = t.titleWidthCode;
    widthSource = 'title';
  } else if (skuWidth) {
    width = skuWidth;
    widthSource = 'sku';
  } else if (t.titleWidthCode) {
    width = t.titleWidthCode;
    widthSource = 'title';
  } else if (t.titleWide) {
    width = 'WIDE';
    widthSource = 'title';
  }

  // Grouping essentials are the model key and color name. Style and color codes
  // are recovered or synthesized above, so a missing SKU is no longer fatal. We
  // still log soft warnings so a backfill run can surface anything odd.
  if (!t.modelKeyGenderless) warnings.push('empty model key');
  if (!t.colorName) warnings.push('no color name parsed from title');
  if (!skuParse.styleCode) warnings.push('no style code parsed from SKU');
  if (!skuParse.colorCode) warnings.push('no color code parsed from SKU');
  if (codeSource && codeSource !== 'sku') warnings.push('code source: ' + codeSource);

  const ok = !!(t.modelKeyGenderless && t.colorName && styleCode && colorCode);

  return {
    ok,
    brand: brand.key,
    styleCode,
    colorCode,
    codeSource,
    gender: t.gender,
    colorName: t.colorName,
    modelKey: t.modelKey,                     // gendered, eg "Women's Triumph 24"  (width axis)
    modelKeyGenderless: t.modelKeyGenderless, // eg "Triumph 24"                    (gender axis)
    width,
    widthSource,
    warnings,
  };
}

// PORTED to ESM for the Cloudflare Worker. The body above is byte-for-byte the
// Color Swatch parsers.js. Only this export line differs, so `npm run parity`
// can diff the two and fail if they drift. Do not edit one without the other.
export { parseProduct, parseTitle, brandFor, BRANDS };