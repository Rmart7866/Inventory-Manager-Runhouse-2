// Brooks order prep: our SKU to FastTrack's grid, and the no-place guard.
import fs from 'node:fs';
import '../common.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };
const P = globalThis.RHPrep;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\nOur SKU to FastTrack');
check('tool SKU: style, colour, whole size from "1450", width',
  eq(P.brooksLine({ sku: '110478114-187-1450-D' }), { style: '110478', colour: '187', size: '14.0', width: 'D', key: '110478-187' }));
check('a trailing 55 is the half size, and 750 is 7.0',
  P.brooksLine({ sku: '110478114-187-1455-D' }).size === '14.5' && P.brooksLine({ sku: '110454410-020-750-B' }).size === '7.0');
check('two character widths survive', P.brooksLine({ sku: '110496015-020-1050-2E' }).width === '2E');
check("Brooks' own item number: 1D reads D, size in tenths",
  eq(P.brooksLine({ sku: '1104781D187.140' }), { style: '110478', colour: '187', size: '14.0', width: 'D', key: '110478-187' }) &&
  P.brooksLine({ sku: '1104962E020.075' }).width === '2E' && P.brooksLine({ sku: '1104962E020.075' }).size === '7.5');
check('a SKU that does not decode is null, never a guess',
  P.brooksLine({ sku: '110478114-187-1460-D' }) === null && P.brooksLine({ sku: 'HOKA-1' }) === null && P.brooksLine({ sku: '' }) === null);

console.log('\nNever places, on Brooks either');
check('the guard refuses Place basket, Validate availability and Clear basket',
  ['Step 2/2: Place basket', 'Step 1/2: Validate availability', 'Clear basket', 'Place order', 'Submit Order'].every((t) => P.FORBIDDEN.test(t)));
check('and allows Add items, Drop ship, Apply, the reference and the Needham tab',
  ['Add 1 items', 'Drop ship', 'Apply', 'BROOKS00AO3054048', '1005: The Run House 943 Great Plain Ave. , Needham, USA'].every((t) => !P.FORBIDDEN.test(t)));
check('and still allows what ON needs', ['Continue', 'Save', 'Edit order name', 'One time address'].every((t) => !P.FORBIDDEN.test(t)));

const strip = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
const br = strip('brooks.js');
check('brooks.js clicks nothing itself: every click goes through safeClick', !/\.click\(\)/.test(br) && !/new MouseEvent\('click'/.test(br) && !/new PointerEvent/.test(br));
check('brooks.js never ticks the resale certificate box, it only reads it',
  !/checked\s*=(?!=)/.test(br) && !/safeClick\(\s*box/.test(br) && /b\.checked/.test(br) && /confirm-text/.test(br));
check('brooks.js never names the Place basket button', !/Place basket['"]/.test(br.replace(/<b>Step 2\/2: Place basket<\/b>/g, '')));
check('the drop ship email is the Needham mailbox the tracking updater reads', /EMAIL = 'needham@therunhouse\.com'/.test(br));
check('items go under 1005 Needham, chosen before any box is typed in',
  /SHIP_TO = \/\^\\s\*1005/.test(br) && br.indexOf('await pickNeedham()') < br.indexOf('typeInto(el, String(p.qty))'));

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
