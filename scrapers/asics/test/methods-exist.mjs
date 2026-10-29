// methods-exist.mjs, The Run House.
//
// EVERY `this.x()` CALL MUST RESOLVE TO A METHOD ON THE CLASS THAT MAKES IT.
//
// This exact bug has now cost two outages, and neither was found by a test
// that checked behaviour:
//
//   locationForScrapedUrl  defined on UnifiedShopifyConverter, called on
//                          EnhancedASICSInventoryExtractor. Every page of
//                          every run threw right AFTER extracting its rows
//                          successfully, so the console said "Extracted 80
//                          inventory records" and then the run died with no
//                          file. Four days, 2026-10-23 to 2026-10-27.
//
//   basketNoFromUrl        called by extractSingletInventoryFromApi and never
//                          defined at all: it belonged to the API work that
//                          was reverted on 2026-10-26, and the singlet path
//                          was added after the revert, so the call site
//                          outlived the method. Because API only styles have
//                          NO DOM fallback by design, both singlets returned
//                          zero rows on every run and the link list never
//                          updated them, silently.
//
// Behaviour tests cannot catch this shape, because the method is usually
// fine; it is the WIRING that is wrong. A structural check is cheap, runs in
// milliseconds, and would have caught both on the commit that introduced
// them.
//
// Run: node scrapers/asics/test/methods-exist.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };

// Methods that are genuinely inherited or supplied from outside the class
// body, so a call to them is not a missing definition.
const EXTERNAL = new Set(['constructor']);

function classBody(src, name, endMarker) {
  const start = src.indexOf('class ' + name + ' {');
  if (start < 0) return null;
  const end = endMarker ? src.indexOf(endMarker, start) : src.length;
  return src.slice(start, end > start ? end : src.length);
}

function audit(label, body) {
  if (!body) { bad('could not find ' + label + ', has it been renamed?'); return; }
  const defined = new Set([...body.matchAll(/^\s{4}(?:static\s+|async\s+|get\s+|set\s+)*([a-zA-Z_$][\w$]*)\s*\(/gm)]
    .map(m => m[1]));
  const calls = [...body.matchAll(/this\.([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1]);
  const missing = [...new Set(calls)].filter(c => !defined.has(c) && !EXTERNAL.has(c));
  if (missing.length) {
    bad(label + ' calls methods it does not have: ' + missing.join(', '),
      { hint: 'either define them here or call them on the class that has them' });
  } else {
    ok(label + ': all ' + new Set(calls).size + ' distinct this.x() calls resolve, ' +
      defined.size + ' methods defined');
  }
}

const content = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');
const background = fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8');

console.log('\nEvery this.x() call resolves on the class that makes it');
audit('EnhancedASICSInventoryExtractor',
  classBody(content, 'EnhancedASICSInventoryExtractor', '\nEnhancedASICSInventoryExtractor.API_GENDER'));
audit('UnifiedShopifyConverter', classBody(content, 'UnifiedShopifyConverter', '\nclass EnhancedASICSInventoryExtractor'));
audit('UnifiedCSVManager', classBody(background, 'UnifiedCSVManager', '\nconst csvManager'));

console.log('\nThe two methods this test exists for are specifically in place');
{
  const ext = classBody(content, 'EnhancedASICSInventoryExtractor', '\nEnhancedASICSInventoryExtractor.API_GENDER');
  const conv = classBody(content, 'UnifiedShopifyConverter', '\nclass EnhancedASICSInventoryExtractor');
  /^\s{4}locationForScrapedUrl\s*\(/m.test(ext)
    ? ok('locationForScrapedUrl is on the extractor, which is what calls it')
    : bad('locationForScrapedUrl is not on the extractor');
  /^\s{4}locationForScrapedUrl\s*\(/m.test(conv)
    ? bad('locationForScrapedUrl is back on the converter, where nothing can reach it')
    : ok('and not on the converter');
  /^\s{4}basketNoFromUrl\s*\(/m.test(ext)
    ? ok('basketNoFromUrl is defined, so the singlet API path can run at all')
    : bad('basketNoFromUrl is missing again, both singlets will return zero rows silently');

  // It must read the ORDER from the path. "Current basket" is whatever the
  // staff member last opened, and the link list pins an order per style.
  /orders\\\/\(\\d\+\)/.test(ext) || /orders\\\/\(\\d/.test(ext)
    ? ok('and it reads the order number out of the path')
    : bad('basketNoFromUrl no longer reads the order from the url path');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
