document.addEventListener('DOMContentLoaded', function() {
    const startWatchingBtn = document.getElementById('startWatchingBtn');
    const quickExportBtn = document.getElementById('quickExportBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const status = document.getElementById('status');
    
    let isWatching = false;
    
    function showStatus(message, type = '') {
        if (status) {
            status.textContent = message;
            status.className = 'status ' + type;
            
            if (type !== 'error' && message) {
                setTimeout(() => {
                    status.textContent = '';
                    status.className = 'status';
                }, 4000);
            }
        }
    }
    
    // Start/Stop Watching
    startWatchingBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('newbalance') && !tab.url.includes('nb.com')) {
                showStatus('Please navigate to a New Balance page first', 'error');
                return;
            }
            
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    if (window.nbExtractor || window.newBalanceExtractor) {
                        const extractor = window.nbExtractor || window.newBalanceExtractor;
                        if (extractor.isWatching) {
                            extractor.stopWatchingAndExport();
                            return { watching: false };
                        } else {
                            extractor.startWatching();
                            return { watching: true };
                        }
                    } else {
                        return { error: 'Extractor not loaded' };
                    }
                }
            }, (results) => {
                if (results && results[0] && results[0].result) {
                    if (results[0].result.error) {
                        showStatus('Please refresh the page and try again', 'error');
                    } else {
                        isWatching = results[0].result.watching;
                        updateButtonState();
                        showStatus(isWatching ? 'Watching started - scroll to capture products' : 'Watching stopped - exporting data', 'success');
                    }
                }
            });
            
        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
        }
    });
    
    // Quick Export
    quickExportBtn.addEventListener('click', async () => {
        try {
            showStatus('Extracting current page...', '');
            
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('newbalance') && !tab.url.includes('nb.com')) {
                showStatus('Please navigate to a New Balance page first', 'error');
                return;
            }
            
            chrome.tabs.sendMessage(tab.id, { action: 'extractInventory' }, (response) => {
                if (chrome.runtime.lastError) {
                    showStatus('Please refresh the page and try again', 'error');
                } else if (response && response.success) {
                    showStatus(`Exported ${response.count} variants!`, 'success');
                } else if (response && response.error) {
                    showStatus(`Failed: ${response.error}`, 'error');
                } else {
                    showStatus('No inventory data found', 'error');
                }
            });
            
        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
        }
    });
    
    // Settings
    settingsBtn.addEventListener('click', async () => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    if (window.nbExtractor || window.newBalanceExtractor) {
                        const extractor = window.nbExtractor || window.newBalanceExtractor;
                        extractor.showSettingsModal();
                    }
                }
            });
            
            showStatus('Settings opened', 'success');
            
        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
        }
    });
    
    function updateButtonState() {
        if (isWatching) {
            startWatchingBtn.innerHTML = '<span>⏹</span><span>Stop Watching</span>';
            startWatchingBtn.style.background = 'rgba(248, 113, 113, 0.95)';
        } else {
            startWatchingBtn.innerHTML = '<span>🎯</span><span>Start Watching</span>';
            startWatchingBtn.style.background = 'rgba(255, 255, 255, 0.95)';
        }
    }
    
    // Check initial state
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
            if (tabs[0].url.includes('newbalance') || tabs[0].url.includes('nb.com')) {
                showStatus('Ready to capture inventory', 'success');
            } else {
                showStatus('Navigate to New Balance B2B site', '');
            }
        }
    });
});