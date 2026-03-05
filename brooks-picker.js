// Brooks Product Picker - Uses same CSS classes as HOKA/ON/ASICS picker
var brooksScannedProducts = [];

var BROOKS_CATEGORY_ORDER = [
    'Neutral Running',
    'Stability Running',
    'Other'
];

function showBrooksPicker(products) {
    brooksScannedProducts = products;
    var container = document.getElementById('brooks-picker-container');
    if (!container) { console.error('brooks-picker-container not found'); return; }

    var html = '';
    html += '<div class="product-picker" id="brooks-product-picker" style="display: block; margin: 0;">';

    html += '<div class="product-picker-header" style="background: linear-gradient(135deg, #1a2b4a 0%, #0d1b2a 100%);">';
    html += '<h4>Select Products to Include</h4>';
    html += '<div class="product-picker-actions">';
    html += '<button class="picker-action-btn" onclick="brooksPickerSelectAll()">Select All</button>';
    html += '<button class="picker-action-btn" onclick="brooksPickerSelectNone()">Select None</button>';
    html += '<button class="picker-action-btn" onclick="brooksPickerSelectDefaults()">Defaults</button>';
    html += '<button class="picker-save-defaults-btn" id="brooks-save-defaults-btn" onclick="saveBrooksDefaults()">Save as Defaults</button>';
    html += '</div></div>';

    html += '<div class="product-picker-summary" id="brooks-picker-summary" style="background: #e8eef5; color: #1a2b4a;">';
    html += '<span id="brooks-picker-count">0 products selected</span>';
    html += '<span id="brooks-picker-rows">0 rows</span>';
    html += '</div>';

    html += '<div class="product-picker-body" id="brooks-picker-body">';

    var knownProducts = BrooksConverter._knownProducts || null;

    var categorized = {};
    BROOKS_CATEGORY_ORDER.forEach(function(cat) { categorized[cat] = []; });

    products.forEach(function(product) {
        var cat = product.category || 'Other';
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(product);
    });

    BROOKS_CATEGORY_ORDER.forEach(function(catName) {
        var catProducts = categorized[catName];
        if (!catProducts || catProducts.length === 0) return;

        var catId = catName.replace(/[^a-zA-Z]/g, '');

        html += '<div class="product-category">';
        html += '<div class="product-category-header">';
        html += '<span>' + catName.toUpperCase() + ' (' + catProducts.length + ')</span>';
        html += '<button class="category-toggle-btn" onclick="toggleBrooksCategory(\'' + catId + '\')">Toggle All</button>';
        html += '</div>';

        html += '<div class="product-category-items" data-brooks-category="' + catId + '">';

        catProducts.sort(function(a, b) { return a.name.localeCompare(b.name); });

        catProducts.forEach(function(product) {
            var modelForCheck = product.model || product.name;
            var isChecked = knownProducts ? knownProducts.has(modelForCheck) : true;
            var isNew = knownProducts && !knownProducts.has(modelForCheck);
            var colorCount = product.colorways ? product.colorways.length : 0;
            var inventoryClass = product.totalInventory > 0 ? 'inventory-count' : 'zero-inventory';

            html += '<div class="product-item' + (isNew ? ' is-new' : '') + '">';
            html += '<input type="checkbox" class="brooks-picker-cb" data-model="' + product.name.replace(/"/g, '&quot;') + '" data-model-base="' + (product.model || product.name).replace(/"/g, '&quot;') + '" ' + (isChecked ? 'checked' : '') + '>';
            html += '<span class="product-item-name">' + product.name + '</span>';

            if (isNew) {
                html += '<span class="product-new-badge" style="background: #fff3cd; color: #856404;">NEW</span>';
            }

            html += '<span class="product-item-stats">';
            html += colorCount + ' color' + (colorCount !== 1 ? 's' : '') + ' · ';
            html += product.rowCount + ' rows · ';
            html += '<span class="' + inventoryClass + '">' + product.totalInventory.toLocaleString() + ' units</span>';
            html += '</span>';
            html += '</div>';
        });

        html += '</div></div>';
    });

    html += '</div></div>';

    container.innerHTML = html;
    container.style.display = 'block';

    var checkboxes = document.querySelectorAll('.brooks-picker-cb');
    checkboxes.forEach(function(cb) {
        cb.addEventListener('change', function() {
            updateBrooksPickerSelection();
            updateBrooksPickerSummary();
        });
        cb.closest('.product-item').addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') {
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            }
        });
    });

    updateBrooksPickerSelection();
    updateBrooksPickerSummary();
}

function updateBrooksPickerSelection() {
    BrooksConverter.selectedProducts = new Set();
    document.querySelectorAll('.brooks-picker-cb').forEach(function(cb) {
        if (cb.checked) {
            BrooksConverter.selectedProducts.add(cb.getAttribute('data-model'));
        }
    });
}

function updateBrooksPickerSummary() {
    var checkboxes = document.querySelectorAll('.brooks-picker-cb');
    var total = checkboxes.length, selected = 0, totalRows = 0;
    checkboxes.forEach(function(cb) {
        if (cb.checked) {
            selected++;
            var modelName = cb.getAttribute('data-model');
            brooksScannedProducts.forEach(function(p) {
                if (p.name === modelName) totalRows += p.rowCount;
            });
        }
    });
    var countEl = document.getElementById('brooks-picker-count');
    var rowsEl = document.getElementById('brooks-picker-rows');
    if (countEl) countEl.textContent = selected + ' of ' + total + ' products selected';
    if (rowsEl) rowsEl.textContent = totalRows.toLocaleString() + ' rows';
}

function brooksPickerSelectAll() {
    document.querySelectorAll('.brooks-picker-cb').forEach(function(cb) { cb.checked = true; });
    updateBrooksPickerSelection(); updateBrooksPickerSummary();
}

function brooksPickerSelectNone() {
    document.querySelectorAll('.brooks-picker-cb').forEach(function(cb) { cb.checked = false; });
    updateBrooksPickerSelection(); updateBrooksPickerSummary();
}

function brooksPickerSelectDefaults() {
    var knownProducts = BrooksConverter._knownProducts;
    document.querySelectorAll('.brooks-picker-cb').forEach(function(cb) {
        var modelBase = cb.getAttribute('data-model-base');
        cb.checked = knownProducts ? knownProducts.has(modelBase) : true;
    });
    updateBrooksPickerSelection(); updateBrooksPickerSummary();
}

function saveBrooksDefaults() {
    var btn = document.getElementById('brooks-save-defaults-btn');
    if (!btn) return;
    var selected = [];
    document.querySelectorAll('.brooks-picker-cb:checked').forEach(function(cb) {
        selected.push(cb.getAttribute('data-model'));
    });
    if (typeof db !== 'undefined') {
        db.collection('picker-defaults').doc('brooks').set({
            models: selected, updatedAt: new Date().toISOString()
        }).then(function() {
            btn.textContent = 'Saved!'; btn.classList.add('picker-saved');
            setTimeout(function() { btn.textContent = 'Save as Defaults'; btn.classList.remove('picker-saved'); }, 2000);
        }).catch(function(err) {
            console.error('Failed to save Brooks defaults:', err);
            btn.textContent = 'Error'; setTimeout(function() { btn.textContent = 'Save as Defaults'; }, 2000);
        });
    }
}

function toggleBrooksCategory(catId) {
    var items = document.querySelectorAll('[data-brooks-category="' + catId + '"] .brooks-picker-cb');
    if (items.length === 0) return;
    var allChecked = true;
    items.forEach(function(cb) { if (!cb.checked) allChecked = false; });
    items.forEach(function(cb) { cb.checked = !allChecked; });
    updateBrooksPickerSelection(); updateBrooksPickerSummary();
}

// ========== TRACKER REPORT ==========
function showBrooksTrackerReport(comparison) {
    var container = document.getElementById('brooks-tracker-report');
    if (!container) return;
    window._brooksTrackerComparison = comparison;

    if (!comparison || (!comparison.newProducts.length && !comparison.newColorways.length && !comparison.removedColorways.length)) {
        container.innerHTML = '<div class="tracker-report"><div class="tracker-report-header"><h4>No changes detected</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div><div style="padding: 16px; text-align: center; color: #155724; font-size: 14px;">All products match Shopify database.</div></div>';
        container.querySelector('.tracker-report').style.display = 'block';
        container.style.display = 'block';
        hideBrooksNewProductButton();
        return;
    }

    var summary = comparison.summary || {};
    var html = '<div class="tracker-report" style="display: block;">';
    html += '<div class="tracker-report-header"><h4>Inventory Tracker</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div>';
    html += '<div class="tracker-stats">';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (summary.totalInATS || 0) + '</span><span class="tracker-stat-label">In ATS File</span></div>';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (summary.totalInDB || 0) + '</span><span class="tracker-stat-label">On Shopify</span></div>';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (summary.matchingColorways || 0) + '</span><span class="tracker-stat-label">Matched</span></div>';
    if (comparison.newProducts && comparison.newProducts.length > 0) {
        html += '<div class="tracker-stat tracker-stat-new-product"><span class="tracker-stat-number">+' + comparison.newProducts.length + '</span><span class="tracker-stat-label">New Products</span></div>';
    }
    if (comparison.newColorways && comparison.newColorways.length > 0) {
        html += '<div class="tracker-stat tracker-stat-new"><span class="tracker-stat-number">+' + comparison.newColorways.length + '</span><span class="tracker-stat-label">New Colors</span></div>';
    }
    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
        html += '<div class="tracker-stat tracker-stat-removed"><span class="tracker-stat-number">-' + comparison.removedColorways.length + '</span><span class="tracker-stat-label">Removed</span></div>';
    }
    html += '</div>';

    if (comparison.newProducts && comparison.newProducts.length > 0) {
        html += '<div class="tracker-section tracker-new-products"><div class="tracker-section-header" onclick="toggleBrooksTrackerSection(\'new-products\')"><span>New Products (' + comparison.newProducts.length + ')</span><span class="tracker-toggle" id="brooks-tracker-toggle-new-products">&#9660;</span></div><div class="tracker-section-body" id="brooks-tracker-body-new-products">';
        comparison.newProducts.forEach(function(p) {
            html += '<div class="tracker-item tracker-item-new-product"><span class="tracker-item-badge tracker-badge-new-product">NEW PRODUCT</span><span class="tracker-item-name">' + (p.title || p.handle) + '</span><span class="tracker-item-detail">' + (p.variantCount || 0) + ' sizes</span></div>';
        });
        html += '</div></div>';
    }

    if (comparison.newColorways && comparison.newColorways.length > 0) {
        html += '<div class="tracker-section tracker-added"><div class="tracker-section-header" onclick="toggleBrooksTrackerSection(\'new-colorways\')"><span>New Colorways (' + comparison.newColorways.length + ')</span><span class="tracker-toggle" id="brooks-tracker-toggle-new-colorways">&#9660;</span></div><div class="tracker-section-body" id="brooks-tracker-body-new-colorways">';
        comparison.newColorways.forEach(function(c) {
            html += '<div class="tracker-item"><span class="tracker-item-badge tracker-badge-new">NEW COLOR</span><span class="tracker-item-name">' + (c.title || c.handle) + '</span><span class="tracker-item-detail">' + (c.variantCount || 0) + ' sizes</span></div>';
        });
        html += '</div></div>';
    }

    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
        html += '<div class="tracker-section tracker-removed"><div class="tracker-section-header" onclick="toggleBrooksTrackerSection(\'removed\')"><span>Removed (' + comparison.removedColorways.length + ') &mdash; zeroed out</span><span class="tracker-toggle" id="brooks-tracker-toggle-removed">&#9660;</span></div><div class="tracker-section-body" id="brooks-tracker-body-removed">';
        comparison.removedColorways.forEach(function(r) {
            html += '<div class="tracker-item"><span class="tracker-item-badge tracker-badge-removed">GONE</span><span class="tracker-item-name">' + (r.title || r.handle) + '</span></div>';
        });
        html += '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';

    if ((comparison.newProducts && comparison.newProducts.length > 0) || (comparison.newColorways && comparison.newColorways.length > 0)) {
        showBrooksNewProductButton();
    } else {
        hideBrooksNewProductButton();
    }
}

function toggleBrooksTrackerSection(sectionId) {
    var body = document.getElementById('brooks-tracker-body-' + sectionId);
    var toggle = document.getElementById('brooks-tracker-toggle-' + sectionId);
    if (body) {
        var isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (toggle) toggle.innerHTML = isHidden ? '&#9660;' : '&#9654;';
    }
}

function showBrooksNewProductButton() {
    var btn = document.getElementById('brooks-new-product-csv-btn');
    if (btn) btn.style.display = 'block';
}
function hideBrooksNewProductButton() {
    var btn = document.getElementById('brooks-new-product-csv-btn');
    if (btn) btn.style.display = 'none';
}

function downloadBrooksNewProductCSV() {
    var comparison = window._brooksTrackerComparison;
    if (!comparison) { alert('No tracker data.'); return; }
    var csv = BrooksConverter.generateNewProductCSV(comparison);
    if (!csv) { alert('No new products.'); return; }
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'brooks-NEW-products-' + new Date().toISOString().split('T')[0] + '.csv';
    link.click();
}

function downloadBrooksProductCSV() {
    var allHandles = new Set();
    BrooksConverter.scannedProducts.forEach(function(p) {
        if (p.colorways) p.colorways.forEach(function(c) { allHandles.add(c.handle); });
    });
    var fakeComparison = { newProducts: [], newColorways: Array.from(allHandles).map(function(h) { return { handle: h }; }), removedColorways: [] };
    var csv = BrooksConverter.generateNewProductCSV(fakeComparison);
    if (!csv) { alert('No product data.'); return; }
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'brooks-products-' + new Date().toISOString().split('T')[0] + '.csv';
    link.click();
}
