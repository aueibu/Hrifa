# M8 scenarios: relative-pitch generator (a radial picker on the main ring)

CONFIRMED by the human 2026-11-17 (second version, replaces the row-list draft; see "Human answers"). Every number below was computed by hand and must be re-checked by a script before it becomes a test.

## What it is

A new generator method, "Relative pitches". Its field is simply the notes you have placed, starting with 1/1 alone. There are no steps and no dependencies: picking a ratio from a note puts the new note in the field, and from then on it is an ordinary note. Deleting a note removes only that note.

## How you use it (confirmed so far)

1. On the main pitch ring, turn on the Relative mode (for a Relative pitches generator) and click a note on the ring.
2. A radial menu opens around that note: the clicked note is at the top (like 1/1 on the main ring), going clockwise raises the pitch. Four rings, mousing outward goes to more complex ratios.
3. Each ratio is one button, split into an upper and a lower click box. Upper = the ratio ABOVE the clicked note, lower = the ratio BELOW it. A divider line between the halves shows on hover.
4. Clicking a half adds that note to the field. Results fold into the repeat (2/1 by default), equal pitches merge.

## The rings: odd limit, steps of 5 (the human chose to start here)

| Ring | Odd limits | New ratios | Some of them |
| ---- | ---------- | ---------- | ------------ |
| 1 | 3 to 5 | 6 | 4/3, 3/2, 5/4, 6/5, 8/5, 5/3 |
| 2 | 7 to 9 | 12 | 7/4, 7/5, 7/6, 8/7, 10/7, 12/7, 9/8, 10/9, 9/7, 14/9, 9/5, 16/9 |
| 3 | 11 to 15 | 30 | 11/8, 11/6, 11/10, 13/8, 13/12, 15/8, 15/14 and others |
| 4 | 17 to 19 | 34 | 17/16, 17/12, 19/16, 19/12 and others |

The step (5) is a Developer option. A ratio is in a ring by its odd limit (the largest odd number left once the factors of 2 are removed): 16/9 is odd limit 9.

## Scenarios (your real cases to confirm)

| # | Setup | Action | Result |
| - | ----- | ------ | ------ |
| 1 | A new Relative pitches generator | Look at the field | One note, 1/1. |
| 2 | Field 1/1 | Click 1/1, click the upper half of 3/2 (ring 1) | Field 1/1, 3/2. |
| 3 | Field 1/1, 3/2 | Click 3/2, click the upper half of 11/6 (ring 3) | 3/2 x 11/6 = 11/4, folded to 11/8 is added. Field 1/1, 11/8, 3/2. |
| 4 | Same | Click 3/2, click the LOWER half of 11/6 | 3/2 / (11/6) = 9/11, folded to 18/11 is added. |
| 5 | Same | Click 18/11, click the lower half of 9/8 (ring 2) | 18/11 / (9/8) = 16/11 is added. Your whole example (scenarios 2 to 5) gives 1/1, 11/8 (551.3 c), 16/11 (648.7 c), 3/2 (702.0 c), 18/11 (852.6 c). |
| 6 | Field 1/1 | Click 1/1, click the lower half of 3/2 | 4/3 (2/3 folded): field 1/1, 4/3. |
| 7 | Field 1/1 | Click 1/1, click the upper half of 4/3 | 4/3 is added: the same note as scenario 6 (lower half of 3/2). The ring offers every pitch two ways. |
| 8 | Field 1/1, 3/2 | Hover the lower half of 11/6 while 3/2 is the center | Before any click: the divider line shows, a ghost dot appears at the landing spot on the ring, and a readout says `11/6 below 3/2 = 18/11 (852.6 c)`. |
| 9 | Field 1/1, 3/2, 9/8 | Click 1/1, click the upper half of 9/8 | Nothing changes (9/8 is already there); a quiet line says it is already in the field. |
| 17 | Field 1/1, 3/2 | Click 3/2, switch to Monzo, set 7 to +1 | Before Add: ghost dot at 21/16, readout `7/4 above 3/2 = 21/16 (470.8 c)`. Add: field 1/1, 21/16, 3/2. |
| 18 | Same | Click 3/2, Monzo, set 7 to -1 | 3/2 / (7/4) = 6/7, folded to 12/7 (933.1 c). |
| 19 | Field 1/1 | Click 1/1, Monzo, set 3 to +2 and 5 to -1 | 9/5 (1017.6 c). |
| 20 | Field 1/1 | Click 1/1, Monzo, set 3 to +12 | 531441/524288 (23.5 c, the Pythagorean comma); 3 cannot go past +12 (range -12 to +12, human 2026-11-17, replacing -6 to +6). |
| 21 | Monzo set to 7: +1 from row 17 | Close the menu, click 1/1, open Monzo | The rows still read 7: +1 (the values are kept while the page is open, not stored); the ghost dot is at 7/4 above 1/1 = 7/4 (968.8 c). |
| 22 | Same | Press Reset in the monzo popup | Every row goes to 0; the ghost dot sits on the clicked note itself. |
| 10 | Field 1/1 | In Monzo mode, in the typed box under the rows, type `700` and choose Above | A note at 700.0 c is added (a bare number is cents; it has no ratio, like an EDO note). |
| 11 | Field 1/1 | In the box type `23/16`, choose Above | 23/16 is added (a typed ratio can be beyond the four rings). |
| 12 | Field 1/1 | In the box type `abc`, `0`, `3/0` | Refused inline: "Type a ratio such as 3/2, or cents such as 700"; the field stays as it was. |
| 13 | Field 1/1, 11/8, 3/2, 18/11 | Select 3/2 and delete it | Only 3/2 goes; 11/8 and 18/11 stay. |
| 14 | The five-note example | Set Odd limit 9 in the gear | Only 1/1 and 3/2 remain visible (11/8, 16/11, 18/11 contain 11). The filter runs after the build, as on every method; the notes are not deleted, turning the limit off brings them back. |
| 15 | The five-note example saved as a preset, reloaded | Open it | The same 5 notes. The stored preset holds the notes and nothing computed. |
| 16 | Developer ring step set to 4 | Open the menu | The rings are odd limits 3, 5 to 7, 9 to 11, 13 to 15 (2, 10, 16, 20 ratios). |

Scenario 7 is a check that you want the redundancy: because folding makes "R below" the same note as "2/R above", every pitch has two buttons that reach it.

## Human answers (2026-11-17)

- D6: screen top / bottom split. D8: as recommended, judged at the look. D9: not in M8 (BACKLOG). Storage: H-33 OK.
- D7 replaced by a **Monzo** mode: a `Rings | Monzo` switch in the menu's center; rows for primes 3, 5, 7, 11, exponents -6 to +6 with - and + buttons (2 is folded away); a ghost dot and readout follow the values; Add places the note; the values are kept between openings (not stored) and a Reset button zeroes them (rows 21, 22); the typed box (ratio or cents, Above / Below) sits under the rows (rows 10 to 12, 17 to 21).
- Steps: M8a lib and state; M8b ring menu thin slice; M8c Monzo mode and typed box thin slice.
- **Monzo strips (human, 2026-11-17, for M8c):** the default monzo input is a cascading strip picker, like file-browser columns. The primes 2 and the first 12 odd primes (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41: 13 strips for every repeat; with 2/1 the 2 strip has no effect, with 3/1 the 3 strip has none) sit in a row, each exponent -12 to +12 (human, widened from 3 to 11 and ±6; exact via BigInt); hovering a prime opens a vertical strip of its exponents (+12 at the top to −12 at the bottom); moving up or down picks a value; moving right opens the next prime's strip. Each strip opens with its CURRENT value level with the cursor (0 the first time, the kept value afterwards), so the strips step up and down. Hovering sets the value at once (ghost dot and readout follow); a click in the strips adds the note. Moving left goes back to the previous prime with its value kept. A switch shows the −/+ rows instead (exact input); both edit the same kept values, and Reset zeroes them.

| # | Setup | Action | Result |
| - | ----- | ------ | ------ |
| 23 | Click 1/1, Monzo strips, all values 0 | Hover 3, move up one row (+1) | Ghost at 3/2; readout `3: +1  5: 0  7: 0  11: 0`. |
| 24 | Same | Move right onto 5, then down one row (−1) | The 5 strip opened with 0 level with the cursor at the +1 row of strip 3; now 5 = −1; ghost at 3/2 × 4/5 = 6/5 (315.6 c). |
| 25 | Same | Click | 6/5 is added. |
| 26 | Kept values 7 = +1 (row 21) | Open the menu, hover 3, then move right to 5, then to 7 | The 7 strip opens with +1 level with the cursor; staying still keeps 7 = +1. |
| 27 | Strips showing | Switch to the −/+ rows | The rows show the same values the strips set. |

## Open decisions as first drafted (kept for the record)

- **D6, where the split falls.** Recommended: the buttons split literally upper half and lower half on the screen, with a horizontal divider on hover. Risk: on the sides of the ring (3 and 9 o'clock) the buttons are tall and narrow, so upper and lower are still just two stacked boxes; at the top and bottom they are wide and short. The alternative is a split along the ring's direction (clockwise half = above, counter-clockwise half = below), which stays the same shape all the way round.
- **D7, typing a ratio or cents.** Recommended: a small box in the center of the menu with Above and Below buttons (scenarios 10 to 12). Without it the cents steps you confirmed (D2) have no place.
- **D8, label spacing.** Recommended: each ring spreads its labels evenly in pitch order, with a small tick at the true angle. Rings 3 and 4 (30 and 34 ratios) may need dots with a hover label if the labels are too crowded; decided when you see it.
- **D9, the toggle to delete notes built from a note.** Recommended: not in M8. It needs each note to remember where it came from (more stored data); today the field is just the notes. Logged in `BACKLOG.md`.

## Storage (needs your OK, then `DECISIONS.md` `H-33`)

Generator settings gain the method `relative` with `notes`: the placed notes as pitches (exact ratio text, or cents), written only for this method. They enter the generator's identity (`genKey`) only for this method, so every stored preset keeps its identity. An older version of the app reading it falls back to harmonic. At most 256 notes. The ring step is a Developer option in `developer.v1`.

## Plan

M8a: lib and state with tests, no UI (the ring contents by odd limit with the step, landing pitch from a note, a ratio and a direction, folding, duplicates, typed input, `genKey`, persistence, presets). M8b: the radial menu as a thin slice on the main ring, then STOP for you to look, with no sound until you ask. No reviewer, gate or commit until you approve.
