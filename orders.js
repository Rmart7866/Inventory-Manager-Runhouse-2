// Order lookup page. The Worker does the search and shapes each order
// (worker/src/orders-lookup.js); this page only shows it.
var OL = {
    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    ADMIN: 'https://admin.shopify.com/store/therunhouse',

    api: function (path) {
        return fetch(CatalogClient._writeBase() + path, { headers: { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret() } })
            .then(function (r) { return r.json().catch(function () { return { error: 'HTTP ' + r.status }; }).then(function (j) { j.__status = r.status; return j; }); });
    },

    init: function () {
        OL.$('gate-form').addEventListener('submit', function (e) { e.preventDefault(); CatalogClient.setWriteSecret(OL.$('gate-in').value); OL.start(); });
        OL.$('f').addEventListener('submit', function (e) { e.preventDefault(); OL.find(); });
        OL.start();
    },

    start: function () {
        if (!CatalogClient.hasWriteSecret()) return OL.gate('');
        OL.$('gate').classList.add('hidden'); OL.$('app').classList.remove('hidden'); OL.$('q').focus();
        // ?q= opens straight onto a search, so a link can carry an order number.
        var q = new URLSearchParams(location.search).get('q');
        if (q) { OL.$('q').value = q; OL.find(); }
    },

    gate: function (err) { OL.$('app').classList.add('hidden'); OL.$('gate').classList.remove('hidden'); OL.$('gate-err').textContent = err; OL.$('gate-in').focus(); },

    find: function () {
        var q = OL.$('q').value.trim(); if (!q) return;
        OL.$('out').innerHTML = '<p class="sub">Searching...</p>';
        OL.api('/orders/lookup?q=' + encodeURIComponent(q)).then(function (j) {
            if (j.__status === 401 || j.__status === 403) return OL.gate('That write secret was not accepted.');
            if (j.__status !== 200) { OL.$('out').innerHTML = '<div class="msg bad">' + OL.esc(j.error || ('HTTP ' + j.__status)) + '</div>'; return; }
            var os = j.orders || [];
            OL.$('out').innerHTML = !os.length ? '<div class="msg">No orders match "' + OL.esc(q) + '".</div>'
                : (os.length > 1 ? '<p class="sub" style="margin-top:14px">' + os.length + ' orders, newest first. Click one to open it.</p>' : '') + os.map(OL.card).join('');
            OL.$('out').querySelectorAll('.oh').forEach(function (h) { h.onclick = function () { h.nextElementSibling.classList.toggle('hidden'); }; });
            OL.$('out').querySelectorAll('[data-copy]').forEach(function (b) {
                b.onclick = function (e) { e.stopPropagation(); try { navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1200); } catch (x) { /* no clipboard */ } };
            });
        }).catch(function (e) { OL.$('out').innerHTML = '<div class="msg bad">Could not reach the Worker: ' + OL.esc(e.message) + '</div>'; });
    },

    words: function (s) { return String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); },

    pill: function (s, kind) { return '<span class="pill ' + kind + '">' + OL.esc(OL.words(s)) + '</span>'; },

    statusPills: function (o) {
        if (o.cancelled) return OL.pill('Cancelled', 'bad');
        var f = o.fulfillment, p = o.financial;
        return OL.pill(p, /PAID/.test(p) && !/PARTIALLY|PENDING/.test(p) ? 'ok' : /REFUND|VOID/.test(p) ? 'muted' : 'warn') +
            OL.pill(f, f === 'FULFILLED' ? 'ok' : f === 'UNFULFILLED' ? 'warn' : 'muted');
    },

    card: function (o, i, all) {
        var when = o.at ? new Date(o.at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
        var who = o.shipTo && o.shipTo.name ? o.shipTo.name : (o.email || '');
        var head = '<div class="oh"><div><span class="no">' + OL.esc(o.name) + '</span>' + OL.statusPills(o) +
            '<div class="who">' + OL.esc(who) + (o.shipTo && o.shipTo.city ? ' · ' + OL.esc(o.shipTo.city + (o.shipTo.province ? ', ' + o.shipTo.province : '')) : '') + '</div></div>' +
            '<div class="right">' + (o.total != null ? '<b>$' + o.total.toFixed(2) + '</b>' : '') + '<div class="sub">' + OL.esc(when) + (o.source && o.source !== 'web' ? ' · ' + OL.esc(o.source) : '') + '</div></div></div>';
        var items = o.items.map(function (it) {
            var refunded = it.current != null && it.current < it.qty;
            return '<div class="item">' + (it.image ? '<img src="' + OL.esc(it.image) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
                '<div>' + OL.esc(it.title) + '<div class="sub">' + OL.esc(it.variant) + (it.sku ? ' · ' + OL.esc(it.sku) : '') + (refunded ? ' · <span style="color:var(--warn)">' + (it.qty - it.current) + ' removed or refunded</span>' : '') + '</div></div>' +
                '<div class="q">× ' + (it.current != null ? it.current : it.qty) + '</div></div>';
        }).join('');
        var from = o.shipsFrom.length ? o.shipsFrom.map(function (f) {
            return OL.esc(f.location) + ' <span class="sub">(' + OL.esc(OL.words(f.status === 'CLOSED' ? 'shipped' : f.status === 'OPEN' ? 'waiting to ship' : f.status)) + ')</span>';
        }).join('<br>') : '<span class="sub">Not assigned yet</span>';
        var tracks = o.shipments.length ? o.shipments.map(function (s) {
            var t = s.tracking.map(function (x) {
                return '<div class="track">' + OL.esc(x.company || 'Carrier') + ' ' + (x.url ? '<a target="_blank" rel="noopener" href="' + OL.esc(x.url) + '">' + OL.esc(x.number || 'Track') + '</a>' : OL.esc(x.number)) +
                    (x.number ? '<button class="copy" type="button" data-copy="' + OL.esc(x.number) + '">copy</button>' : '') + '</div>';
            }).join('');
            return '<div>' + OL.pill(s.status, /DELIVERED/.test(s.status) ? 'ok' : /FAIL|ATTEMPT/.test(s.status) ? 'bad' : 'muted') + (s.from ? ' <span class="sub">from ' + OL.esc(s.from) + '</span>' : '') + (t || '<div class="sub">No tracking number</div>') + '</div>';
        }).join('') : '<span class="sub">Not shipped yet</span>';
        var contact = (o.email ? '<div>' + OL.esc(o.email) + '<button class="copy" type="button" data-copy="' + OL.esc(o.email) + '">copy</button></div>' : '') +
            (o.phone ? '<div>' + OL.esc(o.phone) + '<button class="copy" type="button" data-copy="' + OL.esc(o.phone) + '">copy</button></div>' : '');
        var addr = o.shipTo ? OL.esc([o.shipTo.name, o.shipTo.line, [o.shipTo.city, o.shipTo.province, o.shipTo.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')) : '<span class="sub">No shipping address (pickup or in store)</span>';
        var body = '<div class="ob' + (all.length > 1 ? ' hidden' : '') + '"><div><h3>Items</h3>' + (items || '<span class="sub">No items</span>') +
            (o.redo ? '<div class="sub" style="margin-top:6px">Includes free returns (re:do).</div>' : '') + '</div>' +
            '<div class="kv"><h3>Ships from</h3><div>' + from + '</div><h3>Tracking</h3><div>' + tracks + '</div>' +
            '<h3>Contact</h3><div>' + (contact || '<span class="sub">None on the order</span>') + '</div><h3>Ship to</h3><div>' + addr + '</div>' +
            '<div><a target="_blank" rel="noopener" href="' + OL.esc(OL.ADMIN + '/orders/' + String(o.id).split('/').pop()) + '">Open in Shopify</a></div></div></div>';
        return '<div class="order">' + head + body + '</div>';
    },
};
OL.init();
