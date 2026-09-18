// canon-model.mjs, The Run House.
//
// _canonModel decides whether the picker thinks a product is already on
// Shopify. Get it wrong and the tool offers to create shoes the store already
// has, which is how duplicate listings start.
//
// Both bugs pinned here were found the same way: canonicalise every live title
// and look for keys that begin with a stray single letter, which is what a
// half-stripped word leaves behind.
//
// Run: node test/canon-model.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sb = { console, setTimeout, fetch: () => {}, localStorage: { getItem: () => null, setItem() {} },
  navigator: {}, location: { href: '' },
  document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../catalog-client.js', import.meta.url), 'utf8'), sb);
const CC = sb.CatalogClient;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));
const ne = (m, a, b) => (a !== b ? ok(m) : bad(m, { both: a }));

console.log('\nEvery gender form strips clean, possessive or not');
for (const g of ['Unisex', "Unisex's", "Men's", 'Mens', "Women's", 'Womens', "Kids'", "Kid's", 'Youth', "Boys'", "Girls'"]) {
  eq(`"${g}"`, CC._canonModel('ASICS ' + g + ' SUPERBLAST 3 - BLACK/BLACK', 'asics'), 'SUPERBLAST 3');
}

console.log('\nThe ASICS case that started it');
eq('Stage 4 title and feed title agree',
   CC._canonModel("ASICS Unisex's SUPERBLAST 3 - BLACK/BLACK", 'asics'),
   CC._canonModel('Asics Unisex Superblast 3 - Black/Black', 'asics'));

console.log('\nNew Balance names one shoe two ways, and both must resolve alike');
const nb = (t) => CC._canonModel(t, 'newbalance');
eq('Fresh Foam X 1080v15 == 1080v15', nb('New Balance Mens Fresh Foam X 1080v15 - Black'), nb('New Balance Mens 1080v15 - Black'));
eq('FuelCell Rebel v5 == Rebel v5', nb('New Balance Mens FuelCell Rebel v5 - Blue'), nb('New Balance Mens Rebel v5 - Blue'));
eq('a bare X survives an abbreviated title', nb('New Balance Womens X 880v13 - Grey'), nb('New Balance Womens Fresh Foam X 880v13 - Grey'));

console.log('\nBut the version number still separates models');
ne('1080v15 is not 1080v14', nb('New Balance Mens 1080v15 - Black'), nb('New Balance Mens 1080v14 - Black'));
ne('Rebel v5 is not Rebel v4', nb('New Balance Mens Rebel v5 - Blue'), nb('New Balance Mens Rebel v4 - Blue'));
ne('Superblast 2 is not Superblast 3',
   CC._canonModel('Asics Unisex Superblast 2 - Black', 'asics'),
   CC._canonModel('Asics Unisex Superblast 3 - Black', 'asics'));

console.log('\nThe family strip is New Balance only, it must not touch other brands');
eq('an ASICS model starting with X keeps it', CC._canonModel('Asics Mens X Trainer 2 - Black', 'asics'), 'X TRAINER 2');

console.log('\nNo canon key may begin with a stray letter, the signature of a half-stripped word');
for (const [t, b] of [["ASICS Unisex's SUPERBLAST 3 - BLACK", 'asics'],
                      ['New Balance Mens X 860v13- Cobalt/Black (M860B13)', 'newbalance'],
                      ["HOKA Men's Arahi SR - BLACK / BLACK", 'hoka']]) {
  const k = CC._canonModel(t, b) || '';
  (/^[A-Z]\s/.test(k) ? bad : ok)(`${JSON.stringify(t.slice(0, 34))} -> ${JSON.stringify(k)}`);
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
