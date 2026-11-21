# Interval Placement catalog (M2c data study)

Every multiset of `n` essential intervals (sizes 1..`max` steps of 12-EDO), every distinct ordering, every window size
from the largest interval up to `wmax`, under both spacing rules, built, measured and scored, in one SQLite file.
Databases live outside the repo in `_Ideas/interval-placement-catalog/` (they are large); this folder holds the code.

## Build

From `shell/` (Node 24, which has `node:sqlite` built in):

```
npx esbuild arcs/interval-placement/m2c/catalog/build.ts arcs/interval-placement/m2c/catalog/worker.ts --bundle --platform=node --format=esm --outdir=<dir> --out-extension:.js=.mjs
node --disable-warning=ExperimentalWarning <dir>/build.mjs --n 3 --max 24 --wmax 48 --out ../_Ideas/interval-placement-catalog/catalog-n3.sqlite
```

Options: `--n` intervals per set, `--max` largest interval size, `--wmax` largest window (<= 52), `--base` bottom note as
MIDI (default 36 = C2; only roughness depends on it), `--workers` (default: logical CPUs - 1), `--verify` how many chords
to re-score with `scoreVoicing` as a check (the build stops if any differs by more than 1e-6).

Timing (2026-11-21, this PC, 11 workers): n = 3, max 24, wmax 48: 49 s, 843,552 placements, 472,799 distinct chords, 122 MB.

## How it is fast

1. One pass builds every placement into typed-array columns and collects distinct chords keyed by a 49-bit note mask.
2. Scores are split by what they depend on and each distinct key is scored once, in worker threads: roughness per
   distinct absolute chord; pitch-space harmonicity and periodicity per distinct shape (both transposition-invariant on
   the step grid); pitch-class harmonicity per pitch-class set up to rotation (at most 352).
3. Ranks and Pareto layers per group are computed in memory; rows go to SQLite in one transaction.

## Rules (as in the catalog page)

- `equal`: interval centers equally spaced, as far apart as the window allows; every chord fills its window.
- `shared`: one center range for every interval, [largest/2, window - largest/2], centers equally spaced across it;
  every ordering uses the same center positions.
- Both: each interval's bottom note is the nearest step to (center - size/2), **halves round down**. Known effect: when
  an odd interval's center falls on a whole step, its bottom note is a half step off and rounds down, so the reversed
  ordering is not always the exact mirror image (`mirror_ok = 0`).

## Schema

- `meta(key, value)`: build parameters and definitions.
- `sets(set_id, n, intervals, largest)`: one row per multiset, intervals ascending (`'7 11 16'`).
- `orderings(set_id, ord, ordering)`: the distinct orderings of each set.
- `chords(chord_id, mask, notes, note_count, lowest, highest, span, pc_mask, pc_count, centroid, gap_min, gap_max,
  gaps_octave, distinct_intervals, rough, harm_pitch, harm_pc, periodicity)`: one row per distinct note set; `notes` are
  steps above the base note; `pc_mask` bit p = pitch class p (C = 0); scores as in `meta`.
- `placements(rule, set_id, ord, window, chord_id, merges, merge_stack, merge_bottom, merge_top, round_max, round_mean,
  band, essential_extra, mirror_ok, rank_rough, rank_harm, pareto_layer)`: one row per rule, set, ordering and window.
  `merges` = interval ends that landed on an existing note (2n - note_count); `merge_stack` / `merge_bottom` /
  `merge_top` = coinciding end pairs that are top-on-bottom (stacking), two bottoms, two tops (nesting); `round_max`,
  `round_mean` = how far bottom notes moved to the grid (steps); `band` = highest minus lowest center;
  `essential_extra` = extra occurrences of an essential size among all note pairs; ranks are dense within
  (rule, set, window), 1 = best (roughness lowest, pitch harmonicity highest); `pareto_layer` on those two scores.
- `placement_view`: placements joined with set, ordering and chord (the easy table to query).
- `summary_merges(rule, window, ...)`, `summary_winners(rule, set_id, window, best_rough_orderings)`.

## Example queries

```sql
-- one set in one window, both rules, best first
SELECT rule, ordering, notes, merges, round(rough,3) rough, round(harm_pitch,3) harm, pareto_layer
FROM placement_view WHERE "set" = '7 11 16' AND window = 24 ORDER BY rule, rough;

-- merge rate as the window grows
SELECT rule, window, share_with_merge, avg_merges FROM summary_merges ORDER BY rule, window;

-- how often each rule's smoothest ordering is the same
SELECT AVG(a.best_rough_orderings = b.best_rough_orderings) FROM summary_winners a JOIN summary_winners b
  ON a.set_id = b.set_id AND a.window = b.window AND a.rule = 'equal' AND b.rule = 'shared';
```
