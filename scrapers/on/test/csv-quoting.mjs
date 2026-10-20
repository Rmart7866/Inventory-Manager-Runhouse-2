// csv-quoting.mjs, The Run House.
//
// A quote INSIDE a quoted CSV field must be doubled. Apparel names carry
// literal inch marks, 3" Core Shorts and 5" Lightweight Shorts, so wrapping a
// title as `"${title}"` produced:
//
//   on-womens-3in-core-shorts-bla,"ON Women's 3" Core Shorts - Black",Size,L,...
//
// which is not valid CSV. Every parser, including Shopify's import, reads the
// title as running to the end of the line and swallows the columns after it.
// 102 rows of a 7,112 row export on 2026-10-20, and invisible until apparel
// arrived because no shoe name has ever contained a quote.
//
// Run: node scrapers/on/test/csv-quoting.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content.js');
const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
  setAttribute: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  get textContent() { return ''; }, set textContent(v) {}, set innerHTML(v) {} });
const sb = { console: { log: noop, warn: noop, error: noop },
  setTimeout: noop, setInterval: noop, clearInterval: noop, fetch: () => Promise.reject(new Error('x')),
  location: { href: 'https://backstage.on-running.com/', hostname: 'backstage.on-running.com', pathname: '/' },
  navigator: { userAgent: '' }, performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  MutationObserver: class { observe() {} },
  document: { readyState: 'complete', addEventListener: noop, createElement: el,
    querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: noop, contains: () => false, removeChild: noop }, head: { appendChild: noop } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(SRC, 'utf8') + '\n;globalThis.__C = UnifiedShopifyConverter;', sb);

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

// A real CSV reader, so the test checks the file is PARSEABLE rather than
// checking it looks a certain way.
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const conv = new sb.__C('ON Running');
const inv = (name, color) => [{
  styleId: '1WF10150553', colorCode: 'BLA', colorName: color, productName: name,
  gender: 'Women', sizeUS: 'L', size: 'L', quantity: 227,
}];

console.log('\nAn inch mark in a product name does not break the row');
{
  const csv = conv.convertToInventoryCSV(inv('3" Core Shorts', 'Black'), {});
  const rows = parseCSV(csv);
  eq('header plus one row', rows.length, 2);
  eq('19 columns, not fewer', rows[1].length, 19);
  eq('the title survives intact', rows[1][1], "ON Women's 3\" Core Shorts - Black");
  eq('the SKU is still in column 9', rows[1][8], 'ON-1WF10150553-BLA-L');
  eq('and the quantity in the last column', rows[1][18], '227');
}

console.log('\nA quote in the COLOUR name too');
{
  const csv = conv.convertToInventoryCSV(inv('Core Tank', 'Black "Special"'), {});
  const rows = parseCSV(csv);
  eq('19 columns', rows[1].length, 19);
  eq('colour survives', rows[1][5], 'Black "Special"');
}

console.log('\nOrdinary names are unchanged');
{
  const csv = conv.convertToInventoryCSV(inv('Cloudmonster 3', 'Black'), {});
  const rows = parseCSV(csv);
  eq('19 columns', rows[1].length, 19);
  eq('title', rows[1][1], "ON Women's Cloudmonster 3 - Black");
}

console.log('\nThe real shapes that caused this');
{
  for (const n of ['3" Core Shorts', '5" Lightweight Shorts', '7" Running Shorts']) {
    const rows = parseCSV(conv.convertToInventoryCSV(inv(n, 'Black'), {}));
    if (rows[1].length === 19) ok(n); else bad(n, rows[1].length);
  }
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
