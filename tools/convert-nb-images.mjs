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
// WHAT IT PRODUCES. A flat folder of `<COLORWAY>_<1-6>_<view>.jpg` at 2048px,
// quality 85, about 420 KB each. The number is the gallery rank, so a plain
// alphabetical sort is already the right display order and the lateral profile
// lands as the featured image. product-enrichment.js `_angleRank` reads that
// number and `_imageKeyPatterns.newbalance` reads the colorway code, so the
// naming here is a contract with that file. Change one, change both.
//
// THE VIEW CODES, confirmed by eye on a contact sheet, not guessed:
//   _2 lateral   _3 medial   _4 top   _5 quarter   _6 outsole   _7 heel
// The 105, 202/203/205 and 304 to 307 families are duplicate alternate sets of
// those same angles, so they are skipped. Every colorway carries 2 to 6.
// Older PNG downloads spell the same views as words (2LATERAL to 6BOTTOM) and
// are read too, but a TIF wins when both exist, because it is the 2500px
// original and the PNG is a derivative.
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

// Gallery order. Index in this array plus one is the rank baked into the name.
const VIEWS = [
  { num: '2', word: '2LATERAL', name: 'lateral' },
  { num: '5', word: '5QLATERAL', name: 'quarter' },
  { num: '3', word: '3MEDIAL', name: 'medial' },
  { num: '4', word: '4TOP', name: 'top' },
  { num: '7', word: '7BACK', name: 'back' },
  { num: '6', word: '6BOTTOM', name: 'outsole' },
];
const BY_NUM = new Map(VIEWS.map((v, i) => [v.num, { rank: i + 1, name: v.name }]));
const BY_WORD = new Map(VIEWS.map((v, i) => [v.word, { rank: i + 1, name: v.name }]));

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
      view = BY_NUM.get(parts[1]);
    } else {
      for (const part of parts) { const hit = BY_WORD.get(part.toUpperCase()); if (hit) { view = hit; break; } }
    }
    if (!view) continue;

    const key = code + '_' + view.rank;
    const rank = (ext === 'tif' || ext === 'tiff') ? 2 : 1;
    const prev = best.get(key);
    if (!prev || rank > prev.rank) {
      best.set(key, { rank, src: p, dest: path.join(OUT, `${code}_${view.rank}_${view.name}.jpg`) });
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
