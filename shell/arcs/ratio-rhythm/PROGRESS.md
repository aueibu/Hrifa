# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: ratio-rhythm (`arcs/ratio-rhythm`)
- Current milestone: M1 (C0 done)
- State: not started

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft | `ARC.md` drafted 2026-11-20; artifact snapshot saved to `reference/ratio-rhythm-lab.html` (version 1795220968-b833) | none | |
| Approval | approved 2026-11-20 | none | harmonic lab style; "Ratio Rhythm Lab" at `/ratio-rhythm`; `zgen.py` canonical, converter allowed; D1 (data hub and VM runs) added before M3. See `ARC.md`, "Approval decisions". |
| Setup | `check:ratio-rhythm` added under a `package.json` lock (rebased onto main as 49802cc, lock released 56a2fd0; landed on main at 7265093) | green 2026-11-20 on main (Node 24.18.1, 6 workers, 5 s, no tests yet) | |
| C0 | done 2026-11-20 | none | Scan result below. ARC.md corrected: type sizes copied under page-prefixed names (`--rrl-fs-*`) on `:root`, signed error color H-25/H-38, `--text-danger` for parse errors, exact harmonic-field imports, time rule, finder deadline injection, `ji_zsets.py` path. RATIORHYTHM-1 added (registers prefix RATIORHYTHM, renamed from RR, then RATRHY; rule 16 as reworded on main 2026-11-20: the arc folder name in capitals with the hyphens dropped). |

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

## Next action
Start M1 (library: rings, tuning, modes, names) with a fresh builder, briefed with the M1 acceptance list and the canon's worked numbers.
