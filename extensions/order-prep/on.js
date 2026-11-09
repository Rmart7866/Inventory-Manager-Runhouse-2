// on.js, The Run House order prep, on ON's Backstage (backstage.on-running.com).
// Fixed steps, no judgement, the path staff use for a dropship order (owner,
// 2026-11-09): Start a re-order, then a One time address at checkout.
//
//   1. product selection: tick each model on the order (card "Cloud 6 WP");
//   2. Continue to the quantity matrix, type each pair into its box (found by
//      the barcode in the box id, "product-<EAN>", or by the article code row
//      and the "size N quantity" label when our barcode is not ON's EAN);
//   3. Continue, and Continue on "some items have no quantities" (it only
//      drops the empty colours);
//   4. checkout: type the PO into PO Name (20 characters at most), choose One
//      time address and fill it, Save the address;
//   5. STOP. Submit order is a person's.
//
// What the live pages showed, 2026-11-09: quantity boxes are
// input#product-<EAN13> labelled "Midnight | White size 8 quantity"; a size
// out of stock has no box; Continue on the matrix CREATES a draft in My
// orders; the PO input is #order-summary-title-input behind the "Edit order
// name" button; the one time address form has labels Address name, Street
// address, City, State (a picker), Zip, Country.
//
// An international order arrives with no address and keeps the account's
// Default address, so ON ships to the store.
//
// House style: no em dashes. Use commas, periods, or the word "to".
(function () {
  const P = window.RHPrep;
  const { sleep, visible, waitFor, safeClick, typeInto, esc, byLabel, banner } = P;
  const MAX_AGE = 15 * 60 * 1000;
  const START = 'https://backstage.on-running.com/orders/create/re-order/product-selection';
  const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
  const ME = Math.random().toString(36).slice(2);
  const save = (job) => chrome.storage.local.set({ rhPrepJob: job });
  const text = () => document.body.innerText || '';
  const where = () => /re-order\/product-selection/.test(location.pathname) ? 'select' : /re-order\/matrix/.test(location.pathname) ? 'matrix' : /\/edit\/draft\/submit/.test(location.pathname) ? 'checkout' : 'other';

  const modelOf = P.onModel, articleOf = P.onArticle, sizeOf = P.onSize;

  // ---------- steps ----------
  async function selectModels(job) {
    await waitFor(() => document.querySelectorAll('img').length > 5, 20000, 'the products to load');
    const models = [...new Set(job.lines.map((l) => modelOf(l.title)).filter(Boolean))];
    const selected = () => +((/(\d+)\s*models?\s*selected/i.exec(text()) || [])[1] || 0);
    // SEARCH, not scroll. The list lives in its own scrolling panel and loads
    // as it scrolls, so a model further down is simply not there yet (a real
    // run stopped on "Cloudswift 4", 2026-11-09). "Search for a product" opens
    // a results panel ("1 Result"); ticking a card there selects the model,
    // and Escape closes the panel. Scrolling the PANEL is the fallback.
    for (const m of models) {
      const before = selected();
      let card = null;
      try {
        const open = [...document.querySelectorAll('button')].find((b) => visible(b) && /search for a product/i.test(b.getAttribute('aria-label') || ''));
        let inp = [...document.querySelectorAll('input')].find((i) => visible(i) && /search for a product/i.test(i.placeholder || ''));
        if (!inp && open) { safeClick(open, 'Search for a product'); inp = await waitFor(() => [...document.querySelectorAll('input')].find((i) => visible(i) && /search for a product/i.test(i.placeholder || '')), 5000, 'the search box'); }
        if (inp) {
          typeInto(inp, m);
          inp.focus();
          card = await waitFor(() => {
            let e = inp; for (let k = 0; k < 8 && e; k++) { e = e.parentElement; if (e && /\d+\s*Results?/i.test(e.innerText || '')) break; }
            return e && [...e.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === m);
          }, 8000, m + ' in the search results');
        }
      } catch (e) { card = null; }
      if (!card) {
        const panel = [...document.querySelectorAll('section, div')].find((e) => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 50; });
        for (let i = 0; i < 30 && !card; i++) {
          card = [...document.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === m);
          if (!card && panel) { panel.scrollBy(0, 1000); await sleep(600); }
        }
      }
      if (!card) throw new Error('Could not find the "' + m + '" model in the re-order list; it may not be orderable this season');
      safeClick(card, 'the ' + m + ' card');
      await waitFor(() => selected() > before, 4000, m + ' to show as selected');
      const inp = [...document.querySelectorAll('input')].find((i) => visible(i) && /search for a product/i.test(i.placeholder || ''));
      if (inp) { inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); await sleep(500); }
    }
    const n = await waitFor(() => selected() >= models.length ? selected() : null, 5000, models.length + ' models to show as selected');
    safeClick([...document.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === 'Continue'), 'Continue');
    return { models, n };
  }

  function boxFor(line) {
    if (/^\d{13}$/.test(line.upc)) {
      const el = document.getElementById('product-' + line.upc);
      if (el) return el;
    }
    const art = articleOf(line.sku), size = sizeOf(line);
    if (!art || !size) return null;
    const holder = [...document.querySelectorAll('div, tr, section')].find((e) => e.childElementCount < 400 && (e.innerText || '').includes(art) && e.querySelector('input[type=number]') && !(e.innerText || '').includes('Collapse all'));
    if (!holder) return null;
    const re = new RegExp('size ' + size.replace('.', '\\.') + ' quantity$', 'i');
    return [...holder.querySelectorAll('input[type=number]')].find((i) => { const l = document.querySelector('label[for="' + i.id + '"]'); return l && re.test(l.innerText.trim()); }) || null;
  }

  async function fillMatrix(job) {
    await waitFor(() => document.querySelectorAll('input[type=number]').length > 0, 25000, 'the quantity grid to load');
    await sleep(800);
    const missing = [];
    for (const l of job.lines) {
      const el = boxFor(l);
      if (!el) { missing.push(modelOf(l.title) + ' size ' + sizeOf(l) + ' (out of stock or not in this season)'); continue; }
      el.scrollIntoView({ block: 'center' });
      typeInto(el, String(l.qty));
      await sleep(250);
    }
    const want = job.lines.reduce((a, l) => a + l.qty, 0) - 0;
    await sleep(800);
    const got = (/(\d+)\s*units?\b/i.exec(text()) || [])[1];
    return { missing, want, got: got == null ? null : +got };
  }

  async function toCheckout() {
    safeClick([...document.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === 'Continue'), 'Continue');
    // "Some items don't have any quantities": it only drops the empty colours.
    const modal = await waitFor(() => [...document.querySelectorAll('[role=dialog], div')].find((d) => visible(d) && /don.t have any quantities/i.test(d.innerText) && d.querySelector('button')), 8000, 'the empty colours prompt').catch(() => null);
    if (modal) {
      const btns = [...document.querySelectorAll('button')].filter((b) => visible(b) && b.innerText.trim() === 'Continue');
      safeClick(btns[btns.length - 1], 'Continue on the empty colours prompt');
    }
    await waitFor(() => where() === 'checkout', 20000, 'the checkout page');
  }

  async function setPO(po) {
    const value = po.slice(0, 20);
    safeClick(await waitFor(() => [...document.querySelectorAll('button')].find((b) => visible(b) && /edit order name/i.test(b.getAttribute('aria-label') || '')), 15000, 'Edit order name'), 'Edit order name');
    const inp = await waitFor(() => { const i = document.getElementById('order-summary-title-input'); return visible(i) ? i : null; }, 5000, 'the PO Name box');
    typeInto(inp, value);
    inp.focus();
    for (const type of ['keydown', 'keypress', 'keyup']) inp.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    inp.blur();
    await sleep(800);
    if (!text().includes(value)) throw new Error('The PO did not take; type ' + value + ' into PO Name by hand');
    return value;
  }

  async function setAddress(a) {
    const radio = await waitFor(() => [...document.querySelectorAll('[role=radio], label, input[type=radio]')].find((r) => visible(r) && /One time address/i.test(r.innerText || r.getAttribute('aria-label') || (r.labels && r.labels[0] && r.labels[0].innerText) || '')), 10000, 'One time address');
    safeClick(radio, 'One time address');
    const street = await waitFor(() => byLabel(/^Street address/i), 8000, 'the one time address form');
    const form = street.closest('form') || street.closest('[role=dialog]') || street.parentElement.parentElement.parentElement;
    const set = (re, v) => { const el = byLabel(re, form) || byLabel(re); if (el && v != null) typeInto(el, v); return !!el; };
    set(/^Address name/i, [a.firstName, a.lastName].filter(Boolean).join(' '));
    set(/^Street address/i, [a.street1, a.street2].filter(Boolean).join(' '));
    set(/^City/i, a.city);
    set(/^Zip/i, a.zip);
    // State is a picker: open it and choose the state by name or code.
    const name = STATES[String(a.state || '').toUpperCase()] || a.state;
    const opener = [...form.querySelectorAll('button, [role=combobox]')].find((b) => visible(b) && /state/i.test((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || ''))) ||
      [...document.querySelectorAll('button, [role=combobox]')].find((b) => visible(b) && /select state/i.test(b.innerText || ''));
    if (!opener) throw new Error('Could not find the State picker');
    safeClick(opener, 'the State picker');
    const opt = await waitFor(() => [...document.querySelectorAll('[role=option], li, button')].find((o) => visible(o) && o !== opener && (o.innerText.trim() === name || o.innerText.trim() === a.state || o.innerText.trim().toLowerCase().startsWith(name.toLowerCase() + ' '))), 5000, 'the state ' + name);
    safeClick(opt, name);
    await sleep(400);
    const saveBtn = [...form.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === 'Save') ||
      [...document.querySelectorAll('button')].find((b) => visible(b) && b.innerText.trim() === 'Save');
    safeClick(saveBtn, 'the address Save button');
    await waitFor(() => !visible(street), 8000, 'the address to save');
  }

  // ---------- the run, resumable by page ----------
  async function run(job) {
    job.done = job.done || [];
    const show = (now, tone) => banner(job.done.map((d) => '✓ ' + esc(d)).concat(now ? [now] : []), tone);
    const beat = setInterval(() => { job.beat = Date.now(); save(job); }, 2000);
    const finish = async () => { clearInterval(beat); await chrome.storage.local.remove('rhPrepJob'); };
    try {
      if (job.step === 'start' && where() === 'select') {
        show('Selecting the models...');
        const s = await selectModels(job);
        job.done.push('Models: ' + s.models.join(', '));
        job.step = 'models'; await save(job);
        await waitFor(() => where() === 'matrix', 20000, 'the quantity grid');
      }
      if (job.step === 'models' && where() === 'matrix') {
        show('Typing the quantities...');
        const f = await fillMatrix(job);
        job.done.push('Pairs: ' + (f.got == null ? '?' : f.got) + ' of ' + f.want + ' entered');
        job.missing = f.missing;
        job.step = 'qty'; await save(job);
        show('Going to checkout...');
        await toCheckout();
        job.done.push('Draft order created on ON');
        job.step = 'checkout'; await save(job);
      }
      if (job.step === 'qty' && where() === 'checkout') {
        // The page reloaded between Continue and checkout: the draft exists.
        job.done.push('Draft order created on ON');
        job.step = 'checkout'; await save(job);
      }
      if (job.step === 'checkout' && where() === 'checkout') {
        show('Typing the PO...');
        const po = await setPO(job.po);
        job.done.push('PO Name ' + po + (po.length < job.po.length ? ' (cut to 20 characters)' : ''));
        job.step = 'po'; await save(job);
      }
      if (job.step === 'po' && where() === 'checkout') {
        if (job.address) {
          show('Filling the one time address...');
          await setAddress(job.address);
          job.done.push('One time address: ' + job.address.firstName + ' ' + job.address.lastName + ', ' + job.address.city + ' ' + job.address.state);
        } else {
          job.done.push(job.international ? 'International order: Default address kept, so ON ships to the store' : 'No address on the order: Default address kept');
        }
        await finish();
        banner(job.done.map((d) => '✓ ' + esc(d)).concat([
          job.missing && job.missing.length ? '<b style="color:#f2c14e">Not entered: ' + esc(job.missing.join('; ')) + '. Add by hand or tell the customer.</b>' : '',
          '<b>Ready for you.</b> Check the shoes, sizes, PO and address, then press <b>Submit order</b> yourself. Nothing has been submitted.',
        ].filter(Boolean)), job.missing && job.missing.length ? 'bad' : 'ok');
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
    if (!job || job.supplier !== 'on') return;
    if (Date.now() - job.at > MAX_AGE) { await chrome.storage.local.remove('rhPrepJob'); banner(['A prep request from more than 15 minutes ago was ignored. Press Prep in ON again.'], 'bad'); return; }
    if (job.state === 'pending') {
      if (where() !== 'select') { location.href = START; return; }
      running = true;
      const j = { ...job, state: 'running', owner: ME, beat: Date.now(), step: 'start', done: [] };
      await save(j);
      await run(j);
      running = false;
      return;
    }
    if (job.state === 'running' && (job.owner === ME || Date.now() - (job.beat || 0) > 20000)) {
      running = true;
      job.owner = ME; job.beat = Date.now(); await save(job);
      await run(job);
      running = false;
    } else if (job.state === 'running') {
      // Right after a reload the dead page's last beat is still recent.
      setTimeout(check, 21000);
    }
  }
  // Backstage changes page without reloading, so watch the address too.
  let last = location.pathname;
  setInterval(() => { if (location.pathname !== last) { last = location.pathname; check(); } }, 1000);
  check();
})();
