// hoka.js, The Run House order prep, on HOKA's B2B cart
// (hokaus.deckersb2b.deckers.com/order-center). Fixed steps, no judgement:
//
//   1. the cart must be EMPTY, or nothing happens (two orders never mix);
//   2. upload a "UPC & Quantity" spreadsheet through HOKA's own Upload;
//   3. fill the one-time drop-ship address and save it (HOKA asks "Confirm to
//      save drop ship?"; that saves the address on the working cart only);
//   4. choose "as soon as possible" delivery (owner decision 2026-11-09);
//   5. type the PO;
//   6. STOP, with a banner telling a person to check and submit.
//
// IT NEVER SUBMITS. Every click goes through safeClick(), which refuses
// anything reading Submit, Save As Draft, Clear All or Place order. There is
// no code path to those buttons at all.
//
// The page's field names were read off the live cart 2026-11-09:
// districtInfo.firstName / lastName / phone / street1 / street2 / city / zip,
// State and Country dropdowns, the Save button btn-id
// "clickSubmitOrderSetting", and the PO input form.PurchaseOrderOfAsap. A
// test upload of "UPC | Quantity" put the right shoe and size in the cart.
//
// An international order arrives with NO address: it ships to the store, so
// the one-time drop-ship address is left off and HOKA uses the account's own
// ship-to.
//
// House style: no em dashes. Use commas, periods, or the word "to".
(function () {
  const MAX_AGE = 15 * 60 * 1000;
  const FORBIDDEN = /submit|save as draft|clear all|place order/i;
  const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!(el && el.offsetParent && el.getBoundingClientRect().width > 0);
  async function waitFor(fn, ms, what) {
    const end = Date.now() + ms;
    for (;;) {
      let v; try { v = fn(); } catch (e) { v = null; }
      if (v) return v;
      if (Date.now() > end) throw new Error('Timed out waiting for ' + what);
      await sleep(300);
    }
  }
  function safeClick(el, what) {
    if (!el) throw new Error('Could not find ' + what);
    const text = (el.innerText || el.textContent || el.value || '').trim();
    if (FORBIDDEN.test(text)) throw new Error('Refused to press "' + text + '": order prep never submits');
    el.click();
  }
  function setVal(el, v) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, v == null ? '' : String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }
  const pageText = () => document.body.innerText || '';
  // "1 Products 2 units", read off the Items header.
  function cartCounts() {
    const m = /(\d+)\s*Products\s*(\d+)\s*units/i.exec(pageText().replace(/\s+/g, ' '));
    return m ? { products: +m[1], units: +m[2] } : null;
  }
  const cartEmpty = () => /No items available/i.test(pageText());

  // ---------- the banner ----------
  let box;
  function banner(lines, tone) {
    if (!box) {
      box = document.createElement('div');
      box.id = 'rh-prep-banner';
      box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:340px;max-width:calc(100vw - 32px);background:#111828;color:#eef2f8;border:1px solid rgba(255,255,255,.18);border-left:4px solid #4c9bff;font:14px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.4)';
      document.body.appendChild(box);
    }
    box.style.borderLeftColor = tone === 'bad' ? '#ff7a90' : tone === 'ok' ? '#3ddc97' : '#4c9bff';
    box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Run House order prep</div>' + lines.map((l) => '<div>' + l + '</div>').join('') +
      '<button type="button" style="margin-top:8px;background:none;border:1px solid rgba(255,255,255,.25);color:inherit;padding:3px 10px;cursor:pointer">Close</button>';
    box.querySelector('button').onclick = () => box.remove();
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- steps ----------
  async function upload(job) {
    const units = job.lines.reduce((a, l) => a + l.qty, 0);
    const nav = await waitFor(() => [...document.querySelectorAll('div,span,p,a,li')].find((e) => visible(e) && e.childElementCount === 0 && e.textContent.trim() === 'Upload' && !e.closest('.el-dialog')), 15000, 'the Upload button');
    safeClick(nav.parentElement || nav, 'the Upload button');
    const dlg = await waitFor(() => [...document.querySelectorAll('.el-dialog')].find((d) => visible(d) && /Change Upload Type/.test(d.innerText)), 10000, 'the Upload box');
    safeClick(dlg.querySelector('.el-select input'), 'the upload type box');
    const opt = await waitFor(() => [...document.querySelectorAll('.el-select-dropdown__item')].find((i) => visible(i) && /UPC\s*&\s*Quantity/i.test(i.textContent)), 5000, 'the UPC & Quantity option');
    safeClick(opt, 'the UPC & Quantity option');
    await waitFor(() => /UPC\s*&\s*Quantity/i.test(dlg.querySelector('.el-select input').value), 3000, 'the upload type to change');
    const bytes = window.RHXlsx.build([['UPC', 'Quantity']].concat(job.lines.map((l) => [String(l.upc), l.qty])));
    const file = new File([bytes], 'runhouse-' + job.po.replace(/[^\w-]/g, '') + '.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const input = dlg.querySelector('input[type=file]');
    if (!input) throw new Error('Could not find the file box in the Upload box');
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => dlg.innerText.includes(file.name), 5000, 'the file to attach');
    safeClick([...dlg.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Upload'), 'the Upload button in the box');
    // HOKA reloads the cart after an upload; wait for the units to land.
    const c = await waitFor(() => { const x = cartCounts(); return x && x.units >= units ? x : null; }, 60000, 'the items to reach the cart').catch(() => cartCounts());
    return { want: units, got: c ? c.units : 0 };
  }

  async function address(a) {
    const sw = await waitFor(() => [...document.querySelectorAll('.el-switch')].find((s) => /One-time Deliver To/i.test(s.parentElement.innerText)), 10000, 'the drop-ship switch');
    if (!sw.classList.contains('is-checked')) safeClick(sw, 'the drop-ship switch');
    const field = (n) => document.querySelector('input[name="districtInfo.' + n + '"]');
    await waitFor(() => visible(field('firstName')), 5000, 'the drop-ship form');
    const filled = { firstName: a.firstName, lastName: a.lastName, phone: a.phone, street1: a.street1, street2: a.street2, city: a.city, zip: a.zip };
    for (const [k, v] of Object.entries(filled)) { const f = field(k); if (f) setVal(f, v); }
    const pick = async (label, text) => {
      const item = [...document.querySelectorAll('.el-form-item')].find((fi) => visible(fi) && new RegExp('^\\s*' + label + ':?', 'i').test(fi.innerText));
      const inp = item && item.querySelector('.el-select input');
      if (!inp) throw new Error('Could not find the ' + label + ' box');
      if (inp.value.trim().toLowerCase() === text.toLowerCase()) return;
      safeClick(inp, 'the ' + label + ' box');
      const o = await waitFor(() => [...document.querySelectorAll('.el-select-dropdown__item')].find((i) => visible(i) && i.textContent.trim().toLowerCase() === text.toLowerCase()), 5000, label + ' "' + text + '"');
      safeClick(o, label + ' ' + text);
      await sleep(300);
    };
    await pick('Country', 'United States').catch(async () => pick('Country', 'US'));
    const stateName = STATES[String(a.state || '').toUpperCase()];
    if (!stateName) throw new Error('Unknown state "' + a.state + '"');
    await pick('State', stateName);
    await sleep(500);
    safeClick(document.querySelector('button[btn-id="clickSubmitOrderSetting"]'), 'the address Save button');
    const mb = await waitFor(() => [...document.querySelectorAll('.el-message-box')].find((m) => visible(m) && /drop ship/i.test(m.innerText)), 8000, 'HOKA to ask about saving the drop ship address');
    safeClick([...mb.querySelectorAll('button')].find((b) => /confirm/i.test(b.innerText)), 'Confirm on the drop ship question');
    await waitFor(() => !visible(mb), 8000, 'the address to save');
  }

  async function delivery() {
    const r = await waitFor(() => [...document.querySelectorAll('.el-radio')].find((x) => visible(x) && /as soon as possible/i.test(x.innerText)), 10000, 'the delivery choices');
    if (!r.classList.contains('is-checked')) safeClick(r, 'As soon as possible');
  }

  async function po(value) {
    const inp = await waitFor(() => { const i = document.querySelector('input[name="form.PurchaseOrderOfAsap"]'); return visible(i) ? i : null; }, 10000, 'the PO box');
    setVal(inp, value);
  }

  async function run(job) {
    const done = [];
    const show = (now, tone) => banner(done.map((d) => '✓ ' + esc(d)).concat(now ? [now] : []), tone);
    try {
      show('Waiting for the cart to load...');
      await waitFor(() => /ORDER SETTING/i.test(pageText()) && (cartEmpty() || cartCounts()), 30000, 'the cart to load');
      if (!cartEmpty()) {
        banner(['<b>Nothing was done.</b> The HOKA cart already has items, so ' + esc(job.po) + ' was not added, to keep two orders from mixing.', 'Save or clear that cart yourself, then press Prep in HOKA again.'], 'bad');
        return;
      }
      show('Adding ' + job.lines.length + ' item' + (job.lines.length === 1 ? '' : 's') + ' by UPC...');
      const u = await upload(job);
      done.push('Items: ' + u.got + ' of ' + u.want + ' pair' + (u.want === 1 ? '' : 's') + ' in the cart');
      const short = u.got < u.want;
      if (job.address) {
        show('Filling the drop-ship address...');
        await address(job.address);
        done.push('Drop-ship address: ' + job.address.firstName + ' ' + job.address.lastName + ', ' + job.address.city + ' ' + job.address.state);
      } else {
        done.push(job.international ? 'International order: no drop-ship address, so HOKA ships to the store' : 'No address on the order: drop-ship address left off');
      }
      show('Setting delivery and PO...');
      await delivery();
      done.push('Delivery: as soon as possible');
      await po(job.po);
      done.push('PO ' + job.po);
      banner(done.map((d) => '✓ ' + esc(d)).concat([
        short ? '<b style="color:#f2c14e">Only ' + u.got + ' of ' + u.want + ' pairs went in: HOKA did not recognise a UPC. Add the rest by hand.</b>' : '',
        '<b>Ready for you.</b> Check the items, sizes, stock per size and address, then press <b>Submit Order</b> yourself. Nothing has been submitted.',
      ].filter(Boolean)), short ? 'bad' : 'ok');
    } catch (e) {
      banner(done.map((d) => '✓ ' + esc(d)).concat(['<b>Stopped:</b> ' + esc(e.message) + '. Nothing was submitted; finish this one by hand.']), 'bad');
    }
  }

  // ---------- the job hand-off ----------
  async function check() {
    if (!/shoppingCar/i.test(location.hash)) return;
    const { rhPrepJob: job } = await chrome.storage.local.get('rhPrepJob');
    if (!job || job.state !== 'pending' || job.supplier !== 'hoka') return;
    // Taken once, whatever happens next, so a reload never runs it twice.
    await chrome.storage.local.remove('rhPrepJob');
    if (Date.now() - job.at > MAX_AGE) { banner(['A prep request from more than 15 minutes ago was ignored. Press Prep in HOKA again.'], 'bad'); return; }
    run(job);
  }
  window.addEventListener('hashchange', check);
  check();
})();
