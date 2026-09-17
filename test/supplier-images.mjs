// supplier-images.mjs, The Run House.
//
// Brooks is the only brand whose photos are attached by URL rather than
// uploaded, and the only one whose image key is COMPOSED from two separated
// halves of the SKU. Both are easy to break silently, so they are pinned here.
//
// WHY THIS MATTERS MORE THAN THE OTHER IMAGE PATHS. A wrong key elsewhere means
// "0 photos matched" and a human notices. A wrong key here means a plausible
// looking code that resolves to SOME OTHER SHOE's photography, and it would be
// attached to a real product without anyone downloading a file to eyeball.
//
// Run: node test/supplier-images.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {
  console, setTimeout, fetch: () => Promise.resolve({ ok: false }),
  localStorage: { getItem: () => null, setItem() {} },
  navigator: {}, location: { href: '' },
  document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
try { vm.runInContext(fs.readFileSync(new URL('../product-enrichment.js', import.meta.url), 'utf8'), sandbox); }
catch { /* the file ends in DOM wiring that a shim cannot satisfy, the object is built by then */ }
const PE = sandbox.ProductEnrichment;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));
const yes = (m, c, x) => (c ? ok(m) : bad(m, x));

console.log('\nThe key is composed from the SKU, not found in it');
eq('style + colour, not the middle token', PE._imageKeyIn('brooks', '110442865-048-750-D'), '110442048');
eq('a different middle, same colour, same code', PE._imageKeyIn('brooks', '110442297-048-950-D'), '110442048');
eq("women's prefix is preserved", PE._imageKeyIn('brooks', '120431070-020-950-B'), '120431020');

console.log('\nAnd read back off the filename the fetcher writes');
eq('hero', PE._imageKeyIn('brooks', '110442048_01_ANGLE.JPG'), '110442048');
eq('a later angle, so "_02_" is not mistaken for the code', PE._imageKeyIn('brooks', '110442048_02_LATERAL.JPG'), '110442048');
eq('round trip: SKU and filename agree',
   PE._imageKeyIn('brooks', '110442865-048-750-D'), PE._imageKeyIn('brooks', '110442048_06_SOLE.JPG'));

console.log('\nNothing that is not a Brooks SKU yields a key');
for (const junk of ['', 'NOT-A-SKU', 'J066641', 'M1080V15_RU', '1234-567-8-D']) {
  eq(JSON.stringify(junk) + ' is no key', PE._imageKeyIn('brooks', junk), '');
}

console.log('\nThe CDN URL carries NO query string, or the resizer shrinks the master');
const BR = PE.remoteSourceFor('brooks');
const url = BR.urlFor('110442048', { id: 'l' });
eq('exact URL', url, 'https://epicurobrooksimages.epicurosaas.com/images/products/brooks__110442048__l.jpg');
yes('no query string', url.indexOf('?') === -1, url);
yes('the thumbnail rendition DOES resize, that is its job', BR.thumbFor(url).includes('maxWidth=200'));

console.log('\nSix angles, in gallery order, LATERAL first');
eq('six', BR.views.length, 6);
eq('ids, lateral first', BR.views.map((v) => v.id).join(''), 'lamhos');
const names = BR.views.map((v, i) => PE._remoteName('110442048', v, i));
eq('names are the "<key>_NN_word" shape the folder tools write', names[0], '110442048_01_lateral.jpg');
yes('_angleRank reads them back in order',
    names.map((n) => PE._angleRank(n)).join(',') === '1,2,3,4,5,6',
    names.map((n) => [n, PE._angleRank(n)]));

console.log('\nThe other two CDN brands build the URL their host expects');
const NB = PE.remoteSourceFor('newbalance');
eq('New Balance lowercases the colorway', NB.urlFor('W880C15', { id: '02' }),
   'https://nb.scene7.com/is/image/NB/w880c15_nb_02_i');
eq('and leads with the lateral', NB.views[0].word, 'lateral');
const AS = PE.remoteSourceFor('asics');
eq('ASICS turns the hyphen into an underscore', AS.urlFor('1012B272-002', { id: 'SR_RT_GLB' }),
   'https://images.asics.com/is/image/asics/1012B272_002_SR_RT_GLB');
eq('a brand with no CDN has no source', PE.remoteSourceFor('hoka'), null);

console.log('\nA remote image is attached by URL and never staged');
PE._imageBrand = 'brooks';
PE._imageIndexFolder = null;
PE._imageIndexRemote = { '110442048': [
  { name: '110442048_01_lateral.jpg', url: BR.urlFor('110442048', { id: 'l' }), remote: true },
  { name: '110442048_02_angle.jpg', url: BR.urlFor('110442048', { id: 'a' }), remote: true },
] };
PE._rebuildImageIndex();
let staged = false;
sandbox.CatalogClient = { stagedUploads: () => { staged = true; return Promise.resolve({ __status: 200, targets: [] }); } };
const spec = { title: 'Ghost 17', handle: 'ghost-17', variants: [{ sku: '110442865-048-750-D' }] };
const out = await PE._attachImages([spec]);
yes('stagedUploads was NOT called', !staged);
eq('two files attached', (out[0].files || []).length, 2);
eq('featured image is the LATERAL', out[0].files[0].originalSource, BR.urlFor('110442048', { id: 'l' }));
eq('second is the angle shot', out[0].files[1].originalSource, BR.urlFor('110442048', { id: 'a' }));
yes('alt text is the product title', out[0].files.every((f) => f.alt === 'Ghost 17'), out[0].files);

console.log('\nA colorway with no photos attaches nothing, rather than a 404 URL');
const bare = { title: 'X', variants: [{ sku: '999999999-999-750-D' }] };
const out2 = await PE._attachImages([bare]);
eq('no files', (out2[0].files || []).length, 0);

console.log('\nPOOLING: a folder fills the colorways the CDN has no photos for');
const remoteTwo = { name: 'AAA111222_01_lateral.jpg', url: 'https://x/a.jpg', remote: true, brand: 'brooks' };
const folderOne = { name: 'BBB333444_01_lateral.jpg' };
PE._imageIndexRemote = { AAA111222: [remoteTwo], SHARED999: [{ name: 'SHARED999_01_lateral.jpg', url: 'https://x/s.jpg', remote: true }] };
PE._imageIndexFolder = { BBB333444: [folderOne], SHARED999: [{ name: 'SHARED999_01_folder.jpg' }] };
const pooled = PE._rebuildImageIndex();
eq('all three colorways are covered', Object.keys(pooled).sort().join(','), 'AAA111222,BBB333444,SHARED999');
yes('a CDN-only colorway keeps the CDN gallery', pooled.AAA111222[0].remote === true);
yes('a folder-only colorway keeps the folder gallery', pooled.BBB333444[0].remote === undefined);
yes('where BOTH have the colorway the FOLDER wins, whole', pooled.SHARED999.every((f) => !f.remote), pooled.SHARED999);
eq('and it is not merged, so no view arrives twice', pooled.SHARED999.length, 1);
const counts = PE.imageSourceCounts();
eq('counts: from the CDN', counts.remote, 1);
eq('counts: from the folder', counts.folder, 2);

console.log('\nSwitching brand drops BOTH halves, or a stale folder outlives its brand');
PE._imageBrand = 'brooks';
PE._resetImagesForBrand('hoka');
yes('folder cleared', !PE._imageIndexFolder);
yes('remote cleared', !PE._imageIndexRemote);

console.log('\nPuma is folder only, and its key survives every SKU shape');
eq('bare SKU', PE._imageKeyIn('puma', '37690803'), '37690803');
eq('SKU with a size on the end', PE._imageKeyIn('puma', '52111301001'), '52111301');
eq('and the same off a filename', PE._imageKeyIn('puma', '37690803_1.JPG'), '37690803');
eq('sized SKU as a filename', PE._imageKeyIn('puma', '52111301001_2.JPG'), '52111301');
eq('a short number is not a key', PE._imageKeyIn('puma', '1234567'), '');
yes('Puma has NO CDN source: a miss there returns 200 with a placeholder, '
    + 'so an existence check cannot be trusted', PE.remoteSourceFor('puma') === null);

console.log('\nEvery brand the tool carries can match a folder');
for (const b of ['on', 'asics', 'hoka', 'saucony', 'merrell', 'newbalance', 'brooks', 'puma']) {
  yes(b + ' has a folder key', !!PE._imageKeyPatterns[b]);
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
