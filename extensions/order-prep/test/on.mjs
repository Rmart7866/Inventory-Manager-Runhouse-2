// ON order prep: our order line to ON's re-order page, and the no-submit
// guard in common.js and on.js.
import fs from 'node:fs';
import '../common.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };
const P = globalThis.RHPrep;

console.log('\nOur line to ON\'s page');
check('the re-order card name comes off our title', P.onModel("ON Men's Cloud 6 WP - Storm Larch") === 'Cloud 6 WP' && P.onModel("ON Women's Cloud X 5 - Ivory Surf") === 'Cloud X 5' && P.onModel("ON Men's Cloud 6 Wide - Glacier White") === 'Cloud 6 Wide');
check('a family prefix is dropped', P.onModel("ON Men's Boom | Cloudboom Volt - Black") === 'Cloudboom Volt');
check('the article code comes off the SKU', P.onArticle('ON-3MF10071043-BLA-1255') === '3MF10071043' && P.onArticle('HOKA-1') === '');
check('size from the variant title, whole sizes without .0', P.onSize({ variant: '12.5 / Black Black' }) === '12.5' && P.onSize({ variant: '12.0' }) === '12' && P.onSize({ variant: '7.0' }) === '7');
check('size from the SKU when the title has none: a trailing 55 is the half', P.onSize({ sku: 'ON-3MF10071043-BLA-1255' }) === '12.5' && P.onSize({ sku: 'ON-3MG10430070-GLA-1155' }) === '11.5' && P.onSize({ sku: 'ON-X-755' }) === '7.5');
check('and size 15 stays 15, not 1.5', P.onSize({ sku: 'ON-3MF10071043-BLA-15' }) === '15' && P.onSize({ sku: 'ON-3MF10071043-BLA-11' }) === '11' && P.onSize({ sku: 'ON-3MF10071043-BLA-5' }) === '5');

console.log('\nNever submits, on ON either');
check('the guard refuses Submit order, Place order, Agree, Delete and Discard', ['Submit order', 'Place order', 'I agree', 'Delete order', 'Discard and exit'].every((t) => P.FORBIDDEN.test(t)));
check('and allows Continue, Save, Edit order name and One time address', ['Continue', 'Save', 'Edit order name', 'One time address'].every((t) => !P.FORBIDDEN.test(t)));
const strip = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
const on = strip('on.js'), common = strip('common.js');
check('on.js clicks nothing itself: every click goes through safeClick', !/\.click\(\)/.test(on) && !/new MouseEvent\('click'/.test(on));
check('common.js has its one click and one click event, both inside safeClick', (common.match(/\.click\(\)/g) || []).length === 1 && (common.match(/new MouseEvent\('click'/g) || []).length === 1 && /function safeClick[\s\S]*?el\.click\(\)[\s\S]*?new MouseEvent\('click'/.test(common));
check('on.js never names the Submit button', !/['"]Submit order['"]/.test(on.replace(/<b>Submit order<\/b>/g, '')));

console.log('\nNo barcode: the right colour\'s box (#90267-EXC (2), 2026-11-17)');
{
  // ON's grid as the picker sees it: the OUTER block holds both colours of the
  // model, Ghost Verdite first; each colour's own row holds its article code.
  const gv = { label: 'Ghost | Verdite size 7.5 quantity', ref: 'GHOST-7.5' };
  const bb = { label: 'Black | Black size 7.5 quantity', ref: 'BLACK-7.5' };
  const bb8 = { label: 'Black | Black size 8 quantity', ref: 'BLACK-8' };
  const outer = { text: 'Cloudrunner 3 Wide 3MG10095248 Ghost Verdite ... 3MG10091043 Black Black ...', inputs: [gv, bb, bb8] };
  const rowBlack = { text: '3MG10091043 Black Black ...', inputs: [bb, bb8] };
  const line = { title: "ON Men's Cloudrunner 3 Wide - Black Black", variant: '7.5 / Black Black', sku: 'ON-3MG10091043-BLA-755', upc: '1912537576' };
  check('our colour comes off the variant', P.onColour(line) === 'Black Black');
  check('THE BUG: the Black Black 7.5 lands in Black Black, not Ghost Verdite', P.onPickBox([outer, rowBlack], '3MG10091043', '7.5', P.onColour(line)) === 'BLACK-7.5');
  check('only the outer block on the page: the colour on the label still decides', P.onPickBox([outer], '3MG10091043', '7.5', 'Black Black') === 'BLACK-7.5');
  check('two boxes for the size and no colour to tell them apart: nothing typed', P.onPickBox([outer], '3MG10091043', '7.5', '') === null);
  check('a size with no box: nothing typed', P.onPickBox([rowBlack], '3MG10091043', '9', 'Black Black') === null);
  check('the colour from the title when the variant has only a size', P.onColour({ title: "ON Men's Cloud 6 - Glacier White", variant: '9.0' }) === 'Glacier White');
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
