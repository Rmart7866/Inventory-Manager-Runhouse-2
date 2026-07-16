// catalog.js, Worker port of export-catalog.mjs. The Run House.
//
// READ ONLY. Writes nothing to Shopify. Fetches the live catalog and builds the
// "what exists" map the browser Inventory Manager needs, so new-colorway
// detection runs against live data instead of the static existing_handles file
// and the Firestore snapshot, both of which drift.
//
// This is the export-catalog.mjs logic with the two file writes and the CLI
// stripped out. Same query, same footwear gate, same map building, same
// inheritance record. Where that script ended in writeFileSync, this returns
// the object instead, and the router serves it as JSON.
//
// The tag logic is imported from the ported parsers / group / tag-groups, so the
// cw-group: tag computed here is the tag the pipeline stamps. One source of
// truth, which is the point.
//
// Dropped vs export-catalog.mjs, on purpose:
//   - writeFileSync of catalog-live.json, the response body IS that object.
//   - writeFileSync of existing-handles-live.js, that was a codegen convenience
//     for refreshing a static file. `bySku` answers the same question live.
//   - the console report, a Worker has no operator watching stdout.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { parseProduct, brandFor } from './parsers.js';
import { widthClass } from './group.js';
import { groupTagFor } from './tag-groups.js';
import { throttleOf } from './shopify.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Map a parsed width to the storefront width TAG value that tag-wide.mjs writes.
// standard gets no tag. Everything else mirrors the tag-wide vocabulary.
function widthTagFor(width) {
  switch (widthClass(width)) {
    case 'wide': return 'wide';
    case 'xwide': return 'extra wide';
    case 'narrow': return 'narrow';
    default: return '';
  }
}

// Pull the fields the prep tool needs: handle, type, tags, and every variant's
// SKU and price. Colorways share MSRP and sizes share price, so the first
// variant price is the model price.
const QUERY = `
query($cursor: String, $q: String) {
  products(first: 60, after: $cursor, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      handle
      title
      vendor
      productType
      status
      tags
      variants(first: 100) { nodes { sku price } }
    }
  }
}`;

async function fetchAll(client, limit, activeOnly) {
  const out = [];
  let cursor = null;
  const q = activeOnly ? 'status:active' : '';
  for (;;) {
    const body = await client.graphql(QUERY, { cursor, q });
    const conn = body.data.products;
    for (const n of conn.nodes) {
      if (!/shoes$/i.test(n.productType || '')) continue; // footwear only
      out.push(n);
      if (out.length >= limit) return out;
    }
    const t = throttleOf(body);
    if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
      await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

// buildCatalog(client, { limit, activeOnly }) -> the /catalog payload.
export async function buildCatalog(client, opts = {}) {
  const limit = opts.limit || Infinity;
  const activeOnly = !!opts.activeOnly;

  const raw = await fetchAll(client, limit, activeOnly);

  const products = [];        // full rows
  const bySku = {};           // variant SKU -> handle   (exact "already exists" check)
  const byModel = {};         // brandKey|cwGroupTag -> inheritance record
  const statusByHandle = {};  // handle -> ACTIVE | DRAFT | ARCHIVED
  const unparsed = [];

  for (const n of raw) {
    const firstSku = n.variants?.nodes?.[0]?.sku || '';
    const price = n.variants?.nodes?.[0]?.price || '';
    const parsed = parseProduct({ title: n.title, sku: firstSku, vendor: n.vendor });
    const brand = brandFor(n.vendor).key;

    // Record every variant SKU -> handle, so the tool can check any feed SKU.
    for (const v of (n.variants?.nodes || [])) {
      if (v.sku) bySku[v.sku] = n.handle;
    }

    // Status per handle. bySku deliberately maps EVERY sku, including archived
    // and draft ones, because that is the question "does a product with this
    // handle already exist", which is what stops an import colliding with a
    // retired product's handle. It is NOT the question "do we currently carry
    // this". Only status can answer that, so we publish it and let compare()
    // pick the policy. Recorded before the parse gate so unparsed products, which
    // are in bySku, are represented here too.
    statusByHandle[n.handle] = n.status;

    if (!parsed.ok) { unparsed.push({ title: n.title, sku: firstSku }); continue; }

    const cwGroup = groupTagFor(parsed);        // identical to the pipeline tag
    const widthTag = widthTagFor(parsed.width);

    products.push({
      handle: n.handle,
      title: n.title,
      vendor: n.vendor,
      brand,
      productType: n.productType,
      status: n.status,
      price,
      styleCode: parsed.styleCode,
      colorCode: parsed.colorCode,
      modelKey: parsed.modelKey,
      gender: parsed.gender,
      width: parsed.width,
      cwGroup,
      widthTag,
      skus: (n.variants?.nodes || []).map((v) => v.sku).filter(Boolean),
    });

    // Model-level inheritance record, keyed by the cw-group tag (the exact group
    // a new colorway of this model+width would join). First write wins for the
    // sample fields; we widen styleCodes and count colorways as we go.
    const mkey = `${brand}|${cwGroup}`;
    if (!byModel[mkey]) {
      byModel[mkey] = {
        brand,
        modelKey: parsed.modelKey,
        cwGroup,
        widthTag,
        productType: n.productType,
        price,                  // inherit this for a new colorway
        sampleHandle: n.handle,
        styleCodes: [],
        colorwayCount: 0,
      };
    }
    const rec = byModel[mkey];
    rec.colorwayCount++;
    if (parsed.styleCode && !rec.styleCodes.includes(parsed.styleCode)) rec.styleCodes.push(parsed.styleCode);
    // Keep a non-empty price if the sample had none.
    if (!rec.price && price) rec.price = price;
  }

  // Sort styleCodes for stable output.
  for (const k of Object.keys(byModel)) byModel[k].styleCodes.sort();

  // Status mix is worth publishing: it is the fastest way to notice that the
  // catalog has drifted (eg a bulk archive) without diffing the whole payload.
  const byStatus = {};
  for (const s of Object.values(statusByHandle)) byStatus[s] = (byStatus[s] || 0) + 1;

  return {
    generatedAt: new Date().toISOString(),
    shop: client.SHOP,
    scope: activeOnly ? 'active' : 'all',
    counts: {
      products: products.length,
      skus: Object.keys(bySku).length,
      models: Object.keys(byModel).length,
      unparsed: unparsed.length,
      byStatus,
    },
    products,
    bySku,
    byModel,
    statusByHandle,
  };
}
