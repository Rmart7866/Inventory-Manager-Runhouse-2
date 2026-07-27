#!/usr/bin/env python3
# build-saucony-colorway-feed.py, The Run House.
#
# Reads the Saucony "CatalogUPCs-<season>.xlsx" At-Once export (sheet "UPCs") and
# writes saucony-colorway-feed.json: one record per style/color/width, each with
# its size rows (size number + UPC). This is the color-aware companion to
# saucony-feed-sizes.json. It exists so backfill-saucony-skus.mjs can match a
# SKU-less Shopify product to its feed colorway BY NAME (the SKU-less products
# carry no style code, only a colour name in the title), then read the exact
# style number and UPC to build the variant SKU the pipeline would have written.
#
# WHAT IS EMITTED, and what is NOT. Only Style #, the model name, the colour
# description, the width, and per-size (Dim 1 + UPC). WHSL (wholesale cost) is
# read past and never written, same as every other Saucony tool. MSRP is not
# needed here (backfill sets SKU and barcode, not price) so it is dropped too.
# The result carries no pricing at all.
#
# Run:  python3 tools/build-saucony-colorway-feed.py "CatalogUPCs-....xlsx"
#       (defaults to the CatalogUPCs file in the repo root if not given)
#
# House style: no em dashes.

import sys, os, glob, json, openpyxl

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def find_default():
    hits = glob.glob(os.path.join(ROOT, 'CatalogUPCs*.xlsx'))
    if not hits:
        raise SystemExit('No CatalogUPCs*.xlsx in the repo root. Pass the path explicitly.')
    return sorted(hits)[-1]

def main(argv):
    src = argv[0] if argv else find_default()
    print('Reading', os.path.basename(src), file=sys.stderr)
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = None
    for name in wb.sheetnames:
        if name.strip().lower() in ('upc', 'upcs'):
            ws = wb[name]; break
    if ws is None:
        ws = wb[wb.sheetnames[0]]

    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    H = {}
    for i, h in enumerate(header):
        if h is not None:
            H[str(h).strip().lower()] = i
    need = ['style #', 'style', 'color description', 'upc code', 'dim 1', 'dim 2']
    missing = [k for k in need if k not in H]
    if missing:
        raise SystemExit('Not a CatalogUPCs export, missing columns: ' + ', '.join(missing))

    def get(r, k):
        i = H.get(k)
        return '' if i is None or i >= len(r) or r[i] is None else r[i]

    by_key = {}
    order = []
    for r in rows:
        if not r:
            continue
        style_no = str(get(r, 'style #')).strip()
        if not style_no or style_no.lower() == 'style #':
            continue
        dim1 = str(get(r, 'dim 1')).strip()
        if not dim1:
            continue
        width = str(get(r, 'dim 2') or 'M').strip().upper()
        if width not in ('M', 'W', 'XW'):
            continue
        key = style_no + '|' + width
        if key not in by_key:
            style_text = str(get(r, 'style')).strip()
            product_name = (style_text.split(' - ')[0].strip() or style_text)
            by_key[key] = {
                'styleNumber': style_no,
                'productName': product_name,
                'colorName': str(get(r, 'color description')).strip(),
                'width': width,          # M | W | XW
                'sizes': [],
            }
            order.append(key)
        by_key[key]['sizes'].append({
            'dim1': dim1,
            'upc': str(get(r, 'upc code') or '').strip(),
        })

    out = [by_key[k] for k in order]
    dst = os.path.join(ROOT, 'saucony-colorway-feed.json')
    with open(dst, 'w') as f:
        json.dump(out, f)
    print('Wrote', len(out), 'colorway records to', os.path.basename(dst), file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1:])
