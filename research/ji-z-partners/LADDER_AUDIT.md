# Ladder audit (2026-11-26, read-only; nothing was run beyond counting rows)

Data: the explorer data rebuilt 2026-11-26 (`explorer_all.json`, 909,952 rows: 245,707 proven, 19,330 exact from the patterns, 644,915 ladder-only). Counts by `ladder_audit.py` (output `ladder_audit.out.txt`). Rung status is from PROGRESS entries dated 2026-11-23 and was **not rechecked on the VM**.

## 1. What the ladder rows are

- **All ladder-only rows have 9 or more notes.** None has 6, 7 or 8 notes: those sizes are fully covered by the proven lists and the pattern (exact) rows, so the 8-note exact build removes **no** ladder rows. (An earlier chat answer implied it would; that was wrong.)
- By note count: 15 notes 362,986; 12 notes 177,922; 16 notes 65,882; 9 notes 37,545; 14 notes 422; 10 notes 158. So 12, 15 and 16 notes are 94% of the ladder rows, 9 notes 6%.
- By highest prime (rows, q range): 7: 369,267 (q 343 to 729); 11: 212,220 (q 147 to 405); 13: 24,796 (q 143 to 405); 17: 24,226 (q 147 to 405); 19: 14,406 (q 245 to 405). 5-limit has none (proven to q 3,645 for 6 to 16 notes).
- 9-note rows come from three 7-to-9-note runs (13-limit, 17-limit, 19-limit at q <= 405): 13,046, 10,093 and 14,406 rows.

## 2. Why they are lower bounds, rung by rung

The ladder tries a fixed list of factor shapes with few negative terms. It misses families the recipe does not cover, and a budget stop can hide some. S' (the shape recipe) is known to fail at high q: at 5-limit q 2,025 to 2,187 it missed 6 families because the second factor needs three -1 terms and the recipe allows two.

| Rung (run) | Rows (ladder-only) | Status per the 2026-11-23 notes |
| --- | --- | --- |
| 7-limit q 729 (`l7q729_on`) | most of the 369,267 | no-budget pass and widened steps done (widened added 4,435); chord-sum cross-check complete; fully checked only to q 405 |
| 11-limit q 405 (`l11q405_on`) | most of the 212,220 | widened 3,1 no budget (+6); widened 3,0 capped with 3,888 stopped; the chord-sum cross-check found one 9-note family (q 385) the ladder missed |
| 13-limit q 243 (`l13q243_on`) | 24,796 with 13q405 | the 5,1 / 5,2 step was still open; chord sums complete |
| 17-limit q 243 (`l17q243_on`) | 24,226 with 17q405 | 11,562 widened factors still stopped; chord sums complete |
| 13/17/19-limit q 405, 7 to 9 notes (`k789L_*`) | 13,046 / 10,093 / 14,406 (9 notes) | lower bounds; 19-limit is proven only to q 135 |

## 3. Ways to improve the picture, cheapest first

1. **Cross-check every rung against the constructive generators** (`chordgen.py`, `holegen.py`, the merge step with zprod-rs `--shapes 3,1 4,1 4,2`, and the residue shapes). Together they reproduced 100% of the seven 7-to-19-limit proven lists and 5-limit q <= 729 (99.9% at the highest 5-limit rungs). Any family they build that the ladder lacks is a new row, and they cost minutes per rung (19-limit q 135: 82 s for chord sums). Expected gain: a few rows per rung (the one found so far was 1 at 11-limit q 405), but each is an exact construction.
2. **Finish the stopped steps** on 13q243 (5,1/5,2), 17q243 (11,562 stopped factors) and 11q405 (3,888 stopped 3,0 factors) with `--max-nodes 0` (`rs_nobudget.sh`). Earlier reruns of this kind added 0 to 8 families per rung, about 1 s per step. Makes those rungs complete for the recipe.
3. **Higher q for 12, 15 and 16 notes.** These sizes are products, so a generator at higher q is cheaper than the ladder (chord sums were 85% to 99.5% of every proven list). Cost grows steeply (11-limit factor count: 4,500 at q 33 to 1.3 million at q 135, about 3.5x per step), so only after steps 1 and 2.
4. **9 notes and up as exact lists** would need universal types for k >= 9, which a plain search cannot reach (k 8 took 12.2 G nodes; k 9 would be about 390 times that). The min-dim 3 test (VM, tmux `k8d3`) measures one possible shortcut.

What the explorer shows for 12, 15, 16 notes stops at q 243 to 729, while 6 and 7 notes are exact to q 531,441. Steps 1 and 2 improve the rows that exist; only step 3 extends the range.

## 4. Not checked

- Whether the VM still holds the 2026-11-23 rung folders and logs (`~/zruns/zprod/l<L>q<Q>_on`, `overnight.out`).
- Whether any rung was widened or no-budget-rerun after 2026-11-23 (the PROGRESS table stops there).
