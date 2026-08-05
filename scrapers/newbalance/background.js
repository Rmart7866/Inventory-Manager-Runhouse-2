// NEW BALANCE BACKGROUND SCRIPT - For chunking large exports
// This is OPTIONAL - only needed if you want to handle very large inventories

class NewBalanceCSVManager {
    constructor() {
        this.maxChunkSize = 1000;
        this.chunkPrefix = 'nb_chunk_';
    }

    async addInventoryDataToChunks(inventoryData, scrapingId) {
        try {
            console.log(`📦 Adding ${inventoryData.length} inventory records`);
            
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
                    console.log(`💾 Chunk ${state.currentChunk} is full`);
                    await this.downloadChunk(currentChunkData, state.currentChunk, scrapingId, 'inventory');
                    
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
            console.error('❌ Error managing chunks:', error);
            return { success: false, error: error.message };
        }
    }

    async downloadChunk(chunkData, chunkNumber, scrapingId, format) {
        if (!chunkData || chunkData.length === 0) return;
  
        try {
            console.log(`📥 Downloading ${format} chunk ${chunkNumber} with ${chunkData.length} records`);
            
            // Note: This would need the CSV conversion logic from content.js
            // For now, we'll just create a simple CSV
            const csv = this.createSimpleCSV(chunkData);
            const filename = `newbalance-${format}-chunk-${chunkNumber}-${Date.now()}.csv`;
            
            try {
                const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                
                await chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                });
                
                console.log(`✅ Downloaded ${filename}`);
                
                this.notifyContentScript('chunkDownloaded', {
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    filename: filename,
                    format: format
                });
                
            } catch (downloadError) {
                console.log('🔄 Chrome downloads failed, trying fallback...');
                
                this.notifyContentScript('downloadCSVFallback', {
                    csv: csv,
                    filename: filename,
                    chunkNumber: chunkNumber,
                    recordCount: chunkData.length,
                    format: format
                });
            }
            
        } catch (error) {
            console.error('❌ Download error:', error);
            throw error;
        }
    }

    createSimpleCSV(data) {
        // Simple CSV creation - in real implementation, you'd use the converter from content.js
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const rows = data.map(item => 
            headers.map(header => {
                const value = (item[header] || '').toString();
                return value.includes(',') ? `"${value.replace(/"/g, '""')}"` : value;
            }).join(',')
        );
        
        return [headers.join(','), ...rows].join('\n');
    }

    async finalizeScraping(scrapingId, format) {
        try {
            console.log(`🎯 Finalizing scraping ${scrapingId} (${format} format)`);
            
            const stateKey = `scraping_${scrapingId}`;
            const result = await chrome.storage.local.get([stateKey]);
            const state = result[stateKey];
            
            if (!state) {
                console.log('⚠️ No scraping state found');
                return { success: false, error: 'No scraping state found' };
            }
  
            const finalChunkKey = `${this.chunkPrefix}${scrapingId}_${state.currentChunk}`;
            const chunkResult = await chrome.storage.local.get([finalChunkKey]);
            const finalChunkData = chunkResult[finalChunkKey] || [];
            
            if (finalChunkData.length > 0) {
                console.log(`📥 Downloading final chunk with ${finalChunkData.length} records`);
                await this.downloadChunk(finalChunkData, state.currentChunk, scrapingId, format || state.format);
                
                state.downloadedChunks.push({
                    chunkNumber: state.currentChunk,
                    recordCount: finalChunkData.length,
                    downloadedAt: new Date().toISOString(),
                    format: format || state.format || 'product'
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
            
            console.log(`🎉 Scraping completed! ${state.downloadedChunks.length} ${finalFormat} chunks with ${totalRecords} total records`);
            
            return {
                success: true,
                totalChunks: state.downloadedChunks.length,
                totalRecords: totalRecords,
                downloadedChunks: state.downloadedChunks,
                format: finalFormat
            };
            
        } catch (error) {
            console.error('❌ Finalization error:', error);
            return { success: false, error: error.message };
        }
    }

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

// Initialize the manager
const nbCSVManager = new NewBalanceCSVManager();

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Received message:', message.action);
    
    if (message.action === 'addToInventoryChunks') {
        nbCSVManager.addInventoryDataToChunks(message.data.data, message.data.scrapingId)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'finalizeScraping') {
        nbCSVManager.finalizeScraping(message.data.scrapingId, message.data.format)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (message.action === 'ping') {
        sendResponse({ success: true, message: 'New Balance background script is responsive' });
        return true;
    }
    
    console.warn('❌ Unknown message action:', message.action);
    sendResponse({ success: false, error: 'Unknown action' });
});

// Storage cleanup on startup
chrome.runtime.onStartup.addListener(() => {
    console.log('🔄 Extension startup - cleaning old data');
    
    chrome.storage.local.get(null, (items) => {
        const keysToRemove = [];
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        Object.keys(items).forEach(key => {
            if (key.startsWith('scraping_') || key.startsWith('nb_chunk_')) {
                const timestamp = parseInt(key.split('_')[1]);
                if (timestamp && timestamp < oneHourAgo) {
                    keysToRemove.push(key);
                }
            }
        });
        
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
            console.log(`🧹 Cleaned up ${keysToRemove.length} old storage items`);
        }
    });
});

// Install listener
chrome.runtime.onInstalled.addListener(() => {
    console.log('🛠️ New Balance Background Script: Installed and ready');
    console.log('📦 Features: Chunked downloads for large inventories');
});

console.log('🛠️ New Balance Background Script: Initialized successfully');