// popup.js - FIXED VERSION
document.addEventListener('DOMContentLoaded', function() {
  const exportBtn = document.getElementById('exportBtn');
  const exportAllBtn = document.getElementById('exportAllBtn');
  const status = document.getElementById('status');
  
  // Define showStatus function FIRST
  function showStatus(message, type) {
    if (status) {
      status.textContent = String(message); // Convert to string to avoid [object Object]
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
  
  // Export button click handler
  exportBtn.addEventListener('click', async () => {
    try {
      showStatus('Checking current page...', 'success');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on an ASICS page
      if (!tab.url.includes('asics')) {
        showStatus('Please navigate to an ASICS B2B product page first', 'error');
        return;
      }
      
      // Send message to content script to extract data
      chrome.tabs.sendMessage(tab.id, { action: 'extractInventory' }, (response) => {
        if (chrome.runtime.lastError) {
          // Properly handle the error object
          const errorMessage = chrome.runtime.lastError.message || 'Content script not responding';
          showStatus(`Content script error: ${errorMessage}. Try refreshing the page.`, 'error');
          console.error('Chrome runtime error:', chrome.runtime.lastError);
        } else if (response && response.success) {
          showStatus(`Exported ${response.count} inventory records!`, 'success');
        } else if (response && response.error) {
          showStatus(`Extraction failed: ${response.error}`, 'error');
        } else {
          showStatus('No inventory data found on this page', 'error');
        }
      });
      
    } catch (error) {
      console.error('Export error:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
  
  // Export all button (disabled for now)
  exportAllBtn.addEventListener('click', () => {
    showStatus('Bulk export feature coming soon!', 'success');
  });
  
  // Initial status check when popup opens
  setTimeout(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('Error querying tabs:', chrome.runtime.lastError);
        showStatus('Extension error occurred', 'error');
        return;
      }
      
      if (tabs && tabs[0]) {
        const currentTab = tabs[0];
        
        if (currentTab.url.includes('asics')) {
          if (currentTab.url.includes('/products/') || currentTab.url.includes('/Products/')) {
            showStatus('Ready to export from product page', 'success');
          } else {
            showStatus('Navigate to a product page to export inventory', '');
          }
        } else {
          showStatus('Please navigate to ASICS B2B portal first', 'error');
        }
      } else {
        showStatus('Unable to detect current page', 'error');
      }
    });
  }, 100); // Small delay to ensure DOM is ready
});