// sales.mjs, The Run House.
//
// Dropship is three conditions and dropping ANY of them changes the answer
// enormously. Measured 2026-10-19 over a fortnight: 1,203 of 1,515 orders were
// POS, so counting them overstated revenue nearly 3x and turned a 2.4 percent
// rise into a 28 percent fall. Online supplier footwear shipped from Walpole
// and Falmouth was another 25 pairs that is store stock, not dropship.
//
// Run: node worker/test/sales.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { dropshipSales } from '../src/sales.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

let n = 0;
const line = (vendor, type, qty, amount, id) => ({
  id: id || ('gid://L/' + (++n)), quantity: qty, vendor,
  product: { productType: type },
  discountedTotalSet: { shopMoney: { amount: String(amount) } },
});
const order = (o) => Object.assign({
  createdAt: '2026-10-15T14:00:00Z', cancelledAt: null, test: false,
  channelInformation: { channelDefinition: { channelName: 'Online Store' } },
  lineItems: { nodes: [] }, fulfillmentOrders: { nodes: [] }, fulfillments: [],
}, o);
const needham = (ids) => ({ nodes: [{ assignedLocation: { name: 'Needham' },
  lineItems: { nodes: ids.map((i) => ({ lineItem: { id: i } })) } }] });
const at = (where, ids) => ({ nodes: [{ assignedLocation: { name: where },
  lineItems: { nodes: ids.map((i) => ({ lineItem: { id: i } })) } }] });
const client = (orders) => ({ graphql: async () => ({ data: { orders: { pageInfo: { hasNextPage: false }, nodes: orders } } }) });

console.log('\nAll three conditions must hold');
{
  const a = line('HOKA', "Men's Shoes", 1, 160, 'A');
  const b = line('HOKA', "Men's Shoes", 1, 160, 'B');
  const c = line('The Run House', 'Hoodies', 1, 60, 'C');
  const d = line('HOKA', 'T-Shirts', 1, 40, 'D');
  const r = await dropshipSales(client([
    order({ lineItems: { nodes: [a] }, fulfillmentOrders: needham(['A']) }),
    order({ lineItems: { nodes: [b] }, fulfillmentOrders: at('Walpole', ['B']),
            channelInformation: { channelDefinition: { channelName: 'Online Store' } } }),
    order({ lineItems: { nodes: [c] }, fulfillmentOrders: needham(['C']) }),
    order({ lineItems: { nodes: [d] }, fulfillmentOrders: needham(['D']) }),
  ]), { since: '2026-10-01' });
  eq('only the Needham supplier shoe counts', r.totals.pairs, 1);
  eq('and its revenue', r.totals.revenue, 160);
  eq('Walpole is reported separately, not silently dropped', r.excludedByLocation.length, 1);
  eq('with its location named', r.excludedByLocation[0].location, 'Walpole');
}

console.log('\nPoint of sale is excluded, which is the big one');
{
  const a = line('ASICS', "Women's Shoes", 1, 150, 'A');
  const b = line('ASICS', "Women's Shoes", 1, 150, 'B');
  const r = await dropshipSales(client([
    order({ lineItems: { nodes: [a] }, fulfillmentOrders: needham(['A']) }),
    order({ lineItems: { nodes: [b] }, fulfillmentOrders: needham(['B']),
            channelInformation: { channelDefinition: { channelName: 'Point of Sale' } } }),
  ]), { since: '2026-10-01' });
  eq('the POS order is gone', r.totals.pairs, 1);
  eq('and counted', r.scanned.posExcluded, 1);
  eq('online counted separately', r.scanned.online, 1);
}

console.log('\nCancelled and test orders never count');
{
  const a = line('Brooks', "Men's Shoes", 1, 140, 'A');
  const b = line('Brooks', "Men's Shoes", 1, 140, 'B');
  const r = await dropshipSales(client([
    order({ lineItems: { nodes: [a] }, fulfillmentOrders: needham(['A']), cancelledAt: '2026-10-16T00:00:00Z' }),
    order({ lineItems: { nodes: [b] }, fulfillmentOrders: needham(['B']), test: true }),
  ]), { since: '2026-10-01' });
  eq('nothing counted', r.totals.pairs, 0);
  eq('both reported', r.scanned.cancelledOrTest, 2);
}

console.log('\nA shipped fulfillment wins over the assigned location');
{
  // Assigned to Walpole but actually shipped from Needham. Once it has
  // shipped, where it shipped from is the answer.
  const a = line('ON Running', "Men's Shoes", 1, 180, 'A');
  const r = await dropshipSales(client([order({
    lineItems: { nodes: [a] },
    fulfillmentOrders: at('Walpole', ['A']),
    fulfillments: [{ location: { name: 'Needham' }, fulfillmentLineItems: { nodes: [{ lineItem: { id: 'A' } }] } }],
  })]), { since: '2026-10-01' });
  eq('counted as Needham', r.totals.pairs, 1);
}

console.log('\nDays are bucketed in SHOP time, not UTC');
{
  // 01:30Z on the 16th is 21:30 on the 15th in New York. Bucketing off the raw
  // timestamp would move this sale into the next day.
  const a = line('Saucony', "Men's Shoes", 1, 130, 'A');
  const r = await dropshipSales(client([order({
    createdAt: '2026-10-16T01:30:00Z', lineItems: { nodes: [a] }, fulfillmentOrders: needham(['A']),
  })]), { since: '2026-10-01' });
  eq('lands on the 15th', r.days[0].date, '2026-10-15');
}

console.log('\nNo customer data leaves the route');
{
  const a = line('HOKA', "Men's Shoes", 1, 160, 'A');
  const r = await dropshipSales(client([order({ lineItems: { nodes: [a] }, fulfillmentOrders: needham(['A']) })]),
    { since: '2026-10-01' });
  const text = JSON.stringify(r);
  eq('no order names', /#\d{4,}/.test(text), false);
  eq('shape is aggregates only',
     JSON.stringify(Object.keys(r).sort()),
     JSON.stringify(['brands','days','definition','excludedByLocation','generatedAt','scanned','since','timezone','totals']));
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
