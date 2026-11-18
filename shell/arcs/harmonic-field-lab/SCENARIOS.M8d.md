# M8d scenarios: the meta ring (ratios near one interval)

DECISIONS ANSWERED by the human 2026-11-17 (see "Human answers" at the end); the table rows are checked at the look. Built on the full-screen Relative popup with 9 rings (kept 2026-11-17).

Human's words: "if the user say ctrl-clicked on an interval in the radial rings popup they could see like that interval and all the ratios that fall within that same say 20 c span up to like the 50th prime ... a meta ring that appears over the other one that shows the ratios in a spiral as they get more complex".

Every number below was computed by a script (`scratchpad/meta.py`, `window.py`): ratios folded into 2/1, numerator and denominator coprime, every prime at most 229 (the 50th prime), odd limit at most the ceiling.

## How it works (proposed)

1. In Rings mode, **Ctrl+click** a ratio cell. (Ctrl alone has no meaning in Rings mode today; in Monzo mode Ctrl paints a line, so the meta ring is Rings mode only.)
2. The meta ring opens over the bands (the bands dim; the small center ring with the ghost stays).
3. **Angle = cents away from the clicked ratio.** The clicked ratio sits at noon. The window (20 c, that is ±10 c) is spread over 300° of the circle, so 1 c is 15°; the gap at the bottom (6 o'clock) is the seam, labeled `−10 c` on the left and `+10 c` on the right, so the two ends never meet.
4. **Distance from the center = complexity:** the clicked ratio innermost, the ceiling at the outer edge.
5. Near a simple ratio the only other ratios are complex, and they close in from alternating sides: this is the spiral. A line joins the dots in order of complexity (like the Monzo sparkline), so it zigzags inward toward noon.
6. Dots have no labels (up to ~180 of them); hover names one. Hover, Alt, hold 1 / 4 / 5 and click work exactly as on a ring cell. The meta ring stays open after a click so you can add several.
7. Esc, or Ctrl+click outside the dots, closes it; the bands come back where they were.
8. Settings in a corner of the meta ring: Span (default 20 c), Prime limit (default 229), Ceiling (odd limit, default see D3). Kept while the page is open, not stored.

## Scenarios

| # | Setup | Action | Result |
| - | ----- | ------ | ------ |
| 1 | Field 1/1, clicked 1/1, ceiling 63 | Ctrl+click the 5/4 cell | Meta ring with 13 dots: 5/4 at noon, innermost. 44/35 (+9.9 c) and 46/37 (−9.4 c) near the seam on either side, 76/61 (−5.7 c) and 74/59 (+5.9 c) nearest noon on the outside. |
| 2 | Same | Hover the 56/45 dot | Ghost on the center ring at 378.6 c; readout `56/45 above 1/1 = 56/45 (378.6 c) · −7.7 c from 5/4`. |
| 3 | Same | Click the 56/45 dot | 56/45 is added; the meta ring stays open. |
| 4 | Field 1/1, 3/2, clicked 3/2, ceiling 63 | Ctrl+click 5/4, then click 56/45 | 3/2 × 56/45 = 28/15 (1080.6 c) is added. With Alt held: 3/2 ÷ 56/45 = 135/112 (323.4 c). |
| 5 | Clicked 1/1, ceiling 63 | Ctrl+click 3/2 | Only 4 dots: 3/2, 88/59 (−9.8 c), 92/61 (+9.4 c), 94/63 (−9.2 c). A simple interval is lonely. At ceiling 127: 50 dots. |
| 6 | Clicked 1/1, ceiling 63 | Ctrl+click 11/8 | 14 dots; the nearest is 84/61 (+2.6 c), the simplest neighbor 26/19 (−8.3 c). |
| 7 | 5/4 at ceilings 63, 127, 229 | Change the Ceiling | 13, 54, 174 dots. |
| 8 | Meta ring open | Press Esc | It closes; the ring steps and the clicked note are unchanged. |
| 9 | Meta ring open, over a dot | Hold 1, 4, 5 | As on a cell: the new pitch, picked + new, field + new. |

## Decisions (the options give different results)

**D1. What "more complex" means (the distance from the center and the order of the line).** Around 5/4:
- A (recommended) odd limit, the same measure as the rings: 5/4, 44/35, 46/37, **54/43, 56/45, 49/39, 51/41**, 64/51, ...
- B Tenney height (log2 of numerator × denominator): 5/4, 44/35, 46/37, **49/39, 51/41, 54/43, 56/45**, 59/47, ...
B gives a cleaner alternation; A matches the rings' numbers.

**D2. The line.** A (recommended) a zigzag joining the dots in complexity order; B no line, only the dots.

**D3. The default ceiling.** At ±10 c, around 5/4 / 3/2: odd limit 63 gives 13 / 4 dots, 127 gives 54 / 50, 229 gives 174 / 174. Recommended: 127 (enough to see the spiral, still hoverable).

## Human answers (2026-11-17)

- D1: "can I have a toggle to check both?": a `Odd limit | Tenney` toggle on the meta ring sets the distance from the center and the line's order (default Odd limit, matching the rings). The Ceiling stays an odd limit filter in both.
- D2: zigzag line (A).
- D3: default ceiling odd limit **229** (about 175 dots at ±10 c). Row 1 at the default therefore shows 174 dots around 5/4; the 63 rows above set the ceiling to 63 first.

## Human change (2026-11-17, supersedes the window, the prime limit and the entry)

"given a simpler interval (or any arbitrary interval) what ratios (regardless of their prime) sit within 20 cents +/- it? Then sorting them would be based on positive / negative and in to out would be complexity?"

- Window ±20 c (Span 40 c total; seam labels `−20 c` / `+20 c`). No prime limit (the option is gone); the only bound is the Ceiling (odd limit, default 229).
- Any interval: Ctrl+click a ring cell, or Ctrl+Enter (or `Near`) in the typed box for a typed ratio or cents.
- Sides: sharper right of noon, flatter left; outward = more complex.
- Counts (script `meta2.py`, ±20 c, no prime limit): around 5/4: 63 → 26, 127 → 111, 229 → 355 (176 above, 178 below); 3/2: 63 → 25, 127 → 107, 229 → 351; 11/8: 229 → 354; 700 c: 229 → 349 (158 above, 191 below; 3/2 is a dot at +1.96 c; corrected from 190: the first count subtracted a center dot that a cents center does not have). Rows 1 to 7 above used ±10 c and prime 229: their counts are superseded by these.
