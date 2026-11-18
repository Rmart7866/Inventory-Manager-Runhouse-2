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
