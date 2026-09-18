// altra-converter.js, The Run House.
//
// Altra "Fall 26 (US)" ATS export -> picker products, Needham inventory rows,
// and a new product CSV. Same interface as the other converters, so main.js,
// BrandPicker, InventoryTracker and the enrichment modal drive it identically.
//
// WHAT THE FEED LOOKS LIKE. One row per size, 26 columns, about 6,800 rows.
// The columns that matter:
//
//   Style Name / Style Number   model identity. Style Number is the code the
//                               images are named after, "AL0A85UH".
//   Color Name / Color Code     colorway. Color Code is the other half of the
//                               image name, "72C".
//   Size                        PLAIN, not zero padded: "5.5", "6", "10.5".
//                               This is the opposite of New Balance, whose
//                               otherwise identical export writes "045".
//   Alt Size                    THE WIDTH, and only ever MED or WIDE. Altra is
//                               a footshape brand, so there is no D/2E/4E
//                               ladder and none of the gender dependent width
//                               trap the New Balance converter has to carry.
//   UPC/EAN                     the barcode, so Altra needs no backfill
//   Quantity Available          Needham stock, see THE 99+ TRAP below
//   Gender                      see THE GENDER MESS below
//   Category                    Road Running / Trail Running / Hiking
//
// THE 99+ TRAP. Quantity Available is not always a number. 680 of 6,809 rows
// read "99+", which parseInt happily turns into 99 but Number() turns into NaN,
// and a NaN quantity written to Shopify is a zero. It means "at least 99", so
// 99 is the honest floor and that is what is used.
//
// THE GENDER MESS. One export spells gender eight ways: WOMENS, WOMEN'S,
// Women's, MENS, MEN'S, Men's, UNISEX, Adult Unisex. Every one of those has to
// land on the same three buckets or the same shoe splits into several picker
// rows and several handles. normalizeGender is the only place that decides.
//
// SIZES ARE A FOOTSHAPE, NOT A WIDTH CLASS. MED is the standard and carries no
// title marker, WIDE becomes a plain "(Wide)" marker, which is what
// worker/src/parsers.js and group.js widthClass() already read. Same convention
// as the New Balance converter, reached much more simply.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var AltraConverter = {

    identifyProduct: function(title, handle) {
        return (typeof CatalogClient !== 'undefined' && CatalogClient.modelFromTitle)
            ? CatalogClient.modelFromTitle(title, 'Altra') : null;
    },

    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    allFeedSkus: null,

    // The buy is running and hiking footwear. Everything in this export already
    // is footwear, but the category still drives the picker grouping and a tag.
    CATEGORIES: ['Road Running', 'Trail Running', 'Hiking', 'ROAD', 'TRAIL', 'HIKE'],

    // ONE PLACE decides gender, because the feed spells it eight ways.
    normalizeGender: function (raw) {
        var s = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z]/g, '');
        if (s.indexOf('WOMEN') === 0 || s === 'WOMENS' || s === 'W') return 'Womens';
        if (s.indexOf('MEN') === 0 || s === 'MENS' || s === 'M') return 'Mens';
        if (s.indexOf('UNISEX') !== -1 || s.indexOf('ADULTUNISEX') !== -1) return 'Unisex';
        // WOMEN before MEN matters: "WOMENS" contains "MEN".
        if (s.indexOf('WOMEN') !== -1) return 'Womens';
        if (s.indexOf('MEN') !== -1) return 'Mens';
        return '';
    },

    genderPrefix: function (raw) { return this.normalizeGender(raw); },

    // MED is standard and gets no marker, which is the store convention.
    widthLabelFor: function (altSize) {
        var s = String(altSize == null ? '' : altSize).trim().toUpperCase();
        if (s === 'WIDE' || s === 'W') return 'Wide';
        return '';
    },

    // "5.5" -> "5.5", "6" -> "6", "6.0" -> "6". Whole sizes are written without
    // a trailing .0 because that is how the store spells them, and
    // CatalogClient.normalizeSize plus alignInventoryToCatalog rewrite each row
    // to the spelling the live product actually uses before anything reads it.
    normalizeSize: function (raw) {
        if (raw == null || raw === '') return '';
        var n = parseFloat(String(raw).trim());
        if (!isFinite(n) || n <= 0) return '';
        return (n === Math.floor(n)) ? String(n) : String(n);
    },

    // "99+" means at least 99. parseInt gives 99, Number gives NaN, and NaN
    // written to Shopify is a silent zero, so this is not incidental.
    parseQty: function (raw) {
        var s = String(raw == null ? '' : raw).trim();
        if (!s) return 0;
        var n = parseInt(s.replace(/\+$/, ''), 10);
        if (!isFinite(n) || n < 0) return 0;
        return n;
    },

    formatModelName: function (name) {
        var s = String(name == null ? '' : name).trim();
        // The feed prefixes the gender onto the style name, "W TORIN 9" and
        // "M LONE PEAK 9". That is already carried by the gender column, and
        // leaving it in would put "W" in the middle of every title.
        s = s.replace(/^\s*[MW]\s+/i, '');
        s = s.replace(/\s+/g, ' ').trim();
        return s.replace(/\w\S*/g, function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        });
    },

    formatColorName: function (color) {
        var s = String(color == null ? '' : color).trim().replace(/\s*\/\s*/g, '/');
        return s.replace(/\w\S*/g, function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        });
    },

    slug: function (s) {
        return String(s == null ? '' : s).toLowerCase()
            .replace(/['’]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    // The image key, and the thing the whole brand hangs on: Style Number plus
    // Color Code, "AL0A85UH" + "72C". Altra's own storefront names every photo
    // after exactly this, so product-enrichment.js can build the gallery URL
    // without a folder. Keep in step with _imageKeyPatterns.altra.
    colorwayCode: function (styleNumber, colorCode) {
        return (String(styleNumber || '').trim() + String(colorCode || '').trim()).toUpperCase();
    },

    buildHandle: function (model, color, gender, widthLabel, code) {
        var parts = [this.slug(gender), this.slug(model), this.slug(color)];
        if (widthLabel) parts.push(this.slug(widthLabel));
        // The colorway code last, so two colorways sharing a colour NAME can
        // never collide into one handle. New Balance learned this the hard way:
        // keyed on the name, distinct colorways merged and the product came out
        // with every size twice, which Shopify rejects on create.
        if (code) parts.push(this.slug(code));
        return parts.filter(Boolean).join('-');
    },

    buildTitle: function (model, color, gender, widthLabel) {
        var t = 'Altra ' + gender + ' ' + model;
        if (widthLabel) t += ' (' + widthLabel + ')';
        if (color) t += ' - ' + this.formatColorName(color);
        return t;
    },

    _parseCache: null,

    parseExcel: function (file) {
        var self = this;
        var cacheKey = [file.name, file.size, file.lastModified].join('|');
        if (self._parseCache && self._parseCache.key === cacheKey) {
            return Promise.resolve(self._parseCache.records);
        }
        return file.arrayBuffer().then(function (buf) {
            // Yield a frame before the blocking read, so the "Scanning file"
            // status actually paints.
            return new Promise(function (resolve) { setTimeout(function () { resolve(buf); }, 0); });
        }).then(function (buf) {
            var wb = XLSX.read(buf, { type: 'array', dense: true });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
            if (!rows.length) throw new Error('Altra file is empty');

            var head = rows[0].map(function (h) { return String(h == null ? '' : h).trim(); });
            var idx = {};
            head.forEach(function (h, i) { if (h) idx[h.toLowerCase()] = i; });
            function need(name) {
                var i = idx[name.toLowerCase()];
                if (i === undefined) {
                    throw new Error('Altra file is missing the "' + name + '" column. Is this the ATS export?');
                }
                return i;
            }
            var iStyleName = need('Style Name'), iStyleNum = need('Style Number');
            var iColorName = need('Color Name'), iColorCode = need('Color Code');
            var iSize = need('Size'), iAlt = need('Alt Size'), iUpc = need('UPC/EAN');
            var iQty = need('Quantity Available'), iGender = need('Gender');
            var iSku = need('SKU'), iCat = idx['category'], iRetail = idx['retail price'];
            var iDropped = idx['dropped from catalog'];

            var byKey = new Map();
            var skipped = { gender: 0, size: 0, dropped: 0 };

            for (var r = 1; r < rows.length; r++) {
                var row = rows[r];
                if (!row || !row.length) continue;

                // "Dropped from Catalog" is Altra telling us it is gone. Keeping
                // those would offer to create products the brand has retired.
                if (iDropped !== undefined && /^yes$/i.test(String(row[iDropped] == null ? '' : row[iDropped]).trim())) {
                    skipped.dropped++; continue;
                }

                var gender = self.normalizeGender(row[iGender]);
                if (!gender) { skipped.gender++; continue; }

                var styleName = String(row[iStyleName] == null ? '' : row[iStyleName]).trim();
                if (!styleName) continue;

                var size = self.normalizeSize(row[iSize]);
                if (!size) { skipped.size++; continue; }

                var model = self.formatModelName(styleName);
                var color = String(row[iColorName] == null ? '' : row[iColorName]).trim();
                var styleNum = String(row[iStyleNum] == null ? '' : row[iStyleNum]).trim();
                var colorCode = String(row[iColorCode] == null ? '' : row[iColorCode]).trim();
                var code = self.colorwayCode(styleNum, colorCode);
                var alt = String(row[iAlt] == null ? '' : row[iAlt]).trim();
                var widthLabel = self.widthLabelFor(alt);
                var category = iCat !== undefined ? String(row[iCat] == null ? '' : row[iCat]).trim() : '';

                // Key on the COLORWAY CODE and the raw width, never the colour
                // name, for the same reason New Balance does: one colour name
                // can cover several genuinely different colorways, and merging
                // them produces a product with every size twice.
                var key = [gender, model, code || color, alt].join('|');
                if (!byKey.has(key)) {
                    byKey.set(key, {
                        model: model,
                        styleNumber: styleNum,
                        colorCode: colorCode,
                        colorwayCode: code,
                        color: color,
                        gender: gender,
                        widthLabel: widthLabel,
                        widthCode: alt,
                        category: category,
                        msrp: iRetail !== undefined ? row[iRetail] : '',
                        sizes: []
                    });
                }
                byKey.get(key).sizes.push({
                    size: size,
                    qty: self.parseQty(row[iQty]),
                    upc: String(row[iUpc] == null ? '' : row[iUpc]).trim(),
                    sku: String(row[iSku] == null ? '' : row[iSku]).trim()
                });
            }

            var records = Array.from(byKey.values());
            records.forEach(function (rec) {
                rec.sizes.sort(function (a, b) { return parseFloat(a.size) - parseFloat(b.size); });
            });
            self._lastSkipped = skipped;
            self._parseCache = { key: cacheKey, records: records };
            return records;
        });
    },

    scanFile: function (file) {
        var self = this;
        return this.parseExcel(file).then(function (records) {
            var byModel = new Map();

            records.forEach(function (rec) {
                var widthSuffix = rec.widthLabel ? ' (' + rec.widthLabel + ')' : '';
                var modelKey = rec.gender + ' ' + rec.model.toUpperCase() + widthSuffix;
                var qty = rec.sizes.reduce(function (t, s) { return t + s.qty; }, 0);
                var handle = self.buildHandle(rec.model, rec.color, rec.gender, rec.widthLabel, rec.colorwayCode);

                if (!byModel.has(modelKey)) {
                    byModel.set(modelKey, {
                        model: rec.model.toUpperCase(), modelKey: modelKey,
                        gender: rec.gender, genderType: rec.gender,
                        width: rec.widthLabel, category: rec.category,
                        colorways: new Map(), totalRows: 0, totalInventory: 0
                    });
                }
                var md = byModel.get(modelKey);
                md.totalRows += rec.sizes.length;
                md.totalInventory += qty;

                if (!md.colorways.has(handle)) {
                    md.colorways.set(handle, {
                        handle: handle,
                        title: self.buildTitle(rec.model, rec.color, rec.gender, rec.widthLabel),
                        color: rec.color, rows: 0, inventory: 0
                    });
                }
                var cw = md.colorways.get(handle);
                cw.rows += rec.sizes.length;
                cw.inventory += qty;
            });

            var products = [];
            byModel.forEach(function (d) {
                products.push({
                    name: d.modelKey, model: d.model, gender: d.gender, genderType: d.genderType,
                    width: d.width, category: d.category,
                    colorways: Array.from(d.colorways.values()),
                    rowCount: d.totalRows, totalInventory: d.totalInventory
                });
            });
            products.sort(function (a, b) {
                if (a.category !== b.category) return String(a.category).localeCompare(String(b.category));
                if (a.model !== b.model) return String(a.model).localeCompare(String(b.model));
                return String(a.name).localeCompare(String(b.name));
            });
            self.scannedProducts = products;
            return products;
        });
    },

    convert: function (file) {
        var self = this;
        return this.parseExcel(file).then(function (records) {
            var inventory = [];
            var productVariantData = [];
            self.allFeedSkus = new Set();

            records.forEach(function (rec) {
                var widthSuffix = rec.widthLabel ? ' (' + rec.widthLabel + ')' : '';
                var modelKey = rec.gender + ' ' + rec.model.toUpperCase() + widthSuffix;
                var handle = self.buildHandle(rec.model, rec.color, rec.gender, rec.widthLabel, rec.colorwayCode);
                var title = self.buildTitle(rec.model, rec.color, rec.gender, rec.widthLabel);

                // allFeedSkus is the WHOLE file, never the picker selection, so a
                // colorway the user did not tick can never be read as removed.
                rec.sizes.forEach(function (s) {
                    if (s.sku) self.allFeedSkus.add(String(s.sku).trim().toUpperCase());
                });

                if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) return;

                rec.sizes.forEach(function (s) {
                    var sku = s.sku || (rec.colorwayCode + ' ' + rec.widthCode + ' ' + s.size);
                    var invRow = {
                        'Handle': handle, 'Title': title,
                        'Option1 Name': 'Size', 'Option1 Value': s.size,
                        'Option2 Name': '', 'Option2 Value': '', 'Option3 Name': '', 'Option3 Value': '',
                        'SKU': sku, 'Barcode': s.upc || '',
                        'HS Code': '', 'COO': '', 'Location': 'Needham', 'Bin name': '',
                        'On hand (new)': s.qty
                    };
                    inventory.push(invRow);
                    productVariantData.push([invRow, {
                        handle: handle, title: title,
                        gender: rec.gender, genderType: rec.gender,
                        model: rec.model.toUpperCase(),
                        color: self.formatColorName(rec.color),
                        width: rec.widthLabel, category: rec.category,
                        sku: sku, size: s.size, quantity: s.qty, barcode: s.upc || '',
                        // Retail only, never the Wholesale Price column. The feed
                        // carries supplier pricing and it must not reach the store.
                        price: rec.msrp || ''
                    }]);
                });
            });

            self.inventoryData = inventory;
            self.productVariantData = productVariantData;
            return inventory;
        });
    },

    generateInventoryCSV: function () {
        var headers = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
            '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
            '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
            '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
        var csvRows = [headers.join(',')];
        this.inventoryData.forEach(function (row) {
            csvRows.push([
                row.Handle,
                '"' + (row.Title || '').replace(/"/g, '""') + '"',
                row['Option1 Name'] || 'Size', row['Option1 Value'] || '',
                '', '', '', '',
                row.SKU || '', row.Barcode || '', '', '',
                row.Location || 'Needham', '', '', '', '', '', '',
                row['On hand (new)']
            ].join(','));
        });
        return csvRows.join('\n');
    },

    // THE HEADER IS NOT COSMETIC. Matrixify column names, not the legacy Shopify
    // import set. ProductEnrichment reads both the enrichment pass and Stage 4
    // off these exact names and fails silently on the legacy header, reporting
    // "Nothing to create". Keep in step with newbalance-converter.js.
    generateNewProductCSV: function (comparison) {
        if (!comparison) return null;
        if (!this.productVariantData || !this.productVariantData.length) return null;

        var wanted = new Set();
        (comparison.newProducts || []).forEach(function (p) { if (p && p.handle) wanted.add(p.handle); });
        (comparison.newColorways || []).forEach(function (c) { if (c && c.handle) wanted.add(c.handle); });
        if (!wanted.size) return null;

        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status', 'SKU', 'Barcode',
            'Option1 name', 'Option1 value', 'Option1 Linked To',
            'Option2 name', 'Option2 value', 'Option2 Linked To',
            'Option3 name', 'Option3 value', 'Option3 Linked To',
            'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Tax code',
            'Unit price total measure', 'Unit price total measure unit',
            'Unit price base measure', 'Unit price base measure unit',
            'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
            'Weight value (grams)', 'Weight unit for display',
            'Requires shipping', 'Fulfillment service',
            'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
            'Gift card', 'SEO title', 'SEO description',
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
        this.productVariantData.forEach(function (entry) {
            var v = entry[1];
            if (!wanted.has(v.handle)) return;
            if (!groups.has(v.handle)) {
                groups.set(v.handle, {
                    handle: v.handle, title: v.title, model: v.model, gender: v.gender,
                    color: v.color, width: v.width, category: v.category,
                    price: v.price, variants: []
                });
            }
            groups.get(v.handle).variants.push({
                size: v.size, sku: v.sku, barcode: v.barcode, quantity: v.quantity
            });
        });
        if (!groups.size) return null;

        var csvRows = [];
        groups.forEach(function (product) {
            var isW = product.gender === 'Womens', isM = product.gender === 'Mens';
            var productType = isW ? "Women's Shoes" : isM ? "Men's Shoes" : 'Unisex Shoes';
            var gGender = isW ? 'Female' : isM ? 'Male' : 'Unisex';

            var tags = ['Altra', product.model];
            if (isW) tags.push('Women');
            else if (isM) tags.push('Men');
            if (product.category) tags.push(product.category);
            // The plain width word only. cw-group and width class tags are
            // inherited from a live sibling in applyToCSV, the only place that
            // knows what the storefront actually groups on.
            if (product.width) tags.push(product.width);

            product.variants.forEach(function (variant, i) {
                var row = {};
                if (i === 0) {
                    row['Title'] = product.title;
                    row['URL handle'] = product.handle;
                    row['Description'] = '';
                    row['Vendor'] = 'Altra';
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

        var lines = [headers.map(function (h) { return '"' + h.replace(/"/g, '""') + '"'; }).join(',')];
        csvRows.forEach(function (row) {
            lines.push(headers.map(function (h) {
                var val = row[h] !== undefined ? String(row[h]) : '';
                return '"' + val.replace(/"/g, '""') + '"';
            }).join(','));
        });
        return lines.join('\n');
    }
};

// node test hook only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) module.exports = AltraConverter;
