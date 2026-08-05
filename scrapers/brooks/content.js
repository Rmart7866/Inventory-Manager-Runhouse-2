// COMPLETE UNIFIED BROOKS Browser Extension - SEO-Optimized Handle Logic with Inventory Security
// Creates SEO-friendly handles using product name + color + width + SKU prefix for uniqueness
// SKU prefix prevents duplicates when same colorway exists across different size ranges (men's/women's)
// Matches HTML converter for consistent handle generation across inventory and product CSVs

// ============================================================================
// AUTO-CLICKER: Automatically clicks "At once" buttons to reveal inventory
// ============================================================================
class BrooksAutoClicker {
    constructor() {
        this.clickedButtons = new Set();
        this.autoClickEnabled = true;
        this.observerActive = false;
        this.clickDelay = 500; // ms delay between clicks
        this.lastClickTime = 0;
        
        console.log('🎯 Brooks Auto-Clicker initialized');
        this.init();
    }
    
    init() {
        // Start watching for "At once" buttons immediately
        this.startWatching();
        
        // Also check existing buttons on page load
        setTimeout(() => this.clickExistingButtons(), 1000);
    }
    
    startWatching() {
        if (this.observerActive) return;
        
        // Watch for new elements being added to the page
        const observer = new MutationObserver((mutations) => {
            if (!this.autoClickEnabled) return;
            
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        this.checkAndClickButton(node);
                        
                        // Also check children of added node
                        const buttons = node.querySelectorAll ? 
                            node.querySelectorAll('epc-delivery-period-now[placeholderlabel="At once"]') : [];
                        buttons.forEach(btn => this.clickButton(btn));
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        this.observerActive = true;
        console.log('👀 Auto-clicker observer active - watching for "At once" buttons');
    }
    
    checkAndClickButton(element) {
        // Check if this element or its children contain "At once" button
        if (element.matches && element.matches('epc-delivery-period-now[placeholderlabel="At once"]')) {
            this.clickButton(element);
        }
        
        // Also check for strong tags with "At once" text
        if (element.tagName === 'STRONG' && element.textContent.trim() === 'At once') {
            const deliveryPeriod = element.closest('epc-delivery-period-now');
            if (deliveryPeriod) {
                this.clickButton(deliveryPeriod);
            }
        }
    }
    
    clickExistingButtons() {
        if (!this.autoClickEnabled) return;
        
        // Find all "At once" buttons on the page
        const buttons = document.querySelectorAll('epc-delivery-period-now[placeholderlabel="At once"]');
        
        if (buttons.length > 0) {
            console.log(`🔍 Found ${buttons.length} "At once" button(s) - clicking now...`);
            buttons.forEach(btn => this.clickButton(btn));
        }
    }
    
    clickButton(button) {
        if (!button || !this.autoClickEnabled) return;
        
        // Create unique ID for this button to prevent duplicate clicks
        const buttonId = this.getButtonId(button);
        if (this.clickedButtons.has(buttonId)) {
            return; // Already clicked this button
        }
        
        // Rate limiting - don't click too fast
        const now = Date.now();
        if (now - this.lastClickTime < this.clickDelay) {
            setTimeout(() => this.clickButton(button), this.clickDelay);
            return;
        }
        
        try {
            // Mark as clicked before clicking to prevent race conditions
            this.clickedButtons.add(buttonId);
            this.lastClickTime = now;
            
            // Try multiple click methods for reliability
            button.click();
            
            // Also try clicking the inner elements
            const strongElement = button.querySelector('strong');
            if (strongElement) {
                strongElement.click();
            }
            
            // Dispatch actual click events
            button.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
            
            console.log('✅ Auto-clicked "At once" button:', buttonId);
            
            // Show visual feedback
            this.showClickNotification(button);
            
        } catch (error) {
            console.error('❌ Error clicking button:', error);
            this.clickedButtons.delete(buttonId); // Allow retry
        }
    }
    
    getButtonId(button) {
        // Create unique ID from button's position and content
        const rect = button.getBoundingClientRect();
        const text = button.textContent.trim();
        return `${text}-${rect.top}-${rect.left}`;
    }
    
    showClickNotification(button) {
        // Add temporary visual indicator
        const originalBorder = button.style.border;
        button.style.border = '2px solid #28a745';
        button.style.transition = 'border 0.3s ease';
        
        setTimeout(() => {
            button.style.border = originalBorder;
        }, 1000);
    }
    
    enable() {
        this.autoClickEnabled = true;
        console.log('✅ Auto-clicker enabled');
    }
    
    disable() {
        this.autoClickEnabled = false;
        console.log('⏸️ Auto-clicker disabled');
    }
    
    reset() {
        this.clickedButtons.clear();
        console.log('🔄 Auto-clicker reset - will re-click buttons');
    }
}

// Enhanced UnifiedShopifyConverter with Width-based Handles
class UnifiedBrooksShopifyConverter {
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

    // SEO-FRIENDLY HANDLE GENERATION - Product name + color + width + SKU prefix for uniqueness
    generateWidthBasedHandle(product, width, gender) {
        // Get product name and clean it
        const productName = (product.productName || '').toLowerCase()
            .replace(/brooks\s*/gi, '') // Remove "Brooks" prefix
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .trim();
        
        // Get color name and clean it
        const colorName = (product.colorName || product.colorCode || '').toLowerCase()
            .replace(/[^a-z0-9\s]/g, '') // Remove special chars
            .trim();
        
        // Start with product name
        let handleParts = [];
        
        if (productName) {
            handleParts.push(productName);
        } else {
            // Fallback to styleId if no product name
            handleParts.push(product.styleId || 'unknown');
        }
        
        // Add color
        if (colorName) {
            handleParts.push(colorName);
        }
        
        // Create base handle
        let baseHandle = handleParts.join('-')
            .replace(/\s+/g, '-') // Replace spaces with dashes
            .replace(/-+/g, '-') // Remove duplicate dashes
            .replace(/^-+|-+$/g, ''); // Trim dashes from ends
        
        // Add width to handle if present and not standard
        if (width && width.trim() && width.toUpperCase() !== 'B' && width.toUpperCase() !== 'M') {
            const cleanWidth = width.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanWidth) {
                baseHandle += `-${cleanWidth}`;
            }
        }
        
        // Add SKU prefix to handle to ensure uniqueness across different SKU families
        // This prevents duplicates when same colorway exists in multiple size ranges
        if (product.styleId) {
            const skuPrefix = product.styleId.toString().substring(0, 9); // First 9 digits
            baseHandle += `-${skuPrefix}`;
        }
        
        return baseHandle || 'unknown-product';
    }

    // INVENTORY CSV - For inventory updates only
    convertToInventoryCSV(inventoryData, settings = {}) {
        const csvSettings = { ...this.defaultSettings, ...settings };
        
        console.log('INVENTORY CSV: Converting with SEO-optimized handles');
        console.log('🔒 Security: Low quantities masked for competitive protection');
        
        const headers = [
            'Handle',
            'SKU',
            'Option1 Name',
            'Option1 Value',
            'Option2 Name', 
            'Option2 Value',
            'Option3 Name',
            'Option3 Value',
            'Location',
            'On hand'
        ];
        
        const csvRows = [];
        
        // Group by width first, then by colorway
        const widthGroups = {};
        inventoryData.forEach(item => {
            const width = item.width || 'B';
            const gender = item.gender || 'UNISEX';
            const key = `${item.styleId}-${item.colorCode}-${width}`;
            
            if (!widthGroups[key]) {
                widthGroups[key] = {
                    variants: [],
                    width: width,
                    gender: gender,
                    baseProduct: item
                };
            }
            widthGroups[key].variants.push(item);
        });
        
        Object.keys(widthGroups).forEach(groupKey => {
            const group = widthGroups[groupKey];
            const variants = group.variants;
            const baseProduct = group.baseProduct;
            const width = group.width;
            const gender = group.gender;
            
            // Use width-based handle generation
            const handle = this.generateWidthBasedHandle(baseProduct, width, gender);
            
            variants.forEach(variant => {
                const sku = this.generateSKU(variant);
                // Quantity already has security applied from extraction
                const quantity = Math.max(0, parseInt(variant.availableQuantity || variant.quantity) || 0);
                
                const csvRow = {
                    'Handle': handle,
                    'SKU': sku,
                    'Option1 Name': 'Size',
                    'Option1 Value': variant.sizeUS || variant.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    'Location': csvSettings.locationName || 'Needham',
                    'On hand': quantity
                };
                
                csvRows.push(csvRow);
            });
        });
        
        console.log('INVENTORY CSV: Generated', csvRows.length, 'inventory rows with SEO-optimized handles and security');
        
        // Convert to CSV format
        const csvContent = [
            headers.join(','),
            ...csvRows.map(row => headers.map(header => {
                const value = row[header] || '';
                if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        return csvContent;
    }

    convertToShopifyFormat(inventoryData, settings = {}) {
        const shopifySettings = { 
            ...this.defaultSettings, 
            ...settings,
            locationName: settings.locationName || 'Needham',
            useMultiLocation: true
        };
        
        console.log('PRODUCT CSV: Converting with SEO-optimized handles');
        console.log('🔒 Security: Low quantities masked for competitive protection');
        
        const shopifyRows = [];
        
        // Group by width first, then by colorway
        const widthGroups = {};
        inventoryData.forEach(item => {
            const width = item.width || 'B';
            const gender = item.gender || 'UNISEX';
            const key = `${item.styleId}-${item.colorCode}-${width}`;
            
            if (!widthGroups[key]) {
                widthGroups[key] = {
                    variants: [],
                    width: width,
                    gender: gender,
                    baseProduct: item
                };
            }
            widthGroups[key].variants.push(item);
        });
        
        Object.keys(widthGroups).forEach(groupKey => {
            const group = widthGroups[groupKey];
            const variants = group.variants;
            const baseProduct = group.baseProduct;
            const width = group.width;
            const gender = group.gender;
            
            // Simple handle with width code
            const handle = this.generateWidthBasedHandle(baseProduct, width);
            
            // Title stays as-is from product data
            const title = this.generateProductTitle(baseProduct);
            
            variants.forEach((variant, index) => {
                const isFirstVariant = index === 0;
                const sku = this.generateSKU(variant);
                
                const shopifyRow = {
                    'Handle': handle,
                    'Title': isFirstVariant ? title : '',
                    'Body (HTML)': isFirstVariant ? this.generateProductDescription(baseProduct) : '',
                    'Vendor': isFirstVariant ? shopifySettings.vendor : '',
                    'Product Category': isFirstVariant ? shopifySettings.productCategory : '',
                    'Type': isFirstVariant ? shopifySettings.productType : '',
                    'Tags': isFirstVariant ? this.generateTags(baseProduct, shopifySettings.tags) : '',
                    'Published': isFirstVariant ? shopifySettings.published : '',
                    'Option1 Name': isFirstVariant ? 'Size' : '',
                    'Option1 Value': variant.sizeUS || variant.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    'Variant SKU': sku,
                    'Variant Grams': '',
                    'Variant Inventory Tracker': shopifySettings.inventoryTracker,
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
                    'SEO Title': isFirstVariant ? title : '',
                    'SEO Description': isFirstVariant ? this.generateSEODescription(baseProduct) : '',
                    'Google Shopping / Google Product Category': '',
                    'Google Shopping / Gender': '',
                    'Google Shopping / Age Group': '',
                    'Google Shopping / MPN': '',
                    'Google Shopping / Condition': isFirstVariant ? shopifySettings.condition : '',
                    'Google Shopping / Custom Product': 'FALSE',
                    'Variant Image': '',
                    'Variant Weight Unit': 'kg',
                    'Variant Tax Code': '',
                    'Cost per item': '',
                    'Status': shopifySettings.status
                };

                // Multi-location inventory support for product CSV
                // Quantity already has security applied from extraction
                const quantity = Math.max(0, parseInt(variant.availableQuantity || variant.quantity) || 0);
                shopifyRow[`Inventory at ${shopifySettings.locationName}`] = quantity;

                // Market-specific pricing
                shopifyRow['Included / United States'] = 'TRUE';
                shopifyRow['Price / United States'] = shopifySettings.variantPrice;
                shopifyRow['Compare At Price / United States'] = shopifySettings.compareAtPrice;
                shopifyRow['Included / International'] = 'TRUE';
                shopifyRow['Price / International'] = shopifySettings.variantPrice;
                shopifyRow['Compare At Price / International'] = shopifySettings.compareAtPrice;
                
                shopifyRows.push(shopifyRow);
            });
        });
        
        console.log('PRODUCT CSV: Generated', shopifyRows.length, 'variants with width-based handles and security');
        return shopifyRows;
    }

    // CSV conversion methods
    convertToCSV(shopifyData, settings = {}) {
        if (!shopifyData || shopifyData.length === 0) return '';
        
        const finalSettings = {
            ...settings,
            locationName: settings.locationName || 'Needham',
            useMultiLocation: true
        };
        
        console.log('CSV: Converting with multi-location support and security');
        
        const baseHeaders = [
            'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Product Category', 'Type',
            'Tags', 'Published', 'Option1 Name', 'Option1 Value', 'Option2 Name',
            'Option2 Value', 'Option3 Name', 'Option3 Value', 'Variant SKU',
            'Variant Grams', 'Variant Inventory Tracker'
        ];

        const inventoryHeaders = [];
        inventoryHeaders.push(`Inventory at ${finalSettings.locationName}`);

        const restHeaders = [
            'Variant Inventory Policy', 'Variant Fulfillment Service', 'Variant Price',
            'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
            'Variant Barcode', 'Image Src', 'Image Position', 'Image Alt Text',
            'Gift Card', 'SEO Title', 'SEO Description', 'Google Shopping / Google Product Category',
            'Google Shopping / Gender', 'Google Shopping / Age Group', 'Google Shopping / MPN',
            'Google Shopping / Condition', 'Google Shopping / Custom Product', 'Variant Image',
            'Variant Weight Unit', 'Variant Tax Code', 'Cost per item',
            'Included / United States', 'Price / United States', 'Compare At Price / United States',
            'Included / International', 'Price / International', 'Compare At Price / International',
            'Status'
        ];

        const allHeaders = [...baseHeaders, ...inventoryHeaders, ...restHeaders];
        
        const csvContent = [
            allHeaders.join(','),
            ...shopifyData.map(row => allHeaders.map(header => {
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
            const key = `${item.styleId || item.productName}-${item.colorCode || item.colorName}`;
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
        return `${styleId}-${colorCode}`.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    }

    generateProductTitle(product) {
        const productName = product.productName || 'Unknown Product';
        const colorName = product.colorName || 'Default Color';
        
        const cleanProductName = productName.replace(/<[^>]*>/g, '').trim();
        const cleanColorName = colorName.replace(/<[^>]*>/g, '').trim();
        
        return `${cleanProductName} - ${cleanColorName}`;
    }

    generateProductDescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        const gender = product.gender || '';
        
        const cleanProductName = productName.replace(/<[^>]*>/g, '').trim();
        const cleanStyleId = styleId.replace(/<[^>]*>/g, '').trim();
        const cleanColorName = colorName.replace(/<[^>]*>/g, '').trim();
        const cleanGender = gender.replace(/<[^>]*>/g, '').trim();
        
        let description = `<p><strong>${cleanProductName}</strong></p>`;
        description += `<p><strong>Style:</strong> ${cleanStyleId}</p>`;
        description += `<p><strong>Color:</strong> ${cleanColorName}</p>`;
        
        if (cleanGender && cleanGender !== 'UNISEX') {
            description += `<p><strong>Gender:</strong> ${cleanGender}</p>`;
        }
        
        description += `<p>High-performance athletic footwear from ${this.brand}.</p>`;
        
        return description;
    }

    generateSEODescription(product) {
        const productName = product.productName || 'Unknown Product';
        const styleId = product.styleId || 'Unknown Style';
        const colorName = product.colorName || 'Default Color';
        
        const cleanProductName = productName.replace(/<[^>]*>/g, '').trim();
        const cleanStyleId = styleId.replace(/<[^>]*>/g, '').trim();
        const cleanColorName = colorName.replace(/<[^>]*>/g, '').trim();
        
        return `${cleanProductName} in ${cleanColorName}. Style ${cleanStyleId} from ${this.brand}. High-performance athletic footwear.`;
    }

    generateTags(product, baseTags) {
        const productName = product.productName || '';
        const styleId = product.styleId || '';
        const colorName = product.colorName || '';
        const gender = product.gender || '';
        
        const cleanProductName = productName.replace(/<[^>]*>/g, '').trim();
        const cleanStyleId = styleId.replace(/<[^>]*>/g, '').trim();
        const cleanColorName = colorName.replace(/<[^>]*>/g, '').trim();
        const cleanGender = gender.replace(/<[^>]*>/g, '').trim();
        
        let tags = baseTags;
        if (cleanProductName) tags += `, ${cleanProductName}`;
        if (cleanStyleId) tags += `, ${cleanStyleId}`;
        if (cleanColorName) tags += `, ${cleanColorName}`;
        if (cleanGender && cleanGender !== 'UNISEX') tags += `, ${cleanGender}`;
        return tags;
    }

    generateSKU(variant) {
        const styleId = variant.styleId || 'UNK';
        const colorCode = variant.colorCode || variant.colorName || 'DEF';
        const size = (variant.sizeUS || variant.size || 'OS').toString().replace(/\./g, '5');
        const width = variant.width || '';
        
        if (width) {
            return `${styleId}-${colorCode}-${size}-${width}`;
        } else {
            return `${styleId}-${colorCode}-${size}`;
        }
    }
}

class EnhancedBrooksInventoryExtractor {
    constructor() {
        this.shopifyConverter = new UnifiedBrooksShopifyConverter('Brooks');
        this.shopifySettings = {
            vendor: 'Brooks',
            productType: 'Footwear',
            tags: 'Athletic, Running, Brooks',
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
        
        window.brooksExtractor = this;
        
        this.init();
        this.setupAutoScraper();
        this.setupBackgroundMessageListener();
    }

    // INVENTORY SECURITY MEASURE
    applyInventorySecurity(quantity) {
        const actualQuantity = parseInt(quantity) || 0;
        
        // Security rules:
        // - If quantity is 3 or less, show as 0
        // - If quantity is between 4 and 10, show as 1
        // - If quantity is above 10, show actual quantity
        
        if (actualQuantity <= 3) {
            return 0;
        } else if (actualQuantity <= 10) {
            return 1;
        } else {
            return actualQuantity;
        }
    }

    init() {
        if (this.isProductPage()) {
            this.addAutoScraperButton();
            this.addSettingsButton();
        }
    }

    isProductPage() {
        return window.location.pathname.includes('overlay:cs/brooks') ||
               window.location.pathname.includes('/brooks/') ||
               window.location.pathname.includes('/basket') ||
               window.location.hostname.includes('fasttrack.brooksrunning.com');
    }

    addAutoScraperButton() {
        const autoBtn = document.createElement('button');
        autoBtn.innerHTML = 'Auto-Scrape';
        autoBtn.className = 'brooks-auto-scraper-btn';
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
        
        // Create reopen button (hidden initially)
        this.addReopenButton();
    }
    
    addReopenButton() {
        const reopenBtn = document.createElement('button');
        reopenBtn.innerHTML = '↻'; // Circular arrow refresh icon
        reopenBtn.className = 'brooks-reopen-btn';
        reopenBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: #28a745; color: white; border: none; 
            width: 40px; height: 40px;
            border-radius: 50%; cursor: pointer; 
            font-size: 24px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3); 
            display: none;
            align-items: center; justify-content: center;
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
        const autoBtn = document.querySelector('.brooks-auto-scraper-btn');
        const settingsBtn = document.querySelector('.brooks-settings-btn');
        const reopenBtn = document.querySelector('.brooks-reopen-btn');
        
        if (autoBtn && settingsBtn && reopenBtn) {
            if (autoBtn.style.display === 'none') {
                // Show scraper buttons
                autoBtn.style.display = 'block';
                settingsBtn.style.display = 'block';
                reopenBtn.style.display = 'none';
            } else {
                // Hide scraper buttons
                autoBtn.style.display = 'none';
                settingsBtn.style.display = 'none';
                reopenBtn.style.display = 'flex'; // Use flex to center the icon
            }
        }
    }

    addSettingsButton() {
        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = 'Settings';
        settingsBtn.className = 'brooks-settings-btn';
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
            
            <!-- SECURITY INFO -->
            <div style="background: #f0f8ff; padding: 12px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #4169e1;">
                <div style="font-size: 12px; color: #333;">
                    🔒 <strong>Inventory Security Active:</strong> Quantities ≤3 → 0 | Quantities 4-10 → 1 | Quantities >10 → Actual
                </div>
            </div>
            
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
                
                <!-- FORMAT DETAILS -->
                <div id="inventoryDetails" style="background: #d4edda; padding: 10px; border-radius: 5px; font-size: 12px; color: #155724;">
                    <strong>Inventory CSV:</strong><br>
                    • 10 columns: Handle, SKU, Options, "Location", "On hand"<br>
                    • Import to: Products → Inventory → Import<br>
                    • Best for: Updating stock levels for existing products<br>
                    • ✅ Width-based handles: Each width creates separate product<br>
                    • 🔒 Security: Low quantities are masked
                </div>
                
                <div id="productDetails" style="background: #d1ecf1; padding: 10px; border-radius: 5px; font-size: 12px; color: #0c5460; display: none;">
                    <strong>Product CSV:</strong><br>
                    • 48+ columns: Full product details, pricing, descriptions<br>
                    • Import to: Products → Import<br>
                    • Best for: Creating new products from scratch<br>
                    • ✅ Width-based handles: Each width creates separate product<br>
                    • 🔒 Security: Low quantities are masked
                </div>
            </div>
            
            <p style="margin-bottom: 15px; color: #666;">Enter URLs to scrape (one per line):</p>
            <textarea id="urlInput" style="width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-family: monospace;" placeholder="https://fasttrack.brooksrunning.com/overlay:cs/brooks/120431/120431070/?...
https://fasttrack.brooksrunning.com/overlay:cs/brooks/120432/120432001/?..."></textarea>
            
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
                    
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 13px; color: #666; font-weight: 500;">Overall Progress</span>
                            <span id="progressPercent" style="font-size: 13px; color: #666; font-weight: 500;">0%</span>
                        </div>
                        <div style="background: #e9ecef; height: 8px; border-radius: 4px; overflow: hidden;">
                            <div id="progressFill" style="background: linear-gradient(90deg, #28a745, #20c997); height: 100%; width: 0%; transition: width 0.3s ease; border-radius: 4px;"></div>
                        </div>
                    </div>
                    
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
                    
                    <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef; margin-bottom: 15px;">
                        <div style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Current URL</div>
                        <div id="currentUrl" style="font-size: 12px; color: #333; word-break: break-all;">Waiting to start...</div>
                    </div>
                    
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
                    
                    <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e9ecef; margin-top: 15px;">
                        <div style="font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 4px;">Security Summary</div>
                        <div id="securityStatus" style="font-size: 12px; color: #4169e1;">🔒 Security active - quantities masked</div>
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
        const savedSettings = this.safeGetLocalStorage('brooksShopifySettings');
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
            <h3 style="margin-bottom: 20px; color: #333;">Brooks Export Settings</h3>
            
            <!-- SECURITY INFO -->
            <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #4169e1;">
                <h4 style="margin: 0 0 10px 0; color: #333;">🔒 Inventory Security Protection</h4>
                <div style="font-size: 12px; color: #333;">
                    <strong>Automatic quantity masking:</strong><br>
                    • Quantities ≤3: Shows as 0 (out of stock)<br>
                    • Quantities 4-10: Shows as 1 (low stock)<br>
                    • Quantities >10: Shows actual quantity<br>
                    <br>
                    <em>Protects competitive intelligence while maintaining inventory management</em>
                </div>
            </div>
            
            <!-- WIDTH-BASED HANDLES INFO -->
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                <h4 style="margin: 0 0 10px 0; color: #856404;">✅ Width-based Product Separation</h4>
                <div style="font-size: 12px; color: #856404;">
                    <strong>Each width creates a separate product:</strong><br>
                    • Standard (D/B): product-name<br>
                    • Narrow (B/2A): product-name-narrow or product-name-2a<br>
                    • Wide (2E/4E): product-name-2e or product-name-4e<br>
                    • Women's Wide (D): product-name-wide<br>
                    <br>
                    <strong>✅ Matches HTML converter logic exactly</strong>
                </div>
            </div>
            
            <!-- INVENTORY CSV INFO -->
            <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #28a745;">
                <h4 style="margin: 0 0 10px 0; color: #155724;">Inventory CSV (Recommended)</h4>
                <div style="font-size: 12px; color: #155724;">
                    <strong>Purpose:</strong> Update inventory quantities for existing products<br>
                    <strong>Format:</strong> Handle, SKU, Options, "Location", "On hand"<br>
                    <strong>Import to:</strong> Products > Inventory > Import<br>
                    <strong>Security:</strong> Low quantities automatically masked
                </div>
            </div>
            
            <!-- PRODUCT CSV INFO -->
            <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #17a2b8;">
                <h4 style="margin: 0 0 10px 0; color: #0c5460;">Product CSV (For New Products)</h4>
                <div style="font-size: 12px; color: #0c5460;">
                    <strong>Purpose:</strong> Create new products with details<br>
                    <strong>Format:</strong> Full product info, descriptions, pricing<br>
                    <strong>Import to:</strong> Products > Import<br>
                    <strong>Security:</strong> Low quantities automatically masked
                </div>
            </div>
            
            <!-- LOCATION SETTINGS -->
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #007bff;">
                <h4 style="margin: 0 0 10px 0; color: #007bff;">Location Settings</h4>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Target Location Name:</label>
                    <input type="text" id="locationName" value="Needham" readonly style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; background: #e9ecef;" placeholder="Needham (LOCKED)">
                    <small style="color: #666; font-size: 11px;">Inventory CSV: Uses "Location" column. Product CSV: Uses "Inventory at [location]"</small>
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
        
        document.getElementById('saveSettings').onclick = () => {
            const newSettings = {
                ...this.shopifySettings,
                vendor: document.getElementById('vendor').value,
                variantPrice: document.getElementById('variantPrice').value,
                locationName: 'Needham'
            };
            
            this.shopifySettings = newSettings;
            this.safeSetLocalStorage('brooksShopifySettings', JSON.stringify(newSettings));
            
            document.body.removeChild(modal);
            this.showSuccessMessage('Settings saved! Security & width-based handles enabled.');
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
        
        const urls = urlInput.split('\n')
            .map(url => url.trim())
            .filter(url => url && url.startsWith('http'));
        
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
        
        this.safeSetLocalStorage('brooksShopifySettings', JSON.stringify(this.shopifySettings));
        
        console.log(`Starting auto-scraping with ${selectedFormat.toUpperCase()} CSV format, width-based handles, and security`);
        console.log('🔒 Security: Quantities ≤3 → 0, Quantities 4-10 → 1, Quantities >10 → Actual');
        
        document.getElementById('progressArea').style.display = 'block';
        document.getElementById('startScraping').disabled = true;
        document.getElementById('startScraping').innerHTML = 'Scraping...';
        
        const formatStatus = document.getElementById('formatStatus');
        if (formatStatus) {
            formatStatus.innerHTML = `${selectedFormat.toUpperCase()} CSV (Width-based)`;
        }
        
        const scrapingConfig = {
            scrapingId: Date.now().toString(),
            urls: urls,
            currentIndex: 0,
            downloadEach: downloadEach,
            downloadChunked: downloadChunked,
            waitTime: waitTime,
            results: [],
            startTime: Date.now(),
            format: selectedFormat,
            shopifySettings: JSON.parse(JSON.stringify(this.shopifySettings))
        };
        
        this.safeSetLocalStorage('brooksAutoScrapeConfig', JSON.stringify(scrapingConfig));
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
                waitingStatus.innerHTML = `Waiting for Brooks data... ${Math.ceil(remainingTime/1000)}s remaining`;
            }
            
            const readinessCheck = this.checkBrooksPageReadiness();
            
            if (readinessCheck.ready && readinessCheck.hasData) {
                console.log('Complete Brooks inventory data detected');
                if (waitingStatus) {
                    waitingStatus.innerHTML = `Complete Brooks data found - extracting with security...`;
                }
                setTimeout(() => this.extractCurrentPageDataBackground(config, modal), 1000);
                return;
            }
            
            if (elapsed >= maxWaitTime) {
                if (readinessCheck.hasPartialData || readinessCheck.inventoryInputCount > 50) {
                    console.log('Found partial data, proceeding');
                    setTimeout(() => this.extractCurrentPageDataBackground(config, modal), 1000);
                } else {
                    console.log('No usable data found, skipping');
                    config.results.push({
                        url: window.location.href,
                        data: [],
                        error: 'No Brooks inventory data found',
                        timestamp: new Date().toISOString(),
                        success: false,
                        recordCount: 0
                    });
                    
                    config.currentIndex++;
                    this.safeSetLocalStorage('brooksAutoScrapeConfig', JSON.stringify(config));
                    
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
        console.log(`Starting extraction with ${config.format.toUpperCase()} CSV format, width-based handles, and security...`);
        console.log('🔒 Security: Quantities ≤3 → 0, Quantities 4-10 → 1, Quantities >10 → Actual');
        
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
            
            console.log(`AUTO-SCRAPER: Using ${config.format} settings with width-based handles and security`);
            
            const inventoryData = this.extractInventoryDataUnified();
            console.log(`Extracted ${inventoryData.length} inventory records with security measures applied`);
            
            // Log security summary
            const securitySummary = {
                hidden: inventoryData.filter(item => item.rawData?.originalInventory <= 3).length,
                masked: inventoryData.filter(item => item.rawData?.originalInventory > 3 && item.rawData?.originalInventory <= 10).length,
                shown: inventoryData.filter(item => item.rawData?.originalInventory > 10).length
            };
            console.log(`🔒 Security Summary: ${securitySummary.hidden} hidden (0), ${securitySummary.masked} masked (1), ${securitySummary.shown} shown actual`);
            
            // Update security status in UI
            const securityStatus = document.getElementById('securityStatus');
            if (securityStatus) {
                securityStatus.innerHTML = `🔒 Hidden: ${securitySummary.hidden} | Masked: ${securitySummary.masked} | Shown: ${securitySummary.shown}`;
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
                    
                    const csvHeaders = csv.split('\n')[0].split(',');
                    if (csvHeaders.length !== 10) {
                        throw new Error(`Wrong format! Expected inventory CSV (10 columns), got ${csvHeaders.length} columns`);
                    }
                    
                    console.log(`AUTO-SCRAPER: Inventory CSV format verified with width-based handles and security`);
                    
                } else {
                    const shopifyData = this.shopifyConverter.convertToShopifyFormat(inventoryData, this.shopifySettings);
                    csv = this.shopifyConverter.convertToCSV(shopifyData, this.shopifySettings);
                    recordType = 'product variants';
                    
                    const csvHeaders = csv.split('\n')[0].split(',');
                    if (csvHeaders.length < 40) {
                        throw new Error(`Wrong format! Expected product CSV (40+ columns), got ${csvHeaders.length} columns`);
                    }
                    
                    console.log(`AUTO-SCRAPER: Product CSV format verified with width-based handles and security`);
                }
                
                const dataRecords = inventoryData.map(item => ({
                    ...item,
                    sourceUrl: window.location.href,
                    extractedAt: new Date().toISOString(),
                    urlIndex: config.currentIndex + 1,
                    format: config.format,
                    securityApplied: true
                }));
                
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
                    }
                }
                
                config.results.push({
                    url: window.location.href,
                    data: dataRecords,
                    csvContent: csv,
                    timestamp: new Date().toISOString(),
                    success: true,
                    recordCount: dataRecords.length,
                    format: config.format,
                    securitySummary: securitySummary
                });
                
                if (config.downloadEach && dataRecords.length > 0) {
                    const filename = `brooks-${config.format}-url-${config.currentIndex + 1}-${Date.now()}.csv`;
                    this.downloadCSV(csv, filename);
                }
            }
            
            config.currentIndex++;
            this.safeSetLocalStorage('brooksAutoScrapeConfig', JSON.stringify(config));
            
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
            this.safeSetLocalStorage('brooksAutoScrapeConfig', JSON.stringify(config));
            
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
        console.log(`Auto-scraping completed with ${formatUpper} CSV format, width-based handles, and security!`);
        
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
        
        // Calculate overall security summary
        let totalSecuritySummary = { hidden: 0, masked: 0, shown: 0 };
        successfulResults.forEach(result => {
            if (result.securitySummary) {
                totalSecuritySummary.hidden += result.securitySummary.hidden || 0;
                totalSecuritySummary.masked += result.securitySummary.masked || 0;
                totalSecuritySummary.shown += result.securitySummary.shown || 0;
            }
        });
        
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const progressPercent = document.getElementById('progressPercent');
        const currentUrlEl = document.getElementById('currentUrl');
        const waitingStatus = document.getElementById('waitingStatus');
        const chunkStatus = document.getElementById('chunkStatus');
        const formatStatus = document.getElementById('formatStatus');
        const securityStatus = document.getElementById('securityStatus');
        
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.innerHTML = `Completed in ${totalTime}s`;
        if (progressPercent) progressPercent.innerHTML = '100%';
        if (currentUrlEl) currentUrlEl.innerHTML = `${formatUpper} CSV scraping completed with security`;
        if (waitingStatus) waitingStatus.innerHTML = 'Ready for Shopify import';
        if (chunkStatus) chunkStatus.innerHTML = `All ${config.format} chunks downloaded`;
        if (formatStatus) formatStatus.innerHTML = `${formatUpper} CSV completed`;
        if (securityStatus) {
            securityStatus.innerHTML = `🔒 Final: ${totalSecuritySummary.hidden} hidden, ${totalSecuritySummary.masked} masked, ${totalSecuritySummary.shown} actual`;
        }
        
        this.safeRemoveLocalStorage('brooksAutoScrapeConfig');
        
        const startBtn = document.getElementById('startScraping');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = 'Start Auto-Scraping';
        }
        
        const importInstructions = config.format === 'inventory' 
            ? 'Import to: Products → Inventory → Import'
            : 'Import to: Products → Import';
        
        alert(`${formatUpper} CSV Auto-scraping completed in ${totalTime} seconds!\n\nSuccessful: ${successfulResults.length}\nFailed: ${failedResults.length}\n✅ Width-based handles: Each width creates separate product\n🔒 Security: ${totalSecuritySummary.hidden} hidden, ${totalSecuritySummary.masked} masked, ${totalSecuritySummary.shown} actual\n${formatUpper} CSV files downloaded\n\n${importInstructions}\nReady for Shopify import!`);
    }

    setupExtractionAfterNavigationBackground(config, modal, url) {
        const extractionConfig = {
            ...config,
            targetUrl: url,
            extractAfterLoad: true
        };
        this.safeSetLocalStorage('brooksAutoScrapeConfig', JSON.stringify(extractionConfig));
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
        const savedSettings = this.safeGetLocalStorage('brooksShopifySettings');
        
        if (savedSettings) {
            try {
                const parsedSettings = JSON.parse(savedSettings);
                
                this.shopifySettings = { 
                    ...this.shopifySettings, 
                    ...parsedSettings,
                    useMultiLocation: true,
                    locationName: 'Needham'
                };
            } catch (error) {
                console.error('Error parsing saved settings:', error);
            }
        } else {
            this.shopifySettings = {
                ...this.shopifySettings,
                useMultiLocation: true,
                locationName: 'Needham'
            };
        }
        
        this.safeSetLocalStorage('brooksShopifySettings', JSON.stringify(this.shopifySettings));
    }

    setupAutoScraper() {
        setTimeout(() => {
            const configStr = this.safeGetLocalStorage('brooksAutoScrapeConfig');
            if (configStr) {
                try {
                    const config = JSON.parse(configStr);
                    
                    if (config.extractAfterLoad) {
                        console.log('Auto-scraper detected page load, restoring settings with width-based handles and security...');
                        
                        this.shopifySettings = {
                            ...this.shopifySettings,
                            useMultiLocation: true,
                            locationName: 'Needham'
                        };
                        
                        if (config.shopifySettings) {
                            this.shopifySettings = {
                                ...this.shopifySettings,
                                ...config.shopifySettings,
                                useMultiLocation: true,
                                locationName: 'Needham'
                            };
                        }
                        
                        this.safeSetLocalStorage('brooksShopifySettings', JSON.stringify(this.shopifySettings));
                        
                        delete config.extractAfterLoad;
                        this.safeSetLocalStorage('brooksAutoScrapeConfig', JSON.stringify(config));
                        
                        if (!document.querySelector('.brooks-auto-scraper-modal')) {
                            this.showAutoScraperProgress(config);
                        }
                        
                        this.waitAndExtractBackground(config, null);
                    }
                } catch (e) {
                    console.error('Error parsing auto-scrape config:', e);
                    this.safeRemoveLocalStorage('brooksAutoScrapeConfig');
                }
            }
        }, 1000);
    }

    // Brooks-specific inventory extraction - keep existing logic
    extractInventoryDataUnified() {
        const inventoryData = [];
        
        console.log('UNIFIED EXTRACTION v5.1.0-WIDTH-BASED-SECURITY - Starting extraction...');
        console.log('🔒 Security: Quantities ≤3 → 0, Quantities 4-10 → 1, Quantities >10 → Actual');
        
        const layoutType = this.detectLayoutType();
        console.log(`Detected layout type: ${layoutType}`);
        
        const productInfo = this.extractProductInfo();
        console.log('Product Info:', productInfo);
        
        let gridData = [];
        
        if (layoutType === 'vertical') {
            gridData = this.extractVerticalGridData();
        } else if (layoutType === 'horizontal') {
            const colors = this.extractColorVariations();
            console.log(`Found ${colors.length} color variations`);
            
            const actualSizes = this.extractDynamicSizeRun();
            console.log('Actual sizes from grid header:', actualSizes);
            
            gridData = this.extractDynamicGridData(colors, actualSizes);
        } else {
            console.log('Unknown layout type, trying both methods...');
            gridData = this.extractVerticalGridData();
            if (gridData.length === 0) {
                const colors = this.extractColorVariations();
                const actualSizes = this.extractDynamicSizeRun();
                gridData = this.extractDynamicGridData(colors, actualSizes);
            }
        }
        
        console.log('Grid data extracted:', gridData.length, 'variants');
        
        gridData.forEach(item => {
            inventoryData.push({
                ...productInfo,
                ...item,
                extractedAt: new Date().toISOString(),
                url: window.location.href,
                pageType: `Brooks FastTrack v5.1.0-WIDTH-BASED-SECURITY-${layoutType}`
            });
        });
        
        const totalProducts = inventoryData.length;
        const nonZeroInventory = inventoryData.filter(item => item.availableQuantity > 0);
        
        // Calculate security summary
        const securitySummary = {
            hidden: inventoryData.filter(item => item.rawData?.originalInventory <= 3).length,
            masked: inventoryData.filter(item => item.rawData?.originalInventory > 3 && item.rawData?.originalInventory <= 10).length,
            shown: inventoryData.filter(item => item.rawData?.originalInventory > 10).length
        };
        
        console.log(`UNIFIED EXTRACTION RESULTS:`);
        console.log(`Total products extracted: ${totalProducts}`);
        console.log(`Products with inventory > 0: ${nonZeroInventory.length}`);
        console.log(`✅ Width-based handles will separate products by width`);
        console.log(`🔒 Security Summary: ${securitySummary.hidden} hidden (0), ${securitySummary.masked} masked (1), ${securitySummary.shown} shown actual`);
        
        return inventoryData;
    }

    // Keep all existing Brooks extraction methods...
    detectLayoutType() {
        const verticalGrid = document.querySelector('epc-vertical-size-grid');
        const verticalSizes = document.querySelector('.vertical-sizes');
        
        if (verticalGrid || verticalSizes) {
            return 'vertical';
        }
        
        const horizontalGrid = document.querySelector('.grid-row.product-grid');
        const gridHeader = document.querySelector('.grid-header');
        
        if (horizontalGrid || gridHeader) {
            return 'horizontal';
        }
        
        return 'unknown';
    }

    extractVerticalGridData() {
        const gridData = [];
        
        console.log('Starting VERTICAL grid data extraction...');
        
        const colors = this.extractColorsFromMaterials();
        console.log(`Found ${colors.length} colors in vertical layout`);
        
        const availableWidths = this.extractAvailableWidths();
        console.log(`Available widths:`, availableWidths);
        
        const sizeInventoryData = this.extractVerticalSizeInventory();
        console.log(`Found ${sizeInventoryData.length} size entries`);
        
        colors.forEach((color, colorIndex) => {
            availableWidths.forEach((width, widthIndex) => {
                sizeInventoryData.forEach((sizeData, sizeIndex) => {
                    gridData.push({
                        colorCode: color.code,
                        colorName: color.name,
                        colorImage: color.image,
                        width: width,
                        size: sizeData.size,
                        sizeUS: sizeData.size,
                        availableQuantity: sizeData.currentInventory,
                        quantity: sizeData.currentInventory,
                        maxQuantity: sizeData.maxInventory,
                        isBackorder: sizeData.isBackorder,
                        gridPosition: `VerticalColor${colorIndex}_Width${widthIndex}_Size${sizeIndex}`,
                        rawData: sizeData.rawData
                    });
                });
            });
        });
        
        console.log(`VERTICAL extraction complete: ${gridData.length} total variants`);
        return gridData;
    }

    extractColorsFromMaterials() {
        const colors = [];
        
        const materialElements = document.querySelectorAll('.materials .material');
        console.log(`Found ${materialElements.length} material elements in vertical layout`);
        
        materialElements.forEach((element, index) => {
            const titleElement = element.querySelector('.title small, .title');
            const imageElement = element.querySelector('img');
            const isActive = element.classList.contains('active');
            
            let title = titleElement?.textContent?.trim() || '';
            const image = imageElement?.src || '';
            
            let code = '';
            let name = title;
            
            const threeDigitMatch = title.match(/^(\d{3})\s+(.+)$/);
            if (threeDigitMatch) {
                code = threeDigitMatch[1];
                name = threeDigitMatch[2].trim();
            } else {
                code = String(index + 1).padStart(3, '0');
            }
            
            if (!name || name === code) {
                name = `Color ${code}`;
            }
            
            colors.push({
                code: code,
                name: name,
                image: image,
                index: index,
                isActive: isActive
            });
        });
        
        if (colors.length === 0) {
            colors.push({
                code: '001',
                name: 'Default Color',
                image: '',
                index: 0,
                isActive: true
            });
        }
        
        return colors;
    }

    extractAvailableWidths() {
        const widths = [];
        
        const widthElements = document.querySelectorAll('.horizontal-sizes .y-size');
        console.log(`Found ${widthElements.length} width elements in horizontal-sizes`);
        
        widthElements.forEach((element, index) => {
            const widthText = element.textContent.trim();
            const isActive = element.classList.contains('active');
            
            if (widthText && /^[A-Z0-9]+E?$/.test(widthText) && widthText.length <= 3) {
                widths.push(widthText);
            }
        });
        
        if (widths.length === 0) {
            console.log('No widths found in horizontal-sizes, using default');
            widths.push('B');
        }
        
        return widths;
    }

    extractVerticalSizeInventory() {
        const sizeData = [];
        
        const sizeElements = document.querySelectorAll('.vertical-sizes .x-size');
        console.log(`Found ${sizeElements.length} size elements in vertical-sizes`);
        
        sizeElements.forEach((element, index) => {
            const sizeSpan = element.querySelector('span');
            const size = sizeSpan ? sizeSpan.textContent.trim() : '';
            
            const inventoryCell = element.querySelector('[data-e2e="vertical-grid-cell"]');
            
            if (size && inventoryCell) {
                const inventoryData = this.extractInventoryFromCell(inventoryCell, size);
                
                sizeData.push({
                    size: size,
                    currentInventory: inventoryData.currentInventory,
                    maxInventory: inventoryData.maxInventory,
                    isBackorder: inventoryData.isBackorder,
                    rawData: inventoryData.rawData
                });
            }
        });
        
        return sizeData;
    }

    extractDynamicSizeRun() {
        const sizes = [];
        
        const sizeHeaders = document.querySelectorAll('[data-e2e="xSize"], .x-size');
        console.log(`Found ${sizeHeaders.length} size header elements`);
        
        sizeHeaders.forEach((sizeElement, index) => {
            const sizeText = sizeElement.textContent.trim();
            
            if (/^\d+\.?\d*$/.test(sizeText) && parseFloat(sizeText) >= 5.0 && parseFloat(sizeText) <= 20.0) {
                sizes.push(sizeText);
            }
        });
        
        console.log(`Extracted ${sizes.length} valid sizes from grid header:`, sizes);
        
        if (sizes.length === 0) {
            console.log('No sizes found in header, using fallback size run');
            return ['5.0', '5.5', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5', '9.0', '9.5', '10.0', '10.5', '11.0', '11.5', '12.0'];
        }
        
        return sizes;
    }

    extractDynamicGridData(colors, sizes) {
        const gridData = [];
        
        console.log('Starting horizontal grid data extraction...');
        
        const productRows = document.querySelectorAll('.grid-row.product-grid');
        console.log(`Found ${productRows.length} product grid rows`);
        
        productRows.forEach((row, colorIndex) => {
            const colorInfo = this.extractColorFromRow(row, colors, colorIndex);
            
            const widthElements = row.querySelectorAll('.y-size');
            const allInventoryGrids = row.querySelectorAll('.grid-row.cells');
            
            widthElements.forEach((widthElement, widthIndex) => {
                const isWidthHidden = widthElement.classList.contains('d-none');
                const widthText = widthElement.textContent.trim();
                
                if (isWidthHidden || !widthText || !/^[A-Z0-9]+E?$/.test(widthText) || widthText.length > 3) {
                    return;
                }
                
                const inventoryRow = allInventoryGrids[widthIndex];
                
                if (!inventoryRow || inventoryRow.classList.contains('d-none')) {
                    return;
                }
                
                const inventoryCells = inventoryRow.querySelectorAll('[data-e2e="grid-cell"]');
                
                inventoryCells.forEach((cell, sizeIndex) => {
                    const size = sizes[sizeIndex];
                    
                    if (!size) {
                        return;
                    }
                    
                    const inventoryData = this.extractInventoryFromCell(cell, size);
                    
                    gridData.push({
                        colorCode: colorInfo.code,
                        colorName: colorInfo.name,
                        colorImage: colorInfo.image,
                        width: widthText,
                        size: size,
                        sizeUS: size,
                        availableQuantity: inventoryData.currentInventory,
                        quantity: inventoryData.currentInventory,
                        maxQuantity: inventoryData.maxInventory,
                        isBackorder: inventoryData.isBackorder,
                        gridPosition: `Color${colorIndex}_Width${widthIndex}_Size${sizeIndex}`,
                        rawData: inventoryData.rawData
                    });
                });
            });
        });
        
        console.log(`Horizontal extraction complete: ${gridData.length} total variants`);
        return gridData;
    }

    extractInventoryFromCell(cell, size) {
        let currentInventory = 0;
        let maxInventory = 0;
        let isBackorder = false;
        const rawData = {};
        
        const factoryIcon = cell.querySelector('fa-icon[data-icon="industry-windows"], .factory-icon');
        const backorderIndicator = cell.querySelector('.backorder-indicator');
        
        if (factoryIcon || backorderIndicator) {
            return {
                currentInventory: 0,
                maxInventory: 0,
                isBackorder: true,
                rawData: { skippedReason: 'backorder_item' }
            };
        }
        
        const behindSpan = cell.querySelector('.behind .ng-star-inserted span, .behind span');
        if (behindSpan && behindSpan.textContent.trim()) {
            const spanText = behindSpan.textContent.trim();
            rawData.behindSpanText = spanText;
            
            if (spanText === '100+') {
                currentInventory = 100;
            } else if (!isNaN(spanText) && spanText !== '') {
                currentInventory = parseInt(spanText) || 0;
            }
        }
        
        const input = cell.querySelector('input[type="number"], input.size-quantity');
        if (input) {
            const maxAttr = input.getAttribute('max');
            if (maxAttr && !isNaN(maxAttr)) {
                maxInventory = parseInt(maxAttr) || 0;
            }
            
            if (!currentInventory && input.value && !isNaN(input.value)) {
                currentInventory = parseInt(input.value) || 0;
            }
            
            rawData.inputMax = maxAttr;
            rawData.inputValue = input.value;
        }
        
        const placeholderSpan = cell.querySelector('.input-active-placeholder .ng-star-inserted span, .input-active-placeholder span');
        if (placeholderSpan && placeholderSpan.textContent.trim() && !currentInventory) {
            const placeholderText = placeholderSpan.textContent.trim();
            rawData.placeholderText = placeholderText;
            
            if (placeholderText === '100+') {
                currentInventory = 100;
            } else if (!isNaN(placeholderText)) {
                currentInventory = parseInt(placeholderText) || 0;
            }
        }
        
        isBackorder = cell.querySelector('.backorder-indicator, [class*="factory"], fa-icon[data-icon="industry-windows"]') !== null;
        if (isBackorder) {
            currentInventory = 0;
            maxInventory = 0;
        }
        
        // Store original values before security
        rawData.originalInventory = currentInventory;
        rawData.originalMaxInventory = maxInventory;
        rawData.securityApplied = true;
        
        // APPLY INVENTORY SECURITY MEASURE
        const securedInventory = this.applyInventorySecurity(currentInventory);
        const securedMaxInventory = this.applyInventorySecurity(maxInventory);
        
        return {
            currentInventory: securedInventory,
            maxInventory: securedMaxInventory,
            isBackorder,
            rawData
        };
    }

    extractColorFromRow(row, colors, index) {
        const titleSelectors = [
            'epc-product-title span[data-e2e="title"]',
            '[data-e2e="title"]',
            '.title',
            'epc-product-title span',
            '.product-title',
            '.color-title'
        ];
        
        let titleElement = null;
        let titleText = '';
        
        for (const selector of titleSelectors) {
            titleElement = row.querySelector(selector);
            if (titleElement && titleElement.textContent.trim()) {
                titleText = titleElement.textContent.trim();
                break;
            }
        }
        
        if (titleText) {
            if (titleText.includes('-') && titleText.includes('%')) {
                const cleanTitleElement = row.querySelector('epc-product-title span:not([class*="discount"]):not([data-e2e="discount"])');
                if (cleanTitleElement) {
                    titleText = cleanTitleElement.textContent.trim();
                }
            }
            
            const threeDigitMatch = titleText.match(/^(\d{3})\s+(.+)$/);
            if (threeDigitMatch) {
                const cleanedName = threeDigitMatch[2]
                    .replace(/This color is unavailable.*$/, '')
                    .replace(/-\d+%.*$/, '')
                    .trim();
                
                return {
                    code: threeDigitMatch[1],
                    name: cleanedName,
                    image: this.extractImageFromRow(row)
                };
            }
            
            const codeMatch = titleText.match(/^(\d{3})/);
            if (codeMatch) {
                const cleanedName = titleText
                    .replace(/^\d{3}\s*/, '')
                    .replace(/-\d+%.*$/, '')
                    .trim();
                
                return {
                    code: codeMatch[1],
                    name: cleanedName,
                    image: this.extractImageFromRow(row)
                };
            }
            
            const cleanedTitle = titleText
                .replace(/-\d+%.*$/, '')
                .replace(/This color is unavailable.*$/, '')
                .trim();
            
            return {
                code: String(index + 1).padStart(3, '0'),
                name: cleanedTitle,
                image: this.extractImageFromRow(row)
            };
        }
        
        if (colors && colors[index]) {
            return colors[index];
        }
        
        return {
            code: String(index + 1).padStart(3, '0'),
            name: `Color ${index + 1}`,
            image: this.extractImageFromRow(row)
        };
    }

    extractImageFromRow(row) {
        const img = row.querySelector('img');
        return img ? img.src : '';
    }

    extractProductInfo() {
        let styleId = 'Unknown Style';
        let productName = 'Unknown Product';
        let gender = 'UNISEX';
        let wsp = 'N/A';
        let msrp = 'N/A';
        
        const styleIdElement = document.querySelector('[data-e2e="p-card-header-id"], [data-e2e*="style"], .style-id');
        if (styleIdElement) {
            const text = styleIdElement.textContent.trim();
            if (text.match(/^\d{6}-\d{3}$/)) {
                styleId = text;
            }
        }
        
        if (styleId === 'Unknown Style') {
            styleId = this.extractFromURL();
        }
        
        const titleSelectors = [
            '[data-e2e="pcard-title"]',
            '.price-title',
            '.product-title',
            '[title]',
            '.text-truncate[title]',
            '[data-e2e*="title"]',
            'h1, h2, h3',
            '.product-name',
            '.item-title'
        ];
        
        for (const selector of titleSelectors) {
            const titleElement = document.querySelector(selector);
            if (titleElement) {
                let title = titleElement.textContent?.trim();
                
                if (!title || title.length < 3) {
                    title = titleElement.getAttribute('title')?.trim();
                }
                
                if (title && title.length >= 3 && title !== 'Unknown Product') {
                    productName = title;
                    break;
                }
            }
        }
        
        if (productName === 'Unknown Product') {
            const pageTitle = document.title;
            if (pageTitle && pageTitle.includes('Brooks')) {
                const titleMatch = pageTitle.match(/Brooks\s+(.+?)(?:\s*-|\s*\||\s*$)/);
                if (titleMatch) {
                    productName = titleMatch[1].trim();
                }
            }
        }
        
        const genderElement = document.querySelector('.gender-men, .gender-women, .gender-unisex, [data-e2e="gender"]');
        if (genderElement) {
            const genderText = genderElement.textContent.trim().toUpperCase();
            if (genderText.includes('MEN')) gender = 'MEN';
            else if (genderText.includes('WOMEN')) gender = 'WOMEN';
        }
        
        const wspElement = document.querySelector('[data-e2e="product-price-wsp"] .price-value, .wsdp-price');
        if (wspElement) {
            wsp = wspElement.textContent.trim().replace(/[^\d.]/g, '');
        }
        
        const msrpElement = document.querySelector('[data-e2e="product-price-rrp"] .price-value');
        if (msrpElement) {
            msrp = msrpElement.textContent.trim().replace(/[^\d.]/g, '');
        }
        
        return {
            styleId,
            productName,
            gender,
            wsp,
            msrp
        };
    }
    
    extractFromURL() {
        const urlMatch = window.location.pathname.match(/\/brooks\/(\d+)\/(\d+)/);
        if (urlMatch) {
            return urlMatch[2] || urlMatch[1];
        }
        
        const pathParts = window.location.pathname.split('/');
        for (const part of pathParts) {
            if (/^\d{6,}$/.test(part)) {
                return part;
            }
        }
        
        return 'Unknown Style';
    }
    
    extractColorVariations() {
        const colors = [];
        
        const materialElements = document.querySelectorAll('[class*="material"]');
        
        if (materialElements.length > 0) {
            materialElements.forEach((element, index) => {
                const titleElement = element.querySelector('.title, [class*="title"], small, span, .color-name, .material-name');
                const imageElement = element.querySelector('img');
                
                let title = titleElement?.textContent?.trim() || '';
                const image = imageElement?.src || '';
                
                let code = '';
                let name = title;
                
                const threeDigitMatch = title.match(/^(\d{3})\s+(.+)$/);
                if (threeDigitMatch) {
                    code = threeDigitMatch[1];
                    name = threeDigitMatch[2];
                    name = name.replace(/This color is unavailable for selected date.*$/, '').trim();
                } else {
                    code = String(index + 1).padStart(3, '0');
                }
                
                if (!name || name === code) {
                    name = `Color ${code}`;
                }
                
                colors.push({
                    code: code,
                    name: name,
                    image: image,
                    index: index
                });
            });
        } else {
            const urlStyleId = this.extractFromURL();
            colors.push({
                code: urlStyleId !== 'Unknown Style' ? urlStyleId.slice(-3) : '081',
                name: 'Default Color',
                image: '',
                index: 0
            });
        }
        
        return colors;
    }

    checkBrooksPageReadiness() {
        const checks = {
            hasData: false,
            hasPartialData: false,
            ready: false,
            inventoryInputCount: 0,
            materialCount: 0,
            hasNonZeroQuantities: false
        };
        
        const inventoryInputSelectors = [
            'input.size-quantity',
            'input[type="number"][max]',
            'input[data-e2e="cell"]',
            '.grid-cell input'
        ];
        
        let allInventoryInputs = [];
        inventoryInputSelectors.forEach(selector => {
            const inputs = document.querySelectorAll(selector);
            if (inputs.length > 0 && allInventoryInputs.length === 0) {
                allInventoryInputs = Array.from(inputs);
            }
        });
        
        checks.inventoryInputCount = allInventoryInputs.length;
        
        const realInventoryInputs = Array.from(allInventoryInputs).filter(input => {
            const max = parseInt(input.getAttribute('max')) || 0;
            return max > 0;
        });
        
        if (realInventoryInputs.length > 0) {
            checks.hasNonZeroQuantities = true;
        }
        
        const materialSelectors = [
            '[class*="material"]',
            '.material',
            '.materials .material',
            '.product-grid'
        ];
        
        materialSelectors.forEach(selector => {
            const materials = document.querySelectorAll(selector);
            if (materials.length > 0) {
                checks.materialCount = Math.max(checks.materialCount, materials.length);
            }
        });
        
        const readinessIndicators = [
            document.querySelector('.config-strip-toolbar') !== null,
            document.querySelector('[data-e2e="size-grid"]') !== null,
            document.querySelector('.grid-header') !== null,
            document.querySelector('.grid-row.product-grid') !== null,
            checks.materialCount > 0,
            checks.inventoryInputCount > 0
        ];
        
        const readyIndicatorCount = readinessIndicators.filter(Boolean).length;
        checks.ready = readyIndicatorCount >= 2;
        
        checks.hasPartialData = checks.inventoryInputCount > 10 || checks.materialCount > 0;
        checks.hasData = checks.inventoryInputCount > 20 && checks.materialCount > 0;
        
        return checks;
    }

    showAutoScraperProgress(config) {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'brooks-auto-scraper-modal';
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
            <div id="securityStatus" style="font-size: 12px; color: #4169e1; margin-top: 5px; font-weight: bold;">🔒 Security active</div>
        `;
        
        document.body.appendChild(progressDiv);
    }

    // Safe localStorage methods
    safeSetLocalStorage(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.warn('localStorage quota exceeded or error saving key:', key, error);
            try {
                localStorage.removeItem('brooksAutoScrapeConfig');
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
        const existingMessages = document.querySelectorAll('.brooks-export-success');
        existingMessages.forEach(msg => {
            if (document.body.contains(msg)) {
                document.body.removeChild(msg);
            }
        });
        
        const notification = document.createElement('div');
        notification.className = 'brooks-export-success';
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
}

// Global auto-clicker instance
let brooksAutoClicker = null;

// Initialize the extractor
function initializeBrooksExtractor() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                new EnhancedBrooksInventoryExtractor();
                // Initialize auto-clicker
                if (!brooksAutoClicker) {
                    brooksAutoClicker = new BrooksAutoClicker();
                }
            }, 1000);
        });
    } else {
        setTimeout(() => {
            new EnhancedBrooksInventoryExtractor();
            // Initialize auto-clicker
            if (!brooksAutoClicker) {
                brooksAutoClicker = new BrooksAutoClicker();
            }
        }, 1000);
    }
}

// Initialize immediately and also listen for dynamic content changes
initializeBrooksExtractor();

// Listen for navigation changes (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => {
            new EnhancedBrooksInventoryExtractor();
            // Reset auto-clicker for new page
            if (brooksAutoClicker) {
                brooksAutoClicker.reset();
                brooksAutoClicker.clickExistingButtons();
            }
        }, 2000);
    }
}).observe(document, { subtree: true, childList: true });

// Message listener for popup
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'extractInventory') {
            try {
                const extractor = new EnhancedBrooksInventoryExtractor();
                const result = extractor.extractInventoryDataUnified();
                sendResponse({ success: true, count: result.length });
            } catch (error) {
                console.error('Message handler error:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
        
        // Auto-clicker control commands
        if (message.action === 'enableAutoClick') {
            if (brooksAutoClicker) {
                brooksAutoClicker.enable();
                sendResponse({ success: true, message: 'Auto-clicker enabled' });
            } else {
                sendResponse({ success: false, error: 'Auto-clicker not initialized' });
            }
            return true;
        }
        
        if (message.action === 'disableAutoClick') {
            if (brooksAutoClicker) {
                brooksAutoClicker.disable();
                sendResponse({ success: true, message: 'Auto-clicker disabled' });
            } else {
                sendResponse({ success: false, error: 'Auto-clicker not initialized' });
            }
            return true;
        }
        
        if (message.action === 'clickNow') {
            if (brooksAutoClicker) {
                brooksAutoClicker.reset();
                brooksAutoClicker.clickExistingButtons();
                sendResponse({ success: true, message: 'Clicked all "At once" buttons' });
            } else {
                sendResponse({ success: false, error: 'Auto-clicker not initialized' });
            }
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

console.log('🚀 Brooks Enhanced Unified Extension Loaded Successfully!');
console.log('🎯 AUTO-CLICKER: Automatically clicks "At once" buttons to reveal inventory');
console.log('✅ SEO-FRIENDLY HANDLES: Uses product name + color + width + SKU prefix for uniqueness');
console.log('🔒 INVENTORY SECURITY: Low quantities masked (≤3→0, 4-10→1, >10→actual)');
console.log('✅ CONSISTENT: Matches HTML converter and background.js logic');
console.log('📦 INVENTORY CSV: Uses SEO handles with "Location" + "On hand" columns');
console.log('🛍 PRODUCT CSV: Uses SEO handles with "Inventory at Needham"');
console.log('🎯 AUTO-SCRAPER: Full support for both CSV types with SEO optimization and security');
console.log('🆔 SKU PREFIX: Ensures unique handles across different size ranges (fixes duplicates)');