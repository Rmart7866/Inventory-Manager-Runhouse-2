// Inventory reset page. Every read and write goes through the Worker
// (worker/src/inventory-reset.js), which repeats every guard: this page
// only makes the choices visible and asks for the confirmation.
var IR = {
    st: { opts: null, loc: null, preset: null, vendors: [], types: [], tags: [], cols: [], rows: [], scanning: false, stop: false },
    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },

    api: function (path, body) {
        var h = { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret() };
        if (body) h['Content-Type'] = 'application/json';
        return fetch(CatalogClient._writeBase() + path, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined })
            .then(function (r) { return r.json().catch(function () { return { error: 'HTTP ' + r.status }; }).then(function (j) { j.__status = r.status; return j; }); });
    },

    init: function () {
        IR.$('gate-form').addEventListener('submit', function (e) { e.preventDefault(); CatalogClient.setWriteSecret(IR.$('gate-in').value); IR.start(); });
        IR.start();
    },

    start: function () {
        if (!CatalogClient.hasWriteSecret()) return IR.gate('');
        IR.$('loading').classList.remove('hidden');
        IR.api('/inventory-reset/options').then(function (j) {
            IR.$('loading').classList.add('hidden');
            if (j.__status === 401 || j.__status === 403) return IR.gate('That write secret was not accepted.');
            if (j.__status !== 200) return IR.gate('The Worker answered ' + j.__status + ': ' + (j.error || ''));
            IR.$('gate').classList.add('hidden'); IR.$('app').classList.remove('hidden');
            IR.st.opts = j; IR.drawLocs(); IR.wire(); IR.drawPresets(); IR.history();
        }).catch(function (e) { IR.$('loading').classList.add('hidden'); IR.gate('Could not reach the Worker: ' + e.message); });
    },

    gate: function (err) { IR.$('app').classList.add('hidden'); IR.$('gate').classList.remove('hidden'); IR.$('gate-err').textContent = err; IR.$('gate-in').focus(); },

    myName: function () { try { return localStorage.getItem('rhStaffName') || ''; } catch (e) { return ''; } },

    drawLocs: function () {
        IR.$('locs').innerHTML = IR.st.opts.locations.map(function (l) {
            return '<button type="button" class="chip big' + (IR.st.loc && IR.st.loc.id === l.id ? ' on' : '') + '" data-loc="' + IR.esc(l.id) + '">' + IR.esc(l.name) + '</button>';
        }).join('');
        IR.$('locs').querySelectorAll('[data-loc]').forEach(function (b) {
            b.onclick = function () { IR.st.loc = IR.st.opts.locations.filter(function (l) { return l.id === b.dataset.loc; })[0]; IR.reset(); IR.drawLocs(); };
        });
        var l = IR.st.loc;
        IR.$('loc-note').innerHTML = !l ? '' : l.dropship
            ? '<div class="msg warn"><b>Needham is the dropship location.</b> The inventory manager writes it from supplier files, so the next import puts these numbers back.</div>' : '';
    },

    // ---------- the search and select boxes ----------
    // Click (or the arrow) shows the whole list, typing narrows it, a click
    // ticks or unticks and the list stays open, so several can be picked.
    // Arrow keys move, Enter ticks, Escape closes. `source(q, cb)` gives the
    // options: the brand, type and tag lists arrive with the page, while
    // collections are searched on the store as you type.
    combo: function (root, key, source, opts) {
        var el = IR.$(root), input = el.querySelector('input'), list = el.querySelector('.list'), picked = el.querySelector('.picked'), arrow = el.querySelector('.cb-open');
        opts = opts || {};
        var items = [], hi = -1, open = false;
        var label = function (v) { return typeof v === 'object' ? v.title : v; };
        var same = function (a, b) { return typeof a === 'object' ? a.id === b.id : a === b; };
        var isOn = function (v) { return IR.st[key].some(function (x) { return same(x, v); }); };
        var drawPicked = function () {
            picked.innerHTML = IR.st[key].map(function (v, i) {
                return '<button type="button" class="chip on" data-i="' + i + '" title="Remove">' + IR.esc(label(v)) + '<span class="x">×</span></button>';
            }).join('');
            picked.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { IR.st[key].splice(+b.dataset.i, 1); IR.reset(); drawPicked(); if (open) render(); }; });
        };
        var toggle = function (v) {
            if (isOn(v)) IR.st[key] = IR.st[key].filter(function (x) { return !same(x, v); });
            else IR.st[key].push(v);
            IR.st.preset = null; IR.drawPresets(); IR.reset(); drawPicked(); render();
        };
        var render = function (note) {
            var shown = items.slice(0, 300);
            list.innerHTML = (note ? '<div class="note">' + IR.esc(note) + '</div>' : '') +
                shown.map(function (v, i) {
                    return '<button type="button" role="option" aria-selected="' + isOn(v) + '" class="' + (i === hi ? 'hi ' : '') + (isOn(v) ? 'on' : '') + '" data-k="' + i + '"><span class="tick">' + (isOn(v) ? '✓' : '') + '</span>' +
                        IR.esc(label(v)) + (typeof v === 'object' && v.n != null ? ' <span class="sub">' + v.n + ' products</span>' : '') + '</button>';
                }).join('') +
                (items.length > shown.length ? '<div class="note">' + (items.length - shown.length) + ' more: keep typing to narrow it.</div>' : '') +
                (!items.length && !note ? '<div class="note">Nothing matches.</div>' : '');
            list.querySelectorAll('[data-k]').forEach(function (b) {
                b.onmousedown = function (e) { e.preventDefault(); toggle(items[+b.dataset.k]); };
            });
            var h = list.querySelector('.hi'); if (h) h.scrollIntoView({ block: 'nearest' });
        };
        var t = null;
        var refresh = function () {
            var q = input.value.trim().toLowerCase();
            clearTimeout(t);
            t = setTimeout(function () {
                source(q, function (arr, note) { items = arr; hi = -1; render(note); });
            }, opts.remote ? 300 : 0);
        };
        var show = function () { open = true; input.setAttribute('aria-expanded', 'true'); list.classList.remove('hidden'); refresh(); };
        var hide = function () { open = false; input.setAttribute('aria-expanded', 'false'); list.classList.add('hidden'); hi = -1; };
        input.addEventListener('focus', show);
        input.addEventListener('click', show);
        input.addEventListener('input', show);
        input.addEventListener('blur', function () { setTimeout(hide, 150); });
        arrow.addEventListener('mousedown', function (e) { e.preventDefault(); if (open) { hide(); input.blur(); } else input.focus(); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) show(); var n = Math.min(items.length, 300); if (!n) return; hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; render(); }
            else if (e.key === 'Enter') { e.preventDefault(); if (hi >= 0 && items[hi]) toggle(items[hi]); else if (items.length === 1) toggle(items[0]); }
            else if (e.key === 'Escape') { hide(); input.blur(); }
        });
        drawPicked();
        return drawPicked;
    },

    // The buttons come from the Worker, so the page and the search it runs
    // can never disagree about what "Socks" means. A button replaces the
    // other filters, so "all socks" never quietly becomes "socks from one brand".
    drawPresets: function () {
        var el = IR.$('presets'); if (!el || !IR.st.opts) return;
        el.innerHTML = (IR.st.opts.presets || []).map(function (p) {
            return '<button type="button" class="chip big' + (IR.st.preset === p.key ? ' on' : '') + '" data-preset="' + IR.esc(p.key) + '">' + IR.esc(p.label) + '</button>';
        }).join('');
        el.querySelectorAll('[data-preset]').forEach(function (b) {
            b.onclick = function () {
                IR.st.preset = IR.st.preset === b.dataset.preset ? null : b.dataset.preset;
                if (IR.st.preset) { IR.st.vendors = []; IR.st.types = []; IR.st.tags = []; IR.st.cols = []; IR.drawPicked(); }
                IR.drawPresets(); IR.reset();
            };
        });
    },

    wire: function () {
        var from = function (arr) {
            return function (q, cb) { cb(q ? arr.filter(function (v) { return v.toLowerCase().indexOf(q) >= 0; }) : arr); };
        };
        var o = IR.st.opts;
        var dv = IR.combo('cb-vendor', 'vendors', from(o.vendors));
        var dt = IR.combo('cb-type', 'types', from(o.types));
        var dg = IR.combo('cb-tag', 'tags', from(o.tags || []));
        var dc = IR.combo('cb-col', 'cols', function (q, cb) {
            if (q.length < 2) { cb([], 'Type two or more letters to search collections.'); return; }
            IR.api('/inventory-reset/collections?q=' + encodeURIComponent(q)).then(function (j) { cb(j.collections || []); });
        }, { remote: true });
        IR.drawPicked = function () { dv(); dt(); dg(); dc(); };
        IR.$('find').onclick = IR.scan;
        IR.$('stop').onclick = function () { IR.st.stop = true; };
        IR.$('all').onchange = function () { var on = this.checked; IR.st.rows.forEach(function (r) { if (!r.committed) r.pick = on; }); IR.drawRows(); };
        IR.$('confirm-in').addEventListener('input', IR.armGo);
        IR.$('checked-ok').addEventListener('change', IR.armGo);
        // The last of the three checks: the first press arms the button and
        // says exactly what will happen, a second press within six seconds does it.
        var armed = null;
        IR.$('go').onclick = function () {
            if (!armed) {
                var pick = IR.st.rows.filter(function (r) { return r.pick; });
                var units = pick.reduce(function (a, r) { return a + Math.max(0, r.onHand); }, 0);
                IR.$('go').textContent = 'Sure? Set ' + pick.length + ' items to 0 at ' + IR.st.loc.name + ' (' + units + ' units). Press again';
                IR.$('go').classList.add('armed');
                armed = setTimeout(function () { armed = null; IR.$('go').classList.remove('armed'); IR.armGo(); }, 6000);
                return;
            }
            clearTimeout(armed); armed = null; IR.$('go').classList.remove('armed');
            IR.apply();
        };
    },

    filters: function () {
        return { preset: IR.st.preset, vendors: IR.st.vendors, types: IR.st.types, tags: IR.st.tags, collections: IR.st.cols.map(function (c) { return c.id; }) };
    },

    describe: function () {
        var f = IR.filters(), bits = [];
        if (f.preset) { var p = (IR.st.opts.presets || []).filter(function (x) { return x.key === f.preset; })[0]; bits.push((p ? p.label : f.preset).toLowerCase()); }
        if (f.vendors.length) bits.push('brand ' + f.vendors.join(' or '));
        if (f.types.length) bits.push('type ' + f.types.join(' or '));
        if (f.tags.length) bits.push('tag ' + f.tags.join(' or '));
        if (IR.st.cols.length) bits.push('collection ' + IR.st.cols.map(function (c) { return c.title; }).join(' or '));
        return bits.join(', ');
    },

    // Anything changed: the old results no longer describe the choice.
    reset: function () {
        IR.st.rows = []; IR.st.stop = true;
        IR.$('review').classList.add('hidden'); IR.$('confirm').classList.add('hidden');
        IR.$('result').innerHTML = ''; IR.$('prog').textContent = ''; IR.$('checked-ok').checked = false; IR.$('confirm-in').value = '';
        IR.$('bar').classList.add('hidden');
    },

    scan: function () {
        if (!IR.st.loc) { IR.$('prog').textContent = 'Pick a location first.'; return; }
        var f = IR.filters();
        if (!f.preset && !f.vendors.length && !f.types.length && !f.tags.length && !f.collections.length) { IR.$('prog').textContent = 'Pick a button, or at least one brand, type, tag or collection.'; return; }
        IR.reset();
        IR.st.stop = false; IR.st.scanning = true;
        var rows = [], seen = 0, total = null, loc = IR.st.loc;
        IR.$('find').disabled = true; IR.$('stop').classList.remove('hidden'); IR.$('bar').classList.remove('hidden');
        var done = function (msg) {
            IR.st.scanning = false; IR.$('find').disabled = false; IR.$('stop').classList.add('hidden'); IR.$('bar').classList.add('hidden');
            if (msg) { IR.$('prog').textContent = msg; return; }
            rows.forEach(function (r) { r.pick = !r.committed; });
            IR.st.rows = rows; IR.st.scannedFor = loc.id;
            IR.$('prog').textContent = 'Checked ' + seen + ' products.';
            IR.$('review').classList.remove('hidden'); IR.drawRows();
            IR.$('review').scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        var page = function (cursor) {
            if (IR.st.stop) return done('Stopped. Nothing was changed.');
            IR.api('/inventory-reset/scan', { locationId: loc.id, filters: f, cursor: cursor }).then(function (j) {
                if (j.__status !== 200) return done(j.error || ('HTTP ' + j.__status));
                if (j.total != null) total = j.total;
                seen += j.scanned; rows = rows.concat(j.rows || []);
                IR.$('prog').textContent = 'Checked ' + seen + (total != null ? ' of ' + total : '') + ' products, ' + rows.length + ' items with stock at ' + loc.name + '...';
                IR.$('bar').firstChild.style.width = (total ? Math.min(100, seen / total * 100) : 30) + '%';
                if (j.next) page(j.next); else done();
            }).catch(function (e) { done('Stopped: ' + e.message + '. Nothing was changed.'); });
        };
        page(null);
    },

    // The preview: one card per product with its photo, so staff can SEE what
    // is about to go to zero, and every size and colour under it with its
    // count. A product's box ticks or unticks all of its sizes at once.
    drawRows: function () {
        var R = IR.st.rows, loc = IR.st.loc;
        var pick = R.filter(function (r) { return r.pick; }), skip = R.filter(function (r) { return r.committed; });
        // Shelf units and below zero counts are reported apart: adding a -3
        // to a real 5 would understate what is about to be cleared.
        var units = pick.reduce(function (a, r) { return a + Math.max(0, r.onHand); }, 0);
        var neg = pick.filter(function (r) { return r.onHand < 0; });
        var groups = [], by = {};
        R.forEach(function (r, i) {
            if (!by[r.handle]) { by[r.handle] = { r: r, idx: [] }; groups.push(by[r.handle]); }
            by[r.handle].idx.push(i);
        });
        IR.$('summary').innerHTML = !R.length ? '<div class="msg ok">Nothing in stock at ' + IR.esc(loc.name) + ' for ' + IR.esc(IR.describe()) + '. Nothing to reset.</div>'
            : '<div class="msg"><b>' + pick.length + ' items in ' + groups.filter(function (g) { return g.idx.some(function (i) { return R[i].pick; }); }).length + ' products</b> at ' + IR.esc(loc.name) + ' will be set to 0 (' + IR.esc(IR.describe()) + '): <b>' + units + ' units</b> on the shelf cleared' +
              (neg.length ? ', and ' + neg.length + ' items reading below zero (' + neg.reduce(function (a, r) { return a + r.onHand; }, 0) + ' in all) brought up to 0' : '') + '.' +
              (skip.length ? '<br><span class="tag">Skipped</span> ' + skip.length + ' items have stock committed to unfilled orders, so they are left alone.' : '') + '</div>';
        IR.$('rows').innerHTML = groups.map(function (g, gi) {
            var p = g.r, idx = g.idx;
            var on = idx.filter(function (i) { return R[i].pick; }).length, can = idx.filter(function (i) { return !R[i].committed; }).length;
            var u = idx.reduce(function (a, i) { return a + (R[i].pick ? Math.max(0, R[i].onHand) : 0); }, 0);
            return '<div class="prod' + (on ? '' : ' off') + '">' +
                '<label class="ph"><input type="checkbox" data-g="' + gi + '"' + (on ? ' checked' : '') + (can ? '' : ' disabled') + ' aria-label="Reset all of ' + IR.esc(p.product) + '">' +
                (p.image ? '<img src="' + IR.esc(p.image) + '" alt="" loading="lazy">' : '<span class="noimg">No photo</span>') +
                '<span class="pt"><b>' + IR.esc(p.product) + '</b><span class="sub">' + IR.esc(p.vendor) + ' · ' + IR.esc(p.type) + (p.status !== 'ACTIVE' ? ' · ' + IR.esc(String(p.status).toLowerCase()) : '') + '</span></span>' +
                '<span class="pu">' + u + (u === 1 ? ' unit' : ' units') + '<span class="sub">' + (idx.length === 1 ? (on ? 'ticked' : 'not ticked') : on + ' of ' + idx.length + ' sizes') + '</span></span></label>' +
                '<div class="vars">' + idx.map(function (i) {
                    var r = R[i];
                    return '<label class="var' + (r.committed ? ' skip' : '') + (r.onHand < 0 ? ' neg' : '') + '" title="' + IR.esc((r.sku ? 'SKU ' + r.sku : 'No SKU') + (r.committed ? ', ' + r.committed + ' committed to orders, skipped' : '')) + '">' +
                        '<input type="checkbox" data-r="' + i + '"' + (r.pick ? ' checked' : '') + (r.committed ? ' disabled' : '') + '> ' + IR.esc(r.variant) + ' <b>' + r.onHand + '</b>' +
                        (r.committed ? ' <span class="tag">' + r.committed + ' committed</span>' : '') + '</label>';
                }).join('') + '</div></div>';
        }).join('');
        IR.$('rows').querySelectorAll('[data-r]').forEach(function (c) { c.onchange = function () { IR.st.rows[+c.dataset.r].pick = c.checked; IR.drawRows(); }; });
        IR.$('rows').querySelectorAll('[data-g]').forEach(function (c) {
            c.onchange = function () { groups[+c.dataset.g].idx.forEach(function (i) { if (!R[i].committed) R[i].pick = c.checked; }); IR.drawRows(); };
        });
        IR.$('all').checked = pick.length === R.filter(function (r) { return !r.committed; }).length;
        IR.$('confirm').classList.toggle('hidden', !pick.length);
        IR.$('confirm-in').placeholder = 'Type ' + loc.name;
        IR.armGo();
    },

    armGo: function () {
        var loc = IR.st.loc, n = IR.st.rows.filter(function (r) { return r.pick; }).length;
        var ok = loc && IR.$('checked-ok').checked && IR.$('confirm-in').value.trim().toLowerCase() === loc.name.toLowerCase() && n > 0;
        IR.$('go').disabled = !ok;
        IR.$('go').textContent = loc ? 'Reset ' + n + ' items to 0 at ' + loc.name : 'Reset';
    },

    apply: function () {
        var loc = IR.st.loc, lines = IR.st.rows.filter(function (r) { return r.pick; }).map(function (r) { return { item: r.item, from: r.onHand }; });
        if (IR.st.scannedFor !== loc.id) return;
        IR.$('go').disabled = true; IR.$('go').textContent = 'Resetting...';
        IR.api('/inventory-reset/apply', { locationId: loc.id, confirm: IR.$('confirm-in').value, lines: lines, filters: IR.filters(), by: IR.myName() }).then(function (j) {
            var html;
            if (j.__status === 200) {
                html = '<div class="msg ok"><b>Done.</b> ' + j.written + ' items set to 0 at ' + IR.esc(loc.name) + ' (' + j.units + ' units).' + (j.skipped && j.skipped.length ? ' ' + j.skipped.length + ' skipped.' : '') +
                    ' <button class="btn" type="button" data-undo="' + IR.esc(j.id) + '">Undo this reset</button></div>';
            } else {
                html = '<div class="msg bad">' + IR.esc(j.error || ('HTTP ' + j.__status)) + (j.id && j.written ? ' <button class="btn" type="button" data-undo="' + IR.esc(j.id) + '">Undo the ' + j.written + ' that were written</button>' : '') + '</div>';
            }
            IR.st.rows = []; IR.$('review').classList.add('hidden'); IR.$('confirm-in').value = ''; IR.$('checked-ok').checked = false;
            IR.$('result').innerHTML = html; IR.$('confirm').classList.remove('hidden'); IR.$('go').disabled = true; IR.$('go').textContent = 'Reset';
            IR.wireUndo(IR.$('result')); IR.history();
        });
    },

    wireUndo: function (root) {
        root.querySelectorAll('[data-undo]').forEach(function (b) {
            var armed = false;
            b.onclick = function () {
                if (!armed) { armed = true; b.textContent = 'Sure? Click again to put the counts back'; setTimeout(function () { armed = false; b.textContent = 'Undo this reset'; }, 4000); return; }
                b.disabled = true; b.textContent = 'Undoing...';
                IR.api('/inventory-reset/undo', { id: b.dataset.undo }).then(function (j) {
                    var m = document.createElement('div');
                    m.className = 'msg ' + (j.__status === 200 ? 'ok' : 'bad');
                    m.textContent = j.__status === 200 ? 'Undone: ' + j.restored + ' counts put back.' : (j.error || ('HTTP ' + j.__status));
                    b.replaceWith(m); IR.history();
                });
            };
        });
    },

    history: function () {
        IR.api('/inventory-reset/history').then(function (j) {
            var L = j.resets || [];
            IR.$('history').innerHTML = !L.length ? 'No resets yet.' : '<table><thead><tr><th>When</th><th>Location</th><th class="num">Items</th><th>By</th><th></th></tr></thead><tbody>' +
                L.map(function (r) {
                    return '<tr><td>' + IR.esc(new Date(r.at).toLocaleString()) + '</td><td>' + IR.esc(r.loc) + '</td><td class="num">' + r.n + '</td><td>' + IR.esc(r.by || '') + '</td><td>' +
                        (r.undone ? '<span class="sub">Undone</span>' : '<button class="btn" type="button" data-undo="' + IR.esc(r.id) + '">Undo this reset</button>') + '</td></tr>';
                }).join('') + '</tbody></table>';
            IR.wireUndo(IR.$('history'));
        });
    },
};
IR.init();
