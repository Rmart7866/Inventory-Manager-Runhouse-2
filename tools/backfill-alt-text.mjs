// backfill-alt-text.mjs, The Run House.
//
// Writes ALT TEXT on the lead image of products that have none.
//
// Measured 2026-10-30 over 5,000 ACTIVE in-stock products: 3,467 of them, 69%,
// have a lead image with no alt text at all. That is the cheapest SEO and
// accessibility gap on the store. Alt text is what Google Images reads, and it
// is what a screen reader says instead of "image".
//
// WHY THIS ONE IS SAFE TO DO IN BULK, unlike the meta description backfill:
// alt text is invisible to a shopper, it cannot be duplicate-content
// penalised, it does not change a URL, and it is one field per image that a
// rollback file restores exactly. Nothing a customer sees changes.
//
//   node tools/backfill-alt-text.mjs                  dry run, prints samples
//   node tools/backfill-alt-text.mjs --limit 50       look at 50
//   node tools/backfill-alt-text.mjs --apply          write, with a rollback file
//   node tools/backfill-alt-text.mjs --restore <file> put the old values back
//
// ADD ONLY. A product whose lead image already has alt text is never touched,
// because a human may have written it.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { titleParts } from './product-title-parts.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', '0'));
const RESTORE = arg('--restore', '');
const VENDOR = arg('--vendor', '');

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
// WHAT GOOD ALT TEXT IS, and what it is not. It describes the image for
// someone who cannot see it. It does NOT begin "image of" or "photo of",
// which screen readers already announce and which wastes the first words
// Google reads. It is not a keyword list either.
//
// The product title already carries the facts, in a shape this store is
// consistent about: "<Vendor> <Gender> <Model> - <Colour>". So the colour is
// split off the end and the garment or shoe word comes from the product type,
// giving "ON Men's Cloudboom Echo 3 running shoe in All Black".
// The title parsing lives in tools/product-title-parts.mjs, shared with
// backfill-seo-titles.mjs. Both have to split a title identically and this
// repo has paid for two copies of one rule drifting apart more than once.
export function altFor(p) {
  const { model, colour } = titleParts(p.title);
  if (!model) return '';

  // ONLY SHOES GET A NOUN ADDED. The first version appended the product type
  // to everything, which reads as nonsense on accessories because the type is
  // a CATEGORY rather than a thing: "AirFlow Lite Pack storage", "Clip Light
  // visibility", "Heel Lift insoles & inserts". Those titles already name the
  // object. A shoe title often does not say "shoe" at all, which is the one
  // case worth filling in.
  let alt = model;
  if (/shoes?$/i.test(String(p.productType || '').trim()) && !/\bshoes?\b/i.test(alt)) {
    alt += ' running shoe';
  }
  if (colour && !new RegExp(colour.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(alt)) {
    alt += ' in ' + colour;
  }
  alt = alt.replace(/\s+/g, ' ').trim();
  // Shopify allows 512, but a screen reader read past ~125 characters is a
  // worse experience than a shorter one, and Google truncates too.
  if (alt.length > 125) alt = alt.slice(0, 122).replace(/\s+\S*$/, '') + '...';
  return alt;
}

// ---------------------------------------------------------------- run ------
async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('restoring ' + rows.length + ' alt values from ' + path.basename(file));
  for (let i = 0; i < rows.length; i += 25) {
    const chunk = rows.slice(i, i + 25);
    const d = await gql(`mutation($files:[FileUpdateInput!]!){ fileUpdate(files:$files){
      userErrors{ field message } } }`,
      { files: chunk.map((r) => ({ id: r.mediaId, alt: r.oldAlt || '' })) });
    (d.fileUpdate.userErrors || []).forEach((e) => console.log('  error: ' + e.message));
    console.log('  ' + Math.min(i + 25, rows.length) + '/' + rows.length);
  }
  console.log('done');
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  const q = VENDOR
    ? `vendor:'${VENDOR}' AND status:ACTIVE AND inventory_total:>0`
    : 'status:ACTIVE AND inventory_total:>0';
  console.log('query   : ' + q);
  console.log('mode    : ' + (APPLY ? 'APPLY, this writes' : 'dry run, nothing is written'));

  const plan = [];
  let after = null, scanned = 0, hadAlt = 0, noMedia = 0;
  for (let page = 0; page < 60; page++) {
    const d = await gql(`query($a:String,$q:String!){ products(first:250, after:$a, query:$q){
      pageInfo{ hasNextPage endCursor }
      edges{ node{ id handle title vendor productType
        featuredMedia{ ... on MediaImage { id alt } } } } } }`, { a: after, q });
    for (const e of d.products.edges) {
      const p = e.node; scanned++;
      const m = p.featuredMedia;
      if (!m || !m.id) { noMedia++; continue; }
      if (m.alt && m.alt.trim()) { hadAlt++; continue; }
      const alt = altFor(p);
      if (!alt) continue;
      plan.push({ id: p.id, handle: p.handle, title: p.title, mediaId: m.id, oldAlt: m.alt || '', alt });
      if (LIMIT && plan.length >= LIMIT) break;
    }
    if (LIMIT && plan.length >= LIMIT) break;
    if (!d.products.pageInfo.hasNextPage) break;
    after = d.products.pageInfo.endCursor;
  }

  console.log('\nscanned : ' + scanned + ' products');
  console.log('  already had alt text : ' + hadAlt);
  console.log('  no lead image at all : ' + noMedia);
  console.log('  TO WRITE             : ' + plan.length);

  console.log('\nsamples:');
  plan.slice(0, 12).forEach((r) => {
    console.log('  ' + r.title.slice(0, 54));
    console.log('     -> ' + r.alt);
  });

  // a cheap check that the copy is doing its job
  const dupes = plan.length - new Set(plan.map((r) => r.alt)).size;
  console.log('\ndistinct alt strings: ' + (plan.length - dupes) + ' of ' + plan.length +
    (dupes ? '   (' + dupes + ' repeat, which is fine for alt text but worth a look)' : ''));
  const tooLong = plan.filter((r) => r.alt.length > 125).length;
  console.log('over 125 chars: ' + tooLong);

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return; }
  if (!plan.length) { console.log('\nNothing to write.'); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '').slice(0, 13);
  const roll = path.join(ROOT, 'alt-text-rollback-' + stamp + '.json');
  fs.writeFileSync(roll, JSON.stringify(plan, null, 2));
  console.log('\nrollback written: ' + path.basename(roll));

  let done = 0;
  for (let i = 0; i < plan.length; i += 25) {
    const chunk = plan.slice(i, i + 25);
    const d = await gql(`mutation($files:[FileUpdateInput!]!){ fileUpdate(files:$files){
      userErrors{ field message } } }`,
      { files: chunk.map((r) => ({ id: r.mediaId, alt: r.alt })) });
    (d.fileUpdate.userErrors || []).forEach((e) => console.log('  error: ' + e.message));
    done += chunk.length;
    if (done % 250 === 0 || done === plan.length) console.log('  written ' + done + '/' + plan.length);
    await new Promise((s) => setTimeout(s, 350));
  }
  console.log('\ndone. Undo with:  node tools/backfill-alt-text.mjs --restore ' + path.basename(roll));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
