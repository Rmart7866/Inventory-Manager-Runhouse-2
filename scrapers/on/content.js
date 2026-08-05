// ============================================================
// ON Running B2B Scraper → Shopify CSV Exporter
// - Stronger model matching (avoids "cloud" false positives)
// - Gender resolver (Men's/Women's) from name, styleId, sizes
// - Inventory CSV + Product CSV with multi-location support
// - FIXED: Inventory CSV format to match Shopify standards
// - FIXED: Size formatting - whole sizes now have .0 appended (7→7.0, 8→8.0)
// ============================================================

// ---------------------------------------------
// ON Running product database (trim as needed)
// ---------------------------------------------
const onProductDatabase = {
  // Max Cushion
  "cloudmonster 2": {
    name: "Cloudmonster 2",
    price: 180,
    weight: { mens: 10.4, womens: 8.1 },
    drop: 6,
    stack: { heel: 35, forefoot: 29 },
    category: "max-cushion",
    keywords: ["max cushion", "long distance", "marathon training", "plush", "dual-density Helion"],
    description:
      "ON's max-cushioned daily trainer featuring dual-density Helion superfoam for softer landings and higher energy return. The Cloudmonster 2 combines CloudTec® technology with a 35mm heel stack for maximum protection during long runs. Designed for runners seeking plush cushioning without sacrificing responsiveness."
  },
  "cloudmonster": {
    name: "Cloudmonster 2",
    price: 180,
    weight: { mens: 10.4, womens: 8.1 },
    drop: 6,
    stack: { heel: 35, forefoot: 29 },
    category: "max-cushion",
    keywords: ["max cushion", "long distance", "marathon training", "plush", "dual-density Helion"],
    description:
      "ON's max-cushioned daily trainer featuring dual-density Helion superfoam for softer landings and higher energy return."
  },

  // Daily Trainers
  "cloudrunner 2": {
    name: "Cloudrunner 2",
    price: 150,
    weight: { mens: 9.7, womens: 8.5 },
    drop: 10,
    stack: { heel: 39, forefoot: 29 },
    category: "stability",
    keywords: ["stability", "support", "daily trainer", "wide fit", "pronation control"],
    description:
      "Supportive daily trainer with Helion™ superfoam providing balanced cushioning and mild stability features. The Cloudrunner 2 offers a wider fit throughout with CloudTec® cushioning for impact absorption and smooth transitions."
  },
  "cloudrunner": {
    name: "Cloudrunner 2",
    price: 150,
    weight: { mens: 9.7, womens: 8.5 },
    drop: 10,
    stack: { heel: 39, forefoot: 29 },
    category: "stability",
    keywords: ["stability", "support", "daily trainer", "wide fit"],
    description: "Supportive daily trainer with Helion™ superfoam and mild stability features."
  },

  "cloudsurfer 2": {
    name: "Cloudsurfer 2",
    price: 160,
    weight: { mens: 9.0, womens: 7.8 },
    drop: 9,
    stack: { heel: 37, forefoot: 28 },
    category: "daily-trainer",
    keywords: ["daily trainer", "CloudTec Phase", "versatile", "balanced cushioning"],
    description:
      "Refined daily trainer featuring CloudTec Phase® technology for smooth transitions and balanced cushioning. The Cloudsurfer 2 offers a firmer, more stable ride with improved durability and responsiveness."
  },
  "cloudsurfer": {
    name: "Cloudsurfer 2",
    price: 160,
    weight: { mens: 9.0, womens: 7.8 },
    drop: 9,
    stack: { heel: 37, forefoot: 28 },
    category: "daily-trainer",
    keywords: ["daily trainer", "CloudTec Phase", "versatile"],
    description: "Daily trainer featuring CloudTec Phase® technology for smooth transitions."
  },

  // Speed Training
  "cloudflow 5": {
    name: "Cloudflow 5",
    price: 180,
    weight: { mens: 8.8, womens: 7.3 },
    drop: 6,
    stack: { heel: 37, forefoot: 31 },
    category: "speed-training",
    keywords: ["tempo", "speed training", "intervals", "Helion HF", "Speedboard"],
    description:
      "Speed-focused training shoe featuring dual-layer midsole with Helion HF supercritical foam. The Cloudflow 5 includes a glass-fiber infused nylon Speedboard® for propulsive toe-offs and extreme rocker geometry."
  },
  "cloudflow": {
    name: "Cloudflow 5",
    price: 180,
    weight: { mens: 8.8, womens: 7.3 },
    drop: 6,
    stack: { heel: 37, forefoot: 31 },
    category: "speed-training",
    keywords: ["tempo", "speed training", "intervals"],
    description: "Speed-focused training shoe with Helion HF foam and Speedboard®."
  },

  // Lifestyle
  "cloud 6": {
    name: "Cloud 6",
    price: 160,
    weight: { mens: 9.4, womens: 7.6 },
    drop: 8,
    stack: { heel: 27, forefoot: 19 },
    category: "lifestyle",
    keywords: ["lifestyle", "walking", "travel", "all-day comfort", "speed-lacing"],
    description:
      "Iconic lifestyle shoe with improved fit and comfort. Features CloudTec® in Zero-Gravity foam and signature speed-lacing system. Wider fit with recycled polyester mesh upper for all-day wear."
  },
  "cloud": {
    name: "Cloud 6",
    price: 160,
    weight: { mens: 9.4, womens: 7.6 },
    drop: 8,
    stack: { heel: 27, forefoot: 19 },
    category: "lifestyle",
    keywords: ["lifestyle", "walking", "travel", "all-day comfort"],
    description: "Iconic lifestyle shoe with CloudTec® cushioning and speed-lacing system."
  },

  // Racing
  "cloudboom strike": {
    name: "Cloudboom Strike",
    price: 280,
    weight: { mens: 7.1, womens: 6.2 },
    drop: 4,
    stack: { heel: 39.5, forefoot: 35.5 },
    category: "racing",
    keywords: ["marathon racing", "carbon plate", "Helion HF", "supershoe", "bounceboard"],
    description:
      "Elite carbon-plated racing shoe featuring innovative drop-in midsole with Helion HF hyperfoam. Unique bounceboard system creates exceptional energy return for 5K to marathon racing."
  },
  "cloudboom echo 3": {
    name: "Cloudboom Echo 3",
    price: 290,
    weight: { mens: 7.6, womens: 6.4 },
    drop: 9,
    stack: { heel: 39, forefoot: 30 },
    category: "racing",
    keywords: ["marathon racing", "carbon plate", "Helion HF", "elite racing"],
    description:
      "Elite carbon-plated racing shoe featuring Helion HF hyperfoam for maximum energy return. Full-length carbon Speedboard® with CloudTec® technology for explosive speed."
  },

  // Default fallback
  "default": {
    name: "ON Running Shoe",
    price: 150,
    weight: { mens: 9.0, womens: 7.5 },
    drop: 8,
    stack: { heel: 30, forefoot: 22 },
    category: "running",
    keywords: ["Swiss engineering", "CloudTec", "performance"],
    description:
      "Swiss-engineered performance running shoe featuring CloudTec® technology for superior cushioning and energy return."
  }
};

// --------------------------------------------------
// Stronger model matcher to avoid generic "cloud" hit
// --------------------------------------------------
function getONProductInfo(productName) {
  if (!productName) return null;

  const STOPWORDS = new Set(["cloud", "on", "running", "runner", "shoe", "shoes"]);
  const db = onProductDatabase;

  const clean = String(productName)
    .toLowerCase()
    .replace(/^(pr|pad)\s*\|\s*/i, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // 1) exact key
  if (db[clean]) return db[clean];

  // 2) score function
  const cleanWords = clean.split(" ").filter((w) => w && !STOPWORDS.has(w));
  const cleanSet = new Set(cleanWords);

  const scoreKey = (key) => {
    const keyWords = key.split(" ").filter((w) => w && !STOPWORDS.has(w));
    const inter = keyWords.filter((w) => cleanSet.has(w));
    // Heuristic: prioritize #overlaps and longer keys ("cloudmonster 2" > "cloud")
    return inter.length * 10 + keyWords.length;
  };

  // 2a) direct containment either way (strong signal)
  let bestKey = null;
  let bestScore = 0;

  for (const key in db) {
    if (clean.includes(key) || key.includes(clean)) {
      const s = scoreKey(key);
      if (s > bestScore) {
        bestScore = s;
        bestKey = key;
      }
    }
  }

  // 2b) if still nothing, do general overlap
  if (!bestKey && cleanWords.length) {
    for (const key in db) {
      const s = scoreKey(key);
      if (s > bestScore) {
        bestScore = s;
        bestKey = key;
      }
    }
  }

  // Require at least 2 meaningful overlaps (~12 points)
  if (bestKey && bestScore >= 12) return db[bestKey];

  return db["default"];
}

// --------------------------
// Size formatting utility
// --------------------------
function formatSizeForShopify(size) {
  if (!size) return size;
  const sizeStr = String(size).trim();
  
  // If size already has a decimal point, return as-is
  if (sizeStr.includes('.')) return sizeStr;
  
  // If it's a whole number, add .0
  if (/^\d+$/.test(sizeStr)) return sizeStr + '.0';
  
  // Otherwise return as-is
  return sizeStr;
}

// --------------------------
// Gender resolver utilities
// --------------------------
function inferGenderFromStyleId(styleId = "") {
  // Common ON patterns: 3WF..., 3MF..., presence of W / M in SKU blocks
  const s = String(styleId).toUpperCase();
  if (/3WF/.test(s) || /\bWOMEN'?S?\b/.test(s) || /(^|[^A-Z])W(F|M)?\d*/.test(s)) return "Women's";
  if (/3MF/.test(s) || /\bMEN'?S?\b/.test(s) || /(^|[^A-Z])M(F|W)?\d*/.test(s)) return "Men's";
  return null;
}

function inferGenderFromName(name = "") {
  const n = String(name).toLowerCase();
  if (/\b(women|women's|womens|wmn|ladies)\b/.test(n)) return "Women's";
  if (/\b(men|men's|mens|guys)\b/.test(n)) return "Men's";
  return null;
}

function inferGenderFromSizes(sizes = []) {
  // Heuristic: women's runs often start near 5–5.5; men's near 7–7.5+
  const nums = (sizes || [])
    .map((s) => parseFloat(String(s).replace(/[^\d.]/g, "")))
    .filter((x) => !Number.isNaN(x))
    .sort((a, b) => a - b);
  if (!nums.length) return null;
  const min = nums[0];
  if (min <= 5.5) return "Women's";
  if (min >= 7) return "Men's";
  return null;
}

function resolveGender({ productName, styleId, sizes }) {
  return (
    inferGenderFromName(productName) ||
    inferGenderFromStyleId(styleId) ||
    inferGenderFromSizes(sizes) ||
    null
  );
}

// ---------------------------------------------
// Shopify CSV Converter
// ---------------------------------------------
class UnifiedShopifyConverter {
  constructor(brand) {
    this.brand = brand;
    this.defaultSettings = {
      vendor: brand,
      productType: "Athletic Footwear",
      tags: `Running, ${brand}, Swiss, CloudTec`,
      published: "TRUE",
      variantPrice: "150.00",
      compareAtPrice: "",
      inventoryTracker: "shopify",
      inventoryPolicy: "deny",
      requiresShipping: "TRUE",
      taxable: "TRUE",
      fulfillmentService: "manual",
      productCategory: "Athletic Shoes",
      condition: "New",
      status: "draft",
      locationName: "Needham",
      exportType: "inventory"
    };
  }

  // ----------------------------
  // INVENTORY CSV (stock update) - FIXED FORMAT
  // ----------------------------
  convertToInventoryCSV(inventoryData, settings = {}) {
    const csvSettings = { ...this.defaultSettings, ...settings };
    
    console.log('INVENTORY CSV: Converting with ON settings:', csvSettings);
    
    // Build CSV manually to ensure ALL columns are included - matching ASICS format exactly
    let csvLines = [];
    
    // Add header row - EXACT format Shopify expects with all 19 columns
    csvLines.push('Handle,Title,"Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",SKU,"HS Code",COO,Location,"Bin name","Incoming (not editable)","Unavailable (not editable)","Committed (not editable)","Available (not editable)","On hand (current)","On hand (new)"');
    
    const productGroups = this.groupByColorway(inventoryData);
    
    Object.keys(productGroups).forEach(productKey => {
      const variants = productGroups[productKey];
      const baseProduct = variants[0];
      const handle = this.generateHandle(baseProduct);
      
      // Generate product title with gender
      const gender = resolveGender({ 
        productName: baseProduct.productName, 
        styleId: baseProduct.styleId, 
        sizes: variants.map(v => v.sizeUS || v.size)
      });
      const title = this.generateProductTitle({ ...baseProduct, gender });
      
      variants.forEach(variant => {
        const sku = this.generateSKU(variant);
        const quantity = Math.max(0, parseInt(variant.quantity) || 0);
        
        // Build each row manually - ensuring all 19 columns match ASICS format
        const row = [
          handle,                                  // Handle
          `"${title}"`,                           // Title (quoted for safety)
          'Size',                                  // Option1 Name
          formatSizeForShopify(variant.sizeUS || variant.size),  // Option1 Value - FIX: Add .0 to whole sizes
          'Color',                                 // Option2 Name
          `"${variant.colorName}"`,               // Option2 Value (quoted for safety)
          '',                                      // Option3 Name
          '',                                      // Option3 Value
          sku,                                     // SKU
          '',                                      // HS Code
          '',                                      // COO (Country of Origin)
          csvSettings.locationName || 'Needham',  // Location
          '',                                      // Bin name
          '',                                      // Incoming (not editable)
          '',                                      // Unavailable (not editable)
          '',                                      // Committed (not editable)
          '',                                      // Available (not editable)
          '',                                      // On hand (current) - leave empty to skip validation
          quantity                                 // On hand (new) - THIS IS THE CRITICAL COLUMN
        ];
        
        csvLines.push(row.join(','));
      });
    });
    
    const csvContent = csvLines.join('\n');
    
    console.log('INVENTORY CSV: Generated', csvLines.length - 1, 'inventory rows');
    console.log('INVENTORY CSV: First line:', csvLines[0]);
    console.log('INVENTORY CSV: Sample data line:', csvLines[1] || 'No data');
    
    return csvContent;
  }

  // -------------------------
  // PRODUCT CSV (new product)
  // -------------------------
  convertToShopifyFormat(inventoryData, settings = {}) {
    const shopifySettings = {
      ...this.defaultSettings,
      ...settings,
      locationName: settings.locationName || "Needham"
    };

    const shopifyRows = [];
    const productGroups = this.groupByColorway(inventoryData);

    Object.keys(productGroups).forEach((productKey) => {
      const variants = productGroups[productKey];
      const baseProduct = variants[0];
      const handle = this.generateHandle(baseProduct);

      // Determine model & pricing
      let productName = (baseProduct.productName || "ON Running Shoe").replace(/^(PR|PAD)\s*\|\s*/i, "").trim();
      const productInfo = getONProductInfo(productName);
      const price = productInfo ? productInfo.price.toFixed(2) : shopifySettings.variantPrice;
      const comparePrice = "";
      const isTaxable = parseFloat(price) >= 175 ? "TRUE" : "FALSE";

      variants.forEach((variant, index) => {
        const isFirst = index === 0;
        const sku = this.generateSKU(variant);
        const quantity = Math.max(0, parseInt(variant.quantity) || 0);

        // Gender
        const gender =
          variant.gender ||
          resolveGender({ productName: variant.productName, styleId: variant.styleId, sizes: [variant.sizeUS] });

        const shopifyRow = {
          Handle: handle,
          Title: isFirst ? this.generateProductTitle({ ...baseProduct, gender }) : "",
          "Body (HTML)": isFirst ? this.generateProductDescription({ ...baseProduct, gender }) : "",
          Vendor: isFirst ? shopifySettings.vendor : "",
          "Product Category": isFirst ? shopifySettings.productCategory : "",
          Type: isFirst ? shopifySettings.productType : "",
          Tags: isFirst ? this.generateTags({ ...baseProduct, gender }, shopifySettings.tags) : "",
          Published: isFirst ? shopifySettings.published : "",
          "Option1 Name": isFirst ? "Size" : "",
          "Option1 Value": formatSizeForShopify(variant.sizeUS || variant.size),  // FIX: Add .0 to whole sizes
          "Option2 Name": isFirst ? "Color" : "",
          "Option2 Value": variant.colorName,
          "Option3 Name": "",
          "Option3 Value": "",
          "Variant SKU": sku,
          "Variant Grams": "",
          "Variant Inventory Tracker": shopifySettings.inventoryTracker,
          "Variant Inventory Policy": shopifySettings.inventoryPolicy,
          "Variant Fulfillment Service": shopifySettings.fulfillmentService,
          "Variant Price": price,
          "Variant Compare At Price": comparePrice,
          "Variant Requires Shipping": shopifySettings.requiresShipping,
          "Variant Taxable": isTaxable,
          "Variant Barcode": "",
          "Image Src": "",
          "Image Position": "",
          "Image Alt Text": "",
          "Gift Card": "FALSE",
          "SEO Title": isFirst ? this.generateProductTitle({ ...baseProduct, gender }) : "",
          "SEO Description": isFirst ? this.generateSEODescription({ ...baseProduct, gender }) : "",
          "Google Shopping / Google Product Category": "",
          "Google Shopping / Gender": isFirst ? (gender === "Women's" ? "female" : gender === "Men's" ? "male" : "") : "",
          "Google Shopping / Age Group": "",
          "Google Shopping / MPN": "",
          "Google Shopping / Condition": isFirst ? shopifySettings.condition : "",
          "Google Shopping / Custom Product": "FALSE",
          "Variant Image": "",
          "Variant Weight Unit": "kg",
          "Variant Tax Code": "",
          "Cost per item": "",
          "Included / United States": "TRUE",
          "Price / United States": price,
          "Compare At Price / United States": comparePrice,
          "Included / International": "TRUE",
          "Price / International": price,
          "Compare At Price / International": comparePrice,
          Status: shopifySettings.status
        };

        // Multi-location
        shopifyRow[`Inventory at ${shopifySettings.locationName}`] = quantity;

        shopifyRows.push(shopifyRow);
      });
    });

    return shopifyRows;
  }

  convertToCSV(shopifyData, settings = {}) {
    if (!shopifyData?.length) return "";

    const finalSettings = {
      ...settings,
      locationName: settings.locationName || "Needham"
    };

    const baseHeaders = [
      "Handle",
      "Title",
      "Body (HTML)",
      "Vendor",
      "Product Category",
      "Type",
      "Tags",
      "Published",
      "Option1 Name",
      "Option1 Value",
      "Option2 Name",
      "Option2 Value",
      "Option3 Name",
      "Option3 Value",
      "Variant SKU",
      "Variant Grams",
      "Variant Inventory Tracker"
    ];

    const inventoryHeaders = [`Inventory at ${finalSettings.locationName}`];

    const restHeaders = [
      "Variant Inventory Policy",
      "Variant Fulfillment Service",
      "Variant Price",
      "Variant Compare At Price",
      "Variant Requires Shipping",
      "Variant Taxable",
      "Variant Barcode",
      "Image Src",
      "Image Position",
      "Image Alt Text",
      "Gift Card",
      "SEO Title",
      "SEO Description",
      "Google Shopping / Google Product Category",
      "Google Shopping / Gender",
      "Google Shopping / Age Group",
      "Google Shopping / MPN",
      "Google Shopping / Condition",
      "Google Shopping / Custom Product",
      "Variant Image",
      "Variant Weight Unit",
      "Variant Tax Code",
      "Cost per item",
      "Included / United States",
      "Price / United States",
      "Compare At Price / United States",
      "Included / International",
      "Price / International",
      "Compare At Price / International",
      "Status"
    ];

    const allHeaders = [...baseHeaders, ...inventoryHeaders, ...restHeaders];

    const csvContent = [
      allHeaders.join(","),
      ...shopifyData.map((row) =>
        allHeaders
          .map((h) => {
            const v = row[h] ?? "";
            return typeof v === "string" && (v.includes(",") || v.includes('"') || v.includes("\n"))
              ? `"${v.replace(/"/g, '""')}"`
              : v;
          })
          .join(",")
      )
    ].join("\n");

    return csvContent;
  }

  // ----------------
  // Helper methods
  // ----------------
  groupByColorway(inventoryData) {
    const groups = {};
    inventoryData.forEach((item) => {
      const key = `${item.styleId || item.productName}-${item.colorCode || item.colorName}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }

  generateHandle(product) {
    const productName = (product.productName || "unknown")
      .replace(/^(PR|PAD)\s*\|\s*/i, "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    
    // Clean color code - remove any USD price information
    let colorCode = (product.colorCode || product.colorName || "default").toLowerCase();
    
    // Remove everything from USD onwards (case-insensitive)
    if (colorCode.includes('usd')) {
      colorCode = colorCode.substring(0, colorCode.indexOf('usd')).trim();
    }
    
    // Also remove any dollar signs and numbers that look like prices
    colorCode = colorCode.replace(/\$[\d.,]+/g, '').trim();
    colorCode = colorCode.replace(/\d+\.\d{2}/g, '').trim();
    
    // Clean up the color code for URL safety
    colorCode = colorCode.replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, '');
    
    // If colorCode is empty after cleaning, use first 3 chars of color name or "unk"
    if (!colorCode || colorCode.length < 2) {
      colorCode = (product.colorName || "unk").substring(0, 3).toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!colorCode) colorCode = "unk";
    }
    
    // Determine gender for handle
    const gender = product.gender || 
      resolveGender({ 
        productName: product.productName, 
        styleId: product.styleId, 
        sizes: product.sizes || [product.sizeUS] 
      });
    
    const genderSlug = gender === "Women's" ? "womens" : gender === "Men's" ? "mens" : "";
    
    // Include gender in handle if determined
    if (genderSlug) {
      return `on-${genderSlug}-${productName}-${colorCode}`.replace(/-+/g, "-");
    }
    return `on-${productName}-${colorCode}`.replace(/-+/g, "-");
  }

  generateProductTitle(product) {
    let productName = (product.productName || "ON Running Shoe").replace(/^(PR|PAD)\s*\|\s*/i, "").trim();
    const colorName = product.colorName || "Default Color";
    const info = getONProductInfo(productName);
    const modelName = info && info !== onProductDatabase["default"] ? info.name : productName;

    const gender =
      product.gender ||
      inferGenderFromStyleId(product.styleId) ||
      inferGenderFromSizes([product.sizeUS].filter(Boolean)) ||
      null;

    const genderPrefix = gender ? `${gender} ` : "";
    return `ON ${genderPrefix}${modelName} - ${colorName}`;
  }

  generateProductDescription(product) {
    let productName = (product.productName || "ON Running Shoe").replace(/^(PR|PAD)\s*\|\s*/i, "").trim();
    const styleId = product.styleId || "Unknown Style";
    const colorName = product.colorName || "Default Color";
    const info = getONProductInfo(productName);

    const gender =
      product.gender ||
      inferGenderFromStyleId(product.styleId) ||
      inferGenderFromSizes([product.sizeUS].filter(Boolean)) ||
      null;

    const genderPrefix = gender ? `${gender} ` : "";
    if (info && info !== onProductDatabase["default"]) {
      return `<div class="product-description">
  <h2>ON ${genderPrefix}${info.name} - ${colorName}</h2>
  <p>${info.description}</p>
  <ul>
    <li><strong>Style:</strong> ${styleId}</li>
    <li><strong>Weight:</strong> ${info.weight.mens}oz (Men's) / ${info.weight.womens}oz (Women's)</li>
    <li><strong>Drop:</strong> ${info.drop}mm heel-to-toe offset</li>
    <li><strong>Stack Height:</strong> ${info.stack.heel}mm heel / ${info.stack.forefoot}mm forefoot</li>
    <li><strong>Price:</strong> $${info.price}</li>
    <li><strong>Category:</strong> ${info.category.replace("-", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</li>
  </ul>
  <p><strong>Swiss Engineering Excellence:</strong> Featuring CloudTec® technology for superior cushioning and energy return. Designed in Switzerland for runners who demand performance and comfort.</p>
</div>`;
    }

    return `<p>ON ${genderPrefix}${productName}</p>
<p>Style: ${styleId}</p>
<p>Color: ${colorName}</p>
<p>Swiss-engineered performance running shoes from ON Running featuring CloudTec® technology.</p>`;
  }

  generateSEODescription(product) {
    let productName = (product.productName || "ON Running Shoe").replace(/^(PR|PAD)\s*\|\s*/i, "").trim();
    const colorName = product.colorName || "Default Color";
    const info = getONProductInfo(productName);
    const modelName = info && info !== onProductDatabase["default"] ? info.name : productName;

    const gender =
      product.gender ||
      inferGenderFromStyleId(product.styleId) ||
      inferGenderFromSizes([product.sizeUS].filter(Boolean)) ||
      null;

    const genderPrefix = gender ? `${gender} ` : "";

    if (info && info !== onProductDatabase["default"]) {
      return `Shop ON ${genderPrefix}${modelName} in ${colorName}. ${info.keywords.join(
        ", "
      )}. Swiss-engineered CloudTec® cushioning. ${info.drop}mm drop, ${info.weight.mens}oz (M) / ${info.weight.womens}oz (W).`;
    }

    const styleId = product.styleId || "Unknown Style";
    return `ON ${genderPrefix}${modelName} in ${colorName}. Style ${styleId} from ON Running. Swiss-engineered CloudTec® running shoes.`;
  }

  generateTags(product, baseTags) {
    let productName = (product.productName || "").replace(/^(PR|PAD)\s*\|\s*/i, "").trim();
    const styleId = product.styleId || "";
    const colorName = product.colorName || "";
    const info = getONProductInfo(productName);

    let tags = baseTags;

    const gender =
      product.gender ||
      inferGenderFromStyleId(product.styleId) ||
      inferGenderFromSizes([product.sizeUS].filter(Boolean)) ||
      null;

    if (gender) tags += `, ${gender}`;

    if (info && info !== onProductDatabase["default"]) {
      tags += `, ${info.name}, ${info.keywords.join(", ")}`;
    } else if (productName) {
      tags += `, ${productName}`;
    }
    if (styleId) tags += `, ${styleId}`;
    if (colorName) tags += `, ${colorName}`;

    // Category-specific tags
    if (info && info.category) {
      const categoryTags = {
        "max-cushion": "Max Cushion, Long Distance, Marathon Training",
        "daily-trainer": "Daily Trainer, Versatile, All-Purpose",
        stability: "Stability, Support, Pronation Control",
        "speed-training": "Speed Work, Tempo, Fast Training",
        "soft-cushion": "Soft Cushion, Plush, Recovery",
        lifestyle: "Walking, Lifestyle, Travel, Everyday",
        racing: "Racing, Competition, Marathon, Elite"
      };
      if (categoryTags[info.category]) tags += `, ${categoryTags[info.category]}`;
    }

    return tags;
  }

  generateSKU(variant) {
    const styleId = variant.styleId || "UNK";
    const colorCode = variant.colorCode || variant.colorName || "DEF";
    const size = (variant.sizeUS || variant.size || "OS").toString().replace(/\./g, "5");
    return `ON-${styleId}-${colorCode}-${size}`;
  }
}

// ---------------------------------------------
// ON Running Inventory Extractor (DOM scraper)
// ---------------------------------------------
class ONRunningInventoryExtractor {
  constructor() {
    this.shopifyConverter = new UnifiedShopifyConverter("ON Running");
    this.shopifySettings = {
      vendor: "ON Running",
      productType: "Athletic Footwear",
      tags: "Running, ON, Swiss, CloudTec",
      published: "TRUE",
      variantPrice: "150.00",
      compareAtPrice: "",
      inventoryTracker: "shopify",
      inventoryPolicy: "deny",
      requiresShipping: "TRUE",
      taxable: "TRUE",
      fulfillmentService: "manual",
      productCategory: "Athletic Shoes",
      condition: "New",
      status: "draft",
      locationName: "Needham",
      exportType: "inventory"
    };

    this.init();
  }

  init() {
    // Check if we're completing a two-page scrape
    this.checkForPendingCombine();
    
    if (this.isONInventoryPage()) {
      this.addExportButton();
      this.addSettingsButton();
      this.loadShopifySettings();

      console.log("ON Running Scraper initialized");
      console.log("URL:", window.location.href);
      console.log("✅ INVENTORY CSV FORMAT FIXED - Now matches Shopify standards");
    }
  }

  isONInventoryPage() {
    const url = window.location.href;
    const hasQuantityInputs = document.querySelectorAll('input[type="number"]').length > 50;
    const hasStockStatuses = document.querySelectorAll(
      '[title="In Stock"], [title="Low Stock"], [title="No Stock"], [title="Very Low Stock"]'
    ).length > 10;
    const hasONStructure = document.querySelectorAll("[data-v-4b83b133]").length > 10;

    return (
      (url.includes("on-running.com") && (hasQuantityInputs || hasStockStatuses || hasONStructure)) ||
      url.includes("/quantities") ||
      url.includes("/products-availability")
    );
  }

  addExportButton() {
    const existingBtn = document.querySelector(".on-export-btn");
    if (existingBtn) existingBtn.remove();

    const exportBtn = document.createElement("button");
    exportBtn.innerHTML = "Export ON Running Inventory";
    exportBtn.className = "on-export-btn";
    exportBtn.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 10000;
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      color: white; border: none; padding: 15px 25px;
      border-radius: 10px; cursor: pointer; font-size: 16px; font-weight: bold;
      box-shadow: 0 5px 20px rgba(255,107,53,0.4);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      transition: all 0.3s ease; border: 2px solid rgba(255,255,255,0.2);
    `;
    exportBtn.onmouseover = () => {
      exportBtn.style.transform = "translateY(-3px)";
      exportBtn.style.boxShadow = "0 8px 25px rgba(255,107,53,0.5)";
    };
    exportBtn.onmouseout = () => {
      exportBtn.style.transform = "translateY(0)";
      exportBtn.style.boxShadow = "0 5px 20px rgba(255,107,53,0.4)";
    };
    exportBtn.onclick = () => this.showFormatSelectionModal();

    document.body.appendChild(exportBtn);
  }

  addSettingsButton() {
    const settingsBtn = document.createElement("button");
    settingsBtn.innerHTML = "⚙️ Settings";
    settingsBtn.className = "on-settings-btn";
    settingsBtn.style.cssText = `
      position: fixed; top: 80px; right: 10px; z-index: 10000;
      background: rgba(51,51,51,0.9); color: white; border: none; padding: 10px 20px;
      border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;
      box-shadow: 0 3px 15px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      backdrop-filter: blur(10px);
    `;
    settingsBtn.onclick = () => this.showSettingsModal();

    document.body.appendChild(settingsBtn);
  }

  showFormatSelectionModal() {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); z-index: 20000;
      display: flex; align-items: center; justify-content: center;
    `;

    const modalContent = document.createElement("div");
    modalContent.style.cssText = `
      background: white; padding: 30px; border-radius: 12px; max-width: 600px;
      width: 90%; max-height: 80%; overflow-y: auto; 
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      border-top: 4px solid #ff6b35;
    `;

    modalContent.innerHTML = `
      <h3 style="margin-bottom: 20px; color: #333;"> Export ON Running Inventory</h3>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 2px solid #ff6b35;">
        <h4 style="margin: 0 0 15px 0; color: #ff6b35;">Select CSV Format:</h4>
        <div style="display: flex; gap: 20px; margin-bottom: 15px;">
          <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #28a745; border-radius: 8px; background: #d4edda; flex: 1; cursor: pointer;">
            <input type="radio" name="csvFormat" value="inventory" checked style="margin-right: 10px; transform: scale(1.2);">
            <div>
              <strong style="color: #155724;">Inventory CSV</strong><br>
              <small style="color: #155724;">Update existing product quantities</small>
            </div>
          </label>
          <label style="display: flex; align-items: center; padding: 10px; border: 2px solid #17a2b8; border-radius: 8px; background: #d1ecf1; flex: 1; cursor: pointer;">
            <input type="radio" name="csvFormat" value="product" style="margin-right: 10px; transform: scale(1.2);">
            <div>
              <strong style="color: #0c5460;">Product CSV</strong><br>
              <small style="color: #0c5460;">Create new products with details</small>
            </div>
          </label>
        </div>
        <div id="inventoryDetails" style="background: #d4edda; padding: 10px; border-radius: 5px; font-size: 12px; color: #155724;">
          <strong>Inventory CSV:</strong><br>
          • 11 columns: Handle, Title, Options, SKU, Location, "not stocked"<br>
          • Import to: Products → Inventory → Import<br>
          • Best for: Updating stock levels for existing products<br>
          • Format: Fixed to match Shopify standards ✓
        </div>
        <div id="productDetails" style="background: #d1ecf1; padding: 10px; border-radius: 5px; font-size: 12px; color: #0c5460; display: none;">
          <strong>Product CSV:</strong><br>
          • 48+ columns: Full product details, pricing, descriptions<br>
          • Import to: Products → Import<br>
          • Best for: Creating new products from scratch
        </div>
      </div>

      <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
        <h4 style="margin: 0 0 10px 0; color: #856404;">ON Running Stock Status Mapping:</h4>
        <div style="font-size: 12px; color: #856404;">
          • <strong>"In Stock"</strong> → 30 units<br>
          • <strong>"Low Stock"</strong> → 5 units<br>
          • <strong>"Very Low Stock"</strong> → 2 units<br>
          • <strong>"No Stock"</strong> → 0 units
        </div>
      </div>

      <div style="text-align: center; margin-top: 20px;">
        <button id="exportNow" style="background: #ff6b35; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin-right: 10px; font-weight: bold;">
          Export Now
        </button>
        <button id="closeModal" style="background: #6c757d; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">
          Cancel
        </button>
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // format switch
    const formatRadios = modal.querySelectorAll('input[name="csvFormat"]');
    const inventoryDetails = modal.querySelector("#inventoryDetails");
    const productDetails = modal.querySelector("#productDetails");
    formatRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.value === "inventory") {
          inventoryDetails.style.display = "block";
          productDetails.style.display = "none";
        } else {
          inventoryDetails.style.display = "none";
          productDetails.style.display = "block";
        }
      });
    });

    modal.querySelector("#closeModal").onclick = () => document.body.removeChild(modal);
    modal.querySelector("#exportNow").onclick = () => {
      const selectedFormat = modal.querySelector('input[name="csvFormat"]:checked').value;
      document.body.removeChild(modal);
      this.extractONRunningInventory(selectedFormat);
    };
    modal.onclick = (e) => {
      if (e.target === modal) document.body.removeChild(modal);
    };
  }

  // NEW: Scrape both genders and combine into one CSV
  async scrapeBothGenders() {
    try {
      console.log("🔄 Starting both-genders scrape process...");
      
      // Get current URL
      const currentUrl = window.location.href;
      
      // Try to determine if we're on men's or women's page
      const isMensPage = currentUrl.toLowerCase().includes('/men') || 
                         currentUrl.toLowerCase().includes('mens') ||
                         currentUrl.toLowerCase().includes('gender=m') ||
                         currentUrl.toLowerCase().includes('-m-');
      const isWomensPage = currentUrl.toLowerCase().includes('/women') || 
                           currentUrl.toLowerCase().includes('womens') ||
                           currentUrl.toLowerCase().includes('gender=w') ||
                           currentUrl.toLowerCase().includes('-w-');
      
      if (!isMensPage && !isWomensPage) {
        alert("Unable to determine gender from URL. Please navigate to either Men's or Women's product page first.\n\nURL should contain: /men, /women, mens, womens, or gender parameter.");
        return { success: false, error: "Cannot determine gender from URL" };
      }
      
      // Extract from current page first
      console.log("📋 Extracting from current page...");
      const inventoryData = this.extractFromONStructure();
      
      if (!inventoryData || inventoryData.length === 0) {
        alert("No inventory found on current page. Cannot proceed with both-gender scrape.");
        return { success: false, error: "No inventory on current page" };
      }
      
      // Determine the other gender's URL
      let otherGenderUrl = currentUrl;
      if (isMensPage) {
        // Switch to women's - try multiple patterns
        otherGenderUrl = currentUrl
          .replace('/men/', '/women/')
          .replace('/mens/', '/womens/')
          .replace('mens-', 'womens-')
          .replace('-m-', '-w-')
          .replace('gender=m', 'gender=w');
      } else {
        // Switch to men's - try multiple patterns
        otherGenderUrl = currentUrl
          .replace('/women/', '/men/')
          .replace('/womens/', '/mens/')
          .replace('womens-', 'mens-')
          .replace('-w-', '-m-')
          .replace('gender=w', 'gender=m');
      }
      
      // Check if URL actually changed
      if (otherGenderUrl === currentUrl) {
        console.warn("⚠️ Could not automatically determine other gender URL");
        alert("Could not automatically find the other gender's page. Please check the URL pattern.\n\nCurrent URL: " + currentUrl);
        
        // Still export the current page data
        const productName = this.extractProductName();
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
        const filename = `ON_Running_${productName.replace(/\s+/g, "_")}_${timestamp}.csv`;
        
        const csvContent = this.shopifyConverter.convertToInventoryCSV(inventoryData, this.shopifySettings);
        this.downloadCSV(csvContent, filename);
        
        this.showSuccessMessage(`✅ Exported ${inventoryData.length} variants from current page only<br><small>Could not find other gender page</small>`);
        
        return { success: true, count: inventoryData.length };
      }
      
      // Show message that we're navigating
      this.showSuccessMessage(`📋 Scraped current page (${inventoryData.length} variants)<br>🔄 Navigating to other gender in 3 seconds...`);
      
      // Store first page data in sessionStorage
      sessionStorage.setItem('ON_firstPageData', JSON.stringify({
        variants: inventoryData,
        productName: this.extractProductName(),
        originalUrl: currentUrl,
        timestamp: Date.now(),
        settings: this.shopifySettings
      }));
      
      // Navigate to other gender page after a short delay
      setTimeout(() => {
        console.log(`🔄 Navigating to other gender: ${otherGenderUrl}`);
        window.location.href = otherGenderUrl;
      }, 3000);
      
      return { success: true, navigating: true };
      
    } catch (error) {
      console.error("❌ Error in scrapeBothGenders:", error);
      return { success: false, error: error.message };
    }
  }
  
  // NEW: Check if we just navigated from another gender page
  checkForPendingCombine() {
    const storedData = sessionStorage.getItem('ON_firstPageData');
    
    if (!storedData) return;
    
    try {
      const firstPageData = JSON.parse(storedData);
      const timeSinceStore = Date.now() - firstPageData.timestamp;
      
      // If more than 60 seconds, ignore (user probably navigated away)
      if (timeSinceStore > 60000) {
        sessionStorage.removeItem('ON_firstPageData');
        return;
      }
      
      // Wait a bit for page to fully load
      setTimeout(() => {
        console.log("🔄 Detected pending combine operation, extracting second page...");
        
        // Show loading message
        this.showSuccessMessage(`⏳ Extracting from second gender page...`);
        
        // Extract from current (second) page
        const secondPageData = this.extractFromONStructure();
        
        if (!secondPageData || secondPageData.length === 0) {
          alert("Failed to extract inventory from second gender page. First page data is still saved in browser.");
          sessionStorage.removeItem('ON_firstPageData');
          return;
        }
        
        // Combine both datasets
        const combinedVariants = [...firstPageData.variants, ...secondPageData];
        
        console.log(`✅ Combined ${firstPageData.variants.length} + ${secondPageData.length} = ${combinedVariants.length} variants`);
        
        // Generate combined CSV
        const productName = firstPageData.productName;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "_");
        const filename = `ON_Running_${productName.replace(/\s+/g, "_")}_BOTH_GENDERS_${timestamp}.csv`;
        
        // Use the stored settings from first page
        const csvContent = this.shopifyConverter.convertToInventoryCSV(combinedVariants, firstPageData.settings);
        this.downloadCSV(csvContent, filename);
        
        this.showSuccessMessage(`
          ✅ <strong>Combined Export Complete!</strong><br>
          First page: ${firstPageData.variants.length} variants<br>
          Second page: ${secondPageData.length} variants<br>
          <strong>Total: ${combinedVariants.length} variants</strong><br>
          <small>Returning to original page in 5 seconds...</small>
        `);
        
        // Clean up
        sessionStorage.removeItem('ON_firstPageData');
        
        // Navigate back to original page
        setTimeout(() => {
          window.location.href = firstPageData.originalUrl;
        }, 5000);
        
      }, 3000); // Wait 3 seconds for page to load
    } catch (error) {
      console.error("Error in checkForPendingCombine:", error);
      sessionStorage.removeItem('ON_firstPageData');
    }
  }
  
  extractProductName() {
    // Extract product name from the page
    const groupHeader = document.querySelector(".product-group-header .title");
    if (groupHeader) {
      let name = groupHeader.textContent.trim();
      name = name.replace(/\s*[▼▲↓↑].*$/, "")
                 .replace(/\s+/g, " ")
                 .replace(/^(PR|PAD)\s*\|\s*/i, "")
                 .trim();
      
      // Remove USD price info
      if (name.toLowerCase().includes('usd')) {
        const usdIndex = name.toLowerCase().indexOf('usd');
        name = name.substring(0, usdIndex).trim();
      }
      
      return name || "ON_Running_Product";
    }
    return "ON_Running_Product";
  }

  extractONRunningInventory(format = "inventory") {
    try {
      this.loadShopifySettings();
      this.shopifySettings.exportType = format;

      const inventoryData = this.extractFromONStructure();

      if (!inventoryData.length) {
        alert("No inventory data found. Make sure you're on the quantities/availability page.");
        return { count: 0 };
      }

      let csv, filename;
      if (format === "inventory") {
        csv = this.shopifyConverter.convertToInventoryCSV(inventoryData, this.shopifySettings);
        filename = `on-running-inventory-${Date.now()}.csv`;
      } else {
        const shopifyData = this.shopifyConverter.convertToShopifyFormat(inventoryData, this.shopifySettings);
        csv = this.shopifyConverter.convertToCSV(shopifyData, this.shopifySettings);
        filename = `on-running-products-${Date.now()}.csv`;
      }

      this.downloadCSV(csv, filename);

      const importInstructions =
        format === "inventory" ? "Import to: Products → Inventory → Import" : "Import to: Products → Import";
      this.showSuccessMessage(` Exported ${inventoryData.length} ON Running variants as ${format.toUpperCase()} CSV! ${importInstructions}`);

      return { count: inventoryData.length };
    } catch (error) {
      console.error("❌ Extraction error:", error);
      alert("Error extracting inventory: " + error.message);
      return { count: 0 };
    }
  }

  extractFromONStructure() {
    const inventory = [];

    const productGroups = document.querySelectorAll(".product-group-cnt");
    console.log(`🔍 Found ${productGroups.length} product groups`);
    
    if (!productGroups.length) {
      console.warn("⚠️ No .product-group-cnt found, trying alternative structure");
      return this.extractFromAlternativeStructure();
    }

    productGroups.forEach((productGroup, groupIndex) => {
      // Get group header name (cleaned) and sizes
      const groupHeader = productGroup.querySelector(".product-group-header .title");
      let productName = "ON Running Shoe";
      if (groupHeader) {
        let t = groupHeader.textContent.trim();
        // Remove arrows and other UI elements
        t = t.replace(/\s*[▼▲↓↑].*$/, "").replace(/\s+/g, " ").replace(/^(PR|PAD)\s*\|\s*/i, "").trim();
        
        // CRITICAL: Remove any USD price information from the product name
        if (t.toLowerCase().includes('usd')) {
          const usdIndex = t.toLowerCase().indexOf('usd');
          t = t.substring(0, usdIndex).trim();
        }
        
        if (t && t.length > 2) productName = t;
      }
      console.log(`📦 Group ${groupIndex + 1}: ${productName}`);

      const headerRow = productGroup.querySelector(".row.header");
      const sizeColumns = this.extractSizeHeaders(headerRow);
      console.log(`  📏 Sizes for ${productName}:`, sizeColumns);

      const productRows = productGroup.querySelectorAll(".row.product-fabric");
      console.log(`  👟 Found ${productRows.length} color variations`);
      
      productRows.forEach((row, rowIndex) => {
        const productInfo = this.extractProductInfoFromRow(row);
        productInfo.productName = productName;

        // infer gender per colorway
        const gender = resolveGender({
          productName,
          styleId: productInfo.styleId,
          sizes: sizeColumns
        });

        const stockStatuses = this.extractStockStatusesFromRow(row);
        console.log(`    🎨 Color ${rowIndex + 1}: ${productInfo.colorName} (${productInfo.styleId}), Stock data: ${stockStatuses.length} sizes`);
        
        sizeColumns.forEach((size, idx) => {
          const stockStatus = stockStatuses[idx] || "No Stock";
          const quantity = this.convertStockStatusToQuantity(stockStatus);
          inventory.push({
            productName: productInfo.productName,
            styleId: productInfo.styleId,
            colorCode: productInfo.colorCode,
            colorName: productInfo.colorName,
            sizeUS: size,
            stockStatus,
            quantity,
            gender,
            extractedAt: new Date().toISOString(),
            url: window.location.href,
            source: "on-structure"
          });
        });
      });
    });

    console.log(`✅ Total extracted: ${inventory.length} variants`);
    return inventory;
  }

  extractSizeHeaders(headerRow) {
    if (!headerRow) {
      console.warn("⚠️ No header row found, using default size array");
      return ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "13.5", "14", "14.5", "15"];
    }
    
    const sizes = [];
    
    // Primary method for ON Running: .always-visible-size-type ONLY (the US size, not EU)
    const sizeElements = headerRow.querySelectorAll(".column .size-cnt .always-visible-size-type");
    if (sizeElements.length > 0) {
      sizeElements.forEach((el) => {
        const s = el.textContent.trim();
        // Make sure it's a valid shoe size format (e.g., "7", "7.5", "12.5")
        if (/^\d+(?:\.\d)?$/.test(s)) {
          sizes.push(s);
        }
      });
    }
    
    // Fallback 1: .size-cnt .us (old structure)
    if (sizes.length === 0) {
      headerRow.querySelectorAll(".size-cnt .us").forEach((el) => {
        const s = el.textContent.trim();
        if (/^\d+(?:\.\d)?$/.test(s)) sizes.push(s);
      });
    }
    
    // Fallback 2: Try just .us elements
    if (sizes.length === 0) {
      headerRow.querySelectorAll(".us").forEach((el) => {
        const s = el.textContent.trim();
        if (/^\d+(?:\.\d)?$/.test(s)) sizes.push(s);
      });
    }
    
    if (sizes.length > 0) {
      console.log(`✅ Extracted ${sizes.length} US sizes from header:`, sizes);
      return sizes;
    }
    
    console.warn("⚠️ No sizes found in header, using default array");
    return ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "13.5", "14", "14.5", "15"];
  }

  extractProductInfoFromRow(row) {
    // color + style
    const productFabricText = row.querySelector(".product-fabric-text");
    let colorName = "Unknown Color";
    let colorCode = "UNK";
    let styleId = "UNKNOWN";
    let productHint = null;

    if (productFabricText) {
      const strong = productFabricText.querySelector("p.strong");
      if (strong) {
        let colorText = strong.textContent.trim();
        
        // Clean up price information if it exists - remove everything from USD onwards
        if (colorText.toLowerCase().includes('usd')) {
          const usdIndex = colorText.toLowerCase().indexOf('usd');
          colorText = colorText.substring(0, usdIndex).trim();
        }
        
        // Also remove any dollar amounts
        colorText = colorText.replace(/\$[\d.,]+/g, '').trim();
        colorText = colorText.replace(/\d+\.\d{2}/g, '').trim();
        
        if (colorText.includes("|")) {
          const parts = colorText.split("|").map((p) => p.trim());
          colorName = parts.join(" ").trim();
          colorCode = parts[0].substring(0, 3).toUpperCase();
        } else {
          colorName = colorText || "Unknown Color";
          colorCode = colorText ? colorText.substring(0, 3).toUpperCase() : "UNK";
        }
        
        // Final cleanup of color name
        if (colorName.toLowerCase().includes('usd')) {
          colorName = colorName.substring(0, colorName.toLowerCase().indexOf('usd')).trim();
        }
      }
      const codeEl = productFabricText.querySelector("p:not(.strong)");
      if (codeEl) {
        styleId = codeEl.textContent.trim();
        // Optional hints from style pattern
        if (styleId.match(/3[WM]F100/)) productHint = "Cloudrunner 2";
        if (styleId.match(/3[WM]F305/)) productHint = "Cloudmonster 2";
        if (styleId.match(/3[WM]F200/)) productHint = "Cloudsurfer 2";
        if (styleId.match(/3[WM]F400/)) productHint = "Cloudflow 5";
        if (styleId.match(/3[WM]F500/)) productHint = "Cloud 6";
        if (styleId.match(/3[WM]F600/)) productHint = "Cloudboom Strike";
      }
    }

    // alt text hints
    const img = row.querySelector("img");
    if (img?.alt && /cloud/i.test(img.alt)) {
      const m = img.alt.match(/(cloud[\w\s]+)/i);
      if (m) productHint = m[1].trim();
    }

    return {
      productName: productHint || "ON Running Shoe",
      styleId,
      colorCode,
      colorName
    };
  }

  extractStockStatusesFromRow(row) {
    const stockStatuses = [];
    row.querySelectorAll(".product").forEach((cell) => {
      const headerElement = cell.querySelector(".product-header");
      if (headerElement) {
        const statusSpan = headerElement.querySelector("span");
        if (statusSpan) {
          stockStatuses.push(statusSpan.textContent.trim());
        } else {
          const input = cell.querySelector("input[disabled]");
          stockStatuses.push(input ? "No Stock" : "Unknown");
        }
      } else {
        stockStatuses.push("Unknown");
      }
    });
    return stockStatuses;
  }

  convertStockStatusToQuantity(stockStatus) {
    const map = {
      "In Stock": 30,
      "Low Stock": 5,
      "Very Low Stock": 2,
      "No Stock": 0,
      Unknown: 0
    };
    return map[stockStatus] ?? 0;
  }

  extractFromAlternativeStructure() {
    const inventory = [];
    const stockEls = document.querySelectorAll('[title*="Stock"]');
    if (!stockEls.length) return inventory;

    const rows = document.querySelectorAll('[class*="row"], [data-v-4b83b133]');
    rows.forEach((row, rowIndex) => {
      const statusEls = row.querySelectorAll('[title*="Stock"]');
      if (statusEls.length >= 5) {
        const productInfo = {
          productName: `ON Product ${rowIndex + 1}`,
          styleId: `ON${rowIndex + 1}`,
          colorCode: "UNK",
          colorName: "Unknown"
        };
        const sizes = ["5", "5.5", "6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "13.5", "14", "14.5", "15"];
        const gender = resolveGender({
          productName: productInfo.productName,
          styleId: productInfo.styleId,
          sizes
        });
        statusEls.forEach((el, i) => {
          const status = el.getAttribute("title");
          const size = sizes[i] || `${i + 5}`;
          const quantity = this.convertStockStatusToQuantity(status);
          inventory.push({
            productName: productInfo.productName,
            styleId: productInfo.styleId,
            colorCode: productInfo.colorCode,
            colorName: productInfo.colorName,
            sizeUS: size,
            stockStatus: status,
            quantity,
            gender,
            extractedAt: new Date().toISOString(),
            url: window.location.href,
            source: "alternative"
          });
        });
      }
    });

    return inventory;
  }

  loadShopifySettings() {
    const saved = localStorage.getItem("onRunningShopifySettings");
    if (saved) {
      try {
        this.shopifySettings = { ...this.shopifySettings, ...JSON.parse(saved) };
      } catch (e) {
        console.error("Settings parse error:", e);
      }
    }
  }

  showSettingsModal() {
    this.loadShopifySettings();

    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); z-index: 20000;
      display: flex; align-items: center; justify-content: center;
    `;
    const modalContent = document.createElement("div");
    modalContent.style.cssText = `
      background: white; padding: 30px; border-radius: 12px; max-width: 600px;
      width: 90%; max-height: 80%; overflow-y: auto; 
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      border-top: 4px solid #ff6b35;
    `;

    modalContent.innerHTML = `
      <h3 style="margin-bottom: 20px; color: #333;">⚙️ ON Running Export Settings</h3>
      <div style="margin-bottom: 15px;">
        <label style="display:block;margin-bottom:5px;font-weight:600;">Vendor:</label>
        <input type="text" id="vendor" value="${this.shopifySettings.vendor}" style="width:100%;padding:10px;border:2px solid #e1e5e9;border-radius:6px;">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display:block;margin-bottom:5px;font-weight:600;">Default Price ($):</label>
        <input type="number" step="0.01" id="variantPrice" value="${this.shopifySettings.variantPrice}" style="width:100%;padding:10px;border:2px solid #e1e5e9;border-radius:6px;">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display:block;margin-bottom:5px;font-weight:600;">Tags:</label>
        <input type="text" id="tags" value="${this.shopifySettings.tags}" style="width:100%;padding:10px;border:2px solid #e1e5e9;border-radius:6px;">
      </div>
      <div style="margin-bottom: 15px;">
        <label style="display:block;margin-bottom:5px;font-weight:600;">Location Name:</label>
        <input type="text" id="locationName" value="${this.shopifySettings.locationName}" style="width:100%;padding:10px;border:2px solid #e1e5e9;border-radius:6px;">
      </div>
      <div style="text-align:center;margin-top:25px;">
        <button id="saveSettings" style="background:#ff6b35;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;margin-right:10px;font-weight:bold;">
          Save Settings
        </button>
        <button id="closeSettings" style="background:#6c757d;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-weight:bold;">
          Cancel
        </button>
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    modal.querySelector("#saveSettings").onclick = () => {
      this.shopifySettings = {
        ...this.shopifySettings,
        vendor: modal.querySelector("#vendor").value,
        variantPrice: modal.querySelector("#variantPrice").value,
        tags: modal.querySelector("#tags").value,
        locationName: modal.querySelector("#locationName").value
      };
      localStorage.setItem("onRunningShopifySettings", JSON.stringify(this.shopifySettings));
      document.body.removeChild(modal);
      this.showSuccessMessage("Settings saved!");
    };
    modal.querySelector("#closeSettings").onclick = () => document.body.removeChild(modal);
    modal.onclick = (e) => {
      if (e.target === modal) document.body.removeChild(modal);
    };
  }

  downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  showSuccessMessage(message) {
    const notification = document.createElement("div");
    notification.innerHTML = message;
    notification.style.cssText = `
      position: fixed; top: 150px; right: 20px; z-index: 10000;
      background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
      color: white; padding: 20px 25px; border-radius: 10px;
      box-shadow: 0 5px 20px rgba(40,167,69,0.4);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-weight: 600; font-size: 16px;
      animation: slideInRight 0.5s ease-out;
      max-width: 350px; word-wrap: break-word;
    `;
    document.head.insertAdjacentHTML(
      "beforeend",
      `<style>@keyframes slideInRight{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}</style>`
    );
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) document.body.removeChild(notification);
    }, 8000);
  }

  showDebugInfo() {
    const modal = document.createElement("div");
    modal.className = "on-debug-modal";
    
    // Collect debug information
    const debugInfo = {
      url: window.location.href,
      productGroups: document.querySelectorAll(".product-group-cnt").length,
      headerRows: document.querySelectorAll(".row.header").length,
      productRows: document.querySelectorAll(".row.product-fabric").length,
      stockElements: document.querySelectorAll('[title*="Stock"]').length,
      alternativeRows: document.querySelectorAll('[class*="row"], [data-v-4b83b133]').length
    };

    // Try to extract actual sizes from the page using the CORRECT selector
    const headerRow = document.querySelector(".row.header");
    let sizesFound = [];
    if (headerRow) {
      // NEW: Check for always-visible-size-type (the actual selector we use)
      headerRow.querySelectorAll(".column .size-cnt .always-visible-size-type").forEach((el) => {
        const s = el.textContent.trim();
        if (/^\d+(?:\.\d)?$/.test(s)) {
          sizesFound.push(s);
        }
      });
    }

    // Check how many product columns exist (should match sizes)
    let productColumns = 0;
    const firstProductRow = document.querySelector(".row.product-fabric");
    if (firstProductRow) {
      productColumns = firstProductRow.querySelectorAll(".column .product").length;
    }

    // Alternative size detection
    let altSizesFound = [];
    document.querySelectorAll(".always-visible-size-type").forEach((el) => {
      const text = el.textContent.trim();
      if (/^\d+(?:\.\d)?$/.test(text)) {
        altSizesFound.push(text);
      }
    });

    // Check all elements with "us" class
    let allUSElements = [];
    document.querySelectorAll(".us").forEach((el) => {
      allUSElements.push(el.textContent.trim());
    });

    // Sample a product row for structure
    const sampleRow = document.querySelector(".row.product-fabric");
    let sampleRowHTML = sampleRow ? sampleRow.outerHTML.substring(0, 500) + "..." : "No product row found";
    
    const modalContent = `
      <div class="on-debug-content">
        <h3>🔍 ON Running Scraper Debug Info</h3>
        
        <h4 style="color: #ff6b35; margin-top: 20px;">Page Structure:</h4>
        <pre>URL: ${debugInfo.url}
Product Groups (.product-group-cnt): ${debugInfo.productGroups}
Header Rows (.row.header): ${debugInfo.headerRows}
Product Rows (.row.product-fabric): ${debugInfo.productRows}
Product Columns in First Row: ${productColumns}
Stock Status Elements: ${debugInfo.stockElements}
Alternative Structure Rows: ${debugInfo.alternativeRows}</pre>

        <h4 style="color: ${sizesFound.length === productColumns ? '#28a745' : '#dc3545'}; margin-top: 20px;">
          Size Detection Results: ${sizesFound.length === productColumns ? '✅ MATCH' : '⚠️ MISMATCH'}
        </h4>
        <pre style="background: ${sizesFound.length === productColumns ? '#d4edda' : '#f8d7da'};">
<strong>CORRECT Method (.column .size-cnt .always-visible-size-type):</strong>
Found ${sizesFound.length} US sizes: ${sizesFound.length > 0 ? sizesFound.join(", ") : "NONE FOUND"}

<strong>Product Columns Found:</strong> ${productColumns}
<strong>Status:</strong> ${sizesFound.length === productColumns ? 'Sizes match product columns! ✅' : `MISMATCH! ${sizesFound.length} sizes vs ${productColumns} columns ⚠️`}

Alternative Method (all .always-visible-size-type):
Found ${altSizesFound.length} sizes: ${altSizesFound.length > 0 ? [...new Set(altSizesFound)].join(", ") : "NONE FOUND"}

All .us Elements (${allUSElements.length} total):
${allUSElements.length > 0 ? [...new Set(allUSElements)].slice(0, 30).join(", ") : "NONE FOUND"}
${allUSElements.length > 30 ? "... (showing first 30)" : ""}</pre>

        <h4 style="color: #ff6b35; margin-top: 20px;">Sample Product Row HTML:</h4>
        <pre style="font-size: 10px; max-height: 200px; overflow-y: auto;">${sampleRowHTML.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>

        <h4 style="color: #ff6b35; margin-top: 20px;">Selector Tests:</h4>
        <pre>Testing size selectors:
<strong>✅ .column .size-cnt .always-visible-size-type:</strong> ${document.querySelectorAll(".column .size-cnt .always-visible-size-type").length} elements
.always-visible-size-type: ${document.querySelectorAll(".always-visible-size-type").length} elements
.size-cnt .us: ${document.querySelectorAll(".size-cnt .us").length} elements
.size-cnt: ${document.querySelectorAll(".size-cnt").length} elements
.us: ${document.querySelectorAll(".us").length} elements
[class*="size"]: ${document.querySelectorAll('[class*="size"]').length} elements

Testing product selectors:
.column .product: ${document.querySelectorAll(".column .product").length} elements
.product .product-header: ${document.querySelectorAll(".product .product-header").length} elements</pre>

        <div style="text-align: center; margin-top: 20px;">
          <button onclick="this.closest('.on-debug-modal').remove()" style="background: #ff6b35; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: bold;">
            Close
          </button>
        </div>
      </div>
    `;
    
    modal.innerHTML = modalContent;
    document.body.appendChild(modal);
    
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
  }
}

// ---------------------------------------------
// Bootstrapping
// ---------------------------------------------
function initializeONRunningExtractor() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(() => new ONRunningInventoryExtractor(), 1000));
  } else {
    setTimeout(() => new ONRunningInventoryExtractor(), 1000);
  }
}
initializeONRunningExtractor();

// React to SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(() => new ONRunningInventoryExtractor(), 2000);
  }
}).observe(document, { subtree: true, childList: true });

// Extension message listener (optional)
if (typeof chrome !== "undefined" && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extractInventory") {
      try {
        const extractor = new ONRunningInventoryExtractor();
        const result = extractor.extractONRunningInventory("inventory");
        sendResponse({ success: true, count: result.count });
      } catch (error) {
        console.error("Message handler error:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    } else if (message.action === "scrapeBothGenders") {
      try {
        const extractor = new ONRunningInventoryExtractor();
        extractor.scrapeBothGenders().then(result => {
          if (result.navigating) {
            // Don't send response yet - we're navigating
            sendResponse({ success: true, navigating: true });
          } else {
            sendResponse(result);
          }
        }).catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      } catch (error) {
        console.error("Message handler error:", error);
        sendResponse({ success: false, error: error.message });
      }
      return true; // Keep message channel open for async response
    }
  });
}

console.log(" ON Running Enhanced Scraper Loaded Successfully!");
console.log("✅ INVENTORY CSV FORMAT FIXED - Now matches Shopify standards");
console.log("✅ SIZE FORMAT FIXED - Whole sizes now have .0 appended (7.0, 8.0, etc.)");
console.log("STOCK STATUS MAPPING: In Stock=30, Low Stock=5, Very Low Stock=2, No Stock=0");
console.log('Handles now include gender (mens/womens) when resolvable.');
console.log('Product Category simplified to "Athletic Shoes".');