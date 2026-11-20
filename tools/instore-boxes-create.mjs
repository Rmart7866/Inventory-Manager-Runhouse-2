// instore-boxes-create.mjs, The Run House. Owner, 2026-11-20.
//
// Part 2 of the Needham boxes that would not scan (part 1:
// instore-boxes-existing.mjs). These had NO product, or no variant for the
// box's size, so they are built, each one copied from a live SIBLING of the
// same model (vendor spelling, type, size ladder, SKU pattern, price, model
// level tags, specs and description), through the Worker's own createProducts
// (category, 2 lb weight, Dropship Warehouse + store levels at 0, every sales
// channel, CREATE ONLY and DRAFT). Then the boxes are put on hand at Needham.
//
// Barcodes: the box's own (decoded, check digit verified) and, where the
// supplier publishes it, every other size from the supplier's file (ON and
// Brooks barcode files, the New Balance CDS file). A size with no known
// barcode is left blank, never guessed.
// Photos: on.com for ON (picked by eye from the colourway's own gallery), the
// Brooks and New Balance CDNs (each view HEAD checked). The three Cloud 6
// colourways are on no on.com site in any region, so they are created WITHOUT
// photos, and say so.
//
//   node tools/instore-boxes-create.mjs            # dry run
//   node tools/instore-boxes-create.mjs --apply
// House style: no em dashes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';
import { createProducts } from '../worker/src/products.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const NEEDHAM = 'gid://shopify/Location/77957136639';
const DW = 'gid://shopify/Location/97494139135';
const STORES = 'gid://shopify/Location/71668531455,gid://shopify/Location/68029448447,gid://shopify/Location/73726886143';
const TMP = '/Users/ryanmartin/.claude/jobs/7a3f9dba/tmp/ptc/';

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const c = createShopifyClient(env);
const gql = async (q, v) => { const r = await c.graphql(q, v); if (r.errors) throw new Error(JSON.stringify(r.errors).slice(0, 300)); return r.data; };

// Supplier barcodes.
const bdSrc = fs.readFileSync(path.join(ROOT, 'barcode-data.js'), 'utf8');
const BD = JSON.parse(bdSrc.slice(bdSrc.indexOf('{'), bdSrc.lastIndexOf('}') + 1));
const require = createRequire('/Users/ryanmartin/node_modules/');
const XLSX = require('xlsx');
const nbRows = XLSX.utils.sheet_to_json(XLSX.readFile('/Users/ryanmartin/Downloads/Consumer Drop Ship CDS ASAP nightly-2026-11-13_172538.xlsx').Sheets.Sheet1 || {}, { defval: '' });
const nbWb = XLSX.readFile('/Users/ryanmartin/Downloads/Consumer Drop Ship CDS ASAP nightly-2026-11-13_172538.xlsx');
const NB_ROWS = XLSX.utils.sheet_to_json(nbWb.Sheets[nbWb.SheetNames[0]], { defval: '' });
const onImg = JSON.parse(fs.readFileSync(TMP + 'onimg.json', 'utf8'));

const half = (s) => s % 1 !== 0;
const onCode = (s) => (half(s) ? Math.floor(s) + '55' : String(s));               // 6.5 -> 655
const brooksCode = (s) => (Math.floor(s) + (half(s) ? '55' : '50'));               // 6.5 -> 655, 6 -> 650
const nbCode = (s) => String(Math.floor(s)).padStart(2, '0') + (half(s) ? '5' : '');  // 6.5 -> 065, 6 -> 06
const ladder = (from, to, extra = []) => { const o = []; for (let s = from; s <= to; s += 0.5) o.push(s); return o.concat(extra); };

const ON_CS2 = ladder(5, 11);
const ON_C6 = ladder(5, 11, [12]);
const BROOKS_G18 = ladder(5, 12).filter((s) => s !== 12.5).concat([13]);
const NB_880 = ladder(5, 11).concat([12]);

// Each product: sibling to copy, identity, sizes, barcodes, boxes, photos.
const PRODUCTS = [
  { sib: 'on-womens-cloudsurfer-2-ivory-dijon', title: "ON Women's Cloudsurfer 2 - Surf Flurry", handle: 'on-womens-cloudsurfer-2-surf-flurry', colour: 'Surf Flurry',
    sizes: ON_CS2, opt: (s) => s.toFixed(1), sku: (s) => 'ON-3WF10105063-SUR-' + onCode(s), price: '160.00',
    barcode: (s) => BD.on['3WF10105063|' + s] || '', boxes: { 6.5: 1, 7: 1, 8.5: 1, 9: 1 },
    photos: [4, 8, 10, 6, 9, 7].map((i) => onImg['3WF10105063'][i] + '?w=2500&fm=png'), photosNote: 'on.com' },
  { sib: 'on-womens-cloudsurfer-2-ivory-dijon', title: "ON Women's Cloudsurfer 2 - Pearl Orchid", handle: 'on-womens-cloudsurfer-2-pearl-orchid', colour: 'Pearl Orchid',
    sizes: ON_CS2, opt: (s) => s.toFixed(1), sku: (s) => 'ON-3WF10103207-PEA-' + onCode(s), price: '160.00',
    barcode: (s) => BD.on['3WF10103207|' + s] || ({ 11: '7615537214382' })[s] || '', boxes: { 11: 1 },
    photos: [5, 8, 10, 6, 9, 7].map((i) => onImg['3WF10103207'][i] + '?w=2500&fm=png'), photosNote: 'on.com' },
  { sib: 'on-womens-cloud-6-oyster-biscuit', title: "ON Women's Cloud 6 - Mauve Orchid", handle: 'on-womens-cloud-6-mauve-orchid', colour: 'Mauve Orchid',
    sizes: ON_C6, opt: (s) => s.toFixed(1), sku: (s) => 'ON-3WF10063012-MAU-' + onCode(s), price: '160.00',
    barcode: (s) => ({ 9: '7615537207063' })[s] || '', boxes: { 9: 1 }, photos: [], photosNote: 'none: not on any on.com site' },
  { sib: 'on-womens-cloud-6-oyster-biscuit', title: "ON Women's Cloud 6 - Blonde Dew", handle: 'on-womens-cloud-6-blonde-dew', colour: 'Blonde Dew',
    sizes: ON_C6, opt: (s) => s.toFixed(1), sku: (s) => 'ON-3WF10063107-BLO-' + onCode(s), price: '160.00',
    barcode: (s) => ({ 6.5: '7615537206622' })[s] || '', boxes: { 6.5: 1 }, photos: [], photosNote: 'none: not on any on.com site' },
  { sib: 'on-womens-cloud-6-oyster-biscuit', title: "ON Women's Cloud 6 - Caper Ice", handle: 'on-womens-cloud-6-caper-ice', colour: 'Caper Ice',
    sizes: ON_C6, opt: (s) => s.toFixed(1), sku: (s) => 'ON-3WF10063014-CAP-' + onCode(s), price: '160.00',
    barcode: (s) => ({ 7: '7615537205984' })[s] || '', boxes: { 7: 1 }, photos: [], photosNote: 'none: not on any on.com site' },
  // Brooks Ghost 18 Grey/Morganite/Coconut ALREADY EXISTS (titled 'Grey/ Morganite/ Coconut', no SKUs):
  // handled in place by instore-boxes-fixups.mjs, never duplicated here.
  { sib: 'womens-880v15-black-cement', title: 'New Balance Womens 880v15 - COSMIC JADE', handle: 'womens-880v15-cosmic-jade', colour: 'COSMIC JADE',
    sizes: NB_880, opt: (s) => String(s), sku: (s) => 'W8801FT  B  ' + nbCode(s), price: '149.99',
    barcode: (s) => { const r = NB_ROWS.find((x) => x.SKU === 'W8801FT  B  ' + nbCode(s)); return r ? String(r['UPC/EAN']) : ''; }, boxes: { 8: 1 },
    photos: ['02', '05', '03', '04', '06'].map((v) => `https://nb.scene7.com/is/image/NB/w8801ft_nb_${v}_i`), photosNote: 'New Balance CDN' },
  { sib: 'womens-880v15-black-cement', title: 'New Balance Womens 880v15 - PINK WHITE', handle: 'womens-880v15-pink-white', colour: 'PINK WHITE',
    sizes: NB_880, opt: (s) => String(s), sku: (s) => 'W8801NT  B  ' + nbCode(s), price: '149.99',
    barcode: (s) => ({ 9: '199063016391' })[s] || '', boxes: { 9: 1 },
    photos: ['02', '05', '03', '04', '07', '06'].map((v) => `https://nb.scene7.com/is/image/NB/w8801nt_nb_${v}_i`), photosNote: 'New Balance CDN' },
  { sib: 'womens-880v15-black-cement', title: 'New Balance Womens 880v15 - PURPLE BLACK', handle: 'womens-880v15-purple-black', colour: 'PURPLE BLACK',
    sizes: NB_880, opt: (s) => String(s), sku: (s) => 'W8809Q7  B  ' + nbCode(s), price: '149.99',
    barcode: (s) => ({ 7: '199062672178', 8: '199062672253' })[s] || '', boxes: { 7: 1, 8: 1 },
    photos: ['02', '05', '03', '04', '07', '06'].map((v) => `https://nb.scene7.com/is/image/NB/w8809q7_nb_${v}_i`), photosNote: 'New Balance CDN' },
];

// Model-level metafields copied from the sibling; colour and sibling links are not.
const COPY_MF = (m) => m.namespace === 'specs' || (m.namespace === 'custom' && ['width_class', 'gender', 'width_code'].includes(m.key))
  || (m.namespace === 'global' && m.key === 'MPN') || (m.namespace === 'mm-google-shopping' && ['gender', 'age_group', 'condition'].includes(m.key));

function validCheckDigit(code) {
  const d = [...code].map(Number);
  if (d.length === 12) { const s = d.slice(0, 11).reduce((t, x, i) => t + x * (i % 2 === 0 ? 3 : 1), 0); return (10 - (s % 10)) % 10 === d[11]; }
  if (d.length === 13) { const s = d.slice(0, 12).reduce((t, x, i) => t + x * (i % 2 === 0 ? 1 : 3), 0); return (10 - (s % 10)) % 10 === d[12]; }
  return false;
}

const specs = [], problems = [], report = [];
for (const P of PRODUCTS) {
  const sib = (await gql(`query($h:String!){ productByHandle(handle:$h){ title vendor productType tags descriptionHtml metafields(first:40){ nodes{ namespace key type value } }
    variants(first:1){ nodes{ inventoryPolicy } } } }`, { h: P.sib })).productByHandle;
  if (!sib) { problems.push(P.title + ': sibling ' + P.sib + ' not found'); continue; }
  const exists = (await gql(`query($h:String!){ productByHandle(handle:$h){ id } }`, { h: P.handle })).productByHandle;
  if (exists) { problems.push(P.title + ': handle ' + P.handle + ' already exists'); continue; }
  const skus = P.sizes.map(P.sku);
  const taken = (await gql(`query($q:String){ productVariants(first:5, query:$q){ nodes{ sku } } }`, { q: 'sku:"' + skus[0] + '" OR sku:"' + skus[skus.length - 1] + '"' })).productVariants.nodes.filter((v) => skus.includes(v.sku));
  if (taken.length) { problems.push(P.title + ': SKU ' + taken[0].sku + ' already exists'); continue; }
  for (const s of Object.keys(P.boxes).map(Number)) if (!P.sizes.includes(s)) problems.push(P.title + ': box size ' + s + ' not in the ladder');
  const variants = P.sizes.map((s) => {
    const bc = P.barcode(s);
    if (bc && !validCheckDigit(bc)) problems.push(P.title + ' ' + s + ': barcode ' + bc + ' fails its check digit');
    return { size: P.opt(s), sku: P.sku(s), barcode: bc, price: P.price };
  });
  for (const s of Object.keys(P.boxes).map(Number)) if (!P.barcode(s)) problems.push(P.title + ' ' + s + ': the box size has no barcode');
  // Model-level tags only: no sibling colour word, no lead flag.
  const sibColour = sib.title.split(' - ').pop().toLowerCase();
  const tags = sib.tags.filter((t) => !/^cw-lead/.test(t) && !sibColour.split(/[\/ ]+/).some((w) => w.length > 2 && t.toLowerCase() === w))
    .filter((t) => t.toLowerCase() !== sibColour).concat(P.handle.startsWith('womens-880') ? [P.colour] : []);
  const mfs = sib.metafields.nodes.filter(COPY_MF).map((m) => ({ namespace: m.namespace, key: m.key, type: m.type, value: m.value }))
    .concat([{ namespace: 'custom', key: 'color_name', type: 'single_line_text_field', value: P.colour }]);
  const desc = sib.descriptionHtml;
  const colourWords = sibColour.split(/[\/ ]+/).filter((w) => w.length > 3);
  const leaks = colourWords.filter((w) => desc.toLowerCase().includes(w));
  const model = P.title.replace(/ - .*$/, '').replace(/^(ON|Brooks|New Balance) /, '');
  specs.push({ title: P.title, handle: P.handle, vendor: sib.vendor, productType: sib.productType, tags, metafields: mfs,
    descriptionHtml: leaks.length ? '' : desc,
    seoTitle: (P.title.replace(/ - .*$/, '').replace('Womens', "Women's") + ' Running Shoes, ' + P.colour.replace(/\b([A-Z])([A-Z]+)\b/g, (m, a, b) => a + b.toLowerCase())),
    files: P.photos.map((u) => ({ originalSource: u, alt: P.title })), variants, _boxes: P.boxes, _P: P });
  report.push(`${P.title}  [${sib.vendor} | ${sib.productType} | $${P.price}]\n    ${variants.length} sizes ${variants[0].size} to ${variants[variants.length - 1].size} | barcodes ${variants.filter((v) => v.barcode).length}/${variants.length} | photos ${P.photos.length} (${P.photosNote}) | description ${leaks.length ? 'BLANK (sibling copy names its colour: ' + leaks.join(',') + ')' : 'from sibling'}\n    boxes to Needham: ${Object.entries(P.boxes).map(([s, q]) => s + ' x' + q + ' ' + P.sku(Number(s)) + ' ' + P.barcode(Number(s))).join(', ')}\n    tags: ${tags.join(', ')}`);
}
report.forEach((r) => console.log(r));
if (problems.length) { console.log('\nREFUSED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`\n${specs.length} products, ${specs.reduce((t, s) => t + Object.values(s._boxes).reduce((a, b) => a + b, 0), 0)} boxes.`);
if (!APPLY) { console.log('DRY RUN. Nothing written.'); process.exit(0); }

const res = await createProducts(c, specs.map(({ _boxes, _P, seoTitle, ...s }) => s), DW, STORES);
const out = path.join(os.homedir(), 'Library', 'Logs', 'runhouse-autowrite');
const log = { at: new Date().toISOString(), created: [] };
for (let i = 0; i < specs.length; i++) {
  const sp = specs[i], r = res[i] || {};
  if (!r.ok) { console.log('CREATE FAILED ' + sp.title + ' ' + JSON.stringify(r.userErrors || r)); continue; }
  const p = (await gql(`query($h:String!){ productByHandle(handle:$h){ id handle status variants(first:40){ nodes{ sku inventoryItem{ id } } } } }`, { h: sp.handle })).productByHandle;
  await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{ message } } }`, { i: { id: p.id, seo: { title: sp.seoTitle } } }).catch(() => {});
  for (const [s, q] of Object.entries(sp._boxes)) {
    const sku = sp._P.sku(Number(s));
    const v = p.variants.nodes.find((x) => x.sku === sku);
    if (!v) { console.log('  NO VARIANT ' + sku); continue; }
    const a = await gql(`mutation($i:ID!,$l:ID!,$q:Int){ inventoryActivate(inventoryItemId:$i, locationId:$l, onHand:$q){ userErrors{ message } } }`, { i: v.inventoryItem.id, l: NEEDHAM, q });
    if (a.inventoryActivate.userErrors.length) console.log('  STOCK FAILED ' + sku + ' ' + JSON.stringify(a.inventoryActivate.userErrors));
  }
  log.created.push({ handle: p.handle, id: p.id, status: p.status });
  console.log(`created ${p.status} ${sp.title} -> /products/${p.handle}`);
}
fs.writeFileSync(path.join(out, 'instore-boxes-created-' + log.at.replace(/[:.]/g, '-') + '.json'), JSON.stringify(log, null, 1));
