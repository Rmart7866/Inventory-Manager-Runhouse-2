// Main Unified Converter Controller - COMPLETE WITH TRACKING & DATES & ASICS HANDLE REPLACEMENT
// Helper function to get formatted date
function getFormattedDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ========== ASICS HANDLE MAPPING CONFIGURATION ==========
// Add handle replacements here - format: 'old-handle': 'new-handle'
const ASICS_HANDLE_MAPPING = {
    '1013a213-800': 'unisex-asics-novablast-5-la-marathon',
    // Add more handle mappings here as needed
};

// ========== ASICS SIZE CONVERSION MAPPING ==========
const ASICS_SIZE_MAPPING = {
    '3.5': 'M3.5/W5',
    '4': 'M4/W5.5',
    '4.5': 'M4.5/W6',
    '5': 'M5/W6.5',
    '5.5': 'M5.5/W7',
    '6': 'M6/W7.5',
    '6.5': 'M6.5/W8',
    '7': 'M7/W8.5',
    '7.5': 'M7.5/W9',
    '8': 'M8/W9.5',
    '8.5': 'M8.5/W10',
    '9': 'M9/W10.5',
    '9.5': 'M9.5/W11',
    '10': 'M10/W11.5',
    '10.5': 'M10.5/W12',
    '11': 'M11/W12.5',
    '11.5': 'M11.5/W13',
    '12': 'M12/W13.5',
    '12.5': 'M12.5/W14',
    '13': 'M13',
    '14': 'M14',
    '15': 'M15'
};

// Handles that need size conversion (only specific products)
const ASICS_HANDLES_NEEDING_SIZE_CONVERSION = [
    'unisex-asics-novablast-5-la-marathon',
];

// Function to replace handles in ASICS data
function replaceAsicsHandles(inventory) {
    return inventory.map(row => {
        const originalHandle = row.Handle;
        if (ASICS_HANDLE_MAPPING[originalHandle]) {
            const newHandle = ASICS_HANDLE_MAPPING[originalHandle];
            console.log(`Replacing ASICS handle: "${originalHandle}" → "${newHandle}"`);
            return { ...row, Handle: newHandle };
        }
        return row;
    });
}

// Function to convert ASICS sizes to Shopify unisex format (only for specific handles)
function convertAsicsSizes(inventory) {
    return inventory.map(row => {
        const originalSize = row['Option1 Value'];
        if (ASICS_HANDLES_NEEDING_SIZE_CONVERSION.includes(row.Handle) && ASICS_SIZE_MAPPING[originalSize]) {
            const newSize = ASICS_SIZE_MAPPING[originalSize];
            console.log(`Converting ASICS size for ${row.Handle}: "${originalSize}" → "${newSize}"`);
            return { ...row, 'Option1 Value': newSize };
        }
        return row;
    });
}
// ========== END ASICS HANDLE MAPPING ==========

const BrandConverter = {
    brands: {
        saucony: { file: null, inventory: [], csv: '', scanned: false },
        hoka: { file: null, inventory: [], csv: '', scanned: false },
        puma: { file: null, inventory: [], csv: '', scanned: false },
        newbalance: { file: null, inventory: [], csv: '' },
        asics: { file: null, inventory: [], csv: '', scanned: false },
        brooks: { file: null, inventory: [], csv: '', scanned: false },
        on: { menFile: null, womenFile: null, inventory: [], csv: '', scanned: false }
    },
    
    init() {
        ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks'].forEach(brand => {
            this.setupBrandDropzone(brand);
        });
        this.setupOnDropzones();
    },
    
    setupBrandDropzone(brand) {
        const dropZone = document.getElementById(`${brand}-dropzone`);
        const fileInput = document.getElementById(`${brand}-file`);
        
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleFile(brand, e.dataTransfer.files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(brand, e.target.files[0]);
            }
        });
    },
    
    setupOnDropzones() {
        // Setup Men's dropzone
        const menDropZone = document.getElementById('on-men-dropzone');
        const menFileInput = document.getElementById('on-men-file');
        
        menDropZone.addEventListener('click', () => menFileInput.click());
        menDropZone.addEventListener('dragover', (e) => { e.preventDefault(); menDropZone.classList.add('dragover'); });
        menDropZone.addEventListener('dragleave', () => { menDropZone.classList.remove('dragover'); });
        menDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            menDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleOnFile('men', e.dataTransfer.files[0]);
        });
        menFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleOnFile('men', e.target.files[0]);
        });
        
        // Setup Women's dropzone
        const womenDropZone = document.getElementById('on-women-dropzone');
        const womenFileInput = document.getElementById('on-women-file');
        
        womenDropZone.addEventListener('click', () => womenFileInput.click());
        womenDropZone.addEventListener('dragover', (e) => { e.preventDefault(); womenDropZone.classList.add('dragover'); });
        womenDropZone.addEventListener('dragleave', () => { womenDropZone.classList.remove('dragover'); });
        womenDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            womenDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) this.handleOnFile('women', e.dataTransfer.files[0]);
        });
        womenFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleOnFile('women', e.target.files[0]);
        });
    },
    
    handleOnFile(gender, file) {
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

        // ========== ON: SCAN + PICKER (like HOKA flow) ==========
        // Scan as soon as at least ONE file is uploaded; re-scan if second file added
        if (this.brands.on.menFile || this.brands.on.womenFile) {
            this.brands.on.scanned = false;
            document.getElementById('on-convert').style.display = 'none';
            this.showStatus('on', 'Scanning files for products...', 'success');

            var self = this;
            var menFile = this.brands.on.menFile;
            var womenFile = this.brands.on.womenFile;

            // Load Firestore known products for ON (if available), then scan
            var loadModels = Promise.resolve();
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                loadModels = InventoryTracker.load('on').then(function(data) {
                    OnConverter._knownProducts = data.models;
                    console.log('Loaded ' + data.models.size + ' known ON models for picker defaults');
                }).catch(function(err) {
                    console.warn('Could not load Firestore ON models, all will be checked by default:', err);
                    OnConverter._knownProducts = null;
                });
            }

            loadModels.then(function() {
                return OnConverter.scanFiles(menFile, womenFile);
            }).then(function(products) {
                // Show the product picker UI
                if (typeof showOnPicker === 'function') {
                    showOnPicker(products);
                }

                self.brands.on.scanned = true;
                document.getElementById('on-convert').style.display = 'block';
                var fileCount = (menFile ? 1 : 0) + (womenFile ? 1 : 0);
                self.showStatus('on', 'Found ' + products.length + ' product models in ' + fileCount + ' file(s). Select which to include, then click Generate.', 'success');
            }).catch(function(err) {
                self.showStatus('on', 'Error scanning files: ' + err.message, 'error');
                console.error('ON scan error:', err);
            });
        }
    },
    
    handleFile(brand, file) {
        this.brands[brand].file = file;
        document.getElementById(`${brand}-filename`).textContent = file.name;
        document.getElementById(`${brand}-uploaded`).style.display = 'flex';
        document.getElementById(`${brand}-dropzone`).style.display = 'none';
        this.hideStatus(brand);

        // HOKA: load Firestore data, then scan the file and show the product picker
        if (brand === 'hoka') {
            this.brands.hoka.scanned = false;
            document.getElementById('hoka-convert').style.display = 'none';
            this.showStatus('hoka', 'Loading database...', 'success');

            var loadModels = Promise.resolve();
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                loadModels = InventoryTracker.load('hoka').then(function(data) {
                    HokaConverter._knownProducts = data.models;
                    console.log('Loaded ' + data.models.size + ' known models for picker defaults');
                }).catch(function(err) {
                    console.warn('Could not load Firestore models, using hardcoded defaults:', err);
                    HokaConverter._knownProducts = null;
                });
            }

            loadModels.then(function() {
                BrandConverter.showStatus('hoka', 'Scanning file for products...', 'success');
                return HokaConverter.scanFile(file);
            }).then(function(products) {
                buildHokaProductPicker(products);
                BrandConverter.brands.hoka.scanned = true;
                document.getElementById('hoka-convert').style.display = 'block';
                BrandConverter.showStatus('hoka', 'Found ' + products.length + ' products in file. Select which to include, then click Generate.', 'success');
            }).catch(function(err) {
                BrandConverter.showStatus('hoka', 'Error scanning file: ' + err.message, 'error');
                console.error('HOKA scan error:', err);
            });

        // ASICS: scan file and show picker (same pattern as HOKA)
        } else if (brand === 'asics') {
            this.brands.asics.scanned = false;
            document.getElementById('asics-convert').style.display = 'none';
            this.showStatus('asics', 'Scanning file for products...', 'success');

            var loadAsicsModels = Promise.resolve();
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                loadAsicsModels = InventoryTracker.load('asics').then(function(data) {
                    AsicsConverter._knownProducts = data.models;
                    console.log('Loaded ' + data.models.size + ' known ASICS models for picker defaults');
                }).catch(function(err) {
                    console.warn('Could not load Firestore ASICS models, all checked by default:', err);
                    AsicsConverter._knownProducts = null;
                });
            }

            loadAsicsModels.then(function() {
                return AsicsConverter.scanFile(file);
            }).then(function(products) {
                if (typeof showAsicsPicker === 'function') {
                    showAsicsPicker(products);
                }
                BrandConverter.brands.asics.scanned = true;
                document.getElementById('asics-convert').style.display = 'block';
                BrandConverter.showStatus('asics', 'Found ' + products.length + ' product models. Select which to include, then click Generate.', 'success');
            }).catch(function(err) {
                BrandConverter.showStatus('asics', 'Error scanning file: ' + err.message, 'error');
                console.error('ASICS scan error:', err);
            });

        // BROOKS: scan file and show picker
        } else if (brand === 'brooks') {
            this.brands.brooks.scanned = false;
            document.getElementById('brooks-convert').style.display = 'none';
            this.showStatus('brooks', 'Scanning file for products...', 'success');

            var loadBrooksModels = Promise.resolve();
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                loadBrooksModels = InventoryTracker.load('brooks').then(function(data) {
                    BrooksConverter._knownProducts = data.models;
                    console.log('Loaded ' + data.models.size + ' known Brooks models for picker defaults');
                }).catch(function(err) {
                    console.warn('Could not load Firestore Brooks models:', err);
                    BrooksConverter._knownProducts = null;
                });
            }

            loadBrooksModels.then(function() {
                return BrooksConverter.scanFile(file);
            }).then(function(products) {
                if (typeof showBrooksPicker === 'function') {
                    showBrooksPicker(products);
                }
                BrandConverter.brands.brooks.scanned = true;
                document.getElementById('brooks-convert').style.display = 'block';
                BrandConverter.showStatus('brooks', 'Found ' + products.length + ' product models. Select which to include, then click Generate.', 'success');
            }).catch(function(err) {
                BrandConverter.showStatus('brooks', 'Error scanning file: ' + err.message, 'error');
                console.error('Brooks scan error:', err);
            });

        // SAUCONY: scan file and show picker
        } else if (brand === 'saucony') {
            this.brands.saucony.scanned = false;
            document.getElementById('saucony-convert').style.display = 'none';
            this.showStatus('saucony', 'Scanning file for products...', 'success');

            var loadSauconyModels = Promise.resolve();
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                loadSauconyModels = InventoryTracker.load('saucony').then(function(data) {
                    SauconyConverter._knownProducts = data.models;
                    console.log('Loaded ' + data.models.size + ' known Saucony models');
                }).catch(function(err) {
                    console.warn('Could not load Firestore Saucony models:', err);
                    SauconyConverter._knownProducts = null;
                });
            }

            loadSauconyModels.then(function() {
                return SauconyConverter.scanFile(file);
            }).then(function(products) {
                if (typeof showSauconyPicker === 'function') showSauconyPicker(products);
                BrandConverter.brands.saucony.scanned = true;
                document.getElementById('saucony-convert').style.display = 'block';
                BrandConverter.showStatus('saucony', 'Found ' + products.length + ' products. Select which to include, then click Generate.', 'success');
            }).catch(function(err) {
                BrandConverter.showStatus('saucony', 'Error scanning file: ' + err.message, 'error');
                console.error('Saucony scan error:', err);
            });

        // PUMA: scan file and show picker
        } else if (brand === 'puma') {
            this.brands.puma.scanned = false;
            document.getElementById('puma-convert').style.display = 'none';
            this.showStatus('puma', 'Scanning file for running products...', 'success');

            var loadPumaModels = Promise.resolve();
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                loadPumaModels = InventoryTracker.load('puma').then(function(data) {
                    PumaConverter._knownProducts = data.models;
                    console.log('Loaded ' + data.models.size + ' known Puma models');
                }).catch(function(err) {
                    console.warn('Could not load Firestore Puma models:', err);
                    PumaConverter._knownProducts = null;
                });
            }

            loadPumaModels.then(function() {
                return PumaConverter.scanFile(file);
            }).then(function(products) {
                if (typeof showPumaPicker === 'function') showPumaPicker(products);
                BrandConverter.brands.puma.scanned = true;
                document.getElementById('puma-convert').style.display = 'block';
                BrandConverter.showStatus('puma', 'Found ' + products.length + ' running products. Select which to include, then click Generate.', 'success');
            }).catch(function(err) {
                BrandConverter.showStatus('puma', 'Error scanning file: ' + err.message, 'error');
                console.error('Puma scan error:', err);
            });

        } else {
            document.getElementById(`${brand}-convert`).style.display = 'block';
        }
    },
    
    showStatus(brand, message, type) {
        const statusDiv = document.getElementById(`${brand}-status`);
        statusDiv.textContent = message;
        statusDiv.className = 'status ' + type;
        statusDiv.style.display = 'block';
    },
    
    hideStatus(brand) {
        document.getElementById(`${brand}-status`).style.display = 'none';
    },
    
    updateDownloadSection() {
        const downloadSection = document.getElementById('download-section');
        const individualDownloads = document.getElementById('individual-downloads');
        const unifiedInfo = document.getElementById('unified-info');
        
        individualDownloads.innerHTML = '';
        
        let hasAnyInventory = false;
        let totalVariants = 0;
        
        ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks', 'on'].forEach(brand => {
            if (this.brands[brand].inventory.length > 0) {
                hasAnyInventory = true;
                totalVariants += this.brands[brand].inventory.length;
                
                const container = document.createElement('div');
                container.className = 'brand-download-row';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `select-${brand}`;
                checkbox.className = 'brand-checkbox';
                checkbox.checked = true;
                checkbox.style.width = '20px';
                checkbox.style.height = '20px';
                checkbox.style.cursor = 'pointer';
                checkbox.onchange = () => this.updateUnifiedInfo();
                
                const btn = document.createElement('button');
                btn.className = `download-btn ${brand}`;
                btn.innerHTML = `${this.getBrandDisplayName(brand)} <span style="color: #6c757d; font-weight: 400;">(${this.brands[brand].inventory.length} variants)</span>`;
                btn.onclick = () => this.downloadBrandInventory(brand);
                
                const resetBtn = document.createElement('button');
                resetBtn.className = `download-btn reset-btn`;
                resetBtn.innerHTML = `Reset to 0`;
                resetBtn.onclick = () => this.downloadBrandReset(brand);
                
                container.appendChild(checkbox);
                container.appendChild(btn);
                container.appendChild(resetBtn);
                individualDownloads.appendChild(container);
            }
        });
        
        if (hasAnyInventory) {
            downloadSection.style.display = 'block';
            this.updateUnifiedInfo();
        } else {
            downloadSection.style.display = 'none';
        }
    },
    
    updateUnifiedInfo() {
        const unifiedInfo = document.getElementById('unified-info');
        let selectedVariants = 0;
        let selectedBrands = [];
        
        ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks', 'on'].forEach(brand => {
            const checkbox = document.getElementById(`select-${brand}`);
            if (checkbox && checkbox.checked && this.brands[brand].inventory.length > 0) {
                selectedVariants += this.brands[brand].inventory.length;
                selectedBrands.push(this.getBrandDisplayName(brand));
            }
        });
        
        if (selectedBrands.length === 0) {
            unifiedInfo.textContent = 'Select brands above to combine';
            unifiedInfo.style.color = '#6c757d';
        } else {
            unifiedInfo.textContent = `Ready to combine ${selectedVariants} variants from ${selectedBrands.join(', ')}`;
            unifiedInfo.style.color = '#28a745';
        }
    },
    
    getBrandDisplayName(brand) {
        const names = {
            saucony: 'Saucony',
            hoka: 'HOKA',
            puma: 'Puma',
            newbalance: 'New Balance',
            asics: 'ASICS',
            brooks: 'Brooks',
            on: 'ON Running'
        };
        return names[brand] || brand;
    },
    
    downloadBrandInventory(brand) {
        const date = getFormattedDate();
        const filename = `${brand}-inventory-${date}.csv`;
        const csvData = this.brands[brand].csv;
        
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    
    downloadBrandReset(brand) {
        const date = getFormattedDate();
        const filename = `${brand}-reset-${date}.csv`;
        
        const resetInventory = this.brands[brand].inventory.map(row => ({
            ...row,
            'On hand (new)': '0'
        }));
        
        const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                       '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                       '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                       '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
        
        const csvRows = [inventoryHeaders.join(',')];
        
        resetInventory.forEach(row => {
            const csvRow = [
                row.Handle,
                `"${(row.Title || '').replace(/"/g, '""')}"`,
                row['Option1 Name'],
                row['Option1 Value'],
                row['Option2 Name'] || '',
                row['Option2 Value'] || '',
                row['Option3 Name'] || '',
                row['Option3 Value'] || '',
                row.SKU,
                row.Barcode || '',
                '', '',
                row.Location,
                '', '', '', '', '', '',
                '0'
            ];
            csvRows.push(csvRow.join(','));
        });
        
        const csvData = csvRows.join('\n');
        
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// Clear file function
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

        // Hide ON picker and tracker
        var pickerContainer = document.getElementById('on-picker-container');
        if (pickerContainer) pickerContainer.style.display = 'none';
        var trackerReport = document.getElementById('on-tracker-report');
        if (trackerReport) trackerReport.style.display = 'none';
        if (typeof hideOnNewProductButton === 'function') hideOnNewProductButton();
        var productCsvBtn = document.getElementById('on-product-csv-btn');
        if (productCsvBtn) productCsvBtn.style.display = 'none';
    } else {
        BrandConverter.brands[brand].file = null;
        BrandConverter.brands[brand].inventory = [];
        BrandConverter.brands[brand].csv = '';
        
        document.getElementById(`${brand}-file`).value = '';
        document.getElementById(`${brand}-uploaded`).style.display = 'none';
        document.getElementById(`${brand}-convert`).style.display = 'none';
        document.getElementById(`${brand}-dropzone`).style.display = 'flex';
        BrandConverter.hideStatus(brand);

        if (brand === 'hoka') {
            document.getElementById('hoka-product-picker').style.display = 'none';
            BrandConverter.brands.hoka.scanned = false;
            if (typeof hideHokaProductCSVButton === 'function') hideHokaProductCSVButton();
        }

        if (brand === 'asics') {
            BrandConverter.brands.asics.scanned = false;
            var asicsPickerContainer = document.getElementById('asics-picker-container');
            if (asicsPickerContainer) asicsPickerContainer.style.display = 'none';
            var asicsTrackerReport = document.getElementById('asics-tracker-report');
            if (asicsTrackerReport) asicsTrackerReport.style.display = 'none';
            var asicsProductBtn = document.getElementById('asics-product-csv-btn');
            if (asicsProductBtn) asicsProductBtn.style.display = 'none';
            var asicsNewProductBtn = document.getElementById('asics-new-product-csv-btn');
            if (asicsNewProductBtn) asicsNewProductBtn.style.display = 'none';
        }

        if (brand === 'brooks') {
            BrandConverter.brands.brooks.scanned = false;
            var brooksPickerContainer = document.getElementById('brooks-picker-container');
            if (brooksPickerContainer) brooksPickerContainer.style.display = 'none';
            var brooksTrackerReport = document.getElementById('brooks-tracker-report');
            if (brooksTrackerReport) brooksTrackerReport.style.display = 'none';
            var brooksProductBtn = document.getElementById('brooks-product-csv-btn');
            if (brooksProductBtn) brooksProductBtn.style.display = 'none';
            var brooksNewProductBtn = document.getElementById('brooks-new-product-csv-btn');
            if (brooksNewProductBtn) brooksNewProductBtn.style.display = 'none';
        }

        if (brand === 'puma') {
            BrandConverter.brands.puma.scanned = false;
            var pumaPickerContainer = document.getElementById('puma-picker-container');
            if (pumaPickerContainer) pumaPickerContainer.style.display = 'none';
            var pumaTrackerReport = document.getElementById('puma-tracker-report');
            if (pumaTrackerReport) pumaTrackerReport.style.display = 'none';
            var pumaProductBtn = document.getElementById('puma-product-csv-btn');
            if (pumaProductBtn) pumaProductBtn.style.display = 'none';
            var pumaNewProductBtn = document.getElementById('puma-new-product-csv-btn');
            if (pumaNewProductBtn) pumaNewProductBtn.style.display = 'none';
        }

        if (brand === 'saucony') {
            BrandConverter.brands.saucony.scanned = false;
            var sauconyPickerContainer = document.getElementById('saucony-picker-container');
            if (sauconyPickerContainer) sauconyPickerContainer.style.display = 'none';
            var sauconyTrackerReport = document.getElementById('saucony-tracker-report');
            if (sauconyTrackerReport) sauconyTrackerReport.style.display = 'none';
            var sauconyProductBtn = document.getElementById('saucony-product-csv-btn');
            if (sauconyProductBtn) sauconyProductBtn.style.display = 'none';
            var sauconyNewProductBtn = document.getElementById('saucony-new-product-csv-btn');
            if (sauconyNewProductBtn) sauconyNewProductBtn.style.display = 'none';
        }
    }
    
    BrandConverter.updateDownloadSection();
}

// Convert brand function
async function convertBrand(brand) {
    const file = BrandConverter.brands[brand].file;
    
    // ========== ON RUNNING: Use OnConverter (like HOKA flow) ==========
    if (brand === 'on') {
        if (!BrandConverter.brands.on.menFile && !BrandConverter.brands.on.womenFile) {
            BrandConverter.showStatus('on', 'Please upload at least one file!', 'error');
            return;
        }

        // Check that scan is done
        if (!BrandConverter.brands.on.scanned) {
            BrandConverter.showStatus('on', 'Files are still being scanned, please wait...', 'error');
            return;
        }

        // Check that products are selected (from picker)
        if (OnConverter.selectedProducts.size === 0) {
            BrandConverter.showStatus('on', 'Please select at least one product to include!', 'error');
            return;
        }
        
        BrandConverter.showStatus('on', 'Processing with OnConverter...', 'success');
        
        try {
            // Use OnConverter.convert() which respects selectedProducts and applies handle mapping
            var inventory = await OnConverter.convert(
                BrandConverter.brands.on.menFile,
                BrandConverter.brands.on.womenFile
            );
            
            BrandConverter.brands.on.inventory = inventory;

            // Show the product CSV download button
            var productCsvBtn = document.getElementById('on-product-csv-btn');
            if (productCsvBtn) productCsvBtn.style.display = 'block';

            // ========== ON Inventory Tracker (like HOKA) ==========
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                try {
                    BrandConverter.showStatus('on', 'Loading Shopify database for ON...', 'success');

                    // Load what's known to be on Shopify for ON
                    await InventoryTracker.load('on');

                    // Compare current inventory against Firestore
                    var comparison = InventoryTracker.compare(inventory);

                    // Store comparison for tracker report / new product CSV
                    window._onTrackerComparison = comparison;

                    // Append removed colorways at 0 quantity
                    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
                        var removedRows = InventoryTracker.generateRemovedRows(comparison.removedColorways);
                        inventory = inventory.concat(removedRows);
                        BrandConverter.brands.on.inventory = inventory;
                        OnConverter.inventoryData = inventory;
                    }

                    // Update existing colorways with latest quantities
                    await InventoryTracker.updateExistingColorways('on', inventory);

                    // Show tracker report in UI
                    if (typeof showOnTrackerReport === 'function') {
                        showOnTrackerReport(comparison);
                    }

                    var statusMsg = 'Processed ' + inventory.length + ' variants';
                    if (comparison.removedColorways && comparison.removedColorways.length > 0) {
                        statusMsg += ' (includes ' + comparison.removedColorways.length + ' removed colorways at 0)';
                    }
                    if (comparison.newProducts && comparison.newProducts.length > 0) {
                        statusMsg += ' | ' + comparison.newProducts.length + ' new products detected';
                    }
                    if (comparison.newColorways && comparison.newColorways.length > 0) {
                        statusMsg += ' | ' + comparison.newColorways.length + ' new colorways detected';
                    }
                    BrandConverter.showStatus('on', statusMsg, 'success');
                } catch (trackerError) {
                    console.warn('ON inventory tracker error (continuing without tracking):', trackerError);
                    BrandConverter.showStatus('on', 'Processed ' + inventory.length + ' variants (tracker unavailable)', 'success');
                }
            } else {
                BrandConverter.showStatus('on', 'Processed ' + inventory.length + ' variants', 'success');
            }

            // Generate the CSV from OnConverter
            BrandConverter.brands.on.csv = OnConverter.generateInventoryCSV();

            BrandConverter.updateDownloadSection();
        } catch (error) {
            BrandConverter.showStatus('on', 'Error: ' + error.message, 'error');
            console.error('ON conversion error:', error);
        }
        return;
    }
    
    // ========== Regular single-file handling for other brands ==========
    if (!file) {
        BrandConverter.showStatus(brand, 'Please select a file first!', 'error');
        return;
    }

    // HOKA: check that products are selected
    if (brand === 'hoka') {
        if (!BrandConverter.brands.hoka.scanned) {
            BrandConverter.showStatus('hoka', 'File is still being scanned, please wait...', 'error');
            return;
        }
        if (HokaConverter.selectedProducts.size === 0) {
            BrandConverter.showStatus('hoka', 'Please select at least one product to include!', 'error');
            return;
        }
    }

    // ASICS: check scan + selection, then use AsicsConverter with tracker
    if (brand === 'asics') {
        if (!BrandConverter.brands.asics.scanned) {
            BrandConverter.showStatus('asics', 'File is still being scanned, please wait...', 'error');
            return;
        }
        if (AsicsConverter.selectedProducts.size === 0) {
            BrandConverter.showStatus('asics', 'Please select at least one product!', 'error');
            return;
        }

        BrandConverter.showStatus('asics', 'Processing with AsicsConverter...', 'success');

        try {
            var asicsInventory = await AsicsConverter.convert(file);
            BrandConverter.brands.asics.inventory = asicsInventory;

            var asicsProductBtn = document.getElementById('asics-product-csv-btn');
            if (asicsProductBtn) asicsProductBtn.style.display = 'block';

            // Inventory Tracker
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                try {
                    BrandConverter.showStatus('asics', 'Loading Shopify database for ASICS...', 'success');
                    await InventoryTracker.load('asics');
                    var asicsComparison = InventoryTracker.compare(asicsInventory);
                    window._asicsTrackerComparison = asicsComparison;

                    if (asicsComparison.removedColorways && asicsComparison.removedColorways.length > 0) {
                        var removedRows = InventoryTracker.generateRemovedRows(asicsComparison.removedColorways);
                        asicsInventory = asicsInventory.concat(removedRows);
                        BrandConverter.brands.asics.inventory = asicsInventory;
                        AsicsConverter.inventoryData = asicsInventory;
                    }

                    await InventoryTracker.updateExistingColorways('asics', asicsInventory);

                    if (typeof showAsicsTrackerReport === 'function') {
                        showAsicsTrackerReport(asicsComparison);
                    }

                    var aMsg = 'Processed ' + asicsInventory.length + ' variants';
                    if (asicsComparison.removedColorways && asicsComparison.removedColorways.length > 0) {
                        aMsg += ' (includes ' + asicsComparison.removedColorways.length + ' removed at 0)';
                    }
                    if (asicsComparison.newProducts && asicsComparison.newProducts.length > 0) {
                        aMsg += ' | ' + asicsComparison.newProducts.length + ' new products';
                    }
                    if (asicsComparison.newColorways && asicsComparison.newColorways.length > 0) {
                        aMsg += ' | ' + asicsComparison.newColorways.length + ' new colorways';
                    }
                    BrandConverter.showStatus('asics', aMsg, 'success');
                } catch (trackerError) {
                    console.warn('ASICS tracker error (continuing):', trackerError);
                    BrandConverter.showStatus('asics', 'Processed ' + asicsInventory.length + ' variants (tracker unavailable)', 'success');
                }
            } else {
                BrandConverter.showStatus('asics', 'Processed ' + asicsInventory.length + ' variants', 'success');
            }

            BrandConverter.brands.asics.csv = AsicsConverter.generateInventoryCSV();
            BrandConverter.updateDownloadSection();
        } catch (asicsError) {
            BrandConverter.showStatus('asics', 'Error: ' + asicsError.message, 'error');
            console.error('ASICS conversion error:', asicsError);
        }
        return;
    }

    // BROOKS: check scan + selection, then use BrooksConverter with tracker
    if (brand === 'brooks') {
        if (!BrandConverter.brands.brooks.scanned) {
            BrandConverter.showStatus('brooks', 'File is still being scanned, please wait...', 'error');
            return;
        }
        if (BrooksConverter.selectedProducts.size === 0) {
            BrandConverter.showStatus('brooks', 'Please select at least one product!', 'error');
            return;
        }

        BrandConverter.showStatus('brooks', 'Processing with BrooksConverter...', 'success');

        try {
            var brooksInventory = await BrooksConverter.convert(file);
            BrandConverter.brands.brooks.inventory = brooksInventory;

            var brooksProductBtn = document.getElementById('brooks-product-csv-btn');
            if (brooksProductBtn) brooksProductBtn.style.display = 'block';

            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                try {
                    BrandConverter.showStatus('brooks', 'Loading Shopify database for Brooks...', 'success');
                    await InventoryTracker.load('brooks');
                    var brooksComparison = InventoryTracker.compare(brooksInventory);
                    window._brooksTrackerComparison = brooksComparison;

                    if (brooksComparison.removedColorways && brooksComparison.removedColorways.length > 0) {
                        var removedRows = InventoryTracker.generateRemovedRows(brooksComparison.removedColorways);
                        brooksInventory = brooksInventory.concat(removedRows);
                        BrandConverter.brands.brooks.inventory = brooksInventory;
                        BrooksConverter.inventoryData = brooksInventory;
                    }

                    await InventoryTracker.updateExistingColorways('brooks', brooksInventory);

                    if (typeof showBrooksTrackerReport === 'function') {
                        showBrooksTrackerReport(brooksComparison);
                    }

                    var bMsg = 'Processed ' + brooksInventory.length + ' variants';
                    if (brooksComparison.removedColorways && brooksComparison.removedColorways.length > 0) {
                        bMsg += ' (includes ' + brooksComparison.removedColorways.length + ' removed at 0)';
                    }
                    if (brooksComparison.newProducts && brooksComparison.newProducts.length > 0) {
                        bMsg += ' | ' + brooksComparison.newProducts.length + ' new products';
                    }
                    if (brooksComparison.newColorways && brooksComparison.newColorways.length > 0) {
                        bMsg += ' | ' + brooksComparison.newColorways.length + ' new colorways';
                    }
                    BrandConverter.showStatus('brooks', bMsg, 'success');
                } catch (trackerError) {
                    console.warn('Brooks tracker error (continuing):', trackerError);
                    BrandConverter.showStatus('brooks', 'Processed ' + brooksInventory.length + ' variants (tracker unavailable)', 'success');
                }
            } else {
                BrandConverter.showStatus('brooks', 'Processed ' + brooksInventory.length + ' variants', 'success');
            }

            BrandConverter.brands.brooks.csv = BrooksConverter.generateInventoryCSV();
            BrandConverter.updateDownloadSection();
        } catch (brooksError) {
            BrandConverter.showStatus('brooks', 'Error: ' + brooksError.message, 'error');
            console.error('Brooks conversion error:', brooksError);
        }
        return;
    }

    // PUMA: check scan + selection, then use PumaConverter with tracker
    if (brand === 'puma') {
        if (!BrandConverter.brands.puma.scanned) {
            BrandConverter.showStatus('puma', 'File is still being scanned, please wait...', 'error');
            return;
        }
        if (PumaConverter.selectedProducts.size === 0) {
            BrandConverter.showStatus('puma', 'Please select at least one product!', 'error');
            return;
        }

        BrandConverter.showStatus('puma', 'Processing with PumaConverter...', 'success');

        try {
            var pumaInventory = await PumaConverter.convert(file);
            BrandConverter.brands.puma.inventory = pumaInventory;

            var pumaProductBtn = document.getElementById('puma-product-csv-btn');
            if (pumaProductBtn) pumaProductBtn.style.display = 'block';

            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                try {
                    BrandConverter.showStatus('puma', 'Loading Shopify database for Puma...', 'success');
                    await InventoryTracker.load('puma');
                    var pumaComparison = InventoryTracker.compare(pumaInventory);
                    window._pumaTrackerComparison = pumaComparison;

                    if (pumaComparison.removedColorways && pumaComparison.removedColorways.length > 0) {
                        var removedRows = InventoryTracker.generateRemovedRows(pumaComparison.removedColorways);
                        pumaInventory = pumaInventory.concat(removedRows);
                        BrandConverter.brands.puma.inventory = pumaInventory;
                        PumaConverter.inventoryData = pumaInventory;
                    }

                    await InventoryTracker.updateExistingColorways('puma', pumaInventory);

                    if (typeof showPumaTrackerReport === 'function') showPumaTrackerReport(pumaComparison);

                    var pMsg = 'Processed ' + pumaInventory.length + ' variants';
                    if (pumaComparison.removedColorways && pumaComparison.removedColorways.length > 0) pMsg += ' (includes ' + pumaComparison.removedColorways.length + ' removed at 0)';
                    if (pumaComparison.newProducts && pumaComparison.newProducts.length > 0) pMsg += ' | ' + pumaComparison.newProducts.length + ' new products';
                    if (pumaComparison.newColorways && pumaComparison.newColorways.length > 0) pMsg += ' | ' + pumaComparison.newColorways.length + ' new colorways';
                    BrandConverter.showStatus('puma', pMsg, 'success');
                } catch (trackerError) {
                    console.warn('Puma tracker error (continuing):', trackerError);
                    BrandConverter.showStatus('puma', 'Processed ' + pumaInventory.length + ' variants (tracker unavailable)', 'success');
                }
            } else {
                BrandConverter.showStatus('puma', 'Processed ' + pumaInventory.length + ' variants', 'success');
            }

            BrandConverter.brands.puma.csv = PumaConverter.generateInventoryCSV();
            BrandConverter.updateDownloadSection();
        } catch (pumaError) {
            BrandConverter.showStatus('puma', 'Error: ' + pumaError.message, 'error');
            console.error('Puma conversion error:', pumaError);
        }
        return;
    }

    // SAUCONY: check scan + selection, then use SauconyConverter with tracker
    if (brand === 'saucony') {
        if (!BrandConverter.brands.saucony.scanned) {
            BrandConverter.showStatus('saucony', 'File is still being scanned, please wait...', 'error');
            return;
        }
        if (SauconyConverter.selectedProducts.size === 0) {
            BrandConverter.showStatus('saucony', 'Please select at least one product!', 'error');
            return;
        }

        BrandConverter.showStatus('saucony', 'Processing with SauconyConverter...', 'success');

        try {
            var sauconyInventory = await SauconyConverter.convert(file);
            BrandConverter.brands.saucony.inventory = sauconyInventory;

            var sauconyProductBtn = document.getElementById('saucony-product-csv-btn');
            if (sauconyProductBtn) sauconyProductBtn.style.display = 'block';

            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                try {
                    BrandConverter.showStatus('saucony', 'Loading Shopify database for Saucony...', 'success');
                    await InventoryTracker.load('saucony');
                    var sauconyComparison = InventoryTracker.compare(sauconyInventory);
                    window._sauconyTrackerComparison = sauconyComparison;

                    if (sauconyComparison.removedColorways && sauconyComparison.removedColorways.length > 0) {
                        var removedRows = InventoryTracker.generateRemovedRows(sauconyComparison.removedColorways);
                        sauconyInventory = sauconyInventory.concat(removedRows);
                        BrandConverter.brands.saucony.inventory = sauconyInventory;
                        SauconyConverter.inventoryData = sauconyInventory;
                    }

                    await InventoryTracker.updateExistingColorways('saucony', sauconyInventory);
                    if (typeof showSauconyTrackerReport === 'function') showSauconyTrackerReport(sauconyComparison);

                    var sMsg = 'Processed ' + sauconyInventory.length + ' variants';
                    if (sauconyComparison.removedColorways && sauconyComparison.removedColorways.length > 0) sMsg += ' (includes ' + sauconyComparison.removedColorways.length + ' removed at 0)';
                    if (sauconyComparison.newProducts && sauconyComparison.newProducts.length > 0) sMsg += ' | ' + sauconyComparison.newProducts.length + ' new products';
                    if (sauconyComparison.newColorways && sauconyComparison.newColorways.length > 0) sMsg += ' | ' + sauconyComparison.newColorways.length + ' new colorways';
                    BrandConverter.showStatus('saucony', sMsg, 'success');
                } catch (trackerError) {
                    console.warn('Saucony tracker error:', trackerError);
                    BrandConverter.showStatus('saucony', 'Processed ' + sauconyInventory.length + ' variants (tracker unavailable)', 'success');
                }
            } else {
                BrandConverter.showStatus('saucony', 'Processed ' + sauconyInventory.length + ' variants', 'success');
            }

            BrandConverter.brands.saucony.csv = SauconyConverter.generateInventoryCSV();
            BrandConverter.updateDownloadSection();
        } catch (sauconyError) {
            BrandConverter.showStatus('saucony', 'Error: ' + sauconyError.message, 'error');
            console.error('Saucony conversion error:', sauconyError);
        }
        return;
    }
    
    BrandConverter.showStatus(brand, 'Processing...', 'success');
    
    try {
        let inventory;
        
        // Check if this is a CSV-only brand (none currently)
        if (BrandConverter.brands[brand] && BrandConverter.brands[brand].csvOnly) {
            const text = await file.text();
            const parsed = Papa.parse(text, { header: true });
            inventory = parsed.data.filter(row => row.Handle && row.Handle.trim() !== '');
            
            // ========== APPLY HANDLE REPLACEMENT FOR ASICS ==========
            if (brand === 'asics') {
                console.log(`Processing ASICS file with ${inventory.length} variants`);
                
                const replacementCount = inventory.filter(row => ASICS_HANDLE_MAPPING[row.Handle]).length;
                
                if (replacementCount > 0) {
                    console.log(`Found ${replacementCount} handles to replace in ASICS file`);
                    inventory = replaceAsicsHandles(inventory);
                }
                
                console.log(`Converting ASICS sizes to Shopify format`);
                inventory = convertAsicsSizes(inventory);
                
                BrandConverter.showStatus(brand, `Processed ${inventory.length} variants (${replacementCount} handles replaced, sizes converted to Shopify format)`, 'success');
            }
            
            BrandConverter.brands[brand].inventory = inventory;
            
            // Regenerate CSV with potentially replaced handles
            const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                           '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                           '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                           '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
            
            const csvRows = [inventoryHeaders.join(',')];
            
            inventory.forEach(row => {
                const csvRow = [
                    row.Handle,
                    `"${(row.Title || '').replace(/"/g, '""')}"`,
                    row['Option1 Name'],
                    row['Option1 Value'],
                    row['Option2 Name'] || '',
                    row['Option2 Value'] || '',
                    row['Option3 Name'] || '',
                    row['Option3 Value'] || '',
                    row.SKU,
                    row.Barcode || '',
                    row['HS Code'] || '',
                    row.COO || '',
                    row.Location || '',
                    row['Bin name'] || '',
                    '', '', '', '', '', '',
                    row['On hand (new)']
                ];
                csvRows.push(csvRow.join(','));
            });
            
            BrandConverter.brands[brand].csv = csvRows.join('\n');
        } else {
            // Use brand-specific converters
            switch(brand) {
                case 'saucony':
                    inventory = await SauconyConverter.convert(file);
                    BrandConverter.brands[brand].inventory = inventory;
                    BrandConverter.brands[brand].csv = SauconyConverter.generateInventoryCSV();
                    break;
                case 'hoka':
                    inventory = await HokaConverter.convert(file);
                    BrandConverter.brands[brand].inventory = inventory;

                    if (typeof showHokaProductCSVButton === 'function') showHokaProductCSVButton();

                    // Inventory Tracker
                    if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                        try {
                            BrandConverter.showStatus('hoka', 'Loading Shopify database...', 'success');

                            await InventoryTracker.load('hoka');
                            var comparison = InventoryTracker.compare(inventory);
                            window._hokaComparison = comparison;

                            if (comparison.removedColorways.length > 0) {
                                var removedRows = InventoryTracker.generateRemovedRows(comparison.removedColorways);
                                inventory = inventory.concat(removedRows);
                                BrandConverter.brands[brand].inventory = inventory;
                                HokaConverter.inventoryData = inventory;
                            }

                            await InventoryTracker.updateExistingColorways('hoka', inventory);

                            if (typeof showTrackerReport === 'function') {
                                showTrackerReport(comparison);
                            }

                            var statusMsg = 'Processed ' + inventory.length + ' variants';
                            if (comparison.removedColorways.length > 0) {
                                statusMsg += ' (includes ' + comparison.removedColorways.length + ' removed colorways at 0)';
                            }
                            if (comparison.newProducts.length > 0) {
                                statusMsg += ' | ' + comparison.newProducts.length + ' new products detected';
                            }
                            if (comparison.newColorways.length > 0) {
                                statusMsg += ' | ' + comparison.newColorways.length + ' new colorways detected';
                            }
                            BrandConverter.showStatus('hoka', statusMsg, 'success');
                        } catch (trackerError) {
                            console.warn('Inventory tracker error (continuing without tracking):', trackerError);
                            BrandConverter.showStatus('hoka', 'Processed ' + inventory.length + ' variants (tracker unavailable)', 'success');
                        }
                    }

                    BrandConverter.brands[brand].csv = HokaConverter.generateInventoryCSV();
                    break;
                case 'puma':
                    inventory = await PumaConverter.convert(file);
                    BrandConverter.brands[brand].inventory = inventory;
                    BrandConverter.brands[brand].csv = PumaConverter.generateInventoryCSV();
                    break;
                case 'newbalance':
                    inventory = await NewBalanceConverter.convert(file);
                    BrandConverter.brands[brand].inventory = inventory;
                    BrandConverter.brands[brand].csv = NewBalanceConverter.generateInventoryCSV();
                    break;
            }
            BrandConverter.showStatus(brand, `Processed ${inventory.length} variants`, 'success');
        }
        
        BrandConverter.updateDownloadSection();
    } catch (error) {
        BrandConverter.showStatus(brand, 'Error: ' + error.message, 'error');
        console.error('Conversion error:', error);
    }
}

// Download unified inventory - Only selected brands (WITH TRACKING & DATE)
function downloadUnified() {
    const allInventory = [];
    let selectedBrands = [];
    
    ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks', 'on'].forEach(brand => {
        const checkbox = document.getElementById(`select-${brand}`);
        if (checkbox && checkbox.checked && BrandConverter.brands[brand].inventory.length > 0) {
            let brandInventory = [...BrandConverter.brands[brand].inventory];
            if (brand === 'asics') {
                brandInventory = replaceAsicsHandles(brandInventory);
                brandInventory = convertAsicsSizes(brandInventory);
            }
            allInventory.push(...brandInventory);
            selectedBrands.push(BrandConverter.getBrandDisplayName(brand));
        }
    });
    
    if (allInventory.length === 0) {
        alert('Please select at least one brand to download!');
        return;
    }
    
    const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                   '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                   '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                   '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
    
    const csvRows = [inventoryHeaders.join(',')];
    
    allInventory.forEach(row => {
        const csvRow = [
            row.Handle,
            `"${(row.Title || '').replace(/"/g, '""')}"`,
            row['Option1 Name'],
            row['Option1 Value'],
            row['Option2 Name'] || '',
            row['Option2 Value'] || '',
            row['Option3 Name'] || '',
            row['Option3 Value'] || '',
            row.SKU,
            row.Barcode || '',
            '', '',
            row.Location,
            '', '', '', '', '', '',
            row['On hand (new)']
        ];
        csvRows.push(csvRow.join(','));
    });
    
    const csvData = csvRows.join('\n');
    
    const date = getFormattedDate();
    const filename = `combined-inventory-${date}.csv`;
    
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    if (document.getElementById('tracking-actions')) {
        document.getElementById('tracking-actions').style.display = 'block';
    }
}

// Download unified reset inventory - All quantities set to 0
function downloadUnifiedReset() {
    const allInventory = [];
    let selectedBrands = [];
    
    ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks', 'on'].forEach(brand => {
        const checkbox = document.getElementById(`select-${brand}`);
        if (checkbox && checkbox.checked && BrandConverter.brands[brand].inventory.length > 0) {
            let brandInventory = [...BrandConverter.brands[brand].inventory];
            if (brand === 'asics') {
                brandInventory = replaceAsicsHandles(brandInventory);
                brandInventory = convertAsicsSizes(brandInventory);
            }
            allInventory.push(...brandInventory);
            selectedBrands.push(BrandConverter.getBrandDisplayName(brand));
        }
    });
    
    if (allInventory.length === 0) {
        alert('Please select at least one brand to download!');
        return;
    }
    
    const resetInventory = allInventory.map(row => ({
        ...row,
        'On hand (new)': '0'
    }));
    
    const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                   '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                   '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                   '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
    
    const csvRows = [inventoryHeaders.join(',')];
    
    resetInventory.forEach(row => {
        const csvRow = [
            row.Handle,
            `"${(row.Title || '').replace(/"/g, '""')}"`,
            row['Option1 Name'],
            row['Option1 Value'],
            row['Option2 Name'] || '',
            row['Option2 Value'] || '',
            row['Option3 Name'] || '',
            row['Option3 Value'] || '',
            row.SKU,
            row.Barcode || '',
            '', '',
            row.Location,
            '', '', '', '', '', '',
            '0'
        ];
        csvRows.push(csvRow.join(','));
    });
    
    const csvData = csvRows.join('\n');
    
    const date = getFormattedDate();
    const filename = `combined-reset-${date}.csv`;
    
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    BrandConverter.init();
});
