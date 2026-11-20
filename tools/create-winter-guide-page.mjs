// create-winter-guide-page.mjs, The Run House.
//
// Creates the redesign's Winter Guide page, /pages/winter-guide, using the
// theme template "winter-guide" (templates/page.winter-guide.json in the
// redesign theme). On a theme without that template Shopify falls back to the
// plain page template, which shows the body below, so the body is written to
// stand on its own: the guide's intro and links. Never overwrites: refuses if
// the handle exists. Owner go, 2026-11-19. Dry run by default; --apply writes.
// House style: no em dashes.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const E = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
const APPLY = process.argv.includes('--apply');
const tok = (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) })).json()).access_token;
const gql = async (query, variables) => (await (await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, { method: 'POST',
  headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json());

const BODY = [
  '<p>Dress as if it is 10 degrees warmer than the thermometer reads, because you warm up once you are moving. Wind and rain make it feel colder, so add a layer when either is in the forecast.</p>',
  '<p><strong>Cold, 40s °F:</strong> a long sleeve or light jacket, tights or shorts, and your usual socks.<br>',
  '<strong>Colder, 20s to 30s °F:</strong> a base layer under a wind or weather shell, tights, a hat and gloves.<br>',
  '<strong>Coldest, under 20 °F:</strong> base, mid layer and shell, winter tights, a warm hat, mitts and wool socks.</p>',
  '<p><strong>Start with the shoe.</strong> Waterproof (Gore-Tex) uppers help keep your feet dry in slush and wet snow. <a href="/collections/gore-tex-and-waterproof-shoes">Shop waterproof shoes</a> or <a href="/collections/trail-running-shoes">trail shoes for snow and mud</a>.</p>',
  '<p><strong>And when it is dark,</strong> a light or a reflective layer helps drivers and other runners see you. <a href="/collections/visibility">Shop visibility</a>.</p>',
  '<p>Come try layers on in Walpole, Needham or Falmouth. Shoe fittings are walk-in at all three stores, no appointment needed.</p>',
].join('\n');

const existing = await gql(`{ pages(first: 5, query: "handle:winter-guide") { nodes { id handle } } }`);
if ((existing.data?.pages?.nodes || []).some((p) => p.handle === 'winter-guide')) { console.log('/pages/winter-guide already exists: left alone.'); process.exit(0); }
console.log('will create /pages/winter-guide (template suffix winter-guide, published)');
if (!APPLY) { console.log('dry run: add --apply to create.'); process.exit(0); }
const r = await gql(`mutation($page: PageCreateInput!){ pageCreate(page: $page){ page{ id handle } userErrors{ field message } } }`,
  { page: { title: 'Winter Running Guide', handle: 'winter-guide', body: BODY, templateSuffix: 'winter-guide', isPublished: true } });
console.log(JSON.stringify(r.data?.pageCreate || r.errors));
