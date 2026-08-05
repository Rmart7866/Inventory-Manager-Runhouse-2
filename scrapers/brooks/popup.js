// popup.js - Brooks FastTrack version - Clean Interface
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
      showStatus('Extracting Brooks inventory data...', 'info');
      exportBtn.disabled = true;
      exportBtn.textContent = 'Scraping...';
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('brooksrunning.com') && !tab.url.includes('epicurosaas.com')) {
        showStatus('Please navigate to a Brooks FastTrack page first', 'error');
        exportBtn.disabled = false;
        exportBtn.textContent = 'Scrape Current Page';
        return;
      }
      
      // First, try to inject the content script manually if it's not loaded
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        console.log('Brooks content script injected successfully');
      } catch (injectionError) {
        console.log('Content script injection failed or already loaded:', injectionError);
      }
      
      // Wait a moment for the script to initialize
      setTimeout(() => {
        // Send message with timeout handling
        chrome.tabs.sendMessage(tab.id, { action: 'extractInventory' }, (response) => {
          exportBtn.disabled = false;
          exportBtn.textContent = 'Scrape Current Page';
          
          if (chrome.runtime.lastError) {
            const errorMessage = chrome.runtime.lastError.message || 'Content script not responding';
            showStatus('Content script error: ' + errorMessage + '. Try refreshing the page.', 'error');
            console.error('Chrome runtime error:', chrome.runtime.lastError);
          } else if (response && response.success) {
            showStatus('Successfully exported ' + response.count + ' Brooks inventory records!', 'success');
          } else if (response && response.error) {
            showStatus('Extraction error: ' + response.error, 'error');
          } else {
            showStatus('No inventory data found on this page', 'error');
          }
        });
      }, 200);
      
    } catch (error) {
      console.error('Export error:', error);
      showStatus('Error: ' + String(error.message), 'error');
      exportBtn.disabled = false;
      exportBtn.textContent = 'Scrape Current Page';
    }
  });
  
  exportAllBtn.addEventListener('click', () => {
    showStatus('Bulk scraping feature coming soon!', 'info');
  });
  
  // Initial status check
  setTimeout(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const currentTab = tabs[0];
        
        if (currentTab.url.includes('brooksrunning.com') || currentTab.url.includes('epicurosaas.com')) {
          showStatus('Ready to scrape Brooks FastTrack page', 'success');
        } else {
          showStatus('Please navigate to Brooks FastTrack portal first', 'error');
        }
      }
    });
  }, 100);
});