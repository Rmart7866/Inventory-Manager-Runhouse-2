// COMPLETE UNIFIED ASICS Background Script - FINAL CORRECT VERSION
// This persists data across page navigations and handles both inventory and product CSV downloads

class UnifiedCSVManager {
    constructor() {
        this.maxChunkSize = 10000; // records per chunk
        this.chunkPrefix = 'asics_chunk_';
    }
  
    // INVENTORY CSV CHUNKING - for updating existing products
    async addInventoryDataToChunks(inventoryData, csvContent, scrapingId) {
        try {
            console.log(`📦 Background: Adding ${inventoryData.length} inventory records to chunks for scraping ${scrapingId}`);
            
            // Get current scraping state
            const stateKey = `scraping_${scrapingId}`;
            const result = await chrome.storage.local.get([stateKey]);
            let state = result[stateKey] || {
                currentChunk: 1,
                totalRecords: 0,
                downloadedChunks: [],
                format: 'inventory'
            };
  
            // Get current chunk data
            const currentChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            const chunkResult = await chrome.storage.local.get([currentChunkKey]);
            let currentChunkData = chunkResult[currentChunkKey] || [];
  
            // Add new data to current chunk
            let remainingData = [...inventoryData];
            
            while (remainingData.length > 0) {
                const spaceLeft = this.maxChunkSize - currentChunkData.length;
                
                if (spaceLeft <= 0) {
                    // Download current chunk as inventory CSV
                    console.log(`💾 Background: Inventory chunk ${state.currentChunk} is full (${currentChunkData.length} records) - downloading now`);
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
  
            // Save updated chunk and state
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
            console.error('❌ Background: Error managing inventory chunks:', error);
            return { success: false, error: error.message };
        }
    }
  
    // PRODUCT CSV CHUNKING - for creating new products
    async addProductDataToChunks(productData, csvContent, scrapingId) {
        try {
            console.log(`🏪 Background: Adding ${productData.length} product records to chunks for scraping ${scrapingId}`);
            
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
                    console.log(`💾 Background: Product chunk ${state.currentChunk} is full - downloading now`);
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
            console.error('❌ Background: Error managing product chunks:', error);
            return { success: false, error: error.message };
        }
    }
  
    // DOWNLOAD INVENTORY CHUNK
    async downloadInventoryChunk(chunkData, chunkNumber, scrapingId) {
        if (!chunkData || chunkData.length === 0) {
            console.log('⚠️ Background: No inventory data to download in chunk');
            return;
        }
  
        try {
            console.log(`📥 Background: Downloading inventory chunk ${chunkNumber} with ${chunkData.length} records`);
            
            // Convert to inventory CSV format
            const csv = this.convertToInventoryCSV(chunkData);
            const filename = `asics-inventory-part-${chunkNumber}-${Date.now()}.csv`;
            
            // Try chrome.downloads first
            try {
                const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                
                await chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                });
                
                console.log(`✅ Background: Downloaded ${filename}`);
                
                this.notifyContentScript('chunkDownloaded', {
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    filename: filename,
                    format: 'inventory'
                });
                
            } catch (downloadError) {
                console.log('🔄 Background: Chrome downloads failed, trying fallback...');
                
                // Fallback to content script download
                this.notifyContentScript('downloadCSVFallback', {
                    csv: csv,
                    filename: filename,
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    format: 'inventory'
                });
            }
            
        } catch (error) {
            console.error('❌ Background: Inventory download error:', error);
            throw error;
        }
    }
  
    // DOWNLOAD PRODUCT CHUNK
    async downloadProductChunk(chunkData, chunkNumber, scrapingId) {
        if (!chunkData || chunkData.length === 0) return;
  
        try {
            console.log(`📥 Background: Downloading product chunk ${chunkNumber} with ${chunkData.length} records`);
            
            // Convert to product CSV format
            const csv = this.convertToProductCSV(chunkData);
            const filename = `asics-products-part-${chunkNumber}-${Date.now()}.csv`;
            
            try {
                const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                
                await chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                });
                
                console.log(`✅ Background: Downloaded ${filename}`);
                
                this.notifyContentScript('chunkDownloaded', {
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    filename: filename,
                    format: 'product'
                });
                
            } catch (downloadError) {
                console.log('🔄 Background: Chrome downloads failed, trying fallback...');
                
                this.notifyContentScript('downloadCSVFallback', {
                    csv: csv,
                    filename: filename,
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    format: 'product'
                });
            }
            
        } catch (error) {
            console.error('❌ Background: Product download error:', error);
            throw error;
        }
    }
  
    // FINALIZE SCRAPING - Handle both formats
    async finalizeScraping(scrapingId, format) {
        try {
            console.log(`🎯 Background: Finalizing scraping ${scrapingId} (${format} format)`);
            
            // Get current state
            const stateKey = `scraping_${scrapingId}`;
            const result = await chrome.storage.local.get([stateKey]);
            const state = result[stateKey];
            
            if (!state) {
                console.log('⚠️ Background: No scraping state found');
                return { success: false, error: 'No scraping state found' };
            }
  
            // Download final chunk if it has data
            const finalChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            const chunkResult = await chrome.storage.local.get([finalChunkKey]);
            const finalChunkData = chunkResult[finalChunkKey] || [];
            
            if (finalChunkData.length > 0) {
                console.log(`📥 Background: Downloading final chunk ${state.currentChunk} with ${finalChunkData.length} records`);
                
                // Use appropriate download method based on format
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
  
            // Clean up storage
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
            
            console.log(`🎉 Background: Scraping completed! Downloaded ${state.downloadedChunks.length} ${finalFormat} chunks with ${totalRecords} total records`);
            
            return {
                success: true,
                totalChunks: state.downloadedChunks.length,
                totalRecords: totalRecords,
                downloadedChunks: state.downloadedChunks,
                format: finalFormat
            };
            
        } catch (error) {
            console.error('❌ Background: Finalization error:', error);
            return { success: false, error: error.message };
        }
    }
  
    // CONVERT TO INVENTORY CSV FORMAT - FINAL CORRECT VERSION
    convertToInventoryCSV(inventoryData) {
        if (!inventoryData || inventoryData.length === 0) return '';
        
        // Build CSV manually to ensure ALL columns are included
        let csvLines = [];
        
        // Add header row - EXACT format Shopify expects with all 19 columns
        csvLines.push('Handle,Title,"Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",SKU,"HS Code",COO,Location,"Bin name","Incoming (not editable)","Unavailable (not editable)","Committed (not editable)","Available (not editable)","On hand (current)","On hand (new)"');
        
        // Group by colorway
        const productGroups = {};
        inventoryData.forEach(item => {
            const key = `${item.styleId}-${item.colorCode}`;
            if (!productGroups[key]) {
                productGroups[key] = [];
            }
            productGroups[key].push(item);
        });
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            const handle = this.generateHandle(baseProduct);
            const title = this.generateProductTitle(baseProduct);
            
            variants.forEach(variant => {
                const sku = this.generateSKU(variant);
                const quantity = Math.max(0, parseInt(variant.quantity) || 0);
                
                // Build each row manually - ensuring all 19 columns
                const row = [
                    handle,                                  // Handle
                    `"${title}"`,                           // Title
                    'Size',                                  // Option1 Name
                    variant.sizeUS || variant.size,         // Option1 Value
                    'Color',                                 // Option2 Name
                    `"${variant.colorName}"`,               // Option2 Value
                    '',                                      // Option3 Name
                    '',                                      // Option3 Value
                    sku,                                     // SKU
                    '',                                      // HS Code
                    '',                                      // COO
                    'Needham',                              // Location
                    '',                                      // Bin name
                    '',                                      // Incoming (not editable)
                    '',                                      // Unavailable (not editable)
                    '',                                      // Committed (not editable)
                    '',                                      // Available (not editable)
                    '',                                      // On hand (current) - empty to skip validation
                    quantity                                 // On hand (new) - THE CRITICAL COLUMN
                ];
                
                csvLines.push(row.join(','));
            });
        });
        
        const csvContent = csvLines.join('\n');
        
        console.log('BACKGROUND: Generated inventory CSV with all 19 columns including "On hand (new)"');
        console.log('BACKGROUND: First line:', csvLines[0]);
        
        return csvContent;
    }

    // CONVERT TO PRODUCT CSV FORMAT
    convertToProductCSV(inventoryData) {
        if (!inventoryData || inventoryData.length === 0) return '';
        
        // Convert inventory data to full Shopify product format
        const shopifyData = [];
        
        // Group by colorway
        const productGroups = {};
        inventoryData.forEach(item => {
            const key = `${item.styleId}-${item.colorCode}`;
            if (!productGroups[key]) {
                productGroups[key] = [];
            }
            productGroups[key].push(item);
        });
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            const handle = this.generateHandle(baseProduct);
            
            variants.forEach((variant, index) => {
                const isFirstVariant = index === 0;
                const sku = this.generateSKU(variant);
                const quantity = Math.max(0, parseInt(variant.quantity) || 0);
                
                const shopifyRow = {
                    'Handle': handle,
                    'Title': isFirstVariant ? this.generateProductTitle(baseProduct) : '',
                    'Body (HTML)': isFirstVariant ? this.generateProductDescription(baseProduct) : '',
                    'Vendor': isFirstVariant ? 'ASICS' : '',
                    'Product Category': isFirstVariant ? 'Footwear > Athletic Shoes' : '',
                    'Type': isFirstVariant ? 'Footwear' : '',
                    'Tags': isFirstVariant ? `Athletic, Running, ASICS, ${baseProduct.productName}` : '',
                    'Published': isFirstVariant ? 'TRUE' : '',
                    'Option1 Name': isFirstVariant ? 'Size' : '',
                    'Option1 Value': variant.sizeUS || variant.size,
                    'Option2 Name': isFirstVariant ? 'Color' : '',
                    'Option2 Value': variant.colorName,
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
                    'SEO Title': isFirstVariant ? this.generateProductTitle(baseProduct) : '',
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
                    // Multi-location inventory for products - keep this for product CSV
                    'Inventory at Needham': quantity,
                    // Market pricing
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
  
    // HELPER METHODS
    generateHandle(product) {
        const styleId = (product.styleId || 'unknown').toLowerCase();
        const colorCode = (product.colorCode || product.colorName || 'default').toLowerCase();
        let handle = `${styleId}-${colorCode}`.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        
        // For wide shoes, append width to handle
        if (product.width && product.width.isWide) {
            handle += `-${product.width.code.toLowerCase()}`;
        }
        
        return handle;
    }
  
    generateSKU(variant) {
        const styleId = variant.styleId || 'UNK';
        const colorCode = variant.colorCode || variant.colorName || 'DEF';
        const size = (variant.sizeUS || variant.size || 'OS').toString().replace(/\./g, '5');
        let sku = `${styleId}-${colorCode}-${size}`;
        
        // Append width code for wide shoes (e.g., -2E, -4E)
        if (variant.width && variant.width.isWide) {
            sku += `-${variant.width.code}`;
        }
        
        return sku;
    }
  
    generateProductTitle(product) {
        const productName = product.productName || 'Unknown Product';
        const colorName = product.colorName || 'Default Color';
        const gender = product.gender || '';
        
        // Build title with gender and width
        let title = gender ? `${gender}'s ${productName}` : productName;
        
        // Add width for wide shoes
        if (product.width && product.width.isWide) {
            title += ` ${product.width.name}`;
        }
        
        // Add color
        title += ` - ${colorName}`;
        
        return title;
    }
  
    generateProductDescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        return `<p>${productName}</p><p>Style: ${styleId}</p><p>Color: ${colorName}</p><p>High-performance athletic footwear from ASICS.</p>`;
    }
  
    generateSEODescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        return `${productName} in ${colorName}. Style ${styleId} from ASICS. High-performance athletic footwear.`;
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
            // Content script might not be ready, that's ok
            console.log('Could not notify content script:', error.message);
        }
    }
}
  
// Initialize the unified manager
const csvManager = new UnifiedCSVManager();
  
// UNIFIED MESSAGE LISTENER - Handle both formats
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Background: Received message:', message.action);
    
    // Handle inventory chunks
    if (message.action === 'addToInventoryChunks') {
        csvManager.addInventoryDataToChunks(message.data.data, message.data.csvContent, message.data.scrapingId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
    
    // Handle product chunks
    if (message.action === 'addToProductChunks') {
        csvManager.addProductDataToChunks(message.data.data, message.data.csvContent, message.data.scrapingId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    // Handle scraping finalization
    if (message.action === 'finalizeScraping') {
        csvManager.finalizeScraping(message.data.scrapingId, message.data.format)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    // Handle ping for debugging
    if (message.action === 'ping') {
        sendResponse({ success: true, message: 'Background script is responsive' });
        return true;
    }
    
    // Unknown action
    console.warn('❌ Background: Unknown message action:', message.action);
    sendResponse({ success: false, error: 'Unknown action' });
});
  
// STORAGE CLEANUP ON STARTUP
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 Background: Extension startup - cleaning old data');
    
    // Clean up old scraping data on startup
    chrome.storage.local.get(null, (items) => {
        const keysToRemove = [];
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        Object.keys(items).forEach(key => {
            if (key.startsWith('scraping_') || key.startsWith('asics_chunk_')) {
                // Remove old scraping data
                const timestamp = parseInt(key.split('_')[1]);
                if (timestamp && timestamp < oneHourAgo) {
                    keysToRemove.push(key);
                }
            }
        });
        
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
            console.log(`🧹 Background: Cleaned up ${keysToRemove.length} old storage items`);
        }
    });
});
  
// INSTALL LISTENER
chrome.runtime.onInstalled.addListener(() => {
    console.log('🚀 ASICS Unified Background Script: Installed and ready');
    console.log('📦 Features: Inventory CSV chunking, Product CSV chunking');
    console.log('✅ CORRECT: Inventory CSV now uses all 19 columns with "On hand (new)" as final column');
});
  
console.log('🚀 ASICS Unified Background Script: Initialized successfully');
console.log('✅ Ready to handle both inventory and product CSV formats');