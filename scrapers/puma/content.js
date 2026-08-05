// ENHANCED SHOPIFY-COMPATIBLE PUMA CONTENT SCRIPT - FULL VERSION
// Complete implementation with rich product descriptions like ON shoes
// Updated with gender-specific sizing, proper case colors, and conditional taxable

// ===== ENHANCED PRODUCT DATABASE =====
class EnhancedPumaProductDatabase {
    constructor() {
        this.products = {
            // MagMax NITRO - $180
            'magmax': {
                baseName: 'MagMax NITRO',
                price: '180.00',
                compareAtPrice: '180.00',
                description: `
                    <p><strong>PUMA MagMax NITRO - Maximum Cushion Super Trainer</strong></p>
                    <p>Experience an exhilarating bounce like never before with the MagMax NITRO™. This max-cushioned super trainer features the most cutting-edge NITROFOAM™ technology ever packed into a PUMA shoe, delivering unparalleled comfort and energy return for your longest runs.</p>
                    
                    <h3>Key Features:</h3>
                    <ul>
                        <li><strong>NITROFOAM™ Technology:</strong> Nitrogen-infused supercritical foam providing maximum cushioning and explosive energy return</li>
                        <li><strong>Sky-High Stack:</strong> 47mm heel / 39mm forefoot - one of the tallest shoes on the market for ultimate protection</li>
                        <li><strong>PumaGrip Outsole:</strong> Full coverage rubber compound delivering best-in-class traction on wet and dry surfaces</li>
                        <li><strong>Stability Features:</strong> Wide base design with extensive sole flaring and midsole sidewalls for confident landings</li>
                        <li><strong>Engineered Mesh Upper:</strong> Breathable construction with PWRTAPE overlays for targeted support</li>
                    </ul>
                    
                    <h3>Technical Specifications:</h3>
                    <ul>
                        <li>Weight: 10.2 oz (men's) / 8.8 oz (women's)</li>
                        <li>Drop: 8mm (47mm heel / 39mm forefoot)</li>
                        <li>Cushioning: Maximum - ideal for long runs and recovery</li>
                        <li>Support: Neutral with stability features</li>
                    </ul>
                    
                    <h3>Perfect For:</h3>
                    <ul>
                        <li>Long distance training runs</li>
                        <li>Recovery runs requiring maximum protection</li>
                        <li>Runners seeking plush cushioning without sacrificing responsiveness</li>
                        <li>Daily miles at comfortable paces</li>
                    </ul>
                    
                    <p><em>The MagMax NITRO represents PUMA's entry into the max-cushion category, competing directly with shoes like the ASICS Superblast and Brooks Glycerin Max while maintaining a surprisingly lightweight feel for its massive stack height.</em></p>
                `,
                tags: 'Running, Max Cushion, Super Trainer, NITROFOAM, Daily Trainer, Long Run, Recovery, Neutral, High Stack',
                seoDescription: 'PUMA MagMax NITRO max cushion running shoe with 47mm heel stack, NITROFOAM technology, and PumaGrip outsole. Perfect for long runs and recovery.',
                category: 'Athletic Shoes',
                googleCategory: 'Apparel & Accessories > Shoes > Athletic Shoes > Running Shoes',
                material: 'Engineered Mesh, NITROFOAM, PumaGrip Rubber',
                gender: 'unisex',
                ageGroup: 'adult',
                condition: 'new',
                identifierExists: 'true'
            },
            
            // Deviate NITRO 3 - $160
            'deviate': {
                baseName: 'Deviate NITRO 3',
                price: '160.00',
                compareAtPrice: '160.00',
                description: `
                    <p><strong>PUMA Deviate NITRO 3 - Carbon-Plated Performance Trainer</strong></p>
                    <p>Experience unparalleled propulsion in your everyday training with the Deviate NITRO™ 3. This highly responsive trainer features PWRPLATE carbon fiber technology and dual-density NITROFOAM™ for a snappy ride that infuses speed into every stride.</p>
                    
                    <h3>Key Features:</h3>
                    <ul>
                        <li><strong>PWRPLATE Technology:</strong> Full-length carbon fiber plate engineered for powerful propulsion and efficient energy return</li>
                        <li><strong>Dual-Density NITROFOAM™:</strong> NITRO Elite foam on top for responsiveness, standard NITRO below for stability</li>
                        <li><strong>Increased Stack Height:</strong> More cushioning than v2 for enhanced comfort during longer efforts</li>
                        <li><strong>PumaGrip ATR:</strong> Superior traction compound for confident grip in all conditions</li>
                        <li><strong>Engineered Mesh Upper:</strong> Reinforced with PWRTAPE for targeted support without restricting movement</li>
                    </ul>
                    
                    <h3>Technical Specifications:</h3>
                    <ul>
                        <li>Weight: Approx. 9.7 oz (men's size 9)</li>
                        <li>Drop: 10mm for smooth heel-to-toe transition</li>
                        <li>Stack Height: 39mm heel for substantial cushioning</li>
                        <li>Plate: Full-length forked carbon fiber</li>
                    </ul>
                    
                    <h3>Perfect For:</h3>
                    <ul>
                        <li>Tempo runs and threshold workouts</li>
                        <li>Marathon training and racing</li>
                        <li>Runners seeking carbon plate benefits in a daily trainer</li>
                        <li>Versatile training from easy runs to speed work</li>
                    </ul>
                    
                    <p><em>The Deviate NITRO 3 bridges the gap between daily trainers and race shoes, offering carbon plate technology at a more accessible price point than elite racing shoes.</em></p>
                `,
                tags: 'Running, Carbon Plate, Performance, NITROFOAM, Tempo, Speed Work, Training, Racing, PWRPLATE',
                seoDescription: 'PUMA Deviate NITRO 3 carbon-plated running shoe with PWRPLATE technology and dual-density NITROFOAM. Perfect for tempo runs and marathon training.',
                category: 'Footwear > Athletic Shoes > Running Shoes',
                googleCategory: 'Apparel & Accessories > Shoes > Athletic Shoes > Running Shoes',
                material: 'Engineered Mesh, NITROFOAM, Carbon Fiber, PumaGrip',
                gender: 'unisex',
                ageGroup: 'adult',
                condition: 'new',
                identifierExists: 'true'
            },
            
            // Velocity NITRO 3 - $140
            'velocity': {
                baseName: 'Velocity NITRO 3',
                price: '140.00',
                compareAtPrice: '140.00',
                description: `
                    <p><strong>PUMA Velocity NITRO 3 - Versatile Daily Trainer</strong></p>
                    <p>Chase your rush with the Velocity NITRO™ 3. This versatile daily trainer combines NITRO™ foam technology with legendary PumaGrip traction, offering superior responsiveness and cushioning in a lightweight package perfect for all your running needs.</p>
                    
                    <h3>Key Features:</h3>
                    <ul>
                        <li><strong>NITRO™ Foam:</strong> Advanced nitrogen-infused cushioning for responsive yet comfortable ride</li>
                        <li><strong>ProFoam EVA:</strong> Firm base layer providing stability and structure</li>
                        <li><strong>PumaGrip Outsole:</strong> Industry-leading traction with full-length coverage for any surface</li>
                        <li><strong>PWRTAPE Support:</strong> Strategic overlays on the upper for midfoot lockdown</li>
                        <li><strong>Engineered Mesh:</strong> Breathable and comfortable with excellent ventilation</li>
                    </ul>
                    
                    <h3>Technical Specifications:</h3>
                    <ul>
                        <li>Weight: 9.4 oz / 266g (men's size 9)</li>
                        <li>Drop: 10mm (36mm heel / 26mm forefoot)</li>
                        <li>Cushioning: Moderate - perfect balance for all paces</li>
                        <li>Support: Neutral with light stability elements</li>
                    </ul>
                    
                    <h3>Perfect For:</h3>
                    <ul>
                        <li>Daily training at all paces</li>
                        <li>Long runs requiring consistent comfort</li>
                        <li>Tempo runs and moderate speed work</li>
                        <li>Runners seeking one versatile shoe for everything</li>
                        <li>Mixed terrain including light trails</li>
                    </ul>
                    
                    <p><em>The Velocity NITRO 3 is PUMA's answer to shoes like the Nike Pegasus and ASICS Cumulus - a reliable workhorse that excels at everything while offering exceptional value at its $140 price point.</em></p>
                `,
                tags: 'Running, Daily Trainer, Versatile, NITROFOAM, All-Purpose, Neutral, Training, PumaGrip, Value',
                seoDescription: 'PUMA Velocity NITRO 3 versatile daily running shoe with NITRO foam and PumaGrip outsole. Perfect all-around trainer for any pace or distance.',
                category: 'Footwear > Athletic Shoes > Running Shoes',
                googleCategory: 'Apparel & Accessories > Shoes > Athletic Shoes > Running Shoes',
                material: 'Engineered Mesh, NITROFOAM, EVA, PumaGrip',
                gender: 'unisex',
                ageGroup: 'adult',
                condition: 'new',
                identifierExists: 'true'
            }
        };
        
        this.colorVariations = {
            // MagMax colors
            'black': { hex: '#000000', family: 'Black' },
            'white': { hex: '#FFFFFF', family: 'White' },
            'lime pow': { hex: '#C4FF00', family: 'Green' },
            'poison pink': { hex: '#FF1493', family: 'Pink' },
            'psychedelic': { hex: '#FF00FF', family: 'Multi' },
            'glacier': { hex: '#E0F2F7', family: 'Blue' },
            'limelight': { hex: '#32CD32', family: 'Green' },
            
            // Common PUMA colors
            'nitro blue': { hex: '#0080FF', family: 'Blue' },
            'ultra orange': { hex: '#FF6600', family: 'Orange' },
            'elektro': { hex: '#00FFFF', family: 'Blue' },
            'speed green': { hex: '#00FF00', family: 'Green' },
            'red blast': { hex: '#FF0000', family: 'Red' },
            'silver mist': { hex: '#C0C0C0', family: 'Gray' },
            'shadow': { hex: '#696969', family: 'Gray' },
            'sunset': { hex: '#FFA500', family: 'Orange' },
            'puma black': { hex: '#000000', family: 'Black' },
            'puma white': { hex: '#FFFFFF', family: 'White' },
            'forever blue': { hex: '#005EB8', family: 'Blue' },
            'ultra violet': { hex: '#6B5B95', family: 'Purple' },
            'racing red': { hex: '#CC0000', family: 'Red' },
            'electric lime': { hex: '#CCFF00', family: 'Green' },
            'multi-color': { hex: '#808080', family: 'Multi' },
            'multi': { hex: '#808080', family: 'Multi' }
        };
    }
    
    identifyProduct(productName, styleId) {
        const nameLower = productName ? productName.toLowerCase() : '';
        const styleStr = styleId ? styleId.toString() : '';
        
        // Try to identify by product name patterns
        if (nameLower.includes('magmax') || styleStr.startsWith('310')) {
            return this.products.magmax;
        } else if (nameLower.includes('deviate') && (nameLower.includes('3') || nameLower.includes('nitro'))) {
            return this.products.deviate;
        } else if (nameLower.includes('velocity') || styleStr.startsWith('377') || styleStr.startsWith('380')) {
            return this.products.velocity;
        }
        
        // Default fallback based on style patterns
        if (styleStr.startsWith('309') || styleStr.startsWith('378')) {
            return this.products.deviate;
        } else if (styleStr.startsWith('311')) {
            return this.products.magmax;
        }
        
        // Ultimate fallback
        return this.products.velocity; // Most versatile/common
    }
    
    getColorInfo(colorName) {
        if (!colorName) return { hex: '#000000', family: 'Black' };
        
        const colorLower = colorName.toLowerCase().trim();
        
        // Check exact matches first
        if (this.colorVariations[colorLower]) {
            return this.colorVariations[colorLower];
        }
        
        // Check partial matches
        for (const [key, value] of Object.entries(this.colorVariations)) {
            if (colorLower.includes(key) || key.includes(colorLower)) {
                return value;
            }
        }
        
        // Check for color patterns
        if (colorLower.includes('black')) return { hex: '#000000', family: 'Black' };
        if (colorLower.includes('white')) return { hex: '#FFFFFF', family: 'White' };
        if (colorLower.includes('blue')) return { hex: '#0000FF', family: 'Blue' };
        if (colorLower.includes('red')) return { hex: '#FF0000', family: 'Red' };
        if (colorLower.includes('green')) return { hex: '#00FF00', family: 'Green' };
        if (colorLower.includes('orange')) return { hex: '#FFA500', family: 'Orange' };
        if (colorLower.includes('pink')) return { hex: '#FFC0CB', family: 'Pink' };
        if (colorLower.includes('purple')) return { hex: '#800080', family: 'Purple' };
        if (colorLower.includes('yellow')) return { hex: '#FFFF00', family: 'Yellow' };
        if (colorLower.includes('gray') || colorLower.includes('grey')) return { hex: '#808080', family: 'Gray' };
        
        // Default
        return { hex: '#808080', family: 'Multi' };
    }
    
    generateEnhancedProductData(baseData) {
        const product = this.identifyProduct(baseData.productName, baseData.styleId);
        const colorInfo = this.getColorInfo(baseData.colorName);
        
        // Generate proper product title with color
        const enhancedTitle = `${product.baseName} - ${baseData.colorName || 'Multi-Color'}`;
        
        return {
            ...baseData,
            enhancedTitle: enhancedTitle,
            description: product.description,
            price: product.price,
            compareAtPrice: product.compareAtPrice,
            tags: `${product.tags}, ${colorInfo.family}, Style-${baseData.styleId}`,
            seoTitle: `${product.baseName} ${baseData.colorName} Running Shoe | PUMA`,
            seoDescription: product.seoDescription,
            productType: 'Running Shoes',
            vendor: 'PUMA',
            category: product.category,
            googleCategory: product.googleCategory,
            material: product.material,
            colorHex: colorInfo.hex,
            colorFamily: colorInfo.family,
            gender: product.gender,
            ageGroup: product.ageGroup,
            condition: product.condition,
            identifierExists: product.identifierExists,
            customProductType: `PUMA ${product.baseName}`,
            metafields: {
                'custom.product_line': product.baseName,
                'custom.technology': 'NITROFOAM',
                'custom.color_hex': colorInfo.hex,
                'custom.release_year': '2024',
                'custom.usage': 'Running'
            }
        };
    }
}

// ===== ENHANCED SHOPIFY-COMPATIBLE CONVERTER =====
class ShopifyCompatiblePumaConverter {
    constructor(brand) {
        this.brand = brand;
        this.productDatabase = new EnhancedPumaProductDatabase();
        this.defaultSettings = {
            vendor: 'PUMA',
            productType: 'Running Shoes',
            tags: 'Athletic, Running, PUMA, Performance, Training',
            published: 'TRUE',
            variantPrice: '150.00',
            compareAtPrice: '',
            inventoryTracker: 'shopify',
            inventoryPolicy: 'deny',
            requiresShipping: 'TRUE',
            taxable: 'TRUE',
            fulfillmentService: 'manual',
            productCategory: 'Apparel & Accessories > Shoes > Athletic Shoes > Running Shoes',
            condition: 'new',
            status: 'active',
            locationName: 'Main Location'
        };
    }

    toProperCase(str) {
        if (!str) return str;
        
        const specialCases = {
            'PUMA': 'Puma',
            'NITRO': 'Nitro',
            'MAGMAX': 'MagMax',
            'DEVIATE': 'Deviate',
            'VELOCITY': 'Velocity',
            'PWRPLATE': 'PWRPLATE',
            'NITROFOAM': 'Nitrofoam',
            'PUMAGRIP': 'PumaGrip',
            'RS-X': 'RS-X',
            'WNS': "Women's",
            'MNS': "Men's"
        };
        
        const upper = str.toUpperCase();
        if (specialCases[upper]) {
            return specialCases[upper];
        }
        
        // Handle multi-word strings
        return str.split(/\s+/).map(word => {
            const upperWord = word.toUpperCase();
            if (specialCases[upperWord]) {
                return specialCases[upperWord];
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }

    // INVENTORY CSV GENERATION
    convertToInventoryCSV(inventoryData, settings = {}) {
        const csvSettings = { ...this.defaultSettings, ...settings };
        
        console.log('🔧 ENHANCED: Generating inventory CSV...');
        
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
            
            variants.forEach((variant) => {
                const sku = this.generateCleanSKU(variant);
                const quantity = this.parseQuantity(variant.quantity);
                const colorName = this.extractCleanColorName(baseProduct);
                const sizeValue = this.formatSizeForShopify(variant.sizeUS || variant.size);
                
                const row = [
                    handle,
                    sku,
                    'Size',
                    sizeValue,
                    'Color',
                    colorName,
                    '',
                    '',
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
        
        console.log(`✅ ENHANCED: Generated inventory CSV with ${csvRows.length} rows`);
        return csvContent;
    }

// Complete the convertToProductCSV method:
convertToProductCSV(inventoryData, settings = {}) {
    const csvSettings = { ...this.defaultSettings, ...settings };
    
    console.log('🎯 ENHANCED: Generating product CSV with gender labels...');
    
    if (!inventoryData || inventoryData.length === 0) {
        console.warn('⚠️ No product data provided');
        return '';
    }
    
    const shopifyData = [];
    const productGroups = this.groupByColorway(inventoryData);
    const usedHandles = new Set();
    const processedProducts = new Set();
    
    Object.keys(productGroups).forEach(productKey => {
        const variants = productGroups[productKey];
        if (variants.length === 0) return;
        
        const baseProduct = variants[0];
        
        // Check if already processed
        const productIdentifier = `${baseProduct.styleId}-${baseProduct.colorCode}-${baseProduct.genderCategory}`;
        if (processedProducts.has(productIdentifier)) {
            console.log(`♻️ Skipping already processed product: ${productIdentifier}`);
            return;
        }
        processedProducts.add(productIdentifier);
        
        // Get enhanced product data
        const enhancedData = this.productDatabase.generateEnhancedProductData(baseProduct);
        const handle = this.generateUniqueHandle(baseProduct, usedHandles);
        
        // Extract clean product title with gender
        let productTitle = this.extractCleanProductTitle(baseProduct);
        
        const gender = baseProduct.genderCategory || 'men';
        const genderLabel = gender === 'women' ? "Women's" : gender === 'men' ? "Men's" : "Youth";
        if (!productTitle.toLowerCase().includes(genderLabel.toLowerCase()) &&
            !productTitle.toLowerCase().includes('wns') &&
            !productTitle.toLowerCase().includes('mns')) {
            productTitle = `${genderLabel} ${productTitle}`;
        }
        
        const colorName = this.extractCleanColorName(baseProduct);
        const productPrice = enhancedData.price || csvSettings.variantPrice;
        const priceFloat = parseFloat(productPrice);
        const isTaxable = priceFloat > 175 ? 'TRUE' : 'FALSE';
        
        // Remove duplicate sizes
        const uniqueVariants = [];
        const seenSizes = new Set();
        
        variants.forEach(variant => {
            const sizeKey = String(variant.sizeUS || variant.size || 'OS');
            if (!seenSizes.has(sizeKey)) {
                uniqueVariants.push(variant);
                seenSizes.add(sizeKey);
            }
        });
        
        console.log(`📝 Processing ${genderLabel} product: ${productTitle} with ${uniqueVariants.length} unique sizes`);
        
        // Sort variants by size
        uniqueVariants.sort((a, b) => {
            const sizeA = parseFloat(a.sizeUS || a.size || 0);
            const sizeB = parseFloat(b.sizeUS || b.size || 0);
            return sizeA - sizeB;
        });
        
        uniqueVariants.forEach((variant, index) => {
            const isFirstVariant = index === 0;
            const sku = this.generateCleanSKU(variant);
            const quantity = this.parseQuantity(variant.quantity);
            const sizeValue = String(variant.sizeUS || variant.size || 'OS');
            
            const shopifyRow = {
                'Handle': String(handle),
                'Title': isFirstVariant ? String(productTitle) : '',
                'Body (HTML)': isFirstVariant ? String(enhancedData.description) : '',
                'Vendor': isFirstVariant ? 'PUMA' : '',
                'Product Category': isFirstVariant ? String(enhancedData.category) : '',
                'Type': isFirstVariant ? String(csvSettings.productType) : '',
                'Tags': isFirstVariant ? String(enhancedData.tags) : '',
                'Published': isFirstVariant ? 'TRUE' : '',
                'Option1 Name': isFirstVariant ? 'Size' : '',
                'Option1 Value': String(sizeValue),
                'Option2 Name': isFirstVariant ? 'Color' : '',
                'Option2 Value': String(colorName),
                'Option3 Name': '',
                'Option3 Value': '',
                'Variant SKU': String(sku),
                'Variant Grams': isFirstVariant ? '350' : '',
                'Variant Inventory Tracker': String(csvSettings.inventoryTracker),
                'Variant Inventory Policy': String(csvSettings.inventoryPolicy),
                'Variant Fulfillment Service': String(csvSettings.fulfillmentService),
                'Variant Price': String(productPrice),
                'Variant Compare At Price': '',  // Empty for no discount
                'Variant Requires Shipping': 'TRUE',
                'Variant Taxable': isTaxable,  // Based on price > $175
                'Variant Barcode': '',
                'Image Src': '',
                'Image Position': '',
                'Image Alt Text': isFirstVariant ? String(productTitle) : '',
                'Gift Card': 'FALSE',
                'SEO Title': isFirstVariant ? String(enhancedData.seoTitle) : '',
                'SEO Description': isFirstVariant ? String(enhancedData.seoDescription) : '',
                'Google Shopping / Google Product Category': isFirstVariant ? String(enhancedData.googleCategory) : '',
                'Google Shopping / Gender': isFirstVariant ? String(enhancedData.gender) : '',
                'Google Shopping / Age Group': isFirstVariant ? String(enhancedData.ageGroup) : '',
                'Google Shopping / MPN': isFirstVariant ? String(baseProduct.styleId || '') : '',
                'Google Shopping / Condition': isFirstVariant ? 'new' : '',
                'Google Shopping / Custom Product': 'FALSE',
                'Google Shopping / Custom Label 0': isFirstVariant ? String(enhancedData.customProductType) : '',
                'Google Shopping / Custom Label 1': isFirstVariant ? String(enhancedData.colorFamily) : '',
                'Google Shopping / Custom Label 2': isFirstVariant ? String(productPrice) : '',
                'Google Shopping / Custom Label 3': isFirstVariant ? 'NITROFOAM' : '',
                'Google Shopping / Custom Label 4': isFirstVariant ? '2024' : '',
                'Variant Image': '',
                'Variant Weight Unit': isFirstVariant ? 'g' : '',
                'Variant Tax Code': '',
                'Cost per item': isFirstVariant ? String((parseFloat(productPrice) * 0.5).toFixed(2)) : '',
                'Status': isFirstVariant ? 'active' : ''
            };
            
            // Add inventory location
            shopifyRow[`${csvSettings.locationName} / On Hand`] = String(quantity);
            
            // Add metafields if first variant
            if (isFirstVariant && enhancedData.metafields) {
                Object.entries(enhancedData.metafields).forEach(([key, value]) => {
                    shopifyRow[`Metafield: ${key}`] = String(value);
                });
            }
            
            shopifyData.push(shopifyRow);
        });
    });
    
    // Generate CSV
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
    
    console.log(`✅ ENHANCED: Generated product CSV with ${shopifyData.length} rows`);
    return csvContent;
}
    // Helper Methods
   // In ShopifyCompatiblePumaConverter class, update groupByColorway:
groupByColorway(inventoryData) {
    const groups = {};
    const seenSizes = new Map(); // Track unique size combinations
    
    inventoryData.forEach(item => {
        const styleId = this.cleanValue(item.styleId) || 'UNKNOWN';
        const colorCode = this.cleanValue(item.colorCode) || '01';
        const colorName = this.extractCleanColorName(item);
        const gender = item.genderCategory || 'men';
        
        // Include gender in the key to separate men's and women's versions
        const key = `${styleId}-${colorCode}-${gender}-${colorName.replace(/[^a-z0-9]/gi, '')}`;
        
        if (!groups[key]) {
            groups[key] = [];
            seenSizes.set(key, new Set());
        }
        
        // Create unique size identifier
        const sizeKey = `${item.sizeUS}`;
        
        // Only add if we haven't seen this size for this product yet
        if (!seenSizes.get(key).has(sizeKey)) {
            groups[key].push(item);
            seenSizes.get(key).add(sizeKey);
        } else {
            console.log(`🚫 Skipped duplicate size ${sizeKey} for product ${key}`);
        }
    });
    
    // Log grouping results
    Object.keys(groups).forEach(key => {
        console.log(`📦 Product group ${key}: ${groups[key].length} unique sizes`);
    });
    
    return groups;
}

// In ShopifyCompatiblePumaConverter class:
extractCleanProductTitle(product) {
    let title = product.productName || product.title || 'Unknown Product';
    title = title.replace(/<[^>]*>/g, '').trim();
    
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
    
    // Convert to proper case (not ALL CAPS)
    title = this.toProperCase(title);
    
    if (!title || title.length < 3) {
        title = 'Puma Product';
    }
    
    // Add gender to title if not already present
    const gender = product.genderCategory || this.detectGender(product);
    const genderLabel = gender === 'women' ? "Women's" : gender === 'men' ? "Men's" : "Youth";
    
    // Check if gender is already in title (but not WNS/MNS abbreviations)
    if (!title.toLowerCase().includes("women's") && 
        !title.toLowerCase().includes("men's") && 
        !title.toLowerCase().includes("youth")) {
        
        // Replace WNS with Women's if present
        if (title.includes('WNS') || title.includes('Wns')) {
            title = title.replace(/\bWNS\b/gi, "Women's");
        } else if (title.includes('MNS') || title.includes('Mns')) {
            title = title.replace(/\bMNS\b/gi, "Men's");
        } else {
            // Add gender prefix if not present
            title = `${genderLabel} ${title}`;
        }
    }
    
    // Include color name in product title
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
            const colorMatch = productName.match(/\b(BLACK|WHITE|RED|BLUE|GREEN|YELLOW|ORANGE|PURPLE|PINK|BROWN|GRAY|GREY|SILVER|GOLD|NAVY|MAROON|LAPIS|LAZULI|NITRO|PUMA)\b/i);
            
            colorName = colorMatch ? this.toProperCase(colorMatch[1]) : 'Multi-Color';
        } else {
            colorName = this.toProperCase(colorName);
        }
        
        return colorName;
    }

    generateCleanSKU(variant) {
        const styleId = this.cleanValue(variant.styleId) || 'PUMA00';
        const colorCode = this.cleanValue(variant.colorCode) || '01';
        const size = this.formatSizeForShopify(variant.sizeUS || variant.size || 'OS');
        return `${styleId}-${colorCode}-${size}`;
    }

    formatSizeForShopify(size) {
        if (!size) return 'OS';
        return size.toString().trim() || 'OS';
    }

    formatPrice(price) {
        if (!price || price === '' || price === null || price === undefined) {
            return '120.00';
        }
        const parsed = parseFloat(price);
        if (isNaN(parsed)) {
            return '120.00';
        }
        return parsed.toFixed(2);
    }

    parseQuantity(quantity) {
        if (quantity === null || quantity === undefined || quantity === '') {
            return 0;
        }
        const parsed = parseInt(quantity);
        return isNaN(parsed) ? 0 : Math.max(0, parsed);
    }

    cleanValue(value) {
        if (value === null || value === undefined || value === 'null' || value === 'undefined') {
            return '';
        }
        return String(value).trim();
    }

    // In ShopifyCompatiblePumaConverter class
generateUniqueHandle(product, usedHandles = new Set()) {
    // Extract and clean product title for handle
    let productTitle = this.extractCleanProductTitle(product);
    
    // Remove gender prefix for cleaner handle
    productTitle = productTitle.replace(/^(Women's|Men's|Womens|Mens)\s+/i, '');
    
    // Convert to handle-friendly format
    const titlePart = productTitle.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 30); // Limit length
    
    const styleId = this.cleanValue(product.styleId).toLowerCase() || 'style';
    const colorName = this.extractCleanColorName(product).toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .substring(0, 20); // Limit length
    
    // Build handle: product-title-color-styleid
    let baseHandle = `${titlePart}-${colorName}-${styleId}`
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '');
    
    // Ensure uniqueness
    if (!usedHandles.has(baseHandle)) {
        usedHandles.add(baseHandle);
        return baseHandle;
    }
    
    // Add counter if needed
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
        
        if (text.includes('WNS') || text.includes('WOMEN')) {
            return 'female';
        } else if (text.includes('MNS') || text.includes('MEN')) {
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

    detectGender(container) {
        const text = container.textContent.toUpperCase();
        
        if (text.includes('WNS') || text.includes('WOMEN')) {
            return 'women';
        } else if (text.includes('YOUTH') || text.includes('KIDS')) {
            return 'youth';
        } else {
            // DEFAULT TO MEN'S - not unisex
            return 'men';
        }
    }
}

// ===== STRUCTURE-BASED SIZE EXTRACTOR WITH GENDER-SPECIFIC RANGES =====
class StructureBasedSizeExtractor {
    constructor() {
        this.debugMode = true;
        this.validSizeRanges = {
            women: { min: 5.0, max: 11.0 },  // Updated: Women's 5-11
            men: { min: 7.0, max: 15.0 },    // Men's 7-15
        };
    }
    extractSizeQuantityData(container) {
        const sizeData = [];
        const numberInputs = container.querySelectorAll('input[type="number"]');
        console.log(`Found ${numberInputs.length} number inputs`);
        
        // First, extract ALL sizes including those with 0 inventory
        for (const input of numberInputs) {
            const sizeQuantity = this.analyzeSizeInputStructure(input);
            if (sizeQuantity) {  // Don't filter by quantity > 0 here
                sizeData.push(sizeQuantity);
            }
        }
        
        // Detect gender based on WNS first, then size range
        const genderCategory = this.detectGenderCategory(container);
        
        // Fill in missing sizes with 0 inventory based on gender
        const filledData = this.fillMissingSizes(sizeData, genderCategory);
        
        console.log(`📊 Processing ${genderCategory.toUpperCase()} product with ${filledData.length} sizes`);
        
        // Store gender for consistent use
        container.dataset.detectedGender = genderCategory;
        
        // Clean but don't remove 0 inventory items
        const cleanedData = this.validateAndCleanSizes(filledData, container, genderCategory);
        this.logSizeResults(cleanedData, genderCategory);
        
        return cleanedData;
    }
    
    fillMissingSizes(sizeData, gender) {
        const sizeMap = new Map();
        
        // First, add all found sizes
        sizeData.forEach(item => {
            const key = parseFloat(item.size).toFixed(1);
            sizeMap.set(key, item);
        });
        
        // Determine the range based on gender
        const range = this.validSizeRanges[gender];
        const allSizes = [];
        
        // Generate all valid sizes for this gender
        for (let size = range.min; size <= range.max; size += 0.5) {
            allSizes.push(size.toFixed(1));
        }
        
        // If we have at least 2 sizes, find the actual range in the data
        if (sizeMap.size >= 2) {
            const foundSizes = Array.from(sizeMap.keys()).map(s => parseFloat(s));
            const minFound = Math.min(...foundSizes);
            const maxFound = Math.max(...foundSizes);
            
            // Fill in missing sizes within the found range
            for (let size = minFound; size <= maxFound; size += 0.5) {
                const sizeKey = size.toFixed(1);
                if (!sizeMap.has(sizeKey) && allSizes.includes(sizeKey)) {
                    // Add missing size with 0 inventory
                    sizeMap.set(sizeKey, {
                        size: sizeKey,
                        quantity: 0,
                        method: 'filled-missing',
                        genderCategory: gender
                    });
                    console.log(`📝 Added missing size ${sizeKey} with 0 inventory`);
                }
            }
        }
        
        return Array.from(sizeMap.values());
    }

    analyzeSizeInputStructure(input) {
        try {
            const quantity = this.extractQuantityFromInput(input);
            const size = this.findSizeByStructure(input);
            
            if (size && quantity !== null) {
                return {
                    size: size,
                    quantity: Math.max(0, quantity),
                    method: 'structure-analysis',
                    inputElement: input
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
        
        const quantityFromStructure = this.findQuantityInStructure(input);
        if (quantityFromStructure !== null) {
            return quantityFromStructure;
        }
        
        const value = input.value || input.getAttribute('value') || '0';
        if (/^\d+$/.test(value)) {
            return parseInt(value);
        }
        
        return 0;
    }

    findQuantityInStructure(input) {
        let current = input.parentElement;
        let depth = 0;
        
        while (current && depth < 4) {
            const spans = current.querySelectorAll('span');
            
            for (const span of spans) {
                const text = span.textContent.trim();
                
                if (/^\d{1,3}$/.test(text)) {
                    const qty = parseInt(text);
                    if (qty >= 0 && qty <= 999) {
                        if (this.isNearInput(span, input)) {
                            return qty;
                        }
                    }
                }
            }
            
            current = current.parentElement;
            depth++;
        }
        
        return null;
    }

    isNearInput(element, input) {
        try {
            const elementRect = element.getBoundingClientRect();
            const inputRect = input.getBoundingClientRect();
            
            const distance = Math.sqrt(
                Math.pow(elementRect.x - inputRect.x, 2) + 
                Math.pow(elementRect.y - inputRect.y, 2)
            );
            
            return distance < 150;
        } catch (error) {
            return false;
        }
    }

    findSizeByStructure(input) {
        const containerSize = this.searchContainerForSize(input.parentElement);
        if (containerSize) return containerSize;
        
        if (input.parentElement && input.parentElement.parentElement) {
            const grandparentSize = this.searchContainerForSize(input.parentElement.parentElement);
            if (grandparentSize) return grandparentSize;
        }
        
        const siblingSize = this.searchSiblingsForSize(input);
        if (siblingSize) return siblingSize;
        
        const spatialSize = this.findSizeBySpatialAnalysis(input);
        if (spatialSize) return spatialSize;
        
        return null;
    }

    searchContainerForSize(container) {
        if (!container) return null;
        
        const spans = container.querySelectorAll('span');
        
        for (const span of spans) {
            const size = this.extractSizeFromText(span.textContent);
            if (size && this.isReasonableSize(size)) {
                return size;
            }
        }
        
        const containerText = this.getDirectTextContent(container);
        const size = this.extractSizeFromText(containerText);
        if (size && this.isReasonableSize(size)) {
            return size;
        }
        
        return null;
    }

    getDirectTextContent(element) {
        let text = '';
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            }
        }
        return text.trim();
    }

    searchSiblingsForSize(input) {
        if (!input.parentElement) return null;
        
        const siblings = Array.from(input.parentElement.children);
        
        for (const sibling of siblings) {
            if (sibling !== input) {
                const size = this.searchContainerForSize(sibling);
                if (size) return size;
            }
        }
        
        return null;
    }

    findSizeBySpatialAnalysis(input) {
        try {
            const inputRect = input.getBoundingClientRect();
            const allSpans = document.querySelectorAll('span');
            
            let closestSizeSpan = null;
            let minDistance = Infinity;
            
            for (const span of allSpans) {
                const size = this.extractSizeFromText(span.textContent);
                if (size && this.isReasonableSize(size)) {
                    const spanRect = span.getBoundingClientRect();
                    const distance = Math.sqrt(
                        Math.pow(spanRect.x - inputRect.x, 2) + 
                        Math.pow(spanRect.y - inputRect.y, 2)
                    );
                    
                    if (distance < minDistance && distance < 200) {
                        minDistance = distance;
                        closestSizeSpan = span;
                    }
                }
            }
            
            if (closestSizeSpan) {
                const size = this.extractSizeFromText(closestSizeSpan.textContent);
                console.log(`🔍 Found size ${size} by spatial analysis`);
                return size;
            }
            
        } catch (error) {
            console.error('Error in spatial analysis:', error);
        }
        
        return null;
    }

    extractSizeFromText(text) {
        if (!text || typeof text !== 'string') return null;
        
        const cleanText = text.trim();
        
        const decimalMatch = cleanText.match(/^(\d{1,2}\.\d)$/);
        if (decimalMatch) {
            return decimalMatch[1];
        }
        
        const wholeMatch = cleanText.match(/^(\d{1,2})$/);
        if (wholeMatch) {
            const size = parseInt(wholeMatch[1]);
            if (size >= 3 && size <= 18) {
                return size.toString();
            }
        }
        
        const embeddedDecimalMatch = cleanText.match(/\b(\d{1,2}\.\d)\b/);
        if (embeddedDecimalMatch) {
            const size = parseFloat(embeddedDecimalMatch[1]);
            if (this.isReasonableSize(size.toString())) {
                return size.toString();
            }
        }
        
        const embeddedWholeMatch = cleanText.match(/\b(\d{1,2})\b/);
        if (embeddedWholeMatch) {
            const size = parseInt(embeddedWholeMatch[1]);
            if (size >= 3 && size <= 18) {
                return size.toString();
            }
        }
        
        return null;
    }

    extractByPatternMatching(container) {
        console.log('🔍 Using pattern matching fallback');
        
        const sizeData = [];
        const containerText = container.textContent || '';
        
        const patterns = [
            /(\d{1,2}(?:\.\d)?)[:\-\s]*(\d{1,3})\s*(?:units?|pcs?|available)?/gi,
            /(\d{1,2}(?:\.\d)?)\s*\(\s*(\d{1,3})\s*\)/g,
            /\b(\d{1,2}(?:\.\d)?)\b.*?\b(\d{1,3})\b/g
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(containerText)) !== null) {
                const potentialSize = match[1];
                const potentialQuantity = parseInt(match[2]);
                
                if (this.isReasonableSize(potentialSize) && 
                    potentialQuantity >= 0 && 
                    potentialQuantity <= 999 &&
                    parseFloat(potentialSize) >= 3.0 &&
                    parseFloat(potentialSize) <= 15.0) {
                    
                    sizeData.push({
                        size: potentialSize,
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
        
        return (numericSize >= 3.0 && numericSize <= 15.0) && 
               (numericSize % 0.5 === 0 || numericSize % 1 === 0);
    }

   // In validateAndCleanSizes - don't remove 0 inventory
validateAndCleanSizes(sizeData, container, providedGenderCategory) {
    const gender = providedGenderCategory || container.dataset.detectedGender || 'men';
    const validRange = this.validSizeRanges[gender];
    
    console.log(`🎯 Validating ${gender.toUpperCase()} sizes (${validRange.min}-${validRange.max})`);
    
    const cleanedData = sizeData
        .filter(item => {
            const size = parseFloat(item.size);
            return size >= validRange.min && size <= validRange.max;
        })
        .sort((a, b) => parseFloat(a.size) - parseFloat(b.size));
    
    // Keep items with 0 inventory - they should appear in the export
    return cleanedData;
}
    detectGenderFromSizes(sizeData) {
        if (!sizeData || sizeData.length < 3) return null;
        
        const sizes = sizeData.map(item => parseFloat(item.size)).filter(s => !isNaN(s));
        if (sizes.length === 0) return null;
        
        const minSize = Math.min(...sizes);
        const maxSize = Math.max(...sizes);
        
        console.log(`🔍 Analyzing size range: ${minSize} - ${maxSize}`);
        
        // Men's shoes start at 7 or higher
        if (minSize >= 7) {
            console.log(`👨 MEN'S detected from size range (${minSize}-${maxSize})`);
            return 'men';
        }
        
        // Women's shoes have 5-11 range  
        if (minSize <= 6 && maxSize <= 11.5) {
            console.log(`👩 WOMEN'S detected from size range (${minSize}-${maxSize})`);
            return 'women';
        }
        
        // Default to men's for ambiguous cases
        console.log(`👨 Defaulting to MEN'S for range (${minSize}-${maxSize})`);
        return 'men';
    }
    // In StructureBasedSizeExtractor class:
    detectGenderCategory(container) {
        // PRIORITY 1: Check for WNS (Women's) in title attributes
        const titleElements = container.querySelectorAll('[title]');
        
        for (const element of titleElements) {
            const title = element.getAttribute('title');
            if (title && title.length > 5 && title.length < 100) {
                const upperTitle = title.toUpperCase();
                
                // WNS = DEFINITELY Women's
                if (upperTitle.includes('WNS')) {
                    console.log('👩 WOMEN\'S detected: WNS in title');
                    return 'women';
                }
            }
        }
        
        // PRIORITY 2: Check actual size range if no WNS
        const sizeSpans = container.querySelectorAll('span.sc-jptPkM');
        const sizes = [];
        
        for (const span of sizeSpans) {
            const text = span.textContent.trim();
            if (/^\d{1,2}(\.\d)?$/.test(text)) {
                sizes.push(parseFloat(text));
            }
        }
        
        if (sizes.length >= 3) {
            const minSize = Math.min(...sizes);
            const maxSize = Math.max(...sizes);
            
            console.log(`🔍 Size range found: ${minSize}-${maxSize}`);
            
            // Sizes starting at 7+ = MEN'S
            if (minSize >= 7) {
                console.log('👨 MEN\'S detected: sizes start at 7+');
                return 'men';
            }
            
            // Sizes 5-11 = WOMEN'S
            if (minSize <= 6 && maxSize <= 11.5) {
                console.log('👩 WOMEN\'S detected: sizes 5-11 range');
                return 'women';
            }
        }
        
        // DEFAULT: Men's (most products without WNS are men's)
        console.log('👨 Defaulting to MEN\'S');
        return 'men';
    }
    filterByGenderCategory(sizeData, genderCategory) {
        const validRange = this.validSizeRanges[genderCategory] || { min: 5.0, max: 15.0 };
        
        const filtered = sizeData.filter(item => {
            const size = parseFloat(item.size);
            const isInRange = size >= validRange.min && size <= validRange.max;
            
            if (!isInRange) {
                console.log(`⚠️ Filtered out size ${item.size} (outside ${genderCategory} range: ${validRange.min}-${validRange.max})`);
            }
            
            return isInRange;
        });
        
        console.log(`🔍 Gender filtering: ${genderCategory} (${validRange.min}-${validRange.max}) - ${sizeData.length} → ${filtered.length} sizes`);
        return filtered;
    }

    isValidSizeQuantity(sizeQuantity) {
        return sizeQuantity && 
               this.isReasonableSize(sizeQuantity.size) && 
               typeof sizeQuantity.quantity === 'number' && 
               sizeQuantity.quantity >= 0;
    }

    logSizeResults(sizeData, genderCategory) {
        if (sizeData.length > 0) {
            console.log(`🔍 Size Extraction Results for ${genderCategory.toUpperCase()}:`);
            sizeData.forEach((item) => {
                const status = item.quantity > 0 ? '✅' : '❌';
                console.log(`   ${status} Size ${item.size}: ${item.quantity} units (${item.method})`);
            });
            
            const totalStock = sizeData.reduce((sum, item) => sum + item.quantity, 0);
            const inStockSizes = sizeData.filter(item => item.quantity > 0).length;
            
            console.log(`   📊 ${genderCategory.toUpperCase()} Summary: ${inStockSizes}/${sizeData.length} sizes in stock, ${totalStock} total units`);
        } else {
            console.log(`⚠️ No valid ${genderCategory} sizes extracted`);
        }
    }
}

// ===== STRUCTURE-BASED PRODUCT DETECTOR WITH GENDER DISPLAY =====
class StructureBasedProductDetector {
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
            /checkout/i,
            /menu/i,
            /navigation/i,
            /header/i,
            /footer/i,
            /search/i,
            /filter/i,
            /sort/i,
            /home/i,
            /about/i,
            /contact/i,
            /help/i,
            /support/i,
            /faq/i,
            /terms/i,
            /privacy/i,
            /policy/i,
            /copyright/i,
            /\d{4}\s*puma/i,
            /all\s*rights?\s*reserved/i
        ];
        
        this.invalidProductTitlePatterns = [
            /^.*order\s+is\s+shared.*$/i,
            /^.*master.*ats.*store.*llc.*dba.*$/i,
            /^.*\(\d{7,}\).*order.*shared.*$/i,
            /^(loading|error|placeholder|test\s+product)$/i,
            /^add\s+to\s+cart/i,
            /^(add|remove|delete|edit)/i,
            /^(cart|basket|checkout)/i,
            /^(login|logout|sign\s*in|sign\s*out)/i,
            /^(save|cancel|submit|reset)/i,
            /^(next|previous|back|continue)/i,
            /^(search|filter|sort|view)/i,
            /^(select\s+all|clear\s+all)/i,
            /^(loading|please\s+wait)/i,
            /^(error|warning|info|success)/i,
            /^(home|about|contact|help)/i,
            /^(button|link|menu|dropdown)/i,
            /^[a-z]{1,3}$/i,
            /^\s*[\/\\<>*+\-=_|]+\s*$/,
            /^(click|tap|press|touch)/i,
            /^(quantity|qty|price|total|subtotal)/i,
            /^(shipping|delivery|payment)/i,
            /^(wishlist|favorites|compare)/i,
            /^(size\s+guide|fit\s+guide)/i,
            /^(default|sample|example|demo)/i,
            /^(text|content|data|item)/i,
            /^(product\s+\d+|item\s+\d+)/i,
            /^(active|inactive|enabled|disabled)$/i,
            /checking\s+your\s+credentials/i,
            /checking\s+credentials/i,
            /authenticating/i,
            /redirecting/i,
            /processing/i,
            /connection\s+timeout/i,
            /access\s+denied/i,
            /session\s+expired/i,
            /unauthorized/i,
        ];
        
        this.validProductIndicators = [
            /\b(magmax|nitro|suede|rs-x|cali|thunder|cell|boost|ignite|hybrid|disc)\b/i,
            /\b(velocity|deviate|magnify|electrify|softride|flyer|runner)\b/i,
            /\b(knit|classic|sport|training|running|lifestyle|future|ultra|speedcat)\b/i,
            /\b(puma|athletic|shoe|sneaker|footwear)\b/i,
            /\b\w+\s+(wns|mns|mens|women|unisex)\b/i,
            /\b\w+\s+\d+(\.\d+)?\b/i,
            /\b[a-z]+[-_][a-z0-9]+\b/i,
        ];
    }

    toProperCase(str) {
        if (!str) return str;
        
        const specialCases = {
            'PUMA': 'Puma',
            'NITRO': 'Nitro',
            'MAGMAX': 'MagMax',
            'PWRPLATE': 'PWRPLATE',
            'NITROFOAM': 'Nitrofoam',
            'RS-X': 'RS-X',
            'WNS': "Women's",  // Convert WNS to Women's
            'MNS': "Men's"      // Convert MNS to Men's
        };
        
        // Check for exact match first
        const upper = str.toUpperCase();
        if (specialCases[upper]) {
            return specialCases[upper];
        }
        
        // Handle multi-word strings
        return str.split(/\s+/).map(word => {
            const upperWord = word.toUpperCase();
            if (specialCases[upperWord]) {
                return specialCases[upperWord];
            }
            // Convert each word to proper case
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }
    findAllProductContainers() {
        console.log('🔍 Structure-based product detection');
        
        const containers = [];
        
        const containersWithInputs = this.findContainersByInputPattern();
        containers.push(...containersWithInputs);
        
        const containersWithContent = this.findContainersByContentPattern();
        containers.push(...containersWithContent);
        
        const uniqueContainers = this.removeDuplicateContainers(containers);
        
        console.log(`🎯 Found ${uniqueContainers.length} containers`);
        return uniqueContainers;
    }

    findContainersByInputPattern() {
        const containers = [];
        const allElements = document.querySelectorAll('*');
        
        for (const element of allElements) {
            const numberInputs = element.querySelectorAll('input[type="number"]');
            
            if (numberInputs.length >= 8) {
                const directInputs = this.getDirectNumberInputs(element);
                
                if (directInputs.length >= 8) {
                    if (this.validateProductContainer(element)) {
                        containers.push(element);
                        console.log(`✅ Found container by input pattern: ${numberInputs.length} inputs`);
                    }
                }
            }
        }
        
        return containers;
    }

    getDirectNumberInputs(container) {
        const inputs = [];
        
        const traverse = (element, depth) => {
            if (depth > 5) return;
            
            for (const child of element.children) {
                if (child.tagName === 'INPUT' && child.type === 'number') {
                    inputs.push(child);
                } else {
                    traverse(child, depth + 1);
                }
            }
        };
        
        traverse(container, 0);
        return inputs;
    }

    findContainersByContentPattern() {
        const containers = [];
        const allElements = document.querySelectorAll('*');
        
        for (const element of allElements) {
            const text = element.textContent || '';
            
            if (/\b\d{6}\b/.test(text)) {
                let container = element;
                let depth = 0;
                
                while (container && depth < 10) {
                    const inputs = container.querySelectorAll('input[type="number"]');
                    
                    if (inputs.length >= 5) {
                        if (this.validateProductContainer(container)) {
                            containers.push(container);
                            console.log(`✅ Found container by content pattern: Style ID + ${inputs.length} inputs`);
                            break;
                        }
                    }
                    
                    container = container.parentElement;
                    depth++;
                }
            }
        }
        
        return containers;
    }

    validateProductContainer(container) {
        const numberInputs = container.querySelectorAll('input[type="number"]');
        if (numberInputs.length < 5) return false;
        
        const text = container.textContent || '';
        
        const hasStyleId = /\b\d{6}\b/.test(text);
        const hasPrice = /\$\d+/.test(text) || /\b\d+\.\d{2}\b/.test(text);
        
        const titleElements = container.querySelectorAll('[title]');
        const hasValidTitle = titleElements.length > 0 && 
                            Array.from(titleElements).some(el => {
                                const title = el.getAttribute('title');
                                return title && 
                                       title.length > 5 && 
                                       this.isValidProductName(title) &&
                                       !this.isInvalidProductTitle(title);
                            });
        
        const hasSizes = this.hasSizeIndicators(container);
        const hasUIOnlyContent = this.hasOnlyUIContent(container);
        
        const isValid = (hasStyleId || hasValidTitle) && 
                       (hasPrice || hasSizes) && 
                       numberInputs.length >= 5 &&
                       !hasUIOnlyContent;
        
        return isValid;
    }

    hasOnlyUIContent(container) {
        const text = container.textContent || '';
        const words = text.toLowerCase().trim().split(/\s+/);
        
        const uiWords = ['add', 'to', 'cart', 'remove', 'edit', 'save', 'cancel', 'submit', 
                        'login', 'logout', 'search', 'filter', 'sort', 'view', 'next', 'back',
                        'select', 'all', 'clear', 'loading', 'please', 'wait', 'error'];
        
        if (words.length <= 5) {
            const uiWordCount = words.filter(word => uiWords.includes(word)).length;
            if (uiWordCount >= words.length * 0.8) {
                console.log(`🚫 Container has only UI content: "${text}"`);
                return true;
            }
        }
        
        return false;
    }

    hasSizeIndicators(container) {
        const text = container.textContent || '';
        
        const sizePatterns = [
            /\b\d{1,2}\.\d\b/,
            /\b[3-9]\b/,
            /\b1[0-8]\b/
        ];
        
        let sizeCount = 0;
        for (const pattern of sizePatterns) {
            const matches = text.match(pattern);
            if (matches) {
                sizeCount += matches.length;
            }
        }
        
        return sizeCount >= 3;
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

   // In StructureBasedProductDetector class
extractProductData(container) {
    // Get gender from container if already detected during size extraction
    const genderCategory = container.dataset.detectedGender || this.detectGender(container);
    
    // Display gender detection prominently
    console.log('');
    console.log(`╔════════════════════════════════════╗`);
    console.log(`║  👟 PRODUCT GENDER: ${genderCategory.toUpperCase().padEnd(14)} ║`);
    console.log(`╚════════════════════════════════════╝`);
    console.log('');
    
    const title = this.findProductTitle(container);
    const styleId = this.findStyleId(container);
    const colorName = this.findColorName(container);
    const colorCode = this.findColorCode(container);
    const price = this.findPrice(container);
    
    console.log(`🎯 Extracted product data:`, {
        title, 
        styleId, 
        colorName: this.toProperCase(colorName), 
        colorCode, 
        price, 
        genderCategory,
        sizeRange: this.getSizeRangeForGender(genderCategory)
    });
    
    return {
        title: title,
        productName: title,
        styleId: styleId,
        colorName: this.toProperCase(colorName),
        colorCode: colorCode,
        price: price,
        genderCategory: genderCategory, // This ensures gender is passed through
        sizeRange: this.getSizeRangeForGender(genderCategory),
        isValid: this.isValidProduct(title, styleId)
    };
}

    getSizeRangeForGender(gender) {
        const ranges = {
            'women': '5-11',
            'men': '7-15',
        };
        return ranges[gender] || '7-15';  // Default to men's range
    }

    findStyleId(container) {
        const allElements = container.querySelectorAll('*');
        
        for (const element of allElements) {
            const text = element.textContent.trim();
            if (/^\d{6}$/.test(text)) {
                console.log(`🎯 Found style ID: ${text}`);
                return text;
            }
        }
        
        const containerText = container.textContent || '';
        const styleMatch = containerText.match(/\b(\d{6})\b/);
        if (styleMatch) {
            console.log(`🎯 Found style ID in text: ${styleMatch[1]}`);
            return styleMatch[1];
        }
        
        return 'UNKNOWN';
    }

    findColorCode(container) {
        const allElements = container.querySelectorAll('*');
        
        for (const element of allElements) {
            const text = element.textContent.trim();
            
            if (/^\d{2}$/.test(text)) {
                console.log(`🎯 Found potential color code: ${text}`);
                return text;
            }
        }
        
        const containerText = container.textContent || '';
        
        const styleColorMatch = containerText.match(/\b\d{6}[-_](\d{2})\b/);
        if (styleColorMatch) {
            console.log(`🎯 Found color code from style pattern: ${styleColorMatch[1]}`);
            return styleColorMatch[1];
        }
        
        const twoDigitMatches = containerText.match(/\b(\d{2})\b/g);
        if (twoDigitMatches) {
            for (const match of twoDigitMatches) {
                const num = parseInt(match);
                if (num >= 1 && num <= 50) {
                    console.log(`🎯 Found color code from text: ${match}`);
                    return match;
                }
            }
        }
        
        console.log(`⚠️ No color code found, using 01`);
        return '01';
    }

    findProductTitle(container) {
        console.log('🎯 Enhanced product title extraction');
        
        // Strategy 1: Look for title attributes
        const titleElements = container.querySelectorAll('[title]');
        const validTitleCandidates = [];
        
        for (const element of titleElements) {
            const title = element.getAttribute('title');
            if (title && 
                title.length > 5 && 
                title.length < 100 &&
                !this.containsNavigationText(title) &&
                this.isHighQualityProductName(title) && 
                !this.isInvalidProductTitle(title)) {
                
                if (this.isWithinProductArea(element, container)) {
                    validTitleCandidates.push({
                        text: title,
                        element: element,
                        quality: this.calculateProductTitleQuality(title)
                    });
                }
            }
        }
        
        if (validTitleCandidates.length > 0) {
            validTitleCandidates.sort((a, b) => b.quality - a.quality);
            let bestTitle = this.cleanNavigationContamination(validTitleCandidates[0].text);
            bestTitle = this.toProperCase(bestTitle);  // Convert to proper case
            console.log(`🎯 Found high-quality product title: ${bestTitle}`);
            return bestTitle;
        }
        // Strategy 2: Look for product-specific class patterns
        const productClasses = [
            'product-name', 'product-title', 'item-name', 'item-title',
            'sc-hycgNl', 'sc-fxgLge', 'TMXgf', 'bATOYA'
        ];
        
        for (const className of productClasses) {
            const elements = container.getElementsByClassName(className);
            for (const element of elements) {
                const text = element.textContent.trim();
                if (text.length > 5 && 
                    text.length < 100 &&
                    !this.containsNavigationText(text) &&
                    this.isHighQualityProductName(text) && 
                    !this.isInvalidProductTitle(text) &&
                    this.isWithinProductArea(element, container)) {
                    
                    const cleanTitle = this.cleanNavigationContamination(text);
                    console.log(`🎯 Found product title by class pattern: ${cleanTitle}`);
                    return cleanTitle;
                }
            }
        }
        
        // Strategy 3: Look for spans with product-like text
        const allSpans = container.querySelectorAll('span');
        const highQualityTitles = [];
        
        for (const span of allSpans) {
            const text = span.textContent.trim();
            
            if (this.containsNavigationText(text)) {
                console.log(`🚫 Skipped navigation text: "${text}"`);
                continue;
            }
            
            if (text.length > 5 && 
                text.length < 100 && 
                this.isHighQualityProductName(text) && 
                !this.isInvalidProductTitle(text) &&
                span.children.length === 0 &&
                this.isWithinProductArea(span, container)) {
                
                highQualityTitles.push({
                    text: text,
                    element: span,
                    quality: this.calculateProductTitleQuality(text)
                });
            }
        }
        
        if (highQualityTitles.length > 0) {
            highQualityTitles.sort((a, b) => b.quality - a.quality);
            const bestTitle = this.cleanNavigationContamination(highQualityTitles[0].text);
            console.log(`🎯 Found high-quality product title in span: ${bestTitle}`);
            return bestTitle;
        }
        
        console.log(`⚠️ No valid product title found, using fallback`);
        return 'Puma Product';
    }

    cleanNavigationContamination(text) {
        if (!text) return 'Unknown Product';
        
        const navigationPatterns = [
            /Welcome,?\s*[^,\s]+/gi,
            /Shop\s*Now/gi,
            /Explore/gi,
            /Manage/gi,
            /My\s*Account/gi,
            /Sign\s*(In|Out)/gi,
            /Log\s*(In|Out)/gi,
            /DanShop/gi,
            /Dan\s*Shop/gi,
            /nowexplore/gi,
            /shopnow/gi,
            /welcome\s*,/gi,
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
        
        return cleaned.length < 3 ? 'Puma Product' : cleaned;
    }

    containsNavigationText(text) {
        if (!text) return false;
        
        for (const pattern of this.navigationPatterns) {
            if (pattern.test(text)) {
                console.log(`🚫 Navigation pattern detected in: "${text}"`);
                return true;
            }
        }
        
        const suspiciousPatterns = [
            /[a-z][A-Z][a-z]+[A-Z][a-z]+/,
            /welcome.*shop.*now.*explore/i,
            /shop.*now.*explore.*manage/i,
            /[^,\s]+shop\s*now/i,
            /[^,\s]+explore/i,
            /[^,\s]+manage/i
        ];
        
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(text)) {
                console.log(`🚫 Suspicious navigation concatenation detected in: "${text}"`);
                return true;
            }
        }
        
        return false;
    }

    isWithinProductArea(element, container) {
        const rect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        if (rect.top < containerRect.top - 100) {
            console.log(`🚫 Element is above product container - likely navigation`);
            return false;
        }
        
        let parent = element.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
            const parentClass = parent.className || '';
            const parentId = parent.id || '';
            
            if (/nav|header|menu|toolbar/i.test(parentClass + parentId)) {
                console.log(`🚫 Element is within navigation structure`);
                return false;
            }
            
            parent = parent.parentElement;
            depth++;
        }
        
        return true;
    }

    findColorName(container) {
        console.log('🎯 Targeted color extraction');
        
        const colorClasses = ['sc-laTMn', 'bYrOCs', 'VariationImage'];
        for (const className of colorClasses) {
            const colorElements = container.getElementsByClassName(className);
            for (const element of colorElements) {
                const text = element.textContent.trim();
                
                if (text && 
                    text.length > 2 && 
                    text.length < 100 &&
                    !this.containsNavigationText(text) &&
                    !this.isBusinessText(text) &&
                    this.looksLikeColorName(text)) {
                    console.log(`🎨 Found color in ${className}: "${this.toProperCase(text)}"`);
                    return this.toProperCase(text);
                }
            }
        }
        
        const elementsWithTitle = container.querySelectorAll('[title]');
        const colorCandidates = [];
        
        for (const element of elementsWithTitle) {
            const title = element.getAttribute('title');
            
            if (this.isHighQualityProductName(title)) continue;
            
            const nearbyInputs = this.countNearbyInputs(element, container);
            
            if (title && 
                title.length > 2 && 
                title.length < 100 &&
                nearbyInputs > 0 &&
                !this.containsNavigationText(title) &&
                !this.isBusinessText(title) &&
                this.looksLikeColorName(title)) {
                
                colorCandidates.push({
                    text: this.toProperCase(title),
                    element: element,
                    quality: this.calculateColorQuality(title, nearbyInputs)
                });
            }
        }
        
        if (colorCandidates.length > 0) {
            colorCandidates.sort((a, b) => b.quality - a.quality);
            const bestColor = colorCandidates[0];
            console.log(`🎨 Found color in title attribute: "${bestColor.text}"`);
            return bestColor.text;
        }
        
        console.log(`⚠️ No color found using targeted extraction`);
        return 'Multi-Color';
    }
    
    looksLikeColorName(text) {
        if (!text || text.length < 2) return false;
        
        const colorPatterns = [
            /\b(BLACK|WHITE|RED|BLUE|GREEN|YELLOW|ORANGE|PURPLE|PINK|BROWN|GRAY|GREY|SILVER|GOLD|NAVY|MAROON)\b/i,
            /\b(PUMA|NITRO|LAPIS|LAZULI|FIZZY|GALACTIC|CRYSTAL|MELT|MINT|COOL|WARM)\b/i,
            /\b(DARK|LIGHT|BRIGHT|DEEP|PALE|NEON|ELECTRIC|METALLIC)\b/i,
            /\w+[-\s]+\w+/,
            /\b(MOON|SUN|SKY|OCEAN|FOREST|DESERT|SNOW|WEATHER|CLOUD)\b/i
        ];
        
        const hasColorPattern = colorPatterns.some(pattern => pattern.test(text));
        
        const uiTerms = ['elastic', 'copy', 'paste', 'whiteboard', 'items', 'view', 'catalog', 'build', 'order', 'enter', 'quantities'];
        const hasUITerm = uiTerms.some(term => text.toLowerCase().includes(term));
        
        return hasColorPattern && !hasUITerm;
    }
    
    countNearbyInputs(element, container) {
        let count = 0;
        let parent = element.parentElement;
        let levels = 0;
        
        while (parent && parent !== container && levels < 5) {
            const inputs = parent.querySelectorAll('input[type="number"]');
            count += inputs.length;
            parent = parent.parentElement;
            levels++;
        }
        
        return count;
    }
    
    calculateColorQuality(text, nearbyInputs) {
        let quality = 0;
        
        if (this.looksLikeColorName(text)) {
            quality += 50;
        }
        
        quality += Math.min(nearbyInputs * 5, 50);
        
        if (/[-\/]/.test(text)) {
            quality += 20;
        }
        
        if (/\b(PUMA|NITRO)\b/i.test(text)) {
            quality += 30;
        }
        
        if (/\d{3,}/.test(text)) {
            quality -= 50;
        }
        
        if (/\n/.test(text)) {
            quality -= 100;
        }
        
        return quality;
    }

    isBusinessText(text) {
        if (!text) return false;
        
        if (this.containsNavigationText(text)) {
            console.log(`🚫 Navigation text detected in business check: "${text}"`);
            return true;
        }
        
        const businessPatterns = [
            /^Master\s*\/?\s*ATS$/i,
            /^ATS$/i,
            /^Master$/i,
            /^Wholesale$/i,
            /^Retail$/i,
            /^Available\s+as\s+of/i,
            /^More\s+Details$/i,
            /^\$\d+/,
            /^Price/i,
            /^Qty$/i,
            /^Quantity$/i,
            /^Size\s+Guide$/i,
            /^Fit\s+Guide$/i,
            /^Add\s+to\s+Cart$/i,
            /^Copy$/i,
            /^Paste$/i,
            /^CopyPaste$/i,
            /^\d+\s+Units?$/i,
            /^Total$/i,
            /^Elastic$/i,
            /View\s*Catalog/i,
            /Build\s*Order/i,
            /Enter\s*Quantities/i,
            /Select\s*All/i,
            /Clear\s*All/i
        ];
        
        const corruptionPatterns = [
            /checking\s+your\s+credentials/i,
            /checking\s+credentials/i,
            /loading/i,
            /please\s+wait/i,
            /authenticating/i,
            /redirecting/i,
            /processing/i,
            /error\s+occurred/i,
            /connection\s+timeout/i,
            /access\s+denied/i,
            /session\s+expired/i,
            /unauthorized/i
        ];
        
        const isBusinessText = businessPatterns.some(pattern => pattern.test(text.trim()));
        const isCorrupted = corruptionPatterns.some(pattern => pattern.test(text.trim()));
        
        if (isBusinessText) {
            console.log(`🚫 Filtered out business text: "${text}"`);
        }
        
        if (isCorrupted) {
            console.log(`🚫 CORRUPTION FILTER: Filtered out corrupted text: "${text}"`);
        }
        
        return isBusinessText || isCorrupted;
    }

    isHighQualityProductName(text) {
        if (!text || text.length < 3) return false;
        
        if (this.containsNavigationText(text)) {
            return false;
        }
        
        const strongIndicators = [
            /\b(MAGMAX|NITRO|SUEDE|RS-X|CALI|THUNDER|CELL|BOOST|IGNITE|HYBRID|DISC)\b/i,
            /\b(VELOCITY|DEVIATE|MAGNIFY|ELECTRIFY|SOFTRIDE|FLYER|RUNNER)\b/i,
            /\b(KNIT|CLASSIC|SPORT|TRAINING|RUNNING|LIFESTYLE|FUTURE|ULTRA|SPEEDCAT)\b/i,
            /\b(PUMA\s+\w+|\w+\s+NITRO|\w+\s+MAX)\b/i,
        ];
        
        const hasStrongIndicator = strongIndicators.some(pattern => pattern.test(text));
        
        if (hasStrongIndicator) {
            console.log(`✅ Strong product indicator found in: "${text}"`);
            return true;
        }
        
        const hasReasonableStructure = /^[A-Z][A-Za-z0-9\s\-_]+$/.test(text) && 
                                     text.split(/\s+/).length >= 2 &&
                                     text.split(/\s+/).length <= 8;
        
        return hasReasonableStructure;
    }

    calculateProductTitleQuality(text) {
        let quality = 0;
        
        if (this.containsNavigationText(text)) {
            quality -= 500;
        }
        
        if (/\b(MAGMAX|NITRO|VELOCITY|DEVIATE|SUEDE|RS-X|CALI|THUNDER|CELL|BOOST|IGNITE|HYBRID|DISC)\b/i.test(text)) {
            quality += 100;
        }
        
        if (/\b(KNIT|CLASSIC|SPORT|TRAINING|RUNNING|LIFESTYLE|FUTURE|ULTRA|SPEEDCAT)\b/i.test(text)) {
            quality += 50;
        }
        
        if (/^[A-Z]/.test(text) && text === text.toUpperCase()) {
            quality += 30;
        }
        
        if (text.length >= 10 && text.length <= 50) {
            quality += 20;
        }
        
        const wordCount = text.split(/\s+/).length;
        if (wordCount >= 2 && wordCount <= 5) {
            quality += 10;
        }
        
        return Math.max(0, quality);
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
        
        const lowerTitle = title.toLowerCase().trim();
        
        const exactUIMatches = [
            'add to cart', 'add', 'cart', 'remove', 'delete', 'edit', 'save', 'cancel',
            'submit', 'reset', 'login', 'logout', 'search', 'filter', 'sort', 'view',
            'next', 'previous', 'back', 'continue', 'loading', 'error', 'success',
            'warning', 'info', 'home', 'about', 'contact', 'help', 'menu', 'dropdown',
            'active', 'inactive', 'enabled', 'disabled'
        ];
        
        const corruptionPatterns = [
            'checking your credentials',
            'checking credentials', 
            'loading',
            'please wait',
            'authenticating',
            'redirecting',
            'processing',
            'error occurred',
            'connection timeout',
            'access denied',
            'session expired',
            'unauthorized',
            'welcome,',
            'shop now',
            'explore',
            'manage',
            'nowexplore',
            'shopnow',
            'danshop',
            'navigation',
            'menu',
            'header'
        ];
        
        const isCorrupted = corruptionPatterns.some(pattern => 
            lowerTitle.includes(pattern)
        );
        
        if (isCorrupted) {
            console.log(`🚫 CORRUPTION FILTER: Rejected corrupted product title: "${title}"`);
            return true;
        }
        
        if (exactUIMatches.includes(lowerTitle)) {
            console.log(`❌ Exact UI match rejected: "${title}"`);
            return true;
        }
        
        return false;
    }

    isValidProductName(title) {
        if (!title || title.length < 3) return false;
        
        if (this.containsNavigationText(title)) {
            return false;
        }
        
        const hasValidIndicator = this.validProductIndicators.some(pattern => 
            pattern.test(title)
        );
        
        if (hasValidIndicator) {
            console.log(`✅ Valid product indicator found in: "${title}"`);
            return true;
        }
        
        const hasReasonableStructure = /^[A-Z][A-Za-z0-9\s\-_]+$/.test(title) && 
                                     title.split(/\s+/).length >= 2 &&
                                     title.split(/\s+/).length <= 8;
        
        const hasProductPattern = /\b\w+[-_]\w+\b/.test(title) ||
                                 /\b\w+\s+\d+\b/.test(title) ||
                                 /\b[A-Z]{2,}\b/.test(title);
        
        const isValid = hasReasonableStructure && (hasValidIndicator || hasProductPattern);
        
        return isValid;
    }

    findPrice(container) {
        const text = container.textContent || '';
        
        const pricePatterns = [
            /\$(\d+(?:\.\d{2})?)/g,
            /(\d+\.\d{2})/g
        ];
        
        const prices = [];
        
        for (const pattern of pricePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const price = parseFloat(match[1]);
                if (price > 10 && price < 500) {
                    prices.push(price);
                }
            }
        }
        
        if (prices.length > 0) {
            const price = Math.min(...prices);
            console.log(`🎯 Found price: $${price}`);
            return price.toFixed(2);
        }
        
        return '120.00';
    }

    detectGender(container) {
        const text = container.textContent.toUpperCase();
        
        if (text.includes('WNS') || text.includes('WOMEN')) {
            return 'women';
        } else {
            // Everything else is men's
            return 'men';
        }
    }
    isValidProduct(title, styleId) {
        const titleValid = title && 
                          title !== 'Puma Product' && 
                          !this.isInvalidProductTitle(title) &&
                          this.isValidProductName(title);
        
        const styleValid = styleId && 
                          styleId !== 'UNKNOWN' && 
                          styleId.length === 6;
        
        const isValid = titleValid && styleValid;
        
        if (!isValid) {
            console.log(`❌ Product validation failed - Title: "${title}" (${titleValid}), Style: "${styleId}" (${styleValid})`);
        } else {
            console.log(`✅ Product validation passed - Title: "${title}", Style: "${styleId}"`);
        }
        
        return isValid;
    }
}
// ===== SKU GENERATOR =====
class EnhancedPumaSKUGenerator {
    generateSKU(variant) {
        const styleId = this.validateStyleId(variant.styleId);
        const colorCode = this.validateColorCode(variant.colorCode);
        const size = this.formatSize(variant.sizeUS || variant.size || 'OS');
        
        const sku = `${styleId}-${colorCode}-${size}`;
        
        console.log(`🏷️ Generated SKU: ${sku}`);
        return sku;
    }
    
    validateStyleId(styleId) {
        if (/^\d{6}$/.test(styleId)) {
            return styleId;
        }
        
        const match = styleId.match(/(\d{6})/);
        if (match) {
            return match[1];
        }
        
        return '000000';
    }
    
    validateColorCode(colorCode) {
        if (/^\d{2}$/.test(colorCode)) {
            return colorCode;
        }
        
        const match = colorCode.match(/(\d{2})/);
        if (match) {
            return match[1];
        }
        
        return '01';
    }
    
    formatSize(size) {
        const cleanSize = size.toString().replace(/\./g, '5');
        
        if (cleanSize.length > 4) {
            return cleanSize.substring(0, 4);
        }
        
        return cleanSize;
    }
}

// ===== MAIN EXTRACTOR CLASS =====
class ShopifyCompatibleCompletePumaExtractor {
    constructor() {
        this.structureDetector = new StructureBasedProductDetector();
        this.structureSizeExtractor = new StructureBasedSizeExtractor();
        this.skuGenerator = new EnhancedPumaSKUGenerator();
        this.shopifyConverter = new ShopifyCompatiblePumaConverter('Puma');
        
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
            vendor: 'PUMA',
            productType: 'Running Shoes',
            tags: 'Athletic, Running, PUMA, Performance, Training',
            published: 'TRUE',
            variantPrice: '150.00',
            compareAtPrice: '',
            inventoryTracker: 'shopify',
            inventoryPolicy: 'deny',
            requiresShipping: 'TRUE',
            taxable: 'TRUE',
            fulfillmentService: 'manual',
            productCategory: 'Apparel & Accessories > Shoes > Athletic Shoes > Running Shoes',
            condition: 'new',
            status: 'active',
            useMultiLocation: true,
            locationName: 'Main Location',
            exportType: 'inventory'
        };
        
        // Global references
        window.pumaExtractor = this;
        window.shopifyCompatiblePumaExtractor = this;
        window.enhancedPumaExtractor = this;
        
        this.init();
        this.setupDynamicContentWatcher();
    }

    init() {
        this.addButtons();
        this.loadSettings();
        this.setupBackgroundMessageListener();
        console.log('🛠️ ENHANCED PUMA EXTRACTOR: Initialized with gender-specific sizing');
    }

    // Button System
    addButtons() {
        console.log('Adding ENHANCED extractor buttons...');
        
        document.querySelectorAll('.puma-export-btn, .puma-start-watching-btn, .puma-stop-watching-btn, .puma-watch-status-btn, .puma-debug-btn, .puma-settings-btn, .puma-test-btn').forEach(btn => btn.remove());
        
        this.addStartWatchingButton();
        this.addStopWatchingButton();
        this.addWatchStatusButton();
        this.addSettingsButton();
        this.addDebugButton();
        this.addTestButton();
        
        console.log('All ENHANCED buttons added');
    }

    addStartWatchingButton() {
        const startBtn = document.createElement('button');
        startBtn.innerHTML = '🛠️ ENHANCED Capture';
        startBtn.className = 'puma-start-watching-btn';
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
        stopBtn.className = 'puma-stop-watching-btn';
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
        statusBtn.className = 'puma-watch-status-btn';
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
        settingsBtn.className = 'puma-settings-btn';
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
        debugBtn.className = 'puma-debug-btn';
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
        testBtn.className = 'puma-test-btn';
        testBtn.style.cssText = `
            position: fixed; top: 220px; right: 20px; z-index: 10000;
            background: #ff6b35; color: white; border: none; padding: 8px 16px;
            border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: bold;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        testBtn.onclick = () => this.testExtraction();
        document.body.appendChild(testBtn);
    }

    // Watching Logic
    startWatching() {
        if (this.isWatching) return;
        
        this.isWatching = true;
        this.watchingMetrics.watchStartTime = Date.now();
        this.collectedInventory.clear();
        this.processedContainers.clear();
        this.watchingMetrics = {
            ...this.watchingMetrics,
            validProductsKept: 0,
            invalidProductsFiltered: 0,
            duplicatesPrevented: 0,
            zeroInventoryProductsKept: 0,
            realSkusGenerated: 0,
            sizeExtractionFailures: 0,
            watchStartTime: Date.now()
        };
        
        const startBtn = document.querySelector('.puma-start-watching-btn');
        const stopBtn = document.querySelector('.puma-stop-watching-btn');
        const statusBtn = document.querySelector('.puma-watch-status-btn');
        
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (statusBtn) {
            statusBtn.innerHTML = 'Watching (0 valid)';
            statusBtn.style.background = '#28a745';
        }
        
        this.extractCurrentlyVisible();
        this.showSuccessMessage('🛠️ PUMA WATCHING STARTED\n\n✅ Gender-specific sizing (Women: 5-11, Men: 7-15)\n✅ Proper case colors\n✅ Taxable only if > $175\n✅ Rich product descriptions\n\nScroll to capture more products!');
    }

    stopWatchingAndExport() {
        if (!this.isWatching) return;
        
        this.isWatching = false;
        
        const startBtn = document.querySelector('.puma-start-watching-btn');
        const stopBtn = document.querySelector('.puma-stop-watching-btn');
        const statusBtn = document.querySelector('.puma-watch-status-btn');
        
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
        const statusBtn = document.querySelector('.puma-watch-status-btn');
        if (statusBtn && this.isWatching) {
            const elapsed = Math.floor((Date.now() - this.watchingMetrics.watchStartTime) / 1000);
            const valid = this.watchingMetrics.validProductsKept;
            statusBtn.innerHTML = `Watching (${valid} products, ${elapsed}s)`;
        }
    }

    // In extractCurrentlyVisible method:
async extractCurrentlyVisible() {
    console.log('🛠️ Starting extraction with gender detection...');
    
    const containers = this.structureDetector.findAllProductContainers();
    const processedProducts = new Map(); // Track by style-color-gender combo
    
    for (const container of containers) {
        try {
            const productData = this.structureDetector.extractProductData(container);
            
            // Create unique product identifier including gender
            const productId = `${productData.styleId}-${productData.colorCode}-${productData.genderCategory}`;
            
            // Skip if we've already processed this exact product
            if (processedProducts.has(productId)) {
                console.log(`♻️ Skipping duplicate product: ${productId}`);
                continue;
            }
            
            const sizeData = this.structureSizeExtractor.extractSizeQuantityData(container);
            
            // Remove duplicate sizes
            const uniqueSizes = new Map();
            sizeData.forEach(item => {
                const sizeKey = parseFloat(item.size).toFixed(1);
                if (!uniqueSizes.has(sizeKey) || item.quantity > uniqueSizes.get(sizeKey).quantity) {
                    uniqueSizes.set(sizeKey, {
                        size: sizeKey,
                        quantity: item.quantity,
                        method: item.method
                    });
                }
            });
            
            const cleanedSizeData = Array.from(uniqueSizes.values());
            
            // Log what we're processing
            const genderLabel = productData.genderCategory === 'women' ? "Women's" : 
                               productData.genderCategory === 'men' ? "Men's" : "Youth";
            
            console.log(`\n📦 Processing ${genderLabel} Product:`);
            console.log(`   Name: ${productData.title}`);
            console.log(`   Unique Sizes: ${cleanedSizeData.length}`);
            
            if (this.shouldKeepProduct(productData, cleanedSizeData)) {
                const inventory = cleanedSizeData.map(item => ({
                    productName: productData.title,
                    styleId: productData.styleId,
                    colorCode: productData.colorCode,
                    colorName: productData.colorName,
                    sizeUS: item.size,
                    quantity: item.quantity,
                    price: productData.price,
                    realSKU: this.skuGenerator.generateSKU({
                        styleId: productData.styleId,
                        colorCode: productData.colorCode,
                        sizeUS: item.size
                    }),
                    genderCategory: productData.genderCategory,
                    extractedAt: new Date().toISOString(),
                    url: window.location.href
                }));
                
                this.collectedInventory.set(productId, inventory);
                processedProducts.set(productId, true);
                this.watchingMetrics.validProductsKept++;
                
                console.log(`✅ KEPT: ${genderLabel} product with ${inventory.length} sizes`);
            }
            
        } catch (error) {
            console.error(`❌ Error processing container:`, error);
        }
    }
    
    return processedProducts.size;
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

    // Format Selection Modal
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
        
        modalContent.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #333;">🛠️ PUMA Export Results</h3>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0 0 10px 0; font-weight: bold;">Processing Results:</p>
                <p style="margin: 0; color: #666;">${allInventory.length} size-inventory records from ${this.collectedInventory.size} valid products</p>
                <p style="margin: 5px 0 0 0; color: #28a745; font-size: 12px;">✅ Gender-specific sizing applied</p>
                <p style="margin: 5px 0 0 0; color: #007bff; font-size: 12px;">✅ Proper case colors</p>
                <p style="margin: 5px 0 0 0; color: #17a2b8; font-size: 12px;">✅ Taxable only if > $175</p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #28a745; border-radius: 8px; background: #d4edda; cursor: pointer; margin-bottom: 10px;">
                    <input type="radio" name="exportFormat" value="inventory" checked style="margin-right: 10px;">
                    <div>
                        <strong style="color: #155724;">Inventory CSV</strong><br>
                        <small style="color: #155724;">Simple inventory format for quick stock updates</small>
                    </div>
                </label>
                
                <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #17a2b8; border-radius: 8px; background: #d1ecf1; cursor: pointer;">
                    <input type="radio" name="exportFormat" value="product" style="margin-right: 10px;">
                    <div>
                        <strong style="color: #0c5460;">Product CSV</strong><br>
                        <small style="color: #0c5460;">Full product data with rich descriptions & pricing</small>
                    </div>
                </label>
            </div>
            
            <div style="text-align: center;">
                <button id="exportSelected" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; margin-right: 10px; font-weight: bold;">
                    Export Data
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
            console.log(`🛠️ Starting ${format} export...`);
            const cleanedData = this.validateAndCleanExportData(allInventory, format);
            
            let csv, filename;
            
            if (format === 'inventory') {
                csv = this.shopifyConverter.convertToInventoryCSV(cleanedData, this.shopifySettings);
                filename = `puma-inventory-${Date.now()}.csv`;
            } else {
                csv = this.shopifyConverter.convertToProductCSV(cleanedData, this.shopifySettings);
                filename = `puma-products-${Date.now()}.csv`;
            }
            
            console.log(`🛠️ Generated CSV with ${csv.split('\n').length} lines`);
            this.downloadCSV(csv, filename);
            
            this.showSuccessMessage(`🛠️ PUMA ${format.toUpperCase()} EXPORT COMPLETE\n\nExported ${cleanedData.length} records\n✅ Gender-specific sizing\n✅ Proper case colors\n✅ Conditional taxable (>$175)`);
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Export error: ' + error.message);
        }
    }

    validateAndCleanExportData(inventoryData, format) {
        console.log('🧹 Validating export data...');
        
        const cleanData = inventoryData.filter(item => {
            if (!item.sizeUS || !item.realSKU) {
                console.log(`🚫 Removed item with missing size/SKU`);
                return false;
            }
            
            return true;
        });
        
        console.log(`🧹 Cleaning: ${inventoryData.length} → ${cleanData.length} items`);
        return cleanData;
    }

    // Helper Methods
    getContainerIdentifier(container, productData) {
        // Create a more unique identifier using multiple factors
        const rect = container.getBoundingClientRect();
        const inputCount = container.querySelectorAll('input[type="number"]').length;
        const textContent = container.textContent.substring(0, 100);  // First 100 chars
        const textHash = this.hashCode(textContent);
        
        return `${productData.styleId}-${productData.colorCode}-${productData.genderCategory}-${rect.top.toFixed(0)}-${inputCount}-${textHash}`;
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

    // UI Methods
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
        link.download = filename || `puma-export-${Date.now()}.csv`;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    // Settings and Debug Methods
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
            width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.3); max-height: 80vh; overflow-y: auto;
        `;
        
        modalContent.innerHTML = `
            <h3 style="margin-bottom: 20px; color: #333;">🛠️ Settings</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Vendor:</label>
                <input type="text" id="vendor" value="${this.shopifySettings.vendor}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
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
                <small>
                ✅ Gender-specific sizing (Women: 5-11, Men: 7-15)<br>
                ✅ Proper case colors<br>
                ✅ Taxable only if price > $175<br>
                ✅ Rich product descriptions<br>
                ✅ Model-specific pricing<br>
                </small>
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
            this.shopifySettings.locationName = document.getElementById('locationName').value;
            this.minSizesRequired = parseInt(document.getElementById('minSizes').value);
            
            const settings = {
                ...this.shopifySettings,
                minSizesRequired: this.minSizesRequired,
                version: 'enhanced-gender-aware'
            };
            
            localStorage.setItem('enhancedPumaSettings', JSON.stringify(settings));
            document.body.removeChild(modal);
            this.showSuccessMessage('Settings saved!');
        };
        
        document.getElementById('closeSettingsModal').onclick = () => {
            document.body.removeChild(modal);
        };
    }

    loadSettings() {
        const saved = localStorage.getItem('enhancedPumaSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            this.shopifySettings = { ...this.shopifySettings, ...settings };
            this.minSizesRequired = settings.minSizesRequired || this.minSizesRequired;
        }
    }

    showDebugInfo() {
        const containers = this.structureDetector.findAllProductContainers();
        const allInventory = Array.from(this.collectedInventory.values()).flat();
        
        let debugInfo = '=== PUMA SCRAPER DEBUG ===\n';
        debugInfo += `URL: ${window.location.href}\n`;
        debugInfo += `Product Containers: ${containers.length}\n`;
        debugInfo += `Collected Products: ${this.collectedInventory.size}\n`;
        debugInfo += `Total Records: ${allInventory.length}\n`;
        debugInfo += `\nFEATURES:\n`;
        debugInfo += `✅ Gender-specific sizing\n`;
        debugInfo += `✅ Proper case colors\n`;
        debugInfo += `✅ Conditional taxable (>$175)\n`;
        
        console.log(debugInfo);
        alert(debugInfo);
    }

    testExtraction() {
        console.log('=== TESTING EXTRACTION ===');
        
        const containers = this.structureDetector.findAllProductContainers();
        console.log(`Found ${containers.length} product containers`);
        
        if (containers.length > 0) {
            const testContainer = containers[0];
            const productData = this.structureDetector.extractProductData(testContainer);
            const sizeData = this.structureSizeExtractor.extractSizeQuantityData(testContainer);
            
            console.log('Product data:', productData);
            console.log('Size extraction results:', sizeData);
            console.log('Gender:', productData.genderCategory);
            console.log('Size range:', productData.sizeRange);
            console.log('Taxable:', parseFloat(productData.price) > 175);
        }
        
        return { testComplete: true };
    }

    // Dynamic Content Watcher
    setupDynamicContentWatcher() {
        const observer = new MutationObserver((mutations) => {
            if (!this.isWatching) return;
            
            let shouldReextract = false;
            
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length > 0) {
                    const addedNodes = Array.from(mutation.addedNodes);
                    const hasNewProducts = addedNodes.some(node => 
                        node.nodeType === 1 && 
                        (node.querySelector && node.querySelector('input[type="number"]') ||
                         /\b\d{6}\b/.test(node.textContent || ''))
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
            this.updateWatchingStatus();
        }
    }

    // Background Message Listener
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
                this.downloadCSV(csv, `puma-inventory-${Date.now()}.csv`);
                
                return {
                    success: true,
                    count: cleanInventory.length,
                    validProducts: count
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
}

// ===== INITIALIZATION =====
function initializeEnhancedCompletePumaExtractor() {
    console.log('🛠️ Initializing Enhanced Puma Extractor...');
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => new ShopifyCompatibleCompletePumaExtractor(), 1000);
        });
    } else {
        setTimeout(() => new ShopifyCompatibleCompletePumaExtractor(), 1000);
    }
}

initializeEnhancedCompletePumaExtractor();

// ===== MESSAGE LISTENER =====
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'extractInventory') {
            try {
                if (window.enhancedPumaExtractor || window.pumaExtractor) {
                    const extractor = window.enhancedPumaExtractor || window.pumaExtractor;
                    extractor.extractAndDownloadShopify().then(result => {
                        sendResponse(result);
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                } else {
                    sendResponse({ success: false, error: 'Extractor not initialized' });
                }
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
    });
}

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║     🛠️ ENHANCED PUMA SCRAPER INITIALIZED              ║');
console.log('╠══════════════════════════════════════════════════════╣');
console.log('║  ✅ Gender-specific sizing                           ║');
console.log('║     • Women (WNS): 5-11                             ║');
console.log('║     • Men: 7-15                                     ║');
console.log('║     • Youth: 3-7                                    ║');
console.log('║  ✅ Proper case colors (not ALL CAPS)               ║');
console.log('║  ✅ Taxable only if price > $175                    ║');
console.log('║  ✅ Rich product descriptions                       ║');
console.log('║  ✅ Model-specific pricing                          ║');
console.log('║                                                      ║');
console.log('║  📋 Use buttons to start capturing                   ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');