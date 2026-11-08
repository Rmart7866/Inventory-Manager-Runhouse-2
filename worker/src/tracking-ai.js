// tracking-ai.js, The Run House. A second opinion on every shipping email,
// for measuring the tracking reader's accuracy during the dry run.
//
// The rules in tracking.js decide; Claude never does. For each email Claude
// reads it independently (PO, tracking, carrier, brand, what shipped) and
// judges whether the rules' plan is right for that order's open Needham
// items. Where the two readings differ, the item is flagged on the tracking
// page so a person looks at exactly the cases the rules may have wrong. It
// writes nothing to Shopify and changes no decision.
//
// What Claude is sent: the email as received (it can carry the customer's
// name and address; Anthropic's API is the processor) and the order's open
// Needham items as brand, product title and quantity. No order history, no
// email address, no phone. Without ANTHROPIC_API_KEY set this is skipped
// and everything else works exactly the same.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import Anthropic from '@anthropic-ai/sdk';
import { vendorKey } from './tracking.js';

export const MODEL = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_shipping_notice', 'pos', 'tracking', 'brand', 'shipped_items', 'verdict', 'verdict_reason'],
  properties: {
    is_shipping_notice: { type: 'boolean' },
    pos: { type: 'array', items: { type: 'string' } },
    tracking: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['number', 'carrier'],
        properties: { number: { type: 'string' }, carrier: { type: 'string' } },
      },
    },
    brand: { type: 'string' },
    shipped_items: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', enum: ['agree', 'disagree', 'unsure'] },
    verdict_reason: { type: 'string' },
  },
};

const SYSTEM = `You check an automated reader of supplier shipping emails for a running shoe shop. Suppliers ship dropship orders straight to customers and email the shop a shipping confirmation. The shop's PO for an order is "<order number>_<customer last name>", for example 93307_Smith.

Read the email yourself and report:
- is_shipping_notice: true only if it confirms that goods shipped.
- pos: every PO in the email, written exactly as order number, underscore, last name.
- tracking: every tracking number for this shipment, digits and letters only, with the carrier (UPS, FedEx, USPS, DHL, OnTrac, or "unknown"). A product UPC, style code, order or invoice number is not a tracking number.
- brand: the shoe brand that sent it, or "" if you cannot tell.
- shipped_items: the items the email says shipped, in short words, or [] if it does not list them.

Then judge the plan you are given: the automated reader will mark the listed order lines as shipped with those tracking numbers, which emails the customer. Say "agree" if that is exactly right for this email, "disagree" if anything is wrong (a different order, a tracking number that is not this shipment's, items the email does not cover, items it covers that the plan leaves out, a partial shipment treated as complete), or "unsure" if the email does not say enough to tell. When the reader sent the email for human review instead, "agree" means a person really is needed and "disagree" means the email was clear enough to act on. verdict_reason: one or two plain sentences for shop staff.`;

// The user turn: the email, then the order's open items and the plan.
export function buildPrompt(email, order, plan, needhamId) {
  const open = [];
  for (const fo of (order && order.fulfillmentOrders) || []) {
    if (!['OPEN', 'IN_PROGRESS'].includes(fo.status)) continue;
    if (!fo.assignedLocation || !fo.assignedLocation.location || fo.assignedLocation.location.id !== needhamId) continue;
    for (const l of fo.lineItems || []) if (l.remainingQuantity > 0) open.push(l.lineItem.vendor + ' | ' + l.lineItem.title + ' | qty ' + l.remainingQuantity);
  }
  const picked = (plan.groups || []).flatMap((g) => g.lines.map((l) => l.vendor + ' | ' + l.title + ' | qty ' + l.qty));
  return [
    '<email>',
    'From: ' + String(email.from || '').slice(0, 200),
    'Subject: ' + String(email.subject || '').slice(0, 300),
    '',
    String(email.body || '').slice(0, 30000),
    '</email>',
    '',
    '<order>',
    order ? 'Order ' + order.name + (order.cancelledAt ? ' (cancelled)' : '') : 'No order was found for the PO.',
    'Items still waiting to ship from the dropship location:',
    open.length ? open.map((x) => '- ' + x).join('\n') : '- none',
    '</order>',
    '',
    '<plan>',
    plan.status === 'ready'
      ? 'Mark these lines shipped:\n' + picked.map((x) => '- ' + x).join('\n')
      : plan.status === 'already' ? 'Do nothing: ' + plan.reason
        : 'Send to a person instead: ' + plan.reason,
    '</plan>',
  ].join('\n');
}

const up = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

// Where Claude's reading and the rules' reading differ. Pure, so the test
// drives it. Returns { agree, diffs: [plain sentences] }.
export function compareAi(parsed, plan, ai) {
  const diffs = [];
  const rp = new Set(parsed.pos.map((p) => p.order + '_' + p.last.toLowerCase()));
  const ap = new Set((ai.pos || []).map((p) => { const m = /^(\d+)_(.+)$/.exec(String(p).trim()); return m ? m[1] + '_' + m[2].toLowerCase() : String(p).toLowerCase(); }));
  if (rp.size !== ap.size || [...rp].some((p) => !ap.has(p))) diffs.push('PO: rules read ' + ([...rp].join(', ') || 'none') + ', AI read ' + ([...ap].join(', ') || 'none'));
  const rt = new Set(parsed.tracking.map((t) => up(t.number)));
  const at = new Set((ai.tracking || []).map((t) => up(t.number)).filter(Boolean));
  if (rt.size !== at.size || [...rt].some((t) => !at.has(t))) diffs.push('Tracking: rules read ' + ([...rt].join(', ') || 'none') + ', AI read ' + ([...at].join(', ') || 'none'));
  if (parsed.brand && ai.brand && vendorKey(ai.brand) !== parsed.brand) diffs.push('Brand: rules read ' + parsed.brand + ', AI read ' + ai.brand);
  if (ai.is_shipping_notice === false) diffs.push('AI says this is not a shipping confirmation');
  if (ai.verdict === 'disagree') diffs.push('AI disagrees with the plan: ' + ai.verdict_reason);
  if (ai.verdict === 'unsure') diffs.push('AI unsure: ' + ai.verdict_reason);
  return { agree: diffs.length === 0, diffs };
}

// One call. Returns the AI reading plus the comparison, or { error }.
export async function aiReview(env, email, order, plan, parsed) {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const r = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // A declined request is re-run on Anthropic's recommended fallback
      // model rather than returned empty.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(email, order, plan, env.NEEDHAM_LOCATION_ID) }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });
    if (r.stop_reason === 'refusal') return { error: 'The AI declined to read this email' };
    const text = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const ai = JSON.parse(text);
    return { ...ai, model: r.model || MODEL, ...compareAi(parsed, plan, ai) };
  } catch (e) {
    return { error: 'AI check failed: ' + String(e && e.message || e).slice(0, 200) };
  }
}
