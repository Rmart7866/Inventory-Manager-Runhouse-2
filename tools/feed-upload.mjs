// feed-upload.mjs, The Run House. Hands a scheduled scraper file to the
// Worker so the inventory tool can load it by itself (worker/src/feeds.js).
//
// The write secret is read from ~/.runhouse-write-secret, a file the owner
// creates once, outside the repo, readable by the owner only:
//   pbpaste > ~/.runhouse-write-secret && chmod 600 ~/.runhouse-write-secret
// (after copying the write secret). No file, no upload: the run still writes
// its CSV to Downloads and says it was not uploaded. Never fatal.
//
// House style: no em dashes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WORKER = 'https://runhouse-inventory-worker.ryan-486.workers.dev';
const CATALOG_TOKEN = 'rh-cat-9b327c9736d5d17e2794c2c3df934b36';   // public by construction, see catalog-client.js
const SECRET_FILE = path.join(os.homedir(), '.runhouse-write-secret');

export async function uploadFeed(brand, csv, meta) {
  if (!fs.existsSync(SECRET_FILE)) {
    console.log('upload   : NOT uploaded, ' + SECRET_FILE + ' does not exist (the file is still in Downloads)');
    return false;
  }
  const secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  const small = { ...meta, reasons: (meta.reasons || []).slice(0, 8).map((r) => String(r).slice(0, 200)) };
  try {
    const r = await fetch(WORKER + '/feeds/upload?brand=' + encodeURIComponent(brand) + '&meta=' + encodeURIComponent(JSON.stringify(small)), {
      method: 'POST', body: csv,
      headers: { Authorization: 'Bearer ' + CATALOG_TOKEN, 'X-Write-Secret': secret, 'Content-Type': 'text/csv' },
      signal: AbortSignal.timeout(120000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { console.log('upload   : FAILED ' + r.status + ' ' + (j.error || j.reason || '')); return false; }
    console.log('upload   : the inventory tool will load ' + (meta.file || 'this file') + ' (' + meta.verdict + ')');
    return true;
  } catch (e) { console.log('upload   : FAILED ' + e.message); return false; }
}
