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
    _filter: { q: '', brand: '', gender: '', status: '' },
    _open: {},            // model key -> expanded?

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
        ['brand', 'gender', 'status'].forEach(function (k) {
            var el = o.querySelector('#plib-f-' + k);
            el.onchange = function () { self._filter[k] = el.value; self._render(); };
        });
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
            var key = (p.modelKeyGenderless || p.modelKey || p.title || '').toUpperCase().trim();
            if (!key) return;
            if (!by[key]) by[key] = { key: key, vendor: p.vendor || '', colorways: [] };
            by[key].colorways.push(p);
        });
        var groups = Object.keys(by).map(function (k) {
            var g = by[k];
            g.colorways.sort(function (a, b) {
                var ga = String(a.gender || ''), gb = String(b.gender || '');
                if (ga !== gb) return ga.localeCompare(gb);
                return String(a.colorName || a.title).localeCompare(String(b.colorName || b.title));
            });
            g.label = ProductLibrary._titleCase(g.key);
            g.count = g.colorways.length;
            return g;
        });
        groups.sort(function (a, b) {
            if (a.vendor !== b.vendor) return String(a.vendor).localeCompare(String(b.vendor));
            return a.label.localeCompare(b.label);
        });
        return groups;
    },
    _titleCase: function (s) {
        return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m, c) { return c.toUpperCase(); });
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
    _matchGroup: function (g) {
        var f = this._filter;
        if (f.brand && g.vendor !== f.brand) return false;
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
        var shown = this._groups.filter(function (g) { return self._matchGroup(g); });
        var totalCw = shown.reduce(function (t, g) { return t + g.colorways.filter(self._matchCw, self).length; }, 0);
        this._setStatus(shown.length + ' models, ' + totalCw + ' colorways' + (this._filterActive() ? ' (filtered)' : ''));
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
        var head = '<div class="plib-g-head" data-model="' + this._esc(g.key) + '">'
            + '<span class="plib-caret">' + (isOpen ? '▾' : '▸') + '</span>'
            + '<span class="plib-g-vendor">' + this._esc(g.vendor) + '</span>'
            + '<span class="plib-g-name">' + this._esc(g.label) + '</span>'
            + '<span class="plib-g-meta">' + cws.length + ' colorway' + (cws.length !== 1 ? 's' : '')
            + (Object.keys(genders).length ? ' · ' + Object.keys(genders).join(', ') : '')
            + (priceLbl ? ' · ' + priceLbl : '') + '</span></div>';
        var body = isOpen ? '<div class="plib-g-body">' + cws.map(function (p) { return self._cwRowHTML(p); }).join('') + '</div>' : '';
        return '<div class="plib-group' + (isOpen ? ' open' : '') + '">' + head + body + '</div>';
    },

    _cwRowHTML: function (p) {
        var st = String(p.status || '').toUpperCase();
        var stCls = st === 'ACTIVE' ? 'plib-st-active' : (st === 'DRAFT' ? 'plib-st-draft' : 'plib-st-arch');
        var width = p.width ? '<span class="plib-chip plib-chip-w">' + this._esc(p.width) + '</span>' : '';
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
            + '</div>'
            + '<div class="plib-cw-right"><span class="plib-cw-price">' + (p.price ? '$' + this._esc(p.price) : '—') + '</span>'
            + '<button class="plib-edit" data-id="' + this._esc(p.id) + '">Edit</button></div>'
            + '<div class="plib-editor" id="plib-ed-' + this._cssId(p.id) + '"></div>'
            + '</div>';
    },

    // ---------- interaction ----------
    _onListClick: function (e) {
        var head = e.target.closest && e.target.closest('.plib-g-head');
        if (head) {
            var m = head.getAttribute('data-model');
            this._open[m] = !this._open[m];
            this._render();
            return;
        }
        var edit = e.target.closest && e.target.closest('.plib-edit');
        if (edit) { this._toggleEditor(edit.getAttribute('data-id')); return; }
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
        .plib-g-head { display: flex; align-items: baseline; gap: 10px; padding: 13px 6px; cursor: pointer; }
        .plib-g-head:hover { background: rgba(120,170,230,.05); }
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
        @media (max-width: 640px) { .plib-ed-grid { flex-direction: column; } .plib-g-meta { display: none; } }
        `;
        document.head.appendChild(s);
    }
};
