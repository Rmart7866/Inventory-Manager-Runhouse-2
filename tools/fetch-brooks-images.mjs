// fetch-brooks-images.mjs, The Run House.
//
// Downloads the Brooks product photography into the flat gallery folder that
// the Stage 4 "Upload product images" folder picker expects, the same shape
// convert-nb-images.mjs produces for New Balance.
//
// WHY THERE IS NO SCRAPER HERE. The obvious build was a Chrome extension that
// walks the B2B product pages and harvests <img> tags, like the inventory
// scrapers do. That turned out to be unnecessary. Brooks serves its images off
// a public CDN at a URL that is fully derivable from the SKU we already scrape:
//
//   https://epicurobrooksimages.epicurosaas.com/images/products/brooks__<code>__<angle>.jpg
//
// where <code> is the 6 digit style joined to the 3 digit colour, and <angle>
// is one of six letters. Measured 2026-09-15 against the live catalogue: no
// cookie, no referer, no session, and no B2B login is needed, and a code that
// does not exist returns an honest 404 rather than a placeholder, so a missing
// photo can never be mistaken for a real one. Not scraping means this runs from
// the repo in a minute instead of driving a browser for an hour, and it cannot
// silently half finish the way a page walk can.
//
// THE cache= TOKEN ON THE B2B PAGE IS NOT AUTH. The product page links each
// image as `?cache=<token>&format=webp&maxWidth=400`. Those are resize
// parameters for the thumbnail, and the token is not enforced: a garbage token
// serves the same bytes. Worse, ANY query string routes the request through the
// resizer, which re-encodes a 2048px original down to 166 KB. Requesting the
// BARE URL with no query string at all is what returns the untouched original,
// so that is what this does. Do not "helpfully" add maxWidth=4000: there is no
// 4000px master, the resizer just upscales the 2048 and hands back a soft
// 912 KB file.
//
// THE SIX ANGLES, confirmed by eye. Gallery order leads with the lateral
// profile, matching BROOKS_ANGLES in product-enrichment.js:
//   l  lateral profile         a  three quarter        m  medial profile
//   h  heel                    o  top down            s  outsole
// 283 of the 306 colourways in the catalogue carry all six, every one of the
// 306 carries at least the hero, and no colourway has a seventh angle (b to z
// were probed and every other letter 404s).
//
// WHAT IT PRODUCES. One flat folder of `<code>_<NN>_<view>.jpg`, NN zero padded
// so a plain alphabetical sort is already display order. product-enrichment.js
// `_angleRank` reads that number and `_imageKeyPatterns.brooks` reads the code,
// so the naming here is a contract with that file. Change one, change both.
//
// THE CODE IS NOT A SUBSTRING OF THE SKU, which is what makes Brooks different
// from every other brand in the pipeline. The SKU is `110442865-048-750-D`:
// style `110442`, then a three digit token that is NOT the colour and varies
// within a style, then the colour `048`. The image code is `110442` + `048` =
// `110442048`, a composition of two separated groups, so no plain regex can lift
// it out. That is why `_imageKeyPatterns.brooks` is a function, not a RegExp.
//
// Usage:
//   node tools/fetch-brooks-images.mjs                   # every Brooks colourway we carry
//   node tools/fetch-brooks-images.mjs --csv scrape.csv  # codes from a scraper CSV instead
//   node tools/fetch-brooks-images.mjs --code 110495142  # one colourway, repeatable
//   node tools/fetch-brooks-images.mjs --codes-file codes.txt   # nine digit codes, one per line
//   node tools/fetch-brooks-images.mjs --dry-run         # list what it would fetch
//   node tools/fetch-brooks-images.mjs --original        # keep the 1.3 MB originals
//   node tools/fetch-brooks-images.mjs --out ~/Desktop/BROOKS-IMAGES
//
// Requires macOS `sips` unless --original. Existing outputs are skipped, so it
// is safe to interrupt and re-run: it resumes rather than starting over.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const HOST = 'https://epicurobrooksimages.epicurosaas.com/images/products';
const WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
const CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36';

// Gallery order. Rank is baked in zero padded so the folder sorts correctly.
const VIEWS = [
  { suffix: 'l', rank: 1, word: 'lateral' },
  { suffix: 'a', rank: 2, word: 'angle' },
  { suffix: 'm', rank: 3, word: 'medial' },
  { suffix: 'h', rank: 4, word: 'heel' },
  { suffix: 'o', rank: 5, word: 'top' },
  { suffix: 's', rank: 6, word: 'sole' },
];

const QUALITY = 85;
const WORKERS = 8;

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const many = (n) => argv.reduce((a, x, i) => (x === n && argv[i + 1] ? a.concat(argv[i + 1]) : a), []);

const DRY = has('--dry-run');
const ORIGINAL = has('--original');
const OUT = path.resolve(String(argOf('--out', path.join(os.homedir(), 'Desktop', 'BROOKS-IMAGES'))).replace(/^~/, os.homedir()));
const CSV = argOf('--csv', '');
const CODES_FILE = argOf('--codes-file', '');

// Refuse an argument we do not recognise rather than carrying on. WHY: the
// first real invocation passed the codes as one shell-quoted blob, no flag
// matched, and the run quietly fell through to "every colourway in the
// catalogue" and reported success. A fetch that does something other than what
// was asked, and says it worked, is worse than one that stops.
const KNOWN_FLAGS = ['--dry-run', '--original', '--out', '--csv', '--code', '--codes-file'];
const TAKES_VALUE = ['--out', '--csv', '--code', '--codes-file'];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (KNOWN_FLAGS.includes(a)) { if (TAKES_VALUE.includes(a)) i++; continue; }
  console.error(`Unrecognised argument: ${JSON.stringify(a)}`);
  if (/\s/.test(a)) console.error('It contains spaces, so this is probably zsh not splitting an unquoted variable. Use an array: ARGS=(--code 110464417 ...); node ... "${ARGS[@]}"');
  console.error(`Known flags: ${KNOWN_FLAGS.join(', ')}`);
  process.exit(1);
}

// A SKU yields a code only when both halves are there. Anything else is not a
// Brooks footwear SKU and is dropped rather than guessed at.
function codeFromSku(sku) {
  const m = /^(\d{6})\d{3}-(\d{3})-/.exec(String(sku || '').trim());
  return m ? m[1] + m[2] : '';
}

async function codesFromCatalog() {
  const res = await fetch(WORKER + '/catalog', { headers: { Authorization: 'Bearer ' + CATALOG_TOKEN } });
  if (!res.ok) throw new Error('catalog fetch failed: HTTP ' + res.status);
  const cat = await res.json();
  const out = new Set();
  for (const sku of Object.keys(cat.bySku || {})) { const c = codeFromSku(sku); if (c) out.add(c); }
  return out;
}

// Any CSV at all: this only looks for SKU shaped tokens, so it does not care
// which column they are in or what the header says.
function codesFromCsv(file) {
  const text = fs.readFileSync(path.resolve(file.replace(/^~/, os.homedir())), 'utf8');
  const out = new Set();
  for (const tok of text.match(/\d{9}-\d{3}-\d+-[A-Za-z0-9]{1,2}/g) || []) { const c = codeFromSku(tok); if (c) out.add(c); }
  return out;
}

// A plain list of nine digit codes, one per line, which is what falls out of a
// Brooks UPC workbook: STYLE and the colour out of ITEM_NUMBER, joined. Blank
// lines and # comments are ignored so a list can be annotated.
function codesFromFile(file) {
  const text = fs.readFileSync(path.resolve(file.replace(/^~/, os.homedir())), 'utf8');
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = /^(\d{9})\b/.exec(t);
    if (m) out.add(m[1]);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One image. Returns 'saved', 'skipped' (already on disk), 'missing' (a real
// 404, that angle was never shot) or throws.
async function fetchOne(job) {
  if (fs.existsSync(job.dest)) return 'skipped';
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(job.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(400 * attempt); continue;
    }
    if (res.status === 404) return 'missing';
    if (res.ok) break;
    if (attempt >= 3) throw new Error('HTTP ' + res.status);
    await sleep(400 * attempt);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // A truncated body would be written as a valid looking but broken JPEG, and
  // the first anyone would know is a grey box on the storefront.
  if (buf.length < 4096) throw new Error('suspiciously small body, ' + buf.length + ' bytes');

  if (ORIGINAL) { fs.writeFileSync(job.dest, buf); return 'saved'; }

  const tmp = job.dest + '.tmp';
  fs.writeFileSync(tmp, buf);
  await new Promise((resolve, reject) => {
    execFile('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY), tmp, '--out', job.dest],
      (err) => (err ? reject(err) : resolve()));
  });
  fs.unlinkSync(tmp);
  return 'saved';
}

async function main() {
  let codes;
  const explicit = many('--code');
  if (explicit.length) codes = new Set(explicit);
  else if (CODES_FILE) codes = codesFromFile(CODES_FILE);
  else if (CSV) codes = codesFromCsv(CSV);
  else codes = await codesFromCatalog();

  const list = [...codes].sort();
  if (!list.length) { console.log('No Brooks codes found. Nothing to do.'); return; }

  const jobs = [];
  for (const code of list) {
    for (const v of VIEWS) {
      jobs.push({
        code,
        url: `${HOST}/brooks__${code}__${v.suffix}.jpg`,
        dest: path.join(OUT, `${code}_${String(v.rank).padStart(2, '0')}_${v.word}.jpg`),
      });
    }
  }

  console.log(`\n${list.length} colourway(s), ${jobs.length} image slots, into ${OUT}`);
  console.log(ORIGINAL ? 'Keeping the originals, about 1.3 MB each.' : `Re-encoding to JPEG quality ${QUALITY}, about 400 KB each.`);
  if (DRY) {
    console.log('\nDRY RUN. First 12 URLs:');
    for (const j of jobs.slice(0, 12)) console.log('  ' + j.url);
    console.log(`\nDrop --dry-run to download. Roughly ${Math.round(jobs.length * (ORIGINAL ? 1.3 : 0.4))} MB.`);
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });

  let i = 0, saved = 0, skipped = 0, missing = 0, failed = 0;
  const failures = [];
  const run = async () => {
    for (;;) {
      const job = jobs[i++];
      if (!job) return;
      try {
        const r = await fetchOne(job);
        if (r === 'saved') saved++; else if (r === 'skipped') skipped++; else missing++;
      } catch (err) {
        failed++; failures.push(`${path.basename(job.dest)}: ${err.message}`);
      }
      const done = saved + skipped + missing + failed;
      if (done % 25 === 0) process.stderr.write(`  ${done}/${jobs.length}  saved ${saved}, missing ${missing}, failed ${failed}\r`);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, run));
  process.stderr.write(' '.repeat(72) + '\r');

  console.log(`\nSaved ${saved}, already there ${skipped}, never shot ${missing}, failed ${failed}.`);
  if (failures.length) {
    console.log('\nFailed, re-run to retry just these:');
    for (const f of failures.slice(0, 20)) console.log('  ' + f);
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
  }

  // Count only the colourways THIS run asked for. Counting the whole folder
  // reported "326 of 39", which is noise at best and misleading at worst.
  const onDisk = new Set(fs.readdirSync(OUT).map((f) => f.split('_')[0]));
  const got = list.filter((c) => onDisk.has(c)).length;
  console.log(`\n${got} of ${list.length} requested colourway(s) have at least one photo in ${OUT}`);
  console.log('Point Stage 4 "Upload product images" at that folder.');
}

main().catch((e) => { console.error(e); process.exit(1); });
