// content.js - Fixed Hoka/Deckers Inventory Scraper
console.log('🚀 Hoka Content Script Loading...');

class HokaInventoryExtractor {
    constructor() {
      console.log('📦 HokaInventoryExtractor initialized');
      this.init();
    }
    
    init() {
      try {
        if (this.isProductPage()) {
          console.log('✅ Product page detected, adding export button');
          this.addExportButton();
        } else {
          console.log('❌ Not a product page');
        }
      } catch (error) {
        console.error('❌ Init error:', error);
      }
    }
    
    isProductPage() {
      // Check if we're on a product page with inventory data
      return document.querySelector('.product-wrap') !== null ||
             document.querySelector('[data-v-0038e214]') !== null ||
             window.location.pathname.includes('productList') ||
             window.location.pathname.includes('order-center');
    }
    
    addExportButton() {
      // Remove existing button if it exists
      const existingBtn = document.querySelector('.hoka-export-btn');
      if (existingBtn) {
        existingBtn.remove();
      }
      
      // Add export button to the page
      const exportBtn = document.createElement('button');
      exportBtn.innerHTML = '🏃‍♂️ Export Hoka Inventory CSV';
      exportBtn.className = 'hoka-export-btn';
      exportBtn.onclick = () => this.extractAndDownload();
      
      // Find a good place to insert the button - target the container
      const targetElement = document.querySelector('.container') || 
                           document.querySelector('body > div') || 
                           document.body;
      
      if (targetElement) {
        targetElement.insertBefore(exportBtn, targetElement.firstChild);
      }
    }
    
    extractAndDownload() {
      try {
        console.log('🚀 Starting Hoka inventory extraction...');
        
        const inventoryData = this.extractAllProducts();
        
        if (inventoryData.length === 0) {
          alert('No inventory data found on this page. Make sure you\'re on a product page with inventory loaded.');
          return { count: 0 };
        }
        
        const csv = this.convertToCSV(inventoryData);
        this.downloadCSV(csv, `hoka-inventory-${Date.now()}.csv`);
        
        this.showSuccessMessage(inventoryData.length);
        
        console.log('✅ Extraction completed:', inventoryData.length, 'records');
        return { count: inventoryData.length };
        
      } catch (error) {
        console.error('❌ Extraction error:', error);
        alert('Error extracting inventory: ' + error.message);
        return { count: 0 };
      }
    }
    
    extractAllProducts() {
      const allInventoryData = [];
      
      // Find all product containers using the correct selector from the HTML
      const productContainers = document.querySelectorAll('.product-wrap[data-v-0038e214]');
      console.log(`📦 Found ${productContainers.length} product containers`);
      
      if (productContainers.length === 0) {
        console.log('No product containers found, trying fallback selectors...');
        return this.extractFromFallback();
      }
      
      productContainers.forEach((container, index) => {
        console.log(`\n--- Processing Product ${index + 1} ---`);
        
        const productInfo = this.extractProductInfoFromContainer(container);
        const inventoryData = this.extractInventoryFromContainer(container);
        
        console.log(`📦 Product: ${productInfo.productName} - ${productInfo.colorway}`);
        console.log(`📊 Inventory items: ${inventoryData.length}`);
        
        // Combine product info with each inventory item
        inventoryData.forEach(item => {
          allInventoryData.push({
            ...productInfo,
            ...item,
            extractedAt: new Date().toISOString(),
            url: window.location.href
          });
        });
      });
      
      return allInventoryData;
    }
    
    extractProductInfoFromContainer(container) {
      // Extract product name from the .color class
      const productNameElement = container.querySelector('.info.color .color');
      const productName = productNameElement ? productNameElement.textContent.trim() : 'Unknown Product';
      
      // Extract colorway (the text below the product name)
      const colorwayElement = container.querySelector('.info.color div[style*="line-height"]');
      const colorway = colorwayElement ? colorwayElement.textContent.trim() : 'Unknown Colorway';
      
      // Extract other info from the right section
      let styleCode = 'Unknown Style';
      let wholesale = 'Unknown';
      let msrp = 'Unknown';
      let atsDate = 'Unknown';
      
      // Get all info sections from the right side
      const infoSections = container.querySelectorAll('.right .info');
      infoSections.forEach(info => {
        const valueElement = info.querySelector('div:first-child');
        const labelElement = info.querySelector('div:last-child');
        
        if (valueElement && labelElement) {
          const value = valueElement.textContent.trim();
          const label = labelElement.textContent.trim();
          
          if (label === 'STYLE-COLOR CODE') {
            styleCode = value;
          } else if (label === 'WHOLESALE') {
            wholesale = value;
          } else if (label === 'MSRP') {
            msrp = value;
          } else if (label === 'ATS DATE') {
            atsDate = value;
          }
        }
      });
      
      return {
        productName,
        colorway,
        styleCode,
        wholesale,
        msrp,
        atsDate,
        containerId: container.id || 'unknown'
      };
    }
    
    extractInventoryFromContainer(container) {
      const inventory = [];
      
      // Look for the size table with data-v-77fe2499 attribute
      const sizeTable = container.querySelector('[data-v-77fe2499] .size-table');
      if (!sizeTable) {
        console.log('No size table found in container');
        return inventory;
      }
      
      // Extract sizes from the header row
      const headerRow = sizeTable.querySelector('.rows.header');
      const sizes = [];
      if (headerRow) {
        const sizeElements = headerRow.querySelectorAll('.item');
        sizeElements.forEach(item => {
          const size = item.textContent.trim();
          if (size && size !== 'Size' && /\d/.test(size)) {
            sizes.push(size);
          }
        });
      }
      
      // Extract quantities from the "Available" row (stripe row)
      const availableRow = sizeTable.querySelector('.rows.stripe');
      const quantities = [];
      if (availableRow) {
        const quantityElements = availableRow.querySelectorAll('.item');
        quantityElements.forEach(item => {
          const qty = item.textContent.trim();
          if (qty && qty !== 'Available') {
            quantities.push(qty);
          }
        });
      }
      
      console.log(`Found ${sizes.length} sizes:`, sizes);
      console.log(`Found ${quantities.length} quantities:`, quantities);
      
      // Map sizes to quantities
      sizes.forEach((size, index) => {
        const rawQuantity = quantities[index] || '0';
        const numericQuantity = this.parseQuantity(rawQuantity);
        
        inventory.push({
          size: size,
          available: numericQuantity,
          rawQuantity: rawQuantity
        });
      });
      
      return inventory;
    }
    
    extractFromFallback() {
      console.log('Using fallback extraction method...');
      const inventory = [];
      
      // Try to find any size tables
      const sizeTables = document.querySelectorAll('.size-table, [class*="size"]');
      
      sizeTables.forEach(table => {
        const sizes = [];
        const quantities = [];
        
        // Look for size patterns in the table
        const allElements = table.querySelectorAll('*');
        allElements.forEach(el => {
          const text = el.textContent.trim();
          
          // Look for size patterns (e.g., "07D", "08.5D", "10", "11.5")
          if (/^\d{1,2}(\.\d)?D?$/.test(text) && !sizes.includes(text)) {
            sizes.push(text);
          }
          
          // Look for quantity patterns
          if ((/^\d+\+?$/.test(text) || text === '0') && text.length <= 4) {
            quantities.push(text);
          }
        });
        
        // Create inventory records
        sizes.forEach((size, index) => {
          const qty = quantities[index] || '0';
          inventory.push({
            productName: 'Fallback Extract',
            colorway: 'Unknown Colorway',
            styleCode: 'Unknown Style',
            size: size,
            available: this.parseQuantity(qty),
            rawQuantity: qty,
            wholesale: 'Unknown',
            msrp: 'Unknown',
            atsDate: 'Unknown',
            containerId: 'fallback',
            extractedAt: new Date().toISOString(),
            url: window.location.href
          });
        });
      });
      
      return inventory;
    }
    
    parseQuantity(quantityText) {
      if (!quantityText || quantityText === '-' || quantityText === '') return 0;
      
      // Handle "300+" format
      if (quantityText.includes('+')) {
        const num = parseInt(quantityText.replace('+', ''));
        return isNaN(num) ? 0 : num;
      }
      
      const num = parseInt(quantityText);
      return isNaN(num) ? 0 : num;
    }
    
    convertToCSV(data) {
      if (data.length === 0) return '';
      
      const headers = [
        'Product Name', 'Colorway', 'Style Code', 'Size', 
        'Available Quantity', 'Raw Quantity', 'Wholesale', 'MSRP', 
        'ATS Date', 'Container ID', 'Extracted At', 'URL'
      ];
      
      const csvContent = [
        headers.join(','),
        ...data.map(row => [
          this.escapeCSV(row.productName),
          this.escapeCSV(row.colorway),
          this.escapeCSV(row.styleCode),
          this.escapeCSV(row.size),
          row.available,
          this.escapeCSV(row.rawQuantity),
          this.escapeCSV(row.wholesale),
          this.escapeCSV(row.msrp),
          this.escapeCSV(row.atsDate),
          this.escapeCSV(row.containerId),
          this.escapeCSV(row.extractedAt),
          this.escapeCSV(row.url)
        ].join(','))
      ].join('\n');
      
      return csvContent;
    }
    
    escapeCSV(value) {
      if (!value) return '';
      const str = value.toString();
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }
    
    downloadCSV(csvContent, filename) {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }
    
    showSuccessMessage(count) {
      const notification = document.createElement('div');
      notification.className = 'hoka-export-success';
      notification.innerHTML = `✅ Exported ${count} Hoka inventory records to CSV`;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
    }
  }
  
  // Initialize when page loads
  console.log('🔄 Document ready state:', document.readyState);
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('📄 DOMContentLoaded - initializing extractor');
      new HokaInventoryExtractor();
    });
  } else {
    console.log('📄 Document already loaded - initializing extractor');
    new HokaInventoryExtractor();
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 Received message:', message);
    
    if (message.action === 'extractInventory') {
      try {
        console.log('🎯 Starting extraction from message listener');
        const extractor = new HokaInventoryExtractor();
        const result = extractor.extractAndDownload();
        console.log('✅ Extraction result:', result);
        sendResponse({ success: true, count: result.count });
      } catch (error) {
        console.error('❌ Message handler error:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keep the message channel open for async response
    }
  });
  
  console.log('✅ Content script loaded successfully');