// =============================================================================
// B2B SHIPPING FORM FILLER - Multi-Site Support
// =============================================================================
// This extension fills shipping forms on various B2B portals from Shopify data
// Each B2B site has its own configuration section below
// =============================================================================

console.log('B2B Shipping Form Filler loaded');

// =============================================================================
// GENERIC FUNCTIONS (Used by all B2B sites)
// =============================================================================

// Parse shipping info from Shopify format
function parseShippingInfo(text) {
  try {
    const parts = text.split(',').map(s => s.trim());
    
    if (parts.length < 4) {
      console.error('Invalid format - need at least 4 parts');
      return null;
    }
    
    // Format can be:
    // Order page: Name, Address, City State ZIP, Country, Phone (5 parts)
    // Customer page: Name, Address, City State ZIP, Country (4 parts, no phone)
    
    const name = parts[0];
    const streetAddress = parts[1];
    const cityStateZip = parts[2];
    
    // Parse City State ZIP
    const cityStateZipMatch = cityStateZip.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    
    if (!cityStateZipMatch) {
      console.error('Could not parse city/state/zip from:', cityStateZip);
      return null;
    }
    
    const city = cityStateZipMatch[1].trim();
    const state = cityStateZipMatch[2].trim();
    const zip = cityStateZipMatch[3].trim();
    
    // Phone is optional (not present on customer pages)
    // If 5 parts: last is phone
    // If 4 parts: no phone (country is last)
    let phone = '';
    if (parts.length >= 5) {
      // Check if last part looks like a phone number
      const lastPart = parts[parts.length - 1];
      if (lastPart.includes('+') || lastPart.match(/\d{3}[-.)]\d{3}/)) {
        phone = lastPart;
      }
    }
    
    console.log('[Parser] Parsed:', { name, streetAddress, city, state, zip, phone });
    
    return { name, streetAddress, city, state, zip, phone };
  } catch (error) {
    console.error('Parse error:', error);
    return null;
  }
}

// Show notification on page
function showNotification(message, type) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? '#4CAF50' : '#f44336'};
    color: white;
    border-radius: 8px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s ease';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// =============================================================================
// B2B SITE DETECTION
// =============================================================================

// Detect which B2B site we're on
function detectB2BSite() {
  const url = window.location.href;
  
  // ON Running
  if (url.includes('backstage.on-running.com') || 
      url.includes('b2b.on-running.com') ||
      url.includes('on-running.com')) {
    return 'on-running';
  }
  
  // ASICS
  if (url.includes('asics.com') || 
      url.includes('asicstiger.com')) {
    return 'asics';
  }
  
  // Brooks
  if (url.includes('brooks.com') || 
      url.includes('brooksrunning.com')) {
    return 'brooks';
  }
  
  // HOKA
  if (url.includes('hokaus.deckersb2b.deckers.com') || 
      url.includes('deckersb2b.deckers.com')) {
    return 'hoka';
  }
  
  // PUMA
  if (url.includes('pumab2b.com')) {
    return 'puma';
  }
  
  return null;
}

// Check if we're on an order form page
function isOrderFormPage(site) {
  switch(site) {
    case 'on-running':
      return document.querySelector('#delivery_name') || 
             document.querySelector('#street_address') ||
             document.querySelector('#customer_po_number') ||
             window.location.href.includes('orders/create');
    
    case 'asics':
      // Check for PO field (always on checkout page) or modal form fields
      return document.querySelector('#purchase-order-number-1') ||
             document.querySelector('#name') || 
             document.querySelector('#address1') ||
             window.location.href.includes('/checkout') ||
             window.location.href.includes('/orders/');
    
    case 'brooks':
      return document.querySelector('#recipientName') ||
             document.querySelector('#recipientAddress') ||
             window.location.href.includes('/basket/') ||
             window.location.href.includes('drop-ship') ||
             window.location.href.includes('order');
    
    case 'hoka':
      return document.querySelector('input[name="districtInfo.firstName"]') ||
             document.querySelector('input[name="form.PurchaseOrderOfAsap"]') ||
             window.location.href.includes('shoppingCar') ||
             window.location.href.includes('order-center');
    
    case 'puma':
      // PUMA loads dynamically with Dojo and uses various URLs
      console.log('[DEBUG PUMA] Checking for order form elements...');
      
      // Check for order form elements first (most reliable)
      const hasDropShip = document.querySelector('.dropShipDisplay');
      const hasBtn = document.querySelector('.btnDropShip');
      const hasPoNumber = document.querySelector('.poNumber');
      
      console.log('[DEBUG PUMA] .dropShipDisplay:', hasDropShip);
      console.log('[DEBUG PUMA] .btnDropShip:', hasBtn);
      console.log('[DEBUG PUMA] .poNumber:', hasPoNumber);
      
      if (hasDropShip || hasBtn || hasPoNumber) {
        console.log('[DEBUG PUMA] Elements found! This is an order page.');
        return true;
      }
      
      // Fallback: Check URL patterns
      console.log('[DEBUG PUMA] Elements not found, checking URL...');
      console.log('[DEBUG PUMA] URL:', window.location.href);
      console.log('[DEBUG PUMA] Includes checkout:', window.location.href.includes('checkout'));
      console.log('[DEBUG PUMA] Includes builder,cart:', window.location.href.includes('builder,cart'));
      
      if (window.location.href.includes('checkout') || 
          window.location.href.includes('builder,cart')) {
        console.log('[DEBUG PUMA] URL check PASSED!');
        return true;
      }
      
      console.log('[DEBUG PUMA] Not an order page');
      return false;
    
    default:
      return false;
  }
}

// =============================================================================
// FLOATING BUTTONS - MAIN INTERFACE
// =============================================================================

function init() {
  // Check multiple times to catch dynamically loaded content
  setTimeout(addFloatingButtons, 1000);
  setTimeout(addFloatingButtons, 2000);
  setTimeout(addFloatingButtons, 3000);
  setTimeout(addFloatingButtons, 4000);
  setTimeout(addFloatingButtons, 5000);
  setTimeout(addFloatingButtons, 7000);
  setTimeout(addFloatingButtons, 10000);
  
  // Also watch for DOM changes (for SPAs like PUMA)
  const observer = new MutationObserver(() => {
    addFloatingButtons();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function addFloatingButtons() {
  const site = detectB2BSite();
  console.log('[DEBUG] detectB2BSite returned:', site);
  console.log('[DEBUG] Current URL:', window.location.href);
  
  if (!site) {
    console.log('Not on a supported B2B site');
    return;
  }
  
  const isOrderForm = isOrderFormPage(site);
  console.log('[DEBUG] isOrderFormPage returned:', isOrderForm);
  
  if (!isOrderForm) {
    console.log('Not on order form page');
    return;
  }
  
  if (document.querySelector('#b2b-buttons-container')) {
    return; // Already added
  }
  
  chrome.storage.local.get(['shippingData', 'poNumber', 'email', 'timestamp'], (result) => {
    console.log('[B2B Site] Checking storage:', result);
    
    if (!result.shippingData) {
      console.log('[B2B Site] No shipping data found in storage');
      return;
    }
    
    console.log('[B2B Site] Found shipping data:', result.shippingData);
    
    const container = document.createElement('div');
    container.id = 'b2b-buttons-container';
    container.style.cssText = `
      position: fixed;
      top: 50%;
      right: 20px;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 10000;
      transition: right 0.3s ease;
    `;
    
    // Create toggle button (hide/show) - visible X
    const toggleButton = document.createElement('button');
    toggleButton.id = 'b2b-toggle-btn';
    toggleButton.innerHTML = '×';
    toggleButton.title = 'Hide buttons';
    toggleButton.style.cssText = `
      background: white;
      color: #667eea;
      border: 2px solid #667eea;
      padding: 2px 6px;
      border-radius: 6px;
      font-size: 20px;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      transition: all 0.2s ease;
      position: absolute;
      top: -10px;
      right: 0px;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    toggleButton.onmouseover = () => {
      toggleButton.style.background = '#667eea';
      toggleButton.style.color = 'white';
      toggleButton.style.transform = 'scale(1.1)';
    };
    
    toggleButton.onmouseout = () => {
      toggleButton.style.background = 'white';
      toggleButton.style.color = '#667eea';
      toggleButton.style.transform = 'scale(1)';
    };
    
    let isHidden = false;
    
    toggleButton.onclick = () => {
      isHidden = !isHidden;
      
      if (isHidden) {
        // Hide buttons
        Array.from(container.children).forEach(child => {
          if (child.id !== 'b2b-toggle-btn') {
            child.style.display = 'none';
          }
        });
        toggleButton.innerHTML = '↻';
        toggleButton.title = 'Show buttons';
      } else {
        // Show buttons
        Array.from(container.children).forEach(child => {
          if (child.id !== 'b2b-toggle-btn') {
            child.style.display = '';
          }
        });
        toggleButton.innerHTML = '×';
        toggleButton.title = 'Hide buttons';
      }
    };
    
    container.appendChild(toggleButton);
    
    // Keyboard shortcut: Ctrl+Shift+H to toggle
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        toggleButton.click();
      }
    });
    
    // ASICS gets TWO buttons: Combined fill + Email copy
    if (site === 'asics') {
      const combinedButton = createCombinedButton(site, result);
      container.appendChild(combinedButton);
      
      const emailButton = createEmailCopyButton(result);
      container.appendChild(emailButton);
    } 
    // All other sites get ONE combined button (shipping + PO)
    else {
      const combinedButton = createCombinedButton(site, result);
      container.appendChild(combinedButton);
    }
    
    document.body.appendChild(container);
    console.log(`Buttons added for: ${site}`);
  });
}

// Create shipping address button
function createShippingButton(site, result) {
  const button = document.createElement('button');
  button.id = 'b2b-shipping-btn';
  button.innerHTML = `
    <div style="line-height: 1.3;">
      <div style="font-weight: 600;">Fill Shipping</div>
      <div style="font-size: 11px; opacity: 0.85;">Address Fields</div>
    </div>
  `;
  
  // UNIFIED MODERN DESIGN
  button.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 14px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 170px;
    text-align: center;
  `;
  
  button.onmouseover = () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.5)';
  };
  
  button.onmouseout = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
  };
  
  button.onclick = () => {
    const shippingData = parseShippingInfo(result.shippingData);
    const email = result.email || '';
    
    console.log('[Shipping Button] Email from storage:', email);
    console.log('[Shipping Button] Full result:', result);
    
    if (!shippingData) {
      showNotification('Error parsing shipping data', 'error');
      return;
    }
    
    button.disabled = true;
    button.style.opacity = '0.6';
    button.textContent = 'Filling...';
    
    // Call site-specific fill function
    fillShipping(site, shippingData, email, (success) => {
      if (success) {
        button.textContent = 'Filled!';
        button.style.background = '#4CAF50';
        
        setTimeout(() => {
          button.disabled = false;
          button.style.opacity = '1';
          button.innerHTML = `
            <div style="line-height: 1.3;">
              <div style="font-weight: 600;">Fill Shipping</div>
              <div style="font-size: 11px; opacity: 0.85;">Address Fields</div>
            </div>
          `;
          button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, 2000);
      } else {
        button.textContent = 'Error';
        button.style.background = '#f44336';
        
        setTimeout(() => {
          button.disabled = false;
          button.style.opacity = '1';
          button.innerHTML = `
            <div style="line-height: 1.3;">
              <div style="font-weight: 600;">Fill Shipping</div>
              <div style="font-size: 11px; opacity: 0.85;">Address Fields</div>
            </div>
          `;
          button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, 2000);
      }
    });
  };
  
  return button;
}

// Create PO number button
function createPOButton(site, result) {
  const poNumber = result.poNumber || '';
  
  const button = document.createElement('button');
  button.id = 'b2b-po-btn';
  button.innerHTML = `
    <div style="line-height: 1.3;">
      <div style="font-weight: 600;">Fill PO</div>
      <div style="font-size: 11px; opacity: 0.85;">${poNumber || 'No PO'}</div>
    </div>
  `;
  
  // UNIFIED MODERN DESIGN
  button.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 14px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 170px;
    text-align: center;
  `;
  
  button.onmouseover = () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.5)';
  };
  
  button.onmouseout = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
  };
  
  button.onclick = () => {
    if (!poNumber) {
      showNotification('No PO number found', 'error');
      return;
    }
    
    button.disabled = true;
    button.style.opacity = '0.6';
    button.textContent = 'Filling...';
    
    // Call site-specific fill function
    fillPO(site, poNumber, (success) => {
      if (success) {
        button.textContent = 'Filled!';
        button.style.background = '#4CAF50';
        
        setTimeout(() => {
          button.disabled = false;
          button.style.opacity = '1';
          button.innerHTML = `
            <div style="line-height: 1.3;">
              <div style="font-weight: 600;">Fill PO</div>
              <div style="font-size: 11px; opacity: 0.85;">${poNumber}</div>
            </div>
          `;
          button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, 2000);
      } else {
        button.textContent = 'Error';
        button.style.background = '#f44336';
        
        setTimeout(() => {
          button.disabled = false;
          button.style.opacity = '1';
          button.innerHTML = `
            <div style="line-height: 1.3;">
              <div style="font-weight: 600;">Fill PO</div>
              <div style="font-size: 11px; opacity: 0.85;">${poNumber}</div>
            </div>
          `;
          button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }, 2000);
      }
    });
  };
  
  return button;
}

// Create combined button for ASICS (fills shipping + PO in one click)
function createCombinedButton(site, result) {
  const poNumber = result.poNumber || '';
  
  const buttonText = {
    'asics': 'Fill ASICS Order',
    'on-running': 'Fill ON Order',
    'hoka': 'Fill HOKA Order',
    'puma': 'Fill PUMA Order',
    'brooks': 'Fill Brooks Order'
  }[site] || 'Fill Order';
  
  const button = document.createElement('button');
  button.id = 'b2b-combined-btn';
  button.innerHTML = `
    <div style="line-height: 1.3;">
      <div style="font-weight: 600;">${buttonText}</div>
      <div style="font-size: 11px; opacity: 0.85;">Address + PO: ${poNumber}</div>
    </div>
  `;
  
  // UNIFIED MODERN DESIGN - Same for all sites
  button.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 14px 18px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 170px;
    text-align: center;
  `;
  
  button.onmouseover = () => {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 25px rgba(102, 126, 234, 0.5)';
  };
  
  button.onmouseout = () => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)';
  };
  
  button.onclick = () => {
    const shippingData = parseShippingInfo(result.shippingData);
    const email = result.email || '';
    
    console.log(`[Combined Button] Starting ${site} fill - Shipping${poNumber ? ' + PO' : ' only'}`);
    
    if (!shippingData) {
      showNotification('Error parsing shipping data', 'error');
      return;
    }
    
    // Note: PO number is optional (customer pages don't have it)
    const hasPO = poNumber && poNumber.length > 0;
    
    button.disabled = true;
    button.style.opacity = '0.6';
    button.textContent = 'Filling...';
    
    // First fill shipping
    fillShipping(site, shippingData, email, (shippingSuccess) => {
      if (shippingSuccess) {
        // Then fill PO if we have one
        if (hasPO) {
          fillPO(site, poNumber, (poSuccess) => {
            if (poSuccess) {
              button.textContent = 'All Filled!';
              button.style.background = '#4CAF50';
              button.style.color = 'white';
              
              setTimeout(() => {
                button.disabled = false;
                button.style.opacity = '1';
                button.innerHTML = `
                  <div style="line-height: 1.3;">
                    <div style="font-weight: 600;">${buttonText}</div>
                    <div style="font-size: 11px; opacity: 0.85;">Address + PO: ${poNumber}</div>
                  </div>
                `;
                button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                button.style.color = 'white';
              }, 2000);
            } else {
              button.textContent = 'PO Failed';
              button.style.background = '#f44336';
            button.style.color = 'white';
            
            setTimeout(() => {
              button.disabled = false;
              button.style.opacity = '1';
              button.innerHTML = `
                <div style="line-height: 1.3;">
                  <div style="font-weight: 600;">${buttonText}</div>
                  <div style="font-size: 11px; opacity: 0.85;">Address + PO: ${poNumber}</div>
                </div>
              `;
              button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
              button.style.color = 'white';
            }, 2000);
          }
        });
        } else {
          // No PO number (customer page) - just show shipping success
          button.textContent = 'Address Filled!';
          button.style.background = '#4CAF50';
          button.style.color = 'white';
          
          setTimeout(() => {
            button.disabled = false;
            button.style.opacity = '1';
            button.innerHTML = `
              <div style="line-height: 1.3;">
                <div style="font-weight: 600;">${buttonText}</div>
                <div style="font-size: 11px; opacity: 0.85;">Address only (no PO)</div>
              </div>
            `;
            button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            button.style.color = 'white';
          }, 2000);
        }
      } else {
        button.textContent = 'Shipping Failed';
        button.style.background = '#f44336';
        button.style.color = 'white';
        
        setTimeout(() => {
          button.disabled = false;
          button.style.opacity = '1';
          button.innerHTML = `
            <div style="line-height: 1.3;">
              <div style="font-weight: 600;">${buttonText}</div>
              <div style="font-size: 11px; opacity: 0.85;">Address + PO: ${poNumber}</div>
            </div>
          `;
          button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
          button.style.color = 'white';
        }, 2000);
      }
    });
  };
  
  return button;
}

// Create email copy button for ASICS (copies email to clipboard)
function createEmailCopyButton(result) {
  const email = result.email || 'needham@therunhouse.com';
  
  const button = document.createElement('button');
  button.id = 'b2b-email-btn';
  button.innerHTML = `
    <div style="line-height: 1.3;">
      <div style="font-weight: 500;">Copy Email</div>
      <div style="font-size: 10px; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${email}</div>
    </div>
  `;
  
  // UNIFIED SECONDARY BUTTON DESIGN
  button.style.cssText = `
    background: linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%);
    color: #667eea;
    border: 2px solid #667eea;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 170px;
    text-align: center;
  `;
  
  button.onmouseover = () => {
    button.style.background = 'linear-gradient(135deg, #e8eef5 0%, #dce4f0 100%)';
    button.style.transform = 'translateY(-1px)';
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.2)';
  };
  
  button.onmouseout = () => {
    button.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%)';
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.15)';
  };
  
  button.onclick = () => {
    navigator.clipboard.writeText(email).then(() => {
      const originalHTML = button.innerHTML;
      button.innerHTML = `
        <div style="line-height: 1.3;">
          <div style="font-weight: 500;">Copied!</div>
          <div style="font-size: 9px; opacity: 0.7;">Paste in email field</div>
        </div>
      `;
      button.style.background = '#4CAF50';
      button.style.color = 'white';
      button.style.border = '1px solid #4CAF50';
      
      setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.background = 'linear-gradient(135deg, #f5f7fa 0%, #e8eef5 100%)';
        button.style.color = '#667eea';
        button.style.border = '2px solid #667eea';
      }, 2000);
      
      showNotification(`Email copied: ${email}`, 'success');
    }).catch(err => {
      console.error('Failed to copy email:', err);
      showNotification('Failed to copy email', 'error');
    });
  };
  
  return button;
}

// =============================================================================
// SITE-SPECIFIC FILL FUNCTIONS
// =============================================================================

// Route to correct fill function based on site
function fillShipping(site, data, email, callback) {
  switch(site) {
    case 'on-running':
      fillShipping_ONRunning(data, email, callback);
      break;
    
    case 'asics':
      fillShipping_ASICS(data, email, callback);
      break;
    
    case 'brooks':
      fillShipping_Brooks(data, email, callback);
      break;
    
    case 'hoka':
      fillShipping_HOKA(data, email, callback);
      break;
    
    case 'puma':
      fillShipping_PUMA(data, email, callback);
      break;
    
    default:
      callback(false);
  }
}

function fillPO(site, poNumber, callback) {
  switch(site) {
    case 'on-running':
      fillPO_ONRunning(poNumber, callback);
      break;
    
    case 'asics':
      fillPO_ASICS(poNumber, callback);
      break;
    
    case 'brooks':
      fillPO_Brooks(poNumber, callback);
      break;
    
    case 'hoka':
      fillPO_HOKA(poNumber, callback);
      break;
    
    case 'puma':
      fillPO_PUMA(poNumber, callback);
      break;
    
    default:
      callback(false);
  }
}

// =============================================================================
// ON RUNNING - SPECIFIC IMPLEMENTATION
// =============================================================================

function fillShipping_ONRunning(data, email, callback) {
  try {
    console.log('[ON Running] Filling shipping fields');
    
    setTimeout(() => {
      let filledFields = 0;
      
      // Name
      const nameField = document.querySelector('#delivery_name');
      if (nameField) {
        nameField.value = data.name;
        nameField.classList.remove('hidden');
        nameField.dispatchEvent(new Event('input', { bubbles: true }));
        nameField.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields++;
      }
      
      // Street Address
      const streetField = document.querySelector('#street_address');
      if (streetField) {
        streetField.value = data.streetAddress;
        streetField.classList.remove('hidden');
        streetField.dispatchEvent(new Event('input', { bubbles: true }));
        streetField.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields++;
      }
      
      // City
      const cityField = document.querySelector('#city');
      if (cityField) {
        cityField.value = data.city;
        cityField.classList.remove('hidden');
        cityField.dispatchEvent(new Event('input', { bubbles: true }));
        cityField.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields++;
      }
      
      // Zip/Postcode
      const zipField = document.querySelector('#post_code');
      if (zipField) {
        zipField.value = data.zip;
        zipField.classList.remove('hidden');
        zipField.dispatchEvent(new Event('input', { bubbles: true }));
        zipField.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields++;
      }
      
      // State dropdown
      const stateField = document.querySelector('select[name="state"]');
      if (stateField) {
        stateField.value = data.state;
        stateField.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields++;
      }
      
      if (filledFields > 0) {
        showNotification(`Shipping filled: ${filledFields} fields`, 'success');
        callback(true);
      } else {
        showNotification('Could not find shipping fields', 'error');
        callback(false);
      }
    }, 500);
    
  } catch (error) {
    console.error('[ON Running] Error:', error);
    showNotification('Error filling shipping', 'error');
    callback(false);
  }
}

function fillPO_ONRunning(poNumber, callback) {
  try {
    console.log('[ON Running] Filling PO:', poNumber);
    
    setTimeout(() => {
      const poField = document.querySelector('#customer_po_number');
      if (poField) {
        poField.value = poNumber;
        poField.classList.remove('hidden');
        poField.dispatchEvent(new Event('input', { bubbles: true }));
        poField.dispatchEvent(new Event('change', { bubbles: true }));
        showNotification(`PO filled: ${poNumber}`, 'success');
        callback(true);
      } else {
        showNotification('Could not find PO field', 'error');
        callback(false);
      }
    }, 500);
    
  } catch (error) {
    console.error('[ON Running] Error:', error);
    showNotification('Error filling PO', 'error');
    callback(false);
  }
}

// =============================================================================
// ASICS - SPECIFIC IMPLEMENTATION
// =============================================================================

function fillShipping_ASICS(data, email, callback) {
  try {
    console.log('[ASICS] Filling shipping fields');
    
    // Check if modal is open (fields exist)
    const nameField = document.querySelector('#name');
    if (!nameField) {
      showNotification('Please open the shipping address modal first', 'error');
      callback(false);
      return;
    }
    
    // ASICS Values - Keep it simple with placeholders
    const defaultEmail = 'needham@therunhouse.com';
    const defaultPhone = '7814001327'; // Numbers only
    
    console.log('[ASICS] Using email:', defaultEmail, 'phone:', defaultPhone);
    
    // Helper function to simulate typing (character by character)
    const simulateTyping = async (field, value, fieldName) => {
      if (!field) {
        console.log(`[ASICS] ${fieldName} field NOT found!`);
        return false;
      }
      
      console.log(`[ASICS] ${fieldName} field found, filling with:`, value);
      
      // Clear field first
      field.value = '';
      field.focus();
      field.dispatchEvent(new Event('focus', { bubbles: true }));
      
      // Type character by character with small delays
      for (let i = 0; i < value.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        field.value = value.substring(0, i + 1);
        field.dispatchEvent(new KeyboardEvent('keydown', { key: value[i], bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keypress', { key: value[i], bubbles: true }));
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keyup', { key: value[i], bubbles: true }));
      }
      
      // Final events
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
      
      console.log(`[ASICS] ${fieldName} filled, value is now:`, field.value);
      return true;
    };
    
    // Helper for non-typed fields (address, city, etc)
    const fillField = (selector, value, fieldName) => {
      const field = document.querySelector(selector);
      if (!field) {
        console.log(`[ASICS] ${fieldName} field NOT found!`);
        return false;
      }
      
      console.log(`[ASICS] ${fieldName} field found, filling with:`, value);
      field.focus();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
      console.log(`[ASICS] ${fieldName} filled, value is now:`, field.value);
      return true;
    };
    
    // Wait for modal to be fully loaded
    setTimeout(async () => {
      let filledFields = 0;
      
      // Fill regular fields first
      if (fillField('#name', data.name, 'Name')) filledFields++;
      if (fillField('#address1', data.streetAddress, 'Address')) filledFields++;
      if (fillField('#city', data.city, 'City')) filledFields++;
      if (fillField('#postcode', data.zip, 'Postal Code')) filledFields++;
      
      // State dropdown
      const stateField = document.querySelector('#main-division');
      if (stateField) {
        stateField.value = data.state;
        stateField.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields++;
      }
      
      console.log('[ASICS] Total fields filled:', filledFields);
      
      // Simple direct fill for email and phone
      setTimeout(() => {
        const emailField = document.querySelector('#email');
        const phoneField = document.querySelector('#phone');
        
        console.log('[ASICS] Email field:', emailField);
        console.log('[ASICS] Phone field:', phoneField);
        
        // Just fill them directly - keep it simple
        if (phoneField) {
          phoneField.value = defaultPhone;
          phoneField.dispatchEvent(new Event('input', { bubbles: true }));
          phoneField.dispatchEvent(new Event('change', { bubbles: true }));
          console.log('[ASICS] Phone set to:', phoneField.value);
        }
        
        // Skip email for now - just fill the phone
        // if (emailField) {
        //   emailField.value = defaultEmail;
        //   emailField.dispatchEvent(new Event('input', { bubbles: true }));
        //   emailField.dispatchEvent(new Event('change', { bubbles: true }));
        //   console.log('[ASICS] Email set to:', emailField.value);
        // }
        
        if (filledFields > 0) {
          showNotification(`ASICS shipping filled: ${filledFields} fields`, 'success');
          callback(true);
        } else {
          showNotification('Could not find ASICS shipping fields', 'error');
          callback(false);
        }
      }, 200);
      
    }, 300);
    
  } catch (error) {
    console.error('[ASICS] Error:', error);
    showNotification('Error filling ASICS shipping', 'error');
    callback(false);
  }
}

function fillPO_ASICS(poNumber, callback) {
  try {
    console.log('[ASICS] Filling PO:', poNumber);
    
    setTimeout(() => {
      const poField = document.querySelector('#purchase-order-number-1');
      if (poField) {
        poField.value = poNumber;
        poField.dispatchEvent(new Event('input', { bubbles: true }));
        poField.dispatchEvent(new Event('change', { bubbles: true }));
        showNotification(`ASICS PO filled: ${poNumber}`, 'success');
        callback(true);
      } else {
        showNotification('Could not find ASICS PO field', 'error');
        callback(false);
      }
    }, 500);
    
  } catch (error) {
    console.error('[ASICS] Error:', error);
    showNotification('Error filling ASICS PO', 'error');
    callback(false);
  }
}

// =============================================================================
// BROOKS RUNNING - SPECIFIC IMPLEMENTATION
// =============================================================================

function fillShipping_Brooks(data, email, callback) {
  try {
    console.log('[Brooks] Filling shipping fields');
    
    // Check if modal is open (fields exist)
    const nameField = document.querySelector('#recipientName');
    if (!nameField) {
      showNotification('Please open the drop-ship form first', 'error');
      callback(false);
      return;
    }
    
    // Brooks Values - USE REAL EMAIL FROM SHOPIFY
    const defaultPhone = '(781) 400-1327'; // Still use placeholder for phone
    const customerEmail = email || 'needham@therunhouse.com'; // Use real email, fallback to placeholder
    
    console.log('[Brooks] Using email:', customerEmail, 'phone:', defaultPhone);
    
    // Helper function to simulate typing (character by character) for Angular
    const simulateTyping = async (field, value, fieldName) => {
      if (!field) {
        console.log(`[Brooks] ${fieldName} field NOT found!`);
        return false;
      }
      
      console.log(`[Brooks] ${fieldName} field found, filling with:`, value);
      
      // Clear field first
      field.value = '';
      field.focus();
      field.dispatchEvent(new Event('focus', { bubbles: true }));
      
      // Type character by character
      for (let i = 0; i < value.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        field.value = value.substring(0, i + 1);
        field.dispatchEvent(new KeyboardEvent('keydown', { key: value[i], bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keypress', { key: value[i], bubbles: true }));
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keyup', { key: value[i], bubbles: true }));
      }
      
      // Final events
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
      
      console.log(`[Brooks] ${fieldName} filled, value is now:`, field.value);
      return true;
    };
    
    // Helper for non-typed fields
    const fillField = (selector, value, fieldName) => {
      const field = document.querySelector(selector);
      if (!field) {
        console.log(`[Brooks] ${fieldName} field NOT found!`);
        return false;
      }
      
      console.log(`[Brooks] ${fieldName} field found, filling with:`, value);
      field.focus();
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('blur', { bubbles: true }));
      console.log(`[Brooks] ${fieldName} filled, value is now:`, field.value);
      return true;
    };
    
    setTimeout(async () => {
      let filledFields = 0;
      
      // Fill regular fields
      if (fillField('#recipientName', data.name, 'Recipient Name')) filledFields++;
      if (fillField('#recipientAddress', data.streetAddress, 'Recipient Address')) filledFields++;
      if (fillField('#city', data.city, 'City')) filledFields++;
      if (fillField('#zip', data.zip, 'Postal Code')) filledFields++;
      
      // State dropdown
      const stateField = document.querySelector('#countryState');
      if (stateField) {
        stateField.value = data.state;
        stateField.dispatchEvent(new Event('change', { bubbles: true }));
        filledFields++;
      }
      
      console.log('[Brooks] Total fields filled:', filledFields);
      
      // Now tackle email and phone with typing simulation
      setTimeout(async () => {
        const emailField = document.querySelector('#recipientEmail');
        const phoneField = document.querySelector('#recipientPhone');
        
        if (emailField) {
          await simulateTyping(emailField, customerEmail, 'Recipient Email');
        }
        
        if (phoneField) {
          await simulateTyping(phoneField, defaultPhone, 'Recipient Phone');
        }
        
        if (filledFields > 0) {
          showNotification(`Brooks shipping filled: ${filledFields} fields`, 'success');
          callback(true);
        } else {
          showNotification('Could not find Brooks shipping fields', 'error');
          callback(false);
        }
      }, 200);
      
    }, 300);
    
  } catch (error) {
    console.error('[Brooks] Error:', error);
    showNotification('Error filling Brooks shipping', 'error');
    callback(false);
  }
}

function fillPO_Brooks(poNumber, callback) {
  try {
    console.log('[Brooks] Filling PO:', poNumber);
    
    setTimeout(() => {
      // Brooks PO: Click the span with the existing PO number text
      const poSpan = document.querySelector('epc-client-reference-number-popup span.text-muted');
      
      if (poSpan) {
        console.log('[Brooks] Found PO span with text:', poSpan.textContent.trim());
        console.log('[Brooks] Clicking span to open input...');
        
        // Click the span to reveal the input field
        poSpan.click();
        
        // Wait for the input field to appear
        setTimeout(() => {
          // Look for input with placeholder "Custom order reference"
          const poInput = document.querySelector('input[placeholder="Custom order reference"]');
          
          console.log('[Brooks] Looking for input with placeholder "Custom order reference"');
          console.log('[Brooks] Found input:', poInput);
          
          if (poInput) {
            console.log('[Brooks] PO input field found! Filling with:', poNumber);
            
            // Clear and fill
            poInput.value = '';
            poInput.focus();
            poInput.value = poNumber;
            
            // Trigger Angular events
            poInput.dispatchEvent(new Event('input', { bubbles: true }));
            poInput.dispatchEvent(new Event('change', { bubbles: true }));
            poInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
            poInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
            poInput.dispatchEvent(new Event('blur', { bubbles: true }));
            
            console.log('[Brooks] PO input value after filling:', poInput.value);
            showNotification(`Brooks PO filled: ${poNumber}`, 'success');
            callback(true);
          } else {
            console.log('[Brooks] ERROR: PO input field not found after clicking span');
            console.log('[Brooks] All inputs on page:', document.querySelectorAll('input'));
            showNotification('PO input not found - click the PO text manually first', 'error');
            callback(false);
          }
        }, 800); // Wait 800ms for input to appear
        
      } else {
        console.log('[Brooks] ERROR: PO span not found');
        console.log('[Brooks] Looking for: epc-client-reference-number-popup span.text-muted');
        showNotification('Brooks PO span not found on page', 'error');
        callback(false);
      }
    }, 500);
    
  } catch (error) {
    console.error('[Brooks] Error filling PO:', error);
    showNotification('Error filling Brooks PO', 'error');
    callback(false);
  }
}

// =============================================================================
// HOKA - SPECIFIC IMPLEMENTATION
// =============================================================================

// State code to full name mapping for HOKA dropdown
const STATE_NAMES = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'DC': 'Washington DC',
  'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
};

function fillShipping_HOKA(data, email, callback) {
  try {
    console.log('[HOKA] Filling shipping fields');
    
    setTimeout(() => {
      let filledFields = 0;
      
      // Split full name into first and last
      const nameParts = data.name.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ') || nameParts[0];
      
      // First Name
      const firstNameField = document.querySelector('input[name="districtInfo.firstName"]');
      if (firstNameField) {
        firstNameField.value = firstName;
        firstNameField.dispatchEvent(new Event('input', { bubbles: true }));
        firstNameField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[HOKA] First name filled:', firstName);
        filledFields++;
      }
      
      // Last Name
      const lastNameField = document.querySelector('input[name="districtInfo.lastName"]');
      if (lastNameField) {
        lastNameField.value = lastName;
        lastNameField.dispatchEvent(new Event('input', { bubbles: true }));
        lastNameField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[HOKA] Last name filled:', lastName);
        filledFields++;
      }
      
      // Phone
      const phoneField = document.querySelector('input[name="districtInfo.phone"]');
      if (phoneField) {
        phoneField.value = data.phone;
        phoneField.dispatchEvent(new Event('input', { bubbles: true }));
        phoneField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[HOKA] Phone filled:', data.phone);
        filledFields++;
      }
      
      // Street 1
      const street1Field = document.querySelector('input[name="districtInfo.street1"]');
      if (street1Field) {
        street1Field.value = data.streetAddress;
        street1Field.dispatchEvent(new Event('input', { bubbles: true }));
        street1Field.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[HOKA] Street 1 filled:', data.streetAddress);
        filledFields++;
      }
      
      // City
      const cityField = document.querySelector('input[name="districtInfo.city"]');
      if (cityField) {
        cityField.value = data.city;
        cityField.dispatchEvent(new Event('input', { bubbles: true }));
        cityField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[HOKA] City filled:', data.city);
        filledFields++;
      }
      
      // State - dropdown (need to click the item with full state name)
      const stateName = STATE_NAMES[data.state];
      if (stateName) {
        // Find and click the state dropdown item
        const stateItems = document.querySelectorAll('.el-select-dropdown__item span');
        for (const item of stateItems) {
          if (item.textContent.trim() === stateName) {
            item.closest('.el-select-dropdown__item').click();
            console.log('[HOKA] State selected:', stateName);
            filledFields++;
            break;
          }
        }
      }
      
      // ZIP
      const zipField = document.querySelector('input[name="districtInfo.zip"]');
      if (zipField) {
        zipField.value = data.zip;
        zipField.dispatchEvent(new Event('input', { bubbles: true }));
        zipField.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[HOKA] ZIP filled:', data.zip);
        filledFields++;
      }
      
      if (filledFields > 0) {
        console.log('[HOKA] All shipping fields filled, waiting for Save button...');
        
        // Wait for Save button to become enabled and click it
        setTimeout(() => {
          const saveButton = document.querySelector('button[btn-id="clickSubmitOrderSetting"]');
          
          if (saveButton) {
            console.log('[HOKA] Found Save button');
            
            // Check if button is enabled (not disabled)
            if (!saveButton.disabled && !saveButton.classList.contains('is-disabled')) {
              console.log('[HOKA] Save button is enabled, clicking...');
              saveButton.click();
              
              // Wait for save to complete before proceeding to PO
              setTimeout(() => {
                console.log('[HOKA] Save completed, ready for PO');
                showNotification(`HOKA shipping saved: ${filledFields} fields`, 'success');
                callback(true);
              }, 1000); // Wait 1 second for save to process
              
            } else {
              console.log('[HOKA] Save button still disabled, clicking anyway...');
              // Remove disabled attributes and click
              saveButton.disabled = false;
              saveButton.classList.remove('is-disabled');
              saveButton.click();
              
              setTimeout(() => {
                console.log('[HOKA] Save completed (forced), ready for PO');
                showNotification(`HOKA shipping saved: ${filledFields} fields`, 'success');
                callback(true);
              }, 1000);
            }
          } else {
            console.log('[HOKA] Save button not found, proceeding anyway');
            showNotification(`HOKA shipping filled: ${filledFields} fields`, 'success');
            callback(true);
          }
        }, 800); // Wait 800ms for button to become enabled
        
      } else {
        showNotification('Could not find HOKA shipping fields', 'error');
        callback(false);
      }
    }, 500);
    
  } catch (error) {
    console.error('[HOKA] Error:', error);
    showNotification('Error filling HOKA shipping', 'error');
    callback(false);
  }
}

function fillPO_HOKA(poNumber, callback) {
  try {
    console.log('[HOKA] Filling PO:', poNumber);
    
    setTimeout(() => {
      const poInput = document.querySelector('input[name="form.PurchaseOrderOfAsap"]');
      
      if (poInput) {
        console.log('[HOKA] PO input found');
        
        // Clear and fill
        poInput.value = '';
        poInput.focus();
        poInput.value = poNumber;
        
        // Trigger Element UI events
        poInput.dispatchEvent(new Event('input', { bubbles: true }));
        poInput.dispatchEvent(new Event('change', { bubbles: true }));
        poInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        console.log('[HOKA] PO filled:', poNumber);
        showNotification(`HOKA PO filled: ${poNumber}`, 'success');
        callback(true);
      } else {
        console.log('[HOKA] ERROR: PO input not found');
        showNotification('HOKA PO field not found', 'error');
        callback(false);
      }
    }, 500);
    
  } catch (error) {
    console.error('[HOKA] Error filling PO:', error);
    showNotification('Error filling HOKA PO', 'error');
    callback(false);
  }
}

// =============================================================================
// PUMA - SPECIFIC IMPLEMENTATION
// =============================================================================

function fillShipping_PUMA(data, email, callback) {
  try {
    console.log('[PUMA] Filling shipping fields');
    
    // First check if drop ship modal is open
    const modal = document.querySelector('.modalDropShip');
    
    if (!modal || !modal.offsetParent) {
      console.log('[PUMA] Drop ship modal not open - looking for Add button...');
      
      // Find and click the Add button to open modal
      const addButtons = document.querySelectorAll('.btnDropShip');
      let addButton = null;
      
      for (const btn of addButtons) {
        if (btn.textContent.includes('Add') && btn.offsetParent) {
          addButton = btn;
          break;
        }
      }
      
      if (addButton) {
        console.log('[PUMA] Found Add button, clicking to open modal...');
        addButton.click();
        
        // Wait for modal to open
        setTimeout(() => {
          fillPUMAShippingFields(data, callback);
        }, 1000);
      } else {
        console.log('[PUMA] Add button not found - modal may already be open or need manual click');
        fillPUMAShippingFields(data, callback);
      }
    } else {
      console.log('[PUMA] Drop ship modal is already open');
      fillPUMAShippingFields(data, callback);
    }
    
  } catch (error) {
    console.error('[PUMA] Error:', error);
    showNotification('Error filling PUMA shipping', 'error');
    callback(false);
  }
}

function fillPUMAShippingFields(data, callback) {
  setTimeout(() => {
    let filledFields = 0;
    
    // Name
    const nameField = document.querySelector('input[name="name"]');
    if (nameField) {
      nameField.value = data.name;
      nameField.dispatchEvent(new Event('input', { bubbles: true }));
      nameField.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[PUMA] Name filled:', data.name);
      filledFields++;
    }
    
    // Address 1
    const address1Field = document.querySelector('input[name="address1"]');
    if (address1Field) {
      address1Field.value = data.streetAddress;
      address1Field.dispatchEvent(new Event('input', { bubbles: true }));
      address1Field.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[PUMA] Address 1 filled:', data.streetAddress);
      filledFields++;
    }
    
    // City
    const cityField = document.querySelector('input[name="city"]');
    if (cityField) {
      cityField.value = data.city;
      cityField.dispatchEvent(new Event('input', { bubbles: true }));
      cityField.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[PUMA] City filled:', data.city);
      filledFields++;
    }
    
    // State - Dojo dropdown (needs special handling)
    const stateWidget = document.querySelector('.state.dijitSelect');
    const stateInput = document.querySelector('input[name="state"]');
    
    if (stateWidget && stateInput) {
      console.log('[PUMA] Setting state to:', data.state);
      
      // Method 1: Try to set the hidden input and update display
      stateInput.value = data.state;
      
      // Update the display label
      const stateLabel = stateWidget.querySelector('.dijitSelectLabel');
      if (stateLabel) {
        // Map state codes to full names for display
        const stateNames = {
          'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
          'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
          'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
          'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
          'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
          'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
          'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
          'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
          'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
          'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
          'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
          'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
          'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
        };
        
        const stateName = stateNames[data.state] || data.state;
        stateLabel.textContent = stateName;
        console.log('[PUMA] State display updated to:', stateName);
      }
      
      // Trigger change events
      stateInput.dispatchEvent(new Event('change', { bubbles: true }));
      stateWidget.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Remove error styling if present
      stateWidget.classList.remove('dijitSelectError', 'dijitValidationTextBoxError', 'dijitError');
      stateWidget.setAttribute('aria-invalid', 'false');
      
      console.log('[PUMA] State filled:', data.state);
      filledFields++;
    }
    
    // ZIP
    const zipField = document.querySelector('input[name="zip"]');
    if (zipField) {
      zipField.value = data.zip;
      zipField.dispatchEvent(new Event('input', { bubbles: true }));
      zipField.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[PUMA] ZIP filled:', data.zip);
      filledFields++;
    }
    
    if (filledFields > 0) {
      console.log('[PUMA] All shipping fields filled, waiting for Save button...');
      
      // Wait for Save button and click it
      setTimeout(() => {
        // Find Save button in the dialog actions
        const saveButtons = document.querySelectorAll('.dijitDialogPaneActionBar .dijitButton');
        let saveButton = null;
        
        for (const btn of saveButtons) {
          if (btn.textContent.includes('Save')) {
            saveButton = btn;
            break;
          }
        }
        
        if (saveButton) {
          console.log('[PUMA] Found Save button, clicking...');
          saveButton.click();
          
          // Wait for save to complete before proceeding to PO
          setTimeout(() => {
            console.log('[PUMA] Save completed, ready for PO');
            showNotification(`PUMA shipping saved: ${filledFields} fields`, 'success');
            callback(true);
          }, 1000); // Wait 1 second for save to process
          
        } else {
          console.log('[PUMA] Save button not found, proceeding anyway');
          showNotification(`PUMA shipping filled: ${filledFields} fields`, 'success');
          callback(true);
        }
      }, 800); // Wait 800ms for button to be available
      
    } else {
      showNotification('Could not find PUMA shipping fields - make sure modal is open', 'error');
      callback(false);
    }
  }, 500);
}

function fillPO_PUMA(poNumber, callback) {
  try {
    console.log('[PUMA] Filling PO:', poNumber);
    
    setTimeout(() => {
      // Try multiple selectors for PO field (Dojo generates dynamic IDs)
      let poInput = document.querySelector('input[maxlength="20"][type="text"]');
      
      // More specific: look for input inside the PO area
      if (!poInput) {
        const poInputs = document.querySelectorAll('input[type="text"]');
        for (const input of poInputs) {
          if (input.id && input.id.includes('poNumber')) {
            poInput = input;
            break;
          }
        }
      }
      
      if (poInput) {
        console.log('[PUMA] PO input found');
        
        // Clear and fill
        poInput.value = '';
        poInput.focus();
        poInput.value = poNumber;
        
        // Trigger Dojo events
        poInput.dispatchEvent(new Event('input', { bubbles: true }));
        poInput.dispatchEvent(new Event('change', { bubbles: true }));
        poInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        console.log('[PUMA] PO filled:', poNumber);
        showNotification(`PUMA PO filled: ${poNumber}`, 'success');
        callback(true);
      } else {
        console.log('[PUMA] ERROR: PO input not found');
        showNotification('PUMA PO field not found', 'error');
        callback(false);
      }
    }, 500);
    
  } catch (error) {
    console.error('[PUMA] Error filling PO:', error);
    showNotification('Error filling PUMA PO', 'error');
    callback(false);
  }
}

// =============================================================================
// TEMPLATE FOR NEW B2B SITE
// =============================================================================
// Uncomment and customize when adding Brooks support

// =============================================================================
// EXTENSION POPUP COMPATIBILITY (Optional legacy support)
// =============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillShippingForm') {
    const site = detectB2BSite();
    if (site) {
      chrome.storage.local.get(['email'], (result) => {
        fillShipping(site, request.data, result.email || '', (success) => {
          sendResponse({ success });
        });
      });
      return true;
    }
  }
});

// =============================================================================
// INITIALIZE
// =============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('B2B Shipping Form Filler ready');