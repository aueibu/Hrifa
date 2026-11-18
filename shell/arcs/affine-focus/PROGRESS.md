# PROGRESS

## Status
- Arc: affine-focus (`arcs/affine-focus`)
- Current milestone: M3 + M4 checkpoint (awaiting human review at `/affine-focus`)
- State: awaiting human

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup (2026-11-18) | Done | `check:affine-focus` green (0 test files) | `ARC.md` approved with Harmonic Field Lab theming and design decisions (`H-2`–`H-4`, `M8k` type scale, `ChordCard`/`Fold` patterns, `UI-CONVENTIONS.md` stability rules). `check:affine-focus` added to `package.json` under lock, committed (`bbfdf97`), lock released. |
| C0 (2026-11-18) | Done | none needed | Context scan completed (`7e40134`). |
| M1 (2026-11-18) | Done | `check:affine-focus` green (1 file, 15 tests) | Built `src/lib/affine-focus/` (`types.ts`, `tunings.ts`, `transform.ts`, `index.ts`, `transform.test.ts`): 10 built-in tuning presets + custom interval/repeat parser, 4 transform domains (`gamut-steps`, `log-pitch`, `linear-freq`, `subharmonic`), `folded` vs `unfolded` register, `exact` vs `snap-to-gamut` quantization with signed cents error, 5 rule families, and `unordered-set` vs `ordered-tuple` voice tracking. Committed `6abd6c1`. |
| M2 (2026-11-18) | Done | `check:affine-focus` green (2 files, 20 tests) | Built `closure.ts`, `dualFocus.ts`, `trajectory.ts`, and `closure.test.ts`: BFS closure with true saturation vs safety-limit truncation, Tarjan SCC orbit/attractor analysis, shortest transform path finder, dual-focus affine map search (`fix-both`, `swap`, `preserve-axis`) with cycle decomposition, and step-by-step trajectory chaining. Committed `e36d602`. |
| M3 + M4 (2026-11-18) | Done | `check:affine-focus` green (3 files, 23 tests; 0 lint/stylelint/typecheck warnings or errors); `Home.page.test.tsx` green | Built `src/pages/AffineFocus.page.tsx` and `src/pages/affine-focus/` (`AffineFocusApp.tsx`, `state.ts`, `audio.ts`, `export.ts`, `AffineFocus.module.css`, `ARCHITECTURE.md`, `AffineFocus.page.test.tsx`, and components `ControlRail`, `FocusStage`, `MiniRing`, `FamilyTrajectoryView`, `ClosureOrbitView`, `DualFocusMatrixView`, `InspectorRail`), registered `/affine-focus` in `src/Router.tsx` and `src/data/applets.ts`, and documented in `shell/ARCHITECTURE.md`. |
| M3+M4 follow-up: Trajectory Voice Trace (2026-11-18) | Done | `check:affine-focus` green (3 files, 27 tests; 0 lint/stylelint/typecheck warnings or errors) | Added `traceTrajectoryVoices` (`src/lib/affine-focus/trajectory.ts`) with `Follow map` vs `Smoothest` voice connection and `Accumulate` vs `Fold [0, R)` register modes; rendered `TrajectoryTraceStrip` inside the Trajectory Chain box under the step chips with clickable step columns, distinct hue + dash voice channels, focus chevrons, playback column highlight, `(±kR)` octave-drift tags, and `[0, R)` home-repeat shading; wired `Play chain` and step-chip clicks to play in the traced register; added `Voice-Trace Drift Demo (4-Step P→L→P→L)` preset with pre-walked `chainFoci`. |

## Shared touches (locks taken)
- `package.json`: taken 2026-11-18, released 2026-11-18 after setup commit `bbfdf97`.
- `src/pages/AffineFocus.page.tsx`, `src/Router.tsx`, `src/data/applets.ts`, `ARCHITECTURE.md`: taken 2026-11-18, released 2026-11-18 after M3+M4 commit.

## Open questions for human
- Try `/affine-focus` on the dev server (including the Trajectory Voice Trace strip and `Play chain` under `Accumulate` vs `Fold`) and let us know any look, feel, or audio adjustments you want.

## Next action
Await human checkpoint feedback on `/affine-focus`.
