// SanMar supplier data: the colour join, sizes, flats only, the photo pass
// through allowlist. Hand written replies in SanMar's real shapes, so no
// supplier data sits in this public repo.
import { parseSupplier, colorKey, sizeKey, handlePhoto, handleSupplier } from '../src/sanmar.js';

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

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
