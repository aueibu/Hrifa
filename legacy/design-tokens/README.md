# Hrifa design tokens

The single source of truth for colour and typography across every Hrifa
applet. `color-tokens.json` defines the palette; `npm run build` (Style
Dictionary) compiles it to plain CSS custom properties in `build/css/`, which
apps link to directly — no bundler, no runtime dependency on Node. Typography
(`build/css/fonts.css`) is hand-authored rather than generated; see
[Typography](#typography) below.

## Layers

1. **Base** (`color.base.*`) — eleven 50–950 hue ramps (`gray`, `red`, `orange`,
   `yellow`, `ygreen`, `green`, `aqua`, `teal`, `blue`, `violet`, `magenta`,
   `pink`). Loaded once, on every page, regardless of theme — `build/css/base.css`,
   `:root` scope. A theme never redefines these; retune a hue here and every
   role that references it updates everywhere.
2. **Semantic** (`color.theme.<light|dark>.*`) — the only layer app CSS/JS should
   reference. Split into two domains that are never read across each other:
   - `neutral.*` — surface/border/text roles shared by both domains
     (`surface-bg`, `surface-raised`, `surface-overlay`, `border`,
     `border-strong`, `text`, `text-secondary`, `text-muted`, `text-disabled`).
   - `chrome.accent` — the app's own controls: buttons, sliders, dropdowns,
     focus rings. `chrome.ink` is its required pair — see "Fill tokens need an
     ink pair" below.
   - `work-surface.{idle,hover,active,relation}` — the applet's actual subject
     matter: canvas points, edges, cells, whatever the user directly
     manipulates. Deliberately different hues from `chrome.accent` so a reader
     can tell tool from subject at a glance.
   - `emphasis` / `critical` — rare warm highlight / destructive action,
     shared by both domains. `critical-ink` is `critical`'s ink pair.

   Compiles to `build/css/light.css` (`:root, [data-theme="light"]`) and
   `build/css/dark.css` (`[data-theme="dark"]`). Both files define the *same*
   variable names (e.g. `--chrome-accent`) — only the selector and the value
   differ, so switching `data-theme` on `<html>`/`<body>` retheme the page.

### Fill tokens need an ink pair

`--neutral-text`/`--neutral-surface-bg` invert cleanly between themes because
they're built that way on purpose — light theme's ink is dark, dark theme's
ink is light, always at opposite ends of the ramp from that theme's own
surface. Accent-ish fills (`--chrome-accent`, `--critical`) don't follow that
rule: `--chrome-accent` is a *dark-toned* colour in **both** themes (blue.700
light, blue.600 dark), and `--critical` is the same red.500 value in both
themes. Neither one inverts, so text sitting on top of one of these fills
must **never** reach for `--neutral-surface-bg` or `--neutral-text` — those
only happen to produce the right contrast in whichever theme the fill's
luminance happens to favour, and silently break the other theme (or break
outright the next time the fill's hue/step is retuned, which is exactly what
happened when the dark chrome accent moved from purple.400 to blue.600).

Instead, every fill role that text can sit on top of gets its own `-ink`
companion token — `--chrome-ink` (`gray.50`, fixed light) and `--critical-ink`
(`gray.950`, fixed dark) — picked once, deliberately, for contrast against
that specific fill, and does not vary by theme unless the fill itself does.
When you introduce a new filled surface (a new button variant, a badge, a
chip), give it an `-ink` token rather than reaching for a neutral text role.

### The reverse case: a fill token used AS text

The same fill roles (`--chrome-accent` and friends, `--critical`) also get
read directly as running text in plenty of places — link-styled text,
`.eyebrow` labels, outline-button labels — without any fill involved at all.
This looks like it should just work (it's the same colour, why would it need
its own token?), but it doesn't: a colour chosen to be dark enough to serve
as a fill (so it can pair with a *fixed* ink token) is, in dark theme, too
dark to itself pass 4.5:1 as text against `--neutral-surface-bg` — confirmed
by contrast math, not just eyeballing: `--chrome-accent`'s dark value is
~3.0:1 as text, well under the 4.5:1 AA minimum for anything smaller than
~18.7px bold. Fill-suitability wants low luminance (to contrast with a light
fixed ink); text-on-near-black wants high luminance. Those two requirements
are mutually exclusive for one value in dark theme — there is no better
single dark-mode number to pick.

This applies to `color` first and foremost, not `border-color`. A resting
border is a WCAG *non-text* UI component (3:1 minimum, WCAG 1.4.11), and the
fill tokens already clear that bar even where they fail the text-contrast
one — `--chrome-accent`'s dark value is ~3.0:1, just over that line. So a
bordered control's resting border should keep using the fill token, the
actual theming-identity colour — only the *label* moves to the `-text`
variant. A focus ring is also only held to the 3:1 non-text minimum, so it
could likewise stay on the fill token — but it's a reasonable, separate
choice to give it the higher-contrast `-text` value instead anyway, since a
focus indicator benefits from more margin than the bare minimum to be
spotted quickly while tabbing. That's a deliberate per-element call, not a
rule that every non-text use must follow.

So every chrome accent (and `--critical`) has an `-text` counterpart:
`--chrome-accent-text`, `--chrome-accent-secondary-text`,
`--chrome-accent-tertiary-text`, `--critical-text`. Light theme has enough
contrast headroom that one value already works for both fill and text, so
each `-text` token just reuses its base token's light value; dark theme uses
a lighter step of the same hue (the `.400` step, landing around 6.4:1).
`--critical` has the mirror-image problem — its one fixed red.500 value
happens to pass as text in dark theme (~4.6:1) but fails in light (~3.3:1) —
so `critical-text` is asymmetric: `red.700` light, `red.400` dark.

Any CSS that sets `color` to a fill token directly should use its `-text`
counterpart instead; leave `border-color`/`outline-color` on the fill token
itself. `components.css` does this via a third local property, `--btn-text`,
which only ever appears on a `color` declaration — never `border-color` or
`outline` — alongside `--btn-color`/`--btn-ink`.

To add a role, add a token under `color.theme.light.*` and
`color.theme.dark.*` pointing at a base hue/step, then `npm run build`. Do not
introduce a tenth accent hue for a role — reuse or repurpose one of the
existing eleven first.

## Using it in an app

```html
<link rel="stylesheet" href="../design-tokens/build/css/hrifa.css" />
<link rel="stylesheet" href="../design-tokens/build/css/fonts.css" />
<link rel="stylesheet" href="style.css" />
```

`hrifa.css` is a generated bundle — `base.css` + `light.css` + `dark.css` +
`components.css` concatenated in that order by `build-bundle.js`, run as
part of `npm run build` right after the Style Dictionary step. It's what
every applet actually links; the four pieces stay separate as *source*
files (see [Why not one source file](#why-not-one-source-file) below) but
apps shouldn't have to remember four `<link>` tags in the right order to
get them. `fonts.css` stays its own link — unlike the other four, it's
legitimately opt-in per applet (see [Typography](#typography)).

Toggle `document.documentElement.dataset.theme = "dark" | "light"` (or remove
the attribute to fall back to the light default) to switch themes. An app's
own `style.css` should reference only the semantic variables above — never a
base hue/step directly — and layer any derived values (soft hover fills,
etc.) on top via `color-mix()` at use-time, per the Design Philosophy's
three-tier token guidance.

### Why not one source file

`base.css`/`light.css`/`dark.css` are machine-generated by Style Dictionary
from `color-tokens.json` — each carries a "do not edit directly" header.
`components.css` is hand-authored, no build step. Keeping generated and
hand-written rules in separate *source* files (even though they end up
concatenated in the shipped bundle) matters for three reasons: it keeps the
"can I edit this file directly" boundary visible instead of buried inside a
bigger file; `light.css`/`dark.css` are separate Style Dictionary build
*targets* (different `platforms` entries filtering `color.theme.light.*` /
`color.theme.dark.*`), so a token change's `git diff` shows exactly which
theme(s) it touched; and `base.css` being its own file signals what its own
comment already says — loaded once, regardless of theme — a distinction
that'd be easy to lose inside one large file. None of that requires apps to
link four files instead of one; that's what `hrifa.css` is for.

## Components

`components.css` (bundled into `hrifa.css` — see above) is the shared home
for the components common to every applet: buttons (`.btn`, `.btn--outline`,
`.btn--secondary`, `.btn--tertiary`, `.btn--danger`, `.btn--unstyled`),
`select`, and checkbox/radio/range accent colour. Hand-authored and checked
in, same status as `fonts.css`.

Naming mostly follows USWDS's button vocabulary (the design system the base
colour ramp is itself built on), with `.btn--secondary`/`.btn--tertiary` as
Hrifa's own addition — two more chrome hues (`--chrome-accent-secondary` =
green, `--chrome-accent-tertiary` = purple) for actions that need visual
weight without being the primary CTA or a destructive one. See the header
comment in `components.css` for the full naming mapping and reasoning.
Nothing outside buttons, selects, and checkbox/radio/range is standardized
yet; an applet's own stylesheet still owns everything else.

Every button reads two local custom properties, `--btn-color`/`--btn-ink`,
rather than hardcoding a token per variant — a colour modifier only needs to
reassign those two, and hover/focus/outline all respond automatically. Two
hover treatments are used deliberately: filled buttons tint `--btn-color`
with a little `gray.100` and lift slightly; outline buttons wash in a little
`--btn-color` against the page background instead, with no lift (matching
Hrifa Edel's existing `--chrome-accent-hover` pattern, generalized to any
`--btn-color`).

## Typography

`build/css/fonts.css` is the shared home for the four-role type system in
[Design Philosophy.md](../Design%20Philosophy.md) — a Google-hosted `@import`
for DM Mono and Figtree, self-hosted `@font-face` rules for Fraunces (see
below), plus role variables every applet should reference instead of
hand-rolling its own font stack:

| Variable | Family | Role |
| --- | --- | --- |
| `--font-display` | Fraunces | Applet titles, large section titles, rare high-emphasis moments. |
| `--font-ui` | Figtree | Buttons, labels, instructions, paragraphs, dense routine interface text. |
| `--font-mono` | DM Mono | Coordinates, values, operation history, identifiers, tags, counts. |
| `--font-reading` | Crimson Text | Longer notes, lore, explanations — rare; import the family locally before use (see the comment in `fonts.css`). |

Fraunces is served from local files (`build/fonts/Fraunces-Variable.ttf` and
`Fraunces-Italic-Variable.ttf`) rather than the same Google `@import` as the
other two families. Google's css2 endpoint serves a subset that drops glyphs
this family needs — accents, macrons — which silently breaks on any heading
that uses them. Do not move Fraunces back onto the Google `@import` without
re-checking glyph coverage first.

Add it alongside the colour files:

```html
<link rel="stylesheet" href="../design-tokens/build/css/base.css" />
<link rel="stylesheet" href="../design-tokens/build/css/light.css" />
<link rel="stylesheet" href="../design-tokens/build/css/dark.css" />
<link rel="stylesheet" href="../design-tokens/build/css/fonts.css" />
<link rel="stylesheet" href="style.css" />
```

then in the applet's own `style.css`: `font-family: var(--font-ui)` on
`html, body`, `var(--font-display)` on titles, `var(--font-mono)` on
coordinate/value/instrument-style text. Unlike the colour files, this one is
hand-edited directly — there's no `npm run build` step for it.

## Build

```
cd design-tokens
npm install
npm run build
```

Commit the generated `build/css/{base,light,dark}.css` — apps load them as
static files, there is no build step in production. `fonts.css` in the same
folder is hand-authored and untouched by this command.
