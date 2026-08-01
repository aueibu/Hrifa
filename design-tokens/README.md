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
     `border-strong`, `text`, `text-muted`, `text-disabled`).
   - `chrome.accent` — the app's own controls: buttons, sliders, dropdowns,
     focus rings.
   - `work-surface.{idle,hover,active,relation}` — the applet's actual subject
     matter: canvas points, edges, cells, whatever the user directly
     manipulates. Deliberately different hues from `chrome.accent` so a reader
     can tell tool from subject at a glance.
   - `emphasis` / `critical` — rare warm highlight / destructive action,
     shared by both domains.

   Compiles to `build/css/light.css` (`:root, [data-theme="light"]`) and
   `build/css/dark.css` (`[data-theme="dark"]`). Both files define the *same*
   variable names (e.g. `--chrome-accent`) — only the selector and the value
   differ, so switching `data-theme` on `<html>`/`<body>` retheme the page.

To add a role, add a token under `color.theme.light.*` and
`color.theme.dark.*` pointing at a base hue/step, then `npm run build`. Do not
introduce a tenth accent hue for a role — reuse or repurpose one of the
existing eleven first.

## Using it in an app

```html
<link rel="stylesheet" href="../design-tokens/build/css/base.css" />
<link rel="stylesheet" href="../design-tokens/build/css/light.css" />
<link rel="stylesheet" href="../design-tokens/build/css/dark.css" />
<link rel="stylesheet" href="style.css" />
```

Toggle `document.documentElement.dataset.theme = "dark" | "light"` (or remove
the attribute to fall back to the light default) to switch themes. An app's
own `style.css` should reference only the semantic variables above — never a
base hue/step directly — and layer any derived values (soft hover fills,
etc.) on top via `color-mix()` at use-time, per the Design Philosophy's
three-tier token guidance.

## Typography

`build/css/fonts.css` is the shared home for the four-role type system in
[Design Philosophy.md](../Design%20Philosophy.md) — one `@import` for the
Google-hosted families, plus role variables every applet should reference
instead of hand-rolling its own font stack:

| Variable | Family | Role |
| --- | --- | --- |
| `--font-display` | Fraunces | Applet titles, large section titles, rare high-emphasis moments. |
| `--font-ui` | Figtree | Buttons, labels, instructions, paragraphs, dense routine interface text. |
| `--font-mono` | DM Mono | Coordinates, values, operation history, identifiers, tags, counts. |
| `--font-reading` | Crimson Text | Longer notes, lore, explanations — rare; import the family locally before use (see the comment in `fonts.css`). |

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
