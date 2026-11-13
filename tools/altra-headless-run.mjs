#!/usr/bin/env node
// altra-headless-run.mjs, The Run House.
//
// Altra stock, overnight. b2b.altrarunning.com is the same platform as Puma,
// so this is a config for the shared runner in tools/b2b-ats-run.mjs: one
// availability request a run, the ATS workbook altra-converter.js reads.
//
//   node tools/altra-headless-run.mjs --setup                 log the profile in, once
//   node tools/altra-headless-run.mjs                         download, convert, judge
//   node tools/altra-headless-run.mjs --keepalive             one visit, keeps the login warm
//   node tools/altra-headless-run.mjs --accept-file <xlsx>    record a checked file as the baseline
//
// House style: no em dashes.

import { main } from './b2b-ats-run.mjs';

export const ALTRA = {
  key: 'altra',
  label: 'Altra',
  port: 9933,
  home: 'https://b2b.altrarunning.com/',
  // Altra's ATS file comes from a SEASONAL catalog, not a standing master
  // one. Read off the live list 2026-11-13: "Fall 26 (US)" is classified ATS
  // (in stock now); Spring 27, Fall 27 and "Fall 27 Seasonal" are Prebook
  // (future orders, not stock); "Off-MAP CATALOG" is ATS but a special list.
  // So: the "<Season> <YY> (US)" catalog classified ATS. When Spring 27 turns
  // ATS it matches by itself.
  catalog: { pattern: '^(Fall|Spring) \\d\\d \\(US\\)$', classification: 'ATS' },
  converter: 'altra-converter.js',
  converterGlobal: 'AltraConverter',
  filePrefix: 'Altra ATS',
};

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) main(ALTRA);
