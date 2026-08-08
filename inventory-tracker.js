// ========== INVENTORY TRACKER (FIRESTORE) ==========
// Source of truth for what's currently on Shopify
// Tracks both product models and individual colorways per brand
// FIXED: Per-brand caching (was global, causing cross-brand data leaks)
// FIXED: compare() now dispatches identifyProduct() per brand instead of
//        always calling HokaConverter (which mis-identified everything for
//        Brooks, ON, ASICS, etc. and routed new colorways to newProducts)

// ========== IGNORE LIST (SHARED, Firestore-backed) ==========
// Colorways staff explicitly marked "don't add" (no photos, not wanted, etc.).
// They must never show as a new product again. Filtering is by SKU (the stable
// key on both the feed and Shopify), so an ignored colorway stays ignored even if
// its handle drifts. Un-ignoring removes it; it reappears on the next scan if
// still new.
//
// SHARED ACROSS STAFF. Stored in Firestore at inventory-ignore/{brand}/items/
// {handle} (same db the tracker uses), so an ignore made on one machine applies
// everywhere. An in-memory cache keeps the hot path (skuSet/isIgnored, called in
// compare) synchronous; load(brand) fills it and runs during InventoryTracker.load.
// localStorage is kept as a mirror: a fast fallback if Firestore is unreachable,
// and the source for a one-time migration of anything ignored before this change.
var Ignore = {
    _cache: {},   // brand -> { map: {handle:{title,skus,at}}, skus: Set, loaded: bool }
    _lsKey: function (brand) { return 'rhIgnore:' + (brand || '_default'); },
    _coll: function (brand) { return db.collection('inventory-ignore').doc(brand || '_default').collection('items'); },
    // Firestore doc ids cannot contain / . # $ [ ]. Handles are safe slugs, but guard anyway.
    _docId: function (handle) { return String(handle || '_').replace(/[\/.#$\[\]]/g, '_').slice(0, 200) || '_'; },
    _c: function (brand) { return this._cache[brand] || (this._cache[brand] = { map: {}, skus: new Set(), loaded: false }); },

    // Load this brand's ignore list from Firestore into the cache. Falls back to
    // the localStorage mirror if Firestore is unavailable. Returns a Promise.
    load: function (brand) {
        var self = this;
        var getPromise;
        try { getPromise = this._coll(brand).get(); }
        catch (e) { self._loadLocalIntoCache(brand); return Promise.resolve(self._cache[brand]); } // db missing: use local mirror
        return getPromise.then(function (snap) {
            var map = {}, skus = new Set();
            snap.forEach(function (doc) {
                var d = doc.data() || {};
                map[doc.id] = { title: d.title || doc.id, skus: d.skus || [], at: d.at || 0 };
                (d.skus || []).forEach(function (x) { if (x) skus.add(String(x).toUpperCase()); });
            });
            self._cache[brand] = { map: map, skus: skus, loaded: true };
            self._migrateLocal(brand); // read the OLD local mirror, push local-only ignores up (one time)
            self._saveLocal(brand);    // then mirror the merged result
            return self._cache[brand];
        }).catch(function (e) {
            console.warn('[Ignore] Firestore load failed, using local mirror:', e && e.message);
            self._loadLocalIntoCache(brand);
            return self._cache[brand];
        });
    },
    _loadLocalIntoCache: function (brand) {
        var map = {}, skus = new Set();
        try { map = JSON.parse(localStorage.getItem(this._lsKey(brand)) || '{}'); } catch (e) { map = {}; }
        Object.keys(map).forEach(function (h) { (map[h].skus || []).forEach(function (x) { if (x) skus.add(String(x).toUpperCase()); }); });
        this._cache[brand] = { map: map, skus: skus, loaded: true };
    },
    _migrateLocal: function (brand) {
        var self = this, local = {};
        try { local = JSON.parse(localStorage.getItem(this._lsKey(brand)) || '{}'); } catch (e) { return; }
        var c = this._cache[brand];
        Object.keys(local).forEach(function (h) {
            if (!c.map[h]) self.add(brand, { handle: h, title: local[h].title, skus: local[h].skus || [] });
        });
    },
    _saveLocal: function (brand) { try { localStorage.setItem(this._lsKey(brand), JSON.stringify(this._c(brand).map)); } catch (e) { /* no localStorage */ } },

    all: function (brand) { return this._c(brand).map; },
    count: function (brand) { return Object.keys(this._c(brand).map).length; },
    skuSet: function (brand) { return this._c(brand).skus; },
    isIgnored: function (brand, skus) { var s = this._c(brand).skus; return (skus || []).some(function (x) { return x && s.has(String(x).toUpperCase()); }); },
    add: function (brand, entry) {
        var c = this._c(brand);
        var rec = { title: entry.title || entry.handle, skus: entry.skus || [], at: Date.now() };
        c.map[entry.handle] = rec;
        (entry.skus || []).forEach(function (x) { if (x) c.skus.add(String(x).toUpperCase()); });
        this._saveLocal(brand);
        try { this._coll(brand).doc(this._docId(entry.handle)).set(rec).catch(function () {}); } catch (e) { /* db missing */ }
    },
    remove: function (brand, handle) {
        var c = this._c(brand);
        delete c.map[handle];
        var skus = new Set();
        Object.keys(c.map).forEach(function (h) { (c.map[h].skus || []).forEach(function (x) { if (x) skus.add(String(x).toUpperCase()); }); });
        c.skus = skus;
        this._saveLocal(brand);
        try { this._coll(brand).doc(this._docId(handle)).delete().catch(function () {}); } catch (e) { /* db missing */ }
    }
};

var InventoryTracker = {

    // Per-brand cache: { brandName: { models: Set, colorways: Map, loaded: true } }
    _cache: {},
    _lastLoadedBrand: null,

    _getCache: function(brand) {
        if (!this._cache[brand]) {
            this._cache[brand] = { models: null, colorways: null, loaded: false };
        }
        return this._cache[brand];
    },

    // ========== BRAND -> CONVERTER LOOKUP ==========
    // Used by compare() to call the brand-specific identifyProduct().
    // A converter that exposes identifyProduct(title, handle) -> modelName
    // (matching what scanFile stores as modelKey) gets proper new-colorway
    // detection. Brands without identifyProduct fall back to "everything new
    // is a new product" which is safe but noisy.
    _getConverter: function(brand) {
        switch (brand) {
            case 'hoka':    return typeof HokaConverter    !== 'undefined' ? HokaConverter    : null;
            case 'on':      return typeof OnConverter      !== 'undefined' ? OnConverter      : null;
            case 'asics':   return typeof AsicsConverter   !== 'undefined' ? AsicsConverter   : null;
            case 'brooks':  return typeof BrooksConverter  !== 'undefined' ? BrooksConverter  : null;
            case 'puma':    return typeof PumaConverter    !== 'undefined' ? PumaConverter    : null;
            case 'saucony': return typeof SauconyConverter !== 'undefined' ? SauconyConverter : null;
            case 'merrell': return typeof MerrellConverter  !== 'undefined' ? MerrellConverter  : null;
            default: return null;
        }
    },

    // ========== SOURCE OF TRUTH ==========
    // 'shopify' reads live state from the Worker's /catalog (CatalogClient).
    // 'firestore' keeps the old hand-maintained mirror. Flip this one constant to
    // change the source for the whole tool. Kept 'firestore' by default so this
    // change ships dark: nothing about the live tool changes until it is flipped,
    // which should happen together with the per-product zero-out warning, not
    // before, so a first live run cannot silently zero a flood of products.
    SOURCE: 'shopify',

    // A newly-seen colorway is only worth creating if the feed actually carries
    // enough stock to sell. Below this total (summed across all sizes) it is
    // dropped from the new list. Set to 1 so any new colorway with buyable stock
    // shows (ASICS and other dropship colorways legitimately arrive low-stock);
    // only truly zero-stock entries are hidden. Raise this to filter thin drops.
    NEW_MIN_UNITS: 1,

    // ========== LOAD ==========
    load: function(brand) {
        var self = this;
        var cache = this._getCache(brand);

        if (cache.loaded) {
            return Promise.resolve({ models: cache.models, colorways: cache.colorways });
        }

        // Live path: build knownColorways/knownModels from Shopify via /catalog.
        // On any failure (Worker down, still building, network) fall back to
        // Firestore so the tool never breaks, and say so in the console.
        if (this.SOURCE === 'shopify' && typeof CatalogClient !== 'undefined') {
            var converter = this._getConverter(brand);
            var identifyFn = (converter && typeof converter.identifyProduct === 'function')
                ? converter.identifyProduct.bind(converter) : null;
            return Promise.all([
                CatalogClient.forBrand(brand, identifyFn),
                Ignore.load(brand).catch(function () { return null; }) // shared ignore list, never fatal
            ]).then(function(results) {
                var sets = results[0];
                cache.models = sets.models;
                cache.colorways = sets.colorways;
                cache.loaded = true;
                cache.source = 'shopify';
                self._lastLoadedBrand = brand;
                if (typeof CatalogUI !== 'undefined') CatalogUI.refreshFreshness();
                console.log('[' + brand + '] Shopify /catalog: ' + cache.models.size + ' models, ' + cache.colorways.size + ' colorways');
                self._afterLoad(brand);
                return { models: cache.models, colorways: cache.colorways };
            }).catch(function(err) {
                console.warn('[' + brand + '] /catalog load failed, falling back to Firestore:', err.message);
                if (typeof CatalogUI !== 'undefined') {
                    if (/building/i.test(err.message)) CatalogUI.setBuilding();
                    else CatalogUI.setFallback(err.message);
                }
                return self._loadFromFirestore(brand, cache);
            });
        }

        return this._loadFromFirestore(brand, cache);
    },

    // ========== LOAD FROM FIRESTORE (fallback / legacy source) ==========
    _loadFromFirestore: function(brand, cache) {
        var self = this;
        var modelsPromise = db.collection('inventory-tracker').doc(brand).collection('models')
            .where('active', '==', true).get()
            .then(function(snap) {
                var models = new Set();
                snap.forEach(function(doc) { models.add(doc.id); });
                return models;
            }).catch(function() { return new Set(); });

        var colorwaysPromise = db.collection('inventory-tracker').doc(brand).collection('products')
            .where('active', '==', true).get()
            .then(function(snap) {
                var cw = new Map();
                snap.forEach(function(doc) { cw.set(doc.id, doc.data()); });
                return cw;
            }).catch(function() { return new Map(); });

        var ignorePromise = Ignore.load(brand).catch(function () { return null; });
        return Promise.all([modelsPromise, colorwaysPromise, ignorePromise]).then(function(results) {
            cache.models = results[0];
            cache.colorways = results[1];
            cache.loaded = true;
            cache.source = 'firestore';
            self._lastLoadedBrand = brand;
            console.log('[' + brand + '] Firestore: ' + cache.models.size + ' models, ' + cache.colorways.size + ' colorways');
            self._afterLoad(brand);
            return { models: cache.models, colorways: cache.colorways };
        });
    },

    // Fire-and-forget housekeeping after a brand's catalog loads. Currently:
    // wire the color swatches of any created colorway that has since gone live
    // (scoped to just those model families). Guarded and never fatal.
    _afterLoad: function (brand) {
        try {
            if (typeof CatalogTags !== 'undefined' && CatalogTags.processSwatchQueue) CatalogTags.processSwatchQueue(brand);
        } catch (e) { /* never block a load */ }
    },

    invalidateCache: function(brand) {
        if (brand) {
            this._cache[brand] = { models: null, colorways: null, loaded: false };
        } else {
            this._cache = {};
        }
    },

    // ========== CHECKS (per-brand, defaults to last loaded) ==========
    isKnownModel: function(modelName, brand) {
        var cache = this._getCache(brand || this._lastLoadedBrand || '_default');
        return cache.models ? cache.models.has(modelName) : false;
    },

    isKnownColorway: function(handle, brand) {
        var cache = this._getCache(brand || this._lastLoadedBrand || '_default');
        return cache.colorways ? cache.colorways.has(handle) : false;
    },

    getKnownModels: function(brand) {
        var cache = this._getCache(brand || this._lastLoadedBrand || '_default');
        return cache.models || new Set();
    },

    getKnownColorways: function(brand) {
        var cache = this._getCache(brand || this._lastLoadedBrand || '_default');
        return cache.colorways || new Map();
    },

    // ========== COMPARE ATS VS FIRESTORE ==========
    compare: function(inventoryData, brand) {
        var self = this;
        // If no brand specified, use the last brand that was loaded
        if (!brand) brand = this._lastLoadedBrand || '_default';
        var cache = this._getCache(brand);
        var converter = this._getConverter(brand);
        var currentHandles = new Map();

        for (var i = 0; i < inventoryData.length; i++) {
            var row = inventoryData[i];
            var handle = row.Handle;
            if (!currentHandles.has(handle)) {
                currentHandles.set(handle, { handle: handle, title: row.Title || '', variants: {} });
            }
            var p = currentHandles.get(handle);
            if (!p.title && row.Title) p.title = row.Title;
            p.variants[row['Option1 Value']] = {
                sku: row.SKU, barcode: row.Barcode || '',
                quantity: parseInt(row['On hand (new)']) || 0
            };
        }

        var knownColorways = cache.colorways || new Map();
        var knownModels = cache.models || new Set();

        // MATCH BY VARIANT SKU, not handle, in live mode. The converter cannot
        // reproduce Shopify's exact handle (Shopify handles are inconsistent, some
        // carry SKU suffixes, some do not), so handle matching flags in-stock,
        // in-feed products as removed. The variant SKU is identical on both sides
        // (eg 1176573-FMM-04B in the feed and on Shopify), so it is the reliable
        // colorway key. A colorway is "present" if ANY of its SKUs matches.
        // Firestore mode keeps the legacy handle match.
        var useSku = (self.SOURCE === 'shopify');
        var feedSkus = null, knownSkus = null;
        if (useSku) {
            // REMOVAL compares against the WHOLE file's SKUs, not the picker
            // selection. The converter exposes allFeedSkus (every SKU in the
            // scanned file, regardless of what is checked), so unselected
            // products are never mistaken for removed and wrongly zeroed. Fall
            // back to the selected inventory only if a converter does not provide
            // it (then Select All is required for correct removal detection).
            if (converter && converter.allFeedSkus && converter.allFeedSkus.size) {
                feedSkus = converter.allFeedSkus;
            } else {
                feedSkus = new Set();
                for (var fi = 0; fi < inventoryData.length; fi++) {
                    var fs = inventoryData[fi].SKU;
                    if (fs) feedSkus.add(String(fs).toUpperCase());
                }
            }
            knownSkus = new Set();
            knownColorways.forEach(function(data) {
                (data.skus || []).forEach(function(sk) { if (sk) knownSkus.add(String(sk).toUpperCase()); });
            });
        }

        // A broader "already on Shopify" SKU set, ACTIVE and DRAFT across every
        // location, used ONLY to suppress new-detection. Without it, a product
        // created last time as a draft is missing from the ACTIVE+Needham known
        // set and reappears as new every scan, then is skipped as "already
        // exists" on create. The removed/zero logic below still uses the narrow
        // ACTIVE+Needham set, so this cannot cause a non-dropship product to be
        // zeroed.
        var existingSkus = (self.SOURCE === 'shopify' && typeof CatalogClient !== 'undefined' && CatalogClient.existingSkus)
            ? CatalogClient.existingSkus(brand) : null;

        // SKU-INDEPENDENT SUPPRESSION. About 1 in 5 live products carry no SKU on
        // Shopify (hand-created or Shopify-duplicated, which blanks the copy's
        // SKUs), so the SKU check above literally cannot see them and their real
        // feed colorway reappears as new every scan. This title-derived colorway
        // key (model|gender|width|color) matches where the SKU cannot. It only
        // ever SUPPRESSES (marks a feed product as already carried); it never
        // adds a removal, so it cannot cause a wrongful zero. See
        // CatalogClient.colorwayKeyFromTitle.
        var existingCwKeys = (self.SOURCE === 'shopify' && typeof CatalogClient !== 'undefined' && CatalogClient.existingColorwayKeys)
            ? CatalogClient.existingColorwayKeys(brand) : null;
        var vendorTok = (typeof CatalogClient !== 'undefined' && CatalogClient.VENDOR_BY_BRAND)
            ? (CatalogClient.VENDOR_BY_BRAND[brand] || '') : '';
        var cwKeySuppressed = 0;

        // Separate new handles into new PRODUCTS vs new COLORWAYS
        var newProducts = [];
        var newColorways = [];
        currentHandles.forEach(function(product, handle) {
            var existing;
            if (useSku) {
                var groupSkus = Object.keys(product.variants).map(function(sz) { return product.variants[sz].sku; });
                existing = groupSkus.some(function(sk) {
                    if (!sk) return false;
                    var up = String(sk).toUpperCase();
                    return knownSkus.has(up) || (existingSkus && existingSkus.has(up));
                });
                // Fall back to the title-derived colorway key for the SKU-less
                // products the SKU check can never match.
                if (!existing && existingCwKeys) {
                    var cwKey = CatalogClient.colorwayKeyFromTitle(product.title, vendorTok);
                    if (cwKey && existingCwKeys.has(cwKey)) { existing = true; cwKeySuppressed++; }
                }
            } else {
                existing = knownColorways.has(handle);
            }
            if (!existing) {
                // Try to identify the model name from the title using the
                // brand's own identifier. The converter's identifyProduct
                // should return whatever string scanFile stores as modelKey
                // (typically gender + model, e.g. "Men's ADRENALINE GTS 25").
                var modelName = null;
                if (product.title && converter && typeof converter.identifyProduct === 'function') {
                    modelName = converter.identifyProduct(product.title, handle);
                }

                var entry = {
                    handle: handle,
                    title: product.title,
                    variantCount: Object.keys(product.variants).length,
                    variants: product.variants,
                    modelName: modelName
                };

                if (modelName && knownModels.has(modelName)) {
                    newColorways.push(entry);
                } else {
                    newProducts.push(entry);
                }
            }
        });

        var removedColorways = [];
        var noSkuGuarded = 0;
        knownColorways.forEach(function(data, handle) {
            var isRemoved;
            if (useSku) {
                var skus = (data.skus || []).filter(function(sk) { return sk && String(sk).trim(); });
                // NO-SKU GUARD. Some live products have variants with no SKU on
                // Shopify (typically staff-duplicated products, where Shopify
                // blanks the copy's SKUs). With no SKU there is nothing to match
                // against the feed, so removal-by-SKU is meaningless and would
                // ALWAYS report "removed", falsely zeroing a real, stocked
                // product. Skip these entirely; they need SKUs mapped on Shopify
                // before removal detection can judge them. Never a removal target.
                if (skus.length === 0) { noSkuGuarded++; return; }
                isRemoved = !skus.some(function(sk) { return feedSkus.has(String(sk).toUpperCase()); });
            } else {
                isRemoved = !currentHandles.has(handle);
            }
            if (isRemoved) {
                removedColorways.push({
                    handle: handle,
                    title: data.title || handle,
                    variants: data.variants || {},
                    needhamOnHand: (data.needhamOnHand == null ? null : data.needhamOnHand)
                });
            }
        });
        if (noSkuGuarded > 0) {
            console.log('[InventoryTracker] No-SKU guard: skipped ' + noSkuGuarded +
                ' live colorway(s) with no Shopify SKU (unmatchable; not flagged removed). ' +
                'Map SKUs on Shopify to make them matchable.');
        }

        // Only surface new colorways that carry enough stock to be worth creating.
        // Total units across sizes must clear NEW_MIN_UNITS; thinner drops are hidden.
        var unitsOf = function(entry) {
            var t = 0, v = entry.variants || {};
            for (var sz in v) { if (v.hasOwnProperty(sz)) t += (parseInt(v[sz].quantity) || 0); }
            return t;
        };
        if (cwKeySuppressed > 0) {
            console.log('[InventoryTracker] Colorway-key suppression: ' + cwKeySuppressed +
                ' feed product(s) recognized as already carried by title (model|gender|width|color), ' +
                'not by SKU. These are SKU-less Shopify products the old SKU-only check re-offered as new.');
        }
        // Drop colorways staff explicitly ignored (don't-add list). Matched by
        // SKU so an ignored colorway stays hidden regardless of handle drift.
        var ignoreSkus = (typeof Ignore !== 'undefined') ? Ignore.skuSet(brand) : new Set();
        var ignoredCount = 0;
        var notIgnored = function(e) {
            if (!ignoreSkus.size) return true;
            var v = e.variants || {};
            for (var sz in v) { if (v.hasOwnProperty(sz) && v[sz] && v[sz].sku && ignoreSkus.has(String(v[sz].sku).toUpperCase())) { ignoredCount++; return false; } }
            return true;
        };
        newProducts = newProducts.filter(notIgnored);
        newColorways = newColorways.filter(notIgnored);
        if (ignoredCount > 0) console.log('[InventoryTracker] Hid ' + ignoredCount + ' colorway(s) on the ignore list.');

        var newProdBefore = newProducts.length, newColorBefore = newColorways.length;
        newProducts = newProducts.filter(function(e) { return unitsOf(e) >= self.NEW_MIN_UNITS; });
        newColorways = newColorways.filter(function(e) { return unitsOf(e) >= self.NEW_MIN_UNITS; });
        var newHiddenThin = (newProdBefore - newProducts.length) + (newColorBefore - newColorways.length);
        if (newHiddenThin > 0) {
            console.log('[InventoryTracker] Hid ' + newHiddenThin + ' new colorway(s) under ' +
                self.NEW_MIN_UNITS + ' total units (not worth creating).');
        }

        return {
            newProducts: newProducts,
            newColorways: newColorways,
            removedColorways: removedColorways,
            currentHandles: currentHandles,
            summary: {
                totalInATS: currentHandles.size,
                totalInDB: knownColorways.size,
                newProducts: newProducts.length,
                newColorways: newColorways.length,
                hiddenThinNew: newHiddenThin,
                noSkuGuarded: noSkuGuarded,
                cwKeySuppressed: cwKeySuppressed,
                removedColorways: removedColorways.length,
                matchingColorways: currentHandles.size - newProducts.length - newColorways.length - newHiddenThin
            }
        };
    },

    // ========== CONFIRM ON SHOPIFY ==========
    confirmModels: function(brand, modelNames) {
        var self = this;
        var cache = this._getCache(brand);
        var now = new Date().toISOString();
        var promises = [];
        for (var i = 0; i < modelNames.length; i++) {
            (function(name) {
                promises.push(
                    db.collection('inventory-tracker').doc(brand).collection('models').doc(name).set({
                        name: name, active: true, firstSeen: now, lastSeen: now
                    }, { merge: true })
                );
                if (cache.models) cache.models.add(name);
            })(modelNames[i]);
        }
        console.log('[' + brand + '] Confirming ' + modelNames.length + ' models');
        return Promise.all(promises);
    },

    confirmColorways: function(brand, colorwayData) {
        var self = this;
        var cache = this._getCache(brand);
        var now = new Date().toISOString();
        var promises = [];
        for (var i = 0; i < colorwayData.length; i++) {
            (function(cw) {
                promises.push(
                    db.collection('inventory-tracker').doc(brand).collection('products').doc(cw.handle).set({
                        title: cw.title, variants: cw.variants || {}, active: true, firstSeen: now, lastSeen: now
                    }, { merge: true })
                );
                if (cache.colorways) {
                    cache.colorways.set(cw.handle, { title: cw.title, variants: cw.variants || {}, active: true });
                }
            })(colorwayData[i]);
        }
        console.log('[' + brand + '] Confirming ' + colorwayData.length + ' colorways');
        return Promise.all(promises);
    },

    // Update quantities for existing colorways (runs each generate)
    updateExistingColorways: function(brand, inventoryData) {
        var self = this;
        var cache = this._getCache(brand);
        var now = new Date().toISOString();
        var byHandle = new Map();

        for (var i = 0; i < inventoryData.length; i++) {
            var row = inventoryData[i];
            if (!byHandle.has(row.Handle)) byHandle.set(row.Handle, { title: row.Title || '', variants: {} });
            var p = byHandle.get(row.Handle);
            if (!p.title && row.Title) p.title = row.Title;
            p.variants[row['Option1 Value']] = {
                sku: row.SKU, barcode: row.Barcode || '',
                quantity: parseInt(row['On hand (new)']) || 0
            };
        }

        var knownColorways = cache.colorways || new Map();
        var promises = [];
        byHandle.forEach(function(data, handle) {
            if (knownColorways.has(handle)) {
                promises.push(
                    db.collection('inventory-tracker').doc(brand).collection('products').doc(handle).update({
                        variants: data.variants, lastSeen: now
                    }).catch(function() {})
                );
            }
        });

        if (promises.length > 0) console.log('[' + brand + '] Updating ' + promises.length + ' existing colorways');
        return Promise.all(promises);
    },

    // ========== ZEROED ROWS FOR REMOVED COLORWAYS ==========
    generateRemovedRows: function(removedColorways) {
        var rows = [];
        for (var i = 0; i < removedColorways.length; i++) {
            var product = removedColorways[i];
            var variants = product.variants || {};
            var isFirst = true;
            var sizes = Object.keys(variants).sort(function(a, b) {
                return (parseFloat(a) || 0) - (parseFloat(b) || 0);
            });

            if (sizes.length === 0) continue;

            for (var j = 0; j < sizes.length; j++) {
                var variant = variants[sizes[j]];
                rows.push({
                    Handle: product.handle,
                    Title: isFirst ? (product.title || '') : '',
                    'Option1 Name': isFirst ? 'Size' : '',
                    'Option1 Value': sizes[j],
                    'Option2 Name': '', 'Option2 Value': '',
                    'Option3 Name': '', 'Option3 Value': '',
                    SKU: variant.sku || '', Barcode: variant.barcode || '',
                    'HS Code': '', COO: '',
                    Location: 'Needham', 'Bin name': '',
                    'Incoming (not editable)': '', 'Unavailable (not editable)': '',
                    'Committed (not editable)': '', 'Available (not editable)': '',
                    'On hand (current)': '', 'On hand (new)': 0
                });
                isFirst = false;
            }
        }
        return rows;
    },

    // ========== STATUS ==========
    checkStatus: function(brand) {
        return db.collection('inventory-tracker').doc(brand).collection('products')
            .where('active', '==', true).get()
            .then(function(snap) {
                var productCount = snap.size;
                return db.collection('inventory-tracker').doc(brand).collection('models')
                    .where('active', '==', true).get()
                    .then(function(modelSnap) {
                        return { connected: true, productCount: productCount, modelCount: modelSnap.size, hasData: productCount > 0 || modelSnap.size > 0 };
                    });
            }).catch(function(error) {
                return { connected: false, productCount: 0, modelCount: 0, hasData: false, error: error.message };
            });
    }
};
