// ========== INVENTORY TRACKER ==========
// Tracks inventory snapshots in Firestore for change detection
// Currently supports HOKA only, designed to expand to other brands

var InventoryTracker = {

    // ========== CORE METHODS ==========

    // Save current inventory to Firestore and return comparison results
    // inventoryData: array of Shopify inventory rows from the converter
    // brand: string like 'hoka'
    // Returns: { added: [], removed: [], unchanged: [], summary: {} }
    saveAndCompare: function(brand, inventoryData) {
        var self = this;

        return self.loadCurrentProducts(brand).then(function(previousProducts) {
            // Build current product map from inventory data
            var currentProducts = self.buildProductMap(inventoryData);

            // Compare
            var comparison = self.compareSnapshots(previousProducts, currentProducts);

            // Save to Firestore
            return self.saveSnapshot(brand, currentProducts).then(function() {
                // Clean old snapshots (keep 7 days)
                return self.cleanOldSnapshots(brand, 7);
            }).then(function() {
                return comparison;
            });
        });
    },

    // Build a map of handle -> product data from inventory rows
    buildProductMap: function(inventoryData) {
        var products = new Map();

        for (var i = 0; i < inventoryData.length; i++) {
            var row = inventoryData[i];
            var handle = row.Handle;
            var title = row.Title;
            var size = row['Option1 Value'];
            var sku = row.SKU;
            var barcode = row.Barcode || '';
            var quantity = parseInt(row['On hand (new)']) || 0;

            if (!products.has(handle)) {
                products.set(handle, {
                    handle: handle,
                    title: title || '',
                    variants: {}
                });
            }

            var product = products.get(handle);
            // Fill title from first row that has it
            if (!product.title && title) {
                product.title = title;
            }

            product.variants[size] = {
                sku: sku,
                barcode: barcode,
                quantity: quantity
            };
        }

        return products;
    },

    // Compare previous snapshot with current data
    // Returns: { added: [...], removed: [...], unchanged: [...], summary: {} }
    compareSnapshots: function(previousProducts, currentProducts) {
        var added = [];
        var removed = [];
        var unchanged = [];

        // Find removed: in previous but not in current
        previousProducts.forEach(function(prevProduct, handle) {
            if (!currentProducts.has(handle)) {
                removed.push({
                    handle: handle,
                    title: prevProduct.title,
                    variants: prevProduct.variants,
                    lastSeen: prevProduct.lastSeen || null
                });
            }
        });

        // Find added and unchanged
        currentProducts.forEach(function(currProduct, handle) {
            if (!previousProducts.has(handle)) {
                added.push({
                    handle: handle,
                    title: currProduct.title,
                    variantCount: Object.keys(currProduct.variants).length
                });
            } else {
                unchanged.push(handle);
            }
        });

        var summary = {
            totalCurrent: currentProducts.size,
            totalPrevious: previousProducts.size,
            addedCount: added.length,
            removedCount: removed.length,
            unchangedCount: unchanged.length
        };

        return {
            added: added,
            removed: removed,
            unchanged: unchanged,
            summary: summary
        };
    },

    // ========== FIRESTORE OPERATIONS ==========

    // Load all active products for a brand from Firestore
    // Returns: Map of handle -> { title, variants, lastSeen, firstSeen }
    loadCurrentProducts: function(brand) {
        var collection = db.collection('inventory-tracker').doc(brand).collection('products');

        return collection.where('active', '==', true).get().then(function(snapshot) {
            var products = new Map();

            snapshot.forEach(function(doc) {
                var data = doc.data();
                products.set(doc.id, {
                    title: data.title || '',
                    variants: data.variants || {},
                    firstSeen: data.firstSeen || null,
                    lastSeen: data.lastSeen || null
                });
            });

            console.log('Loaded ' + products.size + ' active products from Firestore for ' + brand);
            return products;
        }).catch(function(error) {
            console.warn('Error loading from Firestore (may be first run):', error);
            return new Map();
        });
    },

    // Save current snapshot to Firestore
    // Updates each product doc and creates a snapshot record
    saveSnapshot: function(brand, currentProducts) {
        var batch = db.batch();
        var productsCollection = db.collection('inventory-tracker').doc(brand).collection('products');
        var snapshotsCollection = db.collection('inventory-tracker').doc(brand).collection('snapshots');
        var now = new Date().toISOString();
        var batchCount = 0;
        var batches = [];

        // We need to handle Firestore's 500 write limit per batch
        var MAX_BATCH_SIZE = 400; // Leave room

        // First: mark all active products as inactive (we'll reactivate current ones)
        // Actually, better approach: just update current products and deactivate missing ones
        // We'll do this in two passes

        var self = this;

        // Load ALL products (active and inactive) to know what exists
        return productsCollection.get().then(function(snapshot) {
            var existingHandles = new Set();
            snapshot.forEach(function(doc) {
                existingHandles.add(doc.id);
            });

            // Pass 1: Upsert current products (set active=true, update variants/lastSeen)
            var promises = [];
            var currentHandles = new Set();

            currentProducts.forEach(function(product, handle) {
                currentHandles.add(handle);

                var docData = {
                    title: product.title,
                    variants: product.variants,
                    lastSeen: now,
                    active: true
                };

                // If new product, add firstSeen
                if (!existingHandles.has(handle)) {
                    docData.firstSeen = now;
                }

                // Use set with merge to preserve firstSeen on existing docs
                promises.push(
                    productsCollection.doc(handle).set(docData, { merge: true })
                );
            });

            // Pass 2: Deactivate products not in current set
            existingHandles.forEach(function(handle) {
                if (!currentHandles.has(handle)) {
                    promises.push(
                        productsCollection.doc(handle).update({
                            active: false,
                            deactivatedAt: now
                        }).catch(function() {
                            // Ignore errors on deactivation
                        })
                    );
                }
            });

            // Save snapshot metadata
            var snapshotId = now.replace(/[:.]/g, '-');
            promises.push(
                snapshotsCollection.doc(snapshotId).set({
                    date: now,
                    productCount: currentProducts.size,
                    variantCount: self.countVariants(currentProducts),
                    type: 'inventory-update'
                })
            );

            return Promise.all(promises);
        }).then(function() {
            console.log('Saved ' + currentProducts.size + ' products to Firestore for ' + brand);
        });
    },

    // Count total variants across all products
    countVariants: function(productMap) {
        var count = 0;
        productMap.forEach(function(product) {
            count += Object.keys(product.variants).length;
        });
        return count;
    },

    // Clean snapshots older than N days
    cleanOldSnapshots: function(brand, keepDays) {
        var cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - keepDays);
        var cutoffStr = cutoff.toISOString();

        var snapshotsCollection = db.collection('inventory-tracker').doc(brand).collection('snapshots');

        return snapshotsCollection.where('date', '<', cutoffStr).get().then(function(snapshot) {
            if (snapshot.empty) return;

            var deletePromises = [];
            snapshot.forEach(function(doc) {
                deletePromises.push(doc.ref.delete());
            });

            return Promise.all(deletePromises).then(function() {
                console.log('Cleaned ' + deletePromises.length + ' old snapshots for ' + brand);
            });
        }).catch(function(error) {
            console.warn('Error cleaning old snapshots:', error);
        });
    },

    // ========== CSV HELPERS ==========

    // Generate zeroed-out inventory rows for removed products
    // Returns array of Shopify inventory row objects (same format as converter output)
    generateRemovedRows: function(removedProducts) {
        var rows = [];

        for (var i = 0; i < removedProducts.length; i++) {
            var product = removedProducts[i];
            var variants = product.variants;
            var isFirst = true;

            // Sort sizes numerically
            var sizes = Object.keys(variants).sort(function(a, b) {
                return (parseFloat(a) || 0) - (parseFloat(b) || 0);
            });

            for (var j = 0; j < sizes.length; j++) {
                var size = sizes[j];
                var variant = variants[size];

                rows.push({
                    Handle: product.handle,
                    Title: isFirst ? product.title : '',
                    'Option1 Name': isFirst ? 'Size' : '',
                    'Option1 Value': size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    SKU: variant.sku || '',
                    Barcode: variant.barcode || '',
                    'HS Code': '',
                    COO: '',
                    Location: 'Needham',
                    'Bin name': '',
                    'Incoming (not editable)': '',
                    'Unavailable (not editable)': '',
                    'Committed (not editable)': '',
                    'Available (not editable)': '',
                    'On hand (current)': '',
                    'On hand (new)': 0
                });

                isFirst = false;
            }
        }

        return rows;
    },

    // ========== STATUS CHECK ==========

    // Check if Firestore is connected and has data for a brand
    checkStatus: function(brand) {
        return db.collection('inventory-tracker').doc(brand).collection('products')
            .where('active', '==', true)
            .get()
            .then(function(snapshot) {
                return {
                    connected: true,
                    productCount: snapshot.size,
                    hasData: snapshot.size > 0
                };
            })
            .catch(function(error) {
                return {
                    connected: false,
                    productCount: 0,
                    hasData: false,
                    error: error.message
                };
            });
    },

    // Get last snapshot info for a brand
    getLastSnapshot: function(brand) {
        return db.collection('inventory-tracker').doc(brand).collection('snapshots')
            .orderBy('date', 'desc')
            .limit(1)
            .get()
            .then(function(snapshot) {
                if (snapshot.empty) return null;
                var doc = snapshot.docs[0];
                return doc.data();
            })
            .catch(function() {
                return null;
            });
    }
};
