// tag-model-families.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Adds the `model:` and `family:` tags a brand needs before it can have a
// proper brand page. Built for Altra, which shipped with neither, but the
// vendor is an argument so the next brand costs one command.
//
// WHY THESE TAGS ARE THE PREREQUISITE, not the collections.
// `sections/brand-families.liquid` builds a brand page by reading the
// `family:<slug>` tags off the brand collection's products. Each family then
// resolves to a real collection at `<prefix>-<slug>` if one exists, and falls
// back to the filtered URL `/collections/<brand>/family:<slug>` if it does not,
// which is what stops a family ever rendering as a dead card. So the tags make
// the page work; dedicated collections are an optional upgrade on top.
//
// THE CONVENTION, read off live Merrell and Brooks products, 2026-09-24:
//   Women's Merrell Agility Peak 6 GTX  ->  family:agility-peak  model:agility-peak-6-gtx
//   Men's Merrell Agility Trail         ->  family:agility-trail model:agility-trail
//   Brooks Womens Adrenaline GTS 22     ->  family:adrenaline-gts model:adrenaline-gts-22
// So MODEL keeps the version number and the variant words, FAMILY strips them.
// A model with no version number is its own family.
//
// THE FAMILY RULE is a stripped suffix list plus an override table, and the dry
// run prints every model to family mapping it derived. Read that list before
// applying: a wrong family silently merges two lines into one card on the brand
// page, which is a merchandising error a customer sees.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. ADD ONLY, via tagsAdd. A product that already carries a family: or
//      model: tag is left alone rather than re-tagged, so a human's correction
//      is never overwritten.
//   3. ACTIVE and DRAFT only.
//   4. A rollback file naming every product and the tags it gained is written
//      BEFORE the first write.
//
// Usage:
//   node tools/tag-model-families.mjs --vendor Altra
//   node tools/tag-model-families.mjs --vendor Altra --apply
//   node tools/tag-model-families.mjs --vendor 'ON Running' --type '*Shoes*'
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VENDOR = arg('--vendor', 'Altra');

// FOOTWEAR ONLY, and this is not optional in practice. A vendor query alone
// pulls in that brand's apparel and, worse, the team store race merch: ASICS
// returns 2,197 products, of which hundreds are things like "2025 California
// International Marathon Official Finisher ASICS Men's Silver Jacket". Those
// have no model line, so every one derives its own family and the brand page
// fills with junk. The store's footwear test is a product type ending in
// "shoes", the same rule the worker's classify() uses.
const TYPE = arg('--type', '*Shoes*');

// A family that only one or two products fall into is almost always a parsing
// miss, not a model line: a title whose colourway has no separator in front of
// it ("Puma Men's Deviate Nitro 3 Cool Light Gray") carries the colour into the
// slug, so every colourway becomes its own family. Real lines have many
// colourways and widths. Anything under this many products is reported and
// skipped rather than written, because a junk family is a junk card on the
// brand page and a customer sees it.
const MIN_FAMILY = parseInt(arg('--min-family', '3'), 10);
const TAGGABLE = { ACTIVE: true, DRAFT: true };

// Words that describe a VARIANT of a model, not a different model. Stripped
// from the tail to reach the family. Order does not matter, they are peeled
// repeatedly from the end.
const VARIANT_WORDS = new Set(['gtx', 'wp', 'wide', 'narrow', 'mid', 'low', 'boa', 'plus', 'st', 'hike', 'matryx', 'ltr']);

// Families that the suffix rule alone gets wrong. A hyphenated sub line is its
// own family the way Merrell treats moab-speed as separate from moab.
const FAMILY_OVERRIDE = {
  'lone-peak-hiker-3': 'lone-peak-hiker',
  'olympus-275-hilo': 'olympus-275-hilo',
  'solstice-xt-3': 'solstice-xt',
  'experience-flow-3': 'experience-flow',
  'experience-flow-st': 'experience-flow',
  'experience-wild-3': 'experience-wild',
  'experience-wild-3-plus': 'experience-wild',
};

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')        // "Lone Peak 9+" has to survive as -plus
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Brand, then gender, then the colourway after the dash, then the width marker.
// The gender strip repeats because the Altra feed double prefixed some titles,
// "Altra Womens Women's Experience Wild 3", and one pass would leave a stray
// possessive that canonicalises to a different model.
function modelFromTitle(title, vendor) {
  let s = String(title || '').toLowerCase().trim();
  // The brand does not always come first. Saucony and Merrell titles read
  // "Men's Saucony Peregrine 16", so stripping the vendor once and the gender
  // once leaves "saucony peregrine 16" for one brand and the bare model for
  // another. Peel whichever is at the front, repeatedly, until neither is.
  // The vendor on the product and the word the title starts with are not always
  // the same: vendor "ON Running", title "On Men's Cloudrunner". So try the full
  // vendor and its first word.
  const esc = (x) => x.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const vendorRe = new RegExp('^(?:' + esc(vendor) + '|' + esc(vendor.split(/\s+/)[0]) + ')(?:\'s)?\\s+');
  const genderRe = /^(men'?s|women'?s|mens|womens|unisex'?s?|kids'?|youth|boys'?|girls'?)\s+/;
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(vendorRe, '').replace(genderRe, '');
    if (s === before) break;
  }
  s = s.replace(/\s*-\s*[^-]*$/, (m) => (/^\s*-\s*$/.test(m) ? m : ''));
  s = s.replace(/\((wide|narrow|extra wide|x-wide)\)/g, ' ');
  s = s.replace(/\s+(wide|narrow|extra wide)\s*$/, '');
  return slug(s);
}

function familyOf(modelSlug) {
  if (FAMILY_OVERRIDE[modelSlug]) return FAMILY_OVERRIDE[modelSlug];
  let parts = modelSlug.split('-');
  // Peel variant words and version numbers off the tail, but never take the
  // last word: a family has to keep a name.
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (VARIANT_WORDS.has(last) || /^v?\d+$/.test(last)) { parts.pop(); continue; }
    break;
  }
  return parts.join('-');
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
    nodes { id handle title status tags }
  }
}`;
const ADD_TAGS = `mutation($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
}`;

async function main() {
  console.log(`Reading ${VENDOR} products of type ${TYPE} from Shopify...`);
  const products = [];
  let after = null;
  for (;;) {
    const r = await client.graphql(PRODUCTS, { a: after, q: `vendor:'${VENDOR}' AND product_type:${TYPE}` });
    products.push(...r.data.products.nodes);
    if (!r.data.products.pageInfo.hasNextPage) break;
    after = r.data.products.pageInfo.endCursor;
  }
  console.log(`${products.length} product(s).`);

  const plans = [];
  const mapping = new Map();
  let already = 0, skipped = 0;
  for (const p of products) {
    if (!TAGGABLE[p.status]) { skipped++; continue; }
    const have = new Set((p.tags || []).map((t) => t.toLowerCase()));
    if ([...have].some((t) => t.startsWith('family:') || t.startsWith('model:'))) { already++; continue; }
    const m = modelFromTitle(p.title, VENDOR);
    if (!m) { skipped++; continue; }
    const f = familyOf(m);
    if (!mapping.has(m)) mapping.set(m, { family: f, count: 0 });
    mapping.get(m).count++;
    const add = [];
    if (!have.has('model:' + m)) add.push('model:' + m);
    if (!have.has('family:' + f)) add.push('family:' + f);
    if (add.length) plans.push({ id: p.id, handle: p.handle, title: p.title, family: f, add });
  }

  console.log('\nMODEL to FAMILY mapping derived from the titles. Read this before applying:');
  const byFamily = new Map();
  for (const [m, v] of mapping) {
    if (!byFamily.has(v.family)) byFamily.set(v.family, []);
    byFamily.get(v.family).push(`${m} (${v.count})`);
  }
  for (const [f, models] of [...byFamily].sort()) {
    console.log(`   family:${f}`);
    for (const m of models.sort()) console.log(`      model:${m}`);
  }
  // Drop the families that look like parsing misses, and say which.
  const famCount = new Map();
  for (const [, v] of mapping) famCount.set(v.family, (famCount.get(v.family) || 0) + v.count);
  const weak = new Set([...famCount].filter(([, n]) => n < MIN_FAMILY).map(([f]) => f));
  const kept = plans.filter((p) => !weak.has(p.family));
  const dropped = plans.length - kept.length;
  plans.length = 0; plans.push(...kept);
  if (weak.size) {
    console.log(`\nSKIPPED, under --min-family ${MIN_FAMILY}, probably a colourway parsed as a model:`);
    console.log('   ' + [...weak].sort().join(', '));
    console.log(`   ${dropped} product(s) left untagged by that guard.`);
  }
  console.log(`\n${byFamily.size - weak.size} famil${byFamily.size - weak.size === 1 ? 'y' : 'ies'} kept, ${mapping.size} models seen, ${plans.length} product(s) to tag.`);
  console.log(`   ${already} already carry a family: or model: tag, left alone`);
  console.log(`   ${skipped} archived or unreadable, skipped`);

  if (!plans.length) { console.log('\nNothing to do.'); return; }
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to tag these ${plans.length} product(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `model-family-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'model: and family: tags ADDED. Add-only, so the undo is to remove exactly the tags listed under add.',
    vendor: VENDOR, products: plans,
  }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let done = 0, failed = 0;
  for (const pl of plans) {
    try {
      const r = await client.graphql(ADD_TAGS, { id: pl.id, tags: pl.add });
      const errs = r.data?.tagsAdd?.userErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${pl.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      done++;
    } catch (e) { failed++; console.log(`  FAIL ${pl.handle}: ${e.message.slice(0, 120)}`); }
    if ((done + failed) % 50 === 0) process.stderr.write(`  ${done + failed}/${plans.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nTagged ${done} product(s), ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
