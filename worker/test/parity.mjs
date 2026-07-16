// parity.mjs, The Run House.
//
// The brief's non-negotiable: "Tag logic comes from the existing tag-groups.js /
// group.js / parsers.js so the storefront grid and the tool never disagree."
//
// The Worker cannot require() those CommonJS files, so src/ holds ports. Ports
// drift. This test is the thing that catches the drift, and it is the only
// reason the copies are defensible.
//
// Two checks:
//   1. STRUCTURAL, for parsers.js and group.js. Those were copied byte-for-byte
//      and only the export line changed, so everything above the export must be
//      identical to the Color Swatch original. A single edited character fails.
//   2. BEHAVIOURAL, for tag-groups.js. That one is a deliberate subset (the CLI
//      and the tag writes are dropped), so bytes cannot match. Instead we run
//      both implementations of groupTagFor over every real title in
//      catalog-models.csv and require identical output.
//
// Honest limit: this only runs on a machine that has the Color Swatch folder. It
// is a local guard, not CI. Point it elsewhere with COLOR_SWATCH_DIR=/path.
//
// Usage:  npm run parity
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const SWATCH = process.env.COLOR_SWATCH_DIR || '/Users/ryanmartin/Desktop/Run House Color Swatch';

if (!existsSync(SWATCH)) {
  console.log(`SKIP: Color Swatch folder not found at ${SWATCH}`);
  console.log('Set COLOR_SWATCH_DIR to run the parity check.');
  process.exit(0);
}

const require = createRequire(import.meta.url);
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

// --- 1. Structural parity ---------------------------------------------------
// Compare everything up to the export statement. The port marker comment and the
// export line are the only sanctioned differences.
function bodyOf(text, ...markers) {
  let cut = text.length;
  for (const m of markers) {
    const i = text.indexOf(m);
    if (i >= 0 && i < cut) cut = i;
  }
  return text.slice(0, cut).trimEnd();
}

console.log('\nStructural parity (copied verbatim, export line aside)');
for (const file of ['parsers.js', 'group.js']) {
  const mine = readFileSync(join(SRC, file), 'utf8');
  const theirs = readFileSync(join(SWATCH, file), 'utf8');
  const a = bodyOf(mine, '// PORTED to ESM');
  const b = bodyOf(theirs, 'module.exports');
  if (a === b) {
    pass(`${file} is byte-for-byte the Color Swatch original`);
  } else {
    fail(`${file} has DRIFTED from ${join(SWATCH, file)}`);
    // Show the first differing line so the drift is actionable.
    const al = a.split('\n');
    const bl = b.split('\n');
    for (let i = 0; i < Math.max(al.length, bl.length); i++) {
      if (al[i] !== bl[i]) {
        console.log(`        first difference at line ${i + 1}`);
        console.log(`        worker: ${JSON.stringify(al[i] ?? '(missing)')}`);
        console.log(`        swatch: ${JSON.stringify(bl[i] ?? '(missing)')}`);
        break;
      }
    }
  }
}

// --- 2. Behavioural parity --------------------------------------------------
// tag-groups.js is a subset port, so compare what it computes, not its bytes.
console.log('\nBehavioural parity of groupTagFor over the live title corpus');

const theirTags = require(join(SWATCH, 'tag-groups.js'));
const theirParsers = require(join(SWATCH, 'parsers.js'));
const mineTags = await import(join(SRC, 'tag-groups.js'));
const mineParsers = await import(join(SRC, 'parsers.js'));

// Minimal CSV reader for catalog-models.csv. Handles the quoted title field.
function readCsv(path) {
  const text = readFileSync(path, 'utf8').trim();
  const lines = text.split('\n');
  const head = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h.trim(), (cells[i] || '').trim()]));
  });
}

const corpusPath = join(SWATCH, 'catalog-models.csv');
if (!existsSync(corpusPath)) {
  console.log(`  SKIP: no corpus at ${corpusPath}`);
} else {
  const rows = readCsv(corpusPath).filter((r) => r.sample_title);
  let checked = 0, tagMismatch = 0, parseMismatch = 0;

  for (const r of rows) {
    const input = { title: r.sample_title, sku: '', vendor: r.brand };

    const pTheirs = theirParsers.parseProduct(input);
    const pMine = mineParsers.parseProduct(input);
    if (JSON.stringify(pTheirs) !== JSON.stringify(pMine)) {
      if (parseMismatch < 3) {
        console.log(`        parseProduct differs for ${JSON.stringify(r.sample_title)}`);
      }
      parseMismatch++;
    }

    // groupTagFor is only meaningful on a parse that succeeded, which mirrors how
    // the CLI uses it (it skips !parsed.ok).
    if (pTheirs.ok) {
      const tTheirs = theirTags.groupTagFor(pTheirs);
      const tMine = mineTags.groupTagFor(pMine);
      if (tTheirs !== tMine) {
        if (tagMismatch < 3) {
          console.log(`        groupTagFor differs for ${JSON.stringify(r.sample_title)}`);
          console.log(`          swatch: ${tTheirs}`);
          console.log(`          worker: ${tMine}`);
        }
        tagMismatch++;
      }
      checked++;
    }
  }

  if (parseMismatch === 0) pass(`parseProduct identical across ${rows.length} titles`);
  else fail(`parseProduct differs on ${parseMismatch}/${rows.length} titles`);

  if (tagMismatch === 0) pass(`groupTagFor identical across ${checked} parseable titles`);
  else fail(`groupTagFor differs on ${tagMismatch}/${checked} titles`);
}

console.log('');
if (failures) {
  console.log(`PARITY FAILED: ${failures} check(s). The Worker and the pipeline would disagree.`);
  console.log('Fix by editing the Color Swatch file and re-copying, not by patching the port.');
  process.exit(1);
}
console.log('Parity OK. The Worker computes the same tags as the pipeline.\n');
