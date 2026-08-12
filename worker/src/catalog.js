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

// The custom.* swatch metafields we carry so the dashboard tagging panel can
// diff its computed sibling references against what is already on the product,
// and write ONLY the ones that changed instead of rewriting all of them.
const SWATCH_MF_KEYS = new Set(['style_siblings', 'width_siblings', 'gender_sibling', 'model_widths', 'width_code', 'width_class', 'gender', 'color_name']);

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
      updatedAt
      createdAt
      descriptionHtml
      category { fullName }
      featuredImage { url }
      metafields(namespace: "custom", first: 30) { nodes { key value } }
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
      if (classify(n.productType, n.vendor) !== 'footwear') continue; // footwear only
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
      id handle title vendor productType status tags updatedAt createdAt
      descriptionHtml category { fullName }
      featuredImage { url }
      metafields(namespace: "custom") { edges { node { namespace key value } } }
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

// ---------------------------------------------------------------------------
// What belongs in which catalog
// ---------------------------------------------------------------------------
// The store is 17,469 products and 242,909 variants (measured 2026-08-05).
// Footwear is 3,954 of those products and about 4.5 MB of JSON, which is the
// payload the tool has always fetched. Carrying everything would be roughly four
// times that, close to KV's 25 MB ceiling and a large download for every staff
// member, so nothing is widened blindly.
//
// FOOTWEAR is the type ending in "shoes", as before, PLUS "Athletic Footwear"
// and "Footwear". Those two are 161 supplier products (2,509 variants) of real
// running shoes that the /shoes$/i gate has never matched, so the tool could not
// see them: it can offer one as new and create a duplicate. They cannot be
// zeroed by adding them here, because the client's dropship filter still demands
// a gendered "* Shoes" type before anything enters the removal set. This is a
// suppression fix, not a new write path.
//
// APPAREL is supplier-brand non-footwear, and only supplier brands. Half the
// store is The Run House's own printed apparel (7,329 products with no product
// type at all), which has nothing to do with a supplier feed. Scoping to the
// brands parsers.js knows keeps this at 1,732 products and about 1 MB.
//
// Anything else, including blank types and one-off categories, stays out of both.
const FOOTWEAR_TYPE_RE = /(shoes$|^athletic footwear$|^footwear$)/i;

// The garment types the supplier brands actually use on this store. An allowlist
// rather than "not footwear", so a new category cannot quietly balloon the
// payload. Spikes and Sandals are deliberately absent: they are shoes but not
// dropship, so neither catalog has a use for them yet.
const APPAREL_TYPE_RE = new RegExp('^(' + [
  'tanks?', 'hoodies', 'sweatshirts', 't-shirts?', 'short sleeve', 'long sleeves',
  'crewnecks', 'half-zips', 'full zips', 'jackets?', 'vests', 'shorts', 'pants',
  'sweatpants', 'joggers', 'tights/leggings', 'skorts', 'sports bras', 'socks',
  'gloves', 'headwear', 'uniforms', 'compression', 'active dress',
].join('|') + ')$', 'i');

// 'footwear' | 'apparel' | null. brandFor returns UNKNOWN for a vendor that is
// not one of the supplier brands, which is exactly the apparel scope test.
export function classify(productType, vendor) {
  const t = String(productType || '').trim();
  if (FOOTWEAR_TYPE_RE.test(t)) return 'footwear';
  if (APPAREL_TYPE_RE.test(t) && brandFor(vendor).key !== 'UNKNOWN') return 'apparel';
  return null;
}

// The ON style article code, which appears in both a supplier SKU and, for the
// apparel already on this store, in the handle. Footwear is 3xx and apparel 1xx.
// This is what lets the apparel tool join a feed row to a live product without
// guessing from a name.
function articleCodesOf(product) {
  const found = new Set();
  const add = (s) => {
    const m = String(s || '').toUpperCase().match(/[13][WMU][A-Z]\d{6,}/);
    if (m) found.add(m[0]);
  };
  add(product.handle);
  for (const v of (product.variants && product.variants.nodes) || []) add(v.sku);
  return [...found];
}

// Reassembler for the flat JSONL. Bulk emits parents before children: a product
// line (has `handle`), then its variant lines (__parentId = product), then each
// variant's inventory-level lines (__parentId = variant, has a `location`). We
// keep only footwear, so the in-memory maps stay small even though the file is
// ~120 MB. needhamLocationId null means scoping off (needhamOnHandMap stays null).
// The on-hand map doubles as the presence set: a Needham level, even at 0, puts
// the handle in the map.
function makeBulkAssembler(needhamLocationId) {
  const productsById = new Map();  // kept product id -> node (footwear AND apparel)
  const variantInfo = new Map();   // kept variant id -> { productId, sku, size }
  // needham (null when scoping off): per-handle on-hand total and per-size detail.
  // onHand doubles as the presence set (a Needham level, even 0, adds the handle).
  const needham = needhamLocationId ? { onHand: new Map(), variants: new Map() } : null;

  const onObject = (o) => {
    if ('handle' in o) {
      // One pass over the bulk file feeds both catalogs. Apparel rides along at no
      // extra cost to Shopify, and the two payloads are split apart afterwards so
      // the footwear one keeps exactly the shape it has always had.
      const kind = classify(o.productType, o.vendor);
      if (!kind) return;
      productsById.set(o.id, {
        id: o.id, handle: o.handle, title: o.title, vendor: o.vendor,
        productType: o.productType, status: o.status, tags: o.tags || [],
        descriptionHtml: o.descriptionHtml || '', category: o.category || null,
        image: (o.featuredImage && o.featuredImage.url) || '',
        updatedAt: o.updatedAt || '',
        _kind: kind,
        _total: 0,
        variants: { nodes: [] },
      });
    } else if ('location' in o) {
      const vi = variantInfo.get(o.__parentId);
      if (!vi) return; // level on a non-footwear variant
      const p = productsById.get(vi.productId);
      if (!p) return;
      const q = (o.quantities || []).find((x) => x.name === 'on_hand');
      const qty = q ? q.quantity : 0;
      // Total on-hand across EVERY location, so the Library can tell what has no
      // stock anywhere. Summed regardless of Needham scoping.
      p._total = (p._total || 0) + qty;
      if (!needham) return;
      if (!o.location || o.location.id !== needhamLocationId) return; // Needham-only below
      needham.onHand.set(p.handle, (needham.onHand.get(p.handle) || 0) + qty);
      // Per-size detail for zero rows. If a size repeats (multiple levels), keep
      // the sku and add the quantity.
      let vmap = needham.variants.get(p.handle);
      if (!vmap) { vmap = {}; needham.variants.set(p.handle, vmap); }
      const key = vi.size || vi.sku;
      if (key) vmap[key] = { sku: vi.sku || '', quantity: (vmap[key] ? vmap[key].quantity : 0) + qty };
    } else if ('namespace' in o) {
      // A product metafield line. Keep only the custom.* swatch fields; store on
      // the product so buildCatalogFrom can publish current values for diffing.
      if (o.namespace !== 'custom' || !SWATCH_MF_KEYS.has(o.key)) return;
      const p = productsById.get(o.__parentId);
      if (!p) return; // metafield of a non-footwear product
      (p._mf = p._mf || {})[o.key] = o.value;
    } else {
      const p = productsById.get(o.__parentId);
      if (!p) return; // variant of a product neither catalog keeps
      const size = sizeOf(o.selectedOptions);
      // Apparel needs the size on the variant itself: its sizes are words, there
      // is no width axis, and the join back to a feed row is handle plus size.
      p.variants.nodes.push(p._kind === 'apparel' ? { sku: o.sku, price: o.price, size } : { sku: o.sku, price: o.price });
      variantInfo.set(o.id, { productId: o.__parentId, sku: o.sku, size });
    }
  };
  const result = () => {
    const all = [...productsById.values()];
    return {
      raw: all.filter((p) => p._kind === 'footwear'),
      apparelRaw: all.filter((p) => p._kind === 'apparel'),
      needham,
    };
  };
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

// buildCatalog(client, opts) -> { footwear, apparel }, two SEPARATE payloads from
// one pass over the store. Full builds fetch via one bulk operation; a `limit`
// (dev peek) uses the quick paginated path with no Needham detail and no apparel.
//
// They are separate values, not one payload with a flag, and that is the whole
// safety argument for this change: the footwear catalog every staff browser
// fetches keeps exactly the shape and roughly the size it has always had, and
// nothing in the footwear known set can encounter a garment even by accident.
export async function buildCatalog(client, opts = {}) {
  const activeOnly = !!opts.activeOnly;
  const needhamLocationId = opts.needhamLocationId || null;

  let raw, apparelRaw = [], needham;
  if (opts.limit) {
    raw = await fetchAll(client, opts.limit, activeOnly);
    needham = null; // bulk is overkill for a truncated dev peek
  } else {
    ({ raw, apparelRaw, needham } = await fetchCatalogViaBulk(client, activeOnly, needhamLocationId));
  }
  const meta = { activeOnly, needhamLocationId, shop: client.SHOP };
  return {
    footwear: buildCatalogFrom(raw, needham, meta),
    apparel: buildApparelFrom(apparelRaw, needham, meta),
  };
}

// PURE. The apparel payload. Deliberately much smaller than the footwear one:
// apparel has no width axis, no swatch grouping, no cw-group tag and no
// inheritance record, so none of that is computed or carried. What it does carry
// is the join key the apparel tool needs, the article code, plus each product's
// own spelling of its sizes, because the store spells one size several ways and
// an inventory import that does not match the spelling silently does nothing.
export function buildApparelFrom(raw, needham, opts = {}) {
  const products = [];
  const byCode = {};          // article code -> handle, unambiguous only
  const codeOwners = {};      // article code -> [handle, ...], to detect collisions
  const byType = {};
  const byBrand = {};

  for (const n of raw || []) {
    const brand = brandFor(n.vendor).key;
    const codes = articleCodesOf(n);
    const hasNeedham = needham ? needham.onHand.has(n.handle) : false;

    for (const c of codes) (codeOwners[c] = codeOwners[c] || []).push(n.handle);

    byType[n.productType] = (byType[n.productType] || 0) + 1;
    byBrand[brand] = (byBrand[brand] || 0) + 1;

    products.push({
      id: n.id,
      handle: n.handle,
      title: n.title,
      vendor: n.vendor,
      brand,
      productType: n.productType,
      status: n.status,
      updatedAt: n.updatedAt || '',
      image: n.image || '',
      codes,
      // Every size this product carries, in Shopify's own spelling and order.
      sizes: (n.variants?.nodes || []).map((v) => v.size).filter(Boolean),
      skus: (n.variants?.nodes || []).map((v) => v.sku).filter(Boolean),
      price: (n.variants?.nodes?.[0]?.price) || '',
      totalOnHand: (typeof n._total === 'number') ? n._total : null,
      needham: needham ? hasNeedham : null,
      needhamOnHand: needham ? (hasNeedham ? needham.onHand.get(n.handle) : 0) : null,
    });
  }

  // A code claimed by more than one product is not a usable join. The store has a
  // couple, from a duplicated product keeping the original's code, so they are
  // published as ambiguous rather than silently resolving to whichever came first.
  const ambiguousCodes = [];
  for (const [code, handles] of Object.entries(codeOwners)) {
    const uniq = [...new Set(handles)];
    if (uniq.length === 1) byCode[code] = uniq[0];
    else ambiguousCodes.push({ code, handles: uniq });
  }

  return {
    generatedAt: new Date().toISOString(),
    shop: opts.shop || '',
    scope: opts.activeOnly ? 'active' : 'all',
    needhamScoped: !!opts.needhamLocationId,
    counts: {
      products: products.length,
      // Sizes, not SKUs. Most apparel on this store carries no SKU at all (97 of
      // 1,397 products have one, measured 2026-08-05), so counting SKUs made the
      // build log read as though the variants were missing when they were not.
      variants: products.reduce((t, p) => t + p.sizes.length, 0),
      withSku: products.filter((p) => p.skus.length).length,
      codes: Object.keys(byCode).length,
      ambiguousCodes: ambiguousCodes.length,
      byType,
      byBrand,
    },
    products,
    byCode,
    ambiguousCodes,
  };
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

    // Current custom.* swatch metafields, for the tagging panel to diff its
    // computed sibling references against (bulk path sets n._mf; the paged dev
    // path returns n.metafields.nodes). Only the swatch keys are kept.
    const currentMf = n._mf || (n.metafields && n.metafields.nodes
      ? n.metafields.nodes.reduce((a, m) => { if (SWATCH_MF_KEYS.has(m.key)) a[m.key] = m.value; return a; }, {})
      : {});

    products.push({
      id: n.id,
      handle: n.handle,
      title: n.title,
      vendor: n.vendor,
      // Featured image URL, for the Product Library row thumbnails. Bulk sets
      // n.image; the paged dev path returns n.featuredImage.url.
      image: n.image || (n.featuredImage && n.featuredImage.url) || '',
      // Last edit time, for sorting the Library by recently modified.
      updatedAt: n.updatedAt || '',
      // Creation time, so Catalog Tagging can scope a run to products added in
      // the last few days. About 25 bytes per product, roughly 100 KB across the
      // footwear payload, against a 25 MB KV ceiling.
      createdAt: n.createdAt || '',
      // Total on-hand across ALL locations (bulk path only). Lets the Library
      // hide models with no stock anywhere. Undefined on the paged dev path.
      totalOnHand: (typeof n._total === 'number') ? n._total : null,
      brand,
      productType: n.productType,
      status: n.status,
      // Current tags, so the dashboard's Catalog Tagging panel can diff against
      // the computed width/cw-group/gender tags without a fresh Admin scan.
      tags: n.tags || [],
      mf: currentMf,
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
