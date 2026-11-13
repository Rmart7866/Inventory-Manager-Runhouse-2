// strip-wholesale.mjs, The Run House.
//
// A COPY OF A SUPPLIER WORKBOOK WITH THE WHOLESALE PRICE COLUMNS REMOVED, so
// the scheduled files can travel to the Worker and load into the inventory
// tool without our cost price ever leaving this Mac. Owner decision
// 2026-11-13: strip, rather than store the files as they come.
//
// The columns, read off every scheduled file that day:
//   Saucony, Merrell (CatalogUPCs, sheets UPCs and Styles)   WHSL              keep MSRP
//   Puma, Altra, New Balance (ATS exports)                    Wholesale Price   keep Retail Price
//   HOKA (ATS Report)                                         Wholesale Price   keep MSRP
// ON's file is the scraper's inventory CSV, which carries no price at all.
//
// A DENY LIST, CHECKED AFTERWARDS. Any header that names a wholesale or cost
// price is removed from EVERY sheet, and the result is re-read to prove none
// is left; a file that still has one is refused, never uploaded. Retail
// (MSRP, Retail Price) is kept: new products are priced from it.
//
// The converters never read the wholesale columns, which the test proves the
// direct way: the stripped copy converts to exactly the same rows.
//
// House style: no em dashes.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

export const WHOLESALE_RE = /wholesale|whsl|\bcost\b|dealer\s*price|net\s*price|landed/i;

function headerRow(rows) {
  return rows.findIndex((r) => r && r.filter((c) => c != null && c !== '').length > 4);
}

// buf: the workbook bytes. Returns { buf, removed: ['Sheet: Column', ...] }.
export function stripWholesale(buf) {
  const wb = XLSX.read(buf, { cellDates: false });
  const removed = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hi = headerRow(rows);
    if (hi < 0) continue;
    const drop = new Set();
    rows[hi].forEach((h, i) => { if (h != null && WHOLESALE_RE.test(String(h))) { drop.add(i); removed.push(name + ': ' + String(h)); } });
    if (!drop.size) continue;
    const kept = rows.map((r) => (r || []).filter((_, i) => !drop.has(i)));
    wb.Sheets[name] = XLSX.utils.aoa_to_sheet(kept);
  }
  const out = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true, bookSST: true }));
  const left = wholesaleColumns(out);
  if (left.length) throw new Error('wholesale columns survived the strip: ' + left.join(', '));
  return { buf: out, removed };
}

// The wholesale-looking headers still in a workbook; [] is the only safe answer.
export function wholesaleColumns(buf) {
  const wb = XLSX.read(buf);
  const found = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hi = headerRow(rows);
    if (hi < 0) continue;
    rows[hi].forEach((h) => { if (h != null && WHOLESALE_RE.test(String(h))) found.push(name + ': ' + String(h)); });
  }
  return found;
}
