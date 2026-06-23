// Brooks Converter - Processes pre-formatted scraper CSVs
// Gender derived from style code: 110xxx = Men, 120xxx = Women
// Width derived from handle suffix: gender-aware interpretation
// Men:   B=Narrow, D=Regular, 2E=Wide, 4E=Extra Wide
// Women: 2A=Narrow, B=Regular, D=Wide, 2E=Extra Wide, 4E=Extra Extra Wide
//
// HANDLE STRATEGY (matches ASICS pattern):
//   - If raw scraper handle (after remap) is in `existingHandles` OR is a
//     `handleRemap` target -> keep it (Shopify product already uses that
//     handle; preserves existing convention).
//   - Otherwise -> rebuild as `cleanHandle(cleanTitle(...))`, e.g.
//     "brooks-mens-ghost-18-wide-black-black-ebony". Both inventory CSV and
//     product CSV use this same canonical handle, so they always agree.

var BrooksConverter = {
    // ========== EXISTING SHOPIFY HANDLES ==========
    // Raw scraper-style handles for Brooks products already on Shopify.
    // Sourced from Shopify export. Any handle NOT in here (and not a remap
    // target) is treated as new and gets a cleaned title-based handle
    // (mens/womens prefix, width word).
    existingHandles: new Set([
        'adrenaline-gts-24-gtx-alloywhitegold-fusion-110437346',
        'adrenaline-gts-24-gtx-blackwhite-d-110437346',
        'adrenaline-gts-24-gtx-coconutportabellaorange-d-110437346',
        'adrenaline-gts-24-gtx-whiteblackpelican-d-110437346',
        'adrenaline-gts-24-gtx-blackebonynew-yellow-d-110438033',
        'ghost-17-blackblackebony-d-110442297',
        'ghost-17-vaporous-greyprimersand-d-110442297',
        'ghost-17-primer-grayoyster-mushroom-d-110442297',
        'ghost-17-oyster-mushroomorangeebony-110442297',
        'ghost-17-ebonyblackyellow-d-110442297',
        'ghost-17-blackgreywhite-d-110442297',
        'ghost-17-whitepink-claygecko-d-110442297',
        'ghost-17-whitebeacon-blueipanema-d-110442297',
        'ghost-17-whiteblacktea-d-110442297',
        'ghost-17-chateau-graybrownolive-d-110442297',
        'ghost-17-acid-limenavywhite-d-110442297',
        'ghost-17-kentuckybluelavender-d-110442297',
        'ghost-17-peacoatlimeblue-d-110442297',
        'ghost-17-cloissoneblueorange-d-110442297',
        'ghost-17-nightbluepapaya-d-110442297',
        'ghost-17-beacon-bluemoonlightstarfish-d-110442297',
        'ghost-17-skywaymoonlightorange-d-110442297',
        'glycerin-22-blackcobaltneo-yellow-d-110445002',
        'glycerin-22-blackcountry-blueorange-pop-d-110445002',
        'glycerin-22-blackblackebony-d-110445002',
        'glycerin-22-primer-grayebonybluewash-d-110445002',
        'glycerin-22-blackprimer-graybiscuit-d-110445002',
        'glycerin-22-blackgreywhite-d-110445002',
        'glycerin-22-primer-graygrayhoney-ginger-d-110445002',
        'glycerin-22-whitegreyblack-d-110445002',
        'glycerin-22-coconutteablazing-yellow-d-110445002',
        'glycerin-22-moonbeambluetaffy-d-110445002',
        'glycerin-22-beetleceladonivory-d-110445002',
        'glycerin-22-jaspercoconuttaffy-d-110445002',
        'glycerin-22-dusty-oliveteaorange-d-110445002',
        'glycerin-22-peacoatblue-ribbonorange-d-110445002',
        'glycerin-22-orangenightlifewhite-d-110445002',
        'glycerin-gts-22-blackcobaltneo-yellow-d-110446078',
        'glycerin-gts-22-blackcountry-blueorange-pop-d-110446078',
        'glycerin-gts-22-blackblackebony-d-110446078',
        'glycerin-gts-22-primer-grayebonybluewash-d-110446078',
        'glycerin-gts-22-blackgreywhite-d-110446078',
        'glycerin-gts-22-whitegreyblack-d-110446078',
        'glycerin-gts-22-orangenightlifewhite-d-110446078',
        'adrenaline-gts-25-blackblackebony-110454044',
        'adrenaline-gts-25-oystergreen-geckoblue-d-110454044',
        'adrenaline-gts-25-blackbiscuit-d-110454044',
        'adrenaline-gts-25-primer-greyebonyjasmin-110454044',
        'adrenaline-gts-25-blackipanemamint-d-110454044',
        'adrenaline-gts-25-phantomstarfishcoconut-d-110454044',
        'adrenaline-gts-25-blackgreywhite-d-110454044',
        'adrenaline-gts-25-whitespellboundorange-d-110454044',
        'adrenaline-gts-25-silver-anniversary-edition-d-110454044',
        'adrenaline-gts-25-whiteblackwhite-d-110454044',
        'adrenaline-gts-25-spellboundmoonlightipanema-d-110454044',
        'adrenaline-gts-25-greenmoonlightphantom-d-110454044',
        'ghost-max-3-primer-greyantarcticared-d-110464417',
        'ghost-max-3-blackblackebony-d-110464417',
        'ghost-max-3-primer-greyebony-d-110464417',
        'ghost-max-3-blacknavyacid-lime-d-110464417',
        'ghost-max-3-bright-whiteteablack-d-110464417',
        'ghost-max-3-coconutchateaunavy-d-110464417',
        'ghost-max-3-rockridgepoppyseedsand-d-110464417',
        'ghost-max-3-sunny-limeacid-limetea-d-110464417',
        'ghost-max-3-bluewashatomizerorange-d-110464417',
        'ghost-max-3-skywayblueorange-d-110464417',
        'ghost-max-3-bluestarfishmoonlight-d-110464417',
        'ghost-max-3-orangeshocking-orangeexcalibur-d-110464417',
        'glycerin-max-2-phantomwhitegreen-gecko-d-110479091',
        'glycerin-max-2-whiteblackchateau-gray-d-110479091',
        'glycerin-max-2-spellboundstarfishwhite-d-110479091',
        'glycerin-max-2-orangebeacon-bluenightlife-d-110479091',
        'adrenaline-gts-24-gtx-blackpeacoatpeach-120426137',
        'adrenaline-gts-24-gtx-alloywhitezephyr-120426137',
        'adrenaline-gts-24-gtx-blackblackebony-120426137',
        'adrenaline-gts-24-gtx-mercuryebonycopper-120426137',
        'adrenaline-gts-24-gtx-coconutrose-goldwhite-120426137',
        'adrenaline-gts-24-gtx-blackebonyhot-coral-120427044',
        'ghost-17-alloyblackened-pearlpeach-120431070',
        'ghost-17-blackblackebony-120431070',
        'ghost-17-blackorange-120431070',
        'ghost-17-poppy-seedpinkbluewash-120431070',
        'ghost-17-oysterapricotpink-120431070',
        'ghost-17-blackpurplecoral-120431070',
        'ghost-17-greyclearwaterpurple-120431070',
        'ghost-17-blackgreywhite-120431070',
        'ghost-17-greychateau-greyportabella-120431070',
        'ghost-17-whiteblackrose-gold-120431070',
        'ghost-17-whitewhitegrey-120431070',
        'ghost-17-clearwaternavy-peony-120431070',
        'ghost-17-skywaycoconutsand-120431070',
        'ghost-17-nightbluepapaya-120431070',
        'ghost-17-blue-heronwhiteorange-120431070',
        'ghost-17-navygreenturquoise-120431070',
        'ghost-17-spellboundskyway-120431070',
        'ghost-17-pinkfuchsiagold-120431070',
        'ghost-17-apricotgreypink-120431070',
        'glycerin-22-blackblackebony-120434110',
        'glycerin-22-blackblue-heronorange-120434110',
        'glycerin-22-blackgreywhite-120434110',
        'glycerin-22-whitelimpet-shellamparo-blue-120434110',
        'glycerin-22-coconutchateaurose-120434110',
        'glycerin-22-whitegreyblack-120434110',
        'glycerin-22-whitewhitegrey-120434110',
        'glycerin-22-pearlized-whitebay-120434110',
        'glycerin-22-taffymoonbeamessence-120434110',
        'glycerin-22-almond-peachlondon-fogalmond-120434110',
        'glycerin-22-blue-ribbonpeacoatdianthus-120434110',
        'glycerin-22-amparo-bluehyper-irisyellow-120434110',
        'glycerin-22-lilactaffycoconut-120434110',
        'glycerin-22-sherbertapricotpink-120434110',
        'glycerin-gts-22-blackblackebony-120435090',
        'glycerin-gts-22-blackgreywhite-120435090',
        'glycerin-gts-22-whitelimpet-shellamparo-blue-120435090',
        'glycerin-gts-22-whitegreyblack-120435090',
        'glycerin-gts-22-whitewhitegrey-120435090',
        'glycerin-gts-22-blue-ribbonpeacoatdianthus-120435090',
        'glycerin-gts-22-sherbertapricotpink-120435090',
        'adrenaline-gts-25-blackblackebony-120443032',
        'adrenaline-gts-25-greyblackened-pearlcoral-120443032',
        'adrenaline-gts-25-blackbiscuit-120443032',
        'adrenaline-gts-25-oysterpinkgreen-120443032',
        'adrenaline-gts-25-blackcyber-pinkiced-aqua-120443032',
        'adrenaline-gts-25-blackgreywhite-120443032',
        'adrenaline-gts-25-whitewhitesilver-120443032',
        'adrenaline-gts-25-coconutargyle-120443032',
        'adrenaline-gts-25-whitenightlifeyucca-120443032',
        'adrenaline-gts-25-silver-anniversary-edition-120443032',
        'adrenaline-gts-25-whiteblackwhite-120443032',
        'adrenaline-gts-25-sandcoconutskyway-120443032',
        'adrenaline-gts-25-spellboundblazing-bellpink-120443032',
        'adrenaline-gts-25-mauveebonypink-120443032',
        'ghost-max-3-blackblackebony-120457043',
        'ghost-max-3-blackblackrose-gold-120457043',
        'ghost-max-3-harbor-mistpoppy-seedpink-120457043',
        'ghost-max-3-whitemoonlightpink-120457043',
        'ghost-max-3-whitewhite-120457043',
        'ghost-max-3-coconutblue-heronorange-120457043',
        'ghost-max-3-coconutchateau-greyblue-120457043',
        'ghost-max-3-navypeacoatclearwater-120457043',
        'ghost-max-3-skywaycoconutsand-120457043',
        'ghost-max-3-bluesylvan-greenclearwater-120457043',
        'ghost-max-3-apricotapricotsuper-pink-120457043',
        'glycerin-max-2-oysterargylecyber-pink-120468048',
        'glycerin-max-2-greycoconutmetallic-120468048',
        'glycerin-max-2-whiteblackchateau-gray-120468048',
        'glycerin-max-2-blazing-bellpinkwhite-120468048'
    ]),

    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,
    _rawRows: null,
    _remapTargets: null,

    // ========== HANDLE REMAPPING ==========
    // Brooks occasionally updates style numbers on their portal for existing products.
    // When that happens the scraper outputs a handle with the new style number,
    // but the Shopify product was created with the old one. Map new -> old here.
    //
    // IMPORTANT: the 110xxx / 120xxx prefix encodes gender (110 = Men, 120 = Women).
    // A remap MUST keep that prefix consistent between key and value, otherwise the
    // colorway's stock gets routed to the opposite gender's product and the correct
    // product is left stale. (Two such flips were found and corrected: see the
    // blackblackebony-d and blackgreywhite-d lines below.)
    handleRemap: {
        'glycerin-23-blackblackebony-120465133': 'glycerin-23-blackblackebony-120465111',
        'glycerin-23-blackblackebony-2e-110476096': 'glycerin-23-blackblackebony-2e-110476154',
        'glycerin-23-blackblackebony-d-110476096': 'glycerin-23-blackblackebony-d-110476154',
        'glycerin-23-blackblackebony-d-120465133': 'glycerin-23-blackblackebony-d-120465111',
        'glycerin-23-blackebonybiscuit-d-110476096': 'glycerin-23-blackebonybiscuit-d-110476154',
        'glycerin-23-blackgreywhite-120465133': 'glycerin-23-blackgreywhite-120465111',
        'glycerin-23-blackgreywhite-2e-110476096': 'glycerin-23-blackgreywhite-2e-110476154',
        'glycerin-23-blackgreywhite-d-110476096': 'glycerin-23-blackgreywhite-d-110476154',
        'glycerin-23-blackgreywhite-d-120465133': 'glycerin-23-blackgreywhite-d-120465111',
        'glycerin-23-bluespellboundstarfish-d-110476096': 'glycerin-23-bluespellboundstarfish-d-110476154',
        'glycerin-23-coconutbleached-sandgrey-d-110476096': 'glycerin-23-coconutbleached-sandgrey-d-110476154',
        'glycerin-23-coconutsandskyway-120465133': 'glycerin-23-coconutsandskyway-120465111',
        'glycerin-23-greyblackened-pearlblack-2e-110476096': 'glycerin-23-greyblackened-pearlblack-2e-110476154',
        'glycerin-23-greyblackened-pearlblack-4e-110476096': 'glycerin-23-greyblackened-pearlblack-4e-110476154',
        'glycerin-23-greyblackened-pearlblack-d-110476096': 'glycerin-23-greyblackened-pearlblack-d-110476154',
        'glycerin-23-skywayblazing-bellpink-120465133': 'glycerin-23-skywayblazing-bellpink-120465111',
        'glycerin-23-spellboundyuccapink-120465133': 'glycerin-23-spellboundyuccapink-120465111',
        'glycerin-23-spellboundyuccapink-2e-120465133': 'glycerin-23-spellboundyuccapink-2e-120465111',
        'glycerin-23-spellboundyuccapink-d-120465133': 'glycerin-23-spellboundyuccapink-d-120465111',
        'glycerin-23-whiteblackgum-2e-110476096': 'glycerin-23-whiteblackgum-2e-110476154',
        'glycerin-23-whiteblackgum-d-110476096': 'glycerin-23-whiteblackgum-d-110476154',
        'glycerin-23-whiteharbor-mistmetallic-120465133': 'glycerin-23-whiteharbor-mistmetallic-120465111',
        'glycerin-23-whiteharbor-mistmetallic-d-120465133': 'glycerin-23-whiteharbor-mistmetallic-d-120465111',
        'glycerin-23-whiteoystersilver-120465133': 'glycerin-23-whiteoystersilver-120465111',
        'glycerin-23-whiteoystersilver-d-120465133': 'glycerin-23-whiteoystersilver-d-120465111',
        'glycerin-23-whitephantomcyber-pink-120465133': 'glycerin-23-whitephantomcyber-pink-120465111',
        'glycerin-23-whitephantomgreen-gecko-d-110476096': 'glycerin-23-whitephantomgreen-gecko-d-110476154',
        'glycerin-flex-blackwhite-120467628': 'glycerin-flex-blackwhite-120467018',
        'glycerin-flex-coconutchateauportabella-120467628': 'glycerin-flex-coconutchateauportabella-120467018',
        'glycerin-flex-coconutstarfishchateau-d-110478114': 'glycerin-flex-coconutstarfishchateau-d-110478196',
        'glycerin-flex-harbor-mistpoppy-seedpink-120467628': 'glycerin-flex-harbor-mistpoppy-seedpink-120467018',
        'glycerin-flex-skywaycyber-pinkblazing-bell-120467628': 'glycerin-flex-skywaycyber-pinkblazing-bell-120467018',
        'glycerin-flex-spellboundstarfishcoconut-d-110478114': 'glycerin-flex-spellboundstarfishcoconut-d-110478196',
        'glycerin-flex-whiteblackgum-120467628': 'glycerin-flex-whiteblackgum-120467018',
        'glycerin-flex-whiteblackgum-d-110478114': 'glycerin-flex-whiteblackgum-d-110478196',
        'glycerin-flex-whitecyber-pinkargyle-120467628': 'glycerin-flex-whitecyber-pinkargyle-120467018',
        'glycerin-flex-whitegreen-geckophantom-d-110478114': 'glycerin-flex-whitegreen-geckophantom-d-110478196',
        'glycerin-gts-23-spellboundyuccapink-120492090': 'glycerin-gts-23-spellboundyuccapink-120492453',
        'glycerin-gts-23-spellboundyuccapink-2e-120492090': 'glycerin-gts-23-spellboundyuccapink-2e-120492453',
        'glycerin-gts-23-spellboundyuccapink-d-120492090': 'glycerin-gts-23-spellboundyuccapink-d-120492453',
        'glycerin-gts-23-whiteharbor-mistmetallic-120492090': 'glycerin-gts-23-whiteharbor-mistmetallic-120492453',
        'glycerin-gts-23-whiteharbor-mistmetallic-d-120492090': 'glycerin-gts-23-whiteharbor-mistmetallic-d-120492453'

        // NOTE: glycerin-gts-23-blackgreywhite is intentionally absent. In the feed it
        // arrives as glycerin-gts-23-blackgreywhite-d-110503844 (110xxx = Men's), but the
        // live product is the women's descriptive handle brooks-womens-glycerin-gts-23-
        // black-grey-white. Confirm the correct live handle/gender, then add a line.
        // NOTE: glycerin-gts-23-whitephantomcyber-pink-120492453 is live but not in the
        // current feed (only the green-gecko GTS colorway is present). Add once listed.
        //
        // This Glycerin 23 / GTS 23 / Flex table was regenerated by matching each feed
        // handle to its live product on colorway + width + gender (110/120). It corrected
        // two gender-flipped lines (blackblackebony-d, blackgreywhite-d) and added the
        // missing same-width counterparts. Regenerate from a full Shopify export when a
        // new model generation launches.
    },

    // ========== REMAP HANDLE ==========
    remapHandle: function(handle) {
        return this.handleRemap[handle] || handle;
    },

    // ========== REMAP TARGETS (canonical live handles) ==========
    // Every value in handleRemap is, by definition, a handle that an existing
    // Shopify product already uses. Build the set of those targets once so
    // resolveHandle can trust them even when they are not present in the
    // existingHandles snapshot. This is what was missing: existingHandles was
    // captured before the Glycerin 23 / GTS 23 / Flex generation launched, so a
    // correctly-remapped handle was being rejected and rebuilt into a brand-new
    // "brooks-mens-glycerin-23-..." handle the store does not have, which the
    // inventory import then silently skipped.
    remapTargets: function() {
        if (!this._remapTargets) {
            this._remapTargets = new Set();
            for (var k in this.handleRemap) {
                this._remapTargets.add(this.handleRemap[k]);
            }
        }
        return this._remapTargets;
    },

    // ========== BROOKS CATEGORY MAPPING ==========
    productCategories: {
        'Neutral Running': [
            'GHOST 17', 'GHOST 18', 'GHOST MAX 3', 'GLYCERIN 22', 'GLYCERIN 23', 'GLYCERIN FLEX', 'GLYCERIN MAX 2'
        ],
        'Stability Running': [
            'GLYCERIN GTS 22', 'GLYCERIN GTS 23', 'ADRENALINE GTS 25', 'ADRENALINE GTS 24 GTX', 'ARIEL GTS 26'
        ]
    },

    // ========== DERIVE GENDER FROM STYLE CODE ==========
    // Style code at end of handle: 110xxx = Men, 120xxx = Women
    getGender: function(handle) {
        var match = handle.match(/(\d{9})$/);
        if (match) {
            var prefix = match[1].substring(0, 3);
            if (prefix === '110') return "Men's";
            if (prefix === '120') return "Women's";
        }
        return '';
    },

    // ========== DERIVE WIDTH FROM HANDLE (GENDER-AWARE) ==========
    getWidth: function(handle, isWomen) {
        var match = handle.match(/-(2a|2e|4e|d|b|narrow)-\d{9}$/i);
        if (!match) return '';

        var code = match[1].toLowerCase();

        if (isWomen) {
            switch (code) {
                case '2a':     return 'Narrow';
                case 'b':      return '';
                case 'd':      return 'Wide';
                case '2e':     return 'Extra Wide';
                case '4e':     return 'Extra Extra Wide';
                case 'narrow': return 'Narrow';
                default:       return '';
            }
        } else {
            switch (code) {
                case 'b':      return 'Narrow';
                case 'd':      return '';
                case '2e':     return 'Wide';
                case '4e':     return 'Extra Wide';
                case 'narrow': return 'Narrow';
                default:       return '';
            }
        }
    },

    // ========== PARSE TITLE ==========
    parseTitle: function(title, handle) {
        if (!title) return { gender: '', model: '', color: '', width: '' };

        title = title.replace(/^"|"$/g, '').trim();

        var gender = this.getGender(handle || '');
        var isWomen = gender === "Women's";
        var width = this.getWidth(handle || '', isWomen);
        var model = '';
        var color = '';

        var dashIdx = title.lastIndexOf(' - ');
        if (dashIdx !== -1) {
            model = title.substring(0, dashIdx).trim();
            color = title.substring(dashIdx + 3).trim();
        } else {
            model = title.trim();
        }

        model = model.toUpperCase();

        return { gender: gender, model: model, color: color, width: width };
    },

    // ========== GET DISPLAY CATEGORY ==========
    getCategory: function(modelName) {
        for (var cat in this.productCategories) {
            if (this.productCategories[cat].indexOf(modelName) !== -1) {
                return cat;
            }
        }
        return 'Other';
    },

    // ========== IDENTIFY PRODUCT ==========
    // Called by InventoryTracker.compare() to figure out the model name for a
    // new colorway, so it can check whether the parent model already exists in
    // Firestore. Returns a string matching what scanFile() stores as the
    // picker's modelKey: gender + ' ' + UPPERCASE_MODEL.
    //
    // e.g. identifyProduct("Adrenaline GTS 25 - Black/Black/Ebony",
    //                      "adrenaline-gts-25-blackblackebony-110454044")
    //   -> "Men's ADRENALINE GTS 25"
    //
    // Returning null means "couldn't identify" — caller will treat as new product.
    identifyProduct: function(title, handle) {
        if (!title) return null;
        var info = this.parseTitle(title, handle || '');
        if (!info.model) return null;
        var prefix = info.gender ? (info.gender + ' ') : '';
        return prefix + info.model;
    },

    // ========== CLEAN TITLE (for product CSV + canonical handle) ==========
    // Rebuilds title as: "Brooks Men's Ghost 17 (Wide) - Black/White"
    cleanTitle: function(title, gender, width) {
        if (!title) return title;
        title = title.replace(/^"|"$/g, '').trim();

        var model = title;
        var color = '';
        var dashIdx = title.lastIndexOf(' - ');
        if (dashIdx !== -1) {
            model = title.substring(0, dashIdx).trim();
            color = title.substring(dashIdx + 3).trim();
        }

        var parts = ['Brooks'];
        if (gender) parts.push(gender);
        parts.push(model);
        if (width) parts[parts.length - 1] = parts[parts.length - 1] + ' (' + width + ')';

        var result = parts.join(' ');
        if (color) result += ' - ' + color;
        return result;
    },

    // ========== CLEAN HANDLE (for product CSV + canonical handle) ==========
    cleanHandle: function(cleanedTitle) {
        if (!cleanedTitle) return '';
        return cleanedTitle
            .toLowerCase()
            .replace(/[''()]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    },

    // ========== RESOLVE CANONICAL HANDLE ==========
    // The single source of truth for "what handle should this colorway have?"
    // Used by both scanFile() and convert() so picker, inventory CSV, product CSV,
    // and Firestore tracker all see the same value.
    //
    // Existing Shopify products keep their raw scraper handle (after remap). A
    // remap target counts as existing too, since it is by definition a handle a
    // live product already uses. New products get a clean title-based handle:
    // brooks-{gender}-{model}-{width}-{color}
    resolveHandle: function(rawHandle, title) {
        var remapped = this.remapHandle(rawHandle);
        if (this.existingHandles.has(remapped) || this.remapTargets().has(remapped)) {
            return remapped;
        }
        var info = this.parseTitle(title || '', remapped);
        var cleanedTitle = this.cleanTitle(title || '', info.gender, info.width);
        return this.cleanHandle(cleanedTitle);
    },

    // ========== SCAN FILE ==========
    scanFile: function(file) {
        var self = this;

        return new Promise(function(resolve, reject) {
            file.text().then(function(csvText) {
                var parsed = Papa.parse(csvText, { header: true });
                var allRows = parsed.data.filter(function(row) {
                    return row.Handle && row.Handle.trim() !== '';
                });

                self._rawRows = allRows;

                // Group by gender + model (so Men's and Women's show separately)
                var productsByModel = new Map();

                allRows.forEach(function(row) {
                    var rawHandle = row.Handle.trim();
                    var canonicalHandle = self.resolveHandle(rawHandle, row.Title || '');
                    var titleInfo = self.parseTitle(row.Title || '', self.remapHandle(rawHandle));
                    var genderPrefix = titleInfo.gender ? (titleInfo.gender + ' ') : '';
                    var modelKey = genderPrefix + (titleInfo.model || 'Unknown');
                    var qty = parseInt(row['On hand (new)'] || '0') || 0;

                    if (!productsByModel.has(modelKey)) {
                        productsByModel.set(modelKey, {
                            model: titleInfo.model || 'Unknown',
                            modelKey: modelKey,
                            gender: titleInfo.gender,
                            category: self.getCategory(titleInfo.model || ''),
                            colorways: new Map(),
                            totalRows: 0,
                            totalInventory: 0
                        });
                    }

                    var modelData = productsByModel.get(modelKey);
                    modelData.totalRows++;
                    modelData.totalInventory += qty;

                    if (!modelData.colorways.has(canonicalHandle)) {
                        modelData.colorways.set(canonicalHandle, {
                            handle: canonicalHandle,
                            title: row.Title || '',
                            color: titleInfo.color,
                            width: titleInfo.width,
                            rows: 0,
                            inventory: 0
                        });
                    }

                    var cw = modelData.colorways.get(canonicalHandle);
                    cw.rows++;
                    cw.inventory += qty;
                });

                var products = [];
                productsByModel.forEach(function(data) {
                    products.push({
                        name: data.modelKey,
                        model: data.model,
                        gender: data.gender,
                        category: data.category,
                        colorways: Array.from(data.colorways.values()),
                        rowCount: data.totalRows,
                        totalInventory: data.totalInventory
                    });
                });

                products.sort(function(a, b) {
                    var catComp = (a.category || '').localeCompare(b.category || '');
                    if (catComp !== 0) return catComp;
                    return a.name.localeCompare(b.name);
                });

                self.scannedProducts = products;
                resolve(products);
            }).catch(reject);
        });
    },

    // ========== CONVERT ==========
    convert: function(file) {
        var self = this;

        return new Promise(function(resolve, reject) {
            file.text().then(function(csvText) {
                var parsed = Papa.parse(csvText, { header: true });
                var allRows = parsed.data.filter(function(row) {
                    return row.Handle && row.Handle.trim() !== '';
                });

                var inventory = [];
                var productVariantData = [];

                allRows.forEach(function(row) {
                    var rawHandle = row.Handle.trim();
                    var canonicalHandle = self.resolveHandle(rawHandle, row.Title || '');
                    // parseTitle expects the remapped (raw-style) handle so it can
                    // pull gender/width from the style code suffix, even for new
                    // products whose canonical handle is the cleaned form.
                    var titleInfo = self.parseTitle(row.Title || '', self.remapHandle(rawHandle));
                    var genderPrefix = titleInfo.gender ? (titleInfo.gender + ' ') : '';
                    var modelKey = genderPrefix + (titleInfo.model || 'Unknown');

                    // Filter by picker selection
                    if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) {
                        return;
                    }

                    var qty = row['On hand (new)'] || '0';

                    var inventoryRow = {
                        'Handle': canonicalHandle,
                        'Title': row.Title || '',
                        'Option1 Name': row['Option1 Name'] || 'Size',
                        'Option1 Value': row['Option1 Value'] || '',
                        'Option2 Name': '',
                        'Option2 Value': '',
                        'Option3 Name': row['Option3 Name'] || '',
                        'Option3 Value': row['Option3 Value'] || '',
                        'SKU': row.SKU || '',
                        'Barcode': row.Barcode || '',
                        'HS Code': row['HS Code'] || '',
                        'COO': row.COO || '',
                        'Location': row.Location || 'Needham',
                        'Bin name': row['Bin name'] || '',
                        'On hand (new)': qty
                    };

                    inventory.push(inventoryRow);

                    productVariantData.push([inventoryRow, {
                        handle: canonicalHandle,
                        title: row.Title || '',
                        gender: titleInfo.gender,
                        model: titleInfo.model,
                        color: titleInfo.color,
                        width: titleInfo.width,
                        category: self.getCategory(titleInfo.model),
                        sku: row.SKU || '',
                        size: row['Option1 Value'] || '',
                        quantity: qty,
                        barcode: row.Barcode || ''
                    }]);
                });

                self.inventoryData = inventory;
                self.productVariantData = productVariantData;
                resolve(inventory);
            }).catch(reject);
        });
    },

    // ========== GENERATE INVENTORY CSV ==========
    generateInventoryCSV: function() {
        var headers = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
            '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
            '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
            '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];

        var csvRows = [headers.join(',')];

        this.inventoryData.forEach(function(row) {
            var csvRow = [
                row.Handle,
                '"' + (row.Title || '').replace(/"/g, '""') + '"',
                row['Option1 Name'] || 'Size',
                row['Option1 Value'] || '',
                '',
                '',
                row['Option3 Name'] || '',
                row['Option3 Value'] || '',
                row.SKU || '',
                row.Barcode || '',
                row['HS Code'] || '',
                row.COO || '',
                row.Location || 'Needham',
                row['Bin name'] || '',
                '', '', '', '', '',
                row['On hand (new)'] || '0'
            ];
            csvRows.push(csvRow.join(','));
        });

        return csvRows.join('\n');
    },

    // ========== GENERATE NEW PRODUCT CSV ==========
    generateNewProductCSV: function(comparison) {
        if (!comparison) return null;

        var self = this;
        var newHandles = new Set();
        if (comparison.newProducts) {
            comparison.newProducts.forEach(function(p) { newHandles.add(p.handle); });
        }
        if (comparison.newColorways) {
            comparison.newColorways.forEach(function(c) { newHandles.add(c.handle); });
        }

        if (newHandles.size === 0) return null;
        if (!this.productVariantData || this.productVariantData.length === 0) return null;

        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status',
            'SKU', 'Barcode',
            'Option1 name', 'Option1 value', 'Option1 Linked To',
            'Option2 name', 'Option2 value', 'Option2 Linked To',
            'Option3 name', 'Option3 value', 'Option3 Linked To',
            'Price', 'Compare-at price', 'Cost per item',
            'Charge tax', 'Tax code',
            'Unit price total measure', 'Unit price total measure unit',
            'Unit price base measure', 'Unit price base measure unit',
            'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
            'Weight value (grams)', 'Weight unit for display',
            'Requires shipping', 'Fulfillment service',
            'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
            'Gift card',
            'SEO title', 'SEO description',
            'Color (product.metafields.shopify.color-pattern)',
            'Google Shopping / Google product category',
            'Google Shopping / Gender', 'Google Shopping / Age group',
            'Google Shopping / Manufacturer part number (MPN)',
            'Google Shopping / Ad group name', 'Google Shopping / Ads labels',
            'Google Shopping / Condition', 'Google Shopping / Custom product',
            'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
            'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3',
            'Google Shopping / Custom label 4'
        ];

        var productGroups = new Map();

        this.productVariantData.forEach(function(entry) {
            var variantData = entry[1];
            if (!newHandles.has(variantData.handle)) return;

            if (!productGroups.has(variantData.handle)) {
                productGroups.set(variantData.handle, {
                    handle: variantData.handle,
                    title: variantData.title,
                    model: variantData.model,
                    gender: variantData.gender,
                    color: variantData.color,
                    width: variantData.width,
                    category: variantData.category,
                    variants: []
                });
            }

            productGroups.get(variantData.handle).variants.push({
                size: variantData.size,
                sku: variantData.sku,
                barcode: variantData.barcode || '',
                quantity: variantData.quantity
            });
        });

        if (productGroups.size === 0) return null;

        var csvRows = [];

        productGroups.forEach(function(product) {
            var gGender = 'Unisex';
            if (product.gender === "Men's") gGender = 'Male';
            else if (product.gender === "Women's") gGender = 'Female';

            var cleanedTitle = self.cleanTitle(product.title, product.gender, product.width);
            // URL handle is the canonical handle from convert() — guaranteed to
            // match the inventory CSV. For products this is brooks-{gender}-...
            var cleanedHandle = product.handle;

            var tags = ['Brooks', product.model];
            if (product.gender) tags.push(product.gender.replace("'s", ''));
            if (product.width) tags.push(product.width);
            if (product.category) tags.push(product.category);

            var productType = "Unisex Shoes";
            if (product.gender === "Men's") productType = "Men's Shoes";
            else if (product.gender === "Women's") productType = "Women's Shoes";

            product.variants.forEach(function(variant, idx) {
                var row = {};

                if (idx === 0) {
                    row['Title'] = cleanedTitle;
                    row['URL handle'] = cleanedHandle;
                    row['Description'] = '';
                    row['Vendor'] = 'Brooks';
                    row['Product category'] = 'Apparel & Accessories > Shoes';
                    row['Type'] = productType;
                    row['Tags'] = tags.join(', ');
                    row['Published on online store'] = 'FALSE';
                    row['Status'] = 'Draft';
                    row['Option1 name'] = 'Size';
                    row['SEO title'] = cleanedTitle;
                    row['SEO description'] = cleanedTitle;
                    row['Google Shopping / Google product category'] = 'Apparel & Accessories > Shoes';
                    row['Google Shopping / Gender'] = gGender;
                    row['Google Shopping / Age group'] = 'Adult (13+ years old)';
                    row['Google Shopping / Condition'] = 'New';
                    row['Google Shopping / Custom product'] = 'FALSE';
                    row['Google Shopping / Custom label 0'] = product.model;
                } else {
                    row['URL handle'] = cleanedHandle;
                }

                row['Option1 value'] = variant.size;
                row['SKU'] = variant.sku;
                row['Barcode'] = variant.barcode;
                row['Price'] = '';
                row['Charge tax'] = 'TRUE';
                row['Inventory tracker'] = 'shopify';
                row['Inventory quantity'] = variant.quantity;
                row['Continue selling when out of stock'] = 'DENY';
                row['Requires shipping'] = 'TRUE';
                row['Fulfillment service'] = 'manual';
                row['Gift card'] = 'FALSE';

                csvRows.push(row);
            });
        });

        var headerLine = headers.map(function(h) { return '"' + h.replace(/"/g, '""') + '"'; }).join(',');
        var lines = [headerLine];

        csvRows.forEach(function(row) {
            var values = headers.map(function(h) {
                var val = row[h] !== undefined ? String(row[h]) : '';
                return '"' + val.replace(/"/g, '""') + '"';
            });
            lines.push(values.join(','));
        });

        return lines.join('\n');
    }
};
