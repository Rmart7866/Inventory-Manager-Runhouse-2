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
    LABEL: { review: 'Needs a person', ready: 'Would add', written: 'Added', already: 'Already on order', error: 'Failed' },
    FILTERS: [['attention', 'Needs attention'], ['ready', 'Would add'], ['written', 'Added'], ['all', 'All']],

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
        TK.$('banner').innerHTML = j.mode === 'live'
            ? '<div class="banner live"><b>Live.</b> When a shipping email matches an order cleanly, the tracking is added and Shopify emails the customer. Anything unclear waits here for a person.</div>'
            : '<div class="banner"><b>Dry run.</b> Nothing is added to Shopify automatically. "Would add" is what it would have done; compare it with what was done by hand, or press Add tracking to do one now (Shopify emails the customer).</div>';
        var count = function (f) { return ev.filter(function (e) { return TK.match(e, f); }).length; };
        TK.$('filters').innerHTML = TK.FILTERS.map(function (f) {
            return '<button type="button" class="chip' + (TK.st.filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + ' (' + count(f[0]) + ')</button>';
        }).join('');
        TK.$('filters').querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { TK.st.filter = b.dataset.f; TK.st.arm = null; TK.draw(); }; });
        var rows = ev.filter(function (e) { return TK.match(e, TK.st.filter); });
        var err = TK.st.err ? '<div class="msg" style="border-color:var(--warn);color:var(--warn)">' + TK.esc(TK.st.err) + '</div>' : '';
        if (!ev.length) { TK.$('out').innerHTML = '<div class="msg">No shipping emails yet. They appear here within 10 minutes of reaching needham@therunhouse.com, once the mailbox script is set up (tools/tracking-mailbox.gs).</div>'; return; }
        if (!rows.length) { TK.$('out').innerHTML = '<div class="msg">Nothing here.</div>'; return; }
        TK.$('out').innerHTML = err + '<table><thead><tr><th>Received</th><th>Status</th><th>PO</th><th>Order</th><th>Brand</th><th>Tracking</th><th></th></tr></thead><tbody>' +
            rows.map(function (e) {
                var canApply = e.st === 'ready' || e.st === 'error';
                var armed = TK.st.arm === e.key;
                return '<tr><td style="white-space:nowrap">' + TK.esc(TK.when(e.at)) + '</td>' +
                    '<td><span class="st ' + TK.esc(e.st) + '">' + TK.esc(TK.LABEL[e.st] || e.st) + '</span>' + (e.r ? '<div class="why">' + TK.esc(e.r) + '</div>' : '') +
                    (e.st === 'ready' || e.st === 'written' ? '<div class="why">' + e.n + ' item' + (e.n === 1 ? '' : 's') + '</div>' : '') + '</td>' +
                    '<td>' + TK.esc(e.po) + '</td>' +
                    '<td>' + (e.i ? '<a href="https://admin.shopify.com/store/therunhouse/orders/' + TK.esc(e.i) + '" target="_blank" rel="noopener">' + TK.esc(e.o) + '</a>' : TK.esc(e.o || '')) + '</td>' +
                    '<td>' + TK.esc((e.b || '').toUpperCase() || '?') + '</td>' +
                    '<td class="trk">' + TK.esc(e.t) + '</td>' +
                    '<td>' + (canApply ? '<button type="button" class="chip' + (armed ? ' arm' : '') + '" data-apply="' + TK.esc(e.key) + '">' + (armed ? 'Sure? Emails the customer' : 'Add tracking') + '</button>' : '') + '</td></tr>';
            }).join('') + '</tbody></table>';
        TK.$('out').querySelectorAll('[data-apply]').forEach(function (b) { b.onclick = function () { TK.apply(b); }; });
    },

    match: function (e, f) {
        if (f === 'all') return true;
        if (f === 'attention') return e.st === 'review' || e.st === 'error';
        return e.st === f;
    },

    // Two presses: adding tracking emails a real customer.
    apply: function (b) {
        var key = b.dataset.apply;
        if (TK.st.arm !== key) { TK.st.arm = key; TK.draw(); return; }
        TK.st.arm = null; b.disabled = true; b.textContent = 'Adding...';
        fetch(CatalogClient._writeBase() + '/tracking/apply', { method: 'POST', headers: TK.H(), body: JSON.stringify({ key: key }) })
            .then(function (r) { return r.json(); })
            .then(function (j) { TK.st.err = j.error ? 'Not added: ' + j.error : ''; TK.load(); })
            .catch(function (e) { b.textContent = 'Failed: ' + e.message; });
    },
};
TK.init();
