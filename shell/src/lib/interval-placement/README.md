# interval-placement

Pure TypeScript placement engine (no React, no DOM, no fs, no Worker code). You name a few **essential intervals**; the
library places them as spans inside a **window** (an absolute bottom pitch plus a width) in every distinct ordering,
and reports for each result which pairs of notes are the essential spans and which are **induced** (the rest of the
chord's intervals). Scoring lives in `../consonance`; a placed voicing is that library's `Voicing` (`{refHz, cents[]}`,
decision I-2), so `scoreVoicing(voicing)` works on it directly.

Status: milestone M2 **ports and verifies**. The four engines are the old page's, carried over unchanged (see
"Golden test"); the placement controls are redesigned in M2b, and the engines may be replaced then. No gravity control.

## API

```ts
import { placeIntervals, placementChunks, placeOrdering, dedupe, transpositionScan, stepsToCents } from './index';

const result = placeIntervals({
  intervals: [{ cents: 1100 }, { cents: 700, oddBias: 'up' }, { cents: 1600, essential: true }],
  window: { bottomHz: 65.406, widthSteps: 36 }, // or widthCents
  distribution: 'prefixSlack', // 'uniform' | 'prefixSlack' | 'prefixDominance' | 'repulsion'
  stepCents: 100, // the grid the engines quantise on: 1200 / edo
  params: { anchorAlpha: 0.3 }, // overrides of DEFAULT_ENGINE_PARAMS
  constraints: { mustHave: [{ cents: 700, octaveEquivalent: true }], mustNotHave: [{ cents: 100, toleranceCents: 1 }] },
  cap: 5040, // orderings to process (default DEFAULT_ORDERING_CAP; Infinity = no cap)
  oddBiasSemantics: 'interval', // or 'position' (old page behaviour)
});
// result = { voicings, orderings: {total, processed, remaining}, skipped, filtered: {mustNotHave, mustHave, total} }
```

- Specs are validated (`RangeError`): finite positive sizes and window, finite engine params, finite constraint cents,
  tolerance >= 0, known `distribution`. A window width that is not a whole number of steps is snapped down to whole steps
  when every span is whole (2450 c in 12-EDO is 24 steps); with a non-whole span it is used exactly.
- Pitches are **cents**. EDO steps are an input convenience: `stepsToCents(steps, edo) = steps * 1200 / edo`. A voicing's
  `cents` are measured from the window bottom, `refHz = window.bottomHz`, so `cents` start at or above 0.
- `PlacedVoicing` = `Voicing` plus: `id` (the pitch set), `cents` (sorted, no repeats), `essentialPairs` / `inducedPairs`
  (`{low, high, cents}` with note indices; essential ones also carry `span`), `collisions`, `perm` / `order` (the first
  ordering: interval sizes, and indices into `spec.intervals`, in span order), `perms` (every ordering that gave this
  pitch set, as `{order, perm, essentialPairs, endpoints}`, the first one first), `essentialVaries`, `endpoints`
  (`[low, high]` per span of the first ordering), `measures`, `meta`. The top-level `essentialPairs`, `inducedPairs`,
  `collisions` and `endpoints` describe the **first** ordering; `essentialVaries` is true when the other orderings in
  `perms` disagree about which pairs are essential (same notes, different spans), so read `perms[i].essentialPairs`
  then.
- `placementChunks(spec, {chunkMs = 16, now})` is a generator a worker drives: each `next()` does at most `chunkMs` of work
  (the check runs after each ordering, so a chunk overshoots by at most one ordering's work; the clock restarts when the
  consumer pulls again, so time spent between pulls is not charged to the next chunk) and yields
  `{voicings, extraOrderings, orderings, skipped, filtered, elapsedMs, done}`. `voicings` are new pitch sets that pass
  the constraints; `extraOrderings` are later orderings that reproduced an earlier voicing (`{id, ordering}`; add with
  `appendOrdering(voicing, ordering)`); counters are cumulative. `placeIntervals` is this iterator run to the end.
- `dedupe(voicings)` merges equal pitch sets and lists every ordering (distinct orderings are never collapsed; only the same ordering appearing twice is listed once; inputs are not mutated). `placeOrdering(spec, order)` places one ordering
  (`order` = indices into `spec.intervals`) without dedupe or constraints; it returns `null` when the engine cannot fit it.
- `transpositionScan(voicing, {fromCents, toCents, stepCents}, {score?})` returns `[{shiftCents, voicing, scores?}]`: the
  voicing moved up by each shift (`refHz * 2^(shift/1200)`, `cents` unchanged), optionally scored with `scoreVoicing`
  (`score: true`, or `ScoreOptions`). This is the register scan (the M3-low-vs-high curve).
- Bad specs throw `RangeError`.

### Orderings, dedupe, cap

Every distinct ordering of the interval list is an arrangement of the spans along the window (repeated sizes are not
counted twice: `[4,4,3]` has 3). Orderings are enumerated lazily in ascending lexicographic order of size (as the old
page did), so 8 intervals (40,320) never get materialised. The cap counts **orderings looked at**; with 8 intervals and
the default cap the first 5,040 are processed and `orderings.remaining` is 35,280. Voicings are identified by their
pitch set (1e-6 cent resolution); orderings with the same pitch set give one voicing listing all of them in `perms`.
An ordering the engine cannot place (spans do not fit) is counted in `skipped`, never dropped silently. The ordering count is
computed exactly (`countOrderings`, a product of binomials in BigInt): `total` is a number, `totalExact` is false beyond
2^53 and `totalText` is always the exact decimal (25 distinct intervals: 15511210043330985984000000). In `'interval'` mode
intervals with the same size, bias and essential flag are interchangeable; differing bias or flag makes them distinct
orderings (told apart by `order`).

Dedupe key = pitch set. Orderings with the same pitch set but different essential spans share one voicing (an
orchestrator decision the human may revisit at M2b); the per-ordering essential pairs and endpoints are kept in `perms`.
In `'position'` mode, intervals of equal size are interchangeable and the k-th span of a size takes the `essential` flag of
the k-th such interval in `spec.intervals` (lowest index first).

### Collisions

Two span endpoints that land on the same pitch become one note (the scorers need distinct pitches) but are reported in
`collisions` (`{note, cents, sources: [{span, end}]}`) and counted in `measures.collisions`; the number of notes plus the
extra endpoints in the collisions equals twice the number of spans. A span whose two ends coincide is not possible
(spans are > 0).

### Essential vs induced

Each span's two notes form an **essential pair** (unless the interval has `essential: false`: it is still placed but its
pair is reported as induced). Every other pair of notes is an **induced pair**.

### Constraints

`mustHave` / `mustNotHave` are lists of `{cents, octaveEquivalent?, toleranceCents?}`. A voicing **contains** an interval
when any pair of its notes (essential or induced) has that size within the tolerance (default 1e-6 cents);
`octaveEquivalent` compares sizes modulo 1200 (a major 10th counts as a 3rd; 1200 matches any octave multiple). A voicing
is dropped when it contains any `mustNotHave` interval (checked first) or lacks any `mustHave` interval. Constraints apply
after dedupe, so `filtered.mustNotHave` / `filtered.mustHave` count **voicings**, and `voicings.length + filtered.total`
is the unfiltered voicing count. A constraint that removes everything returns an empty list (no error).

### Descriptive measures (`voicing.measures`)

`spanCents`, `noteCount`, `centroidCents` / `centroidHz` (register centroid = mean log-frequency, i.e. the mean of
`cents`, and the geometric mean in Hz), `lowestCents` / `lowestHz`, `distinctInduced` (distinct sizes among induced
pairs), `collisions`. Exact facts, never mixed into the consonance scores.

## The ported engines

All four work in grid steps (`cents / stepCents`) exactly like the old page (the lib converts at the edges), so results
are bit-for-bit those of the old code on whole-step input. `L` is the window width in steps; each span has length `d`,
a centre `c`, and ends `floor(c) - down` and `floor(c) + up` where `down/up` split `d` around `rho = anchorRho`
(even `d`: `down = round(rho*d)`; odd `d`: `down = floor(rho*d)` for bias `'up'` (the extra step goes up) and
`ceil(rho*d)` for `'down'` (the extra step goes down)).

- **`uniform`** (old `v1`, "uniform-centers"): the safe range of centres is `[max down, L - max up]` using a fixed
  half split (ignores `anchorRho`); the `n` centres are spaced equally across it in whole-step increments. Does not check
  fit (see "Leaving the window").
- **`prefixSlack`** (old `v2`, "prefix-slack"): same range with the `rho` split. Centre `i` blends the equal spacing
  `amin + i/(n-1) * span` with a slack-weighted prefix position: `a = (1-alpha) * equal + alpha * (amin + u_i * span)` where
  `u_i = (sum of weights before i) / total`, weight `(L - d)^beta` (smaller spans have more slack and pull the
  following spans higher). Returns nothing when `amin > amax` (ordering skipped).
- **`prefixDominance`**: range `[max(rho*d), min(L - (1-rho)*d)]` (unquantised); centre `i` at `amin + u_i * span` with
  `u_i` the prefix fraction of weights `d^beta` (larger spans "dominate" the lower positions).
- **`repulsion`** ("repulsion-centers"): start from evenly spaced centres within per-span bounds, then 60 steps (`repulseIterations`) of
  projected gradient: any two centres closer than `delta = kappa * ((d_i/L)^gamma + (d_j/L)^gamma)` push apart with force
  `2 * lambda * (delta - dist)`, step `repulseEta`, clamped to the bounds; finally blended with the neutral spacing by
  `repulseAlpha`.

Odd-interval bias: the bias says which side takes the extra step of an odd-step span (even and non-whole spans ignore it).
`oddBiasSemantics: 'interval'` (default) attaches the bias to the interval. The old page attached it to the span
**position** (the `i`-th bias applied to whichever interval sits `i`-th in the ordering); `'position'` reproduces that.

### Extensions beyond the old page (non-whole-step spans only)

The old engines assumed whole steps. For JI / cents spans (a span that is not a whole number of `stepCents`) the lib
splits the span exactly (`down = rho * d`, no odd/even rule), does not floor the centre (flooring would push the low
end below the window), and spaces `uniform` centres exactly rather than in whole-step increments. Whole-step input is
unaffected, which the golden test checks.

### Leaving the window

`meta.withinWindow` is computed for every engine (first ordering's endpoints against `[0, width]`); any engine can
leave the window, and only `prefixSlack` and `prefixDominance` return null instead (when their range is empty).
Examples, all tested: `uniform` with spans wider than the window; `prefixDominance` with a single 700 c span in 24 steps
gives `[-100, 600]`; `repulsion` with 2000 c + 400 c in 12 steps gives notes at -800, 0, 400, 1200.

## Golden test (`golden.test.ts`)

Verification of the **port only**: for 8 interval sets (odd intervals, odd bias up/down/mixed, repeated sizes, a single
interval), windows of 2 to 4 octaves in 12-EDO plus 19- and 31-EDO cases, non-default parameters, and every mode, each
lib ordering reproduces the old page engine's (`src/pages/interval-placement/engine.ts`) endpoints, pitches and
centres, and the old engine drops an ordering exactly when the lib skips it (cases that really drop orderings are included:
`[30,20]` in 2 octaves, `[11,7,16]` in 1 octave, asserted by a dedicated test). It also checks the interval-attached bias
against the old positional one where they must coincide. It does not commit the redesign to the old behaviour; **it may
be retired or rewritten when the M2b redesign replaces the engines.**

## Quirks of the old engines (kept; input for the M2b redesign)

1. **Odd bias is positional**, not per interval (see above): reordering moves the bias to another interval, and
   `normalizeOddBias` zeroes it by the original index's parity.
2. **Repulsion is effectively a no-op.** `delta` is a fraction of the window (`kappa * (r_i + r_j)`, typically < 1) but
   centre distances are in steps, so the force only acts when two centres are within about a step of each other. At
   default parameters repulsion gave the same pitch sets as the neutral spacing for every case probed (0 of 198 orderings
   differed), and the result depends on the EDO (the step size) rather than the window.
3. **The top of the window is never reached by `prefixSlack`**: the prefix fraction `u_i` excludes span `i`'s own weight,
   so with `alpha > 0` the last centre stops short of `amax` (e.g. spans `[4,4]` in 36 steps end at step 31 of 36).
4. **Floor vs `eps`**: `prefixSlack` computes its reported whole-step `anchors` with `floor(a + 1e-9)` but the endpoints use
   `floor(c)` of the unrounded centre, so the two disagree whenever a centre is within 1e-9 below an integer (float
   noise), and the reported anchors are not the ones the endpoints use.
5. **Anchors always span the whole window**: every engine (but dominance's unquantised range) spreads the `n` centres
   across the entire safe range, so the window width, not just a limit, forces the spread of the spans.
6. **`uniform` ignores `anchorRho`** and does not check fit; infeasible windows return endpoints outside the window.
   **`prefixDominance` can also leave the window**: its range is unquantised and the centre is floored, so the odd split
   rounds down past 0 (a single 700 c span in 24 steps gives `[-100, 600]`; 20 such records in the golden set).
   **`repulsion` never returns null** and falls back to out-of-window bounds when the spans do not fit (2000 c + 400 c in
   12 steps gives notes at -800, 0, 400, 1200).
7. **Infeasible orderings vanish**: `prefixSlack` and `prefixDominance` return null when `amin > amax`, and the old page just
   omitted them from the list; the lib counts them in `skipped`.
8. **Collisions merge silently in the old code** (`pitchesFromEndpoints` uses a Set): 4 of 6 default `11 7 16`
   `prefixSlack` orderings have a coinciding pair.
9. **Slack weights of zero**: a span as wide as the window has slack 0; if all spans do, `totalWeight` falls back to 1
   via `|| 1`. The `prefixDominance` fallback uses equal weights instead (inconsistent).
10. **Duplicate pitch sets** from different orderings were listed twice (now one voicing with `perms`).

## Proposed workbench integration (for the Final step)

Not started; see ARC.md "Final step".
