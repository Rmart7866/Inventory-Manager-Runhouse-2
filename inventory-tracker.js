// ========== INVENTORY TRACKER (FIRESTORE) ==========
// Source of truth for what's currently on Shopify
// Tracks both product models and individual colorways per brand
// FIXED: Per-brand caching (was global, causing cross-brand data leaks)

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

    // ========== LOAD FROM FIRESTORE ==========
    load: function(brand) {
        var self = this;
        var cache = this._getCache(brand);

        if (cache.loaded) {
            return Promise.resolve({ models: cache.models, colorways: cache.colorways });
        }

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

        return Promise.all([modelsPromise, colorwaysPromise]).then(function(results) {
            cache.models = results[0];
            cache.colorways = results[1];
            cache.loaded = true;
            self._lastLoadedBrand = brand;
            console.log('[' + brand + '] Firestore: ' + cache.models.size + ' models, ' + cache.colorways.size + ' colorways');
            return { models: cache.models, colorways: cache.colorways };
        });
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

        // Separate new handles into new PRODUCTS vs new COLORWAYS
        var newProducts = [];
        var newColorways = [];
        currentHandles.forEach(function(product, handle) {
            if (!knownColorways.has(handle)) {
                // Try to identify the model name from the title
                var modelName = null;
                if (product.title && typeof HokaConverter !== 'undefined' && HokaConverter.identifyProduct) {
                    modelName = HokaConverter.identifyProduct(product.title);
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
        knownColorways.forEach(function(data, handle) {
            if (!currentHandles.has(handle)) {
                removedColorways.push({ handle: handle, title: data.title || handle, variants: data.variants || {} });
            }
        });

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
                removedColorways: removedColorways.length,
                matchingColorways: currentHandles.size - newProducts.length - newColorways.length
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