#!/usr/bin/env python3
"""
SHOPIFY CSV TO BARCODE DATABASE CONVERTER (FIXED VERSION)

Handles Shopify's CSV format where title only appears on first row.

USAGE:
  python3 csv-to-barcode-db-fixed.py <shopify-export.csv>
"""

import csv
import json
import sys
import re

def clean_title(title):
    """Clean product title for use as key"""
    # Remove special characters
    cleaned = re.sub(r'[^a-zA-Z0-9\s]', '', title)
    # Replace spaces with underscores
    cleaned = re.sub(r'\s+', '_', cleaned)
    return cleaned

def process_shopify_csv(csv_file):
    """Process Shopify export CSV - handles title only on first row"""
    
    barcode_db = {}
    current_title = ''
    
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            # Get title - if empty, use previous title
            title = row.get('Title', '').strip()
            if title:
                current_title = title
            else:
                title = current_title
            
            # Skip if still no title
            if not title:
                continue
            
            # Get barcode - remove leading single quote if present
            variant_barcode = row.get('Variant Barcode', '').strip()
            if variant_barcode.startswith("'"):
                variant_barcode = variant_barcode[1:]
            
            # Skip if no barcode
            if not variant_barcode:
                continue
            
            # Get variant options
            option1_value = row.get('Option1 Value', '').strip()  # Usually Size
            option2_value = row.get('Option2 Value', '').strip()  # Usually Width
            option3_value = row.get('Option3 Value', '').strip()  # Usually Color
            sku = row.get('Variant SKU', '').strip()
            
            # Create lookup key: Title_Size_Width
            key_parts = [clean_title(title)]
            
            if option1_value:  # Size
                key_parts.append(option1_value.replace(' ', '_').replace('.', '_'))
            
            if option2_value:  # Width (or could be color)
                # Only add if it looks like a width, not a color
                if any(w in option2_value.lower() for w in ['wide', 'narrow', 'standard', 'medium', 'regular']):
                    key_parts.append(option2_value.replace(' ', '_'))
            
            lookup_key = '_'.join(key_parts)
            
            # Store in database
            barcode_db[lookup_key] = {
                'barcode': variant_barcode,
                'title': title,
                'size': option1_value,
                'width': option2_value,
                'color': option3_value,
                'sku': sku
            }
    
    return barcode_db

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 csv-to-barcode-db-fixed.py <shopify-export.csv>")
        print("\nTo get the CSV:")
        print("1. Go to Shopify Admin -> Products")
        print("2. Click 'Export'")
        print("3. Select 'All products' and 'CSV' format")
        print("4. Download the file")
        sys.exit(1)
    
    csv_file = sys.argv[1]
    
    print(f"📊 Processing {csv_file}...")
    
    try:
        barcode_db = process_shopify_csv(csv_file)
        
        # Save to JSON
        output_file = 'barcode-database.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(barcode_db, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Created {output_file}")
        print(f"📦 Total products with barcodes: {len(barcode_db)}")
        
        # Show sample entries
        print("\n📋 Sample entries:")
        for i, (key, data) in enumerate(list(barcode_db.items())[:5]):
            print(f"\n  Key: {key}")
            print(f"    Barcode: {data['barcode']}")
            print(f"    Title: {data['title']}")
            print(f"    Size: {data['size']}")
            print(f"    Width: {data['width']}")
        
        print(f"\n💡 Next step: Replace barcode-database.json in extension folder")
        print(f"💡 Then reload extension in chrome://extensions/")
        
    except FileNotFoundError:
        print(f"❌ Error: Could not find file '{csv_file}'")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()