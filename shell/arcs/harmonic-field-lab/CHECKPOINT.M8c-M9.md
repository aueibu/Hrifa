# Human checkpoint: M8c (composites) + M9 (positional chords)

Rebuilt 2026-11-15 from ARC.md and PROGRESS.md after the original chat report was lost. Gate at last run: `check:hfl` GREEN, 1152 tests. Commits: c1d90c8, aac5a56 (M8c), c008fc2, 13320ab (M9). Not pushed.

Setup: run the dev server from `shell/`, open the Harmonic Field Lab page. Use a 12-EDO generator with a 7-note major subset unless a step says otherwise.

## Part A: M8c composites

A1. Send with the keyboard
1. Hover a chord chip in the Chords panel, press `-`. A small popup lists composites by number and names what will be added (e.g. "minor triad on 200 c").
2. Press `1`. Expect: the popup closes, the Composites rail count for composite 1 goes up, and nothing else (no hold preview, no Alt+digit tab switch) fires.
3. Hover the same chip, press `-`, press `1` again. Expect: the popup says "already in composite 1" and nothing is added.
4. Press `-`, then `0`: a new composite is made. Press `-`, then `Esc`: nothing changes.
5. Repeat step 1 from each source: shelf slot, saved-subset row, ring note, key ring, composite item.

A2. Popup preview
1. With a composite holding a C major chord (0, 400, 700 c), hover a JI 4:5:6 chip (0, 386.3, 702 c) and press `-`.
2. Expect: composite 1's small ring shows added notes, common notes (merged within 5 c), and dropped ones. Expect 4 notes after adding: 0, 386.3, 400, 700 (386.3 and 400 stay apart, 700 and 702 merge).
3. Decision for you: the preview uses the Keys panel's green and red; the ARC said neutral. Keep or change?

A3. Right-click menu
1. Right-click a chord chip. Expect "Send to composite" with the 3 most recently used composites on top, a divider, then "New composite" and "All composites".
2. Shelf: tick several slots, use "Add selected to composite". Expect a summary line.
3. Known gap: chips and the sketch row have no send-menu button (right-click is the route). The 3D lattice swallows right-drag, so no menu there. Enough?

A4. Composites rail panel
1. Open the Composites panel. Check: number, rename in place, merged note count, ring drawing, expandable item list with origin labels, remove one item, empty-state hint.
2. Delete is two clicks ("Delete?").
3. Click "Open as tab". Expect a NEW tab, frozen snapshot, header says "snapshot, N notes", other tabs untouched. Try the ring, strip, keys, lattice, analysis, Sketch, shelf and Retuner on it.
4. Reload the page. Composites and the snapshot tab come back.

A5. Developer menu
1. Open the Developer menu. Controls are grouped into sections (Tooltips, Mode display, Playback and keys, Composites).
2. Composites: set merge tolerance to 15 c, send the two chords above in order. Expect 3 notes (0, 400, 700 with the 12-EDO chord first). Try "Merged note keeps: first | most recent".

Questions for you (M8c): popup 18 rem wide, status line 3.5 s, wording "Open as tab" / "Items" / "Delete?". Popup does not take keyboard focus (digits still work). Focus counts as hover for `-`, not for right-click. Ctrl+click, Shift+F10 and the menu key also open the right-click menu.

## Part B: M9 positional chords

B1. Positional section
1. Chords panel, "Positional" section. Pick pattern 2-2 on the 12-EDO 7-note major subset.
2. Expect every degree ranked smoothest first. Degree 1 reads `2-2 on 1`, tail `7 of 12-EDO · 400-300 c`, with `~ 4:5:6` only when every note is within 5 c of a simple ratio. Degree 2 is D F A (200, 500, 900 c).
3. Click a row: it plays and arms. Hover lights its notes. Hold `1` plays and arms. `+` stashes. Send to composite works (`-` or right-click).
4. Pentatonic C D E G A, 2-2, degree 2: D G C (200, 700, 1200 c, top note above the root).
5. Switch to a harmonics-from-16 7-note subset: `2-2 on 1` has the same name but a different cents tail.
6. A subset too small for a pattern shows a hint instead of rows. List is capped at 120 rows.

B2. Patterns editor
1. Edit templates, "Positional patterns". Presets: 2-2, 2-2-2, 2-2-2-2, 2-3, 3-2, 1-1, 3-3.
2. Add a custom `2-3-2`, edit in place, reorder, delete, "Restore defaults". Bad input (e.g. `a-b`) shows a visible refusal and the box keeps your text.

B3. Sketch row
1. Sketch row, "Positional" group. Pick a pattern: Play sketch, Stash, `=`, holds `4` and `5` use the positional chord.
2. Pick a ratio template: positional clears. The "As in field | Exact" switch is off with a reason while positional is chosen.
3. Stash a positional chord, reload it from the shelf: it keeps its pattern in the provenance.

Questions for you (M9): naming format `2-2 on 4` plus the tail line; ranking by Sethares roughness; steps counted in the active subset; do the top-ranked chords sound right by ear.

## After the checkpoint
Answer the questions above, then: fix the stale "M8 not started" line in PROGRESS.md Status, run the arc's Final step (ARC.md), triage BACKLOG. Push only when asked.
