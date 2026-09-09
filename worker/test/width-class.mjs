// width-class.mjs, The Run House.
//
// The men's and women's width ladders are offset by one notch, so the SAME
// letter names a different width depending on who the shoe is for:
//
//   women's:   2A narrow,   B standard,   D wide,      2E / 4E extra wide
//   men's:     2A / B narrow, D standard, 2E wide,     4E / 6E extra wide
//
// widthClass used to ignore gender, so a men's B narrow and a women's D wide
// were both called standard. The visible damage was on the PDP: a swatch row is
// keyed on model + width class, so those products joined the standard row and a
// customer picking "standard" could land on a narrow or a wide shoe. In the live
// catalog it put two physical widths into cw-group:mens-adrenaline-gts-25--standard,
// cw-group:womens-glycerin-23--standard and
// cw-group:womens-glycerin-gts-22--standard.
//
// Only B and D are gender dependent. Everything else means the same on both
// ladders, and an unknown gender keeps the old gender blind answer so a record
// with no gender groups exactly as it did before.
//
// Run: node test/width-class.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { widthClass } from '../src/group.js';
import { groupTagFor } from '../src/tag-groups.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

console.log("\nThe women's ladder");
eq('2A is narrow', widthClass('2A', "Women's"), 'narrow');
eq('B is the standard', widthClass('B', "Women's"), 'standard');
eq('D is WIDE, not standard', widthClass('D', "Women's"), 'wide');
eq('2E is extra wide', widthClass('2E', "Women's"), 'xwide');
eq('4E is extra wide', widthClass('4E', "Women's"), 'xwide');

console.log("\nThe men's ladder, offset by one notch");
eq('2A is narrow', widthClass('2A', "Men's"), 'narrow');
eq('B is NARROW, not standard', widthClass('B', "Men's"), 'narrow');
eq('D is the standard', widthClass('D', "Men's"), 'standard');
eq('2E is wide', widthClass('2E', "Men's"), 'wide');
eq('4E is extra wide', widthClass('4E', "Men's"), 'xwide');
eq('6E is extra wide', widthClass('6E', "Men's"), 'xwide');

console.log('\nUnknown gender keeps the old gender blind answer, so nothing regresses');
for (const g of [undefined, null, '', 'Unisex']) {
  eq(`B with gender ${JSON.stringify(g)}`, widthClass('B', g), 'standard');
  eq(`D with gender ${JSON.stringify(g)}`, widthClass('D', g), 'standard');
}

console.log('\nThe word forms are gender independent, and always were');
for (const g of ["Men's", "Women's", null]) {
  eq(`STD (${g})`, widthClass('STD', g), 'standard');
  eq(`WIDE (${g})`, widthClass('WIDE', g), 'wide');
  eq(`NARROW (${g})`, widthClass('NARROW', g), 'narrow');
  eq(`XWIDE (${g})`, widthClass('XWIDE', g), 'xwide');
  eq(`a missing code (${g})`, widthClass('', g), 'standard');
  eq(`an unknown code (${g})`, widthClass('ZZ', g), 'standard');
}

console.log('\nThe damage this caused, as a group tag');
// A narrow and a standard men's shoe must not land in the same swatch row.
const mensNarrow = groupTagFor({ modelKey: 'Adrenaline GTS 25', width: 'B', gender: "Men's" });
const mensStd = groupTagFor({ modelKey: 'Adrenaline GTS 25', width: 'D', gender: "Men's" });
eq('mens B groups as narrow', mensNarrow, 'cw-group:adrenaline-gts-25--narrow');
eq('mens D groups as standard', mensStd, 'cw-group:adrenaline-gts-25--standard');
if (mensNarrow !== mensStd) ok('so the two no longer share a swatch row'); else bad('they still collide', mensNarrow);

// Same for a women's standard against a women's wide.
const womensStd = groupTagFor({ modelKey: 'Glycerin 23', width: 'B', gender: "Women's" });
const womensWide = groupTagFor({ modelKey: 'Glycerin 23', width: 'D', gender: "Women's" });
eq('womens B groups as standard', womensStd, 'cw-group:glycerin-23--standard');
eq('womens D groups as wide', womensWide, 'cw-group:glycerin-23--wide');
if (womensStd !== womensWide) ok('so the two no longer share a swatch row'); else bad('they still collide', womensStd);

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
