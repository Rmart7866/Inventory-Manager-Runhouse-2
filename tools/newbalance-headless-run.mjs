#!/usr/bin/env node
// newbalance-headless-run.mjs, The Run House.
//
// New Balance stock, overnight. newbalanceus.elasticsuite.com is the same
// platform as Puma and Altra, so this is a config for the shared runner in
// tools/b2b-ats-run.mjs: one availability request a run.
//
// THE DROP SHIP CATALOG, NOT "AT ONCE". Two NB exports sit in Downloads:
// "New Balance AT Once" and "Consumer Drop Ship  CDS ASAP". The converter is
// written for the CDS ASAP one (newbalance-converter.js, "Consumer Drop Ship -
// CDS ASAP export"): the drop ship catalog is what we can actually sell.
// About 165,000 rows and 23 MB across every sport NB sells.
//
//   node tools/newbalance-headless-run.mjs --setup                 log the profile in, once
//   node tools/newbalance-headless-run.mjs                         download, convert, judge
//   node tools/newbalance-headless-run.mjs --keepalive             one visit, keeps the login warm
//   node tools/newbalance-headless-run.mjs --accept-file <xlsx>    record a checked file as the baseline
//
// House style: no em dashes.

import { main } from './b2b-ats-run.mjs';

export const NEWBALANCE = {
  key: 'newbalance',
  label: 'New Balance',
  port: 10033,
  home: 'https://newbalanceus.elasticsuite.com/',
  // Elastic Suite's own page offers "External login", which signs in through
  // NEW BALANCE'S NBlogin site, not the /B2B dealer portal: logging into /B2B
  // first and pressing External login landed on the portal home twice without
  // ever signing Elastic in (2026-11-13). So --setup opens NBlogin.
  loginUrl: 'https://newbalance.my.site.com/NBlogin/s/login/',
  // BY ID. The drop ship catalog is not in /api/catalogs (that lists five:
  // AT Once, Apparel Futures, Promotions and two Team Sports ones) but its
  // file still answers by the id the 30 Oct hand download used. A catalog id
  // is New Balance's, not ours, so it is fine in a public repo. Verified
  // 2026-11-13: 22.5 MB in about 4 minutes, 21,175 sizes, 20,723 of them the
  // same as the 30 Oct hand file.
  catalog: { id: '68fc63370f4d670001b7c515', label: 'Consumer Drop Ship - CDS ASAP' },
  converter: 'newbalance-converter.js',
  converterGlobal: 'NewBalanceConverter',
  filePrefix: 'Consumer Drop Ship CDS ASAP',
};

const isMain = process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];
if (isMain) main(NEWBALANCE);
