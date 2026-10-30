// scraper-feeds-tool.mjs, The Run House.
//
// DOES THE SCRAPER'S OUTPUT STILL FEED THE INVENTORY MANAGER?
//
// The ASICS scraper was changed substantially over 2026-10-26 to 10-29: the
// readiness gate, the revert, the method that was on the wrong class, the
// per-line Warehouse location, the API-only singlet path and
// basketNoFromUrl. Every one of those changes is upstream of the web tool,
// which parses the resulting CSV with `AsicsConverter.scanFile` and
// `convert`. A change that makes a perfectly good CSV the tool cannot read
// would look exactly like "the scraper is broken" again.
//
// So this runs BOTH REAL SIDES against each other, no fixtures of convenience:
// the CSV is built by `UnifiedCSVManager.convertToInventoryCSV` out of
// scrapers/asics/background.js, which is the converter that writes the file
// staff actually import, and it is read by asics-converter.js, which is the
// file index.html loads. Nothing in between is simulated except Papa.parse.
//
// Run: node test/scraper-feeds-tool.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadBackgroundConverter } from '../tools/asics-headless-run.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

// Papa.parse with header: true, the one shape the converter uses. Same stub
// as test/on-apparel.mjs: a quote only opens a quoted field at the START of a
// field, which is how Papa actually reads it.
function papaParse(text) {
  const lines = String(text).split('\n').filter((l) => l.trim());
  const split = (line) => {
    const out = [];
    let cur = '', q = false, atStart = true;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && atStart) { q = true; atStart = false; continue; }
      atStart = false;
      if (c === '"' && q) { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else if (c === ',' && !q) { out.push(cur); cur = ''; atStart = true; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
  const data = lines.slice(1).map((l) => {
    const cols = split(l);
    const o = {};
    header.forEach((h, i) => { o[h] = (cols[i] || '').replace(/^"|"$/g, ''); });
    return o;
  });
  return { data, meta: { fields: header } };
}

function loadToolConverter() {
  const sandbox = { Papa: { parse: papaParse }, console: { log() {}, warn() {}, error() {} },
    window: {}, document: { getElementById: () => null, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {} }, module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'asics-converter.js'), 'utf8'), sandbox);
  return sandbox.AsicsConverter || sandbox.ASICSConverter;
}

const asFile = (csv) => ({ text: () => Promise.resolve(csv) });

// ---- the two real sides -----------------------------------------------------
const scraper = loadBackgroundConverter(ROOT);
const tool = loadToolConverter();

console.log('\nBoth real sides load');
typeof scraper.convertToInventoryCSV === 'function'
  ? ok('scrapers/asics/background.js gives its CSV converter')
  : bad('the scraper side did not load');
tool && typeof tool.convert === 'function'
  ? ok('asics-converter.js gives the tool side, the one index.html loads')
  : bad('the tool side did not load, check the global name', Object.keys(tool || {}));

// A run shaped like the real one: footwear to Needham, both singlet styles to
// Warehouse with the uncapped figures the availability API returns.
const rec = (o) => Object.assign({
  styleId: '1011C127', productName: "GEL-NIMBUS 28 MEN'S", colorCode: '001',
  colorName: 'BLACK/GRAPHITE GREY', gender: 'Men', sizeUS: '10', size: '10',
  quantity: 7, locationName: '', width: { code: 'D', name: 'Standard' },
}, o);

const records = [
  rec({}),
  rec({ sizeUS: '10.5', size: '10.5', quantity: 30 }),
  rec({ styleId: '1012B899', productName: "GEL-NIMBUS 28 WOMEN'S", gender: 'Women',
    sizeUS: '8', size: '8', quantity: 3 }),
  rec({ styleId: 'TF3085', productName: "MEN'S RIVAL II SINGLET", colorCode: '23',
    colorName: 'RED', sizeUS: 'M', size: 'M', quantity: 302, locationName: 'Warehouse' }),
  rec({ styleId: 'TF2934', productName: "WOMEN'S RIVAL II SINGLET", colorCode: '90',
    colorName: 'BLACK', gender: 'Women', sizeUS: 'S', size: 'S', quantity: 99,
    locationName: 'Warehouse' }),
];

const csv = scraper.convertToInventoryCSV(records);

console.log('\nThe tool can SCAN what the scraper wrote');
{
  const products = await tool.scanFile(asFile(csv));
  Array.isArray(products) && products.length
    ? ok('scanFile returned ' + products.length + ' picker products')
    : bad('scanFile found nothing, so the brand card would look empty', products);

  const names = (products || []).map((p) => p.model || p.name).join(' | ');
  /NIMBUS/i.test(names) ? ok('the footwear model is recognised: ' + names.slice(0, 60))
                        : bad('the footwear model was not recognised', names);

  // every picker product the tool shows must carry the fields BrandPicker reads
  const shape = (products || []).every((p) =>
    p && Array.isArray(p.colorways) && typeof p.rowCount === 'number' && typeof p.totalInventory === 'number');
  shape ? ok('each product carries colorways, rowCount and totalInventory, which the picker reads')
        : bad('a picker product is missing fields the picker needs', (products || [])[0]);
}

console.log('\nAnd CONVERT it without losing what the write depends on');
{
  tool.selectedProducts = new Set();     // nothing selected means take everything
  const inv = await tool.convert(asFile(csv));
  eq(inv.length, records.length, 'every row survives the round trip');

  // THE LOCATION IS THE WHOLE POINT. convert() reads row.Location with a
  // Needham fallback, so a Warehouse row has to arrive as Warehouse or the
  // singlets land in Needham, which is the 2026-10-27 write.
  const wh = inv.filter((r) => r.Location === 'Warehouse');
  eq(wh.length, 2, 'both singlet rows keep Warehouse through the tool');
  const nd = inv.filter((r) => r.Location === 'Needham');
  eq(nd.length, 3, 'and the footwear rows read Needham');

  // THE SKU IS THE JOIN for the direct write, which sends { sku, quantity }.
  const skus = inv.map((r) => r.SKU);
  skus.every(Boolean) ? ok('every row carries a SKU, which is what the write matches on')
                      : bad('a row lost its SKU, so it would match nothing', skus);
  skus.includes('TF3085-23-M')
    ? ok('the singlet SKU is the form backfill-singlet-skus.mjs wrote')
    : bad('the singlet SKU does not match the backfilled form', skus);

  // the uncapped figure has to survive, or the capped grid wins anyway
  const red = inv.find((r) => r.SKU === 'TF3085-23-M');
  eq(String(red && red['On hand (new)']), '302', 'the uncapped 302 survives, not a 30');

  // allFeedSkus is what removal detection compares against. If it were empty,
  // unselected products would read as removed and get zeroed.
  tool.allFeedSkus && tool.allFeedSkus.size === records.length
    ? ok('allFeedSkus holds the whole feed, so nothing reads as removed')
    : bad('allFeedSkus is wrong, which is how a wrongful zero happens',
        tool.allFeedSkus && tool.allFeedSkus.size);
}

console.log('\nThe DIRECT WRITE must not carry a Warehouse row to Needham');
{
  // writeAllInventory sends { sku, quantity } with NO location, and
  // worker/src/inventory.js targets NEEDHAM_LOCATION_ID and nothing else by
  // design. So a Warehouse row riding that button is written to Needham,
  // silently: a few hundred singlets appearing as real dropship stock, which
  // is the 2026-10-27 write all over again. It became reachable the moment
  // the singlets joined the link list and got SKUs that match.
  //
  // This reproduces main.js's filter against the REAL converter output rather
  // than trusting the source to still say what it said.
  const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  /writes to Needham only/.test(src) && /heldBack\.push/.test(src)
    ? ok('main.js still holds back non-Needham rows from the direct write')
    : bad('the Needham-only guard is gone from writeAllInventory');

  tool.selectedProducts = new Set();
  const inv = await tool.convert(asFile(csv));
  const wouldWrite = inv.filter((r) => ((r.Location || 'Needham').toLowerCase() === 'needham'));
  const held = inv.filter((r) => ((r.Location || 'Needham').toLowerCase() !== 'needham'));
  eq(wouldWrite.length, 3, 'only the 3 Needham rows would go to the Needham-only route');
  eq(held.length, 2, 'and both singlet rows are held back');
  held.every((r) => /^TF(3085|2934)/.test(r.SKU))
    ? ok('the held rows are exactly the print-on-demand styles')
    : bad('something other than a singlet was held back', held.map((r) => r.SKU));
}

console.log('\nThe tool can re-emit a CSV from it');
{
  const out = tool.generateInventoryCSV();
  const lines = String(out || '').split('\n').filter(Boolean);
  lines.length === records.length + 1
    ? ok('generateInventoryCSV writes a header plus ' + records.length + ' rows')
    : bad('the re-emitted CSV has the wrong row count', lines.length);
  /Warehouse/.test(out) ? ok('and Warehouse is still in it')
                        : bad('Warehouse was lost on the way back out');
}

// ---- and against a file the runner really produced -------------------------
console.log('\nAgainst a real captured file, if one is on this machine');
{
  const dl = path.join(process.env.HOME || '', 'Downloads');
  let real = null;
  try {
    real = fs.readdirSync(dl).filter((f) => /^asics-headless-.*\.csv$/.test(f)).sort().pop();
  } catch (e) { /* no Downloads, fine */ }
  if (!real) {
    console.log('  skip  no asics-headless-*.csv in Downloads, the synthetic case above still ran');
  } else {
    const text = fs.readFileSync(path.join(dl, real), 'utf8');
    tool.selectedProducts = new Set();
    const products = await tool.scanFile(asFile(text));
    const inv = await tool.convert(asFile(text));
    const rows = text.split('\n').filter((l) => l.trim()).length - 1;
    console.log('        ' + real + ': ' + rows + ' rows');
    products.length ? ok('the tool scans it into ' + products.length + ' products')
                    : bad('the tool found no products in a real captured file');
    inv.length === rows ? ok('and converts all ' + rows + ' rows')
                        : bad('row count changed on convert', { rows, got: inv.length });
    const locs = [...new Set(inv.map((r) => r.Location))].sort();
    locs.join('/') === 'Needham/Warehouse' || locs.join('/') === 'Needham'
      ? ok('locations come through as ' + locs.join(' and '))
      : bad('unexpected locations after convert', locs);
  }
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
