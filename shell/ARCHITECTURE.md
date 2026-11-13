# shell/ architecture

A map of `shell/` for anyone starting an arc: what exists, what is shared, and which assumptions are load-bearing. It describes the code as of 2026-11-12 and points at files; it is not a changelog. Page-level detail lives in each page's own `ARCHITECTURE.md` (today only `src/pages/composition-workbench/ARCHITECTURE.md`). Decisions behind the contracts below are in `DECISIONS.md`.

## What shell/ is

`shell/` is a React + Vite + Mantine app (TypeScript, Yarn Berry), the foundation new features are built on. The repo root holds a second, unrelated system: the legacy portal and standalone vanilla-JS applets, catalogued in the root `applets.js` and styled by `design-tokens/`. The two share no code and no conventions (see the repo-root `CLAUDE.md`). The only link is `shell/src/data/applets.ts`: it lists shell pages with an absolute route `href` such as `/composition-workbench`, and also lists legacy applets with relative `href`s such as `color-checker/` or `hrifa-edel/` (the real link to the legacy portal), and `src/pages/Home.page.tsx` renders that list. Legacy applets are ported into `shell/` one at a time (the `port-applet` skill); until then they are untouched.

## Layers

1. **Theme** (`src/theme/`): the only owner of global visual decisions. `tokens.ts` (ramps, marker hues), `semantic.ts` (roles such as `--panel`, `--text-muted`, `--mark-<hue>`, `--tint-<hue>-*`), `ThemeProvider.tsx`, `markers.ts` (`markerColorNames`), `diagram.ts` (`markHue` for canvas diagrams). Rules in `src/theme/THEMING.md`: use roles, never hex values or palette shades, never a fixed shade for a mark.
2. **Shared components** (`src/components/`): `Surface`, `ColorSchemeToggle`, `Data`, `Mono`, `Equation`, `InfoBar`, `Reading`, and the editor kit: `PianoRoll/` (the roll, `VelocityLane`, `HorizontalScrollbar`, grid, grid density, timeline layout, selection helpers), `EditorPalette/` (tool palette, actions, context menu, shortcut matching). Shared components know nothing about packets, clips or the workbench.
3. **Pages** (`src/pages/`): one entry file per route, `src/pages/<Name>.page.tsx`, and a kebab-case folder with the page's modules, tests and its own `ARCHITECTURE.md` when it has a data flow worth recording (`composition-workbench/`, `scale-explorer/`, `interval-placement/`, `raga-explorer/`, `harmonic-field-lab/`, ...). Pages compose layers 1 and 2 and any pure library under `src/lib/` (`src/lib/harmonic-field/`: the Harmonic Field Lab core, pure TS with no React or DOM, documented in its `README.md`; `src/lib/consonance/`: absolute-frequency consonance scoring for the Interval Placement arc, pure TS with no React or DOM, documented in its `README.md`; `src/lib/usernameSeeds.ts` is the other); a page may also import another page's pure modules (see "Who consumes what").
4. **Routing and registry** (`src/Router.tsx`, `src/data/applets.ts`): see "Where a new page plugs in".
5. **Per-page `ARCHITECTURE.md`**: the contract for that page's data and persistence. This file is the shell-level map and never replaces it.

## Shared contracts every arc must respect

### Pitch is midicents

- Pitch values in packets and in the roll are midicents: `midi * 100`, so 6000 is middle C and 6050 is a quarter tone above it. Packet encodings are `midi-note`, `midicent`, `note-name` and `chromatic-${edo}` (`DataEncoding` in `model.ts` allows `chromatic-${number}`; code builds `chromatic-${edo}` from the project EDO, 12 by default, in `snippet.ts`, `scaleConstruction.ts` and `scaleEvolution.ts`). See workbench `ARCHITECTURE.md`, "Packet contract" and "Pitch List input and output". Note-name spelling is kept as metadata alongside a normalized midicent value.
- The roll's rows are fixed at 12-EDO: 128 MIDI semitone rows, `PianoRoll.tsx` (row count 128, pitch range 0 to 12700 midicents). The roll ignores the project's `edo` setting.
- `edo` (`compositionSettings.tsx`, default 12) is read in two ways. It chooses the colour of a note in the editor (`scaleDegreeColor.ts`, when "Color notes by scale degree" is on), and it drives pitch-class material: the modules read `settings.edo` (Arithmetic, Householder, Melodicization, Mixer, PitchList, RhythmEdit, ScaleConstruction, ScaleEvolution, plus the Desk pitch-class conversion) and pass it to library functions that take an `edo` parameter (`pitch.ts`, `arithmetic.ts`, `routeTreatments.ts`, `scaleConstruction.ts`, `scaleEvolution.ts`, `snippet.ts`, `signalTypes.ts`). Full reader list under "Tunings and pitch".
- At a non-12 EDO the pitch values produced are midicents on the EDO grid (`stepCents = 1200 / edo`, `routeTreatments.ts`), but the roll still has 12 semitone rows, so those notes sit between rows with cents-offset labels (see "Tunings and pitch").
- Note labels: `pitchLabel(midicents)` in `routeTreatments.ts` names the nearest 12-EDO semitone with a cents offset (`C4`, `E♭3 +25c`); `noteLabel` in `noteClipEdits.ts` builds a clip note's label from it plus the onset (`C4 @ 3/2`). Labels are always 12-EDO.

### Time is exact rationals in quarter notes

- Packet positions and durations are `Rational` (`{ numerator, denominator }`, `musicalTime.ts`) measured in quarter notes; musical performance plans use the same unit and convert to seconds only at the audio boundary. A `seconds` timebase exists only for deliberate wall-clock auditions (workbench `ARCHITECTURE.md`, "Realization and shared audio").
- The `PianoRoll` component works in plain numbers (`PianoRollNote.start` and `duration` in quarter notes; `model.ts`) because it is a view. Anything that writes to a packet converts back to exact rationals (`noteClipEdits.ts`); never persist the roll's floats.
- Source packets may keep local units (integer pulses); mapping a pulse to a duration is an explicit interpretation step.

### PianoRoll conventions (opt-in props)

Every behaviour added to `PianoRoll`, `VelocityLane` and `EditorPalette` is an opt-in prop or callback with the old behaviour as the default, so consumers that pass nothing keep working unchanged. Examples in `PianoRoll.tsx`: `detachedScroll`, `timeZoomRange`, `gridUnit`, `entryLength`, `entryVelocity`, `velocityFill`, `pickPitch`, `keyActions`, `reveal`, and the edit callbacks `onResizeNotes`, `onResizeNotesStart`, `onDeleteNotes`, ... . Grid lines come either as an array (never windowed or thinned) or as a `PianoRollGridSource` function (windowed by `gridDensity.ts`). `selection.ts` reports ids as event sources, not rectangles. A change that alters a default for existing consumers is a cross-arc change (lock `src/components/`, log in `DECISIONS.md`).

### Theming

Colours come from THEMING.md roles (`--panel`, `--text-muted`, `--mark-<hue>`, `--tint-<hue>-bg`); canvas diagrams go through `markHue`. Note colour in the roll is a CSS value on `PianoRollNote.color`, produced from `--mark-<hue>` by `scaleDegreeColor.ts`. Known deviation: raw `white`/`black` inside `color-mix` in `PianoRoll.module.css`, `VelocityLane.module.css`, `toolCursors.ts` (logged in `BACKLOG.md`).

### Data-contract basics

A `DataPacket` has `kind` (structure: `value`, `list`, `tree`, `bank`, `events`, `layers`, `curve`), `domain` (meaning: `pitch`, `pitchClass`, `duration`, `note`, ...), optional `encoding`, optional `frame` (topology, unit, extent) and items with stable ids and `provenance`. Operations never mutate a packet; they produce a new one and append a provenance step. See workbench `ARCHITECTURE.md`: "The three axes", "Packet contract", "Compatibility and signal routing", "The desk" (clips are named packets), "Edit contract and versions".

### Persistence boundaries

- Everything the workbench persists to localStorage sits under the prefix `workbenchStoragePrefix = 'hrifa.composition-workbench.'` (`projects.ts`); a saved project captures exactly those keys plus the desk, and opening a project replaces them. The desk (clips and lineage) lives in IndexedDB (`deskStore.ts`), not localStorage.
- Per-viewer preferences live OUTSIDE that prefix so projects and undo never capture them: `hrifa.note-editor.v1` (`noteEditorPreferences.ts`), `hrifa.clip-defaults.v1` (`clipPreferences.ts`), `hrifa.developer-options.v1` (`developerOptions.ts`), `hrifa.workbench-current-project.v1` (`projects.ts`). New per-viewer settings follow this rule; new project state goes under the prefix via `usePersistentState`.
- Another page keeps its own keys (see `src/pages/scale-explorer/settings.ts`); no page reads or writes another page's keys.

## Who consumes what

Derived from imports (`grep` over `src/`), not from intent.

| Consumer | Uses | Notes |
| --- | --- | --- |
| `pages/composition-workbench/components/NoteClipEditor.tsx` | `components/PianoRoll` (roll, lane, grid, selection), `components/EditorPalette` (types), `scaleDegreeColor.ts` | The only consumer of the full unified panel (`detachedScroll`, lane slot, edit callbacks). |
| `pages/composition-workbench/components/MelodicizationModule.tsx` | `components/PianoRoll` (basic roll, array `gridLines`), `components/EditorPalette` (types) | Opt-in features not used; behaviour unchanged by roll work. |
| `pages/composition-workbench/components/MixerModule.tsx`, `mixerRoll.ts` | `components/PianoRoll` (one roll per lane, array `gridLines`) | Same; `mixerRoll.ts` builds roll notes and labels via `pitchLabel`. |
| `noteClipEdits.ts`, `noteKeyboard.ts`, `noteTransforms.ts`, `noteEditorPreferences.ts` (workbench) | `MIN_NOTE_QUARTERS`, `MAX/MIN_VELOCITY_LANE_HEIGHT` and roll types from `components/PianoRoll` | Pure modules that depend on roll constants. |
| `pages/scale-explorer/*` and `ScaleExplorer.page.tsx` | `composition-workbench/audio/*` (engine provider, soundfont library and store, instrument registry, types) and `composition-workbench/forteCatalog.ts` | Scale Explorer depends on workbench audio and the Forte catalog. Renaming or reshaping those exports is a cross-arc change. It does not import PianoRoll, desk or `edo`. |
| `pages/CompositionWorkbench.page.tsx` | Everything under `composition-workbench/`, `components/Surface`, `components/ColorSchemeToggle` | The entry file for the workbench route. |
| Other pages (`interval-placement`, `point-construction`, `radial-growth-tree`, `segment-tangent-construction`, `raga-explorer`, `UsernameSeeds`, `ThemeEditor`) | Theme, `Surface`, `Data`, `ColorSchemeToggle`, etc. | No imports from the workbench or from PianoRoll/EditorPalette. |
| `pages/HarmonicFieldLab.page.tsx`, `pages/harmonic-field-lab/*` | Theme, `Surface`, `ColorSchemeToggle`; `lib/harmonic-field/` (pure core: monzo + cents, fields, subsets, chords, scales) | Page owned by the `harmonic-field-lab` arc (route `/harmonic-field-lab`, placeholder until M5). `lib/harmonic-field/` imports nothing from the shell, so the Workbench can reuse it later; its pitch representation is monzo + cents (DECISIONS H-1), converted to midicents only at an edge (W-1). No imports from the workbench, Scale Explorer or Raga Explorer. |
| `lib/consonance/*` | Nothing from the shell (pure TS) | Owned by the `interval-placement` arc. Absolute-frequency scoring of chords: `interference` (Hutchinson-Knopoff default, Sethares), `pairwise`, `periodicity` (Stolzenburg 2015), `harmonicity` (Harrison & Pearce 2018, pitch-class, plus a labelled pitch-space extension), `inconComposite`, `scoreVoicing`, `standardise`/`combine`/`paretoFront`. A voicing is `{refHz, cents[]}` (DECISIONS I-2), scores per I-3. Consumers: `pages/interval-placement/` (from M4) and, later, the Workbench voicing engine via `lib/interval-placement/`. Models ported from Harrison's MIT R packages (credits in its `README.md`). |
| `pages/Home.page.tsx` | `data/applets.ts` | Lists applets and shell routes. |

Import counts of shared components across `src/pages` (non-test): `Surface` 26, `Data` 17, `PianoRoll` 8 importing files (all inside the workbench: `NoteClipEditor`, `MelodicizationModule`, `MixerModule`, `mixerRoll.ts`, `noteClipEdits.ts`, `noteEditorPreferences.ts`, `noteKeyboard.ts`, `noteTransforms.ts`), `ColorSchemeToggle` 9, `EditorPalette` 2 (workbench), `Equation`, `InfoBar`, `Mono`, `Reading` 1 each.

## Where a new page plugs in

From the actual code:

1. **Page folder**: `src/pages/<kebab-name>/` for modules, components and tests. Add `src/pages/<kebab-name>/ARCHITECTURE.md` if the page has a data flow or persistence worth recording.
2. **Entry file**: `src/pages/<Name>.page.tsx` exporting `<Name>Page` (pattern: `ScaleExplorer.page.tsx`, `CompositionWorkbench.page.tsx`). It composes `AppShell`, `Surface`, `ColorSchemeToggle` and the page's modules. This is a standing shared path (lock needed).
3. **Route**: `src/Router.tsx` imports the page and adds `{ path: '/<kebab-name>', element: <NamePage />, errorElement: <NotFoundPage /> }` before the final `'*'` entry; `basename` comes from `import.meta.env.BASE_URL`. Standing shared path.
4. **Registry**: add an `Applet` entry to `src/data/applets.ts` (`title`, `href: '/<kebab-name>'`, `category`, `status`, `runtime`, `description`) so Home lists it. Standing shared path.
5. **Check script**: under a lock on `package.json`, add `check:<arc>` modelled on `check:workbench` (`npm run typecheck`, `oxfmt --check`, `oxlint`, `stylelint` and `vitest run`; everything except typecheck is scoped to `src/pages/<kebab-name>`, while `typecheck` is `tsc --noEmit` over the whole project, so another arc's unfinished edit can turn your gate red, see `CLAUDE.md` rule 14). Create it with `vitest run --passWithNoTests`, stylelint `--allow-empty-input` and `--no-error-on-unmatched-pattern` on both `oxfmt` and `oxlint` (they exit non-zero on a missing folder) so it can be green before the arc has code. Do this before the arc's first code milestone (`CLAUDE.md`, rule 10). Do not use the repo-wide `yarn test` as a gate.
6. **Docs**: the arc folder `arcs/<name>/` with `ARC.md` and `PROGRESS.md` (templates at `ARC.template.md`, `PROGRESS.template.md`), and rows in `arcs/LOCKS.md` for shared paths touched (written by the orchestrator, removed only after the path is committed; see `CLAUDE.md` rules 13 and 16 for the commit, lock and new-arc setup procedure).
7. **Reusing the roll**: import from `src/components/PianoRoll` and pass only the opt-in props you need.

## Tunings and pitch

Today's assumptions a tunings arc is likely to change, with what depends on each. Verified against the code on 2026-11-12.

| Assumption | Where | What depends on it |
| --- | --- | --- |
| The roll has 128 fixed semitone rows (pitch 0 to 12700 midicents), row index = `midicents / 100`; the piano keys, the pitch pick (`onPick(midi)`), pitch zoom/scroll and note placement all assume it. | `src/components/PianoRoll/PianoRoll.tsx` (128 rows, `MAX_MIDICENTS`, `127 - midi` row maths) | NoteClipEditor, Melodicization, Mixer rolls; `mixerRoll.ts` lane fitting (`pitchMidicents / 100`). A non-12 roll means rows from a tuning, not `midi`. |
| Keyboard pitch edits step 100 midicents; octave jump is 1200 (12 rows); the whole group is refused outside 0 to 12700. | `src/pages/composition-workbench/noteKeyboard.ts` (`PITCH_STEP_MIDICENTS`, `OCTAVE_MIDICENTS`, `MAX_MIDICENTS`) | NoteClipEditor key handling, `noteKeyboard.test.ts`. |
| Octave = 1200 midicents. | `noteKeyboard.ts`; `scaleDegreeColor.ts` (`scaleDegree` divides by 1200); `routeTreatments.ts` voicing comment | Colour degree, voicing in midicents. |
| Transform params of kind `pick-pitch` carry `midi * 100`; Invert's axis and Transpose assume semitones. | `src/pages/composition-workbench/noteTransforms.ts`, `clipActions.ts` | Note transforms and their inspector panel. |
| `edo` setting (integer >= 1, default 12) is read by modules for pitch-class material and by the editor for colour only; it never changes rows, labels or keyboard steps. Readers (regrepped 2026-11-12: `\bedo\b` over non-test `src/`): components `ArithmeticModule.tsx:126`, `HouseholderModule.tsx`, `MelodicizationModule.tsx:120`, `MixerModule.tsx:225` and `:244`, `PitchListModule.tsx:100`, `RhythmEditModule.tsx:170`, `ScaleConstructionModule.tsx:147`, `ScaleEvolutionModule.tsx:72`, `NoteClipEditor.tsx:503` (colour), `DeskView.tsx:70` (`convertToPitchClassById`), `CompositionSettingsPanel.tsx:36` (the only writer); library files that take an `edo` parameter: `arithmetic.ts`, `routeTreatments.ts`, `scaleConstruction.ts`, `scaleEvolution.ts`, `snippet.ts`, `pitch.ts`, `signalTypes.ts`, `desk.tsx`, `scaleDegreeColor.ts`; `noteKeyboard.ts:23` only mentions it in a comment. | `compositionSettings.tsx`. Pitch-class conversion produces `chromatic-${edo}` (`snippet.ts:878`, `scaleConstruction.ts:271`, `scaleEvolution.ts:232`, and `pitch.ts:558`, where the Pitch List builds its pitch-class output); compatibility accepts any `chromatic-${edo}` (`compatibility.ts`). |
| At a non-12 EDO, `routeTreatments.ts` (`voicePitchClasses`, about :202 to :211, `stepCents = 1200 / edo`) produces midicents that are not multiples of 100. Melodicization and Mixer (`MixerModule.tsx:244` passes `settings.edo` to `signalTypeRegistry[...].apply`) put those notes on the 12-row roll, so they sit between rows with cents-offset labels (`pitchLabel`, e.g. `E♭3 +25c`), and the 100-midicent keyboard steps in the editor move them off the EDO grid. Nothing snaps them back. | `routeTreatments.ts`, `MelodicizationModule.tsx`, `MixerModule.tsx`, `mixerRoll.ts`, `noteKeyboard.ts` | Any EDO other than 12 gives off-row notes in Melodicization and Mixer today; a tunings arc must decide row model and step size together. |
| Segment Tangent Construction has its own page-local EDO maths, `pcOf(v, edo)` and `edo` props/state (default 12 in `SegmentTangentConstruction.page.tsx`). It is unrelated to the workbench `edo` setting and shares no code with it. | `src/pages/segment-tangent-construction/ratioAnalysis.ts`, `PeriodicityBlockPanel.tsx`, `RatioAnalysisPanel.tsx`, `src/pages/SegmentTangentConstruction.page.tsx` | Page-local; listed so a tunings arc does not assume `edo` has one owner. |
| Interval Placement has its own page-local EDO maths: an `edoSteps` parameter (settings default in `settings.ts`) used for interval colour and lightness and rescaled to frequency as `pitch * 12 / edoSteps` in sonification. It is unrelated to the workbench `edo` setting and shares no code with it. | `src/pages/interval-placement/components/FretboardView.tsx` (`edoSteps`, line 53), `src/pages/interval-placement/components/IntervalClassGrid.tsx` (line 8), `src/pages/interval-placement/sonify.ts` (the `edo-step` pitch unit, line 2; `pitchToFrequency`, line 23), `src/pages/interval-placement/settings.ts` | Page-local; same reason as the row above. |
| Pitch-class names: letters from a meantone spelling where `meantoneSpellingFor(edo)` finds one (12-EDO gives the sharp-only names), else the plain step number. | `pitch.ts` (`pitchClassName`, `meantoneSpellingFor`, `pitchClassNames`) | Pitch-class labels and previews, `CompositionSettingsPanel` text. |
| Note labels are 12-EDO letters with a cents offset, rounded to the nearest semitone. | `routeTreatments.ts` (`pitchLabel`), `noteClipEdits.ts` (`noteLabel`), `mixerRoll.ts` | Every roll note label; label is recomputed on each pitch edit. |
| Scale-degree colour: one fixed 12-slot hue table; other EDOs spread (below 12) or cycle (above 12) the slots; tonic is fixed at C. | `scaleDegreeColor.ts` (`HUE_SLOTS`, `scaleDegree`, `degreeHueName`) | NoteClipEditor note colours (only when `colorByScaleDegree`). |
| Packet pitch encodings: `midi-note`, `midicent`, `note-name`, `chromatic-${number}`. The pitch-class encoding is `chromatic-${edo}`, not a fixed `chromatic-12`. `PitchInputFormat` in `pitch.ts` (`'midi-note' | 'midicent' | 'note-name' | 'pitch-class'`) is a different thing: the Pitch List input-format type, not the packet encodings. | `model.ts` (`DataEncoding`), `compatibility.ts`, `pitch.ts`, workbench `ARCHITECTURE.md` | Pitch list parsing, desk conversion, routing. |
| Scale Explorer's pitch-class maths is mod 12 (Forte catalog, pitch sets, intervals). | `src/pages/scale-explorer/pitchSets.ts` (`mod12`), `composition-workbench/forteCatalog.ts` | Scale Explorer and anything importing the Forte catalog. |
| Time/grid: none depends on pitch. The grid is in quarter notes with meter from the clip (`timeSignature`), 960 ticks per quarter for display. A tuning change does not touch it. | `PianoRoll/grid.ts`, `gridDensity.ts`, `clipTime.ts`, `clipProperties.ts` | Listed only so a tunings arc knows it can leave time alone. |

The standing record of this assumption is the `[shared]` item in `BACKLOG.md` ("Roll rows are 12-EDO and ignore the `edo` setting") and `DECISIONS.md` W-3.

## Claims not verified against the code

- Nothing was run (no tests, typecheck or app launch); every statement comes from reading source and docs.
- The workbench `ARCHITECTURE.md` is about 195 KB; sections cited here were read (Packet contract, Realization, Browser persistence, The desk, Edit contract and versions, History/storage/projects, The clip editor) but the whole file was not re-checked line by line against the code.
- Behaviour of `PianoRoll` beyond the opt-in prop names, row count and pitch range (e.g. the exact set of callbacks, how Mixer and Melodicization pass `gridLines`) was spot-checked by grep, not by reading the 2,292-line component.
- "Other pages import nothing from the workbench" rests on a grep for the string `composition-workbench` in `src/` (only Scale Explorer, the entry file, `applets.ts` and `Router.tsx` match). Imports through other path spellings would not show.
- The `edo` reader list comes from a case-sensitive `\bedo\b` grep over non-test `src/` plus a scan for other `Edo` spellings (the workbench readers are the listed files; the page-local `edoSteps` of Interval Placement and `pcOf(v, edo)` of Segment Tangent Construction are separate, unrelated maths, listed in their own rows). It is a text match, not a type-aware reference search: a reader that receives the whole `settings` object and reads it under another name was not traced. An earlier version of this file omitted `RhythmEditModule`, `ScaleConstructionModule`, `ScaleEvolutionModule` and several library files, so treat the list as complete only as far as that grep.
- Scale Explorer's mod-12 assumption was seen in `pitchSets.ts` only; other files (`chords.ts`, `spaces.ts`, `ringGeometry.ts`) were not read.
- Which EDOs `meantoneSpellingFor` accepts (it returns undefined for the rest, giving step numbers) was not worked out; only the call site in `pitchClassName` was read.
- Legacy portal details (`applets.js`, `design-tokens/`) come from the repo-root `CLAUDE.md`; the legacy files were not opened.
- The lock-and-script procedure for a new page follows `CLAUDE.md` rules 4, 10, 13 and 16; it has not been exercised by a real second arc yet.
- Whether `Home.page.tsx` shows every `applets.ts` entry (filters, status) was not checked beyond the import.
