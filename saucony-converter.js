// Saucony Converter - Updated with scan/picker/tracker flow
// Reads B2B Excel files with size columns, handles gender/width/unisex sizing
// Width column 7: M=Regular, W=Wide, XW=Extra Wide


var SauconyConverter = {
    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,
    _rawWorkbook: null,

    // ========== CATEGORY MAPPING ==========
    productCategories: {
        'Daily Training': ['RIDE 19', 'RIDE 18'],
        'Max Cushion': ['TRIUMPH 23', 'TRIUMPH 23 GTX'],
        'Stability': ['GUIDE 18'],
        'Racing / Performance': ['ENDORPHIN ELITE 2', 'ENDORPHIN PRO 4', 'ENDORPHIN SPEED 5']
    },

    // ========== EXISTING SHOPIFY HANDLES ==========
    existingHandles: {
        'Endorphin Elite 2|Citron Black|unisex': 'endorphin-elite-2-citron-black',
        'Endorphin Elite 2|Coral White|unisex': 'endorphin-elite-2-coral-white',
        'Endorphin Elite 2|Fog Cinder|unisex': 'endorphin-elite-2-fog-cinder',
        'Endorphin Elite 2|White Mutant|unisex': 'endorphin-elite-2-white-mutant',
        'Endorphin Elite 2|White Peel|unisex': 'endorphin-elite-2-white-peel',
        'Endorphin Pro 4|Black Vizired|women': 'endorphin-pro-4-black-vizired',
        'Endorphin Pro 4|Cavern Violet|women': 'endorphin-pro-4-cavern-violet',
        'Endorphin Pro 4|Citron Silver|women': 'endorphin-pro-4-citron-silver',
        'Endorphin Pro 4|Coral|women': 'endorphin-pro-4-coral',
        'Endorphin Pro 4|Fog Peel|women': 'endorphin-pro-4-fog-peel',
        'Endorphin Pro 4|Magenta|women': 'endorphin-pro-4-magenta',
        'Endorphin Pro 4|Mirage Citron|women': 'endorphin-pro-4-mirage-citron',
        'Endorphin Pro 4|Mist|women': 'endorphin-pro-4-mist',
        'Endorphin Pro 4|Vizired|women': 'endorphin-pro-4-vizired',
        'Endorphin Pro 4|White Crocus|women': 'endorphin-pro-4-white-crocus',
        'Endorphin Pro 4|White Mutant|women': 'endorphin-pro-4-white-mutant',
        'Endorphin Pro 4|White Shadow|women': 'endorphin-pro-4-white-shadow',
        'Endorphin Pro 4|White Silver|women': 'endorphin-pro-4-white-silver',
        'Endorphin Pro 4|White Violet|women': 'endorphin-pro-4-white-violet',
        'Endorphin Pro 4|Black Vo2|men': 'endorphin-pro-4-black-vo2',
        'Endorphin Pro 4|Cavern Purple|men': 'endorphin-pro-4-cavern-purple',
        'Endorphin Pro 4|Lapis Citron|men': 'endorphin-pro-4-lapis-citron',
        'Endorphin Pro 4|Navy Citron|men': 'endorphin-pro-4-navy-citron',
        'Endorphin Pro 4|Olivine Black|men': 'endorphin-pro-4-olivine-black',
        'Endorphin Pro 4|Pepper Navy|men': 'endorphin-pro-4-pepper-navy',
        'Endorphin Pro 4|Viziorange|men': 'endorphin-pro-4-viziorange',
        'Endorphin Pro 4|White Black|men': 'endorphin-pro-4-white-black',
        'Endorphin Pro 4|White Gold|men': 'endorphin-pro-4-white-gold',
        'Guide 18|Ballad Skydiver|women': 'guide-18-ballad-skydiver',
        'Guide 18|Black White|women': 'guide-18-black-white',
        'Guide 18|Cameo Terra|women': 'guide-18-cameo-terra',
        'Guide 18|Cloud Dream|women': 'guide-18-cloud-dream',
        'Guide 18|Cloud|women': 'guide-18-cloud',
        'Guide 18|Hemlock Bloom|women': 'guide-18-hemlock-bloom',
        'Guide 18|Ivory|women': 'guide-18-ivory',
        'Guide 18|Moon Quail|women': 'guide-18-moon-quail',
        'Guide 18|Navy Apricot|women': 'guide-18-navy-apricot',
        'Guide 18|Navy Orchid|women': 'guide-18-navy-orchid',
        'Guide 18|Oat Quartz|women': 'guide-18-oat-quartz',
        'Guide 18|Peach Sunny|women': 'guide-18-peach-sunny',
        'Guide 18|Triple Black|women': 'guide-18-triple-black',
        'Guide 18|White Fuchsia|women': 'guide-18-white-fuchsia',
        'Guide 18|White Ice Melt|women': 'guide-18-white-ice-melt',
        'Guide 18|White Mist|women': 'guide-18-white-mist',
        'Guide 18|Autumn Amber|men': 'guide-18-autumn-amber',
        'Guide 18|Black Lapis|men': 'guide-18-black-lapis',
        'Guide 18|Bone|men': 'guide-18-bone',
        'Guide 18|Cloud Black|men': 'guide-18-cloud-black',
        'Guide 18|Cloud Citron|men': 'guide-18-cloud-citron',
        'Guide 18|Cloud Olive|men': 'guide-18-cloud-olive',
        'Guide 18|Flint Navy|men': 'guide-18-flint-navy',
        'Guide 18|Fossil Dusk|men': 'guide-18-fossil-dusk',
        'Guide 18|Navy Skydiver|men': 'guide-18-navy-skydiver',
        'Guide 18|Shadow Gum|men': 'guide-18-shadow-gum',
        'Guide 18|Shadow Vizi|men': 'guide-18-shadow-vizi',
        'Guide 18|White Navy|men': 'guide-18-white-navy',
        'Guide 18|White Peel|men': 'guide-18-white-peel',
        'Ride 18|Black Gum|women': 'ride-18-black-gum',
        'Ride 18|Black White|women': 'ride-18-black-white',
        'Ride 18|Cameo Peony|women': 'ride-18-cameo-peony',
        'Ride 18|Cloud Dream|women': 'ride-18-cloud-dream',
        'Ride 18|Cloud Silver|women': 'ride-18-cloud-silver',
        'Ride 18|Fog Void|women': 'ride-18-fog-void',
        'Ride 18|Opal Sunflower|women': 'ride-18-opal-sunflower',
        'Ride 18|Peach Blossom|women': 'ride-18-peach-blossom',
        'Ride 18|Reverie|women': 'ride-18-reverie',
        'Ride 18|Tempest|women': 'ride-18-tempest',
        'Ride 18|Terra Sky|women': 'ride-18-terra-sky',
        'Ride 18|Undyed Grey|women': 'ride-18-undyed-grey',
        'Ride 18|Undyed Meadow|women': 'ride-18-undyed-meadow',
        'Ride 18|Violet Bloom|women': 'ride-18-violet-bloom',
        'Ride 18|White Indigo|women': 'ride-18-white-indigo',
        'Ride 18|White Sky|women': 'ride-18-white-sky',
        'Ride 18|Arctic Barley|men': 'ride-18-arctic-barley',
        'Ride 18|Azurite Peel|men': 'ride-18-azurite-peel',
        'Ride 18|Black Shadow|men': 'ride-18-black-shadow',
        'Ride 18|Black Skydiver|men': 'ride-18-black-skydiver',
        'Ride 18|Cinder Black|men': 'ride-18-cinder-black',
        'Ride 18|Cloud Dusk|men': 'ride-18-cloud-dusk',
        'Ride 18|Flint Slate|men': 'ride-18-flint-slate',
        'Ride 18|Navy|men': 'ride-18-navy',
        'Ride 18|Olive Black|men': 'ride-18-olive-black',
        'Ride 18|Shadow Sage|men': 'ride-18-shadow-sage',
        'Ride 18|Undyed Grey|men': 'ride-18-undyed-grey-men',
        'Ride 18|White Black|men': 'ride-18-white-black',
        'Triumph 23|Cloud Grey|women': 'triumph-23-cloud-grey',
        'Triumph 23|Fog Shadow|women': 'triumph-23-fog-shadow',
        'Triumph 23|Stone Veil|women': 'triumph-23-stone-veil',
        'Triumph 23|White Punch|women': 'triumph-23-white-punch',
        'Triumph 23|Olive Steel|men': 'triumph-23-olive-steel',
        'Triumph 23|Shadow Citron|men': 'triumph-23-shadow-citron',
        'Triumph 23|White Geo|men': 'triumph-23-white-geo',
        'Triumph 23|White Shadow|men': 'triumph-23-white-shadow',
        'Triumph 23 GTX|Sage|men': 'triumph-23-gtx-sage',
        'Triumph 23 GTX|Shadow Black|men': 'triumph-23-gtx-shadow-black',
        'Triumph 23 GTX|Stone Violet|women': 'triumph-23-gtx-stone-violet'
    },

    // ========== HELPERS ==========
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

    getGenderType: function(gender, productName) {
        if (!gender) return 'men';
        var g = gender.toString().toLowerCase();
        if (g.indexOf('unisex') !== -1) return 'unisex';
        if (productName && productName.toLowerCase().indexOf('endorphin elite') !== -1) return 'unisex';
        if (g.indexOf('women') !== -1) return 'women';
        return 'men';
    },

    getGenderPrefix: function(genderType) {
        if (genderType === 'unisex') return 'Unisex';
        if (genderType === 'women') return "Women's";
        return "Men's";
    },

    getSizeColumns: function(genderType) {
        if (genderType === 'unisex') {
            return [
                {col: 9, size: "M7.0/W8.5"}, {col: 10, size: "M7.5/W9.0"}, {col: 11, size: "M8.0/W9.5"},
                {col: 12, size: "M8.5/W10.0"}, {col: 13, size: "M9.0/W10.5"}, {col: 14, size: "M9.5/W11.0"},
                {col: 15, size: "M10.0/W11.5"}, {col: 16, size: "M10.5/W12.0"}, {col: 17, size: "M11.0/W12.5"},
                {col: 18, size: "M11.5/W13.0"}, {col: 19, size: "M12.0/W13.5"}, {col: 20, size: "M12.5/W14.0"},
                {col: 21, size: "M13.0/W14.5"}, {col: 22, size: "M13.5/W15.0"}, {col: 23, size: "M14.0/W15.5"}
            ];
        } else if (genderType === 'women') {
            return [
                {col: 9, size: "5.0"}, {col: 10, size: "5.5"}, {col: 11, size: "6.0"},
                {col: 12, size: "6.5"}, {col: 13, size: "7.0"}, {col: 14, size: "7.5"},
                {col: 15, size: "8.0"}, {col: 16, size: "8.5"}, {col: 17, size: "9.0"},
                {col: 18, size: "9.5"}, {col: 19, size: "10.0"}, {col: 20, size: "10.5"},
                {col: 21, size: "11.0"}, {col: 22, size: "11.5"}, {col: 23, size: "12.0"}
            ];
        } else {
            return [
                {col: 9, size: "7.0"}, {col: 10, size: "7.5"}, {col: 11, size: "8.0"},
                {col: 12, size: "8.5"}, {col: 13, size: "9.0"}, {col: 14, size: "9.5"},
                {col: 15, size: "10.0"}, {col: 16, size: "10.5"}, {col: 17, size: "11.0"},
                {col: 18, size: "11.5"}, {col: 19, size: "12.0"}, {col: 20, size: "12.5"},
                {col: 21, size: "13.0"}, {col: 22, size: "13.5"}, {col: 23, size: "14.0"}
            ];
        }
    },

    getProductHandle: function(productName, colorName, genderType, width) {
        var formattedProduct = this.formatProductName(productName);
        var formattedColor = this.formatColorName(colorName);
        var lookupKey = formattedProduct + '|' + formattedColor + '|' + genderType;

        if (this.existingHandles[lookupKey]) {
            var base = this.existingHandles[lookupKey];
            if (width === 'W')  return base + '-wide';
            if (width === 'XW') return base + '-extra-wide';
            return base;
        }

        // New product: generate handle with gender suffix
        var baseHandle = (formattedProduct + '-' + formattedColor)
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        var withGender = baseHandle;
        if (genderType === 'men' || genderType === 'women') {
            withGender = baseHandle + '-' + genderType;
        }
        if (width === 'W')  return withGender + '-wide';
        if (width === 'XW') return withGender + '-extra-wide';
        return withGender;
    },

    // ========== PARSE EXCEL ==========
    parseExcel: function(file) {
        return file.arrayBuffer().then(function(arrayBuffer) {
            var workbook = XLSX.read(arrayBuffer);
            var ws = workbook.Sheets[workbook.SheetNames[0]];
            var rawData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 1 });
            return rawData.filter(function(row) {
                return row && row[1] && row[1] !== null && row[1] !== '' &&
                    !(row[2] && row[2].toString().toLowerCase().indexOf('product name') !== -1);
            });
        });
    },

    // ========== SCAN FILE ==========
    scanFile: function(file) {
        var self = this;

        return this.parseExcel(file).then(function(rows) {
            var productsByModel = new Map();

            rows.forEach(function(row) {
                var productName = (row[2] || '').toString().trim();
                var color = (row[3] || '').toString().trim();
                var gender = (row[4] || '').toString().trim();
                var width = (row[7] || 'M').toString().trim().toUpperCase();
                if (!productName) return;
                // FIX: accept M, W, and XW
                if (width !== 'M' && width !== 'W' && width !== 'XW') return;

                var genderType = self.getGenderType(gender, productName);
                var genderPrefix = self.getGenderPrefix(genderType);
                var formattedProduct = self.formatProductName(productName);
                var modelUpper = formattedProduct.toUpperCase();
                var widthLabel = width === 'W' ? 'Wide' : width === 'XW' ? 'Extra Wide' : '';
                var widthSuffix = widthLabel ? ' (' + widthLabel + ')' : '';
                var modelKey = genderPrefix + ' ' + modelUpper + widthSuffix;

                // Sum quantities
                var qty = 0;
                for (var c = 9; c < Math.min(24, row.length); c++) {
                    var val = row[c];
                    if (val === null || val === undefined) continue;
                    if (typeof val === 'string' && val.indexOf('+') !== -1) qty += 100;
                    else qty += parseInt(val) || 0;
                }

                var handle = self.getProductHandle(productName, color, genderType, width);

                if (!productsByModel.has(modelKey)) {
                    productsByModel.set(modelKey, {
                        model: modelUpper,
                        modelKey: modelKey,
                        gender: genderPrefix,
                        genderType: genderType,
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
                        title: genderPrefix + ' Saucony ' + formattedProduct + ' - ' + self.formatColorName(color) + (widthLabel ? ' ' + widthLabel : ''),
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
                var catOrder = ['Daily Training', 'Max Cushion', 'Stability', 'Racing / Performance', 'Other'];
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

        return this.parseExcel(file).then(function(rows) {
            var inventory = [];
            var productVariantData = [];

            rows.forEach(function(row) {
                var styleNumber = (row[1] || '').toString().trim();
                var productName = (row[2] || '').toString().trim();
                var color = (row[3] || '').toString().trim();
                var gender = (row[4] || '').toString().trim();
                var width = (row[7] || 'M').toString().trim().toUpperCase();
                if (!productName) return;
                // FIX: accept M, W, and XW
                if (width !== 'M' && width !== 'W' && width !== 'XW') return;

                var genderType = self.getGenderType(gender, productName);
                var genderPrefix = self.getGenderPrefix(genderType);
                var formattedProduct = self.formatProductName(productName);
                var modelUpper = formattedProduct.toUpperCase();
                var widthLabel = width === 'W' ? 'Wide' : width === 'XW' ? 'Extra Wide' : '';
                var widthSuffix = widthLabel ? ' (' + widthLabel + ')' : '';
                var modelKey = genderPrefix + ' ' + modelUpper + widthSuffix;

                // Filter by picker selection
                if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) return;

                var handle = self.getProductHandle(productName, color, genderType, width);
                var formattedColor = self.formatColorName(color);
                var productTitle = genderPrefix + ' Saucony ' + formattedProduct + ' - ' + formattedColor + (widthLabel ? ' ' + widthLabel : '');
                var sizeColumns = self.getSizeColumns(genderType);

                for (var s = 0; s < sizeColumns.length; s++) {
                    var sizeInfo = sizeColumns[s];
                    var val = row[sizeInfo.col];
                    if (val === null || val === undefined) continue;
                    var qty = (typeof val === 'string' && val.indexOf('+') !== -1) ? 100 : (parseInt(val) || 0);
                    var sku = styleNumber + '-' + sizeInfo.size.replace(/\//g, '-');

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
                        'Barcode': '',
                        'HS Code': '',
                        'COO': '',
                        'Location': 'Needham',
                        'Bin name': '',
                        'On hand (new)': qty
                    };

                    inventory.push(inventoryRow);
                    productVariantData.push([inventoryRow, {
                        handle: handle,
                        title: productTitle,
                        gender: genderPrefix,
                        genderType: genderType,
                        model: modelUpper,
                        color: formattedColor,
                        width: widthLabel,
                        category: self.getCategory(modelUpper),
                        sku: sku,
                        size: sizeInfo.size,
                        quantity: qty,
                        barcode: ''
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
                row['Option1 Name'] || 'Size', row['Option1 Value'] || '',
                '', '', '', '',
                row.SKU || '', row.Barcode || '', '', '',
                row.Location || 'Needham', '',
                '', '', '', '', '',
                row['On hand (new)'] || '0'
            ].join(','));
        });
        return csvRows.join('\n');
    },

    // ========== CLEAN TITLE / HANDLE (for NEW product CSV) ==========
    cleanTitle: function(title) {
        if (!title) return title;
        if (title.indexOf('Saucony') === -1) return 'Saucony ' + title;
        return title;
    },

    cleanHandle: function(cleanedTitle) {
        if (!cleanedTitle) return '';
        return cleanedTitle
            .toLowerCase()
            .replace(/['']/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    },

    // ========== GENERATE NEW PRODUCT CSV ==========
    generateNewProductCSV: function(comparison) {
        if (!comparison) return null;
        var self = this;
        var newHandles = new Set();
        if (comparison.newProducts) comparison.newProducts.forEach(function(p) { newHandles.add(p.handle); });
        if (comparison.newColorways) comparison.newColorways.forEach(function(c) { newHandles.add(c.handle); });
        if (newHandles.size === 0) return null;
        if (!this.productVariantData || this.productVariantData.length === 0) return null;

        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status', 'SKU', 'Barcode',
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

        var productGroups = new Map();
        this.productVariantData.forEach(function(entry) {
            var v = entry[1];
            if (!newHandles.has(v.handle)) return;
            if (!productGroups.has(v.handle)) {
                productGroups.set(v.handle, {
                    handle: v.handle, title: v.title, model: v.model,
                    gender: v.gender, genderType: v.genderType,
                    color: v.color, width: v.width, category: v.category, variants: []
                });
            }
            productGroups.get(v.handle).variants.push({
                size: v.size, sku: v.sku, barcode: v.barcode || '', quantity: v.quantity
            });
        });
        if (productGroups.size === 0) return null;

        var csvRows = [];
        productGroups.forEach(function(product) {
            var gGender = 'Unisex';
            if (product.genderType === 'men') gGender = 'Male';
            else if (product.genderType === 'women') gGender = 'Female';

            var cleanedTitle = self.cleanTitle(product.title);
            var cleanedHandle = self.cleanHandle(cleanedTitle);

            var tags = ['Saucony', product.model];
            if (product.genderType !== 'unisex') tags.push(product.gender.replace("'s", ''));
            if (product.width) tags.push(product.width);
            if (product.category) tags.push(product.category);

            var productType = 'Unisex Shoes';
            if (product.genderType === 'men') productType = "Men's Shoes";
            else if (product.genderType === 'women') productType = "Women's Shoes";

            product.variants.forEach(function(variant, idx) {
                var row = {};
                if (idx === 0) {
                    row['Title'] = cleanedTitle;
                    row['URL handle'] = cleanedHandle;
                    row['Description'] = '';
                    row['Vendor'] = 'Saucony';
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