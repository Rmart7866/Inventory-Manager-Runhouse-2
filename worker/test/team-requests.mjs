// team-requests.mjs, The Run House.
//
// Team store requests, driven through the REAL fetch handler so the routing
// and the gates are what is tested, not just the helpers. KV is an in-memory
// fake with the same four calls the code uses.
//
// What must never regress:
//   - a customer can file a request from the storefront and from nowhere else
//   - nothing a customer sends can be read back without the write secret
//   - staff edits cannot alter the stored original
//   - a build is DRAFT and create-only, and fails CLOSED when it cannot check
//
// Run: node test/team-requests.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import worker from '../src/index.js';
import { planProduct, productSetInputFor, slug } from '../src/teamreq-build.js';
import { clean } from '../src/teamreq.js';

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('  ok    ' + name);
  else { failures++; console.log('  FAIL  ' + name + (detail ? '\n          ' + detail : '')); }
};

function fakeKV() {
  const m = new Map();
  return {
    m,
    async get(k, t) {
      const e = m.get(k); if (!e) return null;
      if (t === 'json') return JSON.parse(e.v);
      return e.v;
    },
    async getWithMetadata(k) { const e = m.get(k); return e ? { value: e.v, metadata: e.meta } : { value: null, metadata: null }; },
    async put(k, v, o = {}) { m.set(k, { v, meta: o.metadata || null }); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m.keys()].filter((k) => k.startsWith(prefix)).sort().map((name) => ({ name, metadata: m.get(name).meta })), list_complete: true }; },
  };
}

const KV = fakeKV();
const ENV = {
  CATALOG: KV, AUTH_MODE: 'bearer', CATALOG_TOKEN: 'tok', WRITE_SECRET: 'sec',
  ALLOW_BEARER_WRITES: 'true', ALLOWED_ORIGINS: 'https://rmart7866.github.io',
  SHOP_URL: 'example.myshopify.com', CLIENT_ID: 'x', CLIENT_SECRET: 'y',
};
const call = (path, { method = 'GET', headers = {}, body } = {}) =>
  worker.fetch(new Request('https://w.example' + path, { method, headers, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }), ENV, {});
const STAFF = { Authorization: 'Bearer tok', 'X-Write-Secret': 'sec', 'Content-Type': 'application/json' };
const SHOPFRONT = { Origin: 'https://therunhouse.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' };

const sample = () => ({
  request: {
    v: 'x', mode: 'new', team: 'Walpole Track & Field',
    contact: { name: 'Coach', email: 'coach@example.com' },
    logo_files: { main: 'https://cdn.shopify.com/a.png' }, logo_names: { main: 'Main logo' },
    items: [{ style: 'PC380', colors: ['Deep Navy', 'Jet Black'], placement: 'Full chest', price: 25 }],
  },
  text: 'TEAM STORE REQUEST',
});

console.log('\nIntake');
let r = await call('/team-requests/submit', { method: 'POST', headers: SHOPFRONT, body: sample() });
let j = await r.json();
check('the storefront can file a request', r.status === 200 && j.ok && j.id, JSON.stringify(j));
const id = j.id;
check('and it answers with CORS for the storefront', r.headers.get('Access-Control-Allow-Origin') === 'https://therunhouse.com');

r = await call('/team-requests/submit', { method: 'POST', headers: { ...SHOPFRONT, Origin: 'https://evil.example' }, body: sample() });
check('another origin is refused', r.status === 403);
r = await call('/team-requests/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sample() });
check('no Origin at all (a script) is refused', r.status === 403);

const before = KV.m.size;
r = await call('/team-requests/submit', { method: 'POST', headers: SHOPFRONT, body: { ...sample(), hp: 'bot' } });
j = await r.json();
check('a tripped honeypot looks like success to the bot', r.status === 200 && j.ok);
check('and stores nothing', [...KV.m.keys()].filter((k) => k.startsWith('treq:')).length === 1, String(KV.m.size - before));

r = await call('/team-requests/submit', { method: 'POST', headers: SHOPFRONT, body: { request: { ...sample().request, contact: { email: 'nope' } } } });
check('a bad email is refused', r.status === 400);
r = await call('/team-requests/submit', { method: 'POST', headers: SHOPFRONT, body: 'x'.repeat(300 * 1024) });
check('an oversized body is refused', r.status === 413);

let last;
for (let i = 0; i < 10; i++) last = await call('/team-requests/submit', { method: 'POST', headers: { ...SHOPFRONT, 'CF-Connecting-IP': '9.9.9.9' }, body: sample() });
check('a flood from one address is rate limited', last.status === 429);

check('a stored string is capped', clean('y'.repeat(5000)).length === 2000);

console.log('\nStaff reads need the write secret');
r = await call('/team-requests', {});
check('no token at all: 401', r.status === 401);
r = await call('/team-requests', { headers: { Authorization: 'Bearer tok' } });
check('the PUBLIC catalog token alone cannot list requests', r.status === 403);
r = await call('/team-requests/one?id=' + id, { headers: { Authorization: 'Bearer tok' } });
check('nor read one', r.status === 403);
r = await call('/team-requests', { headers: STAFF });
j = await r.json();
check('with the write secret the list arrives', r.status === 200 && j.requests.some((x) => x.id === id));
check('and the list carries the summary without reading values', j.requests.find((x) => x.id === id).t === 'Walpole Track & Field');

console.log('\nEditing');
r = await call('/team-requests/one?id=' + id, { headers: STAFF });
let rec = await r.json();
check('the working copy starts from the submission', rec.work.items[0].style === 'PC380' && rec.work.logos.main.url.includes('a.png'));
check('the default tag is "<team> Team Store"', rec.work.tag === 'Walpole Track & Field Team Store');

r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, base: rec.updated, patch: { status: 'progress', req: { team: 'HACKED' }, work: { items: [{ style: 'DT6100', colors: ['Navy'], price: 45, boxes: { Navy: [0.3, 0.2, 0.4, 0.3] } }] } } } });
j = await r.json();
check('an edit saves', r.status === 200 && j.rec.status === 'progress' && j.rec.work.items[0].style === 'DT6100');
check('the stored original cannot be edited', j.rec.req.team === 'Walpole Track & Field');
check('a placement box survives the round trip', JSON.stringify(j.rec.work.items[0].boxes.Navy) === '[0.3,0.2,0.4,0.3]');
check('and the edit is logged', j.rec.log.some((l) => /status new to progress/.test(l.what)));

r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: { ...j.rec.work, release: '2026-12-05' } } } });
j = await r.json();
check('a release date saves', r.status === 200 && j.rec.work.release === '2026-12-05');
r = await call('/team-requests', { headers: STAFF });
check('and reaches the list summary the calendar reads', (await r.json()).requests.find((x) => x.id === id).r === '2026-12-05');
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: { ...j.rec.work, release: 'next friday' } } } });
check('a release date that is not a date is refused', r.status === 400);
const tilted = { ...j.rec.work, items: [{ ...j.rec.work.items[0], boxes: { '*': [0.3, 0.2, 0.2, 0.2, -12.5] } }] };
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: tilted } } });
check('a tilted box keeps its angle', (await r.json()).rec.work.items[0].boxes['*'][4] === -12.5);

r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, base: rec.updated, patch: { notes: 'stale' } } });
check('an edit from a stale copy is refused, not merged', r.status === 409);
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { status: 'bogus' } } });
check('an unknown status is refused', r.status === 400);


console.log('\nClose date, assignee, costs');
r = await call('/team-requests/one?id=' + id, { headers: STAFF });
rec = await r.json();
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: { ...rec.work, close: '2026-12-12', assignee: 'Ryan', items: rec.work.items.map((it) => ({ ...it, cost: 11.5 })) } } } });
j = await r.json();
check('a close date and an assignee save', j.rec.work.close === '2026-12-12' && j.rec.work.assignee === 'Ryan');
r = await call('/team-requests', { headers: STAFF });
let row = (await r.json()).requests.find((x) => x.id === id);
check('both reach the list summary', row.cl === '2026-12-12' && row.a === 'Ryan');
r = await call('/team-requests/costs', { headers: STAFF });
check('a typed cost is remembered for that style', (await r.json()).costs[j.rec.work.items[0].style] === 11.5);
r = await call('/team-requests/costs', { headers: { Authorization: 'Bearer tok' } });
check('and costs are NOT readable with the public token', r.status === 403);
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: { ...j.rec.work, close: 'soon' } } } });
check('a close date that is not a date is refused', r.status === 400);

console.log('\nCustomer proof link');
const PAGES = { Origin: 'https://rmart7866.github.io', 'Content-Type': 'application/json', 'CF-Connecting-IP': '5.5.5.5' };
r = await call('/team-requests/proof-link', { method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: { id } });
check('making a link needs the write secret', r.status === 403);
r = await call('/team-requests/proof-link', { method: 'POST', headers: STAFF, body: { id } });
j = await r.json();
const tok = j.t;
check('staff get a long random token', typeof tok === 'string' && tok.length >= 30);
r = await call('/team-requests/proof?id=' + id + '&t=' + tok, { headers: PAGES });
const view = await r.json();
check('the customer can read their proof with it', r.status === 200 && view.team && view.items.length === 1);
const blob = JSON.stringify(view);
check('the proof carries NO email', !/coach@example\.com/.test(blob));
check('no cost', !/"cost"|11\.5/.test(blob));
check('no staff notes, history or original submission', !/"notes"|"log"|"req"|"text"/.test(blob));
r = await call('/team-requests/proof?id=' + id + '&t=' + tok.slice(0, -1) + 'x', { headers: PAGES });
check('a wrong token gets nothing', r.status === 404);
r = await call('/team-requests/proof?id=' + id, { headers: PAGES });
check('no token gets nothing', r.status === 404);

r = await call('/team-requests/respond', { method: 'POST', headers: { ...PAGES, Origin: 'https://evil.example' }, body: { id, t: tok, action: 'approve' } });
check('an answer from another site is refused', r.status === 403);
r = await call('/team-requests/respond', { method: 'POST', headers: PAGES, body: { id, t: tok, action: 'changes', message: '' } });
check('asking for changes needs a message', r.status === 400);
r = await call('/team-requests/respond', { method: 'POST', headers: PAGES, body: { id, t: tok, action: 'approve', name: 'Coach' } });
check('the customer can approve', r.status === 200 && (await r.json()).approval.state === 'approved');
r = await call('/team-requests', { headers: STAFF });
check('and staff see it in the list', (await r.json()).requests.find((x) => x.id === id).ap === 'approved');

r = await call('/team-requests/one?id=' + id, { headers: STAFF });
rec = await r.json();
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { notes: 'just a note' } } });
check('a note does not undo the approval', (await r.json()).rec.approval.stale === false);
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: { ...rec.work, items: rec.work.items.map((it) => ({ ...it, cost: 99 })) } } } });
check('nor does a cost change, the customer never saw it', (await r.json()).rec.approval.stale === false);
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: { ...rec.work, items: rec.work.items.map((it) => ({ ...it, price: 30 })) } } } });
j = await r.json();
check('a PRICE change after approval marks it stale', j.rec.approval.stale === true);
r = await call('/team-requests', { headers: STAFF });
check('and the list says so', (await r.json()).requests.find((x) => x.id === id).ap === 'stale');

r = await call('/team-requests/proof-link', { method: 'POST', headers: STAFF, body: { id, renew: true } });
const tok2 = (await r.json()).t;
r = await call('/team-requests/proof?id=' + id + '&t=' + tok, { headers: PAGES });
check('a renewed link shuts the old one off', tok2 !== tok && r.status === 404);
r = await call('/team-requests/proof-logo?id=' + id + '&t=' + tok2 + '&slot=main', { headers: PAGES });
check('a customer url logo is not proxied (it is public already)', r.status === 404);

console.log('\nBuilding drafts');
const plan = planProduct('Walpole Track & Field', 'Walpole Track & Field Team Store', { style: 'PC380', name: 'Port & Co Performance Tee', category: 'Short Sleeve T-Shirts', sizes: ['S', 'M', 'L'], price: 25, colors: [{ name: 'Deep Navy', label: 'Deep Navy w/ Full Chest Logo', image: 'https://up/1' }] });
check('the title follows the hand-built stores', plan.title === 'Walpole Track & Field - Port & Co Performance Tee (PC380)', plan.title);
check('the handle is a clean slug', plan.handle === 'walpole-track-and-field-port-and-co-performance-tee-pc380', plan.handle);
const input = productSetInputFor(plan);
check('it is a DRAFT', input.status === 'DRAFT');
check('tagged for the collection rule', input.tags[0] === 'Walpole Track & Field Team Store');
check('made to order: CONTINUE selling', input.variants.every((v) => v.inventoryPolicy === 'CONTINUE'));
check('hidden from site search, as the live team stores are', input.metafields.some((m) => m.namespace === 'seo' && m.key === 'hidden' && m.value === '1'));
check('a tee gets the activewear T-shirt category', input.category === 'gid://shopify/TaxonomyCategory/aa-1-1-2-2', input.category);
check('3 sizes x 1 colour is 3 variants, each pointing at its mockup', input.variants.length === 3 && input.variants.every((v) => v.file && v.file.originalSource === 'https://up/1'));
check('an unknown category gets NO category, never a guess', !productSetInputFor(planProduct('T', 't', { style: 'X', name: 'Towel', category: 'Accessories', colors: [{ name: 'Red' }] })).category);
check('slug drops accents and symbols', slug('Écoles & Co!') === 'ecoles-and-co');

// Fail CLOSED: with Shopify unreachable the handle check throws, and the
// build must refuse rather than create blind.
const realFetch = globalThis.fetch;
let shopifyCalls = 0;
globalThis.fetch = async () => { shopifyCalls++; throw new Error('network down'); };
r = await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id, dryRun: false, products: [{ style: 'PC380', name: 'Tee', category: 'Short Sleeve T-Shirts', colors: [{ name: 'Navy' }] }] } });
j = await r.json();
globalThis.fetch = realFetch;
check('when the existence check fails, nothing is built', r.status === 502 && /nothing was built/.test(j.error), JSON.stringify(j));
check('and the request is not marked as built', !(await (await call('/team-requests/one?id=' + id, { headers: STAFF })).json()).build);
r = await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id, products: [{ style: 'PC380', name: 'Tee', colors: [] }] } });
check('a product with no colours is refused before any call', r.status === 400);

console.log('\nDelete');
r = await call('/team-requests/delete', { method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: { id } });
check('delete needs the write secret', r.status === 403);
r = await call('/team-requests/delete', { method: 'POST', headers: STAFF, body: { id } });
check('with it, the request is gone', r.status === 200 && !KV.m.has('treq:' + id));

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
