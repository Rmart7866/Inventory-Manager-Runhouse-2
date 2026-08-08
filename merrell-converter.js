// Merrell Converter - scan / picker / tracker flow.
//
// Reads Merrell's "CatalogUPCs-Merrell At Once.xlsx" export (sheet "UPCs"): one
// row per style / colour / width / size, each stating its own size, width, UPC
// and on-hand quantity.
//
// THIS IS THE SAUCONY FILE FORMAT. Saucony and Merrell are both Wolverine
// brands and their B2B exports come out of the same system: identical sheets
// ("UPCs" and "Styles") and identical columns, down to the "50+" capped
// quantities and the zero-padded "05.0" sizes. So this converter is deliberately
// the Saucony one with the brand-specific facts changed, and if that file's
// shape ever moves, both will move together.
//
// Width comes from the "Dim 2" column: M=Regular, W=Wide, XW=Extra Wide.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var MerrellConverter = {

    // Stable, gendered, width-independent model name from a product title, for
    // matching new colorways to their live siblings. Delegates to the shared
    // parser so the feed side and the catalog side key the index identically.
    identifyProduct: function(title, handle) {
        return (typeof CatalogClient !== 'undefined' && CatalogClient.modelFromTitle)
            ? CatalogClient.modelFromTitle(title, 'Merrell') : null;
    },

    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,

    // Merrell is new to the store: measured 2026-08-08, the shop carries ZERO
    // Merrell products. So there is nothing to map and every colorway is a
    // genuine create. Once products exist and their handles are known, add
    // "MODEL|COLOR|gender" (optionally "|W") entries here the way the Saucony
    // converter does, so a re-scan lands on the live product instead of
    // proposing a duplicate.
    existingHandles: {},

    // Rough shelf categories, only used to order the picker so like sits with
    // like. Anything unmatched falls to Other, which is harmless.
    productCategories: {
        'Hike': ['MOAB', 'CHAM', 'ONTARIO', 'ALVERSTONE', 'ACCENTOR', 'SPEED STRIKE'],
        'Trail Run': ['AGILITY', 'ANTORA', 'NOVA', 'MTL', 'TRAIL GLOVE', 'SPEEDARC', 'RUBATO', 'MORPHLITE'],
        'Work / Tactical': ['TACTICAL', 'JUNGLE MOC', 'WINDOC', 'JUMPSTRIKE', 'VERTEX', 'HYDRO'],
        'Winter': ['COLDPACK', 'THERMO', 'SNOWBOUND', 'SIREN'],
        'Casual / Slide': ['HUT', 'SLIDE', 'MOC', 'ENCORE', 'BAREFOOT']
    },

    getCategory: function(modelName) {
        if (!modelName) return 'Other';
        var upper = modelName.toUpperCase();
        for (var cat in this.productCategories) {
            for (var i = 0; i < this.productCategories[cat].length; i++) {
                if (upper.indexOf(this.productCategories[cat][i]) !== -1) return cat;
            }
        }
        return 'Other';
    },

    formatProductName: function(name) {
        if (!name) return name;
        return name.toLowerCase()
            .replace(/\bgtx\b/gi, 'GTX')
            .replace(/\bwp\b/gi, 'WP')
            .replace(/\bse\b/gi, 'SE')
            .replace(/\b\w/g, function(l) { return l.toUpperCase(); })
            .replace(/\s+(\d+)/g, ' $1');
    },

    formatColorName: function(color) {
        if (!color) return color;
        return color.toLowerCase()
            .split(/[\s\/-]+/)
            .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
            .join(' ');
    },

    getGenderPrefix: function(genderType) {
        if (genderType === 'unisex') return 'Unisex';
        if (genderType === 'women') return "Women's";
        return "Men's";
    },

    // GENDER. Like Saucony's, this export has no gender column, so it is read off
    // the size run. Merrell's runs are cleanly bimodal, measured across all 971
    // style/width combinations in the At Once file:
    //
    //   starts 5.0 (493) or 6.0 (4), tops out at 11.0   ->  women's
    //   starts 7.0 (454),            tops out at 15.0   ->  men's
    //   starts 3.5 (19) or 4.5 (1),  tops out at 15/16  ->  unisex, the SE styles
    //
    // Nothing starts between 6.0 and 7.0, so the thresholds sit in a gap rather
    // than on an edge. Unlike Saucony this reads the TOP of the run as well as
    // the bottom, because Merrell has women's styles starting at 6.0 (the
    // SPEEDARC SURGE BOA) which a bottom-only rule would call men's. The top is
    // the reliable half: a run ending at 11 is a women's run, one ending at 15 is
    // not. Cross-checked against the women's-line names (ALLURE, JELLY, SIREN,
    // ANTORA): 40 of 45 such styles fall on the women's side, and the 5 that do
    // not are models Merrell also builds for men.
    genderFromSizeRun: function(minSize, maxSize) {
        if (!(minSize > 0)) return 'men';
        if (minSize <= 4.5) return 'unisex';        // 3.5 starts, spanning to 15/16
        if (maxSize > 0 && maxSize <= 12.0) return 'women';
        return 'men';
    },

    // One decimal always ("9" -> "9.0"), matching the size labels the rest of the
    // tool writes, so a re-scan still matches variants already on Shopify.
    formatSize: function(n) { return Number(n).toFixed(1); },

    // Unisex is listed in men's numbers and shown as a dual label, women's being
    // men's + 1.5, the same convention the store already uses for Saucony and
    // ASICS unisex products.
    sizeLabel: function(genderType, dim1) {
        var n = parseFloat(dim1);
        if (!(n > 0)) return String(dim1 || '').trim();
        if (genderType === 'unisex') return 'M' + this.formatSize(n) + '/W' + this.formatSize(n + 1.5);
        return this.formatSize(n);
    },

    _num: function(v) {
        var m = /(\d+(?:\.\d+)?)/.exec(String(v == null ? '' : v));
        return m ? m[1] : '';
    },

    // "50+" means "more than 50 available". Treated as 100, the same as Saucony,
    // so the two Wolverine feeds never disagree about what a capped value means.
    // 1,995 of the 12,990 rows in the August export are capped this way.
    _qty: function(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'string' && v.indexOf('+') !== -1) return 100;
        return parseInt(v, 10) || 0;
    },

    getProductHandle: function(productName, colorName, genderType, width) {
        var formattedProduct = this.formatProductName(productName);
        var formattedColor = this.formatColorName(colorName);
        var lookupKey = formattedProduct + '|' + formattedColor + '|' + genderType;

        if (width && this.existingHandles[lookupKey + '|' + width]) {
            return this.existingHandles[lookupKey + '|' + width];
        }
        if (this.existingHandles[lookupKey]) {
            var base = this.existingHandles[lookupKey];
            if (width === 'W')  return base + '-wide';
            if (width === 'XW') return base + '-extra-wide';
            return base;
        }

        var genderSlug = (genderType === 'men' || genderType === 'women') ? genderType + 's' : '';
        var baseHandle = ('merrell-' + (genderSlug ? genderSlug + '-' : '') + formattedProduct + '-' + formattedColor)
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (width === 'W')  return baseHandle + '-wide';
        if (width === 'XW') return baseHandle + '-extra-wide';
        return baseHandle;
    },

    // ========== PARSE THE CATALOG UPCs EXPORT ==========
    // Sheet "UPCs" columns:
    //   Style #, Style, Color Description, NRF Color, SKU Code, UPC Code,
    //   Dim 1 (size), Dim 2 (width), WHSL, MSRP, On Hand, ATP Date/Future pairs
    //
    // WHSL is wholesale cost. It is read past and never stored, never written to
    // a CSV, and never sent to Shopify. Only MSRP (retail, public) is kept, and
    // in the August export MSRP is blank on most rows, so most products will fall
    // back to the brand default price in the review screen.
    parseExcel: function(file) {
        var self = this;
        return file.arrayBuffer().then(function(arrayBuffer) {
            var workbook = XLSX.read(arrayBuffer);
            var name = null;
            for (var i = 0; i < workbook.SheetNames.length; i++) {
                if (/^upcs?$/i.test(workbook.SheetNames[i].trim())) { name = workbook.SheetNames[i]; break; }
            }
            var ws = workbook.Sheets[name || workbook.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            if (!rows.length) throw new Error('Merrell: the file has no rows');

            var H = {};
            (rows[0] || []).forEach(function(h, i) { H[String(h || '').trim().toLowerCase()] = i; });
            var need = ['style #', 'style', 'color description', 'upc code', 'dim 1', 'dim 2', 'on hand'];
            var missing = need.filter(function(k) { return H[k] === undefined; });
            if (missing.length) {
                throw new Error('Merrell: this does not look like a CatalogUPCs export (missing column' +
                    (missing.length > 1 ? 's' : '') + ': ' + missing.join(', ') +
                    '). Export "UPCs" from the At Once catalog, not the Price List, which has no stock.');
            }
            var get = function(r, k) { var i = H[k]; return i === undefined ? '' : (r[i] == null ? '' : r[i]); };

            var byKey = {}, order = [];
            for (var ri = 1; ri < rows.length; ri++) {
                var r = rows[ri];
                if (!r) continue;
                var styleNumber = String(get(r, 'style #')).trim();
                if (!styleNumber || styleNumber.toLowerCase() === 'style #') continue;
                var dim1 = String(get(r, 'dim 1')).trim();
                if (!dim1) continue;
                var width = String(get(r, 'dim 2') || 'M').trim().toUpperCase();
                if (width !== 'M' && width !== 'W' && width !== 'XW') continue;

                var key = styleNumber + '|' + width;
                if (!byKey[key]) {
                    // "MOAB SPEED 2 JELLY - MOUNTAIN/SPEARMINT" -> "MOAB SPEED 2
                    // JELLY". The Style column appends a sometimes truncated
                    // colour; Color Description holds the real one, so the suffix
                    // is dropped rather than parsed.
                    var styleText = String(get(r, 'style')).trim();
                    var productName = styleText.split(' - ')[0].trim() || styleText;
                    byKey[key] = {
                        styleNumber: styleNumber,
                        productName: productName,
                        color: String(get(r, 'color description')).trim(),
                        width: width,
                        msrp: self._num(get(r, 'msrp')),
                        sizes: []
                    };
                    order.push(key);
                }
                byKey[key].sizes.push({
                    dim1: dim1,
                    n: parseFloat(dim1),
                    qty: self._qty(get(r, 'on hand')),
                    upc: String(get(r, 'upc code')).trim()
                });
            }

            // Resolve gender per record from its own size run, then label sizes.
            return order.map(function(k) {
                var rec = byKey[k];
                var nums = rec.sizes.map(function(s) { return s.n; }).filter(function(n) { return n > 0; });
                rec.genderType = self.genderFromSizeRun(
                    nums.length ? Math.min.apply(Math, nums) : 0,
                    nums.length ? Math.max.apply(Math, nums) : 0
                );
                rec.sizes.forEach(function(s) { s.size = self.sizeLabel(rec.genderType, s.dim1); });
                return rec;
            });
        });
    },

    // ========== SCAN FILE ==========
    scanFile: function(file) {
        var self = this;
        return this.parseExcel(file).then(function(records) {
            var productsByModel = new Map();

            records.forEach(function(rec) {
                var productName = rec.productName;
                if (!productName) return;
                var color = rec.color, width = rec.width;
                var genderPrefix = self.getGenderPrefix(rec.genderType);
                var formattedProduct = self.formatProductName(productName);
                var modelUpper = formattedProduct.toUpperCase();
                var widthLabel = width === 'W' ? 'Wide' : width === 'XW' ? 'Extra Wide' : '';
                var widthSuffix = widthLabel ? ' (' + widthLabel + ')' : '';
                var modelKey = genderPrefix + ' ' + modelUpper + widthSuffix;

                var qty = rec.sizes.reduce(function(t, s) { return t + s.qty; }, 0);
                var handle = self.getProductHandle(productName, color, rec.genderType, width);

                if (!productsByModel.has(modelKey)) {
                    productsByModel.set(modelKey, {
                        model: modelUpper,
                        modelKey: modelKey,
                        gender: genderPrefix,
                        genderType: rec.genderType,
                        width: widthLabel,
                        category: self.getCategory(modelUpper),
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
                        title: genderPrefix + ' Merrell ' + formattedProduct + ' - ' + self.formatColorName(color) + (widthLabel ? ' ' + widthLabel : ''),
                        color: color,
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
                    genderType: data.genderType,
                    width: data.width,
                    category: data.category,
                    colorways: Array.from(data.colorways.values()),
                    rowCount: data.totalRows,
                    totalInventory: data.totalInventory
                });
            });

            products.sort(function(a, b) {
                var catOrder = ['Hike', 'Trail Run', 'Work / Tactical', 'Winter', 'Casual / Slide', 'Other'];
                var catComp = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
                if (catComp !== 0) return catComp;
                return a.name.localeCompare(b.name);
            });

            self.scannedProducts = products;
            return products;
        });
    },

    // ========== CONVERT ==========
    convert: function(file) {
        var self = this;
        return this.parseExcel(file).then(function(records) {
            var inventory = [];
            var productVariantData = [];

            // Every SKU in the file, regardless of picker selection, so removal
            // detection compares against the whole feed. Without this, unselected
            // products look "removed" and get zeroed.
            self.allFeedSkus = new Set();

            records.forEach(function(rec) {
                var styleNumber = rec.styleNumber;
                var productName = rec.productName;
                if (!productName) return;
                var color = rec.color, width = rec.width;
                var genderPrefix = self.getGenderPrefix(rec.genderType);
                var formattedProduct = self.formatProductName(productName);
                var modelUpper = formattedProduct.toUpperCase();
                var widthLabel = width === 'W' ? 'Wide' : width === 'XW' ? 'Extra Wide' : '';
                var widthSuffix = widthLabel ? ' (' + widthLabel + ')' : '';
                var modelKey = genderPrefix + ' ' + modelUpper + widthSuffix;

                rec.sizes.forEach(function(s) {
                    self.allFeedSkus.add(String(styleNumber + '-' + s.size.replace(/\//g, '-')).trim().toUpperCase());
                });

                if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) return;

                var handle = self.getProductHandle(productName, color, rec.genderType, width);
                var formattedColor = self.formatColorName(color);
                var productTitle = genderPrefix + ' Merrell ' + formattedProduct + ' - ' + formattedColor + (widthLabel ? ' ' + widthLabel : '');

                for (var s = 0; s < rec.sizes.length; s++) {
                    var sizeInfo = rec.sizes[s];
                    var sku = styleNumber + '-' + sizeInfo.size.replace(/\//g, '-');
                    var barcode = sizeInfo.upc || '';

                    var inventoryRow = {
                        'Handle': handle,
                        'Title': productTitle,
                        'Option1 Name': 'Size',
                        'Option1 Value': sizeInfo.size,
                        'Option2 Name': '',
                        'Option2 Value': '',
                        'Option3 Name': '',
                        'Option3 Value': '',
                        'SKU': sku,
                        'Barcode': barcode,
                        'HS Code': '',
                        'COO': '',
                        'Location': 'Needham',
                        'Bin name': '',
                        'On hand (new)': sizeInfo.qty
                    };

                    inventory.push(inventoryRow);
                    productVariantData.push([inventoryRow, {
                        handle: handle,
                        title: productTitle,
                        gender: genderPrefix,
                        genderType: rec.genderType,
                        model: modelUpper,
                        color: formattedColor,
                        width: widthLabel,
                        category: self.getCategory(modelUpper),
                        sku: sku,
                        size: sizeInfo.size,
                        quantity: sizeInfo.qty,
                        barcode: barcode,
                        // MSRP straight off the feed when the export carries one.
                        // Retail only, never the WHSL column.
                        price: rec.msrp || ''
                    }]);
                }
            });

            self.inventoryData = inventory;
            self.productVariantData = productVariantData;
            return inventory;
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
            csvRows.push([
                row.Handle,
                '"' + (row.Title || '').replace(/"/g, '""') + '"',
                row['Option1 Name'] || 'Size',
                row['Option1 Value'] || '',
                '', '', '', '',
                row.SKU || '',
                row.Barcode || '',
                '', '',
                row.Location || 'Needham',
                '', '', '', '', '', '',
                row['On hand (new)']
            ].join(','));
        });
        return csvRows.join('\n');
    },

    // ========== NEW PRODUCT CSV ==========
    // Same 57-column Shopify product import shape the other converters emit, so
    // the enrichment screen and the Stage 4 create path treat Merrell exactly
    // like every other brand.
    generateNewProductCSV: function(comparison) {
        if (!comparison) return null;
        var self = this;
        var newHandles = new Set();
        (comparison.newProducts || []).forEach(function(p) { newHandles.add(p.handle); });
        (comparison.newColorways || []).forEach(function(c) { newHandles.add(c.handle); });
        if (newHandles.size === 0) return null;
        if (!this.productVariantData || !this.productVariantData.length) return null;

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

        var groups = new Map();
        this.productVariantData.forEach(function(entry) {
            var v = entry[1];
            if (!newHandles.has(v.handle)) return;
            if (!groups.has(v.handle)) {
                groups.set(v.handle, {
                    handle: v.handle, title: v.title, model: v.model, gender: v.gender,
                    genderType: v.genderType, color: v.color, width: v.width,
                    category: v.category, price: v.price, variants: []
                });
            }
            groups.get(v.handle).variants.push({
                size: v.size, sku: v.sku, barcode: v.barcode, quantity: v.quantity
            });
        });
        if (groups.size === 0) return null;

        var csvRows = [];
        groups.forEach(function(product) {
            var gGender = product.genderType === 'women' ? 'Female'
                : product.genderType === 'men' ? 'Male' : 'Unisex';
            var productType = product.gender + ' Shoes';
            var tags = ['Merrell', product.model];
            if (product.genderType !== 'unisex') tags.push(product.gender.replace("'s", ''));
            if (product.category && product.category !== 'Other') tags.push(product.category);
            if (product.width) tags.push(product.width);

            product.variants.forEach(function(variant, idx) {
                var row = {};
                if (idx === 0) {
                    row['Title'] = product.title;
                    row['URL handle'] = product.handle;
                    row['Description'] = '';
                    row['Vendor'] = 'Merrell';
                    row['Product category'] = 'Apparel & Accessories > Shoes';
                    row['Type'] = productType;
                    row['Tags'] = tags.join(', ');
                    row['Published on online store'] = 'FALSE';
                    row['Status'] = 'Draft';
                    row['Option1 name'] = 'Size';
                    row['SEO title'] = product.title;
                    row['SEO description'] = product.title;
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
                row['Price'] = product.price || '';
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

        var lines = [headers.map(function(h) { return '"' + h.replace(/"/g, '""') + '"'; }).join(',')];
        csvRows.forEach(function(row) {
            lines.push(headers.map(function(h) {
                var val = row[h] !== undefined ? String(row[h]) : '';
                return '"' + val.replace(/"/g, '""') + '"';
            }).join(','));
        });
        return lines.join('\n');
    }
};

// node test hook only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) module.exports = MerrellConverter;
