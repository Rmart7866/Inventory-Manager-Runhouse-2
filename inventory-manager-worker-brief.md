# Build Brief: Inventory Manager, Live Catalog + Direct Upload via Cloudflare Worker

## What this project is

The Run House has a browser-based Inventory Manager (vanilla JS, served on GitHub
Pages, Firebase-backed) that turns scraped B2B supplier files into Shopify import
CSVs. It detects new products, new colorways, and discontinued items by comparing
the feed against a saved picture of "what we already carry."

Two problems with that saved picture:
1. It comes from a Firestore snapshot plus a large hand-maintained static file
   (`existing_handles_mappings.js`). Both drift out of date, so detection misfires.
2. When it prepares a new colorway for import, the tags it writes are just
   `vendor + model`. No `cw-group:` grouping tag, no width tag, no correct product
   type, and no price inheritance. So new colorways land ungrouped and need a
   manual fix-up pass afterward.

We want to fix both, and add the ability to push inventory (and eventually new
products) to Shopify directly from the tool, instead of downloading a CSV and
importing by hand.

## The hard constraint that shapes the whole design

The tool must call the Shopify Admin API. That requires a secret credential
(`CLIENT_SECRET` / access token). **That secret can never appear in the browser
bundle.** The Inventory Manager is served on GitHub Pages, which is fully public,
so anything in its JavaScript is readable by anyone on the internet. Putting the
Admin secret there would hand full read/write access to the entire store (products,
prices, inventory, orders) to the public.

Therefore all Admin API calls (read and write) must run server-side, in a place
that holds the secret privately. We use a **Cloudflare Worker** for this. The Run
House already uses Cloudflare Workers for other Shopify integrations, so this is an
established pattern here.

### Resulting architecture

    Staff open the browser tool (GitHub Pages, no secret)
        -> browser calls the Cloudflare Worker (secret lives here, server-side)
            -> Worker calls the Shopify Admin API
            <- Shopify returns data
        <- Worker returns JSON to the browser
    Staff see results in the UI

The browser tool stays a shared, no-terminal, open-a-URL tool that any staff member
can use. The secret only ever exists inside the Worker. This is exactly how real
Shopify apps are built.

## Credential setup (do this first, outside the code)

1. Create a NEW app in the Shopify Dev Dashboard (not the old exposed one; the old
   `CLIENT_SECRET` was leaked and must be retired).
2. Scope it to least privilege: read products, write inventory, write products.
   Nothing else.
3. Get its Client ID and Client Secret.
4. Store the secret in the Worker only, via `wrangler secret put`. Never commit it,
   never put it in the browser bundle, never in the repo.
5. Uninstall / delete the old app so the leaked secret is fully dead.

Note on tokens: this Dev Dashboard app uses the client credentials grant. The Worker
exchanges Client ID + Client Secret for a short-lived (~24h) Admin API token and
caches it. There is no permanent `shpat_` token to copy from the UI. (See the
existing `shopify.js` `getToken()` in the Color Swatch folder for the exact exchange;
reuse that logic in the Worker.)

## Existing assets to reuse (from the "Run House Color Swatch" folder)

These already exist and encode the correct, battle-tested logic. The Worker should
reuse them rather than reinventing:

- `shopify.js`     Admin GraphQL client: token exchange (client credentials grant),
                   throttle handling, product pagination. The Worker's Shopify layer
                   is essentially this.
- `parsers.js`     `parseProduct({title, sku, vendor})` returns styleCode, colorCode,
                   modelKey, gender, colorName, width, and `ok`. Universal title
                   parser, per-brand SKU shapes. This is how we know a shoe's model,
                   color, and width.
- `group.js`       `widthClass(width)` maps a width code to standard/wide/xwide/narrow.
- `tag-groups.js`  `groupTagFor(parsed)` returns the exact `cw-group:` tag the live
                   storefront grid uses to collapse colorways. Reusing this guarantees
                   the tags we write match what the site groups on.
- `export-catalog.mjs`  Already-built READ-ONLY script that fetches live footwear and
                   produces the "what exists" map plus per-model inheritance data
                   (price, tags, type). This becomes the Worker's read endpoint almost
                   verbatim. See "The /catalog endpoint" below.

## The browser tool files that need wiring (in the Inventory Manager repo)

Repo: https://github.com/Rmart7866/Inventory-Manager-Runhouse-2

- `inventory-tracker.js`  `InventoryTracker.compare(inventoryData, brand)` classifies
                   feed rows into newProducts / newColorways / removedColorways by
                   checking each handle against Firestore-loaded `knownColorways`
                   (Map keyed by handle) and `knownModels` (Set). THIS is where the
                   live catalog should feed in, replacing / augmenting the Firestore
                   snapshot as the source of truth.
- `existing_handles_mappings.js`  The 87KB static SKU -> handle map. To be replaced by
                   live data pulled from the Worker.
- `product-enrichment.js`  `ProductEnrichment` builds the "new products" CSV with a
                   review modal. Its default Tags = `vendor + ', ' + modelName`. This
                   is where inherited `cw-group:` tag, width tag, product type, and
                   price should be injected for a new colorway.
- `main.js`        Orchestrates scan/convert/download per brand. Where the "upload to
                   Shopify" action would be added.
- Per-brand converters (`asics-converter.js`, `hoka-converter.js`, etc.) and pickers.
                   These produce the Shopify import rows. They expose `identifyProduct`
                   used by `compare()`.

## What to build, in stages (each stage shippable and safe on its own)

### Stage 1: The /catalog read endpoint (READ ONLY, zero risk)

Stand up the Cloudflare Worker. Add a `GET /catalog` route that runs the
`export-catalog.mjs` logic and returns JSON instead of writing files. It should
return, for live footwear:

- `bySku`:   variant SKU -> handle. Exact "do we already carry this SKU?" check.
- `byModel`: keyed by the `cw-group:` tag, holding what a new colorway inherits:
             price, productType, widthTag, sampleHandle, styleCodes[], colorwayCount.
- `products`: full rows (handle, title, vendor, brand, type, price, styleCode,
             modelKey, gender, width, cwGroup, widthTag, skus[]).

Reuse `shopify.js`, `parsers.js`, `group.js`, `tag-groups.js` inside the Worker so
the tags are identical to the pipeline. CORS: allow the GitHub Pages origin only.
Consider a light cache (the catalog does not change second to second); a query param
like `?fresh=1` can bypass it.

Then in the browser tool: fetch `GET /catalog` on load (or on a "refresh catalog"
button) and use `bySku` / `byModel` as the live source of truth in
`InventoryTracker.compare()` in place of the stale Firestore + static file.

Acceptance: opening the tool, the "new colorway vs new product vs already have it"
classification matches reality on a known feed, with no manual list maintenance.

### Stage 2: Correct tags + price inheritance on the prepared import file

In `product-enrichment.js` (and/or the converters), when a row is a NEW COLORWAY of
a model we already carry (its styleCode matches a `byModel` record via `/catalog`),
populate the import row from the sibling record:

- Tags: include the inherited `cw-group:` tag and width tag (plus the existing
  vendor/model tags), so it imports already grouped.
- Product type: inherit from the sibling (e.g. "Men's Shoes").
- Price: inherit the sibling model's live price. Colorways share MSRP, so this is
  correct by default; fall back to the feed price, then the brand default, only if
  there is no sibling.

Acceptance: a prepared new-colorway import row carries the right `cw-group:` tag,
width tag, type, and price with no manual entry, and once imported it collapses into
the model's swatch card on the collection grid with no fix-up run.

### Stage 3: Direct inventory upload (WRITE, reversible, gated)

Add a `POST /inventory` route to the Worker that sets on-hand quantities at the
sellable location (Shopify `inventorySetOnHandQuantities` or `inventoryAdjustQuantities`).
Includes "zero out what is no longer in the feed."

Every write is gated behind a dry-run/diff the user approves in the UI before it
fires. Show exactly what will change (SKU, from -> to) and require a confirm click.
Inventory is reversible and does not touch product content, so this is the safe first
write to build.

Acceptance: user reviews a diff, confirms, quantities update live, and the diff
matches what actually changed.

### Stage 4 (later): Direct product / colorway creation (WRITE, higher risk)

Add a `POST /products` route using `productSet` (create-or-update by handle/SKU) to
push new colorways and new models. Same dry-run/confirm gate. Auto-apply the Stage 2
inherited tags on creation. Build this last, once the diff-and-confirm flow is trusted.

## Non-negotiables / guardrails

- Secret is server-side only (Worker env via `wrangler secret put`). Never in the
  browser bundle, never committed.
- New least-privilege app; old leaked app retired.
- CORS locked to the GitHub Pages origin.
- Every WRITE (inventory, products) requires a dry-run diff the user approves before
  it executes. A bad feed must never be able to silently overwrite live stock, prices,
  or product content.
- Tag logic comes from the existing `tag-groups.js` / `group.js` / `parsers.js` so the
  storefront grid and the tool never disagree.
- House style in any generated code/comments: no em dashes; sharp 0px corners, Inter
  font, navy/accent palette if any UI is added (`--trh-navy #1b3566`,
  `--trh-accent #1f6fe0`).

## Suggested repo shape

    /worker
      wrangler.toml
      src/index.js          router: /catalog (GET), /inventory (POST), /products (POST)
      src/shopify.js        adapted from Color Swatch shopify.js (token exchange, graphql, throttle)
      src/parsers.js        copied from Color Swatch
      src/group.js          copied from Color Swatch
      src/tag-groups.js     copied from Color Swatch (groupTagFor)
      src/catalog.js        export-catalog logic, returns JSON
    (existing Inventory Manager repo)
      inventory-tracker.js  compare() now seeded from /catalog
      product-enrichment.js new-colorway rows inherit cw-group/width/type/price
      main.js               adds "refresh catalog" and "upload inventory" actions

## First move for Claude Code

Start with Stage 1 only: create the Worker, port `shopify.js` + `parsers.js` +
`group.js` + `tag-groups.js` + the `export-catalog` logic into it, expose
`GET /catalog` returning the JSON described above, lock CORS to the Pages origin, and
wire the browser tool to fetch it and drive `InventoryTracker.compare()` from live
data. Prove the read round-trip end to end before touching any write path.
