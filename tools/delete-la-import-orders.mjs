// delete-la-import-orders.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Deletes the LA Marathon Revently imports created on a given day so they can be
// recreated cleanly by tools/create-revently-order.mjs.
//
// WHY THIS EXISTS. The first 23 imports were written before
// create-revently-order.mjs set requiresShipping, so every line came out flagged
// as needing no delivery and Shopify would not offer a shipping label. Order
// editing cannot repair that: these orders are synthetically PAID with no payment
// transaction, so an edit recalculates the total and books a real outstanding
// balance. #88546 was mangled that way ($80 to $160, PARTIALLY_PAID) before this
// was understood. Deleting and recreating is the only clean route.
//
// DELETION IS PERMANENT. There is no undo. So:
//   1. Dry run by default. --apply is the only way to delete.
//   2. AN ARCHIVE IS WRITTEN FIRST, holding every field needed to rebuild each
//      order: customer, address, tags, note, and every line with its variant id,
//      quantity and price. Written and fsynced BEFORE the first delete.
//   3. It refuses to touch anything outside a tight scope: the order must carry
//      la-import AND an import: tag AND have been created on --day. That keeps
//      the nine correct July imports and every real storefront order out.
//   4. Cancelled orders are skipped. #88221 carries a real $60 refund and is a
//      historical record, not something to erase.
//   5. It refuses if an order has a payment transaction or a refund, which would
//      mean real money is attached and deleting is the wrong answer.
//
// Usage:
//   node tools/delete-la-import-orders.mjs --day 2026-09-28
//   node tools/delete-la-import-orders.mjs --day 2026-09-28 --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DAY = argOf('--day', '');

const KNOWN = ['--apply', '--day'];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { if (!KNOWN.includes(a)) { console.error(`Unknown argument: ${a}`); process.exit(2); } }
  else if (argv[i - 1] !== '--day') { console.error(`Unexpected argument: ${a}`); process.exit(2); }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(DAY)) { console.error('Pass --day YYYY-MM-DD.'); process.exit(2); }

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

const SCAN = `query($q:String,$c:String){orders(first:50,query:$q,after:$c,sortKey:CREATED_AT){
  pageInfo{hasNextPage endCursor}
  nodes{ id name createdAt cancelledAt tags note email phone
    displayFinancialStatus displayFulfillmentStatus
    totalPriceSet{shopMoney{amount}} totalReceivedSet{shopMoney{amount}} totalRefundedSet{shopMoney{amount}}
    transactions(first:5){id kind status}
    shippingAddress{ firstName lastName name address1 address2 city province provinceCode zip country countryCodeV2 phone }
    lineItems(first:20){nodes{ id title quantity requiresShipping
      originalUnitPriceSet{shopMoney{amount}}
      variant{ id title sku } }} }}}`;

const DELETE = `mutation($orderId:ID!){orderDelete(orderId:$orderId){deletedId userErrors{field message}}}`;

async function main() {
  let c = null, all = [];
  do {
    const d = await client.graphql(SCAN, { q: `tag:'la-import' AND created_at:>=${DAY} AND created_at:<=${DAY}`, c });
    all.push(...d.data.orders.nodes);
    c = d.data.orders.pageInfo.hasNextPage ? d.data.orders.pageInfo.endCursor : null;
  } while (c);

  const skipped = [];
  const target = [];
  for (const o of all) {
    const imp = (o.tags || []).find((t) => t.startsWith('import:'));
    if (!imp) { skipped.push([o.name, 'no import: tag']); continue; }
    if (o.cancelledAt) { skipped.push([o.name, 'cancelled, left as a record']); continue; }
    if (o.transactions.length) { skipped.push([o.name, `${o.transactions.length} payment transaction(s)`]); continue; }
    if (Number(o.totalRefundedSet.shopMoney.amount) > 0) { skipped.push([o.name, 'has a refund']); continue; }
    if (Number(o.totalReceivedSet.shopMoney.amount) > 0) { skipped.push([o.name, 'money received']); continue; }
    target.push({ o, source: imp.slice('import:'.length) });
  }

  console.log(`\n${all.length} order(s) tagged la-import created on ${DAY}.`);
  console.log(`${target.length} to DELETE, ${skipped.length} skipped.`);
  if (skipped.length) { console.log('\nSkipped:'); skipped.forEach(([n, why]) => console.log(`  ${n}  ${why}`)); }
  console.log('\nTo delete, each will be recreated from the CSV by its source number:');
  for (const { o, source } of target) {
    const bad = o.lineItems.nodes.filter((l) => !l.requiresShipping).length;
    console.log(`  ${o.name.padEnd(8)} ${source.padEnd(11)} $${String(o.totalPriceSet.shopMoney.amount).padStart(7)}  ${o.displayFinancialStatus.padEnd(15)} ${o.lineItems.nodes.length} line(s), ${bad} unflagged  ${o.shippingAddress?.name || ''}`);
  }
  if (!target.length) { console.log('\nNothing to do.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const arPath = path.join(ROOT, `la-import-archive-${stamp}.json`);
  const archive = { when: stamp, day: DAY, orders: target.map(({ o, source }) => ({
    name: o.name, id: o.id, source, createdAt: o.createdAt, tags: o.tags, note: o.note,
    email: o.email, phone: o.phone,
    financialStatus: o.displayFinancialStatus, total: o.totalPriceSet.shopMoney.amount,
    shippingAddress: o.shippingAddress,
    lineItems: o.lineItems.nodes.map((l) => ({ title: l.title, quantity: l.quantity,
      price: l.originalUnitPriceSet.shopMoney.amount, requiresShipping: l.requiresShipping,
      variantId: l.variant?.id, variantTitle: l.variant?.title, sku: l.variant?.sku })),
  })) };
  // fsync, so the archive is on disk before anything is destroyed.
  const fd = fs.openSync(arPath, 'w');
  fs.writeSync(fd, JSON.stringify(archive, null, 2));
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  console.log(`\nArchive of all ${target.length} order(s) written and fsynced to ${path.basename(arPath)}.`);
  console.log(`Source numbers: ${target.map((t) => t.source).join(' ')}`);

  if (!APPLY) { console.log('\nDRY RUN. Nothing deleted. Pass --apply to delete.'); return; }

  let ok = 0, fail = 0;
  for (const { o } of target) {
    process.stdout.write(`  deleting ${o.name} ... `);
    const r = await client.graphql(DELETE, { orderId: o.id });
    const errs = r.data?.orderDelete?.userErrors || [];
    if (errs.length) { fail++; console.log(`FAILED: ${errs.map((x) => x.message).join('; ')}`); }
    else { ok++; console.log('deleted'); }
  }
  console.log(`\nDeleted ${ok}, failed ${fail}.`);
  console.log(`Recreate with:  for s in ${target.map((t) => t.source).join(' ')}; do node tools/create-revently-order.mjs --order $s --apply; done`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
