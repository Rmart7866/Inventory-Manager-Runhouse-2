// Popup script - displays product info and lets user select size
let barcodeDatabase = {};
let currentProduct = { title: '', sizes: [] };

// Load barcode database on startup
async function loadBarcodeDatabase() {
  try {
    const response = await fetch(chrome.runtime.getURL('barcode-database.json'));
    barcodeDatabase = await response.json();
    console.log('✓ Barcode database loaded:', Object.keys(barcodeDatabase).length, 'entries');
  } catch (error) {
    console.warn('⚠️ Barcode database not found.');
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  loadBarcodeDatabase();
  loadProductData();
  
  // Close button
  document.getElementById('close-btn').addEventListener('click', function() {
    window.close();
  });
  
  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', function() {
    loadProductData();
  });
});

function loadProductData() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs[0]) {
      console.error('No active tab found');
      document.getElementById('product-title').textContent = 'No active tab';
      showNoBarcodeMessage('Cannot access tab');
      return;
    }
    
    const url = tabs[0].url;
    console.log('Current URL:', url);
    
    // Check if we're on a product page
    if (!url || !url.includes('therunhouse.com/products/')) {
      document.getElementById('product-title').textContent = 'Not on product page';
      document.getElementById('product-size').textContent = '-';
      showNoBarcodeMessage('Navigate to a product page');
      return;
    }
    
    console.log('Sending message to content script...');
    
    // Get data from content script
    chrome.tabs.sendMessage(tabs[0].id, { action: 'getProductData' }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Chrome runtime error:', chrome.runtime.lastError);
        document.getElementById('product-title').textContent = 'Content script not loaded';
        showNoBarcodeMessage('Please refresh the page (F5) and try again');
        return;
      }
      
      console.log('Response from content script:', response);
      
      if (response && response.title) {
        document.getElementById('product-title').textContent = response.title;
        currentProduct.title = response.title;
        
        // Find all available sizes for this product
        const availableSizes = findAvailableSizes(response.title);
        
        if (availableSizes.length > 0) {
          displaySizeSelector(availableSizes);
        } else {
          document.getElementById('product-size').textContent = 'No sizes found';
          showNoBarcodeMessage('No barcodes found for this product');
        }
      } else {
        console.warn('No title in response');
        document.getElementById('product-title').textContent = 'Product title not found';
        showNoBarcodeMessage('Refresh the page and try again');
      }
    });
  });
}

function findAvailableSizes(productTitle) {
  // Clean the product title for matching (same logic as database key generation)
  const cleanTitle = productTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').toLowerCase();
  
  console.log('🔍 Searching for sizes matching:', cleanTitle);
  
  // Find all database entries that match this EXACT product (full title match)
  const matchingEntries = [];
  
  for (const [key, data] of Object.entries(barcodeDatabase)) {
    const keyLower = key.toLowerCase();
    
    // The key format is: Title_Size or Title_Size_Width
    // We need to check if the key starts with the FULL cleaned title
    // This ensures we match "Deviate Nitro 3 Yellow Alert" and not all "Deviate Nitro 3" colorways
    
    if (keyLower.startsWith(cleanTitle + '_')) {
      matchingEntries.push({
        size: data.size,
        width: data.width,
        barcode: data.barcode,
        displayName: data.width ? `${data.size} (${data.width})` : data.size,
        key: key
      });
    }
  }
  
  // If no exact matches, try a more flexible match using the stored title
  if (matchingEntries.length === 0) {
    console.log('No exact key match, trying title match...');
    const titleLower = productTitle.toLowerCase();
    
    for (const [key, data] of Object.entries(barcodeDatabase)) {
      // Compare the stored title (normalized) with the page title
      const storedTitleLower = data.title.toLowerCase();
      
      if (storedTitleLower === titleLower || 
          storedTitleLower.replace(/[^a-z0-9]/g, '') === titleLower.replace(/[^a-z0-9]/g, '')) {
        matchingEntries.push({
          size: data.size,
          width: data.width,
          barcode: data.barcode,
          displayName: data.width ? `${data.size} (${data.width})` : data.size,
          key: key
        });
      }
    }
  }
  
  console.log('✓ Found', matchingEntries.length, 'matching sizes');
  
  // Sort by size numerically
  matchingEntries.sort((a, b) => {
    const aNum = parseFloat(a.size);
    const bNum = parseFloat(b.size);
    return aNum - bNum;
  });
  
  return matchingEntries;
}

function displaySizeSelector(sizes) {
  const selectorContainer = document.getElementById('size-selector-container');
  
  // Create size selector
  const selectorHTML = `
    <div class="size-selector">
      <div class="size-label">Select Size</div>
      <div class="size-grid" id="size-grid">
        ${sizes.map((sizeData, index) => {
          // Extract just the number from size (remove any text)
          const sizeNumber = sizeData.size;
          // Add width indicator if exists (W for Wide, N for Narrow)
          const widthIndicator = sizeData.width ? 
            (sizeData.width.toLowerCase().includes('wide') ? 'W' : 
             sizeData.width.toLowerCase().includes('narrow') ? 'N' : '') : '';
          
          return `
            <button 
              class="size-btn" 
              data-size-index="${index}"
              title="${sizeData.displayName}"
            >
              ${sizeNumber}${widthIndicator ? '<small style="font-size:9px">' + widthIndicator + '</small>' : ''}
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
  
  selectorContainer.innerHTML = selectorHTML;
  
  // Add click handlers
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.dataset.sizeIndex);
      const selectedSize = sizes[index];
      
      // Update active state
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      
      // Display the barcode
      displayBarcode(selectedSize.barcode);
    });
  });
}

function generateBarcodeKey(title, size) {
  let key = title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
  if (size) {
    key += '_' + size.replace(/[^a-zA-Z0-9]/g, '_');
  }
  return key;
}

function detectBarcodeFormat(barcodeNumber) {
  const cleaned = barcodeNumber.replace(/[\s-]/g, '');
  
  console.log('📊 Barcode length:', cleaned.length, 'digits');
  
  if (/^\d{12}$/.test(cleaned)) {
    console.log('📊 Detected format: UPC-A (12 digits)');
    return { format: 'UPC', value: cleaned };
  }
  
  if (/^\d{13}$/.test(cleaned)) {
    console.log('📊 Detected format: EAN13 (13 digits)');
    return { format: 'EAN13', value: cleaned };
  }
  
  if (/^\d{8}$/.test(cleaned)) {
    console.log('📊 Detected format: EAN8 (8 digits)');
    return { format: 'EAN8', value: cleaned };
  }
  
  if (/^\d{10}$/.test(cleaned)) {
    console.log('📊 Detected format: 10-digit → using CODE128');
    return { format: 'CODE128', value: cleaned };
  }
  
  if (/^[0-9A-Z\-. $/+%]+$/.test(cleaned)) {
    console.log('📊 Detected format: CODE39 (alphanumeric)');
    return { format: 'CODE39', value: cleaned };
  }
  
  console.log('📊 Using default format: CODE128 (universal)');
  return { format: 'CODE128', value: cleaned };
}

function displayBarcode(barcodeNumber) {
  console.log('🎯 Displaying barcode:', barcodeNumber);
  
  // Hide no-barcode message
  document.getElementById('no-barcode').style.display = 'none';
  
  // Show barcode number
  document.getElementById('barcode-number').textContent = barcodeNumber;
  document.getElementById('barcode-number').style.display = 'block';
  
  // Detect the best format for this barcode
  const { format, value } = detectBarcodeFormat(barcodeNumber);
  
  // Generate barcode using JsBarcode
  try {
    JsBarcode("#barcode", value, {
      format: format,
      width: 3,
      height: 100,
      displayValue: true,
      margin: 15,
      background: "#ffffff",
      lineColor: "#000000",
      fontSize: 14,
      textMargin: 5
    });
    
    document.getElementById('barcode').style.display = 'block';
    console.log('✅ Barcode generated successfully!');
    console.log('   Format:', format);
    console.log('   Value:', value);
    
    // Show success message
    const successMsg = document.getElementById('success-message');
    successMsg.textContent = `${format} format • Ready to scan`;
    successMsg.style.display = 'block';
    
  } catch (error) {
    console.error('❌ Error generating barcode:', error);
    
    // Fallback: try CODE128
    if (format !== 'CODE128') {
      console.log('🔄 Trying CODE128 fallback...');
      try {
        JsBarcode("#barcode", value, {
          format: "CODE128",
          width: 3,
          height: 100,
          displayValue: true,
          margin: 15,
          background: "#ffffff",
          lineColor: "#000000"
        });
        
        document.getElementById('barcode').style.display = 'block';
        console.log('✅ CODE128 fallback successful!');
        const successMsg = document.getElementById('success-message');
        successMsg.textContent = 'CODE128 format • Ready to scan';
        successMsg.style.display = 'block';
        return;
      } catch (fallbackError) {
        console.error('❌ CODE128 fallback also failed:', fallbackError);
      }
    }
    
    // If all fails, show error
    document.getElementById('no-barcode').textContent = 'Error: ' + error.message;
    document.getElementById('no-barcode').style.display = 'block';
  }
}

function showNoBarcodeMessage(message) {
  document.getElementById('barcode').style.display = 'none';
  document.getElementById('barcode-number').style.display = 'none';
  document.getElementById('success-message').style.display = 'none';
  document.getElementById('no-barcode').textContent = message;
  document.getElementById('no-barcode').style.display = 'block';
}