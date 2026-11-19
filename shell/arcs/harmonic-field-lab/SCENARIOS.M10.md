# SCENARIOS M10: JI reach report ("which just intervals can this scale play, and how well, by prime")

CONFIRMED 2026-11-18 (human: P1 "if by mode stepper you mean the selected mode in the modes panel then yes" (it is: both set the lab's one mode, `mode/set` / `mode/step`); "All others sound good to me"; then "if there are multiple intervals that give a target ratio - we should show each of them?" -> R14). Reframed from Scala `EQUALTEMP/DATA` (ARC.md M10). Human picks: **both columns** (any two notes AND from the root), **limit selector 5 / 7 / 9 / 11 / 13 / 15, default 7**, **a tolerance box** ("within ___ c", saved, default 15), **the selected subset**.

Targets: the odd-limit diamond of the chosen limit, octave-reduced, 1/1 excluded (5-limit 6 targets, 7-limit 12, 13-limit 40). Error = best interval minus target, signed, in cents, colored with the lab's signed error scale (H-38: sharp orange, flat cyan).

## Columns per target
| # | Case | Any two notes | From the root |
| - | ---- | ------------- | ------------- |
| R1 | Harmonics 8-15 (all 8 notes), 7/6 | 0.0 c (14:12) | -63.0 c (nearest note above 1/1) |
| R2 | Harmonics 8-15, 7-limit summary | 12 of 12 within 15 c | 3 of 12 within 15 c |
| R3 | Subset {8, 10, 12, 14} = 1/1 5/4 3/2 7/4, 7-limit | 12 of 12 exact (5/4 3/2 7/4 6/5 7/5 7/6 and their inversions) | 3 of 12 (5/4 3/2 7/4) |
| R4 | 12-EDO and 31-EDO | equal to From the root (every interval occurs from every note) | same |
| R5 | A subset of one note | nothing reachable; rows show "-" | same |

## Per-prime summary (the "by prime" answer)
One line per prime limit up to the chosen limit: cumulative Fokker misfit (sum of squared errors of 3/2, then + 5/4, 7/4, 11/8, 13/8; the pair column), count within tolerance, worst target and its error.

| # | Field | 3/2 | 5/4 | 7/4 | 11/8 | 13/8 | Misfit 3 / 5 / 7 / 11 / 13 |
| - | ----- | --- | --- | --- | ---- | ---- | --------------------------- |
| R6 | 12-EDO | -2.0 | +13.7 | +31.2 | +48.7 | -40.5 | 3.8 / 191.1 / 1163.0 / 3532.9 / 5175.4 |
| R7 | 31-EDO | -5.2 | +0.8 | -1.1 | -9.4 | +11.1 | 26.8 / 27.5 / 28.6 / 116.7 / 239.5 |
| R8 | Harmonics 8-15 | 0 | 0 | 0 | 0 | 0 | 0 at every limit |

| # | Field, limit | Within 5 c | Within 15 c | Average abs error | Worst |
| - | ------------ | ---------- | ----------- | ----------------- | ----- |
| R9 | 12-EDO, 5 | 2 of 6 | 4 of 6 | 10.4 | 6/5, 15.6 |
| R10 | 12-EDO, 7 | 2 of 12 | 4 of 12 | 18.8 | 12/7, 33.1 |
| R11 | 12-EDO, 13 | 4 of 40 | 8 of 40 | 28.4 | 12/11, 49.4 |
| R12 | 31-EDO, 7 | 8 of 12 | 12 of 12 | 3.2 | 6/5, 6.0 |
| R13 | 31-EDO, 13 | 12 of 40 | 34 of 40 | 8.4 | 13/11, 18.2 |

## Proposals to confirm
| # | Proposal |
| - | -------- |
| P1 | "The root" = the current mode root (the mode stepper's note), so From the root follows the mode; with mode 1 it is 1/1. |
| P2 | Lives as a new Visualizer view "JI reach" (pick it in any of the five visualizer slots, like EDO fit). Top: limit selector, tolerance box, the per-prime summary lines; below: the target table (target ratio, cents, Any two notes error + which two notes, From the root error + which note), sorted by cents. |
| P3 | Hovering a target row highlights the two notes that play it on the main ring; holding 1 sounds the target's best pair. |
| P4 | Settings saved in `settings.v1` (limit, tolerance; a new H- row); absent or damaged = 7 / 15 c. |

## Every occurrence (human, 2026-11-18)
| # | Case | Result |
| - | ---- | ------ |
| R14 | A target played by several pairs | The row shows the best error and a count of the pairs within tolerance ("3/2 · 0.0 c · ×3"). Clicking the row unfolds every pair within tolerance, sorted by size of error, then by lower note's pitch; a pair past the octave shows the wrap arrow as in Pairs. Hover a pair: its two notes light on the main ring; hold 1 plays that pair. No pair within tolerance: the row shows the best pair only, and the count "×0". Harmonics 8-15: 3/2 = 8->12, 10->15, 12->9 (wrap); 5/4 = 8->10, 12->15; 6/5 = 10->12, 15->9 (wrap); 7/6 = 12->14. 12-EDO: every target x12. |
| R15 | From the root column | One note at most (the note nearest the target above the mode root); no count. |

## M10 look 1 (human, 2026-11-18): "looking really good", plus
| # | Case | Result |
| - | ---- | ------ |
| R16 | Expand all / Collapse all | One button pair (or a toggle) above the target table unfolds or folds every target row. Runtime only. |
| R17 | Holds on a hovered row or pair (human: "4/5 made sense because that is how they work elsewhere - field available vs target ratio"; follows the chord library rows, M7e `variantCents`) | 1 = the scale's pair (as now). 4 = the scale's pair (the field's notes). 5 = the PURE pair: the lower note plus the exact target ratio. 12-EDO, target 5/4, pair C->E: 1 and 4 play 0 and 400 c, 5 plays 0 and 386.3 c. A row's hover uses its best pair. Played at the pair's own notes, never at another root. |
| R18 | Anchor of the pure pair (human: "what do you think? ... a nuanced per scale issue") | The LOWER note of the pair (the lab's convention: intervals are added above a note; Pairs and Beats measure the upper against the lower). A wrapped pair: the lower note is the "from" note, the target goes above it. The help text says so. |

## M10 look 2 (human, 2026-11-18): "looks good to me", one change
| # | Case | Result |
| - | ---- | ------ |
| R19 | A target row that unfolds | A fold chevron right of its ratio (the lab's `Fold` chevron: right when folded, down when open, muted). Rows with nothing to unfold (no pair at all) show none. |
| R20 | A target with exactly one entry (one pair within tolerance, or ×0 showing only the best pair) (human: "just like the chord library - if a row only has one entry it should just be itself - it shouldn't unfold") | No chevron, no unfold, Expand all skips it; the row IS that pair (hover lights it and sets holds 1/4/5, click or Enter plays it). Harmonics 8-15: 7/6 (12->14 only) is a plain row; 3/2 (three pairs) unfolds. Supersedes R19's "every row that unfolds" for one-entry rows. |
