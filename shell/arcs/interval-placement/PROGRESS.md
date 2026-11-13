# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Interval Placement: rigorous, register-aware scoring + panel workspace (`arcs/interval-placement`)
- Current milestone: M1
- State: building

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft | ARC written 2026-11-13 from a review of the current page (code read + a probe script of the current scoring and placement) and the human's context on the concept | not run (no `node_modules` in this session) | Human chose: the HFL process (ARC, then a mock reviewed in rounds) and the HFL panel/modular approach. Diagnosis numbers in ARC.md come from the probe. |
| Approval | Human approved 2026-11-13 (three scores; Pareto map, per-interval contributions and must-have/must-not-have constraints wanted; workspace as a generic local copy; dataset download allowed; mock questions wait for the mock). ARC updated. | — | Added: descriptive measures, interval constraints (M2), Pareto map axes. |
| Setup | `check:ip` added under a `package.json` lock (taken and released 2026-11-13); the six pre-existing page files that failed `oxfmt --check` were formatted (formatting only); DECISIONS I-1 registers prefix I. Commit `86a859f`. | `check:ip` GREEN, 7 tests | `corepack` cannot reach repo.yarnpkg.com in this session: run `node .yarn/releases/yarn-4.18.0.cjs run check:ip` from `shell/`. Dependencies installed the same way. |
| C0 | Scan: workbench arc at M7 awaiting the human's combined review; harmonic-field-lab at M6 (Router lock next); `arcs/LOCKS.md` empty. Only `IntervalPlacement.page.tsx` imports the page folder (`src/theme/diagram.ts` mentions it in a comment). BACKLOG `[shared]` non-EDO pitch item fits I-2 (cents + ref Hz). `src/lib/harmonic-field/scorersMore.ts` has `scoreRoughness` (Sethares, `SETHARES` constants) for the M1 cross-check. Reference implementations and CC0 datasets found (see ARC M1 "References found at C0"). | — | Harmonicity in two forms (faithful pitch-class + pitch-space variant); composite weights as the proposed M3 default. Recorded under ARC M1 checkpoint decisions. |

## Shared touches (locks taken)
- None yet.

## Open questions for human
- See ARC.md "Open questions" (approval items first).

## Next action
Brief a builder for M1 (consonance library), then reviewer, then `check:ip`, commit, and M2.
