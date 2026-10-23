// color-code-digits.mjs, The Run House.
//
// A COLOUR CODE IS TWO OR THREE DIGITS.
//
// findColors tested the swatch code with /^\d{3}$/, exactly three digits.
// Footwear codes ARE three ("001", "020"), so this was never wrong on a shoe
// and went unnoticed for as long as the scraper only ever saw shoes. Apparel
// codes are TWO. Read off the live TF3085 page on 2026-10-23, the swatch row
// is:
//
//     23-RED  01-WHITE  43-ROYAL  50-NAVY  90-BLACK  94-STEEL GREY
//
// The selector found all six elements and the digit test threw all six away,
// so findColors returned an empty array. extractInventoryData loops over
// colours, so the page scrape produced ZERO records on every singlet page and
// reported "No inventory data found", which looks exactly like a page that
// failed to load.
//
// Run: node scrapers/asics/test/color-code-digits.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const src = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

// A DOM stub shaped like the real one, measured on the live page: one
// li > div.flex.items-center.gap-2 per colour, three spans inside it.
function domOf(pairs) {
  const nodes = pairs.map(([code, name]) => ({
    querySelectorAll: () => [code, '-', name].map((t) => ({ textContent: t })),
    textContent: code + '-' + name,
    children: [],
  }));
  return {
    querySelectorAll: (sel) => (sel === 'li div.flex.items-center.gap-2' ? nodes : []),
  };
}

// findColors, lifted out of the real file so the test cannot drift from it.
const m = /\n    findColors\(\) \{[\s\S]*?\n    \}/.exec(src);
if (!m) { bad('could not find findColors in content.js'); process.exit(1); }
const makeFindColors = (document) =>
  new Function('document', 'return function ' + m[0].trim().replace(/^findColors/, 'findColors') + ';')(document);

console.log('\nApparel, the case that was returning nothing');
{
  // Exactly what the live TF3085 page carries.
  const document = domOf([['23', 'RED'], ['01', 'WHITE'], ['43', 'ROYAL'], ['50', 'NAVY'], ['90', 'BLACK'], ['94', 'STEEL GREY']]);
  const colors = makeFindColors(document)(document);
  eq('all six two digit codes are read', colors.length, 6);
  eq('the first is 23 RED', colors[0] && colors[0].code + '|' + colors[0].name, '23|RED');
  eq('a two word colour name survives', colors[5] && colors[5].name, 'STEEL GREY');
  eq('and none of them is dropped for being short', colors.every((c) => /^\d{2,3}$/.test(c.code)), true);
}

console.log('\nFootwear, which must keep working exactly as before');
{
  const document = domOf([['001', 'WHITE/BLACK'], ['020', 'BLACK/GREY'], ['750', 'RED']]);
  const colors = makeFindColors(document)(document);
  eq('three digit codes still read', colors.length, 3);
  eq('a slash in the colour name survives', colors[0].name, 'WHITE/BLACK');
  eq('leading zeros are kept as the page prints them', colors[1].code, '020');
}

console.log('\nWhat still must NOT be read as a colour');
{
  const document = domOf([['9', 'TOO SHORT'], ['1234', 'TOO LONG'], ['AB', 'NOT DIGITS'], ['50', 'NAVY']]);
  const colors = makeFindColors(document)(document);
  eq('only the real one survives', colors.length, 1);
  eq('and it is the two digit one', colors[0].code, '50');
}

console.log('\nThe separator is still required');
{
  const nodes = [{
    querySelectorAll: () => [{ textContent: '90' }, { textContent: '/' }, { textContent: 'BLACK' }],
    textContent: '90/BLACK', children: [],
  }];
  const document = { querySelectorAll: (sel) => (sel === 'li div.flex.items-center.gap-2' ? nodes : []) };
  const colors = makeFindColors(document)(document);
  eq('a slash where the dash should be is not a colour row', colors.length, 0);
}

console.log('\nThe whole document fallback takes two digits too');
{
  // Primary selector finds nothing, so the scan over every element runs.
  const leaves = [
    { textContent: '23 - RED', children: [] },
    { textContent: '90-BLACK', children: [] },
    { textContent: 'Add to basket', children: [] },
  ];
  const document = { querySelectorAll: (sel) => (sel === 'li div.flex.items-center.gap-2' ? [] : leaves) };
  const colors = makeFindColors(document)(document);
  eq('both codes are found', colors.length, 2);
  eq('spaces around the dash are fine', colors[0].code, '23');
  eq('and no dash at all is fine', colors[1].code, '90');
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
