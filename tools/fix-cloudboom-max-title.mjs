// fix-cloudboom-max-title.mjs, The Run House.
//
// One ACTIVE product was created under another shoe's name (see CLAUDE.md, "A
// SHOE MUST NOT BE GIVEN ANOTHER SHOE'S NAME"): on-mens-cloudboom-echo-3-all-black
// is ON article 3MF30310485, a Cloudboom MAX. Its photos are ON's own
// "cloudboom_max" files; the two other men's Cloudboom Max colourways already
// on the store (White Flurry, White Juniper) are style 3MF30310... too, at the
// same $230. Owner go, 2026-11-20.
//
// What changes: title, handle (Shopify keeps a redirect from the old URL), SEO
// title (both seo.title and global.title_tag), image alt text, the model tags
// (Echo 3 -> Cloudboom Max, so it groups with its siblings), and the swatch
// list on all three men's Cloudboom Max products. Price, stock, variants,
// photos and status are not touched. Every old value goes in a rollback file.
//
//   node tools/fix-cloudboom-max-title.mjs              # dry run
//   node tools/fix-cloudboom-max-title.mjs --apply
//   node tools/fix-cloudboom-max-title.mjs --restore <file> [--apply]
// House style: no em dashes.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore') ? process.argv[process.argv.indexOf('--restore') + 1] : null;
const OLD_HANDLE = 'on-mens-cloudboom-echo-3-all-black';
const NEW = {
  handle: 'on-mens-cloudboom-max-all-black',
  title: "ON Men's Cloudboom Max - All Black",
  seo: "ON Men's Cloudboom Max Running Shoes, All Black",
  dropTags: ['Cloudboom Echo 3', 'cw-group:mens-cloudboom-echo-3--standard', 'model:cloudboom-echo-3', 'cw-lead-m'],
  addTags: ['Cloudboom Max', 'cw-group:mens-cloudboom-max--standard', 'model:cloudboom-max'],
};
const SIBLING_HANDLES = ['on-mens-cloudboom-max-white-flurry', 'on-mens-cloudboom-max-white-juniper'];

const E = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
const tok = (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) })).json()).access_token;
async function gql(query, variables) {
  const r = await (await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
  if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 400));
  return r.data;
}
const errs = (o) => { const k = Object.keys(o)[0]; const e = o[k].userErrors || []; if (e.length) throw new Error(k + ': ' + JSON.stringify(e)); };
const READ = `id title handle seo{ title } tags metafield(namespace:"global", key:"title_tag"){ value }
  sibs: metafield(namespace:"custom", key:"style_siblings"){ value } media(first:20){ nodes{ id alt } }`;
const byHandle = async (h) => (await gql(`query($h:String!){ productByHandle(handle:$h){ ${READ} } }`, { h })).productByHandle;
const setSibs = (id, ids) => gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }`,
  { m: [{ ownerId: id, namespace: 'custom', key: 'style_siblings', type: 'list.product_reference', value: JSON.stringify(ids) }] }).then(errs);
const setAlts = (list) => list.length && gql(`mutation($f:[FileUpdateInput!]!){ fileUpdate(files:$f){ userErrors{ message } } }`,
  { f: list.map((m) => ({ id: m.id, alt: m.alt })) }).then(errs);

if (RESTORE) {
  const b = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
  console.log(`restore: ${b.product.title} at /products/${b.product.handle}, and ${b.siblings.length} sibling swatch lists`);
  if (!APPLY) { console.log('dry run: add --apply to restore.'); process.exit(0); }
  const p = b.product;
  errs(await gql(`mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ userErrors{ message } } }`,
    { p: { id: p.id, title: p.title, handle: p.handle, redirectNewHandle: true, tags: p.tags, seo: { title: p.seo } } }));
  if (p.titleTag != null) errs(await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }`,
    { m: [{ ownerId: p.id, namespace: 'global', key: 'title_tag', type: 'string', value: p.titleTag }] }));
  await setAlts(p.media);
  for (const s of [p, ...b.siblings]) if (s.sibs) await setSibs(s.id, s.sibs);
  console.log('restored.');
  process.exit(0);
}

const p = await byHandle(OLD_HANDLE);
if (!p) { const done = await byHandle(NEW.handle); console.log(done ? `already fixed: /products/${NEW.handle} is "${done.title}"` : 'product not found'); process.exit(0); }
if (await byHandle(NEW.handle)) { console.log(`refusing: /products/${NEW.handle} already exists`); process.exit(1); }
const sibs = [];
for (const h of SIBLING_HANDLES) { const s = await byHandle(h); if (!s) { console.log('refusing: sibling missing', h); process.exit(1); } sibs.push(s); }
const group = [...sibs.map((s) => s.id), p.id];
const tags = [...p.tags.filter((t) => !NEW.dropTags.includes(t)), ...NEW.addTags.filter((t) => !p.tags.includes(t))];
const alts = p.media.nodes.map((m) => ({ id: m.id, alt: (m.alt || '').replace(/Cloudboom Echo 3/g, 'Cloudboom Max') || NEW.title }));
console.log(`${p.title}  ->  ${NEW.title}`);
console.log(`/products/${p.handle}  ->  /products/${NEW.handle}  (old URL redirects)`);
console.log(`SEO title: ${p.seo.title}  ->  ${NEW.seo}`);
console.log(`tags: -[${NEW.dropTags.filter((t) => p.tags.includes(t)).join(', ')}]  +[${NEW.addTags.join(', ')}]`);
console.log(`image alt text: ${alts.length} images`);
console.log(`swatches: ${group.length} men's Cloudboom Max colourways list each other`);
if (!APPLY) { console.log('dry run: nothing written. Add --apply to write.'); process.exit(0); }

const file = path.join(ROOT, `cloudboom-max-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify({ product: { id: p.id, title: p.title, handle: p.handle, seo: p.seo.title, tags: p.tags,
  titleTag: p.metafield ? p.metafield.value : null, media: p.media.nodes.map((m) => ({ id: m.id, alt: m.alt })), sibs: p.sibs ? JSON.parse(p.sibs.value) : null },
  siblings: sibs.map((s) => ({ id: s.id, handle: s.handle, sibs: s.sibs ? JSON.parse(s.sibs.value) : null })) }, null, 1));
console.log('rollback saved:', path.basename(file));
errs(await gql(`mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ userErrors{ message } } }`,
  { p: { id: p.id, title: NEW.title, handle: NEW.handle, redirectNewHandle: true, tags, seo: { title: NEW.seo } } }));
errs(await gql(`mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }`,
  { m: [{ ownerId: p.id, namespace: 'global', key: 'title_tag', type: 'string', value: NEW.seo }] }));
await setAlts(alts);
for (const id of group) await setSibs(id, group);
const after = await byHandle(NEW.handle);
console.log(`done: "${after.title}" at /products/${after.handle}, tags ${after.tags.filter((t) => /cloudboom|cw-group|model:/i.test(t)).join(', ')}`);
