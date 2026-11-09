// Order prep must never place an order. Structural checks on hoka.js: every
// click goes through safeClick(), and safeClick refuses the buttons that
// submit or save an order. A future edit that adds a bare .click() fails here.
import fs from 'node:fs';
import vm from 'node:vm';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };
const src = fs.readFileSync(new URL('../hoka.js', import.meta.url), 'utf8');
const code = src.replace(/\/\/[^\n]*/g, '');

const clicks = [...code.matchAll(/\.click\(\)/g)].length;
const inSafe = /function safeClick\([^)]*\)\s*\{[^}]*el\.click\(\)/.test(code);
check('exactly one raw .click(), and it is inside safeClick', clicks === 1 && inSafe);

const m = /const FORBIDDEN = (\/[^\n]+\/[a-z]*);/.exec(code);
const FORBIDDEN = m && vm.runInNewContext(m[1]);
check('the guard refuses Submit Order, Save As Draft, Clear All and Place order', !!FORBIDDEN && ['Submit Order', 'Save As Draft', 'Clear All', 'Place order', 'SUBMIT'].every((t) => FORBIDDEN.test(t)));
check('and allows the steps prep needs', !!FORBIDDEN && ['Upload', 'Save', 'Confirm', 'Remove'].every((t) => !FORBIDDEN.test(t)));
check('no selector reaches for a submit button', !/btn-id="[^"]*[Ss]ubmitOrder"(?!Setting)/.test(code) && !/querySelector[^\n]*Submit Order/.test(code));

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
