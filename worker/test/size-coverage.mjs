// Shoe size coverage: sizes, genders, the Needham skip, and that the real
// catalog assembler feeds it from the bulk file it already reads.
import { normSize, genderOf, makeSizeAccumulator, modelOf } from '../src/size-coverage.js';
import { assembleBulkObjects } from '../src/catalog.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };

console.log('\nSizes and genders');
check('"9.0" and "9" are one size, halves kept', normSize('9.0') === '9' && normSize('9') === '9' && normSize('10.5') === '10.5' && normSize('10.50') === '10.5');
check('a width or a word is not a shoe size', normSize('D') === null && normSize('One Size') === null && normSize('') === null);
check('only men\'s and women\'s shoes count', genderOf("Men's Shoes") === 'men' && genderOf("Women's Shoes") === 'women' && genderOf('Unisex Shoes') === null && genderOf("Kids' Shoes") === null);

check('the model and width come from the cw-group tag', JSON.stringify(modelOf({ tags: ['hoka', 'cw-group:hoka-womens-clifton-10--wide'] })) === '{"m":"hoka-womens-clifton-10","w":"wide"}');
check('without one, the title before the colour', modelOf({ title: "Brooks Women's Ghost 16 - Black/White", tags: [] }).m === 'brooks-women-s-ghost-16');

console.log('\nCounting');
const acc = makeSizeAccumulator(['NEEDHAM']);
const W = { handle: 'w-ghost', title: 'Ghost 16', productType: "Women's Shoes", image: '', vendor: 'Brooks', tags: ['cw-group:brooks-womens-ghost-16--standard'] };
const W2 = { handle: 'w-clifton', title: 'Clifton 10', productType: "Women's Shoes", image: '' };
acc.onLevel(W, '8', 'FAL', 2); acc.onLevel(W, '8.0', 'FAL', 1); acc.onLevel(W, '9', 'FAL', 1);
acc.onLevel(W2, '9', 'FAL', 3); acc.onLevel(W2, '8', 'FAL', 0); acc.onLevel(W2, '7', 'FAL', -2);
acc.onLevel(W, '8', 'NEEDHAM', 50);
const r = acc.result();
check('units and styles per size: women\'s 8 at Falmouth is 3 units in 1 style', r.FAL.women.sizes['8'].units === 3 && r.FAL.women.sizes['8'].styles === 1);
check('a size at zero or below zero is not on the shelf', !r.FAL.women.sizes['7'] && r.FAL.women.sizes['9'].styles === 2);
check('styles carried is the styles with anything on that shelf', r.FAL.women.carried === 2);
check('each style lists its sizes in stock, for "which styles miss an 8"', JSON.stringify(r.FAL.women.styles.find((s) => s.h === 'w-clifton').s) === '{"9":3}');
check('Needham, the dropship location, is left out', !r.NEEDHAM);
const ghost = r.FAL.women.styles.find((x) => x.h === 'w-ghost');
check('each style carries its brand, model and width for the page', ghost.v === 'Brooks' && ghost.m === 'brooks-womens-ghost-16' && ghost.w === 'standard');

console.log('\nThe catalog assembler feeds it');
const out = assembleBulkObjects([
  { id: 'P1', handle: 'hoka-womens-clifton-10', title: "Hoka Women's Clifton 10", vendor: 'Hoka', productType: "Women's Shoes", status: 'ACTIVE', tags: [] },
  { id: 'V1', __parentId: 'P1', sku: 'H1-8', price: '145', selectedOptions: [{ name: 'Size', value: '8.0' }] },
  { __parentId: 'V1', location: { id: 'FAL' }, quantities: [{ name: 'on_hand', quantity: 2 }] },
  { __parentId: 'V1', location: { id: 'NEEDHAM' }, quantities: [{ name: 'on_hand', quantity: 9 }] },
], 'NEEDHAM');
check('the bulk file\'s levels arrive as size coverage, Needham skipped', out.sizes.FAL.women.sizes['8'].units === 2 && !out.sizes.NEEDHAM);
check('and the catalog itself is unchanged by it', out.raw.length === 1 && out.needham.onHand.get('hoka-womens-clifton-10') === 9);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
