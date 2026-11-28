// asics.js, The Run House order prep, on the ASICS B2B (b2b.asics.com). Fixed
// steps, no judgement, built 2026-11-27 from the live site with the owner's OK
// (one test pair added to the empty basket and removed, nothing submitted):
//
//   1. the CURRENT basket must be EMPTY, so two orders never mix;
//   2. per colourway: ASICS' own stock call says what it can ship in the
//      earliest delivery window; each pair it can supply is added with the same
//      request the product page's "Add To Cart" sends; a pair it cannot supply
//      is listed for a person, never guessed;
//   3. checkout: the PO into "Customer PO" (24 characters at most);
//   4. "Change Address": the customer's one-time ship-to, then Save (an
//      international order keeps the store's address: the form's country is
//      fixed to US);
//   5. STOP. The three terms boxes and the submit button are a person's.
//
// What the live site showed, 2026-11-27:
//   GET  /aac/baskets/current             { no, lines[], shipTo, customerReference }
//   GET  /aac/products/<style>/availability?basketNo=<no>&colorCodeDistributorNo=<colour>:
//        availability[0].date is the earliest delivery date, availability[0].stock[colour]
//        lists sizes { sizeKey, quantityAvailable }, seasons[colour].season is "AW2026"
//   PATCH /aac/baskets/<no>/lines         { lines: [{ date, sizeKey, quantity, itemNo,
//        colorCode, season, partnerNo: null }] }, quantity 0 removes. It answers 419
//        without the X-XSRF-TOKEN header, copied from the XSRF-TOKEN cookie, which is
//        what the page's own requests send.
//   checkout /orders/<no>/checkout: input#purchase-order-number-1 (maxlength 24);
//        "Change Address" opens #name, #phone, #address1, #address2, #city,
//        #postcode, #main-division (a search list, role=combobox), Save / Cancel;
//        #email is read only (the account's) and #country is read only "US".
//
// The phone is the store's, as Brooks: the customer's number is not ASICS' business.
//
// House style: no em dashes. Use commas, periods, or the word "to".
(function () {
  const P = window.RHPrep;
  const { sleep, visible, waitFor, safeClick, typeInto, esc, banner } = P;
  const MAX_AGE = 15 * 60 * 1000;
  const ORIGIN = 'https://b2b.asics.com';
  const PHONE = '(781) 400-1327';
  const PO_MAX = 24;
  const ME = Math.random().toString(36).slice(2);
  const save = (job) => chrome.storage.local.set({ rhPrepJob: job });
  const onCheckout = () => /^\/orders\/\d+\/checkout/.test(location.pathname);

  // ---------- ASICS' own data calls, as the page makes them ----------
  const xsrf = () => decodeURIComponent((document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/) || [])[1] || '');
  async function getJSON(path) {
    const r = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } });
    if (r.status === 401 || r.status === 419) throw new Error('ASICS says you are logged out (' + r.status + '). Log in to the ASICS B2B in this Chrome, then press Draft again');
    if (!r.ok) throw new Error('ASICS answered ' + r.status + ' for ' + path.split('?')[0]);
    return r.json();
  }
  const basket = () => getJSON('/aac/baskets/current');
  async function patchLines(no, lines) {
    const r = await fetch('/aac/baskets/' + no + '/lines', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf() },
      body: JSON.stringify({ lines }),
    });
    if (!r.ok) throw new Error('ASICS refused the items (' + r.status + ')' + (r.status === 419 ? ': the page is stale, reload it and press Draft again' : ''));
  }

  // ---------- steps ----------
  async function addColourway(no, g) {
    const av = await getJSON('/aac/products/' + g.style + '/availability?basketNo=' + no + '&colorCodeDistributorNo=' + g.colour + ':');
    const win = (av.availability || [])[0];
    const sizes = (win && win.stock && win.stock[g.colour]) || [];
    const season = av.seasons && av.seasons[g.colour] && av.seasons[g.colour].season;
    const missing = [], lines = [], added = [];
    if (!win || !win.date || !season) {
      g.pairs.forEach((p) => missing.push(g.key + ' size ' + p.size + ' (ASICS has no at once window for this colour)'));
      return { missing, added };
    }
    for (const p of g.pairs) {
      const s = sizes.find((x) => String(x.sizeKey).toUpperCase() === p.sizeKey);
      const have = s ? Number(s.quantityAvailable) || 0 : 0;
      if (!s || have < p.qty) { missing.push(g.key + ' size ' + p.size + (s ? ' (ASICS has ' + have + ')' : ' (not sold in this size)')); continue; }
      lines.push({ date: win.date, sizeKey: s.sizeKey, quantity: p.qty, itemNo: g.style, colorCode: g.colour, season, partnerNo: null });
      added.push(p);
    }
    if (lines.length) await patchLines(no, lines);
    return { missing, added };
  }

  async function setPO(po) {
    const value = po.slice(0, PO_MAX);
    const box = await waitFor(() => { const e = document.getElementById('purchase-order-number-1'); return visible(e) ? e : null; }, 20000, 'the Customer PO box');
    typeInto(box, value);
    await sleep(1500);
    if (box.value !== value) throw new Error('The Customer PO box would not keep ' + value + '; type it by hand');
    return value;
  }

  async function pickState(code) {
    const combo = await waitFor(() => { const e = document.getElementById('main-division'); return visible(e) ? e : null; }, 8000, 'the Sales District box');
    const name = P.US_STATES[String(code || '').toUpperCase()];
    if (!name) throw new Error('No US state for "' + code + '"');
    const options = () => [...document.querySelectorAll('#main-division-multiselect-options li, [id^="main-division-multiselect-option"], #main-division-dropdown li')].filter(visible);
    for (const query of [name, String(code).toUpperCase()]) {
      combo.focus();
      typeInto(combo, query);
      combo.focus();
      combo.dispatchEvent(new Event('focus', { bubbles: true }));
      await sleep(1200);
      const hits = options().filter((o) => P.stateMatches(o.innerText, code));
      if (hits.length === 1) { safeClick(hits[0], 'the state ' + name); await sleep(800); return; }
    }
    throw new Error('Could not pick ' + name + ' in Sales District; pick it by hand, then press Save');
  }

  async function shipTo(a) {
    safeClick(await waitFor(() => [...document.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === 'Change Address'), 20000, 'Change Address'), 'Change Address');
    await waitFor(() => visible(document.getElementById('address1')), 8000, 'the ship-to form');
    await sleep(800);
    const want = {
      name: [a.firstName, a.lastName].filter(Boolean).join(' '),
      phone: PHONE, address1: a.street1 || '', address2: a.street2 || '', city: a.city || '', postcode: a.zip || '',
    };
    const fill = () => { for (const [id, v] of Object.entries(want)) { const e = document.getElementById(id); if (e && e.value !== v) typeInto(e, v); } };
    const wrong = () => Object.entries(want).filter(([id, v]) => { const e = document.getElementById(id); return !e || e.value !== v; }).map(([id]) => id);
    for (let i = 0; i < 3; i++) { fill(); await sleep(1000); if (!wrong().length) break; }
    if (wrong().length) throw new Error('The ship-to form would not keep ' + wrong().join(', ') + '; fill those by hand and press Save');
    await pickState(a.state);
    if (wrong().length) throw new Error('The ship-to form lost ' + wrong().join(', ') + '; fix those and press Save by hand');
    const saveBtn = await waitFor(() => [...document.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === 'Save' && !b.disabled), 8000, 'Save to light up (check the address fields)');
    safeClick(saveBtn, 'Save');
    await waitFor(() => !visible(document.getElementById('address1')), 10000, 'the ship-to form to close');
    // Read it back from ASICS itself, not the page.
    await sleep(1500);
    const b = await basket();
    const st = b.shipTo || {};
    const got = [st.name, st.address1, st.city, st.postCode].join(' | ');
    if (!(String(st.address1 || '').trim().toLowerCase() === want.address1.trim().toLowerCase() && String(st.postCode || '').startsWith(want.postcode.slice(0, 5))))
      throw new Error('ASICS did not keep the ship-to (it shows ' + got + '); set it by hand');
    return got;
  }

  // ---------- the run, resumable by page ----------
  async function run(job) {
    job.done = job.done || [];
    const show = (now, tone) => banner(job.done.map((d) => '✓ ' + esc(d)).concat(now ? [now] : []), tone);
    const beat = setInterval(() => { job.beat = Date.now(); save(job); }, 2000);
    const finish = async () => { clearInterval(beat); await chrome.storage.local.remove('rhPrepJob'); };
    const go = async (url) => { clearInterval(beat); job.owner = ''; job.beat = 0; await save(job); location.href = url; };
    try {
      if (job.step === 'start') {
        await sleep(1500);
        const b = await basket();
        if ((b.lines || []).length) throw new Error('The current ASICS basket (#' + b.no + ') already holds ' + b.lines.length + ' line(s). Submit or empty that basket first (a stopped draft leaves its pairs there too), then press Draft again');
        job.no = b.no; job.groups = P.asicsGroups(job.lines); job.missing = []; job.added = 0;
        for (const g of job.groups) {
          show('Adding ' + esc(g.title || g.key) + '...');
          const r = await addColourway(job.no, g);
          job.missing = job.missing.concat(r.missing);
          const n = r.added.reduce((t, p) => t + p.qty, 0);
          job.added += n;
          if (n) job.done.push(g.key + ': ' + r.added.map((p) => 'size ' + p.size + (p.qty > 1 ? ' x' + p.qty : '')).join(', '));
        }
        if (!job.added) throw new Error('Nothing could be added: ' + job.missing.join('; '));
        // Check it landed, from ASICS itself.
        const after = await basket();
        const units = (after.lines || []).reduce((t, l) => t + (Number(l.quantity) || 0), 0);
        if (units !== job.added) throw new Error('ASICS shows ' + units + ' pair(s) in the basket, expected ' + job.added);
        job.step = 'checkout';
        await go(ORIGIN + '/orders/' + job.no + '/checkout');
        return;
      }
      if (job.step === 'checkout' && onCheckout()) {
        show('Typing the PO...');
        const po = await setPO(job.po);
        job.done.push('Customer PO ' + po + (po.length < job.po.length ? ' (cut to ' + PO_MAX + ' characters)' : ''));
        if (job.address && !job.international) {
          show('Filling the ship-to address...');
          const got = await shipTo(job.address);
          job.done.push('Ship to ' + got);
        } else {
          job.done.push(job.international ? 'International order: ASICS ships to the store address shown' : 'No address on the order: ASICS ships to the store address shown');
        }
        // The PO box is typed, not saved by ASICS until checkout: check it is still there.
        const po2 = document.getElementById('purchase-order-number-1');
        if (po2 && po2.value !== po) { typeInto(po2, po); await sleep(800); }
        await finish();
        banner(job.done.map((d) => '✓ ' + esc(d)).concat([
          job.missing.length ? '<b style="color:#f2c14e">Not added: ' + esc(job.missing.join('; ')) + '. Add by hand or tell the customer.</b>' : '',
          '<b>Ready for you.</b> Check the shoes, sizes, ship-to and Customer PO, tick the three terms boxes, then submit it yourself. Nothing has been submitted.',
        ].filter(Boolean)), job.missing.length ? 'bad' : 'ok');
        return;
      }
      clearInterval(beat);
    } catch (e) {
      await finish();
      banner(job.done.map((d) => '✓ ' + esc(d)).concat(['<b>Stopped:</b> ' + esc(e.message) + '. Nothing was submitted; finish this one by hand.']), 'bad');
    }
  }

  let running = false;
  async function check() {
    if (running) return;
    const { rhPrepJob: job } = await chrome.storage.local.get('rhPrepJob');
    if (!job || job.supplier !== 'asics') return;
    if (Date.now() - job.at > MAX_AGE) { await chrome.storage.local.remove('rhPrepJob'); banner(['A draft request from more than 15 minutes ago was ignored. Press Draft in ASICS again.'], 'bad'); return; }
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
      setTimeout(check, 21000);
    }
  }
  // The ASICS site changes page without reloading, so watch the address too.
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; check(); } }, 1000);
  check();
})();
