// inventory-guardrail.mjs, The Run House.
//
// Every case here is a bug that SHIPPED in the week of 2026-10-23. The point of
// the guardrail is that a scheduled run would have repeated each of them three
// times a day with nobody watching, so each one gets a test that proves the
// gate closes.
//
// Run: node test/inventory-guardrail.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { check, rowsFromCSV, LIMITS, POD_STYLES } from '../tools/inventory-guardrail.mjs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const blocks = (res, needle, m) =>
  (res.blocks.some(b => b.includes(needle)) ? ok(m) : bad(m, res.blocks.slice(0, 2)));
const passes = (res, m) => (res.ok ? ok(m) : bad(m, res.blocks));

// The baseline must MATCH what make() generates, 1000 rows at 12 units each.
// It originally said 20,000 and a perfectly healthy 5%-zeros run tripped the
// swing check. The guardrail was right and the fixture was wrong, which is
// the correct way round for a safety device to fail.
const BASE = { at: '2026-10-20', rows: 1000, units: 12000, locations: { Needham: 1000 },
  atCapShare: 0.04, brandZeroShare: { ASICS: 0.05 } };

// AND A SECOND BASELINE, taken from the real 2026-10-22 file: ASICS routinely
// sits around two thirds zero and 14% of rows on the page cap. The first
// version of this guardrail used absolute thresholds and blocked that file,
// which was the last one to import cleanly. A gate that fires on a good run
// gets turned off, so the thresholds are relative and these fixtures prove it.
const BASE_ASICS = { at: '2026-10-22', rows: 1000, units: 6600, locations: { Needham: 1000 },
  atCapShare: 0.14, brandZeroShare: { ASICS: 0.66 } };

// the shape of a real ASICS page scrape: 14% on the cap, two thirds at zero,
// the rest ordinary numbers. Totals 6,600 units, matching BASE_ASICS.
const asicsShaped = (i) => ({ qty: i < 140 ? 30 : (i < 800 ? 0 : 12) });

function make(n, fn) {
  return Array.from({ length: n }, (_, i) => Object.assign({
    handle: 'style-' + (i % 50), sku: 'ASICS-' + (i % 50) + '-' + i,
    location: 'Needham', size: String(6 + (i % 10)), colour: 'BLACK', qty: 12,
  }, fn ? fn(i) : {}));
}

console.log('\nA healthy run passes');
passes(check(make(1000), BASE), 'a normal looking file is allowed through');

console.log('\nThe delivery window bug: one record per window, duplicates decide the number');
{
  // 8,037 variants became 39,131 rows, and 3,066 ended on a zero.
  const rows = [];
  make(1000).forEach(r => { rows.push(r); rows.push({ ...r, qty: 0 }); });
  const res = check(rows, BASE);
  blocks(res, 'DUPLICATE VARIANTS', 'duplicated variants are blocked');
  res.blocks.some(b => b.includes('keeps the LAST row'))
    ? ok('and the message says why that matters for a Shopify import')
    : bad('the message does not explain the consequence');
}

console.log('\nThe 30 cap: normal on a page scrape, alarming when it JUMPS');
{
  // 33% at the cap against a 4% baseline is a scrape that stopped using the API
  const rows = make(1000, (i) => ({ qty: i % 3 === 0 ? 30 : 12 }));
  blocks(check(rows, BASE), 'CAPPED NUMBERS JUMPED', 'a jump from 4% to 33% at the cap is blocked');
  // the real 2026-10-22 file: 14% at the cap, against a 14% baseline
  const steady = check(make(1000, asicsShaped), BASE_ASICS);
  steady.ok ? ok('but a steady 14% at the cap is allowed, that file imported fine')
            : bad('a steady cap share is blocked', steady.blocks);
  steady.warnings.some(w => w.includes('page cap'))
    ? ok('and it is reported as a warning, so the understatement is still visible')
    : bad('the cap is not even mentioned', steady.warnings);
}

console.log('\nZeroing, measured against the brand\'s own last run');
{
  // ASICS at 67% zero is just ASICS. The guardrail must not call that a bug.
  const normal = check(make(1000, asicsShaped), BASE_ASICS);
  normal.ok ? ok('66% of ASICS rows at zero passes against a 66% baseline')
            : bad('a normal ASICS file is blocked', normal.blocks);

  // the same file against a baseline where the brand was healthy IS the signal
  blocks(check(make(1000, (i) => ({ qty: i % 100 < 67 ? 0 : 12 })), BASE),
    'ZEROING JUMPED', 'the same two thirds is blocked when the brand was 5% zero last time');

  // and a brand that goes almost entirely dark is blocked whatever the baseline
  blocks(check(make(1000, (i) => ({ qty: i % 100 < 98 ? 0 : 12 })), BASE_ASICS),
    'BRAND ALMOST ENTIRELY ZERO', '98% zero is blocked when the brand was two thirds zero');

  // BUT a style that is simply sold out stays sold out, and must not block
  // every run from now on. 1011B read 97% zero on two good runs three days
  // apart, and the first version of this stopped both of them.
  {
    const soldOut = { ...BASE_ASICS, units: 360, atCapShare: 0, brandZeroShare: { ASICS: 0.97 } };
    const res = check(make(1000, (i) => ({ qty: i < 970 ? 0 : 12 })), soldOut);
    res.ok ? ok('97% zero against a 97% baseline passes, it is genuinely sold out')
           : bad('a steady sold-out brand is blocked', res.blocks);
  }
}

console.log('\nPrint on demand must never be written to Needham');
{
  // THE BUG THAT ACTUALLY COST SOMETHING. The 2026-10-27 file was normal in
  // every statistical respect and still created 45 Needham levels on the
  // singlets, because 96 rows out of 7,647 is noise.
  const podRow = (loc) => ({ handle: 'rival-ii-singlet', sku: 'ASICS-TF3085-90-M',
    location: loc, size: 'M', colour: 'Black', qty: 40 });
  const withPod = (loc) => make(1000).concat(Array.from({ length: 96 }, (_, i) =>
    ({ ...podRow(loc), sku: 'ASICS-TF3085-90-' + i })));

  const bad1 = check(withPod('Needham'), BASE);
  blocks(bad1, 'PRINT ON DEMAND IN THE WRONG PLACE', '96 singlet rows at Needham are blocked');
  bad1.blocks.some(b => b.includes('Warehouse'))
    ? ok('and the message says where they should have gone')
    : bad('the message does not name the right location');

  const good = check(withPod('Warehouse'), BASE);
  good.ok ? ok('the same rows at Warehouse pass')
          : bad('correctly located singlets are blocked', good.blocks);
  good.warnings.some(w => w.includes('print-on-demand'))
    ? ok('and are confirmed in the warnings, so a silent pass is distinguishable')
    : bad('a correct POD run says nothing at all', good.warnings);

  // the check must survive the file carrying no singlets at all, which is the
  // normal case for a footwear-only link list
  passes(check(make(1000), BASE), 'a file with no POD styles is unaffected');
  POD_STYLES.length >= 2 ? ok('both singlet styles are covered')
                         : bad('POD_STYLES is incomplete', POD_STYLES);

  // a small drift in the normal direction is not worth stopping a run for
  passes(check(make(1000, (i) => ({ qty: i < 140 ? 30 : (i < 740 ? 0 : 12) })), BASE_ASICS),
    '66% to 60% is ordinary movement and allowed');
}

console.log('\nA partial scrape, which looks like a small clean file');
{
  blocks(check(make(400), BASE), 'ROW COLLAPSE', '400 rows against a 1000 row baseline is blocked');
  blocks(check(make(10), BASE), 'below the minimum', 'a tiny file is blocked outright');
  blocks(check([], BASE), 'no rows at all', 'an empty file is blocked');
}

console.log('\nA total that moves too far in one day');
blocks(check(make(1000, () => ({ qty: 60 })), BASE), 'TOTAL SWING', 'a 200% jump in units is blocked');

console.log('\nRows that would land in the wrong place');
{
  blocks(check(make(1000, (i) => (i < 100 ? { location: '' } : {})), BASE),
    'ROWS WITH NO LOCATION', 'a blank location is blocked');
  const res = check(make(1000, (i) => (i < 100 ? { location: 'Warehouse' } : {})), BASE);
  res.warnings.some(w => w.includes('Warehouse'))
    ? ok('a location that is new since the last run is flagged')
    : bad('a new location passes unnoticed', res.warnings);
}

console.log('\nRubbish data is refused rather than interpreted');
{
  blocks(check(make(1000, (i) => (i === 5 ? { qty: -4 } : {})), BASE), 'NEGATIVE', 'negative stock is blocked');
  blocks(check(make(1000, (i) => (i === 5 ? { qty: NaN } : {})), BASE), 'non numeric', 'a non numeric quantity is blocked');
}

console.log('\nNo baseline is a block, not a pass');
{
  const res = check(make(1000), null);
  blocks(res, 'NO BASELINE', 'the first ever run must be looked at by a human');
  res.ok === false ? ok('and it fails closed rather than assuming the best') : bad('it passed without a baseline');
}

console.log('\nThe CSV reader handles the real scraper format');
{
  const csv = 'Handle,Title,"Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",SKU,"HS Code",COO,Location,"Bin name","Incoming (not editable)","Unavailable (not editable)","Committed (not editable)","Available (not editable)","On hand (current)","On hand (new)"\n' +
    'tf3085-90,"Men\'s, Rival II",Size,M,Color,"BLACK",,,TF3085-90-M,,,Warehouse,,,,,,,205\n' +
    'tf3085-90,"Men\'s, Rival II",Size,L,Color,"BLACK",,,TF3085-90-L,,,Warehouse,,,,,,,0\n';
  const rows = rowsFromCSV(csv);
  rows.length === 2 ? ok('two rows parsed') : bad('row count', rows.length);
  rows[0].qty === 205 ? ok('quantity read from the last column') : bad('qty', rows[0].qty);
  rows[0].location === 'Warehouse' ? ok('location read') : bad('location', rows[0].location);
  rows[0].sku === 'TF3085-90-M' ? ok('sku read') : bad('sku', rows[0].sku);
  // a comma inside a quoted title must not shift the columns, which is the
  // exact failure that cost 674 products in the apparel drop
  rows[0].size === 'M' ? ok('a comma inside a quoted field does not shift the columns') : bad('size', rows[0].size);
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
