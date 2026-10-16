// sku-size.mjs, The Run House.
//
// The size segment of an ON SKU has to survive being a SKU, and these SKUs are
// permanent: they go onto products at create time and the inventory write route
// resolves variants by `sku:` query, so a space in one breaks the write.
//
// Footwear is numeric and turns the dot into a 5, 6.5 to 655. That is long
// standing and every ON shoe SKU on the store already reads that way, so it
// must not change.
//
// Apparel sizes are words, some with spaces and dashes. Raw they produced
// "ON-1WF30174944-FOX-L D-DD".
//
// Run: node scrapers/on/test/sku-size.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content.js');
const noop = () => {};
const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
  setAttribute: noop, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
  get textContent() { return ''; }, set textContent(v) {}, set innerHTML(v) {} });
const sb = { console: { log: noop, warn: noop, error: noop },
  setTimeout: noop, setInterval: noop, clearInterval: noop, fetch: () => Promise.reject(new Error('x')),
  location: { href: 'https://backstage.on-running.com/', hostname: 'backstage.on-running.com', pathname: '/' },
  navigator: { userAgent: '' }, performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem: noop },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  MutationObserver: class { observe() {} },
  document: { readyState: 'complete', addEventListener: noop, createElement: el,
    querySelector: () => null, querySelectorAll: () => [],
    body: { appendChild: noop, contains: () => false, removeChild: noop }, head: { appendChild: noop } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(SRC, 'utf8') + '\n;globalThis.__E = UnifiedShopifyConverter;', sb);
const x = Object.create(sb.__E.prototype);  // generateSKU lives on the converter

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

console.log('\nFootwear is unchanged, because every ON shoe SKU already reads this way');
eq('6 stays 6', x.skuSizeToken('6'), '6');
eq('6.5 becomes 655', x.skuSizeToken('6.5'), '655');
eq('10.5 becomes 1055', x.skuSizeToken('10.5'), '1055');
eq('14 stays 14', x.skuSizeToken('14'), '14');

console.log('\nApparel sizes come out SKU safe');
for (const [raw, want] of [
  ['M', 'M'], ['XXL', 'XXL'], ['XS', 'XS'],
  ['L D-DD', 'LDDD'], ['XXS A-C', 'XXSAC'], ['XL D-DD', 'XLDDD'],
  ['ONE SIZE', 'ONESIZE'], ['XS-S', 'XSS'], ['M-L', 'ML'], ['L-XL', 'LXL'],
]) eq(`"${raw}" -> ${want}`, x.skuSizeToken(raw), want);

console.log('\nNothing a SKU cannot carry, and nothing empty');
{
  const sizes = ['S','M','XL','XXL','L','XS','XXS','L D-DD','XS D-DD','S D-DD','M D-DD','XXS D-DD',
    'ONE SIZE','XS-S','M-L','S-M','L-XL','XL D-DD','XXS A-C','S A-C','M A-C','XS A-C','L A-C','XL A-C'];
  const toks = sizes.map((s) => x.skuSizeToken(s));
  const dirty = toks.filter((t) => !/^[A-Z0-9]+$/.test(t));
  eq('every token is letters and digits only', dirty.length, 0);
  eq('none empty', toks.filter((t) => !t).length, 0);
  eq('no two sizes collide', new Set(toks).size, sizes.length);
}

console.log('\nThe whole SKU is clean for the sizes that used to break it');
{
  const v = { styleId: '1WF30174944', colorCode: 'FOX', sizeUS: 'L D-DD' };
  const sku = x.generateSKU(v);
  eq('no spaces', /\s/.test(sku), false);
  eq('exact', sku, 'ON-1WF30174944-FOX-LDDD');
  eq('one size', x.generateSKU({ styleId: '1UF10000001', colorCode: 'BLA', sizeUS: 'ONE SIZE' }),
     'ON-1UF10000001-BLA-ONESIZE');
  eq('a shoe is untouched', x.generateSKU({ styleId: '3WF10101043', colorCode: 'BLA', sizeUS: '6.5' }),
     'ON-3WF10101043-BLA-655');
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
