// seo-titles.mjs, The Run House.
//
// The SEO title is the <title> tag and the blue line in a Google result.
// Measured 2026-10-30, 83% of ACTIVE in-stock products had none, so Google
// fell back to the product title, codes and all.
//
// Every case here came out of a dry run against the live store. The budget is
// 60 characters, which is roughly what a result shows, so the whole job is
// deciding what to drop, and the dry runs kept proving the first instinct
// wrong.
//
// Run: node test/seo-titles.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { seoTitleFor } from '../tools/backfill-seo-titles.mjs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => (a === b ? ok(m) : bad(m, { got: a, want: b }));
const T = (title, productType) => seoTitleFor({ title, productType });

console.log('\nNothing is ever longer than the budget');
{
  const long = T('X'.repeat(300) + ' - Black', "Men's Shoes");
  long.length <= 60 ? ok('a 300 character title is cut to ' + long.length)
                    : bad('ran past 60', long.length);
  /\s$/.test(long) ? bad('cut left trailing space', long) : ok('and not mid word');
}

console.log('\nThe supplier code never appears');
{
  const t = T('Hoka Mens Clifton 9 - Ice Water/Evening Primrose (1127895-IWEP)', "Men's Shoes");
  /\d{6}/.test(t) ? bad('a supplier code reached the title', t) : ok('no code in: ' + t);
}

console.log('\nA shoe gets the words people actually search');
eq(T('Hoka Mens Clifton 9 - Ice Water/Evening Primrose (1127895)', "Men's Shoes"),
  'Hoka Mens Clifton 9 Running Shoes, Ice Water',
  'model, noun, and a two tone colour shortened to fit');
eq(T('Saucony Mens Ballista MD- Black/Cool Mint (S29071-26)', 'Spikes'),
  'Saucony Mens Ballista MD Track Spikes, Black/Cool Mint',
  'a spike is a spike, not a running shoe');

console.log('\nDISTINCTNESS BEATS THE NOUN when the budget forces a choice');
{
  // A duplicate title across pages makes those pages compete. A missing noun
  // is a small loss. The first version had this backwards and fifteen New
  // Balance products, different colours AND widths, all came out as
  // "New Balance Mens Ac Runner Running Shoes".
  const a = T('New Balance Mens Ac Runner - COVERT GREEN (Extra Wide)', "Men's Shoes");
  const b = T('New Balance Mens Ac Runner - BLUE BIRD (Extra Wide)', "Men's Shoes");
  a !== b ? ok('two colourways of one model get different titles')
          : bad('both colourways collapsed to the same title', a);
  /COVERT GREEN/.test(a) ? ok('and the colour survives: ' + a)
                         : bad('the colour was dropped to keep the noun', a);
  /Extra Wide/.test(a) ? ok('and so does the width, which rides inside the colour')
                       : bad('the width was lost', a);
}

console.log('\nA long title is TRUNCATED rather than stripped back to the model');
{
  // Thirteen TELETIES hair ties all reduced to "TELETIES | The Run House"
  // because every candidate that fit had thrown the colour away.
  const a = T('TELETIES - Spiral Hair Coils | Small | Midnight Rain Hair Ties', 'Hair Accessories');
  const b = T('TELETIES - Spiral Hair Coils | Small | Silver Flames Hair Ties', 'Hair Accessories');
  a !== b ? ok('two hair ties get different titles')
          : bad('both collapsed to the same title', a);
  a === 'TELETIES' || a === 'TELETIES | The Run House'
    ? bad('fell back to the bare model', a)
    : ok('keeps what distinguishes it: ' + a);
}

console.log('\nThe store name is the first thing dropped, not the last');
{
  const short = T('Hoka Bondi 9', "Men's Shoes");
  /The Run House/.test(short) ? ok('a short title has room for it: ' + short)
                              : bad('the store name was dropped with room to spare', short);
  const long = T('New Balance Mens Fresh Foam X 860 V15 - REFLECTION (Narrow)', "Men's Shoes");
  /The Run House/.test(long) ? bad('the store name crowded out the colour', long)
                             : ok('a long one spends the room on the product instead');
}

console.log('\nA category is never used as a noun');
{
  // "Premiums Sport", "Big Kahuna", "Campeones" and "Inventory" are real
  // product types on this store. None of them is a thing a shopper searches.
  for (const ty of ['Premiums Sport', 'Big Kahuna', 'Campeones', 'Inventory', 'Visibility', 'Storage']) {
    const t = T('Amphipod Xinglet Vest', ty);
    t === 'Amphipod Xinglet Vest | The Run House'
      ? ok('"' + ty + '" is not appended')
      : bad('a shelf category reached the title for type "' + ty + '"', t);
  }
}

console.log('\nIt does not repeat a word the title already has');
{
  const t = T("Women's Jersey Long Sleeve T-Shirt - Navy", 'T-Shirts');
  (t.match(/T-Shirt/gi) || []).length === 1
    ? ok('"T-Shirt" appears once: ' + t)
    : bad('the noun was added to a title that already had it', t);
}

console.log('\nIt never returns nothing for a real product');
eq(T('', "Men's Shoes"), '', 'an empty title gives empty, so the row is skipped');
{
  const t = T('Brooks Ghost 16', '');
  t ? ok('a product with no type still gets a title: ' + t) : bad('no title produced');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
