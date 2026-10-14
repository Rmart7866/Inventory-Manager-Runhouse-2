// set-color-attribute.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Fills Shopify's standard Color attribute (metafield shopify.color-pattern) on
// footwear, derived from the colour already parsed out of each product title.
// Google Shopping, Shopify's own filtering and the storefront all read that
// field, and it was empty on every product in the store.
//
// WHY THE TITLE IS THE SOURCE. There is no Color option on these products: the
// shop carries one product per colourway with Size options only, so the colour
// exists only in the title. worker/src/parsers.js already parses it out for the
// swatch grouping, and the catalog carries it per product as colorName, so this
// reads that rather than parsing titles a second time.
//
// ONE COLOUR, NOT THE COLOURWAY. Google wants a single colour, so
// "Blue Graphite / Blue Coral" has to become "Blue". The FIRST segment decides,
// because brands list the primary colour first, and only if nothing matches
// there does it scan the rest. No match at all means the product is skipped, not
// guessed at.
//
// THE METAOBJECT TRAP. shopify.color-pattern is list.metaobject_reference, so it
// stores pointers, not text. This store has 108 colour metaobjects and they are
// NOT clean taxonomy values: handle "blue" is labelled "Sport Light Blue",
// handle "gray" is "Sport Graphite", and there are ten different "Gray" entries
// from team-store imports. Referencing by handle would put "Sport Light Blue" on
// a running shoe. So the canonical object per colour is resolved LIVE by exact
// label match, never hardcoded and never by handle.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. Only products with NO colour attribute are touched, so a re-run is a
//      no-op and never overwrites a human's choice.
//   3. Nothing but shopify.color-pattern is written.
//   4. A rollback file naming every product and the colour it was given is
//      written before the first write.
//
// Usage:
//   node tools/set-color-attribute.mjs                  # dry run, active shoes
//   node tools/set-color-attribute.mjs --apply
//   node tools/set-color-attribute.mjs --status ACTIVE,DRAFT --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const STATUSES = new Set(argOf('--status', 'ACTIVE').split(',').map((s) => s.trim().toUpperCase()));

const WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
const CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36';

// Keyword to taxonomy colour. See matchIn below for how a winner is chosen.
// Running brands name colours for weather, minerals and moods, so those are
// grouped with the plain colour a shopper would call them. Mined from the 1,720
// distinct colourway strings actually in this catalogue.
const KW = {
  black: 'Black', ebony: 'Black', onyx: 'Black', jet: 'Black', phantom: 'Black', anthracite: 'Black', raven: 'Black', obsidian: 'Black',
  white: 'White', coconut: 'White', ivory: 'White', cream: 'White', birch: 'White', alabaster: 'White', salt: 'White', chalk: 'White', egret: 'White', oyster: 'White', porcelain: 'White', frost: 'White', flurry: 'White', angora: 'White', pearl: 'White', vanilla: 'White', eggnog: 'White', blanc: 'White', cameo: 'White', arctic: 'White', lotus: 'White', snow: 'White', milk: 'White',
  grey: 'Gray', gray: 'Gray', alloy: 'Gray', sharkskin: 'Gray', graphite: 'Gray', castlerock: 'Gray', steel: 'Gray', concrete: 'Gray', pewter: 'Gray', slate: 'Gray', smoke: 'Gray', fog: 'Gray', ash: 'Gray', magnet: 'Gray', charcoal: 'Gray', stardust: 'Gray', asteroid: 'Gray', shadow: 'Gray', stucco: 'Gray', quartz: 'Gray', dusk: 'Gray', cloud: 'Gray', fossil: 'Gray', mist: 'Gray', downpour: 'Gray', stone: 'Gray', nimbus: 'Gray', carbon: 'Gray', beluga: 'Gray', putty: 'Gray', pebble: 'Gray', ghost: 'Gray', heather: 'Gray', moon: 'Gray', ice: 'Gray', cinder: 'Gray', shark: 'Gray', reflection: 'Gray', altitude: 'Gray', titanium: 'Gray', haze: 'Gray', illusion: 'Gray', overcast: 'Gray', rock: 'Gray', rubble: 'Gray', grout: 'Gray',
  navy: 'Navy', peacoat: 'Navy', midnight: 'Navy', indigo: 'Navy', naval: 'Navy', inkwell: 'Navy', eclipse: 'Navy', celestial: 'Navy', nocturne: 'Navy',
  blue: 'Blue', cobalt: 'Blue', azure: 'Blue', sapphire: 'Blue', denim: 'Blue', cyan: 'Blue', teal: 'Blue', aqua: 'Blue', turquoise: 'Blue', glacier: 'Blue', ocean: 'Blue', sky: 'Blue', marine: 'Blue', 'plein air': 'Blue', aquarium: 'Blue', periwinkle: 'Blue', sea: 'Blue', brook: 'Blue', windward: 'Blue', skyward: 'Blue', breeze: 'Blue', astral: 'Blue', cloudless: 'Blue', lagoon: 'Blue', harbor: 'Blue', harbour: 'Blue', tide: 'Blue', wave: 'Blue', surf: 'Blue', bluebell: 'Blue', cornflower: 'Blue',
  green: 'Green', gecko: 'Green', mint: 'Green', olive: 'Green', lime: 'Green', sage: 'Green', forest: 'Green', emerald: 'Green', jade: 'Green', thyme: 'Green', moss: 'Green', pistachio: 'Green', lichen: 'Green', yuzu: 'Green', olivine: 'Green', limelight: 'Green', verdite: 'Green', aloe: 'Green', mineral: 'Green', fern: 'Green', basil: 'Green', matcha: 'Green', seaweed: 'Green', celadon: 'Green',
  red: 'Red', crimson: 'Red', scarlet: 'Red', cherry: 'Red', ruby: 'Red', vermillion: 'Red', flame: 'Red', fire: 'Red', rust: 'Red', brick: 'Red', vizired: 'Red', poppy: 'Red', cardinal: 'Red', sangria: 'Red',
  orange: 'Orange', tangerine: 'Orange', coral: 'Orange', papaya: 'Orange', apricot: 'Orange', marigold: 'Orange', amber: 'Orange', sunset: 'Orange', peach: 'Orange',
  yellow: 'Yellow', citron: 'Yellow', lemon: 'Yellow', mustard: 'Yellow', canary: 'Yellow', sulphur: 'Yellow', sulfur: 'Yellow',
  pink: 'Pink', rose: 'Pink', blush: 'Pink', fuchsia: 'Pink', magenta: 'Pink', dragonfruit: 'Pink', flamingo: 'Pink', carnation: 'Pink', dianthus: 'Pink', blossom: 'Pink', petal: 'Pink', guava: 'Pink', watermelon: 'Pink',
  purple: 'Purple', violet: 'Purple', lilac: 'Purple', lavender: 'Purple', plum: 'Purple', amethyst: 'Purple', mauve: 'Purple', grape: 'Purple', mulberry: 'Purple', orchid: 'Purple', iris: 'Purple', wisteria: 'Purple', thistle: 'Purple', heliotrope: 'Purple',
  brown: 'Brown', chocolate: 'Brown', coffee: 'Brown', espresso: 'Brown', walnut: 'Brown', mocha: 'Brown', cocoa: 'Brown',
  bronze: 'Bronze', copper: 'Bronze',
  beige: 'Beige', sand: 'Beige', linen: 'Beige', oat: 'Beige', bone: 'Beige', khaki: 'Beige', taupe: 'Beige', burlap: 'Beige', pampas: 'Beige', dune: 'Beige', wheat: 'Beige', barley: 'Beige', torte: 'Beige', biscuit: 'Beige', almond: 'Beige', parchment: 'Beige', driftwood: 'Beige', nougat: 'Beige', shortbread: 'Beige',
  // Tan has no metaobject in this store, so tan-ish names resolve to Beige.
  tan: 'Beige', camel: 'Beige', caramel: 'Beige', honey: 'Beige', gum: 'Beige', saddle: 'Beige', toffee: 'Beige', hazel: 'Beige',
  'rose gold': 'Rose gold', gold: 'Gold',
  silver: 'Silver', chrome: 'Silver', platinum: 'Silver', metallic: 'Silver', anniversary: 'Silver', sterling: 'Silver', nickel: 'Silver',
  multi: 'Multicolor', rainbow: 'Multicolor', camo: 'Multicolor',
};
const ORDER = Object.keys(KW).sort((a, b) => b.length - a.length);
const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// EARLIEST match wins, then longest at that position. Not simply the longest:
// "Blue Graphite" must be Blue, and a plain longest-match picks graphite (8)
// over blue (4) and calls a blue shoe Gray. Longest-at-position is still needed
// so "Rose Gold" beats the "rose" sitting at the same index.
function matchIn(scope) {
  if (!scope) return null;
  let best = null;
  for (const kw of ORDER) {
    const re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    const m = re.exec(scope);
    if (!m) continue;
    if (!best || m.index < best.index || (m.index === best.index && kw.length > best.len)) {
      best = { index: m.index, len: kw.length, colour: KW[kw] };
    }
  }
  return best ? best.colour : null;
}

export function primaryColor(colorName) {
  if (!colorName) return null;
  const whole = clean(colorName);
  if (!whole) return null;
  const first = clean(String(colorName).split(/[/]| - /)[0]);
  return matchIn(first) || matchIn(whole);
}

function devVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const SET = `mutation($m: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $m) { userErrors { field message } }
}`;

async function main() {
  const client = createShopifyClient(devVars());

  // Resolve the canonical metaobject per colour, live, by exact label. Never by
  // handle: "blue" is labelled "Sport Light Blue" on this store.
  const mo = (await client.graphql(
    `{ metaobjects(type:"shopify--color-pattern", first:250){ nodes{ id handle fields{ key value } } } }`
  )).data.metaobjects.nodes;
  const byColor = {};
  for (const m of mo) {
    const label = (m.fields.find((f) => f.key === 'label')?.value || '').trim();
    if (label && !byColor[label]) byColor[label] = m.id;
  }
  console.log(`Resolved ${Object.keys(byColor).length} colour metaobjects by label.`);

  const res = await fetch(WORKER + '/catalog', { headers: { Authorization: 'Bearer ' + CATALOG_TOKEN } });
  const cat = await res.json();
  const shoes = (cat.products || []).filter((p) =>
    (p.productType || '').toLowerCase().endsWith('shoes') && STATUSES.has(p.status));

  const plan = [];
  const skipped = { noColorName: 0, noMatch: 0, noMetaobject: 0 };
  const unmatched = new Set();
  for (const p of shoes) {
    if (!p.colorName) { skipped.noColorName++; continue; }
    const colour = primaryColor(p.colorName);
    if (!colour) { skipped.noMatch++; unmatched.add(p.colorName); continue; }
    const id = byColor[colour];
    if (!id) { skipped.noMetaobject++; continue; }
    plan.push({ id: p.id, handle: p.handle, title: p.title, colorName: p.colorName, colour, metaobjectId: id });
  }

  // A product with no Shopify product CATEGORY, or an "Uncategorized" one, is
  // refused by the definition: shopify.color-pattern is constrained by category.
  // Filtering them out here is not cosmetic, because metafieldsSet rejects the
  // WHOLE chunk when one member is invalid, so a single categoryless product
  // used to take 24 good ones down with it.
  const catOf = new Map();
  for (let i = 0; i < plan.length; i += 200) {
    const ids = plan.slice(i, i + 200).map((x) => x.id);
    const r = await client.graphql(
      `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id category{ id } } } }`, { ids });
    for (const n of r.data.nodes) if (n) catOf.set(n.id, n.category?.id || null);
    process.stderr.write(`  checking category ${i}/${plan.length}\r`);
  }
  process.stderr.write(' '.repeat(40) + '\r');
  const noCategory = plan.filter((x) => {
    const c = catOf.get(x.id);
    return !c || /TaxonomyCategory\/na$/.test(c);
  });
  if (noCategory.length) {
    const keep = new Set(plan.filter((x) => !noCategory.includes(x)).map((x) => x.id));
    const kept = plan.filter((x) => keep.has(x.id));
    plan.length = 0; plan.push(...kept);
    console.log(`No product category, so the colour attribute is refused: ${noCategory.length} skipped.`);
  }

  // Skip anything that already carries a colour. The catalog payload does not
  // include shopify.* metafields, so ask Shopify directly. This is what makes a
  // re-run a no-op and stops a human's manual choice being overwritten.
  const already = new Set();
  for (let i = 0; i < plan.length; i += 200) {
    const ids = plan.slice(i, i + 200).map((x) => x.id);
    const r = await client.graphql(
      `query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id cp: metafield(namespace:"shopify", key:"color-pattern"){ value } } } }`,
      { ids });
    for (const n of r.data.nodes) if (n && n.cp && n.cp.value) already.add(n.id);
    process.stderr.write(`  checking existing ${i}/${plan.length}\r`);
  }
  process.stderr.write(' '.repeat(40) + '\r');
  const skippedExisting = already.size;
  const remaining = plan.filter((x) => !already.has(x.id));
  plan.length = 0; plan.push(...remaining);
  console.log(`Already had a colour, left alone: ${skippedExisting}`);

  const dist = {};
  for (const x of plan) dist[x.colour] = (dist[x.colour] || 0) + 1;
  console.log(`\n${shoes.length} ${[...STATUSES].join('/')} shoe product(s) in the catalog.`);
  console.log(`${plan.length} would get a colour. Skipped: ${skipped.noMatch} no keyword match, ${skipped.noColorName} no parsed colour, ${skipped.noMetaobject} no metaobject.`);
  console.log('\ndistribution:');
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(5)}  ${k}`);
  console.log('\nsample:');
  for (const x of plan.slice(0, 8)) console.log(`   ${x.colour.padEnd(11)} <- ${String(x.colorName).slice(0, 34).padEnd(34)} ${x.title.slice(0, 40)}`);
  if (unmatched.size) console.log(`\nunmatched colour names (${unmatched.size}):`, [...unmatched].slice(0, 10).join(' | '));

  if (!plan.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to set the colour on ${plan.length} product(s).`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `color-attribute-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    note: 'shopify.color-pattern set on these products. Undo: metafieldsDelete namespace shopify key color-pattern for each id.',
    products: plan,
  }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let set = 0, failed = 0;
  for (let i = 0; i < plan.length; i += 25) {
    const chunk = plan.slice(i, i + 25);
    const m = chunk.map((x) => ({
      ownerId: x.id, namespace: 'shopify', key: 'color-pattern',
      type: 'list.metaobject_reference', value: JSON.stringify([x.metaobjectId]),
    }));
    const r = await client.graphql(SET, { m });
    const errs = r.data?.metafieldsSet?.userErrors || [];
    if (errs.length) {
      // One invalid member fails the whole chunk, so fall back to one at a time
      // rather than losing the 24 that were fine.
      for (let j = 0; j < chunk.length; j++) {
        const one = await client.graphql(SET, { m: [m[j]] });
        const e1 = one.data?.metafieldsSet?.userErrors || [];
        if (e1.length) { failed++; if (failed <= 5) console.log(`  FAIL ${chunk[j].handle}: ${e1[0].message}`); }
        else set++;
      }
    } else set += chunk.length;
    process.stderr.write(`  ${set}/${plan.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nSet ${set}, failed ${failed}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
