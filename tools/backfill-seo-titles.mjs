// backfill-seo-titles.mjs, The Run House.
//
// Writes the SEO TITLE (the <title> tag, and the blue line in a Google result)
// on products that have none.
//
// Measured 2026-10-30 over 5,002 ACTIVE in-stock products: 4,144 of them, 83%,
// have no SEO title at all, so Google falls back to the product title, which
// carries supplier codes like "(1134534-CEPR)" and is often longer than the
// ~60 characters a result shows.
//
// META DESCRIPTIONS ARE DELIBERATELY NOT WRITTEN HERE. Everything composable
// from the data came out as the product name plus one shared sentence, which
// is the title again plus boilerplate repeated four thousand times. Google
// ignores a meta description roughly seven times in ten and writes its own
// from the page, and near-identical ones are exactly what it ignores. Owner's
// call, 2026-10-30: titles only.
//
//   node tools/backfill-seo-titles.mjs                 dry run, prints samples
//   node tools/backfill-seo-titles.mjs --vendor HOKA   one vendor
//   node tools/backfill-seo-titles.mjs --limit 50      look at 50
//   node tools/backfill-seo-titles.mjs --apply         write, with a rollback file
//   node tools/backfill-seo-titles.mjs --restore <f>   put the old values back
//
// ADD ONLY. A product that already has an SEO title is never touched.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { titleParts, nounFor, alreadySays } from './product-title-parts.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', '0'));
const RESTORE = arg('--restore', '');
const VENDOR = arg('--vendor', '');

// GOOGLE SHOWS ABOUT 60 CHARACTERS and truncates the rest with an ellipsis, so
// anything past that is spent rather than used.
const MAX = 60;
const STORE = ' | The Run House';

function env() {
  const txt = fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
const E = env();
const SHOP = (E.SHOP_URL || '').replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';
let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) });
  if (!r.ok) throw new Error('token exchange HTTP ' + r.status);
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function gql(q, v = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors && attempt < 5) { await new Promise((s) => setTimeout(s, 1200 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

// ------------------------------------------------------------ the copy -----
//
// LONGEST THAT FITS, dropping from the least valuable end. What a shopper
// types is the brand and the model, so those are never dropped. After that
// the product noun earns its place ("clifton 9 running shoes" is a real
// query), then the colour, which is worth having for long tail and for
// telling two colourways of one shoe apart, then the store name, which
// Google often appends anyway.
export function seoTitleFor(p) {
  const { model, colour } = titleParts(p.title);
  if (!model) return '';
  const noun = nounFor(p.productType);
  const n = (noun && !alreadySays(model, noun)) ? ' ' + noun : '';
  const c = colour ? ', ' + colour : '';

  // ORDER MATTERS, AND DISTINCTNESS BEATS THE NOUN.
  //
  // A duplicate <title> across pages is a real SEO harm: the pages compete
  // with each other and Google picks one. A missing product noun is a small
  // loss. So when the budget forces a choice, the COLOUR stays and the noun
  // goes, never the other way round.
  //
  // A first version had it backwards and a dry run showed the cost: fifteen
  // New Balance products, different colours AND different widths, all came
  // out as "New Balance Mens Ac Runner Running Shoes", because
  // "...Running Shoes, COVERT GREEN (Extra Wide)" is 67 characters and the
  // next candidate it tried dropped the colour. Dropping the noun instead
  // gives "New Balance Mens Ac Runner, COVERT GREEN (Extra Wide)" at 53,
  // which fits and is unique per product. The width lives inside the colour
  // on these titles, so keeping the colour whole is what keeps the widths
  // apart too.
  //
  // A two tone colour is shortened before any of that: ON and HOKA write
  // "Ice Water/Evening Primrose", and the first half alone is enough to tell
  // colourways apart while leaving room for the noun.
  const first = colour.split('/')[0].trim();
  const cShort = (first && first !== colour) ? ', ' + first : '';

  const candidates = [
    model + n + c + STORE,
    model + n + c,
    cShort ? model + n + cShort : '',
    model + c,                      // noun dropped, colour and width kept whole
    // TRUNCATING THE FULL FORM BEATS DROPPING THE COLOUR. When nothing above
    // fits, the alternative candidates all throw the colour away, and a dry
    // run showed where that leads: thirteen TELETIES hair ties, whose titles
    // are "TELETIES - Spiral Hair Coils | Small | <colour>", every one of
    // them reduced to "TELETIES | The Run House". Twelve race tees did the
    // same, collapsing to "2025 Madison Marathon". A title cut at a word
    // boundary keeps what distinguishes the product, and Google truncates a
    // long one anyway.
    cut(model + c),
    model + n + STORE,
    model + n,
    model + STORE,
    model,
  ].filter(Boolean);

  for (const t of candidates) if (t.length <= MAX) return t;
  return cut(model);
}

// Cut on a word boundary, so a title is never truncated mid word.
function cut(s) {
  const t = String(s || '').trim();
  return t.length <= MAX ? t : t.slice(0, MAX).replace(/[\s,|-]+\S*$/, '').trim();
}

// ---------------------------------------------------------------- run ------
async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('restoring ' + rows.length + ' SEO titles from ' + path.basename(file));
  for (let i = 0; i < rows.length; i++) {
    await gql(`mutation($input:ProductInput!){ productUpdate(input:$input){ userErrors{ message } } }`,
      { input: { id: rows[i].id, seo: { title: rows[i].oldTitle || null } } });
    if ((i + 1) % 200 === 0) console.log('  ' + (i + 1) + '/' + rows.length);
    await new Promise((s) => setTimeout(s, 220));
  }
  console.log('done');
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  // COLLECTIVE IS EXCLUDED, by owner's instruction 2026-10-30. It is a
  // dropship marketplace of 40+ vendors whose data this store does not own:
  // 205 distinct product types including "Premiums Sport", "Big Kahuna" and
  // "Campeones", and titles written by somebody else.
  //
  // THE TAG IS "Shopify Collective", NOT "collective", and that distinction
  // nearly let every one of them through. Shopify's `tag:collective` search
  // token-matches, so a COUNT query finds all 1,276 of them, while a
  // per-product test for a tag equal to "collective" matches NONE. Measuring
  // with the second and trusting it said zero Collective products were in
  // scope when the real answer was all of them.
  //
  // Both are used below: the query narrows it, and the tag check catches
  // anything the query's matching lets through.
  const q = (VENDOR ? `vendor:'${VENDOR}' AND ` : '') +
    "status:ACTIVE AND inventory_total:>0 AND -tag:'Shopify Collective'";
  console.log('query   : ' + q);
  console.log('mode    : ' + (APPLY ? 'APPLY, this writes' : 'dry run, nothing is written'));

  const plan = [];
  let after = null, scanned = 0, had = 0, skipped = 0, collective = 0;
  for (let page = 0; page < 60; page++) {
    const d = await gql(`query($a:String,$q:String!){ products(first:250, after:$a, query:$q){
      pageInfo{ hasNextPage endCursor }
      edges{ node{ id handle title vendor productType tags seo{ title } } } } }`, { a: after, q });
    for (const e of d.products.edges) {
      const p = e.node; scanned++;
      if ((p.tags || []).some((t) => /shopify\s*collective/i.test(t))) { collective++; continue; }
      if (p.seo && p.seo.title && p.seo.title.trim()) { had++; continue; }
      const t = seoTitleFor(p);
      if (!t) { skipped++; continue; }
      plan.push({ id: p.id, handle: p.handle, title: p.title, vendor: p.vendor,
        type: p.productType, oldTitle: (p.seo && p.seo.title) || '', seoTitle: t });
      if (LIMIT && plan.length >= LIMIT) break;
    }
    if (LIMIT && plan.length >= LIMIT) break;
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }

  console.log('\nscanned : ' + scanned + ' products');
  console.log('  Shopify Collective, held back : ' + collective);
  console.log('  already had an SEO title : ' + had);
  console.log('  no usable product title  : ' + skipped);
  console.log('  TO WRITE                 : ' + plan.length);

  console.log('\nsamples:');
  plan.slice(0, 14).forEach((r) => {
    console.log('  ' + r.title.slice(0, 60));
    console.log('     -> ' + r.seoTitle + '   [' + r.seoTitle.length + ']');
  });

  const byVendor = {};
  plan.forEach((r) => { byVendor[r.vendor || '(none)'] = (byVendor[r.vendor || '(none)'] || 0) + 1; });
  console.log('\nby vendor:');
  Object.entries(byVendor).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .forEach(([v, c]) => console.log('  ' + String(c).padStart(5) + '  ' + v));
  const rest = Object.entries(byVendor).length - 14;
  if (rest > 0) console.log('  (and ' + rest + ' more vendors)');

  if (process.argv.includes('--show-repeats')) {
    const by = new Map();
    plan.forEach((r) => { if (!by.has(r.seoTitle)) by.set(r.seoTitle, []); by.get(r.seoTitle).push(r); });
    const dup = [...by.entries()].filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
    console.log('\nrepeated titles (' + dup.length + ' distinct strings):');
    dup.slice(0, 12).forEach(([t, rs]) => {
      console.log('  x' + rs.length + '  "' + t.slice(0, 54) + '"');
      rs.slice(0, 3).forEach((r) => console.log('        ' + r.handle.slice(0, 52) + '   <- ' + r.title.slice(0, 44)));
    });
  }

  const over = plan.filter((r) => r.seoTitle.length > MAX);
  const distinct = new Set(plan.map((r) => r.seoTitle)).size;
  console.log('\nover ' + MAX + ' chars : ' + over.length);
  console.log('distinct      : ' + distinct + ' of ' + plan.length +
    (distinct < plan.length ? '   (' + (plan.length - distinct) + ' repeat, usually duplicate PRODUCTS)' : ''));
  const withNoun = plan.filter((r) => /Running Shoes|Track Spikes|Running Socks|Sunglasses|Sandals|Insoles|Shirt|Hoodie|Crewneck|Half-Zip|Jacket|Vest|Shorts|Pants|Leggings|Tank Top|Sports Bra/.test(r.seoTitle)).length;
  console.log('carry a noun  : ' + withNoun);

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return; }
  if (!plan.length) { console.log('\nNothing to write.'); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '').slice(0, 12);
  const roll = path.join(ROOT, 'seo-title-rollback-' + stamp + '.json');
  fs.writeFileSync(roll, JSON.stringify(plan, null, 2));
  console.log('\nrollback written: ' + path.basename(roll));

  // productUpdate is one product per call, so this is the slow one. 4,100
  // calls at ~4/second is about twenty minutes.
  for (let i = 0; i < plan.length; i++) {
    const r = plan[i];
    const d = await gql(`mutation($input:ProductInput!){ productUpdate(input:$input){
      userErrors{ field message } } }`, { input: { id: r.id, seo: { title: r.seoTitle } } });
    (d.productUpdate.userErrors || []).forEach((e) => console.log('  error on ' + r.handle + ': ' + e.message));
    if ((i + 1) % 250 === 0 || i + 1 === plan.length) console.log('  written ' + (i + 1) + '/' + plan.length);
    await new Promise((s) => setTimeout(s, 220));
  }
  console.log('\ndone. Undo with:  node tools/backfill-seo-titles.mjs --restore ' + path.basename(roll));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
