# M2 scenarios: prime factorization per ratio

CONFIRMED by the human 2026-11-16 (D1 as proposed; D2 changed by the human; D3 as proposed; Tenney height added). Tests come from this table, not from cases where the options coincide. Values were computed exactly (`scratchpad/m2-examples.mjs`). M2 is display only: nothing new is stored, so no stored-data change.

**What exists today (read from the code):** the "Point at a note (Alt+click pins it)" card is `Inspector` in `RingStats.tsx`, rows `cents`, `monzo`, `12-EDO`, `vs JI`. Its `monzo` row prints the product of powers (`fmtMonzo` in `state/derive.ts`: `2^-3 3^2`; the word `irrational` for a note with no monzo). The Field table (compact, and the "Field table" window, `FieldPanel.tsx`) has In, Ratio, Cents, ±12-EDO.

## Decisions (human, 2026-11-16)
- **D1 (confirmed):** top / bottom is the readable form (`3² / 2³`); the monzo vector is the exact form (`[-3 2⟩`).
- **D2 (human's change):** the prime spot is the "Point at a note" card, not a new hover hint. The card's `monzo` row shows the monzo VECTOR in place of the product of powers (`[-3 2⟩` for 9/8, not `2^-3 3^2`). Two rows are added to the same card: `top / bottom` and `Tenney`. The Field table gets the same three as columns. The existing Stats panel already shows prime limit and mean Tenney for the whole subset, so no limit rows are added.
- **D3 (confirmed):** 1/1 shows `1`; a note with no exact monzo shows `—` in the new `top / bottom` and `Tenney` rows and in the table's new columns, never `0` and never blank. The card's existing `monzo` row keeps its present word `irrational` for such a note (the human did not ask to change it; look at it when trying the slice).
- **Vector format:** exponents of every prime from 2 up to the highest prime in the note, zeros included, `[` and `⟩`: 9/8 `[-3 2⟩`, 15/8 `[-3 1 1⟩`, 7/4 `[-2 0 0 1⟩`, 5/3 `[0 -1 1⟩`. 1/1 is `[ ⟩`.
- **Top / bottom format:** primes joined by `·`, exponents as superscripts, nothing on one side written `1`: 15/8 `3·5 / 2³`. Tenney height is log₂(top × bottom), two decimals (15/8 is 6.91), the same rounding as the Stats panel's Mean Tenney.

## Values (one source of truth for tests)

| Note | Top / bottom | Monzo vector | Tenney |
| --- | --- | --- | --- |
| 1/1 | `1` | `[ ⟩` | 0.00 |
| 9/8 | `3² / 2³` | `[-3 2⟩` | 6.17 |
| 5/4 | `5 / 2²` | `[-2 0 1⟩` | 4.32 |
| 4/3 | `2² / 3` | `[2 -1⟩` | 3.58 |
| 3/2 | `3 / 2` | `[-1 1⟩` | 2.58 |
| 5/3 | `5 / 3` | `[0 -1 1⟩` | 3.91 |
| 15/8 | `3·5 / 2³` | `[-3 1 1⟩` | 6.91 |
| 11/8 | `11 / 2³` | `[-3 0 0 0 1⟩` | 6.46 |
| 13/8 | `13 / 2³` | `[-3 0 0 0 0 1⟩` | 6.70 |
| 7/4 | `7 / 2²` | `[-2 0 0 1⟩` | 4.81 |
| 7/5 (repeat 3/1 field) | `7 / 5` | `[0 0 -1 1⟩` | 5.13 |
| 531441/524288 | `3¹² / 2¹⁹` | `[-19 12⟩` | 38.02 (log₂(531441·524288)) |

(The builder recomputes Tenney exactly with `tenneyHeight` in the lib and checks these two-decimal values; if a value here is off by rounding, the lib wins and this table is corrected.)

## Rows (Field A: the 5-limit major scale 1/1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8; Field B: Harmonics 8 to 15)

| # | You do | Expected |
| --- | --- | --- |
| 1 | Point at 15/8 in Field A (ring, strip or table) | Card header `15/8`; rows: cents, monzo `[-3 1 1⟩`, top / bottom `3·5 / 2³`, Tenney `6.91`, 12-EDO, vs JI. |
| 2 | Point at 9/8, then 3/2 | 9/8: `[-3 2⟩`, `3² / 2³`, 6.17. 3/2: `[-1 1⟩`, `3 / 2`, 2.58. |
| 3 | Point at 1/1 | monzo `[ ⟩`, top / bottom `1`, Tenney `0.00`. |
| 4 | In Field B point at 11/8, 13/8 and 7/4 | `[-3 0 0 0 1⟩` `11 / 2³` 6.46; `[-3 0 0 0 0 1⟩` `13 / 2³` 6.70; `[-2 0 0 1⟩` `7 / 2²` 4.81. |
| 5 | Switch to 12-EDO and point at the 700 c note | monzo row still says `irrational`; top / bottom `—`; Tenney `—`; nothing reads `0` or is blank. |
| 6 | Point at nothing | The card shows its dashes as today, including the two new rows. |
| 7 | Alt+click 15/8 to pin it, then move the mouse away | The card keeps showing 15/8 with the three values and the `pinned` badge (as today). |
| 8 | Open the Field table (compact) and the Field table window in Field A | Three new columns after Ratio, with the values of the table above for each row; the irrational case in 12-EDO shows `—` in all three. |
| 9 | Look at the new cells with a screen reader (or inspect the accessible names) | Top / bottom cell: words, not superscripts ("3 to the 2, over 2 to the 3"); vector cell: "monzo: exponents of 2 and 3, minus 3 and 2" or similar; Tenney: the number. |
| 10 | Hover, pin, sound, play and include rows in the table as before | Unchanged (the columns add no click behavior). |
| 11 | Reload | Nothing new is stored; the same look returns. |
| 12 | Look at the compact table at its narrowest panel width | The three new columns fit or the table scrolls sideways inside its box; no overlap with In, Ratio, Cents. (BY EYE: the human decides the layout.) |

## Look-judged part
Rows 1 to 4 and 8 are logic (confirmed values). Row 12 and the look of the card (spacing of the two new rows, the vector in the monospace Num style) are by eye: the builder makes a thin slice, then the orchestrator stops and the human tries it before a reviewer, gate or commit.
