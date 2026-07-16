// ========== CATALOG CLIENT ==========
// Live "what's on Shopify" for the Inventory Manager, read from the Cloudflare
// Worker's GET /catalog instead of the hand-maintained Firestore mirror.
//
// WHY THIS EXISTS. Firestore only knows what someone clicked "Confirm on
// Shopify" on, so it drifts: products live on Shopify but never confirmed are
// invisible to it, which is exactly why a product that vanishes from a scraper
// feed never gets zeroed. This reads the real catalog, so "new" and "removed"
// are computed against Shopify's actual state.
//
// SCOPE OF THE SWAP. This feeds the HANDLE-level source of truth used by
// InventoryTracker.compare: knownColorways (a Map keyed by handle). That is what
// drives new-detection (feed handle not on Shopify) and removed-detection
// (Shopify handle not in feed). It does NOT try to improve the new-PRODUCT vs
// new-COLORWAY sub-labeling, which depends on each converter's identifyProduct
// and is unreliable on Shopify titles (verified: Hoka and Brooks both return the
// full colorway title, not a model key). That labeling is left exactly as it was.
//
// THE TOKEN BELOW IS PUBLIC BY CONSTRUCTION. This file ships in a public
// GitHub Pages bundle, so the token is readable by anyone. It only stops the
// Worker URL being scraped by accident, no more. It guards a read-only endpoint
// whose worst case is disclosure of our own catalog. It must NEVER guard a write
// route. Rotate it freely with `wrangler secret put CATALOG_TOKEN`.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var CatalogClient = {
    WORKER_URL: 'https://runhouse-inventory-worker.ryan-486.workers.dev',
    CATALOG_TOKEN: 'rh-cat-9b327c9736d5d17e2794c2c3df934b36', // public, see header

    // Tool brand key -> the brand key /catalog reports (from parsers.js brandFor).
    BRAND_MAP: {
        hoka: 'HOKA', on: 'ON', asics: 'ASICS', brooks: 'BROOKS',
        puma: 'PUMA', saucony: 'SAUCONY', newbalance: 'NEW_BALANCE'
    },

    // Only these statuses count as "we carry it". ARCHIVED is retired, so it must
    // not read as carried (else a feed row matching an archived handle looks like
    // an existing product) and must not be a zeroing target. DRAFT is in-progress
    // and not yet sellable, so it is excluded from the live set too. Both still
    // occupy handles, which the raw catalog can answer separately if needed.
    LIVE_STATUSES: { ACTIVE: true },

    _catalog: null,
    _fetchedAt: 0,
    TTL_MS: 5 * 60 * 1000, // in-tab cache; the Worker itself refreshes every 20 min

    // Fetch and cache the whole catalog once per tab session (or per TTL).
    fetchCatalog: function(force) {
        var self = this;
        if (!force && this._catalog && (Date.now() - this._fetchedAt) < this.TTL_MS) {
            return Promise.resolve(this._catalog);
        }
        return fetch(this.WORKER_URL + '/catalog', {
            headers: { 'Authorization': 'Bearer ' + this.CATALOG_TOKEN }
        }).then(function(res) {
            if (res.status === 503) {
                // Catalog is mid-build. Surface a clear, retryable error.
                throw new Error('Catalog is still building on the server, retry in a moment');
            }
            if (!res.ok) throw new Error('Catalog fetch failed: HTTP ' + res.status);
            return res.json();
        }).then(function(catalog) {
            self._catalog = catalog;
            self._fetchedAt = Date.now();
            return catalog;
        });
    },

    // PURE. Build the { models, colorways } shape InventoryTracker expects, from a
    // catalog payload, for one tool brand. Kept pure (no fetch, no globals) so it
    // is unit-testable in node. identifyFn is optional and only feeds knownModels,
    // whose quality is unchanged from the Firestore path, see the header.
    buildKnownSets: function(catalog, toolBrand, identifyFn) {
        var catBrand = this.BRAND_MAP[toolBrand];
        var status = (catalog && catalog.statusByHandle) || {};
        var colorways = new Map();
        var models = new Set();
        var products = (catalog && catalog.products) || [];

        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            if (p.brand !== catBrand) continue;
            if (!this.LIVE_STATUSES[status[p.handle]]) continue;

            // Store the same shape Firestore stored: title + variants. We do not
            // have per-size variant data in /catalog (it carries SKUs, not sizes),
            // so variants is left empty here. Handle presence is what compare()
            // needs for new/removed detection; the empty variants only limits the
            // CSV zero-row builder, which the API zero path does not use.
            colorways.set(p.handle, {
                title: p.title,
                handle: p.handle,
                skus: p.skus || [],
                variants: {},
                active: true
            });

            if (identifyFn) {
                try {
                    var mk = identifyFn(p.title, p.handle);
                    if (mk) models.add(mk);
                } catch (e) { /* identify is best effort, never fatal */ }
            }
        }
        return { models: models, colorways: colorways };
    },

    // Fetch + build for one brand. Returns Promise<{ models, colorways }>.
    forBrand: function(toolBrand, identifyFn) {
        var self = this;
        return this.fetchCatalog().then(function(catalog) {
            return self.buildKnownSets(catalog, toolBrand, identifyFn);
        });
    }
};

// node test hook only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) module.exports = CatalogClient;
