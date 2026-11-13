// Shut a headless Chrome the runners launched so that it SAVES ITS LOGIN.
//
// Measured 2026-11-13, and it was logging both supplier profiles out. A hard
// kill (chrome.kill(), SIGTERM) ends Chrome before it writes its cookie store,
// which it does in batches. ASICS reissues b2b_sap_session on every request
// and FastTrack rotates its refresh token, so every visit that ended in a kill
// left the profile holding the PREVIOUS login, and the supplier had already
// retired it. The keep-alive meant to keep each session warm was the thing
// ending it:
//
//   ASICS   the Cookies file was last written 17:56 by the smoke test, every
//           keep-alive after that reached the dashboard and saved nothing, so
//           the 2 hour cookie on disk ran out at 19:56 and the 20:30 visit
//           landed on the login page.
//   Brooks  alive at 20:59, logged out at 21:45, the visit in between having
//           been killed a second after FastTrack refreshed its token.
//
// Reproduced on a throwaway profile against a local page: after a kill the
// profile comes back with the OLD cookie, after Browser.close with the NEW
// one. So close through the browser and wait for the process to exit; the
// kill is only the fallback for a Chrome that will not go.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {import('node:child_process').ChildProcess|null} chrome  the process WE spawned, or null
 * @param {number} port  its --remote-debugging-port
 * @param {number} [settleMs]  a moment for the page to finish storing a token it just got
 */
export async function closeChrome(chrome, port, settleMs = 2000) {
  if (!chrome || chrome.exitCode !== null) return 'none';
  const exited = new Promise((r) => chrome.once('exit', () => r(true)));
  await wait(settleMs);
  try {
    const v = await (await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(3000) })).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); setTimeout(() => j(new Error('timeout')), 3000); });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  } catch (e) { /* fall through to the kill below */ }
  const ok = await Promise.race([exited, wait(15000).then(() => false)]);
  if (ok) return 'closed';
  try { chrome.kill('SIGKILL'); } catch (e) {}
  return 'killed';
}
