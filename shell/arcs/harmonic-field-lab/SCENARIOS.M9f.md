# SCENARIOS M9f: per-prime complexity in the Monzo header

CONFIRMED 2026-11-18 (human: "4 proposals 1 - ok 2 - ok 3 - ok 4 - ok": F8 L-inf display, F11 total in the corner, F13 Rows view, F14 controls + H-42). From BACKLOG "Per-prime complexity contribution in the Monzo header" (human: "something to go at the headers for each prime"). Human picks: **Bar + percent** ("I think that the bars might need to go above the headers? or we need to reserve spacing for them - no jumpy text"), **Count octaves toggle, default on**, **follow Measure**, **L1 / L2 / L-inf selector**.

Contribution of prime p: a_p = |e_p| x log2 p. Example 81/80 = [-4 4 -1>: a_2 = 4.00, a_3 = 6.34, a_5 = 2.32.

## What is split
| # | Case | Interval split |
| - | ---- | -------------- |
| F1 | Measure Step, painted 81/80, nothing hovered | 81/80: 2 -> 32, 3 -> 50, 5 -> 18 (L1, with 2) |
| F2 | Measure Landing (or backtick held), source 5/4, painted 81/80 | landing 81/64 = [-6 4 0>: 2 -> 49, 3 -> 51, 5 -> empty |
| F3 | Hover preview: painted 81/80, pointer on 7 at +1 | preview [-4 4 -1 1> (15.47): 2 -> 26, 3 -> 41, 5 -> 15, 7 -> 18; leaving the matrix returns to F1 |
| F4 | Alt held (inverse shown, [4 -4 1>) | same shares as F1 (sizes do not depend on sign) |
| F5 | Painted 1/1 (all zero) | every bar empty, every percent slot blank; nothing moves |

## Norm selector (L1 default) and Count octaves (default on)
| # | 81/80 | Count octaves ON | Count octaves OFF |
| - | ----- | ---------------- | ----------------- |
| F6 | L1 (Tenney): share = a_p / sum a | 2 -> 32, 3 -> 50, 5 -> 18 (total 12.66) | 3 -> 73, 5 -> 27 (total 8.66); 2 shows a dimmed empty slot |
| F7 | L2 (TE): share = a_p^2 / sum a^2 (adds to 100 % of the squared norm) | 2 -> 26, 3 -> 65, 5 -> 9 (norm 7.85) | 3 -> 88, 5 -> 12 (norm 6.75) |
| F8 | L-inf: the norm is the largest a_p | bars are a_p / max: 2 -> 63, 3 -> 100, 5 -> 37; the label row shows "max" under 3 only (proposal) | 3 -> 100, 5 -> 37; "max" under 3 |

## Layout (no jumpy text)
| # | Rule |
| - | ---- |
| F9 | A fixed band ABOVE the prime header row, always reserved even when every share is zero: top line = percent (tabular figures, fixed width, blank when 0), below it the bar, bottom-aligned on the header line and growing upward. Nothing in the matrix shifts when values change. The panel grows by this band once (`STRIP_AREA_ROWS` + the band). |
| F10 | Bar color = that prime's hue (`primeTextColor`, as the header text since K12); prime 2 in plain text color. |
| F11 | The corner cell above the exponent labels shows the total (L1: "12.66", L2: "7.85", L-inf: "6.34") in the same fixed band. |
| F12 | Hovering a prime's header or bar shows a tooltip with the exact numbers: "3: 6.34 of 12.66 (50 %), L1, octaves counted". |
| F13 | Rows view: the same bar + percent at the right end of each prime's row, in a fixed-width slot (proposal). |
| F14 | Controls: "Norm L1 \| L2 \| L-inf" and a "Count octaves" checkbox in the Monzo controls next to Matrix \| Rows; saved in `settings.v1` (new decision H-42); absent or damaged = L1 / on; no write on mount. |
