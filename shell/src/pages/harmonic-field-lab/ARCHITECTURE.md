# Harmonic Field Lab

Status: M5 done (live workspace and voice engine). The approved one-screen layout runs on one lab state; the generator, selection, tabs, saved subsets, stats, strip, field table and the Chords, Spectrum, Keys & Modes and visualizer panels are live. The Retuner panel is still the static placeholder (M7). Arc: `arcs/harmonic-field-lab`. Route `/harmonic-field-lab` (the frozen layout mock stays at `/harmonic-field-lab/mock` until M6).

The lab is a standalone Hrifa page (decided 2026-11-12): its own route, tabs and settings, permanently. A later
Composition Workbench integration reuses the core (`src/lib/harmonic-field/`) and the lab's section components; it does
not replace the page. The standalone prototype in the Infinitone repo (`prototype/`) is frozen and is the behavioural
reference only.


## Files

| path | role |
| --- | --- |
| `src/pages/HarmonicFieldLab.page.tsx` | Entry file (standing shared path): renders `HarmonicFieldLabApp`. |
| `HarmonicFieldLabApp.tsx` | The workspace (top bar, rail, pinned columns, centre unit, switcher, dock) inside `LabProvider`. `initial` and `frozen` props feed the mock route. |
| `state/generate.ts` | `GenSpec` (the generation inputs of a tab), `generateField` (inline errors, never throws), presets to specs, `genKey` (which pitch collection a spec builds), `autoName`, `mosFor`. |
| `state/labState.ts` | `LabState`, `Tab`, `Saved`, `UiSettings`, every `Action` and the pure `labReducer`. |
| `state/derive.ts` | Analysis of the active tab as pure functions (`deriveBase`, `stripDevs`, `spectrumOf`, `chordModel`, `keysOf`, `lattice2dOf/3dOf`, `edoOf`, `dissOf`, `isoOf`, `fieldRowsOf`, `fifthsFor`) with the prototype's size caps. |
| `state/LabProvider.tsx` | The provider: reducer, restore, persistence effects, `useMemo` analyses, the voice engine hook. `state/context.ts` holds the `Lab` shape, `useLab()`, `useViz()`. |
| `state/persist.ts` | Storage keys, `sanitize*`, `load*`, `save*`, the snapshot shape. |
| `state/layout.ts`, `state/vizState.ts` | Pinned-column arrangement rules and its entry-wise sanitising; visualizer settings and their defaults. No React. |
| `audio/engine.ts` | `VoiceEngine`: Web Audio voices (see "Audio engine"). `audio/plan.ts` (what to play, as data), `audio/keymap.ts` (computer keys), `audio/useLabAudio.ts` (hook), `audio/fakeContext.ts` (test double). |
| `components/` | The section components (`Rail`, `Panels`, `GeneratorColumn`, `RingStats`, `TunerStrip`, `SavedSubsets`, `FieldPanel`, `ChordsPanel`, `SpectrumPanel`, `KeysModesPanel`, `Visualizer` with `LatticePanel` / `Lattice3D` / `EdoFitView` / `DissonanceView` / `IsoView`, `RetunerPanel` (placeholder), `KeyboardDock`, `TopBar`, `GlossaryDrawer`) and `lab.module.css` / `panels.module.css`. They read the lab through `useLab()` only. |
| `texts.ts` | The glossary's single source: every tooltip and glossary entry (`TIPS`, `GLOSSARY`, `tipKeys`). |
| `mock/` | The frozen layout mock route: `mockState.ts` (the fixed state), `mockRetuner.ts` (the placeholder retuner data, imported by the live Retuner panel). The route is retired in M6, but **keep `mockRetuner.ts`** until M7 replaces the panel (move it out of `mock/` when the route goes). |
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

### Lab state shape

```ts
LabState {
  tabs: Tab[]; active: number; nextTab: number;        // up to 12 tabs
  saved: Saved[]; nextSaved: number;                   // saved subsets (all tabs)
  hover, pin: number | null;                           // field index pointed at / pinned (inspector)
  chordHover, chordPick: Set<number> | null;           // highlighted chord (a hovered chip, a clicked chip)
  preview: number[] | null;                            // saved subset pointed at (shown instead of the selection)
  sounding: Set<number>;                               // field indices that sound now (every view lights them)
  ui: UiSettings;                                      // panel, dock, tolerance, ring, visualizers, sound
  layout: Layout;                                      // pinned columns
}
Tab { id, name | null, gen: GenSpec, field: Note[], rep: Note, err, sel: number[], mode,
      lastMethod, cmp: {ref, odd, m}, pick: {scale, kind, stretch, m, ref, msg, ok} }
Saved { id, name, gen: GenSpec, selCents: number[], mode }
```

- `field`, `rep` and `err` are built by `generateField(gen)` inside the reducer (so the selection can be carried across a
  regeneration with `carrySelection`) and are never stored. A failed build keeps the old field and shows `err` inline.
- `sel` is a sorted list of field indices; `mode` indexes `sel`. Changing the field clears hover, pin, chord, preview and
  sounding (they point into the old field). Switching tab does the same.
- Everything derived (`deriveBase`, the strip, the analyses) is `useMemo` per active tab in `LabProvider`; there is no
  module-scope mutable state or cache tied to lab data (the one module-level value is the WebGL capability probe, `components/webgl.ts`).
- Clicking a note anywhere (ring, strip, lattice, iso keyboard, dissonance marks, compact field table)
  calls `clickNote`: it toggles the note in the subset and pins it in the inspector. The full field table's checkbox toggles
  without pinning; its row click pins.
- "Saved subsets of this pitch collection": a saved subset belongs to the collection whose `genKey` equals its `gen`'s. The list
  shows those; "All" lists the rest (loading one switches the tab to that collection).

### Persistence

Shell pattern (`loadSettings` / `saveSettings` / `sanitizeSettings`, in `state/persist.ts`), page-local keys, never another
page's keys (W-10):

| key | holds |
| --- | --- |
| `hrifa.harmonic-field-lab.settings.v1` | `UiSettings`: active panel, dock open, chord tolerance, ring view / chain / generator, the three visualizers' settings, wave, 1/1 Hz, volume, mode-at-base, saved-list "All". |
| `hrifa.harmonic-field-lab.layout.v1` | The pinned-panel `Layout` (the mock's model, moved here as its own key). Read once from the mock's `...mock.layout.v3` (else v2, else v1) when it is absent. |
| `hrifa.harmonic-field-lab.tabs.v1` | `{ active, list: [{ id, name, snap }] }`. |
| `hrifa.harmonic-field-lab.subsets.v1` | `[{ id, name, ...snap }]`. |
| `...chordfinder.v1`, `...retuner.v1` | Reserved for M6 / M7 (not written yet). |

- A `snap` is the prototype's flat snapshot shape (`gen` as `harmonic | subharmonic | edo | additive | cps | custom`, `rep`, `h`,
  `edoN`, `axes`, `shape`, `dist`, `bidir`, `cpsF`, `cpsK`, `custom`, `mask`, `selCents`, `mode`, `preset` ...) plus optional extras
  (`keepNew`, `pickScale`, `pickKind`, `pickStretch`, `pickM`, `pickRef`, `cmpRef`, `cmpOdd`, `cmpM`). Every field is optional with a
  default, so an older snapshot still loads and unknown fields are ignored. A prototype `preset` index maps to the preset name.
  The selection is stored as cents, not indices, and re-matched (within 0.01 c) when the field is rebuilt.
- Sanitising is entry by entry: a bad tab, subset, column, view or share is dropped (or defaulted) and the rest is kept, so
  a future new view or panel cannot wipe a stored layout. Only a value with no usable entry at all falls back to the defaults.
- Restore runs synchronously in the reducer's initialiser, before the first render. Each save effect writes only once its
  part of the state differs from the restored object, so nothing at all is written on mount (a stored value the page could
  not fully use is never overwritten by what it made of it). The frozen mock route (`frozen`) never reads or writes storage.
- A tab restored while its inputs do not build (a repeat saved mid-edit, e.g. `2/`) has an empty field; its stored selection
  and mode are kept as `Tab.pending`, written back by `toSnapshot` and re-matched by the first good build.
- A failed write (storage full or blocked) is reported by the `save*` functions (`false`); the page shows "Not stored" in the
  saved-subsets list (`Lab.storeFailed`). Saved subsets are re-read on the `storage` event, so a second window cannot wipe the
  subsets saved in the first (tabs and settings are last-writer-wins). There is no cap on the number of saved subsets.
- Text and number inputs that rebuild the field (repeat, generators, CPS factors, custom list, counts) commit after typing
  pauses (120 ms, as the prototype's `regen()`), on Enter and on blur, so typing "3/2" never rebuilds for "3".
- Prototype data lives on another origin (`file://`) and does not carry over automatically.

### Audio engine (`audio/`)

Lab-local, Web Audio only, no shared audio code (decided 2026-11-13; may be promoted to a shared module later).

```ts
new VoiceEngine({ createContext? })          // the AudioContext is created on the first sound (a user gesture)
engine.setVolume(0..1); engine.setTimbre('sine' | 'harmonic')
engine.start(id, hz, amp?) -> boolean        // a held voice at any Hz; no-op if id sounds
engine.stop(id)                              // release (setTargetAtTime, from the computed level)
engine.glideTo(id, hz, ms)                   // exponential frequency ramp of a held voice (the retuner, M7)
engine.blip(hz, delaySec, durSec, amp?)      // a timed voice that releases itself
engine.stopAll()                             // panic: every voice fades within ~0.1 s; scheduled-but-unstarted ones are cancelled
engine.dispose()
```

- A voice is one oscillator through one gain into a master gain and a gentle limiter. `harmonic` is a single
  `PeriodicWave` of 7 partials with amplitude 0.88^(k-1) (the Sethares default, matching the roughness maths), so a glide is one ramp.
- Envelopes are scheduled (`setValueAtTime`, `linearRampToValueAtTime` for a 12 ms attack, `setTargetAtTime` for the release); the
  release starts from the level computed from the attack, never from a read of `gain.value`.
- `useLabAudio` maps keys to voices: computer keys `zxcvbnm,./asdfghjkl;'qwertyuiop[]` and pointer presses on dock keys hold a
  voice (slot i = degree i mod N, floor(i / N) repeats up); Play scale, Play chord (the highlighted chord, else the subset),
  a chord chip click and the field table's play button schedule timed voices. Hz = 1/1 Hz x 2^(cents/1200), with the mode
  root at 1/1 Hz or not (`modeAtBase`).
- What sounds is reported to the lab state (`sounding`, a set of field indices; counted per index so overlapping voices light
  until the last ends), and every view lights it with the `--mark-green` look (H-2).
- No stuck notes: window blur, `visibilitychange` to hidden, a change of field (tab switch, regeneration), the Stop button and
  unmount all call `stopAll` (a field change only when something sounds). Keys are matched by `event.code` (the physical
  key) and released by it, so Shift cannot leave a note stuck. A panic fades a voice that is already releasing from its decayed
  level, and `glideTo` anchors at the pitch an interrupted glide has reached. Typing in an input, textarea, select or contentEditable never plays. Alt+1 to Alt+9 switch tabs.

### Selection look per view

Selection is "1px border plus 1px outline in `--text`" where an outline fits (saved row, pinned note, chord chip). Dots differ by
medium: SVG views (ring, lattice, iso keyboard) draw a selected note as a filled `--text` dot and an unselected one as a hollow
`--text-subtle` dot, a pinned or hovered note gets a ring (`selRing`); the strip draws a coloured line (selected) against a faint
one; the dissonance curve draws bright versus faint marks; the 3D lattice uses sphere size and brightness. Sounding is always
`--mark-green` and the highlighted chord always `--mark-blue`, in every view. These per-view variants are deliberate (each
medium needs its own second channel); a single shared look is not worth the loss of legibility.

## Colour-role mapping (H-2)

Fixed by the human (`DECISIONS.md` H-2, 2026-11-13). Colours come from the shell roles in `src/theme/THEMING.md` (neutral roles, `--mark-<hue>`,
`--tint-<hue>-bg` / `-text`), never from hex, palette shades or ad-hoc radii/shadows. Canvas or SVG drawing goes
through `markHue`. The prototype's own tokens map as follows.

| Prototype meaning (token) | Shell role | Second channel (colour is never alone) |
| --- | --- | --- |
| Selected note (`--accent`, blue) | The state grammar's selection: an outline in `--text` (accent never encodes data); unselected dots are `--text-subtle`. | Outline weight and a filled vs hollow dot. |
| Highlighted chord (`--warn`, orange) | `--mark-blue`: the outline and edge of the chord's pitches (ring triangle and dots, dock keys, lattice, iso keyboard, strip). | An outline (not a fill) plus the "chord" label on the chips; never the only cue. |
| Sounding / lit (`--lit`, green) | `--mark-green` fill (dock keys use `--tint-green-*`), applied to every visualiser at once. | A larger dot or ring (the prototype scaled the dot by 1.6), a dot in the middle of a strip line and of an iso hexagon; no drop-shadow glow. |
| Sharp of target (`--sharp`, rose) | `--mark-orange` (the human's "amber"; the theme has no amber hue) | Bar above the zero line plus a `+` in its cents label. |
| Flat of target (`--flat`, cyan) | `--mark-cyan` | Bar below the zero line plus a `-` in its cents label. |
| Chord error severity 0 (exact) | `--mark-cyan` | The cents number itself (0.0). |
| Severity 1 (< 5 c) | `--mark-green` | The cents number. |
| Severity 2 (5-15 c) | `--mark-yellow` | The cents number. |
| Severity 3 (15-30 c) | `--mark-orange` | The cents number. |
| Severity 4 (>= 30 c) | `--mark-red` | The cents number. |

Notes on the mapping:

- The five severities are text colour only (on the chip's small error text), cool to warm, and carry the number as the
  second channel. THEMING.md flags yellow beside green, red beside orange and blue beside violet as pairs that need a
  second channel; the printed cents value (severities) and the outline or label (chord vs sounding) are that channel.
  Only the eight core hues are used (teal, lime, indigo and grape are never used for marks here, per THEMING.md), and the number must always be shown beside a severity colour. Cyan is shared between severity 0 (chord chips) and flat (tuner strip) but they never appear on the same object.
- Sharp (orange) and flat (cyan) are used only in the tuner strip and its saved rows; a sounding note gets the "sounding" dot.
- Sounding (green) and highlighted chord (blue) can appear on the same dot; the dot then shows the sounding fill with the
  chord outline, so both stay readable. Where green (sounding) sits beside the severity colours or blue (chord) beside the
  accent, the second channel carries the meaning: dot shape or position, outline weight, the printed cents number.
- Visualizer views use hues for roles only: the EDO-fit best bars are violet (not a data hue elsewhere), and a lattice
  stem takes violet, pink, red or yellow by prime, so no stem collides with chord (blue), sounding (green), sharp (orange)
  or flat (cyan).
- The 3D lattice (Three.js) reads categorical hues through `markHue` (`--mark-<hue>`, hex strings, as `src/theme/THEMING.md` says) and the neutral roles (`--text`, `--text-muted`, `--text-subtle`, `--grid`, which can be `color-mix()` expressions) through computed style and a 1 px canvas; it re-reads both when the colour scheme changes.
- Backdrops (the prototype's `--scrim`) use Mantine's `Modal`/`Drawer` overlay, not a custom token.
- If a mapping needs a new role or touches the theme contract it gets a DECISIONS row first (arc rule), and `src/theme/`
  needs a lock; none is planned.

## Tests

- `src/lib/harmonic-field/harmonicField.test.ts` runs every case of `vectors.json` (189) and every preset (53) as its own
  test; `vectors.json` is the contract, never change an expected value silently. Further lib tests: `voicings`, `fifths`,
  `visual`, `retuner`, `scorersMore`.
- `state/*.test.ts`: `generate` (every preset builds, inline errors), `labState` (the reducer), `persist` (round trips, bad
  entries, prototype-shaped snapshots, throwing storage), `derive` (strip, analyses, caps), `layout` (pure arrangement rules and
  entry-wise sanitising).
- `audio/*.test.ts`: the voice engine against a fake `AudioContext` (start, stop, glide, panic, no stuck voices), key map and plans.
- `HarmonicFieldLab.page.test.tsx` (layout, pinned columns, visualizer panels, stored layouts), `HarmonicFieldLab.live.test.tsx`
  (generation, tabs, selection, saved subsets, persistence, sound with a fake context, the frozen mock),
  `HarmonicFieldLab.webgl.test.tsx` (a refused WebGL renderer), `mock/HarmonicFieldLabMock.page.test.tsx` (the frozen mock).
- Gate: `corepack yarn check:hfl` (typecheck, oxfmt, oxlint, stylelint, vitest scoped to the lib and this folder).
