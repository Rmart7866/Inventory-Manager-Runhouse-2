// newbalance-images.mjs, The Run House.
//
// Pins the New Balance photo join. Two codes live in the CDS feed and only one
// of them matches a photo: "Style Number" (M1080V15_RU) is the MODEL, the SKU's
// leading token (W880C15) is the COLORWAY. Joining on the wrong one silently
// attaches zero images to every product, which is exactly the mistake this
// pattern exists to prevent, so it is worth a test.
//
// Also pins the gallery order, because the first image becomes the featured one
// and a shoe whose hero shot is its outsole looks broken on the storefront.
//
// Run: node test/newbalance-images.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// product-enrichment.js is a browser global that touches document only from
// handlers, never at load, so an empty stub is enough to evaluate it.
const sandbox = {
  console,
  window: {},
  document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'product-enrichment.js'), 'utf8'), sandbox);
const PE = sandbox.ProductEnrichment;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

console.log('\nThe colorway key comes off the SKU, not the style number');
eq('SKU "W880C15  D  05"', PE._imageKeyIn('newbalance', 'W880C15  D  05'), 'W880C15');
eq('SKU "M1080B14 B  075"', PE._imageKeyIn('newbalance', 'M1080B14 B  075'), 'M1080B14');
eq('SKU "U7935 D  09"', PE._imageKeyIn('newbalance', 'U7935 D  09'), 'U7935');
eq('SKU "MX608WP5  4E 11"', PE._imageKeyIn('newbalance', 'MX608WP5  4E 11'), 'MX608WP5');
// A style number is shape identical to a colorway code ("M880V15" the model vs
// "M880C15" the colorway), so the pattern cannot reject one. What protects the
// join is that _imageKeyOf reads the variant SKU and never Style Number. Pin
// that instead: the style number keys to something that is in no gallery.
eq('a style number keys to something no photo carries',
   PE._imageKeyIn('newbalance', 'M1080V15_RU') === PE._imageKeyIn('newbalance', 'M10801L7  D  05'), false);
eq('_imageKeyOf reads the variant sku',
   PE._imageKeyOf.call({ _imageBrand: 'newbalance', _imageKeyIn: PE._imageKeyIn, _imageKeyPatterns: PE._imageKeyPatterns },
                       { variants: [{ sku: 'W880C15  D  05' }] }), 'W880C15');

console.log('\nThe same key comes off the converted filename');
eq('M10802FR_1_lateral.jpg', PE._imageKeyIn('newbalance', 'M10802FR_1_lateral.jpg'), 'M10802FR');
eq('U7935_6_outsole.jpg', PE._imageKeyIn('newbalance', 'U7935_6_outsole.jpg'), 'U7935');
// "medial" starts with M and would match the code shape on its own. The anchor
// is what stops it being read as a colorway.
eq('_3_medial does not become the key', PE._imageKeyIn('newbalance', 'W880C15_3_medial.jpg'), 'W880C15');

console.log('\nWidth never reaches the key, so one gallery serves every width');
const widths = ['W880C15  B  07', 'W880C15  D  07', 'W880C15  2E 07', 'W880C15  2A 07'];
const keys = widths.map((s) => PE._imageKeyIn('newbalance', s));
eq('B, D, 2E and 2A all key to W880C15', new Set(keys).size === 1 && keys[0] === 'W880C15', true);

console.log('\nGallery order puts the lateral hero first and the reshoots last');
// The rank is ZERO PADDED by tools/convert-nb-images.mjs, because a colorway can
// carry 18 images and "_10_" would otherwise sort before "_2_". _angleRank has
// to read both, since the padding is what makes a plain filename sort correct.
const files = ['X_11_alt-lateral.jpg', 'X_04_top.jpg', 'X_06_outsole.jpg', 'X_01_lateral.jpg',
               'X_07_lifestyle-a.jpg', 'X_05_back.jpg', 'X_03_medial.jpg', 'X_02_quarter.jpg'];
const sorted = files.slice().sort((a, b) => PE._angleRank(a) - PE._angleRank(b));
eq('sorted order', sorted.join(','),
   'X_01_lateral.jpg,X_02_quarter.jpg,X_03_medial.jpg,X_04_top.jpg,X_05_back.jpg,'
   + 'X_06_outsole.jpg,X_07_lifestyle-a.jpg,X_11_alt-lateral.jpg');
eq('a padded rank past nine still reads as its number', PE._angleRank('X_11_alt-lateral.jpg'), 11);

console.log('\nProducts with photos sort to the top of the create queue');
// Brand agnostic: it keys off whatever _imagesForSpec returns, so every brand
// gets it. A draft with photos is publishable, one without is a job for later,
// and if a run is stopped part way the finished half is what got made.
const queueFiles = ['W880C15_01_lateral.jpg', 'W880C15_02_quarter.jpg', 'M1080B14_01_lateral.jpg']
  .map((n) => ({ name: n, type: 'image/jpeg', size: 1 }));
PE.indexImageFolder(queueFiles, 'newbalance');
const spec = (sku) => ({ handle: sku.toLowerCase(), variants: [{ sku: sku }] });
const queue = [spec('MACR113W  D  09'), spec('W880C15  B  07'), spec('WELPS7EQ  B  07'), spec('M1080B14  D  09')];
PE._sortSpecsByPhotos(queue);
eq('the two with photos come first',
   queue.map((s) => s.variants[0].sku.split(/\s+/)[0]).join(','), 'W880C15,M1080B14,MACR113W,WELPS7EQ');
// A stable sort is what keeps the converter's own order inside each half.
eq('order within the photo-less half is untouched',
   queue.slice(2).map((s) => s.variants[0].sku.split(/\s+/)[0]).join(','), 'MACR113W,WELPS7EQ');
const none = [spec('MACR113W  D  09'), spec('WELPS7EQ  B  07')];
PE._imageIndex = null; PE._imageBrand = null;
PE._sortSpecsByPhotos(none);
eq('with no folder chosen, nothing is reordered',
   none.map((s) => s.variants[0].sku.split(/\s+/)[0]).join(','), 'MACR113W,WELPS7EQ');

console.log('\nOther brands are untouched');
eq('hoka', PE._imageKeyIn('hoka', '1123456-BDGGR_3.png'), '1123456-BDGGR');
eq('asics', PE._imageKeyIn('asics', '1012B939-501-1.jpg'), '1012B939-501');
eq('on', PE._imageKeyIn('on', '3WF30375314-1x1-g1.png'), '3WF30375314');
eq('a brand with no pattern', PE._imageKeyIn('brooks', '110393-1D-060'), '');

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
