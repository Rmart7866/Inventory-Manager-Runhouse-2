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

    // Tool brand key -> the vendor token as it appears in product TITLES, so
    // colorwayKeyFromTitle strips the vendor identically on the catalog side
    // (Shopify titles) and the feed side (converter-built titles). modelFromTitle
    // strips the vendor only at the START of the model portion, so a vendor word
    // that also reads like English ("On") cannot corrupt a color name.
    VENDOR_BY_BRAND: {
        hoka: 'HOKA', on: 'On', asics: 'Asics', brooks: 'Brooks',
        puma: 'Puma', saucony: 'Saucony', newbalance: 'New Balance'
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

    // A colorway identity key: "MODEL|GENDER|WIDTHCLASS|COLOR", derived from a
    // product TITLE alone. This is the SKU-independent join used to suppress
    // new-detection, because ~1 in 5 live products carry NO variant SKU on
    // Shopify (hand-created or Shopify-duplicated, which blanks the copy's SKUs),
    // so an exact-SKU check can never see them and their real feed colorway
    // reappears as "new" every scan. The title survives where the SKU does not.
    //
    // SYMMETRY IS THE WHOLE POINT. The SAME function runs on the live Shopify
    // title (catalog side, buildKnownSets) and on the converter-built feed title
    // (compare side), and the Saucony/Hoka/etc converters format titles the same
    // way the store does ("Women's Saucony Ride 19 - Black Silver Wide"), so both
    // sides produce the identical key. Pass the brand's VENDOR_BY_BRAND token so
    // the vendor is stripped identically on both sides.
    //
    // PRECISION OVER RECALL, on purpose. The key pins model + gender + width +
    // exact color, so a match means we genuinely already carry that exact
    // colorway (suppressing it is correct). A color-spelling drift causes a MISS,
    // which just falls back to the SKU check, never a false suppression of a
    // truly new colorway. Returns null when there is no color portion (nothing to
    // key on), so callers must treat null as "no opinion", not "matches".
    colorwayKeyFromTitle: function(title, vendor) {
        if (!title) return null;
        var full = this.modelFromTitle(title, vendor); // "Women's Ride 19"
        if (!full) return null;
        var gm = full.match(/^(Men's|Women's|Unisex|Kids')\s+/);
        var gender = gm ? gm[1] : '';
        var modelBare = this._normModel(full);         // "RIDE 19"
        var widthClass = this._normWidth(title);       // standard | wide | xwide | narrow
        // Color = everything after the first spaced dash, with width words and
        // punctuation stripped. "Black Silver Wide" and "Black/Silver (Wide)"
        // both collapse to "BLACK SILVER".
        var s = String(title).replace(/[’‘`´]/g, "'").replace(/\([^)]*\)/g, ' ');
        var m = s.match(/(?:\s+[-–—]\s*|\s*[-–—]\s+)(.+)$/);
        var color = m ? m[1] : '';
        color = color.replace(/[™®]/g, ' ')
            .replace(/\b(extra[\s-]?wide|x[\s-]?wide|xwide|wide|narrow|regular|standard|medium)\b/ig, ' ')
            .replace(/[^a-z0-9]+/ig, ' ').trim().toUpperCase();
        if (!modelBare || !color) return null;
        return modelBare + '|' + gender + '|' + widthClass + '|' + color;
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
        var shopifyModels = new Set();                 // reliable: normalized genderless model names carried on Shopify
        var existingSkus = new Set();                  // every SKU on Shopify (ACTIVE or DRAFT), for new-suppression
        var existingCwKeys = new Set();                // title-derived colorway keys (ACTIVE or DRAFT), suppresses SKU-less products
        var existingHandles = new Set();               // every handle on Shopify (ACTIVE or DRAFT), the picker's primary signal
        var vendorTok = this.VENDOR_BY_BRAND[toolBrand] || '';
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
            var st = status[p.handle];

            // Model-presence for the picker auto-check, recorded before BOTH the
            // active-only and the Needham filters. "Is this model new" is about
            // whether it exists on Shopify at all, so it counts ACTIVE and DRAFT
            // (a draft was already created by the tool; recreating it is a no-op,
            // so it is not new) but not ARCHIVED (retired, could be re-added).
            // The Needham and active filters below are safety filters for the
            // removed/zero known set, where writing to the wrong product is the
            // harm; they must not narrow what counts as already carried.
            if (st === 'ACTIVE' || st === 'DRAFT') {
                var nmAll = this._normModel(p.modelKey);
                if (nmAll) shopifyModels.add(nmAll);
                // The canonical key too, which is what a converter's model label
                // can actually match (see _canonModel). Both are recorded so the
                // old key keeps working for the brands it already worked for.
                var cnAll = this._canonModel(p.modelKey, toolBrand);
                if (cnAll) shopifyModels.add(cnAll);
                // Handles are the picker's primary signal, see isCarriedByHandles.
                if (p.handle) existingHandles.add(String(p.handle).toLowerCase());
                // Every SKU already on the store, so new-detection does not keep
                // re-offering a product that was created last time (drafts land
                // via Stage 4 and would otherwise reappear as new each scan, then
                // be skipped as "already exists" on create). All statuses but
                // ARCHIVED, all locations, because existence is the question here.
                (p.skus || []).forEach(function (sk) { if (sk) existingSkus.add(String(sk).toUpperCase()); });
                // SKU-independent suppression key. Critical for the ~21% of live
                // products that have NO SKU (hand-created / Shopify-duplicated):
                // they add nothing to existingSkus, so without this their real
                // feed colorway reappears as new forever. Keyed off the title,
                // which those products still have and which matches the feed.
                var ck = this.colorwayKeyFromTitle(p.title, vendorTok);
                if (ck) existingCwKeys.add(ck);
            }

            if (!this.LIVE_STATUSES[st]) continue;
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
        return { models: models, colorways: colorways, inherit: inherit, shopifyModels: shopifyModels, existingSkus: existingSkus, existingCwKeys: existingCwKeys, existingHandles: existingHandles };
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

    // The write secret for the destructive inventory route. NOT the catalog
    // token, and deliberately NOT hardcoded here: it is typed once and kept in
    // localStorage, so it never ships in this public bundle. Empty until set.
    writeSecret: function () {
        try { return localStorage.getItem('rhWriteSecret') || ''; } catch (e) { return ''; }
    },
    setWriteSecret: function (s) {
        try { localStorage.setItem('rhWriteSecret', String(s || '').trim()); } catch (e) { /* no localStorage */ }
    },
    hasWriteSecret: function () { return !!this.writeSecret(); },

    // Stage 3 WRITE. Zero Needham on-hand for a list of SKUs. dryRun:true (the
    // default) resolves and reports what WOULD change without writing, which is
    // what the button shows before you confirm. Sends the write secret in its
    // own header; without it the Worker returns 403.
    zeroInventory: function (skus, dryRun) {
        return fetch(this._writeBase() + '/inventory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.CATALOG_TOKEN,
                'X-Write-Secret': this.writeSecret()
            },
            body: JSON.stringify({ skus: skus || [], dryRun: dryRun !== false })
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Stage 3 FULL SYNC. Set Needham on-hand to an explicit quantity per SKU,
    // for every loaded variant, zeroes included. items: [{sku, quantity}].
    // dryRun:true (default) reports what would change without writing. Same
    // write-secret guard as zeroInventory.
    setInventory: function (items, dryRun) {
        return fetch(this._writeBase() + '/inventory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.CATALOG_TOKEN,
                'X-Write-Secret': this.writeSecret()
            },
            body: JSON.stringify({ items: items || [], dryRun: dryRun !== false })
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Catalog tagging WRITE. POST a chunk of tag/type changes (computed in the
    // browser from the cached catalog) to the Worker, which applies them behind
    // the write secret. changes: [{id, add, remove, productType}].
    applyTags: function (changes) {
        return fetch(this._writeBase() + '/tags/apply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.CATALOG_TOKEN,
                'X-Write-Secret': this.writeSecret()
            },
            body: JSON.stringify({ changes: changes || [] })
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Swatch sibling metafields WRITE. POST a chunk of metafieldsSet inputs
    // (computed in the browser) to the Worker, which applies them behind the
    // write secret. inputs: [{ownerId, namespace, key, type, value}].
    applyMetafields: function (inputs) {
        return fetch(this._writeBase() + '/tags/metafields/apply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.CATALOG_TOKEN,
                'X-Write-Secret': this.writeSecret()
            },
            body: JSON.stringify({ inputs: inputs || [] })
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Product Library READ. Full detail the cached catalog does not carry
    // (description, image, per-variant prices), fetched on demand when a colorway
    // is opened. Gated by the catalog bearer only, no write secret.
    fetchProductDetail: function (id) {
        return fetch(this._writeBase() + '/product?id=' + encodeURIComponent(id), {
            headers: { 'Authorization': 'Bearer ' + this.CATALOG_TOKEN }
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Product Library WRITE. Update one existing product's description (and
    // optionally its type). Behind the write secret, same gate as tags/inventory.
    updateProductDescription: function (id, descriptionHtml, productType) {
        var payload = { id: id };
        if (descriptionHtml != null) payload.descriptionHtml = descriptionHtml;
        if (productType != null) payload.productType = productType;
        return fetch(this._writeBase() + '/product/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.CATALOG_TOKEN,
                'X-Write-Secret': this.writeSecret()
            },
            body: JSON.stringify(payload)
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Product Library WRITE. Set variant prices for one product. variants:
    // [{id, price}]. Behind the write secret.
    updateProductPrices: function (productId, variants) {
        return fetch(this._writeBase() + '/product/prices', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.CATALOG_TOKEN,
                'X-Write-Secret': this.writeSecret()
            },
            body: JSON.stringify({ productId: productId, variants: variants || [] })
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
    },

    // Product Library WRITE. Append one image to an existing product. The bytes
    // are staged first via stagedUploads + uploadToTarget (same as create), then
    // resourceUrl is passed here as originalSource. Behind the write secret.
    addProductMedia: function (id, originalSource, alt) {
        return fetch(this._writeBase() + '/product/media', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.CATALOG_TOKEN,
                'X-Write-Secret': this.writeSecret()
            },
            body: JSON.stringify({ id: id, originalSource: originalSource, alt: alt || '' })
        }).then(function (res) {
            return res.json().then(function (b) { b.__status = res.status; return b; })
                .catch(function () { return { __status: res.status, error: 'Non-JSON response' }; });
        });
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
            self._shopifyModelsByBrand[toolBrand] = res.shopifyModels || new Set();
            self._existingSkusByBrand[toolBrand] = res.existingSkus || new Set();
            self._existingCwKeysByBrand[toolBrand] = res.existingCwKeys || new Set();
            self._existingHandlesByBrand[toolBrand] = res.existingHandles || new Set();
            return res;
        });
    },

    // Reliable model-presence set per brand, built from the Worker's modelKey in
    // buildKnownSets. Used by the picker to auto-check what is already carried.
    _shopifyModelsByBrand: {},

    // Every SKU on Shopify (ACTIVE or DRAFT) per brand, for new-suppression. A
    // superset of the ACTIVE+Needham known set, so new-detection stops offering
    // products that were already created (as drafts) last time.
    _existingSkusByBrand: {},
    existingSkus: function (toolBrand) { return this._existingSkusByBrand[toolBrand] || null; },

    // Title-derived colorway keys on Shopify (ACTIVE or DRAFT) per brand. The
    // SKU-independent half of new-suppression, so a product with no SKU on
    // Shopify (about 1 in 5) is still recognized as already carried. See
    // colorwayKeyFromTitle and compare() in inventory-tracker.js.
    _existingCwKeysByBrand: {},
    existingColorwayKeys: function (toolBrand) { return this._existingCwKeysByBrand[toolBrand] || null; },

    // Optimistically register products just created (as drafts) so THIS session
    // immediately treats them as already on Shopify: their SKUs drop out of
    // new-detection and their model checks on in the picker, without waiting for
    // the Worker catalog to rebuild. The next catalog refresh makes it permanent
    // (drafts are counted, see buildKnownSets).
    markCreated: function (toolBrand, specs) {
        var sset = this._existingSkusByBrand[toolBrand] || (this._existingSkusByBrand[toolBrand] = new Set());
        var mset = this._shopifyModelsByBrand[toolBrand] || (this._shopifyModelsByBrand[toolBrand] = new Set());
        var cset = this._existingCwKeysByBrand[toolBrand] || (this._existingCwKeysByBrand[toolBrand] = new Set());
        var hset = this._existingHandlesByBrand[toolBrand] || (this._existingHandlesByBrand[toolBrand] = new Set());
        var vendor = this.VENDOR_BY_BRAND[toolBrand] || '';
        var self = this;
        (specs || []).forEach(function (s) {
            (s.variants || []).forEach(function (v) { if (v && v.sku) sset.add(String(v.sku).toUpperCase()); });
            if (s.handle) hset.add(String(s.handle).toLowerCase());
            var m = self.modelFromTitle && s.title ? self.modelFromTitle(s.title, vendor) : null;
            var nm = m ? self._normModel(m) : null;
            if (nm) mset.add(nm);
            var cn = s.title ? self._canonModel(m || s.title, toolBrand) : null;
            if (cn) mset.add(cn);
            // Register the colorway key too, so a just-created product suppresses
            // even if it was created without SKUs.
            var ck = self.colorwayKeyFromTitle(s.title, vendor);
            if (ck) cset.add(ck);
        });
    },

    // Normalize any model name to a case, gender and punctuation insensitive key,
    // so a feed model ("Clifton 11") and the catalog's gendered modelKey
    // ("Men's CLIFTON 11") collapse to the same thing.
    _normModel: function(s) {
        return String(s || '').toUpperCase()
            .replace(/^(MEN'?S|WOMEN'?S|UNISEX|KIDS?'?S?)\s+/, '')  // drop a leading gender
            .replace(/[^A-Z0-9]+/g, ' ')
            .trim();
    },

    // Canonical model key, brand aware. This is the SAME function on both sides
    // of the picker's "already on Shopify" check, which is the whole point:
    // the catalog side feeds it the Worker's modelKey and the feed side feeds it
    // whatever label the brand's converter built, and both must land on one
    // string.
    //
    // WHY _normModel WAS NOT ENOUGH. It only uppercases and strips a LEADING
    // gender word, and the converter labels break every one of those
    // assumptions. Measured against the live catalog, the picker auto-checked
    // 6 of 167 ASICS rows and 2 of 178 Brooks rows, so almost the whole feed
    // read as new. Four separate leaks, all handled below:
    //
    //   vendor    "ASICS MENS GEL-KAYANO 29"  The store's titles put the vendor
    //             FIRST, so the leading-gender strip never fires and the vendor
    //             word survives into the key. Catalog side: "Gel-Kayano 29".
    //   gender    same, "MENS" is not leading, so it stayed.
    //   color     "GEL-KAYANO 29- SHEET ROCK/AMBER (1011B440-020)". Converters
    //             cut color at " - " (spaces both sides), but most titles are
    //             "29- Color" with no space before the dash, so the colorway and
    //             the style code became part of the "model".
    //   width     "GHOST 15 WIDE", "Cloud 6 Wide". Width is a separate axis on
    //             the catalog side, so it must come off here. This also repairs
    //             the catalog side's own leftover, "GT-2000 11 Extra", where the
    //             Worker's parse dropped WIDE and left EXTRA behind.
    //
    // Deliberately blunt: it is only ever compared against another output of
    // itself, so over-normalizing costs nothing as long as it is symmetric.
    _canonModel: function (name, toolBrand) {
        var s = String(name || '').replace(/[’‘`´]/g, "'");
        s = s.replace(/\([^)]*\)/g, ' ');                 // (1011B440-020), (Wide), (2E)
        // Cut the color off at the first dash that has whitespace on EITHER side,
        // so "29- Sheet Rock" and "9 -WHITE" both cut, while an internal model
        // dash with no space at all ("Gel-Kayano", "GT-2000") is kept.
        var m = s.match(/^(.*?)(?:\s+[-–—]|[-–—]\s+)/);
        // The store also has titles with NO space at all around the color dash,
        // "Gel Resolution 9-White/Blue" and "Gel Kayano 32 Wide-Black/White". A
        // bare dash cannot be cut blindly ("Gel-Kayano" is the same shape), so
        // cut only when what precedes it is a digit or a width word, which is
        // never the tail of a model name but is always the tail of the model
        // portion of a title.
        if (!m || !m[1].trim()) m = s.match(/^(.*?(?:\d|\bwide|\bnarrow))[-–—](?=\S)/i);
        if (m && m[1].trim()) s = m[1];
        // Gender anywhere, not just leading: the vendor usually comes first.
        s = s.replace(/\b(men'?s|women'?s|mens|womens|unisex|kids?'?s?|youth|boys?'?|girls?'?)\b/ig, ' ');
        var vendor = this.VENDOR_BY_BRAND[toolBrand] || '';
        if (vendor) {
            // Leading only. A vendor token that reads like English ("On") must
            // not be stripped out of the middle of a color or model name.
            s = s.replace(new RegExp('^\\s*' + vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), ' ');
        }
        s = s.replace(/\b(extra[\s-]?wide|x[\s-]?wide|xwide|wide|narrow|2e|4e)\b/ig, ' ');
        s = s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        // "EXTRA" left dangling at the end is a width remnant, never a model word.
        return s.replace(/\s+EXTRA$/, '').trim();
    },

    // Is this model already carried on Shopify? name is the picker's model label.
    // Returns null when the set has not been built for the brand (caller should
    // then fall back to its old signal), true/false otherwise.
    //
    // Both keys are checked because buildKnownSets records both: the canonical
    // key (what actually matches) and the old _normModel key (so a converter
    // label that only ever worked under the old rule keeps working).
    isOnShopify: function(toolBrand, name) {
        var set = this._shopifyModelsByBrand[toolBrand];
        if (!set) return null;
        if (set.has(this._normModel(name))) return true;
        var canon = this._canonModel(name, toolBrand);
        return !!canon && set.has(canon);
    },

    // Every handle on Shopify (ACTIVE or DRAFT) for this brand, or null if the
    // set has not been built. See isCarriedByHandles.
    _existingHandlesByBrand: {},
    existingHandles: function (toolBrand) { return this._existingHandlesByBrand[toolBrand] || null; },

    // Do any of these feed handles already exist on Shopify? This is a STRONGER
    // signal than the model-name match above, and it is the primary one for the
    // picker: the scraper feeds carry the live product handle per colorway (that
    // is how their inventory rows land on the right product at all), so a handle
    // hit is direct evidence we carry it, with no name parsing in the path.
    //
    // Returns null when the set is not built, so callers fall back rather than
    // reading "no handles matched" as "brand new".
    isCarriedByHandles: function (toolBrand, handles) {
        var set = this._existingHandlesByBrand[toolBrand];
        if (!set || !handles || !handles.length) return null;
        for (var i = 0; i < handles.length; i++) {
            if (handles[i] && set.has(String(handles[i]).toLowerCase())) return true;
        }
        return false;
    }
};

// node test hook only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) module.exports = CatalogClient;
