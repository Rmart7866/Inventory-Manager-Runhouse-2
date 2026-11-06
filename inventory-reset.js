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
        IR.api('/inventory-reset/options').then(function (j) {
            if (j.__status === 401 || j.__status === 403) return IR.gate('That write secret was not accepted.');
            if (j.__status !== 200) return IR.gate('The Worker answered ' + j.__status + ': ' + (j.error || ''));
            IR.$('gate').classList.add('hidden'); IR.$('app').classList.remove('hidden');
            IR.st.opts = j; IR.drawLocs(); IR.wire(); IR.history();
        }).catch(function (e) { IR.gate('Could not reach the Worker: ' + e.message); });
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

    // A picker: type, pick from the list, shown as removable chips.
    picker: function (input, list, picked, key, source) {
        var draw = function () {
            IR.$(picked).innerHTML = IR.st[key].map(function (v, i) {
                var label = typeof v === 'object' ? v.title : v;
                return '<button type="button" class="chip on" data-i="' + i + '">' + IR.esc(label) + '<span class="x">×</span></button>';
            }).join('');
            IR.$(picked).querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { IR.st[key].splice(+b.dataset.i, 1); IR.reset(); draw(); }; });
        };
        var show = function (items) {
            var L = IR.$(list);
            if (!items.length) { L.classList.add('hidden'); return; }
            L.innerHTML = items.map(function (v, i) { return '<button type="button" data-k="' + i + '">' + IR.esc(typeof v === 'object' ? v.title + ' (' + v.n + ')' : v) + '</button>'; }).join('');
            L.classList.remove('hidden');
            L.querySelectorAll('[data-k]').forEach(function (b) {
                b.onmousedown = function (e) { e.preventDefault(); var v = items[+b.dataset.k]; if (IR.st[key].indexOf(v) < 0) IR.st[key].push(v); IR.st.preset = null; IR.drawPresets(); IR.$(input).value = ''; L.classList.add('hidden'); IR.reset(); draw(); };
            });
        };
        var t = null;
        IR.$(input).addEventListener('input', function () {
            var q = this.value.trim().toLowerCase();
            clearTimeout(t);
            if (!q) { show([]); return; }
            t = setTimeout(function () { source(q, show); }, key === 'cols' ? 300 : 0);
        });
        IR.$(input).addEventListener('blur', function () { setTimeout(function () { IR.$(list).classList.add('hidden'); }, 150); });
        return draw;
    },

    drawPresets: function () {
        document.querySelectorAll('[data-preset]').forEach(function (b) { b.classList.toggle('on', IR.st.preset === b.dataset.preset); });
    },

    wire: function () {
        var from = function (arr) { return function (q, show) { show(arr.filter(function (v) { return v.toLowerCase().indexOf(q) >= 0; }).slice(0, 30)); }; };
        IR.drawVendors = IR.picker('f-vendor', 'l-vendor', 'p-vendor', 'vendors', from(IR.st.opts.vendors));
        IR.drawTypes = IR.picker('f-type', 'l-type', 'p-type', 'types', from(IR.st.opts.types));
        IR.drawCols = IR.picker('f-col', 'l-col', 'p-col', 'cols', function (q, show) {
            IR.api('/inventory-reset/collections?q=' + encodeURIComponent(q)).then(function (j) { show(j.collections || []); });
        });
        var drawTags = function () {
            IR.$('p-tag').innerHTML = IR.st.tags.map(function (v, i) { return '<button type="button" class="chip on" data-i="' + i + '">' + IR.esc(v) + '<span class="x">×</span></button>'; }).join('');
            IR.$('p-tag').querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { IR.st.tags.splice(+b.dataset.i, 1); IR.reset(); drawTags(); }; });
        };
        var addTag = function () { var v = IR.$('f-tag').value.trim(); if (v && IR.st.tags.indexOf(v) < 0) { IR.st.tags.push(v); IR.st.preset = null; IR.drawPresets(); } IR.$('f-tag').value = ''; IR.reset(); drawTags(); };
        IR.$('tag-add').onclick = addTag;
        IR.$('f-tag').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
        // A shoe button replaces the other filters, so "all men's shoes"
        // means exactly that and never "men's shoes from one brand" by accident.
        document.querySelectorAll('[data-preset]').forEach(function (b) {
            b.onclick = function () {
                IR.st.preset = IR.st.preset === b.dataset.preset ? null : b.dataset.preset;
                if (IR.st.preset) { IR.st.vendors = []; IR.st.types = []; IR.st.tags = []; IR.st.cols = []; IR.drawVendors(); IR.drawTypes(); IR.drawCols(); drawTags(); }
                IR.drawPresets(); IR.reset();
            };
        });
        IR.$('find').onclick = IR.scan;
        IR.$('stop').onclick = function () { IR.st.stop = true; };
        IR.$('all').onchange = function () { var on = this.checked; IR.st.rows.forEach(function (r) { if (!r.committed) r.pick = on; }); IR.drawRows(); };
        IR.$('confirm-in').addEventListener('input', IR.armGo);
        IR.$('go').onclick = IR.apply;
    },

    filters: function () {
        return { preset: IR.st.preset, vendors: IR.st.vendors, types: IR.st.types, tags: IR.st.tags, collections: IR.st.cols.map(function (c) { return c.id; }) };
    },

    describe: function () {
        var f = IR.filters(), bits = [];
        if (f.preset) bits.push(f.preset === 'mens' ? "all men's shoes" : "all women's shoes");
        if (f.vendors.length) bits.push('brand ' + f.vendors.join(' or '));
        if (f.types.length) bits.push('type ' + f.types.join(' or '));
        if (f.tags.length) bits.push('tag ' + f.tags.join(' or '));
        if (IR.st.cols.length) bits.push('collection ' + IR.st.cols.map(function (c) { return c.title; }).join(' or '));
        return bits.join(', ');
    },

    // Anything changed: the old results no longer describe the choice.
    reset: function () {
        IR.st.rows = []; IR.st.stop = true;
        IR.$('review').classList.add('hidden'); IR.$('confirm').classList.add('hidden'); IR.$('result').innerHTML = ''; IR.$('prog').textContent = '';
        IR.$('bar').classList.add('hidden');
    },

    scan: function () {
        if (!IR.st.loc) { IR.$('prog').textContent = 'Pick a location first.'; return; }
        var f = IR.filters();
        if (!f.preset && !f.vendors.length && !f.types.length && !f.tags.length && !f.collections.length) { IR.$('prog').textContent = 'Pick a shoe button, or at least one brand, type, tag or collection.'; return; }
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

    drawRows: function () {
        var R = IR.st.rows, loc = IR.st.loc;
        var pick = R.filter(function (r) { return r.pick; }), skip = R.filter(function (r) { return r.committed; });
        // Shelf units and below zero counts are reported apart: adding a -3
        // to a real 5 would understate what is about to be cleared.
        var units = pick.reduce(function (a, r) { return a + Math.max(0, r.onHand); }, 0);
        var neg = pick.filter(function (r) { return r.onHand < 0; });
        IR.$('summary').innerHTML = !R.length ? '<div class="msg ok">Nothing in stock at ' + IR.esc(loc.name) + ' for ' + IR.esc(IR.describe()) + '. Nothing to reset.</div>'
            : '<div class="msg">' + '<b>' + pick.length + ' items</b> at ' + IR.esc(loc.name) + ' will be set to 0 (' + IR.esc(IR.describe()) + '): <b>' + units + ' units</b> on the shelf cleared' +
              (neg.length ? ', and ' + neg.length + ' items reading below zero (' + neg.reduce(function (a, r) { return a + r.onHand; }, 0) + ' in all) brought up to 0' : '') + '.' +
              (skip.length ? '<br><span class="tag">Skipped</span> ' + skip.length + ' items have stock committed to unfilled orders, so they are left alone.' : '') +
              '</div>';
        IR.$('rows').innerHTML = R.map(function (r, i) {
            return '<tr' + (r.committed ? ' class="skip"' : '') + '><td><input type="checkbox" data-r="' + i + '"' + (r.pick ? ' checked' : '') + (r.committed ? ' disabled' : '') + ' aria-label="Reset this item"></td>' +
                '<td>' + IR.esc(r.product) + '<div class="sub">' + IR.esc(r.vendor) + ' · ' + IR.esc(r.type) + (r.status !== 'ACTIVE' ? ' · ' + IR.esc(r.status.toLowerCase()) : '') + '</div></td>' +
                '<td>' + IR.esc(r.variant) + '</td><td>' + IR.esc(r.sku) + '</td><td class="num">' + r.onHand + '</td><td class="num">' + (r.committed ? '<span class="tag">' + r.committed + '</span>' : '') + '</td></tr>';
        }).join('');
        IR.$('rows').querySelectorAll('[data-r]').forEach(function (c) { c.onchange = function () { IR.st.rows[+c.dataset.r].pick = c.checked; IR.drawRows(); }; });
        IR.$('confirm').classList.toggle('hidden', !pick.length);
        IR.$('confirm-in').placeholder = 'Type ' + loc.name;
        IR.armGo();
    },

    armGo: function () {
        var loc = IR.st.loc, n = IR.st.rows.filter(function (r) { return r.pick; }).length;
        var ok = loc && IR.$('confirm-in').value.trim().toLowerCase() === loc.name.toLowerCase() && n > 0;
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
            IR.st.rows = []; IR.$('review').classList.add('hidden'); IR.$('confirm-in').value = '';
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
