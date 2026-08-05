// on-apparel-converter.js, The Run House.
//
// Reads the ON scraper's apparel CSV and turns it into a Shopify inventory CSV.
// Apparel is a separate page (apparel.html) and a separate converter on purpose:
// the footwear pipeline is footwear-shaped all the way down. /catalog keeps only
// products whose type ends in "shoes", the known set is scoped to dropship
// footwear at Needham, and the grouping vocabulary is width classes and cw-group
// swatch tags. None of that describes a sports bra. Rather than bend those rules
// and risk the live footwear tool, apparel starts in its own lane.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not write to Shopify, and it never
// emits a zero row for something missing from the feed. Apparel is not
// dropshipped yet (the goal is that it will be), so nothing here may decide that
// a garment is discontinued. Removal detection is a footwear doctrine that earns
// its keep because Needham is a known dropship location; apparel has no
// equivalent yet. Download a CSV, review it, import it.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var OnApparelConverter = {

    // ===== The store side, as of 2026-08-05 =====
    //
    // ON apparel already on Shopify, keyed by the ON article code that appears in
    // both the scraper's SKU and the store's handle. This is a SNAPSHOT, the same
    // compromise the footwear converters make with their existingHandles maps,
    // and for the same reason: /catalog cannot see apparel, so there is nothing
    // live to ask. When apparel joins the catalog build this map should be
    // deleted and replaced by a CatalogClient lookup, not maintained by hand.
    //
    // Only 22 of the 57 ON apparel products on the store carry a code at all, and
    // two codes are claimed by two products each, so a match here is a hint worth
    // showing, never something to act on silently.
    STORE_BY_CODE: {
        '1MD10480553': { handle: 'on-weather-vest-black-men-1md10480553', type: 'Vests', status: 'ACTIVE', sizes: ['Small', 'Medium', 'Large', 'X-Large', '2X-Large'] },
        '1ME10030553': { handle: 'on-club-hoodie-men-1me10030553', type: 'Hoodies', status: 'DRAFT', sizes: ['Small', 'Medium', 'Large', 'X-Large', '2X-Large'] },
        '1ME10600561': { handle: 'on-climate-shirt-glacier-men-1me10600561', type: 'Half-Zips', status: 'DRAFT', sizes: ['Small', 'Medium', 'Large', 'X-Large', '2X-Large'] },
        '1ME11460069': { handle: 'on-focus-t-men-1me11460069', type: 'T-Shirts', status: 'ACTIVE', sizes: ['Small', 'Medium', 'Large', 'X-Large', '2X-Large'] },
        '1ME11530553': { handle: 'on-lightweight-shorts-men-1me11530553', type: 'Shorts', status: 'DRAFT', sizes: ['Small', 'Medium', 'Large', 'X-Large', '2X-Large'] },
        '1WD10570553': { handle: 'on-weather-vest-black-women-1wd10570553', type: 'Vests', status: 'ACTIVE', sizes: ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'] },
        '1WE10040553': { handle: 'on-club-hoodie-women-1we10040553', type: 'Hoodies', status: 'DRAFT', sizes: ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'] },
        '1WE10400553': { handle: 'on-performance-flex-bra-black-women-1we10400553', type: 'Sports Bras', status: 'DRAFT', ambiguous: true, sizes: ['X-Small A-C', 'Small A-C', 'Medium A-C', 'Large A-C', 'X-Large A-C', 'X-Small D-DD', 'Small D-DD', 'Medium D-DD'] },
        '1WE10430553': { handle: 'on-active-bra-longline-black-women-1we10430553', type: 'Sports Bras', status: 'DRAFT', sizes: ['X-Small A-C', 'Small A-C', 'Medium A-C', 'Large A-C', 'X-Large A-C'] },
        '1WE10781927': { handle: 'on-climate-shirt-fade-women-1we10781927', type: 'Half-Zips', status: 'ACTIVE', ambiguous: true, sizes: ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'] },
        '1WE10920864': { handle: 'on-core-long-t-w-undyed-white-women-1we10920864', type: 'Long Sleeves', status: 'DRAFT', sizes: ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'] },
        '1WE11060553': { handle: 'on-performance-graphic-bra-women-1we11060553', type: 'Sports Bras', status: 'DRAFT', sizes: ['XS (A-C)', 'XS (D-DD)', 'S (A-C)', 'S (D-DD)', 'M (A-C)', 'M (D-DD)', 'L (A-C)', 'L (D-DD)', 'XL (A-C)', 'XL (D-DD)'] },
        '1WE11821907': { handle: 'on-5-running-shorts-women-1we11821907', type: 'Shorts', status: 'ACTIVE', sizes: ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'] },
        '1WE11860553': { handle: 'on-focus-t-women-1we11860553', type: 'T-Shirts', status: 'DRAFT', sizes: ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'] },
        '1WE11930553': { handle: 'on-performance-tights-w-black-women-1we11930553', type: 'Tights/Leggings', status: 'ACTIVE', sizes: ['X-Small', 'Small', 'Medium', 'Large', 'X-Large'] }
    },

    // ===== The live catalog, when there is one =====
    //
    // The Worker now builds an apparel catalog alongside the footwear one, so the
    // snapshot above is a fallback rather than the source. Hand it the payload
    // from GET /catalog/apparel and every join below uses live data instead:
    // every apparel product, not just the 22 that happened to be mapped by hand,
    // with each product's current sizes, status and type.
    //
    // source() reports which one is in play, so the page can say so rather than
    // leaving staff to guess whether a "not on Shopify" really means that.
    _live: null,
    useLiveCatalog: function (catalog) {
        if (!catalog || !catalog.byCode) { this._live = null; return false; }
        var byCode = {};
        var byHandle = {};
        (catalog.products || []).forEach(function (p) { byHandle[p.handle] = p; });
        Object.keys(catalog.byCode).forEach(function (code) {
            var p = byHandle[catalog.byCode[code]];
            if (!p) return;
            byCode[code] = { handle: p.handle, type: p.productType, status: p.status, sizes: p.sizes || [] };
        });
        // Codes the store claims twice are carried through as ambiguous, so the
        // page keeps flagging them instead of silently picking one.
        (catalog.ambiguousCodes || []).forEach(function (a) {
            var p = byHandle[a.handles[0]];
            if (!p) return;
            byCode[a.code] = { handle: p.handle, type: p.productType, status: p.status, sizes: p.sizes || [], ambiguous: true };
        });
        this._live = { byCode: byCode, generatedAt: catalog.generatedAt, count: (catalog.products || []).length };
        return true;
    },
    source: function () { return this._live ? 'live' : 'snapshot'; },
    _storeFor: function (code) {
        if (!code) return null;
        if (this._live) return this._live.byCode[code] || null;
        return this.STORE_BY_CODE[code] || null;
    },

    // ===== Sizes =====
    //
    // The store spells one size four ways: "X-Small", "XS", "XSmall", and for the
    // top end "2X-Large", "2XLarge", "XLarge". Measured across the 22 mapped
    // apparel products. This is the same disease as the footwear "9" versus "9.0"
    // problem, and the same cure: collapse both sides to one key, then write back
    // whatever spelling that particular product actually uses.
    //
    // Bras add a cup range on top of the band ("Small A-C", "S (D-DD)"), so the
    // key keeps it as a suffix rather than throwing it away, or every cup of a
    // size would collide into one variant.
    normalizeSize: function (raw) {
        var s = String(raw == null ? '' : raw).trim().toUpperCase();
        if (!s) return '';
        if (/^ONE\s*SIZE$/.test(s) || s === 'OS') return 'OS';

        // Pull off a cup range first, in either spelling.
        var cup = '';
        var cm = s.match(/\(?\s*([A-Z])\s*-\s*(DD|[A-Z])\s*\)?\s*$/);
        if (cm && /^(A|B|C|D)$/.test(cm[1])) {
            cup = '|' + cm[1] + '-' + cm[2];
            s = s.slice(0, cm.index).trim();
        }

        s = s.replace(/[\s()-]/g, '');           // XSMALL, 2XLARGE, XS, 2XL
        var m = s.match(/^(\d?)X?(SMALL|MEDIUM|LARGE|S|M|L)$/);
        if (!m) return s + cup;                  // unknown shape, keep it distinct
        var mult = m[1] || (/^\d?X/.test(s) ? '1' : '');
        var word = m[2];
        var base = (word === 'SMALL' || word === 'S') ? 'S' : (word === 'MEDIUM' || word === 'M') ? 'M' : 'L';
        if (base === 'M') return 'M' + cup;      // medium has no X form
        if (!mult) return base + cup;
        return (mult === '1' ? 'X' : mult + 'X') + base + cup;
    },

    // Does this size look like a shoe size? Used to catch a file produced by the
    // pre-fix scraper, see checkFile.
    _isShoeSize: function (s) { return /^\d+(\.\d+)?$/.test(String(s || '').trim()); },

    // The 11-character ON article code, from a SKU or a handle. Footwear is 3xx,
    // apparel is 1xx, so the leading digit also says which pipeline a row belongs
    // to. Returns '' when there is none.
    articleCode: function (s) {
        var m = String(s || '').toUpperCase().match(/[13][WMU][A-Z]\d{6,}/);
        return m ? m[0] : '';
    },

    isApparelCode: function (code) { return /^1/.test(code || ''); },

    // ===== Reading the scraper file =====
    //
    // The scraper writes the same 19-column inventory shape the rest of the tool
    // uses, so this is a straight Papa parse plus grouping by handle.
    parse: function (csvText) {
        var self = this;
        var parsed = Papa.parse(String(csvText || '').trim(), { header: true, skipEmptyLines: true });
        var rows = (parsed.data || []).filter(function (r) { return r && r.Handle && String(r.Handle).trim(); });

        var byHandle = new Map();
        rows.forEach(function (r) {
            var handle = String(r.Handle).trim();
            var sku = String(r.SKU || '').trim();
            var code = self.articleCode(sku) || self.articleCode(handle);
            if (!byHandle.has(handle)) {
                byHandle.set(handle, {
                    feedHandle: handle,
                    title: String(r.Title || '').trim(),
                    color: String(r['Option2 Value'] || '').trim(),
                    code: code,
                    variants: []
                });
            }
            var p = byHandle.get(handle);
            if (!p.code && code) p.code = code;
            p.variants.push({
                size: String(r['Option1 Value'] || '').trim(),
                sku: sku,
                quantity: Math.max(0, parseInt(r['On hand (new)'], 10) || 0)
            });
        });

        var products = [];
        byHandle.forEach(function (p) {
            p.units = p.variants.reduce(function (t, v) { return t + v.quantity; }, 0);
            p.inStock = p.variants.filter(function (v) { return v.quantity > 0; }).length;
            p.store = self._storeFor(p.code);
            p.gender = /1W/.test(p.code) ? "Women's" : /1M/.test(p.code) ? "Men's" : /1U/.test(p.code) ? 'Unisex' : '';
            products.push(p);
        });
        products.sort(function (a, b) { return a.title.localeCompare(b.title); });
        return products;
    },

    // ===== Is this file trustworthy =====
    //
    // The scraper used to invent a 21-slot shoe size ladder whenever it could not
    // read an apparel size header, and pour the real stock onto it positionally.
    // Files from that build look perfectly well formed, so the only way to catch
    // one is by its fingerprint: apparel article codes carrying numeric sizes.
    // Refuse those outright. Importing one would move stock onto sizes the
    // product does not have.
    checkFile: function (products) {
        var self = this;
        var problems = [];
        var apparel = products.filter(function (p) { return self.isApparelCode(p.code); });
        var footwear = products.filter(function (p) { return p.code && !self.isApparelCode(p.code); });

        var shoeSized = apparel.filter(function (p) {
            return p.variants.length && p.variants.every(function (v) { return self._isShoeSize(v.size); });
        });
        if (shoeSized.length) {
            problems.push({
                fatal: true,
                title: shoeSized.length + ' apparel product' + (shoeSized.length === 1 ? '' : 's') + ' carry shoe sizes',
                detail: 'These came out of the old scraper, which invented the size run 5.0 to 15.0 whenever it could not read an apparel size header, then matched the real stock to it by column position. Every quantity in this file sits on a size the product does not have. Re-scrape with the current extension in scrapers/on and upload the new file.',
                sample: shoeSized.slice(0, 6).map(function (p) { return p.title || p.feedHandle; })
            });
        }

        if (footwear.length) {
            problems.push({
                fatal: false,
                title: footwear.length + ' footwear product' + (footwear.length === 1 ? '' : 's') + ' in this file',
                detail: 'Article codes starting with 3 are shoes. They are ignored here; run them through the main Inventory Manager instead.',
                sample: footwear.slice(0, 6).map(function (p) { return p.title || p.feedHandle; })
            });
        }

        var noCode = products.filter(function (p) { return !p.code; });
        if (noCode.length) {
            problems.push({
                fatal: false,
                title: noCode.length + ' product' + (noCode.length === 1 ? '' : 's') + ' have no ON article code',
                detail: 'Without a code there is nothing to join on, so these cannot be matched to a product on Shopify. They are still exported.',
                sample: noCode.slice(0, 6).map(function (p) { return p.title || p.feedHandle; })
            });
        }

        var badHandle = products.filter(function (p) { return /[^a-z0-9-]/.test(p.feedHandle); });
        if (badHandle.length) {
            problems.push({
                fatal: false,
                title: badHandle.length + ' handle' + (badHandle.length === 1 ? '' : 's') + ' are not valid Shopify handles',
                detail: 'A handle may only contain lowercase letters, numbers and hyphens. These carry other characters, which means they came from the old scraper too.',
                sample: badHandle.slice(0, 6).map(function (p) { return p.feedHandle; })
            });
        }

        return problems;
    },

    // ===== Output =====
    //
    // Only apparel rows, and only what the feed actually contains. When a product
    // matched a store record, the row is written with the store's own handle and
    // its own spelling of the size, because a Shopify inventory import matches on
    // handle plus Option1 and a near miss silently does nothing. Unmatched
    // products keep the feed's handle: the import will not find them, which is
    // the correct outcome for something that is not on the store yet.
    buildRows: function (products, opts) {
        var self = this;
        var location = (opts && opts.location) || 'Needham';
        var rows = [];
        products.forEach(function (p) {
            if (!self.isApparelCode(p.code)) return;   // apparel only, footwear has its own tool
            var store = p.store;
            // The store's sizes, keyed the same way, so the feed's spelling can be
            // rewritten to the one that product actually uses.
            var byKey = {};
            if (store) (store.sizes || []).forEach(function (s) { byKey[self.normalizeSize(s)] = s; });

            var first = true;
            p.variants.forEach(function (v) {
                var storeSize = byKey[self.normalizeSize(v.size)];
                rows.push({
                    Handle: (store && store.handle) || p.feedHandle,
                    Title: first ? p.title : '',
                    'Option1 Name': first ? 'Size' : '',
                    'Option1 Value': storeSize || v.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    SKU: v.sku,
                    Barcode: '',
                    'HS Code': '',
                    COO: '',
                    Location: location,
                    'Bin name': '',
                    'On hand (new)': v.quantity,
                    _matched: !!store,
                    _sizeAligned: !!(storeSize && storeSize !== v.size)
                });
                first = false;
            });
        });
        return rows;
    },

    // The same 19-column header the rest of the tool writes, so the import screen
    // in Shopify behaves identically to a footwear import.
    toCSV: function (rows) {
        var headers = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
            '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
            '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
            '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
        var out = [headers.join(',')];
        rows.forEach(function (r) {
            out.push([
                r.Handle,
                '"' + String(r.Title || '').replace(/"/g, '""') + '"',
                r['Option1 Name'] || '',
                '"' + String(r['Option1 Value'] || '').replace(/"/g, '""') + '"',
                '', '', '', '',
                r.SKU || '',
                r.Barcode || '',
                '', '',
                r.Location || 'Needham',
                '',
                '', '', '', '', '',
                r['On hand (new)']
            ].join(','));
        });
        return out.join('\n');
    },

    // Headline numbers for the page.
    summarize: function (products, rows) {
        var self = this;
        var apparel = products.filter(function (p) { return self.isApparelCode(p.code); });
        var matched = apparel.filter(function (p) { return !!p.store; });
        var types = {};
        apparel.forEach(function (p) {
            var t = (p.store && p.store.type) || 'Not on Shopify yet';
            types[t] = (types[t] || 0) + 1;
        });
        return {
            colorways: apparel.length,
            matched: matched.length,
            unmatched: apparel.length - matched.length,
            ambiguous: matched.filter(function (p) { return p.store.ambiguous; }).length,
            variants: rows.length,
            units: apparel.reduce(function (t, p) { return t + p.units; }, 0),
            sizeAligned: rows.filter(function (r) { return r._sizeAligned; }).length,
            types: types
        };
    }
};

// node test hook only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) module.exports = OnApparelConverter;
