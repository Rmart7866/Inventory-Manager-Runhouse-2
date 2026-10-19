// sales.js, The Run House. READ ONLY.
//
// Weekly dropship sales. Dropship here means exactly what it means everywhere
// else in this repo and nothing looser:
//
//   ONLINE, not point of sale. Measured 2026-10-19 over a fortnight, 1,203 of
//   1,515 orders were POS. Counting those as dropship overstated revenue by
//   nearly 3x and turned a 2.4 percent rise into a 28 percent fall. The
//   channel test is the same one sheets-worker/src/open-orders.js uses.
//
//   SUPPLIER BRAND FOOTWEAR. The Run House's own printed apparel and the
//   store's non-supplier stock are not dropship.
//
//   FULFILLED FROM NEEDHAM. The same scoping every write in this repo uses. A
//   line shipped from Walpole or Falmouth is store stock, not dropship: over
//   that same fortnight those were 25 pairs and about 3,400 dollars of online
//   supplier footwear that is NOT dropship.
//
// AGGREGATES ONLY LEAVE THIS ROUTE. No customer, no address, no order level
// detail, just per day and per brand totals. The route is write-secret gated
// anyway, but revenue is worth not shipping around loosely.
//
// Refunds are NOT deducted. A refunded order still counts, which is the same
// basis the hand-run numbers used.
//
// House style: no em dashes. Use commas, periods, or the word "to".

const SUPPLIER_VENDORS = new Set([
  'on running', 'asics', 'brooks', 'hoka', 'hoka one one', 'saucony',
  'puma', 'new balance', 'merrell', 'altra', 'diadora',
]);
const FOOTWEAR_TYPE_RE = /(shoes$|^athletic footwear$|^footwear$)/i;
const NEEDHAM = 'Needham';

const QUERY = `query($c:String,$q:String!){
  orders(first: 20, after: $c, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      createdAt cancelledAt test
      channelInformation { channelDefinition { channelName handle } }
      lineItems(first: 50) { nodes {
        id quantity vendor
        product { productType }
        discountedTotalSet { shopMoney { amount } }
      } }
      fulfillmentOrders(first: 10) { nodes {
        assignedLocation { name }
        lineItems(first: 50) { nodes { lineItem { id } } }
      } }
      fulfillments(first: 10) {
        location { name }
        fulfillmentLineItems(first: 50) { nodes { lineItem { id } } }
      }
    }
  }
}`;

// Shop-local day. Shopify filters by shop time but returns UTC, so a day
// bucketed off the raw timestamp drifts by up to five hours and moves sales
// across the midnight boundary.
function localDay(iso, tz) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day}`;
}

// Where is each line actually shipping from. A fulfillment wins over a
// fulfillment order: once something has shipped, that is the answer.
function locationByLine(order) {
  const out = {};
  for (const fo of order.fulfillmentOrders?.nodes || []) {
    const name = fo.assignedLocation?.name || '';
    for (const li of fo.lineItems?.nodes || []) if (li.lineItem?.id) out[li.lineItem.id] = name;
  }
  for (const f of order.fulfillments || []) {
    const name = f.location?.name || '';
    for (const li of f.fulfillmentLineItems?.nodes || []) if (li.lineItem?.id) out[li.lineItem.id] = name;
  }
  return out;
}

export async function dropshipSales(client, { since, tz = 'America/New_York' }) {
  const byDay = new Map();
  const byBrand = new Map();
  const byOtherLocation = new Map();
  let ordersScanned = 0, posExcluded = 0, onlineOrders = 0, cancelledOrTest = 0;

  let cursor = null;
  do {
    const d = await client.graphql(QUERY, { c: cursor, q: `created_at:>=${since} AND status:any` });
    const page = d.data.orders;
    for (const o of page.nodes) {
      ordersScanned++;
      if (o.cancelledAt || o.test) { cancelledOrTest++; continue; }
      const ch = o.channelInformation?.channelDefinition || {};
      const channel = ch.channelName || ch.handle || 'Unknown';
      if (/point of sale/i.test(channel)) { posExcluded++; continue; }
      onlineOrders++;

      const loc = locationByLine(o);
      const day = localDay(o.createdAt, tz);
      for (const li of o.lineItems?.nodes || []) {
        const vendor = String(li.vendor || '').trim().toLowerCase();
        const type = li.product?.productType || '';
        if (!SUPPLIER_VENDORS.has(vendor)) continue;
        if (!FOOTWEAR_TYPE_RE.test(type)) continue;
        const amount = Number(li.discountedTotalSet?.shopMoney?.amount || 0);
        const where = loc[li.id] || '(unassigned)';
        if (where !== NEEDHAM) {
          const t = byOtherLocation.get(where) || { pairs: 0, revenue: 0 };
          t.pairs += li.quantity; t.revenue += amount;
          byOtherLocation.set(where, t);
          continue;
        }
        const dd = byDay.get(day) || { pairs: 0, revenue: 0 };
        dd.pairs += li.quantity; dd.revenue += amount; byDay.set(day, dd);
        const bb = byBrand.get(vendor) || { pairs: 0, revenue: 0 };
        bb.pairs += li.quantity; bb.revenue += amount; byBrand.set(vendor, bb);
      }
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);

  const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({ date, pairs: v.pairs, revenue: round(v.revenue) }));
  const brands = [...byBrand.entries()].sort((a, b) => b[1].revenue - a[1].revenue)
    .map(([brand, v]) => ({ brand, pairs: v.pairs, revenue: round(v.revenue) }));

  return {
    generatedAt: new Date().toISOString(),
    since, timezone: tz,
    definition: 'online orders, supplier brand footwear, fulfilled from Needham',
    scanned: { orders: ordersScanned, online: onlineOrders, posExcluded, cancelledOrTest },
    totals: {
      pairs: days.reduce((t, d) => t + d.pairs, 0),
      revenue: round(days.reduce((t, d) => t + d.revenue, 0)),
    },
    days,
    brands,
    // Online supplier footwear that shipped from somewhere else. Not dropship,
    // but worth showing so the number is not silently narrower than it looks.
    excludedByLocation: [...byOtherLocation.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([location, v]) => ({ location, pairs: v.pairs, revenue: round(v.revenue) })),
  };
}

function round(n) { return Math.round(n * 100) / 100; }
