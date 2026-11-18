// The tool's side of the dropship location (2026-11-18): until the cutover
// everything is Needham as before; after it, supplier rows labelled "Needham"
// go to Dropship Warehouse, Warehouse rows stay Warehouse, and the direct
// write and the nightly auto write accept ONLY the dropship location, so the
// real Needham store can never be written from this path.
// Run: node test/dropship-location.mjs
// House style: no em dashes.
import { loadTool } from '../tools/auto-write.mjs';

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const T = loadTool();
const CC = T.CatalogClient;
const rows = [{ SKU: 'A', Location: 'Needham' }, { SKU: 'B', Location: '' }, { SKU: 'C', Location: 'Warehouse' }];

console.log('\nBefore the cutover: Needham, exactly as before');
ok(CC.dropshipName() === 'Needham', 'the dropship location is Needham until the Worker says otherwise');
const before = T.mapDropshipLocation(rows);
ok(before[0].Location === 'Needham' && before[1].Location === 'Needham' && before[2].Location === 'Warehouse', 'rows unchanged (blank becomes Needham, as the old fallback did)', before.map((r) => r.Location));
ok(CC.isDropshipLocation('Needham') && !CC.isDropshipLocation('Warehouse'), 'Needham is written, Warehouse is held back');

console.log('\nAfter the cutover: Dropship Warehouse, and never the Needham store');
CC.DROPSHIP_NAME = 'Dropship Warehouse';   // what the catalog sets from the Worker
const after = T.mapDropshipLocation(rows);
ok(after[0].Location === 'Dropship Warehouse' && after[1].Location === 'Dropship Warehouse', 'a supplier row labelled Needham goes to Dropship Warehouse', after.map((r) => r.Location));
ok(after[2].Location === 'Warehouse', 'a Warehouse row (print on demand singlets) stays Warehouse');
ok(CC.isDropshipLocation('Dropship Warehouse') && !CC.isDropshipLocation('Needham') && !CC.isDropshipLocation('Walpole'), 'only Dropship Warehouse passes the write gate: the Needham store and other stores never do');
ok(CC.toDropshipLocation('Walpole') === 'Walpole', 'a row naming a store is never moved into dropship, it is held back');
ok(rows[0].Location === 'Needham', 'the mapping returns new rows and never edits the originals');

console.log('\nThe catalog sets it, and the write gate uses it');
const cc = await import('node:fs').then((fs) => fs.readFileSync(new URL('../catalog-client.js', import.meta.url), 'utf8'));
const main = await import('node:fs').then((fs) => fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8'));
ok(/catalog\.dropshipLocation && catalog\.dropshipLocation\.name\) self\.DROPSHIP_NAME = /.test(cc), 'fetchCatalog takes the name from the Worker');
ok(/inventory = mapDropshipLocation\(inventory\);\n\s*inventory = alignInventoryToCatalog/.test(main), 'convertBrand maps the location straight after conversion');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
