# PROGRESS

## Status
- Arc: affine-focus (`arcs/affine-focus`)
- Current milestone: M2 (Closure, Orbit (SCC), Dual-Focus Solver & Trajectory Engine)
- State: building

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup (2026-11-18) | Done | `check:affine-focus` green (0 test files) | `ARC.md` approved with Harmonic Field Lab theming and design decisions (`H-2`–`H-4`, `M8k` type scale, `ChordCard`/`Fold` patterns, `UI-CONVENTIONS.md` stability rules). `check:affine-focus` added to `package.json` under lock, committed (`bbfdf97`), lock released. |
| C0 (2026-11-18) | Done | none needed | Context scan completed (`7e40134`). |
| M1 (2026-11-18) | Done | `check:affine-focus` green (1 file, 15 tests) | Built `src/lib/affine-focus/` (`types.ts`, `tunings.ts`, `transform.ts`, `index.ts`, `transform.test.ts`): 10 built-in tuning presets + custom interval/repeat parser, 4 transform domains (`gamut-steps`, `log-pitch`, `linear-freq`, `subharmonic`), `folded` vs `unfolded` register, `exact` vs `snap-to-gamut` quantization with signed cents error, 5 rule families (`single-focus`, `dual-focus`, `perspective`, `bilateral`, `multi-multiplier`), and `unordered-set` vs `ordered-tuple` voice tracking. Verified against all rows of Scenario Tables A and B. |

## Shared touches (locks taken)
- `package.json`: taken 2026-11-18, released 2026-11-18 after setup commit `bbfdf97`.

## Open questions for human
- None until M3 checkpoint.

## Next action
Build M2 (`src/lib/affine-focus/closure.ts`, `dualFocus.ts`, `trajectory.ts`, `closure.test.ts`), verify `check:affine-focus`, and commit M2.
