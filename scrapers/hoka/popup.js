// popup.js - Fixed version
document.addEventListener('DOMContentLoaded', function() {
    const exportBtn = document.getElementById('exportBtn');
    const exportAllBtn = document.getElementById('exportAllBtn');
    const status = document.getElementById('status');
    
    function showStatus(message, type) {
      if (status) {
        status.textContent = String(message);
        status.className = 'status ' + type;
        
        if (type !== 'error') {
          setTimeout(() => {
            status.textContent = '';
            status.className = 'status';
          }, 5000);
        }
      }
    }
    
    exportBtn.addEventListener('click', async () => {
      try {
        showStatus('Extracting inventory data...', 'info');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.includes('deckers')) {
          showStatus('Please navigate to a Hoka/Deckers B2B page first', 'error');
          return;
        }
        
        // First, try to inject the content script manually if it's not loaded
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          console.log('Content script injected successfully');
        } catch (injectionError) {
          console.log('Content script injection failed or already loaded:', injectionError);
        }
        
        // Wait a moment for the script to initialize
        setTimeout(() => {
          // Send message with timeout handling
          chrome.tabs.sendMessage(tab.id, { action: 'extractInventory' }, (response) => {
            if (chrome.runtime.lastError) {
              // Fix: Properly handle the chrome.runtime.lastError object
              const errorMessage = chrome.runtime.lastError.message || 'Content script not responding';
              showStatus('Content script error: ' + errorMessage + '. Try refreshing the page.', 'error');
              console.error('Chrome runtime error:', chrome.runtime.lastError);
            } else if (response && response.success) {
              showStatus('Exported ' + response.count + ' inventory records!', 'success');
            } else if (response && response.error) {
              showStatus('Extraction error: ' + response.error, 'error');
            } else {
              showStatus('No inventory data found on this page', 'error');
            }
          });
        }, 100);
        
      } catch (error) {
        console.error('Export error:', error);
        showStatus('Error: ' + String(error.message), 'error');
      }
    });
    
    exportAllBtn.addEventListener('click', () => {
      showStatus('Bulk export feature coming soon!', 'info');
    });
    
    // Initial status check
    setTimeout(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          const currentTab = tabs[0];
          
          if (currentTab.url.includes('deckers')) {
            showStatus('Ready to extract from Hoka/Deckers page', 'success');
          } else {
            showStatus('Please navigate to Hoka/Deckers B2B portal first', 'error');
          }
        }
      });
    }, 100);
  });
