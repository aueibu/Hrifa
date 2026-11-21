# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: ratio-rhythm (`arcs/ratio-rhythm`)
- Current milestone: D1 / M3 (M1 and M2 done)
- State: not started (D1 VM runs launched by the human in parallel)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft | `ARC.md` drafted 2026-11-20; artifact snapshot saved to `reference/ratio-rhythm-lab.html` (version 1795220968-b833) | none | |
| Approval | approved 2026-11-20 | none | harmonic lab style; "Ratio Rhythm Lab" at `/ratio-rhythm`; `zgen.py` canonical, converter allowed; D1 (data hub and VM runs) added before M3. See `ARC.md`, "Approval decisions". |
| Setup | `check:ratio-rhythm` added under a `package.json` lock (rebased onto main as 49802cc, lock released 56a2fd0; landed on main at 7265093) | green 2026-11-20 on main (Node 24.18.1, 6 workers, 5 s, no tests yet) | |
| C0 | done 2026-11-20 | none | Scan result below. ARC.md corrected: type sizes copied under page-prefixed names (`--rrl-fs-*`) on `:root`, signed error color H-25/H-38, `--text-danger` for parse errors, exact harmonic-field imports, time rule, finder deadline injection, `ji_zsets.py` path. RATIORHYTHM-1 added (registers prefix RATIORHYTHM, renamed from RR, then RATRHY; rule 16 as reworded on main 2026-11-20: the arc folder name in capitals with the hyphens dropped). |
| M1 | done 2026-11-20 on branch `ratio-rhythm-m1` (worktree; this background session could not edit the main checkout). Builder (general-purpose on sonnet with `builder.md`: the `builder` type is not registered when a session starts at the repo root), reviewer (opus with `reviewer.md`): pass, nothing blocking. Orchestrator applied the 3 should-fix items: one-token parse of `⟨1 \| 12⟩` (k = 2), `commonGrid` returns bigint and `equalCycles` returns null past 2^53, `ratesGrid` occupied count by inclusion-exclusion (exactly 600) instead of enumerating. | `check:ratio-rhythm` green 2026-11-20 (Node 24.18.1, 6 workers): 5 files, 64 tests; 3 lint warnings (`valid-expect`, message argument) | Canon differences below. Decisions: steps are signed (81/80 is +1 where it stays open); one-token barline is spaced (`⟨1 9 18 36 \| 8⟩`) when gaps are spaced, none when the root's gap is first (rootAt 0); `parseRatios(text, { reduce: false })` for the rates reading; equal-pulse onsets double harmonics below the root. (Names later changed to the lab's hyphen style, see "M1 follow-up".) |
| M2 | done 2026-11-20 on branch `ratio-rhythm-m2`. Lab comparison first (scout): only `sternBrocotAncestry` reusable; four format choices decided by the human (ARC.md M2 checkpoint decisions; flat groupings switched to `+` mid-build). Builder (sonnet), reviewer (opus): pass, nothing blocking, one canon correction. Fresh builder fixed 3 should-fix items (meter scoring from level sizes instead of per-slot arrays, 2,520 orderings of L = 259,350 under 1 s; finder yields per candidate, passes `shouldStop` into `zPartners`, reports `abortedSearches`; `countTrees` capped at `MAX_TREE_N` = 96 with `TreeLimitError`) and 6 nits. | `check:ratio-rhythm` green 2026-11-20: 12 files, 136 tests; same 3 M1 lint warnings | Canon difference below. Page-facing API: finder `done.abortedSearches`, `FinderOptions.shouldStop`, `MAX_INTERRUPTS`, `divisiveSyncopation`, `MAX_TREE_N`/`TreeLimitError` (page clamps cycles to 96), `MeterOrdering.hierarchy` is a lazy getter (read for one ordering only). Parents/children are `[left, right]` (smaller first), sentinel parent `null`. |

## M2 canon difference (2026-11-20)
- **53 ring, 10 × 5 + 3 family:** the canon (and the ARC M2 acceptance line) says syncopation "never drops below 5"; the true value is exactly **3** for all 11 members (minimum = maximum). Onsets on the 53 log ring are 0, 8, 9, 17, 31; group starts in this family are ≡ 0 or 3 (mod 5), and 9, 17, 31 are ≡ 4, 2, 1, so each is off a start and followed by a silence longer than 5 slots: one syncopation each. No reading the reviewer could build (non-cyclic, weighted downbeat, linear ring) gives 5. Builder and reviewer agree; the artifact's own scoring gives 3. Tests pin 3. Told the human; the canon file is not corrected (snapshot).

## M1 canon differences (2026-11-20)
- **17-EDO and 81/80 (canon Canon 2 table; ARC M1 tempering item).** On the patent val ⟨17 27 39], 81/80 is 4·27 − 4·17 − 39 = **+1 step**, not 0. 10/9 and 9/8 still merge on the 17 log ring (positions 2.58 and 2.89 both round to 3), so the table's "Merge" column is right and only its "Why" (81/80 maps to 0 steps) is wrong for 17. Confirmed by builder and reviewer. Tests pin both facts. The canon text is outside this arc's paths: correcting it is the human's call (open question below).
- **Rates reading 259,350** needs 13/6 as written (pulses 114, 133, 150, 247). Octave-reduced to 13/12 the grid is 518,700. Occupied slots: exactly 600 (canon: "about 600").
- **Short names:** the artifact always space-separates gaps; the canon's rule (digits run together when every gap < 10) is used. The long `L·k ⟨…⟩` form keeps spaces.
- **Not fixed (reviewer nits, for later):** `modeTable` drops a mode whose ring exceeds 2^53 (fingerprint then misaligns with `equalPulse`); `quantize` multiplies `slot * N` as Numbers (exact below 2^53); empty slot list gives NaN L; ties-up-only grids also include 40, 44, 45, 47, 49, 52, 60, 68 besides 53 (canon only mentions 53; not wrong).

## C0 scan result (2026-11-20)
- **Other arcs:** affine-focus active, awaiting the human at its M3+M4 checkpoint (owns `src/lib/affine-focus/`, `src/pages/affine-focus/`). harmonic-field-lab: no active arc, all archived; still owns `src/lib/harmonic-field/` and `src/pages/harmonic-field-lab/` (import-only here). stage and structure finished. workbench: Timeline arc drafted, awaiting approval, no locks.
- **Locks:** none active.
- **Decisions that bind this arc:** H-1 (exact pitch, midicents only at an edge), W-1 and W-2 (at a later Workbench handoff only), W-10 and the persistence boundaries (one page key), H-2, H-3, H-4 (mark colors, pin, root chevron), H-25 and H-38 (signed error color), H-13 (type scale; its guard test covers only the lab's CSS), H-18 (`--text-danger`), H-19 (Radix tile roles for heat cells), H-36 (drag and drop only through `components/Sortable`), H-5 and W-40 (two vitest projects, 20 s jsdom timeout), STAGE-3 (no free-floating windows), S-1 to S-8 (workflow).
- **Backlog items to reference later (M9):** `[workbench]` Euclidean rhythm insertion picker (line 61); `[shared]` data drops (a rhythm list as a drop target); `[shared]` non-EDO pitch carrying ratio or monzo; `[harmonic-field-lab]` 3D JI lattice view (overlaps the lattice view; no shared code now); `[shared]` references page (credit Toussaint and other sources).
- **Imports from other paths:** none; nothing imports from this arc's paths.
- **Tests:** library tests are `.test.ts` (Node). Page tests that touch `localStorage` are written as `.test.tsx` (avoids a lock on `vite.config.mjs` `DOM_TESTS`). Keep page renders few.
- **Noted for M9:** `shell/ARCHITECTURE.md:127` says the new-page procedure has not been exercised by a second arc (affine-focus has since done it); the "Who consumes what" row must say pitch is exact ratios as in the lab row.

## Shared touches (locks taken)
- `package.json`: taken 2026-11-20, released 2026-11-20 after commit b393880 (setup only).

## Open questions for human
- D1 step 1: where large result files live (repo under a size cap, or a Cloud Storage bucket). Asked after the inventory.
- (Resolved 2026-11-20) Canon fix for 17-EDO: not corrected; the canon is a snapshot. One-token root marker: decided as part of the names change (ARC.md, M1 checkpoint decisions).

## M1 follow-up: lab comparison (2026-11-20)
The human changed the canon's status (ARC.md, "Approval decisions": compare everything with the Harmonic Field Lab and general UI principles). Comparison of M1 with `src/lib/harmonic-field/`:
- Ratio input: M1 parses through the lab's `parseInterval`: same input rules. Keep.
- Names: changed to the lab's hyphen style with a barline root marker (human's choice; ARC.md M1 checkpoint decisions). `names.ts`, `names.test.ts` (17 tests) and README updated by the orchestrator.
- Ratio text: M1 has its own bigint `ratioStr`; the lab's `fmtRatio` takes a `Note`. Same output for reduced ratios; keep local (bigint), check at M4 that the page shows ratios as the lab does.
- For M5 (Tuning lens): show tempering as the lab shows deviation (signed cents vs EDO targets, `k\m` labels, severity colors via `deviation.ts` `edoTargets`, `fmtSigned`), on top of M1's val math.
- For M2: compare with the lab's `sternBrocot.ts` (Euclid parents), `shape.ts` `intervalSpectrum` (cyclic interval content by step) and `intervalPairs.ts` before writing evenness and ring Z code; reuse by file import where it fits, and bring naming or format differences to the human.

## D1 early work (2026-11-20, human's request during M2)
- VM is now `c4d-highcpu-16` (16 vCPUs, 30 GB, 500 GB Hyperdisk), per the human.
- `zgen.py types` was single-core; at the human's request ("why not just plan to split cores now?") each shape × flip search now runs in its own process with output merged in fixed order (identical to `--workers 1`). Not run here (no Python locally, `HANDOFF.md` rule); the human verifies on the VM by comparing `--workers 1` and the default on the known 8-note shapes (102 types). Finer splitting inside one search (would help `13,2,1`, which has only 2 searches) waits for timings.
- Commands for the 10, 11, 13 and 14-note 5-limit odd ≤ 123 placements and the 7-limit odd ≤ 123 follow-ups were given in chat; results to land in the D1 hub.

## Next action
Human lands `ratio-rhythm-m2` on main (fast-forward; it contains M1). Then D1 step 1 (inventory of VM and local results; storage decision with the human) as the VM results arrive, and M3 (JI level and catalog) after D1, starting with a lab comparison (lattice and JI content against `src/lib/harmonic-field/` and the lab's lattice views).
