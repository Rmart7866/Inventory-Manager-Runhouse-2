// Shoe sales per shop: a sale lands at the shop it left from, line by line,
// and the re:do line's Scituate assignment cannot drag a shoe off its shop.
import { makeSalesAccumulator, salesQuery } from '../src/size-sales.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };

const NOW = new Date('2026-11-08T12:00:00Z');
const SHOE = (h, type = "Women's Shoes") => ({ handle: h, title: 'Ghost 18 - Black', vendor: 'Brooks', productType: type, tags: ['cw-group:brooks-womens-ghost-18--standard'], featuredImage: null });
const size = (v) => ({ selectedOptions: [{ name: 'Size', value: v }] });

const acc = makeSalesAccumulator(['NEEDHAM'], NOW);
const rows = [
  // 1. POS at Walpole, recent: counts at Walpole by retailLocation.
  { id: 'O1', createdAt: '2026-11-01T10:00:00Z', retailLocation: { id: 'WAL' } },
  { id: 'L1', __parentId: 'O1', currentQuantity: 2, variant: size('8.0'), product: SHOE('w-ghost') },
  // 2. Online, shoe shipped from Falmouth, re:do line assigned to Scituate.
  //    The shoe's line item arrives BEFORE its fulfillment order rows.
  { id: 'O2', createdAt: '2026-09-01T10:00:00Z', retailLocation: null },
  { id: 'L2', __parentId: 'O2', currentQuantity: 1, variant: size('9'), product: SHOE('w-ghost') },
  { id: 'L2r', __parentId: 'O2', currentQuantity: 1, variant: size('One Size'), product: { handle: 'free-returns', title: 'Free returns', vendor: 're:do', productType: '', tags: [] } },
  { id: 'FO2a', __parentId: 'O2', status: 'CLOSED', assignedLocation: { location: { id: 'FAL' } } },
  { __parentId: 'FO2a', lineItem: { id: 'L2' } },
  { id: 'FO2b', __parentId: 'O2', status: 'CLOSED', assignedLocation: { location: { id: 'SCITUATE' } } },
  { __parentId: 'FO2b', lineItem: { id: 'L2r' } },
  // 3. Online, not shipped yet: not counted.
  { id: 'O3', createdAt: '2026-11-07T10:00:00Z', retailLocation: null },
  { id: 'FO3', __parentId: 'O3', status: 'OPEN', assignedLocation: { location: { id: 'WAL' } } },
  { __parentId: 'FO3', lineItem: { id: 'L3' } },
  { id: 'L3', __parentId: 'O3', currentQuantity: 1, variant: size('8'), product: SHOE('w-ghost') },
  // 4. Needham, the dropship location: left out.
  { id: 'O4', createdAt: '2026-11-02T10:00:00Z', retailLocation: { id: 'NEEDHAM' } },
  { id: 'L4', __parentId: 'O4', currentQuantity: 5, variant: size('8'), product: SHOE('w-ghost') },
  // 5. Cancelled, a fully refunded line, and a kids' shoe: none count.
  { id: 'O5', createdAt: '2026-11-02T10:00:00Z', cancelledAt: '2026-11-03T00:00:00Z', retailLocation: { id: 'WAL' } },
  { id: 'L5', __parentId: 'O5', currentQuantity: 1, variant: size('8'), product: SHOE('w-ghost') },
  { id: 'O6', createdAt: '2026-11-02T10:00:00Z', retailLocation: { id: 'WAL' } },
  { id: 'L6', __parentId: 'O6', currentQuantity: 0, variant: size('8'), product: SHOE('w-ghost') },
  { id: 'L7', __parentId: 'O6', currentQuantity: 1, variant: size('3'), product: SHOE('k-ghost', "Kids' Shoes") },
];
rows.forEach(acc.onObject);
const { byLoc, seen } = acc.result();
const wal = byLoc.WAL && byLoc.WAL.women.find((r) => r.h === 'w-ghost');
const fal = byLoc.FAL && byLoc.FAL.women.find((r) => r.h === 'w-ghost');

console.log('\nWhere a sale happened');
check('a POS sale counts at its register\'s shop, size "8.0" read as 8', wal && wal.d90 === 2 && wal.sz['8'] === 2);
check('an online shoe counts at the shop that shipped it, even when its line comes first', fal && fal.d90 === 1 && fal.sz['9'] === 1);
check('the re:do line at Scituate does not pull the shoe off Falmouth', !byLoc.SCITUATE);
check('an order not yet shipped is not counted', seen.unshipped === 1 && wal.sz['8'] === 2);
check('Needham, the dropship location, is left out', !byLoc.NEEDHAM);
check('cancelled, refunded and kids\' lines do not count', wal.d90 === 2 && !byLoc.WAL.men.length && seen.pairs === 3);

console.log('\nThe windows');
check('the last 30 days and the last 90 are both kept', wal.d30 === 2 && fal.d30 === 0 && fal.d90 === 1);
check('each style carries its brand, model and width', wal.v === 'Brooks' && wal.m === 'brooks-womens-ghost-18' && wal.w === 'standard');

console.log('\nThe query');
const q = salesQuery('2026-08-10');
check('reads fulfillment ORDERS, a connection, never fulfillments\' line items inside a list', /fulfillmentOrders \{ edges/.test(q) && !/fulfillmentLineItems/.test(q));
check('asks for the window it was given', q.includes('created_at:>=2026-08-10'));

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
