# SCENARIOS M8m: pin marks for change symbols (DRAFT, partly decided)

Drafted 2026-11-18 from the human's idea: "something similar for the added, missing, dropped, merged circle styling like we did for the pinhead tapered line on the error flags for the chord library viewer ... a small tick that just crosses over the tangent point of the ring to the inside, and on the other end would be a short tapering line with a pin head circle that has the symbol of what it is (colored too of course) it would have to be a little bit bigger than the pinhead in the chord library but it would help move all of the symbols off the ring line."

## Decided (human, 2026-11-18)
- Rings that get pins: the **Keys big ring** (`KeysPanel.tsx`, `.bigKey*`), the **Send-to-composite popup ring** (`CompositeRing` with `big`, `Send.tsx`), and the **Product result ring** (`ResultRing` in `ProductDialog.tsx`). The small card rings (chord cards, shelf, Composites panel cards, product Sources/Shape) keep plain dots.
- Labels: "lets have them just get drawn over the pins. The tick on the ring perimeter is helpful here." Labels keep their current places and draw ON TOP of pins; no label re-layout.

## The mark (proposed shape, built from the library flag)
- **Tick:** a short line across the ring line at the pitch's exact angle, from just outside the ring to a little inside it (crosses the tangent point).
- **Stem:** from the ring line outward, a filled tapered polygon like `polePoints` in `LibraryRing.tsx` (wide at the ring, `HEAD_STROKE` wide at the head).
- **Pinhead:** a circle a little larger than the library's `POLE_HEAD_R` (3 units) so a symbol fits, `--panel-inset` fill, colored stroke, with the kind's symbol inside.
- Kinds and colors (from Keys / composite marks): **added / new** green `+`; **merged** blue `||`; **dropped** red strike; **missing** (Keys) its current look moved into a head (confirm the symbol). **Common / original** (no change) stay plain dots ON the ring, no pin (confirm).
- Sizes follow the rule in the page ARCHITECTURE.md "Small-ring reference": radii scale with the ring, stroke widths do not.

## Open questions (options shown where they differ)
| # | Question | Option 1 | Option 2 | Example where they differ |
| - | -------- | -------- | -------- | ------------------------- |
| Q1 | Two pins whose heads would touch (close pitches) | Stagger: the later one gets the next stem length (2 or 3 lengths, cycling) | All stems one length, heads may overlap | 8/5 (813.7 c) and 6561/4096 (815.6 c) both marked: Option 1 shows two heads one above the other; Option 2 one blob |
| Q2 | Stem length | Fixed (one length, plus the stagger) | Follows something (e.g. the merge distance in cents, like the library's error) | A merged pitch 2 c off vs 20 c off: same length vs longer stem for 20 c |
| Q3 | Common / original notes | Plain dot on the ring (no pin) | A pin with a filled grey head | A Keys ring with 5 common and 2 added notes: 2 pins vs 7 pins |
| Q4 | Missing (Keys) symbol | Keep its current dashed look, as the head | A head with a `?` or `-` glyph | - |
| Q5 | Head size | 1.5x the library's (4.5 units at the library scale) | 2x | - |

## Answers (human, 2026-11-18) — CONFIRMED
- Q1 **Stagger**: a pin whose head would touch an earlier one takes the next stem length (2-3 lengths, cycling).
- Q2 **Fixed + stagger**: "for these visuals there is no error or stat to compare so fixed + stagger".
- Q3 **Plain dot, no pin** for common / original notes.
- Q4 **Dashed pinhead** for Keys missing (empty inside, today's dashed look moved into the head).
- Q5 not asked: start at 1.5x the library head (`POLE_HEAD_R` 3 -> 4.5 units at library scale); tuned at the look.
- Order (human): M8m before M8f ("I want to finish the pinhead marks first").

## Slice plan
1. Shared pin-mark component (one file, used by all three rings) + its geometry unit-tested (tick ends, stem polygon, head center, stagger).
2. Thin slice on the **Product result ring** only; STOP for the human's look.
3. After the look is agreed: Keys big ring and the Send popup ring.
