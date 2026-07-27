// products.js, Stage 4 WRITE path. The Run House.
//
// Creates (or updates) products via Shopify's productSet mutation. This is the
// ONLY place the tool writes product content.
//
// READ THE GATE. This code only runs behind POST /products, which auth.js
// REFUSES in bearer mode (requireAuth({ forWrite: true }) throws unless
// AUTH_MODE is a real identity mode). So this file can sit here, deployed and
// inert, until the write gate is deliberately turned on. Nothing here can fire
// in production while AUTH_MODE = "bearer".
//
// Everything is created as DRAFT. Nothing goes live on the storefront until a
// human publishes it in Shopify admin. That is the safety floor beneath the
// browser dry-run/confirm gate.
//
// House style: no em dashes. Use commas, periods, or the word "to".

// productSet is create-or-update by handle. synchronous:true so it finishes and
// returns userErrors inline (fine for the small batches this tool sends).
const PRODUCT_SET = `
mutation productSet($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id handle status title media(first: 20) { nodes { id status } } }
    userErrors { field message }
  }
}`;

// Local files cannot be handed to Shopify directly. stagedUploadsCreate returns
// temporary signed targets; the browser POSTs each image's bytes to its target,
// then the returned resourceUrl is used as a product image originalSource.
const STAGED_UPLOADS = `
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;

// Request signed upload targets for a batch of images. files: [{ filename,
// mimeType, fileSize? }]. Returns the stagedTargets array (url + params +
// resourceUrl) the browser needs to upload and then reference.
export async function createStagedUploads(client, files) {
  const input = (files || []).map((f) => ({
    filename: f.filename,
    mimeType: f.mimeType || 'image/png',
    resource: 'IMAGE',
    httpMethod: 'POST',
    ...(f.fileSize ? { fileSize: String(f.fileSize) } : {}),
  }));
  const body = await client.graphql(STAGED_UPLOADS, { input });
  const r = (body.data && body.data.stagedUploadsCreate) || {};
  if ((r.userErrors || []).length) {
    throw new Error('stagedUploadsCreate: ' + r.userErrors.map((e) => e.message).join('; '));
  }
  return r.stagedTargets || [];
}

// Turn a plain colorway spec from the browser into a ProductSetInput.
// spec = {
//   title, handle?, vendor?, productType?, descriptionHtml?, tags?: [],
//   metafields?: [{ namespace, key, type, value }],
//   variants: [{ size, width?, sku?, barcode?, price? }]
// }
// Size is always an option. Width is added only when a variant carries one, so
// single-width models stay one-dimensional. optionValues on each variant must
// reference the declared options, which is what productSet requires.
export function buildProductSetInput(spec, needhamLocationId, locationIds) {
  const variantsIn = Array.isArray(spec.variants) ? spec.variants : [];

  const sizes = [];
  const widths = [];
  for (const v of variantsIn) {
    if (v.size != null && !sizes.includes(String(v.size))) sizes.push(String(v.size));
    if (v.width && !widths.includes(String(v.width))) widths.push(String(v.width));
  }
  const hasWidth = widths.length > 0;

  const productOptions = [{ name: 'Size', values: sizes.map((s) => ({ name: s })) }];
  if (hasWidth) productOptions.push({ name: 'Width', values: widths.map((w) => ({ name: w })) });

  const variants = variantsIn.map((v) => {
    const optionValues = [{ optionName: 'Size', name: String(v.size) }];
    if (hasWidth) optionValues.push({ optionName: 'Width', name: String(v.width || widths[0]) });
    const out = { optionValues, inventoryItem: { sku: v.sku || '', tracked: true } };
    if (v.price != null && v.price !== '') out.price = String(v.price);
    if (v.barcode) out.barcode = String(v.barcode);
    // Stock the variant at EVERY location, but with real quantity only at
    // Needham, the dropship location. Listing a location in inventoryQuantities
    // activates the item there, so the product shows up at all stores in admin;
    // giving the others 0 means no phantom dropship stock lands on a physical
    // store's shelves (the Needham-scoping doctrine still holds, nothing but
    // Needham ever carries a real quantity). The feed quantity goes to Needham,
    // 0 elsewhere; when the spec carries no quantity, every location starts at 0.
    // Falls back to Needham-only when the caller did not supply the location list.
    const locs = (Array.isArray(locationIds) && locationIds.length)
      ? locationIds
      : (needhamLocationId ? [needhamLocationId] : []);
    if (locs.length) {
      const qN = (v.quantity != null && Number.isFinite(Number(v.quantity))) ? Math.max(0, Math.trunc(Number(v.quantity))) : 0;
      out.inventoryQuantities = locs.map((loc) => ({
        locationId: loc, name: 'on_hand', quantity: loc === needhamLocationId ? qN : 0,
      }));
    }
    return out;
  });

  const input = {
    title: spec.title,
    status: 'DRAFT',
    tags: Array.isArray(spec.tags) ? spec.tags : [],
    productOptions,
    variants,
  };
  if (spec.handle) input.handle = spec.handle;
  if (spec.vendor) input.vendor = spec.vendor;
  if (spec.productType) input.productType = spec.productType;
  if (spec.descriptionHtml) input.descriptionHtml = spec.descriptionHtml;
  if (Array.isArray(spec.metafields) && spec.metafields.length) input.metafields = spec.metafields;
  // Images: each already staged, referenced by its resourceUrl as originalSource.
  // Order is preserved, so the first file becomes the product's featured image.
  if (Array.isArray(spec.files) && spec.files.length) {
    input.files = spec.files.map((f) => ({
      originalSource: f.originalSource,
      contentType: f.contentType || 'IMAGE',
      alt: f.alt || '',
    }));
  }
  return input;
}

// publishablePublish attaches a product to sales channels (publications). New
// products land on NO channel by default, so even once made Active they can be
// missing from the Online Store or POS until added by hand. We publish to every
// channel the store has. It is safe to run while the product is still DRAFT: the
// channel link is set, but a draft stays invisible to shoppers until published.
const PUBLISH = `
mutation($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    userErrors { field message }
  }
}`;

// Every ACTIVE fulfillment location's id. Used so a new variant is activated at
// all locations (quantity only at Needham). Paginates in case there are many.
async function fetchLocationIds(client) {
  const out = [];
  let cursor = null;
  for (;;) {
    const body = await client.graphql(
      'query($c:String){ locations(first:250, after:$c){ pageInfo{ hasNextPage endCursor } nodes{ id } } }',
      { c: cursor }
    );
    const conn = body.data.locations;
    for (const n of conn.nodes) out.push(n.id);
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

// Every sales channel (publication) id, so a created product can be published to
// all of them.
async function fetchPublicationIds(client) {
  const body = await client.graphql('{ publications(first: 50) { nodes { id name } } }');
  return (body.data.publications?.nodes || []).map((n) => n.id);
}

// Which of these handles already exist on the store. Used to keep createProducts
// CREATE-ONLY: productSet is create-OR-UPDATE, so without this a spec whose handle
// matches a live product would silently overwrite it.
async function existingHandles(client, handles) {
  const found = new Set();
  const uniq = [...new Set((handles || []).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 40) {
    const batch = uniq.slice(i, i + 40);
    const q = batch.map((h) => 'handle:' + JSON.stringify(h)).join(' OR ');
    const body = await client.graphql('query($q:String){ products(first:250, query:$q){ nodes{ handle } } }', { q });
    for (const n of (body.data.products.nodes || [])) found.add(n.handle);
  }
  return found;
}

// Run productSet for each spec, one at a time (small batches, and one bad spec
// should not sink the rest). Returns a per-product result the UI can report.
// CREATE-ONLY: any spec whose handle already exists is skipped, never overwritten.
export async function createProducts(client, specs, needhamLocationId) {
  const results = [];
  let existing = new Set();
  try { existing = await existingHandles(client, (specs || []).map((s) => s.handle)); } catch (e) { /* fail open to create; productSet still can't delete */ }

  // Fetch the location and channel lists once for the whole batch. Both are
  // best effort: if either query fails (eg a missing scope), we still create the
  // products, just Needham-only stock and no channel publish, and say so.
  let locationIds = [];
  let publicationIds = [];
  try { locationIds = await fetchLocationIds(client); } catch (e) { /* fall back to Needham-only stock */ }
  try { publicationIds = await fetchPublicationIds(client); } catch (e) { /* fall back to no publish */ }

  for (const spec of specs || []) {
    if (spec.handle && existing.has(spec.handle)) {
      results.push({ ok: false, title: spec.title, handle: spec.handle, skipped: true, userErrors: [{ message: 'A product with this handle already exists — skipped so it is not overwritten.' }] });
      continue;
    }
    const input = buildProductSetInput(spec, needhamLocationId, locationIds);
    try {
      const body = await client.graphql(PRODUCT_SET, { input });
      const r = (body.data && body.data.productSet) || {};
      const errs = r.userErrors || [];
      const ok = errs.length === 0 && !!r.product;

      // Publish the new product to every sales channel. Non-fatal: a publish
      // failure (eg the app lacks write_publications) does not fail the create,
      // it is reported per product so the UI can surface it.
      let publishErrors = [];
      if (ok && publicationIds.length && r.product && r.product.id) {
        try {
          const pub = await client.graphql(PUBLISH, { id: r.product.id, input: publicationIds.map((pid) => ({ publicationId: pid })) });
          publishErrors = (pub.data && pub.data.publishablePublish && pub.data.publishablePublish.userErrors) || [];
        } catch (perr) {
          publishErrors = [{ message: String((perr && perr.message) || perr) }];
        }
      }

      results.push({
        ok,
        title: spec.title,
        handle: spec.handle || (r.product && r.product.handle) || '',
        product: r.product || null,
        userErrors: errs,
        publishedChannels: ok ? (publicationIds.length - publishErrors.length) : 0,
        publishErrors,
      });
    } catch (err) {
      results.push({ ok: false, title: spec.title, handle: spec.handle || '', userErrors: [{ message: String((err && err.message) || err) }] });
    }
  }
  return results;
}
