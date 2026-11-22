# Rhythm crystals and "fit": handoff for a new session (2026-11-21)

Read this, then `rhythm-crystal.html` in this folder (one standalone page, no build step; published at
https://claude.ai/artifact/JmCnVCcmqMB4YejTc3sM81, republish from this file path's content with `url`).
The PROGRESS row is "Rhythm crystals (side study)" in `../PROGRESS.md`.

## Where the page stands
- **Full size (crystal):** Wallin's crystal chords (Root + i·g1 + j·g2 + k·g3; his article, IRCAM forum PDF) moved
  into time. Cell 1 is entered at every onset (or every sum of onsets) of cells 2 and 3 on one cycle; pulses hit more
  than once are accents. Mirroring a cell after the first gives a twin; with two lopsided cells it is a true Z-twin
  (same weighted time distances, not a rotation or reversal). Checked: 24 pulses, `x..xx` at `0 8 10`.
- **Fit (Schillinger, Book I, Ch. 12, distributive powers):** cell 1 is shrunk into each attack of the other cells;
  the cycle is the product of the cells' own cycles. Same cell twice = his distributive square. Checked: `⟨2 1⟩` with
  itself gives 4+2+2+1 in 9 against his theme 6+3 (Figure 126). With different cells it is a distributive product,
  which he does not have. Mirrored cells in fit mode make new rhythms but generally not Z-twins (shrinking breaks the
  shared distances); the page says so.
- **How it is built** panel: canon score (one row per copy; fit mode shades the attack each copy fills) and Wallin's
  addition table.
- Inputs per cell: pulses (placement steps), grids with digit weights, lab names ⟨…⟩, JI ratios on the lab's linear
  ring, Wallin germs `11x3`. Outputs: pulses, grid, gaps, ratios (L + s)/L for the Ratio rhythm lab; "use as cell".
- **Play as a scale** already reads any row on the lab's linear ring: pulse s of a cycle L is the ratio (L + s)/L.
- Not committed yet after the human asked for the build view and fit mode: commit `crystal/` once the human has
  looked (memory: look changes human first). Last commit with the page: d2f5411.

## The open question the human wants to discuss (their words)
"Given set A and set B - you could make it so that the items of set B fit inside each occurrence of set B. That
makes sense rhythmically. But how might that work melodically or harmonically? I am wondering if it would let you
have notes that would have these like shimmering overtonal structures. Could both the rhythmic and pitch versions be
explored? I'd like to chat on this."

Starting points already on the table (from the session that wrote this):
- On the linear ring (the Ratio rhythm lab's reading), a fitted rhythm is already a pitch set: the product cycle
  L1·L2 is a lower fundamental, so every note becomes a higher harmonic and each step of A is split in B's
  proportions in frequency. Close harmonics high in a series are the "shimmer" (beating neighbors).
- In log pitch (steps), fitting B into each interval of A gives a microtonal set: each gap of A filled with B's shape
  shrunk to that gap (a distributive power of intervals).
- Harmonically: each chord note of A replaced by a small cluster shaped like B, squeezed into the space up to the next
  note (or into a fixed band), heard together.
- Related backlog item: the harmonic-ring affine reading (`shell/BACKLOG.md`, `[interval-placement]`).

Not part of this topic: the VM catalog addendum (sizes 18–19, n = 5) runs at 2 workers next to the z search and was
due around 11:00–11:30 pm EST on 2026-11-21; the session that started it watches it and keeps ipcat at 2 until the
z search finishes. Do not touch tmux `zruns` or `~/zgen/`.

Rules that apply: chat first, scenarios before building (`shell/CLAUDE.md` rule 7), no sound in the Browser pane
without asking, American spelling, times in EST.
