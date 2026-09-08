// newbalance-converter.js, The Run House.
//
// New Balance "Consumer Drop Ship - CDS ASAP" export -> picker products,
// Needham inventory rows, and a new product CSV. Same shape as the Saucony and
// Merrell converters, so main.js, BrandPicker, InventoryTracker and the
// enrichment modal all drive it through the identical interface.
//
// WHAT THE FEED LOOKS LIKE. One row per size, 38 columns, about 165,000 rows
// covering every sport New Balance sells. The columns that matter:
//
//   Style Name / Style Number   model identity
//   Color Name / Color Code     colorway
//   Size                        ZERO PADDED, half sizes carry a trailing 5:
//                               "05" = 5, "045" = 4.5, "105" = 10.5, "11" = 11
//   Alt Size                    THE WIDTH CODE. Not a size. D, B, 2E, 4E, 6E,
//                               2A, M, W, XW
//   UPC/EAN                     the barcode, so NB needs no barcode backfill
//   Quantity Available          Needham stock
//   Gender / Category / Product Type
//
// THE WIDTH TRAP, THE ONE THING TO GET RIGHT. New Balance width codes mean
// different things per gender. D is the MEN'S standard but the WOMEN'S wide.
// B is the WOMEN'S standard but a men's narrow. Measured on the 2026-09-05
// export: Mens D 45%, 2E 41%; Womens B 44%, D 42%. The live catalogue already
// follows this convention, which is how it was confirmed:
//
//   New Balance Womens 880v15 - PEARL GREY (Wide)   sku "W880C15  D  05"
//   New Balance Mens   880v15 - BLACK      (Wide)   sku "M880B15  2E 07"
//
// Both are titled (Wide), and the codes differ because the genders differ.
//
// WHY THE WIDTH GOES IN THE TITLE. worker/src/parsers.js returns skuWidth null
// for NEW_BALANCE, so the cw-group tag reads width from the TITLE marker, not
// the SKU. worker/src/group.js widthClass() is gender blind and maps both D and
// B to "standard", so feeding it a raw NB code would tag every Women's D as
// standard and collapse the wide colorways into the standard swatch row. That
// file is a byte-for-byte port of the Color Swatch original and must not be
// edited here. So this converter resolves the gender dependent code itself and
// emits a plain "(Wide)" / "(Extra Wide)" / "(Narrow)" marker, which parsers.js
// and widthClass() both already read correctly. Standard gets no marker, which
// is the store convention.
//
// SCOPE. The feed is New Balance's whole catalogue: baseball, tennis, soccer,
// basketball, lacrosse. The shop carries running only (measured 2026-09-05: 343
// active NB products, every one of them 1080, 860, 880, Rebel, More or XC
// Seven). CATEGORIES below is the filter, and kids sizing is excluded for the
// same reason. Widen either if the buy changes.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var NewBalanceConverter = {

    // Stable, gendered, width-independent model name from a product title, for
    // matching new colorways to their live siblings. Delegates to the shared
    // parser so the feed side and the catalog side key the index identically.
    identifyProduct: function(title, handle) {
        return (typeof CatalogClient !== 'undefined' && CatalogClient.modelFromTitle)
            ? CatalogClient.modelFromTitle(title, 'New Balance') : null;
    },

    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    allFeedSkus: null,

    // The categories the shop actually buys. Everything else in the export is a
    // sport we do not carry. Widen this list, do not delete the filter, or the
    // picker fills with 336 styles of cleats and spikes.
    CATEGORIES: ['Running', 'Walking', 'Training'],

    // Adult only. The export carries Boys, Girls, Grade, Pre and Infant blocks
    // whose widths use a different vocabulary (M / W) and which the shop does
    // not stock.
    GENDERS: ['Mens', 'Womens', 'Unisex'],

    // ===== width =====
    // Resolve a New Balance width code to a class, given the gender. This is the
    // gender dependent step described in the header. Returns one of
    // 'standard' | 'wide' | 'xwide' | 'narrow'.
    widthClassFor: function(altSize, gender) {
        var w = String(altSize || '').trim().toUpperCase();
        var g = String(gender || '').trim().toLowerCase();
        if (!w) return 'standard';
        if (g.indexOf('women') === 0) {
            if (w === 'B') return 'standard';
            if (w === 'D') return 'wide';
            if (w === '2E' || w === '4E' || w === 'XW') return 'xwide';
            if (w === '2A' || w === 'A') return 'narrow';
            return 'standard';
        }
        // Mens and Unisex share the men's ladder.
        if (w === 'D' || w === 'M') return 'standard';
        if (w === '2E' || w === 'E' || w === 'EE' || w === 'W') return 'wide';
        if (w === '4E' || w === '6E' || w === 'EEEE' || w === 'XW') return 'xwide';
        if (w === 'B' || w === '2A' || w === 'A') return 'narrow';
        return 'standard';
    },

    // The marker that goes in the title. Standard is deliberately blank: the
    // store never tags or titles a standard width.
    widthLabelFor: function(altSize, gender) {
        var cls = this.widthClassFor(altSize, gender);
        if (cls === 'wide') return 'Wide';
        if (cls === 'xwide') return 'Extra Wide';
        if (cls === 'narrow') return 'Narrow';
        return '';
    },

    // ===== size =====
    // "05" -> "5", "045" -> "4.5", "105" -> "10.5", "11" -> "11", "13" -> "13".
    // The whole part is always two zero padded digits and a trailing 5 marks a
    // half size, so length is the only signal needed.
    normalizeSize: function(raw) {
        var s = String(raw == null ? '' : raw).trim();
        if (!s) return '';
        if (!/^\d+$/.test(s)) return s;                 // already "9.5" or a word
        if (s.length <= 2) return String(parseInt(s, 10));
        var whole = parseInt(s.slice(0, s.length - 1), 10);
        var half = s.slice(-1) === '5';
        return half ? (whole + '.5') : String(parseInt(s, 10));
    },

    // ===== naming =====
    genderPrefix: function(gender) {
        var g = String(gender || '').trim().toLowerCase();
        if (g.indexOf('women') === 0) return 'Womens';
        if (g.indexOf('men') === 0) return 'Mens';
        if (g.indexOf('unisex') === 0) return 'Unisex';
        return '';
    },

    // Title case a feed model name but keep version tokens intact, so
    // "FRESH FOAM X 1080v14" does not become "1080V14".
    formatModelName: function(name) {
        return String(name || '').trim().replace(/\s+/g, ' ')
            .split(' ')
            .map(function(w) {
                if (/^\d+[a-z]\d+$/i.test(w)) return w.toLowerCase().replace(/^(\d+)v(\d+)$/i, '$1v$2');
                if (/^[A-Z0-9]{2,}$/.test(w) && /\d/.test(w)) return w;   // 1080, 880v15
                return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            })
            .join(' ');
    },

    formatColorName: function(color) {
        return String(color || '').trim().replace(/\s+/g, ' ').toUpperCase();
    },

    slug: function(s) {
        return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    },

    // Matches the handles the tool already writes for New Balance, for example
    // mens-880v15-black-wide and womens-880v15-pearl-grey-wide.
    buildHandle: function(model, color, gender, widthLabel) {
        var parts = [this.slug(this.genderPrefix(gender)), this.slug(model), this.slug(color)];
        if (widthLabel) parts.push(this.slug(widthLabel));
        return parts.filter(Boolean).join('-');
    },

    buildTitle: function(model, color, gender, widthLabel) {
        var t = 'New Balance ' + this.genderPrefix(gender) + ' ' + model + ' - ' + this.formatColorName(color);
        return widthLabel ? (t + ' (' + widthLabel + ')') : t;
    },

    // ===== parse =====
    // Collapse the row-per-size export into one record per colorway+width, which
    // is what a Shopify product is.
    //
    // PARSED ONCE PER FILE, ON PURPOSE. The CDS export is about 25 MB and
    // 165,000 rows, and XLSX.read is the expensive part: measured 10.5s in node,
    // meaningfully longer in a browser, and it blocks the main thread the whole
    // time so the page cannot even repaint. scanFile (for the picker) and
    // convert (for the inventory rows) both need the same records, so without
    // this cache staff pay that freeze twice and the tool looks hung. Keyed on
    // name + size + lastModified so a genuinely different drop still reparses.
    _parseCache: null,

    parseExcel: function(file) {
        var self = this;
        // cacheKey, not key: the row loop below declares its own `key` for the
        // colorway grouping and `var` is function scoped, so a shared name would
        // silently store the cache under the last row's grouping key.
        var cacheKey = [file.name, file.size, file.lastModified].join('|');
        if (self._parseCache && self._parseCache.key === cacheKey) {
            return Promise.resolve(self._parseCache.records);
        }
        return file.arrayBuffer().then(function(buf) {
            // Yield one frame before the blocking read. XLSX.read on a 25 MB
            // sheet holds the main thread for tens of seconds and the browser
            // cannot repaint while it runs, so without this the "Scanning file
            // for products..." status never actually appears and the tool looks
            // frozen with no explanation.
            return new Promise(function(resolve) { setTimeout(function() { resolve(buf); }, 0); });
        }).then(function(buf) {
            // dense rows are cheaper to build and to walk for a sheet this tall.
            var wb = XLSX.read(buf, { type: 'array', dense: true });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
            if (!rows.length) throw new Error('New Balance file is empty');

            var head = rows[0].map(function(h) { return String(h == null ? '' : h).trim(); });
            var idx = {};
            head.forEach(function(h, i) { if (h) idx[h.toLowerCase()] = i; });

            function need(name) {
                var i = idx[name.toLowerCase()];
                if (i === undefined) throw new Error('New Balance file is missing the "' + name + '" column. Is this the Consumer Drop Ship CDS export?');
                return i;
            }
            var iStyleName = need('Style Name'), iStyleNum = need('Style Number');
            var iColorName = need('Color Name'), iColorCode = need('Color Code');
            var iSize = need('Size'), iAlt = need('Alt Size'), iUpc = need('UPC/EAN');
            var iQty = need('Quantity Available'), iGender = need('Gender');
            var iType = need('Product Type'), iCat = need('Category');
            var iRetail = idx['retail price'];

            var byKey = new Map();
            var skipped = { type: 0, category: 0, gender: 0 };

            for (var r = 1; r < rows.length; r++) {
                var row = rows[r];
                if (!row || !row.length) continue;

                var ptype = String(row[iType] == null ? '' : row[iType]);
                if (ptype.indexOf('Footwear') === -1) { skipped.type++; continue; }

                var category = String(row[iCat] == null ? '' : row[iCat]).trim();
                if (self.CATEGORIES.indexOf(category) === -1) { skipped.category++; continue; }

                var genderRaw = String(row[iGender] == null ? '' : row[iGender]).trim();
                if (self.GENDERS.indexOf(genderRaw) === -1) { skipped.gender++; continue; }

                var styleName = String(row[iStyleName] == null ? '' : row[iStyleName]).trim();
                if (!styleName) continue;

                var alt = String(row[iAlt] == null ? '' : row[iAlt]).trim();
                var widthLabel = self.widthLabelFor(alt, genderRaw);
                var model = self.formatModelName(styleName);
                var color = String(row[iColorName] == null ? '' : row[iColorName]).trim();
                var size = self.normalizeSize(row[iSize]);
                if (!size) continue;

                var qty = parseInt(row[iQty], 10);
                if (!isFinite(qty) || qty < 0) qty = 0;

                var key = [genderRaw, model, color, widthLabel].join('|');
                if (!byKey.has(key)) {
                    byKey.set(key, {
                        model: model,
                        styleNumber: String(row[iStyleNum] == null ? '' : row[iStyleNum]).trim(),
                        color: color,
                        colorCode: String(row[iColorCode] == null ? '' : row[iColorCode]).trim(),
                        genderRaw: genderRaw,
                        widthLabel: widthLabel,
                        widthCode: alt,
                        category: category,
                        msrp: iRetail !== undefined ? row[iRetail] : '',
                        sizes: []
                    });
                }
                byKey.get(key).sizes.push({
                    size: size,
                    qty: qty,
                    upc: String(row[iUpc] == null ? '' : row[iUpc]).trim(),
                    sku: String(row[idx['sku']] == null ? '' : row[idx['sku']]).trim()
                });
            }

            var records = Array.from(byKey.values());
            records.forEach(function(rec) {
                rec.sizes.sort(function(a, b) { return parseFloat(a.size) - parseFloat(b.size); });
            });
            self._lastSkipped = skipped;
            self._parseCache = { key: cacheKey, records: records };
            return records;
        });
    },

    // ===== scan, for the picker =====
    scanFile: function(file) {
        var self = this;
        return this.parseExcel(file).then(function(records) {
            var byModel = new Map();

            records.forEach(function(rec) {
                var gp = self.genderPrefix(rec.genderRaw);
                var widthSuffix = rec.widthLabel ? ' (' + rec.widthLabel + ')' : '';
                var modelKey = gp + ' ' + rec.model.toUpperCase() + widthSuffix;
                var qty = rec.sizes.reduce(function(t, s) { return t + s.qty; }, 0);
                var handle = self.buildHandle(rec.model, rec.color, rec.genderRaw, rec.widthLabel);

                if (!byModel.has(modelKey)) {
                    byModel.set(modelKey, {
                        model: rec.model.toUpperCase(),
                        modelKey: modelKey,
                        gender: gp,
                        genderType: rec.genderRaw,
                        width: rec.widthLabel,
                        category: rec.category,
                        colorways: new Map(),
                        totalRows: 0,
                        totalInventory: 0
                    });
                }
                var md = byModel.get(modelKey);
                md.totalRows += rec.sizes.length;
                md.totalInventory += qty;

                if (!md.colorways.has(handle)) {
                    md.colorways.set(handle, {
                        handle: handle,
                        title: self.buildTitle(rec.model, rec.color, rec.genderRaw, rec.widthLabel),
                        color: rec.color,
                        rows: 0,
                        inventory: 0
                    });
                }
                var cw = md.colorways.get(handle);
                cw.rows += rec.sizes.length;
                cw.inventory += qty;
            });

            var products = [];
            byModel.forEach(function(d) {
                products.push({
                    name: d.modelKey,
                    model: d.model,
                    gender: d.gender,
                    genderType: d.genderType,
                    width: d.width,
                    category: d.category,
                    colorways: Array.from(d.colorways.values()),
                    rowCount: d.totalRows,
                    totalInventory: d.totalInventory
                });
            });

            products.sort(function(a, b) {
                if (a.category !== b.category) return String(a.category).localeCompare(String(b.category));
                if (a.model !== b.model) return String(a.model).localeCompare(String(b.model));
                return String(a.name).localeCompare(String(b.name));
            });

            self.scannedProducts = products;
            return products;
        });
    },

    // ===== convert, for the inventory write =====
    convert: function(file) {
        var self = this;
        return this.parseExcel(file).then(function(records) {
            var inventory = [];
            var productVariantData = [];
            self.allFeedSkus = new Set();

            records.forEach(function(rec) {
                var gp = self.genderPrefix(rec.genderRaw);
                var widthSuffix = rec.widthLabel ? ' (' + rec.widthLabel + ')' : '';
                var modelKey = gp + ' ' + rec.model.toUpperCase() + widthSuffix;
                var handle = self.buildHandle(rec.model, rec.color, rec.genderRaw, rec.widthLabel);
                var title = self.buildTitle(rec.model, rec.color, rec.genderRaw, rec.widthLabel);

                // allFeedSkus is the WHOLE file, never the picker selection, so a
                // colorway the user did not tick can never be read as removed.
                rec.sizes.forEach(function(s) {
                    if (s.sku) self.allFeedSkus.add(String(s.sku).trim().toUpperCase());
                });

                if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) return;

                rec.sizes.forEach(function(s) {
                    var sku = s.sku || (rec.styleNumber + ' ' + rec.widthCode + ' ' + s.size);
                    var invRow = {
                        'Handle': handle,
                        'Title': title,
                        'Option1 Name': 'Size',
                        'Option1 Value': s.size,
                        'Option2 Name': '',
                        'Option2 Value': '',
                        'Option3 Name': '',
                        'Option3 Value': '',
                        'SKU': sku,
                        'Barcode': s.upc || '',
                        'HS Code': '',
                        'COO': '',
                        'Location': 'Needham',
                        'Bin name': '',
                        'On hand (new)': s.qty
                    };
                    inventory.push(invRow);
                    productVariantData.push([invRow, {
                        handle: handle,
                        title: title,
                        gender: gp,
                        genderType: rec.genderRaw,
                        model: rec.model.toUpperCase(),
                        color: self.formatColorName(rec.color),
                        width: rec.widthLabel,
                        category: rec.category,
                        sku: sku,
                        size: s.size,
                        quantity: s.qty,
                        barcode: s.upc || '',
                        // Retail only, never the wholesale column. The feed is
                        // supplier pricing and must not leak into the store.
                        price: rec.msrp || ''
                    }]);
                });
            });

            self.inventoryData = inventory;
            self.productVariantData = productVariantData;
            return inventory;
        });
    },

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

    // ===== new product CSV =====
    // Only the colorways the tracker calls new, one row per variant.
    //
    // THE HEADER IS NOT COSMETIC. This is the Matrixify column set the other
    // brands emit ("URL handle", "Option1 value", "SKU"), not the legacy Shopify
    // import set ("Handle", "Option1 Value", "Variant SKU"). ProductEnrichment
    // reads BOTH the enrichment pass (applyToCSV) and Stage 4
    // (buildCreateSpecs) off these exact names, and both fail silently on the
    // legacy header: every handle reads as empty, so the review inherits nothing
    // and Create in Shopify reports "Nothing to create". Keep these names in
    // step with merrell-converter.js.
    generateNewProductCSV: function(comparison) {
        if (!comparison) return null;
        if (!this.productVariantData || !this.productVariantData.length) return null;

        // New colorways of a model the store already carries count too, the same
        // as every other brand. Only taking newProducts would leave a new colour
        // of a carried shoe uncreatable.
        var wanted = new Set();
        (comparison.newProducts || []).forEach(function(p) { if (p && p.handle) wanted.add(p.handle); });
        (comparison.newColorways || []).forEach(function(c) { if (c && c.handle) wanted.add(c.handle); });
        if (!wanted.size) return null;

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
        groups.forEach(function(product) {
            // genderPrefix writes Mens / Womens / Unisex, with no apostrophe.
            var isW = product.gender === 'Womens', isM = product.gender === 'Mens';
            var productType = isW ? "Women's Shoes" : isM ? "Men's Shoes" : 'Unisex Shoes';
            var gGender = isW ? 'Female' : isM ? 'Male' : 'Unisex';

            var tags = ['New Balance', product.model];
            if (isW) tags.push('Women');
            else if (isM) tags.push('Men');
            if (product.category && product.category !== 'Other') tags.push(product.category);
            // The plain width word only. The cw-group and width class tags are
            // inherited from a live sibling in applyToCSV, which is the only place
            // that knows what the storefront actually groups on.
            if (product.width) tags.push(product.width);

            product.variants.forEach(function(variant, idx) {
                var row = {};
                if (idx === 0) {
                    row['Title'] = product.title;
                    row['URL handle'] = product.handle;
                    row['Description'] = '';
                    row['Vendor'] = 'New Balance';
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
                // Retail only, never the wholesale column.
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
if (typeof module !== 'undefined' && module.exports) module.exports = NewBalanceConverter;
