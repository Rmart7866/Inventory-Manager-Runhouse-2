// tag-activity.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Adds the ACTIVITY tags a shoe needs to fall into the master collections:
// trail, road, hiking. Built for the Altra drop, which launched with nothing
// but its brand, model and cw-group tags, so all 354 products are invisible to
// every activity collection in the store.
//
// WHY THIS IS NOT PART OF THE TAGGING PANEL. catalog-tags.js computes cw-group,
// width and gender from the SKU and the title, mechanically, with the same
// parsers the storefront groups on. Activity is not in the SKU and not in the
// title in any reliable form: "Timp 6" is a trail shoe and "Torin 9" is a road
// shoe and nothing but product knowledge separates them. So the mapping is an
// explicit table a human can read and correct, not a rule, and it lives here
// rather than in the automatic path.
//
// THE TAGS COME FROM WHAT THE STORE ALREADY USES, not from taste. Read off the
// best tagged products in the catalog, verified live 2026-09-23:
//   trail runner   Hoka Speedgoat 6   trail, trail-running
//   road shoe      Brooks Ghost 16    road
//   hiking boot    Hoka Anacapa Mid   trail, hiking, hiking-boot
// Shopify tag matching ignores case and treats a hyphen and a space alike, so
// "trail-running" also satisfies the trail-running-shoes collection rule, which
// reads tag EQUALS "trail running".
//
// A HIKER IS ALSO A TRAIL SHOE. Every hiking product in the store carries
// "trail" as well, which is what keeps the all-trail master complete, so the
// hike rows below add trail too. That is a real merchandising decision copied
// from the existing data, not an accident.
//
// STRUCTURAL TAGS, on by default, --no-structural to skip. The gendered
// collections are AND rules: mens-road-running-shoes is tag "road" AND "men"
// AND "shoe". Altra carries "Men's Shoes" but none of the lowercase set, so an
// activity tag alone would populate the all- masters and leave every gendered
// collection empty. Those three words are added from the gender already in the
// title.
//
// SAFETY, in order:
//   1. Dry run by default. --apply is the only way to write.
//   2. ADD ONLY. tagsAdd, never tagsRemove, so the worst case is a missing tag
//      and never a lost one. Same rule as the rest of the bulk tagging.
//   3. EXACT model match only. A model that is not in the table is skipped and
//      printed, never guessed at. Guessing here puts a road shoe in a trail
//      collection, which is a merchandising error a customer sees.
//   4. ACTIVE and DRAFT only, archived is never touched.
//   5. A rollback file naming every product and every tag it gained is written
//      BEFORE the first write.
//
// Usage:
//   node tools/tag-activity.mjs                       # dry run, vendor Altra
//   node tools/tag-activity.mjs --vendor Hoka
//   node tools/tag-activity.mjs --no-structural
//   node tools/tag-activity.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const STRUCTURAL = !argv.includes('--no-structural');
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const VENDOR = arg('--vendor', 'Altra');

// The tag sets, copied from products that are already correct in the store.
const TAGS = {
  road: ['road'],
  trail: ['trail', 'trail-running'],
  hike: ['trail', 'hiking'],              // a low hiker, not a boot
  walk: ['walking'],                      // an everyday walking shoe, not a runner
  boot: ['trail', 'hiking', 'hiking-boot'],
};

// Canonical model name to activity. Canonical means lowercased, with the brand,
// the gender and the colorway stripped, and the width marker removed, so one
// row here covers "Altra Mens Lone Peak 9 Wide - Black" and every colorway of
// it. Add a row rather than loosening the match.
const ACTIVITY = {
  // Road
  'escalante 5': 'road',
  'experience flow 3': 'road',
  'experience flow st': 'road',
  'fwd via 2': 'road',
  'torin 9': 'road',
  'torin 9 gtx': 'road',
  'torin st': 'road',
  'vanish carbon 2': 'road',
  'vanish pulse': 'road',

  // Trail
  'experience wild 3': 'trail',
  'experience wild 3+': 'trail',
  'lone peak 9': 'trail',
  'lone peak 9 gtx': 'trail',
  'lone peak 9 wp low': 'trail',
  'lone peak 9+': 'trail',
  'lone peak 9+ gtx': 'trail',
  'mont blanc carbon': 'trail',
  'mont blanc speed': 'trail',
  'olympus 6': 'trail',
  'olympus 7': 'trail',
  'superior 7': 'trail',
  'timp 5 boa': 'trail',
  'timp 6': 'trail',
  'timp 6 gtx': 'trail',

  // Everyday walking. Not road running: putting a walking shoe in the road
  // running collections is the kind of wrong that a customer notices.
  'motiv flx': 'walk',

  // Hiking. The Mid models are boots, the Hike Low is not.
  'olympus 6 hike low gtx': 'hike',
  'lone peak 9 wp mid': 'boot',
  'lone peak hiker 3': 'boot',
  'olympus 6 hike mid gtx': 'boot',
  'olympus 7 mid gtx': 'boot',
  'timp 6 mid gtx': 'boot',
  'olympus 275 hilo': 'hike',

  // DELIBERATELY ABSENT, and they should stay absent until someone who knows
  // the line says otherwise: "voyager" and "solstice xt 3". Solstice XT is a
  // cross training shoe and no activity master in this store describes one.
  // Voyager I could not identify from the store data at all. An unmatched
  // model is skipped and printed, which is the right failure.
};

const TAGGABLE = { ACTIVE: true, DRAFT: true };

// Strip the brand, then the gender, then the colorway, then the width, to reach
// the model. The gender strip repeats because the feed double prefixed some
// titles, "Altra Womens Women's Experience Wild 3", and a single pass would
// leave "women's experience wild 3" and match nothing.
function canonModel(title) {
  let s = String(title || '').toLowerCase().trim();
  s = s.replace(/^altra\s+/, '');
  for (let i = 0; i < 3; i++) s = s.replace(/^(men'?s|women'?s|mens|womens|unisex'?s?)\s+/, '');
  // The colorway follows a dash. The store writes it both as " - Black" and as
  // "6- Black" with no leading space, so match the dash itself, not " - ".
  s = s.replace(/\s*-\s*[^-]*$/, (m) => (/^\s*-\s*$/.test(m) ? m : ''));
  s = s.replace(/\((wide|narrow|extra wide|x-wide)\)/g, ' ');
  s = s.replace(/\s+(wide|narrow|extra wide)\s*$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Men's, Women's or nothing. Unisex gets no gendered structural tag, because no
// collection rule asks for one and inventing "unisex" here would be a guess.
function genderOf(title) {
  const s = String(title || '').toLowerCase();
  if (/\bwomen'?s?\b/.test(s)) return 'women';
  if (/\bmen'?s?\b/.test(s)) return 'men';
  return null;
}

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(loadDevVars());

const PRODUCTS = `query($a: String, $q: String) {
  products(first: 250, after: $a, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title vendor productType status tags }
  }
}`;
const ADD_TAGS = `mutation($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
}`;

// Read live from Shopify, not from the worker catalog. These are products that
// were created days ago and the catalog is a cached KV snapshot, so reading it
// risks planning against tags that have already changed.
async function fetchProducts(vendor) {
  const out = [];
  let after = null;
  for (;;) {
    const r = await client.graphql(PRODUCTS, { a: after, q: `vendor:'${vendor}'` });
    const page = r.data.products;
    out.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
    process.stderr.write(`  read ${out.length}\r`);
  }
  process.stderr.write(' '.repeat(24) + '\r');
  return out;
}

function planFor(p) {
  if (!TAGGABLE[p.status]) return null;
  const model = canonModel(p.title);
  const activity = ACTIVITY[model];
  if (!activity) return { unmatched: model, title: p.title };

  const have = new Set((p.tags || []).map((t) => t.toLowerCase()));
  const want = TAGS[activity].slice();
  if (STRUCTURAL) {
    const g = genderOf(p.title);
    if (g) want.push(g);
    want.push('shoe', 'shoes');
  }
  const add = want.filter((t) => !have.has(t));
  if (!add.length) return null;
  return { id: p.id, handle: p.handle, title: p.title, model, activity, add, was: (p.tags || []).slice() };
}

async function main() {
  console.log(`Reading ${VENDOR} products from Shopify...`);
  const products = await fetchProducts(VENDOR);
  console.log(`${products.length} ${VENDOR} product(s).`);
  if (!products.length) return;

  const plans = [];
  const unmatched = new Map();
  let already = 0;
  for (const p of products) {
    const r = planFor(p);
    if (!r) { already++; continue; }
    if (r.unmatched) {
      if (!unmatched.has(r.unmatched)) unmatched.set(r.unmatched, []);
      unmatched.get(r.unmatched).push(r.title);
      continue;
    }
    plans.push(r);
  }

  const byActivity = {};
  for (const pl of plans) byActivity[pl.activity] = (byActivity[pl.activity] || 0) + 1;
  console.log('\nPLAN');
  for (const [k, n] of Object.entries(byActivity).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${k.padEnd(6)} -> ${TAGS[k].join(', ')}`);
  }
  if (STRUCTURAL) console.log('   plus the structural tags men/women, shoe, shoes where missing');
  console.log(`   ${String(already).padStart(4)}  already correct, nothing to add`);

  if (unmatched.size) {
    console.log(`\nNOT IN THE TABLE, so SKIPPED. Add a row to ACTIVITY to include them:`);
    for (const [model, titles] of [...unmatched].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`   ${String(titles.length).padStart(4)}  ${model}`);
    }
  }

  console.log('\nSample of what will be written:');
  for (const pl of plans.slice(0, 6)) {
    console.log(`   ${pl.title.slice(0, 64)}`);
    console.log(`      ${pl.model}  [${pl.activity}]  add ${JSON.stringify(pl.add)}`);
  }

  if (!plans.length) { console.log('\nNothing to do.'); return; }
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to tag these ${plans.length} product(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `activity-tag-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'Activity tags ADDED. Add-only, so the undo is to remove exactly the tags listed under add for each product.',
    vendor: VENDOR, structural: STRUCTURAL, products: plans,
  }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let tagged = 0, failed = 0;
  for (const pl of plans) {
    try {
      const r = await client.graphql(ADD_TAGS, { id: pl.id, tags: pl.add });
      const errs = r.data?.tagsAdd?.userErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${pl.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      tagged++;
    } catch (e) {
      failed++; console.log(`  FAIL ${pl.handle}: ${e.message.slice(0, 120)}`);
    }
    if ((tagged + failed) % 25 === 0) process.stderr.write(`  ${tagged + failed}/${plans.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nTagged ${tagged} product(s), ${failed} failed.`);
  console.log('Smart collections re-evaluate within a minute or two. Run Refresh in the tool so the catalog picks the new tags up.');
}

main().catch((e) => { console.error(e); process.exit(1); });
