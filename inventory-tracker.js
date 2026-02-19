// ========== INVENTORY TRACKER (FIRESTORE) ==========
// Source of truth for what's currently on Shopify
// Tracks both product models and individual colorways
// Nothing gets saved until user confirms it's on Shopify

var InventoryTracker = {

    _knownModels: null,
    _knownColorways: null,
    _loaded: false,

    // ========== LOAD FROM FIRESTORE ==========

    load: function(brand) {
        var self = this;
        if (self._loaded) {
            return Promise.resolve({ models: self._knownModels, colorways: self._knownColorways });
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
            self._knownModels = results[0];
            self._knownColorways = results[1];
            self._loaded = true;
            console.log('Firestore: ' + self._knownModels.size + ' models, ' + self._knownColorways.size + ' colorways');
            return { models: self._knownModels, colorways: self._knownColorways };
        });
    },

    invalidateCache: function() {
        this._knownModels = null;
        this._knownColorways = null;
        this._loaded = false;
    },

    // ========== CHECKS ==========

    isKnownModel: function(modelName) {
        return this._knownModels ? this._knownModels.has(modelName) : false;
    },

    isKnownColorway: function(handle) {
        return this._knownColorways ? this._knownColorways.has(handle) : false;
    },

    getKnownModels: function() { return this._knownModels || new Set(); },
    getKnownColorways: function() { return this._knownColorways || new Map(); },

    // ========== COMPARE ATS VS FIRESTORE ==========

    compare: function(inventoryData) {
        var self = this;
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

        // Separate new handles into new PRODUCTS vs new COLORWAYS
        var newProducts = [];   // Model not in DB at all
        var newColorways = [];  // Model known, but this color isn't
        currentHandles.forEach(function(product, handle) {
            if (!self.isKnownColorway(handle)) {
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

                if (modelName && self.isKnownModel(modelName)) {
                    // Model exists on Shopify — this is just a new color
                    newColorways.push(entry);
                } else {
                    // Model NOT in DB — this is a new product entirely
                    newProducts.push(entry);
                }
            }
        });

        var removedColorways = [];
        if (self._knownColorways) {
            self._knownColorways.forEach(function(data, handle) {
                if (!currentHandles.has(handle)) {
                    removedColorways.push({ handle: handle, title: data.title || handle, variants: data.variants || {} });
                }
            });
        }

        return {
            newProducts: newProducts,
            newColorways: newColorways,
            removedColorways: removedColorways,
            currentHandles: currentHandles,
            summary: {
                totalInATS: currentHandles.size,
                totalInDB: self._knownColorways ? self._knownColorways.size : 0,
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
        var now = new Date().toISOString();
        var promises = [];
        for (var i = 0; i < modelNames.length; i++) {
            (function(name) {
                promises.push(
                    db.collection('inventory-tracker').doc(brand).collection('models').doc(name).set({
                        name: name, active: true, firstSeen: now, lastSeen: now
                    }, { merge: true })
                );
                if (self._knownModels) self._knownModels.add(name);
            })(modelNames[i]);
        }
        console.log('Confirming ' + modelNames.length + ' models on Shopify');
        return Promise.all(promises);
    },

    confirmColorways: function(brand, colorwayData) {
        var self = this;
        var now = new Date().toISOString();
        var promises = [];
        for (var i = 0; i < colorwayData.length; i++) {
            (function(cw) {
                promises.push(
                    db.collection('inventory-tracker').doc(brand).collection('products').doc(cw.handle).set({
                        title: cw.title, variants: cw.variants || {}, active: true, firstSeen: now, lastSeen: now
                    }, { merge: true })
                );
                if (self._knownColorways) {
                    self._knownColorways.set(cw.handle, { title: cw.title, variants: cw.variants || {}, active: true });
                }
            })(colorwayData[i]);
        }
        console.log('Confirming ' + colorwayData.length + ' colorways on Shopify');
        return Promise.all(promises);
    },

    // Update quantities for existing colorways (runs each generate)
    updateExistingColorways: function(brand, inventoryData) {
        var self = this;
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

        var promises = [];
        byHandle.forEach(function(data, handle) {
            if (self.isKnownColorway(handle)) {
                promises.push(
                    db.collection('inventory-tracker').doc(brand).collection('products').doc(handle).update({
                        variants: data.variants, lastSeen: now
                    }).catch(function() {})
                );
            }
        });

        if (promises.length > 0) console.log('Updating ' + promises.length + ' existing colorways');
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

            if (sizes.length === 0) continue; // Skip seeded entries with no variant data

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
