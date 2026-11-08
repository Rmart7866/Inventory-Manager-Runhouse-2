// The tracking dry run's accuracy checks: the AI second opinion and the
// comparison with what staff actually did. No network: the Claude call runs
// against a stubbed fetch, so the request shape is checked without a key.
import { compareAi, buildPrompt, aiReview, MODEL } from '../src/tracking-ai.js';
import { parseShipEmail, decide, truthOf } from '../src/tracking.js';

let failures = 0;
const check = (name, ok) => { console.log((ok ? '  ok    ' : '  FAIL  ') + name); if (!ok) failures++; };
const NEEDHAM = 'gid://shopify/Location/77957136639';

const email = { from: 'HOKA <noreply@hoka.com>', subject: 'Shipped', body: 'PO Number: 93307_Smith\nTracking Number: 1Z999AA10123456784' };
const parsed = parseShipEmail(email);
const order = { id: 'gid://shopify/Order/1', name: '#93307', shippingAddress: { lastName: 'Smith' }, fulfillments: [],
  fulfillmentOrders: [{ id: 'FO1', status: 'OPEN', assignedLocation: { location: { id: NEEDHAM } }, lineItems: [
    { id: 'a', remainingQuantity: 1, lineItem: { vendor: 'HOKA', title: 'Clifton 10 - Black / 9' } },
    { id: 'b', remainingQuantity: 1, lineItem: { vendor: 'Brooks', title: 'Ghost 16 - Blue / 8' } }] }] };
const plan = decide(parsed, order, NEEDHAM);

console.log('\nComparing the two readings');
const same = { is_shipping_notice: true, pos: ['93307_SMITH'], tracking: [{ number: '1z999aa1 0123456784', carrier: 'UPS' }], brand: 'Hoka', shipped_items: ['Clifton 10'], verdict: 'agree', verdict_reason: 'Matches.' };
check('the same PO, tracking and brand, spelt differently, agree', compareAi(parsed, plan, same).agree);
check('a different tracking number is a difference', !compareAi(parsed, plan, { ...same, tracking: [{ number: '1Z999AA10123456785', carrier: 'UPS' }] }).agree);
check('a missed PO is a difference', /PO/.test(compareAi(parsed, plan, { ...same, pos: [] }).diffs[0]));
check('the AI disagreeing with the plan is a difference, with its reason', /partial/.test(compareAi(parsed, plan, { ...same, verdict: 'disagree', verdict_reason: 'Only a partial shipment.' }).diffs.join()));
check('not a shipping notice is a difference', !compareAi(parsed, plan, { ...same, is_shipping_notice: false }).agree);

console.log('\nWhat Claude is shown');
const prompt = buildPrompt(email, order, plan, NEEDHAM);
check('the email, the open items and the plan', prompt.includes('93307_Smith') && prompt.includes('Brooks | Ghost 16') && /Mark these lines shipped:\n- HOKA \| Clifton 10/.test(prompt));
check('a review plan says it was sent to a person', /Send to a person instead/.test(buildPrompt(email, null, decide(parsed, null, NEEDHAM), NEEDHAM)));

console.log('\nThe request');
check('no key, no call, nothing else changes', (await aiReview({}, email, order, plan, parsed)) === null);
let sent = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  sent = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
  return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(same) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const r = await aiReview({ ANTHROPIC_API_KEY: 'test-key-not-real', NEEDHAM_LOCATION_ID: NEEDHAM }, email, order, plan, parsed);
globalThis.fetch = realFetch;
check('goes to the Messages API with the key', /\/v1\/messages/.test(sent.url) && (sent.headers.get('x-api-key') === 'test-key-not-real' || sent.headers.get('authorization') === 'Bearer test-key-not-real'));
check('current model, structured output, fallback on', sent.body.model === 'claude-opus-5-5' && sent.body.output_config.format.type === 'json_schema' && sent.body.fallbacks === 'default' && /server-side-fallback-2026-07-01/.test(sent.headers.get('anthropic-beta')));
check('no thinking or sampling settings the model rejects', !('thinking' in sent.body) && !('temperature' in sent.body));
check('the answer comes back compared', r.agree === true && r.verdict === 'agree');

console.log('\nWhat staff actually did');
const ev = { at: new Date().toISOString(), status: 'ready', parsed, groups: plan.groups };
const F = (num, vendor) => ({ trackingInfo: [{ number: num }], fulfillmentLineItems: { nodes: [{ quantity: 1, lineItem: { id: 'x', vendor } }] } });
check('same tracking on the same brand: match', truthOf(ev, { fulfillments: [F('1Z999AA10123456784', 'HOKA')] }).r === 'match');
check('same tracking on another brand: other-items', truthOf(ev, { fulfillments: [F('1Z999AA10123456784', 'Brooks')] }).r === 'other-items');
check('the planned brand shipped with another number: other-tracking', truthOf(ev, { fulfillments: [F('1Z000', 'HOKA')] }).r === 'other-tracking');
check('not shipped yet: ask again later', truthOf(ev, { fulfillments: [] }) === null);
check('review, then staff used it: added-anyway', truthOf({ ...ev, status: 'review' }, { fulfillments: [F('1Z999AA10123456784', 'HOKA')] }).r === 'added-anyway');
check('review and untouched for a week: left-alone', truthOf({ ...ev, status: 'review', at: new Date(Date.now() - 8 * 86400e3).toISOString() }, { fulfillments: [] }).r === 'left-alone');

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
