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

import { check, rowsFromCSV, LIMITS, POD_STYLES, detectCap, BASELINE_VERSION } from '../tools/inventory-guardrail.mjs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const blocks = (res, needle, m) =>
  (res.blocks.some(b => b.includes(needle)) ? ok(m) : bad(m, res.blocks.slice(0, 2)));
const passes = (res, m) => (res.ok ? ok(m) : bad(m, res.blocks));

// THE BASELINE IS DERIVED FROM THE FIXTURE, NOT TYPED OUT.
//
// Three separate test failures came from a hand written baseline disagreeing
// with what make() generates: units said 20,000 against 12,000 so a healthy
// run tripped TOTAL SWING, then 4,000 against 14,520, then 240 against 360.
// Every time the guardrail was right and the fixture was wrong. baselineFor
// computes it exactly the way the CLI does, so the two cannot drift again.
function baselineFor(rows, at = '2026-10-20') {
  const res = check(rows, null);
  const brandZeroShare = {};
  for (const [b, st] of Object.entries(res.summary.brands)) {
    if (st.rows >= 20) brandZeroShare[b] = st.zeros / st.rows;
  }
  return { v: BASELINE_VERSION, at, rows: res.summary.rows, units: res.summary.units,
    atCapShare: res.summary.atCapShare, cap: res.summary.cap,
    brandZeroShare, locations: res.summary.locations };
}

// A HEALTHY FILE HAS A SPREAD OF QUANTITIES, and the fixture has to as well.
// It used to put 12 on every row, which means the most common non-zero value
// is also the maximum, which is exactly the signature detectCap looks for. So
// a "normal" fixture read as a capped feed. Real data never looks like that:
// measured over five brands, a healthy file's most common non-zero value is 1
// or 2 and the maximum is in the hundreds.
function make(n, fn) {
  return Array.from({ length: n }, (_, i) => Object.assign({
    handle: 'style-' + (i % 50), sku: 'ASICS-' + (i % 50) + '-' + i,
    location: 'Needham', size: String(6 + (i % 10)), colour: 'BLACK',
    qty: 1 + (i % 7) + (i % 13),
  }, fn ? fn(i) : {}));
}

const BASE = baselineFor(make(1000));

// A REAL ASICS PAGE SCRAPE: a ceiling at 30 holding 40% of the non-zero rows,
// two thirds of the file at zero, the rest a spread. Those are the measured
// proportions of the 2026-10-27 file.
const asicsShaped = (i) => ({ qty: i < 250 ? 30 : (i < 850 ? 0 : 1 + (i % 11)) });
const BASE_ASICS = baselineFor(make(1000, asicsShaped), '2026-10-22');

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

console.log('\nThe ceiling is DETECTED, not configured, which is how Brooks was found');
{
  // The first version hardcoded 30, so it was blind to every brand but ASICS.
  // Measured over the newest real file per brand on 2026-10-29: ASICS tops out
  // at 30 with 40% of non-zero rows on it, BROOKS at 100 with 58%, while HOKA
  // (max 2100, modal 300), PUMA (max 452, modal 1) and ON (max 4069, modal 1)
  // have no ceiling. The signature is that the most common non-zero value IS
  // the maximum, and it classifies all five correctly.
  const capped = (ceiling) => make(1000, (i) => ({ qty: i < 250 ? ceiling : (i < 850 ? 0 : 1 + (i % 11)) }));

  const a = detectCap(capped(30));
  a && a.value === 30 ? ok('an ASICS shaped file is detected as a ceiling at 30')
                      : bad('missed the 30 ceiling', a);
  const b = detectCap(capped(100));
  b && b.value === 100 ? ok('a BROOKS shaped file is detected as a ceiling at 100, with no configuration')
                       : bad('missed the 100 ceiling', b);
  detectCap(make(1000)) === null
    ? ok('a healthy spread has no ceiling')
    : bad('a healthy file was called capped', detectCap(make(1000)));

  // HOKA is the case that makes a naive rule wrong: 300 is its most common
  // non-zero value but the maximum is 2100, so those are real round pack
  // sizes, not a ceiling.
  const hoka = make(1000, (i) => ({ qty: i < 200 ? 300 : (i < 260 ? 2100 : (i < 600 ? 0 : 1 + (i % 9))) }));
  detectCap(hoka) === null
    ? ok('a common round number that is NOT the maximum is left alone, the HOKA case')
    : bad('HOKA shaped round numbers were called a ceiling', detectCap(hoka));

  // A MIXED FILE IS THE NORMAL CASE FOR ASICS NOW, and the first rule missed
  // it. One run carries both sources: the page scrape caps at 30 and the two
  // singlet styles come from the uncapped availability API and run into the
  // hundreds. So "nothing above the modal value" was too strict, and the real
  // 2026-10-29 run lost its ceiling warning entirely: 1,051 rows at 30, 38% of
  // the non-zero ones, with 57 above it making the maximum 302.
  const mixed = make(1000, (i) => (
    i < 250 ? { qty: 30 }
      : i < 850 ? { qty: 0 }
      : i < 980 ? { qty: 1 + (i % 11) }
      : { sku: 'ASICS-TF3085-90-' + i, qty: 150 + (i % 150) }));
  const mc = detectCap(mixed);
  mc && mc.value === 30
    ? ok('a capped page scrape mixed with uncapped API rows still shows its ceiling')
    : bad('the mixed file lost its ceiling, which is what happened for real', mc);

  // and a ceiling nobody is really pressed against is not worth reporting
  const thin = make(1000, (i) => ({ qty: i < 20 ? 60 : (i < 500 ? 0 : 1 + (i % 11)) }));
  detectCap(thin) === null
    ? ok('a maximum only a handful of rows reach is not a ceiling')
    : bad('a thin maximum was called a ceiling', detectCap(thin));
}

console.log('\nA ceiling is reported, and only CHANGES block');
{
  const asics = make(1000, asicsShaped);
  const steady = check(asics, BASE_ASICS);
  steady.ok ? ok('the same ceiling at the same share passes, that file imported fine')
            : bad('a steady ceiling is blocked', steady.blocks);
  steady.warnings.some((w) => w.includes('CEILING AT 30'))
    ? ok('and it is always reported, so the understatement stays visible')
    : bad('the ceiling is not even mentioned', steady.warnings);

  // THE CEILING MOVING is the alarm: it means the capture changed under you,
  // which is what a stale extension or a switched data source looks like.
  blocks(check(make(1000, (i) => ({ qty: i < 250 ? 100 : (i < 850 ? 0 : 1 + (i % 11)) })), BASE_ASICS),
    'THE CEILING MOVED', 'a file that tops out at 100 against a 30 baseline is blocked');

  // more of the file piling onto the ceiling means more of it is a guess
  blocks(check(make(1000, (i) => ({ qty: i < 600 ? 30 : (i < 850 ? 0 : 1 + (i % 11)) })), BASE_ASICS),
    'MORE OF THE FILE IS ON THE CEILING', 'the ceiling share jumping is blocked');

  // losing a ceiling is good news if intended, so it warns rather than blocks
  const uncapped = check(make(1000), BASE_ASICS);
  uncapped.warnings.some((w) => w.includes('no ceiling'))
    ? ok('a ceiling disappearing is flagged, since it may mean the source changed')
    : bad('losing the ceiling said nothing at all', uncapped.warnings);
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
    'ALMOST ENTIRELY ZERO', '98% zero is blocked when the family was two thirds zero');

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

console.log('\nAn older baseline is handled, not trusted blindly');
{
  // CHANGING WHAT A FIELD MEANS IS A SILENT TRAP. atCapShare used to be the
  // share of ALL rows and is now the share of NON-ZERO rows, so an old 0.14
  // against a new 0.38 is a units mismatch rather than a change in the data.
  // It blocked a run that had just been verified good, 47 links of 47.
  const old1 = { at: '2026-10-22', rows: 1000, units: BASE_ASICS.units,
    atCapShare: 0.14, brandZeroShare: { ASICS: 0.66 }, locations: { Needham: 1000 } };
  const res = check(make(1000, asicsShaped), old1);
  res.warnings.some((w) => w.includes('older format'))
    ? ok('an unversioned baseline is reported as stale rather than compared against')
    : bad('a stale baseline was used silently', res.warnings);
  res.blocks.some((b) => b.includes('CEILING'))
    ? bad('the ceiling comparison ran against incompatible units', res.blocks)
    : ok('and the ceiling comparison is skipped, so it cannot block spuriously');

  // rows and units never changed meaning, so those comparisons must survive
  blocks(check(make(400), { ...old1, rows: 1000 }), 'ROW COLLAPSE',
    'row count is still compared, since that field never changed meaning');

  // a current baseline is compared in full
  const fresh = baselineFor(make(1000, asicsShaped));
  fresh.v === BASELINE_VERSION
    ? ok('a baseline written now carries the current version')
    : bad('the version is not stamped on write', fresh.v);
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
