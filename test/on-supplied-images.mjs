// on-supplied-images.mjs, The Run House.
//
// ON is the only SUPPLIED image source. Brooks, New Balance and ASICS publish
// at a URL you can build from the code in the SKU, so Stage 4 derives and HEAD
// checks each view. ON's asset ids are opaque uuids: nothing is derivable, the
// URLs come from the Backstage catalog, ride to the tool in the scraper's
// sidecar file, and are read back out of OnConverter.
//
// THE BROWSER STILL DOWNLOADS NOTHING. A supplied URL is handed to Shopify as
// an originalSource and Shopify fetches it, exactly as the derived ones are.
//
// Run: node test/on-supplied-images.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sb = { console: { log() {}, warn() {}, error() {} }, setTimeout(f){ if(f) f(); },
  fetch: () => Promise.reject(new Error('a supplied source must not probe')),
  localStorage: { getItem: () => null, setItem() {} }, navigator: {}, location: { href: '' },
  document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, appendChild() {}, classList: { add() {}, remove() {} } }),
    body: { appendChild() {} }, head: { appendChild() {} } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../on-converter.js', import.meta.url), 'utf8'), sb);
vm.runInContext(fs.readFileSync(new URL('../product-enrichment.js', import.meta.url), 'utf8'), sb);
const PE = sb.ProductEnrichment || sb.ProductEnrichmentUI || sb.Enrichment;
const OC = sb.OnConverter;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, v) => { failures++; console.log('  FAIL  ' + m + '  -> ' + JSON.stringify(v)); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

if (!PE) { console.log('  FAIL  could not reach the enrichment module'); process.exit(1); }

console.log('\nThe article code in a SKU is the join to the catalog');
eq('a shoe', PE._imageKeyIn('on', 'ON-3MG10931043-BLA-9'), '3MG10931043');
eq('apparel', PE._imageKeyIn('on', 'ON-1WF30174944-FOX-LDDD'), '1WF30174944');

console.log('\nThe converter looks images up by that code');
{
  OC.imageUrls = { '3MG10931043': ['https://library.on.com/a', 'https://library.on.com/b'] };
  eq('two images', OC.imagesForSku('ON-3MG10931043-BLA-9').length, 2);
  eq('an unknown colorway gets none', OC.imagesForSku('ON-3ZZ99999999-BLA-9').length, 0);
  eq('a junk sku does not throw', OC.imagesForSku('nonsense').length, 0);
}

console.log('\nON is registered as a supplied source, not a derived one');
{
  const src = PE.remoteSourceFor('on');
  eq('there is a source', !!src, true);
  eq('marked supplied', src.supplied, true);
  eq('it has no views list to probe', src.views, undefined);
  eq('and it resolves urls', (src.urlsFor('3MG10931043') || []).length, 2);
}

console.log('\nloadRemoteImages indexes them WITHOUT any network probe');
{
  // fetch throws in this sandbox, so a probe would reject the promise.
  OC.imageUrls = { '3MG10931043': ['u1', 'u2', 'u3'] };
  const specs = [{ title: 'Cloudmonster 3', variants: [{ sku: 'ON-3MG10931043-BLA-9' }] }];
  const idx = await PE.loadRemoteImages('on', specs);
  eq('indexed under the article code', (idx['3MG10931043'] || []).length, 3);
  eq('each is marked remote, so Shopify fetches it', idx['3MG10931043'][0].remote, true);
  eq('and carries the url', idx['3MG10931043'][0].url, 'u1');
  eq('named in order', idx['3MG10931043'][0].name, '3MG10931043_01_supplied');
}

console.log('\nNo sidecar means no images, never wrong images');
{
  OC.imageUrls = {};
  const specs = [{ title: 'x', variants: [{ sku: 'ON-3MG10931043-BLA-9' }] }];
  const idx = await PE.loadRemoteImages('on', specs);
  eq('nothing indexed', Object.keys(idx).length, 0);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
