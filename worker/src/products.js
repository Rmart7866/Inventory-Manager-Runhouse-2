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
export function buildProductSetInput(spec) {
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

// Run productSet for each spec, one at a time (small batches, and one bad spec
// should not sink the rest). Returns a per-product result the UI can report.
export async function createProducts(client, specs) {
  const results = [];
  for (const spec of specs || []) {
    const input = buildProductSetInput(spec);
    try {
      const body = await client.graphql(PRODUCT_SET, { input });
      const r = (body.data && body.data.productSet) || {};
      const errs = r.userErrors || [];
      results.push({
        ok: errs.length === 0 && !!r.product,
        title: spec.title,
        handle: spec.handle || (r.product && r.product.handle) || '',
        product: r.product || null,
        userErrors: errs,
      });
    } catch (err) {
      results.push({ ok: false, title: spec.title, handle: spec.handle || '', userErrors: [{ message: String((err && err.message) || err) }] });
    }
  }
  return results;
}
