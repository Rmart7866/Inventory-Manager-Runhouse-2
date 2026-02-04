// HOKA Converter Logic - UPDATED with Mach 7, Gaviota 6, Speedgoat 7
const HokaConverter = {
    inventoryData: [],
    
    isAvailableNow(availableDateStr) {
        // Check if the available date is today or in the past
        if (!availableDateStr) return true;
        
        try {
            const [month, day, year] = availableDateStr.toString().split('/').map(num => parseInt(num));
            const availableDate = new Date(year, month - 1, day);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            return availableDate <= today;
        } catch (e) {
            console.warn('Could not parse available date:', availableDateStr);
            return true;
        }
    },
    
    productInfo: {
        'Mach 6': {
            description: 'Behold the lightest, most responsive Mach to date. This lively trainer has been fine-tuned for extra energy return with a super critical foam midsole and updated for enhanced durability with strategic rubber coverage in the outsole.',
            specs: { stack: '37/32mm', drop: '5mm', weight: '8.1 oz' },
            features: ['Lightweight design', 'Responsive cushioning', 'Daily trainer', 'Tempo runs'],
            category: 'neutral daily trainer',
            bestFor: 'Daily training, tempo runs, 5K to half marathon races'
        },
        'Mach 7': {
            description: 'The lightest, most responsive Mach yet. The Mach 7 delivers an energetic ride with updated cushioning and improved durability, making it the perfect daily trainer for runners seeking speed and comfort.',
            specs: { stack: '37/32mm', drop: '5mm', weight: '8.1 oz' },
            features: ['Lightweight design', 'Responsive cushioning', 'Updated upper', 'Improved durability'],
            category: 'neutral daily trainer',
            bestFor: 'Daily training, tempo runs, 5K to half marathon races'
        },
        'Mach X 3': {
            description: 'A plated daily trainer that brings the heat to speedwork. Built for up-tempo training miles with an extra-resilient PEBA-topped midsole and snappy Pebax® plate.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '10.2 oz' },
            features: ['Carbon plate', 'PEBA midsole', 'Speed training', 'Race day ready'],
            category: 'plated performance trainer',
            bestFor: 'Speed workouts, tempo runs, race day from 5K to marathon'
        },
        'Skyward X': {
            description: 'Pushing soft and smooth to the extreme, this cushy trainer features a revolutionary suspension system with a convex carbon fiber plate.',
            specs: { stack: '48/43mm', drop: '5mm', weight: '11.3 oz' },
            features: ['Max cushioning', 'Carbon fiber plate', 'Suspension system', 'Long runs'],
            category: 'max cushion trainer',
            bestFor: 'Long runs, recovery runs, ultra-distance training'
        },
        'Clifton 10': {
            description: 'A trusted trainer for daily maintenance miles. Ushering in a new era of plush performance with additional heel-to-toe drop.',
            specs: { stack: '42/34mm', drop: '8mm', weight: '9.7 oz' },
            features: ['Plush cushioning', 'Neutral support', 'Daily miles', 'Versatile trainer'],
            category: 'neutral cushioned trainer',
            bestFor: 'Daily training, easy runs, long runs, walking'
        },
        'Bondi 9': {
            description: 'One of the hardest working shoes in the HOKA lineup. Delivers peak plushness for everyday miles with increased stack height.',
            specs: { stack: '43/38mm', drop: '5mm', weight: '10.5 oz' },
            features: ['Maximum cushioning', 'High stack height', 'Recovery runs', 'All-day comfort'],
            category: 'max cushion trainer',
            bestFor: 'Recovery runs, easy miles, walking, all-day wear'
        },
        'Arahi 8': {
            description: 'Anything but your average stability shoe. Features enhanced H-frame™ technology for combating overpronation.',
            specs: { stack: '39/31mm', drop: '8mm', weight: '9.8 oz' },
            features: ['Stability support', 'H-Frame technology', 'Overpronation control', 'Daily trainer'],
            category: 'stability trainer',
            bestFor: 'Daily training for overpronators, long runs, marathon training'
        },
        'Skyflow': {
            description: 'Designed to elevate your daily running practice. Combines premium geometry with upgraded foam compounds.',
            specs: { stack: '40/35mm', drop: '5mm', weight: '10 oz' },
            features: ['Balanced cushioning', 'Smooth ride', 'Daily versatility', 'Premium foam'],
            category: 'neutral daily trainer',
            bestFor: 'Daily training, base miles, tempo runs'
        },
        'Gaviota 5': {
            description: 'Maximum stability meets plush comfort in the Gaviota 5. Featuring an updated H-Frame™ design that guides your gait while delivering a smooth, cushioned ride.',
            specs: { stack: '40/35mm', drop: '5mm', weight: '10.3 oz' },
            features: ['Maximum stability', 'H-Frame technology', 'Plush cushioning', 'GuideRails support'],
            category: 'max stability trainer',
            bestFor: 'Daily training for severe overpronators, long runs, marathon training'
        },
        'Gaviota 6': {
            description: 'Maximum stability meets plush comfort in the Gaviota 6. This premium stability shoe features an enhanced H-Frame™ technology and generous cushioning to guide your gait while delivering a smooth, comfortable ride for overpronators.',
            specs: { stack: '40/35mm', drop: '5mm', weight: '10.3 oz' },
            features: ['Enhanced H-Frame technology', 'Plush cushioning', 'Updated upper', 'Early-stage Meta-Rocker'],
            category: 'max stability trainer',
            bestFor: 'Daily training for overpronators, long runs, marathon training'
        },
        'Transport': {
            description: 'The perfect everyday shoe that transitions from trail to town. Combines outdoor-inspired design with HOKA cushioning for all-day comfort.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '11.5 oz' },
            features: ['Versatile design', 'CMEVA midsole', 'Durable outsole', 'All-terrain ready'],
            category: 'lifestyle/casual',
            bestFor: 'Everyday wear, casual walking, light trails, urban adventures'
        },
        'Transport Chukka': {
            description: 'Elevated style meets everyday comfort. The Transport Chukka features a mid-height design with HOKA cushioning for all-day wear.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '12 oz' },
            features: ['Mid-height design', 'Versatile style', 'CMEVA midsole', 'Premium materials'],
            category: 'lifestyle/casual',
            bestFor: 'Everyday wear, casual occasions, urban exploration'
        },
        'Transport GTX': {
            description: 'Weather-ready versatility with GORE-TEX waterproof protection. The Transport GTX keeps you dry and comfortable in any conditions.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '12.5 oz' },
            features: ['GORE-TEX waterproof', 'Versatile design', 'All-weather protection', 'Durable construction'],
            category: 'lifestyle/casual',
            bestFor: 'Wet weather, everyday wear, light trails, all-season use'
        },
        'Transport Hike': {
            description: 'Trail-ready comfort with enhanced support and traction. The Transport Hike brings HOKA cushioning to light hiking adventures.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '12.5 oz' },
            features: ['Enhanced traction', 'Trail-ready', 'Supportive design', 'HOKA cushioning'],
            category: 'lifestyle/hiking',
            bestFor: 'Light hiking, trail walking, outdoor adventures'
        },
        'Transport Mid': {
            description: 'Ankle support meets everyday comfort. The Transport Mid features a supportive mid-height design with signature HOKA cushioning.',
            specs: { stack: '38/33mm', drop: '5mm', weight: '13 oz' },
            features: ['Mid-height support', 'Ankle stability', 'Versatile design', 'Premium comfort'],
            category: 'lifestyle/casual',
            bestFor: 'Everyday wear, light hiking, urban exploration, extra ankle support'
        },
        'Solimar': {
            description: 'A lightweight, responsive trainer designed for faster-paced runs. Features a propulsive midsole geometry and breathable engineered mesh upper.',
            specs: { stack: '30/25mm', drop: '5mm', weight: '7.2 oz' },
            features: ['Lightweight build', 'Responsive cushioning', 'Breathable mesh', 'Tempo-ready'],
            category: 'lightweight performance trainer',
            bestFor: 'Tempo runs, speed workouts, race day, faster training paces'
        },
        'Speedgoat 6': {
            description: 'Named after legendary ultrarunner Karl "Speedgoat" Metzler, this trail icon delivers unmatched traction and protection on technical terrain.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '9.7 oz' },
            features: ['Vibram Megagrip outsole', 'Trail protection', 'Aggressive traction', 'Technical terrain'],
            category: 'trail running',
            bestFor: 'Technical trails, ultra-distance, mountain running, all-terrain adventures'
        },
        'Speedgoat 7': {
            description: 'Named after legendary ultrarunner Karl "Speedgoat" Metzler, the Speedgoat 7 continues its legacy as the ultimate trail shoe for technical terrain. With enhanced traction, improved durability, and signature HOKA cushioning, this trail icon is ready for your toughest adventures.',
            specs: { stack: '33/29mm', drop: '4mm', weight: '9.7 oz' },
            features: ['Vibram Megagrip outsole', '5mm lugs', 'Enhanced upper', 'Protective toe cap'],
            category: 'trail running',
            bestFor: 'Technical trails, ultra-distance, mountain running, wet conditions'
        }
    },
    
    allowedProducts: [
        'Mach 6', 'Mach 7', 'Mach X 3', 'Skyward X', 'Clifton 10', 'Bondi 9', 'Arahi 8', 
        'Skyflow', 'Gaviota 5', 'Gaviota 6', 'Transport', 'Transport Chukka', 'Transport GTX', 
        'Transport Hike', 'Transport Mid', 'Solimar', 'Speedgoat 6', 'Speedgoat 7'
    ],
    
    isAllowedProduct(productName) {
        if (!productName) return false;
        let nameLower = productName.toLowerCase();
        
        // Strip gender prefix
        nameLower = nameLower.replace(/^[mwuy]\s+/, '');
        
        if (nameLower.includes('arahi')) {
            return nameLower.includes('arahi 8') || nameLower.includes('arahi8');
        }
        
        if (nameLower.includes('gaviota')) {
            return nameLower.includes('gaviota 5') || nameLower.includes('gaviota5') ||
                   nameLower.includes('gaviota 6') || nameLower.includes('gaviota6');
        }
        
        if (nameLower.includes('mach')) {
            return nameLower.includes('mach 6') || nameLower.includes('mach6') ||
                   nameLower.includes('mach 7') || nameLower.includes('mach7') ||
                   nameLower.includes('mach x') || nameLower.includes('machx');
        }
        
        if (nameLower.includes('speedgoat')) {
            return nameLower.includes('speedgoat 6') || nameLower.includes('speedgoat6') ||
                   nameLower.includes('speedgoat 7') || nameLower.includes('speedgoat7');
        }
        
        // Check for Transport variants first (more specific)
        if (nameLower.includes('transport')) {
            if (nameLower.includes('chukka')) return this.allowedProducts.includes('Transport Chukka');
            if (nameLower.includes('gtx')) return this.allowedProducts.includes('Transport GTX');
            if (nameLower.includes('hike')) return this.allowedProducts.includes('Transport Hike');
            if (nameLower.includes('mid')) return this.allowedProducts.includes('Transport Mid');
            return this.allowedProducts.includes('Transport');
        }
        
        return this.allowedProducts.some(allowed => {
            const allowedLower = allowed.toLowerCase();
            return nameLower.includes(allowedLower) || 
                   nameLower.includes(allowedLower.replace(/\s+/g, ''));
        });
    },
    
    getMatchingProduct(productName) {
        if (!productName) return null;
        let nameLower = productName.toLowerCase();
        
        // Strip gender prefix
        nameLower = nameLower.replace(/^[mwuy]\s+/, '');
        
        if (nameLower.includes('arahi')) {
            if (nameLower.includes('arahi 8') || nameLower.includes('arahi8')) {
                return 'Arahi 8';
            }
            return null;
        }
        
        if (nameLower.includes('gaviota')) {
            if (nameLower.includes('gaviota 6') || nameLower.includes('gaviota6')) {
                return 'Gaviota 6';
            }
            if (nameLower.includes('gaviota 5') || nameLower.includes('gaviota5')) {
                return 'Gaviota 5';
            }
            return null;
        }
        
        if (nameLower.includes('mach')) {
            if (nameLower.includes('mach x') || nameLower.includes('machx')) {
                return 'Mach X 3';
            }
            if (nameLower.includes('mach 7') || nameLower.includes('mach7')) {
                return 'Mach 7';
            }
            if (nameLower.includes('mach 6') || nameLower.includes('mach6')) {
                return 'Mach 6';
            }
            return null;
        }
        
        if (nameLower.includes('speedgoat')) {
            if (nameLower.includes('speedgoat 7') || nameLower.includes('speedgoat7')) {
                return 'Speedgoat 7';
            }
            if (nameLower.includes('speedgoat 6') || nameLower.includes('speedgoat6')) {
                return 'Speedgoat 6';
            }
            return null;
        }
        
        // Check for Transport variants first (more specific matches before generic)
        if (nameLower.includes('transport')) {
            if (nameLower.includes('chukka')) return 'Transport Chukka';
            if (nameLower.includes('gtx')) return 'Transport GTX';
            if (nameLower.includes('hike')) return 'Transport Hike';
            if (nameLower.includes('mid')) return 'Transport Mid';
            return 'Transport';
        }
        
        // Check other products
        for (const allowed of this.allowedProducts) {
            const allowedLower = allowed.toLowerCase();
            if (nameLower.includes(allowedLower) || 
                nameLower.includes(allowedLower.replace(/\s+/g, ''))) {
                return allowed;
            }
        }
        return null;
    },
    
    formatGender(division) {
        if (!division) return '';
        const divStr = division.toString().trim();
        if (divStr.toLowerCase() === "women's" || divStr.toLowerCase() === "womens" || divStr === "W") return "Women's";
        if (divStr.toLowerCase() === "men's" || divStr.toLowerCase() === "mens" || divStr === "M") return "Men's";
        if (divStr.toLowerCase() === "youth" || divStr.toLowerCase() === "kids") return 'Youth';
        if (divStr.toLowerCase() === "unisex" || divStr === "U") return 'Unisex';
        return divStr;
    },
    
    async convert(file) {
        try {
            let data = [];
            
            if (file.name.toLowerCase().endsWith('.xlsx') || 
                file.name.toLowerCase().endsWith('.xls')) {
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer);
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            } else {
                const text = await file.text();
                const parseResult = Papa.parse(text, {
                    delimiter: '\t',
                    header: false,
                    skipEmptyLines: true,
                    dynamicTyping: true
                });
                data = parseResult.data;
            }
            
            // Skip header row if it exists
            let startIdx = 0;
            if (data.length > 0 && (data[0][0] === 'Division' || data[0][5] === 'Style Name' || data[0][5] === 'Product Name')) {
                startIdx = 1;
            }
            
            const filteredProducts = data.slice(startIdx).filter(row => {
                if (!row || row.length < 10) return false;
                const productName = row[5];
                const division = row[0];
                
                // Skip youth products
                if (division && (division.toString().trim().toLowerCase() === 'youth' || 
                               division.toString().trim().toLowerCase() === 'kids' ||
                               division.toString().trim().toUpperCase() === 'Y')) {
                    return false;
                }
                
                return this.isAllowedProduct(productName);
            });
            
            const processedVariants = new Map();
            
            for (let i = 0; i < filteredProducts.length; i++) {
                const product = filteredProducts[i];
                
                const division = product[0];
                const productName = product[5];
                const colorway = product[6];
                const styleSKU = product[7];
                const sizeInfo = product[8];
                const variantSKU = product[9];
                const upc = product[10];
                const availableDate = product[11];
                const quantity = product[12];
                const retail = product[14];
                
                // CRITICAL: Skip this variant if it's not available yet (future inventory)
                if (!this.isAvailableNow(availableDate)) {
                    continue;
                }
                
                const matchingProduct = this.getMatchingProduct(productName);
                if (!matchingProduct) continue;
                
                const formattedGender = this.formatGender(division);
                
                let size = sizeInfo ? sizeInfo.toString().replace(/[A-Z]/g, '') : '';
                if (size) {
                    size = size.replace(/^0/, '');
                    if (size.includes('/')) {
                        size = size.split('/')[0];
                    }
                    if (!size.includes('.')) {
                        size = size + '.0';
                    }
                }
                
                let width = 'Regular';
                if (variantSKU && sizeInfo) {
                    const skuUpper = variantSKU.toUpperCase();
                    const isWomen = formattedGender === "Women's";
                    
                    const sizeStr = sizeInfo.toString().toUpperCase();
                    
                    const nameUpper = productName ? productName.toUpperCase() : '';
                    if (nameUpper.includes('X-WIDE') || nameUpper.includes('XWIDE')) {
                        width = 'Extra Wide';
                    } else if (nameUpper.includes(' WIDE')) {
                        width = 'Wide';
                    } else if (isWomen) {
                        if (sizeStr.includes('EE') || sizeStr.includes('2E')) {
                            width = 'Extra Wide';
                        } else if (sizeStr.endsWith('D') || sizeStr.includes('D ')) {
                            width = 'Wide';
                        } else if (skuUpper.includes('EE') || skuUpper.includes('2E')) {
                            width = 'Extra Wide';
                        } else if (skuUpper.match(/\d+\.?\d*D$/i) || skuUpper.includes('-D-') || skuUpper.endsWith('-D')) {
                            width = 'Wide';
                        }
                    } else {
                        if (sizeStr.includes('EEEE') || skuUpper.includes('EEEE')) {
                            width = 'Extra Wide';
                        } else if (sizeStr.includes('EE') || sizeStr.includes('2E') || skuUpper.includes('EE') || skuUpper.includes('2E')) {
                            width = 'Wide';
                        }
                    }
                }
                
                const variantKey = `${formattedGender}-${matchingProduct}-${colorway}-${size}-${width}`;
                
                let actualQuantity = 0;
                if (typeof quantity === 'string') {
                    if (quantity.includes('+')) {
                        actualQuantity = parseInt(quantity.replace('+', '')) || 100;
                    } else {
                        actualQuantity = parseInt(quantity) || 0;
                    }
                } else if (typeof quantity === 'number') {
                    actualQuantity = quantity;
                }
                
                if (processedVariants.has(variantKey)) {
                    const existing = processedVariants.get(variantKey);
                    existing.quantity += actualQuantity;
                    continue;
                }
                
                processedVariants.set(variantKey, {
                    division,
                    gender: formattedGender,
                    productName,
                    matchingProduct,
                    colorway,
                    styleSKU,
                    size,
                    width,
                    variantSKU,
                    upc,
                    quantity: actualQuantity,
                    retail: retail
                });
            }
            
            const sortedVariants = Array.from(processedVariants.entries()).sort((a, b) => {
                const [keyA, dataA] = a;
                const [keyB, dataB] = b;
                
                if (dataA.matchingProduct !== dataB.matchingProduct) {
                    return dataA.matchingProduct.localeCompare(dataB.matchingProduct);
                }
                
                if (dataA.gender !== dataB.gender) {
                    if (dataA.gender === "Men's") return -1;
                    if (dataB.gender === "Men's") return 1;
                    return dataA.gender.localeCompare(dataB.gender);
                }
                
                if (dataA.colorway !== dataB.colorway) {
                    return dataA.colorway.localeCompare(dataB.colorway);
                }
                
                if (dataA.width !== dataB.width) {
                    if (dataA.width === 'Regular') return -1;
                    if (dataB.width === 'Regular') return 1;
                    return dataA.width.localeCompare(dataB.width);
                }
                
                const sizeA = parseFloat(dataA.size) || 0;
                const sizeB = parseFloat(dataB.size) || 0;
                return sizeA - sizeB;
            });
            
            const shopifyInventory = [];
            
            for (const [variantKey, variantData] of sortedVariants) {
                const productTitle = 'HOKA ' + variantData.gender + ' ' + variantData.matchingProduct + ' - ' + variantData.colorway;
                
                const baseHandle = (variantData.gender + '-' + variantData.matchingProduct + '-' + variantData.colorway)
                    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                
                const hasWidth = variantData.width !== 'Regular';
                const handle = baseHandle + (hasWidth ? '-' + variantData.width.toLowerCase().replace(/\s+/g, '-') : '');
                
                shopifyInventory.push({
                    Handle: handle,
                    Title: productTitle + (hasWidth ? ' (' + variantData.width + ')' : ''),
                    'Option1 Name': 'Size',
                    'Option1 Value': variantData.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    SKU: variantData.variantSKU,
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
            console.error('HOKA conversion error:', error);
            throw error;
        }
    },
    
    generateInventoryCSV() {
        if (typeof Papa !== 'undefined') {
            return Papa.unparse(this.inventoryData, {
                quotes: true,
                quoteChar: '"',
                delimiter: ','
            });
        }
        
        const inventoryHeaders = ['Handle', 'Title', 'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 
                       'Option3 Name', 'Option3 Value', 'SKU', 'Barcode', 'HS Code', 'COO', 'Location', 'Bin name', 
                       'Incoming (not editable)', 'Unavailable (not editable)', 'Committed (not editable)', 
                       'Available (not editable)', 'On hand (current)', 'On hand (new)'];
        
        const csvRows = [inventoryHeaders.join(',')];
        
        this.inventoryData.forEach(row => {
            const csvRow = [
                row.Handle,
                `"${row.Title.replace(/"/g, '""')}"`,
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
