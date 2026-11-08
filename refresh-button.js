// "Refresh now" for the staff pages. Asks the Worker to rebuild from Shopify,
// the same GET /catalog?fresh=1 the inventory tool's Refresh makes, which
// rebuilds the catalog, then shoe sizes, then shoe sales. The Worker only
// FLAGS the rebuild and its 5 minute cron runs it, and it enforces a 10
// minute cooldown itself, so this is safe on the public read token. It goes
// to _writeBase(), the local Worker on localhost, so a local test can never
// queue a production rebuild. The page
// then watches /catalog/status until the new catalog lands.
//
// House style: no em dashes. Use commas, periods, or the word "to".
var RefreshButton = {
    // btn: the button. say(text, warn): shows progress. onCatalog: called once
    // the new catalog (and with it the shoe sizes) is in.
    wire: function (btn, say, onCatalog) {
        btn.addEventListener('click', function () {
            btn.disabled = true;
            say('Asking Shopify for fresh numbers...');
            var h = { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN };
            fetch(CatalogClient._writeBase() + '/catalog?fresh=1', { headers: h })
                .then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); })
                .then(function (j) {
                    if (j.__status === 429) {
                        var m = Math.max(1, Math.ceil(((Number(j.ageSeconds) >= 0 ? 600 - j.ageSeconds : 600)) / 60));
                        say('Refreshed ' + Math.max(1, Math.round((j.ageSeconds || 0) / 60)) + ' min ago, so it is already fresh. It can be asked again in about ' + m + ' min.');
                        btn.disabled = false; return;
                    }
                    if (j.__status !== 202) { say('Refresh failed: ' + (j.error || 'HTTP ' + j.__status), true); btn.disabled = false; return; }
                    say('Rebuilding from Shopify. It starts within 5 minutes and takes about 3. Keep this page open, it updates itself.');
                    RefreshButton._watch(btn, say, onCatalog, h, 0);
                })
                .catch(function (e) { say('Refresh failed: ' + e.message, true); btn.disabled = false; });
        });
    },

    _watch: function (btn, say, onCatalog, h, n) {
        if (n > 30) { say('Still rebuilding. It finishes in the background; reload in a few minutes.', true); btn.disabled = false; return; }
        setTimeout(function () {
            fetch(CatalogClient._writeBase() + '/catalog/status', { headers: h })
                .then(function (r) { return r.json(); })
                .then(function (s) {
                    if (s && s.built && s.ageSeconds != null && s.ageSeconds < 180) {
                        btn.disabled = false;
                        if (onCatalog) onCatalog(); else say('Done. The catalog and shoe sizes are fresh; shoe sales follow about 2 minutes later.');
                        return;
                    }
                    RefreshButton._watch(btn, say, onCatalog, h, n + 1);
                })
                .catch(function () { RefreshButton._watch(btn, say, onCatalog, h, n + 1); });
        }, 20000);
    },
};
