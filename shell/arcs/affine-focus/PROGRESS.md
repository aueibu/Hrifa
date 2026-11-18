# PROGRESS

## Status
- Arc: affine-focus (`arcs/affine-focus`)
- Current milestone: M3 & M4 (Page registration, Harmonic Field Lab-styled workspace, geometry stage, trajectory/closure/dual-focus views, arithmetic inspector & polyphonic audio)
- State: building

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup (2026-11-18) | Done | `check:affine-focus` green (0 test files) | `ARC.md` approved with Harmonic Field Lab theming and design decisions (`H-2`–`H-4`, `M8k` type scale, `ChordCard`/`Fold` patterns, `UI-CONVENTIONS.md` stability rules). `check:affine-focus` added to `package.json` under lock, committed (`bbfdf97`), lock released. |
| C0 (2026-11-18) | Done | none needed | Context scan completed (`7e40134`). |
| M1 (2026-11-18) | Done | `check:affine-focus` green (1 file, 15 tests) | Built `src/lib/affine-focus/` (`types.ts`, `tunings.ts`, `transform.ts`, `index.ts`, `transform.test.ts`): 10 built-in tuning presets + custom interval/repeat parser, 4 transform domains (`gamut-steps`, `log-pitch`, `linear-freq`, `subharmonic`), `folded` vs `unfolded` register, `exact` vs `snap-to-gamut` quantization with signed cents error, 5 rule families, and `unordered-set` vs `ordered-tuple` voice tracking. Committed `6abd6c1`. |
| M2 (2026-11-18) | Done | `check:affine-focus` green (2 files, 20 tests) | Built `closure.ts`, `dualFocus.ts`, `trajectory.ts`, and `closure.test.ts`: BFS closure with true saturation vs safety-limit truncation, Tarjan SCC orbit/attractor analysis, shortest transform path finder, dual-focus affine map search (`fix-both`, `swap`, `preserve-axis`) with cycle decomposition, and step-by-step trajectory chaining. |

## Shared touches (locks taken)
- `package.json`: taken 2026-11-18, released 2026-11-18 after setup commit `bbfdf97`.

## Open questions for human
- None until checkpoint.

## Next action
Take page registration locks (`src/pages/AffineFocus.page.tsx`, `src/Router.tsx`, `src/data/applets.ts`), build the complete Harmonic Field Lab-styled page (`src/pages/affine-focus/`), run `check:affine-focus`, commit, release locks, and present to human.
