// /store-wall: depth rule, one card per model, deepest first, never units,
// unknown shop is empty rather than an error.
import assert from 'node:assert/strict';
import { wallFor, MIN_SIZES } from '../src/store-wall.js';

const st = (h, m, n, t = h) => ({ h, t, img: 'https://x/' + h + '.jpg', v: 'HOKA', m, w: 'standard', s: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(6 + i), 2])) });
const cov = { at: 'x', locations: [
  { name: 'Walpole', women: { styles: [st('clifton-black', 'clifton-11', 9), st('clifton-white', 'clifton-11', 7), st('bondi', 'bondi-9', 5), st('thin', 'arahi-9', MIN_SIZES - 1)] }, men: { styles: [] } },
  { name: 'Falmouth', women: { styles: [] }, men: { styles: [st('ghost', 'ghost-18', 6)] } },
] };

const w = wallFor(cov, 'walpole');
assert.equal(w.shop, 'Walpole');
assert.deepEqual(w.women.map((s) => s.h), ['clifton-black', 'bondi'], 'one per model, deepest first, thin left out');
assert.ok(!('s' in w.women[0]), 'sizes are never sent');
assert.deepEqual(wallFor(cov, 'Falmouth').men.map((s) => s.h), ['ghost']);
assert.equal(wallFor(cov, 'needham'), null, 'a shop with no coverage is null');
console.log('store-wall: ok');
