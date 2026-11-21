# ratio-rhythm library

Pure TypeScript (no DOM) behind the Ratio Rhythm Lab. The canon is
`_Ideas/Rhythm-As-Pitch/Ratio rhythm timeline and canon.md`; the tests are its worked numbers.
Import from `index.ts` (this library's own barrel) or the files directly. It imports
`src/lib/harmonic-field/intervals.ts` by file only.

## Module map

| File        | What it holds                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ratios.ts` | bigint `gcd`, `lcm`, `lcdOf`; `Ratio`; `parseRatios` (exact input only), `reduceOctave`, `rerootRatios`                                                                                 |
| `ring.ts`   | linear ring (`linearRing`, `linearRingBig`), `integerRing` (GCD reduction), `logRing`, `ratesGrid`, `gapsOf`, `rotateRing` (rotation), `onsetStats`                                    |
| `tuning.ts` | `valOf`, `ratioSteps`, `temperedOut`; `quantize` (targets, exactness, bits lost, displacement), tie rule, anchored pair rule, `gridsKeepingAll` scan                                    |
| `modes.ts`  | re-rooting (`rerootMode`, `modeTable`), `fingerprint`, `oddHarmonicForm`, `commonGrid`, `equalCycles`, `equalPulse`                                                                     |
| `names.ts`  | `nameOf` (scale, rhythm, class), `fmtShort`, `fmtClassLong`, `fmtOneToken`, `parseName`, `decodeScale`, `decodeOneToken`                                                                |

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

## Names

Gaps are divided by their GCD first.

- Scale name: the gaps from the root. Rhythm name: smallest rotation (numeric lexicographic).
  Class name: smallest of all rotations and reversals.
- Short form `⟨334113⟩`: digits run together when every gap is below 10; if any gap is 10 or more, all
  gaps are space-separated: `⟨8 1 9 18 36⟩`.
- Long class form: `15·6 ⟨1 1 3 3 3 4⟩` (L·k, always spaced).
- One-token form: the rhythm string with a barline before the root's gap, `⟨113|334⟩`. Spaced
  gaps set the barline off with spaces: `⟨1 9 18 36 | 8⟩`. With rotational symmetry the first
  equivalent position is used; when that is position 0 no barline is written.
- `parseName` accepts both spacings, optional brackets and (with brackets) an `L·k` prefix; any whitespace inside means space-separated gaps; a bar-less string
  with no whitespace is read digit by digit.
