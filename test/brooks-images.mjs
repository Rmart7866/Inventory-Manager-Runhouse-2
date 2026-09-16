// brooks-images.mjs, The Run House.
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
// Run: node test/brooks-images.mjs
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
const url = PE._brooksUrl('110442048', 'a');
eq('exact URL', url, 'https://epicurobrooksimages.epicurosaas.com/images/products/brooks__110442048__a.jpg');
yes('no query string', url.indexOf('?') === -1, url);
yes('the thumbnail rendition DOES resize, that is its job', PE._brooksThumbUrl(url).includes('maxWidth=200'));

console.log('\nSix angles, in gallery order, LATERAL first');
eq('six', PE.BROOKS_ANGLES.length, 6);
eq('suffixes, lateral first', PE.BROOKS_ANGLES.map((a) => a.suffix).join(''), 'lamhos');
eq('ranks are 1..6 in order', PE.BROOKS_ANGLES.map((a) => a.rank).join(''), '123456');
const names = PE.BROOKS_ANGLES.map((a) => '110442048_' + String(a.rank).padStart(2, '0') + '_' + a.word + '.jpg');
yes('_angleRank reads the fetcher filenames back in the same order',
    names.map((n) => PE._angleRank(n)).join(',') === '1,2,3,4,5,6',
    names.map((n) => [n, PE._angleRank(n)]));

console.log('\nA remote image is attached by URL and never staged');
PE._imageBrand = 'brooks';
PE._imageIndex = { '110442048': [
  { name: '110442048_01_lateral.jpg', url: PE._brooksUrl('110442048', 'l'), remote: true },
  { name: '110442048_02_angle.jpg', url: PE._brooksUrl('110442048', 'a'), remote: true },
] };
let staged = false;
sandbox.CatalogClient = { stagedUploads: () => { staged = true; return Promise.resolve({ __status: 200, targets: [] }); } };
const spec = { title: 'Ghost 17', handle: 'ghost-17', variants: [{ sku: '110442865-048-750-D' }] };
const out = await PE._attachImages([spec]);
yes('stagedUploads was NOT called', !staged);
eq('two files attached', (out[0].files || []).length, 2);
eq('featured image is the LATERAL', out[0].files[0].originalSource, PE._brooksUrl('110442048', 'l'));
eq('second is the angle shot', out[0].files[1].originalSource, PE._brooksUrl('110442048', 'a'));
yes('alt text is the product title', out[0].files.every((f) => f.alt === 'Ghost 17'), out[0].files);

console.log('\nA colorway with no photos attaches nothing, rather than a 404 URL');
const bare = { title: 'X', variants: [{ sku: '999999999-999-750-D' }] };
const out2 = await PE._attachImages([bare]);
eq('no files', (out2[0].files || []).length, 0);

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
