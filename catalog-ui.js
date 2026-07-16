// ========== CATALOG UI ==========
// The UI layer for the live-catalog source. Everything here is gated on
// InventoryTracker.SOURCE. When it is 'firestore' (today), this module does
// nothing and the tool looks and behaves exactly as before. When it flips to
// 'shopify', these affordances activate together:
//
//   - a freshness bar (the catalog is a snapshot, up to ~20 min old, not "now")
//   - a fallback banner (if the Worker was unreachable and we used Firestore)
//   - a "still building" state (a cold catalog returns 503 for ~150s)
//   - the confirm-on-Shopify buttons hidden (there is nothing to confirm when
//     Shopify itself is the source)
//   - a per-product zero-out review before any product is set to 0, with the
//     comparison scope shown and a guard against zeroing an implausible share
//     of a brand (the partial-feed footgun)
//
// House style: no em dashes. 0px corners, Inter, navy #1b3566 / accent #1f6fe0.

var CatalogUI = {
    NAVY: '#1b3566',
    ACCENT: '#1f6fe0',

    // Posture for the zero-out review. 'approve' = nothing preselected, the user
    // opts each product in (safest, guards against a partial feed silently
    // zeroing live stock). 'object' = all preselected, the user opts out. Kept
    // 'approve' deliberately; change this one string to flip the default.
    ZERO_POSTURE: 'approve',

    // If a single file would zero more than this share of a brand's live
    // colorways, warn hard. That pattern almost always means a broken or partial
    // file, not a real mass discontinuation.
    ZERO_WARN_FRACTION: 0.4,

    isLive: function() {
        return typeof InventoryTracker !== 'undefined' && InventoryTracker.SOURCE === 'shopify';
    },

    init: function() {
        if (!this.isLive()) return; // firestore mode: render nothing, change nothing
        document.body.classList.add('catalog-live'); // CSS hides confirm buttons
        this._ensureBar();
        this.refreshFreshness();
    },

    // ---- freshness / status bar -------------------------------------------
    _ensureBar: function() {
        if (document.getElementById('catalog-status-bar')) return;
        var bar = document.createElement('div');
        bar.id = 'catalog-status-bar';
        bar.style.cssText =
            'font-family:Inter,system-ui,sans-serif;font-size:13px;border-radius:0;' +
            'padding:8px 14px;margin:0 0 12px 0;display:flex;align-items:center;gap:12px;' +
            'background:#eef2f9;color:' + this.NAVY + ';border:1px solid #d5deef;';
        // Insert at the top of the app content if we can find it.
        var host = document.getElementById('app-content') || document.body;
        host.insertBefore(bar, host.firstChild);
    },

    setBar: function(html, tone) {
        this._ensureBar();
        var bar = document.getElementById('catalog-status-bar');
        if (!bar) return;
        var bg = tone === 'warn' ? '#fef3e2' : tone === 'error' ? '#fdecec' : '#eef2f9';
        var bd = tone === 'warn' ? '#f4d29a' : tone === 'error' ? '#f2b8b8' : '#d5deef';
        bar.style.background = bg;
        bar.style.borderColor = bd;
        bar.innerHTML = html;
    },

    refreshFreshness: function() {
        if (!this.isLive()) return;
        var cat = (typeof CatalogClient !== 'undefined') ? CatalogClient._catalog : null;
        if (!cat) {
            this.setBar('<span>Live Shopify catalog: not loaded yet. It loads when you generate a brand.</span>', 'info');
            return;
        }
        var mins = Math.max(0, Math.round((Date.now() - Date.parse(cat.generatedAt)) / 60000));
        var when = mins < 1 ? 'just now' : mins + ' min ago';
        this.setBar(
            '<strong>Live Shopify catalog</strong>' +
            '<span>synced ' + when + ' (' + (cat.counts ? cat.counts.products : '?') + ' products)</span>' +
            '<button onclick="CatalogUI.forceRefresh()" style="margin-left:auto;border:0;border-radius:0;' +
            'background:' + this.ACCENT + ';color:#fff;padding:5px 12px;font-size:12px;cursor:pointer;">Refresh</button>',
            mins > 25 ? 'warn' : 'info'
        );
    },

    // A plain refresh just clears the in-tab cache so the next load re-pulls the
    // Worker's KV copy. It does NOT force a server rebuild: that needs the admin
    // token, which is not in this public bundle by design.
    forceRefresh: function() {
        if (typeof CatalogClient !== 'undefined') { CatalogClient._catalog = null; CatalogClient._fetchedAt = 0; }
        if (typeof InventoryTracker !== 'undefined') InventoryTracker.invalidateCache();
        this.setBar('<span>Catalog cache cleared. It re-pulls next time you generate a brand.</span>', 'info');
    },

    setBuilding: function() {
        this.setBar('<span>Shopify catalog is refreshing on the server, this can take up to a couple of minutes. Try again shortly.</span>', 'warn');
    },

    setFallback: function(reason) {
        this.setBar('<strong>Heads up:</strong> <span>could not reach the live Shopify catalog (' +
            (reason || 'unknown') + '), showing last-saved data, which may be stale.</span>', 'error');
    },

    // ---- per-product zero-out review --------------------------------------
    // Returns a Promise that resolves to the array of removedColorways the user
    // approved for zeroing (possibly empty). Only called in live mode.
    confirmZeroOut: function(brand, removedColorways, liveCount) {
        var self = this;
        var brandName = brand.charAt(0).toUpperCase() + brand.slice(1);
        var total = removedColorways.length;
        var frac = liveCount > 0 ? (total / liveCount) : 0;
        var preselect = this.ZERO_POSTURE === 'object';

        return new Promise(function(resolve) {
            var overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(15,25,45,0.55);z-index:99999;' +
                'display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;';

            var scopeLine = 'Comparing your file against <strong>' + liveCount + '</strong> live ' +
                brandName + ' colorways on Shopify. <strong>' + total + '</strong> are not in your file.';

            var guard = '';
            if (frac >= self.ZERO_WARN_FRACTION) {
                guard =
                    '<div style="background:#fdecec;border:1px solid #f2b8b8;color:#8a1c1c;padding:10px 12px;' +
                    'margin:10px 0;font-size:13px;">This would zero <strong>' + Math.round(frac * 100) +
                    '%</strong> of your live ' + brandName + ' inventory. That usually means an incomplete or ' +
                    'failed file. Double-check before zeroing anything.</div>';
            }

            var rows = removedColorways.map(function(cw, i) {
                var sizes = cw.variants ? Object.keys(cw.variants).length : 0;
                return '<label style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-bottom:1px solid #eee;font-size:13px;cursor:pointer;">' +
                    '<input type="checkbox" class="cui-zero-cb" data-i="' + i + '"' + (preselect ? ' checked' : '') + '>' +
                    '<span style="flex:1;">' + (cw.title || cw.handle) + '</span>' +
                    '<span style="color:#888;">' + sizes + ' sizes to 0</span></label>';
            }).join('');

            overlay.innerHTML =
                '<div style="background:#fff;border-radius:0;max-width:640px;width:92%;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.3);">' +
                  '<div style="background:' + self.NAVY + ';color:#fff;padding:14px 18px;">' +
                    '<div style="font-size:16px;font-weight:600;">Set missing ' + brandName + ' products to 0?</div>' +
                    '<div style="font-size:13px;opacity:0.9;margin-top:4px;">' + scopeLine + '</div></div>' +
                  '<div style="padding:12px 18px 0;">' + guard +
                    '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
                      '<button id="cui-all" style="border:1px solid ' + self.ACCENT + ';background:#fff;color:' + self.ACCENT + ';border-radius:0;padding:4px 10px;font-size:12px;cursor:pointer;">Select all</button>' +
                      '<button id="cui-none" style="border:1px solid #ccc;background:#fff;color:#555;border-radius:0;padding:4px 10px;font-size:12px;cursor:pointer;">Select none</button>' +
                      '<span id="cui-count" style="margin-left:auto;font-size:12px;color:#555;align-self:center;"></span>' +
                    '</div></div>' +
                  '<div style="overflow-y:auto;border-top:1px solid #eee;">' + rows + '</div>' +
                  '<div style="padding:14px 18px;display:flex;gap:10px;border-top:1px solid #eee;">' +
                    '<button id="cui-skip" style="border:1px solid #ccc;background:#fff;color:#333;border-radius:0;padding:9px 16px;font-size:14px;cursor:pointer;">Skip zeroing</button>' +
                    '<button id="cui-go" style="margin-left:auto;border:0;background:' + self.ACCENT + ';color:#fff;border-radius:0;padding:9px 18px;font-size:14px;cursor:pointer;">Zero selected</button>' +
                  '</div>' +
                '</div>';

            document.body.appendChild(overlay);

            var cbs = function() { return Array.prototype.slice.call(overlay.querySelectorAll('.cui-zero-cb')); };
            var updateCount = function() {
                var n = cbs().filter(function(c) { return c.checked; }).length;
                overlay.querySelector('#cui-count').textContent = n + ' of ' + total + ' selected to zero';
                overlay.querySelector('#cui-go').textContent = n ? ('Zero selected (' + n + ')') : 'Zero selected';
            };
            overlay.querySelector('#cui-all').onclick = function() { cbs().forEach(function(c) { c.checked = true; }); updateCount(); };
            overlay.querySelector('#cui-none').onclick = function() { cbs().forEach(function(c) { c.checked = false; }); updateCount(); };
            overlay.addEventListener('change', updateCount);

            var finish = function(approved) { document.body.removeChild(overlay); resolve(approved); };
            overlay.querySelector('#cui-skip').onclick = function() { finish([]); };
            overlay.querySelector('#cui-go').onclick = function() {
                var approved = cbs().filter(function(c) { return c.checked; })
                    .map(function(c) { return removedColorways[Number(c.getAttribute('data-i'))]; });
                finish(approved);
            };
            updateCount();
        });
    }
};

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function() { try { CatalogUI.init(); } catch (e) { console.warn('CatalogUI init:', e); } });
}

if (typeof module !== 'undefined' && module.exports) module.exports = CatalogUI;
