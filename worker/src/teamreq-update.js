// Update products this page already BUILT (owner, 2026-11-24: "make it so we
// can change existing products like colours etc").
//
// POST /team-requests/update-products { id, dryRun, searchable, products }
// The products are the same specs Build takes, from the request as it stands
// now. Each is matched to a product THIS PAGE built (rec.build.products) and
// nothing else: by its handle, else by its style when the page built exactly
// one product of that style. Products made by hand or by other tools are
// never touched.
//
// What an update keeps and changes, by owner decision:
//   - keeps the product's handle (URL), title, status (a live product stays
//     live), tags and sales channels;
//   - keeps the ID of every variant that still exists (colour, size and name
//     option unchanged), so carts, orders and reports are not disturbed;
//   - adds new colours and sizes, sets prices, and DELETES the variants of a
//     colour or size taken off (owner: delete, not hide). Past orders keep
//     their line items; team gear is made to order, so no stock is lost;
//   - replaces the photos with fresh mockups when the page sent them.
// dryRun:true (the default) reports exactly that, per product, and writes
// nothing.
//
// House style: no em dashes.

import { createShopifyClient } from './shopify.js';
import { readRec, writeRec, log } from './teamreq.js';
import { planProduct, productSetInputFor, collectionByHandle, existingStoreInfo, lineCost } from './teamreq-build.js';

const PRODUCT_SET = `mutation productSet($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) { product { id handle title status } userErrors { field message } } }`;
const READ = `query($id: ID!) { product(id: $id) { id title handle status tags
  variants(first: 250) { nodes { id price selectedOptions { name value } } } } }`;

const keyOf = (pairs) => ['Color', 'Size', 'Personalization'].map((n) => (pairs.find((p) => p.name === n) || {}).value || '').join('|');

// What changes between the product as it is and the input. Pure.
export function diffProduct(cur, input) {
  const curV = (cur.variants && cur.variants.nodes) || [];
  const opt = (vs, n) => [...new Set(vs.map((v) => ((v.selectedOptions || []).find((o) => o.name === n) || {}).value).filter(Boolean))];
  const newV = input.variants.map((v) => ({ selectedOptions: v.optionValues.map((o) => ({ name: o.optionName, value: o.name })), price: v.price }));
  const cc = opt(curV, 'Color'), nc = opt(newV, 'Color'), cs = opt(curV, 'Size'), ns = opt(newV, 'Size');
  const curByKey = new Map(curV.map((v) => [keyOf(v.selectedOptions), v]));
  const newKeys = new Set(newV.map((v) => keyOf(v.selectedOptions)));
  let repriced = 0;
  for (const v of newV) { const c = curByKey.get(keyOf(v.selectedOptions)); if (c && v.price && Number(c.price) !== Number(v.price)) repriced++; }
  return {
    colorsAdded: nc.filter((x) => !cc.includes(x)),
    colorsRemoved: cc.filter((x) => !nc.includes(x)),
    sizesAdded: ns.filter((x) => !cs.includes(x)),
    sizesRemoved: cs.filter((x) => !ns.includes(x)),
    variantsAdded: newV.filter((v) => !curByKey.has(keyOf(v.selectedOptions))).length,
    variantsRemoved: curV.filter((v) => !newKeys.has(keyOf(v.selectedOptions))).length,
    repriced,
    namesOn: opt(newV, 'Personalization').length > 0,
    namesWere: opt(curV, 'Personalization').length > 0,
  };
}

// The update input: the Build input for the spec, made to keep what the
// product already is (handle, title, status, tags, surviving variant IDs).
export function updateInputFor(plan, cur, opts = {}) {
  const input = productSetInputFor(plan, opts);
  input.id = cur.id;
  input.handle = cur.handle;
  input.title = cur.title;
  input.status = cur.status;
  input.tags = [...new Set([...(cur.tags || []), plan.tag].filter(Boolean))];
  const ids = new Map(((cur.variants && cur.variants.nodes) || []).map((v) => [keyOf(v.selectedOptions), v.id]));
  for (const v of input.variants) {
    const id = ids.get(keyOf(v.optionValues.map((o) => ({ name: o.optionName, value: o.name }))));
    if (id) v.id = id;
  }
  // No fresh mockups sent: leave the product's photos exactly as they are.
  if (!input.files.length) { delete input.files; for (const v of input.variants) delete v.file; }
  return input;
}

export async function handleUpdateProducts(request, env) {
  let b;
  try { b = await request.json(); } catch { b = null; }
  if (!b || !Array.isArray(b.products) || !b.products.length) return { status: 400, body: { error: 'Expected { id, products: [...], dryRun }' } };
  if (b.products.length > 60) return { status: 400, body: { error: 'At most 60 products per update' } };
  const rec = await readRec(env, b.id);
  if (!rec) return { status: 404, body: { error: 'Request not found' } };
  const built = (rec.build && rec.build.products) || [];
  if (!built.length) return { status: 400, body: { error: 'This request has not built any products yet, so there is nothing to update.' } };
  const client = createShopifyClient(env);
  const dry = b.dryRun !== false;

  // The same naming Build used: an existing store's prefix and tag.
  let team = String((rec.work && rec.work.team) || '').trim();
  let tag = String((rec.work && rec.work.tag) || '').trim();
  const updHandle = rec.req && rec.req.mode === 'update' && rec.req.store && rec.req.store.handle;
  if (updHandle) {
    try { const col = await collectionByHandle(client, updHandle); if (col) { const info = existingStoreInfo(col); tag = info.tag || tag; team = info.prefix || team; } } catch { /* keep the request's own */ }
  }

  // Pass 1: each line's product (only ones this page built and still on
  // Shopify) and how far the line is from it.
  const results = new Array(b.products.length), cands = [], alive = new Map(), seen = new Map();
  const exists = async (id) => {
    if (!alive.has(id)) { try { const q = await client.graphql('query($id: ID!) { product(id: $id) { id } }', { id }); alive.set(id, !!(q.data && q.data.product)); } catch { alive.set(id, true); } }
    return alive.get(id);
  };
  for (let i = 0; i < b.products.length; i++) {
    const spec = b.products[i];
    const plan = planProduct(team, tag, spec);
    let same = built.filter((x) => String(x.style).toUpperCase() === String(spec.style).toUpperCase());
    // A store built twice (the first set deleted in between, as Blessed
    // Sacrament Basketball was) records each style twice; only the products
    // still on Shopify count.
    if (same.length > 1) { const keep = []; for (const x of same) if (await exists(x.id)) keep.push(x); same = keep; }
    const target = same.find((x) => x.handle === plan.handle) || (same.length === 1 ? same[0] : null);
    if (!target) {
      results[i] = { style: spec.style, skipped: true, reason: same.length > 1 ? 'This page built more than one ' + spec.style + ', so it cannot tell which to change. Change it in Shopify admin.' : 'Not built by this page yet: Build creates it.' };
      continue;
    }
    let cur = seen.get(target.id);
    if (cur === undefined) {
      try { cur = (await client.graphql(READ, { id: target.id })).data.product; } catch (e) {
        results[i] = { style: spec.style, handle: target.handle, ok: false, errors: ['Could not read it from Shopify: ' + String(e && e.message || e)] }; continue;
      }
      seen.set(target.id, cur);
    }
    if (!cur) { results[i] = { style: spec.style, handle: target.handle, skipped: true, reason: 'It is no longer on Shopify.' }; continue; }
    const input = updateInputFor(plan, cur, { searchable: !!b.searchable });
    const diff = diffProduct(cur, input);
    const vals = { color: [], size: [] };
    for (const v of (cur.variants && cur.variants.nodes) || []) for (const o of v.selectedOptions) { if (o.name === 'Color') vals.color.push(o.value); if (o.name === 'Size') vals.size.push(o.value); }
    cands.push({ i, cur, input, cost: lineCost(plan, vals), row: { style: spec.style, id: cur.id, handle: cur.handle, title: cur.title, status: cur.status, diff, photos: !!input.files } });
  }
  // Pass 2: a product is changed by the ONE line closest to it (ties go to
  // the first). The other lines of that style are new products for Build.
  const best = new Map();
  for (const c of cands) { const o = best.get(c.cur.id); if (!o || c.cost < o.cost) best.set(c.cur.id, c); }
  const go = [];
  for (const c of cands) {
    if (best.get(c.cur.id) === c) { go.push(c); continue; }
    results[c.i] = { style: c.row.style, skipped: true, reason: 'The store\'s one ' + c.row.style + ' is matched to a closer line on this request, so this line is a NEW product: Build creates it, named by its logo codes.' };
  }
  // Pass 3: report, or write.
  for (const c of go) {
    if (dry) { results[c.i] = c.row; continue; }
    try {
      const body = await client.graphql(PRODUCT_SET, { input: c.input });
      const r = (body.data && body.data.productSet) || {};
      const errs = (r.userErrors || []).map((e) => e.message).concat((body.errors || []).map((e) => e.message));
      results[c.i] = errs.length ? { ...c.row, ok: false, errors: errs } : { ...c.row, ok: true };
    } catch (e) {
      results[c.i] = { ...c.row, ok: false, errors: [String(e && e.message || e)] };
    }
  }
  if (!dry) {
    const ok = results.filter((r) => r.ok);
    if (ok.length) {
      log(rec, 'Updated ' + ok.length + ' built product' + (ok.length === 1 ? '' : 's') + ' in Shopify: ' + ok.map((r) => r.style + (r.diff.colorsAdded.length ? ' +' + r.diff.colorsAdded.join('/') : '') + (r.diff.colorsRemoved.length ? ' -' + r.diff.colorsRemoved.join('/') : '')).join(', '));
      await writeRec(env, rec);
    }
  }
  return { body: { dryRun: dry, results, rec: dry ? undefined : rec } };
}
