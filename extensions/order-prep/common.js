// common.js, The Run House order prep. Helpers shared by the supplier scripts
// that came after HOKA (on.js). hoka.js keeps its own copies, proven on the
// live cart, and is deliberately not rewired onto this file.
//
// The rules here are the same ones hoka.js learned the hard way, 2026-11-09:
//   - type, do not set: a value set straight onto a field fills it but the
//     page does not see typing, so its Save stays grey;
//   - every click goes through safeClick, which refuses Submit, Place (order
//     or basket), Agree, Delete, Discard, Clear and Validate, so prep can never
//     place or remove an order;
//   - the job is saved after each step with a heartbeat, so a page reload
//     carries on instead of losing the run.
//
// House style: no em dashes. Use commas, periods, or the word "to".
(function (root) {
  // Brooks names its submit "Step 2/2: Place basket" and its wipe "Clear
  // basket", so "place" and "clear" are refused whole, not just "place order".
  // "Validate availability" is Brooks' step 1 of 2 and is left to a person too,
  // so prep never walks the basket up to its last button.
  const FORBIDDEN = /submit|\bplace\b|\bagree\b|delete|discard|\bclear\b|validate/i;
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
    const text = ((el.innerText || el.textContent || el.value || '') + ' ' + (el.getAttribute && el.getAttribute('aria-label') || '')).trim();
    if (FORBIDDEN.test(text)) throw new Error('Refused to press "' + text + '": the draft tool never submits');
    if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
  // A picker built on Reka UI (ON's State select) opens on POINTERDOWN and
  // picks an item on POINTERUP, and ignores a plain click: a real run timed out
  // waiting for the state list, 2026-11-09. Same guard as safeClick; the event
  // lands at the element's own centre because Reka ignores a pointerup within
  // 10px of where the picker was opened.
  function safePress(el, what, type) {
    if (!el) throw new Error('Could not find ' + what);
    const text = ((el.innerText || el.textContent || el.value || '') + ' ' + (el.getAttribute && el.getAttribute('aria-label') || '')).trim();
    if (FORBIDDEN.test(text)) throw new Error('Refused to press "' + text + '": the draft tool never submits');
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === 'pointerdown' ? 1 : 0, pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  }
  function setVal(el, v) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, v == null ? '' : String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function typeInto(el, v) {
    const text = v == null ? '' : String(v);
    el.focus();
    if (el.select) el.select();
    const ok = text ? document.execCommand('insertText', false, text) : document.execCommand('delete');
    if (!ok || String(el.value) !== text) setVal(el, text);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // A form control by the text of its <label>.
  function byLabel(re, scope) {
    for (const l of (scope || document).querySelectorAll('label')) {
      if (!re.test((l.innerText || '').trim())) continue;
      const el = l.htmlFor ? document.getElementById(l.htmlFor) : l.querySelector('input,select,textarea,button');
      if (el && visible(el)) return el;
    }
    return null;
  }

  // ---------- the banner ----------
  let box = null;
  function banner(lines, tone) {
    try { chrome.storage.local.set({ rhPrepLast: { at: Date.now(), lines, tone: tone || '', shown: false } }); } catch (e) { /* the banner still shows */ }
    if (!box) {
      box = document.createElement('div');
      box.id = 'rh-prep-banner';
      box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:340px;max-width:calc(100vw - 32px);background:#111828;color:#eef2f8;border:1px solid rgba(255,255,255,.18);border-left:4px solid #4c9bff;font:14px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.4)';
      document.body.appendChild(box);
    }
    box.style.borderLeftColor = tone === 'bad' ? '#ff7a90' : tone === 'ok' ? '#3ddc97' : '#4c9bff';
    box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Run House order draft</div>' + lines.map((l) => '<div>' + l + '</div>').join('') +
      '<button type="button" style="margin-top:8px;background:none;border:1px solid rgba(255,255,255,.25);color:inherit;padding:3px 10px;cursor:pointer">Close</button>';
    box.querySelector('button').onclick = () => { box.remove(); box = null; };
  }

  // ---------- ON: our line to ON's page ----------
  // "ON Men's Cloud 6 WP - Storm Larch" -> "Cloud 6 WP", the re-order card.
  // A family prefix ("Boom | Cloudboom Volt") is dropped, see CLAUDE.md.
  function onModel(title) {
    return String(title || '').replace(/^ON\s+/i, '').replace(/^(Men'?s|Women'?s|Unisex)\s+/i, '').split(' - ')[0].replace(/^[A-Za-z]+\s*\|\s*/, '').trim();
  }
  // ON-3MF10071043-BLA-1255 -> 3MF10071043, the article code on the matrix row.
  const onArticle = (sku) => { const m = /^ON-([0-9A-Z]{11})-/i.exec(String(sku || '')); return m ? m[1].toUpperCase() : ''; };
  // "12.5 / Black Black" or "12.0" -> "12.5" / "12"; failing that the SKU's
  // size, where a trailing 55 is the half: 1255 is 12.5, but 15 is 15.
  function onSize(line) {
    const v = parseFloat(String(line.variant || '').split('/')[0]);
    if (isFinite(v)) return String(v);
    const m = /-(\d{1,2}?)(55)?$/.exec(String(line.sku || ''));
    if (!m) return '';
    return m[2] ? m[1] + '.5' : m[1];
  }

  // The colour as our variant or title spells it: "7.5 / Black Black" or
  // "ON Men's Cloudrunner 3 Wide - Black Black" -> "Black Black".
  function onColour(line) {
    const parts = String(line.variant || '').split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts.slice(1).join(' ');
    const t = String(line.title || '').split(' - ');
    return t.length > 1 ? t[t.length - 1].trim() : '';
  }

  // THE BOX FOR A LINE WHEN ITS BARCODE IS NOT ON's EAN. holders are the page
  // blocks that hold number inputs, in page order, as { text, inputs: [{ label,
  // ref }] }. Found 2026-11-17 on #90267-EXC (2): the Black Black 7.5 went into
  // GHOST VERDITE, because the first block containing the article code is the
  // OUTER one holding every colour of the model, and its first "size 7.5" box
  // was the other colour's. So: the INNERMOST block with the article code (the
  // colour's own row), and if more than one box still says this size, the one
  // whose label is our colour. Still not exactly one: null, and the line is
  // listed as missing for a person rather than typed somewhere plausible.
  function onPickBox(holders, art, size, colour) {
    const withArt = (holders || []).filter((h) => h.text.includes(art) && h.inputs.length);
    if (!withArt.length || !size) return null;
    const inner = withArt.reduce((a, b) => (b.text.length < a.text.length ? b : a));
    const re = new RegExp('size ' + String(size).replace('.', '\\.') + ' quantity$', 'i');
    let hits = inner.inputs.filter((i) => re.test(String(i.label || '').trim()));
    if (hits.length > 1) {
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
      const c = norm(colour);
      hits = c ? hits.filter((i) => norm(String(i.label).trim().replace(re, '')) === c) : [];
    }
    return hits.length === 1 ? hits[0].ref : null;
  }

  // ---------- Brooks: our SKU to FastTrack's grid ----------
  // Two SKU dialects live on the store (see brooks-converter.js):
  //   110478114-187-1450-D   style 110478 + suffix | colour 187 | 14.0 | D
  //   1104782E187.140        style 110478 | 2E | colour 187 | 14.0
  // The tool's size is whole + 50, or whole + 55 for the half: 1450 is 14.0,
  // 1455 is 14.5. FastTrack's columns read "14.0", its widths "D", "2E".
  // A SKU that does not decode returns null, never a guess.
  function brooksLine(line) {
    const s = String((line && line.sku) || '').trim().toUpperCase();
    let style, colour, size, width;
    let m = /^(\d{6})\d*-(\d{3})-(\d+)-([A-Z0-9]{1,2})$/.exec(s);
    if (m) {
      const whole = m[3].slice(0, -2), tail = m[3].slice(-2);
      if (!whole || (tail !== '50' && tail !== '55')) return null;
      style = m[1]; colour = m[2]; size = parseInt(whole, 10) + (tail === '55' ? 0.5 : 0); width = m[4];
    } else if ((m = /^(\d{6})(\d[A-Z])(\d{3})\.(\d{3})$/.exec(s))) {
      style = m[1]; width = m[2]; colour = m[3]; size = parseInt(m[4], 10) / 10;
    } else return null;
    if (!isFinite(size) || size <= 0) return null;
    width = width.replace(/^1(?=[A-Z]$)/, '');
    return { style, colour, size: size.toFixed(1), width, key: style + '-' + colour };
  }

  // One group per STYLE, not per colourway: FastTrack shows every colour of a
  // style on one grid, and a second visit to that grid finds the first visit's
  // pairs already in it and offers "Update 2 items" (a live run on two colours
  // of 120444 stopped there, 2026-11-09). The search uses the first colourway,
  // whose exact Style ID opens the grid. Kept here, not in brooks.js, so the
  // test runs it: a half renamed key in brooks.js stopped a live run with
  // "reading 'pairs'" the same day.
  function brooksGroups(lines) {
    const g = new Map();
    for (const l of lines) {
      const b = brooksLine(l);
      if (!b) throw new Error((l.title || l.sku) + ' has a SKU this cannot read (' + l.sku + ')');
      if (!g.has(b.style)) g.set(b.style, { key: b.key, style: b.style, title: l.title, pairs: [] });
      g.get(b.style).pairs.push({ colour: b.colour, size: b.size, width: b.width, qty: l.qty, title: l.title });
    }
    return [...g.values()];
  }

  // ---------- ASICS: our SKU to ASICS' basket ----------
  // Our ASICS SKU is <style>-<colour>-<size>[-<width>], the scraper's own
  // generateSKU: 1011C167-002-10, 1011C167-002-1055 (10.5: a trailing 55 is
  // the half, as on ON), 1012B888-401-8-D. The style IS ASICS' item number,
  // a wide shoe has its own style, so the width suffix is only a label.
  // ASICS writes the half with an H: sizeKey "10H". Measured on the live
  // basket 2026-11-27. A SKU that does not decode returns null, never a guess
  // (the singlets' TF3085-01-M never reach this: they are not dropship).
  function asicsLine(line) {
    const s = String((line && line.sku) || '').trim().toUpperCase();
    const m = /^(\d{4}[A-Z]\d{3})-(\d{3})-(\d{1,2}?)(55)?(?:-(?:[A-Z]|\dE))?$/.exec(s);
    if (!m || !m[3]) return null;
    const whole = parseInt(m[3], 10);
    if (!(whole > 0 && whole <= 20)) return null;
    return { style: m[1], colour: m[2], sizeKey: whole + (m[4] ? 'H' : ''), size: whole + (m[4] ? '.5' : ''), key: m[1] + '-' + m[2] };
  }
  // One group per COLOURWAY: ASICS answers stock per style and colour, and
  // one PATCH can carry every size of it.
  function asicsGroups(lines) {
    const g = new Map();
    for (const l of lines) {
      const a = asicsLine(l);
      if (!a) throw new Error((l.title || l.sku) + ' has a SKU this cannot read (' + l.sku + ')');
      if (!g.has(a.key)) g.set(a.key, { key: a.key, style: a.style, colour: a.colour, title: l.title, pairs: [] });
      const p = g.get(a.key).pairs.find((x) => x.sizeKey === a.sizeKey);
      if (p) p.qty += l.qty; else g.get(a.key).pairs.push({ sizeKey: a.sizeKey, size: a.size, qty: l.qty, title: l.title });
    }
    return [...g.values()];
  }
  // ASICS' "Sales District" is a search list. Its spelling is not known for
  // every state, so an option matches by the two letter code as a whole word
  // ("MA", "MA - Massachusetts") or by the full name; anything else is no match.
  const US_STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };
  function stateMatches(optionText, code) {
    const c = String(code || '').toUpperCase(), name = US_STATES[c];
    if (!name) return false;
    const t = String(optionText || '').replace(/\s+/g, ' ').trim();
    if (new RegExp('(^|[^A-Za-z])' + c + '([^A-Za-z]|$)').test(t)) return true;
    // "Virginia" must not match "West Virginia", nor "Kansas" match "Arkansas".
    return new RegExp('(^|[^A-Za-z ])\\s*' + name + '\\s*($|[^A-Za-z])', 'i').test(t) || t.toLowerCase() === name.toLowerCase();
  }

  root.RHPrep = { FORBIDDEN, sleep, visible, waitFor, safeClick, safePress, setVal, typeInto, esc, byLabel, banner, onModel, onArticle, onSize, onColour, onPickBox, brooksLine, brooksGroups, asicsLine, asicsGroups, US_STATES, stateMatches };
})(typeof window !== 'undefined' ? window : globalThis);
