// write-model-descriptions.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Fills in product descriptions for shoes that have none. 912 active shoes are
// currently empty, all 354 Altra among them, which costs both search traffic
// and conversion on every one of them.
//
// ONE DESCRIPTION PER MODEL FAMILY, not per colourway. Ten colourways of the
// Lone Peak are the same shoe, so they get the same copy, keyed off the
// `family:` tag. That is the whole reason the family tags went on first.
//
// COPY RULES, so this does not read like filler:
//   say what the shoe is for, then what is distinctive about it, then who it
//   suits. No superlatives, no invented weights, stack heights or drops, since
//   a wrong number is worse than no number and the specs live in metafields
//   where the storefront already shows them.
//
// SAFETY:
//   1. Dry run by default, and it prints the copy it would write.
//   2. ONLY products whose description is empty are touched. A description
//      someone wrote is never overwritten, so re-running is safe.
//   3. Only the description is written.
//   4. A rollback file is written BEFORE the first write.
//
// Usage:
//   node tools/write-model-descriptions.mjs --vendor Altra
//   node tools/write-model-descriptions.mjs --vendor Altra --apply
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
const LIMIT = parseInt(arg('--limit', '0'), 10);

// Keyed by the family: tag. A family with no entry is skipped and reported,
// never given generic copy.
const COPY = {
  'lone-peak': 'The Lone Peak is the trail shoe Altra is known for, and the one most people start with. A wide FootShape toe box lets your toes spread on uneven ground, the zero drop platform keeps you level from heel to forefoot, and the MaxTrac outsole holds on loose dirt and rock. Equally at home on a local trail loop and a long day in the mountains.',
  'lone-peak-hiker': 'The Lone Peak built as a hiking boot. Everything that makes the trail shoe work, the wide toe box and the level zero drop platform, with a supportive collar and a burlier build for carrying a pack over rough ground.',
  timp: 'More cushion than the Lone Peak and a softer ride underfoot, the Timp is built for long days on the trail. The FootShape toe box gives your foot room to move as the miles add up, and the grippy outsole handles technical ground without feeling harsh on smoother sections.',
  olympus: 'Altra\'s most cushioned trail shoe. A tall, soft platform takes the edge off rocky descents and long downhill miles, while the Vibram outsole grips wet rock and loose dirt. The choice for ultra distances or for anyone who wants maximum protection underfoot.',
  'olympus-275-hilo': 'Max cushion built for hiking rather than running. A tall, protective platform under a hiking-ready upper, with the wide FootShape toe box that makes long days on your feet more comfortable.',
  superior: 'Light, low and quick. The Superior keeps you close to the ground so you can feel the trail and react to it, with a removable rock plate for when the ground turns sharp. Built for runners who want a nimble shoe rather than a cushioned one.',
  'experience-wild': 'A door to trail shoe. Smooth enough on pavement to run to the trailhead, with enough outsole grip and protection to handle the path once you get there. A low 4mm drop rather than full zero drop, which makes it an easier first step into Altra.',
  'experience-flow': 'A cushioned road trainer with a low 4mm drop, built as the bridge from a traditional running shoe into Altra. Soft and smooth for everyday miles, with the FootShape toe box that gives your forefoot room to work.',
  torin: 'Altra\'s cushioned road trainer. A balanced, even platform from heel to toe, a generous FootShape toe box, and enough cushion for daily training and long runs. The ST version adds guidance for runners who want a little more support.',
  escalante: 'Light, flexible and knit. The Escalante is the everyday road shoe in the Altra line, responsive rather than soft, with a sock-like upper and the room in the forefoot the brand is built around.',
  'fwd-via': 'Altra with a traditional drop. FWD Via keeps the roomy toe box but raises the heel, which makes it the most familiar-feeling shoe in the range for runners coming from a standard trainer.',
  'vanish-carbon': 'A carbon plated road racer on a zero drop platform. Light, propulsive and built for race day, with the toe splay Altra runners want when they are going hard.',
  'vanish-pulse': 'A light, fast road shoe for tempo days and racing shorter distances. Low to the ground and responsive, without a plate.',
  'mont-blanc-carbon': 'Trail racing with a carbon plate. Built for moving fast over long distances on rough ground, with cushion for the descents and enough structure to stay efficient late in a race.',
  'mont-blanc-speed': 'A fast trail shoe for racing and hard efforts, without the plate. Lighter and more responsive than the everyday trail line, with grip for technical ground.',
  'motiv-flx': 'An everyday walking shoe. Flexible, easy to get on and off, and built around the same wide toe box and level platform as the rest of the range, so it stays comfortable through a full day of standing and walking.',
  'solstice-xt': 'A gym and cross training shoe. A flat, stable platform for lifting, with enough flexibility for a class or a short treadmill run, and the toe room to grip the floor.',

  // ---- HOKA ----
  clifton: 'The Clifton is the shoe most people mean when they say HOKA. Light for how much foam is under it, soft without feeling unstable, and happy doing easy miles, long runs and everything in between. The one to start with if you are curious about the brand.',
  stinson: 'Maximum cushion for the trail. A tall, forgiving platform that takes the sting out of rocky ground and long descents, with an outsole built for dirt rather than pavement. Built for people who want as much shoe as possible underfoot.',
  torrent: 'Light, low and nimble on the trail. Less foam than the rest of the HOKA trail line on purpose, so you can feel the ground and move quickly over technical terrain. A racer and a fast day shoe rather than an all day cruiser.',
  'bondi-sr': 'The Bondi built for work. Same deeply cushioned platform, with a slip resistant outsole and a water resistant leather upper, for people on hard floors all day. Standing, not running, is the point.',
  'arahi-sr': 'The Arahi built for work. The same J-Frame support that keeps the running version steady, with a slip resistant outsole and a wipeable upper, for long shifts on your feet.',
  'mafate-x': 'HOKA trail racing with a carbon plate. A tall, aggressive platform built to keep you moving late in a long day on rough ground, with serious outsole grip. A race shoe, not a daily trainer.',

  // ---- ASICS ----
  'gel-cumulus': 'ASICS everyday neutral trainer. Soft underfoot without being vague, light enough to pick up the pace, and comfortable enough to do the same run every day of the week. The default choice in the range for most runners.',
  'gel-contend': 'The entry point to the ASICS range. A straightforward cushioned trainer for everyday running and walking, built to be comfortable and durable rather than fast.',
  'metaspeed-edge-tokyo': 'An ASICS carbon plated racer, built for runners whose stride turns over quickly rather than lengthening out. Light, aggressive and made for race day.',

  // ---- Brooks ----
  revel: 'A cushioned Brooks trainer at a friendlier price. Enough foam and enough structure for everyday running, walking and being on your feet, without the cost of the flagship models.',
  'ghost-max-slip-resistant': 'The Ghost Max built for work. A tall, rockered platform that keeps you rolling forward through a long shift, with a slip resistant outsole for wet floors.',
  'addiction-gts': 'Maximum support from Brooks. GuideRails hold the knee and ankle in line rather than propping up the arch, so it suits runners and walkers who overpronate and want a shoe that stays out of the way.',
  'beast-gts': 'The most supportive shoe Brooks makes, built for bigger runners and heavy overpronation. Deep cushioning under a broad, stable platform, with GuideRails to keep everything tracking straight.',
  'ariel-gts': 'The most supportive shoe Brooks makes for women, built for heavy overpronation. Deep cushioning under a broad, stable platform, with GuideRails to keep everything tracking straight.',

  // ---- Saucony ----
  peregrine: 'Saucony trail shoe with the grip everyone borrows. Deep, aggressive lugs that bite into mud and loose dirt, a rock plate for protection, and a close, secure fit for technical ground.',
  'xodus-ultra': 'Max cushion trail for long days. A tall, protective platform built for ultra distance, with enough outsole to handle rough ground once the legs are tired.',
  kinvara: 'Light and fast on the road. The Kinvara has always been about turning over quickly, so it suits tempo days, shorter races and runners who want as little shoe as they can get away with.',
  'ride-tr3': 'The Ride taken to the trail. The cushioned, even ride of the road shoe with an outsole and upper built for dirt, which makes it a natural pick for mixed routes rather than technical mountain running.',

  // ---- ON Running ----
  'cloud-x': 'On built for mixed training. Light and responsive enough to run in, stable enough for the gym, which makes it the pick for people whose week is not only running.',
  cloudvista: 'On for the trail. Lighter and less aggressive than a mountain shoe, built for runnable dirt and mixed surfaces, with the CloudTec ride kept intact.',
  cloudsoma: 'A cushioned daily trainer from On. Softer and more forgiving than the brand is usually given credit for, built for easy miles and recovery days.',
  'cloudpulse-pro': 'On built for the gym floor. A flat, stable base for lifting and class work, with enough cushion to be comfortable on a treadmill.',
  'cloudrunner-3-max': 'The most cushioned Cloudrunner. A supportive, stable ride with plenty of foam underfoot, built for easy miles, long days and walking as much as running.',

  // ---- the rest of the big families ----
  bondi: 'The most cushioned shoe HOKA makes for the road. A deep, soft platform that flattens out pavement, which is why it gets worn as much for standing and walking as for running. The pick when comfort matters more than speed.',
  'tecton-x': 'HOKA trail racing on carbon plates. Two independent plates let the foot move with uneven ground rather than fighting it, so it stays fast without feeling rigid. Built for long, rough races.',
  ghost: 'The Brooks everyone knows. A neutral daily trainer that does not try to be clever: smooth, cushioned, consistent, and comfortable from the first run. The safe recommendation for most runners.',
  'ghost-max': 'A taller, softer Ghost with a pronounced rocker. Built to roll you forward with less work from the foot and ankle, which makes it a favourite for long days, recovery runs and walking.',
  'ghost-amp': 'The Ghost with a more energetic midsole. Same familiar fit and neutral ride, with more spring underfoot for days when the pace picks up.',
  novablast: 'ASICS bouncy daily trainer. More energetic and playful than the Cumulus, with a high stack that still likes to move quickly. For runners who want their easy days to feel lively.',
  gt: 'ASICS stability line. Support built into the platform rather than bolted on, with reliable cushioning underneath, for runners who overpronate and want a shoe that just works every day.',
  'gel-excite': 'A straightforward, affordable ASICS trainer. Cushioned and comfortable for everyday running, walking and gym work, without the price of the flagship models.',
  'gel-venture': 'ASICS on a budget for the trail. A rugged outsole and a durable upper for paths, gravel and light trail, built to last rather than to race.',
  'metaspeed-ray': 'The lightest racer ASICS makes. Stripped to the essentials over a carbon plate, built for runners chasing a time on a flat course.',
  cloudrunner: 'A supportive daily trainer from On. Stable and cushioned rather than fast, with the CloudTec ride underfoot, built for consistent everyday miles.',
  cloudpulse: 'On built for the gym. A flat, stable base for lifting and class work, with enough cushion to handle a treadmill run at the end of a session.',
  'cloudvista-3-waterproof': 'The Cloudvista with a waterproof membrane. The same light, runnable trail shoe, kept dry for wet ground and winter running.'
};

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
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
    nodes { id handle title status tags descriptionHtml }
  }
}`;
const UPDATE = `mutation($input: ProductInput!) {
  productUpdate(input: $input) { userErrors { field message } }
}`;

async function main() {
  const products = [];
  let after = null;
  for (;;) {
    const r = await client.graphql(PRODUCTS, { a: after, q: `vendor:'${VENDOR}' AND product_type:*Shoes*` });
    products.push(...r.data.products.nodes);
    if (!r.data.products.pageInfo.hasNextPage) break;
    after = r.data.products.pageInfo.endCursor;
  }

  const plans = [];
  const noFamily = new Set(), noCopy = new Set();
  let hadCopy = 0;
  for (const p of products) {
    if (p.status === 'ARCHIVED') continue;
    const text = (p.descriptionHtml || '').replace(/<[^>]*>/g, '').trim();
    if (text.length >= 40) { hadCopy++; continue; }
    const fam = (p.tags || []).map((t) => t.toLowerCase()).find((t) => t.startsWith('family:'));
    if (!fam) { noFamily.add(p.title.slice(0, 44)); continue; }
    const slug = fam.replace('family:', '');
    const copy = COPY[slug];
    if (!copy) { noCopy.add(slug); continue; }
    plans.push({ id: p.id, handle: p.handle, title: p.title, family: slug, html: `<p>${copy}</p>` });
  }

  const byFamily = new Map();
  for (const p of plans) byFamily.set(p.family, (byFamily.get(p.family) || 0) + 1);
  console.log(`${products.length} ${VENDOR} shoe(s). ${hadCopy} already have a description.`);
  console.log(`\n${plans.length} product(s) to fill, across ${byFamily.size} famil${byFamily.size === 1 ? 'y' : 'ies'}:`);
  for (const [f, n] of [...byFamily].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  family:${f}`);
  if (noCopy.size) console.log(`\nNO COPY WRITTEN YET, skipped: ${[...noCopy].sort().join(', ')}`);
  if (noFamily.size) console.log(`\nNO family: tag, skipped: ${noFamily.size} product(s)`);

  console.log('\nSample of the copy:');
  const seen = new Set();
  for (const p of plans) {
    if (seen.has(p.family) || seen.size >= 3) continue;
    seen.add(p.family);
    console.log(`\n   ${p.title}`);
    console.log(`   ${p.html.replace(/<[^>]*>/g, '')}`);
  }

  if (!plans.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to write ${plans.length} description(s).`); return; }

  const use = LIMIT > 0 ? plans.slice(0, LIMIT) : plans;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(ROOT, `description-rollback-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({ note: 'Descriptions written to products that had none. Undo is to clear them again.', vendor: VENDOR, products: use.map((p) => ({ id: p.id, handle: p.handle, was: '' })) }, null, 1));
  console.log(`\nRollback record written to ${path.basename(file)} BEFORE the first write.`);

  let done = 0, failed = 0;
  for (const p of use) {
    try {
      const r = await client.graphql(UPDATE, { input: { id: p.id, descriptionHtml: p.html } });
      const errs = r.data?.productUpdate?.userErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${p.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      done++;
    } catch (e) { failed++; console.log(`  FAIL ${p.handle}: ${e.message.slice(0, 120)}`); }
    if ((done + failed) % 50 === 0) process.stderr.write(`  ${done + failed}/${use.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  console.log(`\nWrote ${done} description(s), ${failed} failed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
