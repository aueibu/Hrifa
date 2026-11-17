# M7d scenarios: "Found on N roots" under the ring (stats per position, pick the root)

DRAFT 2026-11-17, the design is confirmed by the human (hover previews a root, click pins it; the finder runs on hover without marking the row checked; Worst and Avg only). Nothing is built. Numbers come from a script (`scratchpad/roots_stats.py`) over the 5-limit major scale (1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8) with the finder's error rule (the field note the chord uses minus the template's ideal pitch, the Chords panel cards' rule); a builder must assert them against the real finder, not these hand figures.

## What it adds
In the left column of the chord library dialog, under the readout table, a small table **Found on N roots** for the chord being shown (the last hovered or checked row), one row per root where the finder finds it in your subset at your tolerance: `Root`, `Worst`, `Avg`. Worst = the largest absolute error of the chord on that root; Avg = the mean absolute error over its notes except the root (`errorStats`, the card stat `worst (avg)`). Values use the lab's heat colors. Roots run in the subset's order, low to high.

- **Hover a root row** previews that root: the ring, the readout and hold 1 use it while the pointer is on the row.
- **Click a root row** pins it: the ring, readout and hold 1 stay on that root after the pointer leaves; the row shows a quiet marker. Click it again to unpin.
- **Which root when nothing is hovered or pinned:** the rule already built (found root; if several, the stepper's root when it is one of them, else the lowest; not found: the stepper's root).
- A chosen chord (hovering another library row, or Check) resets the pin. Changing the subset or the tolerance recomputes the table; a pinned root that is no longer found is dropped.
- The finder runs for the shown chord (one template) as soon as it is shown, without Check: the row does NOT become checked and `Clear checks (N)` does not change. (Check still only means "keep this row's result under the row".)

## Scenarios

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| 1 | 5-limit major scale, tolerance 0, stepper root 1/1 | Hover `10:12:15 Minor Triad` | Table `Found on 2 roots`: `5/4` Worst 0.0 Avg 0.0; `5/3` Worst 0.0 Avg 0.0. The ring shows the chord from 5/4 (the lowest found root; 1/1 is not one of them). |
| 2 | Same, tolerance 25 | Same row | `Found on 3 roots`: `9/8` Worst 21.5 Avg 21.5; `5/4` 0.0 / 0.0; `5/3` 0.0 / 0.0. The default root is now 9/8 (the lowest found root), so the ring shows the 9/8 chord. |
| 3 | Row 2 | Move the pointer onto the `5/3` row of the table | The ring, readout and hold 1 show the chord from 5/3. Move off: back to the default root 9/8. |
| 4 | Row 2 | Click the `5/3` row, then move to the library list | Still from 5/3 (pinned, marked). Click the row again: unpinned, back to 9/8. |
| 5 | Row 4 pinned on 5/3 | Hover a different library row | The table and ring switch to that chord; the pin is gone. |
| 6 | Tolerance 90, stepper root 1/1 | Hover `4:5:6:7 Harmonic Dominant Seventh` | `Found on 5 roots`, low to high: `1/1` Worst 84.5 Avg 28.2; `5/4` 70.7 / 39.8; `4/3` 63.0 / 21.0; `3/2` 27.3 / 9.1; `5/3` 70.7 / 39.8. The ring shows it from 1/1 (found there, and it is the stepper's root). |
| 7 | Tolerance 0 | Hover `4:5:6:7 Harmonic Dominant Seventh` | The table says `Not found in this subset at this tolerance.` (7/4 is not in the field). The ring shows it from the stepper's root (as in M7c row 4). |
| 8 | Tolerance 30 | Same row | `Found on 1 root`: `3/2` Worst 27.3 Avg 9.1 (a single line is fine; the ring shows it from 3/2). |
| 9 | Subset of 1 note, or more than 128 | Hover any row | The usual range hint instead of a table (the same sentence as Check). |
| 10 | A folding row (`1:2:3`) | Hover | No table; the M7c folding note (`Octave notes merge in this repeat; the finder skips it here.`) is shown where the table would be. |
| 11 | Row 2, hover only (never Check) | Look at the list | The `10:12:15` row is not checked; `Clear checks` is absent. |
| 12 | Row 4 pinned on 5/3 | Change the tolerance to 0 | `5/3` is still found (0.0), the pin stays. Change the subset so 5/3 is not in it: the pin is dropped and the default root applies. |
| 13 | A chord with 8 notes found on 6 roots | Look at the left column | The readout (ring detail) has a maximum height and scrolls; the roots table keeps its own rows (about 5 visible, then it scrolls); neither pushes the other off the column. |
| 14 | Any chord | Hover a root row, hold 1 | Sounds the chord at that root's pitch (exact ratios), as in M7c. |
| 15 | Reload the page | Open the dialog | No pin and no shown chord (runtime only, nothing new is stored). |

## Decisions (answered by the human 2026-11-17)
Hover previews, click pins; the finder runs on hover without marking the row checked; Worst and Avg only. Storage: none (runtime state of the dialog). Error rule: the Chords panel's (the finder's), not the ring flags' nearest-note rule, so the table matches the cards; the two can differ when two chord notes compete for one field note, and the ring readout is unchanged.

## Not in M7d
More stats (per-note spread, odd limit of the position), sorting the roots, a Check-column in the table, the same table for the Chords panel chips.
