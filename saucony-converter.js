// Saucony Converter - scan / picker / tracker flow.
//
// Reads Saucony's "CatalogUPCs-<season>.xlsx" At-Once catalog export (sheet
// "UPCs"): one row per style / colour / width / size, each stating its own size,
// width, UPC, MSRP and on-hand quantity.
//
// This REPLACED the old "Needham Demo Inventory" ATS export, which was a wide
// grid whose size columns meant different things per gender, forcing the parser
// to infer sizes from column position. It inferred them wrongly for unisex, by
// 3.5 sizes. Nothing here is positional any more. See parseExcel.
//
// Width comes from the "Dim 2" column: M=Regular, W=Wide, XW=Extra Wide.


var SauconyConverter = {

    // Stable, gendered, width-independent model name from a product title, for
    // matching new colorways to their live siblings (Stage 2 content inheritance).
    // Delegates to the shared parser so the feed side and the catalog side key the
    // inheritance index identically.
    identifyProduct: function(title, handle) {
        return (typeof CatalogClient !== 'undefined' && CatalogClient.modelFromTitle)
            ? CatalogClient.modelFromTitle(title, 'Saucony') : null;
    },

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
        'Endorphin Elite 2|Shock Black|unisex': 'endorphin-elite-2-shock-black',
        'Endorphin Elite 2|White Mutant|unisex': 'endorphin-elite-2-white-mutant',
        'Endorphin Elite 2|White Peel|unisex': 'endorphin-elite-2-white-peel',
        'Endorphin Speed 5|Black Vo2|men': 'endorphin-speed-5-black-vo2-men',
        'Endorphin Speed 5|Black White|men': 'endorphin-speed-5-black-white-men',
        'Endorphin Speed 5|Black White|women': 'endorphin-speed-5-black-white-women',
        'Endorphin Speed 5|Carbon Iceberg|men': 'endorphin-speed-5-carbon-iceberg-men',
        'Endorphin Speed 5|Citron Lapis|men': 'endorphin-speed-5-citron-lapis-men',
        'Endorphin Speed 5|Coral Salmon|women': 'endorphin-speed-5-coral-salmon-women',
        'Endorphin Speed 5|Ice Melt|women': 'endorphin-speed-5-ice-melt-women',
        'Endorphin Speed 5|White Crocus|women': 'endorphin-speed-5-white-crocus-women',
        'Endorphin Speed 5|White Gum|men': 'endorphin-speed-5-white-gum-men',
        'Endorphin Speed 5|White Gum|women': 'endorphin-speed-5-white-gum-women',
        'Endorphin Speed 5|White Mutant|women': 'endorphin-speed-5-white-mutant-women',
        // These six live on Shopify under a "<gender>-saucony-<model>-<colour>"
        // handle, which getProductHandle does not generate (it builds
        // "saucony-<gender>s-..."). Without the mapping the feed treats them as
        // new and would create a SECOND product for a colourway already live.
        // Verified against the live catalogue: each of these handles exists and
        // the generated one does not.
        'Endorphin Pro 5|White Multi|women': 'womens-saucony-endorphin-pro-5-white-multi',
        'Endorphin Pro 5|White Tranquil|men': 'mens-saucony-endorphin-pro-5-white-tranquil',
        'Endorphin Speed 5|Ivory Maroon|women': 'womens-saucony-endorphin-speed-5-ivory-maroon',
        'Endorphin Speed 5|White Fuego|men': 'mens-saucony-endorphin-speed-5-white-fuego',
        'Endorphin Speed 5|White Multi|men': 'mens-saucony-endorphin-speed-5-white-multi',
        'Endorphin Speed 5|White Spa|women': 'womens-saucony-endorphin-speed-5-white-spa',
        'Guide 19|Birch|women': 'guide-19-birch-women',
        'Guide 19|Black Calm|women': 'guide-19-black-calm-women',
        'Guide 19|Black Silver|men': 'guide-19-black-silver-men',
        'Guide 19|Black Silver|men|W': 'guide-19-black-silver-men-wide',
        'Guide 19|Black Silver|men|XW': 'guide-19-black-silver-men-extra-wide',
        'Guide 19|Black Silver|women': 'guide-19-black-silver-women',
        'Guide 19|Black Silver|women|W': 'guide-19-black-silver-women-wide',
        'Guide 19|Black Silver|women|XW': 'guide-19-black-silver-women-extra-wide',
        'Guide 19|Celestial|women': 'guide-19-celestial-women',
        'Guide 19|Celestial|women|W': 'guide-19-celestial-women-wide',
        'Guide 19|Cobalt Navy|men': 'guide-19-cobalt-navy-men',
        'Guide 19|Crimson Fire|men': 'guide-19-crimson-fire-men',
        'Guide 19|Fossil Carbon|men': 'guide-19-fossil-carbon-men',
        'Guide 19|Fossil Navy|men': 'guide-19-fossil-navy-men',
        'Guide 19|Fossil Navy|men|W': 'guide-19-fossil-navy-men-wide',
        'Guide 19|Fossil Navy|men|XW': 'guide-19-fossil-navy-men-extra-wide',
        'Guide 19|Fossil Shadow|men': 'guide-19-fossil-shadow-men',
        'Guide 19|Fossil Shadow|men|W': 'guide-19-fossil-shadow-men-wide',
        'Guide 19|Haze White|women': 'guide-19-haze-white-women',
        'Guide 19|Navy Royal|men': 'guide-19-navy-royal-men',
        'Guide 19|Navy Royal|men|W': 'guide-19-navy-royal-men-wide',
        'Guide 19|Sage Gum|men': 'guide-19-sage-gum-men',
        'Guide 19|Sail Orchid|women': 'guide-19-sail-orchid-women',
        'Guide 19|Sail Orchid|women|W': 'guide-19-sail-orchid-women-wide',
        'Guide 19|Triple Black|men': 'guide-19-triple-black-men',
        'Guide 19|Triple Black|men|W': 'guide-19-triple-black-men-wide',
        'Guide 19|Triple Black|women': 'guide-19-triple-black-women',
        'Guide 19|Triple Black|women|W': 'guide-19-triple-black-women-wide',
        'Guide 19|White Hush|women': 'guide-19-white-hush-women',
        'Guide 19|White Hush|women|W': 'guide-19-white-hush-women-wide',
        'Guide 19|White Shadow|men': 'guide-19-white-shadow-men',
        'Guide 19|White Shadow|men|W': 'guide-19-white-shadow-men-wide',
        'Guide 19|White Storm|women': 'guide-19-white-storm-women',
        'Guide 19|White Storm|women|W': 'guide-19-white-storm-women-wide',
        'Ride 19|Black Pewter|men': 'ride-19-black-pewter-men',
        'Ride 19|Black Pewter|men|W': 'ride-19-black-pewter-men-wide',
        'Ride 19|Black Silver|men': 'ride-19-black-silver-men',
        'Ride 19|Black Silver|men|W': 'ride-19-black-silver-men-wide',
        'Ride 19|Black Silver|women': 'ride-19-black-silver-women',
        'Ride 19|Black Silver|women|W': 'ride-19-black-silver-women-wide',
        'Ride 19|Cloud Aqua|women': 'ride-19-cloud-aqua-women',
        'Ride 19|Cobalt Slime|men': 'ride-19-cobalt-slime',
        'Ride 19|Fire Orchid|women': 'ride-19-fire-orchid-women',
        'Ride 19|Flint Shadow|men': 'ride-19-flint-shadow-men',
        'Ride 19|Flint Shadow|men|W': 'ride-19-flint-shadow-men-wide',
        'Ride 19|Hush|women': 'ride-19-hush-women',
        'Ride 19|Ivory Gum|women': 'ride-19-ivory-gum-women',
        'Ride 19|Ivory Gum|women|W': 'ride-19-ivory-gum-women-wide',
        'Ride 19|Ivory Storm|men': 'ride-19-ivory-storm-men',
        'Ride 19|Ivory Storm|men|W': 'ride-19-ivory-storm-men-wide',
        'Ride 19|Mist Cameo|women': 'ride-19-mist-cameo-women',
        'Ride 19|Mist Cameo|women|W': 'ride-19-mist-cameo-women-wide',
        'Ride 19|Navy Aqua|women': 'ride-19-navy-aqua-women',
        'Ride 19|Navy Aqua|women|W': 'ride-19-navy-aqua-women-wide',
        'Ride 19|Navy Gum|men': 'ride-19-navy-gum-men',
        'Ride 19|Navy Gum|men|W': 'ride-19-navy-gum-men-wide',
        'Ride 19|Shadow Black|men': 'ride-19-shadow-black-men',
        'Ride 19|Triple Black|men': 'ride-19-triple-black-men',
        'Ride 19|Triple Black|men|W': 'ride-19-triple-black-men-wide',
        'Ride 19|Vanilla Mauve|women': 'ride-19-vanilla-mauve-women',
        'Ride 19|Vanilla Mauve|women|W': 'ride-19-vanilla-mauve-women-wide',
        'Ride 19|White Black|men': 'ride-19-white-black-men',
        'Ride 19|White Sage|men': 'ride-19-white-sage-men',
        'Ride 19|White Silk|women': 'ride-19-white-silk',
        'Ride 19|White Silk|women|W': 'ride-19-white-silk-women-wide',
        'Ride 19|White Splash|women': 'ride-19-white-splash-women',
        'Triumph 23 GTX|Shadow Aloe|women': 'triumph-23-gtx-shadow-aloe-women',
        'Triumph 23|Arctic White|women': 'triumph-23-arctic-white-women',
        'Triumph 23|Aster|women': 'triumph-23-aster-women',
        'Triumph 23|Black White|men': 'triumph-23-black-white-men',
        'Triumph 23|Black White|men|W': 'triumph-23-black-white-men-wide',
        'Triumph 23|Black White|women': 'triumph-23-black-white-women',
        'Triumph 23|Black White|women|W': 'triumph-23-black-white-women-wide',
        'Triumph 23|Cameo Quartz|women': 'triumph-23-cameo-quartz-women',
        'Triumph 23|Grey Shadow|men': 'triumph-23-grey-shadow-men',
        'Triumph 23|Grey Shadow|men|W': 'triumph-23-grey-shadow-men-wide',
        'Triumph 23|Iceberg Aloe|women': 'triumph-23-iceberg-aloe-women',
        'Triumph 23|Iceburg Carbon|men': 'triumph-23-iceburg-carbon-men',
        'Triumph 23|Iceburg Carbon|men|W': 'triumph-23-iceburg-carbon-men-wide',
        'Triumph 23|Lapis Silver|men': 'triumph-23-lapis-silver-men',
        'Triumph 23|Lapis Silver|men|W': 'triumph-23-lapis-silver-men-wide',
        'Triumph 23|Navy Cameo|women': 'triumph-23-navy-cameo-women',
        'Triumph 23|Navy Red|men': 'triumph-23-navy-red-men',
        'Triumph 23|Quartz Gum|men': 'triumph-23-quartz-gum-men',
        'Triumph 23|Shadow Vizi|men': 'triumph-23-shadow-vizi-men',
        'Triumph 23|Vapor Arctic|women': 'triumph-23-vapor-arctic-women',
        'Triumph 23|Vapor Arctic|women|W': 'triumph-23-vapor-arctic-women-wide',
        'Triumph 23|White Arctic|women': 'triumph-23-white-arctic-women',
        'Triumph 23|White Arctic|women|W': 'triumph-23-white-arctic-women-wide',
        'Triumph 23|White Azurite|men': 'triumph-23-white-azurite-men',
        'Triumph 23|White Cloud|men': 'triumph-23-white-cloud-men',
        'Triumph 23|White Wistful|women': 'triumph-23-white-wistful-women',
        'Triumph 23|White Wistful|women|W': 'triumph-23-white-wistful-women-wide',
        'Endorphin Azura|Black Aqua|women': 'endorphin-azura-black-aqua-women',
        'Endorphin Azura|Black White|men': 'endorphin-azura-black-white-men',
        'Endorphin Azura|Cobalt Slime|men': 'endorphin-azura-cobalt-slime-men',
        'Endorphin Azura|Mauve|women': 'endorphin-azura-mauve-women',
        'Endorphin Azura|Mist Cameo|women': 'endorphin-azura-mist-cameo-women',
        'Endorphin Azura|Silver Black|men': 'endorphin-azura-silver-black-men',
        'Endorphin Azura|Sunrise|women': 'endorphin-azura-sunrise-women',
        'Endorphin Azura|White Celestial|women': 'endorphin-azura-white-celestial-women',
        'Endorphin Azura|White Crimson|men': 'endorphin-azura-white-crimson-men',
        'Endorphin Azura|White Navy|men': 'endorphin-azura-white-navy-men',
        'Endorphin Azura|White Salsa|men': 'endorphin-azura-white-salsa-men',
        'Endorphin Azura|White Splash|women': 'endorphin-azura-white-splash-women',
        'Endorphin Pro 5|Black Shock|women': 'endorphin-pro-5-black-shock-women',
        'Endorphin Pro 5|Black Silver|men': 'endorphin-pro-5-black-silver-men',
        'Endorphin Pro 5|Citron Black|men': 'endorphin-pro-5-citron-black-men',
        'Endorphin Pro 5|Storm Gilded|women': 'endorphin-pro-5-storm-gilded-women',
        'Endorphin Pro 5|White Crimson|men': 'endorphin-pro-5-white-crimson-men',
        'Endorphin Pro 5|White Iolite|women': 'endorphin-pro-5-white-iolite-women',
        'Endorphin Pro 5|White Slime|men': 'endorphin-pro-5-white-slime-men',
        'Endorphin Pro 5|White Splash|women': 'endorphin-pro-5-white-splash-women',
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

    getGenderPrefix: function(genderType) {
        if (genderType === 'unisex') return 'Unisex';
        if (genderType === 'women') return "Women's";
        return "Men's";
    },

    // GENDER. The CatalogUPCs export has no gender column, so it is inferred from
    // the size run, which is an exact discriminator for Saucony: women's start at
    // 5.0, men's at 7.0 (a couple of spike models at 6.0), and unisex at 3.5
    // because unisex is listed in men's numbers and runs lower. Verified against
    // the 199 styles the old Needham Demo Inventory export carries a real gender
    // column for: 89 women's, 106 men's, 4 unisex, ZERO misclassified, and across
    // all 517 style/width combos in the catalog the only minimums that occur are
    // 3.5, 5.0, 6.0, and 7.0. The thresholds sit in those gaps, not on an edge.
    genderFromSizeRun: function(minSize) {
        if (!(minSize > 0)) return 'men';
        if (minSize <= 4.0) return 'unisex';
        if (minSize <= 5.5) return 'women';
        return 'men';
    },

    // One decimal always ("9" -> "9.0"), matching the size labels the tool has
    // always written, so a re-scan still matches variants already on Shopify.
    formatSize: function(n) { return Number(n).toFixed(1); },

    // Unisex is listed in men's numbers and shown as a dual label, women's being
    // men's + 1.5. The store's unisex products carry exactly this form
    // ("M3.5/W5.0" ... "M14.0/W15.5").
    //
    // This is where the old parser was WRONG. It ignored the file's size headers
    // and hardcoded column 9 as "M7.0/W8.5", when column 9 is 3.5. Every unisex
    // size was therefore labelled 3.5 sizes too big. Reading the size off the row
    // instead of guessing it from the column position is what removes that whole
    // class of bug.
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

    // "50+" means "more than 50 available", which the tool has always treated as
    // 100. Keep that, so switching files does not silently change stock levels.
    _qty: function(v) {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'string' && v.indexOf('+') !== -1) return 100;
        return parseInt(v, 10) || 0;
    },

    getProductHandle: function(productName, colorName, genderType, width) {
        var formattedProduct = this.formatProductName(productName);
        var formattedColor = this.formatColorName(colorName);
        var lookupKey = formattedProduct + '|' + formattedColor + '|' + genderType;

        // Check for width-specific override first
        if (width && this.existingHandles[lookupKey + '|' + width]) {
            return this.existingHandles[lookupKey + '|' + width];
        }
        if (this.existingHandles[lookupKey]) {
            var base = this.existingHandles[lookupKey];
            if (width === 'W')  return base + '-wide';
            if (width === 'XW') return base + '-extra-wide';
            return base;
        }

        // New product: generate handle with brand + gender prefix
        var genderSlug = (genderType === 'men' || genderType === 'women') ? genderType + 's' : '';
        var baseHandle = ('saucony-' + (genderSlug ? genderSlug + '-' : '') + formattedProduct + '-' + formattedColor)
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (width === 'W')  return baseHandle + '-wide';
        if (width === 'XW') return baseHandle + '-extra-wide';
        return baseHandle;
    },

    // ========== PARSE THE CATALOG UPCs EXPORT ==========
    // Saucony's "CatalogUPCs-<season>.xlsx", the At-Once catalog. Replaces the old
    // "Needham Demo Inventory" ATS export, which was a wide grid: one row per
    // style/color with a fixed set of size COLUMNS whose real meaning depended on
    // gender, which the parser had to guess. This file is long form, one row per
    // style/color/width/SIZE, and every row states its own size, width, UPC, MSRP
    // and on-hand. Nothing is positional, so nothing is guessed.
    //
    // Verified against the file it replaces: all 190 style/width combos that carry
    // stock in the Needham export are present here, the 16 absent ones are all at
    // zero stock, and 80% of size rows match on quantity exactly (the rest differ
    // by one or two units, the two exports being snapshots at different times).
    // It also adds 318 style/width combos to pick from, and a UPC on every row.
    //
    // Sheet "UPCs" columns:
    //   Style #, Style, Color Description, NRF Color, SKU Code, UPC Code,
    //   Dim 1 (size), Dim 2 (width), WHSL, MSRP, On Hand, ATP Date/Future pairs
    //
    // WHSL is wholesale cost. It is read past and never stored, never written to a
    // CSV, and never sent to Shopify. Only MSRP (retail, public) is kept.
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
            if (!rows.length) throw new Error('Saucony: the file has no rows');

            // Map by header NAME, not position, so a reordered or extended export
            // keeps working.
            var H = {};
            (rows[0] || []).forEach(function(h, i) { H[String(h || '').trim().toLowerCase()] = i; });
            var need = ['style #', 'style', 'color description', 'upc code', 'dim 1', 'dim 2', 'msrp', 'on hand'];
            var missing = need.filter(function(k) { return H[k] === undefined; });
            if (missing.length) {
                throw new Error('Saucony: this does not look like a CatalogUPCs export (missing column' +
                    (missing.length > 1 ? 's' : '') + ': ' + missing.join(', ') + '). Export "UPCs" from the B2B catalog.');
            }
            var get = function(r, k) { var i = H[k]; return i === undefined ? '' : (r[i] == null ? '' : r[i]); };

            // Group into one record per style + width. Sizes accumulate in file
            // order, which is ascending, so the size run stays in a sane order.
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
                    // "TRIUMPH 24 - FOG/ICE MELT" -> "TRIUMPH 24". The Style column
                    // appends a (sometimes truncated) colour; Color Description
                    // holds the real one, so the suffix is dropped rather than
                    // parsed.
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
                rec.genderType = self.genderFromSizeRun(nums.length ? Math.min.apply(Math, nums) : 0);
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
                var color = rec.color;
                var width = rec.width;
                if (!productName) return;

                var genderType = rec.genderType;
                var genderPrefix = self.getGenderPrefix(genderType);
                var formattedProduct = self.formatProductName(productName);
                var modelUpper = formattedProduct.toUpperCase();
                var widthLabel = width === 'W' ? 'Wide' : width === 'XW' ? 'Extra Wide' : '';
                var widthSuffix = widthLabel ? ' (' + widthLabel + ')' : '';
                var modelKey = genderPrefix + ' ' + modelUpper + widthSuffix;

                var qty = rec.sizes.reduce(function(t, s) { return t + s.qty; }, 0);

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
                var color = rec.color;
                var width = rec.width;
                if (!productName) return;

                var genderType = rec.genderType;
                var genderPrefix = self.getGenderPrefix(genderType);
                var formattedProduct = self.formatProductName(productName);
                var modelUpper = formattedProduct.toUpperCase();
                var widthLabel = width === 'W' ? 'Wide' : width === 'XW' ? 'Extra Wide' : '';
                var widthSuffix = widthLabel ? ' (' + widthLabel + ')' : '';
                var modelKey = genderPrefix + ' ' + modelUpper + widthSuffix;

                // Collect the built SKU for every size of this product, before the
                // picker filter, so removal detection sees the whole feed. Matches
                // the exact SKU string built for inventory rows below.
                rec.sizes.forEach(function(s) {
                    self.allFeedSkus.add(String(styleNumber + '-' + s.size.replace(/\//g, '-')).trim().toUpperCase());
                });

                // Filter by picker selection
                if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) return;

                var handle = self.getProductHandle(productName, color, genderType, width);
                var formattedColor = self.formatColorName(color);
                var productTitle = genderPrefix + ' Saucony ' + formattedProduct + ' - ' + formattedColor + (widthLabel ? ' ' + widthLabel : '');

                for (var s = 0; s < rec.sizes.length; s++) {
                    var sizeInfo = rec.sizes[s];
                    var qty = sizeInfo.qty;
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
                        barcode: barcode,
                        // MSRP straight off the feed, so a new product does not
                        // need the brand default price typed in. Retail only,
                        // never the WHSL column.
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
                size: v.size, sku: v.sku, barcode: v.barcode || '', quantity: v.quantity,
                price: v.price || ''
            });
        });
        if (productGroups.size === 0) return null;

        var csvRows = [];
        productGroups.forEach(function(product) {
            var gGender = 'Unisex';
            if (product.genderType === 'men') gGender = 'Male';
            else if (product.genderType === 'women') gGender = 'Female';

            var cleanedTitle = self.cleanTitle(product.title);
            var cleanedHandle = product.handle; // use inventory handle directly — must match Shopify

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
                // MSRP from the catalog feed. Enrichment still overrides it if a
                // price is typed or inherited; this just means the common case
                // needs no typing.
                row['Price'] = variant.price || '';
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