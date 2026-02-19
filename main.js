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
    // Example:
    // 'asics-gel-nimbus-25-mens-black-white': 'asics-gel-nimbus-25-black-white',
};

// ========== ASICS SIZE CONVERSION MAPPING ==========
// Convert ASICS numeric sizes to Shopify unisex format
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
    // Add more handles here if other ASICS products need size conversion
];

// Function to replace handles in ASICS data
function replaceAsicsHandles(inventory) {
    return inventory.map(row => {
        const originalHandle = row.Handle;
        
        // Check if this handle needs to be replaced
        if (ASICS_HANDLE_MAPPING[originalHandle]) {
            const newHandle = ASICS_HANDLE_MAPPING[originalHandle];
            console.log(`Replacing ASICS handle: "${originalHandle}" → "${newHandle}"`);
            return {
                ...row,
                Handle: newHandle
            };
        }
        
        return row;
    });
}

// Function to convert ASICS sizes to Shopify unisex format (only for specific handles)
function convertAsicsSizes(inventory) {
    return inventory.map(row => {
        const originalSize = row['Option1 Value'];
        
        // Only convert sizes for handles that need it
        if (ASICS_HANDLES_NEEDING_SIZE_CONVERSION.includes(row.Handle) && ASICS_SIZE_MAPPING[originalSize]) {
            const newSize = ASICS_SIZE_MAPPING[originalSize];
            console.log(`Converting ASICS size for ${row.Handle}: "${originalSize}" → "${newSize}"`);
            return {
                ...row,
                'Option1 Value': newSize
            };
        }
        
        return row;
    });
}
// ========== END ASICS HANDLE MAPPING ==========

const BrandConverter = {
    brands: {
        saucony: { file: null, inventory: [], csv: '' },
        hoka: { file: null, inventory: [], csv: '', scanned: false },
        puma: { file: null, inventory: [], csv: '' },
        newbalance: { file: null, inventory: [], csv: '' },
        asics: { file: null, inventory: [], csv: '', csvOnly: true },
        brooks: { file: null, inventory: [], csv: '', csvOnly: true },
        on: { menFile: null, womenFile: null, inventory: [], csv: '', csvOnly: true }
    },
    
    init() {
        // Setup drag and drop for all brands
        ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks'].forEach(brand => {
            this.setupBrandDropzone(brand);
        });
        
        // Setup ON Running's two drop zones
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
        
        menDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            menDropZone.classList.add('dragover');
        });
        
        menDropZone.addEventListener('dragleave', () => {
            menDropZone.classList.remove('dragover');
        });
        
        menDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            menDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleOnFile('men', e.dataTransfer.files[0]);
            }
        });
        
        menFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleOnFile('men', e.target.files[0]);
            }
        });
        
        // Setup Women's dropzone
        const womenDropZone = document.getElementById('on-women-dropzone');
        const womenFileInput = document.getElementById('on-women-file');
        
        womenDropZone.addEventListener('click', () => womenFileInput.click());
        
        womenDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            womenDropZone.classList.add('dragover');
        });
        
        womenDropZone.addEventListener('dragleave', () => {
            womenDropZone.classList.remove('dragover');
        });
        
        womenDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            womenDropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                this.handleOnFile('women', e.dataTransfer.files[0]);
            }
        });
        
        womenFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleOnFile('women', e.target.files[0]);
            }
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
        
        // Show convert button only if both files are uploaded
        if (this.brands.on.menFile && this.brands.on.womenFile) {
            document.getElementById('on-convert').style.display = 'block';
        }
        
        this.hideStatus('on');
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

            // Load known models from Firestore before scanning
            var loadModels = Promise.resolve();
            if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                loadModels = InventoryTracker.load('hoka').then(function(data) {
                    // Feed known models into HokaConverter so picker uses them as defaults
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
        const unifiedSection = document.getElementById('unified-section');
        const unifiedInfo = document.getElementById('unified-info');
        
        individualDownloads.innerHTML = '';
        
        let hasAnyInventory = false;
        let totalVariants = 0;
        
        ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks', 'on'].forEach(brand => {
            if (this.brands[brand].inventory.length > 0) {
                hasAnyInventory = true;
                totalVariants += this.brands[brand].inventory.length;
                
                // Create container for checkbox and buttons in a row
                const container = document.createElement('div');
                container.className = 'brand-download-row';
                
                // Add checkbox for unified selection
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `select-${brand}`;
                checkbox.className = 'brand-checkbox';
                checkbox.checked = true;
                checkbox.style.width = '20px';
                checkbox.style.height = '20px';
                checkbox.style.cursor = 'pointer';
                checkbox.onchange = () => this.updateUnifiedInfo();
                
                // Create download button
                const btn = document.createElement('button');
                btn.className = `download-btn ${brand}`;
                btn.innerHTML = `${this.getBrandDisplayName(brand)} <span style="color: #6c757d; font-weight: 400;">(${this.brands[brand].inventory.length} variants)</span>`;
                btn.onclick = () => this.downloadBrandInventory(brand);
                
                // Create reset download button
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
        
        // Get inventory and set all quantities to 0
        const resetInventory = this.brands[brand].inventory.map(row => ({
            ...row,
            'On hand (new)': '0'
        }));
        
        // Generate CSV with 0 quantities
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
                '0'  // All quantities set to 0
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
        
        document.getElementById('on-men-file').value = '';
        document.getElementById('on-women-file').value = '';
        document.getElementById('on-men-uploaded').style.display = 'none';
        document.getElementById('on-women-uploaded').style.display = 'none';
        document.getElementById('on-men-dropzone').style.display = 'flex';
        document.getElementById('on-women-dropzone').style.display = 'flex';
        document.getElementById('on-convert').style.display = 'none';
        BrandConverter.hideStatus('on');
    } else {
        BrandConverter.brands[brand].file = null;
        BrandConverter.brands[brand].inventory = [];
        BrandConverter.brands[brand].csv = '';
        
        document.getElementById(`${brand}-file`).value = '';
        document.getElementById(`${brand}-uploaded`).style.display = 'none';
        document.getElementById(`${brand}-convert`).style.display = 'none';
        document.getElementById(`${brand}-dropzone`).style.display = 'flex';
        BrandConverter.hideStatus(brand);

        // HOKA: also hide the product picker and product CSV button
        if (brand === 'hoka') {
            document.getElementById('hoka-product-picker').style.display = 'none';
            BrandConverter.brands.hoka.scanned = false;
            if (typeof hideHokaProductCSVButton === 'function') hideHokaProductCSVButton();
        }
    }
    
    BrandConverter.updateDownloadSection();
}

// Convert brand function
async function convertBrand(brand) {
    const file = BrandConverter.brands[brand].file;
    
    // Special handling for ON Running
    if (brand === 'on') {
        if (!BrandConverter.brands.on.menFile || !BrandConverter.brands.on.womenFile) {
            BrandConverter.showStatus('on', 'Please upload both men\'s and women\'s files!', 'error');
            return;
        }
        
        BrandConverter.showStatus('on', 'Processing both files...', 'success');
        
        try {
            const menText = await BrandConverter.brands.on.menFile.text();
            const womenText = await BrandConverter.brands.on.womenFile.text();
            
            const menParsed = Papa.parse(menText, { header: true });
            const womenParsed = Papa.parse(womenText, { header: true });
            
            const menData = menParsed.data.filter(row => row.Handle && row.Handle.trim() !== '');
            const womenData = womenParsed.data.filter(row => row.Handle && row.Handle.trim() !== '');
            
            const combinedInventory = [...menData, ...womenData];
            
            BrandConverter.brands.on.inventory = combinedInventory;
            
            // Generate combined CSV
            const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                           '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                           '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                           '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
            
            const csvRows = [inventoryHeaders.join(',')];
            
            combinedInventory.forEach(row => {
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
            
            BrandConverter.brands.on.csv = csvRows.join('\n');
            
            BrandConverter.showStatus('on', `Processed ${combinedInventory.length} total variants (${menData.length} men's + ${womenData.length} women's)`, 'success');
            BrandConverter.updateDownloadSection();
        } catch (error) {
            BrandConverter.showStatus('on', 'Error: ' + error.message, 'error');
            console.error('Conversion error:', error);
        }
        return;
    }
    
    // Regular single-file handling for other brands
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
    
    BrandConverter.showStatus(brand, 'Processing...', 'success');
    
    try {
        let inventory;
        
        // Check if this is a CSV-only brand (ASICS, Brooks)
        if (BrandConverter.brands[brand].csvOnly) {
            // Parse the already-formatted CSV file
            const text = await file.text();
            const parsed = Papa.parse(text, { header: true });
            inventory = parsed.data.filter(row => row.Handle && row.Handle.trim() !== '');
            
            // ========== APPLY HANDLE REPLACEMENT FOR ASICS ==========
            if (brand === 'asics') {
                console.log(`Processing ASICS file with ${inventory.length} variants`);
                
                // Count how many handles will be replaced
                const replacementCount = inventory.filter(row => ASICS_HANDLE_MAPPING[row.Handle]).length;
                
                if (replacementCount > 0) {
                    console.log(`Found ${replacementCount} handles to replace in ASICS file`);
                    inventory = replaceAsicsHandles(inventory);
                }
                
                // Convert ASICS sizes to Shopify unisex format
                console.log(`Converting ASICS sizes to Shopify format`);
                inventory = convertAsicsSizes(inventory);
                
                const sizeConversionCount = inventory.filter(row => 
                    ASICS_SIZE_MAPPING[row['Option1 Value']]
                ).length;
                
                BrandConverter.showStatus(brand, `Processed ${inventory.length} variants (${replacementCount} handles replaced, sizes converted to Shopify format)`, 'success');
            }
            // ========== END HANDLE REPLACEMENT ==========
            
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
            // Use brand-specific converters for brands that need conversion
            switch(brand) {
                case 'saucony':
                    inventory = await SauconyConverter.convert(file);
                    BrandConverter.brands[brand].inventory = inventory;
                    BrandConverter.brands[brand].csv = SauconyConverter.generateInventoryCSV();
                    break;
                case 'hoka':
                    inventory = await HokaConverter.convert(file);
                    BrandConverter.brands[brand].inventory = inventory;

                    // Show the product CSV download button
                    if (typeof showHokaProductCSVButton === 'function') showHokaProductCSVButton();

                    // Inventory Tracker: load DB, compare, append removed colorways
                    if (typeof InventoryTracker !== 'undefined' && typeof db !== 'undefined') {
                        try {
                            BrandConverter.showStatus('hoka', 'Loading Shopify database...', 'success');

                            // Load what's known to be on Shopify
                            await InventoryTracker.load('hoka');

                            // Compare current ATS against Firestore
                            var comparison = InventoryTracker.compare(inventory);

                            // Store comparison for the report UI
                            window._hokaComparison = comparison;

                            // Append removed colorways at 0 quantity
                            if (comparison.removedColorways.length > 0) {
                                var removedRows = InventoryTracker.generateRemovedRows(comparison.removedColorways);
                                inventory = inventory.concat(removedRows);
                                BrandConverter.brands[brand].inventory = inventory;
                                HokaConverter.inventoryData = inventory;
                            }

                            // Update existing colorways with latest quantities
                            await InventoryTracker.updateExistingColorways('hoka', inventory);

                            // Show tracker report in UI
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
            // Apply handle replacement for ASICS if needed (safety check)
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
    
    // Create current snapshot (if tracking is available)
    if (typeof InventoryTracker !== 'undefined') {
        InventoryTracker.createCurrentSnapshot(BrandConverter.brands);
        
        // Add discontinued products with 0 quantity if we have a previous snapshot
        const discontinuedRows = InventoryTracker.generateDiscontinuedInventoryRows();
        if (discontinuedRows.length > 0) {
            console.log(`Adding ${discontinuedRows.length} discontinued products with 0 quantity`);
            allInventory.push(...discontinuedRows);
        }
    }
    
    // CRITICAL FIX: Match the exact format from individual converters with quoted headers
    const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                   '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                   '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                   '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
    
    const csvRows = [inventoryHeaders.join(',')];
    
    allInventory.forEach(row => {
        const csvRow = [
            row.Handle,
            `"${(row.Title || '').replace(/"/g, '""')}"`,  // Properly escape quotes in titles
            row['Option1 Name'],
            row['Option1 Value'],
            row['Option2 Name'] || '',
            row['Option2 Value'] || '',
            row['Option3 Name'] || '',
            row['Option3 Value'] || '',
            row.SKU,
            row.Barcode || '',
            '', '',  // HS Code and COO - empty
            row.Location,
            '', '', '', '', '', '',  // All the "not editable" and "current" fields
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
    
    // Show tracking actions if available
    if (document.getElementById('tracking-actions')) {
        document.getElementById('tracking-actions').style.display = 'block';
    }
    
    // Show comparison if we had a previous snapshot
    if (typeof showComparisonReport !== 'undefined' && typeof InventoryTracker !== 'undefined') {
        const discontinuedRows = InventoryTracker.generateDiscontinuedInventoryRows();
        if (discontinuedRows && discontinuedRows.length > 0) {
            showComparisonReport();
        }
    }
}

// Download unified reset inventory - All quantities set to 0
function downloadUnifiedReset() {
    const allInventory = [];
    let selectedBrands = [];
    
    ['saucony', 'hoka', 'puma', 'newbalance', 'asics', 'brooks', 'on'].forEach(brand => {
        const checkbox = document.getElementById(`select-${brand}`);
        if (checkbox && checkbox.checked && BrandConverter.brands[brand].inventory.length > 0) {
            // Apply handle replacement for ASICS if needed (safety check)
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
    
    // Set all quantities to 0
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
            '0'  // All quantities set to 0
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
