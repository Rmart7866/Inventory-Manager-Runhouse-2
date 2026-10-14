// write-maurten-descriptions.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Writes the body copy and SEO fields for the Maurten listings created by
// tools/create-maurten-products.mjs.
//
// WHY THE COPY IS IN THIS FILE AND THE PRICES ARE NOT. Marketing copy is ours
// and safe in a public repo. Wholesale cost is not, which is why the price list
// stays in a gitignored CSV. See create-maurten-products.mjs.
//
// THE NUMBERS COME FROM MAURTEN'S OWN NAMING, not from a spec sheet I do not
// have. The range is named in kilocalories: Gel 100 is 100 kcal, Gel 160 is
// 160 kcal, Drink Mix 320 is 320 kcal, and CAF 100 means 100 mg of caffeine.
// Carbohydrate follows at 4 kcal per gram, so Gel 100 is 25 g and Drink Mix 320
// is 80 g. Anything beyond that, flavour notes, allergens, exact ratios, is NOT
// asserted here.
//
// VERIFY BEFORE PUBLISHING. Formulations change and this copy was written from
// product knowledge, not from a current Maurten spec sheet. The products are
// DRAFT, so nothing reaches a customer until someone reads it.
//
// UPDATE ONLY. It writes to products that already exist and refuses to create
// anything, so it cannot invent a listing by typo.
//
// Usage:
//   node tools/write-maurten-descriptions.mjs
//   node tools/write-maurten-descriptions.mjs --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
for (const a of argv) if (a !== '--apply') { console.error(`Unknown argument: ${a}`); process.exit(2); }

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(loadDevVars());

// The hydrogel paragraph is the one thing every Maurten product shares, so it
// is written once rather than restated fifteen times in slightly different words.
const HYDROGEL = `<p>Maurten uses a hydrogel built from two natural ingredients, alginate and pectin. The carbohydrate is carried inside the gel through the stomach, which is what lets runners take on far more fuel per hour than a conventional drink or gel allows, with less of the stomach trouble that usually sets the ceiling.</p>`;

const USE = (s) => `<p><strong>How to use it.</strong> ${s}</p>`;
const NOTE = `<p>Flavour neutral and made from a short ingredient list, so it sits alongside whatever else you are carrying.</p>`;

const COPY = {
  'maurten-drink-mix-160': {
    seoTitle: 'Maurten Drink Mix 160 | The Run House',
    seoDesc: 'Maurten Drink Mix 160, 40 g of hydrogel carbohydrate per 500 ml bottle. Single sachets and boxes of 18.',
    html: `<p>Maurten Drink Mix 160 is the lighter of the two original drink mixes, carrying <strong>40 g of carbohydrate and 160 kcal</strong> in a 500 ml bottle.</p>
${HYDROGEL}
${USE('One sachet into 500 ml of water. Shake and drink. Suited to shorter efforts, or to sitting under a gel-led fuelling plan on a long run.')}
${NOTE}`,
  },
  'maurten-drink-mix-320': {
    seoTitle: 'Maurten Drink Mix 320 | The Run House',
    seoDesc: 'Maurten Drink Mix 320, 80 g of hydrogel carbohydrate per 500 ml bottle. Single sachets and boxes of 14.',
    html: `<p>Maurten Drink Mix 320 is the high carbohydrate drink the brand is known for, <strong>80 g of carbohydrate and 320 kcal</strong> in a single 500 ml bottle. It is the reason Maurten turns up on so many marathon start lines.</p>
${HYDROGEL}
${USE('One sachet into 500 ml of water. Shake and drink. Built for marathon and long distance work where the carbohydrate target per hour is high.')}
${NOTE}`,
  },
  'maurten-drink-mix-320-caf-100': {
    seoTitle: 'Maurten Drink Mix 320 CAF 100 | The Run House',
    seoDesc: 'Maurten Drink Mix 320 CAF 100, 80 g carbohydrate plus 100 mg caffeine per 500 ml bottle.',
    html: `<p>Drink Mix 320 with caffeine. The same <strong>80 g of carbohydrate and 320 kcal</strong> as the standard 320, plus <strong>100 mg of caffeine</strong>.</p>
${HYDROGEL}
${USE('One sachet into 500 ml of water. Most runners save the caffeinated version for race day, or for the back half of a long run rather than the start.')}
<p>Worth trying in training first if you are not used to caffeine while running.</p>`,
  },
  'maurten-gel-100': {
    seoTitle: 'Maurten Gel 100 | The Run House',
    seoDesc: 'Maurten Gel 100, 25 g of hydrogel carbohydrate per gel. Singles and boxes of 12.',
    html: `<p>Maurten Gel 100 carries <strong>25 g of carbohydrate and 100 kcal</strong> in a gel you can take without water.</p>
${HYDROGEL}
${USE('One gel at a time, spaced through the run to hit your carbohydrate target. No water needed, which is what makes it workable mid race.')}
${NOTE}`,
  },
  'maurten-gel-100-caf-100': {
    seoTitle: 'Maurten Gel 100 CAF 100 | The Run House',
    seoDesc: 'Maurten Gel 100 CAF 100, 25 g carbohydrate plus 100 mg caffeine per gel.',
    html: `<p>Gel 100 with caffeine. <strong>25 g of carbohydrate, 100 kcal, and 100 mg of caffeine</strong> in a gel that needs no water.</p>
${HYDROGEL}
${USE('Most runners place the caffeinated gels deliberately rather than taking them throughout, often from halfway onward.')}
<p>Worth trying in training first if you are not used to caffeine while running.</p>`,
  },
  'maurten-gel-160': {
    seoTitle: 'Maurten Gel 160 | The Run House',
    seoDesc: 'Maurten Gel 160, 40 g of hydrogel carbohydrate per gel. Singles and boxes of 12.',
    html: `<p>Maurten Gel 160 is the bigger gel, <strong>40 g of carbohydrate and 160 kcal</strong>, so fewer gels are needed to reach the same hourly target.</p>
${HYDROGEL}
${USE('One gel at a time, no water needed. Useful when you would rather carry four gels than six.')}
${NOTE}`,
  },
  'maurten-gel-mix-480': {
    seoTitle: 'Maurten Gel Mix 480 | The Run House',
    seoDesc: 'Maurten Gel Mix 480, a powder that mixes into 480 kcal of hydrogel in your own flask.',
    html: `<p>Gel Mix 480 is a powder you mix yourself, making up <strong>480 kcal, around 120 g of carbohydrate</strong>, in a flask rather than in single use sachets.</p>
${HYDROGEL}
${USE('Mix into a flask and carry it, taking sips to a plan instead of opening gels one at a time. Pairs with the Maurten Gel Mix Flask.')}
<p>Check the sachet for the current mixing instructions and flask volume before race day.</p>`,
  },
  'maurten-solid-160': {
    seoTitle: 'Maurten Solid 160 | The Run House',
    seoDesc: 'Maurten Solid 160, an oat based bar with 40 g of carbohydrate. Singles and boxes of 12.',
    html: `<p>Maurten Solid 160 is the chewable one, an oat based bar carrying <strong>40 g of carbohydrate and 160 kcal</strong>.</p>
<p>Built for the fuelling you do before and around a session rather than at full racing pace, and for runners who would rather chew something than take another gel.</p>
${USE('Before a run, or during steadier long runs and ultra distance work where you have time to chew.')}
${NOTE}`,
  },
  'maurten-solid-c-160': {
    seoTitle: 'Maurten Solid C 160 | The Run House',
    seoDesc: 'Maurten Solid C 160, the cocoa version of the oat based bar, 40 g of carbohydrate.',
    html: `<p>Solid C 160 is the cocoa version of Maurten's oat based bar, with the same <strong>40 g of carbohydrate and 160 kcal</strong>.</p>
<p>Same job as the standard Solid, different flavour, for when the plain one gets dull halfway through a block.</p>
${USE('Before a run, or during steadier long runs and ultra distance work where you have time to chew.')}`,
  },
  'maurten-solid-mix-box': {
    seoTitle: 'Maurten Solid Mix Box | The Run House',
    seoDesc: 'Maurten Solid Mix Box, a box of 12 mixing the standard and cocoa oat bars.',
    html: `<p>A box of 12 mixing both Solid bars, the standard and the cocoa, each with <strong>40 g of carbohydrate and 160 kcal</strong>.</p>
<p>The sensible way to find out which one you actually want to carry.</p>
${USE('Before a run, or during steadier long runs and ultra distance work where you have time to chew.')}`,
  },
  'maurten-addition': {
    seoTitle: 'Maurten Addition | The Run House',
    seoDesc: 'Maurten Addition flavour drops for Drink Mix, in Orange, Menthol, Cola and Apple.',
    html: `<p>Addition is a flavour drop for Maurten Drink Mix, in <strong>Orange, Menthol, Cola and Apple</strong>.</p>
<p>Maurten Drink Mix is deliberately flavour neutral, which is part of why it goes down easily at high carbohydrate loads. Addition exists for runners who want some flavour back without changing what the drink does.</p>
${USE('Add to a made up bottle of Drink Mix to taste. It changes the flavour, not the carbohydrate.')}`,
  },
  'maurten-bottle': {
    seoTitle: 'Maurten Bottle 500 ml and 750 ml | The Run House',
    seoDesc: 'The Maurten bottle, in 500 ml and 750 ml.',
    html: `<p>Maurten's own bottle, in <strong>500 ml and 750 ml</strong>.</p>
<p>The 500 ml matches a single sachet of Drink Mix, so one sachet and one bottle is the whole measurement.</p>`,
  },
  'maurten-gelflask-150ml': {
    seoTitle: 'Maurten Gelflask 150ml | The Run House',
    seoDesc: 'Maurten Gelflask, 150 ml, for carrying gel without sachets.',
    html: `<p>A <strong>150 ml</strong> flask for carrying gel, so you are not opening and pocketing sachets mid race.</p>
<p>Refillable and easy to rinse out.</p>`,
  },
  'maurten-gel-mix-flask-350ml': {
    seoTitle: 'Maurten Gel Mix Flask 350ml | The Run House',
    seoDesc: 'Maurten Gel Mix Flask, 350 ml, sized for mixing Gel Mix 480.',
    html: `<p>A <strong>350 ml</strong> flask sized for mixing up Gel Mix 480 and carrying it as one container rather than several sachets.</p>
<p>Refillable and easy to rinse out.</p>`,
  },
  'maurten-drinkflask-550ml': {
    seoTitle: 'Maurten Drinkflask 550ml | The Run House',
    seoDesc: 'Maurten Drinkflask, 550 ml, soft flask for Drink Mix.',
    html: `<p>A <strong>550 ml</strong> flask for Drink Mix, with the room to take a full 500 ml sachet mix.</p>
<p>Refillable and easy to rinse out.</p>`,
  },
};

// ProductUpdateInput, not ProductInput. The two exist side by side in
// 2026-01 and the wrong one fails the whole mutation on a type mismatch
// before a single product is touched.
const UPDATE = `mutation($input:ProductUpdateInput!){productUpdate(product:$input){
  product{id handle title} userErrors{field message}}}`;

async function main() {
  const handles = Object.keys(COPY);
  const q = handles.map((h) => `handle:${h}`).join(' OR ');
  const r = await client.graphql(
    `query($q:String){products(first:60,query:$q){nodes{id handle title status descriptionHtml}}}`, { q });
  const live = {};
  for (const p of r.data.products.nodes) live[p.handle] = p;

  const missing = handles.filter((h) => !live[h]);
  if (missing.length) {
    console.log('\nNot in Shopify, so nothing to update (run create-maurten-products.mjs first):');
    missing.forEach((h) => console.log('  ' + h));
  }

  const todo = handles.filter((h) => live[h]);
  console.log(`\n${todo.length} product(s) to describe.`);
  let already = 0;
  for (const h of todo) {
    const has = (live[h].descriptionHtml || '').trim().length > 0;
    if (has) already++;
    const words = COPY[h].html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    console.log(`  ${live[h].title.padEnd(32)} [${live[h].status}]  ${words} words${has ? '   HAS a description already, will be REPLACED' : ''}`);
  }
  if (already) console.log(`\n${already} already had body copy. This overwrites it.`);

  if (!APPLY) {
    console.log('\nSAMPLE, Maurten Gel 100:\n');
    console.log(COPY['maurten-gel-100'].html.replace(/<[^>]+>/g, '').replace(/\n+/g, '\n'));
    console.log('\nDRY RUN. Nothing written. Pass --apply.');
    return;
  }

  let ok = 0, fail = 0;
  for (const h of todo) {
    const c = COPY[h];
    const input = {
      id: live[h].id,
      descriptionHtml: c.html,
      seo: { title: c.seoTitle, description: c.seoDesc },
    };
    const res = await client.graphql(UPDATE, { input });
    const errs = res.data?.productUpdate?.userErrors || [];
    if (errs.length) { fail++; console.log(`  FAILED ${h}: ${errs.map((e) => e.message).join('; ')}`); }
    else { ok++; console.log(`  described ${live[h].title}`); }
  }
  console.log(`\nWrote ${ok}, failed ${fail}. Still DRAFT, so read them before publishing.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
