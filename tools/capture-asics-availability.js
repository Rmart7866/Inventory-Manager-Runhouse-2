// capture-asics-availability.js, The Run House.
//
// PASTE THIS INTO THE BROWSER CONSOLE ON b2b.asics.com. It is not a Node
// script and cannot be: the availability endpoint needs the staff member's
// authenticated B2B session, which only a logged-in browser has. That is the
// same reason the supplier scrapers are Chrome extensions.
//
// It writes asics-availability.json, which is the input to
// tools/push-asics-availability.mjs, the tool that puts ASICS stock on the four
// LA 2027 singlet listings at the Warehouse.
//
// HOW TO USE IT
//   1. Open any product page in an open ASICS basket, so the URL looks like
//      https://b2b.asics.com/orders/100671391/products/TF3085
//      The order number in that path IS the basket number, which both
//      endpoints need. Without a basket in the path this cannot run.
//   2. Open the console, paste the whole file, press enter.
//   3. It downloads asics-availability.json. Move it to the repo root.
//   4. node tools/push-asics-availability.mjs          (dry run)
//      node tools/push-asics-availability.mjs --apply
//
// WHY IT ASKS THE API AND NOT THE PAGE. The rendered grid prints "30+" for
// anything over 30, so reading the page caps every deep size at 30. Measured
// on TF3085 2026-10-23: Black Small is really 161, Black Medium 205, Red
// Medium 302, and all three read as 30 off the grid. The API returns the real
// figure, which is the whole point of capturing it this way.
//
// House style: no em dashes. Use commas, periods, or the word "to".

(async () => {
  const STYLES = ['TF3085', 'TF2934'];   // men's and women's Rival II Singlet

  const basketNo = (/\/orders\/(\d+)\//.exec(location.pathname) || [])[1];
  if (!basketNo) {
    console.error('No basket number in the URL. Open a product page inside an ' +
      'open basket, so the path looks like /orders/<number>/products/<style>.');
    return;
  }

  const get = async (url) => {
    const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });
    // 202 with an empty body is a soft throttle, not an answer. Treating it as
    // success would hand back a style with no sizes, which reads as "out of
    // stock everywhere" downstream.
    if (r.status === 202) throw new Error('throttled (202), wait half a minute and run it again');
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    const t = await r.text();
    if (!t.trim()) throw new Error('empty body for ' + url);
    return JSON.parse(t);
  };

  console.log('basket ' + basketNo + ', reading the catalog...');
  const cat = await get('/aac/products?basketNo=' + encodeURIComponent(basketNo));
  const rows = (cat && cat.data) || [];
  console.log('catalog: ' + rows.length + ' rows');

  const out = { capturedAt: new Date().toISOString(), basketNo: basketNo };

  for (const style of STYLES) {
    const mine = rows.filter((r) => String(r.itemCode) === style);
    if (!mine.length) { console.warn(style + ': not in this basket\'s catalog, skipped'); continue; }

    // The colour codes must come from the catalog. A hardcoded list 400s on any
    // style that does not use those codes.
    const codes = [...new Set(mine.map((r) => r.colorCode))];
    const av = await get('/aac/products/' + encodeURIComponent(style) +
      '/availability?basketNo=' + encodeURIComponent(basketNo) +
      '&colorCodeDistributorNo=' + codes.map((c) => c + ':').join(','));

    // ONLY THE FIRST BLOCK. THE RESPONSE IS ONE BLOCK PER DELIVERY WINDOW.
    //
    // availability[] is not a list of chunks to merge, it is a list of future
    // delivery dates, each carrying what ASICS can ship THEN. Measured on
    // TF3085 2026-10-23:
    //
    //     block  date         Red M   Black M
    //     0      2026-10-24     302       205     <- available now
    //     1      2026-10-26       0        26
    //     2      2026-11-03       0         0
    //
    // Footwear goes further, up to 6 blocks: 1011C244 size 10.5 is 173 now,
    // 83 in November and 0 in every later window. So merging the blocks with
    // the last one winning reports a shoe with 173 units as ZERO, and the
    // first version of this file did exactly that, which is how the delivery
    // windows were noticed at all.
    //
    // Block 0 is the At Once journey, in stock and shippable today, which is
    // what a shopper on the site is buying. Take it and ignore the rest.
    const first = ((av && av.availability) || [])[0];
    if (!first) { console.warn(style + ': no availability blocks, skipped'); continue; }

    // Shape it the way push-asics-availability.mjs reads it:
    //   { TF3085: { '90': { 'M': 205, ... }, ... } }
    // The colour code is the key the push tool joins on, via the number inside
    // the Shopify colour name ("Black-090"), and the size key is ASICS' own
    // spelling ("M"), which the push tool maps to "Medium".
    const byColour = {};
    for (const [code, sizes] of Object.entries(first.stock || {})) {
      byColour[code] = {};
      for (const s of sizes || []) {
        const size = s.sizeUS || s.sizeKey;
        if (!size) continue;
        byColour[code][size] = Math.max(0, parseInt(s.quantityAvailable, 10) || 0);
      }
    }
    out[style] = byColour;
    out[style + 'Date'] = first.date || null;

    const names = Object.fromEntries(mine.map((r) => [r.colorCode, r.colorName]));
    const total = Object.values(byColour).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0);
    console.log(style + ': ' + Object.keys(byColour).length + ' colours, ' + total + ' units  (' +
      Object.keys(byColour).map((c) => c + ' ' + (names[c] || '?')).join(', ') + ')');
  }

  const json = JSON.stringify(out, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'asics-availability.json';
  a.click();
  console.log('downloaded asics-availability.json, ' + json.length + ' bytes. ' +
    'Move it to the repo root and run tools/push-asics-availability.mjs');
  return out;
})();
