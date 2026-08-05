document.addEventListener('DOMContentLoaded', function() {
    const exportBtn = document.getElementById('exportBtn');
    const watchingBtn = document.getElementById('watchingBtn');
    const status = document.getElementById('status');
    
    // Define showStatus function FIRST
    function showStatus(message, type) {
        if (status) {
            status.textContent = String(message);
            status.className = 'status ' + type;
            
            // Clear status after 5 seconds unless it's an error
            if (type !== 'error') {
                setTimeout(() => {
                    status.textContent = '';
                    status.className = 'status';
                }, 5000);
            }
        }
    }
    
    // Export button click handler - FIXED
    exportBtn.addEventListener('click', async () => {
        try {
            showStatus('Checking current page with FIXED extraction...', 'info');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            // Check if we're on a Puma page
            if (!tab.url.includes('puma') && !tab.url.includes('pumab2b')) {
                showStatus('Please navigate to a Puma B2B product page first', 'error');
                return;
            }
            
            // Send message to content script to extract data with FIXED formatting
            chrome.tabs.sendMessage(tab.id, { action: 'extractInventory' }, (response) => {
                if (chrome.runtime.lastError) {
                    const errorMessage = chrome.runtime.lastError.message || 'Content script not responding';
                    showStatus(`Content script error: ${errorMessage}. Try refreshing the page.`, 'error');
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                } else if (response && response.success) {
                    let message = `FIXED Export: ${response.count} inventory records!`;
                    if (response.fixedFeatures) {
                        message += ` (${response.fixedFeatures})`;
                    }
                    showStatus(message, 'success');
                } else if (response && response.error) {
                    showStatus(`FIXED Extraction failed: ${response.error}`, 'error');
                } else {
                    showStatus('No inventory data found on this page', 'error');
                }
            });
            
        } catch (error) {
            console.error('FIXED Export error:', error);
            showStatus(`FIXED Export error: ${error.message}`, 'error');
        }
    });
    
    // Manual watching button - FIXED
    watchingBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('puma') && !tab.url.includes('pumab2b')) {
                showStatus('Please navigate to a Puma page first', 'error');
                return;
            }
            
            // Use chrome.scripting.executeScript instead of deprecated chrome.tabs.executeScript
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        if (window.pumaExtractor || window.completePumaExtractor) {
                            const extractor = window.pumaExtractor || window.completePumaExtractor;
                            // Check if already watching
                            if (extractor.isWatching) {
                                extractor.stopWatchingAndExport();
                            } else {
                                extractor.startWatching();
                            }
                        } else {
                            alert('FIXED extractor loading... Please refresh the page and try again');
                        }
                    }
                });
                showStatus('FIXED Manual watching toggled on page', 'success');
            } catch (scriptError) {
                // Fallback to older API if available
                chrome.tabs.executeScript(tab.id, {
                    code: `
                        if (window.pumaExtractor || window.completePumaExtractor) {
                            const extractor = window.pumaExtractor || window.completePumaExtractor;
                            if (extractor.isWatching) {
                                extractor.stopWatchingAndExport();
                            } else {
                                extractor.startWatching();
                            }
                        } else {
                            alert('FIXED extractor loading... Please refresh the page and try again');
                        }
                    `
                });
                showStatus('FIXED Manual watching toggled on page', 'success');
            }
            
        } catch (error) {
            console.error('FIXED Manual watching error:', error);
            showStatus(`FIXED Watching error: ${error.message}`, 'error');
        }
    });
    
    // Initial status check when popup opens - FIXED
    setTimeout(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                console.error('Error querying tabs:', chrome.runtime.lastError);
                showStatus('Extension error occurred', 'error');
                return;
            }
            
            if (tabs && tabs[0]) {
                const currentTab = tabs[0];
                
                if (currentTab.url.includes('puma') || currentTab.url.includes('pumab2b')) {
                    if (currentTab.url.includes('builder') || currentTab.url.includes('order')) {
                        showStatus('Ready for FIXED export from product page', 'success');
                    } else {
                        showStatus('Navigate to order builder page for FIXED inventory export', 'info');
                    }
                } else {
                    showStatus('Please navigate to Puma B2B portal first', 'error');
                }
            } else {
                showStatus('Unable to detect current page', 'error');
            }
        });
    }, 100);
    
    // Show FIXED features info after initialization
    setTimeout(() => {
        console.log('🚀 FIXED Puma Extension Popup Ready');
        console.log('✅ FIXED: Colors now included in product names');
        console.log('✅ FIXED: Proper Shopify CSV format (Location, On hand columns)');
        console.log('✅ FIXED: Variant Inventory Qty field for products');
        console.log('✅ FIXED: Enhanced UI filtering and size detection');
    }, 500);
});