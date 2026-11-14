# Harmonic Field Lab

Status: M7 built (card list + live retuner panel), awaiting the human's audio check. The approved one-screen layout runs on one lab state; the generator, selection, tabs, saved subsets, stats, strip, field table and the Chords (with the editable template list), Spectrum, Keys & Modes, visualizer and Retuner panels are live. Arc: `arcs/harmonic-field-lab`. Route `/harmonic-field-lab` (the frozen layout mock route was retired in M6).

The lab is a standalone Hrifa page (decided 2026-11-12): its own route, tabs and settings, permanently. A later
Composition Workbench integration reuses the core (`src/lib/harmonic-field/`) and the lab's section components; it does
not replace the page. The standalone prototype in the Infinitone repo (`prototype/`) is frozen and is the behavioural
reference only.


## Files

| path | role |
| --- | --- |
| `src/pages/HarmonicFieldLab.page.tsx` | Entry file (standing shared path): renders `HarmonicFieldLabApp`. |
| `HarmonicFieldLabApp.tsx` | The workspace (top bar, rail, pinned columns, centre unit, switcher, dock) inside `LabProvider`. `initial` and `frozen` props are for tests and embedding (nothing stored, nothing sounds). |
| `state/generate.ts` | `GenSpec` (the generation inputs of a tab), `generateField` (inline errors, never throws), presets to specs, `genKey` (which pitch collection a spec builds), `autoName`, `mosFor`. |
| `state/labState.ts` | `LabState`, `Tab`, `Saved`, `UiSettings`, every `Action` and the pure `labReducer`. |
| `state/derive.ts` | Analysis of the active tab as pure functions (`deriveBase`, `stripDevs`, `spectrumOf`, `chordModel`, `keysOf`, `lattice2dOf/3dOf`, `edoOf`, `dissOf`, `isoOf`, `fieldRowsOf`, `fifthsFor`) with the prototype's size caps. |
| `state/LabProvider.tsx` | The provider: reducer, restore, persistence effects, `useMemo` analyses, the voice engine hook. `state/context.ts` holds the `Lab` shape, `useLab()`, `useViz()`. |
| `state/persist.ts` | Storage keys, `sanitize*`, `load*`, `save*`, the snapshot shape. |
| `state/layout.ts`, `state/vizState.ts` | Pinned-column arrangement rules and its entry-wise sanitising; visualizer settings and their defaults. No React. |
| `audio/engine.ts` | `VoiceEngine`: Web Audio voices (see "Audio engine"). `audio/plan.ts` (what to play, as data), `audio/keymap.ts` (computer keys), `audio/useLabAudio.ts` (hook), `audio/fakeContext.ts` (test double). |
| `components/` | The section components (`Rail`, `Panels`, `GeneratorColumn`, `RingStats`, `TunerStrip`, `SavedSubsets`, `FieldPanel`, `ChordsPanel`, `SpectrumPanel`, `KeysModesPanel`, `Visualizer` with `LatticePanel` / `Lattice3D` / `EdoFitView` / `DissonanceView` / `IsoView`, `RetunerPanel` (live, M7), `KeyboardDock`, `TopBar`, `GlossaryDrawer`) and `lab.module.css` / `panels.module.css`. They read the lab through `useLab()` only. |
| `texts.ts` | The glossary's single source: every tooltip and glossary entry (`TIPS`, `GLOSSARY`, `tipKeys`). |
| `state/retuner.ts` | The retuner slice of the lab state (M7): `RetState`, `RetAction`, `retunerReduce`, `runStep` (calls the lib `retuneStep`), `heldHz`, `makeScorer`, settings defaults and clamping. Pure, no React, no storage. `state/retunerCards.ts`: `cardFromTab`, `cardFromSnapshot` (the notes the engine needs are derived from a tab or a stored snapshot). |
| (removed in M7) | `components/mockRetuner.ts` (the placeholder data) is gone; the rail count and the panel read `state.retuner`. |
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
  templates: ChordTemplate[];                          // chord finder templates
  retuner: RetState;                                   // cards, settings, the run (state/retuner.ts)
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
- Clicking a note anywhere (ring, strip, 2D and 3D lattice, iso keyboard, dissonance marks, compact and full field table)
  calls `clickNote`: it toggles the note in the subset and does not pin. **Alt+click** (Alt+Enter on a focused note) calls
  `pinNote` (action `pin/toggle`): it pins or unpins the note in the inspector and does not toggle it. Views build their
  handlers with `noteHandlers(lab, i)` in `components/ui.tsx` (the 3D lattice passes `altKey` through `onPick(i, alt)`).
  A pinned note is `--mark-yellow` in every view (DECISIONS H-3): `pinRing` on the ring and 2D lattice, a yellow halo in 3D,
  `markPin` on the strip, `data-pin` outlines on iso hexagons, dissonance marks and field-table rows. Hover keeps the `--text`
  `selRing`. The full table's checkbox still toggles.
- The ring draws the selected subset as its own polygon (`subsetFill`, `--text`-based, notes in ring order, in both Chromatic
  and Fifths views) under the blue chord polygon.
- Lattice axes: `rankAxes3d` (lib) scores every three-prime choice by how many selected notes sit on the grid with no stem.
  The picker lists them best first with the count (`3·5·7 — 7/7 on grid`) under an **Auto** entry; `VizSettings.axes3 = null`
  is Auto and follows the best fit as the subset changes, a picked triple stays until Auto is chosen again (a stored triple the
  field no longer offers behaves as Auto). The rail summary shows the effective axes.
- Nearest scale menu: next to `m-ED` it has an **Odd limit...** entry (`PICK_ODD`); `Tab.pick.odd` holds the number (stored as the
  optional `pickOdd`, default 15, clamped 1..255), the one Select button applies it. All / None / Invert are one joined button
  row (actions); SegmentedControl stays for two-state choices.
- Key rings (Keys & Modes) are buttons: a complete ring makes that key the subset with its root as the mode root, Ctrl/Cmd-click
  plays its notes together; heat-grid rows set the current mode.
- "Saved subsets of this pitch collection": a saved subset belongs to the collection whose `genKey` equals its `gen`'s. The list
  shows those; "All" lists the rest (loading one switches the tab to that collection).

### Persistence

Shell pattern (`loadSettings` / `saveSettings` / `sanitizeSettings`, in `state/persist.ts`), page-local keys, never another
page's keys (W-10):

| key | holds |
| --- | --- |
| `hrifa.harmonic-field-lab.settings.v1` | `UiSettings`: active panel, dock open, chord tolerance, ring view / chain / generator, the three visualizers' settings, wave, 1/1 Hz, volume, mode-at-base, scale preview direction (`scalePreview`, Up | Up-down, default Up), saved-list "All". Each visualizer also stores `latMode` (`prime` | `gen` | `cps`, default `prime`); both fields are optional on load. |
| `hrifa.harmonic-field-lab.layout.v1` | The pinned-panel `Layout` (the mock's model, moved here as its own key). Read once from the mock's `...mock.layout.v3` (else v2, else v1) when it is absent. |
| `hrifa.harmonic-field-lab.tabs.v1` | `{ active, list: [{ id, name, snap }] }`. |
| `hrifa.harmonic-field-lab.subsets.v1` | `[{ id, name, ...snap }]`. |
| `hrifa.harmonic-field-lab.chordfinder.v1` | `{ templates: [{ text, name?, family? }] }`: the chord finder's templates (the editor behind Edit templates). Absent, unreadable or all-bad gives `DEFAULT_TEMPLATES`; a stored empty list stays empty; bad entries are dropped one by one, text cut to 80 characters, at most 64. |
| `hrifa.harmonic-field-lab.retuner.v1` | `{ cards: [{ name, snap }], settings: { pivot, manualDeg, anchor, trigger, scorer, scorerOpts: { harmonics, rolloff, oddLimit }, glideMs } }`. A card `snap` is the tab snapshot (below), cleaned to the plain stored shape. Cards and settings only: on/off, the active card, the card roots, the held keys and the history are never stored. Entry by entry: a card with no usable snapshot is dropped, settings fall back field by field, at most 24 cards; at restore a card whose inputs no longer build or select nothing is kept as a dormant spec (`RetState.dormant`, not shown, not playable) and written back at its stored position by every save, so a save never loses a stored card. Nothing is written on mount. |

- A `snap` is the prototype's flat snapshot shape (`gen` as `harmonic | subharmonic | edo | additive | cps | custom`, `rep`, `h`,
  `edoN`, `axes`, `shape`, `dist`, `bidir`, `cpsF`, `cpsK`, `custom`, `mask`, `selCents`, `mode`, `preset` ...) plus optional extras
  (`keepNew`, `pickScale`, `pickKind`, `pickStretch`, `pickM`, `pickOdd`, `pickRef`, `cmpRef`, `cmpOdd`, `cmpM`). Every field is optional with a
  default, so an older snapshot still loads and unknown fields are ignored. A prototype `preset` index maps to the preset name.
  The selection is stored as cents, not indices, and re-matched (within 0.01 c) when the field is rebuilt.
- Sanitising is entry by entry: a bad tab, subset, column, view or share is dropped (or defaulted) and the rest is kept, so
  a future new view or panel cannot wipe a stored layout. Only a value with no usable entry at all falls back to the defaults.
- Restore runs synchronously in the reducer's initialiser, before the first render. Each save effect writes only once its
  part of the state differs from the restored object, so nothing at all is written on mount (a stored value the page could
  not fully use is never overwritten by what it made of it). A `frozen` provider never reads or writes storage.
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

### Retuner (M7)

Engine: `src/lib/harmonic-field/retuner.ts` and the scorers (unchanged, `vectors.json` is the contract). The lab only feeds it.

- A **card** is a whole tab snapshot (`snap`: generation inputs, subset, mode; the plain `toSnapshot` shape, so M8's shelf can
  restore a source from it) plus `notes` / `rep` derived from it (`cardFromTab`: the subset read from its mode root, the same
  `rotateSubset` the keyboard plays). Cards start where the one **Parallel | Relative** switch (`ui.modePlayback`, mirrored in `RetState.relative`) puts them, as `relHz` does for the keys and Play scale: Parallel, the root on 1/1 Hz (`HOME_BASE`); Relative, the root at its own mode root's pitch above 1/1 (`RetCard.root`, from the snapshot's subset and mode; `startBase`). `bases[i]` is where card i's root sits
  now (exact monzo while JI); drift is the chosen card's base minus its start (so the I-vi-ii-V-I vector gives 80/81 in either mode). **Card 0 is home**; "Make home" moves a card to
  the front. Adding, moving, making home or deleting a card, and switching Parallel | Relative, resets the run (every root back on its start: 1/1 Hz in Parallel, the card's own mode root in Relative; card 0 active, no history);
  rename does not. **Reset roots** does the same without touching the list.
- The retuner is on or off (transient). While it is on and has a card (`retunerLive`), a computer or dock key is a degree of the
  **active card** (slot i = degree i mod N of that card, floor(i / N) repeats up), not of the tab. `ret/down` records the held
  key (`{ key: slot, deg, oct, t }`), and with trigger **Auto** and two or more keys held it runs `runStep` (`retuneStep` with the
  settings' pivot, anchor and scorer, `refHz` = the 1/1 Hz setting); **Manual** waits for `ret/retune` (the Retune now button).
  Nothing runs on key-up. When the engine keeps the active card (no pivot, nothing held, no candidate) only `last.why.reason`
  records why.
- Pivot modes manual | lowest | highest | recent | longest; **Manual is by degree** (`manualDeg`, 0-based in the state, shown from 1
  in the panel; the degree need not be held; decision 2026-11-14). Lowest/highest compare slot numbers, recent/longest compare
  key-down time. Defaults: pivot Longest, anchor Freestyle, trigger Auto, scorer Roughness (Sethares, 7 partials, rolloff 0.88),
  glide 120 ms.
- **Voices** (`useLabAudio`): the retuner's held voices are reconciled with `state.retuner.held` after each change (`syncRetuner`):
  a new key starts a voice (id `rt<slot>`) at the active card's pitch, a released key stops it, and a voice whose pitch moved after
  a retune glides there over `glideMs` (`engine.glideTo`; a pivot that does not move does not glide). Window blur, a hidden tab, a
  field change and the Stop button panic as usual and also release the retuner's keys.
- **Lights** (H-2): a retuned pitch lights the tab's FIELD note it coincides with (within 0.5 c, reduced into the repeat; `litIndex`), selected or not, as the tab's own keys light: in Parallel the pitch above 1/1 Hz is read from the tab's mode root (pitch + its root cents), in Relative as absolute pitch. A pitch with no field note lights nothing. The sync effect also depends on the field and the 1/1 Hz
  setting, so changing them while keys are held cannot leave stale pitches or lights. The main views stay on the tab; the retuner panel shows the active card. Known limit: a computer key and a dock mouse press on the same slot share one held entry, so releasing one releases both.
- Panel: cards (rename in place, up/down, make home, delete, add the current tab), controls (on/off, trigger, Retune now, Reset
  roots, pivot, manual degree, anchor, scorer and its options, glide), "Why this card won" for the last retune (each card's root,
  predicted chord in Hz, score, rank, winner; sortable columns; the same chord under all four scorers) and the drift readout
  (cents, as a ratio when exact) with the history of the last 24 retunes. Card numbers are shown from 0 (card 0 = home), degrees
  from 1.

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
  (generation, tabs, selection, Alt+click pin, saved subsets, persistence, sound with a fake context, a frozen lab),
  `HarmonicFieldLab.m6.test.tsx` (axes picker, subset polygon, pin ring, template editor persistence, glossary search, .scl import,
  key rings), `HarmonicFieldLab.webgl.test.tsx` (a refused WebGL renderer), `HarmonicFieldLab.retuner.test.tsx` (the Retuner panel on the page: stored cards, the progression as keys, why and drift, the card list). `state/retuner.test.ts` covers the retuner reducer, key rules, the M2 drift vector as key presses and `retuner.v1` sanitising; `state/retunerLive.test.tsx` the live provider path (real key events, the voice engine on a fake context, glide, lights, panic, storage round trip, bad data). `state/m6.test.ts` covers pin vs toggle, the odd-limit entry
  and `chordfinder.v1`; `src/lib/harmonic-field/rankAxes.test.ts` covers the axis ranking.
- Gate: `corepack yarn check:hfl` (typecheck, oxfmt, oxlint, stylelint, vitest scoped to the lib and this folder).

## Parity with the frozen prototype (M6)

The prototype is `Infinitone Tracing/prototype/harmonic_field_lab.html` (read-only reference). Every control and analysis block of it,
and where it lives now. "Proposed drop" rows need the human's OK; nothing was removed silently. Prototype saved-data import is not
built (the human does not want it).

| prototype control or analysis | live location |
| --- | --- |
| Header: Wave, 1/1 Hz, Vol, Mode root at 1/1 Hz | Top bar, Sound settings menu. Wave is Sine / Harmonic (7 partials) instead of Sine / Saw (decided in M5). |
| Header: Play scale, Play chord, Stop | Top bar transport. |
| Tabs: switch, rename, close, + New | Top bar tabs (Alt+1..9 switches). |
| Tabs: Duplicate | Built: the copy button beside the plus (`tab/duplicate`): a new tab "<name> copy" after the current one, active, with the same generation, selection, mode root and pick settings; stored in `tabs.v1` like any tab. |
| Preset and its info text | Generator column, preset menu with its fact-checked description tooltip. |
| Method, repeat interval | Generator column: method tabs; repeat in the gear fold-out. |
| Starting harmonic, Divisions, Lattice shape (box or diamond, distance, both directions), axes (generator, count, centre), MOS chips, CPS factors and k, Custom list | Generator column, per-method parameters. |
| Load .scl, Export .scl | Custom method (Load .scl file); Saved subsets header (Export .scl). |
| Prime filter All / None / chips | Generator column prime filter fold-out. |
| Ring: click to include or exclude | Pitch circle (click toggles; Alt+click pins). Chromatic and Fifths views are new. |
| All / None / Invert, Mode stepper | Under the ring (joined button row; mode stepper). |
| Pick nearest (scale, m-ED, Targets 12 / JI, Octave to repeat, result text) | Under the ring: Nearest scale menu with its Targets switch and message. |
| Max odd limit and Select | Entry "Odd limit..." of the Nearest scale menu. |
| Include new notes when the field changes | Saved subsets header checkbox. |
| Save subset, saved list (load, delete) | Saved subsets list (load, preview on hover, rename, delete, All collections). |
| Compare to (picked, 12-EDO, JI odd limit, m-EDO) | Tuner strip header. |
| Ribbon (pitches with 12-EDO spacing) | Tuner strip (with 100 c reference lines and the scale steps row). |
| Lattice: Axes = Primes, Ratio labels | Visualizer, Lattice view (2D or 3D, axes ranked by fit with Auto, Ratios checkbox, pop-out). |
| Lattice: Axes = Generators, Axes = Factors (CPS) | Built: an axis-mode switch on the Lattice view (Primes, Generators, Factors; stored per visualizer as `latMode`). Generators needs a field built by the Lattice method, Factors needs the CPS method; otherwise they are disabled with the reason in the tooltip, and a stored mode the field cannot use draws primes. Both are 2D only (the 3D scene is built from prime axes, so the 3D toggle is disabled in these modes); the axis key is drawn bottom left; lights, pin, hover and the inspector work as in the prime lattice. `latticeAltOf` (derive.ts) projects `latticeCoords(field, rep, 'gen' or 'cps')` the way the prototype did (CPS: first factor at the centre, the rest round a circle). |
| CPS chord list (otonal and utonal chips under the lattice; click plays and highlights, Shift-click makes the subset) | Built as a section of the Chords panel shown only for the CPS method (the Chords panel is where chord chips live and the lattice has no room under it): otonal and utonal chips from `cpsChords`; click plays and keeps the highlight (lit in every view), Shift-click makes the notes the subset. |
| Field table (check, #, ratio, cents, step, prime limit, odd limit, vs 12-EDO, vs JI, play) | Field table in the stats column (compact) and Open full table (all columns, sorting, play). |
| Stats: Notes, Steps, Prime limit, Mean Tenney height, Structure, Step sizes | Beside the ring (Stats) and ShapeStats (Structure, step bars). |
| Stats: Period | Built: a Period row in Stats (`periodText`): the ratio when exact plus cents, e.g. `2/1 (1200.00 c)`, cents alone for an irrational repeat. |
| Scale table (degree, ratio, cents above the mode root, step, size) | Dropped (human OK, 2026-11-13; decided in M4 to roll it into the strip): the strip shows ratio, deviation and step letters; cents above 1/1 are in the inspector and the field table. |
| Interval spectrum table; Scale shape full detail pop-up (all clashes, constant-structure example) | Spectrum panel (sizes with counts, propriety clashes, constant structure with its example). |
| Chords: tolerance, ladder (hover, Shift-click rungs), Reset list, templates text (one per line, # name), none-chips with the closest chord | Chords panel: tolerance with minus and plus and a rung ladder, dashed "not yet" chips that raise the tolerance, Edit templates (name, ratios, family, Add, Remove, Reset list; stored in chordfinder.v1). Show all chords is not needed: every voicing is listed. |
| Chord click: play and highlight; Shift-click: make it the subset | Click a chip: sticky highlight and sound. Shift-click a found chip: the chord's notes become the subset, with the chord's root as the mode root (as the prototype did); a dashed "not yet" chip still raises the tolerance. |
| Keys: summary, key chips (click makes the key the subset; Ctrl-click plays), Show all keys | Keys & Modes: key rings (click a ring to select its key: a complete ring makes the whole key the subset, an incomplete one selects the notes the field has, with no change in how it is drawn; Ctrl-click plays the key as a scale, in the direction of the Scale preview setting, Up or Up-down, in the Sound settings menu, which every scale preview uses including Play scale). |
| Modes table (cents above each degree) | Keys & Modes heat grid (click a row to make that mode current). |
| Pop-up panels (full table, all chords, all keys) | Open full table; panels scroll; visualizers pop out. |
| Tooltips on every label | `texts.ts` (hover) and the searchable Glossary drawer with see-also links. |
