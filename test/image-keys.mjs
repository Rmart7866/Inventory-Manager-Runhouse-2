// image-keys.mjs, The Run House.
//
// THE KEY IS EXTRACTED FROM THE SKU, AND IF THE PATTERN MISSES, THE WHOLE
// BRAND SILENTLY HAS NO PHOTOS.
//
// Stage 4 turns `specs[].variants[0].sku` into a colorway key with
// `_imageKeyIn`, builds urls from it, and HEAD checks each one. A pattern that
// does not match produces NO key, so no url is built, nothing is probed, and
// the dialog reports no images for every product. The failure looks like the
// supplier having no photography, and `loadRemoteImages` swallows errors on
// purpose, so there is nothing in the console either.
//
// That is exactly what happened to PUMA. The pattern was
// /^\d{8}(?=\D|$|\d{3}(?:\D|$))/, requiring the eight digits to be
// CONTIGUOUS, which is true of a bare sku ("37690803") and a sized one
// ("52111301001") but not of what the scraper writes. Measured 2026-10-30
// against a live Puma file, every sku is hyphenated: "312123-14-7". Six
// digits, a dash, and the anchored match fails on all 2,610 of them. The
// photos were there the whole time: once the key was right, 10 of 10 sampled
// colourways returned all 5 views.
//
// So each brand's REAL sku shape is pinned here, offline and in milliseconds.
//
// Run: node test/image-keys.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };

const sb = { window: {}, console: { log() {}, warn() {}, error() {} },
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'product-enrichment.js'), 'utf8'), sb);
const PE = sb.ProductEnrichment || sb.window.ProductEnrichment;
if (!PE) { console.log('  FAIL  could not load ProductEnrichment'); process.exit(1); }

// The shapes each brand's own scraper or converter really emits, plus the
// filename shape the folder indexer sees, which shares this same function.
const CASES = {
  puma: [
    ['312123-14-7', '31212314', 'the hyphenated sku the scraper writes'],
    ['312123-14-7.5', '31212314', 'a half size'],
    ['526651-30-XS', '52665130', 'apparel, a lettered size'],
    ['52111301001', '52111301', 'contiguous plus a size, the old shape'],
    ['37690803', '37690803', 'the bare eight'],
    ['37690803_1.jpg', '37690803', 'a folder filename'],
    ['1234567890123', '', 'a long barcode is not a style'],
    ['12345', '', 'too short'],
  ],
  newbalance: [
    ['W880B15  B  07', 'W880B15', 'the space separated sku the converter emits'],
    ['M880C15  2E 09', 'M880C15', 'a wide width'],
    ['W1080L12  D  06', 'W1080L12', 'a longer model code'],
    ['M880V15_02_i.jpg', 'M880V15', 'a folder filename'],
  ],
  asics: [
    ['1011B890-001-9', '1011B890-001', 'style and colour, size dropped'],
    ['1012B272-002-10.5', '1012B272-002', 'a half size'],
  ],
  brooks: [
    // 110454410-020-750-B is style, COLOUR, size, width. The key is the first
    // six of the style plus the colour, and that distinction is load bearing:
    // 110454410 and 110454020 are BOTH real assets and DIFFERENT colourways,
    // blue against black, so taking the style whole attaches the wrong shoe.
    ['110454410-020-750-B', '110454020', 'six of the style plus the colour, not the style whole'],
    ['110442297-012-700-D', '110442012', 'another colourway'],
  ],
  saucony: [
    ['S20924-16-095', 'S20924-16', 'style and colour'],
    ['S100981-1019_1.jpg', 'S100981-1019', 'the six plus four form, as a filename'],
  ],
};

for (const [brand, cases] of Object.entries(CASES)) {
  console.log('\n' + brand);
  for (const [sku, want, why] of cases) {
    const got = PE._imageKeyIn(brand, sku) || '';
    got === want
      ? ok('"' + sku + '" -> ' + (got || '(none)') + '   ' + why)
      : bad('"' + sku + '"   ' + why, { got: got || '(none)', want: want || '(none)' });
  }
}

console.log('\nEvery brand with a derivable source has a key pattern');
for (const brand of Object.keys(PE.REMOTE_IMAGE_SOURCES)) {
  const src = PE.REMOTE_IMAGE_SOURCES[brand];
  if (src.supplied) { ok(brand + ' is SUPPLIED, so it needs no pattern'); continue; }
  PE._imageKeyPatterns[brand]
    ? ok(brand + ' has one')
    : bad(brand + ' can build urls but cannot extract a key, so it will find nothing');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
