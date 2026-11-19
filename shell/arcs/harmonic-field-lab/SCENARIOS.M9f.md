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

## M9f look 1 (human, 2026-11-18): "all works as described", plus changes
| # | Case | Result |
| - | ---- | ------ |
| F15 | Fit bars (new checkbox next to Count octaves, saved as `monzoSplit.fit`, default OFF, H-42 amended) | On: the tallest counted bar fills the bar zone, the others in proportion (81/80 L1: bars 63 / 100 / 37, numbers stay 32 / 50 / 18; L2: bars 40 / 100 / 13, numbers 26 / 65 / 9). Off: bar = share (today). L-inf is unchanged (already against the largest). |
| F16 | Count octaves off: prime 2's slot | A dashed outline GHOST bar at the height prime 2 would have on the same scale (81/80 L1: 4.00 / 8.66 = 46 % of the zone; with Fit on 4.00 / 6.34 = 63 %), no number; tooltip says "not counted". Zero exponent on 2: nothing. |
| F17 | Rows view: ONE column of primes (human: "we have the space") | 13 rows, 2 to 41, top to bottom (no second column). |
| F18 | Rows view: bar placement | Each row: prime, [-], value, [+], then its bar and number right beside the + button. A zero row shows no track and no number. Same Fit / Count octaves / ghost rules as the band. |
| F19 | Click an exponent label (e.g. +1) | Sets ALL 13 primes to that value: [1 1 1 1 1 1 1 1 1 1 1 1 1> (step about +134.7 c reduced). Click 0 = clear all (as Reset). With Alt held (inverse shown) it sets the shown value (stores the negation), as K14. Not an Add. |
| F20 | Shift buttons | A gutter LEFT of the exponent labels: [+] on the +1 row, [-] on the -1 row. [+] adds 1 to every prime of the frozen set, [-] subtracts 1. |
| F21 | Frozen set | The primes nonzero when shifting started. Kept across consecutive shifts (a prime may pass through 0 and come back); a paint, Add, Reset, label click, typed entry or pin-card load starts a new set. From 81/80: + -> [-3 5 0> = 243/128; + -> [-2 6 1>; - -> [-3 5 0>; - -> [-4 4 -1> = 81/80 (round trip). |
| F22 | Edges and empty | A shift that would take any frozen prime past +12 / -12 is refused (button disabled, tooltip says which prime); 1/1 (empty set) disables both buttons. |
| F23 | Alt held during a shift | Shifts the shown (inverse) view: [+] raises the SHOWN values (stores -1 on each), consistent with K14. |
| F24 | Runtime only | The frozen set is not saved; closing the picker forgets it. |

## M9f look 2 (human, 2026-11-18): "looks good", one change
| # | Case | Result |
| - | ---- | ------ |
| F25 | Monzo open, pointer not on the matrix, the rows or a pin card; hold 1 / 4 / 5 | They sound the ghost (the painted landing, or the Alt-shown inverse; Step/Landing as usual): 1 = the ghost alone, 4 = source + ghost (or 1/1 + ghost under Landing), 5 = field + ghost. Over the matrix or rows the hovered preview still wins; a hovered pin card still wins over both. Before: silent off the matrix. |
