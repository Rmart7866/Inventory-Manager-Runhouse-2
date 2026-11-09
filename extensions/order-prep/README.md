# Run House Order Prep

Sets up a supplier cart for one dropship order, from the **Late orders** page,
and stops before anything is ordered. HOKA only for now.

Pressing **Prep in HOKA** on an order:

1. opens HOKA's B2B cart in a new tab;
2. checks the cart is empty (if not, it does nothing, so two orders never mix);
3. uploads the order's HOKA items as a "UPC & Quantity" spreadsheet through HOKA's own Upload;
4. fills and saves the one-time drop-ship address (left off for an international order, which ships to the store);
5. picks "as soon as possible" delivery;
6. types the PO (`<order number>_<last name>`);
7. **stops**, with a banner: check the cart, then press **Submit Order** yourself.

It never submits. Every click goes through one guard that refuses Submit,
Save As Draft, Clear All and Place order, and `test/never-submits.mjs` fails
if a click ever bypasses it. It is plain code, no AI.

## Install (once per computer)

1. Chrome, `chrome://extensions`, turn on **Developer mode** (top right).
2. **Load unpacked**, pick this folder: `extensions/order-prep` in the repo.
3. Reload the Late orders page. The button works once the extension is in.

After pulling a change to these files, press the reload arrow on the
extension's card at `chrome://extensions`; Chrome does not re-read it by itself.

You must already be logged in to HOKA's B2B site in the same Chrome.

## Tests

    node extensions/order-prep/test/xlsx.mjs           # the spreadsheet opens, UPCs stay text
    node extensions/order-prep/test/never-submits.mjs  # every click goes through the guard
