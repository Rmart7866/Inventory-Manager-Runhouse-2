// ON Running Converter - Processes scraper CSVs with existing handle preservation
// Modeled after hoka-converter.js flow

var OnConverter = {
    inventoryData: [],
    productVariantData: [],
    selectedProducts: new Set(),
    scannedProducts: [],
    _knownProducts: null,

    // ========== EXISTING HANDLES MAP ==========
    // Maps SKU base (without size) to existing Shopify handle
    // Key: ON-3WF10060755-PEA  Value: on-womens-cloud-|-cloud-6-pea
    existingHandles: {
        'ON-3MF10061043-BLA': 'on-mens-cloud-|-cloud-6-wp-bla',
        'ON-3MF10062231-OLI': 'on-mens-cloud-|-cloud-6-wp-oli',
        'ON-3MF10063563-PEL': 'on-mens-cloud-|-cloud-6-wp-pel',
        'ON-3MF10070070-GLA': 'on-mens-cloud-|-cloud-6-gla',
        'ON-3MF10070299-BLA': 'on-mens-cloud-|-cloud-6-bla',
        'ON-3MF10070692-MID': 'on-mens-cloud-|-cloud-6-mid',
        'ON-3MF10071043-BLA': 'on-mens-cloud-|-cloud-6-bla',
        'ON-3MF10071200-WHI': 'on-mens-cloud-|-cloud-6-whi',
        'ON-3MF10072634-MUL': 'on-mens-cloud-|-cloud-6-mul',
        'ON-3MF10074874-CHA': 'on-mens-cloud-|-cloud-6-cha',
        'ON-3MF10111043-BLA': 'on-mens-flow-|-cloudflow-5-bla',
        'ON-3MF10113295-ALL': 'on-mens-flow-|-cloudflow-5-all',
        'ON-3MF10120074-BLA': 'on-mens-surfer-|-cloudsurfer-2-bla',
        'ON-3MF10121043-BLA': 'on-mens-surfer-|-cloudsurfer-2-bla',
        'ON-3MF10123334-IVO': 'on-mens-surfer-|-cloudsurfer-2-ivo',
        'ON-3MF10124749-IVO': 'on-mens-surfer-|-cloudsurfer-2-ivo',
        'ON-3MF10124750-SAI': 'on-mens-surfer-|-cloudsurfer-2-sai',
        'ON-3MF10130106-BLA': 'on-mens-swift-|-cloudswift-4-bla',
        'ON-3MF10131014-ALL': 'on-mens-swift-|-cloudswift-4-all',
        'ON-3MF10131200-WHI': 'on-mens-swift-|-cloudswift-4-whi',
        'ON-3MF10134320-STO': 'on-mens-swift-|-cloudswift-4-sto',
        'ON-3MF10134641-FLI': 'on-mens-swift-|-cloudswift-4-fli',
        'ON-3MF10260397-BLA': 'on-mens-ptr-|-x-|-cloud-x-4-ad-bla',
        'ON-3MF30174749-IVO': 'on-mens-po-|-ultra-|-cloudultra-pro-1-ivo',
        'ON-3MF30174789-PEA': 'on-mens-po-|-ultra-|-cloudultra-pro-1-pea',
        'ON-3MF30220106-BLA': 'on-mens-surfer-|-cloudsurfer-trail-2-bla',
        'ON-3MF30223651-ROC': 'on-mens-surfer-|-cloudsurfer-trail-2-roc',
        'ON-3MF30224792-SAF': 'on-mens-surfer-|-cloudsurfer-trail-2-saf',
        'ON-3MF30224793-CHA': 'on-mens-surfer-|-cloudsurfer-trail-2-cha',
        'ON-3MF30231043-BLA': 'on-mens-po-|-ultra-|-cloudultra-3-bla',
        'ON-3MF30234788-ICE': 'on-mens-po-|-ultra-|-cloudultra-3-ice',
        'ON-3MF30234882-LIN': 'on-mens-po-|-ultra-|-cloudultra-3-lin',
        'ON-3MF30241043-BLA': 'on-mens-surfer-|-cloudsurfer-trail-2-wp-bla',
        'ON-3MF30243318-CIN': 'on-mens-surfer-|-cloudsurfer-trail-2-wp-cin',
        'ON-3MF30244725-GHO': 'on-mens-surfer-|-cloudsurfer-trail-2-wp-gho',
        'ON-3MF30310462-WHI': 'on-mens-boom-|-cloudboom-max-1-whi',
        'ON-3MF30430106-BLA': 'on-mens-surfer-|-cloudsurfer-max-1-bla',
        'ON-3MF30431200-WHI': 'on-mens-surfer-|-cloudsurfer-max-1-whi',
        'ON-3MF30434287-DUS': 'on-mens-surfer-|-cloudsurfer-max-1-dus',
        'ON-3MF30434727-ICE': 'on-mens-surfer-|-cloudsurfer-max-1-ice',
        'ON-3MF30434828-WOL': 'on-mens-surfer-|-cloudsurfer-max-1-wol',
        'ON-3MF30600202-WHI': 'on-mens-ptr-|-pulse-|-cloudpulse-next-1-whi',
        'ON-3MF30603404-BLA': 'on-mens-ptr-|-pulse-|-cloudpulse-next-1-bla',
        'ON-3MF30604771-SHA': 'on-mens-ptr-|-pulse-|-cloudpulse-next-1-sha',
        'ON-3MF30800106-BLA': 'on-mens-surfer-|-cloudsurfer-max-1-bla',
        'ON-3MF30801200-WHI': 'on-mens-surfer-|-cloudsurfer-max-1-whi',
        'ON-3MF31020074-BLA': 'on-mens-surfer-|-cloudsurfer-2-bla',
        'ON-3MF31021043-BLA': 'on-mens-surfer-|-cloudsurfer-2-bla',
        'ON-3MF31023334-IVO': 'on-mens-surfer-|-cloudsurfer-2-ivo',
        'ON-3MG10430070-GLA': 'on-mens-cloud-|-cloud-6-gla',
        'ON-3MG10430299-BLA': 'on-mens-cloud-|-cloud-6-bla',
        'ON-3MG10431043-BLA': 'on-mens-cloud-|-cloud-6-bla',
        'ON-3MG10431200-WHI': 'on-mens-cloud-|-cloud-6-whi',
        'ON-3ME10120664-WHI': 'on-mens-monster-|-cloudmonster-2-whi',
        'ON-3ME10120777-BLA': 'on-mens-monster-|-cloudmonster-2-bla',
        'ON-3ME10121043-BLA': 'on-mens-monster-|-cloudmonster-2-bla',
        'ON-3ME10121197-BLA': 'on-mens-monster-|-cloudmonster-2-bla',
        'ON-3ME10122903-TEM': 'on-mens-monster-|-cloudmonster-2-tem',
        'ON-3ME10123198-GLA': 'on-mens-monster-|-cloudmonster-2-gla',
        'ON-3ME10132535-BLA': 'on-mens-monster-|-cloudmonster-hyper-1-bla',
        'ON-3ME10133205-GLA': 'on-mens-monster-|-cloudmonster-hyper-1-gla',
        'ON-3ME10134323-FAD': 'on-mens-monster-|-cloudmonster-hyper-1-fad',
        'ON-3ME10140264-ECL': 'on-mens-runner-|-cloudrunner-2-ecl',
        'ON-3ME10140622-FRO': 'on-mens-runner-|-cloudrunner-2-fro',
        'ON-3ME10143194-ALL': 'on-mens-runner-|-cloudrunner-2-all',
        'ON-3ME10144180-PEA': 'on-mens-runner-|-cloudrunner-2-pea',
        'ON-3ME10144284-ROC': 'on-mens-runner-|-cloudrunner-2-roc',
        'ON-3ME10152130-MAG': 'on-mens-runner-|-cloudrunner-2-waterproof-mag',
        'ON-3ME10153701-ECL': 'on-mens-runner-|-cloudrunner-2-waterproof-ecl',
        'ON-3ME10154285-ECL': 'on-mens-runner-|-cloudrunner-2-waterproof-ecl',
        'ON-3ME10320264-ECL': 'on-mens-runner-|-cloudrunner-2-ecl',
        'ON-3ME10324180-PEA': 'on-mens-runner-|-cloudrunner-2-pea',
        'ON-3ME30010299-BLA': 'on-mens-runner-|-cloudflyer-5-bla',
        'ON-3ME30012774-GLA': 'on-mens-runner-|-cloudflyer-5-gla',
        'ON-3ME30020106-BLA': 'on-mens-surfer-|-cloudsurfer-next-1-bla',
        'ON-3ME30021067-GLA': 'on-mens-surfer-|-cloudsurfer-next-1-gla',
        'ON-3ME30021200-WHI': 'on-mens-surfer-|-cloudsurfer-next-1-whi',
        'ON-3ME30022906-IVO': 'on-mens-surfer-|-cloudsurfer-next-1-ivo',
        'ON-3ME30024476-SAI': 'on-mens-surfer-|-cloudsurfer-next-1-sai',
        'ON-3ME30040106-BLA': 'on-mens-ptr-|-x-|-cloud-x-4-bla',
        'ON-3ME30040791-IVO': 'on-mens-ptr-|-x-|-cloud-x-4-ivo',
        'ON-3ME30043228-ALL': 'on-mens-ptr-|-x-|-cloud-x-4-all',
        'ON-3ME30044739-NAV': 'on-mens-ptr-|-x-|-cloud-x-4-nav',
        'ON-3ME30111472-GLA': 'on-mens-po-|-vista-|-cloudvista-2-gla',
        'ON-3ME30113323-CRE': 'on-mens-po-|-vista-|-cloudvista-2-cre',
        'ON-3ME30113427-IVO': 'on-mens-po-|-vista-|-cloudvista-2-ivo',
        'ON-3ME30113433-ECL': 'on-mens-po-|-vista-|-cloudvista-2-ecl',
        'ON-3ME30140106-BLA': 'on-mens-po-|-vista-|-cloudvista-2-waterproof-bla',
        'ON-3ME30141075-ICE': 'on-mens-po-|-vista-|-cloudvista-2-waterproof-ice',
        'ON-3ME30143172-FOG': 'on-mens-po-|-vista-|-cloudvista-2-waterproof-fog',
        'ON-3ME30410106-BLA': 'on-mens-nova-|-cloudnova-x-1-bla',
        'ON-3ME30413007-ALL': 'on-mens-nova-|-cloudnova-x-1-all',
        'ON-3ME30480299-BLA': 'on-mens-boom-|-cloudboom-strike-1-bla',
        'ON-3WF10051043-BLA': 'on-womens-cloud-|-cloud-6-wp-bla',
        'ON-3WF10053037-MAU': 'on-womens-cloud-|-cloud-6-wp-mau',
        'ON-3WF10060070-GLA': 'on-womens-cloud-|-cloud-6-gla',
        'ON-3WF10060299-BLA': 'on-womens-cloud-|-cloud-6-bla',
        'ON-3WF10060755-PEA': 'on-womens-cloud-|-cloud-6-pea',
        'ON-3WF10061043-BLA': 'on-womens-cloud-|-cloud-6-bla',
        'ON-3WF10061200-WHI': 'on-womens-cloud-|-cloud-6-whi',
        'ON-3WF10062566-CIN': 'on-womens-cloud-|-cloud-6-cin',
        'ON-3WF10064653-SAN': 'on-womens-cloud-|-cloud-6-san',
        'ON-3WF10091043-BLA': 'on-womens-flow-|-cloudflow-5-bla',
        'ON-3WF10092580-FOG': 'on-womens-flow-|-cloudflow-5-fog',
        'ON-3WF10101043-BLA': 'on-womens-surfer-|-cloudsurfer-2-bla',
        'ON-3WF10101057-IVO': 'on-womens-surfer-|-cloudsurfer-2-ivo',
        'ON-3WF10102143-PEA': 'on-womens-surfer-|-cloudsurfer-2-pea',
        'ON-3WF10103334-IVO': 'on-womens-surfer-|-cloudsurfer-2-ivo',
        'ON-3WF10104477-IVO': 'on-womens-surfer-|-cloudsurfer-2-ivo',
        'ON-3WF10110299-BLA': 'on-womens-swift-|-cloudswift-4-bla',
        'ON-3WF10111200-WHI': 'on-womens-swift-|-cloudswift-4-whi',
        'ON-3WF10113219-WOL': 'on-womens-swift-|-cloudswift-4-wol',
        'ON-3WF10114295-PEA': 'on-womens-swift-|-cloudswift-4-pea',
        'ON-3WF10114752-HEA': 'on-womens-swift-|-cloudswift-4-hea',
        'ON-3WF10172852-WHI': 'on-womens-ptr-|-x-|-cloud-x-4-ad-whi',
        'ON-3WF10451200-WHI': 'on-womens-swift-|-cloudswift-4-ad-whi',
        'ON-3WF30094749-IVO': 'on-womens-po-|-ultra-|-cloudultra-pro-1-ivo',
        'ON-3WF30094789-PEA': 'on-womens-po-|-ultra-|-cloudultra-pro-1-pea',
        'ON-3WF30101043-BLA': 'on-womens-surfer-|-cloudsurfer-trail-2-bla',
        'ON-3WF30102647-IRO': 'on-womens-surfer-|-cloudsurfer-trail-2-iro',
        'ON-3WF30103660-GLA': 'on-womens-surfer-|-cloudsurfer-trail-2-gla',
        'ON-3WF30104791-LIL': 'on-womens-surfer-|-cloudsurfer-trail-2-lil',
        'ON-3WF30111043-BLA': 'on-womens-po-|-ultra-|-cloudultra-3-bla',
        'ON-3WF30114788-ICE': 'on-womens-po-|-ultra-|-cloudultra-3-ice',
        'ON-3WF30114882-LIN': 'on-womens-po-|-ultra-|-cloudultra-3-lin',
        'ON-3WF30121043-BLA': 'on-womens-surfer-|-cloudsurfer-trail-2-wp-bla',
        'ON-3WF30124725-GHO': 'on-womens-surfer-|-cloudsurfer-trail-2-wp-gho',
        'ON-3WF30180462-WHI': 'on-womens-boom-|-cloudboom-max-1-whi',
        'ON-3WF30220106-BLA': 'on-womens-surfer-|-cloudsurfer-max-1-bla',
        'ON-3WF30221200-WHI': 'on-womens-surfer-|-cloudsurfer-max-1-whi',
        'ON-3WF30224289-HOR': 'on-womens-surfer-|-cloudsurfer-max-1-hor',
        'ON-3WF30224726-ICE': 'on-womens-surfer-|-cloudsurfer-max-1-ice',
        'ON-3WF30224733-SAI': 'on-womens-surfer-|-cloudsurfer-max-1-sai',
        'ON-3WF30320202-WHI': 'on-womens-ptr-|-pulse-|-cloudpulse-next-1-whi',
        'ON-3WF30323404-BLA': 'on-womens-ptr-|-pulse-|-cloudpulse-next-1-bla',
        'ON-3WF30324777-WOL': 'on-womens-ptr-|-pulse-|-cloudpulse-next-1-wol',
        'ON-3WF30570106-BLA': 'on-womens-surfer-|-cloudsurfer-max-1-bla',
        'ON-3WF30571200-WHI': 'on-womens-surfer-|-cloudsurfer-max-1-whi',
        'ON-3WF30771043-BLA': 'on-womens-surfer-|-cloudsurfer-2-bla',
        'ON-3WF30772143-PEA': 'on-womens-surfer-|-cloudsurfer-2-pea',
        'ON-3WF30773334-IVO': 'on-womens-surfer-|-cloudsurfer-2-ivo',
        'ON-3WG10360070-GLA': 'on-womens-cloud-|-cloud-6-gla',
        'ON-3WG10360299-BLA': 'on-womens-cloud-|-cloud-6-bla',
        'ON-3WG10360755-PEA': 'on-womens-cloud-|-cloud-6-pea',
        'ON-3WG10361043-BLA': 'on-womens-cloud-|-cloud-6-bla',
        'ON-3WG10361200-WHI': 'on-womens-cloud-|-cloud-6-whi',
        'ON-3WE10110106-BLA': 'on-womens-monster-|-cloudmonster-2-bla',
        'ON-3WE10110664-WHI': 'on-womens-monster-|-cloudmonster-2-whi',
        'ON-3WE10111197-BLA': 'on-womens-monster-|-cloudmonster-2-bla',
        'ON-3WE10113168-CRE': 'on-womens-monster-|-cloudmonster-2-cre',
        'ON-3WE10113202-IVO': 'on-womens-monster-|-cloudmonster-2-ivo',
        'ON-3WE10113373-NIM': 'on-womens-monster-|-cloudmonster-2-nim',
        'ON-3WE10123205-GLA': 'on-womens-monster-|-cloudmonster-hyper-1-gla',
        'ON-3WE10123344-RED': 'on-womens-monster-|-cloudmonster-hyper-1-red',
        'ON-3WE10123393-DEW': 'on-womens-monster-|-cloudmonster-hyper-1-dew',
        'ON-3WE10130264-ECL': 'on-womens-runner-|-cloudrunner-2-ecl',
        'ON-3WE10130622-FRO': 'on-womens-runner-|-cloudrunner-2-fro',
        'ON-3WE10133161-SIL': 'on-womens-runner-|-cloudrunner-2-sil',
        'ON-3WE10133195-WHI': 'on-womens-runner-|-cloudrunner-2-whi',
        'ON-3WE10134049-LIL': 'on-womens-runner-|-cloudrunner-2-lil',
        'ON-3WE10140929-IRO': 'on-womens-runner-|-cloudrunner-2-waterproof-iro',
        'ON-3WE10142130-MAG': 'on-womens-runner-|-cloudrunner-2-waterproof-mag',
        'ON-3WE10144286-SAN': 'on-womens-runner-|-cloudrunner-2-waterproof-san',
        'ON-3WE10340264-ECL': 'on-womens-runner-|-cloudrunner-2-ecl',
        'ON-3WE10342264-IVO': 'on-womens-runner-|-cloudrunner-2-ivo',
        'ON-3WE30040299-BLA': 'on-womens-runner-|-cloudflyer-5-bla',
        'ON-3WE30042774-GLA': 'on-womens-runner-|-cloudflyer-5-gla',
        'ON-3WE30050106-BLA': 'on-womens-surfer-|-cloudsurfer-next-1-bla',
        'ON-3WE30051200-WHI': 'on-womens-surfer-|-cloudsurfer-next-1-whi',
        'ON-3WE30052050-IVO': 'on-womens-surfer-|-cloudsurfer-next-1-ivo',
        'ON-3WE30054292-DEW': 'on-womens-surfer-|-cloudsurfer-next-1-dew',
        'ON-3WE30054721-PEO': 'on-womens-surfer-|-cloudsurfer-next-1-peo',
        'ON-3WE30070106-BLA': 'on-womens-ptr-|-x-|-cloud-x-4-bla',
        'ON-3WE30070791-IVO': 'on-womens-ptr-|-x-|-cloud-x-4-ivo',
        'ON-3WE30073561-PET': 'on-womens-ptr-|-x-|-cloud-x-4-pet',
        'ON-3WE30074741-NAV': 'on-womens-ptr-|-x-|-cloud-x-4-nav',
        'ON-3WE30131043-BLA': 'on-womens-po-|-vista-|-cloudvista-2-bla',
        'ON-3WE30132574-IVO': 'on-womens-po-|-vista-|-cloudvista-2-ivo',
        'ON-3WE30133323-CRE': 'on-womens-po-|-vista-|-cloudvista-2-cre',
        'ON-3WE30134533-GOB': 'on-womens-po-|-vista-|-cloudvista-2-gob',
        'ON-3WE30134854-IVO': 'on-womens-po-|-vista-|-cloudvista-2-ivo',
        'ON-3WE30160106-BLA': 'on-womens-po-|-vista-|-cloudvista-2-waterproof-bla',
        'ON-3WE30162734-IVO': 'on-womens-po-|-vista-|-cloudvista-2-waterproof-ivo',
        'ON-3WE30163172-FOG': 'on-womens-po-|-vista-|-cloudvista-2-waterproof-fog',
        'ON-3WE30410106-BLA': 'on-womens-nova-|-cloudnova-x-1-bla',
        'ON-3WE30410813-WHI': 'on-womens-nova-|-cloudnova-x-1-whi',
        'ON-3WE30470299-BLA': 'on-womens-boom-|-cloudboom-strike-1-bla',
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

        // Generate new unified handle: on-[gender]-[model]-[color]
        var genderSlug = 'unisex';
        if (/women/i.test(gender)) genderSlug = 'womens';
        else if (/men/i.test(gender)) genderSlug = 'mens';

        var modelSlug = (modelName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        var colorSlug = (colorName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        var handle = 'on-' + genderSlug + '-' + modelSlug + '-' + colorSlug;
        return handle.replace(/-+/g, '-').replace(/-$/, '');
    },

    // Parse title: "ON Women's Cloud | Cloud 6 - Pearl White"
    // Returns { gender, model, color, category }
    parseTitle: function(title) {
        if (!title) return { gender: '', model: '', color: '', category: '' };

        var gender = '';
        if (title.indexOf("Women's") !== -1) gender = "Women's";
        else if (title.indexOf("Men's") !== -1) gender = "Men's";
        else gender = 'Unisex';

        var model = '';
        var color = '';
        var category = '';

        var pipeIdx = title.indexOf('|');
        var dashIdx = title.lastIndexOf(' - ');

        if (pipeIdx !== -1 && dashIdx !== -1 && dashIdx > pipeIdx) {
            model = title.substring(pipeIdx + 1, dashIdx).trim();
            color = title.substring(dashIdx + 3).trim();
        } else if (pipeIdx !== -1) {
            model = title.substring(pipeIdx + 1).trim();
        } else if (dashIdx !== -1) {
            model = title.substring(0, dashIdx).replace(/^ON\s+(Men's|Women's)\s+/i, '').trim();
            color = title.substring(dashIdx + 3).trim();
        }

        if (pipeIdx !== -1) {
            var beforePipe = title.substring(0, pipeIdx).trim();
            category = beforePipe.replace(/^ON\s+(Men's|Women's|Unisex)\s*/i, '').trim();
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

                // Group by model
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

                    // Filter by picker selection
                    if (self.selectedProducts.size > 0 && !self.selectedProducts.has(modelKey)) {
                        return;
                    }

                    var qty = row['On hand (new)'] || '0';

                    var inventoryRow = {
                        'Handle': handle,
                        'Title': row.Title || '',
                        'Option1 Name': row['Option1 Name'] || 'Size',
                        'Option1 Value': row['Option1 Value'] || '',
                        'Option2 Name': row['Option2 Name'] || '',
                        'Option2 Value': row['Option2 Value'] || '',
                        'Option3 Name': row['Option3 Name'] || '',
                        'Option3 Value': row['Option3 Value'] || '',
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
                row['Option1 Name'] || '',
                row['Option1 Value'] || '',
                row['Option2 Name'] || '',
                row['Option2 Value'] || '',
                row['Option3 Name'] || '',
                row['Option3 Value'] || '',
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

    // Generate new product CSV for Shopify product creation
    // Clean title: strip pipe-separated categories for Shopify display
    // "ON Women's PTR | X | Cloud X 4 - Ivory Heron" -> "ON Women's Cloud X 4 - Ivory Heron"
    // "ON Women's Runner | Cloudrunner 3 - Black Black" -> "ON Women's Cloudrunner 3 - Black Black"
    cleanTitle: function(title) {
        if (!title || title.indexOf('|') === -1) return title;

        // Find the gender prefix: "ON Women's " or "ON Men's "
        var prefix = '';
        var rest = title;
        var genderMatch = title.match(/^(ON\s+(?:Women's|Men's|Unisex)\s+)/i);
        if (genderMatch) {
            prefix = genderMatch[1];
            rest = title.substring(prefix.length);
        }

        // Find the last pipe - everything after it is the model + color
        var lastPipeIdx = rest.lastIndexOf('|');
        if (lastPipeIdx !== -1) {
            var modelAndColor = rest.substring(lastPipeIdx + 1).trim();
            return prefix + modelAndColor;
        }

        return title;
    },

    // Clean handle: strip pipe-separated category segments for Shopify URL
    // "on-womens-ptr-|-x-|-cloud-x-4-ivo" -> "on-womens-cloud-x-4-ivory-heron"
    cleanHandle: function(handle, cleanedTitle) {
        // Generate handle from the cleaned title instead
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

            // Clean title: strip pipe categories for Shopify display
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
