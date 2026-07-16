# Inventory Manager Worker

Holds the Shopify Admin credential server-side so the browser tool never has to.
See `../inventory-manager-worker-brief.md` for the why.

**Stage 1 is read only.** There is no write route, and `src/shopify.js` has no
write method, so this Worker cannot modify the store. Writes arrive in Stage 3
behind a dry-run diff.

## Routes

| Route | Purpose |
|---|---|
| `GET /catalog` | The live footwear catalog. Served from KV, about 20ms. |
| `GET /catalog/status` | Freshness and counts only. Does not pull the 4.9 MB body. |

Query params on `/catalog`:

- `?active=1` only `status:active` products. Default is every status.
- `?fresh=1` rebuild inline and wait. **Slow, about 150 seconds.** For "I just
  changed Shopify and need to see it now", not for page load.
- `?limit=N` development only. Bypasses KV, never stores a truncated catalog.

## Shape of `/catalog`

```jsonc
{
  "generatedAt": "2026-07-15T18:42:08.200Z",
  "shop": "therunhouse.myshopify.com",
  "scope": "all",
  "counts": {
    "products": 3567,          // parseable footwear
    "skus": 39160,
    "models": 721,
    "unparsed": 26,            // in bySku, absent from byModel
    "byStatus": { "ACTIVE": 2613, "DRAFT": 681, "ARCHIVED": 299 }
  },
  "products": [ /* handle, title, vendor, brand, productType, status, price,
                   styleCode, colorCode, modelKey, gender, width, cwGroup,
                   widthTag, skus[] */ ],
  "bySku": { "1119393-BWHT-08D": "hoka-mens-clifton-8-black-white-1119393-bwht" },
  "byModel": { "HOKA|cw-group:mens-clifton-8--standard": { /* inheritance */ } },
  "statusByHandle": { "hoka-arahi-6-1123195-pabf": "ARCHIVED" }
}
```

### Read `bySku` and `statusByHandle` together

`bySku` maps **every** SKU to its handle, including archived and draft products.
It answers "does a product with this handle already exist", which is what stops
an import colliding with a retired product's handle.

It does **not** answer "do we currently carry this". 875 SKUs sit on ARCHIVED
products right now. Consult `statusByHandle` for that:

```js
const handle = catalog.bySku[sku];
const exists  = !!handle;                                  // handle is taken
const carried = exists && catalog.statusByHandle[handle] !== 'ARCHIVED';
```

## Why cron and KV, not an inline fetch

The brief describes `/catalog` running the export logic per request. Measured
against the live store, that is not viable:

- The footwear gate is a `productType` test that can only be applied after
  fetching, so a build pages the **whole** 10,000+ product store to keep 3,567
  shoes. About 170 Shopify requests, **149 seconds**.
- A free Worker allows 10ms CPU and 50 subrequests. This needs ~170 subrequests,
  so **Workers Paid is required** either way.
- 149 seconds is not something you put in front of a page load.

So a cron trigger builds the catalog every 20 minutes and writes it to KV, and
`GET /catalog` is a single KV read. Worst-case staleness is one interval;
`/catalog/status` reports `ageSeconds` so staleness is visible, not silent.

If a cron build fails, the previous catalog stays in place. Stale beats absent.

## Auth

Every request must carry a valid Cloudflare Access JWT. The Worker verifies the
signature, audience, issuer, and expiry itself rather than trusting that Access
is in front of it, because `*.workers.dev` and any other bound route are **not**
behind Access. `workers_dev = false` in `wrangler.toml` is the second lock.

The Worker **fails closed**: if `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is unset,
every request 401s. A missing binding must never mean "no auth required".

CORS is a browser rule, not authentication. It is configured, but it is not what
guards this Worker.

## Local development

`worker/.dev.vars` holds the dev credentials and is gitignored. It sets
`DEV_BYPASS_AUTH=true`, which skips Access verification. **Never set that as a
deployed secret.**

```sh
npm install
npm run dev                                  # http://localhost:8787
curl 'http://localhost:8787/catalog?limit=3' # fast smoke test
npm run parity                               # tag logic vs the Color Swatch originals
```

### `npm run parity` is not optional

`src/parsers.js` and `src/group.js` are byte-for-byte copies of the Color Swatch
files, and `src/tag-groups.js` is a subset port. Copies drift, and the brief's
non-negotiable is that the tag the tool writes is the tag the storefront groups
on. `npm run parity` re-checks that:

- structural diff for `parsers.js` and `group.js`, and
- `groupTagFor` over every real title in `catalog-models.csv`.

Run it after touching anything in `src/` that came from Color Swatch. **If the
tag rule needs to change, change the Color Swatch file and re-copy**, do not
patch the port.

It only runs where the Color Swatch folder exists. Point it elsewhere with
`COLOR_SWATCH_DIR=/path npm run parity`.

## First deploy

Steps 1 to 4 need the Cloudflare and Shopify dashboards.

**1. New Shopify app.** Per the brief, the old app's `CLIENT_SECRET` leaked and
must be retired. Create a new Dev Dashboard app scoped to `read_products`,
`write_inventory`, `write_products` and nothing else. Stage 1 only reads, but the
later stages need the writes and rotating twice is worse.

**2. KV namespace.** Paste both ids into `wrangler.toml`.

```sh
npx wrangler kv namespace create CATALOG
npx wrangler kv namespace create CATALOG --preview
```

**3. Access application.** Protect the hostname that will serve the tool, then
copy the team domain and the Application Audience (AUD) tag from its Overview
into the `[vars]` block in `wrangler.toml`.

**4. Secrets.** These never go in `wrangler.toml`.

```sh
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET
```

**5. Route.** Uncomment `[[routes]]` in `wrangler.toml` and point it at the
hostname the tool is served from, so the Worker is same-origin with the tool and
the `CF_Authorization` cookie is sent automatically. Requires the zone on
Cloudflare.

**6. Deploy and prime.** The first cron fills KV within 20 minutes; `?fresh=1`
does it immediately.

```sh
npx wrangler deploy
npx wrangler tail                     # watch the cron
curl -H "Cf-Access-Jwt-Assertion: <token>" 'https://<host>/catalog/status'
```

## Known gaps

- **The old leaked app is still live** until step 1 is done and it is uninstalled.
  `worker/.dev.vars` currently holds its credentials for local testing.
- **86 products have `brand: "UNKNOWN"`**, meaning their Shopify `vendor` is not
  in the `BRANDS` map in `parsers.js`. They are in `bySku`, so existence checks
  work, but they get no per-brand SKU parsing.
- **26 products do not parse** (`counts.unparsed`) and are absent from `byModel`,
  so they inherit nothing. Same behaviour as `export-catalog.mjs`.
- **Product types are typo'd in Shopify**: 17 `"Womens's Shoes"` and 10
  `"Mens's Shoes"`. The `/shoes$/i` gate catches them, which is why it is still a
  regex and not a server-side `product_type` filter list.
