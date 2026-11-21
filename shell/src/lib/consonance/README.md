# consonance

Pure TypeScript scoring of how a chord sounds, computed at the **real pitch** of every note: three scores
(interference, periodicity, harmonicity), their per-relation and per-note decomposition, and the helpers that combine them
for ranking. No React, no DOM, no fs (the tests read the CC0 datasets with `node:fs`; the library never does). Built for
the Interval Placement arc (`arcs/interval-placement`) and meant to be usable later as a voicing scorer in the
Composition Workbench.

Inputs are **absolute frequencies in Hz** plus a timbre. A voicing is `{refHz, cents[]}` (decision I-2): cents above an
absolute reference pitch; EDO steps are only an input convenience (`voicingFromSteps(refHz, steps, edo)`). Nothing
assumes 12-EDO: the same functions score 12-, 19- and 31-EDO chords, just intonation, or any cents.

Each score is reported on its own. They are combined only at the very end, for ranking (`standardise`, `combine`,
`paretoFront`). Scores describe what the relations sound like; they impose no orchestration rules.

Import from the barrel (`./index`, or `@/lib/consonance`).

## API

| function | returns |
| --- | --- |
| `timbre({partials, rolloff})`, `timbreFromAmps(amps)`, `DEFAULT_TIMBRE`, `TIMBRES` | a `Timbre`: amplitudes of harmonics 1..n. Parametric: harmonic n has amplitude `1 / n^rolloff` (the `hrep` convention). `DEFAULT_TIMBRE` = 11 harmonics, roll-off 1 (the `incon` default). The timbre drives interference only. `TIMBRES` = presets named after the page's playback timbres: `sine` (exact), `triangle` (odd harmonics at 1/n², exact), `piano` (the `sonify.ts` list, exact), `guitar` (a Karplus-Strong pluck has no fixed spectrum: approximated as 10 harmonics at 1/n^1.5) |
| `interference(freqsHz, timbre?, {model, mergeCoincident, decompose})` | `{model, total, worst, dyads, self, perNote}`. `model`: `'hutchinson-knopoff'` (default) or `'sethares'` |
| `periodicity(freqsHz, {toleranceCents})` | `{value, ratios, d}`: smoothed log2 periodicity (lower = simpler) and the approximating ratio chord from the lowest note, ascending, e.g. `[4, 5, 6]` |
| `harmonicity(freqsHz, {space, harmonics, rho, sigma, candidateOctaves})` | `{value, virtualPitchHz, space}`: KL divergence of the template-fit profile from uniform, bits (higher = more harmonic). `space`: `'pitch-class'` (default, faithful har18) or `'pitch'` (this arc's extension) |
| `scoreVoicing(voicing, opts)` | all of the above for a `{refHz, cents[]}` voicing: `{freqsHz, interference: {hutchinsonKnopoff, sethares}, periodicity, harmonicity: {pitchClass, pitch}}`, each with `perNote` marginals (periodicity and harmonicity too) unless `decompose: false` |
| `flatScores(scores)`, `SCORE_KEYS`, `SCORE_SENSE` | the headline numbers as one record (`interference`, `interferenceSethares`, `worstRelation`, `periodicity`, `harmonicityPc`, `harmonicityPitch`) and which direction is better for each |
| `perNoteMarginal(freqsHz, score)` | `score(all) − score(all without note i)` for each note |
| `standardise(xs)` | z-scores (sample sd, like R's `scale()`); a constant list gives zeros |
| `combine(columns, weights)` | weighted sum of standardised score columns, one value per candidate (higher = better) |
| `inconComposite({interference, harmonicity, chordSize?}, {chordSize?})`, `inconCompositeOfFreqs(freqsHz, opts)`, `INCON_COEFFICIENTS` | the published composite of Harrison & Pearce (2020) on RAW values: 0.628 − 1.620·roughness (H&K `total`) + 1.780·harmonicity (pitch-class), plus 0.422·(distinct pitch classes) only with `{chordSize: true}`. The culture term (−0.089) is omitted (no corpus model here) |
| `EQUAL_WEIGHTS` | weights for ranking on z-scores: `{interference: −1, periodicity: 0, harmonicity: +1}` (the standardised analogue of the composite, see "Combining and ranking") |
| `pairwise(freqsHz, timbre?, {model})` | `{matrix, worst}`: every pair of notes scored ALONE at its real register (isolated dyads, for the Relations view) |
| `paretoFront(points, senses?)` | indices of the non-dominated points; `senses[k]` is `'min'` (default) or `'max'` per axis |
| `voicingHz`, `voicingFromSteps`, `centsToHz`, `hzToCents`, `midiToHz`, `hzToMidi` | pitch helpers (A4 = 440 Hz) |
| `buildSpectrum`, `hutchG`, `hutchGOfY`, `hutchCbw`, `setharesPair`, `hutchRoughnessOfPartials`, `setharesRoughnessOfPartials`, `fraction`, `rationalInterval` | the building blocks, exported for the visualisers and the tests |

### Decomposition (the "relations view")

`interference(...)` returns `dyads`, a symmetric n × n matrix (input order): `dyads[i][j]` is the contribution of the
partials of note i against those of note j **to the whole chord's total**, at their real register.
Precisely, for Hutchinson & Knopoff each entry is per unit of the *whole chord's* energy (the denominator Σa² is the chord's, not the pair's), so entries
shrink as notes are added, and they sum to `total`. Where partials of different notes coincide and are merged, the merged partial's
contribution is redistributed to its source notes in proportion to their squared amplitudes. `perNote` is a marginal, so it can be negative:
removing a note can raise the energy-normalised total (H&K) when that note was mostly smooth against the rest. For each pair judged on its own, as
an isolated dyad, use `pairwise` (what the Relations view should show as "how rough is this relation"). The diagonal is 0 and
each note's own internal term is `self[i]`, so `total = Σ_{i<j} dyads[i][j] + Σ self` (to floating-point precision; the
tests check ≤ 1e-9 relative, with and without merging coincident partials). `worst` is the largest off-diagonal entry. `perNote[i]` is the marginal contribution:
`total − total of the chord without note i`. Periodicity and harmonicity have the per-note marginals only (`scoreVoicing`),
because they are properties of the whole chord, not sums of pairs.

## Models

### Interference

Sums a dyadic roughness curve over every pair of partials of every note (same-note pairs included, as the originals do).
Notes get the timbre's harmonics at `n·f`; partials of different notes within 1e-6 semitone are merged (`mergeCoincident`,
default true, as `hrep::expand_harmonics` does) into one partial of amplitude √(a² + b²) (incoherent sum). Register
matters through the critical bandwidth: there is **no register damping and no compound-interval relief**; both effects
emerge from the curves.

- `hutchinson-knopoff` (default; one of the three best-performing models in Harrison & Pearce's (2020) evaluation and the interference term of their composite, who report that later interference models generally performed worse): Hutchinson & Knopoff (1978), in Mashinter's (2006) implementation as in `dycon::roughness_hutch`.
  g(y) = ((y/0.25)·exp(1 − y/0.25))², y = frequency gap / (1.72 · mean^0.65) in critical bandwidths, 0 for y > 1.2; pair weight
  = a₁·a₂; the sum is divided by Σa². **The score is roughness per unit energy** (bounded, comparable across chord sizes);
  perceived roughness of a loud chord is not modelled.
- `sethares`: Sethares (1993) with the minimum-amplitude pair rule of Sethares (2005) and Weisser & Lartillot (2013), parameters
  a = 3.5, b = 5.75, s₁ = 0.021, s₂ = 19, d* = 0.24 (`dycon::dyad_roughness_seth`), **not** normalised, so it grows with note count. Its
  bandwidth scaling is Sethares' own fit s(f) = d*/(s₁f + s₂), not an ERB. Matches `dycon`'s MATLAB regression values.

Known simplifications: sinusoidal partials of constant level (no loudness, masking, phase, audibility cut-off or beat
interaction), equal level for every note, no partial beyond the timbre's harmonics.

### Periodicity

Stolzenburg (2015), as `stolz15::smooth_log_periodicity`: each interval of the chord is approximated by the simplest
fraction within about 1.1 % (the just-noticeable pitch difference; "rational tuning II") using the paper's Stern-Brocot search, with the octave
kept; the relative periodicity from one note is the lcm of the denominators (times the first ratio); the score is the mean
over every note as the reference of log2 of that period. `ratios` is the chord relative to its lowest note as small integers
("4:5:6"). It reproduces all 2048 rows of `incon`'s Stolzenburg regression table (a sample is in `references.test.ts`).
Repeated pitches (within 1e-6 semitone) are dropped first, as `hrep::pi_chord` does. Octave placement matters: M10 (5/2) scores 1, M3 (5/4) scores 2; m9 equals m2 (32/15 and 16/15 share the denominator).
`toleranceCents` is honoured (default about 18.9 c = 1.1 %); the R code ignores its tolerance argument and always uses 0.011.
Known simplification: independent of register by construction (it is a ratio property); register enters through interference.

### Harmonicity (harmonic template / virtual pitch)

Milne's spectral template method as in Harrison & Pearce (2018), ported from `har18` and `hrep`: each note becomes its first
`harmonics` harmonics weighted 1/n^ρ and smeared with a Gaussian (σ = 6.83 cents) on a 1-cent grid; a harmonic template is
swept over the spectrum, the cosine similarity at each candidate virtual pitch is normalised to a distribution, and the score
is its KL divergence from the uniform distribution in bits. A chord that fits one virtual pitch sharply scores high; there is
no 1/n floor (the artefact of the v2 draft, where every n-note chord read 1/n at best). `virtualPitchHz` is the best-fitting candidate.

**The template is a fixed perceptual model, not the playback timbre**: 11 harmonics, ρ = 0.75 (what `incon`'s `har_19_composite` passes: 11 harmonics, roll-off 1 mapped to ρ = 0.75 × 1), σ = 6.83. A sine
playback must not turn the listener's virtual-pitch template into a sine (that collapsed every chord to a function of its note count). Override
only with explicit `harmonicity` options; the stand-alone `har18` defaults are 12 harmonics, ρ = 0.75 (`{harmonics: 12}`).
The implementation sweeps the sparse partials instead of the dense 1200 × 1200 loop, which gives the same numbers to rounding error
(tests compare it with a dense re-implementation of the R code and with `har18`'s own reference table).

Two spaces:

- **`space: 'pitch-class'` (default): the faithful `har18` model.** One-octave circular axis, so the score is octave-blind: C-E-G scores the
  same in every voicing. Reproduces the published numbers.
- **`space: 'pitch'`: THIS ARC'S EXTENSION, not a published model.** The same template method on absolute pitch: linear log-frequency
  axis (no wrap-around), candidate virtual pitches in a fixed-width window anchored on the lowest note (`candidateOctaves`, default
  four octaves below to one above, so the KL reference is the same for every chord). Octave placement now changes the spectrum
  (M10 and M3 differ). Values are on their own scale (not comparable to the pitch-class numbers) and the model has not been validated
  in the literature; `validation.test.ts` reports it beside the faithful one. Like the original it is transposition-invariant (on the 1-cent grid: exactly for whole-cent shifts, to rounding error otherwise): register enters through interference.

## Combining and ranking

Two different things, kept apart:

- **The published composite (raw values).** Harrison & Pearce (2020, Table 2) report −1.620 (roughness) and +1.780 (harmonicity) as
  **unstandardised** coefficients, applied to raw feature values with an intercept (0.628), the number of distinct pitch classes (0.422) and a culture term (−0.089):
  `inconComposite({interference: H&K total, harmonicity: pc})`. The chord-size term is off by default, as in `incon` (it is thought to come from a confound in the Bowling data); the culture term is omitted here.
- **Ranking a candidate set.** `standardise` each score within the set and `combine` with weights. The paper describes the *standardised*
  coefficients (its Fig. 2C) as broadly similar across features, so the preset `EQUAL_WEIGHTS` is `{interference: −1, harmonicity: +1}` with periodicity 0 (it is not in the
  published composite; raise it if you want it to count). `INCON_COEFFICIENTS` must not be used on z-scores.

`paretoFront` finds the voicings nothing beats on both chosen axes.

## Validation

`validation.test.ts` prints Spearman correlations of each score with listener ratings (Bowling, Purves & Gill 2018: all 12-TET dyads, triads and tetrads
with the exact Hz played; Johnson-Laird, Kang & Leong 2012: triads and tetrads in several registers) and asserts only a sanity
floor (including the Johnson-Laird floors for interference, pitch-class harmonicity and the composite). The composite row uses the faithful raw `inconComposite`. `comparisonTable.test.ts` prints every score for about 18 reference chords. Run `vitest run src/lib/consonance --reporter=verbose` to see the printed tables (the default reporter hides console output of passing tests).
`references.test.ts` reproduces the reference implementations' own test values and README numbers (each expected number is commented with where it comes from).

Known deviation from the ARC (orchestrator decision recorded in the ARC): the default model (Hutchinson-Knopoff, 11 harmonics) has no local minimum between 280 and 340 c on the
dyad curve at 220 Hz (a shoulder only); a minimum near 6/5 appears with 6-8 harmonics. The Sethares curve has all seven expected minima. Both facts are tests in `consonance.test.ts`.

## Credits and licences

The models are ported from these R packages by Peter M. C. Harrison, all MIT licensed, "Copyright (c) 2018 Peter M. C. Harrison":
`dycon` (https://github.com/pmcharrison/dycon: Hutchinson & Knopoff, Sethares), `stolz15` (https://github.com/pmcharrison/stolz15: periodicity),
`har18` (https://github.com/pmcharrison/har18: harmonicity), `hrep` (https://github.com/pmcharrison/hrep: harmonic expansion and the
pitch-class spectrum construction) and `incon` (https://github.com/pmcharrison/incon: defaults, composite coefficients, regression data).
The TypeScript code is a re-implementation of their behaviour, not a copy of the R code; the MIT notice applies to the ported algorithms:

> MIT License. Copyright (c) 2018 Peter M. C. Harrison. Permission is hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions: the above copyright notice and this permission notice shall be included
> in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

The datasets in `data/` are CC0 (`inconData`; see `data/SOURCE.md`).

## References (each checked against the reference packages' `DESCRIPTION`, README, man pages and `inst/REFERENCES.bib`)

- Hutchinson, W., & Knopoff, L. (1978). The acoustic component of Western consonance. *Journal of New Music Research*, 7(1), 1-29 (published as *Interface* at the time). https://doi.org/10.1080/09298217808570246
- Mashinter, K. (2006). Calculating sensory dissonance: Some discrepancies arising from the models of Kameoka & Kuriyagawa, and Hutchinson & Knopoff. *Empirical Musicology Review*, 1(2), 65-84.
- Plomp, R., & Levelt, W. J. M. (1965). Tonal consonance and critical bandwidth. *Journal of the Acoustical Society of America*, 38(4), 548-560. https://doi.org/10.1121/1.1909741 (the empirical curve both models approximate)
- Sethares, W. A. (1993). Local consonance and the relationship between timbre and scale. *Journal of the Acoustical Society of America*, 94(3), 1218-1228.
- Sethares, W. A. (2005). *Tuning, Timbre, Spectrum, Scale* (2nd ed.). Springer. (minimum-amplitude rule)
- Weisser, S., & Lartillot, O. (2013). Investigating non-Western musical timbre: A need for joint approaches. *Proceedings of the Third International Workshop on Folk Music Analysis*, 33-39.
- Stolzenburg, F. (2015). Harmony perception by periodicity detection. *Journal of Mathematics and Music*, 9(3), 215-238. https://doi.org/10.1080/17459737.2015.1033024
- Milne, A. J. (2013). *A computational model of the cognition of tonality*. PhD thesis, The Open University. (harmonic template / virtual pitch)
- Milne, A. J., & Holland, S. (2016). Empirically testing Tonnetz, voice-leading, and spectral models of perceived triadic distance. *Journal of Mathematics and Music*, 10(1), 59-85. https://doi.org/10.1080/17459737.2016.1152517 (σ = 6.83, 12 harmonics, ρ = 0.75)
- Harrison, P. M. C., & Pearce, M. T. (2018). An energy-based generative sequence model for testing sensory theories of Western harmony. *Proceedings of the 19th International Society for Music Information Retrieval Conference*, 160-167.
- Harrison, P. M. C., & Pearce, M. T. (2020). Simultaneous consonance in music perception and composition. *Psychological Review*, 127(2), 216-244. https://doi.org/10.1037/rev0000169 (composite model, Table 2 coefficients, as implemented in `incon`). Hutchinson & Knopoff's standing: one of the three best-performing models in their evaluation and the interference term of their composite; they report that later interference models generally performed worse. (Not in the reference packages; taken from the paper as read by the project orchestrator.)
- Bowling, D. L., Purves, D., & Gill, K. Z. (2018). Vocal similarity predicts the relative attraction of musical chords. *PNAS*, 115(1), 216-221. https://doi.org/10.1073/pnas.1713206115
- Johnson-Laird, P. N., Kang, O. E., & Leong, Y. C. (2012). On musical dissonance. *Music Perception*, 30(1), 19-35.
- Schwartz, D. A., Howe, C. Q., & Purves, D. (2003). The statistical structure of human speech sounds predicts musical universals. *Journal of Neuroscience*, 23(18), 7160-7168.

Not cited because the packages do not support them (or the code does not use them): Glasberg & Moore (1990) (this Sethares
option does not use an ERB); Terhardt (1982); McDermott, Lehr & Oxenham (2010); "Milne et al. 2011" (see the builder's report).
