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

    boxFor: function (item, p, color) {
        var b = item && item.boxes || {};
        return b[color] || b['*'] || this.defaultBox(p, item && item.placement);
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
    // "Navy w/ Left Chest Main Logo (R021)". There is no design code yet at
    // this stage, so it stops at the placement.
    colorLabel: function (color, placement, logoLabel) {
        var where = placement ? String(placement).replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ' ' : '';
        var which = logoLabel && !/^main logo$/i.test(logoLabel) ? logoLabel : 'Logo';
        return String(color) + ' w/ ' + where + which;
    }
};

if (typeof module !== 'undefined') module.exports = TeamReqUtils;
