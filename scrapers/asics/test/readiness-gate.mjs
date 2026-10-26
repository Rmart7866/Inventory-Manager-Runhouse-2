// readiness-gate.mjs, The Run House.
//
// THE GATE IN FRONT OF THE EXTRACTOR WAS THE THING REFUSING THE PAGE.
//
// checkPageReadinessEnhanced decides whether the scrape may run at all. It
// polls until the grid looks complete, and on timeout it reports "No inventory
// data found" WITHOUT EVER CALLING THE EXTRACTOR. That message is also printed
// by a second, unrelated path inside extractCurrentPageDataBackground, and the
// identical wording is why this took four rounds to find: every fix went into
// the extractor while the gate stayed shut.
//
// The gate was footwear shaped in four independent ways. Measured on the live
// women's singlet TF2934 on 2026-10-26, a fully rendered page:
//
//   condition              demanded          actually present
//   colour code            3 digits          2 digits        -> 0 valid
//   size cell              numeric 6 to 16   XS S M L XL 2XL -> 0 valid
//   cells per row          >= 10             6               -> 0 valid rows
//   minimum sizes          >= 10             6
//
// So it could never open, and the singlet pages timed out every time.
//
// A fifth thing fell out of fixing it: the numeric 6 to 16 bound was also
// wrong on FOOTWEAR. Style 1013A141 runs 3.5 to 13, so the gate counted 15
// sizes where the ladder is 20, disagreeing with findSizes, which has no such
// bound and read all 20.
//
// Run: node scrapers/asics/test/readiness-gate.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const raw = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const cut = raw.indexOf('function initializeExtractor()');

// Build a DOM stub shaped like the real page: a colour swatch row per
// colourway, a size header cell per size, and a quantity row per colourway.
function makeDom({ colourCodes, sizes, rowsOfCells, extraHeaderJunk = [], hasGrid = true, hasSeason = true }) {
  const textNode = (t) => ({ textContent: t, children: [], attributes: [] });
  const swatches = colourCodes.map((code) => ({
    querySelectorAll: () => [code, '-', 'COLOUR ' + code].map(textNode),
  }));
  const headerCells = [...sizes, ...extraHeaderJunk].map(textNode);
  const qrows = rowsOfCells.map((n) => ({
    querySelectorAll: () => Array.from({ length: n }, (_, i) => textNode(String((i % 9) + 1))),
  }));
  const GRID = '.grid.grid-cols-\\[12rem\\,minmax\\(4\\.5rem\\,auto\\)\\,9\\.5rem\\]';
  return {
    querySelectorAll: (sel) => {
      if (sel === 'li div.flex.items-center.gap-2') return swatches;
      if (sel === '.bg-primary.text-white') return headerCells;
      if (sel === '.grid.grid-flow-col.items-center') return qrows;
      if (sel === 'picture img') return [textNode('')];
      return [];
    },
    querySelector: (sel) => {
      if (sel === GRID) return hasGrid ? {} : null;
      if (sel === '[class*="bg-secondary"]') return hasSeason ? {} : null;
      return null;
    },
  };
}

function check(dom) {
  const Extractor = new Function('window', 'document', 'sessionStorage', 'console',
    raw.slice(0, cut) + '\nreturn EnhancedASICSInventoryExtractor;'
  )({ location: { pathname: '/', href: '' }, addEventListener() {} }, dom,
    { getItem: () => null, setItem() {} }, { log() {}, warn() {}, error() {} });
  return Object.create(Extractor.prototype).checkPageReadinessEnhanced();
}

console.log('\nThe women\'s singlet, the page that could never open the gate');
{
  // 6 two digit colours, 6 word sizes, 6 rows of 6 cells, plus one unavailable
  // colourway with no cells, plus the junk the size selector also catches.
  const r = check(makeDom({
    colourCodes: ['01', '23', '43', '50', '90', '94'],
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
    rowsOfCells: [6, 6, 6, 6, 6, 6, 0],
    extraHeaderJunk: ['Yes', 'Add to Cart', 'View basket & checkout', 'dan@therunhouse.com'],
  }));
  eq('all six two digit colours count', r.colorCount, 6);
  eq('all six word sizes count', r.sizeCount, 6);
  eq('the header junk is rejected', r.sizeCount, 6);
  eq('six full rows, the empty one ignored', r.quantityRowCount, 6);
  eq('and the gate OPENS', r.ready && r.hasCompleteData, true);
}

console.log('\nFootwear, which must not regress');
{
  // 1013A141: 4 colours, a 3.5 to 13 ladder of 20, 4 rows of 20.
  const sizes = ['3.5','4','4.5','5','5.5','6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13'];
  const r = check(makeDom({
    colourCodes: ['001', '100', '400', '101'],
    sizes,
    rowsOfCells: [20, 20, 20, 20],
  }));
  eq('four three digit colours still count', r.colorCount, 4);
  eq('the WHOLE ladder counts, not just 6 and up', r.sizeCount, 20);
  eq('four full rows', r.quantityRowCount, 4);
  eq('the gate opens', r.ready && r.hasCompleteData, true);
}

console.log('\nA half rendered page must still be refused');
{
  // Colours and the header are in, but only part of one quantity row.
  const sizes = ['6','6.5','7','7.5','8','8.5','9','9.5','10','10.5','11','11.5','12','12.5','13'];
  const r = check(makeDom({ colourCodes: ['001','100'], sizes, rowsOfCells: [4] }));
  eq('a short row is not a full row', r.quantityRowCount, 0);
  eq('so the gate stays shut', r.ready && r.hasCompleteData, false);
}
{
  const r = check(makeDom({ colourCodes: [], sizes: [], rowsOfCells: [] }));
  eq('an empty page is refused', r.ready, false);
  eq('and reports zero colours so the diagnostic can say why', r.colorCount, 0);
}
{
  const sizes = ['XS','S','M','L','XL','2XL'];
  const r = check(makeDom({ colourCodes: ['01'], sizes, rowsOfCells: [6], hasGrid: false }));
  eq('no inventory grid is still a refusal', r.ready, false);
}

console.log('\nThe size vocabulary itself');
{
  const Extractor = new Function('window', 'document', 'sessionStorage', 'console',
    raw.slice(0, cut) + '\nreturn EnhancedASICSInventoryExtractor;'
  )({ location: { pathname: '/', href: '' }, addEventListener() {} }, makeDom({ colourCodes: [], sizes: [], rowsOfCells: [] }),
    { getItem: () => null, setItem() {} }, { log() {}, warn() {}, error() {} });
  const k = (t) => Extractor.sizeTokenKind(t);
  eq('a half size is numeric', k('10.5'), 'numeric');
  eq('the smallest real shoe size counts', k('3.5'), 'numeric');
  eq('4XS is a word size', k('4XS'), 'word');
  eq('2XL is a word size', k('2XL'), 'word');
  eq('XS is a word size', k('XS'), 'word');
  eq('M is a word size', k('M'), 'word');
  eq('XXL is a word size', k('XXL'), 'word');
  eq('"Yes" is not a size', k('Yes'), null);
  eq('"Accept" is not a size', k('Accept'), null);
  eq('an email address is not a size', k('dan@therunhouse.com'), null);
  eq('"Add to Cart" is not a size', k('Add to Cart'), null);
  eq('a price is not a size', k('120'), null);
}

console.log('\nfindSizes must never invent a ladder again');
{
  const noLadder = !/\['6', '6\.5', '7'/.test(raw);
  noLadder ? ok('the hardcoded 17 slot shoe ladder is gone')
           : bad('findSizes can still invent a shoe ladder, which is the ON scraper bug');
}

console.log('\nBoth "No inventory data found" paths carry a diagnostic');
{
  const gateDiag = /readiness gate timed out/.test(raw);
  gateDiag ? ok('the readiness timeout says it never called the extractor')
           : bad('the readiness timeout still reports a bare message');
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
