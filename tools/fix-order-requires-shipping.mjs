// fix-order-requires-shipping.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Repairs orders whose line items are flagged requiresShipping:false when they
// hold real, physical goods.
//
// WHY THIS EXISTS. OrderCreateLineItemInput.requiresShipping defaults to FALSE
// and does NOT inherit from the variant, so tools/create-revently-order.mjs
// created 23 LA Marathon imports with every line marked as needing no delivery.
// The visible symptom is the fulfillment order getting deliveryMethod NONE
// instead of SHIPPING, which means Shopify will not offer a shipping label.
// The nine July imports were made another way and are correct, which is the
// contrast that exposed it. create-revently-order.mjs now sets the flag, so
// this file is only for the orders already written.
//
// HOW. There is no API to flip the flag on an existing line item, so each line
// is re-listed through the order editing API: add the same variant at the same
// quantity, then zero the original line. The added line derives
// requiresShipping from the variant. Needs the write_order_edits scope.
//
// SAFETY, in order:
//   1. Dry run by default. --apply is the only way to write.
//   2. restock:false on every removal. These orders were created with
//      inventoryBehaviour BYPASS because the stock was consumed at the event,
//      and several variants are already negative. A restock here would invent
//      inventory that does not exist.
//   3. THE TOTAL IS CHECKED BEFORE COMMIT and the edit is abandoned if it moved
//      by a cent. An order edit that changes the total leaves a real balance
//      owed or owing on a customer's order.
//   4. notifyCustomer:false. These are months old and already paid through
//      Revently. Nobody gets an email.
//   5. A rollback file records each order's prior line items before the first
//      commit. An order edit cannot be undone by id, so this is a record of
//      what to rebuild, not a one-command undo.
//   6. It only touches a line whose requiresShipping is false AND whose variant
//      says true. A genuinely shipping-free line is left alone.
//
// Usage:
//   node tools/fix-order-requires-shipping.mjs --order '#88546'
//   node tools/fix-order-requires-shipping.mjs --order '#88546' --apply
//   node tools/fix-order-requires-shipping.mjs --tag la-import
//   node tools/fix-order-requires-shipping.mjs --tag la-import --apply
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
const ONE = argOf('--order', '');
const TAG = argOf('--tag', '');
const LIMIT = parseInt(argOf('--limit', '0'), 10) || 0;

const KNOWN = ['--apply', '--order', '--tag', '--limit'];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) { if (!KNOWN.includes(a)) { console.error(`Unknown argument: ${a}`); process.exit(2); } }
  else if (!['--order', '--tag', '--limit'].includes(argv[i - 1])) { console.error(`Unexpected argument: ${a}`); process.exit(2); }
}
if (!ONE && !TAG) { console.error('Pass --order <#name> or --tag <tag>.'); process.exit(2); }

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
  nodes{ id name createdAt cancelledAt requiresShipping
    totalPriceSet{shopMoney{amount}}
    fulfillmentOrders(first:3){nodes{status deliveryMethod{methodType}}}
    lineItems(first:20){nodes{ id title quantity requiresShipping
      originalUnitPriceSet{shopMoney{amount}}
      variant{ id inventoryQuantity inventoryItem{requiresShipping} } }} }}}`;

const BEGIN = `mutation($id:ID!){orderEditBegin(id:$id){
  calculatedOrder{ id totalPriceSet{shopMoney{amount}}
    lineItems(first:20){nodes{id title quantity}} }
  userErrors{field message}}}`;
const ADD = `mutation($id:ID!,$v:ID!,$q:Int!){orderEditAddVariant(id:$id,variantId:$v,quantity:$q,allowDuplicates:true){
  calculatedLineItem{id title quantity originalUnitPriceSet{shopMoney{amount}}}
  userErrors{field message}}}`;
const ZERO = `mutation($id:ID!,$li:ID!){orderEditSetQuantity(id:$id,lineItemId:$li,quantity:0,restock:false){
  calculatedLineItem{id quantity} userErrors{field message}}}`;
const RECALC = `query($id:ID!){node(id:$id){... on CalculatedOrder{
  totalPriceSet{shopMoney{amount}} subtotalPriceSet{shopMoney{amount}}
  lineItems(first:20){nodes{title quantity}}}}}`;
const COMMIT = `mutation($id:ID!,$note:String){orderEditCommit(id:$id,notifyCustomer:false,staffNote:$note){
  order{id name} userErrors{field message}}}`;

const ue = (r, k) => (r.data?.[k]?.userErrors || []);

async function scan() {
  const q = ONE ? `name:${ONE}` : `tag:'${TAG}'`;
  let c = null, out = [];
  do {
    const d = await client.graphql(SCAN, { q, c });
    out.push(...d.data.orders.nodes);
    c = d.data.orders.pageInfo.hasNextPage ? d.data.orders.pageInfo.endCursor : null;
  } while (c);
  return out;
}

async function repair(o) {
  const b = await client.graphql(BEGIN, { id: o.id });
  if (ue(b, 'orderEditBegin').length) { console.log(`    BEGIN FAILED: ${ue(b, 'orderEditBegin').map((x) => x.message).join('; ')}`); return false; }
  const co = b.data.orderEditBegin.calculatedOrder;

  for (const li of o.lineItems.nodes) {
    const a = await client.graphql(ADD, { id: co.id, v: li.variant.id, q: li.quantity });
    if (ue(a, 'orderEditAddVariant').length) { console.log(`    ADD FAILED: ${ue(a, 'orderEditAddVariant').map((x) => x.message).join('; ')}`); return false; }
  }
  for (const cl of co.lineItems.nodes) {
    const z = await client.graphql(ZERO, { id: co.id, li: cl.id });
    if (ue(z, 'orderEditSetQuantity').length) { console.log(`    ZERO FAILED: ${ue(z, 'orderEditSetQuantity').map((x) => x.message).join('; ')}`); return false; }
  }

  // The total must be unchanged. An edit that moves it leaves a real balance on
  // a customer's order, so abandon rather than commit.
  const after = (await client.graphql(RECALC, { id: co.id })).data.node;
  const was = Number(o.totalPriceSet.shopMoney.amount);
  const now = Number(after.totalPriceSet.shopMoney.amount);
  if (Math.abs(was - now) > 0.005) {
    console.log(`    TOTAL MOVED $${was.toFixed(2)} to $${now.toFixed(2)}. ABANDONED, nothing committed.`);
    return false;
  }
  const c = await client.graphql(COMMIT, { id: co.id, note: 'Re-listed lines to set requiresShipping. No stock movement, no customer notice.' });
  if (ue(c, 'orderEditCommit').length) { console.log(`    COMMIT FAILED: ${ue(c, 'orderEditCommit').map((x) => x.message).join('; ')}`); return false; }
  return true;
}

async function main() {
  const orders = await scan();
  if (!orders.length) { console.log('No orders matched.'); return; }

  const broken = [];
  for (const o of orders) {
    if (o.cancelledAt) continue;
    const bad = o.lineItems.nodes.filter((l) => !l.requiresShipping && l.variant?.inventoryItem?.requiresShipping);
    if (bad.length) broken.push({ o, bad });
  }

  console.log(`\n${orders.length} order(s) matched. ${broken.length} need the shipping flag repaired.`);
  for (const { o, bad } of broken) {
    const fo = o.fulfillmentOrders.nodes[0];
    console.log(`  ${o.name}  ${o.createdAt.slice(0, 10)}  $${o.totalPriceSet.shopMoney.amount}  method ${fo?.deliveryMethod?.methodType || 'n/a'}  ${bad.length}/${o.lineItems.nodes.length} line(s) to relist`);
  }
  if (!broken.length) { console.log('Nothing to do.'); return; }

  let todo = broken;
  if (LIMIT && todo.length > LIMIT) { todo = todo.slice(0, LIMIT); console.log(`\n--limit ${LIMIT}: repairing ${todo.length}.`); }
  if (!APPLY) { console.log('\nDRY RUN. Pass --apply to repair.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rbPath = path.join(ROOT, `order-shipping-rollback-${stamp}.json`);
  fs.writeFileSync(rbPath, JSON.stringify({ when: stamp, orders: todo.map(({ o }) => ({
    name: o.name, id: o.id, total: o.totalPriceSet.shopMoney.amount,
    lineItems: o.lineItems.nodes.map((l) => ({ id: l.id, title: l.title, quantity: l.quantity,
      price: l.originalUnitPriceSet.shopMoney.amount, variantId: l.variant?.id, requiresShipping: l.requiresShipping })),
  })) }, null, 2));
  console.log(`\nRollback written to ${path.basename(rbPath)} BEFORE the first commit.`);

  let ok = 0, fail = 0;
  for (const { o } of todo) {
    process.stdout.write(`  ${o.name} ... `);
    const good = await repair(o);
    if (good) { ok++; console.log('repaired'); } else { fail++; }
  }
  console.log(`\nRepaired ${ok}, failed ${fail}.`);
  console.log('Re-run without --apply to confirm nothing is left flagged.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
