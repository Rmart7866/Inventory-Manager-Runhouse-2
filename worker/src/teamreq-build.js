// teamreq-build.js, The Run House. Turn a team store request into Shopify
// drafts: one smart collection and one product per style.
//
// THE SHAPE MATCHES THE BACK OFFICE AUTOMATION THAT ALSO BUILDS STORES
// (Dan's team store runbook, 2026-11-05) and the stores built by hand: a
// smart collection named for the team whose single rule is TAG EQUALS the
// team slug, products titled "<Team> - <garment> (<STYLE>)", vendor The Run
// House, options Color then Size with sizes spelled out, colour values
// naming the logo code ("Jet Black (D055 (FC))"), CONTINUE selling because
// it is made to order, and seo.hidden unless it is public race merch.
// Matching matters beyond looks: each builder's duplicate check finds the
// other's store only if the tag and handles agree.
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

// A banner url the collection image may use: https on Shopify's own CDN
// only (cart uploads come back protocol relative, "//cdn.shopify.com/...").
// Anything else is '' so Build never hands Shopify an arbitrary address.
export function bannerUrl(u) {
  let s = String(u || '').trim();
  if (s.startsWith('//')) s = 'https:' + s;
  try { const x = new URL(s); return x.protocol === 'https:' && x.hostname === 'cdn.shopify.com' ? x.href : ''; } catch { return ''; }
}

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

// SIZES ARE SPELLED OUT, the way the stores staff build by hand spell them
// (XSmall, Small, ... 2XLarge). The catalog gives the short form.
const SIZE_WORDS = { XXS: 'XXSmall', XS: 'XSmall', S: 'Small', M: 'Medium', L: 'Large', XL: 'XLarge' };
export function spellSize(s) {
  const t = String(s).trim();
  if (SIZE_WORDS[t]) return SIZE_WORDS[t];
  let m = t.match(/^(\d)XL$/);
  if (m) return m[1] + 'XLarge';
  m = t.match(/^(L|XL|\dXL)T$/);
  if (m) return spellSize(m[1]) + ' Tall';
  return t;
}

// One planned product from one page spec. Pure, so the test can pin it.
// spec = { style, name, category, sizes:[...], price, colors:[{name, label, image, back}] }
// The title, handle, options and colour values follow the conventions of the
// back office automation that also builds team stores (Color then Size,
// spelled sizes, "Jet Black (D055 (FC))"), so a store built here and one
// built there look the same, and each one's duplicate check sees the other's.
export function planProduct(team, tag, spec) {
  const title = (team + ' - ' + spec.name + ' (' + spec.style + ')').slice(0, 250);
  const handle = slug(team + ' ' + spec.name + ' ' + spec.style);
  const sizes = (spec.sizes && spec.sizes.length ? spec.sizes : ['One Size']).map(spellSize);
  const colors = (spec.colors || []).map((c) => ({ value: String(c.label || c.name).slice(0, 250), image: c.image || null, back: c.back || null, name: String(c.name) }));
  const productType = typeFor(spec.category);
  const price = Number(spec.price) > 0 ? Number(spec.price).toFixed(2) : null;
  return { style: spec.style, title, handle, productType, sizes, colors, price, tag, variants: sizes.length * colors.length };
}

export function productSetInputFor(plan, opts = {}) {
  const files = [];
  const fileFor = {};
  const addFile = (url, alt) => {
    if (url && !fileFor[url]) { fileFor[url] = { originalSource: url, alt, contentType: 'IMAGE' }; files.push(fileFor[url]); }
  };
  // Each colour's mockup, front then back, in that order.
  for (const c of plan.colors) {
    addFile(c.image, plan.title + ' in ' + c.name);
    addFile(c.back, plan.title + ' in ' + c.name + ', back');
  }
  const variants = [];
  for (const c of plan.colors) {
    for (const s of plan.sizes) {
      const v = {
        optionValues: [{ optionName: 'Color', name: c.value }, { optionName: 'Size', name: s }],
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
      { name: 'Color', values: plan.colors.map((c) => ({ name: c.value })) },
      { name: 'Size', values: plan.sizes.map((n) => ({ name: n })) },
    ],
    variants,
    files,
    // Site search follows the "Keep in site search" box on the Build tab,
    // which is ticked by default; unticked, the product is hidden.
    ...(opts.searchable ? {} : { metafields: [{ namespace: 'seo', key: 'hidden', type: 'number_integer', value: '1' }] }),
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

async function collectionByHandle(client, handle) {
  const body = await client.graphql(`query($h:String!){ collectionByHandle(handle:$h){ id handle title
    ruleSet{ rules{ column relation condition } }
    products(first:250){ nodes{ title } } } }`, { h: handle });
  return body.data.collectionByHandle;
}

// "Add to my existing store": the store already exists, so its tag is what
// puts new products in it, its naming is what they copy, and a style it
// already carries is skipped. Pure, so the test can drive it.
export function existingStoreInfo(col) {
  const rule = ((col && col.ruleSet && col.ruleSet.rules) || []).find((r) => r.column === 'TAG' && r.relation === 'EQUALS');
  const titles = ((col && col.products && col.products.nodes) || []).map((n) => n.title);
  const withPrefix = titles.find((t) => t.indexOf(' - ') > 0);
  const styles = new Set();
  for (const t of titles) { const m = t.match(/\(([A-Za-z0-9]+)\)\s*$/); if (m) styles.add(m[1].toUpperCase()); }
  return { tag: rule ? rule.condition : null, prefix: withPrefix ? withPrefix.split(' - ')[0] : (col && col.title) || '', styles };
}

export async function handleBuild(request, env) {
  let b;
  try { b = await request.json(); } catch { b = null; }
  if (!b || !Array.isArray(b.products)) return { status: 400, body: { error: 'Expected { id, products: [...], dryRun }' } };
  if (b.products.length === 0) return { status: 400, body: { error: 'Nothing to build' } };
  if (b.products.length > 60) return { status: 400, body: { error: 'At most 60 products per build' } };
  const rec = await readRec(env, b.id);
  if (!rec) return { status: 404, body: { error: 'Request not found' } };
  const client = createShopifyClient(env);

  // ADD TO AN EXISTING STORE: no new collection; its tag and its naming.
  const updHandle = rec.req && rec.req.mode === 'update' && rec.req.store && rec.req.store.handle;
  let team = String((rec.work && rec.work.team) || '').trim();
  let tag = String((rec.work && rec.work.tag) || slug(team)).trim();
  let carried = new Set(), update = null;
  if (updHandle) {
    let col;
    try { col = await collectionByHandle(client, updHandle); } catch (e) {
      return { status: 502, body: { error: 'Could not read the existing store, so nothing was built. ' + String(e && e.message || e) } };
    }
    if (!col) return { status: 400, body: { error: 'The store ' + updHandle + ' was not found on Shopify.' } };
    const info = existingStoreInfo(col);
    if (!info.tag) return { status: 400, body: { error: 'The store ' + col.title + ' has no TAG rule, so new products could not be put in it. Add them by hand.' } };
    tag = info.tag; team = info.prefix || team; carried = info.styles;
    update = { handle: col.handle, title: col.title, id: col.id };
  }
  if (!team || !tag) return { status: 400, body: { error: 'The request needs a team name and a collection tag first' } };

  const all = b.products.map((p) => planProduct(team, tag, p));
  const plans = all.filter((p) => !carried.has(String(p.style).toUpperCase()));
  const alreadyIn = all.filter((p) => carried.has(String(p.style).toUpperCase())).map((p) => p.style);
  if (!plans.length) return { status: 400, body: { error: 'The store already carries every style on this request: ' + alreadyIn.join(', ') } };
  const bad = plans.filter((p) => !p.colors.length);
  if (bad.length) return { status: 400, body: { error: 'Every product needs at least one colour: ' + bad.map((p) => p.style).join(', ') } };
  const tooBig = plans.filter((p) => p.variants > 2000);
  if (tooBig.length) return { status: 400, body: { error: 'Too many variants on ' + tooBig.map((p) => p.style).join(', ') } };

  // The collection is named for the team, as the hand built stores are.
  const collection = update
    ? { title: update.title, handle: update.handle, tag, existing: true }
    : { title: (b.collectionTitle || team).slice(0, 250), handle: slug(b.collectionHandle || team), tag };
  const searchable = !!b.searchable;
  // The customer's banner becomes the collection image, NEW stores only: an
  // existing store's image is somebody's earlier decision and is never
  // replaced from here. Only a Shopify CDN file is accepted, which is the
  // only place the builder's upload (a cart line item property) puts one.
  const banner = update ? '' : bannerUrl((rec.work && rec.work.banner) || (rec.req && rec.req.banner_file));
  if (banner) collection.banner = banner;

  // Create-only, fail CLOSED. If we cannot tell what exists, build nothing.
  let existing, colExisting = null;
  try {
    existing = await existingProductHandles(client, plans.map((p) => p.handle));
    if (!update) colExisting = await collectionByHandle(client, collection.handle);
  } catch (e) {
    return { status: 502, body: { error: 'Could not check which handles already exist, so nothing was built. ' + String(e && e.message || e) } };
  }

  const plan = {
    collection: { ...collection, exists: !!colExisting || !!update },
    update: !!update, alreadyIn, searchable,
    products: plans.map((p) => ({ style: p.style, title: p.title, handle: p.handle, productType: p.productType, sizes: p.sizes, colors: p.colors.map((c) => c.value), images: p.colors.reduce((n, c) => n + (c.image ? 1 : 0) + (c.back ? 1 : 0), 0), price: p.price, variants: p.variants, exists: existing.has(p.handle) })),
  };
  if (b.dryRun !== false) return { body: { dryRun: true, plan } };

  const results = [];
  for (const p of plans) {
    if (existing.has(p.handle)) { results.push({ style: p.style, handle: p.handle, skipped: true, reason: 'A product with this handle already exists, so it was left alone.' }); continue; }
    try {
      const body = await client.graphql(PRODUCT_SET, { input: productSetInputFor(p, { searchable }) });
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
  if (update) {
    col = { handle: update.handle, id: update.id, title: update.title, skipped: true, reason: 'Added to the existing store ' + update.title + ' through its tag ' + tag + '.' };
  } else if (colExisting) {
    col = { handle: colExisting.handle, id: colExisting.id, skipped: true, reason: 'A collection with this handle already exists, so it was left alone. Products carry the tag ' + tag + '.' };
  } else {
    const input = {
      title: collection.title,
      handle: collection.handle,
      ruleSet: { appliedDisjunctively: false, rules: [{ column: 'TAG', relation: 'EQUALS', condition: tag }] },
    };
    const create = async (withBanner) => {
      const body = await client.graphql(COLLECTION_CREATE, { input: withBanner ? { ...input, image: { src: banner, altText: collection.title } } : input });
      return body.data.collectionCreate;
    };
    try {
      let r = await create(!!banner);
      let bannerError = null;
      // A banner Shopify will not take must not cost the store its
      // collection: create it without the image and say why.
      if (banner && r.userErrors.length) {
        bannerError = r.userErrors.map((e) => e.message).join('; ');
        r = await create(false);
      }
      col = r.userErrors.length ? { ok: false, errors: r.userErrors.map((e) => e.message) } : { ok: true, id: r.collection.id, handle: r.collection.handle, title: r.collection.title, banner: banner && !bannerError ? banner : null, bannerError };
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
  log(rec, 'Built ' + made.length + ' draft product' + (made.length === 1 ? '' : 's') + (update ? ' into ' + update.title : col && col.ok ? ' and the collection ' + col.handle : '') + (alreadyIn.length ? ', skipped ' + alreadyIn.join(', ') + ' (already in the store)' : ''));
  await writeRec(env, rec);
  return { body: { ok: true, collection: col, results, alreadyIn, rec } };
}
