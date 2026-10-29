// method-wiring.mjs, The Run House.
//
// EVERY `this.x()` CALL MUST RESOLVE TO SOMETHING DEFINED ON THE CLASS OR
// OBJECT THAT MAKES IT.
//
// This one shape has now cost two outages here, and in both cases the METHOD
// was fine. It was the wiring that was wrong, which is why no behaviour test
// caught either of them:
//
//   locationForScrapedUrl  defined on UnifiedShopifyConverter, called on
//                          EnhancedASICSInventoryExtractor. Every page of
//                          every run threw right AFTER extracting its rows,
//                          so the console read "Extracted 80 inventory
//                          records" and then the run died with no file.
//                          Four days, 2026-10-23 to 2026-10-27.
//
//   basketNoFromUrl        called by extractSingletInventoryFromApi and never
//                          defined anywhere. It belonged to the API work
//                          reverted on 2026-10-26 and the singlet path was
//                          added after, so the call site outlived the method.
//                          API only styles have NO DOM fallback by design, so
//                          both singlets returned zero rows on every run and
//                          the link list never updated them. Silent, because
//                          the safety rule in front of it was working.
//
// Run: node test/method-wiring.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };

// Dead per CLAUDE.md, so a finding there is not a live bug. Named rather than
// skipped silently, so the list stays honest.
const DEAD = new Set(['tracking-integration.js']);

// ---------------------------------------------------------- the lexer -----
//
// THREE CHEAPER APPROACHES WERE TRIED AND ALL THREE GAVE WRONG ANSWERS, which
// is why there is a lexer here at all:
//
//   indentation          scrapers/puma/content.js and
//                        scrapers/newbalance/content.js define methods FLUSH
//                        LEFT inside a class, so an indentation rule reads
//                        every one of them as absent.
//   a column zero brace  same files: a flush left method's own closing brace
//                        sits in column zero, so it reads as the end of the
//                        class and truncates the body mid way.
//   naive string removal catalog-client.js came out with three unbalanced
//                        braces, so CatalogClient's body ran to the end of
//                        the file and its own methods read as undefined.
//
// So everything that is not code is blanked first, and the SELF CHECK below
// is what makes that trustworthy: after stripping, every file must have equal
// numbers of braces and parens. If a future file breaks the lexer, the test
// says so instead of quietly inventing findings.
export function stripNonCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let prev = '';
  // Each entry is { kind, depth }. Template literals nest through ${ }, as in
  // `a${ xs.map(function (x) { return `b`; }) }c`, so the depth matters: a
  // substitution can contain braces of its own and a naive "} ends the
  // substitution" rule pops on the function body's brace.
  const stack = [];
  const push = (kind) => stack.push({ kind, depth: 0 });
  const mode = () => (stack.length ? stack[stack.length - 1].kind : undefined);
  const top = () => stack[stack.length - 1];

  while (i < n) {
    const c = src[i], d = src[i + 1];
    const m = mode();

    if (m === 'tmpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); out += '_STR_'; prev = ')'; i++; continue; }
      if (c === '$' && d === '{') { push('subst'); out += '('; i += 2; continue; }
      if (c === '\n') out += '\n';          // keep line structure
      i++; continue;
    }

    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2; continue;
    }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        if (src[i] === '\n') out += '\n';
        i++;
      }
      out += '_STR_'; prev = ')'; continue;
    }
    if (c === '`') { push('tmpl'); i++; continue; }
    if (m === 'subst') {
      if (c === '{') { top().depth++; out += '{'; prev = '{'; i++; continue; }
      if (c === '}') {
        if (top().depth > 0) { top().depth--; out += '}'; prev = '}'; i++; continue; }
        stack.pop(); out += ')'; prev = ')'; i++; continue;
      }
    }
    // A slash begins a REGEX only where a value cannot precede it, otherwise
    // it is division. Without this, a regex containing a quote or a brace
    // desyncs the whole file.
    if (c === '/' && !/[\w$)\]]/.test(prev)) {
      let j = i + 1, inClass = false, closed = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '\n') break;                       // unterminated, so division
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { j++; closed = true; break; }
        j++;
      }
      if (closed) { while (j < n && /[gimsuy]/.test(src[j])) j++; out += '_RE_'; prev = ')'; i = j; continue; }
    }
    out += c;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

const balanced = (s) =>
  (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length &&
  (s.match(/\(/g) || []).length === (s.match(/\)/g) || []).length;

function blockAfter(src, braceIndex) {
  let depth = 0;
  for (let k = braceIndex; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(braceIndex, k); }
  }
  return null;                                        // unterminated, caller decides
}

// A definition is `name(args) {`, `name: function (...)`, or `name: (...) =>`,
// at any indentation. The parameter list CAN contain parentheses, as in
// `generateUniqueHandle(product, usedHandles = new Set()) {`, so the match
// runs to the last `)` on the line; a `\([^)]*\)` version stopped at the
// default value's paren and called the method undefined in three files.
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return',
  'else', 'do', 'try', 'with', 'typeof', 'new', 'delete', 'void', 'in', 'of', 'await']);

export function definedIn(body) {
  const names = new Set();
  for (const m of body.matchAll(/^[ \t]*(?:static\s+|async\s+|get\s+|set\s+|\*\s*)*([a-zA-Z_$][\w$]*)\s*\(.*\)\s*\{/gm)) {
    if (!KEYWORDS.has(m[1])) names.add(m[1]);
  }
  for (const m of body.matchAll(/^[ \t]*([a-zA-Z_$][\w$]*)\s*[:=]\s*(?:async\s+)?(?:function|\()/gm)) names.add(m[1]);
  return names;
}

export const callsIn = (body) =>
  [...new Set([...body.matchAll(/this\.([a-zA-Z_$][\w$]*)\s*\(/g)].map((m) => m[1]))];

// ------------------------------------------------------------ the scan -----
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js') && !e.name.includes('.min.') && e.name !== 'barcode-data.js') files.push(p);
  }
})(ROOT);

console.log('\nThe instrument checks out before it is trusted');
{
  const broken = files.filter((f) => !balanced(stripNonCode(fs.readFileSync(f, 'utf8'))))
    .map((f) => path.relative(ROOT, f));
  broken.length
    ? bad('the lexer desyncs on ' + broken.length + ' file(s), so every finding below is suspect', broken)
    : ok('all ' + files.length + ' files strip to balanced braces and parens');
}

const problems = [], deadProblems = [], unreadable = [];
let unitsScanned = 0;

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const raw = fs.readFileSync(f, 'utf8');
  const src = stripNonCode(raw);

  const units = [];
  for (const m of src.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)(\s+extends\s+[\w$.]+)?\s*\{/g)) {
    const body = blockAfter(src, src.indexOf('{', m.index));
    const extra = new Set();
    for (const sm of raw.matchAll(new RegExp('\\b' + m[1] + '\\.([a-zA-Z_$][\\w$]*)\\s*=', 'g'))) extra.add(sm[1]);
    units.push({ name: m[1], body, extra, inherits: !!m[2] });
  }
  for (const m of src.matchAll(/^(?:var|const|let)\s+([A-Z][\w$]*)\s*=\s*\{/gm)) {
    units.push({ name: m[1], body: blockAfter(src, src.indexOf('{', m.index)), extra: new Set(), inherits: false });
  }

  for (const u of units) {
    unitsScanned++;
    if (u.body === null) { unreadable.push(rel + '  ' + u.name); continue; }
    const defined = new Set([...definedIn(u.body), ...u.extra]);
    const missing = callsIn(u.body).filter((c) => !defined.has(c) && c !== 'constructor');
    if (!missing.length) continue;
    // A subclass legitimately calls what its parent defines.
    const note = u.inherits ? '  (extends, may inherit)' : '';
    (DEAD.has(rel) ? deadProblems : problems).push(rel + '  ' + u.name + ' -> ' + missing.join(', ') + note);
  }
}

console.log('\nEvery this.x() call resolves where it is made');
console.log('        scanned ' + files.length + ' files, ' + unitsScanned + ' classes and module objects');
problems.length
  ? bad(problems.length + ' unresolved call site(s), each one throws at runtime', problems)
  : ok('no unresolved this.x() call anywhere in live code');
if (unreadable.length) bad('could not find the body of ' + unreadable.length + ' unit(s)', unreadable);
if (deadProblems.length) {
  console.log('        note: ' + deadProblems.length + ' in files CLAUDE.md calls dead, not failed');
  deadProblems.forEach((p) => console.log('              ' + p));
}

console.log('\nThe two methods this test exists for are specifically in place');
{
  const content = fs.readFileSync(path.join(ROOT, 'scrapers/asics/content.js'), 'utf8');
  const src = stripNonCode(content);
  const bodyOf = (name) => {
    const m = new RegExp('\\bclass\\s+' + name + '\\b[^{]*\\{').exec(src);
    return m ? (blockAfter(src, src.indexOf('{', m.index)) || '') : '';
  };
  const ext = definedIn(bodyOf('EnhancedASICSInventoryExtractor'));
  const conv = definedIn(bodyOf('UnifiedShopifyConverter'));

  ext.has('locationForScrapedUrl')
    ? ok('locationForScrapedUrl is on the extractor, which is what calls it')
    : bad('locationForScrapedUrl is not on the extractor, so every scrape throws on it');
  conv.has('locationForScrapedUrl')
    ? bad('locationForScrapedUrl is back on the converter, where nothing can reach it')
    : ok('and not on the converter');
  ext.has('basketNoFromUrl')
    ? ok('basketNoFromUrl is defined, so the singlet API path can run at all')
    : bad('basketNoFromUrl is missing, so both singlets return zero rows SILENTLY');

  // It must read the ORDER out of the path. apiBasketNo() asks the portal for
  // the CURRENT basket, whatever the staff member last opened, while the link
  // list pins an order per style. A mismatch answers 403, not an error.
  /basketNoFromUrl\(\)\s*\{[\s\S]{0,200}?location\.pathname/.test(content)
    ? ok('and it reads the order number out of the url path, not the current basket')
    : bad('basketNoFromUrl no longer reads window.location.pathname');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
