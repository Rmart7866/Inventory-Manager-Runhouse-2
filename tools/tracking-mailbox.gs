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
//   5. Run run() once by hand and check View > Logs. To test on the last
//      week of mail instead, run backfill() once.
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

// run(): the last 2 days, what the 10 minute trigger calls.
// backfill(): the last 7, once by hand, to test on recent mail.
// backfill() also resends mail it sent before, so a fix to the reader can be
// tried on the same week; the Worker re-reads only what went to a person.
function run() { sendRecent_(2, 3, false); forwardAtsReports_(); }

// HOKA ATS REPORT LINKS, 2026-11-13. The HOKA portal does not hand its ATS
// report over; it emails a link here (DeckersB2B <no-reply@deckersb2b.deckers.com>,
// subject "<Season> ATS Report"), measured at about a minute after the
// request. The nightly runner (tools/hoka-headless-run.mjs) asks for the
// report, then reads the link from the Worker. ONLY that sender and subject
// are searched, and ONLY a link into Deckers' report bucket leaves this
// mailbox; the Worker checks it against the same allowlist and ignores a
// link it already has, so running this often is harmless.
var ATS_QUERY = 'newer_than:2d from:no-reply@deckersb2b.deckers.com subject:"ATS Report"';
var ATS_LINK_RE = /https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/us\.assets\.b2b\.deckers\.com\/company_\d+\/DynamicReports\/[^"'<>\s?#]*ATS_Report[^"'<>\s?#]*\.xlsx/i;
function forwardAtsReports_() {
  var secret = PropertiesService.getScriptProperties().getProperty('WRITE_SECRET');
  if (!secret) return;
  var out = [];
  GmailApp.search(ATS_QUERY, 0, 20).forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      var link = (textOf_(m).match(ATS_LINK_RE) || [])[0];
      if (!link) { out.push('no report link in "' + (m.getSubject() || '').slice(0, 60) + '"'); return; }
      var res = UrlFetchApp.fetch(WORKER + '/feeds/link?brand=hoka', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + CATALOG_TOKEN, 'X-Write-Secret': secret },
        payload: JSON.stringify({ url: link, subject: m.getSubject() || '', emailedAt: m.getDate().toISOString() }),
      });
      out.push(res.getResponseCode() + ' ' + res.getContentText().slice(0, 80));
    });
  });
  if (out.length) Logger.log('HOKA ATS links: ' + out.join(' | '));
}
function backfill() { sendRecent_(7, 8, true); }

// The plain text AND the HTML, with each link's address kept. HOKA and
// Brooks send HTML mail whose plain text part does not carry the tracking
// number (Brooks puts it only in a link's text), so reading getPlainBody()
// alone found nothing on the first real run, 2026-11-08.
function textOf_(m) {
  var html = m.getBody() || '';
  var fromHtml = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>/gi, ' $1 ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ');
  return (m.getPlainBody() || '') + '\n' + fromHtml;
}

function sendRecent_(days, maxAge, resend) {
  var secret = PropertiesService.getScriptProperties().getProperty('WRITE_SECRET');
  if (!secret) throw new Error('Set WRITE_SECRET in Project Settings > Script Properties first.');
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('SENT_IDS') || '[]');
  var seen = {};
  done.forEach(function (id) { seen[id] = true; });
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var threads = GmailApp.search(QUERY.replace('newer_than:2d', 'newer_than:' + days + 'd'), 0, 100);
  // Counted so a run that sends nothing says why.
  var sent = 0, results = [], n = { threads: threads.length, messages: 0, already: 0, old: 0, noPO: 0, noTracking: 0 };
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (m) {
      n.messages++;
      var id = m.getId();
      if (seen[id] && !resend) { n.already++; return; }
      if (Date.now() - m.getDate().getTime() > maxAge * 86400000) { n.old++; return; }
      var subject = m.getSubject() || '', body = textOf_(m);
      var text = subject + '\n' + body;
      // Not a shipping email: never sent anywhere.
      if (!PO_RE.test(text)) { n.noPO++; return; }
      if (!TRK_RE.test(text)) { n.noTracking++; return; }
      var res = UrlFetchApp.fetch(WORKER + '/tracking/ingest', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + CATALOG_TOKEN, 'X-Write-Secret': secret },
        payload: JSON.stringify({ id: id, from: m.getFrom(), subject: subject, date: m.getDate().toISOString(), body: body.slice(0, 40000) }),
      });
      if (res.getResponseCode() === 200) {
        if (!seen[id]) done.push(id);
        seen[id] = true; sent++;
        thread.addLabel(label);
        results.push(subject.slice(0, 60) + ' -> ' + res.getContentText().slice(0, 160));
      } else {
        // Left unmarked, so the next run tries again.
        results.push('FAILED ' + res.getResponseCode() + ' on "' + subject.slice(0, 60) + '": ' + res.getContentText().slice(0, 200));
      }
    });
  });
  props.setProperty('SENT_IDS', JSON.stringify(done.slice(-1500)));
  Logger.log(sent + ' sent. ' + JSON.stringify(n) + ' ' + results.join(' | '));
}

function setup() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'run'; });
  if (!has) ScriptApp.newTrigger('run').timeBased().everyMinutes(10).create();
  Logger.log(has ? 'Trigger already installed.' : 'Installed: run() every 10 minutes.');
}
