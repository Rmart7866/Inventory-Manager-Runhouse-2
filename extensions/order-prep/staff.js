// Runs on the Run House staff pages. The Late orders page posts one order's
// prep (items with UPC and quantity, the PO, the ship-to address); this keeps
// it for the supplier tab and asks the background to open the cart. It says
// hello on load, so the page can tell whether the extension is installed.
//
// House style: no em dashes. Use commas, periods, or the word "to".
(function () {
  const VERSION = chrome.runtime.getManifest().version;
  const hello = () => window.postMessage({ source: 'rh-order-prep', type: 'hello', version: VERSION }, location.origin);

  // Only a well formed job is accepted: a known supplier, a PO, and at
  // least one line with a UPC and a whole quantity.
  function valid(job) {
    if (!job || typeof job !== 'object') return false;
    if (job.supplier !== 'hoka' && job.supplier !== 'on') return false;
    if (typeof job.po !== 'string' || !job.po) return false;
    if (!Array.isArray(job.lines) || !job.lines.length) return false;
    // HOKA finds a shoe by UPC; ON by its EAN, or by article code and size.
    const findable = (l) => job.supplier === 'hoka' ? /^\d{8,14}$/.test(String(l.upc || '')) : (/^\d{13}$/.test(String(l.upc || '')) || /^ON-[0-9A-Z]{11}-/i.test(String(l.sku || '')));
    return job.lines.every((l) => findable(l) && Number.isInteger(l.qty) && l.qty > 0 && l.qty < 50);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || m.source !== 'rh-staff') return;
    if (m.type === 'ping') return hello();
    if (m.type !== 'order-prep') return;
    if (!valid(m.job)) {
      window.postMessage({ source: 'rh-order-prep', type: 'ack', ok: false, error: 'That order cannot be prepped: a line cannot be matched to the supplier.' }, location.origin);
      return;
    }
    chrome.storage.local.set({ rhPrepJob: { ...m.job, state: 'pending', at: Date.now() } }, () => {
      chrome.runtime.sendMessage({ type: 'open-cart', supplier: m.job.supplier }, () => {
        window.postMessage({ source: 'rh-order-prep', type: 'ack', ok: true }, location.origin);
      });
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hello); else hello();
})();
