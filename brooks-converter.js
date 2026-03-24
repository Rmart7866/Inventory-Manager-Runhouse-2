// Brooks Converter - Processes pre-formatted scraper CSVs
// Gender derived from style code: 110xxx = Men, 120xxx = Women
// Width derived from handle suffix: gender-aware interpretation
// Men:   B=Narrow, D=Regular, 2E=Wide, 4E=Extra Wide
// Women: 2A=Narrow, B=Regular, D=Wide, 2E=Extra Wide, 4E=Extra Extra Wide

var BrooksConverter = {
    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,
    _rawRows: null,

    // ========== HANDLE REMAPPING ==========
    // Brooks occasionally updates style numbers on their portal for existing products.
    // When that happens the scraper outputs a handle with the new style number,
    // but the Shopify product was created with the old one. Map new -> old here.
    handleRemap: {
        'glycerin-23-blackblackebony-120465133': 'glycerin-23-blackblackebony-120465111',
        'glycerin-23-blackblackebony-2e-110476096': 'glycerin-23-blackblackebony-2e-110476154',
        'glycerin-23-blackblackebony-d-120465133': 'glycerin-23-blackblackebony-d-110476154',
        'glycerin-23-blackebonybiscuit-d-110476096': 'glycerin-23-blackebonybiscuit-d-110476154',
        'glycerin-23-blackgreywhite-120465133': 'glycerin-23-blackgreywhite-120465111',
        'glycerin-23-blackgreywhite-2e-110476096': 'glycerin-23-blackgreywhite-2e-110476154',
        'glycerin-23-blackgreywhite-d-110476096': 'glycerin-23-blackgreywhite-d-120465111',
        'glycerin-23-bluespellboundstarfish-d-110476096': 'glycerin-23-bluespellboundstarfish-d-110476154',
        'glycerin-23-coconutbleached-sandgrey-d-110476096': 'glycerin-23-coconutbleached-sandgrey-d-110476154',
        'glycerin-23-coconutsandskyway-120465133': 'glycerin-23-coconutsandskyway-120465111',
        'glycerin-23-greyblackened-pearlblack-2e-110476096': 'glycerin-23-greyblackened-pearlblack-2e-110476154',
        'glycerin-23-greyblackened-pearlblack-4e-110476096': 'glycerin-23-greyblackened-pearlblack-4e-110476154',
        'glycerin-23-greyblackened-pearlblack-d-110476096': 'glycerin-23-greyblackened-pearlblack-d-110476154',
        'glycerin-23-skywayblazing-bellpink-120465133': 'glycerin-23-skywayblazing-bellpink-120465111',
        'glycerin-23-spellboundyuccapink-120465133': 'glycerin-23-spellboundyuccapink-120465111',
        'glycerin-23-spellboundyuccapink-2e-120465133': 'glycerin-23-spellboundyuccapink-2e-120465111',
        'glycerin-23-spellboundyuccapink-d-120465133': 'glycerin-23-spellboundyuccapink-d-120465111',
        'glycerin-23-whiteblackgum-2e-110476096': 'glycerin-23-whiteblackgum-2e-110476154',
        'glycerin-23-whiteblackgum-d-110476096': 'glycerin-23-whiteblackgum-d-110476154',
        'glycerin-23-whiteharbor-mistmetallic-120465133': 'glycerin-23-whiteharbor-mistmetallic-120465111',
        'glycerin-23-whiteharbor-mistmetallic-d-120465133': 'glycerin-23-whiteharbor-mistmetallic-d-120465111',
        'glycerin-23-whiteoystersilver-120465133': 'glycerin-23-whiteoystersilver-120465111',
        'glycerin-23-whiteoystersilver-d-120465133': 'glycerin-23-whiteoystersilver-d-120465111',
        'glycerin-23-whitephantomgreen-gecko-d-110476096': 'glycerin-23-whitephantomgreen-gecko-d-110476154',
        'glycerin-gts-23-blackgreywhite-d-110503844': 'glycerin-gts-23-blackgreywhite-d-120492453',
        'glycerin-gts-23-spellboundyuccapink-120492090': 'glycerin-gts-23-spellboundyuccapink-120492453',
        'glycerin-gts-23-spellboundyuccapink-2e-120492090': 'glycerin-gts-23-spellboundyuccapink-2e-120492453',
        'glycerin-gts-23-spellboundyuccapink-d-120492090': 'glycerin-gts-23-spellboundyuccapink-d-120492453',
        'glycerin-gts-23-whiteharbor-mistmetallic-120492090': 'glycerin-gts-23-whiteharbor-mistmetallic-120492453',
        'glycerin-gts-23-whiteharbor-mistmetallic-d-120492090': 'glycerin-gts-23-whiteharbor-mistmetallic-d-120492453',
    },

    // ========== REMAP HANDLE ==========
    remapHandle: function(handle) {
        return this.handleRemap[handle] || handle;
    },

    // ========== BROOKS CATEGORY MAPPING ==========
    productCategories: {
        'Neutral Running': [
            'GHOST 17', 'GHOST MAX 3', 'GLYCERIN 22', 'GLYCERIN 23', 'GLYCERIN FLEX', 'GLYCERIN MAX 2'
        ],
        'Stability Running': [
            'GLYCERIN GTS 22', 'GLYCERIN GTS 23', 'ADRENALINE GTS 25', 'ADRENALINE GTS 24 GTX', 'ARIEL GTS 26'
        ]
    },

    // ========== DERIVE GENDER FROM STYLE CODE ==========
    // Style code at end of handle: 110xxx = Men, 120xxx = Women
    getGender: function(handle) {
        var match = handle.match(/(\d{9})$/);
        if (match) {
            var prefix = match[1].substring(0, 3);
            if (prefix === '110') return "Men's";
            if (prefix === '120') return "Women's";
        }
        return '';
    },

    // ========== DERIVE WIDTH FROM HANDLE (GENDER-AWARE) ==========
    // Men's width spec:
    //   B       = Narrow          -> -narrow
    //   D       = Regular         -> (no suffix)
    //   2E/EE   = Wide            -> -wide
    //   4E/EEEE = Extra Wide      -> -extra-wide
    //
    // Women's width spec:
    //   2A/AA   = Narrow          -> -narrow
    //   B       = Regular         -> (no suffix)
    //   D       = Wide            -> -wide
    //   2E/EE   = Extra Wide      -> -extra-wide
    //   4E/EEEE = Extra Extra Wide -> -extra-extra-wide
    getWidth: function(handle, isWomen) {
        // Width suffix appears before the 9-digit style code
        var match = handle.match(/-(2a|2e|4e|d|b|narrow)-\d{9}$/i);
        if (!match) {
            // No width suffix = standard width (D men / B women) = Regular
            return '';
        }

        var code = match[1].toLowerCase();

        if (isWomen) {
            switch (code) {
                case '2a':     return 'Narrow';
                case 'b':      return '';                  // B = Regular for women
                case 'd':      return 'Wide';
                case '2e':     return 'Extra Wide';
                case '4e':     return 'Extra Extra Wide';
                case 'narrow': return 'Narrow';
                default:       return '';
            }
        } else {
            switch (code) {
                case 'b':      return 'Narrow';
                case 'd':      return '';                  // D = Regular for men
                case '2e':     return 'Wide';
                case '4e':     return 'Extra Wide';
                case 'narrow': return 'Narrow';
                default:       return '';
            }
        }
    },

    // ========== PARSE TITLE ==========
    parseTitle: function(title, handle) {
        if (!title) return { gender: '', model: '', color: '', width: '' };

        title = title.replace(/^"|"$/g, '').trim();

        var gender = this.getGender(handle || '');
        var isWomen = gender === "Women's";
        var width = this.getWidth(handle || '', isWomen);
        var model = '';
        var color = '';

        var dashIdx = title.lastIndexOf(' - ');
        if (dashIdx !== -1) {
            model = title.substring(0, dashIdx).trim();
            color = title.substring(dashIdx + 3).trim();
        } else {
            model = title.trim();
        }

        // Normalize model to uppercase
        model = model.toUpperCase();

        return { gender: gender, model: model, color: color, width: width };
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
                    var handle = self.remapHandle(row.Handle.trim());
                    var titleInfo = self.parseTitle(row.Title || '', handle);
                    var genderPrefix = titleInfo.gender ? (titleInfo.gender + ' ') : '';
                    var modelKey = genderPrefix + (titleInfo.model || 'Unknown');
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

                    if (!modelData.colorways.has(handle)) {
                        modelData.colorways.set(handle, {
                            handle: handle,
                            title: row.Title || '',
                            color: titleInfo.color,
                            width: titleInfo.width,
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
                    var handle = self.remapHandle(row.Handle.trim());
                    var titleInfo = self.parseTitle(row.Title || '', handle);
                    var genderPrefix = titleInfo.gender ? (titleInfo.gender + ' ') : '';
                    var modelKey = genderPrefix + (titleInfo.model || 'Unknown');

                    // Filter by picker selection (uses gender+model key)
                    if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) {
                        return;
                    }

                    var qty = row['On hand (new)'] || '0';

                    var inventoryRow = {
                        'Handle': handle,
                        'Title': row.Title || '',
                        'Option1 Name': row['Option1 Name'] || 'Size',
                        'Option1 Value': row['Option1 Value'] || '',
                        'Option2 Name': '',
                        'Option2 Value': '',
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
                        width: titleInfo.width,
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
                '',
                '',
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
    // Rebuilds title as: "Brooks Men's Ghost 17 (Wide) - Black/White"
    cleanTitle: function(title, gender, width) {
        if (!title) return title;
        title = title.replace(/^"|"$/g, '').trim();

        var model = title;
        var color = '';
        var dashIdx = title.lastIndexOf(' - ');
        if (dashIdx !== -1) {
            model = title.substring(0, dashIdx).trim();
            color = title.substring(dashIdx + 3).trim();
        }

        var parts = ['Brooks'];
        if (gender) parts.push(gender);
        parts.push(model);
        if (width) parts[parts.length - 1] = parts[parts.length - 1] + ' (' + width + ')';

        var result = parts.join(' ');
        if (color) result += ' - ' + color;
        return result;
    },

    // ========== CLEAN HANDLE (for product CSV) ==========
    cleanHandle: function(cleanedTitle) {
        if (!cleanedTitle) return '';
        return cleanedTitle
            .toLowerCase()
            .replace(/[''()]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
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
                    width: variantData.width,
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

            var cleanedTitle = self.cleanTitle(product.title, product.gender, product.width);
            var cleanedHandle = self.cleanHandle(cleanedTitle);

            var tags = ['Brooks', product.model];
            if (product.gender) tags.push(product.gender.replace("'s", ''));
            if (product.width) tags.push(product.width);
            if (product.category) tags.push(product.category);

            var productType = "Unisex Shoes";
            if (product.gender === "Men's") productType = "Men's Shoes";
            else if (product.gender === "Women's") productType = "Women's Shoes";

            product.variants.forEach(function(variant, idx) {
                var row = {};

                if (idx === 0) {
                    row['Title'] = cleanedTitle;
                    row['URL handle'] = cleanedHandle;
                    row['Description'] = '';
                    row['Vendor'] = 'Brooks';
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
                    row['URL handle'] = cleanedHandle;
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