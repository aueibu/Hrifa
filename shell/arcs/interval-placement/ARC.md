# ARC: Interval Placement: rigorous, register-aware scoring + panel workspace

**Status: APPROVED (2026-11-13); MODEL RESET 2026-11-20 (see "Model reset").** M1, M2, M2c done (M2c approved 2026-11-24); M3 (the workspace mock) next. Branch merged into `main` 2026-11-20. The M2b "play mode" (spread / lean / evenness knobs on one hand-shaped voicing, with search off to the side) replaced the app's own model and is withdrawn; the flow is input, then the exhaustive catalog, then exploration of a chosen entry. Portability work stands. M2c settled 2026-11-23 (equal centers default, window = width only); its library change is next.

## Goal
Interval Placement keeps its idea and gets a sound scoring core and a better workspace:

1. **The idea stays.** You name a few *essential* intervals; each placement adds a relation from the new notes to every note already placed, and the rest of the chord's intervals (the *induced* ones) fall out of that. The flow (human, 2026-11-20): **input** (the essential intervals plus a **spacing**, the range of widths the chord may take, replacing the old fixed octave windows) → **catalog** (every ordering placed within the spacing, scored, listed to sort and filter: the order is part of the enumeration, never a user choice) → **exploration** of an entry picked from the catalog (move it through the register, nudge a span, see nearby alternatives).
2. **Scoring is rebuilt on published, tested models** (see "Scoring model"), computed at the real pitch you hear, so a major 3rd low, the same 3rd an octave up and a major 10th all score differently for acoustic reasons, not hand-tuned factors. The scores describe what the induced relations sound like; they do not impose orchestration rules.
3. **The engine and the scoring become pure TS libraries** (`src/lib/consonance/`, `src/lib/interval-placement/`) so the Composition Workbench can later use them as a voicing engine without importing a page.
4. **The page is rebuilt as a standalone panel workspace that can later move into the Composition Workbench unchanged** (see "Portability"): its panels live on the shared dock Stage the workbench uses, it looks and behaves like the harmonic-field lab and the workbench, and it talks to its host only through three small hand-off contracts. It starts with a **mock** the human approves before anything live is built.

## Design decisions already made (from the human)
- The concept is relational (essential intervals, induced relations fall out), **not** orchestration rules. No spacing rules or low-interval-limit tables. (2026-11-13)
- Window width is a stepped wide/narrow categorisation; it may be improved. (2026-11-13)
- The engines exist to shift emphasis (fit within the window and span, then gravitate low / high / truly centred). Keep them. (2026-11-13) (The M2b checkpoint replaced them with spread and lean knobs; withdrawn by the model reset 2026-11-20. Their intent stands; the bugs found at M2 are fixed, and how spans sit inside the spacing is settled with the human from this intent.)
- Scoring must account for both the absolute register of each note and the intervals themselves (M3 low vs M3 + octave on the same root vs either at C4 or C6). It should follow academically rigorous metrics without sacrificing the app's creativity. (2026-11-13)
- The current v1/v2 scoring is largely a vestige of early back-and-forth and may be replaced. (2026-11-13)
- Process: same as the harmonic-field-lab arc: an ARC the human approves, then a mock reviewed in rounds before the live UI. The harmonic-field-lab's panel and modular approach worked well; follow it. (2026-11-13)
- Long-term: this feeds, and may become, an engine in the Composition Workbench. (2026-11-13)
- **Approval (human, 2026-11-13):**
  - The three scores (interference, periodicity, harmonicity) are the right set; more are welcome if they earn their place (see "Descriptive measures" below, added at approval). v1 and v2 scoring are dropped, not kept as a legacy toggle.
  - The **Pareto-front plot** is a headline view for reading results; the **per-interval contribution view** and **must-have / must-not-have interval constraints** are wanted.
  - ~~Panel workspace: a generic copy in our page folder, written so that promoting it to a shared component later is a smooth port; the human sees the mode being reused by later apps.~~ Superseded 2026-11-20: the shared dock Stage (`src/components/Stage/dock/`) now exists and is the shell's reusable workspace (the human decided the lab moves onto it too, workbench D6), so this arc uses it instead of copying the lab's column layout.
  - The M1 builder may download the Bowling et al. (2018) ratings (check the licence). If the download fails, report the exact citation and DOI needed and the human will source the file.
  - The M3 mock questions (shared notes, window steps, default weights) wait until the human sees the mock and has them clarified.
- **Placement controls get redesigned, not just carried over (human, 2026-11-13, during M1).** The golden test exists only to verify that the move into the lib is faithful; it is not a commitment to keep the old behaviour, and it may be retired once the redesign replaces the engines. The human wants to reimplement the placement controls "from a much more solidly grounded point", for example a window re-envisioned as something interactive (moving a structure up and down ad hoc and watching the scores change), and to be consulted at a checkpoint with usable ideas that improve on the old ones. Hence M2 ports and verifies only, and the new M2b proposes the redesign for the human to choose from before the mock.
- **Standalone but portable (human, 2026-11-20).** Like the harmonic-field lab's plan: the page is its own app now and can be ported into the Composition Workbench when the time comes; "the UI and styling and behavior would always remain unified" with the lab and the workbench. On `main`, `main`'s project-wide decisions win where this arc (planned 2026-11-13) differs.
- **Hand-off contracts (human, 2026-11-20):** this arc defines the first versions of the three contracts the lab planned (PitchContext, Preview, Emit), with the lab's names, recorded as a shared DECISIONS row so the lab adopts them later instead of inventing its own. The human asked to be told clearly before that step starts (M6).
- **Model reset (human, 2026-11-20).** The human rejected the M2c scenarios (order, lean, evenness, voicing terms) as "arbitrary buttons" that left the original idea: "For order - this was originally done exhaustively and then the user was given a catalog. The order is just a calculation of all combinations possible - the goal was the spacing idea." "The exploration came after the initial input." "We started with the essential intervals and then discussed the spacing as an alternative to the fixed octave windows." Consequences:
  - Kept: the essential-interval concept; exhaustive orderings and a catalog; the **spacing** as the replacement for fixed octave windows (Close / Open / Wide / Vast are presets of it); the new scoring and ranking; the fixes to the M2 quirks (notes leaving the window, silent drops and merges, the repulsion no-op, odd bias attached to the position); dragging through the register and the nearby search, but only as **exploration after the catalog**, on a chosen entry; the portability work.
  - Not the default any more (the human, same day: "they didnt have to go, I just was taken aback by how final you posited everything"): the M2b play mode as the main mode, order as a user choice. **Optional extras on top of the catalog, added when they earn their place**, never replacing it: dragging and nudging, the nearby search, lean, evenness, and the SATB-explorer vocabulary (gaps, shape names) as information rather than rules. `SCENARIOS.M2c.md` and its listening page are a record of those extras, not a spec.
  - **The core (human, 2026-11-20):** "the original idea ... is basically just evenly spacing the essential intervals within a given span", then "letting the user browse the results which were originally sorted by a given score". "No matter what there will always be a way to implement the combination search for a given input set", because "the idea of voicing a chord with the essential intervals placed in a given order 7 5 11 vs 5 7 11 and the scoring of them and the window they can span are not mutually exclusive." The octave windows came from thinking of orchestral sections and their colors.
  - Process lesson: check every proposal against "Design decisions already made" before turning it into questions, and present options as proposals, not as settled.
- **Revision checkpoint decisions (human, 2026-11-20):**
  1. ~~The new M2c (play-mode and Explore functions in the lib, scenarios first) before the mock: yes.~~ M2c is redefined by the model reset (catalog first).
  2. Look: the shared kit for panel chrome and controls, the lab's rules for tooltips and help text; the mock lists every place they differ.
  3. Spacing presets: **Close (≤ 1 oct), Open (1–2 oct), Wide (2–3 oct), Vast (≥ 3 oct)**, each only a preset of the numeric spacing range (stands after the model reset). Checked 2026-11-20: the affine-focus project has no spread vocabulary; the workbench's chord voicing (`chordInput/voicing.ts`, `SpreadStyle = 'close' | 'open' | 'drop2' | 'drop3'`) uses "close" and "open" as voicing *procedures* (close = smallest stack; open = alternate voices up an octave). They are compatible in practice (a close voicing spans under an octave, an open triad usually 1–2 octaves), but the reader text must say ours are span ranges, and the M6 / port plan notes the overlap.
  4. Default ranking weights: **harmonicity-leaning** (McDermott, Lehr & Oxenham 2010: harmonicity the stronger predictor of preference). `EQUAL_WEIGHTS` stays available as a preset. The exact default weights, and which harmonicity carries the lean (pitch-space harmonicity separates voicings of one interval set; pitch-class harmonicity barely does, M2b), are proposed in the M2c scenarios with an example where they rank differently from equal weights.
  5. ~~**Shared voicing vocabulary with the SATB Voicing Explorer**~~ Withdrawn by the model reset ("too heavy handed and prescriptive"); kept here as a record: (the human's artifact, https://claude.ai/artifact/KvGDuDE2pFEkzT5XL3mVUu, read 2026-11-20; the human meant it, not affine-focus, for question 3). Presets stay span ranges; add the explorer's **gaps** (per adjacent pair of sounding notes, low to high: whole octaves between them, `g = floor(cents / 1200)`; `gaps` = number of pairs with g ≥ 1; `gSum` = Σg, the explorer's texture) as descriptive measures and Explore filters (e.g. "no gap of an octave or more"); show the explorer's **shape name** (close, drop 2, drop 3, drop 2&4, drop 2&3, reverse) for four-note voicings, as the explorer and the workbench's `voicing.ts` name them. The explorer's "shell" (whole-chord octave lift) is the play mode's register move.

## Diagnosis of the current page (2026-11-13, measured with a probe of the current code)
- Scoring runs at a fixed 55 Hz (A1) for the window's bottom, whatever base note is chosen; playback uses the base note (default C4). Changing the base note never changes the ranking.
- Register is counted twice (frequency-dependent roughness, plus `registerDamping = exp(-k·lo/L)`), and the second term depends on window width: a m2 scores 3.53 at the bottom of a 3-octave window and 0.89 near the top, and the same absolute chord rescores when only the width changes.
- Compound intervals are folded into one octave, then shrunk by `exp(-0.55·octaves)`: m9 (0.90) ≈ M3 (0.86); m2 + 2 octaves (0.52) ≈ P4 (0.51).
- Ratio targets are 5-limit + 45/32 with a fixed 20 c tolerance, so other EDOs are judged by 12-EDO's map (31-EDO's 7/4 costs more than a 12-EDO tritone).
- Ranking is the mean per pair, which dilutes a harsh pair and compares 5-note and 6-note results (accidental collisions) as if alike.
- Draft v2: harmonicity floors at 1/n (major triad = cluster = 0.333); harmonic entropy is unweighted and reads 4.15–4.94 bits for every interval, rising with size (P5 more "ambiguous" than m2). Only its ERB roughness term works.
- Placement: 8 intervals = 40,320 orderings, about 115 s synchronous on the main thread, no cap. Collisions merge silently. One placement per ordering; identical pitch sets from different orderings are listed twice.
- Only `engine.test.ts` exists; nothing tests scoring.

## Scoring model (proposed; confirmed or changed at approval)
All scores take **absolute frequencies** (from the base pitch), so register and octave placement matter everywhere. Each is reported on its own; ranking combines them only at the last step.

- **Interference (roughness).** Plomp & Levelt (1965) dyadic curve over every partial of every note against every other, with critical bandwidth. Default model: Hutchinson & Knopoff (1978): one of the three best-performing models in Harrison & Pearce's (2020) evaluation and the interference term of their composite model; they report that later interference models generally performed worse (verified in the PsyArXiv preprint, DOI 10.1037/rev0000169, after M1). On our own validation H&K has the strongest single-score correlation with the Bowling ratings, −0.74 vs −0.41 for Sethares. Sethares (1993), with his own fitted bandwidth curve (not ERB; corrected after M1), is the alternative, for comparison with the harmonic-field lab. The timbre (partial count and roll-off) matches the playback timbre. No register damping and no compound relief: both effects emerge from the acoustics.
- **Periodicity (Stolzenburg 2015, "relative periodicity").** Approximate each note as a ratio over the lowest note (within a tolerance tied to the tuning), then take log2 of the period of the combined pattern. Readable (it can print the chord as "≈ 4:5:6") and sensitive to octave placement: 5:2 (M10) is simpler than 5:4 (M3).
- **Harmonicity (template / virtual pitch).** Milne-style spectral template matching (as used in Harrison & Pearce 2020), applied in **pitch space, not pitch-class space**, so octave placement still counts. Continuous, needs no ratio rounding, works in any EDO or non-EDO tuning.
- **Relations view.** Every score is decomposed per induced dyad (each relation's own roughness at its real register) and per note (marginal contribution = score with the note minus score without it). This is the app's "each placement adds a relation to every other" idea made measurable.
- **Ranking.** Totals, not per-pair means; the worst relation is reported separately. Default list order = a weighted mix (user slider) of the scores standardised within the candidate set; the **Pareto map** shows the front (voicings nothing beats on both chosen axes). Axes default to interference × harmonicity and can be any two scores or descriptive measures.
- **Descriptive measures (not consonance, added at approval).** Cheap, exact facts that make good map axes and filters: span (cents), note count, register centroid (mean log-frequency), lowest note, number of distinct induced intervals (relational richness), and collisions. They are never mixed into the consonance scores.
- **Interval constraints.** Must-have and must-not-have intervals (by size, optionally octave-equivalent, e.g. "no induced minor 9th", "must contain a perfect 5th somewhere"). Must-not-have filters candidates out; must-have keeps only voicings that contain the interval as an essential or induced pair. Applied in the placement lib, so the workbench gets them too.
- **Dropped:** v1 (`intervalMath.ts` scoring), v2's harmonicity and harmonic entropy. (v2's ERB roughness survives as the Sethares option.)
- **Validation:** sanity orderings in tests (below) and, if the data can be obtained with a usable licence, a correlation against the listener ratings for all 12-TET dyads, triads and tetrads in Bowling, Purves & Gill (2018, *PNAS*), the dataset Harrison & Pearce also used. See Open questions.

Key references (as verified by the M1 builder against the reference packages' bibliographies): Plomp & Levelt 1965 (*JASA* 38(4)); Hutchinson & Knopoff 1978 (*Interface*, now *J. New Music Research* 7(1)); Sethares 1993 (*JASA* 94) and 2005; Mashinter 2006 (*Empirical Musicology Review*); Stolzenburg 2015 (*J. Math. & Music* 9); Milne 2013 (thesis) and Milne & Holland 2016 (*J. Math. & Music* 10); Harrison & Pearce 2018 (ISMIR) and 2020 (*Psychological Review* 127(2)); Bowling, Purves & Gill 2018 (*PNAS* 115(1)); Johnson-Laird et al. 2012 (*Music Perception* 30(1)); Schwartz et al. 2003 (*J. Neurosci.* 23(18)). McDermott, Lehr & Oxenham 2010 (*Current Biology*) is background for the harmonicity-leaning default only; it is not used in code. The M1 builder checks every citation used in code comments and the reader text.

## Proposed UI (confirmed or changed at the M3 mock checkpoint)
One-screen workspace on the **shared dock Stage** (`src/components/Stage/dock/`, as the workbench uses it): named dockers in a split tree, panels as tabs that can be moved, sent and docked, screenset tabs and the Panels menu. A thin top bar for transport (arpeggio / chord / interval pairs, timbre). DAW density, tooltips instead of paragraphs. Every item below is a **panel** (a Stage module with `id`, `title`, `home`, `sizes`, `render(size)`); none knows which page hosts it. The default screenset is proposed in the mock.

The panels follow the flow (model reset, 2026-11-20): input, catalog, exploration.

- **Input panel (home: centre).** Interval chips (value, essential marking), tuning (EDO) and base pitch as an absolute note, and the **spacing**: the range of widths the chord may take (replacing the fixed octave windows), with Close / Open / Wide / Vast as presets. How the spans sit inside the spacing follows the original engines' intent ("fit within the window and span, then gravitate low / high / truly centred") with the M2 bugs fixed; its exact behavior is settled with the human (Open questions).
- **Catalog panel.** Every ordering placed within the spacing (exhaustive, as the original page; the order is part of the enumeration), scored, deduplicated (identical pitch sets once, listing the orderings that made them), collisions and shared notes shown, never silently dropped. The list (total, worst relation, note count, flags) with the weight slider and must-have / must-not-have interval chips, plus the **Pareto map** (any two axes, layers colored, hover cross-highlights the list, click selects). Runs in a Web Worker; results stream in for large interval sets.
- **Exploration panels (after the catalog, on the selected entry).** Register: the selected voicing slid through the register (scores against bottom note, "you are here"), drag it up or down and hear the cost; nudge one span; nearby alternatives around the selected entry. Details are settled when the catalog works (not before).
- **Relations panel.** The induced-interval triangle (every pair: interval, octave span, its roughness at its register, essential vs induced marked) and per-note contribution bars.
- **Visualizer panel** with a view selector: Spectrum (partials with critical-band overlaps), Interval counts / interval-class grid (today's), Periodicity (the "≈ a:b:c" ratio chord), Keyboard / Fretboard (today's, 12-EDO only).
- **Reader / glossary.** Replaces `ScoringInfoModal`; every score's definition, an example and its citation, from one `texts.ts` in the lab's help-text format.
- Fixed octave window widths are replaced by the spacing range. Whether the four engines survive as named spacing behaviors, and what happens to odd bias, is part of the spacing question (Open questions).

## Parameters
- **Owned paths:** `src/lib/consonance/` (new: pure TS scoring, no React/DOM), `src/lib/interval-placement/` (new: pure TS placement engine, no React/DOM), `src/pages/interval-placement/` (today unowned: components, state, mock, tests, `texts.ts`, `settings.ts`, the page's `ARCHITECTURE.md`), `arcs/interval-placement/`.
- **Shared paths it may touch** (row in `arcs/LOCKS.md` while edited, written by the orchestrator): `package.json` (Setup only: add `check:interval-placement`); `src/pages/IntervalPlacement.page.tsx` (standing shared entry, M4); `src/Router.tsx` (M3 mock route, retired in M5); `DECISIONS.md` row for the shared hand-off contracts (M6, no lock needed for our own row); `src/theme/diagram.ts` (only if `resolveIntervalPlacementStyle` needs new roles; stop and ask first); `ARCHITECTURE.md` (M1 and Final: the two libs and the page in the map and "Who consumes what"). `DECISIONS.md`/`BACKLOG.md` need no lock for our own rows.
- **Taking over the page folder:** `src/pages/interval-placement/` has no active arc today, so it is a shared path until this ARC is approved; approval of this ARC is the human's OK, and Setup adds the `DECISIONS.md` row (INTERVALPLACEMENT-1) that makes it owned by this arc.
- **Check command:** `corepack yarn check:interval-placement` = `npm run typecheck`, then `oxfmt --check` and `oxlint` scoped to `src/lib/consonance`, `src/lib/interval-placement` and `src/pages/interval-placement` (both with `--no-error-on-unmatched-pattern`), stylelint scoped (`--allow-empty-input`), `vitest run --passWithNoTests` over the same three folders. Modelled on `check:hfl`. If red only because of other arcs' files, stop and report (shell rule 14).
- **DECISIONS prefix:** `INTERVALPLACEMENT`, registered in our first row. Rows due: INTERVALPLACEMENT-1 arc ownership of `src/pages/interval-placement/` (Setup); INTERVALPLACEMENT-2 the libs' pitch representation (M1); INTERVALPLACEMENT-3 the scoring model and ranking (M1); any theme-role change.
- **Pitch representation:** notes are cents above an absolute reference plus the reference in Hz (a voicing = `{refHz, cents[]}`); EDO steps are an input convenience (`steps × 1200 / edo`). Midicents (W-1) and Hz are derived only at the edge (audio, a later workbench handoff). This makes the libs EDO-agnostic and ready for the BACKLOG non-EDO pitch item.
- **Workspace:** the shared dock Stage, consumed as is (see "Portability"). No copy of the lab's column layout. If the Stage needs a change to host this page, stop and ask (it is shared code under `src/components/`).
- **Persistence:** shell pattern (`loadSettings`/`saveSettings`/`sanitizeSettings`). Keys: `hrifa.interval-placement.settings.v2` (migrated from `…v1`: intervals, EDO, base, spacing range, timbre; the old window width maps to the matching spacing, the remaining engine fields per the agreed spacing behavior) and `hrifa.interval-placement.ui.screensets.v1` (the page's own `ScreensetStore`, as the workbench's W-42 key). Bad data falls back to defaults.

## Portability (standalone now, workbench later; human 2026-11-20)
Facts from the C0 redo (2026-11-20) and the rule each one gives:
- **Layout.** `DockStage` has no imports from the workbench page; a page builds a registry (`createStageRegistry`), owns its `ScreensetStore` and passes `screenset`/`update`. Only the workbench and the `/stage` spike use it today. **Rule:** each panel is a Stage module that renders from its size class alone and reads page state through the store below, never through props from the page, so registering the same modules in the workbench later is the port.
- **Look.** The shell's shared panel kit is `src/components/InspectorKit/` (`Panel`, `Section`, `Row`, `Num`, `Toggle`, fields, `Tip`; one `compact` density), used today only by the dock and the spike; the lab has its own `ui.tsx` and is meant to adopt the kit later (STAGE-19). **Rule:** panel chrome and controls come from the kit; text, tooltips and the reader follow the lab's help-text rules (the lab page's `ARCHITECTURE.md` "Help text", `arcs/harmonic-field-lab/UI-CONVENTIONS.md`): short labels, glossary `texts.ts`, tooltip order (term, live line, help, Keys, Example), nothing moves (fixed numeric slots, reserved space), theme roles only (`--mark-blue` hover, `--mark-green` sounding, `--mark-yellow` pinned). Where the kit and the lab disagree, the mock shows it and the human decides (open question).
- **Keys.** No shared key-owner registry exists (BACKLOG plan item only); the workbench's `inputScope.ts` is page-local; `DockStage` itself listens on the window for F6/Alt+G/Alt+digit and skips events a panel already handled. Known clashes with the workbench: `v`, digits, `[` `]`, `-` `=`, Alt+digit (lab steering notes). **Rule:** no window or document key listeners; keys are handled on the panel's own element while it has focus, and call `preventDefault` when used; key names live in one table (the lab's pattern) so a later registry can take them over; avoid the clashing keys and Alt+digit.
- **State.** The workbench's stores (`runtime/stateStore.ts`, `outputStore.ts`) are page-local and explicitly replaceable (W-45). **Rule:** one small external store in our page folder (`useSyncExternalStore`, selectors), pure evaluators for placement and scoring (already the two libs), panels that may be hidden without losing state. No imports from `src/pages/composition-workbench/`.
- **Audio.** No shared audio interface exists (`AudioEngine`, `useModulePreview` are workbench page code; `HeldVoices` is a plan). `sonify.ts` is self-contained Web Audio. **Rule:** panels never call `sonify.ts` directly; they call a small Preview interface (play a voicing, stop) that the standalone page implements with `sonify.ts`, so a host can supply its own sound later. No new shared audio code (non-goal).
- **Hand-off contracts (M6).** PitchContext in (tuning and reference pitch from the host), Preview (above), Emit out (a voicing with exact pitches: fractional midicents plus the EDO step or ratio, W-44's `exact`, decided but not built). Nothing of the kind exists in `src/` yet. M4 uses page-local versions of PitchContext and Preview; M6 settles all three as shared contracts with the human.
- **Performance:** placement runs in a Web Worker with a cap on orderings (default 5,040 = 7 intervals; above it, results stream in and the UI says how many are left). The main thread never blocks for more than one frame.
- **Theme:** shell roles and `--mark-<hue>` only, per `src/theme/THEMING.md`. No hex.
- **Concurrency:** same checkout and branch as the other arcs. Path-scoped commits only (`git add <paths>`, `git commit -- <paths>`; never `git add -A` or a bare `git commit`; on `index.lock` retry, never delete it). Lock rows removed only after the commit. Builders run only the tests of the files they touched; the orchestrator runs `check:interval-placement` once per milestone.

## Preconditions
- `check:interval-placement` exists and is green before M1 (created at Setup with the rule-15 flags so it is green with no code). If red only because of other arcs' files, not ours to fix.
- Owned and locked paths are clean before each builder brief.
- `corepack yarn test` run once before M1 to record the baseline.

## Non-goals
- No orchestration rules (spacing tables, low-interval limits, doubling rules).
- No cultural-familiarity / corpus model in this arc (Harrison & Pearce's third factor).
- No Composition Workbench module in this arc (the workbench folder belongs to the workbench arc). This arc only makes the libs ready and writes the integration plan.
- No edits to `src/lib/harmonic-field/` or the harmonic-field-lab page (read and compare only). No new shared audio code.
- No keyboard/fretboard support for non-12 EDOs (BACKLOG).
- No changes to the dock Stage, `InspectorKit` or other shared components: consume only; a needed change is a stop-and-ask.
- No port into the workbench in this arc: the page is made portable, and M6 defines the contracts; the port itself is a later arc.

## Milestones

### Setup (orchestrator, shell rule 16, after approval)
- Take the `package.json` lock, add `check:interval-placement`, commit `arcs/interval-placement/` + `package.json`, release the lock. Append `DECISIONS.md` INTERVALPLACEMENT-1 (registers prefix INTERVALPLACEMENT; this arc owns `src/pages/interval-placement/`).

### C0: Context scan
- Read `ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc, `arcs/LOCKS.md`, `src/theme/THEMING.md`, the harmonic-field-lab page `ARCHITECTURE.md` (panel workspace behaviour) and `src/lib/harmonic-field/README.md` (scorers we compare against). Confirm nothing outside the page imports from `src/pages/interval-placement/`.
- Acceptance:
  - [ ] PROGRESS.md notes the scan result (other arcs, locks, relevant decisions/backlog, importers).
- Human checkpoint after: no

### M1: Consonance library (`src/lib/consonance/`)
- Scope: owned `src/lib/consonance/` + tests + `README.md`; locked `ARCHITECTURE.md`. No UI.
- API (export all): `timbre({partials, rolloff})` and named presets matching the page's playback timbres; `interference(freqsHz, timbre, {model: 'hutchinson-knopoff' | 'sethares'})` → `{total, worst, dyads (matrix), perNote}`; `periodicity(freqsHz, {toleranceCents})` → `{value, ratios (e.g. [4,5,6])}`; `harmonicity(freqsHz, opts)` → `{value, virtualPitchHz}`; `scoreVoicing(voicing, opts)` → all of the above; `standardise(scores[])`, `combine(scores, weights)`, `paretoFront(points)`.
- Acceptance:
  - [ ] Register: a M3 on C2 has more interference than on C4, and on C4 more than on C6.
  - [ ] Octave placement: M10 has less interference and lower (simpler) periodicity than M3 on the same root (5/2 vs 5/4); m9 has less interference than m2 and periodicity no higher (32/15 and 16/15 share denominator 15, so equal is correct). (Corrected by the orchestrator before M1, 2026-11-13: the first draft wrongly required m9 to be simpler.)
  - [ ] Harmonicity: JI 4:5:6 > 12-EDO major triad > `0 1 2` cluster, at 220 Hz; no 1/n floor (a regression test against the v2 bug).
  - [ ] Interference dyad curve (two harmonic tones, default timbre, fine sweep) has local minima at 1/1, 6/5, 5/4, 4/3, 3/2, 5/3, 2/1. (Amended after M1, orchestrator, for the human to veto: met by Sethares; H&K with the default timbre (11 harmonics, 1/n) has the six others but no minimum at 6/5, which is the model's own curve (the R reference values reproduce) and appears with 6–8 harmonics. The default timbre stays, because it is the one the published composite was fitted with. The test documents H&K's 6/5 behaviour explicitly instead of an expected failure.)
  - [ ] Decomposition: without masking, `total` equals the sum of `dyads` (≤ 1e-9 relative); `perNote` equals total minus total-without-note.
  - [ ] EDO-agnostic: the same functions score 12-, 19- and 31-EDO chords and JI; 31-EDO's 7/4 approximation has lower periodicity than a 12-EDO tritone.
  - [ ] Cross-check: the Sethares option orders a fixed chord set the same way as `src/lib/harmonic-field`'s `scoreRoughness` (imported read-only in a test).
  - [ ] A comparison table (about 15 chords: dyads at three registers, triads, tetrads, clusters, compound voicings, the default `11 7 16` placements) with every score, pasted into PROGRESS for the human. If the Bowling et al. data is available (Open questions), also a Spearman correlation per score, reported, not gated.
  - [ ] Lib `README.md` documents each model with its citation and known simplifications; `ARCHITECTURE.md` lists the lib; `DECISIONS.md` INTERVALPLACEMENT-2 (pitch representation) and INTERVALPLACEMENT-3 (scoring model) appended. `check:interval-placement` green; path-scoped commit.
- References found at C0 (2026-11-13), read-only clones outside the repo (re-clone with `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/pmcharrison/<name> /home/user/pmcharrison/<name>` if missing):
  - `dycon` (MIT): `R/hutch.R` Hutchinson & Knopoff 1978 roughness, `R/sethares.R`, `R/vassilakis.R`.
  - `stolz15` (MIT): `R/main.R` Stolzenburg 2015 relative periodicity (smoothed).
  - `har18` (MIT): `R/pc-harmonicity.R`, `R/sweep-harmonic-template.R` Harrison & Pearce 2018 harmonicity (Milne-style template; **pitch-class space**, so octave-invariant).
  - `incon` (MIT): `R/model-har-2019.R`, the composite model and its published coefficients (`hutch_78_roughness` −1.620, `har_18_harmonicity` +1.780, corpus −0.089; chord-size term disabled by default; default timbre 11 harmonics, roll-off 1).
  - `inconData` (CC0): listener data `data-raw/bowl18/data/{dyads,triads,tetrads}.csv` (Bowling, Purves & Gill 2018: all 12-TET dyads, triads, tetrads with the exact Hz played and mean ratings), `data-raw/jl12/figure-{2,3}.csv` (Johnson-Laird et al. 2012: triads as MIDI voicings in different registers and inversions, with ratings), `data-raw/sch03/figure-6.txt` (Schwartz et al. 2003 dyad consonance ranking).
- Checkpoint decisions (orchestrator, C0, 2026-11-13, for the human to veto at M3):
  - Ports follow the reference implementations' behaviour (MIT; credited in the lib `README.md` with each package's copyright line), checked by tests that reproduce values computed by hand from the R code's formulas.
  - Harmonicity ships in two forms: `har18` faithful (pitch-class, validated in the literature) and a **pitch-space variant** (same template method on absolute pitches so octave placement counts). The variant is this arc's extension, labelled as such in code, README and reader text, and reported against the data beside the faithful one.
  - The datasets are copied into `src/lib/consonance/data/` (CC0, with a `SOURCE.md` naming the papers and the package) and used by a validation test that prints Spearman correlations for each score (not gated, except a sanity floor: interference and harmonicity each correlate with the Bowling ratings in the expected direction).
  - Proposed default ranking weights for the M3 mock: `EQUAL_WEIGHTS` on standardised scores (interference −1, harmonicity +1), the standardised analogue of Harrison & Pearce 2020 Fig. 2C ("broadly similar" standardised coefficients). (Corrected after M1 review: −1.62/+1.78 are the paper's Table 2 *unstandardised* coefficients on raw values; they live in `inconComposite`, available as a score and map axis.) Still the human's call at M3.
- Result (2026-11-13): done, see PROGRESS (M1 rows) for the validation and comparison tables.
- Human checkpoint after: no (the table is read at the M3 mock)

### M2: Placement library (`src/lib/interval-placement/`)
- Scope: owned `src/lib/interval-placement/` + tests + `README.md`. Moves the engine out of the page folder (the page keeps working on the old code until M4).
- API: `placeIntervals(spec)` where `spec = {intervals: {cents, essential, oddBias}[], window: {bottom (absolute), widthSteps}, distribution: 'uniform' | 'prefixSlack' | 'prefixDominance' | 'repulsion' (today's engines, ported as they are), constraints: {mustHave, mustNotHave} (interval cents, octave-equivalent flag, tolerance), engine params}` → voicings `{refHz, cents[], essentialPairs, inducedPairs, collisions, perm, placement meta}`; an iterator form for the worker with a cap; `transpositionScan(voicing, range)`; `dedupe(voicings)`.
- Acceptance:
  - [ ] Golden test (verification of the port only): each distribution reproduces the current page's four engines (`v1`, `v2`, `prefixDominance`, `repulse`) exactly on a fixed input set (pitches and endpoints). It proves the move to the lib and to cents changed nothing by accident; it does not bind the redesign in M2b, and is retired or rewritten when the redesign replaces the engines (with a PROGRESS note).
  - [ ] Essential vs induced: each voicing lists which pairs are essential spans and which are induced; collisions are reported, never silently merged.
  - [ ] Dedupe: orderings that produce identical pitch sets yield one voicing, listing every ordering.
  - [ ] Cap: 8 intervals with the default cap returns the first 5,040 and reports the remainder; the iterator yields in chunks of ≤ 16 ms work (timed in a test with a generous margin).
  - [ ] Works in cents: a 19-EDO and a JI input place correctly.
  - [ ] Constraints: must-not-have removes every voicing containing the interval (exact and octave-equivalent modes); must-have keeps only voicings containing it; the number filtered out is reported; tests for both, including a constraint that removes everything (empty result, no error).
  - [ ] Descriptive measures (span, note count, centroid, lowest note, distinct induced intervals, collisions) computed per voicing.
  - [ ] `check:interval-placement` green; path-scoped commit.
- Result (2026-11-13): done (see PROGRESS M2 rows; quirk list in the lib README feeds M2b). Orchestrator decision for M2b to revisit: merged voicings keep every ordering's essential pairs and flag `essentialVaries`.
- Human checkpoint after: no

### M2b: Placement redesign proposal
- Scope: a written proposal in `arcs/interval-placement/placement-proposal.md` (owned) plus, where it helps the human judge, small runnable demos or plots built on the M1/M2 libs (scratch or a test that prints tables; no page code). No new controls are built in this milestone.
- Content: diagnose today's placement controls (window width also forcing the spread because anchors always span the whole window, the four engines' rules, odd-interval bias, the interaction with scoring), then propose 2–4 grounded designs the human can choose and combine, each stating its principle, its controls, what it makes possible, its cost, and how it uses the M1 scores. Candidates to evaluate (not a commitment): an interactive register view (drag or step the whole structure up and down, or one span at a time, with live scores and the M1 transposition scan as a curve); window as a register range and span as a separate width constraint; placement as a search over span positions with the scores (or a Pareto front) as the objective, with today's engines as named starting shapes; gravity or density as continuous controls; essential intervals optionally sharing notes. Ground each in the literature where it applies (e.g. register-dependent roughness, voicing-space ideas) and say plainly where a choice is taste rather than theory.
- Acceptance:
  - [ ] Proposal written, with a recommendation, the open choices listed as questions, and a sketch of what each option looks like in the M3 workspace.
  - [ ] Any numbers in it come from the libs (reproducible command or test named).
- Checkpoint decisions (human, 2026-11-13, on `placement-proposal.md` section 5). **Partly withdrawn by the model reset (2026-11-20):** items 1 (play mode as the main mode), 6's engine removal and the lean/evenness knobs no longer hold; the spacing range (2), dragging (3), nearby search (4), shared notes shown (5) and the ranking toggle (7) stand, with dragging and search as exploration after the catalog.
  1. Tiered approach approved: **A + B as the play mode, C + D as the Explore panel.**
  2. **Spread = a numeric range (octaves or cents) as the universal control.** Named steps only as optional presets over that range; the human wants name proposals. Orchestrator proposal (to confirm at M3): Close (≤ 1 oct), Open (1–2 oct), Wide (2–3 oct), Vast (≥ 3 oct), each just a preset of the range; alternative set borrowed from spacing terms: Clustered / Close / Open / Spread.
  3. **Drag single spans as well as the whole structure.** Step = one tuning step; a modifier key gives fine drag in cents.
  4. **Search scope = a neighbourhood around the current voicing by default**, with a settings mode to extend it (up to the whole register limits) that explains the resource cost (candidate count, estimated time) before running.
  5. **Shared notes allowed by default**, but the UI must show when a duplicate (shared note) was created.
  6. **No old engine is kept**; the rework replaces them. The human is interested in revisiting a **force-based spacing mode like a node-graph layout** (a working repulsion, scaled in cents/register, not the old no-op) as a later option: BACKLOG-worthy, or a B variant if cheap.
  7. **Explore list ranking toggles** between Pareto layer and the weighted mix.
- Next: update "Proposed UI" and M3–M5 to these decisions, then build the M3 mock.
- Human checkpoint after: **yes** (the human chooses the placement design; the M3 mock and M4/M5 follow that choice, and the ARC is updated before M3)

### M2c: The catalog with the spacing (no UI)
- Scope: owned `src/lib/interval-placement/` + tests + README. The original model with the spacing range in place of fixed octave windows and the M2 quirks fixed. (Rewritten 2026-11-20 by the model reset; the earlier play-mode M2c and `SCENARIOS.M2c.md` are withdrawn.)
- Core rule (the human, 2026-11-20): the essential intervals are **evenly spaced within the span**, in every ordering; the catalog is sorted by a score. Extras (lean, dragging, nearby search) are optional layers for later. Before the builder: the human's examples of even spacing, and the window-as-register-region question.
- Acceptance (completed 2026-11-23 from the decided rule and the window decision below):
  - [ ] **Input:** essential intervals, a base pitch (the bottom of every window, absolute Hz) and a **spacing range** of window widths (from, to; from = to is one width), in grid steps (`stepCents` = 1200 / edo) or cents. Presets `close` 6–12, `open` 13–24, `wide` 25–36, `vast` 37–48 steps in 12-EDO (in other grids: the same octave ranges, i.e. ×edo/12, rounded to whole steps), exported as data only. (As built: in other grids each top is a whole number of octaves and each preset after close starts one step above the previous top, so the presets leave no gap: 19-EDO close 10–19, open 20–38, wide 39–57, vast 58–76. The literal "×edo/12, rounded" left 19-EDO width 20 in no preset.)
  - [ ] **Rules:** `rule: 'equal' | 'shared'`, default `'equal'`. Equal centers: D = min over i < j of (W − (dᵢ + dⱼ)/2)/(j − i), c₀ = max over k of (dₖ/2 − k·D), centers c₀ + k·D. Shared center range: centers spread evenly over [M/2, W − M/2], M = largest interval. Each interval's bottom note = nearest grid step to (center − size/2), once; a tie (exact half step, tolerance 1e-9) rounds toward the window middle (center < W/2 rounds up, otherwise down: an interval centered exactly on the middle rounds down). `tieMode: 'middle' | 'down' | 'up'` (default `'middle'`) gives the catalog's rounding twins; each placement reports its number of ties. A single interval sits at the bottom of the window (center d/2: the limit of the formula, special-cased in code because the reference gives NaN there), documented. `oddBias` and the engine params do not apply to these rules.
  - [ ] **Tests from the human's examples** (12-EDO steps, window from the base note; written as exact note lists):

    | Rule | Order | W | Centers | Notes |
    | ---- | ----- | - | ------- | ----- |
    | equal | 7 11 16 | 24 | 3.5, 9.75, 16 | 0 4 7 8 15 24 |
    | equal | 7 11 16 | 20 | 3.5, 7.75, 12 | 0 2 4 7 13 20 |
    | equal | 16 11 7 | 24 | 8, 14.25, 20.5 | 0 9 16 17 20 24 (the mirror of the first row) |
    | equal | 11 7 16 | 24 | 5.5, 10.75, 16 | 0 7 8 11 14 24 |
    | shared | 11 7 16 | 24 | 8, 12, 16 | 3 8 14 15 24 (2 ties; down twin 2 8 13 15 24, up twin 3 8 9 14 16 24; 8 is a shared note) |
    | shared | 7 11 16 | 24 | 8, 12, 16 | 5 6 8 12 17 24 (2 ties) |
    | equal | 7 16 11 | 19 | 3.5, 8.5, 13.5 | 0 1 7 8 17 19 (the 16 ties at 0.5 and rounds up toward the middle; down twin 0 7 8 16 19) |
    | equal | 11 16 7 | 19 | 5.5, 10.5, 15.5 | 0 2 11 12 18 19 (the 16 rounds down; the exact mirror of the row above) |
    | equal | 7 11 16 | 15 | n/a | cannot fit (16 > 15): reported, never placed (the catalog script placed it outside the window) |

    Plus property tests over every ordering of `11 7 16` and `7 5 11`, windows 6–48: equal centers with 2+ intervals spans the whole window; no note leaves [0, W]; reversing an ordering gives the mirror image (W − x) under `tieMode: 'middle'`; the shared rule's centers are the same for every ordering of one set. A cross-check against the catalog: for a sample of sets the lib's notes equal `m2c/catalog/worker2.ts`'s `place` (same rule, window, tie mode).
  - [ ] Every ordering is placed at every width in the spacing; no note leaves its window; an ordering that cannot fit is reported (counted per width), never dropped silently; collisions and shared notes are reported (as M2's `collisions`).
  - [ ] **Catalog:** one entry per distinct pitch set (with the base pitch), listing every (width, ordering, rule) that made it, scored with `scoreVoicing`, ranked by the weighted mix (`combine` of standardised scores, weights a parameter, default `EQUAL_WEIGHTS` until the harmonicity-leaning default is set at the mock) and by Pareto layers (`paretoLayers`, new: repeated `paretoFront` peeling, any two score keys); constraints (must-have / must-not-have) apply as in M2; worker-ready chunked iteration with the ordering cap, exactly as `placementChunks`.
  - [ ] Other grids: a 19-EDO and a 31-EDO case (same step patterns as 12-EDO, different cents); a JI case (non-whole spans: the bottom note rounds to the nearest grid step that keeps the span inside the window; the top is bottom + the exact span).
  - [ ] The four ported engines stay in the lib unchanged as `distribution` values beside the two rules (the old page still uses its own `engine.ts` until M5), so the golden test stays as it is; README "Status" and a new "Spacing rules" section describe the rules, the examples above and the window decision. PROGRESS notes the golden test's status.
  - [ ] `check:interval-placement` green; path-scoped commit.
- Human checkpoint after: yes (the catalog for `11 7 16` and one other interval set of the human's choosing, heard and read before the mock)
- Checkpoint decisions (human, 2026-11-23): **equal centers is the default spacing rule** ("after exploring them both I want equal centers as the default"), chosen over the shared center range after the full n = 2–5 catalog on the findings page and the worked arithmetic of both rules. Equal centers: centers c₀ + k·D with D = min over slots i < j of (W − (dᵢ + dⱼ)/2)/(j − i) and c₀ = max over k of (dₖ/2 − k·D); every chord with 2+ intervals spans the whole window. Bottom note = nearest step to (center − size/2), ties toward the window middle (centered exactly on the middle: down). The shared center range (centers spread evenly over [M/2, W − M/2], M = largest interval, the same for every ordering) stays available as the second rule.
- Checkpoint decisions (human, 2026-11-23, window): **the window is a width only**, not a register region. Every window starts on the base note; moving a chosen entry through the register is the exploration step after the catalog. Shown with `11 7 16`, width 24, base C2: width only = 6 chords on C2; a region C2–C5 would give 78 (13 starting notes) and its ranking would drift to the top of the region (interference falls with register, M2b). The orchestral-section idea (the reason for the old octave windows) can return as a preset of base note + width range, not a library concept.
- Checkpoint decisions (human, 2026-11-23, ranking): **pitch-space harmonicity carries the harmonicity in the default ranking** ("pitch space agreed"), after the example `11 7 16`, Open, C2 (pitch-space puts C2 A2 C3 E3 B3 first, pitch-class C2 G2 B2 E3, and pitch-class scores C2 G2 B2 E3 and C2 F2 A2 E3 the same). Default weights interference −1, periodicity 0, `harmonicityPitch` +1; `EQUAL_WEIGHTS` unchanged as a preset (DECISIONS INTERVALPLACEMENT-4). The size of the harmonicity lean (+1 or more) is still open for the mock. Second set for the checkpoint: **`5 11 15`** (human).
- Checkpoint result (human, 2026-11-24): **M2c approved** after listening to the checkpoint page (`11 7 16` and `5 11 15`, both rules): "It looks good lets continue". M2c is done; M3 next.

### M3: Workspace mock
- Scope: a mock route `/interval-placement/mock` (locked `src/Router.tsx`) on the shared dock Stage with the shared kit, static real numbers from M1/M2/M2c for the default `11 7 16` in 12-EDO on C2 (plus one 31-EDO example), no live maths. Panels written as Stage modules from the start (size-class rendering), so M4 swaps the data, not the layout.
- Acceptance:
  - [ ] Every panel in "Proposed UI" present with real static data, in a proposed default screenset; dockers, tabs, send-to and the Panels menu work as in the workbench.
  - [ ] Look: kit chrome, the lab's tooltip and help-text format on at least the Input and Catalog panels; any place where the kit and the lab differ is listed for the human.
  - [ ] Screenshots at 1500 px and 1100 px, light and dark (dev server + headless Chromium, throwaway profile), with a "what changed and why" list mapped to the Diagnosis and the M2b decisions.
  - [ ] Thin slice, human first (shell rule 7, look changes): no reviewer, gate or commit of look work until the human has looked.
- Checkpoint decisions (human, …):
- Human checkpoint after: **yes** (rounds of review until approved, as harmonic-field-lab M4)

### M4: Live workspace
- Scope: owned page folder; locked `src/pages/IntervalPlacement.page.tsx` (renders the live workspace).
- Acceptance:
  - [ ] `/interval-placement` shows the approved layout from one external page store; the catalog is live through `src/lib/interval-placement/` in a Web Worker, scores through `src/lib/consonance/`; exploration panels as agreed after M2c.
  - [ ] Portability rules hold (see "Portability"): panels read the store, not page props; no window or document key listeners; no imports from `src/pages/composition-workbench/`; playback only through the page-local Preview interface; tuning and base pitch come from a page-local PitchContext.
  - [ ] Playback at the real base pitch (scored register = heard register), selection by identity, hover cross-highlight across every view.
  - [ ] Persistence `…settings.v2` (migrated from `…v1`, tested with real v1 data and bad data) and `…ui.screensets.v1`.
  - [ ] Panels may keep mock content where noted in the report.
  - [ ] Tests: store and reducers, persistence, worker protocol (with a fake worker), a test that fails if a panel module registers a window key listener, page tests for input and selection; `check:interval-placement` green.
- Human checkpoint after: **yes** (ears and feel)

### M5: Live panels + retire the old code
- Scope: owned page folder; locked `src/Router.tsx` (retire the mock route).
- Acceptance:
  - [ ] Catalog (map + list), exploration panels, Relations, Visualizer views and Reader all live.
  - [ ] Old modules removed: `engine.ts`, `intervalMath.ts` scoring, `psychoacousticsV2.ts`, `ScoringInfoModal.tsx`, `PlacementForm.tsx`'s engine controls; nothing else imports them.
  - [ ] Feature-parity checklist against today's page (every control accounted for, or dropped with the human's OK).
  - [ ] Mock route retired; `check:interval-placement` green.
- Human checkpoint after: **yes**

### M6: Hand-off contracts (PitchContext, Preview, Emit) — **tell the human before starting**
- The human asked to be warned before this step. It starts only after the human says go, and is kept small: no workbench code changes, no port.
- Scope: owned page folder (`contracts/` or similar, pure types plus the standalone implementations) and the lab's planned names; a shared `DECISIONS.md` row; `ARCHITECTURE.md` (locked) "Who consumes what".
- Scenarios first: `SCENARIOS.M6.md`, a handful of concrete cases in plain words, each showing what goes in and what comes out (e.g. "the workbench project is in 19-EDO at A4 = 440: what does Placement receive?", "you press Emit on a 31-EDO voicing: what notes, with what exact pitch, does the host get?", "the host plays a preview and you move the structure mid-sound"). Confirmed by the human before any type is written.
- Acceptance:
  - [ ] PitchContext (in), Preview (play / stop by voicing), Emit (a voicing out with fractional midicents and the exact identity: EDO step or ratio, per W-44) as small TS types with the standalone page's implementations; the page runs only through them.
  - [ ] A fake host in a test drives all three (a different tuning in, a recorded preview, a captured emit).
  - [ ] DECISIONS row (shared contract) naming who should adopt it (the lab seams arc, the workbench port); BACKLOG `[harmonic-field-lab]` and `[workbench]` items.
  - [ ] `check:interval-placement` green.
- Human checkpoint after: **yes**

## Final step
Page `ARCHITECTURE.md` (including the portability rules and the M6 contracts) and both lib `README.md`s complete. A **Workbench port plan** in the page's `ARCHITECTURE.md`: which panels register as workbench Stage panels, what the workbench supplies for PitchContext, Preview and Emit, what changes in the store, and how a "best voicing" option could sit beside `chordInput/voicing.ts` (the workbench's packets and routing are replaceable, W-45, so the plan targets the contracts, not today's packets). Reviewer over the full arc diff. Archive as `ARC.scoring-workspace.md` / `PROGRESS.scoring-workspace.md`. BACKLOG items: `[workbench]` the port; `[harmonic-field-lab]` adopt the M6 contracts in the seams arc; `[interval-placement]` force-based spacing (M2b decision 6), keyboard/fretboard for other EDOs, ratio/cents interval input, voice-leading cost against a previous voicing. (The `[shared]` perception-models item is already in BACKLOG since 2026-11-20.)

## Open questions (answer at approval or at the milestone where they matter)
- (answered at approval, 2026-11-13: three scores yes, v1/v2 dropped; workspace as a generic local copy; Bowling et al. download allowed.)
- (answered at M2b, 2026-11-13: shared notes allowed and shown; spread is a numeric range with optional named presets.)
- (answered at the revision, 2026-11-20: see "Revision checkpoint decisions"; then the model reset.)
- (answered at M2c, 2026-11-23: equal centers is the default rule; the window is a width only, register comes from the base note and exploration.)
- Later (catalog ranking): the exact harmonicity-leaning default weights.

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- An expected value in a test turns out to be wrong in theory, or a cited paper says something other than this ARC claims (report it; don't silently change the test or the claim).
- A change outside a milestone's scope or Owned/Shared paths, or to shared shell code (theme, audio, shared components), `ARCHITECTURE.md` contracts, or the page's `ARCHITECTURE.md` contracts.
- A shared path we need is locked by another arc, or `check:interval-placement` is red only because of another arc's files.
- A change would break loading of saved v1 settings.
- Any decision about layout, wording, look or sound beyond the approved mock or existing patterns.

## Budget
Max 2 builder attempts per milestone, then stop and report.
