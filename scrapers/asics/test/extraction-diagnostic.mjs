// extraction-diagnostic.mjs, The Run House.
//
// "No inventory data found" NAMES NO CAUSE, and that cost three debugging
// rounds. Landing on that message means BOTH extraction paths came back empty,
// and the two fail for completely unrelated reasons: the API for a missing
// basket number or a style the basket does not carry, the DOM because the grid
// had not rendered yet or because a selector stopped matching. The bare
// message cannot tell those apart, so two fixes were shipped against things
// that were not the blocker.
//
// extractionDiagnostic prints the readings that separate them. This pins that
// it reads cheaply, never throws, and names the right likely cause.
//
// Run: node scrapers/asics/test/extraction-diagnostic.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const has = (m, hay, needle) => (String(hay).includes(needle) ? ok(m) : bad(m, { missing: needle }));

const raw = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const cut = raw.indexOf('function initializeExtractor()');
const Extractor = new Function('window', 'document', 'sessionStorage', 'console',
  raw.slice(0, cut) + '\nreturn EnhancedASICSInventoryExtractor;'
)({ location: { pathname: '/', href: '' }, addEventListener() {} },
  { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), head: { appendChild() {} }, querySelector: () => null, querySelectorAll: () => [] },
  { getItem: () => null, setItem() {} },
  { log() {}, warn() {}, error() {} });

// A stub standing in for each failure shape.
function diagnose({ colors = [], sizes = [], matrix = [], style = '1011C244', basket = '100671391', apiFailure = null }) {
  const x = Object.create(Extractor.prototype);
  x.findColors = () => colors;
  x.findSizes = () => sizes;
  x.findQuantityMatrix = () => matrix;
  x.getProductInfo = () => ({ styleId: style, productName: '', width: {}, gender: '' });
  x.basketNoFromUrl = () => basket;
  return x.extractionDiagnostic(apiFailure);
}

console.log('\nThe page had not rendered, which is the commonest cause');
{
  const d = diagnose({ colors: [], sizes: [], matrix: [] });
  has('names the rendering cause', d, 'had not finished rendering');
  has('and tells you the lever', d, 'Raise the wait time');
  has('reports zero colours', d, 'findColors found nothing');
}

console.log('\nThe colour markup changed but the grid is there');
{
  const d = diagnose({ colors: [], sizes: ['9'], matrix: [['1','2']] });
  has('names the swatch markup', d, 'colour swatch markup changed');
  has('and says what findColors wants', d, '<span>code</span>');
}

console.log('\nThe grid markup changed but the colours are there');
{
  const d = diagnose({ colors: [{ code: '001', name: 'BLACK' }], sizes: ['9'], matrix: [] });
  has('names the quantity grid', d, 'quantity grid markup changed');
}

console.log('\nThe API failure is quoted, not swallowed');
{
  const d = diagnose({ apiFailure: 'ASICS API 403 for /aac/products?basketNo=1' });
  has('the real message survives', d, 'ASICS API 403');
  has('labelled as the API path', d, 'API path         FAILED');
}
{
  const d = diagnose({ apiFailure: null });
  has('and a silent empty return says so', d, 'returned no rows');
}

console.log('\nA missing basket number is called out, since the API cannot run without one');
{
  const d = diagnose({ basket: '' });
  has('says it is missing', d, 'NONE, the API path cannot run');
}

console.log('\nIt reports the readings a human needs');
{
  const d = diagnose({ colors: [{ code: '001', name: 'BLACK' }, { code: '020', name: 'GREY' }], sizes: ['9','10'], matrix: [['1']] });
  has('the colour codes it did read', d, '[001 020]');
  has('the style id', d, '1011C244');
  has('and the build', d, 'build');
  has('warns that the vue hash is volatile', d, 'changes when ASICS redeploys');
  has('and that a zero there is fine', d, '0 is expected');
}

console.log('\nIt must never throw, whatever the DOM is doing');
{
  const x = Object.create(Extractor.prototype);
  x.findColors = () => { throw new Error('boom'); };
  x.findSizes = () => [];
  x.findQuantityMatrix = () => [];
  x.getProductInfo = () => ({ styleId: 'X' });
  x.basketNoFromUrl = () => '1';
  let threw = null;
  try { x.extractionDiagnostic('api died'); } catch (e) { threw = e.message; }
  // findColors throwing is not something the diagnostic can paper over, but it
  // must not be what the operator sees instead of the real failure.
  threw ? ok('a throwing findColors surfaces as ' + JSON.stringify(threw) + ', noted') : ok('survives a throwing findColors');
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
