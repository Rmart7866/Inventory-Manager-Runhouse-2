// team-store-card-images.mjs, The Run House.
//
// Precomputes the card image for every store on /pages/team-stores and saves
// it as ONE json metafield on that page, custom.team_store_images:
//   { "<collection handle>": "L|<url>" | "P|<url>", ... }
// L = the collection's own image and it is a logo (PNG/SVG/WEBP/GIF), so the
//     logo wall may use it; P = the first product's photo (the collection
//     image was missing or a JPG team photo, which the directory never shows).
//
// WHY. Measured 2026-11-11: the live /pages/team-stores answered 500 on 2 of 4
// fetches, server timing 3,003 ms, Shopify's render limit. The directory
// loop looked up collections[handle] for all 384 stores and, for every store
// whose image was a JPG, loaded that collection's products to reach a photo.
// With this map the section reads one metafield instead, and falls back to the
// old lookups only for a store the map does not know yet (a new store), so a
// stale or missing map degrades to exactly the old behaviour, never to a
// broken card.
//
// The store LIST (custom.team_stores) is built by the separate team-stores
// Worker and is not touched here. Re-run this when stores are added or a
// store's logo changes:
//
//   node tools/team-store-card-images.mjs            dry run, counts only
//   node tools/team-store-card-images.mjs --apply    write the metafield
//
// House style: no em dashes. Use commas, periods, or the word "to".
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APPLY = process.argv.includes('--apply');
const E = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';
const tok = (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) })).json()).access_token;
async function gql(query, variables) {
  for (let a = 0; a < 6; a++) {
    const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST', headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
    const j = await r.json();
    if (j.errors && JSON.stringify(j.errors).includes('THROTTLED')) { await new Promise((s) => setTimeout(s, 1500 * (a + 1))); continue; }
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
    return j.data;
  }
  throw new Error('throttled');
}

const page = (await gql(`{ pages(first: 1, query: "handle:team-stores") { nodes { id handle m: metafield(namespace: "custom", key: "team_stores") { value } } } }`)).pages.nodes[0];
if (!page || page.handle !== 'team-stores' || !page.m) throw new Error('team-stores page or its store list not found');
const stores = JSON.parse(page.m.value).stores;
const map = {};
let logos = 0, photos = 0, none = 0;
for (let i = 0; i < stores.length; i += 25) {
  const chunk = stores.slice(i, i + 25);
  const fields = chunk.map((s, k) => `c${k}: collectionByHandle(handle: ${JSON.stringify(s.h)}) { image { url } products(first: 1) { nodes { featuredImage { url } } } }`).join('\n');
  const d = await gql(`{ ${fields} }`);
  chunk.forEach((s, k) => {
    const c = d['c' + k];
    if (!c) { none++; return; }
    const img = c.image && c.image.url;
    const ext = img ? img.split('?')[0].split('.').pop().toLowerCase() : '';
    if (img && ext !== 'jpg' && ext !== 'jpeg') { map[s.h] = 'L|' + img.split('?')[0]; logos++; return; }
    const p = c.products.nodes[0] && c.products.nodes[0].featuredImage && c.products.nodes[0].featuredImage.url;
    if (p) { map[s.h] = 'P|' + p.split('?')[0]; photos++; } else none++;
  });
}
const value = JSON.stringify(map);
console.log(`stores ${stores.length} | logo ${logos} | product photo ${photos} | no image ${none} | ${value.length} bytes`);
if (!APPLY) { console.log('Dry run. Re-run with --apply to write custom.team_store_images.'); process.exit(0); }
const r = await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields: $m){ userErrors { field message } } }`,
  { m: [{ ownerId: page.id, namespace: 'custom', key: 'team_store_images', type: 'json', value }] });
const ue = r.metafieldsSet.userErrors;
console.log(ue.length ? 'ERROR ' + JSON.stringify(ue) : 'written custom.team_store_images');
