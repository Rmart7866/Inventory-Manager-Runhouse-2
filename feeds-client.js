// feeds-client.js, The Run House. Built 2026-11-12 on owner request: "there
// is always a file loaded" for the brands with a SCHEDULED capture.
//
// Every scheduled runner (tools/*-headless-run.mjs) uploads its file and the
// guardrail's verdict to the Worker (worker/src/feeds.js). On page load this
// fetches the newest one per brand and loads it into the card EXACTLY as a
// dropped file is loaded, so a person reviews the picker and presses Write.
// Nothing here writes to Shopify.
//
// THREE SHAPES, one per brand (FORMAT, which matches FEED_FORMAT in feeds.js):
//   csv   the scraper inventory CSV, as text (ASICS, Brooks)
//   xlsx  the supplier's own workbook with its WHOLESALE COLUMNS STRIPPED on
//         the Mac, sent gzipped; unpacked here with the browser's own
//         DecompressionStream and handed over as a .xlsx, which the brand's
//         converter reads as it reads a dropped one (2026-11-13)
//   on    the scraper CSV plus its images sidecar, handed to handleOnFiles
//         together, as the ON card takes them in one drop
//
// The card says what it is: which file, how old, PASS or BLOCKED and why.
// A BLOCKED file is shown but the Write button skips that brand (main.js,
// writeAllInventory); dropping a file by hand replaces it and clears that.
// A file you dropped yourself is never replaced by this.
//
// Every read needs the write secret, so without it in this browser the cards
// stay as they were.
//
// House style: no em dashes.
var FeedsClient = {
    FORMAT: { asics: 'csv', brooks: 'csv', on: 'on', saucony: 'xlsx', merrell: 'xlsx', puma: 'xlsx', altra: 'xlsx', newbalance: 'xlsx', hoka: 'xlsx' },
    // A missed run should be visible. The daily brands run once a morning.
    STALE_HOURS: { asics: 36, brooks: 14 },
    DEFAULT_STALE_HOURS: 30,

    _ago: function (iso) {
        var m = Math.round((Date.now() - Date.parse(iso)) / 60000);
        if (!(m >= 0)) return '';
        if (m < 60) return m + ' min ago';
        var h = Math.round(m / 60); if (h < 48) return h + ' h ago';
        return Math.round(h / 24) + ' days ago';
    },

    _zone: function (brand) {
        return document.getElementById(brand === 'on' ? 'on-all-dropzone' : brand + '-dropzone');
    },

    _banner: function (brand, meta, note) {
        var id = brand + '-feed-banner';
        var el = document.getElementById(id);
        var zone = this._zone(brand);
        var host = zone && zone.parentNode;
        if (!host) return;
        if (!el) { el = document.createElement('div'); el.id = id; host.insertBefore(el, host.firstChild); }
        var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        var when = meta.capturedAt || meta.uploadedAt;
        var stale = (Date.now() - Date.parse(when)) / 3600000 > (this.STALE_HOURS[brand] || this.DEFAULT_STALE_HOURS);
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
            (meta.wholesaleStripped ? ' &middot; wholesale removed' : '') +
            (note ? '<br><em>' + esc(note) + '</em>' : '') +
            (reasons ? '<ul style="margin:6px 0 0 18px;padding:0">' + reasons + '</ul>' : '');
    },

    loadAll: function () {
        var self = this;
        if (typeof CatalogClient === 'undefined' || !CatalogClient.hasWriteSecret || !CatalogClient.hasWriteSecret()) return;
        Object.keys(this.FORMAT).forEach(function (b) {
            if (!BrandConverter.brands[b]) return;
            self.load(b).catch(function (e) { if (window.console) console.warn('[feeds] ' + b, e); });
        });
    },

    // A file a PERSON dropped is never replaced.
    _handDropped: function (brand) {
        var B = BrandConverter.brands[brand];
        if (B.feed) return null;
        if (brand === 'on') return B.allFile ? B.allFile.name : null;
        return B.file ? (B.file.name || 'a file') : null;
    },

    // The gzipped workbook back to the .xlsx bytes the converter reads.
    _gunzip: function (resp) {
        if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unpack the file (no DecompressionStream)');
        return new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    },

    load: function (brand) {
        var self = this;
        var fmt = this.FORMAT[brand];
        var base = CatalogClient._writeBase ? CatalogClient._writeBase() : CatalogClient.WORKER_URL;
        var headers = { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret() };
        var get = function (q) { return fetch(base + '/feeds/latest?brand=' + brand + q, { headers: headers }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r; }); };
        return fetch(base + '/feeds/latest?brand=' + brand, { headers: headers }).then(function (r) {
            if (r.status === 404) return null;            // no scheduled file yet, nothing to show
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (j) {
            if (!j || !j.feed) return;
            var meta = j.feed;
            var B = BrandConverter.brands[brand];
            var mine = self._handDropped(brand);
            if (mine) { self._banner(brand, meta, 'Not loaded: you already dropped ' + mine + ' on this card.'); return; }
            var done = function () { B.feed = meta; self._banner(brand, meta); };   // after the handler, which clears it

            if (fmt === 'xlsx') {
                return get('&file=1').then(function (r) { return self._gunzip(r); }).then(function (buf) {
                    var file = new File([buf], meta.file || (brand + '-scheduled.xlsx'),
                        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    BrandConverter.handleFile(brand, file);
                    done();
                });
            }
            return get('&file=1').then(function (r) { return r.text(); }).then(function (text) {
                var file = new File([text], meta.file || (brand + '-scheduled.csv'), { type: 'text/csv' });
                if (fmt !== 'on') { BrandConverter.handleFile(brand, file); done(); return; }
                // ON: the images sidecar goes WITH the CSV, in one call, as one drop.
                return get('&images=1').then(function (r) { return r.text(); }, function () { return null; }).then(function (img) {
                    var files = [file];
                    if (img) files.push(new File([img], file.name.replace(/\.csv$/i, '') + '-images.json', { type: 'application/json' }));
                    BrandConverter.handleOnFiles('all', files);
                    done();
                });
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', function () { setTimeout(function () { FeedsClient.loadAll(); }, 600); });
