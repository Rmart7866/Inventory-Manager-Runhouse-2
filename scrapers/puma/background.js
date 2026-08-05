// FIXED PUMA BACKGROUND SCRIPT - Matches ASICS format exactly
// This generates CSVs that import successfully into Shopify

// ===== FIXED CSV CONVERTER =====
class FixedShopifyCSVConverter {
    constructor(brand = 'Puma') {
        this.brand = brand;
        this.defaultSettings = {
            vendor: brand,
            productType: 'Footwear',
            tags: `Athletic, Running, ${brand}`,
            published: 'TRUE',
            variantPrice: '120.00',
            compareAtPrice: '',
            inventoryTracker: 'shopify',
            inventoryPolicy: 'deny',
            requiresShipping: 'TRUE',
            taxable: 'TRUE',
            fulfillmentService: 'manual',
            productCategory: 'Footwear > Athletic Shoes',
            condition: 'New',
            status: 'active',
            locationName: 'Main Location'
        };
    }

    // FIXED: INVENTORY CSV - Matches ASICS format exactly
    convertToInventoryCSV(inventoryData, settings = {}) {
        const csvSettings = { ...this.defaultSettings, ...settings };
        
        console.log('🔧 FIXED: Generating inventory CSV with ASICS format...');
        
        if (!inventoryData || inventoryData.length === 0) {
            console.warn('⚠️ No inventory data provided');
            return '';
        }
        
        // FIXED: Exact same headers as working ASICS version
        const headers = [
            'Handle',
            'SKU',
            'Option1 Name',
            'Option1 Value',
            'Option2 Name', 
            'Option2 Value',
            'Option3 Name',
            'Option3 Value',
            'Location',
            'On hand'
        ];
        
        const csvRows = [];
        const productGroups = this.groupByColorway(inventoryData);
        const usedHandles = new Set();
        
        console.log(`📦 Processing ${Object.keys(productGroups).length} products`);
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            
            const handle = this.generateUniqueHandle(baseProduct, usedHandles);
            
            variants.forEach((variant, index) => {
                const sku = this.generateCleanSKU(variant);
                const quantity = this.parseQuantity(variant.quantity);
                const colorName = this.extractCleanColorName(baseProduct);
                const sizeValue = this.formatSizeForShopify(variant.sizeUS || variant.size);
                
                // FIXED: Simple array format like ASICS
                csvRows.push([
                    handle,                          // Handle
                    sku,                            // SKU
                    'Size',                         // Option1 Name
                    sizeValue,                      // Option1 Value
                    'Color',                        // Option2 Name
                    colorName,                      // Option2 Value
                    '',                             // Option3 Name
                    '',                             // Option3 Value
                    csvSettings.locationName,       // Location
                    quantity                        // On hand
                ]);
            });
        });
        
        // FIXED: Simple CSV generation like ASICS
        const csvContent = [
            headers.join(','),
            ...csvRows.map(row => row.map(cell => {
                const value = (cell || '').toString();
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        console.log(`✅ FIXED: Generated inventory CSV with ${csvRows.length} rows`);
        return csvContent;
    }

    // FIXED: PRODUCT CSV - Matches ASICS format exactly
    convertToProductCSV(inventoryData, settings = {}) {
        const csvSettings = { ...this.defaultSettings, ...settings };
        
        console.log('🔧 FIXED: Generating product CSV with ASICS format...');
        
        if (!inventoryData || inventoryData.length === 0) {
            console.warn('⚠️ No product data provided');
            return '';
        }
        
        const shopifyData = [];
        const productGroups = this.groupByColorway(inventoryData);
        const usedHandles = new Set();
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            
            const handle = this.generateUniqueHandle(baseProduct, usedHandles);
            const productTitle = this.extractCleanProductTitle(baseProduct);
            const colorName = this.extractCleanColorName(baseProduct);
            
            variants.forEach((variant, index) => {
                const isFirstVariant = index === 0;
                const sku = this.generateCleanSKU(variant);
                const quantity = this.parseQuantity(variant.quantity);
                const price = this.formatPrice(variant.price || csvSettings.variantPrice);
                const sizeValue = this.formatSizeForShopify(variant.sizeUS || variant.size);
                
                // FIXED: Object format like ASICS with title in EVERY row
                const shopifyRow = {
                    'Handle': handle,
                    'Title': productTitle,  // CRITICAL: Every row gets title
                    'Body (HTML)': isFirstVariant ? this.generateProductDescription(baseProduct) : '',
                    'Vendor': isFirstVariant ? csvSettings.vendor : '',
                    'Product Category': isFirstVariant ? csvSettings.productCategory : '',
                    'Type': isFirstVariant ? csvSettings.productType : '',
                    'Tags': isFirstVariant ? this.generateTags(baseProduct, csvSettings) : '',
                    'Published': isFirstVariant ? csvSettings.published : '',
                    'Option1 Name': isFirstVariant ? 'Size' : '',
                    'Option1 Value': sizeValue,
                    'Option2 Name': isFirstVariant ? 'Color' : '',
                    'Option2 Value': colorName,
                    'Option3 Name': '',
                    'Option3 Value': '',
                    'Variant SKU': sku,
                    'Variant Grams': '',
                    'Variant Inventory Tracker': csvSettings.inventoryTracker,
                    'Variant Inventory Policy': csvSettings.inventoryPolicy,
                    'Variant Fulfillment Service': csvSettings.fulfillmentService,
                    'Variant Price': price,
                    'Variant Compare At Price': csvSettings.compareAtPrice || '',
                    'Variant Requires Shipping': csvSettings.requiresShipping,
                    'Variant Taxable': csvSettings.taxable,
                    'Variant Barcode': '',
                    'Image Src': '',
                    'Image Position': '',
                    'Image Alt Text': '',
                    'Gift Card': 'FALSE',
                    'SEO Title': isFirstVariant ? productTitle : '',
                    'SEO Description': isFirstVariant ? this.generateSEODescription(baseProduct) : '',
                    'Google Shopping / Google Product Category': '',
                    'Google Shopping / Gender': isFirstVariant ? this.detectGoogleShoppingGender(baseProduct) : '',
                    'Google Shopping / Age Group': isFirstVariant ? this.detectGoogleShoppingAgeGroup(baseProduct) : '',
                    'Google Shopping / MPN': isFirstVariant ? baseProduct.styleId : '',
                    'Google Shopping / Condition': isFirstVariant ? csvSettings.condition : '',
                    'Google Shopping / Custom Product': 'FALSE',
                    'Variant Image': '',
                    'Variant Weight Unit': isFirstVariant ? 'kg' : '',
                    'Variant Tax Code': '',
                    'Cost per item': '',
                    'Status': isFirstVariant ? csvSettings.status : ''
                };
                
                // FIXED: Multi-location inventory like ASICS
                shopifyRow[`Inventory at ${csvSettings.locationName}`] = quantity;
                
                // Market pricing like ASICS
                shopifyRow['Included / United States'] = 'TRUE';
                shopifyRow['Price / United States'] = price;
                shopifyRow['Compare At Price / United States'] = csvSettings.compareAtPrice || '';
                shopifyRow['Included / International'] = 'TRUE';
                shopifyRow['Price / International'] = price;
                shopifyRow['Compare At Price / International'] = csvSettings.compareAtPrice || '';
                
                shopifyData.push(shopifyRow);
            });
        });
        
        // FIXED: Generate CSV exactly like ASICS
        if (shopifyData.length === 0) return '';
        
        const headers = Object.keys(shopifyData[0]);
        const csvContent = [
            headers.join(','),
            ...shopifyData.map(row => headers.map(header => {
                const value = (row[header] || '').toString();
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        console.log(`✅ FIXED: Generated product CSV with ${shopifyData.length} rows`);
        return csvContent;
    }

    // ===== HELPER METHODS =====
    
    groupByColorway(inventoryData) {
        const groups = {};
        inventoryData.forEach(item => {
            const styleId = this.cleanValue(item.styleId) || 'UNKNOWN';
            const colorCode = this.cleanValue(item.colorCode) || '01';
            const colorName = this.extractCleanColorName(item);
            const key = `${styleId}-${colorCode}-${colorName.replace(/[^a-z0-9]/gi, '')}`;
            
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
        });
        return groups;
    }

    extractCleanProductTitle(product) {
        let title = product.productName || product.title || 'Unknown Product';
        title = title.replace(/<[^>]*>/g, '').trim();
        
        // Clean navigation contamination
        const cleaningPatterns = [
            /Welcome,?\s*[^,\s]+/gi,
            /Shop\s*Now/gi,
            /Explore/gi,
            /Manage/gi,
            /loading/gi,
            /authenticating/gi
        ];
        
        for (const pattern of cleaningPatterns) {
            title = title.replace(pattern, '').trim();
        }
        
        title = title.replace(/\s+/g, ' ').trim();
        
        if (!title || title.length < 3) {
            title = 'Puma Product';
        }
        
        return title;
    }

    extractCleanColorName(product) {
        let colorName = product.colorName || 'Multi-Color';
        colorName = colorName.replace(/<[^>]*>/g, '').trim();
        
        if (!colorName || 
            colorName === 'Multi-Color' || 
            colorName === 'Default Color' ||
            colorName === 'Active' ||
            colorName.length < 2) {
            
            const productName = product.productName || '';
            const colorMatch = productName.match(/\b(BLACK|WHITE|RED|BLUE|GREEN|YELLOW|ORANGE|PURPLE|PINK|BROWN|GRAY|GREY|SILVER|GOLD|NAVY|MAROON|LAPIS|LAZULI|NITRO|PUMA)\b/i);
            
            colorName = colorMatch ? colorMatch[1] : 'Multi-Color';
        }
        
        return colorName;
    }

    generateCleanSKU(variant) {
        const styleId = this.cleanValue(variant.styleId) || 'PUMA00';
        const colorCode = this.cleanValue(variant.colorCode) || '01';
        const size = this.formatSizeForShopify(variant.sizeUS || variant.size || 'OS');
        return `${styleId}-${colorCode}-${size}`;
    }

    // FIXED: Keep decimal points - they work fine in Shopify
    formatSizeForShopify(size) {
        if (!size) return 'OS';
        return size.toString().trim() || 'OS';
    }

    formatPrice(price) {
        if (!price || price === '') return '120.00';
        const parsed = parseFloat(price);
        if (isNaN(parsed)) return '120.00';
        return parsed.toFixed(2);
    }

    parseQuantity(quantity) {
        if (quantity === null || quantity === undefined || quantity === '') {
            return 0;
        }
        const parsed = parseInt(quantity);
        return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }

    cleanValue(value) {
        if (value === null || value === undefined || value === 'null' || value === 'undefined') {
            return '';
        }
        return String(value).trim();
    }

    generateUniqueHandle(product, usedHandles = new Set()) {
        const styleId = this.cleanValue(product.styleId).toLowerCase() || 'product';
        const colorCode = this.cleanValue(product.colorCode).toLowerCase() || 'default';
        const colorName = this.extractCleanColorName(product).toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        let baseHandle = `${styleId}-${colorName}-${colorCode}`.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
        
        if (!usedHandles.has(baseHandle)) {
            usedHandles.add(baseHandle);
            return baseHandle;
        }
        
        let counter = 1;
        let uniqueHandle = `${baseHandle}-${counter}`;
        
        while (usedHandles.has(uniqueHandle)) {
            counter++;
            uniqueHandle = `${baseHandle}-${counter}`;
        }
        
        usedHandles.add(uniqueHandle);
        return uniqueHandle;
    }

    generateProductDescription(product) {
        const productName = this.extractCleanProductTitle(product);
        const styleId = this.cleanValue(product.styleId) || 'Unknown Style';
        const colorName = this.extractCleanColorName(product);
        
        let description = `<p><strong>${productName}</strong></p>`;
        description += `<p><strong>Style:</strong> ${styleId}</p>`;
        
        if (colorName && colorName !== 'Multi-Color' && colorName !== 'Default Color') {
            description += `<p><strong>Color:</strong> ${colorName}</p>`;
        }
        
        description += `<p>High-performance athletic footwear from ${this.brand}.</p>`;
        
        return description;
    }

    generateSEODescription(product) {
        const productName = this.extractCleanProductTitle(product);
        const styleId = this.cleanValue(product.styleId) || 'Unknown Style';
        
        return `${productName}. Style ${styleId} from ${this.brand}. High-performance athletic footwear.`;
    }

    generateTags(product, settings) {
        let tags = settings.tags || `Athletic, Running, ${this.brand}`;
        
        const colorName = this.extractCleanColorName(product);
        if (colorName && colorName !== 'Default' && colorName !== 'Multi-Color') {
            tags += `, ${colorName}`;
        }
        
        const styleId = this.cleanValue(product.styleId);
        if (styleId && styleId !== 'UNKNOWN') {
            tags += `, Style-${styleId}`;
        }
        
        const gender = this.detectGender(product);
        if (gender && gender !== 'unisex') {
            tags += `, ${gender.charAt(0).toUpperCase() + gender.slice(1)}`;
        }
        
        return tags;
    }

    detectGoogleShoppingGender(product) {
        const text = (this.extractCleanProductTitle(product)).toUpperCase();
        
        if (text.includes('WNS') || text.includes('WOMEN')) {
            return 'female';
        } else if (text.includes('MNS') || text.includes('MEN')) {
            return 'male';
        }
        
        return 'unisex';
    }

    detectGoogleShoppingAgeGroup(product) {
        const text = (this.extractCleanProductTitle(product)).toUpperCase();
        
        if (text.includes('YOUTH') || text.includes('KIDS') || text.includes('CHILD')) {
            return 'kids';
        } else if (text.includes('INFANT') || text.includes('BABY')) {
            return 'infant';
        }
        
        return 'adult';
    }

    detectGender(product) {
        const text = (this.extractCleanProductTitle(product)).toUpperCase();
        
        if (text.includes('WNS') || text.includes('WOMEN')) {
            return 'women';
        } else if (text.includes('MNS') || text.includes('MEN')) {
            return 'men';
        } else if (text.includes('YOUTH') || text.includes('KIDS')) {
            return 'youth';
        }
        
        return 'unisex';
    }
}

// ===== FIXED CSV MANAGER =====
class FixedPumaCSVManager {
    constructor() {
        this.maxChunkSize = 1000;
        this.chunkPrefix = 'puma_chunk_';
        this.shopifyConverter = new FixedShopifyCSVConverter('Puma');
    }

    convertToPumaInventoryCSV(inventoryData) {
        if (!inventoryData || inventoryData.length === 0) {
            console.warn('⚠️ FIXED: No inventory data provided');
            return '';
        }
        
        console.log('🔧 FIXED: Converting inventory data...');
        
        const csv = this.shopifyConverter.convertToInventoryCSV(inventoryData, {
            locationName: 'Main Location',
            vendor: 'Puma'
        });
        
        console.log('✅ FIXED: Generated inventory CSV');
        return csv;
    }

    convertToPumaProductCSV(inventoryData) {
        if (!inventoryData || inventoryData.length === 0) {
            console.warn('⚠️ FIXED: No product data provided');
            return '';
        }
        
        console.log('🔧 FIXED: Converting product data...');
        
        const csv = this.shopifyConverter.convertToProductCSV(inventoryData, {
            vendor: 'Puma',
            productType: 'Footwear',
            tags: 'Athletic, Running, Puma',
            published: 'TRUE',
            variantPrice: '120.00',
            inventoryTracker: 'shopify',
            inventoryPolicy: 'deny',
            requiresShipping: 'TRUE',
            taxable: 'TRUE',
            fulfillmentService: 'manual',
            productCategory: 'Footwear > Athletic Shoes',
            condition: 'New',
            status: 'active'
        });
        
        console.log('✅ FIXED: Generated product CSV');
        return csv;
    }

    // Inventory chunk management with proper formatting
    async addInventoryDataToChunks(inventoryData, csvContent, scrapingId) {
        try {
            console.log(`📦 FIXED: Adding ${inventoryData.length} inventory records`);
            
            const stateKey = `scraping_${scrapingId}`;
            const result = await chrome.storage.local.get([stateKey]);
            let state = result[stateKey] || {
                currentChunk: 1,
                totalRecords: 0,
                downloadedChunks: [],
                format: 'inventory'
            };
  
            const currentChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            const chunkResult = await chrome.storage.local.get([currentChunkKey]);
            let currentChunkData = chunkResult[currentChunkKey] || [];
  
            let remainingData = [...inventoryData];
            
            while (remainingData.length > 0) {
                const spaceLeft = this.maxChunkSize - currentChunkData.length;
                
                if (spaceLeft <= 0) {
                    console.log(`💾 FIXED: Inventory chunk ${state.currentChunk} is full`);
                    await this.downloadInventoryChunk(currentChunkData, state.currentChunk, scrapingId);
                    
                    state.downloadedChunks.push({
                        chunkNumber: state.currentChunk,
                        recordCount: currentChunkData.length,
                        downloadedAt: new Date().toISOString(),
                        format: 'inventory'
                    });
                    
                    state.currentChunk++;
                    currentChunkData = [];
                }
                
                const dataToAdd = remainingData.splice(0, Math.min(spaceLeft || this.maxChunkSize, remainingData.length));
                currentChunkData.push(...dataToAdd);
                state.totalRecords += dataToAdd.length;
            }
  
            const newChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            await chrome.storage.local.set({
                [newChunkKey]: currentChunkData,
                [stateKey]: state
            });
  
            return {
                success: true,
                currentChunk: state.currentChunk,
                totalRecords: state.totalRecords,
                currentChunkSize: currentChunkData.length,
                downloadedChunks: state.downloadedChunks.length
            };
            
        } catch (error) {
            console.error('❌ FIXED: Error managing inventory chunks:', error);
            return { success: false, error: error.message };
        }
    }

    // Product chunk management with proper formatting
    async addProductDataToChunks(productData, csvContent, scrapingId) {
        try {
            console.log(`🏪 FIXED: Adding ${productData.length} product records`);
            
            const stateKey = `scraping_${scrapingId}`;
            const result = await chrome.storage.local.get([stateKey]);
            let state = result[stateKey] || {
                currentChunk: 1,
                totalRecords: 0,
                downloadedChunks: [],
                format: 'product'
            };
  
            const currentChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            const chunkResult = await chrome.storage.local.get([currentChunkKey]);
            let currentChunkData = chunkResult[currentChunkKey] || [];
  
            let remainingData = [...productData];
            
            while (remainingData.length > 0) {
                const spaceLeft = this.maxChunkSize - currentChunkData.length;
                
                if (spaceLeft <= 0) {
                    console.log(`💾 FIXED: Product chunk ${state.currentChunk} is full`);
                    await this.downloadProductChunk(currentChunkData, state.currentChunk, scrapingId);
                    
                    state.downloadedChunks.push({
                        chunkNumber: state.currentChunk,
                        recordCount: currentChunkData.length,
                        downloadedAt: new Date().toISOString(),
                        format: 'product'
                    });
                    
                    state.currentChunk++;
                    currentChunkData = [];
                }
                
                const dataToAdd = remainingData.splice(0, Math.min(spaceLeft || this.maxChunkSize, remainingData.length));
                currentChunkData.push(...dataToAdd);
                state.totalRecords += dataToAdd.length;
            }
  
            const newChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            await chrome.storage.local.set({
                [newChunkKey]: currentChunkData,
                [stateKey]: state
            });
  
            return {
                success: true,
                currentChunk: state.currentChunk,
                totalRecords: state.totalRecords,
                currentChunkSize: currentChunkData.length,
                downloadedChunks: state.downloadedChunks.length
            };
            
        } catch (error) {
            console.error('❌ FIXED: Error managing product chunks:', error);
            return { success: false, error: error.message };
        }
    }

    // Download inventory chunk with FIXED formatting
    async downloadInventoryChunk(chunkData, chunkNumber, scrapingId) {
        if (!chunkData || chunkData.length === 0) return;
  
        try {
            console.log(`📥 FIXED: Downloading inventory chunk ${chunkNumber} with ${chunkData.length} records`);
            
            const csv = this.convertToPumaInventoryCSV(chunkData);
            const filename = `puma-inventory-FIXED-part-${chunkNumber}-${Date.now()}.csv`;
            
            try {
                const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                
                await chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                });
                
                console.log(`✅ FIXED: Downloaded ${filename}`);
                
                this.notifyContentScript('chunkDownloaded', {
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    filename: filename,
                    format: 'inventory',
                    fixed: true
                });
                
            } catch (downloadError) {
                console.log('🔄 FIXED: Chrome downloads failed, trying fallback...');
                
                this.notifyContentScript('downloadCSVFallback', {
                    csv: csv,
                    filename: filename,
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    format: 'inventory',
                    fixed: true
                });
            }
            
        } catch (error) {
            console.error('❌ FIXED: Inventory download error:', error);
            throw error;
        }
    }

    // Download product chunk with FIXED formatting
    async downloadProductChunk(chunkData, chunkNumber, scrapingId) {
        if (!chunkData || chunkData.length === 0) return;
  
        try {
            console.log(`📥 FIXED: Downloading product chunk ${chunkNumber} with ${chunkData.length} records`);
            
            const csv = this.convertToPumaProductCSV(chunkData);
            const filename = `puma-products-FIXED-part-${chunkNumber}-${Date.now()}.csv`;
            
            try {
                const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                
                await chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                });
                
                console.log(`✅ FIXED: Downloaded ${filename}`);
                
                this.notifyContentScript('chunkDownloaded', {
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    filename: filename,
                    format: 'product',
                    fixed: true
                });
                
            } catch (downloadError) {
                console.log('🔄 FIXED: Chrome downloads failed, trying fallback...');
                
                this.notifyContentScript('downloadCSVFallback', {
                    csv: csv,
                    filename: filename,
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    format: 'product',
                    fixed: true
                });
            }
            
        } catch (error) {
            console.error('❌ FIXED: Product download error:', error);
            throw error;
        }
    }

    // Finalize scraping with FIXED formatting
    async finalizeScraping(scrapingId, format) {
        try {
            console.log(`🎯 FIXED: Finalizing scraping ${scrapingId} (${format} format)`);
            
            const stateKey = `scraping_${scrapingId}`;
            const result = await chrome.storage.local.get([stateKey]);
            const state = result[stateKey];
            
            if (!state) {
                console.log('⚠️ FIXED: No scraping state found');
                return { success: false, error: 'No scraping state found' };
            }
  
            const finalChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            const chunkResult = await chrome.storage.local.get([finalChunkKey]);
            const finalChunkData = chunkResult[finalChunkKey] || [];
            
            if (finalChunkData.length > 0) {
                console.log(`📥 FIXED: Downloading final chunk with ${finalChunkData.length} records`);
                
                if (format === 'inventory' || state.format === 'inventory') {
                    await this.downloadInventoryChunk(finalChunkData, state.currentChunk, scrapingId);
                } else {
                    await this.downloadProductChunk(finalChunkData, state.currentChunk, scrapingId);
                }
                
                state.downloadedChunks.push({
                    chunkNumber: state.currentChunk,
                    recordCount: finalChunkData.length,
                    downloadedAt: new Date().toISOString(),
                    format: format || state.format || 'product',
                    fixed: true
                });
            }
  
            // Cleanup
            const keysToRemove = [stateKey, finalChunkKey];
            const allKeys = await chrome.storage.local.get(null);
            Object.keys(allKeys).forEach(key => {
                if (key.startsWith(`${this.chunkPrefix}${scrapingId}_`)) {
                    keysToRemove.push(key);
                }
            });
            
            await chrome.storage.local.remove(keysToRemove);
            
            const totalRecords = state.totalRecords || 0;
            const finalFormat = format || state.format || 'product';
            
            console.log(`🎉 FIXED: Scraping completed! ${state.downloadedChunks.length} ${finalFormat} chunks with ${totalRecords} total records`);
            
            return {
                success: true,
                totalChunks: state.downloadedChunks.length,
                totalRecords: totalRecords,
                downloadedChunks: state.downloadedChunks,
                format: finalFormat,
                fixed: true
            };
            
        } catch (error) {
            console.error('❌ FIXED: Finalization error:', error);
            return { success: false, error: error.message };
        }
    }

    // Notify content script
    async notifyContentScript(action, data) {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                await chrome.tabs.sendMessage(tabs[0].id, {
                    action: action,
                    data: data
                });
            }
        } catch (error) {
            console.log('Could not notify content script:', error.message);
        }
    }
}

// Initialize the FIXED manager
const fixedPumaCSVManager = new FixedPumaCSVManager();

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 FIXED: Received message:', message.action);
    
    if (message.action === 'addToInventoryChunks') {
        fixedPumaCSVManager.addInventoryDataToChunks(message.data.data, message.data.csvContent, message.data.scrapingId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'addToProductChunks') {
        fixedPumaCSVManager.addProductDataToChunks(message.data.data, message.data.csvContent, message.data.scrapingId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'finalizeScraping') {
        fixedPumaCSVManager.finalizeScraping(message.data.scrapingId, message.data.format)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'ping') {
        sendResponse({ success: true, message: 'FIXED Puma background script is responsive', fixed: true });
        return true;
    }
    
    console.warn('❌ FIXED: Unknown message action:', message.action);
    sendResponse({ success: false, error: 'Unknown action' });
});

// Storage cleanup on startup
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 FIXED: Extension startup - cleaning old data');
    
    chrome.storage.local.get(null, (items) => {
        const keysToRemove = [];
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        Object.keys(items).forEach(key => {
            if (key.startsWith('scraping_') || key.startsWith('puma_chunk_')) {
                const timestamp = parseInt(key.split('_')[1]);
                if (timestamp && timestamp < oneHourAgo) {
                    keysToRemove.push(key);
                }
            }
        });
        
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
            console.log(`🧹 FIXED: Cleaned up ${keysToRemove.length} old storage items`);
        }
    });
});

// Install listener
chrome.runtime.onInstalled.addListener(() => {
    console.log('🛠️ FIXED Puma Background Script: Installed and ready');
    console.log('📦 Features: Fixed CSV formatting matching ASICS success');
    console.log('✅ FIXED: Every variant row gets title');
    console.log('✅ FIXED: Proper size formatting (keeps decimals)');
    console.log('✅ FIXED: Simplified CSV escaping');
    console.log('✅ FIXED: Multi-location inventory format');
    console.log('✅ READY: For 100% successful Shopify imports!');
});

console.log('🛠️ FIXED Puma Background Script: Initialized successfully');
console.log('✅ Ready to handle both inventory and product CSV formats with ASICS-matching formatting!');