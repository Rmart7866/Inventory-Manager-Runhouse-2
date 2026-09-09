// tag-groups.js, Worker port. The Run House.
//
// PORTED SUBSET of the Color Swatch tag-groups.js. That file is a CLI that both
// computes the cw-group: tag AND writes tags to Shopify. The Worker must only
// ever COMPUTE the tag, so this port carries the two pure functions (slug and
// groupTagFor) and deliberately drops the CLI, the product fetch, and the
// tagsAdd / tagsRemove mutations. Nothing here can write to Shopify.
//
// slug() and groupTagFor() below are byte-for-byte the originals. `npm run
// parity` re-checks that by running both implementations over a corpus of live
// titles and failing on any divergence. The brief's non-negotiable is that the
// tag the tool writes is the tag the storefront grid groups on, so if you edit
// the tag rule, edit it in the Color Swatch file and re-run parity.
//
// House style: no em dashes. Use commas, periods, or the word "to".

import { widthClass } from './group.js';

const TAG_PREFIX = 'cw-group:';

// Slugify a string into a Shopify-tag-safe token: lowercase, alphanumerics and
// dashes only. Deterministic, so the same model always yields the same tag.
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The group identity, model + gender + width class, mirrors the PDP swatch row.
function groupTagFor(parsed) {
  const model = slug(parsed.modelKey);
  const wclass = widthClass(parsed.width, parsed.gender);
  if (!model) return null;
  return `${TAG_PREFIX}${model}--${wclass}`;
}

export { slug, groupTagFor, TAG_PREFIX };
