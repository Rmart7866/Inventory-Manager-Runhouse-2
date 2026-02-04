// FIXED Simple Inventory Tracker - Properly compares two CSV files
const SimpleInventoryTracker = {
    yesterdayInventory: null,
    todayInventory: null,
    yesterdayDate: null,
    todayDate: null,
    
    async loadYesterdayCSV(file) {
        try {
            const text = await file.text();
            const parsed = Papa.parse(text, { 
                header: true,
                skipEmptyLines: true 
            });
            
            // Convert to simple format
            const inventory = {};
            let validRows = 0;
            
            parsed.data.forEach(row => {
                // Make sure we have the required fields
                if (row.Handle && row.SKU && row['Option1 Value']) {
                    const key = `${row.Handle}|${row['Option1 Value']}`;
                    inventory[key] = {
                        handle: row.Handle,
                        title: row.Title || '',
                        size: row['Option1 Value'],
                        sku: row.SKU,
                        quantity: parseInt(row['On hand (new)']) || 0
                    };
                    validRows++;
                }
            });
            
            this.yesterdayInventory = inventory;
            
            // Extract date from filename
            const dateMatch = file.name.match(/\d{4}-\d{2}-\d{2}/);
            this.yesterdayDate = dateMatch ? dateMatch[0] : 'unknown';
            
            console.log(`Loaded yesterday: ${validRows} variants from ${file.name}`);
            
            return {
                success: true,
                date: this.yesterdayDate,
                count: validRows
            };
        } catch (error) {
            console.error('Error loading yesterday CSV:', error);
            return { success: false, error: error.message };
        }
    },
    
    async loadTodayCSV(file) {
        try {
            const text = await file.text();
            const parsed = Papa.parse(text, { 
                header: true,
                skipEmptyLines: true 
            });
            
            // Convert to simple format
            const inventory = {};
            let validRows = 0;
            
            parsed.data.forEach(row => {
                // Make sure we have the required fields
                if (row.Handle && row.SKU && row['Option1 Value']) {
                    const key = `${row.Handle}|${row['Option1 Value']}`;
                    inventory[key] = {
                        handle: row.Handle,
                        title: row.Title || '',
                        size: row['Option1 Value'],
                        sku: row.SKU,
                        quantity: parseInt(row['On hand (new)']) || 0
                    };
                    validRows++;
                }
            });
            
            this.todayInventory = inventory;
            
            // Extract date from filename
            const dateMatch = file.name.match(/\d{4}-\d{2}-\d{2}/);
            this.todayDate = dateMatch ? dateMatch[0] : 'unknown';
            
            console.log(`Loaded today: ${validRows} variants from ${file.name}`);
            
            return {
                success: true,
                date: this.todayDate,
                count: validRows
            };
        } catch (error) {
            console.error('Error loading today CSV:', error);
            return { success: false, error: error.message };
        }
    },
    
    compareInventories() {
        if (!this.yesterdayInventory || !this.todayInventory) {
            return {
                hasComparison: false,
                message: 'Please upload both yesterday and today CSV files.'
            };
        }
        
        const discontinued = [];
        const newProducts = [];
        const quantityChanges = [];
        
        console.log('Starting comparison...');
        console.log(`Yesterday has ${Object.keys(this.yesterdayInventory).length} products`);
        console.log(`Today has ${Object.keys(this.todayInventory).length} products`);
        
        // Find discontinued products (in yesterday but not today)
        for (const [key, item] of Object.entries(this.yesterdayInventory)) {
            if (!this.todayInventory[key]) {
                discontinued.push({
                    ...item,
                    previousQuantity: item.quantity
                });
            }
        }
        
        console.log(`Found ${discontinued.length} discontinued products`);
        
        // Find new products (in today but not yesterday)
        for (const [key, item] of Object.entries(this.todayInventory)) {
            if (!this.yesterdayInventory[key]) {
                newProducts.push(item);
            } else {
                // Check for quantity changes
                const yesterdayQty = this.yesterdayInventory[key].quantity;
                const todayQty = item.quantity;
                if (yesterdayQty !== todayQty) {
                    quantityChanges.push({
                        ...item,
                        previousQuantity: yesterdayQty,
                        change: todayQty - yesterdayQty
                    });
                }
            }
        }
        
        console.log(`Found ${newProducts.length} new products`);
        console.log(`Found ${quantityChanges.length} quantity changes`);
        
        return {
            hasComparison: true,
            stats: {
                totalYesterday: Object.keys(this.yesterdayInventory).length,
                totalToday: Object.keys(this.todayInventory).length,
                discontinued: discontinued.length,
                new: newProducts.length,
                changed: quantityChanges.length
            },
            discontinued,
            newProducts,
            quantityChanges
        };
    },
    
    getComparisonReport() {
        const comparison = this.compareInventories();
        
        if (!comparison.hasComparison) {
            return comparison.message;
        }
        
        let report = `INVENTORY COMPARISON REPORT\n`;
        report += `${'='.repeat(60)}\n\n`;
        
        report += `COMPARING:\n`;
        report += `  Yesterday (${this.yesterdayDate}): ${comparison.stats.totalYesterday} variants\n`;
        report += `  Today (${this.todayDate}): ${comparison.stats.totalToday} variants\n`;
        report += `  Net Change: ${comparison.stats.totalToday - comparison.stats.totalYesterday > 0 ? '+' : ''}${comparison.stats.totalToday - comparison.stats.totalYesterday}\n\n`;
        
        report += `SUMMARY:\n`;
        report += `  Discontinued: ${comparison.stats.discontinued} variants\n`;
        report += `  New Products: ${comparison.stats.new} variants\n`;
        report += `  Quantity Changes: ${comparison.stats.changed} variants\n\n`;
        
        if (comparison.stats.discontinued > 0) {
            report += `${'='.repeat(60)}\n`;
            report += `DISCONTINUED PRODUCTS (${comparison.stats.discontinued} variants):\n`;
            report += `${'='.repeat(60)}\n`;
            comparison.discontinued.slice(0, 50).forEach(item => {
                report += `  - ${item.title} - Size ${item.size} (Was: ${item.previousQuantity})\n`;
            });
            if (comparison.stats.discontinued > 50) {
                report += `  ... and ${comparison.stats.discontinued - 50} more\n`;
            }
            report += '\n';
        }
        
        if (comparison.stats.new > 0) {
            report += `${'='.repeat(60)}\n`;
            report += `NEW PRODUCTS (${comparison.stats.new} variants):\n`;
            report += `${'='.repeat(60)}\n`;
            comparison.newProducts.slice(0, 30).forEach(item => {
                report += `  - ${item.title} - Size ${item.size} (Qty: ${item.quantity})\n`;
            });
            if (comparison.stats.new > 30) {
                report += `  ... and ${comparison.stats.new - 30} more\n`;
            }
            report += '\n';
        }
        
        if (comparison.stats.changed > 0) {
            report += `${'='.repeat(60)}\n`;
            report += `QUANTITY CHANGES (${comparison.stats.changed} variants):\n`;
            report += `${'='.repeat(60)}\n`;
            comparison.quantityChanges.slice(0, 30).forEach(item => {
                const direction = item.change > 0 ? 'increased' : 'decreased';
                report += `  - ${item.title} - Size ${item.size}: ${item.previousQuantity} -> ${item.quantity} (${direction} by ${Math.abs(item.change)})\n`;
            });
            if (comparison.stats.changed > 30) {
                report += `  ... and ${comparison.stats.changed - 30} more\n`;
            }
        }
        
        return report;
    },
    
    generateUpdatedCSV() {
        if (!this.todayInventory) {
            return null;
        }
        
        const comparison = this.compareInventories();
        if (!comparison.hasComparison) {
            return null;
        }
        
        // Create CSV with discontinued products set to 0
        const allRows = [];
        
        // Add today's inventory
        for (const item of Object.values(this.todayInventory)) {
            allRows.push({
                Handle: item.handle,
                Title: item.title,
                'Option1 Name': 'Size',
                'Option1 Value': item.size,
                'Option2 Name': '',
                'Option2 Value': '',
                'Option3 Name': '',
                'Option3 Value': '',
                SKU: item.sku,
                Barcode: '',
                'HS Code': '',
                COO: '',
                Location: 'Needham',
                'Bin name': '',
                'Incoming (not editable)': '',
                'Unavailable (not editable)': '',
                'Committed (not editable)': '',
                'Available (not editable)': '',
                'On hand (current)': '',
                'On hand (new)': item.quantity
            });
        }
        
        // Add discontinued products with 0 quantity
        for (const item of comparison.discontinued) {
            allRows.push({
                Handle: item.handle,
                Title: item.title,
                'Option1 Name': 'Size',
                'Option1 Value': item.size,
                'Option2 Name': '',
                'Option2 Value': '',
                'Option3 Name': '',
                'Option3 Value': '',
                SKU: item.sku,
                Barcode: '',
                'HS Code': '',
                COO: '',
                Location: 'Needham',
                'Bin name': '',
                'Incoming (not editable)': '',
                'Unavailable (not editable)': '',
                'Committed (not editable)': '',
                'Available (not editable)': '',
                'On hand (current)': '',
                'On hand (new)': 0
            });
        }
        
        console.log(`Generated CSV with ${allRows.length} rows (${this.todayInventory ? Object.keys(this.todayInventory).length : 0} current + ${comparison.discontinued.length} discontinued)`);
        
        return Papa.unparse(allRows, {
            quotes: true,
            quoteChar: '"',
            delimiter: ','
        });
    }
};
