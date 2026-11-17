// saucony-apparel-content.mjs, The Run House.
//
// Descriptions for Saucony garments, from Saucony's own product record on the
// Wolverine B2B portal (/api/b2b/products/<style code>, the same session the
// nightly runner uses). Built 2026-11-17 for the first Saucony apparel drop.
//
// TWO STEPS.
//   --refresh-facts   reads every Saucony garment's record through a logged-in
//                     Wolverine window (the --setup window, port 9534, or a
//                     running headless runner, 9533) and saves the FACTS to
//                     tools/saucony-apparel-facts.json: tagline, feature
//                     bullets, fit, best for, material. No prices, ever.
//   (default)         composes a description per product from that file and
//                     writes it, dry run unless --apply.
//
// RULES, the same ones the ON and Brooks passes learned:
//   - FACTS ONLY. Every line is Saucony's own statement. A style with no record
//     gets NO description.
//   - ADD ONLY. A product that already has a description is left alone.
//   - Joined on the STYLE CODE in the SKU (SAW800486-WH-XS -> SAW800486-WH),
//     exact, so a colourway can never take another's copy.
//   - Internal merchandising lines are dropped: Saucony's features carry notes
//     like "BK, WH and NVH carry over to AW25", which mean nothing to a shopper.
//   - Also fixes "3d" to "3D" in a Saucony garment title: formatProductName
//     lowercases every word, so "TRIUMPH 3D 1/2 ZIP" came out "Triumph 3d".
//
//   node tools/saucony-apparel-content.mjs --refresh-facts
//   node tools/saucony-apparel-content.mjs              dry run
//   node tools/saucony-apparel-content.mjs --apply      write, rollback first
//   node tools/saucony-apparel-content.mjs --restore <file>
//
// House style: no em dashes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FACTS_FILE = path.join(ROOT, 'tools', 'saucony-apparel-facts.json');
const APPLY = process.argv.includes('--apply');
const arg = (n) => { const i = process.argv.indexOf(n); return i !== -1 ? process.argv[i + 1] : ''; };

function client() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, 'worker', '.dev.vars'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  env.SHOP_URL = env.SHOP_URL || 'therunhouse.myshopify.com';
  env.API_VERSION = env.API_VERSION || '2026-01';
  return createShopifyClient(env);
}

// ---------------------------------------------------------------- facts

const ENT = { '&#8226;': '•', '&#8217;': "'", '&#8216;': "'", '&#8220;': '"', '&#8221;': '"', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#8211;': ',', '&#8212;': ',' };
const decode = (s) => String(s || '').replace(/&#\d+;|&[a-z]+;/g, (e) => (e in ENT ? ENT[e] : ''));
const lines = (s) => decode(s).split(/<br\s*\/?>|\n/i).map((x) => x.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
// Merchandising notes for buyers, never for a product page.
const INTERNAL = /carry\s*-?\s*over|carryover|\b(AW|SS|FW|SP|FA|HO)\s?\d{2}\b|\bcolou?rways?\b|\bSKUs?\b|\bdelivery\b|\bin-?line\b|\bclose-?out\b/i;

export function parseRecord(lang) {
  const d = lines(lang.description), f = lines(lang.featuresAndBenefits);
  const out = { name: lang.name || '', gender: lang.gender || '', tagline: '', features: [], fit: '', bestFor: '', material: '' };
  // Two layouts on the portal (2026-11-17): "KEY DETAILS / BEST FOR: ..." at
  // the end of the features, and "BEST FOR Cool weather layering" with NO colon
  // leading the description itself (Hurricane Tight, Fortify tights). Both are
  // read from either field.
  const kvOf = (x) => /^(BEST FOR|FIT|PRIMARY MATERIAL|MATERIAL)\s*:?\s+(.+)$/i.exec(x);
  const take = (kv) => { const k = kv[1].toUpperCase(); if (k === 'BEST FOR') out.bestFor = kv[2]; else if (k === 'FIT') out.fit = kv[2]; else out.material = kv[2]; };
  for (const x of d) {
    if (/collection$/i.test(x) || /^why you.?ll love it/i.test(x) || /^key details$/i.test(x)) continue;
    const kv = kvOf(x);
    if (kv) { take(kv); continue; }
    if (/^•/.test(x)) { out.features.push(x.replace(/^•\s*/, '')); continue; }
    if (!out.tagline) out.tagline = x;
  }
  for (const x of f) {
    const kv = kvOf(x);
    if (kv) { take(kv); continue; }
    if (/^key details$/i.test(x)) continue;
    if (/^•/.test(x)) out.features.push(x.replace(/^•\s*/, ''));
  }
  const seen = new Set();
  out.features = out.features.filter((x) => {
    if (INTERNAL.test(x)) return false;
    const k = x.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!k || seen.has(k)) return false;
    seen.add(k); return true;
  });
  return out;
}

async function refreshFacts(codes) {
  let target = null;
  for (const port of [9534, 9533]) {
    try {
      const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(2000) })).json();
      target = tabs.find((x) => x.type === 'page' && /orderwwwbrands/.test(x.url));
      if (target) break;
    } catch (e) { /* try the next */ }
  }
  if (!target) throw new Error('no logged-in Wolverine window. Run: node tools/wolverine-headless-run.mjs --setup, log in, then retry.');
  if (!/saucony\./.test(target.url)) throw new Error('the Wolverine window is not on the Saucony site; open saucony.orderwwwbrands.com in it first');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const res = await new Promise((resolve) => {
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id === 1) resolve(m.result?.result?.value); });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const out = {};
      for (const c of ${JSON.stringify(codes)}) {
        try {
          const r = await fetch('/api/b2b/products/' + encodeURIComponent(c), { credentials: 'include' });
          if (!r.ok) { out[c] = { status: r.status }; continue; }
          const d = (await r.json()).data || {};
          const l = (d.languages || []).find((x) => x.language === 'en' && x.country === 'US') || (d.languages || [])[0] || {};
          out[c] = { name: l.name || '', gender: l.gender || '', color: l.color || '', description: l.description || '', featuresAndBenefits: l.featuresAndBenefits || '' };
        } catch (e) { out[c] = { error: String(e.message || e) }; }
      }
      return JSON.stringify(out);
    })()` } }));
  });
  ws.close();
  const raw = JSON.parse(res);
  const facts = fs.existsSync(FACTS_FILE) ? JSON.parse(fs.readFileSync(FACTS_FILE, 'utf8')) : {};
  let got = 0;
  for (const [c, v] of Object.entries(raw)) {
    if (!v || v.status || v.error || !(v.description || v.featuresAndBenefits)) { console.log('  no record for ' + c + (v && (v.status || v.error) ? ' (' + (v.status || v.error) + ')' : '')); continue; }
    facts[c] = { ...parseRecord(v), color: v.color, read: new Date().toISOString().slice(0, 10) };
    got++;
  }
  fs.writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 1) + '\n');
  console.log('facts for ' + got + ' of ' + codes.length + ' style codes -> ' + path.relative(ROOT, FACTS_FILE));
}

// ---------------------------------------------------------------- compose

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const sentence = (s) => { const t = cap(String(s).trim()); return /[.!?]$/.test(t) ? t : t + '.'; };

// "140 g/m2 92% Polyester (Recycled)/ 8% Elastane" ->
// "92% Polyester (Recycled), 8% Elastane, 140 g/m²". The weight leads in
// Saucony's text and its slash is part of the unit, so it is lifted out first;
// only a slash between two fibres becomes a comma.
export function material(s) {
  let t = String(s || '').trim(), weight = '';
  const w = /(\d+(?:\.\d+)?)\s*g\s*\/\s*m\s*2\b/i.exec(t);
  if (w) { weight = w[1] + ' g/m²'; t = (t.slice(0, w.index) + t.slice(w.index + w[0].length)).trim(); }
  t = t.replace(/\s*\/\s*(?=\d)/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s{2,}/g, ' ');
  return [t, weight].filter(Boolean).join(', ');
}

export function compose(f) {
  if (!f || !(f.tagline || (f.features && f.features.length))) return '';
  const out = [];
  if (f.tagline) out.push('<p>' + esc(sentence(f.tagline)) + '</p>');
  if (f.features && f.features.length) out.push('<ul>' + f.features.map((x) => '<li>' + esc(cap(x.replace(/\.$/, ''))) + '</li>').join('') + '</ul>');
  const det = [];
  if (f.fit) det.push('<li><strong>Fit:</strong> ' + esc(f.fit) + '</li>');
  if (f.bestFor) det.push('<li><strong>Best for:</strong> ' + esc(f.bestFor) + '</li>');
  if (f.material) det.push('<li><strong>Material:</strong> ' + esc(material(f.material)) + '</li>');
  if (det.length) out.push('<h4>Fit &amp; details</h4><ul>' + det.join('') + '</ul>');
  return out.join('');
}

export const styleCodeOf = (sku) => { const m = /^(SA[MWU]\d{6}-[A-Z0-9]{1,5})-/i.exec(String(sku || '')); return m ? m[1].toUpperCase() : ''; };
export const fixTitle = (t) => String(t).replace(/\b(\d)d\b/g, '$1D');

// ---------------------------------------------------------------- run

async function garments(c) {
  const out = []; let after = null;
  for (;;) {
    const r = await c.graphql(`query($a:String){ products(first:100, after:$a, query:"vendor:Saucony"){ pageInfo{hasNextPage endCursor}
      nodes{ id handle title status descriptionHtml variants(first:1){ nodes{ sku } } } } }`, { a: after });
    const d = (r.data || r).products;
    for (const p of d.nodes) { const code = styleCodeOf(p.variants.nodes[0]?.sku); if (code) out.push({ ...p, code }); }
    if (!d.pageInfo.hasNextPage) break; after = d.pageInfo.endCursor;
  }
  return out;
}

async function main() {
  const c = client();
  const restore = arg('--restore');
  if (restore) {
    const rows = JSON.parse(fs.readFileSync(restore, 'utf8'));
    console.log('restoring ' + rows.length + (APPLY ? '' : ' (dry run, add --apply)'));
    if (!APPLY) return;
    for (const r of rows) await c.graphql(`mutation($p: ProductUpdateInput!){ productUpdate(product: $p){ userErrors { message } } }`, { p: { id: r.id, title: r.title, descriptionHtml: r.descriptionHtml || '' } });
    return console.log('restored');
  }
  const list = await garments(c);
  if (process.argv.includes('--refresh-facts')) return refreshFacts([...new Set(list.map((p) => p.code))]);

  const facts = fs.existsSync(FACTS_FILE) ? JSON.parse(fs.readFileSync(FACTS_FILE, 'utf8')) : {};
  const plan = [], noFacts = [], hasDesc = [];
  for (const p of list) {
    const html = compose(facts[p.code]);
    const title = fixTitle(p.title);
    const needDesc = !(p.descriptionHtml || '').replace(/<[^>]+>/g, '').trim();
    if (!needDesc) hasDesc.push(p.title);
    if (needDesc && !html) noFacts.push(p.title + ' (' + p.code + ')');
    const change = {};
    if (needDesc && html) change.descriptionHtml = html;
    if (title !== p.title) change.title = title;
    if (Object.keys(change).length) plan.push({ p, change });
  }
  console.log('Saucony garments ' + list.length + ' | to write ' + plan.length + ' | already described ' + hasDesc.length + ' | no facts ' + noFacts.length);
  noFacts.forEach((x) => console.log('  no facts: ' + x));
  for (const x of plan.slice(0, 2)) console.log('\n' + (x.change.title || x.p.title) + '\n' + (x.change.descriptionHtml || '(title only)').replace(/></g, '>\n<'));
  plan.forEach((x) => console.log('  ' + (x.change.descriptionHtml ? 'desc ' : '     ') + (x.change.title ? 'title ' : '      ') + x.p.title));
  if (!APPLY || !plan.length) return console.log(plan.length ? '\nDRY RUN, add --apply to write.' : '\nNothing to write.');
  const rb = path.join(ROOT, 'saucony-apparel-content-rollback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(rb, JSON.stringify(plan.map((x) => ({ id: x.p.id, title: x.p.title, descriptionHtml: x.p.descriptionHtml || '' })), null, 1));
  let ok = 0;
  for (const x of plan) {
    const r = await c.graphql(`mutation($p: ProductUpdateInput!){ productUpdate(product: $p){ userErrors { message } } }`, { p: { id: x.p.id, ...x.change } });
    const ue = (r.data || r).productUpdate.userErrors;
    if (ue.length) console.log('ERR ' + x.p.title + ': ' + ue.map((e) => e.message).join('; ')); else ok++;
  }
  console.log('\nwritten ' + ok + ' of ' + plan.length + ' | rollback ' + rb);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
}
