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

    // In-memory cache — persists for the page session
    _modelCache: {},
    _brandCache: {},

    // ========== FIRESTORE ==========
    _col: function(brand) {
        return db.collection('product-defaults').doc(brand).collection('models');
    },
    _brandDoc: function(brand) {
        return db.collection('product-defaults').doc(brand);
    },

    loadBrandDefault: async function(brand) {
        if (this._brandCache[brand] !== undefined) return this._brandCache[brand];
        try {
            var snap = await this._brandDoc(brand).get();
            if (snap.exists && snap.data().defaultPrice) {
                this.brandDefaults[brand].price = snap.data().defaultPrice;
            }
        } catch(e) { /* use hardcoded default */ }
        this._brandCache[brand] = this.brandDefaults[brand].price;
        return this._brandCache[brand];
    },

    saveBrandDefault: async function(brand, price) {
        this.brandDefaults[brand].price = price;
        this._brandCache[brand] = price;
        try {
            await this._brandDoc(brand).set({ defaultPrice: price, updatedAt: new Date().toISOString() }, { merge: true });
        } catch(e) { console.warn('[Enrichment] Could not save brand default:', e); }
    },

    loadModelDefault: async function(brand, modelKey) {
        var cacheKey = brand + '|' + modelKey;
        if (this._modelCache[cacheKey] !== undefined) return this._modelCache[cacheKey];
        try {
            var snap = await this._col(brand).doc(modelKey).get();
            var data = snap.exists ? snap.data() : null;
            this._modelCache[cacheKey] = data;
            return data;
        } catch(e) {}
        return null;
    },

    saveModelDefault: async function(brand, modelKey, data) {
        var cacheKey = brand + '|' + modelKey;
        var existing = this._modelCache[cacheKey];
        // Skip write if nothing changed
        var changed = !existing
            || existing.price !== data.price
            || existing.tags !== data.tags
            || existing.description !== data.description
            || existing.seoTitle !== data.seoTitle
            || existing.seoDesc !== data.seoDesc;
        if (!changed) return;
        var toSave = Object.assign({}, data, { updatedAt: new Date().toISOString() });
        this._modelCache[cacheKey] = toSave;
        try {
            await this._col(brand).doc(modelKey).set(toSave, { merge: true });
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
        // Returns empty string — user types their own description
        return '';
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

        // Stash the active context so a per-model Download button can rebuild a
        // single-model CSV from the current field values without re-opening.
        this._active = { brand: brand, converter: converter, comparison: comparison, models: models };

        // Load saved model defaults in parallel
        var savedDefaults = {};
        var modelSnaps = await Promise.all(
            models.map(function(m) { return self.loadModelDefault(brand, m.modelKey); })
        );
        models.forEach(function(m, i) {
            if (modelSnaps[i]) savedDefaults[m.modelKey] = modelSnaps[i];
        });

        // Attach live-catalog inheritance to each model. Keyed by the SAME string
        // the converter's identifyProduct returns (that is how CatalogClient keys
        // the index), so identify a colorway rather than using the genderless
        // modelName. Model-level fields (price, description) are width-independent.
        if (typeof CatalogClient !== 'undefined' && typeof CatalogClient.inheritForModel === 'function'
            && converter && typeof converter.identifyProduct === 'function') {
            models.forEach(function(m) {
                var c0 = m.colorways && m.colorways[0];
                if (!c0) return;
                var gModel = null;
                try { gModel = converter.identifyProduct(c0.title, c0.handle); } catch (e) { /* best effort */ }
                if (gModel) {
                    m._gModel = gModel; // stash for applyToCSV width-specific lookups
                    m.inherit = CatalogClient.inheritForModel(brand, gModel);
                }
            });
        }

        // Autofill MSRP from the bundled barcode files (per colorway style/code),
        // for brand-new models with no live sibling price to inherit.
        var handleSku = {};
        (converter.productVariantData || []).forEach(function (e) {
            var v = e[1]; if (v.handle && !handleSku[v.handle]) handleSku[v.handle] = v.sku || '';
        });
        models.forEach(function (m) {
            var c0 = m.colorways && m.colorways[0];
            if (c0) m.barcodePrice = self._barcodePriceFor(brand, handleSku[c0.handle] || '');
        });

        // Build modal HTML
        var overlay = document.createElement('div');
        overlay.id = 'enrichment-overlay';
        overlay.innerHTML = self._buildModalHTML(brand, models, defaultPrice, savedDefaults);
        document.body.appendChild(overlay);
        document.body.classList.add('enrich-open');

        // Bind events
        document.getElementById('enrich-cancel').onclick = function() { overlay.remove(); document.body.classList.remove('enrich-open'); };
        document.getElementById('enrich-confirm').onclick = async function() {
            await self._handleConfirm(brand, models, defaultPrice, overlay, onConfirm);
        };
        var createBtn = document.getElementById('enrich-create');
        if (createBtn) createBtn.onclick = function() { self.createInShopify(); };
        document.getElementById('enrich-brand-price').addEventListener('change', function() {
            var newPrice = this.value;
            // Update all model price fields that haven't been manually changed
            document.querySelectorAll('.enrich-price[data-default="true"]').forEach(function(el) {
                el.value = newPrice;
            });
        });

        // Expand/collapse colorway list + advanced fields
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
            if (e.target.classList.contains('enrich-advanced-toggle')) {
                var key = e.target.dataset.model;
                var adv = document.getElementById('enrich-adv-' + key);
                if (adv) {
                    var visible = adv.style.display !== 'none';
                    adv.style.display = visible ? 'none' : 'block';
                    e.target.textContent = visible ? '+ SEO & Description' : '− SEO & Description';
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
            // Price: saved edit, then the live sibling's price (carried models),
            // then the barcode-file MSRP (new models), then the brand default.
            var price = saved.price || (m.inherit && m.inherit.price) || m.barcodePrice || defaultPrice;
            var rawDesc = saved.description || '';
            // Strip outer <p> tags for display — user sees plain text, we re-wrap on save
            var desc = rawDesc.replace(/^<p>([\s\S]*)<\/p>$/i, '$1').trim();
            var tags = saved.tags || (vendor + ', ' + m.modelName);
            var seoTitle = saved.seoTitle || self.autoSEOTitle(brand, m.modelName, '');
            var seoDesc = saved.seoDesc || '';

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
                + '<button class="enrich-model-dl" title="Download just this model as its own CSV" onclick="ProductEnrichment.downloadModel(\'' + brand + '\',\'' + m.modelKey + '\')" style="margin-left:8px;font-size:11px;font-weight:700;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;cursor:pointer;">⬇ Download</button>'
                + (self._createEnabled() ? '<button class="enrich-model-create" title="Create just this model in Shopify" onclick="ProductEnrichment.createModel(\'' + brand + '\',\'' + m.modelKey + '\')" style="margin-left:6px;font-size:11px;font-weight:700;color:#fff;background:#008060;border:1px solid #008060;border-radius:6px;padding:4px 10px;cursor:pointer;">Create →</button>' : '')
                + '</div>'
                + '<div class="enrich-colorways" id="enrich-colorways-' + m.modelKey + '" style="display:none">'
                + colorwayRows
                + '</div>'
                + '<div class="enrich-fields">'
                + '<div class="enrich-row2">'
                + '<div class="enrich-field2"><label>Price</label><div class="enrich-price-wrap2"><span class="enrich-dollar">$</span><input class="enrich-input enrich-price" data-model="' + m.modelKey + '" data-default="true" type="text" value="' + price + '" placeholder="0.00"></div></div>'
                + '<div class="enrich-field2 enrich-field2-wide"><label>Tags</label><input class="enrich-input enrich-tags" data-model="' + m.modelKey + '" type="text" value="' + tags.replace(/"/g, '&quot;') + '" placeholder="Saucony, Guide 19, Stability..."></div>'
                + '</div>'
                + '<div class="enrich-advanced-toggle" data-model="' + m.modelKey + '">+ SEO &amp; Description</div>'
                + '<div class="enrich-advanced" id="enrich-adv-' + m.modelKey + '" style="display:none">'
                + '<div class="enrich-field-row"><label>SEO Title</label><input class="enrich-input enrich-seo-title" data-model="' + m.modelKey + '" type="text" value="' + seoTitle.replace(/"/g, '&quot;') + '" placeholder="e.g. Saucony Guide 19 | Stability Running Shoe"></div>'
                + '<div class="enrich-field-row"><label>SEO Desc</label><input class="enrich-input enrich-seo-desc" data-model="' + m.modelKey + '" type="text" value="' + seoDesc.replace(/"/g, '&quot;') + '" placeholder="160 char description for search engines..."></div>'
                + '<div class="enrich-field-row enrich-field-desc"><label>Description</label><textarea class="enrich-textarea enrich-description" data-model="' + m.modelKey + '" placeholder="Describe this shoe — features, feel, who it&#39;s for. Plain text is fine.">' + desc.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea></div>'
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
            + '<button id="enrich-confirm" class="enrich-btn enrich-btn-secondary">⬇ Download CSV</button>'
            + (self._createEnabled() ? '<button id="enrich-create" class="enrich-btn enrich-btn-confirm">Create in Shopify →</button>' : '')
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
            var descRaw = descEl ? descEl.value.trim() : '';
            // If user typed plain text (no HTML tags), wrap in <p>
            var desc = descRaw && !/<[a-z]/i.test(descRaw) ? '<p>' + descRaw + '</p>' : descRaw;

            enrichmentMap[key] = { price: price, tags: tags, description: desc, seoTitle: seoTitle, seoDesc: seoDesc };
            await self.saveModelDefault(brand, key, enrichmentMap[key]);
        }

        overlay.remove();
        document.body.classList.remove('enrich-open');
        onConfirm(enrichmentMap);
    },

    // Read the current modal field values for ONE model into an enrichment record.
    _readModelEnrichment: function(modelKey, fallbackPrice) {
        var val = function(cls) {
            var el = document.querySelector(cls + '[data-model="' + modelKey + '"]');
            return el ? el.value : '';
        };
        var descRaw = (val('.enrich-description') || '').trim();
        // If the user typed plain text (no HTML tags), wrap in <p> like confirm does.
        var desc = descRaw && !/<[a-z]/i.test(descRaw) ? '<p>' + descRaw + '</p>' : descRaw;
        return {
            price: val('.enrich-price') || fallbackPrice || '',
            tags: val('.enrich-tags'),
            description: desc,
            seoTitle: val('.enrich-seo-title'),
            seoDesc: val('.enrich-seo-desc'),
        };
    },

    // Download ONE model's new colorways as its own CSV, using whatever is
    // currently typed in the modal for that model. Leaves the modal open so the
    // user can download other models too.
    downloadModel: function(brand, modelKey) {
        var ctx = this._active;
        if (!ctx || ctx.brand !== brand) { alert('Open the new-products review first.'); return; }
        var model = null;
        for (var i = 0; i < ctx.models.length; i++) {
            if (ctx.models[i].modelKey === modelKey) { model = ctx.models[i]; break; }
        }
        if (!model) return;

        var brandPriceEl = document.getElementById('enrich-brand-price');
        var fallbackPrice = brandPriceEl ? brandPriceEl.value.trim() : '';
        var enrichmentMap = {};
        enrichmentMap[modelKey] = this._readModelEnrichment(modelKey, fallbackPrice);
        // Persist this model's defaults, best effort (never block the download).
        try { this.saveModelDefault(brand, modelKey, enrichmentMap[modelKey]); } catch (e) { /* ignore */ }

        // Generate the full new-product CSV, keep only this model's rows (safe to
        // line-split here: the pre-enrichment CSV has no multi-line fields), then
        // enrich+inherit the trimmed subset.
        var full = ctx.converter.generateNewProductCSV(ctx.comparison);
        if (!full) { alert('No new products to download.'); return; }
        var handleSet = {};
        model.colorways.forEach(function(c) { handleSet[c.handle] = true; });
        var filtered = this._filterCSVByHandles(full, handleSet);
        var csv = this.applyToCSV(filtered, brand, ctx.converter, enrichmentMap);

        var slug = String(model.modelName || modelKey).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        var name = brand + '-' + slug + '-new-' + (typeof getFormattedDate === 'function' ? getFormattedDate() : 'export') + '.csv';
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = name;
        link.click();
        if (typeof showToast === 'function') {
            showToast(model.modelName + ' downloaded (' + model.colorways.length + ' colorway' + (model.colorways.length !== 1 ? 's' : '') + ')');
        }
    },

    // Keep the header row + only the data rows whose 'URL handle' is in handleSet.
    // Operates on the pre-enrichment CSV (single-line records), so a plain split
    // is safe here.
    _filterCSVByHandles: function(csvString, handleSet) {
        var lines = csvString.split('\n');
        if (lines.length < 2) return csvString;
        var header = parseCSVLineEnrich(lines[0]);
        var hIdx = header.indexOf('URL handle');
        if (hIdx < 0) return csvString;
        var out = [lines[0]];
        for (var i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            var cols = parseCSVLineEnrich(lines[i]);
            var handle = (cols[hIdx] || '').replace(/^"|"$/g, '');
            if (handleSet[handle]) out.push(lines[i]);
        }
        return out.join('\n');
    },

    // ===================== STAGE 4: CREATE IN SHOPIFY =====================

    // Turn the current review into productSet specs. Reuses the enriched CSV (so
    // tags/type/description/price inheritance is identical to what a download
    // would produce), then layers on the custom.* metafields a CSV cannot carry
    // (color_name, width_class, gender), sourced from the converter's per-handle
    // data. Products are Size-only, matching the tool's existing new-product CSV;
    // width lives in the cw-group tag + width_class metafield.
    buildCreateSpecs: function (brand, converter, comparison, enrichmentMap) {
        var full = converter.generateNewProductCSV(comparison);
        if (!full) return [];
        var enriched = this.applyToCSV(full, brand, converter, enrichmentMap);
        var rows = parseCSVRecordsEnrich(enriched);
        if (rows.length < 2) return [];
        var H = rows[0], ix = {};
        ['Title', 'URL handle', 'Description', 'Vendor', 'Type', 'Tags', 'Price', 'SKU', 'Barcode', 'Option1 value'].forEach(function (n) { ix[n] = H.indexOf(n); });

        var info = {};
        (converter.productVariantData || []).forEach(function (e) {
            var v = e[1];
            if (v.handle && !info[v.handle]) info[v.handle] = { color: v.color || v.colorway || '', width: v.width || '', gender: v.gender || '' };
        });
        var normW = (typeof CatalogClient !== 'undefined' && CatalogClient._normWidth) ? CatalogClient._normWidth.bind(CatalogClient) : function () { return ''; };
        var normG = function (g) { g = String(g || '').toLowerCase(); return /wom/.test(g) ? "Women's" : /men/.test(g) ? "Men's" : /uni/.test(g) ? 'Unisex' : ''; };
        var get = function (r, name) { return (ix[name] >= 0 ? (r[ix[name]] || '') : '').replace(/^"|"$/g, ''); };

        var byHandle = {}, order = [];
        for (var i = 1; i < rows.length; i++) {
            var h = get(rows[i], 'URL handle').trim();
            if (!h) continue;
            if (!byHandle[h]) { byHandle[h] = []; order.push(h); }
            byHandle[h].push(rows[i]);
        }
        return order.map(function (h) {
            var rs = byHandle[h], first = rs[0], meta = info[h] || {};
            var variants = rs.map(function (r) {
                return { size: get(r, 'Option1 value').trim(), sku: get(r, 'SKU').trim(), barcode: get(r, 'Barcode').trim(), price: get(r, 'Price').trim() };
            }).filter(function (v) { return v.size; });
            var mf = [];
            if (meta.color) mf.push({ namespace: 'custom', key: 'color_name', type: 'single_line_text_field', value: meta.color });
            var wc = normW(meta.width); if (wc) mf.push({ namespace: 'custom', key: 'width_class', type: 'single_line_text_field', value: wc });
            var gg = normG(meta.gender); if (gg) mf.push({ namespace: 'custom', key: 'gender', type: 'single_line_text_field', value: gg });
            return {
                title: get(first, 'Title').trim(),
                handle: h,
                vendor: get(first, 'Vendor').trim(),
                productType: get(first, 'Type').trim(),
                descriptionHtml: get(first, 'Description'),
                tags: get(first, 'Tags').split(',').map(function (t) { return t.trim(); }).filter(Boolean),
                variants: variants,
                metafields: mf
            };
        }).filter(function (s) { return s.title && s.variants.length; });
    },

    // Stage 4 is not live for staff yet: the write gate + browser testing aren't
    // finished, and the production Worker has no write route. So the "Create in
    // Shopify" button is hidden unless the tool is pointed at a test Worker
    // (rhWorkerUrl set) or explicitly enabled (rhEnableCreate=1). Flip this when
    // Stage 4 ships.
    _createEnabled: function () {
        // Live for staff. Writes are gated server-side (create-only, draft-only);
        // to hide this again, return false.
        return true;
    },

    // Entry point from the "Create in Shopify" button. Collects the current field
    // values, builds specs, and opens the confirm dialog.
    createInShopify: function () {
        var ctx = this._active;
        if (!ctx) { alert('Open the new-products review first.'); return; }
        var bp = document.getElementById('enrich-brand-price');
        var fallback = bp ? bp.value.trim() : '';
        var map = {};
        var self = this;
        ctx.models.forEach(function (m) { map[m.modelKey] = self._readModelEnrichment(m.modelKey, fallback); });
        var specs = this.buildCreateSpecs(ctx.brand, ctx.converter, ctx.comparison, map);
        if (!specs.length) { alert('Nothing to create.'); return; }
        this.showCreateConfirm(ctx.brand, specs);
    },

    // Create just ONE model's colorways (one product line at a time), using the
    // current field values. Same confirm dialog, scoped to this model's handles.
    createModel: function (brand, modelKey) {
        var ctx = this._active;
        if (!ctx || ctx.brand !== brand) { alert('Open the new-products review first.'); return; }
        var model = null;
        for (var i = 0; i < ctx.models.length; i++) { if (ctx.models[i].modelKey === modelKey) { model = ctx.models[i]; break; } }
        if (!model) return;
        var bp = document.getElementById('enrich-brand-price');
        var fallback = bp ? bp.value.trim() : '';
        var self = this;
        var map = {};
        ctx.models.forEach(function (m) { map[m.modelKey] = self._readModelEnrichment(m.modelKey, fallback); });
        var handleSet = {};
        model.colorways.forEach(function (c) { handleSet[c.handle] = true; });
        var specs = this.buildCreateSpecs(brand, ctx.converter, ctx.comparison, map).filter(function (s) { return handleSet[s.handle]; });
        if (!specs.length) { alert('Nothing to create for ' + model.modelName + '.'); return; }
        this.showCreateConfirm(brand, specs);
    },

    // ===== IMAGE ASSETS (match photos to products by a per-brand colorway key) =====
    _imageIndex: null,   // { COLORWAYKEY: [File, ...] } for the folder just indexed
    _imageBrand: null,

    // The regex that pulls a colorway key out of BOTH an image filename and a
    // product SKU, per brand (they must agree). ON: the article code, which is
    // color-specific ("3WF30375314"). ASICS: style-color ("1012B939-501"), the
    // "-1.jpg" primary suffix and the trailing SKU size are ignored. A brand with
    // no pattern here simply gets no image matching.
    _imageKeyPatterns: {
        on:    /\d[A-Z]{2}\d{6,}/,
        asics: /\d{4,}[A-Z]\d{2,}-\d{3}/
    },

    _imageKeyIn: function (brand, str) {
        var re = this._imageKeyPatterns[brand];
        if (!re) return '';
        var m = re.exec(String(str || '').toUpperCase());
        return m ? m[0] : '';
    },

    // MSRP for a colorway from the bundled barcode files, keyed by the same
    // colorway code the images/barcodes use. '' if none.
    _barcodePriceFor: function (brand, sku) {
        var prices = (typeof BarcodeData !== 'undefined' && BarcodeData.prices && BarcodeData.prices[brand]) || null;
        if (!prices || !sku) return '';
        var key = this._imageKeyIn(brand, sku);
        return key ? (prices[key] || '') : '';
    },

    // Index a selected image folder for `brand`. Each image is keyed by the
    // brand's colorway key found in its filename; multiple images per key (an ON
    // gallery) are kept in gallery order. ASICS has one primary image per key.
    indexImageFolder: function (fileList, brand) {
        var self = this;
        var idx = {};
        Array.prototype.slice.call(fileList || []).forEach(function (f) {
            var name = f.name || '';
            if (!/\.(png|jpe?g)$/i.test(name)) return;
            var key = self._imageKeyIn(brand, name);
            if (!key) return;
            (idx[key] = idx[key] || []).push(f);
        });
        Object.keys(idx).forEach(function (c) {
            idx[c].sort(function (a, b) { return self._angleRank(a.name) - self._angleRank(b.name); });
        });
        this._imageIndex = idx;
        this._imageBrand = brand;
        return idx;
    },

    // Gallery order: g1..g6 first (g1 = featured), then detail (d), then lifestyle.
    // Single-image brands (ASICS) all rank the same, which is fine.
    _angleRank: function (name) {
        var m = /1x1-([a-z0-9-]+)\.(png|jpe?g)$/i.exec(name || '');
        var a = m ? m[1].toLowerCase() : 'zz';
        var gm = /^g(\d+)/.exec(a);
        if (gm) return parseInt(gm[1], 10);
        if (a.charAt(0) === 'd') return 50;
        if (a.charAt(0) === 'l') return 60;
        return 40;
    },

    _imageKeyOf: function (spec) {
        var v = (spec.variants || [])[0];
        return this._imageKeyIn(this._imageBrand, (v && v.sku) || '');
    },

    _imagesForSpec: function (spec) {
        if (!this._imageIndex) return [];
        var key = this._imageKeyOf(spec);
        return key ? (this._imageIndex[key] || []) : [];
    },

    _hasImages: function () { return !!(this._imageIndex && Object.keys(this._imageIndex).length); },

    // Stage + upload every matched image, attaching resourceUrls to each spec's
    // files (in gallery order, so the first becomes the featured image).
    _attachImages: function (specs, onProgress) {
        var self = this;
        var jobs = [];
        specs.forEach(function (s, si) {
            self._imagesForSpec(s).forEach(function (f) { jobs.push({ si: si, file: f }); });
        });
        if (!jobs.length) return Promise.resolve(specs);
        var req = jobs.map(function (j) { return { filename: j.file.name, mimeType: j.file.type || 'image/png', fileSize: j.file.size }; });
        return CatalogClient.stagedUploads(req).then(function (res) {
            if (res.__status !== 200) throw new Error((res.error || res.reason || ('staged uploads HTTP ' + res.__status)));
            var targets = res.targets || [];
            if (targets.length < jobs.length) throw new Error('Server returned fewer upload targets than images');
            var done = 0;
            return jobs.reduce(function (chain, j, i) {
                return chain.then(function () {
                    return CatalogClient.uploadToTarget(targets[i], j.file).then(function (resourceUrl) {
                        var s = specs[j.si];
                        (s.files = s.files || []).push({ originalSource: resourceUrl, alt: s.title });
                        done++; if (onProgress) onProgress(done, jobs.length);
                    });
                });
            }, Promise.resolve()).then(function () { return specs; });
        });
    },

    // ===== THE CREATE DIALOG (redesigned, matches the app's dark theme) =====
    // A single clean screen: review what will be created, toggle images on/off,
    // then Create. No write fires until Create is clicked. Drafts only.
    showCreateConfirm: function (brand, specs) {
        var self = this;
        var totalVariants = specs.reduce(function (t, s) { return t + s.variants.length; }, 0);
        var thumbUrls = [];

        var overlay = document.createElement('div');
        overlay.id = 's4-confirm-overlay';
        overlay.innerHTML =
            '<div class="s4-modal" role="dialog" aria-modal="true">'
            + '<div class="s4-head"><div>'
            + '<div class="s4-eyebrow">New products · ' + escapeHtmlEnrich((this.brandDefaults[brand] || {}).vendor || brand) + '</div>'
            + '<h1 class="s4-title" id="s4-title"></h1>'
            + '<div class="s4-sub">Reviewed and ready. They land as <strong>drafts</strong> for you to publish.</div>'
            + '</div><button class="s4-x" id="s4-x" aria-label="Cancel">×</button></div>'
            + '<div class="s4-toggle-bar">'
            + '<div class="s4-toggle-ico" aria-hidden="true">🖼</div>'
            + '<div class="s4-toggle-txt"><div class="s4-t">Upload product images</div><div class="s4-h" id="s4-hint"></div></div>'
            + '<button class="s4-folder-btn" id="s4-folder" type="button">Choose folder</button>'
            + '<label class="s4-switch"><input type="checkbox" id="s4-imgtoggle" aria-label="Upload product images"><span class="s4-track"></span><span class="s4-knob"></span></label>'
            + '<input type="file" id="s4-folder-input" webkitdirectory directory multiple style="display:none">'
            + '</div>'
            + '<div class="s4-list-label"><span>What gets created</span><span>all draft</span></div>'
            + '<div class="s4-list" id="s4-list"></div>'
            + '<div class="s4-summary" id="s4-summary"></div>'
            + '<div class="s4-msg" id="s4-msg"></div>'
            + '<div class="s4-foot">'
            + '<div class="s4-safe"><strong>Nothing goes live.</strong> Created as drafts — review and publish in Shopify when ready.</div>'
            + '<button class="s4-btn s4-btn-ghost" id="s4-cancel">Cancel</button>'
            + '<button class="s4-btn s4-btn-go" id="s4-go"></button>'
            + '</div></div>';
        document.body.appendChild(overlay);

        var toggle = document.getElementById('s4-imgtoggle');
        toggle.checked = self._hasImages();

        function photoCount() { return specs.reduce(function (t, s) { return t + self._imagesForSpec(s).length; }, 0); }

        function render() {
            var on = toggle.checked && self._hasImages();
            document.getElementById('s4-title').textContent = 'Create ' + specs.length + ' product' + (specs.length !== 1 ? 's' : '') + ' in Shopify';
            var hint = document.getElementById('s4-hint');
            hint.innerHTML = self._hasImages()
                ? '<b>' + photoCount() + '</b> photos matched from your gallery folder'
                : 'Pick your gallery folder to attach photos (optional)';
            document.getElementById('s4-folder').style.display = self._hasImages() ? 'none' : '';
            toggle.disabled = !self._hasImages();

            thumbUrls.forEach(function (u) { URL.revokeObjectURL(u); }); thumbUrls = [];
            var list = document.getElementById('s4-list');
            list.innerHTML = specs.map(function (s) {
                var imgs = on ? self._imagesForSpec(s) : [];
                var thumb = '';
                if (imgs.length) { var u = URL.createObjectURL(imgs[0]); thumbUrls.push(u); thumb = '<div class="s4-thumb"><img src="' + u + '" alt=""><span class="s4-cnt">' + imgs.length + '</span></div>'; }
                var cw = (s.tags || []).filter(function (t) { return /^cw-group:/.test(t); })[0] || '';
                return '<div class="s4-item">' + thumb
                    + '<div class="s4-item-main"><div class="s4-item-name">' + escapeHtmlEnrich(s.title) + '</div>'
                    + '<div class="s4-item-meta"><span class="s4-chip s4-chip-draft">Draft</span>'
                    + (cw ? '<span class="s4-chip s4-chip-cw">' + escapeHtmlEnrich(cw) + '</span>' : '')
                    + '<span class="s4-chip s4-chip-plain">' + s.variants.length + ' sizes</span></div></div>'
                    + '<div class="s4-item-price">$' + escapeHtmlEnrich((s.variants[0] && s.variants[0].price) || '—') + '<small>each</small></div>'
                    + '</div>';
            }).join('');

            var photos = on ? photoCount() : 0;
            document.getElementById('s4-summary').innerHTML =
                '<span><b>' + specs.length + '</b> products</span><span class="s4-dot">·</span>'
                + '<span><b>' + totalVariants + '</b> variants</span><span class="s4-dot">·</span><span>all draft</span>'
                + (photos ? '<span class="s4-dot">·</span><span class="s4-imgpart"><b>' + photos + '</b> photos</span>' : '');
            document.getElementById('s4-go').innerHTML = 'Create ' + specs.length + ' →';
        }

        function close() { thumbUrls.forEach(function (u) { URL.revokeObjectURL(u); }); overlay.remove(); }
        document.getElementById('s4-x').onclick = close;
        document.getElementById('s4-cancel').onclick = close;
        document.getElementById('s4-folder').onclick = function () { document.getElementById('s4-folder-input').click(); };
        document.getElementById('s4-folder-input').onchange = function (e) {
            if (e.target.files && e.target.files.length) { self.indexImageFolder(e.target.files, brand); toggle.checked = true; render(); }
        };
        toggle.onchange = render;
        document.getElementById('s4-go').onclick = function () { self._doCreate(brand, specs, overlay, toggle.checked && self._hasImages()); };
        render();
    },

    // Optionally stage+upload images, then create the products, reporting progress
    // and per-product results in the same dialog.
    _doCreate: function (brand, specs, overlay, withImages) {
        var self = this;
        var go = document.getElementById('s4-go');
        var cancel = document.getElementById('s4-cancel');
        var msg = document.getElementById('s4-msg');
        go.disabled = true; cancel.disabled = true;
        var xBtn = document.getElementById('s4-x'); if (xBtn) xBtn.style.visibility = 'hidden';

        function fail(html) {
            msg.className = 's4-msg s4-msg-error'; msg.innerHTML = html;
            go.style.display = 'none'; cancel.disabled = false; cancel.textContent = 'Close';
        }

        var prep = Promise.resolve(specs);
        if (withImages) {
            go.textContent = 'Uploading…';
            msg.className = 's4-msg s4-msg-info'; msg.textContent = 'Uploading product images…';
            prep = self._attachImages(specs, function (done, total) { msg.textContent = 'Uploading images… ' + done + ' / ' + total; });
        }

        prep.then(function (readySpecs) {
            go.textContent = 'Creating…';
            msg.className = 's4-msg s4-msg-info'; msg.textContent = 'Creating ' + specs.length + ' product' + (specs.length !== 1 ? 's' : '') + ' in Shopify…';
            return CatalogClient.createProducts(readySpecs);
        }).then(function (res) {
            if (res.__status === 501) { fail('Writes are turned off on the server (read-only mode). ' + escapeHtmlEnrich(res.reason || '')); return; }
            if (res.__status !== 200) { fail('Server error (HTTP ' + res.__status + '): ' + escapeHtmlEnrich(res.error || res.reason || 'unknown')); return; }
            var results = res.results || [];
            var okCount = res.created != null ? res.created : results.filter(function (r) { return r.ok; }).length;
            var failed = results.filter(function (r) { return !r.ok; });
            if (failed.length === 0) {
                msg.className = 's4-msg s4-msg-ok';
                msg.innerHTML = '✓ Created <strong>' + okCount + '</strong> draft product' + (okCount !== 1 ? 's' : '') + (withImages ? ' with photos' : '') + '. Review and publish them in Shopify admin.';
            } else {
                msg.className = 's4-msg s4-msg-warn';
                msg.innerHTML = 'Created <strong>' + okCount + '</strong>, <strong>' + failed.length + '</strong> failed:<br>'
                    + failed.slice(0, 8).map(function (r) { return '• ' + escapeHtmlEnrich(r.title || r.handle) + ': ' + escapeHtmlEnrich((r.userErrors && r.userErrors[0] && r.userErrors[0].message) || 'error'); }).join('<br>');
            }
            go.style.display = 'none'; cancel.disabled = false; cancel.textContent = 'Done';
            if (typeof showToast === 'function' && okCount > 0) showToast(okCount + ' draft product' + (okCount !== 1 ? 's' : '') + ' created');
        }).catch(function (e) { fail('Request failed: ' + escapeHtmlEnrich((e && e.message) || e)); });
    },

    // ========== APPLY ENRICHMENT TO CSV ==========
    // Patches a generated CSV string with enrichment data keyed by model
    applyToCSV: function(csvString, brand, converter, enrichmentMap) {
        if (!csvString || !enrichmentMap || Object.keys(enrichmentMap).length === 0) return csvString;

        // Build handle → modelKey map (for the user's enrichment) and
        // handle → inherited record (from the live catalog) from productVariantData.
        var handleToModel = {};
        var handleToInherit = {};
        var canInherit = (typeof CatalogClient !== 'undefined'
            && typeof CatalogClient.inheritFor === 'function'
            && converter && typeof converter.identifyProduct === 'function');
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
                // Inheritance keyed by identifyProduct (matches the index built in
                // CatalogClient.buildKnownSets). Two records: `w` is width-specific
                // (its tags carry the correct cw-group + width tag for THIS width),
                // `m` is model-level (description/type/category/price are the same
                // across widths). Model-level fields must fall back to `m` so a new
                // colorway in a width the store does not yet carry still inherits
                // them, even though there is no width-specific sibling to tag from.
                if (canInherit && !handleToInherit[v.handle]) {
                    var g = null;
                    try { g = converter.identifyProduct(v.title, v.handle); } catch (e) { /* best effort */ }
                    if (g) {
                        var recW = CatalogClient.inheritFor(brand, g, v.width || '');
                        var recM = CatalogClient.inheritForModel(brand, g);
                        if (recW || recM) handleToInherit[v.handle] = { w: recW, m: recM };
                    }
                }
            });
        }

        // Union inherited tags (which carry the correct cw-group + width tag for
        // this colorway) with any tags the user typed. Inherited first, deduped
        // case-insensitively, so the grouping tag is always present.
        function mergeTags(inhTags, userTagsStr) {
            var out = [], seen = {};
            (inhTags || []).forEach(function (t) {
                var s = String(t).trim(); var k = s.toLowerCase();
                if (s && !seen[k]) { seen[k] = 1; out.push(s); }
            });
            String(userTagsStr || '').split(',').forEach(function (t) {
                var s = t.trim(); var k = s.toLowerCase();
                if (s && !seen[k]) { seen[k] = 1; out.push(s); }
            });
            return out.join(', ');
        }

        var lines = csvString.split('\n');
        var headers = parseCSVLineEnrich(lines[0]);

        var handleIdx = headers.indexOf('URL handle');
        var priceIdx = headers.indexOf('Price');
        var descIdx = headers.indexOf('Description');
        var tagsIdx = headers.indexOf('Tags');
        var typeIdx = headers.indexOf('Type');
        var catIdx = headers.indexOf('Product category');
        var seoTitleIdx = headers.indexOf('SEO title');
        var seoDescIdx = headers.indexOf('SEO description');

        var seenHandle = {};   // product-level fields go on the FIRST row of a handle only
        var result = [lines[0]];
        for (var i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            var cols = parseCSVLineEnrich(lines[i]);
            var handle = (cols[handleIdx] || '').replace(/^"|"$/g, '');
            if (!handle) { result.push(lines[i]); continue; }

            var modelKey = handleToModel[handle];
            var enrich = modelKey ? enrichmentMap[modelKey] : null;
            var inhPair = handleToInherit[handle] || null;
            var inhW = inhPair && inhPair.w;   // width-specific: correct cw-group + width tag
            var inhM = inhPair && inhPair.m;   // model-level: description/type/category/price
            if (!enrich && !inhPair) { result.push(lines[i]); continue; }

            var q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };

            // Pad columns so every index we may write exists.
            var maxIdx = Math.max(priceIdx, descIdx, tagsIdx, typeIdx, catIdx, seoTitleIdx, seoDescIdx);
            while (cols.length <= maxIdx) cols.push('""');

            var first = !seenHandle[handle];
            seenHandle[handle] = true;

            // Price is per-variant, so stamp it on every row. Model-level.
            var price = (enrich && enrich.price) || (inhM && inhM.price) || (inhW && inhW.price) || '';
            if (priceIdx >= 0 && price) cols[priceIdx] = q(price);

            // Product-level fields: first row of the handle only.
            if (first) {
                if (descIdx >= 0) {
                    // Description is model-level (same across widths).
                    var desc = (enrich && enrich.description) || (inhM && inhM.descriptionHtml) || (inhW && inhW.descriptionHtml) || '';
                    if (desc) cols[descIdx] = q(desc);
                }
                if (tagsIdx >= 0) {
                    // Tags come from the WIDTH-SPECIFIC sibling so the cw-group +
                    // width tag are right for this colorway. If the store carries
                    // no sibling in this width, inherit no tags rather than stamp a
                    // wrong-width cw-group (which would misgroup the product).
                    var tags = mergeTags(inhW && inhW.tags, enrich && enrich.tags);
                    if (tags) cols[tagsIdx] = q(tags);
                }
                var typeSrc = (inhM && inhM.productType) || (inhW && inhW.productType);
                var catSrc = (inhM && inhM.category) || (inhW && inhW.category);
                if (typeIdx >= 0 && typeSrc) cols[typeIdx] = q(typeSrc);
                if (catIdx >= 0 && catSrc) cols[catIdx] = q(catSrc);
                if (seoTitleIdx >= 0 && enrich && enrich.seoTitle) cols[seoTitleIdx] = q(enrich.seoTitle);
                if (seoDescIdx >= 0 && enrich && enrich.seoDesc) cols[seoDescIdx] = q(enrich.seoDesc);
            }

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

// Record-aware CSV parse: splits into rows honoring quotes, so a quoted field
// with embedded newlines (an inherited description) stays one field on one row.
// Returns an array of field-arrays.
function parseCSVRecordsEnrich(csv) {
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < csv.length; i++) {
        var ch = csv[i];
        if (q) {
            if (ch === '"') { if (csv[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += ch;
        } else if (ch === '"') { q = true; }
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else cur += ch;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
}

function escapeHtmlEnrich(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ========== CSS ==========
(function() {
    var style = document.createElement('style');
    style.textContent = `
        #enrichment-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,.55);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000; padding: 20px; overflow: hidden;
        }
        body.enrich-open { overflow: hidden; }
        .enrich-modal {
            background: #fff; border-radius: 16px; width: 100%; max-width: 740px;
            height: 90vh; max-height: 90vh; display: flex; flex-direction: column;
            box-shadow: 0 24px 60px rgba(0,0,0,.25); overflow: hidden;
        }
        .enrich-header {
            padding: 20px 24px; color: #fff;
            display: flex; align-items: center; justify-content: space-between; gap: 16px;
            flex-shrink: 0;
        }
        .enrich-header-title { font-size: 18px; font-weight: 800; }
        .enrich-header-sub { font-size: 13px; opacity: .92; margin-top: 2px; }
        .enrich-brand-price-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
        .enrich-brand-price-wrap label { font-size: 11px; font-weight: 600; opacity: .95; }

        .enrich-body { overflow-y: auto; padding: 16px; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
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
        .enrich-cw-count { font-size: 12px; font-weight: 500; color: #3f3f46; margin-left: 6px; }
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
        .enrich-cw-meta { color: #52525b; font-size: 11px; }

        .enrich-fields { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
        .enrich-row2 { display: flex; gap: 10px; align-items: flex-start; }
        .enrich-field2 { display: flex; flex-direction: column; gap: 4px; }
        .enrich-field2 label { font-size: 10px; font-weight: 700; color: #3f3f46; text-transform: uppercase; letter-spacing: .4px; }
        .enrich-field2-wide { flex: 1; }
        .enrich-price-wrap2 { position: relative; width: 100px; }
        .enrich-dollar { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); font-size: 12px; color: #3f3f46; font-weight: 600; pointer-events: none; }
        .enrich-price-wrap2 .enrich-price { padding-left: 20px; width: 100px; }
        .enrich-advanced-toggle { font-size: 11px; font-weight: 600; color: #2563eb; cursor: pointer; padding: 2px 0 4px; display: inline-block; user-select: none; }
        .enrich-advanced-toggle:hover { text-decoration: underline; }
        .enrich-advanced { display: flex; flex-direction: column; gap: 10px; padding-top: 10px; border-top: 1px solid #e4e4e7; margin-top: 6px; }
        .enrich-field-row { display: flex; align-items: flex-start; gap: 10px; }
        .enrich-field-row label {
            font-size: 10px; font-weight: 700; color: #3f3f46; text-transform: uppercase;
            letter-spacing: .4px; padding-top: 8px; width: 80px; flex-shrink: 0;
        }
        .enrich-input {
            flex: 1; padding: 9px 12px; border: 1px solid #e4e4e7; border-radius: 7px;
            font-size: 13px; font-family: inherit; outline: none; transition: border-color .15s;
            background: #fff;
        }
        .enrich-input:focus { border-color: #18181b; }
        .enrich-input-sm { width: 90px; flex: none; padding: 5px 8px; font-size: 13px; }
        .enrich-textarea {
            flex: 1; padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 7px;
            font-size: 13px; font-family: inherit; outline: none;
            transition: border-color .15s; resize: vertical; min-height: 100px; background: #fff; line-height: 1.6;
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
        .enrich-btn-cancel { background: #e4e4e7; color: #27272a; }
        .enrich-btn-cancel:hover { background: #d4d4d8; }
        .enrich-btn-secondary { background: #fff; color: #18181b; border: 1px solid #c4c4cc; }
        .enrich-btn-secondary:hover { background: #f4f4f5; }
        .enrich-btn-confirm { background: #008060; color: #fff; }
        .enrich-btn-confirm:hover { background: #006e52; }

        /* Stage 4: create-in-Shopify dialog — dark, matches the app theme */
        #s4-confirm-overlay {
            position: fixed; inset: 0; z-index: 10001; padding: 24px 16px;
            display: flex; align-items: center; justify-content: center;
            background: rgba(3,5,10,.66); backdrop-filter: blur(3px);
            --s4-text: #e9f1fb; --s4-muted: #9fb2cc; --s4-muted2: #97abc7;
            --s4-surface: #111828; --s4-surface2: #0b111d; --s4-raise: #1b2740;
            --s4-line: rgba(94,234,212,.14); --s4-line2: rgba(56,189,248,.30);
            --s4-accent: #34e0ff; --s4-accent2: #7c8bff; --s4-ok: #3ce6b0; --s4-warn: #ffc04d; --s4-bad: #ff6b8b;
        }
        .s4-modal {
            width: 100%; max-width: 580px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;
            color: var(--s4-text); font-family: inherit;
            background: var(--s4-surface); backdrop-filter: blur(18px) saturate(1.2);
            border: 1px solid var(--s4-line2); border-radius: 4px;
            box-shadow: 0 30px 80px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .s4-head { padding: 20px 22px 16px; border-bottom: 1px solid var(--s4-line); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .s4-eyebrow { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--s4-accent); font-weight: 700; }
        .s4-title { margin: 6px 0 0; font-size: 21px; font-weight: 700; letter-spacing: -.3px; line-height: 1.15; }
        .s4-sub { margin-top: 5px; font-size: 13px; color: var(--s4-muted); }
        .s4-sub strong { color: var(--s4-text); }
        .s4-x { flex: none; width: 32px; height: 32px; border-radius: 3px; border: 1px solid var(--s4-line2); background: var(--s4-raise); color: var(--s4-muted); font-size: 18px; line-height: 1; cursor: pointer; }
        .s4-x:hover { color: var(--s4-text); border-color: var(--s4-accent); }
        .s4-toggle-bar { margin: 16px 22px 0; padding: 13px 16px; border: 1px solid var(--s4-line2); border-radius: 4px;
            background: linear-gradient(180deg, rgba(52,224,255,.06), rgba(124,139,255,.04)); display: flex; align-items: center; gap: 13px; }
        .s4-toggle-ico { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 3px; background: var(--s4-raise); border: 1px solid var(--s4-line2); font-size: 16px; }
        .s4-toggle-txt { flex: 1; min-width: 0; }
        .s4-toggle-txt .s4-t { font-size: 14px; font-weight: 700; }
        .s4-toggle-txt .s4-h { font-size: 12px; color: var(--s4-muted); margin-top: 2px; }
        .s4-toggle-txt .s4-h b { color: var(--s4-ok); font-variant-numeric: tabular-nums; }
        .s4-folder-btn { flex: none; font-size: 12px; font-weight: 700; color: var(--s4-accent); background: var(--s4-raise); border: 1px solid var(--s4-line2); border-radius: 3px; padding: 7px 12px; cursor: pointer; font-family: inherit; }
        .s4-folder-btn:hover { border-color: var(--s4-accent); }
        .s4-switch { flex: none; position: relative; width: 50px; height: 28px; }
        .s4-switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
        .s4-switch input:disabled { cursor: not-allowed; }
        .s4-track { position: absolute; inset: 0; border-radius: 999px; background: #1a2436; border: 1px solid var(--s4-line2); transition: background .18s, border-color .18s; }
        .s4-knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #6b7d99; transition: transform .18s, background .18s; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
        .s4-switch input:checked + .s4-track { background: linear-gradient(92deg, var(--s4-accent), var(--s4-accent2)); border-color: transparent; }
        .s4-switch input:checked + .s4-track + .s4-knob { transform: translateX(22px); background: #fff; }
        .s4-switch input:disabled + .s4-track { opacity: .5; }
        .s4-switch input:focus-visible + .s4-track { box-shadow: 0 0 0 3px rgba(52,224,255,.35); }
        .s4-list-label { display: flex; justify-content: space-between; padding: 18px 22px 8px; }
        .s4-list-label span { font-size: 11px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--s4-muted2); font-weight: 700; }
        .s4-list { flex: 1 1 auto; min-height: 64px; overflow-y: auto; padding: 2px 22px; display: flex; flex-direction: column; gap: 8px; }
        .s4-list::-webkit-scrollbar { width: 8px; } .s4-list::-webkit-scrollbar-thumb { background: rgba(120,160,220,.25); border-radius: 4px; }
        .s4-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--s4-line); border-radius: 4px; background: var(--s4-surface2); }
        .s4-thumb { width: 44px; height: 44px; flex: none; border-radius: 3px; overflow: hidden; background: #0c1220; border: 1px solid var(--s4-line2); position: relative; }
        .s4-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .s4-thumb .s4-cnt { position: absolute; bottom: 2px; right: 2px; font-size: 9px; font-weight: 700; background: rgba(5,7,13,.8); color: var(--s4-accent); padding: 1px 4px; border-radius: 2px; }
        .s4-item-main { flex: 1; min-width: 0; }
        .s4-item-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .s4-item-meta { margin-top: 4px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .s4-chip { font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 2px; }
        .s4-chip-draft { color: var(--s4-warn); background: rgba(255,192,77,.10); border: 1px solid rgba(255,192,77,.28); }
        .s4-chip-cw { color: var(--s4-accent); background: rgba(52,224,255,.08); border: 1px solid rgba(52,224,255,.22); font-family: ui-monospace, monospace; }
        .s4-chip-plain { color: var(--s4-muted); background: var(--s4-raise); border: 1px solid var(--s4-line); }
        .s4-item-price { flex: none; font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; }
        .s4-item-price small { display: block; font-size: 10px; font-weight: 600; color: var(--s4-muted2); }
        .s4-summary { margin: 14px 22px 0; padding: 11px 16px; border-radius: 4px; background: var(--s4-surface2); border: 1px solid var(--s4-line); display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--s4-muted); }
        .s4-summary b { color: var(--s4-text); font-variant-numeric: tabular-nums; }
        .s4-summary .s4-dot { color: var(--s4-muted2); }
        .s4-summary .s4-imgpart { color: var(--s4-ok); }
        .s4-msg { font-size: 13px; line-height: 1.5; margin: 12px 22px 0; }
        .s4-msg:empty { margin: 0; }
        .s4-msg-info { color: var(--s4-muted); } .s4-msg-ok { color: var(--s4-ok); }
        .s4-msg-warn { color: var(--s4-warn); } .s4-msg-error { color: var(--s4-bad); }
        .s4-foot { padding: 16px 22px 20px; display: flex; align-items: center; gap: 12px; }
        .s4-safe { flex: 1; font-size: 12px; color: var(--s4-muted); line-height: 1.4; }
        .s4-safe strong { color: var(--s4-text); }
        .s4-btn { border: 0; border-radius: 3px; font-family: inherit; font-weight: 700; cursor: pointer; transition: filter .18s, background .18s; }
        .s4-btn:disabled { opacity: .55; cursor: default; }
        .s4-btn-ghost { padding: 11px 16px; font-size: 14px; background: transparent; color: var(--s4-muted); border: 1px solid var(--s4-line2); }
        .s4-btn-ghost:hover:not(:disabled) { color: var(--s4-text); border-color: var(--s4-accent); }
        .s4-btn-go { padding: 11px 20px; font-size: 14px; color: #04121a; white-space: nowrap; background: linear-gradient(92deg, var(--s4-accent), var(--s4-accent2)); box-shadow: 0 0 22px rgba(52,224,255,.28); }
        .s4-btn-go:hover:not(:disabled) { filter: brightness(1.08); }
        .s4-btn-go:focus-visible, .s4-btn-ghost:focus-visible, .s4-x:focus-visible { outline: 2px solid var(--s4-accent); outline-offset: 2px; }
        @media (max-width: 520px) { .s4-foot { flex-wrap: wrap; } .s4-safe { flex-basis: 100%; order: -1; } .s4-btn-ghost, .s4-btn-go { flex: 1; } }
    `;
    document.head.appendChild(style);
})();

// ========== BRAND → CONVERTER MAP ==========
var ENRICHMENT_BRAND_MAP = {
    saucony:  { getConverter: function() { return SauconyConverter; },  compKey: '_sauconyTrackerComparison' },
    hoka:     { getConverter: function() { return HokaConverter; },     compKey: '_hokaTrackerComparison' },
    brooks:   { getConverter: function() { return BrooksConverter; },   compKey: '_brooksTrackerComparison' },
    asics:    { getConverter: function() { return AsicsConverter; },    compKey: '_asicsTrackerComparison' },
    puma:     { getConverter: function() { return PumaConverter; },     compKey: '_pumaTrackerComparison' },
    on:       { getConverter: function() { return OnConverter; },       compKey: '_onTrackerComparison' },
};

// ========== GENERIC ENRICHED DOWNLOAD ==========
function downloadNewProductCSVWithEnrichment(brand) {
    var cfg = ENRICHMENT_BRAND_MAP[brand];
    if (!cfg) return;
    var converter = cfg.getConverter();
    var comparison = window[cfg.compKey];
    if (!converter || !comparison) { alert('Run inventory first!'); return; }

    ProductEnrichment.open(brand, converter, comparison, function(enrichmentMap) {
        var csv = converter.generateNewProductCSV(comparison);
        if (!csv) { alert('No new products to download.'); return; }
        csv = ProductEnrichment.applyToCSV(csv, brand, converter, enrichmentMap);
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = brand + '-NEW-products-' + getFormattedDate() + '.csv';
        link.click();
        if (typeof showToast === 'function') showToast((BRAND_CONFIG[brand] || {}).displayName || brand + ' new products downloaded');
    });
}

// ========== OVERRIDE DOWNLOAD FUNCTIONS ==========
function downloadSauconyNewProductCSV()  { downloadNewProductCSVWithEnrichment('saucony'); }
function downloadHokaNewProductCSV()     { downloadNewProductCSVWithEnrichment('hoka'); }
function downloadBrooksNewProductCSV()   { downloadNewProductCSVWithEnrichment('brooks'); }
function downloadAsicsNewProductCSV()    { downloadNewProductCSVWithEnrichment('asics'); }
function downloadPumaNewProductCSV()     { downloadNewProductCSVWithEnrichment('puma'); }
function downloadOnNewProductCSV()       { downloadNewProductCSVWithEnrichment('on'); }

// ========== COMBINED NEW PRODUCTS (patched) ==========
function downloadCombinedNewProducts() {
    var brandsWithNew = [];
    for (var brand in ENRICHMENT_BRAND_MAP) {
        var cfg = ENRICHMENT_BRAND_MAP[brand];
        var converter = cfg.getConverter();
        var comparison = window[cfg.compKey];
        if (!converter || !comparison) continue;
        var hasNew = (comparison.newProducts && comparison.newProducts.length > 0)
                  || (comparison.newColorways && comparison.newColorways.length > 0);
        if (hasNew) brandsWithNew.push(brand);
    }
    if (brandsWithNew.length === 0) { alert('No new products detected.'); return; }

    var allLines = [], headerLine = null, idx = 0;
    function processNext() {
        if (idx >= brandsWithNew.length) {
            if (!headerLine || allLines.length === 0) { alert('No new products.'); return; }
            var csv = headerLine + '\n' + allLines.join('\n');
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'ALL-new-products-' + getFormattedDate() + '.csv';
            link.click();
            if (typeof showToast === 'function') showToast('Combined new products: ' + allLines.length + ' rows');
            return;
        }
        var b = brandsWithNew[idx++];
        var bcfg = ENRICHMENT_BRAND_MAP[b];
        var conv = bcfg.getConverter();
        var comp = window[bcfg.compKey];
        ProductEnrichment.open(b, conv, comp, function(enrichmentMap) {
            var csv = conv.generateNewProductCSV(comp);
            if (csv) {
                csv = ProductEnrichment.applyToCSV(csv, b, conv, enrichmentMap);
                var lines = csv.split('\n');
                if (!headerLine) headerLine = lines[0];
                for (var i = 1; i < lines.length; i++) { if (lines[i].trim()) allLines.push(lines[i]); }
            }
            processNext();
        });
    }
    processNext();
}
// Node test hook only (browser ignores this). Exposes ProductEnrichment so the
// enrichment/inheritance logic can be unit-tested without a DOM.
if (typeof module !== 'undefined' && module.exports) module.exports = ProductEnrichment;
