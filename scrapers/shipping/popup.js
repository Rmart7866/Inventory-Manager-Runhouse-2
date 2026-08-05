// Shipping Form Filler - Popup JS
document.addEventListener('DOMContentLoaded', function() {
  const fillFormBtn = document.getElementById('fillFormBtn');
  const shippingInput = document.getElementById('shippingInput');
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
  
  // Parse Shopify shipping info
  function parseShippingInfo(text) {
    // Expected format: "Name, Address, City State Zip, Country, Phone"
    // Example: "Bradley Bannister, 475 S 200 W, Hartford City Indiana 47348, United States, +17657021089"
    
    const parts = text.split(',').map(s => s.trim());
    
    if (parts.length < 4) {
      throw new Error('Invalid format. Expected: Name, Address, City State Zip, Country, Phone');
    }
    
    const name = parts[0];
    const streetAddress = parts[1];
    
    // Parse "City State Zip" - third part
    const cityStateZip = parts[2];
    const cityStateZipMatch = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    
    if (!cityStateZipMatch) {
      throw new Error('Could not parse City, State, Zip from: ' + cityStateZip);
    }
    
    const city = cityStateZipMatch[1].trim();
    const state = cityStateZipMatch[2].trim();
    const zip = cityStateZipMatch[3].trim();
    
    // Phone is usually the last part
    const phone = parts[parts.length - 1];
    
    return {
      name,
      streetAddress,
      city,
      state,
      zip,
      phone
    };
  }
  
  // Fill shipping form button
  fillFormBtn.addEventListener('click', async () => {
    try {
      const shippingText = shippingInput.value.trim();
      
      if (!shippingText) {
        showStatus('⚠️ Please paste shipping info first', 'error');
        return;
      }
      
      // Parse the shipping data
      let shippingData;
      try {
        shippingData = parseShippingInfo(shippingText);
      } catch (error) {
        showStatus('❌ ' + error.message, 'error');
        return;
      }
      
      showStatus('🔄 Filling form...', 'success');
      fillFormBtn.disabled = true;
      fillFormBtn.textContent = '⏳ Filling...';
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on a B2B page
      if (!isB2BPage(tab.url)) {
        showStatus('Please navigate to a B2B order form first', 'error');
        resetFillFormButton();
        return;
      }
      
      // Send message to content script to fill the form
      chrome.tabs.sendMessage(tab.id, { 
        action: 'fillShippingForm',
        data: shippingData
      }, (response) => {
        resetFillFormButton();
        
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message || 'Content script not responding';
          showStatus(`Script error: ${errorMessage}. Try refreshing the page.`, 'error');
          console.error('Chrome runtime error:', chrome.runtime.lastError);
        } else if (response && response.success) {
          showStatus('✅ Form filled successfully!', 'success');
        } else if (response && response.error) {
          showStatus(`❌ ${response.error}`, 'error');
        } else {
          showStatus('❌ Could not fill form. Make sure you\'re on the order form page.', 'error');
        }
      });
      
    } catch (error) {
      resetFillFormButton();
      console.error('Fill form error:', error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
  
  function resetFillFormButton() {
    fillFormBtn.disabled = false;
    fillFormBtn.textContent = 'Auto-Fill Form';
  }
  
  function isB2BPage(url) {
    const b2bDomains = [
      'backstage.on-running.com',
      'b2b.on-running.com', 
      'on-running.com/b2b',
      'portal.on-running.com',
      'dealer.on-running.com',
      'wholesale.on-running.com',
      'on-running.com'
    ];
    
    return b2bDomains.some(domain => url.includes(domain));
  }
  
  // Check for stored shipping data from Shopify
  chrome.storage.local.get(['shippingData', 'timestamp'], (result) => {
    if (result.shippingData) {
      // Auto-populate the textarea
      shippingInput.value = result.shippingData;
      
      // Show when it was copied
      const timestamp = result.timestamp;
      const now = Date.now();
      const minutesAgo = Math.floor((now - timestamp) / 1000 / 60);
      
      let timeText = 'just now';
      if (minutesAgo > 0) {
        timeText = minutesAgo === 1 ? '1 minute ago' : `${minutesAgo} minutes ago`;
      }
      
      showStatus(`✅ Shopify data loaded (copied ${timeText})`, 'success');
    }
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
        
        if (currentTab.url.includes('admin.shopify.com')) {
          if (currentTab.url.includes('/orders/')) {
            showStatus('📦 Shopify order page - Click "Copy for B2B Form" button', 'success');
          } else {
            showStatus('Navigate to a Shopify order to copy shipping data', '');
          }
        } else if (isB2BPage(currentTab.url)) {
          if (currentTab.url.includes('orders/create') || currentTab.url.includes('order-details')) {
            showStatus('✅ B2B order form detected - Ready to fill!', 'success');
          } else {
            showStatus('✅ B2B portal detected', 'success');
          }
        } else {
          showStatus('Navigate to Shopify order or B2B form', 'error');
        }
      } else {
        showStatus('Unable to detect current page', 'error');
      }
    });
  }, 100);
});
