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
    // Defaults point at production. A dev can redirect the tool at a local Worker
    // by setting localStorage rhWorkerUrl / rhCatalogToken (e.g. for Stage 4 write
    // testing on wrangler dev). Absent those keys, always production.
    WORKER_URL: (function () { try { return localStorage.getItem('rhWorkerUrl') || 'https://runhouse-inventory-worker.ryan-486.workers.dev'; } catch (e) { return 'https://runhouse-inventory-worker.ryan-486.workers.dev'; } })(),
    CATALOG_TOKEN: (function () { try { return localStorage.getItem('rhCatalogToken') || 'rh-cat-9b327c9736d5d17e2794c2c3df934b36'; } catch (e) { return 'rh-cat-9b327c9736d5d17e2794c2c3df934b36'; } })(), // public, see header

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

    // Dropship is limited to these product types. Running Shoes, Kids' Shoes, and
    // apparel are out of scope, so they are never flagged for zeroing. The typo'd
    // types ("Mens's Shoes", "Womens's Shoes") that exist in the store are matched
    // too, so a data-entry typo does not silently drop a product from scope.
    DROPSHIP_TYPE_RE: /^(men'?s|mens's|women'?s|womens's|unisex)\s+shoes$/i,

    _catalog: null,
    _fetchedAt: 0,
    TTL_MS: 5 * 60 * 1000, // in-tab cache; the Worker itself refreshes every 20 min

    // Per-brand inheritance index: "modelName|gender|widthClass" -> the record a
    // NEW colorway inherits from its live siblings (cwGroup tag, full tags, type,
    // price, category, descriptionHtml). Built in buildKnownSets, cached here by
    // forBrand so product-enrichment can look it up at CSV time.
    //
    // GENDER IS PART OF THE KEY, and it must stay that way. It is NOT redundant
    // with modelName: the key uses whatever the converter's identifyProduct
    // returns, and not every converter carries gender in that string. Hoka's, in
    // particular, strips the M/W prefix and returns a genderless model ("Clifton
    // 10"), so before gender was keyed, a Men's and a Women's Clifton 10 collided
    // on one index entry, first-seen won, and every new Women's colorway
    // inherited the MEN'S tags: wrong cw-group, wrong gender tag, wrong type.
    // Measured against the live catalog: 27 of 97 Hoka index keys collided.
    _inheritByBrand: {},

    // Normalize any width string (a catalog widthTag OR a converter width label)
    // to one class, so the catalog side and the feed side key the index the same.
    _normWidth: function(w) {
        var s = String(w || '').toLowerCase();
        if (/extra|xwide|x-wide|\bxw\b|4e/.test(s)) return 'xwide';
        if (/\bwide\b|2e/.test(s)) return 'wide';
        if (/narrow/.test(s)) return 'narrow';
        return 'standard';
    },

    // Normalize any gender string, a Shopify gender ("Women's"), a product type
    // ("Women's Shoes"), or a converter label ("W", "Womens"), to one class, so
    // the catalog side and the feed side key the index the same. Unknown or
    // absent gender collapses to '' (its own bucket, never a match for a known
    // gender), which is deliberate: better to inherit nothing than to inherit
    // across genders.
    _normGender: function(g) {
        var s = String(g || '').toLowerCase();
        if (/wom[ea]n|^w$|^w\s/.test(s)) return "Women's";
        if (/\bmen|^m$|^m\s/.test(s)) return "Men's";
        if (/uni|^u$|^u\s/.test(s)) return 'Unisex';
        return '';
    },

    // What a new colorway of (modelName, width, gender) inherits from its live
    // siblings, or null if the model is not carried in that gender + width.
    // modelName MUST be the same string the converter's identifyProduct returns
    // (that is how the index is keyed).
    //
    // Gender-STRICT on purpose. This record is what stamps the cw-group tag, and
    // a cross-gender tag misgroups the product on the storefront. Same doctrine
    // as width: inherit nothing rather than something wrong. Callers that pass no
    // gender get the old any-gender behavior, for compatibility.
    inheritFor: function(toolBrand, modelName, width, gender) {
        var idx = this._inheritByBrand[toolBrand];
        if (!idx || !modelName) return null;
        var w = this._normWidth(width);
        var g = arguments.length >= 4 ? this._normGender(gender) : null;
        if (g !== null) return idx.get(modelName + '|' + g + '|' + w) || null;
        return this._anyGender(idx, modelName, w);
    },

    // Scan the index for modelName + width in ANY gender. Only for callers that
    // did not supply a gender; never used to satisfy a gendered lookup.
    _anyGender: function(idx, modelName, wclass) {
        var prefix = modelName + '|', suffix = '|' + wclass;
        var it = idx.keys(), k;
        while (!(k = it.next()).done) {
            if (k.value.indexOf(prefix) === 0 && k.value.slice(-suffix.length) === suffix) {
                return idx.get(k.value);
            }
        }
        return null;
    },

    // Derive a stable, gendered, width-independent model name from a product
    // TITLE, e.g. "Saucony Women's Ride 15 Wide - Alloy/Quartz (S10729-15)" ->
    // "Women's Ride 15". The SAME function runs on the live Shopify title (catalog
    // side) and on the converter-built feed title, so both sides key the
    // inheritance index identically even though brands format titles differently
    // (some put the vendor before the gender, some after). Width is intentionally
    // dropped here: it is a separate axis in the index key.
    modelFromTitle: function(title, vendor) {
        if (!title) return null;
        var s = String(title).replace(/[’‘`´]/g, "'");       // normalize curly apostrophes
        s = s.replace(/\([^)]*\)/g, ' ');                    // drop (SKU), (Wide), etc.
        // Color starts at the first dash (hyphen, en-, or em-dash) that has
        // whitespace on either side (" - ", "26- ", "26 -Black"). A dash with NO
        // space on either side, like "Gel-Kayano", is an internal model dash, kept.
        var m = s.match(/^(.*?)(?:\s+[-–—]\s*|\s*[-–—]\s+)/);
        if (m) s = m[1];
        var gender = '';
        var gm = s.match(/\b(men'?s|women'?s|unisex|kids?)\b/i);
        if (gm) {
            var g = gm[1].toLowerCase();
            gender = /^wom/.test(g) ? "Women's" : /^men/.test(g) ? "Men's" : /^uni/.test(g) ? 'Unisex' : "Kids'";
            s = s.replace(gm[0], ' ');
        }
        if (vendor) s = s.replace(new RegExp('^\\s*' + vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), ' ');
        s = s.replace(/\b(extra[\s-]?wide|x[\s-]?wide|xwide|wide|narrow)\b/ig, ' ');
        // Canonicalize so the store's title variants of ONE model collapse to the
        // same key: drop trademark marks, turn a hyphen between word chars into a
        // space ("Gel-Nimbus" == "Gel Nimbus"), collapse spaces, Title Case
        // ("MAGMAX" == "MagMax" -> "Magmax"). Matching consistency matters more
        // than display nicety here; the CSV title still comes from the converter.
        s = s.replace(/[™®]/g, ' ').replace(/(\w)[-–—](\w)/g, '$1 $2').replace(/\s+/g, ' ').trim();
        if (!s) return null;
        s = s.toLowerCase().replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
        return (gender ? gender + ' ' : '') + s;
    },

    // Model-level inheritance (price/description/category are identical across
    // widths), for defaults that do not depend on width. First width found wins.
    //
    // Gender-PREFERRED, not gender-strict: description, price, and category are
    // the same for the men's and women's cut of a model, so a new Women's
    // colorway of a model the store only carries in Men's should still inherit
    // them. A cross-gender fallback is flagged `crossGender: true` so the caller
    // can refuse the fields that ARE gendered (productType, tags).
    inheritForModel: function(toolBrand, modelName, gender) {
        var idx = this._inheritByBrand[toolBrand];
        if (!idx || !modelName) return null;
        var order = ['standard', 'wide', 'xwide', 'narrow'];
        var i, r;
        var g = arguments.length >= 3 ? this._normGender(gender) : null;
        if (g !== null) {
            for (i = 0; i < order.length; i++) {
                r = idx.get(modelName + '|' + g + '|' + order[i]);
                if (r) return r;
            }
        }
        for (i = 0; i < order.length; i++) {
            r = this._anyGender(idx, modelName, order[i]);
            // A gendered lookup that fell through to another gender is marked, so
            // productType and tags are not taken from it.
            if (r) return (g === null || r.gender === g) ? r : Object.assign({}, r, { crossGender: true });
        }
        return null;
    },

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
        var inherit = new Map();                       // modelName|widthClass -> inheritance record
        var byModel = (catalog && catalog.byModel) || {};
        var products = (catalog && catalog.products) || [];

        // Dropship = footwear stocked at the Needham location. When the catalog
        // is Needham-scoped, only products flagged needham === true belong in the
        // known set, so non-dropship products (physical-store shoes elsewhere)
        // can never be flagged as removed and zeroed. When it is NOT scoped (no
        // Needham location configured yet), we cannot tell dropship from
        // non-dropship, so we fall back to all footwear and warn loudly. Do not
        // trust removed-detection in that state.
        var scoped = !!(catalog && catalog.needhamScoped);
        if (!scoped) {
            console.warn('[CatalogClient] Needham scoping is OFF: known set includes ALL ' +
                toolBrand + ' footwear, not just Needham dropship. Removed/zero detection ' +
                'is not safe to trust until NEEDHAM_LOCATION_ID is set on the Worker.');
        }

        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            if (p.brand !== catBrand) continue;
            if (!this.LIVE_STATUSES[status[p.handle]]) continue;
            if (scoped && p.needham !== true) continue; // not stocked at Needham, not dropship
            if (scoped && !this.DROPSHIP_TYPE_RE.test(p.productType || '')) continue; // Men's/Women's/Unisex Shoes only

            // Title, Needham on-hand total, and per-size variants. needhamOnHand
            // lets the tool skip zeroing anything already at 0 (a 0 to 0 change is
            // noise). variants (size -> {sku, quantity}) let generateRemovedRows
            // build a real zero row per size for a removed product.
            colorways.set(p.handle, {
                title: p.title,
                handle: p.handle,
                skus: p.skus || [],
                variants: p.needhamVariants || {},
                needhamOnHand: (p.needhamOnHand == null ? null : p.needhamOnHand),
                active: true
            });

            if (identifyFn) {
                try {
                    var mk = identifyFn(p.title, p.handle);
                    if (mk) {
                        models.add(mk);
                        // Index what a new colorway of this model+width inherits.
                        // First sibling seen wins (all colorways share these).
                        var rec = byModel[p.brand + '|' + p.cwGroup];
                        if (rec) {
                            // Gender comes from the Worker's title parse, and ONLY
                            // from there. Do NOT fall back to productType: the
                            // cw-group tag on this record is built from the same
                            // parse, so a product whose title has no gender (the
                            // store has a few, e.g. "HOKA  Skyflow - DRUZY /
                            // DROPLET") carries a GENDERLESS cw-group. Bucketing
                            // it by its product type would let it donate that
                            // genderless tag to a new Men's or Women's colorway.
                            // Unparsed gender lands in the '' bucket, which no
                            // gendered lookup matches, so it never donates.
                            var g = CatalogClient._normGender(p.gender);
                            var ikey = mk + '|' + g + '|' + CatalogClient._normWidth(p.widthTag);
                            if (!inherit.has(ikey)) inherit.set(ikey, {
                                gender: g,
                                cwGroup: rec.cwGroup,
                                tags: rec.tags || [],
                                productType: rec.productType || p.productType,
                                price: rec.price || p.price || '',
                                category: rec.category || '',
                                descriptionHtml: rec.descriptionHtml || ''
                            });
                        }
                    }
                } catch (e) { /* identify is best effort, never fatal */ }
            }
        }
        return { models: models, colorways: colorways, inherit: inherit };
    },

    // Stage 4 WRITE. POST a batch of product specs to the Worker, which creates
    // them in Shopify as DRAFTS via productSet. Resolves to the Worker's JSON
    // (with __status set to the HTTP code). In production this returns 501 until
    // the write gate is opened; locally it works against wrangler dev.
    // Base URL for WRITE routes. An explicit rhWorkerUrl override wins; otherwise
    // on localhost writes go to the local wrangler dev Worker (gate open) while
    // catalog READS stay on production, so the tool still works if it is not
    // running. In production this is just the production Worker (writes gated).
    _writeBase: function () {
        try {
            var ls = localStorage.getItem('rhWorkerUrl'); if (ls) return ls;
            if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return 'http://localhost:8790';
        } catch (e) { /* no localStorage */ }
        return this.WORKER_URL;
    },

    createProducts: function (specs) {
        return fetch(this._writeBase() + '/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.CATALOG_TOKEN },
            body: JSON.stringify({ products: specs })
        }).then(function (res) {
            return res.json().then(function (body) { body.__status = res.status; return body; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Stage 4 images: ask the Worker for signed upload targets, one per file.
    // files: [{ filename, mimeType, fileSize }]. Returns { targets, __status }.
    stagedUploads: function (files) {
        return fetch(this._writeBase() + '/staged-uploads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.CATALOG_TOKEN },
            body: JSON.stringify({ files: files })
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Upload one file's bytes to its signed target (browser -> Google staged
    // storage), then the target.resourceUrl can be used as a product image.
    uploadToTarget: function (target, file) {
        var form = new FormData();
        (target.parameters || []).forEach(function (p) { form.append(p.name, p.value); });
        form.append('file', file);
        return fetch(target.url, { method: 'POST', body: form }).then(function (res) {
            if (res.status >= 300) throw new Error('Image upload failed (HTTP ' + res.status + ')');
            return target.resourceUrl;
        });
    },

    // Fetch + build for one brand. Returns Promise<{ models, colorways, inherit }>.
    // Caches the inheritance index so product-enrichment can look it up later.
    forBrand: function(toolBrand, identifyFn) {
        var self = this;
        return this.fetchCatalog().then(function(catalog) {
            var res = self.buildKnownSets(catalog, toolBrand, identifyFn);
            self._inheritByBrand[toolBrand] = res.inherit || new Map();
            return res;
        });
    }
};

// node test hook only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) module.exports = CatalogClient;
