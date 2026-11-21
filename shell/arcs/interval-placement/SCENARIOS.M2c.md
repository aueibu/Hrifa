# SCENARIOS M2c: play mode and Explore (for the human to confirm)

Nothing here is built. Every number comes from the real scoring library, with candidate placement rules prototyped in `m2c/scen.ts` (run command at the top of that file).

**Running example:** intervals **11 7 16** (major 7th, perfect 5th, major 10th) in 12-EDO, bottom note **C2**, register limits C2 to C5. "Roughness" is the default interference score (lower = smoother). Notes are listed low to high.

Each question gives the options, an example where they give **different** results, and my recommendation. Answer with the option letter, or "go with your recommendations".

---

## Q1. What spread means, and when a preset can't fit

**Proposed rule:** the spread is the width of the whole chord, from its lowest to its highest note. In play mode, the first interval (in the current order) starts at the bottom of the spread and the last one ends at its top, so the chord is always exactly as wide as the spread.

Each preset sets a range, and the slider starts in its middle:

| Spread | Notes | Roughness |
| --- | --- | --- |
| Close (up to 12 steps) | does not fit: the 16 (major 10th) alone is wider than an octave | — |
| Open, 18 steps | C2 D2 F#2 B2 C#3 F#3 | 0.872 |
| Wide, 30 steps | C2 B2 C3 D3 G3 F#4 | 0.684 |
| Vast, 42 steps | C2 B2 F#3 C#4 D4 F#5 | 0.568 |

When a preset can't hold your intervals:
- **(a)** The preset button is disabled, and its tooltip says why ("the 16 is wider than Close allows"). **Recommended.**
- **(b)** Clicking it picks the narrowest spread that fits (16 steps) and says so.

## Q2. What "lean" moves

With three intervals, the first and last are pinned to the bottom and top, so lean moves the inner one(s).

- **(A) Lean moves where the inner spans sit** (low = toward the bottom, high = toward the top). The order stays as it is. **Recommended**, because the order is a separate choice (Q3).
- **(B) Lean decides which spans go low:** lean low puts the biggest interval at the bottom (like the harmonic series), lean high puts it at the top. This reorders the spans.

Example at Wide (30 steps):

| Lean | (A) inner span moves | Roughness | (B) reorders | Roughness |
| --- | --- | --- | --- | --- |
| Low | C2 F#2 B2 C#3 D3 F#4 | 0.841 | 16 11 7: C2 Bb2 E3 A3 B3 F#4 | 0.707 |
| Centered | C2 B2 C3 D3 G3 F#4 | 0.684 | (typed order) C2 B2 C3 D3 G3 F#4 | 0.684 |
| High | C2 B2 D3 E3 B3 F#4 | 0.576 | 7 11 16: C2 G2 Bb2 D3 A3 F#4 | 0.704 |

## Q3. Which order play mode uses

The order matters a lot. The same three intervals at Wide (30 steps, lean centered):

| Order (low to high) | Notes | Shared note? | Roughness |
| --- | --- | --- | --- |
| 11 7 16 (as typed) | C2 B2 C3 D3 G3 F#4 | no | 0.684 |
| 11 16 7 | C2 G2 B2 B3 F#4 | yes (B3) | 0.364 |
| 7 11 16 | C2 G2 Bb2 D3 A3 F#4 | no | 0.704 |
| 7 16 11 | C2 G2 G3 B3 F#4 | yes (G2) | 0.324 |
| 16 11 7 | C2 Bb2 E3 A3 B3 F#4 | no | 0.707 |
| 16 7 11 | C2 C3 E3 G3 F#4 | yes (G3) | 0.412 |

- **(a)** The order of your interval chips; drag the chips to reorder.
- **(b)** Automatically the best-ranked order.
- **(c)** The chip order, plus a small badge on each possible order with its score, so you can see better orders and pick one. **Recommended:** predictable, and it doesn't hide the alternatives.

Note: the three orders with a shared note are also the three smoothest (5 notes instead of 6).

## Q4. What "evenness" does (only matters with 4 or more intervals)

With three intervals there is only one inner span, so evenness changes nothing. With four (**11 7 16 4**) at Wide, lean centered:

| Evenness | Meaning | Notes | Roughness |
| --- | --- | --- | --- |
| Equal | the spans' starting points are evenly spaced | C2 Ab2 A2 B2 Eb3 C#4 D4 F#4 | 1.126 |
| By size | each span gets room in proportion to the sizes before it | C2 G2 B2 D3 B3 D4 F#4 | 0.500 |

(The "by size" result has a **shared note**: the 7 and the 16 both start on G2, so it has 7 notes, not 8.) Is that the meaning you want? Or would you rather drop evenness and keep only spread and lean?

## Q5. Dragging one span

Drag the 7 (perfect 5th) in the Wide voicing up or down, one step at a time (outer spans stay put):

| Move | Notes | What happens |
| --- | --- | --- |
| −1 | C2 B2 D3 F#3 F#4 | its bottom lands on B2: a **shared note**, marked |
| start | C2 B2 C3 D3 G3 F#4 | — |
| +1 | C2 B2 C#3 D3 Ab3 F#4 | — |
| +2 | C2 B2 D3 A3 F#4 | lands on D3: a **shared note**, marked |

**Proposed:** shared notes are allowed and marked (your M2b decision); a span stops at the register limits; dragging an inner span never changes the spread; dragging the first or last span changes the spread, and the spread readout follows. Fine drag (modifier key) moves in cents, and a note off the tuning grid is marked. Confirm?

## Q6. What "nearby" means in Explore

Proposed: each interval may move up to **k steps** from where it is now. The numbers are small, so cost isn't the issue:

| k | Candidates (3 intervals) | Time |
| --- | --- | --- |
| 1 | 27 | instant |
| 2 | 125 | instant |
| 3 | 343 | about 0.1 s |
| 4 | 729 | about 0.1 s |

Two real questions come from what the search does if left free:

**6a. Register drift.** Left free, the top results are the same chord moved: bottom note D2, then C#2, then C2.
- **(a)** Keep the lowest note where you put it; Explore varies the shape, and register stays your choice (your M2b decision). **Recommended.**
- **(b)** Free.

**6b. Note count.** With the bottom fixed, the best result merges two notes: C2 B2 C3 G3 E4 (5 notes, roughness 0.414). Keeping 6 notes, the best is C2 B2 C3 Eb3 G3 G4 (roughness 0.488).
- **(a)** Keep the current number of notes by default, with a switch to allow fewer. **Recommended:** otherwise Explore nearly always suggests merging.
- **(b)** Any number of notes.

Default k: **2**, and the "extend scope" setting goes up to the whole register limits (where cost does start to matter, and the setting says how much).

## Q7. The harmonicity-leaning weights

Over the nearby candidates (bottom fixed, 6 notes):

| Rank | (A) roughness −1, pitch-space harmonicity +2 | (B) roughness −1, pitch-class harmonicity +2 |
| --- | --- | --- |
| 1 | C2 B2 C3 Eb3 G3 G4 | C2 B2 C3 Eb3 G3 G4 |
| 2 | **C2 B2 C3 E3 G3 Ab4** | **C2 B2 C3 D3 A3 E4** |
| 3 | C2 B2 C3 D3 G3 F#4 | C2 B2 C3 D3 G3 F#4 |

The scores mostly agree, so the weighting mainly reorders the runners-up. **Recommended: (A).** Pitch-class harmonicity gives the same value to any voicings with the same note names, whatever their octaves, so it can't tell placements of one chord apart (M2b). Equal weights stay available as a preset.

## Q8. Gaps and shape names (from the SATB Voicing Explorer)

**Gap:** two neighboring notes are 12 steps (an octave) or more apart. For each neighboring pair, `g` = whole octaves between them, as in the explorer. Example: C2 B2 C3 Eb3 G3 G4 has steps 11, 1, 3, 4, 12 between neighbors, so `g` = 0 0 0 0 1: **1 gap** (G3 to G4), texture 1. An exact octave counts as a gap, as in the explorer.

**Shape name:** shown only for four-note voicings, with the explorer's names: C3 E3 G3 B3 = close; C3 G3 B3 E4 = drop 2. Most chords here have 5 or 6 notes, so you'll see it only with two intervals or with merged notes.

Confirm?
