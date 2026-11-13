# harmonic-field

Pure TypeScript core of the Harmonic Field Lab: exact interval maths (monzos + cents), field generators, subsets, scale
analysis, chord finding, common scales, transposition maps and deviation from a target tuning. No React, no DOM, no
audio, no global state (one small memo cache inside `deviation.ts`), so the Composition Workbench can import it without
depending on a page.

Ported behaviour-for-behaviour from the frozen JavaScript prototype (`hfl_core.js`, `hfl_presets.js`, in the Infinitone
repo's `prototype/`). `vectors.json` (copied unchanged) is the contract: `harmonicField.test.ts` ports the prototype's
`run_tests.js` op handlers and runs every vector (189) and every preset (53) as its own test. New core rules add cases
to `vectors.json` (and a handler in the test file if the `op` is new) and a line in this README.

Pitch representation: **monzo + cents** (decision H-1 in `shell/DECISIONS.md`). Midicents or Hz are derived from `c` only
at an edge (audio, a Workbench handoff, consistent with W-1); they are never stored in place of the monzo.

## Modules

Import from the barrel (`./index`, or `@/lib/harmonic-field`).

| module | contains |
| --- | --- |
| `types.ts` | `Monzo`, `Note`, `RelNote`, `PrimeMask`, `FieldResult`, `AdditiveAxis`, `OrthoplexAxis`, `SizeGroup`, `LetteredGroup` |
| `intervals.ts` | `PRIMES`, `EPS`, `MAXN`, `mod`, `mAdd`, `mCents`, `mFrac`, `factorInt`, `mkNote`, `ratioNote`, `centsNote`, `mulNotes`, `parseInterval`, `reduceInto`, `fmtRatio`, `primeLimit`, `oddLimit`, `tenneyHeight`, `slotOf`, `passesMask`, `dedupeSort`, `NAMES`, `vs12` |
| `generators.ts` | `genHarmonic`, `genEdo`, `genAdditive`, `genOrthoplex`, `genCps`, `parseCustom` (each returns unreduced notes) |
| `field.ts` | `buildField`, `latticeCoords`, `latticeEdges`, `cpsChords` (+ `Lattice*`, `CpsChord` types) |
| `subset.ts` | `carrySelection`, `rotateSubset`, `nearestEdSubset`, `oddLimitSubset` |
| `shape.ts` | `groupSizes`, `mosSizes`, `analyzeSubset`, `modeMatrix`, `intervalSpectrum`, `propriety`, `constantStructure` |
| `chords.ts` | `parseTemplate`, `templateKey`, `templateFolds`, `templateLabel`, `DEFAULT_TEMPLATES`, `findChords`, `findChordVoicings`, `closestChord`, `chordLadder` |
| `scales.ts` | `MELA_NAMES`, `MELA_WESTERN`, `JI12`, `melakarta`, `melakartaDesc`, `SCALE_LIBRARY`, `scaleTargets`, `nearestScaleSubset` |
| `fifths.ts` | `fifthsLayout`, `FIFTH_CENTS` (generator-chain / circle-of-fifths geometry) |
| `keys.ts` | `transpositions` (the transposition map: which keys exist) |
| `deviation.ts` | `INTERVAL_NAMES`, `fmtSigned`, `nearestRatio`, `deviations`, `deviationsJI`, `semitoneTargets`, `edoTargets`, `scaleTargetsLabeled`, `vsJI` |
| `scala.ts` | `parseScl`, `toScl` |
| `presets.ts` | `PRESETS` (data only) and the `Preset` type |
| `scorers.ts` | `scorePeriodicityInfinitone`, `ScoreResult` |
| `scorersMore.ts` | `scorePeriodicityFair`, `scoreLattice`, `scoreRoughness` (default), `pairRoughness`, `SETHARES`, `compareScorers` and their option and result types |
| `retuner.ts` | `pickPivot`, `degreeOf`, `nearestDegree`, `rerootCards`, `retuneStep`, `REF_HZ`, `EMPTY_SCORE` and the `RetunerCard`, `HeldNote`, `Base`, `RetuneOpts`, `RetuneResult`, `RetuneWhy` types |
| `visual.ts` | the visualizer views: `latticeCoords3d` / `latticeCoords2d` (notes on three prime axes; a note with other primes gets a `base` ring, `stems` per hidden prime and a `pos` tip), `defaultAxes3d`, `axisChoices3d`, `stemDir3d`, `stemAngle2d`, `fmtHidden`, `edoFit`, `edoErrors`, `bestEdos`, `dissonanceCurve`, `curveMinima`, `isoGrid`, `isoPitch`, `isoQ`, `nearestFieldNote` and their types |

## Typical flow

```ts
import { buildField, genHarmonic, parseInterval, rotateSubset, findChords, DEFAULT_TEMPLATES } from '@/lib/harmonic-field';

const rep = parseInterval('2/1')!;
const mask = Array(25).fill(true);                        // prime filter: all primes on
const { notes: field } = buildField(genHarmonic(8, rep, false), rep, mask);
const rel = rotateSubset(field, field.map((_, i) => i), 0, rep);   // the subset as a scale from its mode root
const chords = findChords(rel, rep.c, DEFAULT_TEMPLATES, 18);      // tolerance 18 c
```

## Port notes (TypeScript vs the JS prototype)

- Behaviour is identical. Monzo keys are prime numbers as decimal strings (`{ '2': -1, '3': 1 }`); JS coerced them the
  same way. `oddLimit` and `mFrac` use `bigint`.
- Preserved quirks: `analyzeSubset` letters for one step size are `L` (the letter list is `['L','s']` filtered), `mosSizes`
  reports equal divisions as `s: 0`, `nearestEdSubset` and `nearestScaleSubset` break ties toward the lower field index,
  `parseScl` does not validate its count line (a missing count gives `NaN` and reads every pitch line), `transpositions`
  treats a negative or missing `tolC` as 0.01, and `nearestRatio` keeps a module-level cache of up to 9 candidate lists.
- `oddLimitSubset` takes `number | bigint`; `findChords`, `closestChord` and `chordLadder` take a `RelNote[]`
  (`rotateSubset` result) so every note carries `src`.
- Rules below are the prototype's `CORE_SPEC.md`, kept verbatim (it is now absorbed here; the prototype's copy is frozen).


## Rules: Data
- **Monzo**: map prime → non-zero integer exponent. 3/2 = {2:-1, 3:1}. Exact; no floats.
- **Note**: `{m, c}` — monzo (or `null` = irrational, cents only) plus cents. Cents are derived for rational notes.
- Products of an irrational and a rational note are irrational.
- **Field**: notes reduced into [0, repeat), prime-filtered, sorted by cents, de-duplicated (within 1e-6 c; a rational note wins over an irrational one at the same pitch), capped at 2048.

## Rules: Rules that are easy to lose
- Interval text: `a/b`, `a:b`, integer `n` = n/1, `7\12` = 7 steps of 12-EDO of 2/1, `386c` = cents, **any number with a dot is cents** (Scala rule). Zero and junk → no value.
- Reduce into repeat: k = floor(c / repeat_c + 1e-9); note · repeat^-k.
- Prime filter (Infinitone rule): a rational note passes when every prime with non-zero net exponent is enabled. Primes 2…89 have their own switch; anything larger shares the "97+" switch. Irrational notes always pass.
- Harmonic segment from H: k/H for k = H, H+1, … while k/H < repeat. Subharmonic: H/k reduced into the repeat.
- EDO: notes are irrational (`i · repeat / N` cents). Infinitone stores Stern–Brocot rational approximations instead; not reproduced.
- Box lattice: axis i contributes g_i^(j − ctr_i), j = 0 … n_i − 1; total ≤ 2048.
- Diamond: every integer point with Σ|x_i| ≤ D (x_i ≥ 0 when one-directional). Standard definition; Infinitone's own variant not yet confirmed.
- CPS: all k-element products of the factors, divided by the lowest product.
- Custom text: 1/1 is always added; an entry equal to the repeat is dropped.

## Rules: Lattice
- Box and diamond generators record each note's generator exponents as `x` (box: j − ctr per axis; diamond: the point itself). `x` survives reduction into the repeat.
- Generator mode: coordinates = `x`; unavailable if any note lacks it.
- Prime mode: coordinates = monzo exponents over every prime present in the field, sorted, except the repeat's prime when the repeat is a single-prime power (2/1 → drop 2; 3/1 → drop 3). Irrational notes are skipped and counted.
- CPS mode: CPS notes record their factor indices as `f`; coordinate i = 1 if factor i is used, else 0.
- Edges: 'step' rule = coordinates differ by +1 on exactly one axis; 'swap' rule (CPS) = differ in exactly two places (one factor swapped).
- CPS chords (Wilson): harmonic = notes sharing the same k−1 factors (they sound as x1:x2:…); subharmonic = notes inside the same k+1 factors (1/x1:1/x2:…). Keep groups of ≥3. Hexany: 4+4 triads; eikosany: 15+15 tetrads.
- Presets live in `presets.ts` (data only); the test runner checks every preset generates.
- Drawing (UI only, not tested): ≤3 axes at i·180°/d, lengths 1, 0.9, 0.8; more axes at i·137.5° (golden angle).

## Rules: Subsets and analysis
- Subset = set of field indices + mode (which selected note is the root). Rotation: each note ÷ root, + repeat if negative.
- Regenerating keeps selected pitches matched within 0.01 c; new pitches are selected only if "include new notes" is on; a different generator selects everything.
- Step sizes grouped within 0.01 c, largest first. 1 size = equal, 2 = MOS-type (xL ys), more = not MOS. Letters: L/s, L/M/s, else a, b, c….
- MOS sizes of a generator: n = 2…maxN where the n-note generator chain has 1 or 2 step sizes (tolerance 1e-4 c).
- Mean Tenney height: mean of Σ|e_p|·log2 p (= log2(n·d)).
- Nearest m-ED: for j = 0…m−1 take the unused field note circularly closest to j·repeat/m (first one wins a tie).
- Scala export: header, count, then degrees 1…N−1 and the repeat; ratios when rational, cents with 6 decimals otherwise.

## Rules: Scale shape (interval spectrum, propriety, constant structure)
- `intervalSpectrum(rel, repC, tol=0.01)`: for each generic step k = 1…N−1, take the interval from every degree i to degree i+k, **cyclic**: past the last degree wrap to degree (i+k−N) and add `repC` (the repeat, not necessarily an octave). Sort, group within `tol` c (a group starts at its smallest value; size = group mean), ascending, with counts. `variety` = number of groups. Fewer than 2 notes → `[]`. N intervals per k, so counts always sum to N.
- **Tolerance rule (one comparison for sizes):** two sizes are "the same" when they differ by **< tol** (strict). Grouping, propriety and constant structure all use it, and so does `transpositions` when it falls back to cents (default 0.01, as `tolC`, but there it is inclusive: distance ≤ `tolC` + 1e-9). The chord finder's `tolC` is a different thing: a musical tolerance on template error (default 18 c), inclusive. Propriety: for k = 1…N−2 compare every k-step size `a` with every (k+1)-step size `b`; `a−b ≥ tol` is a clash (pair `{k,a,b}`), `|a−b| < tol` is a touch. Any clash → `'improper'` (all clashing pairs returned); else any touch → `'proper'`; else `'strictly proper'`. Empty/one-row spectrum is vacuously strictly proper.
- `constantStructure(rel, repC, tol=0.01, spectrum?)`: `cs` is true when no two groups from different k have sizes differing by `< tol`; otherwise `example = {size, ks:[k1,k2]}` for the clash with the smallest size. Optional 4th argument = precomputed spectrum (same result, no recompute). The repeat itself (k = N) is not considered.
- The page shows this only for subsets of ≤ 64 notes (cost); the core itself has no cap.

## Rules: Chord finder (templates)
- `parseTemplate(text)`: whitespace ignored. Otonal `a:b:c…` (members are the numbers; root = the smallest) or utonal `1/(a:b:c)` (members are the INVERSES 1/a : 1/b : 1/c, root = the lowest pitch = the largest number). So `1/(4:5:6)` has exactly the intervals of `10:12:15`. Whole numbers 1 … 1e6, 2 … 8 of them, all different; anything else → `{ok:false, error}` (never throws). Returns `{ok:true, text (normalised: `a:b:c` or `1/(a:b:c)`), utonal, cents (ascending, cents[0] = 0), otonal (the equivalent integer ratio, lowest terms), key (the cents, 6 decimals, joined; repeat-independent, unlike `templateKey`)}`.
- `findChords(rel, repC, templates, tolC)`: for each degree `i` as root and each template: every template member k ≥ 1 has target `t_k` = its cents above the root **reduced mod repC**; each subset note `j` has `d_j` = (cents above the root) mod repC. The member is matched to the note with the smallest circular |error|, **error = d_j − t_k** (signed, reduced into ±repC/2). Voicing-agnostic: octaves and inversions are ignored. The chord is accepted when every |error| ≤ tolC (+1e-9) **and all matched notes are different** — two members landing on the same note, or on the root, reject it (no fallback to the second-nearest note). The root counts with error 0.
- Non-octave repeat: everything is reduced mod `repC` (e.g. in 3/1, 3:5:7 is 0, 5/3, 7/3). A template wider than the repeat folds back: members that become equivalent to the root or to each other (e.g. `4:5:6:8` in an octave repeat: 8/4 ≡ root) reject the chord.
- The bare form `1/4:5:6` (no brackets) is an error with the hint "write utonal chords as 1/(4:5:6:7)".
- Duplicates: the duplicate key is the template's cents reduced mod `repC`, sorted (`templateKey`), so `1/(4:5:6)` after `10:12:15`, `8:10:12` / `2:5:6` / `1:3:5` after `4:5:6`, and `6:7:10` after `3:5:7` are skipped; unparseable templates are skipped too. A template that folds onto itself in the repeat (`templateFolds`: two members, or a member and the root, on one pitch class, e.g. `1:2`, `1:2:3`, `4:5:6:8` in 2/1) is skipped and the page says so.
- Nearest-note limit: each member takes only its nearest note, so a chord can be missed only when two template notes lie within twice the tolerance of each other. For the default templates the closest pair is 112c apart (8:10:12:15 wraps 15/8 to the root), so this cannot happen below a tolerance of about 56c. The same note set with different roots is kept (the roots differ). Results sorted by `maxErr`, then root position. `exact` = every involved note is rational and every error < 1e-6 c.
- Result fields: `{t (template index), tkey (the duplicate key above), template (normalised text), name, root (field index), members (field indices, template order, root first), errors (c), maxErr, exact}`. `DEFAULT_TEMPLATES` = `[{name, text}]`; `templateLabel` joins them ("major triad (4:5:6)").
- `fifthsLayout(notes: {c}[], {gen=701.955, period=1200, steps=12})` -> `{lo, hi, positions, notes}`: the "Fifths" ring view. The chain has `steps` positions, step s = s generators reduced into [0, period), running from `lo = -floor((steps-1)/2)` to `hi = lo + steps - 1` (-5..+6 for 12). Each note goes to the step whose reduced pitch is nearest (circular), `offset` = note - step pitch (signed, within +-period/2). `turn` = (step mod steps)/steps, clockwise from the top. `stack` counts earlier notes on the same step (0, 1, ...). `offChain` is true when |offset| > period/steps/2. Worked (gen 3/2): 5/4 -> step +4 (81/64), offset -21.51 c; 9/8 -> +2, 0 c; 7/4 -> -2 (16/9 = 996.09 c), offset -27.26 c; 11/8 is off-chain (53 c from F, 60 c from F#). In 12-EDO (gen 700) pitch class k lands on the step with 7*step = k mod 12, offset 0: the circle of fifths.
- `closestChord(rel, repC, template)`: what tolerance would make a template show up. Runs `findChords` with tolerance Infinity on that one template and returns the entry with the smallest `maxErr` (ties within 1e-9 go to the root earliest in `rel`): `{chord, tol: chord.maxErr}`; or `{chord:null, reason}` when no root works at any tolerance (template unreadable, folds onto itself in the repeat, fewer subset notes than template notes, or every root collides). Same nearest-note rule as `findChords`, so `tol` is the tolerance for THAT rule; a wider tolerance never changes a nearest match, but nearest-only can reject roots that a cleverer note assignment would accept, so "no chord at any tolerance" means "none by this finder's rule". Worked: 12-EDO major scale, `4:5:7` -> root G, G-B-F, errors 0, +13.69, +31.17 (F is 1000 c above G, 7/4 is 968.83 c); Ptolemy major, `6:7:9` -> root 9/8 (9/8, 4/3, 5/3), errors 0, +27.26, -21.51. The page calls it only for templates with no results, inside the 128-note cap.
- `chordLadder(rel, repC, template)`: the tolerances at which a template gains chords. Runs `findChords` with tolerance Infinity; with nearest-note matching each root has one fixed `maxErr`, so the chord count at tolerance T is the number of roots with `maxErr` ≤ T. Returns `{rungs:[{tol, count}]}` ascending, `tol` = a `maxErr`, `count` = cumulative chords at that tolerance; chords within 1e-9 share a rung. Empty (`{rungs:[], reason}`, reasons as `closestChord`) when no chord can ever be found. Worked: Ptolemy major `10:12:15` -> 0 c (2), 21.51 (3), 70.67 (6), 92.18 (7); 12-EDO major `4:5:6` -> 13.69 (3), 86.31 (6), 98.04 (7); Ptolemy `6:7:9` -> 27.26 (1), 48.77 (3), 62.96 (5), 84.47 (6), 92.18 (7).
- `ChordTemplate.family?`: optional user-editable group label. `DEFAULT_TEMPLATES` carry Major (4:5:6, 8:10:12:15), Minor (10:12:15, 10:12:15:18), Septimal (4:5:6:7, 6:7:9, 14:18:21, 5:6:7, 3:5:7), Utonal (1/(4:5:6:7)), Neutral (18:22:27) and Suspended (6:8:9). The finders ignore it.
- `findChordVoicings(rel, repC, templates, tolC, {maxPerTone=4, maxTotal=2000})` -> `{chords: Voicing[], truncated}`: `findChords` that does not stop at the nearest note. Same templates, dedup (`templateKey`), folding rule, root and error sign (note - template). For each root and template, every chord tone has a candidate list: all subset notes within `tolC` (+1e-9), the root included, sorted by |error| then position and cut to the nearest `maxPerTone`. Every combination of candidates whose notes are all different (and none the root) is its own `Voicing` (`FoundChord` plus `family`), with per-tone `errors`, `maxErr` and `exact`. Sorted by `maxErr`, root position, then candidate order. `truncated` is true when a per-tone cut happened or the `maxTotal` cap stopped the search (later roots and templates are then missing). With `maxPerTone: 1` the result equals `findChords` (tested). Worked: field 1/1, 13/8, 5/3, template 3:5, tolerance 50 -> two voicings on 1/1: (1/1, 5/3) error 0 and (1/1, 13/8) error -43.83. `findChords` is unchanged and remains the `vectors.json` contract.
- The page runs it only for subsets of ≤ 128 notes and shows 12 chords per template (rest in a hover list and a pop-up).

## Rules: Common scales and "pick nearest scale" (M3)
- `melakarta(n)` (n = 1…72, else `null`): index `k = n−1`. **Ma1** for k < 36, **Ma2** for k ≥ 36. Within a half, `r = k mod 36`; the **chakra** is `⌊r/6⌋` (6 scales sharing the R/G pair, in the order R1G1, R1G2, R1G3, R2G2, R2G3, R3G3 = semitones (1,2) (1,3) (1,4) (2,3) (2,4) (3,4)); the position inside the chakra `r mod 6` picks the D/N pair in the same order (D1N1, D1N2, D1N3, D2N2, D2N3, D3N3 = (8,9) (8,10) (8,11) (9,10) (9,11) (10,11)). Notes = `[0, R, G, Ma(5|6), 7, D, N]` semitones, `swaras` the names (S R1 G3 M1 P D1 N3). Chakra number = `⌊k/6⌋+1` (Indu, Netra, Agni, Veda, Bana, Rutu, Rishi, Vasu, Brahma, Disi, Rudra, Aditya).
- Names: the 72 standard Katapayadi names in common transliteration (`MELA_NAMES`). The Katapayadi rule (the consonants of the first two syllables give two digits, written in reverse order; the groups are ka–ña = 1…9 then 0 (ka kha ga gha ṅa ca cha ja jha ña), ṭa–ṇa = 1…9 then 0, ta–na = 1…9 then 0, pa–ma = 1–5, ya–ha = 1–8 (ya ra la va śa ṣa sa ha)) is checked by tests for names without ambiguous consonants (t/ṭ, d/ḍ, n/ṇ, conjuncts). Traditionally irregular spellings (Natabhairavi, Divyamani, Shyamalangi, Simhendramadhyamam, Chitrambari) are kept as-is.
- **JI convention (one fixed table, `JI12`, semitone → ratio):** 0 1/1, 1 16/15, 2 9/8, 3 6/5, 4 5/4, 5 4/3, 6 45/32, 7 3/2, 8 8/5, 9 5/3, 10 **9/5**, 11 15/8. So R1 16/15, R2=G1 9/8, R3=G2 6/5, G3 5/4, M1 4/3, M2 45/32, P 3/2, D1 8/5, D2=N1 5/3, D3=N2 9/5, N3 15/8. 9/5 (= 3/2 × 6/5, the 5-limit minor 7th, and the 7th of Ptolemy's Aeolian) was chosen over 16/9 (= two 4/3s). The seven Western modes are the **rotations of Ptolemy's intense diatonic** (1/1 9/8 5/4 4/3 3/2 5/3 15/8), so Dorian has 10/9, Mixolydian's 7th is 16/9 and Aeolian's is 9/5; the other Western scales use `JI12`. Whole-tone has no exact 5-limit form (the JI list is an approximation). **Śruti traditions differ**: this is one convention among several, and every description says so.
- `SCALE_LIBRARY` = 16 Western scales `{name, family:'Western', edo12, ji, desc}`; `scaleTargets(sc, kind, stretchRepC?)` gives target cents above the root: `'edo12'` = 100 c per semitone, `'ji'` = cents of the ratios; if `stretchRepC > 0` every target is multiplied by `stretchRepC/1200` (the scale's octave lands on the field's repeat; a no-op for 2/1).
- `nearestScaleSubset(field, targetCents, repC, rootIdx)`: field notes are ordered by cents above the root mod `repC` (root first, at 0); the targets (wrapped into the repeat, sorted ascending) get **strictly increasing** field notes in that order (distinct, monotone). The chosen assignment minimises the worst |error| first and then the mean |error| (error = note − target, not wrapped; the root counts as 0). A target of 0 maps to the root. Remaining ties keep the lower field notes. `ok:false` only when the field has fewer notes per repeat than the scale; the subset must then be left unchanged. Returns `{ok, idx (field index per target, in the order given), errors, maxErr, meanAbsErr, window}`; on failure `{ok:false, reason, idx:[], errors:[], maxErr:null, meanAbsErr:null, window:0}`.
- Algorithm and cost: each target only considers its **K nearest field notes** (K starts at 8, doubled while that makes an increasing assignment impossible, up to the whole field). (1) Binary search over the candidate error values for the smallest worst error M, with a greedy feasibility test (smallest increasing positions with all errors ≤ M), O(N·K) per test. (2) DP over the candidates with error ≤ M minimising the sum of |errors| (prefix minima), O(N·K). Total O(F log F + N·K·log(N·K)) for F field notes and N scale notes; ~0.15 ms for a 7-note scale in a 2048-note field. It is exact whenever the optimum uses only each target's K nearest notes (always true when nearest-only picks are already distinct, as in 31-EDO). Checked against brute force on 400 random small fields.
- Examples (hand-checked): 31-EDO, major, 12-EDO targets → steps 0 5 10 13 18 23 28, max 16.13 c (7th: 1083.87 vs 1100); JI targets → same steps, the 3rd is 387.097 − 386.314 = 0.783 c sharp of 5/4. Bohlen–Pierce field (13 equal steps of 3/1, 146.30 c), harmonic minor 12-EDO targets as is → steps 0 1 2 3 5 6 8, max 77.83 c (6th degree); stretched (× 1.585) → 0 2 3 5 8 9 12, max 60.96 c. 5-EDO with a 7-note scale → `ok:false`.
- `melakartaDesc(n)`: one plain-language paragraph (number, chakra, swaras and semitones, the Western name from `MELA_WESTERN` when there is one, Ma1/Ma2 note, and the JI-convention caveat); `''` for an invalid n. `MELA_WESTERN` = melakarta number → Western/other name for 14 scales.
- `nearestEdSubset` is unchanged (greedy, circular, first wins).

## Rules: Transposition map: which keys exist (M4)
- A **key** is the same scale started on another note. `transpositions(field, idx, mode, rep, tolC=0.01)` takes the subset as `rotateSubset(field, idx, mode, rep)` (root first, each note relative to the root) and, for every field note `t` (field order), moves it so the mode root lands on `t`: moved note = (note relative to the root) × `t`, **reduced into [0, repeat)** like every field note — cents `k = floor(c/repeat_c + 1e-9)`, then note × repeat^−k, and the monzo too when it has one.
- Non-octave repeats: the same rule with the real repeat. For repeat 3/1 the moved note 2/1 × 7/3 = 14/3 reduces to 14/9; for repeat 4/1, 2/1 × 2/1 = 4/1 reduces to 1/1, so the subset {1/1, 2/1} is complete on both 1/1 and 2/1. Notes are never reduced mod 2/1 unless the repeat is 2/1.
- **Matching:** a moved note is found when it is the same pitch as a field note. Moved note and field note **both rational** → exact monzo equality (cents never decide it, however large `tolC` is). Otherwise (either is irrational, e.g. EDO steps) → circular distance mod the repeat ≤ `tolC` (+1e-9) cents. A rational moved note may therefore match an irrational field note by cents, and an irrational one a rational field note. `tolC` defaults to 0.01 (the "same size" tolerance used everywhere) when omitted or negative.
- Result, one entry per field note in field order: `{root: t, complete, missing (count), idx}`; `idx` = the field index found for each subset degree (in `rotateSubset` order, so `idx[0] === t`), or `null` for a missing note. `complete` ⇔ `missing === 0`. An empty subset, or a repeat of 0 cents, gives `[]`.
- Why JI and CPS fields have few keys: the field is finite and has no such closure, so a key exists only where the shifted scale still fits inside the block. In the Duodene (a 4×3 block) Ptolemy's major uses all 4 columns of the 3/2 axis, so it cannot move along it. EDOs are closed under moving by a step, so every subset has every key.
- Examples (hand-checked on lattice coordinates (a, b) = exponents of 3/2 and 5/4): Duodene = a ∈ −1…2, b ∈ −1…1 (12 notes); Ptolemy's major = (0,0) (2,0) (0,1) (−1,0) (1,0) (−1,1) (1,1), a ∈ −1…2 (full width, so Δa = 0) and b ∈ 0…1 (so Δb ∈ {−1, 0}) → complete keys 1/1 and (0,−1) = 8/5 (8/5 9/5 1/1 16/15 6/5 4/3 3/2). As its own field the same scale has one key (missing counts 4 4 2 2 4 5 on 9/8 5/4 4/3 3/2 5/3 15/8). The hexany inside itself: 1 key. 12-EDO diatonic: 12; 31-EDO diatonic: 31; a Bohlen–Pierce (13 equal steps of 3/1) scale: 13.
- Internal helpers (not exported): `mKey(m)` = primes sorted numerically (by digit length, then lexicographically), `prime:exponent` joined with commas (a canonical monzo string; `transpositions` itself now compares dense exponent rows); `reduceCents(pt, repC)` = template cents reduced into [0, repC) (an interval within 1e-6 c of repC becomes 0), the basis of `templateKey`/`templateFolds`/`findChords`.
- **Algorithm (not semantics) of `transpositions`:** field cents are sorted; each moved note is looked up by cents first (binary search, wrapping mod the repeat, window 1e-6 c for rational notes), the monzo is compared only on a cents hit, and a miss allocates nothing. Two degrees of one key may not use the same field note: the later one is reported missing (`null`), so that key is incomplete (field 0, 0.005, 600, 600.005 c at tol 0.01: the moved 0.01 c on root 0.005 c snaps back onto 0.005 c).
- Cost: O(N·F·log F) (hash lookups for monzos, binary search for cents). The page runs it only while N·F ≤ 400000 and N ≤ 256.

## Rules: Deviation from a target tuning (tuner strip and "vs JI")
- `nearestRatio(cents, oddLim, repC)` -> `{ratio:'a/b', cents, err}`. Candidates are every ratio `a/b` (coprime) whose **odd limit** (the larger of the odd parts of a and b) is <= `oddLim`, at **every octave position** (x2^k) whose cents lie in `[0, repC)`. With a repeat of 3/1 that includes 8/3 (1698 c), so folding is not just octave reduction. The input is reduced mod `repC`; the nearest candidate is found **circularly** (a note at 1195 c in a 1200 c repeat is 5 c flat of 1/1, not 1195 c sharp); `err = cents - candidate`, wrapped into `[-repC/2, repC/2)`. Ties (within 1e-9 c) go to the lower **Tenney height** `log2(a*b)`. The candidate list is cached per `(oddLim, repC)` (internal `_ratioList`, not exported); odd limit 255 builds ~13k candidates in ~10 ms.
- `deviations(rel, ref, repC)` -> `[{k, src, target, label, dev}]`, one per note of `rel` (a `rotateSubset` result: cents above the mode root). `ref` = `[{c, label}]`, target cents above the mode root. Each note takes the **nearest target measured mod the repeat** (wrapped difference), so 1190 c matches the target at 0 (dev -10). `dev = note - target` (positive = sharp). Two notes may share one target. `[]` for an empty `ref`. `deviationsJI(rel, oddLim, repC)` is the same shape with the target = `nearestRatio` of each note's own cents above the root (label = the ratio).
- Reference builders (all relative to the mode root): `edoTargets(m, repC)` = `k*repC/m` for k < m, labels `P1 m2 M2 m3 M3 P4 TT P5 m6 M6 m7 M7` for 12 steps of a 1200 c repeat, otherwise `k\m`. `scaleTargetsLabeled(sc, kind, stretchRepC?)` = `scaleTargets` with labels: the swara for a melakarta (`S R2 G3 ...`), else the JI ratio (`kind 'ji'`) or the 12-EDO interval name (`'edo12'`). The cents are exactly those of `scaleTargets`.
- `fmtSigned(x, dp=1)`: rounds first, `+13.7`, `-2.0`, and `0.0` (never `-0.0` or `+0.0`). `vsJI(c, oddLim, repC)` = `ratio + ' ' + fmtSigned(err)`, e.g. `5/4 +13.7`, `3/2 0.0` (the field table column; measured from 1/1, unlike the strip which measures from the mode root).
- `semitoneTargets(repC)`: `[{c: k*100, label}]` for every k with `k*100 < repC` (the 12-EDO reference of the strip, measured from the mode root; a 3/1 repeat gives 20 targets). Labels are the interval names `P1 … M7` for k < 12, then `"k st"`.

## Retuner (M2)

Behavioural parity with Infinitone 2's Auto Retuner (reverse-engineered notes: the Infinitone repo's `notes/AUTORETUNER.md`),
not code parity. The engine is pure: the UI resolves held keys to degrees (`nearestDegree`), calls `retuneStep`, then
applies `bases` and `chosen` and glides the sound.

**Data.** A card is `{name, notes, rep, base, home?}`: `notes` are the degrees above the root (`notes[0]` = 1/1), `rep` the
repeat, `base` the card's root as `{m, c}` (cents above `refHz`, default `REF_HZ` = middle C; `m` is the exact monzo when
known, `null` for EDO notes). A held note is `{key, deg, oct, t}`: keyboard note number, degree and octave (repeats above the
root) **in the active card**, and note-on time.

**Pivot (`pickPivot(held, mode)`).** `lowest` / `highest` = smallest / largest `key`; `recent` = latest `t`; `longest` = earliest
`t` (ties on `t` go to the lower key); `manual` returns `null` from `pickPivot` (the user names the degree). In `retuneStep`, Manual uses `opts.manualDeg`, a
degree that need not be held (as in Infinitone); `opts.manualKey` (a held key whose degree is used) is accepted as an
alternative, and `manualDeg` wins if both are given. `why.pivot` has no `key` for a `manualDeg` pivot. As in Infinitone, the caller decides *which* held set is considered: to keep the note that
was already sounding, pass the set from before the new note-on.

**Degree lookup.** `degreeOf(card, cents, tol = 0.02)` finds the degree at `cents` above the card's root (reduced into the
repeat; the repeat itself is degree 0 of the next octave) or `null`. `nearestDegree(card, hz, {metric, refHz})` reduces `hz` into
the repeat above the card's root and returns `{deg, oct}`: metric `ratio` (Infinitone, default) compares linear frequency
ratios inside the repeat and never wraps (an assumption: it is unknown whether Infinitone cards include 2/1). Linear distance
favours the LOWER of two neighbouring degrees (the linear midpoint lies above the geometric mean); `cents` compares cents and may wrap to degree 0
of the next repeat. Ties: lowest degree.

**Re-root (`rerootCards(cards, refIdx, D)`).** `base(C) = base(R) * ratio_R[D] / ratio_C[D]`, with R the reference card and D the
pivot degree (the same index in every card). The pivot therefore keeps its absolute pitch in every card (within 1e-9 c). R keeps
its base. The base is computed on monzos when all parts are exact (so the result is an exact ratio and `c` is recomputed from it,
e.g. a 9/8 against a 10/9 gives exactly 81/80); otherwise on cents. A card with no degree D gets `null` (not a candidate).

**Freestyle vs Fixed (`opts.anchor`).** Freestyle: R = the active card, so each modulation starts from where you are now and the
bases random-walk (comma drift). Fixed: R = card 0, so every candidate is derived from the home scale, which never moves; card 0
is never a candidate (its prediction is empty, its score `EMPTY_SCORE` = 999999). Fixed therefore needs a second card.

**`retuneStep(state, opts)`.** `state = {cards, active, held}`; `opts = {pivotMode (default longest), manualDeg, manualKey, anchor (default
freestyle), scorer (default: the parity scorer), refHz}`. Steps: pick the pivot; re-root; predict the chord in each candidate card
as `refHz * 2^((base.c + notes[deg].c + oct * rep.c) / 1200)` for each held note; score each prediction (`scorer(freqs, cardIndex)`
returns a number or `{score, detail}`; a non-finite score counts as `EMPTY_SCORE`, so a NaN cannot win); choose the lowest score, **ties to the lowest index**. A card that lacks a degree the chord
uses is not a candidate. With no pivot (manual with neither `manualDeg` nor a held `manualKey`), nothing held, or no candidate, the active card is kept
and `why.reason` says why (`bases` unchanged).
Result: `{bases, predictions (Hz per card), scores, chosen, drift, why}`.
- `drift = {m, c}`: new base of the chosen card minus its `home` (default: its base before the step), so a comma shows as a
  monzo/ratio (81/80 = `{2:-4, 3:4, 5:-1}`) and `c` is its size in cents. Callers that keep cards between steps set `home` once.
- `why = {pivot: {key, deg, mode} | null, reference, anchor, tieBreak, reason?, entries}`; each entry
  `{card, name, eligible, base, predicted (Hz), score, detail, rank (1 = best, null if not eligible), chosen}`.

**Parity scorer (`scorePeriodicityInfinitone(freqs, {dur = 0.1, sr = 44100, bins = 100})` -> `{score, detail}`).** Sum the chord as
complex sines of amplitude 1/N (pure sines, no harmonics) for t = 0 ... dur at 1/sr steps (phase accumulated in float32), lay a
bins x bins grid over [-1, 1]^2 and count the cells visited; `score` = that count (lower = more periodic = more consonant), `detail`
= `{cells, samples, dur, sr, bins}`; empty chord = 999999. Reproduces the measured counts at 220 Hz exactly: single note 374, 3/2
634, 12-EDO fifth 1390, 4:5:6 901, 12-EDO major 2805, 4:5:6:7 771, 12-EDO dom7 2623, 10:12:15 1996, 12-EDO minor 2850, 45/32 3275.
**Pitch bias (kept on purpose):** the window is fixed, so the score depends on register. Below about 40 Hz a 4:5:6 chord's common
period exceeds 0.1 s, the curve cannot close and the chord scores *better* (4:5:6 at 20 Hz: 478; at 55 Hz: 896; at 440 Hz: 889);
12-EDO major is 1090 at 55 Hz against 2948 at 440 Hz, so tempered and just chords are hard to tell apart in the bass; above a few
hundred Hz the curve is sampled sparsely and counts rise (880 Hz: 950, 1760 Hz: 1037). This is also why the default scorer of the
lab will be the roughness scorer (M3).


## Scorers

Every scorer takes a chord and returns `{score, detail}`; **lower = more consonant**. An empty chord scores 999999 (`EMPTY_SCORE`);
a single note is a real chord of one tone. Each scorer has its own scale, so compare ranks between scorers, never raw numbers, and
compare chords with the same number of notes (roughness and the periodicity counts grow with note count; the retuner always
compares predictions of the same held chord). The four scorers:

1. **Parity (`scorePeriodicityInfinitone`)**: Infinitone's own method, kept for behavioural parity (see above). Its window is a fixed
   0.1 s, so the verdict depends on register.
2. **Pitch-fair periodicity (`scorePeriodicityFair(freqs, {periods = 44, samplesPerPeriod = 100, bins = 100})`)**: the same
   "does the sum of the sines retrace itself?" idea, but the window and sampling step are measured in periods of the chord's
   *lowest* note (44 periods, 100 samples per period: Infinitone's 0.1 s at about 440 Hz). Multiplying all frequencies by k leaves the
   sampled phases unchanged, so the score is identical at every register by construction (4:5:6 gives the same count at 55, 220 and 880 Hz). Example: 4:5:6 = 362 cells against
   12-EDO major = 2942, at any root. Choice: lowest note, not common period, because irrational (EDO) chords have no common period.
3. **Lattice (`scoreLattice(notesOrHz, {oddLimit = 9, centsPenalty = 0.05})`)**: how far apart the chord's tones sit on the
   just-intonation lattice. For every pair of tones take their interval (reduced into one octave, so open and close voicings match) and
   its Tenney height log2(n*d) (the "size of the ratio": 3/2 = log2 6 = 2.58, 5/4 = log2 20 = 4.32, 6/5 = log2 30 = 4.91); the score is the
   mean over all pairs. Example: 4:5:6 has pairs 5/4, 6/5, 3/2 so (4.32 + 4.91 + 2.58) / 3 = 3.94, and 10:12:15 has the same three
   pairs (6/5, 3/2, 5/4) so it scores the same: major and minor triads are equally "far" on this measure. Notes with monzos give exact
   ratios and pay no penalty. Notes without (EDO steps) and plain Hz are explained by the candidate ratio within `oddLimit` with the
   **lowest cost = Tenney height + centsPenalty x |error in cents|** (default 0.05 bits per cent). This is a trade, not
   nearest-then-penalty: 12-EDO's 300 c minor third is 15.6 c from 6/5 (cost 4.91 + 0.78) but 10.8 c from 13/11 (cost 7.16 + 0.54), so it
   is explained as 6/5, and the score is continuous in the pitches (no jump when a pair drifts past a halfway point). With
   `centsPenalty = 0` the nearest ratio by cents is used (otherwise every pair would be read as 1/1), so 12-EDO major then ties 4:5:6.
   Hz input only sees ratios within `oddLimit`: 45/32 given as Hz is read as a cheaper neighbour near 7/5 (or the like), so give exact
   notes for the true height. Hz values that are not positive finite numbers are ignored. `detail.pairs` lists each pair's ratio, height,
   error and cost; `i` and `j` are the input indices of the pair's lower and upper tone.
4. **Roughness (`scoreRoughness(freqs, {harmonics = 7, rolloff = 0.88, amp = 'min'})`, the lab's default)**: how much the partials
   of the chord beat against each other. Each tone gets `harmonics` overtones at k*f with amplitude rolloff^(k-1) (Sethares' sample
   spectrum), and the Plomp-Levelt roughness (the curve ear tests gave: two close partials beat harshly, identical or far apart ones
   do not) is summed over every pair of partials of every tone, same-tone pairs included. The per-pair formula is Sethares': with
   f1 <= f2, `d = 5 * min(a1, a2) * (exp(-b1*s*(f2-f1)) - exp(-b2*s*(f2-f1)))`, `s = d* / (s1*f1 + s2)`, with b1 = 3.51, b2 = 5.75,
   s1 = 0.0207, s2 = 18.96, d* = 0.24, and the factor 5 (his C1 = 5, C2 = -5) (William A. Sethares, *Tuning, Timbre, Spectrum, Scale*, 2nd ed., 2005; his `dissmeasure.m`,
   https://sethares.engr.wisc.edu/comprog.html). The amplitude rule is the minimum of the two amplitudes (2005 model);
   `amp: 'product'` gives the older 1994 rule. With this timbre a sweep of two tones has minima at 1/1, 6/5, 5/4, 4/3, 3/2, 5/3 and 2/1
   (and also 7/6, 7/5, 7/4, because the timbre has a 7th harmonic), within 1 cent. Example: 220 + 330 Hz (a fifth) = 1.16 (whole-chord score, own partials included); 220 + 233 Hz
   (a semitone) is far rougher. `detail.pairs` and `detail.self` hold each tone-pair's and each tone's own contribution.

`compareScorers(chords: {name, freqs, notes?}[], scorers: {name, score(freqs, notes?)}[])` returns `{scorers, rows: [{name, scores, ranks}]}` (rank 1 =
lowest score in that column, ties share a rank): the table the "why" views and the tests use.

The comparison tests include the La Monte Young *Well-Tuned Piano* chords as exact ratios, from Kyle Gann, "La Monte Young's The
Well-Tuned Piano", *Perspectives of New Music* 31/1 (Winter 1993), pp. 134-162, Examples 10-12 (supplied by the human, not
re-checked against the article): Opening Chord 4:6:7:8:9:12; Magic Chord 81:84:108:112:144:162:192:216; Romantic Chord
48:54:56:64:72:81:84; Gamelan Chord 42:54:64:81; Tamiar Dream Chord 14:18:24:27; 189/98 Lost Ancestral Lake Region 12:14:18:21:24:27;
The Brook 12:14:16:18:21; The Pool 128:144:147:192:224. Each is rooted so its lowest term is 220 Hz.
