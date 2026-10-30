// alt-text.mjs, The Run House.
//
// Alt text is what Google Images reads and what a screen reader says instead
// of the word "image". Measured 2026-10-30 over 5,000 ACTIVE in-stock
// products, 3,467 of them (69%) had none.
//
// Every case here came out of a real dry run against the live store, because
// the first version of the copy was wrong in two ways that only real titles
// showed.
//
// Run: node test/alt-text.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { altFor } from '../tools/backfill-alt-text.mjs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const eq = (a, b, m) => (a === b ? ok(m) : bad(m, { got: a, want: b }));

const shoe = (title, type) => altFor({ title, productType: type || "Men's Shoes" });
const acc = (title, type) => altFor({ title, productType: type || 'Hydration' });

console.log('\nA shoe says it is a shoe, and in what colour');
eq(shoe("ON Men's Cloudboom Echo 3 - All Black"),
  "ON Men's Cloudboom Echo 3 running shoe in All Black", 'the normal shape');
eq(shoe('Brooks Ghost 16 Wide - Black/Grey'),
  'Brooks Ghost 16 Wide running shoe in Black/Grey', 'a width stays in');

console.log('\nThe colour separator is not always spaced the same');
// HOKA writes "Cielo X 2 MD- Ceramic", no space before the hyphen.
eq(shoe('Hoka Cielo X 2 MD- Ceramic/Evening Primose (1134534-CE)'),
  'Hoka Cielo X 2 MD running shoe in Ceramic/Evening Primose',
  'a hyphen with no space before it still splits the colour');
eq(shoe('Hoka Mens Clifton 9 - Ice Water/Evening Primrose (1127)'),
  'Hoka Mens Clifton 9 running shoe in Ice Water/Evening Primrose', 'and the spaced form');

console.log('\nWith TWO hyphens, the colour is the LAST part, not the first');
{
  // A lazy regex split at the first hyphen and a dry run caught what that
  // does to the event tees: the event became the garment and the garment
  // became the colour.
  const a = altFor({ title: "Gasparilla 2026 - ASICS Men's Short Sleeve Tee - Celadon", productType: 'T-Shirts' });
  eq(a, "Gasparilla 2026 - ASICS Men's Short Sleeve Tee in Celadon",
    'the event stays the event and Celadon is the colour');
  /in ASICS/.test(a) ? bad('it split at the first hyphen again', a)
                     : ok('and the garment is not read as a colour');
}

console.log('\nA hyphen inside a NAME is not a colour separator');
eq(acc('Amphipod Hydraform Ergo-Lite Ultra™ (40002-20-01)'),
  'Amphipod Hydraform Ergo-Lite Ultra™', 'Ergo-Lite survives');
eq(acc('Saucony Inferno Quarter 3-Pack Socks (S34001-019)', 'Socks'),
  'Saucony Inferno Quarter 3-Pack Socks', '3-Pack survives');

console.log('\nThe trailing supplier code is dropped');
// "open paren two three five close paren" read aloud helps nobody, and it
// spends the first words Google reads on a number.
eq(acc('Amphipod AirFlow Lite™ Pack (235)', 'Storage'),
  'Amphipod AirFlow Lite™ Pack', 'a short numeric code goes');
eq(acc('Amphipod RunLite 10K™ 2 Bottle Hydration Belt (10002-10K-02)'),
  'Amphipod RunLite 10K™ 2 Bottle Hydration Belt', 'a long dashed code goes');
// but a parenthetical that is WORDS is part of the name
eq(acc('Some Product (Wide Fit)', 'Storage'), 'Some Product (Wide Fit)',
  'a parenthetical with no digits is kept, it is not a code');

console.log('\nOnly shoes get the word "shoe" added');
// The first version appended the product TYPE to everything, which reads as
// nonsense on accessories because the type is a category rather than a thing.
eq(acc('Amphipod Xinglet™ Vest (440)', 'Visibility'),
  'Amphipod Xinglet™ Vest', 'an accessory is not given its category as a noun');
eq(acc('PowerStep Adjustable Heel Lift (5093)', 'Insoles & Inserts'),
  'PowerStep Adjustable Heel Lift', 'nor an insole');
altFor({ title: 'Brooks Running Shoes Ghost - Black', productType: "Men's Shoes" }).match(/shoe/gi).length === 1
  ? ok('a title that already says "shoes" does not say it twice')
  : bad('"shoe" was added to a title that already had it');

console.log('\nIt never returns something unusable');
eq(altFor({ title: '', productType: "Men's Shoes" }), '', 'an empty title gives empty, so the row is skipped');
eq(altFor({}), '', 'a product with no title at all does not throw');
{
  const long = altFor({ title: 'X'.repeat(200) + ' - Black', productType: "Men's Shoes" });
  long.length <= 125 ? ok('a very long title is truncated to 125 characters')
                     : bad('alt text ran past the limit', long.length);
}
{
  // alt text must not open with "image of", which a screen reader already
  // announces and which wastes the words Google reads first
  const a = shoe("ON Men's Cloudboom Echo 3 - All Black");
  /^(image|photo|picture) of/i.test(a) ? bad('alt text opens with "image of"', a)
                                       : ok('and never opens with "image of"');
}

console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
process.exit(failures ? 1 : 0);
