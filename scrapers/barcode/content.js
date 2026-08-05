// Simple content script - detects product title and selected size
console.log('Barcode extension loaded');

let productData = {
  title: '',
  size: ''
};

// Get product title
function getProductTitle() {
  const titleElement = document.querySelector('.product-single__title, h1.product-single__title, .h2.product-single__title');
  if (titleElement) {
    let title = titleElement.textContent.trim();
    
    // Remove parentheticals unless they contain width info
    const match = title.match(/\(([^)]+)\)/);
    if (match) {
      const content = match[1].toLowerCase();
      if (!content.includes('wide') && !content.includes('narrow')) {
        title = title.replace(/\s*\([^)]+\)/g, '').trim();
      }
    }
    
    return title;
  }
  return '';
}

// Get selected size - IMPROVED using Shopify's variant data
function getSelectedSize() {
  // Method 1: Check Shopify's variant JSON
  const variantJsonElement = document.querySelector('[data-current-variant-json]');
  if (variantJsonElement) {
    try {
      const currentVariant = JSON.parse(variantJsonElement.textContent);
      if (currentVariant && currentVariant.option1) {
        console.log('Got size from variant JSON:', currentVariant.option1);
        return currentVariant.option1;
      }
    } catch (e) {
      console.log('Error parsing variant JSON:', e);
    }
  }
  
  // Method 2: Check selected radio button
  const checkedInput = document.querySelector('.variant-input-wrap input[type="radio"]:checked, input[name*="Size"]:checked, input[name*="option"]:checked');
  if (checkedInput) {
    const label = checkedInput.nextElementSibling || document.querySelector(`label[for="${checkedInput.id}"]`);
    if (label) {
      console.log('Got size from radio button:', label.textContent.trim());
      return label.textContent.trim();
    }
  }
  
  // Method 3: Check active button class
  const activeButton = document.querySelector('.variant__button-active');
  if (activeButton) {
    console.log('Got size from active button:', activeButton.textContent.trim());
    return activeButton.textContent.trim();
  }
  
  // Method 4: Check dropdown
  const selectedOption = document.querySelector('select[name*="Size"] option:checked, select[name*="option"] option:checked');
  if (selectedOption && selectedOption.value) {
    console.log('Got size from dropdown:', selectedOption.textContent.trim());
    return selectedOption.textContent.trim();
  }
  
  console.log('No size detected');
  return '';
}

// Update product data
function updateData() {
  productData.title = getProductTitle();
  productData.size = getSelectedSize();
  console.log('Product data updated:', productData);
}

// Create floating icon button with RH
function createFloatingIcon() {
  const icon = document.createElement('div');
  icon.id = 'barcode-floating-icon';
  icon.innerHTML = '<span style="font-weight: 800; font-size: 18px; color: white;">RH</span>';
  icon.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    transition: transform 0.2s;
    font-family: 'Montserrat', -apple-system, sans-serif;
  `;
  
  icon.addEventListener('mouseenter', () => {
    icon.style.transform = 'scale(1.1)';
  });
  
  icon.addEventListener('mouseleave', () => {
    icon.style.transform = 'scale(1)';
  });
  
  icon.addEventListener('click', () => {
    updateData();
    showBarcodePopup();
  });
  
  document.body.appendChild(icon);
}

// Show barcode popup
function showBarcodePopup() {
  // Remove existing popup
  const existing = document.getElementById('barcode-popup-overlay');
  if (existing) {
    existing.remove();
    return;
  }
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'barcode-popup-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    z-index: 9999999;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  
  // Create popup
  const popup = document.createElement('div');
  popup.style.cssText = `
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    max-width: 400px;
    width: 90%;
  `;
  
  popup.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <h3 style="margin: 0; font-size: 18px; font-weight: 600;">Barcode Lookup</h3>
      <button id="close-popup" style="background: none; border: none; font-size: 24px; cursor: pointer; padding: 0; width: 30px; height: 30px;">×</button>
    </div>
    <div style="margin-bottom: 12px;">
      <div style="font-size: 12px; color: #666; font-weight: 600;">PRODUCT</div>
      <div style="font-size: 14px; margin-top: 4px;">${productData.title || 'Loading...'}</div>
    </div>
    <div style="margin-bottom: 16px;">
      <div style="font-size: 12px; color: #666; font-weight: 600;">SIZE</div>
      <div style="font-size: 14px; margin-top: 4px;">${productData.size || 'Not selected'}</div>
    </div>
    <div id="barcode-container" style="text-align: center; padding: 20px; background: #f7fafc; border-radius: 8px;">
      <div id="barcode-loading">Loading barcode...</div>
    </div>
  `;
  
  overlay.appendChild(popup);
  document.body.appendChild(overlay);
  
  // Close button
  document.getElementById('close-popup').addEventListener('click', () => {
    overlay.remove();
  });
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
  
  // Load and display barcode
  loadBarcode();
}

// Load barcode from database
async function loadBarcode() {
  try {
    const response = await fetch(chrome.runtime.getURL('barcode-database.json'));
    const database = await response.json();
    
    // Generate lookup key
    const lookupKey = generateBarcodeKey(productData.title, productData.size);
    console.log('Looking up:', lookupKey);
    
    const productInfo = database[lookupKey];
    
    if (productInfo && productInfo.barcode) {
      displayBarcode(productInfo.barcode);
    } else {
      document.getElementById('barcode-loading').innerHTML = `
        <div style="color: #e53e3e;">Barcode not found</div>
        <div style="font-size: 11px; color: #666; margin-top: 8px;">Key: ${lookupKey}</div>
      `;
    }
  } catch (error) {
    console.error('Error loading barcode:', error);
    document.getElementById('barcode-loading').innerHTML = `
      <div style="color: #e53e3e;">Error loading database</div>
    `;
  }
}

function generateBarcodeKey(title, size) {
  let key = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  if (size) {
    key += '_' + size.replace(/[^a-zA-Z0-9]/g, '_');
  }
  return key;
}

function displayBarcode(barcodeNumber) {
  const container = document.getElementById('barcode-container');
  container.innerHTML = `
    <svg id="barcode-svg"></svg>
    <div style="margin-top: 8px; font-family: monospace; font-size: 14px; font-weight: 600;">${barcodeNumber}</div>
    <div style="margin-top: 12px; font-size: 11px; color: #666;">💡 Position scanner and pull trigger</div>
  `;
  
  // Load JsBarcode if not already loaded
  if (typeof JsBarcode === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    script.onload = () => {
      JsBarcode("#barcode-svg", barcodeNumber, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false
      });
    };
    document.head.appendChild(script);
  } else {
    JsBarcode("#barcode-svg", barcodeNumber, {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: false
    });
  }
}

// Initial detection
updateData();

// Listen for variant changes
document.addEventListener('change', function(e) {
  setTimeout(updateData, 100);
});

// Listen for clicks on variant buttons
document.addEventListener('click', function(e) {
  if (e.target.closest('.variant-input-wrap, .variant-input, .single-option-selector')) {
    setTimeout(updateData, 200);
  }
});

// Watch for changes to the variant JSON (Shopify updates this)
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target.hasAttribute('data-current-variant-json')) {
      console.log('Variant JSON updated by Shopify');
      setTimeout(updateData, 100);
    }
  });
});

const variantJsonElement = document.querySelector('[data-current-variant-json]');
if (variantJsonElement) {
  observer.observe(variantJsonElement, { 
    characterData: true, 
    childList: true, 
    subtree: true 
  });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getProductData') {
    updateData();
    sendResponse(productData);
  }
  return true;
});