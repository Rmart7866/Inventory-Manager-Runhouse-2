// auto-tag-queue.mjs, The Run House.
//
// Pins computePlan, which is what the post-create queue now runs to tag a newly
// live colorway, and what the Catalog Tagging panel runs by hand.
//
// WHY THIS MATTERS. Create-time tagging is inherit-only: product-enrichment
// copies tags from a live width-specific sibling and sets nothing when there is
// none. Because the cw-group tag carries the width class, that is stricter than
// "a new model": a new WIDTH of a model already carried has no carrier either.
// On the 2026-09-08 New Balance drop, 77 of 88 products launched untagged, and
// the split was exact: all 77 had no sibling carrying that tag, all 11 that
// inherited did. Backlogs like this had reached 185 products before.
//
// The two properties that must hold, because this now runs unattended:
//   1. ADD-ONLY. It may never remove a tag a human put on a product.
//   2. It tags from the catalog's own computed values, which the Worker derived
//      with parsers.js + tag-groups.js. The tag written has to equal the tag the
//      storefront groups on.
//
// Run: node test/auto-tag-queue.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

// catalog-tags.js reaches for Firestore (`db`) at call time, not at load time,
// and computePlan touches neither it nor the DOM.
const sandbox = {
  console, window: {}, db: undefined,
  document: { getElementById: () => null, createElement: () => ({ style: {} }), head: { appendChild() {} } },
  localStorage: { getItem: () => null, setItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'catalog-tags.js'), 'utf8'), sandbox);
const CT = sandbox.CatalogTags;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, extra) => { failures++; console.log('  FAIL  ' + m + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));
const yes = (m, c, extra) => (c ? ok(m) : bad(m, extra));

// The shape the queue passes in: catalog products, straight from the payload.
const P = (o) => Object.assign({
  id: 'gid://shopify/Product/1', handle: 'h', title: 't', status: 'ACTIVE',
  tags: [], gender: "Men's", productType: "Men's Shoes", cwGroup: null, widthTag: '',
}, o);
const ALL = { width: true, swatch: true, gender: true };

console.log('\nA colorway that launched with no tags at all gets all three');
const bare = P({
  handle: 'womens-1080v15-black-extra-wide', title: 'New Balance Womens 1080v15 - BLACK (Extra Wide)',
  gender: "Women's", productType: "Women's Shoes",
  cwGroup: 'cw-group:womens-1080v15--xwide', widthTag: 'extra wide', tags: ['New Balance'],
});
const r1 = CT.computePlan([bare], ALL);
eq('one product changes', r1.changes.length, 1);
eq('adds exactly three tags', r1.changes[0].add.length, 3);
yes('the cw-group tag', r1.changes[0].add.includes('cw-group:womens-1080v15--xwide'), r1.changes[0].add);
yes('the width tag', r1.changes[0].add.includes('extra wide'), r1.changes[0].add);
yes('the gender tag', r1.changes[0].add.includes("Women's Shoes"), r1.changes[0].add);
eq('and removes nothing', r1.changes[0].remove.length, 0);

console.log('\nADD-ONLY: an existing tag is never stripped, however odd it looks');
const human = P({
  cwGroup: 'cw-group:mens-ac-runner--standard', widthTag: '',
  tags: ['New Balance', 'cw-group:mens-ac-runner--standard', "Men's Shoes", 'staff-pick', 'mens', 'SALE'],
});
const r2 = CT.computePlan([human], ALL);
eq('nothing to do, so no change at all', r2.changes.length, 0);
const partial = CT.computePlan([P({
  cwGroup: 'cw-group:mens-ellipse--wide', widthTag: 'wide',
  tags: ['cw-group:mens-ellipse--wide', 'staff-pick'],
})], ALL);
eq('only the genuinely missing tags are added', partial.changes[0].add.sort().join(','), "Men's Shoes,wide");
eq('still removes nothing', partial.changes[0].remove.length, 0);

console.log('\nStandard width correctly gets no width tag');
const std = CT.computePlan([P({ cwGroup: 'cw-group:mens-ac-runner--standard', widthTag: '' })], ALL);
eq('cw-group and gender only', std.changes[0].add.length, 2);
yes('no width tag invented', !std.changes[0].add.some((t) => /wide|narrow/.test(t)), std.changes[0].add);

console.log('\nA product the catalog could not classify is left alone');
const unparsed = CT.computePlan([P({ cwGroup: null, widthTag: '', gender: null })], ALL);
eq('no tag guessed from nothing', unparsed.changes.length, 0);

console.log('\nWhat is taggable, and who decides');
// computePlan tags DRAFT as well as ACTIVE, on purpose: the panel is often run
// to tag a drop before it is published. The QUEUE is stricter and holds drafts
// back itself (`if (p.status !== 'ACTIVE') return`), because a swatch group only
// includes ACTIVE products, so wiring a draft would produce cross-links to a
// product no shopper can reach. The two rules are deliberately different.
eq('a draft IS taggable by the panel', CT.computePlan([P({ status: 'DRAFT', cwGroup: 'cw-group:x--standard' })], ALL).changes.length, 1);
eq('archived is never touched', CT.computePlan([P({ status: 'ARCHIVED', cwGroup: 'cw-group:x--standard' })], ALL).changes.length, 0);
eq('no product id, nothing to write to', CT.computePlan([P({ id: null, cwGroup: 'cw-group:x--standard' })], ALL).changes.length, 0);

console.log('\nThe gender op corrects a wrong product type, and only when wrong');
const wrongType = CT.computePlan([P({ gender: "Women's", productType: "Men's Shoes", cwGroup: null })], ALL);
eq('type corrected', wrongType.changes[0].productType, "Women's Shoes");
const rightType = CT.computePlan([P({ gender: "Women's", productType: "Women's Shoes", cwGroup: null, tags: ["Women's Shoes"] })], ALL);
eq('left alone when already right', rightType.changes.length, 0);

console.log('\nThe real drop: 77 untagged of 88 is what this now handles unattended');
const drop = [];
for (let i = 0; i < 77; i++) drop.push(P({ id: 'gid://shopify/Product/' + i, handle: 'p' + i, cwGroup: 'cw-group:mens-ac-runner--wide', widthTag: 'wide' }));
for (let i = 0; i < 11; i++) drop.push(P({ id: 'gid://shopify/Product/x' + i, handle: 'q' + i, cwGroup: 'cw-group:mens-ellipse--standard', tags: ['cw-group:mens-ellipse--standard', "Men's Shoes"] }));
const r3 = CT.computePlan(drop, ALL);
eq('77 need work, the 11 that inherited do not', r3.changes.length, 77);
eq('scanned all 88', r3.summary.scanned, 88);
eq('cw-group adds', r3.summary.swatchAdds, 77);
eq('width adds', r3.summary.widthAdds, 77);
yes('and zero removals anywhere', r3.changes.every((c) => c.remove.length === 0));

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nAll passed\n');
process.exit(failures ? 1 : 0);
