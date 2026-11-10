// brooks-apparel.mjs, The Run House.
//
// Brooks apparel rides the footwear scrape (2026-11-10). Everything in the
// Brooks pipeline was shoe shaped, and each place it bites is pinned here with
// the REAL code: the scraper's size vocabulary (content.js), the converter's
// garment fork (brooks-converter.js, reusing on-converter.js for the size
// ladder and category paths), the picker's Shoes / Apparel tabs
// (brand-picker.js), the photo views (product-enrichment.js), and the Worker's
// apparel classifier, which every garment type must pass or the product cannot
// be read back.
//
// Run: node test/brooks-apparel.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';
import { classify } from '../worker/src/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : bad(m, { got: a, want: b }));
const yes = (m, c, x) => (c ? ok(m) : bad(m, x));
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// A small CSV reader standing in for Papa, header mode, quotes honoured.
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows.shift();
  return { data: rows.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))) };
}

const sb = {
  console: { log() {}, warn() {}, error() {} }, setTimeout, Papa: { parse: (t) => parseCSV(t) },
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  fetch: () => Promise.resolve({ ok: false }),
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } },
};
sb.window = sb; vm.createContext(sb);
// Top level "const X = {...}" in a classic script is not a property of the
// context, so each file is run with its object exported by name.
const load = (f, name) => vm.runInContext(read(f) + `\n;globalThis.${name} = ${name};`, sb);
load('on-converter.js', 'OnConverter');
load('brooks-converter.js', 'BrooksConverter');
load('brand-picker.js', 'BrandPicker');
const B = sb.BrooksConverter;

// ---------- 1. the scraper's size vocabulary ----------
console.log('\nThe scraper reads apparel sizes, and nothing that is not a size');
const src = read('scrapers/brooks/content.js');
const fnSrc = (name) => { const i = src.indexOf('function ' + name + '('); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) return src.slice(i, k + 1); } };
const sizeToken = vm.runInNewContext('(' + fnSrc('brooksSizeToken') + ')');
eq('the live apparel header, XS to XXL', ['XS', 'S', 'M', 'L', 'XL', 'XXL'].map(sizeToken), ['XS', 'S', 'M', 'L', 'XL', 'XXL']);
eq('shoe sizes still read, and now 4.0 and 4.5 too (they used to shift every cell)', ['4.0', '4.5', '7.0', '14.0', '15.0'].map(sizeToken), ['4.0', '4.5', '7.0', '14.0', '15.0']);
eq('bras, one size, tall and paired sizes', ['32C', '34 DD', '30A/B', 'OS', 'One Size', 'LT', 'S/M', '2XL'].map(sizeToken), ['32C', '34DD', '30A/B', 'OS', 'ONE SIZE', 'LT', 'S/M', '2XL']);
eq('never a button, a heading or a stray number', ['Yes', 'Add', 'US', 'Color', '0', '25', ''].map(sizeToken), [null, null, null, null, null, null, null]);
yes('the made up shoe ladder is gone: reading nothing means no rows',
  !/'5\.0', '5\.5', '6\.0'/.test(src) && /No sizes read from the grid header, so no rows/.test(src));
yes('a row with no width label is read as one garment row, not skipped',
  /allInventoryGrids\.length === 1 && brooksIsApparelStyle\(this\.extractFromURL\(\)\) \? \[\{ apparel: true \}\]/.test(src));
yes("WOMEN is tested before MEN (it contains it), so women's stops reading as men's",
  src.indexOf("GENDER-WOMEN") > 0 && src.indexOf("GENDER-WOMEN") < src.indexOf("GENDER-MEN|"));

// ---------- 2. the converter ----------
console.log('\nThe style says garment or shoe, and garment gender');
eq('style first digit', ['110478114-187-1450-D', '221754001-368-M', '300661001-100-XXL', '741543007-001-M'].map((s) => B.isApparelStyle(s)), [false, true, true, true]);
eq("gender from the style: 21 men's, 22 women's, 3 bras women's, accessories unisex",
  ['x-211565001', 'x-221754001', 'x-300661001', 'x-280438223', 'x-741543007', 'x-110478114', 'x-120431070'].map((h) => B.getGender(h)),
  ["Men's", "Women's", "Women's", 'Unisex', 'Unisex', "Men's", "Women's"]);
eq('a garment has no width, even with a letter before its style', B.getWidth('dash-short-black-d-221754001', true), '');

console.log('\nGarment type: short sleeve is a top, not shorts');
const T = {
  'Podium Short Sleeve': 'T-Shirts', 'Dash 2-in-1 Short': 'Shorts', 'Chaser 5" Short 2.0': 'Shorts',
  'Luxe Pocket Bra': 'Sports Bras', 'Dash 1/2 Zip 3.0': 'Half-Zips', 'Dash 1/4 Zip 3.0': 'Half-Zips',
  'Run Visible Half Tight': 'Tights/Leggings', 'Ghost Midweight Socks': 'Socks', 'Notch Thermal Beanie 2.0': 'Headwear',
  'Atmosphere Singlet': 'Tanks', 'Spartan Pant 2.0': 'Pants', 'Canopy Jacket': 'Jackets', 'Luxe Long Sleeve': 'Long Sleeves',
  'Run Visible Insulated Vest': 'Vests', 'Notch Thermal Hoodie 3.0': 'Hoodies', 'Fusion Midweight Glove': 'Gloves',
};
for (const [name, want] of Object.entries(T)) eq(name, B.apparelTypeFor(name), want);
console.log('\nEvery garment type is one the Worker reads back as apparel');
for (const t of new Set(Object.values(T))) eq(t + ' classifies as apparel for Brooks', classify(t, 'Brooks'), 'apparel');

// ---------- 3. a mixed scrape through scan, convert and the product CSV ----------
console.log('\nA mixed scrape: garments and shoes in one file');
const H = 'Handle,Title,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,SKU,HS Code,COO,Location,Bin name,Incoming (not editable),Unavailable (not editable),Committed (not editable),Available (not editable),On hand (current),On hand (new),MSRP';
const row = (h, t, size, sku, q, msrp = '') => [h, '"' + t + '"', 'Size', size, '', '', '', '', sku, '', '', 'Needham', '', '', '', '', '', '', q, msrp].join(',');
const csv = [H,
  // feed order deliberately NOT ladder order
  row('dash-2in1-short-cosmo-221754001', 'Dash 2-in-1 Short - Cosmo', 'XL', '221754001-368-XL', 24, '58.00'),
  row('dash-2in1-short-cosmo-221754001', 'Dash 2-in-1 Short - Cosmo', 'XS', '221754001-368-XS', 25, '58.00'),
  row('dash-2in1-short-cosmo-221754001', 'Dash 2-in-1 Short - Cosmo', 'M', '221754001-368-M', 4, '58.00'),
  row('dash-2in1-short-cosmo-221754001', 'Dash 2-in-1 Short - Cosmo', 'S', '221754001-368-S', 27, '58.00'),
  row('podium-short-sleeve-black-211445001', 'Podium Short Sleeve - Black', 'M', '211445001-001-M', 30, '50.00'),
  row('glycerin-flex-whiteblackgum-110478114', 'Glycerin Flex - White/Black/Gum', '14.0', '110478114-187-1450-D', 100, '170.00'),
].join('\n') + '\n';
const file = { text: async () => csv };
const products = await B.scanFile(file);
const byName = Object.fromEntries(products.map((p) => [p.name, p]));
yes("picker groups: women's short, men's tee, men's shoe", byName["Women's DASH 2-IN-1 SHORT"] && byName["Men's PODIUM SHORT SLEEVE"] && byName["Men's GLYCERIN FLEX"], Object.keys(byName));
eq('garments sit in Apparel, the shoe does not', [byName["Women's DASH 2-IN-1 SHORT"].category, byName["Men's GLYCERIN FLEX"].category === 'Apparel'], ['Apparel', false]);

const tabOf = sb.BrandPicker.configs.brooks.tabOf;
eq('picker tabs: garments to Apparel, shoe to Shoes', [tabOf(byName["Women's DASH 2-IN-1 SHORT"]), tabOf(byName["Men's PODIUM SHORT SLEEVE"]), tabOf(byName["Men's GLYCERIN FLEX"])], ['apparel', 'apparel', 'shoes']);
eq('and from a bare SKU when the flag is absent', [tabOf({ colorways: [{ sku: '300661001-100-XXL' }] }), tabOf({ colorways: [{ sku: '120431070-020-950-B' }] })], ['apparel', 'shoes']);

const inv = await B.convert(file);
console.log('\nPrice: a garment carries FastTrack\'s MSRP, a shoe keeps its own price order');
const pv = Object.fromEntries(B.productVariantData.map(([, v]) => [v.sku, v.msrp]));
eq("the short's MSRP reaches the review screen", pv['221754001-368-M'], '58.00');
eq('the tee too', pv['211445001-001-M'], '50.00');
eq('the shoe gets none, so its live sibling price still wins as before', pv['110478114-187-1450-D'], '');
const bg = read('scrapers/brooks/background.js');
yes('the scraper CSV ends with an MSRP column, filled only with a plain number',
  /"On hand \(new\)",MSRP'\);/.test(bg) && /quantity,\s*\/\^\\d\+\(\\\.\\d\{1,2\}\)\?\$\/\.test\(String\(variant\.msrp/.test(bg));
yes('and never the wholesale price', !/variant\.wsp/.test(bg));
eq('every row converts and keeps Needham', [inv.length, inv.every((r) => r.Location === 'Needham')], [6, true]);
const handles = new Set(inv.map((r) => r.Handle));
const out = B.generateNewProductCSV({ newProducts: [...handles].map((h) => ({ handle: h })), newColorways: [] });
const rowsOut = Array.isArray(out) ? out : (out && out.rows) || parseCSV(String(out)).data;
const first = (pred) => rowsOut.find((r) => r.Title && pred(r));
const short = first((r) => /Dash 2-in-1 Short/.test(r.Title));
const tee = first((r) => /Podium Short Sleeve/.test(r.Title));
const shoe = first((r) => /Glycerin Flex/.test(r.Title));
yes('three products come out', short && tee && shoe, rowsOut.map((r) => r.Title).filter(Boolean));
eq('the short: typed Shorts, NOT a shoe type', short.Type, 'Shorts');
eq('the tee: typed T-Shirts', tee.Type, 'T-Shirts');
eq('the shoe is untouched', shoe.Type, "Men's Shoes");
yes('garment categories are clothing, never the shoes category', !/Shoes/.test(short['Product category']) && /Activewear Pants > Shorts/.test(short['Product category']) && /Shoes/.test(shoe['Product category']));
const tags = (r) => String(r.Tags).split(', ');
yes("the short carries the collection tags: womens apparel, women, Shorts", ['womens apparel', 'women', 'Shorts'].every((t) => tags(short).includes(t)), tags(short));
yes("the tee: mens apparel, men", ['mens apparel', 'men', 'T-Shirts'].every((t) => tags(tee).includes(t)), tags(tee));
yes('the shoe gets no apparel tags', !tags(shoe).some((t) => /apparel/.test(t)), tags(shoe));
const shortHandle = short['URL handle'];
eq('sizes in ladder order, not feed order', rowsOut.filter((r) => r['URL handle'] === shortHandle).map((r) => r['Option1 value']), ['XS', 'S', 'M', 'XL']);
eq('garment title has no width and keeps the gender', short.Title, "Brooks Women's Dash 2-in-1 Short - Cosmo");

// ---------- 4. photos ----------
console.log('\nPhotos: garments use the model and detail views');
const pe = read('product-enrichment.js');
yes('Brooks has apparel views mf, mb, d1, d2, model front first', /apparelViews: \[\s*\{ id: 'mf'[\s\S]*?id: 'mb'[\s\S]*?id: 'd1'[\s\S]*?id: 'd2'/.test(pe));
yes('the style first digit picks shoe or garment views', /viewsFor: function \(code\) \{ return \/\^1\/\.test\(String\(code\)\) \? this\.views : this\.apparelViews; \}/.test(pe));
yes('and the prober asks the source for its views per colourway', /src\.viewsFor \? src\.viewsFor\(c\) : src\.views/.test(pe));

// ---------- 5. presence ----------
console.log('\nA created garment is not offered as new again');
const cc = read('catalog-client.js');
yes('forBrand folds the apparel catalog into the PRESENCE sets', /fetchApparelCatalog\(\)\.then\(function \(cat\)[\s\S]{0,400}res\.existingSkus\.add/.test(cc));
yes('and only those: the removal scope is not touched', !/fetchApparelCatalog\(\)\.then\(function \(cat\)[\s\S]{0,600}res\.colorways\.set/.test(cc));

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
