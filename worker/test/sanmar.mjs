// SanMar supplier data: the colour join, sizes, flats only, the photo pass
// through allowlist. Hand written replies in SanMar's real shapes, so no
// supplier data sits in this public repo.
import { parseSupplier, colorKey, sizeKey, handlePhoto, handleSupplier, stateOf, availOf, supplierOfStyle, refreshAvailability, handleStockPublic } from '../src/sanmar.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };

const part = (color, size, qty) => `<ns2:PartInventory><ns2:partId>X</ns2:partId><ns2:partColor>${color}</ns2:partColor><ns2:labelSize>${size}</ns2:labelSize>` +
  `<ns2:quantityAvailable><ns2:Quantity><ns2:uom>EA</ns2:uom><ns2:value>${qty}</ns2:value></ns2:Quantity></ns2:quantityAvailable>` +
  `<ns2:InventoryLocationArray><ns2:InventoryLocation><ns2:inventoryLocationQuantity><ns2:Quantity><ns2:value>99999</ns2:value></ns2:Quantity></ns2:inventoryLocationQuantity></ns2:InventoryLocation></ns2:InventoryLocationArray></ns2:PartInventory>`;
const media = (color, cls, url) => `<ns2:MediaContent><productId>PC380</productId><ns2:url>${url}</ns2:url><ns2:ClassTypeArray><ns2:ClassType><ns2:classTypeName>${cls}</ns2:classTypeName></ns2:ClassType></ns2:ClassTypeArray><ns2:color>${color}</ns2:color></ns2:MediaContent>`;
const M = 'https://cdnm.sanmar.com/imglib/mresjpg/2023/f6/';

const inv = '<S:Envelope><S:Body>' + [
  part('Ath Maroon', 'S', 3632), part('Ath Maroon', 'XXL', 5), part('Ht Cardinal', 'M', 0),
  part('Black', 'L', 40), part('Black/Gold', 'L', 7), part('Tr Nvy/Gld/Wht', 'OSFA', 3),
].join('') + '</S:Body></S:Envelope>';
const med = '<S:Envelope><S:Body>' + [
  media('Ath Maroon', 'Front', M + 'PC380_athleticmaroon_flat_front.jpg'),
  media('Ath Maroon', 'Rear', M + 'PC380_athleticmaroon_flat_back.jpg'),
  media('Ath Maroon', 'Custom', M + 'PC380_athleticmaroon_model_side.jpg'),
  media('Ath Maroon', 'Primary', 'https://cdnm.sanmar.com/catalog/images/PC380.jpg'),
  media('Ht Cardinal', 'Front', M + 'DT6100_heathercardinal_flat_front.jpg'),
  // a two-tone whose files also carry the first colour alone
  media('Black/Gold', 'Front', M + 'DT1800_blackgold_flat_front.jpg'),
  media('Black/Gold', 'Custom', M + 'DT1800_black_model_front.jpg'),
  media('Bk/WBfflCk', 'Custom', M + 'DT1800_black_model_side.jpg'),
].join('') + '</S:Body></S:Envelope>';

const d = parseSupplier(inv, med);
console.log('\nStock');
check('quantity is the warehouse TOTAL, not one location', d.colors['Ath Maroon'].q.S === 3632);
check('XXL reads as 2XL', d.colors['Ath Maroon'].q['2XL'] === 5);
check('OSFA reads as One Size', d.colors['Tr Nvy/Gld/Wht'].q['One Size'] === 3);
check('a zero stays a zero', d.colors['Ht Cardinal'].q.M === 0);

console.log('\nPhotos');
check('the front FLAT, not the model shot or the style photo', d.colors['Ath Maroon'].f === M + 'PC380_athleticmaroon_flat_front.jpg');
check('the back flat', d.colors['Ath Maroon'].b === M + 'PC380_athleticmaroon_flat_back.jpg');
check('no back flat is no back photo', d.colors['Black/Gold'].b === null);

console.log('\nThe colour join');
const join = (ours) => d.alias[colorKey(ours)] || null;
check('our long name finds SanMar\'s short one through the filename', join('Athletic Maroon') === 'Ath Maroon');
check('"Heathered" on our side is "heather" in the filename', join('Heathered Cardinal') === 'Ht Cardinal');
check('SanMar\'s own name still matches', join('Black/Gold') === 'Black/Gold');
check('a plain colour matches its own name', join('Black') === 'Black');
check('"black" in two colours\' filenames is never used to guess', d.alias.black === 'Black' && join('Black') !== 'Black/Gold');
check('a colour SanMar does not list finds nothing', join('Electric Purple') === null);
const d2 = parseSupplier('<x/>', med);
check('an ambiguous filename key is dropped, not guessed', !('black' in d2.alias));
check('colorKey squeezes case and punctuation', colorKey('True Navy/ Gold') === 'truenavygold' && sizeKey('xxl') === '2XL');

// One colour listed twice ("Ht Navy", "HthrNavy") showing ONE photo, only one with stock
const F = M + 'DT6100_heathernavy_flat_front.jpg';
const d3 = parseSupplier('<x>' + part('HthrNavy', 'M', 50) + '</x>',
  '<x>' + media('Ht Navy', 'Front', F) + media('HthrNavy', 'Front', F) + '</x>');
check('two spellings of one colour settle on the one with stock', d3.alias[colorKey('Heathered Navy')] === 'HthrNavy');
// The DT6100 case: both spellings carry stock, each part of the size run
const KF = M + 'DT6100_heatherkellygreen_flat_front.jpg';
const d5 = parseSupplier('<x>' + part('Ht Kelly Green', 'M', 300) + part('Ht Kelly Green', 'L', 200) + part('HtKllyGrn', '5XL', 4) + part('HtKllyGrn', 'L', 1) + '</x>',
  '<x>' + media('Ht Kelly Green', 'Front', KF) + media('HtKllyGrn', 'Front', KF) + '</x>');
const kg = d5.colors[d5.alias[colorKey('Heathered Kelly Green')]];
check('two listings of one garment are MERGED, not dropped', !!kg && kg.q.M === 300 && kg.q['5XL'] === 4);
check('and a size in both is added, once', kg && kg.q.L === 201);
// Different garments share "black", only one of them in stock, no plain Black
const d4 = parseSupplier('<x>' + part('Black/Gold', 'L', 7) + '</x>',
  '<x>' + media('Black/Gold', 'Front', M + 'DT1800_blackgold_flat_front.jpg') + media('Black/Gold', 'Custom', M + 'DT1800_black_model_front.jpg') +
  media('Bk/WBfflCk', 'Front', M + 'DT1800_blackwhitebuffalocheck_flat_front.jpg') + media('Bk/WBfflCk', 'Custom', M + 'DT1800_black_model_side.jpg') + '</x>');
check('our Black never borrows Black/Gold\'s stock, even when it is the only one in stock', !d4.alias.black);
check('form shots count, model shots do not', parseSupplier('<x/>', '<x>' + media('Black', 'Front', M + 'LST353_Black_Form_Front.jpg') + '</x>').colors.Black.f === M + 'LST353_Black_Form_Front.jpg');

console.log('\nRoutes');
let r = await handlePhoto(new Request('https://w/team-requests/photo?u=' + encodeURIComponent('https://evil.example/x.jpg')));
check('the photo pass through refuses any other host', r.status === 400);
r = await handlePhoto(new Request('https://w/team-requests/photo?u=' + encodeURIComponent('https://cdnm.sanmar.com/catalog/images/PC380.jpg')));
check('and SanMar paths outside the photo library', r.status === 400);
r = await handlePhoto(new Request('https://w/team-requests/photo?u=' + encodeURIComponent('https://cdnm.sanmar.com/imglib/mresjpg/../../x.jpg')));
check('and a path that climbs out', r.status === 400 || r.status === 502);
const s = await handleSupplier(new Request('https://w/team-requests/supplier?styles=PC380'), { CATALOG: {} });
check('no SanMar login on the Worker says so, rather than failing quietly', s.status === 503);

console.log('\nAvailability for the customer builder');
check('a core size at zero is out', stateOf({ S: 10, M: 0, L: 50, XL: 50 }) === 'out');
check('under 24 is low', stateOf({ S: 30, M: 23, L: 50, XL: 50 }) === 'low');
check('a thin 5XL does not count', stateOf({ S: 30, M: 30, L: 30, XL: 30, '5XL': 0 }) === 'ok');
check('one size goods are judged on their one size', stateOf({ 'One Size': 0 }) === 'out');
check('availability is keyed by the join key, ok colours left out', JSON.stringify(availOf({ alias: { athleticmaroon: 'Ath Maroon', black: 'Black' }, colors: { 'Ath Maroon': { q: { M: 0 } }, Black: { q: { M: 400 } } } })) === '{"athleticmaroon":"out"}');
check('a style\'s supplier comes from its swatch host', supplierOfStyle({ c: [['Black', '^port_black.gif']] }) === 'sanmar' && supplierOfStyle({ c: [['Black', '`5726010_1.png']] }) === 'cra' && supplierOfStyle({ c: [['Black', '~x.png']] }) === null);
check('Charles River replies with xmlns on every tag still parse', parseSupplier('<Inventory xmlns="x"><PartInventoryArray xmlns="y"><PartInventory xmlns="z"><partColor>Black</partColor><labelSize>M</labelSize><quantityAvailable><Quantity><uom>EA</uom><value>12</value></Quantity></quantityAvailable></PartInventory></PartInventoryArray></Inventory>', '<x/>', 'cra').colors.Black.q.M === 12);

// The sweep: stalest first, a failure keeps the old entry, one KV write
const kv = {}, puts = [];
const KV = { get: async (k) => (k in kv ? JSON.parse(kv[k]) : null), put: async (k, v) => { kv[k] = v; puts.push(k); } };
kv['supplier:avail'] = JSON.stringify({ styles: { OLD1: { at: '2026-01-01T00:00:00Z', av: { black: 'out' } }, NEW1: { at: '2026-11-06T00:00:00Z', av: {} } } });
const realFetch = globalThis.fetch;
const seen = [];
globalThis.fetch = async (u, o) => {
  if (String(u).includes('catalog')) return new Response(JSON.stringify({ cats: [{ p: [{ s: 'NEW1', c: [['Black', '^a.gif']] }, { s: 'OLD1', c: [['Black', '^b.gif']] }, { s: 'CRA1', c: [['Black', '`c.png']] }] }] }));
  const style = (o.body.match(/<shar:productId>([^<]+)</) || [])[1]; seen.push(style);
  if (style === 'OLD1') throw new Error('SanMar is down');
  return new Response(String(u).includes('Inventory') ? '<x>' + part('Black', 'M', 0) + '</x>' : '<x/>');
};
const res = await refreshAvailability({ CATALOG: KV, SANMAR_USER: 'u', SANMAR_PASSWORD: 'p' }, 'https://cdn/catalog.json', { batch: 1 });
globalThis.fetch = realFetch;
const snap = JSON.parse(kv['supplier:avail']);
check('the sweep takes the stalest style first', seen[0] === 'OLD1');
check('a failed style keeps its previous entry, stale beats absent', snap.styles.OLD1.av.black === 'out' && res.failed === 1);
check('a supplier with no login is skipped, not failed', res.of === 2);
check('one KV write per sweep, not one per style', puts.length === 1);
const pub = await handleStockPublic(new Request('https://w/team-requests/stock/public'), { CATALOG: KV }, { 'Access-Control-Allow-Origin': 'https://therunhouse.com' });
const pj = await pub.json();
check('the public route serves the snapshot, boxes of colour keys only', pub.status === 200 && pj.styles.OLD1.black === 'out' && !('at' in pj.styles.OLD1));
check('and cannot be written to', (await handleStockPublic(new Request('https://w/x', { method: 'POST' }), { CATALOG: KV }, {})).status === 405);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
