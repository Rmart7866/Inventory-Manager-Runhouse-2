// ASICS Converter - Processes pre-formatted scraper CSVs
// Simpler than HOKA/ON since the scraper already outputs Shopify-format CSV

var AsicsConverter = {
    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,
    _rawRows: null,

    // ========== ASICS CATEGORY MAPPING ==========
    productCategories: {
        'Neutral Running': [
            'GEL-NIMBUS 27', 'GEL-NIMBUS 28', 'GEL-CUMULUS 27',
            'NOVABLAST 5', 'NOVABLAST 5 TR'
        ],
        'Stability Running': [
            'GEL-KAYANO 32', 'GT-2000 14'
        ],
        'Racing / Performance': [
            'SUPERBLAST 2', 'MEGABLAST', 'METASPEED SKY TOKYO', 'SONICBLAST'
        ]
    },

    // ========== PARSE TITLE ==========
    parseTitle: function(title) {
        if (!title) return { gender: '', model: '', color: '' };

        // Strip quotes
        title = title.replace(/^"|"$/g, '').trim();

        var gender = '';
        if (title.indexOf("Women's") !== -1 || title.indexOf("Womens") !== -1) gender = "Women's";
        else if (title.indexOf("Men's") !== -1 || title.indexOf("Mens") !== -1) gender = "Men's";
        else if (title.indexOf("Unisex") !== -1) gender = 'Unisex';

        var model = '';
        var color = '';

        var dashIdx = title.lastIndexOf(' - ');
        if (dashIdx !== -1) {
            model = title.substring(0, dashIdx)
                .replace(/^(Men's|Women's|Unisex's?|Mens|Womens)\s+/i, '').trim();
            color = title.substring(dashIdx + 3).trim();
        } else {
            model = title.replace(/^(Men's|Women's|Unisex's?|Mens|Womens)\s+/i, '').trim();
        }

        // Normalize model to uppercase for consistent matching
        model = model.toUpperCase();

        return { gender: gender, model: model, color: color };
    },

    // ========== GET DISPLAY CATEGORY ==========
    getCategory: function(modelName) {
        for (var cat in this.productCategories) {
            if (this.productCategories[cat].indexOf(modelName) !== -1) {
                return cat;
            }
        }
        return 'Other';
    },

    // ========== SCAN FILE ==========
    scanFile: function(file) {
        var self = this;

        return new Promise(function(resolve, reject) {
            file.text().then(function(csvText) {
                var parsed = Papa.parse(csvText, { header: true });
                var allRows = parsed.data.filter(function(row) {
                    return row.Handle && row.Handle.trim() !== '';
                });

                self._rawRows = allRows;

                // Group by gender + model (so Men's and Women's show separately)
                var productsByModel = new Map();

                allRows.forEach(function(row) {
                    var titleInfo = self.parseTitle(row.Title || '');
                    var genderPrefix = titleInfo.gender ? (titleInfo.gender + ' ') : '';
                    var modelKey = genderPrefix + (titleInfo.model || 'Unknown');
                    var handle = row.Handle.trim();
                    var qty = parseInt(row['On hand (new)'] || '0') || 0;

                    if (!productsByModel.has(modelKey)) {
                        productsByModel.set(modelKey, {
                            model: titleInfo.model || 'Unknown',
                            modelKey: modelKey,
                            gender: titleInfo.gender,
                            category: self.getCategory(titleInfo.model || ''),
                            colorways: new Map(),
                            totalRows: 0,
                            totalInventory: 0
                        });
                    }

                    var modelData = productsByModel.get(modelKey);
                    modelData.totalRows++;
                    modelData.totalInventory += qty;

                    // Track unique colorways by handle
                    if (!modelData.colorways.has(handle)) {
                        modelData.colorways.set(handle, {
                            handle: handle,
                            title: row.Title || '',
                            color: titleInfo.color,
                            rows: 0,
                            inventory: 0
                        });
                    }

                    var cw = modelData.colorways.get(handle);
                    cw.rows++;
                    cw.inventory += qty;
                });

                var products = [];
                productsByModel.forEach(function(data) {
                    products.push({
                        name: data.modelKey,
                        model: data.model,
                        gender: data.gender,
                        category: data.category,
                        colorways: Array.from(data.colorways.values()),
                        rowCount: data.totalRows,
                        totalInventory: data.totalInventory
                    });
                });

                products.sort(function(a, b) {
                    var catComp = (a.category || '').localeCompare(b.category || '');
                    if (catComp !== 0) return catComp;
                    return a.name.localeCompare(b.name);
                });

                self.scannedProducts = products;
                resolve(products);
            }).catch(reject);
        });
    },

    // ========== CONVERT ==========
    convert: function(file) {
        var self = this;

        return new Promise(function(resolve, reject) {
            file.text().then(function(csvText) {
                var parsed = Papa.parse(csvText, { header: true });
                var allRows = parsed.data.filter(function(row) {
                    return row.Handle && row.Handle.trim() !== '';
                });

                var inventory = [];
                var productVariantData = [];

                allRows.forEach(function(row) {
                    var titleInfo = self.parseTitle(row.Title || '');
                    var genderPrefix = titleInfo.gender ? (titleInfo.gender + ' ') : '';
                    var modelKey = genderPrefix + (titleInfo.model || 'Unknown');

                    // Filter by picker selection (uses gender+model key)
                    if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) {
                        return;
                    }

                    var handle = row.Handle.trim();
                    var qty = row['On hand (new)'] || '0';

                    var inventoryRow = {
                        'Handle': handle,
                        'Title': row.Title || '',
                        'Option1 Name': row['Option1 Name'] || 'Size',
                        'Option1 Value': row['Option1 Value'] || '',
                        'Option2 Name': row['Option2 Name'] || '',
                        'Option2 Value': row['Option2 Value'] || '',
                        'Option3 Name': row['Option3 Name'] || '',
                        'Option3 Value': row['Option3 Value'] || '',
                        'SKU': row.SKU || '',
                        'Barcode': row.Barcode || '',
                        'HS Code': row['HS Code'] || '',
                        'COO': row.COO || '',
                        'Location': row.Location || 'Needham',
                        'Bin name': row['Bin name'] || '',
                        'On hand (new)': qty
                    };

                    inventory.push(inventoryRow);

                    productVariantData.push([inventoryRow, {
                        handle: handle,
                        title: row.Title || '',
                        gender: titleInfo.gender,
                        model: titleInfo.model,
                        color: titleInfo.color,
                        category: self.getCategory(titleInfo.model),
                        sku: row.SKU || '',
                        size: row['Option1 Value'] || '',
                        quantity: qty,
                        barcode: row.Barcode || ''
                    }]);
                });

                self.inventoryData = inventory;
                self.productVariantData = productVariantData;
                resolve(inventory);
            }).catch(reject);
        });
    },

    // ========== GENERATE INVENTORY CSV ==========
    generateInventoryCSV: function() {
        var headers = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
            '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
            '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
            '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];

        var csvRows = [headers.join(',')];

        this.inventoryData.forEach(function(row) {
            var csvRow = [
                row.Handle,
                '"' + (row.Title || '').replace(/"/g, '""') + '"',
                row['Option1 Name'] || 'Size',
                row['Option1 Value'] || '',
                row['Option2 Name'] || '',
                row['Option2 Value'] || '',
                row['Option3 Name'] || '',
                row['Option3 Value'] || '',
                row.SKU || '',
                row.Barcode || '',
                row['HS Code'] || '',
                row.COO || '',
                row.Location || 'Needham',
                row['Bin name'] || '',
                '', '', '', '', '',
                row['On hand (new)'] || '0'
            ];
            csvRows.push(csvRow.join(','));
        });

        return csvRows.join('\n');
    },

    // ========== CLEAN TITLE (for product CSV) ==========
    cleanTitle: function(title) {
        // ASICS titles are already clean: "Men's NOVABLAST 5 - BLACK/WHITE"
        // Just add ASICS prefix if missing
        if (!title) return title;
        if (title.indexOf('ASICS') === -1) {
            return 'ASICS ' + title;
        }
        return title;
    },

    // ========== GENERATE NEW PRODUCT CSV ==========
    generateNewProductCSV: function(comparison) {
        if (!comparison) return null;

        var self = this;
        var newHandles = new Set();
        if (comparison.newProducts) {
            comparison.newProducts.forEach(function(p) { newHandles.add(p.handle); });
        }
        if (comparison.newColorways) {
            comparison.newColorways.forEach(function(c) { newHandles.add(c.handle); });
        }

        if (newHandles.size === 0) return null;
        if (!this.productVariantData || this.productVariantData.length === 0) return null;

        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status',
            'SKU', 'Barcode',
            'Option1 name', 'Option1 value', 'Option1 Linked To',
            'Option2 name', 'Option2 value', 'Option2 Linked To',
            'Option3 name', 'Option3 value', 'Option3 Linked To',
            'Price', 'Compare-at price', 'Cost per item',
            'Charge tax', 'Tax code',
            'Unit price total measure', 'Unit price total measure unit',
            'Unit price base measure', 'Unit price base measure unit',
            'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
            'Weight value (grams)', 'Weight unit for display',
            'Requires shipping', 'Fulfillment service',
            'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
            'Gift card',
            'SEO title', 'SEO description',
            'Color (product.metafields.shopify.color-pattern)',
            'Google Shopping / Google product category',
            'Google Shopping / Gender', 'Google Shopping / Age group',
            'Google Shopping / Manufacturer part number (MPN)',
            'Google Shopping / Ad group name', 'Google Shopping / Ads labels',
            'Google Shopping / Condition', 'Google Shopping / Custom product',
            'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
            'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3',
            'Google Shopping / Custom label 4'
        ];

        var productGroups = new Map();

        this.productVariantData.forEach(function(entry) {
            var variantData = entry[1];
            if (!newHandles.has(variantData.handle)) return;

            if (!productGroups.has(variantData.handle)) {
                productGroups.set(variantData.handle, {
                    handle: variantData.handle,
                    title: variantData.title,
                    model: variantData.model,
                    gender: variantData.gender,
                    color: variantData.color,
                    category: variantData.category,
                    variants: []
                });
            }

            productGroups.get(variantData.handle).variants.push({
                size: variantData.size,
                sku: variantData.sku,
                barcode: variantData.barcode || '',
                quantity: variantData.quantity
            });
        });

        if (productGroups.size === 0) return null;

        var csvRows = [];

        productGroups.forEach(function(product) {
            var gGender = 'Unisex';
            if (product.gender === "Men's") gGender = 'Male';
            else if (product.gender === "Women's") gGender = 'Female';

            var cleanedTitle = self.cleanTitle(product.title);

            var tags = ['ASICS', product.model];
            if (product.gender && product.gender !== 'Unisex') tags.push(product.gender.replace("'s", ''));
            if (product.category) tags.push(product.category);

            var productType = "Unisex Shoes";
            if (product.gender === "Men's") productType = "Men's Shoes";
            else if (product.gender === "Women's") productType = "Women's Shoes";

            product.variants.forEach(function(variant, idx) {
                var row = {};

                if (idx === 0) {
                    row['Title'] = cleanedTitle;
                    row['URL handle'] = product.handle;
                    row['Description'] = '';
                    row['Vendor'] = 'ASICS';
                    row['Product category'] = 'Apparel & Accessories > Shoes';
                    row['Type'] = productType;
                    row['Tags'] = tags.join(', ');
                    row['Published on online store'] = 'FALSE';
                    row['Status'] = 'Draft';
                    row['Option1 name'] = 'Size';
                    row['SEO title'] = cleanedTitle;
                    row['SEO description'] = cleanedTitle;
                    row['Google Shopping / Google product category'] = 'Apparel & Accessories > Shoes';
                    row['Google Shopping / Gender'] = gGender;
                    row['Google Shopping / Age group'] = 'Adult (13+ years old)';
                    row['Google Shopping / Condition'] = 'New';
                    row['Google Shopping / Custom product'] = 'FALSE';
                    row['Google Shopping / Custom label 0'] = product.model;
                } else {
                    row['URL handle'] = product.handle;
                }

                row['Option1 value'] = variant.size;
                row['SKU'] = variant.sku;
                row['Barcode'] = variant.barcode;
                row['Price'] = '';
                row['Charge tax'] = 'TRUE';
                row['Inventory tracker'] = 'shopify';
                row['Inventory quantity'] = variant.quantity;
                row['Continue selling when out of stock'] = 'DENY';
                row['Requires shipping'] = 'TRUE';
                row['Fulfillment service'] = 'manual';
                row['Gift card'] = 'FALSE';

                csvRows.push(row);
            });
        });

        var headerLine = headers.map(function(h) { return '"' + h.replace(/"/g, '""') + '"'; }).join(',');
        var lines = [headerLine];

        csvRows.forEach(function(row) {
            var values = headers.map(function(h) {
                var val = row[h] !== undefined ? String(row[h]) : '';
                return '"' + val.replace(/"/g, '""') + '"';
            });
            lines.push(values.join(','));
        });

        return lines.join('\n');
    }
};
