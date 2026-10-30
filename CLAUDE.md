# The Run House Inventory Manager

A browser tool that turns supplier B2B files into Shopify updates for a dropship
shoe business, plus a Cloudflare Worker that holds the Shopify Admin credential
server side. No build step, no framework, no bundler: `index.html` loads a dozen
plain JS files in order and every module is a global object.

    Staff open the tool (GitHub Pages, public, no secrets)
       -> browser calls the Cloudflare Worker (holds CLIENT_ID / CLIENT_SECRET)
           -> Worker calls the Shopify Admin GraphQL API
       -> browser also reads/writes Firestore directly (shared staff state)

House style, everywhere in this repo, code and comments: **no em dashes**. Use
commas, periods, or the word "to". Comments explain WHY, especially why a safety
rule exists. Match that when you edit.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The whole UI: inline CSS (light base + a dark theme override), brand cards, password gate, script tags with `?v=` cache busters |
| `main.js` | `BrandConverter`, the controller. Dropzones, scan, `convertBrand()`, the download buttons, `writeAllInventory()` |
| `*-converter.js` | One per brand: saucony, hoka, brooks, asics, puma, on, newbalance, merrell, altra. Parse the supplier file, emit inventory rows and a new-product CSV |
| `catalog-client.js` | Reads `GET /catalog` from the Worker, builds the known sets, and is the client for every write route |
| `inventory-tracker.js` | `compare()`: new products, new colorways, removed colorways. Also the shared Firestore `Ignore` list |
| `brand-picker.js` | The product checklist per brand and the tracker report (including "Clear all in Shopify") |
| `product-enrichment.js` | The review modal for new products (price, tags, description, SEO) and Stage 4 "Create in Shopify" with image upload |
| `catalog-tags.js` | Bulk width / cw-group / gender tagging and the swatch sibling metafields, plus the post-create swatch queue |
| `product-library.js` | Full screen browser of every carried product, with single and model-wide editing |
| `catalog-ui.js` | Freshness bar, refresh button, fallback and building banners |
| `sales-report.js` | The weekly dropship sales panel. Reads `GET /sales/dropship`, write-secret gated because revenue should not sit behind the public bundle token |
| `b2b-links.js` | Firestore-backed scraper link lists for ASICS and Brooks |
| `barcode-data.js` | Generated barcode map (ASICS + ON), about 2 MB, committed |
| `apparel.html` + `on-apparel-converter.js` | ON apparel, on its own page. See "Apparel" below |
| `worker/` | The Cloudflare Worker: `src/*.js`, `test/*.mjs`, `wrangler.toml` |
| `tools/` | One-off `.mjs` backfill scripts that write straight to Shopify, and `.py` feed builders |
| `scrapers/` | The Chrome extensions that pull each supplier's B2B portal. See `scrapers/README.md` |
| `test/` | Node tests for front-end modules that decide inventory numbers |

Not loaded by `index.html`, effectively dead: `tracking-integration.js`,
`JsBarcode.all.min.js`. The loose `.xlsx`, `.csv` and `*-rollback-*.json` files in
the repo root are gitignored run artifacts and supplier data.

## Commands

```sh
# Worker
cd worker && npx wrangler dev --port 8790     # local worker (.dev.vars unlocks writes)
cd worker && npx wrangler deploy              # deploy, independent of git
cd worker && npm test                         # auth + needham + known-set + category + parity
cd worker && npm run parity                   # tag logic vs the Color Swatch originals

# Frontend
python3 -m http.server 8000                   # serve the tool from the repo root
node test/on-apparel.mjs                      # apparel converter: sizes, joins, guards
node test/newbalance-images.mjs               # NB photo join: colorway key, gallery order
node test/newbalance-create.mjs               # NB new-product CSV feeds Stage 4
node test/auto-tag-queue.mjs                  # post-create auto tagging stays add-only
node test/merrell.mjs                         # merrell converter: picker, CSV
node test/altra.mjs                           # altra converter: the 99+ trap, eight gender spellings
node test/canon-model.mjs                     # picker model matching: gender forms, NB families
node test/apparel-known-set.mjs               # apparel zeroing: Needham scoping, no-SKU guard
node test/picker-tabs.mjs                     # ON picker: shoes and apparel split on the article code
node test/on-supplied-images.mjs              # ON photos reach Stage 4 from the sidecar, no probing
node test/on-title.mjs                        # ON titles: a two-tone color is never the model
node test/enrich-csv.mjs                      # applyToCSV round trip: a comma in Tags cannot shift a column
node test/on-apparel-type.mjs                 # ON apparel: garment type, size ladder, never typed as a shoe
node test/supplier-images.mjs                 # CDN photo keys, URL attach, folder pooling
node test/inventory-guardrail.mjs             # the pre-write gate, calibrated on 6 weeks of real files
node test/method-wiring.mjs                   # every this.x() call resolves, whole repo
node test/scraper-feeds-tool.mjs             # the scraper's CSV still feeds the inventory manager
node test/asics-headless.mjs                  # headless runner: row location, real converter, POD drift
node scrapers/on/test/apparel.mjs             # ON scraper: apparel sizes survive a scrape
node scrapers/asics/test/api.mjs              # ASICS API: real qty not the 30 cap, gendered width
node scrapers/asics/test/location-per-link.mjs # a URL line can send its stock to Warehouse
node scrapers/asics/test/quantity-cap.mjs     # the page caps at 30+, a known limitation
node scrapers/asics/test/color-code-digits.mjs # apparel colour codes are TWO digits, not three
node scrapers/asics/test/readiness-gate.mjs   # the gate must open on a garment, not just a shoe
node scrapers/asics/test/delivery-windows.mjs # one delivery window, not six concatenated
node scrapers/asics/test/singlet-api-only.mjs # singlets read the API and never the capped grid
node scrapers/on/test/reorder-filter.mjs      # ON: only stock the re-order catalog says you can buy
node scrapers/on/test/sku-size.mjs            # ON SKUs: apparel sizes cannot put a space in a SKU
node scrapers/on/test/images.mjs              # ON photos: lookup only, gallery rows in the product CSV
node scrapers/on/test/csv-quoting.mjs         # ON CSV: an inch mark in a name must not break the row

# Check a scraper CSV before writing it. Exit 0 means safe. Writes nothing.
node tools/inventory-guardrail.mjs <csv>
node tools/inventory-guardrail.mjs <csv> --accept   # record it as the baseline

# Capture the whole ASICS link list with no human driving Chrome. Writes a CSV
# and a verdict, never to Shopify. Needs the dedicated profile logged in once.
node tools/asics-headless-run.mjs --setup     # log the profile in, once
node tools/asics-headless-run.mjs             # capture, check, write a CSV
node tools/asics-headless-run.mjs --limit 3   # the first 3 links, for a smoke test

# Barcodes (after dropping new supplier files into the gitignored barcodes/)
python3 tools/build-barcodes.py               # writes barcode-data.js, barcodes only

# Backfills, dry run by default, --apply to write, each writes a rollback file
node tools/backfill-brooks-barcodes.mjs
node tools/tag-recent-products.mjs            # cw-group/width/gender on a new drop
node tools/clear-bogus-specs.mjs              # specs.* written from a blank registry cell

# ON apparel, after a create batch. Dry run by default, --apply writes.
node tools/prune-thin-drafts.mjs --since 2026-10-20 --min-units 10
node tools/tag-apparel-collections.mjs --since 2026-10-20   # collection tags, add-only
node tools/apparel-content.mjs --since 2026-10-20   # SEO copy + shopify.* category metafields
node tools/apparel-collections.mjs            # apparel:<group> tags + the apparel collections
node tools/reorder-on-apparel-media.mjs      # lead with the on-model shot, not ON's flat render
node tools/fix-on-blurry-images.mjs          # replace images uploaded at thumbnail size

# LA 2027 print on demand singlets. ASICS availability -> Warehouse.
node tools/audit-pod-pools.mjs --csv pod-audit.csv   # read only, the whole picture
node tools/set-inventory-policy.mjs --handles <a,b>  # turn OFF continue selling
node tools/push-asics-availability.mjs               # write ASICS stock to the LA listings
# and the capture that feeds it, pasted into the B2B console, not run by node:
#   tools/capture-asics-availability.js
node tools/tag-apparel-groups.mjs             # cw-group: tags so colourways collapse to one card
node tools/fix-la-singlet-listings.mjs       # category, SEO, vendor and type on the four LA listings
node tools/enable-file-upload.mjs            # logo upload on, by handle, in the LIVE theme
node tools/backfill-singlet-skus.mjs         # SKUs so a scraped singlet row can join
node tools/clear-singlet-needham.mjs         # repair: singlets must have NO Needham level

# Redo, the returns app's cart line item
node tools/move-redo-location.mjs            # which store orders carrying it route to

# Collective, the dropship marketplace: 2,728 products across 40+ vendors.
node tools/tag-collective-apparel.mjs         # the apparel tags, by VENDOR verdict
node tools/group-collective-colorways.mjs     # cw-group + swatches for one-product-per-colour

# Storefront navigation, 2026-10-21 restructure
node tools/split-trail-by-gender.mjs          # trail:mens / trail:womens + the 2 collections
node tools/build-nav-menu.mjs                 # writes main-menu-v2, never touches main-menu
node tools/wire-apparel-swatches.mjs          # swatch metafields, ACTIVE products only
node tools/delete-apparel-typed-as-shoes.mjs  # repair for the 2026-10-20 mistyping

# New Balance photos: Widen TIFs to a Stage 4 gallery folder (macOS sips)
node tools/convert-nb-images.mjs

# Brooks photos: Stage 4 pulls these from the supplier CDN by itself, so this
# is only for building a local archive or feeding another tool.
node tools/fetch-brooks-images.mjs --dry-run
```

To point the local UI at the local Worker, in the browser console:

```js
localStorage.setItem('rhWorkerUrl','http://localhost:8790');
localStorage.setItem('rhCatalogToken','dev-catalog-token-not-real');
location.reload();
```

Test status as of 2026-09-08: the whole worker suite passes, `npm test` exits 0.
The known-set fixture failures noted here previously were fixed in 937068f.

`worker/test/bulk-fields.mjs` guards a specific trap: `makeBulkAssembler` in
`catalog.js` is a WHITELIST. Adding a field to the bulk query and to
`buildCatalog`'s output is not enough, it must also be copied in the assembler,
or it arrives empty on every product in production while looking fine on the
paged dev path. That is how `createdAt` was lost for a month.

## Deploying

- The frontend is served by **GitHub Pages from `origin/api-integration`**, not
  `main` (`main` is about 110 commits behind). A change is live only once pushed
  to that branch.
- **Bump the `?v=N` on any JS file you edit, in `index.html`.** Returning
  browsers hold the old file otherwise. Pages also caches `index.html` for about
  10 minutes; open the site with any extra query (`?fresh=25`) to bypass it.
- The Worker deploys separately with wrangler and does not care about git.

## The rules that must not be broken

**This repo is public.** Supplier files carry wholesale pricing, so `.gitignore`
blocks `*.xlsx`, `*.csv`, `*.local`, `.dev.vars`, and the per-run rollback files.
Never commit those. `barcode-data.js` is committed on purpose because it is
barcodes only, no pricing.

**Needham scoping.** Dropshipped product is footwear stocked at the single
**Needham** location. Every write is Needham scoped and every removed/zero
decision is computed against the Needham-scoped known set, so physical store
stock at Falmouth, Walpole or Scituate can never be touched.
`worker/src/inventory.js` refuses to write at all if `NEEDHAM_LOCATION_ID` is
unset, and `catalog-client.js` warns loudly when `needhamScoped` is false.

**The write gate.** `worker/src/auth.js` refuses any route marked
`forWrite: true` unless `AUTH_MODE === 'access'`. Do not soften it and do not add
a bypass. The intended way out of bearer mode is a cheap separate domain on
Cloudflare plus a real Access application. There is one temporary, owner directed
exception in production today: the `ALLOW_BEARER_WRITES=true` secret opens the
create route in bearer mode. Its safety comes from downstream guards, see below.

**Three separate secrets, three different jobs.**
- `CATALOG_TOKEN` is in `catalog-client.js` and therefore **public by
  construction**. It guards reads only.
- `WRITE_SECRET` is never in the bundle. Staff paste it once and it lives in
  `localStorage.rhWriteSecret`. It is required on top of the bearer token for
  every destructive route (`/inventory`, `/tags/*`, `/product/update|prices|media`).
- `ADMIN_TOKEN` gates the expensive `?fresh=1` rebuild and never reaches the browser.

The page password in `index.html` and the Firebase config are likewise public by
construction. Treat them as speed bumps, not as authentication.

**A created shoe carries a product CATEGORY, and that is load bearing.**
`buildProductSetInput` sets the Shopify taxonomy leaf `aa-8-1`, Athletic Shoes,
on any product whose type ends in "shoes", the same gate as the 2 lb weight.
Category is not decoration: Massachusetts exempts footwear under $175 and
Shopify applies that from the CATEGORY, the shopify.* category metafields only
become available once one is set, and the Google and Meta feeds read it.
Measured 2026-09-18, 980 shoes had none and every product this route created
was one of them, so new shoes were taxed where the older ones were not.

**THE APPAREL NAVIGATION IS A GROUP TAG, and three other options were ruled
out first.** `tools/apparel-collections.mjs` writes one `apparel:<group>` tag
per garment and the collections key on it. Why not something cleverer:

- **Not the product type.** 5,837 products carry an apparel type, but The Run
  House's own printed and team gear is the largest vendor in most of them (188
  Hoodies, 174 T-Shirts, 80 Shorts), so a type-keyed collection becomes a spirit
  wear page. Outside ON the types are also inconsistent: "Clothing", "Bra",
  "Legging", "Pant", "Shirts & Tops", and 293 women's products with no type.
- **Not the taxonomy category.** 1,382 of the 1,390 tagged garments do have one,
  but only ON's sit at a LEAF. 220 of the others stop at the parent "Activewear
  Pants", which lumps shorts, tights, joggers and track pants together, and 313
  stop at bare "Activewear". Useless for the split. It IS the right rule for the
  `on-apparel` brand collection though: `aa-1` is Clothing, so with descendants
  it takes every ON garment and NO ON shoe (shoes are `aa-8`, a different
  branch), needs no tag, and picks up future ON apparel automatically because
  the create route sets a category.
- **Not a smarter rule.** A Shopify smart collection is either all-AND or
  all-OR, NEVER mixed, so `tag = "womens apparel" AND (type = T-Shirts OR type
  = Tanks)` cannot be expressed at all. One tag per group is what makes the AND
  form possible.

The opt-in set is the `womens apparel` / `mens apparel` / `unisex apparel` tags
the two pre-existing apparel collections already use: 1,390 products, 42
vendors. Classification reads the product type first and falls back to the
TITLE, which is the only signal left for the untyped ones; measured 2026-10-20,
1,382 of 1,390 classified and the 8 that did not are listed and left alone,
never guessed. Rule order matters: bra first, then legging and tight before
short so "Zero Short Tights" is a tight, and the loose shirt and top words last
so "Tank Top" does not beat "tank".

`VENDOR` matching is CASE INSENSITIVE, verified 2026-10-20: the store holds both
"On Running" and "ON Running" and both sit in the collection whose rule says
"On Running". Socks, gloves and headwear get a group tag but deliberately no
collection, because `socks-1` (392) and `headwear` (59) already cover them store
wide and a second page for the same thing splits the SEO.

**SOME ON IMAGES WERE UPLOADED AT 200x200, AND THE CAUSE IS A CDN PARAMETER.**
ON's photography lives on CONTENTFUL, and a Contentful url takes sizing
parameters. The BARE url is the original; `?w=200` returns a 200 pixel crop.
Eight ON Club garments were created from a sized url, so the file sitting on
Shopify's CDN IS 200x200 and cannot be sharpened, only replaced from source:

| url | result |
|---|---|
| bare | 4000 x 4000, 3.4 MB |
| `?w=2500&fm=png` | 2500 x 2500, 1.7 MB |
| `?w=200` | 200 x 200 |

**This is the ASICS Scene7 trap again** (see the `?scl=1` note): check the size
a CDN returns BY DEFAULT, per host, before trusting it. Two hosts on this store
have now shipped tiny images this way.

2500 and PNG are not arbitrary: every other ON flat here is a 2500x2500 PNG and
PNG preserves the cut-out's transparency, so matching them matters more than the
last pixels of the 4000px original.

**The filename is the join back to the original.** The Shopify copy keeps
Contentful's filename, and `on-pdp-cache/` already holds the on.com pages
fetched by `apparel-content.mjs`, which carry the full Contentful paths. Index
the cache by filename, look it up, rebuild the url. 7,084 assets indexed from
101 cached pages, which covered all 8. A filename not in the cache is reported
and skipped, never guessed.

`fix-on-blurry-images.mjs` uploads the replacement and waits for Shopify to
report it READY before deleting the old one, because media processing is
asynchronous and deleting first would leave a product with no image at all.

**107 other small images remain**, on older products whose assets are not in
the cache: mostly footwear at 600 to 780px, from `Small-JPEG-...` and
`..._fpx.webp` sources that predate this pipeline. They are legible, unlike the
200px ones, and fixing them needs a source this cache does not have.

**ON'S LEAD IMAGE IS A FLAT CUT-OUT, AND THE RULE FOR FIXING IT IS THE
FILENAME, NOT THE POSITION.** Every garment the 2026-10-20 drop created led
with ON's flat render: the garment alone on a transparent background, no model
and no drape, which reads as a CAD mock up on a collection grid. The shot type
is in the asset name:

| suffix | what it is |
|---|---|
| `...-d.png` | flat cut-out, 2500x2500 square |
| `...-4x5-...-g1.jpg` | on-model studio shot, 2000x2500 |
| `...-1x1-...-ka-g1.png` | ANOTHER flat, also square |

**"Promote the second image" is almost right and quietly wrong.** On
`on-womens-club-boxy-t-barberry` the second image is a `ka` flat, so that rule
swaps one cut-out for another. Matching the 4x5 on-model pattern picks the right
shot wherever it sits and skips a product that has none.

Measured 2026-10-28 over the 282 garments: 1,660 on-model images, 253 flat `-d`,
9 flat `ka`, 23 other. 266 products had an on-model shot and exactly ONE already
led with it. `tools/reorder-on-apparel-media.mjs` promoted the other 265, moving
one image per product so the rest of the gallery order survives, and leaving the
16 with no on-model shot untouched.

**ON'S OWN STATS COME FROM on.com, JOINED ON THE ARTICLE CODE.** The Backstage
B2B feed carries stock and price but no copy, and the review modal starts every
description empty, so the 2026-10-20 drop created 282 garments with nothing in
the description. ON's public site has the real numbers, and the join is exact
rather than fuzzy: `www.on.com/en-us/products.xml` is a plain sitemap of about
3,900 product URLs and **every URL ends with the article code**, the same code
inside our variant SKUs.

    .../3-core-shorts-1wf1015/womens/black-apparel-1WF10150553
    SKU  ON-1WF10150553-BLA-L

`tools/apparel-content.mjs` walks that, fetches ONE page per 7-character STYLE
(100 pages covered all 282 products), and reads weight in grams, fabric
composition, the feature bullets, the recycled-content claim and the country of
origin. Measured 2026-10-20: 269 of 282 matched on the full article code and the
other 13 on the style prefix, a colourway we carry that ON does not sell direct.
All 100 styles yielded a weight, a fabric and a feature list.

Three things are load bearing. The page is a Nuxt app whose data sits in a
FLATTENED `__NUXT_DATA__` array where every value is an index into one shared
array, so it has to be resolved by index, not read; a plain `JSON.parse` gives
numbers where strings belong. The product object is the one carrying BOTH `usps`
and `materials`, because any looser test picks up the recommendation carousel's
stubs. And robots.txt disallows `/api` and `/pdp`, so only the sitemap and
ordinary product pages are fetched, one per style, with a delay. Pages cache to
the gitignored `on-pdp-cache/`, about 77 MB, rebuildable in minutes.

**The description is composed, not copied.** Publishing ON's own meta description
verbatim would put a duplicate of their snippet on our page, which is the
opposite of SEO friendly, so the opening sentence is built here from the facts
and only ON's FEATURE BULLETS are reproduced, which is what the 41 ON garments
already live on this store do. Two traps found by reading the first dry run and
now guarded: a bullet is spliced into the sentence only if it names a PART of the
garment and carries no comma list, or you get "with recovery, all-day wear, soft
touch"; and a COTTON-dominant top gets a lifestyle sentence rather than a
performance one, because calling a 100% cotton Club tee "built for everyday
miles" is the kind of wrong a returns desk pays for.

**The shopify.\* CATEGORY METAFIELDS are metaobject references, not text.**
Shopify stores them as `list.metaobject_reference` pointing at entries of the
reserved `shopify--*` metaobject definitions. This app has `read_metaobjects`
but **not** `write_metaobjects`, so a value whose metaobject does not already
exist on the store cannot be created from here: those are reported and skipped.
Available 2026-10-20: color-pattern (82), fabric (23), activity (23),
activewear-clothing-features (24), neckline (9), age-group (5), target-gender
(4), sleeve-length-type (4), top-length-type (3). Empty, so never written:
size-type, liner-type, pocket-type, hood-design, hood-type, clothing-fit,
pattern, support-level. Mapping a value WRONG is worse than leaving it unset,
because a shopper filters on it, so `fabricOf` takes the highest stated
percentage and the feature rules only fire on phrases that clearly mean the
listed value.

**THE STORE'S APPAREL NAVIGATION IS TAG DRIVEN, on exact strings.** Read off the
live collections 2026-10-20:

| Collection | Rule |
|---|---|
| Women's Apparel `womens-apparel-1` | TAG = `womens apparel` AND inventory > 0 |
| Men's Apparel `mens-apparel-2` | TAG = `mens apparel` AND inventory > 0 |
| Women's `womens` | TAG = `women` OR `women's` |
| Men's `mens-1` | TAG = `Men's` OR `men` OR `mens` |
| Socks `socks-1` | TAG = `sock` OR `socks` |
| Hats & Headwear `headwear` | TAG = `Hats` OR `headband` |
| Short Sleeve `short-sleeve` | TAG = `short sleeve` |
| On Footwear and Apparel `on-running` | VENDOR = `On Running` |

A garment without those tags is on the site by direct link only: in no apparel
collection and no gender collection. The lowercase spellings are what the 41 ON
garments already live on the store carry, so they are the proven form, not a
guess. `OnConverter` emits them for 1xx article codes and
`tools/tag-apparel-collections.mjs` backfills, add-only. `short sleeve` is
deliberately NOT emitted: that collection is curated at 47 products and the tees
alone would nearly triple it.

**And the tag merge in `applyToCSV` is a UNION, not a replace.** The review modal
pre-fills its Tags box with `"<vendor>, <model>"`, so `enrich.tags` is never
empty, so the old two-way union replaced the column with just those two.
Footwear never noticed because inheritance from a live sibling puts cw-group,
width and gender back. Apparel has no sibling, so the 2026-10-20 drop created
all 365 garments carrying exactly `["ON Running", "<model>"]`, losing the gender
and garment-type tags the collections key on. Union also matches the house rule
that tagging is add-only outside `product-library.js`.

**THE LINK SCRAPER READS A CAPPED GRID, and that is a known, accepted
limitation.** The portal prints "30+" for any size over 30, which is
`maxQuantityDisplayed` in the data behind the page, and `parseQuantity` turns
that string into 30. Measured on TF3085 2026-10-23: Black S is really 161,
Black M 205, Red M 302, and all three read as 30. It UNDERSTATES, never
overstates, so the failure mode is a shoe looking less available than it is,
never overselling.

**A version that called the availability API instead was built and REVERTED on
2026-10-26. Do not simply rebuild it.** The API does return the real figures,
and the fast "Scrape All Shoes" button already uses it successfully. But
swapping the data source under the link scraper caused a chain of regressions
that cost far more than the cap does, and the bug that actually had staff
blocked was never the cap at all. What went wrong, so it is not repeated:

- `recordsFromAvailability` was written for the fast path and reads CATALOG row
  fields (`itemCode`, `itemName`, a NUMERIC gender, `widthLabel`,
  `compactSizes`). Colorways built from `getProductInfo` and `findColors` carry
  `styleId`, `productName` and a gender WORD, so only `colorName` overlapped and
  every record came back with no style, no name and no gender. The array was
  non-empty, so the DOM fallback never fired either.
- Fetching the catalog to fix that costs 5.7 MB per call (3,713 rows,
  measured), and `sessionStorage` CANNOT hold it: the write throws
  QuotaExceededError every time. The throw was caught, so the cache silently
  never worked and every link re-downloaded 5.7 MB against an endpoint that
  soft throttles with 202. Filtering to the run's own styles fixes that (25
  rows, 25.7 KB) but is more machinery again.
- `availability[]` is ONE BLOCK PER DELIVERY WINDOW, not chunks to merge.
  This one is now FIXED, and it had been doing real damage. See the next
  section.

If it is worth doing, build it ALONGSIDE the page path and compare both against
real pages before anything switches over.

**THE LOADED EXTENSION IS `scrapers/asics`, AND CHROME DOES NOT RE-READ IT ON A
PAGE RELOAD.** Verified 2026-10-23 out of Chrome's Secure Preferences: the
Default profile loads extension id `jenlmlkpgjkimakmkcpffmbhpcmhiamf` unpacked
from `/Users/ryanmartin/Inventory-Manager-Runhouse-2/scrapers/asics`, so the
repo IS the live extension. Two stale copies sit on the Desktop
(`asics-scraper-2`, both 2026-09-15, 37 KB smaller) and neither is loaded. Do
not edit those.

A fix can therefore be correct on disk, committed, and still not be what the
page runs: the content script is re-read when the extension is RELOADED on
chrome://extensions, and `background.js` only then.

Also worth knowing when reading a B2B console: `/Users/ryanmartin/Desktop/chrome
extensions /shipping` also injects on b2b.asics.com and logs
`detectB2BSite returned: asics`, which is NOT this scraper.

**THE BUG THAT HAD EVERY SCRAPE FAILING WAS A METHOD ON THE WRONG CLASS.**
`locationForScrapedUrl` was written inside `UnifiedShopifyConverter` while its
only caller, `extractCurrentPageDataBackground`, is on
`EnhancedASICSInventoryExtractor`. So `this.locationForScrapedUrl` was
undefined and EVERY page of EVERY run threw

    TypeError: this.locationForScrapedUrl is not a function

immediately AFTER extracting its rows successfully. The console read
"Extracted 80 inventory records", then "AUTO-SCRAPER: Inventory CSV format
verified", and then the run died. So the symptom was a scrape that plainly
found its data and still produced no file, on footwear and apparel alike, and
nothing in the message pointed anywhere near a location feature.

The timeline pins it: the last CSV the link scraper produced is dated
2026-10-22 13:19, and the commit that introduced this is 2026-10-23 10:19. It
broke the tool for four days and survived a revert, because it predates the
work that was reverted.

`location-per-link.mjs` is the OTHER half of the lesson. It pulled the method's
TEXT out of content.js with a regex and ran it as a standalone function, so it
proved the logic correct and proved nothing about whether anything could CALL
it. It stayed green throughout. It now loads the real class and asserts the
method is callable on an instance of the extractor and absent from the
converter.

**`alert()` ON COMPLETION FREEZES THE TAB.** `completeBackgroundScraping` ends
every run with a modal `alert()`, which blocks the renderer: the extension stops
receiving events, the navigation loop cannot advance, and Chrome itself reports
that it is waiting for the user. Reproduced 2026-10-26 by running a one url
scrape and watching the tab stop evaluating `1 + 1`, then failing to close with
"Chrome may be waiting for the user". Four more sit on the fast path, on a
download error and on two input validations.

The completion one IS now fixed, because with the TypeError above repaired it
became the next thing standing between a working scrape and a usable file: the
run finished, downloaded, and then froze the tab it finished in. It is a banner
now, and the six status fields above it already said the same thing. The four
remaining alerts fire on a human mistake before a run starts, or on the fast
path, which is a different situation; replacing those is a separate change.

**THE READINESS GATE WAS THE THING REFUSING APPAREL, not the extractor.**
`checkPageReadinessEnhanced` decides whether a scrape may run at all, and on
timeout it reports "No inventory data found" WITHOUT EVER CALLING THE
EXTRACTOR. The same words are printed by a second, unrelated path inside
`extractCurrentPageDataBackground`. That duplicate wording is why this took
several rounds: fix after fix went into the extractor while the gate in front
of it never opened.

The gate was footwear shaped in four independent ways. Measured on the live
women's singlet TF2934, 2026-10-26, on a FULLY rendered page:

| condition | demanded | actually present | result |
|---|---|---|---|
| colour code | `/^\d{3}$/` | 2 digits | 0 valid |
| size cell | numeric 6 to 16 | XS S M L XL 2XL | 0 valid |
| cells per row | `>= 10` | 6 | 0 valid rows |
| minimum sizes | `>= 10` | 6 | fails |

Every threshold was an absolute number standing in for "the ladder has finished
rendering", which only holds when the ladder is a shoe's. They are now relative
to the page's own shape: a full row is `max(3, sizeCount)` cells, and
completeness is `quantityCount >= sizeCount`. That is STRICTER on footwear than
ten was, so it cannot fire early on a half drawn grid. Verified after the fix:
the singlet gate opens with 6 colours, 6 sizes, 6 rows and 36 quantities, and
1013A141 still opens with 4 colours and 4 full rows, emitting the same 80
records as before.

**A fifth bug fell out of it: the `>= 6` bound was wrong on FOOTWEAR too.**
Style 1013A141 runs 3.5 to 13, so the gate counted 15 sizes where the ladder is
20 and silently ignored 3.5 through 5.5. `findSizes` has no such bound and read
all 20, so the gate and the reader disagreed about the same page.
`sizeTokenKind` is now the single vocabulary both use, numeric 1 to 20 or the
apparel words, and it rejects what `.bg-primary.text-white` also catches:
"Yes", "Accept", "Add to Cart" and a staff email address.

**A COLOUR CODE IS TWO OR THREE DIGITS, and `findColors` demanded three.**
Footwear codes are three ("001", "020") so the test was never wrong on a shoe,
which is why it survived this long. Apparel codes are TWO. On the live TF3085
page the swatch row is `23-RED 01-WHITE 43-ROYAL 50-NAVY 90-BLACK 94-STEEL
GREY`: the selector found all six elements and the digit test threw all six
away. `color-code-digits.mjs` pins both widths and keeps the rejections
rejected.

**And `findSizes` no longer INVENTS a ladder.** It used to return a hardcoded 17
slot shoe ladder when it read nothing, and `extractInventoryData` maps quantity
cells onto the ladder BY POSITION, so on a garment six apparel quantities
silently became shoe sizes 6 through 8.5 in a file that looks perfectly valid.
That is the exact ON scraper bug `checkFile` exists to refuse. Reading nothing
now means no rows, which is the honest answer.

**Two readings that look alarming and are not the fault.**
`li[data-v-e4dd3fec]` is ALREADY 0 on the live site, that vue scope hash
changed and the generic `li` fallback covers it. And the colour swatches and
quantity grid render ASYNC, several seconds after navigation, so a scrape that
runs too early sees zero of everything; that is what the wait time per page is
for.

**NOTHING FETCHES SUPPLIER STOCK ON A SCHEDULE, and the daily cron is not that.**
`0 9 * * *` rebuilds the catalog KV, which READS Shopify into cache. Dropship
shoes are updated when a human opens the B2B portal, runs the scraper, drops the
CSV on the tool and presses Write. The scraper is a Chrome extension precisely
because it rides the staff member's authenticated session; a Worker has no way
into ASICS B2B. Any "daily update" for these singlets is the same manual run
until there is an ASICS EDI feed, which is already on the rep list.

**BROOKS HAS A CEILING AT 100 AND NOBODY KNEW.** This file documents the ASICS
"30+" cap at length and said nothing about Brooks, which has exactly the same
bug and more of it. `scrapers/brooks/content.js` reads the FastTrack grid and
does, literally:

    if (placeholderText === '100+') {
        currentInventory = 100;
    }

Measured 2026-10-29 across 14 real Brooks files spanning six weeks: the maximum
is **exactly 100 every single time and NEVER once above it**, with 58 to 59% of
non-zero rows pinned there, about 1,900 rows a run. No real distribution does
that. ASICS by comparison puts 40% of its non-zero rows on its ceiling.

It UNDERSTATES, never overstates, so the failure direction is the safe one and
nothing has been oversold because of it. Fixing it properly needs an API path
the way ASICS has one, and the Brooks account's
`is-export-products-allowed` flag is off, so it stays a known limitation for
now. It is recorded here so the next person does not rediscover it, and the
guardrail reports it on every run.

**AND BROOKS DELIBERATELY DISTORTS LOW STOCK.** `applyInventorySecurity` in the
same file is applied to every quantity before it reaches the CSV:

| real quantity | what is written |
|---|---|
| 3 or fewer | **0** |
| 4 to 10 | **1** |
| above 10 | the actual number |

So a Brooks zero does not mean the supplier has none, and a Brooks 1 means
somewhere between 4 and 10. That is intentional, presumably to avoid selling
thin supplier stock, and it is left alone. Two consequences worth holding:
Brooks' 35% zero share is partly synthetic, and its most common non-zero value
being 1 is this rule, not the data.

**AN UNATTENDED RUN NEEDS A GATE, AND A STATISTICAL ONE IS NOT ENOUGH.**
`tools/inventory-guardrail.mjs` reads a scraper CSV and exits 0 only if it
looks safe to write. It is an ADDON: nothing calls it yet, the write path is
unchanged, and it writes nothing itself. The point is that a human watching a
run catches a broken file by eye, and a thrice-daily job has nobody watching.

It was calibrated against six weeks of real ASICS files, 2026-09-15 to
2026-10-27, and that is the only reason it is useful. The first version used
ABSOLUTE thresholds and blocked nine of eleven good runs:

- **ASICS is routinely 63 to 68% zero.** Most sizes of most colourways really
  are out of stock at the supplier. An absolute "15% of a brand at zero" rule
  fires on every single run.
- **Rows really do sit on exactly 30**, because the portal prints "30+" and the
  page path reads it literally: 13 to 15% of ALL rows, which is 36 to 40% of
  the NON-ZERO ones. The guardrail reports the second figure, since a ceiling
  is a statement about rows that carry a number. Either way it is a known,
  accepted limitation, not an event.
- **A style can be genuinely sold out.** `1011B` read 97% zero on 2026-09-18
  and 97% again on 2026-09-21, two good runs three days apart.

So every threshold is measured against the LAST ACCEPTED RUN, not against an
absolute. What matters is a brand zeroing out 20 points MORE than last time, or
the cap share jumping 10 points, never the level itself. A gate that fires on
good runs gets switched off, which is worse than no gate.

**AND THE CHECK THAT MATTERS MOST IS NOT STATISTICAL AT ALL.** The 2026-10-27
file, the one that created 45 Needham inventory levels on print-on-demand
singlets, is statistically indistinguishable from a good run: 7,647 rows,
48,771 units, 63% zero, 40% of its non-zero rows on the ceiling, every figure
in line with the five runs before it. The fault was 96 rows out of 7,647 carrying `Needham` instead
of `Warehouse`, which is noise to every threshold above and always will be.
`POD_STYLES` is therefore a NAMED rule: TF3085 and TF2934 rows must go to
Warehouse, full stop. The list is explicit rather than a `/^TF/` pattern for
the same reason `tools/set-inventory-policy.mjs` takes explicit handles, a
pattern would quietly catch a future ASICS apparel style that genuinely is
stocked at Needham.

Against the real history it now passes nine of eleven files and blocks exactly
the two that caused damage: 2026-10-14 on `DUPLICATE VARIANTS` (31,094 of
39,131 rows, the delivery-window bug) and 2026-10-27 on `PRINT ON DEMAND IN
THE WRONG PLACE`. 2026-09-22 also blocks, correctly, at 2,343 rows against
7,745, a partial scrape.

    node tools/inventory-guardrail.mjs <csv>            # exit 0 means safe
    node tools/inventory-guardrail.mjs <csv> --accept    # record as the baseline

**THE CEILING IS DETECTED, NOT CONFIGURED, and that is how Brooks was found.**
The first version hardcoded 30, so it was blind to every brand but ASICS.
Measured over the newest real file per brand, 2026-10-29:

| brand | rows | max | most common non-zero | verdict |
|---|---|---|---|---|
| ASICS | 7,647 | 30 | 30, 40% of non-zero | a ceiling |
| BROOKS | 5,003 | 100 | 100, 58% of non-zero | a ceiling |
| HOKA | 3,057 | 2,100 | 300, 19% | NOT a ceiling, round pack sizes |
| PUMA | 3,678 | 452 | 1, 12% | healthy |
| ON | 7,112 | 4,069 | 1, 5% | healthy |

The signature that separates a cap from honest round numbers is that on a
capped feed almost NOTHING sits above the most common non-zero value, because
everything deeper piles onto the ceiling instead. HOKA is the case that makes a
naive rule fail: 300 is its commonest value but 2,100 exists, so those are real
pack quantities.

**"NOTHING above it" was the first rule and it was too strict**, which cost the
warning on the very first clean run. One ASICS file now carries BOTH sources:
the page scrape caps at 30, and the two singlet styles come from the uncapped
availability API and run into the hundreds. So 1,051 rows sat at 30, 38% of the
non-zero ones, 57 rows exceeded it, the maximum was 302 and the ceiling went
unreported. A mixed file is the NORMAL case now that the singlets ride the link
list. Measured 2026-10-29, share of non-zero rows above the modal value:

| file | above modal | verdict |
|---|---|---|
| ASICS page only | 0.0% | ceiling |
| BROOKS | 0.0% | ceiling |
| ASICS page + api, mixed | 2.0% | ceiling |
| HOKA | 17.2% | no ceiling |
| PUMA | 88.3% | no ceiling |
| ON | 95.5% | no ceiling |

Nought to 2 against 17 and up is a wide gap, so the threshold sits at 5%.

The ceiling EXISTING is a warning, since it is a known limitation. What blocks
is the ceiling MOVING, which means the capture changed under you, or more of
the file piling onto it, which means more of the file is a guess.

**THE PER-GROUP ZERO CHECK IS BY STYLE FAMILY, NOT BY BRAND, and the name hid
a false positive.** Each run is one supplier, so grouping inside a file can
only be by style. The key shape is brand dependent: ASICS SKUs are
`1011C127-001-10` so stripping trailing digits gives `1011C`, a family of about
3,700 rows, while Brooks SKUs are `110442297-...` where stripping leaves
nothing, so every style becomes its own group of 30 to 90 rows. Brooks style
110442297 is legitimately 98 to 100% zero, which tripped the
almost-entirely-zero rule on 6 of 14 good Brooks runs. A single sold out style
is not a brand collapsing. A group must now be at least 4% of the file before
it is judged, which keeps every ASICS family that has ever caught anything and
drops the noise, and a FILE WIDE zero check was added that needs no grouping at
all and therefore works on any SKU shape.

**Validated against a second brand, which is the only reason to trust it.**
Walked chronologically, each accepted run becoming the next baseline: ASICS 9
of 12 pass with the 3 blocks being 2026-10-14 (duplicates, whole-file zeroing,
three family jumps), 2026-09-22 (2,343 rows against 7,745) and 2026-10-27 (the
singlets at Needham). Brooks 11 of 13 pass, the blocks being the two genuinely
partial files at 481 and 225 rows and one 2026-09-17 scrape carrying 285
duplicated rows.

**A DUPLICATE THAT AGREES IS HARMLESS, ONE THAT DISAGREES IS A WRONG NUMBER.**
A Shopify import keeps the LAST row for a variant, so duplicates carrying the
same figure write what they would have written anyway. Duplicates that
disagree let row ORDER decide, and the dangerous subset is a zero landing last
over a real figure, because that zeroes stock that exists. Treating both the
same was too lenient at one end and too noisy at the other: measured 2026-10-29
over chunked exports, 2, 5 and 8 zero-wins duplicates per 1,000 row chunk,
which is 0.2 to 0.8% and sailed under a 1% share threshold while quietly
zeroing that many real variants. ANY zero-wins duplicate now blocks, because
one is already a wrongful zero, while agreeing duplicates are only a warning.

**The guardrail found a hand-assembled file that would have zeroed real stock.**
`puma-inventory-final.csv` in Downloads has 971 of 2,611 variants repeated and
**506 of them disagreeing**, in the shape `1 then 0` and `13 then 0 then 0`, so
an import of it writes zero over stock that exists. All five genuine Puma
scraper outputs have ZERO duplicates, and the `combined-` and `unified-`
files, which are the real import channels, are clean too. So this is not a
Puma scraper bug, it is what a hand concatenated file looks like, and it is
exactly the thing worth catching before a write.

**"NOT A SHOPIFY INVENTORY CSV" IS ITS OWN ANSWER.** Columns are found by NAME
because the format varies: the ASICS scraper writes 19 columns, Puma's writes
20 (it adds Barcode at position 10), and an older Puma export is a different 10
column format with no `On hand (new)` at all and `Main Location` in the
Location column. Handed that last one the reader used to return a full set of
rows whose every quantity was NaN, and the verdict read "a row has a non
numeric quantity", which sends you hunting for a bad row in a file whose
problem is that it is the wrong KIND of file. It says which column is missing
now.

**THE BASELINE CARRIES A VERSION, because changing what a field MEANS is a
silent trap.** `atCapShare` used to be the share of ALL rows and is now the
share of NON-ZERO rows. An old baseline's 0.14 against a new run's 0.38 is a
units mismatch, not a change in the data, and it blocked a run that had just
been verified good at 47 links out of 47. An older baseline is now reported as
stale and the fields whose definition moved are SKIPPED for that run, while
rows and units, which never changed meaning, are still compared. A safety
device whose reference format changes has to say so and ask to be re-accepted,
never produce a confident wrong answer from a stale reference.

**It fails closed.** No baseline is a BLOCK, not a pass, so the first run has
to be looked at by a human. `--accept` refuses to record a file that failed any
check other than the missing baseline, because the baseline is what every later
run is judged against and accepting a bad one makes that fault the new normal.
`inventory-guardrail-baseline.json` is gitignored: it is per-machine, and a
shared one would be comparing two different link lists.

`test/inventory-guardrail.mjs` is 32 assertions and every one reproduces a bug
that shipped. Both calibration findings are pinned there too, so a future
tightening of a threshold fails the suite rather than quietly blocking every
run.

**THE HEADLESS RUNNER CAPTURES THE ASICS LIST WITH NO HUMAN CLICKING, AND IT
STILL WRITES NOTHING TO SHOPIFY.** `tools/asics-headless-run.mjs` reads the
same Firestore link list the page reads, drives a headless Chrome on a
dedicated profile, and emits the same 19 column inventory CSV the extension
produces, then runs it through the guardrail and prints a verdict. The import
is unchanged: a human still presses the button, or does not, on the strength of
that verdict. Capture is what is automated here, not the decision.

    node tools/asics-headless-run.mjs --setup      log the profile in, once
    node tools/asics-headless-run.mjs              capture, check, write a CSV
    node tools/asics-headless-run.mjs --limit 3    smoke test on three links

**IT REIMPLEMENTS NOTHING.** Both extension files are read off disk and
evaluated, so there is one copy of every rule that decides a number:
`content.js` for the readiness gate, `findColors`/`findSizes`, the API only
singlet path and `locationForScrapedUrl`; `background.js` for
`convertToInventoryCSV`, which is the converter that actually decides the
Location column. A selector fix in the extension reaches this for free, and
nothing fixed here can drift from what staff run by hand. `background.js` ends
in `chrome.runtime` listeners so it gets a stub, and the CSV helpers touch no
chrome API. `test/asics-headless.mjs` fails if the injection cut point,
`API_ONLY_STYLES`, the readiness gate or `locationForScrapedUrl`'s signature
moves.

**THE PROFILE IS ITS OWN, AND LOGGED IN BY HAND ONCE.** Chrome locks a
user-data-dir, so reusing the staff member's everyday profile would collide
with whoever is using Chrome and a half copied profile is a good way to corrupt
a login. `--setup` opens a genuinely separate browser, which needs a distinct
`--remote-debugging-port`: macOS hands a url to a RUNNING Chrome and ignores
`--user-data-dir`, so without it the login lands in the everyday profile and
this one stays empty with no symptom but a later "not logged in". How long an
ASICS session survives is still unmeasured, which is the open question about
running this on a schedule.

**Measured on the first full run, 2026-10-29.** 47 links, 6,423 rows in 872
seconds, about 19 seconds a link. 42 links captured and 5 failed, and the
verdict refused the file for exactly that reason. The failures are what the
run was for:

| failures | cause | fixed by |
|---|---|---|
| 2 | `basketNoFromUrl is not a function`, both singlets | defining it, see above |
| 3 | the grid never drew inside 40 seconds | one retry per link |

**A clean 47 of 47 was then observed**, 2026-10-29 18:52: 7,007 rows in 696
seconds, one retry used, both singlets via the API to Warehouse, verdict PASS,
exit code 0. That run is now the recorded baseline, so the next one is compared
against a file somebody actually looked at.

**A PARTIAL FILE IS A BLOCK, AND ONLY THE RUNNER KNOWS IT IS PARTIAL.** The
guardrail sees the file and nothing else, so a run that skipped eight links
looks to it like eight styles of stock genuinely vanishing. The runner
therefore counts failures itself and blocks on any of them. Two related rules:
a redirect to a login page stops the WHOLE run rather than failing every
remaining page, and each link gets one retry first, because the grid draws
several seconds after navigation and occasionally does not draw at all, and one
slow page should not throw away the other 46.

**A DEAD BROWSER TARGET USED TO MAKE THE RUNNER EXIT 0, SILENTLY, HAVING DONE
NOTHING.** This is the worst failure shape available for an unattended job and
it is worth understanding. The CDP client returned a promise that settled only
when a reply arrived. If the page target went away mid run, which it does when
a tab is closed or a renderer crashes, no reply ever came, the `await` never
resolved, nothing else was queued, the event loop drained and **Node exited
with code 0**. No verdict, no CSV, no error, and a caller checking the exit
code reads success while the stock quietly goes stale. Observed on the
2026-10-29 full run, which stopped after link 32 and exited 0.

Three things stop it, and the third is the one that matters: every CDP call has
a 60 second deadline, a socket close or error rejects everything outstanding,
and `main()` tracks whether a verdict was actually PRINTED and refuses to exit
0 otherwise. "No verdict" is reported as a failure, never as "no changes".

**AND THE SELF LAUNCHING PATH IS THE ONE A SCHEDULE USES, so test that one.**
Every early run reused the browser left open by `--setup`, which is the
convenient path and not the real one. Verified separately 2026-10-29 with no
browser running: it launches its own headless Chrome on the profile, and the
ASICS session survives a full browser restart, so the login is on disk rather
than in the window.

**ZERO ROWS IS NOT SILENTLY ACCEPTED.** An API only singlet whose call failed
returns nothing on purpose, rather than the page grid's capped 30, and a style
really can be discontinued. Either way it is retried and then recorded as a
failure, so the verdict refuses the file rather than importing a hole.

**AND THE LINK LIST COULD NOT SAY "WAREHOUSE", WHICH IS THE 2026-10-27 BUG
STILL LIVE.** The extension takes the location as a word after the url on the
pasted line. The Firestore list has no field for it and "Copy All Links"
emitted the bare url, so the two singlet entries, both of which ARE in the
list, came across with no location and the converter's fallback sent them to
Needham. Every manual scrape was one import away from repeating the write that
had to be repaired by hand.

`B2BLinkManager.locationFor` now derives it from the STYLE and `copyActive`
appends it, so the copied list carries `<url> Warehouse` on those two lines and
is byte identical on every other. Derivation rather than a stored field on
purpose: a field would sit empty on the two links that already exist and need a
human to fill it in, which is exactly the step that failed. The list is
duplicated in `b2b-links.js` and `tools/inventory-guardrail.mjs` because one is
a browser global and the other an ES module, and `test/asics-headless.mjs`
fails if they disagree, the same guard `worker/test/brand-registry.mjs` gives
the two brand tables.

`b2b-links.js` was also the ONE script tag in `index.html` carrying no `?v=`
cache buster, so a returning browser would have kept the old copy and gone on
emitting bare urls with nothing to show for the fix. It is `?v=2` now.

**`locationForScrapedUrl` WAS OFF BY ONE, and it was harmless only by luck.**
It read `urls[(currentIndex || 1) - 1]`, written as though `currentIndex` had
already advanced past the page being scraped. It has not: the only caller is
`extractCurrentPageDataBackground` and `config.currentIndex++` runs AFTER it.
So the primary lookup returned the PREVIOUS line's url, which means a link
listed immediately after a Warehouse line inherited Warehouse, a footwear
style's stock written to the wrong location. The Warehouse line itself was
saved only by the path match below it. Nothing went wrong in practice purely
because the two singlets sit LAST in the live list, which is one reordering
away from not being true. The regression is now pinned both ways in
`scrapers/asics/test/location-per-link.mjs`, whose fixtures had themselves been
written to the off-by-one convention.

**THE REDO LINE ITEM'S LOCATION DECIDES WHERE ITS ORDERS ROUTE.** `re:do` is
the returns app. It drops a line item into the cart: product handle
`free-returns-on-shoes-only-does-not-apply-to-printed-apparel`, UNLISTED,
vendor `re:do`, five variants all sharing the SKU `x-redo`, inventory NOT
tracked, quantities a nominal million.

Because Shopify assigns an order to a location that stocks EVERY line item,
and this line was stocked at Walpole and nowhere else, every order carrying it
was pulled to Walpole. Moved to Scituate on 2026-10-28.

Two things to know before touching it again. The quantity is cosmetic, since
tracking is off, but it is set to a million to match what Redo itself wrote, so
nothing breaks if tracking is ever switched on. And the ORDER OF OPERATIONS
matters: `tools/move-redo-location.mjs` activates the new location BEFORE
deactivating the old, and refuses to deactivate if any variant failed to reach
the new one, because an item stocked at zero locations cannot be fulfilled at
all. It also refuses outright if the target location is inactive or does not
fulfil online orders.

**"WRITE ALL INVENTORY TO SHOPIFY" IS NEEDHAM ONLY, AND A WAREHOUSE ROW MUST
NOT RIDE IT.** The button in `main.js` builds a payload of `{ sku, quantity }`
with NO location in it, and `worker/src/inventory.js` targets
`NEEDHAM_LOCATION_ID` and nothing else, by design. So a row asking for another
location is written to Needham instead, silently.

That was unreachable for as long as the singlets matched nothing. It became
reachable on 2026-10-27, when they joined the ASICS link list and had SKUs
backfilled so their rows finally joined: scrape, drop the file on the tool,
press the button, and a few hundred singlets appear as real dropship stock at
Needham. The same write that had to be repaired by hand that day, through a
different door.

`writeAllInventory` now HOLDS BACK any row whose Location is not Needham,
counts them and says where they were going. Held back rather than redirected,
deliberately: the fix is not to teach that route about other locations,
because Needham scoping is what keeps a dropship write off a garment someone
counted on a shelf. The CSV import carries the Location column and handles
these correctly, and `tools/push-asics-availability.mjs` is the other way in.

**THE CSV PATH AND THE DIRECT WRITE PATH DIFFER, and only one honours
Location.**

| path | Location column | safe for singlets |
|---|---|---|
| Download CSV, import in Shopify admin | honoured | yes |
| "Write all inventory to Shopify" | ignored, Needham only | no, now held back |

`test/scraper-feeds-tool.mjs` pins the whole chain by running BOTH REAL SIDES
against each other: the CSV is built by `UnifiedCSVManager.convertToInventoryCSV`
out of `scrapers/asics/background.js`, the converter that writes the file staff
import, and read by `asics-converter.js`, the file `index.html` loads. It
asserts the tool still scans and converts it, that Warehouse survives the trip,
that the SKU and the uncapped 302 survive, that `allFeedSkus` covers the whole
feed so nothing reads as removed, and that the Needham-only filter holds. It
also runs against a real captured file when one is in Downloads: measured
2026-10-29 on a 7,007 row run, 47 products scanned and all 7,007 rows
converted with both locations intact.

**PRINT ON DEMAND RACE MERCH IS NOT DROPSHIP, and it lives at the WAREHOUSE.**
One blank garment is bought from ASICS and every team, charity and event gets
its own Shopify listing of it with their logo: TF3085 (men's Rival II Singlet)
has 41 listings and TF2934 (women's) has 50. The blanks are held at Warehouse,
not Needham, so the ASICS URL list now takes an optional location after the URL:

    https://b2b.asics.com/.../products/ZK1234              -> Needham
    https://b2b.asics.com/.../products/TF3085?colorCode=23  Warehouse

`locationName` was hardcoded in four places with the UI field marked LOCKED. It
is now per LINE, because these come from the same portal in the same scrape and
a per-run setting would mean two runs and a standing chance of pointing one at
the wrong place. Writing 300 singlets into Needham would look exactly like real
dropship stock. A line with no location still reads Needham, so every existing
list is unaffected. `scrapers/asics/test/location-per-link.mjs` pins that.

**THE CONVERTER THAT DECIDES THE LOCATION IS IN `background.js`, NOT
`content.js`.** There are two, and only one writes the file staff import: the
content script sends its records to the background chunk store, and
`UnifiedCSVManager.convertToInventoryCSV` REBUILDS the CSV from those chunks at
download time. That one had `'Needham'` written into the Location column as a
literal, so the per line location was carried the whole way to the export and
then dropped at the last step, with a CSV that looked completely normal. Fixing
`content.js` alone fixed the validation copy and the "download each" file and
nothing that mattered. Both now read `variant.locationName` with a Needham
fallback, and the test executes the BACKGROUND one.

The stamp also has to happen BEFORE any CSV is built. It used to run after
`convertToInventoryCSV` had already been called, so even the content script's
own output said Needham.

The match is on the PATH, not the whole URL: the portal rewrites the address as
it loads, appending `colorCode` and `deliveryDate`, so `window.location.href` is
never the string that was pasted in.

**"CONTINUE SELLING WHEN OUT OF STOCK" MAKES INVENTORY DECORATIVE.** A variant
with `inventoryPolicy: CONTINUE` sells whatever the number says, so tying a
listing's stock to anything achieves nothing while it is set. Measured
2026-10-23, 553 of the 576 variants across the four LA 2027 singlet listings
were CONTINUE and one pool had reached -61. The BASE garment listings were
correctly DENY throughout, which is exactly why only the mirrors went negative.
All 553 are now DENY. `tools/set-inventory-policy.mjs` takes EXPLICIT handles
and never a search, because CONTINUE is legitimate on made-to-order and preorder
listings and flipping one of those would silently stop it selling.

**THE AVAILABILITY RESPONSE IS ONE BLOCK PER DELIVERY WINDOW, and merging
them reports a stocked shoe as zero.** `availability[]` is not a list of chunks
to concatenate, it is a list of future delivery dates, each carrying what ASICS
can ship THEN. Measured 2026-10-23:

| style | block | date | qty |
|---|---|---|---|
| TF3085 Red M | 0 | 2026-10-24 | **302** |
| TF3085 Red M | 1 | 2026-10-26 | 0 |
| TF3085 Red M | 2 | 2026-11-03 | 0 |
| 1011C244 10.5 | 0 | 2026-10-24 | **173** |
| 1011C244 10.5 | 1 | 2026-11-11 | 83 |
| 1011C244 10.5 | 2 to 5 | to 2027-05-28 | 0 |

Block 0 is the At Once journey, in stock and shippable today, which is what a
shopper on the site is buying. `capture-asics-availability.js` takes block 0 and
ignores the rest.

**`recordsFromAvailability` DID NOT, AND IT WAS ZEROING THREE THOUSAND SHOES A
RUN. Fixed 2026-10-26.** It looped every block and pushed a record per block
with no dedupe, and a Shopify inventory CSV applies the LAST row for a variant,
so the zeros won. Measured on the real output of the fast button, the file
`asics-inventory-api-2026-10-14_1205.csv`:

| | |
|---|---|
| rows | 39,131 |
| unique variants | 8,037 |
| variants duplicated | 5,703, up to 15 times each |
| **variants whose LAST row was 0 while an earlier row was not** | **3,066** |

It now takes the EARLIEST window only, selected by `atpDate` rather than by
array position because nothing documents the order. A genuine zero in that
window is still reported as zero, so the fix cannot hide a real out of stock.
`delivery-windows.mjs` pins one row instead of six, the 302 beating the 0,
selection by date against a reversed response, and that every colour and size in
the chosen window still comes through.

**Anyone who imported a fast-scrape CSV before 2026-10-26 should assume it
wrongly zeroed shoes** and re-run before trusting the store's numbers. The LA
singlet path was never affected: it goes through `push-asics-availability.mjs`
from an at-once capture.

**THE FOUR LA LISTINGS WERE CREATED WITHOUT CATEGORY, SEO, VENDOR OR TYPE.**
`tools/fix-la-singlet-listings.mjs` set them 2026-10-26. The category was
"Clothing Tops > T-Shirts" on all four and is now
`aa-1-1-2-3`, Activewear Tops > Tank Tops, because a singlet is a sleeveless
running top and the category is what the Google and Meta feeds read. Unlike
footwear this is NOT a tax change: Massachusetts exempts clothing under $175
either way. SEO title and description were null on all four and are now written
per listing, distinct, so the four do not compete for one phrase. The women's
Charities listing alone read vendor "The Run House" with an EMPTY type against
"ASICS" and "Singlets" on its three siblings, and is now consistent with them.

Checked before writing the vendor: the only vendor keyed collection is
`asics-running-shoes`, and its rule is VENDOR EQUALS "Asics" **AND** taxonomy
node 352, the shoes node. So an ASICS garment cannot fall into a shoes
collection, which the two already-ASICS singlets confirm.

**Three things on those listings are deliberately NOT scripted.** The HANDLE on
the women's Charities listing is still
`2026-los-angeles-marathon-womens-performance-tank` while the title says 2027;
changing it changes the live URL and these links are going to the McCourt team,
so it needs a redirect and a decision, not a script. The WEIGHT is 0.5 lb
against 0.2 lb on the base garments, and shipping is rated off it, so guessing
low undercharges real postage on every order; someone should weigh a printed
singlet in its mailer. And the "Event Logo(s)" option stays a variant option by
owner's decision, with the 8x aggregate consequence recorded above.

**THE LOGO FILE UPLOAD IS HARDCODED IN THE THEME, AND IT IS TWO ALLOWLISTS
THAT MUST AGREE.** It is not an app and not a metafield. The block lives in
`snippets/product-form.liquid` in the LIVE theme, posts to Cloudinary (cloud
`drc8rx5xh`, preset `logo_uploads`) and records the result on the line item as
`properties[_file_url]`, `_file_name`, `_file_size`, `_file_type`,
`_cloudinary_id`, plus `FLOW TRIGGER`, `LOGO STATUS` and two fulfillment notes.
It accepts `.svg,.ai,.eps` only and rejects raster files.

The gate is a handle allowlist, `file_upload_products`, **assigned TWICE in the
same file under the same name**:

| around | gates |
|---|---|
| L29 | the MARKUP, the upload box inside the product form |
| L499 | the SCRIPT, the Cloudinary logic after the form tag closes |

A handle in only the first gives the customer a file input that does nothing. In
only the second, the script runs against markup that is not there. They had
already drifted when found 2026-10-26: 19 entries against 20, one handle listed
twice in the second, and the FIRST entry of the first list is two handles
concatenated with no comma between them

    ...performance-tee-lst353ls2026-los-angeles-marathon-sponsors-partners...

so that entry matches no product and that long sleeve tee has been silently
missing its upload box. Left alone, because enabling a product nobody asked
about is a different decision, but it wants fixing.

**Do not paste raw Liquid tags into this file.** GitHub Pages serves the
frontend from this branch and its default build runs the markdown through
Jekyll, which parses Liquid BEFORE markdown, so backticks do not protect it. A
An endform tag written here as documentation, with its Liquid braces intact,
failed the Pages build with "Liquid syntax error: Unknown tag 'endform'" and the
site stopped deploying.
A `.nojekyll` file at the root now turns Jekyll off entirely, which is right for
a repo of plain HTML and JS with no templates, but describe Liquid in prose
anyway rather than relying on it.

`tools/enable-file-upload.mjs` adds handles to BOTH lists, reads the live theme
by ROLE rather than by id (ids on this shop change and the live theme has been
renamed more than once), refuses to write if anything outside the two
allowlists differs, backs the file up first and takes `--restore <backup>`.

The four LA 2027 singlets were added 2026-10-26 and verified against the live
storefront: all four render the box and the Cloudinary script, while a base
garment, a shoe and last year's charity singlet are unchanged. Checking the
rendered HTML for the string `product-file-upload` is NOT a valid test, because
the CSS block carrying that class name is emitted on every product page
regardless of the gate. Test for the heading "Upload your logo" instead.

**EVERY SINGLET LISTING SHOWS WHAT ASICS CAN SHIP, not what is on a shelf, and
that includes the BASE garments.** Nothing is held and counted: the blank is
bought from ASICS when an order comes in and printed, so the number a shopper
should see is supplier availability. The two are wildly different. Measured
2026-10-26 before the base listings were brought in line:

| | on the shelf | ASICS can ship |
|---|---|---|
| TF3085 Black Small | 7 | 161 |
| TF3085 Black Medium | 4 | 205 |
| TF3085 Black Large | 8 | **0** |
| TF2934 Black Medium | **77** | 8 |

The old numbers were stale counts, wrong in both directions, and Large was
selling a size ASICS cannot supply. `tools/push-asics-availability.mjs` now
covers all TWELVE listings, the four LA 2027 mirrors and the eight base
garments, writing to Warehouse and nowhere else. 50 base variants were corrected
on 2026-10-26. All 52 base variants are DENY, so a zero genuinely stops the sale.

**THE BASE LISTINGS SPELL BOTH OPTIONS DIFFERENTLY FROM THE MIRRORS**, which is
why one tool did not already reach them. The mirrors say "Black" and "3Xlarge";
the base garments say "Black-090" and "3XLarge". Rather than a second pair of
tables that could drift from the first, the match now ignores case and
punctuation and reads the ASICS colour code off the END of the colour name when
one is there, so "Black-090" resolves to ASICS 90 and "White-001" to 01. All 52
base variants map with none left over.

**THE SINGLETS RIDE THE DAILY LINK LIST, and as of 2026-10-29 they actually
do.** This section previously said they already did. They did not: the API path
threw on entry on every run, see the `basketNoFromUrl` note below, and because
these styles have no DOM fallback by design the result was zero rows for both
singlets, silently, every single time. The SKUs were in place to receive the
write and nothing was ever written. First successful capture 2026-10-29, by
`tools/asics-headless-run.mjs`, measured: 96 rows, all Warehouse, TF3085 Red M
at 302, Black M at 205, Black S at 161, and NOT ONE row at 30. Those are the
same figures this file records as the real ones.

They are dropship out of the Warehouse, so they belong in the same routine as
the shoes. Two things had to be true first, and both now are.

**One: a scraped row has to JOIN.** A Shopify inventory CSV import matches on
the SKU, which this repo's own output proves: the scraper generates handles like
`1013a187-250`, no such product exists on the store, and those imports have
worked for months, while the variant SKU `1013A187-250-9` does exist.
`tools/backfill-singlet-skus.mjs` put SKUs on all 52 base variants in exactly
the format `generateSKU` builds, `<style>-<2 digit colour>-<ASICS size>`, so
Black Small on the men's is `TF3085-90-S`. It only ever writes to a variant with
NO SKU and never overwrites one. **If `generateSKU` ever changes, that backfill
must change with it or the join silently breaks.**

**Two: the numbers must not be capped.** ASICS carries these in the hundreds and
the grid prints "30+" over 30, so a page scrape would write 30 against a real
161 or 302. `API_ONLY_STYLES` is `['TF3085', 'TF2934']`, and for those styles
only, `extractSingletInventoryFromApi` takes quantities from the availability
endpoint's at-once window. Footwear is not in the list and still reads the page,
unchanged.

**RELOADING THE EXTENSION IS PART OF SHIPPING A SCRAPER FIX, and skipping it
has already cost a bad write.** On 2026-10-27 a scrape ran against an extension
that had not been reloaded, so it executed the PREVIOUS content.js. Two of the
fixes were therefore absent at once and they compounded:

- the per line Warehouse location never reached the CSV, so all 7,647 rows said
  Needham, singlets included;
- `API_ONLY_STYLES` did not exist, so the singlets were read off the capped
  grid, and Black XS, S, M and 3XL all came out as 30 against real figures of
  67, 161, 205 and 68.

And this time the rows LANDED, because `backfill-singlet-skus.mjs` had just
given those variants SKUs. 45 Needham inventory levels were created on the base
singlet listings carrying capped numbers, which is precisely the failure this
file warns about: a few hundred singlets at Needham read as real dropship
footwear stock. Warehouse was untouched and stayed correct.

`tools/clear-singlet-needham.mjs` is the repair. It zeroes then DEACTIVATES the
Needham level so the location is gone rather than merely empty, and it never
reads or writes Warehouse.

The lesson is ordering, not the fixes themselves: **adding SKUs to a listing
turns a harmless no-op scrape into a live write.** Before the SKUs existed, a
capped Needham singlet row matched nothing. After, it matched everything. Any
future backfill that creates a join key should land AFTER the code that feeds
it is confirmed running, not before.

**`basketNoFromUrl` WAS CALLED AND NEVER DEFINED, so the singlet path threw on
entry for three days.** `extractSingletInventoryFromApi` opens with
`this.basketNoFromUrl()`. That method belonged to the API-under-the-link-scraper
work REVERTED on 2026-10-26, and the singlet path was added AFTER the revert, so
the call site outlived the method. Every TF3085 and TF2934 page died with

    TypeError: this.basketNoFromUrl is not a function

before making a single request. It is the same shape as the
`locationForScrapedUrl` outage: a method that is not on the class that calls
it. And it was INVISIBLE, because the no-DOM-fallback rule below is working as
intended, so the honest answer to a thrown API call is zero rows. A silent zero
is what a correct safety rule looks like when the thing behind it is broken.

The basket number comes from the URL PATH, not from `apiBasketNo()`. There is
such a method on the class, and using it here would be wrong: the link list
pins a specific order per style while "current basket" is whatever the staff
member last opened, and a mismatch answers 403 rather than failing loudly.

**`test/method-wiring.mjs` NOW PINS THAT WHOLE CLASS OF BUG, REPO WIDE.** It
asserts every `this.x()` call resolves to something defined on the class or
module object that makes it, across all 63 JS files and 58 classes and module
objects. Scoping it to ASICS was the first attempt and was the same mistake as
writing the guardrail for one brand: nothing about this bug is ASICS specific.
A behaviour test cannot catch it, because the method is usually fine and it is
the WIRING that is wrong.

Three injected bugs confirm it fails: each historical bug put back, plus a
one-character typo in `scrapers/puma/content.js` to prove the repo wide scan
does the work rather than the two named assertions. A structural test that
cannot fail is exactly how `location-per-link.mjs` stayed green through a four
day outage.

**It needs a small JS lexer, and three cheaper approaches each gave WRONG
answers.** Worth knowing before simplifying it:

- **Indentation.** `scrapers/puma/content.js` and
  `scrapers/newbalance/content.js` define methods FLUSH LEFT inside a class,
  so an indentation rule reads every one of them as absent.
- **A column zero closing brace as the end of a class.** Same files: a flush
  left method's own closing brace is in column zero, so the body truncates
  mid class and 30 methods read as missing.
- **Naive string removal, then brace matching.** It desynced on this repo:
  `catalog-client.js` came out with three unbalanced braces, so
  `CatalogClient`'s body ran to the end of the file. The causes were regex
  literals containing quotes, and NESTED template literals, since a
  substitution can hold a function body with braces of its own.

Two traps inside the lexer itself, both of which produced false findings
first: a parameter list can contain parentheses
(`generateUniqueHandle(product, usedHandles = new Set())`), so the definition
match must run to the last `)` on the line; and `this.x()` inside an inline
event handler is not a call on the object, because
`scrapers/on/content.js` builds markup carrying
`onclick="this.closest(...)"` where `this` is the button.

**The test checks its own instrument first.** After stripping, every file must
have equal braces and parens, and it says so as its first assertion. If a
future file breaks the lexer, the test reports that rather than quietly
inventing unresolved calls.

**THERE IS NO DOM FALLBACK FOR AN API ONLY STYLE, and that is the point.**
Before the SKUs existed a scraped singlet row matched nothing, so a capped
number was harmless. Now it lands. A quiet fall back to the grid would overwrite
a real 161 with a 30, so a failed API call writes NO rows and says why. Reading
nothing is recoverable; writing 30s over real stock is not.

So the daily routine is unchanged: put the singlet URLs in the link list with
`Warehouse` after them, scrape, import. `push-asics-availability.mjs` remains
the tool for the four LA 2027 MIRROR listings, which have no SKUs and are not
in the link list.

**What the old objection was, for the record:** Treating them as dropship out of Warehouse is
exactly correct, and the ASICS URL list even supports a per line Warehouse
location. Two things stop the scraper doing it:

- **The join.** The scraper's CSV is keyed on the handle, option values and SKU
  it GENERATES (`tf3085-90`, size `S`, colour `BLACK`, SKU `TF3085-90-S`). The
  base listings have handle `asics-mens-rival-ii-singlet-black-tf3085`, sizes
  `XSmall` to `3XLarge`, colours `Black-090`, and **0 SKUs on all 52 variants**.
  Verified 2026-10-26: a scraped TF3085 CSV matched nothing at all, which is the
  only reason it has never done damage.
- **The 30 cap.** The scraper reads the rendered grid, which prints "30+" for
  anything over 30. Black Small would import as 30 against a real 161. For a
  garment sold to a whole marathon field that is not a rounding error.

So singlets stay on `push-asics-availability.mjs`, which has the real uncapped
figures and needs no SKUs because it joins on the option values. Leaving the
TF3085 and TF2934 lines in the link list is harmless today, since they match
nothing, but it is a loaded gun: add SKUs to those listings to "make the scrape
work" and it would start writing 30s over the real numbers.

The ASICS scraper's CSV cannot reach those listings, which is why this is a
separate tool: the CSV is keyed on the handle and option values the SCRAPER
generates, and the LA listings match none of them. Different handles, the colour
spelled "Black" where the base garment says "Black-090", and a third option the
scraper leaves blank. This tool is the ONLY thing that can
reach any of them, base listings included.

**AND THE SCRAPER'S CSV CANNOT UPDATE THE BASE LISTINGS EITHER.** This was
written here the other way round and it was wrong. Checked against
`asics-mens-rival-ii-singlet-black-tf3085` on 2026-10-23, every join key the
Shopify inventory import could use is a miss:

| | the scraper emits | the listing has |
|---|---|---|
| Handle | `tf3085-90` | `asics-mens-rival-ii-singlet-black-tf3085` |
| Option1 Size | `XS`, `S`, `M` | `XSmall`, `Small`, `Medium` |
| Option2 Color | `BLACK` | `Black-090` |
| SKU | `TF3085-90-M` | none, 0 of 7 variants carry one |

`generateHandle` builds `<styleId>-<colorCode>` and `generateSKU` builds
`<styleId>-<colorCode>-<size>`, which is the vocabulary the FOOTWEAR listings
were created in. Nothing in the singlet range was. So the per line Warehouse
location is still right and still necessary, but it only decides which location
a row names; it cannot make a row match a product that shares no key with it.
Reconciling those three vocabularies is exactly what
`push-asics-availability.mjs` exists to do, and it currently covers the four LA
2027 listings only.

Three vocabularies have to be reconciled and that is most of the work: ASICS
says S/M/L/XL/2XL, Shopify says Small/Medium/Large/Xlarge/2Xlarge; ASICS uses
numeric colour codes, Shopify uses names; and ASICS carries sizes these listings
do not sell (4XS through XS on the men's), which are simply not written.

**ONE GARMENT IS EIGHT VARIANTS.** The Charities listings carry a third option,
"Event Logo(s)", with 7 values that change neither the garment nor the price
(verified: price never varies by logo), so one size and colour is 7 variants
there plus 1 in Run Clubs, and all 8 get the same ASICS figure. That is 8x the
real availability in aggregate. It is survivable only because ASICS stock is
deep and because DENY now stops each variant at its own number. Moving the logo
to a line-item property would collapse it to one pool; the owner has kept it as
a variant option for now, deliberately.

**ASICS COLOUR CODES ARE ALREADY IN THE SHOPIFY COLOUR NAMES.** Read off the
B2B page 2026-10-23: `90` BLACK, `50` NAVY, `43` ROYAL, `01` WHITE, `23` RED,
`94` STEEL GREY. The base listings spell them `Black-090`, `Navy-050`,
`Royal-043`, `White-001`, which is the join. Red and Steel Grey have no base
listing on Shopify even though ASICS stocks both.

**SHOPIFY CANNOT SHARE AN INVENTORY POOL.** An inventory item belongs to exactly
one variant, verified 2026-10-23: a base and its mirror carry different
inventoryItem ids, so the matching numbers are a human copying by hand. Nothing
decrements the base when a mirror sells. Measured over TF3085 and TF2934: the
bases hold 352 units and the mirrors offer 1,037, and 54 pools are already
NEGATIVE, one listing at -61. The Charities listings multiply this further with
a third option, Event Logo(s) with 7 values, so ONE physical garment maps to 8
Shopify variants. `tools/audit-pod-pools.mjs` measures all of it, read only.

**A SHOPIFY MENU IS NOT IN THE THEME, and it is GLOBAL.** It lives in admin
under Content > Menus (`main-menu` is `gid://shopify/Menu/199495745791`).
Editing it changes every theme that points at it, live included, with no
preview. What makes a safe preview possible is that `sections/header.liquid`
reads `section.settings.menu`, so WHICH menu a theme uses is a per-theme
setting: write a NEW menu and point a duplicate theme's header at it.
`tools/build-nav-menu.mjs` writes `main-menu-v2` and never touches `main-menu`.

**THE HEADER RENDERS EXACTLY THREE LEVELS.** `header.liquid` loops `link`,
`child`, `grandchild` and stops, and Shopify's own menu editor caps at three
too. The old nav spent one of those levels on a single "Shop" item, so
everything was crammed into `Shop > Men > Apparel` with nowhere left to
subdivide: Apparel was ONE link instead of ten, and footwear had no
subnavigation at all despite the collections existing. Promoting the sections to
the top level is what gives that level back.

**ONLY THREE THINGS ON THIS STORE ARE GENDERED**, checked against every
collection's rule 2026-10-21: all-shoes by product type, the width collections,
and apparel. Trail, Race Day, Carbon Plate, Stability, Max Cushion, Cross
Country, Pickleball and every accessory have no gender in their rule and no
gendered variant exists, so listing them under both Men's and Women's was
duplicating one link under two headings. That is how Cross Country appeared in
the old nav FOUR times, and Pickleball and Stanley twice each.

Trail is the one exception worth splitting, at 255 men's and 252 women's. It
could not be done with a rule: the Trail collection matches ANY of seven tags
and a smart collection is all-AND or all-OR, never mixed, so
"(any of those seven) AND (this gender)" is inexpressible.
`tools/split-trail-by-gender.mjs` writes a flat `trail:mens` / `trail:womens`
tag instead, giving the 10 unisex shoes BOTH so they appear under each heading.

**Every menu link is a RESOURCE reference, never an absolute URL.** The old menu
had three hardcoded `https://therunhouse.com/...` links (Women's Apparel,
Merrell, Watches). Those break on a preview theme and on any other domain.
`build-nav-menu.mjs` resolves every handle to an id up front and REFUSES to
write if one is missing, so a typo cannot become a dead link.

**Sale is `sale`, not `discount-collection`.** The latter is a 23,002 product
utility set covering the whole catalogue.

**COLLECTIVE IS A DROPSHIP MARKETPLACE, and it is not shaped like a supplier
feed.** 2,728 products from 40+ vendors, brought in mostly 2026-08 and 2026-10.
It arrives with no `custom.*` metafields at all (1 of 2,728), 1,161 products
with no product type, and types like "Premiums Sport", "Big Kahuna",
"Companions" and "Block Square" where there is one.

**`Clothing` and `Clothing Accessories` are DIFFERENT BRANCHES, and the obvious
regex conflates them.** `/^Apparel & Accessories > Clothing/` also matches
"Clothing Accessories", which on the first pass counted 506 sunglasses and
watches as garments and had me about to "fix" categories that were already
right. The test must be `Clothing > ` WITH the separator. Measured 2026-10-21
over 2,140 active Collective products: 871 real clothing, 502 clothing
accessories (500 of them sunglasses), 767 neither.

**GENDER COMES FROM THE VENDOR, not the title.** A marketplace has 40 house
styles and most titles carry no gender word: "The Glee Halter Tank Top",
"Ombré Pink Purple - (Standard & Extra Wide)", "Uluwatu Seapine". Reading
gender off titles found a signal on 75 of 558. Reading it off the vendor
resolved 495, because these vendors each sell one thing. `VENDOR_VERDICT` in
`tools/tag-collective-apparel.mjs` holds the table, a per-product title gender
OVERRIDES it so Swift Running's "Men's Running Tank Top" is still right, and a
garment with neither is reported rather than guessed. Three were left for a
human. A SOCK is classified by its garment word alone, no verdict needed, and
socks take NO gender tag because the apparel collections are gender gated and
there is no Unisex Apparel collection: what makes them reachable is the `socks`
tag the live Socks collection keys on.

**One product per colour is only SOMETIMES groupable.** 695 Collective products
already carry Color as a real multi-value option and need nothing. Of the
clothing that does not, 401 are candidates and only 27 groups over 84 products
survive the guards. The colour NAME comes from a single-value `Color` option
first and the title second, because Comrad lists six products all titled
"Knee-High Compression Socks - Solid" with no colour in the title at all.
Crazy Compression's 127 products are deliberately NOT grouped: their titles ARE
the colour ("Tie Dye Rainbow", "Sequin") so the model reduces to nothing, and
one group of 127 would hide 121 products behind a swatch row that caps at 6.

Result 2026-10-21: the 16 apparel collections went from 396 to 1,165 active
products, plus 395 in Socks.

**COLLECTION-GRID GROUPING IS A DIFFERENT SYSTEM FROM THE PDP SWATCHES, and it
DOES need a theme edit.** Two things are easy to confuse:

| | File | Reads | Written by |
|---|---|---|---|
| PDP swatches | `snippets/colorway-swatches.liquid` | `custom.style_siblings` etc. | `tools/wire-apparel-swatches.mjs` |
| Collection cards | `snippets/shoe-collection-grid.liquid` | the `cw-group:<key>` TAG | `tools/tag-apparel-groups.mjs` |

The grid collapses products sharing a `cw-group:` tag into ONE card with a
swatch row under the price, but **only on the collection handles listed in
`grouped_handles`**, a single comma-separated Liquid string at the top of that
snippet. Liquid owns the list because two consumers need it, the JS grid and the
server-rendered seed. The 16 apparel handles were added there 2026-10-20, taking
it from 32 to 48. **That edit is in the LIVE THEME (`167063912703`), which is
not in this repo**, so it will not come back from git: re-apply it if the theme
is ever replaced or rolled back.

The apparel key's second half is the GENDER, not a width class, and the
vocabularies are disjoint so they can never collide:

    footwear   cw-group:<model>--standard | --wide | --xwide | --narrow
    apparel    cw-group:<model>--womens   | --mens | --unisex

This is NOT a drift of the ported tag rule. `parsers.js` and `group.js` compute
FOOTWEAR keys, nothing here touches them, and they never see apparel because
`classify()` keeps garments out of the footwear catalog. The grid does not parse
the key, it only groups products whose key strings are equal, so an apparel key
cannot change a footwear tag or a footwear grouping, and `npm run parity` is
unaffected.

**THE GROUPING IS ON ONLY, and the reason is worth keeping.** The key comes from
the title cut at the last `" - "`, which is right only where the title is
machine generated as `<model> - <colour>`. The first dry run over all 42
tagged-apparel vendors showed what that costs elsewhere: other brands use `" - "`
as a BRAND separator, so "90 Degree by Reflex - Powerlux High Rise Leggings"
gave a model of "90 Degree by Reflex" and **18 unrelated products, leggings, a
fleece hoodie, a zip jacket and men's pants, collapsed into one card**. Mono B
(11), Relay Active (7) and Alyth Active (7) did the same. A wrong group is far
worse than no group: ungrouped just shows one card per product, a wrong group
HIDES products behind a swatch row they have nothing to do with. Three guards
now stand in the way, and all three must pass: the derived model must not equal
the vendor name, every member must be the same garment type, and every member
must be a distinct colour. Groups of one are never tagged, since they already
render as a normal card and a later run picks up the pair.

**Apparel swatches need NO theme change.** `snippets/colorway-swatches.liquid` in
the live theme is pure display and entirely metafield driven: the tiles render on
`custom.style_siblings.size > 1`, the WIDTH pills on
`custom.model_widths.size > 1`, the gender tabs on `custom.gender_sibling`. So a
garment gets the same swatch grid as a shoe by writing `style_siblings` grouped
on model + GENDER, since a garment has no width class, and gets no width pills
simply by leaving `model_widths` and `width_class` unset.
`tools/wire-apparel-swatches.mjs` does it, ACTIVE only, because a swatch tile is
a link and a DRAFT product's URL 404s. Measured on the drop: 78 swatch rows with
more than one colourway, 30 garments carried in both genders.

**A GARMENT MUST NEVER WEAR FOOTWEAR'S SHAPE.** One ON feed file carries both
groups through one dropzone, split by the article code's first digit (1 apparel,
2 accessories, 3 footwear), and `worker/src/products.js` decides the shipping
weight AND the taxonomy category from one test, does the product type end in
"shoes". So a garment typed "Women's Shoes" is not a cosmetic slip: on
2026-10-20 six 3" Core Shorts were created with the Athletic Shoes leaf and a
2 lb weight, which is Massachusetts footwear exemption territory, so they were
set up to sell tax exempt. They were deleted and recreated.

Four places now fork on the group, and all four have to agree about what a shoe
is, because they all use the same `/shoes$/i` test:
- `OnConverter.apparelTypeFor` picks the product TYPE from a garment vocabulary.
  That vocabulary is **not free**: it must be the one `classify()` admits to the
  apparel catalog (`APPAREL_TYPE_RE`), or the tool creates a product it cannot
  read back, calls it new again next week, and makes a duplicate.
- `APPAREL_CATEGORIES` in `worker/src/products.js` maps that type to a real
  taxonomy leaf, verified against the live taxonomy 2026-10-20. Clothing is
  exempt under $175 in MA too, so no category is a defect and a wrong one is
  worse.
- `OnConverter.sortApparelVariants` imposes a size ladder, apparel only. ON
  writes apparel sizes alphabetically, so a straight read gave Shopify
  "L, M, S, XL, XS, XXL" and the product page opened on Large. Footwear is left
  alone: its numeric sizes arrive from the portal's size header already in order.
- `buildCreateSpecs` writes `custom.width_class` only for footwear.
  `_normWidth('')` returns "standard", which is right for a shoe whose feed is
  silent about width and wrong on a sports bra.

`test/on-apparel-type.mjs` and `worker/test/apparel-category.mjs` pin all of it,
including the drift between the two type tables.

**Create is create-only and draft-only.** `worker/src/products.js` skips any
handle that already exists, so `productSet` can never overwrite a live product,
and everything is created as `DRAFT`. That pair is what makes the temporary
bearer-write exception tolerable. Do not relax either.

**Bulk tagging is add-only.** `catalog-tags.js` only ever adds the correct tag.
The one place tag removal is intended is `product-library.js`, where a human is
editing one product's tags directly. That matters more since the post-create
queue runs `computePlan` unattended: it can only ever add, so an unexpected
result is a missing tag, never a lost one.

**Create-time tagging is inherit-only, and the queue is the safety net.**
`product-enrichment.js` copies tags from a live width-specific sibling and sets
nothing when there is none. The cw-group tag carries the width class, so a new
WIDTH of a carried model has no carrier either: on the 2026-09-08 NB drop, 77 of
88 launched untagged. `CatalogTags.processSwatchQueue` now applies the cw-group,
width and gender tags as well as the swatch metafields, once a queued handle
goes ACTIVE, using the tag the WORKER computed. Kill switch:
`localStorage.rhAutoSwatch = '0'`.

**Ported files must not drift.** `worker/src/parsers.js` and
`worker/src/group.js` are byte-for-byte copies of the Color Swatch app's files
(only the export line differs), and `tag-groups.js` is a pure subset. The tag the
tool writes must equal the tag the storefront groups on. If the tag rule needs to
change, change it in Color Swatch and re-copy, then run `npm run parity`.

## How a run flows

1. Drop a supplier file on a brand card. `BrandConverter._scanBrand` loads the
   live catalog for that brand (`CatalogClient.forBrand`), then calls the
   converter's `scanFile`/`scanFiles`, then renders `BrandPicker`.
2. The picker pre-checks what is already on Shopify: handle match first (the
   strongest signal, the scraper feeds carry live handles), then canonical model
   name (`CatalogClient._canonModel`).
3. **Generate** runs `converter.convert()`, then `alignInventoryToCatalog()`,
   then `InventoryTracker.compare()`. Removed colorways with real Needham stock
   get zero rows appended automatically, and the tracker report shows exactly
   what was zeroed, with a hard warning above 40 percent of a brand.
4. Output is either a CSV to import by hand, or a direct write:
   "Write all inventory to Shopify" (dry run, confirm, chunked) and
   "Clear all in Shopify" (dry run, confirm, zero only).
5. New products go through the enrichment modal, which can download a CSV or
   create drafts directly with metafields and photos.

**The enriched CSV is the ONLY channel between the review modal and Stage 4.**
`buildCreateSpecs` runs `generateNewProductCSV`, then `applyToCSV`, then parses
the result back; a product that comes out of that round trip malformed is simply
not created. So `applyToCSV` has to be a lossless CSV round trip, and it was not
until 2026-10-20: it read a line at a time with a parser that STRIPS quotes and
wrote rows back with `cols.join(',')`, which does not put them back. Tags always
carry commas ("ON Running, Cloud 6, Men"), so one field became three, every
column right of Tags shifted two places, `Option1 value` read empty, every
variant was filtered out and so was the whole product. On the ON apparel drop
that took 674 creatable products down to 109, and the modal said "Nothing to
create for Performance Volt Vest" about a model it was itself displaying. An
inch mark in a title was worse: the rejoined field re-emitted a bare quote and
desynced every row after it. It also killed the thumbnails, because the image
key is read off `variants[0].sku`, which had shifted too. It is now record
aware and re-quotes every field. `test/enrich-csv.mjs` pins the round trip.

**Three brands need no photo folder.** Brooks, New Balance and ASICS publish
their dealer photography unauthenticated at a URL derived from the code already
in the SKU, so Stage 4 looks it up when the create dialog opens and hands
Shopify the URL, which Shopify fetches itself. No download, no staged upload.
`REMOTE_IMAGE_SOURCES` in `product-enrichment.js` holds one entry per brand.

Three details are load bearing. The Brooks URL must carry NO query string (any
parameter routes it through the CDN's resizer and shrinks the 2048px master to
about 166 KB). Every view must be HEAD checked first, because coverage is
partial on all three and a URL that is not there leaves FAILED media on the
draft. And the check is only trustworthy because all three hosts answer
honestly when an image is missing, Brooks with a 404 and Scene7 with a 403,
rather than serving a placeholder; re-verify that before adding a fourth brand.

Measured coverage against colorways actually carried: Brooks 306/306 with 6
views, Saucony 97/100 sampled with 6 views, New Balance 52/80 sampled with 6
views, Puma 13/15 with 5 views on footwear and usually 1 on apparel, ASICS
23/80 sampled with 3 views.

**Check the SIZE the host returns by default, per brand.** ASICS and New
Balance are both on Scene7 and behave differently: New Balance's preset serves
2400px for a bare request, the ASICS preset serves 320x159. The ASICS URL
therefore carries `?scl=1`, scale factor 1, for the native asset. Without it the
pull attached visibly blurry photos to 21 real products before anyone noticed.

**PUMA'S CLOUDINARY ORIGINAL IS A TRANSPARENT CUT-OUT, and our own url hides
that.** `urlFor` appends `b_rgb:ffffff`, which FLATTENS it onto white so it
matches the rest of the catalogue. Right for a product listing, wrong when a
cut-out is what you want. Drop the parameter and the alpha comes through at
whatever `w_` asks for:

    https://images.puma.com/image/upload/f_auto,q_auto,w_2400/global/312060/07/sv03/fnd/PNA/fmt/png

Measured 2026-10-28 on the FAST-R Nitro Elite 3: 2400x2400 PNG, transparent,
no baked shadow, 543 KB, against 720x405 for the copy sitting on the store.

**A WHITE BACKGROUND CANNOT BE KEYED OFF A PALE SHOE, so do not try.** Removing
a studio background by colour works by flood filling from the edges, and that
is safe only while the shoe is darker or more saturated than the background.
Measured over these nine: it came out cleanly on Puma, New Balance and Merrell,
which are dark or saturated, and destroyed every pale one. Saucony's white
Endorphin Elite lost 69 percent of itself on the first attempt and 57 percent
on a tighter second. A drop shadow is opaque neutral grey and so is a white
midsole, and nothing in the pixels separates them. That needs subject
detection, not a colour rule. Always LOOK at the output; the percentage removed
is the tell, anything past about 10 percent is eating the shoe.

**Test more than one bogus code before declaring a host dishonest.** Puma was
ruled out once on the strength of a single probe, "999999/99", which returns
200 because it is a real asset in Puma's library, a stock photo of a beach.
Every other absent code answers 404 with an x-cld-error header. One probe cost
a whole brand until it was rechecked.

**Why the remaining brands are folder only**, so nobody re-treads it. Merrell
sits on the same Wolverine DAM as
Saucony, but its path carries a shoot date and season
("MRLW-J00005203-091625-F26-000") that appear nowhere in our data, and the
plain "<code>_1" form that works for Saucony 404s for Merrell, so Merrell can
only be harvested per product.

**ON is LOOKUP ONLY, not impossible.** Its asset ids are opaque uuids so
nothing derives from a SKU, but the Backstage catalog response hands the URLs
over directly and the scrape already fetches that response for the re-order
filter. Measured 2026-10-16: all 335 in-season footwear products carry assets,
2,005 gallery images, six each, the host answers an unauthenticated GET with
200 image/png at about 1 MB, and three different bogus uuids all 404 rather
than serving a placeholder. Both the ON product CSV and Stage 4 carry them now.
REMOTE_IMAGE_SOURCES gained a SUPPLIED source type for this: ON has
`supplied: true` and a `urlsFor(code)` instead of a views list and a urlFor,
and loadRemoteImages indexes those without probing, because they were handed
over by the same API that lists the product rather than guessed.

The URLs reach the tool in a SIDECAR the scraper writes beside the CSV,
`...-images.json`. The inventory CSV is 19 fixed columns with nowhere to put
a URL, and the page cannot fetch the catalog itself (it needs the Backstage
session and runs on another origin). The ON dropzone already takes several
files, so both are simply dropped together. No sidecar means no images, never
wrong ones.

Hoka was not resolved: hoka.com blocks scripted requests
and geo-redirects.

**A folder pools with the CDN, per colorway, and the folder wins.** Since
coverage is partial, a folder is still useful: `_rebuildImageIndex` keeps the
two halves separate (`_imageIndexFolder`, `_imageIndexRemote`) and a colorway
the folder covers uses the folder's gallery ENTIRELY, while one it does not
falls back to the CDN. Do not merge the two within a colorway: the same view
would arrive twice under two filenames, and a duplicate photo on a live listing
is worse than a missing one.

`tools/fetch-brooks-images.mjs` is the same logic offline, for an archive.
`tools/attach-brooks-images.mjs` repairs products that were created bare, and
`tools/reorder-brooks-media.mjs` fixes which shot leads.

### Detection subtleties worth knowing before you touch `compare()`

- Matching is by **variant SKU**, not handle: the converters cannot reproduce
  Shopify's inconsistent handles.
- **`_canonModel` decides whether the picker sees a product as already carried,
  and a half-stripped word silently breaks it.** Two live examples, both fixed:
  "Unisex's" left an "s" behind because `unisex` was the one gender word in the
  list with no possessive, so Stage 4's own titles canonicalised to
  "S SUPERBLAST 3" and matched nothing. And New Balance names one shoe two ways,
  "Fresh Foam X 1080v15" and "1080v15", which split 175 products across pairs of
  keys. The cheap audit for both: canonicalise every live title and look for a
  key beginning with a stray single letter. `test/canon-model.mjs` pins it.
- About 1 in 5 live products have **no SKU at all**, so there is a second,
  SKU-independent suppression key derived from the title,
  `MODEL|GENDER|WIDTH|COLOR` (`colorwayKeyFromTitle`). It is
  **suppress-only** and can never cause a wrongful zero.
- A live colorway with no SKUs is **never** a removal target (the no-SKU guard).
- Removal compares against `converter.allFeedSkus`, the whole file, not the
  picker selection, so unselected products are never read as removed.
- The store spells whole sizes both `"9"` and `"9.0"`, sometimes inside one
  product. `CatalogClient.normalizeSize` plus `alignInventoryToCatalog` rewrite
  each row to the store's own spelling before anything downstream reads it.

## Apparel

`apparel.html` is a separate page on purpose. Everything in the footwear spine is
footwear-shaped: `/catalog` keeps only products whose type ends in "shoes", the
known set is dropship footwear at Needham, and the grouping vocabulary is width
classes and cw-group swatch tags. None of that describes a sports bra, so apparel
starts in its own lane rather than bending rules the live tool depends on.

Consequences worth knowing:

- **Apparel IS dropshipped as of 2026-10-16** and is meant to follow the same
  rules as footwear, Needham scoped writes and zeroing included. The page does
  not do that yet: it still reads `GET /catalog/apparel` and writes nothing.
  Turning zeroing on is blocked on SKUs, see below.
- **CREATING apparel happens on the MAIN page, not here.** The ON feed carries
  footwear and apparel in one file through one dropzone, the picker splits them
  into tabs, and Stage 4 creates either. `apparel.html` is still the only place
  that reads the apparel catalog, so the two are not yet one thing.
- **THE BLOCKER IS SKUS, NOT THE FEED.** Measured 2026-10-16, the store carries
  13 ON apparel products, 61 variants, and **49 of the 61 have no SKU at all**,
  with one parsable article code between them. Footwear matches by variant SKU,
  so until those SKUs exist the 387 in-season colorways in the feed join to
  nothing and would be created as duplicates beside the 13.
- **The existing apparel stock is PHYSICAL, not dropship.** All of it sits at
  Walpole (55 variants), Falmouth (5) and Warehouse (3), and **zero at
  Needham**. Needham scoping is what keeps a dropship write off a garment a
  human counted on a shelf, so it has to hold before zeroing is enabled.
- `OnApparelConverter.STORE_BY_CODE` is a hand-baked snapshot of 15 products, now
  only a **fallback** for when the Worker has no apparel catalog yet.
  `useLiveCatalog()` supersedes it and the page says which source is in play.
- Article codes route the two pipelines: footwear is `3xx`, apparel is `1xx`, and
  the second character is the gender (`3WF...` women's shoe, `1ME...` men's tee).
- Apparel sizes are words, and the store spells one size up to four ways
  (`X-Small`, `XS`, `XSmall`). `normalizeSize` collapses them and the CSV is
  written back in the spelling that product actually uses, the same alignment
  idea as the footwear `"9"` versus `"9.0"` problem. Bra cup ranges
  (`Small A-C`) are kept as part of the key, or every cup collides into one size.

The ON scraper was footwear-only and would **invent** a 21-slot shoe size ladder
whenever it could not read an apparel size header, then match real stock to it by
column position. Files from that build look valid and are entirely wrong;
`checkFile` refuses them on sight. If you touch `scrapers/on/content.js`, run
`node scrapers/on/test/apparel.mjs`.

## Worker notes

- `GET /catalog` is a single KV read. Building the catalog is one **Bulk
  Operation** (about 2 to 3 minutes, a ~120 MB JSONL file stream-parsed in
  `bulk.js`), because paging the store plus inventory levels is 250+ throttled
  requests. A fetch handler cannot run that, so the build lives in `scheduled()`.
- **One build, two payloads, two KV keys.** `buildCatalog` returns
  `{ footwear, apparel }` from the same pass, and `rebuild` writes footwear first
  so a failed apparel write cannot disturb it. `classify()` decides which:
  footwear is `shoes$` plus `Athletic Footwear` and `Footwear`; apparel is an
  allowlist of garment types **and only supplier brands**, because half the store
  is The Run House's own printed apparel. Everything else stays out of both.
- **Watch the payload.** Measured 2026-08-05: the store is 17,469 products and
  242,909 variants; footwear is 4,090 products and **12.76 MB**, against a KV
  limit of 25 MB. Carrying the whole store would be roughly 4x and would not fit.
  That is why apparel (1,397 products, 0.77 MB) is a separate key, and why any
  future widening needs measuring first.
- Two crons: daily at 09:00 UTC always rebuilds; every 5 minutes rebuilds only if
  the Refresh button set the flag. `?fresh=1` sets that flag and returns 202.
- A failed rebuild keeps the previous catalog. Stale beats absent.
- The payload carries per product: `id`, tags, `cwGroup`, `widthTag`, `gender`,
  `custom.*` metafields, `needham`, `needhamOnHand`, `needhamVariants`,
  `totalOnHand`, plus `bySku`, `byModel` and `statusByHandle`.

## Adding a brand converter

A converter is a global object that exposes: `scanFile(file)` (or `scanFiles`)
returning picker products (`name`, `model`, `colorways[{handle,...}]`,
`rowCount`, `totalInventory`), `convert(file)` returning inventory rows,
`generateInventoryCSV()`, `generateNewProductCSV(comparison)`,
`identifyProduct(title, handle)` (delegate to `CatalogClient.modelFromTitle` so
both sides of the inheritance index key identically), and the mutable fields
`inventoryData`, `productVariantData`, `selectedProducts`, `allFeedSkus`. Then
register it in `BRAND_CONFIG` (`main.js`), `BrandPicker.register`,
`CatalogClient.BRAND_MAP` / `VENDOR_BY_BRAND`, `InventoryTracker._getConverter`
and `ENRICHMENT_BRAND_MAP`, and add the card markup plus the script tag.

**And add the vendor to `BRANDS` in `parsers.js`, which is the step that fails
silently.** That table decides the brand KEY. `buildCatalog` stamps the key on
every product, `buildKnownSets` filters `p.brand !== BRAND_MAP[toolBrand]`, and
the inheritance index is keyed `${brand}|${cwGroup}`. Miss it and `brandFor`
returns `UNKNOWN`, both lookups miss, and the brand links nothing: the picker
calls every product new and create-time inheritance never finds a sibling.
Nothing throws. Altra shipped this way with a complete, correct converter.
`worker/test/brand-registry.mjs` now fails if the two tables disagree.

`parsers.js` is a ported file, so add the row in Color Swatch first, copy it
across, and run `npm run parity`. Adding a row is tag-neutral by construction as
long as there is no `SKU_PARSERS` entry for the new key, since the key only
selects a SKU parser and otherwise falls through to `UNKNOWN` exactly as before.
Parity proves it over the live title corpus. The one real effect is `classify()`,
which starts admitting that vendor's garments to the apparel catalog.

## UI conventions

- Dark theme, defined as CSS vars near the end of the `<style>` block:
  `--surface:#161d29`, `--accent:#4c9bff`, DM Sans, and a global
  `border-radius: 0`. Modals injected by JS carry their own dark palette
  (`#111828` surface, `#34e0ff` accent). A light modal looks broken here.
- Two view modes: Simple (`body.user-mode`, the default) hides `.dev-only`,
  the explainer, instructions and the barcode upload boxes. Full shows
  everything. Stored in `localStorage.rhAppMode`.
- No Chrome extension is available for UI checks. Render with WebKit instead:
  `qlmanage -t -s 1000 -o <outdir> <file>.html`, then read the PNG.

## What is still manual, and what blocks each one

The stated goal is to automate every step of this. Recorded here so the next
person does not have to rediscover why each one is still a human. The common
blocker is authentication: every supplier portal is behind a session that only a
logged-in browser has, which is why the scrapers are Chrome extensions and why a
Worker cron cannot replace them.

| Step | Blocker | What would actually fix it |
|---|---|---|
| Capturing ASICS stock | PARTLY SOLVED, see `tools/asics-headless-run.mjs`. A dedicated Chrome profile logged in by hand drives the whole link list unattended. The session lifetime is unmeasured, so it still needs a human when it expires | An ASICS EDI or inventory feed. Already on the rep list with the Schedule A |
| Capturing ON stock | Backstage session, and the re-order filter needs the catalog response | An ON feed, same conversation |
| Capturing Brooks stock | FastTrack returns 401 without auth, and the export flag is off on the account | The `is-export-products-allowed` flag, then a feed |
| Dropping the file and pressing Write | Deliberate. The capture is automated and the guardrail judges the file, but a human still imports it. Nothing technical stops it, the confidence to stop looking does not exist yet | A few weeks of headless runs whose verdicts match what a human would have decided |
| The ON image sidecar | Same Backstage session as the stock | Same feed |
| ON apparel descriptions | The Backstage response may not carry the copy, unverified | Confirm the fields, then capture into the sidecar like the images |
| LA 2027 singlet availability | `tools/push-asics-availability.mjs` takes a JSON captured in the browser | Same ASICS feed |
| Wiring swatches after activation | `wire-apparel-swatches.mjs` is ACTIVE only, so it waits for a human to publish | `CatalogTags.processSwatchQueue` already does this for footwear; apparel could join it |

**The one automation deliberately NOT built: a `chrome.alarms` daily scrape.**
It would fire only when Chrome happens to be open and logged in, and silently do
nothing otherwise. A scheduled job that quietly skips is worse than a manual one
someone owns, because the stock looks fresh and is not. The honest versions are
a real feed, or a human with a routine.

`asics-headless-run.mjs` is not that objection in disguise, and the difference
is the only reason it exists. It owns its own browser rather than depending on
one being open, it says loudly when the session has expired instead of skipping,
and a run that failed any link refuses its own output. A scheduled job may still
be the wrong shape for this, but if it is, it will be because the session does
not last, which is a measurable question rather than a guess.

## Current state

Branch `api-integration`, in sync with origin. Stage 4 (create products) is live
for staff, guarded by create-only plus draft-only rather than by the auth gate.
Locking it down properly means `AUTH_MODE=access`, which needs a Cloudflare zone,
then `wrangler secret delete ALLOW_BEARER_WRITES`. Barcodes are wired for ASICS,
ON, Hoka (own feed), Saucony and Brooks (backfilled).
