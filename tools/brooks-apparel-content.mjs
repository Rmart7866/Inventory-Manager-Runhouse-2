// brooks-apparel-content.mjs, The Run House.
//
// Descriptions with a Fit & sizing section for Brooks garments, from Brooks'
// own tech sheets (tools/brooks-apparel-facts.json). The ON equivalent is
// apparel-content.mjs, which reads on.com; Brooks' site refuses scripted
// requests and FastTrack's Facts & Benefits panel is empty for apparel, so the
// source is the tech sheets in the Brooks DAM, read 2026-11-10.
//
// RULES, the same ones the ON pass learned:
//   - FACTS ONLY. Every line is a statement from a Brooks sheet. A model with
//     no sheet gets NO description; calling a garment something it is not is
//     the kind of wrong a returns desk pays for.
//   - ADD ONLY. A product that already has a description is left alone.
//   - Matched on the model in the title ("Brooks Women's Dash Short - Cocoa"
//     is "Women's Dash Short"), gender included, so a women's tight never
//     takes a men's inseam.
//
//   node tools/brooks-apparel-content.mjs            dry run, prints a sample
//   node tools/brooks-apparel-content.mjs --apply    write, with a rollback
//   node tools/brooks-apparel-content.mjs --restore <file>
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const APPLY = process.argv.includes('--apply');
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : ''; };
const RESTORE = arg('--restore');
const FACTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/brooks-apparel-facts.json'), 'utf8'));

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
  return (TOKEN = (await r.json()).access_token);
}
async function gql(q, v = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() }, body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 1500 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
  return j.data;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// "Brooks Women's Dash Short - Cocoa" -> "Women's Dash Short"
export const modelOf = (title) => String(title || '').replace(/^Brooks\s+/i, '').replace(/\s+-\s+[^-]*$/, '').trim();

export function compose(f) {
  const out = [];
  if (f.tagline) out.push('<p>' + esc(f.tagline) + '</p>');
  if (f.uses) out.push('<p>Built for ' + esc(f.uses) + '.</p>');
  if (f.features && f.features.length) out.push('<ul>' + f.features.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>');
  const fit = [['Fit', f.fit], ['Support', f.support], ['Rise', f.rise], ['Inseam', f.inseam], ['Cushion', f.cushion], ['Pack', f.pack], ['Sizes', f.sizes]]
    .filter(([, v]) => v).map(([k, v]) => '<li><strong>' + k + ':</strong> ' + esc(v) + '</li>');
  if (fit.length) out.push('<h4>Fit &amp; sizing</h4><ul>' + fit.join('') + '</ul>');
  if (f.pockets) out.push('<p><strong>Pockets:</strong> ' + esc(f.pockets) + '</p>');
  if (f.fabric) out.push('<p><strong>Fabric:</strong> ' + esc(f.fabric) + '</p>');
  return out.join('\n');
}

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const r of rows) await gql(`mutation($p: ProductUpdateInput!){ productUpdate(product: $p){ userErrors { message } } }`, { p: { id: r.id, descriptionHtml: r.descriptionHtml || '' } });
  console.log('restored ' + rows.length);
}

async function main() {
  if (RESTORE) return restore(RESTORE);
  console.log('mode: ' + (APPLY ? 'APPLY' : 'dry run, nothing is written'));
  const all = []; let after = null;
  do {
    const d = await gql(`query($a:String){ products(first:250, after:$a, query:"vendor:Brooks AND (tag:'womens apparel' OR tag:'mens apparel' OR tag:'unisex apparel')") {
      pageInfo{ hasNextPage endCursor } nodes{ id title status descriptionHtml } } }`, { a: after });
    all.push(...d.products.nodes); after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  const plan = [], noFacts = {}, hasDesc = [];
  for (const p of all) {
    const f = FACTS[modelOf(p.title)];
    if (!f) { noFacts[modelOf(p.title)] = (noFacts[modelOf(p.title)] || 0) + 1; continue; }
    if ((p.descriptionHtml || '').replace(/<[^>]+>/g, '').trim()) { hasDesc.push(p.title); continue; }
    plan.push({ p, html: compose(f) });
  }
  console.log('Brooks garments: ' + all.length + ' | to write: ' + plan.length + ' | already described, left alone: ' + hasDesc.length);
  console.log('no Brooks sheet, left without a description: ' + Object.values(noFacts).reduce((a, b) => a + b, 0) + ' products across ' + Object.keys(noFacts).length + ' models');
  Object.entries(noFacts).sort().forEach(([m, n]) => console.log('   ' + String(n).padStart(3) + '  ' + m));
  if (plan[0]) console.log('\nsample, ' + plan[0].p.title + ':\n' + plan[0].html + '\n');
  if (!APPLY) { console.log('DRY RUN. Re-run with --apply.'); return; }
  const rb = path.join(ROOT, 'brooks-apparel-content-rollback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(rb, JSON.stringify(plan.map((x) => ({ id: x.p.id, title: x.p.title, descriptionHtml: x.p.descriptionHtml || '' })), null, 1));
  let ok = 0;
  for (const x of plan) {
    const d = await gql(`mutation($p: ProductUpdateInput!){ productUpdate(product: $p){ userErrors { message } } }`, { p: { id: x.p.id, descriptionHtml: x.html } });
    if (d.productUpdate.userErrors.length) console.log('ERR ' + x.p.title + ': ' + d.productUpdate.userErrors.map((e) => e.message).join('; ')); else ok++;
  }
  console.log('written ' + ok + ' of ' + plan.length + ' | rollback ' + rb);
}
if (import.meta.url === 'file://' + process.argv[1]) main();
