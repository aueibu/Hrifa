# Ratio rhythm: timeline and canon

Nov 20, 2026 · @AB

## How to read this doc

This is the reference for our conversation on treating pitch ratios as rhythms: what was worked out, in order, and the settled form of every mechanism. Your questions, feedback and original ideas are marked **\[You\]** in the timeline and credited where they shaped the canon.

**This file is the source of truth** for the project (updated Nov 20, 2026, through timeline step 36). Where it disagrees with an older copy, the online version, or the earlier *JI Z-relation search: handoff* doc, this file wins. Run-level detail for the JI search lives in the repo next to the code, in `research/ji-z-partners/`: `HANDOFF.md` (current state, results tables, commands) and `ANALYSIS.md` (the 5-limit odd ≤ 123 analysis; it predates `zgen.py`).

- **Timeline**: the conversation in phases, with what each step produced.
- **Canon 1 to 6**: each mechanism stated once, in its corrected form.
- **Bounds, map, app**: the theorems, the pitch–rhythm dictionary, and what the Ratio rhythm lab implements.
- **Pitfalls**: only the corrections that were drastic or likely to recur.

Conventions used throughout: **L** is the ring size in slots, **k** the number of onsets, **slots** count from 0, **pulses** count from 1. The worked example, unless stated, is the scale 1/1 10/9 9/8 5/4 3/2 (ring of 72, onsets at slots 0, 8, 9, 18, 36).

## Timeline

The conversation moved from a single premise to a working app in 31 steps, most of them started by your questions or ideas (steps 24 to 31 follow the main table). Steps 32 to 36 are the JI search after that, run from the repo and the Google Cloud VM.

| # | Your input | What it produced |
| --- | --- | --- |
| 1 | **\[You\]** Premise: pitch is an audible rhythm (3:4:5 at 440 Hz is a sped-up polyrhythm); rhythm is the less explored side. | What transfers (ratios, Euclidean/maximally even sets, Z\_n geometry, lattices, beating) and where the analogy bends (perception regimes, octave equivalence, timbre). |
| 2 | **\[You\]** How many equally spaced positions does an arbitrary scale need? (1/1 7/6 25/19 13/6) | Two readings: ratios as positions (LCD grid) vs ratios as rates (LCM, 259,350 slots). |
| 3 | **\[You\]** Pitches on a ring are like impulses on a Euclidean necklace; so the grid is "just the LCM"? | For positions it's the LCD. Tatum, min IOI, maximal evenness introduced. |
| 4 | **\[You\]** Does this relate to commas? | Linear ring: slot steps are superparticulars. Log ring: commas are the rounding residue of tempering. |
| 5 | **\[You\]** Term for the smallest gap; your consolidated summary (granularity, IOI stats, oversampling). | Tatum vs min IOI; oversampling reframed as density; the GCD check. |
| 6 | **\[You\]** Worked examples: otonal vs log, tempering and its comma, a GCD-reducible ring. | The 72-ring example; 81/80 found by division and by vals. |
| 7 | **\[You\]** 12 vs 24 vs 7 slots; then: 53 as a structural meta-grid, counted 10 × 5 + 3. | Tempering is set by vals, not slot count; additive counting of prime cycles. |
| 8 | **\[You\]** Quantize 72 to 16 and measure the entropy of the conversion. | Shannon loss, displacement, exactness. |
| 9 | **\[You\]** Rotate the ring to each ratio to see modes and which attacks survive. | Rotation vs re-rooting split; the full mode × grid scan. |
| 10 | **\[You\]** Perceptual change is hard to quantify. | Toussaint distances, categorical perception, Weber rule, clock model, syncopation, all walked through on one beat at 120 BPM. |
| 11 | **\[You\]** Your top-down canon of the whole method. | Corrected canon (Canon 1 to 4 here). |
| 12 | **\[You\]** The fingerprint idea and its OEIS question. | Mode ring sizes; later proven a complete invariant. |
| 13 | **\[You\]** Catalog groupings top-down; a 5 + 3 split excludes 4 + 4 as a base unit. | Hierarchical compositions and Schröder counts; the Grouping trees app. |
| 14 | **\[You\]** Is the Euclidean rhythm the parent and measuring rule? Then: show references as a prism, and a navigable family tree. | Maximal evenness as the evenness zero point; Stern–Brocot parents; the lens design. |
| 15 | **\[You\]** Meter: score the 72 orderings and 53 additive groupings. "The key to unlocking rhythm." | The meter picks a side of the comma. |
| 16 | **\[You\]** Is there a Z-relation here, and what's the IV equivalent? | Rigidity of the linear ring; IV equivalents; adjacent step swaps. |
| 17 | **\[You\]** A pivot, like harmonic 5 of Fx becoming harmonic 9 of Fy? | Modes as sliding windows; pivot partials as metric modulation. |
| 18 | **\[You\]** Build the prism into the app; fold in the meter features. | Ratio prism tab with six lenses, then scale-to-meter, meter-to-scale and comparison. |
| 19 | **\[You\]** Is 53's lack of Z-partners just because it's prime? | Ring sweep 6 to 61 (and primes to 113); Spectrum lens with Z-partner search. |
| 20 | **\[You\]** Find Z-partners by adding an onset or moving the least. | The Z-partner finder. |
| 21 | **\[You\]** Canonical names: "slot + onsets is really all it is." | Gap-based names at three levels; the catalog. |
| 22 | **\[You\]** Odd limit should constrain ring size and minimum comma. | The bounds in this doc's Bounds section. |
| 23 | **\[You\]** Show magnitude vs phase better; render the waveform analogy; a rhythm grid; BPM. | Chord rings, arrow dials, audio, grid preview, tempo controls. |

| # | Your input | What it produced |
| --- | --- | --- |
| 24 | **\[You\]** What stays common between re-rooted modes? | Steps, interval content and odd-harmonic form are fixed; gaps change by the gap formula (Canon 3). |
| 25 | **\[You\]** Do all re-rootings share Z-partners? Is re-rooting lossy? | Not lossy: it changes the voicing. Three levels of Z-relation; linear-ring pairs share difference tones (Canon 6). |
| 26 | **\[You\]** Brute-force JI-level Z-partners. | The first JI Z-pairs (6 notes, 5-limit) and the search script `ji_zsets.py`. |
| 27 | **\[You\]** Scale every re-rooting's ring to the same duration. | Equal cycles vs equal pulse, which are parallel vs relative modes; both added to the app. |
| 28 | **\[You\]** A streamlined notation like "22.513" for the exact scale. | Root-first gap strings, with the barline form for a single token. |
| 29 | **\[You\]** 19-limit with 12 notes? | Exhaustive search is out of reach; the A + B construction and the targeted search make it unnecessary. |
| 30 | **\[You\]** Search EDOs up to 31 and odd-limit gamuts; then: "I don't think they exist at this low limit." | Odd-limit diamonds are Z-free at every size searched; Z-pairs need depth. |
| 31 | **\[You\]** Add 7, and push to 12 and 16 notes, locally and on Google Cloud. | Families collapse into a few shapes; counts follow the note count's factors. |

| # | Your input | What it produced |
| --- | --- | --- |
| 32 | **\[You\]** Analyze the cloud run: 5-limit, odd ≤ 123, 1 to 16 notes. | All 30,065 families validated, with an independent brute force through 10 notes. 15 notes spike (13,364), 16 stay high (1,875), 13 stays near zero (49). `ANALYSIS.md`. |
| 33 | (from the analysis) Why are some families "sporadic"? | **The factor law**: every family is P = U·V with partner U·V\*, one factor mirrored. "Sporadic" families are the same law with a signed factor (Canon 6). |
| 34 | Extend the search past 5-limit without brute force. | `zgen.py`: a disk-backed, resumable exhaustive search, a direct-sum generator, and **types** + **place**, which list the cancellation shapes symbolically and lay them into any gamut. |
| 35 | **\[You\]** Run 6 to 8 notes in 7- and 11-limit gamuts on the VM. | Counts up to 11-limit odd ≤ 123 (56, 40 and 29 families at 6, 7 and 8 notes); prime substitution; 7-note pairs need deep stacks of fifths. |
| 36 | **\[You\]** Is the old 7-limit odd ≤ 75 run still needed? | `place` reproduced its 8 families at 8 notes in 28 s against more than 306 min of brute force: the placement method is confirmed. |

## Canon 1: the ring

A ratio set becomes a rhythm by placing each ratio on a ring that is one equave long. How a ratio maps to a position is a choice, and there are three readings.

**Inputs.** An equave E (usually 2/1) and a ratio set reduced into \[1, E). The ring is one cycle.

**Linear (otonal) reading.** A ratio's position is how far along the number line from 1 to E it sits. For E = 2:

```latex
\text{position}(r) = r - 1, \qquad L = \operatorname{lcd}(\text{denominators}), \qquad \text{slot}(r) = rL - L, \qquad \text{ratio}(s) = \frac{L+s}{L}
```

The ring is harmonics L to 2L of a virtual fundamental, and the scale is a subset of them. Example: 72, 80, 81, 90, 108 (equave 144), so the scale exists starting from harmonic 72 and no lower. Durations are heard linearly, so this is the natural rhythmic reading.

**Log (pitch) reading.** Position = log base E of the ratio (cents ÷ 1200 for octaves). Positions are irrational, so there is no exact grid: you choose a ring size N and round. This reading lays the *tuning* out in time.

**Rates reading (polyrhythm).** Each ratio is a pulse rate. The common grid is the LCM of the integer form, which explodes quickly (1/1 7/6 25/19 13/6 needs 259,350 slots, only about 600 occupied).

| Ratio | Linear position | Slot (of 72) | Pulse | Log position |
| --- | --- | --- | --- | --- |
| 1/1 | 0 | 0 | 1 | 0 |
| 10/9 | 0.111 | 8 | 9 | 0.152 |
| 9/8 | 0.125 | 9 | 10 | 0.170 |
| 5/4 | 0.250 | 18 | 19 | 0.322 |
| 3/2 | 0.500 | 36 | 37 | 0.585 |

**Tatum and minimality.** The tatum is 1/L of the cycle, the finest grid every onset sits on. If the ratios are reduced, the GCD of the slots and L is automatically 1, so L is already minimal. The GCD check only matters for an integer ring handed to you: 24:28:32:36:44 on 24 slots reduces by 4 to 6:7:8:9:11 on 6.

**Onset statistics.** The gaps (IOIs) sum to L. Useful measures: min and max IOI, density k/L, oversampling (min IOI ÷ tatum), gap variance, number of distinct gap sizes, and distance from the maximally even rhythm. The mean IOI is always L/k, so it carries no information.

**Time scale.** Tatum rate = L ÷ cycle duration. Above about 20 Hz the grid itself becomes a pitch; to be counted as pulses it must stay below about 8 to 10 per second. **\[You\]** This is why a 53-pulse grid works best as a slow structural layer, counted additively (10 × 5 + 3), with each tatum a bar.

## Canon 2: tempering and quantization

Tempering (log reading) and quantization (linear reading) are the same operation, rounding onto a coarser grid, and both are judged by what merges and how far things move.

**Tempering on the log ring.** Round each log position to N equal steps. Two ratios that land on one step have had their comma tempered out; the comma is their quotient (9/8 ÷ 10/9 = 81/80). Test any comma with the ring's val (2 → N, 3 → round(N log₂3), 5 → round(N log₂5)): a sum of 0 means it vanishes. For 81/80 in 12 slots: 4·19 − 4·12 − 28 = 0.

| Ring | 10/9 and 9/8 | Why |
| --- | --- | --- |
| 7, 12, 17, 19, 24, 31 | Merge | 81/80 maps to 0 steps |
| 22, 29, 41, 53 | Stay apart | 81/80 maps to 1 step |

More slots doesn't guarantee separation (22 separates, 24 doesn't), and a multiple of 12 has 12's val, so 24 behaves like 12.

**Quantization on the linear ring.** Slot p goes to round(p·N/L) mod N. **\[You\]** Quantization is a conversion with measurable loss:

- **Collisions**: onsets that share a target slot.
- **Information lost**: H(source | target) = Σ (nⱼ/k) log₂ nⱼ, where nⱼ onsets merged into slot j. It measures how much merged.
- **Displacement**: total or RMS distance moved. It measures how far things drifted.
- **Exactness**: the fraction of onsets with zero error.

Example, 72 to 16: onsets land on 16-grid slots 0, 2, 2, 4, 8. 10/9 merges into 9/8 (moved 1/72 of the cycle), 0.4 bits are lost, and 4 of 5 onsets are exact. A binary grid is exact only for onsets at 2-power fractions of the cycle; 10/9 sits at 1/9.

**Which grids are lossless.** N is exact only if it is a multiple of L ÷ GCD(slots, L), which for reduced ratios means a multiple of L. Below k slots, merges are guaranteed (pigeonhole), so a scan of grids runs from k up to L.

**When does a close pair survive?** Rounding boundaries sit at (j + ½)·L/N. A pair separates exactly when a boundary falls strictly between them. For a pair anchored on the downbeat (slots 0 and d):

```latex
\text{the pair survives} \iff N > \frac{L}{2d}
```

This predicted the scan exactly: the 10/9 mode (L = 80, d = 1) needs N ≥ 41, and the 9/8 mode (L = 81, d = 2) needs N ≥ 21.

**Tie rule.** Some positions land exactly on a half-step. Count a grid as keeping a pair only if it does so with halves rounded both up and down; several apparent small-grid wins (every odd grid for the 3/2 mode) fail this.

**Grids that keep all five onsets in every mode** of the example: 46, 48, 54, 55 to 58, 61 to 67, 69 to 72. 53 works only if ties round up.

## Canon 3: modes, fingerprint and pivots

On the log ring a mode is just a rotation, but on the linear ring rotating and re-rooting are different operations, and that difference drives most of the later results.

**Two kinds of mode.** **\[You\]** proposed rotating the ring to each ratio to see each mode.

- **Rotation (rhythmic mode)**: shift every slot by a constant. Gaps keep their cyclic order. There are L shifts, k of them starting on an onset.
- **Re-rooting (pitch mode)**: divide every ratio by a new root and octave-reduce. Each mode gets its own LCD, so its own ring. On the linear ring this rescales as well as shifts, which makes it closer to metric modulation than to rotation.

The operation is classical (Ptolemy's intense diatonic rooted on its second degree gives the 40/27 fifth, which appears in the 3/2 mode below); "pitch mode" was our label, "re-rooted mode" is clearer. Precedents for the whole project: Cowell's *New Musical Resources* and Rhythmicon (harmonic series as rhythm), Stockhausen's tempo scales (the log reading).

| Root | Re-rooted ratios | Ring | Gaps |
| --- | --- | --- | --- |
| 1/1 | 1, 10/9, 9/8, 5/4, 3/2 | 72 | 8, 1, 9, 18, 36 |
| 10/9 | 1, 81/80, 9/8, 27/20, 9/5 | 80 | 1, 9, 18, 36, 16 |
| 9/8 | 1, 10/9, 4/3, 16/9, 160/81 | 81 | 9, 18, 36, 16, 2 |
| 5/4 | 1, 6/5, 8/5, 16/9, 9/5 | 45 | 9, 18, 8, 1, 9 |
| 3/2 | 1, 4/3, 40/27, 3/2, 5/3 | 54 | 18, 8, 1, 9, 18 |

**The fingerprint.** **\[You\]** asked what the vector of mode ring sizes (72, 80, 81, 45, 54) is. Results:

1. A mode's ring size is its root's harmonic number with some factors of 2 removed; the odd part never changes (no odd prime can divide every numerator of a reduced set).
2. Odd parts are pitch classes, since harmonics with the same odd part are octaves. So a scale, up to mode, *is* a set of odd numbers with no common factor: its **odd-harmonic form**, here {5, 9, 27, 45, 81}.
3. Therefore the fingerprint is a **complete invariant**: it determines the scale. A search of about 46,000 scales found no collisions, as the proof requires. It's the opposite of Forte's interval vector, which discards information.

The fingerprint also ranks mode complexity: the 5/4 mode (45) sits lowest in the harmonic series, the 9/8 mode (81) highest.

**Pivots.** **\[You\]** asked for the equivalent of a pivot partial (harmonic 5 of Fx = harmonic 9 of Fy). Two versions:

- **Between modes**: hold the tatum fixed and every mode is a one-octave window on one harmonic series. The gaps along it form a master sequence, 8, 1, 9, 18, 36, 16, 2, 18, 36, 72, and each mode is five consecutive gaps. Overlapping windows share identical fragments: 9, 18, 36 belongs to the 1/1, 10/9 and 9/8 modes, so playing it lets the cycle continue as 72 or 81 tatums. The pulse never changes; only the cycle length does.
- **Between scales**: a shared pulse rate links two tatums by the pivot ratio. "5 of Fx = 9 of Fy" means a pulse dividing cycle X into 5 divides cycle Y into 9, so Y is 9/5 as long. That is Carter's metric modulation.

For pivoting, use unhalved harmonics (90 and 108 rather than 45 and 54), so every mode shares the tatum.

**What re-rooting keeps.** **\[You\]** asked what stays common between re-rooted modes. Identical in every mode: the cyclic sequence of step ratios (10/9, 81/80, 10/9, 6/5, 4/3 for the example, started from a different note), all pairwise interval content, and the odd-harmonic form. What changes is each gap, by a predictable factor:

```latex
\text{gap (fraction of cycle)} = (\text{step} - 1) \times \text{height of the lower note above the root}
```

| Root | The 81/80 step in that mode | Lower note's height | Gap |
| --- | --- | --- | --- |
| 10/9 | 1/1 → 81/80 | 1 | 1/80 (1 slot of 80) |
| 5/4 | 16/9 → 9/5 | 16/9 | 1/45 (1 of 45) |
| 3/2 | 40/27 → 3/2 | 40/27 | 1/54 (1 of 54) |
| 1/1 | 10/9 → 9/8 | 10/9 | 1/72 (1 of 72) |
| 9/8 | 160/81 → 2/1 | 160/81 | 2/81 (2 of 81) |

In the mode rooted on a step's lower note, the first gap is exactly step − 1, which is the "doorway" effect behind the min-IOI Z-collisions in Canon 6.

**Putting every re-rooting on one time span.** **\[You\]** asked how to scale each mode's ring to the same duration. Two conventions:

- **Equal cycles** (parallel modes): every mode's cycle lasts the same time, so each ring's slots stretch or shrink to fit. Onset time = (ratio above the root − 1) × cycle length. A common integer grid is the LCM of the ring sizes (6,480 for the example). Like comparing modes on one tonic.
- **Equal pulse** (relative modes): the tatum stays at the virtual fundamental, so the mode rooted on ρ lasts ρ times as long as the 1/1 mode (72, 80, 81, 90, 108 tatums). Like one collection heard from different starting notes.

Converting equal pulse to equal cycles multiplies each mode's times by (longest root ÷ its root): a metric modulation by the interval between the roots, which undoes the transposition.

## Canon 4: grouping and meter

Groupings are catalogued as constrained compositions and as trees; meter assigns each pulse a weight; and the choice of meter decides which side of a comma is structural.

**Flat groupings.** Splitting L pulses into ordered groups is a composition; there are 2^(L−1). Constraining group sizes gives known catalogs: groups of 1 and 2 follow the Fibonacci numbers (Pingala's prosody), groups of 2 and 3 follow the Padovan numbers (aksak meters). 53 into 5s and 3s has exactly four mixes: 10 fives and 1 three, 7 and 6, 4 and 11, 1 and 16.

**Maximal evenness and the Stern–Brocot tree.** For k groups in L, the most even rhythm E(k, L) is unique up to rotation (Clough and Douthett), which makes it **\[You\]** the natural parent and measuring rule *for evenness* (other questions need other references; see the prism). Bjorklund's algorithm, the Euclidean algorithm, the continued fraction of k/L and the Stern–Brocot path to k/L are the same object, and the resulting pattern is a Christoffel word. Each node has two parents whose patterns it is built from:

- E(5, 53): parents 2/21 and 3/32; children 7/74 and 8/85.
- Its gaps are the right (larger) parent's gaps followed by the left parent's: (10, 11) + (10, 11, 11). Verified for all 1,886 fractions with denominator up to 80.
- Erv Wilson's scale tree is the same structure for MOS scales.

**Hierarchical groupings.** **\[You\]** proposed cataloguing top-down, where choosing 5 + 3 at the top excludes 4 + 4 as a base unit. That is a tree whose leaves are the bottom-level groups. The same surface can carry several trees: 2 + 2 + 1 + 3 is both (2+2+1) + 3 and (2+2) + (1+3). The number of bracketings of m groups is the little Schröder number (1, 1, 3, 11, 45, 197; OEIS A001003), or the Catalan number with binary splits only. Top-down and bottom-up enumeration reach the same total.

**Proximity grouping.** Merging the closest onsets first (Lerdahl and Jackendoff; Tenney and Polansky) gives a tree from the rhythm itself. On the 53 ring (gaps 8, 1, 8, 14, 22): (8 + (1 + 8) + 14) + 22, so the comma is the lowest level and the largest gap is the phrase boundary.

**Divisive meter.** Factor L into levels in a chosen order; a pulse's weight is the number of levels that start on it. Order is a musical decision. In 12 sixteenths: 3 × 2 × 2 is 3/4, 2 × 3 × 2 is 6/8, and 2 × 2 × 3 is 12/8 counted in eighths. A prime has no divisive hierarchy: only the downbeat and equal weak pulses. Additive groups restore internal structure (5 as 3+2 or 2+3; 7 as 2+2+3 and its rotations).

**Syncopation** (Longuet-Higgins and Lee): an onset scores the weight difference when a stronger pulse falls in the silence before the next onset.

**What meter does to the scale.** **\[You\]** called this the key to working fluidly with rhythm.

- On 72, the ten orderings of 2·2·2·3·3 run from syncopation 0 (2×2×2×3×3, binary first, because 3/2, 5/4 and 9/8 sit at 1/2, 1/4 and 1/8 of the cycle) to 8 (3×3×2×2×2, which makes 10/9 strong at 1/9).
- In every ordering one of 10/9 and 9/8 is weak: **the meter picks a side of the comma**, acting as a rhythmic temperament.
- On 53, the 10 × 5 + 3 family never drops below syncopation 5 with two-level weights, because 9 can't be reached by 5s and a single 3. The best groupings use 4 fives and 11 threes, for example 3 3 3 3 5 3 3 3 5 3 3 3 3 5 5, putting 9/8, 5/4 and 3/2 on group starts and 10/9 on the upbeat before 9/8.
- Practice suggestion: count additive groups with konnakol syllables (ta-ka, ta-ki-ta, ta-di-gi-na-tom) while tapping only the onsets.

## Canon 5: perception and comparison

Geometric measures say whether a rhythm changed; perceptual models say whether a listener would notice, and on the worked example they disagree.

**Merges and shifts are different kinds of change.** **\[You\]** framed the distinctions: a merge removes a hit (binary), but two onsets close enough already fuse into one thickened attack (a flam); a shift may or may not be audible depending on tempo; Shannon loss treats every onset as equally important, when losing the downbeat matters far more than losing an ornament; and shifting onto or off a strong grid position changes how settled a rhythm sounds.

**Three tiers of measure.** Exact math (ring, IOIs, quantization, Shannon, distances) needs only the ratio set. Parameterized algorithms (clock model, syncopation) need a chosen hierarchy. Empirical models (categories, Weber thresholds, fusion) need numbers measured from listeners.

**The measures:**

- **Hamming distance**: mismatched positions on a common grid. Ignores distance, so it can rate a tiny shift worse than a merge.
- **Swap distance**: total movement to turn one rhythm into another; **directed** swap distance handles merges. The natural fit for quantization.
- **Chronotonic distance**: area between the two rhythms' IOI step graphs; penalizes collapsing a short interval.
- **Categorical perception** (Desain and Honing): listeners snap timing to simple-ratio categories that depend on metrical context. Ask whether a change crosses a category, not whether anything moved.
- **Weber-like sensitivity**: a noticeable shift is a fraction of the local IOI, with an absolute floor of a few milliseconds for short intervals.
- **Clock model** (Povel and Essens): accents on isolated notes, the second of a pair, and the first and last of runs of three or more; a clock's counterevidence is 4 × ticks on silence + ticks on unaccented notes. The pair rule puts the accent on a flam's main note, as drummers play it.

**One beat at 120 BPM.** The example scale as one 500 ms beat: onsets at 0, 55.6, 62.5, 125 and 250 ms. On a grid of 1/64 of the beat (7.8 ms, technically 256th notes), they land on 64ths 1, 8, 9, 17 and 33, counting from 1. 10/9 and 9/8 form a 6.9 ms flam, too tight to hear as two hits; it opens to a clear flam only around 30 to 40 BPM.

| Measure | A: 16-grid (merge) | B: 1/64-beat grid (0.87 ms shift) |
| --- | --- | --- |
| Hamming | 1 | 2 (misleading) |
| Swap | 6.9 ms | 0.87 ms |
| Chronotonic | 772 ms² | 95 ms² |
| Category | 1:1:2:4, unchanged | 1:1:2:4, unchanged |
| Weber | Attack texture changes | Inaudible |
| Clock model | Eighth-note pulse, score 0 | Same |
| Syncopation | 0 | 0 |

The geometric measures see A as a real change; every perceptual and metrical model agrees neither changes the rhythm. A perceptual cost would combine category changes, shifts weighted by local IOI, merge penalties that vanish for flam-close pairs, and metrical weights, with parameters fitted by listening tests.

## Canon 6: Z-relations, Fourier view and names

Z-relations exist for rhythms exactly as for pitch sets once you use an all-pairs, rotation-invariant summary; the linear ring resists them, and names built from gaps make every set catalogable.

**The linear ring is rigid.** **\[You\]** observed you have to beg a Z-relation out by throwing away information. Tests on lossy summaries (scales with denominators up to 8 to 12, 3 to 5 notes):

- Each mode's gaps, in order or sorted: **no collisions** in about 11,000 scales (the sorted case is unproven).
- Each mode's smallest gap only: genuine collisions. Mechanisms: **swapping two adjacent steps** (re-rooting on either note trades the two modes' first gaps); arithmetic vs harmonic division of an interval is one case of this (4:5:6 vs 10:12:15), but only 24 of 465 such pairs collide; with 5 notes also non-adjacent rearrangements, and coincidences among near-unit-fraction gaps.

**The interval-vector equivalent, three versions:**

1. **On a fixed ring** (log reading or any grid): the count of every circular distance among all pairs of onsets, identical to the pitch IV. The 12-ring results match pitch-class theory ({0, 1, 4, 6} and {0, 1, 3, 7} are 4-Z15 and 4-Z29).
2. **On the ratios**: all pairwise intervals, octave-reduced, a ratio identified with its inversion. No Z-relations among 4- to 6-note sets from odd harmonics below 64; they exist but need size, e.g. the homometric pair {0, 1, 4, 10, 12, 17} and {0, 1, 8, 11, 13, 17} as counts of stacked 3/2s.
3. **On the linear ring**: the pairwise differences within one mode's window. It changes from mode to mode, so it is not a set invariant: the structural reason for the rigidity.

**Three levels of Z-relation.** **\[You\]** asked whether re-rooting is lossy and whether all re-rootings share Z-partners. Re-rooting keeps every pitch class and interval; what changes is the **voicing** (everything placed in the octave above the new root, as with chord inversions: 4:5:6, 5:6:8, 3:4:5). So the question splits into three levels:

| Level | Object | Z-partners share | Shared by every re-rooting? |
| --- | --- | --- | --- |
| JI (pitch-class) | Ratios up to octaves | All pairwise intervals | Yes |
| Log ring | Tempered steps | All step distances; usually inherited from the JI level | Yes (re-rooting is a rotation) |
| Linear ring | Ratios voiced above one root | All slot distances, which are **difference tones** between harmonics | No: specific to the root |

Example: the pair 1/1 10/9 9/8 89/72 3/2 7/4 \~ 1/1 9/8 89/72 5/4 3/2 29/18 is a Z-pair only on the 1/1 rooting's linear ring (72); the other five rootings (rings 80, 81, 89, 54, 63) have no partners. A linear-ring pair is two voicings with the same difference tones; 12-EDO set theory has no counterpart for it.

**The JI-level search.** **\[You\]** pushed for JI-level partners, which a brute-force search had not found at first. Settled results (run details, tables and commands are in `research/ji-z-partners/HANDOFF.md`):

- **Listing every JI Z-pair is impossible; checking one scale is easy.** A partner can only use the scale's own intervals, so a **targeted search** answers any specific scale completely, usually in under a second (a 19-limit 12-note pair took 0.3 s). The 5-limit JI diatonic and chromatic have no partners.
- **The factor law (one mechanism for every family).** Read a set as a polynomial in the prime-exponent lattice: the note 3^a·5^b·7^c is the term x^a y^b z^c. Two sets share interval content exactly when P·P\* = Q·Q\*, where \* mirrors every exponent (inversion). So the partner is P with some irreducible factors mirrored (Rosenblatt and Seymour). In all 30,065 families of the 5-limit odd ≤ 123 run, **exactly one factor is mirrored**: P = U·V and Q = U·V\* (or U\*·V), with both products using each note at most once. Every family has exactly two members. There are two kinds:
  - **Chord on roots** (both factors plain note sets): P = A + B, every note of chord A built on every root of B, and the partner is A + (−B), the same chord on the inverted roots. Both need at least 3 notes, so this builds only 9, 12, 15 and 16 notes, at any prime limit. It is 87% of the 5-limit families and the main usable device from 9 notes up.
  - **Cancellation** (one factor has minus terms, so notes cancel in the product): every family at 6, 7, 8, 10, 11, 13 and 14 notes, and the rest at 9, 12, 15 and 16. These were called "sporadic" before the factor law. The commonest signed factor is x³ − x² + 1, on the line of fifths ({1, 27/16} minus 9/8).
- **Depth over breadth.** Odd-limit diamonds (9, 11 and 13; many primes, shallow) have no Z-pairs at any size searched. Gamuts with stacked 3s and 5s (25, 27, 45, 75, 81) have many. The smallest JI Z-pairs have 6 notes. 7-note pairs need deep stacks of fifths (81); stacked 7s don't make up for it (7-limit odd ≤ 63 has only 2).
- **The note count's factors.** 5-limit, odd ≤ 123 (35 notes), all sizes 1 to 16:

  | Notes | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Families | 7 | 8 | 10 | 2,968 | 295 | 25 | 10,966 | 49 | 498 | 13,364 | 1,875 |

  Restricted to odd ≤ 75 the same data gives the earlier counts exactly (5, 1, 4, 1,108, 110, 0, 2,539 at 6 to 12 notes). Sizes that split as 3 × 3, 3 × 4, 3 × 5 and 4 × 4 spike; 13 stays near zero.
- **Shapes (types).** A type is one point pattern up to any change of lattice basis, so one type can lie along 3 & 5, 3 & 7, 3 & 11, or with commas as axes. 6 notes: 2 types, a single geometric shape (the canon's 1-D pair {0, 1, 4, 10, 12, 17} is it on one axis). 7 notes: 24 types, of which 18 are 1-D and 3 of the 2-D ones occur in JI. 8 notes: 102 types, of which 4 occur in 5-limit. **Prime substitution**: the same shape exists along 3 & 5, 3 & 7 and 3 & 11. This is why adding 7 raised the 6-note families from 5 to 20 with no new shape.
- **Beyond 5-limit** (counts at 6, 7 and 8 notes): 7-limit odd ≤ 27 (45 notes): 3, 0. 7-limit odd ≤ 63 (79): 19, 2, 7. 7-limit odd ≤ 75 (85): 20, 2, 8. 7-limit odd ≤ 123 (99): 26, 22, 20. 11-limit odd ≤ 123 (225): 56, 40, 29.
- **What partners share.** After the best transposition or inversion, partners keep 3 of 6 notes, 5 of 7, about 6 of 9 and about 12 of 16. At 6 notes all 15 intervals are distinct; that stops at 7 notes (16 of 21 on average), so it belongs to the single 6-note shape. 246 of the 5-limit partners are lattice mirrors of the original, mostly the **major ↔ minor swap** (5/4 ↔ 6/5 with the fifths fixed).
- **Across the three levels.** No JI pair of 9 or fewer notes is a linear-ring pair under any choice of 1/1, as the levels predict. Tempering mostly keeps them: in 53-EDO 29,745 of 30,065 stay Z-pairs; in 12-EDO 81/80 vanishes and only one survives, family 3 (1/1 10/9 6/5 32/25 128/75 16/9 ~ 25/24 10/9 6/5 5/4 8/5 16/9), which becomes the Forte pair **6-Z12 / 6-Z41**.

**How the search is done now.** `zgen.py` (pure Python, run under PyPy) replaces brute force for counting. `types` lists every cancellation shape for a factor shape symbolically; `place` lays each type into a gamut; `directsum` builds the chord-on-roots families; `exhaustive` remains as a disk-backed, resumable check. Wherever both were run, placement and exhaustive search agree. On the 7-limit odd ≤ 75 gamut at 8 notes, `types` + `place` took 28 s against more than 306 min (pass 1 alone) and 129 GB of scratch for the old brute force, with the same 8 families. The older `ji_zsets.py` keeps the targeted search, the EDO mode and the A + B construction.

**Fourier view.** Two sets share an IV exactly when they share every DFT magnitude (Lewin, Quinn, Amiot): a Z-pair has identical magnitudes and different phases. j counts beats per cycle, so it is the j-th harmonic of the cycle. A ring of L slots has L values of j; j = 0 is trivial, j and L − j mirror each other, so the distinct strengths are j = 1 to ⌊L/2⌋ (the ring's Nyquist limit). Strengths and directions together rebuild the rhythm exactly. Sped up to pitch, a Z-pair is two waveforms with the same harmonic strengths and different shapes.

**Where Z-partners occur** (**\[You\]** asked whether 53 is just a prime quirk). Sweep of every ring 6 to 61, primes extended further:

| Onsets | Z-partners appear on | Prime rings |
| --- | --- | --- |
| 3 | Never | None |
| 4 | Rings divisible by 4 or 13 | Only 13 (none 17 to 113) |
| 5 | Rings divisible by 2 or 5 | None (checked to 89) |
| 6 | Most rings | Every prime 13 to 47; 53 has 364 of 217,880 |

So for 5 onsets the controlling fact is divisibility by 2 or 5, not primality. The 13-ring exception, {0, 1, 3, 9} and {0, 1, 4, 6}, consists of two sets with every distance 1 to 6 exactly once.

**Case results.**

- The 6-note set rooted on 5/4 (ring 45: slots 0, 9, 18, 27, 35, 36) **provably has no partner**: five pairs at distance 9 force a complete pentagon, and the sixth onset's distances fix its offset up to reflection. Only 1.4% of 6-onset rhythms on 45 have partners.
- Finder: its cheapest fix moves two notes by 5 slots in total, giving 1/1 6/5 7/5 5/3 26/15 9/5 (ring 15), partner 1/1 4/3 7/5 23/15 26/15 9/5: they share 4 onsets and swap 6/5, 5/3 for 4/3, 23/15. The default scale needs 8 slots of movement, or just a sixth onset at pulse 36, 54 or 56. On 53, adding one onset plus 3 slots of movement works.
- Your pair on 72: 1/1 10/9 9/8 89/72 3/2 7/4 and 1/1 9/8 89/72 5/4 3/2 29/18. Both have one 1-slot pair, but 81/80 in one and 90/89 in the other: the same slot distance is a different ratio at a different height.

**Names.** **\[You\]** proposed that ring size plus onsets is all a name needs. Settled form, using gaps:

- Reduce to the smallest ring (divide all gaps by their common factor).
- **Class** (up to rotation and mirror image): the smallest rotation or reversal of the gap list, with ring and onset count: **15·6 ⟨1 1 3 3 3 4⟩**.
- **Rhythm** (up to rotation, keeping direction): the smallest rotation.
- **Scale** (exact ratio set): the rhythm name plus which onset is 1/1, counting from 1: **⟨1 1 3 3 3 4⟩@4**. Decode by starting the gaps at onset 4, summing to slots 0, 3, 6, 10, 11, 12 and converting with (L + s)/L.
- A Z-pair: **15·6 Z: ⟨1 1 3 3 3 4⟩ \~ ⟨1 2 3 1 3 5⟩**.

On the linear ring a mirror image maps r to 2 − r (an arithmetic inversion), not 2/r, so identifying mirrors is a real choice. Gap names are self-describing, double as additive groupings, and show commas as small gaps; they won't always match Forte or Rahn prime-form representatives.

**Short scale names.** **\[You\]** proposed a streamlined notation with a marker for the starting gap (like "22.513"). A dot reads as a decimal or a Dewey-style subcategory, so the settled form is:

- **Scale name = the gaps written from the root**, read straight off: ⟨334113⟩ gives slots 0, 3, 6, 10, 11, 12, so 1/1 6/5 7/5 5/3 26/15 9/5. No marker is needed.
- **Class name** beside it, as before: ⟨113334⟩, the smallest rotation or reversal.
- **One-token form** carrying both: the rhythm string (smallest rotation, so the direction is kept) with a **barline** before the root's gap, ⟨113|334⟩. A barline marks a downbeat, which is what the root is; "+" stays reserved for additive groupings.
- **Gaps of 10 or more** are separated by spaces (the 72 example's scale name is ⟨8 1 9 18 36⟩, its rhythm name ⟨1 9 18 36 8⟩ and its class ⟨1 8 36 18 9⟩, the mirror image); otherwise the digits run together. For a rhythm with rotational symmetry, take the first equivalent position.

## Bounds and theorems

Odd limit, ring size and smallest comma each bound the other two; **\[You\]** spotted that constraining one should constrain the rest. Everything here assumes octave equivalence and the linear reading unless noted.

**Odd limit, prime limit and ring size.** For a ratio in \[1, 2) with odd limit q, the denominator is at most q. So with prime limit p:

```latex
L \;\big|\; \operatorname{lcm}\{\, d \le q : d \text{ is } p\text{-smooth} \,\}
```

| Prime limit | Odd limit | Largest possible ring |
| --- | --- | --- |
| 3 | 3 | 6 |
| 3 | 27 | 432 |
| 5 | 5 | 60 |
| 5 | 9 or 15 | 360 |
| 7 | 7 | 420 |
| 7 | 9 | 2,520 |
| 11 | 11 | 27,720 |

Prime limit alone gives no ceiling (81/80, 2048/2025, … are all 5-limit). Odd limit depends on the root: the example is 9-odd-limit from 1/1 (ring 72, under 360) but 81-odd-limit from 9/8 (ring 81). For one bound over every mode, use the **intervallic odd limit**, the largest odd limit of any interval within the scale. The floor is the largest number in the odd-harmonic form (81, attained here).

**Smallest possible comma.**

```latex
\text{intervallic odd limit } q \;\Rightarrow\; \text{every interval} \ge \frac{q+1}{q} \qquad\qquad \text{ring of } L \;\Rightarrow\; \text{every interval} \ge \frac{2L}{2L-1}
```

Both floors are exact. The example's comma 81/80 (21.5¢) sits just above its odd-limit floor 82/81 (21.2¢). On a linear ring a one-slot gap is a larger ratio low on the ring and a smaller one high up, so a comma's size depends on where it sits.

**Read backwards, a comma forces complexity.** A superparticular comma (m + 1)/m puts two notes at harmonics m and m + 1 of one window \[L, 2L):

| Comma | Intervallic odd limit at least | Ring at least |
| --- | --- | --- |
| 81/80 (21.5¢) | 81 | 41 |
| 64/63 (27.3¢) | 63 | 32 |
| 225/224 (7.7¢) | 225 | 113 |

**Other results established in the conversation:**

1. **Lossless grids**: N must be a multiple of L ÷ GCD(slots, L), so a multiple of L for reduced sets.
2. **Anchored pair**: slots 0 and d separate on N slots exactly when N > L/(2d). On the log ring, a comma at least one step wide always survives rounding.
3. **Fingerprint completeness**: the multiset of mode ring sizes determines the scale up to mode (via its odd parts).
4. **Maximal evenness**: E(k, L) is unique up to rotation, and its gaps are its right Stern–Brocot parent's followed by its left parent's.
5. **Homometry**: equal interval vectors on a ring ⇔ equal DFT magnitudes.
6. **Spectrum size**: a ring of L has ⌊L/2⌋ independent strengths; with directions they rebuild the rhythm.
7. **Pentagon rigidity**: k onsets containing a full sub-cycle plus one onset have no Z-partner when the sub-cycle is forced by the distance counts.
8. **Factor law (JI level)**: two lattice sets share interval content exactly when P·P\* = Q·Q\*, so a partner is P with irreducible factors mirrored. Observed in every family searched: exactly one factor is mirrored, and every family has exactly two members.
9. **Chord-on-roots sizes**: A + B and A + (−B) are a genuine pair only if both A and B have at least 3 notes (1- and 2-note sets are their own inversions), so this mechanism builds only sizes with such a split: 9, 12, 15, 16, ….

## The pitch–rhythm map

**\[You\]** started from the premise that pitch is an audible rhythm; by the end, nearly every pitch concept had a rhythmic counterpart that behaves the same way.

| Pitch | Rhythm |
| --- | --- |
| Ratio; harmonic series of a fundamental | Onset position on the linear ring; harmonics L to 2L of a virtual fundamental |
| Pitch-class ring (log) | Necklace |
| Equal temperament, N-EDO | Quantization grid of N slots |
| Comma tempered out | Two onsets merged onto one slot |
| Choice of prime limit | Choice of factor order (binary-first favors 2-power positions, ternary-first favors 1/9) |
| Tonal hierarchy; structural vs ornamental tones | Metrical hierarchy; strong onsets vs a flam's grace note |
| Mode (re-rooting) | Re-rooted mode (rescaled ring); rotation is the separate rhythmic mode |
| Pivot partial (5 of Fx = 9 of Fy) | Metric modulation; or a shared gap fragment between mode windows |
| MOS scale; Wilson's scale tree | Euclidean rhythm; Stern–Brocot tree |
| Interval vector; Z-relation | Interval histogram; Z-related rhythms |
| Harmonic j of a tone | Periodicity j of a rhythm (beats per cycle) |
| Same spectrum, different phase: same timbre, different waveform | Z-pair: same strengths, different rhythm |
| Sample rate and Nyquist | Ring size L and ⌊L/2⌋ |
| Beating between near pitches | Phase drift between near tempos (Reich) |

**Where the analogy loosens.** Below about 20 Hz we hear discrete events, above it fused pitch, and the cochlea's place coding (critical bands, roughness) has no rhythmic twin. Octave equivalence is strong in pitch and weak in tempo. Quantization merges (tempering) while meter ranks (tonal hierarchy), and meter rests more directly on entrainment than tonal hierarchy does on learned style. Ears are mostly but not entirely phase-deaf in steady tones, so a Z-pair sped up into pitch should sound nearly identical, with possible residual differences at low pitches.

**Correspondences found later:**

| Pitch | Rhythm |
| --- | --- |
| Parallel modes (one tonic) | Equal cycles: every re-rooting in the same time span |
| Relative modes (one collection) | Equal pulse: a mode rooted on ρ lasts ρ times as long |
| Chord inversion (voicing) | Re-rooting on the linear ring: same pitch classes, different rhythm |
| Difference tones between harmonics | Slot distances on the linear ring |
| JI Z-pair (same intervals) | Log-ring Z-pair, usually inherited; linear-ring pairs are a separate, voicing-level relation |

## The Ratio rhythm lab

Everything above is implemented in one page, the [Ratio rhythm lab](https://claude.ai/artifact/8sd9E14kkb1yBC1kRm8LtB), with two tabs that pass rhythms between them.

| Part | What it does |
| --- | --- |
| **Grouping trees** | Cycles of 2 to 96 pulses; allowed bottom-level sizes 1 to 9; at most 2, 3, 4 or any parts per split. Top down: split any group, each option showing how many complete hierarchies it leads to. Bottom up: pick a leaf sequence, browse its bracketings. Uniform random hierarchy, fill open groups, and a check that both routes give the same total. Optional onsets show pulse weights and syncopation. |
| **Prism inputs** | Ratio set (octave-reduced, 1/1 added), linear or log reading, log ring size, and a root for each re-rooted mode. The info line shows the fingerprint and odd-harmonic form. |
| **Name panel and catalog** | Class, rhythm and scale names for the current set; add it or any Z-partner to a catalog kept in the browser, with Play, Load, Remove and Copy as text. |
| **Ring** | Onsets with ratio labels; the selected lens draws its reference as hollow ghost dots, with lines for moves. |
| **Ancestry lens** | Stern–Brocot node, path, parents and children; click any node to ghost its most even rhythm; shows the parent-concatenation identity. |
| **Evenness and Isochrony lenses** | Swap distance to the nearest most-even or equal-step rhythm, with gap statistics side by side. |
| **Spectrum lens** | Fourier strengths up to ⌊L/2⌋ against the most even rhythm; interval vector; Z-partner search with partners aligned to share the most onsets, differences highlighted, and ratios, pulses and onset slots for each. |
| **Z-relation views** | Chord rings and a pair table (every distance, which pairs make it); arrow dials for j up to 64; one dial opened to show the wrapped onsets; see and hear it (cycle speed from rhythm to pitch, play or alternate both, waveform plot by harmonic count). |
| **Z-partner finder** | Smallest total movement (or one added onset plus movement) that produces a Z-partner, searched in the background with a 15-second limit; results can be shown, compared with their partner, or loaded. |
| **Tuning lens** | Linear: quantize to any grid, with merges, bits lost, RMS shift, exactness, tie warnings and grids that keep every onset under both tie rules. Log: cents errors, tempered-out commas, rings that keep every ratio. |
| **Meter lens** | All divisive hierarchies plus the best additive grouping (exhaustive count by dynamic programming over chosen group sizes) and any tree from Grouping trees; syncopation, onset weights, the comma side each picks, rotations under a fixed hierarchy, and stacked comparison of two hierarchies. |
| **Grouping lens** | Proximity tree of the rhythm, which opens in Grouping trees with the onsets marked. |
| **Grid preview** | Step grid of your rhythm, Z-partners and finder results, shaded by the selected meter; loop any rows together; cycle 0.25 to 16 s; beat size in slots with a BPM readout you can type into. |

**Added since:**

- **Timing across re-rootings** in the grid preview: **equal cycles** (the cycle length holds steady when switching roots) or **equal pulse** (the 1/1 mode sets the cycle and a mode rooted on r lasts r times as long, with the fundamental pulse rate shown).
- **Tempo:** cycles from 0.25 to 16 s, a beat size in slots, and a BPM field you can type into.
- **Z-partner rows** with ratios, pulses and onset slots; partners aligned to share the most onsets; the swapped onsets highlighted; **Load as the scale**; and every partner can go to the catalog.

The JI-level work runs outside the app: `zgen.py` (in `research/ji-z-partners/`; see `HANDOFF.md` there) for counting and shape types, and `ji_zsets.py` (beside this file, not yet committed) for the targeted search, EDO mode and A + B construction. Adding the targeted JI search to the Spectrum lens is on the list below.

## Pitfalls

These corrections either changed a result or are easy to repeat; minor fixes are left out.

| Easy mistake | Correct form |
| --- | --- |
| Using the LCM for the ring | Positions need the LCD; the LCM belongs only to the rates (polyrhythm) reading. |
| A linear ring of LCD × 2 with 1/1 mid-ring | The ring is harmonics L to 2L: L slots, 1/1 at slot 0, slot = r·L − L. |
| Treating rotation and re-rooting as the same mode | They coincide only on the log ring. On the linear ring re-rooting changes the ring size. |
| Lossless if N is a multiple of the GCD | A multiple of L ÷ GCD(slots, L), i.e. of L itself for reduced ratios; scan from k, not from the lowest ratio. |
| Trusting small-grid survivors | Check both tie rules; many odd-grid wins depend on halves rounding up. |
| Numbering pulses from 0 | **\[You\]** flagged it: pulses count from 1; slots (used in names and formulas) count from 0. |
| Calling 1/64 of a beat a 64th note | At a quarter-note beat it's a 256th note (7.8 ms at 120 BPM); a 64th note is 31 ms. |
| Forgetting the grid can be a pitch | **\[You\]** caught it: 72 slots in 0.5 s is a 144 Hz grid. The grid is a resolution, not something played. |
| 6/8 as 2 × 2 × 3 | In sixteenths 6/8 is 2 × 3 × 2; 2 × 2 × 3 is 12/8 in eighths. |
| Expecting the fingerprint to have Z-relations | It's a complete invariant; Z-relations need a lossy summary. |
| Arithmetic/harmonic pairs always collide | Only sometimes; the mechanism is the adjacent step swap. |
| Applying a finder result without re-rooting | Write the new set relative to the root, or the parser adds 1/1 and changes the rhythm. A loaded set can shrink to its minimal ring (45 to 15). |
| Comparing partners in canonical form | Canonical forms start arbitrarily; align (rotate or mirror) to the most shared onsets, preferring 1/1 kept and the closest swaps. |
| Reading phase offsets on their own | They look like noise because they depend on rotation; show equal strengths (dials, chord rings) instead. |
| Comparing syncopation across hierarchy types | Weights are on each hierarchy's own scale; a tree built from the onsets scores 0 trivially. |

**From the JI work:**

| Easy mistake | Correct form |
| --- | --- |
| Treating a linear-ring Z-pair as a property of the scale | It belongs to one root's voicing; only JI-level (and log-ring) partners are shared by every mode. |
| Expecting JI Z-pairs once enough primes are allowed | They need depth (stacked 3s and 5s), not more primes; odd-limit diamonds have none. |
| Searching every set to answer a question about one scale | Use the targeted search: complete, and usually under a second. |
| Assuming the A + B construction covers every size | Both parts need at least 3 notes, so 6, 7, 8, 10, 11, 13 and 14 can't be built that way; those families come from a cancellation (signed) factor. |
| Calling the families at 6, 7, 8, 10, … "sporadic" | They follow the same factor law as A + B, with one factor carrying minus terms. |
| Counting families as if each were new | Many are one shape along different axes; count types. |
| Reading the first-pass candidate count as the family count | Short fingerprints give chance matches (about classes² ÷ 2⁴⁹); only the exact pass's count is real. |
| Brute-forcing a gamut to count families | Use `zgen.py types` + `place`: seconds instead of hours, no scratch disk, same families (28 s against 306+ min at 8 notes in 7-limit odd ≤ 75). Keep `exhaustive` for spot checks. |
| Treating a gamut's count as a fact about the whole lattice | Searches are complete only inside the gamut; a set whose partner lies outside it isn't reported. |
| Expecting a listed member's notes to be in the gamut | Output ratios are re-rooted on 1/1 for display; they fit the gamut after a transposition. |
| Marking the root with a dot | It reads as a decimal or subcategory; write gaps from the root, or use a barline. |

## Open questions and next steps

The main open theory questions are why Z-relations need particular divisors, and whether sorted gaps always identify a scale; the main app gap is a pivot finder.

**Theory**

- [ ] Why do 5-onset Z-partners need a ring divisible by 2 or 5, and 4-onset ones a ring divisible by 4 or 13? The pattern held for every ring tested but is unproven.
- [ ] Do each mode's sorted gaps always identify a scale on the linear ring? No counterexample in about 11,000 scales.
- [ ] Classify the "different steps" Z-collisions under min IOI per mode, beyond adjacent step swaps.
- [ ] A perceptual cost for quantization (category changes, Weber-weighted shifts, flam-aware merges, metrical weights), fitted by listening tests.
- [ ] Rhythmic tuning systems: tempo relationships at ratios like 7:5 or 11:8, which the opening flagged as thinly theorized.
- [ ] Where phase stops being audible: use the see-and-hear slider to find where a Z-pair's tones become indistinguishable.

**App**

- [ ] Pivot finder: shared gap fragments between mode windows, and shared pulse rates (metric modulation) between two sets.
- [ ] Two-level additive search in the Meter lens (sub-splits of each group), as in the 53-ring analysis.
- [ ] Sideways navigation in the Ancestry lens: other k-in-L rhythms ordered by distance from the most even one.
- [ ] Search all roots at once for the hierarchy that best settles a scale.
- [ ] Loading log-reading partners as nearest just ratios, and Forte-style index numbers for catalog classes.

**JI search** (runs, commands and raw results live in `research/ji-z-partners/HANDOFF.md`)

Answered:

- [x] Do 15 and 16 notes spike and 13 stay near zero? **Yes**: 13,364 and 1,875 families against 49 (5-limit odd ≤ 123).
- [x] A canonical form for shapes: **types** in `zgen.py`, one pattern up to any change of lattice basis.
- [x] Classify the sporadic families: they are cancellation families under the factor law.
- [x] Why do the smallest pairs have every interval distinct? It holds only at 6 notes, where every family is the one 6-note shape.
- [x] Can placement replace brute force? **Yes**: it matched exhaustive counts everywhere both were run.

Open:

- [ ] Collect the 10-, 11-, 13- and 14-note `types` + `place` runs in 5-limit odd ≤ 123 (expected 292 of 295, 25 of 25, 41 of 49 and 495 of 498), then the 7- and 11-limit odd ≤ 123 placements.
- [ ] Extend `zgen.py types` to cover the families it misses: a U factor with a doubled note (14 families at 10 to 14 notes), both factors signed (8 families at 10, 14, 15 and 16), and types of rank above 3 (now silently dropped; rank-3 placement is too slow in 11-limit).
- [ ] Is the 13-odd-limit diamond Z-free at every size?
- [ ] Listening tests on the shortlist (`ANALYSIS.md` section 7), starting with the 9-note chord-on-roots pairs and the major ↔ minor mirrors. None done yet.
- [ ] Map JI families to Forte Z-pairs through tempering: which hexachord pairs have 5-limit realizations, and in which EDOs they survive.
- [ ] Update `ANALYSIS.md`, which predates `zgen.py`.
- [ ] Add the targeted JI-level partner search to the Spectrum lens, reporting whether each partner also holds on the current log and linear rings, and its factor (chord on roots or cancellation).
