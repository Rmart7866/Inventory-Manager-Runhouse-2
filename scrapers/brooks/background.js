// COMPLETE UNIFIED BROOKS Background Script - SEO-Optimized Handle Logic
// Creates SEO-friendly handles using product name + color + width + SKU prefix for uniqueness
// SKU prefix prevents duplicates when same colorway exists across different size ranges (men's/women's)
// Matches HTML converter for consistent handle generation

class UnifiedBrooksCSVManager {
    constructor() {
        this.maxChunkSize = 10000;
        this.chunkPrefix = 'brooks_chunk_';
    }
  
    // INVENTORY CSV CHUNKING
    async addInventoryDataToChunks(inventoryData, csvContent, scrapingId) {
        try {
            console.log(`📦 Brooks Background: Adding ${inventoryData.length} inventory records to chunks for scraping ${scrapingId}`);
            
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
                    console.log(`💾 Brooks Background: Inventory chunk ${state.currentChunk} is full (${currentChunkData.length} records) - downloading now`);
                    await this.downloadInventoryChunk(currentChunkData, state.currentChunk, scrapingId);
                    
                    state.downloadedChunks.push({
                        chunkNumber: state.currentChunk,
                        recordCount: currentChunkData.length,
                        downloadedAt: new Date().toISOString(),
                        format: 'inventory'
                    });
                    
                    state.currentChunk++;
                    currentChunkData = [];
                    await chrome.storage.local.remove([currentChunkKey]);
                }
                
                const dataToAdd = remainingData.splice(0, Math.min(spaceLeft || this.maxChunkSize, remainingData.length));
                currentChunkData.push(...dataToAdd);
                state.totalRecords += dataToAdd.length;
            }
  
            const newChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            
            try {
                await chrome.storage.local.set({
                    [newChunkKey]: currentChunkData,
                    [stateKey]: state
                });
            } catch (storageError) {
                // If quota exceeded, clean up old data and retry
                if (storageError.message.includes('quota') || storageError.message.includes('QUOTA')) {
                    console.log('⚠️ Brooks Background: Storage quota exceeded - cleaning up old data...');
                    await this.emergencyCleanup();
                    
                    // Retry storage
                    await chrome.storage.local.set({
                        [newChunkKey]: currentChunkData,
                        [stateKey]: state
                    });
                    console.log('✅ Brooks Background: Successfully saved after cleanup');
                } else {
                    throw storageError;
                }
            }
  
            return {
                success: true,
                currentChunk: state.currentChunk,
                totalRecords: state.totalRecords,
                currentChunkSize: currentChunkData.length,
                downloadedChunks: state.downloadedChunks.length
            };
            
        } catch (error) {
            console.error('❌ Brooks Background: Error managing inventory chunks:', error);
            return { success: false, error: error.message };
        }
    }
  
    // PRODUCT CSV CHUNKING
    async addProductDataToChunks(productData, csvContent, scrapingId) {
        try {
            console.log(`🛍 Brooks Background: Adding ${productData.length} product records to chunks for scraping ${scrapingId}`);
            
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
                    console.log(`💾 Brooks Background: Product chunk ${state.currentChunk} is full - downloading now`);
                    await this.downloadProductChunk(currentChunkData, state.currentChunk, scrapingId);
                    
                    state.downloadedChunks.push({
                        chunkNumber: state.currentChunk,
                        recordCount: currentChunkData.length,
                        downloadedAt: new Date().toISOString(),
                        format: 'product'
                    });
                    
                    state.currentChunk++;
                    currentChunkData = [];
                    await chrome.storage.local.remove([currentChunkKey]);
                }
                
                const dataToAdd = remainingData.splice(0, Math.min(spaceLeft || this.maxChunkSize, remainingData.length));
                currentChunkData.push(...dataToAdd);
                state.totalRecords += dataToAdd.length;
            }
  
            const newChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            
            try {
                await chrome.storage.local.set({
                    [newChunkKey]: currentChunkData,
                    [stateKey]: state
                });
            } catch (storageError) {
                // If quota exceeded, clean up old data and retry
                if (storageError.message.includes('quota') || storageError.message.includes('QUOTA')) {
                    console.log('⚠️ Brooks Background: Storage quota exceeded - cleaning up old data...');
                    await this.emergencyCleanup();
                    
                    // Retry storage
                    await chrome.storage.local.set({
                        [newChunkKey]: currentChunkData,
                        [stateKey]: state
                    });
                    console.log('✅ Brooks Background: Successfully saved after cleanup');
                } else {
                    throw storageError;
                }
            }
  
            return {
                success: true,
                currentChunk: state.currentChunk,
                totalRecords: state.totalRecords,
                currentChunkSize: currentChunkData.length,
                downloadedChunks: state.downloadedChunks.length
            };
            
        } catch (error) {
            console.error('❌ Brooks Background: Error managing product chunks:', error);
            return { success: false, error: error.message };
        }
    }
  
    // DOWNLOAD INVENTORY CHUNK
    async downloadInventoryChunk(chunkData, chunkNumber, scrapingId) {
        if (!chunkData || chunkData.length === 0) {
            console.log('⚠️ Brooks Background: No inventory data to download in chunk');
            return;
        }
  
        try {
            console.log(`📥 Brooks Background: Downloading inventory chunk ${chunkNumber} with ${chunkData.length} records`);
            
            const csv = this.convertToBrooksInventoryCSV(chunkData);
            const filename = `brooks-iventory-${chunkNumber}-${Date.now()}.csv`;
            
            try {
                const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                
                await chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                });
                
                console.log(`✅ Brooks Background: Downloaded ${filename}`);
                
                this.notifyContentScript('chunkDownloaded', {
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    filename: filename,
                    format: 'inventory'
                });
                
            } catch (downloadError) {
                console.log('🔄 Brooks Background: Chrome downloads failed, trying fallback...');
                
                this.notifyContentScript('downloadCSVFallback', {
                    csv: csv,
                    filename: filename,
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    format: 'inventory'
                });
            }
            
        } catch (error) {
            console.error('❌ Brooks Background: Inventory download error:', error);
            throw error;
        }
    }
  
    // DOWNLOAD PRODUCT CHUNK
    async downloadProductChunk(chunkData, chunkNumber, scrapingId) {
        if (!chunkData || chunkData.length === 0) return;
  
        try {
            console.log(`📥 Brooks Background: Downloading product chunk ${chunkNumber} with ${chunkData.length} records`);
            
            const csv = this.convertToBrooksProductCSV(chunkData);
            const filename = `brooks-products-part-${chunkNumber}-${Date.now()}.csv`;
            
            try {
                const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                
                await chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                });
                
                console.log(`✅ Brooks Background: Downloaded ${filename}`);
                
                this.notifyContentScript('chunkDownloaded', {
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    filename: filename,
                    format: 'product'
                });
                
            } catch (downloadError) {
                console.log('🔄 Brooks Background: Chrome downloads failed, trying fallback...');
                
                this.notifyContentScript('downloadCSVFallback', {
                    csv: csv,
                    filename: filename,
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    format: 'product'
                });
            }
            
        } catch (error) {
            console.error('❌ Brooks Background: Product download error:', error);
            throw error;
        }
    }
  
    // FINALIZE SCRAPING
    async finalizeScraping(scrapingId, format) {
        try {
            console.log(`🎯 Brooks Background: Finalizing scraping ${scrapingId} (${format} format)`);
            
            const stateKey = `scraping_${scrapingId}`;
            const result = await chrome.storage.local.get([stateKey]);
            const state = result[stateKey];
            
            if (!state) {
                console.log('⚠️ Brooks Background: No scraping state found');
                return { success: false, error: 'No scraping state found' };
            }
  
            const finalChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            const chunkResult = await chrome.storage.local.get([finalChunkKey]);
            const finalChunkData = chunkResult[finalChunkKey] || [];
            
            if (finalChunkData.length > 0) {
                console.log(`📥 Brooks Background: Downloading final chunk ${state.currentChunk} with ${finalChunkData.length} records`);
                
                if (format === 'inventory' || state.format === 'inventory') {
                    await this.downloadInventoryChunk(finalChunkData, state.currentChunk, scrapingId);
                } else {
                    await this.downloadProductChunk(finalChunkData, state.currentChunk, scrapingId);
                }
                
                state.downloadedChunks.push({
                    chunkNumber: state.currentChunk,
                    recordCount: finalChunkData.length,
                    downloadedAt: new Date().toISOString(),
                    format: format || state.format || 'product'
                });
            }
  
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
            
            console.log(`🎉 Brooks Background: Scraping completed! Downloaded ${state.downloadedChunks.length} ${finalFormat} chunks with ${totalRecords} total records`);
            
            return {
                success: true,
                totalChunks: state.downloadedChunks.length,
                totalRecords: totalRecords,
                downloadedChunks: state.downloadedChunks,
                format: finalFormat
            };
            
        } catch (error) {
            console.error('❌ Brooks Background: Finalization error:', error);
            return { success: false, error: error.message };
        }
    }
  
    // SEO-FRIENDLY HANDLE GENERATION - Product name + color + width
    generateWidthBasedHandle(product, width) {
        // Get product name and clean it
        const productName = (product.productName || '').toLowerCase()
            .replace(/brooks\s*/gi, '') // Remove "Brooks" prefix
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .trim();
        
        // Get color name and clean it
        const colorName = (product.colorName || product.colorCode || '').toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .trim();
        
        // Start with product name
        let handleParts = [];
        
        if (productName) {
            handleParts.push(productName);
        } else {
            // Fallback to styleId if no product name
            handleParts.push(product.styleId || 'unknown');
        }
        
        // Add color
        if (colorName) {
            handleParts.push(colorName);
        }
        
        // Create base handle
        let baseHandle = handleParts.join('-')
            .replace(/\s+/g, '-') // Replace spaces with dashes
            .replace(/-+/g, '-') // Remove duplicate dashes
            .replace(/^-+|-+$/g, ''); // Trim dashes from ends
        
        // Add width to handle if present and not standard
        if (width && width.trim() && width.toUpperCase() !== 'B' && width.toUpperCase() !== 'M') {
            const cleanWidth = width.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanWidth) {
                baseHandle += `-${cleanWidth}`;
            }
        }
        
        // Add SKU prefix to handle to ensure uniqueness across different SKU families
        // This prevents duplicates when same colorway exists in multiple size ranges
        if (product.styleId) {
            const skuPrefix = product.styleId.toString().substring(0, 9); // First 9 digits
            baseHandle += `-${skuPrefix}`;
        }
        
        return baseHandle || 'unknown-product';
    }
    
    // NO WIDTH SUFFIX FOR SCRAPER - Don't interpret widths
    // Titles stay as-is from source data
  
    // CONVERT TO INVENTORY CSV FORMAT
    convertToBrooksInventoryCSV(inventoryData) {
        if (!inventoryData || inventoryData.length === 0) return '';
        
        let csvLines = [];
        
        csvLines.push('Handle,Title,"Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",SKU,"HS Code",COO,Location,"Bin name","Incoming (not editable)","Unavailable (not editable)","Committed (not editable)","Available (not editable)","On hand (current)","On hand (new)"');
        
        // Group by width first, then by colorway
        const widthGroups = {};
        inventoryData.forEach(item => {
            const width = item.width || 'B';
            const gender = item.gender || 'UNISEX';
            const key = `${item.styleId}-${item.colorCode}-${width}`;
            
            if (!widthGroups[key]) {
                widthGroups[key] = {
                    variants: [],
                    width: width,
                    gender: gender,
                    baseProduct: item
                };
            }
            widthGroups[key].variants.push(item);
        });
        
        Object.keys(widthGroups).forEach(groupKey => {
            const group = widthGroups[groupKey];
            const variants = group.variants;
            const baseProduct = group.baseProduct;
            const width = group.width;
            
            // Simple handle with width code
            const handle = this.generateWidthBasedHandle(baseProduct, width);
            
            // Title stays as-is from product data
            const title = this.generateProductTitle(baseProduct);
            
            variants.forEach(variant => {
                const sku = this.generateSKU(variant);
                const quantity = Math.max(0, parseInt(variant.availableQuantity || variant.quantity) || 0);
                
                const row = [
                    handle,
                    `"${title}"`,
                    'Size',
                    variant.sizeUS || variant.size,
                    '',  // Option2 Name - EMPTY
                    '',  // Option2 Value - EMPTY
                    '',
                    '',
                    sku,
                    '',
                    '',
                    'Needham',
                    '',
                    '',
                    '',
                    '',
                    '',
                    '',
                    quantity
                ];
                
                csvLines.push(row.join(','));
            });
        });
        
        const csvContent = csvLines.join('\n');
        
        console.log('BROOKS BACKGROUND: Generated inventory CSV with width-based handles');
        console.log('BROOKS BACKGROUND: Handles include width suffixes for separation');
        
        return csvContent;
    }
  
    // CONVERT TO PRODUCT CSV FORMAT
    convertToBrooksProductCSV(inventoryData) {
        if (!inventoryData || inventoryData.length === 0) return '';
        
        const shopifyData = [];
        
        // Group by width first, then by colorway
        const widthGroups = {};
        inventoryData.forEach(item => {
            const width = item.width || 'B';
            const gender = item.gender || 'UNISEX';
            const key = `${item.styleId}-${item.colorCode}-${width}`;
            
            if (!widthGroups[key]) {
                widthGroups[key] = {
                    variants: [],
                    width: width,
                    gender: gender,
                    baseProduct: item
                };
            }
            widthGroups[key].variants.push(item);
        });
        
        Object.keys(widthGroups).forEach(groupKey => {
            const group = widthGroups[groupKey];
            const variants = group.variants;
            const baseProduct = group.baseProduct;
            const width = group.width;
            
            // Simple handle with width code
            const handle = this.generateWidthBasedHandle(baseProduct, width);
            
            // Title stays as-is from product data
            const title = this.generateProductTitle(baseProduct);
            
            variants.forEach((variant, index) => {
                const isFirstVariant = index === 0;
                const sku = this.generateSKU(variant);
                const quantity = Math.max(0, parseInt(variant.availableQuantity || variant.quantity) || 0);
                
                const shopifyRow = {
                    'Handle': handle,
                    'Title': isFirstVariant ? title : '',
                    'Body (HTML)': isFirstVariant ? this.generateProductDescription(baseProduct) : '',
                    'Vendor': isFirstVariant ? 'Brooks' : '',
                    'Product Category': isFirstVariant ? 'Footwear > Athletic Shoes' : '',
                    'Type': isFirstVariant ? 'Footwear' : '',
                    'Tags': isFirstVariant ? `Athletic, Running, Brooks, ${baseProduct.productName}` : '',
                    'Published': isFirstVariant ? 'TRUE' : '',
                    'Option1 Name': isFirstVariant ? 'Size' : '',
                    'Option1 Value': variant.sizeUS || variant.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    'Variant SKU': sku,
                    'Variant Grams': '',
                    'Variant Inventory Tracker': 'shopify',
                    'Variant Inventory Policy': 'deny',
                    'Variant Fulfillment Service': 'manual',
                    'Variant Price': '120.00',
                    'Variant Compare At Price': '',
                    'Variant Requires Shipping': 'TRUE',
                    'Variant Taxable': 'TRUE',
                    'Variant Barcode': '',
                    'Image Src': '',
                    'Image Position': '',
                    'Image Alt Text': '',
                    'Gift Card': 'FALSE',
                    'SEO Title': isFirstVariant ? title : '',
                    'SEO Description': isFirstVariant ? this.generateSEODescription(baseProduct) : '',
                    'Google Shopping / Google Product Category': '',
                    'Google Shopping / Gender': '',
                    'Google Shopping / Age Group': '',
                    'Google Shopping / MPN': '',
                    'Google Shopping / Condition': isFirstVariant ? 'New' : '',
                    'Google Shopping / Custom Product': 'FALSE',
                    'Variant Image': '',
                    'Variant Weight Unit': 'kg',
                    'Variant Tax Code': '',
                    'Cost per item': '',
                    'Status': 'active',
                    'Inventory at Needham': quantity,
                    'Included / United States': 'TRUE',
                    'Price / United States': '120.00',
                    'Compare At Price / United States': '',
                    'Included / International': 'TRUE',
                    'Price / International': '120.00',
                    'Compare At Price / International': ''
                };
                
                shopifyData.push(shopifyRow);
            });
        });
        
        // Convert to CSV
        const headers = Object.keys(shopifyData[0] || {});
        const csvContent = [
            headers.join(','),
            ...shopifyData.map(row => headers.map(header => {
                const value = row[header] || '';
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        return csvContent;
    }
  
    // EMERGENCY CLEANUP - Clear all old chunks immediately
    async emergencyCleanup() {
        try {
            console.log('🧹 Brooks Background: Running emergency cleanup...');
            
            const allItems = await chrome.storage.local.get(null);
            const keysToRemove = [];
            
            Object.keys(allItems).forEach(key => {
                // Remove ALL old chunks and scraping state
                if (key.startsWith('scraping_') || key.startsWith('brooks_chunk_')) {
                    keysToRemove.push(key);
                }
            });
            
            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
                console.log(`✅ Brooks Background: Emergency cleanup removed ${keysToRemove.length} items`);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Brooks Background: Emergency cleanup failed:', error);
            return false;
        }
    }
  
    // HELPER METHODS
    generateSKU(variant) {
        const styleId = variant.styleId || 'UNK';
        const colorCode = variant.colorCode || variant.colorName || 'DEF';
        const size = (variant.sizeUS || variant.size || 'OS').toString().replace(/\./g, '5');
        const width = variant.width || '';
        
        if (width) {
            return `${styleId}-${colorCode}-${size}-${width}`;
        } else {
            return `${styleId}-${colorCode}-${size}`;
        }
    }
  
    generateProductTitle(product) {
        const productName = product.productName || 'Unknown Product';
        const colorName = product.colorName || 'Default Color';
        
        const cleanProductName = productName.replace(/<[^>]*>/g, '').trim();
        const cleanColorName = colorName.replace(/<[^>]*>/g, '').trim();
        
        return `${cleanProductName} - ${cleanColorName}`;
    }
  
    generateProductDescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        const gender = product.gender || '';
        
        const cleanProductName = productName.replace(/<[^>]*>/g, '').trim();
        const cleanStyleId = styleId.replace(/<[^>]*>/g, '').trim();
        const cleanColorName = colorName.replace(/<[^>]*>/g, '').trim();
        const cleanGender = gender.replace(/<[^>]*>/g, '').trim();
        
        let description = `<p>${cleanProductName}</p>`;
        description += `<p>Style: ${cleanStyleId}</p>`;
        description += `<p>Color: ${cleanColorName}</p>`;
        
        if (cleanGender && cleanGender !== 'UNISEX') {
            description += `<p>Gender: ${cleanGender}</p>`;
        }
        
        description += `<p>High-performance athletic footwear from Brooks.</p>`;
        
        return description;
    }
  
    generateSEODescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        
        const cleanProductName = productName.replace(/<[^>]*>/g, '').trim();
        const cleanStyleId = styleId.replace(/<[^>]*>/g, '').trim();
        const cleanColorName = colorName.replace(/<[^>]*>/g, '').trim();
        
        return `${cleanProductName} in ${cleanColorName}. Style ${cleanStyleId} from Brooks. High-performance athletic footwear.`;
    }
  
    // NOTIFY CONTENT SCRIPT
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

// Initialize the unified manager
const brooksCSVManager = new UnifiedBrooksCSVManager();

// UNIFIED MESSAGE LISTENER
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Brooks Background: Received message:', message.action);
    
    if (message.action === 'addToInventoryChunks') {
        brooksCSVManager.addInventoryDataToChunks(message.data.data, message.data.csvContent, message.data.scrapingId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'addToProductChunks') {
        brooksCSVManager.addProductDataToChunks(message.data.data, message.data.csvContent, message.data.scrapingId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'finalizeScraping') {
        brooksCSVManager.finalizeScraping(message.data.scrapingId, message.data.format)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'ping') {
        sendResponse({ success: true, message: 'Brooks background script is responsive' });
        return true;
    }
    
    console.warn('❌ Brooks Background: Unknown message action:', message.action);
    sendResponse({ success: false, error: 'Unknown action' });
});

// STORAGE CLEANUP ON STARTUP
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 Brooks Background: Extension startup - cleaning old data');
    
    chrome.storage.local.get(null, (items) => {
        const keysToRemove = [];
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        Object.keys(items).forEach(key => {
            if (key.startsWith('scraping_') || key.startsWith('brooks_chunk_')) {
                const timestamp = parseInt(key.split('_')[1]);
                if (timestamp && timestamp < oneHourAgo) {
                    keysToRemove.push(key);
                }
            }
        });
        
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
            console.log(`🧹 Brooks Background: Cleaned up ${keysToRemove.length} old storage items`);
        }
    });
});

// INSTALL LISTENER
chrome.runtime.onInstalled.addListener(() => {
    console.log('🚀 Brooks Unified Background Script: Installed and ready');
    console.log('✅ SEO-FRIENDLY HANDLES: Uses product name + color + width + SKU prefix for uniqueness');
    console.log('✅ CONSISTENT: Matches HTML converter handle logic');
    console.log('🆔 SKU PREFIX: Prevents duplicate handles across different size ranges');
});

console.log('🚀 Brooks Unified Background Script: Initialized with SEO-optimized handles + SKU prefix');