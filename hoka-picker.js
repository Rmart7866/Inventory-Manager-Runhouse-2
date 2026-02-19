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

            // NEW badge for products not yet on Shopify
            if (!product.isDefault) {
                var newBadge = document.createElement('span');
                newBadge.className = 'product-new-badge';
                newBadge.textContent = 'NEW';
                nameSpan.appendChild(newBadge);
            }

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

    // If no data in DB yet and no changes, skip report
    if (summary.totalInDB === 0 && summary.newProducts === 0 && summary.newColorways === 0 && summary.removedColorways === 0) {
        container.innerHTML = '<div class="tracker-report-header"><h4>No tracking data yet — run the seed script first</h4></div>';
        container.style.display = 'block';
        return;
    }

    var html = '<div class="tracker-report-header">';
    html += '<h4>Inventory Tracker</h4>';
    html += '<span class="tracker-timestamp">' + new Date().toLocaleString() + '</span>';
    html += '</div>';

    // Summary stats
    html += '<div class="tracker-stats">';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + summary.totalInATS + '</span><span class="tracker-stat-label">In ATS File</span></div>';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + summary.totalInDB + '</span><span class="tracker-stat-label">On Shopify</span></div>';
    html += '<div class="tracker-stat"><span class="tracker-stat-number">' + summary.matchingColorways + '</span><span class="tracker-stat-label">Matched</span></div>';
    if (summary.newProducts > 0) {
        html += '<div class="tracker-stat tracker-stat-new-product"><span class="tracker-stat-number">+' + summary.newProducts + '</span><span class="tracker-stat-label">New Products</span></div>';
    }
    if (summary.newColorways > 0) {
        html += '<div class="tracker-stat tracker-stat-new"><span class="tracker-stat-number">+' + summary.newColorways + '</span><span class="tracker-stat-label">New Colors</span></div>';
    }
    if (summary.removedColorways > 0) {
        html += '<div class="tracker-stat tracker-stat-removed"><span class="tracker-stat-number">-' + summary.removedColorways + '</span><span class="tracker-stat-label">Removed</span></div>';
    }
    html += '</div>';

    // ========== NEW PRODUCTS section (entirely new models) ==========
    if (comparison.newProducts.length > 0) {
        // Group new products by model name for cleaner display
        var byModel = {};
        for (var p = 0; p < comparison.newProducts.length; p++) {
            var prod = comparison.newProducts[p];
            var modelKey = prod.modelName || 'Unknown Model';
            if (!byModel[modelKey]) byModel[modelKey] = [];
            byModel[modelKey].push(prod);
        }

        html += '<div class="tracker-section tracker-new-products">';
        html += '<div class="tracker-section-header" onclick="toggleTrackerSection(\'newproducts\')">';
        html += '<span>🆕 New Products Not On Shopify (' + comparison.newProducts.length + ' colorways)</span>';
        html += '<span class="tracker-toggle" id="tracker-toggle-newproducts">▼</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="tracker-body-newproducts">';

        var modelNames = Object.keys(byModel).sort();
        for (var m = 0; m < modelNames.length; m++) {
            var mName = modelNames[m];
            var mColorways = byModel[mName];
            html += '<div class="tracker-model-group">';
            html += '<div class="tracker-model-name">' + mName + ' <span class="tracker-model-count">(' + mColorways.length + ' colorway' + (mColorways.length > 1 ? 's' : '') + ')</span></div>';
            for (var mc = 0; mc < mColorways.length; mc++) {
                var mcItem = mColorways[mc];
                html += '<div class="tracker-item tracker-item-new-product">';
                html += '<input type="checkbox" class="tracker-confirm-cb" data-handle="' + mcItem.handle + '" data-title="' + (mcItem.title || '').replace(/"/g, '&quot;') + '" data-variants=\'' + JSON.stringify(mcItem.variants || {}).replace(/'/g, '&#39;') + '\' data-model="' + mName.replace(/"/g, '&quot;') + '">';
                html += '<span class="tracker-item-badge tracker-badge-new-product">NEW PRODUCT</span>';
                html += '<span class="tracker-item-name">' + (mcItem.title || mcItem.handle) + '</span>';
                html += '<span class="tracker-item-detail">' + mcItem.variantCount + ' sizes</span>';
                html += '</div>';
            }
            html += '</div>';
        }

        html += '<div class="tracker-confirm-actions">';
        html += '<label class="tracker-select-all"><input type="checkbox" id="tracker-select-all-newproducts" onchange="toggleAllTrackerSection(\'newproducts\', this.checked)"> Select All</label>';
        html += '<button class="tracker-confirm-btn" data-section="newproducts" onclick="confirmNewItems(\'newproducts\')">✓ Confirm Selected On Shopify</button>';
        html += '</div>';
        html += '</div></div>';
    }

    // ========== NEW COLORWAYS section (new colors of known products) ==========
    if (comparison.newColorways.length > 0) {
        // Group by model
        var cwByModel = {};
        for (var c = 0; c < comparison.newColorways.length; c++) {
            var cw = comparison.newColorways[c];
            var cwModelKey = cw.modelName || 'Unknown Model';
            if (!cwByModel[cwModelKey]) cwByModel[cwModelKey] = [];
            cwByModel[cwModelKey].push(cw);
        }

        html += '<div class="tracker-section tracker-added">';
        html += '<div class="tracker-section-header" onclick="toggleTrackerSection(\'newcolors\')">';
        html += '<span>🎨 New Colorways of Existing Products (' + comparison.newColorways.length + ')</span>';
        html += '<span class="tracker-toggle" id="tracker-toggle-newcolors">▼</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="tracker-body-newcolors">';

        var cwModelNames = Object.keys(cwByModel).sort();
        for (var cm = 0; cm < cwModelNames.length; cm++) {
            var cmName = cwModelNames[cm];
            var cmColorways = cwByModel[cmName];
            html += '<div class="tracker-model-group">';
            html += '<div class="tracker-model-name">' + cmName + ' <span class="tracker-model-count">(' + cmColorways.length + ' new color' + (cmColorways.length > 1 ? 's' : '') + ')</span></div>';
            for (var cc = 0; cc < cmColorways.length; cc++) {
                var ccItem = cmColorways[cc];
                html += '<div class="tracker-item tracker-item-new">';
                html += '<input type="checkbox" class="tracker-confirm-cb" data-handle="' + ccItem.handle + '" data-title="' + (ccItem.title || '').replace(/"/g, '&quot;') + '" data-variants=\'' + JSON.stringify(ccItem.variants || {}).replace(/'/g, '&#39;') + '\' data-model="' + cmName.replace(/"/g, '&quot;') + '">';
                html += '<span class="tracker-item-badge tracker-badge-new">NEW COLOR</span>';
                html += '<span class="tracker-item-name">' + (ccItem.title || ccItem.handle) + '</span>';
                html += '<span class="tracker-item-detail">' + ccItem.variantCount + ' sizes</span>';
                html += '</div>';
            }
            html += '</div>';
        }

        html += '<div class="tracker-confirm-actions">';
        html += '<label class="tracker-select-all"><input type="checkbox" id="tracker-select-all-newcolors" onchange="toggleAllTrackerSection(\'newcolors\', this.checked)"> Select All</label>';
        html += '<button class="tracker-confirm-btn" data-section="newcolors" onclick="confirmNewItems(\'newcolors\')">✓ Confirm Selected On Shopify</button>';
        html += '</div>';
        html += '</div></div>';
    }

    // ========== REMOVED section ==========
    if (comparison.removedColorways.length > 0) {
        html += '<div class="tracker-section tracker-removed">';
        html += '<div class="tracker-section-header" onclick="toggleTrackerSection(\'removed\')">';
        html += '<span>❌ Removed From ATS (' + comparison.removedColorways.length + ') — zeroed out in CSV</span>';
        html += '<span class="tracker-toggle" id="tracker-toggle-removed">▼</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="tracker-body-removed">';
        for (var j = 0; j < comparison.removedColorways.length; j++) {
            var rItem = comparison.removedColorways[j];
            var varCount = Object.keys(rItem.variants || {}).length;
            html += '<div class="tracker-item tracker-item-removed">';
            html += '<span class="tracker-item-badge tracker-badge-removed">GONE</span>';
            html += '<span class="tracker-item-name">' + (rItem.title || rItem.handle) + '</span>';
            html += '<span class="tracker-item-detail">' + varCount + ' sizes → 0</span>';
            html += '</div>';
        }
        html += '</div></div>';
    }

    container.innerHTML = html;
    container.style.display = 'block';
}

// Toggle all checkboxes in a given section
function toggleAllTrackerSection(sectionId, checked) {
    var body = document.getElementById('tracker-body-' + sectionId);
    if (!body) return;
    var checkboxes = body.querySelectorAll('.tracker-confirm-cb');
    for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = checked;
    }
}

// Confirm selected new items (works for both newproducts and newcolors sections)
function confirmNewItems(sectionId) {
    if (typeof InventoryTracker === 'undefined' || typeof db === 'undefined') {
        alert('Firestore not available');
        return;
    }

    var body = document.getElementById('tracker-body-' + sectionId);
    if (!body) return;

    var checkboxes = body.querySelectorAll('.tracker-confirm-cb:checked');
    if (checkboxes.length === 0) {
        alert('No items selected. Check the ones you\'ve added to Shopify.');
        return;
    }

    var colorwayData = [];
    var modelNames = new Set();

    for (var i = 0; i < checkboxes.length; i++) {
        var cb = checkboxes[i];
        var handle = cb.getAttribute('data-handle');
        var title = cb.getAttribute('data-title');
        var modelName = cb.getAttribute('data-model');
        var variants = {};
        try { variants = JSON.parse(cb.getAttribute('data-variants')); } catch(e) {}

        colorwayData.push({ handle: handle, title: title, variants: variants });

        if (modelName) modelNames.add(modelName);
    }

    var btn = body.querySelector('.tracker-confirm-btn');
    if (btn) {
        btn.textContent = 'Saving...';
        btn.disabled = true;
    }

    // Figure out which models are actually new
    var newModels = [];
    modelNames.forEach(function(name) {
        if (!InventoryTracker.isKnownModel(name)) {
            newModels.push(name);
        }
    });

    var promises = [InventoryTracker.confirmColorways('hoka', colorwayData)];
    if (newModels.length > 0) {
        promises.push(InventoryTracker.confirmModels('hoka', newModels));
    }

    Promise.all(promises).then(function() {
        if (btn) {
            btn.textContent = '✓ Saved ' + colorwayData.length + ' colorways';
            btn.className = 'tracker-confirm-btn tracker-confirmed';
        }

        var summaryMsg = 'Confirmed ' + colorwayData.length + ' colorways on Shopify';
        if (newModels.length > 0) summaryMsg += ' + ' + newModels.length + ' new models';
        console.log(summaryMsg);

        // Grey out confirmed items
        for (var j = 0; j < checkboxes.length; j++) {
            var item = checkboxes[j].closest('.tracker-item');
            if (item) {
                item.style.opacity = '0.5';
                var badge = item.querySelector('.tracker-item-badge');
                if (badge) {
                    badge.textContent = 'SAVED';
                    badge.className = 'tracker-item-badge tracker-badge-saved';
                }
            }
        }
    }).catch(function(err) {
        if (btn) {
            btn.textContent = 'Error: ' + err.message;
            btn.disabled = false;
        }
    });
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
            badge.innerHTML = '🟢 Tracking active — ' + status.modelCount + ' models, ' + status.productCount + ' colorways in database';
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initTrackerStatus, 1500); // Give Firebase time to init
});
// ========== END INVENTORY TRACKER REPORT ==========
