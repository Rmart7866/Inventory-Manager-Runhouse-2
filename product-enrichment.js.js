// ========== PRODUCT ENRICHMENT MODAL ==========
// Intercepts "Download NEW Products CSV" and shows a per-model
// review/edit screen for price, description, tags, and SEO.
// Saves entries to Firestore so they pre-fill next time.

var ProductEnrichment = {

    // Brand default prices — editable from the UI, stored in Firestore
    brandDefaults: {
        saucony:    { price: '150.00', vendor: 'Saucony' },
        hoka:       { price: '160.00', vendor: 'HOKA' },
        brooks:     { price: '140.00', vendor: 'Brooks' },
        asics:      { price: '140.00', vendor: 'ASICS' },
        puma:       { price: '120.00', vendor: 'Puma' },
        on:         { price: '160.00', vendor: 'ON Running' },
        newbalance: { price: '140.00', vendor: 'New Balance' },
    },

    // Model category map for auto-generating descriptions
    modelCategories: {
        // Saucony
        'GUIDE': 'stability', 'HURRICANE': 'stability', 'TEMPEST': 'stability',
        'RIDE': 'neutral', 'TRIUMPH': 'neutral', 'KINVARA': 'neutral',
        'ENDORPHIN SPEED': 'performance', 'ENDORPHIN PRO': 'racing', 'ENDORPHIN ELITE': 'racing',
        // HOKA
        'ARAHI': 'stability', 'GAVIOTA': 'stability',
        'CLIFTON': 'neutral', 'BONDI': 'neutral max cushion', 'SKYFLOW': 'neutral',
        'MACH': 'performance', 'SPEEDGOAT': 'trail',
        // Brooks
        'ADRENALINE GTS': 'stability', 'TRACE': 'stability',
        'GHOST': 'neutral', 'GLYCERIN': 'neutral max cushion', 'LAUNCH': 'neutral',
        // ASICS
        'GEL-KAYANO': 'stability', 'GT-2000': 'stability',
        'GEL-NIMBUS': 'neutral max cushion', 'GEL-CUMULUS': 'neutral', 'NOVABLAST': 'performance',
        // ON
        'CLOUDRUNNER': 'stability', 'CLOUDFLYER': 'stability',
        'CLOUDSURFER': 'neutral', 'CLOUDMONSTER': 'neutral max cushion', 'CLOUDSWIFT': 'performance',
        // Puma
        'DEVIATE NITRO': 'performance', 'VELOCITY NITRO': 'neutral', 'MAGNIFY NITRO': 'neutral max cushion',
    },

    // ========== FIRESTORE ==========
    _col: function(brand) {
        return db.collection('product-defaults').doc(brand).collection('models');
    },
    _brandDoc: function(brand) {
        return db.collection('product-defaults').doc(brand);
    },

    loadBrandDefault: async function(brand) {
        try {
            var snap = await this._brandDoc(brand).get();
            if (snap.exists && snap.data().defaultPrice) {
                this.brandDefaults[brand].price = snap.data().defaultPrice;
            }
        } catch(e) { /* use hardcoded default */ }
        return this.brandDefaults[brand].price;
    },

    saveBrandDefault: async function(brand, price) {
        this.brandDefaults[brand].price = price;
        await this._brandDoc(brand).set({ defaultPrice: price, updatedAt: new Date().toISOString() }, { merge: true });
    },

    loadModelDefault: async function(brand, modelKey) {
        try {
            var snap = await this._col(brand).doc(modelKey).get();
            if (snap.exists) return snap.data();
        } catch(e) {}
        return null;
    },

    saveModelDefault: async function(brand, modelKey, data) {
        try {
            await this._col(brand).doc(modelKey).set(
                Object.assign({}, data, { updatedAt: new Date().toISOString() }),
                { merge: true }
            );
        } catch(e) { console.warn('[Enrichment] Could not save model default:', e); }
    },

    // ========== MODEL EXTRACTION ==========
    // Pulls model-level groupings from a converter's productVariantData + comparison
    extractModels: function(brand, converter, comparison) {
        var newHandles = new Set();
        if (comparison.newProducts) comparison.newProducts.forEach(function(p) { newHandles.add(p.handle); });
        if (comparison.newColorways) comparison.newColorways.forEach(function(c) { newHandles.add(c.handle); });
        if (newHandles.size === 0) return [];

        // Group colorways by model name
        var modelMap = new Map(); // modelKey → { modelName, brand, colorways[] }

        if (!converter.productVariantData || !converter.productVariantData.length) return [];

        var self = this;
        converter.productVariantData.forEach(function(entry) {
            var v = entry[1];
            if (!newHandles.has(v.handle)) return;

            // Get model name — differs by brand
            var modelName = v.model || v.matchingProduct || '';
            if (!modelName) return;

            // Strip gender prefix to get clean model name for grouping
            var cleanModel = modelName
                .replace(/^(men'?s?|women'?s?|unisex)\s+/i, '')
                .replace(/\s*(wide|extra wide|2e|4e)\s*$/i, '')
                .trim();

            var modelKey = cleanModel.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            if (!modelMap.has(modelKey)) {
                modelMap.set(modelKey, {
                    modelKey: modelKey,
                    modelName: cleanModel,
                    brand: brand,
                    colorways: new Map(),
                    totalVariants: 0,
                });
            }
            var m = modelMap.get(modelKey);
            if (!m.colorways.has(v.handle)) {
                m.colorways.set(v.handle, {
                    handle: v.handle,
                    title: v.title || '',
                    color: v.color || v.colorway || '',
                    gender: v.gender || '',
                    width: v.width || '',
                    variantCount: 0,
                });
            }
            m.colorways.get(v.handle).variantCount++;
            m.totalVariants++;
        });

        return Array.from(modelMap.values()).map(function(m) {
            return Object.assign({}, m, { colorways: Array.from(m.colorways.values()) });
        }).sort(function(a, b) { return a.modelName.localeCompare(b.modelName); });
    },

    // Auto-generate description for a model
    autoDescription: function(brand, modelName) {
        var upper = modelName.toUpperCase();
        var category = 'running';
        for (var key in this.modelCategories) {
            if (upper.indexOf(key) !== -1) { category = this.modelCategories[key]; break; }
        }
        var vendor = (this.brandDefaults[brand] || {}).vendor || brand;
        var widthNote = '';
        if (upper.indexOf('WIDE') !== -1 || upper.indexOf('2E') !== -1 || upper.indexOf('4E') !== -1) {
            widthNote = ' in wide width options';
        }
        return '<p>The ' + vendor + ' ' + modelName + ' is a premium ' + category + ' shoe'
            + widthNote + ' available at The Run House. '
            + 'Engineered for everyday runners who demand comfort and performance, '
            + 'the ' + modelName + ' delivers a smooth, responsive ride mile after mile.</p>';
    },

    autoSEOTitle: function(brand, modelName, gender) {
        var vendor = (this.brandDefaults[brand] || {}).vendor || brand;
        var upper = modelName.toUpperCase();
        var category = 'Running Shoe';
        for (var key in this.modelCategories) {
            if (upper.indexOf(key) !== -1) {
                var cat = this.modelCategories[key];
                if (cat === 'stability') category = 'Stability Running Shoe';
                else if (cat === 'neutral max cushion') category = 'Max Cushion Running Shoe';
                else if (cat === 'performance') category = 'Performance Running Shoe';
                else if (cat === 'trail') category = 'Trail Running Shoe';
                else if (cat === 'racing') category = 'Racing Shoe';
                else category = 'Running Shoe';
                break;
            }
        }
        var gPrefix = gender ? gender + ' ' : '';
        return gPrefix + vendor + ' ' + modelName + ' | ' + category;
    },

    // ========== OPEN MODAL ==========
    open: async function(brand, converter, comparison, onConfirm) {
        var self = this;
        var models = this.extractModels(brand, converter, comparison);
        if (models.length === 0) { onConfirm({}); return; }

        // Load brand default price
        var defaultPrice = await this.loadBrandDefault(brand);

        // Load saved model defaults from Firestore
        var savedDefaults = {};
        for (var i = 0; i < models.length; i++) {
            var saved = await this.loadModelDefault(brand, models[i].modelKey);
            if (saved) savedDefaults[models[i].modelKey] = saved;
        }

        // Build modal HTML
        var overlay = document.createElement('div');
        overlay.id = 'enrichment-overlay';
        overlay.innerHTML = self._buildModalHTML(brand, models, defaultPrice, savedDefaults);
        document.body.appendChild(overlay);

        // Bind events
        document.getElementById('enrich-cancel').onclick = function() { overlay.remove(); };
        document.getElementById('enrich-confirm').onclick = async function() {
            await self._handleConfirm(brand, models, defaultPrice, overlay, onConfirm);
        };
        document.getElementById('enrich-brand-price').addEventListener('change', function() {
            var newPrice = this.value;
            // Update all model price fields that haven't been manually changed
            document.querySelectorAll('.enrich-price[data-default="true"]').forEach(function(el) {
                el.value = newPrice;
            });
        });

        // Expand/collapse colorway list
        overlay.addEventListener('click', function(e) {
            if (e.target.classList.contains('enrich-toggle')) {
                var key = e.target.dataset.model;
                var list = document.getElementById('enrich-colorways-' + key);
                if (list) {
                    var visible = list.style.display !== 'none';
                    list.style.display = visible ? 'none' : 'block';
                    e.target.textContent = visible ? '▶ Show colorways' : '▼ Hide colorways';
                }
            }
            // Track manual price edits
            if (e.target.classList.contains('enrich-price')) {
                e.target.dataset.default = 'false';
            }
        });
    },

    _buildModalHTML: function(brand, models, defaultPrice, savedDefaults) {
        var self = this;
        var vendor = (this.brandDefaults[brand] || {}).vendor || brand;
        var brandColor = {
            saucony: '#e94f1d', hoka: '#0891b2', brooks: '#1e3a5f',
            asics: '#1d4ed8', puma: '#dc2626', on: '#27272a', newbalance: '#dc2626'
        }[brand] || '#18181b';

        var modelCards = models.map(function(m) {
            var saved = savedDefaults[m.modelKey] || {};
            var price = saved.price || defaultPrice;
            var desc = saved.description || self.autoDescription(brand, m.modelName);
            var tags = saved.tags || (vendor + ', ' + m.modelName);
            var seoTitle = saved.seoTitle || self.autoSEOTitle(brand, m.modelName, '');
            var seoDesc = saved.seoDesc || desc.replace(/<[^>]+>/g, '').substring(0, 160);

            var colorwayRows = m.colorways.map(function(c) {
                return '<div class="enrich-cw-row">'
                    + '<span class="enrich-cw-title">' + c.title + '</span>'
                    + '<span class="enrich-cw-meta">' + c.variantCount + ' sizes</span>'
                    + '</div>';
            }).join('');

            return '<div class="enrich-card" data-model="' + m.modelKey + '">'
                + '<div class="enrich-card-head">'
                + '<div class="enrich-card-title">' + m.modelName
                    + ' <span class="enrich-cw-count">' + m.colorways.length + ' colorway' + (m.colorways.length !== 1 ? 's' : '') + '</span>'
                + '</div>'
                + '<button class="enrich-toggle" data-model="' + m.modelKey + '">▶ Show colorways</button>'
                + '</div>'
                + '<div class="enrich-colorways" id="enrich-colorways-' + m.modelKey + '" style="display:none">'
                + colorwayRows
                + '</div>'
                + '<div class="enrich-fields">'
                + '<div class="enrich-field-row">'
                + '<label>Price</label>'
                + '<input class="enrich-input enrich-price" data-model="' + m.modelKey + '" data-default="true" type="text" value="' + price + '" placeholder="0.00">'
                + '</div>'
                + '<div class="enrich-field-row">'
                + '<label>Tags</label>'
                + '<input class="enrich-input enrich-tags" data-model="' + m.modelKey + '" type="text" value="' + tags.replace(/"/g, '&quot;') + '">'
                + '</div>'
                + '<div class="enrich-field-row">'
                + '<label>SEO Title</label>'
                + '<input class="enrich-input enrich-seo-title" data-model="' + m.modelKey + '" type="text" value="' + seoTitle.replace(/"/g, '&quot;') + '">'
                + '</div>'
                + '<div class="enrich-field-row">'
                + '<label>SEO Description</label>'
                + '<input class="enrich-input enrich-seo-desc" data-model="' + m.modelKey + '" type="text" value="' + seoDesc.replace(/"/g, '&quot;') + '">'
                + '</div>'
                + '<div class="enrich-field-row enrich-field-desc">'
                + '<label>Description (HTML)</label>'
                + '<textarea class="enrich-textarea enrich-description" data-model="' + m.modelKey + '">' + desc.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>'
                + '</div>'
                + '</div>'
                + '</div>';
        }).join('');

        return '<div class="enrich-modal">'
            + '<div class="enrich-header" style="background:' + brandColor + '">'
            + '<div>'
            + '<div class="enrich-header-title">New Product Enrichment</div>'
            + '<div class="enrich-header-sub">' + vendor + ' · ' + models.length + ' model' + (models.length !== 1 ? 's' : '') + ' · ' + models.reduce(function(t, m) { return t + m.colorways.length; }, 0) + ' colorways</div>'
            + '</div>'
            + '<div class="enrich-brand-price-wrap">'
            + '<label>Brand default price</label>'
            + '<input id="enrich-brand-price" class="enrich-input enrich-input-sm" type="text" value="' + defaultPrice + '">'
            + '</div>'
            + '</div>'
            + '<div class="enrich-body">'
            + modelCards
            + '</div>'
            + '<div class="enrich-footer">'
            + '<button id="enrich-cancel" class="enrich-btn enrich-btn-cancel">Cancel</button>'
            + '<button id="enrich-confirm" class="enrich-btn enrich-btn-confirm">Generate CSV →</button>'
            + '</div>'
            + '</div>';
    },

    _handleConfirm: async function(brand, models, defaultPrice, overlay, onConfirm) {
        var self = this;
        var btn = document.getElementById('enrich-confirm');
        btn.disabled = true; btn.textContent = 'Saving...';

        // Save new brand default price
        var newBrandPrice = document.getElementById('enrich-brand-price').value.trim();
        if (newBrandPrice && newBrandPrice !== defaultPrice) {
            await this.saveBrandDefault(brand, newBrandPrice);
        }

        // Collect enrichment data per model, save to Firestore
        var enrichmentMap = {};
        for (var i = 0; i < models.length; i++) {
            var key = models[i].modelKey;
            var price = (document.querySelector('.enrich-price[data-model="' + key + '"]') || {}).value || newBrandPrice;
            var tags = (document.querySelector('.enrich-tags[data-model="' + key + '"]') || {}).value || '';
            var seoTitle = (document.querySelector('.enrich-seo-title[data-model="' + key + '"]') || {}).value || '';
            var seoDesc = (document.querySelector('.enrich-seo-desc[data-model="' + key + '"]') || {}).value || '';
            var descEl = document.querySelector('.enrich-description[data-model="' + key + '"]');
            var desc = descEl ? descEl.value.replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';

            enrichmentMap[key] = { price: price, tags: tags, description: desc, seoTitle: seoTitle, seoDesc: seoDesc };
            await self.saveModelDefault(brand, key, enrichmentMap[key]);
        }

        overlay.remove();
        onConfirm(enrichmentMap);
    },

    // ========== APPLY ENRICHMENT TO CSV ==========
    // Patches a generated CSV string with enrichment data keyed by model
    applyToCSV: function(csvString, brand, converter, enrichmentMap) {
        if (!csvString || !enrichmentMap || Object.keys(enrichmentMap).length === 0) return csvString;

        // Build handle → modelKey map from productVariantData
        var handleToModel = {};
        if (converter.productVariantData) {
            converter.productVariantData.forEach(function(entry) {
                var v = entry[1];
                var modelName = v.model || v.matchingProduct || '';
                var cleanModel = modelName
                    .replace(/^(men'?s?|women'?s?|unisex)\s+/i, '')
                    .replace(/\s*(wide|extra wide|2e|4e)\s*$/i, '')
                    .trim();
                var modelKey = cleanModel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                handleToModel[v.handle] = modelKey;
            });
        }

        var lines = csvString.split('\n');
        var headers = parseCSVLineEnrich(lines[0]);

        var handleIdx = headers.indexOf('URL handle');
        var priceIdx = headers.indexOf('Price');
        var descIdx = headers.indexOf('Description');
        var tagsIdx = headers.indexOf('Tags');
        var seoTitleIdx = headers.indexOf('SEO title');
        var seoDescIdx = headers.indexOf('SEO description');

        var result = [lines[0]];
        for (var i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            var cols = parseCSVLineEnrich(lines[i]);
            var handle = (cols[handleIdx] || '').replace(/^"|"$/g, '');
            if (!handle) { result.push(lines[i]); continue; }

            var modelKey = handleToModel[handle];
            var enrich = modelKey ? enrichmentMap[modelKey] : null;
            if (!enrich) { result.push(lines[i]); continue; }

            // Pad columns array if needed
            while (cols.length <= Math.max(priceIdx, descIdx, tagsIdx, seoTitleIdx, seoDescIdx)) {
                cols.push('""');
            }

            // Only stamp description/tags/seo on the first row of each product (where they're non-empty or it's the handle row)
            var isFirstRow = cols[descIdx] !== undefined;

            if (priceIdx >= 0) cols[priceIdx] = '"' + enrich.price + '"';
            if (descIdx >= 0 && enrich.description) cols[descIdx] = '"' + enrich.description.replace(/"/g, '""') + '"';
            if (tagsIdx >= 0 && enrich.tags) cols[tagsIdx] = '"' + enrich.tags.replace(/"/g, '""') + '"';
            if (seoTitleIdx >= 0 && enrich.seoTitle) cols[seoTitleIdx] = '"' + enrich.seoTitle.replace(/"/g, '""') + '"';
            if (seoDescIdx >= 0 && enrich.seoDesc) cols[seoDescIdx] = '"' + enrich.seoDesc.replace(/"/g, '""') + '"';

            result.push(cols.join(','));
        }
        return result.join('\n');
    },
};

// Simple CSV line parser (handles quoted fields)
function parseCSVLineEnrich(line) {
    var cols = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { if (q && line[i+1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (ch === ',' && !q) { cols.push(cur); cur = ''; }
        else cur += ch;
    }
    cols.push(cur);
    return cols;
}

// ========== CSS ==========
(function() {
    var style = document.createElement('style');
    style.textContent = `
        #enrichment-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,.55);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; padding: 20px;
        }
        .enrich-modal {
            background: #fff; border-radius: 16px; width: 100%; max-width: 740px;
            max-height: 90vh; display: flex; flex-direction: column;
            box-shadow: 0 24px 60px rgba(0,0,0,.25); overflow: hidden;
        }
        .enrich-header {
            padding: 20px 24px; color: #fff;
            display: flex; align-items: center; justify-content: space-between; gap: 16px;
            flex-shrink: 0;
        }
        .enrich-header-title { font-size: 18px; font-weight: 800; }
        .enrich-header-sub { font-size: 13px; opacity: .8; margin-top: 2px; }
        .enrich-brand-price-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
        .enrich-brand-price-wrap label { font-size: 11px; font-weight: 600; opacity: .85; }

        .enrich-body { overflow-y: auto; padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 12px; }
        .enrich-body::-webkit-scrollbar { width: 5px; }
        .enrich-body::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 3px; }

        .enrich-card {
            border: 1px solid #e4e4e7; border-radius: 12px; overflow: hidden;
        }
        .enrich-card-head {
            padding: 12px 16px; background: #fafafa; border-bottom: 1px solid #e4e4e7;
            display: flex; align-items: center; justify-content: space-between;
        }
        .enrich-card-title { font-size: 15px; font-weight: 700; }
        .enrich-cw-count { font-size: 12px; font-weight: 500; color: #71717a; margin-left: 6px; }
        .enrich-toggle {
            background: none; border: 1px solid #d4d4d8; border-radius: 5px;
            padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer;
            font-family: inherit; color: #52525b; transition: all .15s;
        }
        .enrich-toggle:hover { background: #f4f4f5; }

        .enrich-colorways { background: #fafafa; border-bottom: 1px solid #e4e4e7; }
        .enrich-cw-row {
            display: flex; align-items: center; justify-content: space-between;
            padding: 5px 16px; border-bottom: 1px solid #f4f4f5; font-size: 12px;
        }
        .enrich-cw-row:last-child { border-bottom: none; }
        .enrich-cw-title { color: #3f3f46; }
        .enrich-cw-meta { color: #a1a1aa; font-size: 11px; }

        .enrich-fields { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
        .enrich-field-row { display: flex; align-items: flex-start; gap: 10px; }
        .enrich-field-row label {
            font-size: 11px; font-weight: 700; color: #71717a; text-transform: uppercase;
            letter-spacing: .4px; padding-top: 8px; width: 100px; flex-shrink: 0;
        }
        .enrich-input {
            flex: 1; padding: 7px 10px; border: 1px solid #e4e4e7; border-radius: 7px;
            font-size: 13px; font-family: inherit; outline: none; transition: border-color .15s;
            background: #fff;
        }
        .enrich-input:focus { border-color: #18181b; }
        .enrich-input-sm { width: 90px; flex: none; padding: 5px 8px; font-size: 13px; }
        .enrich-textarea {
            flex: 1; padding: 7px 10px; border: 1px solid #e4e4e7; border-radius: 7px;
            font-size: 12px; font-family: 'SF Mono', monospace; outline: none;
            transition: border-color .15s; resize: vertical; min-height: 72px; background: #fff;
        }
        .enrich-textarea:focus { border-color: #18181b; }

        .enrich-footer {
            padding: 16px 24px; border-top: 1px solid #e4e4e7;
            display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;
            background: #fafafa;
        }
        .enrich-btn {
            padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 700;
            cursor: pointer; font-family: inherit; border: none; transition: opacity .15s;
        }
        .enrich-btn:disabled { opacity: .5; cursor: not-allowed; }
        .enrich-btn-cancel { background: #f4f4f5; color: #52525b; }
        .enrich-btn-cancel:hover { background: #e4e4e7; }
        .enrich-btn-confirm { background: #18181b; color: #fff; }
        .enrich-btn-confirm:hover { opacity: .85; }
    `;
    document.head.appendChild(style);
})();