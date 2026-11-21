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

Timing (2026-11-21, this PC, 11 workers): n = 3, max 24, wmax 48, bases C2 and C3, with rounding variants: 65 s,
843,552 placements, 676,945 distinct chords, 371,414 shapes, 178 MB.
n = 4, same settings: 32.5 min (shapes 20 min, roughness 4 min per root, pass 1 1 min, writing and indexes 2.5 min),
19,451,288 placements, 15,521,278 distinct chords, 8,899,469 shapes, 324 pitch-class classes, 4.3 GB; Node needs
`--max-old-space-size` raised (about 4.5 GB resident). Shapes dominate: on the VM (16 cores) they would take about 14 min.

## v2: streaming, resumable, machine-sharing (`build2.ts`, `worker2.ts`)

For the big run (human, 2026-11-21: cardinalities 2–5, sizes 1–17, windows up to 60, every placement stored, roots C2
and C3), on the shared GCP VM. Differences from v1:

- Each worker builds and scores one whole interval set and returns finished rows; memory stays constant whatever the
  size of the run. Scores are stored with each placement (no global chord table), so writes only append.
- Resumable: each set's rows and its `done_sets` mark are committed together; rerun the same command to continue.
- Shares the machine: run under `nice -n 10`; workers follow the load average (`--max-workers` caps them, default
  CPUs − 1); no new set starts while MemAvailable is below `--reserve-gb` (default 6); worker heaps are capped
  (`--worker-heap-mb`, default 768).
- One file per cardinality (`catalog-n<k>.sqlite`); indexes, summaries and a 200-row check against `scoreVoicing` are
  built when a cardinality finishes.
- Same columns as v1's `placement_view`, plus `rough_c3`, `harm_pc`, the rounding twins' notes and scores
  (`down_*`, `up_*`) and the chord structure, all on the placement row. Verified: a killed-and-resumed run equals an
  uninterrupted one exactly; v1 and v2 agree on every placement they share.

VM run (2026-11-21, started 06:55 UTC): `~/ipcat` (Node 24 at `~/ipcat/node`), tmux session `ipcat`, log
`~/ipcat/run.log`, output `~/ipcat/out/`. Command:
`nice -n 10 ./node/bin/node --disable-warning=ExperimentalWarning build2.mjs --n 2,3,4,5 --max 17 --wmax 60 --out out --max-workers 2 --reserve-gb 6`
(2 workers at most, as agreed with the JI Z-relation session that shares the VM).

The VM is a Spot machine; the JI session relaunches it after a preemption. Recovery (2026-11-21):
- `run.sh` is the run command (tmux `ipcat`, window `run`); it writes `out/all-done` on a clean finish.
- `watch.sh` (window `watch`) raises the worker cap to 14 (`out/max-workers`) once no `zgen.py` is left.
- `ensure.sh` starts both unless the run is going or finished; it resets the cap to 2 first. It is in the user's
  crontab as `@reboot sleep 90 && ~/ipcat/ensure.sh >> ~/ipcat/boot.log`, so a relaunched VM resumes on its own.
- `pcwatch.sh` (on the PC, run by Claude in the background) polls the VM status every 3 min, runs `ensure.sh` after a
  relaunch (and every 15 min while up), and exits after handling a relaunch or when the catalog is finished.

Addendum (human, 2026-11-21): sizes 18 and 19 (octave + augmented 4th and perfect 5th) for the same cardinalities and
windows. `--min-largest 18 --max 19` builds only the sets that contain an 18 or 19, into `out19/` (set ids there are
local to the addendum; join with the main catalog on `sets.intervals`). `run19.sh` runs it; `next.sh` (tmux window
`next`) waits for `out/all-done` and starts it through `ensure.sh`, which also picks the right job after a reboot.

Findings page v2: `extract-findings2.mjs <out.json> catalog-n2.sqlite catalog-n3.sqlite ...` then inject the JSON into
`findings-page2.template.html` at `/*DATA*/null`. It adds the rounding twins, the C3 root, Pareto fronts and the
simple-vs-compound comparison. Checked on every pair (n = 2, 3, 4, both rules): a set with every interval +12 in a
window +12 is the simple chord with every top note an octave higher and every bottom unmoved. Mixes (some intervals
compound) mostly change the pitch classes.

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
- Both: each interval's bottom note is the nearest step to (center - size/2). A **tie** (exact half step) rounds
  **toward the middle of the window** (human, 2026-11-21), which makes a reversed ordering the exact mirror image of the
  forward one. The one case no rounding can make symmetric: an interval centred exactly on the window's middle with its
  ends on half steps (it rounds down). Verified on n = 3: every `mirror_ok = 0` row has such a middle tie, and every
  row without one mirrors exactly. With 3 intervals the shared rule always centres the middle interval on the middle,
  so about half its placements hit this case.
- Rounding variants (the human's idea from the JI Z-relation work: round both ways and see what is invariant):
  `chord_down` / `chord_up` are the same placement with every tie rounded down / up; `grid_robust` (in the view) is 1
  when all three are the same chord, i.e. the rule alone decides the chord.

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
  (rule, set, window), 1 = best (roughness lowest, pitch harmonicity highest); `pareto_layer` on those two scores;
  `ties` = intervals whose bottom note was an exact half step; `chord_down`, `chord_up` = the rounding variants.
- `rough_by_base(chord_id, base_midi, rough)`: roughness at every root given with `--bases` (default only 36 = C2;
  `chords.rough`, ranks and layers use the first). A new root only re-scores roughness: harmonicity and periodicity are
  register-free.
- `summary_rounding(rule, window, ...)`: share of placements with a tie, grid-robust, mirror-exact.
- `placement_view`: placements joined with set, ordering and chord (the easy table to query).
- `summary_merges(rule, window, ...)`, `summary_winners(rule, set_id, window, best_rough_orderings)`.

## Chord index: different input sets, same chord (`build-chord-index.mjs`)

The human's "semi-arbitrary type of z relation": two input sets whose placements land on exactly the same notes.
`node build-chord-index.mjs <out.sqlite> catalog-n2.sqlite catalog-n3.sqlite ...` (v2 catalogs, any mix of
cardinalities; n = 2–4 took 4 min and 354 MB) writes:

- `chords(chord_id, notes, shape, note_count, rough, harm_pitch, sets, cards, producers)`: every chord made by two or
  more different sets (`cards` = which cardinalities make it, e.g. `3 4`; `shape` = notes minus the lowest).
- `producers(chord_id, n, intervals, rule, ordering, window)`: every placement that lands on one of those chords.
- `shapes(shape, note_count, sets, cards, chords)`: the same with transpositions counted as one chord.
- `summary(scope, key, chords, multi, max_sets)`: `all`, `shape`, and per `window`.

```sql
-- every set that makes C2 C#2 Bb2 B2 C3
SELECT n, intervals, rule, ordering, window FROM producers JOIN chords USING (chord_id) WHERE notes = '0 1 10 11 12';
```

The findings page finds the same thing for one chord without the index (`MIX.producers` in `../browse/mixview.js`):
equal centers always fill the window (lowest note 0, top note W) and shared center range sits at most ceil(max / 2)
steps in from either edge (checked on the whole catalog), so only a few windows and only the chord's own gaps as
intervals need trying.

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
