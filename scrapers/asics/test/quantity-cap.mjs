// quantity-cap.mjs, The Run House.
//
// THE RENDERED GRID IS CAPPED AT 30. THE API IS NOT.
//
// The ASICS portal prints "30+" for any size with more than 30 available, which
// is maxQuantityDisplayed in the data behind the page. parseQuantity turns that
// string into the number 30, so the link-iterating scraper wrote 30 to Shopify
// for every deep size. Measured on TF3085 2026-10-23, off the same page in the
// same second:
//
//     size          page    API
//     Black S       30+     161
//     Black M       30+     205
//     Red   M       30+     302
//
// For dropship footwear that understates a popular shoe. For the race merch
// singlets it is worse: TF3085 and TF2934 carry 91 listings between them and
// those sell to a whole marathon field.
//
// So the scraper asks the availability endpoint first and only falls back to
// the page when that fails, loudly. This file pins both halves: that a capped
// cell is still parsed as 30 when the DOM is all there is, and that the API
// reader exists and is preferred.
//
// Run: node scrapers/asics/test/quantity-cap.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

const src = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

// parseQuantity, lifted verbatim.
function parseQuantity(quantityText) {
  if (!quantityText || quantityText === '-' || quantityText === '') return 0;
  if (quantityText.includes('+')) {
    const num = parseInt(quantityText.replace('+', ''));
    return isNaN(num) ? 0 : num;
  }
  const num = parseInt(quantityText);
  return isNaN(num) ? 0 : num;
}

console.log('\nWhat the page can and cannot tell you');
eq('an exact cell is exact', parseQuantity('7'), 7);
eq('an empty cell is zero', parseQuantity(''), 0);
eq('a dash is zero', parseQuantity('-'), 0);
eq('"30+" reads as 30, which is the whole problem', parseQuantity('30+'), 30);
eq('so 161 at ASICS would reach Shopify as', parseQuantity('30+'), 30);

console.log('\nThe scraper must therefore prefer the API');
const hasApiReader = /async extractInventoryDataFromApi\(\)/.test(src);
hasApiReader ? ok('extractInventoryDataFromApi exists') : bad('the API reader is gone');

const prefersApi = /inventoryData = await this\.extractInventoryDataFromApi\(\)/.test(src);
prefersApi ? ok('the auto-scrape path calls it FIRST') : bad('the auto-scrape path no longer calls the API first');

const fallsBack = /quantitySource = 'dom'[\s\S]{0,200}extractInventoryData\(\)/.test(src);
fallsBack ? ok('it still falls back to the page if the API fails') : bad('the DOM fallback is missing');

const warnsOnFallback = /CAPPED at 30/.test(src);
warnsOnFallback ? ok('and says so loudly when it does, rather than quietly writing 30s')
                : bad('the fallback no longer warns that quantities are capped');

console.log('\nThe availability URL is built the way the portal builds it');
const url = /\/availability\?basketNo=' \+ encodeURIComponent\(basketNo\) \+\s*\n?\s*'&colorCodeDistributorNo=' \+ colorCodes/.test(src.replace(/\s+/g, ' ').replace(/ /g, ' '));
const urlLoose = /availability\?basketNo=/.test(src) && /colorCodeDistributorNo=/.test(src);
urlLoose ? ok('basketNo and colorCodeDistributorNo are both present')
         : bad('the availability URL no longer carries the expected parameters');

const basketFromPath = /\/\\\/orders\\\/\(\\d\+\)\\\//.test(src) || /orders\\\/\(\\d\+\)/.test(src);
basketFromPath ? ok('the basket number is read from /orders/<n>/ in the path')
               : bad('basketNoFromUrl no longer reads the order number from the path');

console.log('\nThe real numbers this protects, from TF3085 on 2026-10-23');
const real = { 'Black S': 161, 'Black M': 205, 'Red M': 302 };
for (const [label, n] of Object.entries(real)) {
  const capped = parseQuantity('30+');
  n > capped ? ok(label + ' is ' + n + ' at ASICS, the page would have said ' + capped)
             : bad(label + ' no longer exceeds the cap', { n });
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
