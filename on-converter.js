// ON Running Converter - Processes scraper CSVs with existing handle preservation
// Modeled after hoka-converter.js flow
// Option2 (Color) is intentionally blanked in inventory CSV output —
// Shopify matches variants by Handle + Option1 (Size) only.

var OnConverter = {
    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,

    // ========== EXISTING HANDLES MAP ==========
    existingHandles: {
        'ON-3ME10120664-WHI': 'on-mens-cloudmonster-2-whi',
        'ON-3ME10121197-BLA': 'on-mens-cloudmonster-2-bla',
        'ON-3ME10122903-TEM': 'on-mens-cloudmonster-2-tem',
        'ON-3ME10123198-GLA': 'on-mens-cloudmonster-2-gla',
        'ON-3ME10132535-BLA': 'on-mens-cloudmonster-hyper-1-bla',
        'ON-3ME10133205-GLA': 'on-mens-cloudmonster-hyper-1-gla',
        'ON-3ME10134323-FAD': 'on-mens-cloudmonster-hyper-1-fad',
        'ON-3ME10140264-ECL': 'on-mens-cloudrunner-2-ecl',
        'ON-3ME10140622-FRO': 'on-mens-cloudrunner-2-fro',
        'ON-3ME10143194-ALL': 'on-mens-cloudrunner-2-all',
        'ON-3ME10144180-PEA': 'on-mens-cloudrunner-2-pea',
        'ON-3ME10144284-ROC': 'on-mens-cloudrunner-2-roc',
        'ON-3ME10152130-MAG': 'on-mens-cloudrunner-2-waterproof-mag',
        'ON-3ME10154285-ECL': 'on-mens-cloudrunner-2-waterproof-ecl',
        'ON-3ME10320264-ECL': 'on-mens-cloudrunner-2-wide-ecl',
        'ON-3ME10324180-PEA': 'on-mens-cloudrunner-2-wide-pea',
        'ON-3ME30010299-BLA': 'on-mens-cloudflyer-5-bla',
        'ON-3ME30012774-GLA': 'on-mens-cloudflyer-5-gla',
        'ON-3ME30020106-BLA': 'on-mens-cloudsurfer-next-1-bla',
        'ON-3ME30021067-GLA': 'on-mens-cloudsurfer-next-1-gla',
        'ON-3ME30021200-WHI': 'on-mens-cloudsurfer-next-1-whi',
        'ON-3ME30022906-IVO': 'on-mens-cloudsurfer-next-1-ivo',
        'ON-3ME30024476-SAI': 'on-mens-cloudsurfer-next-1-sai',
        'ON-3ME30480299-BLA': 'on-mens-cloudboom-strike-1-bla',
        'ON-3ME30483195-WHI': 'on-mens-cloudboom-strike-1-whi',
        'ON-3ME30483331-LIM': 'on-mens-cloudboom-strike-1-lim',
        'ON-3MF10061043-BLA': 'on-mens-cloud-6-wp-bla',
        'ON-3MF10063563-PEL': 'on-mens-cloud-6-wp-pel',
        'ON-3MF10070070-GLA': 'on-mens-cloud-6-gla',
        'ON-3MF10070299-BLA': 'on-mens-cloud-6-bla',
        'ON-3MF10070656-OLI': 'on-mens-cloud-6-oli',
        'ON-3MF10070692-MID': 'on-mens-cloud-6-mid',
        'ON-3MF10070755-PEA': 'on-mens-cloud-6-pea',
        'ON-3MF10071043-BLA': 'on-mens-cloud-6-bla',
        'ON-3MF10071200-WHI': 'on-mens-cloud-6-whi',
        'ON-3MF10071508-CHA': 'on-mens-cloud-6-cha',
        'ON-3MF10072634-MUL': 'on-mens-cloud-6-mul',
        'ON-3MF10111043-BLA': 'on-mens-cloudflow-5-bla',
        'ON-3MF10112929-WHI': 'on-mens-cloudflow-5-whi',
        'ON-3MF10113149-TAN': 'on-mens-cloudflow-5-tan',
        'ON-3MF10113295-ALL': 'on-mens-cloudflow-5-all',
        'ON-3MF10113306-ARC': 'on-mens-cloudflow-5-arc',
        'ON-3MF10121043-BLA': 'on-mens-cloudsurfer-2-bla',
        'ON-3MF10123126-TAN': 'on-mens-cloudsurfer-2-tan',
        'ON-3MF10123205-GLA': 'on-mens-cloudsurfer-2-gla',
        'ON-3MF10123334-IVO': 'on-mens-cloudsurfer-2-ivo',
        'ON-3MF10124048-TRU': 'on-mens-cloudsurfer-2-tru',
        'ON-3MF10124750-SAI': 'on-mens-cloudsurfer-2-sai',
        'ON-3MF10130106-BLA': 'on-mens-cloudswift-4-bla',
        'ON-3MF10131014-ALL': 'on-mens-cloudswift-4-all',
        'ON-3MF10131200-WHI': 'on-mens-cloudswift-4-whi',
        'ON-3MF10134320-STO': 'on-mens-cloudswift-4-sto',
        'ON-3MF10134641-FLI': 'on-mens-cloudswift-4-fli',
        'ON-3MF30220106-BLA': 'on-mens-cloudsurfer-trail-2-bla',
        'ON-3MF30223651-ROC': 'on-mens-cloudsurfer-trail-2-roc',
        'ON-3MF30430106-BLA': 'on-mens-cloudsurfer-max-1-bla',
        'ON-3MF30760117-GLA': 'on-mens-cloudflow-5-gla',
        'ON-3MG10050656-OLI': 'on-mens-cloudmonster-3-olive-eclipse',
        'ON-3MG10050726-ECL': 'on-mens-cloudmonster-3-eclipse-frost',
        'ON-3MG10053388-ECL': 'on-mens-cloudmonster-3-eclipse-ivory',
        'ON-3MG10054726-ICE': 'on-mens-cloudmonster-3-iceberg-ivory',
        'ON-3MG10054857-ROC': 'on-mens-cloudmonster-3-rock-silver',
        'ON-3MG10054859-LIM': 'on-mens-cloudmonster-3-limelight-seedling',
        'ON-3MG10054887-TWI': 'on-mens-cloudmonster-3-twilight-white',
        'ON-3MG10070813-WHI': 'on-mens-runner-cloudrunner-3-whi',
        'ON-3MG10071043-BLA': 'on-mens-runner-cloudrunner-3-bla',
        'ON-3MG10071430-BLA': 'on-mens-runner-cloudrunner-3-bla',
        'ON-3MG10071536-GLA': 'on-mens-runner-cloudrunner-3-gla',
        'ON-3MG10074422-TIN': 'on-mens-runner-cloudrunner-3-tin',
        'ON-3MG10074751-LIN': 'on-mens-runner-cloudrunner-3-lin',
        'ON-3MG10090813-WHI': 'on-mens-runner-cloudrunner-3-wide-whi',
        'ON-3MG10091043-BLA': 'on-mens-runner-cloudrunner-3-wide-bla',
        'ON-3MG10430070-GLA': 'on-mens-cloud-6-wide-gla',
        'ON-3MG10430299-BLA': 'on-mens-cloud-6-wide-bla',
        'ON-3MG10431043-BLA': 'on-mens-cloud-6-wide-bla',
        'ON-3MG10431200-WHI': 'on-mens-cloud-6-wide-whi',
        'ON-3MG10934859-LIM': 'on-mens-cloudmonster-3-wide-limelight-seedling',
        'ON-3MG10934887-TWI': 'on-mens-cloudmonster-3-wide-twilight-white',
        'ON-3WE10113373-NIM': 'on-womens-cloudmonster-2-nim',
        'ON-3WE10133161-SIL': 'on-womens-cloudrunner-2-sil',
        'ON-3WE10140929-IRO': 'on-womens-cloudrunner-2-waterproof-iro',
        'ON-3WE10142130-MAG': 'on-womens-cloudrunner-2-waterproof-mag',
        'ON-3WE10144286-SAN': 'on-womens-cloudrunner-2-waterproof-san',
        'ON-3WE10340264-ECL': 'on-womens-cloudrunner-2-wide-ecl',
        'ON-3WE10342264-IVO': 'on-womens-cloudrunner-2-wide-ivo',
        'ON-3WE30040299-BLA': 'on-womens-cloudflyer-5-bla',
        'ON-3WE30042774-GLA': 'on-womens-cloudflyer-5-gla',
        'ON-3WE30050106-BLA': 'on-womens-cloudsurfer-next-1-bla',
        'ON-3WE30051200-WHI': 'on-womens-cloudsurfer-next-1-whi',
        'ON-3WE30052050-IVO': 'on-womens-cloudsurfer-next-1-ivo',
        'ON-3WE30054292-DEW': 'on-womens-cloudsurfer-next-1-dew',
        'ON-3WE30054721-PEO': 'on-womens-cloudsurfer-next-1-peo',
        'ON-3WE30470299-BLA': 'on-womens-cloudboom-strike-1-bla',
        'ON-3WE30473331-LIM': 'on-womens-cloudboom-strike-1-lim',
        'ON-3WF10051043-BLA': 'on-womens-cloud-6-wp-bla',
        'ON-3WF10053037-MAU': 'on-womens-cloud-6-wp-mau',
        'ON-3WF10060070-GLA': 'on-womens-cloud-6-gla',
        'ON-3WF10060755-PEA': 'on-womens-cloud-6-pea',
        'ON-3WF10061043-BLA': 'on-womens-cloud-6-bla',
        'ON-3WF10061085-NIM': 'on-womens-cloud-6-nim',
        'ON-3WF10061200-WHI': 'on-womens-cloud-6-whi',
        'ON-3WF10061508-CHA': 'on-womens-cloud-6-cha',
        'ON-3WF10064296-ORC': 'on-womens-cloud-6-orc',
        'ON-3WF10064297-CAS': 'on-womens-cloud-6-cas',
        'ON-3WF10091043-BLA': 'on-womens-cloudflow-5-bla',
        'ON-3WF10092580-FOG': 'on-womens-cloudflow-5-fog',
        'ON-3WF10092929-WHI': 'on-womens-cloudflow-5-whi',
        'ON-3WF10093149-TAN': 'on-womens-cloudflow-5-tan',
        'ON-3WF10093306-ARC': 'on-womens-cloudflow-5-arc',
        'ON-3WF10100171-GLA': 'on-womens-cloudsurfer-2-gla',
        'ON-3WF10101043-BLA': 'on-womens-cloudsurfer-2-bla',
        'ON-3WF10102143-PEA': 'on-womens-cloudsurfer-2-pea',
        'ON-3WF10103126-TAN': 'on-womens-cloudsurfer-2-tan',
        'ON-3WF10103334-IVO': 'on-womens-cloudsurfer-2-ivo',
        'ON-3WF10110299-BLA': 'on-womens-cloudswift-4-bla',
        'ON-3WF10111200-WHI': 'on-womens-cloudswift-4-whi',
        'ON-3WF10113106-CRE': 'on-womens-cloudswift-4-cre',
        'ON-3WF10113219-WOL': 'on-womens-cloudswift-4-wol',
        'ON-3WF10113220-MET': 'on-womens-cloudswift-4-met',
        'ON-3WF10114061-LIL': 'on-womens-cloudswift-4-lil',
        'ON-3WF10114295-PEA': 'on-womens-cloudswift-4-pea',
        'ON-3WF10114752-HEA': 'on-womens-cloudswift-4-hea',
        'ON-3WF10451200-WHI': 'on-womens-cloudswift-4-ad-whi',
        'ON-3WF30101043-BLA': 'on-womens-cloudsurfer-trail-2-bla',
        'ON-3WF30102647-IRO': 'on-womens-cloudsurfer-trail-2-iro',
        'ON-3WF30103660-GLA': 'on-womens-cloudsurfer-trail-2-gla',
        'ON-3WF30111043-BLA': 'on-womens-po-cloudultra-3-bla',
        'ON-3WF30220106-BLA': 'on-womens-cloudsurfer-max-1-bla',
        'ON-3WF30221200-WHI': 'on-womens-cloudsurfer-max-1-whi',
        'ON-3WF30224289-HOR': 'on-womens-cloudsurfer-max-1-hor',
        'ON-3WF30224726-ICE': 'on-womens-cloudsurfer-max-1-ice',
        'ON-3WF30224733-SAI': 'on-womens-cloudsurfer-max-1-sai',
        'ON-3WF30510117-GLA': 'on-womens-cloudflow-5-gla',
        'ON-3WG10030664-WHI': 'on-womens-cloudmonster-3-white-frost',
        'ON-3WG10033388-ECL': 'on-womens-cloudmonster-3-eclipse-ivory',
        'ON-3WG10034096-CIN': 'on-womens-cloudmonster-3-cinder-ivory',
        'ON-3WG10034590-SAK': 'on-womens-cloudmonster-3-sakura-ivory',
        'ON-3WG10034859-LIM': 'on-womens-cloudmonster-3-limelight-seedling',
        'ON-3WG10034861-TRU': 'on-womens-cloudmonster-3-truffle-ivory',
        'ON-3WG10034888-NEB': 'on-womens-cloudmonster-3-nebula-ivory',
        'ON-3WG10050924-WHI': 'on-womens-runner-cloudrunner-3-whi',
        'ON-3WG10051043-BLA': 'on-womens-runner-cloudrunner-3-bla',
        'ON-3WG10051421-FRO': 'on-womens-runner-cloudrunner-3-fro',
        'ON-3WG10054674-HEA': 'on-womens-runner-cloudrunner-3-hea',
        'ON-3WG10054686-PEA': 'on-womens-runner-cloudrunner-3-pea',
        'ON-3WG10054723-SEE': 'on-womens-runner-cloudrunner-3-see',
        'ON-3WG10070924-WHI': 'on-womens-runner-cloudrunner-3-wide-whi',
        'ON-3WG10071043-BLA': 'on-womens-runner-cloudrunner-3-wide-bla',
        'ON-3WG10360299-BLA': 'on-womens-cloud-6-wide-bla',
        'ON-3WG10360755-PEA': 'on-womens-cloud-6-wide-pea',
        'ON-3WG10361043-BLA': 'on-womens-cloud-6-wide-bla',
        'ON-3WG10361200-WHI': 'on-womens-cloud-6-wide-whi',
        'ON-3WG10834859-LIM': 'on-womens-cloudmonster-3-wide-limelight-seedling',
        'ON-3WG10834888-NEB': 'on-womens-cloudmonster-3-wide-nebula-ivory',
    },

    // Extract SKU base: ON-3WF10060755-PEA-5 -> ON-3WF10060755-PEA
    getSkuBase: function(sku) {
        if (!sku) return '';
        var parts = sku.split('-');
        for (var i = parts.length - 1; i >= 0; i--) {
            if (/^\d+$/.test(parts[i])) {
                return parts.slice(0, i).join('-');
            }
        }
        return sku;
    },

    // Get handle: check existing map first, generate unified handle if not found
    getProductHandle: function(skuBase, title, gender, colorName, modelName) {
        if (this.existingHandles[skuBase]) {
            return this.existingHandles[skuBase];
        }

        var genderSlug = 'unisex';
        if (/women/i.test(gender)) genderSlug = 'womens';
        else if (/men/i.test(gender)) genderSlug = 'mens';

        var modelSlug = (modelName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        var colorSlug = (colorName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        var handle = 'on-' + genderSlug + '-' + modelSlug + '-' + colorSlug;
        return handle.replace(/-+/g, '-').replace(/-$/, '');
    },

    // Parse title: "ON Women's Cloud | Cloud 6 - Pearl White"
    parseTitle: function(title) {
        if (!title) return { gender: '', model: '', color: '', category: '' };

        var gender = '';
        if (title.indexOf("Women's") !== -1) gender = "Women's";
        else if (title.indexOf("Men's") !== -1) gender = "Men's";
        else gender = 'Unisex';

        var model = '';
        var color = '';
        var category = '';

        // Use LAST pipe so multi-pipe titles (e.g. "PTR | X | Cloud X 4") resolve to clean model
        var lastPipeIdx = title.lastIndexOf('|');
        var firstPipeIdx = title.indexOf('|');
        var dashIdx = title.lastIndexOf(' - ');

        if (lastPipeIdx !== -1 && dashIdx !== -1 && dashIdx > lastPipeIdx) {
            model = title.substring(lastPipeIdx + 1, dashIdx).trim();
            color = title.substring(dashIdx + 3).trim();
        } else if (lastPipeIdx !== -1) {
            model = title.substring(lastPipeIdx + 1).trim();
        } else if (dashIdx !== -1) {
            model = title.substring(0, dashIdx).replace(/^ON\s+(Men's|Women's)\s+/i, '').trim();
            color = title.substring(dashIdx + 3).trim();
        }

        if (firstPipeIdx !== -1) {
            var beforeFirstPipe = title.substring(0, firstPipeIdx).trim();
            category = beforeFirstPipe.replace(/^ON\s+(Men's|Women's|Unisex)\s*/i, '').trim();
        }

        return { gender: gender, model: model, color: color, category: category };
    },

    // Scan both files and return product list for picker
    scanFiles: function(file1, file2) {
        var self = this;

        return new Promise(function(resolve, reject) {
            var promises = [];
            if (file1) promises.push(file1.text());
            if (file2) promises.push(file2.text());

            Promise.all(promises).then(function(texts) {
                var allRows = [];

                texts.forEach(function(csvText) {
                    var parsed = Papa.parse(csvText, { header: true });
                    var rows = parsed.data.filter(function(row) {
                        return row.Handle && row.Handle.trim() !== '';
                    });
                    allRows = allRows.concat(rows);
                });

                var productsByModel = new Map();

                allRows.forEach(function(row) {
                    var titleInfo = self.parseTitle(row.Title || '');
                    var sku = row.SKU || '';
                    var skuBase = self.getSkuBase(sku);
                    var handle = self.getProductHandle(skuBase, row.Title, titleInfo.gender, titleInfo.color, titleInfo.model);
                    var qty = parseInt(row['On hand (new)'] || '0') || 0;
                    var modelKey = titleInfo.model || 'Unknown';

                    if (!productsByModel.has(modelKey)) {
                        productsByModel.set(modelKey, {
                            model: modelKey,
                            gender: titleInfo.gender,
                            category: titleInfo.category,
                            colorways: new Map(),
                            totalRows: 0,
                            totalInventory: 0
                        });
                    }

                    var modelData = productsByModel.get(modelKey);
                    modelData.totalRows++;
                    modelData.totalInventory += qty;

                    if (!modelData.colorways.has(handle)) {
                        modelData.colorways.set(handle, {
                            handle: handle,
                            title: row.Title || '',
                            color: titleInfo.color,
                            rows: 0,
                            inventory: 0
                        });
                    }

                    var cw = modelData.colorways.get(handle);
                    cw.rows++;
                    cw.inventory += qty;
                });

                var products = [];
                productsByModel.forEach(function(data) {
                    products.push({
                        name: data.model,
                        gender: data.gender,
                        category: data.category,
                        colorways: Array.from(data.colorways.values()),
                        rowCount: data.totalRows,
                        totalInventory: data.totalInventory
                    });
                });

                products.sort(function(a, b) {
                    var catComp = (a.category || '').localeCompare(b.category || '');
                    if (catComp !== 0) return catComp;
                    return a.name.localeCompare(b.name);
                });

                self.scannedProducts = products;
                self._rawRows = allRows;
                resolve(products);
            }).catch(reject);
        });
    },

    // Convert: process files, apply handle replacement, filter by picker
    convert: function(file1, file2) {
        var self = this;

        return new Promise(function(resolve, reject) {
            var promises = [];
            if (file1) promises.push(file1.text());
            if (file2) promises.push(file2.text());

            Promise.all(promises).then(function(texts) {
                var allRows = [];

                texts.forEach(function(csvText) {
                    var parsed = Papa.parse(csvText, { header: true });
                    var rows = parsed.data.filter(function(row) {
                        return row.Handle && row.Handle.trim() !== '';
                    });
                    allRows = allRows.concat(rows);
                });

                var inventory = [];
                var productVariantData = [];

                allRows.forEach(function(row) {
                    var titleInfo = self.parseTitle(row.Title || '');
                    var sku = row.SKU || '';
                    var skuBase = self.getSkuBase(sku);
                    var handle = self.getProductHandle(skuBase, row.Title, titleInfo.gender, titleInfo.color, titleInfo.model);
                    var modelKey = titleInfo.model || 'Unknown';

                    if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) {
                        return;
                    }

                    var qty = row['On hand (new)'] || '0';

                    var inventoryRow = {
                        'Handle': handle,
                        'Title': row.Title || '',
                        'Option1 Name': row['Option1 Name'] || 'Size',
                        'Option1 Value': row['Option1 Value'] || '',
                        'Option2 Name': '',
                        'Option2 Value': '',
                        'Option3 Name': '',
                        'Option3 Value': '',
                        'SKU': sku,
                        'Barcode': row['Barcode'] || '',
                        'Location': row['Location'] || 'Needham',
                        'On hand (new)': qty
                    };

                    inventory.push(inventoryRow);

                    productVariantData.push([inventoryRow, {
                        handle: handle,
                        title: row.Title || '',
                        gender: titleInfo.gender,
                        model: titleInfo.model,
                        color: titleInfo.color,
                        category: titleInfo.category,
                        sku: sku,
                        skuBase: skuBase,
                        size: row['Option1 Value'] || '',
                        quantity: qty,
                        barcode: row['Barcode'] || ''
                    }]);
                });

                self.inventoryData = inventory;
                self.productVariantData = productVariantData;
                resolve(inventory);
            }).catch(reject);
        });
    },

    // Generate Shopify inventory CSV
    generateInventoryCSV: function() {
        var inventoryHeaders = ['Handle', 'Title', '"Option1 Name"', '"Option1 Value"', '"Option2 Name"', '"Option2 Value"',
            '"Option3 Name"', '"Option3 Value"', 'SKU', 'Barcode', '"HS Code"', 'COO', 'Location', '"Bin name"',
            '"Incoming (not editable)"', '"Unavailable (not editable)"', '"Committed (not editable)"',
            '"Available (not editable)"', '"On hand (current)"', '"On hand (new)"'];

        var csvRows = [inventoryHeaders.join(',')];

        this.inventoryData.forEach(function(row) {
            var csvRow = [
                row.Handle,
                '"' + (row.Title || '').replace(/"/g, '""') + '"',
                row['Option1 Name'] || 'Size',
                row['Option1 Value'] || '',
                '',
                '',
                '',
                '',
                row.SKU || '',
                row.Barcode || '',
                '', '',
                row.Location || 'Needham',
                '', '', '', '', '', '',
                row['On hand (new)'] || '0'
            ];
            csvRows.push(csvRow.join(','));
        });

        return csvRows.join('\n');
    },

    // Clean title: strip pipe-separated categories for Shopify display
    cleanTitle: function(title) {
        if (!title || title.indexOf('|') === -1) return title;

        var prefix = '';
        var rest = title;
        var genderMatch = title.match(/^(ON\s+(?:Women's|Men's|Unisex)\s+)/i);
        if (genderMatch) {
            prefix = genderMatch[1];
            rest = title.substring(prefix.length);
        }

        var lastPipeIdx = rest.lastIndexOf('|');
        if (lastPipeIdx !== -1) {
            var modelAndColor = rest.substring(lastPipeIdx + 1).trim();
            return prefix + modelAndColor;
        }

        return title;
    },

    // Clean handle: generate from cleaned title
    cleanHandle: function(handle, cleanedTitle) {
        if (!cleanedTitle) return handle;
        return cleanedTitle
            .toLowerCase()
            .replace(/['']/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    },

    generateNewProductCSV: function(comparison) {
        if (!comparison) return null;

        var self = this;
        var newHandles = new Set();
        if (comparison.newProducts) {
            comparison.newProducts.forEach(function(p) { newHandles.add(p.handle); });
        }
        if (comparison.newColorways) {
            comparison.newColorways.forEach(function(c) { newHandles.add(c.handle); });
        }

        if (newHandles.size === 0) return null;
        if (!this.productVariantData || this.productVariantData.length === 0) return null;

        var headers = [
            'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
            'Published on online store', 'Status',
            'SKU', 'Barcode',
            'Option1 name', 'Option1 value', 'Option1 Linked To',
            'Option2 name', 'Option2 value', 'Option2 Linked To',
            'Option3 name', 'Option3 value', 'Option3 Linked To',
            'Price', 'Compare-at price', 'Cost per item',
            'Charge tax', 'Tax code',
            'Unit price total measure', 'Unit price total measure unit',
            'Unit price base measure', 'Unit price base measure unit',
            'Inventory tracker', 'Inventory quantity', 'Continue selling when out of stock',
            'Weight value (grams)', 'Weight unit for display',
            'Requires shipping', 'Fulfillment service',
            'Product image URL', 'Image position', 'Image alt text', 'Variant image URL',
            'Gift card',
            'SEO title', 'SEO description',
            'Color (product.metafields.shopify.color-pattern)',
            'Google Shopping / Google product category',
            'Google Shopping / Gender', 'Google Shopping / Age group',
            'Google Shopping / Manufacturer part number (MPN)',
            'Google Shopping / Ad group name', 'Google Shopping / Ads labels',
            'Google Shopping / Condition', 'Google Shopping / Custom product',
            'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
            'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3',
            'Google Shopping / Custom label 4'
        ];

        var productGroups = new Map();

        this.productVariantData.forEach(function(entry) {
            var variantData = entry[1];
            if (!newHandles.has(variantData.handle)) return;

            if (!productGroups.has(variantData.handle)) {
                productGroups.set(variantData.handle, {
                    handle: variantData.handle,
                    title: variantData.title,
                    model: variantData.model,
                    gender: variantData.gender,
                    color: variantData.color,
                    category: variantData.category,
                    variants: []
                });
            }

            productGroups.get(variantData.handle).variants.push({
                size: variantData.size,
                sku: variantData.sku,
                barcode: variantData.barcode || '',
                quantity: variantData.quantity
            });
        });

        if (productGroups.size === 0) return null;

        var csvRows = [];

        productGroups.forEach(function(product) {
            var gGender = 'Unisex';
            if (product.gender === "Men's") gGender = 'Male';
            else if (product.gender === "Women's") gGender = 'Female';

            var cleanedTitle = self.cleanTitle(product.title);
            var cleanedHandle = self.cleanHandle(product.handle, cleanedTitle);

            var tags = ['ON Running', product.model];
            if (product.gender !== 'Unisex') tags.push(product.gender.replace("'s", ''));
            if (product.category) tags.push(product.category);

            var productType = "Unisex Shoes";
            if (product.gender === "Men's") productType = "Men's Shoes";
            else if (product.gender === "Women's") productType = "Women's Shoes";

            product.variants.forEach(function(variant, idx) {
                var row = {};

                if (idx === 0) {
                    row['Title'] = cleanedTitle;
                    row['URL handle'] = cleanedHandle;
                    row['Description'] = '';
                    row['Vendor'] = 'ON Running';
                    row['Product category'] = 'Apparel & Accessories > Shoes';
                    row['Type'] = productType;
                    row['Tags'] = tags.join(', ');
                    row['Published on online store'] = 'FALSE';
                    row['Status'] = 'Draft';
                    row['Option1 name'] = 'Size';
                    row['SEO title'] = cleanedTitle;
                    row['SEO description'] = cleanedTitle;
                    row['Google Shopping / Google product category'] = 'Apparel & Accessories > Shoes';
                    row['Google Shopping / Gender'] = gGender;
                    row['Google Shopping / Age group'] = 'Adult (13+ years old)';
                    row['Google Shopping / Condition'] = 'New';
                    row['Google Shopping / Custom product'] = 'FALSE';
                    row['Google Shopping / Custom label 0'] = product.model;
                } else {
                    row['URL handle'] = cleanedHandle;
                }

                row['Option1 value'] = variant.size;
                row['SKU'] = variant.sku;
                row['Barcode'] = variant.barcode;
                row['Price'] = '';
                row['Charge tax'] = 'TRUE';
                row['Inventory tracker'] = 'shopify';
                row['Inventory quantity'] = variant.quantity;
                row['Continue selling when out of stock'] = 'DENY';
                row['Requires shipping'] = 'TRUE';
                row['Fulfillment service'] = 'manual';
                row['Gift card'] = 'FALSE';

                csvRows.push(row);
            });
        });

        var headerLine = headers.map(function(h) { return '"' + h.replace(/"/g, '""') + '"'; }).join(',');
        var lines = [headerLine];

        csvRows.forEach(function(row) {
            var values = headers.map(function(h) {
                var val = row[h] !== undefined ? String(row[h]) : '';
                return '"' + val.replace(/"/g, '""') + '"';
            });
            lines.push(values.join(','));
        });

        return lines.join('\n');
    }
};