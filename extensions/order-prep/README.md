# Run House Order Prep

Sets up a supplier order for one dropship order, from the **Late orders** page,
and stops before anything is ordered. **HOKA**, **ON** and **Brooks**.

## Brooks (Prep in Brooks)

1. opens FastTrack's basket, which must be **empty** (otherwise it does nothing);
2. for each colourway searches `<style>-<colour>` from our SKU, picks the
   **1005 Needham** ship-to tab and types each pair into its colour, width and size box,
   then Add items (a size Brooks cannot supply is listed, not guessed);
3. basket: **Drop ship**, fills the customer's address (email needham@therunhouse.com, so the
   tracking updater sees Brooks' shipping mail; the store phone), then **waits for you to tick the
   resale certificate box**, then presses Apply (an international order gets no drop ship and ships to the store);
4. types the PO into the delivery line's order reference (20 characters at most);
5. **stops**: you press Step 1/2: Validate availability and Step 2/2: Place basket.

## ON (Prep in ON)

The path staff use: Start a re-order, then a One time address.

1. opens ON's re-order product selection and ticks each model on the order;
2. Continue, then types each pair into its box on the quantity grid (by the
   barcode when ours is ON's EAN, otherwise by article code and size from the SKU);
   a size with no box is out of stock and is listed, not guessed;
3. Continue, and Continue on "some items have no quantities" (only the empty colours go);
   **ON saves a draft here**, in My orders;
4. checkout: types the PO into PO Name (ON allows 20 characters), picks One time address,
   fills it and saves the address (an international order keeps the Default address);
5. **stops**: a person presses Submit order.

Pressing **Prep in HOKA** on an order:

1. opens HOKA's B2B cart in a new tab;
2. checks the cart is empty (if not, it does nothing, so two orders never mix);
3. uploads the order's HOKA items as a "UPC & Quantity" spreadsheet through HOKA's own Upload;
4. fills and saves the one-time drop-ship address (left off for an international order, which ships to the store);
5. picks "as soon as possible" delivery;
6. types the PO (`<order number>_<last name>`);
7. **stops**, with a banner: check the cart, then press **Submit Order** yourself.

It never submits. Every click goes through one guard that refuses Submit,
Save As Draft, Clear All and Place order (and on ON and Brooks also Place
basket, Validate, Clear, Delete and Discard), and `test/never-submits.mjs` fails
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
    node extensions/order-prep/test/on.mjs             # ON: our line to ON's grid, and the guard
    node extensions/order-prep/test/brooks.mjs         # Brooks: our SKU to FastTrack's grid, and the guard
