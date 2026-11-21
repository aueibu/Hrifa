# ARC: Ratio Rhythm Lab (`ratio-rhythm`)

Status: **approved 2026-11-20** with the decisions below; setup (rule 16), then C0.

## Approval decisions (2026-11-20)
- Look: the Harmonic Field Lab conventions (`arcs/harmonic-field-lab/UI-CONVENTIONS.md`), as `affine-focus` adopted them. The human: "harmonic lab style".
- Name and route: "Ratio Rhythm Lab" at `/ratio-rhythm`. The human: "That works".
- Data source: `zgen.py` is canonical for family counts and types (`ji_zsets.py` stays for the targeted search and EDO mode). A converter under `research/ji-z-partners/` is allowed. The human: "If zgen is the canonical one yes".
- Added milestone D1 at the human's request: "a milestone maybe to get better centralized data somewhere and to run anything else we need on the VM".

## Goal
Bring the Ratio rhythm lab into `shell/` at `/ratio-rhythm`, replacing the claude.ai artifact (snapshot in `reference/ratio-rhythm-lab.html`, 1,747 lines, about 120 functions). The math moves into a pure, tested library `src/lib/ratio-rhythm/` whose tests are the worked numbers of the canon (`_Ideas/Rhythm-As-Pitch/Ratio rhythm timeline and canon.md`, the project's source of truth); the page is then rebuilt on that library in stages, each looked at by the human before polish. Why now: the research (canon, `zgen.py`, results) lives in the repo and moves quickly, but the artifact cannot read repo files, run tests or be edited by Claude Code sessions. The JI search itself stays in Python (`research/ji-z-partners/zgen.py`, run on the VM); the page gets the fast targeted partner search in TypeScript and reads a committed catalog file.

## Parameters

- **Source of behavior:** the snapshot `arcs/ratio-rhythm/reference/ratio-rhythm-lab.html` (artifact version 1795220968-b833, read 2026-11-20) for what the app does, and the canon for what the math must give. Where they disagree, the canon wins and the difference is logged in `PROGRESS.md`. Builders read the whole relevant part of the snapshot before porting it (port-applet skill, step 1).
- **What the artifact has** (function groups in the snapshot):
  - Grouping trees: `countSplits`, `sampleNode`, `sampleSeq`, `layout`, `weights`, `syncScore`, rule controls (cycles 2 to 96 pulses, leaf sizes 1 to 9, at most 2, 3, 4 or any parts per split).
  - Ring and tuning: `parseRatios`, `lcdOf`, `linearRing`, `logRing`, `gapsOf`, `modeOf`, `quantGrid`, `bitsLost`, `distinctCount`, `factorize`.
  - Meter: `divisiveScore`, `arrayScore`, `hierDivisive`, `hierArray`, `scoreH`, `additiveSearch`, `rotations`, `weightStrips`.
  - Evenness and grouping: `euclid`, `sbPath`, `proximityTree`, `treeDepth`, `align`.
  - Spectrum and Z: `dft`, `ivOf`, `canonKey`, `zPartners`, `startZFind` (finder, 15 s limit), `slotsToGaps`, `rhythmName`, `alignTo`.
  - Catalog: `saveCat`, `addCat`, `catText`, `renderCatalog` (localStorage key `rrl-catalog`, artifact origin only).
  - Audio and grid preview: `synthPulse`, `playPair`, `wavePlot`, `seqPlay`, `seqRows`, `seqBpm` (equal cycles and equal pulse timing).
  - JI lattice: `latVec`, `latContent`, `latClass`, `latPartners`, `latPartnersFor`, `latScene`, `latDraw`, `latRotate` (a lattice view with JI-level partners).
- **Conventions fixed by the canon:** L ring size in slots, k onsets, slots count from 0, pulses count from 1; linear slot = rL − L; log ring rounds cents to N steps; names are gap-based (`15·6 ⟨1 1 3 3 3 4⟩`, scale name from the root, one-token barline form `⟨113|334⟩`, gaps of 10 or more space-separated).
- **Pitch and time:** exact ratios (numerator, denominator as integers or bigint where the LCD can overflow; the rates reading reaches 259,350 slots) and integer slots inside the library. Cents only for display and audio. Nothing is converted to midicents (W-1 applies only at a later Workbench handoff, out of scope here). Monzo helpers may be imported read-only from `src/lib/harmonic-field/` (H-1); C0 decides which.
- **Persistence:** one per-page key, `hrifa.ratio-rhythm.v1` (inputs, chosen lens, catalog). The artifact's `rrl-catalog` cannot be read from the shell (different origin): the catalog gets a "paste text" import that accepts the artifact's "Copy as text" output.
- **Audio:** page-local Web Audio (the artifact's synthesized pulses), started only by a click. Never played by an agent without asking (memory rule). No dependency on the workbench audio engine.
- **Look:** the Harmonic Field Lab conventions that `affine-focus` also adopted (`arcs/harmonic-field-lab/UI-CONVENTIONS.md`, theme roles only, type scale tokens); decided at approval. American spelling everywhere. Follow the route affine-focus took: copy, never import lab page components; one page stylesheet `RatioRhythm.module.css`; local MiniRing, card and fold components. Two corrections to affine's example (C0): the eight `--lab-fs-*` type tokens are defined on the page's `.root`, not on `:root`; error displays (quantization shift, tempering error) use the signed error color of H-25 and H-38 (orange sharp, cyan flat, neutral exact, five bands), not the older cyan-to-red sweep in `arcs/affine-focus/ARC.md`; parse errors use `--text-danger` (H-18).
- **Reuse from `src/lib/harmonic-field/`** (import-only, by file, never the `index.ts` barrel): `types.ts` (`Monzo`, `Note`), `intervals.ts` (`factorInt`, `ratioNote`, `mFrac`, `mAdd`, `mulNotes`, `mCents`, `oddLimit`, `primeLimit`, `tenneyHeight`, `reduceInto`, `fmtRatio`, `PRIMES`). The ratio parser requires exact ratios (reject `m === null`). gcd, lcm and LCD are written locally in bigint (the lab exports none).
- **Time:** integer slots per cycle inside the library; seconds only at the audio edge; W-2 (exact quarter-note rationals) applies at a later Workbench handoff. Recorded as RR-1.
- **Testing the finder:** its time limit takes an injected deadline or step budget, so tests never wait on real time.
- **JI data:** one canonical home, built in D1: `research/ji-z-partners/data/` with a manifest of every run. The page's catalog file is generated from it by the converter, never edited by hand.
- **DECISIONS prefix:** `RR` (registered in the first `DECISIONS.md` row if a cross-arc decision is needed).

- Owned paths: `src/lib/ratio-rhythm/`, `src/pages/ratio-rhythm/`, `arcs/ratio-rhythm/`; outside `shell/`: `research/ji-z-partners/data/` and the converter `research/ji-z-partners/catalog.py` (D1). The rest of `research/ji-z-partners/` (`zgen.py`, `HANDOFF.md`) is edited only when D1 needs it, and `HANDOFF.md` is kept in step.
- Shared paths it may touch: `package.json` (new-arc setup for `check:ratio-rhythm` only), `src/pages/RatioRhythm.page.tsx`, `src/Router.tsx`, `src/data/applets.ts` (M4 registration), `shell/ARCHITECTURE.md` ("Who consumes what" row, M9). `src/lib/harmonic-field/` is import-only: no edits (owned by the harmonic-field-lab workstream).
- Check command: `corepack yarn check:ratio-rhythm`, modeled on `check:affine-focus`: `npm run typecheck && oxfmt -c oxfmt.config.mjs --check --no-error-on-unmatched-pattern "src/lib/ratio-rhythm/**/*.{ts,tsx}" "src/pages/ratio-rhythm/**/*.{ts,tsx}" && oxlint -c oxlint.config.mjs --no-error-on-unmatched-pattern src/lib/ratio-rhythm src/pages/ratio-rhythm && stylelint "src/pages/ratio-rhythm/**/*.css" --cache --allow-empty-input && vitest run --passWithNoTests src/lib/ratio-rhythm src/pages/ratio-rhythm`
- Concurrency: same checkout and branch as the other arcs; the orchestrator commits at the end of every milestone with path-scoped `git add <paths>` and `git commit -- <paths>` only (never `git add -A` or a bare `git commit`; on an `index.lock` error retry, never delete the lock) and removes lock rows only after that commit; after writing a lock row re-read `arcs/LOCKS.md` (on a duplicate the earlier row wins, or the human decides); use the `RR-` prefix for `DECISIONS.md` rows.

## Preconditions
- `check:ratio-rhythm` exists (created under a `package.json` lock at setup, before C0) and is green before M1. Its `tsc --noEmit` step is project-wide: red only because of other arcs' files is not this arc's to fix (rule 14).
- Node 24 on PATH for every run (`shell/CLAUDE.md`, Environment notes).

## Non-goals
- No changes to `src/lib/harmonic-field/`, `src/pages/harmonic-field-lab/`, `src/pages/composition-workbench/`, the shared components or the theme.
- No JI exhaustive search, `zgen.py` port or Python in the browser. VM runs happen only through D1, launched by the human.
- No Workbench integration yet (sending a rhythm to the workbench, a shared lattice with the lab): later arc, logged in `BACKLOG.md`.
- The artifact is not deleted; it is frozen with a pointer at M9.

## Milestones
Library milestones (M1 to M3) are pure TS with Node tests (`*.test.ts`); their scenario tables are the canon's worked examples below, already confirmed in the canon, so they need no separate scenario round. Page milestones (M4 onward) are thin slice first: build, the human looks, then polish, tests and review (memory: look changes human first).

### C0: Context scan
- Read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of every other arc, `arcs/LOCKS.md`, and `src/lib/harmonic-field/README.md` (which ratio and monzo helpers to import rather than rewrite). Record the result in `PROGRESS.md`.
- Acceptance:
  - [ ] `PROGRESS.md` notes the scan result, the helpers chosen for reuse, and any decision or backlog item that affects this arc
- Human checkpoint after: no

### M1: Library: rings, tuning, modes, names
- Scope: `src/lib/ratio-rhythm/` (`ratios.ts`, `ring.ts`, `tuning.ts`, `modes.ts`, `names.ts`, `index.ts`, `README.md`, tests)
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] 1/1 10/9 9/8 5/4 3/2: linear ring L = 72, slots 0, 8, 9, 18, 36, gaps 8, 1, 9, 18, 36; mode ring sizes 72, 80, 81, 45, 54 (the fingerprint); odd-harmonic form {5, 9, 27, 45, 81}; the re-rooted mode table of Canon 3 (ratios and gaps for each root)
  - [ ] GCD check: 24:28:32:36:44 on 24 reduces to 6:7:8:9:11 on 6; rates reading of 1/1 7/6 25/19 13/6 gives 259,350 slots
  - [ ] Tempering: 81/80 maps to 0 steps in 7, 12, 17, 19, 24, 31 and to 1 step in 22, 29, 41, 53 (val check)
  - [ ] Quantization 72 to 16: targets 0, 2, 2, 4, 8; 0.4 bits lost; 4 of 5 exact; anchored pair rule N > L/(2d) (10/9 mode needs N ≥ 41, 9/8 mode N ≥ 21); tie rule both ways; grids keeping all five onsets in every mode: 46, 48, 54, 55 to 58, 61 to 67, 69 to 72 (53 only with ties rounding up)
  - [ ] Names: `15·6 ⟨1 1 3 3 3 4⟩`; scale `⟨334113⟩` decodes to slots 0, 3, 6, 10, 11, 12 and 1/1 6/5 7/5 5/3 26/15 9/5; one-token `⟨113|334⟩`; the 72 example's scale `⟨8 1 9 18 36⟩`, rhythm `⟨1 9 18 36 8⟩`, class `⟨1 8 36 18 9⟩`
  - [ ] Equal cycles vs equal pulse: common grid 6,480 for the example; equal-pulse lengths 72, 80, 81, 90, 108 tatums
- Human checkpoint after: no

### M2: Library: evenness, grouping, meter, perception, ring Z-relations
- Scope: `src/lib/ratio-rhythm/` (`euclid.ts`, `grouping.ts`, `meter.ts`, `distance.ts`, `spectrum.ts`, `zring.ts`, `finder.ts`, tests). The finder is cancellable with a time limit (the artifact's 15 s), so the page can run it without freezing.
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] E(5, 53): parents 2/21 and 3/32, children 7/74 and 8/85, gaps (10, 11) + (10, 11, 11); the parent-concatenation identity holds for every fraction with denominator up to 80 (1,886 fractions)
  - [ ] 53 into 5s and 3s: exactly four mixes; Schröder counts 1, 1, 3, 11, 45, 197; top-down and bottom-up totals agree
  - [ ] Meter on 72: the ten orderings of 2·2·2·3·3 run from syncopation 0 (2×2×2×3×3) to 8 (3×3×2×2×2), and in every ordering one of 10/9 and 9/8 is weak; on 53 the 10 × 5 + 3 family never drops below 5, and the best groupings use 4 fives and 11 threes
  - [ ] Proximity tree on gaps 8, 1, 8, 14, 22: (8 + (1 + 8) + 14) + 22
  - [ ] Distances at 120 BPM (Canon 5 table): Hamming 1 and 2, swap 6.9 ms and 0.87 ms, chronotonic 772 and 95 ms²
  - [ ] Ring Z: {0, 1, 4, 6} and {0, 1, 3, 7} share an interval vector on 12; {0, 1, 3, 9} and {0, 1, 4, 6} on 13; equal interval vectors iff equal DFT magnitudes on random sets; the 45-ring set 0, 9, 18, 27, 35, 36 has no partner
  - [ ] Finder: the cheapest fix for that set moves two notes by 5 slots in total and gives 1/1 6/5 7/5 5/3 26/15 9/5 (ring 15) with partner 1/1 4/3 7/5 23/15 26/15 9/5
  - [ ] Linear-ring pair: 1/1 10/9 9/8 89/72 3/2 7/4 ~ 1/1 9/8 89/72 5/4 3/2 29/18 holds on the 1/1 rooting (72) and on none of the other five
- Human checkpoint after: no

### D1: JI data hub and VM runs (outside `shell/`)
Research work, not page work: it follows `research/ji-z-partners/HANDOFF.md` ("How the user works"). Heavy runs happen on the human's VM; the orchestrator writes code and gives exact commands, one per block, with runtime and cost first; Python runs locally only when the human asks.
- Step 1, inventory: list every result that exists (the VM's `/home/austin`: `place_*`, `run_*`, `uv*/`; local `_Ideas/Rhythm-As-Pitch/run_*`; the original cloud `results.tgz`), with sizes and what each holds. **Human checkpoint:** where the large files live (in the repo under a size cap, or a Cloud Storage bucket with the repo keeping the manifest), before step 2.
- Step 2, the hub: `research/ji-z-partners/data/` with `manifest.json` (one entry per run: gamut primes, odd limit and size, sizes k, mode `exhaustive` / `place` / `directsum`, `zgen.py` commit and md5, date, machine, counts per k, where the full output lives), per-run `summary.csv` and `types.jsonl`, small family files committed; `catalog.py` turns the hub into the page's catalog JSON (under `src/lib/ratio-rhythm/data/`).
- Step 3, VM runs: a run sheet `research/ji-z-partners/data/RUNS.md` with each pending run, its command, expected result and estimated runtime, and how to pack and bring results back. Pending now: 5-limit odd ≤ 123 `types` + `place` at 10, 11, 13 and 14 notes (expected 292 of 295, 25 of 25, 41 of 49, 495 of 498); 7- and 11-limit odd ≤ 123 at 10 notes and up; the 13-odd-limit diamond at 9 to 12 notes; the EDO run 5 to 31 (`ji_zsets.py`). The human launches each run; results go into the hub as they arrive.
- Acceptance:
  - [ ] The manifest lists every run in `HANDOFF.md`'s results table with matching counts, and says where each full output lives
  - [ ] `catalog.py` turns the 7-limit odd ≤ 75 run into a catalog file with 8 families at 8 notes (types 91: 5, 92: 3)
  - [ ] `RUNS.md` has a command, expected result and runtime for every pending run; `HANDOFF.md` points to the hub
- Human checkpoint after: yes (and at the step 1 storage decision)

### M3: Library: JI level and catalog
- Scope: `src/lib/ratio-rhythm/` (`lattice.ts`, `jiContent.ts`, `jiPartners.ts` (targeted search, from the artifact's `latPartners` and `_Ideas/Rhythm-As-Pitch/ji_zsets.py`), `catalog.ts` (schema and loader for the catalog JSON that D1's `catalog.py` generates), tests).
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] The stacked-fifths pair {0, 1, 4, 10, 12, 17} and {0, 1, 8, 11, 13, 17} share JI interval content; the targeted search finds each from the other
  - [ ] 5-limit family 3 (1/1 10/9 6/5 32/25 128/75 16/9 ~ 25/24 10/9 6/5 5/4 8/5 16/9): found by the targeted search, and tempered to 12-EDO it becomes 6-Z12 / 6-Z41 (interval vector ⟨332232⟩)
  - [ ] The 5-limit JI diatonic and chromatic have no partner; a 12-note 19-limit pair is answered in under a second
  - [ ] The catalog loader reads a fixture of the 7-limit odd ≤ 75 run (8 families at 8 notes, types 91 and 92) and looks a set up by its interval content
- Human checkpoint after: no

### M4: Page shell and the prism, thin slice
- Scope: `src/pages/RatioRhythm.page.tsx`, `src/Router.tsx`, `src/data/applets.ts` (under locks), `src/pages/ratio-rhythm/` (app, state, prism inputs, ring, name panel, one lens: Spectrum with ring Z-partners)
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] `/ratio-rhythm` is registered and listed on Home
  - [ ] Typing the worked example shows ring 72, the five onsets with ratio labels, the fingerprint and odd-harmonic form, the three names, and the Spectrum lens with strengths up to ⌊L/2⌋ and its partners
- Human checkpoint after: **yes** (the look)

### M5: The other prism lenses
- Scope: `src/pages/ratio-rhythm/` (Ancestry, Evenness, Isochrony, Tuning, Meter, Grouping lenses; Z-relation views: chord rings, pair table, arrow dials; the finder with progress and cancel)
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] Each lens shows the canon's numbers for the worked example (the M1 and M2 cases, read from the library, never recomputed in the view)
- Human checkpoint after: **yes**

### M6: Grouping trees tab
- Scope: `src/pages/ratio-rhythm/` (the Grouping trees tab: top down, bottom up, random hierarchy, fill, onsets with weights and syncopation; passing rhythms to and from the prism)
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] The two-route total check agrees for the rule settings in the M2 tests; a proximity tree opens here with its onsets marked
- Human checkpoint after: **yes**

### M7: Sound and grid preview
- Scope: `src/pages/ratio-rhythm/` (`audio.ts`; see-and-hear: cycle speed from rhythm to pitch, play or alternate a pair, waveform plot; grid preview with meter shading, looping rows, cycle 0.25 to 16 s, beat size and BPM field, equal cycles and equal pulse)
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] Scheduling is unit-tested (onset times for both timing conventions at a given BPM); no sound plays without a click
- Human checkpoint after: **yes** (the human listens; agents do not press Play)

### M8: Catalog, JI partners and lattice view
- Scope: `src/pages/ratio-rhythm/` (catalog panel with Play, Load, Remove, Copy as text and paste import; the JI partner panel from M3, reporting whether each partner also holds on the current log and linear rings; the lattice view; the committed catalog lookup)
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] Text copied from the artifact's catalog imports intact; `hrifa.ratio-rhythm.v1` survives a reload
  - [ ] For the worked example and for family 3 the JI panel matches the M3 results
- Human checkpoint after: **yes**

### M9: Docs and handover
- Scope: `src/pages/ratio-rhythm/ARCHITECTURE.md`, `src/lib/ratio-rhythm/README.md`, `shell/ARCHITECTURE.md` (a "Who consumes what" row, under a lock), `BACKLOG.md` (Workbench and lab integration items), the canon's "Ratio rhythm lab" section (points at the shell page), and a superseded note at the top of the artifact.
- Acceptance:
  - [ ] `check:ratio-rhythm` passes
  - [ ] The artifact opens with a pointer to `/ratio-rhythm`; the canon's lab section describes the shell page
- Human checkpoint after: yes (sign-off)

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- The snapshot and the canon disagree on a number and the canon does not settle which is right.
- A change is needed outside a milestone's scope, outside Owned paths or Shared paths, or to `shell/ARCHITECTURE.md` contracts.
- A shared path needed is locked by another arc in `arcs/LOCKS.md`.
- Any decision about look, sound, or musical taste not specified above.

## Budget
Max 2 builder attempts per milestone; then stop and report. Estimate: 11 steps (C0 to M9 plus D1), each one builder run plus one reviewer run, and one `check:ratio-rhythm` gate per milestone (gates on this machine take about 2 to 6 minutes). The library milestones are the cheapest and carry most of the value; the page milestones cost more because each waits for a look and may need a polish round.
