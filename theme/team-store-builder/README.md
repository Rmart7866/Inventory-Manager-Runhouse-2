# The Team Store Builder, as theme files

The Build Your Team Store page, moved out of a Shopify page body and into
the theme, and restyled to the storefront's own design language.

Live at `/pages/build-your-store`. Draft theme **168562360575**,
"team store builder". The theme id is written here only to say which one
the work was done on: **every tool resolves a theme by ROLE or by name,
never by a hardcoded id**, because ids on this shop change.

## Where it used to live, and why that was a problem

All 112KB of it sat in the `body_html` field of page `167233192191`. A
page body is **global**: it belongs to the shop, not to a theme, the same
way a menu does. So there was no way to change the builder without
changing the live site in the same instant, no way to preview a change,
and no copy of it anywhere. It was also one accidental save in the
admin's Rich Text mode away from being destroyed.

`original-page-body.html` is that field, exactly as it was on
2026-11-03, kept as the backup that did not previously exist.

## The three files

| file | what it is |
|---|---|
| `snippets/team-store-builder.liquid` | the markup and the app, verbatim, wrapped in `raw` |
| `assets/trh-builder.css` | the builder's original stylesheet, then the restyle |
| `sections/main-page.liquid` | renders the builder when the handle matches |
| `sections/team-stores-search.liquid` | the Team Stores page, with the builder link added to its CTA |

`assets/_override-only.css` is the restyle on its own. It is NOT uploaded
and nothing reads it. It is the tail of `trh-builder.css`, split out so
the restyle can be read and reviewed without scrolling past 28KB of the
original.

## Why a handle check and not a template suffix

The conventional way to give one page its own markup is
`templates/page.build-your-store.json`, selected by the template suffix
on the page record. That is deliberately not used, because **the template
suffix is a property of the PAGE, which is global**. Setting it would
make every theme look for that template, live included, and live does not
have it, so the page would break the moment the suffix was set and long
before this theme was published.

A handle check inside `main-page.liquid` keeps the entire change inside
the theme. The page record is untouched, live still renders the page
body, this theme renders the files. Publishing is what swaps them, and
the check keeps working afterwards, so it is not a temporary hack.

The `else` branch is byte-identical to the original section, so every
other page on the site renders exactly as before.

## The restyle: read the page, not the config

**The first version of this restyle was wrong, and the reason is worth
keeping.** It took its values from `config/settings_data.json`, squared
all 63 radius rules because `button_style` says `square`, uppercased
every heading because `type_header_capitalize` says `true`, and warmed
the borders to the `#e8e8e1` of `color_borders`. The result looked LESS
like the storefront, not more.

`settings_data.json` is the Impulse theme's own configuration. This store
layers custom CSS over it (`clean-product-card.css`,
`collection-filters.css` and others), so the settings describe a site
that is not the site. Counted off a live collection page 2026-11-03:

| | the config says | the page actually renders |
|---|---|---|
| radius | `square` | 8px x49, 6px x39, 16px x26, 10px, 3px, 2px |
| rule colour | `#e8e8e1` | `#e2e8f0` x45, against `#e8e8e1` x9 |
| h1 | capitalize true | `text-transform: none`, Chivo 400, centred |
| accent | one orange | `#4f7fff` blue x10, `#1b2d5a` navy, orange |
| input | plain | a `rgba(44,82,130,.06)` navy wash |

So the tokens here are MEASURED. If the storefront is redesigned, measure
it again rather than reading the settings file.

**And uniformity is itself the thing that reads as machine made.** The
tells are well documented: a wall of identical cards, the same padding
and the same radius on everything, even spacing, no focal point. Squaring
every corner did not fix that, it made it worse, because it removed the
last variation the page had. The current file gives panels, cards, pills
and inputs four DIFFERENT radii, on the scale the site itself uses.

The structural fix matters more than the colours:

- **The card soup is gone.** The page nested bordered boxes three deep,
  a card holding a panel holding a tile, each with its own 1px outline,
  so everything carried equal weight and nothing led. The storefront's
  own product cards have NO border, they sit on whitespace. Outlines
  came off the containers; only things you can click keep one.
- **Headings stopped shouting.** Title case, in the navy the site uses
  for headings, because a form with twelve uppercase tracked-out labels
  has twelve competing headlines.
- **One accent.** `.btn.or` keeps the orange because it marks the action
  the page exists to get. The POPULAR badges and the per-line Remove
  links that were wearing the same orange do not.

## Everything is comfortably clickable

44px minimum, audited by HIT TESTING rather than by reading box heights,
because the two differ here: a bundle swatch has a 22px box and a 44px
tap area, since the target is a transparent pseudo-element over it.
Measuring boxes alone reported 84 controls as too small when most were
already fine.

What genuinely was too small and now is not: the colour name chips at
30px, "Add team colors" at 17px, the step indicators at 28px (they are
clickable, they move between steps), and the FAQ link. Prose links
inside a sentence are deliberately left alone, since padding them out
would overlap the lines above and below for no real gain.

Also added: `:focus-visible` rings, which the original had none of, and
`cursor: pointer` on the several controls that were divs and spans with
click handlers and therefore gave no pointer at all.

## Three bugs this restyle caused, and how they were caught

All three were found by reading computed styles back off the rendered
page, not by reviewing the CSS.

1. **`.howv` went white on white.** The "stop the card soup" rule
   stripped backgrounds from things that looked like containers, and
   `.howv` is named like a panel but IS the dark "Watch how it works"
   button. Contrast ratio 1.0. Anything that strips a background has to
   be checked against what the element DOES, not what its class suggests.
2. **Selected controls went navy on navy.** The mode buttons hold a `b`
   and a `span` that set their own colour, which beat the white
   inherited from the selected parent. Also 1.0.
3. **The `Or` chip went navy on navy**, and this one could not be fixed
   the same way: the markup emits
   `span class="opt" style="background:var(--navy)"`, and an inline style
   beats a stylesheet. 175 elements here carry an inline style, but
   nearly all are DATA rather than design, the real garment colours
   behind each swatch and the product images. Those must never be
   touched. `.opt` was the exception.

A contrast sweep over every leaf node now reports **0 failures under
3:1**, having composited the alpha properly: an `rgba(44,82,130,.06)`
tint over white is effectively white, and a checker that treats it as
opaque navy reports a page full of failures that are not real.

## Density, which was the real complaint

"Tough on the eyes, a lot going on." That is not a colour problem, which
is why the colour work did not fix it. Measured:

| | before | after |
|---|---|---|
| distinct type combinations | 26 | tighter, 13px carries 246 of 405 nodes |
| text nodes under 13px | 243 | 76 |
| top-level bands before any product | 9 | 6 on steps 2 and 3 |

Three things did most of it.

**The page showed the same three steps twice.** `.how` explains them and
`.steps` is the rail you navigate them with, sitting directly below. On
the first screen the explainer earns its place. After that it was 76px
of repetition above everything you were trying to work with, on every
step. It is now conditional on step one being active, via `:has()`, and
so are the hero pitch and the perks row, since someone picking products
has already bought in.

**Instructions repeated per card.** "Tap a color to add it" printed on
EVERY product card, fourteen times down one screen, under a heading that
already says it. "Team colors" labelled every swatch row. Instructions
that repeat per card stop being instructions and become texture.

**A floor of 13px.** Six sizes crammed between 10px and 12px read as
noise rather than hierarchy. Nothing on this page is so unimportant that
it should be hard to read.

**A warning about the first attempt at this**, since the same mistake is
easy to repeat: it targeted class names that sound right and do not
exist here, `.fine`, `.note`, `.muted`, `.hint`, `.sub`, `.bhead`. The
CSS was valid, deployed cleanly and changed almost nothing, while
appearing to work. The selectors in this file were found by walking the
RENDERED page and counting what actually carries small text. Check a
selector matches something before trusting a rule built on it.

The bundle cards were the last of the card soup: five bordered boxes in
a grid, each holding four more bordered thumbnails. They lose the
outline, which returns on hover where it means "this one" rather than
sitting on all five at once.

## What has NOT been verified

**Mobile.** The breakpoints exist in the builder's own stylesheet, 640px,
700px and 820px, and there is no horizontal overflow at desktop width,
but the browser window would not resize during this work so no narrow
viewport was ever rendered. Check it on a real phone before publishing.

## Its other dependencies, which are NOT in the theme

- `trh-builder-catalog-<hash>.json`, about 345KB on the Shopify CDN:
  the products, colour families and the 476 existing stores. Served
  `max-age=31557600`, a YEAR, with a content hashed filename. That is the
  right pattern, but it means an update needs a NEW filename and an edit
  to the `CURL` constant inside the snippet.
- `trh-store-logos-v3.json`, about 43KB, 217 stores, the `slurl` constant.
- Product **`team-store-logo-upload`**, variant `50868317716735`. Logo
  upload works by POSTing the file to `/cart/add.js` as a line item
  property, reading the CDN url back off the response and then zeroing
  the line. It needs that variant to stay $0.00, ACTIVE, untracked and
  purchasable. Checked 2026-11-03: it is, and it is hidden from search
  but reachable by direct url, the same posture as the Redo line item.
- Submission goes through the native Shopify **contact form**, with a
  machine readable JSON blob fenced by `TRHSB` markers in the body, and
  the captcha bootstrap scraped out of `/pages/contact`.

## Deploying

```sh
node tools/read-theme-asset.mjs  <key> --theme "team store builder"
node tools/write-theme-asset.mjs --theme "team store builder" <key> --from <file>
node tools/write-theme-asset.mjs --theme "team store builder" <key> --restore <backup>
```

The writer **refuses the live theme** unless `--force`, backs the old
value up to `theme-backups/` first, and re-reads to confirm. It retries
that re-read, because the assets endpoint is read-after-write
inconsistent and a GET straight after the PUT can still serve the old
value, which made an earlier version report a confident mismatch on a
write that had in fact succeeded.

**There are two logo upload systems on this store and they are
unrelated.** This one uses the Shopify cart. The LA singlets use
**Cloudinary**, hardcoded in `snippets/product-form.liquid` behind two
handle allowlists that have drifted. Do not assume a fix to one reaches
the other.
