// audit-cw-tags.mjs, The Run House. READ ONLY.
//
// Finds products whose cw-group: tag disagrees with the group they actually
// belong to. That happens when a product was created by the Inventory Manager
// before the gender fix in catalog-client.js: the inheritance index was keyed
// without gender, so a new Women's colorway of a Hoka model could inherit the
// MEN'S sibling's tags, including its cw-group. The storefront swatch row groups
// on that tag, so a mistagged product shows up in the wrong gender's swatches.
//
// This script only READS. It computes what each product's tag should be using
// the Worker's own parsers.js + tag-groups.js, so the answer is the exact tag
// the pipeline would stamp, and writes a report. Nothing is sent to Shopify
// beyond the paged product query. Repairing is a separate, explicit step.
//
// Run:  node tools/audit-cw-tags.mjs [--out report.json] [--limit N]
// Creds come from worker/.dev.vars (gitignored). Needs read_products only.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShopifyClient, throttleOf } from '../worker/src/shopify.js';
import { parseProduct, brandFor } from '../worker/src/parsers.js';
import { groupTagFor, TAG_PREFIX } from '../worker/src/tag-groups.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// worker/.dev.vars is a dotenv file. Parse it into the env shape the Worker
// client expects. It is gitignored, so this never runs off committed secrets.
function loadDevVars() {
  const p = path.join(ROOT, 'worker', '.dev.vars');
  if (!fs.existsSync(p)) throw new Error('worker/.dev.vars not found, cannot authenticate');
  const env = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  // wrangler.toml [vars] are not in .dev.vars, so supply the non-secret ones.
  env.SHOP_URL = env.SHOP_URL || 'therunhouse.myshopify.com';
  env.API_VERSION = env.API_VERSION || '2026-01';
  return env;
}

// Every status, on purpose. Products the tool creates land as DRAFT and are
// published later, so the mistagged ones are exactly the ones a status:active
// filter would miss.
const QUERY = `
query($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title vendor productType status tags
      variants(first: 1) { nodes { sku } }
    }
  }
}`;

async function fetchFootwear(client, limit) {
  const out = [];
  let cursor = null;
  let pages = 0;
  for (;;) {
    const body = await client.graphql(QUERY, { cursor });
    const conn = body.data.products;
    pages++;
    for (const n of conn.nodes) {
      if (!/shoes$/i.test(n.productType || '')) continue; // footwear only
      out.push(n);
    }
    if (pages % 10 === 0) process.stderr.write(`  ...${pages} pages, ${out.length} footwear\n`);
    if (limit && out.length >= limit) break;
    const t = throttleOf(body);
    if (t && t.currentlyAvailable < t.maximumAvailable * 0.2) {
      await sleep(Math.ceil((t.maximumAvailable * 0.5) / t.restoreRate * 1000));
    }
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return out;
}

function main(argv) {
  const outArg = argv.indexOf('--out');
  const outPath = outArg >= 0 ? argv[outArg + 1] : path.join(ROOT, 'cw-tag-audit.json');
  const limArg = argv.indexOf('--limit');
  const limit = limArg >= 0 ? parseInt(argv[limArg + 1], 10) : 0;

  const client = createShopifyClient(loadDevVars());
  process.stderr.write('Fetching products (all statuses, footwear only)...\n');

  return fetchFootwear(client, limit).then((nodes) => {
    const buckets = { ok: [], wrong: [], missing: [], extra: [], unparsed: [], noGender: [] };

    for (const n of nodes) {
      const sku = (n.variants?.nodes || [])[0]?.sku || '';
      const parsed = parseProduct({ title: n.title, sku, vendor: n.vendor });
      const actual = (n.tags || []).filter((t) => String(t).startsWith(TAG_PREFIX));
      const row = {
        handle: n.handle, id: n.id, title: n.title, status: n.status,
        productType: n.productType, brand: brandFor(n.vendor).key,
        gender: parsed.gender, width: parsed.width,
        actual, expected: parsed.ok ? groupTagFor(parsed) : null,
      };

      if (!parsed.ok) { buckets.unparsed.push(row); continue; }

      // A title with no gender yields a GENDERLESS expected tag, which is not a
      // tag worth writing: it makes its own one-product group. Report these
      // separately, they need the TITLE fixed, not the tag.
      if (!parsed.gender) { buckets.noGender.push(row); continue; }

      if (actual.length === 0) buckets.missing.push(row);
      else if (actual.length > 1) buckets.extra.push(row);
      else if (actual[0] !== row.expected) buckets.wrong.push(row);
      else buckets.ok.push(row);
    }

    // A wrong tag is only interesting if it is wrong in a way that MOVES the
    // product, so split by whether the gender segment differs. That is the
    // signature of the inheritance bug this audit exists for.
    const genderOf = (tag) => {
      const m = String(tag || '').match(/^cw-group:(mens|womens|unisex)-/);
      return m ? m[1] : '';
    };
    for (const r of buckets.wrong) {
      r.wrongGender = genderOf(r.actual[0]) !== genderOf(r.expected);
    }

    const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
    counts.wrongGender = buckets.wrong.filter((r) => r.wrongGender).length;
    counts.footwearScanned = nodes.length;

    fs.writeFileSync(outPath, JSON.stringify({ counts, buckets }, null, 2));

    console.log('\ncw-group tag audit');
    console.log('  footwear scanned  ', counts.footwearScanned);
    console.log('  correct           ', counts.ok);
    console.log('  WRONG tag         ', counts.wrong, '(of which wrong GENDER:', counts.wrongGender + ')');
    console.log('  missing tag       ', counts.missing);
    console.log('  more than one tag ', counts.extra);
    console.log('  title has no gender', counts.noGender, '(fix the title, not the tag)');
    console.log('  title unparseable ', counts.unparsed);
    console.log('\nreport written to', outPath);

    const show = buckets.wrong.filter((r) => r.wrongGender).slice(0, 15);
    if (show.length) {
      console.log('\nwrong-gender examples:');
      for (const r of show) console.log(`  [${r.status}] ${r.handle}\n      is: ${r.actual[0]}\n      should be: ${r.expected}`);
    }
  });
}

main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
