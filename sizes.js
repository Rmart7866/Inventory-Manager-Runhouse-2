// Shoe sizes page. The numbers are built by the nightly catalog rebuild
// (worker/src/size-coverage.js): per shop and gender, every style on the
// shelf with its brand (v), model across colourways (m), width (w) and the
// sizes it has in stock (s). Every view here is worked out from that list,
// so filtering by brand or width needs no other request.
var SZ = {
    st: { data: null, loc: null, view: 'sizes', brand: '', width: '', sel: null, open: {} },
    $: function (id) { return document.getElementById(id); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    // The middle of each run, where a shop should be deepest. A size is
    // "thin" against the shop's own typical count here, not a fixed number,
    // so the rule means the same thing at a big shop and a small one.
    CORE: { women: [6, 11], men: [8, 13] },
    THIN: 0.8,
    LABEL: { women: "Women's", men: "Men's" },

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
                SZ.st.locs = j.locations.filter(function (l) { return l.men.carried + l.women.carried > 0; });
                SZ.st.loc = SZ.st.locs[0] && SZ.st.locs[0].id;
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

    // ---------- working it out from the style list ----------
    brandKey: function (v) { return String(v || 'Unknown').trim().toLowerCase(); },

    // One brand spelt two ways ("HOKA", "Hoka") is one brand; show the
    // spelling most styles use.
    brandNames: function (styles) {
        var c = {};
        styles.forEach(function (x) { var k = SZ.brandKey(x.v); c[k] = c[k] || {}; c[k][x.v || 'Unknown'] = (c[k][x.v || 'Unknown'] || 0) + 1; });
        var out = {};
        Object.keys(c).forEach(function (k) { out[k] = Object.keys(c[k]).sort(function (a, b) { return c[k][b] - c[k][a]; })[0]; });
        return out;
    },

    widthOk: function (x) {
        var w = SZ.st.width;
        if (w === 'wide') return /wide/.test(x.w || '');
        if (w === 'standard') return !/wide/.test(x.w || '');
        return true;
    },

    filtered: function (g) {
        var b = SZ.st.brand;
        return g.styles.filter(function (x) { return (!b || SZ.brandKey(x.v) === b) && SZ.widthOk(x); });
    },

    agg: function (styles) {
        var sizes = {};
        styles.forEach(function (x) {
            Object.keys(x.s).forEach(function (sz) { sizes[sz] = sizes[sz] || { styles: 0, units: 0 }; sizes[sz].styles++; sizes[sz].units += x.s[sz]; });
        });
        return { carried: styles.length, sizes: sizes, styles: styles };
    },

    // Every whole and half size in the gender's usual range plus any the shop
    // has outside it, so a gap shows as a gap, not a missing column.
    sizesFor: function (g, gender) {
        var ks = Object.keys(g.sizes).map(Number).filter(function (n) { return isFinite(n); });
        var core = SZ.CORE[gender], lo = Math.min.apply(null, ks.concat([core[0]])), hi = Math.max.apply(null, ks.concat([core[1]])), out = [];
        for (var x = lo; x <= hi + 1e-9; x += 0.5) out.push(String(x));
        return out;
    },

    // Thin: well below the median of the core sizes' style counts.
    analyse: function (g, gender) {
        var sizes = SZ.sizesFor(g, gender), core = SZ.CORE[gender];
        var coreVals = sizes.filter(function (s) { return +s >= core[0] && +s <= core[1]; }).map(function (s) { return (g.sizes[s] || {}).styles || 0; }).sort(function (a, b) { return a - b; });
        var med = coreVals.length ? coreVals[Math.floor(coreVals.length / 2)] : 0;
        var thin = {};
        sizes.forEach(function (s) { if (+s >= core[0] && +s <= core[1] && ((g.sizes[s] || {}).styles || 0) < med * SZ.THIN) thin[s] = true; });
        return { sizes: sizes, med: med, thin: thin };
    },

    coreSizes: function (gender) { var c = SZ.CORE[gender], out = []; for (var x = c[0]; x <= c[1] + 1e-9; x += 0.5) out.push(String(x)); return out; },

    // Models: colourways rolled up, ranked by pairs on the shelf.
    models: function (styles) {
        var by = {}, order = [];
        styles.forEach(function (x) {
            var k = x.m || x.h;
            if (!by[k]) { by[k] = { key: k, v: x.v, img: x.img, ways: [], sizes: {}, units: 0, names: {} }; order.push(by[k]); }
            var m = by[k];
            m.ways.push(x);
            var nm = String(x.t || '').split(' - ')[0].trim(); m.names[nm] = (m.names[nm] || 0) + 1;
            Object.keys(x.s).forEach(function (sz) { m.sizes[sz] = (m.sizes[sz] || 0) + x.s[sz]; m.units += x.s[sz]; });
        });
        order.forEach(function (m) { m.name = Object.keys(m.names).sort(function (a, b) { return m.names[b] - m.names[a]; })[0] || m.key; });
        return order.sort(function (a, b) { return b.units - a.units; });
    },

    // What the OTHER shops hold of this model in this size, so a gap can be
    // a transfer instead of a reorder.
    elsewhere: function (gender, modelKey, size) {
        var out = [];
        SZ.st.locs.forEach(function (l) {
            if (l.id === SZ.st.loc) return;
            var n = 0;
            l[gender].styles.forEach(function (x) { if ((x.m || x.h) === modelKey && x.s[size]) n += x.s[size]; });
            if (n) out.push(l.name + ' has ' + n);
        });
        return out;
    },

    // ---------- drawing ----------
    draw: function () {
        var L = SZ.st.locs, loc = L.filter(function (l) { return l.id === SZ.st.loc; })[0];
        SZ.$('locs').innerHTML = L.map(function (l) {
            return '<button type="button" class="chip' + (l.id === SZ.st.loc ? ' on' : '') + '" data-loc="' + SZ.esc(l.id) + '">' + SZ.esc(l.name) + '</button>';
        }).join('');
        SZ.$('locs').querySelectorAll('[data-loc]').forEach(function (b) { b.onclick = function () { SZ.st.loc = b.dataset.loc; SZ.st.sel = null; SZ.st.brand = ''; SZ.st.open = {}; SZ.draw(); }; });
        if (!loc) { SZ.$('out').innerHTML = '<div class="msg">No shoes on any shop shelf in the data.</div>'; return; }
        var all = loc.women.styles.concat(loc.men.styles);
        SZ.st.names = SZ.brandNames(all);
        var names = SZ.st.names;
        var brands = Object.keys(names).sort(function (a, b) { return names[a].localeCompare(names[b]); });
        var views = [['sizes', 'Sizes'], ['brands', 'Brands'], ['models', 'Models']];
        var bar = '<div class="views"><div class="seg" role="tablist" aria-label="View">' + views.map(function (v) {
            return '<button type="button" role="tab" aria-selected="' + (SZ.st.view === v[0]) + '" data-view="' + v[0] + '">' + v[1] + '</button>';
        }).join('') + '</div>' +
            (SZ.st.view === 'brands' ? '' : '<label class="sub">Brand <select id="f-brand"><option value="">All brands</option>' + brands.map(function (k) { return '<option value="' + SZ.esc(k) + '"' + (SZ.st.brand === k ? ' selected' : '') + '>' + SZ.esc(names[k]) + '</option>'; }).join('') + '</select></label>') +
            '<label class="sub">Width <select id="f-width"><option value="">All</option><option value="standard"' + (SZ.st.width === 'standard' ? ' selected' : '') + '>Standard</option><option value="wide"' + (SZ.st.width === 'wide' ? ' selected' : '') + '>Wide</option></select></label></div>';
        var body = ['women', 'men'].map(function (gender) {
            if (SZ.st.view === 'brands') return SZ.brandsCard(loc, gender);
            var g = SZ.agg(SZ.filtered(loc[gender]));
            if (SZ.st.view === 'models') return SZ.modelsCard(loc, gender, g);
            return SZ.sizesCard(loc, gender, g);
        }).join('');
        SZ.$('out').innerHTML = bar + body;
        SZ.wire(loc);
    },

    filterNote: function (noBrand) {
        var bits = [];
        if (SZ.st.brand && !noBrand) bits.push(SZ.st.names[SZ.st.brand] || SZ.st.brand);
        if (SZ.st.width) bits.push(SZ.st.width === 'wide' ? 'wide widths' : 'standard width');
        return bits.length ? ' (' + SZ.esc(bits.join(', ')) + ')' : '';
    },

    sizesCard: function (loc, gender, g) {
        var label = SZ.LABEL[gender];
        if (!g.carried) return '<div class="card"><h2>' + label + ' shoes at ' + SZ.esc(loc.name) + SZ.filterNote() + '</h2><p class="sub">None on the shelf.</p></div>';
        var a = SZ.analyse(g, gender), max = 1;
        a.sizes.forEach(function (s) { max = Math.max(max, (g.sizes[s] || {}).styles || 0); });
        var thinList = Object.keys(a.thin).sort(function (x, y) { return ((g.sizes[x] || {}).styles || 0) - ((g.sizes[y] || {}).styles || 0); });
        var callout = g.carried < 5 ? 'Only ' + g.carried + ' styles: too few to call any size thin.'
            : thinList.length
            ? '<b>Thin:</b> ' + thinList.map(function (s) { return 'size ' + s + ' (' + ((g.sizes[s] || {}).styles || 0) + ' styles)'; }).join(', ') +
              '. The middle sizes usually have about ' + a.med + '; thin means under ' + Math.round(SZ.THIN * 100) + '% of that.'
            : 'No thin sizes: every size from ' + SZ.CORE[gender][0] + ' to ' + SZ.CORE[gender][1] + ' has at least ' + Math.round(SZ.THIN * 100) + '% of the usual ' + a.med + ' styles.';
        if (g.carried < 5) a.thin = {};
        var cols = 'grid-template-columns: repeat(' + a.sizes.length + ', minmax(0, 1fr))';
        var bars = a.sizes.map(function (s) {
            var v = g.sizes[s] || { styles: 0, units: 0 }, h = Math.round(v.styles / max * 100);
            return '<div class="bar' + (a.thin[s] ? ' thin' : '') + (SZ.st.sel === gender + '|' + s ? ' sel' : '') + '" tabindex="0" role="button" data-g="' + gender + '" data-s="' + s + '" data-n="' + v.styles + '" data-u="' + v.units + '" data-c="' + g.carried + '" aria-label="' + label + ' size ' + s + ': ' + v.styles + ' of ' + g.carried + ' styles, ' + v.units + ' units' + (a.thin[s] ? ', thin' : '') + '">' +
                (a.thin[s] ? '<span class="flag" style="bottom:calc(' + h + '% + 3px)">▲ thin</span>' : '') +
                '<i style="height:' + h + '%"></i></div>';
        }).join('');
        var axis = a.sizes.map(function (s) { return '<span>' + s + '</span>'; }).join('');
        var row = function (name, fn, cls) { return '<tr><td>' + name + '</td>' + a.sizes.map(function (s) { return '<td' + (cls && a.thin[s] ? ' class="thin"' : '') + '>' + fn(g.sizes[s] || { styles: 0, units: 0 }) + '</td>'; }).join('') + '</tr>'; };
        var table = '<table class="nums" aria-label="' + label + ' sizes at ' + SZ.esc(loc.name) + '"><thead><tr><th>Size</th>' + a.sizes.map(function (s) { return '<th>' + s + '</th>'; }).join('') + '</tr></thead><tbody>' +
            row('Styles with it', function (v) { return v.styles; }, true) +
            row('Units', function (v) { return v.units; }) +
            row('Share of styles', function (v) { return Math.round(v.styles / g.carried * 100) + '%'; }) + '</tbody></table>';
        return '<div class="card"><h2>' + label + ' shoes at ' + SZ.esc(loc.name) + SZ.filterNote() + '</h2>' +
            '<div class="sub">' + g.carried + ' styles on the shelf. Each bar is how many of them have that size. Click a size to see which styles are missing it.</div>' +
            '<div class="callout">' + callout + '</div>' +
            '<div class="chart" style="' + cols + '">' + bars + '</div><div class="xaxis" style="' + cols + '">' + axis + '</div>' + table +
            '<div class="detail-slot" data-g="' + gender + '">' + (SZ.st.sel && SZ.st.sel.split('|')[0] === gender ? SZ.detail(loc, gender, g, SZ.st.sel.split('|')[1]) : '') + '</div></div>';
    },

    // A strip of the core sizes. For a brand: each cell's darkness is the
    // share of the brand's styles that have the size. For a model: whether any
    // colourway has it, with the pairs in the hover. An empty size is outlined
    // in red, so "none" never relies on a light shade alone.
    strip: function (styles, gender, pairsBySize) {
        var n = styles.length;
        return '<div class="strip">' + SZ.coreSizes(gender).map(function (sz) {
            var share, t;
            if (pairsBySize) { share = pairsBySize[sz] ? 1 : 0; t = pairsBySize[sz] ? pairsBySize[sz] + ' pairs' : 'none here'; }
            else { var have = styles.filter(function (x) { return x.s[sz]; }).length; share = n ? have / n : 0; t = have + ' of ' + n + ' styles'; }
            return '<span class="sc' + (share === 0 ? ' none' : '') + '" style="--a:' + (share === 0 ? 0 : (0.25 + share * 0.75).toFixed(2)) + '" title="Size ' + sz + ': ' + t + '"></span>';
        }).join('') + '</div>';
    },

    stripHead: function (gender) {
        return '<div class="strip head">' + SZ.coreSizes(gender).map(function (sz) { return '<span>' + sz + '</span>'; }).join('') + '</div>';
    },

    brandsCard: function (loc, gender) {
        var label = SZ.LABEL[gender], by = {}, names = SZ.st.names;
        loc[gender].styles.filter(SZ.widthOk).forEach(function (x) { var k = SZ.brandKey(x.v); (by[k] = by[k] || []).push(x); });
        var rows = Object.keys(by).map(function (k) {
            var st = by[k], units = 0, a = SZ.analyse(SZ.agg(st), gender);
            st.forEach(function (x) { Object.keys(x.s).forEach(function (s) { units += x.s[s]; }); });
            return { k: k, name: names[k] || k, st: st, units: units, thin: st.length >= 5 ? Object.keys(a.thin) : [] };
        }).sort(function (a, b) { return b.units - a.units; });
        if (!rows.length) return '<div class="card"><h2>' + label + ' brands at ' + SZ.esc(loc.name) + SZ.filterNote(true) + '</h2><p class="sub">None on the shelf.</p></div>';
        return '<div class="card"><h2>' + label + ' brands at ' + SZ.esc(loc.name) + SZ.filterNote(true) + '</h2>' +
            '<div class="sub">Ranked by pairs on the shelf. The strip is sizes ' + SZ.CORE[gender][0] + ' to ' + SZ.CORE[gender][1] + ': darker means more of the brand\'s styles have that size, a red outline means none do. Click a brand to see its size chart.</div>' +
            '<table class="list"><thead><tr><th>Brand</th><th class="num">Styles</th><th class="num">Pairs</th><th class="stripcol">' + SZ.stripHead(gender) + '</th><th>Thin sizes</th></tr></thead><tbody>' +
            rows.map(function (r) {
                return '<tr class="click" data-brand="' + SZ.esc(r.k) + '" tabindex="0"><td><b>' + SZ.esc(r.name) + '</b></td><td class="num">' + r.st.length + '</td><td class="num">' + r.units + '</td>' +
                    '<td class="stripcol">' + SZ.strip(r.st, gender) + '</td><td class="sub">' + (r.st.length < 5 ? 'Too few styles to judge' : r.thin.length ? '<span class="warnt">▲ ' + SZ.esc(r.thin.join(', ')) + '</span>' : 'None') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    },

    modelsCard: function (loc, gender, g) {
        var label = SZ.LABEL[gender], ms = SZ.models(g.styles), core = SZ.coreSizes(gender);
        if (!ms.length) return '<div class="card"><h2>' + label + ' models at ' + SZ.esc(loc.name) + SZ.filterNote() + '</h2><p class="sub">None on the shelf.</p></div>';
        var MAX = 40, shown = ms.slice(0, SZ.st.open['all|' + gender] ? ms.length : MAX);
        return '<div class="card"><h2>' + label + ' models at ' + SZ.esc(loc.name) + SZ.filterNote() + '</h2>' +
            '<div class="sub">Colourways rolled up into models, ranked by pairs on the shelf (the most stocked, not sales). The strip is sizes ' + core[0] + ' to ' + core[core.length - 1] + ' across every colourway: a red outline means the model has none in that size here. Green notes say which other shop has it. Click a model to see its colourways.</div>' +
            '<table class="list"><thead><tr><th>Model</th><th class="num">Colours</th><th class="num">Pairs</th><th class="stripcol">' + SZ.stripHead(gender) + '</th><th>Missing here</th></tr></thead><tbody>' +
            shown.map(function (m) {
                var miss = core.filter(function (s) { return !m.sizes[s]; });
                var key = gender + '|' + m.key, open = !!SZ.st.open[key];
                var where = miss.map(function (s) { var e = SZ.elsewhere(gender, m.key, s); return e.length ? s + ': ' + e.join(', ') : ''; }).filter(Boolean);
                var missTxt = !miss.length ? '<span class="sub">Full run</span>' : '<span class="warnt">' + SZ.esc(miss.join(', ')) + '</span>' +
                    (where.length ? '<div class="sub elsewhere">' + SZ.esc(where.join('; ')) + '</div>' : '');
                return '<tr class="click" data-model="' + SZ.esc(key) + '" tabindex="0"><td><div class="mrow">' + (m.img ? '<img src="' + SZ.esc(m.img) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
                    '<span><b>' + SZ.esc(m.name) + '</b><span class="sub">' + SZ.esc(m.v) + '</span></span></div></td>' +
                    '<td class="num">' + m.ways.length + '</td><td class="num">' + m.units + '</td><td class="stripcol">' + SZ.strip(m.ways, gender, m.sizes) + '</td><td>' + missTxt + '</td></tr>' +
                    (open ? '<tr class="ways"><td colspan="5">' + m.ways.map(function (x) {
                        var ss = Object.keys(x.s).sort(function (a, b) { return a - b; });
                        return '<div class="style">' + (x.img ? '<img src="' + SZ.esc(x.img) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
                            '<div>' + SZ.esc(x.t) + (x.w && x.w !== 'standard' ? ' <span class="sub">(' + SZ.esc(x.w) + ')</span>' : '') +
                            '<div class="have">Has ' + ss.map(function (z) { return '<b>' + z + '</b>' + (x.s[z] > 1 ? '×' + x.s[z] : ''); }).join(' ') + '</div></div></div>';
                    }).join('') + '</td></tr>' : '');
            }).join('') + '</tbody></table>' +
            (ms.length > shown.length ? '<button class="chip" type="button" data-allmodels="' + gender + '" style="margin-top:10px">Show all ' + ms.length + ' models</button>' : '') + '</div>';
    },

    // The styles missing this size, the ones most likely sold through first:
    // those that still have a size either side of it.
    detail: function (loc, gender, g, s) {
        var label = SZ.LABEL[gender], n = +s;
        var an = /^(8|11|18)(\.|$)/.test(s) ? 'an ' : 'a '; // an 8, an 11, a 9
        var near = function (st) { return st.s[String(n - 0.5)] || st.s[String(n + 0.5)] || st.s[String(n - 1)] || st.s[String(n + 1)]; };
        var missing = g.styles.filter(function (st) { return !st.s[s]; });
        var broken = missing.filter(near), other = missing.filter(function (st) { return !near(st); });
        var have = g.styles.length - missing.length;
        var row = function (st) {
            var sizes = Object.keys(st.s).sort(function (x, y) { return x - y; });
            var e = SZ.elsewhere(gender, st.m || st.h, s);
            return '<div class="style">' + (st.img ? '<img src="' + SZ.esc(st.img) + '" alt="" loading="lazy">' : '<span class="noimg"></span>') +
                '<div>' + SZ.esc(st.t) + '<div class="have">Has ' + sizes.map(function (z) { return '<b>' + z + '</b>' + (st.s[z] > 1 ? '×' + st.s[z] : ''); }).join(' ') + '</div>' +
                (e.length ? '<div class="sub elsewhere">Same model in ' + s + ': ' + SZ.esc(e.join(', ')) + '</div>' : '') + '</div></div>';
        };
        return '<div class="detail"><h3>' + label + ' size ' + s + ' at ' + SZ.esc(loc.name) + SZ.filterNote() + '</h3>' +
            '<p class="sub" style="margin:0 0 8px">' + have + ' of ' + g.carried + ' styles have it. ' + missing.length + ' do not.</p>' +
            (broken.length ? '<h3 style="font-size:14px;margin-top:10px">Missing ' + an + s + ' but have the sizes next to it (' + broken.length + ')</h3><p class="sub" style="margin:0 0 6px">Most likely sold through. The first ones to reorder, or to ask another shop for.</p>' + broken.map(row).join('') : '') +
            (other.length ? '<details style="margin-top:10px"><summary class="sub" style="cursor:pointer">The other ' + other.length + ' styles without ' + an + s + '</summary>' + other.map(row).join('') + '</details>' : '') + '</div>';
    },

    wire: function (loc) {
        var out = SZ.$('out'), tip = SZ.$('tip');
        var key = function (el, fn) { el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } }); };
        out.querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { SZ.st.view = b.dataset.view; SZ.st.sel = null; SZ.draw(); }; });
        var fb = SZ.$('f-brand'); if (fb) fb.onchange = function () { SZ.st.brand = this.value; SZ.st.sel = null; SZ.draw(); };
        var fw = SZ.$('f-width'); if (fw) fw.onchange = function () { SZ.st.width = this.value; SZ.st.sel = null; SZ.draw(); };
        out.querySelectorAll('[data-brand]').forEach(function (r) {
            var go = function () { SZ.st.brand = r.dataset.brand; SZ.st.view = 'sizes'; SZ.st.sel = null; SZ.draw(); window.scrollTo(0, 0); };
            r.onclick = go; key(r, go);
        });
        out.querySelectorAll('[data-model]').forEach(function (r) {
            var go = function () { SZ.st.open[r.dataset.model] = !SZ.st.open[r.dataset.model]; SZ.draw(); };
            r.onclick = go; key(r, go);
        });
        out.querySelectorAll('[data-allmodels]').forEach(function (b) { b.onclick = function () { SZ.st.open['all|' + b.dataset.allmodels] = true; SZ.draw(); }; });
        out.querySelectorAll('.bar').forEach(function (b) {
            var show = function () {
                var n = +b.dataset.n, c = +b.dataset.c;
                tip.innerHTML = '<b>' + SZ.LABEL[b.dataset.g] + ' ' + b.dataset.s + '</b>' + n + ' of ' + c + ' styles (' + Math.round(n / c * 100) + '%)<br>' + b.dataset.u + ' units on the shelf' + (b.classList.contains('thin') ? '<br>▲ thin for this shop' : '');
                tip.classList.remove('hidden');
                var r = b.getBoundingClientRect();
                tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
                tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
            };
            var hide = function () { tip.classList.add('hidden'); };
            var pick = function () {
                var k = b.dataset.g + '|' + b.dataset.s;
                SZ.st.sel = SZ.st.sel === k ? null : k;
                hide(); SZ.draw();
                var slot = out.querySelector('.detail-slot[data-g="' + b.dataset.g + '"]');
                if (slot && SZ.st.sel) slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            };
            b.addEventListener('mouseenter', show); b.addEventListener('mouseleave', hide);
            b.addEventListener('focus', show); b.addEventListener('blur', hide);
            b.addEventListener('click', pick); key(b, pick);
        });
    },
};
SZ.init();
