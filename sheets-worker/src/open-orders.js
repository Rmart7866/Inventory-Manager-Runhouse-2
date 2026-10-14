// open-orders.js, The Run House Worker. READ ONLY.
//
// Builds the row set behind the "ONLINE SALES ORDERS" Google Sheet: every open,
// unfulfilled ONLINE order line, one row per physical garment, with the shipout
// route resolved and any Vopo personalisation folded in.
//
// THREE THINGS THIS SOLVES, none of them obvious from the Shopify data alone.
//
// 1. ROUTE. "In store shipout" versus "warehouse shipout" is not a guess. Every
//    fulfillment order carries an assignedLocation, so a line is a warehouse
//    shipout when its fulfillment order sits at Warehouse, and an in-store
//    shipout when it sits at Scituate, Needham, Walpole or Falmouth. Measured
//    2026-09-29 across 299 open online orders: Warehouse 173, Scituate 156,
//    Needham 62, Walpole 33, Falmouth 8.
//
// 2. VOPO GHOST ROWS. Vopo does not attach the name to the garment line. It adds
//    a SECOND line item, usually titled "<garment> - Selections", with NO variant,
//    carrying a "Variant" attribute that echoes the garment's variant as text plus
//    the name and its upcharge:
//
//      1x Team LS Tee   [Large / True Red (E002)]        <- the garment
//      1x Team LS Tee   [no variant]                     <- Vopo's companion
//           Variant = Large, True Red (E002)
//           Name (will appear on left sleeve...) = FOIS | $10.00
//
//    So the companion is matched back onto its garment and COLLAPSED into it.
//    Note the separator differs: the attribute uses ", " where the variant title
//    uses " / ", which is why matching normalises punctuation away entirely.
//    An unmatched companion is never dropped, it is returned with unmatched:true,
//    because silently losing a customer's name is the worst outcome here.
//
// 3. MULTIPLE FIELDS PER GARMENT. One garment can carry several, for example a
//    name and a bib time. They are kept as a list, not flattened to one string,
//    so the sheet can show both.
//
// NOT SHIPOUTS. Lines that are not physical goods are excluded: the re:do
// returns fee (vendor "re:do", sku x-redo) and membership products. Staff
// already leave these off the sheet by hand.
//
// House style: no em dashes. Use commas, periods, or the word "to".

const WAREHOUSE = 'Warehouse';

// Dropship running shoes are picked and shipped without any of the ordering work
// this sheet exists to track: no PO, no logo, no vendor to chase. The same
// classification the inventory Worker uses, types ending in "shoes" plus the two
// footwear types.
const FOOTWEAR = /(shoes|^athletic footwear$|^footwear$)/i;

// A line with no assigned location has no open fulfillment order at one of our
// locations. In practice that is a Shopify Collective or third party dropship
// line (Knockaround, Detour, Varlo, The Endorphin Belt), or the remainder of a
// partially fulfilled order. It is not a shipout we perform, so it gets no route
// and says why, rather than silently reading as an in-store job.
const NO_ROUTE_NOTE = 'No location assigned, likely Collective or third party dropship';

function routeOf(shipFrom) {
  if (!shipFrom) return '';
  return shipFrom === WAREHOUSE ? 'Warehouse Shipout' : 'In-Store Shipout';
}

// Punctuation and case carry no meaning when matching a Vopo companion to its
// garment, and the two sides genuinely differ ("," versus " / "), so strip
// everything that is not a letter or a digit.
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// "Team LS Tee - Selections" and "Team LS Tee" are the same garment.
function baseTitle(t) {
  return String(t || '').replace(/\s*-\s*selections\s*$/i, '');
}

// A Vopo companion line: no variant of its own, but an attribute NAMING one.
//
// The "names one" part is load bearing. Race Roster orders also produce a line
// with no variant and a Variant attribute, but theirs holds a raw numeric
// variant ID ("49132994789631") rather than a variant title, and the line IS the
// product rather than a companion to one. Treating those as companions produced
// a phantom unmatched row on #88670. A purely numeric value is therefore never a
// Vopo pointer.
function isCompanion(li) {
  const attrs = li.customAttributes || [];
  const v = attrs.find((a) => /^variant$/i.test(a.key));
  if (!v || li.variant) return false;
  return !/^\s*\d+\s*$/.test(String(v.value || ''));
}

// WHERE THE NAME GOES IS IN THE ATTRIBUTE KEY, NOT THE VALUE.
//
// Vopo names the option after the placement, so the key carries the production
// instruction: "Name (will appear on left sleeve in all caps)" means left
// sleeve, "Name (name will appear on front under the logo)" means under the
// logo. Staff retype that into a Location column by hand today, in a dozen
// spellings: across 2,928 rows of the Names tab, "sleeve", "Sleeve", "SLEEVE"
// and "Left Sleeve" are all the same instruction. Deriving it gives one
// spelling for free.
//
// ORDER MATTERS. "left sleeve" must be tested before the bare "sleeve", or
// every left sleeve reads as just "Sleeve".
const PLACEMENTS = [
  [/lower\s*back|back\s*pack/i, 'Lower Back'],
  [/left\s*sleeve/i, 'Left Sleeve'],
  [/right\s*sleeve/i, 'Right Sleeve'],
  [/under\s*(the\s*)?logo|beneath\s*(the\s*)?logo/i, 'Under Logo'],
  [/front/i, 'Front'],
  [/\bleg\b/i, 'Leg'],
  [/sleeve/i, 'Sleeve'],
];

function placementOf(key) {
  for (const [re, label] of PLACEMENTS) if (re.test(key)) return label;
  return '';
}

// A NUMBER field is not a name field. Vopo uses separate options, and the
// production sheet keeps them in separate columns, because a bib number or a
// finishing time is printed differently from a name.
function isNumberField(key) {
  return /\bnumber\b|finishing\s*time|\btime\b/i.test(key);
}

// Flatten the fields into the three columns the production sheet actually uses:
// where it goes, the name, and the number or time. Multiples of a kind are
// joined rather than dropped: losing one of a customer's two names is worse
// than an awkward cell.
function splitFields(fields) {
  // A NAME FIELD HAS TO SAY NAME. Not every option is personalisation: #86111
  // carries "Optional Back Logo = No", a yes/no toggle, which landed in the name
  // column as the literal word "No" and would have been printed on a hoodie.
  // Anything that is neither a name nor a number is kept as an option instead.
  const names = fields.filter((f) => !f.isNumber && /name/i.test(f.field));
  const nums = fields.filter((f) => f.isNumber);
  const others = fields.filter((f) => !f.isNumber && !/name/i.test(f.field));
  const placement = (names[0] && names[0].placement) || (nums[0] && nums[0].placement) || '';
  return {
    printPlacement: placement,
    printName: names.map((f) => f.value).filter(Boolean).join(' / '),
    printNumber: nums.map((f) => f.value).filter(Boolean).join(' / '),
    printOptions: others.map((f) => `${f.field}: ${f.value}`).join(' ; '),
  };
}

// The personalisation fields, which is every attribute except the Variant
// pointer and Vopo's internal ids.
function personalisationOf(li) {
  const out = [];
  for (const a of li.customAttributes || []) {
    if (/^variant$/i.test(a.key)) continue;
    // Underscore keys are Shopify internals (_shopify_fee_id, _shopify_item_type),
    // not something a human chose.
    if (/^(variant_id|event id|order id|event participant id)$/i.test(a.key)) continue;
    if (a.key.charAt(0) === '_') continue;
    // Vopo writes "FOIS | $10.00": the value, then its upcharge.
    const m = String(a.value || '').match(/^(.*?)\s*\|\s*\$?([\d.,]+)\s*$/);
    out.push({
      field: a.key,
      value: (m ? m[1] : String(a.value || '')).trim(),
      upcharge: m ? Number(String(m[2]).replace(/,/g, '')) : 0,
      placement: placementOf(a.key),
      isNumber: isNumberField(a.key),
    });
  }
  return out;
}

// THE ORDERABLE SKU IS IN THE PRODUCT TITLE.
//
// Race merch titles carry the supplier's style-colour code in brackets, which is
// exactly what goes on a purchase order:
//   "2027 ASICS Los Angeles Marathon - ASICS Men's Metarun Singlet
//    (2011D508-001) (LA27-05)"  ->  2011D508-001
//
// Two shapes appear in the live data: 4 digits + a letter + 3 digits with an
// optional colour suffix (2011D508-001, 2012D371, 2011b458), and two letters
// plus 4 digits (TF2934, TF3085, ZR1127).
//
// THE SECOND BRACKET IS NOT A SKU. Titles usually carry an event code too
// ("LA27-05", "CIM-06", "B084"), and logo codes like B029 or E001 appear as
// well. Neither matches these shapes, which is why the pattern is this narrow
// rather than "anything in brackets".
//
// FOOTWEAR IS NOT ORDERED THIS WAY. Dropship shoe titles carry no style code at
// all, measured 10 of 11 unparsed ASICS lines were shoes, and they are ordered
// through the supplier portal instead. The caller filters on isFootwear.
const SUPPLIER_SKU = /\b(\d{4}[A-Za-z]\d{3}(?:-\d{3})?|[A-Za-z]{2}\d{4})\b/;

function supplierSkuOf(title) {
  const m = String(title || '').match(SUPPLIER_SKU);
  return m ? m[1] : '';
}

// THE BLANK GARMENT'S STYLE NUMBER IS THE FIRST CODE IN BRACKETS.
//
// Printed apparel titles lead with the blank's own style number, which is what
// goes on a SanMar or Charles River order, and any later brackets are logo or
// event codes:
//   "East Longmeadow XC - V.I.T Unisex Fleece Hoodie (DT6100) - ... (E001)"
//    -> DT6100, and E001 is the logo
//
// WHY "FIRST BRACKET" RATHER THAN A PATTERN. Blank style numbers have no common
// shape at all: PC78H, DT6100, LST353LS, NKDH7709, 18000B, 9706, TD600, C112.
// A shape-based pattern caught 26 of 203 non-ASICS lines; taking the first
// bracket catches 172. The remaining 31 are genuinely not blanks, retail
// sunglasses and tumblers and a Race Roster placeholder.
//
// The 2 to 14 character bound keeps retail SKUs out: Goodr's
// "G00032-PHG-PR2-RF" is 17 characters and is not something we order blank.
const BLANK_SKU = /\(([^)]{2,14})\)/;

function blankSkuOf(title) {
  const m = String(title || '').match(BLANK_SKU);
  return m ? m[1].trim() : '';
}

function isNotAShipout(li) {
  if (/^re:do$/i.test(li.vendor || '')) return true;
  if (/^x-redo$/i.test(li.sku || '')) return true;
  if (/free returns on shoes only/i.test(li.title || '')) return true;
  if (/\bmembership\b/i.test(li.title || '')) return true;
  return false;
}

const QUERY = `query($q:String,$c:String){
  orders(first:25, query:$q, after:$c, sortKey:CREATED_AT, reverse:true){
    pageInfo{ hasNextPage endCursor }
    nodes{
      id name createdAt cancelledAt test note
      displayFinancialStatus displayFulfillmentStatus
      channelInformation{ channelDefinition{ channelName handle } }
      shippingAddress{ name city provinceCode }
      fulfillmentOrders(first:10){ nodes{
        status
        assignedLocation{ location{ id name } }
        deliveryMethod{ methodType }
        lineItems(first:50){ nodes{ lineItem{ id } } } } }
      lineItems(first:50){ nodes{
        id title quantity sku vendor
        product{ productType }
        variant{ id title }
        customAttributes{ key value } } } } } }`;

// Pull every open, unfulfilled order. `limit` caps pages so a runaway store
// cannot turn one sheet refresh into an unbounded crawl.
async function fetchOrders(client, { limit = 40 } = {}) {
  let cursor = null, pages = 0, out = [];
  do {
    const d = await client.graphql(QUERY, { q: 'fulfillment_status:unfulfilled AND status:open', c: cursor });
    const pg = d.data.orders;
    out.push(...pg.nodes);
    cursor = pg.pageInfo.hasNextPage ? pg.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < limit);
  return out;
}

export function buildRows(orders) {
  const rows = [];
  for (const o of orders) {
    if (o.cancelledAt || o.test) continue;
    const channel = o.channelInformation?.channelDefinition?.channelName
      || o.channelInformation?.channelDefinition?.handle || 'Unknown';
    if (/point of sale/i.test(channel)) continue;                 // online only

    // Which location is each line assigned to?
    const locByLine = new Map();
    for (const fo of o.fulfillmentOrders?.nodes || []) {
      const name = fo.assignedLocation?.location?.name || '';
      for (const li of fo.lineItems?.nodes || []) {
        if (li.lineItem?.id) locByLine.set(li.lineItem.id, name);
      }
    }

    const items = (o.lineItems?.nodes || []).filter((li) => !isNotAShipout(li));
    const garments = items.filter((li) => !isCompanion(li));
    const companions = items.filter((li) => isCompanion(li));

    // Index the garments so a companion can find its parent.
    const index = new Map();
    for (const g of garments) {
      const key = norm(baseTitle(g.title)) + '|' + norm(g.variant?.title);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(g);
    }
    const extras = new Map();                                     // garment id -> fields
    const orphans = [];
    for (const comp of companions) {
      const vAttr = (comp.customAttributes || []).find((a) => /^variant$/i.test(a.key));
      const key = norm(baseTitle(comp.title)) + '|' + norm(vAttr?.value);
      const pool = index.get(key);
      const parent = pool && pool.length ? pool[0] : null;
      if (!parent) { orphans.push(comp); continue; }
      const cur = extras.get(parent.id) || [];
      extras.set(parent.id, cur.concat(personalisationOf(comp)));
    }

    const common = {
      order: o.name,
      orderId: o.id,
      date: o.createdAt,
      channel,
      financialStatus: o.displayFinancialStatus,
      fulfillmentStatus: o.displayFulfillmentStatus,
      customer: o.shippingAddress?.name || '',
      shipCity: [o.shippingAddress?.city, o.shippingAddress?.provinceCode].filter(Boolean).join(', '),
      orderNote: o.note || '',
    };

    for (const g of garments) {
      const fields = (extras.get(g.id) || []).concat(personalisationOf(g));
      const shipFrom = locByLine.get(g.id) || '';
      rows.push({
        ...common,
        lineId: g.id,
        lineName: g.variant?.title ? `${g.title} - ${g.variant.title}` : g.title,
        title: g.title,
        variant: g.variant?.title || '',
        sku: g.sku || '',
        vendor: g.vendor || '',
        productType: g.product?.productType || '',
        isFootwear: FOOTWEAR.test(g.product?.productType || ''),
        quantity: g.quantity,
        shipFrom,
        route: routeOf(shipFrom),
        routeNote: shipFrom ? '' : NO_ROUTE_NOTE,
        hasPersonalisation: fields.length > 0 ? 'Yes' : 'No',
        personalisation: fields.map((f) => `${f.field}: ${f.value}`).join(' ; '),
        personalisationFields: fields,
        ...splitFields(fields),
        supplierSku: supplierSkuOf(g.title),
        blankSku: blankSkuOf(g.title),
        upcharge: fields.reduce((s, f) => s + (f.upcharge || 0), 0),
        unmatched: false,
      });
    }

    // A companion that found no garment is surfaced, never dropped.
    for (const comp of orphans) {
      const fields = personalisationOf(comp);
      const shipFrom = locByLine.get(comp.id) || '';
      rows.push({
        ...common,
        lineId: comp.id,
        lineName: comp.title,
        title: comp.title,
        variant: (comp.customAttributes || []).find((a) => /^variant$/i.test(a.key))?.value || '',
        sku: comp.sku || '',
        vendor: comp.vendor || '',
        productType: comp.product?.productType || '',
        isFootwear: FOOTWEAR.test(comp.product?.productType || ''),
        quantity: comp.quantity,
        shipFrom,
        route: routeOf(shipFrom),
        routeNote: shipFrom ? '' : NO_ROUTE_NOTE,
        hasPersonalisation: fields.length > 0 ? 'Yes' : 'No',
        personalisation: fields.map((f) => `${f.field}: ${f.value}`).join(' ; '),
        personalisationFields: fields,
        ...splitFields(fields),
        supplierSku: supplierSkuOf(comp.title),
        blankSku: blankSkuOf(comp.title),
        upcharge: fields.reduce((s, f) => s + (f.upcharge || 0), 0),
        unmatched: true,
      });
    }
  }
  return rows;
}

// DROPSHIP SHOES ARE NOT WHAT THIS SHEET IS FOR, so they are excluded by
// default. This sheet exists to track work: raising a PO, chasing a logo,
// ordering blanks from Sanmar, waiting on a warehouse. A pair of HOKAs is picked
// and shipped with none of that, which is why every one of those columns sits
// empty on a shoe line.
//
// Measured against the live sheet on 2026-09-29: of 77 footwear lines open at
// the time, exactly ONE appeared on it. Excluding them drops 76 rows of noise
// and loses 1 of 195 tracked lines.
//
// Note this is NOT the same as "warehouse shipouts only", which looks similar
// but is worse: it also drops 33 tracked lines, because 22 of the orders on the
// sheet are in-store apparel. Pass includeFootwear to turn the filter off.
export async function openOnlineOrders(client, opts = {}) {
  const orders = await fetchOrders(client, opts);
  let rows = buildRows(orders);
  const excluded = opts.includeFootwear ? 0 : rows.filter((r) => r.isFootwear).length;
  if (!opts.includeFootwear) rows = rows.filter((r) => !r.isFootwear);
  // OLDEST FIRST. Orders are pulled newest first, which is right for paging but
  // backwards for picking: the oldest unfulfilled line has been waiting longest
  // and belongs at the top of the queue.
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    footwearExcluded: excluded,
    generatedAt: new Date().toISOString(),
    ordersScanned: orders.length,
    rows,
    counts: {
      rows: rows.length,
      warehouse: rows.filter((r) => r.route === 'Warehouse Shipout').length,
      inStore: rows.filter((r) => r.route === 'In-Store Shipout').length,
      personalised: rows.filter((r) => r.hasPersonalisation === 'Yes').length,
      unmatchedCompanions: rows.filter((r) => r.unmatched).length,
    },
  };
}

// --------------------------------------------------------------- fulfilled

// WHY A SECOND LOOKUP. A row leaves the open sheet precisely because it stopped
// being open, so by then it is gone from openOnlineOrders and its tracking
// number cannot be read from there. This fetches recently fulfilled lines so the
// sheet can stamp the ship date and tracking onto a row as it moves to Closed.
//
// Keyed by LINE ITEM ID, the same anchor the sheet uses, because one order can
// ship in several fulfillments with different tracking numbers and stamping an
// order-level number onto every line would be wrong.
const FULFILLED_QUERY = `query($q:String,$c:String){
  orders(first:25, query:$q, after:$c, sortKey:UPDATED_AT, reverse:true){
    pageInfo{ hasNextPage endCursor }
    nodes{
      name
      fulfillments(first:10){
        createdAt
        displayStatus
        location{ name }
        trackingInfo{ number url company }
        fulfillmentLineItems(first:50){ nodes{ quantity lineItem{ id
          customAttributes{ key value } } } } } } } }`;

// CANCELLED IS NOT THE SAME AS SHIPPED, and the sheet could not tell them apart.
//
// A cancelled order leaves the open feed exactly like a shipped one does, so the
// sheet saw "gone" and filed it as fulfilled with no tracking, which reads as a
// shipment whose tracking is simply missing. Someone can pick and ship an order
// the customer cancelled. Measured 2026-10-07: 59 ONLINE orders were cancelled
// since 1 August and every one was UNFULFILLED, so every one of them had been
// sitting on a work queue.
//
// So cancelled lines are returned alongside fulfilled ones, each carrying a
// state, and the sheet decides what to do with each.
const CANCELLED_QUERY = `query($q:String,$c:String){
  orders(first:25, query:$q, after:$c, sortKey:UPDATED_AT, reverse:true){
    pageInfo{ hasNextPage endCursor }
    nodes{
      name cancelledAt cancelReason
      lineItems(first:50){ nodes{ id } } } } }`;

async function cancelledLines(client, { days = 90, limit = 40 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let cursor = null, pages = 0;
  const byLine = {};
  do {
    const d = await client.graphql(CANCELLED_QUERY, {
      q: `status:cancelled AND updated_at:>=${since}`, c: cursor,
    });
    const pg = d.data.orders;
    for (const o of pg.nodes) {
      for (const li of o.lineItems?.nodes || []) {
        if (!li.id) continue;
        byLine[li.id] = {
          state: 'CANCELLED',
          order: o.name,
          cancelledAt: o.cancelledAt || '',
          cancelReason: o.cancelReason || '',
          shippedAt: '', trackingNumber: '', trackingUrl: '', trackingCompany: '',
          shipFrom: '', route: '', personalisation: '',
          printPlacement: '', printName: '', printNumber: '',
        };
      }
    }
    cursor = pg.pageInfo.hasNextPage ? pg.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < limit);
  return byLine;
}

// REFUNDED IS A THIRD STATE, not a flavour of cancelled.
//
// A cancelled order was called off before shipping. A refunded one may well have
// shipped and come back, or been refunded without ever being cancelled, and
// Shopify tracks the two independently: an order can be REFUNDED with no
// cancelledAt at all. Lumping them together would hide returns, so each line
// carries which of the two it is.
const REFUNDED_QUERY = `query($q:String,$c:String){
  orders(first:25, query:$q, after:$c, sortKey:UPDATED_AT, reverse:true){
    pageInfo{ hasNextPage endCursor }
    nodes{
      name cancelledAt displayFinancialStatus
      totalRefundedSet{ shopMoney{ amount } }
      refunds(first:5){ createdAt note }
      lineItems(first:50){ nodes{ id } } } } }`;

async function refundedLines(client, { days = 90, limit = 40 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let cursor = null, pages = 0;
  const byLine = {};
  do {
    const d = await client.graphql(REFUNDED_QUERY, {
      q: `updated_at:>=${since} AND (financial_status:refunded OR financial_status:partially_refunded)`,
      c: cursor,
    });
    const pg = d.data.orders;
    for (const o of pg.nodes) {
      // A cancelled order is reported as cancelled even when it was refunded
      // too, because "called off" is the more useful headline for picking.
      if (o.cancelledAt) continue;
      const r0 = (o.refunds || [])[0] || {};
      for (const li of o.lineItems?.nodes || []) {
        if (!li.id) continue;
        byLine[li.id] = {
          state: 'REFUNDED',
          order: o.name,
          refundedAt: r0.createdAt || '',
          refundedAmount: o.totalRefundedSet?.shopMoney?.amount || '',
          cancelReason: o.displayFinancialStatus === 'PARTIALLY_REFUNDED' ? 'PARTIAL REFUND' : 'REFUNDED',
          cancelledAt: '',
          shippedAt: '', trackingNumber: '', trackingUrl: '', trackingCompany: '',
          shipFrom: '', route: '', personalisation: '',
          printPlacement: '', printName: '', printNumber: '',
        };
      }
    }
    cursor = pg.pageInfo.hasNextPage ? pg.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < limit);
  return byLine;
}

export async function fulfilledLines(client, { days = 60, limit = 40 } = {}) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let cursor = null, pages = 0;
  const byLine = {};
  do {
    const d = await client.graphql(FULFILLED_QUERY, {
      q: `fulfillment_status:fulfilled AND updated_at:>=${since}`, c: cursor,
    });
    const pg = d.data.orders;
    for (const o of pg.nodes) {
      for (const f of o.fulfillments || []) {
        const t = (f.trackingInfo || [])[0] || {};
        for (const li of f.fulfillmentLineItems?.nodes || []) {
          const id = li.lineItem?.id;
          if (!id) continue;
          // PREFER A FULFILLMENT THAT ACTUALLY CARRIES TRACKING. One line can
          // appear in several fulfillments and some have no tracking info at
          // all: #88376 has one of each. Keeping whichever arrived first would
          // stamp a blank tracking number onto a parcel that has one. So only
          // keep the first entry if it already has a number, otherwise let a
          // later, better one replace it.
          if (byLine[id] && byLine[id].trackingNumber) continue;
          if (byLine[id] && !t.number) continue;
          // SHIP FROM AND THE PRINT DETAIL COME FROM HERE TOO.
          //
          // A line is gone from /orders/open by the time the sheet notices it
          // shipped, so anything the Closed tab wants that is not already in a
          // sheet column has to be stamped from this lookup. Without it, Ship
          // From, Route and Name Value were silently blank on every closed row.
          const fields = personalisationOf(li.lineItem || { customAttributes: [] });
          const split = splitFields(fields);
          const loc = f.location?.name || '';
          byLine[id] = {
            state: 'FULFILLED',
            order: o.name,
            shippedAt: f.createdAt || '',
            trackingNumber: t.number || '',
            trackingUrl: t.url || '',
            trackingCompany: t.company || '',
            shipFrom: loc,
            route: loc ? (loc === WAREHOUSE ? 'Warehouse Shipout' : 'In-Store Shipout') : '',
            personalisation: fields.map((x) => `${x.field}: ${x.value}`).join(' ; '),
            printPlacement: split.printPlacement,
            printName: split.printName,
            printNumber: split.printNumber,
          };
        }
      }
    }
    cursor = pg.pageInfo.hasNextPage ? pg.pageInfo.endCursor : null;
    pages++;
  } while (cursor && pages < limit);
  // Cancelled lines are folded in. A FULFILLED state wins if a line somehow
  // appears in both, because something that shipped did ship.
  // CANCELLED WINS OVER FULFILLED, and over refunded. If an order was called
  // off, that is what whoever is picking needs to know, whatever else is true
  // of it. A refund on a line that genuinely shipped is a return, and the
  // shipping detail is the more useful record, so FULFILLED keeps that line.
  const cancelled = await cancelledLines(client, { days: Math.max(days, 90), limit });
  let cancelledAdded = 0;
  for (const id in cancelled) {
    byLine[id] = cancelled[id];              // overwrite, cancelled is the headline
    cancelledAdded++;
  }
  const refunded = await refundedLines(client, { days: Math.max(days, 90), limit });
  let refundedAdded = 0;
  for (const id in refunded) {
    if (byLine[id]) continue;                // already fulfilled or cancelled
    byLine[id] = refunded[id];
    refundedAdded++;
  }
  const total = Object.keys(byLine).length;
  return {
    generatedAt: new Date().toISOString(), days,
    lines: byLine,
    count: total,
    fulfilled: total - cancelledAdded - refundedAdded,
    cancelled: cancelledAdded,
    refunded: refundedAdded,
  };
}
