// ASICS order prep: our SKU to ASICS' basket, the state picker, and the no-submit guard.
import fs from 'node:fs';
import vm from 'node:vm';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };
const ctx = { window: {}, globalThis: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../common.js', import.meta.url), 'utf8'), ctx);
const P = ctx.window.RHPrep;
const L = (sku, qty = 1, title = 'x') => ({ sku, qty, title });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The SKU shapes on the store, read off the 2026-11-27 ASICS file.
const a = (s) => { const r = P.asicsLine(L(s)); return r && [r.style, r.colour, r.sizeKey, r.size]; };
check('a whole size: 1011C167-002-10 is style 1011C167, colour 002, size 10', same(a('1011C167-002-10'), ['1011C167', '002', '10', '10']));
check('a half: 1055 is 10.5, sent to ASICS as 10H', same(a('1011C167-002-1055'), ['1011C167', '002', '10H', '10.5']));
check('a small half: 155 is 1.5 (1H), not 15.5', same(a('1014A100-001-155'), ['1014A100', '001', '1H', '1.5']));
check('15 stays 15, not 1 and a half', same(a('1011B867-001-15'), ['1011B867', '001', '15', '15']));
check('a width suffix is only a label: -D, -2E, -4E', same(a('1012B888-401-8-D'), ['1012B888', '401', '8', '8']) && same(a('1011B867-001-955-2E'), ['1011B867', '001', '9H', '9.5']) && same(a('1011B867-001-12-4E'), ['1011B867', '001', '12', '12']));
check('lower case reads the same', same(a('1011c167-002-10'), ['1011C167', '002', '10', '10']));
check('a singlet (TF3085-01-M) is not read: not dropship', P.asicsLine(L('TF3085-01-M')) === null);
check('a two digit colour or a junk SKU is not read', [ '1011C167-02-10', '1011C167-002-', '1011C167-002-10.5', 'ASICS-1', '', null ].every((s) => P.asicsLine(L(s)) === null));

const g = P.asicsGroups([L('1011C167-002-10', 1, 'Kayano'), L('1011C167-002-1055', 2, 'Kayano'), L('1011C167-020-9'), L('1011C167-002-10', 1, 'Kayano')]);
check('grouped by colourway, one stock call each', g.length === 2 && g[0].key === '1011C167-002' && g[1].key === '1011C167-020');
check('the same size twice adds up rather than sending two lines', same(g[0].pairs.map((p) => [p.sizeKey, p.qty]), [['10', 2], ['10H', 2]]));
let threw = false; try { P.asicsGroups([L('1011C167-002-10'), L('nonsense')]); } catch (e) { threw = /cannot read/.test(e.message); }
check('a line that cannot be read stops the draft, never guessed', threw);

// The Sales District list: by code as a word or by full name, never a near miss.
const sm = (t, c) => P.stateMatches(t, c);
check('MA matches "MA", "MA - Massachusetts", "Massachusetts"', sm('MA', 'MA') && sm('MA - Massachusetts', 'MA') && sm('Massachusetts', 'MA'));
check('Virginia (VA) does not match "West Virginia"', !sm('West Virginia', 'VA') && sm('Virginia', 'VA') && sm('West Virginia', 'WV'));
check('Kansas (KS) does not match "Arkansas"', !sm('Arkansas', 'KS') && sm('Kansas', 'KS'));
check('MA does not match "MAINE" or "Michigan", ME does not match "Massachusetts"', !sm('MAINE', 'MA') && !sm('Michigan', 'MA') && !sm('Massachusetts', 'ME'));
check('an unknown code matches nothing', !sm('Massachusetts', 'ZZ') && !sm('', 'MA'));

// The guard, shared with the other suppliers.
check('the guard refuses Submit, Place order, Submit Order and Agree', ['Submit', 'Submit Order', 'Place order', 'Place Order', 'I agree'].every((t) => P.FORBIDDEN.test(t)));
check('and allows what ASICS needs: Change Address, Save, a state name', ['Change Address', 'Save', 'Massachusetts', 'DE - Delaware', 'Add To Cart'].every((t) => !P.FORBIDDEN.test(t)));

// asics.js itself.
const src = fs.readFileSync(new URL('../asics.js', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
check('asics.js clicks nothing itself: every click goes through safeClick', !/\.click\(\)/.test(src) && !/new MouseEvent\('click'/.test(src) && !/new PointerEvent/.test(src));
check('it never ticks a box: the three terms boxes are a person\'s', !/checked\s*=(?!=)/.test(src) && !/terms-of-use|privacy-policy|terms-and-conditions/.test(src));
check('it refuses a basket that is not empty', /already holds/.test(src) && /lines \|\| \[\]\)\.length/.test(src));
check('the only write it makes to ASICS is the basket lines PATCH', (src.match(/method: '(POST|PUT|PATCH|DELETE)'/g) || []).join() === "method: 'PATCH'" && /\/aac\/baskets\/' \+ no \+ '\/lines'/.test(src));
check('it sends the XSRF token ASICS requires (419 without it)', /X-XSRF-TOKEN/.test(src) && /XSRF-TOKEN=/.test(src));
check('the PO is cut to ASICS\' 24 characters', /PO_MAX = 24/.test(src));
check('the ship-to is read back from ASICS, not trusted from the page', /await basket\(\)[\s\S]{0,120}shipTo/.test(src));

// The manifest, staff.js and late.js agree that ASICS exists.
const man = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
check('the manifest runs common.js then asics.js on b2b.asics.com', man.content_scripts.some((c) => c.matches.includes('https://b2b.asics.com/*') && same(c.js, ['common.js', 'asics.js'])) && man.host_permissions.includes('https://b2b.asics.com/*'));
const staff = fs.readFileSync(new URL('../staff.js', import.meta.url), 'utf8');
const late = fs.readFileSync(new URL('../../../late.js', import.meta.url), 'utf8');
const re = /\/\^\\d\{4\}\[A-Z\]\\d\{3\}-\\d\{3\}-\\d\{1,2\}\?\(55\)\?\(-\(\[A-Z\]\|\\dE\)\)\?\$\/i/;
check('staff.js and late.js accept the same ASICS SKU shape', re.test(staff) && re.test(late) && /'asics'/.test(staff));
const shape = vm.runInNewContext(re.exec(late)[0].replace(/^/, ''));
check('and that shape agrees with asicsLine on every case above', ['1011C167-002-10', '1011C167-002-1055', '1012B888-401-8-D', '1011B867-001-955-2E'].every((s) => shape.test(s) && P.asicsLine(L(s))) && ['TF3085-01-M', '1011C167-02-10'].every((s) => !shape.test(s) && !P.asicsLine(L(s))));

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
