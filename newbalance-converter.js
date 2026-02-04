// New Balance Converter Logic - FIXED
const NewBalanceConverter = {
    inventoryData: [],
    
    productInfo: {
        'Rebel V5': {
            description: 'Built to propel you forward with every step, the FuelCell Rebel v5 features high-rebound FuelCell foam that delivers an energetic ride. This lightweight daily trainer combines speed and comfort with its responsive cushioning and sleek engineered mesh upper. The redesigned geometry provides a smooth transition while the wider platform offers improved stability. Perfect for tempo runs, speed work, or any run where you want to pick up the pace.',
            specs: { 
                stack: '30/24mm', 
                drop: '6mm', 
                weight: '7.8 oz',
                technology: 'FuelCell foam midsole, Engineered mesh upper, NDurance rubber outsole',
                bestFor: 'Tempo runs, daily training, speed workouts'
            }
        },
        '880v15': {
            description: 'The Fresh Foam X 880v15 continues the legacy of consistent, reliable comfort. Featuring the latest Fresh Foam X cushioning for a soft, smooth ride, this neutral daily trainer is built for logging miles day after day. The engineered mesh upper provides breathability and a secure fit, while the blown rubber outsole delivers durability where you need it most. A versatile workhorse that\'s ready for any run, from easy miles to long runs.',
            specs: { 
                stack: '35/27mm', 
                drop: '8mm', 
                weight: '10.1 oz',
                technology: 'Fresh Foam X midsole, Engineered mesh upper, Blown rubber outsole',
                bestFor: 'Daily training, long runs, easy miles'
            }
        },
        '860v14': {
            description: 'Experience stability without sacrifice in the 860v14. Engineered with dual-density Fresh Foam X cushioning and a medial post for reliable support, this stability trainer delivers a smooth, controlled ride. The structured engineered mesh upper provides targeted support while maintaining breathability. Perfect for runners who need moderate stability features without feeling restricted, offering the ideal balance of cushioning and guidance.',
            specs: { 
                stack: '34/26mm', 
                drop: '8mm', 
                weight: '10.4 oz',
                technology: 'Dual-density Fresh Foam X, Medial post support, Structured mesh upper',
                bestFor: 'Daily training for overpronators, long runs with stability'
            }
        },
        '1080v14': {
            description: 'Maximum cushioning meets cutting-edge comfort in the Fresh Foam X 1080v14. Our most cushioned daily trainer features the pinnacle of Fresh Foam X technology, delivering luxurious softness without sacrificing responsiveness. The Hypoknit upper adapts to your foot for a personalized fit, while the rocker profile promotes smooth transitions. Built for runners who want premium cushioning for daily miles, recovery runs, or all-day comfort.',
            specs: { 
                stack: '38/32mm', 
                drop: '6mm', 
                weight: '9.9 oz',
                technology: 'Fresh Foam X Plus cushioning, Hypoknit upper, Rocker geometry',
                bestFor: 'Long runs, recovery runs, maximum cushioning needs'
            }
        }
    },
    
    allowedProducts: ['Rebel V5', '880v15', '860v14', '1080v14'],
    
    isAllowedProduct(productName) {
        try {
            if (!productName && productName !== 0) return false;
            
            let nameStr = '';
            if (typeof productName === 'string') {
                nameStr = productName;
            } else if (productName !== null && productName !== undefined) {
                nameStr = String(productName);
            }
            
            if (!nameStr) return false;
            
            const nameLower = nameStr.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            return this.allowedProducts.some(allowed => {
                const allowedLower = allowed.toLowerCase().replace(/[^a-z0-9]/g, '');
                return nameLower.includes(allowedLower) || 
                       (allowed === 'Rebel V5' && (nameLower.includes('rebel') && (nameLower.includes('v5') || nameLower.includes('5')))) ||
                       (allowed === '880v15' && (nameLower.includes('880') && (nameLower.includes('v15') || nameLower.includes('15')))) ||
                       (allowed === '860v14' && (nameLower.includes('860') && (nameLower.includes('v14') || nameLower.includes('14')))) ||
                       (allowed === '1080v14' && (nameLower.includes('1080') && (nameLower.includes('v14') || nameLower.includes('14'))));
            });
        } catch (e) {
            console.error('Error in isAllowedProduct:', e);
            return false;
        }
    },
    
    getMatchingProduct(productName) {
        try {
            if (!productName && productName !== 0) return null;
            
            let nameStr = '';
            if (typeof productName === 'string') {
                nameStr = productName;
            } else if (productName !== null && productName !== undefined) {
                nameStr = String(productName);
            }
            
            if (!nameStr) return null;
            
            const nameLower = nameStr.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            for (const allowed of this.allowedProducts) {
                const allowedLower = allowed.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (nameLower.includes(allowedLower) || 
                    (allowed === 'Rebel V5' && (nameLower.includes('rebel') && (nameLower.includes('v5') || nameLower.includes('5')))) ||
                    (allowed === '880v15' && (nameLower.includes('880') && (nameLower.includes('v15') || nameLower.includes('15')))) ||
                    (allowed === '860v14' && (nameLower.includes('860') && (nameLower.includes('v14') || nameLower.includes('14')))) ||
                    (allowed === '1080v14' && (nameLower.includes('1080') && (nameLower.includes('v14') || nameLower.includes('14'))))) {
                    return allowed;
                }
            }
            return null;
        } catch (e) {
            console.error('Error in getMatchingProduct:', e);
            return null;
        }
    },
    
    formatGender(gender) {
        if (!gender) return 'Unisex';
        const genderStr = gender.toString().trim().toLowerCase();
        // FIXED: Use proper grammar with apostrophes
        if (genderStr === 'mens' || genderStr === 'men' || genderStr === 'male' || genderStr === 'm') return "Men's";
        if (genderStr === 'womens' || genderStr === 'women' || genderStr === 'female' || genderStr === 'w' || genderStr === 'f') return "Women's";
        if (genderStr === 'youth' || genderStr === 'kids' || genderStr === 'children' || genderStr === 'y' || genderStr === 'k') return 'Youth';
        if (genderStr === 'unisex' || genderStr === 'u') return 'Unisex';
        return 'Unisex';
    },
    
    formatWidth(altSize, gender) {
        if (!altSize) return 'Standard';
        const widthStr = altSize.toString().trim().toUpperCase();
        const formattedGender = this.formatGender(gender);
        
        // Women's width codes are different from men's
        if (formattedGender === "Women's") {
            // Women's: 2A=Narrow, B=Standard, D=Wide, 2E=Extra Wide
            if (widthStr === '2A' || widthStr === 'AA' || widthStr === 'NARROW') return 'Narrow';
            if (widthStr === 'B' || widthStr === 'STANDARD' || widthStr === 'MEDIUM') return 'Standard';
            if (widthStr === 'D' || widthStr === 'WIDE') return 'Wide';
            if (widthStr === '2E' || widthStr === 'EE' || widthStr === 'EXTRA WIDE') return 'Extra Wide';
        } else {
            // Men's/Unisex/Youth: B=Narrow, D=Standard, 2E=Wide, 4E=Extra Wide
            if (widthStr === 'B' || widthStr === 'NARROW') return 'Narrow';
            if (widthStr === 'D' || widthStr === 'M' || widthStr === 'STANDARD' || widthStr === 'MEDIUM') return 'Standard';
            if (widthStr === '2E' || widthStr === 'EE' || widthStr === 'WIDE') return 'Wide';
            if (widthStr === '4E' || widthStr === 'EEEE' || widthStr === 'EXTRA WIDE') return 'Extra Wide';
        }
        
        return 'Standard';
    },
    
    formatSize(sizeValue) {
        if (!sizeValue && sizeValue !== 0) return 'Unknown';
        
        let size = String(sizeValue).trim();
        
        // Handle special cases for half sizes
        if (size === '045' || size === '45') return '4.5';
        if (size === '055' || size === '55') return '5.5';
        if (size === '065' || size === '65') return '6.5';
        if (size === '075' || size === '75') return '7.5';
        if (size === '085' || size === '85') return '8.5';
        if (size === '095' || size === '95') return '9.5';
        if (size === '105' || size === '105') return '10.5';
        if (size === '115') return '11.5';
        if (size === '125') return '12.5';
        if (size === '135') return '13.5';
        
        // Handle decimal format
        if (size.includes('.')) return size;
        
        // If it's a whole number, add .0
        const numSize = parseFloat(size);
        if (!isNaN(numSize) && numSize > 0) {
            return numSize.toFixed(1);
        }
        
        return size;
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
            let altSizeIdx = headers.findIndex(h => h && h.toLowerCase().includes('alt size'));
            let skuIdx = headers.findIndex(h => h && h.toLowerCase().includes('sku'));
            let upcIdx = headers.findIndex(h => h && h.toLowerCase().includes('upc'));
            let quantityIdx = headers.findIndex(h => h && h.toLowerCase().includes('quantity available'));
            let wholesaleIdx = headers.findIndex(h => h && h.toLowerCase().includes('wholesale'));
            let retailIdx = headers.findIndex(h => h && h.toLowerCase().includes('retail price'));
            let genderIdx = headers.findIndex(h => h && h.toLowerCase().includes('gender'));
            
            if (styleNameIdx === -1) styleNameIdx = 0;
            if (colorNameIdx === -1) colorNameIdx = 2;
            if (sizeIdx === -1) sizeIdx = 5;
            if (altSizeIdx === -1) altSizeIdx = 6;
            
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
                
                if (Array.isArray(row)) {
                    product = {
                        styleName: row[styleNameIdx],
                        styleNumber: row[styleNumberIdx],
                        colorName: row[colorNameIdx],
                        colorCode: row[colorCodeIdx],
                        size: row[sizeIdx],
                        altSize: row[altSizeIdx],
                        sku: row[skuIdx],
                        upc: row[upcIdx],
                        quantity: row[quantityIdx],
                        wholesale: row[wholesaleIdx],
                        retail: row[retailIdx],
                        gender: row[genderIdx]
                    };
                } else {
                    product = {
                        styleName: row['Style Name'] || row['style_name'],
                        styleNumber: row['Style Number'] || row['style_number'],
                        colorName: row['Color Name'] || row['color_name'],
                        colorCode: row['Color Code'] || row['color_code'],
                        size: row['Size'] || row['size'],
                        altSize: row['Alt Size'] || row['alt_size'],
                        sku: row['SKU'] || row['sku'],
                        upc: row['UPC/EAN'] || row['upc'],
                        quantity: row['Quantity Available'] || row['quantity_available'],
                        wholesale: row['Wholesale Price'] || row['wholesale_price'],
                        retail: row['Retail Price'] || row['retail_price'],
                        gender: row['Gender'] || row['gender']
                    };
                }
                
                const matchingProduct = this.getMatchingProduct(product.styleName);
                if (!matchingProduct) continue;
                
                const formattedGender = this.formatGender(product.gender);
                const formattedWidth = this.formatWidth(product.altSize, product.gender);
                const formattedSize = this.formatSize(product.size);
                
                const variantKey = `${formattedGender}-${matchingProduct}-${product.colorName}-${formattedSize}-${formattedWidth}`;
                
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
                    formattedWidth,
                    formattedSize,
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
                    if (dataA.formattedGender === "Men's") return -1;
                    if (dataB.formattedGender === "Men's") return 1;
                    return dataA.formattedGender.localeCompare(dataB.formattedGender);
                }
                
                if (dataA.colorName !== dataB.colorName) {
                    return dataA.colorName.localeCompare(dataB.colorName);
                }
                
                if (dataA.formattedWidth !== dataB.formattedWidth) {
                    const widthOrder = ['Standard', 'Narrow', 'Wide', 'Extra Wide'];
                    const indexA = widthOrder.indexOf(dataA.formattedWidth);
                    const indexB = widthOrder.indexOf(dataB.formattedWidth);
                    if (indexA !== -1 && indexB !== -1) {
                        return indexA - indexB;
                    }
                    return dataA.formattedWidth.localeCompare(dataB.formattedWidth);
                }
                
                const sizeA = parseFloat(dataA.formattedSize) || 0;
                const sizeB = parseFloat(dataB.formattedSize) || 0;
                return sizeA - sizeB;
            });
            
            for (const [variantKey, variantData] of sortedVariants) {
                let productTitle = `${variantData.formattedGender} New Balance ${variantData.matchingProduct} - ${variantData.colorName}`;
                if (variantData.formattedWidth !== 'Standard') {
                    productTitle += ` (${variantData.formattedWidth})`;
                }
                
                let baseHandle = `${variantData.formattedGender}-${variantData.matchingProduct}-${variantData.colorName}`
                    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                
                if (variantData.formattedWidth !== 'Standard') {
                    baseHandle += `-${variantData.formattedWidth.toLowerCase().replace(/\s+/g, '-')}`;
                }
                
                shopifyInventory.push({
                    Handle: baseHandle,
                    Title: productTitle,
                    'Option1 Name': 'Size',
                    'Option1 Value': variantData.formattedSize,
                    'Option2 Name': variantData.formattedWidth !== 'Standard' ? 'Width' : '',
                    'Option2 Value': variantData.formattedWidth !== 'Standard' ? variantData.formattedWidth : '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    SKU: variantData.sku || `${variantData.styleNumber}-${variantData.colorCode}-${variantData.formattedSize}-${variantData.formattedWidth.charAt(0)}`,
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
                    'On hand (new)': variantData.quantity
                });
            }
            
            this.inventoryData = shopifyInventory;
            return shopifyInventory;
            
        } catch (error) {
            console.error('New Balance conversion error:', error);
            throw error;
        }
    },
    
    generateInventoryCSV() {
        // FIXED: Use Papa Parse for proper CSV generation instead of manual string building
        if (typeof Papa !== 'undefined') {
            return Papa.unparse(this.inventoryData, {
                quotes: true,
                quoteChar: '"',
                delimiter: ','
            });
        }
        
        // Fallback to manual generation if Papa Parse not available
        const inventoryHeaders = ['Handle', 'Title', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
                       'Option3 Name', 'Option3 Value', 'SKU', 'Barcode', 'HS Code', 'COO', 'Location', 'Bin name', 
                       'Incoming (not editable)', 'Unavailable (not editable)', 'Committed (not editable)', 
                       'Available (not editable)', 'On hand (current)', 'On hand (new)'];
        
        const csvRows = [inventoryHeaders.join(',')];
        
        this.inventoryData.forEach(row => {
            const csvRow = [
                row.Handle,
                `"${row.Title.replace(/"/g, '""')}"`, // Properly escape quotes in title
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
                row['On hand (new)']
            ];
            csvRows.push(csvRow.join(','));
        });
        
        return csvRows.join('\n');
    }
};