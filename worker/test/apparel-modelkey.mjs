// apparel-modelkey.mjs, The Run House.
//
// Apparel is dropshipped as of 2026-10-16 and runs through the same known set,
// picker and zeroing as footwear. Footwear groups colorways on modelKey, which
// is parsed into a model, gender, width class and cw-group. A sports bra has
// no width class, so apparel needs its own, much smaller, grouping key.
//
// The risk this pins is OVER-GROUPING. Two different garments collapsing to one
// key would group unrelated products in the picker, and under the zeroing path
// that is not cosmetic.
//
// Run: node worker/test/apparel-modelkey.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { apparelModelKey } from '../src/catalog.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

console.log('\nThe trailing article code or colour number comes off');
eq('article code', apparelModelKey('ON Focus-T MEN (1ME11460069)'), 'ON FOCUS-T MEN');
eq('colour number', apparelModelKey('On active Bra W (258)'), 'ON ACTIVE BRA W');

console.log('\nThe colorway suffix after a spaced dash comes off');
eq('colour suffix', apparelModelKey('ON 5" Running Shorts - Auburn/Ruby'), 'ON 5" RUNNING SHORTS');
eq('en dash too', apparelModelKey('ON Climate Shirt – Fade'), 'ON CLIMATE SHIRT');

console.log('\nCase is folded, because the store is inconsistent about it');
eq('"On active Bra" and "ON Active Bra" agree',
   apparelModelKey('On active Bra W'), apparelModelKey('ON Active Bra W'));

console.log('\nA hyphen INSIDE a name is not a colorway separator');
// "Focus-T" and "Performance-T" are product names. Splitting on a bare hyphen
// would leave "ON FOCUS" and group two different garments together.
eq('Focus-T survives', apparelModelKey('ON Focus-T MEN'), 'ON FOCUS-T MEN');
eq('Performance-T survives', apparelModelKey('ON Performance-T 3 MEN'), 'ON PERFORMANCE-T 3 MEN');
if (apparelModelKey('ON Focus-T MEN') !== apparelModelKey('ON Performance-T 3 MEN')) ok('and the two do not collide');
else bad('Focus-T and Performance-T collapsed together');

console.log('\nDifferent garments keep different keys');
{
  const titles = ['ON Performance Bra W (258)', 'ON Train Bra W (104)', 'ON Focus-T MEN (1ME11460069)',
    'ON Track Pants MEN', 'ON Weather Vest MEN', 'ON Climate Shirt W'];
  const keys = titles.map(apparelModelKey);
  eq('six garments, six keys', new Set(keys).size, titles.length);
}

console.log('\nRubbish in does not throw');
eq('empty', apparelModelKey(''), '');
eq('null', apparelModelKey(null), '');
eq('only a code', apparelModelKey('(1ME11460069)'), '');

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
