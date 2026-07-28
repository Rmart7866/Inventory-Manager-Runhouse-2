// product-edit.js, Product Library detail + edit path. The Run House.
//
// Two jobs, both for a SINGLE product the user opened in the Library:
//   1. Read its full detail (description, image, variants + prices), which the
//      cached catalog does not carry, so the Library can lazy-load it on open.
//   2. Apply edits: description (productUpdate) and variant prices
//      (productVariantsBulkUpdate). Tags are handled by tags.js, not here.
//
// Same doctrine as tags.js: the browser drives, this executes behind the write
// gate (forWrite in auth.js + the X-Write-Secret header). Nothing here deletes.
// An edit overwrites one field of one product the user explicitly changed, so
// there is no fan-out and no batching risk. Reads are gated by the catalog
// bearer only (description and price are already public on the storefront).
//
// House style: no em dashes. Use commas, periods, or the word "to".

const PRODUCT_DETAIL = `
query($id: ID!) {
  product(id: $id) {
    id handle title status descriptionHtml productType vendor tags
    featuredImage { url altText }
    variants(first: 100) { nodes { id title sku price } }
  }
}`;

// Full detail for one product id. Returns null when the id does not resolve.
export async function fetchProductDetail(client, id) {
  const body = await client.graphql(PRODUCT_DETAIL, { id });
  const p = body.data && body.data.product;
  if (!p) return null;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    status: p.status,
    descriptionHtml: p.descriptionHtml || '',
    productType: p.productType || '',
    vendor: p.vendor || '',
    tags: p.tags || [],
    image: p.featuredImage ? { url: p.featuredImage.url, alt: p.featuredImage.altText || '' } : null,
    variants: ((p.variants && p.variants.nodes) || []).map((v) => ({
      id: v.id, title: v.title, sku: v.sku || '', price: v.price,
    })),
  };
}

const PRODUCT_UPDATE = `
mutation($input: ProductInput!) {
  productUpdate(input: $input) { product { id } userErrors { field message } }
}`;

// Update product-level fields of an EXISTING product. Only the fields present in
// the call are sent, so a description edit never disturbs the product type and
// vice versa. Never changes status here (publishing stays a human action in
// admin), and tags go through tags.js so they stay add/remove, not a replace.
export async function updateProduct(client, { id, descriptionHtml, productType }) {
  if (!id) return { ok: false, errors: ['missing product id'] };
  const input = { id };
  if (descriptionHtml != null) input.descriptionHtml = String(descriptionHtml);
  if (productType != null && productType !== '') input.productType = String(productType);
  if (Object.keys(input).length === 1) return { ok: true, errors: [], noop: true };
  const r = await client.graphql(PRODUCT_UPDATE, { input });
  const ue = (r.data && r.data.productUpdate && r.data.productUpdate.userErrors) || [];
  return { ok: ue.length === 0, errors: ue.map((e) => e.message) };
}

const VARIANTS_UPDATE = `
mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    userErrors { field message }
  }
}`;

// Set variant prices for one product. variants: [{ id, price }]. Only entries
// with both an id and a price are sent, so a partial payload cannot blank a
// price. Bulk-updates in one call (Shopify allows up to 250; the route caps the
// request well below that).
export async function updatePrices(client, { productId, variants }) {
  if (!productId || !Array.isArray(variants) || !variants.length) {
    return { ok: false, errors: ['missing productId or variants'] };
  }
  const clean = variants
    .filter((v) => v && v.id && v.price != null && String(v.price) !== '')
    .map((v) => ({ id: v.id, price: String(v.price) }));
  if (!clean.length) return { ok: false, errors: ['no valid variant prices'] };
  const r = await client.graphql(VARIANTS_UPDATE, { productId, variants: clean });
  const ue = (r.data && r.data.productVariantsBulkUpdate && r.data.productVariantsBulkUpdate.userErrors) || [];
  return { ok: ue.length === 0, updated: clean.length, errors: ue.map((e) => e.message) };
}
