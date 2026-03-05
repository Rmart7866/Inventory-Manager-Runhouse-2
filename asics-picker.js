// ASICS Product Picker - Uses same CSS classes as HOKA/ON picker
var asicsScannedProducts = [];

var ASICS_CATEGORY_ORDER = [
    'Neutral Running',
    'Stability Running',
    'Racing / Performance',
    'Other'
];

function showAsicsPicker(products) {
    asicsScannedProducts = products;
    var container = document.getElementById('asics-picker-container');
    if (!container) {
        console.error('asics-picker-container not found in DOM');
        return;
    }

    var html = '';
    html += '<div class="product-picker" id="asics-product-picker" style="display: block; margin: 0;">';

    // Header - ASICS blue gradient
    html += '<div class="product-picker-header" style="background: linear-gradient(135deg, #003DA5 0%, #001E62 100%);">';
    html += '<h4>Select Products to Include</h4>';
    html += '<div class="product-picker-actions">';
    html += '<button class="picker-action-btn" onclick="asicsPickerSelectAll()">Select All</button>';
    html += '<button class="picker-action-btn" onclick="asicsPickerSelectNone()">Select None</button>';
    html += '<button class="picker-action-btn" onclick="asicsPickerSelectDefaults()">Defaults</button>';
    html += '<button class="picker-save-defaults-btn" id="asics-save-defaults-btn" onclick="saveAsicsDefaults()">Save as Defaults</button>';
    html += '</div>';
    html += '</div>';

    // Summary bar
    html += '<div class="product-picker-summary" id="asics-picker-summary" style="background: #e8f0fe; color: #003DA5;">';
    html += '<span id="asics-picker-count">0 products selected</span>';
    html += '<span id="asics-picker-rows">0 rows</span>';
    html += '</div>';

    // Body
    html += '<div class="product-picker-body" id="asics-picker-body">';

    var knownProducts = AsicsConverter._knownProducts || null;

    // Group by category
    var categorized = {};
    ASICS_CATEGORY_ORDER.forEach(function(cat) { categorized[cat] = []; });

    products.forEach(function(product) {
        var cat = product.category || 'Other';
        if (!categorized[cat]) categorized[cat] = [];
        categorized[cat].push(product);
    });

    ASICS_CATEGORY_ORDER.forEach(function(catName) {
        var catProducts = categorized[catName];
        if (!catProducts || catProducts.length === 0) return;

        var catId = catName.replace(/[^a-zA-Z]/g, '');

        html += '<div class="product-category">';
        html += '<div class="product-category-header">';
        html += '<span>' + catName.toUpperCase() + ' (' + catProducts.length + ')</span>';
        html += '<button class="category-toggle-btn" onclick="toggleAsicsCategory(\'' + catId + '\')">Toggle All</button>';
        html += '</div>';

        html += '<div class="product-category-items" data-asics-category="' + catId + '">';

        catProducts.sort(function(a, b) {
            var gComp = (a.gender || '').localeCompare(b.gender || '');
            if (gComp !== 0) return gComp;
            return a.name.localeCompare(b.name);
        });

        catProducts.forEach(function(product) {
            // knownProducts stores model names without gender (e.g. "GEL-NIMBUS 27")
            // product.name includes gender (e.g. "Men's GEL-NIMBUS 27")
            // Check if the model part (product.model) is in knownProducts
            var modelForCheck = product.model || product.name;
            var isChecked = knownProducts ? knownProducts.has(modelForCheck) : true;
            var isNew = knownProducts && !knownProducts.has(modelForCheck);
            var colorCount = product.colorways ? product.colorways.length : 0;
            var inventoryClass = product.totalInventory > 0 ? 'inventory-count' : 'zero-inventory';

            html += '<div class="product-item' + (isNew ? ' is-new' : '') + '">';
            html += '<input type="checkbox" class="asics-picker-cb" data-model="' + product.name.replace(/"/g, '&quot;') + '" data-model-base="' + (product.model || product.name).replace(/"/g, '&quot;') + '" ' + (isChecked ? 'checked' : '') + '>';
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

        html += '</div>';
        html += '</div>';
    });

    html += '</div>';
    html += '</div>';

    container.innerHTML = html;
    container.style.display = 'block';

    // Wire up checkbox handlers
    var checkboxes = document.querySelectorAll('.asics-picker-cb');
    checkboxes.forEach(function(cb) {
        cb.addEventListener('change', function() {
            updateAsicsPickerSelection();
            updateAsicsPickerSummary();
        });

        cb.closest('.product-item').addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') {
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            }
        });
    });

    updateAsicsPickerSelection();
    updateAsicsPickerSummary();
}

function updateAsicsPickerSelection() {
    AsicsConverter.selectedProducts = new Set();
    document.querySelectorAll('.asics-picker-cb').forEach(function(cb) {
        if (cb.checked) {
            AsicsConverter.selectedProducts.add(cb.getAttribute('data-model'));
        }
    });
}

function updateAsicsPickerSummary() {
    var checkboxes = document.querySelectorAll('.asics-picker-cb');
    var total = checkboxes.length;
    var selected = 0;
    var totalRows = 0;

    checkboxes.forEach(function(cb) {
        if (cb.checked) {
            selected++;
            var modelName = cb.getAttribute('data-model');
            asicsScannedProducts.forEach(function(p) {
                if (p.name === modelName) totalRows += p.rowCount;
            });
        }
    });

    var countEl = document.getElementById('asics-picker-count');
    var rowsEl = document.getElementById('asics-picker-rows');
    if (countEl) countEl.textContent = selected + ' of ' + total + ' products selected';
    if (rowsEl) rowsEl.textContent = totalRows.toLocaleString() + ' rows';
}

function asicsPickerSelectAll() {
    document.querySelectorAll('.asics-picker-cb').forEach(function(cb) { cb.checked = true; });
    updateAsicsPickerSelection();
    updateAsicsPickerSummary();
}

function asicsPickerSelectNone() {
    document.querySelectorAll('.asics-picker-cb').forEach(function(cb) { cb.checked = false; });
    updateAsicsPickerSelection();
    updateAsicsPickerSummary();
}

function asicsPickerSelectDefaults() {
    var knownProducts = AsicsConverter._knownProducts;
    document.querySelectorAll('.asics-picker-cb').forEach(function(cb) {
        var modelBase = cb.getAttribute('data-model-base');
        cb.checked = knownProducts ? knownProducts.has(modelBase) : true;
    });
    updateAsicsPickerSelection();
    updateAsicsPickerSummary();
}

function saveAsicsDefaults() {
    var btn = document.getElementById('asics-save-defaults-btn');
    if (!btn) return;
    var selected = [];
    document.querySelectorAll('.asics-picker-cb:checked').forEach(function(cb) {
        selected.push(cb.getAttribute('data-model'));
    });
    if (typeof db !== 'undefined') {
        db.collection('picker-defaults').doc('asics').set({
            models: selected,
            updatedAt: new Date().toISOString()
        }).then(function() {
            btn.textContent = 'Saved!';
            btn.classList.add('picker-saved');
            setTimeout(function() { btn.textContent = 'Save as Defaults'; btn.classList.remove('picker-saved'); }, 2000);
        }).catch(function(err) {
            console.error('Failed to save ASICS defaults:', err);
            btn.textContent = 'Error saving';
            setTimeout(function() { btn.textContent = 'Save as Defaults'; }, 2000);
        });
    }
}

function toggleAsicsCategory(catId) {
    var items = document.querySelectorAll('[data-asics-category="' + catId + '"] .asics-picker-cb');
    if (items.length === 0) return;
    var allChecked = true;
    items.forEach(function(cb) { if (!cb.checked) allChecked = false; });
    items.forEach(function(cb) { cb.checked = !allChecked; });
    updateAsicsPickerSelection();
    updateAsicsPickerSummary();
}

// ========== TRACKER REPORT ==========
function showAsicsTrackerReport(comparison) {
    var container = document.getElementById('asics-tracker-report');
    if (!container) return;

    window._asicsTrackerComparison = comparison;

    if (!comparison || (!comparison.newProducts.length && !comparison.newColorways.length && !comparison.removedColorways.length)) {
        container.innerHTML = '<div class="tracker-report"><div class="tracker-report-header"><h4>No changes detected</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div><div style="padding: 16px; text-align: center; color: #155724; font-size: 14px;">All products match Shopify database.</div></div>';
        container.querySelector('.tracker-report').style.display = 'block';
        container.style.display = 'block';
        hideAsicsNewProductButton();
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

    // New Products
    if (comparison.newProducts && comparison.newProducts.length > 0) {
        html += '<div class="tracker-section tracker-new-products">';
        html += '<div class="tracker-section-header" onclick="toggleAsicsTrackerSection(\'new-products\')"><span>New Products (' + comparison.newProducts.length + ')</span><span class="tracker-toggle" id="asics-tracker-toggle-new-products">&#9660;</span></div>';
        html += '<div class="tracker-section-body" id="asics-tracker-body-new-products">';
        comparison.newProducts.forEach(function(p) {
            html += '<div class="tracker-item tracker-item-new-product"><span class="tracker-item-badge tracker-badge-new-product">NEW PRODUCT</span><span class="tracker-item-name">' + (p.title || p.handle) + '</span><span class="tracker-item-detail">' + (p.variantCount || 0) + ' sizes</span></div>';
        });
        html += '</div></div>';
    }

    // New Colorways
    if (comparison.newColorways && comparison.newColorways.length > 0) {
        html += '<div class="tracker-section tracker-added">';
        html += '<div class="tracker-section-header" onclick="toggleAsicsTrackerSection(\'new-colorways\')"><span>New Colorways (' + comparison.newColorways.length + ')</span><span class="tracker-toggle" id="asics-tracker-toggle-new-colorways">&#9660;</span></div>';
        html += '<div class="tracker-section-body" id="asics-tracker-body-new-colorways">';
        comparison.newColorways.forEach(function(c) {
            html += '<div class="tracker-item"><span class="tracker-item-badge tracker-badge-new">NEW COLOR</span><span class="tracker-item-name">' + (c.title || c.handle) + '</span><span class="tracker-item-detail">' + (c.variantCount || 0) + ' sizes</span></div>';
        });
        html += '</div></div>';
    }

    // Removed
    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
        html += '<div class="tracker-section tracker-removed">';
        html += '<div class="tracker-section-header" onclick="toggleAsicsTrackerSection(\'removed\')"><span>Removed (' + comparison.removedColorways.length + ') &mdash; zeroed out</span><span class="tracker-toggle" id="asics-tracker-toggle-removed">&#9660;</span></div>';
        html += '<div class="tracker-section-body" id="asics-tracker-body-removed">';
        comparison.removedColorways.forEach(function(r) {
            html += '<div class="tracker-item"><span class="tracker-item-badge tracker-badge-removed">GONE</span><span class="tracker-item-name">' + (r.title || r.handle) + '</span></div>';
        });
        html += '</div></div>';
    }

    html += '</div>';

    container.innerHTML = html;
    container.style.display = 'block';

    if ((comparison.newProducts && comparison.newProducts.length > 0) || (comparison.newColorways && comparison.newColorways.length > 0)) {
        showAsicsNewProductButton();
    } else {
        hideAsicsNewProductButton();
    }
}

function toggleAsicsTrackerSection(sectionId) {
    var body = document.getElementById('asics-tracker-body-' + sectionId);
    var toggle = document.getElementById('asics-tracker-toggle-' + sectionId);
    if (body) {
        var isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (toggle) toggle.innerHTML = isHidden ? '&#9660;' : '&#9654;';
    }
}

function showAsicsNewProductButton() {
    var btn = document.getElementById('asics-new-product-csv-btn');
    if (btn) btn.style.display = 'block';
}

function hideAsicsNewProductButton() {
    var btn = document.getElementById('asics-new-product-csv-btn');
    if (btn) btn.style.display = 'none';
}

function downloadAsicsNewProductCSV() {
    var comparison = window._asicsTrackerComparison;
    if (!comparison) { alert('No tracker data available.'); return; }
    var csvContent = AsicsConverter.generateNewProductCSV(comparison);
    if (!csvContent) { alert('No new products to export.'); return; }
    var today = new Date().toISOString().split('T')[0];
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'asics-NEW-products-' + today + '.csv';
    link.click();
}

function downloadAsicsProductCSV() {
    var allHandles = new Set();
    AsicsConverter.scannedProducts.forEach(function(p) {
        if (p.colorways) p.colorways.forEach(function(c) { allHandles.add(c.handle); });
    });
    var fakeComparison = {
        newProducts: [],
        newColorways: Array.from(allHandles).map(function(h) { return { handle: h }; }),
        removedColorways: []
    };
    var csvContent = AsicsConverter.generateNewProductCSV(fakeComparison);
    if (!csvContent) { alert('No product data.'); return; }
    var today = new Date().toISOString().split('T')[0];
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'asics-products-' + today + '.csv';
    link.click();
}
