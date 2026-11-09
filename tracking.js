// Tracking updates page: what the shipping email reader did with each email.
// The rules live in worker/src/tracking.js; this only shows them and offers
// Apply on an item that is ready (in dry run) or failed.
//
// House style: no em dashes. Use commas, periods, or the word "to".
var TK = {
    st: { data: null, filter: 'attention', arm: null },
    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    H: function () { return { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret(), 'Content-Type': 'application/json' }; },
    LABEL: { review: 'Needs a person', ready: 'Would add', written: 'Added', already: 'Already on order', error: 'Failed', skip: 'Not applied' },
    FILTERS: [['attention', 'Needs attention'], ['written', 'Added'], ['skip', 'International'], ['all', 'All']],
    // What staff did, from the Worker's reconcile, and whether the rules were right.
    TRUTH: {
        'match': ['Staff did the same', true], 'left-alone': ['Staff did not use it', true],
        'other-items': ['Staff used it on other items', false], 'other-tracking': ['Staff used other tracking', false],
        'added-anyway': ['Staff added it anyway', false],
    },

    // The dry run's scorecard: how often the rules matched what staff then did
    // by hand.
    summary: function (ev) {
        var known = ev.filter(function (e) { return TK.TRUTH[e.g]; });
        var right = known.filter(function (e) { return TK.TRUTH[e.g][1]; }).length;
        var pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : 'n/a'; };
        var tile = function (big, label, sub) { return '<div class="tile"><b>' + big + '</b><span>' + label + '</span><em>' + sub + '</em></div>'; };
        return '<div class="tiles">' +
            tile(ev.length, 'shipping emails read', ev.filter(function (e) { return e.st === 'ready' || e.st === 'written'; }).length + ' clean matches, ' + ev.filter(function (e) { return e.st === 'review' || e.st === 'error'; }).length + ' for a person') +
            tile(pct(right, known.length), 'rules matched what staff did', known.length ? right + ' of ' + known.length + ' known so far' : 'known once staff ship by hand') +
            '</div>';
    },

    init: function () {
        TK.$('gate-form').addEventListener('submit', function (e) { e.preventDefault(); CatalogClient.setWriteSecret(TK.$('gate-in').value); TK.load(); });
        TK.load();
        setInterval(function () { if (!document.hidden && TK.st.data) TK.load(); }, 60000);
    },

    load: function () {
        if (!CatalogClient.hasWriteSecret()) return TK.gate('');
        fetch(CatalogClient._writeBase() + '/tracking/log', { headers: TK.H() })
            .then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); })
            .then(function (j) {
                if (j.__status === 401 || j.__status === 403) return TK.gate('That write secret was not accepted.');
                TK.$('gate').classList.add('hidden'); TK.$('app').classList.remove('hidden');
                if (j.__status !== 200) { TK.$('out').innerHTML = '<div class="msg">' + TK.esc(j.error || ('HTTP ' + j.__status)) + '</div>'; return; }
                TK.st.data = j; TK.draw();
            }).catch(function (e) { TK.gate('Could not reach the Worker: ' + e.message); });
    },

    gate: function (err) { TK.$('app').classList.add('hidden'); TK.$('gate').classList.remove('hidden'); TK.$('gate-err').textContent = err; TK.$('gate-in').focus(); },

    when: function (iso) {
        var d = new Date(iso);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    },

    draw: function () {
        var j = TK.st.data, ev = j.events;
        var liveList = (j.live || []).map(function (b) { return b.toUpperCase(); });
        TK.$('banner').innerHTML = j.mode === 'live' && liveList.length
            ? '<div class="banner live"><b>Live for ' + TK.esc(liveList.join(', ')) + '.</b> When one of their shipping emails matches an order cleanly, the tracking is added and Shopify emails the customer. Anything unclear waits here for a person. Every other brand is still a dry run: recorded, never sent.</div>'
            : j.mode === 'live'
            ? '<div class="banner live"><b>Live.</b> When a shipping email matches an order cleanly, the tracking is added and Shopify emails the customer. Anything unclear waits here for a person.</div>'
            : '<div class="banner"><b>Dry run.</b> Nothing is added to Shopify and no customer is emailed. Every shipping email is read and matched to its order, and once staff ship that order by hand this page compares what they did with what this would have done.</div>';
        var count = function (f) { return ev.filter(function (e) { return TK.match(e, f) && (f !== 'skip' || e.x !== 'shipped'); }).length; };
        TK.$('filters').innerHTML = TK.FILTERS.map(function (f) {
            return '<button type="button" class="chip' + (TK.st.filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + ' (' + count(f[0]) + ')</button>';
        }).join('');
        TK.$('filters').querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { TK.st.filter = b.dataset.f; TK.st.arm = null; TK.draw(); }; });
        TK.$('summary').innerHTML = ev.length ? TK.summary(ev) : '';
        var rows = ev.filter(function (e) { return TK.match(e, TK.st.filter); });
        var err = TK.st.err ? '<div class="msg" style="border-color:var(--warn);color:var(--warn)">' + TK.esc(TK.st.err) + '</div>' : '';
        if (!ev.length) { TK.$('out').innerHTML = '<div class="msg">No shipping emails yet. They appear here within 10 minutes of reaching needham@therunhouse.com, once the mailbox script is set up (tools/tracking-mailbox.gs).</div>'; return; }
        if (!rows.length) { TK.$('out').innerHTML = '<div class="msg">Nothing here.</div>'; return; }
        if (TK.st.filter === 'skip') { TK.$('out').innerHTML = TK.intlTable(rows); TK.wireIntl(); return; }
        TK.$('out').innerHTML = err + '<table><thead><tr><th>Received</th><th>Status</th><th>PO</th><th>Order</th><th>Brand</th><th>Tracking</th><th>Checks</th><th></th></tr></thead><tbody>' +
            rows.map(function (e) {
                var canApply = j.mode === 'live' && (!(j.live || []).length || (j.live || []).indexOf(e.b) >= 0) && (e.st === 'ready' || e.st === 'error' || e.st === 'review');
                var armed = TK.st.arm === e.key;
                return '<tr><td style="white-space:nowrap">' + TK.esc(TK.when(e.at)) + '</td>' +
                    '<td><span class="st ' + TK.esc(e.st) + '">' + TK.esc(TK.LABEL[e.st] || e.st) + '</span>' + (e.r ? '<div class="why">' + TK.esc(e.r) + '</div>' : '') +
                    (e.st === 'ready' || e.st === 'written' ? '<div class="why">' + e.n + ' item' + (e.n === 1 ? '' : 's') + '</div>' : '') + '</td>' +
                    '<td>' + TK.esc(e.po) + '</td>' +
                    '<td>' + (e.i ? '<a href="https://admin.shopify.com/store/therunhouse/orders/' + TK.esc(e.i) + '" target="_blank" rel="noopener">' + TK.esc(e.o) + '</a>' : TK.esc(e.o || '')) + '</td>' +
                    '<td>' + TK.esc((e.b || '').toUpperCase() || '?') + '</td>' +
                    '<td class="trk">' + TK.esc(e.t) + '</td>' +
                    '<td class="checks">' + TK.checks(e) + '</td>' +
                    '<td>' + (canApply ? '<button type="button" class="chip' + (armed ? ' arm' : '') + '" data-apply="' + TK.esc(e.key) + '"' + (e.ov ? ' data-ov="1"' : '') + '>' + (armed ? (e.ov ? 'Sure? You checked the name' : e.st === 'review' ? 'Sure? Adds it if it now matches' : 'Sure? Emails the customer') : (e.ov ? 'Add anyway' : e.st === 'review' ? 'Check again' : 'Add tracking')) + '</button>' : '') + '</td></tr>';
            }).join('') + '</tbody></table>';
        TK.$('out').querySelectorAll('[data-apply]').forEach(function (b) { b.onclick = function () { TK.apply(b); }; });
    },

    checks: function (e) {
        var out = [];
        if (TK.TRUTH[e.g]) out.push('<div class="' + (TK.TRUTH[e.g][1] ? 'ok' : 'warn') + '">' + (TK.TRUTH[e.g][1] ? '✓ ' : '▲ ') + TK.esc(TK.TRUTH[e.g][0]) + '</div>');
        return out.join('') || '<span class="why">Waiting</span>';
    },

    // ---------- the international tracker ----------
    // An order shipping abroad comes to the store first; the supplier's
    // tracking is the inbound leg, kept here for staff and never put on the
    // order. On the way, then Received (a staff press), then Shipped abroad
    // (seen by the Worker once the order is fulfilled with other tracking).
    trackLink: function (t) {
        var m = /^(\S+)\s+(\S+)$/.exec(String(t).trim());
        if (!m) return TK.esc(t);
        var c = m[1].toLowerCase(), n = encodeURIComponent(m[2]);
        var url = c === 'fedex' ? 'https://www.fedex.com/fedextrack/?trknbr=' + n : c === 'ups' ? 'https://www.ups.com/track?tracknum=' + n : c === 'usps' ? 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + n : '';
        return url ? '<a href="' + url + '" target="_blank" rel="noopener">' + TK.esc(m[1] + ' ' + m[2]) + '</a>' : TK.esc(t);
    },
    countryOf: function (e) { return e.c || ((/ships to ([A-Z]{2})/.exec(e.r || '') || [])[1]) || '?'; },
    intlState: function (e) {
        if (e.x === 'shipped') return '<span class="st written">Shipped abroad</span><div class="why">' + TK.esc(TK.when(e.xa)) + '</div>';
        if (e.x === 'store') return '<span class="st ready">At the store</span><div class="why">Received ' + TK.esc(TK.when(e.xa)) + (e.xb ? ' by ' + TK.esc(e.xb) : '') + '</div>';
        return '<span class="st review">On the way to the store</span>';
    },
    intlTable: function (rows) {
        var order = { '': 0, store: 1, shipped: 2 };
        rows = rows.slice().sort(function (a, b) { return (order[a.x || ''] - order[b.x || '']) || String(b.at).localeCompare(String(a.at)); });
        return '<p class="sub" style="margin:0 0 10px">International orders come to the store first. The supplier\'s tracking below is that inbound leg: it is never put on the customer\'s order. Press Received when the box arrives; it moves to Shipped abroad by itself once the order is fulfilled in Shopify with the international shipment.</p>' +
            '<table><thead><tr><th>Email</th><th>Order</th><th>Ships to</th><th>Brand</th><th>Inbound tracking</th><th>Where it is</th><th></th></tr></thead><tbody>' +
            rows.map(function (e) {
                var btn = e.x === 'shipped' ? '' : e.x === 'store'
                    ? '<button type="button" class="chip" data-recv="' + TK.esc(e.key) + '" data-to="0">Undo received</button>'
                    : '<button type="button" class="chip" data-recv="' + TK.esc(e.key) + '" data-to="1">Received</button>';
                return '<tr><td style="white-space:nowrap">' + TK.esc(TK.when(e.at)) + '</td>' +
                    '<td>' + (e.i ? '<a href="https://admin.shopify.com/store/therunhouse/orders/' + TK.esc(e.i) + '" target="_blank" rel="noopener">' + TK.esc(e.o) + '</a>' : TK.esc(e.o || '')) + '</td>' +
                    '<td>' + TK.esc(TK.countryOf(e)) + '</td><td>' + TK.esc((e.b || '').toUpperCase() || '?') + '</td>' +
                    '<td class="trk">' + String(e.t || '').split(/,\s*/).filter(Boolean).map(TK.trackLink).join('<br>') + '</td>' +
                    '<td>' + TK.intlState(e) + '</td><td>' + btn + '</td></tr>';
            }).join('') + '</tbody></table>';
    },
    wireIntl: function () {
        TK.$('out').querySelectorAll('[data-recv]').forEach(function (b) {
            b.onclick = function () {
                b.disabled = true;
                fetch(CatalogClient._writeBase() + '/tracking/intl', { method: 'POST', headers: TK.H(), body: JSON.stringify({ key: b.dataset.recv, received: b.dataset.to === '1' }) })
                    .then(function (r) { return r.json(); })
                    .then(function (j) {
                        // The list behind the page catches up within a minute;
                        // show the new state now rather than waiting for it.
                        var e = TK.st.data.events.filter(function (x) { return x.key === b.dataset.recv; })[0];
                        if (e && !j.error) { e.x = b.dataset.to === '1' ? 'store' : ''; e.xa = new Date().toISOString(); }
                        TK.st.err = j.error ? 'Not saved: ' + j.error : ''; TK.draw();
                    })
                    .catch(function (err) { b.disabled = false; b.textContent = 'Failed: ' + err.message; });
            };
        });
    },

    match: function (e, f) {
        if (f === 'all') return true;
        if (f === 'wrong') return !!(TK.TRUTH[e.g] && !TK.TRUTH[e.g][1]);
        if (f === 'attention') return e.st === 'review' || e.st === 'error';
        return e.st === f;
    },

    // Two presses: adding tracking emails a real customer.
    apply: function (b) {
        var key = b.dataset.apply;
        if (TK.st.arm !== key) { TK.st.arm = key; TK.draw(); return; }
        TK.st.arm = null; b.disabled = true; b.textContent = 'Adding...';
        fetch(CatalogClient._writeBase() + '/tracking/apply', { method: 'POST', headers: TK.H(), body: JSON.stringify({ key: key, override: b.dataset.ov === '1' }) })
            .then(function (r) { return r.json(); })
            .then(function (j) { TK.st.err = j.error ? 'Not added: ' + j.error : ''; TK.load(); })
            .catch(function (e) { b.textContent = 'Failed: ' + e.message; });
    },
};
TK.init();
