# M1 scenarios: interval matrix, locations and content table

Confirmed by the human 2026-11-16 (rows 1 to 14 and decisions D1 to D5 as proposed; color rows 15 to 18 added the same day, thin slice: the human tries both colorings at the M1 checkpoint). Tests come from this table, not from cases where the options coincide.

**Subset:** the 5-limit major scale, degrees numbered 1 to 7 (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8), repeat 2/1. Computed exactly (`scratchpad/m1.py`, `m1color.py`). Interval of cell (i, j) = degree j above degree i, octave-reduced.

## Matrix, locations, content table

| # | You do | Expected |
| --- | --- | --- |
| 1 | Open the matrix | 7 by 7 grid, diagonal empty: 42 cells, 18 distinct intervals. |
| 2 | Look at the content table (simplest first, by Tenney height) | 3/2 x5, 4/3 x5, 5/3 x3, 5/4 x3, 6/5 x3, 8/5 x3, 9/5 x2, 9/8 x3, 10/9 x2, 15/8 x2, 16/9 x3, 16/15 x2, then 27/16, 27/20, 32/27, 40/27, 45/32, 64/45 once each. |
| 3 | Pick 3/2 | Cells (1,5), (3,7), (4,1), (5,2), (6,3) light. Degrees with a 3/2 above them: 5 of 7. Covered degrees 7; used more than once 3 (degrees 1, 3, 5); highest coverage 2. |
| 4 | Look at cell (4,1) | Reads 3/2, marked as wrap-around (4/3 up to the next octave's 1/1). Wrap-around fifths (4,1), (5,2), (6,3) are all below the diagonal. |
| 5 | Pick 5/4 | Cells (1,3), (4,6), (5,7). Degrees with one above: 3 of 7. Covered degrees 6; used more than once 0; highest coverage 1. |
| 6 | Compare with the chord finder, template 4:5:6 | 3 chords: 1-3-5, 4-6-1, 5-7-2. Picking 3/2 gives 5 fifths (degrees 3 and 6 have fifths under minor thirds). Pairs and chords differ here. |
| 7 | Look at the steps column | 4-step intervals (the seven fifths): 3/2 x5, 40/27 x1, 64/45 x1. 1-step intervals: 9/8 x3, 10/9 x2, 16/15 x2. |
| 8 | Search 700 c, tolerance 3 c | The five 3/2 cells (2 c off). |
| 9 | Search 700 c, tolerance 25 c | Six cells: adds (2,6), 40/27 at 680.4 c (19.6 c off). |

## Responsiveness (same shared state as the other panels)

| # | Event | Expected |
| --- | --- | --- |
| 10 | Hover degree 3 | Row 3 and column 3 highlight; degree 3 lights on ring, strip and lattice as for any hovered field note. |
| 11 | Hover cell (1,5) | Degrees 1 and 5 light everywhere (shared chord hover); hold 1 plays them. |
| 12 | Sound the 4:5:6 chord from the shelf | The six cells among degrees 1, 3, 5 light; the table rows 5/4, 3/2, 6/5 and their inversions light. |
| 13 | Alt+click a degree header | Pins it, yellow (H-3), as in every other view. |
| 14 | Click cell (4,1) | Plays degrees 4 and 1 as a rising fifth (4/3 up to 2/1), not a fourth. |

## Color (thin slice, the human tries both)

Control: **Color: Off | Error | Interval**.

| # | Mode | Expected |
| --- | --- | --- |
| 15 | Error, reference = nearest ratio at the lab's vs-JI odd limit (9 here) | Cells 32/27, 27/20, 40/27, 27/16: 21.5 c (15 to 30 c band, the syntonic comma). 45/32 and 64/45: 7.7 c (5 to 15 c band). 16/15 and 15/8: 70.7 c (30+ band). Every other interval exact. Same five-step scale and legend as the Modes grid. |
| 16 | Interval (two readings, a Developer option `Interval color`) | **Size wheel (default):** hue = the interval's size around the repeat (cents mod repC over repC, one trip round the wheel), so equal intervals match, near-equal ones (9/8 at 204 c, 10/9 at 182 c) look almost the same, and inversions mirror (4/3 at 149 degrees, 3/2 at 211 degrees on a 360 degree wheel). **Alternate by rank:** distinct intervals sorted small to large, each rank's hue stepped far from its neighbor's (golden-angle step round the wheel) so neighboring sizes contrast. Palette is not limited to eight: continuous, mixed between neighboring `--mark-<hue>` roles (no hex). In an EDO field groups are by size (cents), not ratio. The content table rows are the legend. |
| 16b | Intensity (a Developer option `Interval intensity`: simple strong, default, or simple faint) | Applies to the Interval coloring: strength of the tint follows the ratio's Tenney height. Simple strong: 3/2 (T 2.58) vivid, 64/45 (T 11.49) faint. Simple faint: the reverse. Irrational (EDO) groups have no ratio: a fixed middle strength (the builder reports what it used). |
| 17 | Either | Sounding, hover and pin marks stay on top of the tint (H-2, H-3); the interval text is always in the cell (hue alone is not enough, `THEMING.md`). |
| 18 | Off | Plain cells. |

## Decisions (human, 2026-11-16)

- D1 **Directed:** all 42 cells; 3/2 and 4/3 are separate entries; inversions are the mirror cells.
- D2 **Coverage:** "degrees with this interval above them: k of N", plus covered degrees, used more than once, highest coverage (not matches over all pairs).
- D3 **Tolerance:** grouping within the strict 0.01 c; the location search has its own tolerance box defaulting to the lab's tolerance setting (`ui.tol`, 18 c).
- D4 **Placement (revised 2026-11-16):** its OWN panel (precedent: the Shelf panel, M8a: new `PanelId`, not in `DEFAULT_LAYOUT`, stored layouts load unchanged), not a view in the Spectrum panel, so it can later move to the workbench as a unit. Working name and id `pairs`, rail label "Pairs" (the name avoids "matrix", which in set theory means the twelve-tone row matrix); the name PAIRS is settled (human, 2026-11-16) and still lives in one constant; tooltip: every pair of degrees and the interval between them. The Spectrum panel stays unchanged.
- D5 **Size cap:** like the Modes grid, the matrix is shown for up to 32 notes, with a short message above that.
- D7 **Color: Off | Error | Interval** stays a normal (non-developer) control (human, 2026-11-16).
- D6 **Developer options (human, 2026-11-16):** both the Interval color reading (size wheel | alternate by rank) and the intensity direction (simple strong | simple faint) are Developer options of the lab (the existing `developer.v1` store and `DeveloperMenu`; additive fields, per viewer). The user-facing control stays Color: Off | Error | Interval. The palette is not limited to eight hues.
- Not decided yet (M1 checkpoint): the default color mode, whether the view, color mode and tolerance box persist (the thin slice keeps them runtime-only: no stored-format change).

## Pop-out to a large window (human request 2026-11-16; mirrors the visualizers exactly)

| # | You do | Expected |
| --- | --- | --- |
| 19 | Click the expand button in the Pairs panel header | The same Pairs view opens in a large window (the visualizers' modal: `min(64rem, 94vw)`), with bigger cells and text; grid, content table, color switch and search box all work there. |
| 20 | In the large window: hover, click, Alt+click, play and pick an interval | Identical to the panel (rows 10 to 14): the shared lab state lights the ring, strip and lattice behind the window. |
| 21 | Close it (Escape, the close button, a click outside) | Back to the panel with the same color mode, picked interval and search state (they live in lab or panel state, not inside the window). |
| 22 | Same for Modes (follow-up step M1b): click the expand button in the Modes header | The Modes heat grid opens in the same kind of large window with bigger tiles; row click selects the mode, the Ctrl/Cmd and Shift preview clicks, hover and the sign display work as in the panel; the legend is shown. |
| 23 | Tooltips | The expand buttons have tooltips in the new help + teaching form (the visualizers' `vizPopOut` entry is the model; new entries for Pairs and Modes, or a shared generic one if the wording fits). |

## Added after the first look at the panel (human, 2026-11-16)

| # | You do | Expected |
| --- | --- | --- |
| 24 | Pick Color: Interval, refresh the page | The Pairs panel comes back with Color: Interval (the Color selection is stored in `settings.v1`, additive field `pairsColor`). The picked interval, the Find text and its tolerance are NOT stored. |
| 25 | Type `700`, `700 c` or `700c` in Find (tolerance 3) on the 5-limit major scale | All three find the five 3/2 cells (a bare number or a number with c is cents). |
| 26 | Type `3/2` or `3:2` in Find | Ratio reading: the same five cells. A ratio needs a slash or a colon. |
| 27 | Type `3` in Find | 3 cents: nothing near, the "Nothing within" message. |
| 28 | Look at the result block under Find | A heading line ("700 c within 3 c") and labeled rows (Places, Degrees with it above them, Covered degrees, Used more than once, Highest coverage), then the chips of pairs. No sentence broken into pieces. |
| 29 | Look at the grid at the narrow column width (7 and 12 degrees) and in the large window | No clipped text ("1024/729", "6561/4096", "1088.3" fully visible); the wrap arrow never collides with the ratio; the grid scrolls sideways when it must. |

- D8 **Color selection persists** across refresh (settings.v1, additive `pairsColor`). Only that selection; nothing else of the panel is stored.
- D9 **Find box:** local to the Pairs panel: a slash or colon means a ratio, anything else is cents. The lab-wide `parseInterval` rule (a bare integer is n/1) is NOT changed: stored custom generators rely on it (a bare "2" is the octave).
- D10 **American spelling only**, everywhere (code, identifiers, texts, docs). Units always get a space ("700 c").

## Tile colors (M1b, human 2026-11-16; FINAL after the thin slices: Radix Colors; look approved by the human)

History: bright full-hue tiles with dark text (too gaudy), then OKLCH jewel tones, then Radix Colors 3.0.0 scales ("that coloration pretty much solves everything"). Default: Tinted with the outline on.

| # | Where | Expected |
| --- | --- | --- |
| 30 | Modes heat grid and Pairs Error (both schemes) | Tiles use the Radix scales for cyan, green, yellow, orange, red in the chosen look (Developer option `tileLook`: Tinted default, Outlined, Solid; `tileOutline` default on); text at least 4.5:1 on every tile (tests: `state/tileColors.test.ts`). |
| 31 | Pairs Interval (both schemes) | The eight-hue wheel blends the same Radix step of neighboring hues; intensity (simple strong or faint) picks the step; the table dots equal the tiles. |
| 32 | Dimmed (non-matching) Pairs cells | The receding look (low fill step, readable text), never a dark mud tile. |
| 33 | Outlined look on Pairs tiles | The border shows on the tiles, not only on the dots (the old bug: an undefined variable inside a `border` shorthand). |
| 34 | Modes pop-out and Pairs pop-out | Same looks and behavior as the panels. |

Known limits (measured): Tinted fills are close to the panel by design (1.02 to 1.18:1), so the stacked outline carries the edge; Solid strong red is the weakest text case (4.52:1). Radix is tuned with APCA, the tests use WCAG 4.5:1.
