// Opens the supplier's cart when the staff page asks. Only the fixed cart
// addresses below can be opened, whatever a message says. An already open tab
// of that supplier is REUSED (sent to the cart and brought forward), so
// pressing Prep several times does not pile up cart tabs; otherwise a new tab
// opens next to the Late orders tab, in the same tab group.
//
// House style: no em dashes. Use commas, periods, or the word "to".
const CARTS = {
  hoka: { url: 'https://hokaus.deckersb2b.deckers.com/order-center/#/orderCenter/shoppingCar', match: 'https://hokaus.deckersb2b.deckers.com/*' },
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const cart = msg && msg.type === 'open-cart' && CARTS[msg.supplier];
  if (!cart) return false;
  const from = sender.tab;
  chrome.tabs.query({ url: cart.match }, (open) => {
    const tab = (open || [])[0];
    if (tab) {
      // Reload onto the cart even if it is already there, so the content
      // script starts fresh and picks up the new job.
      chrome.tabs.update(tab.id, { url: cart.url, active: true }, () => {
        if (tab.url === cart.url) chrome.tabs.reload(tab.id);
        chrome.windows.update(tab.windowId, { focused: true });
      });
      return;
    }
    const opts = { url: cart.url };
    if (from) { opts.openerTabId = from.id; opts.index = from.index + 1; opts.windowId = from.windowId; }
    chrome.tabs.create(opts, (t) => {
      if (from && typeof from.groupId === 'number' && from.groupId >= 0 && t) {
        chrome.tabs.group({ groupId: from.groupId, tabIds: [t.id] }, () => void chrome.runtime.lastError);
      }
    });
  });
  reply({ ok: true });
  return false;
});
