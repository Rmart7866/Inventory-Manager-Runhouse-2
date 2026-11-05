// teamreq.js, The Run House. Team store requests.
//
// The Build Your Team Store page used to send a request as an email and
// nothing else, so the only record of it was an inbox, and nothing could
// list, edit or act on it. This file is the record: every request is one KV
// value, readable and editable by staff from team-requests.html.
//
// THREE KINDS OF ROUTE, three different trust levels.
//
//  1. INTAKE, POST /team-requests/submit. Called by CUSTOMERS from the
//     storefront, so it cannot carry the catalog token or any secret. It is
//     handled before the route table on purpose and it can do exactly one
//     thing: append a request to the queue. It never reads one back, never
//     touches Shopify, and is bounded four ways: the storefront Origin, a
//     size cap, a honeypot field and a per-IP hourly limit. That is the same
//     exposure as the contact form it replaces, which also accepts anything
//     from anyone.
//
//  2. STAFF, list / one / update / delete / logo. Our own KV and nothing
//     else, so not Shopify writes, but customer names and emails live here,
//     so every one needs the WRITE SECRET on top of the catalog token, the
//     same posture as /sales/dropship.
//
//  3. BUILD, POST /team-requests/build. A real Shopify write, so forWrite
//     plus the write secret, and the same downstream floor as Stage 4:
//     CREATE-ONLY (an existing handle is skipped, never overwritten, and a
//     failed existence check ABORTS rather than guessing) and DRAFT-ONLY.
//     The collection is created unpublished. Nothing goes live from here.
//
// House style: no em dashes. Use commas, periods, or the word "to".

const PREFIX = 'treq:';
const LOGO_PREFIX = 'treqlogo:';
const MAX_BODY = 256 * 1024;          // a 100 item request is about 30 KB
const MAX_LOGO = 20 * 1024 * 1024;    // the builder's own cap
const RATE_PER_HOUR = 8;
const STATUSES = ['new', 'progress', 'waiting', 'done', 'archived'];
// Wholesale cost per style, typed by staff. NEVER in the builder catalog:
// that file is public on the CDN and this repo is public, so cost lives here,
// behind the write secret, and nowhere a customer can reach.
const COSTS_KEY = 'treqcosts';

async function rememberCosts(env, rec) {
  const items = ((rec.work && rec.work.items) || []).filter((it) => it.cost > 0 && it.style);
  if (!items.length) return;
  const cur = (await env.CATALOG.get(COSTS_KEY, 'json')) || {};
  let n = 0;
  for (const it of items) if (cur[it.style] !== it.cost) { cur[it.style] = it.cost; n++; }
  if (n) await env.CATALOG.put(COSTS_KEY, JSON.stringify(cur));
}

// ---------- small helpers --------------------------------------------------

// Bound anything a customer sends: strings, array lengths, depth. The payload
// is shown back to staff and fed to Shopify titles, so nothing unbounded gets
// in. Unknown shapes are kept (the builder's format will grow) but capped.
export function clean(v, depth = 0) {
  if (depth > 6) return null;
  if (v == null) return v;
  if (typeof v === 'string') return v.slice(0, 2000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.slice(0, 300).map((x) => clean(x, depth + 1));
  if (typeof v === 'object') {
    const out = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n++ >= 80) break;
      out[String(k).slice(0, 60)] = clean(v[k], depth + 1);
    }
    return out;
  }
  return null;
}

// Time sortable, so a reverse KV listing is newest first without reading
// every value.
export function newId(now = Date.now()) {
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 6);
  return now.toString(36).padStart(9, '0') + '-' + rnd;
}

// The working copy staff edit. Built once from the submission; the original
// stays untouched in rec.req so there is always a record of what the
// customer actually asked for.
// The builder sends logo choices by label; the page works in slot keys.
const LOGO_LABELS = { 'main logo': 'main', 'second logo': 'dark', 'logo 3': 'l3', 'logo 4': 'l4', 'logo 5': 'l5' };
function logoKey(label) { return LOGO_LABELS[String(label || '').toLowerCase()] || ''; }
function byColor(m) {
  const out = {};
  for (const c of Object.keys(m || {})) {
    const f = logoKey(m[c] && m[c].front), x = logoKey(m[c] && m[c].second);
    if (f || x) out[c] = { f, x };
  }
  return out;
}

export function workFrom(req) {
  const logos = {};
  const files = (req && req.logo_files) || {};
  const names = (req && req.logo_names) || {};
  for (const k of Object.keys(files)) {
    if (files[k]) logos[k] = { url: files[k], label: names[k] || k, from: 'customer' };
  }
  const isUpd = req && req.mode === 'update';
  const team = String((isUpd ? req.store && req.store.name : req && req.team) || '').trim();
  return {
    team,
    // The team slug, as the back office automation tags its stores.
    tag: team ? team.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '',
    logos,
    items: ((req && req.items) || []).map((it) => ({
      style: String(it.style || ''),
      colors: Array.isArray(it.colors) ? it.colors.map(String) : [],
      placement: it.placement || '',
      second_logo: it.second_logo || '',
      price: Number(it.price) || 0,
      sizes: null,        // null: derive from the catalog at build time
      boxes: {},          // { "<color>": [x, y, w, h] } placement overrides
      // Which logo goes on which colour. The customer may have picked per
      // colour on the builder; otherwise 'auto' picks whichever logo shows
      // up best on that garment colour, the builder's own rule.
      logo: logoKey(it.logo_choice && it.logo_choice.front) || 'auto',
      logo2: logoKey(it.logo_choice && it.logo_choice.second) || 'auto',
      logoBy: byColor(it.logo_choice && it.logo_choice.by_color),
    })),
  };
}

export function metaOf(rec) {
  const w = rec.work || {};
  const r = rec.req || {};
  return {
    t: String(w.team || '').slice(0, 80),
    s: rec.status,
    c: rec.created,
    u: rec.updated,
    d: String(r.date || '').slice(0, 40),
    n: (w.items || []).length,
    m: r.mode === 'update' ? 'update' : 'new',
    b: !!r.build_for_me,
    e: String((r.contact && r.contact.email) || '').slice(0, 80),
    x: rec.build && rec.build.at ? 1 : 0,
    // The release date staff set, for the calendar. Falls back to the
    // customer's own opening date (d) on the page, not here, so it is clear
    // which of the two a day on the calendar came from.
    r: String(w.release || '').slice(0, 10),
    // For the sales view: the fundraising markup the customer chose, and the
    // collection this tool built, so a built store picks up its percentage.
    f: Number(r.fundraising_pct) || 0,
    ch: String((rec.build && rec.build.collection && rec.build.collection.handle) || '').slice(0, 120),
    cl: String(w.close || '').slice(0, 10),
    a: String(w.assignee || '').slice(0, 40),
    // The customer's answer on the proof link: approved, changes, or blank.
    // "stale" when staff changed the products after the customer answered.
    ap: rec.approval ? (rec.approval.stale ? 'stale' : rec.approval.state) : '',
  };
}

async function readRec(env, id) {
  if (!/^[0-9a-z]{9}-[0-9a-z]{1,8}$/.test(String(id || ''))) return null;
  return env.CATALOG.get(PREFIX + id, 'json');
}

async function writeRec(env, rec) {
  rec.updated = new Date().toISOString();
  await env.CATALOG.put(PREFIX + rec.id, JSON.stringify(rec), { metadata: metaOf(rec) });
  return rec;
}

function log(rec, what) {
  rec.log = (rec.log || []).concat({ at: new Date().toISOString(), what: String(what).slice(0, 300) }).slice(-200);
}

// ---------- 1. intake ------------------------------------------------------

export function intakeOrigins(env) {
  return String(env.TEAMREQ_ORIGINS || 'https://therunhouse.com,https://www.therunhouse.com,https://therunhouse.myshopify.com')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

export function intakeCors(request, env) {
  const origin = request.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (origin && intakeOrigins(env).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function intakeJson(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...intakeCors(request, env) },
  });
}

// Validate a submission. Returns { ok, error } so the test can drive it
// without a Request.
export function validateSubmission(b) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'Expected a JSON object' };
  if (b.hp) return { ok: false, error: 'Rejected', silent: true };   // honeypot, a bot filled it
  const req = b.request;
  if (!req || typeof req !== 'object') return { ok: false, error: 'Missing request' };
  const email = String((req.contact && req.contact.email) || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'A valid contact email is required' };
  const team = req.mode === 'update' ? req.store && req.store.name : req.team;
  if (!String(team || '').trim()) return { ok: false, error: 'A team or store name is required' };
  if (!Array.isArray(req.items)) return { ok: false, error: 'items must be a list' };
  if (req.items.length > 300) return { ok: false, error: 'Too many items' };
  return { ok: true };
}

export async function handleIntake(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: intakeCors(request, env) });
  if (request.method !== 'POST') return intakeJson({ error: 'Method not allowed' }, 405, request, env);

  // Only the storefront may file a request. A browser always sends Origin on
  // a cross-origin POST, so a missing one is a script, not a customer.
  const origin = request.headers.get('Origin') || '';
  if (!intakeOrigins(env).includes(origin)) return intakeJson({ error: 'Origin not allowed' }, 403, request, env);

  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) return intakeJson({ error: 'Request too large' }, 413, request, env);
  const text = await request.text();
  if (text.length > MAX_BODY) return intakeJson({ error: 'Request too large' }, 413, request, env);
  let b;
  try { b = JSON.parse(text); } catch { return intakeJson({ error: 'Bad JSON' }, 400, request, env); }

  const v = validateSubmission(b);
  if (!v.ok) {
    // A tripped honeypot gets a normal looking success, so the bot learns
    // nothing, and nothing is stored.
    if (v.silent) return intakeJson({ ok: true, id: 'x' }, 200, request, env);
    return intakeJson({ error: v.error }, 400, request, env);
  }

  // Per IP, per clock hour. KV is not atomic, so two simultaneous posts can
  // both pass, which is fine: this stops a flood, not a double click.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const rlKey = 'treqrl:' + ip + ':' + hour;
  const used = Number(await env.CATALOG.get(rlKey)) || 0;
  if (used >= RATE_PER_HOUR) return intakeJson({ error: 'Too many requests, please try again later' }, 429, request, env);
  await env.CATALOG.put(rlKey, String(used + 1), { expirationTtl: 3900 });

  const req = clean(b.request);
  const now = new Date().toISOString();
  const rec = {
    id: newId(),
    created: now,
    updated: now,
    status: 'new',
    source: 'builder',
    req,
    text: String(b.text || '').slice(0, 60000),
    work: workFrom(req),
    notes: '',
    log: [],
  };
  log(rec, 'Submitted from the builder');
  await writeRec(env, rec);
  return intakeJson({ ok: true, id: rec.id }, 200, request, env);
}

// ---------- 2. staff -------------------------------------------------------

export async function listRequests(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.CATALOG.list({ prefix: PREFIX, cursor });
    for (const k of page.keys) out.push({ id: k.name.slice(PREFIX.length), ...(k.metadata || {}) });
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  out.sort((a, b) => (a.id < b.id ? 1 : -1));
  return out;
}

// What staff may change. Anything else in a patch is ignored, so the stored
// original (req), the id and the build record can never be edited from the
// page, only appended to by the code paths that own them.
// What the customer actually approves. Cost is left out on purpose: it is
// ours, it is never shown to them, and changing it changes nothing they saw.
function itemSig(it) {
  return [it.style, it.colors, it.sizes, it.price, it.placement, it.boxes, it.logo, it.logo2, it.logoBy, it.second_logo];
}

export function applyPatch(rec, patch) {
  const changed = [];
  if (patch.status != null) {
    if (!STATUSES.includes(patch.status)) throw new Error('Unknown status ' + patch.status);
    if (patch.status !== rec.status) { changed.push('status ' + rec.status + ' to ' + patch.status); rec.status = patch.status; }
  }
  if (typeof patch.notes === 'string' && patch.notes.slice(0, 20000) !== (rec.notes || '')) { rec.notes = patch.notes.slice(0, 20000); changed.push('notes'); }
  if (patch.work && typeof patch.work === 'object' && JSON.stringify(clean(patch.work)) !== JSON.stringify(rec.work)) {
    const w = clean(patch.work);
    const cur = rec.work || {};
    if (typeof w.team === 'string') cur.team = w.team.slice(0, 120);
    if (typeof w.tag === 'string') cur.tag = w.tag.slice(0, 120);
    // A calendar date or nothing. Anything else is refused rather than
    // stored, because the calendar sorts on it.
    for (const k of ['release', 'close']) {
      if (typeof w[k] !== 'string') continue;
      if (w[k] && !/^\d{4}-\d{2}-\d{2}$/.test(w[k])) throw new Error((k === 'close' ? 'Close' : 'Release') + ' date must be YYYY-MM-DD');
      cur[k] = w[k];
    }
    if (typeof w.assignee === 'string') cur.assignee = w.assignee.trim().slice(0, 60);
    // Public race or event merch stays in site search; team gear does not.
    if (typeof w.searchable === 'boolean') cur.searchable = w.searchable;
    // Logo codes are required by default; staff may waive them per store.
    if (typeof w.noCodes === 'boolean') cur.noCodes = w.noCodes;
    if (w.logos && typeof w.logos === 'object') cur.logos = w.logos;
    if (Array.isArray(w.items)) {
      const before = JSON.stringify((cur.items || []).map(itemSig));
      cur.items = w.items.map((it) => ({
        style: String(it.style || ''),
        colors: Array.isArray(it.colors) ? it.colors.map(String) : [],
        placement: String(it.placement || ''),
        second_logo: String(it.second_logo || ''),
        price: Number(it.price) || 0,
        sizes: Array.isArray(it.sizes) ? it.sizes.map(String).filter(Boolean) : null,
        boxes: it.boxes && typeof it.boxes === 'object' ? it.boxes : {},
        logo: String(it.logo || 'auto'),
        logo2: String(it.logo2 || 'auto'),
        logoBy: it.logoBy && typeof it.logoBy === 'object' ? it.logoBy : {},
        cost: Number(it.cost) > 0 ? Math.round(Number(it.cost) * 100) / 100 : 0,
      }));
      // An answer the customer gave is about the store they SAW. If the
      // products, colours, sizes, prices or placement change after it, the
      // approval no longer covers what will be built, so it is marked stale
      // rather than left looking like a yes.
      if (rec.approval && JSON.stringify(cur.items.map(itemSig)) !== before) {
        rec.approval.stale = true;
        changed.push('products changed after the customer answered');
      }
    }
    rec.work = cur;
    changed.push('edited the request');
  }
  return changed;
}

export async function handleStaff(request, env, which) {
  const url = new URL(request.url);
  if (which === 'list') return { body: { requests: await listRequests(env) } };
  if (which === 'costs') return { body: { costs: (await env.CATALOG.get(COSTS_KEY, 'json')) || {} } };

  if (which === 'one') {
    const rec = await readRec(env, url.searchParams.get('id'));
    return rec ? { body: rec } : { status: 404, body: { error: 'Not found' } };
  }

  if (which === 'logo-get') {
    const key = String(url.searchParams.get('key') || '');
    if (!key.startsWith(LOGO_PREFIX)) return { status: 400, body: { error: 'Bad key' } };
    const got = await env.CATALOG.getWithMetadata(key, 'arrayBuffer');
    if (!got || !got.value) return { status: 404, body: { error: 'Not found' } };
    return { raw: got.value, type: (got.metadata && got.metadata.type) || 'application/octet-stream' };
  }

  if (which === 'logo') {
    // multipart: id, slot, file. Stored in KV because this app has no
    // write_files scope, so Shopify Files is not an option. The customer's
    // original stays in rec.req, the replacement is recorded beside it.
    const form = await request.formData();
    const rec = await readRec(env, form.get('id'));
    if (!rec) return { status: 404, body: { error: 'Not found' } };
    const slot = String(form.get('slot') || 'main').replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'main';
    const file = form.get('file');
    if (!file || typeof file === 'string') return { status: 400, body: { error: 'No file' } };
    if (file.size > MAX_LOGO) return { status: 413, body: { error: 'Logo is over 20 MB' } };
    const buf = await file.arrayBuffer();
    const key = LOGO_PREFIX + rec.id + ':' + slot + ':' + Date.now().toString(36);
    await env.CATALOG.put(key, buf, { metadata: { type: file.type || 'application/octet-stream', name: String(file.name || '').slice(0, 120), size: file.size } });
    rec.work = rec.work || { logos: {} };
    rec.work.logos = rec.work.logos || {};
    const prev = rec.work.logos[slot];
    rec.work.logos[slot] = { key, name: String(file.name || ''), label: (prev && prev.label) || slot, from: 'staff', type: file.type || '' };
    log(rec, 'Replaced logo ' + slot + ' with ' + (file.name || 'a file') + (prev ? ' (was ' + (prev.name || prev.url || prev.key) + ')' : ''));
    await writeRec(env, rec);
    return { body: { ok: true, key, rec } };
  }

  let b;
  try { b = await request.json(); } catch { b = null; }
  if (!b) return { status: 400, body: { error: 'Expected JSON' } };
  const rec = await readRec(env, b.id);
  if (!rec) return { status: 404, body: { error: 'Not found' } };

  if (which === 'update') {
    // Optimistic concurrency: two staff editing one request must not
    // silently overwrite each other. The page sends the `updated` it loaded.
    if (b.base && b.base !== rec.updated) return { status: 409, body: { error: 'Someone else changed this request. Reload it first.', rec } };
    let changed;
    try { changed = applyPatch(rec, b.patch || {}); } catch (e) { return { status: 400, body: { error: e.message } }; }
    if (changed.length) log(rec, changed.join(', '));
    await writeRec(env, rec);
    await rememberCosts(env, rec);
    return { body: { ok: true, rec } };
  }

  if (which === 'delete') {
    // Permanent, so the page asks first, and a request already built in
    // Shopify cannot be deleted from here: its record is the only map from
    // the request to the drafts it made.
    if (rec.build && rec.build.at && !b.force) return { status: 409, body: { error: 'This request has drafts in Shopify. Archive it instead, or delete with force.' } };
    const logos = await env.CATALOG.list({ prefix: LOGO_PREFIX + rec.id + ':' });
    for (const k of logos.keys) await env.CATALOG.delete(k.name);
    await env.CATALOG.delete(PREFIX + rec.id);
    return { body: { ok: true } };
  }

  return { status: 404, body: { error: 'Not found' } };
}

export { readRec, writeRec, log, PREFIX, LOGO_PREFIX, STATUSES };
