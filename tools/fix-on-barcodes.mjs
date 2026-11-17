// fix-on-barcodes.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Puts ON's real barcode (EAN-13) on ON variants whose barcode is EMPTY or
// MALFORMED, from barcode-data.js (BarcodeData.on for shoes, .onApparel for
// garments, keyed "<article code>|<size>").
//
// WHY. Found 2026-11-17 on #90267-EXC (2): the Cloudrunner 3 Wide Black Black
// 7.5 carried barcode 1912537576, ten digits, where ON's EAN is 7615537591728.
// The "Draft in ON" filler finds the box on ON's grid by EAN first, so a bad
// barcode sends it to a fallback, which typed the pair into another colour. A
// bad barcode also cannot be scanned at the till.
//
// WHAT IT WILL AND WILL NOT CHANGE.
//   empty barcode                 filled
//   MALFORMED (not 8/12/13/14     replaced: it cannot be anybody's barcode,
//     digits, or a bad check        so there is nothing right to lose
//     digit)
//   a VALID barcode that differs  REPORTED ONLY, never written: either side
//     from ON's                     could be the wrong one, and a person
//                                   should look (--list-different prints them)
//   already right                 left alone
// The article code comes off the SKU (ON-<11 chars>-<colour>-<size>), and the
// size off the SKU is checked against the variant's own Size option: if they
// disagree the variant is skipped, because then one of them is wrong too.
// A code already on another variant is refused (a duplicate means the join is
// wrong). Only the barcode changes. Rollback file before the first write;
// --restore puts every old value back.
//
//   node tools/fix-on-barcodes.mjs                      dry run, the summary
//   node tools/fix-on-barcodes.mjs --list-different     plus every valid-but-different one
//   node tools/fix-on-barcodes.mjs --apply              write
//   node tools/fix-on-barcodes.mjs --restore <file> [--apply]
//
// House style: no em dashes.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadDevVars() {
  const env = {};
  for (const line of fs.readFileSync(path.join(ROOT, 'worker', '.dev.vars'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  env.SHOP_URL = env.SHOP_URL || 'therunhouse.myshopify.com';
  env.API_VERSION = env.API_VERSION || '2026-01';
  return env;
}

export function loadOnCodes() {
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'barcode-data.js'), 'utf8') + ';globalThis.__B = BarcodeData;', sb);
  return { shoes: sb.__B.on || {}, apparel: sb.__B.onApparel || {} };
}

// GTIN check digit, for 8, 12, 13 and 14 digit codes.
export function validGtin(code) {
  const s = String(code || '');
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(s)) return false;
  const d = s.split('').map(Number), check = d.pop();
  let sum = 0;
  d.reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

const APPAREL_SIZE = { XXS: '2XS', XXL: '2XL', XXXL: '3XL', XXXXL: '4XL' };

// ON-3MG10091043-BLA-755 -> { article: 3MG10091043, size: 7.5 }. A shoe's size
// code puts the half as a trailing 55 (755 is 7.5, 1255 is 12.5, 15 is 15);
// a garment's is a word (L, XL, 2XL).
export function decodeOnSku(sku) {
  const m = /^ON-([0-9A-Z]{11})-[A-Z0-9]+-([0-9A-Z]+)$/i.exec(String(sku || '').trim());
  if (!m) return null;
  const article = m[1].toUpperCase(), code = m[2].toUpperCase();
  if (/^\d+$/.test(code)) {
    const h = /^(\d{1,2}?)(55)$/.exec(code);
    const size = h ? String(Number(h[1]) + 0.5) : String(Number(code));
    return { article, size, apparel: false };
  }
  return { article, size: APPAREL_SIZE[code] || code, apparel: true };
}

// The variant's own Size option, in the same spelling, to cross-check the SKU.
function optionSize(v, apparel) {
  const o = (v.selectedOptions || []).find((x) => /^size$/i.test(x.name));
  if (!o) return null;
  const s = String(o.value).trim();
  if (!apparel) { const n = parseFloat(s); return Number.isFinite(n) ? String(n) : null; }
  const words = { 'X-SMALL': 'XS', XSMALL: 'XS', SMALL: 'S', MEDIUM: 'M', LARGE: 'L', 'X-LARGE': 'XL', XLARGE: 'XL', XXLARGE: '2XL', '2XLARGE': '2XL', 'XX-LARGE': '2XL' };
  const u = s.toUpperCase().replace(/\s+/g, '');
  return APPAREL_SIZE[u] || words[u] || u;
}

export function plan(products, codes) {
  const seen = new Map();   // barcode -> sku, across everything read
  for (const p of products) for (const v of p.variants) if (v.barcode) seen.set(String(v.barcode).trim(), v.sku);
  const out = { fill: [], replace: [], different: [], right: 0, noDecode: 0, notInData: 0, sizeMismatch: 0, duplicate: 0, variants: 0 };
  for (const p of products) {
    for (const v of p.variants) {
      out.variants++;
      const d = decodeOnSku(v.sku);
      if (!d) { out.noDecode++; continue; }
      const opt = optionSize(v, d.apparel);
      if (opt && opt !== d.size) { out.sizeMismatch++; continue; }
      const want = (d.apparel ? codes.apparel : codes.shoes)[d.article + '|' + d.size];
      if (!want) { out.notInData++; continue; }
      const cur = String(v.barcode || '').trim();
      if (cur === want) { out.right++; continue; }
      const row = { productId: p.id, handle: p.handle, title: p.title, status: p.status, id: v.id, sku: v.sku, from: cur, to: want };
      if (cur && validGtin(cur)) { out.different.push(row); continue; }
      const owner = seen.get(want);
      if (owner && owner !== v.sku) { out.duplicate++; continue; }
      seen.set(want, v.sku);
      (cur ? out.replace : out.fill).push(row);
    }
  }
  return out;
}

const QUERY = `query($cursor: String, $q: String) {
  products(first: 50, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle title status vendor
      variants(first: 100) { nodes { id sku barcode selectedOptions { name value } } } } } }`;
const UPDATE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id barcode } userErrors { field message } } }`;

async function throttle(body) {
  const t = throttleOf(body);
  if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
}

async function fetchOn(client) {
  const out = []; let cursor = null;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor, q: 'vendor:"On Running" OR vendor:ON OR sku:ON-*' });
    for (const p of body.data.products.nodes) {
      // Vendor search is loose, so keep only products with an ON SKU on them.
      const variants = p.variants.nodes.filter((v) => /^ON-/i.test(v.sku || ''));
      if (variants.length) out.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, variants });
    }
    await throttle(body);
    if (!body.data.products.pageInfo.hasNextPage) break;
    cursor = body.data.products.pageInfo.endCursor;
  }
  return out;
}

async function write(client, rows, field) {
  const byProduct = new Map();
  for (const r of rows) { if (!byProduct.has(r.productId)) byProduct.set(r.productId, []); byProduct.get(r.productId).push(r); }
  let ok = 0, failed = 0;
  for (const [productId, list] of byProduct) {
    const body = await client.graphql(UPDATE, { productId, variants: list.map((r) => ({ id: r.id, barcode: r[field] })) });
    const ue = body.data.productVariantsBulkUpdate.userErrors;
    if (ue.length) { failed += list.length; console.log('  FAIL ' + list[0].handle + ': ' + JSON.stringify(ue)); }
    else ok += list.length;
    await throttle(body);
  }
  return { ok, failed };
}

async function main(argv) {
  const apply = argv.includes('--apply');
  const client = createShopifyClient(loadDevVars());
  const ri = argv.indexOf('--restore');
  if (ri >= 0) {
    const rows = JSON.parse(fs.readFileSync(argv[ri + 1], 'utf8')).rows;
    console.log('Restoring ' + rows.length + ' barcodes to their old values' + (apply ? '' : ' (DRY RUN)'));
    if (!apply) return console.log('Dry run, add --apply.');
    const r = await write(client, rows, 'from');
    return console.log('Restored ' + r.ok + ', failed ' + r.failed);
  }

  process.stderr.write('Reading ON products...\n');
  const products = await fetchOn(client);
  const p = plan(products, loadOnCodes());
  const changes = p.fill.concat(p.replace);
  console.log('\nON products ' + products.length + ', variants with an ON SKU ' + p.variants);
  console.log('  already right                  : ' + p.right);
  console.log('  EMPTY, will be filled          : ' + p.fill.length);
  console.log('  MALFORMED, will be replaced    : ' + p.replace.length);
  console.log('  valid but DIFFERENT, report only: ' + p.different.length);
  console.log('  not in the barcode data        : ' + p.notInData);
  console.log('  SKU size disagrees with option : ' + p.sizeMismatch);
  console.log('  SKU does not decode            : ' + p.noDecode);
  console.log('  duplicate code refused         : ' + p.duplicate);
  const show = (label, rows, n) => { if (rows.length) { console.log('\n' + label); rows.slice(0, n).forEach((r) => console.log('  ' + r.sku.padEnd(26) + ' ' + (r.from || '(empty)').padEnd(15) + ' -> ' + r.to + '  ' + r.title.slice(0, 50))); if (rows.length > n) console.log('  ... and ' + (rows.length - n) + ' more'); } };
  show('MALFORMED, replaced:', p.replace, 15);
  show('EMPTY, filled:', p.fill, 8);
  show('VALID BUT DIFFERENT, not touched:', p.different, argv.includes('--list-different') ? 1e9 : 8);
  if (!changes.length) return console.log('\nNothing to change.');
  if (!apply) return console.log('\nDRY RUN, nothing written. Add --apply to write ' + changes.length + '.');

  const dir = path.join(ROOT, 'rollbacks');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'on-barcodes-rollback-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), rows: changes }, null, 1));
  console.log('\nRollback: ' + file);
  const r = await write(client, changes, 'to');
  console.log('Wrote ' + r.ok + ' barcodes' + (r.failed ? ', ' + r.failed + ' FAILED' : '') + '.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message || e); process.exitCode = 1; });
}
