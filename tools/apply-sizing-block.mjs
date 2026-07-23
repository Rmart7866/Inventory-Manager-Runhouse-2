// apply-sizing-block.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Appends a "Sizing" block to footwear product descriptions: how the shoe fits
// for length, what the toebox and available widths are like, and the fit detail
// that actually drives returns (heel lockdown, instep volume, break-in).
//
// Sizing is the single most common pre-purchase question in running retail and
// the single most common reason a shoe comes back. Putting it on the page in a
// consistent place answers it before the customer has to ask.
//
// MODEL LEVEL. Fit is a property of the shoe, not the colourway, so the copy
// file is keyed by base model and fanned out across that model's colourways.
// The key is derived with the WORKER'S OWN PARSER rather than a hand-rolled
// regex, because titles in this store use several different colourway
// separators. A naive "strip everything after the dash" rule split one model
// into 509 phantom one-product models; parseProduct gets it right.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. The block is wrapped in an HTML marker comment, so a re-run REPLACES the
//      previous block instead of appending a second one. Running this twice is
//      a no-op, not a mess.
//   3. Everything already in the description is preserved. This appends; it
//      never rewrites existing copy.
//   4. A product whose description already states sizing (the fuller copy
//      written for newly created products) is skipped, so the same information
//      never appears twice on one page.
//   5. A model with no researched sizing is skipped entirely. Nothing is
//      generated here, and no sizing is ever guessed.
//   6. Rollback file records each product's previous description in full.
//
// Run:  node tools/apply-sizing-block.mjs --copy sizing.json
//       node tools/apply-sizing-block.mjs --copy sizing.json --apply
//       node tools/apply-sizing-block.mjs --rollback <file> --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';
import { parseProduct } from '../worker/src/parsers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const START = '<!-- rh-sizing -->';
const END = '<!-- /rh-sizing -->';

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  env.SHOP_URL = env.SHOP_URL || 'therunhouse.myshopify.com';
  env.API_VERSION = env.API_VERSION || '2026-01';
  return env;
}

const QUERY = `
query($cursor: String) {
  products(first: 100, after: $cursor, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title vendor productType descriptionHtml
      variants(first: 1) { nodes { sku } }
    }
  }
}`;

const UPDATE = `
mutation($p: ProductUpdateInput!) {
  productUpdate(product: $p) { product { id } userErrors { field message } }
}`;

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Same derivation as the model list: brand + genderless model key, both from the
// Worker's parser.
function modelKeyOf(p) {
  const sku = (p.variants?.nodes || [])[0]?.sku || '';
  const parsed = parseProduct({ title: p.title, sku, vendor: p.vendor });
  if (!parsed.ok || !parsed.modelKeyGenderless) return null;
  return slug(parsed.brand) + '-' + slug(parsed.modelKeyGenderless);
}

function blockFor(e) {
  const li = [];
  if (e.sizing) li.push(`<li><strong>Length:</strong> ${esc(e.sizing)}</li>`);
  if (e.width) li.push(`<li><strong>Width and toebox:</strong> ${esc(e.width)}</li>`);
  if (e.fit) li.push(`<li><strong>Fit notes:</strong> ${esc(e.fit)}</li>`);
  return `${START}\n<h3>Sizing</h3>\n<ul>\n${li.join('\n')}\n</ul>\n${END}`;
}

// Replace an existing block if present, otherwise append. This is what makes
// re-running safe.
function merge(html, block) {
  const cur = String(html || '');
  const i = cur.indexOf(START), j = cur.indexOf(END);
  if (i >= 0 && j > i) return cur.slice(0, i) + block + cur.slice(j + END.length);
  return cur.trim() ? cur.trimEnd() + '\n' + block : block;
}

async function throttle(client, body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
    await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
  }
}

async function fetchAll(client) {
  const out = []; let cursor = null;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor });
    out.push(...body.data.products.nodes);
    await throttle(client, body);
    if (!body.data.products.pageInfo.hasNextPage) break;
    cursor = body.data.products.pageInfo.endCursor;
  }
  return out;
}

async function rollback(client, file, apply) {
  const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`Restoring descriptions on ${entries.length} products${apply ? '' : ' (DRY RUN)'}\n`);
  let n = 0;
  for (const e of entries) {
    if (!apply) { n++; continue; }
    const r = await client.graphql(UPDATE, { p: { id: e.id, descriptionHtml: e.before } });
    const ue = r.data.productUpdate.userErrors;
    if (ue.length) console.log(`  FAIL ${e.handle}: ${JSON.stringify(ue)}`); else n++;
  }
  console.log(apply ? `\nRestored ${n}.` : `\n${n} would be restored. Add --apply.`);
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const rbArg = argv.indexOf('--rollback');
  const client = createShopifyClient(loadDevVars());
  if (rbArg >= 0) return rollback(client, argv[rbArg + 1], apply);

  const copyArg = argv.indexOf('--copy');
  if (copyArg < 0) throw new Error('--copy <file.json> is required');
  const copy = JSON.parse(fs.readFileSync(argv[copyArg + 1], 'utf8'));

  process.stderr.write('Fetching active products...\n');
  const products = (await fetchAll(client)).filter((p) => /shoes$/i.test(p.productType || ''));
  console.log(`${products.length} active footwear products.\n`);

  const plans = []; const skipped = {}; const noCopy = new Map();
  for (const p of products) {
    const key = modelKeyOf(p);
    if (!key) { skipped['title does not parse'] = (skipped['title does not parse'] || 0) + 1; continue; }
    const e = copy[key];
    if (!e) { noCopy.set(key, (noCopy.get(key) || 0) + 1); continue; }
    const cur = String(p.descriptionHtml || '');
    // Products that already carry the fuller new-product copy state sizing in
    // their own list. Adding this block too would say it twice.
    if (cur.indexOf(START) < 0 && /<strong>Sizing:<\/strong>/.test(cur)) {
      skipped['already states sizing in its main copy'] = (skipped['already states sizing in its main copy'] || 0) + 1;
      continue;
    }
    const next = merge(cur, blockFor(e));
    if (next === cur) { skipped['already up to date'] = (skipped['already up to date'] || 0) + 1; continue; }
    plans.push({ id: p.id, handle: p.handle, title: p.title, key, before: cur, next, refresh: cur.indexOf(START) >= 0 });
  }

  const fresh = plans.filter((p) => !p.refresh).length, refreshed = plans.length - fresh;
  console.log(`PLAN${apply ? '' : ' (DRY RUN, nothing is written)'}`);
  console.log(`  products to update        : ${plans.length}`);
  console.log(`    new sizing block        : ${fresh}`);
  console.log(`    refreshing an existing  : ${refreshed}`);
  const byModel = {};
  plans.forEach((p) => { byModel[p.key] = (byModel[p.key] || 0) + 1; });
  console.log(`  distinct models covered   : ${Object.keys(byModel).length}`);
  if (Object.keys(skipped).length) {
    console.log('\nSKIPPED:');
    for (const [why, n] of Object.entries(skipped)) console.log(`  ${n}  ${why}`);
  }
  const missing = [...noCopy.entries()].sort((a, b) => b[1] - a[1]);
  if (missing.length) {
    console.log(`\nNO SIZING RESEARCH YET: ${missing.length} models, ${missing.reduce((t, m) => t + m[1], 0)} products`);
    missing.slice(0, 20).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`));
  }

  if (!apply) { console.log('\nDry run. Nothing was written. Re-run with --apply.'); return; }
  if (!plans.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbFile = path.join(ROOT, `sizing-block-rollback-${stamp}.json`);
  fs.writeFileSync(rbFile, JSON.stringify(plans.map((p) => ({ id: p.id, handle: p.handle, before: p.before })), null, 2));
  console.log(`\nRollback file: ${rbFile}\n`);

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      const r = await client.graphql(UPDATE, { p: { id: p.id, descriptionHtml: p.next } });
      const ue = r.data.productUpdate.userErrors;
      if (ue.length) throw new Error(JSON.stringify(ue));
      done++;
      if (done % 50 === 0) console.log(`  ...${done}/${plans.length}`);
      await throttle(client, r);
    } catch (err) { failed++; console.log(`  FAIL ${p.handle}: ${err.message}`); }
  }
  console.log(`\nUpdated ${done}, failed ${failed}.`);
  console.log(`Undo with: node tools/apply-sizing-block.mjs --rollback ${rbFile} --apply`);
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
