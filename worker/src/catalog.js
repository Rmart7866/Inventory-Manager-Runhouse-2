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
import { runBulkQuery, streamJsonl } from './bulk.js';

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
      descriptionHtml
      category { fullName }
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

// NEEDHAM SCOPING via Bulk Operations. Dropshipped products are footwear stocked
// at the single Needham location, and the authoritative signal is a Needham
// inventory level on the product. Getting that plus the whole catalog by paging
// is ~250 throttled requests and 7+ minutes, which times out the rebuild. Two
// dead ends were measured: a per-variant inventoryLevel in the paged query
// (correct but cost 242 vs 98 per page, 500s+), and the product search filter
// "location_id:X" (a no-op that returns the whole catalog). So the whole fetch
// moves to ONE bulk operation: Shopify runs it server-side with no throttle and
// returns a JSONL file we stream-parse. About 2 to 3 minutes, well inside limits.
//
// The bulk query. No `first:` on connections (bulk auto-paginates). Every node
// with a nested connection selects `id` (bulk requires it). Pulls all products
// (footwear is filtered while parsing, so typo'd product types are still caught)
// with variants and each variant's inventory levels across all locations.
function bulkCatalogQuery(activeOnly) {
  const filter = activeOnly ? '(query: "status:active")' : '';
  return `{
  products ${filter} {
    edges { node {
      id handle title vendor productType status tags
      descriptionHtml category { fullName }
      variants { edges { node {
        id sku price selectedOptions { name value }
        inventoryItem { id inventoryLevels { edges { node {
          location { id }
          quantities(names: ["on_hand"]) { name quantity }
        } } } }
      } } }
    } }
  }
}`;
}

// The Size option value for a variant, so a removed product can be zeroed row by
// row on Handle + Option1 (Size). Prefer the option literally named Size, fall
// back to the first option (Option1 is Size for footwear).
function sizeOf(selectedOptions) {
  const opts = selectedOptions || [];
  const size = opts.find((o) => /size/i.test(o.name || ''));
  return (size && size.value) || (opts[0] && opts[0].value) || '';
}

// Reassembler for the flat JSONL. Bulk emits parents before children: a product
// line (has `handle`), then its variant lines (__parentId = product), then each
// variant's inventory-level lines (__parentId = variant, has a `location`). We
// keep only footwear, so the in-memory maps stay small even though the file is
// ~120 MB. needhamLocationId null means scoping off (needhamOnHandMap stays null).
// The on-hand map doubles as the presence set: a Needham level, even at 0, puts
// the handle in the map.
function makeBulkAssembler(needhamLocationId) {
  const productsById = new Map();  // footwear product id -> node
  const variantInfo = new Map();   // footwear variant id -> { productId, sku, size }
  // needham (null when scoping off): per-handle on-hand total and per-size detail.
  // onHand doubles as the presence set (a Needham level, even 0, adds the handle).
  const needham = needhamLocationId ? { onHand: new Map(), variants: new Map() } : null;

  const onObject = (o) => {
    if ('handle' in o) {
      if (!/shoes$/i.test(o.productType || '')) return; // footwear only
      productsById.set(o.id, {
        id: o.id, handle: o.handle, title: o.title, vendor: o.vendor,
        productType: o.productType, status: o.status, tags: o.tags || [],
        descriptionHtml: o.descriptionHtml || '', category: o.category || null,
        variants: { nodes: [] },
      });
    } else if ('location' in o) {
      if (!needham) return;
      const vi = variantInfo.get(o.__parentId);
      if (!vi) return; // level on a non-footwear variant
      if (!o.location || o.location.id !== needhamLocationId) return; // other location
      const p = productsById.get(vi.productId);
      if (!p) return;
      const q = (o.quantities || []).find((x) => x.name === 'on_hand');
      const qty = q ? q.quantity : 0;
      needham.onHand.set(p.handle, (needham.onHand.get(p.handle) || 0) + qty);
      // Per-size detail for zero rows. If a size repeats (multiple levels), keep
      // the sku and add the quantity.
      let vmap = needham.variants.get(p.handle);
      if (!vmap) { vmap = {}; needham.variants.set(p.handle, vmap); }
      const key = vi.size || vi.sku;
      if (key) vmap[key] = { sku: vi.sku || '', quantity: (vmap[key] ? vmap[key].quantity : 0) + qty };
    } else {
      const p = productsById.get(o.__parentId);
      if (!p) return; // variant of a non-footwear product
      p.variants.nodes.push({ sku: o.sku, price: o.price });
      variantInfo.set(o.id, { productId: o.__parentId, sku: o.sku, size: sizeOf(o.selectedOptions) });
    }
  };
  const result = () => ({ raw: [...productsById.values()], needham });
  return { onObject, result };
}

// PURE, for tests: reassemble an array of JSONL objects.
export function assembleBulkObjects(objects, needhamLocationId) {
  const a = makeBulkAssembler(needhamLocationId);
  for (const o of objects) a.onObject(o);
  return a.result();
}

// Run the bulk query and stream-parse the result into { raw, needham }, never
// holding the whole 120 MB file in memory.
async function fetchCatalogViaBulk(client, activeOnly, needhamLocationId) {
  const a = makeBulkAssembler(needhamLocationId);
  const url = await runBulkQuery(client, bulkCatalogQuery(activeOnly));
  await streamJsonl(url, a.onObject);
  return a.result();
}

// buildCatalog(client, opts) -> the /catalog payload. Full builds fetch via one
// bulk operation; a `limit` (dev peek) uses the quick paginated path with no
// Needham detail. Either way the pure buildCatalogFrom does the rest.
export async function buildCatalog(client, opts = {}) {
  const activeOnly = !!opts.activeOnly;
  const needhamLocationId = opts.needhamLocationId || null;

  let raw, needham;
  if (opts.limit) {
    raw = await fetchAll(client, opts.limit, activeOnly);
    needham = null; // bulk is overkill for a truncated dev peek
  } else {
    ({ raw, needham } = await fetchCatalogViaBulk(client, activeOnly, needhamLocationId));
  }
  return buildCatalogFrom(raw, needham, { activeOnly, needhamLocationId, shop: client.SHOP });
}

// PURE. Turn fetched product nodes + the Needham data into the /catalog payload.
// All the parsing, cw-group tagging, bySku/byModel building is here and
// unchanged, so the source of the raw nodes (bulk or paged) does not matter.
// needham is { onHand: Map, variants: Map } or null when scoping is off.
export function buildCatalogFrom(raw, needham, opts = {}) {
  const activeOnly = !!opts.activeOnly;
  const needhamLocationId = opts.needhamLocationId || null;

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

    // Dropship = stocked at Needham. true/false when scoping is on, null when
    // off. The catalog still carries ALL footwear (bySku needs every handle for
    // collision checks); the client uses this flag to scope the DROPSHIP known
    // set, so non-Needham products are never flagged for zeroing.
    const hasNeedham = needham ? needham.onHand.has(n.handle) : false;
    const needhamFlag = needham ? hasNeedham : null;
    // On-hand total (skip zeroing what is already 0) and per-size variants (to
    // build the zero rows), both for Needham products only.
    const needhamOnHand = needham ? (hasNeedham ? needham.onHand.get(n.handle) : 0) : null;
    const needhamVariants = (needham && hasNeedham) ? needham.variants.get(n.handle) : undefined;

    if (!parsed.ok) { unparsed.push({ title: n.title, sku: firstSku }); continue; }

    const cwGroup = groupTagFor(parsed);        // identical to the pipeline tag
    const widthTag = widthTagFor(parsed.width);

    products.push({
      id: n.id,
      handle: n.handle,
      title: n.title,
      vendor: n.vendor,
      brand,
      productType: n.productType,
      status: n.status,
      // Current tags, so the dashboard's Catalog Tagging panel can diff against
      // the computed width/cw-group/gender tags without a fresh Admin scan.
      tags: n.tags || [],
      price,
      styleCode: parsed.styleCode,
      colorCode: parsed.colorCode,
      modelKey: parsed.modelKey,
      modelKeyGenderless: parsed.modelKeyGenderless,
      colorName: parsed.colorName,
      gender: parsed.gender,
      width: parsed.width,
      cwGroup,
      widthTag,
      needham: needhamFlag,
      needhamOnHand,
      needhamVariants,
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
        // Model-level content a new colorway inherits. Every colorway of a model
        // carries identical description/category/tags (verified against the
        // store), so the first colorway seen is a faithful sample. First write
        // wins, matching the other sample fields above.
        descriptionHtml: n.descriptionHtml || '',
        category: (n.category && n.category.fullName) || '',
        tags: n.tags || [],
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

  // needhamScoped tells the client whether the `needham` flag is meaningful. When
  // false, the client must NOT trust removed-detection to be dropship-only.
  const needhamScoped = !!needhamLocationId;
  let needhamProducts = null;
  if (needhamScoped) needhamProducts = products.filter((p) => p.needham === true).length;

  return {
    generatedAt: new Date().toISOString(),
    shop: opts.shop || '',
    scope: activeOnly ? 'active' : 'all',
    needhamScoped,
    counts: {
      products: products.length,
      skus: Object.keys(bySku).length,
      models: Object.keys(byModel).length,
      unparsed: unparsed.length,
      needhamProducts,
      byStatus,
    },
    products,
    bySku,
    byModel,
    statusByHandle,
  };
}
