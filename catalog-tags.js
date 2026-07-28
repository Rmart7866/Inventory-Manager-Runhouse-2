// ========== CATALOG TAGGING ==========
// Run the width, cw-group (swatch), and gender tag operations across the live
// catalog, from the dashboard, instead of the old CLI scripts. The plan is
// computed HERE in the browser from the cached /catalog (which now carries each
// product's id, tags, cwGroup, widthTag, gender, and productType), shown as a
// dry-run, and then applied in chunks through the Worker's write-gated
// POST /tags/apply.
//
// Tags are edited additively/subtractively: this only ever adds the correct tag
// and removes a stale cw-group: or wrong gender tag. Any tag it does not mention
// is left untouched. Product type is corrected to the gendered "* Shoes" only
// when gender tagging is on and the current type disagrees.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var CatalogTags = {
    // Canonical gender tag is the gendered "* Shoes" form (the store's convention,
    // same string as the product type). The op adds this and strips every OTHER
    // gender-tag variant the catalog has accumulated (men, mens, Men's, mens
    // shoes, Women, womens, ...), so one clean tag wins.
    GENDER_TAG: { "Men's": "Men's Shoes", "Women's": "Women's Shoes", 'Unisex': 'Unisex Shoes' },
    GENDER_TYPE: { "Men's": "Men's Shoes", "Women's": "Women's Shoes", 'Unisex': 'Unisex Shoes' },
    CHUNK: 100,
    // A tag is a gender tag if it normalizes to a gender word, optionally + "shoes".
    _isGenderTag: function (t) {
        var s = String(t).toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
        return /^(men|mens|man|men's|women|womens|woman|women's|unisex)( shoes)?$/.test(s);
    },
    // A tag is a width tag: wide / extra wide / x-wide / narrow, any case or spacing.
    _isWidthTag: function (t) {
        var s = String(t).toLowerCase().replace(/\s+/g, ' ').trim();
        return /^(wide|extra[\s-]?wide|x[\s-]?wide|narrow)$/.test(s);
    },

    // Which statuses get tagged. ARCHIVED is retired, leave it alone.
    _taggable: function (status) { return status === 'ACTIVE' || status === 'DRAFT'; },

    // PURE. Compute the change plan from catalog products + selected ops.
    // ops = { width, swatch, gender }. Returns { changes, summary }.
    computePlan: function (products, ops) {
        var self = this;
        var changes = [];
        var summary = { products: 0, widthAdds: 0, widthRemoves: 0, swatchAdds: 0, swatchRemoves: 0, genderAdds: 0, genderRemoves: 0, typeFixes: 0, scanned: 0 };
        (products || []).forEach(function (p) {
            if (!self._taggable(p.status)) return;
            if (!p.id) return; // need the gid to write
            summary.scanned++;
            var tags = p.tags || [];
            var has = function (t) { return tags.indexOf(t) !== -1; };
            var add = [], remove = [], newType = null;

            if (ops.width && p.widthTag) {                       // 'wide' | 'extra wide' | 'narrow' (lowercase)
                if (!has(p.widthTag)) { add.push(p.widthTag); summary.widthAdds++; }   // add-only
            }
            if (ops.swatch && p.cwGroup) {
                if (!has(p.cwGroup)) { add.push(p.cwGroup); summary.swatchAdds++; }    // add-only
            }
            if (ops.gender && p.gender) {
                var canon = self.GENDER_TAG[p.gender];           // "Men's Shoes" | "Women's Shoes" | "Unisex Shoes"
                if (canon) {
                    // ADD-ONLY (owner's choice): add the canonical tag + fix the
                    // product type, but never strip existing gender-tag variants,
                    // so no collection or filter that relies on one can break.
                    if (!has(canon)) { add.push(canon); summary.genderAdds++; }
                    var correctType = self.GENDER_TYPE[p.gender];
                    if (correctType && p.productType !== correctType) { newType = correctType; summary.typeFixes++; }
                }
            }

            if (add.length || remove.length || newType) {
                var c = { id: p.id, handle: p.handle, title: p.title, add: add, remove: remove };
                if (newType) c.productType = newType;
                changes.push(c);
                summary.products++;
            }
        });
        return { changes: changes, summary: summary };
    },

    // ===== Swatch sibling metafields (Phase 2) =====
    // groupProducts + buildMetafieldInputs, the same logic as worker/src/group.js
    // and the Color Swatch index.js. Computes the style/width/gender sibling
    // references + color_name/width_code helpers the PDP swatch snippet reads.
    _widthClassG: function (code) {
        var c = String(code || 'STD').toUpperCase();
        if (c === 'STD' || c === 'D' || c === 'B') return 'standard';
        if (c === 'NARROW' || c === '2A' || c === 'A') return 'narrow';
        if (c === 'WIDE' || c === '2E' || c === 'EE' || c === 'E') return 'wide';
        if (c === 'XWIDE' || c === '4E' || c === 'EEEE' || c === '6E') return 'xwide';
        return 'standard';
    },
    _norm: function (s) { return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim(); },
    _groupProducts: function (records) {
        var self = this;
        var recs = records.map(function (r) {
            return Object.assign({}, r, {
                _wclass: self._widthClassG(r.width),
                _styleKey: self._norm(r.modelKey) + '|' + self._widthClassG(r.width),
                _colorKey: self._norm(r.modelKey) + '|' + self._norm(r.colorName),
                _modelKey: self._norm(r.modelKey),
                _genderlessKey: self._norm(r.modelKeyGenderless)
            });
        });
        var byStyle = new Map(), byColor = new Map(), byModel = new Map(), byGenderless = new Map();
        recs.forEach(function (r) {
            if (!byStyle.has(r._styleKey)) byStyle.set(r._styleKey, []); byStyle.get(r._styleKey).push(r);
            if (!byColor.has(r._colorKey)) byColor.set(r._colorKey, []); byColor.get(r._colorKey).push(r);
            if (!byModel.has(r._modelKey)) byModel.set(r._modelKey, new Set()); byModel.get(r._modelKey).add(r._wclass);
            if (!byGenderless.has(r._genderlessKey)) byGenderless.set(r._genderlessKey, []); byGenderless.get(r._genderlessKey).push(r);
        });
        var ids = function (arr) { return arr.map(function (x) { return x.id; }); };
        var sortByColor = function (arr) { return arr.slice().sort(function (a, b) { return String(a.colorName).localeCompare(String(b.colorName)); }); };
        var plan = {};
        recs.forEach(function (r) {
            var styleGroup = sortByColor(byStyle.get(r._styleKey));
            var colorGroup = byColor.get(r._colorKey);
            var family = byGenderless.get(r._genderlessKey) || [];
            var otherGenders = new Map();
            family.forEach(function (o) {
                if (o.gender === r.gender || !o.gender) return;
                var cur = otherGenders.get(o.gender);
                var better = !cur
                    || (o._wclass === 'standard' && cur._wclass !== 'standard')
                    || (o._wclass === cur._wclass && String(o.id).localeCompare(String(cur.id)) < 0);
                if (better) otherGenders.set(o.gender, o);
            });
            plan[r.id] = {
                gender: r.gender, width_code: r.width, width_class: r._wclass, color_name: r.colorName,
                model_widths: Array.from(byModel.get(r._modelKey) || []).sort(),
                style_siblings: ids(styleGroup),
                width_siblings: ids(sortByColor(colorGroup)),
                gender_sibling: Array.from(otherGenders.values()).map(function (x) { return x.id; })
            };
        });
        return plan;
    },
    _buildMetafieldInputs: function (plan) {
        var NS = 'custom', inputs = [];
        Object.keys(plan).forEach(function (ownerId) {
            var g = plan[ownerId];
            var refList = function (key, arr) { if (!arr || !arr.length) return; inputs.push({ ownerId: ownerId, namespace: NS, key: key, type: 'list.product_reference', value: JSON.stringify(arr) }); };
            refList('style_siblings', g.style_siblings);
            refList('width_siblings', g.width_siblings);
            refList('gender_sibling', g.gender_sibling);
            var textField = function (key, type, value) { var v = value == null ? '' : String(value); if (v === '') return; inputs.push({ ownerId: ownerId, namespace: NS, key: key, type: type, value: v }); };
            textField('model_widths', 'list.single_line_text_field', (g.model_widths && g.model_widths.length) ? JSON.stringify(g.model_widths) : '');
            textField('width_code', 'single_line_text_field', g.width_code);
            textField('width_class', 'single_line_text_field', g.width_class);
            textField('gender', 'single_line_text_field', g.gender);
            textField('color_name', 'single_line_text_field', g.color_name);
        });
        return inputs;
    },
    // Compute the metafield inputs for ACTIVE footwear (siblings must be buyable,
    // so drafts/archived are excluded from the grouping), then DIFF each against
    // the product's current custom.* value and keep only the ones that changed.
    // So a run on an already-correct catalog writes nothing; after adding a few
    // colorways it writes just the siblings that actually moved.
    // opts.modelKeys (optional): a Set of normalized modelKeyGenderless values.
    // When given, only products in those model families are grouped and diffed,
    // so an after-create pass touches just the affected models, never all ~3,000
    // shoes. Grouping is model-local (siblings never cross a modelKeyGenderless),
    // so a scoped plan is identical to what a full run would produce for those
    // families.
    computeMetafields: function (products, opts) {
        var self = this;
        var keyFilter = opts && opts.modelKeys;
        var active = (products || []).filter(function (p) {
            if (!(p.status === 'ACTIVE' && p.id && p.modelKey && p.colorName)) return false;
            if (keyFilter && !keyFilter.has(self._norm(p.modelKeyGenderless))) return false;
            return true;
        });
        var mfById = {};
        active.forEach(function (p) { mfById[p.id] = p.mf || {}; });
        var records = active.map(function (p) {
            return { id: p.id, gender: p.gender, colorName: p.colorName, modelKey: p.modelKey, modelKeyGenderless: p.modelKeyGenderless, width: p.width };
        });
        var plan = this._groupProducts(records);
        var allInputs = this._buildMetafieldInputs(plan);
        var changed = [], productsChanged = {};
        allInputs.forEach(function (inp) {
            var cur = (mfById[inp.ownerId] || {})[inp.key];
            if (self._mfEqual(cur, inp.value, inp.type)) return; // already correct
            changed.push(inp); productsChanged[inp.ownerId] = true;
        });
        return { inputs: changed, summary: { products: Object.keys(productsChanged).length, metafields: changed.length, scanned: active.length } };
    },
    // A stored metafield value equals a computed one? For list types both sides are
    // JSON arrays, so compare normalized JSON (formatting is not a real change).
    _mfEqual: function (current, computed, type) {
        if (current == null) return false;              // missing -> write it
        if (current === computed) return true;
        if (type && type.indexOf('list.') === 0) {
            try { return JSON.stringify(JSON.parse(current)) === JSON.stringify(JSON.parse(computed)); } catch (e) { return false; }
        }
        return false;
    },

    // ===== Auto swatch wiring after create (SHARED queue) =====
    // New colorways are created as DRAFT, so their swatch cross-links cannot be
    // written yet: the swatch group only includes ACTIVE products. We remember
    // the created handles in a Firestore queue (shared across staff, mirrors the
    // Ignore list) and, on every catalog load and right after a create, check
    // whether any queued handle is now ACTIVE. The ones that are get their model
    // family, and ONLY that family, re-grouped and written, then dropped from the
    // queue. Steady state (empty queue) is a single Firestore read.
    _swColl: function (brand) { return db.collection('swatch-queue').doc(brand || '_default').collection('items'); },
    _swDocId: function (h) { return String(h || '_').replace(/[\/.#$\[\]]/g, '_').slice(0, 200) || '_'; },
    _swLsKey: function (brand) { return 'rhSwatchQueue:' + (brand || '_default'); },
    _swLocal: function (brand) {
        var raw = {}; try { raw = JSON.parse(localStorage.getItem(this._swLsKey(brand)) || '{}'); } catch (e) { raw = {}; }
        var out = {}; Object.keys(raw).forEach(function (h) { out[h] = { handle: h, title: (raw[h] && raw[h].title) || h, ts: (raw[h] && raw[h].ts) || 0 }; });
        return out;
    },
    _swSaveLocal: function (brand, map) { try { localStorage.setItem(this._swLsKey(brand), JSON.stringify(map)); } catch (e) { /* no localStorage */ } },

    // Remember created handles so their swatches get wired once they go live.
    queueSwatch: function (brand, entries) {
        var self = this;
        var arr = (entries || []).filter(function (e) { return e && e.handle; });
        if (!arr.length) return;
        var raw = {}; try { raw = JSON.parse(localStorage.getItem(self._swLsKey(brand)) || '{}'); } catch (e) { raw = {}; }
        arr.forEach(function (e) {
            var rec = { title: e.title || e.handle, ts: Date.now() };
            raw[e.handle] = rec;
            if (typeof db !== 'undefined') { try { self._swColl(brand).doc(self._swDocId(e.handle)).set(rec).catch(function () {}); } catch (x) { /* db missing */ } }
        });
        self._swSaveLocal(brand, raw);
    },
    _swLoad: function (brand) {
        var self = this;
        var getP;
        if (typeof db === 'undefined') return Promise.resolve(self._swLocal(brand));
        try { getP = self._swColl(brand).get(); } catch (e) { return Promise.resolve(self._swLocal(brand)); }
        return getP.then(function (snap) {
            var map = {};
            snap.forEach(function (d) { var x = d.data() || {}; map[d.id] = { handle: d.id, title: x.title || d.id, ts: x.ts || 0 }; });
            var local = self._swLocal(brand);   // fold in any set still in flight
            Object.keys(local).forEach(function (h) { if (!map[h]) map[h] = local[h]; });
            return map;
        }).catch(function () { return self._swLocal(brand); });
    },
    _swRemove: function (brand, handles) {
        var self = this;
        var raw = {}; try { raw = JSON.parse(localStorage.getItem(self._swLsKey(brand)) || '{}'); } catch (e) { raw = {}; }
        (handles || []).forEach(function (h) {
            delete raw[h];
            if (typeof db !== 'undefined') { try { self._swColl(brand).doc(self._swDocId(h)).delete().catch(function () {}); } catch (x) { /* db missing */ } }
        });
        self._swSaveLocal(brand, raw);
    },

    // Wire any now-ACTIVE queued colorways into their swatch group. Scoped to the
    // affected model families only. Safe to call on every load: no-op when the
    // queue is empty, when nothing has gone live yet, or when there is no write
    // secret (it just waits for a session that has one). Never throws.
    processSwatchQueue: function (brand) {
        var self = this;
        if (!brand || typeof db === 'undefined') return Promise.resolve(null);
        if (localStorage.getItem('rhAutoSwatch') === '0') return Promise.resolve(null);   // kill switch
        if (typeof CatalogClient === 'undefined' || !CatalogClient.hasWriteSecret || !CatalogClient.hasWriteSecret()) return Promise.resolve(null);
        return self._swLoad(brand).then(function (queue) {
            var handles = Object.keys(queue || {});
            if (!handles.length) return null;
            return CatalogClient.fetchCatalog().then(function (catalog) {
                var byHandle = {};
                (catalog.products || []).forEach(function (p) { if (p.handle) byHandle[p.handle] = p; });
                var affected = new Set(), ready = [], stale = [];
                handles.forEach(function (h) {
                    var p = byHandle[h];
                    if (!p) { if (queue[h].ts && (Date.now() - queue[h].ts) > 30 * 864e5) stale.push(h); return; } // not in a build yet; drop if very old
                    if (p.status !== 'ACTIVE') return;   // still a draft: keep waiting
                    ready.push(h);
                    var k = self._norm(p.modelKeyGenderless);
                    if (k) affected.add(k);
                });
                if (stale.length) self._swRemove(brand, stale);
                if (!ready.length || !affected.size) return null;
                var plan = self.computeMetafields(catalog.products, { modelKeys: affected });
                var inputs = plan.inputs || [];
                if (!inputs.length) { self._swRemove(brand, ready); return { wired: ready.length, metafields: 0 }; } // already correct
                var chunks = []; for (var i = 0; i < inputs.length; i += 200) chunks.push(inputs.slice(i, i + 200));
                var set = 0, refused = false;
                function step(idx) {
                    if (refused || idx >= chunks.length) return Promise.resolve();
                    return CatalogClient.applyMetafields(chunks[idx]).then(function (r) {
                        if ([401, 403, 501].indexOf(r.__status) >= 0) { refused = true; return; }
                        set += (r.set || 0);
                        return step(idx + 1);
                    });
                }
                return step(0).then(function () {
                    if (refused) return null;   // keep queued for a session that can write
                    self._swRemove(brand, ready);
                    if (typeof showToast === 'function' && set > 0) showToast('Wired ' + ready.length + ' new colorway' + (ready.length !== 1 ? 's' : '') + ' into color swatches');
                    console.log('[swatch-queue] wired ' + ready.length + ' colorway(s), ' + set + ' metafields across ' + affected.size + ' model(s)');
                    return { wired: ready.length, metafields: set, models: affected.size };
                });
            });
        }).catch(function (e) { console.warn('[swatch-queue]', e && e.message); return null; });
    },

    // ===== UI =====
    _plan: null,

    open: function () {
        var self = this;
        if (typeof CatalogClient === 'undefined') { alert('Catalog not available.'); return; }
        var overlay = document.getElementById('ctags-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'ctags-overlay';
        overlay.innerHTML = self._modalHTML();
        document.body.appendChild(overlay);
        document.body.classList.add('ctags-open');

        overlay.querySelector('#ctags-cancel').onclick = function () { self.close(); };
        overlay.querySelector('#ctags-preview').onclick = function () { self._preview(); };
        overlay.querySelector('#ctags-apply').onclick = function () { self._apply(); };
        overlay.addEventListener('click', function (e) { if (e.target === overlay) self.close(); });

        // Load the catalog so we have id + tags to plan against.
        self._setStatus('Loading catalog...');
        CatalogClient.fetchCatalog().then(function (catalog) {
            self._catalog = catalog;
            var withId = (catalog.products || []).filter(function (p) { return p.id && p.tags; }).length;
            if (!withId) {
                self._setStatus('This catalog build predates tagging support. Click "Refresh catalog" in the tool, wait a few minutes for the rebuild, then reopen.', true);
            } else {
                self._setStatus((catalog.products || []).length + ' footwear products loaded. Choose operations, then Preview.');
            }
        }).catch(function (err) {
            self._setStatus('Could not load catalog: ' + err.message, true);
        });
    },
    close: function () {
        var o = document.getElementById('ctags-overlay');
        if (o) o.remove();
        document.body.classList.remove('ctags-open');
        this._plan = null;
    },
    _ops: function () {
        return {
            width: document.getElementById('ctags-op-width').checked,
            swatch: document.getElementById('ctags-op-swatch').checked,
            gender: document.getElementById('ctags-op-gender').checked,
            metafields: document.getElementById('ctags-op-metafields').checked
        };
    },
    _setStatus: function (msg, isErr) {
        var el = document.getElementById('ctags-status');
        if (el) { el.textContent = msg; el.className = 'ctags-status' + (isErr ? ' ctags-status-err' : ''); }
    },
    _showProgress: function (show) {
        var w = document.getElementById('ctags-progress-wrap');
        if (w) w.style.display = show ? 'block' : 'none';
        if (show) { var l = document.getElementById('ctags-log'); if (l) l.innerHTML = ''; }
    },
    _bar: function (done, total, label) {
        var pct = total ? Math.round(done / total * 100) : 0;
        var b = document.getElementById('ctags-bar'); if (b) b.style.width = pct + '%';
        var t = document.getElementById('ctags-progress-txt'); if (t) t.textContent = label + '  ' + done + ' / ' + total + '  (' + pct + '%)';
    },
    _log: function (html) {
        var l = document.getElementById('ctags-log'); if (!l) return;
        var d = document.createElement('div'); d.className = 'ctags-log-line'; d.innerHTML = html; l.appendChild(d);
        while (l.childNodes.length > 250) l.removeChild(l.firstChild);
        l.scrollTop = l.scrollHeight;
    },
    _titleFor: function (id) { return (this._titleById && this._titleById[id]) || id; },
    _preview: function () {
        var self = this;
        if (!self._catalog) { self._setStatus('Catalog still loading, one moment.', true); return; }
        var ops = self._ops();
        if (!ops.width && !ops.swatch && !ops.gender && !ops.metafields) { self._setStatus('Pick at least one operation.', true); return; }
        var res = self.computePlan(self._catalog.products, ops);
        self._plan = res.changes;
        self._mf = ops.metafields ? self.computeMetafields(self._catalog.products) : null;
        var s = res.summary, mfCount = self._mf ? self._mf.inputs.length : 0;
        var body = document.getElementById('ctags-result');
        var lines = [];
        if (ops.width) lines.push('Width tags: <b>' + s.widthAdds + '</b> to add (add-only)');
        if (ops.swatch) lines.push('Swatch (cw-group) tags: <b>' + s.swatchAdds + '</b> to add (add-only)');
        if (ops.gender) lines.push('Gender tags: <b>' + s.genderAdds + '</b> to add (add-only, no removals); <b>' + s.typeFixes + '</b> product-type fixes');
        if (ops.metafields && self._mf) lines.push('Swatch metafields: <b>' + self._mf.summary.metafields + '</b> fields to update across <b>' + self._mf.summary.products + '</b> products (only where changed; ' + self._mf.summary.scanned + ' checked)');
        var sample = self._plan.slice(0, 10).map(function (c) {
            var bits = [];
            if (c.remove && c.remove.length) bits.push('<span class="ctags-rm">- ' + c.remove.join(', ') + '</span>');
            if (c.add && c.add.length) bits.push('<span class="ctags-ad">+ ' + c.add.join(', ') + '</span>');
            if (c.productType) bits.push('<span class="ctags-ty">type: ' + c.productType + '</span>');
            return '<div class="ctags-row"><div class="ctags-row-title">' + (c.title || c.handle) + '</div><div class="ctags-row-chg">' + bits.join(' ') + '</div></div>';
        }).join('');
        body.innerHTML = '<div class="ctags-summary">' + (lines.length ? lines.join('<br>') : '') + '</div>'
            + '<div class="ctags-total"><b>' + s.products + '</b> products get tag changes' + (mfCount ? ', <b>' + self._mf.summary.products + '</b> get metafields' : '') + '. ' + s.scanned + ' scanned.</div>'
            + (self._plan.length ? '<div class="ctags-samplbl">Sample tag changes</div>' + sample + (self._plan.length > 10 ? '<div class="ctags-more">...and ' + (self._plan.length - 10) + ' more</div>' : '') : '');
        var applyBtn = document.getElementById('ctags-apply');
        applyBtn.disabled = (self._plan.length === 0 && mfCount === 0);
        applyBtn.textContent = 'Apply';
        self._setStatus('Preview ready. Review, then Apply.');
    },
    // Two phases: tag changes (chunks of CHUNK products) then metafields (chunks
    // of 200 inputs). Either can be empty. Stops on a write-gate or network error.
    _apply: function () {
        var self = this;
        var hasTags = !!(self._plan && self._plan.length);
        var hasMf = !!(self._mf && self._mf.inputs && self._mf.inputs.length);
        if (!hasTags && !hasMf) return;
        if (!CatalogClient.hasWriteSecret || !CatalogClient.hasWriteSecret()) {
            var sec = prompt('Enter the write secret to apply changes:');
            if (!sec) { self._setStatus('Cancelled, no write secret.', true); return; }
            CatalogClient.setWriteSecret(sec);
        }
        var applyBtn = document.getElementById('ctags-apply'), prevBtn = document.getElementById('ctags-preview');
        applyBtn.disabled = true; prevBtn.disabled = true;
        // id -> title, so the live log can name each product as it writes.
        self._titleById = {};
        (self._catalog && self._catalog.products || []).forEach(function (p) { self._titleById[p.id] = p.title; });
        self._showProgress(true);
        var stopped = false;
        function stop(msg) { stopped = true; self._setStatus(msg, true); applyBtn.disabled = false; prevBtn.disabled = false; }
        function refused(r) { return [401, 403, 501].indexOf(r.__status) >= 0; }
        function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }

        function runTags(next) {
            if (!hasTags) return next(0, 0);
            var chunks = chunk(self._plan, self.CHUNK), total = self._plan.length, done = 0, failed = 0;
            self._bar(0, total, 'Tagging');
            (function step(idx) {
                if (stopped) return;
                if (idx >= chunks.length) return next(done - failed, failed);
                CatalogClient.applyTags(chunks[idx]).then(function (r) {
                    if (refused(r)) return stop('Write refused (HTTP ' + r.__status + '): ' + (r.reason || r.error || 'check the write secret') + '.');
                    var okById = {}; (r.results || []).forEach(function (x) { okById[x.id] = x.ok; if (!x.ok) console.warn('[tags]', x.id, x.errors); });
                    chunks[idx].forEach(function (c) {
                        var ok = okById[c.id] !== false;
                        var bits = [];
                        if (c.add && c.add.length) bits.push('<span class="ctags-ad">+' + c.add.join(', ') + '</span>');
                        if (c.productType) bits.push('<span class="ctags-ty">type ' + c.productType + '</span>');
                        self._log((ok ? '<span class="ctags-ok">✓</span> ' : '<span class="ctags-rm">✗</span> ') + (c.title || c.handle) + '  ' + bits.join(' '));
                    });
                    done += (r.total || chunks[idx].length); failed += (r.failed || 0);
                    self._bar(done, total, 'Tagging' + (failed ? ' (' + failed + ' failed)' : ''));
                    step(idx + 1);
                }).catch(function (e) { stop('Network error mid-apply: ' + e.message + '. Re-Preview and Apply to finish.'); });
            })(0);
        }
        function runMf(tOk, tFail) {
            if (!hasMf) return finish(tOk, tFail, 0, 0);
            var chunks = chunk(self._mf.inputs, 200), total = self._mf.inputs.length, set = 0, failed = 0;
            self._log('<span class="ctags-samplbl2">Writing swatch metafields</span>');
            self._bar(0, total, 'Metafields');
            (function step(idx) {
                if (stopped) return;
                if (idx >= chunks.length) return finish(tOk, tFail, set, failed);
                CatalogClient.applyMetafields(chunks[idx]).then(function (r) {
                    if (refused(r)) return stop('Write refused (HTTP ' + r.__status + '): ' + (r.reason || r.error || 'check the write secret') + '.');
                    // name the distinct products touched in this chunk
                    var seen = {}; chunks[idx].forEach(function (inp) { if (!seen[inp.ownerId]) { seen[inp.ownerId] = 1; self._log('<span class="ctags-ok">✓</span> ' + self._titleFor(inp.ownerId) + ' <span class="ctags-ty">siblings</span>'); } });
                    set += (r.set || 0); failed += (r.failed || 0);
                    self._bar(set, total, 'Metafields' + (failed ? ' (' + failed + ' failed)' : ''));
                    step(idx + 1);
                }).catch(function (e) { stop('Network error mid-apply: ' + e.message + '. Re-Preview and Apply to finish.'); });
            })(0);
        }
        function finish(tOk, tFail, mfSet, mfFail) {
            var msg = 'Done.';
            if (hasTags) msg += ' Tags: ' + tOk + ' products' + (tFail ? ', ' + tFail + ' failed' : '') + '.';
            if (hasMf) msg += ' Metafields: ' + mfSet + ' written' + (mfFail ? ', ' + mfFail + ' failed' : '') + '.';
            self._setStatus(msg + ' Refresh the catalog to see changes.', (tFail + mfFail) > 0);
            self._log('<span class="ctags-ok">✓ All done.</span>');
            applyBtn.textContent = 'Applied'; prevBtn.disabled = false;
        }
        self._setStatus('Applying, watch the log below.');
        runTags(function (tOk, tFail) { runMf(tOk, tFail); });
    },

    _modalHTML: function () {
        return '<div class="ctags-modal">'
            + '<div class="ctags-header"><div><div class="ctags-eyebrow">Catalog tools</div><div class="ctags-title">Catalog tagging</div>'
            + '<div class="ctags-sub">Apply width, swatch, and gender tags across the live catalog. Preview first, always.</div></div></div>'
            + '<div class="ctags-body">'
            + '<div class="ctags-ops">'
            + '<label class="ctags-op"><input type="checkbox" id="ctags-op-swatch" checked><div><div class="ctags-op-t">Swatch grouping</div><div class="ctags-op-h">The cw-group:model--width tags that drive the color-swatch grid. Adds the missing ones. Add-only, never removes.</div></div></label>'
            + '<label class="ctags-op"><input type="checkbox" id="ctags-op-width"><div><div class="ctags-op-t">Width tags</div><div class="ctags-op-h">Lowercase wide / extra wide / narrow, from the parsed width. Add-only, never removes.</div></div></label>'
            + '<label class="ctags-op"><input type="checkbox" id="ctags-op-gender"><div><div class="ctags-op-t">Gender + product type</div><div class="ctags-op-h">Adds the canonical "Men\'s Shoes" / "Women\'s Shoes" / "Unisex Shoes" tag + sets the matching product type. Add-only, never removes existing tags.</div></div></label>'
            + '<label class="ctags-op"><input type="checkbox" id="ctags-op-metafields"><div><div class="ctags-op-t">Swatch sibling metafields</div><div class="ctags-op-h">The custom.* style / width / gender sibling references + color_name / width_code the PDP swatch grid reads. Writes only the ones that actually changed (nothing if already correct).</div></div></label>'
            + '</div>'
            + '<div class="ctags-status" id="ctags-status">Loading catalog...</div>'
            + '<div class="ctags-progress-wrap" id="ctags-progress-wrap" style="display:none">'
            + '<div class="ctags-progress"><div class="ctags-bar" id="ctags-bar"></div></div>'
            + '<div class="ctags-progress-txt" id="ctags-progress-txt"></div>'
            + '<div class="ctags-log" id="ctags-log"></div>'
            + '</div>'
            + '<div class="ctags-result" id="ctags-result"></div>'
            + '</div>'
            + '<div class="ctags-footer">'
            + '<button class="ctags-btn ctags-btn-ghost" id="ctags-cancel">Close</button>'
            + '<button class="ctags-btn ctags-btn-secondary" id="ctags-preview">Preview changes</button>'
            + '<button class="ctags-btn ctags-btn-primary" id="ctags-apply" disabled>Apply</button>'
            + '</div>'
            + '</div>';
    }
};

// node test hook only; harmless in the browser.
if (typeof module !== 'undefined' && module.exports) module.exports = CatalogTags;

// ===== styles (dark, matches the app / enrichment redesign) =====
if (typeof document !== 'undefined') (function () {
    var style = document.createElement('style');
    style.textContent = `
        #ctags-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 26px 16px; background: rgba(4,7,13,.72); backdrop-filter: blur(4px); }
        body.ctags-open { overflow: hidden; }
        .ctags-modal { position: relative; width: 100%; max-width: 720px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; background: #111828; color: #e9f1fb; font-family: inherit; border: 1px solid rgba(90,150,230,.26); border-radius: 6px; box-shadow: 0 40px 90px rgba(0,0,0,.62); }
        .ctags-modal::before { content:""; position:absolute; left:0; right:0; top:0; height:3px; background: linear-gradient(90deg,#34e0ff,#7c8bff); }
        .ctags-header { padding: 24px 26px 18px; border-bottom: 1px solid rgba(120,170,230,.13); }
        .ctags-eyebrow { font-size: 11px; letter-spacing: 1.6px; text-transform: uppercase; color: #34e0ff; font-weight: 700; }
        .ctags-title { font-size: 22px; font-weight: 700; letter-spacing: -.4px; margin-top: 5px; }
        .ctags-sub { font-size: 13px; color: #9fb2cc; margin-top: 6px; }
        .ctags-body { padding: 20px 26px; overflow-y: auto; flex: 1; min-height: 0; }
        .ctags-ops { display: flex; flex-direction: column; gap: 10px; }
        .ctags-op { display: flex; gap: 12px; align-items: flex-start; padding: 14px; border: 1px solid rgba(120,170,230,.13); border-radius: 5px; background: #0b111d; cursor: pointer; }
        .ctags-op:hover { border-color: rgba(90,150,230,.26); }
        .ctags-op input { margin-top: 3px; width: 18px; height: 18px; accent-color: #34e0ff; flex-shrink: 0; }
        .ctags-op-t { font-size: 15px; font-weight: 700; }
        .ctags-op-h { font-size: 12.5px; color: #9fb2cc; margin-top: 3px; line-height: 1.5; }
        .ctags-status { margin-top: 16px; font-size: 13px; color: #9fb2cc; line-height: 1.5; }
        .ctags-status-err { color: #ff9db0; }
        .ctags-progress-wrap { margin-top: 14px; }
        .ctags-progress { height: 9px; background: #0b111d; border: 1px solid rgba(120,170,230,.16); border-radius: 999px; overflow: hidden; }
        .ctags-bar { height: 100%; width: 0%; background: linear-gradient(90deg,#34e0ff,#7c8bff); transition: width .25s ease; }
        .ctags-progress-txt { font-size: 12px; color: #e9f1fb; font-weight: 600; margin-top: 9px; font-variant-numeric: tabular-nums; }
        .ctags-log { margin-top: 12px; max-height: 200px; overflow-y: auto; background: #0b111d; border: 1px solid rgba(120,170,230,.12); border-radius: 5px; padding: 10px 12px; font-size: 11.5px; font-family: ui-monospace, monospace; line-height: 1.7; color: #9fb2cc; }
        .ctags-log::-webkit-scrollbar { width: 8px; } .ctags-log::-webkit-scrollbar-thumb { background: rgba(120,160,220,.25); border-radius: 4px; }
        .ctags-log-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ctags-ok { color: #3ce6b0; } .ctags-samplbl2 { color: #7f92ae; text-transform: uppercase; letter-spacing: .6px; font-size: 10px; font-weight: 700; }
        .ctags-result { margin-top: 14px; }
        .ctags-summary { font-size: 14px; line-height: 1.9; }
        .ctags-summary b { color: #34e0ff; font-variant-numeric: tabular-nums; }
        .ctags-total { margin: 10px 0 14px; font-size: 14px; color: #e9f1fb; }
        .ctags-total b { color: #fff; }
        .ctags-samplbl { font-size: 10px; letter-spacing: .7px; text-transform: uppercase; color: #7f92ae; font-weight: 700; margin-bottom: 8px; }
        .ctags-row { padding: 9px 0; border-bottom: 1px solid rgba(120,170,230,.10); }
        .ctags-row-title { font-size: 13px; color: #e9f1fb; }
        .ctags-row-chg { font-size: 11.5px; margin-top: 3px; font-family: ui-monospace, monospace; display: flex; gap: 12px; flex-wrap: wrap; }
        .ctags-ad { color: #3ce6b0; } .ctags-rm { color: #ff6b8b; } .ctags-ty { color: #ffc04d; }
        .ctags-more { font-size: 12px; color: #7f92ae; padding: 10px 0; }
        .ctags-footer { padding: 16px 24px; border-top: 1px solid rgba(120,170,230,.13); display: flex; justify-content: flex-end; gap: 10px; background: #0b111d; }
        .ctags-btn { padding: 11px 20px; font-size: 13.5px; font-weight: 700; cursor: pointer; font-family: inherit; border: 1px solid transparent; }
        .ctags-btn:disabled { opacity: .45; cursor: not-allowed; }
        .ctags-btn-ghost { background: transparent; color: #9fb2cc; border-color: rgba(90,150,230,.26); }
        .ctags-btn-secondary { background: #1b2740; color: #e9f1fb; border-color: rgba(90,150,230,.26); }
        .ctags-btn-primary { background: linear-gradient(92deg,#34e0ff,#7c8bff); color: #06121f; }
    `;
    document.head.appendChild(style);
})();
