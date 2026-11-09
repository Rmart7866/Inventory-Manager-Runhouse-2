// The order prep spreadsheet: a real .xlsx a spreadsheet reader opens, UPCs
// kept as text, quantities as numbers. Read back with Python's openpyxl.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import '../xlsx.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };

check('crc32 of "123456789" is the standard check value', globalThis.RHXlsx.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926);
const bytes = globalThis.RHXlsx.build([['UPC', 'Quantity'], ['198605519741', 1], ['012345678905', 2], ['a&b <c>', 3]]);
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rhxlsx-')), 't.xlsx');
fs.writeFileSync(file, bytes);
let out = '';
try {
  out = execFileSync('python3', ['-c', 'import sys, openpyxl\nws = openpyxl.load_workbook(sys.argv[1]).active\nfor r in ws.iter_rows(values_only=True): print(repr(r))', file], { encoding: 'utf8' });
} catch (e) { out = 'ERROR ' + e.message; }
const lines = out.trim().split('\n');
check('opens as a spreadsheet', lines.length === 4 && !/ERROR/.test(out));
check('header row', lines[0] === "('UPC', 'Quantity')");
check('a UPC stays text and a quantity stays a number', lines[1] === "('198605519741', 1)");
check('a leading zero is kept', lines[2] === "('012345678905', 2)");
check('odd characters survive', lines[3] === "('a&b <c>', 3)");

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
