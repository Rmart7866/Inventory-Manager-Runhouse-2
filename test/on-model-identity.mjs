// on-model-identity.mjs, The Run House.
//
// A SHOE MUST NOT BE GIVEN ANOTHER SHOE'S NAME, PRICE OR SPECS.
//
// Reported from the shop floor: the Cloudboom Volt was coming through as the
// Cloudboom Echo 3. Measured against the live feed on 2026-10-30, nine
// colourways across TWO models were affected, all titled Cloudboom Echo 3 at
// $290, while their handles still said what they really were:
//
//   on-mens-cloudboom-volt-bla / -cel / -whi      ON Men's Cloudboom Echo 3
//   on-womens-cloudboom-volt-cel / -jun / -whi    ON Women's Cloudboom Echo 3
//   on-mens-cloudboom-max-all / -whi              ON Men's Cloudboom Echo 3
//   on-womens-cloudboom-max-whi                   ON Women's Cloudboom Echo 3
//   on-cloudboom-strike-2-*                       ON Unisex Cloudboom Strike
//
// Two independent causes, which is why the handle and the title disagreed:
//
//   1. getONProductInfo matched on PARTIAL overlap. Neither the Volt nor the
//      Max is in onProductDatabase, so each shared the single token
//      "cloudboom" with two entries and the tiebreak handed it the longer key
//      name. The guard meant to stop this read "at least 2 meaningful overlaps
//      (~12 points)" against a score of `overlaps * 10 + keyWords.length`, so
//      ONE overlap plus a two word key already reached 12.
//
//   2. ON prefixes a FAMILY onto the name, "Boom | Cloudboom Volt 1", and only
//      "PR |" and "PAD |" were ever stripped, in eight separate places.
//
// Run: node test/on-model-identity.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const src = fs.readFileSync(path.join(ROOT, 'scrapers/on/content.js'), 'utf8');
const cut = src.indexOf('class ONRunningInventoryExtractor');
const sandbox = {
  window: { location: { href: '', pathname: '/' }, addEventListener() {} },
  document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }), head: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {} },
  sessionStorage: { getItem: () => null, setItem() {} },
  console: { log() {}, warn() {}, error() {} },
};
vm.createContext(sandbox);
vm.runInContext(src.slice(0, cut) +
  '\n; globalThis.__C = UnifiedShopifyConverter; globalThis.__info = getONProductInfo;' +
  '\n  globalThis.__db = onProductDatabase;', sandbox);

const conv = new sandbox.__C();
const info = sandbox.__info;
const db = sandbox.__db;

// A feed row as the scraper builds it. The name is ON's raw one, family
// prefix and all.
const product = (name, over) => Object.assign({
  productName: name, styleId: '3MF30744834', colorName: 'Black',
  gender: "Men's", sizeUS: '9',
}, over);

console.log('\nThe reported bug: a Volt is not an Echo');
{
  eq(conv.generateProductTitle(product('Boom | Cloudboom Volt 1')),
    "ON Men's Cloudboom Volt 1 - Black", 'the Volt keeps its own name in the title');
  eq(conv.generateProductTitle(product('Boom | Cloudboom Max 1')),
    "ON Men's Cloudboom Max 1 - Black", 'and so does the Max');
  const t = conv.generateProductTitle(product('Boom | Cloudboom Volt 1'));
  /echo/i.test(t) ? bad('the title still says Echo', t) : ok('neither is called Echo any more');
}

console.log('\nA model that IS in the table still resolves, with its price');
{
  eq(conv.generateProductTitle(product('Boom | Cloudboom Echo 3')),
    "ON Men's Cloudboom Echo 3 - Black", 'the real Echo 3 is unchanged');
  eq(info('Cloudboom Echo 3', '3MF1').price, 290, 'and keeps its price');
  eq(info('Cloudboom Strike', '3MF1').price, 280, 'the Strike keeps its price');
  // the bare aliases are deliberate: an unversioned name means the current one
  eq(info('Cloudmonster', '3MF1').name, 'Cloudmonster 2', 'a bare name still maps to the current version');
  eq(info('Cloud', '3MF1').name, 'Cloud 6', 'and so does "Cloud"');
}

console.log('\nA VERSION IS PART OF THE IDENTITY');
{
  // The table still holds the 2s while ON ships the 3s, so treating a bare
  // number as noise maps every v3 onto a v2 record: wrong price, wrong
  // weight, wrong drop, wrong stack.
  eq(info('Cloudboom Strike 2', '3MF1'), db.default, 'Strike 2 is not the Strike record');
  eq(conv.generateProductTitle(product('Boom | Cloudboom Strike 2')),
    "ON Men's Cloudboom Strike 2 - Black", 'and keeps its version in the title');
  eq(info('Cloudmonster 3', '3MF1'), db.default, 'a Cloudmonster 3 does not take the 2 record');
  eq(info('Cloudsurfer Trail 2', '3MF1'), db.default, 'a trail shoe does not take road specs');
  eq(info('Cloud 6 WP', '3MF1'), db.default, 'a waterproof version is its own shoe');
  eq(info('Cloudmonster 3 Hyper', '3MF1'), db.default, 'and a Hyper is not a Cloudmonster 2');
}

console.log('\nThe family prefix never reaches a title or a handle');
{
  // ON sends Boom |, Cloud |, Flow |, Monster |, plus PR | and PAD | and
  // PTR | on apparel. A pipe is not legal in a Shopify handle.
  const cases = [
    ['Boom | Cloudboom Volt 1', 'cloudboom-volt-1'],
    ['Cloud | Cloud 6', 'cloud-6'],
    ['Flow | Cloudflow 5', 'cloudflow-5'],
    ['Monster | Cloudmonster 2', 'cloudmonster-2'],
    ['PR | Cloudboom Echo 3', 'cloudboom-echo-3'],
  ];
  for (const [name, want] of cases) {
    const h = conv.generateHandle(product(name));
    h.includes('|') ? bad('a pipe reached the handle for ' + name, h)
                    : (h.includes(want) ? ok('handle for "' + name + '" is ' + h)
                                        : bad('unexpected handle for ' + name, { got: h, want }));
  }
  const titles = cases.map(([n]) => conv.generateProductTitle(product(n)));
  titles.some((t) => t.includes('|')) ? bad('a pipe reached a title', titles.filter((t) => t.includes('|')))
                                      : ok('and no title carries one');
}

console.log('\nApparel still never gets a footwear record');
{
  eq(info('3" Core Shorts', '1WF10150553'), db.default, 'shorts are not a shoe');
  eq(info('Performance Long-T 2', '1MF1'), db.default, 'nor is a long sleeve tee');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
