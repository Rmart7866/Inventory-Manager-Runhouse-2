// ========== UNIFIED BRAND PICKER ==========
// Replaces: hoka-picker.js, on-picker.js, asics-picker.js, brooks-picker.js, puma-picker.js, saucony-picker.js
// One picker system for all brands. Each brand registers its config.

var BrandPicker = {

    configs: {},
    scannedProducts: {},

    register: function(brand, config) {
        this.configs[brand] = config;
        this.scannedProducts[brand] = [];
    },

    // ========== SHOW PICKER ==========
    show: function(brand, products) {
        var config = this.configs[brand];
        if (!config) { console.error('BrandPicker: no config for ' + brand); return; }

        this.scannedProducts[brand] = products;
        var container = document.getElementById(config.containerId);
        if (!container) { console.error(config.containerId + ' not found'); return; }

        var cbClass = config.checkboxClass;
        var catAttr = config.categoryAttr;
        var knownProducts = config.converter._knownProducts || null;

        // Group by category
        var categorized = {};
        config.categoryOrder.forEach(function(cat) { categorized[cat] = []; });

        products.forEach(function(product) {
            var cat = config.categoryMapper ? config.categoryMapper(product) : (product.category || 'Other');
            if (!categorized[cat]) categorized[cat] = [];
            categorized[cat].push(product);
        });

        var html = '<div class="product-picker" style="display: block; margin: 0;">';
        html += '<div class="product-picker-header" style="background: ' + config.headerGradient + ';">';
        html += '<h4>Select Products to Include</h4>';
        html += '<div class="product-picker-actions">';
        html += '<button class="picker-action-btn" onclick="BrandPicker.selectAll(\'' + brand + '\')">Select All</button>';
        html += '<button class="picker-action-btn" onclick="BrandPicker.selectNone(\'' + brand + '\')">Select None</button>';
        html += '<button class="picker-action-btn" onclick="BrandPicker.selectDefaults(\'' + brand + '\')">Defaults</button>';
        html += '<button class="picker-save-defaults-btn" id="' + brand + '-save-defaults-btn" onclick="BrandPicker.saveDefaults(\'' + brand + '\')">Save as Defaults</button>';
        html += '</div></div>';

        html += '<div class="product-picker-summary" style="background: ' + config.summaryBg + '; color: ' + config.summaryColor + ';">';
        html += '<span id="' + brand + '-picker-count">0 products selected</span>';
        html += '<span id="' + brand + '-picker-rows">0 rows</span>';
        html += '</div>';

        html += '<div class="product-picker-body" id="' + brand + '-picker-body">';

        config.categoryOrder.forEach(function(catName) {
            var catProducts = categorized[catName];
            if (!catProducts || catProducts.length === 0) return;
            var catId = catName.replace(/[^a-zA-Z]/g, '');

            html += '<div class="product-category"><div class="product-category-header">';
            html += '<span>' + catName.toUpperCase() + ' (' + catProducts.length + ')</span>';
            html += '<button class="category-toggle-btn" onclick="BrandPicker.toggleCategory(\'' + brand + '\', \'' + catId + '\')">Toggle All</button>';
            html += '</div><div class="product-category-items" ' + catAttr + '="' + catId + '">';

            catProducts.sort(function(a, b) { return a.name.localeCompare(b.name); });

            catProducts.forEach(function(product) {
                var modelForCheck = product.model || product.name;
                var isChecked = knownProducts ? knownProducts.has(modelForCheck) : true;
                var isNew = knownProducts && !knownProducts.has(modelForCheck);
                if (product.isDefault !== undefined) { isChecked = product.isDefault; isNew = !product.isDefault; }

                var colorCount = product.colorways ? product.colorways.length : 0;
                var rows = product.rowCount || product.rows || 0;
                var inventory = product.totalInventory || product.inventory || 0;
                var inventoryClass = inventory > 0 ? 'inventory-count' : 'zero-inventory';

                html += '<div class="product-item' + (isNew ? ' is-new' : '') + '">';
                html += '<input type="checkbox" class="' + cbClass + '" data-model="' + product.name.replace(/"/g, '&quot;') + '" data-model-base="' + (product.model || product.name).replace(/"/g, '&quot;') + '" data-rows="' + rows + '" ' + (isChecked ? 'checked' : '') + '>';
                html += '<span class="product-item-name">' + product.name + '</span>';
                if (isNew) html += '<span class="product-new-badge" style="background: #fff3cd; color: #856404;">NEW</span>';
                html += '<span class="product-item-stats">';
                if (colorCount > 0) html += colorCount + ' color' + (colorCount !== 1 ? 's' : '') + ' · ';
                html += rows + ' rows · <span class="' + inventoryClass + '">' + inventory.toLocaleString() + ' units</span>';
                html += '</span></div>';
            });

            html += '</div></div>';
        });

        html += '</div></div>';
        container.innerHTML = html;
        container.style.display = 'block';

        // Wire checkboxes
        var self = this;
        document.querySelectorAll('.' + cbClass).forEach(function(cb) {
            cb.addEventListener('change', function() { self._updateSelection(brand); self._updateSummary(brand); });
            cb.closest('.product-item').addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
            });
        });

        this._updateSelection(brand);
        this._updateSummary(brand);
    },

    // ========== SELECTION / SUMMARY ==========
    _updateSelection: function(brand) {
        var config = this.configs[brand];
        config.converter.selectedProducts = new Set();
        document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) {
            if (cb.checked) config.converter.selectedProducts.add(cb.getAttribute('data-model'));
        });
    },

    _updateSummary: function(brand) {
        var config = this.configs[brand];
        var checkboxes = document.querySelectorAll('.' + config.checkboxClass);
        var total = checkboxes.length, selected = 0, totalRows = 0;
        var products = this.scannedProducts[brand] || [];

        checkboxes.forEach(function(cb) {
            if (cb.checked) {
                selected++;
                var rows = parseInt(cb.getAttribute('data-rows')) || 0;
                if (rows > 0) { totalRows += rows; }
                else {
                    var name = cb.getAttribute('data-model');
                    products.forEach(function(p) { if (p.name === name) totalRows += (p.rowCount || p.rows || 0); });
                }
            }
        });

        var countEl = document.getElementById(brand + '-picker-count');
        var rowsEl = document.getElementById(brand + '-picker-rows');
        if (countEl) countEl.textContent = selected + ' of ' + total + ' products selected';
        if (rowsEl) rowsEl.textContent = totalRows.toLocaleString() + ' rows';
    },

    selectAll: function(brand) {
        document.querySelectorAll('.' + this.configs[brand].checkboxClass).forEach(function(cb) { cb.checked = true; });
        this._updateSelection(brand); this._updateSummary(brand);
    },

    selectNone: function(brand) {
        document.querySelectorAll('.' + this.configs[brand].checkboxClass).forEach(function(cb) { cb.checked = false; });
        this._updateSelection(brand); this._updateSummary(brand);
    },

    selectDefaults: function(brand) {
        var config = this.configs[brand];
        var knownProducts = config.converter._knownProducts;
        if (brand === 'hoka' && typeof InventoryTracker !== 'undefined') knownProducts = InventoryTracker.getKnownModels('hoka');

        document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) {
            var key = cb.getAttribute('data-model-base') || cb.getAttribute('data-model');
            cb.checked = knownProducts ? knownProducts.has(key) : true;
        });
        this._updateSelection(brand); this._updateSummary(brand);
    },

    saveDefaults: function(brand) {
        var config = this.configs[brand];
        var btn = document.getElementById(brand + '-save-defaults-btn');
        if (!btn || typeof db === 'undefined') { alert('Firestore not available'); return; }

        var selected = [], allProducts = [];
        document.querySelectorAll('.' + config.checkboxClass).forEach(function(cb) {
            var name = cb.getAttribute('data-model');
            allProducts.push(name);
            if (cb.checked) selected.push(name);
        });
        if (selected.length === 0) { alert('No products selected.'); return; }

        btn.textContent = 'Saving...'; btn.disabled = true;

        if (brand === 'hoka' && typeof InventoryTracker !== 'undefined') {
            var now = new Date().toISOString();
            var promises = allProducts.map(function(name) {
                return db.collection('inventory-tracker').doc('hoka').collection('models').doc(name).set(
                    { name: name, active: false, lastSeen: now }, { merge: true }
                ).catch(function() {});
            });
            Promise.all(promises).then(function() {
                return Promise.all(selected.map(function(name) {
                    return db.collection('inventory-tracker').doc('hoka').collection('models').doc(name).set(
                        { name: name, active: true, firstSeen: now, lastSeen: now }, { merge: true }
                    );
                }));
            }).then(function() {
                InventoryTracker.invalidateCache('hoka');
                btn.textContent = '✓ Saved ' + selected.length; btn.classList.add('picker-saved'); btn.disabled = false;
                setTimeout(function() { btn.textContent = 'Save as Defaults'; btn.classList.remove('picker-saved'); }, 3000);
            }).catch(function(err) { btn.textContent = 'Error: ' + err.message; btn.disabled = false; });
        } else {
            db.collection('picker-defaults').doc(brand).set({ models: selected, updatedAt: new Date().toISOString() })
            .then(function() {
                btn.textContent = 'Saved!'; btn.classList.add('picker-saved'); btn.disabled = false;
                setTimeout(function() { btn.textContent = 'Save as Defaults'; btn.classList.remove('picker-saved'); }, 2000);
            }).catch(function(err) {
                btn.textContent = 'Error'; btn.disabled = false;
                setTimeout(function() { btn.textContent = 'Save as Defaults'; }, 2000);
            });
        }
    },

    toggleCategory: function(brand, catId) {
        var config = this.configs[brand];
        var items = document.querySelectorAll('[' + config.categoryAttr + '="' + catId + '"] .' + config.checkboxClass);
        if (items.length === 0) return;
        var allChecked = true;
        items.forEach(function(cb) { if (!cb.checked) allChecked = false; });
        items.forEach(function(cb) { cb.checked = !allChecked; });
        this._updateSelection(brand); this._updateSummary(brand);
    },

    // ========== TRACKER REPORT ==========
    showTrackerReport: function(brand, comparison) {
        var config = this.configs[brand];
        var container = document.getElementById(config.trackerId);
        if (!container) return;

        window[config.comparisonKey] = comparison;

        if (!comparison || (!comparison.newProducts.length && !comparison.newColorways.length && !comparison.removedColorways.length)) {
            container.innerHTML = '<div class="tracker-report" style="display:block;"><div class="tracker-report-header"><h4>No changes detected</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div><div style="padding:16px;text-align:center;color:#155724;font-size:14px;">All products match Shopify database.</div></div>';
            container.style.display = 'block';
            this._hideNewProductButton(brand);
            return;
        }

        var summary = comparison.summary || {};
        var prefix = brand + '-tracker';
        var html = '<div class="tracker-report" style="display:block;"><div class="tracker-report-header"><h4>Inventory Tracker</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div>';

        html += '<div class="tracker-stats">';
        html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (summary.totalInATS || 0) + '</span><span class="tracker-stat-label">In ATS File</span></div>';
        html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (summary.totalInDB || 0) + '</span><span class="tracker-stat-label">On Shopify</span></div>';
        html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (summary.matchingColorways || 0) + '</span><span class="tracker-stat-label">Matched</span></div>';
        if (comparison.newProducts && comparison.newProducts.length > 0) html += '<div class="tracker-stat tracker-stat-new-product"><span class="tracker-stat-number">+' + comparison.newProducts.length + '</span><span class="tracker-stat-label">New Products</span></div>';
        if (comparison.newColorways && comparison.newColorways.length > 0) html += '<div class="tracker-stat tracker-stat-new"><span class="tracker-stat-number">+' + comparison.newColorways.length + '</span><span class="tracker-stat-label">New Colors</span></div>';
        if (comparison.removedColorways && comparison.removedColorways.length > 0) html += '<div class="tracker-stat tracker-stat-removed"><span class="tracker-stat-number">-' + comparison.removedColorways.length + '</span><span class="tracker-stat-label">Removed</span></div>';
        html += '</div>';

        // Helper to group items by model
        function groupByModel(items) {
            var groups = {};
            items.forEach(function(item) { var m = item.modelName || item.model || 'Unknown'; if (!groups[m]) groups[m] = []; groups[m].push(item); });
            return groups;
        }

        // New Products
        if (comparison.newProducts && comparison.newProducts.length > 0) {
            var npGroups = groupByModel(comparison.newProducts);
            html += '<div class="tracker-section tracker-new-products"><div class="tracker-section-header" onclick="BrandPicker.toggleTrackerSection(\'' + brand + '\',\'new-products\')"><span>New Products (' + comparison.newProducts.length + ')</span><span class="tracker-toggle" id="' + prefix + '-toggle-new-products">&#9660;</span></div>';
            html += '<div class="tracker-section-body" id="' + prefix + '-body-new-products">';
            Object.keys(npGroups).sort().forEach(function(mName) {
                var items = npGroups[mName];
                html += '<div class="tracker-model-group"><div class="tracker-model-name">' + mName + ' <span class="tracker-model-count">(' + items.length + ')</span></div>';
                items.forEach(function(item) {
                    html += '<div class="tracker-item tracker-item-new-product"><input type="checkbox" class="tracker-confirm-cb" data-handle="' + item.handle + '" data-title="' + (item.title || '').replace(/"/g, '&quot;') + '" data-variants=\'' + JSON.stringify(item.variants || {}).replace(/'/g, '&#39;') + '\' data-model="' + mName.replace(/"/g, '&quot;') + '"><span class="tracker-item-badge tracker-badge-new-product">NEW PRODUCT</span><span class="tracker-item-name">' + (item.title || item.handle) + '</span><span class="tracker-item-detail">' + (item.variantCount || 0) + ' sizes</span></div>';
                });
                html += '</div>';
            });
            html += '<div class="tracker-confirm-actions"><label class="tracker-select-all"><input type="checkbox" onchange="BrandPicker.toggleAllInSection(\'' + brand + '\',\'new-products\',this.checked)"> Select All</label>';
            html += '<button class="tracker-confirm-btn" onclick="BrandPicker.confirmItems(\'' + brand + '\',\'new-products\')">✓ Confirm Selected On Shopify</button></div>';
            html += '</div></div>';
        }

        // New Colorways
        if (comparison.newColorways && comparison.newColorways.length > 0) {
            var ncGroups = groupByModel(comparison.newColorways);
            html += '<div class="tracker-section tracker-added"><div class="tracker-section-header" onclick="BrandPicker.toggleTrackerSection(\'' + brand + '\',\'new-colorways\')"><span>New Colorways (' + comparison.newColorways.length + ')</span><span class="tracker-toggle" id="' + prefix + '-toggle-new-colorways">&#9660;</span></div>';
            html += '<div class="tracker-section-body" id="' + prefix + '-body-new-colorways">';
            Object.keys(ncGroups).sort().forEach(function(mName) {
                var items = ncGroups[mName];
                html += '<div class="tracker-model-group"><div class="tracker-model-name">' + mName + ' <span class="tracker-model-count">(' + items.length + ')</span></div>';
                items.forEach(function(item) {
                    html += '<div class="tracker-item tracker-item-new"><input type="checkbox" class="tracker-confirm-cb" data-handle="' + item.handle + '" data-title="' + (item.title || '').replace(/"/g, '&quot;') + '" data-variants=\'' + JSON.stringify(item.variants || {}).replace(/'/g, '&#39;') + '\' data-model="' + (item.modelName || item.model || '').replace(/"/g, '&quot;') + '"><span class="tracker-item-badge tracker-badge-new">NEW COLOR</span><span class="tracker-item-name">' + (item.title || item.handle) + '</span><span class="tracker-item-detail">' + (item.variantCount || 0) + ' sizes</span></div>';
                });
                html += '</div>';
            });
            html += '<div class="tracker-confirm-actions"><label class="tracker-select-all"><input type="checkbox" onchange="BrandPicker.toggleAllInSection(\'' + brand + '\',\'new-colorways\',this.checked)"> Select All</label>';
            html += '<button class="tracker-confirm-btn" onclick="BrandPicker.confirmItems(\'' + brand + '\',\'new-colorways\')">✓ Confirm Selected On Shopify</button></div>';
            html += '</div></div>';
        }

        // Removed
        if (comparison.removedColorways && comparison.removedColorways.length > 0) {
            html += '<div class="tracker-section tracker-removed"><div class="tracker-section-header" onclick="BrandPicker.toggleTrackerSection(\'' + brand + '\',\'removed\')"><span>Removed (' + comparison.removedColorways.length + ') — zeroed out</span><span class="tracker-toggle" id="' + prefix + '-toggle-removed">&#9660;</span></div>';
            html += '<div class="tracker-section-body" id="' + prefix + '-body-removed">';
            comparison.removedColorways.forEach(function(r) {
                var vc = Object.keys(r.variants || {}).length;
                html += '<div class="tracker-item tracker-item-removed"><span class="tracker-item-badge tracker-badge-removed">GONE</span><span class="tracker-item-name">' + (r.title || r.handle) + '</span><span class="tracker-item-detail">' + vc + ' sizes → 0</span></div>';
            });
            html += '</div></div>';
        }

        html += '</div>';
        container.innerHTML = html;
        container.style.display = 'block';

        var totalNew = (comparison.newProducts ? comparison.newProducts.length : 0) + (comparison.newColorways ? comparison.newColorways.length : 0);
        if (totalNew > 0) this._showNewProductButton(brand, totalNew);
        else this._hideNewProductButton(brand);
    },

    toggleTrackerSection: function(brand, sectionId) {
        var body = document.getElementById(brand + '-tracker-body-' + sectionId);
        var toggle = document.getElementById(brand + '-tracker-toggle-' + sectionId);
        if (!body) return;
        var hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        if (toggle) toggle.innerHTML = hidden ? '&#9660;' : '&#9654;';
    },

    toggleAllInSection: function(brand, sectionId, checked) {
        var body = document.getElementById(brand + '-tracker-body-' + sectionId);
        if (!body) return;
        body.querySelectorAll('.tracker-confirm-cb').forEach(function(cb) { cb.checked = checked; });
    },

    // ========== CONFIRM TO FIRESTORE ==========
    confirmItems: function(brand, sectionId) {
        if (typeof InventoryTracker === 'undefined' || typeof db === 'undefined') { alert('Firestore not available'); return; }

        var body = document.getElementById(brand + '-tracker-body-' + sectionId);
        if (!body) return;
        var checkboxes = body.querySelectorAll('.tracker-confirm-cb:checked');
        if (checkboxes.length === 0) { alert('No items selected.'); return; }

        var colorwayData = [], modelNames = new Set();
        for (var i = 0; i < checkboxes.length; i++) {
            var cb = checkboxes[i];
            var variants = {};
            try { variants = JSON.parse(cb.getAttribute('data-variants')); } catch (e) {}
            colorwayData.push({ handle: cb.getAttribute('data-handle'), title: cb.getAttribute('data-title'), variants: variants });
            var mn = cb.getAttribute('data-model');
            if (mn) modelNames.add(mn);
        }

        var btn = body.querySelector('.tracker-confirm-btn');
        if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

        var newModels = [];
        modelNames.forEach(function(name) { if (!InventoryTracker.isKnownModel(name, brand)) newModels.push(name); });

        var promises = [InventoryTracker.confirmColorways(brand, colorwayData)];
        if (newModels.length > 0) promises.push(InventoryTracker.confirmModels(brand, newModels));

        Promise.all(promises).then(function() {
            if (btn) { btn.textContent = '✓ Saved ' + colorwayData.length + ' colorways'; btn.className = 'tracker-confirm-btn tracker-confirmed'; }
            for (var j = 0; j < checkboxes.length; j++) {
                var item = checkboxes[j].closest('.tracker-item');
                if (item) { item.style.opacity = '0.5'; var badge = item.querySelector('.tracker-item-badge'); if (badge) { badge.textContent = 'SAVED'; badge.className = 'tracker-item-badge tracker-badge-saved'; } }
            }
        }).catch(function(err) { if (btn) { btn.textContent = 'Error: ' + err.message; btn.disabled = false; } });
    },

    // ========== BUTTONS ==========
    _showNewProductButton: function(brand, count) {
        var btn = document.getElementById(brand + '-new-product-csv-btn');
        if (!btn) return;
        btn.textContent = 'Download NEW Products CSV (' + count + ' new)';
        btn.style.display = 'block';
    },
    _hideNewProductButton: function(brand) { var btn = document.getElementById(brand + '-new-product-csv-btn'); if (btn) btn.style.display = 'none'; },
    showProductCSVButton: function(brand) { var btn = document.getElementById(brand + '-product-csv-btn'); if (btn) btn.style.display = 'block'; },
    hideProductCSVButton: function(brand) { var btn = document.getElementById(brand + '-product-csv-btn'); if (btn) btn.style.display = 'none'; },

    // ========== DOWNLOAD CSVs ==========
    downloadNewProductCSV: function(brand) {
        var config = this.configs[brand];
        var comparison = window[config.comparisonKey];
        if (!comparison) { alert('No tracker data available.'); return; }
        var csv = config.converter.generateNewProductCSV(comparison);
        if (!csv) { alert('No new products to export.'); return; }
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = brand + '-NEW-products-' + new Date().toISOString().split('T')[0] + '.csv'; link.click();
    },

    downloadProductCSV: function(brand) {
        var config = this.configs[brand];
        var allHandles = new Set();
        (config.converter.scannedProducts || this.scannedProducts[brand] || []).forEach(function(p) {
            if (p.colorways) p.colorways.forEach(function(c) { allHandles.add(c.handle); });
        });
        var csv = config.converter.generateNewProductCSV({ newProducts: [], newColorways: Array.from(allHandles).map(function(h) { return { handle: h }; }), removedColorways: [] });
        if (!csv) { alert('No product data.'); return; }
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        link.download = brand + '-products-' + new Date().toISOString().split('T')[0] + '.csv'; link.click();
    },

    // ========== TRACKER STATUS ON LOAD ==========
    initTrackerStatus: function(brand) {
        if (typeof InventoryTracker === 'undefined' || typeof db === 'undefined') return;
        InventoryTracker.checkStatus(brand).then(function(status) {
            var badge = document.getElementById(brand + '-tracker-badge');
            if (!badge) return;
            if (status.connected && status.hasData) {
                badge.innerHTML = '🟢 Tracking active — ' + status.modelCount + ' models, ' + status.productCount + ' colorways';
                badge.className = 'tracker-badge tracker-badge-active';
            } else if (status.connected && !status.hasData) {
                badge.innerHTML = '🟡 Tracker connected — no data yet (run seed script)';
                badge.className = 'tracker-badge tracker-badge-empty';
            } else {
                badge.innerHTML = '🔴 Tracker offline — ' + (status.error || 'check Firebase config');
                badge.className = 'tracker-badge tracker-badge-error';
            }
            badge.style.display = 'block';
        });
    }
};

// ========== ON RUNNING CATEGORY MAPPER ==========
function _onCategoryMapper(product) {
    var cat = (product.category || '').toLowerCase();
    var model = (product.name || '').toLowerCase();
    if (cat.indexOf('boom') !== -1 || model.indexOf('cloudboom') !== -1) return 'Racing';
    if (cat.indexOf('po') !== -1 || model.indexOf('cloudultra') !== -1 || model.indexOf('cloudvista') !== -1) return 'Trail Running';
    if (model.indexOf('surfer trail') !== -1 || model.indexOf('cloudsurfer trail') !== -1) return 'Trail Running';
    if (cat.indexOf('ptr') !== -1 || model.indexOf('cloud x') !== -1 || model.indexOf('cloudpulse') !== -1) return 'Training / Lifestyle';
    if (cat.indexOf('nova') !== -1 || model.indexOf('cloudnova') !== -1) return 'Training / Lifestyle';
    if (cat.indexOf('swift') !== -1 || model.indexOf('cloudswift') !== -1) return 'Training / Lifestyle';
    if (cat.indexOf('cloud') !== -1 || cat.indexOf('flow') !== -1 || cat.indexOf('monster') !== -1 || cat.indexOf('runner') !== -1 || cat.indexOf('surfer') !== -1) return 'Road Running';
    return 'Other';
}

// ========== BRAND REGISTRATIONS ==========
if (typeof HokaConverter !== 'undefined') {
    BrandPicker.register('hoka', {
        converter: HokaConverter, containerId: 'hoka-picker-container', trackerId: 'hoka-tracker-report',
        headerGradient: 'linear-gradient(135deg, #00BFFF 0%, #1E90FF 100%)', summaryBg: '#f0f9ff', summaryColor: '#0369a1',
        categoryOrder: ['Road Running', 'Trail Running', 'Race / Track', 'Lifestyle / Hike', 'Recovery', 'Accessories', 'Other'],
        comparisonKey: '_hokaTrackerComparison', vendorName: 'HOKA', checkboxClass: 'hoka-picker-cb', categoryAttr: 'data-hoka-category'
    });
}
if (typeof OnConverter !== 'undefined') {
    BrandPicker.register('on', {
        converter: OnConverter, containerId: 'on-picker-container', trackerId: 'on-tracker-report',
        headerGradient: 'linear-gradient(135deg, #333 0%, #1a1a1a 100%)', summaryBg: '#f5f5f5', summaryColor: '#333',
        categoryOrder: ['Road Running', 'Trail Running', 'Racing', 'Training / Lifestyle', 'Other'],
        comparisonKey: '_onTrackerComparison', vendorName: 'ON Running', checkboxClass: 'on-picker-cb', categoryAttr: 'data-on-category',
        categoryMapper: _onCategoryMapper
    });
}
if (typeof AsicsConverter !== 'undefined') {
    BrandPicker.register('asics', {
        converter: AsicsConverter, containerId: 'asics-picker-container', trackerId: 'asics-tracker-report',
        headerGradient: 'linear-gradient(135deg, #003DA5 0%, #001E62 100%)', summaryBg: '#e8f0fe', summaryColor: '#003DA5',
        categoryOrder: ['Neutral Running', 'Stability Running', 'Racing / Performance', 'Other'],
        comparisonKey: '_asicsTrackerComparison', vendorName: 'ASICS', checkboxClass: 'asics-picker-cb', categoryAttr: 'data-asics-category'
    });
}
if (typeof BrooksConverter !== 'undefined') {
    BrandPicker.register('brooks', {
        converter: BrooksConverter, containerId: 'brooks-picker-container', trackerId: 'brooks-tracker-report',
        headerGradient: 'linear-gradient(135deg, #1a2b4a 0%, #0d1b2a 100%)', summaryBg: '#e8eef5', summaryColor: '#1a2b4a',
        categoryOrder: ['Neutral Running', 'Stability Running', 'Other'],
        comparisonKey: '_brooksTrackerComparison', vendorName: 'Brooks', checkboxClass: 'brooks-picker-cb', categoryAttr: 'data-brooks-category'
    });
}
if (typeof PumaConverter !== 'undefined') {
    BrandPicker.register('puma', {
        converter: PumaConverter, containerId: 'puma-picker-container', trackerId: 'puma-tracker-report',
        headerGradient: 'linear-gradient(135deg, #000 0%, #1a1a1a 100%)', summaryBg: '#e8e8e8', summaryColor: '#000',
        categoryOrder: ['Road Running', 'Trail Running', 'Racing', 'Track & Field', 'Other'],
        comparisonKey: '_pumaTrackerComparison', vendorName: 'Puma', checkboxClass: 'puma-picker-cb', categoryAttr: 'data-puma-category'
    });
}
if (typeof SauconyConverter !== 'undefined') {
    BrandPicker.register('saucony', {
        converter: SauconyConverter, containerId: 'saucony-picker-container', trackerId: 'saucony-tracker-report',
        headerGradient: 'linear-gradient(135deg, #e31837 0%, #b8132d 100%)', summaryBg: '#fde8eb', summaryColor: '#e31837',
        categoryOrder: ['Daily Training', 'Max Cushion', 'Stability', 'Racing / Performance', 'Other'],
        comparisonKey: '_sauconyTrackerComparison', vendorName: 'Saucony', checkboxClass: 'saucony-picker-cb', categoryAttr: 'data-saucony-category'
    });
}

// ========== GLOBAL FUNCTION WRAPPERS ==========
// Backward compat with index.html onclick handlers and main.js calls

// HOKA
function buildHokaProductPicker(products) { BrandPicker.show('hoka', products); }
function showHokaProductCSVButton() { BrandPicker.showProductCSVButton('hoka'); }
function hideHokaProductCSVButton() { BrandPicker.hideProductCSVButton('hoka'); }
function showTrackerReport(comparison) { BrandPicker.showTrackerReport('hoka', comparison); }
function downloadHokaNewProductCSV() { BrandPicker.downloadNewProductCSV('hoka'); }
function downloadHokaProductCSV() { BrandPicker.downloadProductCSV('hoka'); }
function showHokaNewProductButton(c) { var n = 0; if (c && c.newProducts) n += c.newProducts.length; if (c && c.newColorways) n += c.newColorways.length; if (n > 0) BrandPicker._showNewProductButton('hoka', n); else BrandPicker._hideNewProductButton('hoka'); }
function hideHokaNewProductButton() { BrandPicker._hideNewProductButton('hoka'); }
function hokaPickerSelectAll() { BrandPicker.selectAll('hoka'); }
function hokaPickerSelectNone() { BrandPicker.selectNone('hoka'); }
function hokaPickerSelectDefaults() { BrandPicker.selectDefaults('hoka'); }
function saveHokaDefaults() { BrandPicker.saveDefaults('hoka'); }
function updateHokaPickerSummary() { BrandPicker._updateSelection('hoka'); BrandPicker._updateSummary('hoka'); }
function toggleTrackerSection(id) { var m = id; if (id === 'newproducts') m = 'new-products'; if (id === 'newcolors') m = 'new-colorways'; BrandPicker.toggleTrackerSection('hoka', m); }
function toggleAllTrackerSection(id, c) { var m = id; if (id === 'newproducts') m = 'new-products'; if (id === 'newcolors') m = 'new-colorways'; BrandPicker.toggleAllInSection('hoka', m, c); }
function confirmNewItems(id) { var m = id; if (id === 'newproducts') m = 'new-products'; if (id === 'newcolors') m = 'new-colorways'; BrandPicker.confirmItems('hoka', m); }
function hideTrackerReport() { var c = document.getElementById('hoka-tracker-report'); if (c) { c.style.display = 'none'; c.innerHTML = ''; } }
function initTrackerStatus() { BrandPicker.initTrackerStatus('hoka'); }

// ON
function showOnPicker(products) { BrandPicker.show('on', products); }
function showOnTrackerReport(comparison) { BrandPicker.showTrackerReport('on', comparison); }
function showOnNewProductButton() { var c = window._onTrackerComparison; var n = 0; if (c) { n = (c.newProducts ? c.newProducts.length : 0) + (c.newColorways ? c.newColorways.length : 0); } if (n > 0) BrandPicker._showNewProductButton('on', n); }
function hideOnNewProductButton() { BrandPicker._hideNewProductButton('on'); }
function downloadOnNewProductCSV() { BrandPicker.downloadNewProductCSV('on'); }
function downloadOnProductCSV() { BrandPicker.downloadProductCSV('on'); }

// ASICS
function showAsicsPicker(products) { BrandPicker.show('asics', products); }
function showAsicsTrackerReport(comparison) { BrandPicker.showTrackerReport('asics', comparison); }
function showAsicsNewProductButton() { var c = window._asicsTrackerComparison; var n = 0; if (c) { n = (c.newProducts ? c.newProducts.length : 0) + (c.newColorways ? c.newColorways.length : 0); } if (n > 0) BrandPicker._showNewProductButton('asics', n); }
function hideAsicsNewProductButton() { BrandPicker._hideNewProductButton('asics'); }
function downloadAsicsNewProductCSV() { BrandPicker.downloadNewProductCSV('asics'); }
function downloadAsicsProductCSV() { BrandPicker.downloadProductCSV('asics'); }

// Brooks
function showBrooksPicker(products) { BrandPicker.show('brooks', products); }
function showBrooksTrackerReport(comparison) { BrandPicker.showTrackerReport('brooks', comparison); }
function showBrooksNewProductButton() { var c = window._brooksTrackerComparison; var n = 0; if (c) { n = (c.newProducts ? c.newProducts.length : 0) + (c.newColorways ? c.newColorways.length : 0); } if (n > 0) BrandPicker._showNewProductButton('brooks', n); }
function hideBrooksNewProductButton() { BrandPicker._hideNewProductButton('brooks'); }
function downloadBrooksNewProductCSV() { BrandPicker.downloadNewProductCSV('brooks'); }
function downloadBrooksProductCSV() { BrandPicker.downloadProductCSV('brooks'); }

// Puma
function showPumaPicker(products) { BrandPicker.show('puma', products); }
function showPumaTrackerReport(comparison) { BrandPicker.showTrackerReport('puma', comparison); }
function showPumaNewProductButton() { BrandPicker._showNewProductButton('puma', 0); }
function hidePumaNewProductButton() { BrandPicker._hideNewProductButton('puma'); }
function downloadPumaNewProductCSV() { BrandPicker.downloadNewProductCSV('puma'); }
function downloadPumaProductCSV() { BrandPicker.downloadProductCSV('puma'); }

// Saucony
function showSauconyPicker(products) { BrandPicker.show('saucony', products); }
function showSauconyTrackerReport(comparison) { BrandPicker.showTrackerReport('saucony', comparison); }
function showSauconyNewProductButton() { BrandPicker._showNewProductButton('saucony', 0); }
function hideSauconyNewProductButton() { BrandPicker._hideNewProductButton('saucony'); }
function downloadSauconyNewProductCSV() { BrandPicker.downloadNewProductCSV('saucony'); }
function downloadSauconyProductCSV() { BrandPicker.downloadProductCSV('saucony'); }

// Init all tracker statuses on load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() { for (var b in BrandPicker.configs) BrandPicker.initTrackerStatus(b); }, 1500);
});