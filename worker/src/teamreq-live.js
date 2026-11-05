// teamreq-live.js, The Run House. Go live: publish ONE team store.
//
// Everything the team request tool builds is a DRAFT on purpose, so a person
// decides when a store is seen. This is that decision, made in one step
// instead of a dozen clicks in Shopify admin. Its limits are the point:
//
//   - ONLY THIS REQUEST'S OWN BUILD. The products listed in rec.build, and
//     the collection rec.build created. Never a search by tag, so it cannot
//     reach products built by hand or by the back office automation, even
//     for the same team.
//   - DRAFT TO ACTIVE ONLY. A product already active is left alone, and an
//     ARCHIVED one is never revived: someone archived it for a reason.
//   - A PERSON SAYS YES. The page sends approved:true only after staff tick
//     that the customer approved, and confirm twice. Without it, refused.
//   - DRY RUN FIRST, the same as the build.
//
// CHANNELS, measured 2026-11-05 over 30 live team store products: all of
// them on every channel EXCEPT Facebook & Instagram and Google & YouTube,
// the ad and shopping feeds, which only 6 carried. So the feeds are left out
// unless staff tick "Also publish to the Facebook and Google feeds". That is
// its own choice, NOT the site search box: a store can be searchable on the
// site and still have no business in an ad feed.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { createShopifyClient } from './shopify.js';
import { readRec, writeRec, log } from './teamreq.js';

const FEEDS = /facebook|instagram|google|youtube/i;

// Pure, so the test can pin it.
export function pickChannels(pubs, feeds) {
  return pubs.filter((p) => feeds || !FEEDS.test(p.name));
}

// What would change. Pure: nodes are the current products as Shopify reports them.
export function livePlan(nodes, ids) {
  const byId = new Map((nodes || []).filter(Boolean).map((n) => [n.id, n]));
  const out = { activate: [], already: [], archived: [], missing: [] };
  for (const id of ids) {
    const n = byId.get(id);
    if (!n) out.missing.push(id);
    else if (n.status === 'DRAFT') out.activate.push(n);
    else if (n.status === 'ARCHIVED') out.archived.push(n);
    else out.already.push(n);
  }
  return out;
}

export async function handleGoLive(request, env) {
  let b;
  try { b = await request.json(); } catch { b = null; }
  const rec = await readRec(env, b && b.id);
  if (!rec) return { status: 404, body: { error: 'Request not found' } };
  const built = (rec.build && rec.build.products) || [];
  if (!built.length) return { status: 400, body: { error: 'Nothing has been built for this request yet. Create the drafts first.' } };
  if (b.dryRun === false && b.approved !== true) return { status: 400, body: { error: 'Confirm that the customer approved this store first.' } };

  const client = createShopifyClient(env);
  const ids = built.map((p) => p.id).filter(Boolean);
  const col = rec.build.collection && rec.build.collection.ok && rec.build.collection.id ? rec.build.collection : null;
  let nodes, colNode, pubs;
  try {
    nodes = (await client.graphql('query($ids:[ID!]!){ nodes(ids:$ids){ ... on Product { id title handle status } } }', { ids })).data.nodes;
    if (col) colNode = (await client.graphql('query($id:ID!){ collection(id:$id){ id title handle metafield(namespace:"custom", key:"team_store"){ value } } }', { id: col.id })).data.collection;
    pubs = (await client.graphql('{ publications(first: 50){ nodes{ id name } } }')).data.publications.nodes;
  } catch (e) {
    return { status: 502, body: { error: 'Could not read the store from Shopify, so nothing was changed. ' + String(e && e.message || e) } };
  }
  const plan = livePlan(nodes, ids);
  const channels = pickChannels(pubs, b.feeds === true);
  const summary = {
    activate: plan.activate.map((n) => ({ id: n.id, title: n.title, handle: n.handle })),
    already: plan.already.map((n) => n.title), archived: plan.archived.map((n) => n.title), missing: plan.missing.length,
    collection: colNode ? { id: colNode.id, title: colNode.title, handle: colNode.handle, directory: colNode.metafield && colNode.metafield.value === 'true' } : null,
    channels: channels.map((p) => p.name),
  };
  if (b.dryRun !== false) return { body: { dryRun: true, plan: summary } };
  if (!plan.activate.length && !colNode) return { status: 400, body: { error: 'Nothing to publish: every product is already active, archived or gone.' } };

  const input = channels.map((p) => ({ publicationId: p.id }));
  const results = [];
  for (const n of plan.activate) {
    const errs = [];
    try {
      const u = await client.graphql('mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ product{ id status } userErrors{ message } } }', { p: { id: n.id, status: 'ACTIVE' } });
      errs.push(...u.data.productUpdate.userErrors.map((e) => e.message));
      if (!errs.length) {
        const pp = await client.graphql('mutation($id:ID!,$i:[PublicationInput!]!){ publishablePublish(id:$id, input:$i){ userErrors{ message } } }', { id: n.id, i: input });
        errs.push(...pp.data.publishablePublish.userErrors.map((e) => 'publish: ' + e.message));
      }
    } catch (e) { errs.push(String(e && e.message || e)); }
    results.push({ title: n.title, handle: n.handle, id: n.id, ok: !errs.length, errors: errs });
  }

  let colRes = null;
  if (colNode) {
    const errs = [];
    try {
      const pp = await client.graphql('mutation($id:ID!,$i:[PublicationInput!]!){ publishablePublish(id:$id, input:$i){ userErrors{ message } } }', { id: colNode.id, i: input });
      errs.push(...pp.data.publishablePublish.userErrors.map((e) => 'publish: ' + e.message));
      // The Team Store toggle is what puts the store on the Team Stores page.
      const ms = await client.graphql('mutation($m:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$m){ userErrors{ message } } }', { m: [{ ownerId: colNode.id, namespace: 'custom', key: 'team_store', type: 'boolean', value: 'true' }] });
      errs.push(...ms.data.metafieldsSet.userErrors.map((e) => 'Team Store toggle: ' + e.message));
    } catch (e) { errs.push(String(e && e.message || e)); }
    colRes = { title: colNode.title, handle: colNode.handle, ok: !errs.length, errors: errs };
  }

  const live = results.filter((r) => r.ok);
  rec.live = { at: new Date().toISOString(), products: live.map((r) => r.id), collection: colRes };
  if (live.length && (!colRes || colRes.ok)) rec.status = 'done';
  log(rec, 'Went live: ' + live.length + ' product' + (live.length === 1 ? '' : 's') + (colRes && colRes.ok ? ' and the store ' + colRes.handle : '') + ', on ' + channels.length + ' channels');
  await writeRec(env, rec);
  return { body: { ok: true, results, collection: colRes, channels: channels.map((p) => p.name), rec } };
}
