// inventory.js, The Run House. Stage 3 WRITE.
//
// Sets on-hand to ZERO for a list of SKUs, at the Needham location only. This is
// what the "Clear all removed" button calls: products that fell out of a supplier
// feed and should stop being sold get their Needham stock zeroed in one request
// instead of a hand-imported CSV.
//
// SAFETY IS THE WHOLE POINT OF THIS FILE:
//   1. NEEDHAM ONLY. Every write targets env.NEEDHAM_LOCATION_ID and no other
//      location. A product's stock at any other store is never touched. If the
//      Needham location is not configured, the route refuses to write at all.
//   2. ZERO ONLY. The only quantity this route ever writes is 0. It cannot set
//      an arbitrary number, so a bad caller cannot inflate stock, only clear it.
//   3. ONLY WHAT IS ALREADY POSITIVE. Items already at 0 are skipped, so the
//      report reflects real changes and a re-run is a no-op.
//   4. COMPARE-AND-SET. Each write carries the on-hand we just read as
//      compareQuantity, so if the count moved between read and write (a sale, a
//      manual edit) the write is rejected rather than clobbering a fresh number.
//   5. DRY RUN. dryRun:true resolves and reports exactly what WOULD change and
//      writes nothing, which is what the button shows before you confirm.
//
// The write-secret guard that keeps this route from being callable by anyone who
// reads the public bundle token lives in auth.js (requireWriteSecret). This
// module assumes the caller is already authorised.
//
// House style: no em dashes. Use commas, periods, or the word "to".

// Resolve SKUs to their inventory item id and current Needham on-hand. Batches
// the SKU query so a few hundred SKUs cost a handful of requests, not one each.
const RESOLVE = `
query($q: String!, $loc: ID!) {
  productVariants(first: 250, query: $q) {
    nodes {
      sku
      inventoryItem {
        id
        inventoryLevel(locationId: $loc) {
          quantities(names: ["on_hand"]) { name quantity }
        }
      }
    }
  }
}`;

const SET_ZERO = `
mutation($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup { createdAt reason }
    userErrors { field message }
  }
}`;

const SET_MANY = `
mutation($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup { createdAt }
    userErrors { field message }
  }
}`;

const onHandOf = (node) => {
  const q = (node.inventoryItem && node.inventoryItem.inventoryLevel && node.inventoryItem.inventoryLevel.quantities) || [];
  const oh = q.find((x) => x.name === 'on_hand');
  return oh ? oh.quantity : null;
};

// Resolve a batch of SKUs. Shopify's variant query matches sku exactly with
// sku:"X"; OR-join keeps it to one request per ~100 SKUs.
async function resolveSkus(client, skus, locationId) {
  const bySku = new Map();
  const uniq = [...new Set((skus || []).map((s) => String(s || '').trim()).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 100) {
    const batch = uniq.slice(i, i + 100);
    const q = batch.map((s) => 'sku:' + JSON.stringify(s)).join(' OR ');
    const body = await client.graphql(RESOLVE, { q, loc: locationId });
    for (const n of (body.data.productVariants.nodes || [])) {
      if (!n.sku || bySku.has(n.sku)) continue;
      bySku.set(n.sku, { inventoryItemId: n.inventoryItem && n.inventoryItem.id, onHand: onHandOf(n) });
    }
  }
  return bySku;
}

// Zero on-hand at Needham for the given SKUs. Returns a per-SKU report and never
// throws for a single bad SKU; the whole request only rejects on a missing
// location or an outright API failure.
export async function zeroInventory(client, env, opts = {}) {
  const locationId = env.NEEDHAM_LOCATION_ID;
  if (!locationId) {
    // No Needham location means we cannot scope the write. Refuse, loudly.
    return { ok: false, error: 'NEEDHAM_LOCATION_ID is not configured; refusing to write inventory unscoped.' };
  }
  const dryRun = opts.dryRun !== false; // default dry run; only an explicit dryRun:false writes
  const skus = Array.isArray(opts.skus) ? opts.skus : [];
  if (!skus.length) return { ok: true, dryRun, location: locationId, results: [], summary: { requested: 0, toZero: 0, alreadyZero: 0, notFound: 0, zeroed: 0, failed: 0 } };

  const resolved = await resolveSkus(client, skus, locationId);

  const plan = [];
  const results = [];
  let alreadyZero = 0, notFound = 0;
  for (const sku of skus) {
    const key = String(sku || '').trim();
    const hit = resolved.get(key);
    if (!hit || !hit.inventoryItemId) { notFound++; results.push({ sku: key, status: 'not_found' }); continue; }
    if (hit.onHand == null) { notFound++; results.push({ sku: key, status: 'no_needham_level' }); continue; }
    if (hit.onHand <= 0) { alreadyZero++; results.push({ sku: key, status: 'already_zero', onHand: hit.onHand }); continue; }
    plan.push({ sku: key, inventoryItemId: hit.inventoryItemId, onHand: hit.onHand });
  }

  if (dryRun) {
    for (const p of plan) results.push({ sku: p.sku, status: 'would_zero', onHand: p.onHand });
    return {
      ok: true, dryRun: true, location: locationId, results,
      summary: { requested: skus.length, toZero: plan.length, alreadyZero, notFound, zeroed: 0, failed: 0 },
    };
  }

  let zeroed = 0, failed = 0;
  for (const p of plan) {
    try {
      const input = {
        name: 'on_hand',
        reason: 'correction',
        // compareQuantity guards against a count that moved since we read it.
        quantities: [{ inventoryItemId: p.inventoryItemId, locationId, quantity: 0, compareQuantity: p.onHand }],
      };
      const body = await client.graphql(SET_ZERO, { input });
      const ue = (body.data.inventorySetQuantities && body.data.inventorySetQuantities.userErrors) || [];
      if (ue.length) { failed++; results.push({ sku: p.sku, status: 'failed', onHand: p.onHand, error: ue.map((e) => e.message).join('; ') }); }
      else { zeroed++; results.push({ sku: p.sku, status: 'zeroed', onHand: p.onHand }); }
    } catch (err) {
      failed++;
      results.push({ sku: p.sku, status: 'failed', onHand: p.onHand, error: String((err && err.message) || err) });
    }
  }
  return {
    ok: true, dryRun: false, location: locationId, results,
    summary: { requested: skus.length, toZero: plan.length, alreadyZero, notFound, zeroed, failed },
  };
}

// Set on-hand at Needham to an explicit quantity per SKU. This is the full-sync
// path behind "Write all inventory to Shopify": the feed value is authoritative,
// so it OVERWRITES the current count rather than compare-and-set. A quantity of
// 0 is a valid target here, so this also zeroes removed products in the same
// pass. Same Needham-only and refuse-without-location guards as zeroInventory.
//
// items: [{ sku, quantity }]. dryRun defaults TRUE.
export async function setInventory(client, env, opts = {}) {
  const locationId = env.NEEDHAM_LOCATION_ID;
  if (!locationId) return { ok: false, error: 'NEEDHAM_LOCATION_ID is not configured; refusing to write inventory unscoped.' };
  const dryRun = opts.dryRun !== false;
  const items = Array.isArray(opts.items) ? opts.items : [];
  if (!items.length) return { ok: true, dryRun, location: locationId, results: [], summary: { requested: 0, toChange: 0, unchanged: 0, notFound: 0, zeros: 0, written: 0, failed: 0 } };

  // Collapse duplicate SKUs (last wins) and coerce quantities to a safe integer.
  const want = new Map();
  for (const it of items) {
    const sku = String((it && it.sku) || '').trim();
    if (!sku) continue;
    let q = parseInt(it.quantity, 10); if (!(q >= 0)) q = 0;
    want.set(sku, q);
  }
  const skus = [...want.keys()];
  const resolved = await resolveSkus(client, skus, locationId);

  const plan = [];
  const results = [];
  let unchanged = 0, notFound = 0, zeros = 0;
  for (const sku of skus) {
    const hit = resolved.get(sku);
    const target = want.get(sku);
    if (!hit || !hit.inventoryItemId || hit.onHand == null) { notFound++; results.push({ sku, status: 'not_found', target }); continue; }
    if (hit.onHand === target) { unchanged++; results.push({ sku, status: 'unchanged', onHand: hit.onHand }); continue; }
    if (target === 0) zeros++;
    plan.push({ sku, inventoryItemId: hit.inventoryItemId, from: hit.onHand, to: target });
  }

  if (dryRun) {
    for (const p of plan) results.push({ sku: p.sku, status: 'would_set', from: p.from, to: p.to });
    return { ok: true, dryRun: true, location: locationId, results, summary: { requested: skus.length, toChange: plan.length, unchanged, notFound, zeros, written: 0, failed: 0 } };
  }

  // Batch the writes: inventorySetQuantities takes many quantities per call.
  // ignoreCompareQuantity is true because the feed is authoritative for a full
  // sync, so we do not want a moved count to reject the write.
  let written = 0, failed = 0;
  const BATCH = 100;
  for (let i = 0; i < plan.length; i += BATCH) {
    const chunk = plan.slice(i, i + BATCH);
    try {
      const input = {
        name: 'on_hand',
        reason: 'correction',
        ignoreCompareQuantity: true,
        quantities: chunk.map((p) => ({ inventoryItemId: p.inventoryItemId, locationId, quantity: p.to })),
      };
      const body = await client.graphql(SET_MANY, { input });
      const ue = (body.data.inventorySetQuantities && body.data.inventorySetQuantities.userErrors) || [];
      if (ue.length) {
        // The whole batch shares one error; mark each row in it failed so the
        // report totals stay honest rather than over-counting successes.
        for (const p of chunk) { failed++; results.push({ sku: p.sku, status: 'failed', from: p.from, to: p.to, error: ue.map((e) => e.message).join('; ') }); }
      } else {
        for (const p of chunk) { written++; results.push({ sku: p.sku, status: 'set', from: p.from, to: p.to }); }
      }
    } catch (err) {
      for (const p of chunk) { failed++; results.push({ sku: p.sku, status: 'failed', from: p.from, to: p.to, error: String((err && err.message) || err) }); }
    }
  }
  return { ok: true, dryRun: false, location: locationId, results, summary: { requested: skus.length, toChange: plan.length, unchanged, notFound, zeros, written, failed } };
}
