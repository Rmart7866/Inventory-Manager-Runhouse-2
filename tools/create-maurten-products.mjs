// create-maurten-products.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Builds the Maurten listings from the wholesale price list, grouped the way the
// store already groups nutrition: one product per product line, with a Pack
// option for the single versus the box.
//
// THE PRICE LIST IS NOT IN THIS FILE, ON PURPOSE. This repo is public and that
// sheet carries wholesale cost. It lives in maurten-price-list.csv, which
// .gitignore blocks along with every other *.csv. This tool reads it at run
// time and only ever sends the RETAIL price to Shopify.
//
// HOUSE CONVENTIONS, copied from the existing nutrition listings rather than
// invented. Measured against GU Energy Gels and the other 20 products tagged
// nutrition: productType "Nutrition", tag "nutrition" lower case, and a real
// Shopify taxonomy category per kind of product. Category is load bearing for
// the Google and Meta feeds, see CLAUDE.md.
//
// CREATE ONLY, DRAFT ONLY, the same rule the Worker's create route follows. A
// handle that already exists is skipped, never overwritten, and everything is
// created as DRAFT so nothing reaches the storefront until a human publishes it.
//
// WHAT IT WILL NOT DO:
//   1. No bulk boxes. Gel 100 Bulk Box and the three others have NO recommended
//      retail price on the list, so there is no honest number to sell them at.
//      They are trade packs. Pass --include-bulk to list them at wholesale plus
//      the margin you choose with --bulk-markup.
//   2. No inventory. Stock is set separately and these are created with
//      tracking on but zero on hand.
//   3. No images. Maurten artwork is not in this repo; add it in the admin.
//
// Usage:
//   node tools/create-maurten-products.mjs
//   node tools/create-maurten-products.mjs --apply
//   node tools/create-maurten-products.mjs --include-bulk --bulk-markup 1.6 --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const INCLUDE_BULK = argv.includes('--include-bulk');
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BULK_MARKUP = parseFloat(argOf('--bulk-markup', '1.5'));
const CSV = argOf('--csv', path.join(ROOT, 'maurten-price-list.csv'));

const KNOWN = ['--apply', '--include-bulk', '--bulk-markup', '--csv'];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { if (!KNOWN.includes(a)) { console.error(`Unknown argument: ${a}`); process.exit(2); } }
  else if (!['--bulk-markup', '--csv'].includes(argv[i - 1])) { console.error(`Unexpected argument: ${a}`); process.exit(2); }
}

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

// Shopify taxonomy leaves, looked up live rather than guessed.
const CAT = {
  gel: 'gid://shopify/TaxonomyCategory/hb-1-9-3',        // Nutrition Gels & Chews
  drink: 'gid://shopify/TaxonomyCategory/fb-1-11-2',     // Sports Drink Mixes
  solid: 'gid://shopify/TaxonomyCategory/hb-1-9-1',      // Nutrition Bars
  bottle: 'gid://shopify/TaxonomyCategory/sg-1-13-20',   // Sports Water Bottles
};

// One entry per PRODUCT, listing the price-list rows that become its variants.
// Keyed on the list's own Item Description so a change to the list is obvious.
const PRODUCTS = [
  { title: 'Maurten Drink Mix 160', cat: CAT.drink, option: 'Pack',
    variants: [['Drink Mix 160 Unit', 'Single sachet'], ['Drink Mix 160 Box', 'Box of 18']] },
  { title: 'Maurten Drink Mix 320', cat: CAT.drink, option: 'Pack',
    variants: [['Drink Mix 320 Unit', 'Single sachet'], ['Drink Mix 320 Box', 'Box of 14']] },
  { title: 'Maurten Drink Mix 320 CAF 100', cat: CAT.drink, option: 'Pack',
    variants: [['Drink Mix 320 Caf 100 Unit', 'Single sachet'], ['Drink Mix 320 Caf 100 Box', 'Box of 14']] },
  { title: 'Maurten Gel 100', cat: CAT.gel, option: 'Pack',
    variants: [['Gel 100 Unit', 'Single gel'], ['Gel 100 Box', 'Box of 12'], ['Gel 100 Bulk Box', 'Bulk box of 48']] },
  { title: 'Maurten Gel 100 CAF 100', cat: CAT.gel, option: 'Pack',
    variants: [['Gel 100 Caf 100 Unit', 'Single gel'], ['Gel 100 Caf 100 Box', 'Box of 12'], ['Gel 100 Caf 100 Bulk Box', 'Bulk box of 48']] },
  { title: 'Maurten Gel 160', cat: CAT.gel, option: 'Pack',
    variants: [['Gel 160 Unit', 'Single gel'], ['Gel 160 Box', 'Box of 12']] },
  { title: 'Maurten Gel Mix 480', cat: CAT.gel, option: 'Pack',
    variants: [['Gel Mix 480 Unit', 'Single sachet'], ['Gel Mix 480 Box', 'Box of 6']] },
  { title: 'Maurten Solid 160', cat: CAT.solid, option: 'Pack',
    variants: [['Solid 160 Unit', 'Single bar'], ['Solid 160 Box', 'Box of 12'], ['Solid 160 Bulk Box', 'Bulk box of 40']] },
  { title: 'Maurten Solid C 160', cat: CAT.solid, option: 'Pack',
    variants: [['Solid C 160 Unit', 'Single bar'], ['Solid C 160 Box', 'Box of 12'], ['Solid C 160 Bulk Box', 'Bulk box of 40']] },
  { title: 'Maurten Solid Mix Box', cat: CAT.solid, option: 'Pack',
    variants: [['Solid Mix Box', 'Box of 12']] },
  { title: 'Maurten Addition', cat: CAT.gel, option: 'Flavor',
    variants: [['Addition Orange', 'Orange'], ['Addition Menthol', 'Menthol'],
               ['Addition Cola', 'Cola'], ['Addition Apple', 'Apple']] },
  { title: 'Maurten Bottle', cat: CAT.bottle, option: 'Size',
    variants: [['Maurten 500 ml Bottle', '500 ml'], ['Maurten 750 ml Bottle', '750 ml']] },
  { title: 'Maurten Gelflask 150ml', cat: CAT.bottle, option: 'Size',
    variants: [['Gelflask 150ml', '150 ml']] },
  { title: 'Maurten Gel Mix Flask 350ml', cat: CAT.bottle, option: 'Size',
    variants: [['Gel Mix Flask (350ml)', '350 ml']] },
  // The list spells this "Drinkfllask". Corrected here, the item number is the
  // thing that has to match and it does.
  { title: 'Maurten Drinkflask 550ml', cat: CAT.bottle, option: 'Size',
    variants: [['Drinkfllask 550ml', '550 ml']] },
];

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(',');
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const o = {};
    head.forEach((h, i) => { o[h.trim()] = (cells[i] || '').trim(); });
    return o;
  });
}

const handleOf = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  if (!fs.existsSync(CSV)) throw new Error('Price list not found: ' + CSV);
  const rows = parseCSV(fs.readFileSync(CSV, 'utf8'));
  const byDesc = {};
  for (const r of rows) byDesc[r.description] = r;

  // Every row in the list must be used by exactly one product, or a line has
  // been quietly dropped. This is the check that catches a typo in PRODUCTS.
  const used = new Set();
  for (const p of PRODUCTS) for (const [desc] of p.variants) {
    if (!byDesc[desc]) { console.error(`PRODUCTS references a row the list does not have: "${desc}"`); process.exit(1); }
    if (used.has(desc)) { console.error(`"${desc}" is used by two products`); process.exit(1); }
    used.add(desc);
  }
  const orphans = rows.map((r) => r.description).filter((d) => !used.has(d));
  if (orphans.length) { console.error('Rows in the list that no product uses:\n  ' + orphans.join('\n  ')); process.exit(1); }

  console.log(`\nPrice list: ${rows.length} rows, all accounted for across ${PRODUCTS.length} products.`);

  // Which handles already exist? Create-only, so those are skipped.
  const handles = PRODUCTS.map((p) => handleOf(p.title));
  const q = handles.map((h) => `handle:${h}`).join(' OR ');
  const ex = await client.graphql(`query($q:String){products(first:60,query:$q){nodes{handle title status}}}`, { q });
  const existing = new Set(ex.data.products.nodes.map((n) => n.handle));
  if (existing.size) {
    console.log(`\nAlready in Shopify, will be SKIPPED:`);
    ex.data.products.nodes.forEach((n) => console.log(`  [${n.status}] ${n.title}`));
  }

  const plan = [];
  const warnings = [];
  for (const p of PRODUCTS) {
    const handle = handleOf(p.title);
    if (existing.has(handle)) continue;
    const variants = [];
    for (const [desc, label] of p.variants) {
      const r = byDesc[desc];
      const barcode = r.upc.replace(/\s+/g, '');
      let price = r.rrp;
      if (!price) {
        if (!INCLUDE_BULK) { warnings.push(`${p.title}: "${label}" has no retail price on the list, left off`); continue; }
        price = (Number(r.wholesale) * BULK_MARKUP).toFixed(2);
        warnings.push(`${p.title}: "${label}" priced at wholesale x ${BULK_MARKUP} = $${price}, there is no RRP for it`);
      }
      if (barcode.length !== 12 && barcode.length !== 13 && barcode.length !== 8) {
        warnings.push(`${p.title}: "${label}" barcode ${barcode} is ${barcode.length} digits, not 8, 12 or 13`);
      }
      variants.push({ label, sku: r.item_number, barcode, price, pack: r.pack_qty, uom: r.uom });
    }
    if (variants.length) plan.push({ ...p, handle, variants });
  }

  console.log(`\nTO CREATE: ${plan.length} product(s), ${plan.reduce((s, p) => s + p.variants.length, 0)} variant(s)`);
  for (const p of plan) {
    console.log(`\n  ${p.title}`);
    console.log(`    handle ${p.handle} | DRAFT | vendor Maurten | type Nutrition | tag nutrition`);
    console.log(`    category ${p.cat.split('/').pop()}`);
    for (const v of p.variants) {
      console.log(`      ${p.option} "${v.label}"  $${v.price}  sku ${v.sku}  barcode ${v.barcode}`);
    }
  }
  if (warnings.length) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    warnings.forEach((w) => console.log('  ' + w));
  }

  // A duplicate SKU is the list's own error, not something to invent a fix for.
  const skuSeen = {};
  for (const p of plan) for (const v of p.variants) (skuSeen[v.sku] = skuSeen[v.sku] || []).push(`${p.title} / ${v.label}`);
  const dupSku = Object.entries(skuSeen).filter(([, v]) => v.length > 1);
  if (dupSku.length) {
    console.log('\nDUPLICATE ITEM NUMBERS in the price list. Shopify allows it, but one of these is almost certainly a typo on the supplier sheet:');
    dupSku.forEach(([k, v]) => console.log(`  ${k} used by: ${v.join('  and  ')}`));
  }

  if (!APPLY) { console.log('\nDRY RUN. Nothing created. Pass --apply to create them as DRAFTS.'); return; }

  const MUT = `mutation($input:ProductSetInput!){productSet(synchronous:true,input:$input){
    product{id handle title status} userErrors{field message}}}`;
  let ok = 0, fail = 0;
  const made = [];
  for (const p of plan) {
    const input = {
      title: p.title, handle: p.handle, vendor: 'Maurten', productType: 'Nutrition',
      status: 'DRAFT', tags: ['nutrition'], category: p.cat,
      productOptions: [{ name: p.option, values: p.variants.map((v) => ({ name: v.label })) }],
      variants: p.variants.map((v) => ({
        optionValues: [{ optionName: p.option, name: v.label }],
        price: v.price, barcode: v.barcode, sku: v.sku,
        inventoryItem: { tracked: true, requiresShipping: true },
      })),
    };
    const r = await client.graphql(MUT, { input });
    const errs = r.data?.productSet?.userErrors || [];
    if (errs.length) { fail++; console.log(`  FAILED ${p.title}: ${errs.map((e) => e.message).join('; ')}`); }
    else { ok++; const pr = r.data.productSet.product; made.push(pr); console.log(`  created ${pr.title}  [${pr.status}]  ${pr.handle}`); }
  }
  console.log(`\nCreated ${ok}, failed ${fail}. All DRAFT, so nothing is on the storefront yet.`);
  if (made.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const f = path.join(ROOT, `maurten-created-${stamp}.json`);
    fs.writeFileSync(f, JSON.stringify({ when: stamp, products: made }, null, 2));
    console.log(`Record of what was created: ${path.basename(f)}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
