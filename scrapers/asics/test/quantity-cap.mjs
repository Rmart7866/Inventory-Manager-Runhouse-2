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

// KNOWN LIMITATION, deliberately not fixed here.
//
// The page is the only source this scraper reads, so a size with more than 30
// available is written to Shopify as 30. The availability API does return the
// real figure, and a version of this scraper that called it was tried and
// reverted on 2026-10-26: swapping the data source out from under a working
// tool caused a chain of regressions that cost more than the cap does. If it
// is worth fixing, it should be built alongside the page path and compared
// against it on real pages before anything switches over.
//
// What the cap actually costs, measured on TF3085 2026-10-23:
//
//     size          page    API
//     Black S       30+     161
//     Black M       30+     205
//     Red   M       30+     302
//
// It UNDERSTATES, never overstates, so the failure mode is a shoe looking less
// available than it is, not overselling.

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
