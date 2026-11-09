// Opens the supplier's cart in a new tab when the staff page asks. Only the
// fixed cart addresses below can be opened, whatever a message says. The tab
// opens next to the Late orders tab and in the same tab group, so the order
// and its cart stay together.
//
// House style: no em dashes. Use commas, periods, or the word "to".
const CARTS = {
  hoka: 'https://hokaus.deckersb2b.deckers.com/order-center/#/orderCenter/shoppingCar',
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'open-cart' && CARTS[msg.supplier]) {
    const from = sender.tab;
    const opts = { url: CARTS[msg.supplier] };
    if (from) { opts.openerTabId = from.id; opts.index = from.index + 1; opts.windowId = from.windowId; }
    chrome.tabs.create(opts, (tab) => {
      if (from && typeof from.groupId === 'number' && from.groupId >= 0 && tab) {
        chrome.tabs.group({ groupId: from.groupId, tabIds: [tab.id] }, () => void chrome.runtime.lastError);
      }
    });
    reply({ ok: true });
  }
  return false;
});
