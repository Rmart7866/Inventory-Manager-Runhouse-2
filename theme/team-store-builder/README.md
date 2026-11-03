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

## The restyle is a palette remap, not a rewrite

The builder defines its own seven colour variables, and every rule in its
28KB stylesheet already reads them, so re-pointing those seven is most of
the work:

| was | now | why |
|---|---|---|
| `--navy #062D62` | `--colorTextBody` | the site sets type in #000. Navy is in the LOGO, not the type |
| `--orange #FF5724` | `--colorCartDot` | near enough to the theme accent to look like a near miss. Now it IS the accent |
| `--ink #1a1a1a` | `--colorTextBody` | off black against the theme's true black |
| `--muted #5b6472` | `#6b6b66` | a COOL grey fights a warm #e8e8e1 border |
| `--line #dde2e8` | `--colorBorder` | cool blue grey against the theme's warm rule |
| `--bg #faf9f6` | `#faf9f7` | already warm and already right |
| `--good #7A8CA5` | `--colorTextBody` | the storefront has no third colour |

The rest is structural: 63 radius rules running 4px to 999px pills are
squared, because `button_style` is `square` and **the store's own PDP
colour swatches are `border-radius: 0`** in
`snippets/colorway-swatches.liquid`; the forced system font stack is
replaced by the theme's Chivo and Noto Sans Display; buttons become
black, square and uppercase like every other button on the site.

Nothing is hardcoded. The values read the custom properties that
`snippets/css-variables.liquid` sets from theme settings, so a colour or
font changed in the theme editor moves the builder with the rest of the
site rather than leaving it behind.

## The link in from Team Stores

`/pages/team-stores` is template `team-store`, whose body is EMPTY, so it
is entirely `sections/team-stores-search.liquid`. Its "Create your team
store" block used to offer a mailto address and nothing else, so the only
way to start a store was to write to somebody and wait.

The builder is now the primary action there and the address is the
fallback, as a `.ts-build` button with the same shape and the same hard
offset hover as the existing `.ts-mail`, because the page had already
taught the eye what that button looks like. The email is demoted to an
outline so the two cannot compete.

**The link resolves through the `pages` object, never a typed path.** An
unpublished or renamed page yields blank and the button is simply not
rendered, rather than becoming a dead link. `builder_link` in the section
settings overrides it if the builder ever moves, and `builder_label` and
`builder_note` are editable too.

**That page keeps its own palette and that is deliberate.** It is navy
and cyan from its own `section.settings`, not the storefront's black,
white and orange. The builder was restyled to the STORE, this section was
matched to ITSELF, so there is a visual handoff between the two. Worth
knowing before anyone calls one of them a bug.

## One accent, one meaning

The restyle's one real judgement call, recorded because it is the thing
most likely to be argued with.

`.btn.or` KEEPS the accent. It marks the three commit actions, the
storefront's black button is already in use for everything secondary
here, so colour is the only hierarchy left and the conversion action
should own it.

What changed is everything else that was wearing the same orange. A grid
of tees put four `POPULAR` badges on screen next to the one orange button
that wanted the click, and the review step put a `Remove` link on every
line, six of them against one Send. Measured on a six item store: 23
elements on that screen were drawing in the accent, now 17. Badges are
black, Remove is a grey underline that only colours on hover, which is
where a destructive control belongs.

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
