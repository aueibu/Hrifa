# SCENARIOS M8e: parent links, Shift+click source, right-click remove

Drafted 2026-11-18 from the human's message. Answers 2026-11-18: Shift (not Alt); keep the Relative button as a mode (A8 meaning open); instant remove; B3 = dashed line to a ghost at the parent's spot; B5+ancestry: links only for the hovered dot, its whole ancestry.

Ancestry rule (from the answer): every mediant edge on the hovered dot's Stern-Brocot path (e.g. 7/5: 7/5-4/3, 7/5-3/2, 4/3-1/1, 4/3-3/2, 3/2-1/1, 3/2-2/1, 2/1-1/1), each edge clipped at the window edge (stub); an edge with both ends outside is not drawn; an ancestor inside but not drawn = dashed edge to a ghost.

A8 CONFIRMED 2026-11-18: Relative ON = Shift+click opens the popup and right-click removes; Relative OFF = a plain ring (Shift+click and right-click do nothing). Left-click toggles the subset in both.

## C. Interval pin bar (M8f, open questions in chat)

| # | Action | Result |
| - | ------ | ------ |
| C1 | Hover 81/80 on a ring (or a Near dot), press `=` (or `+`) | A card "81/80" joins the ring list. No chord is stashed. |
| C2 | Paint 3^4 5^-1 2^-4 in Monzo, press `=` | A card `[-4 4 -1>` joins the monzo list. |
| C3 | Click the 81/80 card with source 5/4 | Adds 81/64 (Alt+click: 100/81). |
| C4 | Hover the card | Same preview as hovering the ring dot (readout, landing mark); hold 1/4/5 sounds it. |
| C5 | Pin 81/80 again | No duplicate; the existing card flashes. |
| C6 | 33rd pin of a type | Refused with a short message (no oldest dropped). |
| C7 | x on a card; drag a card | Removes it; reorders. |
| C8 | Reload | Both lists come back (stored in `settings.v1`, not per tab). |
| C9 | Clear all | One button per list; asks no confirm? (open) |


## A. Main ring clicks (Relative method, Chromatic view)

Today: with the **Relative** button on, a plain click opens the popup and does NOT toggle the subset; with it off, a click toggles the subset and the popup cannot be opened.

| # | Action on a ring note | Result |
| - | --------------------- | ------ |
| A1 | Click 5/4 | Toggles 5/4 in or out of the subset. No popup. |
| A2 | Shift+click 5/4 | 5/4 becomes the source; the popup opens on it. Subset unchanged. |
| A3 | Shift+click 1/1 | The popup opens on 1/1 (no Remove button, as today). |
| A4 | Right-click 5/4 | 5/4 leaves the field at once (no confirm, no browser menu). If it was in the subset it leaves the subset too. |
| A5 | Right-click 1/1 | Nothing (1/1 is the reference; no browser menu either). |
| A6 | Right-click the note the popup is open on | Cannot happen: the popup covers the ring. The popup's "Remove this note" stays. |
| A7 | Keyboard on a focused note | Enter / Space = toggle subset; Shift+Enter = open popup; Delete = remove. |
| A8 | The **Relative** button | Removed (A1 and A2 make it unneeded). |
| A9 | Other generator methods | Unchanged: right-click and Shift+click do nothing new there (their field comes from the generator). |

Undo: there is none for a removed note today; re-adding it from the popup (or the typed box) is the way back.

## B. Connect: Parents (meta ring, Near)

New fourth Connect choice: **Off | Order | By prime | Parents**. Each dot gets a line to each of its two Stern-Brocot parents (the two simpler ratios whose mediant it is: add tops, add bottoms).

| Dot | Parents | Check |
| --- | ------- | ----- |
| 5/4 | 1/1 and 4/3 | (1+4)/(1+3) |
| 6/5 | 1/1 and 5/4 | (1+5)/(1+4) |
| 7/5 | 4/3 and 3/2 | (4+3)/(3+2) |
| 9/8 | 1/1 and 8/7 | (1+8)/(1+7) |
| 81/80 | 1/1 and 80/79 | (1+80)/(1+79) |

Where the parent is:

| # | Case | Example (Near 5/4, Span 100, Arc 210) | Result |
| - | ---- | ------------------------------------- | ------ |
| B1 | Parent is a drawn dot | 14/11 (418 c): parents 9/7 (435 c) and 5/4 (386 c), both inside | Two lines, dot to each parent dot. |
| B2 | Parent outside the window | 5/4's parent 4/3 (498 c, far past +50 c) | Stub from the dot toward the parent, cut at the window's edge on that side (the arc's end, or the seam at 6 o'clock for a full circle). Stops there. |
| B3 | Parent inside the window but not drawn (its prime is off in the filter, or over the ceiling) | 81/80 near 1/1 with prime 79 off: parent 80/79 at 21.8 c | **Option 1:** line to a faint hollow ghost dot at 80/79's spot. **Option 2:** no line to that parent. |

Display:

| # | Option | What you see with ~300 dots |
| - | ------ | --------------------------- |
| B4 | All links, faint; hover a dot = its two parent lines bold | A tree-like web; the hovered dot's two links stand out. |
| B5 | Only the hovered dot's links | Clean ring; links appear only under the pointer. |
| B6 | B4 plus the hovered dot's whole ancestry bold, back to 1/1 | e.g. hover 7/5: 7/5 -> 4/3, 3/2 -> ... -> 1/1 and 2/1 lit. |
