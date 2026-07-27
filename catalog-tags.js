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

            if (ops.width && p.widthTag) {                       // 'wide' | 'extra wide' | 'narrow' (lowercase canonical)
                tags.forEach(function (t) { if (self._isWidthTag(t) && t !== p.widthTag) { remove.push(t); summary.widthRemoves++; } });
                if (!has(p.widthTag)) { add.push(p.widthTag); summary.widthAdds++; }
            }
            if (ops.swatch && p.cwGroup) {
                tags.forEach(function (t) {
                    if (t.indexOf('cw-group:') === 0 && t !== p.cwGroup) { remove.push(t); summary.swatchRemoves++; }
                });
                if (!has(p.cwGroup)) { add.push(p.cwGroup); summary.swatchAdds++; }
            }
            if (ops.gender && p.gender) {
                var canon = self.GENDER_TAG[p.gender];           // "Men's Shoes" | "Women's Shoes" | "Unisex Shoes"
                if (canon) {
                    tags.forEach(function (t) { if (self._isGenderTag(t) && t !== canon) { remove.push(t); summary.genderRemoves++; } });
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
            gender: document.getElementById('ctags-op-gender').checked
        };
    },
    _setStatus: function (msg, isErr) {
        var el = document.getElementById('ctags-status');
        if (el) { el.textContent = msg; el.className = 'ctags-status' + (isErr ? ' ctags-status-err' : ''); }
    },
    _preview: function () {
        var self = this;
        if (!self._catalog) { self._setStatus('Catalog still loading, one moment.', true); return; }
        var ops = self._ops();
        if (!ops.width && !ops.swatch && !ops.gender) { self._setStatus('Pick at least one operation.', true); return; }
        var res = self.computePlan(self._catalog.products, ops);
        self._plan = res.changes;
        var s = res.summary;
        var body = document.getElementById('ctags-result');
        var lines = [];
        if (ops.width) lines.push('Width tags: <b>' + s.widthAdds + '</b> to add, <b>' + s.widthRemoves + '</b> variant to remove');
        if (ops.swatch) lines.push('Swatch (cw-group) tags: <b>' + s.swatchAdds + '</b> to add, <b>' + s.swatchRemoves + '</b> stale to remove');
        if (ops.gender) lines.push('Gender tags: <b>' + s.genderAdds + '</b> to add, <b>' + s.genderRemoves + '</b> variant to remove; <b>' + s.typeFixes + '</b> product-type fixes');
        var sample = self._plan.slice(0, 12).map(function (c) {
            var bits = [];
            if (c.remove && c.remove.length) bits.push('<span class="ctags-rm">- ' + c.remove.join(', ') + '</span>');
            if (c.add && c.add.length) bits.push('<span class="ctags-ad">+ ' + c.add.join(', ') + '</span>');
            if (c.productType) bits.push('<span class="ctags-ty">type: ' + c.productType + '</span>');
            return '<div class="ctags-row"><div class="ctags-row-title">' + (c.title || c.handle) + '</div><div class="ctags-row-chg">' + bits.join(' ') + '</div></div>';
        }).join('');
        body.innerHTML = '<div class="ctags-summary">' + lines.join('<br>') + '</div>'
            + '<div class="ctags-total"><b>' + s.products + '</b> products change, of ' + s.scanned + ' scanned.</div>'
            + (self._plan.length ? '<div class="ctags-samplbl">Sample changes</div>' + sample + (self._plan.length > 12 ? '<div class="ctags-more">...and ' + (self._plan.length - 12) + ' more</div>' : '') : '<div class="ctags-more">Nothing to change, everything is already tagged.</div>');
        var applyBtn = document.getElementById('ctags-apply');
        applyBtn.disabled = self._plan.length === 0;
        applyBtn.textContent = 'Apply to ' + s.products + ' products';
        self._setStatus('Preview ready. Review, then Apply.');
    },
    _apply: function () {
        var self = this;
        if (!self._plan || !self._plan.length) return;
        if (!CatalogClient.hasWriteSecret || !CatalogClient.hasWriteSecret()) {
            var sec = prompt('Enter the write secret to apply tag changes:');
            if (!sec) { self._setStatus('Cancelled, no write secret.', true); return; }
            CatalogClient.setWriteSecret(sec);
        }
        var changes = self._plan.slice();
        var total = changes.length, done = 0, failed = 0;
        var applyBtn = document.getElementById('ctags-apply');
        applyBtn.disabled = true;
        document.getElementById('ctags-preview').disabled = true;

        var chunks = [];
        for (var i = 0; i < changes.length; i += self.CHUNK) chunks.push(changes.slice(i, i + self.CHUNK));

        function runChunk(idx) {
            if (idx >= chunks.length) {
                self._setStatus('Done. ' + (done - failed) + ' of ' + total + ' products updated' + (failed ? ', ' + failed + ' failed (see console)' : '') + '. Refresh the catalog to see the new tags.', failed > 0);
                applyBtn.textContent = 'Applied';
                document.getElementById('ctags-preview').disabled = false;
                return;
            }
            CatalogClient.applyTags(chunks[idx]).then(function (r) {
                if (r.__status === 501 || r.__status === 403 || r.__status === 401) {
                    self._setStatus('Write refused (HTTP ' + r.__status + '): ' + (r.reason || r.error || 'check the write secret and that writes are enabled') + '.', true);
                    applyBtn.disabled = false; document.getElementById('ctags-preview').disabled = false;
                    return;
                }
                done += (r.total || chunks[idx].length);
                failed += (r.failed || 0);
                (r.results || []).forEach(function (x) { if (!x.ok) console.warn('[tags] failed', x.id, x.errors); });
                self._setStatus('Applying... ' + done + ' of ' + total + (failed ? ' (' + failed + ' failed)' : ''));
                runChunk(idx + 1);
            }).catch(function (err) {
                self._setStatus('Network error mid-apply: ' + err.message + '. ' + done + ' of ' + total + ' done. Re-Preview and Apply to finish the rest.', true);
                applyBtn.disabled = false; document.getElementById('ctags-preview').disabled = false;
            });
        }
        self._setStatus('Applying ' + total + ' products in chunks of ' + self.CHUNK + '...');
        runChunk(0);
    },

    _modalHTML: function () {
        return '<div class="ctags-modal">'
            + '<div class="ctags-header"><div><div class="ctags-eyebrow">Catalog tools</div><div class="ctags-title">Catalog tagging</div>'
            + '<div class="ctags-sub">Apply width, swatch, and gender tags across the live catalog. Preview first, always.</div></div></div>'
            + '<div class="ctags-body">'
            + '<div class="ctags-ops">'
            + '<label class="ctags-op"><input type="checkbox" id="ctags-op-swatch" checked><div><div class="ctags-op-t">Swatch grouping</div><div class="ctags-op-h">The cw-group:model--width tags that drive the color-swatch grid. Fixes stale ones, adds missing ones.</div></div></label>'
            + '<label class="ctags-op"><input type="checkbox" id="ctags-op-width"><div><div class="ctags-op-t">Width tags</div><div class="ctags-op-h">Lowercase wide / extra wide / narrow. Adds the right one and removes capitalized or variant duplicates.</div></div></label>'
            + '<label class="ctags-op"><input type="checkbox" id="ctags-op-gender"><div><div class="ctags-op-t">Gender + product type</div><div class="ctags-op-h">Canonical "Men\'s Shoes" / "Women\'s Shoes" / "Unisex Shoes" tag + matching product type. Strips the dozen stray gender-tag variants.</div></div></label>'
            + '</div>'
            + '<div class="ctags-status" id="ctags-status">Loading catalog...</div>'
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
