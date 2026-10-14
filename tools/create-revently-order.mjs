// create-revently-order.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Creates ONE Shopify order from a Revently registration export, matched to the
// product already in the store. Built for the 2027 LA Marathon merch orders,
// which arrive as a CSV of registrations rather than through the storefront.
//
// ONE AT A TIME ON PURPOSE. Pass --order <source number>. There is no bulk mode
// here: these are real orders for real people, and order #88221 was keyed with
// the wrong colourway and had to be cancelled and refunded, so every one gets
// looked at before it is written.
//
// WHAT IT WILL NOT DO:
//   1. No customer email. sendReceipt and sendFulfillmentReceipt are both
//      false. These orders are months old and already paid through Revently,
//      so a receipt now would confuse the customer at best.
//   2. NO PAYMENT TRANSACTION, ON PURPOSE. financialStatus PAID is only a label,
//      so these orders report received $0 and the whole total OUTSTANDING. That
//      is intended: this batch is being INVOICED, so the balance is meant to sit
//      there. Do not "fix" it by sending a transaction or by running
//      orderMarkAsPaid. The nine July imports DO carry a manual SALE transaction
//      and show outstanding $0, so the two batches differ here deliberately.
//   3. Every line is marked requiresShipping, because the API default is false.
//      See the comment on lineItems below, this one bit decides whether the
//      order can be given a shipping label at all.
//   4. No inventory movement. inventoryBehaviour is BYPASS, because the stock
//      was consumed at the event, not here, and several of these variants are
//      already negative. Pass --decrement if you want it to draw stock.
//   5. No duplicates, and the tag is only half of that. It refuses if any order
//      carries the tag import:<source number>, AND it sweeps the store by the
//      customer's email and bare name, because roughly twenty of these were
//      keyed in by hand before this tool existed and those carry no tag at all.
//      A name hit stops the run until you pass --force-name.
//
// PRICE COMES FROM SHOPIFY, not the file. The file's Gross includes Revently's
// fee, its Transfer Amount is what you actually received, and the Shopify
// variant price matches the Transfer Amount. The first seven imports used Gross
// and are therefore a few dollars high; #88221 used the Shopify price.
//
// MATCHING is by the file's SKU against the SKU printed in the product title,
// plus the colour word, scoped to the 2027 LA Marathon range. The size in the
// file's Attributes column is folded to one vocabulary because the file writes
// "Extra Large" where Shopify writes "XLarge".
//
// Usage:
//   node tools/create-revently-order.mjs --list
//   node tools/create-revently-order.mjs --order AE3AE9604F
//   node tools/create-revently-order.mjs --order AE3AE9604F --apply
//   node tools/create-revently-order.mjs --order C255620DA4 --force-name --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIST = argv.includes('--list');
const DECREMENT = argv.includes('--decrement');
const FORCE = argv.includes('--force-name');
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CSV = arg('--csv', path.join(process.env.HOME, 'Downloads', 'RunHouse_Orders_Combined (1).csv'));
const ONE = arg('--order', null);

function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(loadDevVars());

// Minimal CSV reader. The export quotes any field containing a comma.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const hdr = rows.shift();
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ''])));
}

// One size vocabulary for both sides.
const size = (s) => String(s || '').trim().toLowerCase().replace(/[\s\-_]/g, '')
  .replace(/^extrasmall$/, 'xs').replace(/^extralarge$/, 'xl')
  .replace(/^xsmall$/, 'xs').replace(/^xlarge$/, 'xl')
  .replace(/^2xlarge$/, '2xl').replace(/^xxlarge$/, '2xl').replace(/^3xlarge$/, '3xl')
  .replace(/^small$/, 's').replace(/^medium$/, 'm').replace(/^large$/, 'l');

const PRODUCTS = `query($q: String) {
  products(first: 60, query: $q) {
    nodes { id title status variants(first: 30) { nodes { id title price inventoryQuantity selectedOptions { name value } } } }
  }
}`;
const EXISTING = `query($q: String) { orders(first: 25, query: $q) {
  nodes { id name createdAt cancelledAt tags email totalPriceSet { shopMoney { amount } }
          shippingAddress { name } lineItems(first: 5) { nodes { title quantity } } } } }`;
const CREATE = `mutation($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
  orderCreate(order: $order, options: $options) {
    order { id name createdAt displayFinancialStatus totalPriceSet { shopMoney { amount } } tags note
            shippingAddress { name address1 city provinceCode zip countryCodeV2 }
            lineItems(first: 5) { nodes { title quantity originalUnitPriceSet { shopMoney { amount } } variant { id title } } } }
    userErrors { field message }
  } }`;

// The colour word in the file has to survive to the variant, because that is
// exactly what went wrong on #88221: "Aegean Blue" was keyed as "Black".
function colourOf(fileName) {
  const m = fileName.match(/(Aegean Blue|Cobalt Burst|Yamabuki|Black|Cream|Midnight|Morganite)/i);
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  if (!fs.existsSync(CSV)) throw new Error('CSV not found: ' + CSV);
  const rows = parseCSV(fs.readFileSync(CSV, 'utf8'));

  const r = await client.graphql(PRODUCTS, { q: 'title:*2027* AND title:*Los Angeles Marathon*' });
  const catalogue = r.data.products.nodes.filter((p) => p.status === 'ACTIVE');

  const byOrder = new Map();
  for (const row of rows) {
    const no = row['Order Number'];
    if (!byOrder.has(no)) byOrder.set(no, { cust: row, lines: [] });
    byOrder.get(no).lines.push(row);
  }

  if (LIST) {
    console.log(`${byOrder.size} source orders in ${path.basename(CSV)}`);
    for (const [no, o] of byOrder) {
      console.log(`  ${no}  ${o.cust['Purchase Date'].padStart(8)}  ${o.cust.Name.slice(0, 26).padEnd(26)}  ${o.lines.length} line(s)`);
    }
    return;
  }
  if (!ONE) throw new Error('Pass --order <source number>, or --list to see them.');
  const o = byOrder.get(ONE);
  if (!o) throw new Error('No such order in the file: ' + ONE);

  // 1. Refuse if it is already in, by tag.
  //
  // A CANCELLED order does not count as imported. #88221 was keyed with the
  // wrong colourway, then cancelled and refunded, but it still carries
  // import:C255620DA4, so counting it would block the customer's real order
  // forever. It is reported loudly instead, because if it was cancelled for
  // some other reason then re-creating it is wrong.
  const dup = await client.graphql(EXISTING, { q: `tag:'import:${ONE}'` });
  const tagged = (dup.data.orders.nodes || []).filter((x) => (x.tags || []).includes('import:' + ONE));
  const already = tagged.filter((x) => !x.cancelledAt);
  if (already.length) {
    console.log(`ALREADY IMPORTED as ${already.map((x) => x.name).join(', ')}. Nothing written.`);
    return;
  }
  for (const x of tagged) {
    console.log(`NOTE: ${x.name} (${x.createdAt.slice(0, 10)}) carries import:${ONE} but was CANCELLED on ${x.cancelledAt.slice(0, 10)}, so it is not counted.`);
    for (const li of x.lineItems.nodes) console.log(`      it held: ${li.quantity}x ${li.title}`);
  }

  // 1b. THE TAG GUARD IS NOT ENOUGH. About twenty of these orders were keyed in
  // by hand before this tool existed, and a hand-keyed order carries no
  // import: tag, so guard 1 waves it straight through and the customer gets a
  // second order. So also sweep by email and by bare name.
  //
  // NEVER QUOTE THE NAME. Shopify's order search returns ZERO for
  // query:"\"Ray Kui Jui Huang\"" and the right order for the same name bare.
  // That was control-tested against a known order. A quoted name here reads as
  // "no match" and is exactly how a duplicate gets written.
  const priorHits = new Map();
  const sweeps = [];
  const email = (c0) => (c0 || '').trim();
  if (email(o.cust.Email)) sweeps.push(`email:${email(o.cust.Email)}`);
  const bare = o.cust.Name.trim().replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (bare) sweeps.push(bare);
  // SCOPE THE SWEEP TO THIS EVENT. The Run House sells the same customers merch
  // year after year, so a bare name match on its own is mostly noise: Watt
  // Boonkong's 2025 Rose Bowl order is not a duplicate of a 2027 LA Marathon
  // order, and Shopify's search is fuzzy enough that "Jeffery Fu" also returns
  // every order belonging to "Jefferies". A prior order only counts as a
  // possible duplicate if it holds an item from THIS event.
  const thisEvent = /2027[^|]*Los Angeles Marathon|\(LA27-/i;
  for (const q of sweeps) {
    const hit = await client.graphql(EXISTING, { q });
    for (const n of hit.data.orders.nodes || []) {
      if ((n.tags || []).includes('import:' + ONE)) continue;
      if (!n.lineItems.nodes.some((li) => thisEvent.test(li.title))) continue;
      priorHits.set(n.name, n);
    }
  }
  if (priorHits.size) {
    console.log(`\nPOSSIBLE EXISTING ORDER for ${o.cust.Name}. Look before you write:`);
    for (const n of priorHits.values()) {
      const state = n.cancelledAt ? 'CANCELLED' : 'live';
      console.log(`  ${n.name}  ${n.createdAt.slice(0, 10)}  ${state}  $${n.totalPriceSet.shopMoney.amount}  ${n.email || ''}`);
      console.log(`      tags: ${(n.tags || []).join(', ') || '(none)'}`);
      for (const li of n.lineItems.nodes) console.log(`      ${li.quantity}x ${li.title}`);
    }
    if (!FORCE) {
      console.log('\nSTOPPING. If none of the above is this order, re-run with --force-name.');
      if (APPLY) process.exit(3);
    } else {
      console.log('\n--force-name given, treating the above as NOT this order.');
    }
  }

  // 2. Resolve every line to a variant, matching sku, colour and size.
  const lines = [];
  for (const row of o.lines) {
    const sku = (row.SKU || '').trim();
    const base = sku.split('-')[0];
    const want = colourOf(row['Product Name']);
    // The full SKU is the strongest signal: "2011D508-001" appears verbatim in
    // the title and pins the colourway on its own. Only fall back to base SKU
    // plus the colour word when the suffix is not in the title, which is the
    // case for 2011D453, where Black, Cream and Aegean Blue share a base.
    let cands = catalogue.filter((p) => p.title.includes(sku));
    if (cands.length !== 1) {
      cands = catalogue.filter((p) => p.title.includes(base) &&
        (want ? p.title.toLowerCase().includes(want) : true));
    }
    if (cands.length !== 1) {
      throw new Error(`Product match is ${cands.length === 0 ? 'missing' : 'ambiguous'} for "${row['Product Name']}" (sku ${sku}): ` +
        cands.map((c) => c.title).join(' | '));
    }
    const p = cands[0];
    const v = p.variants.nodes.find((v) => size(v.title.split(' / ')[0]) === size(row.Attributes));
    if (!v) throw new Error(`No variant for size "${row.Attributes}" on ${p.title}`);
    lines.push({ row, product: p, variant: v });
  }

  const c = o.cust;
  console.log(`SOURCE ORDER ${ONE}   purchased ${c['Purchase Date']}`);
  console.log(`  customer : ${c.Name} <${c.Email}> ${c.Phone || ''}`);
  console.log(`  ship to  : ${[c['Address Line 1'], c['Address Line 2'], c.City, c.State, c['Zip Code'], c.Country].filter(Boolean).join(', ')}`);
  let total = 0;
  for (const l of lines) {
    const amt = Number(l.variant.price) * Number(l.row['Product Quantity']);
    total += amt;
    console.log(`  line     : ${l.row['Product Quantity']}x ${l.product.title}`);
    console.log(`             variant "${l.variant.title}"  $${l.variant.price}  (file gross $${l.row.Gross}, transfer $${l.row['Transfer Amount']})  stock ${l.variant.inventoryQuantity}`);
  }
  console.log(`  total    : $${total.toFixed(2)} at Shopify prices`);
  console.log(`  tags     : import:${ONE}, la-import`);
  console.log(`  receipts : OFF        inventory: ${DECREMENT ? 'DECREMENT' : 'BYPASS (no stock movement)'}`);

  if (!APPLY) { console.log('\nDRY RUN. Add --apply to create it.'); return; }

  const order = {
    email: c.Email.trim(),
    financialStatus: 'PAID',
    tags: ['import:' + ONE, 'la-import'],
    note: `Revently order ${ONE} | purchased ${c['Purchase Date']} | source: ${c['Product Source']}`,
    shippingAddress: {
      firstName: c.Name.trim().split(' ')[0],
      lastName: c.Name.trim().split(' ').slice(1).join(' ') || c.Name.trim(),
      address1: c['Address Line 1'], address2: c['Address Line 2'] || null,
      city: c.City, province: c.State, zip: c['Zip Code'], country: c.Country,
    },
    // requiresShipping MUST be set explicitly. OrderCreateLineItemInput
    // defaults it to FALSE and does NOT inherit it from the variant, so an
    // order of real shirts comes out flagged as needing no delivery: the
    // fulfillment order gets deliveryMethod NONE and Shopify will not offer a
    // shipping label. The nine July imports were made another way and are
    // correct, which is what made the difference visible.
    lineItems: lines.map((l) => ({
      variantId: l.variant.id,
      quantity: Number(l.row['Product Quantity']),
      requiresShipping: true,
    })),
  };
  const options = { sendReceipt: false, sendFulfillmentReceipt: false,
    inventoryBehaviour: DECREMENT ? 'DECREMENT_IGNORING_POLICY' : 'BYPASS' };

  const res = await client.graphql(CREATE, { order, options });
  const d = res.data.orderCreate;
  if (d.userErrors?.length) { console.log('\nFAILED:', JSON.stringify(d.userErrors, null, 1)); process.exit(1); }
  const x = d.order;
  console.log(`\nCREATED ${x.name}  ${x.createdAt.slice(0, 16).replace('T', ' ')}  ${x.displayFinancialStatus}  $${x.totalPriceSet.shopMoney.amount}`);
  console.log(`  tags: ${x.tags.join(', ')}`);
  for (const li of x.lineItems.nodes) console.log(`  ${li.quantity}x $${li.originalUnitPriceSet.shopMoney.amount}  ${li.title}  [${li.variant.title}]`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
