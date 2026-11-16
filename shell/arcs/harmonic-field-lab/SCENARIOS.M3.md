# M3 scenarios: beat frequencies in the Pairs grid

CONFIRMED by the human 2026-11-16 as a design (the human asked to start without a long numbers table; the values below come from `scratchpad/m3-examples.mjs`, `m3-grid.mjs`, `m3-added.mjs` and are the test source). Look-judged parts (toggle, dashed outline, spacer, chip text) are a thin slice the human tries before a reviewer, gate or commit.

## What a beat is
Scala `SHOW BEATS`: for a pair that should make a simple ratio p/q, the upper note's q-th partial and the lower note's p-th partial should be the same pitch; if the pair is off, they beat at `q * f(upper) - p * f(lower)` Hz (negative = the upper note is flat of the target). `f(note) = baseHz * 2^(cents/1200)` with `baseHz` = the 1/1 Hz setting (default 261.6256).

## Confirmed design (human, 2026-11-16)
1. **A display toggle on the Pairs grid: Intervals | Beats.** In Beats mode each cell shows its beat in Hz (signed, two decimals) instead of the interval. The axis labels become each degree's interval from 1/1 (its ratio when exact, else cents). Find still works with ratios and cents and still highlights cells.
2. **Which ratio a cell is measured against.** (a) A ratio picked in Find overrides: every cell within the tolerance is measured against that ratio. (b) Otherwise the AUTOMATIC target: the simplest ratio (lowest Tenney height) within the tolerance of the cell's interval; a cell with none shows nothing. A cents search has no ratio, so cells keep their automatic target. A pair within the tolerance of a unison compares against 1/1 (a plain Hz difference).
3. **Hz position:** a note sounds at its place in the field above 1/1 Hz (`baseHz * 2^(cents/1200)`); the upper note of a wrapped pair is one repeat higher. It does not change with the mode or with Parallel | Relative.
4. **Added pitches:** an "Add pitch" box beside Find takes a ratio (slash or colon) or cents (a bare number), several allowed; each is a pitch that is NOT in the subset. It appears as an extra row AND column, drawn with a dashed outline and separated from the subset's rows and columns by a narrow blank spacer, in both views (interval cells in Intervals, beats in Beats). Each added pitch has a remove ×. They are measured from 1/1 like everything else.
5. **Added pitches PERSIST** (human): stored in `settings.v1` as an additive field (decision `H-20`); older data loads unchanged. The view (Intervals | Beats) stays runtime-only for now (decided at the checkpoint, as M1 did).
6. **Totals:** the Locations block (shown after a Find) gains rows Beats total, average and highest in Hz, over the matching cells, using sizes without signs.
7. **Added pitches are not part of the subset:** they do not count in N, the coverage figures, the content table or the 32-note cap; an added cell does not hover-light, pin or play (there is no field note behind it) in this milestone. At most 4 added pitches (so the grid stays readable; say if you want more).
8. **Entry checks:** an invalid text shows an inline message and nothing is added; a pitch within 0.01 c of a subset note is refused with "already in the subset"; a pitch equal to an existing added one is ignored.

9. **Corrections after the human's first looks (2026-11-16):**
   - **No audio-based limit on the analysis.** The beat table never depends on the lab's 7-harmonic sound. By default every cell shows its beat whatever partials the ratio needs. A Developer option `beatPartialLimit` (additive in `developer.v1`, decision H-21; absent or Off = no limit, a number N from 1 to 64) dims the cells that need a partial above N and names them in their accessible name; it is for judging what a sound with N harmonics would show.
   - **The readout under the grid** is not terse: it keeps its full wording (as before M3: "Degree 1 to degree 3: ..." plus the beat in Beats mode), in a block that reserves 3 lines so nothing below it moves. The help sentence stays out of the panel (it lives in the Tip on the grid heading).
   - **Added pitches are tinted like the subset:** the dashed cells, the added row and column HEADERS and the chip take the grid's Color setting from their own interval; the strength and rank use the added interval's own ratio when both pitches are exact (Tenney height), exactly as a subset cell's would.
   - **Compact columns:** the uniform width is the longest text plus the least padding that keeps the wrap arrow clear (the arrow sits in a corner, not in reserved side room).

10. **Interval tint: two channels (human, 2026-11-16: "option B by default", "keep Tenney", "Solid: ok").** The grid's Interval color (cells; the added pitch's cells, headers and chip) keeps its hue from the interval's size and now carries two simplicity readings, both from Tenney height (`tenneyHeight`, log2(p*q)):
   - **Strength = FIXED simplicity:** the interval's own Tenney height against fixed bounds (strongest at about 3/2's height 2.58, faintest at 14 or more; constants tuned by eye), the same in every subset: 129/128 (14.01) and 151/150 (14.47) both read faint everywhere. A note pair with no ratio (EDO, cents) keeps the middle strength, as today. Developer option `tintScale` = `fixed` (default) | `relative` (strength spread over THIS subset's lowest and highest height: the old behavior, kept for comparison; decision H-22).
   - **Reach = RELATIVE simplicity:** how far the tint reaches from the center of the cell toward its edge (a radial gradient), by the interval's place in this subset's range, clamped for an added cell. Default direction (option B = today's `intervalIntensity` = `strong`): the simplest interval reaches the edge and is strongest; the most complex in the subset reaches least and is faintest. The existing option `intervalIntensity` = `faint` reverses BOTH channels together. Reach applies to the Tinted and Outlined looks; the Solid look stays a full fill. An interval with no ratio, or a subset whose heights are all equal, gets the middle reach. Added headers and the chip show strength only (full reach).

11. **The tint becomes a hard-edged BAND (human, 2026-11-16: "the center out band is what I would like to try"), replacing the gradient.** In Tinted and Outlined cells the tint is a full-height band; its WIDTH is the relative simplicity (REACH, unchanged range, now a hard edge with no soft fade) and its depth is the fixed simplicity (STRENGTH, unchanged). Outside the band the cell is transparent and shows the screen surface. Developer option `tintBand` = `center` (default: the band is centered) | `left` (the band starts at the cell's left edge; "bottom bar" idea folded in, always full height). Solid stays a full fill. The grid sits on `--panel-inset` (the lab's screen surface).
    - **Default direction (human, restated 2026-11-16 after an earlier answer of "option B"):** the more COMPLEX the interval, the wider and the more tinted. `intervalIntensity` therefore defaults to the value that reverses today's (`faint`: simple = fainter and narrower); `strong` (simple = stronger and wider) stays available in Developer. Strength and band width always move together.
    - **Search dimming goes ON TOP of the band:** a cell that does not match a Find or pick keeps its band (same width) but in the receding colors (the tile's dim fill, weakened border, dim text); it no longer turns into a flat full-cell fill. Solid keeps its flat dim fill.

## Values (tests come from these)
1/1 Hz 261.6256 unless noted.

| # | Setup | Expected |
| --- | --- | --- |
| 1 | 12-EDO C major scale, Beats, Find `3/2`, tolerance 25 c | 6 cells: C→G -0.89, D→A -0.99, E→B -1.12, F→C -1.18, G→D -1.33, A→E -1.49 Hz; total 7.00, average 1.17, highest 1.49. |
| 2 | Same scale, Find `5/4`, tolerance 15 c | 3 cells: C→E +10.38, F→A +13.86, G→B +15.56; total 39.80, average 13.27, highest 15.56. |
| 3 | 5-limit major scale (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8), Find `3/2`, tolerance 25 c | five exact cells 0.00 and 9/8→5/3 -10.90; total 10.90, average 1.82, highest 10.90. |
| 4 | Same, tolerance 3 c | five exact cells 0.00; the 40/27 cell is not matched; total, average, highest 0.00. |
| 5 | 12-EDO C E G, Beats, nothing picked, tolerance 20 c (automatic) | C→E +10.38 (5/4), C→G -0.89 (3/2), E→C -20.76 (8/5), E→G -17.79 (6/5), G→C +1.77 (4/3), G→E +17.79 (5/3). |
| 6 | Same triad, add pitch `3/2` (701.955 c, 392.44 Hz) | extra row and column, dashed: C→+3/2 +0.00 (3/2), E→+3/2 -15.57 (6/5), G→+3/2 +0.44 (unison), +3/2→C -0.00 (4/3), +3/2→E +15.57 (5/3), +3/2→G -0.44 (unison); the subset cells as in row 5; N stays 3. |
| 7 | Triad, Find `700` (cents) | cells within the tolerance highlight; their beats stay the automatic targets (no ratio picked). |
| 8 | 12-EDO scale, Find `15/8`, tolerance 15 c | C→B +26.68, F→E +35.62 Hz, shown like any other cell (NO marking and no dimming by default: a beat is a result of the ratio, not of how the lab plays sound); total 62.30, average 31.15, highest 35.62. With the Developer option "Beat partial limit" set to 7, these two cells are dimmed and their names say "partials 15 and 8, above the limit of 7". |
| 9 | Row 1 with 1/1 Hz set to 440 | every beat scales by 440 / 261.6256: C→G -1.49, A→E -2.51. |
| 10 | Add `3/2`, reload | the added pitch is still there, dashed, in its row and column; its × removes it; nothing else changes. |
| 11 | Add `abc`; add `700` to a 12-EDO scale that has G (700 c) | inline message for `abc`, nothing added; `700` refused as already in the subset. |
| 12 | Switch Beats to Intervals | the grid reads as in M1; the added row and column remain (dashed interval cells). |
| 13 | Hover, pin, play, Find and Color as in M1 for subset cells | unchanged. |
| 14 | Read a beat cell with a screen reader | words: "C to G, minus 0.89 hertz". |
| 15 | Mirror cells | the same two notes against the same ratio give the same number; the mirror cell in the grid is the upper note one repeat higher, so it differs (C→G -0.89 against G→C +1.77). |

## Look-judged part
The toggle's place and look, the dashed outline, the blank spacer, the added-pitch box and its chips, the axis labels in Beats mode, the dimmed theoretical beats. Thin slice first, then STOP for the human.
