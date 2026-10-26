// no-blocking-dialogs.mjs, The Run House.
//
// alert() IS A HANG, NOT A MESSAGE.
//
// A modal dialog blocks the renderer. The extension stops receiving events,
// the navigation loop cannot advance, the tab answers nothing, and Chrome
// itself reports that it is waiting for the user. Reproduced 2026-10-26 by
// running a one url scrape and watching the tab stop evaluating `1 + 1`, and
// again when closing that tab failed with "Chrome may be waiting for the user".
//
// completeBackgroundScraping ended EVERY run with one, right after setting the
// six modal status fields that already said the same thing. So the scrape would
// finish and then freeze the page it finished in, which is most of what "stuck"
// meant.
//
// They are replaced by notify(), a banner that paints and returns.
//
// Run: node scrapers/asics/test/no-blocking-dialogs.mjs
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };

for (const file of ['../content.js', '../background.js']) {
  const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const name = file.replace('../', '');

  // Strip comments and strings so the word "alert" in prose does not count.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');

  for (const fn of ['alert', 'confirm', 'prompt']) {
    // window.alert( or a bare alert(, but not .prompt( on some object and not
    // a method definition of our own.
    const re = new RegExp('(?:^|[^.\\w])' + fn + '\\s*\\(', 'g');
    const hits = (code.match(re) || []).length;
    hits === 0
      ? ok(name + ' calls no ' + fn + '()')
      : bad(name + ' still calls ' + fn + '(), which freezes the renderer', { hits });
  }
}

const src = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

console.log('');
const hasNotify = /static notify\(message, tone\)/.test(src);
hasNotify ? ok('notify() exists as the replacement') : bad('notify() is missing');

const nonBlocking = /setTimeout\(\(\) => el\.remove\(\)/.test(src);
nonBlocking ? ok('its banner removes itself rather than waiting on a click')
            : bad('the banner may never go away');

const completionUsesNotify = /CSV scrape finished in/.test(src);
completionUsesNotify ? ok('the completion message goes through notify')
                     : bad('the completion message is gone or still a dialog');

const failuresLogged = /ASICS: FAILED ' \+ r\.url/.test(src);
failuresLogged ? ok('and each failed url is printed with its diagnostic')
               : bad('a failed url no longer reports its reason');

const carriedWarning = /will read them as removed and ZERO/.test(src);
carriedWarning ? ok('the carried-styles-missing warning survived as a banner, it is a safety notice')
               : bad('the carried styles warning was lost, which risks a silent zeroing');

console.log(failures ? '\n' + failures + ' FAILED\n' : '\nall good\n');
process.exit(failures ? 1 : 0);
