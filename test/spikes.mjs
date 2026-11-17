// Spikes are their own section (2026-11-17): CatalogClient.spikeInfo decides
// the picker tab and what a new product is created as, and spikes join the
// Needham dropship scope. Names taken from the real feeds and store that day.
// Run: node test/spikes.mjs
// House style: no em dashes.
import fs from 'node:fs';
import vm from 'node:vm';

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const sb = { console: { log() {}, warn() {}, error() {} }, setTimeout() {}, fetch: () => {}, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../catalog-client.js', import.meta.url), 'utf8'), sb);
const CC = sb.CatalogClient;
const tagsOf = (n) => (CC.spikeInfo(n) || { tags: null }).tags;

console.log('\nEvery brand\'s spikes are spikes');
const SPIKES = ['Unisex KILKENNY XC 10 SPIKE', 'Unisex KILKENNY XC 10 FLAT', 'Unisex ENDORPHIN LD', "Men's UNLEASH SD 3", 'Crescendo MD 2',
  'Crescendo XC Spikeless', 'Cielo X 3 LD', 'DRAFT XC SPIKELESS', 'HYPERION ELITE MD 2', 'HYPERION ELITE SPRINT', "Men's EVOSPEED STAR 9",
  "Men's EVOSPEED JAVELIN 4", "Men's HIGH JUMP NITRO", 'Unisex FUELCELL XC7 V5', 'Unisex SUPERCOMP LD-X V3', 'Cloudspike Amplius 2',
  'Asics Unisex Hyper MD 7  Track Spike (1091A018)', 'Under Armour Unisex Kick Sprint 3 Track Spikes- Black/Mod Grey', 'New Balance XC Seven 4- Thirty Watt/Black (UXCS7M4)'];
for (const n of SPIKES) ok(!!CC.spikeInfo(n), n);

console.log('\nShoes are not');
const SHOES = ["Men's SPRINT ANTHEM", 'M SPEEDGOAT 5 GTX SPIKE', 'Unisex Hyperion Elite 4', 'Clifton 10', 'Endorphin Elite 3', 'Metaspeed Sky Tokyo',
  'Cloudmonster 3 Hyper', 'Gel-Kayano 32', 'FuelCell SuperComp Elite v5', 'Ghost Max 3'];
for (const n of SHOES) ok(!CC.spikeInfo(n), n, CC.spikeInfo(n));

console.log('\nThe event tag is the one the store already uses');
ok(JSON.stringify(tagsOf('Unisex KILKENNY XC 10 SPIKE')) === JSON.stringify(['spikes', 'track and field', 'XC Spikes', 'cross country']), 'XC', tagsOf('Unisex KILKENNY XC 10 SPIKE'));
ok(tagsOf('Crescendo MD 2').includes('Mid-Distance Spikes') && tagsOf('Cielo X 3 LD').includes('Distance Spikes'), 'MD and LD');
ok(tagsOf("Men's UNLEASH SD 3").includes('Sprint Spikes') && tagsOf("Men's EVOSPEED JAVELIN 4").includes('Throwing Shoes') && tagsOf("Men's HIGH JUMP NITRO").includes('Jumping Spikes'), 'sprint, throwing, jumping');
ok(JSON.stringify(tagsOf("Men's EVOSPEED STAR 9")) === JSON.stringify(['spikes', 'track and field']), 'a name that does not say the event gets no event tag, never a guess');

console.log('\nSpikes join the Needham dropship scope, stores stay out');
ok(CC.DROPSHIP_TYPE_RE.test('Spikes') && CC.DROPSHIP_TYPE_RE.test("Men's Shoes") && !CC.DROPSHIP_TYPE_RE.test('Sandals') && !CC.DROPSHIP_TYPE_RE.test('T-Shirts'), 'Spikes and shoes, not sandals or tees');

console.log('\nThe picker and the create step use the same rule');
const picker = fs.readFileSync(new URL('../brand-picker.js', import.meta.url), 'utf8');
const enrich = fs.readFileSync(new URL('../product-enrichment.js', import.meta.url), 'utf8');
ok(/CatalogClient\.spikeInfo/.test(picker) && /key: 'spikes', label: 'Spikes'/.test(picker), 'the picker adds a Spikes tab from spikeInfo');
ok(/pType = 'Spikes'/.test(enrich) && /CatalogClient\.spikeInfo\(get\(first, 'Title'\)\)/.test(enrich), 'a new spike is created as type Spikes');
const worker = fs.readFileSync(new URL('../worker/src/products.js', import.meta.url), 'utf8');
ok(/isFootwearType = \(t\) => \/shoes\$\|\^spikes\$\/i/.test(worker), 'the Worker gives Spikes the shoe category and weight');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
