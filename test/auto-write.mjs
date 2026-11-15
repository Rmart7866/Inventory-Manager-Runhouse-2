// The weekend auto write (tools/auto-write.mjs, 2026-11-14): the checks that
// turn a scheduled write into a refusal, and that every runner calls it on a
// PASS only. Offline, made up numbers, writes nothing.
// Run: node test/auto-write.mjs
// House style: no em dashes.
import fs from 'node:fs';
import os from 'node:os';
process.env.AUTOWRITE_LOG = os.tmpdir() + '/runhouse-autowrite-test.log';
const { judge, LIMITS, autoWrite, loadTool } = await import('../tools/auto-write.mjs');

let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };

const plan = (o = {}) => ({ removed: 0, liveColorways: 100, removedShare: 0, ...o });
const dry = (change, unchanged = 0, unchangedUnits = 0, unchangedStocked = 0) => ({ change, unchanged, unchangedUnits, unchangedStocked });

console.log('\nA normal night writes');
ok(judge(plan(), dry([{ sku: 'A', from: 5, to: 7 }, { sku: 'B', from: 4, to: 0 }], 100, 2000, 90)).ok, 'a few changes, one zero, is fine');
ok(judge(plan(), dry([{ sku: 'A', from: 30, to: 300 }], 10, 100, 10)).ok, 'units going UP is never a refusal (real numbers replacing 30+)');

console.log('\nA bad file refuses');
const r1 = judge(plan({ removed: 40, removedShare: 0.4 }), dry([]));
ok(!r1.ok && /partial or wrong file/.test(r1.blocks[0]), 'zeroing 40% of live colourways refuses, the tracker report\'s own line', r1.blocks);
const z = Array.from({ length: 30 }, (_, i) => ({ sku: 'Z' + i, from: 5, to: 0 }));
const r2 = judge(plan(), dry(z, 70, 700, 70));
ok(!r2.ok && /to 0/.test(r2.blocks[0]), '30 of 100 stocked variants to 0 refuses', r2.blocks);
const r3 = judge(plan(), dry([{ sku: 'A', from: 1000, to: 100 }], 10, 100, 10));
ok(!r3.ok && /fall/.test(r3.blocks.join(' ')), 'Needham units halving refuses', r3.blocks);
ok(judge(plan(), dry([{ sku: 'A', from: 100, to: 10 }])).ok, 'a tiny brand under ' + LIMITS.minUnitsForShare + ' units is not judged on the unit drop');

console.log('\nIt never writes on anything but PASS');
const b = await autoWrite('brooks', [], { verdict: 'BLOCKED' });
ok(b.skipped && !b.written, 'a BLOCKED verdict is skipped before anything is read');
const n = await autoWrite('brooks', [], { verdict: undefined });
ok(n.skipped, 'no verdict at all is skipped too');

console.log('\nIt runs the tool\'s own code');
const T = loadTool();
ok(typeof T.maskLowStock === 'function' && typeof T.alignInventoryToCatalog === 'function', 'main.js helpers load');
ok(typeof T.BrandPicker._onShopify === 'function' && typeof T.InventoryTracker.compare === 'function', 'picker and tracker load');
ok(['saucony', 'merrell', 'puma', 'altra', 'newbalance', 'hoka', 'asics', 'brooks', 'on'].every((k) => T.BRAND_CONFIG[k] && T.BRAND_CONFIG[k].converter()), 'every brand converter is there');

console.log('\nEvery runner calls it after the upload, on its own verdict');
const src = (f) => fs.readFileSync(new URL('../tools/' + f, import.meta.url), 'utf8');
for (const f of ['b2b-ats-run.mjs', 'wolverine-headless-run.mjs', 'on-headless-run.mjs', 'brooks-headless-run.mjs', 'hoka-headless-run.mjs', 'asics-headless-run.mjs']) {
  const s = src(f);
  const aw = s.indexOf('await autoWrite(');
  const up = Math.max(s.lastIndexOf('await uploadFeed(', aw), s.lastIndexOf('await uploadWorkbook(', aw));
  ok(aw > up && up > 0 && /verdict: lastJudgement && lastJudgement\.verdict/.test(s), f + ' writes after the upload, with the verdict');
}
ok(/if \(LINK_API\) await autoWrite\('asics'/.test(src('asics-headless-run.mjs')), 'ASICS writes the link list only, never the full catalog sweep');
const brooks = src('brooks-headless-run.mjs');
ok(brooks.indexOf('if (SMOKE)') < brooks.indexOf('await autoWrite('), 'a Brooks smoke test returns before the write');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
