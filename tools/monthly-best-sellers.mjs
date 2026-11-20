// monthly-best-sellers.mjs, The Run House.
//
// The homepage "Best sellers" wall should show what is selling NOW. Shopify's
// own best-selling sort is not limited to a date range, so a shoe that sold
// well a year ago can outrank this month's. Owner decision 2026-11-20: rank
// the last 30 days of shoe sales ourselves and keep two MANUAL collections in
// that order, which the homepage reads:
//
//   /collections/best-sellers-30-days-womens   Women's Shoes + Unisex Shoes
//   /collections/best-sellers-30-days-mens     Men's Shoes + Unisex Shoes
//
// Ranking: units sold (current quantity, so refunds and removed lines do not
// count) over every channel, online and in store. Shoes are ranked by MODEL
// (the cw-group tag without its width, so every width and colourway of a
// model adds up), and within a model by colourway, so the card the wall shows
// for a model is its best-selling colourway. Active products only. The wall
// itself still skips anything without real size depth.
//
// The two collections are published to the Online Store (Liquid cannot read
// an unpublished one) but linked from nowhere and marked seo.hidden, so they
// stay out of search engines and site search. They are ours: this tool is the
// only thing that writes them, and only their membership and order.
//
// Read only by default.
//   node tools/monthly-best-sellers.mjs            # dry run: prints the ranking
//   node tools/monthly-best-sellers.mjs --apply    # writes the two collections
// Nightly: tools/launchd/com.therunhouse.monthly-best-sellers.plist
// House style: no em dashes.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APPLY = process.argv.includes('--apply');
const DAYS = 30;
const KEEP = 60; // per collection: enough for the wall to skip thin stock and repeats

// Pure: the model key a product is ranked under.
export function modelKey(p) {
  const t = (p.tags || []).find((x) => x.startsWith('cw-group:'));
  return t ? t.split('--')[0] : 'handle:' + p.handle;
}
// Pure: which wall(s) a product type belongs to.
export function wallsFor(type) {
  if (type === "Women's Shoes") return ['womens'];
  if (type === "Men's Shoes") return ['mens'];
  if (type === 'Unisex Shoes') return ['womens', 'mens'];
  return [];
}
// Pure: units per product -> product ids in wall order (model total, then colourway).
export const PER_MODEL = 4; // colourways kept per model: the wall shows one, the rest are spares for thin stock
export function rank(units, products, wall) {
  const byModel = new Map();
  for (const [id, n] of units) {
    const p = products.get(id);
    if (!p || p.status !== 'ACTIVE' || !wallsFor(p.productType).includes(wall)) continue;
    const k = modelKey(p);
    if (!byModel.has(k)) byModel.set(k, { total: 0, items: [] });
    const m = byModel.get(k); m.total += n; m.items.push([id, n]);
  }
  return [...byModel.values()].sort((a, b) => b.total - a.total)
    .flatMap((m) => m.items.sort((a, b) => b[1] - a[1]).slice(0, PER_MODEL).map(([id]) => id));
}

const COLLS = {
  womens: { handle: 'best-sellers-30-days-womens', title: "Best Sellers This Month: Women's Shoes" },
  mens: { handle: 'best-sellers-30-days-mens', title: "Best Sellers This Month: Men's Shoes" },
};

async function main() {
  const E = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
  const tok = (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) })).json()).access_token;
  async function gql(query, variables) {
    for (let t = 0; t < 6; t++) {
      const r = await (await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, { method: 'POST',
        headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
      if (r.data && !(r.errors && r.errors.length)) return r.data;
      if (t === 5) throw new Error('graphql: ' + JSON.stringify(r.errors || r).slice(0, 300));
      await new Promise((x) => setTimeout(x, 2000 * (t + 1)));
    }
  }

  // 1. Units per product over the last 30 days.
  const since = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
  const units = new Map();
  let after = null, orders = 0;
  do {
    const d = await gql(`query($a:String,$q:String){ orders(first:50, after:$a, query:$q){ pageInfo{ hasNextPage endCursor }
      nodes{ cancelledAt test lineItems(first:50){ nodes{ currentQuantity product{ id } } } } } }`, { a: after, q: `created_at:>=${since}` });
    for (const o of d.orders.nodes) {
      if (o.cancelledAt || o.test) continue;
      orders++;
      for (const li of o.lineItems.nodes) {
        if (!li.product || !(li.currentQuantity > 0)) continue;
        units.set(li.product.id, (units.get(li.product.id) || 0) + li.currentQuantity);
      }
    }
    after = d.orders.pageInfo.hasNextPage ? d.orders.pageInfo.endCursor : null;
  } while (after);

  // 2. What each sold product is.
  const products = new Map();
  const ids = [...units.keys()];
  for (let i = 0; i < ids.length; i += 100) {
    const d = await gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id handle title productType status tags } } }`, { ids: ids.slice(i, i + 100) });
    for (const p of d.nodes) if (p) products.set(p.id, p);
  }
  console.log(`${new Date().toISOString()}  ${orders} orders since ${since}, ${units.size} products sold`);

  const plan = {};
  for (const wall of Object.keys(COLLS)) {
    plan[wall] = rank(units, products, wall).slice(0, KEEP);
    // The log shows MODELS (what the wall shows one card each for), with their totals.
    const models = new Map();
    for (const id of plan[wall]) { const p = products.get(id); const k = modelKey(p); if (!models.has(k)) models.set(k, { name: p.title.split(' - ')[0], n: 0 }); }
    for (const [id, n] of units) { const p = products.get(id); if (p && p.status === 'ACTIVE' && wallsFor(p.productType).includes(wall) && models.has(modelKey(p))) models.get(modelKey(p)).n += n; }
    console.log(`\n${COLLS[wall].title}: ${plan[wall].length} products, ${models.size} models. Top 12 models:`);
    [...models.values()].slice(0, 12).forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}. ${String(m.n).padStart(3)}u  ${m.name}`));
  }
  if (!APPLY) { console.log('\ndry run: nothing written. Add --apply to write.'); return; }

  // 3. Write each collection: create if missing, add new members, drop old
  //    ones, then set the order.
  const pubs = await gql(`{ publications(first:20){ nodes{ id name } } }`);
  const online = pubs.publications.nodes.find((p) => /online store/i.test(p.name));
  for (const [wall, c] of Object.entries(COLLS)) {
    const want = plan[wall];
    if (!want.length) { console.log(`${c.handle}: nothing ranked, left as it is`); continue; }
    let col = (await gql(`query($h:String!){ collectionByHandle(handle:$h){ id ruleSet{ rules{ column } } } }`, { h: c.handle })).collectionByHandle;
    if (col && col.ruleSet) { console.log(`${c.handle} is a smart collection, refusing to touch it`); continue; }
    if (!col) {
      const r = await gql(`mutation($input:CollectionInput!){ collectionCreate(input:$input){ collection{ id } userErrors{ message } } }`,
        { input: { handle: c.handle, title: c.title, sortOrder: 'MANUAL',
          descriptionHtml: '<p>Our best-selling shoes over the last 30 days, updated every night.</p>',
          metafields: [{ namespace: 'seo', key: 'hidden', type: 'number_integer', value: '1' }] } });
      if (r.collectionCreate.userErrors.length) { console.log('create failed', c.handle, JSON.stringify(r.collectionCreate.userErrors)); continue; }
      col = r.collectionCreate.collection;
      if (online) await gql(`mutation($id:ID!,$input:[PublicationInput!]!){ publishablePublish(id:$id, input:$input){ userErrors{ message } } }`, { id: col.id, input: [{ publicationId: online.id }] });
      console.log('created', c.handle);
    }
    const have = new Set();
    let a2 = null;
    do {
      const d = await gql(`query($id:ID!,$a:String){ collection(id:$id){ products(first:250, after:$a){ pageInfo{ hasNextPage endCursor } nodes{ id } } } }`, { id: col.id, a: a2 });
      d.collection.products.nodes.forEach((p) => have.add(p.id));
      a2 = d.collection.products.pageInfo.hasNextPage ? d.collection.products.pageInfo.endCursor : null;
    } while (a2);
    const add = want.filter((id) => !have.has(id));
    const drop = [...have].filter((id) => !want.includes(id));
    if (add.length) {
      const r = await gql(`mutation($id:ID!,$p:[ID!]!){ collectionAddProducts(id:$id, productIds:$p){ userErrors{ message } } }`, { id: col.id, p: add });
      if (r.collectionAddProducts.userErrors.length) console.log('add failed', JSON.stringify(r.collectionAddProducts.userErrors));
    }
    if (drop.length) {
      const r = await gql(`mutation($id:ID!,$p:[ID!]!){ collectionRemoveProducts(id:$id, productIds:$p){ userErrors{ message } } }`, { id: col.id, p: drop });
      if (r.collectionRemoveProducts.userErrors.length) console.log('remove failed', JSON.stringify(r.collectionRemoveProducts.userErrors));
    }
    const moves = want.map((id, i) => ({ id, newPosition: String(i) }));
    const r = await gql(`mutation($id:ID!,$m:[MoveInput!]!){ collectionReorderProducts(id:$id, moves:$m){ userErrors{ message } } }`, { id: col.id, m: moves });
    if (r.collectionReorderProducts.userErrors.length) console.log('reorder failed', JSON.stringify(r.collectionReorderProducts.userErrors));
    console.log(`${c.handle}: ${want.length} in order (+${add.length} new, -${drop.length} dropped)`);
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
