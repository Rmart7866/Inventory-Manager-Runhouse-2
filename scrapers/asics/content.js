
// Local date and time stamp for download filenames, as YYYY-MM-DD_HHMM.
// Date.now() was an epoch number like 1757936421883: unreadable, and it sorts
// against nothing else in the Downloads folder. This sorts chronologically by
// name and tells you at a glance which drop a file came from. Local time, not
// UTC, because the person reading the filename is in the shop.
function stampForFilename(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
// COMPLETE UNIFIED ASICS Browser Extension - Final Fixed Version
// This version supports both INVENTORY CSV and PRODUCT CSV formats with correct Shopify headers

// Enhanced UnifiedShopifyConverter with INVENTORY CSV Support
class UnifiedShopifyConverter {
    constructor(brand) {
        this.brand = brand;
        this.defaultSettings = {
            vendor: brand,
            productType: 'Footwear',
            tags: `Athletic, Running, ${brand}`,
            published: 'TRUE',
            variantPrice: '120.00',
            compareAtPrice: '',
            inventoryTracker: 'shopify',
            inventoryPolicy: 'deny',
            requiresShipping: 'TRUE',
            taxable: 'TRUE',
            fulfillmentService: 'manual',
            productCategory: 'Footwear > Athletic Shoes',
            condition: 'New',
            status: 'active',
            locationName: 'Needham',
            locationId: '',
            useMultiLocation: true,
            exportType: 'inventory'
        };
    }

    // Which location did the URL list ask for, for the page just scraped?
    //
    // MATCHED ON THE PATH, NOT THE WHOLE URL. The portal rewrites the address
    // as it loads, appending colorCode and deliveryDate, so the string in
    // window.location.href is not the string that was pasted in. The current
    // index is the authority where it is available; the path match is the
    // fallback for a resumed run, where currentIndex has already advanced.
    //
    // Returns '' when the line carried no location, and the row builder then
    // falls back to Needham exactly as it always did.
    locationForScrapedUrl(config, href) {
        const map = (config && config.locationByUrl) || {};
        if (!Object.keys(map).length) return '';
        const asked = (config.urls || [])[(config.currentIndex || 1) - 1];
        if (asked && map[asked]) return map[asked];
        if (map[href]) return map[href];
        const path = String(href || '').split('?')[0];
        const hit = Object.keys(map).find(u => u.split('?')[0] === path);
        return hit ? map[hit] : '';
    }

    convertToInventoryCSV(inventoryData, settings = {}) {
        const csvSettings = { ...this.defaultSettings, ...settings };
        
        console.log('INVENTORY CSV: Converting with settings:', csvSettings);
        
        // Build CSV manually to ensure ALL columns are included
        let csvLines = [];
        
        // Add header row - EXACT format Shopify expects
        csvLines.push('Handle,Title,"Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",SKU,"HS Code",COO,Location,"Bin name","Incoming (not editable)","Unavailable (not editable)","Committed (not editable)","Available (not editable)","On hand (current)","On hand (new)"');
        
        const productGroups = this.groupByColorway(inventoryData);
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            const handle = this.generateHandle(baseProduct);
            const title = this.generateProductTitle(baseProduct);
            
            variants.forEach(variant => {
                const sku = this.generateSKU(variant);
                const quantity = Math.max(0, parseInt(variant.quantity || variant.availableQuantity) || 0);
                
                // Build each row manually
                const row = [
                    handle,
                    `"${title}"`,
                    'Size',
                    variant.sizeUS || variant.size,
                    'Color',
                    `"${variant.colorName}"`,
                    '', // Option3 Name
                    '', // Option3 Value
                    sku,
                    '', // HS Code
                    '', // COO
                    variant.locationName || csvSettings.locationName || 'Needham',
                    '', // Bin name
                    '', // Incoming
                    '', // Unavailable
                    '', // Committed
                    '', // Available
                    '', // On hand (current) - leave empty to skip validation
                    quantity // On hand (new) - THIS IS THE CRITICAL COLUMN
                ];
                
                csvLines.push(row.join(','));
            });
        });
        
        const csvContent = csvLines.join('\n');
        
        console.log('INVENTORY CSV: Generated', csvLines.length - 1, 'inventory rows');
        console.log('INVENTORY CSV: First line:', csvLines[0]);
        console.log('INVENTORY CSV: Sample data line:', csvLines[1] || 'No data');
        
        return csvContent;
    }
    convertToShopifyFormat(inventoryData, settings = {}) {
        const shopifySettings = { 
            ...this.defaultSettings, 
            ...settings
        };
        
        const shopifyRows = [];
        const productGroups = this.groupByColorway(inventoryData);
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            const handle = this.generateHandle(baseProduct);
            
            variants.forEach((variant, index) => {
                const isFirstVariant = index === 0;
                const sku = this.generateSKU(variant);
                const quantity = Math.max(0, parseInt(variant.quantity || variant.availableQuantity) || 0);
                
                const shopifyRow = {
                    'Handle': handle,
                    'Title': isFirstVariant ? this.generateProductTitle(baseProduct) : '',
                    'Body (HTML)': isFirstVariant ? this.generateProductDescription(baseProduct) : '',
                    'Vendor': isFirstVariant ? shopifySettings.vendor : '',
                    'Product Category': isFirstVariant ? shopifySettings.productCategory : '',
                    'Type': isFirstVariant ? shopifySettings.productType : '',
                    'Tags': isFirstVariant ? this.generateTags(baseProduct, shopifySettings.tags) : '',
                    'Published': isFirstVariant ? shopifySettings.published : '',
                    'Option1 Name': isFirstVariant ? 'Size' : '',
                    'Option1 Value': variant.sizeUS || variant.size,
                    'Option2 Name': isFirstVariant ? 'Color' : '',
                    'Option2 Value': variant.colorName,
                    'Option3 Name': '',
                    'Option3 Value': '',
                    'Variant SKU': sku,  // "Variant SKU" for product CSV
                    'Variant Grams': 500,
                    'Variant Inventory Tracker': shopifySettings.inventoryTracker,
                    'Variant Inventory Qty': quantity,  // CRITICAL: Add initial inventory quantity
                    'Variant Inventory Policy': shopifySettings.inventoryPolicy,
                    'Variant Fulfillment Service': shopifySettings.fulfillmentService,
                    'Variant Price': shopifySettings.variantPrice,
                    'Variant Compare At Price': shopifySettings.compareAtPrice,
                    'Variant Requires Shipping': shopifySettings.requiresShipping,
                    'Variant Taxable': shopifySettings.taxable,
                    'Variant Barcode': '',
                    'Image Src': '',
                    'Image Position': '',
                    'Image Alt Text': '',
                    'Gift Card': 'FALSE',
                    'SEO Title': isFirstVariant ? this.generateProductTitle(baseProduct) : '',
                    'SEO Description': isFirstVariant ? this.generateSEODescription(baseProduct) : '',
                    'Google Shopping / Google Product Category': '',
                    'Google Shopping / Gender': '',
                    'Google Shopping / Age Group': '',
                    'Google Shopping / MPN': '',
                    'Google Shopping / Condition': isFirstVariant ? shopifySettings.condition : '',
                    'Google Shopping / Custom Product': 'FALSE',
                    'Variant Image': '',
                    'Variant Weight Unit': 'g',
                    'Variant Tax Code': '',
                    'Cost per item': '',
                    'Included / United States': 'TRUE',
                    'Price / United States': shopifySettings.variantPrice,
                    'Compare At Price / United States': '',
                    'Included / International': 'TRUE',
                    'Price / International': shopifySettings.variantPrice,
                    'Compare At Price / International': '',
                    'Status': shopifySettings.status
                };
                
                // DO NOT add "Inventory at [Location]" columns - not needed
                
                shopifyRows.push(shopifyRow);
            });
        });
        
        console.log('CONVERTER: Generated', shopifyRows.length, 'product variants');
        return shopifyRows;
    }

    convertToCSV(shopifyData, settings = {}) {
        if (!shopifyData || shopifyData.length === 0) return '';
        
        // Get headers from the first row
        const headers = Object.keys(shopifyData[0]);
        
        const csvContent = [
            headers.join(','),
            ...shopifyData.map(row => headers.map(header => {
                const value = row[header] || '';
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        return csvContent;
    }

    // Helper methods
    groupByColorway(inventoryData) {
        const groups = {};
        inventoryData.forEach(item => {
            // FIXED: Include width in the grouping key for wide shoes
            let key = `${item.styleId || item.productName}-${item.colorCode || item.colorName}`;
            
            // Add width suffix for wide shoes to create separate product groups
            if (item.width && item.width.isWide) {
                key += `-${item.width.code}`;
                console.log('Grouping wide shoe with key:', key);
            }
            
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
        });
        return groups;
    }

    generateHandle(product) {
        const styleId = (product.styleId || 'unknown').toLowerCase();
        const colorCode = (product.colorCode || product.colorName || 'default').toLowerCase();
        let handle = `${styleId}-${colorCode}`.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        
        // For wide shoes, append width to handle
        if (product.width && product.width.isWide) {
            handle += `-${product.width.code.toLowerCase()}`;
            console.log('Generated wide shoe handle:', handle);
        }
        
        return handle;
    }

    generateProductTitle(product) {
        const productName = product.productName || 'Unknown Product';
        const colorName = product.colorName || 'Default Color';
        const gender = product.gender || '';
        
        // Build title with gender and width
        let title = gender ? `${gender}'s ${productName}` : productName;
        
        // Add width for wide shoes
        if (product.width && product.width.isWide) {
            title += ` ${product.width.name}`;
        }
        
        // Add color
        title += ` - ${colorName}`;
        
        console.log('Generated product title:', title);
        
        return title;
    }

    generateProductDescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        return `<p>${productName}</p><p>Style: ${styleId}</p><p>Color: ${colorName}</p><p>High-performance athletic footwear from ${this.brand}.</p>`;
    }

    generateSEODescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        return `${productName} in ${colorName}. Style ${styleId} from ${this.brand}. High-performance athletic footwear.`;
    }

    generateTags(product, baseTags) {
        const productName = product.productName || '';
        const styleId = product.styleId || '';
        const colorName = product.colorName || '';
        let tags = baseTags;
        if (productName) tags += `, ${productName}`;
        if (styleId) tags += `, ${styleId}`;
        if (colorName) tags += `, ${colorName}`;
        
        // Add width-specific tags for wide shoes
        if (product.width && product.width.isWide) {
            tags += `, Wide Fit, ${product.width.name}`;
        }
        
        return tags;
    }

    generateSKU(variant) {
        const styleId = variant.styleId || 'UNK';
        const colorCode = variant.colorCode || variant.colorName || 'DEF';
        const size = (variant.sizeUS || variant.size || 'OS').toString().replace(/\./g, '5');
        let sku = `${styleId}-${colorCode}-${size}`;
        
        // Append width code for wide shoes (e.g., -2E, -4E)
        if (variant.width && variant.width.isWide) {
            sku += `-${variant.width.code}`;
            console.log('Generated wide shoe SKU:', sku);
        }
        
        return sku;
    }
}

class EnhancedASICSInventoryExtractor {
    constructor() {
        this.shopifyConverter = new UnifiedShopifyConverter('ASICS');
        this.shopifySettings = {
            vendor: 'ASICS',
            productType: 'Footwear',
            tags: 'Athletic, Running, ASICS',
            published: 'TRUE',
            variantPrice: '120.00',
            compareAtPrice: '',
            inventoryTracker: 'shopify',
            inventoryPolicy: 'deny',
            requiresShipping: 'TRUE',
            taxable: 'TRUE',
            fulfillmentService: 'manual',
            productCategory: 'Footwear > Athletic Shoes',
            condition: 'New',
            status: 'active',
            useMultiLocation: true,
            locationName: 'Needham',
            exportType: 'inventory'
        };
        
        window.asicsExtractor = this;
        
        this.init();
        this.setupAutoScraper();
        this.setupBackgroundMessageListener();
    }

    init() {
        if (this.isProductPage()) {
            this.addAutoScraperButton();
            this.addSettingsButton();
        }
    }

    isProductPage() {
        return window.location.pathname.includes('/products/') || 
               window.location.pathname.includes('/Products/') ||
               window.location.href.includes('b2b.asics.com');
    }

    addAutoScraperButton() {
        const autoBtn = document.createElement('button');
        autoBtn.innerHTML = 'Auto-Scrape';
        autoBtn.className = 'asics-auto-scraper-btn';
        autoBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: #007bff; color: white; border: none; padding: 12px 44px 12px 20px;
            border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        autoBtn.onclick = () => this.showAutoScraperModal();
        
        // Create close button (X) inside auto-scraper button
        const closeBtn = document.createElement('span');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
            width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
            background: rgba(255, 255, 255, 0.2); border-radius: 50%; cursor: pointer;
            font-size: 18px; line-height: 1; transition: all 0.2s ease; font-weight: 700;
        `;
        closeBtn.onmouseover = (e) => {
            e.stopPropagation();
            closeBtn.style.background = 'rgba(255, 255, 255, 0.35)';
            closeBtn.style.transform = 'translateY(-50%) scale(1.1)';
        };
        closeBtn.onmouseout = (e) => {
            e.stopPropagation();
            closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
            closeBtn.style.transform = 'translateY(-50%) scale(1)';
        };
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleScraperVisibility();
        };
        autoBtn.appendChild(closeBtn);
        
        document.body.appendChild(autoBtn);

        this.addApiScrapeButton();

        // Create reopen button (hidden initially)
        this.addReopenButton();
    }

    // One button, whole footwear catalog, no page walking. Sits under
    // Auto-Scrape rather than replacing it, because the DOM walk is still the
    // fallback if ASICS changes the API.
    addApiScrapeButton() {
        const btn = document.createElement('button');
        btn.className = 'asics-api-scrape-btn';
        btn.textContent = 'Scrape All Shoes (fast)';
        btn.style.cssText = `
            position: fixed; top: 68px; right: 20px; z-index: 10000;
            background: #28a745; color: white; border: none; padding: 12px 20px;
            border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        btn.onclick = async () => {
            if (btn.disabled) return;
            btn.disabled = true;
            btn.style.background = '#6c757d';
            btn.textContent = 'Starting...';
            const t0 = Date.now();
            try {
                const records = await this.fetchInventoryFromApi((done, total, rows) => {
                    // Elapsed and ETA, so a slow run is visibly a slow run and
                    // not a hung one. Throttling is called out by name because
                    // that is the usual reason this takes longer than expected.
                    const secs = (Date.now() - t0) / 1000;
                    const eta = done ? Math.round((secs / done) * (total - done)) : 0;
                    const C = EnhancedASICSInventoryExtractor;
                    const cooling = (C._cooldownUntil || 0) > Date.now();
                    btn.textContent = done + ' / ' + total + '  ' + rows + ' rows  ' +
                        Math.round(secs) + 's elapsed, ~' + eta + 's left' +
                        (cooling ? '  (throttled, waiting)' : '');
                });
                const csv = this.shopifyConverter.convertToInventoryCSV(records, this.shopifySettings);
                const d = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                    '_' + pad(d.getHours()) + pad(d.getMinutes());
                this.downloadCSV(csv, 'asics-inventory-api-' + stamp + '.csv');
                // A carried style missing from the file will be read as removed
                // and zeroed, so this cannot live in the console only.
                const absent = this._lastAbsentCarried || [];
                if (absent.length) {
                    btn.textContent = 'Done, but ' + absent.length + ' carried styles missing';
                    btn.style.background = '#fd7e14';
                    alert('ASICS scrape finished, but ' + absent.length + ' style(s) the store carries are not ' +
                        'in the ASICS catalog:\n\n' + absent.join(', ') +
                        '\n\nThese are absent from the CSV, so the tool will read them as removed and zero ' +
                        'their stock. Check them before writing inventory.');
                } else {
                    btn.textContent = 'Done: ' + records.length + ' rows';
                    btn.style.background = '#28a745';
                }
            } catch (e) {
                console.error('ASICS API scrape failed:', e);
                btn.textContent = 'Failed, see console';
                btn.style.background = '#dc3545';
            } finally {
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = 'Scrape All Shoes (fast)';
                    btn.style.background = '#28a745';
                }, 6000);
            }
        };
        document.body.appendChild(btn);
    }
    
    addReopenButton() {
        const reopenBtn = document.createElement('button');
        reopenBtn.innerHTML = '↻'; // Circular arrow refresh icon
        reopenBtn.className = 'asics-reopen-btn';
        reopenBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: #28a745; color: white; border: none; 
            width: 40px; height: 40px;
            border-radius: 50%; cursor: pointer; 
            font-size: 24px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3); 
            display: none;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s ease;
        `;
        reopenBtn.onmouseover = () => {
            reopenBtn.style.transform = 'rotate(180deg) scale(1.1)';
            reopenBtn.style.boxShadow = '0 4px 15px rgba(40, 167, 69, 0.5)';
        };
        reopenBtn.onmouseout = () => {
            reopenBtn.style.transform = 'rotate(0deg) scale(1)';
            reopenBtn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        };
        reopenBtn.onclick = () => this.toggleScraperVisibility();
        reopenBtn.title = 'Show Scraper'; // Tooltip on hover
        
        document.body.appendChild(reopenBtn);
    }
    
    toggleScraperVisibility() {
        const autoBtn = document.querySelector('.asics-auto-scraper-btn');
        const settingsBtn = document.querySelector('.asics-settings-btn');
        const reopenBtn = document.querySelector('.asics-reopen-btn');
        const apiBtn = document.querySelector('.asics-api-scrape-btn');
        
        if (autoBtn && settingsBtn && reopenBtn) {
            if (autoBtn.style.display === 'none') {
                // Show scraper buttons
                autoBtn.style.display = 'block';
                settingsBtn.style.display = 'block';
                if (apiBtn) apiBtn.style.display = 'block';
                reopenBtn.style.display = 'none';
            } else {
                // Hide scraper buttons
                autoBtn.style.display = 'none';
                settingsBtn.style.display = 'none';
                if (apiBtn) apiBtn.style.display = 'none';
                reopenBtn.style.display = 'block';
            }
        }
    }

    addSettingsButton() {
        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = 'Settings';
        settingsBtn.className = 'asics-settings-btn';
        settingsBtn.style.cssText = `
            position: fixed; top: 70px; right: 20px; z-index: 10000;
            background: #6c757d; color: white; border: none; padding: 8px 16px;
            border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        settingsBtn.onclick = () => this.showSettingsModal();
        
        document.body.appendChild(settingsBtn);
    }

    showAutoScraperModal() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white; padding: 30px; border-radius: 10px; max-width: 700px;
            width: 90%; max-height: 80%; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        
        modalContent.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #333;">Auto-Scrape to Shopify</h3>
            
            <!-- CSV FORMAT SELECTION -->
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #007bff;">
                <h4 style="margin: 0 0 15px 0; color: #007bff;">Select CSV Format:</h4>
                
                <div style="display: flex; gap: 20px; margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #28a745; border-radius: 8px; background: #d4edda; flex: 1; cursor: pointer;">
                        <input type="radio" name="csvFormat" value="inventory" checked style="margin-right: 10px; transform: scale(1.2);">
                        <div>
                            <strong style="color: #155724;">Inventory CSV</strong><br>
                            <small style="color: #155724;">Update existing product quantities</small>
                        </div>
                    </label>
                    
                    <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #17a2b8; border-radius: 8px; background: #d1ecf1; flex: 1; cursor: pointer;">
                        <input type="radio" name="csvFormat" value="product" style="margin-right: 10px; transform: scale(1.2);">
                        <div>
                            <strong style="color: #0c5460;">Product CSV</strong><br>
                            <small style="color: #0c5460;">Create new products with details</small>
                        </div>
                    </label>
                </div>
                
                <!-- FORMAT DETAILS - FINAL CORRECT -->
                <div id="inventoryDetails" style="background: #d4edda; padding: 10px; border-radius: 5px; font-size: 12px; color: #155724;">
                    <strong>Inventory CSV (FIXED):</strong><br>
                    • 10 columns: Handle, SKU, Options, "Location", "On hand"<br>
                    • Import to: Products → Inventory → Import<br>
                    • Best for: Updating stock levels for existing products
                </div>
                
                <div id="productDetails" style="background: #d1ecf1; padding: 10px; border-radius: 5px; font-size: 12px; color: #0c5460; display: none;">
                    <strong>Product CSV:</strong><br>
                    • 48+ columns: Full product details, pricing, descriptions<br>
                    • Import to: Products → Import<br>
                    • Best for: Creating new products from scratch
                </div>
            </div>
            
            <p style="margin-bottom: 15px; color: #666;">Enter URLs to scrape (one per line):</p>
            <textarea id="urlInput" style="width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-family: monospace;" placeholder="https://b2b.asics.com/orders/100454100/products/1013A142?deliveryDate=2025-06-18
https://b2b.asics.com/orders/100454100/products/1011B956?colorCode=001&deliveryDate=2025-06-18"></textarea>
            
            <div style="margin: 20px 0;">
                <label style="display: flex; align-items: center;">
                    Wait time per page: 
                    <select id="waitTime" style="margin-left: 8px; padding: 4px;">
                        <option value="10">10 seconds</option>
                        <option value="15">15 seconds</option>
                        <option value="20">20 seconds</option>
                        <option value="25">25 seconds</option>
                        <option value="30" selected>30 seconds (recommended)</option>
                    </select>
                </label>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button id="startScraping" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-weight: bold;">
                    Start Auto-Scraping
                </button>
                <button id="closeModal" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Cancel
                </button>
            </div>
            
            <div id="progressArea" style="margin-top: 20px; display: none;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #e9ecef;">
                    <h4 style="margin: 0 0 15px 0; color: #333;">Scraping Progress</h4>
                    
                    <!-- Enhanced Progress Bar -->
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 13px; color: #666; font-weight: 500;">Overall Progress</span>
                            <span id="progressPercent" style="font-size: 13px; color: #666; font-weight: 500;">0%</span>
                        </div>
                        <div style="background: #e9ecef; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div id="progressFill" style="background: linear-gradient(90deg, #28a745, #20c997); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 4px;"></div>
                        </div>
                    </div>
                    
                    <!-- Status Grid -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef;">
                            <div style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Status</div>
                            <div id="progressText" style="font-size: 13px; color: #333; font-weight: 500;">Ready to start...</div>
                        </div>
                        <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef;">
                            <div style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Format</div>
                            <div id="formatStatus" style="font-size: 13px; color: #007bff; font-weight: 500;">Not selected</div>
                        </div>
                    </div>
                    
                    <!-- Current URL -->
                    <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef; margin-bottom: 15px;">
                        <div style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Current URL</div>
                        <div id="currentUrl" style="font-size: 12px; color: #333; word-break: break-all;">Waiting to start...</div>
                    </div>
                    
                    <!-- Detailed Status -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef;">
                            <div style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Page Status</div>
                            <div id="waitingStatus" style="font-size: 12px; color: #333;">Waiting to start...</div>
                        </div>
                        <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef;">
                            <div style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Chunks</div>
                            <div id="chunkStatus" style="font-size: 12px; color: #28a745; font-weight: 500;">No chunks yet</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Handle format selection
        const formatRadios = document.querySelectorAll('input[name="csvFormat"]');
        const inventoryDetails = document.getElementById('inventoryDetails');
        const productDetails = document.getElementById('productDetails');
        
        formatRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'inventory') {
                    inventoryDetails.style.display = 'block';
                    productDetails.style.display = 'none';
                } else {
                    inventoryDetails.style.display = 'none';
                    productDetails.style.display = 'block';
                }
            });
        });
        
        document.getElementById('closeModal').onclick = () => {
            document.body.removeChild(modal);
        };
        
        document.getElementById('startScraping').onclick = () => {
            this.startUnifiedBackgroundScraping(modal);
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };
    }

    showSettingsModal() {
        const savedSettings = this.safeGetLocalStorage('asicsShopifySettings');
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                this.shopifySettings = { 
                    ...this.shopifySettings, 
                    ...parsedSettings,
                    locationName: 'Needham'
                };
            } catch (e) {
                console.error('Error parsing saved settings:', e);
            }
        }

        console.log('SETTINGS: Current settings:', this.shopifySettings);

        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white; padding: 30px; border-radius: 10px; max-width: 650px;
            width: 90%; max-height: 80%; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        
        modalContent.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #333;">ASICS Export Settings</h3>
            
            <!-- INVENTORY CSV INFO - FINAL CORRECT -->
            <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745;">
                <h4 style="margin: 0 0 10px 0; color: #155724;">Inventory CSV (FIXED & Recommended)</h4>
                <div style="font-size: 12px; color: #155724;">
                    <strong>Purpose:</strong> Update inventory quantities for existing products<br>
                    <strong>Format:</strong> Handle, SKU, Options, "Location", "On hand"<br>
                    <strong>Fixed:</strong> Now includes BOTH "Location" AND "On hand" columns<br>
                    <strong>Import to:</strong> Products > Inventory > Import
                </div>
            </div>
            
            <!-- PRODUCT CSV INFO -->
            <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #17a2b8;">
                <h4 style="margin: 0 0 10px 0; color: #0c5460;">Product CSV (For New Products)</h4>
                <div style="font-size: 12px; color: #0c5460;">
                    <strong>Purpose:</strong> Create new products with details<br>
                    <strong>Format:</strong> Full product info, descriptions, pricing<br>
                    <strong>Note:</strong> Uses "Inventory at Needham" column format<br>
                    <strong>Import to:</strong> Products > Import
                </div>
            </div>
            
            <!-- LOCATION SETTINGS -->
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #007bff;">
                <h4 style="margin: 0 0 10px 0; color: #007bff;">Location Settings</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Target Location Name:</label>
                    <input type="text" id="locationName" value="Needham" readonly style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; background: #e9ecef;" placeholder="Needham (LOCKED)">
                    <small style="color: #666; font-size: 11px;">Inventory CSV: Uses "Location" column with this name + "On hand" for quantity. Product CSV: Uses "Inventory at [location]"</small>
                </div>
            </div>
            
            <!-- BASIC SETTINGS -->
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Vendor:</label>
                <input type="text" id="vendor" value="${this.shopifySettings.vendor}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Default Price ($):</label>
                <input type="number" step="0.01" id="variantPrice" value="${this.shopifySettings.variantPrice}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
                <button id="saveSettings" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-weight: bold;">
                    Save Settings
                </button>
                <button id="closeSettingsModal" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Cancel
                </button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Save function
        document.getElementById('saveSettings').onclick = () => {
            const newSettings = {
                ...this.shopifySettings,
                vendor: document.getElementById('vendor').value,
                variantPrice: document.getElementById('variantPrice').value,
                locationName: 'Needham'
            };
            
            console.log('SETTINGS: Saving settings:', newSettings);
            
            this.shopifySettings = newSettings;
            this.safeSetLocalStorage('asicsShopifySettings', JSON.stringify(newSettings));
            
            document.body.removeChild(modal);
            this.showSuccessMessage('Settings saved! Ready for Shopify import.');
        };
        
        document.getElementById('closeSettingsModal').onclick = () => {
            document.body.removeChild(modal);
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };
    }

    // Continue with the remaining methods...
    startUnifiedBackgroundScraping(modal) {
        const urlInput = document.getElementById('urlInput').value.trim();
        // Set default values since checkboxes removed: always use chunked downloads
        const downloadEach = false;
        const downloadChunked = true;
        const waitTime = parseInt(document.getElementById('waitTime').value) * 1000;
        const selectedFormat = document.querySelector('input[name="csvFormat"]:checked').value;
        
        if (!urlInput) {
            alert('Please enter at least one URL');
            return;
        }
        
        // A LINE MAY CARRY ITS OWN LOCATION, written after the URL:
        //
        //   https://b2b.asics.com/.../products/ZK1234            -> Needham
        //   https://b2b.asics.com/.../products/TF3085  Warehouse -> Warehouse
        //
        // WHY PER LINE AND NOT PER RUN. Nearly every ASICS link is dropship
        // footwear counted at Needham, but the Rival II singlets (TF3085 and
        // TF2934) are race merch blanks held at the Warehouse and printed to
        // order. Those come from the same portal in the same scrape, so one
        // location per run would mean two runs and a chance to mix them up.
        //
        // The urls array stays a plain list of STRINGS so every step of the
        // navigation loop below is untouched; the locations ride alongside in
        // their own map. An existing list is unaffected: a line with no
        // location still reads Needham, exactly as before.
        const urlLines = urlInput.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.startsWith('http'));
        const urls = [];
        const locationByUrl = {};
        urlLines.forEach(line => {
            const parts = line.split(/\s+/);
            const url = parts[0];
            const loc = parts.slice(1).join(' ').trim();
            urls.push(url);
            if (loc) locationByUrl[url] = loc;
        });
        
        if (urls.length === 0) {
            alert('Please enter valid URLs (starting with http)');
            return;
        }
        
        this.shopifySettings = {
            ...this.shopifySettings,
            locationName: 'Needham',
            exportType: selectedFormat,
            format: selectedFormat
        };
        
        this.safeSetLocalStorage('asicsShopifySettings', JSON.stringify(this.shopifySettings));
        
        console.log(`Starting auto-scraping with ${selectedFormat.toUpperCase()} CSV format:`, this.shopifySettings);
        
        document.getElementById('progressArea').style.display = 'block';
        document.getElementById('startScraping').disabled = true;
        document.getElementById('startScraping').innerHTML = 'Scraping...';
        
        const formatStatus = document.getElementById('formatStatus');
        if (formatStatus) {
            formatStatus.innerHTML = `${selectedFormat.toUpperCase()} CSV`;
        }
        
        const scrapingConfig = {
            scrapingId: Date.now().toString(),
            urls: urls,
            locationByUrl: locationByUrl,
            currentIndex: 0,
            downloadEach: downloadEach,
            downloadChunked: downloadChunked,
            waitTime: waitTime,
            results: [],
            startTime: Date.now(),
            format: selectedFormat,
            shopifySettings: JSON.parse(JSON.stringify(this.shopifySettings))
        };
        
        console.log(`AUTO-SCRAPER: Starting with ${selectedFormat} format:`, scrapingConfig.shopifySettings);
        
        this.saveScrapeConfig(scrapingConfig);
        this.processNextUrlBackground(scrapingConfig, modal);
    }

    processNextUrlBackground(config, modal) {
        if (config.currentIndex >= config.urls.length) {
            this.completeBackgroundScraping(config, modal);
            return;
        }
        
        const url = config.urls[config.currentIndex];
        const progress = ((config.currentIndex / config.urls.length) * 100).toFixed(1);
        
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressPercent = document.getElementById('progressPercent');
        const currentUrlEl = document.getElementById('currentUrl');
        
        if (progressFill) progressFill.style.width = progress + '%';
        if (progressText) progressText.innerHTML = `Processing URL ${config.currentIndex + 1} of ${config.urls.length}`;
        if (progressPercent) progressPercent.innerHTML = `${progress}%`;
        if (currentUrlEl) currentUrlEl.innerHTML = url;
        
        console.log(`Processing URL ${config.currentIndex + 1}/${config.urls.length}: ${url}`);
        
        if (window.location.href === url) {
            console.log('Already on target URL, waiting for data to load...');
            this.waitAndExtractBackground(config, modal);
        } else {
            this.setupExtractionAfterNavigationBackground(config, modal, url);
            console.log('Navigating to:', url);
            window.location.href = url;
        }
    }

    waitAndExtractBackground(config, modal) {
        const maxWaitTime = config.waitTime || 60000;
        const checkInterval = 2000;
        const startTime = Date.now();
        
        const waitingStatus = document.getElementById('waitingStatus');
        
        const checkForData = () => {
            const elapsed = Date.now() - startTime;
            const remainingTime = Math.max(0, maxWaitTime - elapsed);
            
            if (waitingStatus) {
                waitingStatus.innerHTML = `Waiting for data... ${Math.ceil(remainingTime/1000)}s remaining`;
            }
            
            const readinessCheck = this.checkPageReadinessEnhanced();
            
            if (readinessCheck.ready && readinessCheck.hasCompleteData) {
                console.log('Complete inventory data detected');
                if (waitingStatus) {
                    waitingStatus.innerHTML = `Complete data found - extracting...`;
                }
                setTimeout(() => this.extractCurrentPageDataBackground(config, modal), 1000);
                return;
            }
            
            if (elapsed >= maxWaitTime) {
                if (readinessCheck.colorCount > 0 || readinessCheck.quantityCount > 50) {
                    console.log('Found partial data, proceeding');
                    setTimeout(() => this.extractCurrentPageDataBackground(config, modal), 1000);
                } else {
                    console.log('No usable data found, skipping');
                    config.results.push({
                        url: window.location.href,
                        data: [],
                        error: 'No inventory data found',
                        timestamp: new Date().toISOString(),
                        success: false,
                        recordCount: 0
                    });
                    
                    config.currentIndex++;
                    this.saveScrapeConfig(config);
                    
                    setTimeout(() => {
                        if (config.currentIndex < config.urls.length) {
                            const nextUrl = config.urls[config.currentIndex];
                            this.setupExtractionAfterNavigationBackground(config, modal, nextUrl);
                            window.location.href = nextUrl;
                        } else {
                            this.completeBackgroundScraping(config, modal);
                        }
                    }, 2000);
                }
                return;
            }
            
            setTimeout(checkForData, checkInterval);
        };
        
        setTimeout(checkForData, 3000);
    }

    async extractCurrentPageDataBackground(config, modal) {
        console.log(`Starting extraction with ${config.format.toUpperCase()} CSV format...`);
        
        try {
            this.shopifySettings = {
                ...this.shopifySettings,
                locationName: 'Needham',
                exportType: config.format,
                format: config.format
            };
            
            if (config.shopifySettings) {
                this.shopifySettings = {
                    ...this.shopifySettings,
                    ...config.shopifySettings,
                    locationName: 'Needham',
                    exportType: config.format,
                    format: config.format
                };
            }
            
            console.log(`AUTO-SCRAPER: Using ${config.format} settings:`, this.shopifySettings);
            
            // API FIRST, DOM SECOND. The rendered grid caps every deep size at
            // "30+", so a page scrape silently writes 30 where the real figure
            // can be 302. See extractInventoryDataFromApi.
            let inventoryData = null;
            let quantitySource = 'api';
            try {
                inventoryData = await this.extractInventoryDataFromApi();
            } catch (apiErr) {
                console.warn('ASICS: availability API failed, falling back to the page grid:', apiErr.message);
            }
            if (!inventoryData || !inventoryData.length) {
                quantitySource = 'dom';
                inventoryData = this.extractInventoryData();
                console.warn('ASICS: USING THE PAGE GRID, quantities above 30 are CAPPED at 30 for ' + window.location.href);
            }
            console.log(`Extracted ${inventoryData.length} inventory records from the ${quantitySource.toUpperCase()}`);

            // STAMP THE LOCATION BEFORE ANY CSV IS BUILT, from the line that
            // asked for this URL. It used to be stamped further down, after
            // convertToInventoryCSV had already run, so the per page file from
            // "download each" and the validation copy both said Needham while
            // only the chunked records carried the real location.
            const rowLocation = this.locationForScrapedUrl(config, window.location.href);
            if (rowLocation) {
                inventoryData = inventoryData.map(item => ({ ...item, locationName: rowLocation }));
                console.log('ASICS: this URL writes to ' + rowLocation + ', not Needham');
            }

            if (inventoryData.length === 0) {
                config.results.push({
                    url: window.location.href,
                    data: [],
                    error: 'No inventory data found',
                    timestamp: new Date().toISOString(),
                    success: false,
                    recordCount: 0,
                    format: config.format
                });
            } else {
                let csv, recordType;
                
                if (config.format === 'inventory') {
                    csv = this.shopifyConverter.convertToInventoryCSV(inventoryData, this.shopifySettings);
                    recordType = 'inventory records';
                    
                    // Fix the validation check - need to handle quoted headers
                    const firstLine = csv.split('\n')[0];
                    const csvHeaders = firstLine.match(/(".*?"|[^,]+)/g) || [];
                    
                    // Clean up the headers for counting (remove quotes)
                    const cleanHeaders = csvHeaders.map(h => h.replace(/^"|"$/g, ''));
                    
                    if (cleanHeaders.length !== 19) {
                        throw new Error(`Wrong format! Expected inventory CSV (19 columns), got ${cleanHeaders.length} columns`);
                    }
                    
                    // Check for required columns - handle quoted column names
                    const requiredColumns = ['Handle', 'SKU', 'Location', 'On hand (new)'];
                    const missingColumns = requiredColumns.filter(col => 
                        !cleanHeaders.some(h => h.includes(col))
                    );
                    
                    if (missingColumns.length > 0) {
                        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
                    }
                    
                    console.log(`AUTO-SCRAPER: Inventory CSV format verified - ${cleanHeaders.length} columns with Location and On hand (new)`);
                }else {
                    const shopifyData = this.shopifyConverter.convertToShopifyFormat(inventoryData, this.shopifySettings);
                    csv = this.shopifyConverter.convertToCSV(shopifyData, this.shopifySettings);
                    recordType = 'product variants';
                    
                    const csvHeaders = csv.split('\n')[0].split(',');
                    if (csvHeaders.length < 40) {
                        throw new Error(`Wrong format! Expected product CSV (40+ columns), got ${csvHeaders.length} columns`);
                    }
                    
                    console.log(`AUTO-SCRAPER: Product CSV format verified - ${csvHeaders.length} columns`);
                }
                
                // The location is already on every record, stamped above so
                // the CSVs built in between carry it too. The row builders read
                // variant.locationName first, so a single run can carry Needham
                // rows and Warehouse rows together.
                const dataRecords = inventoryData.map(item => ({
                    ...item,
                    locationName: item.locationName || rowLocation || '',
                    sourceUrl: window.location.href,
                    extractedAt: new Date().toISOString(),
                    urlIndex: config.currentIndex + 1,
                    format: config.format
                }));
                
                let chunkSaveFailed = false;
                let chunkSaveError = null;
                if (config.downloadChunked) {
                    const actionName = config.format === 'inventory' ? 'addToInventoryChunks' : 'addToProductChunks';
                    
                    const response = await this.sendToBackground(actionName, {
                        data: dataRecords,
                        csvContent: csv,
                        scrapingId: config.scrapingId,
                        format: config.format
                    });
                    
                    if (response.success) {
                        const chunkStatus = document.getElementById('chunkStatus');
                        if (chunkStatus) {
                            chunkStatus.innerHTML = `Chunk ${response.currentChunk}: ${response.currentChunkSize} ${recordType} | Total: ${response.totalRecords}`;
                        }
                    } else {
                        // There was no else here, and the result below was pushed with
                        // success hardcoded true, so a failed chunk save produced no
                        // message anywhere and still counted as a clean page. Rows went
                        // missing from the export with nothing saying why. The same bug
                        // was found and fixed in the Brooks scraper.
                        chunkSaveFailed = true;
                        chunkSaveError = (response && response.error) || 'unknown storage error';
                        console.error(`❌ ASICS: FAILED to save ${dataRecords.length} ${recordType} for ${window.location.href}: ${chunkSaveError}`);
                        const chunkStatus = document.getElementById('chunkStatus');
                        if (chunkStatus) {
                            chunkStatus.innerHTML = `<span style="color:#ff6b6b">SAVE FAILED: ${chunkSaveError}. ${dataRecords.length} ${recordType} were NOT stored.</span>`;
                        }
                    }
                }
                
                // NOTE: do NOT store `data` or `csvContent` here. The real data
                // already lives in the background chunk store (chrome.storage.local).
                // Keeping it here too duplicates every variant 2-3x and blows past
                // the 5MB page-localStorage quota around ~1000 records, which silently
                // kills the auto-scraper. Store only the lightweight summary.
                config.results.push({
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    success: !chunkSaveFailed,
                    saveError: chunkSaveFailed ? chunkSaveError : undefined,
                    recordCount: dataRecords.length,
                    format: config.format
                });
                
                if (config.downloadEach && dataRecords.length > 0) {
                    const filename = `asics-${config.format}-url-${config.currentIndex + 1}-${stampForFilename()}.csv`;
                    this.downloadCSV(csv, filename);
                }
            }
            
            config.currentIndex++;
            this.saveScrapeConfig(config);
            
            setTimeout(() => {
                if (config.currentIndex < config.urls.length) {
                    const nextUrl = config.urls[config.currentIndex];
                    this.setupExtractionAfterNavigationBackground(config, modal, nextUrl);
                    window.location.href = nextUrl;
                } else {
                    this.completeBackgroundScraping(config, modal);
                }
            }, 2000);
            
        } catch (error) {
            console.error('Error extracting from current page:', error);
            
            config.results.push({
                url: window.location.href,
                data: [],
                error: error.message,
                timestamp: new Date().toISOString(),
                success: false,
                recordCount: 0,
                format: config.format
            });
            
            config.currentIndex++;
            this.saveScrapeConfig(config);
            
            setTimeout(() => {
                if (config.currentIndex < config.urls.length) {
                    const nextUrl = config.urls[config.currentIndex];
                    this.setupExtractionAfterNavigationBackground(config, modal, nextUrl);
                    window.location.href = nextUrl;
                } else {
                    this.completeBackgroundScraping(config, modal);
                }
            }, 2000);
        }
    }

    async completeBackgroundScraping(config, modal) {
        const formatUpper = config.format.toUpperCase();
        console.log(`Auto-scraping completed with ${formatUpper} CSV format!`);
        
        if (config.downloadChunked) {
            const response = await this.sendToBackground('finalizeScraping', {
                scrapingId: config.scrapingId,
                format: config.format
            });
            
            if (response.success) {
                console.log(`Downloaded ${response.totalChunks} ${config.format} chunks with ${response.totalRecords} total records`);
            }
        }
        
        const successfulResults = config.results.filter(r => r.success);
        const failedResults = config.results.filter(r => !r.success);
        const totalTime = ((Date.now() - config.startTime) / 1000).toFixed(1);
        
        // Update progress display
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressPercent = document.getElementById('progressPercent');
        const currentUrlEl = document.getElementById('currentUrl');
        const waitingStatus = document.getElementById('waitingStatus');
        const chunkStatus = document.getElementById('chunkStatus');
        const formatStatus = document.getElementById('formatStatus');
        
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.innerHTML = `Completed in ${totalTime}s`;
        if (progressPercent) progressPercent.innerHTML = '100%';
        if (currentUrlEl) currentUrlEl.innerHTML = `${formatUpper} CSV scraping completed successfully`;
        if (waitingStatus) waitingStatus.innerHTML = 'Ready for Shopify import';
        if (chunkStatus) chunkStatus.innerHTML = `All ${config.format} chunks downloaded`;
        if (formatStatus) formatStatus.innerHTML = `${formatUpper} CSV completed`;
        
        this.safeRemoveLocalStorage('asicsAutoScrapeConfig');
        
        const startBtn = document.getElementById('startScraping');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = 'Start Auto-Scraping';
        }
        
        const importInstructions = config.format === 'inventory' 
            ? 'Import to: Products → Inventory → Import'
            : 'Import to: Products → Import';
        
        alert(`${formatUpper} CSV Auto-scraping completed in ${totalTime} seconds!\n\nSuccessful: ${successfulResults.length}\nFailed: ${failedResults.length}\n${formatUpper} CSV files downloaded\n\n${importInstructions}\nReady for Shopify import!`);
    }

    setupExtractionAfterNavigationBackground(config, modal, url) {
        const extractionConfig = {
            ...config,
            targetUrl: url,
            extractAfterLoad: true
        };
        this.saveScrapeConfig(extractionConfig);
    }

    setupBackgroundMessageListener() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === 'chunkDownloaded') {
                    const format = message.data.format || 'product';
                    const count = message.data.recordCount || message.data.variantCount;
                    this.showSuccessMessage(`Downloaded Part ${message.data.chunkNumber}: ${count} ${format} records`);
                }
                
                if (message.action === 'downloadCSVFallback') {
                    console.log('Content: Using fallback download for chunk', message.data.chunkNumber);
                    this.downloadCSV(message.data.csv, message.data.filename);
                    
                    const format = message.data.format || 'product';
                    const count = message.data.recordCount || message.data.variantCount;
                    this.showSuccessMessage(`Downloaded Part ${message.data.chunkNumber}: ${count} ${format} records (fallback)`);
                }
            });
        }
    }

    async sendToBackground(action, data) {
        return new Promise((resolve, reject) => {
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                try {
                    chrome.runtime.sendMessage({
                        action: action,
                        data: data
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('Background message error:', chrome.runtime.lastError.message);
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (response) {
                            resolve(response);
                        } else {
                            console.warn('No response from background script');
                            resolve({ success: false, error: 'No response from background' });
                        }
                    });
                } catch (error) {
                    console.error('Send message failed:', error);
                    reject(error);
                }
            } else {
                reject(new Error('Chrome runtime not available'));
            }
        });
    }

    loadShopifySettings() {
        const savedSettings = this.safeGetLocalStorage('asicsShopifySettings');
        console.log('SETTINGS: Raw saved settings:', savedSettings);
        
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                console.log('SETTINGS: Parsed saved settings:', parsedSettings);
                
                this.shopifySettings = { 
                    ...this.shopifySettings, 
                    ...parsedSettings,
                    useMultiLocation: true,
                    locationName: 'Needham'
                };
                
                console.log('SETTINGS: Final settings:', this.shopifySettings);
            } catch (error) {
                console.error('Error parsing saved settings:', error);
            }
        } else {
            console.log('SETTINGS: No saved settings found, using defaults');
            this.shopifySettings = {
                ...this.shopifySettings,
                useMultiLocation: true,
                locationName: 'Needham'
            };
        }
        
        this.safeSetLocalStorage('asicsShopifySettings', JSON.stringify(this.shopifySettings));
    }

    setupAutoScraper() {
        setTimeout(() => {
            const configStr = this.safeGetLocalStorage('asicsAutoScrapeConfig');
            if (configStr) {
                try {
                    const config = JSON.parse(configStr);
                    
                    if (config.extractAfterLoad) {
                        console.log('Auto-scraper detected page load, restoring settings...');
                        
                        this.shopifySettings = {
                            ...this.shopifySettings,
                            useMultiLocation: true,
                            locationName: 'Needham'
                        };
                        
                        if (config.shopifySettings) {
                            console.log('AUTO-SCRAPER: Restoring settings:', config.shopifySettings);
                            this.shopifySettings = {
                                ...this.shopifySettings,
                                ...config.shopifySettings,
                                useMultiLocation: true,
                                locationName: 'Needham'
                            };
                        }
                        
                        this.safeSetLocalStorage('asicsShopifySettings', JSON.stringify(this.shopifySettings));
                        console.log('AUTO-SCRAPER: Settings restored and saved');
                        
                        delete config.extractAfterLoad;
                        this.saveScrapeConfig(config);
                        
                        if (!document.querySelector('.asics-auto-scraper-modal')) {
                            this.showAutoScraperProgress(config);
                        }
                        
                        this.waitAndExtractBackground(config, null);
                    }
                } catch (e) {
                    console.error('Error parsing auto-scrape config:', e);
                    this.safeRemoveLocalStorage('asicsAutoScrapeConfig');
                }
            }
        }, 1000);
    }

    // THE RENDERED GRID IS CAPPED AT 30 AND THE API IS NOT.
    //
    // The portal prints "30+" for any size with more than 30 available, which
    // is maxQuantityDisplayed in the data behind it. parseQuantity turns that
    // string into the number 30, so every deep size was being written to
    // Shopify as 30. Measured on TF3085 2026-10-23: Black Small is really 161,
    // Black Medium 205, Red Medium 302, and all three read as 30 off the page.
    //
    // For dropship footwear that understates a popular shoe. For the race merch
    // singlets it is worse, because those listings sell to a whole marathon
    // field against ASICS stock that runs into the hundreds.
    //
    // The page has already fetched the real figures by the time this runs, from
    // the same endpoint the fast path uses, so this asks for them directly and
    // falls back to the DOM only if that fails. A fallback scrape is still
    // capped, so it says so loudly rather than quietly writing 30s.
    // AND THE COLORWAYS MUST BE CATALOG ROWS, NOT ANYTHING THE PAGE SHOWS.
    //
    // recordsFromAvailability was written for the fast path, which hands it raw
    // rows from /aac/products. It reads itemCode, itemName, the NUMERIC gender,
    // widthLabel and widthTranslationCode, and compactSizes for the barcodes.
    // The first version of this function built colorways out of getProductInfo
    // and findColors instead, which carry styleId, productName and a gender
    // word, so every single field it read came back undefined or empty: real
    // quantities attached to records with no style, no name and no gender, and
    // because the array was non-empty the DOM fallback never fired either. The
    // scrape looked like it ran and produced nothing usable.
    //
    // So fetch the catalog and use that style's own rows.
    async extractInventoryDataFromApi() {
        const info = this.getProductInfo();
        const styleId = info && info.styleId;
        const basketNo = this.basketNoFromUrl();
        // getProductInfo defaults styleId to the STRING "Unknown", not to a
        // falsy value, so test for it explicitly or the URL becomes
        // /aac/products/Unknown/availability.
        if (!styleId || styleId === 'Unknown' || !basketNo) return null;

        const rows = await this.apiCatalogRows(basketNo);
        let colorways = rows.filter((r) => String(r.itemCode) === String(styleId));
        if (!colorways.length) return null;

        // Keep the COLOUR SET THE PAGE SHOWS, so switching this path from the
        // DOM to the API changes the quantities and nothing else. A style's
        // catalog rows cover every colour ASICS sells, which is wider than the
        // link was pointing at, and an extra colour reads downstream as a new
        // colorway. Codes are compared with leading zeros stripped because the
        // page prints "090" where the URL and the catalog say "90".
        const bare = (c) => String(c).replace(/^0+/, '');
        const onPage = new Set(this.findColors().map((c) => bare(c.code)));
        if (onPage.size) {
            const narrowed = colorways.filter((r) => onPage.has(bare(r.colorCode)));
            // Only narrow if it actually matched something. Returning nothing
            // here would be read as "no stock" rather than as a failed match.
            if (narrowed.length) colorways = narrowed;
        }

        const colorCodes = [...new Set(colorways.map((c) => c.colorCode))].map((c) => c + ':').join(',');
        const url = '/aac/products/' + encodeURIComponent(styleId) +
            '/availability?basketNo=' + encodeURIComponent(basketNo) +
            '&colorCodeDistributorNo=' + colorCodes;
        const av = await this.apiGet(url);
        const records = this.recordsFromAvailability(av, colorways);
        return records && records.length ? records : null;
    }

    // The catalog is the same for every link in a run, so it is fetched once
    // and cached. The cache goes in sessionStorage as well as on the class
    // because the link scraper NAVIGATES, which tears the content script down
    // between pages and loses anything held in memory. Same origin and same
    // tab throughout, so sessionStorage survives exactly as far as the run
    // does. A quota failure is not worth failing a scrape over, so it falls
    // back to re-fetching.
    async apiCatalogRows(basketNo) {
        const C = EnhancedASICSInventoryExtractor;
        const key = 'rhAsicsCatalog:' + basketNo;
        if (C._catalogRows && C._catalogBasket === basketNo) return C._catalogRows;
        try {
            const cached = sessionStorage.getItem(key);
            if (cached) {
                const rows = JSON.parse(cached);
                if (Array.isArray(rows) && rows.length) {
                    C._catalogRows = rows;
                    C._catalogBasket = basketNo;
                    return rows;
                }
            }
        } catch (e) { /* unreadable cache, fetch it again */ }

        const cat = await this.apiGet('/aac/products?basketNo=' + encodeURIComponent(basketNo));
        const rows = (cat && cat.data) || [];
        C._catalogRows = rows;
        C._catalogBasket = basketNo;
        try { sessionStorage.setItem(key, JSON.stringify(rows)); } catch (e) { /* over quota, fine */ }
        return rows;
    }

    // The basket number is in the path: /orders/100671391/products/TF3085
    basketNoFromUrl() {
        const m = /\/orders\/(\d+)\//.exec(window.location.pathname);
        return m ? m[1] : '';
    }

    extractInventoryData() {
        const inventory = [];
        const productInfo = this.getProductInfo();
        
        console.log('Extracting from product:', productInfo.productName);
        console.log('Shoe width detected:', productInfo.width);
        console.log('Gender detected:', productInfo.gender);
        
        const colors = this.findColors();
        const sizes = this.findSizes();
        const quantityMatrix = this.findQuantityMatrix();
        
        // CRITICAL: Only process as many rows as we have colors
        const rowsToProcess = Math.min(colors.length, quantityMatrix.length);
        
        for (let i = 0; i < rowsToProcess; i++) {
            const color = colors[i];
            const colorQuantities = quantityMatrix[i];
            
            // Check if this is a duplicate by looking for existing entries
            const existingEntry = inventory.find(item => 
                item.colorCode === color.code && 
                item.sizeUS === sizes[0] // Check first size
            );
            
            // Skip if we already processed this color
            if (existingEntry) {
                console.log(`Skipping duplicate color: ${color.code}`);
                continue;
            }
            
            sizes.forEach((size, sizeIndex) => {
                const quantity = colorQuantities[sizeIndex] || '0';
                
                inventory.push({
                    productName: productInfo.productName,
                    styleId: productInfo.styleId,
                    colorCode: color.code,
                    colorName: color.name,
                    sizeUS: size,
                    quantity: this.parseQuantity(quantity),
                    rawQuantity: quantity,
                    width: productInfo.width,  // ADDED: Include width info in each variant
                    gender: productInfo.gender, // ADDED: Include gender in each variant
                    extractedAt: new Date().toISOString(),
                    url: window.location.href
                });
            });
        }
        
        console.log('Extracted', inventory.length, 'inventory records');
        if (productInfo.width.isWide) {
            console.log('✅ WIDE SHOE DETECTED - Variants will have wide SKUs and separate handles');
        }
        return inventory;
    }
    extractShoeWidth() {
        // Look for the "Shoe width" label in the product info section
        const productInfoDivs = document.querySelectorAll('.product-info');
        
        for (const div of productInfoDivs) {
            const valueSpan = div.querySelector('.product-info-value');
            const labelSpan = div.querySelector('.product-info-label');
            
            // FIXED: Check if VALUE contains "Shoe width" (they're reversed!)
            if (valueSpan && labelSpan && valueSpan.textContent.trim() === 'Shoe width') {
                const widthText = labelSpan.textContent.trim(); // Width is in the LABEL
                
                console.log('Found shoe width:', widthText);
                
                // Parse the width text to extract width code
                // Examples: "Wide (2E)", "Standard (D)", "Extra Wide (4E)"
                if (widthText.includes('Wide (2E)') || widthText === '2E') {
                    return { code: '2E', name: 'Wide', isWide: true };
                } else if (widthText.includes('Extra Wide (4E)') || widthText === '4E') {
                    return { code: '4E', name: 'Extra Wide', isWide: true };
                } else if (widthText.includes('Standard (D)') || widthText === 'D' || widthText.includes('Standard')) {
                    return { code: 'D', name: 'Standard', isWide: false };
                } else if (widthText.includes('Narrow (B)') || widthText === 'B') {
                    return { code: 'B', name: 'Narrow', isWide: false };
                }
                
                // Fallback - try to extract any code in parentheses
                const match = widthText.match(/\(([A-Z0-9]+)\)/);
                if (match) {
                    const code = match[1];
                    const isWide = code.includes('E') || widthText.toLowerCase().includes('wide');
                    return { 
                        code: code, 
                        name: widthText.split('(')[0].trim(), 
                        isWide: isWide 
                    };
                }
            }
        }
        
        console.log('No shoe width found, defaulting to Standard (D)');
        // Default to standard width if not found
        return { code: 'D', name: 'Standard', isWide: false };
    }

    extractGender() {
        // Look for the "Gender" label in the product info section
        const productInfoDivs = document.querySelectorAll('.product-info');
        
        for (const div of productInfoDivs) {
            const valueSpan = div.querySelector('.product-info-value');
            const labelSpan = div.querySelector('.product-info-label');
            
            // Check if VALUE contains "Gender" (they're reversed like width!)
            if (valueSpan && labelSpan && valueSpan.textContent.trim() === 'Gender') {
                const genderText = labelSpan.textContent.trim(); // Gender is in the LABEL
                
                console.log('Found gender:', genderText);
                
                // Normalize gender text
                const normalizedGender = genderText.toLowerCase();
                if (normalizedGender.includes('men') && !normalizedGender.includes('women')) {
                    return 'Men';
                } else if (normalizedGender.includes('women')) {
                    return 'Women';
                } else if (normalizedGender.includes('unisex') || normalizedGender.includes('neutral')) {
                    return 'Unisex';
                } else if (normalizedGender.includes('kid') || normalizedGender.includes('child')) {
                    return 'Kids';
                } else {
                    return genderText; // Return as-is if unrecognized
                }
            }
        }
        
        console.log('No gender found, defaulting to Unisex');
        return 'Unisex';
    }

    getProductInfo() {
        const productNameSelectors = [
            'h1',
            '[data-testid="product-name"]',
            '.product-name',
            '.product-title'
        ];
        
        let productName = 'Unknown Product';
        for (let selector of productNameSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
                productName = element.textContent.trim();
                break;
            }
        }
        
        let styleId = 'Unknown';
        const urlMatch = window.location.href.match(/\/([0-9A-Z]+)(?:\?|$)/);
        if (urlMatch) {
            styleId = urlMatch[1];
        } else {
            const styleElement = document.querySelector('[data-testid="style-id"], .style-id');
            if (styleElement) {
                styleId = styleElement.textContent.trim();
            }
        }
        
        // Extract shoe width information
        const width = this.extractShoeWidth();
        
        // Extract gender information
        const gender = this.extractGender();
        
        console.log('Product Info:', { productName, styleId, width, gender });
        
        return { productName, styleId, width, gender };
    }

    findColors() {
        const colors = [];
        
        const colorElements = document.querySelectorAll('li div.flex.items-center.gap-2');
        
        colorElements.forEach(el => {
            const spans = el.querySelectorAll('span');
            if (spans.length >= 3) {
                const code = spans[0].textContent.trim();
                const separator = spans[1].textContent.trim();
                const name = spans[2].textContent.trim();
                
                if (code.match(/^\d{3}$/) && separator === '-') {
                    colors.push({ code, name });
                }
            }
        });
        
        if (colors.length === 0) {
            const allElements = document.querySelectorAll('*');
            const seenCodes = new Set();
            
            allElements.forEach(el => {
                const text = el.textContent.trim();
                const colorMatch = text.match(/^(\d{3})\s*-\s*([A-Z\/\s]+)$/);
                if (colorMatch && !seenCodes.has(colorMatch[1])) {
                    seenCodes.add(colorMatch[1]);
                    colors.push({
                        code: colorMatch[1],
                        name: colorMatch[2].trim()
                    });
                }
            });
        }
        
        return colors;
    }

    findSizes() {
        const sizes = [];
        
        const sizeElements = document.querySelectorAll('.bg-primary.text-white');
        
        sizeElements.forEach(el => {
            const sizeText = el.textContent.trim();
            if (sizeText.match(/^\d+\.?\d*$/)) {
                sizes.push(sizeText);
            }
        });
        
        if (sizes.length === 0) {
            return ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '14', '15'];
        }
        
        return sizes;
    }

    findQuantityMatrix() {
        const quantityMatrix = [];
        
        // Find ALL list items including those with "Product not available"
        // Look for the main inventory container first
        const inventoryContainers = document.querySelectorAll('ul[data-v-1cad65fe]');
        
        console.log('[DEBUG] Found inventory containers:', inventoryContainers.length);
        
        // FALLBACK: If no containers with data-v-1cad65fe, try more generic selectors
        if (inventoryContainers.length === 0) {
            console.log('[DEBUG] No inventory containers found with data-v-1cad65fe, trying fallback selectors...');
            
            // Try to find ANY ul elements that might contain inventory
            const allUls = document.querySelectorAll('ul');
            console.log('[DEBUG] Total ul elements on page:', allUls.length);
            
            // Look for ul elements that have list items with quantity data
            allUls.forEach((ul, idx) => {
                const hasQuantityData = ul.querySelector('.flex.items-center.justify-center span');
                if (hasQuantityData) {
                    console.log(`[DEBUG] Found potential inventory ul at index ${idx}:`, ul);
                }
            });
        }
        
        inventoryContainers.forEach((container, containerIdx) => {
            let listItems = container.querySelectorAll('li[data-v-e4dd3fec]');
            console.log(`[DEBUG] Container ${containerIdx}: Found ${listItems.length} list items with specific selector`);
            
            // FALLBACK: If no li items with that attribute, try generic li
            if (listItems.length === 0) {
                listItems = container.querySelectorAll('li');
                console.log(`[DEBUG] Container ${containerIdx}: Using generic li selector, found ${listItems.length}`);
            }
            
            listItems.forEach((listItem, index) => {
                const itemPreview = listItem.outerHTML.substring(0, 300);
                console.log(`[DEBUG] List item ${index} preview:`, itemPreview);
                
                // Check if this row says "Product not available"
                const notAvailableDiv = listItem.querySelector('.flex.items-center.justify-center.h-\\[5\\.5rem\\]');
                
                if (notAvailableDiv && notAvailableDiv.textContent.includes('Product not available')) {
                    // This color is not available - push zeros to maintain alignment
                    const sizes = this.findSizes();
                    console.log('Found unavailable product row, adding zeros for', sizes.length, 'sizes');
                    quantityMatrix.push(new Array(sizes.length).fill('0'));
                } else {
                    // Look for the actual quantity grid
                    const quantityRow = listItem.querySelector('.grid.grid-flow-col.items-center');
                    console.log(`[DEBUG] List item ${index}: quantityRow found:`, !!quantityRow);
                    
                    if (quantityRow) {
                        const quantities = [];
                        const cells = quantityRow.querySelectorAll('.flex.items-center.justify-center span');
                        console.log(`[DEBUG] List item ${index}: Found ${cells.length} quantity cells`);
                        
                        cells.forEach(cell => {
                            const text = cell.textContent.trim();
                            console.log(`[DEBUG] Cell text: "${text}"`);
                            if (text.match(/^\d+\+?$/) || text === '0' || text === '0+' || text === '-') {
                                quantities.push(text);
                            }
                        });
                        
                        if (quantities.length > 0) {
                            console.log('Found quantity row with', quantities.length, 'values:', quantities);
                            quantityMatrix.push(quantities);
                        } else {
                            console.log(`[DEBUG] List item ${index}: No valid quantities extracted from ${cells.length} cells`);
                        }
                    } else {
                        console.log(`[DEBUG] List item ${index}: No quantityRow, checking for dashes...`);
                        // Check if there are dashes (indicating no inventory)
                        const dashCells = listItem.querySelectorAll('.flex.items-center.justify-center span');
                        console.log(`[DEBUG] List item ${index}: Found ${dashCells.length} dash cells`);
                        let hasDashes = false;
                        const dashQuantities = [];
                        
                        dashCells.forEach(cell => {
                            const text = cell.textContent.trim();
                            if (text === '-') {
                                hasDashes = true;
                                dashQuantities.push('0');
                            }
                        });
                        
                        if (hasDashes && dashQuantities.length >= 10) {
                            console.log('Found dash row, converting to zeros');
                            quantityMatrix.push(dashQuantities);
                        } else {
                            console.log(`[DEBUG] List item ${index}: Not enough dashes (${dashQuantities.length})`);
                        }
                    }
                }
            });
        });
        
        console.log('Total quantity matrix rows:', quantityMatrix.length);
        return quantityMatrix;
    }

    parseQuantity(quantityText) {
        if (!quantityText || quantityText === '-' || quantityText === '') return 0;
        
        if (quantityText.includes('+')) {
            const num = parseInt(quantityText.replace('+', ''));
            return isNaN(num) ? 0 : num;
        }
        
        const num = parseInt(quantityText);
        return isNaN(num) ? 0 : num;
    }

    checkPageReadinessEnhanced() {
        const checks = {
            hasColors: false,
            hasSizes: false,
            hasQuantities: false,
            hasInventoryGrid: false,
            hasCompleteData: false,
            colorCount: 0,
            sizeCount: 0,
            quantityCount: 0,
            quantityRowCount: 0,
            hasNonZeroQuantities: false
        };
        
        console.log('[PAGE READINESS CHECK] Starting...');
        
        const colorElements = document.querySelectorAll('li div.flex.items-center.gap-2');
        console.log('[PAGE READINESS] Color elements found:', colorElements.length);
        colorElements.forEach(el => {
            const spans = el.querySelectorAll('span');
            if (spans.length >= 3) {
                const code = spans[0].textContent.trim();
                const separator = spans[1].textContent.trim();
                const name = spans[2].textContent.trim();
                if (code.match(/^\d{3}$/) && separator === '-' && name.length > 0) {
                    checks.hasColors = true;
                    checks.colorCount++;
                }
            }
        });
        console.log('[PAGE READINESS] Valid colors:', checks.colorCount);
        
        const sizeElements = document.querySelectorAll('.bg-primary.text-white');
        console.log('[PAGE READINESS] Size elements found:', sizeElements.length);
        sizeElements.forEach(el => {
            const sizeText = el.textContent.trim();
            if (sizeText.match(/^\d+\.?\d*$/) && parseFloat(sizeText) >= 6 && parseFloat(sizeText) <= 16) {
                checks.hasSizes = true;
                checks.sizeCount++;
            }
        });
        console.log('[PAGE READINESS] Valid sizes:', checks.sizeCount);
        
        const quantityRows = document.querySelectorAll('.grid.grid-flow-col.items-center');
        console.log('[PAGE READINESS] Quantity rows found:', quantityRows.length);
        quantityRows.forEach(row => {
            const cells = row.querySelectorAll('.flex.items-center.justify-center span');
            if (cells.length >= 10) {
                checks.hasQuantities = true;
                checks.quantityRowCount++;
                
                cells.forEach(cell => {
                    const text = cell.textContent.trim();
                    if (text.match(/^\d+\+?$/) || text === '0' || text === '0+' || text === '-') {
                        checks.quantityCount++;
                        
                        if (text.match(/^[1-9]\d*\+?$/)) {
                            checks.hasNonZeroQuantities = true;
                        }
                    }
                });
            }
        });
        console.log('[PAGE READINESS] Valid quantity rows:', checks.quantityRowCount);
        console.log('[PAGE READINESS] Total quantity values:', checks.quantityCount);
        console.log('[PAGE READINESS] Has non-zero quantities:', checks.hasNonZeroQuantities);
        
        const inventoryGrid = document.querySelector('.grid.grid-cols-\\[12rem\\,minmax\\(4\\.5rem\\,auto\\)\\,9\\.5rem\\]');
        if (inventoryGrid) {
            checks.hasInventoryGrid = true;
        }
        
        const hasSeasonInfo = document.querySelector('[class*="bg-secondary"]') !== null;
        const hasProductImages = document.querySelectorAll('picture img').length > 0;
        
        const hasMinimumColors = checks.colorCount >= 1;
        const hasMinimumSizes = checks.sizeCount >= 10;
        const hasMinimumQuantities = checks.quantityCount >= 50;
        const hasMinimumRows = checks.quantityRowCount >= 1;
        
        checks.hasCompleteData = (
            hasMinimumColors &&
            hasMinimumSizes &&
            hasMinimumQuantities &&
            hasMinimumRows &&
            checks.hasInventoryGrid &&
            hasSeasonInfo
        );
        
        checks.ready = (
            checks.hasColors &&
            checks.hasSizes &&
            checks.hasQuantities &&
            checks.hasInventoryGrid
        );
        
        return checks;
    }

    showAutoScraperProgress(config) {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'asics-auto-scraper-modal';
        progressDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 30000;
            background: white; padding: 20px; border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3); min-width: 300px;
        `;
        
        progressDiv.innerHTML = `
            <h4 style="margin-bottom: 15px;">Auto-Scraping ${config.format?.toUpperCase() || 'CSV'}</h4>
            <div style="margin-bottom: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 13px; color: #666; font-weight: 500;">Overall Progress</span>
                    <span id="progressPercent" style="font-size: 13px; color: #666; font-weight: 500;">0%</span>
                </div>
                <div style="background: #e9ecef; height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="progressFill" style="background: linear-gradient(90deg, #28a745, #20c997); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 4px;"></div>
                </div>
            </div>
            <div id="progressText">Processing...</div>
            <div id="currentUrl" style="font-size: 12px; color: #666; margin-top: 5px;"></div>
            <div id="waitingStatus" style="font-size: 12px; color: #007bff; margin-top: 5px;"></div>
            <div id="chunkStatus" style="font-size: 12px; color: #28a745; margin-top: 5px; font-weight: bold;"></div>
            <div id="formatStatus" style="font-size: 12px; color: #007bff; margin-top: 5px; font-weight: bold;"></div>
        `;
        
        document.body.appendChild(progressDiv);
    }

    // Safe localStorage methods
    // Build a tiny, persistable version of the scraping config. We must NEVER
    // serialize the full per-page data/CSV into localStorage (5MB origin cap) —
    // the background chunk store holds the real data. We only need enough state
    // to resume after a page navigation plus lightweight per-URL summaries.
    buildPersistableConfig(config) {
        const slim = {
            scrapingId: config.scrapingId,
            urls: config.urls,
            currentIndex: config.currentIndex,
            downloadEach: config.downloadEach,
            downloadChunked: config.downloadChunked,
            waitTime: config.waitTime,
            startTime: config.startTime,
            format: config.format,
            shopifySettings: config.shopifySettings,
            results: (config.results || []).map(r => ({
                url: r.url,
                success: r.success,
                recordCount: r.recordCount || 0,
                format: r.format,
                error: r.error
            }))
        };
        if (config.targetUrl) slim.targetUrl = config.targetUrl;
        if (config.extractAfterLoad) slim.extractAfterLoad = config.extractAfterLoad;
        return slim;
    }

    // Persist the scraping config across navigations using the slim form only.
    saveScrapeConfig(config) {
        return this.safeSetLocalStorage(
            'asicsAutoScrapeConfig',
            JSON.stringify(this.buildPersistableConfig(config))
        );
    }

    safeSetLocalStorage(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.warn('localStorage quota exceeded or error saving key:', key, error);
            // Try to free space by clearing unrelated keys, but do NOT delete the
            // resume key and then retry with the same oversized payload — that just
            // throws again and leaves us with no resume state at all.
            try {
                if (key !== 'asicsAutoScrapeConfig') {
                    localStorage.removeItem('asicsAutoScrapeConfig');
                }
                localStorage.setItem(key, value);
                return true;
            } catch (retryError) {
                console.error('localStorage save failed after cleanup:', retryError);
                return false;
            }
        }
    }

    safeGetLocalStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.warn('localStorage access failed for key:', key, error);
            return null;
        }
    }

    safeRemoveLocalStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn('localStorage removal failed for key:', key, error);
            return false;
        }
    }

    downloadCSV(csvContent, filename) {
        if (!csvContent) {
            console.error('No CSV content to download');
            return;
        }
        
        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            
            console.log('CSV download initiated:', filename);
        } catch (error) {
            console.error('CSV download failed:', error);
            try {
                const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
                const downloadAnchorNode = document.createElement('a');
                downloadAnchorNode.setAttribute("href", dataStr);
                downloadAnchorNode.setAttribute("download", filename);
                document.body.appendChild(downloadAnchorNode);
                downloadAnchorNode.click();
                downloadAnchorNode.remove();
                console.log('CSV download succeeded with fallback method');
            } catch (fallbackError) {
                console.error('Fallback CSV download also failed:', fallbackError);
                alert('Error downloading CSV file. Check console for details.');
            }
        }
    }

    showSuccessMessage(message) {
        const existingMessages = document.querySelectorAll('.asics-export-success');
        existingMessages.forEach(msg => {
            if (document.body.contains(msg)) {
                document.body.removeChild(msg);
            }
        });
        
        const notification = document.createElement('div');
        notification.className = 'asics-export-success';
        notification.innerHTML = message;
        notification.style.cssText = `
            position: fixed; top: 120px; right: 20px; z-index: 10000;
            background: #28a745; color: white; padding: 15px 20px;
            border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            max-width: 300px; word-wrap: break-word;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (document.body.contains(notification)) {
                notification.style.animation = 'slideOutRight 0.3s ease';
                setTimeout(() => {
                    if (document.body.contains(notification)) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
    }

    // ================= API EXTRACTION =================
    //
    // WHY THIS EXISTS. The DOM path walks a curated list of product URLs, one
    // page load at a time, and reads the numbers off the rendered grid. The
    // same data sits behind two JSON endpoints, so the walk is unnecessary.
    //
    // Measured 2026-10-14 against the live portal:
    //   - the whole catalog is ONE call, 3,609 colorways across 1,228 styles
    //   - stock is one call per style, about 0.9 seconds
    //   - all 577 footwear styles take about 9 minutes
    //
    // SIX CONCURRENT IS THE CEILING, do not raise it. At twelve the portal
    // returned 429 and throughput did not improve at all, 917ms per style
    // against about 900ms at six, so the server is the bottleneck and a wider
    // pool only gets us rate limited.
    //
    // THE AVAILABILITY FLAG IN THE CATALOG IS NOT STOCK. compactSizes carries
    // an "a0" or "a1" per size and skipping every all-a0 style would halve the
    // work. It is wrong: of four styles it marked unavailable, two held 19 and
    // 29 units. Trusting it would zero real inventory, so every style gets a
    // stock call.

    // ONE SHARED BRAKE, NOT SIX PRIVATE ONES.
    //
    // The first version backed off per request. With six workers that is the
    // worst possible shape: the portal starts throttling, all six keep firing
    // and each one independently sleeps and retries, so the portal stays
    // hammered, stays throttling, and every style burns its full retry ladder.
    // At 1.5s doubling to 30s over six attempts that is 76 seconds PER STYLE,
    // which turned a six minute run into an hour plus.
    //
    // So the brake is shared. The first worker to see a throttle sets a
    // cooldown and every worker waits behind it, which means the portal gets a
    // real pause instead of a continuing barrage, recovers, and the whole run
    // finishes sooner. Backing off harder is faster here, not slower.
    // PACE, DO NOT BURST. This is the thing that actually fixes the runtime.
    //
    // Six workers firing as fast as they can is a burst, and the portal limits
    // a sustained RATE. So the pattern was: burst, trip the limit, everybody
    // waits twenty seconds, burst again. Most of the run was spent in cooldown
    // and the useful throughput was far below what the limit actually allows.
    //
    // A steady gap between request STARTS fixes that. If the portal tolerates
    // roughly one a second, pacing at one a second finishes 398 styles in
    // about seven minutes having never once been throttled, which beats
    // bursting and stalling by a wide margin.
    //
    // The gap is adaptive because the real limit is unpublished: widen hard on
    // a throttle, narrow gently on a run of successes. Standard congestion
    // control, and it settles near whatever the portal actually allows instead
    // of guessing.
    async apiWait() {
        const C = EnhancedASICSInventoryExtractor;
        for (;;) {
            const now = Date.now();
            const until = Math.max(C._cooldownUntil || 0, (C._lastStart || 0) + (C._gapMs || C.API_MIN_GAP_MS));
            if (now >= until) { C._lastStart = now; return; }
            await new Promise((r) => setTimeout(r, until - now));
        }
    }

    apiBrake(attempt) {
        const C = EnhancedASICSInventoryExtractor;
        // Widen the steady pace, not just this one retry. A throttle means the
        // CURRENT rate is too fast, so every later request should slow too.
        C._gapMs = Math.min(C.API_MAX_GAP_MS, Math.max(C._gapMs || C.API_MIN_GAP_MS, C.API_MIN_GAP_MS) * 2);
        C._okStreak = 0;
        const delay = Math.min(15000, 1000 * Math.pow(2, attempt));
        C._cooldownUntil = Math.max(C._cooldownUntil || 0, Date.now() + delay);
        C._throttleHits = (C._throttleHits || 0) + 1;
    }

    apiEased() {
        // Narrow the gap again after a clean run, so one bad patch does not
        // leave the rest of the scrape crawling.
        const C = EnhancedASICSInventoryExtractor;
        C._okStreak = (C._okStreak || 0) + 1;
        if (C._okStreak >= 12 && (C._gapMs || 0) > C.API_MIN_GAP_MS) {
            C._gapMs = Math.max(C.API_MIN_GAP_MS, Math.round((C._gapMs || C.API_MIN_GAP_MS) * 0.8));
            C._okStreak = 0;
        }
    }

    async apiGet(url, attempt = 0) {
        await this.apiWait();
        const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } });

        // 429 AND 202 BOTH MEAN SLOW DOWN, and 202 is the dangerous one.
        //
        // Under load the availability route answers 202 Accepted with an EMPTY
        // body instead of 429. It is a soft throttle, not a real answer:
        // measured 2026-10-14, a style returned 202 three times across seven
        // seconds, then 200 with full stock after a 30 second pause.
        //
        // 202 is a 2xx, so res.ok is TRUE. Treating it as success hands back a
        // style with no sizes, which reads downstream as "this shoe is out of
        // stock everywhere" and zeroes it. Retry it like a 429.
        if ((res.status === 429 || res.status === 202) && attempt < 6) {
            this.apiBrake(attempt);
            return this.apiGet(url, attempt + 1);
        }
        if (res.status === 202) throw new Error('ASICS API kept answering 202 (throttled) for ' + url);
        if (!res.ok) throw new Error('ASICS API ' + res.status + ' for ' + url);

        // An empty 200 is the same trap wearing a different number.
        const text = await res.text();
        if (!text.trim()) throw new Error('ASICS API returned an empty body for ' + url);
        this.apiEased();
        return JSON.parse(text);
    }

    async apiBasketNo() {
        // The basket number is "no", not "basketNo". Both endpoints need it and
        // a wrong one answers 403 rather than failing loudly.
        const b = await this.apiGet('/aac/baskets/current');
        const no = b && b.no;
        if (!no) throw new Error('Could not read the current ASICS basket. Open a basket in the portal and try again.');
        return no;
    }

    // compactSizes packs one segment per size, colon separated, each field
    // prefixed by a letter: x US size, u UK, e EU, c CM, # material number,
    // @ barcode, a availability. The material number is what the stock call
    // returns as variantNo, so it is how a barcode joins to a size.
    parseCompactSizes(compact) {
        const out = [];
        for (const seg of String(compact || '').split(':')) {
            if (!seg) continue;
            const f = {};
            for (const part of seg.split('|')) {
                if (!part) continue;
                f[part[0]] = part.slice(1);
            }
            if (f['#']) out.push({ variantNo: f['#'], barcode: f['@'] || '', sizeUS: f.x || '' });
        }
        return out;
    }

    widthFromCatalog(row) {
        // widthLabel already resolves the gender dependency, "Standard (B)" on
        // a women's shoe and "Wide (D)", so do not infer a class from the bare
        // code. widthTranslationCode is that same class, normalised.
        const code = row.width || 'D';
        const cls = row.widthTranslationCode || 'standard';
        const label = (row.widthLabel || '').split('(')[0].trim();
        return {
            code: code,
            name: label || (cls === 'extraWide' ? 'Extra Wide' : cls.charAt(0).toUpperCase() + cls.slice(1)),
            isWide: cls === 'wide' || cls === 'extraWide'
        };
    }

    recordsFromAvailability(av, colorways) {
        const byColor = new Map(colorways.map((c) => [String(c.colorCode), c]));
        // barcode lookup, material number to EAN, built from the catalog rows
        const barcodes = new Map();
        for (const c of colorways) {
            for (const sz of this.parseCompactSizes(c.compactSizes)) {
                if (sz.variantNo) barcodes.set(sz.variantNo, sz.barcode);
            }
        }

        const out = [];
        for (const block of (av && av.availability) || []) {
            const stock = block.stock || {};
            for (const colorCode of Object.keys(stock)) {
                const meta = byColor.get(String(colorCode));
                if (!meta) continue;
                const width = this.widthFromCatalog(meta);
                for (const sz of stock[colorCode] || []) {
                    const size = sz.sizeUS || sz.sizeKey;
                    if (!size) continue;
                    out.push({
                        styleId: meta.itemCode,
                        productName: meta.itemName || '',
                        colorCode: colorCode,
                        colorName: meta.colorName || '',
                        gender: EnhancedASICSInventoryExtractor.API_GENDER[String(meta.gender)] || '',
                        width: width,
                        sizeUS: String(size),
                        size: String(size),
                        // The REAL number. The rendered grid stops at
                        // maxQuantityDisplayed, which is 30, and 983 rows of the
                        // 2026-10-06 scrape sat at exactly that ceiling.
                        quantity: Math.max(0, parseInt(sz.quantityAvailable, 10) || 0),
                        barcode: barcodes.get(sz.variantNo) || '',
                        // ASICS' own ladder position, used only for ordering
                        sorting: typeof sz.sorting === 'number' ? sz.sorting : null
                    });
                }
            }
        }

        // SORT, BECAUSE NOTHING DOWNSTREAM WILL. The CSV row order is the
        // variant order Stage 4 creates, so an unsorted feed gives a new
        // product a jumbled size dropdown. The ON API path had exactly this
        // bug: it returned 5, 10.5, 6.5, 7 and that is what got created.
        //
        // ASICS ships a "sorting" integer per size, which is their own ladder
        // position and handles half sizes and width runs correctly, so prefer
        // it. Fall back to the size as a NUMBER, never as text, because text
        // puts "10" before "6".
        const sizeNum = (v) => {
            const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
            return isNaN(n) ? Infinity : n;
        };
        out.sort((a, b) =>
            String(a.styleId).localeCompare(String(b.styleId)) ||
            String(a.colorCode).localeCompare(String(b.colorCode)) ||
            (a.sorting != null && b.sorting != null ? a.sorting - b.sorting : 0) ||
            sizeNum(a.sizeUS) - sizeNum(b.sizeUS)
        );
        return out;
    }

    async fetchInventoryFromApi(onProgress) {
        const basketNo = await this.apiBasketNo();
        const cat = await this.apiGet('/aac/products?basketNo=' + encodeURIComponent(basketNo));
        const rows = (cat && cat.data) || [];

        // NARROWING THE SCRAPE, AND THE RULE THAT DECIDES WHAT IS SAFE TO CUT.
        //
        // A style left out of the feed is NOT neutral. InventoryTracker zeroes
        // by comparing the store against every SKU in the feed, so dropping a
        // style the store CARRIES reads as removed and zeroes its stock. Every
        // filter below was therefore checked against the 49 styles the store
        // actually carries, not chosen because it sounded sensible.
        //
        // Measured 2026-10-14, collection 3100 is 577 styles, not 577 running:
        //   577  all footwear
        //   398  running          179 are court and field, GEL-RESOLUTION,
        //                         COURT FF, UPCOURT, GEL-ROCKET, BLADE FF,
        //                         FIELD SPEED FF, GEL-LETHAL FIELD
        //   323  running, AW2025 onward
        //
        // Running only drops ZERO carried styles, so it is safe.
        //
        // KIDS ARE IN, deliberately, even though Kids' Shoes is out of dropship
        // scope elsewhere. The store carries 1014A396, NOVABLAST 6 GS, and
        // excluding kids dropped exactly that one style, which would have
        // zeroed it. The scope rule and what is actually stocked disagree, and
        // the feed has to follow what is stocked.
        //
        // SEASON CUTS OFF PRE-AW2025 and nothing else. Older seasons are run
        // down to about one unit, and the cut drops zero carried styles. Do NOT
        // extend this to future seasons: SS2027 is NOT a preorder gate the way
        // ON's launchDate is, it holds real At Once stock, 2,311 units on
        // SONICBLAST 2 alone. This is the At Once journey, in stock by
        // definition, so there is no not-yet-shippable problem to filter for.
        const C = EnhancedASICSInventoryExtractor;
        const allFootwear = rows.filter((r) => Number(r.collection) === C.API_FOOTWEAR_COLLECTION);
        let footwear = allFootwear;
        if (C.API_RUNNING_ONLY) {
            footwear = footwear.filter((r) => Object.keys(r.category || {}).indexOf('running') !== -1);
        }
        if (C.API_SEASONS && C.API_SEASONS.length) {
            footwear = footwear.filter((r) => C.API_SEASONS.indexOf(r.season) !== -1);
        }

        // THE FLOOR. A style the store already carries must NEVER be filtered
        // out, whatever the filters above say, because a missing style is not
        // missing data, it reads as removed and zeroes that shoe's stock.
        //
        // The checks that justified the filters were run once, against one
        // day's catalog. Seasons move: a carried style will eventually age out
        // of API_SEASONS on its own and would then vanish silently. This adds
        // every carried style back in regardless, so the filters can only ever
        // decide what EXTRA to pull, never what to lose.
        const kept = new Set(footwear.map((r) => r.itemCode));
        const readded = [];
        for (const r of allFootwear) {
            if (!kept.has(r.itemCode) && C.API_ALWAYS_INCLUDE.indexOf(r.itemCode) !== -1) {
                footwear.push(r);
                if (readded.indexOf(r.itemCode) === -1) readded.push(r.itemCode);
            }
        }
        if (readded.length) {
            console.log('ASICS API: added back ' + readded.length +
                ' carried styles the filters would have dropped: ' + readded.join(', '));
        }

        // And say so loudly if a carried style is not in the catalog at all,
        // because that one cannot be added back and WILL zero.
        const present = new Set(allFootwear.map((r) => r.itemCode));
        const absent = C.API_ALWAYS_INCLUDE.filter((c) => !present.has(c));
        if (absent.length) {
            console.warn('ASICS API: ' + absent.length + ' carried styles are not in the ASICS catalog ' +
                'at all, so they will be absent from the file and read as removed: ' + absent.join(', '));
        }
        this._lastAbsentCarried = absent;

        // One stock call covers every colorway of a style, so group first. The
        // colour codes must come from the catalog: a hardcoded list 400s on any
        // style that does not use those codes.
        const byStyle = new Map();
        for (const r of footwear) {
            if (!byStyle.has(r.itemCode)) byStyle.set(r.itemCode, []);
            byStyle.get(r.itemCode).push(r);
        }

        const styles = [...byStyle.keys()];
        const records = [];
        let done = 0;
        let failed = 0;
        const queue = styles.slice();
        // Shared pacing state is per run, not per page.
        EnhancedASICSInventoryExtractor._cooldownUntil = 0;
        EnhancedASICSInventoryExtractor._throttleHits = 0;
        EnhancedASICSInventoryExtractor._gapMs = EnhancedASICSInventoryExtractor.API_MIN_GAP_MS;
        EnhancedASICSInventoryExtractor._lastStart = 0;
        EnhancedASICSInventoryExtractor._okStreak = 0;

        const worker = async () => {
            while (queue.length) {
                const code = queue.shift();
                const colorways = byStyle.get(code);
                const colorCodes = [...new Set(colorways.map((c) => c.colorCode))].map((c) => c + ':').join(',');
                try {
                    const url = '/aac/products/' + encodeURIComponent(code) +
                        '/availability?basketNo=' + encodeURIComponent(basketNo) +
                        '&colorCodeDistributorNo=' + colorCodes;
                    const av = await this.apiGet(url);
                    records.push(...this.recordsFromAvailability(av, colorways));
                } catch (e) {
                    failed++;
                    console.warn('ASICS API: style ' + code + ' failed:', e.message);
                }
                done++;
                if (onProgress) onProgress(done, styles.length, records.length);
            }
        };

        const pool = Math.min(EnhancedASICSInventoryExtractor.API_CONCURRENCY, queue.length) || 1;
        await Promise.all(Array.from({ length: pool }, () => worker()));

        const hits = EnhancedASICSInventoryExtractor._throttleHits || 0;
        console.log('ASICS API: ' + styles.length + ' footwear styles, ' + records.length +
            ' size rows' + (failed ? ', ' + failed + ' styles failed' : '') +
            (hits ? ', throttled ' + hits + ' times' : ''));

        // A MISSING STYLE IS NOT AN EMPTY STYLE, and the difference matters.
        //
        // InventoryTracker decides what to zero by comparing the store against
        // every SKU in the feed, so a style that failed its stock call is not
        // "no change", it looks REMOVED and its Needham stock gets zeroed. A
        // partial file is therefore worse than no file, and this refuses rather
        // than hand one over.
        if (failed) {
            const pct = Math.round((failed / styles.length) * 100);
            if (pct > 2) {
                throw new Error(failed + ' of ' + styles.length + ' ASICS styles failed (' + pct +
                    ' percent). Refusing to build a CSV: the missing styles would read as removed ' +
                    'and zero their stock. Wait a few minutes for the portal throttle to clear and run it again.');
            }
            console.warn('ASICS API: ' + failed + ' styles failed, under the 2 percent threshold, continuing.');
        }
        if (!records.length) throw new Error('No ASICS stock came back. Are you still signed in to the B2B portal?');
        return records;
    }

    async runApiScrape() {
        const started = Date.now();
        const records = await this.fetchInventoryFromApi((done, total, rows) => {
            if (done % 25 === 0 || done === total) {
                console.log('ASICS API: ' + done + '/' + total + ' styles, ' + rows + ' rows');
            }
        });
        const csv = this.shopifyConverter.convertToInventoryCSV(records, this.shopifySettings);
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
            '_' + pad(d.getHours()) + pad(d.getMinutes());
        this.downloadCSV(csv, 'asics-inventory-api-' + stamp + '.csv');
        console.log('ASICS API: done in ' + Math.round((Date.now() - started) / 1000) + 's');
        return records.length;
    }
}

// ASICS writes gender as a code. Confirmed across all 3,609 catalog rows
// against their own item code convention, where the fourth digit is the
// gender: 1011 men, 1012 women, 1013 unisex, 1014 kids.
EnhancedASICSInventoryExtractor.API_GENDER = { '1': 'Men', '2': 'Women', '3': 'Kids', '4': 'Unisex' };
EnhancedASICSInventoryExtractor.API_FOOTWEAR_COLLECTION = 3100;
// Running, every age, recent seasons. Each cut is justified against the styles
// the store carries in fetchInventoryFromApi. Set API_SEASONS to null for all
// seasons, or API_RUNNING_ONLY to false to include court and field.
EnhancedASICSInventoryExtractor.API_RUNNING_ONLY = true;
// NULL ON PURPOSE, every season. Limiting to recent seasons saved about 90
// seconds and bought a drift risk that is not worth it: API_ALWAYS_INCLUDE is
// a hand refreshed floor, so a style added to the B2B link list and then aged
// out of a season window would be protected by neither and would zero. Pulling
// all 398 running styles means the season a product sits in never matters.
EnhancedASICSInventoryExtractor.API_SEASONS = null;
// Concurrency only has to cover request LATENCY now, because API_MIN_GAP_MS
// sets the actual rate. Four in flight against a roughly one second response
// is plenty, and a smaller pool means a cooldown stalls less work.
EnhancedASICSInventoryExtractor.API_CONCURRENCY = 4;
// Milliseconds between request STARTS, adaptive between these two bounds.
EnhancedASICSInventoryExtractor.API_MIN_GAP_MS = 700;
EnhancedASICSInventoryExtractor.API_MAX_GAP_MS = 8000;

// STYLES THE STORE CARRIES, which the filters are never allowed to drop. Taken
// from the 2026-10-06 scrape, which is what the Firestore B2B link list
// produced. This is a FLOOR, not the source of truth: adding a link does not
// update it. Refresh it from a recent scrape when the link list changes, and
// note that a style here but absent from ASICS' catalog is reported loudly
// rather than quietly skipped.
EnhancedASICSInventoryExtractor.API_ALWAYS_INCLUDE = [
    '1011B960', '1011B974', '1011C055', '1011C056', '1011C080', '1011C083',
    '1011C127', '1011C143', '1011C144', '1011C145', '1011C147', '1011C160',
    '1011C167', '1011C227', '1011C230', '1011C234', '1011C236', '1011C242',
    '1011C243', '1011C244', '1011C249', '1011C256', '1011C276', '1012B772',
    '1012B842', '1012B843', '1012B899', '1012B916', '1012B917', '1012B939',
    '1012B992', '1012B997', '1012B998', '1012C008', '1012C009', '1012C019',
    '1012C021', '1012C037', '1013A141', '1013A142', '1013A162', '1013A163',
    '1013A170', '1013A176', '1013A177', '1013A183', '1013A187', '1013A196',
    '1014A396'
];

// Initialize the extractor
function initializeExtractor() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => new EnhancedASICSInventoryExtractor(), 1000);
        });
    } else {
        setTimeout(() => new EnhancedASICSInventoryExtractor(), 1000);
    }
}

// Initialize immediately and also listen for dynamic content changes
initializeExtractor();

// Listen for navigation changes (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => new EnhancedASICSInventoryExtractor(), 2000);
    }
}).observe(document, { subtree: true, childList: true });

// Message listener for popup
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'extractInventory') {
            try {
                const extractor = new EnhancedASICSInventoryExtractor();
                const result = extractor.extractInventoryData();
                sendResponse({ success: true, count: result.length });
            } catch (error) {
                console.error('Message handler error:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
        // Whole-catalog pull straight from the portal's own API. Does not
        // navigate, so it works from any page on the B2B site.
        if (message.action === 'scrapeAllViaApi') {
            new EnhancedASICSInventoryExtractor().runApiScrape()
                .then((count) => sendResponse({ success: true, count: count }))
                .catch((error) => {
                    console.error('ASICS API scrape failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true;
        }
    });
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

console.log('🚀 ASICS Enhanced Unified Extension Loaded Successfully!');
console.log('✅ FINAL CORRECT: Inventory CSV now uses BOTH "Location" AND "On hand" columns');
console.log('📦 INVENTORY CSV: Uses "Location" + "On hand" columns - imports to Products > Inventory > Import');
console.log('🏪 PRODUCT CSV: Uses "Inventory at Needham" - imports to Products > Import');
console.log('🎯 AUTO-SCRAPER: Choose format in modal - supports both CSV types');
console.log('🔍 DEBUG MODE ENABLED: Will show detailed extraction logs');
console.log('');
console.log('⚠️  TROUBLESHOOTING GUIDE:');
console.log('   1. If seeing "0 inventory records" - Check [DEBUG] logs below');
console.log('   2. If containers = 0 - Page structure may have changed');
console.log('   3. If list items = 0 - Data attributes may have changed');  
console.log('   4. Make sure you are on a product page with inventory visible');
console.log('   5. Wait for page to fully load before clicking scraper button');
console.log('');