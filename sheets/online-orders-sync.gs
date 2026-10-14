/**
 * ONLINE SALES ORDERS : Shopify sync
 * The Run House. Paste into Extensions > Apps Script on the spreadsheet.
 *
 * Talks to runhouse-sheets-worker: read only, customer data, its own secret.
 *
 * ONE TAB PER PLACE THE WORK HAPPENS.
 *   Warehouse Shipouts, then a tab per store, then Closed Online Orders. A line
 *   is routed by the location its FULFILLMENT ORDER is assigned to, which is a
 *   real Shopify field, not a guess.
 *
 * NO PRODUCT TYPE FILTER, ON PURPOSE. An earlier version excluded footwear,
 * because shoe lines never appear on the warehouse sheet. Splitting by location
 * makes that unnecessary: measured 2026-09-29, ZERO of 243 warehouse lines were
 * footwear, while Needham's 68 lines were footwear entirely. Routing already
 * separates them, so every line is carried and nothing is silently dropped.
 *
 * WHAT IS EXCLUDED, and why it is not a location problem. Memberships and the
 * re:do returns fee are not shipouts. They are assigned to Scituate, which is
 * why Scituate looks busy in Shopify (204 lines) but has 1 real garment: 105
 * memberships, 98 re:do fees, 1 cap. The Worker drops those.
 *
 * COLUMNS ARE MATCHED BY HEADER TEXT, not by position, so the script writes the
 * columns it owns wherever they sit and people can reorder freely. The one
 * exception is the Names tab's date column, which has no header at all on the
 * live sheet and so is addressed by position. See NAMES_DATE_COL.
 *
 * WHAT IT OWNS. Only MACHINE_FIELDS, plus ON_CLOSE_FIELDS at the moment a row
 * moves to Closed. PO#, LOGO #, Vendor, Communication and the rest are typed by
 * people and are never written.
 *
 * ROWS STAY ALIGNED via the Shopify LINE ITEM ID in "_key". Known rows update in
 * place, new lines append, nothing is sorted or rewritten wholesale.
 *
 * IF A LINE CHANGES LOCATION it is MOVED to the right tab carrying its human
 * columns, not duplicated. Leaving a stale copy behind would have two people
 * picking the same garment.
 *
 * House style: no em dashes.
 */

var KEY_HEADER = '_key';
var CLOSED_SHEET = 'Closed Online Orders';

// A SEPARATE TAB FOR WHAT DID NOT SHIP.
//
// Closed used to hold everything that left the open queue, which meant a
// cancelled order sat in the shipping archive looking like a shipment whose
// tracking never arrived. Measured 2026-10-13 over 90 days: 198 cancelled lines
// and 516 refunded ones, against 1,243 that actually shipped. That is far too
// much to file next to real shipments.
var VOID_SHEET = 'Cancelled and Refunded';

var VOID_LAYOUT = [
  'Status', 'Date', 'Order Number', 'Customer', 'Quantity', 'Line Items: Name',
  'Cancel Reason', 'Cancelled On', 'Refunded On', 'Refunded Amount',
  'Ship From', 'Name Value',
  'PO#', 'Vendor', 'Order Processed Initials',
  KEY_HEADER
];

// Which tab a line belongs on, by its assigned location. Anything unrecognised
// falls through to the catch-all so a new location can never vanish silently.
//
// EVERY location that actually fulfils gets a tab, so Unrouted means
// "no location at all"
// rather than "a location nobody listed". Run Bus was the one that proved this
// matters: it had no OPEN lines when the tabs were first drawn, so it looked
// unnecessary, but 856 of the last 1,352 FULFILLED lines shipped from it. A
// tabless location silently pools in the catch-all.
var LOCATION_TABS = {
  'Warehouse': 'Warehouse Shipouts',
  'Needham': 'Needham',
  'Scituate': 'Scituate',
  'Walpole': 'Walpole',
  'Falmouth': 'Falmouth',
  'Run Bus': 'Run Bus',
  'Michigan Sales': 'Michigan Sales',
  'Florida Events': 'Florida Events'
};
var UNROUTED_TAB = 'Unrouted';

var MACHINE_FIELDS = {
  'Date': 'date',
  'Order Number': 'order',
  'Quantity': 'quantity',
  'Line Items: Name': 'lineName',
  'Ship From': 'shipFrom',
  'Route': 'route',
  'Customer': 'customer',
  'Name or Additional Option Print on Product?': 'hasPersonalisation',
  'Name Value': 'personalisation',
  'Upcharge': 'upcharge'
};

// Written only as a row moves to Closed, from /orders/fulfilled. An open line
// has not shipped, so it has no tracking to record yet.
//
// Ship From, Route and Name Value ARE in here, and that is not optional. They
// are not columns on the open tabs, so there is nothing to carry across, and
// without stamping them every closed row had three permanently blank columns.
var ON_CLOSE_FIELDS = {
  'Date Order Shipped Out to Customer': 'shippedAt',
  'Tracking Number to Customer': 'trackingNumber',
  'Carrier': 'trackingCompany',
  'Tracking Link': 'trackingUrl',
  'Ship From': 'shipFrom',
  'Route': 'route',
  'Name Value': 'personalisation',
  'Status': 'state',
  'Cancel Reason': 'cancelReason',
  'Cancelled On': 'cancelledAt',
  'Refunded On': 'refundedAt',
  'Refunded Amount': 'refundedAmount'
};

// YOUR 19 COLUMNS, IN YOUR EXACT ORDER AND WORDING, taken verbatim from the
// live sheet. An earlier version slotted the new working columns in at
// positions 5 to 10, which pushed every familiar column down and made the
// sheet unrecognisable to the people who use it. New columns go on the RIGHT,
// where they add without disturbing.
var OPEN_LAYOUT = [
  'Date',
  'Order Number',
  'Quantity',
  'Line Items: Name',
  'Name or Additional Option Print on Product?',
  'Packing Slip Printed?',
  'Location',
  'PO#',
  'LOGO #',
  'Communication made to store (i.e. who did you speak with and what is being done with product)',
  'Order Processed Initials',
  'Date Added to Cart',
  'Vendor',
  'Vendor Warehouse',
  'Date order was placed',
  'Who placed the order?',
  'Date Item Arrived to Warehouse',
  'Date Order Shipped Out to Customer',
  'Tracking Number to Customer',

  // Added by the sync, deliberately after your originals, and kept to the
  // minimum that earns its place.
  //
  // NOT HERE, on purpose:
  //   Ship From, Route   each open tab is already one location, so every row on
  //                      Needham would just read "Needham". Still written to
  //                      Closed, where everything lands in one tab.
  //   Name Value,        the Names tab now carries the placement, name and
  //   Upcharge           number in their own columns, which is what production
  //                      actually needs. Column 5 here already flags Yes or No.
  // MACHINE_FIELDS still knows all four, and the writer skips any header a sheet
  // does not have, so nothing breaks by their absence.
  'Customer',
  KEY_HEADER
];

// Closed is a tracking record, not a worksheet, so it is leaner and leads with
// what you look up afterwards. A few human columns ride along as history.
// Status leads, because "did this ship or was it cancelled" is the first thing
// anyone needs to know when looking a line up afterwards. Without it a cancelled
// order was indistinguishable from a shipment whose tracking never arrived.
var CLOSED_LAYOUT = [
  'Status', 'Date', 'Order Number', 'Customer', 'Quantity', 'Line Items: Name',
  'Ship From', 'Route', 'Name Value',
  'Date Order Shipped Out to Customer', 'Tracking Number to Customer',
  'Carrier', 'Tracking Link', 'Cancel Reason',
  'PO#', 'Vendor', 'Order Processed Initials',
  KEY_HEADER
];

// THE NAMES TAB, the personalisation print queue.
//
// This mirrors the Names tab already in use, 2,928 rows of it. A personalised
// line appears BOTH on its location tab (the garment still has to be picked and
// shipped) and here (it has to be printed first). That is how the sheet is used
// today, so the two are deliberately parallel rather than one replacing the
// other.
//
// WHAT IS NOW FILLED IN AUTOMATICALLY. Location and Name were retyped by hand
// from the order, in a dozen spellings: across the existing 2,928 rows,
// "sleeve", "Sleeve", "SLEEVE" and "Left Sleeve" are all the same instruction.
// Vopo puts the placement in the option NAME, so the Worker derives it and the
// spelling is consistent for free.
//
// COLOR AND PRINTED STAY HUMAN. Thread colour is a production decision that is
// nowhere in Shopify, and Printed is the thing a person ticks when it is done.
//
// NOT PURGED WHEN FULFILLED. The existing tab goes back months and is the print
// history, so a fulfilled line stays here rather than being moved to Closed.
var NAMES_SHEET = 'Names';

var NAMES_FIELDS = {
  'Order Number': 'order',
  'Quantity': 'quantity',
  'Line Items: Name': 'lineName',
  'Location': 'printPlacement',
  'Name': 'printName',
  'NUMBER': 'printNumber'
};

// BYTE EXACT to the live Names tab, quirks included:
//   column 1  has NO header at all, and holds the date
//   column 9  is 'Printed ' WITH a trailing space
//   columns 10 to 12 have no headers and carry overflow notes (660 cells in use)
// Reproducing them exactly means an existing tab is recognised rather than
// gaining a second set of near-identical columns on the right.
var NAMES_LAYOUT = [
  '', 'Order Number', 'Quantity', 'Line Items: Name',
  'Location', 'Color', 'Name', 'NUMBER', 'Printed ',
  '', '', '',
  KEY_HEADER
];

// The date column cannot be addressed by header because it has none, so it is
// addressed by position. This is the ONLY positional reference in the file, and
// it exists because the live sheet has a blank header there.
var NAMES_DATE_COL = 1;

// ---------------------------------------------------------------- menu

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Shopify')
    .addItem('Sync open orders', 'syncOpenOrders')
    .addItem('Move fulfilled to Closed', 'moveFulfilledToClosed')
    .addSeparator()
    .addItem('Create order batch', 'createOrderBatch')
    .addSeparator()
    .addItem('Turn ON auto sync', 'enableAutoSync')
    .addItem('Turn OFF auto sync', 'disableAutoSync')
    .addItem('Auto sync status', 'autoSyncStatus')
    .addSeparator()
    .addItem('Format sheets', 'formatSheets')
    .addSeparator()
    .addItem('Diagnose', 'diagnose')
    .addItem('What is in the gap?', 'inspectGap')
    .addItem('Compact tabs (remove gaps)', 'compactTabs')
    .addSeparator()
    .addItem('Set up (run once)', 'setup')
    .addToUi();
}

function setup() {
  var ui = SpreadsheetApp.getUi();
  var url = ui.prompt('Worker URL', 'e.g. https://runhouse-sheets-worker.ryan-486.workers.dev', ui.ButtonSet.OK_CANCEL);
  if (url.getSelectedButton() !== ui.Button.OK) return;
  var ord = ui.prompt('Orders token', 'The ORDERS_TOKEN you set on the Worker.', ui.ButtonSet.OK_CANCEL);
  if (ord.getSelectedButton() !== ui.Button.OK) return;
  PropertiesService.getScriptProperties().setProperties({
    WORKER_URL: url.getResponseText().trim().replace(/\/+$/, ''),
    ORDERS_TOKEN: ord.getResponseText().trim()
  });
  ui.alert('Saved. Run Shopify > Sync open orders.');
}

// ---------------------------------------------------------------- automation
//
// A button somebody has to remember is not an automated sheet, so a time driven
// trigger runs the sync on a schedule. Three things make that safe to leave
// unattended.
//
// 1. A LOCK. A scheduled run and a person clicking the menu can fire at the same
//    moment. Two writers appending to the same tab at once duplicates rows, so
//    whoever gets the lock wins and the other gives up quietly.
//
// 2. FAILURE IS VISIBLE. A silent sync that broke three days ago is WORSE than
//    no sync, because people keep trusting the sheet. Consecutive failures are
//    counted and an email goes out once the count crosses the threshold, then
//    stays quiet until it recovers so nobody gets a mail every 15 minutes.
//
// 3. THE STATUS IS ON THE SHEET. "Last synced" is written where staff can see it,
//    so a stale sheet looks stale instead of looking current.

var SYNC_FUNCTION = 'autoSync';
var DEFAULT_INTERVAL_MIN = 15;
var FAILURES_BEFORE_EMAIL = 3;
var STATUS_SHEET = 'Sync Status';

/** What the trigger calls. Never call this from the menu, use syncOpenOrders. */
function autoSync() {
  var lock = LockService.getScriptLock();
  // Do not queue. If a sync is already running, the next tick will do it.
  if (!lock.tryLock(1000)) {
    logStatus_('skipped, another sync was already running', null);
    return;
  }
  try {
    var summary = runSync_();
    // ARCHIVE AS PART OF THE SAME RUN, inside the same lock. Without this,
    // shipped and cancelled lines pile up on the work queues until somebody
    // remembers to click a menu item, and a cancelled order sitting among live
    // work is how it gets picked and posted.
    //
    // A failure here must NOT be reported as a failed sync: the orders were
    // pulled correctly and the sheet is current, only the tidying did not run.
    try {
      summary += ' ' + archiveFulfilled_();
    } catch (ae) {
      summary += ' ARCHIVE FAILED: ' + (ae && ae.message ? ae.message : String(ae));
      console.error('archive step failed: ' + ae);
    }
    PropertiesService.getScriptProperties().setProperty('FAIL_COUNT', '0');
    logStatus_('ok', summary);
  } catch (err) {
    noteFailure_(err);
    throw err;                       // let it show in the Apps Script dashboard
  } finally {
    lock.releaseLock();
  }
}

/** The menu item. Same work, but it reports to the person who clicked. */
function syncOpenOrders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    toast_('A sync is already running. Try again in a moment.');
    return;
  }
  try {
    var summary = runSync_();
    PropertiesService.getScriptProperties().setProperty('FAIL_COUNT', '0');
    logStatus_('ok', summary);
    toast_(summary);
  } finally {
    lock.releaseLock();
  }
}

function enableAutoSync() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('WORKER_URL') || !props.getProperty('ORDERS_TOKEN')) {
    ui.alert('Run Shopify > Set up first.');
    return;
  }
  var ans = ui.prompt('Auto sync', 'How many minutes between syncs? Apps Script allows 1, 5, 10, 15 or 30.',
    ui.ButtonSet.OK_CANCEL);
  if (ans.getSelectedButton() !== ui.Button.OK) return;
  var mins = parseInt(ans.getResponseText(), 10) || DEFAULT_INTERVAL_MIN;
  // everyMinutes only accepts these, anything else throws.
  var allowed = [1, 5, 10, 15, 30];
  if (allowed.indexOf(mins) === -1) mins = DEFAULT_INTERVAL_MIN;

  removeTriggers_();
  ScriptApp.newTrigger(SYNC_FUNCTION).timeBased().everyMinutes(mins).create();
  props.setProperty('SYNC_INTERVAL', String(mins));
  props.setProperty('FAIL_COUNT', '0');
  ui.alert('Auto sync is ON, every ' + mins + ' minutes.\n\nIt runs whether or not the sheet is open. ' +
    'Turn it off from Shopify > Turn OFF auto sync.');
}

function disableAutoSync() {
  var n = removeTriggers_();
  PropertiesService.getScriptProperties().deleteProperty('SYNC_INTERVAL');
  SpreadsheetApp.getUi().alert(n ? 'Auto sync is OFF.' : 'Auto sync was not on.');
}

function autoSyncStatus() {
  var props = PropertiesService.getScriptProperties();
  var mins = props.getProperty('SYNC_INTERVAL');
  var triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === SYNC_FUNCTION;
  });
  var msg = [];
  msg.push(triggers.length ? ('ON, every ' + (mins || '?') + ' minutes') : 'OFF');
  msg.push('Last run: ' + (props.getProperty('LAST_RUN') || 'never'));
  msg.push('Last result: ' + (props.getProperty('LAST_RESULT') || 'none'));
  var fails = parseInt(props.getProperty('FAIL_COUNT') || '0', 10);
  if (fails) msg.push('Consecutive failures: ' + fails);
  msg.push('Worker: ' + (props.getProperty('WORKER_URL') || 'not set'));
  SpreadsheetApp.getUi().alert('Auto sync\n\n' + msg.join('\n'));
}

function removeTriggers_() {
  var all = ScriptApp.getProjectTriggers(), n = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].getHandlerFunction() === SYNC_FUNCTION) { ScriptApp.deleteTrigger(all[i]); n++; }
  }
  return n;
}

/**
 * Email on the Nth consecutive failure only, then stay quiet until it recovers.
 * One mail about a broken sync is useful, one every 15 minutes gets filtered and
 * then ignored, which defeats the point.
 */
function noteFailure_(err) {
  var props = PropertiesService.getScriptProperties();
  var n = (parseInt(props.getProperty('FAIL_COUNT') || '0', 10) || 0) + 1;
  props.setProperty('FAIL_COUNT', String(n));
  logStatus_('FAILED: ' + (err && err.message ? err.message : String(err)), null);
  if (n !== FAILURES_BEFORE_EMAIL) return;          // exactly at the threshold
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: 'Shopify sync has failed ' + n + ' times: ' + ss.getName(),
      body: 'The Shopify order sync has failed ' + n + ' consecutive times.\n\n' +
            'Last error:\n' + (err && err.message ? err.message : String(err)) + '\n\n' +
            'The sheet is NOT up to date. ' + ss.getUrl() + '\n\n' +
            'No further emails until it succeeds again.'
    });
  } catch (e) {
    // Never let a mail problem mask the original failure.
    console.error('could not send failure email: ' + e);
  }
}

/** Writes the run result where staff can see it, so a stale sheet looks stale. */
function logStatus_(result, summary) {
  var props = PropertiesService.getScriptProperties();
  var now = new Date();
  props.setProperty('LAST_RUN', Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
  props.setProperty('LAST_RESULT', summary || result);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(STATUS_SHEET) || ss.insertSheet(STATUS_SHEET);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, 3).setValues([['When', 'Result', 'Detail']]);
      sh.setFrozenRows(1);
    }
    sh.insertRowAfter(1);
    sh.getRange(2, 1, 1, 3).setValues([[now, result, summary || '']]);
    // Keep the last 200 lines. An unbounded log eventually fills the sheet.
    var last = sh.getLastRow();
    if (last > 201) sh.deleteRows(202, last - 201);
  } catch (e) {
    console.error('could not write status: ' + e);
  }
}

// THE ASICS ORDERS TAB, a purchase list rather than a work queue.
//
// Every other tab is one row per garment to pick. This one is one row per thing
// to BUY, which is a different shape: the supplier wants a style-colour code, a
// size and a quantity, not a list of customers.
//
// WHERE THE SKU COMES FROM. The product title already carries ASICS's own
// style-colour code in brackets, which is exactly what goes on the order:
//   "... ASICS Men's Metarun Singlet (2011D508-001) (LA27-05)" -> 2011D508-001
// The Worker parses it. Measured 2026-10-05, 80 of 80 non-footwear ASICS lines
// parsed, so nothing has to be typed.
//
// AGGREGATED, so the key is NOT a line item id. One row covers many order lines,
// and the anchor is SKU + size. Seven separate orders for a Medium singlet
// become one line reading 7.
//
// SHOES ARE EXCLUDED. Dropship footwear carries no style code in its title and
// is ordered through the supplier portal, not on a sheet like this.
//
// QTY ORDERED IS SEPARATE FROM QTY NEEDED, on purpose. More orders arrive after
// a PO is placed, so Needed climbs. Rather than overwrite anything, the sheet
// shows both and highlights the row while Ordered is behind Needed.
var ASICS_SHEET = 'ASICS Orders';

var ASICS_FIELDS = {
  'SKU': 'sku',
  'Product': 'product',
  'Size': 'size',
  'Qty Needed': 'qtyNeeded',
  'Orders': 'orders'
};

var ASICS_LAYOUT = [
  'SKU', 'Product', 'Size', 'Qty Needed',
  'Qty Ordered', 'PO#', 'Date Ordered', 'Notes',
  'Orders',
  KEY_HEADER
];

// THE BLANKS TO ORDER TAB, the same idea as the ASICS list for printed apparel.
//
// One row per blank style number and size, so SanMar, Charles River and S&S
// orders can be raised from a single aggregated list instead of 200 scattered
// rows. The style number is the first code in brackets in the product title,
// which is already what goes on the order.
//
// ONE TAB, NOT ONE PER SUPPLIER, because a style number does not say who sells
// it. Sorting by Vendor groups a supplier's lines together for one PO, and a
// code whose supplier is not yet known sits at the top asking to be filled in
// rather than hiding on a tab nobody opens.
//
// VENDOR IS SEEDED, NOT OWNED. A PREFIX RULE WOULD BE WRONG: TT11WL is S&S
// while TT31 is SanMar, same two letters, different supplier. So the seed table
// below is EXACT MATCH ONLY, taken from 49 style codes that staff had already
// assigned on the live sheet with no contradictions. An unknown code is left
// blank for a person, and because Vendor is seeded on INSERT only, a correction
// typed by hand is never overwritten by a later sync.
var BLANKS_SHEET = 'Blanks to Order';

var BLANK_VENDOR = {
  '8763': 'Charles River', '9706': 'Charles River', '9922': 'Charles River',
  'TD600': 'S&S', 'TT11WL': 'S&S',
  '18000B': 'Sanmar', '4400': 'Sanmar', '6071': 'Sanmar', 'BC3727': 'Sanmar',
  'C112': 'Sanmar', 'C402': 'Sanmar', 'DT1800': 'Sanmar', 'DT6100': 'Sanmar',
  'DT6100Y': 'Sanmar', 'DT6107': 'Sanmar', 'DT6117': 'Sanmar', 'DT8102': 'Sanmar',
  'K200': 'Sanmar', 'LOG707': 'Sanmar', 'LPC380TT': 'Sanmar', 'LST350': 'Sanmar',
  'LST353LS': 'Sanmar', 'LST356': 'Sanmar', 'LST485': 'Sanmar', 'MM7213': 'Sanmar',
  'MMB800': 'Sanmar', 'NKDH7709': 'Sanmar', 'NKFB6445': 'Sanmar', 'NKFD9889': 'Sanmar',
  'NL5030': 'Sanmar', 'PC380': 'Sanmar', 'PC380SL': 'Sanmar', 'PC380YLS': 'Sanmar',
  'PC381Y': 'Sanmar', 'PC450': 'Sanmar', 'PC54': 'Sanmar', 'PC78H': 'Sanmar',
  'PC78YH': 'Sanmar', 'PC78YJ': 'Sanmar', 'PC78ZH': 'Sanmar', 'PC90YH': 'Sanmar',
  'S6000': 'Sanmar', 'ST350': 'Sanmar', 'ST350LS': 'Sanmar', 'ST850': 'Sanmar',
  'TT31': 'Sanmar'
};

var BLANKS_FIELDS = {
  'Style Code': 'sku',
  'Product': 'product',
  'Size': 'size',
  'Qty Needed': 'qtyNeeded',
  'Orders': 'orders'
};

// Seeded on INSERT only, so a hand correction survives every later sync.
var BLANKS_SEED_FIELDS = { 'Vendor': 'vendorGuess' };

var BLANKS_LAYOUT = [
  'Order?', 'Vendor', 'Style Code', 'Product', 'Size', 'Qty Needed',
  'Qty Ordered', 'Batch', 'PO#', 'Date Ordered', 'Notes',
  'Orders',
  KEY_HEADER
];

// THE BATCH SYSTEM, which is what "we ordered these together" means.
//
// Placing an order means picking a set of style and size rows and sending them
// to one supplier. Before this, recording that meant typing the same PO number
// onto twenty rows by hand, so in practice it did not get recorded at all.
//
// HOW IT WORKS. Tick Order? on the rows you are buying, then run
// Shopify > Create order batch. Every ticked row gets the same batch id, today's
// date, and Qty Ordered filled in from Qty Needed. The ticks clear themselves,
// and the batch is logged on its own tab with totals.
//
// ONE BATCH PER SUPPLIER, because one batch is one purchase order and a PO goes
// to one supplier. Ticking rows across two vendors creates two batches, which is
// what actually has to happen anyway.
var BATCHES_SHEET = 'Order Batches';

var BATCHES_LAYOUT = [
  'Batch', 'Vendor', 'Date Ordered', 'Lines', 'Units',
  'PO#', 'Received?', 'Date Received', 'Notes'
];

// ORDERED BLANKS, the line detail behind each batch.
//
// Order Batches is the HEADER of a purchase order, one row per PO, and the place
// to type the PO number once. This is the LINES of it: every garment that went
// on that order, and crucially WHICH CUSTOMER ORDERS each one is for.
//
// WHY THAT LAST COLUMN IS THE POINT. When a box arrives from SanMar nobody needs
// to know what was ordered, they need to know who it is for, and that fact lives
// nowhere else once the Blanks row has moved on. So it is captured here at the
// moment the batch is raised.
//
// IT IS A SNAPSHOT, NOT A LIVE VIEW. These rows record what was true when the
// order was placed and are never rewritten by a sync. If more of the same size
// sells afterwards, that is a new batch and a new row here.
//
// ONE CAVEAT, worth knowing rather than discovering. On a top up batch the For
// Orders column lists every customer order needing that size, including ones the
// earlier batch already covered. Splitting a size across POs precisely would
// mean tracking which individual order each unit belongs to, which the sheet does
// not know and which nobody picks by anyway.
var ORDERED_SHEET = 'Ordered Blanks';

var ORDERED_LAYOUT = [
  'Batch', 'PO#', 'Vendor', 'Style Code', 'Product', 'Size',
  'Qty Ordered', 'Date Ordered', 'For Orders',
  'Received?', 'Date Received', 'Notes'
];

// ---------------------------------------------------------------- readability
//
// Formatting is applied when a tab is CREATED, and on demand from
// Shopify > Format sheets. It is deliberately NOT reapplied on every sync:
// setConditionalFormatRules REPLACES every rule on the sheet, so doing it
// automatically would silently delete any rule a person had added themselves.
//
// PACKING SLIP IS A CHECKBOX, NOT SHOPIFY DATA. Shopify does not record whether
// a packing slip was printed: there is no such field on Order, FulfillmentOrder
// or Fulfillment. (There is a LABEL_PRINTED fulfillment EVENT, but that is a
// shipping label and only exists after the thing has shipped, so it says nothing
// about an open queue.) So this stays a human tick, just a faster one.
//
// requireCheckbox('Yes', 'No') is the important detail: it draws a checkbox but
// stores the words Yes and No, so the 221 existing Yes/No cells keep working and
// nothing has to be converted.

var CHECKBOX_YESNO = ['Packing Slip Printed?', 'Order?', 'Received?'];
var FLAG_COLUMN = 'Name or Additional Option Print on Product?';
var STALE_DAYS = 14;

var COLUMN_WIDTHS = {
  'Date': 60,
  'Order Number': 95,
  'Quantity': 45,
  'Line Items: Name': 430,
  'Customer': 150,
  'Name or Additional Option Print on Product?': 90,
  'Packing Slip Printed?': 90,
  'Location': 130,
  'PO#': 110,
  'LOGO #': 90,
  'Communication made to store (i.e. who did you speak with and what is being done with product)': 260,
  'Order Processed Initials': 90,
  'Date Added to Cart': 95,
  'Vendor': 110,
  'Vendor Warehouse': 100,
  'Date order was placed': 95,
  'Who placed the order?': 110,
  'Date Item Arrived to Warehouse': 110,
  'Date Order Shipped Out to Customer': 110,
  'Tracking Number to Customer': 180,
  'Ship From': 100,
  'Route': 130,
  'Name Value': 240,
  'Carrier': 90,
  'Tracking Link': 160,
  'Color': 80,
  'Name': 150,
  'NUMBER': 80,
  'Printed ': 80,
  'SKU': 130,
  'Product': 400,
  'Size': 80,
  'Qty Needed': 85,
  'Qty Ordered': 85,
  'Date Ordered': 100,
  'Notes': 220,
  'Orders': 300,
  'Style Code': 110,
  'Status': 90,
  'Order?': 60,
  'Batch': 150,
  'Lines': 60,
  'Units': 60,
  'Received?': 80,
  'For Orders': 260,
  'Date Received': 110,
  'Cancel Reason': 110,
  'Cancelled On': 100,
  'Refunded On': 100,
  'Refunded Amount': 110
};

/** Menu action. Formats every tab the sync owns that currently exists. */
function formatSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = uniqueTabNames_().concat([NAMES_SHEET, ASICS_SHEET, BLANKS_SHEET, CLOSED_SHEET, VOID_SHEET, BATCHES_SHEET, ORDERED_SHEET]);
  var done = 0;
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (!sh) continue;
    formatTab_(sh);
    done++;
  }
  SpreadsheetApp.getUi().alert('Formatted ' + done + ' tab(s).\n\n' +
    'Yellow means this line needs a name printed. Red date means it has been ' +
    'waiting more than ' + STALE_DAYS + ' days.');
}

/** A1 column letter for a 1-based index, needed for custom formula rules. */
function colLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}

function formatTab_(sh) {
  var head = headerMap_(sh);
  var maxRows = Math.max(sh.getMaxRows(), 2);
  var width = Math.max(head.headers.length, 1);

  // Header: dark, bold, frozen, and tall enough to read a wrapped title.
  var hdr = sh.getRange(1, 1, 1, width);
  hdr.setBackground('#1f3864').setFontColor('#ffffff').setFontWeight('bold')
     .setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 42);

  // Widths, and a readable date format. Their sheet writes dates as 9/4.
  for (var i = 0; i < head.headers.length; i++) {
    var name = head.headers[i];
    var w = COLUMN_WIDTHS[name] || COLUMN_WIDTHS[name.trim()];
    if (w) sh.setColumnWidth(i + 1, w);
  }
  applyFormat_(sh, head, 'Date', 'M/d', maxRows);
  applyFormat_(sh, head, 'Date Added to Cart', 'M/d', maxRows);
  applyFormat_(sh, head, 'Date order was placed', 'M/d', maxRows);
  applyFormat_(sh, head, 'Date Item Arrived to Warehouse', 'M/d', maxRows);
  applyFormat_(sh, head, 'Date Order Shipped Out to Customer', 'M/d', maxRows);
  applyFormat_(sh, head, 'Upcharge', '$#,##0.00', maxRows);

  // Quantity reads better centred, and the long product title must not spill.
  centre_(sh, head, 'Quantity', maxRows);
  centre_(sh, head, 'Name or Additional Option Print on Product?', maxRows);
  centre_(sh, head, 'Packing Slip Printed?', maxRows);
  var li = head.index['Line Items: Name'];
  if (li && maxRows > 1) sh.getRange(2, li, maxRows - 1, 1).setWrap(false);

  // A checkbox that stores Yes and No, so existing text cells still match.
  for (var c = 0; c < CHECKBOX_YESNO.length; c++) {
    var col = head.index[CHECKBOX_YESNO[c]];
    if (!col || maxRows < 2) continue;
    // setAllowInvalid(true) on purpose. A blank cell is a legitimate state, it
    // means nobody has decided yet, and a strict rule would reject the sync's
    // own empty write into the column.
    sh.getRange(2, col, maxRows - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox('Yes', 'No')
        .setAllowInvalid(true).build());
  }
  // The Names tab already stores TRUE and FALSE, so a plain checkbox fits it.
  var pr = head.index['Printed '] || head.index['Printed'];
  if (pr && maxRows > 1) {
    sh.getRange(2, pr, maxRows - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox()
        .setAllowInvalid(true).build());
  }

  // Conditional formatting. REPLACES every rule on this sheet, see the note at
  // the top of this section.
  var rules = [];
  var body = sh.getRange(2, 1, maxRows - 1, width);

  var flagCol = head.index[FLAG_COLUMN];
  if (flagCol) {
    var f = '$' + colLetter_(flagCol) + '2';
    // The whole row tints, so a line needing print is obvious from across the
    // room, and the cell itself goes bold amber.
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=' + f + '="Yes"')
      .setBackground('#fff2cc').setRanges([body]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Yes')
      .setBackground('#ffd966').setFontColor('#7f6000').setBold(true)
      .setRanges([sh.getRange(2, flagCol, maxRows - 1, 1)]).build());
  }

  // Waiting too long. This is the one that should cause someone to act.
  var dateCol = head.index['Date'];
  if (dateCol) {
    var d = '$' + colLetter_(dateCol) + '2';
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(' + d + '<>"",TODAY()-' + d + '>' + STALE_DAYS + ')')
      .setFontColor('#cc0000').setBold(true)
      .setRanges([sh.getRange(2, dateCol, maxRows - 1, 1)]).build());
  }

  // STILL TO ORDER. On the purchase list, a row matters while the quantity
  // ordered is behind the quantity needed, including when nothing has been
  // ordered at all (a blank Qty Ordered counts as zero). Rows that are fully
  // ordered go quiet by themselves.
  var needCol = head.index['Qty Needed'], ordCol = head.index['Qty Ordered'];
  if (needCol && ordCol) {
    // NOT named "of". Apps Script treats of as reserved and refuses to parse the
    // whole file, which silently removes the Shopify menu because onOpen never
    // registers. Node parses it happily, so no local check catches this.
    var needRef = '$' + colLetter_(needCol) + '2';
    var ordRef = '$' + colLetter_(ordCol) + '2';
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND(' + needRef + '<>"",N(' + ordRef + ')<' + needRef + ')')
      .setBackground('#fce5cd').setRanges([body]).build());
    centre_(sh, head, 'Qty Needed', maxRows);
    centre_(sh, head, 'Qty Ordered', maxRows);
    centre_(sh, head, 'Size', maxRows);
    centre_(sh, head, 'Order?', maxRows);
  }

  // CANCELLED must be impossible to miss on the Closed tab. A cancelled line
  // filed next to shipped ones is how a refunded order gets posted anyway.
  var stCol = head.index['Status'];
  if (stCol) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('CANCELLED')
      .setBackground('#f4cccc').setFontColor('#990000').setBold(true)
      .setRanges([sh.getRange(2, stCol, maxRows - 1, 1)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('REFUNDED')
      .setBackground('#fce5cd').setFontColor('#b45f06').setBold(true)
      .setRanges([sh.getRange(2, stCol, maxRows - 1, 1)]).build());
    centre_(sh, head, 'Status', maxRows);
  }

  // A printed packing slip is done, so it recedes rather than shouting.
  var packCol = head.index['Packing Slip Printed?'];
  if (packCol) {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Yes')
      .setFontColor('#38761d')
      .setRanges([sh.getRange(2, packCol, maxRows - 1, 1)]).build());
  }

  sh.setConditionalFormatRules(rules);

  // Banding makes a 240 row sheet trackable across its width. Remove any first,
  // or Sheets refuses to add an overlapping one.
  var existing = sh.getBandings();
  for (var b = 0; b < existing.length; b++) existing[b].remove();
  if (maxRows > 2) {
    sh.getRange(2, 1, maxRows - 1, width)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }

  if (head.index[KEY_HEADER]) sh.hideColumns(head.index[KEY_HEADER]);
}

function applyFormat_(sh, head, header, fmt, maxRows) {
  var col = head.index[header] || head.index[String(header).trim()];
  if (col && maxRows > 1) sh.getRange(2, col, maxRows - 1, 1).setNumberFormat(fmt);
}

function centre_(sh, head, header, maxRows) {
  var col = head.index[header] || head.index[String(header).trim()];
  if (col && maxRows > 1) sh.getRange(2, col, maxRows - 1, 1).setHorizontalAlignment('center');
}

/**
 * What the Worker says versus what is actually on the tabs, side by side.
 *
 * WHY THIS EXISTS. "I synced and I cannot see today's orders" has several very
 * different causes that all look identical from the sheet: the script may be an
 * old version, the trigger may be off, the rows may be at the BOTTOM because the
 * queue is oldest first, or the person may be looking at a tab this script never
 * writes to. Guessing between them wastes time. This answers it in one click.
 */
function diagnose() {
  var props = PropertiesService.getScriptProperties();
  var out = [];

  out.push('SCRIPT VERSION');
  out.push('  has ASICS tab    : ' + (typeof ASICS_SHEET === 'string' ? 'yes' : 'no'));
  out.push('  has Blanks tab   : ' + (typeof BLANKS_SHEET === 'string' ? 'yes' : 'no'));
  out.push('');
  out.push('SETUP');
  out.push('  worker  : ' + (props.getProperty('WORKER_URL') || 'NOT SET'));
  out.push('  token   : ' + (props.getProperty('ORDERS_TOKEN') ? 'set' : 'NOT SET'));
  var trig = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === SYNC_FUNCTION; });
  out.push('  autosync: ' + (trig.length ? 'ON every ' + props.getProperty('SYNC_INTERVAL') + ' min' : 'OFF'));
  out.push('  last run: ' + (props.getProperty('LAST_RUN') || 'never'));
  out.push('  result  : ' + (props.getProperty('LAST_RESULT') || 'none'));

  var payload;
  try {
    payload = fetchJson_('/orders/open?includeFootwear=1');
  } catch (e) {
    out.push('');
    out.push('WORKER CALL FAILED: ' + e.message);
    SpreadsheetApp.getUi().alert('Diagnose\n\n' + out.join('\n'));
    return;
  }
  var rows = payload.rows || [];

  // What the Worker thinks each tab should hold, by date.
  var wantByTab = {}, todayByTab = {};
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  for (var i = 0; i < rows.length; i++) {
    var t = tabFor_(rows[i]);
    wantByTab[t] = (wantByTab[t] || 0) + 1;
    if (String(rows[i].date).slice(0, 10) === today) todayByTab[t] = (todayByTab[t] || 0) + 1;
  }

  out.push('');
  out.push('WORKER SAYS: ' + rows.length + ' open line(s), ' +
           Object.keys(todayByTab).reduce(function (a, k) { return a + todayByTab[k]; }, 0) +
           ' dated today (' + today + ')');
  out.push('');
  out.push('TAB                  on sheet   worker   today   ');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = uniqueTabNames_();
  for (var n = 0; n < names.length; n++) {
    var sh = ss.getSheetByName(names[n]);
    var have = 'MISSING';
    if (sh) {
      var hd = headerMap_(sh);
      var kc = hd.index[KEY_HEADER];
      var realLast = lastKeyedRow_(sh, kc);
      have = (kc && realLast > 1) ? String(realLast - 1) : '0';
      if (!kc) have = 'NO _key';
      // A big gap between real rows and what Sheets calls the last row means
      // formatting has inflated it, which is what broke appends before.
      if (kc && sh.getLastRow() > realLast + 5) have += ' (+' + (sh.getLastRow() - realLast) + ' blank)';
    }
    if (!sh && !wantByTab[names[n]]) continue;         // never used, skip
    out.push('  ' + names[n].slice(0, 20).padEnd(21) +
             String(have).padStart(8) + String(wantByTab[names[n]] || 0).padStart(9) +
             String(todayByTab[names[n]] || 0).padStart(8));
  }

  // Tabs in the file that this script does NOT write to. This is the one that
  // catches "I was looking at the wrong tab".
  var mine = {};
  names.concat([NAMES_SHEET, ASICS_SHEET, BLANKS_SHEET, CLOSED_SHEET, STATUS_SHEET])
    .forEach(function (x) { mine[x] = true; });
  var strangers = ss.getSheets().map(function (x) { return x.getName(); })
    .filter(function (x) { return !mine[x]; });
  if (strangers.length) {
    out.push('');
    out.push('TABS THIS SCRIPT NEVER WRITES TO:');
    strangers.forEach(function (x) { out.push('  ' + x); });
    out.push('  If you are looking at one of these, that is why it looks empty.');
  }

  // WHERE EXACTLY ARE TODAY'S ROWS. "It is not pulling new orders" and "the new
  // orders are sitting at row 1001" look identical from the sheet, and the only
  // way to tell them apart is to go and find the row. So go and find it.
  out.push('');
  out.push("TODAY'S ROWS, and the sheet row each one is on:");
  var todays = rows.filter(function (r) { return String(r.date).slice(0, 10) === today; });
  if (!todays.length) {
    out.push('  the Worker is not returning anything dated today');
  } else {
    var want = {};
    for (var q = 0; q < todays.length; q++) want[todays[q].lineId] = todays[q];
    var foundAny = 0, missing = [];
    for (var m = 0; m < names.length; m++) {
      var sh2 = ss.getSheetByName(names[m]);
      if (!sh2) continue;
      var hd2 = headerMap_(sh2);
      var kc2 = hd2.index[KEY_HEADER];
      if (!kc2) continue;
      var deep = sh2.getLastRow();                 // scan the WHOLE sheet, blanks included
      if (deep < 2) continue;
      var kv = sh2.getRange(2, kc2, deep - 1, 1).getValues();
      var hits = [];
      for (var z = 0; z < kv.length; z++) {
        var kk = String(kv[z][0] || '').trim();
        if (kk && want[kk]) { hits.push(z + 2); delete want[kk]; }
      }
      if (hits.length) {
        foundAny += hits.length;
        var lo = Math.min.apply(null, hits), hi = Math.max.apply(null, hits);
        var realEnd = lastKeyedRow_(sh2, kc2);
        out.push('  ' + names[m].slice(0, 20).padEnd(21) + hits.length +
                 ' row(s) at ' + (lo === hi ? ('row ' + lo) : ('rows ' + lo + ' to ' + hi)));
        if (lo > 300) out.push('      SCROLL TO ROW ' + lo + '. That is far below the data.');
      }
    }
    for (var left in want) missing.push(want[left].order);
    out.push('  found on a tab        : ' + foundAny + ' of ' + todays.length);
    if (missing.length) {
      out.push('  NOT on any tab        : ' + missing.length + '  ' + missing.slice(0, 8).join(' '));
      out.push('      These should appear on the next Sync open orders.');
    }
  }

  out.push('');
  out.push('Queue order is OLDEST FIRST, so today is at the BOTTOM of a tab.');

  SpreadsheetApp.getUi().alert('Diagnose\n\n' + out.join('\n'));
}

/**
 * Pack every tab so its rows run from row 2 with NO gaps, full stop.
 *
 * WHY THIS REPLACED A BLANK ROW SWEEP. Deleting "empty" rows depends on
 * correctly deciding what is empty, and on the live sheet that did not work: the
 * tabs still had a 770 row hole with today's orders stranded past it. Detection
 * is the wrong tool. This does not detect anything. It reads every row that has
 * ANY content, writes them back contiguously from row 2, and clears whatever is
 * left underneath. A gap cannot survive that.
 *
 * NOTHING IS LOST AND NOTHING IS REORDERED. A whole row is carried as a whole
 * row, so PO numbers, notes, initials and hand typed lines move with their data,
 * in the order they were already in.
 */
function compactTabs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = uniqueTabNames_().concat([NAMES_SHEET, ASICS_SHEET, BLANKS_SHEET, CLOSED_SHEET, VOID_SHEET, BATCHES_SHEET, ORDERED_SHEET]);
  var report = [], moved = 0;

  for (var n = 0; n < names.length; n++) {
    var sh = ss.getSheetByName(names[n]);
    if (!sh) continue;
    var last = sh.getLastRow();
    if (last < 2) continue;
    var width = Math.max(sh.getLastColumn(), 1);
    var vals = sh.getRange(2, 1, last - 1, width).getValues();

    // Everything with any content at all, in the order it already sits in.
    var keep = [];
    for (var i = 0; i < vals.length; i++) {
      for (var c = 0; c < vals[i].length; c++) {
        if (String(vals[i][c] === null || vals[i][c] === undefined ? '' : vals[i][c]).trim() !== '') {
          keep.push(vals[i]);
          break;
        }
      }
    }
    var before = last - 1;
    if (keep.length === before) { report.push('  ' + names[n].slice(0, 22).padEnd(23) + 'already packed, ' + keep.length + ' row(s)'); continue; }

    // Clear the whole body, then lay the kept rows back down from row 2. Clear
    // before write, or the tail of the old longer block survives underneath.
    sh.getRange(2, 1, last - 1, width).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);

    moved++;
    report.push('  ' + names[n].slice(0, 22).padEnd(23) + before + ' rows down to ' + keep.length +
                ', gap of ' + (before - keep.length) + ' removed');
  }

  SpreadsheetApp.getUi().alert('Compact tabs\n\n' +
    (moved ? report.join('\n') + '\n\nEvery tab now runs from row 2 with no gaps.'
           : report.join('\n') || 'Nothing to compact.'));
}

/**
 * Show what is ACTUALLY in the rows between the real data and the stranded rows.
 *
 * WHY. Compaction keeps any row with content, so if a gap survives compaction
 * then those rows are not empty, they hold something. Guessing what has been
 * wrong twice. This prints the cells so there is nothing left to guess about.
 */
function inspectGap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = uniqueTabNames_();
  var out = [];

  for (var n = 0; n < names.length; n++) {
    var sh = ss.getSheetByName(names[n]);
    if (!sh) continue;
    var hd = headerMap_(sh);
    var kc = hd.index[KEY_HEADER];
    var last = sh.getLastRow();
    if (!kc || last < 3) continue;
    var width = Math.max(sh.getLastColumn(), 1);
    var keys = sh.getRange(2, kc, last - 1, 1).getValues();

    // The first run of keyless rows that has keyed rows BELOW it. That is a gap.
    var firstKeyless = -1, lastKeyed = -1;
    for (var i = 0; i < keys.length; i++) {
      var has = String(keys[i][0] || '').trim() !== '';
      if (has) lastKeyed = i + 2;
      else if (firstKeyless < 0) firstKeyless = i + 2;
    }
    if (firstKeyless < 0 || lastKeyed < firstKeyless) {
      out.push(names[n] + ': no gap, data ends at row ' + lastKeyed);
      continue;
    }

    var gapRows = lastKeyed - firstKeyless;
    out.push(names[n] + ': keyless rows from ' + firstKeyless + ', keyed data again down to ' + lastKeyed);

    // Sample three rows inside the gap and print every non empty cell.
    var samples = [firstKeyless, firstKeyless + Math.floor(gapRows / 2), lastKeyed - 1];
    for (var sIdx = 0; sIdx < samples.length; sIdx++) {
      var r = samples[sIdx];
      if (r < 2 || r > last) continue;
      var row = sh.getRange(r, 1, 1, width).getValues()[0];
      var filled = [];
      for (var c = 0; c < row.length; c++) {
        var v = row[c];
        if (String(v === null || v === undefined ? '' : v).trim() !== '') {
          filled.push((hd.headers[c] || ('col' + (c + 1))).slice(0, 22) + ' = ' + JSON.stringify(v).slice(0, 24));
        }
      }
      out.push('   row ' + r + ': ' + (filled.length ? filled.join(' | ') : 'TRULY EMPTY'));
    }
    out.push('');
  }

  SpreadsheetApp.getUi().alert('What is in the gap?\n\n' +
    (out.length ? out.join('\n') : 'No tabs with a gap found.'));
}

/**
 * Turn the ticked rows on Blanks to Order into a batch, one per supplier.
 *
 * WHY A BATCH AT ALL. Placing an order is choosing a set of style and size rows
 * and sending them to one supplier. Recording that by hand meant typing the same
 * PO onto twenty rows, so it did not get recorded. Ticking a box does.
 *
 * WHAT IT WRITES, per ticked row: the batch id, today in Date Ordered, and
 * Qty Ordered filled from Qty Needed where it is still blank. Then it clears the
 * ticks so the tab is ready for the next order, and logs the batch with totals.
 *
 * IT NEVER OVERWRITES A QUANTITY SOMEBODY TYPED. If Qty Ordered already has a
 * number, that number is what was ordered and it stands.
 *
 * ONE BATCH PER VENDOR, because one batch is one purchase order. Rows with no
 * vendor yet are batched under UNKNOWN and reported, rather than silently
 * folded in with someone else's order.
 */
function createOrderBatch() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BLANKS_SHEET);
  if (!sh) { ui.alert('No "' + BLANKS_SHEET + '" tab yet. Run Sync open orders first.'); return; }

  var head = headerMap_(sh);
  var need = ['Order?', 'Vendor', 'Style Code', 'Size', 'Qty Needed', 'Qty Ordered', 'Batch', 'Date Ordered'];
  for (var n = 0; n < need.length; n++) {
    if (!head.index[need[n]]) { ui.alert('The "' + BLANKS_SHEET + '" tab has no "' + need[n] + '" column.\n\nRun Sync open orders once on the current script, which adds it.'); return; }
  }

  var last = sh.getLastRow();
  if (last < 2) { ui.alert('Nothing on the tab yet.'); return; }
  var width = head.headers.length;
  var vals = sh.getRange(2, 1, last - 1, width).getValues();

  var cOrder = head.index['Order?'] - 1, cVendor = head.index['Vendor'] - 1;
  var cSku = head.index['Style Code'] - 1, cSize = head.index['Size'] - 1;
  var cNeed = head.index['Qty Needed'] - 1, cOrdd = head.index['Qty Ordered'] - 1;
  var cBatch = head.index['Batch'] - 1, cDate = head.index['Date Ordered'] - 1;
  var cProd = head.index['Product'] ? head.index['Product'] - 1 : -1;
  var cOrds = head.index['Orders'] ? head.index['Orders'] - 1 : -1;

  // Ticked rows, grouped by vendor, carrying how many are OUTSTANDING.
  //
  // A ROW IS A RUNNING TOTAL, NOT A ONE OFF. The key is style code plus size, so
  // when five more of a size sell next week the same row climbs from 5 to 10 and
  // goes orange again. Ordering it a second time must therefore order the
  // DIFFERENCE, 5, not the whole 10 and not the 5 from last time.
  var groups = {}, ticked = 0, nothingDue = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][cOrder] === null || vals[i][cOrder] === undefined ? '' : vals[i][cOrder]).trim().toLowerCase();
    if (v !== 'true' && v !== 'yes') continue;
    ticked++;
    var already = Number(vals[i][cOrdd]) || 0;
    var wanted = Number(vals[i][cNeed]) || 0;
    var due = wanted - already;
    if (due <= 0) {
      // Already fully ordered. Untick it and say so rather than log a batch of
      // zero, or worse re-order something that is already on its way.
      nothingDue.push(String(vals[i][cSku] || '') + ' ' + String(vals[i][cSize] || ''));
      vals[i][cOrder] = 'No';
      continue;
    }
    var vendor = String(vals[i][cVendor] || '').trim() || 'UNKNOWN';
    (groups[vendor] = groups[vendor] || []).push({ row: i, due: due, already: already });
  }
  if (!ticked) {
    ui.alert('Nothing ticked.\n\nTick Order? on the rows you are buying, then run this again.');
    return;
  }
  if (!Object.keys(groups).length) {
    sh.getRange(2, 1, vals.length, width).setValues(vals);
    ui.alert('Nothing left to order on the ticked rows.\n\nAll of them already have Qty Ordered at or above Qty Needed:\n  ' +
      nothingDue.slice(0, 12).join('\n  ') + '\n\nThe ticks have been cleared.');
    return;
  }

  // Confirm, because this stamps a date and a quantity onto real rows.
  var preview = [];
  for (var g in groups) {
    var lines = groups[g].length, units = 0, topups = 0;
    for (var x = 0; x < groups[g].length; x++) {
      units += groups[g][x].due;
      if (groups[g][x].already > 0) topups++;
    }
    preview.push('  ' + g + ': ' + lines + ' line(s), ' + units + ' unit(s)' +
                 (topups ? '  (' + topups + ' topping up an earlier order)' : ''));
  }
  if (nothingDue.length) preview.push('  skipped, nothing due: ' + nothingDue.length + ' row(s)');
  var ans = ui.alert('Create ' + Object.keys(groups).length + ' batch(es)?\n\n' + preview.join('\n') +
    '\n\nEach ticked row gets a batch id, today\'s date and its quantity. The ticks then clear.',
    ui.ButtonSet.OK_CANCEL);
  if (ans !== ui.Button.OK) return;

  var today = new Date();
  var stamp = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyyMMdd');
  var batchRows = [], lineRows = [], made = 0;

  for (var vend in groups) {
    var seq = nextBatchSeq_(ss, stamp, vend);
    var id = vend.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 10) + '-' + stamp + '-' + seq;
    var lines2 = 0, units2 = 0;
    for (var y = 0; y < groups[vend].length; y++) {
      var g2 = groups[vend][y], ri = g2.row;
      // ADD the outstanding amount, never replace. Qty Ordered is the running
      // total of everything ever bought for this style and size.
      vals[ri][cOrdd] = g2.already + g2.due;
      // APPEND the batch id. A row topped up twice belongs to two purchase
      // orders and overwriting would lose the first one.
      var prevB = String(vals[ri][cBatch] || '').trim();
      vals[ri][cBatch] = prevB ? (prevB + ', ' + id) : id;
      // The date is the MOST RECENT order for this row, which is the one anyone
      // chasing it needs. The full history is on the batches tab.
      vals[ri][cDate] = today;
      vals[ri][cOrder] = 'No';                       // clear the tick
      lines2++; units2 += g2.due;

      // The line detail, including who it is for. PO# and the receiving columns
      // are left blank for a person.
      lineRows.push([
        id, '', vend,
        String(vals[ri][cSku] || ''),
        cProd >= 0 ? String(vals[ri][cProd] || '') : '',
        String(vals[ri][cSize] || ''),
        g2.due, today,
        cOrds >= 0 ? String(vals[ri][cOrds] || '') : '',
        'No', '', ''
      ]);
    }
    batchRows.push([id, vend, today, lines2, units2, '', 'No', '', '']);
    made++;
  }

  sh.getRange(2, 1, vals.length, width).setValues(vals);

  var log = sheet_(BATCHES_SHEET);
  ensureLayout_(log, BATCHES_LAYOUT);
  var lhead = headerMap_(log);
  appendRows_(log, batchRows, Math.min(BATCHES_LAYOUT.length, lhead.headers.length), lhead.index['Batch']);

  var det = sheet_(ORDERED_SHEET);
  ensureLayout_(det, ORDERED_LAYOUT);
  var dhead = headerMap_(det);
  appendRows_(det, lineRows, Math.min(ORDERED_LAYOUT.length, dhead.headers.length), dhead.index['Batch']);

  ui.alert('Created ' + made + ' batch(es).\n\n' + batchRows.map(function (b) {
    return '  ' + b[0] + '  ' + b[3] + ' line(s), ' + b[4] + ' unit(s)';
  }).join('\n') +
  '\n\n"' + BATCHES_SHEET + '" has one row per order. Type the PO number there.' +
  '\n"' + ORDERED_SHEET + '" has every garment on it, and which customer orders each is for.');
}

/** Next sequence number for a vendor on a given day, so ids never collide. */
function nextBatchSeq_(ss, stamp, vendor) {
  var log = ss.getSheetByName(BATCHES_SHEET);
  if (!log || log.getLastRow() < 2) return 1;
  var head = headerMap_(log);
  var col = head.index['Batch'];
  if (!col) return 1;
  var ids = log.getRange(2, col, log.getLastRow() - 1, 1).getValues();
  var prefix = vendor.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 10) + '-' + stamp + '-';
  var max = 0;
  for (var i = 0; i < ids.length; i++) {
    var v = String(ids[i][0] || '');
    if (v.indexOf(prefix) !== 0) continue;
    var nn = parseInt(v.slice(prefix.length), 10);
    if (nn > max) max = nn;
  }
  return max + 1;
}

// ---------------------------------------------------------------- the sync

// APPAREL ASSIGNED TO WALPOLE IS WORKED AT THE WAREHOUSE.
//
// Shopify assigns these to Walpole, but printed apparel is produced and shipped
// from the warehouse, so a Walpole apparel line on a store's queue is work
// nobody there can do. Measured 2026-10-13: Walpole held 44 open lines, 40 of
// them apparel and 4 footwear. The 4 pairs of shoes are genuinely Walpole stock
// and stay. A real Walpole apparel order can still be handled, it is just
// handled through the warehouse like the rest.
var APPAREL_TO_WAREHOUSE = ['Walpole'];

function tabFor_(r) {
  if (!r.isFootwear && APPAREL_TO_WAREHOUSE.indexOf(r.shipFrom) !== -1) {
    return LOCATION_TABS['Warehouse'];
  }
  return LOCATION_TABS[r.shipFrom] || UNROUTED_TAB;
}

function runSync_() {
  // includeFootwear because the tabs split by location, so shoes belong on their
  // store's tab rather than being filtered out of the feed entirely.
  var rows = fetchJson_('/orders/open?includeFootwear=1').rows || [];

  // OLDEST FIRST, so the queue reads top to bottom in the order things should be
  // picked. The Worker already sorts this way; sorting again here means the sheet
  // does not depend on that staying true.
  rows.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

  // WHICH TABS TO TOUCH. Not every possible location, or Florida Events and
  // Michigan Sales sit there empty forever. A tab is in play if it ALREADY
  // exists (so its rows can be found and moved) or if this payload has a row
  // for it. Everything else is left uncreated until it is needed.
  var tabNames = tabsInPlay_(rows);

  // Where every key currently lives, across every open tab.
  var sheets = {}, placed = {};
  for (var t = 0; t < tabNames.length; t++) {
    var sh = sheet_(tabNames[t]);
    ensureLayout_(sh, OPEN_LAYOUT);
    var head = headerMap_(sh);
    var keyCol = head.index[KEY_HEADER];
    // Read to the last KEYED row. Reading to getLastRow would pull in the
    // thousand formatted blank rows underneath and waste the call.
    var last = lastKeyedRow_(sh, keyCol);
    var keys = (last > 1 && keyCol) ? sh.getRange(2, keyCol, last - 1, 1).getValues() : [];
    var rowOf = {};
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i][0] || '').trim();
      if (k) { rowOf[k] = i + 2; placed[k] = tabNames[t]; }
    }
    sheets[tabNames[t]] = { sh: sh, head: head, rowOf: rowOf, updates: [], appends: [], removals: [] };
  }

  // Group the payload by the tab it belongs on. A line that has MOVED location
  // carries its old row across so its notes follow it, which is the only reason
  // the previous row still matters.
  for (var t2 = 0; t2 < tabNames.length; t2++) { sheets[tabNames[t2]].rows = []; sheets[tabNames[t2]].carry = {}; }
  var moved = 0, routed = 0;
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    var want = tabFor_(r);
    if (!sheets[want]) continue;
    sheets[want].rows.push(r);
    routed++;
    var at = placed[r.lineId];
    if (at && at !== want) {
      var from = sheets[at];
      if (from && from.rowOf[r.lineId]) {
        sheets[want].carry[r.lineId] =
          from.sh.getRange(from.rowOf[r.lineId], 1, 1, from.head.headers.length).getValues()[0];
      }
      moved++;
    }
  }

  var rebuilt = 0, skipped = [];
  for (var n = 0; n < tabNames.length; n++) {
    var res = rebuildTab_(sheets[tabNames[n]]);
    if (res.skipped) skipped.push(tabNames[n] + ': ' + res.skipped);
    else rebuilt += res.rows;
  }

  // The print queue: lines that actually have something to PRINT.
  //
  // Not simply "has personalisation". #86111 carries "Optional Back Logo = No",
  // a yes/no toggle, which would land here as a row with a blank Location, Name
  // and NUMBER: nothing to print and nothing to do. A line earns a place in the
  // queue only if it has a name or a number on it.
  var named = [];
  for (var q = 0; q < rows.length; q++) {
    var pr = rows[q];
    if (pr.printName || pr.printNumber) named.push(pr);
  }
  var nameRes = upsertTab_(NAMES_SHEET, NAMES_LAYOUT, NAMES_FIELDS, named);

  // The ASICS purchase list.
  var asics = asicsOrderRows_(rows);
  // zeroMissing matters here and nowhere else. This tab is AGGREGATED and LIVE:
  // when the last order for a SKU and size ships, that line vanishes from the
  // open feed, and without this the row would keep showing the quantity it
  // needed last week. Zeroing Qty Needed leaves the PO number and notes intact
  // as history while telling the truth about what is still required.
  var asicsRes = upsertTab_(ASICS_SHEET, ASICS_LAYOUT, ASICS_FIELDS, asics,
    function (r) { return r.key; }, { zeroMissing: 'Qty Needed' });

  // The blanks purchase list: SanMar, Charles River, S&S.
  var blanks = blankOrderRows_(rows);
  // rebuild, not append, so the style code order actually holds. Appending put
  // every new style at the bottom and the sort decayed within a week.
  var blankRes = upsertTab_(BLANKS_SHEET, BLANKS_LAYOUT, BLANKS_FIELDS, blanks,
    function (r) { return r.key; },
    { zeroMissing: 'Qty Needed', seedFields: BLANKS_SEED_FIELDS, rebuild: true,
      // Finished styles leave the list. Their batch, quantity and PO are on the
      // Ordered Blanks tab, so nothing is lost and the tab stays a list of what
      // is actually left to buy. A row with a note in it stays regardless.
      dropWhenZero: 'Notes' });

  return 'Laid out ' + rebuilt + ' row(s) across ' + tabNames.length + ' tab(s), ' + moved + ' moved' +
         (skipped.length ? '. SKIPPED ' + skipped.join('; ') : '') +
         '. Names: ' + nameRes.added + ' new, ' + nameRes.updated + ' updated.' +
         ' ASICS: ' + asics.length + ' to order' +
         (asicsRes.zeroed ? ', ' + asicsRes.zeroed + ' cleared' : '') + '.' +
         ' Blanks: ' + blanks.length + ' to order' +
         (blankRes.dropped ? ', ' + blankRes.dropped + ' finished and removed' : '') +
         (blankRes.zeroed ? ', ' + blankRes.zeroed + ' kept for a note' : '') + '.';
}

/**
 * Collapse open ASICS lines into a purchase list: one row per style-colour code
 * and size, with the quantity summed and the contributing order numbers listed
 * so anyone can trace a line back.
 */
function asicsOrderRows_(rows) {
  var agg = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.isFootwear) continue;                   // ordered through the portal
    if (!r.supplierSku) continue;
    if (!/asics/i.test(r.lineName) && !/asics/i.test(r.vendor || '')) continue;

    // The variant reads "Medium / Performance Black-001". The size is the part
    // before the slash; the colour is already inside the style-colour code.
    var size = String(r.variant || '').split(' / ')[0].trim();
    var key = r.supplierSku + '|' + size;
    if (!agg[key]) {
      agg[key] = { key: key, sku: r.supplierSku, product: r.title, size: size,
                   qtyNeeded: 0, orderList: [] };
    }
    agg[key].qtyNeeded += Number(r.quantity) || 0;
    if (agg[key].orderList.indexOf(r.order) === -1) agg[key].orderList.push(r.order);
  }
  var out = [];
  for (var k in agg) {
    agg[k].orders = agg[k].orderList.join(' ');
    out.push(agg[k]);
  }
  // Grouped by SKU so one style's sizes sit together on the order.
  out.sort(function (a, b) {
    if (a.sku !== b.sku) return a.sku < b.sku ? -1 : 1;
    return a.size < b.size ? -1 : (a.size > b.size ? 1 : 0);
  });
  return out;
}

/**
 * Collapse printed-apparel lines into a blanks purchase list, one row per style
 * number and size. ASICS race merch is excluded because it has its own tab.
 */
function blankOrderRows_(rows) {
  var agg = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.isFootwear) continue;
    if (!r.blankSku) continue;
    if (/asics/i.test(r.lineName) || /asics/i.test(r.vendor || '')) continue;

    var size = String(r.variant || '').split(' / ')[0].trim();
    var key = r.blankSku + '|' + size;
    if (!agg[key]) {
      agg[key] = { key: key, sku: r.blankSku, product: r.title, size: size,
                   vendorGuess: BLANK_VENDOR[r.blankSku] || '',
                   qtyNeeded: 0, orderList: [] };
    }
    agg[key].qtyNeeded += Number(r.quantity) || 0;
    if (agg[key].orderList.indexOf(r.order) === -1) agg[key].orderList.push(r.order);
  }
  var out = [];
  for (var k in agg) { agg[k].orders = agg[k].orderList.join(' '); out.push(agg[k]); }
  // BY STYLE CODE, so every size of one style sits together. That is the shape
  // an order line takes, and it is what you read off when filling a basket.
  out.sort(function (a, b) {
    if (a.sku !== b.sku) return a.sku < b.sku ? -1 : 1;
    return a.size < b.size ? -1 : (a.size > b.size ? 1 : 0);
  });
  return out;
}

/**
 * Upsert rows into one tab, writing only the columns in fieldMap.
 *
 * Human columns are never inside a write range, the same guarantee the location
 * tabs give.
 *
 * keyOf defaults to the Shopify line item id, which is unique per row on the
 * work queues. The ASICS tab passes its own, because that tab is aggregated and
 * one row covers many line items.
 *
 * opts.zeroMissing names a column to zero on rows the payload no longer
 * mentions. See the call site for why only the purchase list needs it.
 *
 * opts.seedFields are written when a row is first appended and never again, for
 * a column the sheet should offer a starting value for but a human owns.
 */
function upsertTab_(name, layout, fieldMap, rows, keyOf, opts) {
  if (!keyOf) keyOf = function (r) { return r.lineId; };
  opts = opts || {};
  // Seeded fields are written on INSERT only, never on update, so a value a
  // person corrects by hand is not overwritten on the next run.
  var seed = opts.seedFields || {};
  var sh = sheet_(name);
  ensureLayout_(sh, layout);
  var head = headerMap_(sh);
  var keyCol = head.index[KEY_HEADER];
  if (!keyCol) throw new Error('No "' + KEY_HEADER + '" column on ' + name + '.');

  var last = lastKeyedRow_(sh, keyCol);
  var nRows = Math.max(last - 1, 0);
  var rowOf = {};
  if (nRows > 0) {
    var keys = sh.getRange(2, keyCol, nRows, 1).getValues();
    for (var i = 0; i < keys.length; i++) {
      var k = String(keys[i][0] || '').trim();
      if (k) rowOf[k] = i + 2;
    }
  }

  // REBUILD MODE lays the whole tab out in payload order, the same approach the
  // location tabs use, for a tab whose ORDER matters. Human columns travel with
  // their key, and rows the payload no longer mentions are kept at the end.
  if (opts.rebuild) {
    var deepR = sh.getLastRow();
    var existingR = deepR > 1 ? sh.getRange(2, 1, deepR - 1, head.headers.length).getValues() : [];
    var byKeyR = {}, orphansR = [];
    for (var er = 0; er < existingR.length; er++) {
      var kr = String(existingR[er][keyCol - 1] || '').trim();
      var anyR = false;
      for (var cr = 0; cr < existingR[er].length; cr++) {
        if (String(existingR[er][cr] === null || existingR[er][cr] === undefined ? '' : existingR[er][cr]).trim() !== '') { anyR = true; break; }
      }
      if (!anyR) continue;
      if (kr) byKeyR[kr] = existingR[er]; else orphansR.push(existingR[er]);
    }
    var blockR = [], seenR = {}, addedR = 0, keptR = 0;
    for (var ir = 0; ir < rows.length; ir++) {
      var kk = keyOf(rows[ir]);
      var priorR = byKeyR[kk] || null;
      if (!priorR) addedR++;
      blockR.push(upsertRow_(rows[ir], head, fieldMap, seed, keyOf, priorR, name));
      seenR[kk] = true;
    }
    var droppedR = 0;
    for (var lk in byKeyR) {
      if (seenR[lk]) continue;
      var leftover = byKeyR[lk];
      // No longer needed by anyone, so say so rather than leave a stale number.
      if (opts.zeroMissing && head.index[opts.zeroMissing]) leftover[head.index[opts.zeroMissing] - 1] = 0;

      // DROP IT ENTIRELY once nothing is needed, where the caller says the
      // history is safe elsewhere. A purchase list is a list of things to buy,
      // and a row reading zero is not one of them. For Blanks to Order the
      // batch, quantity and PO are already on the Ordered Blanks tab, so the
      // row carries nothing unique once it is finished.
      //
      // EXCEPT IF SOMEBODY WROTE A NOTE. "Backordered, chasing SanMar" must not
      // vanish because a number reached zero.
      if (opts.dropWhenZero) {
        var noteCol = head.index[opts.dropWhenZero];
        var hasNote = noteCol &&
          String(leftover[noteCol - 1] === null || leftover[noteCol - 1] === undefined ? '' : leftover[noteCol - 1]).trim() !== '';
        if (!hasNote) { droppedR++; continue; }
      }
      blockR.push(leftover);
      keptR++;
    }
    for (var orr = 0; orr < orphansR.length; orr++) blockR.push(orphansR[orr]);

    var needR = blockR.length + 1;
    if (needR > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), needR - sh.getMaxRows() + 50);
    if (blockR.length) sh.getRange(2, 1, blockR.length, head.headers.length).setValues(blockR);
    var tailR = sh.getLastRow() - (blockR.length + 1);
    if (tailR > 0) sh.getRange(blockR.length + 2, 1, tailR, head.headers.length).clearContent();
    sh.hideColumns(keyCol);
    return { updated: rows.length - addedR, added: addedR, zeroed: keptR, dropped: droppedR };
  }

  var updates = [], appends = [];
  for (var j = 0; j < rows.length; j++) {
    var rk = keyOf(rows[j]);
    if (rowOf[rk]) updates.push({ row: rowOf[rk], data: rows[j] });
    else appends.push(rows[j]);
  }

  if (nRows > 0 && updates.length) {
    var plan = [];
    var fields = Object.keys(fieldMap);
    for (var f = 0; f < fields.length; f++) {
      if (head.index[fields[f]]) plan.push({ col: head.index[fields[f]], field: fieldMap[fields[f]] });
    }
    if (name === NAMES_SHEET) plan.push({ col: NAMES_DATE_COL, field: 'date' });
    for (var pi = 0; pi < plan.length; pi++) {
      var rng = sh.getRange(2, plan[pi].col, nRows, 1);
      var vals = rng.getValues();
      for (var u = 0; u < updates.length; u++) {
        vals[updates[u].row - 2][0] = fieldValue_(plan[pi].field, updates[u].data);
      }
      rng.setValues(vals);
    }
  }

  if (appends.length) {
    var block = [];
    for (var a = 0; a < appends.length; a++) {
      var line = [];
      for (var h = 0; h < head.headers.length; h++) {
        var hdr = head.headers[h];
        var trimmed = hdr.trim();
        if (trimmed === KEY_HEADER) line.push(keyOf(appends[a]) || '');
        else if (name === NAMES_SHEET && h + 1 === NAMES_DATE_COL) line.push(fieldValue_('date', appends[a]));
        else if (fieldMap[hdr] || fieldMap[trimmed]) line.push(fieldValue_(fieldMap[hdr] || fieldMap[trimmed], appends[a]));
        else if (seed[hdr] || seed[trimmed]) line.push(fieldValue_(seed[hdr] || seed[trimmed], appends[a]));
        else line.push('');
      }
      block.push(line);
    }
    appendRows_(sh, block, head.headers.length, keyCol);
  }
  // Rows the payload no longer mentions. Only touched when the caller asks,
  // because on an append-only log like Names a missing row is simply history.
  var zeroed = 0;
  if (opts.zeroMissing && nRows > 0) {
    var zc = head.index[opts.zeroMissing];
    if (zc) {
      var present = {};
      for (var pz = 0; pz < rows.length; pz++) present[keyOf(rows[pz])] = true;
      var zrng = sh.getRange(2, zc, nRows, 1);
      var zvals = zrng.getValues();
      var kvals = sh.getRange(2, keyCol, nRows, 1).getValues();
      var touched = false;
      for (var zi = 0; zi < kvals.length; zi++) {
        var zk = String(kvals[zi][0] || '').trim();
        if (!zk || present[zk]) continue;
        if (zvals[zi][0] === 0 || zvals[zi][0] === '') continue;
        zvals[zi][0] = 0;
        touched = true;
        zeroed++;
      }
      if (touched) zrng.setValues(zvals);
    }
  }

  sh.hideColumns(keyCol);
  return { updated: updates.length, added: appends.length, zeroed: zeroed };
}

/**
 * The last row that holds a REAL row, found by looking for a key rather than by
 * asking the sheet.
 *
 * THE BUG THIS FIXES, and it is the one that made new orders invisible.
 * getLastRow() reports the last row Sheets considers used, and DATA VALIDATION
 * COUNTS. Format sheets puts the Packing Slip checkbox and the row banding on
 * rows 2 to 1000, so every tab started reporting a last row near 1000 even with
 * 225 real rows on it. Appends then landed at row 1001, a thousand blank rows
 * below the data, which from the sheet looks exactly like "the sync stopped
 * bringing orders in". Measured on the live sheet 2026-10-07: Warehouse
 * Shipouts reported 995 rows against 225 real ones.
 *
 * A key is the only honest marker of a real row, so that is what is counted.
 */
function lastKeyedRow_(sh, keyCol) {
  var max = sh.getLastRow();
  if (max < 2 || !keyCol) return 1;
  var keys = sh.getRange(2, keyCol, max - 1, 1).getValues();
  for (var i = keys.length - 1; i >= 0; i--) {
    if (String(keys[i][0] || '').trim()) return i + 2;
  }
  return 1;
}

/**
 * Append a block of rows directly under the last keyed row, growing the sheet
 * if needed. Never uses getLastRow for the position, see lastKeyedRow_.
 */
function appendRows_(sh, block, width, keyCol) {
  if (!block.length) return;
  var start = lastKeyedRow_(sh, keyCol) + 1;
  var need = start + block.length - 1;
  var have = sh.getMaxRows();
  if (need > have) sh.insertRowsAfter(have, need - have + 50);   // +50 of headroom
  sh.getRange(start, 1, block.length, width).setValues(block);
}

/**
 * One row for an upsert tab. Machine columns from the payload, human columns
 * from whatever that key already had, seeded columns only when the row is new.
 */
function upsertRow_(r, head, fieldMap, seed, keyOf, prior, tabName) {
  var out = [];
  for (var h = 0; h < head.headers.length; h++) {
    var hdr = head.headers[h], trimmed = hdr.trim();
    if (trimmed === KEY_HEADER) { out.push(keyOf(r) || ''); continue; }
    if (tabName === NAMES_SHEET && h + 1 === NAMES_DATE_COL) { out.push(fieldValue_('date', r)); continue; }
    var f = fieldMap[hdr] || fieldMap[trimmed];
    if (f) { out.push(fieldValue_(f, r)); continue; }
    if (prior) { out.push(prior[h]); continue; }
    var sf = seed[hdr] || seed[trimmed];
    out.push(sf ? fieldValue_(sf, r) : '');
  }
  return out;
}

/** Field lookup by payload key, with the date turned into a real date cell. */
function fieldValue_(field, r) {
  if (field === 'date') return r.date ? new Date(r.date) : '';
  var v = r[field];
  return (v === undefined || v === null) ? '' : v;
}

/**
 * Lay a tab out from row 2 in one pass. NOTHING IS APPENDED.
 *
 * WHY THIS REPLACED APPENDING. "Where does the next row go" was asked four
 * different ways and got the wrong answer every time. getLastRow was inflated by
 * the checkbox formatting and sent rows to 996. Counting keyed rows then
 * faithfully followed the rows already stranded at 996. Deleting blank rows
 * depended on correctly deciding what was blank, which on the live sheet it did
 * not. Every one of those is a way of GUESSING a position.
 *
 * So the position is no longer computed. The whole body is rebuilt: every row
 * that should be on this tab, in order, written from row 2, with whatever sits
 * below cleared. A gap cannot form and a row cannot land somewhere odd, because
 * there is no "next free row" anywhere in the logic.
 *
 * HUMAN COLUMNS TRAVEL WITH THEIR KEY. Each row's PO number, notes and initials
 * are read off the sheet keyed by line item id and written back on the same
 * row as that line, so a reorder cannot separate a note from its order.
 *
 * ROWS SHOPIFY NO LONGER REPORTS ARE KEPT, at the end, because they are orders
 * that shipped or were cancelled and are waiting for Move fulfilled to Closed.
 * Dropping them here would silently delete work in progress.
 *
 * IT REFUSES RATHER THAN RISK DATA. Before writing, it counts the non empty
 * human cells it is about to lay down and compares that to what was there. If
 * the rebuild would lose any, it aborts that tab untouched and says so. A
 * reordering bug then costs a skipped sync, not somebody's PO numbers.
 */
function rebuildTab_(T) {
  var head = T.head, sh = T.sh;
  var keyCol = head.index[KEY_HEADER];
  if (!keyCol) return { skipped: 'no _key column' };

  var width = head.headers.length;
  var deep = sh.getLastRow();
  var existing = deep > 1 ? sh.getRange(2, 1, deep - 1, width).getValues() : [];

  // Index what is on the sheet now, by key, plus anything keyless that a person
  // typed by hand.
  var byKey = {}, orphans = [], humanCellsBefore = 0;
  var humanCols = [];
  for (var h = 0; h < head.headers.length; h++) {
    var nm = head.headers[h];
    if (nm && nm !== KEY_HEADER && !MACHINE_FIELDS[nm]) humanCols.push(h);
  }
  for (var e = 0; e < existing.length; e++) {
    var row = existing[e];
    var k = String(row[keyCol - 1] || '').trim();
    var any = false;
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] === null || row[c] === undefined ? '' : row[c]).trim() !== '') { any = true; break; }
    }
    if (!any) continue;                                   // a truly blank row, drop
    for (var hc = 0; hc < humanCols.length; hc++) {
      if (String(row[humanCols[hc]] === null || row[humanCols[hc]] === undefined ? '' : row[humanCols[hc]]).trim() !== '') humanCellsBefore++;
    }
    if (k) byKey[k] = row; else orphans.push(row);
  }

  // The desired body: this tab's payload rows in order, then anything that was
  // on the sheet and is no longer reported, then hand added rows.
  var block = [], seen = {};
  for (var i = 0; i < T.rows.length; i++) {
    var r = T.rows[i];
    var prior = byKey[r.lineId] || (T.carry[r.lineId] || null);
    block.push(rebuildRow_(r, head.headers, prior, keyCol));
    seen[r.lineId] = true;
  }
  var leftovers = 0;
  for (var k2 in byKey) {
    if (seen[k2]) continue;
    block.push(byKey[k2]);                                // shipped or cancelled, awaiting archive
    leftovers++;
  }
  for (var o = 0; o < orphans.length; o++) block.push(orphans[o]);

  // The guard. Count the human cells the new block carries.
  var after = 0;
  for (var b = 0; b < block.length; b++) {
    for (var hc2 = 0; hc2 < humanCols.length; hc2++) {
      var v = block[b][humanCols[hc2]];
      if (String(v === null || v === undefined ? '' : v).trim() !== '') after++;
    }
  }
  if (after < humanCellsBefore) {
    return { skipped: 'would lose ' + (humanCellsBefore - after) + ' typed cell(s), left untouched' };
  }

  // Grow if needed, write the body, clear the tail.
  var need = block.length + 1;
  if (need > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows() + 50);
  if (block.length) sh.getRange(2, 1, block.length, width).setValues(block);
  var tail = sh.getLastRow() - (block.length + 1);
  if (tail > 0) sh.getRange(block.length + 2, 1, tail, width).clearContent();

  sh.hideColumns(keyCol);
  return { rows: block.length, leftovers: leftovers, orphans: orphans.length };
}

/**
 * One row in this tab's header order: machine columns from Shopify, human
 * columns from whatever that same line already had.
 */
function rebuildRow_(r, headers, prior, keyCol) {
  var out = [];
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i];
    if (h === KEY_HEADER) { out.push(r.lineId || ''); continue; }
    if (MACHINE_FIELDS[h]) { out.push(cellValue_(h, r)); continue; }
    out.push(prior ? prior[i] : '');
  }
  return out;
}

function cellValue_(header, r) {
  var field = MACHINE_FIELDS[header];
  if (field === 'date') return r.date ? new Date(r.date) : '';
  if (field === 'route') return r.route || r.routeNote || '';
  if (field === 'hasPersonalisation') return r.hasPersonalisation || 'No';
  if (field === 'upcharge') return r.upcharge || 0;
  var v = r[field];
  return (v === undefined || v === null) ? '' : v;
}

// ---------------------------------------------------------------- closing out

/**
 * Anything on an open tab that Shopify no longer reports as open has shipped, so
 * it moves to Closed stamped with ship date, tracking number, carrier and link.
 *
 * THE TRACKING NEEDS A SECOND LOOKUP. A line leaves the open feed precisely
 * because it stopped being open, so its tracking is no longer in /orders/open.
 * /orders/fulfilled carries it, keyed by the same line item id.
 */
/** Menu action. The work itself is archiveFulfilled_, shared with autoSync. */
function moveFulfilledToClosed() {
  toast_(archiveFulfilled_());
}

function archiveFulfilled_() {
  var rows = fetchJson_('/orders/open?includeFootwear=1').rows || [];
  var stillOpen = {};
  for (var i = 0; i < rows.length; i++) stillOpen[rows[i].lineId] = true;

  var ful = null;                                  // fetched lazily, only if needed
  var closed = sheet_(CLOSED_SHEET);
  ensureLayout_(closed, CLOSED_LAYOUT);
  var chead = headerMap_(closed);
  var voids = sheet_(VOID_SHEET);
  ensureLayout_(voids, VOID_LAYOUT);
  var vhead = headerMap_(voids);

  var tabNames = uniqueTabNames_();
  var totalMoved = 0, stamped = 0, cancelledMoved = 0, refundedMoved = 0, unknown = 0, block = [], voidBlock = [];

  for (var t = 0; t < tabNames.length; t++) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabNames[t]);
    if (!sh) continue;
    var head = headerMap_(sh);
    var keyCol = head.index[KEY_HEADER];
    var last = lastKeyedRow_(sh, keyCol);
    if (!keyCol || last < 2) continue;

    var all = sh.getRange(2, 1, last - 1, head.headers.length).getValues();
    var removals = [];
    for (var j = 0; j < all.length; j++) {
      var key = String(all[j][keyCol - 1] || '').trim();
      if (!key) continue;                          // a hand added row stays put
      if (stillOpen[key]) continue;

      if (ful === null) ful = fetchJson_('/orders/fulfilled?days=90').lines || {};
      var info = ful[key] || {};

      // A line that left the open feed for a reason we cannot establish is NOT
      // assumed shipped. It stays on the queue for a human, because the failure
      // mode of guessing is someone picking and posting a cancelled order.
      if (!info.state) { unknown++; continue; }
      if (info.state === 'CANCELLED') cancelledMoved++;
      else if (info.state === 'REFUNDED') refundedMoved++;
      else if (info.trackingNumber) stamped++;

      // A line that shipped goes to Closed. A cancelled or refunded one goes to
      // its own tab, so the shipping archive stays a record of shipments.
      var toVoid = (info.state === 'CANCELLED' || info.state === 'REFUNDED');
      var layoutHead = toVoid ? vhead : chead;

      var src = {};
      for (var c = 0; c < head.headers.length; c++) src[head.headers[c]] = all[j][c];
      var out = [];
      for (var h = 0; h < layoutHead.headers.length; h++) {
        var name = layoutHead.headers[h];
        if (ON_CLOSE_FIELDS[name]) {
          var f = ON_CLOSE_FIELDS[name];
          var val = (f === 'shippedAt') ? (info.shippedAt ? new Date(info.shippedAt) : '') : (info[f] || '');
          // Never overwrite something a person already typed.
          var existing = String(src[name] === undefined ? '' : src[name]).trim();
          out.push(existing === '' ? val : src[name]);
        } else {
          out.push(src.hasOwnProperty(name) ? src[name] : '');
        }
      }
      if (toVoid) voidBlock.push(out); else block.push(out);
      removals.push(j + 2);
      totalMoved++;
    }
    removals.sort(function (x, y) { return y - x; });
    for (var d = 0; d < removals.length; d++) sh.deleteRow(removals[d]);
  }

  if (!totalMoved) {
    return 'Nothing to archive.' + (unknown ? ' ' + unknown + ' line(s) left the open list for no reason I could establish, so they stay on the queue.' : '');
  }
  if (block.length) appendRows_(closed, block, chead.headers.length, chead.index[KEY_HEADER]);
  if (voidBlock.length) appendRows_(voids, voidBlock, vhead.headers.length, vhead.index[KEY_HEADER]);
  if (chead.index[KEY_HEADER]) closed.hideColumns(chead.index[KEY_HEADER]);
  if (vhead.index[KEY_HEADER]) voids.hideColumns(vhead.index[KEY_HEADER]);
  var shipped = totalMoved - cancelledMoved - refundedMoved;
  var msg = 'Archived ' + totalMoved + ' line(s): ' + shipped + ' shipped to Closed (' +
            stamped + ' with tracking), ' + cancelledMoved + ' cancelled and ' +
            refundedMoved + ' refunded to "' + VOID_SHEET + '".';
  if (unknown) msg += ' ' + unknown + ' left on the queue, reason unknown.';
  return msg;
}

// ---------------------------------------------------------------- helpers

/** Every tab name a location could map to, including the catch-all. */
function uniqueTabNames_() {
  var seen = {}, out = [];
  for (var k in LOCATION_TABS) {
    if (!seen[LOCATION_TABS[k]]) { seen[LOCATION_TABS[k]] = true; out.push(LOCATION_TABS[k]); }
  }
  out.push(UNROUTED_TAB);
  return out;
}

/**
 * The tabs this run should open: ones that already exist, plus ones this payload
 * needs. An existing tab is always included even with no rows this time, because
 * its rows may have moved elsewhere and the old copy has to be deleted.
 */
function tabsInPlay_(rows) {
  var possible = uniqueTabNames_();
  var existing = {};
  var all = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < all.length; i++) existing[all[i].getName()] = true;

  var needed = {};
  for (var r = 0; r < rows.length; r++) needed[tabFor_(rows[r])] = true;

  var out = [];
  for (var p = 0; p < possible.length; p++) {
    if (existing[possible[p]] || needed[possible[p]]) out.push(possible[p]);
  }
  return out;
}

function fetchJson_(path) {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('WORKER_URL');
  var token = props.getProperty('ORDERS_TOKEN');
  if (!base || !token) throw new Error('Run Shopify > Set up first.');
  var res = UrlFetchApp.fetch(base + path, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Worker returned ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  return JSON.parse(res.getContentText());
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/**
 * Headers are kept RAW, because ensureLayout_ compares against the live sheet
 * and a trimmed copy would see 'Printed ' as missing and add a second column.
 * The index holds both the raw and the trimmed spelling, so a lookup works
 * either way and a stray trailing space cannot cause a duplicate column.
 */
function headerMap_(sh) {
  var width = Math.max(sh.getLastColumn(), 1);
  var raw = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h === null || h === undefined ? '' : h); });
  var index = {};
  for (var i = 0; i < raw.length; i++) {
    if (raw[i]) index[raw[i]] = i + 1;
    var t = raw[i].trim();
    if (t && !index[t]) index[t] = i + 1;
  }
  return { headers: raw, index: index };
}

/**
 * A blank tab gets the given layout. A tab that already has headers keeps them,
 * and only gains columns this script needs but cannot find, appended on the
 * right so nothing shifts under anyone's data.
 */
function ensureLayout_(sh, layout) {
  // "Is this sheet new?" cannot be answered by cell A1, because the Names tab's
  // first column has NO header by design. Testing A1 alone made Names look new
  // on every single run, which rewrote its header row and re-ran the formatter
  // each time. Ask whether the whole header row is empty instead.
  var w = Math.max(sh.getLastColumn(), 1);
  var firstRow = sh.getRange(1, 1, 1, w).getValues()[0];
  var headerEmpty = firstRow.join('').trim() === '';
  if (sh.getLastRow() === 0 || headerEmpty) {
    sh.getRange(1, 1, 1, layout.length).setValues([layout]);
    sh.setFrozenRows(1);
    // DO NOT FORMAT HERE. An earlier version did, and it broke the sync: the
    // checkbox rule went onto Packing Slip Printed? for a thousand rows BEFORE
    // any data was written, so the append then wrote an empty string into cells
    // that only accept Yes or No. Formatting is a menu action, deliberately
    // outside the write path. Shopify > Format sheets.
    return;
  }
  var head = headerMap_(sh);
  var missing = [];
  for (var i = 0; i < layout.length; i++) {
    // A blank layout entry is a deliberately unnamed column on the live sheet,
    // never something to go looking for or to add again.
    if (!layout[i]) continue;
    if (!head.index[layout[i]] && !head.index[String(layout[i]).trim()]) missing.push(layout[i]);
  }
  if (missing.length) sh.getRange(1, head.headers.length + 1, 1, missing.length).setValues([missing]);
  sh.setFrozenRows(1);
}

function toast_(msg) {
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'Shopify sync', 8);
}
