// tags.js, catalog tag/type WRITE path. The Run House.
//
// Applies width, cw-group (swatch), and gender tag changes, plus the gendered
// product type, that the browser's Catalog Tagging panel computed from the
// cached catalog. Tags are edited additively/subtractively (tagsAdd / tagsRemove,
// never a wholesale replace), so a tag this plan does not mention is left alone.
//
// THIS DELIBERATELY REVERSES the old "the Worker must only COMPUTE tags" rule.
// The owner asked for catalog tagging from the dashboard, so the compute stays in
// the browser (off the cached catalog) and this executes the plan behind the same
// write gate as /inventory: forWrite (auth.js) + the X-Write-Secret. It is
// chunked by the client, so no single request writes the whole catalog.
//
// House style: no em dashes. Use commas, periods, or the word "to".

const TAGS_ADD = `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`;
const TAGS_REMOVE = `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`;
const TYPE_SET = `mutation($input: ProductInput!) { productUpdate(input: $input) { product { id } userErrors { field message } } }`;

// Apply one chunk of changes. Each change:
//   { id, remove?: [tag,...], add?: [tag,...], productType?: "Men's Shoes" }
// Order matters: remove stale tags first, then add, then set the type, so a
// remove can never strip a tag this same change is adding.
export async function applyTagChanges(client, changes) {
  const results = [];
  for (const c of changes || []) {
    if (!c || !c.id) { results.push({ id: c && c.id, ok: false, errors: ['missing product id'] }); continue; }
    const errs = [];
    try {
      if (Array.isArray(c.remove) && c.remove.length) {
        const r = await client.graphql(TAGS_REMOVE, { id: c.id, tags: c.remove });
        (r.data.tagsRemove.userErrors || []).forEach((e) => errs.push('remove: ' + e.message));
      }
      if (Array.isArray(c.add) && c.add.length) {
        const r = await client.graphql(TAGS_ADD, { id: c.id, tags: c.add });
        (r.data.tagsAdd.userErrors || []).forEach((e) => errs.push('add: ' + e.message));
      }
      if (c.productType) {
        const r = await client.graphql(TYPE_SET, { input: { id: c.id, productType: c.productType } });
        (r.data.productUpdate.userErrors || []).forEach((e) => errs.push('type: ' + e.message));
      }
      results.push({ id: c.id, ok: errs.length === 0, errors: errs });
    } catch (e) {
      results.push({ id: c.id, ok: false, errors: [String((e && e.message) || e)] });
    }
  }
  const ok = results.filter((r) => r.ok).length;
  return { ok, failed: results.length - ok, total: results.length, results };
}

// ===== Swatch sibling metafields (Phase 2) =====
// The browser computes the metafieldsSet inputs from the cached catalog (using
// the same groupProducts logic ported to catalog-tags.js) and sends them here in
// chunks. Each input: { ownerId, namespace, key, type, value }. metafieldsSet
// accepts up to 25 per call, so batch internally.
const METAFIELDS_SET = `mutation($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`;

export async function applyMetafields(client, inputs) {
  const list = inputs || [];
  const errors = [];
  let set = 0;
  for (let i = 0; i < list.length; i += 25) {
    const batch = list.slice(i, i + 25);
    try {
      const r = await client.graphql(METAFIELDS_SET, { mf: batch });
      const ue = (r.data && r.data.metafieldsSet && r.data.metafieldsSet.userErrors) || [];
      ue.forEach((e) => errors.push(e.message));
      set += batch.length - ue.length;
    } catch (e) { errors.push(String((e && e.message) || e)); }
  }
  return { set, total: list.length, failed: errors.length, errors };
}
