// teamreq-create.js, The Run House. A team store request STARTED BY STAFF.
//
// Until 2026-11-23 a request could only come from a customer pressing Send on
// the builder, so a store staff wanted to set up themselves (a coach who
// phoned, a store built from an old spreadsheet, more items for an existing
// store) had no way in. This makes the same record a customer would, with
// source 'staff', and from then on it is an ordinary request: the same
// editor, the same proof link, the same create-only, draft-only Build.
// Nothing here touches Shopify except two READS.
//
// Two shapes:
//   - NEW STORE. Refused when a collection already has this team's handle,
//     because that is almost always the store you meant to ADD to, and two
//     stores for one team is exactly the duplicate Build cannot fix.
//   - ADD TO AN EXISTING STORE. The collection is read first, so a store with
//     no TAG rule (the 3 hand picked ones) is refused here rather than at
//     Build, and the styles it already carries are recorded so the page can
//     show them and Build can skip them.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';
import { newId, writeRec, log, workFrom } from './teamreq.js';
import { collectionByHandle, existingStoreInfo, slug } from './teamreq-build.js';

// Pure, so the test can pin it: the record a staff member's form becomes.
export function staffRecord(input, store, now = new Date().toISOString(), id = newId()) {
  const by = String(input.by || '').trim().slice(0, 60);
  const mode = store ? 'update' : 'new';
  const contact = {
    name: String(input.contactName || '').trim().slice(0, 120),
    email: String(input.contactEmail || '').trim().slice(0, 160),
    phone: String(input.contactPhone || '').trim().slice(0, 40),
  };
  const req = {
    mode,
    team: mode === 'new' ? String(input.team || '').trim().slice(0, 120) : '',
    store: store ? { name: store.title, handle: store.handle, url: 'https://therunhouse.com/collections/' + store.handle, existing_styles: store.styles } : null,
    contact,
    items: [],
    notes: String(input.notes || '').slice(0, 4000),
    staff: { by },
  };
  const work = workFrom(req);
  if (store) { work.tag = store.tag; work.team = store.prefix || store.title; }
  work.assignee = by;
  // Staff own this contact, so it lives on the working copy where Save can
  // change it, not only on the stored original.
  work.contact = contact;
  const rec = { id, created: now, updated: now, status: 'progress', source: 'staff', req, text: '', work, notes: '', log: [] };
  log(rec, (store ? 'Started by staff to add to ' + store.title : 'Started by staff as a new store') + (by ? ' (' + by + ')' : ''));
  return rec;
}

const okEmail = (e) => !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export async function handleCreate(request, env) {
  let b;
  try { b = await request.json(); } catch { b = null; }
  if (!b || typeof b !== 'object') return { status: 400, body: { error: 'Expected JSON' } };
  if (!String(b.by || '').trim()) return { status: 400, body: { error: 'Type your name in "You are" first, so the request shows who started it.' } };
  if (!okEmail(String(b.contactEmail || '').trim())) return { status: 400, body: { error: 'That contact email does not look right.' } };
  const client = createShopifyClient(env);

  if (b.mode === 'update') {
    const handle = String(b.handle || '').trim();
    if (!handle) return { status: 400, body: { error: 'Pick the store to add to.' } };
    let col;
    try { col = await collectionByHandle(client, handle); } catch (e) {
      return { status: 502, body: { error: 'Could not read that store from Shopify, so nothing was started. ' + String(e && e.message || e) } };
    }
    if (!col) return { status: 404, body: { error: 'The store ' + handle + ' was not found on Shopify.' } };
    const info = existingStoreInfo(col);
    if (!info.tag) return { status: 400, body: { error: col.title + ' is a hand picked collection with no TAG rule, so new products could not be put in it from here. Add them in Shopify.' } };
    const rec = staffRecord(b, { title: col.title, handle: col.handle, tag: info.tag, prefix: info.prefix, styles: [...info.styles] });
    await writeRec(env, rec);
    return { body: { ok: true, id: rec.id, rec } };
  }

  const team = String(b.team || '').trim();
  if (!team) return { status: 400, body: { error: 'Type the team or store name.' } };
  let clash;
  try { clash = await collectionByHandle(client, slug(team)); } catch (e) {
    return { status: 502, body: { error: 'Could not check Shopify for a store with this name, so nothing was started. ' + String(e && e.message || e) } };
  }
  if (clash) return { status: 409, body: { error: 'A store called ' + clash.title + ' already exists (' + clash.handle + '). To add to it, use Add to an existing store.', handle: clash.handle } };
  const rec = staffRecord(b, null);
  await writeRec(env, rec);
  return { body: { ok: true, id: rec.id, rec } };
}
