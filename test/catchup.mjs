// The catch up for nightly jobs the Mac slept through (tools/catchup.mjs).
// Run: node test/catchup.mjs
// House style: no em dashes.
import { lastSlot, isMissed, JOBS } from '../tools/catchup.mjs';
let fails = 0;
const ok = (c, m, x) => { console.log((c ? '  ok    ' : '  FAIL  ') + m + (c || x === undefined ? '' : '  -> ' + JSON.stringify(x))); if (!c) fails++; };
const at = (s) => new Date(s);

const brooks = [{ Hour: 6, Minute: 0 }, { Hour: 12, Minute: 0 }, { Hour: 18, Minute: 0 }];
ok(lastSlot(brooks, at('2026-11-16T08:20:00')).getHours() === 6, 'at 8:20 the latest Brooks slot is 6 AM');
ok(lastSlot(brooks, at('2026-11-16T05:00:00')).getDate() === 15, 'before 6 AM it is yesterday 6 PM');
ok(lastSlot({ Hour: 1, Minute: 0 }, at('2026-11-16T00:30:00')).getDate() === 15, 'a single dict works, and rolls back a day');

const slot = at('2026-11-16T05:30:00'), now = at('2026-11-16T08:20:00');
ok(isMissed(slot, [at('2026-11-15T05:30:28')], now), 'yesterday\'s file means today was missed');
ok(!isMissed(slot, [at('2026-11-16T05:31:00')], now), 'a file after the slot means it ran');
ok(isMissed(slot, [at('2026-11-16T05:31:00'), at('2026-11-15T05:31:00')], now), 'Wolverine needs BOTH brands fresh');
ok(isMissed(slot, [null], now), 'no file at all is missed');
ok(!isMissed(at('2026-11-15T05:30:00'), [null], at('2026-11-16T05:00:00')), 'a slot over 20 hours old is left for its next slot');

const names = { asics: 'asics-linkapi-2026-11-15_060440.csv', merrell: 'CatalogUPCs-Merrell At Once nightly-2026-11-15_103118.xlsx',
  saucony: 'CatalogUPCs-Autumn Winter 2026 Performance At-Once nightly-2026-11-15_103028.xlsx', on: 'on-running-inventory-1794739828343.csv',
  brooks: 'brooks-fullcatalog-2026-11-15_110138.csv', altra: 'Altra ATS nightly-2026-11-13_164457.xlsx' };
const job = (k) => JOBS.find((j) => j.label.includes(k));
ok(job('asics').files[0].test(names.asics) && job('on').files[0].test(names.on) && job('brooks').files[0].test(names.brooks), 'the CSV brands find their files');
ok(job('wolverine').files[0].test(names.saucony) && job('wolverine').files[1].test(names.merrell), 'Wolverine finds Saucony and Merrell');
ok(!job('on').files[0].test('on-running-inventory-1794739828343-images.json'), 'ON\'s images file is not its stock file');
ok(job('altra').files[0].test(names.altra) && !job('hoka').files[0].test(names.altra), 'an Altra file is never read as HOKA\'s');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
