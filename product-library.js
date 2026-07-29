// product-library.js, The Run House.
//
// A full-screen "Product Library": every carried product, grouped by model, with
// all its colorways in one place, and inline editing of price, description, and
// tags on the live product. Browsing runs entirely off the cached catalog (fast,
// no per-product calls). Full detail (image, description, per-variant prices) is
// lazy-loaded only when you open a colorway to edit it, and cached.
//
// Writes go through the same gated Worker routes as the rest of the tool:
//   price       -> CatalogClient.updateProductPrices   (/product/prices)
//   description -> CatalogClient.updateProductDescription (/product/update)
//   tags        -> CatalogClient.applyTags             (/tags/apply)
// All need the write secret; if it is not set we prompt once and store it.
//
// This is the ONE place tag REMOVES are intended: you are directly editing a
// single product's tags, not running the add-only bulk pass. House style: no em
// dashes.

var ProductLibrary = {
    _catalog: null,
    _groups: null,        // [{ key, label, vendor, count, colorways:[product] }]
    _detail: {},          // product id -> detail (lazy)
    _filter: { q: '', brand: '', gender: '', status: '', sort: 'stock', showOOS: false },
    _open: {},            // model key -> expanded?
    _modelEdit: {},       // model key -> model-wide editor open?
    _brandCollapsed: {},  // brand name -> section collapsed?

    // ---------- lifecycle ----------
    open: function () {
        var self = this;
        if (typeof CatalogClient === 'undefined') { alert('Catalog not available.'); return; }
        this._injectCss();
        var o = document.getElementById('plib-overlay');
        if (o) o.remove();
        o = document.createElement('div');
        o.id = 'plib-overlay';
        o.innerHTML = this._shellHTML();
        document.body.appendChild(o);
        document.body.classList.add('plib-open');

        o.querySelector('#plib-close').onclick = function () { self.close(); };
        o.addEventListener('keydown', function (e) { if (e.key === 'Escape') self.close(); });
        var q = o.querySelector('#plib-q');
        q.oninput = function () { self._filter.q = q.value.trim().toLowerCase(); self._debouncedRender(); };
        ['brand', 'gender', 'status', 'sort'].forEach(function (k) {
            var el = o.querySelector('#plib-f-' + k);
            el.onchange = function () { self._filter[k] = el.value; self._render(); };
        });
        var oos = o.querySelector('#plib-f-oos');
        oos.onchange = function () { self._filter.showOOS = oos.checked; self._render(); };
        o.querySelector('#plib-list').addEventListener('click', function (e) { self._onListClick(e); });
        o.querySelector('#plib-list').addEventListener('change', function (e) { self._onListChange(e); });

        this._setStatus('Loading catalog...');
        CatalogClient.fetchCatalog().then(function (catalog) {
            self._catalog = catalog;
            self._groups = self._group(catalog.products || []);
            self._fillFilters();
            self._render();
        }).catch(function (err) {
            self._setStatus('Could not load catalog: ' + (err && err.message || err), true);
        });
    },
    close: function () {
        var o = document.getElementById('plib-overlay');
        if (o) o.remove();
        document.body.classList.remove('plib-open');
    },

    _debouncedRender: function () {
        var self = this;
        clearTimeout(this._dt);
        this._dt = setTimeout(function () { self._render(); }, 160);
    },

    // ---------- grouping ----------
    _group: function (products) {
        var by = {};
        (products || []).forEach(function (p) {
            if (!p || !p.id) return;
            var model = ProductLibrary._cleanModel(p.modelKeyGenderless || p.modelKey || p.title || '');
            if (!model) return;
            var vendor = ProductLibrary._brandLabel(p.vendor);
            // Group by brand + cleaned model, so width variants the parser split
            // out ("Bondi 8" vs "Bondi 8 Extra") land in ONE group.
            var key = vendor.toUpperCase() + ' :: ' + model;
            if (!by[key]) by[key] = { key: key, vendor: vendor, model: model, colorways: [] };
            by[key].colorways.push(p);
        });
        var groups = Object.keys(by).map(function (k) {
            var g = by[k];
            g.colorways.sort(function (a, b) {
                var ga = String(a.gender || ''), gb = String(b.gender || '');
                if (ga !== gb) return ga.localeCompare(gb);
                return String(a.colorName || a.title).localeCompare(String(b.colorName || b.title));
            });
            g.label = ProductLibrary._titleCase(g.model);
            g.count = g.colorways.length;
            // Most recent edit across the model's colorways (ISO strings sort
            // chronologically), for the "Recently modified" sort.
            g._modified = g.colorways.reduce(function (m, p) { return (p.updatedAt && p.updatedAt > m) ? p.updatedAt : m; }, '');
            // Total on-hand across the model, for the "Most inventory" sort.
            g._stock = g.colorways.reduce(function (t, p) { return t + (typeof p.totalOnHand === 'number' ? p.totalOnHand : 0); }, 0);
            return g;
        });
        return groups;
    },
    _titleCase: function (s) {
        return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m, c) { return c.toUpperCase(); });
    },
    // ---------- brand normalization ----------
    // Shopify vendors are typed by hand, so one brand shows up as "On", "ON
    // Running", "On Running", "HOKA" and "Hoka One One". Fold every spelling onto
    // ONE canonical label, keyed on a punctuation and case free form of the
    // vendor, so a brand is one section instead of three.
    _BRAND_ALIASES: {
        on: 'ON Running', onrunning: 'ON Running',
        asics: 'ASICS',
        brooks: 'Brooks', brooksrunning: 'Brooks',
        hoka: 'HOKA', hokaoneone: 'HOKA',
        newbalance: 'New Balance', nb: 'New Balance',
        puma: 'Puma',
        saucony: 'Saucony',
        nike: 'Nike',
        adidas: 'Adidas',
        altra: 'Altra', altrarunning: 'Altra',
        topo: 'Topo Athletic', topoathletic: 'Topo Athletic',
        mizuno: 'Mizuno',
        salomon: 'Salomon',
        nnormal: 'NNormal',
        underarmour: 'Under Armour', ua: 'Under Armour',
        goodr: 'goodr',
        balega: 'Balega',
        feetures: 'Feetures',
        oofos: 'OOFOS',
        superfeet: 'Superfeet',
        ciele: 'Ciele',
        nathan: 'Nathan',
        stance: 'Stance',
        swiftwick: 'Swiftwick'
    },
    _brandLabel: function (vendor) {
        var raw = String(vendor || '').trim();
        if (!raw) return 'Other';
        var k = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!k) return 'Other';
        // Known brand: one canonical spelling, always.
        if (this._BRAND_ALIASES[k]) return this._BRAND_ALIASES[k];
        // Unknown vendor: title case it so two casings of the same word still
        // land in the same section ("Vuori" and "VUORI" -> "Vuori").
        return this._titleCase(raw.replace(/\s{2,}/g, ' '));
    },
    // Tidy a parser model key for display and grouping: drop junk punctuation at
    // the ends (a leading "'" from "Boys'") and trailing width words the parser
    // left behind ("Bondi 8 Extra Wide" -> "Bondi 8"), so width variants merge
    // into the base model instead of showing as their own broken group.
    _cleanModel: function (raw) {
        var s = String(raw || '').toUpperCase().trim();
        s = s.replace(/^[^A-Z0-9]+/, '').replace(/[^A-Z0-9)]+$/, '');
        s = s.replace(/[\s-]+(EXTRA\s*WIDE|X[-\s]?WIDE|XWIDE|WIDE|NARROW)\s*$/, '').trim();
        s = s.replace(/[\s-]+EXTRA\s*$/, '').trim(); // "Extra Wide" that left a bare "Extra"
        return s.replace(/\s{2,}/g, ' ').trim();
    },
    // Readable width label. Standard is the default and gets NO chip (no "std").
    _widthLabel: function (w) {
        var c = String(w || '').toUpperCase();
        if (c === 'WIDE' || c === '2E' || c === 'EE' || c === 'E') return 'Wide';
        if (c === 'XWIDE' || c === 'X-WIDE' || c === 'EXTRA WIDE' || c === 'EXTRAWIDE' || c === '4E' || c === '2E4E') return 'X-Wide';
        if (c === 'NARROW' || c === '2A' || c === 'A' || c === 'B') return 'Narrow';
        return ''; // STD / standard / D / blank -> no chip
    },
    // A colored stock pill: green in stock, amber low, red out.
    _stockPill: function (n, big) {
        if (typeof n !== 'number') return '';
        var cls = n === 0 ? 'oos' : (n <= 5 ? 'low' : 'ok');
        var label = n === 0 ? 'Out of stock' : (n + ' in stock');
        return '<span class="plib-pill plib-pill-' + cls + (big ? ' plib-pill-lg' : '') + '">' + label + '</span>';
    },

    _fillFilters: function () {
        var brands = {}, self = this;
        (this._groups || []).forEach(function (g) { if (g.vendor) brands[g.vendor] = 1; });
        var sel = document.getElementById('plib-f-brand');
        if (sel) {
            sel.innerHTML = '<option value="">All brands</option>' +
                Object.keys(brands).sort().map(function (b) { return '<option value="' + self._esc(b) + '">' + self._esc(b) + '</option>'; }).join('');
        }
    },

    // ---------- filtering ----------
    // A model has no inventory anywhere when every colorway has a KNOWN total of
    // exactly 0. A null total (paged dev path, or pre-rebuild) counts as unknown,
    // so nothing is hidden until the catalog actually carries inventory.
    _isOOS: function (g) {
        return g.colorways.length > 0 && g.colorways.every(function (p) { return p.totalOnHand === 0; });
    },
    _matchGroup: function (g) {
        var f = this._filter;
        if (f.brand && g.vendor !== f.brand) return false;
        if (!f.showOOS && this._isOOS(g)) { this._oosHidden = (this._oosHidden || 0) + 1; return false; }
        // A group is shown if ANY colorway passes gender/status/text.
        return g.colorways.some(this._matchCw, this);
    },
    _matchCw: function (p) {
        var f = this._filter;
        if (f.gender && String(p.gender || '') !== f.gender) return false;
        if (f.status && String(p.status || '') !== f.status) return false;
        if (f.q) {
            var hay = (p.title + ' ' + (p.colorName || '') + ' ' + (p.vendor || '') + ' ' + ProductLibrary._brandLabel(p.vendor)
                + ' ' + (p.modelKeyGenderless || '') + ' ' + (p.skus || []).join(' ')).toLowerCase();
            if (hay.indexOf(f.q) === -1) return false;
        }
        return true;
    },

    // ---------- render ----------
    _render: function () {
        var self = this;
        var list = document.getElementById('plib-list');
        if (!list || !this._groups) return;
        this._oosHidden = 0;
        var shown = this._groups.filter(function (g) { return self._matchGroup(g); });
        var totalCw = shown.reduce(function (t, g) { return t + g.colorways.filter(self._matchCw, self).length; }, 0);

        // Section by brand, so the list reads as "here is all my Hoka, here is
        // all my Brooks" instead of one flat wall of models.
        var brands = {};
        shown.forEach(function (g) { var b = g.vendor || 'Other'; (brands[b] = brands[b] || []).push(g); });
        var names = Object.keys(brands);
        var cmp = this._modelCmp();
        names.forEach(function (b) { brands[b].sort(cmp); });   // models within a brand
        names.sort(this._brandCmp(brands));                     // the brands themselves

        this._setStatus(names.length + ' brand' + (names.length !== 1 ? 's' : '') + ' · ' + shown.length + ' models · ' + totalCw + ' colorways'
            + (this._filterActive() ? ' (filtered)' : '')
            + (!this._filter.showOOS && this._oosHidden ? ' · ' + this._oosHidden + ' out of stock hidden' : ''));
        if (!shown.length) { list.innerHTML = '<div class="plib-empty">No products match.</div>'; return; }

        list.innerHTML = names.map(function (b) {
            var models = brands[b], stock = 0, known = false;
            models.forEach(function (g) { stock += g._stock; if (!known) known = g.colorways.some(function (p) { return typeof p.totalOnHand === 'number'; }); });
            var collapsed = !!self._brandCollapsed[b];
            var head = '<div class="plib-brand" data-brand="' + self._esc(b) + '">'
                + '<span class="plib-brand-caret">' + (collapsed ? '▸' : '▾') + '</span>'
                + '<span class="plib-brand-name">' + self._esc(b) + '</span>'
                + '<span class="plib-brand-meta">' + models.length + ' model' + (models.length !== 1 ? 's' : '')
                + (known ? ' · ' + stock + ' in stock' : '') + '</span></div>';
            var body = collapsed ? '' : '<div class="plib-brandsec-body">' + models.map(function (g) { return self._groupHTML(g); }).join('') + '</div>';
            return '<section class="plib-brandsec' + (collapsed ? ' collapsed' : '') + '">' + head + body + '</section>';
        }).join('');
    },
    _filterActive: function () { var f = this._filter; return !!(f.q || f.brand || f.gender || f.status); },
    // Comparator for models within a brand, per the active sort.
    _modelCmp: function () {
        var s = this._filter.sort;
        if (s === 'az') return function (a, b) { return a.label.localeCompare(b.label); };
        if (s === 'modified') return function (a, b) { if (a._modified !== b._modified) return a._modified < b._modified ? 1 : -1; return a.label.localeCompare(b.label); };
        return function (a, b) { if (b._stock !== a._stock) return b._stock - a._stock; return a.label.localeCompare(b.label); };
    },
    // Comparator for the brand sections themselves, matching the model sort:
    // most stock, most recent, or A to Z.
    _brandCmp: function (brands) {
        var s = this._filter.sort;
        if (s === 'az') return function (a, b) { return a.localeCompare(b); };
        if (s === 'modified') {
            var mod = {}; Object.keys(brands).forEach(function (b) { mod[b] = brands[b].reduce(function (m, g) { return g._modified > m ? g._modified : m; }, ''); });
            return function (a, b) { if (mod[a] !== mod[b]) return mod[a] < mod[b] ? 1 : -1; return a.localeCompare(b); };
        }
        var tot = {}; Object.keys(brands).forEach(function (b) { tot[b] = brands[b].reduce(function (t, g) { return t + g._stock; }, 0); });
        return function (a, b) { if (tot[a] !== tot[b]) return tot[b] - tot[a]; return a.localeCompare(b); };
    },

    _groupHTML: function (g) {
        var self = this;
        var cws = g.colorways.filter(this._matchCw, this);
        var isOpen = !!this._open[g.key];
        var prices = cws.map(function (p) { return parseFloat(p.price); }).filter(function (x) { return !isNaN(x); });
        var priceLbl = prices.length ? ('$' + Math.min.apply(null, prices) + (Math.max.apply(null, prices) !== Math.min.apply(null, prices) ? ('–$' + Math.max.apply(null, prices)) : '')) : '';
        var genders = {}; cws.forEach(function (p) { if (p.gender) genders[p.gender] = 1; });
        var gimg = '';
        for (var i = 0; i < cws.length; i++) { if (cws[i].image) { gimg = cws[i].image; break; } }
        var gthumb = gimg
            ? '<img class="plib-g-thumb" src="' + this._esc(gimg) + '" alt="" loading="lazy">'
            : '<span class="plib-g-thumb plib-thumb-none"></span>';
        var gStock = 0, gKnown = false;
        cws.forEach(function (p) { if (typeof p.totalOnHand === 'number') { gStock += p.totalOnHand; gKnown = true; } });
        var sub = cws.length + ' colorway' + (cws.length !== 1 ? 's' : '')
            + (Object.keys(genders).length ? '&ensp;·&ensp;' + Object.keys(genders).join(', ') : '');
        var head = '<div class="plib-g-head" data-model="' + this._esc(g.key) + '">'
            + '<span class="plib-caret">' + (isOpen ? '▾' : '▸') + '</span>'
            + gthumb
            + '<div class="plib-g-id"><div class="plib-g-name">' + this._esc(g.label) + '</div>'
            + '<div class="plib-g-sub">' + sub + '</div></div>'
            + '<div class="plib-g-right">'
            + (priceLbl ? '<span class="plib-g-price">' + this._esc(priceLbl) + '</span>' : '')
            + (gKnown ? this._stockPill(gStock, true) : '')
            + '<button class="plib-model-edit" data-model="' + this._esc(g.key) + '" title="Change price, description or photo for every colorway at once">Edit all</button>'
            + '</div></div>';
        var editor = (isOpen && this._modelEdit[g.key]) ? this._modelEditorHTML(g, cws) : '';
        var body = isOpen ? '<div class="plib-g-body">' + editor + cws.map(function (p) { return self._cwRowHTML(p); }).join('') + '</div>' : '';
        return '<div class="plib-group' + (isOpen ? ' open' : '') + '">' + head + body + '</div>';
    },

    _cwRowHTML: function (p) {
        var st = String(p.status || '').toUpperCase();
        var stCls = st === 'ACTIVE' ? 'plib-st-active' : (st === 'DRAFT' ? 'plib-st-draft' : 'plib-st-arch');
        var wl = this._widthLabel(p.width);
        var subBits = ['<span class="plib-st ' + stCls + '">' + (st || '?') + '</span>'];
        if (p.gender) subBits.push('<span class="plib-sub-t">' + this._esc(p.gender) + '</span>');
        if (wl) subBits.push('<span class="plib-sub-t">' + this._esc(wl) + '</span>');
        var thumb = p.image
            ? '<img class="plib-thumb" src="' + this._esc(p.image) + '" alt="" loading="lazy">'
            : '<span class="plib-thumb plib-thumb-none"></span>';
        return '<div class="plib-cw" data-id="' + this._esc(p.id) + '">'
            + '<div class="plib-cw-main">'
            + thumb
            + '<div class="plib-cw-id"><div class="plib-cw-color">' + this._esc(p.colorName || p.title) + '</div>'
            + '<div class="plib-cw-sub">' + subBits.join('<span class="plib-dot">·</span>') + '</div></div>'
            + '</div>'
            + '<div class="plib-cw-right">'
            + (typeof p.totalOnHand === 'number' ? this._stockPill(p.totalOnHand) : '')
            + '<span class="plib-cw-price">' + (p.price ? '$' + this._esc(p.price) : '—') + '</span>'
            + '<button class="plib-edit" data-id="' + this._esc(p.id) + '">Edit</button></div>'
            + '<div class="plib-editor" id="plib-ed-' + this._cssId(p.id) + '"></div>'
            + '</div>';
    },

    // ---------- interaction ----------
    _onListClick: function (e) {
        var t = e.target;
        if (!t.closest) return;
        var brand = t.closest('.plib-brand');
        if (brand) { var bn = brand.getAttribute('data-brand'); this._brandCollapsed[bn] = !this._brandCollapsed[bn]; this._render(); return; }
        var mEdit = t.closest('.plib-model-edit');
        if (mEdit) {
            e.stopPropagation();
            var mk = mEdit.getAttribute('data-model');
            this._open[mk] = true;
            this._modelEdit[mk] = !this._modelEdit[mk];
            this._render();
            return;
        }
        var mClose = t.closest('.plib-me-close');
        if (mClose) { this._modelEdit[mClose.getAttribute('data-mclose')] = false; this._render(); return; }
        var mSave = t.closest('.plib-msave');
        if (mSave) { this._applyModel(mSave.getAttribute('data-mact'), mSave.getAttribute('data-model')); return; }
        var edit = t.closest('.plib-edit');
        if (edit) { this._toggleEditor(edit.getAttribute('data-id')); return; }
        var head = t.closest('.plib-g-head');
        if (head) { var m = head.getAttribute('data-model'); this._open[m] = !this._open[m]; this._render(); return; }
    },

    // The bulk photo picker is a hidden file input behind a styled label, so the
    // chosen file has to be echoed back by hand: name, size, and a thumbnail.
    _onListChange: function (e) {
        var t = e.target;
        if (!t || !t.getAttribute) return;
        var k = t.getAttribute('data-mfile');
        if (!k) return;
        var f = t.files && t.files[0];
        var name = document.getElementById('plib-mfname-' + k);
        var prev = document.getElementById('plib-mprev-' + k);
        if (name) {
            name.textContent = f ? (f.name + ' (' + Math.max(1, Math.round(f.size / 1024)) + ' KB)') : 'No image chosen yet';
            name.className = 'plib-filename' + (f ? ' has' : '');
        }
        if (prev) {
            if (f) { prev.src = URL.createObjectURL(f); prev.className = 'plib-fileprev on'; }
            else { prev.removeAttribute('src'); prev.className = 'plib-fileprev'; }
        }
    },

    _findProduct: function (id) {
        var found = null;
        (this._groups || []).some(function (g) {
            return g.colorways.some(function (p) { if (p.id === id) { found = p; return true; } return false; });
        });
        return found;
    },

    _toggleEditor: function (id) {
        var box = document.getElementById('plib-ed-' + this._cssId(id));
        if (!box) return;
        if (box.classList.contains('open')) { box.classList.remove('open'); box.innerHTML = ''; return; }
        box.classList.add('open');
        box.innerHTML = '<div class="plib-ed-loading">Loading detail...</div>';
        var self = this, p = this._findProduct(id);
        var cached = this._detail[id];
        if (cached) { this._renderEditor(box, p, cached); return; }
        CatalogClient.fetchProductDetail(id).then(function (r) {
            if (r.__status !== 200 || !r.product) { box.innerHTML = '<div class="plib-ed-err">Could not load detail (HTTP ' + r.__status + '): ' + self._esc(r.error || r.reason || '') + '</div>'; return; }
            self._detail[id] = r.product;
            self._renderEditor(box, p, r.product);
        }).catch(function (err) { box.innerHTML = '<div class="plib-ed-err">' + self._esc(err && err.message || String(err)) + '</div>'; });
    },

    _renderEditor: function (box, p, d) {
        var self = this;
        var img = d.image && d.image.url
            ? '<img class="plib-ed-img" src="' + this._esc(d.image.url) + '" alt="">'
            : '<div class="plib-ed-img plib-ed-noimg">no image</div>';
        // Price: one field sets every variant (shoes are one price across sizes).
        // Show the current spread if variants differ.
        var vprices = (d.variants || []).map(function (v) { return parseFloat(v.price); }).filter(function (x) { return !isNaN(x); });
        var uniform = vprices.length && vprices.every(function (x) { return x === vprices[0]; });
        var priceVal = uniform ? vprices[0] : (vprices[0] || '');
        var spread = (!uniform && vprices.length) ? ' <span class="plib-hint">(sizes vary: $' + Math.min.apply(null, vprices) + '–$' + Math.max.apply(null, vprices) + ', saving sets all)</span>' : '';
        var tags = (d.tags || []).slice();
        box.innerHTML =
            '<div class="plib-ed-grid">'
            + img
            + '<div class="plib-ed-fields">'
            + '<label class="plib-lab">Price ($), all ' + (d.variants || []).length + ' sizes' + spread + '</label>'
            + '<div class="plib-row"><input class="plib-in" id="plib-price-' + this._cssId(p.id) + '" type="number" step="0.01" value="' + this._esc(priceVal) + '"><button class="plib-save" data-act="price" data-id="' + this._esc(p.id) + '">Save price</button></div>'
            + '<label class="plib-lab">Description</label>'
            + '<textarea class="plib-ta" id="plib-desc-' + this._cssId(p.id) + '">' + this._esc(d.descriptionHtml || '') + '</textarea>'
            + '<div class="plib-row"><button class="plib-save" data-act="desc" data-id="' + this._esc(p.id) + '">Save description</button><span class="plib-hint">HTML allowed</span></div>'
            + '<label class="plib-lab">Add a photo</label>'
            + '<div class="plib-row"><input class="plib-file" id="plib-photo-' + this._cssId(p.id) + '" type="file" accept="image/*"><button class="plib-save" data-act="photo" data-id="' + this._esc(p.id) + '">Add photo</button><span class="plib-hint">appends, does not replace</span></div>'
            + '<label class="plib-lab">Tags</label>'
            + '<div class="plib-tags" id="plib-tags-' + this._cssId(p.id) + '"></div>'
            + '<div class="plib-row"><input class="plib-in" id="plib-tagin-' + this._cssId(p.id) + '" placeholder="add a tag, Enter"><button class="plib-save" data-act="tags" data-id="' + this._esc(p.id) + '">Save tags</button></div>'
            + '<div class="plib-ed-msg" id="plib-msg-' + this._cssId(p.id) + '"></div>'
            + '<a class="plib-admin" href="https://admin.shopify.com/products/' + this._esc((p.id || '').split('/').pop()) + '" target="_blank" rel="noopener">Open in Shopify admin ↗</a>'
            + '</div></div>';
        // tag chips state lives on the box element
        box._tags = tags;
        this._renderTags(p.id);
        var tagIn = document.getElementById('plib-tagin-' + this._cssId(p.id));
        tagIn.onkeydown = function (e) {
            if (e.key === 'Enter') { e.preventDefault(); var v = tagIn.value.trim(); if (v && box._tags.indexOf(v) === -1) { box._tags.push(v); self._renderTags(p.id); } tagIn.value = ''; }
        };
        box.querySelectorAll('.plib-save').forEach(function (btn) {
            btn.onclick = function () { self._save(btn.getAttribute('data-act'), p, d, box); };
        });
        box.addEventListener('click', function (e) {
            var x = e.target.closest && e.target.closest('.plib-tag-x');
            if (x) { var t = x.getAttribute('data-t'); box._tags = box._tags.filter(function (y) { return y !== t; }); self._renderTags(p.id); }
        });
    },

    _renderTags: function (id) {
        var box = document.getElementById('plib-ed-' + this._cssId(id));
        var wrap = document.getElementById('plib-tags-' + this._cssId(id));
        if (!box || !wrap) return;
        wrap.innerHTML = (box._tags || []).map(function (t) {
            return '<span class="plib-tag">' + ProductLibrary._esc(t) + '<span class="plib-tag-x" data-t="' + ProductLibrary._esc(t) + '">×</span></span>';
        }).join('') || '<span class="plib-hint">no tags</span>';
    },

    // ---------- saving ----------
    _ensureSecret: function () {
        if (CatalogClient.hasWriteSecret && CatalogClient.hasWriteSecret()) return true;
        var s = window.prompt('Paste the write secret to allow editing products in Shopify.\n(Stored in this browser only, never in the page.)');
        if (s && s.trim()) { CatalogClient.setWriteSecret(s.trim()); return true; }
        return false;
    },
    _msg: function (id, html, isErr) {
        var el = document.getElementById('plib-msg-' + this._cssId(id));
        if (el) { el.innerHTML = html; el.className = 'plib-ed-msg' + (isErr ? ' err' : ' ok'); }
    },
    _refused: function (r) { return [401, 403, 501].indexOf(r.__status) >= 0; },

    // ---------- model-wide (all colorways) editing ----------
    // Bulk edits are the scariest thing in this tool: one click rewrites live
    // Shopify products. So the panel is built to be read, not just filled in.
    // Each action is its own card that states in plain words what it will touch,
    // shows the current value it is about to replace, and carries its own button,
    // progress bar and result line. Nothing is shared between the three, so you
    // always know which action a message belongs to.
    _modelEditorHTML: function (g, cws) {
        var k = this._cssId(g.key), self = this;
        var n = cws.length;
        var cwWord = n + ' colorway' + (n !== 1 ? 's' : '');
        // What the price card is about to overwrite.
        var prices = cws.map(function (p) { return parseFloat(p.price); }).filter(function (x) { return !isNaN(x); });
        var lo = prices.length ? Math.min.apply(null, prices) : null;
        var hi = prices.length ? Math.max.apply(null, prices) : null;
        var nowPrice = prices.length ? (lo === hi ? '$' + lo.toFixed(2) : '$' + lo.toFixed(2) + ' to $' + hi.toFixed(2)) : 'unknown';
        var mixed = prices.length && lo !== hi;

        function card(act, num, title, blurb, current, control, btn) {
            return '<div class="plib-card" data-act="' + act + '">'
                + '<div class="plib-card-head"><span class="plib-card-num">' + num + '</span>'
                + '<div><div class="plib-card-title">' + title + '</div>'
                + '<div class="plib-card-blurb">' + blurb + '</div></div></div>'
                + (current ? '<div class="plib-card-now">' + current + '</div>' : '')
                + control
                + '<div class="plib-card-foot">'
                + '<button class="plib-msave" data-mact="' + act + '" data-model="' + self._esc(g.key) + '">' + btn + '</button>'
                + '<span class="plib-me-msg" id="plib-mstatus-' + act + '-' + k + '"></span>'
                + '</div>'
                + '<div class="plib-bar" id="plib-mbar-' + act + '-' + k + '"><span></span></div>'
                + '</div>';
        }

        return '<div class="plib-model-ed">'
            + '<div class="plib-me-head">'
            + '<div><div class="plib-me-eyebrow">Bulk edit</div>'
            + '<div class="plib-me-title">' + this._esc(g.label) + '</div>'
            + '<div class="plib-me-sub">Every change below is applied to all <b>' + cwWord + '</b> of this model, one product at a time. Writes go straight to the live Shopify products, and each action asks you to confirm first.</div></div>'
            + '<button class="plib-me-close" data-mclose="' + this._esc(g.key) + '" title="Close bulk edit">Done</button>'
            + '</div>'

            + '<div class="plib-cards">'
            + card('price', '1', 'Set one price',
                'Overwrites the price of <b>every size</b> of all ' + cwWord + '. Compare-at prices are left alone.',
                'Currently ' + nowPrice + (mixed ? ' <span class="plib-warn">prices differ across colorways</span>' : ''),
                '<div class="plib-row"><span class="plib-money">$</span><input class="plib-in plib-in-money" id="plib-mprice-' + k + '" type="number" step="0.01" min="0" placeholder="140.00" inputmode="decimal"></div>',
                'Apply price to all ' + n)

            + card('desc', '2', 'Replace the description',
                'Replaces the existing description on all ' + cwWord + '. The old text is <b>not</b> kept, so paste the full description you want.',
                '',
                '<textarea class="plib-ta" id="plib-mdesc-' + k + '" placeholder="Shared description for the whole model. Plain text or HTML (&lt;p&gt;, &lt;ul&gt;, &lt;b&gt;)."></textarea>',
                'Apply description to all ' + n)

            + card('photo', '3', 'Add one photo everywhere',
                'Adds this image to all ' + cwWord + '. It is <b>added</b> to each product gallery, so existing colorway photos stay. Best for a size chart or a shared lifestyle shot.',
                '',
                '<div class="plib-filerow">'
                + '<label class="plib-filebtn" for="plib-mphoto-' + k + '">Choose image</label>'
                + '<input class="plib-file-hidden" id="plib-mphoto-' + k + '" type="file" accept="image/*" data-mfile="' + k + '">'
                + '<img class="plib-fileprev" id="plib-mprev-' + k + '" alt="">'
                + '<span class="plib-filename" id="plib-mfname-' + k + '">No image chosen yet</span>'
                + '</div>',
                'Add photo to all ' + n)
            + '</div>'
            + '</div>';
    },

    _applyModel: function (act, key) {
        var self = this;
        var g = null;
        (this._groups || []).some(function (x) { if (x.key === key) { g = x; return true; } return false; });
        if (!g) return;
        if (!this._ensureSecret()) { this._mMsg(key, act, 'Need the write secret to save.', true); return; }
        var cws = g.colorways, k = this._cssId(key);
        var many = cws.length + ' colorway' + (cws.length !== 1 ? 's' : '') + ' of ' + g.label;
        if (act === 'price') {
            var price = parseFloat(document.getElementById('plib-mprice-' + k).value.trim());
            if (isNaN(price) || price < 0) { this._mMsg(key, act, 'Enter a valid price.', true); return; }
            var pv = price.toFixed(2);
            if (!confirm('Set every size of ' + many + ' to $' + pv + '?\n\nThis writes to the live products and cannot be undone from here.')) return;
            this._runAll(key, act, cws, 'price to $' + pv, function (p) {
                return self._ensureDetail(p.id).then(function (d) {
                    var variants = (d.variants || []).map(function (v) { return { id: v.id, price: pv }; });
                    if (!variants.length) return { ok: true };
                    return CatalogClient.updateProductPrices(p.id, variants).then(function (r) {
                        if (r.__status === 200 && r.ok) {
                            (d.variants || []).forEach(function (v) { v.price = pv; }); p.price = pv;
                            var cell = document.querySelector('.plib-cw[data-id="' + self._cssSel(p.id) + '"] .plib-cw-price'); if (cell) cell.textContent = '$' + pv;
                        }
                        return r;
                    });
                });
            });
        } else if (act === 'desc') {
            var html = document.getElementById('plib-mdesc-' + k).value;
            if (!html.trim()) { this._mMsg(key, act, 'Enter a description.', true); return; }
            if (!confirm('Replace the description on all ' + many + '?\n\nThe existing description on each product is overwritten.')) return;
            this._runAll(key, act, cws, 'description', function (p) {
                return CatalogClient.updateProductDescription(p.id, html).then(function (r) {
                    if (r.__status === 200 && r.ok && self._detail[p.id]) self._detail[p.id].descriptionHtml = html;
                    return r;
                });
            });
        } else if (act === 'photo') {
            var input = document.getElementById('plib-mphoto-' + k);
            var file = input.files && input.files[0];
            if (!file) { this._mMsg(key, act, 'Choose an image first.', true); return; }
            if (!confirm('Add "' + (file.name || 'this image') + '" to all ' + many + '?\n\nIt is added to each gallery, existing photos are kept.')) return;
            this._mMsg(key, act, 'Uploading photo...');
            this._uploadImage(file).then(function (url) {
                self._runAll(key, act, cws, 'photo', function (p) { return CatalogClient.addProductMedia(p.id, url, p.title); });
            }).catch(function (e) { self._mMsg(key, act, 'Upload failed: ' + self._esc(e && e.message || String(e)), true); });
        }
    },

    // Run fn over every colorway, one at a time (gentle on rate limits), updating
    // a live count. Stops on a refusal (bad write secret). fn returns the write
    // response (or a promise of it).
    _runAll: function (key, act, items, label, fn) {
        var self = this, total = items.length, ok = 0, fail = 0, stopped = false;
        var btn = document.querySelector('.plib-msave[data-mact="' + act + '"][data-model="' + this._cssSel(key) + '"]');
        if (btn) { btn.disabled = true; btn.classList.add('busy'); }
        function done() { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
        (function step(i) {
            if (stopped) return;
            if (i >= total) {
                self._bar(key, act, 1);
                self._mMsg(key, act, (fail ? '✓ ' + ok + ' updated, ' + fail + ' failed' : '✓ All ' + ok + ' colorways updated') + ' (' + label + ').', fail > 0);
                done();
                return;
            }
            self._bar(key, act, i / total);
            self._mMsg(key, act, 'Saving ' + label + '... ' + (i + 1) + ' of ' + total);
            Promise.resolve(fn(items[i])).then(function (r) {
                if (r && self._refused(r)) { stopped = true; self._mMsg(key, act, 'Write refused (HTTP ' + r.__status + '): ' + self._esc(r.reason || r.error || 'check the write secret'), true); done(); return; }
                if (r && ((r.__status && r.__status !== 200) || r.ok === false)) fail++; else ok++;
                step(i + 1);
            }).catch(function () { fail++; step(i + 1); });
        })(0);
    },
    // Progress fill for one action card, 0 to 1.
    _bar: function (key, act, frac) {
        var el = document.getElementById('plib-mbar-' + act + '-' + this._cssId(key));
        if (!el) return;
        el.classList.add('on');
        var span = el.firstChild;
        if (span && span.style) span.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    },

    _ensureDetail: function (id) {
        var self = this;
        if (this._detail[id]) return Promise.resolve(this._detail[id]);
        return CatalogClient.fetchProductDetail(id).then(function (r) {
            if (r.__status === 200 && r.product) { self._detail[id] = r.product; return r.product; }
            throw new Error('detail HTTP ' + r.__status);
        });
    },

    // Stage the bytes to Shopify's signed target (same flow as product creation),
    // returning the resourceUrl to hand to addProductMedia.
    _uploadImage: function (file) {
        return CatalogClient.stagedUploads([{ filename: file.name || 'photo.jpg', mimeType: file.type || 'image/jpeg', fileSize: String(file.size) }]).then(function (r) {
            if (r.__status !== 200 || !r.targets || !r.targets[0]) throw new Error('image staging failed (HTTP ' + r.__status + ')');
            return CatalogClient.uploadToTarget(r.targets[0], file);
        });
    },

    _mMsg: function (key, act, html, isErr) {
        var el = document.getElementById('plib-mstatus-' + act + '-' + this._cssId(key));
        if (el) { el.innerHTML = html; el.className = 'plib-me-msg' + (isErr ? ' err' : ' ok'); }
    },

    _save: function (act, p, d, box) {
        var self = this, id = p.id;
        if (!this._ensureSecret()) { this._msg(id, 'Need the write secret to save.', true); return; }
        if (act === 'price') {
            var raw = document.getElementById('plib-price-' + this._cssId(id)).value.trim();
            var price = parseFloat(raw);
            if (isNaN(price) || price < 0) { this._msg(id, 'Enter a valid price.', true); return; }
            var variants = (d.variants || []).map(function (v) { return { id: v.id, price: price.toFixed(2) }; });
            if (!variants.length) { this._msg(id, 'No variants to price.', true); return; }
            this._msg(id, 'Saving price...');
            CatalogClient.updateProductPrices(id, variants).then(function (r) {
                if (self._refused(r)) return self._msg(id, 'Write refused (HTTP ' + r.__status + '): ' + self._esc(r.reason || r.error || 'check the write secret'), true);
                if (r.__status !== 200 || !r.ok) return self._msg(id, 'Failed: ' + self._esc((r.errors && r.errors[0]) || r.error || 'HTTP ' + r.__status), true);
                d.variants.forEach(function (v) { v.price = price.toFixed(2); });
                p.price = price.toFixed(2);
                self._msg(id, '✓ Price saved to all ' + variants.length + ' sizes.');
                var pr = document.querySelector('.plib-cw[data-id="' + self._cssSel(id) + '"] .plib-cw-price'); if (pr) pr.textContent = '$' + price.toFixed(2);
            }).catch(function (e) { self._msg(id, self._esc(e && e.message || String(e)), true); });
        } else if (act === 'desc') {
            var html = document.getElementById('plib-desc-' + this._cssId(id)).value;
            this._msg(id, 'Saving description...');
            CatalogClient.updateProductDescription(id, html).then(function (r) {
                if (self._refused(r)) return self._msg(id, 'Write refused (HTTP ' + r.__status + '): ' + self._esc(r.reason || r.error || 'check the write secret'), true);
                if (r.__status !== 200 || !r.ok) return self._msg(id, 'Failed: ' + self._esc((r.errors && r.errors[0]) || r.error || 'HTTP ' + r.__status), true);
                d.descriptionHtml = html;
                self._msg(id, '✓ Description saved.');
            }).catch(function (e) { self._msg(id, self._esc(e && e.message || String(e)), true); });
        } else if (act === 'photo') {
            var input = document.getElementById('plib-photo-' + this._cssId(id));
            var file = input && input.files && input.files[0];
            if (!file) { this._msg(id, 'Choose an image first.', true); return; }
            this._msg(id, 'Uploading photo...');
            this._uploadImage(file).then(function (url) {
                return CatalogClient.addProductMedia(id, url, p.title).then(function (r) {
                    if (self._refused(r)) return self._msg(id, 'Write refused (HTTP ' + r.__status + '): ' + self._esc(r.reason || r.error || 'check the write secret'), true);
                    if (r.__status !== 200 || !r.ok) return self._msg(id, 'Failed: ' + self._esc((r.errors && r.errors[0]) || r.error || 'HTTP ' + r.__status), true);
                    self._msg(id, '✓ Photo added to this product.');
                });
            }).catch(function (e) { self._msg(id, self._esc(e && e.message || String(e)), true); });
        } else if (act === 'tags') {
            var current = d.tags || [];
            var next = box._tags || [];
            var add = next.filter(function (t) { return current.indexOf(t) === -1; });
            var remove = current.filter(function (t) { return next.indexOf(t) === -1; });
            if (!add.length && !remove.length) { this._msg(id, 'No tag changes.'); return; }
            this._msg(id, 'Saving tags...');
            CatalogClient.applyTags([{ id: id, add: add, remove: remove }]).then(function (r) {
                if (self._refused(r)) return self._msg(id, 'Write refused (HTTP ' + r.__status + '): ' + self._esc(r.reason || r.error || 'check the write secret'), true);
                var one = (r.results && r.results[0]) || {};
                if (r.__status !== 200 || one.ok === false) return self._msg(id, 'Failed: ' + self._esc((one.errors && one.errors[0]) || r.error || 'HTTP ' + r.__status), true);
                d.tags = next.slice(); p.tags = next.slice();
                self._msg(id, '✓ Tags saved (+' + add.length + ', −' + remove.length + ').');
            }).catch(function (e) { self._msg(id, self._esc(e && e.message || String(e)), true); });
        }
    },

    // ---------- utils ----------
    _setStatus: function (msg, isErr) {
        var el = document.getElementById('plib-status');
        if (el) { el.textContent = msg; el.className = 'plib-status' + (isErr ? ' err' : ''); }
    },
    _esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    _cssId: function (id) { return String(id || '').replace(/[^a-zA-Z0-9]/g, '_'); },
    _cssSel: function (id) { return String(id || '').replace(/"/g, '\\"'); },

    _shellHTML: function () {
        return '<div class="plib-panel">'
            + '<div class="plib-top">'
            + '<div><div class="plib-eyebrow">Catalog</div><div class="plib-title">Product Library</div></div>'
            + '<button id="plib-close" class="plib-x" title="Close">×</button>'
            + '</div>'
            + '<div class="plib-controls">'
            + '<input id="plib-q" class="plib-search" placeholder="Search model, colorway, SKU, brand...">'
            + '<select id="plib-f-brand" class="plib-sel"><option value="">All brands</option></select>'
            + '<select id="plib-f-gender" class="plib-sel"><option value="">All genders</option><option>Men\'s</option><option>Women\'s</option><option>Unisex</option></select>'
            + '<select id="plib-f-status" class="plib-sel"><option value="">All status</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select>'
            + '<select id="plib-f-sort" class="plib-sel"><option value="stock">Most inventory</option><option value="modified">Recently modified</option><option value="az">A to Z</option></select>'
            + '<label class="plib-oos"><input type="checkbox" id="plib-f-oos"> Show out of stock</label>'
            + '</div>'
            + '<div id="plib-status" class="plib-status">Loading...</div>'
            + '<div id="plib-list" class="plib-list"></div>'
            + '</div>';
    },

    _injectCss: function () {
        if (document.getElementById('plib-css')) return;
        var s = document.createElement('style');
        s.id = 'plib-css';
        s.textContent = `
        body.plib-open { overflow: hidden; }
        #plib-overlay { position: fixed; inset: 0; z-index: 4000; background: #0d131f; display: flex; }
        .plib-panel { flex: 1; display: flex; flex-direction: column; max-width: 1100px; margin: 0 auto; width: 100%; }
        .plib-top { display: flex; align-items: flex-start; justify-content: space-between; padding: 22px 26px 12px; }
        .plib-eyebrow { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: #94a9c5; font-weight: 700; }
        .plib-title { font-size: 24px; font-weight: 700; letter-spacing: -.5px; color: #eef4fc; margin-top: 4px; }
        .plib-x { background: none; border: 0; color: #9fb2cc; font-size: 26px; line-height: 1; cursor: pointer; padding: 4px 8px; }
        .plib-x:hover { color: #fff; }
        .plib-controls { display: flex; gap: 10px; padding: 4px 26px 12px; flex-wrap: wrap; }
        .plib-search { flex: 1; min-width: 220px; padding: 10px 13px; background: #131b28; border: 1px solid rgba(120,170,230,.18); color: #eef4fc; font-size: 14px; font-family: inherit; outline: none; }
        .plib-search:focus { border-color: #4c9bff; }
        .plib-sel { padding: 10px 12px; background: #131b28; border: 1px solid rgba(120,170,230,.28); color: #dfeaf7; font-size: 13.5px; font-family: inherit; outline: none; cursor: pointer; }
        .plib-status { padding: 0 26px 10px; font-size: 12.5px; color: #a4b8d2; }
        .plib-status.err { color: #ff9db0; }
        .plib-list { flex: 1; overflow-y: auto; padding: 0 26px 40px; }
        .plib-list::-webkit-scrollbar { width: 10px; } .plib-list::-webkit-scrollbar-thumb { background: rgba(120,160,220,.22); border-radius: 5px; }
        .plib-empty { padding: 40px; text-align: center; color: #a4b8d2; }
        .plib-brandsec { margin-bottom: 30px; }
        .plib-brandsec:last-child { margin-bottom: 8px; }
        /* The brand bar is the main divider in the list: a solid filled header
           with an accent edge, so sections read apart at a glance while scrolling. */
        .plib-brand { display: flex; align-items: center; gap: 11px; padding: 12px 14px; cursor: pointer; background: #18222f; border: 1px solid rgba(120,170,230,.24); border-left: 3px solid #4c9bff; position: sticky; top: 0; z-index: 3; }
        .plib-brand:hover { background: #1e2a3a; }
        .plib-brand-caret { color: #a9bcd6; font-size: 11px; width: 12px; }
        .plib-brand-name { font-size: 15px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #ffffff; }
        .plib-brand-meta { font-size: 12.5px; color: #b6c8de; margin-left: auto; font-variant-numeric: tabular-nums; }
        .plib-brandsec.collapsed .plib-brand { border-left-color: #56688a; }
        .plib-brandsec-body { border: 1px solid rgba(120,170,230,.14); border-top: 0; }
        .plib-group { border-bottom: 1px solid rgba(120,170,230,.14); }
        .plib-brandsec .plib-group:last-child { border-bottom: none; }
        .plib-g-head { display: flex; align-items: center; gap: 12px; padding: 13px 14px; cursor: pointer; }
        .plib-g-head:hover { background: rgba(120,170,230,.09); }
        .plib-g-thumb { width: 40px; height: 40px; object-fit: cover; background: #0b111d; flex-shrink: 0; border: 1px solid rgba(120,170,230,.12); border-radius: 2px; }
        .plib-g-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .plib-g-sub { font-size: 12px; color: #a7bad4; letter-spacing: .2px; }
        .plib-g-right { display: flex; align-items: center; gap: 14px; margin-left: auto; }
        .plib-g-price { font-size: 14px; color: #e6eefa; font-variant-numeric: tabular-nums; }
        .plib-caret { color: #a9bcd6; font-size: 11px; width: 12px; }
        .plib-g-name { font-size: 15.5px; font-weight: 650; color: #f4f8fd; letter-spacing: -.1px; }
        .plib-g-body { padding: 0 14px 14px 36px; }
        .plib-cw { border-top: 1px solid rgba(120,170,230,.13); display: grid; grid-template-columns: 1fr auto; align-items: center; }
        .plib-cw-main { display: flex; align-items: center; gap: 12px; padding: 11px 8px 11px 0; grid-column: 1; min-width: 0; }
        .plib-thumb { width: 42px; height: 42px; object-fit: cover; background: #0b111d; flex-shrink: 0; border: 1px solid rgba(120,170,230,.10); border-radius: 2px; }
        .plib-thumb-none { background: repeating-linear-gradient(45deg, #0f1622, #0f1622 4px, #131b28 4px, #131b28 8px); }
        .plib-cw-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .plib-cw-color { font-size: 14.5px; color: #f0f5fb; }
        .plib-cw-sub { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #adc0d9; }
        .plib-sub-t { color: #cddcee; }
        .plib-dot { color: #6d81a0; }
        .plib-cw > .plib-cw-right { grid-column: 2; display: flex; align-items: center; gap: 16px; }
        .plib-cw > .plib-editor { grid-column: 1 / -1; }
        .plib-st { font-size: 10px; font-weight: 800; letter-spacing: .4px; padding: 2px 6px; border-radius: 2px; }
        .plib-st-active { background: rgba(60,230,176,.18); color: #5cf0c4; }
        .plib-st-draft { background: rgba(255,192,77,.18); color: #ffce6b; }
        .plib-st-arch { background: rgba(159,178,204,.18); color: #c2d2e6; }
        .plib-chip { font-size: 10.5px; color: #9fb2cc; background: rgba(120,170,230,.10); padding: 2px 7px; }
        .plib-chip-w { color: #cbd8ea; }
        .plib-pill { font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 3px; white-space: nowrap; }
        .plib-pill-ok { background: rgba(60,220,170,.16); color: #66edc0; }
        .plib-pill-low { background: rgba(255,192,77,.18); color: #ffd077; }
        .plib-pill-oos { background: rgba(255,120,140,.16); color: #ffb0bf; }
        .plib-pill-lg { font-size: 12.5px; padding: 4px 12px; }
        .plib-cw-price { font-size: 14.5px; font-weight: 600; color: #eaf2fb; font-variant-numeric: tabular-nums; min-width: 54px; text-align: right; }
        .plib-edit { background: #1c2635; border: 1px solid rgba(120,170,230,.22); color: #cfe0f5; font-size: 12px; padding: 6px 14px; cursor: pointer; font-family: inherit; border-radius: 3px; }
        .plib-edit:hover { border-color: #4c9bff; color: #fff; }
        .plib-editor { display: none; }
        .plib-editor.open { display: block; padding: 4px 0 16px; }
        .plib-ed-loading, .plib-ed-err { font-size: 12px; color: #7f93b0; padding: 10px 2px; }
        .plib-ed-err { color: #ff9db0; }
        .plib-ed-grid { display: flex; gap: 18px; background: #111825; border: 1px solid rgba(120,170,230,.12); padding: 16px; }
        .plib-ed-img { width: 120px; height: 120px; object-fit: cover; background: #0b111d; flex-shrink: 0; }
        .plib-ed-noimg { display: flex; align-items: center; justify-content: center; font-size: 11px; color: #55688a; }
        .plib-ed-fields { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .plib-lab { font-size: 11.5px; text-transform: uppercase; letter-spacing: .5px; color: #a4b8d2; font-weight: 700; margin-top: 8px; }
        .plib-hint { font-size: 11.5px; color: #97acc7; font-weight: 400; text-transform: none; letter-spacing: 0; }
        .plib-row { display: flex; gap: 8px; align-items: center; }
        .plib-in { padding: 8px 11px; background: #0d131f; border: 1px solid rgba(120,170,230,.2); color: #eef4fc; font-size: 13px; font-family: inherit; outline: none; }
        .plib-in:focus { border-color: #4c9bff; }
        #plib-overlay input[type=number].plib-in { width: 120px; }
        .plib-ta { width: 100%; min-height: 90px; resize: vertical; padding: 9px 11px; background: #0d131f; border: 1px solid rgba(120,170,230,.2); color: #dfe9f6; font-size: 12.5px; font-family: ui-monospace, monospace; line-height: 1.5; outline: none; }
        .plib-ta:focus { border-color: #4c9bff; }
        .plib-save { background: #2f6fd6; border: 0; color: #fff; font-size: 12px; font-weight: 600; padding: 8px 14px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .plib-save:hover { background: #4c9bff; }
        .plib-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .plib-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; color: #cfe0f5; background: rgba(120,170,230,.12); padding: 3px 8px; }
        .plib-tag-x { cursor: pointer; color: #8ea6c6; font-size: 13px; } .plib-tag-x:hover { color: #ff9db0; }
        .plib-ed-msg { font-size: 12px; min-height: 16px; }
        .plib-ed-msg.ok { color: #3ce6b0; } .plib-ed-msg.err { color: #ff9db0; }
        .plib-admin { font-size: 11.5px; color: #6f9fe0; text-decoration: none; margin-top: 6px; }
        .plib-admin:hover { text-decoration: underline; }
        .plib-oos { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #bccee2; cursor: pointer; user-select: none; padding: 0 4px; }
        .plib-oos input { accent-color: #4c9bff; }
        .plib-stock { font-size: 11px; color: #a2b8d2; margin-left: 2px; }
        .plib-stock.zero { color: #ff9db0; }
        .plib-model-edit { margin-left: 12px; background: #1c2635; border: 1px solid rgba(120,170,230,.22); color: #cfe0f5; font-size: 11.5px; padding: 4px 11px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .plib-model-edit:hover { border-color: #4c9bff; color: #fff; }
        /* ----- bulk (model-wide) editor ----- */
        .plib-model-ed { background: #101a2b; border: 1px solid rgba(76,155,255,.35); border-left: 3px solid #4c9bff; margin: 8px 0 16px; }
        .plib-me-head { display: flex; align-items: flex-start; gap: 16px; padding: 16px 18px; border-bottom: 1px solid rgba(120,170,230,.18); }
        .plib-me-eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: #6fb0ff; }
        .plib-me-title { font-size: 19px; font-weight: 700; color: #ffffff; letter-spacing: -.2px; margin-top: 3px; }
        .plib-me-sub { font-size: 13px; line-height: 1.55; color: #b6c8de; margin-top: 7px; max-width: 640px; }
        .plib-me-sub b { color: #ffffff; font-weight: 700; }
        .plib-me-close { margin-left: auto; background: #1c2635; border: 1px solid rgba(120,170,230,.28); color: #dfeaf7; font-size: 12.5px; padding: 7px 16px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .plib-me-close:hover { border-color: #4c9bff; color: #fff; }
        .plib-cards { display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 18px; }
        .plib-card { background: #0c1420; border: 1px solid rgba(120,170,230,.18); padding: 15px 16px 0; position: relative; overflow: hidden; }
        .plib-card-head { display: flex; align-items: flex-start; gap: 12px; }
        .plib-card-num { flex-shrink: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(76,155,255,.16); color: #7cbaff; font-size: 12.5px; font-weight: 800; border-radius: 50%; }
        .plib-card-title { font-size: 15px; font-weight: 700; color: #f4f8fd; }
        .plib-card-blurb { font-size: 12.5px; line-height: 1.5; color: #a7bad4; margin-top: 4px; max-width: 620px; }
        .plib-card-blurb b { color: #dfeaf7; font-weight: 700; }
        .plib-card-now { font-size: 12.5px; color: #bccee2; margin: 11px 0 0 36px; padding: 6px 10px; background: rgba(120,170,230,.09); display: inline-block; font-variant-numeric: tabular-nums; }
        .plib-warn { color: #ffce6b; margin-left: 6px; }
        .plib-card .plib-row, .plib-card .plib-ta, .plib-card .plib-filerow { margin: 12px 0 0 36px; }
        .plib-card .plib-ta { width: calc(100% - 36px); }
        .plib-card-foot { display: flex; align-items: center; gap: 14px; margin: 12px 0 0 36px; padding-bottom: 15px; flex-wrap: wrap; }
        .plib-msave { background: #2f6fd6; border: 0; color: #fff; font-size: 13px; font-weight: 700; padding: 10px 18px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .plib-msave:hover { background: #4c9bff; }
        .plib-msave:disabled { background: #29405f; color: #b6c8de; cursor: default; }
        .plib-money { color: #9fb2cc; font-size: 14px; }
        #plib-overlay input[type=number].plib-in-money { width: 140px; font-size: 15px; padding: 10px 12px; }
        .plib-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(120,170,230,.12); opacity: 0; }
        .plib-bar.on { opacity: 1; }
        .plib-bar span { display: block; height: 100%; width: 0; background: #4c9bff; transition: width .15s linear; }
        .plib-me-msg { font-size: 12.5px; min-height: 16px; }
        .plib-me-msg.ok { color: #5cf0c4; } .plib-me-msg.err { color: #ffb0bf; }
        .plib-filerow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .plib-file-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
        .plib-filebtn { background: #1c2635; border: 1px solid rgba(120,170,230,.28); color: #dfeaf7; font-size: 12.5px; padding: 9px 15px; cursor: pointer; font-family: inherit; display: inline-block; }
        .plib-filebtn:hover { border-color: #4c9bff; color: #fff; }
        .plib-fileprev { display: none; width: 40px; height: 40px; object-fit: cover; border: 1px solid rgba(120,170,230,.22); }
        .plib-fileprev.on { display: block; }
        .plib-filename { font-size: 12.5px; color: #8ea3bf; }
        .plib-filename.has { color: #eaf2fb; }
        @media (max-width: 640px) { .plib-ed-grid { flex-direction: column; } .plib-g-meta { display: none; } }
        `;
        document.head.appendChild(s);
    }
};
