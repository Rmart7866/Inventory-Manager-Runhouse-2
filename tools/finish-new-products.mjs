// finish-new-products.mjs, The Run House. Built 2026-11-12 on owner request
// ("new products should finish themselves ... have it write on its own").
//
// Every night, gives the SHOES created in the last --days (default 14) what a
// finished listing carries, for every supplier brand. DRY RUN unless --apply;
// the nightly job passes --apply. Everything is ADD ONLY and every write is
// recorded in a rollback file first.
//
//   1. DONOR COPY. An older listing of the same vendor, model and gender (the
//      other gender second) gives its function tags, description and SEO
//      description; the last two only where the new product has none. With
//      no same model listing, the PREVIOUS VERSION (GTS 26 from GTS 25,
//      880v15 from 880v14) gives function tags only, never drop tags, which
//      change between versions (Ghost Max 4 9mm, its SE 6mm, 2026-11-12).
//   2. GROUP TAGS. Refresh the catalog, then tools/tag-recent-products.mjs
//      for cw-group, width and gender, exactly as computed for the storefront.
//   3. STATS. stamp-specs.mjs (Color Swatch project) for every model the shoe
//      registry knows, unstamped products only.
//   4. SWATCHES. The inventory tool's own grouping (catalog-tags.js
//      computeMetafields) over every live shoe PLUS the new drafts. Drafts are
//      safe in a swatch row: measured 2026-11-12 the storefront renders
//      published siblings only and silently skips unpublished ones.
//   5. REPORT. Models with no donor, no predecessor or no registry row are
//      listed: a brand new model needs facts a person (or Claude) verifies.
//
//   node tools/finish-new-products.mjs                  dry run
//   node tools/finish-new-products.mjs --apply          write
//   node tools/finish-new-products.mjs --days 30 --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? argv[i + 1] : d; };
const APPLY = argv.includes('--apply');
const DAYS = Math.max(1, parseInt(arg('--days', '14'), 10) || 14);
const STAMP_DIR = process.env.STAMP_DIR || path.join(process.env.HOME || '', 'Desktop', 'Run House Color Swatch');
const WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
const CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36';   // public by construction, reads only
const NODE = process.execPath;
const SKIP_VENDORS = /^(the run house|shopify collective)$/i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ROLLBACK_FILE = path.join(ROOT, 'finish-new-products-rollback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
const flushRollback = (r) => { if (APPLY && r.length) fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(r, null, 1)); };

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(loadDevVars());
const gql = async (q, v) => { for (let i = 0; i < 4; i++) { try { const r = await client.graphql(q, v); if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300)); return r.data || r; } catch (e) { if (i === 3) throw e; await wait(3000); } } };

// ---------------------------------------------------------- identities -----
export const genderOf = (t) => /\bwom[ae]n'?s?\b/i.test(t) ? 'W' : /\bm[ae]n'?s?\b/i.test(t) ? 'M' : 'U';
export function modelOf(title, vendor) {
  let s = String(title || '').split(/\s+-\s*|\s*-\s+/)[0];
  s = s.replace(/\([^)]*\)/g, ' ');
  for (const w of String(vendor || '').toLowerCase().split(/\s+/).filter(Boolean)) s = s.replace(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'ig'), ' ');
  s = s.replace(/\b(brooks|hoka|asics|saucony|on running|on|new balance|altra|puma|merrell|diadora|women'?s|womens|men'?s|mens|unisex|wide|extra|narrow|x-wide)\b/ig, ' ');
  return s.replace(/[^a-z0-9 ]/ig, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}
// The previous version: a trailing number one down, or NB's vNN one down.
export function predecessorOf(model) {
  let m = /^(.*\bv)(\d+)$/.exec(model);
  if (m && +m[2] > 1) return m[1] + (+m[2] - 1);
  m = /^(.*\D)(\d+)$/.exec(model);
  if (m && +m[2] > 1) return m[1] + (+m[2] - 1);
  return null;
}
export const FUNCTION = /^(road|trail|walking|stability|racing|max-cushion|max cushion|high cushion|high-drop|low-drop|shoe|neutral|neutral running|cushioned|daily trainer|trail running|trail shoes|road running|running|road to trail|walking shoes|recovery shoes|family:.+)$/i;
const DROP = /^(high|low)-drop$/i;
const genderTags = (g) => g === 'M' ? ['men', "Men's Shoes"] : g === 'W' ? ['women', "Women's Shoes"] : ['unisex', 'Unisex Shoes', 'men', 'women'];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const textLen = (h) => String(h || '').replace(/<[^>]+>/g, '').trim().length;
const isShoe = (p) => /shoes$/i.test(p.productType || '');

async function pageAll(query, fields) {
  const out = []; let after = null;
  do {
    const d = await gql(`query($q:String!,$a:String){ products(first: 100, after: $a, query: $q) { pageInfo { hasNextPage endCursor } nodes { ${fields} } } }`, { q: query, a: after });
    out.push(...d.products.nodes);
    after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
  } while (after);
  return out;
}

// --------------------------------------------------------- 1. donor copy ---
async function donorStep(rollback) {
  const since = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
  const F = 'id handle title vendor status productType createdAt tags descriptionHtml seo { title description }';
  const fresh = (await pageAll(`created_at:>=${since}`, F)).filter((p) => isShoe(p) && !SKIP_VENDORS.test(p.vendor));
  const vendors = [...new Set(fresh.map((p) => p.vendor))];
  const pool = [];
  for (const v of vendors) pool.push(...(await pageAll(`vendor:'${v.replace(/'/g, "\\'")}' AND created_at:<${since}`, F)).filter(isShoe));
  const rank = (p) => (p.status === 'ACTIVE' ? 1000 : 0) + (textLen(p.descriptionHtml) > 40 ? 100 : 0) + p.tags.length;
  const best = (l) => l.slice().sort((a, b) => rank(b) - rank(a))[0] || null;
  const plans = [], newModels = new Map();
  for (const p of fresh) {
    const g = genderOf(p.title), m = modelOf(p.title, p.vendor);
    if (!m) continue;
    const vend = pool.filter((o) => o.vendor.toLowerCase() === p.vendor.toLowerCase());
    const same = vend.filter((o) => modelOf(o.title, o.vendor) === m && genderOf(o.title) === g);
    const other = vend.filter((o) => modelOf(o.title, o.vendor) === m && genderOf(o.title) !== g);
    const donor = best(same) || best(other);
    const descDonor = best(same.filter((o) => textLen(o.descriptionHtml) > 40)) || best(other.filter((o) => textLen(o.descriptionHtml) > 40));
    let source = donor, pred = null;
    if (!donor) {
      pred = predecessorOf(m);
      if (pred) source = best(vend.filter((o) => modelOf(o.title, o.vendor) === pred && genderOf(o.title) === g)) || best(vend.filter((o) => modelOf(o.title, o.vendor) === pred));
    }
    let tags = source ? source.tags.filter((t) => FUNCTION.test(t)) : [];
    if (tags.some((t) => /^high-drop$/i.test(t)) && tags.some((t) => /^low-drop$/i.test(t))) tags = tags.filter((t) => !/^low-drop$/i.test(t));
    if (!donor) tags = tags.filter((t) => !DROP.test(t));               // a predecessor's drop is not this model's
    tags = tags.concat('model:' + slug(m), genderTags(g));
    if (tags.some((t) => /^trail$/i.test(t)) && g !== 'U') tags.push(g === 'M' ? 'trail:mens' : 'trail:womens');
    const have = new Set(p.tags.map((t) => t.toLowerCase()));
    const add = [...new Set(tags)].filter((t) => !have.has(t.toLowerCase()));
    const setDesc = textLen(p.descriptionHtml) < 20 && descDonor ? descDonor.descriptionHtml : null;
    const setSeo = !p.seo.description && descDonor && descDonor.seo.description ? descDonor.seo.description : null;
    const nk = p.vendor + ' ' + (g === 'M' ? "Men's " : g === 'W' ? "Women's " : '') + m;
    // Only models STILL missing a description: one already written by hand
    // is finished, and listing it every morning would bury the real gaps.
    if (!donor && !descDonor && textLen(p.descriptionHtml) < 20) newModels.set(nk, (newModels.get(nk) || 0) + 1);
    if (add.length || setDesc || setSeo) plans.push({ p, add, setDesc, setSeo, why: donor ? 'same model' : source ? 'predecessor ' + pred : 'no source' });
  }
  console.log(`1. donor copy: ${fresh.length} new shoes in ${DAYS} days | ${plans.length} to finish | tags ${plans.reduce((a, x) => a + x.add.length, 0)}, descriptions ${plans.filter((x) => x.setDesc).length}, SEO ${plans.filter((x) => x.setSeo).length}`);
  if (APPLY) {
    // Recorded BEFORE any write, so a crash part way still leaves the record.
    for (const x of plans) rollback.push({ step: 'donor', id: x.p.id, handle: x.p.handle, tags: x.p.tags, descriptionHtml: x.p.descriptionHtml, seo: x.p.seo, added: x.add });
    flushRollback(rollback);
    for (const x of plans) {
      try {
        if (x.add.length) { const r = await gql(`mutation($id:ID!,$t:[String!]!){ tagsAdd(id:$id, tags:$t){ userErrors { message } } }`, { id: x.p.id, t: x.add }); if (r.tagsAdd.userErrors.length) throw new Error(JSON.stringify(r.tagsAdd.userErrors)); }
        if (x.setDesc || x.setSeo) {
          const input = { id: x.p.id }; if (x.setDesc) input.descriptionHtml = x.setDesc; if (x.setSeo) input.seo = { title: x.p.seo.title, description: x.setSeo };
          const r = await gql(`mutation($i:ProductUpdateInput!){ productUpdate(product:$i){ userErrors { message } } }`, { i: input });
          if (r.productUpdate.userErrors.length) throw new Error(JSON.stringify(r.productUpdate.userErrors));
        }
      } catch (e) { console.log('   FAILED', x.p.handle, e.message.slice(0, 160)); }
    }
  }
  return { fresh, newModels };
}

// ------------------------------------------------------ catalog refresh ----
// A plain fetch that retries: at 3:59 AM on 2026-11-13 one "fetch failed" on
// the refresh request threw out of main() and the swatch step never ran.
async function fetchRetry(url, opts, tries = 4) {
  for (let i = 1; ; i++) {
    try { return await fetch(url, opts); }
    catch (e) { if (i >= tries) throw e; await wait(10000 * i); }
  }
}

async function refreshCatalog() {
  const before = Date.now();
  try { await fetchRetry(WORKER + '/catalog?fresh=1', { headers: { Authorization: 'Bearer ' + CATALOG_TOKEN } }); }
  catch (e) { console.log('   catalog refresh request failed (' + e.message + '); using the catalog as it is'); return false; }
  for (let i = 0; i < 80; i++) {
    await wait(15000);
    try {
      const j = await (await fetch(WORKER + '/catalog/status', { headers: { Authorization: 'Bearer ' + CATALOG_TOKEN } })).json();
      if (Date.parse(j.generatedAt) > before) { console.log('   catalog rebuilt ' + j.generatedAt); return true; }
    } catch (e) { /* keep waiting */ }
  }
  console.log('   catalog did not rebuild within 20 minutes; group tags and swatches use the older one');
  return false;
}

// ---------------------------------------------------------- 4. swatches ----
async function swatchStep(fresh, rollback) {
  const cat = await (await fetchRetry(WORKER + '/catalog', { headers: { Authorization: 'Bearer ' + CATALOG_TOKEN } })).json();
  const products = cat.products || [];
  const el = () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {} } });
  const sb = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {} }, window: {}, setTimeout,
    document: { createElement: el, head: el(), body: el(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'catalog-tags.js'), 'utf8') + '\n;globalThis.CT = CatalogTags;', sb);
  const newIds = new Set(fresh.map((p) => p.id));
  const scoped = products.map((p) => (newIds.has(p.id) && p.status === 'DRAFT' ? Object.assign({}, p, { status: 'ACTIVE' }) : p));
  const { inputs, summary } = sb.CT.computeMetafields(scoped);
  console.log(`4. swatches: ${summary.products} products, ${summary.metafields} metafields to write`);
  if (!APPLY || !inputs.length) return;
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const id of new Set(inputs.map((i) => i.ownerId))) rollback.push({ step: 'swatches', id, handle: (byId.get(id) || {}).handle, mf: (byId.get(id) || {}).mf || {} });
  flushRollback(rollback);
  let bad = 0;
  for (let i = 0; i < inputs.length; i += 25) {
    try { const r = await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors { message } } }`, { m: inputs.slice(i, i + 25) }); bad += r.metafieldsSet.userErrors.length; }
    catch (e) { bad += 25; console.log('   batch failed', e.message.slice(0, 160)); }
  }
  console.log(`   written ${inputs.length - bad}, failed ${bad}`);
}

function runChild(label, cmd, args, opts = {}) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 20 * 60000, ...opts });
    const tail = out.trim().split('\n').slice(-4).join('\n      ');
    console.log(label + '\n      ' + tail);
    return out;
  } catch (e) { console.log(label + ' FAILED: ' + String(e.stdout || e.message).trim().split('\n').slice(-3).join(' | ')); return ''; }
}

async function main() {
  console.log(`\n===== finish new products ${new Date().toLocaleString()} ${APPLY ? 'APPLY' : 'DRY RUN'}, last ${DAYS} days =====`);
  const rollback = [];
  const { fresh, newModels } = await donorStep(rollback);
  if (!fresh.length) { console.log('No new shoes. Nothing to do.'); return 0; }

  console.log('2. group tags: refreshing the catalog first');
  await refreshCatalog();
  runChild('   tag-recent-products', NODE, [path.join(ROOT, 'tools/tag-recent-products.mjs'), '--days', String(DAYS)].concat(APPLY ? ['--apply'] : []), { cwd: ROOT });

  if (fs.existsSync(path.join(STAMP_DIR, 'stamp-specs.mjs'))) {
    const out = runChild('3. stats (stamp-specs, unstamped only)', NODE, ['--env-file=.env', 'stamp-specs.mjs'],
      { cwd: STAMP_DIR, env: { ...process.env, SKIP_STAMPED: '1', ...(APPLY ? {} : { DRY_RUN: '1' }) } });
    const un = (out.match(/Top unmatched model keys[\s\S]*/) || [''])[0].split('\n').slice(1, 12).map((l) => l.trim()).filter(Boolean);
    if (un.length) console.log('   models with no registry row (stats need a verified source):\n      ' + un.join('\n      '));
  } else console.log('3. stats: SKIPPED, stamp-specs.mjs not found at ' + STAMP_DIR);

  // Swatches read the catalog, which now carries the new tags. A failure here
  // is reported and the run carries on to the report, rather than ending the
  // night with later steps silently skipped.
  let failed = 0;
  try {
    if (APPLY) await refreshCatalog();
    await swatchStep(fresh, rollback);
  } catch (e) { failed++; console.log('4. swatches FAILED: ' + e.message); }

  if (newModels.size) {
    console.log('5. NEW MODELS with no listing to copy from (description, and stats if not in the registry, need writing):');
    for (const [k, n] of newModels) console.log('      ' + k + '  (' + n + ')');
  } else console.log('5. every new shoe had a listing to copy from');

  if (APPLY && rollback.length) console.log('rollback: ' + ROLLBACK_FILE);
  return failed ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error('FAILED: ' + e.message); process.exitCode = 1; });
