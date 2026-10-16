// picker-tabs.mjs, The Run House.
//
// One ON export carries shoes and apparel, and the two are judged against
// DIFFERENT catalogs: shoes against /catalog, apparel against /catalog/apparel.
// In one list, one of them is always being checked against the wrong known
// set, so the picker splits them.
//
// The split is the first digit of the ON article code, which every SKU
// already carries: 1 apparel, 2 accessories, 3 footwear. No name parsing.
//
// Run: node test/picker-tabs.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sb = { console: { log() {}, warn() {}, error() {} }, setTimeout() {},
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../brand-picker.js', import.meta.url), 'utf8'), sb);
const BP = sb.BrandPicker;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

// Register the ON config the same way the page does, without needing OnConverter.
BP.register('on', {
  converter: {}, containerId: 'on-picker-container', trackerId: 'on-tracker-report',
  headerGradient: '', comparisonKey: '_onTrackerComparison', vendorName: 'ON Running',
  checkboxClass: 'on-picker-cb',
  tabs: [{ key: 'shoes', label: 'Shoes' }, { key: 'apparel', label: 'Apparel' }],
  tabOf: function (product) {
    var cws = product.colorways || [];
    for (var i = 0; i < cws.length; i++) {
      var sku = (cws[i] && (cws[i].sku || (cws[i].skus && cws[i].skus[0]))) || '';
      var m = /^ON-([0-9])/.exec(String(sku).toUpperCase());
      if (m) return m[1] === '1' ? 'apparel' : 'shoes';
    }
    var hay = String(product.name || '') + ' ' + String(product.model || '');
    return /\b1[WMU][A-Z]\d{6,}/.test(hay) ? 'apparel' : 'shoes';
  },
});
const tabOf = BP.configs.on.tabOf;
const P = (sku, name) => ({ name: name || 'x', colorways: [{ sku }] });

console.log('\nThe article code decides, and it is in every SKU');
eq('a shoe', tabOf(P('ON-3MF10074782-ASH-7')), 'shoes');
eq('another shoe', tabOf(P('ON-3WF10101043-BLA-655')), 'shoes');
eq('apparel', tabOf(P('ON-1WF30174944-FOX-M')), 'apparel');
eq('a bra size does not confuse it', tabOf(P('ON-1WF30174944-FOX-LDDD')), 'apparel');
eq('an accessory is not apparel, it goes with shoes for now',
   tabOf(P('ON-2UF13300069-WHI-OS')), 'shoes');

console.log('\nOld style codes with a dot still read as shoes');
eq('Cloud 5', tabOf(P('ON-59.98905-ALL-5')), 'shoes');

console.log('\nWith no SKU it falls back to the code in the name');
eq('apparel code in the title', tabOf({ name: 'ON Focus-T MEN (1ME11460069)', colorways: [] }), 'apparel');
eq('no code at all defaults to shoes', tabOf({ name: 'Something', colorways: [] }), 'shoes');

console.log('\nThe first colorway with a readable SKU wins');
eq('skips a blank one', tabOf({ colorways: [{ sku: '' }, { sku: 'ON-1ME10125438-LAU-XXL' }] }), 'apparel');
eq('reads a skus array too', tabOf({ colorways: [{ skus: ['ON-3MF10074782-ASH-7'] }] }), 'shoes');

console.log('\nshowTab does not throw when the DOM is not there');
{
  let threw = null;
  try { BP.showTab('on', 'apparel'); } catch (e) { threw = e.message; }
  eq('no DOM, no crash', threw, null);
  try { BP.showTab('nosuchbrand', 'x'); } catch (e) { threw = e.message; }
  eq('unknown brand, no crash', threw, null);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
