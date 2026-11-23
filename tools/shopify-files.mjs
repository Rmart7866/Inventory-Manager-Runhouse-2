// shopify-files.mjs, The Run House. Upload a local file to the store's
// Content > Files and wait until Shopify reports it READY, returning its CDN
// url. Used to add a style to the team store builder catalog (its photos and
// the catalog JSON itself live in Files, served from cdn.shopify.com).
//
//   import { uploadFile } from './shopify-files.mjs';
//   const url = await uploadFile('/path/sbc-pc55-navy.jpg', 'image/jpeg');
//
// Two steps because a local file cannot be handed to Shopify directly:
// stagedUploadsCreate gives a signed upload target, the file is POSTed there,
// then fileCreate turns the uploaded resource into a File. The filename is
// kept, so the catalog can keep referencing photos as "~<filename>".
//
// House style: no em dashes. Use commas, periods, or the word "to".

import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const E = Object.fromEntries(fs.readFileSync(ROOT + 'worker/.dev.vars', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const SHOP = E.SHOP_URL.replace(/^https?:\/\//, '');
let tok = null;
async function token() {
  if (tok) return tok;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: E.CLIENT_ID, client_secret: E.CLIENT_SECRET, grant_type: 'client_credentials' }) });
  tok = (await r.json()).access_token;
  return tok;
}
export async function gql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/2026-01/graphql.json`, { method: 'POST',
    headers: { 'X-Shopify-Access-Token': await token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  return r.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function uploadFile(file, mimeType, alt) {
  const filename = path.basename(file), buf = fs.readFileSync(file);
  const isImage = /^image\//.test(mimeType);
  const st = await gql(`mutation($i:[StagedUploadInput!]!){ stagedUploadsCreate(input:$i){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ message } } }`,
    { i: [{ filename, mimeType, resource: isImage ? 'IMAGE' : 'FILE', httpMethod: 'POST', fileSize: String(buf.length) }] });
  const t = st.data && st.data.stagedUploadsCreate;
  if (!t || t.userErrors.length || !t.stagedTargets.length) throw new Error('staged upload: ' + JSON.stringify(st.errors || (t && t.userErrors)));
  const target = t.stagedTargets[0], fd = new FormData();
  for (const p of target.parameters) fd.append(p.name, p.value);
  fd.append('file', new Blob([buf], { type: mimeType }), filename);
  const up = await fetch(target.url, { method: 'POST', body: fd });
  if (!up.ok) throw new Error('upload HTTP ' + up.status);
  const fc = await gql(`mutation($f:[FileCreateInput!]!){ fileCreate(files:$f){ files{ id fileStatus } userErrors{ field message } } }`,
    { f: [{ originalSource: target.resourceUrl, contentType: isImage ? 'IMAGE' : 'FILE', filename,
      // Images carry alt text (owner, 2026-11-23): the caller's, else the
      // file name made readable ("sbb-dt665-deep-royal.jpg" -> "dt665 deep royal").
      ...(isImage ? { alt: alt || filename.replace(/\.[a-z0-9]+$/i, '').replace(/^sbb-/, '').replace(/[-_]+/g, ' ').trim() } : {}) }] });
  const c = fc.data && fc.data.fileCreate;
  if (!c || c.userErrors.length || !c.files.length) throw new Error('fileCreate: ' + JSON.stringify(fc.errors || (c && c.userErrors)));
  const id = c.files[0].id;
  // Processing is asynchronous: wait for READY and its url.
  for (let i = 0; i < 40; i++) {
    const q = await gql(`query($id:ID!){ node(id:$id){ ... on MediaImage { fileStatus image { url } } ... on GenericFile { fileStatus url } } }`, { id });
    const n = q.data && q.data.node;
    if (n && n.fileStatus === 'FAILED') throw new Error('Shopify could not process ' + filename);
    const url = n && (n.url || (n.image && n.image.url));
    if (n && n.fileStatus === 'READY' && url) return { id, url };
    await sleep(1500);
  }
  throw new Error('timed out waiting for ' + filename);
}

// Run directly: node tools/shopify-files.mjs <file> <mime>
if (process.argv[1] && process.argv[1].endsWith('shopify-files.mjs') && process.argv[2]) {
  uploadFile(process.argv[2], process.argv[3] || 'image/jpeg').then((r) => console.log(JSON.stringify(r)), (e) => { console.error(e.message); process.exit(1); });
}
