// bulk.js, The Run House.
//
// Shopify Bulk Operations. A normal paginated query of the whole catalog plus
// every Needham inventory level is ~250 throttled requests and 7+ minutes, which
// times out the rebuild. A bulk operation runs that same query server-side with
// no throttle and hands back a single JSONL file, in a couple of minutes.
//
// Two steps: runBulkQuery submits the query and polls to completion, returning a
// download URL. streamJsonl downloads and parses that file LINE BY LINE, never
// holding the whole thing (the file is ~120 MB, the Worker has 128 MB), calling
// back once per object.
//
// House style: no em dashes. Use commas, periods, or the word "to".

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Submit a bulk query, cancel any op already in flight (only one runs per app at
// a time), and poll until it completes. Returns the result file URL, or null if
// the operation completed with no results.
export async function runBulkQuery(client, query, opts = {}) {
  const pollMs = opts.pollMs || 5000;
  const maxWaitMs = opts.maxWaitMs || 12 * 60 * 1000;

  // Clear any in-flight op left by a prior run, or the submit is rejected.
  const cur = await client.graphql(`{ currentBulkOperation(type: QUERY) { id status } }`);
  const existing = cur.data?.currentBulkOperation;
  if (existing && (existing.status === 'RUNNING' || existing.status === 'CREATED')) {
    await client.graphql(
      `mutation($id: ID!) { bulkOperationCancel(id: $id) { userErrors { message } } }`,
      { id: existing.id }
    );
    for (let i = 0; i < 15; i++) {
      await sleep(2000);
      const c = await client.graphql(`{ currentBulkOperation(type: QUERY) { status } }`);
      const s = c.data?.currentBulkOperation?.status;
      if (s !== 'CANCELING' && s !== 'RUNNING' && s !== 'CREATED') break;
    }
  }

  const sub = await client.graphql(
    `mutation($q: String!) {
      bulkOperationRunQuery(query: $q) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }`,
    { q: query }
  );
  const ue = sub.data?.bulkOperationRunQuery?.userErrors || [];
  if (ue.length) throw new Error('bulk submit rejected: ' + JSON.stringify(ue));

  const started = Date.now();
  for (;;) {
    await sleep(pollMs);
    const st = await client.graphql(`{ currentBulkOperation(type: QUERY) { status objectCount errorCode url } }`);
    const op = st.data.currentBulkOperation;
    if (op.status === 'COMPLETED') return op.url || null;
    if (op.status === 'FAILED') throw new Error('bulk operation failed: ' + (op.errorCode || 'unknown'));
    if (op.status === 'CANCELED') throw new Error('bulk operation was canceled');
    if (Date.now() - started > maxWaitMs) throw new Error('bulk operation timed out');
  }
}

// Download a bulk result file and parse it one JSONL object at a time. Streams
// the body so memory stays bounded regardless of file size. onObject is called
// once per parsed object, in the file's order (parents before their children).
export async function streamJsonl(url, onObject) {
  if (!url) return; // empty result set
  const res = await fetch(url);
  if (!res.ok) throw new Error('bulk result download failed: HTTP ' + res.status);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line) onObject(JSON.parse(line));
    }
  }
  const last = buffer.trim();
  if (last) onObject(JSON.parse(last));
}
