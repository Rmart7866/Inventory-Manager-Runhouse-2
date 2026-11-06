// team-request-utils.js, The Run House.
//
// The pure rules behind team-requests.html, kept apart from the page so a
// node test can pin them: the size ladder a draft is created with, where a
// logo sits by default, how a logo fits inside its box, and the colour value
// the Shopify option carries. No DOM in here.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var TeamReqUtils = {
    // The builder's catalog, the same file the storefront page loads. If the
    // builder's CURL constant moves to a new hashed filename, move this too.
    CATALOG_URL: 'https://cdn.shopify.com/s/files/1/0631/6877/4399/files/trh-builder-catalog-be7a99fd83.json',
    CDN: { '~': 'https://cdn.shopify.com/s/files/1/0631/6877/4399/files/', '^': 'https://cdnm.sanmar.com/swatch/gifs/', '`': 'https://www.charlesriverapparel.com/prodimg/swatch/' },

    LADDER: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
    TALL: ['LT', 'XLT', '2XLT', '3XLT', '4XLT'],

    expand: function (v) {
        if (typeof v !== 'string') return v;
        var p = this.CDN[v.charAt(0)];
        return p ? p + v.slice(1) : v;
    },

    // The catalog describes sizes in prose ("Adult Sizes: XS-4XL", "Toddler
    // Sizes: 2T-5T", "INFANT SIZES: 6M, 12M, 18M"). A draft needs a real list.
    // Anything this cannot read returns [] rather than a guess, and the page
    // refuses to build that item until staff type the sizes, because a wrong
    // size ladder on a live product is a refund waiting to happen.
    sizesFrom: function (z) {
        var s = String(z || '').trim();
        if (!s) return [];
        if (/one size|osfa|one size fits/i.test(s) && !/,|-/.test(s.replace(/one size fits (most|all)/i, ''))) return ['One Size'];
        var self = this, out = [];
        var parts = s.split(/&/);
        for (var i = 0; i < parts.length; i++) {
            var body = parts[i].replace(/^[^:]*:/, '').trim();
            var tall = /tall/i.test(parts[i]);
            var m = body.match(/^(\w+)\s*-\s*(\w+)$/);
            if (m) {
                var lad = tall ? self.TALL : self.LADDER;
                var a = self.normSize(m[1]), b = self.normSize(m[2]);
                var ia = lad.indexOf(a), ib = lad.indexOf(b);
                if (ia >= 0 && ib >= ia) { out = out.concat(lad.slice(ia, ib + 1)); continue; }
                var t = body.match(/^(\d+)T\s*-\s*(\d+)T$/i);
                if (t) { for (var n = +t[1]; n <= +t[2]; n++) out.push(n + 'T'); continue; }
                return [];
            }
            if (/,/.test(body)) {
                var list = body.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
                if (list.every(function (x) { return /^(newborn|\d+m|\d+t|xxs|xs|s|m|l|xl|\dxl)$/i.test(x); })) {
                    out = out.concat(list.map(function (x) { return /^newborn$/i.test(x) ? 'NB' : x.toUpperCase(); }));
                    continue;
                }
            }
            return [];
        }
        return out;
    },

    // The catalog leaves the size text BLANK on hats, bags and accessories,
    // which really are one size. Blank anywhere else is unknown, not one size.
    ONE_SIZE_CATEGORIES: ['Headwear', 'Bags', 'Accessories'],
    sizesFor: function (p, category) {
        var s = this.sizesFrom(p && p.z);
        if (!s.length && !String(p && p.z || '').trim() && this.ONE_SIZE_CATEGORIES.indexOf(category) >= 0) return ['One Size'];
        return s;
    },

    normSize: function (x) {
        var u = String(x || '').toUpperCase().replace(/\s+/g, '');
        if (u === 'XXL') return '2XL';
        if (u === 'XXXL') return '3XL';
        return u;
    },

    // Where the logo goes when staff have not moved it: the catalog's own print
    // box, the same one the builder draws. A product with a chest choice has a
    // full chest and a left chest box; the request names which one.
    defaultBox: function (p, placement) {
        if (!p) return null;
        if (p.ch) return /left/i.test(placement || '') ? p.lcb : p.fcb;
        return p.pb || null;
    },

    // Where the logo goes, most specific first: a staff box for this store
    // and colour, a staff box for this store, a box staff changed for the
    // whole STYLE on the Placements tab, then the catalog's own box. The
    // catalog's boxes ARE Dan's placement tool numbers (fcb, lcb, pb, loc are
    // identical to his builder_data.json), measured on the trimmed photo.
    boxFor: function (item, p, color, tpl) {
        var b = item && item.boxes || {};
        return b[color] || b['*'] || this.templateBox(tpl, p, item && item.placement) || this.defaultBox(p, item && item.placement);
    },

    // tpl = { fc, lc, pb, bk }, each [x, y, w, h, tilt?] in fractions of the
    // catalog photo. A style with a chest choice uses fc or lc; anything else
    // (hats, bags, bottoms) uses pb, the one front box.
    templateBox: function (tpl, p, placement) {
        if (!tpl || !p) return null;
        if (p.ch) return /left/i.test(placement || '') ? tpl.lc || null : tpl.fc || null;
        return tpl.pb || tpl.fc || null;
    },

    // object-fit: contain, object-position: top center, inside the box. This is
    // exactly how the builder renders a logo (img.l), so a mockup made here
    // matches what the customer saw. All in fractions of the garment image.
    // The box is in fractions of the photo's width and height, which are
    // different units on a portrait photo (a hoodie is 303x420), so the fit is
    // done in PIXELS and converted back. Comparing aspect ratios in fraction
    // units squashes the logo on every non-square garment.
    fitLogo: function (box, logoW, logoH, photoW, photoH) {
        var bx = box[0], by = box[1], bw = box[2], bh = box[3];
        if (!(logoW > 0 && logoH > 0 && photoW > 0 && photoH > 0)) return { x: bx, y: by, w: bw, h: bh };
        var pw = bw * photoW, ph = bh * photoH, ar = logoW / logoH;
        if (ar >= pw / ph) {
            var h = pw / ar;
            return { x: bx, y: by, w: bw, h: h / photoH };
        }
        var w = ph * ar;
        return { x: bx + (bw - w / photoW) / 2, y: by, w: w / photoW, h: bh };
    },

    // The colour option value, in the form staff already write by hand:
    // "Navy w/ Left Chest Main Logo (R021)". Used when no logo code is set.
    colorLabel: function (color, placement, logoLabel) {
        var where = placement ? String(placement).replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ' ' : '';
        var which = logoLabel && !/^main logo$/i.test(logoLabel) ? logoLabel : 'Logo';
        return String(color) + ' w/ ' + where + which;
    },

    // ---- The back office automation's rules (Dan's runbook, 2026-11-05) ----

    // The print location as the Logo Master Folder files name it: FC full
    // chest, LC left chest, HAT, BK back, BN back neck. SL (sleeve) and LL
    // (left leg) are not in that runbook's list; they are named the same way
    // so a person can see what they are.
    plCode: function (placement, category) {
        var t = String(placement || '').toLowerCase();
        if (/headwear/i.test(category || '')) return 'HAT';
        if (/back neck/.test(t)) return 'BN';
        if (/back/.test(t)) return 'BK';
        if (/left chest/.test(t)) return 'LC';
        if (/sleeve/.test(t)) return 'SL';
        if (/leg/.test(t)) return 'LL';
        return 'FC';
    },

    // Print sizes in inches, from make_logo_files.py. SL and LL borrow the
    // left chest size, which is the closest thing that runbook defines.
    PRINT_IN: { FC: [10, 10], BK: [10, 10], LC: [3.5, 3.5], BN: [2, 2], HAT: [4, 2], SL: [3.5, 3.5], LL: [3.5, 3.5] },

    // ---------- supplier stock (SanMar, worker/src/sanmar.js) ----------
    // The join key the Worker builds its alias table on. "Heathered Navy"
    // here is "heathernavy" in SanMar's photo filenames.
    colorKey: function (s) { return String(s || '').toLowerCase().replace(/heathered/g, 'heather').replace(/[^a-z0-9]/g, ''); },

    supplierColor: function (sup, name) {
        if (!sup || !sup.alias || !sup.colors) return null;
        var c = sup.alias[this.colorKey(name)];
        return c && sup.colors[c] ? sup.colors[c] : null;
    },

    // Under this many in a core size reads as low. A team store sells a
    // handful to a few dozen of a size; SanMar usually holds thousands.
    LOW_STOCK: 24,
    CORE_SIZES: ['S', 'M', 'L', 'XL'],

    // A colour's stock in the sizes this store sells, judged on the CORE
    // sizes (S to XL) where it sells them and on every size otherwise, so a
    // thin 5XL never flags a whole colour. out: a core size at 0. low: one
    // under LOW_STOCK. unknown: the supplier has no data for this colour,
    // which is NOT the same as out and must never be reported as it.
    stockOf: function (sup, name, sizes) {
        var rec = this.supplierColor(sup, name);
        if (!rec) return { state: 'unknown', short: [], q: null };
        var core = (sizes || []).filter(function (s) { return this.CORE_SIZES.indexOf(s) >= 0; }, this);
        if (!core.length) core = sizes || [];
        var short = [], state = 'ok', L = this.LOW_STOCK;
        core.forEach(function (s) {
            var q = rec.q[s];
            if (q == null) return; // a size the supplier does not list for this colour
            if (q === 0) { state = 'out'; short.push([s, 0]); }
            else if (q < L) { if (state !== 'out') state = 'low'; short.push([s, q]); }
        });
        return { state: state, short: short, q: rec.q };
    },

    // "Jet Black (D055 (FC))": the colour, the code of the logo printed on it,
    // and where. Never the builder's "Main logo" label.
    codeLabel: function (color, code, pl) { return String(color) + ' (' + code + ' (' + pl + '))'; },

    // The second logo the customer added (back, back neck or sleeve), from
    // the catalog's own locations: side 'f' prints on the front photo, 'b' on
    // the back photo.
    loc2: function (item, p, tpl) {
        var name = item && item.second_logo, l = name && p && p.loc && p.loc[name];
        if (!l) return null;
        // A box staff changed on the Placements tab beats the catalog's.
        var z = { 'Back': 'bk', 'Back neck': 'bn', 'Sleeve': 'sl' }[name];
        var box = z && tpl && tpl[z] ? tpl[z] : l[1];
        return { name: name, side: l[0], box: box };
    },

    // How well a logo shows on a garment colour, 0 to 1: the mean colour
    // distance of the logo's own pixels from the garment, the builder's vis()
    // and render_mockups.py visib(), so all three pick the same logo.
    vis: function (samples, hex) {
        if (!samples || !samples.length) return 0.5;
        var h = String(hex || '#888888').replace('#', ''), g = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)], n = 0;
        for (var i = 0; i < samples.length; i++) {
            var q = samples[i], dr = q[0] - g[0], dg = q[1] - g[1], db = q[2] - g[2];
            n += Math.min(160, Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db));
        }
        return n / samples.length / 160;
    },

    ORDER: ['main', 'dark', 'l3', 'l4', 'l5'],

    // The first logo wins unless another shows at least 10% better.
    autoKey: function (logos, hex) {
        var ks = this.ORDER.filter(function (k) { return logos[k]; });
        Object.keys(logos).forEach(function (k) { if (ks.indexOf(k) < 0) ks.push(k); });
        if (!ks.length) return null;
        var best = ks[0], bv = this.vis(logos[ks[0]].samples, hex);
        for (var i = 1; i < ks.length; i++) { var v = this.vis(logos[ks[i]].samples, hex); if (v > bv * 1.1) { best = ks[i]; bv = v; } }
        return best;
    },

    // Which logo goes on this colour. The customer's per colour pick first,
    // then the item's fixed choice, then whichever shows best. which: 'f' for
    // the front logo, 'x' for the second.
    resolveLogo: function (item, color, which, logos, hex) {
        var by = (item && item.logoBy && item.logoBy[color]) || {};
        var pick = which === 'x' ? by.x : by.f;
        if (pick && logos[pick]) return pick;
        var fixed = which === 'x' ? item.logo2 : item.logo;
        if (fixed && fixed !== 'auto' && logos[fixed]) return fixed;
        return this.autoKey(logos, hex);
    },

    // ---- browser only: clean a logo the way render_mockups.py does ----
    // A logo with no transparency gets its near-white background knocked
    // out (fully clear above 235, faded between 212 and 235), then every logo
    // is trimmed to its visible pixels. Returns { url, w, h, samples }.
    _logoCache: {},
    loadLogo: function (src) {
        var self = this;
        if (self._logoCache[src]) return self._logoCache[src];
        self._logoCache[src] = new Promise(function (res, rej) {
            var im = new Image();
            if (!/^(blob|data):/.test(src)) im.crossOrigin = 'anonymous';
            im.onload = function () {
                var W = im.naturalWidth, H = im.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
                var x = c.getContext('2d'); x.drawImage(im, 0, 0);
                var d = x.getImageData(0, 0, W, H), a = d.data, opaque = true, i;
                for (i = 3; i < a.length; i += 4) if (a[i] < 250) { opaque = false; break; }
                if (opaque) {
                    for (i = 0; i < a.length; i += 4) {
                        var mn = Math.min(a[i], a[i + 1], a[i + 2]);
                        if (mn > 235) a[i + 3] = 0; else if (mn > 212) a[i + 3] = Math.min(a[i + 3], Math.round((235 - mn) / 23 * 255));
                    }
                }
                var x0 = W, y0 = H, x1 = -1, y1 = -1;
                for (var y = 0; y < H; y++) for (var xx = 0; xx < W; xx++) if (a[(y * W + xx) * 4 + 3] > 16) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
                if (x1 < 0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
                x.putImageData(d, 0, 0);
                var tw = x1 - x0 + 1, th = y1 - y0 + 1, t = document.createElement('canvas'); t.width = tw; t.height = th;
                t.getContext('2d').drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
                var td = t.getContext('2d').getImageData(0, 0, tw, th).data, samples = [], step = Math.max(1, Math.floor(tw * th / 600));
                for (i = 0; i < tw * th; i += step) if (td[i * 4 + 3] > 128) samples.push([td[i * 4], td[i * 4 + 1], td[i * 4 + 2]]);
                t.toBlob(function (b) { res({ url: URL.createObjectURL(b), w: tw, h: th, samples: samples, cleaned: opaque, canvas: t }); }, 'image/png');
            };
            im.onerror = function () { rej(new Error('Could not load the logo')); };
            im.src = src;
        });
        return self._logoCache[src];
    }
};

if (typeof module !== 'undefined') module.exports = TeamReqUtils;
