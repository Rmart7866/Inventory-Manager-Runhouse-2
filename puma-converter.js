// Puma Converter Logic
const PumaConverter = {
    inventoryData: [],
    
    productInfo: {
        'Velocity Nitro 4': {
            description: 'Experience premium cushioning and propulsive energy return with the Velocity Nitro 4. Built for daily training and speed work, this versatile running shoe features NITRO foam technology that delivers superior responsiveness and comfort mile after mile. The engineered mesh upper provides breathability and support, while the PUMAGRIP rubber outsole ensures reliable traction on any surface. Perfect for runners seeking a lightweight, cushioned ride for everything from easy runs to tempo workouts.',
            specs: { 
                stack: '32/24mm', 
                drop: '8mm', 
                weight: '9.2 oz',
                technology: 'NITRO foam, PUMAGRIP outsole, PROFOAMLITE',
                bestFor: 'Daily training, tempo runs, long runs'
            }
        },
        'Deviate Nitro 3': {
            description: 'The Deviate Nitro 3 is engineered for runners who demand maximum energy return. Featuring a full-length carbon fiber PWRPLATE and dual-density NITRO Elite foam, this high-performance trainer delivers explosive propulsion with every stride. The innovative asymmetric heel counter provides enhanced stability, while the engineered mesh upper offers targeted support and breathability. Designed to help you push your limits in training and racing, the Deviate Nitro 3 combines speed-focused technology with all-day comfort.',
            specs: { 
                stack: '39/31mm', 
                drop: '8mm', 
                weight: '10.4 oz',
                technology: 'Carbon fiber PWRPLATE, NITRO Elite foam, PUMAGRIP',
                bestFor: 'Tempo runs, interval training, races from 5K to marathon'
            }
        },
        'Deviate Nitro 4': {
            description: 'Push your limits with the Deviate Nitro 4, PUMA\'s latest evolution in carbon-plated racing excellence. This premium performance trainer features an innovative full-length carbon fiber PWRPLATE combined with dual-density NITRO Elite foam for explosive energy return and unmatched propulsion. The updated engineered mesh upper delivers exceptional breathability and a secure, race-ready fit, while the enhanced rocker geometry promotes smooth, efficient transitions. Built for serious runners who demand elite-level performance in training and racing.',
            specs: { 
                stack: '39/31mm', 
                drop: '8mm', 
                weight: '10.2 oz',
                technology: 'Carbon fiber PWRPLATE, NITRO Elite foam, PUMAGRIP outsole',
                bestFor: 'Tempo runs, interval training, races from 5K to marathon'
            }
        },
        'Magmax': {
            description: 'Maximum cushioning meets innovative design in the all-new Magmax. Engineered with PUMA\'s thickest stack height to date, this ultra-cushioned trainer features NITROFOAM™ technology for exceptional shock absorption and energy return. The wide platform base provides inherent stability, while the engineered mesh upper delivers a secure, comfortable fit. Whether you\'re logging easy miles or need all-day comfort, the Magmax offers plush cushioning without sacrificing responsiveness. Perfect for runners seeking maximum protection and comfort on their daily runs.',
            specs: { 
                stack: '46/40mm', 
                drop: '6mm', 
                weight: '11.8 oz',
                technology: 'NITROFOAM™ cushioning, Wide platform geometry, PUMAGRIP outsole',
                bestFor: 'Easy runs, recovery runs, all-day comfort'
            }
        },
        'MagMax Nitro 2': {
            description: 'Dominate your runs with the PUMA MagMax Nitro 2, the ultimate max-cushioned training shoe engineered for runners who demand supreme comfort and explosive energy return. This innovative running shoe combines PUMA\'s most advanced cushioning technology with responsive propulsion to help you push harder and run longer. The MagMax Nitro 2 features NITRO Elite foam in the midsole, PUMA\'s most responsive cushioning compound. This nitrogen-infused foam delivers exceptional energy return with every stride while maintaining incredible lightweight comfort.',
            specs: { 
                stack: '40/32mm', 
                drop: '8mm', 
                weight: '10.6 oz (men) / 8.8 oz (women)',
                technology: 'NITRO Elite foam, Rocker geometry, PUMAGRIP outsole',
                bestFor: 'Daily training, long runs, tempo runs'
            }
        },
        'Magnify Nitro 3': {
            description: 'Elevate your training with the PUMA Magnify Nitro 3, a versatile performance running shoe that perfectly balances cushioning, responsiveness, and durability for runners at every level. This third generation trainer builds on PUMA\'s proven Magnify platform with enhanced comfort features and updated styling that performs as good as it looks. At the heart of the Magnify Nitro 3 is PUMA\'s innovative NITRO foam technology in the midsole, delivering exceptional energy return and plush comfort without adding unnecessary weight.',
            specs: { 
                stack: '34/26mm', 
                drop: '8mm', 
                weight: '9.5 oz (men) / 7.8 oz (women)',
                technology: 'NITRO foam, PUMAGRIP outsole, Engineered mesh upper',
                bestFor: 'Daily training, easy runs, recovery runs, all-around versatility'
            }
        }
    },
    
    allowedProducts: ['Velocity Nitro 4', 'Deviate Nitro 3', 'Deviate Nitro 4', 'MagMax Nitro 2', 'Magmax', 'Magnify Nitro 3'],
    
    isAllowedProduct(productName) {
        if (!productName) return false;
        
        const nameLower = productName.toLowerCase();
        
        // Check for MagMax Nitro 2 first
        if (nameLower.includes('magmax') && nameLower.includes('nitro') && nameLower.includes('2')) {
            return true;
        }
        
        // Check for plain Magmax (without Nitro 2)
        if (nameLower.includes('magmax') && !nameLower.includes('nitro 2')) {
            return true;
        }
        
        // Check for Magnify Nitro 3
        if (nameLower.includes('magnify') && nameLower.includes('nitro') && nameLower.includes('3')) {
            return true;
        }
        
        // Check for Deviate Nitro 4 BEFORE Deviate Nitro 3
        if (nameLower.includes('deviate') && nameLower.includes('nitro') && nameLower.includes('4')) {
            return true;
        }
        
        // Check for Deviate Nitro 3
        if (nameLower.includes('deviate') && nameLower.includes('nitro') && nameLower.includes('3')) {
            return true;
        }
        
        // Check Velocity Nitro 4
        if (nameLower.includes('velocity') && nameLower.includes('nitro') && nameLower.includes('4')) {
            return true;
        }
        
        return false;
    },
    
    getMatchingProduct(productName) {
        if (!productName) return null;
        
        const nameLower = productName.toLowerCase();
        
        // Check for MagMax Nitro 2 FIRST (before plain Magmax)
        if (nameLower.includes('magmax') && nameLower.includes('nitro') && nameLower.includes('2')) {
            return 'MagMax Nitro 2';
        }
        
        // Then check for plain Magmax (without Nitro 2)
        if (nameLower.includes('magmax') && !nameLower.includes('nitro 2')) {
            return 'Magmax';
        }
        
        // Check for Magnify Nitro 3
        if (nameLower.includes('magnify') && nameLower.includes('nitro') && nameLower.includes('3')) {
            return 'Magnify Nitro 3';
        }
        
        // Check for Deviate Nitro 4 BEFORE Deviate Nitro 3
        if (nameLower.includes('deviate') && nameLower.includes('nitro') && nameLower.includes('4')) {
            return 'Deviate Nitro 4';
        }
        
        // Check for Deviate Nitro 3
        if (nameLower.includes('deviate') && nameLower.includes('nitro') && nameLower.includes('3')) {
            return 'Deviate Nitro 3';
        }
        
        // Check Velocity Nitro 4
        if (nameLower.includes('velocity') && nameLower.includes('nitro') && nameLower.includes('4')) {
            return 'Velocity Nitro 4';
        }
        
        return null;
    },
    
    formatGender(gender) {
        if (!gender) return '';
        const genderStr = gender.toString().trim().toUpperCase();
        if (genderStr === 'MENS' || genderStr === 'MEN' || genderStr === 'M') return 'Mens';
        if (genderStr === 'WOMENS' || genderStr === 'WOMEN' || genderStr === 'W') return 'Womens';
        if (genderStr === 'YOUTH' || genderStr === 'KIDS' || genderStr === 'Y' || genderStr === 'K') return 'Youth';
        if (genderStr === 'UNISEX' || genderStr === 'U') return 'Unisex';
        return genderStr;
    },
    
    async convert(file) {
        try {
            let data = [];
            let headers = [];
            
            if (file.name.toLowerCase().endsWith('.xlsx') || 
                file.name.toLowerCase().endsWith('.xls')) {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                headers = data[0];
                data = data.slice(1);
            } else {
                const text = await file.text();
                const parseResult = Papa.parse(text, {
                    delimiter: ',',
                    header: true,
                    skipEmptyLines: true,
                    dynamicTyping: true
                });
                
                // Check if it's tab-delimited
                if (parseResult.data.length === 0 || Object.keys(parseResult.data[0]).length === 1) {
                    const tabParseResult = Papa.parse(text, {
                        delimiter: '\t',
                        header: true,
                        skipEmptyLines: true,
                        dynamicTyping: true
                    });
                    if (tabParseResult.data.length > 0) {
                        headers = tabParseResult.meta.fields;
                        data = tabParseResult.data;
                    }
                } else {
                    headers = parseResult.meta.fields;
                    data = parseResult.data;
                }
            }
            
            // Determine column indices
            let styleNameIdx = headers.findIndex(h => h && h.toLowerCase().includes('style name'));
            let styleNumberIdx = headers.findIndex(h => h && h.toLowerCase().includes('style number'));
            let colorNameIdx = headers.findIndex(h => h && h.toLowerCase().includes('color name'));
            let colorCodeIdx = headers.findIndex(h => h && h.toLowerCase().includes('color code'));
            let sizeIdx = headers.findIndex(h => h && h.toLowerCase() === 'size');
            let skuIdx = headers.findIndex(h => h && h.toLowerCase().includes('sku'));
            let upcIdx = headers.findIndex(h => h && h.toLowerCase().includes('upc'));
            let quantityIdx = headers.findIndex(h => h && h.toLowerCase().includes('quantity available'));
            let wholesaleIdx = headers.findIndex(h => h && h.toLowerCase().includes('wholesale'));
            let retailIdx = headers.findIndex(h => h && h.toLowerCase().includes('retail price'));
            let genderIdx = headers.findIndex(h => h && h.toLowerCase().includes('gender'));
            let labelIdx = headers.findIndex(h => h && h.toLowerCase().includes('label'));
            
            // If headers not found, assume standard positions
            if (styleNameIdx === -1) styleNameIdx = 0;
            if (colorNameIdx === -1) colorNameIdx = 2;
            if (sizeIdx === -1) sizeIdx = 5;
            
            // Filter for allowed products
            const filteredProducts = data.filter(row => {
                if (!row) return false;
                
                let styleName;
                if (Array.isArray(row)) {
                    styleName = row[styleNameIdx];
                } else {
                    styleName = row['Style Name'] || row['style_name'] || Object.values(row)[0];
                }
                
                return this.isAllowedProduct(styleName);
            });
            
            const shopifyInventory = [];
            const processedVariants = new Map();
            
            for (let i = 0; i < filteredProducts.length; i++) {
                const row = filteredProducts[i];
                let product;
                
                // Handle both array and object formats
                if (Array.isArray(row)) {
                    product = {
                        styleName: row[styleNameIdx],
                        styleNumber: row[styleNumberIdx],
                        colorName: row[colorNameIdx],
                        colorCode: row[colorCodeIdx],
                        size: row[sizeIdx],
                        sku: row[skuIdx],
                        upc: row[upcIdx],
                        quantity: row[quantityIdx],
                        wholesale: row[wholesaleIdx],
                        retail: row[retailIdx],
                        gender: row[genderIdx],
                        label: row[labelIdx]
                    };
                } else {
                    product = {
                        styleName: row['Style Name'] || row['style_name'],
                        styleNumber: row['Style Number'] || row['style_number'],
                        colorName: row['Color Name'] || row['color_name'],
                        colorCode: row['Color Code'] || row['color_code'],
                        size: row['Size'] || row['size'],
                        sku: row['SKU'] || row['sku'],
                        upc: row['UPC/EAN'] || row['upc'],
                        quantity: row['Quantity Available'] || row['quantity_available'],
                        wholesale: row['Wholesale Price'] || row['wholesale_price'],
                        retail: row['Retail Price'] || row['retail_price'],
                        gender: row['Gender'] || row['gender'],
                        label: row['Label'] || row['label']
                    };
                }
                
                const matchingProduct = this.getMatchingProduct(product.styleName);
                if (!matchingProduct) continue;
                
                const formattedGender = this.formatGender(product.gender);
                
                let size = product.size ? product.size.toString().trim() : '';
                
                const variantKey = `${formattedGender}-${matchingProduct}-${product.colorName}-${size}`;
                
                let actualQuantity = 0;
                if (typeof product.quantity === 'string') {
                    actualQuantity = parseInt(product.quantity.replace(/[^0-9]/g, '')) || 0;
                } else if (typeof product.quantity === 'number') {
                    actualQuantity = product.quantity;
                }
                
                if (processedVariants.has(variantKey)) {
                    const existing = processedVariants.get(variantKey);
                    existing.quantity += actualQuantity;
                    continue;
                }
                
                processedVariants.set(variantKey, {
                    ...product,
                    formattedGender,
                    matchingProduct,
                    quantity: actualQuantity
                });
            }
            
            const sortedVariants = Array.from(processedVariants.entries()).sort((a, b) => {
                const [keyA, dataA] = a;
                const [keyB, dataB] = b;
                
                if (dataA.matchingProduct !== dataB.matchingProduct) {
                    return dataA.matchingProduct.localeCompare(dataB.matchingProduct);
                }
                
                if (dataA.formattedGender !== dataB.formattedGender) {
                    if (dataA.formattedGender === 'Mens') return -1;
                    if (dataB.formattedGender === 'Mens') return 1;
                    return dataA.formattedGender.localeCompare(dataB.formattedGender);
                }
                
                if (dataA.colorName !== dataB.colorName) {
                    return dataA.colorName.localeCompare(dataB.colorName);
                }
                
                const sizeA = parseFloat(dataA.size) || 0;
                const sizeB = parseFloat(dataB.size) || 0;
                return sizeA - sizeB;
            });
            
            for (const [variantKey, variantData] of sortedVariants) {
                const productTitle = `${variantData.formattedGender} Puma ${variantData.matchingProduct} - ${variantData.colorName}`;
                
                const baseHandle = `${variantData.formattedGender}-${variantData.matchingProduct}-${variantData.colorName}`
                    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                
                shopifyInventory.push({
                    Handle: baseHandle,
                    Title: productTitle,
                    'Option1 Name': 'Size',
                    'Option1 Value': variantData.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    SKU: variantData.sku || `${variantData.styleNumber}-${variantData.colorCode}-${variantData.size}`,
                    Barcode: variantData.upc || '',
                    'HS Code': '',
                    COO: '',
                    Location: 'Needham',
                    'Bin name': '',
                    'Incoming (not editable)': '',
                    'Unavailable (not editable)': '',
                    'Committed (not editable)': '',
                    'Available (not editable)': '',
                    'On hand (current)': '',
                    'On hand (new)': variantData.quantity,
                    // Additional columns for product creation compatibility
                    'Variant Inventory Tracker': 'shopify',
                    'Variant Inventory Policy': 'deny',
                    'Variant Inventory Qty': variantData.quantity
                });
            }
            
            this.inventoryData = shopifyInventory;
            return shopifyInventory;
            
        } catch (error) {
            console.error('Puma conversion error:', error);
            throw error;
        }
    },
    
    generateInventoryCSV() {
        const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                       '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                       '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                       '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"',
                       '"Variant Inventory Tracker"', '"Variant Inventory Policy"', '"Variant Inventory Qty"'];
        
        const csvRows = [inventoryHeaders.join(',')];
        
        this.inventoryData.forEach(row => {
            const csvRow = [
                row.Handle,
                `"${row.Title}"`,
                row['Option1 Name'],
                row['Option1 Value'],
                row['Option2 Name'] || '',
                row['Option2 Value'] || '',
                row['Option3 Name'] || '',
                row['Option3 Value'] || '',
                row.SKU,
                row.Barcode || '',
                '', '',
                row.Location,
                '', '', '', '', '', '',
                row['On hand (new)'],
                row['Variant Inventory Tracker'] || 'shopify',
                row['Variant Inventory Policy'] || 'deny',
                row['Variant Inventory Qty'] || row['On hand (new)']
            ];
            csvRows.push(csvRow.join(','));
        });
        
        return csvRows.join('\n');
    }
};
