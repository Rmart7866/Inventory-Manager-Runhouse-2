// convert-nb-images.mjs, The Run House.
//
// Turns a raw New Balance Widen download into the gallery folder that the
// Stage 4 "Upload product images" folder picker expects.
//
// WHY THIS EXISTS. Widen's "Download All" hands back Original Format: 2500x2500
// TIFs named `maris3aa_203.tif`, lowercase, with a bare number for the view.
// Shopify rejects TIF outright, and 1,380 of them is 32 GB, so the files cannot
// go to the browser as they are. Converting locally is also strictly better
// than re-downloading a smaller rendition, because the original is the best
// source we will ever have.
//
// WHAT IT PRODUCES. ONE FLAT FOLDER of `<COLORWAY>_<NN>_<view>.jpg` at 2048px,
// quality 85, about 420 KB each. NN is the zero padded gallery rank, so a plain
// alphabetical sort is already the right display order and the lateral profile
// lands as the featured image. product-enrichment.js `_angleRank` reads that
// number and `_imageKeyPatterns.newbalance` reads the colorway code, so the
// naming here is a contract with that file. Change one, change both.
//
// EVERY VIEW GOES IN, one flat folder. The suffix families are NOT duplicates,
// which is what an early pass here assumed after looking at a single colorway:
//   2 3 4 5 6 7        the core studio set: lateral, medial, top, quarter,
//                      outsole, heel. Present on nearly every colorway.
//   8 to 27            lifestyle, a model on a bench, a running stride, plus a
//                      laces and tongue detail at 17. Only 21 colorways have
//                      any, but they are the best images in the set.
//   105 202 203 205    a SECOND studio shoot of the same angles, different
//                      lighting and background.
//   304 to 307         a THIRD set, including a top down angle NB never shot in
//                      the core set.
// They are ranked in that order, so the gallery still leads with the flat
// lateral hero and the near duplicate reshoots sort to the back where a human
// can delete them. New Balance ships about 6 angles per colorway against 8 for
// ON and Merrell, so nothing here is worth throwing away.
//
// The colorway code is the SKU's leading token (W880C15), NOT the Style Number
// (M880V15_RU), which is the model and matches no photo. The code carries no
// width, which is the point: one gallery serves every width of a colorway.
//
// Usage:
//   node tools/convert-nb-images.mjs                     # ~/Desktop defaults
//   node tools/convert-nb-images.mjs <srcDir> <outDir>
//
// Requires macOS `sips`. Existing outputs are skipped, so it is safe to re-run
// after dropping in another batch.
//
// It converts every colorway it finds, including ones no longer in the CDS
// feed, because it has no feed to check against and a code absent this season
// may be back next season. Those extras are inert: indexImageFolder keys them,
// but nothing ever looks them up, since lookups come from feed SKUs.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const SRC = process.argv[2] || path.join(os.homedir(), 'Desktop', 'NB ASSETS');
const OUT = process.argv[3] || path.join(os.homedir(), 'Desktop', 'NB-IMAGES');

const LONG_EDGE = 2048;
const QUALITY = 85;
const WORKERS = 8;

// Gallery order. The rank is baked into the filename ZERO PADDED, so a plain
// alphabetical sort is still display order once a colorway has more than nine
// images (_10_ would otherwise sort before _2_).
const VIEWS = [
  { num: '2', word: '2LATERAL', name: 'lateral' },
  { num: '5', word: '5QLATERAL', name: 'quarter' },
  { num: '3', word: '3MEDIAL', name: 'medial' },
  { num: '4', word: '4TOP', name: 'top' },
  { num: '7', word: '7BACK', name: 'back' },
  { num: '6', word: '6BOTTOM', name: 'outsole' },
  { num: '14', name: 'lifestyle-a' },
  { num: '15', name: 'lifestyle-b' },
  { num: '16', name: 'lifestyle-c' },
  { num: '17', name: 'detail' },
  { num: '202', name: 'alt-lateral' },
  { num: '205', name: 'alt-quarter' },
  { num: '203', name: 'alt-medial' },
  { num: '105', name: 'alt-lateral-b' },
  { num: '304', name: 'alt-top' },
  { num: '305', name: 'alt-quarter-b' },
  { num: '307', name: 'alt-back' },
  { num: '306', name: 'alt-outsole' },
];
const BY_NUM = new Map(VIEWS.map((v, i) => [v.num, { rank: i + 1, name: v.name }]));
// Ranked by position in VIEWS, not in the filtered list, so adding a word-less
// view above a word-bearing one cannot silently renumber the PNG path.
const BY_WORD = new Map(VIEWS.map((v, i) => [v.word, { rank: i + 1, name: v.name }]).filter(([w]) => w));

// Anything else NB ships (8 to 13, 18 to 27, mkt-a) is kept but sorted to the
// end, rather than dropped for not being in the table.
function viewFor(suffix) {
  const known = BY_NUM.get(suffix);
  if (known) return known;
  const n = parseInt(suffix, 10);
  if (isFinite(n)) return { rank: 50 + Math.min(n, 49), name: 'extra' };
  return { rank: 99, name: 'extra-' + String(suffix).toLowerCase().replace(/[^a-z0-9]+/g, '') };
}

// Same shape as _imageKeyPatterns.newbalance in product-enrichment.js.
const CODE = /^[MWU][A-Z0-9]{4,7}(?=[_\s]|$)/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// Pick the one best source file per colorway and view. A TIF beats a PNG.
function plan() {
  const best = new Map();
  for (const p of walk(SRC)) {
    const file = path.basename(p);
    const ext = file.split('.').pop().toLowerCase();
    if (!['tif', 'tiff', 'png', 'jpg', 'jpeg'].includes(ext)) continue;

    const m = CODE.exec(file.toUpperCase());
    if (!m) continue;
    const code = m[0];

    const stem = file.slice(0, file.length - ext.length - 1);
    const parts = stem.split('_');
    let view = null;
    if ((ext === 'tif' || ext === 'tiff') && parts.length === 2) {
      view = viewFor(parts[1]);
    } else {
      for (const part of parts) { const hit = BY_WORD.get(part.toUpperCase()); if (hit) { view = hit; break; } }
    }
    if (!view) continue;

    const key = code + '_' + view.rank;
    const rank = (ext === 'tif' || ext === 'tiff') ? 2 : 1;
    const prev = best.get(key);
    if (!prev || rank > prev.rank) {
      const rank2 = String(view.rank).padStart(2, '0');
      best.set(key, { rank, src: p, dest: path.join(OUT, `${code}_${rank2}_${view.name}.jpg`) });
    }
  }
  return [...best.values()];
}

function convert(job) {
  return new Promise((resolve) => {
    execFile('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY),
                      '-Z', String(LONG_EDGE), job.src, '--out', job.dest],
      (err) => resolve(err ? job.src : null));
  });
}

const jobs = plan();
fs.mkdirSync(OUT, { recursive: true });
const todo = jobs.filter((j) => !fs.existsSync(j.dest));
console.log(`source: ${SRC}`);
console.log(`${jobs.length} images across ${new Set(jobs.map((j) => path.basename(j.dest).split('_')[0])).size} colorways`);
console.log(`${jobs.length - todo.length} already converted, ${todo.length} to do`);

let done = 0;
const failures = [];
const queue = todo.slice();
await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (queue.length) {
    const fail = await convert(queue.shift());
    if (fail) failures.push(fail);
    if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
  }
}));

console.log(`\nwrote ${OUT}`);
console.log(`${done - failures.length} converted, ${failures.length} failed`);
for (const f of failures.slice(0, 10)) console.log('  FAIL ' + f);
