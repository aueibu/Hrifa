# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Dynamic retuner + move into the Hrifa shell + encyclopaedia UI (`arcs/harmonic-field-lab`)
- Current milestone: M2
- State: not started

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

## Shared touches (locks taken)
- `package.json`: taken 2026-11-12 (Setup, add `check:hfl`), released 2026-11-12 after the setup commit `d1c2abf`.
- M1: `src/pages/HarmonicFieldLab.page.tsx`, `src/Router.tsx`, `src/data/applets.ts`, `src/pages/Home.page.test.tsx`, `ARCHITECTURE.md`: taken 2026-11-12, released 2026-11-12 after the M1 commit (Home test lock released unused).

## Open questions for human
- None now (per-milestone questions are in ARC.md).

## Next action
M2: brief a `builder` for the retuner engine + Infinitone-parity scorer in `src/lib/harmonic-field/` (owned paths only, no locks needed), then reviewer, `check:hfl`, commit.
