// backfill-pairing.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Writes the custom.* swatch cross-links that pair a shoe with its siblings:
// the other colorways of the same model and width (style_siblings), the same
// colorway in another width (width_siblings), the same model in the other
// gender (gender_sibling), plus model_widths, width_code, width_class, gender
// and color_name. This is the same job as the dashboard's Catalog Tagging
// panel, run over the WHOLE catalog instead of one drop.
//
// WHY IT EXISTS. Create-time pairing cannot happen: a swatch group only
// contains ACTIVE products and everything is created as DRAFT, so a new
// colorway is unpaired until something re-groups its model family. The
// post-create queue does that, but only for handles created while it was
// watching. Measured 2026-09-18, 965 ACTIVE shoes were missing or holding a
// stale cross-link, 937 of them on supplier brands, led by New Balance (308),
// HOKA (211 across both vendor spellings) and Brooks (165).
//
// IT DOES NOT RECOMPUTE THE GROUPING. It loads catalog-tags.js and calls the
// same _groupProducts, _buildMetafieldInputs and _mfEqual the browser runs, so
// there is one definition of a sibling and this file cannot drift from it.
// Parsing likewise goes through worker/src/parsers.js.
//
// PASS THE FIRST VARIANT SKU, ALWAYS. parseProduct reads width out of the SKU
// for Brooks, HOKA and New Balance, and only falls back to the title marker for
// everyone else. An earlier version of this audit parsed titles alone and
// reported 1,069 wrong width_codes that were not wrong at all, which would have
// overwritten correct widths on the three largest brands in the catalog.
//
// SAFETY, in order:
//   1. Dry run by default. --apply is the only way to write.
//   2. A rollback file is written BEFORE the first write, holding every prior
//      value, including the ones that were absent.
//   3. ACTIVE only, for the write AND the grouping. Siblings must be buyable,
//      and a draft or archived product is never touched.
//   4. Grouping runs over every ACTIVE shoe so groups are complete, but writes
//      go only to the vendors in scope. Supplier brands by default: a vendor
//      parsers.js does not know may not follow the "Brand Gender Model - Color"
//      title convention, so its parse is not trustworthy enough to write from.
//      --all-vendors opts in, after you have read the dry run.
//
// Usage:
//   node tools/backfill-pairing.mjs                   # dry run, supplier brands
//   node tools/backfill-pairing.mjs --vendor "New Balance"
//   node tools/backfill-pairing.mjs --all-vendors
//   node tools/backfill-pairing.mjs --apply
//   node tools/backfill-pairing.mjs --restore pairing-rollback-....json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';
import { parseProduct, brandFor } from '../worker/src/parsers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ALL_VENDORS = argv.includes('--all-vendors');
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VENDOR = argOf('--vendor', '');
const LIMIT = parseInt(argOf('--limit', '0'), 10) || 0;
const RESTORE = argOf('--restore', '');

const KNOWN = ['--apply', '--all-vendors', '--vendor', '--limit', '--restore'];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    if (!KNOWN.includes(a)) { console.error(`Unknown argument: ${a}`); process.exit(2); }
  } else if (!['--vendor', '--limit', '--restore'].includes(argv[i - 1])) {
    console.error(`Unexpected argument: ${a}`); process.exit(2);
  }
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
const client = createShopifyClient(devVars());

// catalog-tags.js is a browser global. It reaches for Firestore and the DOM at
// call time, not at load time, and the three functions used here touch neither.
const sandbox = {
  console, window: {}, db: undefined,
  document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'catalog-tags.js'), 'utf8'), sandbox);
const CT = sandbox.CatalogTags;

const SCAN = `query($cursor:String){products(first:250,after:$cursor,query:"product_type:*Shoes*"){
  pageInfo{hasNextPage endCursor}
  nodes{ id handle title vendor status productType
    variants(first:1){nodes{sku}}
    metafields(namespace:"custom",first:20){nodes{key value}} }}}`;

const SET = `mutation($mf:[MetafieldsSetInput!]!){metafieldsSet(metafields:$mf){
  userErrors{field message}}}`;

async function scanAll() {
  let cursor = null, out = [], pages = 0;
  do {
    const d = await client.graphql(SCAN, { cursor });
    const pg = d.data.products;
    out.push(...pg.nodes);
    pages++;
    process.stderr.write(`  scanning page ${pages} (${out.length} products)\r`);
    cursor = pg.pageInfo.hasNextPage ? pg.pageInfo.endCursor : null;
  } while (cursor);
  process.stderr.write(' '.repeat(50) + '\r');
  return out;
}

async function writeChunks(inputs) {
  let done = 0, failed = 0;
  for (let i = 0; i < inputs.length; i += 25) {          // metafieldsSet caps at 25
    const chunk = inputs.slice(i, i + 25);
    const r = await client.graphql(SET, { mf: chunk });
    const ue = r.data?.metafieldsSet?.userErrors || [];
    if (ue.length) { failed += chunk.length; console.log(`  FAIL chunk ${i}: ${ue.map((x) => x.message).join('; ')}`); }
    else done += chunk.length;
    process.stderr.write(`  ${done + failed}/${inputs.length}\r`);
  }
  process.stderr.write(' '.repeat(30) + '\r');
  return { done, failed };
}

async function main() {
  if (RESTORE) {
    const rb = JSON.parse(fs.readFileSync(path.resolve(RESTORE), 'utf8'));
    // A field that was ABSENT cannot be restored by metafieldsSet, which has no
    // way to express "unset". Those are reported, not silently skipped.
    const settable = rb.before.filter((b) => b.value != null);
    const absent = rb.before.length - settable.length;
    console.log(`\nRestore ${settable.length} metafield(s) to their prior value.`);
    if (absent) console.log(`  ${absent} were ABSENT before the run. metafieldsSet cannot unset a field, so those stay. Delete them by hand if it matters.`);
    if (!APPLY) { console.log('DRY RUN. Pass --apply to restore.'); return; }
    const r = await writeChunks(settable);
    console.log(`\nRestored ${r.done}, failed ${r.failed}.`);
    return;
  }

  console.log('\nScanning every shoe in the store.');
  const all = await scanAll();
  const active = all.filter((p) => p.status === 'ACTIVE');
  console.log(`  ${all.length} shoes, ${active.length} ACTIVE.`);

  // Group over EVERY active shoe, so no group is missing a member.
  const recs = [], meta = {}, mfById = {};
  let unparsed = 0;
  for (const p of active) {
    const sku = p.variants?.nodes?.[0]?.sku || '';
    const parsed = parseProduct({ title: p.title, sku, vendor: p.vendor });
    if (!parsed.modelKey || !parsed.colorName) { unparsed++; continue; }
    recs.push({
      id: p.id, gender: parsed.gender, colorName: parsed.colorName,
      modelKey: parsed.modelKey, modelKeyGenderless: parsed.modelKeyGenderless, width: parsed.width,
    });
    const mf = {}; for (const m of p.metafields.nodes) mf[m.key] = m.value;
    mfById[p.id] = mf;
    meta[p.id] = { vendor: p.vendor || '', title: p.title, handle: p.handle, supplier: brandFor(p.vendor).key !== 'UNKNOWN' };
  }
  if (unparsed) console.log(`  ${unparsed} could not be parsed into a model plus color and are left alone.`);

  const plan = CT._groupProducts(recs);
  const allInputs = CT._buildMetafieldInputs(plan);

  const inScope = (id) => {
    const m = meta[id];
    if (!m) return false;
    if (VENDOR) return m.vendor.toLowerCase() === VENDOR.toLowerCase();
    return ALL_VENDORS || m.supplier;
  };

  const changed = [], before = [], byProduct = {};
  for (const inp of allInputs) {
    if (!inScope(inp.ownerId)) continue;
    const cur = (mfById[inp.ownerId] || {})[inp.key];
    if (CT._mfEqual(cur, inp.value, inp.type)) continue;
    changed.push(inp);
    before.push({ ownerId: inp.ownerId, namespace: inp.namespace, key: inp.key, type: inp.type, value: cur == null ? null : cur });
    (byProduct[inp.ownerId] = byProduct[inp.ownerId] || []).push(inp.key);
  }

  const ids = Object.keys(byProduct);
  console.log(`\nProducts needing a pairing fix: ${ids.length}`);
  console.log(`Metafield writes: ${changed.length}`);

  const byVendor = {}, byKey = {};
  ids.forEach((id) => { const v = meta[id].vendor || '(none)'; byVendor[v] = (byVendor[v] || 0) + 1; });
  changed.forEach((i) => { byKey[i.key] = (byKey[i.key] || 0) + 1; });
  console.log('\nBy vendor:');
  Object.entries(byVendor).sort((a, b) => b[1] - a[1]).forEach(([v, n]) => console.log(`  ${String(n).padStart(5)}  ${v}`));
  console.log('\nBy field:');
  Object.entries(byKey).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`));
  console.log('\nSample:');
  ids.slice(0, 10).forEach((id) => console.log(`  ${meta[id].title}\n      ${byProduct[id].join(', ')}`));

  let toWrite = changed, toSave = before;
  if (LIMIT && ids.length > LIMIT) {
    const keep = new Set(ids.slice(0, LIMIT));
    toWrite = changed.filter((i) => keep.has(i.ownerId));
    toSave = before.filter((i) => keep.has(i.ownerId));
    console.log(`\n--limit ${LIMIT}: writing ${toWrite.length} metafield(s) on ${LIMIT} product(s).`);
  }

  if (!toWrite.length) { console.log('\nNothing to do. Every product in scope is paired correctly.'); return; }
  if (!APPLY) { console.log('\nDRY RUN. Pass --apply to write.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbPath = path.join(ROOT, `pairing-rollback-${stamp}.json`);
  fs.writeFileSync(rbPath, JSON.stringify({ when: stamp, before: toSave }, null, 2));
  console.log(`\nRollback written to ${path.basename(rbPath)} BEFORE the first write.`);

  const r = await writeChunks(toWrite);
  console.log(`\nWrote ${r.done}, failed ${r.failed}.`);
  console.log(`Undo: node tools/backfill-pairing.mjs --restore ${path.basename(rbPath)} --apply`);
}

main().catch((e) => { console.error(e); process.exit(1); });
