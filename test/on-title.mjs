// on-title.mjs, The Run House.
//
// OnConverter.parseTitle splits a feed title into model and color, and the
// picker GROUPS BY THE MODEL IT RETURNS. Get it wrong and the picker stops
// being a list of shoes: on 2026-10-14 it showed 157 rows named "Ivory",
// "Black" and "Eclipse", because every two-tone color was being read as the
// model. None of those matched a product on the store, so all of them came up
// as new, which is how a push of 8,000 rows gets aimed at the wrong products.
//
// Two different things put a pipe in an ON title and they mean opposite things:
//   category prefix, BEFORE the model:  "ON Men's PO | Cloudhorizon 2 WP - Rock Alloy"
//   two-tone color, AFTER the model:    "ON Women's Cloudsurfer 2 - Sand | Ivory"
// The only safe order is to cut the color off at the last " - " first, then
// look for a category pipe in what is left.
//
// Run: node test/on-title.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import vm from 'node:vm';

const sb = { console, setTimeout, fetch: () => {}, localStorage: { getItem: () => null, setItem() {} },
  navigator: {}, location: { href: '' },
  document: { addEventListener() {}, createElement: () => ({ style: {}, appendChild() {} }), body: { appendChild() {} } } };
sb.window = sb; vm.createContext(sb);
vm.runInContext(fs.readFileSync(new URL('../on-converter.js', import.meta.url), 'utf8'), sb);
const OC = sb.OnConverter;

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (m, a, b) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

console.log('\nA two-tone color is a COLOR, never the model');
for (const [title, model, color] of [
  ["ON Women's Cloudsurfer 2 - Sand | Ivory", 'Cloudsurfer 2', 'Sand | Ivory'],
  ["ON Men's Cloudboom Strike - White | Black", 'Cloudboom Strike', 'White | Black'],
  ["ON Women's Cloudmonster 3 - Black | Eclipse", 'Cloudmonster 3', 'Black | Eclipse'],
  // The space-joined spelling the scraper now emits, same answer either way.
  ["ON Women's Cloudsurfer 2 - Sand Ivory", 'Cloudsurfer 2', 'Sand Ivory'],
]) {
  const r = OC.parseTitle(title);
  eq(`model of "${title}"`, r.model, model);
  eq(`color of "${title}"`, r.color, color);
}

console.log('\nA category prefix still parses, including multi-pipe');
for (const [title, model, color, cat] of [
  ["ON Men's PO | Cloudhorizon 2 WP - Rock Alloy", 'Cloudhorizon 2 WP', 'Rock Alloy', 'PO'],
  ["ON Men's PTR | X | Cloud X 4 - Black Eclipse", 'Cloud X 4', 'Black Eclipse', 'PTR'],
]) {
  const r = OC.parseTitle(title);
  eq(`model of "${title}"`, r.model, model);
  eq(`color of "${title}"`, r.color, color);
  eq(`category of "${title}"`, r.category, cat);
}

console.log('\nBoth kinds of pipe at once: prefix is the category, color keeps its pipe');
{
  const r = OC.parseTitle("ON Men's PO | Cloudhorizon 2 WP - Sand | Ivory");
  eq('model', r.model, 'Cloudhorizon 2 WP');
  eq('color', r.color, 'Sand | Ivory');
  eq('category', r.category, 'PO');
}

console.log('\nEvery gender prefix is stripped from the model, Unisex included');
for (const g of ["Men's", "Women's", 'Unisex']) {
  eq(`"ON ${g} Cloudmonster 3 Hyper LS"`,
     OC.parseTitle(`ON ${g} Cloudmonster 3 Hyper LS - Black Ice`).model,
     'Cloudmonster 3 Hyper LS');
}

console.log('\nGender is still read off the title');
eq("women's", OC.parseTitle("ON Women's Cloud 6 - Black").gender, "Women's");
eq("men's",   OC.parseTitle("ON Men's Cloud 6 - Black").gender, "Men's");
eq('unisex',  OC.parseTitle('ON Unisex Cloud 6 - Black').gender, 'Unisex');

console.log('\nNo model may come back looking like a bare color word');
{
  const colorish = /^(ivory|black|white|sand|eclipse|glacier|pearl|alloy|frost|rock|wolf|ice|fog|dew)$/i;
  let n = 0;
  for (const c of ['Sand | Ivory', 'White | Black', 'Glacier | Alloy', 'Fog | Dew']) {
    const m = OC.parseTitle(`ON Men's Cloudflow 5 - ${c}`).model;
    if (colorish.test(m)) { bad(`"${c}" leaked a color into the model`, m); } else { n++; }
  }
  if (n === 4) ok('four two-tone colors, none became the model');
}

console.log(failures ? `\n${failures} FAILED\n` : '\nAll passed\n');
process.exit(failures ? 1 : 0);
