# Handoff: how should the lab treat the EDO chords in Scala's `chordnam.par`?

For a fresh session. This is an ANALYSIS task, not a build. It is separate from the Scala-tools arc in `ARC.md` (which deliberately leaves these chords out). Do not edit `ARC.md`, `PROGRESS.md`, `DECISIONS.md` or any code. Write findings to `arcs/harmonic-field-lab/reference/analysis/FINDINGS.md` and report back to the human.

## The question
`reference/chordnam.par` (Scala's chord list, by Manuel Op de Coul, 952 names) holds three kinds of chord the lab cannot represent today, because the lab's chord templates are whole-number ratios only (`a:b:c` or `1/(a:b:c)`, `src/lib/harmonic-field/chords.ts`, `parseTemplate`):

| Kind | Entries (approx.) | Example |
| --- | --- | --- |
| Step lists of an equal temperament, the EDO named by a directive line | 394 | `2-2  =7-tone Neutral Triad` under `<SCALA_SCALE_DEF 2^(1/7)>` |
| Relative intervals in cents or as ratios | about 130 (a rough count, not verified) | `50.0 50.0 400.0`, `28/27 36/35 5/4` |
| Note names in a notation system | 30 | `C F# Bb E.1 A.1 D.2  =Scriabin's Mystic Chord` under `<SCALA_NOTATION E12>` |

The human's hypothesis: many EDO chords are only the best approximation, within that EDO's limits, of a chord that already exists as a ratio chord (for instance the "7-tone Neutral Triad" is the neutral triad rounded to 7 steps). If so, importing them as separate chords would duplicate the ratio library. The human wants to know how many are roundings, which are genuinely EDO-native, and what to do with each group.

Decided already (human, 2026-11-16): the ratio chords (399 colon-ratio entries, about 370 distinct) become a read-only chord library in the Scala-tools arc (M7), and the user's own templates are the curated active list. The EDO, cents and note-name chords are NOT part of that; this analysis informs a later decision.

## What is already established (a preliminary pass, with its limits)
Scripts: `reference/analysis/edo_analysis.py` (parses the file, converts EDO step lists to cumulative cents using the directive, then tests them) and `reference/analysis/edo_by_edo.py` (per-EDO table). Run with `python -I reference/analysis/edo_by_edo.py` from the arc folder (they find `chordnam.par` relative to themselves; Python 3.12+ for `math.lcm` use is fine on any recent Python).

Results (all 394 EDO entries parsed):

| Test | Result |
| --- | --- |
| Matches at least one library ratio chord within 18 c (the lab's default chord tolerance) | 264 of 394 (67%) |
| Same, excluding 12-EDO | 180 of 240 (75%) |
| 12-EDO alone | 84 of 154 (55%) |
| Match at 5 / 10 / 15 / 20 c | 98 / 171 / 236 / 275 |
| Of the 264, matching exactly one library chord | 54 (median 4 matches per chord, max 15) |
| Not within 20 c of ANY ratio chord of odd limit 15 or below | 14 of 394 (looks EDO-native: "22-tone Super Seventh" 0 436 709 1145 c, "17-tone Phrygian Quad" 0 71 282 494 c, the Kürdi tetrachords in 53-EDO, ...) |

Per EDO (hits/total at 18 c): 12: 84/154, 17: 20/22, 19: 27/34, 22: 34/41, 24: 19/32, 29: 13/14, 36: 14/14, 46: 17/17, 53: 16/28; the smallest EDOs (7, 10, 13, 15, 16) have few entries.

The 7-EDO neutral triad (0, 343, 686 c) matches 13 library chords, including "Neutral Triad", supraminor, submajor and several tredecimal variants: a rounding is one-to-many.

### Limits of that pass (do not trust these numbers blindly)
- "Matches a library chord" ignores which note is the root (it tries all rotations) and compares pitch classes mod the octave. That is loose, and it is a proxy for "is a rounding of", not proof.
- A band of 18 c proves little for coarse EDOs: a 7-EDO step is 171 c, so half a step is 86 c. The right tolerance for "is a rounding" is probably tied to the EDO's own half step, not a fixed number.
- The looser test (any chord of odd limit 15 or below within 20 c) gave 380/394 and is meaningless because that set of ratios is dense.
- The roughly 130 cents and ratio step entries and the 30 note-name chords have NOT been analyzed. Chords inside the tetrachord directives (`4/3^(1/28)`, `4/3^(1/3)`, `4/3^(1/10)`) span a fourth, not an octave; the script converts them correctly but the octave-based pitch-class comparison is shaky for them.
- Several entries are inversions or rotations of each other; the pass did not collapse them.
- Directive parsing: only `<SCALA_SCALE_DEF b^(1/n)>` is read (EDOs 7 to 72 and three 4/3-based ones); `<SCALA_NOTATION ...>` lines are skipped by design.

## What to do (suggested order; the human decides the scope)
1. **Make the rounding test principled.** Per chord: compute each interval's error against the nearest ratio inside the chord's own EDO half-step, and score by how simple the ratio chord is (Tenney height or odd limit) as well as how close. Report separately: chords that round a simple ratio chord, chords that round a complex one (probably coincidence), chords that round nothing simple.
2. **Cluster by ratio chord.** Many EDO chords from different EDOs round the same ratio chord (7-, 17-, 22-tone neutral triads). Count the distinct ratio chords involved, and list the EDO chords per ratio chord. This is the "alias" picture.
3. **List the EDO-native remainder** with their cents and say why no simple ratio chord fits (for example a 22-EDO super seventh sits between the harmonic seventh and the neutral seventh).
4. **Analyze the roughly 130 cents and ratio step entries** the same way (they are already in cents; ratio-step ones convert exactly).
5. **Look at the 30 note-name chords.** Each needs its notation system (`E12`, `E19`, `E31`, `E144`, ...) mapped to EDO steps first; decide whether it is worth the work (12-EDO ones are trivial).
6. **Quantify duplication inside the EDO group** (the same chord from several EDOs, rotations, inversions) so the human sees the real number of distinct ideas, not 394.
7. **Recommend**, with the numbers, one of: (a) skip them; (b) import as aliases (a name note on the matching ratio chord, "7-tone Neutral Triad" becoming an alias of "Neutral Triad"); (c) a new template kind, "cents chord with a tolerance band", for the EDO-native remainder only; (d) a mix. For (c), describe what would change: `ParsedTemplate` already carries `cents: number[]` and the matching in `findChords` compares in cents against the nearest subset note within a tolerance, so the matcher may need little; the stored format (`chordfinder.v1`: text templates, text cut to 80 characters, at most 64) and `parseTemplate` would change, which needs a `DECISIONS.md` row and the human's OK. Verify these statements in the code before relying on them; they come from reading `chords.ts` and the page `ARCHITECTURE.md`, not from a spike.

## Read first
- `src/pages/harmonic-field-lab/ARCHITECTURE.md` (Chords, "Contracts", chord finder storage) and `src/lib/harmonic-field/README.md` (chord templates, tolerances: default chord tolerance 18 c).
- `src/lib/harmonic-field/chords.ts`: `parseTemplate`, `DEFAULT_TEMPLATES`, `findChords`, `closestChord`, `chordLadder`.
- `reference/chordnam.par`: the header comment lists the four formats; the directives sit on lines starting with `<`.
- `ARC.md` "Checkpoint decisions" and "M7 shape" (what the library work does and does not cover).
- Scala's own description of the file and chord commands is in `reference/Scala help.html` (convert to text with a small script before reading; it is 546 KB).

## Rules for this session
- Analysis only: no edits to `src/`, `ARC.md`, `PROGRESS.md`, `DECISIONS.md`, `BACKLOG.md`. Scripts and findings go under `reference/analysis/`.
- Windows machine, Git Bash and PowerShell. Put Python in script files, not inline (backslashes are mangled); run `python -I script.py`. Do not read or write UTF-8 files with PowerShell 5.1 `Get-Content` or `WriteAllText` (it corrupts them); use Python or the file tools.
- Do not run the repo's test suite; nothing here needs it.
- Plain language and exact numbers in the report; one recommendation, with an example where options differ. The human is the decision-maker; show cases where the options give DIFFERENT results.
- Report what was verified and what was not (as the limits section above does).
