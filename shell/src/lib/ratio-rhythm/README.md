# ratio-rhythm library

Pure TypeScript (no DOM) behind the Ratio Rhythm Lab. The canon is
`_Ideas/Rhythm-As-Pitch/Ratio rhythm timeline and canon.md`; the tests are its worked numbers.
Import from `index.ts` (this library's own barrel) or the files directly. It imports
`src/lib/harmonic-field/intervals.ts` and `sternBrocot.ts` by file only.

## Module map

| File        | What it holds                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ratios.ts` | bigint `gcd`, `lcm`, `lcdOf`; `Ratio`; `parseRatios` (exact input only), `reduceOctave`, `rerootRatios`                                                                                 |
| `ring.ts`   | linear ring (`linearRing`, `linearRingBig`), `integerRing` (GCD reduction), `logRing`, `ratesGrid`, `gapsOf`, `rotateRing` (rotation), `onsetStats`                                    |
| `tuning.ts` | `valOf`, `ratioSteps`, `temperedOut`; `quantize` (targets, exactness, bits lost, displacement), tie rule, anchored pair rule, `gridsKeepingAll` scan                                    |
| `modes.ts`  | re-rooting (`rerootMode`, `modeTable`), `fingerprint`, `oddHarmonicForm`, `commonGrid`, `equalCycles`, `equalPulse`                                                                     |
| `names.ts`  | `nameOf` (scale, rhythm, class), `fmtShort`, `fmtClassLong`, `fmtOneToken`, `parseName`, `decodeScale`, `decodeOneToken`                                                                |

Each module also names its pitch-domain counterpart (canon, "The pitch–rhythm map"), so the two
domains stay visible side by side:

| File          | What it holds                                                                                                                                              | Pitch-domain counterpart                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `euclid.ts`   | `euclidSlots`, `euclidGaps` (E(k, L)), continued fraction, `sbStructure` (parents, children, run path), `fmtSbPath`, `gapsFromParents`                      | MOS scales, Erv Wilson's scale tree                                               |
| `grouping.ts` | flat grouping text (`fmtGrouping`, one formatter), `proximityTree` and `fmtTree`, `countTrees` (top-down and bottom-up totals, little Schroeder; throws `TreeLimitError` for n above `MAX_TREE_N` = 96, so the page clamps n first), `groupMixes`, `groupingsOf`, `bracketings` | no direct counterpart in the canon's map; closest: structural vs ornamental tones (the meter row holds the factor chain) |
| `meter.ts`    | `divisiveHierarchy`, `additiveHierarchy`, `syncopation`, `meterOrderings`, `additiveSearch` (dynamic program), `isWeakPulse`                                | tonal hierarchy; the factor order is the prime limit; a meter picks a side of a comma |
| `distance.ts` | `hamming`, `swapDistance`, `alignToReference`, `chronotonicDistance`, `rescaleSlots`, `slotTimes`                                                          | comparing two tunings; a comma merged vs a note shifted by tempering              |
| `spectrum.ts` | `distanceCounts` and `foldedDistances` (interval vector), `intervalSpectrum` (per generic step, the lab's row shape), `propriety`, `dft`, `spectrum`, `fmtChips` | interval vector, interval spectrum and propriety; harmonic j of a tone            |
| `zring.ts`    | `zPartners` (step budget, injected `shouldStop`), `isZRelated`, `canonKey`, `alignTo`, `linearRingPair`                                                    | Forte's Z-relation; homometry (equal DFT magnitudes, different phases)            |
| `finder.ts`   | `findZFixes` (generator), `sliceFinder`, `runFinder`: the cheapest movement (or one added onset) that gives a Z-partner                                    | retuning one or two notes until a set-class relation appears                      |

## Conventions

- `L` is the ring size in slots, `k` the number of onsets. Slots count from 0 (the root, 1/1, is slot 0);
  pulses count from 1 (pulse = slot + 1). Linear slot = rL - L; ratio(s) = (L + s) / L.
- Equave is 2/1. Ratios are octave-reduced into [1, 2) on input, except the rates reading,
  which takes ratios as given (`parseRatios(text, { reduce: false })`).
- Rotation (`rotateRing`) shifts slots and keeps L. Re-rooting (`rerootMode`) divides by a new
  root, so each mode has its own LCD and ring. They are different operations on the linear ring.

## Exact vs derived

- Exact: ratios (bigint n/d), the LCD and LCM (bigint, no overflow), integer slots, gaps, mode ring
  sizes, vals and comma steps. `linearRing` returns `null` when L does not fit a safe integer;
  `linearRingBig` always works.
- Derived (floating point, display only): cents (`ratioCents`), log ring rounding, errors and
  displacement in cycles, bits lost, onset statistics. No midicents anywhere.
- Steps of a ratio in N-EDO are signed: sum of exponent x val over n/d (81/80 is +1 where it stays open).

## Quantization

Slot p goes to round(p N / L) mod N. Ties (exactly half a step) round up or down by a parameter.
The canon's tie rule: a grid keeps a pair (or a ring) only if it does so with halves rounded
both up and down (`keepsAllBothTies`, `gridsKeepingAll(..., 'both')`).

## Text formats (M2)

- Interval content is written as lab chips: `2 ×1, 3 ×2` (`fmtChips`). Two views: folded distances
  (d = min(d, L - d), what Z-partners share) and the per-step spectrum. `3-3-2` on 8: distances
  `2 ×1, 3 ×2`; 1st step `2 ×1, 3 ×2`; 2nd step `5 ×2, 6 ×1`. No digit strings.
- A flat grouping is written with `+` and no spaces: `3+3+2` (`fmtGrouping`; human, 2026-11-20).
  Gap and rhythm names stay hyphenated. A proximity tree shows each bracket's total:
  `53 = 31 (8 + 9 (1 + 8) + 14) + 22`. All of this lives in `grouping.ts` (`GROUPING_TEXT`).
- Stern-Brocot: `sbStructure` gives `{fraction, parents: [left, right], children: [left, right], runs}`
  (left is the smaller fraction); `fmtSbPath` writes `L¹⁰ R L R` for E(5, 53) (superscript counts,
  none for 1). Parents come from the lab's `sternBrocotAncestry`.
- Propriety is the lab's rule on slots (`proper` / `strictly proper` / `improper`; `proprietyLabel`
  says "not proper"). A maximally even rhythm has at most two sizes per step.
- The finder is a generator; the page calls `sliceFinder(gen, state, shouldYield)` once per
  animation slice with its own deadline, or stops calling it (or `gen.return()`) to cancel.
  It yields after every tested candidate. Pass the same deadline as `shouldStop` in the options so
  it is also checked inside each partner search; a search cut that way is redone from its start on
  the next slice (after `MAX_INTERRUPTS` cuts it runs to its step budget). The `done` event has
  `abortedSearches`: partner searches that hit `partnerCap` and counted as "no partner". A nonzero
  count means "cheapest" is not proven. A level stops testing once `maxResults` results are found.
- `meterOrderings` scores from level sizes (`divisiveSyncopation`), keeps no per-slot arrays, and
  builds `ordering.hierarchy` (the weights) on demand for one chosen ordering, for drawing.

## Names

Gaps are divided by their GCD first.

- Scale name: the gaps from the root. Rhythm name: smallest rotation (numeric lexicographic).
  Class name: smallest of all rotations and reversals.
- Written like the Harmonic Field Lab's step patterns (`2-2 on 4`): gaps joined by hyphens at every
  size, no brackets: `3-3-4-1-1-3`, `8-1-9-18-36` (human, 2026-11-20; the canon's `⟨334113⟩` form
  is not used).
- Long class form: `15·6 1-1-3-3-3-4`.
- One-token form: the rhythm name with a barline in place of the hyphen before the root's gap,
  `1-1-3|3-3-4`, `1-9-18-36|8`. With rotational symmetry the first equivalent position is used;
  when the root's gap comes first the barline leads: `|1-2-1-2-1-2`.
- `parseName` takes hyphens or spaces between gaps, at most one barline and an optional `L·k`
  prefix, and ignores angle brackets (so the old artifact's `⟨8 1 9 18 36⟩` text reads). A run of
  digits with no separator is one gap.
