// auth.mjs, The Run House.
//
// Tests the auth seam, and above all the write gate.
//
// The gate is the thing standing between "a token anyone can read out of public
// JavaScript" and "an endpoint that can zero the store's inventory". It is worth
// a test that fails loudly, because the failure mode is silent: someone adds
// POST /inventory, it works in dev, and it ships.
//
// Run: npm run test:auth
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { requireAuth, requireAdmin, WriteGateError } from '../src/auth.js';

let failures = 0;
const ok = (name) => console.log(`  ok    ${name}`);
const bad = (name, detail) => { failures++; console.log(`  FAIL  ${name}${detail ? '\n          ' + detail : ''}`); };

function check(name, cond, detail) {
  cond ? ok(name) : bad(name, detail);
}

const req = (headers = {}) => new Request('https://example.com/catalog', { headers });

const BEARER = { AUTH_MODE: 'bearer', CATALOG_TOKEN: 'correct-horse-battery-staple' };

console.log('\nBearer mode, read routes');

check(
  'no token is rejected',
  !(await requireAuth(req(), BEARER, { forWrite: false })).ok
);

check(
  'wrong token is rejected',
  !(await requireAuth(req({ Authorization: 'Bearer nope' }), BEARER, { forWrite: false })).ok
);

check(
  'a token of the same length but different bytes is rejected',
  !(await requireAuth(
    req({ Authorization: 'Bearer correct-horse-battery-stapleX'.slice(0, 28) }),
    BEARER, { forWrite: false }
  )).ok
);

check(
  'correct token is accepted',
  (await requireAuth(req({ Authorization: 'Bearer correct-horse-battery-staple' }), BEARER, { forWrite: false })).ok
);

check(
  'bearer identity is anonymous, it cannot say WHO called',
  (await requireAuth(req({ Authorization: 'Bearer correct-horse-battery-staple' }), BEARER, { forWrite: false }))
    .identity.email === null
);

check(
  'missing CATALOG_TOKEN fails closed, it does not mean "no auth"',
  !(await requireAuth(req({ Authorization: 'Bearer anything' }), { AUTH_MODE: 'bearer' }, { forWrite: false })).ok
);

console.log('\nThe write gate');

async function throwsGate(env, label) {
  try {
    await requireAuth(req({ Authorization: 'Bearer correct-horse-battery-staple' }), env, { forWrite: true });
    bad(label, 'requireAuth returned instead of throwing WriteGateError');
    return;
  } catch (e) {
    check(label, e instanceof WriteGateError, `threw ${e?.constructor?.name}: ${e?.message}`);
  }
}

await throwsGate(BEARER, 'a write in bearer mode throws WriteGateError');

// The important one. DEV_BYPASS_AUTH is checked AFTER the gate on purpose, so a
// stray dev flag cannot be the thing that lets a write route ship.
await throwsGate(
  { ...BEARER, DEV_BYPASS_AUTH: 'true' },
  'DEV_BYPASS_AUTH does NOT open the write gate'
);

await throwsGate({ AUTH_MODE: 'nonsense' }, 'an unknown AUTH_MODE does not open the write gate');
await throwsGate({}, 'an absent AUTH_MODE defaults closed for writes');

// In access mode the gate lets the call through to real verification, which then
// fails on its own terms because nothing is configured. The distinction matters:
// "refused to serve" and "served, then rejected you" are different states.
try {
  const r = await requireAuth(req(), { AUTH_MODE: 'access' }, { forWrite: true });
  check('access mode passes the gate and defers to JWT verification', !r.ok && /not configured/i.test(r.reason), JSON.stringify(r));
} catch (e) {
  bad('access mode passes the gate', `threw ${e?.constructor?.name}`);
}

console.log('\nAdmin token, the ?fresh=1 rebuild path');

const ADMIN = { ADMIN_TOKEN: 'admin-secret' };
check('rebuild without the admin token is refused', !requireAdmin(req(), ADMIN).ok);
check('rebuild with the browser token is refused',
  !requireAdmin(req({ Authorization: 'Bearer correct-horse-battery-staple' }), ADMIN).ok);
check('rebuild with the admin token as bearer is allowed',
  requireAdmin(req({ Authorization: 'Bearer admin-secret' }), ADMIN).ok);
check('rebuild accepts X-Admin-Token',
  requireAdmin(req({ 'X-Admin-Token': 'admin-secret' }), ADMIN).ok);
check('missing ADMIN_TOKEN fails closed',
  !requireAdmin(req({ Authorization: 'Bearer whatever' }), {}).ok);

// THE REAL FLOW. ?fresh=1 arrives with the catalog token as the bearer (spent by
// requireAuth) AND the admin token in X-Admin-Token. The admin header must win,
// or the bearer shadows it and the gate can never pass. This is the case the
// first version of this test missed, and the bug shipped because of it.
check('rebuild passes when catalog token is bearer and admin token is in X-Admin-Token',
  requireAdmin(req({ Authorization: 'Bearer correct-horse-battery-staple', 'X-Admin-Token': 'admin-secret' }), ADMIN).ok);
check('rebuild still refuses a wrong X-Admin-Token even with a valid bearer',
  !requireAdmin(req({ Authorization: 'Bearer correct-horse-battery-staple', 'X-Admin-Token': 'nope' }), ADMIN).ok);

console.log('');
if (failures) {
  console.log(`AUTH TESTS FAILED: ${failures} check(s).\n`);
  process.exit(1);
}
console.log('Auth OK. The write gate holds.\n');
