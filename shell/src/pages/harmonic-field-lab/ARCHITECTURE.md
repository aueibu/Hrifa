# Harmonic Field Lab

Status: started in M1 (core ported, page is a placeholder). Arc: `arcs/harmonic-field-lab`. Route `/harmonic-field-lab`.

The lab is a standalone Hrifa page (decided 2026-11-12): its own route, tabs and settings, permanently. A later
Composition Workbench integration reuses the core (`src/lib/harmonic-field/`) and the lab's section components; it does
not replace the page. The standalone prototype in the Infinitone repo (`prototype/`) is frozen and is the behavioural
reference only.

## Files

| file | role |
| --- | --- |
| `src/pages/HarmonicFieldLab.page.tsx` | Entry file (standing shared path): `AppShell` header (back link to Home, title, `ColorSchemeToggle`) and the page body. Today a "coming soon" `Surface`. |
| `src/pages/harmonic-field-lab/` | Components, hooks, tests, `texts.ts`, `settings.ts` (added from M5 on) and this file. |
| `src/lib/harmonic-field/` | The pure TS core. Owned by the same arc; no React, no DOM. |

## Contracts

### Pitch

- A note is `{ m, c }`: `m` an exact monzo `{ prime: exponent }` (prime keys are decimal strings) or `null` for an
  irrational pitch (EDO steps, typed cents); `c` its cents above the root. Products of an irrational and a rational note
  are irrational. Decision H-1 (`shell/DECISIONS.md`): the lab stores monzo + cents only. Midicents or Hz are derived from
  `c` at an edge (audio, a Workbench handoff, consistent with W-1) and never stored in place of the monzo.
- A field is `Note[]` reduced into `[0, repeat)`, prime-filtered, sorted by cents, de-duplicated within 1e-6 cents (a
  rational note wins over an irrational one), capped at 2048 (`MAXN`).
- A subset is a set of field indices plus a mode (which selected note is the root); `rotateSubset` turns it into a
  `RelNote[]` (notes above the mode root, each with `src` = its field index). Analysis functions take that.
- Tolerances: "same size" is strictly less than 0.01 cents (`tol`); the chord finder's musical tolerance `tolC` is
  inclusive and defaults to 18 cents in the UI; `transpositions` falls back to cents with `tolC` inclusive (default 0.01).
  Test comparisons use 1e-3 cents unless a handler says 0.01. Full rules: `src/lib/harmonic-field/README.md`.

### Module map of the lib

See the table in `src/lib/harmonic-field/README.md`. In short: `intervals` (monzo, note, text parsing, prime filter),
`generators` (harmonic, EDO, box lattice, diamond, CPS, custom), `field` (`buildField`, lattice, CPS chords), `subset`
(rotate, carry selection, nearest ED, odd limit), `shape` (step sizes, MOS, interval spectrum, propriety, constant
structure), `chords` (templates, finder, closest, ladder), `scales` (melakarta, Western library, nearest scale pick),
`keys` (transposition map), `deviation` (nearest ratio, targets, "vs JI"), `scala`, `presets`. Pages import from the
barrel `@/lib/harmonic-field`.

### Persistence (from M5 on; not used yet)

Shell pattern (`loadSettings` / `saveSettings` / `sanitizeSettings`), page-local keys, never another page's keys (W-10):
`hrifa.harmonic-field-lab.settings.v1` (UI state, collapsed blocks), `.tabs.v1`, `.subsets.v1`, `.chordfinder.v1`,
`.retuner.v1`. Snapshot shapes follow the prototype's (additive optional fields with defaults; an older snapshot must
still load). Prototype data lives on another origin (`file://`) and does not carry over automatically.

### Audio (from M5 on)

Through the shell's shared engine if it can play arbitrary Hz with held voices and glide. C0 found it cannot today
(fixed-length events, no glide); M5 stops and asks before choosing a page-local voice module or a shared-engine
extension. Anything that sounds a note must light it in every visualiser.

## Colour-role mapping plan

Plan only; nothing is drawn yet. Colours come from the shell roles in `src/theme/THEMING.md` (neutral roles, `--mark-<hue>`,
`--tint-<hue>-bg` / `-text`), never from hex, palette shades or ad-hoc radii/shadows. Canvas or SVG drawing goes
through `markHue`. The prototype's own tokens map as follows.

| Prototype meaning (token) | Shell role | Second channel (colour is never alone) |
| --- | --- | --- |
| Selected note (`--accent`, blue) | The state grammar's selection: an outline in `--text` (accent never encodes data); unselected dots are `--text-subtle`. | Outline weight and a filled vs hollow dot. |
| Highlighted chord (`--warn`, orange) | `--mark-violet` for marks and `--tint-violet-bg` / `-text` for chord chips. | Chip outline plus a "chord" label on the dots it covers. |
| Sounding / lit (`--lit`, green) | `--mark-blue` fill, applied to every visualiser at once. | A larger dot or ring (the prototype scaled the dot by 1.6); no drop-shadow glow. |
| Sharp of target (`--sharp`, rose) | `--mark-pink` | Bar above the zero line plus a `+` in its cents label. |
| Flat of target (`--flat`, cyan) | `--mark-cyan` | Bar below the zero line plus a `-` in its cents label. |
| Chord error severity 0 (exact) | `--mark-cyan` | The cents number itself (0.0). |
| Severity 1 (< 5 c) | `--mark-green` | The cents number. |
| Severity 2 (5-15 c) | `--mark-yellow` | The cents number. |
| Severity 3 (15-30 c) | `--mark-orange` | The cents number. |
| Severity 4 (>= 30 c) | `--mark-red` | The cents number. |

Notes on the plan, to be confirmed at the M4 mock:

- The five severities are text colour only (on the chip's small error text), cool to warm, and carry the number as the
  second channel. THEMING.md flags yellow beside green, red beside orange and blue beside violet as pairs that need a
  second channel; the printed cents value (severities) and the outline or label (chord vs sounding) are that channel.
  Only the eight core hues are used (teal, lime, indigo and grape are never used for marks here, per THEMING.md), and the number must always be shown beside a severity colour. Cyan is shared between severity 0 (chord chips) and flat (tuner strip) but they never appear on the same object.
- Sharp (pink) and flat (cyan) are used only in the tuner strip; a sounding bar turns the "sounding" hue.
- Sounding (blue) and highlighted chord (violet) can appear on the same dot; the dot then shows the sounding fill with the
  chord outline, so both stay readable.
- Backdrops (the prototype's `--scrim`) use Mantine's `Modal`/`Drawer` overlay, not a custom token.
- If a mapping needs a new role or touches the theme contract it gets a DECISIONS row first (arc rule), and `src/theme/`
  needs a lock; none is planned.

## Tests

- `src/lib/harmonic-field/harmonicField.test.ts` runs every case of `vectors.json` (168) and every preset (53) as its own
  test. `vectors.json` is the contract; never change an expected value silently.
- `src/pages/harmonic-field-lab/HarmonicFieldLab.page.test.tsx` renders the page (header, back link, coming-soon panel).
- Gate: `corepack yarn check:hfl` (typecheck, oxfmt, oxlint, stylelint, vitest scoped to the lib and this folder).
