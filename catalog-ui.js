// ========== CATALOG UI ==========
// The UI layer for the live-catalog source. Everything here is gated on
// InventoryTracker.SOURCE. When it is 'firestore' (today), this module does
// nothing and the tool looks and behaves exactly as before. When it flips to
// 'shopify', these affordances activate together:
//
//   - a freshness bar (the catalog is a snapshot, refreshed daily or on demand)
//   - a fallback banner (if the Worker was unreachable and we used Firestore)
//   - a "still building" state (a cold catalog is being built)
//   - the confirm-on-Shopify buttons hidden (there is nothing to confirm when
//     Shopify itself is the source)
//   - a per-product zero-out review before any product is set to 0, with the
//     comparison scope shown and a guard against zeroing an implausible share
//     of a brand (the partial-feed footgun)
//
// House style: no em dashes. Matches the existing tool: DM Sans, rounded
// corners, zinc dark #18181b / blue accent #2563eb.

var CatalogUI = {
    // Match the tool's dark/blocky theme (index.html CSS vars). Solid, opaque
    // surfaces with explicit light text so nothing inherits the page's light
    // --text onto a light card and vanish.
    SURFACE: '#0b1220',   // opaque card
    SURFACE_2: '#0e1729', // header / raised rows
    TEXT: '#e6eef8',
    MUTED: '#9fb2cc',
    LINE: '#1c2740',
    ACCENT: '#34e0ff',    // cyan; needs DARK text on top of it
    ACCENT_INK: '#04121a',
    // Back-compat alias (older code referenced NAVY).
    NAVY: '#0e1729',

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
            'font-family:inherit;font-size:13px;border-radius:0;' +
            'padding:8px 14px;margin:0 0 12px 0;display:flex;align-items:center;gap:12px;' +
            'background:' + this.SURFACE_2 + ';color:' + this.TEXT + ';border:1px solid ' + this.LINE + ';';
        // Insert at the top of the app content if we can find it.
        var host = document.getElementById('app-content') || document.body;
        host.insertBefore(bar, host.firstChild);
    },

    setBar: function(html, tone) {
        this._ensureBar();
        var bar = document.getElementById('catalog-status-bar');
        if (!bar) return;
        var bg = tone === 'warn' ? '#2a2110' : tone === 'error' ? '#2a1414' : this.SURFACE_2;
        var bd = tone === 'warn' ? '#6b5320' : tone === 'error' ? '#7a2e2e' : this.LINE;
        var fg = tone === 'warn' ? '#f4d29a' : tone === 'error' ? '#f2b8b8' : this.TEXT;
        bar.style.background = bg;
        bar.style.borderColor = bd;
        bar.style.color = fg;
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
            'background:' + this.ACCENT + ';color:' + this.ACCENT_INK + ';font-weight:600;padding:5px 12px;font-size:12px;cursor:pointer;">Refresh</button>',
            mins > 25 ? 'warn' : 'info'
        );
    },

    // Force a fresh pull from Shopify (for "I just added products"). The Worker
    // runs the rebuild in the background and rate-limits it with a cooldown, so
    // this is safe to expose to the browser token. We poll until the new copy
    // lands, then drop the in-tab caches so it gets used.
    forceRefresh: function() {
        var self = this;
        self.setBar('<span>Requesting a fresh pull from Shopify...</span>', 'warn');
        fetch(self.WORKER_URL + '/catalog?fresh=1', { headers: { 'Authorization': 'Bearer ' + self.CATALOG_TOKEN } })
            .then(function(r) { return r.json().then(function(b) { b.__status = r.status; return b; }); })
            .then(function(b) {
                if (b.__status === 429) { self.setBar('<span>' + (b.hint || 'Recently refreshed, try again soon.') + '</span>', 'info'); return; }
                self.setBar('<span>Refreshing catalog from Shopify, this takes a few minutes. Keep working, it updates automatically.</span>', 'warn');
                self._pollUntilFresh(0);
            })
            .catch(function(e) { self.setBar('<span>Refresh failed: ' + e.message + '</span>', 'error'); });
    },

    // Poll /catalog/status until the rebuild lands (age drops near zero), then
    // clear the in-tab caches so the next brand generate uses the new data.
    _pollUntilFresh: function(tries) {
        var self = this;
        if (tries > 30) { self.setBar('<span>Refresh is taking longer than usual, it will finish in the background.</span>', 'warn'); return; }
        fetch(self.WORKER_URL + '/catalog/status', { headers: { 'Authorization': 'Bearer ' + self.CATALOG_TOKEN } })
            .then(function(r) { return r.json(); })
            .then(function(s) {
                if (s.built && s.ageSeconds != null && s.ageSeconds < 120) {
                    if (typeof CatalogClient !== 'undefined') { CatalogClient._catalog = null; CatalogClient._fetchedAt = 0; }
                    if (typeof InventoryTracker !== 'undefined') InventoryTracker.invalidateCache();
                    self.setBar('<strong>Catalog refreshed.</strong> <span>Re-generate a brand to use the new data.</span>', 'info');
                    return;
                }
                setTimeout(function() { self._pollUntilFresh(tries + 1); }, 20000);
            })
            .catch(function() { setTimeout(function() { self._pollUntilFresh(tries + 1); }, 20000); });
    },

    setBuilding: function() {
        this.setBar('<span>Shopify catalog is refreshing on the server, this can take up to a couple of minutes. Try again shortly.</span>', 'warn');
    },

    setFallback: function(reason) {
        this.setBar('<strong>Heads up:</strong> <span>could not reach the live Shopify catalog (' +
            (reason || 'unknown') + '), showing last-saved data, which may be stale.</span>', 'error');
    },

};

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function() { try { CatalogUI.init(); } catch (e) { console.warn('CatalogUI init:', e); } });
}

if (typeof module !== 'undefined' && module.exports) module.exports = CatalogUI;
