// on-apparel.mjs, The Run House.
//
// Unit-tests OnApparelConverter: the size normalizer that has to collapse the
// store's four spellings of one size, and the guard that refuses a file produced
// by the pre-fix scraper. Both decide what inventory numbers land on which
// variant, so they are worth pinning.
//
// Run: node test/on-apparel.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// The converter calls Papa.parse in the browser. Stub the one option shape it
// uses (header: true) rather than pull in a dependency.
function papaParse(text, opts) {
  const lines = String(text).split('\n').filter((l) => l.trim());
  // A quote only opens a quoted field at the START of a field. Anywhere else it
  // is a literal character, which is how Papa and Python's csv both read it. That
  // detail matters here: the pre-fix scraper wrote handles like
  // on-womens-3"-core-shorts-bub, so a parser that treats any quote as a
  // delimiter swallows the rest of the line and invents handles.
  const split = (line) => {
    const out = [];
    let cur = '', q = false, atStart = true;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && atStart) { q = true; atStart = false; continue; }
      atStart = false;
      if (c === '"' && q) { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; atStart = true; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
  const data = lines.slice(1).map((l) => {
    const cols = split(l);
    const o = {};
    header.forEach((h, i) => { o[h] = (cols[i] || '').replace(/^"|"$/g, ''); });
    return o;
  });
  return { data, meta: { fields: header } };
}

const sandbox = { Papa: { parse: papaParse }, console, module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'on-apparel-converter.js'), 'utf8'), sandbox);
const C = sandbox.OnApparelConverter;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const check = (m, cond, extra) => (cond ? ok(m) : bad(m, extra));
const eq = (m, a, b) => check(m + ' (' + JSON.stringify(a) + ')', a === b, { got: a, want: b });

console.log('\nOne size, however the store spells it');
for (const group of [
  ['X-Small', 'XS', 'XSmall', 'x-small'],
  ['Small', 'S'],
  ['Medium', 'M'],
  ['Large', 'L'],
  ['X-Large', 'XL', 'XLarge'],
  ['2X-Large', '2XLarge', '2XL'],
]) {
  const keys = group.map((s) => C.normalizeSize(s));
  check(group.join(' = ') + ' collapse to one key', new Set(keys).size === 1, keys);
}
eq('X-Small and Small stay apart', C.normalizeSize('X-Small') === C.normalizeSize('Small'), false);
eq('X-Large and 2X-Large stay apart', C.normalizeSize('X-Large') === C.normalizeSize('2X-Large'), false);
eq('one size', C.normalizeSize('One size'), 'OS');

console.log('\nBra cup ranges survive, in both spellings');
check('"Small A-C" and "S (A-C)" are the same size', C.normalizeSize('Small A-C') === C.normalizeSize('S (A-C)'), [C.normalizeSize('Small A-C'), C.normalizeSize('S (A-C)')]);
check('A-C and D-DD are different variants', C.normalizeSize('Small A-C') !== C.normalizeSize('Small D-DD'));
check('a cupless Small is not a Small A-C', C.normalizeSize('Small') !== C.normalizeSize('Small A-C'));

console.log('\nArticle codes route apparel and footwear apart');
eq('apparel code out of a SKU', C.articleCode('ON-1WE11860553-BLA-Small'), '1WE11860553');
eq('footwear code out of a SKU', C.articleCode('ON-3WF10060755-PEA-5'), '3WF10060755');
check('1xx is apparel', C.isApparelCode('1WE11860553'));
check('3xx is not apparel', !C.isApparelCode('3WF10060755'));

// ---- a good apparel file -----------------------------------------------------
const HEAD = 'Handle,Title,"Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",SKU,"HS Code",COO,Location,"Bin name","Incoming (not editable)","Unavailable (not editable)","Committed (not editable)","Available (not editable)","On hand (current)","On hand (new)"';
const good = [HEAD,
  // matches 1WE11860553 on the store, whose sizes are spelled "X-Small" etc.
  'on-womens-focus-t-bla,"ON Women\'s Focus-T - Black",Size,XS,Color,"Black",,,ON-1WE11860553-BLA-XS,,,Needham,,,,,,,30',
  'on-womens-focus-t-bla,"ON Women\'s Focus-T - Black",Size,S,Color,"Black",,,ON-1WE11860553-BLA-S,,,Needham,,,,,,,5',
  'on-womens-focus-t-bla,"ON Women\'s Focus-T - Black",Size,M,Color,"Black",,,ON-1WE11860553-BLA-M,,,Needham,,,,,,,0',
  // not on the store
  'on-womens-new-thing-red,"ON Women\'s New Thing - Red",Size,Small,Color,"Red",,,ON-1WF19990001-RED-Small,,,Needham,,,,,,,2',
  // a shoe that wandered into the file
  'on-womens-cloud-6-bla,"ON Women\'s Cloud 6 - Black",Size,8.0,Color,"Black",,,ON-3WF10060755-BLA-8,,,Needham,,,,,,,4',
].join('\n');

console.log('\nA good apparel file');
const products = C.parse(good);
eq('3 products parsed', products.length, 3);
const focus = products.find((p) => p.code === '1WE11860553');
check('the Focus-T matched a store product', !!focus.store, focus.store);
eq('and picked up its handle', focus.store.handle, 'on-focus-t-women-1we11860553');
eq('gender from the article code', focus.gender, "Women's");

const rows = C.buildRows(products, { location: 'Needham' });
eq('only apparel rows are written', rows.length, 4);
check('no footwear row', !rows.some((r) => /3WF/.test(r.SKU)));
eq('the matched product writes the STORE handle', rows[0].Handle, 'on-focus-t-women-1we11860553');
eq('and the store spelling of the size', rows[0]['Option1 Value'], 'X-Small');
eq('size alignment is reported', rows.filter((r) => r._sizeAligned).length, 3);
const unmatched = rows.find((r) => /1WF19990001/.test(r.SKU));
eq('an unmatched product keeps the feed handle', unmatched.Handle, 'on-womens-new-thing-red');
eq('and its own size spelling', unmatched['Option1 Value'], 'Small');

const sum = C.summarize(products, rows);
eq('summary counts apparel colorways', sum.colorways, 2);
eq('summary counts matches', sum.matched, 1);
eq('summary counts units', sum.units, 37);

console.log('\nThe live catalog replaces the baked snapshot');
// Shaped like GET /catalog/apparel: a product the snapshot has never heard of,
// plus a code the store claims twice.
const liveCatalog = {
  generatedAt: new Date().toISOString(),
  counts: { products: 2, codes: 1, ambiguousCodes: 1 },
  products: [
    { handle: 'on-brand-new-thing-women-1wf19990001', title: 'New Thing', productType: 'Shorts', status: 'ACTIVE', codes: ['1WF19990001'], sizes: ['X-Small', 'Small', 'Medium'] },
    { handle: 'on-shared-code-a', title: 'Shared A', productType: 'Sports Bras', status: 'DRAFT', codes: ['1WE10400553'], sizes: ['Small'] },
  ],
  byCode: { '1WF19990001': 'on-brand-new-thing-women-1wf19990001' },
  ambiguousCodes: [{ code: '1WE10400553', handles: ['on-shared-code-a', 'on-shared-code-b'] }],
};
check('source is the snapshot before anything is loaded', C.source() === 'snapshot');
check('useLiveCatalog accepts the payload', C.useLiveCatalog(liveCatalog) === true);
eq('source flips to live', C.source(), 'live');

const liveProducts = C.parse(good);
const nowMatched = liveProducts.find((p) => p.code === '1WF19990001');
check('a product the snapshot never knew now matches', !!nowMatched.store, nowMatched.store);
eq('and picks up its live handle', nowMatched.store.handle, 'on-brand-new-thing-women-1wf19990001');
// The feed spells this one "XS" and "M" where the live product says "X-Small"
// and "Medium", which is the case the rewrite exists for.
const liveFeed = [HEAD,
  'on-womens-new-thing-red,"ON Women\'s New Thing - Red",Size,XS,Color,"Red",,,ON-1WF19990001-RED-XS,,,Needham,,,,,,,4',
  'on-womens-new-thing-red,"ON Women\'s New Thing - Red",Size,M,Color,"Red",,,ON-1WF19990001-RED-M,,,Needham,,,,,,,9',
].join('\n');
const liveRows = C.buildRows(C.parse(liveFeed), {});
eq('a feed "XS" is rewritten to the live "X-Small"', liveRows[0]['Option1 Value'], 'X-Small');
eq('a feed "M" is rewritten to the live "Medium"', liveRows[1]['Option1 Value'], 'Medium');
eq('and the row carries the live handle', liveRows[0].Handle, 'on-brand-new-thing-women-1wf19990001');
check('both rows are flagged as realigned', liveRows.every((r) => r._sizeAligned));
const goneStale = liveProducts.find((p) => p.code === '1WE11860553');
check('a snapshot-only product is NOT matched once live data is in charge', !goneStale.store);
check('an ambiguous code is still flagged, not silently resolved', C._storeFor('1WE10400553').ambiguous === true);

// back to the snapshot for the remaining assertions
C.useLiveCatalog(null);
eq('a null payload falls back to the snapshot', C.source(), 'snapshot');
check('and the snapshot still matches', !!C.parse(good).find((p) => p.code === '1WE11860553').store);

console.log('\nNothing is ever zeroed for being absent');
const shrunk = C.parse([HEAD, good.split('\n')[1]].join('\n'));
const shrunkRows = C.buildRows(shrunk, {});
eq('a feed with one row produces one row, no removals', shrunkRows.length, 1);

console.log('\nThe pre-fix scraper file is refused');
const bad21 = [HEAD].concat(
  ['5.0', '5.5', '6.0', '6.5', '7.0'].map((s, i) =>
    `on-womens-performance-bra-bla,"ON Women's Performance Bra - Black",Size,${s},Color,"Black",,,ON-1WG10130553-BLA-${i},,,Needham,,,,,,,30`)
).join('\n');
const badProducts = C.parse(bad21);
const problems = C.checkFile(badProducts);
const fatal = problems.filter((p) => p.fatal);
eq('one fatal problem', fatal.length, 1);
check('it names the shoe-size fingerprint', /shoe sizes/i.test(fatal[0].title), fatal[0].title);

console.log('\nAnd the real broken file on disk, if it is still there');
const REAL = '/Users/ryanmartin/Desktop/chrome extensions /on-running-inventory-1785944692292.csv';
if (fs.existsSync(REAL)) {
  const realProducts = C.parse(fs.readFileSync(REAL, 'utf8'));
  const realProblems = C.checkFile(realProducts);
  const realFatal = realProblems.filter((p) => p.fatal);
  eq('166 colorways read', realProducts.length, 166);
  check('the file is refused as fatal', realFatal.length === 1, realProblems.map((p) => p.title));
  check('all 166 are flagged, not a subset', /166 apparel/.test(realFatal[0].title), realFatal[0].title);
} else {
  console.log('  skip  the sample file is not on this machine');
}

console.log('');
if (failures) { console.log(`ON APPAREL TESTS FAILED: ${failures}`); process.exit(1); }
console.log('OnApparelConverter OK.\n');
