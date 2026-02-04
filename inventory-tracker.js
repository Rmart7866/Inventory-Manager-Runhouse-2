// ====================================================================
// INVENTORY TRACKER - CORRECTED VERSION
// ====================================================================
// Discontinued = Any colorway not present in new file (set qty to 0)
// New Colorway = Any colorway in new file that wasn't in old file
// ====================================================================

function compareInventories(yesterdayCSV, todayCSV) {
    console.log('Starting comparison...');
    
    // Parse CSVs
    const yesterday = parseShopifyCSV(yesterdayCSV);
    const today = parseShopifyCSV(todayCSV);
    
    console.log(`Yesterday variants: ${yesterday.length}`);
    console.log(`Today variants: ${today.length}`);
    
    // Group by colorway (Handle)
    const yesterdayColorways = new Map(); // handle -> variants
    const todayColorways = new Map();
    
    // Group yesterday's data by Handle (colorway)
    yesterday.forEach(variant => {
        if (!yesterdayColorways.has(variant.Handle)) {
            yesterdayColorways.set(variant.Handle, []);
        }
        yesterdayColorways.get(variant.Handle).push(variant);
    });
    
    // Group today's data by Handle (colorway)
    today.forEach(variant => {
        if (!todayColorways.has(variant.Handle)) {
            todayColorways.set(variant.Handle, []);
        }
        todayColorways.get(variant.Handle).push(variant);
    });
    
    // Find DISCONTINUED colorways (in yesterday but NOT in today)
    const discontinuedColorways = [];
    
    yesterdayColorways.forEach((variants, handle) => {
        if (!todayColorways.has(handle)) {
            // This colorway is discontinued
            discontinuedColorways.push({
                handle: handle,
                title: variants[0].Title,
                variants: variants
            });
        }
    });
    
    // Find NEW colorways (in today but NOT in yesterday)
    const newColorways = [];
    
    todayColorways.forEach((variants, handle) => {
        if (!yesterdayColorways.has(handle)) {
            // This is a new colorway
            newColorways.push({
                handle: handle,
                title: variants[0].Title,
                variants: variants
            });
        }
    });
    
    // Sort alphabetically by title
    discontinuedColorways.sort((a, b) => a.title.localeCompare(b.title));
    newColorways.sort((a, b) => a.title.localeCompare(b.title));
    
    console.log(`Found ${discontinuedColorways.length} discontinued colorways`);
    console.log(`Found ${newColorways.length} new colorways`);
    
    return {
        discontinuedColorways,
        newColorways,
        yesterdayColorways,
        todayColorways
    };
}

function parseShopifyCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const handleIndex = headers.indexOf('Handle');
    const titleIndex = headers.indexOf('Title');
    const variantSKUIndex = headers.indexOf('Variant SKU');
    const option1Index = headers.indexOf('Option1 Value'); // Size
    const variantInventoryQtyIndex = headers.indexOf('Variant Inventory Qty');
    
    const variants = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const values = parseCSVLine(line);
        
        const handle = values[handleIndex]?.trim().replace(/^"|"$/g, '') || '';
        const title = values[titleIndex]?.trim().replace(/^"|"$/g, '') || '';
        const sku = values[variantSKUIndex]?.trim().replace(/^"|"$/g, '') || '';
        const size = values[option1Index]?.trim().replace(/^"|"$/g, '') || '';
        const qty = values[variantInventoryQtyIndex]?.trim().replace(/^"|"$/g, '') || '0';
        
        if (handle && size) {
            variants.push({
                Handle: handle,
                Title: title,
                SKU: sku,
                Size: size,
                Quantity: parseInt(qty) || 0
            });
        }
    }
    
    return variants;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    
    return values;
}

function generateReport(comparison) {
    const { discontinuedColorways, newColorways } = comparison;
    
    let report = '';
    
    // Header
    report += '======================================================================\n';
    report += '              RUN HOUSE INVENTORY COMPARISON REPORT\n';
    report += '======================================================================\n\n';
    
    // Discontinued Colorways Section
    report += `DISCONTINUED COLORWAYS\n`;
    report += `======================================================================\n`;
    report += `${discontinuedColorways.length} colorways discontinued\n`;
    report += `${discontinuedColorways.reduce((sum, cw) => sum + cw.variants.length, 0)} total variants\n\n`;
    
    if (discontinuedColorways.length > 0) {
        discontinuedColorways.forEach(colorway => {
            report += `${colorway.title}\n`;
            report += `  Sizes: `;
            const sizeList = colorway.variants
                .sort((a, b) => parseFloat(a.Size) - parseFloat(b.Size))
                .map(v => `${v.Size} (${v.Quantity})`)
                .join(', ');
            report += sizeList + '\n';
            report += `  Total variants: ${colorway.variants.length}\n\n`;
        });
    } else {
        report += 'No discontinued colorways found.\n\n';
    }
    
    report += '\n';
    
    // New Colorways Section
    report += `NEW COLORWAYS\n`;
    report += `======================================================================\n`;
    report += `${newColorways.length} new colorways detected\n`;
    report += `${newColorways.reduce((sum, cw) => sum + cw.variants.length, 0)} total variants\n\n`;
    
    if (newColorways.length > 0) {
        newColorways.forEach(colorway => {
            report += `${colorway.title}\n`;
            report += `  Sizes: `;
            const sizeList = colorway.variants
                .sort((a, b) => parseFloat(a.Size) - parseFloat(b.Size))
                .map(v => `${v.Size} (${v.Quantity})`)
                .join(', ');
            report += sizeList + '\n';
            report += `  Total variants: ${colorway.variants.length}\n\n`;
        });
    } else {
        report += 'No new colorways found.\n\n';
    }
    
    report += '======================================================================\n';
    
    return report;
}

function generateDiscontinuedCSV(discontinuedColorways) {
    if (discontinuedColorways.length === 0) {
        return null;
    }
    
    // Shopify CSV format
    let csv = 'Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Included / United States,Price / United States,Compare At Price / United States,Included / International,Price / International,Compare At Price / International,Status\n';
    
    discontinuedColorways.forEach(colorway => {
        colorway.variants.forEach((variant, index) => {
            const isFirstVariant = index === 0;
            
            csv += `"${variant.Handle}",`;
            csv += `"${isFirstVariant ? variant.Title : ''}",`;
            csv += `"",`; // Body (HTML)
            csv += `"",`; // Vendor
            csv += `"",`; // Product Category
            csv += `"",`; // Type
            csv += `"",`; // Tags
            csv += `"TRUE",`; // Published
            csv += `"${isFirstVariant ? 'Size' : ''}",`; // Option1 Name
            csv += `"${variant.Size}",`; // Option1 Value
            csv += `"${variant.SKU}",`; // Variant SKU
            csv += `"0",`; // Variant Grams
            csv += `"shopify",`; // Variant Inventory Tracker
            csv += `"0",`; // Variant Inventory Qty - SET TO 0
            csv += `"deny",`; // Variant Inventory Policy
            csv += `"manual",`; // Variant Fulfillment Service
            csv += `"",`; // Variant Price
            csv += `"",`; // Variant Compare At Price
            csv += `"TRUE",`; // Variant Requires Shipping
            csv += `"TRUE",`; // Variant Taxable
            csv += `"",`; // Variant Barcode
            csv += `"",`; // Image Src
            csv += `"",`; // Image Position
            csv += `"",`; // Image Alt Text
            csv += `"FALSE",`; // Gift Card
            csv += `"",`; // SEO Title
            csv += `"",`; // SEO Description
            csv += `"",`; // Google Shopping / Google Product Category
            csv += `"",`; // Google Shopping / Gender
            csv += `"",`; // Google Shopping / Age Group
            csv += `"",`; // Google Shopping / MPN
            csv += `"",`; // Google Shopping / Condition
            csv += `"",`; // Google Shopping / Custom Product
            csv += `"",`; // Google Shopping / Custom Label 0
            csv += `"",`; // Google Shopping / Custom Label 1
            csv += `"",`; // Google Shopping / Custom Label 2
            csv += `"",`; // Google Shopping / Custom Label 3
            csv += `"",`; // Google Shopping / Custom Label 4
            csv += `"",`; // Variant Image
            csv += `"lb",`; // Variant Weight Unit
            csv += `"",`; // Variant Tax Code
            csv += `"",`; // Cost per item
            csv += `"TRUE",`; // Included / United States
            csv += `"",`; // Price / United States
            csv += `"",`; // Compare At Price / United States
            csv += `"FALSE",`; // Included / International
            csv += `"",`; // Price / International
            csv += `"",`; // Compare At Price / International
            csv += `"active"`; // Status
            csv += '\n';
        });
    });
    
    return csv;
}

function generateNewColorwaysCSV(newColorways) {
    if (newColorways.length === 0) {
        return null;
    }
    
    // Shopify CSV format
    let csv = 'Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / Condition,Google Shopping / Custom Product,Google Shopping / Custom Label 0,Google Shopping / Custom Label 1,Google Shopping / Custom Label 2,Google Shopping / Custom Label 3,Google Shopping / Custom Label 4,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Included / United States,Price / United States,Compare At Price / United States,Included / International,Price / International,Compare At Price / International,Status\n';
    
    newColorways.forEach(colorway => {
        colorway.variants.forEach((variant, index) => {
            const isFirstVariant = index === 0;
            
            csv += `"${variant.Handle}",`;
            csv += `"${isFirstVariant ? variant.Title : ''}",`;
            csv += `"",`; // Body (HTML)
            csv += `"",`; // Vendor
            csv += `"",`; // Product Category
            csv += `"",`; // Type
            csv += `"",`; // Tags
            csv += `"TRUE",`; // Published
            csv += `"${isFirstVariant ? 'Size' : ''}",`; // Option1 Name
            csv += `"${variant.Size}",`; // Option1 Value
            csv += `"${variant.SKU}",`; // Variant SKU
            csv += `"0",`; // Variant Grams
            csv += `"shopify",`; // Variant Inventory Tracker
            csv += `"${variant.Quantity}",`; // Variant Inventory Qty - ACTUAL QTY
            csv += `"deny",`; // Variant Inventory Policy
            csv += `"manual",`; // Variant Fulfillment Service
            csv += `"",`; // Variant Price
            csv += `"",`; // Variant Compare At Price
            csv += `"TRUE",`; // Variant Requires Shipping
            csv += `"TRUE",`; // Variant Taxable
            csv += `"",`; // Variant Barcode
            csv += `"",`; // Image Src
            csv += `"",`; // Image Position
            csv += `"",`; // Image Alt Text
            csv += `"FALSE",`; // Gift Card
            csv += `"",`; // SEO Title
            csv += `"",`; // SEO Description
            csv += `"",`; // Google Shopping / Google Product Category
            csv += `"",`; // Google Shopping / Gender
            csv += `"",`; // Google Shopping / Age Group
            csv += `"",`; // Google Shopping / MPN
            csv += `"",`; // Google Shopping / Condition
            csv += `"",`; // Google Shopping / Custom Product
            csv += `"",`; // Google Shopping / Custom Label 0
            csv += `"",`; // Google Shopping / Custom Label 1
            csv += `"",`; // Google Shopping / Custom Label 2
            csv += `"",`; // Google Shopping / Custom Label 3
            csv += `"",`; // Google Shopping / Custom Label 4
            csv += `"",`; // Variant Image
            csv += `"lb",`; // Variant Weight Unit
            csv += `"",`; // Variant Tax Code
            csv += `"",`; // Cost per item
            csv += `"TRUE",`; // Included / United States
            csv += `"",`; // Price / United States
            csv += `"",`; // Compare At Price / United States
            csv += `"FALSE",`; // Included / International
            csv += `"",`; // Price / International
            csv += `"",`; // Compare At Price / International
            csv += `"active"`; // Status
            csv += '\n';
        });
    });
    
    return csv;
}
