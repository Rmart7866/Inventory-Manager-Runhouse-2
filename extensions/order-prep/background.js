// Opens the supplier's cart in a new tab when the staff page asks. Only the
// fixed cart addresses below can be opened, whatever a message says.
//
// House style: no em dashes. Use commas, periods, or the word "to".
const CARTS = {
  hoka: 'https://hokaus.deckersb2b.deckers.com/order-center/#/orderCenter/shoppingCar',
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === 'open-cart' && CARTS[msg.supplier]) {
    chrome.tabs.create({ url: CARTS[msg.supplier] });
    reply({ ok: true });
  }
  return false;
});
