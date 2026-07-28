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
    _filter: { q: '', brand: '', gender: '', status: '', sort: 'modified', showOOS: false },
    _open: {},            // model key -> expanded?
    _modelEdit: {},       // model key -> model-wide editor open?

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
            var vendor = p.vendor || '';
            // Group by vendor + cleaned model, so width variants the parser split
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
            var hay = (p.title + ' ' + (p.colorName || '') + ' ' + (p.vendor || '') + ' ' + (p.modelKeyGenderless || '') + ' ' + (p.skus || []).join(' ')).toLowerCase();
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
        // Sort: recently modified (default) or A to Z by vendor then model.
        if (this._filter.sort === 'az') {
            shown.sort(function (a, b) {
                if (a.vendor !== b.vendor) return String(a.vendor).localeCompare(String(b.vendor));
                return a.label.localeCompare(b.label);
            });
        } else if (this._filter.sort === 'stock') {
            shown.sort(function (a, b) {
                if (b._stock !== a._stock) return b._stock - a._stock; // most inventory first
                return a.label.localeCompare(b.label);
            });
        } else {
            shown.sort(function (a, b) {
                if (a._modified !== b._modified) return a._modified < b._modified ? 1 : -1; // newest first
                return a.label.localeCompare(b.label);
            });
        }
        var hidden = this._groups.length - shown.length;
        var totalCw = shown.reduce(function (t, g) { return t + g.colorways.filter(self._matchCw, self).length; }, 0);
        this._setStatus(shown.length + ' models, ' + totalCw + ' colorways'
            + (this._filterActive() ? ' (filtered)' : '')
            + (!this._filter.showOOS && this._oosHidden ? ' · ' + this._oosHidden + ' out-of-stock models hidden' : ''));
        if (!shown.length) { list.innerHTML = '<div class="plib-empty">No products match.</div>'; return; }
        list.innerHTML = shown.map(function (g) { return self._groupHTML(g); }).join('');
    },
    _filterActive: function () { var f = this._filter; return !!(f.q || f.brand || f.gender || f.status); },

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
        var head = '<div class="plib-g-head" data-model="' + this._esc(g.key) + '">'
            + '<span class="plib-caret">' + (isOpen ? '▾' : '▸') + '</span>'
            + gthumb
            + '<span class="plib-g-vendor">' + this._esc(g.vendor) + '</span>'
            + '<span class="plib-g-name">' + this._esc(g.label) + '</span>'
            + '<span class="plib-g-meta">' + cws.length + ' colorway' + (cws.length !== 1 ? 's' : '')
            + (Object.keys(genders).length ? ' · ' + Object.keys(genders).join(', ') : '')
            + (priceLbl ? ' · ' + priceLbl : '') + '</span>'
            + '<button class="plib-model-edit" data-model="' + this._esc(g.key) + '" title="Change price, description or photo for every colorway at once">Edit all</button>'
            + '</div>';
        var editor = (isOpen && this._modelEdit[g.key]) ? this._modelEditorHTML(g, cws) : '';
        var body = isOpen ? '<div class="plib-g-body">' + editor + cws.map(function (p) { return self._cwRowHTML(p); }).join('') + '</div>' : '';
        return '<div class="plib-group' + (isOpen ? ' open' : '') + '">' + head + body + '</div>';
    },

    _cwRowHTML: function (p) {
        var st = String(p.status || '').toUpperCase();
        var stCls = st === 'ACTIVE' ? 'plib-st-active' : (st === 'DRAFT' ? 'plib-st-draft' : 'plib-st-arch');
        var wl = this._widthLabel(p.width);
        var width = wl ? '<span class="plib-chip plib-chip-w">' + this._esc(wl) + '</span>' : '';
        var stock = (typeof p.totalOnHand === 'number')
            ? '<span class="plib-stock' + (p.totalOnHand === 0 ? ' zero' : '') + '" title="On hand across all locations">' + p.totalOnHand + ' in stock</span>'
            : '';
        var thumb = p.image
            ? '<img class="plib-thumb" src="' + this._esc(p.image) + '" alt="" loading="lazy">'
            : '<span class="plib-thumb plib-thumb-none"></span>';
        return '<div class="plib-cw" data-id="' + this._esc(p.id) + '">'
            + '<div class="plib-cw-main">'
            + thumb
            + '<span class="plib-st ' + stCls + '">' + (st || '?') + '</span>'
            + '<span class="plib-cw-color">' + this._esc(p.colorName || p.title) + '</span>'
            + (p.gender ? '<span class="plib-chip">' + this._esc(p.gender) + '</span>' : '')
            + width
            + stock
            + '</div>'
            + '<div class="plib-cw-right"><span class="plib-cw-price">' + (p.price ? '$' + this._esc(p.price) : '—') + '</span>'
            + '<button class="plib-edit" data-id="' + this._esc(p.id) + '">Edit</button></div>'
            + '<div class="plib-editor" id="plib-ed-' + this._cssId(p.id) + '"></div>'
            + '</div>';
    },

    // ---------- interaction ----------
    _onListClick: function (e) {
        var t = e.target;
        if (!t.closest) return;
        var mEdit = t.closest('.plib-model-edit');
        if (mEdit) {
            e.stopPropagation();
            var mk = mEdit.getAttribute('data-model');
            this._open[mk] = true;
            this._modelEdit[mk] = !this._modelEdit[mk];
            this._render();
            return;
        }
        var mSave = t.closest('.plib-msave');
        if (mSave) { this._applyModel(mSave.getAttribute('data-mact'), mSave.getAttribute('data-model')); return; }
        var edit = t.closest('.plib-edit');
        if (edit) { this._toggleEditor(edit.getAttribute('data-id')); return; }
        var head = t.closest('.plib-g-head');
        if (head) { var m = head.getAttribute('data-model'); this._open[m] = !this._open[m]; this._render(); return; }
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
    _modelEditorHTML: function (g, cws) {
        var k = this._cssId(g.key);
        var n = cws.length;
        return '<div class="plib-model-ed">'
            + '<div class="plib-me-title">Change all ' + n + ' colorway' + (n !== 1 ? 's' : '') + ' of ' + this._esc(g.label) + ' at once</div>'
            + '<label class="plib-lab">Price ($) for every colorway and size</label>'
            + '<div class="plib-row"><input class="plib-in" id="plib-mprice-' + k + '" type="number" step="0.01" placeholder="e.g. 140"><button class="plib-msave" data-mact="price" data-model="' + this._esc(g.key) + '">Apply price to all</button></div>'
            + '<label class="plib-lab">Description for every colorway</label>'
            + '<textarea class="plib-ta" id="plib-mdesc-' + k + '" placeholder="Shared description, HTML allowed"></textarea>'
            + '<div class="plib-row"><button class="plib-msave" data-mact="desc" data-model="' + this._esc(g.key) + '">Apply description to all</button></div>'
            + '<label class="plib-lab">Add a photo to every colorway</label>'
            + '<div class="plib-row"><input class="plib-file" id="plib-mphoto-' + k + '" type="file" accept="image/*"><button class="plib-msave" data-mact="photo" data-model="' + this._esc(g.key) + '">Add photo to all</button></div>'
            + '<div class="plib-me-msg" id="plib-mstatus-' + k + '"></div>'
            + '</div>';
    },

    _applyModel: function (act, key) {
        var self = this;
        var g = null;
        (this._groups || []).some(function (x) { if (x.key === key) { g = x; return true; } return false; });
        if (!g) return;
        if (!this._ensureSecret()) { this._mMsg(key, 'Need the write secret to save.', true); return; }
        var cws = g.colorways, k = this._cssId(key);
        if (act === 'price') {
            var price = parseFloat(document.getElementById('plib-mprice-' + k).value.trim());
            if (isNaN(price) || price < 0) { this._mMsg(key, 'Enter a valid price.', true); return; }
            var pv = price.toFixed(2);
            this._runAll(key, cws, 'price to $' + pv, function (p) {
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
            if (!html.trim()) { this._mMsg(key, 'Enter a description.', true); return; }
            this._runAll(key, cws, 'description', function (p) {
                return CatalogClient.updateProductDescription(p.id, html).then(function (r) {
                    if (r.__status === 200 && r.ok && self._detail[p.id]) self._detail[p.id].descriptionHtml = html;
                    return r;
                });
            });
        } else if (act === 'photo') {
            var input = document.getElementById('plib-mphoto-' + k);
            var file = input.files && input.files[0];
            if (!file) { this._mMsg(key, 'Choose an image first.', true); return; }
            this._mMsg(key, 'Uploading photo...');
            this._uploadImage(file).then(function (url) {
                self._runAll(key, cws, 'photo', function (p) { return CatalogClient.addProductMedia(p.id, url, p.title); });
            }).catch(function (e) { self._mMsg(key, 'Upload failed: ' + self._esc(e && e.message || String(e)), true); });
        }
    },

    // Run fn over every colorway, one at a time (gentle on rate limits), updating
    // a live count. Stops on a refusal (bad write secret). fn returns the write
    // response (or a promise of it).
    _runAll: function (key, items, label, fn) {
        var self = this, total = items.length, ok = 0, fail = 0, stopped = false;
        (function step(i) {
            if (stopped) return;
            if (i >= total) {
                self._mMsg(key, (fail ? '✓ ' + ok + ' updated, ' + fail + ' failed' : '✓ All ' + ok + ' colorways updated') + ' (' + label + ').', fail > 0);
                return;
            }
            self._mMsg(key, 'Saving ' + label + '... ' + (i + 1) + ' / ' + total);
            Promise.resolve(fn(items[i])).then(function (r) {
                if (r && self._refused(r)) { stopped = true; self._mMsg(key, 'Write refused (HTTP ' + r.__status + '): ' + self._esc(r.reason || r.error || 'check the write secret'), true); return; }
                if (r && ((r.__status && r.__status !== 200) || r.ok === false)) fail++; else ok++;
                step(i + 1);
            }).catch(function () { fail++; step(i + 1); });
        })(0);
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

    _mMsg: function (key, html, isErr) {
        var el = document.getElementById('plib-mstatus-' + this._cssId(key));
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
            + '<select id="plib-f-sort" class="plib-sel"><option value="modified">Recently modified</option><option value="stock">Most inventory</option><option value="az">A to Z</option></select>'
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
        .plib-eyebrow { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; color: #6f83a0; font-weight: 700; }
        .plib-title { font-size: 24px; font-weight: 700; letter-spacing: -.5px; color: #eef4fc; margin-top: 4px; }
        .plib-x { background: none; border: 0; color: #9fb2cc; font-size: 26px; line-height: 1; cursor: pointer; padding: 4px 8px; }
        .plib-x:hover { color: #fff; }
        .plib-controls { display: flex; gap: 10px; padding: 4px 26px 12px; flex-wrap: wrap; }
        .plib-search { flex: 1; min-width: 220px; padding: 10px 13px; background: #131b28; border: 1px solid rgba(120,170,230,.18); color: #eef4fc; font-size: 14px; font-family: inherit; outline: none; }
        .plib-search:focus { border-color: #4c9bff; }
        .plib-sel { padding: 10px 12px; background: #131b28; border: 1px solid rgba(120,170,230,.18); color: #cfe0f5; font-size: 13px; font-family: inherit; outline: none; cursor: pointer; }
        .plib-status { padding: 0 26px 10px; font-size: 12px; color: #7f93b0; }
        .plib-status.err { color: #ff9db0; }
        .plib-list { flex: 1; overflow-y: auto; padding: 0 26px 40px; }
        .plib-list::-webkit-scrollbar { width: 10px; } .plib-list::-webkit-scrollbar-thumb { background: rgba(120,160,220,.22); border-radius: 5px; }
        .plib-empty { padding: 40px; text-align: center; color: #6f83a0; }
        .plib-group { border-bottom: 1px solid rgba(120,170,230,.10); }
        .plib-g-head { display: flex; align-items: center; gap: 10px; padding: 11px 6px; cursor: pointer; }
        .plib-g-head:hover { background: rgba(120,170,230,.05); }
        .plib-g-thumb { width: 30px; height: 30px; object-fit: cover; background: #0b111d; flex-shrink: 0; border: 1px solid rgba(120,170,230,.12); }
        .plib-caret { color: #6f83a0; font-size: 11px; width: 12px; }
        .plib-g-vendor { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #6f83a0; font-weight: 700; min-width: 64px; }
        .plib-g-name { font-size: 15px; font-weight: 600; color: #eef4fc; }
        .plib-g-meta { font-size: 12px; color: #7f93b0; margin-left: auto; }
        .plib-g-body { padding: 2px 0 12px 22px; }
        .plib-cw { border-top: 1px solid rgba(120,170,230,.07); }
        .plib-cw-main { display: flex; align-items: center; gap: 9px; padding: 9px 6px 9px 0; }
        .plib-thumb { width: 34px; height: 34px; object-fit: cover; background: #0b111d; flex-shrink: 0; border: 1px solid rgba(120,170,230,.10); }
        .plib-thumb-none { background: repeating-linear-gradient(45deg, #0f1622, #0f1622 4px, #131b28 4px, #131b28 8px); }
        .plib-cw-right { display: none; }
        .plib-cw { display: grid; grid-template-columns: 1fr auto; align-items: center; }
        .plib-cw > .plib-cw-main { grid-column: 1; }
        .plib-cw > .plib-cw-right { grid-column: 2; display: flex; align-items: center; gap: 12px; }
        .plib-cw > .plib-editor { grid-column: 1 / -1; }
        .plib-st { font-size: 9.5px; font-weight: 800; letter-spacing: .4px; padding: 2px 6px; border-radius: 2px; }
        .plib-st-active { background: rgba(60,230,176,.15); color: #3ce6b0; }
        .plib-st-draft { background: rgba(255,192,77,.15); color: #ffc04d; }
        .plib-st-arch { background: rgba(159,178,204,.14); color: #9fb2cc; }
        .plib-cw-color { font-size: 13.5px; color: #dfe9f6; }
        .plib-chip { font-size: 10.5px; color: #9fb2cc; background: rgba(120,170,230,.10); padding: 2px 7px; }
        .plib-chip-w { color: #cbd8ea; }
        .plib-cw-price { font-size: 13px; color: #cfe0f5; font-variant-numeric: tabular-nums; }
        .plib-edit { background: #1c2635; border: 1px solid rgba(120,170,230,.22); color: #cfe0f5; font-size: 12px; padding: 5px 12px; cursor: pointer; font-family: inherit; }
        .plib-edit:hover { border-color: #4c9bff; color: #fff; }
        .plib-editor { display: none; }
        .plib-editor.open { display: block; padding: 4px 0 16px; }
        .plib-ed-loading, .plib-ed-err { font-size: 12px; color: #7f93b0; padding: 10px 2px; }
        .plib-ed-err { color: #ff9db0; }
        .plib-ed-grid { display: flex; gap: 18px; background: #111825; border: 1px solid rgba(120,170,230,.12); padding: 16px; }
        .plib-ed-img { width: 120px; height: 120px; object-fit: cover; background: #0b111d; flex-shrink: 0; }
        .plib-ed-noimg { display: flex; align-items: center; justify-content: center; font-size: 11px; color: #55688a; }
        .plib-ed-fields { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .plib-lab { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #7f93b0; font-weight: 700; margin-top: 8px; }
        .plib-hint { font-size: 11px; color: #6f83a0; font-weight: 400; text-transform: none; letter-spacing: 0; }
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
        .plib-oos { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #9fb2cc; cursor: pointer; user-select: none; padding: 0 4px; }
        .plib-oos input { accent-color: #4c9bff; }
        .plib-stock { font-size: 10.5px; color: #7f9ab8; margin-left: 2px; }
        .plib-stock.zero { color: #ff9db0; }
        .plib-model-edit { margin-left: 12px; background: #1c2635; border: 1px solid rgba(120,170,230,.22); color: #cfe0f5; font-size: 11.5px; padding: 4px 11px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .plib-model-edit:hover { border-color: #4c9bff; color: #fff; }
        .plib-model-ed { background: #10192a; border: 1px solid rgba(76,155,255,.28); padding: 15px 16px; margin: 6px 0 12px; display: flex; flex-direction: column; gap: 6px; }
        .plib-me-title { font-size: 13px; font-weight: 700; color: #cfe0f5; margin-bottom: 4px; }
        .plib-me-msg { font-size: 12px; min-height: 16px; margin-top: 4px; }
        .plib-me-msg.ok { color: #3ce6b0; } .plib-me-msg.err { color: #ff9db0; }
        .plib-file { font-size: 12px; color: #9fb2cc; font-family: inherit; max-width: 260px; }
        .plib-file::file-selector-button { background: #1c2635; border: 1px solid rgba(120,170,230,.22); color: #cfe0f5; font-size: 12px; padding: 6px 10px; margin-right: 8px; cursor: pointer; font-family: inherit; }
        @media (max-width: 640px) { .plib-ed-grid { flex-direction: column; } .plib-g-meta { display: none; } }
        `;
        document.head.appendChild(s);
    }
};
