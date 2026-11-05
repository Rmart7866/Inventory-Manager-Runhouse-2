// team-request-utils.mjs, The Run House.
//
// The rules a team store draft is built from: its size ladder, the default
// logo box, how a logo fits that box, the colour option text. Every case
// below is a size string that really occurs in the builder catalog.
//
// Run: node test/team-request-utils.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createRequire } from 'node:module';
const U = createRequire(import.meta.url)('../team-request-utils.js');

let failures = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) console.log('  ok    ' + name);
  else { failures++; console.log('  FAIL  ' + name + '\n          got  ' + a + '\n          want ' + b); }
};

console.log('\nSize ladders from the catalog text');
eq('Adult XS-4XL', U.sizesFrom('Adult Sizes: XS-4XL'), ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
eq('double space after the colon', U.sizesFrom('Adult Sizes:  XS-6XL').length, 10);
eq('Youth XS-XL', U.sizesFrom('Youth Sizes: XS-XL'), ['XS', 'S', 'M', 'L', 'XL']);
eq('no prefix, S-3XL', U.sizesFrom('Sizes: S-3XL'), ['S', 'M', 'L', 'XL', '2XL', '3XL']);
eq('XXS start', U.sizesFrom('Sizes: XXS-3XL')[0], 'XXS');
eq('toddler range', U.sizesFrom('Toddler Sizes: 2T-5T'), ['2T', '3T', '4T', '5T']);
eq('toddler list', U.sizesFrom('Toddler Sizes: 2T, 3T, 4T'), ['2T', '3T', '4T']);
eq('infant list with newborn', U.sizesFrom('INFANT SIZES: NEWBORN, 6M, 12M, 18M, 24M'), ['NB', '6M', '12M', '18M', '24M']);
eq('one size', U.sizesFrom('One Size Fits Most'), ['One Size']);
eq('OSFA', U.sizesFrom('OSFA'), ['One Size']);
eq('adult plus tall', U.sizesFrom('Adult Sizes: XS-4XL & Tall Sizes: LT-4XLT').slice(-5), ['LT', 'XLT', '2XLT', '3XLT', '4XLT']);
eq('cap sizes it cannot read come back EMPTY, not guessed', U.sizesFrom('SM, MD-LG (One Size Fits Most), XL'), []);
eq('prose with no sizes is empty', U.sizesFrom('Unisex & Youth Sizes'), []);
eq('nothing is empty', U.sizesFrom(''), []);
eq('a blank on a bag is one size', U.sizesFor({ z: '' }, 'Bags'), ['One Size']);
eq('a blank on a tee is UNKNOWN, staff must set it', U.sizesFor({ z: '' }, 'Short Sleeve T-Shirts'), []);
eq('unreadable cap text stays unknown even in Headwear', U.sizesFor({ z: 'SM, MD-LG (One Size Fits Most), XL' }, 'Headwear'), []);

console.log('\nWhere the logo goes');
const tee = { ch: 1, pb: [0.29, 0.21, 0.4, 0.49], fcb: [0.29, 0.21, 0.4, 0.49], lcb: [0.55, 0.22, 0.13, 0.18] };
eq('a chest choice defaults to full chest', U.defaultBox(tee, 'Full chest'), tee.fcb);
eq('and left chest when asked', U.defaultBox(tee, 'Left chest'), tee.lcb);
eq('a staff box for one colour wins for that colour', U.boxFor({ placement: 'Full chest', boxes: { Navy: [0.1, 0.1, 0.2, 0.2] } }, tee, 'Navy'), [0.1, 0.1, 0.2, 0.2]);
eq('an all-colours box covers the rest', U.boxFor({ placement: 'Full chest', boxes: { '*': [0.3, 0.3, 0.1, 0.1] } }, tee, 'Red'), [0.3, 0.3, 0.1, 0.1]);

console.log('\nFitting a logo in its box, in pixels');
// A square box on a portrait 300x400 photo is 120x160 px. A square logo
// should come out 120x120 px, top aligned, not stretched to the box.
const f = U.fitLogo([0.3, 0.2, 0.4, 0.4], 500, 500, 300, 400);
eq('square logo keeps its shape on a portrait photo', [Math.round(f.w * 300), Math.round(f.h * 400)], [120, 120]);
eq('and sits at the top of the box', f.y, 0.2);
const g = U.fitLogo([0.3, 0.2, 0.4, 0.4], 100, 400, 400, 400);
eq('a tall logo is centred across the box', +(g.x + g.w / 2).toFixed(4), 0.5);

console.log('\nThe colour option value');
eq('matches the hand-built stores', U.colorLabel('Navy', 'Left chest', 'Main logo'), 'Navy w/ Left Chest Logo');
eq('names a second logo when that is the one used', U.colorLabel('Red', 'Full chest', 'Second logo'), 'Red w/ Full Chest Second logo');

console.log('\nThe back office automation\'s rules');
eq('full chest is FC', U.plCode('Full chest', 'Short Sleeve T-Shirts'), 'FC');
eq('left chest is LC', U.plCode('Left chest', 'Hoodies'), 'LC');
eq('anything on a hat is HAT', U.plCode('Front', 'Headwear'), 'HAT');
eq('back neck is BN, not BK', U.plCode('Back neck', 'Hoodies'), 'BN');
eq('back is BK', U.plCode('Back', 'Hoodies'), 'BK');
eq('the colour value carries the code', U.codeLabel('Jet Black', 'D055', 'FC'), 'Jet Black (D055 (FC))');
const hood = { loc: { Back: ['b', [0.3, 0.1, 0.4, 0.32]], Sleeve: ['f', [0.83, 0.31, 0.09, 0.09]] } };
eq('a back second logo prints on the back', U.loc2({ second_logo: 'Back' }, hood).side, 'b');
eq('a sleeve prints on the front photo', U.loc2({ second_logo: 'Sleeve' }, hood).side, 'f');
eq('no second logo is null', U.loc2({ second_logo: '' }, hood), null);

const white = { samples: [[250, 250, 250], [240, 240, 240]] }, navy = { samples: [[20, 30, 70], [10, 20, 60]] };
eq('a white logo shows better on black than a navy one', U.autoKey({ main: navy, dark: white }, '#1c1c1c'), 'dark');
eq('and the main logo wins on white', U.autoKey({ main: navy, dark: white }, '#ffffff'), 'main');
eq('with one logo there is nothing to pick', U.autoKey({ main: navy }, '#1c1c1c'), 'main');
const it = { logo: 'auto', logo2: 'auto', logoBy: { Kelly: { f: 'main', x: '' } } };
eq('the customer\'s per colour pick wins', U.resolveLogo(it, 'Kelly', 'f', { main: navy, dark: white }, '#1c1c1c'), 'main');
eq('a colour they did not pick falls back to auto', U.resolveLogo(it, 'Black', 'f', { main: navy, dark: white }, '#1c1c1c'), 'dark');
eq('a fixed staff choice beats auto', U.resolveLogo({ logo: 'main', logoBy: {} }, 'Black', 'f', { main: navy, dark: white }, '#1c1c1c'), 'main');
eq('a pick of a logo that is gone falls back', U.resolveLogo({ logo: 'l3', logoBy: {} }, 'Black', 'f', { main: navy }, '#1c1c1c'), 'main');

console.log('\nStyle templates');
const tee2 = { ch: 1, pb: [0.1, 0.1, 0.1, 0.1], fcb: [0.29, 0.21, 0.4, 0.49], lcb: [0.55, 0.22, 0.13, 0.18], loc: { Back: ['b', [0.3, 0.1, 0.4, 0.32]] } };
const tpl = { fc: [0.3, 0.25, 0.38, 0.3], lc: [0.56, 0.23, 0.11, 0.1, 5], bk: [0.31, 0.12, 0.38, 0.3] };
eq('a style template beats the catalog box', U.boxFor({ placement: 'Full chest', boxes: {} }, tee2, 'Navy', tpl), tpl.fc);
eq('left chest uses the template left chest, tilt and all', U.boxFor({ placement: 'Left chest', boxes: {} }, tee2, 'Navy', tpl), tpl.lc);
eq('a per store box still beats the template', U.boxFor({ placement: 'Full chest', boxes: { '*': [0.2, 0.2, 0.2, 0.2] } }, tee2, 'Navy', tpl), [0.2, 0.2, 0.2, 0.2]);
eq('no template falls back to the catalog', U.boxFor({ placement: 'Full chest', boxes: {} }, tee2, 'Navy', null), tee2.fcb);
eq('a template missing that zone falls back too', U.boxFor({ placement: 'Left chest', boxes: {} }, tee2, 'Navy', { fc: tpl.fc }), tee2.lcb);
eq('a hat uses the front box', U.boxFor({ placement: 'Front', boxes: {} }, { pb: [0, 0, 1, 1] }, 'Red', { pb: [0.3, 0.3, 0.3, 0.2] }), [0.3, 0.3, 0.3, 0.2]);
eq('a back logo uses the template back box', U.loc2({ second_logo: 'Back' }, tee2, tpl).box, tpl.bk);
eq('and the catalog one without a template', U.loc2({ second_logo: 'Back' }, tee2, null).box, [0.3, 0.1, 0.4, 0.32]);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
