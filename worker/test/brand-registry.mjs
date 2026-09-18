// brand-registry.mjs, The Run House.
//
// Pins the one fact that has to agree across four files whenever a brand is
// added: the brand KEY. parsers.js decides it, the catalog stores it on every
// product, and catalog-client.js compares against it.
//
// WHY THIS EXISTS. Altra shipped with a complete converter, correct gender,
// width, model and color parsing, a working image source and a brand card, and
// still linked nothing. parsers.js BRANDS had no 'altra' row, so brandFor()
// returned UNKNOWN and the catalog wrote brand UNKNOWN on every Altra product,
// while CatalogClient.BRAND_MAP.altra said 'ALTRA'. Two lookups key off that
// value and both missed silently:
//
//   buildKnownSets filters `p.brand !== catBrand`, so the picker saw zero
//   carried Altra products and would have called the whole brand new.
//   buildCatalog's inheritance index is keyed `${brand}|${cwGroup}`, so
//   create-time tag inheritance could never find a sibling.
//
// Nothing threw and no test failed. The brand just quietly did not link, which
// is the expensive kind of bug because it looks like working software.
//
// Run: node test/brand-registry.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { brandFor, BRANDS } from '../src/parsers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');

// catalog-client.js is a browser global and reaches for fetch and localStorage
// at call time, not at load time. The two brand tables are plain literals.
const sandbox = {
  console, window: {}, fetch: undefined,
  document: { getElementById: () => null, addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'catalog-client.js'), 'utf8'), sandbox);
const CC = sandbox.CatalogClient;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };

console.log('\nEvery tool brand resolves to the key the catalog actually stores');
if (!CC || !CC.BRAND_MAP) {
  bad('catalog-client.js did not expose CatalogClient.BRAND_MAP');
} else {
  for (const toolBrand of Object.keys(CC.BRAND_MAP)) {
    const want = CC.BRAND_MAP[toolBrand];
    const vendor = CC.VENDOR_BY_BRAND[toolBrand];
    if (!vendor) { bad(`${toolBrand} has no VENDOR_BY_BRAND entry, so titles cannot be stripped`); continue; }

    // This is the exact call buildCatalog makes, on the exact vendor string the
    // tool writes into Shopify. If these disagree, the brand silently unlinks.
    const got = brandFor(vendor).key;
    if (got === want) ok(`${toolBrand}: vendor "${vendor}" -> ${got}`);
    else bad(`${toolBrand}: BRAND_MAP says ${want} but brandFor("${vendor}") says ${got}`, { toolBrand, vendor, want, got });

    if (got === 'UNKNOWN') bad(`${toolBrand} falls through to UNKNOWN, add it to BRANDS in parsers.js`);
  }
}

console.log('\nNo two brands share a key, which would merge two catalogs into one');
const seen = new Map();
for (const [vendor, def] of Object.entries(BRANDS)) {
  // HOKA and ON each have two legitimate vendor spellings pointing at one key.
  if (!seen.has(def.key)) seen.set(def.key, []);
  seen.get(def.key).push(vendor);
}
for (const [key, vendors] of seen) {
  const toolBrands = Object.keys(CC.BRAND_MAP || {}).filter((b) => CC.BRAND_MAP[b] === key);
  if (toolBrands.length > 1) bad(`${key} is claimed by more than one tool brand`, toolBrands);
  else ok(`${key} <- ${vendors.join(', ')}`);
}

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
