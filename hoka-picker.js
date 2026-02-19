// ========== HOKA PRODUCT PICKER LOGIC ==========
// Global state for the scanned products
var hokaScannedProducts = [];

// Build the product picker UI from scan results
function buildHokaProductPicker(products) {
    hokaScannedProducts = products;
    var pickerBody = document.getElementById('hoka-picker-body');
    pickerBody.innerHTML = '';

    // Group products by category
    var categories = HokaConverter.productCategories;
    var categorized = {};
    var uncategorized = [];

    // Initialize category buckets
    for (var catName in categories) {
        categorized[catName] = [];
    }

    products.forEach(function(product) {
        var placed = false;
        for (var catName in categories) {
            if (categories[catName].indexOf(product.name) !== -1) {
                categorized[catName].push(product);
                placed = true;
                break;
            }
        }
        if (!placed) {
            uncategorized.push(product);
        }
    });

    // Add uncategorized as "Other"
    if (uncategorized.length > 0) {
        categorized['Other'] = uncategorized;
    }

    // Build each category
    var categoryOrder = ['Road Running', 'Trail Running', 'Race / Track', 'Lifestyle / Hike', 'Recovery', 'Accessories', 'Other'];

    categoryOrder.forEach(function(catName) {
        var catProducts = categorized[catName];
        if (!catProducts || catProducts.length === 0) return;

        var catDiv = document.createElement('div');
        catDiv.className = 'product-category';

        // Category header
        var header = document.createElement('div');
        header.className = 'product-category-header';
        header.innerHTML = '<span>' + catName + ' (' + catProducts.length + ')</span>' +
            '<button class="category-toggle-btn" data-category="' + catName.replace(/[^a-zA-Z]/g, '') + '">Toggle All</button>';
        header.querySelector('.category-toggle-btn').addEventListener('click', function(e) {
            e.stopPropagation();
            var cat = this.getAttribute('data-category');
            toggleHokaCategory(cat);
        });
        catDiv.appendChild(header);

        // Product items
        var itemsDiv = document.createElement('div');
        itemsDiv.className = 'product-category-items';
        itemsDiv.setAttribute('data-category', catName.replace(/[^a-zA-Z]/g, ''));

        catProducts.sort(function(a, b) { return a.name.localeCompare(b.name); });

        catProducts.forEach(function(product) {
            var itemDiv = document.createElement('div');
            itemDiv.className = 'product-item' + (product.isDefault ? '' : ' is-new');

            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = product.isDefault;
            checkbox.setAttribute('data-product', product.name);
            checkbox.setAttribute('data-rows', product.rows);
            checkbox.addEventListener('change', updateHokaPickerSummary);

            var nameSpan = document.createElement('span');
            nameSpan.className = 'product-item-name';
            nameSpan.textContent = product.name;

            var statsSpan = document.createElement('span');
            statsSpan.className = 'product-item-stats';
            var inventoryClass = product.inventory > 0 ? 'inventory-count' : 'zero-inventory';
            statsSpan.innerHTML = product.rows + ' rows · <span class="' + inventoryClass + '">' +
                product.inventory.toLocaleString() + ' units</span>';

            itemDiv.appendChild(checkbox);
            itemDiv.appendChild(nameSpan);
            itemDiv.appendChild(statsSpan);

            itemDiv.addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    checkbox.checked = !checkbox.checked;
                    updateHokaPickerSummary();
                }
            });

            itemsDiv.appendChild(itemDiv);
        });

        catDiv.appendChild(itemsDiv);
        pickerBody.appendChild(catDiv);
    });

    // Initialize selectedProducts from defaults
    HokaConverter.selectedProducts = new Set();
    products.forEach(function(p) {
        if (p.isDefault) HokaConverter.selectedProducts.add(p.name);
    });

    updateHokaPickerSummary();

    // Show picker
    document.getElementById('hoka-product-picker').style.display = 'block';
}

function updateHokaPickerSummary() {
    var checkboxes = document.querySelectorAll('#hoka-picker-body input[type="checkbox"]');
    var selectedCount = 0;
    var totalRows = 0;

    HokaConverter.selectedProducts = new Set();

    checkboxes.forEach(function(cb) {
        if (cb.checked) {
            selectedCount++;
            totalRows += parseInt(cb.getAttribute('data-rows')) || 0;
            HokaConverter.selectedProducts.add(cb.getAttribute('data-product'));
        }
    });

    document.getElementById('hoka-picker-count').textContent = selectedCount + ' of ' + checkboxes.length + ' products selected';
    document.getElementById('hoka-picker-rows').textContent = totalRows.toLocaleString() + ' rows';
}

function hokaPickerSelectAll() {
    var checkboxes = document.querySelectorAll('#hoka-picker-body input[type="checkbox"]');
    checkboxes.forEach(function(cb) { cb.checked = true; });
    updateHokaPickerSummary();
}

function hokaPickerSelectNone() {
    var checkboxes = document.querySelectorAll('#hoka-picker-body input[type="checkbox"]');
    checkboxes.forEach(function(cb) { cb.checked = false; });
    updateHokaPickerSummary();
}

function hokaPickerSelectDefaults() {
    var checkboxes = document.querySelectorAll('#hoka-picker-body input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
        var productName = cb.getAttribute('data-product');
        cb.checked = HokaConverter.defaultProducts.indexOf(productName) !== -1;
    });
    updateHokaPickerSummary();
}

function toggleHokaCategory(catId) {
    var items = document.querySelector('.product-category-items[data-category="' + catId + '"]');
    if (!items) return;

    var checkboxes = items.querySelectorAll('input[type="checkbox"]');
    // If all checked, uncheck all. Otherwise check all.
    var allChecked = true;
    checkboxes.forEach(function(cb) {
        if (!cb.checked) allChecked = false;
    });
    checkboxes.forEach(function(cb) {
        cb.checked = !allChecked;
    });
    updateHokaPickerSummary();
}
// ========== END HOKA PRODUCT PICKER LOGIC ==========

// ========== HOKA PRODUCT CSV DOWNLOAD ==========
function downloadHokaProductCSV() {
    var csv = HokaConverter.generateProductCSV();
    if (!csv) {
        alert('No product data available. Please generate inventory first.');
        return;
    }

    var date = new Date();
    var dateStr = date.getFullYear() + '-' + 
        String(date.getMonth() + 1).padStart(2, '0') + '-' + 
        String(date.getDate()).padStart(2, '0');
    var filename = 'hoka-products-' + dateStr + '.csv';

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    var url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showHokaProductCSVButton() {
    var btn = document.getElementById('hoka-product-csv-btn');
    if (btn) btn.style.display = 'block';
}

function hideHokaProductCSVButton() {
    var btn = document.getElementById('hoka-product-csv-btn');
    if (btn) btn.style.display = 'none';
}
// ========== END HOKA PRODUCT CSV DOWNLOAD ==========

// ========== INVENTORY TRACKER REPORT ==========
function showTrackerReport(comparison) {
    var container = document.getElementById('hoka-tracker-report');
    if (!container) return;

    var summary = comparison.summary;

    // Build report HTML
    var html = '<div class="tracker-report-header">';
    html += '<h4>Inventory Changes</h4>';
    html += '<span class="tracker-timestamp">' + new Date().toLocaleString() + '</span>';
    html += '</div>';

    // Summary stats
    html += '<div class="tracker-stats">';
    html += '<div class="tracker-stat">';
    html += '<span class="tracker-stat-number">' + summary.totalCurrent + '</span>';
    html += '<span class="tracker-stat-label">Current</span>';
    html += '</div>';
    if (summary.totalPrevious > 0) {
        html += '<div class="tracker-stat tracker-stat-new">';
        html += '<span class="tracker-stat-number">+' + summary.addedCount + '</span>';
        html += '<span class="tracker-stat-label">New</span>';
        html += '</div>';
        html += '<div class="tracker-stat tracker-stat-removed">';
        html += '<span class="tracker-stat-number">-' + summary.removedCount + '</span>';
        html += '<span class="tracker-stat-label">Removed</span>';
        html += '</div>';
        html += '<div class="tracker-stat">';
        html += '<span class="tracker-stat-number">' + summary.unchangedCount + '</span>';
        html += '<span class="tracker-stat-label">Unchanged</span>';
        html += '</div>';
    } else {
        html += '<div class="tracker-stat tracker-stat-first">';
        html += '<span class="tracker-stat-number">First Run</span>';
        html += '<span class="tracker-stat-label">Saved to database</span>';
        html += '</div>';
    }
    html += '</div>';

    // New colorways list
    if (comparison.added.length > 0) {
        html += '<div class="tracker-section tracker-added">';
        html += '<div class="tracker-section-header" onclick="toggleTrackerSection(\'added\')">'; 
        html += '<span>New Colorways (' + comparison.added.length + ')</span>';
        html += '<span class="tracker-toggle" id="tracker-toggle-added">▼</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="tracker-body-added">';
        for (var i = 0; i < comparison.added.length; i++) {
            var item = comparison.added[i];
            html += '<div class="tracker-item tracker-item-new">';
            html += '<span class="tracker-item-name">' + item.title + '</span>';
            html += '<span class="tracker-item-detail">' + item.variantCount + ' sizes</span>';
            html += '</div>';
        }
        html += '</div></div>';
    }

    // Removed colorways list
    if (comparison.removed.length > 0) {
        html += '<div class="tracker-section tracker-removed">';
        html += '<div class="tracker-section-header" onclick="toggleTrackerSection(\'removed\')">';
        html += '<span>Removed Colorways (' + comparison.removed.length + ') — zeroed out in CSV</span>';
        html += '<span class="tracker-toggle" id="tracker-toggle-removed">▼</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="tracker-body-removed">';
        for (var j = 0; j < comparison.removed.length; j++) {
            var rItem = comparison.removed[j];
            var varCount = Object.keys(rItem.variants).length;
            html += '<div class="tracker-item tracker-item-removed">';
            html += '<span class="tracker-item-name">' + rItem.title + '</span>';
            html += '<span class="tracker-item-detail">' + varCount + ' sizes → 0</span>';
            html += '</div>';
        }
        html += '</div></div>';
    }

    container.innerHTML = html;
    container.style.display = 'block';
}

function toggleTrackerSection(sectionId) {
    var body = document.getElementById('tracker-body-' + sectionId);
    var toggle = document.getElementById('tracker-toggle-' + sectionId);
    if (!body || !toggle) return;

    if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▼';
    } else {
        body.style.display = 'none';
        toggle.textContent = '▶';
    }
}

function hideTrackerReport() {
    var container = document.getElementById('hoka-tracker-report');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

// Show tracker connection status on page load
function initTrackerStatus() {
    if (typeof InventoryTracker === 'undefined' || typeof db === 'undefined') return;

    InventoryTracker.checkStatus('hoka').then(function(status) {
        var badge = document.getElementById('hoka-tracker-badge');
        if (!badge) return;

        if (status.connected && status.hasData) {
            badge.innerHTML = '🟢 Tracking active — ' + status.productCount + ' products in database';
            badge.className = 'tracker-badge tracker-badge-active';
        } else if (status.connected && !status.hasData) {
            badge.innerHTML = '🟡 Tracker connected — no data yet (first run will save)';
            badge.className = 'tracker-badge tracker-badge-empty';
        } else {
            badge.innerHTML = '🔴 Tracker offline — ' + (status.error || 'check Firebase config');
            badge.className = 'tracker-badge tracker-badge-error';
        }
        badge.style.display = 'block';
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initTrackerStatus, 1500); // Give Firebase time to init
});
// ========== END INVENTORY TRACKER REPORT ==========
