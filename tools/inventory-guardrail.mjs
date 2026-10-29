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
  atCapShareJump: 0.10,        // 10 points more rows at the cap than last time
  capValue: 30,
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

export function rowsFromCSV(text) {
  const t = parseCSV(text);
  if (!t.length) return [];
  const head = t[0].map(h => h.replace(/^"|"$/g, '').trim());
  const idx = (name) => head.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iH = idx('Handle'), iSku = idx('SKU'), iLoc = idx('Location');
  const iQty = idx('On hand (new)'), iS = idx('Option1 Value'), iC = idx('Option2 Value');
  return t.slice(1).map(r => ({
    handle: (r[iH] || '').trim(),
    sku: (r[iSku] || '').trim(),
    location: (r[iLoc] || '').trim(),
    size: (r[iS] || '').trim(),
    colour: (r[iC] || '').trim(),
    qty: parseInt(r[iQty], 10),
  })).filter(r => r.handle || r.sku);
}

const brandOf = (r) => {
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
  if (n < limits.minRows) blocks.push('only ' + n + ' rows, below the minimum of ' + limits.minRows +
    '. A partial scrape looks exactly like this.');

  const seen = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.qty)) { blocks.push('a row has a non numeric quantity: ' + JSON.stringify(r).slice(0, 90)); break; }
    if (r.qty < 0) { blocks.push('a row carries NEGATIVE stock: ' + r.sku + ' = ' + r.qty); break; }
    summary.units += r.qty;
    if (r.qty === 0) summary.zeros++;
    if (r.qty === limits.capValue) summary.atCap++;
    summary.locations[r.location || '(none)'] = (summary.locations[r.location || '(none)'] || 0) + 1;
    const b = brandOf(r);
    summary.brands[b] = summary.brands[b] || { rows: 0, zeros: 0, units: 0 };
    summary.brands[b].rows++; summary.brands[b].units += r.qty;
    if (r.qty === 0) summary.brands[b].zeros++;
    const key = (r.sku || (r.handle + '|' + r.size + '|' + r.colour)).toUpperCase();
    seen.set(key, (seen.get(key) || 0) + 1);
  }

  // 1. duplicate variants. This is the delivery-window bug's signature.
  const dupRows = [...seen.values()].filter(v => v > 1).reduce((a, v) => a + v - 1, 0);
  if (dupRows / n > limits.maxDuplicateShare) {
    const worst = Math.max(...seen.values());
    blocks.push('DUPLICATE VARIANTS: ' + dupRows + ' of ' + n + ' rows repeat a variant, worst appears ' +
      worst + ' times. A Shopify import keeps the LAST row, so duplicates silently decide the number. ' +
      'This is what one-record-per-delivery-window looks like.');
  }

  // 2. the 30 cap. Normal on a page scrape, alarming if it JUMPS.
  summary.atCapShare = summary.atCap / n;
  if (baseline && baseline.atCapShare != null &&
      summary.atCapShare - baseline.atCapShare > limits.atCapShareJump) {
    blocks.push('CAPPED NUMBERS JUMPED: ' + (100 * summary.atCapShare).toFixed(0) + '% of rows are exactly ' +
      limits.capValue + ', against ' + (100 * baseline.atCapShare).toFixed(0) + '% last time. The portal ' +
      'prints "' + limits.capValue + '+" for anything deeper, so a jump means more of the file is guesses.');
  } else if (summary.atCapShare > 0.05) {
    warnings.push((100 * summary.atCapShare).toFixed(0) + '% of rows are exactly ' + limits.capValue +
      ', the page cap. Expected on a page scrape, and understates deep sizes.');
  }

  // 3. zeroing, per brand, measured against what that brand looked like LAST time.
  // ASICS is routinely 60 to 70% zero: that is the supplier, not a bug.
  for (const [b, s] of Object.entries(summary.brands)) {
    if (s.rows < 20) continue;
    const share = s.zeros / s.rows;
    s.zeroShare = share;
    const was = baseline && baseline.brandZeroShare && baseline.brandZeroShare[b];
    // A STYLE CAN GENUINELY BE SOLD OUT, so near-total zero is not by itself a
    // bug. 1011B read 97% zero on 2026-09-18 and 97% again on 2026-09-21, two
    // good runs three days apart: ASICS really has nothing left in it. An
    // absolute block here stopped both. At the extreme there is nowhere left to
    // climb, so compare against last time with a tight margin instead.
    if (share >= limits.absoluteZeroShare && (was == null || share - was > 0.02)) {
      blocks.push('BRAND ALMOST ENTIRELY ZERO: ' + b + ' is ' + (100 * share).toFixed(0) +
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
      '   zeros ' + res.summary.zeros + '   at the ' + LIMITS.capValue + ' cap ' + res.summary.atCap);
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
    const brandZeroShare = {};
    for (const [b, s] of Object.entries(res.summary.brands)) {
      if (s.rows >= 20) brandZeroShare[b] = s.zeros / s.rows;
    }
    fs.writeFileSync(BASELINE, JSON.stringify({
      at: new Date().toISOString(), file: path.basename(file),
      rows: res.summary.rows, units: res.summary.units,
      atCapShare: res.summary.atCapShare, brandZeroShare,
      locations: res.summary.locations }, null, 2));
    console.log('\nbaseline recorded: ' + BASELINE);
  }
  process.exit(res.ok ? 0 : 1);
}
