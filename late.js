// Late orders page. One rule for every brand: an order waiting longer than
// the "Late after" number of days is late. The Worker
// (worker/src/late-orders.js) reads Shopify live; chase notes are stored
// there too, so everyone sees who already asked the rep.
//
// House style: no em dashes. Use commas, periods, or the word "to".
var LO = {
    st: { rows: null, filter: 'late', brand: '', open: null, at: null },
    LIMITS: [3, 4, 5, 7, 10, 14],
    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    H: function () { return { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret(), 'Content-Type': 'application/json' }; },
    get: function (k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    limit: function () { var n = +LO.get('rhLateDays', '5'); return LO.LIMITS.indexOf(n) >= 0 ? n : 5; },
    me: function () { return LO.get('rhStaffName', ''); },

    init: function () {
        LO.$('gate-form').addEventListener('submit', function (e) { e.preventDefault(); CatalogClient.setWriteSecret(LO.$('gate-in').value); LO.load(); });
        LO.$('limit').innerHTML = LO.LIMITS.map(function (n) { return '<option value="' + n + '"' + (n === LO.limit() ? ' selected' : '') + '>' + n + ' days</option>'; }).join('');
        LO.$('limit').onchange = function () { LO.set('rhLateDays', this.value); LO.draw(); };
        LO.$('brand').onchange = function () { LO.st.brand = this.value; LO.draw(); };
        LO.$('refresh').onclick = function () { LO.load(); };
        LO.$('copy').onclick = LO.copy;
        LO.load();
        // Keeps itself current on a screen left open, without a refresh.
        setInterval(function () { if (!document.hidden && LO.st.rows && !LO.st.open) LO.load(true); }, 5 * 60000);
    },

    load: function (quiet) {
        if (!CatalogClient.hasWriteSecret()) return LO.gate('');
        if (!quiet) { LO.$('asof').textContent = 'Loading...'; LO.$('refresh').disabled = true; }
        fetch(CatalogClient._writeBase() + '/orders/late', { headers: LO.H() })
            .then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); })
            .then(function (j) {
                LO.$('refresh').disabled = false;
                if (j.__status === 401 || j.__status === 403) return LO.gate('That write secret was not accepted.');
                LO.$('gate').classList.add('hidden'); LO.$('app').classList.remove('hidden');
                if (j.__status !== 200) { LO.$('out').innerHTML = '<div class="msg bad">' + LO.esc(j.error || ('HTTP ' + j.__status)) + '</div>'; LO.$('asof').textContent = ''; return; }
                LO.st.rows = j.rows; LO.st.at = j.at; LO.draw();
            }).catch(function (e) { LO.$('refresh').disabled = false; LO.gate('Could not reach the Worker: ' + e.message); });
    },

    gate: function (err) { LO.$('app').classList.add('hidden'); LO.$('gate').classList.remove('hidden'); LO.$('gate-err').textContent = err; LO.$('gate-in').focus(); },

    when: function (iso) { var d = new Date(iso); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); },
    isLate: function (r) { return r.days > LO.limit(); },
    // The store spells some brands two ways ("ON Running", "On Running"), so
    // a brand is its lower case name, shown in the spelling most rows use.
    key: function (b) { return String(b || '').trim().toLowerCase(); },
    names: function () {
        var c = {};
        LO.st.rows.forEach(function (r) { r.brands.forEach(function (b) { var k = LO.key(b); c[k] = c[k] || {}; c[k][b] = (c[k][b] || 0) + 1; }); });
        var out = {};
        Object.keys(c).forEach(function (k) { out[k] = Object.keys(c[k]).sort(function (a, b) { return c[k][b] - c[k][a]; })[0]; });
        return out;
    },
    brandOf: function (r) {
        var n = LO.st.names || {}, seen = {};
        return r.brands.map(function (b) { return n[LO.key(b)] || b; }).filter(function (b) { return seen[b] ? false : (seen[b] = true); }).join(' + ') || 'Unknown brand';
    },

    shown: function () {
        return LO.st.rows.filter(function (r) {
            return (LO.st.filter === 'all' || LO.isLate(r)) && (!LO.st.brand || r.brands.some(function (b) { return LO.key(b) === LO.st.brand; }));
        });
    },

    draw: function () {
        var rows = LO.st.rows, late = rows.filter(LO.isLate);
        LO.$('n-late').textContent = late.length;
        LO.$('n-all').textContent = rows.length;
        LO.$('asof').textContent = 'Updated ' + new Date(LO.st.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        LO.$('filters').innerHTML = [['late', 'Late (' + late.length + ')'], ['all', 'All waiting (' + rows.length + ')']].map(function (f) {
            return '<button type="button" class="chip' + (LO.st.filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + '</button>';
        }).join('');
        LO.$('filters').querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { LO.st.filter = b.dataset.f; LO.draw(); }; });
        LO.st.names = LO.names();
        var brands = {};
        rows.forEach(function (r) { var ks = {}; r.brands.forEach(function (b) { ks[LO.key(b)] = 1; }); Object.keys(ks).forEach(function (k) { brands[k] = (brands[k] || 0) + 1; }); });
        LO.$('brand').innerHTML = '<option value="">All brands</option>' + Object.keys(brands).sort(function (a, b) { return LO.st.names[a].localeCompare(LO.st.names[b]); }).map(function (k) {
            return '<option value="' + LO.esc(k) + '"' + (LO.st.brand === k ? ' selected' : '') + '>' + LO.esc(LO.st.names[k]) + ' (' + brands[k] + ')</option>';
        }).join('');

        var list = LO.shown();
        LO.$('copy').disabled = !list.length;
        if (!list.length) {
            LO.$('out').innerHTML = '<div class="msg">' + (LO.st.filter === 'late' ? 'Nothing late. Every dropship order has been waiting ' + LO.limit() + ' days or less.' : 'Nothing waiting on a supplier.') + '</div>';
            return;
        }
        LO.$('out').innerHTML = list.map(LO.rowHtml).join('');
        LO.wire();
    },

    rowHtml: function (r) {
        var late = LO.isLate(r), m = r.mail, c = r.chase;
        var mail = !m ? '<span class="sub">No shipping email yet</span>'
            : m.st === 'review' ? '<span class="held">Shipping email held for a person: ' + LO.esc(m.r) + '</span> <a href="tracking.html">Open</a>'
            : m.st === 'skip' ? '<span class="sub">International: tracking to the store ' + LO.esc(m.t) + '</span>'
            : '<span class="seen">Shipping email seen ' + LO.esc(LO.when(m.at)) + ': ' + LO.esc(m.t) + '</span>';
        var open = LO.st.open === r.id;
        return '<div class="row' + (late ? ' late' : '') + '" data-id="' + LO.esc(r.id) + '">' +
            '<div class="days"><b>' + r.days + '</b><span>' + (r.days === 1 ? 'day' : 'days') + '</span></div>' +
            '<div>' +
              '<div class="head"><a href="https://admin.shopify.com/store/therunhouse/orders/' + LO.esc(r.id) + '" target="_blank" rel="noopener"><b>' + LO.esc(r.name) + '</b></a>' +
                '<span class="brand">' + LO.esc(LO.brandOf(r)) + '</span>' +
                '<span class="po">PO ' + LO.esc(r.po) + '</span> <button type="button" class="chip small" data-copy="' + LO.esc(r.po) + '">Copy</button>' +
                '<span class="sub">ordered ' + LO.esc(LO.when(r.at)) + (r.country && r.country !== 'US' ? ', ships to ' + LO.esc(r.country) : '') + '</span></div>' +
              '<ul class="items">' + r.items.map(function (i) { return '<li>' + LO.esc(i.title) + (i.variant ? ' / ' + LO.esc(i.variant) : '') + (i.qty > 1 ? ' ×' + i.qty : '') + '</li>'; }).join('') + '</ul>' +
              '<div class="info">' + mail + '</div>' +
              (c ? '<div class="note">' + LO.esc(c.note) + '<div class="who">' + LO.esc(c.by || 'Someone') + ', ' + LO.esc(LO.when(c.at)) + (c.n > 1 ? ' · ' + c.n + ' notes' : '') + '</div></div>' : '') +
              (open ? '<div class="add"><textarea id="note-in" rows="2" placeholder="What did you do or hear? e.g. Emailed HOKA rep, backorder, ships 11/20"></textarea>' +
                (LO.me() ? '' : '<input id="name-in" placeholder="Your name">') +
                '<div class="btns"><button type="button" class="chip on" id="note-save">Save note</button><button type="button" class="chip" id="note-cancel">Cancel</button></div></div>' : '') +
            '</div>' +
            '<div class="act">' + (open ? '' : '<button type="button" class="chip" data-note="' + LO.esc(r.id) + '">Add note</button>') + '</div>' +
        '</div>';
    },

    wire: function () {
        var out = LO.$('out');
        out.querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { LO.clip(b.dataset.copy, 'Copied PO ' + b.dataset.copy); }; });
        out.querySelectorAll('[data-note]').forEach(function (b) { b.onclick = function () { LO.st.open = b.dataset.note; LO.draw(); var t = LO.$('note-in'); if (t) t.focus(); }; });
        var cancel = LO.$('note-cancel'); if (cancel) cancel.onclick = function () { LO.st.open = null; LO.draw(); };
        var save = LO.$('note-save'); if (save) save.onclick = LO.saveNote;
    },

    saveNote: function () {
        var note = LO.$('note-in').value.trim();
        if (!note) { LO.$('note-in').focus(); return; }
        var nameIn = LO.$('name-in');
        if (nameIn && nameIn.value.trim()) LO.set('rhStaffName', nameIn.value.trim());
        var id = LO.st.open, btn = LO.$('note-save');
        btn.disabled = true; btn.textContent = 'Saving...';
        fetch(CatalogClient._writeBase() + '/orders/late/chase', { method: 'POST', headers: LO.H(), body: JSON.stringify({ id: id, note: note, by: LO.me() }) })
            .then(function (r) { return r.json(); })
            .then(function (j) {
                if (j.error) { btn.disabled = false; btn.textContent = 'Save note'; LO.toast('Not saved: ' + j.error); return; }
                var r = LO.st.rows.filter(function (x) { return x.id === id; })[0], n = j.notes[0];
                if (r) r.chase = { note: n.note, by: n.by, at: n.at, n: j.notes.length };
                LO.st.open = null; LO.draw(); LO.toast('Note saved');
            })
            .catch(function (e) { btn.disabled = false; btn.textContent = 'Save note'; LO.toast('Not saved: ' + e.message); });
    },

    // The orders shown, as plain text for an email to the rep.
    copy: function () {
        var list = LO.shown();
        var text = list.map(function (r) {
            return 'PO ' + r.po + ' (' + r.name + ', ordered ' + LO.when(r.at) + ', ' + r.days + ' days)\n' +
                r.items.map(function (i) { return '  - ' + i.title + (i.variant ? ' / ' + i.variant : '') + (i.qty > 1 ? ' x' + i.qty : ''); }).join('\n');
        }).join('\n\n');
        LO.clip(text, 'Copied ' + list.length + ' order' + (list.length === 1 ? '' : 's'));
    },

    clip: function (text, ok) {
        var done = function () { LO.toast(ok); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { LO.fallbackCopy(text); done(); });
        } else { LO.fallbackCopy(text); done(); }
    },
    fallbackCopy: function (text) {
        var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e) { /* nothing more to try */ }
        document.body.removeChild(t);
    },
    toast: function (msg) {
        var t = LO.$('toast'); t.textContent = msg; t.classList.remove('hidden');
        clearTimeout(LO._t); LO._t = setTimeout(function () { t.classList.add('hidden'); }, 2200);
    },
};
LO.init();
