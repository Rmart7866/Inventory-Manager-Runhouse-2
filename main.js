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
    on:       { displayName: 'ON Running', converter: function() { return typeof OnConverter !== 'undefined' ? OnConverter : null; },         comparisonKey: '_onTrackerComparison',       hasPicker: true, multiFile: true },
    asics:    { displayName: 'ASICS',      converter: function() { return typeof AsicsConverter !== 'undefined' ? AsicsConverter : null; },   comparisonKey: '_asicsTrackerComparison',    hasPicker: true, postProcess: applyAsicsPostProcessing },
    brooks:   { displayName: 'Brooks',     converter: function() { return typeof BrooksConverter !== 'undefined' ? BrooksConverter : null; }, comparisonKey: '_brooksTrackerComparison',   hasPicker: true },
    puma:     { displayName: 'Puma',       converter: function() { return typeof PumaConverter !== 'undefined' ? PumaConverter : null; },     comparisonKey: '_pumaTrackerComparison',     hasPicker: true },
    saucony:  { displayName: 'Saucony',    converter: function() { return typeof SauconyConverter !== 'undefined' ? SauconyConverter : null; },comparisonKey: '_sauconyTrackerComparison', hasPicker: true },
    newbalance:{ displayName: 'New Balance', converter: function() { return typeof NewBalanceConverter !== 'undefined' ? NewBalanceConverter : null; }, comparisonKey: null, hasPicker: false }
};

// Brand display order
var BRAND_ORDER = ['hoka', 'on', 'asics', 'brooks', 'puma', 'saucony', 'newbalance'];

// ========== LOW STOCK READS AS 0 ==========
// A dropship order the supplier cannot fill becomes a cancelled order, and as
// volume grows that is the expensive failure. So any variant at or below this
// many units is written to Shopify as 0: it stops being sellable rather than
// selling and then being cancelled. This is applied to EVERY inventory output,
// the CSVs and the direct write alike, not just one download.
var LOW_STOCK_FLOOR = 3;

// Two brands are exempt, for two different reasons, and both matter.
//
//   brooks  Its scraper already masks, and lossily: 3 or under becomes 0, but
//           4 to 10 becomes 1. So a Brooks "1" means somewhere between four and
//           ten real units. Applying the floor again would zero exactly those,
//           taking genuinely stocked shoes off sale. Its own rule already does
//           the job, see scrapers/brooks/content.js.
//   on      Its numbers are buckets, not counts: the scraper maps In Stock to
//           30, Low Stock to 5 and Very Low Stock to 2. A 2 does not mean two
//           units, it means "ON says low", so the floor cannot read it.
var MASK_EXEMPT_BRANDS = ['brooks', 'on'];

// Rewrite every row at or below the floor to 0. Returns a new array and reports
// what it did, since silently changing quantities is the sort of thing that
// should be visible in the console when someone goes looking.
function maskLowStock(brand, inventory) {
    if (!Array.isArray(inventory) || !inventory.length) return inventory;
    if (MASK_EXEMPT_BRANDS.indexOf(brand) !== -1) return inventory;
    var masked = 0, units = 0;
    var out = inventory.map(function (row) {
        var qty = parseInt(row['On hand (new)'], 10);
        if (!(qty > 0) || qty > LOW_STOCK_FLOOR) return row;
        masked++; units += qty;
        return Object.assign({}, row, { 'On hand (new)': '0' });
    });
    if (masked) {
        console.log('[' + brand + '] Low stock floor: ' + masked + ' variant' + (masked !== 1 ? 's' : '')
            + ' at ' + LOW_STOCK_FLOOR + ' or fewer set to 0 (' + units + ' units held back to avoid cancellations).');
    }
    return out;
}

// ========== MAIN CONTROLLER ==========
var BrandConverter = {
    brands: {
        saucony: { file: null, inventory: [], csv: '', scanned: false },
        hoka: { file: null, inventory: [], csv: '', scanned: false },
        puma: { file: null, inventory: [], csv: '', scanned: false },
        newbalance: { file: null, inventory: [], csv: '' },
        asics: { file: null, inventory: [], csv: '', scanned: false },
        brooks: { file: null, inventory: [], csv: '', scanned: false },
        on: { menFile: null, womenFile: null, unisexFile: null, inventory: [], csv: '', scanned: false }
    },

    // ON uploads one scraper file per gender. Men's and women's are the normal
    // pair; unisex is OPTIONAL and most weeks is simply not uploaded, so every
    // check below is "any slot filled", never "all slots filled". Adding another
    // gender later means adding it to this list and to the card markup, nothing
    // else: the dropzone wiring, the clear buttons, the scan and the convert all
    // read this list.
    ON_SLOTS: ['men', 'women', 'unisex'],

    // The files currently uploaded, in slot order, empty slots dropped.
    onFiles: function() {
        var b = this.brands.on;
        return this.ON_SLOTS.map(function(slot) { return b[slot + 'File']; }).filter(Boolean);
    },

    hasOnFile: function() { return this.onFiles().length > 0; },

    init: function() {
        var self = this;
        // Setup dropzones for single-file brands
        ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks'].forEach(function(brand) {
            self._setupDropzone(brand);
        });
        // ON has one dropzone per gender slot
        this._setupOnDropzones();
        // ASICS optional barcode upload (multi-file)
        this._setupAsicsUpc();
    },

    _setupAsicsUpc: function() {
        var self = this;
        var zone = document.getElementById('asics-upc-dropzone');
        var input = document.getElementById('asics-upc-file');
        if (!zone || !input) return;
        zone.addEventListener('click', function() { input.click(); });
        zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
        zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
        zone.addEventListener('drop', function(e) { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files.length) self.handleAsicsUpc(e.dataTransfer.files); });
        input.addEventListener('change', function(e) { if (e.target.files.length) self.handleAsicsUpc(e.target.files); });
    },

    handleAsicsUpc: function(files) {
        var conv = (typeof AsicsConverter !== 'undefined') ? AsicsConverter : null;
        if (!conv || typeof conv.loadUPCs !== 'function') return;
        var n = files.length;
        document.getElementById('asics-upc-filename').textContent = n + ' barcode file' + (n !== 1 ? 's' : '');
        document.getElementById('asics-upc-count').textContent = 'loading…';
        document.getElementById('asics-upc-uploaded').style.display = 'flex';
        document.getElementById('asics-upc-dropzone').style.display = 'none';
        conv.loadUPCs(files).then(function(map) {
            var c = map ? Object.keys(map).length : 0;
            document.getElementById('asics-upc-count').textContent = '· ' + c.toLocaleString() + ' barcodes';
            if (BrandConverter.brands.asics && BrandConverter.brands.asics.file) BrandConverter._scanBrand('asics');
        }).catch(function(e) {
            document.getElementById('asics-upc-count').textContent = '· failed to read';
            console.warn('[ASICS] barcode load failed:', e);
        });
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
        this.ON_SLOTS.forEach(function(gender) {
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

        // Optional ON pricat (UPC) upload — fills in barcodes for new products.
        var upcZone = document.getElementById('on-upc-dropzone');
        var upcInput = document.getElementById('on-upc-file');
        if (upcZone && upcInput) {
            upcZone.addEventListener('click', function() { upcInput.click(); });
            upcZone.addEventListener('dragover', function(e) { e.preventDefault(); upcZone.classList.add('dragover'); });
            upcZone.addEventListener('dragleave', function() { upcZone.classList.remove('dragover'); });
            upcZone.addEventListener('drop', function(e) {
                e.preventDefault(); upcZone.classList.remove('dragover');
                if (e.dataTransfer.files.length > 0) self.handleOnUpc(e.dataTransfer.files[0]);
            });
            upcInput.addEventListener('change', function(e) {
                if (e.target.files.length > 0) self.handleOnUpc(e.target.files[0]);
            });
        }
    },

    // ========== ON PRICAT (UPC) HANDLING ==========
    handleOnUpc: function(file) {
        var conv = (typeof OnConverter !== 'undefined') ? OnConverter : null;
        if (!conv || typeof conv.loadUPCs !== 'function') return;
        document.getElementById('on-upc-filename').textContent = file.name;
        document.getElementById('on-upc-count').textContent = 'loading…';
        document.getElementById('on-upc-uploaded').style.display = 'flex';
        document.getElementById('on-upc-dropzone').style.display = 'none';
        conv.loadUPCs(file).then(function(map) {
            var n = map ? Object.keys(map).length : 0;
            document.getElementById('on-upc-count').textContent = '· ' + n.toLocaleString() + ' barcodes';
            // Re-scan if feeds are already loaded, so barcodes flow through.
            if (BrandConverter.hasOnFile()) BrandConverter._scanBrand('on');
        }).catch(function(e) {
            document.getElementById('on-upc-count').textContent = '· failed to read';
            console.warn('[ON] pricat load failed:', e);
        });
    },

    // ========== ON FILE HANDLING ==========
    handleOnFile: function(gender, file) {
        if (this.ON_SLOTS.indexOf(gender) === -1) return;
        this.brands.on[gender + 'File'] = file;
        document.getElementById('on-' + gender + '-filename').textContent = file.name;
        document.getElementById('on-' + gender + '-uploaded').style.display = 'flex';
        document.getElementById('on-' + gender + '-dropzone').style.display = 'none';
        this.hideStatus('on');

        // Re-scan on every drop, so a file added after the first one is folded
        // into the same picker rather than needing a clear and re-upload.
        if (this.hasOnFile()) this._scanBrand('on');
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

        // Step 2: Pre-load picker defaults + scan
        var loadDefaults = (typeof BrandPicker !== 'undefined' && BrandPicker.loadPickerDefaults)
            ? BrandPicker.loadPickerDefaults(brand) : Promise.resolve();

        loadModels.then(function() { return loadDefaults; }).then(function() {
            if (config.multiFile) {
                return converter.scanFiles(self.onFiles());
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

// ========== SIZE ALIGNMENT ==========
// "It only updated the half sizes." The store writes a whole size two ways,
// "9" on some products and "9.0" on others (and both inside one product, 24
// times over). Half sizes have one form only, "9.5", so they always match and
// whole sizes match by luck, per product. See CatalogClient.normalizeSize.
//
// So before any row leaves the pipeline, rewrite it to the store's own strings
// for that product: its exact size label (the CSV import matches handle plus
// size) and its exact SKU (the direct write matches SKU). A row the catalog has
// no opinion on, a new colorway or a size we do not carry, is left untouched.
//
// This does NOT invent variants. It only ever renames a size we already carry
// to the spelling that product uses, so it cannot create a stray variant on
// import; it stops one being created.
function alignInventoryToCatalog(brand, inventory) {
    if (!Array.isArray(inventory) || !inventory.length) return inventory;
    if (typeof CatalogClient === 'undefined' || typeof CatalogClient.variantFor !== 'function') return inventory;
    if (!CatalogClient.variantIndex()) return inventory; // catalog not loaded, leave the rows alone

    var sizesFixed = 0, skusFixed = 0;
    var out = inventory.map(function (row) {
        var handle = row.Handle;
        var size = row['Option1 Value'];
        if (!handle || !size) return row;
        var live = CatalogClient.variantFor(handle, size);
        if (!live) return row;

        var r = row;
        if (live.size && live.size !== size) {
            r = Object.assign({}, r);
            r['Option1 Value'] = live.size;
            sizesFixed++;
        }
        // The SKU is how the direct write finds the variant, and several brands
        // bake the size into it ("...-07B", "....070", "...-555"), so the same
        // disagreement lands there too. The store's own SKU is by definition the
        // one that resolves.
        if (live.sku && live.sku !== r.SKU) {
            if (r === row) r = Object.assign({}, r);
            r.SKU = live.sku;
            skusFixed++;
        }
        return r;
    });

    if (sizesFixed || skusFixed) {
        console.log('[' + brand + '] aligned to the live catalog: ' + sizesFixed + ' size label'
            + (sizesFixed !== 1 ? 's' : '') + ', ' + skusFixed + ' SKU' + (skusFixed !== 1 ? 's' : ''));
    }
    return out;
}

// ========== CLEAR FILE ==========
function clearFile(brand) {
    if (brand === 'on') {
        BrandConverter.brands.on.inventory = [];
        BrandConverter.brands.on.csv = '';
        BrandConverter.brands.on.scanned = false;

        BrandConverter.ON_SLOTS.forEach(function(slot) {
            BrandConverter.brands.on[slot + 'File'] = null;
            var input = document.getElementById('on-' + slot + '-file');
            if (input) input.value = '';
            var uploaded = document.getElementById('on-' + slot + '-uploaded');
            if (uploaded) uploaded.style.display = 'none';
            var zone = document.getElementById('on-' + slot + '-dropzone');
            if (zone) zone.style.display = 'flex';
        });
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
    if (config.multiFile) {
        if (!BrandConverter.hasOnFile()) {
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
        if (config.multiFile) {
            inventory = await converter.convert(BrandConverter.onFiles());
        } else if (converter) {
            inventory = await converter.convert(brandData.file);
        }

        // Align every row's size to what the store actually calls that size on
        // that product, BEFORE anything downstream reads the rows. Done here, in
        // one place, because both consumers match on these fields: the CSV
        // import matches handle plus size, and the direct write matches SKU.
        inventory = alignInventoryToCatalog(brand, inventory);

        // Then hold back anything too thin to fulfil, before any consumer reads
        // the rows, so the CSV, the direct write and the tracker all agree.
        inventory = maskLowStock(brand, inventory);

        brandData.inventory = inventory;
        // BOTH of these matter. The combined CSV and the direct write read
        // brandData.inventory, but the per-brand Download button reads the CSV
        // built from converter.inventoryData, and that used to be reassigned only
        // when there happened to be removals. So a brand with nothing removed
        // downloaded rows that had been through neither the size alignment nor
        // the floor above, which is most of the reason the size fix looked like
        // it had not taken.
        if (converter) converter.inventoryData = inventory;

        // Show product CSV button
        if (typeof BrandPicker !== 'undefined') BrandPicker.showProductCSVButton(brand);

        // Step 2: Tracker comparison (if available)
        if (config.comparisonKey && typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
            try {
                BrandConverter.showStatus(brand, 'Comparing against Shopify database...', 'info');
                await InventoryTracker.load(brand);
                var comparison = InventoryTracker.compare(inventory, brand);
                window[config.comparisonKey] = comparison;

                // Append removed colorways at 0.
                // Firestore mode: unchanged, auto-append every removal (the
                // Firestore mirror is small so the blast radius is small).
                // Live/Shopify mode: the removal set is the full live catalog
                // minus the feed, which a partial file can blow up to hundreds.
                // So route it through a per-product review the user approves,
                // never zero silently. See catalog-ui.js.
                if (comparison.removedColorways && comparison.removedColorways.length > 0) {
                    // Live mode: only zero products that ACTUALLY have Needham
                    // inventory. A product already at 0 is a 0 to 0 no-op, pure
                    // noise, so drop it from the list entirely.
                    if (InventoryTracker.SOURCE === 'shopify') {
                        comparison.removedColorways = comparison.removedColorways.filter(function(cw) {
                            return (cw.needhamOnHand || 0) > 0;
                        });
                    }
                    // No approval gate. A colorway that is live on Shopify with
                    // stock but absent from the WHOLE uploaded file is set to 0
                    // automatically. What got zeroed (with its live on-hand) is
                    // shown in the tracker report below, which loudly warns when
                    // the share is large enough to look like a partial/wrong file.
                    // The zero rows land in the inventory CSV; the report is the
                    // review step before the user uploads it. See BrandPicker.showTrackerReport.
                    var toZero = comparison.removedColorways;
                    if (toZero.length > 0) {
                        var removedRows = InventoryTracker.generateRemovedRows(toZero);
                        inventory = inventory.concat(removedRows);
                        brandData.inventory = inventory;
                        if (converter) converter.inventoryData = inventory;
                    }
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

// Full sync: write every loaded, selected brand's inventory straight to Shopify,
// zeroes included, instead of downloading a CSV to import. Scoped to loaded +
// selected brands exactly like downloadUnified, so an un-loaded brand is never
// touched, which is the partial-feed footgun this guards against. Dry run and an
// explicit confirm (with totals) come before any write.
function writeAllInventory() {
    var msg = document.getElementById('sync-all-msg');
    var btn = document.querySelector('.uni-btn-sync');
    var esc = (typeof escapeHtmlBP === 'function') ? escapeHtmlBP : function (s) { return String(s == null ? '' : s); };
    var setMsg = function (t, cls) { if (msg) { msg.className = 'sync-msg' + (cls ? ' ' + cls : ''); msg.innerHTML = t; } };
    var done = function () { if (btn) btn.disabled = false; };
    if (typeof CatalogClient === 'undefined' || typeof CatalogClient.setInventory !== 'function') { setMsg('Live catalog is not available.', 'err'); return; }

    var items = [], brands = [];
    BRAND_ORDER.forEach(function (brand) {
        var cb = document.getElementById('select-' + brand);
        if (cb && cb.checked && BrandConverter.brands[brand].inventory.length > 0) {
            var inv = BrandConverter.brands[brand].inventory.slice();
            var config = BRAND_CONFIG[brand];
            if (config && config.postProcess) inv = config.postProcess(inv);
            inv.forEach(function (row) {
                var sku = (row.SKU || '').toString().trim();
                if (!sku) return;
                var q = parseInt(row['On hand (new)'], 10); if (!(q >= 0)) q = 0;
                items.push({ sku: sku, quantity: q });
            });
            brands.push(brand);
        }
    });
    if (!items.length) { setMsg('No loaded brands selected. Drop a supplier file and tick the brand first.', 'err'); return; }

    if (!CatalogClient.hasWriteSecret()) {
        var s = window.prompt('Paste the write secret to write inventory to Shopify.\n(Stored in this browser only, never in the page.)');
        if (s == null || !s.trim()) { setMsg('Cancelled. A write secret is required.', 'err'); return; }
        CatalogClient.setWriteSecret(s);
    }

    if (btn) btn.disabled = true;

    // Everything is chunked client-side: the whole catalog across every brand is
    // larger than one request allows (the Worker caps items per call), so both
    // the dry-run check and the write run in slices, with live N of total.
    var DRY_CHUNK = 1000, WRITE_CHUNK = 250;
    var total = items.length;

    // ---- phase 1: dry run in slices, accumulate the plan --------------------
    var dsum = { toChange: 0, toActivate: 0, unchanged: 0, notFound: 0, zeros: 0 };
    var changed = []; // {sku, quantity} for everything that would actually change

    function checkChunk(i) {
        if (i >= total) return afterCheck();
        var slice = items.slice(i, i + DRY_CHUNK);
        setMsg('Checking with Shopify… <strong>' + Math.min(i + slice.length, total) + '</strong> / ' + total);
        return CatalogClient.setInventory(slice, true).then(function (dry) {
            if (dry.__status === 403) { CatalogClient.setWriteSecret(''); setMsg('Wrong or missing write secret. Click again to re-enter it.', 'err'); done(); return; }
            if (dry.__status !== 200 || !dry.ok) { setMsg('Could not reach the writer: ' + esc(dry.reason || dry.error || ('HTTP ' + dry.__status)), 'err'); done(); return; }
            dsum.toChange += dry.summary.toChange; dsum.unchanged += dry.summary.unchanged;
            dsum.notFound += dry.summary.notFound; dsum.zeros += dry.summary.zeros;
            dsum.toActivate += (dry.summary.toActivate || 0);
            // would_activate rows MUST be carried through with the rest. They are
            // the variants Shopify has never stocked at Needham, which is exactly
            // the population that has been silently skipped until now; leaving
            // them out here would plan the fix and then never apply it.
            dry.results.forEach(function (r) {
                if (r.status === 'would_set' || r.status === 'would_activate') changed.push({ sku: r.sku, quantity: r.to });
            });
            checkChunk(i + DRY_CHUNK);
        }).catch(function (e) { done(); setMsg('Could not reach the writer: ' + esc((e && e.message) || e), 'err'); });
    }

    function afterCheck() {
        var totalChanges = dsum.toChange + dsum.toActivate;
        if (totalChanges === 0) { setMsg('Already in sync. Nothing to write (' + dsum.unchanged + ' already match' + (dsum.notFound ? ', ' + dsum.notFound + ' not on Shopify' : '') + ').', 'ok'); done(); return; }
        var conf = 'Write ' + totalChanges + ' inventory changes to your LIVE store now?\n\n'
            + brands.map(function (b) { return b.toUpperCase(); }).join(', ') + '\n'
            + dsum.toChange + ' variants change (' + dsum.zeros + ' set to 0), ' + dsum.unchanged + ' already match'
            + (dsum.toActivate ? '\n' + dsum.toActivate + ' variants are not stocked at Needham yet and will be added there' : '')
            + (dsum.notFound ? ', ' + dsum.notFound + ' not on Shopify (skipped)' : '') + '.';
        if (!window.confirm(conf)) { setMsg('Cancelled.', ''); done(); return; }
        writeChunk(0);
    }

    // ---- phase 2: write the changed variants in slices ----------------------
    var acc = { written: 0, activated: 0, failed: 0, zeros: 0 };

    function writeChunk(i) {
        var n = changed.length;
        if (i >= n) {
            done();
            setMsg('&#10003; Wrote <strong>' + (acc.written + acc.activated) + '</strong> of ' + n + ' variant' + (n !== 1 ? 's' : '') + ' to Needham'
                + (acc.zeros ? ' (' + acc.zeros + ' zeroed)' : '')
                + (acc.activated ? ', <strong>' + acc.activated + '</strong> newly stocked at Needham' : '')
                + (acc.failed ? ', <strong>' + acc.failed + '</strong> failed' : '')
                + '. ' + dsum.unchanged + ' already matched.', acc.failed ? 'err' : 'ok');
            if (typeof showToast === 'function' && acc.written > 0) showToast('Wrote ' + acc.written + ' inventory updates to Shopify');
            return;
        }
        var slice = changed.slice(i, i + WRITE_CHUNK);
        setMsg('Writing to Shopify… <strong>' + Math.min(i + slice.length, n) + '</strong> / ' + n
            + (acc.failed ? ' (' + acc.failed + ' failed)' : ''));
        CatalogClient.setInventory(slice, false).then(function (res) {
            if (res.__status !== 200 || !res.ok) { acc.failed += slice.length; }
            else { acc.written += res.summary.written; acc.activated += (res.summary.activated || 0); acc.failed += res.summary.failed; acc.zeros += res.summary.zeros; }
            writeChunk(i + WRITE_CHUNK);
        }).catch(function () { acc.failed += slice.length; writeChunk(i + WRITE_CHUNK); });
    }

    setMsg('Checking ' + total + ' variants across ' + brands.length + ' brand' + (brands.length !== 1 ? 's' : '') + '…');
    checkChunk(0);
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
