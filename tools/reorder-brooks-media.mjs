// reorder-brooks-media.mjs, The Run House. DRY RUN unless you pass --apply.
//
// Puts the LATERAL profile first on Brooks products, so the flat side view is
// the featured image rather than the three quarter "angle" shot.
//
// WHY. Both shots face right, so this is a house style choice, not a fix: the
// flat lateral profile is the shape the rest of the catalogue leads with. The
// gallery order becomes lateral, angle, medial, heel, top, sole.
//
// SCOPE. Only products named in a brooks-media-rollback file, so it can never
// wander into products a human arranged by hand. It reads the angle out of each
// media's alt text, which tools/attach-brooks-images.mjs wrote.
//
// SAFE BY SHAPE: it is a REORDER, nothing is added, replaced or deleted, and a
// product whose media are already lateral-first is left alone.
//
// Usage:
//   node tools/reorder-brooks-media.mjs brooks-media-rollback-<stamp>.json
//   node tools/reorder-brooks-media.mjs brooks-media-rollback-<stamp>.json --apply
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient } from '../worker/src/shopify.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FILE = argv.find((a) => !a.startsWith('--'));
if (!FILE) { console.error('Name the brooks-media-rollback file to act on.'); process.exit(1); }

// The order we want, by the word attach-brooks-images.mjs put in the alt text.
const ORDER = ['lateral', 'angle', 'medial', 'heel', 'top', 'sole'];

function devVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('='); if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}
const client = createShopifyClient(devVars());

const GET = `query($id:ID!){product(id:$id){id handle title
  media(first:20){nodes{ ... on MediaImage{ id alt fileStatus } }}}}`;
const REORDER = `mutation($id:ID!,$moves:[MoveInput!]!){
  productReorderMedia(id:$id,moves:$moves){ job{id done} mediaUserErrors{field message} }}`;

const wordOf = (alt) => String(alt || '').trim().split(/\s+/).pop().toLowerCase();

async function main() {
  const rb = JSON.parse(fs.readFileSync(path.resolve(FILE), 'utf8'));
  const list = rb.products || [];
  console.log(`\n${list.length} product(s) from ${path.basename(FILE)}`);

  let needed = 0, already = 0, odd = 0;
  const plans = [];
  for (const p of list) {
    const prod = (await client.graphql(GET, { id: p.id })).data.product;
    if (!prod) { odd++; continue; }
    const nodes = prod.media.nodes.filter(Boolean);
    const words = nodes.map((n) => wordOf(n.alt));
    // Only touch a gallery that looks like one we built.
    if (!words.includes('lateral')) { odd++; continue; }
    if (words[0] === 'lateral') { already++; continue; }
    const want = ORDER.filter((w) => words.includes(w)).concat(words.filter((w) => !ORDER.includes(w)));
    const moves = want.map((w, i) => {
      const n = nodes[words.indexOf(w)];
      return { id: n.id, newPosition: String(i) };
    });
    plans.push({ ...p, handle: prod.handle, title: prod.title, from: words, to: want, moves });
    needed++;
    process.stderr.write(`  read ${needed + already + odd}/${list.length}\r`);
  }
  process.stderr.write(' '.repeat(40) + '\r');

  console.log(`  ${needed} to reorder, ${already} already lateral-first, ${odd} skipped as not ours`);
  if (plans.length) {
    console.log(`\n  ${plans[0].title.slice(0, 50)}`);
    console.log(`    from: ${plans[0].from.join(' > ')}`);
    console.log(`    to:   ${plans[0].to.join(' > ')}`);
  }
  if (!plans.length) return;
  if (!APPLY) { console.log(`\nDRY RUN. Pass --apply to reorder these ${plans.length} product(s).`); return; }

  let done = 0, failed = 0;
  for (const p of plans) {
    try {
      const r = await client.graphql(REORDER, { id: p.id, moves: p.moves });
      const errs = r.data?.productReorderMedia?.mediaUserErrors || [];
      if (errs.length) { failed++; console.log(`  FAIL ${p.handle}: ${errs.map((e) => e.message).join('; ')}`); continue; }
      done++;
    } catch (e) { failed++; console.log(`  FAIL ${p.handle}: ${String(e.message).slice(0, 120)}`); }
    if ((done + failed) % 10 === 0) process.stderr.write(`  ${done}/${plans.length}\r`);
  }
  process.stderr.write(' '.repeat(40) + '\r');
  console.log(`\nReordered ${done}, failed ${failed}.`);
  console.log('Shopify reorders asynchronously, so re-run without --apply in a minute to confirm.');
}
main().catch((e) => { console.error(e); process.exit(1); });
