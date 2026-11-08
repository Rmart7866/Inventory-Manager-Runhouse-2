// tracking-mailbox.gs, The Run House. Runs INSIDE the needham@therunhouse.com
// mailbox as a Google Apps Script, not in this repo's tooling.
//
// Every 10 minutes it looks at the last two days of mail for supplier shipping
// emails (a PO shaped like 93307_Smith AND something shaped like a tracking
// number), and sends each one ONCE to the Worker, which decides what to do
// (worker/src/tracking.js). Everything else in the mailbox is never sent
// anywhere: the two shape tests below run here, before any request.
//
// SET UP, once, signed in as needham@therunhouse.com:
//   1. script.google.com > New project, name it "Run House tracking".
//   2. Replace the code with this file's contents and save.
//   3. Project Settings > Script Properties > Add: WRITE_SECRET = the staff
//      write secret (the same one the staff pages ask for). It lives only in
//      this project's properties, never in this file.
//   4. Run setup() once and approve the Gmail and external request access.
//      It installs the 10 minute trigger. Run it again any time; it never
//      installs two.
//   5. Run run() once by hand and check View > Logs.
//
// The Worker skips a message it has already seen, so running more often or
// by hand never sends a tracking twice.
//
// House style: no em dashes. Use commas, periods, or the word "to".

var WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
var CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36'; // public by construction, see catalog-client.js
var LABEL = 'RH tracking';
var QUERY = 'newer_than:2d -in:sent -in:drafts (tracking OR shipped OR shipment OR "has shipped" OR "ship confirmation")';
var PO_RE = /(^|[^0-9A-Za-z])\d{4,7}_[A-Za-z]/;
// UPS, USPS, the word FedEx, or a 12/15 digit number under a "Tracking
// number(s):" label, which is how Brooks writes it without naming a carrier.
var TRK_RE = /\b1Z[0-9A-Z]{16}\b|(^|\D)9[2-5]\d{18,20}(\D|$)|fedex|tracking\s*(numbers?|no\.?|#)?\s*[:#]?\s*\d{12}/i;

function run() {
  var secret = PropertiesService.getScriptProperties().getProperty('WRITE_SECRET');
  if (!secret) throw new Error('Set WRITE_SECRET in Project Settings > Script Properties first.');
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('SENT_IDS') || '[]');
  var seen = {};
  done.forEach(function (id) { seen[id] = true; });
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var threads = GmailApp.search(QUERY, 0, 60);
  var sent = 0, results = [];
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      var id = m.getId();
      if (seen[id]) return;
      if (Date.now() - m.getDate().getTime() > 3 * 86400000) return;
      var subject = m.getSubject() || '', body = m.getPlainBody() || '';
      var text = subject + '\n' + body;
      if (!PO_RE.test(text) || !TRK_RE.test(text)) return; // not a shipping email, never sent
      var res = UrlFetchApp.fetch(WORKER + '/tracking/ingest', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + CATALOG_TOKEN, 'X-Write-Secret': secret },
        payload: JSON.stringify({ id: id, from: m.getFrom(), subject: subject, date: m.getDate().toISOString(), body: body.slice(0, 40000) }),
      });
      if (res.getResponseCode() === 200) {
        seen[id] = true; done.push(id); sent++;
        thread.addLabel(label);
        results.push(subject.slice(0, 60) + ' -> ' + res.getContentText().slice(0, 160));
      } else {
        // Left unmarked, so the next run tries again.
        results.push('FAILED ' + res.getResponseCode() + ' on "' + subject.slice(0, 60) + '": ' + res.getContentText().slice(0, 200));
      }
    });
  });
  props.setProperty('SENT_IDS', JSON.stringify(done.slice(-1500)));
  Logger.log(sent + ' sent. ' + results.join(' | '));
}

function setup() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'run'; });
  if (!has) ScriptApp.newTrigger('run').timeBased().everyMinutes(10).create();
  Logger.log(has ? 'Trigger already installed.' : 'Installed: run() every 10 minutes.');
}
