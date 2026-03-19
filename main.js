// ========== RUN HOUSE INVENTORY MANAGER - MAIN CONTROLLER ==========
// Unified controller for all brands. Config-driven scan/convert/download.

function getFormattedDate() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ========== ASICS HANDLE/SIZE POST-PROCESSING ==========
var ASICS_HANDLE_MAPPING = {
    '1013a213-800': 'unisex-asics-novablast-5-la-marathon'
};
var ASICS_SIZE_MAPPING = {
    '3.5': 'M3.5/W5', '4': 'M4/W5.5', '4.5': 'M4.5/W6', '5': 'M5/W6.5',
    '5.5': 'M5.5/W7', '6': 'M6/W7.5', '6.5': 'M6.5/W8', '7': 'M7/W8.5',
    '7.5': 'M7.5/W9', '8': 'M8/W9.5', '8.5': 'M8.5/W10', '9': 'M9/W10.5',
    '9.5': 'M9.5/W11', '10': 'M10/W11.5', '10.5': 'M10.5/W12', '11': 'M11/W12.5',
    '11.5': 'M11.5/W13', '12': 'M12/W13.5', '12.5': 'M12.5/W14', '13': 'M13', '14': 'M14', '15': 'M15'
};
var ASICS_HANDLES_NEEDING_SIZE_CONVERSION = ['unisex-asics-novablast-5-la-marathon'];

function applyAsicsPostProcessing(inventory) {
    return inventory.map(function(row) {
        var r = Object.assign({}, row);
        if (ASICS_HANDLE_MAPPING[r.Handle]) r.Handle = ASICS_HANDLE_MAPPING[r.Handle];
        if (ASICS_HANDLES_NEEDING_SIZE_CONVERSION.indexOf(r.Handle) !== -1 && ASICS_SIZE_MAPPING[r['Option1 Value']]) {
            r['Option1 Value'] = ASICS_SIZE_MAPPING[r['Option1 Value']];
        }
        return r;
    });
}

// ========== BRAND CONFIGURATION ==========
var BRAND_CONFIG = {
    hoka:     { displayName: 'HOKA',       converter: function() { return typeof HokaConverter !== 'undefined' ? HokaConverter : null; },     comparisonKey: '_hokaTrackerComparison',     hasPicker: true },
    on:       { displayName: 'ON Running', converter: function() { return typeof OnConverter !== 'undefined' ? OnConverter : null; },         comparisonKey: '_onTrackerComparison',       hasPicker: true, twoFile: true },
    asics:    { displayName: 'ASICS',      converter: function() { return typeof AsicsConverter !== 'undefined' ? AsicsConverter : null; },   comparisonKey: '_asicsTrackerComparison',    hasPicker: true, postProcess: applyAsicsPostProcessing },
    brooks:   { displayName: 'Brooks',     converter: function() { return typeof BrooksConverter !== 'undefined' ? BrooksConverter : null; }, comparisonKey: '_brooksTrackerComparison',   hasPicker: true },
    puma:     { displayName: 'Puma',       converter: function() { return typeof PumaConverter !== 'undefined' ? PumaConverter : null; },     comparisonKey: '_pumaTrackerComparison',     hasPicker: true },
    saucony:  { displayName: 'Saucony',    converter: function() { return typeof SauconyConverter !== 'undefined' ? SauconyConverter : null; },comparisonKey: '_sauconyTrackerComparison', hasPicker: true },
    newbalance:{ displayName: 'New Balance', converter: function() { return typeof NewBalanceConverter !== 'undefined' ? NewBalanceConverter : null; }, comparisonKey: null, hasPicker: false }
};

// Brand display order
var BRAND_ORDER = ['hoka', 'on', 'asics', 'brooks', 'puma', 'saucony', 'newbalance'];

// ========== MAIN CONTROLLER ==========
var BrandConverter = {
    brands: {
        saucony: { file: null, inventory: [], csv: '', scanned: false },
        hoka: { file: null, inventory: [], csv: '', scanned: false },
        puma: { file: null, inventory: [], csv: '', scanned: false },
        newbalance: { file: null, inventory: [], csv: '' },
        asics: { file: null, inventory: [], csv: '', scanned: false },
        brooks: { file: null, inventory: [], csv: '', scanned: false },
        on: { menFile: null, womenFile: null, inventory: [], csv: '', scanned: false }
    },

    init: function() {
        var self = this;
        // Setup dropzones for single-file brands
        ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks'].forEach(function(brand) {
            self._setupDropzone(brand);
        });
        // ON has two dropzones
        this._setupOnDropzones();
    },

    _setupDropzone: function(brand) {
        var self = this;
        var dropZone = document.getElementById(brand + '-dropzone');
        var fileInput = document.getElementById(brand + '-file');
        if (!dropZone || !fileInput) return;

        dropZone.addEventListener('click', function() { fileInput.click(); });
        dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault(); dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) self.handleFile(brand, e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0) self.handleFile(brand, e.target.files[0]);
        });
    },

    _setupOnDropzones: function() {
        var self = this;
        ['men', 'women'].forEach(function(gender) {
            var dropZone = document.getElementById('on-' + gender + '-dropzone');
            var fileInput = document.getElementById('on-' + gender + '-file');
            if (!dropZone || !fileInput) return;

            dropZone.addEventListener('click', function() { fileInput.click(); });
            dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('dragover'); });
            dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('dragover'); });
            dropZone.addEventListener('drop', function(e) {
                e.preventDefault(); dropZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) self.handleOnFile(gender, e.dataTransfer.files[0]);
            });
            fileInput.addEventListener('change', function(e) {
                if (e.target.files.length > 0) self.handleOnFile(gender, e.target.files[0]);
            });
        });
    },

    // ========== ON FILE HANDLING ==========
    handleOnFile: function(gender, file) {
        if (gender === 'men') {
            this.brands.on.menFile = file;
            document.getElementById('on-men-filename').textContent = file.name;
            document.getElementById('on-men-uploaded').style.display = 'flex';
            document.getElementById('on-men-dropzone').style.display = 'none';
        } else {
            this.brands.on.womenFile = file;
            document.getElementById('on-women-filename').textContent = file.name;
            document.getElementById('on-women-uploaded').style.display = 'flex';
            document.getElementById('on-women-dropzone').style.display = 'none';
        }
        this.hideStatus('on');

        if (this.brands.on.menFile || this.brands.on.womenFile) {
            this._scanBrand('on');
        }
    },

    // ========== GENERIC FILE HANDLING ==========
    handleFile: function(brand, file) {
        this.brands[brand].file = file;
        document.getElementById(brand + '-filename').textContent = file.name;
        document.getElementById(brand + '-uploaded').style.display = 'flex';
        document.getElementById(brand + '-dropzone').style.display = 'none';
        this.hideStatus(brand);

        var config = BRAND_CONFIG[brand];
        if (config && config.hasPicker) {
            this._scanBrand(brand);
        } else {
            // No picker (New Balance) - show convert button directly
            var convertEl = document.getElementById(brand + '-convert');
            if (convertEl) convertEl.style.display = 'block';
        }
    },

    // ========== GENERIC SCAN FLOW ==========
    _scanBrand: function(brand) {
        var self = this;
        var config = BRAND_CONFIG[brand];
        var converter = config.converter();
        if (!converter) return;

        this.brands[brand].scanned = false;
        var convertEl = document.getElementById(brand + '-convert');
        if (convertEl) convertEl.style.display = 'none';
        this.showStatus(brand, 'Scanning file for products...', 'info');

        // Step 1: Load Firestore known products
        var loadModels = Promise.resolve();
        if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
            loadModels = InventoryTracker.load(brand).then(function(data) {
                converter._knownProducts = data.models;
                console.log('[' + brand + '] Loaded ' + data.models.size + ' known models');
            }).catch(function(err) {
                console.warn('[' + brand + '] Could not load Firestore models:', err);
                converter._knownProducts = null;
            });
        }

        // Step 2: Scan file(s)
        loadModels.then(function() {
            if (config.twoFile) {
                return converter.scanFiles(self.brands.on.menFile, self.brands.on.womenFile);
            } else {
                return converter.scanFile(self.brands[brand].file);
            }
        }).then(function(products) {
            // Step 3: Show picker
            if (typeof BrandPicker !== 'undefined' && BrandPicker.configs[brand]) {
                BrandPicker.show(brand, products);
            }
            self.brands[brand].scanned = true;
            if (convertEl) convertEl.style.display = 'block';
            self.showStatus(brand, 'Found ' + products.length + ' products. Select which to include, then click Generate.', 'success');
        }).catch(function(err) {
            self.showStatus(brand, 'Error scanning: ' + err.message, 'error');
            console.error('[' + brand + '] Scan error:', err);
        });
    },

    // ========== STATUS ==========
    showStatus: function(brand, message, type) {
        var el = document.getElementById(brand + '-status');
        if (!el) return;
        el.textContent = message;
        el.className = 'status ' + type;
        el.style.display = 'block';
    },

    hideStatus: function(brand) {
        var el = document.getElementById(brand + '-status');
        if (el) el.style.display = 'none';
    },

    getBrandDisplayName: function(brand) {
        return BRAND_CONFIG[brand] ? BRAND_CONFIG[brand].displayName : brand;
    },

    // ========== DOWNLOAD SECTION ==========
    updateDownloadSection: function() {
        var downloadSection = document.getElementById('download-section');
        var individualDownloads = document.getElementById('individual-downloads');
        if (!downloadSection || !individualDownloads) return;

        individualDownloads.innerHTML = '';
        var hasAny = false;
        var self = this;

        BRAND_ORDER.forEach(function(brand) {
            if (self.brands[brand].inventory.length > 0) {
                hasAny = true;
                var container = document.createElement('div');
                container.className = 'brand-download-row';

                var checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = 'select-' + brand;
                checkbox.className = 'brand-checkbox';
                checkbox.checked = true;
                checkbox.style.width = '20px';
                checkbox.style.height = '20px';
                checkbox.style.cursor = 'pointer';
                checkbox.onchange = function() { self.updateUnifiedInfo(); };

                var btn = document.createElement('button');
                btn.className = 'download-btn ' + brand;
                btn.innerHTML = self.getBrandDisplayName(brand) + ' <span style="color:#6c757d;font-weight:400;">(' + self.brands[brand].inventory.length + ' variants)</span>';
                btn.onclick = function() { self.downloadBrandInventory(brand); };

                var resetBtn = document.createElement('button');
                resetBtn.className = 'download-btn reset-btn';
                resetBtn.innerHTML = 'Reset to 0';
                resetBtn.onclick = function() { self.downloadBrandReset(brand); };

                container.appendChild(checkbox);
                container.appendChild(btn);
                container.appendChild(resetBtn);
                individualDownloads.appendChild(container);
            }
        });

        if (hasAny) {
            downloadSection.style.display = 'block';
            this.updateUnifiedInfo();
            updateCombinedNewProductsButton();
        } else {
            downloadSection.style.display = 'none';
        }
    },

    updateUnifiedInfo: function() {
        var unifiedInfo = document.getElementById('unified-info');
        if (!unifiedInfo) return;
        var selectedVariants = 0;
        var selectedBrands = [];
        var self = this;

        BRAND_ORDER.forEach(function(brand) {
            var cb = document.getElementById('select-' + brand);
            if (cb && cb.checked && self.brands[brand].inventory.length > 0) {
                selectedVariants += self.brands[brand].inventory.length;
                selectedBrands.push(self.getBrandDisplayName(brand));
            }
        });

        if (selectedBrands.length === 0) {
            unifiedInfo.textContent = 'Select brands above to combine';
            unifiedInfo.style.color = '#6c757d';
        } else {
            unifiedInfo.textContent = 'Ready to combine ' + selectedVariants + ' variants from ' + selectedBrands.join(', ');
            unifiedInfo.style.color = '#28a745';
        }
    },

    // ========== INVENTORY CSV GENERATION (shared) ==========
    _generateInventoryCSV: function(inventoryData) {
        var headers = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
            '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
            '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
            '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];

        var rows = [headers.join(',')];
        inventoryData.forEach(function(row) {
            rows.push([
                row.Handle,
                '"' + (row.Title || '').replace(/"/g, '""') + '"',
                row['Option1 Name'] || '', row['Option1 Value'] || '',
                row['Option2 Name'] || '', row['Option2 Value'] || '',
                row['Option3 Name'] || '', row['Option3 Value'] || '',
                row.SKU || '', row.Barcode || '',
                row['HS Code'] || '', row.COO || '',
                row.Location || 'Needham', row['Bin name'] || '',
                '', '', '', '', '',
                row['On hand (new)'] || '0'
            ].join(','));
        });
        return rows.join('\n');
    },

    downloadBrandInventory: function(brand) {
        var blob = new Blob([this.brands[brand].csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = brand + '-inventory-' + getFormattedDate() + '.csv';
        link.click();
        showToast(this.getBrandDisplayName(brand) + ' inventory downloaded');
    },

    downloadBrandReset: function(brand) {
        var resetData = this.brands[brand].inventory.map(function(row) {
            return Object.assign({}, row, { 'On hand (new)': '0' });
        });
        var csv = this._generateInventoryCSV(resetData);
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = brand + '-reset-' + getFormattedDate() + '.csv';
        link.click();
        showToast(this.getBrandDisplayName(brand) + ' reset CSV downloaded');
    }
};

// ========== TOAST NOTIFICATION ==========
function showToast(message) {
    var existing = document.getElementById('toast-notification');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a1a1a;color:#fff;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:500;z-index:10000;opacity:0;transition:opacity 0.3s ease;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
    document.body.appendChild(toast);
    requestAnimationFrame(function() { toast.style.opacity = '1'; });
    setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
}

// ========== CLEAR FILE ==========
function clearFile(brand) {
    if (brand === 'on') {
        BrandConverter.brands.on.menFile = null;
        BrandConverter.brands.on.womenFile = null;
        BrandConverter.brands.on.inventory = [];
        BrandConverter.brands.on.csv = '';
        BrandConverter.brands.on.scanned = false;

        document.getElementById('on-men-file').value = '';
        document.getElementById('on-women-file').value = '';
        document.getElementById('on-men-uploaded').style.display = 'none';
        document.getElementById('on-women-uploaded').style.display = 'none';
        document.getElementById('on-men-dropzone').style.display = 'flex';
        document.getElementById('on-women-dropzone').style.display = 'flex';
        document.getElementById('on-convert').style.display = 'none';
        BrandConverter.hideStatus('on');

        var onPicker = document.getElementById('on-picker-container');
        if (onPicker) onPicker.style.display = 'none';
        var onTracker = document.getElementById('on-tracker-report');
        if (onTracker) onTracker.style.display = 'none';
    } else {
        BrandConverter.brands[brand].file = null;
        BrandConverter.brands[brand].inventory = [];
        BrandConverter.brands[brand].csv = '';
        if (BrandConverter.brands[brand].scanned !== undefined) BrandConverter.brands[brand].scanned = false;

        var fileInput = document.getElementById(brand + '-file');
        if (fileInput) fileInput.value = '';
        var uploaded = document.getElementById(brand + '-uploaded');
        if (uploaded) uploaded.style.display = 'none';
        var convertEl = document.getElementById(brand + '-convert');
        if (convertEl) convertEl.style.display = 'none';
        var dropzone = document.getElementById(brand + '-dropzone');
        if (dropzone) dropzone.style.display = 'flex';
        BrandConverter.hideStatus(brand);

        // Hide picker, tracker, buttons
        var picker = document.getElementById(brand + '-picker-container');
        if (picker) picker.style.display = 'none';
        var tracker = document.getElementById(brand + '-tracker-report');
        if (tracker) tracker.style.display = 'none';
        var prodBtn = document.getElementById(brand + '-product-csv-btn');
        if (prodBtn) prodBtn.style.display = 'none';
        var newBtn = document.getElementById(brand + '-new-product-csv-btn');
        if (newBtn) newBtn.style.display = 'none';
    }

    BrandConverter.updateDownloadSection();
}

// ========== GENERIC CONVERT FLOW ==========
async function convertBrand(brand) {
    var config = BRAND_CONFIG[brand];
    if (!config) return;

    var converter = config.converter();
    var brandData = BrandConverter.brands[brand];

    // Validate file uploaded
    if (config.twoFile) {
        if (!brandData.menFile && !brandData.womenFile) {
            BrandConverter.showStatus(brand, 'Please upload at least one file!', 'error');
            return;
        }
    } else if (!brandData.file) {
        BrandConverter.showStatus(brand, 'Please select a file first!', 'error');
        return;
    }

    // Validate scan + selection for picker brands
    if (config.hasPicker) {
        if (!brandData.scanned) {
            BrandConverter.showStatus(brand, 'File is still being scanned, please wait...', 'error');
            return;
        }
        if (converter && converter.selectedProducts && converter.selectedProducts.size === 0) {
            BrandConverter.showStatus(brand, 'Please select at least one product!', 'error');
            return;
        }
    }

    // Disable generate button
    var generateBtn = document.querySelector('#' + brand + '-convert .convert-btn');
    if (generateBtn) { generateBtn.disabled = true; generateBtn.textContent = 'Processing...'; }

    BrandConverter.showStatus(brand, 'Processing...', 'info');

    try {
        // Step 1: Convert
        var inventory;
        if (config.twoFile) {
            inventory = await converter.convert(brandData.menFile, brandData.womenFile);
        } else if (converter) {
            inventory = await converter.convert(brandData.file);
        }

        brandData.inventory = inventory;

        // Show product CSV button
        if (typeof BrandPicker !== 'undefined') BrandPicker.showProductCSVButton(brand);

        // Step 2: Tracker comparison (if available)
        if (config.comparisonKey && typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
            try {
                BrandConverter.showStatus(brand, 'Comparing against Shopify database...', 'info');
                await InventoryTracker.load(brand);
                var comparison = InventoryTracker.compare(inventory);
                window[config.comparisonKey] = comparison;

                // Append removed colorways at 0
                if (comparison.removedColorways && comparison.removedColorways.length > 0) {
                    var removedRows = InventoryTracker.generateRemovedRows(comparison.removedColorways);
                    inventory = inventory.concat(removedRows);
                    brandData.inventory = inventory;
                    if (converter) converter.inventoryData = inventory;
                }

                await InventoryTracker.updateExistingColorways(brand, inventory);

                // ===== B2B LINK PHASE-OUT CHECK (ASICS + Brooks only) =====
                if ((brand === 'asics' || brand === 'brooks') && typeof B2BLinkManager !== 'undefined') {
                    try {
                        var phased = await B2BLinkManager.checkPhaseOuts(brand, inventory);
                        if (phased && phased.length > 0) {
                            console.log('[B2BLinks] ' + brand + ' phased out: ' + phased.join(', '));
                        }
                    } catch (linkErr) {
                        console.warn('[B2BLinks] Phase-out check failed:', linkErr);
                    }
                }

                // Show tracker report
                if (typeof BrandPicker !== 'undefined') {
                    BrandPicker.showTrackerReport(brand, comparison);
                }

                // Build status message
                var msg = 'Processed ' + inventory.length + ' variants';
                if (comparison.removedColorways && comparison.removedColorways.length > 0) msg += ' (' + comparison.removedColorways.length + ' removed at 0)';
                if (comparison.newProducts && comparison.newProducts.length > 0) msg += ' | ' + comparison.newProducts.length + ' new products';
                if (comparison.newColorways && comparison.newColorways.length > 0) msg += ' | ' + comparison.newColorways.length + ' new colorways';
                BrandConverter.showStatus(brand, msg, 'success');
            } catch (trackerError) {
                console.warn('[' + brand + '] Tracker error:', trackerError);
                BrandConverter.showStatus(brand, 'Processed ' + inventory.length + ' variants (tracker unavailable)', 'success');
            }
        } else {
            BrandConverter.showStatus(brand, 'Processed ' + inventory.length + ' variants', 'success');
        }

        // Step 3: Generate CSV
        if (converter && converter.generateInventoryCSV) {
            brandData.csv = converter.generateInventoryCSV();
        } else {
            brandData.csv = BrandConverter._generateInventoryCSV(inventory);
        }

        BrandConverter.updateDownloadSection();
    } catch (error) {
        BrandConverter.showStatus(brand, 'Error: ' + error.message, 'error');
        console.error('[' + brand + '] Conversion error:', error);
    } finally {
        // Re-enable generate button
        if (generateBtn) { generateBtn.disabled = false; generateBtn.textContent = 'Generate Inventory'; }
    }
}

// ========== UNIFIED DOWNLOAD ==========
function downloadUnified() {
    var allInventory = [];

    BRAND_ORDER.forEach(function(brand) {
        var cb = document.getElementById('select-' + brand);
        if (cb && cb.checked && BrandConverter.brands[brand].inventory.length > 0) {
            var inv = BrandConverter.brands[brand].inventory.slice();
            var config = BRAND_CONFIG[brand];
            if (config && config.postProcess) inv = config.postProcess(inv);
            allInventory = allInventory.concat(inv);
        }
    });

    if (allInventory.length === 0) { alert('Please select at least one brand!'); return; }

    var csv = BrandConverter._generateInventoryCSV(allInventory);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'combined-inventory-' + getFormattedDate() + '.csv';
    link.click();
    showToast('Combined inventory downloaded (' + allInventory.length + ' variants)');
}

function downloadUnifiedReset() {
    var allInventory = [];

    BRAND_ORDER.forEach(function(brand) {
        var cb = document.getElementById('select-' + brand);
        if (cb && cb.checked && BrandConverter.brands[brand].inventory.length > 0) {
            var inv = BrandConverter.brands[brand].inventory.slice();
            var config = BRAND_CONFIG[brand];
            if (config && config.postProcess) inv = config.postProcess(inv);
            allInventory = allInventory.concat(inv);
        }
    });

    if (allInventory.length === 0) { alert('Please select at least one brand!'); return; }

    var resetData = allInventory.map(function(row) { return Object.assign({}, row, { 'On hand (new)': '0' }); });
    var csv = BrandConverter._generateInventoryCSV(resetData);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'combined-reset-' + getFormattedDate() + '.csv';
    link.click();
    showToast('Combined reset CSV downloaded');
}

// ========== COMBINED NEW PRODUCTS ==========
function updateCombinedNewProductsButton() {
    var btn = document.getElementById('combined-new-products-btn');
    if (!btn) return;

    var totalNew = 0;
    for (var brand in BRAND_CONFIG) {
        var key = BRAND_CONFIG[brand].comparisonKey;
        if (!key) continue;
        var comp = window[key];
        if (!comp) continue;
        if (comp.newProducts) totalNew += comp.newProducts.length;
        if (comp.newColorways) totalNew += comp.newColorways.length;
    }

    if (totalNew > 0) {
        btn.textContent = 'Download ALL New Products CSV (' + totalNew + ' new across all brands)';
        btn.style.display = 'block';
    } else {
        btn.style.display = 'none';
    }
}

function downloadCombinedNewProducts() {
    var allCsvLines = [];
    var headerLine = null;
    var brandsIncluded = [];

    for (var brand in BRAND_CONFIG) {
        var config = BRAND_CONFIG[brand];
        if (!config.comparisonKey) continue;
        var comp = window[config.comparisonKey];
        var converter = config.converter();
        if (!comp || !converter || !converter.generateNewProductCSV) continue;

        var csv = converter.generateNewProductCSV(comp);
        if (!csv) continue;

        var lines = csv.split('\n');
        if (lines.length < 2) continue;

        if (!headerLine) headerLine = lines[0];

        for (var i = 1; i < lines.length; i++) {
            if (lines[i].trim()) allCsvLines.push(lines[i]);
        }
        brandsIncluded.push(config.displayName);
    }

    if (!headerLine || allCsvLines.length === 0) { alert('No new products detected.'); return; }

    var combined = headerLine + '\n' + allCsvLines.join('\n');
    var blob = new Blob([combined], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ALL-new-products-' + getFormattedDate() + '.csv';
    link.click();
    showToast('Combined new products: ' + allCsvLines.length + ' rows from ' + brandsIncluded.join(', '));
}

// ========== INSTRUCTIONS TOGGLE ==========
function toggleInstructions(brand) {
    var panel = document.getElementById(brand + '-instructions');
    if (panel) panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', function() {
    BrandConverter.init();
});