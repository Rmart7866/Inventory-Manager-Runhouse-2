// "From Drive" on the team stores staff page (owner, 2026-11-24).
//
// The team logo folder is private Google Drive, so the Worker cannot read it
// itself. tools/team-drive-picker.gs runs as a web app INSIDE the Google
// account that can see the folder, read only and scoped to that one folder,
// and this route is the only thing that calls it: staff (write secret) ->
// here -> the script, with DRIVE_KEY. The key never reaches the browser.
//
// GET /team-requests/drive?action=list[&folder=<id>]
//                          ?action=search&q=<words>
//                          ?action=thumb&id=<file id>
//                          ?action=file&id=<file id>
// Each answers the script's JSON unchanged: a file arrives as base64, which
// the page turns into a File and uploads through the normal logo route.

const ACTIONS = new Set(['list', 'search', 'thumb', 'file']);
// Measured 2026-11-24: a search through the script took 4 to 17 s and each
// thumbnail 2 to 6 s, so answers are kept in the Worker's cache: a search or
// a folder for 10 minutes (a new logo shows up within that), a file or its
// preview for a day (a logo's file id changes when it is replaced).
const KEEP = { search: 600, list: 600, thumb: 86400, file: 86400 };
const ID_RE = /^[A-Za-z0-9_-]{10,80}$/;

export async function handleDrive(request, env) {
  if (!env.DRIVE_SCRIPT_URL || !env.DRIVE_KEY) {
    return { status: 503, body: { error: 'The Drive picker is not set up yet: the Worker needs DRIVE_SCRIPT_URL and DRIVE_KEY.' } };
  }
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || 'list';
  if (!ACTIONS.has(action)) return { status: 400, body: { error: 'Unknown action' } };
  const p = new URLSearchParams({ action, key: env.DRIVE_KEY });
  if (action === 'list') {
    const folder = url.searchParams.get('folder');
    if (folder) { if (!ID_RE.test(folder)) return { status: 400, body: { error: 'Bad folder id' } }; p.set('folder', folder); }
  } else if (action === 'search') {
    const q = String(url.searchParams.get('q') || '').trim().slice(0, 60);
    if (q.length < 2) return { status: 400, body: { error: 'Type at least two letters' } };
    p.set('q', q);
  } else {
    const id = url.searchParams.get('id') || '';
    if (!ID_RE.test(id)) return { status: 400, body: { error: 'Bad file id' } };
    p.set('id', id);
  }
  // The cache key leaves the DRIVE_KEY out, so it is never stored anywhere.
  const shown = new URLSearchParams(p); shown.delete('key');
  const cacheKey = new Request('https://team-drive.cache/' + action + '?' + shown.toString());
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache && url.searchParams.get('fresh') !== '1') {
    const hit = await cache.match(cacheKey);
    if (hit) { try { return { body: await hit.json() }; } catch { /* a broken entry is fetched again */ } }
  }
  let res;
  try {
    // Apps Script answers with a redirect to googleusercontent.com; fetch follows it.
    res = await fetch(env.DRIVE_SCRIPT_URL + '?' + p.toString(), { redirect: 'follow' });
  } catch (e) {
    return { status: 502, body: { error: 'Could not reach the Drive script: ' + String(e.message || e).slice(0, 120) } };
  }
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch {
    // A Google sign-in page instead of JSON means the deployment is not "Anyone".
    return { status: 502, body: { error: 'The Drive script did not answer with data (HTTP ' + res.status + '). Check it is deployed as a web app with access "Anyone".' } };
  }
  if (j && j.error) {
    return j.error === 'not allowed'
      ? { status: 502, body: { error: 'The Drive script refused the Worker key: DRIVE_KEY differs from the script property.' } }
      : { status: 400, body: { error: j.error } };
  }
  if (cache) {
    await cache.put(cacheKey, new Response(JSON.stringify(j), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=' + KEEP[action] } }));
  }
  return { body: j };
}
