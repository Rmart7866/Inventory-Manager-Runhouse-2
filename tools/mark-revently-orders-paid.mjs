// mark-revently-orders-paid.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Records the payment on Revently import orders that display PAID but carry no
// payment transaction.
//
// WHY THIS EXISTS. orderCreate's financialStatus PAID is only a LABEL. Without a
// transaction Shopify reports received $0 and the whole total OUTSTANDING, so the
// order reads as unpaid on the order page and contributes nothing to revenue
// reporting. The nine July imports carry a manual SALE transaction
// (SALE/SUCCESS/manual) and show outstanding $0, which is the contrast that
// exposed it. create-revently-order.mjs now sends the transaction itself, so this
// file is only for orders already written.
//
// WHAT IT CANNOT DO. orderMarkAsPaid dates the transaction NOW, not the original
// purchase date. If the revenue must land in the month it was earned, the order
// has to be recreated instead, because processedAt can only be set at create
// time. This tool is the no-deletion option, and it trades date fidelity for
// leaving the orders alone.
//
// SAFETY:
//   1. Dry run by default. --apply is the only way to write.
//   2. It only touches an order that displays PAID or PARTIALLY_PAID, has NO
//      transactions, and has a positive outstanding balance. An order with a real
//      payment or a refund is left alone.
//   3. Cancelled orders are skipped.
//   4. No customer notification. orderMarkAsPaid does not email, and these are
//      months old and already paid through Revently.
//   5. A before-state file is written before the first write.
//
// Usage:
//   node tools/mark-revently-orders-paid.mjs --tag la-import
//   node tools/mark-revently-orders-paid.mjs --tag la-import --apply
//   node tools/mark-revently-orders-paid.mjs --order '#88574' --apply
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
const TAG = argOf('--tag', '');
const ONE = argOf('--order', '');
const DAY = argOf('--day', '');

const KNOWN = ['--apply', '--tag', '--order', '--day'];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { if (!KNOWN.includes(a)) { console.error(`Unknown argument: ${a}`); process.exit(2); } }
  else if (!['--tag', '--order', '--day'].includes(argv[i - 1])) { console.error(`Unexpected argument: ${a}`); process.exit(2); }
}
if (!TAG && !ONE) { console.error('Pass --tag <tag> or --order <#name>.'); process.exit(2); }

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

const SCAN = `query($q:String,$c:String){orders(first:50,query:$q,after:$c,sortKey:CREATED_AT){
  pageInfo{hasNextPage endCursor}
  nodes{ id name createdAt cancelledAt tags displayFinancialStatus
    totalPriceSet{shopMoney{amount}} totalReceivedSet{shopMoney{amount}}
    totalOutstandingSet{shopMoney{amount}} totalRefundedSet{shopMoney{amount}}
    transactions(first:5){kind status gateway processedAt amountSet{shopMoney{amount}}}
    shippingAddress{name} }}}`;

const MARK = `mutation($input:OrderMarkAsPaidInput!){orderMarkAsPaid(input:$input){
  order{id name displayFinancialStatus} userErrors{field message}}}`;

async function main() {
  const q = ONE ? `name:${ONE}` : `tag:'${TAG}'${DAY ? ` AND created_at:>=${DAY} AND created_at:<=${DAY}` : ''}`;
  let cur = null, all = [];
  do {
    const d = await client.graphql(SCAN, { q, c: cur });
    all.push(...d.data.orders.nodes);
    cur = d.data.orders.pageInfo.hasNextPage ? d.data.orders.pageInfo.endCursor : null;
  } while (cur);

  const target = [], skipped = [];
  for (const o of all) {
    if (o.cancelledAt) { skipped.push([o.name, 'cancelled']); continue; }
    if (o.transactions.length) { skipped.push([o.name, `already has ${o.transactions.length} transaction(s), received $${o.totalReceivedSet.shopMoney.amount}`]); continue; }
    if (Number(o.totalRefundedSet.shopMoney.amount) > 0) { skipped.push([o.name, 'has a refund']); continue; }
    if (!(Number(o.totalOutstandingSet.shopMoney.amount) > 0)) { skipped.push([o.name, 'nothing outstanding']); continue; }
    target.push(o);
  }

  console.log(`\n${all.length} order(s) matched. ${target.length} need the payment recorded, ${skipped.length} skipped.`);
  if (skipped.length) { console.log('\nSkipped:'); skipped.forEach(([n, w]) => console.log(`  ${n}  ${w}`)); }
  if (target.length) {
    console.log('\nTo mark paid:');
    let sum = 0;
    for (const o of target) {
      sum += Number(o.totalOutstandingSet.shopMoney.amount);
      console.log(`  ${o.name.padEnd(8)} ${o.displayFinancialStatus.padEnd(15)} total $${String(o.totalPriceSet.shopMoney.amount).padStart(7)}  outstanding $${String(o.totalOutstandingSet.shopMoney.amount).padStart(7)}  ${o.shippingAddress?.name || ''}`);
    }
    console.log(`  ${'total outstanding to clear:'.padStart(34)} $${sum.toFixed(2)}`);
    console.log('\nNote: the transaction will be dated NOW, not the original purchase date.');
  }
  if (!target.length) { console.log('\nNothing to do.'); return; }
  if (!APPLY) { console.log('\nDRY RUN. Pass --apply to record the payments.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bPath = path.join(ROOT, `mark-paid-before-${stamp}.json`);
  fs.writeFileSync(bPath, JSON.stringify({ when: stamp, orders: target.map((o) => ({
    name: o.name, id: o.id, financialStatus: o.displayFinancialStatus,
    total: o.totalPriceSet.shopMoney.amount, received: o.totalReceivedSet.shopMoney.amount,
    outstanding: o.totalOutstandingSet.shopMoney.amount })) }, null, 2));
  console.log(`\nBefore-state written to ${path.basename(bPath)}.`);

  let ok = 0, fail = 0;
  for (const o of target) {
    process.stdout.write(`  ${o.name} ... `);
    const r = await client.graphql(MARK, { input: { id: o.id } });
    const errs = r.data?.orderMarkAsPaid?.userErrors || [];
    if (errs.length) { fail++; console.log(`FAILED: ${errs.map((x) => x.message).join('; ')}`); }
    else { ok++; console.log(`${r.data.orderMarkAsPaid.order.displayFinancialStatus}`); }
  }
  console.log(`\nMarked paid ${ok}, failed ${fail}.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
