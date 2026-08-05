// ON Running B2B Scraper - Popup JS
document.addEventListener('DOMContentLoaded', function() {
  const exportBtn = document.getElementById('exportBtn');
  const scrapeBothBtn = document.getElementById('scrapeBothBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const debugBtn = document.getElementById('debugBtn');
  const status = document.getElementById('status');
  
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
  
  // Manual scrape button
  exportBtn.addEventListener('click', async () => {
    try {
      showStatus('🔍 Scanning page for inventory data...', 'success');
      exportBtn.disabled = true;
      exportBtn.textContent = '⏳ Scraping...';
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on an ON Running related page
      if (!isONRunningPage(tab.url)) {
        showStatus('Please navigate to an ON Running B2B portal first', 'error');
        resetButton();
        return;
      }
      
      // Send message to content script to extract data
      chrome.tabs.sendMessage(tab.id, { action: 'extractInventory' }, (response) => {
        resetButton();
        
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || 'Content script not responding';
          showStatus(`Script error: ${errorMessage}. Try refreshing the page.`, 'error');
          console.error('Chrome runtime error:', chrome.runtime.lastError);
        } else if (response && response.success) {
          if (response.count > 0) {
            showStatus(`✅ Exported ${response.count} ON Running variants to Shopify CSV!`, 'success');
          } else {
            showStatus('⚠️ No inventory data found. Try the Debug tool.', 'error');
          }
        } else if (response && response.error) {
          showStatus(`Extraction failed: ${response.error}`, 'error');
        } else {
          showStatus('❌ No inventory data detected on this page', 'error');
        }
      });
      
    } catch (error) {
      resetButton();
      console.error('Export error:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
  
  // Scrape both genders button
  scrapeBothBtn.addEventListener('click', async () => {
    try {
      showStatus('🔄 Preparing to scrape both genders...', 'success');
      scrapeBothBtn.disabled = true;
      scrapeBothBtn.textContent = '⏳ Scraping...';
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on an ON Running related page
      if (!isONRunningPage(tab.url)) {
        showStatus('Please navigate to an ON Running B2B portal first', 'error');
        resetScrapeBothButton();
        return;
      }
      
      // Send message to content script to scrape both genders
      chrome.tabs.sendMessage(tab.id, { action: 'scrapeBothGenders' }, (response) => {
        resetScrapeBothButton();
        
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || 'Content script not responding';
          showStatus(`Script error: ${errorMessage}. Try refreshing the page.`, 'error');
          console.error('Chrome runtime error:', chrome.runtime.lastError);
        } else if (response && response.success) {
          if (response.count > 0) {
            showStatus(`✅ Exported ${response.count} variants from both genders to combined CSV!`, 'success');
          } else {
            showStatus('⚠️ No inventory data found. Try the Debug tool.', 'error');
          }
        } else if (response && response.error) {
          showStatus(`Extraction failed: ${response.error}`, 'error');
        } else {
          showStatus('❌ Unable to scrape both genders', 'error');
        }
      });
      
    } catch (error) {
      resetScrapeBothButton();
      console.error('Export error:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
  
  // Settings button
  settingsBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!isONRunningPage(tab.url)) {
        showStatus('Navigate to ON Running B2B portal to access settings', 'error');
        return;
      }
      
      // Inject script to show settings modal
      chrome.tabs.executeScript(tab.id, {
        code: `
          if (typeof ONRunningInventoryExtractor !== 'undefined') {
            const extractor = new ONRunningInventoryExtractor();
            extractor.showSettingsModal();
          } else {
            alert('Please refresh the page and try again.');
          }
        `
      });
      
      // Close popup after opening settings
      window.close();
      
    } catch (error) {
      console.error('Settings error:', error);
      showStatus('Unable to open settings', 'error');
    }
  });
  
  // Debug button
  debugBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!isONRunningPage(tab.url)) {
        showStatus('Navigate to ON Running page to debug', 'error');
        return;
      }
      
      // Inject script to show debug modal
      chrome.tabs.executeScript(tab.id, {
        code: `
          if (typeof ONRunningInventoryExtractor !== 'undefined') {
            const extractor = new ONRunningInventoryExtractor();
            extractor.showDebugInfo();
          } else {
            alert('Please refresh the page and try again.');
          }
        `
      });
      
      // Close popup after opening debug
      window.close();
      
    } catch (error) {
      console.error('Debug error:', error);
      showStatus('Unable to open debug tool', 'error');
    }
  });
  
  function resetButton() {
    exportBtn.disabled = false;
    exportBtn.textContent = 'Scrape Current Page';
  }
  
  function resetScrapeBothButton() {
    scrapeBothBtn.disabled = false;
    scrapeBothBtn.textContent = '🔄 Scrape Both Genders & Combine';
  }
  
  function isONRunningPage(url) {
    const onRunningDomains = [
      'backstage.on-running.com',
      'b2b.on-running.com', 
      'on-running.com/b2b',
      'portal.on-running.com',
      'dealer.on-running.com',
      'wholesale.on-running.com',
      'on-running.com'
    ];
    
    return onRunningDomains.some(domain => url.includes(domain));
  }
  
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
        
        if (isONRunningPage(currentTab.url)) {
          if (currentTab.url.includes('backstage') || 
              currentTab.url.includes('b2b') || 
              currentTab.url.includes('dealer') ||
              currentTab.url.includes('wholesale')) {
            showStatus('✅ ON Running B2B portal detected - Ready to scrape!', 'success');
          } else {
            showStatus('Navigate to ON Running B2B portal to scrape inventory', '');
          }
        } else {
          showStatus('Please navigate to ON Running B2B portal', 'error');
        }
      } else {
        showStatus('Unable to detect current page', 'error');
      }
    });
  }, 100);
});