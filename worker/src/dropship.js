// dropship.js, The Run House. THE DROPSHIP LOCATION, one setting.
//
// Supplier dropship stock lived at "Needham" from the start, and Needham is
// ALSO a real store (943 Great Plain Ave) with its own counted shelf. Owner
// decision 2026-11-18: dropship moves to its own location, "Dropship
// Warehouse", and Needham becomes a store like Walpole and Falmouth that the
// dropship path never touches. Every module asks THIS file where dropship
// lives, so the cutover is a change of settings, not of code:
//
//   DROPSHIP_LOCATION_ID    where every dropship write goes (the inventory
//                           route, new products' stock), and the location the
//                           catalog's needham* fields and the size pages are
//                           scoped against
//   DROPSHIP_LOCATION_NAME  that location's name, as written in a stock row's
//                           Location column and shown to staff
//   DROPSHIP_WATCH_IDS      extra locations whose OPEN orders still count as
//                           dropship (Late orders, Draft in HOKA/ON/Brooks,
//                           tracking). During the changeover this holds the old
//                           Needham id, so an order assigned there before the
//                           move is still chased and shipped; empty it once
//                           they have all gone out.
//
//   DROPSHIP_PREVIOUS_ID    the location dropship USED to live at (Needham),
//   DROPSHIP_PREVIOUS_NAME  and its name, with
//   DROPSHIP_SINCE          the cutover time (ISO). An ONLINE sale shipped from
//                           the previous location before that time was a
//                           dropship sale, so the sales report and the Sizes
//                           page keep counting it as one for the 90 days their
//                           windows still reach back. A POS sale there was
//                           always the store's. Leave all three empty until
//                           the cutover; they never change where anything is
//                           written.
//
// Unset, all three fall back to NEEDHAM_LOCATION_ID and "Needham", which is
// exactly how the Worker behaved before this file existed.
//
// House style: no em dashes.

export function dropshipId(env) {
  return (env && (env.DROPSHIP_LOCATION_ID || env.NEEDHAM_LOCATION_ID)) || null;
}

export function dropshipName(env) {
  return (env && env.DROPSHIP_LOCATION_NAME) || 'Needham';
}

// The previous dropship location, or null when none is configured.
export function dropshipPrevious(env) {
  const id = String((env && env.DROPSHIP_PREVIOUS_ID) || '').trim();
  const name = String((env && env.DROPSHIP_PREVIOUS_NAME) || '').trim();
  const until = Date.parse(String((env && env.DROPSHIP_SINCE) || ''));
  if ((!id && !name) || !Number.isFinite(until)) return null;
  return { id: id || null, name: name || null, until };
}

// The dropship location plus any still being watched, deduplicated.
export function dropshipWatchIds(env) {
  const extra = String((env && env.DROPSHIP_WATCH_IDS) || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([dropshipId(env)].concat(extra).filter(Boolean))];
}

// Is this location id one of these? Takes one id or a list, so the pure
// helpers below keep accepting a single id as their tests pass it.
export function isAt(locationId, ids) {
  if (!locationId) return false;
  return Array.isArray(ids) ? ids.includes(locationId) : locationId === ids;
}

// What Late orders, order prep and tracking watch: the dropship location,
// the extra watched ones, and the cutover time.
export function dropshipWatch(env) {
  const extra = String((env && env.DROPSHIP_WATCH_IDS) || '').split(',').map((s) => s.trim()).filter(Boolean);
  return { current: dropshipId(env), extra, since: Date.parse(String((env && env.DROPSHIP_SINCE) || '')) };
}

// Does an open line at this location, on an order placed at createdAt, count
// as dropship? The dropship location always does. A WATCHED old location
// (Needham after the cutover, owner 2026-11-20: it keeps in-store stock) only
// for orders placed before DROPSHIP_SINCE: those were dropship orders still
// waiting to ship, while a newer order there is the Needham STORE selling its
// own shelf and must never be chased, drafted with a supplier or given
// supplier tracking. With no cutover time set it behaves exactly as isAt.
// Also accepts a plain id or list (the tests' and older callers' form).
export function countsAsDropship(locationId, createdAt, watch) {
  if (!locationId) return false;
  if (!watch || typeof watch !== 'object' || Array.isArray(watch)) return isAt(locationId, watch);
  if (locationId === watch.current) return true;
  if (!watch.extra.includes(locationId)) return false;
  if (!Number.isFinite(watch.since)) return true;
  const t = Date.parse(String(createdAt || ''));
  return Number.isFinite(t) && t < watch.since;
}
