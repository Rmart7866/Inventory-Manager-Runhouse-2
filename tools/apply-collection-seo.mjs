// apply-collection-seo.mjs, The Run House.
//
// Writes the SEO title and meta description on COLLECTION pages, from the
// reviewed copy in seo-drafts/collection-seo.json.
//
// WHY COLLECTIONS AND NOT PRODUCTS. Measured 2026-10-30: 1,015 collections,
// 78% with no SEO title, 82% with no meta description, 31% with no page copy
// at all, including the two biggest browse pages on the store. Those are the
// pages that can rank for what people actually type, "max cushion running
// shoes", "women's wide running shoes", and the copy on them is yours rather
// than a supplier's. There are about twenty that matter, against 2,884
// products that cannot outrank the brand's own page for their own model name.
//
// THE HOMEPAGE IS NOT IN HERE, because the Admin API has no mutation for it.
// Checked 2026-10-30: the shop mutations are locale, policy, resource feedback
// and payouts, and nothing for SEO. The homepage title and meta live in Online
// Store > Preferences and have to be pasted in by hand. The text is in the
// same JSON under "_homepage".
//
//   node tools/apply-collection-seo.mjs                dry run
//   node tools/apply-collection-seo.mjs --apply        write, with a rollback
//   node tools/apply-collection-seo.mjs --overwrite    also replace existing
//   node tools/apply-collection-seo.mjs --restore <f>  put the old values back
//
// ADD ONLY BY DEFAULT. A collection that already has an SEO title keeps it,
// because a human may have written it. --overwrite is the way to say
// otherwise, and it names what it is replacing before it does.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const OVERWRITE = process.argv.includes('--overwrite');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const RESTORE = arg('--restore', '');
const DRAFTS = path.join(ROOT, arg('--drafts', 'seo-drafts/collection-seo.json'));

// Google shows roughly this much. Past it is spent, not used.
const MAX_TITLE = 60;
const MAX_META = 155;

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

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('restoring ' + rows.length + ' collections from ' + path.basename(file));
  for (const r of rows) {
    await gql(`mutation($input:CollectionInput!){ collectionUpdate(input:$input){ userErrors{ message } } }`,
      { input: { id: r.id, seo: { title: r.oldTitle || null, description: r.oldMeta || null } } });
    await new Promise((s) => setTimeout(s, 220));
  }
  console.log('done');
}

async function main() {
  if (RESTORE) return restore(RESTORE);

  const drafts = JSON.parse(fs.readFileSync(DRAFTS, 'utf8'));
  console.log('drafts  : ' + path.relative(ROOT, DRAFTS) + ', ' + drafts.collections.length + ' collections');
  console.log('mode    : ' + (APPLY ? 'APPLY, this writes' : 'dry run, nothing is written') +
    (OVERWRITE ? '   OVERWRITE: existing titles will be replaced' : '   add only'));

  // THE DRAFTS ARE CHECKED BEFORE ANYTHING IS SENT. A title that is over
  // budget is simply truncated by Google, and an unknown handle means the
  // collection was renamed or deleted since the draft was written. Both are
  // worth knowing before a write rather than after.
  const bad = [];
  for (const c of drafts.collections) {
    if (!c.handle) bad.push('a row has no handle');
    if ((c.title || '').length > MAX_TITLE) bad.push(c.handle + ': title is ' + c.title.length + ' chars');
    if ((c.meta || '').length > MAX_META) bad.push(c.handle + ': meta is ' + c.meta.length + ' chars');
  }
  if (bad.length) { console.log('\nDRAFT PROBLEMS:'); bad.forEach((b) => console.log('  ' + b)); process.exit(1); }

  const plan = [], missing = [], kept = [];
  for (const c of drafts.collections) {
    const d = await gql(`query($q:String!){ collections(first:5, query:$q){ edges{ node{
      id handle title seo{ title description } productsCount{ count } } } } }`, { q: 'handle:' + c.handle });
    const node = d.collections.edges.map((e) => e.node).find((n) => n.handle === c.handle);
    if (!node) { missing.push(c.handle); continue; }
    const hasTitle = !!(node.seo && node.seo.title && node.seo.title.trim());
    if (hasTitle && !OVERWRITE) { kept.push(c.handle + '  "' + node.seo.title + '"'); continue; }
    plan.push({ id: node.id, handle: c.handle, products: node.productsCount.count,
      oldTitle: (node.seo && node.seo.title) || '', oldMeta: (node.seo && node.seo.description) || '',
      title: c.title, meta: c.meta });
  }

  console.log('\nTO WRITE : ' + plan.length);
  if (kept.length) {
    console.log('\nkept, they already have an SEO title (use --overwrite to replace):');
    kept.forEach((k) => console.log('  ' + k.slice(0, 92)));
  }
  if (missing.length) {
    console.log('\nHANDLE NOT FOUND, skipped: ' + missing.join(', '));
  }

  console.log('\nwhat would be written:');
  plan.forEach((r) => {
    console.log('  ' + r.handle + '  (' + r.products + ' products)' + (r.oldTitle ? '   REPLACING "' + r.oldTitle + '"' : ''));
    console.log('     title: ' + r.title + '   [' + r.title.length + ']');
    console.log('     meta : ' + r.meta.slice(0, 96) + (r.meta.length > 96 ? '...' : '') + '   [' + r.meta.length + ']');
  });

  if (!APPLY) { console.log('\nDry run. Re-run with --apply to write.'); return; }
  if (!plan.length) { console.log('\nNothing to write.'); return; }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '').slice(0, 12);
  const roll = path.join(ROOT, 'collection-seo-rollback-' + stamp + '.json');
  fs.writeFileSync(roll, JSON.stringify(plan, null, 2));
  console.log('\nrollback written: ' + path.basename(roll));

  let ok = 0;
  for (const r of plan) {
    const d = await gql(`mutation($input:CollectionInput!){ collectionUpdate(input:$input){
      userErrors{ field message } } }`,
      { input: { id: r.id, seo: { title: r.title, description: r.meta } } });
    const errs = d.collectionUpdate.userErrors || [];
    errs.forEach((e) => console.log('  error on ' + r.handle + ': ' + e.message));
    if (!errs.length) ok++;
    await new Promise((s) => setTimeout(s, 250));
  }
  console.log('\nwritten ' + ok + ' / ' + plan.length);
  console.log('undo with:  node tools/apply-collection-seo.mjs --restore ' + path.basename(roll));

  const h = drafts._homepage;
  if (h) {
    console.log('\nTHE HOMEPAGE IS STILL MANUAL. The Admin API has no mutation for it.');
    console.log('Online Store > Preferences, paste:');
    console.log('  title: ' + h.title);
    console.log('  meta : ' + h.meta);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main().catch((e) => { console.error('FAILED: ' + e.message); process.exit(1); });
