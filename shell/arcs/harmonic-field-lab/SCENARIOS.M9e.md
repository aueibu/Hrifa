# SCENARIOS M9e: Monzo paints on press (hover previews)

CONFIRMED 2026-11-18. Human: "ive been thinking about the monzo one. Can you propose anything that makes it easier to use? I was actually thinking that the reverse of the paint key might actually make more sense. It has a very 'jumpy' feeling to it and I don't know if its the UI or the behavior". Cause: hovering PAINTS (every column crossed is set, with gap fill), so reaching for a cell repaints the way there unless Alt is held. Picked option A ("Paint on press") over B (hold a key to paint) and Both. No stored data changes.

Example: painted 81/80 = [-4 4 -1>, pointer on the 5 column at -1, goal 7 = +1 ([-4 4 -1 1>).

| # | Action | Result |
| - | ------ | ------ |
| K1 | Move the pointer across the matrix (no button) | The painted monzo does NOT change. The hovered cell is a PREVIEW: the would-be interval (painted monzo with only that prime's exponent set to the hovered row) drives the landing ghost, the readout, the legend hover tick and holds 1 / 4 / 5; the cell under the pointer is highlighted. Moving from 5/-1 to 7/+1 leaves 81/80 intact. |
| K2 | Click a cell | Sets that prime's exponent (paint), nothing else. Does NOT add. |
| K3 | Press and drag | Paints a stroke: every cell the pointer passes while the button is down is set, with today's gap fill (no skipped columns on a fast drag). |
| K4 | Ctrl + drag | Straight line from the press cell to the pointer, as today's Ctrl line (columns the line leaves return to their snapshot); release commits. |
| K5 | Esc during a drag | Cancels the stroke: back to the monzo before the press. |
| K6 | Add | The existing Add button, Enter (while the picker is open and not typing in a box), or a double-click on a cell (sets it, then adds). Plain click no longer adds. |
| K7 | Alt | No longer needed in Monzo (hover never paints); Alt does nothing there (it keeps its "below" meaning elsewhere). |
| K8 | `=` pin | Pins the PREVIEWED interval when a cell is hovered, else the painted one. |
| K9 | Pointer leaves the matrix | Preview ends; ghost, readout and holds return to the painted interval. |
| K11 | Sparkline (human: "the blue line 'sparkline' is nearly invisible now. can we try a light stroke with an outline?") | The painted line and its dots get a halo: an outline copy `--panel` ~4.5 px under a `--text` 2 px line; dots `--text` fill with a `--panel` ring (the roles flip per scheme by themselves). A hover preview line, if drawn, is told apart (dashed or fainter). |
| K10 | Performance | Hover preview never changes the painted monzo, so the cell tints (built from the painted monzo) do not recompute on hover; M8p guard still holds (no renders outside the picker; picker at most once per frame). |

## M9e look (human, 2026-11-18)
| # | Case | Result |
| - | ---- | ------ |
| K12 | Prime header (human: "remove the blue coloration from the prime header column ... it needs to make sense"; picked A) | A prime the painted monzo uses is bold in its own prime-wheel hue at Radix step 11 (`primeTextColor`; prime 2 plain text); unused primes muted. Same for the Rows view's values. The accent blue is gone. (Built by the orchestrator.) |
| K13 | Hold Alt in Monzo (human: "hold alt on monzo to invert all signs? possible?"; picked A "Show inverted") | While Alt is held the matrix shows the INVERSE of the painted monzo (every exponent negated: 81/80 [-4 4 -1> shows [4 -4 1>), the sparkline mirrors around 0, the cell tints follow the shown monzo (recomputed once per Alt press), and the ghost, readout, holds 1/4/5, Add and = pin use the inverse (the below interval: source 5/4 x 80/81). Release restores. Nothing stored changes unless you paint or add. |
| K14 | Alt + click / drag / double-click (human: "if I hold alt and double click (to add) it should add the alt shown value") | Painting while Alt is held works in the shown (mirrored) view: setting a cell to the shown row r stores -r, so the shown value is what you set. Alt + double-click sets the cell in the shown view, then adds the SHOWN (inverted) value. Enter / the Add button with Alt held also add the shown value. |
