// Puma Converter - Processes B2B Excel/CSV files
// Includes all running shoe categories: Road, Trail, Racing, Track & Field
// Width detection from Style Name: WIDE/2E/4E, gender-aware interpretation
// Men:   WIDE/2E = Wide, 4E = Extra Wide
// Women: WIDE/2E = Extra Wide (women's "wide" maps up one step), 4E = Extra Extra Wide

var PumaConverter = {
    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,
    _rawData: null,

    // ========== EXISTING SHOPIFY HANDLES ==========
    // Maps new unified handle (puma-mens-*) -> existing Shopify handle (mens-*)
    // Existing products were created before the unified format was adopted.
    existingHandles: {
        'puma-mens-deviate-nitro-3-blue-crystal-puma-black': 'mens-deviate-nitro-3-blue-crystal-puma-black',
        'puma-mens-deviate-nitro-3-cool-light-gray-new-navy': 'mens-deviate-nitro-3-cool-light-gray-new-navy',
        'puma-mens-deviate-nitro-3-dusky-gray-heat-fire': 'mens-deviate-nitro-3-dusky-gray-heat-fire',
        'puma-mens-deviate-nitro-3-glowing-red-puma-black': 'mens-deviate-nitro-3-glowing-red-puma-black',
        'puma-mens-deviate-nitro-3-gray-echo-speed-blue': 'mens-deviate-nitro-3-gray-echo-speed-blue',
        'puma-mens-deviate-nitro-3-green-glare-puma-black': 'mens-deviate-nitro-3-green-glare-puma-black',
        'puma-mens-deviate-nitro-3-lapis-lazuli-sunset-glow': 'mens-deviate-nitro-3-lapis-lazuli-sunset-glow',
        'puma-mens-deviate-nitro-3-mint-melt-speed-blue': 'mens-deviate-nitro-3-mint-melt-speed-blue',
        'puma-mens-deviate-nitro-3-peaceful-blue-glowing-red': 'mens-deviate-nitro-3-peaceful-blue-glowing-red',
        'puma-mens-deviate-nitro-3-puma-black': 'mens-deviate-nitro-3-puma-black',
        'puma-mens-deviate-nitro-3-puma-black-dark-amethyst': 'mens-deviate-nitro-3-puma-black-dark-amethyst',
        'puma-mens-deviate-nitro-3-puma-black-puma-white': 'mens-deviate-nitro-3-puma-black-puma-white',
        'puma-mens-deviate-nitro-3-puma-black-sun-stream': 'mens-deviate-nitro-3-puma-black-sun-stream',
        'puma-mens-deviate-nitro-3-puma-white-feather-gray-puma-silver': 'mens-deviate-nitro-3-puma-white-feather-gray-puma-silver',
        'puma-mens-deviate-nitro-3-puma-white-mint-melt': 'mens-deviate-nitro-3-puma-white-mint-melt',
        'puma-mens-deviate-nitro-3-puma-white-speed-blue': 'mens-deviate-nitro-3-puma-white-speed-blue',
        'puma-mens-deviate-nitro-3-pure-magenta-yellow-alert': 'mens-deviate-nitro-3-pure-magenta-yellow-alert',
        'puma-mens-deviate-nitro-3-rose-mauve-new-navy': 'mens-deviate-nitro-3-rose-mauve-new-navy',
        'puma-mens-deviate-nitro-3-yellow-alert-puma-black': 'mens-deviate-nitro-3-yellow-alert-puma-black',
        'puma-mens-deviate-nitro-4-alpine-snow-warm-white': 'mens-deviate-nitro-4-alpine-snow-warm-white',
        'puma-mens-deviate-nitro-4-apple-spritz-lux-lime': 'mens-deviate-nitro-4-apple-spritz-lux-lime',
        'puma-mens-deviate-nitro-4-baltic-sea-blue-fresh-water': 'mens-deviate-nitro-4-baltic-sea-blue-fresh-water',
        'puma-mens-deviate-nitro-4-buttercream-inky-depths': 'mens-deviate-nitro-4-buttercream-inky-depths',
        'puma-mens-deviate-nitro-4-cr-me-de-mint-moody-gray': 'mens-deviate-nitro-4-cr-me-de-mint-moody-gray',
        'puma-mens-deviate-nitro-4-fresh-water-lemon-crush-puma-black-puma-wh': 'mens-deviate-nitro-4-fresh-water-lemon-crush-puma-black-puma-wh',
        'puma-mens-deviate-nitro-4-intense-mint-light-lavender': 'mens-deviate-nitro-4-intense-mint-light-lavender',
        'puma-mens-deviate-nitro-4-jasmine-flower-lucite-almost-apricot': 'mens-deviate-nitro-4-jasmine-flower-lucite-almost-apricot',
        'puma-mens-deviate-nitro-4-light-lavender-inky-depths': 'mens-deviate-nitro-4-light-lavender-inky-depths',
        'puma-mens-deviate-nitro-4-poison-pink-yellow-alert-bright-aqua': 'mens-deviate-nitro-4-poison-pink-yellow-alert-bright-aqua',
        'puma-mens-deviate-nitro-4-puma-black-flat-dark-gray-puma-silver': 'mens-deviate-nitro-4-puma-black-flat-dark-gray-puma-silver',
        'puma-mens-deviate-nitro-4-puma-black-puma-white-puma-silver': 'mens-deviate-nitro-4-puma-black-puma-white-puma-silver',
        'puma-mens-deviate-nitro-4-puma-black-ultra-red': 'mens-deviate-nitro-4-puma-black-ultra-red',
        'puma-mens-deviate-nitro-4-puma-white-apple-spritz-lux-lime': 'mens-deviate-nitro-4-puma-white-apple-spritz-lux-lime',
        'puma-mens-deviate-nitro-4-puma-white-electric-orchid-pure-pink': 'mens-deviate-nitro-4-puma-white-electric-orchid-pure-pink',
        'puma-mens-deviate-nitro-4-puma-white-feather-gray': 'mens-deviate-nitro-4-puma-white-feather-gray',
        'puma-mens-deviate-nitro-4-puma-white-puma-black': 'mens-deviate-nitro-4-puma-white-puma-black',
        'puma-mens-deviate-nitro-4-pure-pink-electric-orchid-deep-plum': 'mens-deviate-nitro-4-pure-pink-electric-orchid-deep-plum',
        'puma-mens-deviate-nitro-4-sandstone-lucite': 'mens-deviate-nitro-4-sandstone-lucite',
        'puma-mens-deviate-nitro-4-slate-sky-moody-gray': 'mens-deviate-nitro-4-slate-sky-moody-gray',
        'puma-mens-deviate-nitro-4-soft-grass-cr-me-de-mint': 'mens-deviate-nitro-4-soft-grass-cr-me-de-mint',
        'puma-mens-deviate-nitro-4-sunny-lime-puma-black': 'mens-deviate-nitro-4-sunny-lime-puma-black',
        'puma-mens-deviate-nitro-4-ultra-red-puma-silver': 'mens-deviate-nitro-4-ultra-red-puma-silver',
        'puma-mens-deviate-nitro-4-vibrant-silver-lux-lime': 'mens-deviate-nitro-4-vibrant-silver-lux-lime',
        'puma-mens-deviate-nitro-4-zen-blue-moody-gray': 'mens-deviate-nitro-4-zen-blue-moody-gray',
        'puma-mens-magmax-cool-weather-blue-crystal': 'mens-magmax-cool-weather-blue-crystal',
        'puma-mens-magmax-dusky-gray-heat-fire': 'mens-magmax-dusky-gray-heat-fire',
        'puma-mens-magmax-green-moon-yellow-alert': 'mens-magmax-green-moon-yellow-alert',
        'puma-mens-magmax-lapis-lazuli-nitro-blue': 'mens-magmax-lapis-lazuli-nitro-blue',
        'puma-mens-magmax-lux-army-warm-white-dusky-gray': 'mens-magmax-lux-army-warm-white-dusky-gray',
        'puma-mens-magmax-nitro-2-chocolate-fondue-puma-black': 'mens-magmax-nitro-2-chocolate-fondue-puma-black',
        'puma-mens-magmax-nitro-2-cr-me-de-mint-moody-gray': 'mens-magmax-nitro-2-cr-me-de-mint-moody-gray',
        'puma-mens-magmax-nitro-2-fresh-water-emerald-ice': 'mens-magmax-nitro-2-fresh-water-emerald-ice',
        'puma-mens-magmax-nitro-2-inky-depths-ultra-red': 'mens-magmax-nitro-2-inky-depths-ultra-red',
        'puma-mens-magmax-nitro-2-puma-black-papaya': 'mens-magmax-nitro-2-puma-black-papaya',
        'puma-mens-magmax-nitro-2-puma-black-puma-white': 'mens-magmax-nitro-2-puma-black-puma-white',
        'puma-mens-magmax-nitro-2-puma-team-royal-vibrant-blue': 'mens-magmax-nitro-2-puma-team-royal-vibrant-blue',
        'puma-mens-magmax-nitro-2-puma-white-silver-mist': 'mens-magmax-nitro-2-puma-white-silver-mist',
        'puma-mens-magmax-nitro-2-rose-latte-jasmine-flower': 'mens-magmax-nitro-2-rose-latte-jasmine-flower',
        'puma-mens-magmax-nitro-2-sunny-lime-puma-silver': 'mens-magmax-nitro-2-sunny-lime-puma-silver',
        'puma-mens-magmax-nitro-2-vibrant-silver-lux-lime': 'mens-magmax-nitro-2-vibrant-silver-lux-lime',
        'puma-mens-magmax-nitro-2-warm-white-puma-black': 'mens-magmax-nitro-2-warm-white-puma-black',
        'puma-mens-magmax-nitro-2-zen-blue-gray-echo': 'mens-magmax-nitro-2-zen-blue-gray-echo',
        'puma-mens-magmax-puma-black-galactic-gray': 'mens-magmax-puma-black-galactic-gray',
        'puma-mens-magmax-puma-black-puma-white': 'mens-magmax-puma-black-puma-white',
        'puma-mens-magmax-puma-black-puma-white-cool-dark-gray': 'mens-magmax-puma-black-puma-white-cool-dark-gray',
        'puma-mens-magmax-puma-team-royal-vibrant-blue': 'mens-magmax-puma-team-royal-vibrant-blue',
        'puma-mens-magmax-puma-white-puma-silver': 'mens-magmax-puma-white-puma-silver',
        'puma-mens-magmax-puma-white-silver-mist': 'mens-magmax-puma-white-silver-mist',
        'puma-mens-magmax-speed-blue-mint-melt': 'mens-magmax-speed-blue-mint-melt',
        'puma-mens-magmax-warm-white-puma-black': 'mens-magmax-warm-white-puma-black',
        'puma-mens-magnify-nitro-3-alpine-snow-desert-dust': 'mens-magnify-nitro-3-alpine-snow-desert-dust',
        'puma-mens-magnify-nitro-3-apple-spritz-lux-lime': 'mens-magnify-nitro-3-apple-spritz-lux-lime',
        'puma-mens-magnify-nitro-3-baltic-sea-blue-puma-black': 'mens-magnify-nitro-3-baltic-sea-blue-puma-black',
        'puma-mens-magnify-nitro-3-green-terrain-heat-fire': 'mens-magnify-nitro-3-green-terrain-heat-fire',
        'puma-mens-magnify-nitro-3-mint-melt-puma-black-speed-blue-fizzy-ligh': 'mens-magnify-nitro-3-mint-melt-puma-black-speed-blue-fizzy-ligh',
        'puma-mens-magnify-nitro-3-puma-black-puma-white': 'mens-magnify-nitro-3-puma-black-puma-white',
        'puma-mens-magnify-nitro-3-puma-black-speed-blue': 'mens-magnify-nitro-3-puma-black-speed-blue',
    },

    // ========== CATEGORY KEYWORDS ==========
    // Order matters: more specific first
    _racingKeywords: [
        'DEVIATE NITRO ELITE', 'FAST-R NITRO ELITE', 'FAST-FWD NITRO ELITE'
    ],
    _trailKeywords: [
        'VOYAGE NITRO', 'FAST-TRAC NITRO'
    ],
    _trackKeywords: [
        'EVOSPEED', 'LONG DISTANCE NITRO', 'MID DISTANCE NITRO',
        'CROSSFOX NITRO', 'HIGH JUMP NITRO', 'BERSERKER NITRO', 'PWR NITRO'
    ],
    _roadKeywords: [
        'VELOCITY NITRO', 'DEVIATE NITRO', 'DEVIATE PURE NITRO',
        'FOREVERRUN NITRO', 'ELECTRIFY NITRO',
        'MAGMAX NITRO', 'MAGNIFY NITRO', 'PROPIO NITRO'
    ],

    // ========== EXCLUDED KEYWORDS ==========
    _excludeKeywords: [
        'TEE', 'SHORT', 'TANK', 'JACKET', 'ZIP', 'HEADBAND', 'PANT', 'HOODIE',
        'ULTRA NITRO 7', 'ALL-PRO NITRO', 'FADE NITRO', 'BMW ', 'MCLAREN',
        'UMBREON', 'PIKACHU', 'UNWIND', 'STELLAR', 'NITROCAT'
    ],

    // ========== CATEGORIZE PRODUCT ==========
    getCategory: function(styleName) {
        if (!styleName) return null;
        var n = styleName.toUpperCase();

        // Exclude non-running
        for (var i = 0; i < this._excludeKeywords.length; i++) {
            if (n.indexOf(this._excludeKeywords[i]) !== -1) return null;
        }

        // Racing (check before road since "DEVIATE NITRO ELITE" contains "DEVIATE NITRO")
        for (var i = 0; i < this._racingKeywords.length; i++) {
            if (n.indexOf(this._racingKeywords[i]) !== -1) return 'Racing';
        }
        // Track & Field
        for (var i = 0; i < this._trackKeywords.length; i++) {
            if (n.indexOf(this._trackKeywords[i]) !== -1) return 'Track & Field';
        }
        // Trail
        for (var i = 0; i < this._trailKeywords.length; i++) {
            if (n.indexOf(this._trailKeywords[i]) !== -1) return 'Trail Running';
        }
        // Road
        for (var i = 0; i < this._roadKeywords.length; i++) {
            if (n.indexOf(this._roadKeywords[i]) !== -1) return 'Road Running';
        }
        return null;
    },

    // ========== FORMAT GENDER ==========
    formatGender: function(gender) {
        if (!gender) return '';
        var g = gender.toString().trim().toUpperCase();
        if (g === 'MENS' || g === 'MEN' || g === 'M') return "Men's";
        if (g === 'WOMENS' || g === 'WOMEN' || g === 'W') return "Women's";
        if (g === 'UNISEX' || g === 'U') return 'Unisex';
        if (g === 'YOUTH' || g === 'KIDS' || g === 'JUNIORS') return 'Youth';
        return '';
    },

    // ========== DETECT WIDTH FROM STYLE NAME (GENDER-AWARE) ==========
    // Men's:   WIDE/2E = Wide, 4E/EXTRA WIDE = Extra Wide
    // Women's: WIDE/2E = Extra Wide (one step up), 4E/EXTRA WIDE = Extra Extra Wide
    detectWidth: function(styleName, isWomen) {
        if (!styleName) return '';
        var n = styleName.toUpperCase();

        var has4E = /\b4E\b/.test(n) || n.indexOf('EXTRA WIDE') !== -1;
        var has2E = /\b2E\b/.test(n);
        var hasWide = /\bWIDE\b/.test(n);

        if (isWomen) {
            if (has4E) return 'Extra Extra Wide';
            if (has2E || hasWide) return 'Extra Wide';
        } else {
            if (has4E) return 'Extra Wide';
            if (has2E || hasWide) return 'Wide';
        }
        return '';
    },

    // ========== WIDTH HANDLE SUFFIX ==========
    widthHandleSuffix: function(widthLabel) {
        switch (widthLabel) {
            case 'Narrow':            return '-narrow';
            case 'Wide':              return '-wide';
            case 'Extra Wide':        return '-extra-wide';
            case 'Extra Extra Wide':  return '-extra-extra-wide';
            default:                  return '';
        }
    },

    // ========== CLEAN MODEL NAME ==========
    // Strip gender prefix, WNS suffix, width tokens, normalize
    cleanModelName: function(styleName) {
        if (!styleName) return '';
        var clean = styleName.trim()
            .replace(/^(MENS|WOMENS|UNISEX|JUNIORS)\s+/i, '')
            .replace(/\s+WN[S]?\s*$/i, '')
            .replace(/\s+WN\s+S\s*$/i, '')
            // Strip width tokens from model name
            .replace(/\s+EXTRA\s+WIDE\s*/gi, '')
            .replace(/\s+WIDE\s*/gi, '')
            .replace(/\s+4E\s*/gi, '')
            .replace(/\s+2E\s*/gi, '')
            .trim();
        return clean.toUpperCase();
    },

    // ========== NORMALIZE MODEL (collapse collabs into base) ==========
    _collabSuffixes: [
        'PUMA X HYROX', '- PUMA X HYROX', 'HYROX AH25', 'HYROX',
        'DIGITOKYO', 'SAYSKY', 'MARATHON SERIES',
        'PSYCHEDELIC RUSH W', 'PSYCHEDELIC RUSH',
        'RADIANT RUN', 'FIREGLOW', 'FIRE', 'CARBON',
        'SUNSET', 'KNIT', 'FADE', 'ULTRAWEAVE',
        'RC', 'ST', 'AT', 'TECH'
    ],

    normalizeModel: function(modelName) {
        if (!modelName) return modelName;
        var n = modelName.trim();
        n = n.replace(/^AMF1\s+/i, '');
        var suffixes = this._collabSuffixes.slice().sort(function(a, b) { return b.length - a.length; });
        for (var i = 0; i < suffixes.length; i++) {
            var re = new RegExp('\\s+' + suffixes[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
            n = n.replace(re, '');
        }
        return n.trim();
    },

    // ========== PARSE EXCEL/CSV ==========
    parseFile: function(file) {
        var self = this;

        return new Promise(function(resolve, reject) {
            if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
                file.arrayBuffer().then(function(arrayBuffer) {
                    var workbook = XLSX.read(arrayBuffer);
                    var worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    var rawData = XLSX.utils.sheet_to_json(worksheet);
                    resolve(rawData);
                }).catch(reject);
            } else {
                file.text().then(function(text) {
                    var parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
                    if (parsed.data.length === 0 || Object.keys(parsed.data[0]).length <= 1) {
                        parsed = Papa.parse(text, { delimiter: '\t', header: true, skipEmptyLines: true, dynamicTyping: true });
                    }
                    resolve(parsed.data);
                }).catch(reject);
            }
        });
    },

    // ========== EXTRACT ROW FIELDS ==========
    getField: function(row, names) {
        for (var i = 0; i < names.length; i++) {
            if (row[names[i]] !== undefined && row[names[i]] !== null) return row[names[i]];
        }
        return '';
    },

    extractRow: function(row) {
        return {
            styleName: this.getField(row, ['Style Name', 'style_name', 'style name']),
            styleNumber: this.getField(row, ['Style Number', 'style_number', 'style number']),
            colorName: this.getField(row, ['Color Name', 'color_name', 'color name']),
            colorCode: this.getField(row, ['Color Code', 'color_code', 'color code']),
            size: this.getField(row, ['Size', 'size']),
            sku: this.getField(row, ['SKU', 'sku']),
            upc: this.getField(row, ['UPC/EAN', 'upc', 'UPC']),
            quantity: this.getField(row, ['Quantity Available', 'quantity_available', 'quantity available']),
            gender: this.getField(row, ['Gender', 'gender']),
            retail: this.getField(row, ['Retail Price', 'retail_price', 'retail price'])
        };
    },

    // ========== SCAN FILE ==========
    scanFile: function(file) {
        var self = this;

        return this.parseFile(file).then(function(rawData) {
            self._rawData = rawData;

            var productsByModel = new Map();

            rawData.forEach(function(row) {
                var fields = self.extractRow(row);
                var category = self.getCategory(fields.styleName);
                if (category === null) return;

                var gender = self.formatGender(fields.gender);
                var isWomen = gender === "Women's";
                var width = self.detectWidth(fields.styleName, isWomen);
                var rawModelName = self.cleanModelName(fields.styleName);
                var modelName = self.normalizeModel(rawModelName);
                var genderPrefix = gender ? (gender + ' ') : '';
                var widthSuffix = width ? ' (' + width + ')' : '';
                var modelKey = genderPrefix + modelName + widthSuffix;

                var qty = parseInt(fields.quantity) || 0;

                var genderSlug = gender === "Men's" ? 'mens' : gender === "Women's" ? 'womens' : 'unisex';
                var colorHandle = ('puma-' + genderSlug + '-' + modelName + '-' + (fields.colorName || ''))
                    .toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                if (width) colorHandle += self.widthHandleSuffix(width);
                if (self.existingHandles[colorHandle]) colorHandle = self.existingHandles[colorHandle];

                if (!productsByModel.has(modelKey)) {
                    productsByModel.set(modelKey, {
                        model: modelName,
                        modelKey: modelKey,
                        gender: gender,
                        width: width,
                        category: category,
                        colorways: new Map(),
                        totalRows: 0,
                        totalInventory: 0
                    });
                }

                var modelData = productsByModel.get(modelKey);
                modelData.totalRows++;
                modelData.totalInventory += qty;

                if (!modelData.colorways.has(colorHandle)) {
                    modelData.colorways.set(colorHandle, {
                        handle: colorHandle,
                        title: (gender ? gender + ' ' : '') + 'Puma ' + rawModelName + (width ? ' (' + width + ')' : '') + ' - ' + (fields.colorName || ''),
                        color: fields.colorName || '',
                        width: width,
                        rows: 0,
                        inventory: 0
                    });
                }

                var cw = modelData.colorways.get(colorHandle);
                cw.rows++;
                cw.inventory += qty;
            });

            var products = [];
            productsByModel.forEach(function(data) {
                products.push({
                    name: data.modelKey,
                    model: data.model,
                    gender: data.gender,
                    width: data.width,
                    category: data.category,
                    colorways: Array.from(data.colorways.values()),
                    rowCount: data.totalRows,
                    totalInventory: data.totalInventory
                });
            });

            products.sort(function(a, b) {
                var catOrder = ['Road Running', 'Trail Running', 'Racing', 'Track & Field', 'Other'];
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

        return this.parseFile(file).then(function(rawData) {
            var inventory = [];
            var productVariantData = [];
            var processedVariants = new Map();

            rawData.forEach(function(row) {
                var fields = self.extractRow(row);
                var category = self.getCategory(fields.styleName);
                if (category === null) return;

                var gender = self.formatGender(fields.gender);
                var isWomen = gender === "Women's";
                var width = self.detectWidth(fields.styleName, isWomen);
                var rawModelName = self.cleanModelName(fields.styleName);
                var modelName = self.normalizeModel(rawModelName);
                var genderPrefix = gender ? (gender + ' ') : '';
                var widthSuffix = width ? ' (' + width + ')' : '';
                var modelKey = genderPrefix + modelName + widthSuffix;

                // Filter by picker selection (uses model key including width)
                if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) return;

                var qty = parseInt(fields.quantity) || 0;
                var size = fields.size ? fields.size.toString().trim() : '';
                var color = (fields.colorName || '').trim();

                // Deduplicate by raw model+color+size+width
                var variantKey = genderPrefix + rawModelName + '|' + color + '|' + size + '|' + width;
                if (processedVariants.has(variantKey)) {
                    processedVariants.get(variantKey).quantity += qty;
                    return;
                }

                // Handle: raw model name + color + width suffix
                var genderSlug = gender === "Men's" ? 'mens' : gender === "Women's" ? 'womens' : 'unisex';
                var handle = ('puma-' + genderSlug + '-' + modelName + '-' + color)
                    .toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                if (width) handle += self.widthHandleSuffix(width);
                if (self.existingHandles[handle]) handle = self.existingHandles[handle];

                var widthDisplay = width ? ' (' + width + ')' : '';
                var title = (gender ? gender + ' ' : '') + 'Puma ' + rawModelName + widthDisplay + ' - ' + color;
                var sku = fields.sku || (fields.styleNumber + '-' + fields.colorCode + '-' + size);

                var variant = {
                    handle: handle,
                    title: title,
                    gender: gender,
                    model: modelName,
                    color: color,
                    width: width,
                    category: category,
                    size: size,
                    sku: sku,
                    barcode: (fields.upc || '').toString(),
                    quantity: qty
                };

                processedVariants.set(variantKey, variant);
            });

            // Sort and build inventory
            var sorted = Array.from(processedVariants.values()).sort(function(a, b) {
                if (a.model !== b.model) return a.model.localeCompare(b.model);
                if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
                if (a.width !== b.width) return (a.width || '').localeCompare(b.width || '');
                if (a.color !== b.color) return a.color.localeCompare(b.color);
                return (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
            });

            sorted.forEach(function(v) {
                var inventoryRow = {
                    'Handle': v.handle,
                    'Title': v.title,
                    'Option1 Name': 'Size',
                    'Option1 Value': v.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    'SKU': v.sku,
                    'Barcode': v.barcode,
                    'HS Code': '',
                    'COO': '',
                    'Location': 'Needham',
                    'Bin name': '',
                    'On hand (new)': v.quantity
                };

                inventory.push(inventoryRow);
                productVariantData.push([inventoryRow, v]);
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
                '', '',
                row.Location || 'Needham',
                '', '', '', '', '', '',
                row['On hand (new)'] || '0'
            ];
            csvRows.push(csvRow.join(','));
        });

        return csvRows.join('\n');
    },

    // ========== CLEAN TITLE / HANDLE (for product CSV) ==========
    cleanTitle: function(title) {
        return title || '';
    },

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
            var v = entry[1];
            if (!newHandles.has(v.handle)) return;

            if (!productGroups.has(v.handle)) {
                productGroups.set(v.handle, {
                    handle: v.handle,
                    title: v.title,
                    model: v.model,
                    gender: v.gender,
                    color: v.color,
                    width: v.width,
                    category: v.category,
                    variants: []
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
            if (product.gender === "Men's") gGender = 'Male';
            else if (product.gender === "Women's") gGender = 'Female';

            var cleanedTitle = self.cleanTitle(product.title);
            var cleanedHandle = product.handle;

            var tags = ['Puma', product.model];
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
                    row['Vendor'] = 'Puma';
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