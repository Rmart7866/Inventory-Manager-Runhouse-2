// brooks.js, The Run House order prep, on Brooks FastTrack
// (fasttrack.brooksrunning.com). Fixed steps, no judgement, the path staff use
// for a dropship order (owner, 2026-11-09): items under ship-to 1005 Needham,
// the customer's address in the basket's Drop ship form, the PO on the
// basket's delivery line.
//
//   1. the basket must be EMPTY, so two orders never mix;
//   2. per colourway: search "<style>-<colour>" (an exact Style ID opens its
//      size grid by itself), pick the 1005 Needham tab, type each pair into
//      its colour / width / size box, press "Add N items";
//   3. basket: Drop ship, fill the recipient, then WAIT for a person to tick
//      the resale certificate box (a legal statement, never ticked by this),
//      then Apply;
//   4. the PO into each delivery line's reference (20 characters at most);
//   5. STOP. "Step 1/2: Validate availability" and "Step 2/2: Place basket"
//      are a person's; Place basket places the order (owner, 2026-11-09).
//
// What the live pages showed, 2026-11-09: ship-to tabs are epc-delivery-shop
// ("1005: The Run House, 943 Great Plain Ave., Needham"), the active one's
// parent carries .active, and 1001 Walpole is selected by default; grid rows
// are .grid-row.product-grid starting with the colour code ("187 White/..."),
// widths .y-size with one .grid-row.cells each, size columns
// [data-e2e=xSize] ("14.0"), boxes [data-e2e=grid-cell] input.size-quantity
// whose max is the stock; the Drop ship form is #recipientName,
// #recipientAddress, #recipientSecondaryAddress, #recipientEmail, #zip, #city,
// #recipientPhone, select#countryState (values AL, MA, ...), the box
// #confirm-text and button[data-e2e=apply-btn]; the PO is
// epc-client-reference-number-popup (shown once the 1005 line is expanded),
// which opens input[placeholder="Custom order reference"] (maxlength 20) and
// saves on Enter, verified to survive a reload.
//
// The drop ship email is needham@therunhouse.com, not the customer's: the
// tracking updater reads Brooks' shipping mail in that mailbox, and Shopify
// sends the customer their own shipping email. The phone is the store's, as
// the older Desktop filler did.
//
// House style: no em dashes. Use commas, periods, or the word "to".
(function () {
  const P = window.RHPrep;
  const { sleep, visible, waitFor, safeClick, typeInto, setVal, esc, banner, brooksLine } = P;
  const MAX_AGE = 15 * 60 * 1000;
  const ORIGIN = 'https://fasttrack.brooksrunning.com';
  const SHIP_TO = /^\s*1005\s*:/;
  const EMAIL = 'needham@therunhouse.com';
  const PHONE = '(781) 400-1327';
  const ME = Math.random().toString(36).slice(2);
  const save = (job) => chrome.storage.local.set({ rhPrepJob: job });
  const onBasket = () => /^\/basket/.test(location.pathname);
  const searchUrl = (key) => ORIGIN + '/browse/search?q=' + encodeURIComponent(key) + '&f=&start=0&num=25&preset=now&sortField=Default&sortDirection=Desc&collapse=false';
  // The header's basket button reads "My Basket" when empty, "1 (USD 65.45)" when not.
  const basketCount = () => { const b = document.querySelector('epc-basket-button'); const m = b && /^\s*(\d+)\s*\(/.exec(b.innerText || ''); return m ? +m[1] : 0; };

  // ---------- steps ----------
  const groupsOf = (job) => P.brooksGroups(job.lines);

  async function pickNeedham() {
    const tab = await waitFor(() => [...document.querySelectorAll('epc-delivery-shop')].find((t) => SHIP_TO.test(t.innerText || '')), 20000, 'the 1005 Needham ship-to tab');
    const active = () => /\bactive\b/.test(String(tab.parentElement && tab.parentElement.className)) || (tab.parentElement && tab.parentElement.getAttribute('aria-selected') === 'true');
    if (!active()) safeClick(tab, 'the 1005 Needham tab');
    await waitFor(active, 8000, 'the 1005 Needham tab to be selected');
    await sleep(800);
  }

  function boxFor(p) {
    const sizes = [...document.querySelectorAll('[data-e2e="xSize"]')].map((e) => (e.innerText || '').trim());
    const col = sizes.indexOf(p.size);
    if (col < 0) return null;
    const row = [...document.querySelectorAll('.grid-row.product-grid')].find((r) => new RegExp('^\\s*' + p.colour + '\\b').test(r.innerText || ''));
    if (!row) return null;
    const widths = [...row.querySelectorAll('.y-size')].map((e) => (e.innerText || '').trim().toUpperCase());
    const w = widths.indexOf(p.width);
    if (w < 0) return null;
    const grid = row.querySelectorAll('.grid-row.cells')[w] || (widths.length === 1 ? row : null);
    const cell = grid && grid.querySelectorAll('[data-e2e="grid-cell"]')[col];
    return (cell && cell.querySelector('input')) || null;
  }

  async function addColourway(g) {
    await waitFor(() => document.querySelector('.grid-row.product-grid') && document.querySelectorAll('[data-e2e="xSize"]').length, 25000, 'the ' + g.key + ' size grid');
    await pickNeedham();
    await waitFor(() => document.querySelector('.grid-row.product-grid'), 15000, 'the Needham size grid');
    const missing = [], typed = [];
    for (const p of g.pairs) {
      const el = boxFor(p);
      const stock = el ? +(el.getAttribute('max') || 0) : 0;
      if (!el || stock < p.qty) { missing.push(g.style + '-' + p.colour + ' ' + p.width + ' size ' + p.size + (el ? ' (Brooks has ' + stock + ')' : ' (no box: out of stock or not sold in this width)')); continue; }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      typeInto(el, String(p.qty));
      await sleep(300);
      typed.push(p);
    }
    if (!typed.length) return { missing, added: 0 };
    const before = basketCount();
    const add = await waitFor(() => [...document.querySelectorAll('button')].find((b) => visible(b) && /^(Add|Update) \d+ items?$/i.test(b.innerText.trim()) && !b.disabled), 8000, 'the Add items button');
    safeClick(add, 'Add items');
    const want = typed.reduce((a, p) => a + p.qty, 0);
    await waitFor(() => basketCount() >= before + want, 15000, 'the pairs to reach the basket');
    return { missing, added: want };
  }

  async function dropShip(a) {
    safeClick(await waitFor(() => [...document.querySelectorAll('button, a')].find((b) => visible(b) && /^drop ship$/i.test(b.innerText.trim())), 15000, 'the Drop ship button'), 'Drop ship');
    const name = await waitFor(() => { const e = document.getElementById('recipientName'); return visible(e) ? e : null; }, 8000, 'the Drop ship form');
    // The form finishes loading a moment AFTER it opens (the state list fills
    // in, then the form resets), wiping anything typed before that: a live run
    // typed every field, then found them all empty and no "FL" in a list that
    // holds it (2026-11-09). So wait for the list, settle, fill, and read every
    // field back after a pause.
    const code = String(a.state || '').toUpperCase();
    const st = await waitFor(() => { const e = document.getElementById('countryState'); return e && [...e.options].some((o) => o.value === code) ? e : null; }, 10000, 'the state ' + code + ' in Brooks\' list').catch(() => null);
    if (!st) throw new Error('Brooks has no state "' + a.state + '" in its list');
    await sleep(1000);
    const want = {
      recipientName: [a.firstName, a.lastName].filter(Boolean).join(' '),
      recipientAddress: a.street1 || '', recipientSecondaryAddress: a.street2 || '',
      recipientEmail: EMAIL, zip: a.zip || '', city: a.city || '', recipientPhone: PHONE,
    };
    const fill = () => {
      for (const [id, v] of Object.entries(want)) { const e = document.getElementById(id); if (e && e.value !== v) typeInto(e, v); }
      const sel = document.getElementById('countryState');
      if (sel && sel.value !== code) setVal(sel, code);
    };
    const wrong = () => Object.entries(want).filter(([id, v]) => { const e = document.getElementById(id); return !e || e.value !== v; }).map(([id]) => id)
      .concat((document.getElementById('countryState') || {}).value === code ? [] : ['state']);
    for (let i = 0; i < 3; i++) { fill(); await sleep(1200); if (!wrong().length) break; }
    if (wrong().length) throw new Error('The Drop ship form would not keep ' + wrong().join(', ') + '; fill those by hand');
    // The resale certificate box is a statement made by The Run House. A person
    // ticks it; this only waits, then presses Apply once it is ticked.
    const ticked = () => { const b = document.getElementById('confirm-text'); return !!(b && b.checked); };
    banner(['Drop ship address filled for ' + esc(a.firstName + ' ' + a.lastName) + '.', '<b>Tick the resale certificate box</b> in the Drop ship form. Apply is pressed for you once it is ticked.'], '');
    await waitFor(() => ticked() || !visible(document.getElementById('recipientName')), 10 * 60 * 1000, 'the resale certificate box to be ticked');
    if (!visible(document.getElementById('recipientName'))) throw new Error('The Drop ship form was closed before Apply');
    if (wrong().length) throw new Error('The Drop ship form lost ' + wrong().join(', ') + ' while waiting; fix those, then press Apply by hand');
    const apply = await waitFor(() => { const b = document.querySelector('button[data-e2e="apply-btn"]'); return b && !b.disabled ? b : null; }, 8000, 'Apply to light up (check the address fields)');
    safeClick(apply, 'Apply');
    await waitFor(() => !visible(document.getElementById('recipientName')), 10000, 'the Drop ship form to close');
    await sleep(1500);
  }

  async function setPO(po) {
    const value = po.slice(0, 20);
    let refs = [...document.querySelectorAll('epc-client-reference-number-popup')];
    if (!refs.length) {
      // The reference sits on the delivery line under 1005, shown once expanded.
      const line = [...document.querySelectorAll('epc-basket-line')].find((l) => SHIP_TO.test(l.innerText || ''));
      const chev = line && line.querySelector('fa-icon');
      if (chev) safeClick(chev, 'the 1005 line');
      refs = await waitFor(() => { const r = [...document.querySelectorAll('epc-client-reference-number-popup')]; return r.length ? r : null; }, 8000, 'the delivery line reference');
    }
    for (let i = 0; i < refs.length; i++) {
      const span = [...document.querySelectorAll('epc-client-reference-number-popup')][i].querySelector('span.text-muted') || [...document.querySelectorAll('epc-client-reference-number-popup')][i];
      safeClick(span, 'the order reference');
      const inp = await waitFor(() => { const e = document.querySelector('input[placeholder="Custom order reference"]'); return visible(e) ? e : null; }, 5000, 'the order reference box');
      inp.focus(); inp.select();
      if (!document.execCommand('insertText', false, value) || inp.value !== value) setVal(inp, value);
      for (const type of ['keydown', 'keypress', 'keyup']) inp.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      await sleep(1200);
    }
    const shown = [...document.querySelectorAll('epc-client-reference-number-popup')].map((e) => (e.innerText || '').trim());
    if (!shown.length || shown.some((t) => t !== value)) throw new Error('The PO did not take (' + shown.join(', ') + '); type ' + value + ' on the delivery line by hand');
    return value;
  }

  // ---------- the run, resumable by page ----------
  async function run(job) {
    job.done = job.done || [];
    const show = (now, tone) => banner(job.done.map((d) => '✓ ' + esc(d)).concat(now ? [now] : []), tone);
    const beat = setInterval(() => { job.beat = Date.now(); save(job); }, 2000);
    const finish = async () => { clearInterval(beat); await chrome.storage.local.remove('rhPrepJob'); };
    // Leaving the page: hand the job over so the next page takes it at once
    // instead of waiting for this page's heartbeat to go stale.
    const go = async (url) => { clearInterval(beat); job.owner = ''; job.beat = 0; await save(job); location.href = url; };
    try {
      if (job.step === 'start') {
        await waitFor(() => document.querySelector('epc-basket-button'), 20000, 'FastTrack to load');
        await sleep(1500);
        const n = basketCount();
        if (n) throw new Error('The Brooks basket already holds ' + n + ' item(s). Place or clear that basket first (a stopped prep leaves its pairs there too), then press Prep again');
        job.groups = groupsOf(job); job.gi = 0; job.missing = []; job.added = 0;
        job.step = 'items';
        await go(searchUrl(job.groups[0].key));
        return;
      }
      if (job.step === 'items') {
        const g = job.groups[job.gi];
        show('Adding ' + esc(g.title || g.key) + ' under 1005 Needham...');
        const r = await addColourway(g);
        job.missing = job.missing.concat(r.missing); job.added += r.added;
        if (r.added) job.done.push(g.style + '-' + [...new Set(g.pairs.map((p) => p.colour))].join('/') + ': ' + r.added + ' pair' + (r.added > 1 ? 's' : '') + ' under 1005 Needham');
        job.gi++;
        if (job.gi < job.groups.length) { await go(searchUrl(job.groups[job.gi].key)); return; }
        if (!job.added) throw new Error('Nothing could be added: ' + job.missing.join('; '));
        job.step = 'basket';
        await go(ORIGIN + '/basket');
        return;
      }
      if (job.step === 'basket' && onBasket()) {
        await waitFor(() => document.querySelector('epc-basket-line'), 20000, 'the basket');
        if (job.address) {
          show('Filling the Drop ship address...');
          await dropShip(job.address);
          job.done.push('Drop ship to ' + job.address.firstName + ' ' + job.address.lastName + ', ' + job.address.city + ' ' + job.address.state + ' (email ' + EMAIL + ')');
        } else {
          job.done.push(job.international ? 'International order: no drop ship, Brooks ships to the store' : 'No address on the order: no drop ship, Brooks ships to the store');
        }
        job.step = 'po'; await save(job);
      }
      if (job.step === 'po' && onBasket()) {
        show('Typing the PO...');
        const po = await setPO(job.po);
        job.done.push('Order reference ' + po + (po.length < job.po.length ? ' (cut to 20 characters)' : ''));
        await finish();
        banner(job.done.map((d) => '✓ ' + esc(d)).concat([
          job.missing.length ? '<b style="color:#f2c14e">Not added: ' + esc(job.missing.join('; ')) + '. Add by hand or tell the customer.</b>' : '',
          '<b>Ready for you.</b> Check the shoes, sizes, address and reference, then press <b>Step 1/2: Validate availability</b> and <b>Step 2/2: Place basket</b> yourself. Nothing has been placed.',
        ].filter(Boolean)), job.missing.length ? 'bad' : 'ok');
        return;
      }
      clearInterval(beat);
    } catch (e) {
      await finish();
      banner(job.done.map((d) => '✓ ' + esc(d)).concat(['<b>Stopped:</b> ' + esc(e.message) + '. Nothing was placed; finish this one by hand.']), 'bad');
    }
  }

  let running = false;
  async function check() {
    if (running) return;
    const { rhPrepJob: job } = await chrome.storage.local.get('rhPrepJob');
    if (!job || job.supplier !== 'brooks') return;
    if (Date.now() - job.at > MAX_AGE) { await chrome.storage.local.remove('rhPrepJob'); banner(['A prep request from more than 15 minutes ago was ignored. Press Prep in Brooks again.'], 'bad'); return; }
    if (job.state === 'pending') {
      running = true;
      const j = { ...job, state: 'running', owner: ME, beat: Date.now(), step: 'start', done: [] };
      await save(j);
      await run(j);
      running = false;
      return;
    }
    if (job.state === 'running' && (job.owner === ME || !job.owner || Date.now() - (job.beat || 0) > 20000)) {
      running = true;
      job.owner = ME; job.beat = Date.now(); await save(job);
      await run(job);
      running = false;
    } else if (job.state === 'running') {
      // Right after a reload the dead page's last beat is still recent.
      setTimeout(check, 21000);
    }
  }
  // FastTrack changes page without reloading, so watch the address too.
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; check(); } }, 1000);
  check();
})();
