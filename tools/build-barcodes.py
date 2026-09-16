#!/usr/bin/env python3
# Build barcode-data.js from the raw supplier files in ../barcodes/.
#
# The raw files (ASICS order-form CSVs, the ON pricat xlsx) are gitignored and
# NEVER shipped: they contain wholesale prices and order data. This script
# extracts ONLY the barcode map (style/color/size -> EAN) into barcode-data.js,
# which the app loads so users never re-upload barcodes.
#
# Refresh after dropping new files in barcodes/:  python3 tools/build-barcodes.py

import csv, re, os, glob, json
HERE = os.path.dirname(os.path.abspath(__file__))
BARCODES = os.path.join(HERE, '..', 'barcodes')
OUT = os.path.join(HERE, '..', 'barcode-data.js')

def nsize(s):
    """Normalize a size the SAME way the converters' _normUpcSize does in JS:
    '8'->'8', '8.5'->'8.5', 'K12.5'->'K12.5'. Returns None if not a shoe size."""
    s = str(s).strip()
    m = re.match(r'^(K?)(\d{1,2}(\.5)?)$', s, re.I)
    if not m:
        return None
    n = float(m.group(2))
    num = str(int(n)) if n == int(n) else str(n)
    return ('K' if m.group(1) else '') + num

def nsize_apparel(s):
    """Normalize an APPAREL size the same way OnApparelConverter.normalizeSize
    does in JS. The two must agree exactly or a barcode never finds its variant.

    The store, the pricat and ordinary typing disagree about how to write one
    size: 'X-Small' / 'XS' / 'XSmall', and at the top end '2X-Large' / 'XXL' /
    '2XL'. Collapse them. Bra cup ranges ('S D-DD') are kept as a suffix, or
    every cup of a size would share one key. Returns None if it is not a size.
    """
    s = str(s).strip().upper()
    if not s:
        return None
    if s in ('-', 'OS') or re.match(r'^ONE\s*SIZE$', s):
        return 'OS'                       # the pricat writes one-size as "-"
    cup = ''
    m = re.search(r'\(?\s*([A-Z])\s*-\s*(DD|[A-Z])\s*\)?\s*$', s)
    if m and m.group(1) in 'ABCD':
        cup = '|' + m.group(1) + '-' + m.group(2)
        s = s[:m.start()].strip()
    s = re.sub(r'[\s()-]', '', s)
    m = re.match(r'^(\d+)?(X*)(SMALL|MEDIUM|LARGE|S|M|L)$', s)
    if not m:
        return None
    word = m.group(3)
    base = 'S' if word in ('SMALL', 'S') else ('M' if word in ('MEDIUM', 'M') else 'L')
    if base == 'M':
        return 'M' + cup
    mult = int(m.group(1)) if m.group(1) else len(m.group(2) or '')
    if not mult:
        return base + cup
    return ('X' if mult == 1 else str(mult) + 'X') + base + cup

def nprice(s):
    """MSRP only (retail, public). '$230' -> '230.00'. Ignores blanks.

    A NON-POSITIVE PRICE IS NOT A PRICE. Two Brooks rows carry a literal 0 in
    RETAIL_PRICE, and the old guard only rejected "no digits at all", so those
    shipped as "0.00" and would have prefilled a new product at zero. Absent is
    the safe answer: the enrichment modal falls back to the brand default and a
    human still sees the field. This is the same shape as the blank-cell bug
    that once wrote specs of 0, so it is guarded here rather than downstream.
    """
    m = re.search(r'(\d+(?:\.\d+)?)', str(s))
    if not m:
        return None
    v = float(m.group(1))
    if v <= 0:
        return None
    return '%.2f' % v

# ---- ASICS: order-form CSVs. barcode key "TradingCode-ColorCode|USsize" -> EAN.
# price key "TradingCode-ColorCode" -> Suggested Retail Price (MSRP, public). ----
asics = {}
asics_price = {}
for f in glob.glob(os.path.join(BARCODES, '*.csv')):
    try:
        rows = list(csv.reader(open(f, newline='', encoding='utf-8-sig')))
    except Exception:
        continue
    hi = next((i for i, r in enumerate(rows[:8]) if any('EAN' in str(c) for c in r)), None)
    if hi is None:
        continue
    idx = {str(n).strip(): j for j, n in enumerate(rows[hi])}
    if 'EAN code' not in idx or 'Trading code' not in idx:
        continue
    for r in rows[hi + 1:]:
        def g(n):
            j = idx.get(n)
            return '' if j is None or j >= len(r) else str(r[j]).strip()
        ean, tc, cc, sz = g('EAN code'), g('Trading code').upper(), g('Color code'), nsize(g('Size US'))
        if ean and tc and cc and sz:
            asics[tc + '-' + cc + '|' + sz] = ean
        if tc and cc:
            p = nprice(g('Suggested Retail Price'))
            if p:
                asics_price[tc + '-' + cc] = p

# ---- ON: pricat xlsx. barcode key "ItemCode|USsize" -> EAN.
# price key "ItemCode" -> Retail Price (MSRP, public). ----
on = {}
on_apparel = {}
on_price = {}
try:
    from openpyxl import load_workbook
    for f in glob.glob(os.path.join(BARCODES, '*.xlsx')):
        ws = load_workbook(f, read_only=True, data_only=True).worksheets[0]
        it = ws.iter_rows(values_only=True)
        hdr = list(next(it)); idx = {n: i for i, n in enumerate(hdr)}
        if 'Item Code' not in idx or 'EAN Barcode' not in idx:
            continue
        for r in it:
            def g(n):
                i = idx.get(n)
                return '' if i is None or i >= len(r) or r[i] is None else str(r[i]).strip()
            code, ean = g('Item Code').upper(), g('EAN Barcode')
            raw = g('US Size') or g('Size')
            sz = nsize(raw)
            if code and ean and sz:
                on[code + '|' + sz] = ean
            # APPAREL. The same pricat carries the garments, 2,792 rows of them,
            # but their sizes are words (XS, S, M, XXL, "S D-DD") so nsize above
            # rejects every one and they were all being discarded. Footwear codes
            # start with 3 and apparel with 1, so they cannot collide; keep them
            # in their own map, keyed the way OnApparelConverter normalizes.
            elif code.startswith('1') and ean:
                asz = nsize_apparel(raw)
                if asz:
                    on_apparel[code + '|' + asz] = ean
            if code:
                p = nprice(g('Retail Price'))
                if p:
                    on_price[code] = p
except ImportError:
    print('  (openpyxl not installed — skipping ON pricat)')

# ---- BROOKS: the UPC workbook, one sheet per season. barcode key is Brooks's
# own ITEM_NUMBER ("1104962E020.070") -> UPC. The converter decodes its scraper
# SKU into that shape before looking up, see brooksItemNumber in
# brooks-converter.js and in tools/backfill-brooks-barcodes.mjs.
#
# ONLY THE NEWEST SEASONS. The workbook goes back to S2023 and holds 52,936
# rows, which is 1.6 MB of JS the browser would load on every page view. What
# the tool actually needs is the seasons it can still create products from, so
# the older sheets are dropped. Widen BROOKS_SEASONS if a backfill needs them,
# or use tools/build-brooks-barcode-feed.py, which keeps the lot out of band.
BROOKS_SEASONS = ('F2027', 'S2027', 'F2026', 'S2026', 'F2025')
brooks = {}
# Brooks MSRP, keyed the way _barcodePriceFor looks it up: the IMAGE key, which
# for Brooks is the six digit style joined to the three digit colour
# ("110442048"), not the item number. ASICS and ON are keyed the same way, by
# whatever _imageKeyPatterns returns for that brand.
#
# RETAIL_PRICE ONLY. The workbook also carries a WHOLESALE column, and this file
# is committed, so that column must never be read here.
brooks_price = {}
BROOKS_ITEM = re.compile(r'^(\d{6})(\d[A-Z0-9])(\d{3})\.')
try:
    from openpyxl import load_workbook
    # The workbook lives in barcodes/ like the others, or in the repo root where
    # it was first dropped.
    books = glob.glob(os.path.join(BARCODES, '*UPC Codes*.xlsx')) \
        + glob.glob(os.path.join(HERE, '..', '*UPC Codes*.xlsx'))

    # NEWEST EDITION FIRST, because the loops below are first-wins.
    #
    # This used to be a plain sorted(), which sorts by PATH, and a path sorts on
    # nothing that has to do with age: "../S2027 UPC Codes 051826.xlsx" beat
    # "../barcodes/F2027 UPC Codes 091426.xlsx" purely because "S" < "b" in
    # ASCII. The result was a July price book silently overriding a September
    # one, and 20 colorways shipped a stale MSRP (Addiction Walker 2 at 130 when
    # Brooks had moved it to 140, Beast GTS 26 at 170 when it had dropped to
    # 160). Barcodes survived that unharmed, since a UPC does not change, but
    # prices did not.
    #
    # Brooks stamps the edition date into the filename as MMDDYY ("UPC Codes
    # 091426"), which is the real ordering key. Fall back to the file's mtime
    # when a name does not carry one.
    def edition(path):
        m = re.search(r'(\d{2})(\d{2})(\d{2})(?!.*\d)', os.path.basename(path))
        if m:
            mm, dd, yy = (int(x) for x in m.groups())
            if 1 <= mm <= 12 and 1 <= dd <= 31:
                return (1, 2000 + yy, mm, dd)
        return (0, os.path.getmtime(path), 0, 0)

    for f in sorted(books, key=edition, reverse=True):
        wb = load_workbook(f, read_only=True, data_only=True)
        for sheet in wb.sheetnames:
            # BARCODES are capped to the newest seasons for size, see above.
            # PRICES are not: one MSRP per colorway is about 25 KB for the whole
            # ten season history, against 1.6 MB for the barcodes, and a
            # colorway we are only now creating is often two seasons old. So
            # every sheet is read, and only the barcode half is gated.
            want_barcodes = sheet in BROOKS_SEASONS
            it = wb[sheet].iter_rows(values_only=True)
            hdr = list(next(it))
            idx = {str(n).strip(): i for i, n in enumerate(hdr) if n is not None}
            if 'ITEM_NUMBER' not in idx or 'UPC' not in idx:
                continue
            for r in it:
                def g(n):
                    i = idx.get(n)
                    return '' if i is None or i >= len(r) or r[i] is None else str(r[i]).strip()
                item, upc = g('ITEM_NUMBER').upper(), g('UPC')
                # First season wins. Sheets run newest first and a repeated
                # ITEM_NUMBER is the same physical shoe.
                if want_barcodes and item and upc and item not in brooks:
                    brooks[item] = upc
                # One MSRP per COLORWAY, not per size, so the price map stays
                # small. The colour lives in the item number on every sheet;
                # NRF_COLOR only exists on the 2027 ones.
                m = BROOKS_ITEM.match(item)
                if m:
                    code = m.group(1) + m.group(3)
                    if code not in brooks_price:
                        pr = nprice(g('RETAIL_PRICE'))
                        if pr:
                            brooks_price[code] = pr
        wb.close()
except ImportError:
    print('  (openpyxl not installed — skipping Brooks UPC workbook)')

data = {'asics': asics, 'on': on, 'onApparel': on_apparel, 'brooks': brooks,
        'prices': {'asics': asics_price, 'on': on_price, 'brooks': brooks_price}}
body = (
    '// AUTO-GENERATED by tools/build-barcodes.py — do not edit by hand.\n'
    '// Barcode maps only (style/color/size -> EAN); no pricing. The raw supplier\n'
    '// files stay in the gitignored barcodes/ folder. Regenerate after adding\n'
    '// files:  python3 tools/build-barcodes.py\n'
    'var BarcodeData = ' + json.dumps(data, separators=(',', ':')) + ';\n'
    "if (typeof module !== 'undefined' && module.exports) module.exports = BarcodeData;\n"
)
open(OUT, 'w').write(body)
print('barcodes  asics: %d  on: %d  onApparel: %d  brooks: %d   |   prices  asics: %d  on: %d  brooks: %d   ->  barcode-data.js (%.1f KB)' % (
    len(asics), len(on), len(on_apparel), len(brooks), len(asics_price), len(on_price), len(brooks_price), os.path.getsize(OUT) / 1024))
