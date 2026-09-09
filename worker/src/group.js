'use strict';

// The Run House colorway grouping.
//
// Takes parsed products (see parsers.js) and builds the sibling relationships the
// theme renders. It answers three questions per product:
//
//   style_siblings  same shoe, same width class, other colors   (the swatch row)
//   width_siblings  same shoe, same color, other widths         (the width pills)
//   gender_sibling  same model, the other gender                (the "Shop Men's" link)
//
// Plus one helper set the strike feature needs:
//   model_widths    every width class this model+gender comes in (to render all
//                   pills, striking the ones the current color does not exist in)
//
// Width is grouped by CLASS, not raw code, because a few products carry two widths
// as size variants in one listing (Brooks B+D, HOKA EE+D). The class collapses
// those safely while each product keeps its precise code for the pill label.
//
// This module is pure: feed it records, get back a plan. The Admin API write
// (metafieldsSet) lives in the backfill script, not here.
//
// House style: no em dashes. Use commas, periods, or the word "to".

// Map a precise width code to a coarse class used for grouping.
//
// GENDER MATTERS FOR THREE CODES. The men's and women's width ladders are
// offset by one notch, so B, D and 2E name different widths depending on who the
// shoe is for:
//   women's:  2A narrow,   B standard,  D wide,     2E/4E extra wide
//   men's:    2A/B narrow,  D standard,  2E wide,    4E/6E extra wide
// Read gender blind, a men's B narrow and a women's D wide were both called
// standard, which put two different physical widths in one swatch row on the
// PDP: a customer picking "standard" could land on a narrow or a wide shoe.
//
// Three codes shift: B, D and 2E. The rest mean the same on both ladders.
// When gender is unknown the old gender blind answer is kept, so a record with
// no gender groups exactly as it did before.
function widthClass(code, gender) {
  const c = String(code || 'STD').toUpperCase();
  const g = String(gender || '').toUpperCase();
  const womens = g.startsWith('W');
  const mens = !womens && g.startsWith('M');
  if (c === 'B') return mens ? 'narrow' : 'standard';
  if (c === 'D') return womens ? 'wide' : 'standard';
  if (c === '2E') return womens ? 'xwide' : 'wide';
  if (c === 'STD') return 'standard';
  if (c === 'NARROW' || c === '2A' || c === 'A') return 'narrow';
  if (c === 'WIDE' || c === 'EE' || c === 'E') return 'wide';
  if (c === 'XWIDE' || c === '4E' || c === 'EEEE' || c === '6E') return 'xwide';
  return 'standard';
}

// Normalize a string for use as a grouping key (case and spacing insensitive).
function norm(s) {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

// records: array of { id, styleCode, colorCode, gender, colorName, modelKey,
//                     modelKeyGenderless, width, ... } (id is the product ref,
//                     a handle here, a product GID in the live script)
//
// Returns { plan, summary } where plan is id -> {
//   style_siblings, width_siblings, gender_sibling, model_widths,
//   width_code, width_class, color_name
// }
function groupProducts(records) {
  // Decorate each record with its width class and stable normalized keys.
  const recs = records.map((r) => ({
    ...r,
    _wclass: widthClass(r.width, r.gender),
    // Swatch row key: model + gender + width class. Not style code, because some
    // brands (ON) fold the color into the article number, giving every colorway
    // a unique style code and so a group of one. Model + width is the correct
    // definition of "same shoe, different colors" and groups every brand.
    _styleKey: `${norm(r.modelKey)}|${widthClass(r.width, r.gender)}`,
    _colorKey: `${norm(r.modelKey)}|${norm(r.colorName)}`,
    _modelKey: norm(r.modelKey),
    _genderlessKey: norm(r.modelKeyGenderless),
  }));

  // Index by each grouping key.
  const byStyle = new Map();      // styleCode + widthClass  -> [recs]   (swatch row)
  const byColor = new Map();      // model + color           -> [recs]   (same color, all widths)
  const byModel = new Map();      // gendered model          -> Set(widthClass) (pill vocabulary)
  const byGenderless = new Map(); // genderless model        -> [recs]   (gender link)

  for (const r of recs) {
    (byStyle.get(r._styleKey) || byStyle.set(r._styleKey, []).get(r._styleKey)).push(r);
    (byColor.get(r._colorKey) || byColor.set(r._colorKey, []).get(r._colorKey)).push(r);
    (byModel.get(r._modelKey) || byModel.set(r._modelKey, new Set()).get(r._modelKey)).add(r._wclass);
    (byGenderless.get(r._genderlessKey) || byGenderless.set(r._genderlessKey, []).get(r._genderlessKey)).push(r);
  }

  const ids = (arr) => arr.map((x) => x.id);
  const sortByColor = (arr) => [...arr].sort((a, b) => String(a.colorName).localeCompare(String(b.colorName)));

  const plan = {};
  for (const r of recs) {
    // Swatch row: same style + width class, all colors (self included; the
    // snippet highlights the current one).
    const styleGroup = sortByColor(byStyle.get(r._styleKey));

    // Width pills: same model + color, every width (self included). Lets the
    // snippet link each width pill to the matching color.
    const colorGroup = byColor.get(r._colorKey);

    // Gender link: one representative product per OTHER gender of the same
    // genderless model. Prefer a standard-width colorway as the landing page.
    const family = byGenderless.get(r._genderlessKey) || [];
    const otherGenders = new Map();
    for (const o of family) {
      if (o.gender === r.gender || !o.gender) continue;
      const cur = otherGenders.get(o.gender);
      const better = !cur
        || (o._wclass === 'standard' && cur._wclass !== 'standard')
        || (o._wclass === cur._wclass && String(o.id).localeCompare(String(cur.id)) < 0);
      if (better) otherGenders.set(o.gender, o);
    }

    plan[r.id] = {
      gender: r.gender,
      width_code: r.width,
      width_class: r._wclass,
      color_name: r.colorName,
      model_widths: [...(byModel.get(r._modelKey) || [])].sort(),
      style_siblings: ids(styleGroup),
      width_siblings: ids(sortByColor(colorGroup)),
      gender_sibling: [...otherGenders.values()].map((x) => x.id),
    };
  }

  // Summary for backfill logging.
  const summary = {
    products: recs.length,
    swatch_groups: byStyle.size,
    color_groups_with_multiple_widths: [...byColor.values()].filter((g) => {
      const classes = new Set(g.map((x) => x._wclass));
      return classes.size > 1;
    }).length,
    models_with_multiple_widths: [...byModel.values()].filter((s) => s.size > 1).length,
    genderless_models: byGenderless.size,
  };

  return { plan, summary };
}

// PORTED to ESM for the Cloudflare Worker. The body above is byte-for-byte the
// Color Swatch group.js. Only this export line differs, so `npm run parity`
// can diff the two and fail if they drift. Do not edit one without the other.
export { groupProducts, widthClass };