// feeds.mjs, The Run House. The scheduled scraper files the inventory tool
// loads by itself (feeds.js, 2026-11-12). Run: node test/feeds.mjs
// House style: no em dashes.
import { validateFeed, validateWorkbook, putFeed, putImages, getFeed, MAX_BYTES, validateLink, putLink, getLinks } from '../src/feeds.js';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m, x) => { failures++; console.log('  FAIL  ' + m + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); };
const yes = (m, c, x) => (c ? ok(m) : bad(m, x));

const kv = new Map();
const env = { CATALOG: { put: async (k, v) => { kv.set(k, v); }, get: async (k, type) => { const v = kv.get(k); return v == null ? null : type === 'json' ? JSON.parse(v) : v; } } };
const csv = 'Handle,Title,"Option1 Name","Option1 Value","Option2 Name","Option2 Value","Option3 Name","Option3 Value",SKU,"HS Code",COO,Location,"Bin name","Incoming (not editable)","Unavailable (not editable)","Committed (not editable)","Available (not editable)","On hand (current)","On hand (new)",MSRP\n' +
  'ghost-18-black-110493056,"Ghost 18 - Black",Size,7.0,,,,,110493056-056-750-D,,,Needham,,,,,,,12,150.00\n';

console.log('\nOnly a scraper inventory CSV with a verdict is accepted');
yes('a real file passes', validateFeed('brooks', csv, { verdict: 'PASS' }).ok);
yes('an unknown brand is refused', !validateFeed('hoka', csv, { verdict: 'PASS' }).ok);
yes('an HTML error page is refused', !validateFeed('asics', '<html>502</html>', { verdict: 'PASS' }).ok);
yes('a product CSV is refused (no On hand (new))', !validateFeed('asics', 'Handle,Title,Body (HTML),SKU\n', { verdict: 'PASS' }).ok);
yes('no verdict, no upload', !validateFeed('asics', csv, {}).ok);
yes('an oversized file is refused, never truncated', !validateFeed('asics', 'Handle,SKU,On hand (new)\n' + 'x'.repeat(MAX_BYTES), { verdict: 'PASS' }).ok);

console.log('\nUpload then read back');
const r = await putFeed(env, 'brooks', csv, { verdict: 'BLOCKED', file: 'brooks-fullcatalog-x.csv', reasons: ['NO BASELINE'], rows: 1, styles: 1 });
yes('stored', r.status === 200 && r.body.feed.verdict === 'BLOCKED', r);
const m = await getFeed(env, 'brooks', false);
yes('the meta comes back without the file', m.status === 200 && m.body.feed.file === 'brooks-fullcatalog-x.csv' && m.body.feed.reasons[0] === 'NO BASELINE' && !m.raw, m);
const f = await getFeed(env, 'brooks', true);
yes('the CSV comes back byte for byte', f.raw === csv);
yes('a brand with no file yet answers 404', (await getFeed(env, 'asics', false)).status === 404);

console.log('\nStripped workbooks: gzip, .xlsx, and the uploader says wholesale is gone');
const { gzipSync } = await import('node:zlib');
const gz = new Uint8Array(gzipSync(Buffer.from('PK fake workbook bytes')));
const okMeta = { verdict: 'PASS', file: 'Master ATS nightly-x.xlsx', wholesaleStripped: true, rows: 10 };
yes('a stripped workbook for an Excel brand passes', validateWorkbook('puma', gz, okMeta).ok);
yes('NOT saying it was stripped is refused', !validateWorkbook('puma', gz, { ...okMeta, wholesaleStripped: undefined }).ok);
yes('"stripped": "yes" as a string is refused (must be true)', !validateWorkbook('puma', gz, { ...okMeta, wholesaleStripped: 'yes' }).ok);
yes('raw, ungzipped bytes are refused', !validateWorkbook('puma', new Uint8Array(Buffer.from('PK raw')), okMeta).ok);
yes('a workbook for a CSV brand is refused', !validateWorkbook('asics', gz, okMeta).ok);
yes('a CSV for a workbook brand is refused', !validateFeed('saucony', csv, { verdict: 'PASS' }).ok);
yes('a non .xlsx name is refused', !validateWorkbook('altra', gz, { ...okMeta, file: 'x.csv' }).ok);
const pw = await putFeed(env, 'newbalance', gz, okMeta);
yes('stored', pw.status === 200 && pw.body.feed.format === 'xlsx' && pw.body.feed.wholesaleStripped === true, pw);
const back = await getFeed(env, 'newbalance', 'file');
yes('the workbook comes back byte for byte, as gzip', back.type === 'application/gzip' && Buffer.from(back.raw).equals(Buffer.from(gz)));
yes('the meta alone does not carry the file', (await getFeed(env, 'newbalance')).body.feed.file === 'Master ATS nightly-x.xlsx');

console.log('\nON images file: ON only, the on-images shape');
const img = JSON.stringify({ kind: 'on-images', map: { '3MF10125167': ['https://example.com/a.png'] } });
yes('stored for ON', (await putImages(env, 'on', img)).status === 200);
yes('refused for another brand', (await putImages(env, 'brooks', img)).status === 400);
yes('refused when it is not the on-images shape', (await putImages(env, 'on', '{"kind":"other","map":{}}')).status === 400);
await putFeed(env, 'on', csv.replace('ghost-18', 'on-cloud'), { verdict: 'PASS', file: 'on-running-inventory-1.csv' });
const im = await getFeed(env, 'on', 'images');
yes('comes back beside the CSV', im.status === 200 && JSON.parse(im.raw).kind === 'on-images');

console.log('\nHOKA report links: Deckers\' own report bucket only');
// A MADE UP link of the real shape. A real one opens without a login and the
// file carries wholesale prices, so a real link must never land in this
// public repo.
const real = 'https://s3.us-west-2.amazonaws.com/us.assets.b2b.deckers.com/company_99/DynamicReports/Fall%202099_EXAMPLE%20STORE__ATS_Report_1000000000000.xlsx';
yes('a link of the emailed shape passes', validateLink('hoka', real).ok);
yes('another host is refused', !validateLink('hoka', real.replace('s3.us-west-2.amazonaws.com', 'evil.example.com')).ok);
yes('another bucket is refused', !validateLink('hoka', real.replace('us.assets.b2b.deckers.com', 'someone-else')).ok);
yes('plain http is refused', !validateLink('hoka', real.replace('https:', 'http:')).ok);
yes('a query string is refused', !validateLink('hoka', real + '?x=1').ok);
yes('a report that is not an ATS report is refused', !validateLink('hoka', real.replace('ATS_Report', 'Order_Report')).ok);
yes('a non-xlsx is refused', !validateLink('hoka', real.replace(/\.xlsx$/, '.exe')).ok);
yes('another brand is refused', !validateLink('asics', real).ok);
const p1 = await putLink(env, 'hoka', real, { subject: 'Fall 2099 ATS Report', emailedAt: '2099-01-01T00:00:00Z' });
yes('stored', p1.status === 200 && p1.body.link.url === real, p1);
yes('the same link twice is not stored twice', (await putLink(env, 'hoka', real)).body.duplicate === true);
const newer = real.replace('1000000000000', '1000000000001');
await putLink(env, 'hoka', newer);
const got = await getLinks(env, 'hoka');
yes('newest first', got.body.links.length === 2 && got.body.links[0].url === newer && got.body.links[1].subject === 'Fall 2099 ATS Report', got.body);
yes('a bad link is refused, not stored', (await putLink(env, 'hoka', 'https://example.com/x.xlsx')).status === 400 && (await getLinks(env, 'hoka')).body.links.length === 2);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
