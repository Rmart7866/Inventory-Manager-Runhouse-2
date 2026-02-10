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