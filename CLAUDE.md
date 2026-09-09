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
| `*-converter.js` | One per brand: saucony, hoka, brooks, asics, puma, on, newbalance. Parse the supplier file, emit inventory rows and a new-product CSV |
| `catalog-client.js` | Reads `GET /catalog` from the Worker, builds the known sets, and is the client for every write route |
| `inventory-tracker.js` | `compare()`: new products, new colorways, removed colorways. Also the shared Firestore `Ignore` list |
| `brand-picker.js` | The product checklist per brand and the tracker report (including "Clear all in Shopify") |
| `product-enrichment.js` | The review modal for new products (price, tags, description, SEO) and Stage 4 "Create in Shopify" with image upload |
| `catalog-tags.js` | Bulk width / cw-group / gender tagging and the swatch sibling metafields, plus the post-create swatch queue |
| `product-library.js` | Full screen browser of every carried product, with single and model-wide editing |
| `catalog-ui.js` | Freshness bar, refresh button, fallback and building banners |
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
cd worker && npm test                         # auth + needham + known-set + parity
cd worker && npm run parity                   # tag logic vs the Color Swatch originals

# Frontend
python3 -m http.server 8000                   # serve the tool from the repo root
node test/on-apparel.mjs                      # apparel converter: sizes, joins, guards
node test/newbalance-images.mjs               # NB photo join: colorway key, gallery order
node test/newbalance-create.mjs               # NB new-product CSV feeds Stage 4
node test/auto-tag-queue.mjs                  # post-create auto tagging stays add-only
node test/merrell.mjs                         # merrell converter: picker, CSV
node scrapers/on/test/apparel.mjs             # ON scraper: apparel sizes survive a scrape

# Barcodes (after dropping new supplier files into the gitignored barcodes/)
python3 tools/build-barcodes.py               # writes barcode-data.js, barcodes only

# Backfills, dry run by default, --apply to write, each writes a rollback file
node tools/backfill-brooks-barcodes.mjs
node tools/tag-recent-products.mjs            # cw-group/width/gender on a new drop
node tools/clear-bogus-specs.mjs              # specs.* written from a blank registry cell

# New Balance photos: Widen TIFs to a Stage 4 gallery folder (macOS sips)
node tools/convert-nb-images.mjs
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

### Detection subtleties worth knowing before you touch `compare()`

- Matching is by **variant SKU**, not handle: the converters cannot reproduce
  Shopify's inconsistent handles.
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

- The page **never zeroes anything**. Apparel is not dropshipped yet (the goal is
  that it will be), so a garment missing from a scrape means nothing. Only what
  is in the file gets a row.
- The page reads `GET /catalog/apparel` and writes nothing.
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
