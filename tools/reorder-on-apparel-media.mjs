// reorder-on-apparel-media.mjs, The Run House.
//
// Promotes the on-model photograph to the lead image on ON apparel.
//
// THE PROBLEM. Every garment the 2026-10-20 drop created leads with ON's flat
// cut-out render: the garment alone on a transparent background, no model, no
// drape. It is a real photo but it reads as a CAD mock up on a collection grid,
// and it was leading on 265 of 282 products.
//
// THE RULE IS THE FILENAME, NOT THE POSITION. "Use the second image" is almost
// right and quietly wrong. ON's asset names carry the shot type:
//
//   ...-d.png            flat cut-out, 2500x2500 square     <- what leads now
//   ...-4x5-...-g1.jpg   on-model studio shot, 2000x2500    <- what should
//   ...-1x1-...-ka-g1.png  ANOTHER flat, also square
//
// On on-womens-club-boxy-t-barberry the second image is a `ka` flat, so
// promoting position 2 there swaps one cut-out for another. Matching the 4x5
// on-model pattern instead picks the right shot wherever it sits, and simply
// skips a product that has none.
//
// Measured 2026-10-28 over the 282 garments in that drop:
//   1,660 on-model 4x5 images, 253 flat `-d`, 9 flat `ka`, 23 other
//   266 products have an on-model shot, only 1 already led with it
//   16 have none at all and are left exactly as they are
//
// It moves ONE image per product and never deletes, reuploads or reorders
// anything else, so the gallery order below the lead is preserved.
//
//   node tools/reorder-on-apparel-media.mjs            # dry run
//   node tools/reorder-on-apparel-media.mjs --apply
//   node tools/reorder-on-apparel-media.mjs --since 2026-10-18
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const SINCE = arg('since', '2026-10-18');
const ROOT = new URL('..', import.meta.url).pathname;

function env() {
  const txt = fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8');
  return Object.fromEntries(txt.split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
}
const E = env();
const SHOP = (E.SHOP_URL || '').replace(/^https?:\/\//, '');
const API = E.API_VERSION || '2026-01';
let TOKEN = null;
async function token() {
  if (TOKEN) return TOKEN;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) });
  if (!r.ok) throw new Error('token exchange HTTP ' + r.status);
  TOKEN = (await r.json()).access_token;
  return TOKEN;
}
async function gql(q, v = {}, attempt = 0) {
  const r = await fetch(`https://${SHOP}/admin/api/${API}/graphql.json`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json();
  if (j.errors && attempt < 4) { await new Promise((s) => setTimeout(s, 1200 * (attempt + 1))); return gql(q, v, attempt + 1); }
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
  return j.data;
}

const fileOf = (m) => m.image.url.split('/').pop().split('?')[0];
function kindOf(m) {
  const n = fileOf(m);
  if (/-d\.(png|jpg)$/i.test(n)) return 'flat-d';
  if (/4x5[^/]*-g\d+\.(jpg|png)$/i.test(n)) return 'onmodel';
  if (/1x1[^/]*-ka-g\d+\.(png|jpg)$/i.test(n)) return 'flat-ka';
  if (/-g\d+\.(jpg|png)$/i.test(n)) return 'g-other';
  return 'other';
}

let after = null, all = [];
do {
  const d = await gql(`query($c:String){ products(first:250, after:$c, query:"vendor:'On Running' OR vendor:'ON Running'"){
    pageInfo{hasNextPage endCursor}
    nodes{ id handle productType createdAt
      media(first:25){ nodes{ ... on MediaImage { id image{ url } } } } } } }`, { c: after });
  all = all.concat(d.products.nodes);
  after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (after);

const ap = all.filter((p) => !/shoes$/i.test(p.productType || '') && p.createdAt >= SINCE);
console.log('ON apparel created since ' + SINCE + ': ' + ap.length);

const moves = [];
let already = 0, none = 0;
for (const p of ap) {
  const ms = p.media.nodes;
  if (ms.length < 2) { none++; continue; }
  const idx = ms.findIndex((m) => kindOf(m) === 'onmodel');
  if (idx === -1) { none++; continue; }
  if (idx === 0) { already++; continue; }
  moves.push({ id: p.id, handle: p.handle, mediaId: ms[idx].id,
    from: idx, was: fileOf(ms[0]), now: fileOf(ms[idx]) });
}

console.log('  already leading with an on-model shot : ' + already);
console.log('  no on-model shot, left alone          : ' + none);
console.log('  TO REORDER                            : ' + moves.length);
moves.slice(0, 6).forEach((m) => {
  console.log('\n   ' + m.handle);
  console.log('     was  ' + m.was);
  console.log('     now  ' + m.now + '   (was position ' + (m.from + 1) + ')');
});
if (moves.length > 6) console.log('\n   ... and ' + (moves.length - 6) + ' more');

if (!moves.length) { console.log('\nNothing to do.'); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply to write.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const rb = path.join(ROOT, 'on-media-order-rollback-' + stamp + '.json');
fs.writeFileSync(rb, JSON.stringify(moves.map((m) => ({ handle: m.handle, productId: m.id,
  leadWas: m.was, promoted: m.now, promotedFromPosition: m.from + 1 })), null, 2));
console.log('\nRollback written: ' + rb);

const M = `mutation($id:ID!,$moves:[MoveInput!]!){
  productReorderMedia(id:$id, moves:$moves){ userErrors{ field message } } }`;
let done = 0, bad = 0;
for (const m of moves) {
  try {
    const d = await gql(M, { id: m.id, moves: [{ id: m.mediaId, newPosition: '0' }] });
    const e = d.productReorderMedia.userErrors || [];
    if (e.length) { bad++; if (bad <= 5) console.log('  FAILED ' + m.handle + ' ' + JSON.stringify(e).slice(0, 180)); }
    else done++;
  } catch (err) { bad++; if (bad <= 5) console.log('  THREW ' + m.handle + ' ' + String(err.message).slice(0, 180)); }
  if (done % 25 === 0 && done) console.log('  ... ' + done + ' / ' + moves.length);
  await new Promise((s) => setTimeout(s, 120));
}
console.log(`\nreordered ${done}, failed ${bad}.`);
console.log('productReorderMedia is asynchronous, so give it a moment before re-checking.');
