// Every team store in one list, for the staff page's Team stores tab.
// Read only. Three sources, because no single one is complete:
//
//   the site's Team Stores page  what customers can actually find, read off
//                                its .ts-card links (378 on 2026-11-06)
//   the builder catalog          the stores the builder offers to add to
//                                (476), which includes ones the site hides
//   requests built here          a store this tool built and not yet listed
//
// Each is then looked up in Shopify for the facts that explain the
// difference: the custom.team_store directory toggle (what Go live sets),
// whether the collection is published to the Online Store, its product
// count, its tag rule, and when it last changed. Sales come from the last
// Store sales run rather than a new one, because that is a bulk job.

import { createShopifyClient } from './shopify.js';
import { storeHandles } from './teamreq-sales.js';

export const STORES_KEY = 'treqstores';
const SITE_PAGE = 'https://therunhouse.com/pages/team-stores';
const STALE_MS = 12 * 3600 * 1000;

// The handles the live Team Stores page lists. Pure, for the test. Only the
// directory's own cards: the page also carries the site menu, whose
// /collections/ links are brands and categories, not stores.
export function siteHandles(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/<a\s+href="\/collections\/([a-z0-9-]+)"\s+class="ts-card"/g)) out.add(m[1]);
  return out;
}

// Why a store is not on the site, in words, from the facts. Pure.
export function whyHidden(s) {
  if (s.missing) return 'No such collection in Shopify';
  const r = [];
  if (s.dir !== true) r.push('not in the directory');
  if (s.live === false) r.push('unpublished');
  if (!s.products) r.push('no products');
  return r.length ? r.join(', ') : 'not on the page';
}

async function build(env) {
  const known = await storeHandles(env); // handle -> name, catalog + built
  const built = new Map(); // handle -> { id, t }
  let cursor;
  do {
    const page = await env.CATALOG.list({ prefix: 'treq:', cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if (m.ch) built.set(m.ch, { id: k.name.slice(5), t: m.t || '' });
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);

  let site = null;
  try {
    const r = await fetch(SITE_PAGE, { headers: { 'User-Agent': 'The Run House staff tool' } });
    if (r.ok) site = siteHandles(await r.text());
  } catch (e) { /* reported as unknown, never as "not listed" */ }

  const handles = [...new Set([...known.keys(), ...(site || [])])];
  const client = createShopifyClient(env);
  const pubs = (await client.graphql('{ publications(first: 50){ nodes{ id name } } }')).data.publications.nodes;
  const os = pubs.find((p) => /online store/i.test(p.name));
  const found = new Map();
  for (let i = 0; i < handles.length; i += 25) {
    const q = handles.slice(i, i + 25).map((h) => 'handle:' + h).join(' OR ');
    const body = await client.graphql(`query($q:String,$pub:ID!){ collections(first:25, query:$q){ nodes{ id handle title updatedAt
      productsCount{ count } ruleSet{ rules{ column relation condition } }
      dir: metafield(namespace:"custom", key:"team_store"){ value }
      live: publishedOnPublication(publicationId:$pub) } } }`, { q, pub: os.id });
    for (const c of body.data.collections.nodes) found.set(c.handle, c);
  }

  const sales = await env.CATALOG.get('treqsales:result', 'json');
  const sold = new Map(((sales && sales.stores) || []).map((s) => [s.h, s]));

  const stores = handles.map((h) => {
    const c = found.get(h), b = built.get(h), s = sold.get(h);
    const row = {
      h, n: (c && c.title) || known.get(h) || h,
      id: c ? c.id : null,
      missing: !c,
      products: c && c.productsCount ? c.productsCount.count : 0,
      dir: c && c.dir ? c.dir.value === 'true' : false,
      live: c ? !!c.live : false,
      updated: c ? c.updatedAt : '',
      tags: c && c.ruleSet ? c.ruleSet.rules.filter((r) => r.column === 'TAG').map((r) => r.condition) : [],
      onSite: site ? site.has(h) : null,
      req: b || null,
      sales: s ? { revenue: s.revenue, orders: s.orders, last: s.last } : null,
    };
    if (row.onSite === false) row.why = whyHidden(row);
    return row;
  }).sort((a, b) => a.n.localeCompare(b.n));

  return { at: new Date().toISOString(), siteOk: !!site, salesSince: sales ? sales.since : null, salesAt: sales ? sales.at : null, stores };
}

// GET /team-requests/stores[?fresh=1]  (staff, write secret)
export async function handleStores(request, env) {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const hit = await env.CATALOG.get(STORES_KEY, 'json');
  if (hit && !fresh && Date.now() - new Date(hit.at).getTime() < STALE_MS) return { body: hit };
  try {
    const out = await build(env);
    await env.CATALOG.put(STORES_KEY, JSON.stringify(out));
    return { body: out };
  } catch (e) {
    // A failed refresh keeps the last good list: stale beats absent.
    if (hit) return { body: { ...hit, error: 'Could not refresh: ' + String(e.message || e).slice(0, 200) } };
    return { status: 502, body: { error: 'Could not build the store list: ' + String(e.message || e).slice(0, 200) } };
  }
}
