// teamreq-proof.js, The Run House. The customer's side of a team store
// request: a private link where they see their store and approve it.
//
// WHO CAN DO WHAT.
//   Staff make the link (POST /team-requests/proof-link, write secret).
//   Anyone holding the link can read the proof and answer it, and nothing
//   else. The link is the request id plus a random 192 bit token, compared
//   in constant time. Making a new link replaces the token, which is how a
//   link that went to the wrong person is shut off.
//
// WHAT THE PROOF NEVER CONTAINS. The customer's email and phone, staff
// notes, costs, the original submission and the history. The proof is
// built field by field from an allowlist below, not by deleting fields from
// the record, so a field added to the record later cannot leak by default.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { readRec, writeRec, log, LOGO_PREFIX } from './teamreq.js';

const RATE_PER_HOUR = 30;

function token() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function same(a, b) {
  const x = new TextEncoder().encode(String(a || '')), y = new TextEncoder().encode(String(b || ''));
  if (x.length !== y.length || !x.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export function proofOrigins(env) {
  return String(env.PROOF_ORIGINS || 'https://rmart7866.github.io,https://therunhouse.com,https://www.therunhouse.com')
    .split(',').map((s) => s.trim()).filter(Boolean);
}

function cors(request, env) {
  const o = request.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (o && proofOrigins(env).includes(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function out(body, status, request, env) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(request, env) } });
}

// The allowlist. Everything a customer sees comes through here.
export function proofView(rec) {
  const w = rec.work || {}, q = rec.req || {};
  const logos = {};
  for (const k of Object.keys(w.logos || {})) {
    const L = w.logos[k];
    logos[k] = { label: L.label || k, url: L.url || null, staff: !!L.key, name: L.name || '' };
  }
  return {
    id: rec.id,
    team: w.team || '',
    release: w.release || q.date || '',
    close: w.close || '',
    contactName: String((q.contact && q.contact.name) || '').split(/\s+/)[0] || '',
    logos,
    items: (w.items || []).map((it) => ({
      style: it.style, colors: it.colors, sizes: it.sizes, price: it.price,
      placement: it.placement, boxes: it.boxes, logo: it.logo, logo2: it.logo2, logoBy: it.logoBy,
      second_logo: it.second_logo,
    })),
    approval: rec.approval ? { state: rec.approval.stale ? 'stale' : rec.approval.state, at: rec.approval.at, message: rec.approval.message || '' } : null,
  };
}

// Staff: make (or replace) the link's token.
export async function handleProofLink(request, env) {
  let b;
  try { b = await request.json(); } catch { b = null; }
  const rec = await readRec(env, b && b.id);
  if (!rec) return { status: 404, body: { error: 'Not found' } };
  if (!rec.proof || !rec.proof.t || b.renew) {
    const had = !!(rec.proof && rec.proof.t);
    rec.proof = { t: token(), at: new Date().toISOString() };
    log(rec, had ? 'Made a new approval link, the old one no longer works' : 'Made the approval link');
    await writeRec(env, rec);
  }
  return { body: { ok: true, id: rec.id, t: rec.proof.t, rec } };
}

async function authed(env, id, t) {
  const rec = await readRec(env, id);
  if (!rec || !rec.proof || !same(t, rec.proof.t)) return null;
  return rec;
}

// Public: GET /team-requests/proof, GET /team-requests/proof-logo,
// POST /team-requests/respond. Handled before auth, like intake.
export async function handlePublicProof(request, env, path) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  const url = new URL(request.url);

  // A wrong or missing token and a missing request answer the same way, so
  // the routes cannot be used to discover which ids exist.
  const nf = () => out({ error: 'This link is not valid. Ask The Run House for a new one.' }, 404, request, env);

  if (path === '/team-requests/proof' && request.method === 'GET') {
    const rec = await authed(env, url.searchParams.get('id'), url.searchParams.get('t'));
    return rec ? out(proofView(rec), 200, request, env) : nf();
  }

  if (path === '/team-requests/proof-logo' && request.method === 'GET') {
    const rec = await authed(env, url.searchParams.get('id'), url.searchParams.get('t'));
    if (!rec) return nf();
    const L = rec.work && rec.work.logos && rec.work.logos[url.searchParams.get('slot')];
    if (!L || !L.key || !L.key.startsWith(LOGO_PREFIX + rec.id + ':')) return nf();
    const got = await env.CATALOG.getWithMetadata(L.key, 'arrayBuffer');
    if (!got || !got.value) return nf();
    return new Response(got.value, { status: 200, headers: { 'Content-Type': (got.metadata && got.metadata.type) || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600', ...cors(request, env) } });
  }

  if (path === '/team-requests/respond' && request.method === 'POST') {
    if (!proofOrigins(env).includes(request.headers.get('Origin') || '')) return out({ error: 'Origin not allowed' }, 403, request, env);
    const text = await request.text();
    if (text.length > 20000) return out({ error: 'Too long' }, 413, request, env);
    let b;
    try { b = JSON.parse(text); } catch { return out({ error: 'Bad JSON' }, 400, request, env); }
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rlKey = 'treqrl-proof:' + ip + ':' + new Date().toISOString().slice(0, 13);
    const used = Number(await env.CATALOG.get(rlKey)) || 0;
    if (used >= RATE_PER_HOUR) return out({ error: 'Too many answers, please try again later' }, 429, request, env);
    await env.CATALOG.put(rlKey, String(used + 1), { expirationTtl: 3900 });
    const rec = await authed(env, b && b.id, b && b.t);
    if (!rec) return nf();
    if (b.action !== 'approve' && b.action !== 'changes') return out({ error: 'Unknown answer' }, 400, request, env);
    const message = String(b.message || '').slice(0, 4000);
    if (b.action === 'changes' && !message.trim()) return out({ error: 'Tell us what to change.' }, 400, request, env);
    const by = String(b.name || '').slice(0, 80);
    rec.approval = { state: b.action === 'approve' ? 'approved' : 'changes', at: new Date().toISOString(), message, by, stale: false };
    log(rec, (b.action === 'approve' ? 'Customer APPROVED the proof' : 'Customer asked for changes') + (by ? ' (' + by + ')' : '') + (message ? ': ' + message.slice(0, 200) : ''));
    await writeRec(env, rec);
    return out({ ok: true, approval: proofView(rec).approval }, 200, request, env);
  }

  return out({ error: 'Not found' }, 404, request, env);
}
