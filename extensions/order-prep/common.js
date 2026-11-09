// common.js, The Run House order prep. Helpers shared by the supplier scripts
// that came after HOKA (on.js). hoka.js keeps its own copies, proven on the
// live cart, and is deliberately not rewired onto this file.
//
// The rules here are the same ones hoka.js learned the hard way, 2026-11-09:
//   - type, do not set: a value set straight onto a field fills it but the
//     page does not see typing, so its Save stays grey;
//   - every click goes through safeClick, which refuses Submit, Place order,
//     Agree, Delete and Discard, so prep can never place or remove an order;
//   - the job is saved after each step with a heartbeat, so a page reload
//     carries on instead of losing the run.
//
// House style: no em dashes. Use commas, periods, or the word "to".
(function (root) {
  const FORBIDDEN = /submit|place order|\bagree\b|delete|discard/i;
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
    if (FORBIDDEN.test(text)) throw new Error('Refused to press "' + text + '": order prep never submits');
    if (typeof el.click === 'function') el.click(); else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
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
    box.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Run House order prep</div>' + lines.map((l) => '<div>' + l + '</div>').join('') +
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

  root.RHPrep = { FORBIDDEN, sleep, visible, waitFor, safeClick, setVal, typeInto, esc, byLabel, banner, onModel, onArticle, onSize };
})(typeof window !== 'undefined' ? window : globalThis);
