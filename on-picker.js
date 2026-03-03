// ON Running Product Picker - UI for selecting which ON models to include
// Modeled after hoka-picker.js

// ========== BUILD PICKER UI ==========
function showOnPicker(products) {
    var container = document.getElementById('on-picker-container');
    if (!container) {
        console.error('on-picker-container not found');
        return;
    }

    var categories = new Map();
    products.forEach(function(product) {
        var cat = product.category || 'Other';
        if (!categories.has(cat)) categories.set(cat, []);
        categories.get(cat).push(product);
    });

    var html = '<div style="padding: 15px; background: #1a1a2e; border-radius: 8px; margin-top: 10px;">';
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
    html += '<h3 style="margin: 0; color: #fff; font-size: 16px;">ON Running Product Picker</h3>';
    html += '<div>';
    html += '<button onclick="onPickerSelectAll()" style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px;">Select All</button>';
    html += '<button onclick="onPickerDeselectAll()" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Deselect All</button>';
    html += '</div></div>';

    var knownProducts = OnConverter._knownProducts || null;

    categories.forEach(function(prods, catName) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; border-bottom: 1px solid #333; padding-bottom: 4px;">' + catName + '</div>';

        prods.forEach(function(product) {
            var isChecked = knownProducts ? knownProducts.has(product.name) : true;
            var colorCount = product.colorways ? product.colorways.length : 0;
            var invLabel = product.totalInventory > 0 ? product.totalInventory + ' units' : '0 units';

            html += '<label style="display: flex; align-items: center; padding: 6px 8px; margin: 2px 0; background: #0d1117; border-radius: 4px; cursor: pointer; color: #e0e0e0; font-size: 13px;">';
            html += '<input type="checkbox" class="on-picker-checkbox" data-model="' + product.name.replace(/"/g, '&quot;') + '" ' + (isChecked ? 'checked' : '') + ' style="margin-right: 8px;">';
            html += '<span style="flex: 1;">' + product.gender + ' ' + product.name + '</span>';
            html += '<span style="color: #888; font-size: 11px; margin-left: 8px;">' + colorCount + ' color' + (colorCount !== 1 ? 's' : '') + ' &middot; ' + product.rowCount + ' rows &middot; ' + invLabel + '</span>';
            html += '</label>';
        });
        html += '</div>';
    });

    html += '<div style="margin-top: 12px; text-align: center;">';
    html += '<button onclick="onPickerGenerate()" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 12px 30px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">Generate Inventory</button>';
    html += '</div></div>';

    container.innerHTML = html;
    container.style.display = 'block';
}

function onPickerSelectAll() {
    document.querySelectorAll('.on-picker-checkbox').forEach(function(cb) { cb.checked = true; });
}

function onPickerDeselectAll() {
    document.querySelectorAll('.on-picker-checkbox').forEach(function(cb) { cb.checked = false; });
}

function onPickerGenerate() {
    var selected = new Set();
    document.querySelectorAll('.on-picker-checkbox').forEach(function(cb) {
        if (cb.checked) selected.add(cb.getAttribute('data-model'));
    });
    if (selected.size === 0) { alert('Please select at least one product.'); return; }

    OnConverter.selectedProducts = selected;
    if (typeof convertBrand === 'function') convertBrand('on');
}

// ========== TRACKER REPORT ==========
function showOnTrackerReport(comparison) {
    var container = document.getElementById('on-tracker-report');
    if (!container) return;

    window._onTrackerComparison = comparison;

    if (!comparison || (!comparison.newProducts.length && !comparison.newColorways.length && !comparison.removedColorways.length)) {
        container.innerHTML = '<div style="padding: 10px; background: #1a1a2e; border-radius: 6px; margin-top: 10px; color: #28a745; font-size: 13px;">&check; No changes detected &mdash; all products match Shopify.</div>';
        container.style.display = 'block';
        hideOnNewProductButton();
        return;
    }

    var html = '<div style="padding: 15px; background: #1a1a2e; border-radius: 8px; margin-top: 10px;">';
    html += '<h3 style="margin: 0 0 10px 0; color: #fff; font-size: 16px;">ON Running Tracker Report</h3>';

    if (comparison.newProducts && comparison.newProducts.length > 0) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="color: #28a745; font-size: 13px; font-weight: bold; margin-bottom: 6px;">&#x1F195; New Products (' + comparison.newProducts.length + ')</div>';
        comparison.newProducts.forEach(function(p) {
            html += '<div style="padding: 4px 8px; margin: 2px 0; background: #0d1117; border-radius: 4px; border-left: 3px solid #28a745; color: #e0e0e0; font-size: 12px;">';
            html += '<strong>' + p.model + '</strong> &mdash; ' + p.colorways + ' colorway' + (p.colorways !== 1 ? 's' : '');
            html += '<label style="float: right; font-size: 11px; color: #888;"><input type="checkbox" class="on-confirm-new" data-handle="' + p.handle + '" style="margin-right: 4px;">Confirm to Shopify</label>';
            html += '</div>';
        });
        html += '</div>';
    }

    if (comparison.newColorways && comparison.newColorways.length > 0) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="color: #17a2b8; font-size: 13px; font-weight: bold; margin-bottom: 6px;">&#x1F3A8; New Colorways (' + comparison.newColorways.length + ')</div>';
        comparison.newColorways.forEach(function(c) {
            html += '<div style="padding: 4px 8px; margin: 2px 0; background: #0d1117; border-radius: 4px; border-left: 3px solid #17a2b8; color: #e0e0e0; font-size: 12px;">';
            html += c.model + ' &mdash; <strong>' + c.color + '</strong>';
            html += ' <span style="color: #666;">(' + c.handle + ')</span>';
            html += '<label style="float: right; font-size: 11px; color: #888;"><input type="checkbox" class="on-confirm-colorway" data-handle="' + c.handle + '" style="margin-right: 4px;">Confirm to Shopify</label>';
            html += '</div>';
        });
        html += '</div>';
    }

    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
        html += '<div style="margin-bottom: 12px;">';
        html += '<div style="color: #dc3545; font-size: 13px; font-weight: bold; margin-bottom: 6px;">&#x274C; Removed Colorways (' + comparison.removedColorways.length + ')</div>';
        comparison.removedColorways.forEach(function(r) {
            html += '<div style="padding: 4px 8px; margin: 2px 0; background: #0d1117; border-radius: 4px; border-left: 3px solid #dc3545; color: #e0e0e0; font-size: 12px;">';
            html += r.model + ' &mdash; ' + r.color + ' <span style="color: #666;">(' + r.handle + ') &rarr; zeroed out</span>';
            html += '</div>';
        });
        html += '</div>';
    }

    html += '<div style="margin-top: 10px;"><button onclick="onConfirmNewProducts()" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 12px;">Confirm Selected New Items to Shopify</button></div>';
    html += '</div>';

    container.innerHTML = html;
    container.style.display = 'block';

    if ((comparison.newProducts && comparison.newProducts.length > 0) || (comparison.newColorways && comparison.newColorways.length > 0)) {
        showOnNewProductButton();
    } else {
        hideOnNewProductButton();
    }
}

function onConfirmNewProducts() {
    var confirmedHandles = [];
    document.querySelectorAll('.on-confirm-new:checked').forEach(function(cb) { confirmedHandles.push(cb.getAttribute('data-handle')); });
    document.querySelectorAll('.on-confirm-colorway:checked').forEach(function(cb) { confirmedHandles.push(cb.getAttribute('data-handle')); });

    if (confirmedHandles.length === 0) { alert('No items selected to confirm.'); return; }

    if (typeof InventoryTracker !== 'undefined' && InventoryTracker.confirmOnItems) {
        InventoryTracker.confirmOnItems(confirmedHandles).then(function() {
            alert('Confirmed ' + confirmedHandles.length + ' item(s) to Shopify tracker.');
        }).catch(function(err) {
            console.error('Confirm error:', err);
            alert('Error confirming items: ' + err.message);
        });
    } else {
        alert('Inventory tracker not available for ON.');
    }
}

function showOnNewProductButton() {
    var btn = document.getElementById('on-new-product-csv-btn');
    if (btn) btn.style.display = 'block';
}

function hideOnNewProductButton() {
    var btn = document.getElementById('on-new-product-csv-btn');
    if (btn) btn.style.display = 'none';
}

function downloadOnNewProductCSV() {
    var comparison = window._onTrackerComparison;
    if (!comparison) { alert('No tracker comparison data available.'); return; }

    var csvContent = OnConverter.generateNewProductCSV(comparison);
    if (!csvContent) { alert('No new products to export.'); return; }

    var today = new Date().toISOString().split('T')[0];
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'on-NEW-products-' + today + '.csv';
    link.click();
}

function downloadOnProductCSV() {
    var allHandles = new Set();
    OnConverter.scannedProducts.forEach(function(p) {
        p.colorways.forEach(function(c) { allHandles.add(c.handle); });
    });

    var fakeComparison = {
        newProducts: [],
        newColorways: Array.from(allHandles).map(function(h) { return { handle: h }; }),
        removedColorways: []
    };

    var csvContent = OnConverter.generateNewProductCSV(fakeComparison);
    if (!csvContent) { alert('No product data available.'); return; }

    var today = new Date().toISOString().split('T')[0];
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'on-products-' + today + '.csv';
    link.click();
}
