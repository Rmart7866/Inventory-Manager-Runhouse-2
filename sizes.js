// Shoe sizes page. The numbers are built by the nightly catalog rebuild
// (worker/src/size-coverage.js); this page only draws them.
var SZ = {
    st: { data: null, loc: null, sel: null },
    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    // The middle of each run, where a shop should be deepest. A size is
    // "thin" against the shop's own typical count here, not a fixed number,
    // so the rule means the same thing at a big shop and a small one.
    CORE: { women: [6, 11], men: [8, 13] },
    THIN: 0.8,

    init: function () {
        SZ.$('gate-form').addEventListener('submit', function (e) { e.preventDefault(); CatalogClient.setWriteSecret(SZ.$('gate-in').value); SZ.start(); });
        window.addEventListener('scroll', function () { SZ.$('tip').classList.add('hidden'); }, { passive: true });
        SZ.start();
    },

    start: function () {
        if (!CatalogClient.hasWriteSecret()) return SZ.gate('');
        fetch(CatalogClient._writeBase() + '/sizes', { headers: { Authorization: 'Bearer ' + CatalogClient.CATALOG_TOKEN, 'X-Write-Secret': CatalogClient.writeSecret() } })
            .then(function (r) { return r.json().then(function (j) { j.__status = r.status; return j; }); })
            .then(function (j) {
                if (j.__status === 401 || j.__status === 403) return SZ.gate('That write secret was not accepted.');
                SZ.$('gate').classList.add('hidden'); SZ.$('app').classList.remove('hidden');
                if (j.__status !== 200) { SZ.$('out').innerHTML = '<div class="msg">' + SZ.esc(j.error || ('HTTP ' + j.__status)) + '</div>'; return; }
                SZ.st.data = j;
                var locs = j.locations.filter(function (l) { return l.men.carried + l.women.carried > 0; });
                SZ.st.locs = locs;
                SZ.st.loc = locs[0] && locs[0].id;
                SZ.$('asof').textContent = 'Shoes on the shelf at each shop, from the catalog built ' + SZ.ago(j.at) + '. Men\'s and women\'s shoes; unisex and kids\' shoes are left out.';
                SZ.draw();
            }).catch(function (e) { SZ.gate('Could not reach the Worker: ' + e.message); });
    },

    gate: function (err) { SZ.$('app').classList.add('hidden'); SZ.$('gate').classList.remove('hidden'); SZ.$('gate-err').textContent = err; SZ.$('gate-in').focus(); },

    ago: function (iso) {
        var s = (Date.now() - new Date(iso)) / 1000;
        if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
        if (s < 86400) return Math.round(s / 3600) + ' h ago';
        return Math.round(s / 86400) + ' days ago';
    },

    // The sizes to draw: every whole and half size between the smallest and
    // largest the shop has at all, so a gap shows as a gap, not a missing column.
    sizesFor: function (g) {
        var ks = Object.keys(g.sizes).map(Number).filter(function (n) { return isFinite(n); });
        if (!ks.length) return [];
        var lo = Math.min.apply(null, ks), hi = Math.max.apply(null, ks), out = [];
        for (var x = lo; x <= hi + 1e-9; x += 0.5) out.push(String(x));
        return out;
    },

    // Thin: well below the median of the core sizes' style counts.
    analyse: function (g, gender) {
        var sizes = SZ.sizesFor(g), core = SZ.CORE[gender];
        var coreVals = sizes.filter(function (s) { return +s >= core[0] && +s <= core[1]; }).map(function (s) { return (g.sizes[s] || {}).styles || 0; }).sort(function (a, b) { return a - b; });
        var med = coreVals.length ? coreVals[Math.floor(coreVals.length / 2)] : 0;
        var thin = {};
        sizes.forEach(function (s) { if (+s >= core[0] && +s <= core[1] && ((g.sizes[s] || {}).styles || 0) < med * SZ.THIN) thin[s] = true; });
        return { sizes: sizes, med: med, thin: thin };
    },

    draw: function () {
        var L = SZ.st.locs, loc = L.filter(function (l) { return l.id === SZ.st.loc; })[0];
        SZ.$('locs').innerHTML = L.map(function (l) {
            return '<button type="button" class="chip' + (l.id === SZ.st.loc ? ' on' : '') + '" data-loc="' + SZ.esc(l.id) + '">' + SZ.esc(l.name) + '</button>';
        }).join('');
        SZ.$('locs').querySelectorAll('[data-loc]').forEach(function (b) { b.onclick = function () { SZ.st.loc = b.dataset.loc; SZ.st.sel = null; SZ.draw(); }; });
        if (!loc) { SZ.$('out').innerHTML = '<div class="msg">No shoes on any shop shelf in the data.</div>'; return; }
        SZ.$('out').innerHTML = ['women', 'men'].map(function (gender) { return SZ.card(loc, gender); }).join('');
        SZ.wire(loc);
    },

    card: function (loc, gender) {
        var g = loc[gender], label = gender === 'women' ? "Women's" : "Men's";
        if (!g.carried) return '<div class="card"><h2>' + label + ' shoes at ' + SZ.esc(loc.name) + '</h2><p class="sub">None on the shelf.</p></div>';
        var a = SZ.analyse(g, gender), max = 1;
        a.sizes.forEach(function (s) { max = Math.max(max, (g.sizes[s] || {}).styles || 0); });
        var thinList = Object.keys(a.thin).sort(function (x, y) { return ((g.sizes[x] || {}).styles || 0) - ((g.sizes[y] || {}).styles || 0); });
        var callout = thinList.length
            ? '<b>Thin:</b> ' + thinList.map(function (s) { return 'size ' + s + ' (' + ((g.sizes[s] || {}).styles || 0) + ' styles)'; }).join(', ') +
              '. The middle sizes usually have about ' + a.med + '; thin means under ' + Math.round(SZ.THIN * 100) + '% of that.'
            : 'No thin sizes: every size from ' + SZ.CORE[gender][0] + ' to ' + SZ.CORE[gender][1] + ' has at least ' + Math.round(SZ.THIN * 100) + '% of the usual ' + a.med + ' styles.';
        var cols = 'grid-template-columns: repeat(' + a.sizes.length + ', minmax(0, 1fr))';
        var bars = a.sizes.map(function (s) {
            var v = g.sizes[s] || { styles: 0, units: 0 }, h = Math.round(v.styles / max * 100);
            return '<div class="bar' + (a.thin[s] ? ' thin' : '') + (SZ.st.sel === gender + '|' + s ? ' sel' : '') + '" tabindex="0" role="button" data-g="' + gender + '" data-s="' + s + '" aria-label="' + label + ' size ' + s + ': ' + v.styles + ' of ' + g.carried + ' styles, ' + v.units + ' units' + (a.thin[s] ? ', thin' : '') + '">' +
                (a.thin[s] ? '<span class="flag" style="bottom:calc(' + h + '% + 3px)">▲ thin</span>' : '') +
                '<i style="height:' + h + '%"></i></div>';
        }).join('');
        var axis = a.sizes.map(function (s) { return '<span>' + s + '</span>'; }).join('');
        var row = function (name, fn, cls) { return '<tr><td>' + name + '</td>' + a.sizes.map(function (s) { return '<td' + (cls && a.thin[s] ? ' class="thin"' : '') + '>' + fn(g.sizes[s] || { styles: 0, units: 0 }) + '</td>'; }).join('') + '</tr>'; };
        var table = '<table class="nums" aria-label="' + label + ' sizes at ' + SZ.esc(loc.name) + '"><thead><tr><th>Size</th>' + a.sizes.map(function (s) { return '<th>' + s + '</th>'; }).join('') + '</tr></thead><tbody>' +
            row('Styles with it', function (v) { return v.styles; }, true) +
            row('Units', function (v) { return v.units; }) +
            row('Share of styles', function (v) { return Math.round(v.styles / g.carried * 100) + '%'; }) + '</tbody></table>';
        return '<div class="card"><h2>' + label + ' shoes at ' + SZ.esc(loc.name) + '</h2>' +
            '<div class="sub">' + g.carried + ' styles on the shelf. Each bar is how many of them have that size. Click a size to see which styles are missing it.</div>' +
            '<div class="callout">' + callout + '</div>' +
            '<div class="chart" style="' + cols + '">' + bars + '</div><div class="xaxis" style="' + cols + '">' + axis + '</div>' + table +
            '<div class="detail-slot" data-g="' + gender + '">' + (SZ.st.sel && SZ.st.sel.split('|')[0] === gender ? SZ.detail(loc, gender, SZ.st.sel.split('|')[1]) : '') + '</div></div>';
    },

    // The styles missing this size, the ones most likely sold through first:
    // those that still have a size either side of it.
    detail: function (loc, gender, s) {
        var g = loc[gender], label = gender === 'women' ? "Women's" : "Men's", n = +s;
        var an = /^(8|11|18)(\.|$)/.test(s) ? 'an ' : 'a '; // an 8, an 11, a 9
        var near = function (st) { return st.s[String(n - 0.5)] || st.s[String(n + 0.5)] || st.s[String(n - 1)] || st.s[String(n + 1)]; };
        var missing = g.styles.filter(function (st) { return !st.s[s]; });
        var broken = missing.filter(near), other = missing.filter(function (st) { return !near(st); });
        var have = g.styles.length - missing.length;
        var row = function (st) {
            var sizes = Object.keys(st.s).sort(function (x, y) { return x - y; });
            return '<div class="style">' + (st.img ? '<img src="' + SZ.esc(st.img) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
                '<div>' + SZ.esc(st.t) + '<div class="have">Has ' + sizes.map(function (z) { return '<b>' + z + '</b>' + (st.s[z] > 1 ? '×' + st.s[z] : ''); }).join(' ') + '</div></div></div>';
        };
        return '<div class="detail"><h3>' + label + ' size ' + s + ' at ' + SZ.esc(loc.name) + '</h3>' +
            '<p class="sub" style="margin:0 0 8px">' + have + ' of ' + g.carried + ' styles have it. ' + missing.length + ' do not.</p>' +
            (broken.length ? '<h3 style="font-size:14px;margin-top:10px">Missing ' + an + s + ' but have the sizes next to it (' + broken.length + ')</h3><p class="sub" style="margin:0 0 6px">Most likely sold through. The first ones to reorder.</p>' + broken.map(row).join('') : '') +
            (other.length ? '<details style="margin-top:10px"><summary class="sub" style="cursor:pointer">The other ' + other.length + ' styles without ' + an + s + '</summary>' + other.map(row).join('') + '</details>' : '') + '</div>';
    },

    wire: function (loc) {
        var tip = SZ.$('tip');
        SZ.$('out').querySelectorAll('.bar').forEach(function (b) {
            var show = function (e) {
                var g = loc[b.dataset.g], v = g.sizes[b.dataset.s] || { styles: 0, units: 0 };
                tip.innerHTML = '<b>' + (b.dataset.g === 'women' ? "Women's" : "Men's") + ' ' + b.dataset.s + '</b>' + v.styles + ' of ' + g.carried + ' styles (' + Math.round(v.styles / g.carried * 100) + '%)<br>' + v.units + ' units on the shelf' + (b.classList.contains('thin') ? '<br>▲ thin for this shop' : '');
                tip.classList.remove('hidden');
                var r = b.getBoundingClientRect();
                tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
                tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
            };
            var hide = function () { tip.classList.add('hidden'); };
            var pick = function () {
                var key = b.dataset.g + '|' + b.dataset.s;
                SZ.st.sel = SZ.st.sel === key ? null : key;
                hide(); SZ.draw();
                var slot = SZ.$('out').querySelector('.detail-slot[data-g="' + b.dataset.g + '"]');
                if (slot && SZ.st.sel) slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            };
            b.addEventListener('mouseenter', show); b.addEventListener('mouseleave', hide);
            b.addEventListener('focus', show); b.addEventListener('blur', hide);
            b.addEventListener('click', pick);
            b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        });
    },
};
SZ.init();
