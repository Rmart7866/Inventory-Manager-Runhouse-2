// Saucony Product Picker
var sauconyScannedProducts = [];
var SAUCONY_CATEGORY_ORDER = ['Daily Training', 'Max Cushion', 'Stability', 'Racing / Performance', 'Other'];

function showSauconyPicker(products) {
    sauconyScannedProducts = products;
    var container = document.getElementById('saucony-picker-container');
    if (!container) { console.error('saucony-picker-container not found'); return; }

    var html = '<div class="product-picker" id="saucony-product-picker" style="display: block; margin: 0;">';
    html += '<div class="product-picker-header" style="background: linear-gradient(135deg, #e31837 0%, #b8132d 100%);">';
    html += '<h4>Select Products to Include</h4>';
    html += '<div class="product-picker-actions">';
    html += '<button class="picker-action-btn" onclick="sauconyPickerSelectAll()">Select All</button>';
    html += '<button class="picker-action-btn" onclick="sauconyPickerSelectNone()">Select None</button>';
    html += '<button class="picker-action-btn" onclick="sauconyPickerSelectDefaults()">Defaults</button>';
    html += '<button class="picker-save-defaults-btn" id="saucony-save-defaults-btn" onclick="saveSauconyDefaults()">Save as Defaults</button>';
    html += '</div></div>';

    html += '<div class="product-picker-summary" id="saucony-picker-summary" style="background: #fde8eb; color: #e31837;">';
    html += '<span id="saucony-picker-count">0 products selected</span>';
    html += '<span id="saucony-picker-rows">0 rows</span></div>';

    html += '<div class="product-picker-body">';
    var knownProducts = SauconyConverter._knownProducts || null;
    var categorized = {};
    SAUCONY_CATEGORY_ORDER.forEach(function(c) { categorized[c] = []; });
    products.forEach(function(p) { var c = p.category || 'Other'; if (!categorized[c]) categorized[c] = []; categorized[c].push(p); });

    SAUCONY_CATEGORY_ORDER.forEach(function(catName) {
        var catProducts = categorized[catName];
        if (!catProducts || catProducts.length === 0) return;
        var catId = catName.replace(/[^a-zA-Z]/g, '');
        html += '<div class="product-category"><div class="product-category-header">';
        html += '<span>' + catName.toUpperCase() + ' (' + catProducts.length + ')</span>';
        html += '<button class="category-toggle-btn" onclick="toggleSauconyCategory(\'' + catId + '\')">Toggle All</button>';
        html += '</div><div class="product-category-items" data-saucony-category="' + catId + '">';

        catProducts.sort(function(a, b) { return a.name.localeCompare(b.name); });
        catProducts.forEach(function(product) {
            var modelForCheck = product.model || product.name;
            var isChecked = knownProducts ? knownProducts.has(modelForCheck) : true;
            var isNew = knownProducts && !knownProducts.has(modelForCheck);
            var colorCount = product.colorways ? product.colorways.length : 0;
            var inventoryClass = product.totalInventory > 0 ? 'inventory-count' : 'zero-inventory';

            html += '<div class="product-item' + (isNew ? ' is-new' : '') + '">';
            html += '<input type="checkbox" class="saucony-picker-cb" data-model="' + product.name.replace(/"/g, '&quot;') + '" data-model-base="' + (product.model || product.name).replace(/"/g, '&quot;') + '" ' + (isChecked ? 'checked' : '') + '>';
            html += '<span class="product-item-name">' + product.name + '</span>';
            if (isNew) html += '<span class="product-new-badge" style="background: #fff3cd; color: #856404;">NEW</span>';
            html += '<span class="product-item-stats">' + colorCount + ' color' + (colorCount !== 1 ? 's' : '') + ' · ' + product.rowCount + ' rows · <span class="' + inventoryClass + '">' + product.totalInventory.toLocaleString() + ' units</span></span>';
            html += '</div>';
        });
        html += '</div></div>';
    });
    html += '</div></div>';

    container.innerHTML = html;
    container.style.display = 'block';

    document.querySelectorAll('.saucony-picker-cb').forEach(function(cb) {
        cb.addEventListener('change', function() { updateSauconyPickerSelection(); updateSauconyPickerSummary(); });
        cb.closest('.product-item').addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        });
    });
    updateSauconyPickerSelection(); updateSauconyPickerSummary();
}

function updateSauconyPickerSelection() {
    SauconyConverter.selectedProducts = new Set();
    document.querySelectorAll('.saucony-picker-cb').forEach(function(cb) {
        if (cb.checked) SauconyConverter.selectedProducts.add(cb.getAttribute('data-model'));
    });
}

function updateSauconyPickerSummary() {
    var cbs = document.querySelectorAll('.saucony-picker-cb');
    var total = cbs.length, selected = 0, totalRows = 0;
    cbs.forEach(function(cb) {
        if (cb.checked) { selected++; var mn = cb.getAttribute('data-model'); sauconyScannedProducts.forEach(function(p) { if (p.name === mn) totalRows += p.rowCount; }); }
    });
    var ce = document.getElementById('saucony-picker-count');
    var re = document.getElementById('saucony-picker-rows');
    if (ce) ce.textContent = selected + ' of ' + total + ' products selected';
    if (re) re.textContent = totalRows.toLocaleString() + ' rows';
}

function sauconyPickerSelectAll() { document.querySelectorAll('.saucony-picker-cb').forEach(function(cb) { cb.checked = true; }); updateSauconyPickerSelection(); updateSauconyPickerSummary(); }
function sauconyPickerSelectNone() { document.querySelectorAll('.saucony-picker-cb').forEach(function(cb) { cb.checked = false; }); updateSauconyPickerSelection(); updateSauconyPickerSummary(); }
function sauconyPickerSelectDefaults() {
    var kp = SauconyConverter._knownProducts;
    document.querySelectorAll('.saucony-picker-cb').forEach(function(cb) { cb.checked = kp ? kp.has(cb.getAttribute('data-model-base')) : true; });
    updateSauconyPickerSelection(); updateSauconyPickerSummary();
}

function saveSauconyDefaults() {
    var btn = document.getElementById('saucony-save-defaults-btn'); if (!btn) return;
    var selected = [];
    document.querySelectorAll('.saucony-picker-cb:checked').forEach(function(cb) { selected.push(cb.getAttribute('data-model')); });
    if (typeof db !== 'undefined') {
        db.collection('picker-defaults').doc('saucony').set({ models: selected, updatedAt: new Date().toISOString() })
        .then(function() { btn.textContent = 'Saved!'; btn.classList.add('picker-saved'); setTimeout(function() { btn.textContent = 'Save as Defaults'; btn.classList.remove('picker-saved'); }, 2000); })
        .catch(function(err) { console.error(err); btn.textContent = 'Error'; setTimeout(function() { btn.textContent = 'Save as Defaults'; }, 2000); });
    }
}

function toggleSauconyCategory(catId) {
    var items = document.querySelectorAll('[data-saucony-category="' + catId + '"] .saucony-picker-cb');
    if (items.length === 0) return;
    var allChecked = true; items.forEach(function(cb) { if (!cb.checked) allChecked = false; });
    items.forEach(function(cb) { cb.checked = !allChecked; });
    updateSauconyPickerSelection(); updateSauconyPickerSummary();
}

// ========== TRACKER REPORT ==========
function showSauconyTrackerReport(comparison) {
    var container = document.getElementById('saucony-tracker-report'); if (!container) return;
    window._sauconyTrackerComparison = comparison;

    if (!comparison || (!comparison.newProducts.length && !comparison.newColorways.length && !comparison.removedColorways.length)) {
        container.innerHTML = '<div class="tracker-report" style="display:block;"><div class="tracker-report-header"><h4>No changes detected</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div><div style="padding:16px;text-align:center;color:#155724;font-size:14px;">All products match Shopify database.</div></div>';
        container.style.display = 'block'; hideSauconyNewProductButton(); return;
    }

    var s = comparison.summary || {};
    var html = '<div class="tracker-report" style="display:block;"><div class="tracker-report-header"><h4>Inventory Tracker</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div>';
    html += '<div class="tracker-stats">';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (s.totalInATS || 0) + '</span><span class="tracker-stat-label">In ATS File</span></div>';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (s.totalInDB || 0) + '</span><span class="tracker-stat-label">On Shopify</span></div>';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + (s.matchingColorways || 0) + '</span><span class="tracker-stat-label">Matched</span></div>';
    if (comparison.newProducts && comparison.newProducts.length > 0) html += '<div class="tracker-stat tracker-stat-new-product"><span class="tracker-stat-number">+' + comparison.newProducts.length + '</span><span class="tracker-stat-label">New Products</span></div>';
    if (comparison.newColorways && comparison.newColorways.length > 0) html += '<div class="tracker-stat tracker-stat-new"><span class="tracker-stat-number">+' + comparison.newColorways.length + '</span><span class="tracker-stat-label">New Colors</span></div>';
    if (comparison.removedColorways && comparison.removedColorways.length > 0) html += '<div class="tracker-stat tracker-stat-removed"><span class="tracker-stat-number">-' + comparison.removedColorways.length + '</span><span class="tracker-stat-label">Removed</span></div>';
    html += '</div>';

    if (comparison.newProducts && comparison.newProducts.length > 0) {
        html += '<div class="tracker-section tracker-new-products"><div class="tracker-section-header" onclick="toggleSauconyTrackerSection(\'new-products\')"><span>New Products (' + comparison.newProducts.length + ')</span><span class="tracker-toggle" id="saucony-tracker-toggle-new-products">&#9660;</span></div><div class="tracker-section-body" id="saucony-tracker-body-new-products">';
        comparison.newProducts.forEach(function(p) { html += '<div class="tracker-item tracker-item-new-product"><span class="tracker-item-badge tracker-badge-new-product">NEW PRODUCT</span><span class="tracker-item-name">' + (p.title || p.handle) + '</span><span class="tracker-item-detail">' + (p.variantCount || 0) + ' sizes</span></div>'; });
        html += '</div></div>';
    }
    if (comparison.newColorways && comparison.newColorways.length > 0) {
        html += '<div class="tracker-section tracker-added"><div class="tracker-section-header" onclick="toggleSauconyTrackerSection(\'new-colorways\')"><span>New Colorways (' + comparison.newColorways.length + ')</span><span class="tracker-toggle" id="saucony-tracker-toggle-new-colorways">&#9660;</span></div><div class="tracker-section-body" id="saucony-tracker-body-new-colorways">';
        comparison.newColorways.forEach(function(c) { html += '<div class="tracker-item"><span class="tracker-item-badge tracker-badge-new">NEW COLOR</span><span class="tracker-item-name">' + (c.title || c.handle) + '</span><span class="tracker-item-detail">' + (c.variantCount || 0) + ' sizes</span></div>'; });
        html += '</div></div>';
    }
    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
        html += '<div class="tracker-section tracker-removed"><div class="tracker-section-header" onclick="toggleSauconyTrackerSection(\'removed\')"><span>Removed (' + comparison.removedColorways.length + ') &mdash; zeroed out</span><span class="tracker-toggle" id="saucony-tracker-toggle-removed">&#9660;</span></div><div class="tracker-section-body" id="saucony-tracker-body-removed">';
        comparison.removedColorways.forEach(function(r) { html += '<div class="tracker-item"><span class="tracker-item-badge tracker-badge-removed">GONE</span><span class="tracker-item-name">' + (r.title || r.handle) + '</span></div>'; });
        html += '</div></div>';
    }
    html += '</div>';
    container.innerHTML = html; container.style.display = 'block';
    if ((comparison.newProducts && comparison.newProducts.length > 0) || (comparison.newColorways && comparison.newColorways.length > 0)) showSauconyNewProductButton(); else hideSauconyNewProductButton();
}

function toggleSauconyTrackerSection(id) {
    var b = document.getElementById('saucony-tracker-body-' + id), t = document.getElementById('saucony-tracker-toggle-' + id);
    if (b) { var h = b.style.display === 'none'; b.style.display = h ? 'block' : 'none'; if (t) t.innerHTML = h ? '&#9660;' : '&#9654;'; }
}

function showSauconyNewProductButton() { var b = document.getElementById('saucony-new-product-csv-btn'); if (b) b.style.display = 'block'; }
function hideSauconyNewProductButton() { var b = document.getElementById('saucony-new-product-csv-btn'); if (b) b.style.display = 'none'; }

function downloadSauconyNewProductCSV() {
    var c = window._sauconyTrackerComparison; if (!c) { alert('No tracker data.'); return; }
    var csv = SauconyConverter.generateNewProductCSV(c); if (!csv) { alert('No new products.'); return; }
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = 'saucony-NEW-products-' + new Date().toISOString().split('T')[0] + '.csv'; link.click();
}

function downloadSauconyProductCSV() {
    var allHandles = new Set();
    SauconyConverter.scannedProducts.forEach(function(p) { if (p.colorways) p.colorways.forEach(function(c) { allHandles.add(c.handle); }); });
    var fake = { newProducts: [], newColorways: Array.from(allHandles).map(function(h) { return { handle: h }; }), removedColorways: [] };
    var csv = SauconyConverter.generateNewProductCSV(fake); if (!csv) { alert('No data.'); return; }
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = 'saucony-products-' + new Date().toISOString().split('T')[0] + '.csv'; link.click();
}
