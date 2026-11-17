# ARC: Lab interval content, chord library and generator tools (from Scala and tuning theory)

**Approved by the human 2026-11-16 (shell rule 16), as drafted.** Workstream folder `arcs/harmonic-field-lab` (previous arc archived as `ARC.native-tooltips.md`). Gate `check:hfl` and DECISIONS prefix `H` already exist (next id `H-17`), so there is no setup commit.

## Goal
The lab gains the analysis and generator capabilities the human collected from Scala and from tuning theory, each done the lab's own way (monzo + cents, the shared hover and sounding state, one tooltip system), not a copy of Scala's output. Done means:
- an interval matrix of a subset that shows which intervals it contains and between which degrees, responding to hover and sound like every other panel;
- the prime factorization of a ratio, and beat rates for a chord or subset;
- sorting for ratio and CPS chords, and editable descriptions for saved chords and folders;
- a Euler-Fokker genus generator and an odd limit filter on generators;
- a read-only library of about 370 named ratio chords (from Scala's `chordnam.par`) that the user's own templates are curated from, filterable by name, odd limit, prime limit and note count;
- a generator that places pitches by ratios from other pitches;
- a harmonic entropy curve and an n-EDO report.

The Scala listings the human pasted (the "Locations of 4/3" report, the chord-match list) are EXAMPLES of the kind of answer, not a fixed spec or test data.

## Parameters
The human's items (2026-11-16) and where each lands:

| # | Item | Lands in | Notes |
| --- | --- | --- | --- |
| 1 | Sorting for ratio and CPS chords | M4 | Which sort keys (size, root, Tenney height, note count) is a scenarios question. |
| 2 | Editable "description" text for saved chords and folders | M5 | New stored field; folders are plain strings today (`"A/B"`), so a folder description needs its own storage. |
| 3 | Generator that adds pitches by ratios from other pitches ("from 1/1 with 3/2 above it, place 11/6 above and below 3/2; from that lower 11/6 place a 9/8 below"). Maybe later every mode converts to it | M8 | Thin slice first. Converting the existing modes is NOT in this arc unless the human decides so at the M8 checkpoint. |
| 4 | Euler-Fokker genus | M6 | The lab has a box-lattice generator; C0 reports how a genus differs from it. |
| 5 | Which pairs of degrees an interval lies between (Scala `SHOW LOCATIONS`), seen as a matrix; what interval content a subset has | M1 | See "M1 shape" below. |
| 6 | Prime factorization of a ratio (Scala `PRIMES`; not the prime limit) | M2 | The lab already stores the monzo (`Note.m`); a display question. |
| 7 | Beat frequencies: total, average, highest | M3 | Uses the lab's 1/1 Hz setting. Scala's `SHOW BEATS` is the model. |
| 8 | Scala `EQUALTEMP/DATA` ("equal/data function"): a report on an n-EDO | M10 | Confirmed by the human as what was meant (2026-11-16). |
| 9 | Scala `CHORDS/MATCH/CONSTRAINED`: named chord search with limits | M7 | Done as a chord library plus filters (below). |
| 10 | Odd limit constraint | M6 (generators), M7 (chords) | Beside the existing prime mask; a filter on the template library for chords. |
| 11 | Harmonic entropy (Erlich) | M9 | Precompute one curve at 1 c resolution; a chord version is a later idea. |

### Checkpoint decisions (human, 2026-11-16)
- **Chord library and templates (item 9):** the library is a separate, read-only source; the user's templates stay the active, curated list ("the library, and the templates are the active curation"). The roughly 370 distinct ratio chords of `chordnam.par` are the library; none are poured into the editable template list.
- **EDO chords are OUT of this arc.** The roughly 394 chords written as EDO step lists, the roughly 130 written as cents or ratio steps and the 30 written as note names are not imported here. The human wants to explore them further first; a separate analysis session continues from `HANDOFF.edo-chords.md`. Whether they become a new "cents chord" template kind (a stored-format change) is decided after that analysis, not in this arc.
- **Odd limit** on both generators and chords is wanted ("might be interesting"); prime limit on chords is the same kind of filter on the template list.
- **M1 purpose (the human's words):** "to see what kind of interval content is available in a given subset ... ties in with step sizes ... all intervals between all notes in a matrix style layout." The human also asked that the matrix highlight playing and hovered notes and intervals "to match the responsivity we have in other panels".

### Checkpoint decisions at C0 (human, 2026-11-16)
- **Milestone order M1 to M10: keep as written.**
- **Genus (M6): both options.** (a) a small genus form that fills the box generator (exponents of up to 3 primes; no new method) AND (b) a new method where the human types n (for example 360 or 2310) and the lab factors it into any number of primes. Human's reason: the app is a tool to learn about and visualize microtonality, so both ways in are wanted. (b) is a new generator method, so it is an `H-` row and its stored shape is confirmed in the M6 scenarios before building (see the registration list in `PROGRESS.md`, C0 (b)).
- **Folder descriptions (M5): empty folders are allowed, and they can be deleted.** A folder therefore becomes a stored record (path plus description) that can exist with no presets, with a create and a delete action. What deleting a folder that still holds presets does (refuse, or move the presets up one level, or delete them) is a scenarios question at M5; the human has only asked for deletion of empty folders so far. Built-in folders (a static table) are not deletable.

### Checkpoint decisions at the M1 scenarios (human, 2026-11-16)
- The M1 scenarios table (`SCENARIOS.M1.md`: rows 1 to 14, decisions D1 to D5) is confirmed as proposed: directed matrix, coverage as "degrees with the interval above them", search tolerance defaulting to `ui.tol` with strict 0.01 c grouping, a second view in the Spectrum panel, a 32-note cap.
- Color (added by the human's question): a **Color: Off | Error | Interval** switch; both are built in the thin slice and the human tries them at the M1 checkpoint (rows 15 to 18). View, color mode and tolerance stay runtime-only in the thin slice; persistence and the default are decided at the checkpoint.
- **Placement revised:** its own panel (id `pairs`, label "Pairs": the name is settled, human 2026-11-16, tooltip "every pair of degrees and the interval between them"), not a Spectrum view; reason: it can move to the workbench as a unit. Color: Interval has two readings (size wheel, alternate by rank) and an intensity direction (simple strong or simple faint), both Developer options (additive fields in the existing `developer.v1`); the palette is not limited to eight hues (continuous, mixed between `--mark-<hue>` roles). The Color: Off | Error | Interval switch stays a normal control. New tooltips follow the help + teaching format (H-16, `HELP-FORMAT.md`): every NEW `texts.ts` entry in this arc uses the new form `{ term, help, teaching?, see? }` whatever its length (human, 2026-11-16); the old `{ term, text }` form stays only for the existing short entries.
- **Pop-out (human, 2026-11-16):** the Pairs panel gets the visualizers' expand button and large window (part of M1); the Modes panel gets the same (a small follow-up step, M1b, after the M1 commit). Mirror `Visualizer.tsx` (Mantine `Modal`, `big` flag); do not refactor the visualizers' own pop-out in this arc (a shared helper may be added for Pairs and Modes; moving the visualizers onto it goes to BACKLOG).
- **After the first look at the panel (human, 2026-11-16):** (a) the Color: Off | Error | Interval selection persists across refresh (additive `pairsColor` in `settings.v1`; H-17 amended); (b) the Find box reads a slash or colon as a ratio and anything else as cents, locally in the Pairs panel (the lab-wide `parseInterval` stays: stored custom generators rely on a bare "2" meaning 2/1); (c) the summary block and the cell clipping are fixed (scenarios rows 28 and 29); (d) **American spelling only**, everywhere, and units written with a space.
- **Legacy spelling sweep (human, 2026-11-16: "yes for legacy sweep"):** a separate step S1 after M1b converts the British spellings left in the lab's owned paths (about 220 hits in about 50 files of `src/lib/harmonic-field/` and `src/pages/harmonic-field-lab/`, plus the archived arc documents) to American. Identifiers and CSS class names are renamed; no stored key or persisted value changes (a stored key keeps its spelling unless a migration is agreed). Pages outside the lab are not in this arc.
- **Color tint strength (human, 2026-11-16: "it all looks very dark"):** Pairs tints are retuned toward the Modes heat grid strength (40 to 55%), keeping 4.5:1 text contrast.
- **Tile colors, M1b (human, 2026-11-16), FINAL:** after two thin slices (bright tiles with dark text: "awfully gaudy"; OKLCH jewel tones) the human chose Radix Colors 3.0.0 scales for the Modes and Pairs tiles in BOTH schemes (decision H-19: `src/theme/radix.ts`, `--rx-<hue>-<step>`, values copied, no dependency): Developer options `tileLook` (Tinted default, Outlined, Solid) and `tileOutline` (default on, "tinted outline on for now"). The Modes pop-out is part of M1b (scenarios rows 22 and 23). A theme-wide Radix arc is logged in BACKLOG (Mantine stays).
- The "M1 shape" below is superseded by `SCENARIOS.M1.md` where they differ.

### Checkpoint decisions at the M2 scenarios (human, 2026-11-16: "d1 looks good ... go ahead")
- **Table confirmed (`SCENARIOS.M2.md`, rows 1 to 12, decisions D1 to D3).** D1: top / bottom for the readable form, the monzo vector for the exact form. D3: 1/1 shows `1`; a note with no exact monzo shows `—` (never `0`, never blank).
- **D2 changed by the human:** the prime spot is the "Point at a note" card (`Inspector` in `RingStats.tsx`), not a hover hint. Its `monzo` row shows the monzo VECTOR (`[-3 2⟩`) instead of the product of powers; two rows are added to that card, `top / bottom` and `Tenney` (Tenney height added by the human); the Field table (compact and window) gets the same three as columns. No prime limit or odd limit rows or columns (the Stats panel already has them for the subset).
- **Look-judged parts** (the card's spacing, the compact table's width): a thin slice, then STOP for the human before a reviewer, gate or commit.

### Checkpoint decisions at the M3 design (human, 2026-11-16: "go ahead ... just start the work")
- **The human redesigned M3 from a Locations-block feature into a display mode of the Pairs grid** (`SCENARIOS.M3.md`, which holds the full confirmed design): a toggle Intervals | Beats; in Beats the cells show beats in Hz and the axes read each degree's interval from 1/1; a picked ratio overrides, otherwise the automatic target (simplest ratio within the tolerance, unison within the tolerance of a unison); notes sound at their field place (not mode dependent, not Parallel | Relative); signed values, totals over sizes.
- **Added pitches** (the human's idea): an "Add pitch" box (ratio or cents, several, at most 4 as the orchestrator's proposal) adds a dashed row AND column, with a narrow blank spacer between the subset and the added ones; not part of the subset's counts, not hoverable or playable in M3. **They PERSIST** (human): additive `pairsAdded` in `settings.v1`, decision `H-20` (a stored-data change, recorded here and in `DECISIONS.md`; no further stop needed for its shape unless the builder cannot keep old data loading unchanged).
- **Steps:** M3a = lib logic and persistence with tests from the table (no UI); M3b = the UI as a thin slice, then STOP for the human to look (look-judged rule); no reviewer, gate or commit for M3b's look until approved.
- **Corrections after the human's looks at M3b (2026-11-16), written in `SCENARIOS.M3.md` item 9:** the beat table does NOT depend on the lab's 7-harmonic sound (the orchestrator's "theoretical beat" marking was wrong as a default): no limit by default, Developer option `beatPartialLimit` (H-21) dims cells above N; the readout under the grid keeps its full wording in a block reserving 3 lines (no jumping); added pitches are tinted like the subset (cells, row and column headers, chip), with strength from the added interval's own ratio when both pitches are exact; compact column padding (columns uniform, longest text plus minimal padding, arrow in a corner); spacer 0.5rem.
- **Interval tint, two channels (human, 2026-11-16; `SCENARIOS.M3.md` item 10, decision H-22):** strength is FIXED simplicity (own Tenney height against fixed bounds; Developer option `tintScale` = `fixed` default | `relative` keeps the old subset-relative spread) and REACH from the cell's center is RELATIVE simplicity (Tinted and Outlined looks; Solid unchanged); default direction option B (simple = stronger and wider; `intervalIntensity` = `faint` reverses both); measure stays Tenney. This also changes the M1 look of the Pairs grid by default.
- **Band instead of gradient (human, 2026-11-16; `SCENARIOS.M3.md` item 11, decision H-23):** the tint is a hard-edged full-height band, width = relative simplicity, depth = fixed simplicity; Developer option `tintBand` = `center` (default) | `left`; search dimming applies on top of the band; the grid sits on the screen surface (`--panel-inset`). Default direction restated by the human: more complex = wider and more tinted (`intervalIntensity` default becomes `faint`; the earlier "option B" answer is superseded by the restatement).

### Checkpoint decisions at the M4 scenarios (human, 2026-11-16: "Otherwise go ahead")
- **`SCENARIOS.M4.md` is the confirmed spec** (rows 1 to 15, "Human answers" and "M4b" sections). Sort: only the cards inside a row and the roots inside a group (family rows keep template-list order); ONE shared control Default | Root | Simplicity plus a Reverse toggle (`ui.chordSort`, `ui.chordSortReverse`); Default = today's order. Decision `H-24`.
- **M4b rolled into M4:** per-note error on the chord card. Card order Pitches, Steps, Error; the Error line is toggled by Developer option `cardNoteErrors` (default off); on the card BOTH the pitch values and the error values are colored by each note's own band; the stat reads `worst (avg)` (average over the non-root notes); the hover tooltip ALWAYS shows Pitches, Steps, Error (no Error line for CPS or dashed cards); the tooltip's doubled word "Steps steps" is fixed in the same step.
- **Look-judged parts** (card line order, colors, `worst (avg)` width, Sort control place): thin slice, then STOP for the human before a reviewer, gate or commit.

### Checkpoint decisions at the M4 look (human, 2026-11-16)
- The M4 thin slice was looked at ("looking good"). New: the error colors become a HEAT MAP in one warm family, option A (exact neutral, under 5 c a hint of yellow, 5 to 15 yellow, 15 to 30 orange, 30 c or more red), applied to every view that shows the bands (`SCENARIOS.M4.md` M4c, decision H-25). Exact is no longer blue. Thin slice, then STOP for the human to look; no reviewer, gate or commit until approved. M4 and M4c are committed together.

### Checkpoint decisions at the M5 scenarios (human, 2026-11-16)
- **`SCENARIOS.M5.md` ("Human answers") is the confirmed spec.** Shelf card: the description is the second line (cut with an ellipsis), the rest moves down; icons in two rows (up, down / notepad description, copy, trash); the hover tooltip shows Title, description, `template on root · N notes`, `Pitches:`, `Steps:`. Presets and folders: description edited in the Edit row and on a line under the breadcrumb of the loaded preset; shown in the browser's info line. Folders: records in `generators.v1`; New folder stays until deleted; delete only when empty; Rename folder added (presets keep their own descriptions, nothing is copied from a folder); built-in folders read-only. 300 characters, plain text. Stored data is additive (`H-26`).
- **Steps:** M5a = data layer with tests (shelf and preset description, folder records and actions, sanitizing, persistence), no UI; M5b = the UI as a thin slice, then STOP for the human to look. No reviewer, gate or commit until approved.

### Checkpoint decisions at the M6 scenarios (human, 2026-11-16 and 2026-11-17)
- **`SCENARIOS.M6.md` ("Human answers") is the confirmed spec.** Genus is a third shape of the Lattice method (type n: `45`, `3^2*5` or `3 3 5`; one box, any number of primes; 2048-note cap with a count message); no extra fill-the-box button. An Odd limit box in the gear (Field settings) popover under the prime chips filters every generator; EDO notes are kept; the gear takes the accent color while any filter (primes or odd limit) is on, with a tooltip naming it. Stored data is additive (`oddLimit`, lattice shape `genus` with `genusN`); both enter `genKey` only when set (`H-27`).
- **Steps:** M6a = lib and state with tests, no UI; M6b = the UI as a thin slice, then STOP for the human to look. No reviewer, gate or commit until approved.

### M1 shape (proposed; the scenarios table at M1 confirms or changes it)
- One pure function over a subset (`rel` with each note's `src` field index): every pair of degrees, the interval between them (octave-reduced, repeat-aware, as `intervalSpectrum` does), grouped within a tolerance.
- **Matrix view:** rows are from-degrees, columns are to-degrees; each cell shows the interval (ratio or cents). Picking an interval highlights every matching cell: that is `SHOW LOCATIONS` for a single interval, with its coverage figures (matches, share of all pairs, degrees covered, degrees used more than once, highest coverage, number of interval class patterns).
- **Content table:** each distinct interval (grouped within tolerance) sorted by Tenney height, with its count and the pairs it occurs between; hovering a row lights its cells. Diagonals of the matrix are the generic step sizes `intervalSpectrum` already groups, so the step-size content (L, s, ...) is readable from the same view.
- **Responsive like the other panels:** a cell lights when both of its notes sound; hovering a degree lights its row and column; Alt+click pins as in every view; hovering a cell sets the shared chord hover for its two notes (so the ring, strip and lattice highlight them); clicking a cell plays the two notes as an interval. The matrix reads `useLab()` like the other panels (it needs the lab state, not only the derived analysis).
- A chord is a set of intervals that occur together, so the chord finder stays the tool for chords; the matrix adds the single interval. Open for the scenarios step: each pair once (inversion on hover) or both directions.

### M7 shape (proposed)
- Data: the 399 colon-ratio entries of `reference/chordnam.par` (392 `a:b:c` and 7 subharmonic `(a:b:c)`, written `1/(a:b:c)` in the lab). 16 fold on the octave (unusable by `parseTemplate`); about 370 are distinct pitch sets, about 304 once the choice of root is ignored (many entries are inversions of each other). How to dedupe (keep inversions as separate named entries or merge them) is a scenarios question.
- Credit: the file is "List of chords for Scala by Manuel Op de Coul"; the data file and the UI keep that credit line.
- UI: a searchable library (by name, odd limit, prime limit, note count) with an "add to my templates" action; the finder runs on the user's templates by default and on library entries on demand (about 370 templates against a field costs far more than 12; measure at C0). Limits are properties of the template text: the chord's prime limit is the largest prime in its lowest-terms integers, its odd limit the largest odd part among them.
- The `chordfinder.v1` stored list is unchanged (still text templates); the library is code or data in the lib, not user storage.

### From the Scala help file
The human added `reference/Scala help.html` (546 KB), the manual for the Scala program, not a spec for this lab (read 2026-11-16; names are Scala's):
- **`SHOW LOCATIONS interval-list`:** takes an interval or a chord (ratios or `4:5:6`, inversion in parentheses) and a tolerance; lists each occurrence with step count, begin and end degree and any cents difference; then chords found, covered degrees, degrees in more than one chord, highest coverage, number of distinct interval class patterns, and the total, average and highest difference. For an equal or linear temperament it gives the size of the minimal scale covering the chord.
- **`SHOW BEATS interval-list`:** for each scale degree, the beat frequency (Hz, from the base frequency) of the nearest scale pitch that is the given interval away; negative when that pitch is lower; up to 12 intervals; a relative form; for two intervals the ratio of their beat rates. Scala warns that for inharmonic spectra the perceived beats differ. "Total, average and highest" is the human's own summary.
- **`EQUALTEMP/DATA division`:** for an n-EDO, the best approximations to 5/4, 3/2 and 7/4 and the intervals derived from them; Fokker's "misfit numbers" (sums of squared errors in cents over 3/2, then adding 5/4, 7/4, 11/8, 13/8); "relative errors" (average error as a percentage of the step); "highest errors" over the diamond of limits 3 to 13; Mandelbaum's combined error factor; chromatic distributions and the strictly diatonic subscales.
- **`CHORDS/MATCH/CONSTRAINED`:** `/MATCH` finds chords from a named list (`chordnam.par`) at every degree of the scale; `/CONSTRAINED` keeps those within a maximum deviation (0 c means exact only), an exponent limit and a prime limit.
- **Pitch attributes** (about 60): `PRIMES`, `LIMIT`, `LIM_ODD`, `HEIGHT` (Tenney), `ODD`, `GRADUS` (Euler), `HARMON` (Barlow), `ENTROPY` (Erlich), `STERN`, `DIFF_ET`, `PITCH_BEND` and more. The lab already has prime limit, odd limit, Tenney height, vs 12-EDO and vs JI. M2 offers only what the human picks.

### Other parameters
- Harmonic entropy parameters to confirm at M9 scenarios: candidate set (all n/d with n*d below 10,000), blur width s of about 17 c, weighting (mediant-bounded regions or 1/sqrt(n*d)), curve range 0 to 1200 c.
- Per the behavior-first rule (`shell/CLAUDE.md`, rule 7): every milestone starts with a scenarios table of the human's real intervals, chords or fields (which root, which mode, which reference), confirmed BEFORE building. Where options give the same answer on an example, a different example is chosen.
- Pitch contract (H-1): notes stay `{ m, c }`; an irrational note (`m = null`) has no prime, ratio or odd limit, and each new readout or filter says what it does for one. Hz and beats are derived at the edge and never stored.
- Owned paths: `src/lib/harmonic-field/`, `src/pages/harmonic-field-lab/` (components, tests, `texts.ts`, its `ARCHITECTURE.md`), `arcs/harmonic-field-lab/`.
- Shared paths it may touch: none planned. `DECISIONS.md` and `BACKLOG.md` need no lock for our own rows. M5 may change stored data (`chordshelf.v1`, `generators.v1`, `tabs.v1`) and M8 may add a generator method to stored specs: any such change is an `H-` row first and stops for the human (stop-and-ask below).
- Check command: `corepack yarn check:hfl` (portable Node 24 on PATH, `VITEST_MAX_WORKERS=6`, see `shell/CLAUDE.md`).
- Concurrency: as the template (path-scoped commits, `H-` ids).
- **Gate policy (human, standing):** run `check:hfl` sparingly: builders run only the tests related to their files, reviewers never run it, the orchestrator runs it once per milestone before the commit, and nothing heavy runs alongside it.

## Preconditions
- `check:hfl` is green at the start. If red only because of files outside the owned paths, it is not this arc's to fix (rule 14).

## Non-goals
- No copy of Scala's text output; the pasted listings are not data.
- No EDO-step, cents-step or note-name chords (see the checkpoint decision); the lab's template format stays whole-number ratios.
- No change to the existing generators, chord finder, audio or layout beyond what a milestone names.
- No conversion of existing generator modes to the relative-pitch mode (decided at the M8 checkpoint, not before).
- No MIDI output, no color notation (logged in BACKLOG), no Workbench integration.

## Milestones

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, `arcs/LOCKS.md` and the other arcs' Status; note which pages import `src/lib/harmonic-field/` (the barrel) so an exported-API change is flagged as cross-arc.
- Read the lab's `ARCHITECTURE.md`, the lib `README.md` and `UI-CONVENTIONS.md`.
- Report, with file references: (a) what the chord finder, `intervalSpectrum` and the Modes heat grid already answer for item 5, and how `hover`, `pin`, `sounding` and `chordHover` reach a panel (for the matrix); (b) how a genus differs from the box lattice and the diamond (item 4); (c) where the 1/1 Hz setting lives (item 7); (d) which generator methods exist and where the prime mask is applied (items 3, 4, 10); (e) what running the finder on about 370 templates costs against the field and subset caps; (f) how folders and shelf chords are stored today (item 2).
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions and backlog, the report above)
- Human checkpoint after: yes (the order of M1 to M10 and any change to the M1 and M7 shapes)

### M1: Interval matrix, locations and content table
- Scope: the M1 shape above: a pure lib function (all degree pairs, grouped by interval, coverage figures), the matrix and content table view, and the responsive behavior. Placement (a new panel or a view in the Spectrum panel) is a scenarios question.
- Acceptance:
  - [ ] Scenarios table confirmed by the human before building (real subsets; a case where "pairs" and "chord matches" differ; a case with a wrap-around pair)
  - [ ] Tests come from the table
  - [ ] Hover, pin, sound and click behave as listed in the M1 shape (tests for the state wiring)
  - [ ] The arc's `Check command` passes
  - [ ] Decisions touching shared code are appended to `DECISIONS.md`
- Human checkpoint after: yes (by eye)

### M1b: Modes pop-out
- Scope: the expand button and large window for the Modes panel as scenarios rows 22 and 23, mirroring the visualizers; a `big` layout for the heat grid (bigger tiles). Done by a fresh short builder step or by the orchestrator (a small, well-specified change) after the M1 commit.
- Acceptance: scenarios rows 22 and 23 (a render test that the window opens, shows the grid and that a row click selects the mode); `Check command` passes.
- Human checkpoint after: yes (by eye, together with M1 if the M1 checkpoint has not happened yet)

### S1: Legacy American spelling sweep
- Scope: convert the British spellings in the lab's owned paths (code identifiers, CSS class names, comments, UI and help text, ARCHITECTURE.md, README, UI-CONVENTIONS and the archived arc documents) to American. Never rename a stored key or persisted value (list any such leftovers); never touch another arc's or page's files. A fresh builder after the M1b commit (so it does not edit files M1 is editing); one gate run; its own commit.
- Acceptance: a grep for the British word list over the owned paths returns only the listed exceptions; related tests pass; `Check command` passes.
- Human checkpoint after: no

### T1: Faster page tests (test infrastructure; no behavior change)
- Human decision 2026-11-16: do it inside this arc ("go with (a)"), and try "kind 1" first: start a test from seeded saved state (`localStorage`, the way several tests already seed it) instead of clicking through the UI (`pickPreset(...)` and similar) before the thing under test. Still render the REAL page; no panel-only mounts in this step (kind 2 is not approved).
- Measured 2026-11-16 (full vitest run, 4 workers, Defender exclusions on): 404 s wall, 263 files, 3,828 tests, 0 failed; the 95 `.tsx` files are about 99% of the time; per test: 3,097 under 0.2 s, 57 over 5 s, top 100 tests = 51% of the time; slowest files `HarmonicFieldLab.live` 97 s (43 tests), `moderoot` 93 s (14), `composites2` 52 s, `keys` 47 s, `page` 45 s. A bare page render is about 0.6 to 1.7 s; the 9 to 16 s tests are multi-scenario tests whose cost is the click-through plus many re-rendering steps. Raw data: the scratchpad's `timing-after-exclusions.json` (not kept in the repo).
- Scope (owned paths only: lab test files, `testUtils.ts`, `vite.config.mjs` is NOT touched):
  1. **T1a thin slice (measure first):** apply kind 1 to the 3 slowest single tests that open with a click-through (`m8g` "c: hold 4 / 5...", `composites2` "lists the three most recent composites...", `m8f` "a, c, d, e, g: ..."), plus a shared seeding helper in `testUtils.ts`. Report before and after times of each file run alone. STOP and report to the human; continue only if the saving is real (target: at least 30% off those files, same assertions).
  2. **T1b split:** split `live` and `moderoot` (then the next slowest) into several files so they run in parallel, by `describe` block, moving shared setup into `testUtils.ts`; no assertion changed, no test dropped or renamed.
  3. **T1c audit (only if the human asks):** list the 57 tests over 5 s for the human to skim; nothing is removed or merged without the human's say-so.
- Acceptance:
  - [ ] Every test that existed before still exists with the same assertions (test count of each touched file group is the same: a before and after count is reported)
  - [ ] A seeded start leaves the same state the click-through left (the builder shows the stored value both ways for each seeded case; a test that depends on the click-through itself keeps it)
  - [ ] Before and after per-file times reported (file run alone, `VITEST_MAX_WORKERS=4`)
  - [ ] Related tests of the touched files pass; the full `Check command` is NOT needed per step (test-only changes; one run at the end of T1, in the background)
- Human checkpoint after: yes, after T1a (the saving is the decision point), and at the end of T1.
- **Outcome (human, 2026-11-16): T1 CLOSED.** T1a measured about 5% (kind 1 is not adopted, reverted); the click-through is only about 2 s of a 10 s test, the rest is later steps that re-render the full page. T1b (the split) and T1c (the audit) were NOT done: the split's ceiling is about 25% and it adds about 5 s of fixed import cost per new file. The human instead chose to raise the worker count from 4 to 6 (one per physical core; Ryzen 5 5600X) in `shell/CLAUDE.md`, `scripts/check-fast.mjs` and the Check command line above, verified by one `check:hfl` run. Ideas left for later are in `BACKLOG.md`.

### M2: Prime factorization per ratio
- Scope: display of a ratio's prime factorization (from the stored monzo; no new data), where it shows per the scenarios table, plus any other pitch attributes the human picks.
- Acceptance: scenarios-based tests; irrational notes show nothing, not zero; `Check command` passes.
- Human checkpoint after: yes

### M3: Beat frequencies
- Scope: lib function for the beat rate of each pair of notes at the 1/1 Hz setting, and the total, average and highest over a chord or subset; where it shows, per the scenarios table. A beat between partials (not only fundamentals) is settled first in the scenarios.
- Acceptance: scenarios-based tests with hand-computed Hz; `Check command` passes.
- Human checkpoint after: yes

### M4: Sorting ratio and CPS chords
- Scope: sort keys and a control in the Chords panel; the sort order is a UI setting.
- Acceptance: scenarios-based tests; group order and folds unaffected; `Check command` passes.
- Human checkpoint after: yes

### M5: Editable descriptions for saved chords and folders
- Scope: a description field on shelf chords (optional string on `ShelfChord`, `chordshelf.v1`, additive like `pattern` and `tail`) and on user presets, and a folder record list in `generators.v1` (`folders: [{ path, description }]`) so a folder can have a description and can exist empty; actions to create and delete a folder; descriptions edited in place. The preset browser reads folder records as well as the folder prefixes of preset strings. Any stored schema change is an `H-` row and a stop for the human first.
- Acceptance: old data loads unchanged (no field means no description; no folder list means folders come only from preset strings); round trip test; an empty folder survives a reload; deleting an empty folder works and a built-in folder cannot be deleted; `Check command` passes.
- Human checkpoint after: yes

### M6: Euler-Fokker genus and odd limit on generators
- Scope: Euler-Fokker genus both ways (every divisor of a product of primes with exponents): (a) a form that fills the box generator for up to 3 primes, and (b) a new generator method that takes n, factors it and builds the genus for any number of primes (an `H-` row with the stored shape, per the registration list in `PROGRESS.md`); and an odd limit that filters a generator's field beside the prime mask; both enter the generator identity (`genKey`) only where they decide the field. What the odd limit does to an irrational (EDO) note is a scenarios question, shown with an example.
- Acceptance: scenarios-based tests (a known genus, an odd-limit-cut diamond, an EDO field); `Check command` passes.
- Human checkpoint after: yes

### M7: Chord library and chord filters
- Scope: the M7 shape above: the library data with its credit line, search and filters (name, odd limit, prime limit, note count), "add to my templates", on-demand finding on library entries. A conversion script turns `chordnam.par` into the library data and is kept in the arc's `reference/` folder or the lib.
- Acceptance:
  - [ ] Scenarios table confirmed (which entries, how inversions are deduped, what a limit filter returns for 4:5:6, 3:5:7 and 18:22:27)
  - [ ] The library has no unparseable entry (every entry passes `parseTemplate`); the 16 octave-folding entries are listed as skipped
  - [ ] `chordfinder.v1` is unchanged and old data loads
  - [ ] Finder cost on the full library is measured and reported
  - [ ] `Check command` passes
- Human checkpoint after: yes

### M8: Relative-pitch generator (thin slice first)
- Scope: a generator method whose input is a list of steps "place ratio R above or below pitch P". Thin slice: the human's example (1/1, 3/2 above it, 11/6 above and below 3/2, 9/8 below that lower 11/6) entered and played. Then polish. A new method in stored generator specs is an `H-` row and a stop for the human first.
- Acceptance: the example builds the expected pitches (hand-computed in the scenarios table); an unbuildable step shows an inline error and never throws; `Check command` passes.
- Human checkpoint after: yes (also: convert other modes or not)

### M9: Harmonic entropy
- Scope: lib curve builder (candidate set, blur, weighting per the confirmed parameters), a precomputed 1 c curve and a first display as a background curve in the Dissonance curve view. Thin slice first.
- Acceptance: dips at 1/1, 3/2, 4/3 and 5/4; build time measured and reported; `Check command` passes.
- Human checkpoint after: yes (by eye)

### M10: n-EDO report
- Scope: an n-EDO report beside the EDO-fit view, from the `EQUALTEMP/DATA` description above: best approximations of the basic intervals, misfit numbers, relative and highest errors, combined error factor. Which of these to include is a scenarios question; thin slice first.
- Acceptance: hand-computed values for 12-EDO and 31-EDO in the scenarios table; `Check command` passes.
- Human checkpoint after: yes

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to `shell/ARCHITECTURE.md` or the page's own `ARCHITECTURE.md` contracts (including any stored data schema).
- A shared path needed is locked by another arc in `arcs/LOCKS.md`.
- Any decision about look, sound, or musical taste not specified above.
- A scenarios table for a milestone has not been confirmed.

## Budget
Max 2 builder attempts per milestone; then stop and report.

**Gate and commit cadence (human, 2026-11-16, "yes to all three", and "the full gate on each commit is wasteful, commits have been made too rapidly"):** one commit per approved milestone, not per micro-step. Before a commit run the FAST loop: typecheck, format and lint on the changed files, and the tests that touch the changed files (`corepack yarn vitest run <files>`; `test:related` finds nothing on this machine until it is fixed). The full `Check command` and the consumer gates (`check:workbench`, `check:stage`) run only when shared code changed (theme, shared components), at the end of the arc, or in the BACKGROUND after the commit (fix forward if red); they never block the human, and no two heavy runs overlap. Measured on 2026-11-16: `check:hfl` 267 s, `check:workbench` 82 s, `check:stage` 19 s. The speed step is DONE (2026-11-16, commit `5536d81`): `test:related` was silent because of a path-case mismatch on Windows and now goes through `corepack yarn check:fast [files]` (format, lint, stylelint and `vitest related` on changed or named files; see `shell/CLAUDE.md`); use `check:fast <files>` for the fast loop above. One per-file timing run exists (below, T1).

**Look-judged steps (human, 2026-11-16):** anything judged by eye (colors, tiles, contrast tuning, layout, sizes, dimming) is a THIN SLICE: a builder writes the smallest version that runs (minimal related tests only; no docs, no decision row), the orchestrator then STOPS and gives the human a short list of what to look at. No reviewer, gate, commit or lock release for it until the human has tried it and approved the look. Pure logic or data steps with a confirmed scenarios table keep the normal pipeline.
