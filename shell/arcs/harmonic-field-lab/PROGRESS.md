# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: harmonic-field-lab, Scala-tools arc (`arcs/harmonic-field-lab`; previous arc archived as `ARC.native-tooltips.md` / `PROGRESS.native-tooltips.md`)
- Current milestone: M1 built, reviewed twice, gate green and committed; waiting at the M1 human checkpoint (by eye)
- State: awaiting human

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup | `ARC.md` approved by the human 2026-11-16 as drafted. No setup commit: `check:hfl` and the `H` DECISIONS prefix already exist (next id `H-17`). | n/a | `reference/` holds `Scala help.html`, `chordnam.par` and `analysis/` (scripts). `HANDOFF.edo-chords.md` is for a separate analysis session; this arc does not touch EDO chords. |
| M1 scenarios | Confirmed by the human 2026-11-16 (`SCENARIOS.M1.md`), with a Color: Off / Error / Interval switch added. | n/a | Recorded in `ARC.md` (Checkpoint decisions at the M1 scenarios). |
| M1 | Built and committed 2026-11-16: the Pairs panel (own panel id `pairs`, rail label "Pairs"): lib `intervalPairs.ts`, matrix grid, content table, Find (slash or colon = ratio, else cents) with a clear button, location coverage, Color Off / Error / Interval (persisted as `settings.v1` `pairsColor`), two Developer options (`intervalColor`, `intervalIntensity`), pop-out window, fill-only dimming, tinted caps per hue, lab red-text fixes; H-17 written. Two reviews (all MUST FIX done: Find parsing, H-17, Error colors' unquoted attribute selectors, ARCHITECTURE.md). | `check:hfl` green: 100 files, 1480 tests (first run stopped at a leftover `console.info` lint error in `pairsColor.test.ts`, fixed). | Open for the human by eye: scenarios rows 17, 19, 28, 29 (marks over tints, bigger cells in the pop-out, no broken sentence in the result block, no clipping), the tint look in both schemes, the default Color mode, the dimming strength (`--mx-dim` 0.55). Not in the commit: `reference/` (third-party Scala manual and `chordnam.par`, the human decides), `.claude/hooks`, `launch.json`. |
| C0 | Done 2026-11-16, checkpoint passed (human answers recorded in `ARC.md`; scan below). Scout answered questions (a) to (f) from code (read-only, nothing run); the orchestrator read the shell docs. | none run (no code changed) | Results below. Nothing built. |

## C0 scan result

### Other arcs, locks, decisions
- `arcs/LOCKS.md`: no active rows.
- `stage` and `structure`: finished. `workbench` ("One Stage"): active, M4a committed, M4b next; it owns `src/pages/composition-workbench/`, not the lab. The stage arc's note "no edits to `src/lib/harmonic-field/` (both arcs active)" is from the finished stage arc's spike and no longer binds.
- No file outside `src/lib/harmonic-field/` and `src/pages/harmonic-field-lab/` imports the lib barrel (grep by the scout; the other hits were docs and `package.json`'s `check:hfl`). So no change in this arc is a cross-arc API change, except through decisions or stored data.
- Relevant `DECISIONS.md` rows: H-1 (pitch = monzo + cents), H-3 (pinned note yellow in every view), H-6 (generator and subset storage: `generators.v1`), H-7 (shelf: `chordshelf.v1`), H-12 (shape grouping, relevant to M4 sorting), H-16 (help text format, relevant to every new tooltip). New ids start at `H-17`.
- BACKLOG: the color notation and EDO-chord items are logged; nothing else in it affects this arc.

### (a) Interval matrix (M1)
- Nothing in the page answers "which interval occurs between which degrees". `chordModel`/`findChords` (`chords.ts:199`) answers which chords exist; `intervalSpectrum` (`shape.ts:133`) loses pair identity after sorting (used by `SpectrumPanel` via `derive.ts:206`, cap `MAX_SPECTRUM = 64`); the Modes heat grid (`ModesPanel.tsx`, data `derive.ts:353` `modeFit`) is mode fit (cents to the nearest field note), cap `MAX_MODES = 32`.
- **`modeMatrix(rel, repC, cap = 32)` already exists in `shape.ts:102`** and returns `matrix[i][j]` = forward cents from degree i to degree j. Nothing but `shape.ts` and the README uses it. It is the raw matrix M1 needs.
- Plumbing for the responsive matrix: `hover`, `pin`, `sounding`, `soundingMarks`, `chord` and `chordHoverPitches` in the lab object (`context.ts`), copied in `LabProvider.tsx:334`. A subset note maps to a field index through `rel[k].src` (`subset.ts:30`), the same index hover, pin and sounding use.
- Closest models: `FieldTable` in `FieldPanel.tsx:59` (row `data-pin`, `data-lit`, hover, `rowHandlers`, play button) and `ModesPanel.tsx` (a grid with row buttons and cell preview modifiers). For a pair: `ChordsPanel.tsx:174` calls `lab.setChord(new Set(members))` and `lab.audio.setPreviewTarget({ kind: 'chord', idx, template, rootIdx })`; `PreviewTarget 'chord'` takes `idx` as an array, so a cell can pass `[i, j]` with root `i` and no engine change. Click-to-play: `lab.audio.playFieldChord(indices, rootIdx)`.
- **Performance note:** the lab object is `useMemo`'d on the whole `state` (`LabProvider.tsx:326`), so every hover or sound change re-renders every `useLab()` consumer. The matrix must use memoized cells with primitive props.

### (b) Genus (M6)
- A genus (every divisor of n = product of p^e, reduced into the repeat) is exactly the box generator (`genAdditive`, `generators.ts:28`) with one axis per prime, g = p, n = e+1, center 0. It is a parameter set of the box method for up to 3 primes (the UI reads only 3 axes, `generate.ts:209`). For more primes, or a "type n" input, a new method or input is needed.
- Registration list for any new generator method (used by M6 if a new method, and by M8): lib `library.ts` `GeneratorInputs` and `generatorKey` (its default branch silently keys an unknown method as `custom`: a missing case gives a wrong identity); `state/generate.ts` (Method, METHODS, GenSpec, defaultGen, autoName, genKey, generateField); `persist.ts` (`SNAP_GEN`, snapshot, sanitizing; an unknown stored method silently falls back to harmonic); `libraryStore.ts` `GEN_FIELDS` (a field not listed is dropped on save); the copies in `generatorLibrary.ts` `cloneGen`, `composites.ts` and `chordShelf.ts` for any new array field; `labState.ts` actions; `GeneratorColumn.tsx` (own METHODS list, switch, control); help text in `texts.ts`; tests in `generate`, `persist`, `libraryStore`, `generatorLibrary`.

### (c) 1/1 Hz
- `ui.baseHz` (`labState.ts:177`, default 261.6256, stored in `settings.v1`, range 20 to 5000); UI `TopBar.tsx:257` ("1/1 Hz"). Hz from cents: `hzOf(baseHz, cents) = baseHz * 2^(cents/1200)` (`audio/engine.ts:72`); `relHz` and `absHz` in `audio/plan.ts:34`. A stashed chord stores `refHz`.

### (d) Generators and filters
- Methods: harmonic, sub, edo, lattice (box or diamond), cps, custom (`generators.ts`); composite is a frozen snapshot.
- Prime mask: only in `buildField` (`field.ts:6`): reduce, `passesMask`, `dedupeSort`, the `MAXN = 2048` cut. **Irrational notes (`m = null`) are KEPT by the prime mask** (`passesMask` returns true, `intervals.ts:182`).
- An odd limit filter slots beside `passesMask` in `buildField`. `oddLimit` returns null for an irrational note, so keep-or-drop is a scenarios choice (M6). "Odd limit..." already exists as a menu label in the nearest-scale pick (`Tab.pick.odd`): avoid a label clash.
- Identity: `generatorKey` includes the mask string for every method. For an odd filter add a key component only when the filter is set, so existing keys stay identical (keys are computed at runtime, never stored: safe).

### (e) Chord finder cost (estimate, not measured)
- `findChords` is O(T * N^2 * m) (T templates, N subset notes, m up to 8). `chordModel` (`derive.ts:259`) runs it eagerly per active tab for every template, plus a voicing pass at tolerance 60 and one more voicing pass per distinct integer rung (up to about 61), memoized on the base analysis and `state.templates`; it is NOT recomputed on hover, pin, sound or tolerance.
- **Caps block the library:** `MAX_TEMPLATES = 64` (`labState.ts:289`, enforced on load `persist.ts:256` and in the reducer `labState.ts:1269`); subset size above `MAX_CHORDS = 128` gives no chord model. Putting about 370 templates in the active list would hit the cap, and lifting it would make every selection click redo the eager passes (roughly 18 million inner steps at N = 128, seconds in JS; about 64 times less at N = 16). The library therefore stays separate and runs on demand with its own cheaper pass (no eager ladder), as the checkpoint decision says. M7 measures the real cost.

### (f) Storage (M5)
- Shelf (`chordshelf.v1`): `ShelfChord` (`chordShelf.ts:102`), sanitiser `sanitizeShelf` (`shelfStore.ts:67`), writer `shelfToStored` (`shelfStore.ts:133`; `pattern` and `tail` are written only when set: the M9 precedent for additive fields). A description is an optional string through `StashInput`, `stashChord`, the sanitiser (typeof string, trim, length cap) and the writer (conditional spread). Old data loads unchanged; version stays 1 (the sanitisers do not read it).
- Presets (`generators.v1`): `UserPreset { id, name, folder: string, gen }` (`generatorLibrary.ts:41`); a preset description follows the same pattern (needs its own cleaner, `cleanName` collapses whitespace and cuts at 60). Built-ins already have a read-only `info` string (`presets.ts`).
- **Folders are NOT records.** A folder is only the prefix of `preset.folder` strings (derived by `listFolders`, the tree by `buildTree`); an empty folder cannot exist and there is no folder rename or delete action. Built-in folders are a static table (`builtinFolders.ts`). A folder description therefore needs a NEW array in `generators.v1` (for example `folders: [{ path, description }]`): a `GenLibrary` field, sanitizing (the gate at `libraryStore.ts:114`), `libraryToStored`, the tree reading it, and a rule for what happens when a folder's last preset leaves. That is a stored-format change: `H-` row and the human's OK first.
- No description field exists anywhere in the lab today.

## Incident: bulk reformat found at M1 review (2026-11-16 11:32)
- `git status` showed 51 modified files; 34 of them were rewritten in one burst at 11:32 while the M1 builder was running: 32 files OUTSIDE the arc (pages, theme, components, `oxfmt`/`oxlint` configs, `.yarnrc.yml`, `index.html`, `public/raga-explorer/ragas.json`, `src/data/polyhedra.json`) and 2 inside it (`components/lab.module.css`, `src/lib/harmonic-field/vectors.json`). Cause: a repo-wide formatter run (quote style, import order, lowercase doctype, JSON pretty-print); the author is not proven (the builder says it ran no repo-wide format).
- Verified (script `scratchpad/fmtcheck.py`): all 34 working copies are byte-identical to `oxfmt` output of their committed (HEAD) version, so none holds a real edit and a restore loses nothing.
- RESOLVED: the human asked for the restore again; `git checkout -- <34 files>` ran and the tree is clean outside the arc. Also reformatted: the untracked `shell/.claude/launch.json` (valid JSON, not restorable from git). A PreToolUse guard hook now blocks `oxfmt` without `--check` or `--stdin-filepath`, `format:write`, and `--fix` runs (shell/.claude/settings.local.json; script in shell/.claude/hooks/).
- M1 commit plan regardless: path-scoped `git add` of only the M1 paths (the lab files the builder changed, the new lib and lab files, README and `index.ts`, `BACKLOG.md`, `arcs/harmonic-field-lab/`), excluding `lab.module.css` and `vectors.json` and every file outside the arc.

## Shared touches (locks taken)
None yet. `arcs/LOCKS.md` has no active rows (read 2026-11-16).

## Open questions for human (M1 checkpoint)
1. Try the Pairs panel: both colorings (Error needs the vs-JI odd limit set to 9 to reproduce scenario row 15; the default is 15), the dimming, the dots, the Find box and its clear button, the pop-out, the Developer options (size wheel or rank, simple strong or faint).
2. Keep `arcs/harmonic-field-lab/reference/` (Scala manual 546 KB, `chordnam.par`, analysis scripts) in git, or leave it untracked?
3. The shared-theme fix for the invisible dark-mode error text (BACKLOG item): after M1, take it (lock on `src/theme/`, H row, consumer checks) or leave it logged?
4. The Modes grid text contrast below 4.5:1 in dark (BACKLOG): fix it in M1b or later?

## Next action
After the human's M1 checkpoint feedback: M1b (Modes pop-out, scenarios rows 22 and 23), then S1 (American spelling sweep of the lab's legacy text), then M2.
