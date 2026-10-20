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
node scrapers/on/test/apparel.mjs             # ON scraper: apparel sizes survive a scrape
node scrapers/asics/test/api.mjs              # ASICS API: real qty not the 30 cap, gendered width
node scrapers/on/test/reorder-filter.mjs      # ON: only stock the re-order catalog says you can buy
node scrapers/on/test/sku-size.mjs            # ON SKUs: apparel sizes cannot put a space in a SKU
node scrapers/on/test/images.mjs              # ON photos: lookup only, gallery rows in the product CSV
node scrapers/on/test/csv-quoting.mjs         # ON CSV: an inch mark in a name must not break the row

# Barcodes (after dropping new supplier files into the gitignored barcodes/)
python3 tools/build-barcodes.py               # writes barcode-data.js, barcodes only

# Backfills, dry run by default, --apply to write, each writes a rollback file
node tools/backfill-brooks-barcodes.mjs
node tools/tag-recent-products.mjs            # cw-group/width/gender on a new drop
node tools/clear-bogus-specs.mjs              # specs.* written from a blank registry cell

# ON apparel, after a create batch. Dry run by default, --apply writes.
node tools/prune-thin-drafts.mjs --since 2026-10-20 --min-units 10
node tools/tag-apparel-collections.mjs --since 2026-10-20   # collection tags, add-only
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

## Current state

Branch `api-integration`, in sync with origin. Stage 4 (create products) is live
for staff, guarded by create-only plus draft-only rather than by the auth gate.
Locking it down properly means `AUTH_MODE=access`, which needs a Cloudflare zone,
then `wrangler secret delete ALLOW_BEARER_WRITES`. Barcodes are wired for ASICS,
ON, Hoka (own feed), Saucony and Brooks (backfilled).
