// asics-headless.mjs, The Run House.
//
// The parts of the headless runner that do NOT need a browser, which is most
// of what can go wrong: where a row says it is going, whether the real
// converter is really the one building the file, and whether the two
// print-on-demand style lists still agree.
//
// Run: node test/asics-headless.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { locationForUrl, loadBackgroundConverter, styleFromUrl, styleMismatch } from '../tools/asics-headless-run.mjs';
import { POD_STYLES, POD_LOCATION, check, rowsFromCSV } from '../tools/inventory-guardrail.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

console.log('\nA singlet link routes to the Warehouse, a shoe link does not');
{
  const base = 'https://b2b.asics.com/orders/100673623/products/';
  eq(locationForUrl(base + 'TF3085?colorCode=01&deliveryDate=2026-10-27'), 'Warehouse', 'TF3085 goes to Warehouse');
  eq(locationForUrl(base + 'TF2934?colorCode=01'), 'Warehouse', 'TF2934 goes to Warehouse');
  eq(locationForUrl(base + '1011C127?colorCode=001'), '', 'a shoe gets no location, so the converter says Needham');
  eq(locationForUrl(base + 'tf3085'), 'Warehouse', 'the match is case insensitive, the portal rewrites urls');

  // A STYLE CODE MUST NOT MATCH INSIDE THE ORDER NUMBER OR A QUERY STRING.
  // The portal appends colorCode and deliveryDate as the page loads, so the
  // url seen at extraction time is never the one that was pasted.
  eq(locationForUrl('https://b2b.asics.com/orders/TF3085999/products/1011C127'), '',
    'a style code in the ORDER segment does not count');
  eq(locationForUrl('https://b2b.asics.com/orders/1/products/1011C127?ref=TF3085'), '',
    'a style code in the query string does not count');
  eq(locationForUrl(''), '', 'an empty url is handled');
}

console.log('\nThe page read must be the page asked for');
{
  // THE DECISIVE GUARD. Page.navigate returns when the navigation STARTS, so
  // the previous document is briefly still live and a readiness check can be
  // answered by the page just left. That would attribute one product's rows
  // to another product's url, under another product's location. Cheap to
  // check, catastrophic to miss.
  const u = 'https://b2b.asics.com/orders/100601740/products/1011C127?colorCode=001&deliveryDate=2026-05-29';
  eq(styleFromUrl(u), '1011C127', 'the style is read off the path, not the query');
  eq(styleFromUrl('https://b2b.asics.com/orders/1/products/TF3085'), 'TF3085', 'a singlet style reads too');
  eq(styleFromUrl('https://b2b.asics.com/orders/1/products/'), '', 'no style in the path is no style');

  eq(styleMismatch(u, '1011C127'), '', 'the matching case passes');
  eq(styleMismatch(u, '1011c127'), '', 'case does not matter, the portal varies it');
  (styleMismatch(u, '1012B899') ? ok('a DIFFERENT style is caught, which is the stale document case')
                                : bad('a stale read would be accepted'));
  (styleMismatch(u, 'Unknown') ? ok('getProductInfo\'s "Unknown" default is caught, not treated as a style')
                               : bad('"Unknown" would be accepted as a match'));
  (styleMismatch(u, '') ? ok('reading no style at all is caught')
                        : bad('an empty style would be accepted'));
  eq(styleMismatch('https://b2b.asics.com/x', 'whatever'), '',
    'a url with no style cannot mismatch, so it does not block a run');
}

console.log('\nThe two print-on-demand lists must not drift apart');
{
  // b2b-links.js is a browser global and the guardrail is an ES module, so the
  // list is written twice on purpose. This is the guard that keeps them equal,
  // the same job worker/test/brand-registry.mjs does for the brand tables.
  const src = fs.readFileSync(path.join(ROOT, 'b2b-links.js'), 'utf8');
  const m = /podStyles:\s*\[([^\]]*)\]/.exec(src);
  const l = /podLocation:\s*'([^']*)'/.exec(src);
  if (!m || !l) bad('could not find podStyles/podLocation in b2b-links.js');
  else {
    const listed = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    eq(listed.join('|'), POD_STYLES.join('|'), 'b2b-links.js podStyles equals POD_STYLES');
    eq(l[1], POD_LOCATION, 'b2b-links.js podLocation equals POD_LOCATION');
  }
}

console.log('\nThe copied link list carries the location');
{
  // "Copy All Links" emitted the bare url, which is why the singlets reached
  // Needham. Reproduce the emit rule off the real source.
  const src = fs.readFileSync(path.join(ROOT, 'b2b-links.js'), 'utf8');
  /copyActive: function/.test(src) && /loc \? l\.url \+ ' ' \+ loc : l\.url/.test(src)
    ? ok('copyActive appends the location when there is one, and only then')
    : bad('copyActive no longer appends the location');
}

console.log('\nThe file is built by the REAL background converter');
{
  // Fixing the content script's converter alone once fixed nothing that
  // mattered, because the file staff import is rebuilt in background.js. If
  // this ever stops loading, the runner must not quietly use something else.
  const conv = loadBackgroundConverter(ROOT);
  ['convertToInventoryCSV', 'generateHandle', 'generateSKU', 'generateProductTitle']
    .forEach(k => (typeof conv[k] === 'function' ? ok('background.js exposes ' + k)
                                                 : bad('missing ' + k)));

  const rec = (over) => Object.assign({
    styleId: '1011C127', productName: 'GEL-NIMBUS 28', colorCode: '001',
    colorName: 'BLACK/GRAPHITE GREY', gender: 'Men', sizeUS: '10', size: '10',
    quantity: 7, locationName: '', width: { code: 'D', name: 'Standard' },
  }, over);

  const csv = conv.convertToInventoryCSV([
    rec({}),
    rec({ styleId: 'TF3085', productName: 'MENS RIVAL II SINGLET', colorCode: '90',
      colorName: 'BLACK', sizeUS: 'M', size: 'M', quantity: 205, locationName: 'Warehouse' }),
  ]);
  const lines = csv.split('\n');
  eq((lines[0].match(/(".*?"|[^,]+)/g) || []).length, 19, 'the header is 19 columns');

  const col = (line, i) => line.split(',')[i];
  eq(col(lines[1], 11), 'Needham', 'a row with no location falls back to Needham');
  eq(col(lines[2], 11), 'Warehouse', 'a Warehouse row keeps Warehouse, both in one file');

  // THE SKU IS THE JOIN, and backfill-singlet-skus.mjs wrote this exact form.
  // If generateSKU changes, that backfill has to change with it or the
  // singlet rows stop matching anything.
  eq(col(lines[2], 8), 'TF3085-90-M', 'the singlet SKU matches the backfilled form');
  eq(col(lines[1], 8), '1011C127-001-10', 'a footwear SKU is style-colour-size');
}

console.log('\nA capped singlet number cannot reach a file');
{
  // The grid prints "30+" and these run to the hundreds, so an API failure
  // has to write NO rows rather than a 30. Pin that the guardrail also
  // refuses a Needham singlet, which is the belt to that braces.
  const conv = loadBackgroundConverter(ROOT);
  const rows = [];
  for (let i = 0; i < 60; i++) {
    rows.push({ styleId: 'TF3085', productName: 'SINGLET', colorCode: '90', colorName: 'BLACK',
      gender: 'Men', sizeUS: String(i), size: String(i), quantity: 30,
      locationName: 'Needham', width: { code: 'D', name: 'Standard' } });
  }
  const res = check(rowsFromCSV(conv.convertToInventoryCSV(rows)),
    { rows: 60, units: 1800, atCapShare: 1, brandZeroShare: {}, locations: { Needham: 60 } });
  res.blocks.some(b => b.includes('PRINT ON DEMAND IN THE WRONG PLACE'))
    ? ok('singlet rows at Needham are refused end to end, converter through guardrail')
    : bad('the guardrail did not catch Needham singlets from the real converter', res.blocks);
}

console.log('\nThe injection cut point still exists in content.js');
{
  // The runner slices content.js before initializeExtractor so it can evaluate
  // the classes without the UI. If that function is renamed the runner must
  // fail loudly, not inject half a file.
  const src = fs.readFileSync(path.join(ROOT, 'scrapers/asics/content.js'), 'utf8');
  src.indexOf('function initializeExtractor()') > 0
    ? ok('initializeExtractor is present, the cut point holds')
    : bad('the cut point moved, the runner will throw');
  /API_ONLY_STYLES\s*=\s*\[/.test(src)
    ? ok('API_ONLY_STYLES is still a class static the runner can read')
    : bad('API_ONLY_STYLES moved');
  /checkPageReadinessEnhanced\(\)\s*\{/.test(src)
    ? ok('the readiness gate the runner polls is still there')
    : bad('checkPageReadinessEnhanced moved');
  /locationForScrapedUrl\(config, href\)/.test(src)
    ? ok('locationForScrapedUrl keeps its signature')
    : bad('locationForScrapedUrl signature changed');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
