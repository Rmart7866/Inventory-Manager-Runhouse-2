#!/usr/bin/env node
// puma-headless-run.mjs, The Run House.
//
// Puma stock, overnight. pumab2b.com's "Master ATS" file is ONE availability
// request; the logic lives in the shared runner, tools/b2b-ats-run.mjs, which
// Altra (same platform) uses too. Found and verified 2026-11-13: 7,333 sizes
// and 92,421 units in 49s, in line with the 30 Oct hand file.
//
//   node tools/puma-headless-run.mjs --setup                  log the profile in, once
//   node tools/puma-headless-run.mjs                          download, convert, judge
//   node tools/puma-headless-run.mjs --keepalive              one visit, keeps the login warm
//   node tools/puma-headless-run.mjs --accept-file <xlsx>     record a checked file as the baseline
//
// House style: no em dashes.

import { main } from './b2b-ats-run.mjs';

export const PUMA = {
  key: 'puma',
  label: 'Puma',
  port: 9633,
  home: 'https://pumab2b.com/',
  // The standing all-season ATS catalog; the seasonal ones are named
  // "Fall-Holiday 2026 / ATS" and so on (read off the live list 2026-11-13).
  catalog: { name: 'Master / ATS' },
  converter: 'puma-converter.js',
  converterGlobal: 'PumaConverter',
  filePrefix: 'Master ATS',
};

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) main(PUMA);
