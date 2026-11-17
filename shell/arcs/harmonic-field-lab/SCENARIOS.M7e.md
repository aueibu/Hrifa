# M7e scenarios: hover + 1, 4, 5 on a library chord

CONFIRMED by the human 2026-11-17 (key 1 like the chord card; when the chord is not found, key 1 falls back to the rounded sound rooted on the field's 1/1, the stepper's root if the field has no 1/1; no closest-chord row: the roots table keeps its `Not found in this subset at this tolerance.` message). Figures come from a script over the 5-limit major scale (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8) and the finder's rule (`scratchpad/roots_stats.py`); a builder asserts them against the real code.

## Rules
Hold a key while the pointer is on a library row, a shape heading, or a root row of the roots table. **Roots (human, B, 2026-11-17):** key 1 plays from the root the ring shows: the hovered root row, else the pinned root, else the M7c default (when found: the stepper's root if it is one of the found roots, else the lowest found root; not found: the stepper's root; none: 1/1). Keys 4 and 5 play from the Sketch stepper's root, like the chord chips, wherever the chord is found; a hovered or pinned root row is an explicit choice and overrides it for all three keys. Moving the stepper while a key is held moves the sounding root. The ring keeps drawing the chord from its own root; the green marks (below) show what actually sounds.
- **1 = like the chord card.** When the chord is found on the ring's root at the current tolerance: the finder's voicing there, your own field notes (a chord card's key 1; like a dashed card, a chord not found at this tolerance is NOT played by this rule).
  - **Not found at the current tolerance:** plays like key 4, rooted on the field's 1/1 note (the stepper's root if the field has no 1/1).
- **4 = rounded to the nearest notes.** Each chord note at the nearest note of the ring's comparison set (the Field | Subset switch), the octave of the chord note kept (pitch = the chord note's pitch minus its signed error). This is what the ring's flags and readout show.
- **5 = exact ratios** from that root (the stepper's, per the roots rule above).

## Sounding pitches on the library ring (human, 2026-11-17)
While a key sounds, the ring marks what sounds the way the main pitch ring does (same source: the lab's `sounding` field notes and the sounding ghosts, same shared marks): a field note that sounds is lit green (the main ring's lit dot, r 8); a sounding pitch that matches no field note is a green dashed, unfilled circle (the main ring's ghost, r 8) at its true place. They sit over the chord's own dots and disappear when the sound stops.

Keys 1, 4 and 5 on chord cards, chips and shelf slots are unchanged (they use the Sketch stepper's root; the library uses the ring's root).

## Scenarios

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| 1 | 5-limit major scale, tolerance 25, default root 9/8 | Hover `10:12:15 Minor Triad`, hold 1 | Plays 9/8, 4/3, 5/3 (the finder's notes on root 9/8). |
| 2 | Same, stepper root 5/3 (one of the found roots) | Hold 4 | Plays from the stepper's 5/3 (4 and 5 follow the stepper): 5/3, 1/1, 5/4 (exact there). Hold 1 plays the same: the stepper is one of the found roots, so the ring's root is 5/3 too (the M7c tie-break). Key 1 stays on 9/8 only when the stepper is NOT a found root (row 3). |
| 3 | Same, stepper root 1/1 (NOT a root where 10:12:15 is found) | Hold 1, 4, 5 in turn | 1: from the ring's root 9/8: 9/8, 4/3, 5/3. 4: from 1/1, rounded: 1/1, 5/4 (6/5 rounds to 5/4, 70.7 c), 3/2. 5: exact from 1/1: 1/1, 6/5 (315.6 c), 3/2. Move the stepper to 5/3 while holding 4 or 5: the sound moves to 5/3. |
| 3b | Row 3, hold 5 | Look at the ring | 1/1 and 3/2 light green (field notes that sound), 6/5 (315.6 c) is a green dashed circle (it matches no field note). Hold 4: 1/1, 5/4, 3/2 light green, no ghost. Hold 1: 9/8, 4/3, 5/3 light green. Release: the green marks go. |
| 4 | Same, pointer on the `5/3` row of the roots table | Hold 1, 4, 5 in turn | All three play from 5/3 (5/3, 1/1, 5/4, exact there). Moving to the `5/4` row while a key is held changes the sounding root to 5/4. |
| 5 | Tolerance 0, stepper root 5/4 | Hover `4:5:6:7`, hold 1 | Not found at 0 c, so key 1 plays like key 4 rooted on the field's 1/1: 1/1, 5/4, 3/2, 5/3 (7/4 rounded to 5/3, 84.5 c flat). The ring and roots table still show the chord from the stepper's 5/4 and the message `Not found in this subset at this tolerance.` |
| 6 | Same | Hold 4 | Rounded from the ring's root 5/4: 5/4, 3/2 (25/16 rounded), 15/8, 9/4 (35/16 rounded to 9/8, an octave up). |
| 7 | Same | Hold 5 | Exact on 5/4: 5/4, 25/16, 15/8, 35/16. |
| 8 | Subset 1/1, 5/4, 3/2 only (3 notes), ring on Subset, stepper root 1/1 | Hover `4:5:6:7`, hold 1 | Not found (a 3-note subset cannot hold 4 distinct notes): plays like key 4 on 1/1: 1/1, 5/4, 3/2 and 7/4 rounded to the nearest SUBSET note, the octave of 1/1 (231.2 c away; 3/2 is 267 c away), as 2/1. With the ring switch on Field, 7/4 rounds to 5/3. |
| 9 | Same | Hold 4, then 5 | 4: the same rounding from the ring's root (1/1). 5: exact 1/1, 5/4, 3/2, 7/4. |
| 10 | A field with no 1/1 note and a chord not found | Hold 1 | The rounded sound is rooted on the stepper's root. |
| 11 | Folding row (`1:2:3`) | Hold 1, 4, 5 | 5: exact ratios with their real octaves. 1 and 4: nothing can be found (it folds), so both play rounded notes (1 rooted on the field's 1/1, 4 from the ring's root); never silent, never an error. |
| 12 | Pointer leaves the row | | Sound stops (as today). |
| 13 | A pinned root on the selected chord, pointer on another library row | Hold 1 | The other row plays from its own root (its found root, or the rule above), not the pin. |
| 14 | Library row tooltip | Look | The controls table lists hold 1, 4 and 5 with these meanings in the lab's format; the `libraryRing` and `libraryRoots` tips say the keys follow the root the ring shows. |

## Not in M7e
A Play (click) button on a library row; different voicings or inversions; the Parallel | Relative switch (these keys use absolute pitch); a closest-chord row (idea dropped by the human).
