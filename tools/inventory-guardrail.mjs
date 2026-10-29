// inventory-guardrail.mjs, The Run House.
//
// Sits between CAPTURE and WRITE and refuses a run that looks wrong. It writes
// nothing and changes nothing; it only ever says yes or no, and why.
//
// WHY THIS EXISTS. Every inventory bug found in the week of 2026-10-23 produced
// output that looked completely normal:
//
//   the fast scrape emitted 39,131 rows for 8,037 variants because it treated
//   one delivery window per block as chunks to concatenate, and 3,066 variants
//   ended on a zero row. Importing it zeroed three thousand shoes that had stock.
//
//   a page scrape wrote 30 for every size over 30, because the portal prints
//   "30+". Black Small is really 161.
//
//   a scrape with a stale extension put 96 singlet rows into NEEDHAM at capped
//   numbers, which reads downstream as real dropship footwear stock.
//
// A human running these by hand caught them eventually. A job running three
// times a day would have written each one 21 times a week with nobody looking.
// So the checks below are not hypothetical: each one is a bug that shipped.
//
// FAILS CLOSED. Anything it cannot explain is a BLOCK, not a warning. A missing
// baseline is a block on the first run, which is correct: there is nothing to
// compare against, so a human should look once and then it has a baseline.
//
//   node tools/inventory-guardrail.mjs <file.csv>            check a scraper CSV
//   node tools/inventory-guardrail.mjs <file.csv> --accept   record it as the baseline
//   node tools/inventory-guardrail.mjs <file.csv> --json     machine readable
//
// Exit code 0 means safe to write. Anything else means do not write.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASELINE = path.join(ROOT, 'inventory-guardrail-baseline.json');

// Thresholds. Deliberately conservative: a false block costs a human five
// minutes, a false pass costs the store its stock numbers.
// CALIBRATED AGAINST REAL FILES, NOT GUESSED. The first version used absolute
// thresholds and blocked every legitimate run:
//
//   the 2026-10-22 scrape, which was imported and was fine, has 67% of ASICS
//   rows at zero and 14% sitting on exactly 30. Both are normal. Most sizes of
//   most colourways genuinely are out of stock at the supplier, and the 30 cap
//   is a known limitation of reading the page.
//
// A gate that fires on every good run gets switched off, so the absolute checks
// became RELATIVE: what matters is a brand that zeroes out MORE than it did
// last time, not a brand that is mostly zero. Only the impossible cases stay
// absolute.
export const LIMITS = {
  zeroShareJump: 0.20,         // a brand's zero share rising 20 points vs baseline
  absoluteZeroShare: 0.97,     // a brand almost entirely zero, whatever the baseline
  maxTotalSwing: 0.40,         // total units moving more than 40% vs baseline
  maxRowDropShare: 0.25,       // 25% fewer rows than baseline, a partial scrape
  maxDuplicateShare: 0.01,     // any real duplication means a windowing bug
  maxZeroWinsDuplicates: 0,    // a zero written over real stock, even once, is a wrongful zero
  atCapShareJump: 0.10,        // 10 points more rows at the cap than last time
  minCapShare: 0.10,           // a ceiling holding under 10% of non-zero rows is probably real stock
  minGroupShare: 0.04,         // a style family smaller than 4% of the file is too small to judge
  minRows: 50,
};

// PRINT ON DEMAND STYLES MUST NEVER BE WRITTEN TO NEEDHAM.
//
// This is the check that matters most, and no statistical test can find it.
// On 2026-10-27 a scrape ran from a stale extension that predated the per-line
// location, so all 96 singlet rows carried "Needham" and 45 Needham inventory
// levels were created on print-on-demand listings before anyone noticed. That
// file is otherwise completely normal: 7,647 rows, 48,771 units, 63% zero, in
// line with every good run before it. 96 rows out of 7,647 is noise, so the
// duplicate, zeroing, swing and cap checks all pass it and always will.
//
// The blanks are bought from ASICS per order and held at Warehouse, so a
// Needham row on one of these is never right. Writing 300 singlets into
// Needham looks exactly like real dropship stock, which is why it went
// unnoticed, and it is why this is a BLOCK rather than a warning.
//
// The list is EXPLICIT, the same reasoning as tools/set-inventory-policy.mjs
// taking explicit handles: a pattern like /^TF/ would quietly catch any future
// ASICS apparel style, including ones that genuinely are stocked at Needham.
export const POD_STYLES = ['TF3085', 'TF2934'];
export const POD_LOCATION = 'Warehouse';

// ---------------------------------------------------------------- csv -----
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

// THE COLUMNS ARE FOUND BY NAME, NOT BY POSITION, because the format varies.
// Measured 2026-10-29: the ASICS scraper writes 19 columns, Puma's writes 20
// (it adds Barcode at position 10), and an older Puma export is a different
// 10 column format with no `On hand (new)` at all and `Main Location` in the
// Location column.
//
// That last one is why `missingColumns` exists. Handed such a file the reader
// used to return a full set of rows whose every quantity was NaN, and the
// verdict then read "a row has a non numeric quantity", which sends you
// looking for a bad row in a file whose problem is that it is the wrong KIND
// of file. It says so now.
export const REQUIRED_COLUMNS = ['On hand (new)', 'Location', 'SKU'];

export function rowsFromCSV(text) {
  const t = parseCSV(text);
  if (!t.length) return [];
  const head = t[0].map(h => h.replace(/^"|"$/g, '').trim());
  const idx = (name) => head.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iH = idx('Handle'), iSku = idx('SKU'), iLoc = idx('Location');
  const iQty = idx('On hand (new)'), iS = idx('Option1 Value'), iC = idx('Option2 Value');
  const missing = REQUIRED_COLUMNS.filter(c => idx(c) < 0);
  const out = t.slice(1).map(r => ({
    handle: (r[iH] || '').trim(),
    sku: (r[iSku] || '').trim(),
    location: (r[iLoc] || '').trim(),
    size: (r[iS] || '').trim(),
    colour: (r[iC] || '').trim(),
    qty: parseInt(r[iQty], 10),
  })).filter(r => r.handle || r.sku);
  // carried on the array so check() can give the real reason without changing
  // the signature every caller already uses
  Object.defineProperty(out, 'missingColumns', { value: missing, enumerable: false });
  return out;
}

// THE CAP IS DETECTED, NOT HARDCODED, AND THAT IS HOW BROOKS WAS FOUND.
//
// The first version hardcoded 30, the ASICS ceiling, so it was blind to every
// other brand. Measured over the newest real file per brand, 2026-10-29:
//
//   brand    rows   max   most common non-zero value
//   ASICS    7,647    30   30, 40% of non-zero     a cap, documented
//   BROOKS   5,003   100   100, 58% of non-zero    A CAP, AND NOBODY KNEW
//   HOKA     3,057  2100   300, 19% of non-zero    not a cap, round pack sizes
//   PUMA     3,678   452   1, 12% of non-zero      healthy
//   ON       7,112  4,069  1, 5% of non-zero       healthy
//
// Brooks reads "100+" off the FastTrack grid and writes 100, the same bug as
// ASICS writing 30, on 1,904 rows a run. Checked across 14 Brooks files
// spanning six weeks: the maximum is exactly 100 every single time and NEVER
// once above it, which no real distribution does.
//
// The signature that separates a cap from honest round numbers is simple: on a
// capped feed the MOST COMMON non-zero value is also the MAXIMUM, because
// everything deeper piles onto the ceiling. It classifies all five brands
// above correctly, where any fixed number gets four of them wrong.
export function detectCap(rows) {
  const nz = rows.map(r => r.qty).filter(q => Number.isFinite(q) && q > 0);
  if (nz.length < 50) return null;
  const freq = new Map();
  for (const q of nz) freq.set(q, (freq.get(q) || 0) + 1);
  let value = 0, count = 0;
  for (const [q, c] of freq) if (c > count || (c === count && q > value)) { value = q; count = c; }
  const max = Math.max(...nz);
  // the modal value must BE the ceiling, and hold a real share of the file
  if (value !== max) return null;
  const share = count / nz.length;
  if (share < LIMITS.minCapShare) return null;
  return { value, count, share };
}

// THESE ARE STYLE FAMILIES, NOT BRANDS, and the name mattered because it hid
// a bug. Each run is one supplier, so grouping inside a file can only ever be
// by style, and the point is to notice a SUBSET of the file collapsing while
// the rest looks fine.
//
// The shape of the key is brand dependent and that is unavoidable. ASICS SKUs
// are `1011C127-001-10`, so stripping the trailing digits gives `1011C`, a
// family of about 3,700 rows. Brooks SKUs are `110442297-...`, where stripping
// digits leaves nothing, so the whole style number becomes the key and every
// style is its own group of 30 to 90 rows.
//
// That difference was a live false positive: measured 2026-10-29 over 14 real
// Brooks files, style 110442297 is legitimately 98 to 100% zero, which tripped
// the almost-entirely-zero rule on 6 of 14 runs. A single sold out style is
// not a brand collapsing, and a gate that fires on good runs gets switched
// off. So a group has to be a real share of the file before it is judged,
// which keeps every ASICS family that has ever caught something (1011C, 1012B,
// 1013A, 1012C, 1011B at 5.5% and up) and drops the noise.
const groupOf = (r) => {
  const s = (r.sku || r.handle || '').toUpperCase();
  const m = /^([A-Z0-9]+?)[-_]/.exec(s);
  return m ? m[1].replace(/[0-9]+$/, '') || m[1] : 'UNKNOWN';
};

// ------------------------------------------------------------- checks -----
export function check(rows, baseline, limits = LIMITS) {
  const blocks = [], warnings = [];
  const n = rows.length;
  const summary = { rows: n, units: 0, zeros: 0, atCap: 0, locations: {}, brands: {} };

  if (!n) { blocks.push('the file has no rows at all'); return { ok: false, blocks, warnings, summary }; }

  // WRONG KIND OF FILE, SAID PLAINLY. Without this the symptom is thousands of
  // "non numeric quantity" rows, which reads like corrupt data rather than a
  // header that never had the column.
  const missing = rows.missingColumns || [];
  if (missing.length) {
    blocks.push('NOT A SHOPIFY INVENTORY CSV: no ' + missing.map(c => '"' + c + '"').join(' or ') +
      ' column. This looks like a different export, so nothing in it can be judged.');
    return { ok: false, blocks, warnings, summary };
  }
  if (n < limits.minRows) blocks.push('only ' + n + ' rows, below the minimum of ' + limits.minRows +
    '. A partial scrape looks exactly like this.');

  const seen = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.qty)) { blocks.push('a row has a non numeric quantity: ' + JSON.stringify(r).slice(0, 90)); break; }
    if (r.qty < 0) { blocks.push('a row carries NEGATIVE stock: ' + r.sku + ' = ' + r.qty); break; }
    summary.units += r.qty;
    if (r.qty === 0) summary.zeros++;

    summary.locations[r.location || '(none)'] = (summary.locations[r.location || '(none)'] || 0) + 1;
    const b = groupOf(r);
    summary.brands[b] = summary.brands[b] || { rows: 0, zeros: 0, units: 0 };
    summary.brands[b].rows++; summary.brands[b].units += r.qty;
    if (r.qty === 0) summary.brands[b].zeros++;
    const key = (r.sku || (r.handle + '|' + r.size + '|' + r.colour)).toUpperCase();
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r.qty);
  }

  // 1. DUPLICATE VARIANTS, AND THE TWO KINDS ARE NOT THE SAME RISK.
  //
  // A Shopify import keeps the LAST row for a variant. So a duplicate whose
  // copies all carry the SAME number is harmless noise: last-row-wins writes
  // the value it would have written anyway. A duplicate whose copies DISAGREE
  // is a silently wrong number, and the dangerous subset is the one where a
  // zero comes last over a real figure, because that zeroes stock that exists.
  //
  // Treating both the same was too lenient in one direction and too noisy in
  // the other. Measured 2026-10-29 on chunked exports in Downloads: 2, 5 and 8
  // zero-wins duplicates per 1,000 row chunk, which is 0.2 to 0.8% and sailed
  // under a 1% threshold while quietly zeroing that many real variants. The
  // 2026-10-14 ASICS file is the other end: 3,066 variants ending on a zero
  // that had stock in an earlier row.
  const dupGroups = [...seen.values()].filter(v => v.length > 1);
  const dupRows = dupGroups.reduce((a, v) => a + v.length - 1, 0);
  const disagreeing = dupGroups.filter(v => new Set(v).size > 1);
  const zeroWins = disagreeing.filter(v => v[v.length - 1] === 0 && v.some(q => q > 0));
  summary.dupRows = dupRows;
  summary.dupDisagreeing = disagreeing.length;
  summary.dupZeroWins = zeroWins.length;

  // ANY zero-wins duplicate is a wrongful zero, so the bar is a count, not a
  // share. One is a bug; a thousand is the windowing bug.
  if (zeroWins.length > limits.maxZeroWinsDuplicates) {
    blocks.push('DUPLICATES THAT ZERO REAL STOCK: ' + zeroWins.length + ' variant(s) appear more than ' +
      'once with a ZERO last and a real figure earlier, so the import writes the zero. Examples: ' +
      zeroWins.slice(0, 3).map(v => v.join(' then ')).join('; ') + '.');
  }
  if (disagreeing.length > zeroWins.length) {
    warnings.push((disagreeing.length - zeroWins.length) + ' variant(s) repeat with DIFFERENT non-zero ' +
      'numbers, so row order decides which is written.');
  }
  if (dupRows / n > limits.maxDuplicateShare) {
    const worst = Math.max(...dupGroups.map(v => v.length));
    blocks.push('DUPLICATE VARIANTS: ' + dupRows + ' of ' + n + ' rows repeat a variant, worst appears ' +
      worst + ' times. A Shopify import keeps the LAST row, so duplicates silently decide the number. ' +
      'This is what one-record-per-delivery-window looks like.');
  } else if (dupRows) {
    warnings.push(dupRows + ' duplicated row(s), all carrying the same number, so harmless to the import.');
  }

  // 2. the 30 cap. Normal on a page scrape, alarming if it JUMPS.
  const cap = detectCap(rows);
  summary.cap = cap ? cap.value : null;
  summary.atCap = cap ? cap.count : 0;
  summary.atCapShare = cap ? cap.share : 0;
  if (cap) {
    warnings.push('CEILING AT ' + cap.value + ': ' + cap.count + ' rows (' +
      (100 * cap.share).toFixed(0) + '% of non-zero) sit on it and none go higher, so the feed ' +
      'prints "' + cap.value + '+" and this understates every size deeper than that.');
  }
  // THE CEILING MOVING IS THE ALARM, not the ceiling existing. A brand that
  // suddenly caps lower means the capture changed under you, which is what a
  // stale extension or a switched data source looks like.
  if (baseline && baseline.cap != null && cap && cap.value !== baseline.cap) {
    blocks.push('THE CEILING MOVED: this file tops out at ' + cap.value + ', last time it was ' +
      baseline.cap + '. The feed or the way it is read has changed.');
  }
  if (baseline && baseline.cap != null && !cap) {
    warnings.push('last run topped out at ' + baseline.cap + ' and this one has no ceiling. ' +
      'Good if the data source changed on purpose, suspicious otherwise.');
  }
  if (baseline && baseline.atCapShare != null && cap &&
      summary.atCapShare - baseline.atCapShare > limits.atCapShareJump) {
    blocks.push('MORE OF THE FILE IS ON THE CEILING: ' + (100 * summary.atCapShare).toFixed(0) +
      '% of non-zero rows are at ' + cap.value + ', against ' +
      (100 * baseline.atCapShare).toFixed(0) + '% last time. A jump means more of it is a guess.');
  }

  // 3. zeroing, per brand, measured against what that brand looked like LAST time.
  // ASICS is routinely 60 to 70% zero: that is the supplier, not a bug.
  // FILE WIDE FIRST, because it needs no grouping to be meaningful and so it
  // works on any brand's SKU shape. The per-group checks below are the
  // refinement that localises a collapse.
  const zeroShare = summary.zeros / n;
  summary.zeroShare = zeroShare;
  const wasFile = baseline && baseline.zeroShare;
  if (wasFile != null && zeroShare - wasFile > limits.zeroShareJump) {
    blocks.push('THE WHOLE FILE ZEROED OUT MORE: ' + (100 * zeroShare).toFixed(0) +
      '% of rows are at zero, against ' + (100 * wasFile).toFixed(0) + '% last time, ' +
      (100 * (zeroShare - wasFile)).toFixed(0) + ' points more stock gone in one run.');
  }

  const prior = (baseline && (baseline.groupZeroShare || baseline.brandZeroShare)) || {};
  for (const [b, s] of Object.entries(summary.brands)) {
    if (s.rows < 20 || s.rows / n < limits.minGroupShare) continue;
    const share = s.zeros / s.rows;
    s.zeroShare = share;
    const was = prior[b];
    // A STYLE CAN GENUINELY BE SOLD OUT, so near-total zero is not by itself a
    // bug. 1011B read 97% zero on 2026-09-18 and 97% again on 2026-09-21, two
    // good runs three days apart: ASICS really has nothing left in it. An
    // absolute block here stopped both. At the extreme there is nowhere left to
    // climb, so compare against last time with a tight margin instead.
    if (share >= limits.absoluteZeroShare && (was == null || share - was > 0.02)) {
      blocks.push('A STYLE FAMILY IS ALMOST ENTIRELY ZERO: ' + b + ' is ' + (100 * share).toFixed(0) +
        '% zero (' + s.zeros + ' of ' + s.rows + ')' +
        (was == null ? ', and it was not in the last run to compare against.'
                     : ', up from ' + (100 * was).toFixed(0) + '%.'));
      continue;
    }
    if (share >= limits.absoluteZeroShare) {
      warnings.push(b + ' is ' + (100 * share).toFixed(0) + '% zero, steady since last run. ' +
        'Looks genuinely sold out rather than broken.');
      continue;
    }
    if (was != null && share - was > limits.zeroShareJump) {
      blocks.push('ZEROING JUMPED: ' + b + ' is ' + (100 * share).toFixed(0) + '% zero, against ' +
        (100 * was).toFixed(0) + '% last time. That is ' + (100 * (share - was)).toFixed(0) +
        ' points more stock disappearing in one run.');
    }
  }

  // 4. against the previous accepted run
  if (!baseline) {
    blocks.push('NO BASELINE. Nothing to compare this run against, so it cannot be judged. ' +
      'Check it by hand once, then re-run with --accept to record it.');
  } else {
    const rowDrop = (baseline.rows - n) / baseline.rows;
    if (rowDrop > limits.maxRowDropShare) {
      blocks.push('ROW COLLAPSE: ' + n + ' rows against ' + baseline.rows + ' last time, down ' +
        (100 * rowDrop).toFixed(0) + '%. Pages that fail to render look like this.');
    }
    if (baseline.units > 0) {
      const swing = Math.abs(summary.units - baseline.units) / baseline.units;
      if (swing > limits.maxTotalSwing) {
        blocks.push('TOTAL SWING: ' + summary.units.toLocaleString() + ' units against ' +
          baseline.units.toLocaleString() + ' last time, a ' + (100 * swing).toFixed(0) + '% move.');
      }
    }
    for (const loc of Object.keys(summary.locations)) {
      if (baseline.locations && !baseline.locations[loc]) {
        warnings.push('a location appears that was not in the last run: ' + loc);
      }
    }
  }

  // 5. location sanity. Needham is dropship footwear; nothing else should sit there by surprise.
  if (summary.locations['(none)']) {
    blocks.push('ROWS WITH NO LOCATION: ' + summary.locations['(none)'] + '. An import with a blank ' +
      'location does not land where you think.');
  }

  // 6. print on demand must not reach Needham. See POD_STYLES above for why
  // this is a named rule and not a threshold: the file that did this was
  // statistically indistinguishable from a good one.
  const pod = rows.filter(r => {
    const s = (r.sku + ' ' + r.handle).toUpperCase();
    return POD_STYLES.some(st => s.includes(st));
  });
  const misplaced = pod.filter(r => r.location && r.location !== POD_LOCATION);
  if (misplaced.length) {
    const where = [...new Set(misplaced.map(r => r.location))].join(', ');
    blocks.push('PRINT ON DEMAND IN THE WRONG PLACE: ' + misplaced.length + ' of ' + pod.length +
      ' rows for ' + POD_STYLES.join('/') + ' are going to ' + where + ' instead of ' + POD_LOCATION +
      '. These blanks are bought per order and held at ' + POD_LOCATION + ', so a ' +
      (misplaced[0].location) + ' row is never right. A scrape from an extension that predates the ' +
      'per-line location does exactly this, and the rest of the file looks perfectly normal.');
  } else if (pod.length) {
    warnings.push(pod.length + ' print-on-demand rows, all correctly pointed at ' + POD_LOCATION + '.');
  }
  summary.podRows = pod.length;
  summary.podMisplaced = misplaced.length;

  return { ok: blocks.length === 0, blocks, warnings, summary };
}

// ---------------------------------------------------------------- cli -----
// Compare real paths, not filenames. test/inventory-guardrail.mjs shares this
// file's basename, so an endsWith check made the CLI run on import and the
// whole test suite exited with a usage message.
const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const file = process.argv.find(a => !a.startsWith('--') && /\.csv$/i.test(a));
  if (!file) { console.error('usage: node tools/inventory-guardrail.mjs <file.csv> [--accept] [--json]'); process.exit(2); }
  const rows = rowsFromCSV(fs.readFileSync(file, 'utf8'));
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const res = check(rows, baseline);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('file     : ' + path.basename(file));
    console.log('rows     : ' + res.summary.rows + '   units ' + res.summary.units.toLocaleString() +
      '   zeros ' + res.summary.zeros +
      (res.summary.cap ? '   on the ' + res.summary.cap + ' ceiling ' + res.summary.atCap : '   no ceiling'));
    console.log('locations: ' + Object.entries(res.summary.locations).map(([k, v]) => k + '=' + v).join('  '));
    if (baseline) console.log('baseline : ' + baseline.rows + ' rows, ' + baseline.units.toLocaleString() +
      ' units, from ' + baseline.at);
    else console.log('baseline : none recorded');
    console.log('');
    res.warnings.forEach(w => console.log('  WARN   ' + w));
    res.blocks.forEach(b => console.log('  BLOCK  ' + b));
    console.log('\n' + (res.ok ? 'PASS. Safe to write.' : 'BLOCKED. Do not write this file.'));
  }

  if (process.argv.includes('--accept')) {
    // --ACCEPT MUST NOT RECORD A FILE THAT FAILED A REAL CHECK.
    //
    // The baseline is what every later run is judged against, so accepting the
    // 2026-10-27 file would teach the guardrail that singlets at Needham and
    // whatever zero shares came with it are normal, and the next run would
    // sail through. The one block --accept exists to clear is the missing
    // baseline itself, which every first run hits by design.
    const real = res.blocks.filter(b => !b.startsWith('NO BASELINE'));
    if (real.length) {
      console.log('\nNOT RECORDED. This file is blocked for a reason other than the missing');
      console.log('baseline, and recording it would make that fault the new normal:');
      real.forEach(b => console.log('  ' + b.split('.')[0]));
      console.log('\nFix the capture, or pass a file you have checked by hand.');
      process.exit(1);
    }
    const groupZeroShare = {};
    for (const [b, s] of Object.entries(res.summary.brands)) {
      if (s.rows >= 20 && s.rows / res.summary.rows >= LIMITS.minGroupShare) {
        groupZeroShare[b] = s.zeros / s.rows;
      }
    }
    fs.writeFileSync(BASELINE, JSON.stringify({
      at: new Date().toISOString(), file: path.basename(file),
      rows: res.summary.rows, units: res.summary.units,
      atCapShare: res.summary.atCapShare, cap: res.summary.cap,
      zeroShare: res.summary.zeroShare, groupZeroShare,
      locations: res.summary.locations }, null, 2));
    console.log('\nbaseline recorded: ' + BASELINE);
  }
  process.exit(res.ok ? 0 : 1);
}
