# Harmonic Field Lab

Status: M7 approved; M7b built (generator library data layer and its UI: preset browser, Update / Save as new, notice, subset rows). The approved one-screen layout runs on one lab state; the generator, selection, tabs, saved subsets, stats, strip, field table and the Chords (with the editable template list), Spectrum, Keys & Modes, visualizer and Retuner panels are live. Arc: `arcs/harmonic-field-lab`. Route `/harmonic-field-lab` (the frozen layout mock route was retired in M6).

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
| `state/labState.ts` | `LabState`, `Tab`, `Saved` (the legacy flat shape, used only to migrate), `UiSettings`, every `Action` and the pure `labReducer`. |
| `state/generatorLibrary.ts` | The generator library (M7b), pure: `GenLibrary`, owners, subsets as pitches, add / rename / delete, user presets, Untitled generators, Update + Undo, copy, recents, `migrateSubsets`. |
| `components/PresetBrowser.tsx`, `LibraryBar.tsx`, `SavedSubsets.tsx` | The generator-library UI (M7b step 2): preset browser, Update / Save as new, notice, subset rows (see "Preset browser and subset rows"). `state/presetTree.ts`, `builtinFolders.ts`, `noticeText.ts` are its pure helpers. |
| `state/libraryStore.ts` | `generators.v1`: `sanitizeLibrary`, `libraryToStored`, `loadLibrary` (stored, else migrated, else empty), `saveLibrary`. |
| `state/chordShelf.ts`, `state/shelfStore.ts` | The chord shelf (M8a step 1, data layer only): `ShelfState`, `stashChord`, `shelfReduce` (pure), and `chordshelf.v1` (`sanitizeShelf`, `shelfToStored`, `loadShelf`, `saveShelf`). `src/lib/harmonic-field/sketch.ts`: `sketchPitches`, `matchToField`. See "Chord shelf". |
| `state/composites.ts`, `state/compositeStore.ts` | Composite gamuts (M8c; the UI is step 2, below): `CompositesState`, `addItem`, `compositesReduce` (pure) and `composites.v1` (`sanitizeComposites`, `compositesToStored`, `loadComposites`, `saveComposites`). `src/lib/harmonic-field/composite.ts`: `mergeComposite`, `previewAdd`, `samePitches`. See "Composite gamuts". |
| `state/patterns.ts`, `state/patternStore.ts` | Positional chord patterns (M9 step 1, data layer only; the UI is step 2): `PatternsState`, `patternsReduce` (pure), `canonicalPattern`, `chosenPattern`, and `patterns.v1` (`sanitizePatterns`, `patternsToStored`, `loadPatterns`, `savePatterns`). `src/lib/harmonic-field/positional.ts`. `state/sketchChord.ts` `sketchPositionalPitches`. See "Positional chords". |
| `state/derive.ts` | Analysis of the active tab as pure functions (`deriveBase`, `stripDevs`, `spectrumOf`, `chordModel`, `keysOf`, `lattice2dOf/3dOf`, `edoOf`, `dissOf`, `isoOf`, `fieldRowsOf`, `fifthsFor`) with the prototype's size caps. |
| `state/LabProvider.tsx` | The provider: reducer, restore, persistence effects, `useMemo` analyses, the voice engine hook. `state/context.ts` holds the `Lab` shape, `useLab()`, `useViz()`. |
| `state/persist.ts` | Storage keys, `sanitize*`, `load*`, `save*`, the snapshot shape. |
| `state/layout.ts`, `state/vizState.ts` | Pinned-column arrangement rules and its entry-wise sanitising; visualizer settings and their defaults. No React. |
| `audio/engine.ts` | `VoiceEngine`: Web Audio voices (see "Audio engine"). `audio/plan.ts` (what to play, as data), `audio/keymap.ts` (computer keys, keyboard modes, melody shift), `state/linkedMelody.ts` (the linked melody's scale), `audio/useLabAudio.ts` (hook), `audio/fakeContext.ts` (test double). |
| `components/` | The section components (`Rail`, `Panels`, `GeneratorColumn`, `RingStats`, `TunerStrip`, `SavedSubsets`, `FieldPanel`, `ChordsPanel` (with `SketchRow`), `ShelfPanel`, `SpectrumPanel`, `KeysModesPanel`, `Visualizer` with `LatticePanel` / `Lattice3D` / `EdoFitView` / `DissonanceView` / `IsoView`, `RetunerPanel` (live, M7), `KeyboardDock`, `TopBar`, `GlossaryDrawer`) and `lab.module.css` / `panels.module.css`. They read the lab through `useLab()` only. |
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
  library: GenLibrary;                                 // user presets, Untitled generators, subsets (as pitches), recents
  notice: Notice | null;                               // after Update / Save-as-new copy: report + undo (runtime only)
  lastAdded: { id, duplicate } | null;                 // the row Add made or found (runtime only)
  hover, pin: number | null;                           // field index pointed at / pinned (inspector)
  chordHover, chordPick: Set<number> | null;           // highlighted chord (a hovered chip, a clicked chip)
  preview: number[] | null;                            // saved subset pointed at (shown instead of the selection)
  sounding: Set<number>;                               // field indices that sound now (every view lights them)
  ui: UiSettings;                                      // panel, dock, tolerance, ring, visualizers, sound
  layout: Layout;                                      // pinned columns
  templates: ChordTemplate[];                          // chord finder templates
  retuner: RetState;                                   // cards, settings, the run (state/retuner.ts)
  keys: { shift, page, link };                         // runtime: melody shift, shelf page, linked chord id (M8b)
}
Tab { id, name | null, gen: GenSpec, field: Note[], rep: Note, err, sel: number[], mode,
      lastMethod, cmp: {ref, odd, m}, pick: {scale, kind, stretch, m, ref, msg, ok} }
Tab also has `link?: OwnerKey` (the generator it is linked to, stored in tabs.v1 beside the snapshot).
Saved { id, name, gen: GenSpec, selCents: number[], mode }   // legacy subsets.v1 entry only
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
- Subset rows of the current generator: the list shows the subsets owned by the tab's generator (`Lab.owner`), re-resolved against the
  tab's field; "All" lists the rest (loading one switches the tab to its generator). See "Generator library" below.

### Generator library (M7b, step 1: data layer)

A generator is a named preset that OWNS its subsets. An owner is an `OwnerKey`: `b:<built-in preset name>` (the preset's data stays in the
lib's `PRESETS`; only its subsets are stored), `p:<id>` (a user preset `{ id, name, folder, gen }`, folder a plain string `"A/B"`),
`u:<id>` (an Untitled generator `{ id, gen }`: a generator that got a subset before it was named). All subsets live in one flat list
`{ id, owner, name, pitches: Note[], root: Note | null }`: PITCHES (monzo + cents; the mode root as a pitch too), never field positions.

- Identity: `genKey` = lib `generatorKey`: exactly the inputs that decide the field (method, repeat by pitch, prime mask, plus the method's own
  inputs; not the preset label, `keepNew` or the inputs of other methods).
- A tab's generator (`ownerOfTab`): its `link` when that still exists; else the built-in named by `gen.preset`; else a user preset, an Untitled
  generator or a built-in with the same `genKey`; else none. `isModified` = linked but `genKey(tab.gen)` differs from the owner's (the dot).
  Fork on edit: a `gen/*` edit never touches the library; the tab is just modified.
- Resolution: `resolvePitches` (exact monzo, else the nearest note within 0.5 c); a subset re-resolves against the tab's field whenever a row is shown or loaded.
- Add (`subset/add`): current selection to the owner's next row, label `Subset N` (first free), no name needed; an identical pitch set and mode
  root returns the existing row (`lastAdded.duplicate`). No cap. An unsaved or modified tab first forks into an Untitled generator with the tab's
  inputs (an existing one with the same inputs is reused) and links to it, so a subset is never orphaned and a preset is never changed.
- Update preset (`preset/update`; user presets and Untitled only, never built-ins): the owner takes the tab's inputs, every subset re-resolves,
  unmatched pitches and then-empty subsets are removed; `state.notice` carries the `UpdateReport` (`updatedSubsets`, `removedSubsets` + `removed`,
  `affectedSubsets`, `affectedAverageLost`, `mostLost`, `pitchesFound/pitchesTotal`, `detail` per affected subset with kept and lost pitches for
  Show removed) and the undo data. `notice/undo` is defensive: it touches only what the Update changed (the subsets it rewrote or removed, by
  id, plus the generator): a rewritten subset comes back only if it still is what the Update left (one renamed, changed or deleted since is left
  alone), a removed one comes back at its old position, the generator returns only if it still is what the Update set, and no other subset is ever
  touched or removed. The notice also ends at the next generator edit, any tab action except `tab/link`, `subset/add|rename|delete`, `lib/sync`,
  `preset/save|rename|move|delete`, or `notice/dismiss` (a copy notice made by `preset/save` itself stays).
  `updateBlocker(lib, tab)` returns the reason Update would do nothing (no generator yet, built-in owner, nothing modified, unbuildable inputs,
  no notes) or null; `Lab.updateBlocker` and `Lab.canUpdate` expose it so the button can be disabled with the reason. The reducer still no-ops safely.
- Save as new (`preset/save {name, folder, copySubsets?}`): a new user preset from the tab's inputs, tab linked; plain = no subsets, `copySubsets` =
  the owner's subsets re-resolved against the tab's field under new ids (notice kind `copy`, no undo). Naming an unmodified Untitled generator
  promotes it instead (its subsets move). Also `preset/rename`, `preset/move`, `preset/delete` (subsets are KEPT under an Untitled generator with the
  preset's inputs; tabs that linked to it relink), `preset/open {owner}` (builds the generator in the tab, links, Recent), `tab/link`, `recent/push`.
  Recent = last 8 owners used (open, save, add, load).
- Refusals: `addSubset`, `saveUserPreset`, `ensureUntitled` and `copySubsetsTo` refuse (no change, a `refused` reason) at the caps below; the
  reducer then sets `state.refusal = { reason }` (cleared by the next `subset/*`, `preset/*` or `lib/sync` action). `preset/save` with
  `copySubsets` builds `generateField(tab.gen)` itself (the tab's field is stale after a failed edit) and refuses when it does not build.
  `preset/delete` is refused when its subsets would have nowhere to go (Untitled cap).
- Orphaned subsets (owner gone, e.g. a built-in renamed in a later version) stay stored and are written back; `orphanSubsets(lib)` lists them and
  `subset/load` applies one to the CURRENT tab from its own pitches (tab link unchanged); `state.lastLoad = { id, found, missing }` says how many
  pitches the field lacked.
- Caps (equal in memory and at load, so a reload never drops what a session accepted): 2000 presets, 2000 Untitled generators, 20000 subsets,
  4096 pitches per subset.
- Known data-loss rules for corrupt or future data (load drops them; the first save then writes the library without them): a subset whose owner
  key is syntactically invalid (not `b:`/`p:`/`u:` plus text) is dropped; an entry that is not an object, a preset or Untitled entry without a
  usable generator, and a pitch without finite cents are dropped; a monzo that is not plain (non-prime key, non-integer exponent) loses its
  monzo and keeps its cents; a root that is not one of the subset's pitches is repaired to none. A stored preset or Untitled generator with an
  unknown future method or preset name is changed to the defaults (not kept as stored); with duplicate preset or Untitled ids the second
  entry gets a new id, so its subsets end up under the first. Well-formed entries that cannot be used now (owner gone) are kept.
- Legacy `subsets.v1` entries written after `generators.v1` exists (for example by a tab still running an older build) are never migrated:
  they stay on disk, untouched, and are not shown.
- A later Import reuses `applyUpdate` / `copySubsetsTo` unchanged (they take any subsets and any field).

Migration of the legacy `subsets.v1`: at load, when `generators.v1` is absent or unreadable, the flat list is converted in memory (`migrateSubsets`;
nothing is written, so it is idempotent, and `subsets.v1` is never touched or deleted): entries are grouped by `genKey`; a group equal to a
built-in preset's inputs is owned by that preset (the one the entries name, else the first), every other group becomes an Untitled generator; pitches
come from each `selCents` looked up in the field the entry's generator builds (exact monzo when a note is within 0.01 c, else cents only; a generator
that does not build gives cents-only pitches), the root is the pitch at the stored mode (the first when out of range). Every entry appears with its id
and name. The first library change writes `generators.v1`, which is then authoritative.

### Chord shelf (M8a: step 1 data layer, step 2 UI below)

`LabState.shelf: ShelfState` holds the stashed chords, the selection, the sketch row and two runtime notes. Everything is plain data (a later Workbench
hand-off can read `chordshelf.v1`; W-1: midicents only at the hand-off).

- A chord (`ShelfChord`): `id` (`c<N>`, never reused), `name`, `pitches` (the EXACT pitches heard, monzo + cents, root first, in the order played; for a
  sketch chord `sketchPitches(root, template)` stacks the template's integer ratio on the root, not reduced into the repeat), and provenance:
  `template` (text or null), `rootDeg` (the root's degree in the source subset read from its mode root, null when unknown), `tol` (the chord finder
  tolerance), `date` (ISO, passed in by the caller), `refHz` and `frame` (`parallel` | `relative`: the reference frame at stash time), `parent` (the shelf
  chord whose reloaded tab it was stashed from, lineage; a deleted parent leaves a dangling id on purpose, ids are never reused), and `source`
  (`{ gen, tab, subset: { pitches, root } }`: the tab's generation inputs as in `generators.v1`, its name, and its subset as pitches; null when the
  tab had no selection or the stored source was unusable: the chord still plays but cannot be reloaded).
- Pitch frame rule (human decision 2026-11-14, chord frame changed 2026-11-15): `pitches` are FIELD-ABSOLUTE, the field's own pitches above 1/1, identical whether
  stashed in Parallel or Relative (`frame` only records the switch). For CHORDS the Parallel | Relative switch (key 0) is `chordPitchesFor(chord, frame)`:
  Relative plays them as stored; Parallel divides each by the chord's OWN root (`pitches[0]`, root first), so every chord starts on 1/1 (parallel major / minor).
  Example, 12-EDO with mode root C: C major (0, 400, 700 c) and E minor (400, 700, 1100 c); Relative plays those, Parallel plays 0, 400, 700 and 0, 300, 700.
  The same rule applies to the shelf slot (click, hold 1, Play selected), the chord keys, the chord chips (`chordPlan(field, members, p, rootIdx)`,
  `playFieldChord(idx, rootIdx)`) and Play sketch (`abs[0]` on 1/1). It does NOT apply to hold 4 / hold 5 (the pointed note is the root; they keep
  `framedCents(p, c)` in `plan.ts`: `modeAtBase ? c - rootC : c`, the mode-root rule), nor to mode previews, Play scale, Play chord on a highlighted chord (no root
  known: mode-root rule) and the computer melody keys, which keep the mode-root rule. The linked melody has its own frame (below).
  Lights always land on the stored field-absolute pitch in both frames (H-2): `pitchesPlan(..., light)`.
- Actions: `shelf/stash { stash: StashRequest }` (the UI supplies the pitches, template, rootDeg, optional name and the date; tolerance, 1/1 Hz, frame,
  generator, subset, tab name and parent are read from the active tab and `ui` by the reducer), `shelf/rename`, `shelf/move { id, to }` (clamped),
  `shelf/delete`, `shelf/select { id, additive? }` (plain: only this slot, again clears; additive: toggle), `shelf/selectAll`, `shelf/selectNone`,
  `shelf/sync` (another window saved), `shelf/reload { id }`, and the sketch: `sketch/set { patch: { template?, rootDeg? } }`,
  `sketch/arm { template, rootDeg? }` (from a chord chip or a shelf chord), `sketch/disarm`. `Sketch = { template | null, rootDeg, armed }`; a hand-picked
  template clears `armed`. Refusals (empty chord, the caps, a source that will not reload) set `shelf.refusal`; it is cleared by the next successful stash, rename, move, delete, sync or reload (not by select or sketch actions).
- Reload (`shelf/reload`): a NEW tab at the end, which becomes active; every existing tab is untouched. The stored generator inputs are rebuilt, the stored
  subset is re-resolved against that field (`resolveSubset`, exact monzo else 0.5 c; nothing found selects all), the mode is the stored root's. The tab links
  to an owner by the M7b owner lookup (`ownerOfTab`) only when that owner's generator has the same `genKey` as the stored inputs (a stale preset label is
  not trusted; the lookup is retried without the label and the tab then takes the inputs that matched, so a stale label is cleared; when two presets share a `genKey` the lookup's own order decides which one it links to); otherwise the tab is unlinked and `gen.preset` is cleared. Nothing is created in the library, no
  Recent entry. The tab records `fromChord` (stored as `from` in `tabs.v1`, copied by Duplicate), so chords stashed from it get `parent`.
  `shelf.lastReload = { id, found, missing }` says how many source pitches the rebuilt field had. Refused at 12 tabs, with no source, or when the
  inputs do not build.
- Persistence (`shelfStore.ts`, effect in `LabProvider`): written only when `shelf.chords` differs from the restored one (no write on mount); a chord whose
  pitches are damaged (not 1 to 64 usable pitches) is dropped at load (a wrong chord is worse than none), an unusable `source` only loses the source, every
  other field falls back to its default; unknown extra fields are not kept; a monzo that is not plain loses its monzo and keeps its cents. A storage event for
  the key (or a clear) dispatches `shelf/sync`. Selection, sketch, `lastStashed`, `lastReload` and `refusal` are runtime only.
- Pure helper for the sketch row (lib `sketch.ts`): `matchToField(field, rep, pitches, tol)` gives, per pitch, the field index it lands on (repeat-aware) or the
  signed distance in cents (field note minus pitch, so positive = the nearest field note is above) to the nearest field note, wrapping around the repeat.

#### Shelf UI (M8a step 2)

| piece | where | what it does |
| --- | --- | --- |
| Shelf panel | `components/ShelfPanel.tsx` | Panel id `shelf` (rail label "Shelf", summary "n chords"; pin, stack and splitters like the others; `PANEL_IDS` gained `shelf`, `DEFAULT_LAYOUT` does not pin it, stored layouts load unchanged because sanitising is entry by entry). Slots (`ul` "Chord shelf"): a small ring drawing of the chord (blue polygon, `--mark-blue`), the name (click to rename, Enter keeps, Escape cancels; "Chord N" is automatic, muted italic), "n notes . template", up / down, Reload, Delete (one button, as Delete all: the second click reads "Delete?" and confirms; mouse-away, blur and Escape cancel). A checkbox per slot is the additive multi-select (`shelf/select { additive }`); the strip has **Play selected** and **Clear selection**. Click on the drawing plays the slot with the sticky chord highlight (as a chord chip); hover highlights its field notes; hover + hold 1 holds it, and on one of several selected slots holds all selected ones layered. Notes line under a slot: "parent removed" (dangling `parent`), "from <parent name>", and after Reload "Reloaded as a new tab: n of m source pitches are missing ..." (`shelf.lastReload`); `shelf.refusal` shows as a red line at the top; empty shelf shows a hint. |
| Delete all | `ShelfPanel.tsx` (`DeleteAll`), `shelf/clear` | Top edge of the panel (header strip): disabled when the shelf is empty; first click reads "Delete all N?", the second dispatches `shelf/clear` (all chords and the selection removed, `next` kept so ids are never reused, lineage links dangle as designed; saved through the normal save path, never on mount). Mouse-away, blur and Escape cancel. |
| Sketch row | `components/SketchRow.tsx`, top of `ChordsPanel` | Template dropdown (`NativeSelect`, family-grouped by `familyOrder`, value = template text; the first template is picked on mount when `sketch.template` is null), root degree stepper (`rootDeg % N`, shown 1-based, wraps), **Play sketch** and **Stash**. `sketchPitches(root, template)` gives the exact chord on the field note of that degree; `matchToField` marks found notes (blue border, "in field") and prints outsiders dashed with the signed cents to the nearest field note. Hover on the notes highlights the found field notes and sets a hold-1 target. |
| Stash from a chip | `ChordsPanel.tsx` (`Chip`) | A found chip has a "+" button in a slot of its own at its right edge (always reserved by the chip's right padding via `data-stash`, shown with `visibility` on hover or focus, so nothing moves or is covered; CPS and not-yet chips have no "+" and no slot) that dispatches `shelf/stash` with the chip's field notes, root first then upward from the root, template and root degree. |
| Sketch keys | `useLabAudio.ts` (keydown), `state/sketchChord.ts` | A computer melody key (slot i) also dispatches `sketch/set { rootDeg: i mod N }` (N = the tab's subset size, also while the retuner is live; runtime only, nothing stored, no extra sound or stash; not when the linked melody plays another chord's subset; `,` and `.` are the melody shift since M8b and set no root). **`=`** (also `+`, Shift+=; physical code `Equal`) stashes the current Sketch exactly as the Stash button does (`sketchChord`: root degree, As in field | Exact, tolerance), with the shared guards (not while typing, no Ctrl/Alt/Meta, no key repeat). No conflict: nothing else uses `=` / `+` (browser zoom needs Ctrl, which is ignored). |
| Armed chord | `ChordsPanel.tsx`, `ShelfPanel.tsx`, `useLabAudio.ts` | Clicking a chip that plays, or hold 1 on it, dispatches `sketch/arm { template, shape }` (click also sets the root degree of the chip); playing a shelf slot arms its template and its stored realization. The Sketch row has a two-state switch **As in field | Exact** (`Sketch.exact`, default As in field) that Play sketch and Stash follow: a stash stores the pitches actually heard (field-absolute, H-7; no new stored field). The row's line reads "<template> . as in <generator name>" or ". exact". |
| Hold 4 / hold 5 (note: the shape is ROOT POSITION, every note stacked above the root, so for a chord that wraps the repeat it differs from the chip's own field-reduced voicing by design, pending the human's confirmation) | `useLabAudio.ts` (`playTarget`), `plan.ts` (`ARMED_DIGITS`, `pitchesPlan`), lib `sketch.ts` (`sketchShape`, `placeShape`) | A chord is a template label plus a REALIZATION, kept as a SHAPE (`Note[]`: intervals above the chord's own root, root first, errors inside). Hover a note (or a strip mark) and hold **4** = the armed chord AS IN THE FIELD: the shape moved rigidly onto that note (12-EDO armed 4:5:6 = 0, 400, 700 c; on a 200 c note: 200, 600, 900 c). Hold **5** = EXACT: the template's true ratios on that note (200, 586.3, 902 c). The shape is `Sketch.shape` (set by arming from a chord chip, `chordShape`, or from a shelf slot, its stored pitches over its first); with none (a template only picked in the row) the field realizes the template at the sketch root (`realizeTemplate`: each exact pitch snaps to the nearest field note within the chord tolerance `ui.tol`, else stays exact). `LabProvider` passes `sketch { template ?? templates[0], shape, rootDeg }`. Voices are held at `chordAmp(n)`; sweep, release, blur, panic and key-up by physical code work as for hold 1. Keys 1, 2, 3 and Alt+1..9 are untouched; **key 0** (plain, not typing, no Alt/Ctrl/Meta, no repeat) toggles Parallel | Relative (it was key 5); 0 is no note key and Alt+0 does nothing. |
| Exact pitches | `PreviewTarget { kind: 'pitches', key, cents }`, `LabAudio.playCents` | Shelf slots, layered selections and the sketch play cents above 1/1 at their own pitch (like `playFieldChord`), each lighting the field note within 0.5 c (`litIndex`), else nothing (H-2). The cents of a stashed chord are `chordPitchesFor(chord, ui.modePlayback)`; the sketch and hold 4 pass `framedCents` of the exact pitches. Every one of them passes a `light` array (field-absolute cents) so lights stay on the notes that coincide in the chosen frame. |

#### Ghost marks (M8a follow-up)

A sounding pitch that matches no field note of the tab (`litIndex` = -1: Sketch outsiders, hold 4 on an off-field root, retuned notes off the field) is shown as a **ghost**: a dashed, unfilled circle in `--mark-green` (the sounding colour, H-2) at its true place.

- Model: `Planned.ghost` (cents above 1/1, set by `pitchesPlan` when `src` is -1, from the light cents so Parallel shelf chords ghost at the field-absolute pitch) and the retuner's off-field voices. `useLabAudio` counts them by pitch (`ghostLights`, a second `LightCounter` keyed by `ghostKey` = cents to 0.01 c, so two sounds of one pitch end together) and reports them in `sounding { ghosts }`; `LabState.soundingGhosts` / `Lab.soundingGhosts` hold the cents; field lights (`sounding`, `soundingMarks`) are unchanged. Panic, field change and unmount clear them with the other lights. Runtime only.
- Coverage: every off-field sounding source reports a ghost through the same counter: `pitchesPlan` (Sketch, hold 4/5, shelf), mode previews (`modePreviewPlan` tones with no field light, e.g. a pure Parallel degree, ghost at the pitch it sounds at above 1/1), strip targets (`stripPreviewPlan`: the target keeps its strip mark and also ghosts at `note - dev`), and the retuner. `light(i, on, markOnly, ghost)` counts the field light and the ghost separately. Play scale and the computer keys always light a field note (`slotPitch` plays subset notes), so they never ghost.
- Pure part: `state/ghosts.ts` (`ghostKey`, `ghostCents`, `ghostsOf(field, repC, cents)`: reduced into the repeat, de-duplicated, sorted, with the signed distance to the nearest field note and the tooltip text; the ratio is not shown because only the cents are kept).
- Drawing: `components/GhostMarks.tsx`: the ring (Chromatic view only, a dashed circle on the ring with a `<title>` and aria-label; the Fifths view has no place for an arbitrary pitch), the tuner strip (`StripGhosts`, a dashed circle level with the marks at the pitch's column) and "+N outside" in the ring caption (`OutsideCount`, both ring views). No label text is drawn, so `labelLayout` is not involved. The other views (lattices, keys, field tables, iso keyboard, dissonance) show nothing.

Tests: `state/ghosts.test.ts`, `audio/plan.test.ts` (ghost on `pitchesPlan`), `HarmonicFieldLab.ghosts.test.tsx`.

Tests: `HarmonicFieldLab.shelf.test.tsx` (sketch, stash from the row and a chip, shelf play, hold 1 layering, rename, reorder, reload, delete; hold 4 on notes, sweep, armed template, typing), `plan.test.ts` (`pitchesPlan`), `layout.test.ts` (the `shelf` panel id).

### Composite gamuts (M8c step 1: data layer, merge lib and Developer options; step 2, the UI, is the last subsection)

Decision H-8. A composite combines chords, subsets and single notes from any generator into ONE gamut. Everything is plain data.

- Merge rules (lib `composite.ts`, pure): the repeat is the FIRST item's source repeat (`item.rep`), else the current tab's repeat when the composite is
  empty or the first item has none; every pitch of every item is reduced into `[0, repeat)` (a Bohlen-Pierce 3/1 chord in an octave composite lands in the
  octave; the monzo survives when both pitch and repeat have one, else cents-only). Pitches are placed in item order: a pitch within the merge tolerance
  (inclusive, linear distance inside the repeat, no wrap-around at the repeat) of a note already placed merges into the nearest one. `keep: 'first'` (default) keeps
  the pitch placed first, `'recent'` the last; the same pitch (within 1e-6 c) with an exact monzo always beats a cents-only twin. Each merged note keeps its
  `origins` (item ids). With tolerance 0 only identical pitches merge, so the pitch set is independent of the item order.
- `previewAdd(items, candidate, fallbackRep, opts)` is what step 2's popup draws: `added` (new notes), `common` (merged into an existing note: the pitch and the note
  as it was), `dropped` (vanish because, once reduced, they coincide with an earlier pitch of the same item: an octave doubling), `already` (an item with the same
  pitches is in it, `samePitches`), plus `before` (the composite's notes) and `rep`.
- State (`LabState.composites: CompositesState`): `list` of up to nine `Composite { id (1..9, its number), name ("Composite N", renamable), items, next, updated }`,
  `recent` (most recently used ids first, runtime), `lastAdded` (runtime) and `refusal`. An id is the lowest free number: freed on delete, reused only after.
  Actions: `composite/new`, `/rename`, `/delete`, `/clear`, `/addItem { to: number | 'new', item, date }`, `/removeItem`, `/use`, `/sync` (storage event), and
  `/openTab { id, merge? }`. A duplicate item (same pitches in any order), a full composite (64 items), an item with no usable pitch or over 2048, a missing number,
  nine composites and an empty or unbuildable `openTab` are refused WITH a reason in `composites.refusal` (never silent; cleared by the next success). Items are
  made plain as a load does (`sanitizePitch`), so what a session holds is what a reload gives back.
- Composite generation method: `Method` gained `'composite'` (not in the `METHODS` picker; only `composite/openTab` makes it, `gen/method` to it without a snapshot is
  ignored) and `GenSpec.snap?: CompositeSnap { id, name, rep, notes }`. `generateField` builds the field from the snapshot (`buildField`, so the prime filter still
  applies; the `rep` text is only a label). `openTab` builds a NEW tab at the end (current tabs and the library untouched, the new tab active, all notes selected):
  a FROZEN snapshot of the merged notes at that moment; editing or deleting the composite later changes nothing. The tab "records fromComposite" as `gen.snap.id` and
  `gen.snap.name` (no separate Tab field, so a chord stashed from it carries it in its `source.gen`). The generator header (step 2) reads `gen.snap`.
- Storage: `tabs.v1` snapshots store `gen: 'composite'` and `snap` (entry by entry: an unusable note is dropped, a cents-only note loads cents-only, an unusable repeat or an
  empty list loses the snapshot, the tab keeps method composite and shows the error with its stored selection held as `pending`). `genToStored` includes `snap`, so a shelf
  chord stashed from a composite tab (and an Auto-saved generator made by `subset/add` on one) reloads through the stored snapshot: `shelf/reload` rebuilds the field from
  `source.gen.snap`, no library write, no link. `genKey` of a composite is its pitches (`generatorKey` in lib `library.ts`), not its name. Old data is unchanged: no
  `snap` key is written unless the generator has one.
- `composites.v1` (`compositeStore.ts`, effect in `LabProvider`): written only when `composites.list` differs from the restored one; a storage event dispatches
  `composite/sync`. An item with damaged pitches is dropped at load; an unusable `source` or `rep` only loses that; an invalid or repeated number takes the lowest free one;
  beyond the caps the rest is not loaded.
- Developer options (`developer.v1`): `mergeTolerance` (0 to 50 c, default 5) and `mergeKeeps` (`first` | `recent`, default first), passed to `composite/openTab` and
  step 2's preview by the UI. RULE (human, 2026-11-15): the Developer menu is grouped into sections by what and where a control affects: Tooltips (tooltips, delay), Mode
  display (sign always, keep the mode root), Playback and keys (linked melody root default), Composites (merge tolerance, merged note keeps). A new control goes into the
  section it affects, or a new one. Storage keys and defaults of the old options are unchanged.
- Tests: `src/lib/harmonic-field/composite.test.ts` (the confirmed scenarios), `state/composites.test.ts` (reducer, openTab, tabs.v1, shelf reconnect, storage round trip and
  bad data), `state/compositeProvider.test.tsx` (no write on mount, save, storage event), `HarmonicFieldLab.signs.test.tsx` (Developer menu sections and options).

#### Composites UI (M8c step 2)

Everything reads and writes through `useLab()` and the actions above; no reducer semantics changed. Stored layouts are unchanged: `composites` is a new panel id (`PANEL_IDS`, not in `DEFAULT_LAYOUT`; layout sanitising stays entry by entry).

| piece | where | what it does |
| --- | --- | --- |
| Composites panel | `components/CompositesPanel.tsx` (rail id `composites`, summary "n composites"; pin, stack and splitters like the others) | One row per composite: number, small ring of the merged notes (`mergeComposite` with the Developer `{ tol, keep }`), name (click to rename in place, Enter keeps, Esc cancels; "Composite N" is automatic, muted italic), "n notes . m items", **Items** (expands the item list: label, "kind, n notes . from <tab>", a remove button; each item is a send source), **Open as tab** (`composite/openTab { id, merge }`; disabled while empty), Delete (two clicks: bin, then "Delete?"). The strip has **New composite**. `composites.refusal` is a red `role="alert"` line, `lastAdded` a status line "Added X to Composite N."; an empty hint explains how to send things. |
| Send registry | `state/sendStore.ts` (module store, runtime only) | The hovered SOURCE registers a getter (`enterSend(id, get, el?)`, `leaveSend`; the hook `useSendHover` in `Send.tsx` also clears on unmount); the item (`SendItem { kind, label, pitches, rep }`) is built when needed. The popup and the right-click menu hold the item captured at open (the pointer may move on). `sendHasKey(event)` is read by `useLabAudio`'s key handler first: true for any event the popup took (a `WeakSet`, so the order of the two window listeners does not matter) and for any digit while the popup is open. |
| Sources | ChordsPanel `Chip` (found chips only: kind chord, "major triad on 200 c", its field notes root first then upward), ShelfPanel `Slot` (kind chord, its stored exact pitches), SavedSubsets row (kind subset, the stored pitches; `el` guards a row deleted under the pointer), KeysPanel `KeyRing` mini ring (kind subset, "Key on X", the key's found notes), composite item rows (their own kind), and any ring, strip, lattice, table or key note (`lab.hover`, kind note, "3/2 (702.0 c)"). A registered source wins over the note under the pointer. The big Keys ring is not a source (its notes are, as single notes). |
| `-` popup | `components/Send.tsx` (`SendLayer`, mounted once in `HarmonicFieldLabApp`; `SendPopup`, `PopupRow`) | Plain `-` (no Ctrl, Alt, Meta or Shift; not while typing; no key repeat; nothing without a hovered source) opens a dialog "Send to composite" near the pointer. It names the item ("major triad on 1/1 (chord, 3 notes)") and lists the composites by number: a ring drawn by `CompositeRing` (small dots = notes already in it; filled = the item merges into one within the tolerance; hollow with a plus = new; struck through = dropped by reduction; from `previewAdd` `before / common / added / dropped`) and one line "1 new, 2 common" or "already in composite N" (the row is dashed and disabled). **1 to 9** send to that number (a number with no composite does nothing), **0** = New composite (then sends), Esc or `-` again cancels. While open it takes the digits first: no hold previews, no Alt+digit tab switch and 0 does not flip Parallel | Relative; letters, `,`, `.`, `=` keep working. It closes on send, Esc, window blur, a tab switch and a mouse press outside it; the pointer leaving the target does NOT close it. The popup stays where it opened (its position is stored in `sendStore` at open). Provenance: an item carries its own `source` and `rep` where it knows them (shelf chord: the generator and tab it was stashed from; saved-subset row: the owner generator; composite item: its original source), so a Bohlen-Pierce shelf chord sent from an octave tab keeps the BP generator and a 3/1 repeat; only chips, key rings and notes take the active tab (`undefined` source). Sending an item already there is refused by the reducer ("Already in Composite N.") and shown. |
| Right-click menu | `Send.tsx` (`SendMenuBody`) | `contextmenu` on the window: the browser menu is replaced by a Mantine `Menu` at the pointer only when the event target is inside the hovered source's element (`hoveredSendAt`, the element is stored by `useSendHover`) or when the MOUSE put the hovered note under the pointer (`noteIsMouse`: a note that is merely focused never takes the menu), nothing else handled the event (`defaultPrevented`) and the user is not typing. There is no modifier guard, so anything the browser reports as a context menu (Ctrl+click on a Mac, Shift+F10, the menu key) is taken the same way when the pointer is on a source. "Send to composite ›" opens a sub-menu with the three most recently used composites (`composites.recent`, "4 Composite 4"), a divider, "New composite" and "All composites ›" (every composite; one that already holds the item is disabled). Sub-menus also open on click. Alt, Shift and Ctrl+click on a note or chip keep their meaning. |
| Shelf strip | `SendMany` in `ShelfPanel.tsx` | **Add selected to composite ›**: a menu of composites and New composite; each ticked chord becomes its own item (a new composite is made once for all of them); duplicates (already in the target, or repeated in the selection) are skipped and summarised ("2 added, 1 already there." or "Nothing added: all 2 are already in Composite 1."). |
| Confirmation | `SendLayer` | A small bordered status line, bottom left, for 3.5 s after a send ("Added X to Composite N.") or a refusal (red border); the rail count and the panel show the rest. |
| Generator header | `GeneratorColumn.tsx` | On a Composite tab: "<name>: snapshot, N notes. Frozen when the composite was opened as a tab: changing the composite later does not change this field." The 'Comp' segment stays as the stopgap. |
| Keys | `useLabAudio.ts` `down` (first lines), `Send.tsx` | `-` conflicts checked: nothing else uses `-` (`=` stashes, 0 to 5 holds, `[`/`]` page, `,`/`.` shift, melody and chord keys are letters, Alt+digit tabs); browser zoom (Ctrl+-) is ignored by the `ctrlKey` guard. Documented in `texts.ts` (`sendToComposite`, `keyboardMode`). |

Tests: `HarmonicFieldLab.composites.test.tsx` (popup open and naming, the 5 c preview scenario, digit 2 and the "already" refusal, digit capture and release on Esc and blur), `HarmonicFieldLab.composites2.test.tsx` (menu order and divider, panel rename / items / Open as tab / delete confirm, shelf Add selected), `layout.test.ts` (panel id).

#### Send mode, item detail and the popup (M8d, H-10)

- **Mode** (`state/sendMode.ts`, pure): `SendMode = 'field' | 'exact'`. `sendPitches(item, mode)` is the one function the popup preview, the digits, the menu and the shelf button all use, so the preview ring shows what is sent. A `SendItem` may carry `exact` (its true ratios on the same root; only ratio chord CHIPS have it), `fixed` (+ `fixedReason`) and `stash` (what the menu's Stash on shelf stashes). `sendModeReason(item)` is the text beside the disabled slider: a positional chord ("A positional chord is fixed: it always sends its field notes."), a STASHED SHELF CHORD (`shelfChordItem` is always `fixed`, reason "always sends exactly the pitches it was stashed with": only chips follow the As in field | Exact switch), CPS chips and notes/subsets/selections (no separate exact ratios).
- **Popup** (`Send.tsx`, `sendStore.ts`): `view.popupMode` is the popup's OWN mode, set on open from the shelf switch (`sendModeOf(state.shelf.sketch)`), changed by its slider (`ModeSwitch`, a Mantine SegmentedControl labelled "Send mode") or by `E`. `E` is handled in `SendLayer` only while the popup is open and `sendHasKey` makes the keyboard notes stand aside for a plain E only then; it does nothing when the mode does not apply. The popup is wider (26 rem): an item stats panel (`PitchStats`: cents for every note, ratio and monzo text only in Exact, via `pitchRows`/`monzoText`) and one row per composite with a larger ring (`CompositeRing big`), the effect line and "N merged notes now, M after". Row 0 (New composite) and the digits send with `popupMode`.
- **Menu**: its mode is the shelf's switch; Shift+click on a composite or New composite sends in the other mode (a hint label says so when the mode applies). The already-in-it check uses the mode the click would send in. A chord chip, CPS chip or positional row also gets a first entry "Stash on shelf" (`StashEntry`, the same as its + button); other sources have none.
- **Item detail** (`composites.ts`): `ItemDetail = { template, root, pattern, tail, family? }` (M8f: `family` is the template family of a ratio chord CHIP, set at send time from the template, never "Other" for a template with none; additive, trimmed, 80 chars, written only when set, old items load unchanged); the cents list is NOT stored: `centsList(item.pitches)` derives it where shown, and a legacy stored `cents` array is ignored at load and never written. `ShelfChord.tail` keeps the positional tail line (stash from a positional row passes `tail`).
- **Composites panel** (`CompositesPanel.tsx`, `itemLines`, M8e): every item is four lines: (1) `<template> <kind name> on <root> c` (kind name = the label before " on ", root = first pitch via `centsList`; a positional chord, with `detail.pattern`, shows its label such as `2-2 on 4`; subsets and notes show their label), (2) `chord · n notes` / `subset · n notes` / `selection · n notes` / `note`, plus ` · <family>` for a chord or selection that has one (`chord · 3 notes · Septimal`), (3) the cents of chords and selections (one decimal; a positional chord adds its tail on the same line), (4) `Source: <preset or auto generator name>`. The old origin line is gone. **Hover highlight**: hovering an item sets the row's `lightItem`; the ring gets `lit` (cents of the merged notes whose `origins` include that item id, from `mergeComposite`), drawn as a blue chord ring (`data-kind="lit"`, class `bigKeyChord`, the same style as the Keys and pitch ring chord highlight, no new colour); a note shared by several items lights for each.
- **Positional order** (`Positional.tsx`): Smoothest | Scale order toggle over lib `positionalList`, applied in EVERY pattern group; Scale order shows each row's score and rank (`positional-score`), Smoothest shows rank only. Persisted in settings.v1 as ui.positionalOrder.
- **M8f Positional list** (`Positional.tsx`): the pattern picker is gone (the patterns editor stays in Edit templates). `PositionalSection` stacks one `PositionalGroup` per pattern of `state.patterns.list`, each foldable (header = pattern name + row count, `n` rows when the pattern fits the subset, 0 with a hint when too small), all open by default; `PositionalRows` (ranking via `positionalChords` -> `positionalList` -> `positionalNaming`) is only mounted while its group is open, so a folded group never ranks and each group ranks among itself. A row is one full-width line: drawing | label | cents line over `tail` and `~ ratio` | rank column (`#n`, plus the score in Scale order); 120 rows per group. The Positional section's count is the sum of `n` over the patterns that fit (no ranking needed). List aria-label is `Positional chords <pattern>`.
- **M8f Folds** (`Fold.tsx`, `FoldHead`, `useFold`, `foldId`): header = a real button with a chevron and `aria-expanded` (Enter/Space), the count beside it (kept while folded). Ids: `cps`, `positional`, `pos:<pattern>`, `families`, `size:<Triads|Tetrads|Larger>`, `fam:<size>:<family>` (cut to 60 chars). State lives in `settings.v1` `ui.folds` (`Record<string, boolean>`, only `true` is stored; absent = open; `sanitizeFolds`: only `true` entries, id 1..60 chars, at most 256, damaged data = all open; nothing written until a fold is toggled).
- **M8f silent root keys** (`useLabAudio.ts`, key handler): in the Chords keyboard mode (`playsMelody` false) a melody-position key (`slotOfEvent` + `slotTarget` on THIS tab's `base.rel.length`) dispatches `sketch/set { rootDeg }` and nothing else: no `held` entry, no voice, no preview, even with the linked melody active. Repeat, typing and modifier keys are filtered earlier in the same handler; shelf chord keys and `,` `.` `[` `]` are handled before and unchanged. Notes and Split are unchanged.
- **M8f Composites row** (`CompositesPanel.tsx`, `panels.module.css`): `.compHead` = number, ring (4.5 rem, left), `.compBody` text column (name, `x notes · y items`, then Items / Open as tab / Delete). The `-` popup ring (`compRingBig`) is unchanged.
- **CPS chips** (`ChordsPanel.tsx`, `CpsChip`): the same wrap as a ratio chip (stash +, `useSendHover`, preview target with `rootIdx` = lowest note and `template` = `4:5:6` or `1/(4:5:6)` when its factor names are whole numbers, click arms the Sketch row). Their item is not Exact-capable (the field notes are already exact).
- Wording: the composite tab is no longer described as a "frozen snapshot" in the UI (generator header, tooltips); the behaviour (no live link) is unchanged.
- Tests: `state/sendMode.test.ts`, `HarmonicFieldLab.sendmode.test.tsx` (scenarios a to g, E, Shift+click, fixed shelf chord, Scale order).

### Preset browser and subset rows (M7b, step 2: the UI)

Everything below reads the library only through `useLab()` and the actions of "Generator library" above; no reducer semantics changed.

| piece | where | what it does |
| --- | --- | --- |
| Preset control + browser | `components/PresetBrowser.tsx` | A button showing only the owner's NAME (aria-label `Preset: <full path>`) plus an orange (`--mark-orange`) dot at the START of the line (before the name) (`data-modified`) when `Lab.modified`. It opens a popover: search box (focus stays there), a tree (`role="tree"`) or, while typing, a flat `listbox` of results each with its folder path, and, for the highlighted preset row (mouse or keyboard), its description in a fixed info line at the bottom edge of the picker (content, so the Developer Tooltips switch does not hide it; a visually hidden live region repeats it for screen readers). `PresetCrumb` (same file, rendered in `GeneratorColumn` under the control) shows the full path (`Equal divisions > Non-octave > Carlos Alpha (9 ED 3/2)`; user presets `My presets > Pools > Seven > Name`; Auto-saved `Auto-saved > <auto name>`; `(edited by hand)`) as a small muted wrapping line (`data-testid="preset-path"`). Keys on the search box: Up/Down move, Right opens a folder (or steps into it), Left closes it (or goes to the parent), Enter picks or toggles, Escape closes; Left/Right only act on the tree while the box is empty. Choosing a preset dispatches `preset/open { owner }`. Rows of user presets show Edit (rename and folder path, then `preset/rename` and `preset/move`; the tree follows the preset to its new folder) and Delete (asks first: "Subsets stay under Untitled", then `preset/delete`). Counts: folder rows sum their subsets, preset rows show theirs (always for user presets, only when above 0 for the others). |
| Tree data | `state/presetTree.ts` (pure) | `buildTree(lib)`: roots Built-in, My presets, Recent (`lib.recents`, last 8), Auto-saved (the `u:` generators, only those that hold subsets). `visibleRows`, `searchPresets` (every word must be in the name or folder path; Recent is skipped, it repeats the others), `ownerPath`, `foldersAbove`. |
| Built-in folder table | `state/builtinFolders.ts` (pure) | A presentation table keyed by preset name: `BUILTIN_SUBFOLDERS[group][subfolder] = names`. A preset not listed sits at the top of its group, so `presets.ts` and `vectors.json` are untouched. Split: Equal divisions: Small (5 to 12), Medium (19 to 31), Large (41 to 72), Non-octave (Bohlen-Pierce, Carlos Alpha, Beta, Gamma); Additive / lattice: Pythagorean, Meantone, Just lattices (Ellis's Duodene, the 3x3x3 box, three diamonds), Golden generator stays loose; Combination product sets: Tetrads, Hexany, Dekany, Pentadekany, Eikosany, Larger sets (the two 35-note CPS and the Hebdomekontany); Historic & custom: European (Ptolemy, Werckmeister III), the rest loose; Harmonic series is not split. `builtinFolders.test.ts` checks every table name is a real preset in its own group and listed once. |
| Split button | `components/LibraryBar.tsx` (`LibraryActions`) | **Update preset** (`preset/update`; disabled when `!Lab.canUpdate`, the tooltip carries `Lab.updateBlocker`, so a built-in owner shows "Built-in presets cannot be changed"). **Save as new** opens a name + folder form (the folder box suggests existing folders through a datalist); a plain click saves with no subsets, Shift+click copies them (`preset/save { copySubsets }`), and the arrow beside the button lists both ways spelled out. |
| Notice | `LibraryBar.tsx` (`LibraryNotice`) | From `state.notice`: the lib's `reportSentence` for an update (with Undo = `notice/undo`), `noticeText.copySentence` for a copy (no Undo), Show removed (`RemovedReview`: opens a centered Mantine `Modal`, like the field table's reader, so it must be closed on purpose (close button, Escape, click outside); one strip per `report.detail` entry, kept pitches solid, removed ones dashed in `--mark-orange`, read-only, runtime only), dismiss = `notice/dismiss`. `state.refusal` shows as a dismissable red line (dismissal is local to the component). |
| Subset rows | `components/SavedSubsets.tsx` | The rows of `Lab.owner`, re-resolved against the tab's field (sparkline rows aligned to the strip, unchanged look). **Add** = `subset/add` (no name asked); the row `lastAdded` names flashes (`data-flash="new"` or `"duplicate"`, a CSS fade, 1.6 s) and is scrolled into view; click the name text itself (not the count or the rest of the row, which loads the subset) to rename in place (`subset/rename`: Enter or leaving keeps, Escape cancels); the strip loads (`subset/load`), the x deletes. "All" lists other generators' rows. **Unassigned (n)**: `orphanSubsets`, a collapsed group at the bottom; loading one applies its pitches to the current tab, and a neutral muted line (not yellow) shows `lastLoad.missing` ("'X' loaded: 1 of 2 pitches are not in this field"). The "Include new notes when the field changes" checkbox moved from the old save popover into the generator's gear fold-out. |

Tests: `HarmonicFieldLab.library.test.tsx` (the browser, breadcrumb and dot, Update disabled for a built-in, Save as new plain and Shift, notice with Undo and Show removed, Add / rename / duplicate, Unassigned, row edit and delete); `testUtils.tsx` holds the helpers (`pickPreset`, `addSubsetNamed`) the older page tests now use instead of the former native select and save popover.

### Keyboard modes, melody shift and linked melody (M8b)

Melody keys v2 (human, 2026-11-14) changed the computer keys: the melody is `z x c v b n m` then `a s d f g h j k l` (`KEYS` in `audio/keymap.ts`, 16 slots).
The old long layout (`/ ; '`) and the top row `q w e r t y u i o p [ ]` no longer play notes; `,` and `.` are no longer slots.

| piece | where | what it does |
| --- | --- | --- |
| Melody shift | `state.keys.shift` (runtime, `keys/shift { by }`), `keymap.ts` (`shiftOfEvent`, `clampShift`, `MAX_SHIFT = 4`) | **`,`** shifts the melody down and **`.`** up by one REPEAT of the tab's generator (`repC`: 2/1 for most, 3/1 for Bohlen-Pierce, 3/2 for Carlos), clamped to +/-4 repeats (the voice engine only needs a positive finite Hz, so it adds no limit). Slot i sounds at degree `i mod N`, `floor(i / N) + shift` repeats up (`slotTarget(slot, n, shift)`, `slotPitch(..., shift)`). Not stored (resets on reload), ignores key repeat, works in every mode, and never retunes held voices: the shift is read when a key goes down and the voice is released by its physical key (`keyId`). The retuner's keys get it too (`ret/down { shift }` adds it to the held key's `oct`). Shown as `Oct +1` in the dock (`data-testid="oct-shift"`); every dock key then shows the shift as a small tag and its aria-label cents include it. |
| Keyboard mode | `ui.keyboardMode` (`notes` default, `chords`, `split`), top bar `SegmentedControl` "Keyboard mode" beside Parallel \| Relative | **Notes**: the melody keys only (today). **Chords**: `q w e r t y u i o p` play the first ten slots of the current shelf page (shelf order); `[` / `]` page the shelf by ten (`keys/page`, runtime `state.keys.page`, clamped to the shelf's pages; shown as "Shelf 1-10 of N" in the dock); the melody keys are silent. **Split**: the melody keys play the active subset and `q`..`p` play the shelf chords; `[` / `]` page as in Chords. Keys match by physical `event.code` (`chordSlotOfEvent`, `pageOfEvent`) with a `key` fallback, never while typing, no Ctrl/Alt/Meta, no key repeat. A chord key plays through the existing hold path (`startHeld`, `pitchesPlan` with `chordPitchesFor(chord, ui.modePlayback)` for the sound and the stored field-absolute pitches for the lights, so ghosts work as built); release, blur, hidden tab, Stop and a field change stop it like hold 1. While the retuner is live the mode still decides: melody keys (Notes, Split) are the retuner's held keys, chord keys (Chords, Split) still play the shelf, and in Chords the melody keys do nothing; the dock shows the mode with "(retuner)" then. A chord key does not arm the Sketch or pick a chip. |
| Linked melody | `ui.linkedMelody` (default off, checkbox "Linked melody" beside the mode switch), `state.keys.link` (runtime, a shelf chord id), `state/linkedMelody.ts` | Only in modes with chord keys (in practice Split). With the option on, pressing a chord key sets `keys.link` to that chord; the melody keys then play the chord's SOURCE subset instead of the active one, ON THE CHORD'S ROOT (`chord.pitches[0]`): `linkedScale(chord, repC, mode)` reads `source.subset` (field-absolute pitches, mode root), each pitch's cents above its base reduced into the SOURCE generator's repeat. **Melody root** (`ui.linkedRoot`, top bar "Transpose | Re-root" beside the checkbox while the option is on; `null` = not chosen): **Transpose** (default) moves the subset rigidly so its mode root lands on the chord's root (C major over D = D major); **Re-root** rotates the same notes to start on the chord's root (D E F G A B C) when that root is a subset member within `REROOT_TOL` = 5 c, else that chord falls back to Transpose. The default (Re-root) comes from the Developer menu (`developer.v1` option `linkedRootDefault`, read live): it applies while `ui.linkedRoot` is null, so changing it affects the session until the top bar choice is made, after which the stored choice wins (`generateField(source.gen).rep`, built once per source, cached in a `WeakMap`), root first; `linkedPitch(scale, slot, shift, frame, baseHz)` places a slot in the frame the shelf uses: Relative sounds the root at its own pitch above 1/1, Parallel on 1/1 Hz. The shift is a repeat of the source generator. Audio only: the voice starts at that pitch; the lights are the field-absolute pitch looked up in the CURRENT tab (`litIndex`), a ghost mark when nothing matches. With no chord pressed yet, a chord with no source, a deleted chord or an unbuildable source, the melody is the active subset. While the retuner is live the linked melody gives way to it (the melody keys are the retuner's, `linkedActive()` is false and melody keys set the Sketch root as usual). While a link is active the dock keys are labelled with the linked subset's pitches (cents in the live frame, plus the shift tag) and the dock pointer presses play them too. The link is runtime: it ends when another chord key is pressed (a held melody key keeps its pitch), when `ui.keyboardMode` or `ui.linkedMelody` changes (the `ui` reducer case), and on a tab switch or field change (`clearPointers`). |
| Shelf card feedback | `state.soundingChords` / `Lab.soundingChords` (runtime), `useLabAudio.ts` (`chordOn`, reference counted by chord id), `ShelfPanel.tsx` | Every way of sounding a shelf chord reports its id: a chord key (`pressChord`), hover + hold 1 (`PreviewTarget.chords`), a click and Play selected (`playCents(cents, light, chordIds)`, lit for the plan's duration). The card gets `data-playing` (green tint and a 2px `--mark-green` outline, H-2), cleared by key-up, blur, hidden tab, Stop, a field change, and a page change or shelf size change (which ends held chord keys: `endChordKeys`). In Chords and Split each card of the current page shows a key badge Q to P (`data-testid="slot-key"`), following `[` / `]`; none in Notes. |
| Shortcut check | | `[` `]` `,` `.` and the letters collide with nothing else on the page: the only other global key handlers are the digits 0 to 5 (holds, Parallel \| Relative), `=` / `+` (stash the Sketch) and Alt+1..9 (tabs), all handled before the melody and chord keys; `[` / `]` do nothing in Notes. |

Tests: `audio/keymap.test.ts`, `state/linkedMelody.test.ts`, `state/keysState.test.ts`, `state/keyboardModes.test.tsx` (key handling per mode, paging, release safety, shift, linked pitches, retuner precedence), `HarmonicFieldLab.keyboard.test.tsx` (the page).

### Persistence

Shell pattern (`loadSettings` / `saveSettings` / `sanitizeSettings`, in `state/persist.ts`), page-local keys, never another
page's keys (W-10):

| key | holds |
| --- | --- |
| `hrifa.harmonic-field-lab.settings.v1` | `UiSettings`: active panel, dock open, chord tolerance, ring view / chain / generator, the three visualizers' settings, wave, 1/1 Hz, volume, mode-at-base, scale preview direction (`scalePreview`, Up | Up-down, default Up), saved-list "All", the keyboard mode (`keyboardMode`, default `notes`), the Linked melody option (`linkedMelody`, default false) and the melody root (`linkedRoot`, `transpose` | `reroot`, default none = the Developer menu default); all are optional on load (absent or damaged falls back to the default) and nothing is written for them until they change. Each visualizer also stores `latMode` (`prime` | `gen` | `cps`, default `prime`); both fields are optional on load. |
| `hrifa.harmonic-field-lab.layout.v1` | The pinned-panel `Layout` (the mock's model, moved here as its own key). Read once from the mock's `...mock.layout.v3` (else v2, else v1) when it is absent. |
| `hrifa.harmonic-field-lab.tabs.v1` | `{ active, list: [{ id, name, snap }] }`. |
| `hrifa.harmonic-field-lab.subsets.v1` | LEGACY `[{ id, name, ...snap }]`: read only to migrate when `generators.v1` is absent; never written or deleted after M7b. |
| `hrifa.harmonic-field-lab.generators.v1` | `{ version: 1, presets: [{ id, name, folder, gen }], untitled: [{ id, gen }], subsets: [{ id, owner, name, pitches: [{ m, c }], root }], recents: [OwnerKey], next: { preset, untitled, subset } }`; `gen` is the generation part of the tab snapshot. Entry by entry: a bad entry is dropped or repaired, a well-formed one that cannot be used now (owner gone, built-in renamed) is kept and written back; caps (also enforced in memory when adding): 2000 presets, 2000 Untitled, 20000 subsets, 4096 pitches per subset; no write on mount. `tabs.v1` entries may carry `link` (an `OwnerKey`; malformed values are dropped). |
| `hrifa.harmonic-field-lab.composites.v1` | `{ version: 1, composites: [{ id: 1..9, name, next, updated, items: [{ id: 'i<N>', kind, label, pitches: [{ m, c }], rep: { m, c } \| null, source: { gen, tab, date } \| null }] }] }`. See "Composite gamuts". Entry by entry, no write on mount, caps 9 composites / 64 items / 2048 pitches per item (enforced in memory too). `tabs.v1` snapshots of a Composite tab carry `snap` (see there). |
| `hrifa.harmonic-field-lab.chordshelf.v1` | `{ version: 1, chords: [{ id, name, pitches: [{ m, c }], template, rootDeg, tol, date, refHz, frame, parent, source: { gen, tab, subset: { pitches, root } } | null }], next }`. See "Chord shelf". Entry by entry, no write on mount, caps 2000 chords / 64 pitches per chord / 4096 per source subset (enforced in memory too). `tabs.v1` entries may also carry `from` (`c<N>`, the chord the tab was reloaded from). |
| `hrifa.harmonic-field-lab.settings.v1` (M8f) | also carries the optional `folds` (see "M8f Folds"): `Record<string, boolean>` (only true stored), entry by entry, no write on mount. |
| `hrifa.harmonic-field-lab.settings.v1` (M8e) | also carries the optional `positionalOrder` (`'smoothest'` default or `'scale'`; anything else is Smoothest, no write on mount): the Positional list order, read by `Positional.tsx` from `state.ui`. No new key. |
| `hrifa.harmonic-field-lab.patterns.v1` | `{ version: 1, patterns: [{ text }] }`: the positional chord patterns (see "Positional chords"). Entry by entry, no write on mount, cap 40, bad data gives the defaults. A sibling of `chordfinder.v1`, never mixed with it. `settings.v1` may carry the optional `positionalPattern`. |
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
  saved-subsets list (`Lab.storeFailed`). The library is re-read on the `storage` event (`generators.v1`), so a second window cannot wipe the
  subsets saved in the first (tabs and settings are last-writer-wins). There is no cap on the number of subsets beyond the load sanity caps.
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
- `useLabAudio` maps keys to voices: the computer melody keys `zxcvbnmasdfghjkl` (16 slots, melody keys v2) and pointer presses on dock keys hold a
  voice (slot i = degree i mod N, floor(i / N) + the melody shift repeats up; see "Keyboard modes, melody shift and linked melody"); Play scale, Play chord (the highlighted chord, else the subset),
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
- **Fill cards** (M7c; `state/fillCards.ts` pure, `components/FillCards.tsx` the modal, a button under the card list). A centered
  modal with three sources, each on its own: **Modes** of the current subset (one card per subset note as the root, named "Mode 1"
  ... as the Modes panel numbers them), **Keys that fit** (the Keys panel's complete transpositions, "Key on 9/8"; the key's found
  notes, its root the mode root) and **This generator's subsets** (`subsetsOf` the tab's owner, each resolved against the tab's
  field with `resolveSubset`; no match = skipped, a partial match keeps the notes found). Default Modes + Keys. Every candidate is a
  whole tab snapshot built with `cardFromTab` (`{ ...tab, sel, mode }`). The preview drops duplicates (same notes in cents to 0.01 c
  at the same root; across and within sources, the first source's name wins, order modes, keys, subsets) and anything equal to an
  existing card, and suffixes a name already taken (" 2"). Each row is tagged against card 0 (the tab's own card when the list is
  empty): **retuned notes** when it has the same number of notes and every degree is within 30 c of home's degree (circular), else
  **different notes**. Rows are checked by default; the footer reads "n cards will be added; m would exceed the 24-card limit": the
  cap counts stored dormant cards too (`planFill`), what fits is added in list order. **Apply** sends each checked card through the
  unchanged `ret/add` (existing cards stay in place, new ones are appended, the run resets). Worked example (tests): 5-limit major,
  held degrees 2, 4, 6, Manual pivot degree 4, Roughness, Freestyle: major alone scores 5.63 (9/8:4/3:5/3); with the Modes added the
  engine picks the mode with 10/9:4/3:5/3 (4.45); the 16/15:4/3:8/5 mode scores 4.54; all modes are tagged "different notes".
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

## Positional chords (M9 step 1: lib and data layer, H-9)

- **What**: a chord type is a STEP PATTERN counted in the ACTIVE SUBSET read from its mode root (lib `positional.ts`; `[2,2]` = every other note, a tertian triad in a 7-note scale). The pattern is the chord's identity, so it works in any tuning and any subset; the ratios are the result. A member that wraps around the subset is stacked above the root by one repeat (root position; voicings later, BACKLOG). Degrees are 0-based in the API (like `Sketch.rootDeg`), shown 1-based in labels. Ranking: `rankPositional` by Sethares roughness of the chord's SHAPE with its root at one common Hz (register-independent: identical shapes tie, then degree order; smoother first), the score is exposed. A step that is a multiple of the subset size repeats a field index a repeat higher in `members` (consumers that dedupe by field index must expect it). Naming: main label `2-2 on 4`, tail `7 of 12-EDO · 400-300 c` (the generator display name is a parameter), ratio `~ 4:5:6` only when every note is within 5 c of a chord template.
- **Patterns list**: `LabState.patterns: PatternsState { list: string[] (canonical texts, no duplicates, at most 40), refusal }`, defaults 2-2, 2-2-2, 2-2-2-2, 2-3, 3-2, 1-1, 3-3. Actions `patterns/add { text }`, `patterns/edit { at, text }`, `patterns/delete { at }`, `patterns/move { from, to }`, `patterns/restore`, `patterns/sync` (another window). Text is validated by `parsePattern` and a refused action sets `patterns.refusal` with a reason (cleared by the next accepted action). A stored empty list stays empty.
- **Storage**: NEW sibling key `hrifa.harmonic-field-lab.patterns.v1` `{ version: 1, patterns: [{ text }] }`; `chordfinder.v1` is NOT changed (saved templates load untouched; tested). Entry by entry (bad dropped, canonicalised, repeats kept once, cap 40), bad or all-bad data falls back to the defaults, no write on mount (`LabProvider` writes only when `patterns.list` differs from the restored one), a storage event dispatches `patterns/sync`.
- **Chosen pattern** (superseded by M8f): `ui.positionalPattern: string | null` in `settings.v1` is still loaded and saved (optional: absent or damaged = null; no write on mount) and `chosenPattern(list, ui.positionalPattern)` still exists, but the Positional section no longer reads it (all patterns are shown as groups); the stored field is kept only so old settings round trip.
- **Sketch**: `Sketch.positional: { pattern: string } | null` (runtime only). When set, the sketch chord is the positional chord at the sketch root degree instead of the ratio `template` (which stays as it was). `sketch/set { patch: { positional } }` sets (a valid pattern, not armed) or clears it (an invalid pattern clears it; tested); a hand-picked ratio template clears it, but only when the template text changes, so **step 2's template dropdown must send `positional: null` together with a ratio template**; `sketch/arm` (a ratio template) always clears it; `sketch/armPositional { pattern, rootDeg?, shape? }` arms a positional chord. `sketchPositionalPitches(field, rep, subsetIdx, mode, sketch)` (state/sketchChord.ts) returns its pitches (null when not positional). Step 2 must also show a Restore defaults control for the pattern list (`patterns/restore`). Step 2 wires Play sketch, hold 4 / hold 5 and Stash to it; step 1 only exposes the helper and the reducer actions.
- Tests: `src/lib/harmonic-field/positional.test.ts` (scenarios: 12-EDO C major 2-2 on 1 = 0, 400, 700 c and on 2 = 200, 500, 900 c; pentatonic 2-2 on 2 = 200, 700, 1200 c; same label and a different tail in harmonics-from-16; ranking; naming; ratio name within 5 c), `state/patterns.test.ts` (list reducer, Sketch.positional, `sketchPositionalPitches`), `state/patternStore.test.tsx` (round trip, bad data, defaults, no write on mount, `chordfinder.v1` untouched, storage sync, `ui.positionalPattern`).

### Positional chords UI (M9 step 2)

- **Files**: `components/Positional.tsx` (`PositionalSection`, `PatternsEditor`, `shapeOf`), wired in `ChordsPanel.tsx` (the section sits after the tolerance ladder and the CPS chips, before the size sections; the editor sits under the ratio templates in the Edit templates dialog), `SketchRow.tsx`, `ShelfPanel.tsx`, `audio/useLabAudio.ts`, `state/LabProvider.tsx`.
- **Positional section** (M8f: see "M8f Positional list" for the current layout; the picker is gone): for each pattern, `positionalChords` -> `positionalList(chords, order, ui.baseHz)` -> `positionalNaming(chord, subsetSize, genName, state.templates)` for ALL degrees (at most 120 rows drawn per group, with a note). A row is a chord-chip look-alike: small ring drawing, label `2-2 on 4`, tail `7 of 12-EDO · 400-300 c`, `~ 4:5:6` when present, rank `#n` (the tooltip has the roughness score). Click = hear + sticky highlight (`pickChord` of the chord's field indices) + `sketch/armPositional { pattern, rootDeg: degree, shape: shapeOf(pitches) }`; Parallel plays the chord's own root on 1/1, Relative the real pitches (same rule as the Sketch row). Hover lights its field notes, registers a `pitches` preview target (hold 1) and a `chord` send item (`-` popup, right-click). The "+" stashes with `pattern` and `template = label`. Too few notes (fewer than 2, or a step that is a whole number of turns of the subset) shows a plain hint instead of rows.
- **Patterns editor**: a "Positional patterns" group in the template editor: one box per pattern (Enter or leaving commits to `patterns/edit`, Escape reverts the box), up/down (`patterns/move`), bin (`patterns/delete`), a New pattern box + Add pattern (`patterns/add`), Restore defaults (`patterns/restore`), and `patterns.refusal.reason` shown under the list (role alert). No write on mount (LabProvider writes only when the list differs from the restored one).
- **Sketch row**: the template dropdown has a "Positional" group (values `pos:<pattern>`; the current pattern stays selectable if it was edited out of the list). Picking one sends `sketch/set { positional: { pattern } }`; picking a ratio template ALWAYS sends `{ template, positional: null }`. When `sketch.positional` is set, the row's chord is `sketchPositionalPitches(field, rep, base.idx, base.mode, sketch)`; its line reads `2-2 on 4 · 7 of 12-EDO · 400-300 c`; Play sketch, Stash (`pattern` + `template = label`), `=` (useLabAudio) and holds 4/5 use it. Hold 4 and 5 give the SAME pitches (`LabProvider` passes `sketch.positionalShape`, the chord's intervals above its root, to `useLabAudio`; the positional chord has no separate exact ratios). The As in field | Exact switch is disabled with a visible reason.
- **Provenance**: `ShelfChord.pattern: string | null` (additive, optional in storage, written only when set, so old shelves load and store back byte for byte; sanitised entry by entry with `canonicalPattern`). `template` stays the display text (`2-2 on 4`). The shelf slot line shows it (tooltip: pattern); playing a slot with a pattern arms `sketch/armPositional`. Reload keeps the pattern in the stored record (reload opens the source tab and does not touch the Sketch row). Stashes made from a tab reloaded from a shelf chord carry `parent` as usual.
- Tests: `HarmonicFieldLab.positional.test.tsx` (12-EDO C major: 7 rows, Parallel and Relative playback, arming, hold 4/5, hold 1, the pentatonic case, the too-few hint), `HarmonicFieldLab.positional2.test.tsx` (Sketch group, ratio template clears positional with unchanged text, stash/`=` provenance, shelf slot, send to composite, the patterns editor), `state/shelfStore.test.ts` (additive `pattern`).

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
| Preset and its info text | Generator column, the preset browser (search, folders, one-line info for the highlighted row; the control's tooltip carries the built-in's description). |
| Method, repeat interval | Generator column: method tabs; repeat in the gear fold-out. |
| Starting harmonic, Divisions, Lattice shape (box or diamond, distance, both directions), axes (generator, count, centre), MOS chips, CPS factors and k, Custom list | Generator column, per-method parameters. |
| Load .scl, Export .scl | Custom method (Load .scl file); Saved subsets header (Export .scl). |
| Prime filter All / None / chips | Generator column prime filter fold-out. |
| Ring: click to include or exclude | Pitch circle (click toggles; Alt+click pins). Chromatic and Fifths views are new. |
| All / None / Invert, Mode stepper | Under the ring (joined button row; mode stepper). |
| Pick nearest (scale, m-ED, Targets 12 / JI, Octave to repeat, result text) | Under the ring: Nearest scale menu with its Targets switch and message. |
| Max odd limit and Select | Entry "Odd limit..." of the Nearest scale menu. |
| Include new notes when the field changes | The generator gear fold-out (it was the saved-subsets header checkbox; M7b moved it). |
| Save subset, saved list (load, delete) | Subset rows (Add, click the name to rename, load, preview on hover, delete, All generators, Unassigned group). |
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

### Tooltip options and the fork notice (M7b feedback round)

- `state/developerOptions.ts` gained `tooltips` (default on) and `tooltipDelay` (ms, 0 to 5000, default 250, sanitised). `ui.tsx`: `Tip` and the chord chips use `useTooltipProps()` (`disabled`, `openDelay`); the native `title` attributes (strip steps, mode tiles, key rings, tab buttons, Subset row note, chord error, preset counts) go through `useNativeTitle()`: removed when Tooltips is off, but the browser's own delay cannot be changed.
- Label only: users see "Auto-saved" for what the stored data and reducer call Untitled (`u:` keys, `untitled` list; `AUTO_SAVED` in `generatorLibrary.ts`). Automatic names (an Auto-saved generator's name in the Preset control and the path line; a subset still named `Subset N`) render muted italic (`.autoName[data-auto]`).
- Subset rows: `state/subsetMatch.ts` (`matchLevel`, `matchSentence`) classifies each row against the tab's field (`resolveSubsetIn`, one `indexField` per field/subsets memo): `partial` is dimmed (0.8) with a halftone bar and `none` more (0.5) with a solid grey bar (full row height, `--match-bar` 12px wide at the row's left edge; the name and count get that much left padding on those rows only, the strip does not move), whose `Tip` carries "5 of 7 notes in these settings. Missing: ..." or "No notes in common with these settings."; a `none` row is `aria-disabled` and its click does nothing. Full rows are unchanged.
- Fork notice wording (`forkSentence(name)`): "Kept automatically as '<name>' under Auto-saved. Use Save as new to name it and move it to My presets." (the unsaved/edited reason stays in `forkNote.reason` but is not worded).
- `LabState.forkNote` (additive, runtime only, `{ owner, reason }`): set by `subset/add` when it forked into a new Auto-saved generator, `reason` `'unsaved'` (the tab matched no preset or Untitled generator) or `'edited'` (it was modified), which picks the wording; ended like `notice`. `LibraryNotice` shows `forkSentence()` with its own dismiss.

## Chip audition at the Sketch root (M8e)

With the pointer on a chord chip (ratio chip, CPS chip, Positional row) hold 4 / 5 no longer needs a pointed note: `playTarget` in `audio/useLabAudio.ts` (the `ARMED_DIGITS` branch) places the chip's shape on the Sketch row root (`b.field[b.rel[sketch.rootDeg % rel.length].src]`, the stepper degree; a melody key already moves it on key-down). Ratio chip (`target.kind 'chord'` with `rootIdx`): `sketchShape(field, rep, skRoot, template, chordShape(...), tol, how)`, so 4 = the chip's field shape and 5 = `exactShape(template)`. CPS chip: `PreviewTarget.chord.noExact` is set, so 5 is the same as 4. Positional row (`kind 'pitches'` with `positional`): its `shape` for both digits. A pointed NOTE with an armed chord, hold 1, and shelf slots (`pitches` without `positional`) are unchanged. Tests: `HarmonicFieldLab.chipaudition.test.tsx` (scenarios a to i).
