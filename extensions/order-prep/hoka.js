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
  // "I agree" too: switching on the drop-ship address can bring up HOKA's
  // B2B2C Terms and Conditions (seen 2026-11-09), and agreeing to terms is a
  // person's decision, never the system's.
  const FORBIDDEN = /submit|save as draft|clear all|place order|\bagree\b/i;
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
    if (FORBIDDEN.test(text)) throw new Error('Refused to press "' + text + '": the draft tool never submits');
    // An SVG icon has no .click(); a real click event reaches the same handler.
    if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
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
    // Saved, so a reload of the cart can say how far the run got.
    try { chrome.storage.local.set({ rhPrepLast: { at: Date.now(), lines, tone: tone || '', shown: false } }); } catch (e) { /* storage unavailable: the banner still shows */ }
    box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Run House order draft</div>' + lines.map((l) => '<div>' + l + '</div>').join('') +
      '<button type="button" style="margin-top:8px;background:none;border:1px solid rgba(255,255,255,.25);color:inherit;padding:3px 10px;cursor:pointer">Close</button>';
    box.querySelector('button').onclick = () => box.remove();
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // "1171926-BSSM-08.5B" -> "1171926-BSSM", the style-colour code HOKA's cart shows.
  const styleOf = (sku) => { const m = /^(\d{6,8}-[A-Z0-9]{2,6})-/i.exec(String(sku || '')); return m ? m[1].toUpperCase() : ''; };
  // A question in the banner with one button. Resolves true on the button,
  // false on Close or after 5 minutes. The PERSON presses it, not the prep.
  function ask(lines, label) {
    banner(lines, 'bad');
    return new Promise((resolve) => {
      const yes = document.createElement('button');
      yes.type = 'button'; yes.textContent = label;
      yes.style.cssText = 'margin:8px 8px 0 0;background:#4c9bff;border:0;color:#0b1220;font-weight:700;padding:5px 12px;cursor:pointer';
      const close = box.querySelector('button');
      box.insertBefore(yes, close);
      const t = setTimeout(() => resolve(false), 5 * 60 * 1000);
      yes.onclick = () => { clearTimeout(t); resolve(true); };
      close.onclick = () => { clearTimeout(t); box.remove(); box = null; resolve(false); };
    });
  }

  // ---------- steps ----------
  async function upload(job) {
    const units = job.lines.reduce((a, l) => a + l.qty, 0);
    // The top bar's Upload is a div.nav-icon_text holding an icon and the word.
    // Only the ICON opens the box: a click on the word or its wrapper does
    // nothing (found on the first real run, 2026-11-09).
    const label = await waitFor(() => [...document.querySelectorAll('span.text')].find((e) => visible(e) && e.textContent.trim() === 'Upload' && !e.closest('.el-dialog')), 15000, 'the Upload button');
    safeClick(label.parentElement.querySelector('svg') || label.parentElement, 'the Upload icon');
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

  // TYPING, not setting. HOKA only enables the address Save once it sees real
  // typing: a value set straight onto the field fills it but leaves Save grey
  // (real run 2026-11-09, the owner had to type a key). execCommand
  // ('insertText') goes through the browser's own editing path, which the
  // page treats as typing; the value setter stays as a fallback.
  function typeInto(el, v) {
    const text = v == null ? '' : String(v);
    el.focus();
    if (el.select) el.select();
    const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
    if (!ok || el.value !== text) setVal(el, text);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  async function address(a, onSaving) {
    const sw = await waitFor(() => [...document.querySelectorAll('.el-switch')].find((s) => /One-time Deliver To/i.test(s.parentElement.innerText)), 10000, 'the drop-ship switch');
    if (!sw.classList.contains('is-checked')) safeClick(sw, 'the drop-ship switch');
    // HOKA may ask for its B2B2C terms first. A PERSON agrees, or cancels.
    const termsOpen = () => [...document.querySelectorAll('.el-dialog')].find((d) => visible(d) && /TERMS AND CONDITIONS/i.test(d.innerText));
    await sleep(1200);
    if (termsOpen()) {
      banner(['<b>Your turn:</b> HOKA wants you to agree to its B2B2C terms before using a drop-ship address. Read them and press <b>I agree</b> yourself. HOKA reloads the page after that; the draft carries on by itself within about 20 seconds. Cancel stops it here.'], 'bad');
      await waitFor(() => !termsOpen(), 5 * 60 * 1000, 'the terms to be answered');
      await sleep(800);
      if (!sw.classList.contains('is-checked')) throw new Error('The terms were cancelled, so no drop-ship address was set');
    }
    const field = (n) => document.querySelector('input[name="districtInfo.' + n + '"]');
    await waitFor(() => visible(field('firstName')), 5000, 'the drop-ship form');
    const filled = { firstName: a.firstName, lastName: a.lastName, phone: a.phone, street1: a.street1, street2: a.street2, city: a.city, zip: a.zip };
    for (const [k, v] of Object.entries(filled)) { const f = field(k); if (f) typeInto(f, v); }
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
    const saveBtn = document.querySelector('button[btn-id="clickSubmitOrderSetting"]');
    if (!saveBtn) throw new Error('Could not find the address Save button');
    const enabled = () => !saveBtn.disabled && !saveBtn.classList.contains('is-disabled');
    const prompt = () => [...document.querySelectorAll('.el-message-box')].find((m) => visible(m) && /drop ship/i.test(m.innerText));
    let ready = await waitFor(enabled, 4000, 'Save').catch(() => false);
    if (!ready) {
      // The nudge the owner did by hand: type a space and take it back out.
      const f = field('firstName');
      f.focus(); document.execCommand('insertText', false, ' '); document.execCommand('delete'); f.blur();
      ready = await waitFor(enabled, 3000, 'Save').catch(() => false);
    }
    if (ready) {
      safeClick(saveBtn, 'the address Save button');
    } else {
      banner(['✓ The drop-ship address is filled in.', '<b>Your turn:</b> HOKA has not enabled <b>Save</b>. Click into any address field, type a space and delete it, then press <b>Save</b>. The draft carries on with the PO after that.'], 'bad');
    }
    const mb = await waitFor(prompt, ready ? 8000 : 5 * 60 * 1000, 'the drop ship address to be saved');
    // Recorded BEFORE confirming: HOKA may reload the page on save, and the
    // reloaded cart must go on to the PO, not fill the address again.
    if (onSaving) await onSaving();
    safeClick([...mb.querySelectorAll('button')].find((b) => /confirm/i.test(b.innerText)), 'Confirm on the drop ship question');
    await waitFor(() => !visible(mb), 8000, 'the address to save');
  }

  async function delivery() {
    const r = await waitFor(() => [...document.querySelectorAll('.el-radio')].find((x) => visible(x) && /as soon as possible/i.test(x.innerText)), 10000, 'the delivery choices');
    if (!r.classList.contains('is-checked')) safeClick(r, 'As soon as possible');
  }

  async function po(value) {
    // The PO only takes once the address is saved (owner, 2026-11-09), and it
    // is typed like the address, not set.
    const inp = await waitFor(() => { const i = document.querySelector('input[name="form.PurchaseOrderOfAsap"]'); return visible(i) && !i.disabled && !i.readOnly ? i : null; }, 15000, 'the PO box');
    typeInto(inp, value);
    await sleep(300);
    if (inp.value !== value) throw new Error('The PO did not take; type ' + value + ' into Purchase Order # by hand');
  }

  // RESUMABLE. Agreeing to HOKA's B2B2C terms RELOADS the cart page (seen on
  // a real run 2026-11-09), which killed the run mid address. So the job is
  // saved after every step (job.step, job.done) and a reloaded cart carries
  // on from the next step. One tab owns a job at a time: the owner writes a
  // heartbeat, and another page only takes over once that goes quiet.
  const ME = Math.random().toString(36).slice(2);
  const save = (job) => chrome.storage.local.set({ rhPrepJob: job });
  async function run(job) {
    job.done = job.done || [];
    const show = (now, tone) => banner(job.done.map((d) => '✓ ' + esc(d)).concat(now ? [now] : []), tone);
    const beat = setInterval(() => { job.beat = Date.now(); save(job); }, 2000);
    try {
      show(job.step && job.step !== 'start' ? 'Carrying on after the page reloaded...' : 'Waiting for the cart to load...');
      await waitFor(() => /ORDER SETTING/i.test(pageText()) && (cartEmpty() || cartCounts()), 30000, 'the cart to load');
      if ((!job.step || job.step === 'start') && !cartEmpty()) {
        // Items already in the cart. Often they ARE this order's, left by an
        // earlier run that stopped after the upload (owner, 2026-11-09), so
        // that is recognised: the same style-colour codes, product count and
        // pair count. Anything else is shown to a person, who carries on or
        // stops; the prep never mixes two orders on its own.
        const c = cartCounts();
        const styles = [...new Set(job.lines.map((l) => styleOf(l.sku)).filter(Boolean))];
        const want = job.lines.reduce((a, l) => a + l.qty, 0);
        const ours = c && styles.length && c.units === want && c.products === styles.length && styles.every((s) => pageText().includes(s));
        if (ours) {
          job.done.push('Items: already in the cart from the last run (' + want + ' pair' + (want === 1 ? '' : 's') + ')');
          job.step = 'items'; await save(job);
        } else {
          const go = await ask(['The HOKA cart already has <b>' + (c ? c.products + ' product' + (c.products === 1 ? '' : 's') + ', ' + c.units + ' pair' + (c.units === 1 ? '' : 's') : 'items') + '</b>.',
            'If those are <b>' + esc(job.po) + '</b>\'s shoes, carry on and the draft fills the address and PO. If they belong to another order, close this and save or clear that cart first.'], 'Carry on with what is in the cart');
          if (!go) { clearInterval(beat); await chrome.storage.local.remove('rhPrepJob'); banner(['Stopped. Nothing was changed for ' + esc(job.po) + '.'], 'bad'); return; }
          job.done.push('Items: kept what was in the cart (checked by a person)');
          job.step = 'items'; await save(job);
        }
      }
      if (!job.step || job.step === 'start') {
        show('Adding ' + job.lines.length + ' item' + (job.lines.length === 1 ? '' : 's') + ' by UPC...');
        const u = await upload(job);
        job.short = u.got < u.want ? { got: u.got, want: u.want } : null;
        job.done.push('Items: ' + u.got + ' of ' + u.want + ' pair' + (u.want === 1 ? '' : 's') + ' in the cart');
        job.step = 'items'; await save(job);
      }
      if (job.step === 'saving') {
        // The page reloaded while the address was being saved: it is saved.
        job.done.push('Drop-ship address: ' + job.address.firstName + ' ' + job.address.lastName + ', ' + job.address.city + ' ' + job.address.state);
        job.step = 'address'; await save(job);
      }
      if (job.step === 'items') {
        if (job.address) {
          show('Filling the drop-ship address...');
          await address(job.address, async () => { job.step = 'saving'; await save(job); });
          job.done.push('Drop-ship address: ' + job.address.firstName + ' ' + job.address.lastName + ', ' + job.address.city + ' ' + job.address.state);
        } else {
          job.done.push(job.international ? 'International order: no drop-ship address, so HOKA ships to the store' : 'No address on the order: drop-ship address left off');
        }
        job.step = 'address'; await save(job);
      }
      if (job.step === 'address') {
        show('Setting delivery and PO...');
        await delivery();
        job.done.push('Delivery: as soon as possible');
        await po(job.po);
        job.done.push('PO ' + job.po);
      }
      clearInterval(beat); await chrome.storage.local.remove('rhPrepJob');
      const short = job.short;
      banner(job.done.map((d) => '✓ ' + esc(d)).concat([
        short ? '<b style="color:#f2c14e">Only ' + short.got + ' of ' + short.want + ' pairs went in: HOKA did not recognise a UPC. Add the rest by hand.</b>' : '',
        '<b>Ready for you.</b> Check the items, sizes, stock per size and address, then press <b>Submit Order</b> yourself. Nothing has been submitted.',
      ].filter(Boolean)), short ? 'bad' : 'ok');
    } catch (e) {
      clearInterval(beat); await chrome.storage.local.remove('rhPrepJob');
      banner(job.done.map((d) => '✓ ' + esc(d)).concat(['<b>Stopped:</b> ' + esc(e.message) + '. Nothing was submitted; finish this one by hand.']), 'bad');
    }
  }

  // ---------- the job hand-off ----------
  // Found on the first real runs, 2026-11-09: HOKA can send a fresh tab to
  // its portal home (#/home) instead of the cart, and a reload or redirect
  // mid run wiped the banner. So: off the cart, a pending job sends the tab
  // to the cart; on the cart, the job is only TAKEN once the cart has loaded
  // (a redirect before that leaves it pending); and every banner is saved, so
  // a reloaded cart shows how far the last run got.
  const CART = 'https://hokaus.deckersb2b.deckers.com/order-center/#/orderCenter/shoppingCar';
  const onCart = () => location.pathname.startsWith('/order-center') && /shoppingCar/i.test(location.hash);
  let running = false;
  async function check() {
    if (running) return;
    const got = await chrome.storage.local.get(['rhPrepJob', 'rhPrepLast']);
    let job = got.rhPrepJob;
    // A job another page was running whose heartbeat has gone quiet (that
    // page reloaded, e.g. after the terms) is picked up again here.
    if (job && job.state === 'running' && job.supplier === 'hoka' && Date.now() - (job.beat || 0) > 20000 && Date.now() - job.at < MAX_AGE && onCart()) {
      running = true;
      job.owner = ME; job.beat = Date.now(); await save(job);
      await run(job);
      running = false;
      return;
    }
    // Running elsewhere with a fresh heartbeat: right after a reload the dead
    // page's last beat is still recent, so look again once it has gone quiet.
    if (job && job.state === 'running' && job.supplier === 'hoka' && onCart() && Date.now() - job.at < MAX_AGE) {
      setTimeout(check, 21000);
      return;
    }
    const pending = job && job.state === 'pending' && job.supplier === 'hoka';
    if (pending && Date.now() - job.at > MAX_AGE) {
      await chrome.storage.local.remove('rhPrepJob');
      if (onCart()) banner(['A draft request from more than 15 minutes ago was ignored. Press Draft in HOKA again.'], 'bad');
      return;
    }
    if (pending && !onCart()) { location.href = CART; return; }
    if (!onCart()) return;
    if (!pending) {
      // No job: show the last run's outcome once, if it is recent.
      const last = got.rhPrepLast;
      if (last && Date.now() - last.at < 30 * 60 * 1000 && !last.shown) {
        banner(['<i>Last draft, ' + new Date(last.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ':</i>'].concat(last.lines), last.tone);
        await chrome.storage.local.set({ rhPrepLast: { ...last, shown: true } });
      }
      return;
    }
    running = true;
    try {
      await waitFor(() => /ORDER SETTING/i.test(pageText()) && (cartEmpty() || cartCounts()), 30000, 'the cart to load');
    } catch (e) { running = false; return; } // still pending; a later load picks it up
    // Taken once the cart is really here: marked running and owned by this
    // page, so a second tab never starts it too.
    job = { ...job, state: 'running', owner: ME, beat: Date.now(), step: 'start', done: [] };
    await save(job);
    await run(job);
    running = false;
  }
  window.addEventListener('hashchange', check);
  check();
})();
