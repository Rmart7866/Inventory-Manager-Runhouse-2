// fix-instock-claims.mjs, The Run House.
//
// Product descriptions written by the SEO copy pass end with a "Try it on near
// you" paragraph that says the shoe is "In stock at The Run House in Walpole,
// Needham and Falmouth". That is not true per size: measured 2026-11-19, most
// sizes of most of those shoes are on no shelf (the store's own per-store stock
// says so), so a shopper drives over for a size that is not there. The owner
// asked for it to be fixed, 2026-11-19.
//
// The fix keeps every word and link except the stock claim:
//   "In stock at The Run House in ..."           -> "Try it on at The Run House in ..."
//   "The Bondi 9 is in stock at The Run House in" -> "Try the Bondi 9 on at The Run House in"
// "Try it on" is true at every store (fittings are walk-in) and matches the
// paragraph's own heading. Nothing else in a description is touched; a
// description whose text would not change is skipped.
//
// Active products only (the ones a shopper can land on). Dry run by default.
//   node tools/fix-instock-claims.mjs                 # dry run: counts + samples
//   node tools/fix-instock-claims.mjs --apply         # write, saving a rollback file
//   node tools/fix-instock-claims.mjs --restore <file> [--apply]
//
// House style: no em dashes.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const E = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'worker/.dev.vars'), 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.includes('--restore') ? process.argv[process.argv.indexOf('--restore') + 1] : null;

const tok = (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) })).json()).access_token;
async function gql(query, variables) {
  for (let t = 0; t < 6; t++) {
    const r = await (await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, { method: 'POST',
      headers: { 'X-Shopify-Access-Token': tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
    if (r.data && !(r.errors && r.errors.length)) return r.data;
    await new Promise((x) => setTimeout(x, 2000 * (t + 1)));
  }
  throw new Error('graphql failed');
}

// Pure: the corrected description, or the same string when there is no claim.
export function fixClaim(html) {
  return String(html)
    .replace(/\bThe ([^<>.]{1,60}?) is in stock at The Run House in\b/g, 'Try the $1 on at The Run House in')
    .replace(/\bIn stock at The Run House in\b/g, 'Try it on at The Run House in');
}

const UPDATE = `mutation($input: ProductInput!){ productUpdate(input: $input){ product{ id } userErrors{ field message } } }`;

if (RESTORE) {
  const rows = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
  console.log(`restore: ${rows.length} products from ${RESTORE}${APPLY ? '' : ' (dry run)'}`);
  if (APPLY) {
    let bad = 0;
    for (const r of rows) {
      const d = await gql(UPDATE, { input: { id: r.id, descriptionHtml: r.before } });
      if (d.productUpdate.userErrors.length) { bad++; console.log('FAILED', r.handle, JSON.stringify(d.productUpdate.userErrors)); }
    }
    console.log(`restored ${rows.length - bad}, failed ${bad}`);
  }
  process.exit(0);
}

const todo = [];
let after = null, scanned = 0;
do {
  const d = await gql(`query($a:String){ products(first:250, after:$a, query:"status:active"){ pageInfo{ hasNextPage endCursor } nodes{ id handle descriptionHtml } } }`, { a: after });
  for (const p of d.products.nodes) {
    scanned++;
    const before = p.descriptionHtml || '';
    const fixed = fixClaim(before);
    if (fixed !== before) todo.push({ id: p.id, handle: p.handle, before, after: fixed });
  }
  after = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
} while (after);

console.log(`active products scanned ${scanned}, to change ${todo.length}`);
for (const t of todo.slice(0, 3)) {
  const i = t.before.search(/in stock at The Run House/i);
  console.log(`  ${t.handle}\n    before: ...${t.before.slice(Math.max(0, i - 40), i + 60).replace(/<[^>]+>/g, '')}...\n    after:  ...${t.after.slice(Math.max(0, i - 40), i + 60).replace(/<[^>]+>/g, '')}...`);
}
if (!APPLY) { console.log('dry run: nothing written. Add --apply to write.'); process.exit(0); }

const file = path.join(ROOT, `instock-claims-rollback-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(file, JSON.stringify(todo.map(({ id, handle, before }) => ({ id, handle, before })), null, 1));
console.log('rollback saved:', path.basename(file));
let ok = 0, bad = 0;
for (const t of todo) {
  const d = await gql(UPDATE, { input: { id: t.id, descriptionHtml: t.after } });
  if (d.productUpdate.userErrors.length) { bad++; console.log('FAILED', t.handle, JSON.stringify(d.productUpdate.userErrors)); } else ok++;
  if ((ok + bad) % 100 === 0) console.log(`  ${ok + bad} / ${todo.length}`);
}
console.log(`written ${ok}, failed ${bad}. Undo: node tools/fix-instock-claims.mjs --restore ${path.basename(file)} --apply`);
