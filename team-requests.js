// team-requests.js, The Run House. The staff side of Build Your Team Store.
//
// Lists the requests customers file on the storefront (stored by the Worker,
// see worker/src/teamreq.js), and lets staff fix them before anything is
// made: change products and colours, set sizes and prices, replace a bad
// logo, drag the logo to where it should sit, then build the whole store as
// Shopify DRAFTS in one go.
//
// Three rules this page keeps:
//   - The customer's original is never edited. Staff edit a working copy,
//     and the Original tab always shows what was actually asked for.
//   - Saving is optimistic but never blind. Every save carries the version it
//     was loaded from, and the Worker refuses a save over someone else's.
//   - Build is dry run first. The plan is shown, then confirmed, then made,
//     and everything is created as a draft.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var TR = {
    st: { list: [], rec: null, dirty: false, filter: 'open', q: '', tab: 'products', D: null, P: {}, CAT: {}, logoSrc: {}, plan: null, busy: false, costs: {} },
    PROOF_PAGE: 'https://rmart7866.github.io/Inventory-Manager-Runhouse-2/proof.html',
    APPROVAL: { approved: 'Customer approved', changes: 'Customer asked for changes', stale: 'Changed since the customer answered' },
    U: TeamReqUtils,
    STATUS: { new: 'New', progress: 'In progress', waiting: 'Waiting on customer', done: 'Done', archived: 'Archived' },
    ADMIN: 'https://admin.shopify.com/store/therunhouse',

    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },

    // ---------- Worker calls ----------
    api: function (path, opts) {
        opts = opts || {};
        var h = { 'Authorization': 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret() };
        var body = opts.form || (opts.body != null ? JSON.stringify(opts.body) : undefined);
        if (opts.body != null) h['Content-Type'] = 'application/json';
        return fetch(CatalogClient._writeBase() + path, { method: opts.method || (body ? 'POST' : 'GET'), headers: h, body: body })
            .then(function (res) {
                return res.json().catch(function () { return { error: 'HTTP ' + res.status }; })
                    .then(function (j) { j.__status = res.status; return j; });
            });
    },

    // ---------- start ----------
    init: function () {
        TR.$('gate-form').addEventListener('submit', function (e) {
            e.preventDefault();
            CatalogClient.setWriteSecret(TR.$('gate-in').value);
            TR.start();
        });
        TR.$('filters').addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            TR.st.filter = b.dataset.f;
            TR.$('filters').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
            TR.renderList();
        });
        TR.$('q').addEventListener('input', function () { TR.st.q = this.value.toLowerCase(); TR.renderList(); });
        TR.$('me').value = TR.myName();
        TR.$('me').addEventListener('change', function () { try { localStorage.setItem('rhStaffName', this.value.trim()); } catch (e) { /* private mode */ } TR.renderList(); });
        TR.$('refresh').addEventListener('click', function () { TR.loadList(); });
        TR.$('cal-open').addEventListener('click', TR.showCalendar);
        TR.$('sales-open').addEventListener('click', TR.showSales);
        window.addEventListener('beforeunload', function (e) { if (TR.st.dirty) { e.preventDefault(); e.returnValue = ''; } });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') TR.closePlacement();
        });
        TR.start();
    },

    start: function () {
        if (!CatalogClient.hasWriteSecret()) { TR.showGate(''); return; }
        TR.api('/team-requests').then(function (j) {
            if (j.__status === 403 || j.__status === 401) {
                CatalogClient.setWriteSecret('');
                TR.showGate(j.reason || j.error || 'That secret was not accepted.');
                return;
            }
            if (j.__status !== 200) { TR.showGate('The Worker answered ' + j.__status + ': ' + (j.error || '')); return; }
            TR.$('gate').classList.add('hidden');
            TR.$('app').classList.remove('hidden');
            TR.st.list = j.requests || [];
            TR.renderList();
            TR.loadCatalog();
            TR.api('/team-requests/costs').then(function (c) { TR.st.costs = (c && c.costs) || {}; });
            var h = location.hash.replace('#', '');
            if (h) TR.open(h);
        }).catch(function (e) { TR.showGate('Could not reach the Worker: ' + e.message); });
    },

    showGate: function (err) {
        TR.$('app').classList.add('hidden');
        TR.$('gate').classList.remove('hidden');
        TR.$('gate-err').textContent = err || '';
        TR.$('gate-in').focus();
    },

    loadCatalog: function () {
        if (TR.st.D) return Promise.resolve(TR.st.D);
        return fetch(TR.U.CATALOG_URL).then(function (r) { return r.json(); }).then(function (D) {
            D.cats.forEach(function (c) {
                c.p.forEach(function (p) {
                    p.img = TR.U.expand(p.img);
                    p.c.forEach(function (k) { k[1] = TR.U.expand(k[1]); k[2] = TR.U.expand(k[2]); if (k.length > 6) k[6] = TR.U.expand(k[6]); });
                    TR.st.P[p.s] = p; TR.st.CAT[p.s] = c.name;
                });
            });
            TR.st.D = D;
            if (TR.st.rec) TR.renderDetail();
            return D;
        });
    },

    loadList: function () {
        return TR.api('/team-requests').then(function (j) { TR.st.list = j.requests || []; TR.renderList(); });
    },

    // ---------- list ----------
    renderList: function () {
        var f = TR.st.filter, q = TR.st.q, me = TR.myName().toLowerCase();
        var dups = TR.duplicates();
        var rows = TR.st.list.filter(function (r) {
            if (f === 'mine' && (!me || String(r.a || '').toLowerCase() !== me || ['done', 'archived'].indexOf(r.s) >= 0)) return false;
            if (f === 'open' && ['new', 'progress', 'waiting'].indexOf(r.s) < 0) return false;
            if (f === 'done' && r.s !== 'done') return false;
            if (f === 'archived' && r.s !== 'archived') return false;
            if (q && (String(r.t) + ' ' + String(r.e)).toLowerCase().indexOf(q) < 0) return false;
            return true;
        });
        var cur = TR.st.rec && TR.st.rec.id;
        TR.$('list').innerHTML = rows.length ? rows.map(function (r) {
            var bits = [r.n + (r.n === 1 ? ' product' : ' products'), TR.ago(r.c)];
            if (r.r) bits.push('releases ' + TR.esc(TR.fmtDate(r.r)));
            else if (r.d) bits.push('asked for ' + TR.esc(TR.fmtDate(r.d)));
            if (r.a) bits.push(TR.esc(r.a));
            var tags = [];
            if (r.ap) tags.push('<span class="tag ' + r.ap + '">' + TR.APPROVAL[r.ap] + '</span>');
            var cd = TR.daysUntil(r.cl);
            if (cd != null && cd >= 0 && cd <= 7 && ['done', 'archived'].indexOf(r.s) < 0) tags.push('<span class="tag closing">Closes ' + (cd === 0 ? 'today' : cd === 1 ? 'tomorrow' : 'in ' + cd + ' days') + '</span>');
            if (dups[r.id]) tags.push('<span class="tag dup">Possible duplicate</span>');
            if (r.m === 'update') tags.push('<span class="tag">Add to store</span>');
            if (r.b) tags.push('<span class="tag">Build it for me</span>');
            return '<button type="button" class="row' + (r.id === cur ? ' on' : '') + '" data-id="' + r.id + '">' +
                '<div class="t"><span>' + TR.esc(r.t || '(no name)') + '</span><span class="pill ' + r.s + '">' + TR.STATUS[r.s] + '</span></div>' +
                '<div class="m">' + bits.join(' · ') + '</div>' + (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') + '</button>';
        }).join('') : '<p class="empty">' + (f === 'mine' && !me ? 'Type your name above to see the requests assigned to you.' : TR.st.list.length ? 'Nothing matches.' : 'No requests yet. They appear here when a customer presses Send on the builder.') + '</p>';
        TR.$('list').querySelectorAll('.row').forEach(function (b) { b.onclick = function () { TR.open(b.dataset.id); }; });
    },

    // This browser's staff name, for the Mine filter. Per browser on purpose:
    // the page has no logins, so it cannot know who is looking.
    myName: function () { try { return localStorage.getItem('rhStaffName') || ''; } catch (e) { return ''; } },

    daysUntil: function (iso) {
        var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return null;
        var t = new Date(); t.setHours(0, 0, 0, 0);
        return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - t) / 86400000);
    },

    // A likely resend: within a week, and either the same team name (letters
    // and digits only) or the same email AND the same first word of the team
    // ("Walpole T&F" against "Walpole Track & Field"). The same email alone is
    // NOT enough: one athletic director files a store per sport, and calling
    // those duplicates would teach staff to ignore the flag. Those are
    // returned separately as "same contact", a note rather than a warning.
    duplicates: function () { return TR.related().dup; },

    related: function () {
        var dup = {}, contact = {}, L = TR.st.list.filter(function (r) { return r.s !== 'archived'; });
        var norm = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        var first = function (t) { return (String(t || '').toLowerCase().match(/[a-z0-9]+/) || [''])[0]; };
        var add = function (m, a, b) { (m[a.id] = m[a.id] || []).push(b.id); (m[b.id] = m[b.id] || []).push(a.id); };
        for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) {
            var a = L[i], b = L[j];
            if (Math.abs(new Date(a.c) - new Date(b.c)) >= 7 * 86400000) continue;
            var sameEmail = a.e && a.e.toLowerCase() === String(b.e || '').toLowerCase();
            if ((norm(a.t) && norm(a.t) === norm(b.t)) || (sameEmail && first(a.t) && first(a.t) === first(b.t))) add(dup, a, b);
            else if (sameEmail) add(contact, a, b);
        }
        return { dup: dup, contact: contact };
    },

    ago: function (iso) {
        var d = new Date(iso), s = (Date.now() - d) / 1000;
        if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
        if (s < 86400) return Math.round(s / 3600) + ' h ago';
        if (s < 86400 * 14) return Math.round(s / 86400) + ' days ago';
        return d.toLocaleDateString();
    },

    // ---------- one request ----------
    open: function (id) {
        if (TR.st.dirty && TR.st.rec && TR.st.rec.id !== id) {
            if (!window.confirm('You have unsaved changes on this request. Leave them?')) return;
        }
        TR.api('/team-requests/one?id=' + encodeURIComponent(id)).then(function (rec) {
            if (rec.__status !== 200) { TR.$('detail').innerHTML = '<p class="msg bad">' + TR.esc(rec.error || 'Could not load') + '</p>'; return; }
            delete rec.__status;
            TR.st.rec = rec; TR.st.dirty = false; TR.st.plan = null; TR.st.tab = TR.st.tab || 'products'; TR.st.view = 'detail';
            history.replaceState(null, '', '#' + id);
            TR.renderList();
            TR.$('detail').innerHTML = '<p class="empty">Loading logos...</p>';
            TR.prepLogos().then(function () { if (TR.st.rec && TR.st.rec.id === rec.id) TR.renderDetail(); });
        });
    },

    touch: function () {
        TR.st.dirty = true; TR.st.plan = null;
        var s = TR.$('save'); if (s) s.disabled = false;
        var n = TR.$('dirty'); if (n) n.textContent = 'Unsaved changes';
    },

    save: function (extra) {
        var r = TR.st.rec;
        var patch = Object.assign({ work: r.work, notes: r.notes }, extra || {});
        return TR.api('/team-requests/update', { body: { id: r.id, base: r.updated, patch: patch } }).then(function (j) {
            if (j.__status === 409) { TR.flash('Someone else saved this request since you opened it. Reload it to see their change, then redo yours.', 'bad'); return false; }
            if (j.__status !== 200) { TR.flash(j.error || j.reason || ('Save failed, HTTP ' + j.__status), 'bad'); return false; }
            TR.st.rec = j.rec; TR.st.dirty = false;
            TR.loadList();
            TR.renderDetail();
            return true;
        });
    },

    flash: function (text, kind) {
        var m = TR.$('flash'); if (!m) return;
        m.className = 'msg ' + (kind || 'ok'); m.textContent = text; m.classList.remove('hidden');
    },

    renderDetail: function () {
        var r = TR.st.rec; if (!r) return;
        var q = r.req || {}, w = r.work || {}, c = q.contact || {};
        // Only what changes how staff handle the request is a flag. The rest
        // is one quiet line of facts.
        var flags = [];
        if (q.mode === 'update') flags.push('<span class="flag hot">Add to existing store: ' + TR.esc(q.store && q.store.name) + '</span>');
        if (q.build_for_me) flags.push('<span class="flag hot">Build it for me</span>');
        if (r.build && r.build.at) flags.push('<span class="flag">Drafts built ' + TR.ago(r.build.at) + '</span>');
        var facts = [];
        if (q.group) facts.push(TR.esc(q.group));
        if (q.team_colors && q.team_colors.main) facts.push(TR.esc(q.team_colors.main + (q.team_colors.second ? ' + ' + q.team_colors.second : '')));
        if (q.fundraising_pct) facts.push('fundraising ' + TR.esc(q.fundraising_pct) + '%');

        TR.$('detail').innerHTML =
            '<div class="dhead"><div>' +
                '<div class="team"><input type="text" id="d-team" value="' + TR.esc(w.team) + '" aria-label="Team name"></div>' +
                '<div class="who">' + TR.esc(c.name || '') + ' · <a href="mailto:' + TR.esc(c.email) + '">' + TR.esc(c.email) + '</a>' + (c.phone ? ' · ' + TR.esc(c.phone) : '') + ' · sent ' + TR.ago(r.created) + '</div>' +
                '<div class="rel"><label for="d-rel">Release</label><input type="date" id="d-rel" value="' + TR.esc(w.release || '') + '">' +
                    '<label for="d-close">Orders close</label><input type="date" id="d-close" value="' + TR.esc(w.close || '') + '">' +
                    '<label for="d-who">Handled by</label><input type="text" id="d-who" list="who-list" value="' + TR.esc(w.assignee || '') + '" placeholder="Name" style="width:130px">' +
                    '<datalist id="who-list">' + TR.names().map(function (n) { return '<option value="' + TR.esc(n) + '">'; }).join('') + '</datalist></div>' +
                (q.date ? '<div class="sub" style="margin-top:6px">Customer asked for ' + TR.esc(TR.fmtDate(q.date)) + (w.release ? '' : ', shown on the calendar until you set a release date') + '.</div>' : '') +
                (facts.length ? '<div class="sub" style="margin-top:6px">' + facts.join(' · ') + '</div>' : '') +
                (flags.length ? '<div class="flags">' + flags.join('') + '</div>' : '') +
            '</div><div class="acts">' +
                '<select id="d-status" aria-label="Status">' + Object.keys(TR.STATUS).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? ' selected' : '') + '>' + TR.STATUS[k] + '</option>'; }).join('') + '</select>' +
                '<button class="btn" type="button" id="d-link">Approval link</button>' +
                '<button class="btn" type="button" id="d-mail">Email the proof</button>' +
                '<button class="btn" type="button" id="d-pdf">Proof PDF</button>' +
                '<button class="btn pri" type="button" id="save"' + (TR.st.dirty ? '' : ' disabled') + '>Save</button>' +
                '<span class="dirty-note" id="dirty">' + (TR.st.dirty ? 'Unsaved changes' : '') + '</span>' +
            '</div></div>' +
            '<div id="flash" class="msg hidden"></div>' +
            TR.approvalHtml(r) + TR.dupHtml(r) +
            (w.close && w.release && w.close < w.release ? '<div class="msg warn"><b>Orders close before the store opens.</b> Close ' + TR.esc(TR.fmtDate(w.close)) + ', opens ' + TR.esc(TR.fmtDate(w.release)) + '. One of the dates is probably wrong.</div>' : '') +
            (q.notes ? '<div class="msg warn"><b>Customer note:</b> ' + TR.esc(q.notes) + '</div>' : '') +
            '<div class="tabs" role="tablist">' + [['products', 'Products (' + (w.items || []).length + ')'], ['logos', 'Logos'], ['build', 'Build'], ['orig', 'History']].map(function (t) {
                return '<button type="button" role="tab" data-t="' + t[0] + '" class="' + (TR.st.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
            }).join('') + '</div><div id="pane"></div>';

        TR.$('d-team').addEventListener('input', function () { w.team = this.value; TR.touch(); });
        TR.$('d-rel').addEventListener('change', function () { w.release = this.value; TR.touch(); });
        TR.$('d-close').addEventListener('change', function () { w.close = this.value; TR.touch(); });
        TR.$('d-who').addEventListener('input', function () { w.assignee = this.value; TR.touch(); });
        TR.$('d-link').addEventListener('click', function () { TR.showLink(false); });
        TR.$('d-mail').addEventListener('click', function () { TR.emailProof(this); });
        TR.$('detail').querySelectorAll('[data-open]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); TR.open(a.dataset.open); }; });
        TR.$('d-status').addEventListener('change', function () { TR.save({ status: this.value }); });
        TR.$('save').addEventListener('click', function () { TR.save(); });
        TR.$('d-pdf').addEventListener('click', function () { TR.proofPdf(this); });
        TR.$('detail').querySelectorAll('.tabs button').forEach(function (b) {
            b.onclick = function () { TR.st.tab = b.dataset.t; TR.renderDetail(); };
        });
        ({ products: TR.paneProducts, logos: TR.paneLogos, build: TR.paneBuild, orig: TR.paneOrig })[TR.st.tab]();
    },


    names: function () {
        var seen = {}, out = [];
        TR.st.list.concat([{ a: TR.myName() }]).forEach(function (r) { var n = String(r.a || '').trim(); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; out.push(n); } });
        return out.sort();
    },

    // The customer's answer, at the top where it cannot be missed. A stale
    // approval says so plainly: the yes was for a store that has since changed.
    approvalHtml: function (r) {
        var a = r.approval; if (!a) return '';
        var when = new Date(a.at).toLocaleString(), by = a.by ? ' (' + TR.esc(a.by) + ')' : '';
        if (a.stale) return '<div class="msg warn"><b>Changed since the customer answered.</b> They ' + (a.state === 'approved' ? 'approved' : 'asked for changes') + ' on ' + when + by + ', before your latest edits. Send the link again so they see the current store.</div>';
        if (a.state === 'approved') return '<div class="msg ok"><b>Customer approved</b> on ' + when + by + '.' + (a.message ? ' They added: ' + TR.esc(a.message) : '') + '</div>';
        return '<div class="msg warn"><b>Customer asked for changes</b> on ' + when + by + ': ' + TR.esc(a.message) + '</div>';
    },

    dupHtml: function (r) {
        var rel = TR.related(), d = rel.dup[r.id], c = rel.contact[r.id];
        var links = function (ids) {
            return ids.map(function (id) {
                var o = TR.st.list.filter(function (x) { return x.id === id; })[0];
                return '<a href="#' + id + '" data-open="' + id + '">' + TR.esc(o ? o.t : id) + ', sent ' + (o ? TR.ago(o.c) : '') + '</a>';
            }).join(', ');
        };
        return (d ? '<div class="msg warn"><b>Possible duplicate</b> of ' + links(d) + '. Archive one if it is a resend.</div>' : '') +
            (c ? '<div class="msg"><b>Same contact</b> also sent ' + links(c) + '.</div>' : '');
    },

    // ---------- approval link ----------
    go: function (url) { window.location.href = url; },

    linkFor: function (id, t) { return TR.PROOF_PAGE + '?id=' + encodeURIComponent(id) + '&t=' + encodeURIComponent(t); },

    getLink: function (renew) {
        var r = TR.st.rec;
        return TR.api('/team-requests/proof-link', { body: { id: r.id, renew: !!renew } }).then(function (j) {
            if (j.__status !== 200) throw new Error(j.error || j.reason || ('HTTP ' + j.__status));
            TR.st.rec = j.rec;
            return TR.linkFor(j.id, j.t);
        });
    },

    showLink: function (renew) {
        if (TR.st.dirty) { TR.flash('Save your changes first, so the link shows them.', 'warn'); return; }
        TR.getLink(renew).then(function (url) {
            TR.renderDetail();
            TR.flash('', 'ok');
            var m = TR.$('flash');
            m.innerHTML = '<b>Approval link</b> for the customer. Anyone with it can see this store and answer, so send it only to them.' +
                '<div class="linkrow"><input type="text" readonly id="lk" value="' + TR.esc(url) + '"><button class="btn" type="button" id="lk-copy">Copy</button>' +
                '<a class="btn" href="' + TR.esc(url) + '" target="_blank" rel="noopener">Open</a><button class="btn quiet" type="button" id="lk-new">Make a new link</button></div>' +
                '<div class="sub">A new link stops the old one working. Use it if this one went to the wrong person.</div>';
            TR.$('lk').addEventListener('focus', function (e) { e.target.select(); });
            TR.$('lk-copy').onclick = function () {
                var b = this;
                (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = 'Copied'; }, function () { TR.$('lk').select(); b.textContent = 'Press Cmd+C'; });
            };
            TR.$('lk-new').onclick = function () { TR.showLink(true); };
        }).catch(function (e) { TR.flash('Could not make the link: ' + e.message, 'bad'); });
    },

    // ---------- email the proof ----------
    // Downloads the proof PDF and opens an email to the customer. The PDF is
    // the whole proof: owner's call, the email carries no link, and the
    // customer answers by replying. An email link cannot attach a file, so
    // the message is written for the PDF that just downloaded to be attached.
    emailProof: function (btn) {
        var r = TR.st.rec, c = (r.req && r.req.contact) || {};
        if (TR.st.dirty) { TR.flash('Save your changes first, so the proof shows them.', 'warn'); return; }
        if (!c.email) { TR.flash('This request has no customer email.', 'bad'); return; }
        var w = r.work, first = String(c.name || '').split(/\s+/)[0];
        var body = (first ? 'Hi ' + first + ',' : 'Hi,') + '\n\n' +
            'Attached is the proof for the ' + w.team + ' team store. It shows every product in each colour, with the sizes, prices and where your logo will go.' +
            (w.release ? ' We are planning to open the store on ' + TR.fmtDate(w.release) + '.' : '') + '\n\n' +
            'Please reply to this email to approve it, or tell us what you would like changed and we will send you an updated proof. Nothing goes live until you approve.\n\n' +
            'Thanks,\nThe Run House\nteamstores@therunhouse.com';
        var href = 'mailto:' + encodeURIComponent(c.email) + '?subject=' + encodeURIComponent('Your ' + w.team + ' team store proof') + '&body=' + encodeURIComponent(body);
        TR.proofPdf(TR.$('d-pdf'), function () {
            TR.go(href);
            // Sent to the customer, so it is now waiting on them.
            TR.save({ status: r.status === 'new' || r.status === 'progress' ? 'waiting' : r.status }).then(function () {
                TR.flash('The proof PDF downloaded and your email opened. Attach the PDF, then send. Status is now Waiting on customer.', 'ok');
            });
        });
    },

    // "2026-12-01" to "Tue, Dec 1, 2026", read as a calendar day, never as
    // UTC midnight, which would show the day before in Massachusetts.
    fmtDate: function (iso) {
        var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return String(iso || '');
        return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    },

    // Two clicks, not a browser dialog: the first arms it for four seconds.
    armDelete: function (b) {
        var t = null;
        b.onclick = function () {
            if (!b.classList.contains('arm')) {
                b.classList.add('arm'); b.textContent = 'Click again to delete for good';
                t = setTimeout(function () { b.classList.remove('arm'); b.textContent = 'Delete this request'; }, 4000);
                return;
            }
            clearTimeout(t);
            var r = TR.st.rec;
            TR.api('/team-requests/delete', { body: { id: r.id } }).then(function (j) {
                if (j.__status !== 200) { TR.flash(j.error || ('Delete failed, HTTP ' + j.__status), 'bad'); return; }
                TR.st.rec = null; TR.st.dirty = false;
                history.replaceState(null, '', location.pathname);
                TR.$('detail').innerHTML = '<p class="msg ok">Deleted.</p>';
                TR.loadList();
            });
        };
    },

    // ---------- garment + logo, as the builder draws it ----------
    logoSlotSrc: function (slot) {
        var L = TR.st.rec && TR.st.rec.work.logos && TR.st.rec.work.logos[slot];
        if (!L) return Promise.resolve(null);
        if (L.url) return Promise.resolve(L.url);
        if (!L.key) return Promise.resolve(null);
        if (TR.st.logoSrc[L.key]) return Promise.resolve(TR.st.logoSrc[L.key]);
        // Staff uploads live behind the write secret, so they are fetched with
        // it and shown from a blob url.
        return fetch(CatalogClient._writeBase() + '/team-requests/logo-file?key=' + encodeURIComponent(L.key), {
            headers: { 'Authorization': 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret() }
        }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
            .then(function (b) { var u = URL.createObjectURL(b); TR.st.logoSrc[L.key] = u; return u; })
            .catch(function () { return null; });
    },

    // Load and clean every logo on the request once: white backgrounds
    // knocked out, trimmed, and colour samples taken for the per colour pick
    // (TeamReqUtils.loadLogo, the back office renderer's rule). Everything
    // that draws a logo reads TR.st.L afterwards, so it is synchronous.
    prepLogos: function () {
        var logos = (TR.st.rec && TR.st.rec.work.logos) || {};
        TR.st.L = {};
        return Promise.all(Object.keys(logos).map(function (k) {
            if (!TR.isImageLogo(k)) return null;
            return TR.logoSlotSrc(k).then(function (src) { return src ? TR.U.loadLogo(src) : null; })
                .then(function (o) { if (o) TR.st.L[k] = o; }).catch(function () { /* drawn as missing */ });
        }));
    },

    hexOf: function (p, color) { var c = p.c[TR.colorIdx(p, color)]; return c ? c[5] : '#888888'; },

    // Which logo goes on this colour: the customer's per colour pick, the
    // item's fixed choice, else whichever shows best. which 'f' front, 'x' second.
    logoOf: function (it, p, color, which) { return TR.U.resolveLogo(it, color, which, TR.st.L || {}, TR.hexOf(p, color)); },
    logoUrl: function (k) { return k && TR.st.L && TR.st.L[k] ? TR.st.L[k].url : null; },

    isImageLogo: function (slot) {
        var L = TR.st.rec.work.logos[slot]; if (!L) return false;
        var n = String(L.name || L.url || L.key || '') + ' ' + String(L.type || '');
        return !/\.(pdf|ai|eps)\b|application\/(pdf|postscript|illustrator)/i.test(n);
    },

    lbHtml: function (box, src, id) {
        var st = 'left:' + (box[0] * 100) + '%;top:' + (box[1] * 100) + '%;width:' + (box[2] * 100) + '%;height:' + (box[3] * 100) + '%' + (box[4] ? ';transform:rotate(' + box[4] + 'deg)' : '');
        return '<div class="lb"' + (id ? ' id="' + id + '"' : '') + ' style="' + st + '">' + (src ? '<img alt="" src="' + TR.esc(src) + '">' : '<span>LOGO</span>') + (id ? '<div class="h" id="' + id + '-h"></div>' : '') + '</div>';
    },

    // The front of a garment: its logo, plus a second logo when the customer
    // put one on the sleeve (a front side location).
    mkHtml: function (p, colorName, box, logoSrc, id, extra) {
        var ci = TR.colorIdx(p, colorName), c = p.c[ci] || p.c[0];
        var lb = box ? TR.lbHtml(box, logoSrc, id) : '';
        if (extra && extra.box) lb += TR.lbHtml(extra.box, extra.src, null);
        return '<span class="mk"><img class="g" crossorigin="anonymous" alt="' + TR.esc(p.n + ' in ' + (c ? c[0] : '')) + '" src="' + TR.esc(c ? c[2] : p.img) + '">' + lb + '</span>';
    },

    // The back, for a back or back neck second logo. Null when the colour has
    // no back photo, or the catalog marks it as one that takes no back logo.
    backHtml: function (it, p, colorName) {
        var l = TR.U.loc2(it, p), c = p.c[TR.colorIdx(p, colorName)];
        if (!l || l.side !== 'b' || !c || !c[6]) return null;
        var src = c[7] ? null : TR.logoUrl(TR.logoOf(it, p, colorName, 'x'));
        return '<span class="mk"><img class="g" crossorigin="anonymous" alt="' + TR.esc(p.n + ' in ' + c[0] + ', back') + '" src="' + TR.esc(c[6]) + '">' + (src ? TR.lbHtml(l.box, src, null) : '') + '</span>';
    },

    // The front preview of one colour, with everything that prints on it.
    frontOf: function (it, p, colorName, id, boxOverride) {
        var l = TR.U.loc2(it, p);
        var extra = l && l.side === 'f' ? { box: l.box, src: TR.logoUrl(TR.logoOf(it, p, colorName, 'x')) } : null;
        return TR.mkHtml(p, colorName, boxOverride || TR.U.boxFor(it, p, colorName), TR.logoUrl(TR.logoOf(it, p, colorName, 'f')), id, extra);
    },

    // colorIdx falls back to the first colour, which is right for a preview
    // and WRONG for a build: a colour the product does not carry would be
    // created as its first colour under the requested name, a black hoodie
    // called Kelly Green. So a build checks membership with these first.
    hasColor: function (p, name) { return p.c.some(function (c) { return c[0] === name; }); },
    unknownColors: function (it, p) { return it.colors.filter(function (n) { return !TR.hasColor(p, n); }); },

    colorIdx: function (p, name) {
        for (var i = 0; i < p.c.length; i++) if (p.c[i][0] === name) return i;
        return 0;
    },

    // ---------- products ----------
    paneProducts: function () {
        var w = TR.st.rec.work, pane = TR.$('pane');
        if (!TR.st.D) { pane.innerHTML = '<p class="empty">Loading the product catalog...</p>'; return; }
        var bfm = TR.st.rec.req && TR.st.rec.req.build_for_me;
        pane.innerHTML = (!w.items.length || bfm ? '<div class="msg">' + (bfm ? '<b>Build it for me:</b> the customer left the products to us. ' : '') +
                'Fill from the starter set for their group (' + TR.esc((TR.st.rec.req && TR.st.rec.req.group) || 'School sports team') + '): six proven styles in their main colour plus a neutral, priced with their fundraising. ' +
                '<button class="btn" type="button" id="fill-starter">Fill from starter set</button></div>' : '') +
            (w.items || []).map(function (it, i) { return TR.itemHtml(it, i); }).join('') +
            '<datalist id="pl-words"><option value="Full chest"><option value="Left chest"><option value="Front"><option value="Full back"><option value="Sleeve"></datalist>' +
            '<div class="adder"><label class="f" for="add-q">Add a product</label><input type="search" id="add-q" placeholder="Search by name or style code, e.g. hoodie or DT6100" autocomplete="off"><div class="res hidden" id="add-res"></div></div>';
        (w.items || []).forEach(function (it, i) { TR.wireItem(it, i); });
        TR.wireAdder();
        var fs = TR.$('fill-starter'); if (fs) fs.onclick = TR.fillStarter;
        // Keep the colour list open across the redraw a toggle causes.
        if (TR.st.openCols != null) {
            var oc = document.querySelector('.item[data-i="' + TR.st.openCols + '"] [data-more]');
            TR.st.openCols = null;
            if (oc) oc.click();
        }
    },

    itemHtml: function (it, i) {
        var p = TR.st.P[it.style];
        if (!p) {
            return '<div class="item"><div></div><div><div class="name">' + TR.esc(it.style) + '</div><p class="bad">This style is no longer in the builder catalog, so it cannot be previewed or built. Remove it or swap it for a current style.</p><div class="bar"><button class="btn danger" type="button" data-rm="' + i + '">Remove</button></div></div></div>';
        }
        var cat = TR.st.CAT[it.style];
        if (it.sizes == null) it.sizes = TR.U.sizesFor(p, cat);
        if (!it.cost && TR.st.costs[it.style]) it.cost = TR.st.costs[it.style];
        var first = it.colors[0] || (p.c[0] && p.c[0][0]);
        var problems = [];
        if (!it.colors.length) problems.push('Pick at least one colour.');
        var unknown = TR.unknownColors(it, p);
        if (unknown.length) problems.push('Not a colour this product comes in: ' + unknown.map(TR.esc).join(', ') + '. Remove it and pick the right one from + colour.');
        if (!it.sizes.length) problems.push('The catalog does not say which sizes this comes in. Type them in.');
        var slots = Object.keys(TR.st.rec.work.logos || {});
        return '<div class="item" data-i="' + i + '">' +
            '<div class="thumbs" id="thumb-' + i + '">' + TR.frontOf(it, p, first) + (TR.backHtml(it, p, first) || '') + '</div>' +
            '<div><div class="name">' + TR.esc(p.n) + ' <span class="sub">' + TR.esc(p.s) + ' · ' + TR.esc(cat) + (p.z ? ' · ' + TR.esc(p.z) : '') + '</span></div>' +
            '<div class="grid">' +
                '<div class="wide"><label class="f">Colours</label><div class="chips">' + it.colors.map(function (n) {
                    var known = TR.hasColor(p, n), c = known ? p.c[TR.colorIdx(p, n)] : null;
                    return '<button type="button" class="chip on' + (known ? '' : ' unk') + '" data-col="' + TR.esc(n) + '" title="' + (known ? 'Click to remove' : 'Not a colour of this product. Click to remove') + '"><i style="background:' + (c ? c[5] : 'transparent') + '"></i>' + TR.esc(n) + ' ×</button>';
                }).join('') + '<button type="button" class="chip" data-more="1">+ colour</button></div><div class="allcols hidden" id="allcols-' + i + '"></div></div>' +
                '<div><label class="f" for="sz-' + i + '">Sizes</label><input type="text" id="sz-' + i + '" value="' + TR.esc(it.sizes.join(', ')) + '" style="width:100%"></div>' +
                '<div><label class="f" for="pr-' + i + '">Price</label><input type="number" min="0" step="0.01" id="pr-' + i + '" value="' + (it.price || '') + '" style="width:100%"></div>' +
                '<div><label class="f" for="co-' + i + '">Our cost</label><input type="number" min="0" step="0.01" id="co-' + i + '" value="' + (it.cost || '') + '" placeholder="' + (TR.st.costs[it.style] ? TR.st.costs[it.style] : '') + '" style="width:100%"></div>' +
            '</div>' +
            '<div class="money" id="mo-' + i + '">' + TR.moneyHtml(it) + '</div>' +
            (problems.length ? '<p class="bad">' + problems.join(' ') + '</p>' : '') +
            // One line for the logo: where it sits, and the one button that
            // changes it. The logo picker appears only when there is a choice.
            '<div class="bar"><span class="where">Logo: <b>' + TR.esc(it.placement || 'default placement') + '</b>' + TR.tiltNote(it) + '</span>' +
            '<button class="btn" type="button" data-place="' + i + '">Move logo</button>' +
            (slots.length > 1 ? TR.logoSelect('lg-' + i, it.logo, 'Front logo') : '') +
            '<span style="flex:1"></span><button class="btn danger quiet" type="button" data-rm="' + i + '">Remove</button></div>' +
            (p.loc && Object.keys(p.loc).length ? '<div class="bar"><span class="where">Second logo</span><select id="l2-' + i + '" aria-label="Second logo location"><option value="">None</option>' +
                Object.keys(p.loc).map(function (k) { return '<option' + (k === it.second_logo ? ' selected' : '') + '>' + TR.esc(k) + '</option>'; }).join('') + '</select>' +
                (it.second_logo && slots.length > 1 ? TR.logoSelect('lx-' + i, it.logo2, 'Second logo') : '') +
                '<span class="sub">A second logo adds $3 to the price; changing it here does not reprice.</span></div>' : '') +
            (it.logoBy && Object.keys(it.logoBy).length ? '<p class="sub" style="margin:6px 0 0">The customer picked which logo goes on each colour. Choosing a logo above replaces their picks.</p>' : '') +
            '</div></div>';
    },

    logoSelect: function (id, value, label) {
        var logos = TR.st.rec.work.logos || {};
        return '<select id="' + id + '" aria-label="' + label + '"><option value="auto"' + (!value || value === 'auto' ? ' selected' : '') + '>' + label + ': auto, best on each colour</option>' +
            Object.keys(logos).map(function (k) { return '<option value="' + k + '"' + (k === value ? ' selected' : '') + '>' + label + ': ' + TR.esc(logos[k].label || k) + '</option>'; }).join('') + '</select>';
    },

    // The price check. The builder adds the team's fundraising percentage on
    // top of the base price, so the team's share comes off the top before
    // our margin. Cost is ours and never leaves this page or the Worker.
    moneyHtml: function (it) {
        var price = Number(it.price) || 0, cost = Number(it.cost) || 0;
        var pct = Number((TR.st.rec.req || {}).fundraising_pct) || 0;
        var team = pct ? price - price / (1 + pct / 100) : 0;
        if (!price) return '<span class="sub">Set a price to see the margin.</span>';
        if (!cost) return (pct ? 'Team fundraising $' + team.toFixed(2) + ' (' + pct + '%) · ' : '') + '<span class="sub">Add our cost to see the margin.</span>';
        var m = price - team - cost, mp = m / price * 100;
        var cls = m <= 0 ? 'neg' : mp < 25 ? 'thin' : 'okm';
        return (pct ? 'Team fundraising $' + team.toFixed(2) + ' · ' : '') + '<span class="' + cls + '">Our margin $' + m.toFixed(2) + ' (' + mp.toFixed(0) + '%)</span>' + (m <= 0 ? ' · <b>selling at a loss</b>' : mp < 25 ? ' · thin' : '');
    },

    // ", moved" or ", tilted 8 degrees", so the card says what was changed
    // without opening the editor.
    tiltNote: function (it) {
        var b = it.boxes || {}, keys = Object.keys(b);
        if (!keys.length) return '';
        var t = keys.map(function (k) { return b[k][4] || 0; }).filter(function (a) { return a; });
        return t.length ? ', moved and tilted ' + Math.abs(t[0]) + '\u00b0' : ', moved';
    },

    wireItem: function (it, i) {
        var card = document.querySelector('.item[data-i="' + i + '"]') || document.querySelector('[data-rm="' + i + '"]').closest('.item');
        var rm = card.querySelector('[data-rm]');
        if (rm) rm.onclick = function () { TR.st.rec.work.items.splice(i, 1); TR.touch(); TR.paneProducts(); };
        var p = TR.st.P[it.style]; if (!p) return;
        card.querySelectorAll('.chip.on').forEach(function (b) {
            b.onclick = function () { it.colors = it.colors.filter(function (n) { return n !== b.dataset.col; }); delete it.boxes[b.dataset.col]; TR.touch(); TR.paneProducts(); };
        });
        card.querySelector('[data-more]').onclick = function () {
            var box = TR.$('allcols-' + i);
            if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return; }
            box.innerHTML = '<div class="chips">' + p.c.filter(function (c) { return !c[4]; }).map(function (c) {
                var on = it.colors.indexOf(c[0]) >= 0;
                return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-add="' + TR.esc(c[0]) + '"><i style="background:' + c[5] + '"></i>' + TR.esc(c[0]) + '</button>';
            }).join('') + '</div>';
            box.classList.remove('hidden');
            box.querySelectorAll('[data-add]').forEach(function (b) {
                b.onclick = function () {
                    var n = b.dataset.add, k = it.colors.indexOf(n);
                    if (k >= 0) it.colors.splice(k, 1); else it.colors.push(n);
                    TR.st.openCols = i; TR.touch(); TR.paneProducts();
                };
            });
        };
        TR.$('sz-' + i).addEventListener('change', function () {
            it.sizes = this.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); TR.touch(); TR.paneProducts();
        });
        TR.$('pr-' + i).addEventListener('input', function () { it.price = Number(this.value) || 0; TR.touch(); TR.$('mo-' + i).innerHTML = TR.moneyHtml(it); });
        TR.$('co-' + i).addEventListener('input', function () { it.cost = Number(this.value) || 0; TR.touch(); TR.$('mo-' + i).innerHTML = TR.moneyHtml(it); });
        // A staff choice applies to every colour, so it replaces the
        // customer's per colour picks for that logo position.
        var clearBy = function (which) { Object.keys(it.logoBy || {}).forEach(function (c) { it.logoBy[c][which] = ''; }); };
        var lg = TR.$('lg-' + i);
        if (lg) lg.addEventListener('change', function () { it.logo = this.value; clearBy('f'); TR.touch(); TR.paneProducts(); });
        var lx = TR.$('lx-' + i);
        if (lx) lx.addEventListener('change', function () { it.logo2 = this.value; clearBy('x'); TR.touch(); TR.paneProducts(); });
        var l2 = TR.$('l2-' + i);
        if (l2) l2.addEventListener('change', function () { it.second_logo = this.value; TR.touch(); TR.paneProducts(); });
        card.querySelector('[data-place]').onclick = function () { TR.openPlacement(i); };
    },

    // ---------- starter sets (the back office runbook, step 2) ----------
    STARTER: {
        'Track & XC': ['PC380', 'ST350LS', 'DT6100', '9904', 'DT1800', 'C402'],
        'School sports team': ['NL6010', 'DT6100', 'S6000', 'DT6107', 'C402', '92001'],
        'Run club': ['ST350', 'LST350', 'ST350LS', 'LST356', 'ST850', 'NKFB6444'],
        'School or PTO': ['PC380', 'PC380Y', 'DT6100', 'PC78YH', 'DT1800', 'BP60'],
        'Business or organization': ['BC3001CVC', 'DT6100', 'ST850', 'K500', 'F223', 'C402'],
        'Charity, race or event': ['PC450', 'PC380', 'DT6100', 'DT6104', 'ST850', 'C402'],
    },

    // The colour family code of the team's main colour. A colour that was
    // not listed arrives as "NOT LISTED: <name> ~ closest <family>".
    mainFamily: function () {
        var q = TR.st.rec.req || {}, name = String((q.team_colors && q.team_colors.main) || ''), m = name.match(/closest (.+)$/);
        if (m) name = m[1];
        var f = (TR.st.D.fam || []).filter(function (x) { return x[1].toLowerCase() === name.trim().toLowerCase(); })[0];
        return f ? f[0] : '';
    },

    fillStarter: function () {
        var w = TR.st.rec.work, q = TR.st.rec.req || {};
        var styles = TR.STARTER[q.group] || TR.STARTER['School sports team'];
        var fam = TR.mainFamily(), pct = Number(q.fundraising_pct) || 0;
        // A light logo reads on black, a dark one on white or grey heather.
        var main = TR.st.L && (TR.st.L.main || TR.st.L[Object.keys(TR.st.L)[0]]), light = false;
        if (main && main.samples.length) {
            var lum = main.samples.reduce(function (a, s) { return a + (0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2]) / 255; }, 0) / main.samples.length;
            light = lum > 0.6;
        }
        var neutrals = light ? ['BK'] : ['WH', 'GH'];
        var best = function (p, codes) {
            var pool = p.c.filter(function (c) { return !c[4] && codes.indexOf(c[8]) >= 0; });
            pool.sort(function (a, b) { return codes.indexOf(a[8]) - codes.indexOf(b[8]) || (a[9] || 0) - (b[9] || 0); });
            return pool[0] ? pool[0][0] : null;
        };
        var added = [], missing = [];
        styles.forEach(function (st) {
            var p = TR.st.P[st]; if (!p) { missing.push(st); return; }
            if (w.items.some(function (it) { return it.style === st; })) return;
            var cat = TR.st.CAT[st], one = /Headwear|Bags/.test(cat || '');
            var cols = [];
            var a = fam ? best(p, [fam]) : null; if (a) cols.push(a);
            if (!one || !cols.length) { var n = best(p, neutrals); if (n && cols.indexOf(n) < 0) cols.push(n); }
            if (!cols.length && p.c[0]) cols.push(p.c[0][0]);
            w.items.push({
                style: st, colors: one ? cols.slice(0, 1) : cols, placement: p.ch || p.pm === 'fc' ? 'Full chest' : 'Front',
                second_logo: '', price: Math.ceil((p.m || 0) * (1 + pct / 100)), sizes: null, boxes: {}, logo: 'auto', logo2: 'auto', logoBy: {},
            });
            added.push(p.n);
        });
        TR.touch(); TR.paneProducts();
        TR.flash('Added ' + added.length + ' from the ' + (q.group || 'School sports team') + ' starter set' + (fam ? '' : ', with neutral colours only because the main colour did not match a family') + '.' + (missing.length ? ' Not in the catalog: ' + missing.join(', ') + '.' : '') + ' Check them, then Save.', missing.length ? 'warn' : 'ok');
    },

    wireAdder: function () {
        var q = TR.$('add-q'), res = TR.$('add-res');
        q.addEventListener('input', function () {
            var s = this.value.trim().toLowerCase();
            if (s.length < 2) { res.classList.add('hidden'); return; }
            var hits = [];
            Object.keys(TR.st.P).forEach(function (k) {
                var p = TR.st.P[k];
                if ((p.n + ' ' + p.s + ' ' + TR.st.CAT[k]).toLowerCase().indexOf(s) >= 0) hits.push(p);
            });
            hits.sort(function (a, b) { return (b.u || 0) - (a.u || 0); });
            res.innerHTML = hits.slice(0, 14).map(function (p) {
                return '<button type="button" data-s="' + TR.esc(p.s) + '"><img alt="" src="' + TR.esc(p.img) + '"><span><b>' + TR.esc(p.n) + '</b><br><span class="sub">' + TR.esc(p.s) + ' · ' + TR.esc(TR.st.CAT[p.s]) + ' · $' + p.m + '</span></span></button>';
            }).join('') || '<p class="empty">No match.</p>';
            res.classList.remove('hidden');
            res.querySelectorAll('button').forEach(function (b) {
                b.onclick = function () {
                    var p = TR.st.P[b.dataset.s];
                    TR.st.rec.work.items.push({ style: p.s, colors: [], placement: p.ch ? 'Full chest' : 'Front', second_logo: '', price: p.m || 0, sizes: null, boxes: {}, logo: 'main' });
                    TR.st.openCols = TR.st.rec.work.items.length - 1;
                    TR.touch(); TR.paneProducts();
                    var cards = document.querySelectorAll('.item'); var last = cards[cards.length - 1];
                    if (last) last.scrollIntoView({ block: 'center' });
                };
            });
        });
    },

    // ---------- placement editor ----------
    // Drag the box to move the logo, drag the corner to size it. The box is
    // stored in fractions of the photo, the same units as the catalog's own
    // print boxes, so it means the same thing on the mockup and in the builder.
    openPlacement: function (i) {
        var it = TR.st.rec.work.items[i], p = TR.st.P[it.style];
        var colors = it.colors.length ? it.colors : [p.c[0][0]];
        var pe = { i: i, color: colors[0], box: TR.box5(TR.U.boxFor(it, p, colors[0]) || [0.3, 0.25, 0.4, 0.3]), scope: it.boxes && it.boxes[colors[0]] ? 'one' : 'all' };
        TR.st.pe = pe;
        var el = TR.$('pe');
        el.classList.remove('hidden');
        Promise.resolve(TR.logoUrl(TR.logoOf(it, p, colors[0], 'f'))).then(function (src) {
            pe.src = src;
            el.innerHTML = '<div class="box"><div class="stage" id="pe-stage"></div><div class="side">' +
                '<h3 id="pe-h">Move the logo</h3><p>' + TR.esc(p.n) + '. Drag the box to move it, drag the blue corner to resize, and tilt it with the slider. The logo keeps its shape inside the box.</p>' +
                '<label class="f">Preview colour</label><div class="chips" id="pe-cols">' + colors.map(function (n) {
                    var c = p.c[TR.colorIdx(p, n)];
                    return '<button type="button" class="chip' + (n === pe.color ? ' on' : '') + '" data-c="' + TR.esc(n) + '"><i style="background:' + (c ? c[5] : '#888') + '"></i>' + TR.esc(n) + '</button>';
                }).join('') + '</div>' +
                '<label class="f" style="margin-top:12px" for="pe-tilt">Tilt <span id="pe-tilt-v"></span></label>' +
                '<input type="range" id="pe-tilt" min="-45" max="45" step="1" value="' + pe.box[4] + '" style="width:100%">' +
                '<label class="f" style="margin-top:12px" for="pe-words">Placement, as the colour option says it</label>' +
                '<input type="text" id="pe-words" list="pl-words" value="' + TR.esc(it.placement || '') + '" placeholder="e.g. Left chest" style="width:100%">' +
                '<label class="f" style="margin-top:12px">Apply to</label><select id="pe-scope" style="width:100%"><option value="all"' + (pe.scope === 'all' ? ' selected' : '') + '>Every colour of this product</option><option value="one"' + (pe.scope === 'one' ? ' selected' : '') + '>This colour only</option></select>' +
                '<div class="readout" id="pe-read"></div>' +
                '<div class="row2"><button class="btn" type="button" id="pe-reset">Catalog default</button></div>' +
                '<div class="row2"><button class="btn" type="button" id="pe-cancel">Cancel</button><button class="btn pri" type="button" id="pe-save">Use this placement</button></div>' +
                (src ? '' : '<p class="msg warn">This logo cannot be drawn here (a PDF or AI file, or missing), so the box is shown empty. Replace it on the Logos tab with a PNG to see it.</p>') +
                '</div></div>';
            TR.drawPlacement();
            TR.$('pe-cols').querySelectorAll('button').forEach(function (b) {
                b.onclick = function () {
                    pe.color = b.dataset.c;
                    pe.box = TR.box5(TR.U.boxFor(it, p, pe.color) || pe.box);
                    TR.$('pe-tilt').value = pe.box[4];
                    TR.$('pe-cols').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
                    TR.drawPlacement();
                };
            });
            TR.$('pe-scope').onchange = function () { pe.scope = this.value; };
            TR.$('pe-reset').onclick = function () { pe.box = TR.box5(TR.U.defaultBox(p, it.placement) || pe.box); TR.$('pe-tilt').value = pe.box[4]; TR.drawPlacement(); };
            // Tilt turns the box about its centre, the same rotation the
            // preview (CSS) and the mockup (canvas) both apply.
            TR.$('pe-tilt').oninput = function () { pe.box[4] = Number(this.value) || 0; TR.drawPlacement(); };
            TR.$('pe-cancel').onclick = TR.closePlacement;
            TR.$('pe-save').onclick = function () {
                it.boxes = it.boxes || {};
                var b = pe.box.slice(0, 4).map(function (v) { return Math.round(v * 10000) / 10000; });
                if (pe.box[4]) b.push(pe.box[4]);
                // The words in the colour option ("Navy w/ Left Chest Logo").
                // Moving the box does not rewrite them: only a person knows
                // whether a box near the heart is "left chest" or a small full chest.
                it.placement = TR.$('pe-words').value.trim();
                if (pe.scope === 'all') { it.boxes = { '*': b }; } else { it.boxes[pe.color] = b; }
                TR.closePlacement(); TR.touch(); TR.paneProducts();
            };
        });
    },

    // Every box carries a tilt in degrees as its fifth number, 0 if level.
    box5: function (b) { var o = (b || []).slice(0, 5); o[4] = Number(o[4]) || 0; return o; },

    closePlacement: function () { var el = TR.$('pe'); if (el) { el.classList.add('hidden'); el.innerHTML = ''; } TR.st.pe = null; },

    drawPlacement: function () {
        var pe = TR.st.pe; if (!pe) return;
        var it = TR.st.rec.work.items[pe.i], p = TR.st.P[it.style];
        var stage = TR.$('pe-stage');
        // The logo that actually goes on the colour being previewed.
        pe.src = TR.logoUrl(TR.logoOf(it, p, pe.color, 'f'));
        stage.innerHTML = TR.mkHtml(p, pe.color, pe.box, pe.src, 'pe-lb');
        TR.readout();
        var lb = TR.$('pe-lb'), handle = TR.$('pe-lb-h'), mk = stage.querySelector('.mk');
        var start = null;
        var down = function (mode) {
            return function (e) {
                e.preventDefault(); e.stopPropagation();
                var r = mk.getBoundingClientRect();
                start = { mode: mode, x: e.clientX, y: e.clientY, box: pe.box.slice(), W: r.width, H: r.height };
                (e.target.setPointerCapture ? e.target : lb).setPointerCapture(e.pointerId);
            };
        };
        var move = function (e) {
            if (!start) return;
            var dx = (e.clientX - start.x) / start.W, dy = (e.clientY - start.y) / start.H, b = start.box.slice();
            if (start.mode === 'move') {
                b[0] = Math.min(Math.max(0, b[0] + dx), 1 - b[2]);
                b[1] = Math.min(Math.max(0, b[1] + dy), 1 - b[3]);
            } else {
                b[2] = Math.min(Math.max(0.03, b[2] + dx), 1 - b[0]);
                b[3] = Math.min(Math.max(0.03, b[3] + dy), 1 - b[1]);
            }
            pe.box = b;
            lb.style.left = b[0] * 100 + '%'; lb.style.top = b[1] * 100 + '%'; lb.style.width = b[2] * 100 + '%'; lb.style.height = b[3] * 100 + '%';
            TR.readout();
        };
        var up = function () { start = null; };
        lb.addEventListener('pointerdown', down('move'));
        handle.addEventListener('pointerdown', down('size'));
        [lb, handle].forEach(function (x) { x.addEventListener('pointermove', move); x.addEventListener('pointerup', up); x.addEventListener('pointercancel', up); });
        // Arrow keys nudge by half a percent, for the last bit of alignment.
        lb.tabIndex = 0;
        lb.setAttribute('aria-label', 'Logo position. Arrow keys move it, shift and arrow keys resize it, [ and ] tilt it.');
        lb.addEventListener('keydown', function (e) {
            if (e.key === '[' || e.key === ']') {
                e.preventDefault();
                pe.box[4] = Math.max(-45, Math.min(45, (pe.box[4] || 0) + (e.key === ']' ? 1 : -1)));
                TR.$('pe-tilt').value = pe.box[4]; TR.drawPlacement(); TR.$('pe-lb').focus(); return;
            }
            var k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!k) return;
            e.preventDefault();
            var b = pe.box.slice(), s = 0.005;
            if (e.shiftKey) { b[2] = Math.max(0.03, b[2] + k[0] * s); b[3] = Math.max(0.03, b[3] + k[1] * s); }
            else { b[0] = Math.max(0, Math.min(1 - b[2], b[0] + k[0] * s)); b[1] = Math.max(0, Math.min(1 - b[3], b[1] + k[1] * s)); }
            pe.box = b; TR.drawPlacement(); TR.$('pe-lb').focus();
        });
    },

    readout: function () {
        var b = TR.st.pe && TR.st.pe.box, el = TR.$('pe-read'); if (!b || !el) return;
        el.textContent = 'left ' + (b[0] * 100).toFixed(1) + '%  top ' + (b[1] * 100).toFixed(1) + '%  width ' + (b[2] * 100).toFixed(1) + '%  height ' + (b[3] * 100).toFixed(1) + '%  tilt ' + (b[4] || 0) + '\u00b0';
        var tv = TR.$('pe-tilt-v'); if (tv) tv.textContent = (b[4] || 0) + '\u00b0';
    },

    // ---------- logos ----------
    paneLogos: function () {
        var w = TR.st.rec.work, slots = Object.keys(w.logos || {});
        var pane = TR.$('pane');
        pane.innerHTML = (slots.length ? '<div class="logos">' + slots.map(function (k) {
            var L = w.logos[k];
            return '<div class="logo" data-k="' + k + '"><div class="checker" id="lg-pv-' + k + '"><span>Loading</span></div>' +
                '<b>' + TR.esc(L.label || k) + '</b><div class="sub">' + TR.esc(L.name || (L.url ? L.url.split('/').pop().split('?')[0] : '')) + ' · ' + (L.from === 'staff' ? 'replaced by staff' : 'from the customer') + '</div>' +
                '<div id="lg-warn-' + k + '"></div>' +
                (TR.st.L && TR.st.L[k] && TR.st.L[k].cleaned ? '<p class="sub" style="margin:4px 0">White background removed automatically for the mockups.</p>' : '') +
                '<label class="f" for="cd-' + k + '" style="margin-top:8px">Logo Master Folder code</label><input type="text" id="cd-' + k + '" data-code="' + k + '" value="' + TR.esc(L.code || '') + '" placeholder="e.g. D055" style="width:120px;text-transform:uppercase">' +
                '<div class="bar" style="display:flex;gap:8px;margin-top:8px"><label class="btn" style="display:inline-flex;align-items:center">Replace<input type="file" accept=".png,.jpg,.jpeg,.svg,.webp,.pdf,.ai,.eps" data-up="' + k + '" class="hidden"></label>' +
                (L.url ? '<a class="btn" style="text-decoration:none;display:inline-flex;align-items:center" target="_blank" rel="noopener" href="' + TR.esc(L.url) + '">Open file</a>' : '') + '</div></div>';
        }).join('') + '</div>' : '<p class="empty">The customer did not upload a logo.' + (TR.st.rec.req.logos ? ' They said: ' + TR.esc(TR.st.rec.req.logos) : '') + '</p>') +
            '<div class="bar" style="margin-top:14px;display:flex;gap:8px;align-items:center"><label class="btn" style="display:inline-flex;align-items:center">Add another logo<input type="file" accept=".png,.jpg,.jpeg,.svg,.webp,.pdf,.ai,.eps" data-up="__new" class="hidden"></label><span class="sub">A replaced logo keeps the original in the history, and every preview and mockup switches to the new file.</span></div>' +
            (slots.length ? '<h3 style="margin:22px 0 6px;font-size:15px">Print files</h3><p class="sub" style="max-width:720px">Each logo at print size for every place it is used on this store: 300 dpi transparent PNGs named <b>CODE (FC).png</b> and so on, the Logo Master Folder convention. Codes come from that folder: the store\'s first letter and the next free number, a different code for each artwork.</p>' +
                '<div class="bar" style="display:flex;gap:8px;align-items:center"><button class="btn pri" type="button" id="pf-go">Download print files</button><span class="sub" id="pf-msg"></span></div>' : '');
        slots.forEach(function (k) { TR.checkLogo(k); });
        pane.querySelectorAll('[data-code]').forEach(function (inp) {
            inp.addEventListener('input', function () { w.logos[inp.dataset.code].code = this.value.trim().toUpperCase(); TR.touch(); });
        });
        var pf = TR.$('pf-go'); if (pf) pf.onclick = function () { TR.printFiles(pf); };
        pane.querySelectorAll('input[data-up]').forEach(function (inp) {
            inp.onchange = function () {
                var f = inp.files[0]; if (!f) return;
                var slot = inp.dataset.up;
                if (slot === '__new') { var n = 2; while (w.logos['logo' + n]) n++; slot = 'logo' + n; }
                if (TR.st.dirty) { TR.flash('Save your other changes first, then replace the logo.', 'warn'); return; }
                var fd = new FormData(); fd.append('id', TR.st.rec.id); fd.append('slot', slot); fd.append('file', f);
                TR.flash('Uploading ' + f.name + '...', 'warn');
                TR.api('/team-requests/logo', { method: 'POST', form: fd }).then(function (j) {
                    if (j.__status !== 200) { TR.flash(j.error || ('Upload failed, HTTP ' + j.__status), 'bad'); return; }
                    TR.st.rec = j.rec;
                    TR.prepLogos().then(function () { TR.renderDetail(); TR.flash('Logo replaced. The original is still listed in the history.', 'ok'); });
                });
            };
        });
    },

    // ---------- print files (make_logo_files.py, in the browser) ----------
    // Which print locations each logo is used in on this store.
    printNeeds: function () {
        var w = TR.st.rec.work, need = {};
        var add = function (k, pl) { if (k) { need[k] = need[k] || {}; need[k][pl] = 1; } };
        w.items.forEach(function (it) {
            var p = TR.st.P[it.style]; if (!p) return;
            var cat = TR.st.CAT[p.s], pl = TR.U.plCode(it.placement, cat), l2 = TR.U.loc2(it, p);
            it.colors.forEach(function (n) {
                add(TR.logoOf(it, p, n, 'f'), pl);
                if (l2) add(TR.logoOf(it, p, n, 'x'), TR.U.plCode(l2.name, cat));
            });
        });
        return need;
    },

    JSZIP: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',

    printFiles: function (btn) {
        var w = TR.st.rec.work, logos = w.logos || {}, need = TR.printNeeds(), msg = TR.$('pf-msg');
        var keys = Object.keys(need);
        if (!keys.length) { msg.textContent = 'No product uses a logo yet.'; return; }
        var noCode = keys.filter(function (k) { return !logos[k].code; }), noImg = keys.filter(function (k) { return !TR.st.L[k]; });
        if (noCode.length) { msg.textContent = 'Give ' + noCode.map(function (k) { return logos[k].label || k; }).join(', ') + ' a code first.'; return; }
        btn.disabled = true; msg.textContent = 'Making files...';
        var load = window.JSZip ? Promise.resolve() : new Promise(function (res, rej) { var sc = document.createElement('script'); sc.src = TR.JSZIP; sc.onload = res; sc.onerror = function () { rej(new Error('Could not load the zip library')); }; document.head.appendChild(sc); });
        load.then(function () {
            var zip = new window.JSZip(), warn = [], jobs = [];
            keys.filter(function (k) { return TR.st.L[k]; }).forEach(function (k) {
                Object.keys(need[k]).forEach(function (pl) {
                    var L = TR.st.L[k], inch = TR.U.PRINT_IN[pl] || TR.U.PRINT_IN.FC, W = Math.round(inch[0] * 300), H = Math.round(inch[1] * 300);
                    var sc = Math.min(W / L.w, H / L.h);
                    if (sc > 1.15) warn.push(logos[k].code + ' (' + pl + '): the file is only ' + L.w + ' x ' + L.h + ' px, enlarged ' + sc.toFixed(1) + 'x to reach ' + inch[0] + ' x ' + inch[1] + ' in');
                    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(L.w * sc)); cv.height = Math.max(1, Math.round(L.h * sc));
                    var x = cv.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
                    x.drawImage(L.canvas, 0, 0, cv.width, cv.height);
                    jobs.push(new Promise(function (res) { cv.toBlob(function (b) { zip.file(logos[k].code + ' (' + pl + ').png', b); res(); }, 'image/png'); }));
                });
            });
            return Promise.all(jobs).then(function () {
                if (warn.length || noImg.length) zip.file('READ ME.txt', (warn.length ? 'Enlarged to reach print size, ask for a bigger file or a vector:\n' + warn.join('\n') + '\n\n' : '') + (noImg.length ? 'Not made here (PDF or AI files, make these by hand):\n' + noImg.map(function (k) { return logos[k].code + ' ' + (logos[k].name || ''); }).join('\n') + '\n' : ''));
                return zip.generateAsync({ type: 'blob' });
            }).then(function (blob) {
                var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                a.download = String(w.team || 'team').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-logo-files.zip';
                document.body.appendChild(a); a.click(); a.remove();
                btn.disabled = false;
                msg.textContent = jobs.length + ' files.' + (warn.length ? ' ' + warn.length + ' had to be enlarged, see READ ME.txt.' : '') + (noImg.length ? ' PDF or AI logos are not included.' : '') + ' Save them to the store\'s folder in the Logo Master Folder.';
            });
        }).catch(function (e) { btn.disabled = false; msg.textContent = 'Could not make the files: ' + e.message; });
    },

    // Checks a print shop would ask about, shown as hints, never as blockers.
    checkLogo: function (k) {
        var pv = TR.$('lg-pv-' + k), warn = TR.$('lg-warn-' + k), out = [];
        if (!TR.isImageLogo(k)) {
            pv.innerHTML = '<span>' + TR.esc(String(TR.st.rec.work.logos[k].name || 'File').split('.').pop().toUpperCase()) + ' file</span>';
            warn.innerHTML = '<p class="warn">Cannot be previewed here. Open it to check it, and convert it to a PNG for the mockups.</p>';
            return;
        }
        TR.logoSlotSrc(k).then(function (src) {
            if (!src) { pv.innerHTML = '<span>Missing</span>'; return; }
            var im = new Image(); im.crossOrigin = 'anonymous';
            im.onload = function () {
                pv.innerHTML = ''; pv.appendChild(im);
                var long = Math.max(im.naturalWidth, im.naturalHeight);
                if (long && long < 1000) out.push('Low resolution, ' + im.naturalWidth + ' x ' + im.naturalHeight + ' px. Print wants about 2000 px across, or a vector file.');
                try {
                    var c = document.createElement('canvas'), W = Math.min(200, im.naturalWidth), H = Math.min(200, im.naturalHeight);
                    c.width = W; c.height = H; var g = c.getContext('2d'); g.drawImage(im, 0, 0, W, H);
                    var px = [[1, 1], [W - 2, 1], [1, H - 2], [W - 2, H - 2]].map(function (q) { return g.getImageData(q[0], q[1], 1, 1).data; });
                    if (px.every(function (d) { return d[3] > 240 && d[0] > 235 && d[1] > 235 && d[2] > 235; })) out.push('White background, not transparent. It will print as a white box on a dark garment.');
                } catch (e) { /* tainted canvas, skip the check */ }
                var hats = TR.st.rec.work.items.some(function (it) { return /Headwear|Bags/.test(TR.st.CAT[it.style] || '') && (it.logo || 'main') === k; });
                if (hats) out.push('Used on a hat or bag, which is usually embroidered: the decorator will need a vector or a digitized file.');
                warn.innerHTML = out.map(function (t) { return '<p class="warn">' + TR.esc(t) + '</p>'; }).join('');
            };
            im.onerror = function () { pv.innerHTML = '<span>Could not load</span>'; };
            im.src = src;
        });
    },

    // ---------- original and history ----------
    paneOrig: function () {
        var r = TR.st.rec;
        TR.$('pane').innerHTML =
            '<label class="f" for="d-notes">Staff notes</label><textarea id="d-notes" style="width:100%;min-height:90px">' + TR.esc(r.notes || '') + '</textarea>' +
            '<h3 style="margin:18px 0 6px;font-size:15px">History</h3><ul class="log">' + (r.log || []).slice().reverse().map(function (l) { return '<li>' + new Date(l.at).toLocaleString() + ': ' + TR.esc(l.what) + '</li>'; }).join('') + '</ul>' +
            '<h3 style="margin:18px 0 6px;font-size:15px">What the customer sent</h3><pre class="orig">' + TR.esc(r.text || JSON.stringify(r.req, null, 2)) + '</pre>' +
            // Out of the header on purpose: a permanent delete should not sit
            // one click from Save. Archive (the status) is the everyday way out.
            '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--line)"><button class="btn danger" type="button" id="del">Delete this request</button> <span class="sub">Permanent. To just clear it from the inbox, set the status to Archived.</span></div>';
        TR.$('d-notes').addEventListener('input', function () { r.notes = this.value; TR.touch(); });
        TR.armDelete(TR.$('del'));
    },

    // ---------- build ----------
    // One product for the build. Each colour's option value names the code
    // of the logo printed on it and where, "Jet Black (D055 (FC))", the form
    // the Logo Master Folder and the hand built stores use; a colour whose
    // logo has no code yet is reported by codeProblems() and blocks the build.
    specFor: function (it) {
        var p = TR.st.P[it.style]; if (!p) return null;
        var cat = TR.st.CAT[p.s], pl = TR.U.plCode(it.placement, cat), logos = TR.st.rec.work.logos || {};
        return {
            style: p.s, name: p.n, category: cat, sizes: it.sizes || TR.U.sizesFor(p, cat), price: it.price,
            colors: it.colors.map(function (n) {
                var k = TR.logoOf(it, p, n, 'f'), L = k && logos[k];
                return { name: n, label: L && L.code ? TR.U.codeLabel(n, L.code, pl) : TR.U.colorLabel(n, it.placement, L && L.label) };
            }),
        };
    },

    // Every logo that will print on something needs its Logo Master Folder
    // code before a build, because the code is what the colour names carry
    // and what the decorator files are named by.
    codeProblems: function () {
        var w = TR.st.rec.work, logos = w.logos || {}, need = {};
        w.items.forEach(function (it) {
            var p = TR.st.P[it.style]; if (!p) return;
            it.colors.forEach(function (n) {
                var k = TR.logoOf(it, p, n, 'f'); if (k) need[k] = 1;
                if (TR.U.loc2(it, p)) { var x = TR.logoOf(it, p, n, 'x'); if (x) need[x] = 1; }
            });
        });
        return Object.keys(need).filter(function (k) { return logos[k] && !logos[k].code; }).map(function (k) { return logos[k].label || k; });
    },

    paneBuild: function () {
        var r = TR.st.rec, w = r.work, pane = TR.$('pane');
        if (!TR.st.D) { pane.innerHTML = '<p class="empty">Loading the product catalog...</p>'; return; }
        var problems = [];
        w.items.forEach(function (it) {
            var p = TR.st.P[it.style];
            if (!p) problems.push(it.style + ' is not in the catalog.');
            else {
                if (!it.colors.length) problems.push(p.n + ' has no colours.');
                if (TR.unknownColors(it, p).length) problems.push(p.n + ' lists a colour it does not come in: ' + TR.unknownColors(it, p).join(', ') + '.');
                if (!(it.sizes || TR.U.sizesFor(p, TR.st.CAT[p.s])).length) problems.push(p.n + ' has no sizes.');
                if (!(it.price > 0)) problems.push(p.n + ' has no price.');
            }
        });
        if (!w.items.length) problems.push('There are no products on this request.');
        if (!String(w.team || '').trim()) problems.push('The request needs a team name.');
        TR.codeProblems().forEach(function (l) { problems.push(l + ' needs its Logo Master Folder code (Logos tab), which goes in every colour name.'); });
        var upd = r.req && r.req.mode === 'update';
        // Race and event merch stays in site search; team gear does not.
        if (typeof w.searchable !== 'boolean') w.searchable = /race|event/i.test((r.req && r.req.group) || '');
        var undrawable = Object.keys(w.logos || {}).filter(function (k) { return !TR.isImageLogo(k); });
        var prev = r.build && r.build.at ? '<div class="msg ok">Built ' + TR.ago(r.build.at) + ': ' + (r.build.products || []).length + ' draft products' +
            (r.build.collection && r.build.collection.handle ? ', collection <a target="_blank" rel="noopener" href="' + TR.ADMIN + '/collections/' + TR.gidNum(r.build.collection.id) + '">' + TR.esc(r.build.collection.handle) + '</a>' : '') + '. Building again only adds products whose handles are still free.</div>' : '';
        pane.innerHTML = prev +
            (upd ? '<div class="msg">This adds to the existing store <b>' + TR.esc(r.req.store && r.req.store.name) + '</b>. New products take that store\'s tag and naming, styles it already carries are skipped, and no collection is created.</div>'
                : '<div class="kv"><label class="f" for="b-tag">Collection tag</label><div><input type="text" id="b-tag" value="' + TR.esc(w.tag || '') + '" style="width:100%"><div class="sub">Every product gets this tag, and the new smart collection, named for the team, is TAG equals this. The team slug, the same tag the back office automation uses.</div></div></div>') +
            '<label class="sub" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="b-search"' + (w.searchable ? ' checked' : '') + '> Keep in site search: public race or event merch. Team, club and school gear is hidden from search.</label>' +
            (problems.length ? '<div class="msg bad"><b>Fix these first:</b><br>' + problems.map(TR.esc).join('<br>') + '</div>' : '') +
            (undrawable.length ? '<div class="msg warn">Logo ' + undrawable.map(function (k) { return TR.esc(w.logos[k].label || k); }).join(', ') + ' is a PDF or AI file, so mockups made with it show the garment without the logo. Replace it with a PNG on the Logos tab for full mockups.</div>' : '') +
            '<p class="sub">Builds every product as a <b>draft</b>: Color then Size options with sizes spelled out, colours named by logo code ("Jet Black (D055 (FC))"), a front mockup per colour and a back one where there is a back logo' + (upd ? '' : ', plus an <b>unpublished</b> collection') + '. Nothing appears on the site until someone publishes it. Mockups use the 420 px catalog photos, so swap in proper ones before going live.</p>' +
            '<div style="display:flex;gap:8px;margin:12px 0"><button class="btn" type="button" id="b-plan"' + (problems.length ? ' disabled' : '') + '>Check the plan</button><button class="btn pri" type="button" id="b-go" disabled>Create drafts</button></div>' +
            '<div id="b-out"></div>';
        var bt = TR.$('b-tag'); if (bt) bt.addEventListener('input', function () { w.tag = this.value; TR.touch(); });
        TR.$('b-search').addEventListener('change', function () { w.searchable = this.checked; TR.touch(); });
        TR.$('b-plan').onclick = TR.dryRun;
        TR.$('b-go').onclick = TR.build;
        if (TR.st.plan) TR.showPlan(TR.st.plan);
    },

    gidNum: function (gid) { return String(gid || '').split('/').pop(); },

    dryRun: function () {
        var go = function () {
            var specs = TR.st.rec.work.items.map(TR.specFor).filter(Boolean);
            TR.$('b-out').innerHTML = '<p class="sub">Checking which handles are free...</p>';
            TR.api('/team-requests/build', { body: { id: TR.st.rec.id, dryRun: true, searchable: !!TR.st.rec.work.searchable, products: specs } }).then(function (j) {
                if (j.__status !== 200) { TR.$('b-out').innerHTML = '<p class="msg bad">' + TR.esc(j.error || j.reason || ('HTTP ' + j.__status)) + '</p>'; return; }
                TR.st.plan = j.plan; TR.showPlan(j.plan);
            });
        };
        if (TR.st.dirty) TR.save().then(function (ok) { if (ok) { TR.st.tab = 'build'; TR.renderDetail(); go(); } }); else go();
    },

    showPlan: function (plan) {
        var fresh = plan.products.filter(function (p) { return !p.exists; });
        var variants = fresh.reduce(function (a, p) { return a + p.variants; }, 0);
        TR.$('b-out').innerHTML =
            '<table class="plan"><thead><tr><th>Product</th><th>Sizes</th><th>Colours</th><th>Price</th><th>Variants</th><th></th></tr></thead><tbody>' +
            plan.products.map(function (p) {
                return '<tr><td><b>' + TR.esc(p.title) + '</b><br><span class="sub">' + TR.esc(p.handle) + (p.productType ? ' · ' + TR.esc(p.productType) : ' · no category') + '</span></td><td>' + TR.esc(p.sizes.join(', ')) + '</td><td>' + p.colors.map(TR.esc).join('<br>') + '</td><td>$' + TR.esc(p.price || '') + '</td><td>' + p.variants + '</td><td>' +
                    (p.exists ? '<span style="color:var(--warn)">Already exists, will be skipped</span>' : 'New draft') + '</td></tr>';
            }).join('') + '</tbody></table>' +
            (plan.update ? '<p>Into the existing store <b>' + TR.esc(plan.collection.title) + '</b> through its tag <b>' + TR.esc(plan.collection.tag) + '</b>.' + (plan.alreadyIn && plan.alreadyIn.length ? ' Already in the store, so skipped: ' + plan.alreadyIn.map(TR.esc).join(', ') + '.' : '') + '</p>'
                : '<p>Collection <b>' + TR.esc(plan.collection.title) + '</b> (' + TR.esc(plan.collection.handle) + '), rule TAG = <b>' + TR.esc(plan.collection.tag) + '</b>: ' + (plan.collection.exists ? '<span style="color:var(--warn)">already exists, left alone</span>' : 'will be created, unpublished') + '.</p>') +
            '<p class="sub">' + (plan.searchable ? 'Kept in site search.' : 'Hidden from site search.') + '</p>' +
            '<p><b>' + fresh.length + '</b> new draft products, <b>' + variants + '</b> variants.</p>';
        TR.$('b-go').disabled = !fresh.length;
        TR.$('b-go').textContent = fresh.length ? 'Create ' + fresh.length + ' draft' + (fresh.length === 1 ? '' : 's') : 'Nothing new to create';
    },

    // Mockup: the garment photo on white with the logo where staff put it,
    // drawn exactly as the builder and this page draw it (fitLogo).
    loadImg: function (src) {
        return new Promise(function (res, rej) {
            var i = new Image(); if (!/^blob:|^data:/.test(src)) i.crossOrigin = 'anonymous';
            i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('Could not load ' + src)); };
            i.src = src;
        });
    },

    // One drawing, two uses: the PNG uploaded to Shopify and the JPEG in the
    // proof PDF, so the customer approves exactly what gets built.
    mockup: function (it, colorName, back) {
        return TR.mockupCanvas(it, colorName, 1200, back).then(function (cv) {
            return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, 'image/png'); });
        });
    },

    // Draws one cleaned logo into a box on the garment, the same rule as the
    // preview and the back office renderer: fit inside, centred, top aligned,
    // then turned about the box centre.
    drawLogo: function (x, L, box, gx, gy, gw, gh, nw, nh) {
        if (!L || !box) return;
        var f = TR.U.fitLogo(box, L.w, L.h, nw, nh);
        x.save();
        if (box[4]) { var cx = gx + (box[0] + box[2] / 2) * gw, cy = gy + (box[1] + box[3] / 2) * gh; x.translate(cx, cy); x.rotate(box[4] * Math.PI / 180); x.translate(-cx, -cy); }
        x.drawImage(L.canvas, gx + f.x * gw, gy + f.y * gh, f.w * gw, f.h * gh);
        x.restore();
    },

    // One mockup: the front with its logo (and a sleeve logo), or with back
    // true, the back with a back or back neck logo.
    mockupCanvas: function (it, colorName, S, back) {
        var p = TR.st.P[it.style], c = p.c[TR.colorIdx(p, colorName)];
        var PAD = Math.round(S / 20), l2 = TR.U.loc2(it, p), L = TR.st.L || {};
        return TR.loadImg(back ? c[6] : c[2]).then(function (g) {
            var cv = document.createElement('canvas'); cv.width = S; cv.height = S;
            var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, S, S);
            x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
            var sc = Math.min((S - 2 * PAD) / g.naturalWidth, (S - 2 * PAD) / g.naturalHeight);
            var gw = g.naturalWidth * sc, gh = g.naturalHeight * sc, gx = (S - gw) / 2, gy = (S - gh) / 2;
            x.drawImage(g, gx, gy, gw, gh);
            var nw = g.naturalWidth, nh = g.naturalHeight;
            if (back) {
                if (l2 && l2.side === 'b' && !c[7]) TR.drawLogo(x, L[TR.logoOf(it, p, colorName, 'x')], l2.box, gx, gy, gw, gh, nw, nh);
            } else {
                if (!c[4]) TR.drawLogo(x, L[TR.logoOf(it, p, colorName, 'f')], TR.U.boxFor(it, p, colorName), gx, gy, gw, gh, nw, nh);
                if (l2 && l2.side === 'f') TR.drawLogo(x, L[TR.logoOf(it, p, colorName, 'x')], l2.box, gx, gy, gw, gh, nw, nh);
            }
            return cv;
        });
    },

    // Does this colour get a back mockup? Only with a back side second logo
    // and a back photo.
    hasBack: function (it, p, colorName) {
        var l2 = TR.U.loc2(it, p), c = p.c[TR.colorIdx(p, colorName)];
        return !!(l2 && l2.side === 'b' && c && c[6]);
    },

    build: function () {
        var r = TR.st.rec, plan = TR.st.plan; if (!plan || TR.st.busy) return;
        var out = TR.$('b-out'), go = TR.$('b-go');
        var skip = {}; plan.products.forEach(function (p) { if (p.exists) skip[p.style] = 1; });
        var items = r.work.items.filter(function (it) { return TR.st.P[it.style] && !skip[it.style]; });
        var jobs = [];
        items.forEach(function (it) {
            var p = TR.st.P[it.style];
            it.colors.forEach(function (n) {
                jobs.push({ it: it, color: n });
                if (TR.hasBack(it, p, n)) jobs.push({ it: it, color: n, back: true });
            });
        });
        TR.st.busy = true; go.disabled = true; TR.$('b-plan').disabled = true;
        var status = document.createElement('p'); status.className = 'msg warn'; out.prepend(status);
        var say = function (t) { status.textContent = t; };
        var blobs = [], done = 0;
        // Mockups one at a time: they are small and it keeps memory flat.
        var chain = Promise.resolve();
        jobs.forEach(function (j) {
            chain = chain.then(function () { return TR.mockup(j.it, j.color, j.back); }).then(function (b) { blobs.push(b); done++; say('Drawing mockups ' + done + ' of ' + jobs.length + '...'); });
        });
        chain.then(function () {
            say('Uploading ' + blobs.length + ' images to Shopify...');
            var files = jobs.map(function (j, k) { return { filename: j.it.style + '-' + String(j.color).replace(/[^a-z0-9]+/gi, '-') + (j.back ? '-back' : '') + '-' + k + '.png', mimeType: 'image/png', fileSize: blobs[k].size }; });
            return CatalogClient.stagedUploads(files).then(function (sj) {
                if (sj.__status !== 200 || !sj.targets || sj.targets.length !== files.length) throw new Error(sj.error || sj.reason || ('Could not get upload targets, HTTP ' + sj.__status));
                var urls = [], c2 = Promise.resolve(), up = 0;
                sj.targets.forEach(function (t, k) {
                    c2 = c2.then(function () { return CatalogClient.uploadToTarget(t, new File([blobs[k]], files[k].filename, { type: 'image/png' })); })
                        .then(function (u) { urls[k] = u; up++; say('Uploading images ' + up + ' of ' + files.length + '...'); });
                });
                return c2.then(function () { return urls; });
            });
        }).then(function (urls) {
            say('Creating drafts in Shopify...');
            var img = {}; jobs.forEach(function (j, k) { img[j.it.style + '|' + j.color + (j.back ? '|b' : '')] = urls[k]; });
            var specs = items.map(function (it) {
                var s = TR.specFor(it);
                s.colors.forEach(function (c) { c.image = img[it.style + '|' + c.name] || null; c.back = img[it.style + '|' + c.name + '|b'] || null; });
                return s;
            });
            return TR.api('/team-requests/build', { body: { id: r.id, dryRun: false, searchable: !!r.work.searchable, products: specs } });
        }).then(function (j) {
            TR.st.busy = false;
            if (j.__status !== 200) throw new Error(j.error || j.reason || ('HTTP ' + j.__status));
            TR.st.rec = j.rec; TR.st.plan = null;
            var ok = j.results.filter(function (x) { return x.ok; });
            var html = '<div class="msg ' + (ok.length === j.results.length ? 'ok' : 'warn') + '">Created ' + ok.length + ' of ' + j.results.length + ' as drafts.</div><table class="plan"><tbody>' +
                j.results.map(function (x) {
                    return '<tr><td>' + TR.esc(x.title || x.handle) + '</td><td>' + (x.ok ? '<a target="_blank" rel="noopener" href="' + TR.ADMIN + '/products/' + TR.gidNum(x.id) + '">Open in Shopify</a>' : x.skipped ? '<span style="color:var(--warn)">' + TR.esc(x.reason) + '</span>' : '<span style="color:var(--bad)">' + TR.esc((x.errors || []).join('; ')) + '</span>') + '</td></tr>';
                }).join('') + '</tbody></table>' +
                (j.collection ? '<p>Collection: ' + (j.collection.ok ? '<a target="_blank" rel="noopener" href="' + TR.ADMIN + '/collections/' + TR.gidNum(j.collection.id) + '">' + TR.esc(j.collection.title) + '</a>, unpublished' : TR.esc(j.collection.reason || (j.collection.errors || []).join('; '))) + '</p>' : '');
            TR.renderDetail();
            TR.$('b-out').innerHTML = html;
            TR.loadList();
        }).catch(function (e) {
            TR.st.busy = false;
            say('Stopped: ' + e.message + '. Nothing after this step ran.');
            status.className = 'msg bad';
            TR.$('b-plan').disabled = false;
        });
    },

    // ---------- team store sales ----------
    // Orders, units and revenue per team store, and what each team has earned
    // from fundraising. The Worker reads the orders with a Shopify bulk job;
    // this view starts it, polls it, and shows the last result meanwhile.
    showSales: function () {
        if (TR.st.dirty && !window.confirm('You have unsaved changes on this request. Leave them?')) return;
        TR.st.dirty = false; TR.st.rec = null; TR.st.view = 'sales';
        history.replaceState(null, '', location.pathname);
        TR.st.sales = TR.st.sales || { sort: 'revenue', dir: -1, q: '', zero: false, period: 'year' };
        TR.renderList();
        TR.$('detail').innerHTML = '<p class="empty">Loading sales...</p>';
        TR.salesPoll(false);
    },

    sinceFor: function (period) {
        var d = new Date(), iso = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
        if (period === 'year') return d.getFullYear() + '-01-01';
        if (period === '90') return iso(new Date(d - 90 * 86400000));
        if (period === '365') return iso(new Date(d - 365 * 86400000));
        if (period === '730') return iso(new Date(d - 730 * 86400000));
        return TR.st.sales.custom || iso(new Date(d - 365 * 86400000));
    },

    salesPoll: function (loop) {
        TR.api('/team-requests/sales/status').then(function (j) {
            if (TR.st.view !== 'sales') return;
            if (j.__status !== 200) { TR.$('detail').innerHTML = '<p class="msg bad">' + TR.esc(j.error || j.reason || ('HTTP ' + j.__status)) + '</p>'; return; }
            var S = TR.st.sales;
            S.result = j.result; S.fund = j.fund || {}; S.state = j.state; S.objects = j.objects; S.error = j.error;
            TR.renderSales();
            clearTimeout(S.timer);
            if (j.state === 'running' || j.state === 'processing') S.timer = setTimeout(function () { TR.salesPoll(true); }, 4000);
        });
    },

    salesRun: function () {
        var S = TR.st.sales, since = TR.sinceFor(S.period);
        TR.api('/team-requests/sales/run', { body: { since: since } }).then(function (j) {
            if (j.__status !== 200) { S.error = j.error || j.reason || ('HTTP ' + j.__status); S.state = 'failed'; TR.renderSales(); return; }
            S.state = 'running'; S.objects = 0; S.error = ''; TR.renderSales();
            S.timer = setTimeout(function () { TR.salesPoll(true); }, 4000);
        });
    },

    // The fundraising markup a store carries: what staff saved for it, or the
    // percentage the customer picked on the builder for a store this tool
    // built, or none.
    fundFor: function (h) {
        var f = (TR.st.sales.fund || {})[h];
        if (f) return { pct: f.pct, paid: f.paid || 0, saved: true };
        var r = TR.st.list.filter(function (x) { return x.ch === h && x.f; })[0];
        return { pct: r ? r.f : 0, paid: 0, saved: false };
    },

    earned: function (revenue, pct) { return pct ? revenue * pct / (100 + pct) : 0; },
    money: function (n) { return '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },

    renderSales: function () {
        var S = TR.st.sales, R = S.result, el = TR.$('detail');
        var running = S.state === 'running' || S.state === 'processing';
        var since = TR.sinceFor(S.period);
        var head = '<div class="calhead"><h2 style="min-width:0">Team store sales</h2><span class="sp"></span>' +
            '<label class="sub" for="sl-p">Period</label><select id="sl-p">' + [['year', 'This year'], ['90', 'Last 90 days'], ['365', 'Last 365 days'], ['730', 'Last 2 years'], ['custom', 'Since a date']].map(function (o) {
                return '<option value="' + o[0] + '"' + (S.period === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('') + '</select>' +
            (S.period === 'custom' ? '<input type="date" id="sl-c" value="' + TR.esc(S.custom || since) + '">' : '') +
            '<button class="btn pri" type="button" id="sl-run"' + (running ? ' disabled' : '') + '>' + (running ? 'Reading orders...' : 'Update from Shopify') + '</button></div>';
        var status = running ? '<div class="msg warn">Reading orders from Shopify' + (S.objects ? ', ' + Number(S.objects).toLocaleString() + ' records so far' : '') + '. A year takes a minute or two; this page updates by itself.</div>' :
            S.state === 'failed' ? '<div class="msg bad">' + TR.esc(S.error || 'The sales job did not finish.') + '</div>' : '';
        if (!R) { el.innerHTML = head + status + (running ? '' : '<p class="empty">No figures yet. Pick a period and press Update from Shopify.</p>'); TR.wireSales(); return; }

        var rows = R.stores.map(function (s) {
            var f = TR.fundFor(s.h), earned = TR.earned(s.revenue, f.pct);
            return { s: s, f: f, earned: earned, owed: earned - f.paid };
        });
        var q = (S.q || '').toLowerCase();
        var shown = rows.filter(function (r) { return (!q || r.s.n.toLowerCase().indexOf(q) >= 0) && (S.zero || r.s.units > 0 || q); });
        var key = S.sort, dir = S.dir;
        var val = function (r) { return key === 'name' ? r.s.n.toLowerCase() : key === 'earned' ? r.earned : key === 'owed' ? r.owed : key === 'last' ? r.s.last : r.s[key]; };
        shown.sort(function (a, b) { var x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
        var sold = rows.filter(function (r) { return r.s.units > 0; });
        var tot = sold.reduce(function (t, r) { t.o += r.s.orders; t.u += r.s.units; t.r += r.s.revenue; t.e += r.earned; t.w += Math.max(0, r.owed); return t; }, { o: 0, u: 0, r: 0, e: 0, w: 0 });
        // Orders, units and revenue come from the Worker's de-duplicated total
        // when it has one: a product in two stores is one sale, not two.
        if (R.total) { tot.o = R.total.orders; tot.u = R.total.units; tot.r = R.total.revenue; }
        var th = function (k, label, num) { return '<th class="' + (num ? 'num' : '') + '"><button type="button" data-sort="' + k + '">' + label + (S.sort === k ? (S.dir < 0 ? ' ↓' : ' ↑') : '') + '</button></th>'; };
        var stale = R.since !== since && !running ? '<div class="msg warn">These figures are from ' + TR.esc(TR.fmtDate(R.since)) + ' on. Press Update from Shopify for the period you picked.</div>' : '';

        el.innerHTML = head + status + stale +
            '<div class="sumrow"><div><span>Stores with sales</span><b>' + sold.length + '</b></div><div><span>Orders</span><b>' + tot.o.toLocaleString() + '</b></div><div><span>Units</span><b>' + tot.u.toLocaleString() + '</b></div><div><span>Revenue</span><b>' + TR.money(tot.r) + '</b></div><div><span>Teams earned</span><b>' + TR.money(tot.e) + '</b></div><div><span>Still owed</span><b>' + TR.money(tot.w) + '</b></div></div>' +
            '<p class="sub">Figures for ' + TR.esc(TR.fmtDate(R.since)) + ' to ' + TR.esc(new Date(R.at).toLocaleString()) + '. Revenue is what customers paid after discounts, less refunds; cancelled and test orders are left out. To work out what a team is owed, pick a period that covers the whole store, since <b>Paid</b> is everything paid to date.</p>' +
            '<div class="toolbar"><input type="search" id="sl-q" placeholder="Find a store" value="' + TR.esc(S.q || '') + '" aria-label="Find a store">' +
            '<label class="sub"><input type="checkbox" id="sl-z"' + (S.zero ? ' checked' : '') + '> Show the ' + (rows.length - sold.length) + ' stores with no sales</label><span class="sp"></span>' +
            '<button class="btn" type="button" id="sl-csv">Download CSV</button></div>' +
            '<div class="tablewrap"><table class="plan sales"><thead><tr>' + th('name', 'Store') + th('orders', 'Orders', 1) + th('units', 'Units', 1) + th('revenue', 'Revenue', 1) + th('last', 'Last sale') +
            '<th class="num">Fundraising</th>' + th('earned', 'Team earned', 1) + '<th class="num">Paid to date</th>' + th('owed', 'Still owed', 1) + '</tr></thead><tbody>' +
            shown.map(function (r) {
                var s = r.s;
                return '<tr data-h="' + TR.esc(s.h) + '"><td><button type="button" class="linkish" data-x="' + TR.esc(s.h) + '">' + TR.esc(s.n) + '</button></td>' +
                    '<td class="num">' + s.orders + '</td><td class="num">' + s.units + '</td><td class="num">' + TR.money(s.revenue) + '</td><td>' + (s.last ? TR.esc(TR.fmtDate(s.last)) : '') + '</td>' +
                    '<td class="num"><input type="number" min="0" max="100" step="1" class="pct" value="' + (r.f.pct || '') + '" placeholder="0" aria-label="Fundraising percent for ' + TR.esc(s.n) + '">%' + (r.f.pct && !r.f.saved ? ' <span class="sub" title="From the customer\'s request">req</span>' : '') + '</td>' +
                    '<td class="num">' + (r.f.pct ? TR.money(r.earned) : '') + '</td>' +
                    '<td class="num">' + (r.f.pct ? '<input type="number" min="0" step="0.01" class="paid" value="' + (r.f.paid || '') + '" placeholder="0" aria-label="Paid to ' + TR.esc(s.n) + '">' : '') + '</td>' +
                    '<td class="num ' + (r.owed > 0.005 ? 'owe' : '') + '">' + (r.f.pct ? TR.money(r.owed) : '') + '</td></tr>' +
                    '<tr class="detail-row hidden" data-d="' + TR.esc(s.h) + '"><td colspan="9">' + (s.top.length ? '<b>Best sellers</b><ul>' + s.top.map(function (t) { return '<li>' + TR.esc(t.t) + ': ' + t.u + ' units, ' + TR.money(t.r) + '</li>'; }).join('') + '</ul>' : 'No sales in this period.') + '</td></tr>';
            }).join('') + '</tbody></table></div>' +
            (shown.length ? '' : '<p class="empty">No store matches.</p>');
        TR.wireSales();
    },

    wireSales: function () {
        var S = TR.st.sales, el = TR.$('detail');
        TR.$('sl-p').onchange = function () { S.period = this.value; TR.renderSales(); };
        var c = TR.$('sl-c'); if (c) c.onchange = function () { S.custom = this.value; TR.renderSales(); };
        TR.$('sl-run').onclick = TR.salesRun;
        var qq = TR.$('sl-q'); if (!qq) return;
        qq.oninput = function () { S.q = this.value; var pos = this.selectionStart; TR.renderSales(); var n = TR.$('sl-q'); n.focus(); n.setSelectionRange(pos, pos); };
        TR.$('sl-z').onchange = function () { S.zero = this.checked; TR.renderSales(); };
        TR.$('sl-csv').onclick = TR.salesCsv;
        el.querySelectorAll('[data-sort]').forEach(function (b) {
            b.onclick = function () { var k = b.dataset.sort; S.dir = S.sort === k ? -S.dir : (k === 'name' ? 1 : -1); S.sort = k; TR.renderSales(); };
        });
        el.querySelectorAll('[data-x]').forEach(function (b) {
            b.onclick = function () { var d = el.querySelector('[data-d="' + CSS.escape(b.dataset.x) + '"]'); if (d) d.classList.toggle('hidden'); };
        });
        el.querySelectorAll('tr[data-h]').forEach(function (tr) {
            var h = tr.dataset.h, pct = tr.querySelector('.pct'), paid = tr.querySelector('.paid');
            var save = function () {
                var f = TR.fundFor(h);
                var body = { h: h, pct: pct ? Number(pct.value) || 0 : f.pct, paid: paid ? Number(paid.value) || 0 : f.paid };
                TR.api('/team-requests/sales/fund', { body: body }).then(function (j) {
                    if (j.__status !== 200) { el.insertAdjacentHTML('afterbegin', '<div class="msg bad">' + TR.esc(j.error || j.reason || 'Could not save') + '</div>'); return; }
                    S.fund = j.fund; TR.renderSales();
                });
            };
            if (pct) pct.onchange = save;
            if (paid) paid.onchange = save;
        });
    },

    // The table as a spreadsheet, every store including those with no sales.
    salesCsv: function () {
        var R = TR.st.sales.result; if (!R) return;
        // Quoted without a regex literal: the repo's wiring test lexer reads a
        // quote inside a regex as the start of a string (see CLAUDE.md).
        var DQ = String.fromCharCode(34);
        var q = function (v) { v = String(v == null ? '' : v); return (v.indexOf(DQ) >= 0 || v.indexOf(',') >= 0 || v.indexOf('\n') >= 0) ? DQ + v.split(DQ).join(DQ + DQ) + DQ : v; };
        var lines = [['Store', 'Collection', 'Orders', 'Units', 'Revenue', 'Last sale', 'Fundraising %', 'Team earned', 'Paid to date', 'Still owed'].join(',')];
        R.stores.forEach(function (s) {
            var f = TR.fundFor(s.h), e = TR.earned(s.revenue, f.pct);
            lines.push([s.n, s.h, s.orders, s.units, s.revenue.toFixed(2), s.last, f.pct || 0, e.toFixed(2), (f.paid || 0).toFixed(2), (e - (f.paid || 0)).toFixed(2)].map(q).join(','));
        });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
        a.download = 'team-store-sales-from-' + R.since + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
    },

    // ---------- release calendar ----------
    // A request lands on its release date if staff set one, otherwise on the
    // date the customer asked for, drawn dashed so the two are never confused.
    // Archived requests are left off: the calendar is what is coming up.
    showCalendar: function () {
        if (TR.st.dirty && !window.confirm('You have unsaved changes on this request. Leave them?')) return;
        TR.st.dirty = false; TR.st.rec = null; TR.st.view = 'cal';
        history.replaceState(null, '', location.pathname);
        if (!TR.st.month) { var n = new Date(); TR.st.month = new Date(n.getFullYear(), n.getMonth(), 1); }
        TR.renderList(); TR.renderCalendar();
    },

    dayOf: function (r) {
        var iso = r.r || (/^\d{4}-\d{2}-\d{2}$/.test(r.d || '') ? r.d : '');
        return iso ? { iso: iso, asked: !r.r } : null;
    },

    renderCalendar: function () {
        var m = TR.st.month, y = m.getFullYear(), mo = m.getMonth();
        var first = new Date(y, mo, 1), start = new Date(y, mo, 1 - first.getDay());
        var live = TR.st.list.filter(function (r) { return r.s !== 'archived'; });
        var byDay = {}, undated = [];
        live.forEach(function (r) {
            var d = TR.dayOf(r);
            if (d) (byDay[d.iso] = byDay[d.iso] || []).push({ r: r, asked: d.asked }); else undated.push(r);
            // The close date is its own entry: a store is on the calendar
            // the day it opens and again the day orders stop.
            if (r.cl) (byDay[r.cl] = byDay[r.cl] || []).push({ r: r, close: true });
        });
        var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        var today = iso(new Date());
        var cells = '';
        for (var k = 0; k < 42; k++) {
            var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + k), key = iso(d);
            if (k === 35 && d.getMonth() !== mo) break;
            cells += '<div class="day' + (d.getMonth() !== mo ? ' out' : '') + (key === today ? ' today' : '') + '"><span class="dn">' + d.getDate() + '</span>' +
                (byDay[key] || []).map(function (x) {
                    if (x.close) return '<button type="button" class="ev close" data-id="' + x.r.id + '" title="Orders close for ' + TR.esc(x.r.t) + '">Orders close · ' + TR.esc(x.r.t || '(no name)') + '</button>';
                    return '<button type="button" class="ev ' + x.r.s + (x.asked ? ' asked' : '') + '" data-id="' + x.r.id + '" title="' + TR.esc(x.r.t) + ', ' + TR.STATUS[x.r.s] + (x.asked ? ', the customer\'s requested date, no release date set yet' : '') + '">' + TR.esc(x.r.t || '(no name)') + '</button>';
                }).join('') + '</div>';
        }
        TR.$('detail').innerHTML =
            '<div class="calhead"><button class="btn" type="button" id="cal-prev" aria-label="Previous month">‹</button>' +
            '<h2>' + m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + '</h2>' +
            '<button class="btn" type="button" id="cal-next" aria-label="Next month">›</button><button class="btn" type="button" id="cal-today">Today</button>' +
            '<span class="sp"></span><span class="sub"><span class="key solid"></span> release date &nbsp; <span class="key dash"></span> customer\'s requested date &nbsp; <span class="key closek"></span> orders close</span></div>' +
            '<div class="cal"><div class="dow">Sun</div><div class="dow">Mon</div><div class="dow">Tue</div><div class="dow">Wed</div><div class="dow">Thu</div><div class="dow">Fri</div><div class="dow">Sat</div>' + cells + '</div>' +
            (undated.length ? '<h3 style="margin:20px 0 8px;font-size:15px">No date yet (' + undated.length + ')</h3><div class="chips">' + undated.map(function (r) {
                return '<button type="button" class="ev ' + r.s + '" data-id="' + r.id + '">' + TR.esc(r.t || '(no name)') + '</button>';
            }).join('') + '</div>' : '');
        TR.$('cal-prev').onclick = function () { TR.st.month = new Date(y, mo - 1, 1); TR.renderCalendar(); };
        TR.$('cal-next').onclick = function () { TR.st.month = new Date(y, mo + 1, 1); TR.renderCalendar(); };
        TR.$('cal-today').onclick = function () { var n = new Date(); TR.st.month = new Date(n.getFullYear(), n.getMonth(), 1); TR.renderCalendar(); };
        TR.$('detail').querySelectorAll('.ev').forEach(function (b) { b.onclick = function () { TR.open(b.dataset.id); }; });
    },

    // ---------- proof PDF ----------
    // What the customer approves: every product in every colour, drawn with
    // the same mockup code the build uses, so the proof and the store match.
    // jsPDF is loaded only when someone asks for a PDF.
    JSPDF: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',

    loadJsPdf: function () {
        if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
        return new Promise(function (res, rej) {
            var sc = document.createElement('script'); sc.src = TR.JSPDF; sc.async = true;
            sc.onload = function () { res(window.jspdf.jsPDF); }; sc.onerror = function () { rej(new Error('Could not load the PDF library')); };
            document.head.appendChild(sc);
        });
    },

    // Drawn onto white, so a transparent logo cannot come out black in a JPEG.
    imgData: function (src, max) {
        return TR.loadImg(src).then(function (im) {
            var sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
            var cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * sc); cv.height = Math.round(im.naturalHeight * sc);
            var x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.drawImage(im, 0, 0, cv.width, cv.height);
            return { url: cv.toDataURL('image/jpeg', 0.9), w: cv.width, h: cv.height };
        });
    },

    proofPdf: function (btn, after) {
        var r = TR.st.rec, w = r.work, q = r.req || {};
        if (TR.st.dirty) { TR.flash('Save your changes first, so the proof shows them.', 'warn'); return; }
        var items = w.items.filter(function (it) { return TR.st.P[it.style] && it.colors.some(function (n) { return TR.hasColor(TR.st.P[it.style], n); }); });
        if (!items.length) { TR.flash('There is nothing to put in a proof yet: add products with colours first.', 'warn'); return; }
        var label = btn.textContent; btn.disabled = true; btn.textContent = 'Making PDF...';
        var done = function () { btn.disabled = false; btn.textContent = label; };
        var jobs = [];
        items.forEach(function (it) {
            var p = TR.st.P[it.style];
            it.colors.forEach(function (n) {
                if (!TR.hasColor(p, n)) return;
                jobs.push({ it: it, color: n });
                if (TR.hasBack(it, p, n)) jobs.push({ it: it, color: n, back: true });
            });
        });
        var shots = {}, chain = Promise.resolve();
        jobs.forEach(function (j) {
            chain = chain.then(function () { return TR.mockupCanvas(j.it, j.color, 900, j.back); })
                .then(function (cv) { shots[j.it.style + '|' + j.color + (j.back ? '|b' : '')] = cv.toDataURL('image/jpeg', 0.86); });
        });
        var logo = null;
        var slot = (items[0].logo || 'main');
        chain = chain.then(function () {
            return TR.isImageLogo(slot) ? TR.logoSlotSrc(slot).then(function (src) { return src ? TR.imgData(src, 600) : null; }).catch(function () { return null; }) : null;
        }).then(function (l) { logo = l; });
        Promise.all([TR.loadJsPdf(), chain]).then(function (got) {
            var jsPDF = got[0];
            var doc = new jsPDF({ unit: 'pt', format: 'letter' });
            var W = 612, H = 792, M = 48, team = String(w.team || 'Team');
            var ink = [13, 20, 32], dim = [90, 102, 121], navy = [19, 40, 79];
            var text = function (t, x, y, o) { doc.text(String(t), x, y, o || {}); };
            var release = w.release || q.date || '';

            // cover
            doc.setFillColor(navy[0], navy[1], navy[2]); doc.rect(0, 0, W, 140, 'F');
            doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); text('THE RUN HOUSE  /  TEAM STORE PROOF', M, 46);
            var title = team + ' Team Store', tmax = W - 2 * M - (logo ? 130 : 0), fs = 28;
            doc.setFontSize(fs);
            while (fs > 16 && doc.getTextWidth(title) > tmax) { fs -= 1; doc.setFontSize(fs); }
            var tl = doc.splitTextToSize(title, tmax).slice(0, 2);
            tl.forEach(function (l, k) { text(l, M, (tl.length > 1 ? 84 : 96) + k * (fs + 4)); });
            if (logo) {
                var lw = 110, lh = 110 * logo.h / logo.w; if (lh > 110) { lh = 110; lw = 110 * logo.w / logo.h; }
                doc.setFillColor(255, 255, 255); doc.rect(W - M - 120, 15, 120, 120, 'F');
                doc.addImage(logo.url, 'JPEG', W - M - 60 - lw / 2, 75 - lh / 2, lw, lh);
            }
            doc.setTextColor(ink[0], ink[1], ink[2]); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
            var y = 176;
            var row = function (k, v) { doc.setTextColor(dim[0], dim[1], dim[2]); text(k, M, y); doc.setTextColor(ink[0], ink[1], ink[2]); text(v, M + 110, y); y += 18; };
            row('Prepared for', ((q.contact && q.contact.name) || '') + ((q.contact && q.contact.email) ? '  (' + q.contact.email + ')' : ''));
            row('Store opens', release ? TR.fmtDate(release) : 'To be confirmed');
            row('Products', items.length + (items.length === 1 ? ' product' : ' products') + ', ' + jobs.length + (jobs.length === 1 ? ' colour' : ' colours'));
            row('Date of proof', new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }));
            y += 10;
            doc.splitTextToSize('Here is your store as we will build it. Please check every product, colour, size range and logo position, then reply to approve it or tell us what to change. Nothing goes live until you approve.', W - 2 * M).forEach(function (l) { text(l, M, y); y += 15; });
            y += 14;
            // summary table
            doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(dim[0], dim[1], dim[2]);
            text('PRODUCT', M, y); text('COLOURS', M + 250, y); text('PRICE', W - M, y, { align: 'right' }); y += 8;
            doc.setDrawColor(219, 227, 239); doc.line(M, y, W - M, y); y += 16;
            doc.setFont('helvetica', 'normal'); doc.setTextColor(ink[0], ink[1], ink[2]);
            items.forEach(function (it) {
                var p = TR.st.P[it.style];
                var nameL = doc.splitTextToSize(p.n + ' (' + p.s + ')', 235), colL = doc.splitTextToSize(it.colors.join(', '), 190);
                var hh = Math.max(nameL.length, colL.length) * 13;
                if (y + hh > H - 70) { doc.addPage(); y = M + 10; }
                nameL.forEach(function (l, k) { text(l, M, y + k * 13); });
                colL.forEach(function (l, k) { text(l, M + 250, y + k * 13); });
                text(it.price ? '$' + Number(it.price).toFixed(2) : '', W - M, y, { align: 'right' });
                y += hh + 8;
            });

            // Products flow down the page, three mockups across. A product
            // starts a new page only when its heading and first row of
            // mockups would not fit, so a short store is a short PDF.
            doc.addPage(); y = M + 6;
            var GAP = 14, size = (W - 2 * M - 2 * GAP) / 3, ROW = size + 26, BOTTOM = H - 56;
            items.forEach(function (it) {
                var p = TR.st.P[it.style], cols = it.colors.filter(function (n) { return TR.hasColor(p, n); });
                var head = function (cont) {
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(ink[0], ink[1], ink[2]);
                    text(doc.splitTextToSize(p.n + (cont ? ' (continued)' : ''), W - 2 * M)[0], M, y); y += 17;
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(dim[0], dim[1], dim[2]);
                    var bits = [p.s];
                    if (it.price) bits.push('$' + Number(it.price).toFixed(2));
                    if ((it.sizes || []).length) bits.push('Sizes ' + it.sizes.join(', '));
                    bits.push('Logo: ' + (it.placement || 'as shown') + (it.second_logo ? ', plus ' + it.second_logo.toLowerCase() : ''));
                    doc.splitTextToSize(bits.join('   /   '), W - 2 * M).forEach(function (l) { text(l, M, y); y += 13; });
                    y += 6;
                };
                if (y + 40 + ROW > BOTTOM) { doc.addPage(); y = M + 6; }
                head(false);
                // A colour's back view follows its front, labelled as such.
                var tiles = [];
                cols.forEach(function (n) {
                    tiles.push({ key: it.style + '|' + n, label: n });
                    if (shots[it.style + '|' + n + '|b']) tiles.push({ key: it.style + '|' + n + '|b', label: n + ', back' });
                });
                tiles.forEach(function (t, k) {
                    if (k % 3 === 0 && k > 0) y += ROW;
                    if (k % 3 === 0 && y + ROW > BOTTOM) { doc.addPage(); y = M + 6; head(true); }
                    var x = M + (k % 3) * (size + GAP);
                    doc.setDrawColor(219, 227, 239); doc.rect(x, y, size, size);
                    doc.addImage(shots[t.key], 'JPEG', x + 1, y + 1, size - 2, size - 2);
                    doc.setFontSize(9.5); doc.setTextColor(ink[0], ink[1], ink[2]); text(doc.splitTextToSize(t.label, size)[0], x, y + size + 13);
                });
                y += ROW + 16;
            });

            // footer on every page
            var pages = doc.getNumberOfPages();
            for (var pg = 1; pg <= pages; pg++) {
                doc.setPage(pg); doc.setFontSize(8.5); doc.setTextColor(dim[0], dim[1], dim[2]);
                text('Mockups show logo size and position on catalog photos. Garment colours can look different on screen.', M, H - 28);
                text('The Run House  /  teamstores@therunhouse.com  /  Page ' + pg + ' of ' + pages, W - M, H - 16, { align: 'right' });
            }
            doc.save(team.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() + '-store-proof.pdf');
            done();
            if (after) after();
        }).catch(function (e) { done(); TR.flash('Could not make the PDF: ' + e.message, 'bad'); });
    },

};

document.addEventListener('DOMContentLoaded', TR.init);
