// check-best-wall.mjs, The Run House. READ ONLY.
// For the products in the 30 day best seller collections: does each carry a
// colour sibling list (custom.style_siblings), how many of those siblings are
// active and in stock with real size depth, and how much stock does the
// product itself hold? Explains why a homepage card shows colours or not.
// House style: no em dashes.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const E = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
const tok = (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) })).json()).access_token;
const gql = async (query, variables) => (await (await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, { method: 'POST',
  headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json()).data;
const PF = `id handle title status totalInventory tags variants(first:60){ nodes{ availableForSale inventoryQuantity } } metafield(namespace:"custom", key:"style_siblings"){ value }`;
// rh-deep: at least 60% of variants available (rounded up the same way as the theme).
const deep = (p) => { const vt = p.variants.nodes.length, va = p.variants.nodes.filter((v) => v.availableForSale).length; return p.status === 'ACTIVE' && va >= Math.floor((vt * 6 + 9) / 10) && va > 0; };
for (const h of ['best-sellers-30-days-womens', 'best-sellers-30-days-mens']) {
  const d = await gql(`query($h:String!){ collectionByHandle(handle:$h){ products(first:60, sortKey:MANUAL){ nodes{ ${PF} } } } }`, { h });
  const seen = new Set(); let shown = 0;
  console.log('\n' + h);
  for (const p of d.collectionByHandle.products.nodes) {
    if (shown >= 8) break;
    if (!deep(p)) continue;
    const g = (p.tags.find((t) => t.startsWith('cw-group:')) || p.handle).split('--')[0];
    if (seen.has(g)) continue; seen.add(g); shown++;
    const ids = p.metafield ? JSON.parse(p.metafield.value) : [];
    let sibDeep = 0, sibAll = ids.length;
    if (ids.length) {
      const s = await gql(`query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { ${PF} } } }`, { ids });
      sibDeep = s.nodes.filter((x) => x && x.id !== p.id && deep(x)).length;
    }
    const units = p.variants.nodes.reduce((a, v) => a + Math.max(0, v.inventoryQuantity || 0), 0);
    const sizes = p.variants.nodes.filter((v) => v.availableForSale).length;
    console.log(`  ${p.title.slice(0, 58).padEnd(58)} units ${String(units).padStart(5)}  sizes ${sizes}/${p.variants.nodes.length}  siblings ${ids.length ? sibAll : 'NONE'}  in-stock others ${sibDeep}`);
  }
}
