# Human checkpoint: M8d (follow-ups to the M8c + M9 checkpoint)

Gate at last run: `check:hfl` GREEN, 1179 tests (run with `VITEST_MAX_WORKERS=4`, Node 24, see shell/CLAUDE.md "Environment notes"). Not pushed.

Setup: dev server from `shell/`, Harmonic Field Lab, 12-EDO with the major scale unless a step says otherwise.

1. **Popup, mode slider, E key (items 1, 2).**
   1. Point at the "major triad 4:5:6" chip, press `-`. The popup lists the notes as text (0.0, 400.0, 700.0 c); "Send mode" slider is on As in field.
   2. Press `E`: slider moves to Exact; text shows 386.3 c, 5/4 and `[2^-2 5]`. Composite 1 shows "already in" in As in field and "1 new, 2 common" in Exact, before any digit.
   3. Press `1`. Press `E` with the popup closed: nothing happens.
   4. Sketch row: click Exact, then `-` on the chip: the popup opens on Exact.
2. **Right-click menu (item 8).** Right-click the chip: "Stash on shelf" and "Send to composite". In the sub-menu Shift+click "New composite": sends in the other mode; plain click sends in the shelf's mode.
3. **Shelf chord is fixed.** Switch on Exact, stash the chip with `+`. On the Shelf tab point at the slot, press `-`: slider disabled with the reason; notes 400.0, not 386.3.
4. **Positional (scenario d, item 4).** Select the C major scale, point at a positional row, press `-`: slider disabled ("positional chord is fixed"). Click "Scale order": rows 2-2 on 1 to 7, each with `#rank` and `score`. Click "Smoothest": rank only.
5. **Details (items 3, 5).** Send a positional row to a composite; Composites tab, open Items: "pattern 2-2 · 7 of 12-EDO · 400-300 c", the cents list, "Source: 12-EDO, tab ...". Stash a positional row with `+`: the shelf keeps the tail.
6. **CPS chips (item 6).** Load "Hexany (1 3 5 7, choose 2)". Under "Chords inside this CPS" hover a chip: `+` stashes, `-` sends, right-click gives both entries, hold 1 plays it, click arms the Sketch row. Otonal 3:5:7 should read 0, 266.9, 884.4 c, root 1/1; utonal 1/(3:5:7) 386.3, 653.2, 968.8 c, root 5/4.
7. **Wording (item 7).** "Open as tab" on a composite: the generator header reads "composite, N notes", no "snapshot" or "Frozen".

Open points for the human:
- Popup width (26 rem) and ring size (5 rem) were chosen without a mock; stats panel is shared at the top of the popup.
- Chord items in the Composites panel show the source twice (old origin line and new Source line): reduce?
- Scale order resets on reload: should it be remembered?
- CPS chords now play their own root on 1/1 in Parallel (before: the mode root). Is that what you hear as right?
- Hold 4 on a chip does nothing by itself (plays the armed chord on a hovered note); arming a chip is hold 1 or a click.
