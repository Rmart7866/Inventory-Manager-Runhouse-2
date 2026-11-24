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
import { planProduct, productSetInputFor, slug, spellSize, existingStoreInfo, bannerUrl } from '../src/teamreq-build.js';
import { clean, workFrom } from '../src/teamreq.js';

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
check('the default tag is the team slug, as the back office automation tags stores', rec.work.tag === 'walpole-track-and-field', rec.work.tag);

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
r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id, patch: { work: { ...j.rec.work, noCodes: true } } } });
check('a store can be set to build without logo codes', (await r.json()).rec.work.noCodes === true);
r = await call('/team-requests/one?id=' + id, { headers: STAFF });
check('and codes stay required unless that is set', (await r.json()).work.noCodes === true && !('noCodes' in (await (await call('/team-requests/one?id=' + id, { headers: STAFF })).json()).req));
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
// Always a DIFFERENT last character: swapping in a fixed 'x' left the token
// unchanged whenever it already ended in x, about one run in 64.
r = await call('/team-requests/proof?id=' + id + '&t=' + tok.slice(0, -1) + (tok.slice(-1) === 'x' ? 'y' : 'x'), { headers: PAGES });
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

console.log('\nStyle placement templates');
r = await call('/team-requests/placements', { headers: { Authorization: 'Bearer tok' } });
check('templates need the write secret', r.status === 403);
r = await call('/team-requests/placements/save', { method: 'POST', headers: STAFF, body: { style: 'pc380', boxes: { fc: [0.3, 0.25, 0.38, 0.3], lc: [0.56, 0.23, 0.11, 0.1, 5] } } });
j = await r.json();
check('a style template saves, keyed by the style in capitals', r.status === 200 && j.placements.PC380.fc[0] === 0.3 && j.placements.PC380.lc[4] === 5);
r = await call('/team-requests/placements/save', { method: 'POST', headers: STAFF, body: { style: 'PC380', boxes: { fc: [0.9, 0.2, 0.4, 0.3] } } });
check('a box running off the photo is refused', r.status === 400);
r = await call('/team-requests/placements/save', { method: 'POST', headers: STAFF, body: { style: 'PC380', boxes: { lc: [0.5, 0.2, 0.1, 0.1, 80] } } });
check('a tilt past 45 degrees is refused', r.status === 400);
r = await call('/team-requests/placements', { headers: STAFF });
check('and reads back', (await r.json()).placements.PC380.fc[2] === 0.38);
r = await call('/team-requests/placements/public', { headers: { Origin: 'https://therunhouse.com' } });
j = await r.json();
check('the customer builder reads the boxes with no token', r.status === 200 && j.placements.PC380.fc[2] === 0.38);
check('and only the boxes, never who saved them or when', !('from' in j.placements.PC380) && !('at' in j.placements.PC380) && !('by' in j.placements.PC380));
check('with CORS for the storefront', r.headers.get('Access-Control-Allow-Origin') === 'https://therunhouse.com');
r = await call('/team-requests/placements/public', { method: 'POST', headers: SHOPFRONT, body: {} });
check('and it cannot be written to', r.status === 405);
r = await call('/team-requests/placements/save', { method: 'POST', headers: STAFF, body: { style: 'ST350', by: 'Ryan', boxes: { bn: [0.42, 0.05, 0.15, 0.08], sl: [0.8, 0.2, 0.1, 0.1, 10] } } });
j = await r.json();
check('back neck and sleeve save, with who saved them', r.status === 200 && j.placements.ST350.bn[3] === 0.08 && j.placements.ST350.sl[4] === 10 && j.placements.ST350.by === 'Ryan');
r = await call('/team-requests/placements/save', { method: 'POST', headers: STAFF, body: { style: 'ST350', boxes: {} } });
j = await r.json();
check('saving no changed zones removes the style, so it follows the catalog again', r.status === 200 && !j.placements.ST350 && !!j.placements.PC380);

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

console.log('\nThe back office automation\'s conventions');
check('sizes are spelled out', ['XS', 'S', 'M', 'L', 'XL', '2XL', '4XL'].map(spellSize).join(',') === 'XSmall,Small,Medium,Large,XLarge,2XLarge,4XLarge');
check('tall sizes too, and youth and toddler sizes are left alone', spellSize('XLT') === 'XLarge Tall' && spellSize('2XLT') === '2XLarge Tall' && spellSize('2T') === '2T' && spellSize('One Size') === 'One Size');
check('the options are Color then Size', input.productOptions[0].name === 'Color' && input.productOptions[1].name === 'Size');
check('and every variant names them in that order', input.variants.every((v) => v.optionValues[0].optionName === 'Color'));
check('plan sizes come out spelled', plan.sizes.join(',') === 'Small,Medium,Large');
const fb = productSetInputFor(planProduct('T', 't', { style: 'DT6100', name: 'Hoodie', category: 'Hoodies', sizes: ['M'], price: 45, colors: [{ name: 'Navy', label: 'Navy (D055 (LC))', image: 'https://up/f', back: 'https://up/b' }] }));
check('a colour with a back logo gets its front then its back mockup', fb.files.map((f) => f.originalSource).join(',') === 'https://up/f,https://up/b');
check('and the variant shows the front', fb.variants[0].file.originalSource === 'https://up/f');
check('the colour value carries the logo code', fb.productOptions[0].values[0].name === 'Navy (D055 (LC))');
check('team gear is hidden from site search', fb.metafields && fb.metafields[0].key === 'hidden');
const race = productSetInputFor(planProduct('T', 't', { style: 'X', name: 'Tee', category: 'Short Sleeve T-Shirts', colors: [{ name: 'Red' }] }), { searchable: true });
check('public race merch stays searchable', !race.metafields);
const info = existingStoreInfo({ title: 'Redbrook Community Store', ruleSet: { rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'Redbrook Comm' }] }, products: { nodes: [{ title: 'Redbrook Community - Mens Essential Tee (PC61)' }, { title: 'Redbrook Community - Mens Tall Essential Tee (PC61T)' }] } });
check('an existing store gives its tag', info.tag === 'Redbrook Comm');
check('its naming prefix', info.prefix === 'Redbrook Community');
check('and the styles it already carries', info.styles.has('PC61') && info.styles.has('PC61T') && info.styles.size === 2);
check('a store with no tag rule gives no tag, so the build refuses', existingStoreInfo({ ruleSet: null, products: { nodes: [] } }).tag === null);

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

console.log('\nStore banner (2026-11-11)');
// The banner becomes a collection image, so Build must only ever hand
// Shopify a file on Shopify's own CDN, never an address a customer typed.
check('a protocol relative cart upload url is made https', bannerUrl('//cdn.shopify.com/s/files/1/0631/banner.jpg') === 'https://cdn.shopify.com/s/files/1/0631/banner.jpg');
check('an https Shopify CDN url passes', bannerUrl('https://cdn.shopify.com/s/files/x.png') === 'https://cdn.shopify.com/s/files/x.png');
check('any other host is refused', bannerUrl('https://example.com/x.png') === '');
check('a lookalike host is refused', bannerUrl('https://cdn.shopify.com.evil.test/x.png') === '');
check('plain http is refused', bannerUrl('http://cdn.shopify.com/x.png') === '');
check('blank and junk are refused', bannerUrl('') === '' && bannerUrl(null) === '' && bannerUrl('not a url') === '');
check('the request carries the banner into the work copy', workFrom({ team: 'T', banner_file: '//cdn.shopify.com/b.jpg' }).banner === '//cdn.shopify.com/b.jpg');
check('no banner is an empty string, not undefined', workFrom({ team: 'T' }).banner === '');

console.log('\nNames on a garment (2026-11-23)');
// The built product must have EXACTLY the shape of the live Canton parkas,
// because the "personalized" template finds the option by the name
// "Personalization" and shows the box when the value starts with "Add ".
{
  const { namesPlan } = await import('../src/teamreq-build.js');
  const { cleanNames } = await import('../src/teamreq.js');
  const spec = { style: 'PC78H', name: 'Hoodie', category: 'Hoodies', sizes: ['S', 'M'], price: 45, colors: [{ name: 'Navy', label: 'Navy (D001 (FC))' }], names: { on: true, price: 15, where: 'Left sleeve' } };
  const plan = planProduct('Canton Lacrosse', 'canton-lacrosse', spec);
  const input = productSetInputFor(plan, { searchable: false });
  check('names double the variants', plan.variants === 4 && input.variants.length === 4);
  check('the option is named Personalization, values as on the parkas', JSON.stringify(input.productOptions[2]) === JSON.stringify({ name: 'Personalization', values: [{ name: 'No Name' }, { name: 'Add Name (+$15)' }] }));
  const priced = input.variants.map((v) => v.optionValues[2].name + '=' + v.price).join(',');
  check('No Name at the item price, Add Name at price + 15', priced === 'No Name=45.00,Add Name (+$15)=60.00,No Name=45.00,Add Name (+$15)=60.00', priced);
  check('every Add Name value starts with "Add ", which the template tests for', input.variants.filter((v) => v.optionValues[2].name.indexOf('Add ') === 0).length === 2);
  check('it uses the personalized template', input.templateSuffix === 'personalized');
  const lab = input.metafields.find((m) => m.namespace === 'custom' && m.key === 'personalization_label');
  check('the label says where, in the parkas\' wording', lab && lab.type === 'single_line_text_field' && lab.value === 'Name (Name will appear on left sleeve in all caps)');
  check('hidden from search still rides along', input.metafields.some((m) => m.namespace === 'seo' && m.key === 'hidden'));
  const plain = productSetInputFor(planProduct('Canton Lacrosse', 'canton-lacrosse', { ...spec, names: null }), { searchable: true });
  check('without names nothing changes: two options, no template, no metafields', plain.productOptions.length === 2 && !plain.templateSuffix && !plain.metafields && plain.variants.length === 2);
  check('a price with cents is written with cents', namesPlan({ on: true, price: 12.5 }).add === 'Add Name (+$12.50)');
  check('a free name says no price', namesPlan({ on: true, price: 0 }).add === 'Add Name');
  check('the back reads naturally', namesPlan({ on: true, where: 'Back' }).label === 'Name (Name will appear on back in all caps)');
  check('cleanNames drops an off switch', cleanNames({ on: false, price: 15 }) === null && cleanNames(null) === null);
  check('cleanNames bounds a silly price to the default', cleanNames({ on: true, price: 5000 }).price === 15 && cleanNames({ on: true, price: -3 }).price === 15);
  const moved = cleanNames({ on: true, where: 'Back', color: '#111111', box: [0.3, 0.17, 0.43, 0.0768], boxWhere: 'Back' });
  check('the name colour and where staff moved it are kept', moved.color === '#111111' && JSON.stringify(moved.box) === '[0.3,0.17,0.43,0.0768]' && moved.boxWhere === 'Back');
  check('a colour that is not a hex colour is dropped (white by default)', !('color' in cleanNames({ on: true, color: 'red; background:url(x)' })));
  check('a box off the garment is dropped', !('box' in cleanNames({ on: true, box: [0.9, 0.9, 0.5, 0.5] })));
  const per = cleanNames({ on: true, where: 'Back', color: '#ffffff', colorBy: { 'White': '#111111', 'Navy': 'gold' }, boxBy: { 'White': [0.3, 0.2, 0.4, 0.08], 'Red': [2, 2, 2, 2] }, boxWhereBy: { 'White': 'Back' } });
  check('a garment colour can have its own name colour', per.colorBy.White === '#111111' && !('Navy' in per.colorBy));
  check('and its own name spot, malformed ones dropped', JSON.stringify(per.boxBy.White) === '[0.3,0.2,0.4,0.08]' && per.boxWhereBy.White === 'Back' && !('Red' in per.boxBy));
  check('no per colour settings means no empty maps', !('colorBy' in cleanNames({ on: true })) && !('boxBy' in cleanNames({ on: true })));
  check('a sample name is kept, trimmed and length capped', cleanNames({ on: true, sample: '  Okafor-Reyes ' }).sample === 'Okafor-Reyes' && cleanNames({ on: true, sample: 'X'.repeat(40) }).sample.length === 20);
  check('markup in a sample name is stripped', cleanNames({ on: true, sample: '<b>Lee</b>' }).sample === 'bLeeb' && !('sample' in cleanNames({ on: true, sample: '<>' })));
  check('the customer\'s "offer names" carries into the work copy', workFrom({ team: 'T', items: [{ style: 'PC78H', names: { on: true, where: 'Back' } }] }).items[0].names.where === 'Back');
}

console.log('\nApproval is recorded but optional (2026-11-23)');
// The proof is optional (owner, 2026-11-23): Build does not wait on it, but
// an approval is still recognised and reported on the plan.
{
  const { approvedForBuild } = await import('../src/teamreq.js');
  check('no answer is not approved', !approvedForBuild({ work: {} }).ok);
  check('a proof approval is', approvedForBuild({ approval: { state: 'approved' }, work: {} }).ok);
  check('a STALE proof approval is not', !approvedForBuild({ approval: { state: 'approved', stale: true }, work: {} }).ok);
  check('asking for changes is not', !approvedForBuild({ approval: { state: 'changes' }, work: {} }).ok);
  check('an approval recorded another way is, and says how', approvedForBuild({ work: { approvedOther: { how: 'Phone call', by: 'Ryan' } } }).via === 'staff');
  check('a blank "how" is not an approval', !approvedForBuild({ work: { approvedOther: { how: '  ' } } }).ok);

  // Through the real handler, with Shopify answering "nothing exists yet".
  let writes = 0;
  globalThis.fetch = async (u, init = {}) => {
    if (String(u).includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { headers: { 'Content-Type': 'application/json' } });
    const b = JSON.parse(init.body || '{}');
    if (/mutation/.test(b.query || '')) { writes++; return new Response(JSON.stringify({ data: { productSet: { product: { id: 'gid://shopify/Product/9', handle: 'h', title: 't' }, userErrors: [] }, collectionCreate: { collection: { id: 'gid://shopify/Collection/9', handle: 'c', title: 'C' }, userErrors: [] } } }), { headers: { 'Content-Type': 'application/json' } }); }
    return new Response(JSON.stringify({ data: { products: { nodes: [] }, collectionByHandle: null, publications: { nodes: [{ id: 'gid://shopify/Publication/1' }, { id: 'gid://shopify/Publication/2' }] } } }), { headers: { 'Content-Type': 'application/json' } });
  };
  let r = await call('/team-requests/submit', { method: 'POST', headers: { ...SHOPFRONT, 'CF-Connecting-IP': '10.77.0.1' }, body: sample() });
  const sub = await r.json(); const aid = sub.id; if (!aid) console.log('          submit answered', r.status, JSON.stringify(sub));
  const spec = [{ style: 'PC380', name: 'Tee', category: 'Short Sleeve T-Shirts', colors: [{ name: 'Navy' }] }];
  r = await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id: aid, dryRun: true, products: spec } });
  let j = await r.json();
  check('the plan can be checked before approval, and says it is not approved', r.status === 200 && j.plan && j.plan.approved.ok === false);
  r = await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id: aid, dryRun: false, products: spec } });
  j = await r.json();
  check('drafts are created WITHOUT a proof or an approval', r.status === 200 && j.ok && writes > 0, 'status ' + r.status + ' ' + JSON.stringify(j).slice(0, 160));
  check('each new draft is put on EVERY sales channel as it is built (2026-11-24)', j.results.filter((x) => x.ok).length > 0 && j.results.filter((x) => x.ok).every((x) => x.channels === 2), JSON.stringify(j.results).slice(0, 200));
  writes = 0;
  const cur = await (await call('/team-requests/one?id=' + aid, { headers: STAFF })).json();
  r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id: aid, base: cur.updated, patch: { work: { ...cur.work, approvedOther: { how: 'Coach approved on the phone 11/23', by: 'Ryan' } } } } });
  j = await r.json();
  check('staff can record an approval another way', r.status === 200 && j.rec.work.approvedOther.how === 'Coach approved on the phone 11/23' && !!j.rec.work.approvedOther.at);
  check('and the history says who and how', j.rec.log.some((l) => /approved another way \(Ryan\): Coach approved on the phone/.test(l.what)));
  r = await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id: aid, dryRun: false, products: spec } });
  j = await r.json();
  check('and a second build skips what already exists, never overwrites', r.status === 200 && j.ok, 'status ' + r.status + ' ' + JSON.stringify(j).slice(0, 160));
  globalThis.fetch = realFetch;
}

console.log('\nRevert to the customer\'s request (2026-11-23)');
{
  let r = await call('/team-requests/submit', { method: 'POST', headers: { ...SHOPFRONT, 'CF-Connecting-IP': '10.77.0.2' }, body: sample() });
  const rid = (await r.json()).id;
  let cur = await (await call('/team-requests/one?id=' + rid, { headers: STAFF })).json();
  // staff change the price and colours, add a product, give the logo a code, set a cost and a release date
  const w = JSON.parse(JSON.stringify(cur.work));
  w.items[0].price = 99; w.items[0].colors = ['Jet Black']; w.items[0].cost = 7.5;
  w.items.push({ style: 'PC78H', colors: ['Navy'], price: 40 });
  w.logos.main.code = 'D055'; w.release = '2026-12-01'; w.assignee = 'Ryan';
  r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id: rid, base: cur.updated, patch: { work: w } } });
  cur = (await r.json()).rec;
  check('staff edits are in', cur.work.items.length === 2 && cur.work.items[0].price === 99);
  r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id: rid, base: cur.updated, patch: { revert: 'PC380' } } });
  let j = await r.json();
  check('one product goes back to what the customer sent', r.status === 200 && j.rec.work.items[0].price === 25 && JSON.stringify(j.rec.work.items[0].colors) === '["Deep Navy","Jet Black"]');
  check('and keeps our cost, and leaves the product staff added', j.rec.work.items[0].cost === 7.5 && j.rec.work.items.length === 2);
  r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id: rid, base: j.rec.updated, patch: { revert: 'all' } } });
  j = await r.json();
  check('reverting everything drops the product staff added', r.status === 200 && j.rec.work.items.length === 1 && j.rec.work.items[0].style === 'PC380');
  check('and keeps our details: logo code, release date, who has it', j.rec.work.logos.main.code === 'D055' && j.rec.work.release === '2026-12-01' && j.rec.work.assignee === 'Ryan');
  check('the customer\'s original is untouched', JSON.stringify(j.rec.req.items) === JSON.stringify(sample().request.items));
  check('and the history says so', j.rec.log.some((l) => /reverted every product and logo/.test(l.what)) && j.rec.log.some((l) => /reverted PC380/.test(l.what)));
  r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id: rid, base: j.rec.updated, patch: { revert: 'NOPE1' } } });
  check('a style the customer never asked for cannot be reverted', r.status === 400);
}

console.log('\nThe main photo (2026-11-23)');
{
  const spec = { style: 'PC78H', name: 'Hoodie', category: 'Hoodies', sizes: ['S'], price: 45,
    colors: [{ name: 'Maroon', image: 'https://cdn.shopify.com/m-front.png', back: 'https://cdn.shopify.com/m-back.png' }, { name: 'Grey', image: 'https://cdn.shopify.com/g-front.png', back: 'https://cdn.shopify.com/g-back.png' }] };
  const order = (s) => productSetInputFor(planProduct('T', 't', s), { searchable: true }).files.map((f) => f.originalSource.split('/').pop()).join(',');
  check('no pick: the first colour\'s front leads, as before', order(spec) === 'm-front.png,m-back.png,g-front.png,g-back.png');
  check('a picked colour\'s front leads, nothing lost or doubled', order({ ...spec, main: { color: 'Grey' } }) === 'g-front.png,m-front.png,m-back.png,g-back.png');
  check('a picked back leads', order({ ...spec, main: { color: 'Grey', back: true } }) === 'g-back.png,m-front.png,m-back.png,g-front.png');
  check('a pick for a colour no longer on the product is ignored', order({ ...spec, main: { color: 'Purple' } }) === 'm-front.png,m-back.png,g-front.png,g-back.png');
  const opts = productSetInputFor(planProduct('T', 't', { ...spec, main: { color: 'Grey' } }), { searchable: true }).productOptions[0].values.map((v) => v.name).join(',');
  check('the colour order customers pick from does not change', opts === 'Maroon,Grey');
}

console.log('\nPer colour settings survive a real save (2026-11-23)');
// Through the handler, so clean()'s depth cap is in the path. The first
// version of names.boxBy was nested one level too deep and every save
// silently dropped its numbers; a direct cleanNames test could not see it.
{
  let r = await call('/team-requests/submit', { method: 'POST', headers: { ...SHOPFRONT, 'CF-Connecting-IP': '10.77.0.3' }, body: sample() });
  const pid = (await r.json()).id;
  const cur = await (await call('/team-requests/one?id=' + pid, { headers: STAFF })).json();
  const w = JSON.parse(JSON.stringify(cur.work));
  w.items[0].boxes2 = { 'Deep Navy': [0.25, 0.3, 0.5, 0.3] };
  w.items[0].names = { on: true, where: 'Back', colorBy: { 'Jet Black': '#111111' }, boxBy: { 'Deep Navy': [0.3, 0.2, 0.4, 0.08] }, boxWhereBy: { 'Deep Navy': 'Back' } };
  r = await call('/team-requests/update', { method: 'POST', headers: STAFF, body: { id: pid, base: cur.updated, patch: { work: w } } });
  const it = (await r.json()).rec.work.items[0];
  check('a colour\'s own back logo spot is saved', JSON.stringify(it.boxes2['Deep Navy']) === '[0.25,0.3,0.5,0.3]');
  check('a colour\'s own name colour is saved', it.names.colorBy['Jet Black'] === '#111111');
  check('a colour\'s own name spot is saved, numbers and all', JSON.stringify(it.names.boxBy['Deep Navy']) === '[0.3,0.2,0.4,0.08]' && it.names.boxWhereBy['Deep Navy'] === 'Back', JSON.stringify(it.names));
}

console.log('\nStarted by staff (2026-11-23)');
// A store staff set up themselves goes through the same record, editor and
// Build as a customer's. What must hold: the write secret is required, a NEW
// store whose name is already a collection is refused (that is the store
// they meant to add to), an EXISTING store is read first and one with no tag
// rule is refused, and nothing is written to Shopify.
{
  const { staffRecord } = await import('../src/teamreq-create.js');
  const COLS = {
    'walpole-xc': { id: 'gid://shopify/Collection/1', handle: 'walpole-xc', title: 'Walpole XC', ruleSet: { rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'walpole-xc' }] },
      products: { nodes: [{ title: 'Walpole XC - Core Cotton Tee (PC54)' }, { title: 'Walpole XC - Hoodie (PC78H)' }] } },
    'hand-picked': { id: 'gid://shopify/Collection/2', handle: 'hand-picked', title: 'Hand Picked', ruleSet: null, products: { nodes: [] } },
  };
  let writes = 0;
  globalThis.fetch = async (u, init = {}) => {
    const url = String(u);
    if (url.includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { headers: { 'Content-Type': 'application/json' } });
    const b = JSON.parse(init.body || '{}');
    if (/mutation/.test(b.query || '')) writes++;
    const h = b.variables && b.variables.h;
    return new Response(JSON.stringify({ data: { collectionByHandle: COLS[h] || null, products: { nodes: [] } } }), { headers: { 'Content-Type': 'application/json' } });
  };
  let r = await call('/team-requests/create', { method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' }, body: { mode: 'new', team: 'Canton Lacrosse', by: 'Ryan' } });
  check('starting a store needs the write secret', r.status === 401 || r.status === 403, 'status ' + r.status);
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'new', team: 'Canton Lacrosse' } });
  check('it needs the staff name, so the request shows who started it', r.status === 400);
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'new', team: 'Canton Lacrosse', by: 'Ryan', contactEmail: 'not an email' } });
  check('a bad contact email is refused', r.status === 400);
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'new', team: 'Walpole XC', by: 'Ryan' } });
  let j = await r.json();
  check('a NEW store whose name is already a store is refused, pointing at it', r.status === 409 && j.handle === 'walpole-xc', JSON.stringify(j));
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'new', team: 'Canton Lacrosse', by: 'Ryan', contactName: 'Coach K', contactEmail: 'k@example.com' } });
  j = await r.json();
  check('a new store is started', r.status === 200 && j.ok && /^[0-9a-z]{9}-/.test(j.id), JSON.stringify(j).slice(0, 200));
  check('as a staff record, In progress, handled by the starter', j.rec.source === 'staff' && j.rec.status === 'progress' && j.rec.work.assignee === 'Ryan');
  check('with the team slug as its tag and no products yet', j.rec.work.tag === 'canton-lacrosse' && j.rec.work.items.length === 0);
  check('and the contact is kept for the proof email', j.rec.req.contact.email === 'k@example.com');
  const list = await (await call('/team-requests', { headers: STAFF })).json();
  check('the list marks it as started by staff', list.requests.some((x) => x.id === j.id && x.st === 1));
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'update', handle: 'hand-picked', by: 'Ryan' } });
  check('an existing store with no tag rule is refused', r.status === 400);
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'update', handle: 'gone', by: 'Ryan' } });
  check('a store that is not on Shopify is refused', r.status === 404);
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'update', handle: 'walpole-xc', by: 'Ryan' } });
  j = await r.json();
  check('adding to an existing store takes its tag and naming', r.status === 200 && j.rec.req.mode === 'update' && j.rec.work.tag === 'walpole-xc' && j.rec.work.team === 'Walpole XC');
  check('and records the styles it already carries', JSON.stringify(j.rec.req.store.existing_styles.sort()) === '["PC54","PC78H"]');
  // Owner, 2026-11-24: a style the store already carries is NOT skipped; it
  // is built as its own product, named by its logo codes, else a number.
  r = await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id: j.id, dryRun: true, products: [
    { style: 'PC78H', name: 'Hoodie', category: 'Hoodies', sizes: ['M'], price: 45, logoCodes: ['B132'], colors: [{ name: 'Maroon' }] },
    { style: 'PC54', name: 'Core Cotton Tee', category: 'Short Sleeve T-Shirts', sizes: ['M'], price: 25, colors: [{ name: 'Navy' }] },
    { style: 'DT6100', name: 'Hoodie', category: 'Hoodies', sizes: ['M'], price: 45, colors: [{ name: 'Navy' }] },
  ] } });
  const bj = await r.json();
  const titles = ((bj.plan && bj.plan.products) || []).map((x) => x.title);
  check('a carried style with new logos is built, named by its codes', titles.includes('Walpole XC - Hoodie (PC78H) - B132'), JSON.stringify(titles));
  check('a carried style with no codes is built too, numbered', titles.includes('Walpole XC - Core Cotton Tee (PC54) - 2'));
  check('a new style keeps its plain name, and nothing is skipped', titles.includes('Walpole XC - Hoodie (DT6100)') && titles.length === 3 && !(bj.plan.alreadyIn || []).length);
  check('nothing was written to Shopify', writes === 0);
  globalThis.fetch = realFetch;
  const pure = staffRecord({ team: '  Foxboro Hockey ', by: ' Dana ' }, null, '2026-11-23T00:00:00.000Z', '000000000-abc');
  check('the pure record trims the names', pure.work.team === 'Foxboro Hockey' && pure.req.staff.by === 'Dana' && pure.log.length === 1);
}

console.log('\nEvery image carries alt text (2026-11-23)');
{
  const { buildProductSetInput } = await import('../src/products.js');
  const inp = buildProductSetInput({ title: 'Hoka Clifton 10 Black', handle: 'h', productType: "Men's Shoes", variants: [], files: [{ originalSource: 'https://x/a.png' }, { originalSource: 'https://x/b.png', alt: 'Back view' }, { originalSource: 'https://x/c.png', alt: '   ' }] }, 'gid://shopify/Location/1', {});
  check('an image sent with no alt gets the product title', inp.files[0].alt === 'Hoka Clifton 10 Black');
  check('an alt that was sent is kept', inp.files[1].alt === 'Back view');
  check('a blank alt is not kept', inp.files[2].alt === 'Hoka Clifton 10 Black');
  const plan = planProduct('Zz Team', 'zz-team', { style: 'PC78H', name: 'Hoodie', category: 'Hoodies', sizes: ['S'], price: 45, colors: [{ name: 'Maroon', image: 'https://cdn.shopify.com/m.png', back: 'https://cdn.shopify.com/mb.png' }] });
  const alts = productSetInputFor(plan, { searchable: true }).files.map((f) => f.alt);
  check('team store mockups each say product and colour, front and back', alts.length === 2 && alts.every((a) => a && /Maroon/.test(a)) && /back/.test(alts[1]), JSON.stringify(alts));
  const { addProductMedia } = await import('../src/product-edit.js');
  let sent = null;
  const client = { graphql: async (q, v) => { if (/product\(id/.test(q)) return { data: { product: { title: 'Brooks Ghost 17' } } }; sent = v; return { data: { productCreateMedia: { mediaUserErrors: [] } } }; } };
  await addProductMedia(client, { id: 'gid://shopify/Product/1', originalSource: 'https://x/d.png' });
  check('adding a photo with no alt to an existing product uses its title', !!sent && sent.media[0].alt === 'Brooks Ghost 17');
}

console.log('\nFrom Drive (2026-11-24)');
{
  let r = await call('/team-requests/drive?action=list', { headers: STAFF });
  check('without the script set up it says so', r.status === 503);
  r = await call('/team-requests/drive?action=list', { headers: { Authorization: 'Bearer tok' } });
  check('it needs the write secret', r.status === 401 || r.status === 403, 'status ' + r.status);
  ENV.DRIVE_SCRIPT_URL = 'https://script.google.com/macros/s/X/exec'; ENV.DRIVE_KEY = 'drive-key-test';
  const seen = [];
  globalThis.fetch = async (u) => {
    seen.push(String(u));
    const q = new URL(String(u)).searchParams;
    if (q.get('key') !== 'drive-key-test') return new Response(JSON.stringify({ error: 'not allowed' }));
    if (q.get('action') === 'search') return new Response(JSON.stringify({ files: [{ id: 'f'.repeat(20), name: 'canton volleyball (C081).png', where: 'Canton Volleyball' }] }));
    if (q.get('action') === 'file') return new Response(JSON.stringify({ name: 'canton volleyball (C081).png', mime: 'image/png', data: 'iVBORw0K' }));
    return new Response(JSON.stringify({ folder: 'root', path: [], folders: [{ id: 'd'.repeat(20), name: 'Canton Volleyball' }], files: [] }));
  };
  r = await call('/team-requests/drive?action=list', { headers: STAFF });
  let j = await r.json();
  check('it lists the folder through the script', r.status === 200 && j.folders[0].name === 'Canton Volleyball');
  check('the key goes to the script and never back to the page', seen[0].includes('key=drive-key-test') && !JSON.stringify(j).includes('drive-key-test'));
  r = await call('/team-requests/drive?action=search&q=c081', { headers: STAFF });
  j = await r.json();
  check('search passes the words', r.status === 200 && j.files[0].name.includes('C081') && seen.at(-1).includes('q=c081'));
  r = await call('/team-requests/drive?action=search&q=c', { headers: STAFF });
  check('one letter is not a search', r.status === 400);
  r = await call('/team-requests/drive?action=file&id=' + encodeURIComponent('../etc'), { headers: STAFF });
  check('a made up id is refused before the script is asked', r.status === 400);
  r = await call('/team-requests/drive?action=delete&id=' + 'f'.repeat(20), { headers: STAFF });
  check('only list, search, thumb and file exist', r.status === 400);
  r = await call('/team-requests/drive?action=file&id=' + 'f'.repeat(20), { headers: STAFF });
  j = await r.json();
  check('a file comes back as data', r.status === 200 && j.data === 'iVBORw0K');
  ENV.DRIVE_KEY = 'wrong';
  r = await call('/team-requests/drive?action=list', { headers: STAFF });
  j = await r.json();
  check('a wrong key says which secret to fix', r.status === 502 && /DRIVE_KEY/.test(j.error));
  delete ENV.DRIVE_SCRIPT_URL; delete ENV.DRIVE_KEY;
  globalThis.fetch = realFetch;
}

console.log('\nUpdate products this page built (2026-11-24)');
{
  const { diffProduct, updateInputFor } = await import('../src/teamreq-update.js');
  // The product as Shopify has it: live, Maroon in S and M, $45.
  const cur = { id: 'gid://shopify/Product/77', title: 'Zz Team - Hoodie (PC78H)', handle: 'zz-team-hoodie-pc78h', status: 'ACTIVE', tags: ['zz-team', 'staff-added'],
    variants: { nodes: [
      { id: 'gid://shopify/ProductVariant/1', price: '45.00', selectedOptions: [{ name: 'Color', value: 'Maroon' }, { name: 'Size', value: 'Small' }] },
      { id: 'gid://shopify/ProductVariant/2', price: '45.00', selectedOptions: [{ name: 'Color', value: 'Maroon' }, { name: 'Size', value: 'Medium' }] },
    ] } };
  // Now: Maroon and Navy, Small only, $50.
  const spec = { style: 'PC78H', name: 'Hoodie', category: 'Hoodies', sizes: ['S'], price: 50, colors: [{ name: 'Maroon' }, { name: 'Navy' }] };
  const plan = planProduct('Zz Team', 'zz-team', spec);
  const input = updateInputFor(plan, cur, { searchable: true });
  check('an update keeps the product, its URL, title, LIVE status and tags', input.id === cur.id && input.handle === cur.handle && input.title === cur.title && input.status === 'ACTIVE' && input.tags.includes('staff-added'));
  check('a variant that still exists keeps its ID', input.variants.find((v) => v.optionValues[0].name === 'Maroon').id === 'gid://shopify/ProductVariant/1');
  check('a new colour gets new variants, no ID', !input.variants.find((v) => v.optionValues[0].name === 'Navy').id);
  check('with no new mockups the photos are left alone', !('files' in input));
  const d = diffProduct(cur, input);
  check('the change is reported: Navy added, Medium removed, 1 repriced', d.colorsAdded.join() === 'Navy' && d.sizesRemoved.join() === 'Medium' && d.variantsAdded === 1 && d.variantsRemoved === 1 && d.repriced === 1, JSON.stringify(d));

  // Through the real route: build first (Shopify mocked), then update.
  let sets = [];
  globalThis.fetch = async (u, init = {}) => {
    if (String(u).includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { headers: { 'Content-Type': 'application/json' } });
    const b = JSON.parse(init.body || '{}'), q = b.query || '';
    if (/productSet/.test(q)) { sets.push(b.variables.input); return new Response(JSON.stringify({ data: { productSet: { product: { id: 'gid://shopify/Product/77', handle: 'zz-team-hoodie-pc78h', title: 'Zz Team - Hoodie (PC78H)', status: 'DRAFT' }, userErrors: [] } } })); }
    if (/collectionCreate/.test(q)) return new Response(JSON.stringify({ data: { collectionCreate: { collection: { id: 'gid://shopify/Collection/9', handle: 'zz-team', title: 'Zz Team' }, userErrors: [] } } }));
    if (/product\(id/.test(q)) return new Response(JSON.stringify({ data: { product: cur } }));
    return new Response(JSON.stringify({ data: { products: { nodes: [] }, collectionByHandle: null, publications: { nodes: [] } } }));
  };
  let r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'new', team: 'Zz Team', by: 'Ryan' } });
  const zid = (await r.json()).id;
  r = await call('/team-requests/update-products', { method: 'POST', headers: STAFF, body: { id: zid, products: [spec] } });
  check('nothing built yet: update says so', r.status === 400);
  r = await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id: zid, dryRun: false, products: [{ ...spec, sizes: ['S', 'M'], price: 45, colors: [{ name: 'Maroon' }] }] } });
  check('built first', r.status === 200 && (await r.json()).results[0].ok);
  sets = [];
  r = await call('/team-requests/update-products', { method: 'POST', headers: STAFF, body: { id: zid, products: [spec] } });
  let j = await r.json();
  check('the check reports the change and writes NOTHING', r.status === 200 && j.dryRun && j.results[0].diff.colorsAdded.join() === 'Navy' && sets.length === 0, JSON.stringify(j).slice(0, 200));
  r = await call('/team-requests/update-products', { method: 'POST', headers: STAFF, body: { id: zid, dryRun: false, products: [spec] } });
  j = await r.json();
  check('the update is written to that product, live status kept', r.status === 200 && j.results[0].ok && sets.length === 1 && sets[0].id === 'gid://shopify/Product/77' && sets[0].status === 'ACTIVE', JSON.stringify(j).slice(0, 200));
  check('and the history says what changed', j.rec.log.some((l) => /Updated 1 built product.*PC78H \+Navy/.test(l.what)));
  r = await call('/team-requests/update-products', { method: 'POST', headers: STAFF, body: { id: zid, products: [{ ...spec, style: 'PC54', name: 'Tee' }] } });
  j = await r.json();
  check('a product this page did not build is never touched', j.results[0].skipped && /Not built by this page/.test(j.results[0].reason));

  // Built twice, the first set deleted in between (Blessed Sacrament
  // Basketball, 2026-11-23): the record lists each style twice, and only the
  // product still on Shopify is the one to change.
  let nextId = 70;
  globalThis.fetch = async (u, init = {}) => {
    if (String(u).includes('/oauth/access_token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { headers: { 'Content-Type': 'application/json' } });
    const b = JSON.parse(init.body || '{}'), q = b.query || '';
    if (/productSet/.test(q)) { const id = b.variables.input.id || 'gid://shopify/Product/' + (nextId++); return new Response(JSON.stringify({ data: { productSet: { product: { id, handle: 'zz-two-hoodie-pc78h', title: 'Zz Two - Hoodie (PC78H)', status: 'DRAFT' }, userErrors: [] } } })); }
    if (/collectionCreate/.test(q)) return new Response(JSON.stringify({ data: { collectionCreate: { collection: { id: 'gid://shopify/Collection/8', handle: 'zz-two', title: 'Zz Two' }, userErrors: [] } } }));
    if (/product\(id/.test(q)) return new Response(JSON.stringify({ data: { product: b.variables.id === 'gid://shopify/Product/70' ? null : { ...cur, id: b.variables.id } } }));
    return new Response(JSON.stringify({ data: { products: { nodes: [] }, collectionByHandle: null, publications: { nodes: [] } } }));
  };
  r = await call('/team-requests/create', { method: 'POST', headers: STAFF, body: { mode: 'new', team: 'Zz Two', by: 'Ryan' } });
  const tid = (await r.json()).id;
  for (let k = 0; k < 2; k++) await call('/team-requests/build', { method: 'POST', headers: STAFF, body: { id: tid, dryRun: false, products: [{ ...spec, sizes: ['S', 'M'], price: 45, colors: [{ name: 'Maroon' }] }] } });
  r = await call('/team-requests/update-products', { method: 'POST', headers: STAFF, body: { id: tid, products: [spec] } });
  j = await r.json();
  check('built twice, first set deleted: the update finds the one still on Shopify', j.results[0].id === 'gid://shopify/Product/71' && !j.results[0].skipped, JSON.stringify(j.results[0]).slice(0, 200));
  globalThis.fetch = realFetch;
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
