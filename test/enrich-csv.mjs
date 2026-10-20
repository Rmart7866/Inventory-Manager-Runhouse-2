// enrich-csv.mjs, The Run House.
//
// ProductEnrichment.applyToCSV patches the new-product CSV with the prices,
// tags and descriptions typed in the review modal, and buildCreateSpecs parses
// that patched CSV back to decide what Stage 4 creates. So applyToCSV has to be
// a LOSSLESS CSV round trip, and for a long time it was not: it read a line at
// a time with parseCSVLineEnrich, which strips the quotes, and wrote the row
// back with cols.join(','), which does not put them back.
//
// What that cost, measured 2026-10-20 on the ON apparel drop: the converter had
// written Tags correctly as "ON Running, Performance Volt Vest, Women", one
// field. Stripped and rejoined it became three columns, every column right of
// Tags shifted two places, buildCreateSpecs read an empty 'Option1 value',
// filtered out every variant, filtered out the whole product, and the modal
// said "Nothing to create for Performance Volt Vest" about a model it was
// itself displaying. 674 creatable products collapsed to 109. An inch mark in a
// title ("3\" Core Shorts") was worse: the rejoined field re-emitted a bare
// quote that desynced every row after it.
//
// The guard is the round trip, not the symptom: enrich a CSV and the field
// values must come back out of the same columns they went in.
//
// Run: node test/enrich-csv.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sb = {
  console, setTimeout, fetch: () => {},
  localStorage: { getItem: () => null, setItem() {} },
  navigator: {}, location: { href: '' },
  document: {
    addEventListener() {}, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {} }),
    head: { appendChild() {} },
    body: { appendChild() {}, classList: { contains: () => false } },
  },
};
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../product-enrichment.js', import.meta.url), 'utf8'), sb);
const PE = sb.ProductEnrichment;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

// Record aware parser, the same shape buildCreateSpecs uses downstream.
function parse(csv) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (q) { if (ch === '"') { if (csv[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch === '\r') { /* skip */ }
    else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const col = (rows, name) => rows[0].indexOf(name);
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

// A cut-down version of the real new-product CSV: the columns applyToCSV
// writes, plus the two columns the shift used to land on. Tags carries commas
// and one title carries an inch mark, which are the two things that broke.
const HEADERS = ['Title', 'URL handle', 'Description', 'Vendor', 'Product category',
  'Type', 'Tags', 'Status', 'SKU', 'Option1 name', 'Option1 value', 'Price',
  'SEO title', 'SEO description'];

function csvFor(rows) {
  return [HEADERS.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\n');
}

const ROWS = [
  ["ON Women's Performance Volt Vest - Glacier", 'on-womens-volt-vest-glacier', '', 'ON Running',
   'Apparel', "Women's Shoes", 'ON Running, Performance Volt Vest, Women', 'Draft',
   'ON-1WG30740561-GLA-L', 'Size', 'L', '', '', ''],
  ["ON Women's Performance Volt Vest - Glacier", 'on-womens-volt-vest-glacier', '', 'ON Running',
   'Apparel', "Women's Shoes", 'ON Running, Performance Volt Vest, Women', 'Draft',
   'ON-1WG30740561-GLA-M', 'Size', 'M', '', '', ''],
  // The inch mark. Its own row must survive AND it must not break the next one.
  ['ON Women\'s 3" Core Shorts - Black', 'on-womens-3-core-shorts-black', '', 'ON Running',
   'Apparel', "Women's Shoes", 'ON Running, Core Shorts, Women', 'Draft',
   'ON-1WE30112345-BLK-S', 'Size', 'S', '', '', ''],
  ["ON Men's Cloud 6 - Ash Cinder", 'on-mens-cloud-6-ash-cinder', '', 'ON Running',
   'Apparel', "Men's Shoes", 'ON Running, Cloud 6, Men', 'Draft',
   'ON-3MF10074782-ASH-7', 'Size', '7.0', '', '', ''],
];

// applyToCSV keys the user's enrichment off productVariantData's model name,
// the same derivation extractModels uses, so the fake converter mirrors it.
const converter = {
  productVariantData: ROWS.map(r => [r[8], {
    handle: r[1], title: r[0], sku: r[8],
    model: r[0].replace(/^ON (Men's|Women's)\s+/, '').replace(/\s+-\s+.*$/, ''),
    color: 'x', width: '', gender: /Women/.test(r[0]) ? 'Women' : 'Men',
  }]),
};
const keyOf = (m) => m.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const MAP = {};
MAP[keyOf('Performance Volt Vest')] = {
  price: '169.99', tags: 'vest, outerwear',
  // A comma, a quote and a newline, all three of the things a naive join breaks.
  description: '<p>Light, warm, 30" long</p>\n<p>Second line</p>',
  seoTitle: 'ON Performance Volt Vest | Vest', seoDesc: 'Warm, light',
};
MAP[keyOf('3" Core Shorts')] = { price: '69.99', tags: 'shorts', description: '', seoTitle: '', seoDesc: '' };
// No tags typed for this one on purpose, see the Tags assertions below.
MAP[keyOf('Cloud 6')] = { price: '149.99', tags: '', description: '', seoTitle: '', seoDesc: '' };

const out = PE.applyToCSV(csvFor(ROWS), 'on', converter, MAP);
const rows = parse(out);

console.log('\nThe round trip keeps the shape');
eq('same row count', rows.length, ROWS.length + 1);
eq('same column count on every row', rows.slice(1).every(r => r.length === HEADERS.length), true);

console.log('\nA comma inside Tags stays ONE field, it does not shift the row');
const ti = col(rows, 'Tags'), si = col(rows, 'Option1 value'), ki = col(rows, 'SKU');
// Typing tags REPLACES the column (inherited tags union what the user typed,
// the converter's own tags are not in that union), so the comma test has to be
// the row where nobody typed any: its tags must come back as one whole field.
eq('converter tags survive whole when none are typed',
  rows[4][ti], 'ON Running, Cloud 6, Men');
eq('typed tags replace the column, still one field', rows[1][ti], 'vest, outerwear');
eq('size still under Option1 value', rows[1][si], 'L');
eq('SKU still under SKU', rows[1][ki], 'ON-1WG30740561-GLA-L');
eq('row 2 size', rows[2][si], 'M');

console.log('\nAn inch mark in a title does not desync the rows after it');
eq('inch-mark title intact', rows[3][col(rows, 'Title')], 'ON Women\'s 3" Core Shorts - Black');
eq('inch-mark row size', rows[3][si], 'S');
eq('the row AFTER it is still readable', rows[4][col(rows, 'URL handle')], 'on-mens-cloud-6-ash-cinder');
eq('the row AFTER it keeps its size', rows[4][si], '7.0');

console.log('\nThe enrichment actually lands, in the right columns');
eq('price on row 1', rows[1][col(rows, 'Price')], '169.99');
eq('price on row 2 as well (price is per variant)', rows[2][col(rows, 'Price')], '169.99');
eq('description with comma, quote and newline survives',
  rows[1][col(rows, 'Description')], '<p>Light, warm, 30" long</p>\n<p>Second line</p>');
eq('SEO title', rows[1][col(rows, 'SEO title')], 'ON Performance Volt Vest | Vest');
eq('product fields are on the FIRST row of a handle only', rows[2][col(rows, 'Description')], '');
eq('different model keeps its own price', rows[4][col(rows, 'Price')], '149.99');

console.log('\nAn empty map is a no-op, it must not reshape the file');
const same = csvFor(ROWS);
eq('unchanged', PE.applyToCSV(same, 'on', converter, {}), same);

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
