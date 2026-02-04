// Saucony Converter Logic - UPDATED WITH RIDE 19 CONSISTENT GENDER SUFFIXES
const SauconyConverter = {
    productsData: [],
    inventoryData: [],
    
    // Saucony Product Prices
    productPrices: {
        'Endorphin Pro 4': 240,
        'Endorphin Elite 2': 290,
        'Guide 18': 150,
        'Ride 18': 145,
        'Ride 19': 145,
        'Triumph 23': 170,
        'Triumph 23 GTX': 190
    },

    // Saucony Product Descriptions
    productDescriptions: {
        'Endorphin Pro 4': 'Elite carbon-plated racing shoe featuring revolutionary dual-foam technology with PWRRUN HG and PWRRUN PB foam for maximum energy return. Engineered for marathon and half-marathon racing with an 8mm drop and weighing just 7.5oz. The full-length carbon fiber plate and SPEEDROLL technology deliver explosive propulsion while maintaining exceptional comfort for long-distance performance.',
        'Endorphin Elite 2': 'Ultimate racing shoe with full PWRRUN HG foam midsole delivering unmatched energy return. Features aggressive carbon plate geometry and ultralight construction. Designed for elite runners seeking maximum performance in races from 5K to marathon.',
        'Guide 18': 'Stability daily trainer featuring CenterPath Technology for natural support and guidance. PWRRUN foam cushioning with 6mm drop provides comfortable protection for daily miles. The engineered mesh upper offers breathability while the stability features help control pronation.',
        'Ride 18': 'Versatile neutral daily trainer with PWRRUN+ cushioning for responsive comfort. Features 8mm drop for a natural stride. Enhanced breathability and durability make it perfect for daily training, long runs, and everything in between.',
        'Ride 19': 'Updated neutral daily trainer featuring enhanced PWRRUN+ cushioning that delivers responsive, durable comfort mile after mile. With an 8mm drop and improved breathable mesh upper, the Ride 19 offers a smooth, reliable ride for everyday training, long runs, and everything in between. The ultimate workhorse trainer built to handle your daily training demands.',
        'Triumph 23': 'Premium max-cushioned trainer featuring soft and responsive PWRRUN PB foam for ultimate comfort. 10mm drop with 37mm heel stack provides plush protection for long runs. Features Super Responsive Sockliner for added energy return.',
        'Triumph 23 GTX': 'Waterproof version of the premium max-cushioned Triumph 23 featuring GORE-TEX protection. Soft and responsive PWRRUN PB foam provides plush protection in any weather.'
    },
    
    // EXISTING SHOPIFY HANDLES
    existingHandles: {
        // Endorphin Elite 2 - Unisex
        'Endorphin Elite 2|Citron Black|unisex': 'endorphin-elite-2-citron-black',
        'Endorphin Elite 2|Coral White|unisex': 'endorphin-elite-2-coral-white',
        'Endorphin Elite 2|Fog Cinder|unisex': 'endorphin-elite-2-fog-cinder',
        'Endorphin Elite 2|White Mutant|unisex': 'endorphin-elite-2-white-mutant',
        'Endorphin Elite 2|White Peel|unisex': 'endorphin-elite-2-white-peel',
        
        // Endorphin Pro 4 - Women's
        'Endorphin Pro 4|Black Vizired|women': 'endorphin-pro-4-black-vizired',
        'Endorphin Pro 4|Cavern Violet|women': 'endorphin-pro-4-cavern-violet',
        'Endorphin Pro 4|Citron Silver|women': 'endorphin-pro-4-citron-silver',
        'Endorphin Pro 4|Coral|women': 'endorphin-pro-4-coral',
        'Endorphin Pro 4|Fog Peel|women': 'endorphin-pro-4-fog-peel',
        'Endorphin Pro 4|Magenta|women': 'endorphin-pro-4-magenta',
        'Endorphin Pro 4|Mirage Citron|women': 'endorphin-pro-4-mirage-citron',
        'Endorphin Pro 4|Mist|women': 'endorphin-pro-4-mist',
        'Endorphin Pro 4|Vizired|women': 'endorphin-pro-4-vizired',
        'Endorphin Pro 4|White Crocus|women': 'endorphin-pro-4-white-crocus',
        'Endorphin Pro 4|White Mutant|women': 'endorphin-pro-4-white-mutant',
        'Endorphin Pro 4|White Shadow|women': 'endorphin-pro-4-white-shadow',
        'Endorphin Pro 4|White Silver|women': 'endorphin-pro-4-white-silver',
        'Endorphin Pro 4|White Violet|women': 'endorphin-pro-4-white-violet',
        
        // Endorphin Pro 4 - Men's
        'Endorphin Pro 4|Black Vo2|men': 'endorphin-pro-4-black-vo2',
        'Endorphin Pro 4|Cavern Purple|men': 'endorphin-pro-4-cavern-purple',
        'Endorphin Pro 4|Lapis Citron|men': 'endorphin-pro-4-lapis-citron',
        'Endorphin Pro 4|Navy Citron|men': 'endorphin-pro-4-navy-citron',
        'Endorphin Pro 4|Olivine Black|men': 'endorphin-pro-4-olivine-black',
        'Endorphin Pro 4|Pepper Navy|men': 'endorphin-pro-4-pepper-navy',
        'Endorphin Pro 4|Viziorange|men': 'endorphin-pro-4-viziorange',
        'Endorphin Pro 4|White Black|men': 'endorphin-pro-4-white-black',
        'Endorphin Pro 4|White Gold|men': 'endorphin-pro-4-white-gold',
        
        // Guide 18 - Women's
        'Guide 18|Ballad Skydiver|women': 'guide-18-ballad-skydiver',
        'Guide 18|Black White|women': 'guide-18-black-white',
        'Guide 18|Cameo Terra|women': 'guide-18-cameo-terra',
        'Guide 18|Cloud Dream|women': 'guide-18-cloud-dream',
        'Guide 18|Cloud|women': 'guide-18-cloud',
        'Guide 18|Hemlock Bloom|women': 'guide-18-hemlock-bloom',
        'Guide 18|Ivory|women': 'guide-18-ivory',
        'Guide 18|Moon Quail|women': 'guide-18-moon-quail',
        'Guide 18|Navy Apricot|women': 'guide-18-navy-apricot',
        'Guide 18|Navy Orchid|women': 'guide-18-navy-orchid',
        'Guide 18|Oat Quartz|women': 'guide-18-oat-quartz',
        'Guide 18|Peach Sunny|women': 'guide-18-peach-sunny',
        'Guide 18|Triple Black|women': 'guide-18-triple-black',
        'Guide 18|White Fuchsia|women': 'guide-18-white-fuchsia',
        'Guide 18|White Ice Melt|women': 'guide-18-white-ice-melt',
        'Guide 18|White Mist|women': 'guide-18-white-mist',
        
        // Guide 18 - Men's
        'Guide 18|Autumn Amber|men': 'guide-18-autumn-amber',
        'Guide 18|Black Lapis|men': 'guide-18-black-lapis',
        'Guide 18|Bone|men': 'guide-18-bone',
        'Guide 18|Cloud Black|men': 'guide-18-cloud-black',
        'Guide 18|Cloud Citron|men': 'guide-18-cloud-citron',
        'Guide 18|Cloud Olive|men': 'guide-18-cloud-olive',
        'Guide 18|Flint Navy|men': 'guide-18-flint-navy',
        'Guide 18|Fossil Dusk|men': 'guide-18-fossil-dusk',
        'Guide 18|Navy Skydiver|men': 'guide-18-navy-skydiver',
        'Guide 18|Shadow Gum|men': 'guide-18-shadow-gum',
        'Guide 18|Shadow Vizi|men': 'guide-18-shadow-vizi',
        'Guide 18|White Navy|men': 'guide-18-white-navy',
        'Guide 18|White Peel|men': 'guide-18-white-peel',
        
        // Ride 18 - Women's
        'Ride 18|Black Gum|women': 'ride-18-black-gum',
        'Ride 18|Black White|women': 'ride-18-black-white',
        'Ride 18|Cameo Peony|women': 'ride-18-cameo-peony',
        'Ride 18|Cloud Dream|women': 'ride-18-cloud-dream',
        'Ride 18|Cloud Silver|women': 'ride-18-cloud-silver',
        'Ride 18|Fog Void|women': 'ride-18-fog-void',
        'Ride 18|Opal Sunflower|women': 'ride-18-opal-sunflower',
        'Ride 18|Peach Blossom|women': 'ride-18-peach-blossom',
        'Ride 18|Reverie|women': 'ride-18-reverie',
        'Ride 18|Tempest|women': 'ride-18-tempest',
        'Ride 18|Terra Sky|women': 'ride-18-terra-sky',
        'Ride 18|Undyed Grey|women': 'ride-18-undyed-grey',
        'Ride 18|Undyed Meadow|women': 'ride-18-undyed-meadow',
        'Ride 18|Violet Bloom|women': 'ride-18-violet-bloom',
        'Ride 18|White Indigo|women': 'ride-18-white-indigo',
        'Ride 18|White Sky|women': 'ride-18-white-sky',
        
        // Ride 18 - Men's
        'Ride 18|Arctic Barley|men': 'ride-18-arctic-barley',
        'Ride 18|Azurite Peel|men': 'ride-18-azurite-peel',
        'Ride 18|Black Shadow|men': 'ride-18-black-shadow',
        'Ride 18|Black Skydiver|men': 'ride-18-black-skydiver',
        'Ride 18|Cinder Black|men': 'ride-18-cinder-black',
        'Ride 18|Cloud Dusk|men': 'ride-18-cloud-dusk',
        'Ride 18|Flint Slate|men': 'ride-18-flint-slate',
        'Ride 18|Navy|men': 'ride-18-navy',
        'Ride 18|Olive Black|men': 'ride-18-olive-black',
        'Ride 18|Shadow Sage|men': 'ride-18-shadow-sage',
        'Ride 18|Undyed Grey|men': 'ride-18-undyed-grey-men',
        'Ride 18|White Black|men': 'ride-18-white-black',
        
        // Ride 19 - NOT in existingHandles
        // All Ride 19 products follow the new standard format (product-color-gender)
        // and are handled automatically by the new product logic
        
        // Triumph 23 - Women's
        'Triumph 23|Cloud Grey|women': 'triumph-23-cloud-grey',
        'Triumph 23|Fog Shadow|women': 'triumph-23-fog-shadow',
        'Triumph 23|Stone Veil|women': 'triumph-23-stone-veil',
        'Triumph 23|White Punch|women': 'triumph-23-white-punch',
        
        // Triumph 23 - Men's
        'Triumph 23|Olive Steel|men': 'triumph-23-olive-steel',
        'Triumph 23|Shadow Citron|men': 'triumph-23-shadow-citron',
        'Triumph 23|White Geo|men': 'triumph-23-white-geo',
        'Triumph 23|White Shadow|men': 'triumph-23-white-shadow',
        
        // Triumph 23 GTX
        'Triumph 23 GTX|Sage|men': 'triumph-23-gtx-sage',
        'Triumph 23 GTX|Shadow Black|men': 'triumph-23-gtx-shadow-black',
        'Triumph 23 GTX|Stone Violet|women': 'triumph-23-gtx-stone-violet'
    },
    
    getProductPrice(productName) {
        if (!productName) return 140;
        for (let key in this.productPrices) {
            if (productName.toLowerCase() === key.toLowerCase()) {
                return this.productPrices[key];
            }
        }
        for (let key in this.productPrices) {
            if (productName.toLowerCase().includes(key.toLowerCase())) {
                return this.productPrices[key];
            }
        }
        return 140;
    },

    getProductDescription(productName) {
        if (!productName) return 'High-performance Saucony running shoe.';
        for (let key in this.productDescriptions) {
            if (productName.toLowerCase() === key.toLowerCase()) {
                return this.productDescriptions[key];
            }
        }
        for (let key in this.productDescriptions) {
            if (productName.toLowerCase().includes(key.toLowerCase())) {
                return this.productDescriptions[key];
            }
        }
        return 'High-performance Saucony running shoe designed for optimal comfort and performance.';
    },
    
    formatProductName(name) {
        if (!name) return name;
        const specialCases = {
            'endorphin pro': 'Endorphin Pro',
            'endorphin elite': 'Endorphin Elite',
            'guide': 'Guide',
            'ride': 'Ride',
            'triumph': 'Triumph',
            'gtx': 'GTX'
        };
        let formatted = name.toLowerCase();
        for (let [key, value] of Object.entries(specialCases)) {
            const regex = new RegExp('\\b' + key + '\\b', 'gi');
            formatted = formatted.replace(regex, value);
        }
        formatted = formatted.replace(/\b\w/g, l => l.toUpperCase());
        formatted = formatted.replace(/\s+(\d+)/g, ' $1');
        return formatted;
    },
    
    formatColorName(color) {
        if (!color) return color;
        return color.toLowerCase()
            .split(/[\s\/-]+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    },
    
    getProductHandle(productName, colorName, genderType, width) {
        const formattedProductName = this.formatProductName(productName);
        const formattedColorName = this.formatColorName(colorName);
        
        // Build lookup key for existing handles (without width for lookup)
        const lookupKey = `${formattedProductName}|${formattedColorName}|${genderType}`;
        
        // FIRST: Check if this exact product+color+gender exists in Shopify
        if (this.existingHandles[lookupKey]) {
            const baseHandle = this.existingHandles[lookupKey];
            // Add -wide suffix for wide width shoes
            return width === 'W' ? `${baseHandle}-wide` : baseHandle;
        }
        
        // NEW PRODUCT LOGIC: Generate handle with gender suffix
        // Generate base handle from product + color
        const baseHandle = (formattedProductName + "-" + formattedColorName)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-');
        
        // For NEW products, ALWAYS add gender suffix (except unisex)
        let handleWithGender = baseHandle;
        if (genderType === 'men' || genderType === 'women') {
            handleWithGender = `${baseHandle}-${genderType}`;
        }
        // Unisex products don't get gender suffix
        
        // Add -wide suffix for wide width shoes (after gender)
        const finalHandle = width === 'W' ? `${handleWithGender}-wide` : handleWithGender;
        
        return finalHandle;
    },
    
    async convert(file) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        
        let sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1,
            range: 1
        });
        
        const products = jsonData.filter(row => row && row[1] && row[1] !== null && row[1] !== "");
        
        const shopifyInventory = [];
        
        for (let rowIndex = 0; rowIndex < products.length; rowIndex++) {
            const product = products[rowIndex];
            const styleNumber = product[1];
            const productName = product[2];
            const color = product[3];
            const gender = product[4];
            const width = product[7] || 'M';
            
            // Skip header rows
            if (!productName || productName.toString().toLowerCase().includes('product name')) {
                continue;
            }
            
            // Process both standard (M) and wide (W) width shoes
            const widthStr = width.toString().toUpperCase();
            if (widthStr !== 'M' && widthStr !== 'W') {
                continue; // Skip other widths like 2E, D, XW
            }
            
            const isEndorphinElite = productName && productName.toString().toLowerCase().includes('endorphin elite');
            
            const formattedProductName = this.formatProductName(productName);
            const formattedColorName = this.formatColorName(color);
            
            let genderPrefix = '';
            let sizeColumns = [];
            
            // Excel structure: Column 9-23 contains sizes for ALL shoes
            // Women's: columns represent sizes 5.0-12.0
            // Men's: same columns represent sizes 7.0-14.0
            // Unisex: same columns, treated as men's sizing (standard for unisex running shoes)
            
            if (isEndorphinElite || (gender && gender.toString().toLowerCase().includes('unisex'))) {
                // Unisex shoes use men's sizing
                genderPrefix = "Unisex ";
                sizeColumns = [
                    {col: 9, size: "M7.0/W8.5"}, {col: 10, size: "M7.5/W9.0"}, {col: 11, size: "M8.0/W9.5"},
                    {col: 12, size: "M8.5/W10.0"}, {col: 13, size: "M9.0/W10.5"}, {col: 14, size: "M9.5/W11.0"},
                    {col: 15, size: "M10.0/W11.5"}, {col: 16, size: "M10.5/W12.0"}, {col: 17, size: "M11.0/W12.5"},
                    {col: 18, size: "M11.5/W13.0"}, {col: 19, size: "M12.0/W13.5"}, {col: 20, size: "M12.5/W14.0"},
                    {col: 21, size: "M13.0/W14.5"}, {col: 22, size: "M13.5/W15.0"}, {col: 23, size: "M14.0/W15.5"}
                ];
            } else if (gender && gender.toString().toLowerCase().includes('women')) {
                genderPrefix = "Women's ";
                sizeColumns = [
                    {col: 9, size: "5.0"}, {col: 10, size: "5.5"}, {col: 11, size: "6.0"},
                    {col: 12, size: "6.5"}, {col: 13, size: "7.0"}, {col: 14, size: "7.5"},
                    {col: 15, size: "8.0"}, {col: 16, size: "8.5"}, {col: 17, size: "9.0"},
                    {col: 18, size: "9.5"}, {col: 19, size: "10.0"}, {col: 20, size: "10.5"},
                    {col: 21, size: "11.0"}, {col: 22, size: "11.5"}, {col: 23, size: "12.0"}
                ];
            } else {
                // Men's shoes
                genderPrefix = "Men's ";
                sizeColumns = [
                    {col: 9, size: "7.0"}, {col: 10, size: "7.5"}, {col: 11, size: "8.0"},
                    {col: 12, size: "8.5"}, {col: 13, size: "9.0"}, {col: 14, size: "9.5"},
                    {col: 15, size: "10.0"}, {col: 16, size: "10.5"}, {col: 17, size: "11.0"},
                    {col: 18, size: "11.5"}, {col: 19, size: "12.0"}, {col: 20, size: "12.5"},
                    {col: 21, size: "13.0"}, {col: 22, size: "13.5"}, {col: 23, size: "14.0"}
                ];
            }
            
            // Add width to title if wide
            const widthSuffix = widthStr === 'W' ? ' Wide' : '';
            const productTitle = genderPrefix + "Saucony " + formattedProductName + " - " + formattedColorName + widthSuffix;
            
            // Determine gender type for handle generation
            let genderType = 'men';
            if (isEndorphinElite || (gender && gender.toString().toLowerCase().includes('unisex'))) {
                genderType = 'unisex';
            } else if (gender && gender.toString().toLowerCase().includes('women')) {
                genderType = 'women';
            }
            
            // Use smart handle generation that checks existing Shopify handles and adds width
            const handle = this.getProductHandle(productName, color, genderType, widthStr);
            
            for (let sizeInfo of sizeColumns) {
                const quantity = product[sizeInfo.col];
                if (!quantity && quantity !== 0) continue;
                
                const actualQuantity = quantity === "100+" ? 100 : parseInt(quantity) || 0;
                const variantSKU = styleNumber + '-' + sizeInfo.size.replace(/\//g, '-');
                
                shopifyInventory.push({
                    'Handle': handle,
                    'Title': productTitle,
                    'Option1 Name': 'Size',
                    'Option1 Value': sizeInfo.size,
                    'Option2 Name': '',
                    'Option2 Value': '',
                    'Option3 Name': '',
                    'Option3 Value': '',
                    'SKU': variantSKU,
                    'Barcode': '',
                    'HS Code': '',
                    'COO': '',
                    'Location': 'Needham',
                    'Bin name': '',
                    'Incoming (not editable)': '',
                    'Unavailable (not editable)': '',
                    'Committed (not editable)': '',
                    'Available (not editable)': '',
                    'On hand (current)': '',
                    'On hand (new)': actualQuantity
                });
            }
        }
        
        this.inventoryData = shopifyInventory;
        return shopifyInventory;
    },
    
    generateInventoryCSV() {
        const inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"', 
                       '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"', 
                       '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"', 
                       '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];
        
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
                row.Barcode,
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

