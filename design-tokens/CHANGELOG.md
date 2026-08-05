# Changelog

All notable changes to the shared `design-tokens` package (colours, fonts,
components) are recorded here, newest first. This package has no build step
for `components.css`/`fonts.css` — they're hand-authored and checked in — so
this file is the only record of what changed and why.

## 1.1.0

- Added `build/css/components.css`: canonical `.btn`/`.btn--outline`/
  `.btn--danger`/`.btn--unstyled`, `select`, and checkbox/range styling,
  named after USWDS's button vocabulary — with one deliberate departure:
  USWDS's red/destructive variant is called `--secondary`, which reads as
  "lower emphasis" without knowing that convention, so Hrifa calls it
  `.btn--danger` instead (same `--critical`/`--critical-ink` tokens
  underneath). First applet to adopt it: `polygon-fold-explorer`.
- Added `.btn--secondary` / `.btn--tertiary`, a second and third chrome hue
  (`--chrome-accent-secondary` = green, `--chrome-accent-tertiary` = purple)
  for actions that need visual weight without being the primary CTA —
  closer to Carbon's/Polaris's use of "secondary" than USWDS's. Both chosen
  at the same 700-light/600-dark shade band and luminance as `--chrome-accent`
  so they share `--chrome-ink` rather than needing their own ink tokens.
  Known tuning candidate: `--chrome-accent-tertiary` shares its light-mode
  step (`purple.700`) with `--work-surface-relation`.
- Reworked button colour architecture around two local custom properties,
  `--btn-color`/`--btn-ink`, set once on the base rule and reassigned by
  each colour modifier — every state (hover/focus/outline) reads from them
  generically instead of being redeclared per colour×style combination.
- Standardized two hover treatments: filled buttons mix `--btn-color` with
  a slight amount of `gray.100` and lift (translateY + offset shadow);
  outline buttons wash in a little `--btn-color` against the page
  background instead (generalized from Hrifa Edel's `--chrome-accent-hover`
  pattern), with no lift.
- Added `chrome.accent-text` / `accent-secondary-text` / `accent-tertiary-text`
  / `critical-text` — fixed the "outline button text fails contrast" bug:
  `--chrome-accent` etc. are tuned as *fills* (dark enough to pair with the
  fixed ink tokens), which in dark theme is too dark to pass 4.5:1 as
  standalone text against `--neutral-surface-bg` (~3.0:1, confirmed by
  contrast math, not just visual judgement). The two needs are mutually
  exclusive for one value in dark theme; `-text` variants use each hue's
  `.400` step there instead (~6.4:1). `--critical` has the mirror-image
  problem — its fixed red.500 passes as text in dark theme but fails in
  light (~3.3:1) — so `critical-text` is `red.700` light / `red.400` dark.
  `components.css`'s `--btn-text` local property backs the button LABEL
  (`.btn--outline`, `.btn--unstyled`) and the focus ring — never the resting
  `border-color`, which stays on `--btn-color` (the actual theming-identity
  stop) since a border only needs the 3:1 non-text minimum, which the fill
  token already clears. The focus ring could likewise stay on `--btn-color`,
  but deliberately uses the higher-contrast `--btn-text` as a separate,
  intentional choice (more margin than the bare minimum for something that
  needs to be spotted quickly while tabbing). This bug pre-dates
  `components.css` and is confirmed present in `.eyebrow`-style direct-
  `--chrome-accent`-as-text usage across most of the other applets too (not
  yet fixed there).
- Added `chrome.ink` and `critical-ink` semantic tokens — fixed (non
  theme-inverting) text colours for content sitting on a `chrome-accent` or
  `critical` fill. Fixes low-contrast button text that resulted from
  reusing `--neutral-surface-bg` for that purpose. See design-tokens/README.md
  > "Fill tokens need an ink pair".
- Added `neutral.text-secondary` semantic token (`gray.900` light /
  `gray.200` dark) — sits between `--neutral-text` and `--neutral-text-muted`
  for labels/captions that need to be legible without competing with primary
  content.
- Dark-theme `chrome.accent` changed `purple.400` → `purple.500` →
  `blue.600` (final: same hue as light theme's `blue.700`, one step lighter).

## 1.0.0

- Initial colour token set: base ramp (10 hues × 11 steps) and the
  `neutral`/`chrome`/`work-surface`/`emphasis`/`critical` semantic layer,
  light and dark. `fonts.css` added alongside as the shared typography
  layer (hand-authored, no Style Dictionary build).
