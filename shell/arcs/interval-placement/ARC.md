# ARC: Interval Placement: rigorous, register-aware scoring + panel workspace

**Status: APPROVED (2026-11-13).** Next: Setup (`check:ip` under a `package.json` lock), then C0, then M1.

## Goal
Interval Placement keeps its idea and gets a sound scoring core and a better workspace:

1. **The idea stays.** You name a few *essential* intervals; each placement adds a relation from the new notes to every note already placed, and the rest of the chord's intervals (the *induced* ones) fall out of that. The window width is the wide-vs-narrow constraint in steps, and the placement engines decide where the spans gravitate (low, high, centred, spread).
2. **Scoring is rebuilt on published, tested models** (see "Scoring model"), computed at the real pitch you hear, so a major 3rd low, the same 3rd an octave up and a major 10th all score differently for acoustic reasons, not hand-tuned factors. The scores describe what the induced relations sound like; they do not impose orchestration rules.
3. **The engine and the scoring become pure TS libraries** (`src/lib/consonance/`, `src/lib/interval-placement/`) so the Composition Workbench can later use them as a voicing engine without importing a page.
4. **The page is rebuilt as a panel workspace** in the style of the approved harmonic-field-lab layout (rail, pinned columns, stacks, splitters), starting with a **mock** the human approves before anything live is built.

## Design decisions already made (from the human)
- The concept is relational (essential intervals, induced relations fall out), **not** orchestration rules. No spacing rules or low-interval-limit tables. (2026-11-13)
- Window width is a stepped wide/narrow categorisation; it may be improved. (2026-11-13)
- The engines exist to shift emphasis (fit within the window and span, then gravitate low / high / truly centred). Keep them. (2026-11-13)
- Scoring must account for both the absolute register of each note and the intervals themselves (M3 low vs M3 + octave on the same root vs either at C4 or C6). It should follow academically rigorous metrics without sacrificing the app's creativity. (2026-11-13)
- The current v1/v2 scoring is largely a vestige of early back-and-forth and may be replaced. (2026-11-13)
- Process: same as the harmonic-field-lab arc: an ARC the human approves, then a mock reviewed in rounds before the live UI. The harmonic-field-lab's panel and modular approach worked well; follow it. (2026-11-13)
- Long-term: this feeds, and may become, an engine in the Composition Workbench. (2026-11-13)
- **Approval (human, 2026-11-13):**
  - The three scores (interference, periodicity, harmonicity) are the right set; more are welcome if they earn their place (see "Descriptive measures" below, added at approval). v1 and v2 scoring are dropped, not kept as a legacy toggle.
  - The **Pareto-front plot** is a headline view for reading results; the **per-interval contribution view** and **must-have / must-not-have interval constraints** are wanted.
  - Panel workspace: a generic copy in our page folder, written so that promoting it to a shared component later is a smooth port; the human sees the mode being reused by later apps.
  - The M1 builder may download the Bowling et al. (2018) ratings (check the licence). If the download fails, report the exact citation and DOI needed and the human will source the file.
  - The M3 mock questions (shared notes, window steps, default weights) wait until the human sees the mock and has them clarified.

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

- **Interference (roughness).** Plomp & Levelt (1965) dyadic curve over every partial of every note against every other, with critical bandwidth. Default model: Hutchinson & Knopoff (1978), the interference model Harrison & Pearce (2020) found to fit listener data best (the M1 builder verifies this against the paper and stops and reports if it says otherwise). Sethares (1993) with ERB bandwidth (Glasberg & Moore 1990) is the alternative, for comparison with the harmonic-field lab. The timbre (partial count and roll-off) matches the playback timbre. No register damping and no compound relief: both effects emerge from the acoustics.
- **Periodicity (Stolzenburg 2015, "relative periodicity").** Approximate each note as a ratio over the lowest note (within a tolerance tied to the tuning), then take log2 of the period of the combined pattern. Readable (it can print the chord as "≈ 4:5:6") and sensitive to octave placement: 5:2 (M10) is simpler than 5:4 (M3).
- **Harmonicity (template / virtual pitch).** Milne-style spectral template matching (as used in Harrison & Pearce 2020), applied in **pitch space, not pitch-class space**, so octave placement still counts. Continuous, needs no ratio rounding, works in any EDO or non-EDO tuning.
- **Relations view.** Every score is decomposed per induced dyad (each relation's own roughness at its real register) and per note (marginal contribution = score with the note minus score without it). This is the app's "each placement adds a relation to every other" idea made measurable.
- **Ranking.** Totals, not per-pair means; the worst relation is reported separately. Default list order = a weighted mix (user slider) of the scores standardised within the candidate set; the **Pareto map** shows the front (voicings nothing beats on both chosen axes). Axes default to interference × harmonicity and can be any two scores or descriptive measures.
- **Descriptive measures (not consonance, added at approval).** Cheap, exact facts that make good map axes and filters: span (cents), note count, register centroid (mean log-frequency), lowest note, number of distinct induced intervals (relational richness), and collisions. They are never mixed into the consonance scores.
- **Interval constraints.** Must-have and must-not-have intervals (by size, optionally octave-equivalent, e.g. "no induced minor 9th", "must contain a perfect 5th somewhere"). Must-not-have filters candidates out; must-have keeps only voicings that contain the interval as an essential or induced pair. Applied in the placement lib, so the workbench gets them too.
- **Dropped:** v1 (`intervalMath.ts` scoring), v2's harmonicity and harmonic entropy. (v2's ERB roughness survives as the Sethares option.)
- **Validation:** sanity orderings in tests (below) and, if the data can be obtained with a usable licence, a correlation against the listener ratings for all 12-TET dyads, triads and tetrads in Bowling, Purves & Gill (2018, *PNAS*), the dataset Harrison & Pearce also used. See Open questions.

Key references: Plomp & Levelt 1965 (*JASA*); Hutchinson & Knopoff 1978 (*Interface*); Terhardt 1982; Glasberg & Moore 1990; Sethares 1993 (*JASA*); McDermott, Lehr & Oxenham 2010 (*Current Biology*); Milne et al. 2011 (*J. Math. & Music*); Stolzenburg 2015 (*J. Math. & Music*); Bowling, Purves & Gill 2018 (*PNAS*); Harrison & Pearce 2020 (*Psychological Review*). The M1 builder checks every citation used in code comments and the reader text.

## Proposed UI (confirmed or changed at the M3 mock checkpoint)
One-screen workspace, harmonic-field-lab style: thin top bar (transport: arpeggio / chord / interval pairs, timbre), left rail picking panels with live one-line summaries, centre always visible, right side pinned columns with stacks and splitters, a thin keyboard/fretboard dock. DAW density, tooltips instead of paragraphs.

- **Centre, always visible: the placement unit.** Interval chips (each with its value, odd-bias toggle, and essential marking), EDO, base pitch as an absolute note (e.g. C2), window width in steps (half-octave steps, with category names), distribution (uniform, prefix-slack, prefix-dominance, repulsion = today's engines) and a gravity control (low ↔ centred ↔ high). Below it, the existing spans plot for the selected voicing.
- **Results panel:** ranked list (total, worst relation, note count, collisions flagged) with the weight slider and the interval constraints (must have / must not have chips), plus the **Pareto map** (any two axes, default interference × harmonicity; front highlighted; dominated points dimmed; hover cross-highlights the list; click selects).
- **Relations panel:** the induced-interval triangle (every pair: interval, octave span, its roughness at its register, essential vs induced marked) and per-note contribution bars.
- **Register panel:** the selected configuration slid through the register (scores vs bottom pitch), so the M3-low-vs-high idea is visible as a curve.
- **Visualizer panel(s)** with a view selector: Spectrum (all partials with critical-band overlaps, showing where roughness comes from), Interval counts / interval-class grid (today's), Periodicity (the "≈ a:b:c" ratio chord).
- **Reader / glossary:** replaces `ScoringInfoModal`; every score's definition, an example and its citation, from one `texts.ts`.

## Parameters
- **Owned paths:** `src/lib/consonance/` (new: pure TS scoring, no React/DOM), `src/lib/interval-placement/` (new: pure TS placement engine, no React/DOM), `src/pages/interval-placement/` (today unowned: components, state, mock, tests, `texts.ts`, `settings.ts`, the page's `ARCHITECTURE.md`), `arcs/interval-placement/`.
- **Shared paths it may touch** (row in `arcs/LOCKS.md` while edited, written by the orchestrator): `package.json` (Setup only: add `check:ip`); `src/pages/IntervalPlacement.page.tsx` (standing shared entry, M4); `src/Router.tsx` (M3 mock route, retired in M5); `src/theme/diagram.ts` (only if `resolveIntervalPlacementStyle` needs new roles; stop and ask first); `ARCHITECTURE.md` (M1 and Final: the two libs and the page in the map and "Who consumes what"). `DECISIONS.md`/`BACKLOG.md` need no lock for our own rows.
- **Taking over the page folder:** `src/pages/interval-placement/` has no active arc today, so it is a shared path until this ARC is approved; approval of this ARC is the human's OK, and Setup adds the `DECISIONS.md` row (I-1) that makes it owned by this arc.
- **Check command:** `corepack yarn check:ip` = `npm run typecheck`, then `oxfmt --check` and `oxlint` scoped to `src/lib/consonance`, `src/lib/interval-placement` and `src/pages/interval-placement` (both with `--no-error-on-unmatched-pattern`), stylelint scoped (`--allow-empty-input`), `vitest run --passWithNoTests` over the same three folders. Modelled on `check:hfl`. If red only because of other arcs' files, stop and report (shell rule 14).
- **DECISIONS prefix:** `I`, registered in our first row. Rows due: I-1 arc ownership of `src/pages/interval-placement/` (Setup); I-2 the libs' pitch representation (M1); I-3 the scoring model and ranking (M1); any theme-role change.
- **Pitch representation:** notes are cents above an absolute reference plus the reference in Hz (a voicing = `{refHz, cents[]}`); EDO steps are an input convenience (`steps × 1200 / edo`). Midicents (W-1) and Hz are derived only at the edge (audio, a later workbench handoff). This makes the libs EDO-agnostic and ready for the BACKLOG non-EDO pitch item.
- **Panel workspace code (decided at approval):** the harmonic-field-lab panel system (`Panels.tsx`, `Rail.tsx`, `PinMenu.tsx`, `state/layout.ts`, `panels.module.css`, about 2.2k lines) is owned by that arc and hard-wired to its panel ids, so it can't be imported as is. We build a generic version inside our page folder (`workspace/`), following its behaviour and look: panel ids, titles, summaries and renderers are passed in (no page-specific imports inside `workspace/`), its layout state and persistence are self-contained, and it has its own tests, so promoting it to `src/components/` later is a move, not a rewrite. A `[shared]` BACKLOG item records the promotion.
- **Persistence:** shell pattern (`loadSettings`/`saveSettings`/`sanitizeSettings`). New keys `hrifa.interval-placement.settings.v2` (migrated from `…v1`: intervals, EDO, base, window, engine params, odd bias, tuning) and `…layout.v1`. Bad data falls back to defaults.
- **Performance:** placement runs in a Web Worker with a cap on orderings (default 5,040 = 7 intervals; above it, results stream in and the UI says how many are left). The main thread never blocks for more than one frame.
- **Theme:** shell roles and `--mark-<hue>` only, per `src/theme/THEMING.md`. No hex.
- **Concurrency:** same checkout and branch as the other arcs. Path-scoped commits only (`git add <paths>`, `git commit -- <paths>`; never `git add -A` or a bare `git commit`; on `index.lock` retry, never delete it). Lock rows removed only after the commit. Builders run only the tests of the files they touched; the orchestrator runs `check:ip` once per milestone.

## Preconditions
- `check:ip` exists and is green before M1 (created at Setup with the rule-15 flags so it is green with no code). If red only because of other arcs' files, not ours to fix.
- Owned and locked paths are clean before each builder brief.
- `corepack yarn test` run once before M1 to record the baseline.

## Non-goals
- No orchestration rules (spacing tables, low-interval limits, doubling rules).
- No cultural-familiarity / corpus model in this arc (Harrison & Pearce's third factor).
- No Composition Workbench module in this arc (the workbench folder belongs to the workbench arc). This arc only makes the libs ready and writes the integration plan.
- No edits to `src/lib/harmonic-field/` or the harmonic-field-lab page (read and compare only). No new shared audio code.
- No keyboard/fretboard support for non-12 EDOs (BACKLOG).

## Milestones

### Setup (orchestrator, shell rule 16, after approval)
- Take the `package.json` lock, add `check:ip`, commit `arcs/interval-placement/` + `package.json`, release the lock. Append `DECISIONS.md` I-1 (registers prefix I; this arc owns `src/pages/interval-placement/`).

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
  - [ ] Interference dyad curve (two harmonic tones, default timbre, fine sweep) has local minima at 1/1, 6/5, 5/4, 4/3, 3/2, 5/3, 2/1.
  - [ ] Decomposition: without masking, `total` equals the sum of `dyads` (≤ 1e-9 relative); `perNote` equals total minus total-without-note.
  - [ ] EDO-agnostic: the same functions score 12-, 19- and 31-EDO chords and JI; 31-EDO's 7/4 approximation has lower periodicity than a 12-EDO tritone.
  - [ ] Cross-check: the Sethares option orders a fixed chord set the same way as `src/lib/harmonic-field`'s `scoreRoughness` (imported read-only in a test).
  - [ ] A comparison table (about 15 chords: dyads at three registers, triads, tetrads, clusters, compound voicings, the default `11 7 16` placements) with every score, pasted into PROGRESS for the human. If the Bowling et al. data is available (Open questions), also a Spearman correlation per score, reported, not gated.
  - [ ] Lib `README.md` documents each model with its citation and known simplifications; `ARCHITECTURE.md` lists the lib; `DECISIONS.md` I-2 (pitch representation) and I-3 (scoring model) appended. `check:ip` green; path-scoped commit.
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
  - Proposed default ranking weights for the M3 mock: the `incon` composite coefficients (interference −1.62, harmonicity +1.78, on standardised scores), shown as a preset beside "equal weights"; answers the M3 weights question with a published default, still the human's call.
- Human checkpoint after: no (the table is read at the M3 mock)

### M2: Placement library (`src/lib/interval-placement/`)
- Scope: owned `src/lib/interval-placement/` + tests + `README.md`. Moves the engine out of the page folder (the page keeps working on the old code until M4).
- API: `placeIntervals(spec)` where `spec = {intervals: {cents, essential, oddBias}[], window: {bottom (absolute), widthSteps}, distribution: 'uniform' | 'prefixSlack' | 'prefixDominance' | 'repulsion', gravity (-1 low … 0 as engine … +1 high), constraints: {mustHave, mustNotHave} (interval cents, octave-equivalent flag, tolerance), engine params}` → voicings `{refHz, cents[], essentialPairs, inducedPairs, collisions, perm, placement meta}`; an iterator form for the worker with a cap; `transpositionScan(voicing, range)`; `dedupe(voicings)`.
- Acceptance:
  - [ ] Golden test: with gravity 0, each distribution reproduces the current page's four engines (`v1`, `v2`, `prefixDominance`, `repulse`) exactly on a fixed input set (pitches and endpoints), so today's creative behaviour survives the move.
  - [ ] Gravity −1 / +1 moves every span's centre toward the window's bottom / top while keeping all spans inside the window; property test over random inputs.
  - [ ] Essential vs induced: each voicing lists which pairs are essential spans and which are induced; collisions are reported, never silently merged.
  - [ ] Dedupe: orderings that produce identical pitch sets yield one voicing, listing every ordering.
  - [ ] Cap: 8 intervals with the default cap returns the first 5,040 and reports the remainder; the iterator yields in chunks of ≤ 16 ms work (timed in a test with a generous margin).
  - [ ] Works in cents: a 19-EDO and a JI input place correctly.
  - [ ] Constraints: must-not-have removes every voicing containing the interval (exact and octave-equivalent modes); must-have keeps only voicings containing it; the number filtered out is reported; tests for both, including a constraint that removes everything (empty result, no error).
  - [ ] Descriptive measures (span, note count, centroid, lowest note, distinct induced intervals, collisions) computed per voicing.
  - [ ] `check:ip` green; path-scoped commit.
- Human checkpoint after: no

### M3: Workspace mock
- Scope: a mock route `/interval-placement/mock` (locked `src/Router.tsx`), built from shell components and our generic `workspace/`, static real numbers from M1/M2 for the default `11 7 16` in 12-EDO on C2 (plus one 31-EDO example), no live maths.
- Acceptance:
  - [ ] Every panel in "Proposed UI" present with real static data: placement unit with plot, Results (list + Pareto map with axis pickers + constraint chips), Relations, Register, Visualizer (Spectrum, Interval counts, Periodicity), Reader, transport bar, dock; rail with summaries, pin left/right, stacks up to three with splitters, Stack-with menu.
  - [ ] Screenshots at 1500 px and 1100 px, light and dark (dev server + headless Chromium, throwaway profile), with a "what changed and why" list mapped to the Diagnosis.
- Checkpoint decisions (human, …):
- Human checkpoint after: **yes** (rounds of review until approved, as harmonic-field-lab M4)

### M4: Live workspace
- Scope: owned page folder; locked `src/pages/IntervalPlacement.page.tsx` (renders the live workspace).
- Acceptance:
  - [ ] `/interval-placement` shows the approved layout driven by one page state; the placement unit is live through `src/lib/interval-placement/` in a Web Worker; scores through `src/lib/consonance/`.
  - [ ] Playback at the real base pitch (scored register = heard register), selection by identity (as today), hover cross-highlight across every view.
  - [ ] Persistence `…settings.v2` (migrated from `…v1`, tested with real v1 data and bad data) and `…layout.v1`.
  - [ ] Panels may keep mock content where noted in the report.
  - [ ] Tests: state reducers, persistence, worker protocol (with a fake worker), page tests for input and selection; `check:ip` green.
- Human checkpoint after: **yes** (ears and feel)

### M5: Live panels + retire the old code
- Scope: owned page folder; locked `src/Router.tsx` (retire the mock route).
- Acceptance:
  - [ ] Results list + Map, Relations, Register, Visualizer views and Reader all live.
  - [ ] Old modules removed: `intervalMath.ts` scoring, `psychoacousticsV2.ts`, `ScoringInfoModal.tsx`, the old engine copies (now in the lib); nothing else imports them.
  - [ ] Feature-parity checklist against today's page (every control accounted for, or dropped with the human's OK).
  - [ ] Mock route retired; `check:ip` green.
- Human checkpoint after: **yes**

## Final step
Page `ARCHITECTURE.md` and both lib `README.md`s complete. A **Workbench integration plan** in `src/lib/interval-placement/README.md`: the proposed module (inputs: a `pitch`/`interval` list or a `chordInput` Chord, optional previous voicing; output: `list | pitch | midicent | pitchMaterial` with one bracketed group per voicing and the scores in item metadata), and how it could offer a "best voicing" option beside `chordInput/voicing.ts`. Reviewer over the full arc diff. Archive as `ARC.scoring-workspace.md` / `PROGRESS.scoring-workspace.md`. BACKLOG items: `[workbench]` the module; `[shared]` promote the panel workspace; `[shared]` one roughness implementation shared by `src/lib/consonance` and `src/lib/harmonic-field`; `[interval-placement]` keyboard/fretboard for other EDOs, ratio/cents interval input, voice-leading cost against a previous voicing.

## Open questions (answer at approval or at the milestone where they matter)
- (answered at approval, 2026-11-13: three scores yes, v1/v2 dropped; workspace as a generic local copy; Bowling et al. download allowed.)
- M3 (human wants to see the mock first): should essential intervals be allowed to **share a note** as an option (e.g. 4 and 3 stacking into one triad), or stay always separate spans as now?
- M3: window width steps: half-octaves with names (close, open, wide, …) or keep whole octaves?
- M3: default ranking weights: equal standardised weights, or harmonicity-leaning (McDermott et al. 2010 found harmonicity the stronger predictor of preference)?

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- An expected value in a test turns out to be wrong in theory, or a cited paper says something other than this ARC claims (report it; don't silently change the test or the claim).
- A change outside a milestone's scope or Owned/Shared paths, or to shared shell code (theme, audio, shared components), `ARCHITECTURE.md` contracts, or the page's `ARCHITECTURE.md` contracts.
- A shared path we need is locked by another arc, or `check:ip` is red only because of another arc's files.
- A change would break loading of saved v1 settings.
- Any decision about layout, wording, look or sound beyond the approved mock or existing patterns.

## Budget
Max 2 builder attempts per milestone, then stop and report.
