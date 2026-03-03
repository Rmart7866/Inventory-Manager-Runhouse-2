// ON Running Product Picker - Uses same CSS classes as HOKA picker for consistent styling
// ========== BUILD PICKER UI ==========

var onScannedProducts = [];

// ON Running category mapping - maps parseTitle category output to display names
var ON_CATEGORY_ORDER = [
    'Road Running',
    'Trail Running',
    'Racing',
    'Training / Lifestyle',
    'Other'
];

// Map the raw category strings from parseTitle to display categories
function getOnDisplayCategory(rawCategory, modelName) {
    if (!rawCategory && !modelName) return 'Other';

    var cat = (rawCategory || '').toLowerCase();
    var model = (modelName || '').toLowerCase();

    // Racing: Boom, Cloudboom, Cloudspike
    if (cat.indexOf('boom') !== -1 || model.indexOf('cloudboom') !== -1 || model.indexOf('cloudspike') !== -1) {
        return 'Racing';
    }

    // Trail: PO (Performance Outdoor) with Ultra, Vista, Horizon; also Surfer Trail
    if (cat.indexOf('po') !== -1 || model.indexOf('cloudultra') !== -1 || model.indexOf('cloudvista') !== -1 || model.indexOf('cloudhorizon') !== -1) {
        return 'Trail Running';
    }
    if (model.indexOf('surfer trail') !== -1 || model.indexOf('cloudsurfer trail') !== -1) {
        return 'Trail Running';
    }

    // Training / Lifestyle: PTR (X, Pulse), Nova, Swift
    if (cat.indexOf('ptr') !== -1 || model.indexOf('cloud x') !== -1 || model.indexOf('cloudpulse') !== -1) {
        return 'Training / Lifestyle';
    }
    if (cat.indexOf('nova') !== -1 || model.indexOf('cloudnova') !== -1) {
        return 'Training / Lifestyle';
    }
    if (cat.indexOf('swift') !== -1 || model.indexOf('cloudswift') !== -1) {
        return 'Training / Lifestyle';
    }

    // Road Running: Cloud, Flow, Monster, Runner, Surfer (non-trail)
    if (cat.indexOf('cloud') !== -1 || cat.indexOf('flow') !== -1 || cat.indexOf('monster') !== -1 ||
        cat.indexOf('runner') !== -1 || cat.indexOf('surfer') !== -1) {
        return 'Road Running';
    }
    if (model.indexOf('cloud 6') !== -1 || model.indexOf('cloudflow') !== -1 || model.indexOf('cloudmonster') !== -1 ||
        model.indexOf('cloudrunner') !== -1 || model.indexOf('cloudsurfer') !== -1 || model.indexOf('cloudflyer') !== -1) {
        return 'Road Running';
    }

    return 'Other';
}

function showOnPicker(products) {
    onScannedProducts = products;
    var container = document.getElementById('on-picker-container');
    if (!container) {
        console.error('on-picker-container not found in DOM');
        return;
    }

    // Use same structure as HOKA picker
    var html = '';
    html += '<div class="product-picker" id="on-product-picker" style="display: block; margin: 0;">';

    // Header - ON dark gradient instead of HOKA blue
    html += '<div class="product-picker-header" style="background: linear-gradient(135deg, #333333 0%, #1a1a1a 100%);">';
    html += '<h4>Select Products to Include</h4>';
    html += '<div class="product-picker-actions">';
    html += '<button class="picker-action-btn" onclick="onPickerSelectAll()">Select All</button>';
    html += '<button class="picker-action-btn" onclick="onPickerSelectNone()">Select None</button>';
    html += '<button class="picker-action-btn" onclick="onPickerSelectDefaults()">Defaults</button>';
    html += '<button class="picker-save-defaults-btn" id="on-save-defaults-btn" onclick="saveOnDefaults()">Save as Defaults</button>';
    html += '</div>';
    html += '</div>';

    // Summary bar
    html += '<div class="product-picker-summary" id="on-picker-summary" style="background: #f5f5f5; color: #333;">';
    html += '<span id="on-picker-count">0 products selected</span>';
    html += '<span id="on-picker-rows">0 rows</span>';
    html += '</div>';

    // Body with categories
    html += '<div class="product-picker-body" id="on-picker-body">';

    // Group products into display categories
    var categorized = {};
    ON_CATEGORY_ORDER.forEach(function(cat) { categorized[cat] = []; });

    var knownProducts = OnConverter._knownProducts || null;

    products.forEach(function(product) {
        var displayCat = getOnDisplayCategory(product.category, product.name);
        if (!categorized[displayCat]) categorized[displayCat] = [];
        categorized[displayCat].push(product);
    });

    ON_CATEGORY_ORDER.forEach(function(catName) {
        var catProducts = categorized[catName];
        if (!catProducts || catProducts.length === 0) return;

        var catId = catName.replace(/[^a-zA-Z]/g, '');

        html += '<div class="product-category">';

        // Category header with toggle
        html += '<div class="product-category-header">';
        html += '<span>' + catName.toUpperCase() + ' (' + catProducts.length + ')</span>';
        html += '<button class="category-toggle-btn" onclick="toggleOnCategory(\'' + catId + '\')">Toggle All</button>';
        html += '</div>';

        // Category items
        html += '<div class="product-category-items" data-on-category="' + catId + '">';

        catProducts.sort(function(a, b) { return a.name.localeCompare(b.name); });

        catProducts.forEach(function(product) {
            // Default check logic: if known products loaded from Firestore, check only known ones
            var isChecked = knownProducts ? knownProducts.has(product.name) : true;
            var isNew = knownProducts && !knownProducts.has(product.name);
            var colorCount = product.colorways ? product.colorways.length : 0;
            var inventoryClass = product.totalInventory > 0 ? 'inventory-count' : 'zero-inventory';

            html += '<div class="product-item' + (isNew ? ' is-new' : '') + '">';
            html += '<input type="checkbox" class="on-picker-cb" data-model="' + product.name.replace(/"/g, '&quot;') + '" ' + (isChecked ? 'checked' : '') + '>';
            html += '<span class="product-item-name">' + product.name + '</span>';

            // Show NEW badge for products not in Firestore
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

        html += '</div>'; // category-items
        html += '</div>'; // product-category
    });

    html += '</div>'; // picker-body
    html += '</div>'; // product-picker

    container.innerHTML = html;
    container.style.display = 'block';

    // Wire up checkbox click handlers
    var checkboxes = document.querySelectorAll('.on-picker-cb');
    checkboxes.forEach(function(cb) {
        cb.addEventListener('change', function() {
            updateOnPickerSelection();
            updateOnPickerSummary();
        });

        // Make entire row clickable
        cb.closest('.product-item').addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') {
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            }
        });
    });

    updateOnPickerSelection();
    updateOnPickerSummary();
}

function updateOnPickerSelection() {
    OnConverter.selectedProducts = new Set();
    document.querySelectorAll('.on-picker-cb').forEach(function(cb) {
        if (cb.checked) {
            OnConverter.selectedProducts.add(cb.getAttribute('data-model'));
        }
    });
}

function updateOnPickerSummary() {
    var checkboxes = document.querySelectorAll('.on-picker-cb');
    var total = checkboxes.length;
    var selected = 0;
    var totalRows = 0;

    checkboxes.forEach(function(cb) {
        if (cb.checked) {
            selected++;
            var modelName = cb.getAttribute('data-model');
            onScannedProducts.forEach(function(p) {
                if (p.name === modelName) totalRows += p.rowCount;
            });
        }
    });

    var countEl = document.getElementById('on-picker-count');
    var rowsEl = document.getElementById('on-picker-rows');

    if (countEl) countEl.textContent = selected + ' of ' + total + ' products selected';
    if (rowsEl) rowsEl.textContent = totalRows.toLocaleString() + ' rows';
}

function onPickerSelectAll() {
    document.querySelectorAll('.on-picker-cb').forEach(function(cb) { cb.checked = true; });
    updateOnPickerSelection();
    updateOnPickerSummary();
}

function onPickerSelectNone() {
    document.querySelectorAll('.on-picker-cb').forEach(function(cb) { cb.checked = false; });
    updateOnPickerSelection();
    updateOnPickerSummary();
}

function onPickerSelectDefaults() {
    var knownProducts = OnConverter._knownProducts;
    document.querySelectorAll('.on-picker-cb').forEach(function(cb) {
        if (knownProducts) {
            cb.checked = knownProducts.has(cb.getAttribute('data-model'));
        } else {
            cb.checked = true;
        }
    });
    updateOnPickerSelection();
    updateOnPickerSummary();
}

function saveOnDefaults() {
    // Save current selection as defaults in Firestore
    var btn = document.getElementById('on-save-defaults-btn');
    if (!btn) return;

    var selected = [];
    document.querySelectorAll('.on-picker-cb:checked').forEach(function(cb) {
        selected.push(cb.getAttribute('data-model'));
    });

    if (typeof db !== 'undefined') {
        db.collection('picker-defaults').doc('on').set({
            models: selected,
            updatedAt: new Date().toISOString()
        }).then(function() {
            btn.textContent = 'Saved!';
            btn.classList.add('picker-saved');
            setTimeout(function() {
                btn.textContent = 'Save as Defaults';
                btn.classList.remove('picker-saved');
            }, 2000);
        }).catch(function(err) {
            console.error('Failed to save ON defaults:', err);
            btn.textContent = 'Error saving';
            setTimeout(function() { btn.textContent = 'Save as Defaults'; }, 2000);
        });
    }
}

function toggleOnCategory(catId) {
    var items = document.querySelectorAll('[data-on-category="' + catId + '"] .on-picker-cb');
    if (items.length === 0) return;

    // If all are checked, uncheck all. Otherwise check all.
    var allChecked = true;
    items.forEach(function(cb) { if (!cb.checked) allChecked = false; });

    items.forEach(function(cb) { cb.checked = !allChecked; });
    updateOnPickerSelection();
    updateOnPickerSummary();
}

// Legacy function for backward compatibility
function onPickerGenerate() {
    updateOnPickerSelection();
    if (OnConverter.selectedProducts.size === 0) {
        alert('Please select at least one product.');
        return;
    }
    if (typeof convertBrand === 'function') {
        convertBrand('on');
    }
}

// ========== TRACKER REPORT ==========
function showOnTrackerReport(comparison) {
    var container = document.getElementById('on-tracker-report');
    if (!container) return;

    window._onTrackerComparison = comparison;

    if (!comparison || (!comparison.newProducts.length && !comparison.newColorways.length && !comparison.removedColorways.length)) {
        container.innerHTML = '<div class="tracker-report"><div class="tracker-report-header"><h4>No changes detected</h4><span class="tracker-timestamp">' + new Date().toLocaleString() + '</span></div><div style="padding: 16px; text-align: center; color: #155724; font-size: 14px;">All products match Shopify database.</div></div>';
        container.querySelector('.tracker-report').style.display = 'block';
        container.style.display = 'block';
        hideOnNewProductButton();
        return;
    }

    var summary = comparison.summary || {};

    var html = '<div class="tracker-report" style="display: block;">';

    // Header
    html += '<div class="tracker-report-header">';
    html += '<h4>Inventory Tracker</h4>';
    html += '<span class="tracker-timestamp">' + new Date().toLocaleString() + '</span>';
    html += '</div>';

    // Stats bar
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

    // New Products section
    if (comparison.newProducts && comparison.newProducts.length > 0) {
        html += '<div class="tracker-section tracker-new-products">';
        html += '<div class="tracker-section-header" onclick="toggleOnTrackerSection(\'on-new-products\')">';
        html += '<span>New Products Not On Shopify (' + comparison.newProducts.length + ' colorways)</span>';
        html += '<span class="tracker-toggle" id="on-tracker-toggle-new-products">&#9660;</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="on-tracker-body-new-products">';

        // Group by model
        var productsByModel = {};
        comparison.newProducts.forEach(function(p) {
            var model = p.model || p.title || p.handle;
            if (!productsByModel[model]) productsByModel[model] = [];
            productsByModel[model].push(p);
        });

        for (var modelName in productsByModel) {
            var prods = productsByModel[modelName];
            html += '<div class="tracker-model-group">';
            html += '<div class="tracker-model-name">' + modelName + ' <span class="tracker-model-count">(' + prods.length + ' colorways)</span></div>';
            prods.forEach(function(p) {
                html += '<div class="tracker-item tracker-item-new-product">';
                html += '<input type="checkbox" class="tracker-confirm-cb on-confirm-new" data-handle="' + p.handle + '">';
                html += '<span class="tracker-item-badge tracker-badge-new-product">NEW PRODUCT</span>';
                html += '<span class="tracker-item-name">' + (p.title || p.handle) + '</span>';
                html += '<span class="tracker-item-detail">' + (p.variantCount || 0) + ' sizes</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        html += '<div class="tracker-confirm-actions">';
        html += '<label class="tracker-select-all"><input type="checkbox" id="on-tracker-select-all-new" onchange="toggleAllOnTrackerNew(this.checked)"> Select All</label>';
        html += '<button class="tracker-confirm-btn" id="on-confirm-new-btn" onclick="onConfirmNewProducts()">Confirm Selected to Shopify</button>';
        html += '</div>';
        html += '</div></div>';
    }

    // New Colorways section
    if (comparison.newColorways && comparison.newColorways.length > 0) {
        html += '<div class="tracker-section tracker-added">';
        html += '<div class="tracker-section-header" onclick="toggleOnTrackerSection(\'on-new-colorways\')">';
        html += '<span>New Colorways of Existing Products (' + comparison.newColorways.length + ')</span>';
        html += '<span class="tracker-toggle" id="on-tracker-toggle-new-colorways">&#9660;</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="on-tracker-body-new-colorways">';

        // Group by model
        var cwByModel = {};
        comparison.newColorways.forEach(function(c) {
            var model = c.model || 'Unknown';
            if (!cwByModel[model]) cwByModel[model] = [];
            cwByModel[model].push(c);
        });

        for (var mName in cwByModel) {
            var cws = cwByModel[mName];
            html += '<div class="tracker-model-group">';
            html += '<div class="tracker-model-name">' + mName + ' <span class="tracker-model-count">(' + cws.length + ' new colors)</span></div>';
            cws.forEach(function(c) {
                html += '<div class="tracker-item">';
                html += '<input type="checkbox" class="tracker-confirm-cb on-confirm-colorway" data-handle="' + c.handle + '">';
                html += '<span class="tracker-item-badge tracker-badge-new">NEW COLOR</span>';
                html += '<span class="tracker-item-name">' + (c.title || c.handle) + '</span>';
                html += '<span class="tracker-item-detail">' + (c.variantCount || 0) + ' sizes</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        html += '<div class="tracker-confirm-actions">';
        html += '<label class="tracker-select-all"><input type="checkbox" onchange="toggleAllOnTrackerColorways(this.checked)"> Select All</label>';
        html += '<button class="tracker-confirm-btn" onclick="onConfirmNewColorways()">Confirm Selected to Shopify</button>';
        html += '</div>';
        html += '</div></div>';
    }

    // Removed Colorways section
    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
        html += '<div class="tracker-section tracker-removed">';
        html += '<div class="tracker-section-header" onclick="toggleOnTrackerSection(\'on-removed\')">';
        html += '<span>Removed From ATS (' + comparison.removedColorways.length + ') &mdash; zeroed out in CSV</span>';
        html += '<span class="tracker-toggle" id="on-tracker-toggle-removed">&#9660;</span>';
        html += '</div>';
        html += '<div class="tracker-section-body" id="on-tracker-body-removed">';

        comparison.removedColorways.forEach(function(r) {
            html += '<div class="tracker-item">';
            html += '<span class="tracker-item-badge tracker-badge-removed">GONE</span>';
            html += '<span class="tracker-item-name">' + (r.title || r.handle) + '</span>';
            html += '<span class="tracker-item-detail">0 sizes &rarr; 0</span>';
            html += '</div>';
        });

        html += '</div></div>';
    }

    html += '</div>'; // tracker-report

    container.innerHTML = html;
    container.style.display = 'block';

    // Show/hide NEW product CSV buttons
    if ((comparison.newProducts && comparison.newProducts.length > 0) || (comparison.newColorways && comparison.newColorways.length > 0)) {
        showOnNewProductButton();
    } else {
        hideOnNewProductButton();
    }
}

function toggleOnTrackerSection(sectionId) {
    var body = document.getElementById('on-tracker-body-' + sectionId.replace('on-', ''));
    var toggle = document.getElementById('on-tracker-toggle-' + sectionId.replace('on-', ''));
    if (body) {
        var isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'block' : 'none';
        if (toggle) toggle.innerHTML = isHidden ? '&#9660;' : '&#9654;';
    }
}

function toggleAllOnTrackerNew(checked) {
    document.querySelectorAll('.on-confirm-new').forEach(function(cb) { cb.checked = checked; });
}

function toggleAllOnTrackerColorways(checked) {
    document.querySelectorAll('.on-confirm-colorway').forEach(function(cb) { cb.checked = checked; });
}

function onConfirmNewProducts() {
    var handles = [];
    document.querySelectorAll('.on-confirm-new:checked').forEach(function(cb) { handles.push(cb.getAttribute('data-handle')); });
    if (handles.length === 0) { alert('No items selected to confirm.'); return; }
    _confirmOnHandles(handles);
}

function onConfirmNewColorways() {
    var handles = [];
    document.querySelectorAll('.on-confirm-colorway:checked').forEach(function(cb) { handles.push(cb.getAttribute('data-handle')); });
    if (handles.length === 0) { alert('No items selected to confirm.'); return; }
    _confirmOnHandles(handles);
}

function _confirmOnHandles(handles) {
    if (typeof InventoryTracker !== 'undefined' && typeof InventoryTracker.confirmColorways === 'function') {
        var colorwayData = handles.map(function(h) { return { handle: h, title: h, variants: {} }; });
        InventoryTracker.confirmColorways('on', colorwayData).then(function() {
            alert('Confirmed ' + handles.length + ' item(s) to Shopify tracker.');
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
        if (p.colorways) {
            p.colorways.forEach(function(c) { allHandles.add(c.handle); });
        }
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
