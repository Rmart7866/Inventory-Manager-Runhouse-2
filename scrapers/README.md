# Scrapers

The Chrome extensions that pull inventory off each supplier's B2B portal, plus a
few standalone converter pages. They were living unversioned in
`~/Desktop/chrome extensions/`; this is that folder, imported as-is so changes
are reviewable and revertible. They feed the Inventory Manager, so they belong
next to it.

Load one in Chrome with **chrome://extensions -> Developer mode -> Load
unpacked**, pointed at the folder here. If you already have the Desktop copy
loaded, remove it first so you are not running two builds of the same scraper.

| Folder | Portal | Notes |
|---|---|---|
| `asics/` | ASICS B2B | The current one, was `asics-scraper-2` |
| `asics-v1/` | ASICS B2B | The older build, kept for reference |
| `brooks/` | Brooks B2B | |
| `hoka/` | HOKA B2B | |
| `newbalance/` | New Balance B2B | |
| `on/` | ON `backstage.on-running.com` | Footwear works. Apparel needs care, see below |
| `puma/` | PUMA B2B | |
| `barcode/` | Shopify admin | Prints barcode labels. `csv-to-barcode-db.py` rebuilds its database from a Shopify products export |
| `shipping/` | Shopify admin | |
| `csv-creators/` | none | Standalone HTML converters, predate the Inventory Manager |

## What is deliberately not here

Anything generated or exported: scrape output CSVs, `products_export*`, and
`barcode/barcode-database-corrected.json` (3 MB, derived from a Shopify export,
regenerate it with `csv-to-barcode-db.py`). The repo is public and the root
`.gitignore` already blocks `*.csv` and `*.xlsx`, so supplier data cannot land
here by accident. Keep it that way.

## ON and apparel

The ON scraper was written for footwear and reads sizes as numbers. Apparel
sizes are words (`X-Small`, `Small`, `2X-Large`), and bras carry cup ranges
(`Small A-C`). See `on/content.js` `extractSizeHeaders`: it must return the
labels the portal actually shows, and it must **never** invent a size ladder
when it finds none. A fabricated ladder is worse than an empty scrape, because
the stock numbers are zipped onto it positionally and the file then looks
plausible while every quantity sits on the wrong size.

Article codes tell footwear and apparel apart: footwear is `3xx`
(`3WF10060755`), apparel is `1xx` (`1WE11860553`). The letter after the digit is
the gender, `W` for women and `M` for men.
