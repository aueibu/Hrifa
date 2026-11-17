# M4 scenarios: sorting ratio and CPS chords

DRAFT 2026-11-16, not yet confirmed by the human. Values marked "check" are computed by hand here and must be re-checked against the real field (script in the scratchpad) before they become tests.

## What exists today
- **Ratio chords** (Chords panel, "Ratio chords"): size section (Triads, Tetras, ...) > family row (Major, Minor, ...) > cards. The cards of a row come out of the chord finder sorted by **tuning error, then root position in the scale**. Cards found only at a raised tolerance (dashed) come last. With "Group shapes" on, cards with the same shape merge into one group card; its roots are listed inside it.
- **CPS chords** ("Chords inside this CPS", CPS generator only): an Otonal row and a Utonal row; the cards come in the order the lib returns them (the field's note order). There is no control.

## Proposed design (decisions D1 to D4 below)
One **Sort** control in the Chords panel top area, beside "Group shapes". It changes only the ORDER OF CARDS inside a row (and of the roots inside a group). Sections, family rows, group cards and fold state stay where they are.

| Key | Ratio chords | CPS chords |
| --- | --- | --- |
| Error (today's order) | tuning error, then scale position | not offered (a CPS is exact) |
| Root | root pitch, low to high | root pitch, low to high |
| Simplicity | chord Tenney height, simplest first | chord Tenney height, simplest first |
| Factors | not offered | the factor set, in factor order (today's order) |

Chord Tenney height = log2 of the product of the chord's whole numbers in lowest terms (4:5:6 gives log2(120) = 6.91). A chord with an irrational member sorts last.

## Scenarios (the human's real cases to confirm)

| # | Setup | Sort | Expected card order |
| --- | --- | --- | --- |
| 1 | 5-limit major scale (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8), tolerance 25 c, Minor row | Error (today) | E minor (error 0, scale position 3), A minor (0, position 6), D minor (21.5 c) (check) |
| 2 | Same | Root | D minor (9/8), E minor (5/4), A minor (5/3) |
| 3 | Same, Major row | Error / Root | C, F, G in both (all exact, roots 1/1, 4/3, 3/2): the two keys agree here |
| 4 | Hexany 1 3 5 7 (CPS), Otonal row | Factors (today) | order of the lib (check against the real field) |
| 5 | Same | Simplicity | 1:3:5 (15), 1:3:7 (21), 1:5:7 (35), 3:5:7 (105) |
| 6 | Same | Root | by the pitch of each chord's root note (check) |
| 7 | Any ratio field with Group shapes on | any key | the group cards reorder as units (a group sorts by its best member under the key); folds, counts and the Collapse / Expand all ids do not change |
| 8 | Dashed cards (found only at a raised tolerance) | any key | still after the found cards, sorted among themselves by the key |
| 9 | Reload the page | any key | the chosen sort is still selected |

## Decisions for the human
- **D1 Where it applies.** Recommended: cards within a row and roots within a group only (acceptance says sections and folds are unaffected). Alternative: also reorder the family rows by the key (a family sorts by its best card). Scenario 7 shows the recommended.
- **D2 Keys.** Recommended: Error, Root, Simplicity for ratio chords; Factors, Root, Simplicity for CPS (table above). Count of notes is not a key because a size section already separates it.
- **D3 One control or two.** Recommended: one Sort control, one stored value for ratio chords (`chordSort`, default Error) and one for CPS (`cpsSort`, default Factors), shown only when the CPS generator is active. Alternative: one shared key list. The Positional section keeps its own Smoothest | Scale order toggle untouched.
- **D4 Direction.** Recommended: no reverse button (each key has one natural direction: low to high, simple to complex, small error first). Say if you want a reverse toggle.

Storage: `settings.v1` `ui.chordSort` and `ui.cpsSort`, additive, old data loads unchanged (a `DECISIONS.md` H- row when confirmed).

## Human answers (2026-11-16), they replace the recommendations above where they differ
- **D1:** sort only the cards inside a row (and the roots inside a group). Family rows keep the template-list order.
- **D2:** keys as proposed.
- **D3 changed:** ONE shared control and ONE stored value (`ui.chordSort`): Default | Root | Simplicity. Default = today's order (ratio chords: error, then scale position; CPS: the lib's order). The control is the same on every tab; it is not CPS-specific.
- **D4 changed:** a Reverse toggle is added (`ui.chordSortReverse`, default off), applies to the active key including Default.
- **M4b rolled in:** per-note error on the card (below).

## M4b: per-note error on the chord card
Each found chord already carries every note's own signed error against its template (`Voicing.errors`, root first, root = 0); the card currently shows only the largest.
- **Developer option `cardNoteErrors`** (additive in `developer.v1`, default Off): when On, the card gets a fifth line BETWEEN the pitches line (ratios) and the steps line. It lists each note's signed error in cents, in the same order as the pitches (root `0`), each tinted by its own band (same five bands as the card's stat: exact, under 5, 5 to 15, 15 to 30, 30 or more). Hover on a note: its signed error and the template ratio it is measured against.
- **REVISION (human, 2026-11-16): the order is Pitches, Steps, Error, on the card AND in the tooltip.** On the card the Error line (the toggleable fifth line) therefore sits AFTER the steps line, not between ratios and steps. Wherever this file says "between the pitches and the steps", read "after the steps".
- **Color on the card (human, 2026-11-16): BOTH the pitch values and the error values are colored by each note's own error band** (the pitches line: each ratio or cents value tinted by its note's band; the error line: each signed error tinted the same). The root (error 0) takes the `exact` band. With the Developer option Off the pitches line is still colored (the error line is not rendered). A card with no error data (CPS, dashed) keeps plain pitches.
- **Tooltip bug to fix in the same step:** the tooltip reads "Steps steps 315.6, 386.3 c". Cause: the label `<span>Steps</span>` in `pitchDynamic` (`ChordCard.tsx:100`) is followed by the card's steps text, which `fmtSteps` already starts with the word `steps ` (`ChordCard.tsx:22`). Fix: the tooltip shows the value without the leading word (the card's own line keeps `steps ...`). Test: the tooltip text contains "Steps" once.
- **The hover tooltip ALWAYS shows the error line (human, 2026-11-16), whatever the Developer option says.** The card's tooltip (`pitchDynamic` in `ChordCard.tsx`, today "Pitches" and "Steps") becomes three lines in this order: Pitches, Steps, Error. The Error line is the same list of signed per-note errors, each tinted by its band. The option only controls whether the fifth line also sits on the card itself. A card with no error data (CPS chord, dashed card) has no Error line in the tooltip.
- **Card stat becomes `worst (avg)`**: worst = the largest absolute error (as today); avg = the mean absolute error over the NON-root notes (the root is 0 by construction and would only dilute it). Example `28.8 (17.6) c`. Exact chords keep `exact`. Dashed cards (found only at a raised tolerance) keep `+N c`. CPS chords show no error (exact).
- A grouped card shows its first member's figures, as the stat does today.

| # | Chord (template 10:12:15, minor: steps 0, 315.6, 702) | Per-note errors | Worst (avg) |
| --- | --- | --- | --- |
| 10 | 0, 322, 673.2 | 0, +6.4, -28.8 | 28.8 (17.6) |
| 11 | 0, 292.7, 673.2 | 0, -22.9, -28.8 | 28.8 (25.9) (check rounding) |
| 12 | exact chord | 0, 0, 0 | exact |
| 13 | option Off | the fifth line is not rendered; the stat still reads `worst (avg)` | |
| 14 | option Off, hover the card of row 10 | tooltip: Pitches, Error `0, +6.4, -28.8`, Steps | |
| 15 | hover a CPS chord card | tooltip: Pitches, Steps (no Error line) | |

Rows 10 and 11 are the human's example (both read 28.8 c today); the difference is the middle note.

## M4c: the error heat styling, option A (human, 2026-11-16: "I like option A for now"; scope "all", "this will be the new error heatmap styling")
Preview used for the choice: `scratchpad/heat-preview.mjs` (Radix step 11 for text, step 5 for tiles; surfaces `--panel-inset` and `--panel` in both schemes).
- **Five bands stay** (the same thresholds: exact under 1e-6 c, under 5, 5 to under 15, 15 to under 30, 30 or more; `severity()`, `SEV_LABEL`, `data-sev` and the legends do not change). Only the COLORS change, from the hue sweep cyan / green / yellow / orange / red to ONE warm family:

| Band | Text (chord card values, error columns, labels) | Tile (Modes, Pairs Error color and legend, Sketch) |
| --- | --- | --- |
| 0 exact | the plain text color `--text` (NOT blue) | the neutral tile: no tint (the surface it sits on) |
| 1 under 5 c | `--text` mixed with Radix yellow step 11 (about 35% yellow) | the surface mixed with Radix yellow step 4 (about 30%) |
| 2 5 to 15 c | Radix yellow step 11 | Radix yellow, tile steps as today's yellow band |
| 3 15 to 30 c | Radix orange step 11 | Radix orange |
| 4 30 c or more | Radix red step 11 (the red of the ramp's end) | Radix red |

- **Everywhere `data-sev` or the sev tile colors are used:** the chord card (stat, pitch values, error values, tooltip), the Pairs error column and Error color grid, the Modes tiles and their legend, the Sketch row tiles, the Pairs legend. "Exact" is never blue (cyan) again in any of them. Tint strength per look (Tinted, Outlined, Solid) follows the existing tile rules; the neutral band in Tinted and Outlined is an untinted tile with the normal text and the normal border, in Solid a plain surface-colored tile (look for the human to judge).
- **Both schemes, both surfaces:** values must read on `--panel-inset` (the screen) and `--panel`; the contrast of the faint bands is a by-eye judgment (human looks first).
- Checks: a test that no band maps to cyan or green any more (names in `SEV_HUES` / `tileColors`), that band 0 is the neutral, that bands 2, 3 and 4 are yellow, orange and red, and that `severity()` thresholds are unchanged.
