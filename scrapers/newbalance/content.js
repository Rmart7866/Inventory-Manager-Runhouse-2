// COMPLETE NEW BALANCE SCRAPER - MATCHING PUMA STRUCTURE
// This version includes ALL the features from the Puma scraper adapted for New Balance

// ===== SHOPIFY-COMPATIBLE CONVERTER =====
class ShopifyCompatibleNewBalanceConverter {
    constructor(brand) {
        this.brand = brand;
        this.defaultSettings = {
            vendor: brand,
            productType: 'Footwear',
            tags: `Athletic, Running, ${brand}`,
            published: 'TRUE',
            variantPrice: '77.00',
            compareAtPrice: '',
            inventoryTracker: 'shopify',
            inventoryPolicy: 'deny',
            requiresShipping: 'TRUE',
            taxable: 'TRUE',
            fulfillmentService: 'manual',
            productCategory: 'Footwear > Athletic Shoes',
            condition: 'New',
            status: 'active',
            locationName: 'Main Location'
        };
    }

    // FIXED: SHOPIFY-COMPATIBLE INVENTORY CSV GENERATION
    convertToInventoryCSV(inventoryData, settings = {}) {
        const csvSettings = { ...this.defaultSettings, ...settings };
        
        console.log('🔧 FIXED INVENTORY CSV: Generating with proper format...');
        
        if (!inventoryData || inventoryData.length === 0) {
            console.warn('⚠️ No inventory data provided');
            return '';
        }
        
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
        const productGroups = this.groupByColorway(inventoryData);
        const usedHandles = new Set();
        
        console.log(`📦 Processing ${Object.keys(productGroups).length} product groups`);
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            
            const handle = this.generateUniqueHandle(baseProduct, usedHandles);
            
            variants.forEach((variant, index) => {
                const sku = this.generateCleanSKU(variant);
                const quantity = this.parseQuantity(variant.quantity);
                const colorName = this.extractCleanColorName(baseProduct);
                const sizeValue = this.formatSizeForShopify(variant.sizeUS || variant.size);
                const widthValue = variant.width || 'D';
                
                const row = [
                    handle,
                    sku,
                    'Size',
                    sizeValue,
                    'Width',
                    widthValue,
                    'Color',
                    colorName,
                    csvSettings.locationName,
                    quantity
                ];
                
                csvRows.push(row);
            });
        });
        
        const csvContent = [
            headers.join(','),
            ...csvRows.map(row => row.map(cell => {
                const value = (cell || '').toString();
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        console.log(`✅ FIXED INVENTORY CSV: Generated with ${csvRows.length} rows`);
        return csvContent;
    }

    // CRITICAL FIX: SHOPIFY-COMPATIBLE PRODUCT CSV GENERATION
    convertToProductCSV(inventoryData, settings = {}) {
        const csvSettings = { ...this.defaultSettings, ...settings };
        
        console.log('🔧 CRITICAL FIX: Generating product CSV with proper data types...');
        
        if (!inventoryData || inventoryData.length === 0) {
            console.warn('⚠️ No product data provided');
            return '';
        }
        
        const shopifyData = [];
        const productGroups = this.groupByColorway(inventoryData);
        const usedHandles = new Set();
        
        Object.keys(productGroups).forEach(productKey => {
            const variants = productGroups[productKey];
            const baseProduct = variants[0];
            
            const handle = this.generateUniqueHandle(baseProduct, usedHandles);
            const productTitle = this.extractCleanProductTitle(baseProduct);
            const colorName = this.extractCleanColorName(baseProduct);
            
            variants.forEach((variant, index) => {
                const isFirstVariant = index === 0;
                const sku = this.generateCleanSKU(variant);
                const quantity = this.parseQuantity(variant.quantity);
                const price = this.formatPriceAsString(variant.price || csvSettings.variantPrice);
                
                // CRITICAL: Ensure size and width are ALWAYS strings
                let sizeValue = '';
                if (variant.sizeUS || variant.size) {
                    sizeValue = String(variant.sizeUS || variant.size);
                } else {
                    sizeValue = 'OS';
                }
                
                const widthValue = String(variant.width || 'D');
                
                // CRITICAL FIX: ALL values must be strings
                const shopifyRow = {
                    'Handle': String(handle),
                    'Title': String(productTitle), // EVERY ROW GETS TITLE
                    'Body (HTML)': isFirstVariant ? String(this.generateProductDescription(baseProduct)) : '',
                    'Vendor': isFirstVariant ? String(csvSettings.vendor) : '',
                    'Product Category': isFirstVariant ? String(csvSettings.productCategory) : '',
                    'Type': isFirstVariant ? String(csvSettings.productType) : '',
                    'Tags': isFirstVariant ? String(this.generateTags(baseProduct, csvSettings)) : '',
                    'Published': isFirstVariant ? String(csvSettings.published) : '',
                    'Option1 Name': isFirstVariant ? 'Size' : '',
                    'Option1 Value': String(sizeValue),
                    'Option2 Name': isFirstVariant ? 'Width' : '',
                    'Option2 Value': String(widthValue),
                    'Option3 Name': isFirstVariant ? 'Color' : '',
                    'Option3 Value': String(colorName),
                    'Variant SKU': String(sku),
                    'Variant Grams': '',
                    'Variant Inventory Tracker': String(csvSettings.inventoryTracker),
                    'Variant Inventory Policy': String(csvSettings.inventoryPolicy),
                    'Variant Fulfillment Service': String(csvSettings.fulfillmentService),
                    'Variant Price': String(price),
                    'Variant Compare At Price': String(csvSettings.compareAtPrice || ''),
                    'Variant Requires Shipping': String(csvSettings.requiresShipping),
                    'Variant Taxable': String(csvSettings.taxable),
                    'Variant Barcode': '',
                    'Image Src': '',
                    'Image Position': '',
                    'Image Alt Text': '',
                    'Gift Card': 'FALSE',
                    'SEO Title': isFirstVariant ? String(productTitle) : '',
                    'SEO Description': isFirstVariant ? String(this.generateSEODescription(baseProduct)) : '',
                    'Google Shopping / Google Product Category': '',
                    'Google Shopping / Gender': isFirstVariant ? String(this.detectGoogleShoppingGender(baseProduct)) : '',
                    'Google Shopping / Age Group': isFirstVariant ? String(this.detectGoogleShoppingAgeGroup(baseProduct)) : '',
                    'Google Shopping / MPN': isFirstVariant ? String(baseProduct.styleId || '') : '',
                    'Google Shopping / Condition': isFirstVariant ? String(csvSettings.condition) : '',
                    'Google Shopping / Custom Product': 'FALSE',
                    'Variant Image': '',
                    'Variant Weight Unit': isFirstVariant ? 'kg' : '',
                    'Variant Tax Code': '',
                    'Cost per item': '',
                    'Status': isFirstVariant ? String(csvSettings.status) : '',
                    [`Inventory at ${csvSettings.locationName}`]: String(quantity),
                    'Included / United States': 'TRUE',
                    'Price / United States': String(price),
                    'Compare At Price / United States': String(csvSettings.compareAtPrice || ''),
                    'Included / International': 'TRUE',
                    'Price / International': String(price),
                    'Compare At Price / International': String(csvSettings.compareAtPrice || '')
                };
                
                shopifyData.push(shopifyRow);
            });
        });
        
        if (shopifyData.length === 0) return '';
        
        const headers = Object.keys(shopifyData[0]);
        const csvContent = [
            headers.join(','),
            ...shopifyData.map(row => headers.map(header => {
                let value = row[header];
                
                if (value === null || value === undefined) {
                    value = '';
                } else {
                    value = String(value);
                }
                
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(','))
        ].join('\n');
        
        console.log(`✅ CRITICAL FIX: Generated CSV with ${shopifyData.length} rows - ALL STRINGS!`);
        return csvContent;
    }

    formatPriceAsString(price) {
        if (!price || price === '' || price === null || price === undefined) {
            return '77.00';
        }
        const parsed = parseFloat(price);
        if (isNaN(parsed)) {
            return '77.00';
        }
        return parsed.toFixed(2);
    }

    formatSizeForShopify(size) {
        if (!size) return 'OS';
        let sizeStr = size.toString().trim();
        return sizeStr || 'OS';
    }

    parseQuantity(quantity) {
        if (quantity === null || quantity === undefined || quantity === '') {
            return 0;
        }
        const parsed = parseInt(quantity);
        return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }

    groupByColorway(inventoryData) {
        const groups = {};
        inventoryData.forEach(item => {
            const styleId = this.cleanValue(item.styleId) || 'UNKNOWN';
            const colorCode = this.cleanValue(item.colorCode) || '01';
            const colorName = this.extractCleanColorName(item);
            const key = `${styleId}-${colorCode}-${colorName.replace(/[^a-z0-9]/gi, '')}`;
            
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
        });
        return groups;
    }

    extractCleanProductTitle(product) {
        let title = product.productName || product.title || 'Unknown Product';
        title = title.replace(/<[^>]*>/g, '').trim();
        
        // Clean navigation contamination
        const cleaningPatterns = [
            /Welcome,?\s*[^,\s]+/gi,
            /Shop\s*Now/gi,
            /Explore/gi,
            /Manage/gi,
            /loading/gi,
            /authenticating/gi
        ];
        
        for (const pattern of cleaningPatterns) {
            title = title.replace(pattern, '').trim();
        }
        
        title = title.replace(/\s+/g, ' ').trim();
        
        if (!title || title.length < 3) {
            title = 'New Balance Product';
        }
        
        const colorName = this.extractCleanColorName(product);
        if (colorName && colorName !== 'Multi-Color' && colorName !== 'Default Color') {
            if (!title.toLowerCase().includes(colorName.toLowerCase())) {
                title = `${title} - ${colorName}`;
            }
        }
        
        return title;
    }

    extractCleanColorName(product) {
        let colorName = product.colorName || 'Multi-Color';
        colorName = colorName.replace(/<[^>]*>/g, '').trim();
        
        if (!colorName || 
            colorName === 'Multi-Color' || 
            colorName === 'Default Color' ||
            colorName === 'Active' ||
            colorName.length < 2) {
            
            const productName = product.productName || '';
            const colorMatch = productName.match(/\b(BLACK|WHITE|RED|BLUE|GREEN|YELLOW|ORANGE|PURPLE|PINK|BROWN|GRAY|GREY|SILVER|GOLD|NAVY|MAROON|SLATE)\b/i);
            
            colorName = colorMatch ? colorMatch[1] : 'Multi-Color';
        }
        
        return colorName;
    }

    generateCleanSKU(variant) {
        const styleId = this.cleanValue(variant.styleId) || 'NB00';
        const colorCode = this.cleanValue(variant.colorCode) || '01';
        const size = this.formatSizeForShopify(variant.sizeUS || variant.size || 'OS');
        const width = variant.width || 'D';
        return `${styleId}-${colorCode}-${size}-${width}`;
    }

    cleanValue(value) {
        if (value === null || value === undefined || value === 'null' || value === 'undefined') {
            return '';
        }
        return String(value).trim();
    }

    generateUniqueHandle(product, usedHandles = new Set()) {
        const styleId = this.cleanValue(product.styleId).toLowerCase() || 'product';
        const colorCode = this.cleanValue(product.colorCode).toLowerCase() || 'default';
        const colorName = this.extractCleanColorName(product).toLowerCase().replace(/[^a-z0-9]/g, '-');
        
        let baseHandle = `${styleId}-${colorName}-${colorCode}`.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
        
        if (!usedHandles.has(baseHandle)) {
            usedHandles.add(baseHandle);
            return baseHandle;
        }
        
        let counter = 1;
        let uniqueHandle = `${baseHandle}-${counter}`;
        
        while (usedHandles.has(uniqueHandle)) {
            counter++;
            uniqueHandle = `${baseHandle}-${counter}`;
        }
        
        usedHandles.add(uniqueHandle);
        return uniqueHandle;
    }

    generateProductDescription(product) {
        const productName = this.extractCleanProductTitle(product);
        const styleId = this.cleanValue(product.styleId) || 'Unknown Style';
        const colorName = this.extractCleanColorName(product);
        
        let description = `<p><strong>${productName}</strong></p>`;
        description += `<p><strong>Style:</strong> ${styleId}</p>`;
        
        if (colorName && colorName !== 'Multi-Color' && colorName !== 'Default Color') {
            description += `<p><strong>Color:</strong> ${colorName}</p>`;
        }
        
        description += `<p>High-performance athletic footwear from ${this.brand}.</p>`;
        
        return description;
    }

    generateSEODescription(product) {
        const productName = this.extractCleanProductTitle(product);
        const styleId = this.cleanValue(product.styleId) || 'Unknown Style';
        
        return `${productName}. Style ${styleId} from ${this.brand}. High-performance athletic footwear.`;
    }

    generateTags(product, settings) {
        let tags = settings.tags || `Athletic, Running, ${this.brand}`;
        
        const colorName = this.extractCleanColorName(product);
        if (colorName && colorName !== 'Default' && colorName !== 'Multi-Color') {
            tags += `, ${colorName}`;
        }
        
        const styleId = this.cleanValue(product.styleId);
        if (styleId && styleId !== 'UNKNOWN') {
            tags += `, Style-${styleId}`;
        }
        
        const gender = this.detectGender(product);
        if (gender && gender !== 'unisex') {
            tags += `, ${gender.charAt(0).toUpperCase() + gender.slice(1)}`;
        }
        
        return tags;
    }

    detectGoogleShoppingGender(product) {
        const text = (this.extractCleanProductTitle(product)).toUpperCase();
        const styleId = (product.styleId || '').toUpperCase();
        
        if (text.includes('WOMEN') || text.includes('WMN') || styleId.startsWith('W')) {
            return 'female';
        } else if (text.includes('MEN') || styleId.startsWith('M')) {
            return 'male';
        }
        
        return 'unisex';
    }

    detectGoogleShoppingAgeGroup(product) {
        const text = (this.extractCleanProductTitle(product)).toUpperCase();
        
        if (text.includes('YOUTH') || text.includes('KIDS') || text.includes('CHILD')) {
            return 'kids';
        } else if (text.includes('INFANT') || text.includes('BABY')) {
            return 'infant';
        }
        
        return 'adult';
    }

    detectGender(product) {
        const text = (this.extractCleanProductTitle(product)).toUpperCase();
        const styleId = (product.styleId || '').toUpperCase();
        
        if (text.includes('WOMEN') || text.includes('WMN') || styleId.startsWith('W')) {
            return 'women';
        } else if (text.includes('MEN') || styleId.startsWith('M')) {
            return 'men';
        } else if (text.includes('YOUTH') || text.includes('KIDS')) {
            return 'youth';
        }
        
        return 'unisex';
    }
}

// ===== UTILITY FUNCTIONS =====
function cleanNavigationContamination(text) {
    if (!text) return 'Unknown Product';
    
    const navigationPatterns = [
        /Welcome,?\s*[^,\s]+/gi,
        /Shop\s*Now/gi,
        /Explore/gi,
        /Manage/gi,
        /My\s*Account/gi,
        /Sign\s*(In|Out)/gi,
        /Log\s*(In|Out)/gi,
        /checking\s+your\s+credentials/gi,
        /loading/gi,
        /please\s+wait/gi,
        /authenticating/gi,
        /redirecting/gi,
        /processing/gi
    ];
    
    let cleaned = text;
    for (const pattern of navigationPatterns) {
        cleaned = cleaned.replace(pattern, '').trim();
    }
    
    cleaned = cleaned.replace(/\s*-\s*$/, '').trim();
    cleaned = cleaned.replace(/^\s*-\s*/, '').trim();
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned.length < 3 ? 'New Balance Product' : cleaned;
}

// ===== STRUCTURE-BASED SIZE EXTRACTOR =====
class StructureBasedNewBalanceSizeExtractor {
    constructor() {
        this.debugMode = true;
        this.validSizeRanges = {
            women: { min: 5.0, max: 12.0 },
            men: { min: 7.0, max: 15.0 },
            youth: { min: 3.0, max: 7.0 },
            infant: { min: 1.0, max: 7.0 }
        };
    }

    extractSizeQuantityData(container) {
        console.log('🔍 Structure-based size extraction for New Balance');
        
        const sizeData = [];
        
        // Look for the table with inventory data
        const table = container.querySelector('table.sc-gHpXsY, table.sc-gykZtl, table');
        if (!table) {
            console.warn('No inventory table found, trying alternative methods...');
            return this.extractByAlternativeMethods(container);
        }

        // Get sizes from thead td elements
        const sizes = [];
        const headerCells = table.querySelectorAll('thead td[title]');
        
        headerCells.forEach(cell => {
            const sizeText = cell.getAttribute('title');
            if (sizeText && this.isValidNewBalanceSize(sizeText)) {
                const normalizedSize = this.normalizeNewBalanceSize(sizeText);
                if (normalizedSize) {
                    sizes.push(normalizedSize);
                }
            }
        });

        // Get tbody rows for width/quantity data
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
            // Get width from first td
            const widthCell = row.querySelector('td:first-child');
            const width = widthCell?.getAttribute('title') || widthCell?.textContent?.trim() || 'D';
            
            // Get all quantity cells (skip first cell which is width)
            const quantityCells = Array.from(row.querySelectorAll('td')).slice(1);
            
            quantityCells.forEach((cell, index) => {
                if (index >= sizes.length) return;
                
                const size = sizes[index];
                const quantity = this.extractQuantityFromCell(cell);
                
                if (size) {
                    sizeData.push({
                        size: size,
                        sizeUS: size,
                        width: width,
                        quantity: quantity,
                        method: 'table-extraction'
                    });
                }
            });
        });
        
        // If no data found, try alternative extraction
        if (sizeData.length === 0) {
            console.log('No data from table, trying alternative methods...');
            return this.extractByAlternativeMethods(container);
        }
        
        const cleanedData = this.validateAndCleanSizes(sizeData, container);
        this.logSizeResults(cleanedData);
        
        return cleanedData;
    }

    extractByAlternativeMethods(container) {
        console.log('🔍 Using alternative extraction methods');
        const sizeData = [];
        
        // Try to find number inputs
        const numberInputs = container.querySelectorAll('input[type="number"]');
        console.log(`Found ${numberInputs.length} number inputs`);
        
        for (const input of numberInputs) {
            const sizeQuantity = this.analyzeSizeInputStructure(input);
            if (sizeQuantity && this.isValidSizeQuantity(sizeQuantity)) {
                sizeData.push(sizeQuantity);
            }
        }
        
        // If still no data, try pattern matching
        if (sizeData.length < 5) {
            console.log('Not enough structured data, trying pattern matching...');
            const patternData = this.extractByPatternMatching(container);
            sizeData.push(...patternData);
        }
        
        return this.validateAndCleanSizes(sizeData, container);
    }

    analyzeSizeInputStructure(input) {
        try {
            const quantity = this.extractQuantityFromInput(input);
            const size = this.findSizeByStructure(input);
            
            if (size && quantity !== null) {
                return {
                    size: size,
                    sizeUS: size,
                    width: this.findWidthByStructure(input) || 'D',
                    quantity: Math.max(0, quantity),
                    method: 'structure-analysis'
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error analyzing input structure:', error);
            return null;
        }
    }

    extractQuantityFromInput(input) {
        const max = input.getAttribute('max');
        if (max !== null && max !== '' && /^\d+$/.test(max)) {
            const qty = parseInt(max);
            if (qty >= 0 && qty <= 9999) {
                return qty;
            }
        }
        
        const value = input.value || input.getAttribute('value') || '0';
        if (/^\d+$/.test(value)) {
            return parseInt(value);
        }
        
        return 0;
    }

    extractQuantityFromCell(cell) {
        try {
            // Look for input with max attribute
            const input = cell.querySelector('input[type="number"]');
            if (input) {
                const maxValue = input.getAttribute('max');
                if (maxValue && maxValue !== '') {
                    const qty = parseInt(maxValue);
                    return isNaN(qty) ? 0 : Math.max(0, qty);
                }
            }

            // Look for quantity in spans
            const spans = cell.querySelectorAll('span');
            for (const span of spans) {
                const text = span.textContent.trim();
                // Handle "99+" format
                if (text === '99+') return 99;
                
                const numericText = text.replace(/[^\d]/g, '');
                if (numericText) {
                    const quantity = parseInt(numericText);
                    if (!isNaN(quantity)) {
                        return Math.max(0, quantity);
                    }
                }
            }

            return 0;

        } catch (error) {
            console.error('Error extracting quantity:', error);
            return 0;
        }
    }

    findSizeByStructure(input) {
        // Search in parent elements for size indicators
        let current = input.parentElement;
        let depth = 0;
        
        while (current && depth < 5) {
            const text = current.textContent || '';
            const sizeMatch = text.match(/\b(0?5|0?55|0?6|0?65|0?7|0?75|0?8|0?85|0?9|0?95|10|105|11|115|12|125|13|135|14|145|15|155|16|165|17|175|18)\b/);
            
            if (sizeMatch) {
                return this.normalizeNewBalanceSize(sizeMatch[1]);
            }
            
            current = current.parentElement;
            depth++;
        }
        
        return null;
    }

    findWidthByStructure(input) {
        // Search for width indicators near the input
        let current = input.parentElement;
        let depth = 0;
        
        while (current && depth < 3) {
            const text = current.textContent || '';
            const widthMatch = text.match(/\b(2A|B|D|2E|4E)\b/);
            
            if (widthMatch) {
                return widthMatch[1];
            }
            
            current = current.parentElement;
            depth++;
        }
        
        return 'D'; // Default width
    }

    isValidNewBalanceSize(sizeText) {
        // Handle sizes like "05", "055", "06", "065", "07", "075", etc.
        return /^0?\d{2,3}$/.test(sizeText);
    }

    normalizeNewBalanceSize(sizeText) {
        const cleanSize = sizeText.trim();
        
        // Map specific sizes
        const sizeMap = {
            '05': '5', '5': '5',
            '055': '5.5', '55': '5.5',
            '06': '6', '6': '6',
            '065': '6.5', '65': '6.5',
            '07': '7', '7': '7',
            '075': '7.5', '75': '7.5',
            '08': '8', '8': '8',
            '085': '8.5', '85': '8.5',
            '09': '9', '9': '9',
            '095': '9.5', '95': '9.5',
            '10': '10',
            '105': '10.5',
            '11': '11',
            '115': '11.5',
            '12': '12',
            '125': '12.5',
            '13': '13',
            '135': '13.5',
            '14': '14',
            '145': '14.5',
            '15': '15',
            '155': '15.5',
            '16': '16',
            '165': '16.5',
            '17': '17',
            '175': '17.5',
            '18': '18'
        };
        
        return sizeMap[cleanSize] || cleanSize;
    }

    extractByPatternMatching(container) {
        console.log('🔍 Using pattern matching fallback');
        
        const sizeData = [];
        const containerText = container.textContent || '';
        
        const patterns = [
            /(\d{1,2}(?:\.\d)?)[:\-\s]*(\d{1,3})\s*(?:units?|pcs?|available)?/gi,
            /\b(0?\d{2,3})\b.*?\b(\d{1,3})\b/g
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(containerText)) !== null) {
                const potentialSize = this.normalizeNewBalanceSize(match[1]);
                const potentialQuantity = parseInt(match[2]);
                
                if (this.isReasonableSize(potentialSize) && 
                    potentialQuantity >= 0 && 
                    potentialQuantity <= 999) {
                    
                    sizeData.push({
                        size: potentialSize,
                        sizeUS: potentialSize,
                        width: 'D',
                        quantity: potentialQuantity,
                        method: 'pattern-matching'
                    });
                }
            }
        }
        
        return sizeData;
    }

    isReasonableSize(size) {
        if (!size) return false;
        
        const numericSize = parseFloat(size);
        if (isNaN(numericSize)) return false;
        
        return (numericSize >= 3.0 && numericSize <= 18.0) && 
               (numericSize % 0.5 === 0 || numericSize % 1 === 0);
    }

    validateAndCleanSizes(sizeData, container) {
        const sizeMap = new Map();
        
        sizeData.forEach(item => {
            const key = `${item.size}-${item.width}`;
            if (!sizeMap.has(key) || item.quantity > sizeMap.get(key).quantity) {
                sizeMap.set(key, item);
            }
        });
        
        let cleanedData = Array.from(sizeMap.values());
        cleanedData.sort((a, b) => {
            const sizeA = parseFloat(a.size);
            const sizeB = parseFloat(b.size);
            if (sizeA !== sizeB) return sizeA - sizeB;
            return a.width.localeCompare(b.width);
        });
        
        const genderCategory = this.detectGenderCategory(container);
        cleanedData = this.filterByGenderCategory(cleanedData, genderCategory);
        
        return cleanedData;
    }

    detectGenderCategory(container) {
        const allText = container.textContent.toUpperCase();
        const styleId = this.findStyleId(container);
        
        if (allText.includes('WOMEN') || allText.includes('WMN') || styleId.startsWith('W')) {
            return 'women';
        } else if (allText.includes('MEN') || styleId.startsWith('M')) {
            return 'men';
        } else if (allText.includes('YOUTH') || allText.includes('KIDS')) {
            return 'youth';
        }
        
        return 'unisex';
    }

    findStyleId(container) {
        const stylePattern = /\b[MW]\d{3}[A-Z]\d{2}\b/;
        const match = container.textContent.match(stylePattern);
        return match ? match[0] : '';
    }

    filterByGenderCategory(sizeData, genderCategory) {
        const validRange = this.validSizeRanges[genderCategory] || { min: 5.0, max: 15.0 };
        
        const filtered = sizeData.filter(item => {
            const size = parseFloat(item.size);
            const isInRange = size >= validRange.min && size <= validRange.max;
            
            if (!isInRange) {
                console.log(`⚠️ Filtered out size ${item.size} (not valid for ${genderCategory})`);
            }
            
            return isInRange;
        });
        
        console.log(`🔍 Gender filtering: ${genderCategory} - ${sizeData.length} → ${filtered.length} sizes`);
        return filtered;
    }

    isValidSizeQuantity(sizeQuantity) {
        return sizeQuantity && 
               this.isReasonableSize(sizeQuantity.size) && 
               typeof sizeQuantity.quantity === 'number' && 
               sizeQuantity.quantity >= 0;
    }

    logSizeResults(sizeData) {
        if (sizeData.length > 0) {
            console.log('🔍 Size Extraction Results:');
            sizeData.forEach((item) => {
                const status = item.quantity > 0 ? '✅' : '❌';
                console.log(`   ${status} Size ${item.size} Width ${item.width}: ${item.quantity} units (${item.method})`);
            });
            
            const totalStock = sizeData.reduce((sum, item) => sum + item.quantity, 0);
            const inStockSizes = sizeData.filter(item => item.quantity > 0).length;
            
            console.log(`   📊 Summary: ${inStockSizes}/${sizeData.length} sizes in stock, ${totalStock} total units`);
        } else {
            console.log('⚠️ No sizes extracted');
        }
    }
}

// ===== STRUCTURE-BASED PRODUCT DETECTOR =====
class StructureBasedNewBalanceProductDetector {
    constructor() {
        this.debugMode = true;
        this.processedElements = new Set();
        
        this.navigationPatterns = [
            /welcome[,\s]+/i,
            /shop\s*now/i,
            /explore/i,
            /manage/i,
            /my\s*account/i,
            /sign\s*(in|out)/i,
            /log\s*(in|out)/i,
            /cart/i,
            /checkout/i
        ];
        
        this.invalidProductTitlePatterns = [
            /^(loading|error|placeholder|test\s+product)$/i,
            /^add\s+to\s+cart/i,
            /^(add|remove|delete|edit)/i,
            /^(cart|basket|checkout)/i,
            /^(login|logout|sign\s*in|sign\s*out)/i
        ];
        
        this.validProductIndicators = [
            /\b(Fresh Foam|880v|880V|MX608)\b/i,
            /\b[MW]\d{3}[A-Z]\d{2}\b/,
            /\bNew Balance\b/i
        ];
    }

    findAllProductContainers() {
        console.log('🔍 Structure-based product detection for New Balance');
        
        const containers = [];
        
        // Strategy 1: Find by specific height styles (virtual scrolling)
        const productDivs = document.querySelectorAll('div[style*="height: 463px"], div[style*="height: 399px"]');
        productDivs.forEach(div => {
            if (this.validateProductContainer(div)) {
                containers.push(div);
            }
        });
        
        // Strategy 2: Find containers with tables
        if (containers.length === 0) {
            const containersWithTables = this.findContainersByTablePattern();
            containers.push(...containersWithTables);
        }
        
        // Strategy 3: Find in virtual scroll container
        const virtualContainer = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer');
        if (virtualContainer && containers.length === 0) {
            const children = Array.from(virtualContainer.children);
            children.forEach(child => {
                if (this.validateProductContainer(child)) {
                    containers.push(child);
                }
            });
        }
        
        const uniqueContainers = this.removeDuplicateContainers(containers);
        
        console.log(`🎯 Found ${uniqueContainers.length} product containers`);
        return uniqueContainers;
    }

    findContainersByTablePattern() {
        const containers = [];
        const tables = document.querySelectorAll('table');
        
        tables.forEach(table => {
            // Find the parent container that holds this table
            let parent = table.parentElement;
            let depth = 0;
            
            while (parent && depth < 5) {
                if (this.validateProductContainer(parent)) {
                    containers.push(parent);
                    break;
                }
                parent = parent.parentElement;
                depth++;
            }
        });
        
        return containers;
    }

    validateProductContainer(container) {
        const hasTable = !!container.querySelector('table');
        if (!hasTable) return false;
        
        const text = container.textContent || '';
        
        const hasStyleId = /\b[MW]\d{3}[A-Z]\d{2}\b/.test(text);
        const hasPrice = /\$\d+/.test(text) || /\b\d+\.\d{2}\b/.test(text);
        const hasProductName = text.includes('Fresh Foam') || text.includes('880v') || text.includes('880V');
        
        const hasUIOnlyContent = this.hasOnlyUIContent(container);
        
        const isValid = (hasStyleId || hasProductName) && 
                       !hasUIOnlyContent;
        
        return isValid;
    }

    hasOnlyUIContent(container) {
        const text = container.textContent || '';
        const words = text.toLowerCase().trim().split(/\s+/);
        
        const uiWords = ['add', 'to', 'cart', 'remove', 'edit', 'save', 'cancel', 'submit'];
        
        if (words.length <= 5) {
            const uiWordCount = words.filter(word => uiWords.includes(word)).length;
            if (uiWordCount >= words.length * 0.8) {
                console.log(`🚫 Container has only UI content`);
                return true;
            }
        }
        
        return false;
    }

    extractProductData(container) {
        const title = this.findProductTitle(container);
        const styleId = this.findStyleId(container);
        const colorName = this.findColorName(container);
        const colorCode = this.findColorCode(container);
        const price = this.findPrice(container);
        const genderCategory = this.detectGender(container);
        
        console.log(`🎯 Extracted product data:`, {
            title, styleId, colorName, colorCode, price, genderCategory
        });
        
        return {
            title: title,
            productName: title,
            styleId: styleId,
            colorName: colorName,
            colorCode: colorCode,
            price: price,
            genderCategory: genderCategory,
            isValid: this.isValidProduct(title, styleId)
        };
    }

    findProductTitle(container) {
        console.log('🎯 Looking for product title');
        
        // Strategy 1: Look for title attributes
        const titleSelectors = [
            'span[title*="Fresh Foam"]',
            'span[title*="880v"]',
            'span[title*="880V"]',
            '.sc-hdPSEv.iLwknQ',
            '.sc-cANqwJ',
            'span[title]'
        ];
        
        for (const selector of titleSelectors) {
            const elements = container.querySelectorAll(selector);
            for (const element of elements) {
                const title = element.getAttribute('title') || element.textContent.trim();
                if (title && (title.includes('Fresh Foam') || title.includes('880'))) {
                    const cleanTitle = cleanNavigationContamination(title);
                    console.log(`📦 Found product title: ${cleanTitle}`);
                    return cleanTitle;
                }
            }
        }
        
        // Strategy 2: Look in text content
        const text = container.textContent || '';
        const productMatch = text.match(/Fresh Foam[^,\n]{0,50}/);
        if (productMatch) {
            const cleanTitle = cleanNavigationContamination(productMatch[0]);
            console.log(`📦 Found product title in text: ${cleanTitle}`);
            return cleanTitle;
        }
        
        console.log(`⚠️ No product title found, using default`);
        return 'New Balance Product';
    }

    findStyleId(container) {
        // Look for style IDs like M880V15, W880V15, M880B15, W880W15
        const stylePattern = /\b[MW]\d{3}[A-Z]\d{2}\b/;
        
        // First check spans
        const spans = container.querySelectorAll('span');
        for (const span of spans) {
            const text = span.textContent.trim();
            const match = text.match(stylePattern);
            if (match) {
                console.log(`🔖 Found style ID: ${match[0]}`);
                return match[0];
            }
        }
        
        // Check in text content
        const textMatch = container.textContent.match(stylePattern);
        if (textMatch) {
            console.log(`🔖 Found style ID in text: ${textMatch[0]}`);
            return textMatch[0];
        }
        
        return 'Unknown';
    }

    findColorName(container) {
        console.log('🎯 Looking for color name');
        
        // Look for color in specific elements
        const colorSelectors = [
            '.sc-hGoxap',
            '.sc-fjmCvl',
            'div.VariationImage div',
            'span[title*="BLACK"]',
            'span[title*="WHITE"]',
            'span[title*="SLATE"]',
            'span[title*="GREY"]',
            'span[title*="NB 103"]'
        ];
        
        for (const selector of colorSelectors) {
            const elements = container.querySelectorAll(selector);
            for (const element of elements) {
                let colorText = element.textContent.trim();
                const titleAttr = element.getAttribute('title');
                if (titleAttr) {
                    colorText = titleAttr;
                }
                
                if (colorText && 
                    colorText.length > 1 && 
                    colorText.length < 50 &&
                    !colorText.includes('Fresh Foam') && 
                    !colorText.includes('880')) {
                    console.log(`🎨 Found color: ${colorText}`);
                    return colorText;
                }
            }
        }
        
        return 'Multi-Color';
    }

    findColorCode(container) {
        // Look for product codes like M880B15, M880F15, W880W15
        const codePattern = /\b[MW]\d{3}[A-Z]\d{2}\b/g;
        const text = container.textContent || '';
        const matches = text.match(codePattern);
        
        if (matches && matches.length > 0) {
            // Find the color-specific code (not the base style with V)
            for (const match of matches) {
                if (!match.includes('V')) {
                    console.log(`🎨 Found color code: ${match}`);
                    return match;
                }
            }
        }
        
        return '01';
    }

    findPrice(container) {
        const pricePattern = /\$(\d+(?:\.\d{2})?)/;
        const text = container.textContent || '';
        const match = text.match(pricePattern);
        
        if (match) {
            console.log(`💰 Found price: ${match[1]}`);
            return match[1];
        }
        
        return '77.00';
    }

    detectGender(container) {
        const text = container.textContent.toUpperCase();
        const styleId = this.findStyleId(container).toUpperCase();
        
        if (styleId.startsWith('W') || text.includes('WOMEN')) {
            return 'women';
        } else if (styleId.startsWith('M') || text.includes('MEN')) {
            return 'men';
        }
        
        return 'unisex';
    }

    isValidProduct(title, styleId) {
        const titleValid = title && 
                          title !== 'New Balance Product' && 
                          !this.isInvalidProductTitle(title);
        
        const styleValid = styleId && 
                          styleId !== 'Unknown' && 
                          /\b[MW]\d{3}[A-Z]\d{2}\b/.test(styleId);
        
        const isValid = titleValid || styleValid;
        
        if (!isValid) {
            console.log(`❌ Product validation failed - Title: "${title}" (${titleValid}), Style: "${styleId}" (${styleValid})`);
        } else {
            console.log(`✅ Product validation passed - Title: "${title}", Style: "${styleId}"`);
        }
        
        return isValid;
    }

    isInvalidProductTitle(title) {
        if (!title) return true;
        
        if (this.containsNavigationText(title)) {
            console.log(`❌ Invalid product title - contains navigation: "${title}"`);
            return true;
        }
        
        for (const pattern of this.invalidProductTitlePatterns) {
            if (pattern.test(title)) {
                console.log(`❌ Invalid product title pattern match: "${title}"`);
                return true;
            }
        }
        
        return false;
    }

    containsNavigationText(text) {
        if (!text) return false;
        
        for (const pattern of this.navigationPatterns) {
            if (pattern.test(text)) {
                console.log(`🚫 Navigation pattern detected in: "${text}"`);
                return true;
            }
        }
        
        return false;
    }

    removeDuplicateContainers(containers) {
        const unique = [];
        const processed = new Set();
        
        for (const container of containers) {
            const key = this.getContainerKey(container);
            
            if (!processed.has(key)) {
                processed.add(key);
                unique.push(container);
            }
        }
        
        return unique;
    }

    getContainerKey(container) {
        const rect = container.getBoundingClientRect();
        const inputCount = container.querySelectorAll('input[type="number"]').length;
        const textLength = (container.textContent || '').length;
        
        return `${rect.top.toFixed(0)}-${rect.left.toFixed(0)}-${inputCount}-${textLength}`;
    }
}

// ===== SKU GENERATOR =====
class EnhancedNewBalanceSKUGenerator {
    generateSKU(variant) {
        const styleId = this.validateStyleId(variant.styleId);
        const colorCode = this.validateColorCode(variant.colorCode);
        const size = this.formatSize(variant.sizeUS || variant.size || 'OS');
        const width = variant.width || 'D';
        
        const sku = `${styleId}-${colorCode}-${size}-${width}`;
        
        console.log(`🏷️ Generated SKU: ${sku}`);
        return sku;
    }
    
    validateStyleId(styleId) {
        if (/\b[MW]\d{3}[A-Z]\d{2}\b/.test(styleId)) {
            return styleId;
        }
        
        return 'NB000000';
    }
    
    validateColorCode(colorCode) {
        if (colorCode && colorCode.length > 0) {
            return colorCode;
        }
        
        return '01';
    }
    
    formatSize(size) {
        return size.toString();
    }
}

// ===== MAIN EXTRACTOR CLASS =====
class ShopifyCompatibleCompleteNewBalanceExtractor {
    constructor() {
        this.structureDetector = new StructureBasedNewBalanceProductDetector();
        this.structureSizeExtractor = new StructureBasedNewBalanceSizeExtractor();
        this.skuGenerator = new EnhancedNewBalanceSKUGenerator();
        this.shopifyConverter = new ShopifyCompatibleNewBalanceConverter('New Balance');
        
        this.collectedInventory = new Map();
        this.processedContainers = new Set();
        this.isWatching = false;
        
        this.minSizesRequired = 3;
        
        this.watchingMetrics = {
            totalProductsFound: 0,
            validProductsKept: 0,
            invalidProductsFiltered: 0,
            duplicatesPrevented: 0,
            zeroInventoryProductsKept: 0,
            realSkusGenerated: 0,
            sizeExtractionFailures: 0,
            lastCheck: 0,
            watchStartTime: null,
            autoExtractions: 0
        };
        
        this.shopifySettings = {
            vendor: 'New Balance',
            productType: 'Footwear',
            tags: 'Athletic, Running, New Balance',
            published: 'TRUE',
            variantPrice: '77.00',
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
            locationName: 'Main Location',
            exportType: 'inventory'
        };
        
        // Global references
        window.nbExtractor = this;
        window.shopifyCompatibleNewBalanceExtractor = this;
        window.newBalanceExtractor = this;
        
        this.init();
        this.setupDynamicContentWatcher();
    }

    init() {
        this.addButtons();
        this.loadSettings();
        this.setupBackgroundMessageListener();
        console.log('🏃 COMPLETE New Balance Extractor initialized - Puma-style implementation');
    }

    // ===== BUTTON SYSTEM =====
    addButtons() {
        console.log('Adding New Balance extractor buttons...');
        
        document.querySelectorAll('.nb-export-btn, .nb-start-watching-btn, .nb-stop-watching-btn, .nb-watch-status-btn, .nb-debug-btn, .nb-settings-btn, .nb-test-btn').forEach(btn => btn.remove());
        
        this.addStartWatchingButton();
        this.addStopWatchingButton();
        this.addWatchStatusButton();
        this.addSettingsButton();
        this.addDebugButton();
        this.addTestButton();
        
        console.log('All New Balance buttons added');
    }

    addStartWatchingButton() {
        const startBtn = document.createElement('button');
        startBtn.innerHTML = '🏃 NB Capture';
        startBtn.className = 'nb-start-watching-btn';
        startBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: #28a745; color: white; border: none; padding: 12px 20px;
            border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        startBtn.onclick = () => this.startWatching();
        document.body.appendChild(startBtn);
    }

    addStopWatchingButton() {
        const stopBtn = document.createElement('button');
        stopBtn.innerHTML = '🛑 Stop & Export';
        stopBtn.className = 'nb-stop-watching-btn';
        stopBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 10000;
            background: #dc3545; color: white; border: none; padding: 12px 20px;
            border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: none;
        `;
        stopBtn.onclick = () => this.stopWatchingAndExport();
        document.body.appendChild(stopBtn);
    }

    addWatchStatusButton() {
        const statusBtn = document.createElement('button');
        statusBtn.innerHTML = 'Not Watching';
        statusBtn.className = 'nb-watch-status-btn';
        statusBtn.style.cssText = `
            position: fixed; top: 70px; right: 20px; z-index: 10000;
            background: #6c757d; color: white; border: none; padding: 8px 16px;
            border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3); pointer-events: none;
        `;
        document.body.appendChild(statusBtn);
    }

    addSettingsButton() {
        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = '⚙️ Settings';
        settingsBtn.className = 'nb-settings-btn';
        settingsBtn.style.cssText = `
            position: fixed; top: 120px; right: 20px; z-index: 10000;
            background: #6c757d; color: white; border: none; padding: 8px 16px;
            border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        settingsBtn.onclick = () => this.showSettingsModal();
        document.body.appendChild(settingsBtn);
    }

    addDebugButton() {
        const debugBtn = document.createElement('button');
        debugBtn.innerHTML = '🔍 Debug';
        debugBtn.className = 'nb-debug-btn';
        debugBtn.style.cssText = `
            position: fixed; top: 170px; right: 20px; z-index: 10000;
            background: #6f42c1; color: white; border: none; padding: 8px 16px;
            border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        debugBtn.onclick = () => this.showDebugInfo();
        document.body.appendChild(debugBtn);
    }

    addTestButton() {
        const testBtn = document.createElement('button');
        testBtn.innerHTML = '🧪 Test';
        testBtn.className = 'nb-test-btn';
        testBtn.style.cssText = `
            position: fixed; top: 220px; right: 20px; z-index: 10000;
            background: #ff6b35; color: white; border: none; padding: 8px 16px;
            border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        testBtn.onclick = () => this.testExtraction();
        document.body.appendChild(testBtn);
    }

    // ===== WATCHING LOGIC =====
    startWatching() {
        if (this.isWatching) return;
        
        this.isWatching = true;
        this.watchingMetrics.watchStartTime = Date.now();
        this.collectedInventory.clear();
        this.processedContainers.clear();
        this.watchingMetrics.validProductsKept = 0;
        this.watchingMetrics.invalidProductsFiltered = 0;
        this.watchingMetrics.duplicatesPrevented = 0;
        this.watchingMetrics.zeroInventoryProductsKept = 0;
        this.watchingMetrics.realSkusGenerated = 0;
        this.watchingMetrics.sizeExtractionFailures = 0;
        
        const startBtn = document.querySelector('.nb-start-watching-btn');
        const stopBtn = document.querySelector('.nb-stop-watching-btn');
        const statusBtn = document.querySelector('.nb-watch-status-btn');
        
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (statusBtn) {
            statusBtn.innerHTML = 'NB Watching (0 valid)';
            statusBtn.style.background = '#28a745';
        }
        
        this.extractCurrentlyVisible();
        this.showSuccessMessage('🏃 NEW BALANCE WATCHING STARTED\n\n✅ Shopify-compatible format\n✅ All size/width combinations\n✅ Ready for import!\n\nScroll slowly to capture all products!');
    }

    stopWatchingAndExport() {
        if (!this.isWatching) return;
        
        this.isWatching = false;
        
        const startBtn = document.querySelector('.nb-start-watching-btn');
        const stopBtn = document.querySelector('.nb-stop-watching-btn');
        const statusBtn = document.querySelector('.nb-watch-status-btn');
        
        if (startBtn) startBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (statusBtn) {
            statusBtn.innerHTML = 'Not Watching';
            statusBtn.style.background = '#6c757d';
        }
        
        this.extractCurrentlyVisible();
        this.showFormatSelectionModal();
    }

    updateWatchingStatus() {
        const statusBtn = document.querySelector('.nb-watch-status-btn');
        if (statusBtn && this.isWatching) {
            const elapsed = Math.floor((Date.now() - this.watchingMetrics.watchStartTime) / 1000);
            const valid = this.watchingMetrics.validProductsKept;
            const invalid = this.watchingMetrics.invalidProductsFiltered;
            const duplicates = this.watchingMetrics.duplicatesPrevented;
            const sizeFailures = this.watchingMetrics.sizeExtractionFailures;
            const realSkus = this.watchingMetrics.realSkusGenerated;
            statusBtn.innerHTML = `NB (${valid}v, ${realSkus}sku, ${invalid}inv, ${sizeFailures}sf, ${duplicates}d, ${elapsed}s)`;
        }
    }

    // ===== MAIN EXTRACTION LOGIC =====
    async extractCurrentlyVisible() {
        console.log('🏃 Starting New Balance extraction...');
        
        const containers = this.structureDetector.findAllProductContainers();
        let processedCount = 0;
        let filteredCount = 0;
        let duplicateCount = 0;
        let invalidCount = 0;
        let zeroInventoryKept = 0;
        let realSkusGenerated = 0;
        let sizeExtractionFailures = 0;
        
        console.log(`Processing ${containers.length} containers`);
        
        for (const container of containers) {
            try {
                const productData = this.structureDetector.extractProductData(container);
                const sizeData = this.structureSizeExtractor.extractSizeQuantityData(container);
                
                console.log(`\n📦 Processing Product ${processedCount + filteredCount + invalidCount + 1}:`);
                console.log(`   Name: ${productData.title}`);
                console.log(`   Color: ${productData.colorName} (${productData.colorCode})`);
                console.log(`   Style ID: ${productData.styleId}`);
                console.log(`   Sizes: ${sizeData.length} found`);
                console.log(`   Valid Product: ${productData.isValid}`);
                
                if (sizeData.length === 0) {
                    sizeExtractionFailures++;
                    this.watchingMetrics.sizeExtractionFailures++;
                    console.log(`⚠️ No sizes found for ${productData.title}`);
                }
                
                if (!productData.isValid) {
                    invalidCount++;
                    console.log(`❌ INVALID: ${productData.title}`);
                    this.watchingMetrics.invalidProductsFiltered++;
                    continue;
                }
                
                const containerId = this.getContainerIdentifier(container, productData);
                
                if (this.processedContainers.has(containerId)) {
                    duplicateCount++;
                    console.log(`⭕ DUPLICATE: ${containerId}`);
                    continue;
                }
                
                this.processedContainers.add(containerId);
                
                const stockSummary = this.getStockSummary(sizeData);
                console.log(`   📊 Stock: ${stockSummary.totalUnits} units across ${stockSummary.stockingSizes} sizes`);
                
                if (this.shouldKeepProduct(productData, sizeData)) {
                    const inventory = sizeData.map(item => {
                        const variant = {
                            styleId: productData.styleId,
                            colorCode: productData.colorCode,
                            sizeUS: item.size,
                            size: item.size,
                            width: item.width
                        };
                        
                        const realSku = this.skuGenerator.generateSKU(variant);
                        realSkusGenerated++;
                        
                        return {
                            productName: productData.title,
                            styleId: productData.styleId,
                            colorCode: productData.colorCode,
                            colorName: productData.colorName,
                            sizeUS: item.size,
                            size: item.size,
                            width: item.width,
                            quantity: item.quantity,
                            price: productData.price,
                            realSKU: realSku,
                            extractedAt: new Date().toISOString(),
                            url: window.location.href,
                            extractionMethod: 'shopify-compatible-enhanced-structure-based',
                            sizeDetectionMethod: item.method || 'unknown',
                            containerId: containerId,
                            isValidProduct: productData.isValid
                        };
                    });
                    
                    const productKey = `${productData.styleId}-${productData.colorCode}-${this.hashCode(containerId)}`;
                    
                    if (this.collectedInventory.has(productKey)) {
                        duplicateCount++;
                        console.log(`❌ DUPLICATE PRODUCT: ${productKey}`);
                        continue;
                    }
                    
                    this.collectedInventory.set(productKey, inventory);
                    processedCount++;
                    this.watchingMetrics.validProductsKept++;
                    this.watchingMetrics.realSkusGenerated += inventory.length;
                    
                    if (stockSummary.isCompletelyOutOfStock) {
                        zeroInventoryKept++;
                        this.watchingMetrics.zeroInventoryProductsKept++;
                    }
                    
                    const statusMessage = stockSummary.isCompletelyOutOfStock ? 
                        ' (ZERO INVENTORY - KEPT)' : 
                        ` (${stockSummary.totalUnits} units)`;
                    
                    console.log(`✅ KEPT: ${inventory.length} variants${statusMessage}`);
                    
                    const sampleSkus = inventory.slice(0, 2).map(item => `${item.sizeUS}x${item.width}=${item.realSKU}`).join(', ');
                    console.log(`   🏷️ Sample SKUs: ${sampleSkus}`);
                    
                } else {
                    filteredCount++;
                    console.log(`❌ FILTERED: ${this.getFilterReason(productData, sizeData)}`);
                }
                
            } catch (error) {
                console.error(`❌ Error processing container:`, error);
            }
        }
        
        console.log(`\n🏃 New Balance extraction complete:`);
        console.log(`   Containers processed: ${containers.length}`);
        console.log(`   Valid products kept: ${processedCount}`);
        console.log(`   Invalid products filtered: ${invalidCount}`);
        console.log(`   Real SKUs generated: ${realSkusGenerated}`);
        console.log(`   Zero-inventory kept: ${zeroInventoryKept}`);
        console.log(`   Duplicates prevented: ${duplicateCount}`);
        console.log(`   ✅ SHOPIFY-COMPATIBLE: All variants have titles!`);
        console.log(`   ✅ SHOPIFY-COMPATIBLE: Size/width values as strings!`);
        console.log(`   ✅ SHOPIFY-COMPATIBLE: Ready for 100% successful Shopify import!`);
        
        this.watchingMetrics.totalProductsFound = processedCount + filteredCount + invalidCount;
        this.watchingMetrics.invalidProductsFiltered = invalidCount;
        this.watchingMetrics.duplicatesPrevented = duplicateCount;
        
        return processedCount;
    }

    shouldKeepProduct(productData, sizeData) {
        if (sizeData.length < this.minSizesRequired) {
            return false;
        }
        
        if (!productData.isValid) {
            return false;
        }
        
        if (!productData.title || productData.title.length < 5) {
            return false;
        }
        
        return true;
    }

    getFilterReason(productData, sizeData) {
        if (!productData.isValid) {
            return 'Invalid product title detected';
        }
        if (sizeData.length < this.minSizesRequired) {
            return `Only ${sizeData.length} sizes found (need ${this.minSizesRequired})`;
        }
        if (!productData.title || productData.title.length < 5) {
            return 'Missing or invalid product title';
        }
        return 'Unknown validation issue';
    }

    // ===== FORMAT SELECTION MODAL =====
    showFormatSelectionModal() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white; padding: 30px; border-radius: 10px; max-width: 500px;
            width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        
        const allInventory = Array.from(this.collectedInventory.values()).flat();
        const validProducts = this.watchingMetrics.validProductsKept;
        const invalidFiltered = this.watchingMetrics.invalidProductsFiltered;
        const duplicatesPrevented = this.watchingMetrics.duplicatesPrevented;
        const zeroInventoryKept = this.watchingMetrics.zeroInventoryProductsKept;
        const realSkusGenerated = this.watchingMetrics.realSkusGenerated;
        const sizeFailures = this.watchingMetrics.sizeExtractionFailures;
        
        modalContent.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #333;">🏃 New Balance Export Results</h3>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0 0 10px 0; font-weight: bold;">Processing Results:</p>
                <p style="margin: 0; color: #666;">${allInventory.length} size-inventory records from ${this.collectedInventory.size} valid products</p>
                <p style="margin: 5px 0 0 0; color: #28a745; font-size: 12px;">✅ Valid products kept: ${validProducts}</p>
                <p style="margin: 5px 0 0 0; color: #007bff; font-size: 12px;">🏷️ Real SKUs generated: ${realSkusGenerated}</p>
                <p style="margin: 5px 0 0 0; color: #dc3545; font-size: 12px;">❌ Invalid products filtered: ${invalidFiltered}</p>
                <p style="margin: 5px 0 0 0; color: #ffc107; font-size: 12px;">🔄 Duplicates prevented: ${duplicatesPrevented}</p>
                <p style="margin: 5px 0 0 0; color: #17a2b8; font-size: 12px;">📦 Zero-inventory kept: ${zeroInventoryKept}</p>
                <p style="margin: 5px 0 0 0; color: #e74c3c; font-size: 12px;">⚠️ Size extraction issues: ${sizeFailures}</p>
                <p style="margin: 5px 0 0 0; color: #28a745; font-size: 12px;">✅ SHOPIFY-COMPATIBLE: All variants have titles!</p>
                <p style="margin: 5px 0 0 0; color: #17a2b8; font-size: 12px;">✅ SHOPIFY-COMPATIBLE: Size/width values as strings!</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #28a745; border-radius: 8px; background: #d4edda; cursor: pointer; margin-bottom: 10px;">
                    <input type="radio" name="exportFormat" value="inventory" checked style="margin-right: 10px;">
                    <div>
                        <strong style="color: #155724;">Inventory CSV</strong><br>
                        <small style="color: #155724;">For updating inventory quantities with Size/Width/Color options</small>
                    </div>
                </label>
                
                <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #17a2b8; border-radius: 8px; background: #d1ecf1; cursor: pointer;">
                    <input type="radio" name="exportFormat" value="product" style="margin-right: 10px;">
                    <div>
                        <strong style="color: #0c5460;">Product CSV</strong><br>
                        <small style="color: #0c5460;">Complete product catalog with all variants and metadata</small>
                    </div>
                </label>
            </div>
            
            <div style="text-align: center;">
                <button id="exportSelected" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-weight: bold;">
                    Export Selected Format
                </button>
                <button id="exportBoth" style="background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-weight: bold;">
                    Export Both Formats
                </button>
                <button id="cancelExport" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Cancel
                </button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        document.getElementById('exportSelected').onclick = () => {
            const selectedFormat = document.querySelector('input[name="exportFormat"]:checked').value;
            this.exportWithFormat(allInventory, selectedFormat);
            document.body.removeChild(modal);
        };
        
        document.getElementById('exportBoth').onclick = () => {
            this.exportWithFormat(allInventory, 'inventory');
            this.exportWithFormat(allInventory, 'product');
            document.body.removeChild(modal);
        };
        
        document.getElementById('cancelExport').onclick = () => {
            document.body.removeChild(modal);
        };
    }

    exportWithFormat(allInventory, format) {
        if (allInventory.length === 0) {
            this.showError('No validated inventory data to export');
            return;
        }

        try {
            console.log(`🏃 Starting New Balance ${format} export...`);
            const cleanedData = this.validateAndCleanExportData(allInventory, format);
            
            let csv, filename;
            
            if (format === 'inventory') {
                csv = this.shopifyConverter.convertToInventoryCSV(cleanedData, this.shopifySettings);
                filename = `newbalance-inventory-${Date.now()}.csv`;
            } else {
                csv = this.shopifyConverter.convertToProductCSV(cleanedData, this.shopifySettings);
                filename = `newbalance-products-${Date.now()}.csv`;
            }
            
            console.log(`🏃 Generated CSV with ${csv.split('\n').length} lines`);
            this.downloadCSV(csv, filename);
            
            const formatName = format.toUpperCase();
            const watchTime = this.watchingMetrics.watchStartTime ? 
                Math.floor((Date.now() - this.watchingMetrics.watchStartTime) / 1000) : 0;
            const validCount = this.watchingMetrics.validProductsKept;
            const invalidCount = this.watchingMetrics.invalidProductsFiltered;
            const duplicatesCount = this.watchingMetrics.duplicatesPrevented;
            const zeroInventoryCount = this.watchingMetrics.zeroInventoryProductsKept;
            const realSkusCount = this.watchingMetrics.realSkusGenerated;
            const sizeFailures = this.watchingMetrics.sizeExtractionFailures;
            
            this.showSuccessMessage(`🏃 NEW BALANCE ${formatName} EXPORT COMPLETE\n\nWatched for ${watchTime} seconds\nExported ${cleanedData.length} records\nValid products: ${validCount}\nReal SKUs: ${realSkusCount}\nZero-inventory kept: ${zeroInventoryCount}\nInvalid filtered: ${invalidCount}\nDuplicates prevented: ${duplicatesCount}\nSize extraction issues: ${sizeFailures}\n\n✅ Ready for Shopify import!`);
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Export error: ' + error.message);
        }
    }

    validateAndCleanExportData(inventoryData, format) {
        console.log('🧹 Validating export data...');
        
        const cleanData = inventoryData.filter(item => {
            if (this.structureDetector.isInvalidProductTitle(item.productName)) {
                console.log(`🚫 Removed invalid product: ${item.productName}`);
                return false;
            }
            
            if (!item.sizeUS || !item.realSKU) {
                console.log(`🚫 Removed item with missing size/SKU`);
                return false;
            }
            
            return true;
        });
        
        console.log(`🧹 Cleaning: ${inventoryData.length} → ${cleanData.length} items`);
        return cleanData;
    }

    // ===== TESTING LOGIC =====
    testExtraction() {
        console.log('=== TESTING NEW BALANCE EXTRACTION ===');
        
        const containers = this.structureDetector.findAllProductContainers();
        console.log(`Found ${containers.length} product containers`);
        
        if (containers.length > 0) {
            const testContainer = containers[0];
            console.log('\n--- Testing Product Detection ---');
            
            const productData = this.structureDetector.extractProductData(testContainer);
            console.log('Product data:', productData);
            
            const sizeData = this.structureSizeExtractor.extractSizeQuantityData(testContainer);
            console.log('Size extraction results:', sizeData);
            
            console.log('\n--- Testing CSV Generation ---');
            if (sizeData.length > 0) {
                const testInventory = [{
                    productName: productData.title,
                    styleId: productData.styleId,
                    colorCode: productData.colorCode,
                    colorName: productData.colorName,
                    sizeUS: sizeData[0].size,
                    width: sizeData[0].width,
                    quantity: sizeData[0].quantity,
                    realSKU: this.skuGenerator.generateSKU({
                        styleId: productData.styleId,
                        colorCode: productData.colorCode,
                        sizeUS: sizeData[0].size,
                        width: sizeData[0].width
                    })
                }];
                
                const csvSample = this.shopifyConverter.convertToProductCSV(testInventory, this.shopifySettings);
                console.log('CSV generation test:', csvSample.length > 0 ? 'SUCCESS' : 'FAILED');
                console.log('Sample CSV lines:', csvSample.split('\n').slice(0, 3));
            }
            
            console.log('\n--- Features ---');
            console.log(`✅ Width support: ENABLED`);
            console.log(`✅ Table extraction: ENABLED`);
            console.log(`✅ Shopify-compatible CSV: ENABLED`);
            console.log(`✅ Real SKU generation: ENABLED`);
        }
        
        return { 
            containerCount: containers.length,
            testComplete: true
        };
    }

    // ===== REMAINING METHODS (DEBUG, SETTINGS, ETC) =====
    showDebugInfo() {
        const containers = this.structureDetector.findAllProductContainers();
        const allInventory = Array.from(this.collectedInventory.values()).flat();
        
        let debugInfo = '=== NEW BALANCE SCRAPER DEBUG ===\n';
        debugInfo += `URL: ${window.location.href}\n`;
        debugInfo += `Product Containers: ${containers.length}\n`;
        debugInfo += `Collected Products: ${this.collectedInventory.size}\n`;
        debugInfo += `Total Records: ${allInventory.length}\n`;
        debugInfo += `Valid Products: ${this.watchingMetrics.validProductsKept}\n`;
        debugInfo += `Invalid Filtered: ${this.watchingMetrics.invalidProductsFiltered}\n`;
        debugInfo += `Real SKUs: ${this.watchingMetrics.realSkusGenerated}\n`;
        debugInfo += `Zero-Inventory: ${this.watchingMetrics.zeroInventoryProductsKept}\n`;
        debugInfo += `Duplicates Prevented: ${this.watchingMetrics.duplicatesPrevented}\n`;
        debugInfo += `Watching: ${this.isWatching ? 'ACTIVE' : 'INACTIVE'}\n`;
        
        if (allInventory.length > 0) {
            debugInfo += '\n=== SAMPLE DATA ===\n';
            const sample = allInventory[0];
            debugInfo += `Product: ${sample.productName}\n`;
            debugInfo += `Style: ${sample.styleId}\n`;
            debugInfo += `Color: ${sample.colorName} (${sample.colorCode})\n`;
            debugInfo += `Size: ${sample.size} Width: ${sample.width}\n`;
            debugInfo += `Quantity: ${sample.quantity}\n`;
            debugInfo += `SKU: ${sample.realSKU}\n`;
        }
        
        console.log(debugInfo);
        alert(debugInfo);
    }

    showSettingsModal() {
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); z-index: 20000;
            display: flex; align-items: center; justify-content: center;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white; padding: 30px; border-radius: 10px; max-width: 500px;
            width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;
        
        modalContent.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #333;">🏃 New Balance Settings</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Vendor:</label>
                <input type="text" id="vendor" value="${this.shopifySettings.vendor}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Default Price ($):</label>
                <input type="number" step="0.01" id="variantPrice" value="${this.shopifySettings.variantPrice}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Location Name:</label>
                <input type="text" id="locationName" value="${this.shopifySettings.locationName}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Minimum Sizes Required:</label>
                <input type="number" min="1" max="15" id="minSizes" value="${this.minSizesRequired}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            </div>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
                <strong>Features:</strong><br>
                <small>✅ Width support (2A, B, D, 2E, 4E)<br>
                ✅ Table-based size extraction<br>
                ✅ Shopify-compatible CSV formats<br>
                ✅ Real style ID and SKU generation<br>
                ✅ Dynamic content monitoring<br>
                ⚙️ Settings and debugging tools</small>
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
            this.shopifySettings.vendor = document.getElementById('vendor').value;
            this.shopifySettings.variantPrice = document.getElementById('variantPrice').value;
            this.shopifySettings.locationName = document.getElementById('locationName').value;
            this.minSizesRequired = parseInt(document.getElementById('minSizes').value);
            
            const settings = {
                ...this.shopifySettings,
                minSizesRequired: this.minSizesRequired,
                version: 'shopify-compatible-enhanced-structure-based'
            };
            
            localStorage.setItem('newBalanceSettings', JSON.stringify(settings));
            document.body.removeChild(modal);
            this.showSuccessMessage('Settings saved!');
        };
        
        document.getElementById('closeSettingsModal').onclick = () => {
            document.body.removeChild(modal);
        };
    }

    loadSettings() {
        const saved = localStorage.getItem('newBalanceSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            this.shopifySettings = { ...this.shopifySettings, ...settings };
            this.minSizesRequired = settings.minSizesRequired || this.minSizesRequired;
        }
    }

    setupDynamicContentWatcher() {
        const observer = new MutationObserver((mutations) => {
            if (!this.isWatching) return;
            
            let shouldReextract = false;
            
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    const addedNodes = Array.from(mutation.addedNodes);
                    const hasNewProducts = addedNodes.some(node => 
                        node.nodeType === 1 && 
                        (node.querySelector && node.querySelector('table') ||
                         /\b[MW]\d{3}[A-Z]\d{2}\b/.test(node.textContent || ''))
                    );
                    
                    if (hasNewProducts) {
                        shouldReextract = true;
                    }
                }
            });
            
            if (shouldReextract) {
                console.log('🔄 Dynamic content detected, re-extracting...');
                setTimeout(() => {
                    this.extractCurrentlyVisible();
                    this.updateWatchingStatus();
                }, 1000);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.mutationObserver = observer;
        
        this.watchInterval = setInterval(() => {
            if (this.isWatching) {
                this.performPeriodicCheck();
            }
        }, 5000);
        
        console.log('✅ Dynamic content watcher setup');
    }

    performPeriodicCheck() {
        const currentProductCount = this.collectedInventory.size;
        if (currentProductCount !== this.watchingMetrics.lastCheck) {
            this.watchingMetrics.lastCheck = currentProductCount;
            this.watchingMetrics.autoExtractions++;
            this.updateWatchingStatus();
            console.log(`📊 Periodic check: ${currentProductCount} products collected`);
        }
    }

    setupBackgroundMessageListener() {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === 'extractInventory') {
                    try {
                        this.extractAndDownloadShopify().then(result => {
                            sendResponse(result);
                        }).catch(error => {
                            sendResponse({ success: false, error: error.message });
                        });
                    } catch (error) {
                        sendResponse({ success: false, error: error.message });
                    }
                    return true;
                }
                
                if (message.action === 'chunkDownloaded') {
                    const format = message.data.format || 'product';
                    const count = message.data.recordCount || message.data.variantCount;
                    this.showSuccessMessage(`Downloaded Part ${message.data.chunkNumber}: ${count} ${format} records`);
                }
            });
        }
    }

    async extractAndDownloadShopify() {
        try {
            this.collectedInventory.clear();
            const count = await this.extractCurrentlyVisible();
            
            const allInventory = Array.from(this.collectedInventory.values()).flat();
            
            if (allInventory.length > 0) {
                const cleanInventory = this.validateAndCleanExportData(allInventory, 'inventory');
                const csv = this.shopifyConverter.convertToInventoryCSV(cleanInventory, this.shopifySettings);
                this.downloadCSV(csv, `newbalance-${Date.now()}.csv`);
                
                return {
                    success: true,
                    count: cleanInventory.length,
                    validProducts: count,
                    invalidFiltered: this.watchingMetrics.invalidProductsFiltered,
                    sizeExtractionFailures: this.watchingMetrics.sizeExtractionFailures,
                    realSkusGenerated: this.watchingMetrics.realSkusGenerated,
                    zeroInventoryProductsKept: this.watchingMetrics.zeroInventoryProductsKept
                };
            } else {
                return { 
                    success: false, 
                    count: 0, 
                    error: 'No valid products found'
                };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ===== HELPER METHODS =====
    getStockSummary(sizeData) {
        const totalStock = sizeData.reduce((sum, item) => sum + item.quantity, 0);
        const stockingSizes = sizeData.filter(s => s.quantity > 0).length;
        
        return {
            totalUnits: totalStock,
            stockingSizes: stockingSizes,
            outOfStockSizes: sizeData.length - stockingSizes,
            isCompletelyOutOfStock: totalStock === 0
        };
    }

    getContainerIdentifier(container, productData) {
        const rect = container.getBoundingClientRect();
        const inputCount = container.querySelectorAll('input[type="number"]').length;
        const identifier = `${productData.styleId}-${productData.colorCode}-${rect.top.toFixed(0)}-${inputCount}`;
        return identifier;
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    showSuccessMessage(message) {
        this.showNotification(message, '#28a745');
    }

    showError(message) {
        this.showNotification(message, '#dc3545');
    }

    showNotification(message, color) {
        const notification = document.createElement('div');
        notification.innerHTML = message;
        notification.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: ${color}; color: white; padding: 15px 25px;
            border-radius: 5px; z-index: 999999; font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            white-space: pre-line; max-width: 400px;
        `;
        
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 6000);
    }

    downloadCSV(csvContent, filename) {
        if (!csvContent) return;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || `newbalance-export-${Date.now()}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }
}

// ===== INITIALIZATION =====
function initializeNewBalanceExtractor() {
    console.log('🏃 Initializing Complete New Balance Extractor...');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => new ShopifyCompatibleCompleteNewBalanceExtractor(), 1000);
        });
    } else {
        setTimeout(() => new ShopifyCompatibleCompleteNewBalanceExtractor(), 1000);
    }
}

initializeNewBalanceExtractor();

// ===== MESSAGE LISTENER FOR POPUP INTEGRATION =====
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'extractInventory') {
            try {
                if (window.shopifyCompatibleNewBalanceExtractor || window.nbExtractor || window.newBalanceExtractor) {
                    const extractor = window.shopifyCompatibleNewBalanceExtractor || window.nbExtractor || window.newBalanceExtractor;
                    extractor.extractAndDownloadShopify().then(result => {
                        sendResponse(result);
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                } else {
                    sendResponse({ success: false, error: 'New Balance extractor not initialized' });
                }
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
    });
}