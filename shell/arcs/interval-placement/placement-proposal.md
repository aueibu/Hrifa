# M2b: Placement redesign proposal

For the human to choose from (checkpoint). Nothing here is built. Every number comes from the M1/M2 libraries. To reproduce, run the scripts in `m2b/` from `shell/`:

```
npx esbuild arcs/interval-placement/m2b/<demo|demo2|demo3>.ts --bundle --platform=node --format=esm --outfile=/tmp/x.mjs && node /tmp/x.mjs
```

The running example is today's default: intervals `11 7 16` (12-EDO), a 3-octave window starting at C2, default timbre.

## 1. What the current controls actually do

### The engines
The engines are shape rules, not quality rules. There are 16,218 distinct ways to place spans of 11, 7 and 16 inside 36 steps. The page shows 6 of them, one per ordering. Ranked by interference among all 16,218 (1 = smoothest), the engines' voicings land here:

| Engine | Interference ranks of its 6 voicings | Harmonicity ranks |
| --- | --- | --- |
| uniform | 910 … 10,533 | 348 … 9,824 |
| prefix-slack (default) | 494 … 9,117 | 697 … 7,920 |
| prefix-dominance | 3,574 … 15,703 | 2,294 … 15,666 |
| repulsion | 84 … 12,353 | 100 … 14,661 |

Each engine picks a spread-out shape. Whether that shape sounds good is luck: the same engine produces voicings from the top 1 % to the bottom 3 %.

### The window and the spread
Window width also sets the spread, because the anchors always run across the whole window.

Prefix-slack is given the same ordering (11, 16, 7) at four widths:

| Window | Steps placed | Span | Interference | Harmonicity |
| --- | --- | --- | --- | --- |
| 2 octaves | 2 3 10 13 17 19 | 17 st | 0.899 | 0.630 |
| 3 octaves | 2 9 13 21 25 28 | 26 st | 0.351 | 0.802 |
| 4 octaves | 2 13 14 30 32 39 | 37 st | 0.479 | 0.710 |
| 5 octaves | 2 13 19 35 43 50 | 48 st | 0.328 | 0.712 |

"Wide vs narrow" and "how much room to place in" are one knob, and the result jumps around as you turn it.

### Quirks found while porting (details in `src/lib/interval-placement/README.md`)
- Repulsion has no effect at the default settings. It changed no chord in 864 orderings, because its push distance is under one step.
- Prefix-slack never reaches the top of the window.
- Every engine can place notes outside the window. Prefix-dominance turns a lone fifth in two octaves into `[-100, 600]`.
- Odd-interval bias was attached to the position in the ordering, not to the interval.
- Collisions merged silently: 4 of 6 default orderings have one.
- Orderings that don't fit disappeared silently.

### The one real degree of freedom
That degree of freedom is the ordering. Within an ordering, every placement is fixed by the rule. So the page can never show you most of what your intervals can do.

## 2. What the scores tell us about placement

1. **Register moves only one score: interference.** Scan the default voicing (steps 4 11 18 22 34) from C1 to C5:
   - interference falls steadily, from 0.536 to 0.134 (worst relation 0.103 → 0.044);
   - harmonicity and periodicity don't change, because they don't depend on transposition.

   This is the M3-low-vs-high effect, measured. **Consequence:** an optimiser left free will always move the chord up and thin it out. The five smoothest of the 16,218 are all four-note voicings at the top of the window. So **register should be your choice, with its cost shown, not something the search optimises.**
2. **Pitch-class harmonicity hardly separates voicings of one interval set.** It gives only 53 distinct values across 811 sampled voicings, because many voicings share their pitch classes (1,140 pitch-class sets among 16,218 voicings). For choosing a placement, the useful scores are:
   - interference (751 distinct values);
   - pitch-space harmonicity (618);
   - periodicity (474).

   Pitch-class harmonicity is better shown as a property of the interval set as a whole.
3. **The scores mostly agree, so the Pareto front is tiny.** Among the 1,398 six-note voicings with the bottom note fixed on C2, the front of interference against pitch harmonicity has only 3 points. Peeling off successive fronts, though, gives 122 layers. That's a weight-free ranking: layer 1 is the best trade-offs, layer 2 the next best, and so on. **The map should show the layers (colour or rank), not just the front.**
4. **Searching every placement is possible, but not live as it stands.**
   - Scoring all 16,218 takes about 68 s, roughly 4 ms per voicing.
   - Per voicing, the scores cost: interference 0.9 ms, pitch harmonicity 0.8 ms, periodicity 0.04 ms, pitch-class harmonicity 2.0 ms.
   - Pitch-class harmonicity can be cached per pitch-class set, which makes it about 14× cheaper here.
   - Note counts: 418 four-note, 4,488 five-note and 11,312 six-note voicings. Shared notes are common once placement is free.

   A search therefore needs a background worker, caching, constraints applied before scoring, and results that stream in. Five or more intervals need sampling or pruning.

## 3. Designs to choose from (combinable)

### A. Register as a direct, live control ("drag the structure")
- **Principle:** register-dependent roughness, from critical bandwidth (Plomp & Levelt 1965; Hutchinson & Knopoff 1978), is the one acoustic effect of moving a structure. So make moving it the interaction.
- **Controls:**
  - The voicing on a pitch strip. Drag or step the whole structure up and down; optionally drag one span alone.
  - The window becomes **register limits**: a lowest and highest allowed note, drawn as bounds.
  - Beside it, the register curve (interference against bottom note) with "you are here" marked.
- **What it enables:** feel the M3-low-vs-high effect immediately; pick a register on purpose; see the cost of going lower.
- **Cost:** one voicing scored per move, about 2 ms, so it's live.
- **Theory or taste:** the curve is theory; where to put the chord is your taste.

### B. Spread separated from room ("shape" mode, replacing the four engines)
- **Principle:** say how wide the chord is independently of the register limits, then say how the spans are distributed within that width.
- **Controls:**
  - **Spread:** a target range in octaves, with names for steps (close, open, wide).
  - **Lean:** low ↔ centred ↔ high. This shifts span centres toward the bottom or top of the spread. It replaces prefix-slack and prefix-dominance with one continuous control.
  - **Evenness:** equal gaps ↔ weighted by span size. This keeps the useful idea from the prefix engines.
  - Repulsion is dropped, since it has no effect.
- **What it enables:** the stepped wide/narrow categories you wanted, without the window doubling as the spread; predictable changes as you turn a knob.
- **Cost:** cheap, one placement per ordering as today.
- **Theory or taste:** taste. These are shape controls; the scores then tell you what each shape sounds like.

### C. Explore every placement ("search" panel)
- **Principle:** stop picking one placement per ordering. Enumerate every way the essential spans fit within the register limits and spread range, filter by your constraints, and score them all.
- **Controls:**
  - must-have / must-not-have intervals;
  - note-count range;
  - whether spans may share notes (D);
  - spread range.

  Results go on the Pareto map (any two axes, layers coloured) and a list ranked by layer, then by a weighted mix. The search runs at the register chosen in A, so it doesn't just push everything up. The voicings the old engines would have chosen can be marked on the map as reference points.
- **What it enables:** finding the best (or most interesting) placements of your intervals, not just the six an engine reaches; seeing the trade-off between smoothness and fusion.
- **Cost:**
  - 3 intervals in 3 octaves means about 16k candidates. That needs the worker, the pitch-class cache and early filtering, with results streaming in over seconds.
  - 4+ intervals needs pruning (bounds and constraints first) and a cap or sampling.
  - Ranking by layer needs no weights.
- **Theory or taste:** theory ranks; you choose.

### D. Essential intervals may share notes (stacking)
- **Principle:** your concept is that the essential intervals must be present and everything else falls out. Under search, "essential" can simply mean *the chord contains each essential interval as some pair*, at its exact size (optionally octave-equivalent). Spans may then share notes, e.g. 4 + 3 → one triad, with a note-count range deciding how much stacking is allowed.
- **What it removes:** the ordering-dependent "which pair is essential" question that dedupe raised in M2. "Essential" becomes a property of the chord rather than of an ordering.
- **Cost:** it's a constraint in C; cheap.
- **Theory or taste:** taste (it's your concept's definition).

## 4. Recommendation
**A + B as the main "play" mode, C as an "Explore" panel, and D as an option inside C** (with the note-count range defaulting to "no sharing", which matches today).

- **A:** fixes the register blind spot and is the interaction you described.
- **B:** keeps the stepped wide/narrow idea and the lean that the engines were really about, without their side effects.
- **C:** the place where the scoring pays off.
- **D:** makes "essential" well-defined.

**In the M3 mock:**
- **Centre unit:** interval chips, then the register strip with the draggable structure and its limits, then spread and lean, then the spans plot.
- **Register panel:** the curve.
- **Results panel:** gains an "Explore" tab (Pareto map with layers, and the list).
- **Relations panel:** unchanged.

## 5. Open questions for you
1. A, B, C, D: which do you want? (Recommendation above.)
2. B: spread as a numeric range, named steps (how many, which names?), or both?
3. A: drag the whole structure only, or single spans too? Step size: one EDO step, or free (cents)?
4. C: default search scope: the whole register limits, or a neighbourhood around the current voicing (faster, more "nearby alternatives")?
5. D: default note-count range: no sharing (today), or allow sharing?
6. Keep any old engine as a named preset of B (e.g. "prefix-slack" as a particular lean/evenness)? Repulsion is proposed for removal.
7. List ranking in C: by Pareto layer first, or by the weighted mix (equal weights by default)?
