# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Interval Placement: rigorous, register-aware scoring + panel workspace (`arcs/interval-placement`)
- Current milestone: M2b
- State: awaiting human (M2b checkpoint)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft | ARC written 2026-11-13 from a review of the current page (code read + a probe script of the current scoring and placement) and the human's context on the concept | not run (no `node_modules` in this session) | Human chose: the HFL process (ARC, then a mock reviewed in rounds) and the HFL panel/modular approach. Diagnosis numbers in ARC.md come from the probe. |
| Approval | Human approved 2026-11-13 (three scores; Pareto map, per-interval contributions and must-have/must-not-have constraints wanted; workspace as a generic local copy; dataset download allowed; mock questions wait for the mock). ARC updated. | — | Added: descriptive measures, interval constraints (M2), Pareto map axes. |
| Setup | `check:ip` added under a `package.json` lock (taken and released 2026-11-13); the six pre-existing page files that failed `oxfmt --check` were formatted (formatting only); DECISIONS I-1 registers prefix I. Commit `86a859f`. | `check:ip` GREEN, 7 tests | `corepack` cannot reach repo.yarnpkg.com in this session: run `node .yarn/releases/yarn-4.18.0.cjs run check:ip` from `shell/`. Dependencies installed the same way. |
| C0 | Scan: workbench arc at M7 awaiting the human's combined review; harmonic-field-lab at M6 (Router lock next); `arcs/LOCKS.md` empty. Only `IntervalPlacement.page.tsx` imports the page folder (`src/theme/diagram.ts` mentions it in a comment). BACKLOG `[shared]` non-EDO pitch item fits I-2 (cents + ref Hz). `src/lib/harmonic-field/scorersMore.ts` has `scoreRoughness` (Sethares, `SETHARES` constants) for the M1 cross-check. Reference implementations and CC0 datasets found (see ARC M1 "References found at C0"). | — | Harmonicity in two forms (faithful pitch-class + pitch-space variant); composite weights as the proposed M3 default. Recorded under ARC M1 checkpoint decisions. |
| M1 attempt 1 | Builder: `src/lib/consonance/` (interference H&K + Sethares, periodicity, harmonicity pc + pitch, scoreVoicing, ranking), ported from the MIT R packages with reference-value tests; 132 + 1 expected-fail. Raised: H&K has no 6/5 minimum at the default timbre (model behaviour, R values reproduce); ARC wrongly said Sethares uses ERB; "H&K found best" not in the packages. | `check:ip` GREEN | Reviewer PASS-WITH-FIXES: harmonicity template followed the playback timbre (sine collapsed it to note count, the v2 bug again); −1.62/+1.78 are unstandardised (paper Table 2), not z-score weights; periodicity kept duplicate pitches; dyad semantics under-documented; overstated invariance wording; no option validation; weak tests. Orchestrator read the preprint (DOI 10.1037/rev0000169): H&K is one of the three best-performing models and later interference models did worse. ARC corrected (`d1b4088`, then M1 commit). 6/5 criterion amended (orchestrator, for the human to veto). |
| M1 attempt 2 | All review items fixed: fixed perceptual harmonicity template (11 harmonics, rho 0.75, sigma 6.83) independent of playback timbre with sine/triangle/piano/guitar regression tests; `inconComposite` (faithful raw Table 2 composite, culture omitted) + `EQUAL_WEIGHTS` for z-score ranking; periodicity dedupe; `pairwise` isolated dyads for the Relations view; RangeError validation; explicit H&K 6/5 test; JL12 floors. ARCHITECTURE entry (lock taken and released), DECISIONS I-2, I-3. | `check:ip` GREEN, 144 tests | Validation and comparison tables below. |
| M2 attempt 1 | Builder: `src/lib/interval-placement/` (four engines ported in steps, `placeIntervals`, `placementChunks` iterator with cap, dedupe, constraints, measures, `transpositionScan`); golden test vs the old page engine (all modes, 12/19/31-EDO, several windows, non-default params). Quirks found (README "Quirks"): repulsion is a no-op at default params; odd bias positional in the old page; prefixSlack never reaches the window top; anchors vs endpoints flooring mismatch; every engine can leave the window; silent drops and collision merges; duplicate pitch sets. | `check:ip` GREEN, 293 | Builder decisions: odd bias belongs to the interval by default (`oddBiasSemantics: 'position'` reproduces the old page); window = bottom Hz + width with a step grid; exact handling of non-whole spans. Reviewer PASS-WITH-FIXES: golden drop parity never exercised; wrong docs on which engines leave the window; chunk timer charged consumer time; dedupe kept only the first ordering's essential labelling; ambiguous perms; fractional windows off-grid; inexact ordering totals; missing validation. Reviewer confirmed repulsion no-op: 0 of 864 orderings changed pitch (push distance <= 0.8 steps at kappa 0.4; first effect near kappa 20 for `11 7 16`). |
| M2 attempt 2 | All review items fixed: real drop-parity cases; window containment documented and tested for every engine; chunk timer excludes consumer time; per-ordering records `{order, perm, essentialPairs, endpoints}` with `essentialVaries` (orchestrator decision, revisit at M2b); exact BigInt ordering totals; whole-step window snapping; RangeError validation. | `check:ip` GREEN, 315 | ARCHITECTURE row for `lib/interval-placement` deferred to the Final step (ARC schedules it there). No new DECISIONS row (no new shared contract). Inputs for M2b: the quirk list in `src/lib/interval-placement/README.md`. |
| M2b | Proposal written: `arcs/interval-placement/placement-proposal.md`, numbers from `m2b/demo*.ts`. Findings: engine voicings rank anywhere from top 1 % to bottom 3 % of the 16,218 possible placements of `11 7 16`; window width doubles as spread; register moves only interference (0.536 at C1 to 0.134 at C5), so a free optimiser drifts up and thins out; pc harmonicity barely separates voicings of one set; Pareto front tiny (3) but 122 layers; full search ~4 ms/voicing (68 s for 16k), pc harmonicity cacheable per pc set. Recommendation: A (draggable register) + B (spread and lean replace the engines) as play mode, C (explore all placements, Pareto layers) as a panel, D (essential = contained intervals, optional note sharing) inside C. | — | Awaiting the human's choice (checkpoint). |

## Shared touches (locks taken)
- `package.json`: taken 2026-11-13, released 2026-11-13 after `86a859f` (Setup).
- `ARCHITECTURE.md`: taken 2026-11-13 (M1), released after the M1 commit. DECISIONS I-2, I-3.

## Open questions for human
- See ARC.md "Open questions" (approval items first).

## Next action
Human reads `placement-proposal.md` and answers its section 5; then record the choice under ARC M2b "Checkpoint decisions", update the ARC's Proposed UI and M3-M5 to match, and start M3 (mock).

## M1 tables (2026-11-13)

Validation, Spearman rho (`npx vitest run src/lib/consonance --reporter=verbose`). Bowling = consonance ratings; JL12 = dissonance ratings (signs flip).

```
score                                         Bowling all (298)  dyads (12)  triads (66)  tetrads (220)  JL12 fig 2 (55)  JL12 fig 3 (48)
interference H&K                                         -0.736      -0.928       -0.848         -0.797            0.724            0.378
interference Sethares                                    -0.405      -0.588       -0.649         -0.547            0.433            0.049
periodicity (Stolzenburg)                                -0.608      -0.910       -0.730         -0.645            0.828            0.714
harmonicity pitch-class (har18)                           0.623       0.830        0.656          0.687           -0.603           -0.665
harmonicity pitch (extension)                             0.558       0.634        0.562          0.609           -0.586           -0.752
incon composite (raw H&K + pc harmonicity)                0.728       0.942        0.841          0.825           -0.741           -0.569
```

Comparison (default timbre 11 harmonics 1/n; H&K per unit energy; Sethares summed; periodicity log2, lower simpler; harmonicity KL bits, higher more harmonic; `11 7 16` rows are the current page's placements with the window bottom at C2):

```
chord                                notes      H&K    worst Sethares  period.   hrm pc hrm pitch  ratio chord
M3 on C2                                 2    0.233    0.218    1.066    2.000    1.070     1.760  4:5
M3 on C4                                 2    0.070    0.069    0.324    2.000    1.070     1.760  4:5
M3 on C6                                 2    0.031    0.031    0.166    2.000    1.070     1.760  4:5
P5 on C4                                 2    0.023    0.022    0.160    1.000    1.252     2.099  2:3
m2 on C4                                 2    0.484    0.483    0.591    3.907    0.942     1.590  15:16
M10 on C4 (compound)                     2    0.029    0.028    0.120    1.000    1.070     1.928  2:5
major triad C4                           3    0.120    0.059    0.774    2.000    0.929     1.641  4:5:6
minor triad C4                           3    0.130    0.074    0.792    3.322    0.929     1.635  10:12:15
JI 4:5:6 on C4                           3    0.097    0.048    0.569    2.000    1.003     1.699  4:5:6
major 7th C4 (0 4 7 11)                  4    0.238    0.112    1.353    3.000    0.815     1.557  8:10:12:15
dominant 7th C4 (0 4 7 10)               4    0.221    0.051    1.478    4.430    0.729     1.434  20:25:30:36
cluster 0 1 2 on C4                      3    0.812    0.322    1.587    6.964    0.743     1.302  120:128:135
cluster 0 1 2 3 on C3                    4    1.211    0.245    3.734    7.530    0.605     1.126  120:128:135:144
open C2 G2 E3 (0 7 16)                   3    0.221    0.085    1.583    1.000    0.929     1.793  2:3:5
31-EDO 4:5:6:7 on C3 (0 10 18 25)        4    0.380    0.089    2.475    2.000    0.733     1.428  4:5:6:7
11 7 16 v2 #1 (perm 11,16,7)             6    0.351    0.073    2.953    3.292    0.802     1.762  8:12:15:24:30:36
11 7 16 v2 #2 (perm 16,7,11)             5    0.412    0.095    2.552    3.407    0.712     1.803  10:20:25:30:56
11 7 16 prefixDominance #1               6    0.663    0.084    4.798    5.589    0.661     1.405  120:150:225:320:384:480
```

Notes for M3: H&K is normalised per unit energy, so like the old per-pair mean it can dilute a harsh pair (the faithful model; `worst` and `pairwise` cover it, Sethares is an unnormalised total). The pitch-space harmonicity is our extension and validates slightly below the faithful pc version on Bowling (0.56 vs 0.62) but better on JL12 fig 3 (register-varied four-note chords).
