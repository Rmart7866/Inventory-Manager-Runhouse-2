// teamreq-build.js, The Run House. Turn a team store request into Shopify
// drafts: one smart collection and one product per style.
//
// THE SHAPE IS COPIED FROM THE STORES STAFF ALREADY BUILD BY HAND, read off
// the live store 2026-11-04 (Redbrook Community, Falmouth HS, Keefe Tech,
// Norwell): a smart collection whose single rule is TAG EQUALS "<team tag>",
// products titled "<Team> - <garment> (<STYLE>)", vendor The Run House, the
// team tag, options Size x Color with the colour value naming the logo
// ("Navy w/ Left Chest Logo"), CONTINUE selling because it is made to order,
// and seo.hidden so a team's gear does not surface in site search.
//
// SAFETY, the same floor as Stage 4 and stricter in one place:
//   - DRAFT ONLY. status is always DRAFT and nothing is published to any
//     channel, the collection included. A human publishes.
//   - CREATE ONLY. productSet is create-or-update, so every handle is checked
//     first and an existing one is skipped. Stage 4 fails OPEN if that check
//     errors; this fails CLOSED and builds nothing, because a team store is
//     dozens of products and guessing wrong would overwrite live ones.
//   - DRY RUN FIRST. dryRun:true returns the exact plan and writes nothing.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';
import { readRec, writeRec, log } from './teamreq.js';
import { apparelCategoryFor } from './products.js';

const PRODUCT_SET = `
mutation productSet($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id handle title status }
    userErrors { field message }
  }
}`;

const COLLECTION_CREATE = `
mutation collectionCreate($input: CollectionInput!) {
  collectionCreate(input: $input) {
    collection { id handle title }
    userErrors { field message }
  }
}`;

export function slug(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 200);
}

// The builder's category names to the product types this store uses, which
// is also the key apparelCategoryFor reads. A category with no entry gets no
// type and no taxonomy leaf, which is honest: a wrong category is worse than
// none (see the APPAREL_CATEGORIES note in products.js).
const TYPE_BY_CATEGORY = {
  'Short Sleeve T-Shirts': 'T-Shirts',
  'Long Sleeve T-Shirts': 'Long Sleeves',
  'Hoodies': 'Hoodies',
  'Crewnecks': 'Crewnecks',
  'Quarter Zips': 'Half-Zips',
  'Jackets': 'Jackets',
  'Bottoms': 'Pants',
  'Headwear': 'Headwear',
};
export function typeFor(category) { return TYPE_BY_CATEGORY[category] || ''; }

// One planned product from one page spec. Pure, so the test can pin it.
// spec = { style, name, category, sizes:[...], price, colors:[{name, label, image}] }
export function planProduct(team, tag, spec) {
  const title = (team + ' - ' + spec.name + ' (' + spec.style + ')').slice(0, 250);
  const handle = slug(team + ' ' + spec.name + ' ' + spec.style);
  const sizes = (spec.sizes && spec.sizes.length ? spec.sizes : ['One Size']).map(String);
  const colors = (spec.colors || []).map((c) => ({ value: String(c.label || c.name).slice(0, 250), image: c.image || null, name: String(c.name) }));
  const productType = typeFor(spec.category);
  const price = Number(spec.price) > 0 ? Number(spec.price).toFixed(2) : null;
  return { style: spec.style, title, handle, productType, sizes, colors, price, tag, variants: sizes.length * colors.length };
}

export function productSetInputFor(plan) {
  const files = [];
  const fileFor = {};
  for (const c of plan.colors) {
    if (c.image && !fileFor[c.image]) {
      fileFor[c.image] = { originalSource: c.image, alt: plan.title + ' in ' + c.name, contentType: 'IMAGE' };
      files.push(fileFor[c.image]);
    }
  }
  const variants = [];
  for (const c of plan.colors) {
    for (const s of plan.sizes) {
      const v = {
        optionValues: [{ optionName: 'Size', name: s }, { optionName: 'Color', name: c.value }],
        inventoryPolicy: 'CONTINUE',   // made to order, as every team store item is
        inventoryItem: { tracked: true },
      };
      if (plan.price) v.price = plan.price;
      if (c.image) v.file = fileFor[c.image];
      variants.push(v);
    }
  }
  const cat = apparelCategoryFor(plan.productType);
  return {
    title: plan.title,
    handle: plan.handle,
    vendor: 'The Run House',
    productType: plan.productType || undefined,
    ...(cat ? { category: cat } : {}),
    status: 'DRAFT',
    tags: [plan.tag],
    productOptions: [
      { name: 'Size', values: plan.sizes.map((n) => ({ name: n })) },
      { name: 'Color', values: plan.colors.map((c) => ({ name: c.value })) },
    ],
    variants,
    files,
    metafields: [{ namespace: 'seo', key: 'hidden', type: 'number_integer', value: '1' }],
  };
}

async function existingProductHandles(client, handles) {
  const found = new Set();
  for (let i = 0; i < handles.length; i += 40) {
    const q = handles.slice(i, i + 40).map((h) => 'handle:' + JSON.stringify(h)).join(' OR ');
    const body = await client.graphql('query($q:String){ products(first:250, query:$q){ nodes{ handle } } }', { q });
    for (const n of body.data.products.nodes) found.add(n.handle);
  }
  return found;
}

async function collectionExists(client, handle) {
  const body = await client.graphql('query($h:String!){ collectionByHandle(handle:$h){ id handle } }', { h: handle });
  return body.data.collectionByHandle;
}

export async function handleBuild(request, env) {
  let b;
  try { b = await request.json(); } catch { b = null; }
  if (!b || !Array.isArray(b.products)) return { status: 400, body: { error: 'Expected { id, products: [...], dryRun }' } };
  if (b.products.length === 0) return { status: 400, body: { error: 'Nothing to build' } };
  if (b.products.length > 60) return { status: 400, body: { error: 'At most 60 products per build' } };
  const rec = await readRec(env, b.id);
  if (!rec) return { status: 404, body: { error: 'Request not found' } };

  const team = String((rec.work && rec.work.team) || '').trim();
  const tag = String((rec.work && rec.work.tag) || (team + ' Team Store')).trim();
  if (!team || !tag) return { status: 400, body: { error: 'The request needs a team name and a collection tag first' } };

  const plans = b.products.map((p) => planProduct(team, tag, p));
  const bad = plans.filter((p) => !p.colors.length);
  if (bad.length) return { status: 400, body: { error: 'Every product needs at least one colour: ' + bad.map((p) => p.style).join(', ') } };
  const tooBig = plans.filter((p) => p.variants > 2000);
  if (tooBig.length) return { status: 400, body: { error: 'Too many variants on ' + tooBig.map((p) => p.style).join(', ') } };

  const collection = { title: (b.collectionTitle || team + ' Team Store').slice(0, 250), handle: slug(b.collectionHandle || team + ' team store'), tag };

  // Create-only, fail CLOSED. If we cannot tell what exists, build nothing.
  const client = createShopifyClient(env);
  let existing, colExisting;
  try {
    existing = await existingProductHandles(client, plans.map((p) => p.handle));
    colExisting = await collectionExists(client, collection.handle);
  } catch (e) {
    return { status: 502, body: { error: 'Could not check which handles already exist, so nothing was built. ' + String(e && e.message || e) } };
  }

  const plan = {
    collection: { ...collection, exists: !!colExisting },
    products: plans.map((p) => ({ style: p.style, title: p.title, handle: p.handle, productType: p.productType, sizes: p.sizes, colors: p.colors.map((c) => c.value), images: p.colors.filter((c) => c.image).length, price: p.price, variants: p.variants, exists: existing.has(p.handle) })),
  };
  if (b.dryRun !== false) return { body: { dryRun: true, plan } };

  const results = [];
  for (const p of plans) {
    if (existing.has(p.handle)) { results.push({ style: p.style, handle: p.handle, skipped: true, reason: 'A product with this handle already exists, so it was left alone.' }); continue; }
    try {
      const body = await client.graphql(PRODUCT_SET, { input: productSetInputFor(p) });
      const r = (body.data && body.data.productSet) || {};
      const errs = r.userErrors || [];
      results.push(errs.length || !r.product
        ? { style: p.style, handle: p.handle, ok: false, errors: errs.map((e) => e.message) }
        : { style: p.style, handle: r.product.handle, id: r.product.id, title: r.product.title, ok: true });
    } catch (e) {
      results.push({ style: p.style, handle: p.handle, ok: false, errors: [String(e && e.message || e)] });
    }
  }

  let col = null;
  if (colExisting) {
    col = { handle: colExisting.handle, id: colExisting.id, skipped: true, reason: 'A collection with this handle already exists, so it was left alone. Products carry the tag ' + tag + '.' };
  } else {
    try {
      const body = await client.graphql(COLLECTION_CREATE, { input: {
        title: collection.title,
        handle: collection.handle,
        ruleSet: { appliedDisjunctively: false, rules: [{ column: 'TAG', relation: 'EQUALS', condition: tag }] },
      } });
      const r = body.data.collectionCreate;
      col = r.userErrors.length ? { ok: false, errors: r.userErrors.map((e) => e.message) } : { ok: true, id: r.collection.id, handle: r.collection.handle, title: r.collection.title };
    } catch (e) {
      col = { ok: false, errors: [String(e && e.message || e)] };
    }
  }

  const made = results.filter((r) => r.ok);
  rec.build = {
    at: new Date().toISOString(),
    collection: col,
    products: (rec.build && rec.build.products || []).concat(made.map((r) => ({ style: r.style, id: r.id, handle: r.handle, title: r.title }))),
  };
  if (rec.status === 'new') rec.status = 'progress';
  log(rec, 'Built ' + made.length + ' draft product' + (made.length === 1 ? '' : 's') + (col && col.ok ? ' and the collection ' + col.handle : ''));
  await writeRec(env, rec);
  return { body: { ok: true, collection: col, results, rec } };
}
