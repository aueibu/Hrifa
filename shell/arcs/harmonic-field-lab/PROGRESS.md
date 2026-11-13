# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Dynamic retuner + move into the Hrifa shell + encyclopaedia UI (`arcs/harmonic-field-lab`)
- Current milestone: M4
- State: building (M4 round 2 mock)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft | ARC written 2026-11-12 (Infinitone repo) | prototype GREEN, 221 | Human chose: new card list, all four scorers, mock-first UI. Based on `notes/AUTORETUNER.md`. |
| Approval | ARC approved 2026-11-12 | prototype GREEN, 221 | Default scorer = Sethares roughness; scorer checkpoint dropped; UI milestones approved. |
| Re-plan | Hrifa move added 2026-11-12 | prototype GREEN, 221 | Move to the shell (core to TS, UI rebuilt in React, shell theme), prototype frozen. Ultimate goal: join the Composition Workbench piece by piece. The lab stays a standalone page; the Workbench reuses its core and sections. |
| Setup | Moved into `arcs/harmonic-field-lab/` 2026-11-12 | prototype GREEN, 221; `check:hfl` GREEN (no code yet) | Human: start in Hrifa now; write the retuner once in TS after the core port (old M1 is now M2, old M2 is M1); prototype frozen now. Approved defaults: folder `harmonic-field-lab`, gate `check:hfl`, DECISIONS prefix H, lock on `src/pages/Home.page.test.tsx` for the applet count. Infinitone repo `ARC.md`/`PROGRESS.md` now point here. |
| C0 | Context scan done 2026-11-12 | `check:hfl` GREEN; baseline below | See "C0 scan". |
| M1 | Core ported to TS (`src/lib/harmonic-field/`, 12 modules + barrel + README), page `/harmonic-field-lab` registered (placeholder). 2 builder attempts. | `check:hfl` GREEN, 232 tests (168 vectors + 53 presets + count test + 9 EDO-parse regression + page test); `vite build` PASS | Reviewer attempt 1 FAIL: the EDO-step regex `7
` lost a backslash (spaced forms stopped parsing); fixed, regression test added outside `vectors.json`; a differential harness (1,685 cases vs `hfl_core.js`) found no other difference. Applet status `experimental` (type has no `prototype`). Home test unchanged (counts `applets.length`). H-1 logged. Note: tool pipelines can halve backslashes; check backslash-heavy literals in reviews. |

## C0 scan (2026-11-12)
- **Other arcs:** `workbench` has no active arc (clips and desk arcs archived); `structure` is done. No other active arc owns or locks anything. `arcs/LOCKS.md` was empty.
- **Decisions that bind us:** W-1 (pitch is midicents in packets and the roll: our monzo + cents converts to midicents only at a handoff), W-3 (the roll is fixed at 12-EDO rows: do not reuse PianoRoll for microtonal display without a tunings decision), W-10 (per-viewer prefs outside the workbench prefix; our keys are `hrifa.harmonic-field-lab.*`, page-local, never read another page's keys), S-1..S-8 (workflow).
- **Backlog:** nothing tagged for us. `[shared]` "roll rows are 12-EDO" is relevant only if we ever put lab notes on the roll (not in this arc).
- **Imports / cross-arc APIs:** only `UsernameSeeds.page.tsx` imports from `src/lib/`; `src/lib/harmonic-field/` is new and ours. Scale Explorer imports workbench `audio/*` and `forteCatalog.ts`; we will not import Scale/Raga Explorer code (their 12-EDO set-class tools stay theirs). Reusing workbench `audio/*` (M5) would make us a consumer like Scale Explorer, read-only.
- **Audio engine (for M5):** `AudioEngine` (`composition-workbench/audio/types.ts`) plays whole `PerformancePlan`s of fixed-length events (`pitchMidicents` may be fractional, so any tuning is reachable), `stopSource`/`stopAll`. It has **no open-ended held voices and no glide**. M5's "otherwise stop and ask" will likely trigger: options will be a page-local Web Audio voice module, or a shared-engine extension under a `src/pages/composition-workbench/audio` lock + DECISIONS row.
- **Theme:** `src/theme/THEMING.md` (roles, studio tiers, one accent / many categories via `--mark-<hue>`, divider budget, no decorative shadows, canvas via `markHue`). Applies from M4.
- **Baseline `yarn test` (2026-11-12, run step by step):** typecheck PASS; `format:test` FAIL (19 files, e.g. `src/theme/semantic.ts`, not ours); `lint` FAIL (oxlint `curly` errors in `src/theme/contrast.ts` plus jest warnings in theme/workbench tests, not ours); vitest PASS 107 files / 1680 tests; build PASS. Not ours to fix.

## M3 comparison table (220 Hz, lowest term at 220 Hz; score (rank in column), lower = better; compare ranks, not raw values; roughness and periodicity grow with note count)

| chord | parity | fair | lattice | roughness |
| --- | --- | --- | --- | --- |
| JI fifth 2:3 | 634 (#1) | 206 (#1) | 2.58 (#1) | 1.16 (#1) |
| JI major 4:5:6 | 901 (#3) | 362 (#4) | 3.94 (#3) | 5.66 (#5) |
| 12-EDO major | 2805 (#18) | 2942 (#19) | 4.46 (#5) | 6.24 (#7) |
| JI minor 10:12:15 | 1996 (#11) | 898 (#9) | 3.94 (#3) | 5.74 (#6) |
| 12-EDO minor | 2850 (#19) | 2986 (#20) | 4.46 (#5) | 6.37 (#9) |
| JI harmonic 7th 4:5:6:7 | 771 (#2) | 314 (#2) | 4.52 (#7) | 11.05 (#11) |
| 12-EDO dom7 | 2623 (#16) | 2796 (#18) | 5.24 (#12) | 12.5 (#15) |
| JI septimal minor 6:7:9 | 1360 (#5) | 545 (#5) | 4.65 (#8) | 6.36 (#8) |
| JI tritone 45/32 | 3275 (#21) | 2737 (#16) | 10.49 (#21) | 2.41 (#2) |
| 12-EDO tritone | 3225 (#20) | 3483 (#21) | 6 (#15) | 2.54 (#3) |
| JI 5-limit 9:10:12 | 1489 (#6) | 814 (#7) | 4.99 (#10) | 8.13 (#10) |
| 12-EDO semitone cluster | 2565 (#15) | 2743 (#17) | 5.46 (#13) | 12.48 (#14) |
| JI whole-tone pair 8:9 | 1765 (#9) | 734 (#6) | 6.17 (#17) | 3.66 (#4) |
| WTP Opening 4:6:7:8:9:12 | 907 (#4) | 350 (#3) | 3.88 (#2) | 17.76 (#16) |
| WTP Magic 81:84:108:112:144:162:192:216 | 1918 (#10) | 2063 (#12) | 6.1 (#16) | 49.33 (#21) |
| WTP Romantic 48:54:56:64:72:81:84 | 2032 (#12) | 2130 (#13) | 6.59 (#18) | 48.9 (#20) |
| WTP Gamelan 42:54:64:81 | 2662 (#17) | 2670 (#15) | 8.1 (#20) | 11.91 (#13) |
| WTP Tamiar Dream 14:18:24:27 | 2161 (#13) | 1170 (#11) | 5.55 (#14) | 11.54 (#12) |
| WTP 189/98 Lost Ancestral Lake Region 12:14:18:21:24:27 | 1697 (#7) | 874 (#8) | 4.8 (#9) | 24.57 (#19) |
| WTP The Brook 12:14:16:18:21 | 1709 (#8) | 925 (#10) | 5.07 (#11) | 20.54 (#17) |
| WTP The Pool 128:144:147:192:224 | 2279 (#14) | 2511 (#14) | 7.59 (#19) | 22.9 (#18) |

WTP = La Monte Young, The Well-Tuned Piano, chords from Kyle Gann, *Perspectives of New Music* 31/1 (1993), Examples 10–12.

## Shared touches (locks taken)
- `package.json`: taken 2026-11-12 (Setup, add `check:hfl`), released 2026-11-12 after the setup commit `d1c2abf`.
- M4: `src/Router.tsx` (mock route): taken 2026-11-12, released 2026-11-12 after the M4 commit `5d4e729`.
- M1: `src/pages/HarmonicFieldLab.page.tsx`, `src/Router.tsx`, `src/data/applets.ts`, `src/pages/Home.page.test.tsx`, `ARCHITECTURE.md`: taken 2026-11-12, released 2026-11-12 after the M1 commit `3c50fce` (Home test lock released unused).

## Open questions for human
- Before M7: Manual pivot by degree (Infinitone parity, now the default via `manualDeg`) or by held key? Both work in the engine.
- Per-milestone questions are in ARC.md.

## Next action
M4 round 2: builder rebuilds `src/pages/harmonic-field-lab/mock/` (same route, no Router change) per ARC M4 round 2 decisions; reviewer; `check:hfl`; commit; human checkpoint.
