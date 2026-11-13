// feeds-client.js, The Run House. Built 2026-11-12 on owner request: "there
// is always a file loaded" for the brands with a SCHEDULED capture.
//
// tools/asics-headless-run.mjs --full-catalog (1 AM) and
// tools/brooks-headless-run.mjs (6 AM, noon, 6 PM) upload their CSV and the
// guardrail's verdict to the Worker (worker/src/feeds.js). On page load this
// fetches the newest one per brand and loads it into the card exactly as a
// dropped file is loaded (BrandConverter.handleFile), so a person reviews the
// picker and presses Write. Nothing here writes to Shopify.
//
// The card says what it is: which file, how old, PASS or BLOCKED and why.
// A BLOCKED file is shown but the Write button skips that brand (main.js,
// writeAllInventory); dropping a file by hand replaces it and clears that.
// A file you dropped yourself is never replaced by this.
//
// Both reads need the write secret (the files carry stock and retail price),
// so without it in this browser the cards stay as they were.
//
// House style: no em dashes.
var FeedsClient = {
    BRANDS: ['asics', 'brooks'],
    STALE_HOURS: { asics: 36, brooks: 14 },   // a missed run should be visible

    _ago: function (iso) {
        var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
        if (!(m >= 0)) return '';
        if (m < 60) return m + ' min ago';
        var h = Math.round(m / 60); if (h < 48) return h + ' h ago';
        return Math.round(h / 24) + ' days ago';
    },

    _banner: function (brand, meta, note) {
        var id = brand + '-feed-banner';
        var el = document.getElementById(id);
        var zone = document.getElementById(brand + '-dropzone');
        var host = zone && zone.parentNode;
        if (!host) return;
        if (!el) { el = document.createElement('div'); el.id = id; host.insertBefore(el, host.firstChild); }
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        var when = meta.capturedAt || meta.uploadedAt;
        var stale = (Date.now() - Date.parse(when)) / 3600000 > (this.STALE_HOURS[brand] || 24);
        var blocked = meta.verdict === 'BLOCKED';
        var bg = blocked ? '#3b1212' : stale ? '#3b2f12' : '#0f2e1c';
        var bd = blocked ? '#ef4444' : stale ? '#f59e0b' : '#22c55e';
        var head = blocked ? 'Scheduled file BLOCKED, Write will skip it'
            : stale ? 'Scheduled file is OLD, check the job ran'
            : 'Scheduled file loaded, review and Write';
        var reasons = (meta.reasons || []).slice(0, 4).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');
        el.style.cssText = 'margin:0 0 10px;padding:10px 12px;border-left:4px solid ' + bd + ';background:' + bg + ';color:#e5e7eb;font-size:13px;line-height:1.45';
        el.innerHTML = '<strong>' + head + '</strong><br>' + esc(meta.file || '') + ' &middot; ' + esc(this._ago(when)) +
            (meta.rows ? ' &middot; ' + Number(meta.rows).toLocaleString() + ' rows' : '') +
            (meta.styles ? ' &middot; ' + Number(meta.styles).toLocaleString() + ' styles' : '') +
            (note ? '<br><em>' + esc(note) + '</em>' : '') +
            (reasons ? '<ul style="margin:6px 0 0 18px;padding:0">' + reasons + '</ul>' : '');
    },

    loadAll: function () {
        var self = this;
        if (typeof CatalogClient === 'undefined' || !CatalogClient.hasWriteSecret || !CatalogClient.hasWriteSecret()) return;
        this.BRANDS.forEach(function (b) { self.load(b).catch(function (e) { if (window.console) console.warn('[feeds] ' + b, e); }); });
    },

    load: function (brand) {
        var self = this;
        var base = CatalogClient._writeBase ? CatalogClient._writeBase() : CatalogClient.WORKER_URL;
        var headers = { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret() };
        return fetch(base + '/feeds/latest?brand=' + brand, { headers: headers }).then(function (r) {
            if (r.status === 404) return null;            // no scheduled file yet, nothing to show
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (j) {
            if (!j || !j.feed) return;
            var meta = j.feed;
            var B = BrandConverter.brands[brand];
            // Never replace a file a person dropped.
            if (B.file && !B.feed) { self._banner(brand, meta, 'Not loaded: you already dropped ' + (B.file.name || 'a file') + ' on this card.'); return; }
            return fetch(base + '/feeds/latest?brand=' + brand + '&csv=1', { headers: headers }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.text();
            }).then(function (text) {
                var file = new File([text], meta.file || (brand + '-scheduled.csv'), { type: 'text/csv' });
                BrandConverter.handleFile(brand, file);
                B.feed = meta;                            // after handleFile, which clears it
                self._banner(brand, meta);
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { FeedsClient.loadAll(); }, 600); });
