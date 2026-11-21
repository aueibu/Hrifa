# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: ratio-rhythm (`arcs/ratio-rhythm`)
- Current milestone: M2 (M1 done)
- State: not started

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft | `ARC.md` drafted 2026-11-20; artifact snapshot saved to `reference/ratio-rhythm-lab.html` (version 1795220968-b833) | none | |
| Approval | approved 2026-11-20 | none | harmonic lab style; "Ratio Rhythm Lab" at `/ratio-rhythm`; `zgen.py` canonical, converter allowed; D1 (data hub and VM runs) added before M3. See `ARC.md`, "Approval decisions". |
| Setup | `check:ratio-rhythm` added under a `package.json` lock (rebased onto main as 49802cc, lock released 56a2fd0; landed on main at 7265093) | green 2026-11-20 on main (Node 24.18.1, 6 workers, 5 s, no tests yet) | |
| C0 | done 2026-11-20 | none | Scan result below. ARC.md corrected: type sizes copied under page-prefixed names (`--rrl-fs-*`) on `:root`, signed error color H-25/H-38, `--text-danger` for parse errors, exact harmonic-field imports, time rule, finder deadline injection, `ji_zsets.py` path. RATIORHYTHM-1 added (registers prefix RATIORHYTHM, renamed from RR, then RATRHY; rule 16 as reworded on main 2026-11-20: the arc folder name in capitals with the hyphens dropped). |
| M1 | done 2026-11-20 on branch `ratio-rhythm-m1` (worktree; this background session could not edit the main checkout). Builder (general-purpose on sonnet with `builder.md`: the `builder` type is not registered when a session starts at the repo root), reviewer (opus with `reviewer.md`): pass, nothing blocking. Orchestrator applied the 3 should-fix items: one-token parse of `⟨1 \| 12⟩` (k = 2), `commonGrid` returns bigint and `equalCycles` returns null past 2^53, `ratesGrid` occupied count by inclusion-exclusion (exactly 600) instead of enumerating. | `check:ratio-rhythm` green 2026-11-20 (Node 24.18.1, 6 workers): 5 files, 64 tests; 3 lint warnings (`valid-expect`, message argument) | Canon differences below. Decisions: steps are signed (81/80 is +1 where it stays open); one-token barline is spaced (`⟨1 9 18 36 \| 8⟩`) when gaps are spaced, none when the root's gap is first (rootAt 0); `parseRatios(text, { reduce: false })` for the rates reading; equal-pulse onsets double harmonics below the root. |

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
- Canon fix for 17-EDO: change the Canon 2 table's "Why" for 17 (merge by rounding on the log ring; 81/80 is +1 on the patent val), or drop 17 from the row? Not blocking.
- One-token form when the root's gap comes first: no barline (`⟨113334⟩`, current) or a leading barline (`⟨|113334⟩`, the canon read literally)? Not blocking.

## Next action
Land branch `ratio-rhythm-m1` on main (fast-forward), then start M2 (evenness, grouping, meter, perception, ring Z-relations, finder) with a fresh builder.
