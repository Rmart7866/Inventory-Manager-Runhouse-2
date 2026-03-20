// ========== UNIFIED BRAND PICKER ==========
// Flat alphabetical product list. Universal UI for all brands.

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
        var knownProducts = config.converter._knownProducts || null;

        // Sort alphabetically
        var sorted = products.slice().sort(function(a, b) { return a.name.localeCompare(b.name); });

        var html = '<div class="bp-picker">';

        // Header bar
        html += '<div class="bp-header" style="background:' + config.headerGradient + ';">';
        html += '<span class="bp-header-title">' + config.vendorName + ' Products</span>';
        html += '<div class="bp-header-actions">';
        html += '<button class="bp-action-btn" onclick="BrandPicker.selectAll(\'' + brand + '\')">All</button>';
        html += '<button class="bp-action-btn" onclick="BrandPicker.selectNone(\'' + brand + '\')">None</button>';
        html += '<button class="bp-action-btn" onclick="BrandPicker.selectDefaults(\'' + brand + '\')">Defaults</button>';
        html += '<button class="bp-action-btn bp-save-btn" id="' + brand + '-save-defaults-btn" onclick="BrandPicker.saveDefaults(\'' + brand + '\')">Save Defaults</button>';
        html += '</div></div>';

        // Summary
        html += '<div class="bp-summary">';
        html += '<span id="' + brand + '-picker-count">0 / ' + sorted.length + ' selected</span>';
        html += '<span id="' + brand + '-picker-rows">0 rows</span>';
        html += '</div>';

        // Product list
        html += '<div class="bp-list">';

        sorted.forEach(function(product) {
            var modelKey = product.model || product.name;
            var isChecked = knownProducts ? knownProducts.has(modelKey) : true;
            var isNew = knownProducts && !knownProducts.has(modelKey);
            if (product.isDefault !== undefined) { isChecked = product.isDefault; isNew = !product.isDefault; }

            var colorCount = product.colorways ? product.colorways.length : 0;
            var rows = product.rowCount || product.rows || 0;
            var inventory = product.totalInventory || product.inventory || 0;

            html += '<label class="bp-item' + (isNew ? ' bp-item-new' : '') + '">';
            html += '<input type="checkbox" class="' + cbClass + '" data-model="' + product.name.replace(/"/g, '&quot;') + '" data-model-base="' + (product.model || product.name).replace(/"/g, '&quot;') + '" data-rows="' + rows + '" ' + (isChecked ? 'checked' : '') + '>';
            html += '<span class="bp-item-name">' + product.name + '</span>';
            if (isNew) html += '<span class="bp-new-tag">NEW</span>';
            html += '<span class="bp-item-meta">';
            if (colorCount > 0) html += colorCount + 'c · ';
            html += rows + 'r · ' + (inventory > 0 ? '<span class="bp-inv-pos">' + inventory.toLocaleString() + '</span>' : '<span class="bp-inv-zero">0</span>');
            html += '</span></label>';
        });

        html += '</div></div>';
        container.innerHTML = html;
        container.style.display = 'block';

        // Wire checkboxes
        var self = this;
        document.querySelectorAll('.' + cbClass).forEach(function(cb) {
            cb.addEventListener('change', function() { self._updateSelection(brand); self._updateSummary(brand); });
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
        if (countEl) countEl.textContent = selected + ' / ' + total + ' selected';
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
                btn.textContent = '✓ Saved'; btn.classList.add('bp-saved'); btn.disabled = false;
                setTimeout(function() { btn.textContent = 'Save Defaults'; btn.classList.remove('bp-saved'); }, 3000);
            }).catch(function(err) { btn.textContent = 'Error'; btn.disabled = false; });
        } else {
            db.collection('picker-defaults').doc(brand).set({ models: selected, updatedAt: new Date().toISOString() })
            .then(function() {
                btn.textContent = '✓ Saved'; btn.classList.add('bp-saved'); btn.disabled = false;
                setTimeout(function() { btn.textContent = 'Save Defaults'; btn.classList.remove('bp-saved'); }, 2000);
            }).catch(function() {
                btn.textContent = 'Error'; btn.disabled = false;
                setTimeout(function() { btn.textContent = 'Save Defaults'; }, 2000);
            });
        }
    },

    // ========== TRACKER REPORT ==========
    showTrackerReport: function(brand, comparison) {
        var config = this.configs[brand];
        var container = document.getElementById(config.trackerId);
        if (!container) return;

        window[config.comparisonKey] = comparison;

        if (!comparison || (!comparison.newProducts.length && !comparison.newColorways.length && !comparison.removedColorways.length)) {
            container.innerHTML = '<div class="bp-tracker"><div class="bp-tracker-header"><span>No changes detected</span><span class="bp-ts">' + new Date().toLocaleString() + '</span></div><div style="padding:16px;text-align:center;color:#16a34a;font-size:13px;">All products match Shopify.</div></div>';
            container.style.display = 'block';
            this._hideNewProductButton(brand);
            return;
        }

        var summary = comparison.summary || {};
        var html = '<div class="bp-tracker">';

        html += '<div class="bp-tracker-header"><span>Inventory Tracker</span><span class="bp-ts">' + new Date().toLocaleString() + '</span></div>';

        html += '<div class="bp-stats">';
        html += '<div class="bp-stat"><span class="bp-stat-num">' + (summary.totalInATS || 0) + '</span><span class="bp-stat-lbl">In File</span></div>';
        html += '<div class="bp-stat"><span class="bp-stat-num">' + (summary.totalInDB || 0) + '</span><span class="bp-stat-lbl">Shopify</span></div>';
        html += '<div class="bp-stat"><span class="bp-stat-num">' + (summary.matchingColorways || 0) + '</span><span class="bp-stat-lbl">Matched</span></div>';
        if (comparison.newProducts && comparison.newProducts.length > 0) html += '<div class="bp-stat bp-stat-warn"><span class="bp-stat-num">+' + comparison.newProducts.length + '</span><span class="bp-stat-lbl">New Products</span></div>';
        if (comparison.newColorways && comparison.newColorways.length > 0) html += '<div class="bp-stat bp-stat-green"><span class="bp-stat-num">+' + comparison.newColorways.length + '</span><span class="bp-stat-lbl">New Colors</span></div>';
        if (comparison.removedColorways && comparison.removedColorways.length > 0) html += '<div class="bp-stat bp-stat-red"><span class="bp-stat-num">-' + comparison.removedColorways.length + '</span><span class="bp-stat-lbl">Removed</span></div>';
        html += '</div>';

        if (comparison.newProducts && comparison.newProducts.length > 0) {
            html += this._buildTrackerSection(brand, 'new-products', 'New Products', comparison.newProducts, 'warn', true);
        }
        if (comparison.newColorways && comparison.newColorways.length > 0) {
            html += this._buildTrackerSection(brand, 'new-colorways', 'New Colorways', comparison.newColorways, 'green', true);
        }
        if (comparison.removedColorways && comparison.removedColorways.length > 0) {
            var prefix = brand + '-tracker';
            html += '<div class="bp-section bp-section-red">';
            html += '<div class="bp-section-head" onclick="BrandPicker.toggleTrackerSection(\'' + brand + '\',\'removed\')"><span>Removed (' + comparison.removedColorways.length + ') — zeroed out</span><span class="bp-toggle" id="' + prefix + '-toggle-removed">▾</span></div>';
            html += '<div class="bp-section-body" id="' + prefix + '-body-removed" style="display:none;">';
            comparison.removedColorways.forEach(function(r) {
                var vc = Object.keys(r.variants || {}).length;
                html += '<div class="bp-row"><span class="bp-tag bp-tag-red">GONE</span><span class="bp-row-name">' + (r.title || r.handle) + '</span><span class="bp-row-detail">' + vc + ' sizes → 0</span></div>';
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

    _buildTrackerSection: function(brand, sectionId, label, items, colorClass, hasConfirm) {
        var prefix = brand + '-tracker';
        var groups = {};
        items.forEach(function(item) { var m = item.modelName || item.model || 'Unknown'; if (!groups[m]) groups[m] = []; groups[m].push(item); });

        var html = '<div class="bp-section bp-section-' + colorClass + '">';
        html += '<div class="bp-section-head" onclick="BrandPicker.toggleTrackerSection(\'' + brand + '\',\'' + sectionId + '\')"><span>' + label + ' (' + items.length + ')</span><span class="bp-toggle" id="' + prefix + '-toggle-' + sectionId + '">▾</span></div>';
        html += '<div class="bp-section-body" id="' + prefix + '-body-' + sectionId + '" style="display:none;">';

        Object.keys(groups).sort().forEach(function(mName) {
            var groupItems = groups[mName];
            html += '<div class="bp-model-group"><div class="bp-model-name">' + mName + ' (' + groupItems.length + ')</div>';
            groupItems.forEach(function(item) {
                var tagClass = colorClass === 'warn' ? 'bp-tag-warn' : 'bp-tag-green';
                html += '<div class="bp-row"><input type="checkbox" class="bp-confirm-cb" data-handle="' + item.handle + '" data-title="' + (item.title || '').replace(/"/g, '&quot;') + '" data-variants=\'' + JSON.stringify(item.variants || {}).replace(/'/g, '&#39;') + '\' data-model="' + mName.replace(/"/g, '&quot;') + '"><span class="bp-tag ' + tagClass + '">NEW</span><span class="bp-row-name">' + (item.title || item.handle) + '</span><span class="bp-row-detail">' + (item.variantCount || 0) + ' sizes</span></div>';
            });
            html += '</div>';
        });

        if (hasConfirm) {
            html += '<div class="bp-confirm-bar"><label class="bp-select-all"><input type="checkbox" onchange="BrandPicker.toggleAllInSection(\'' + brand + '\',\'' + sectionId + '\',this.checked)"> Select All</label>';
            html += '<button class="bp-confirm-btn" onclick="BrandPicker.confirmItems(\'' + brand + '\',\'' + sectionId + '\')">✓ Confirm on Shopify</button></div>';
        }

        html += '</div></div>';
        return html;
    },

    toggleTrackerSection: function(brand, sectionId) {
        var body = document.getElementById(brand + '-tracker-body-' + sectionId);
        var toggle = document.getElementById(brand + '-tracker-toggle-' + sectionId);
        if (!body) return;
        var hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        if (toggle) toggle.textContent = hidden ? '▾' : '▸';
    },

    toggleAllInSection: function(brand, sectionId, checked) {
        var body = document.getElementById(brand + '-tracker-body-' + sectionId);
        if (!body) return;
        body.querySelectorAll('.bp-confirm-cb').forEach(function(cb) { cb.checked = checked; });
    },

    // ========== CONFIRM TO FIRESTORE ==========
    confirmItems: function(brand, sectionId) {
        if (typeof InventoryTracker === 'undefined' || typeof db === 'undefined') { alert('Firestore not available'); return; }

        var body = document.getElementById(brand + '-tracker-body-' + sectionId);
        if (!body) return;
        var checkboxes = body.querySelectorAll('.bp-confirm-cb:checked');
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

        var btn = body.querySelector('.bp-confirm-btn');
        if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }

        var newModels = [];
        modelNames.forEach(function(name) { if (!InventoryTracker.isKnownModel(name, brand)) newModels.push(name); });

        var promises = [InventoryTracker.confirmColorways(brand, colorwayData)];
        if (newModels.length > 0) promises.push(InventoryTracker.confirmModels(brand, newModels));

        Promise.all(promises).then(function() {
            if (btn) { btn.textContent = '✓ Saved ' + colorwayData.length; btn.className = 'bp-confirm-btn bp-confirmed'; }
            for (var j = 0; j < checkboxes.length; j++) {
                var item = checkboxes[j].closest('.bp-row');
                if (item) { item.style.opacity = '0.5'; var badge = item.querySelector('.bp-tag'); if (badge) { badge.textContent = 'SAVED'; badge.className = 'bp-tag bp-tag-saved'; } }
            }
        }).catch(function(err) { if (btn) { btn.textContent = 'Error'; btn.disabled = false; } });
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
                badge.textContent = 'Tracking: ' + status.modelCount + ' models, ' + status.productCount + ' colorways';
                badge.className = 'bp-badge bp-badge-ok';
            } else if (status.connected && !status.hasData) {
                badge.textContent = 'Connected — no data (run seed)';
                badge.className = 'bp-badge bp-badge-warn';
            } else {
                badge.textContent = 'Offline — ' + (status.error || 'check config');
                badge.className = 'bp-badge bp-badge-err';
            }
            badge.style.display = 'block';
        });
    }
};

// ========== BRAND REGISTRATIONS ==========
if (typeof HokaConverter !== 'undefined') {
    BrandPicker.register('hoka', {
        converter: HokaConverter, containerId: 'hoka-picker-container', trackerId: 'hoka-tracker-report',
        headerGradient: 'linear-gradient(135deg, #00BFFF 0%, #1E90FF 100%)',
        comparisonKey: '_hokaTrackerComparison', vendorName: 'HOKA', checkboxClass: 'hoka-picker-cb'
    });
}
if (typeof OnConverter !== 'undefined') {
    BrandPicker.register('on', {
        converter: OnConverter, containerId: 'on-picker-container', trackerId: 'on-tracker-report',
        headerGradient: 'linear-gradient(135deg, #333 0%, #1a1a1a 100%)',
        comparisonKey: '_onTrackerComparison', vendorName: 'ON Running', checkboxClass: 'on-picker-cb'
    });
}
if (typeof AsicsConverter !== 'undefined') {
    BrandPicker.register('asics', {
        converter: AsicsConverter, containerId: 'asics-picker-container', trackerId: 'asics-tracker-report',
        headerGradient: 'linear-gradient(135deg, #003DA5 0%, #001E62 100%)',
        comparisonKey: '_asicsTrackerComparison', vendorName: 'ASICS', checkboxClass: 'asics-picker-cb'
    });
}
if (typeof BrooksConverter !== 'undefined') {
    BrandPicker.register('brooks', {
        converter: BrooksConverter, containerId: 'brooks-picker-container', trackerId: 'brooks-tracker-report',
        headerGradient: 'linear-gradient(135deg, #1a2b4a 0%, #0d1b2a 100%)',
        comparisonKey: '_brooksTrackerComparison', vendorName: 'Brooks', checkboxClass: 'brooks-picker-cb'
    });
}
if (typeof PumaConverter !== 'undefined') {
    BrandPicker.register('puma', {
        converter: PumaConverter, containerId: 'puma-picker-container', trackerId: 'puma-tracker-report',
        headerGradient: 'linear-gradient(135deg, #000 0%, #1a1a1a 100%)',
        comparisonKey: '_pumaTrackerComparison', vendorName: 'Puma', checkboxClass: 'puma-picker-cb'
    });
}
if (typeof SauconyConverter !== 'undefined') {
    BrandPicker.register('saucony', {
        converter: SauconyConverter, containerId: 'saucony-picker-container', trackerId: 'saucony-tracker-report',
        headerGradient: 'linear-gradient(135deg, #e31837 0%, #b8132d 100%)',
        comparisonKey: '_sauconyTrackerComparison', vendorName: 'Saucony', checkboxClass: 'saucony-picker-cb'
    });
}

// ========== GLOBAL FUNCTION WRAPPERS (backward compat) ==========
function buildHokaProductPicker(products) { BrandPicker.show('hoka', products); }
function showHokaProductCSVButton() { BrandPicker.showProductCSVButton('hoka'); }
function hideHokaProductCSVButton() { BrandPicker.hideProductCSVButton('hoka'); }
function showTrackerReport(comparison) { BrandPicker.showTrackerReport('hoka', comparison); }
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

function showOnPicker(products) { BrandPicker.show('on', products); }
function showOnTrackerReport(comparison) { BrandPicker.showTrackerReport('on', comparison); }
function showOnNewProductButton() { var c = window._onTrackerComparison; var n = 0; if (c) { n = (c.newProducts ? c.newProducts.length : 0) + (c.newColorways ? c.newColorways.length : 0); } if (n > 0) BrandPicker._showNewProductButton('on', n); }
function hideOnNewProductButton() { BrandPicker._hideNewProductButton('on'); }
function downloadOnProductCSV() { BrandPicker.downloadProductCSV('on'); }

function showAsicsPicker(products) { BrandPicker.show('asics', products); }
function showAsicsTrackerReport(comparison) { BrandPicker.showTrackerReport('asics', comparison); }
function showAsicsNewProductButton() { var c = window._asicsTrackerComparison; var n = 0; if (c) { n = (c.newProducts ? c.newProducts.length : 0) + (c.newColorways ? c.newColorways.length : 0); } if (n > 0) BrandPicker._showNewProductButton('asics', n); }
function hideAsicsNewProductButton() { BrandPicker._hideNewProductButton('asics'); }
function downloadAsicsProductCSV() { BrandPicker.downloadProductCSV('asics'); }

function showBrooksPicker(products) { BrandPicker.show('brooks', products); }
function showBrooksTrackerReport(comparison) { BrandPicker.showTrackerReport('brooks', comparison); }
function showBrooksNewProductButton() { var c = window._brooksTrackerComparison; var n = 0; if (c) { n = (c.newProducts ? c.newProducts.length : 0) + (c.newColorways ? c.newColorways.length : 0); } if (n > 0) BrandPicker._showNewProductButton('brooks', n); }
function hideBrooksNewProductButton() { BrandPicker._hideNewProductButton('brooks'); }
function downloadBrooksProductCSV() { BrandPicker.downloadProductCSV('brooks'); }

function showPumaPicker(products) { BrandPicker.show('puma', products); }
function showPumaTrackerReport(comparison) { BrandPicker.showTrackerReport('puma', comparison); }
function showPumaNewProductButton() { BrandPicker._showNewProductButton('puma', 0); }
function hidePumaNewProductButton() { BrandPicker._hideNewProductButton('puma'); }
function downloadPumaProductCSV() { BrandPicker.downloadProductCSV('puma'); }

function showSauconyPicker(products) { BrandPicker.show('saucony', products); }
function showSauconyTrackerReport(comparison) { BrandPicker.showTrackerReport('saucony', comparison); }
function showSauconyNewProductButton() { BrandPicker._showNewProductButton('saucony', 0); }
function hideSauconyNewProductButton() { BrandPicker._hideNewProductButton('saucony'); }
function downloadSauconyProductCSV() { BrandPicker.downloadProductCSV('saucony'); }

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() { for (var b in BrandPicker.configs) BrandPicker.initTrackerStatus(b); }, 1500);
});