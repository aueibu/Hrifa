# Native tooltips checkpoint: the seven `title=` attributes (2026-11-16)

Each of these used to be a native browser tooltip (plain text, about a one second delay, ignoring the Developer menu's tooltip settings). Each is now a styled tooltip: same look, the Developer delay (250 ms by default) and the Developer on/off. The wording is unchanged from before unless noted. Please hover each one and say if you want a word changed.

| # | Where | What you hover | Tooltip text now |
| - | ----- | -------------- | ---------------- |
| 1 | Tuner strip | A ghost mark (a sounding pitch that is not a field note) | the ghost's own text (unchanged) |
| 2 | Live roughness view | The third stat slot, the list of dissonance dips | the dips list, two spaces between names (unchanged); no tooltip when the list is empty |
| 3 | Live roughness view | The register label next to Shape / Pitch | "Lower is smoother" |
| 4 | Live roughness view | **Shape** | bold **Shape**, then: "Scored as if the lowest note were middle C, so the same shape always scores the same, like the chord cards." |
| 5 | Live roughness view | **Pitch** | bold **Pitch**, then: "Each note scored at the pitch it actually sounds." |
| 6 | Chord shelf | The small computer-key badge on a shelf slot | "Computer key" |
| 7 | Tuner strip | **The axis labels at the left of the strip ("note", the zero label, "step (c)")** | the strip caption (for example "vs 19-EDO steps above the mode root"; unchanged text) |

## Two things that changed beyond the wording
- **Item 7 moved.** The old native title was on the whole strip plot. As a styled bubble it would have popped up at 250 ms over the strip header while you sweep across the notes (hover and hold to play) and flickered on and off over every step cell. So the caption now hangs on the axis labels instead, where it explains what the strip is compared against. The plot itself has no tooltip; it is a labelled group for screen readers, named by the same caption (the native title was its only description before).
- **Shape and Pitch (items 4 and 5)** now have a bold label above the sentence. The glossary's `shape` entry is about scale regularity, a different thing, so there is no glossary link.

## Tooltips-off check
With the Developer menu's Tooltips switched off, none of the seven should appear. (The existing "Tooltips" setting now covers all of them; before, these seven ignored it.)

## Still native, on purpose
The seven SVG `<title>` tooltips on chart marks (dissonance and roughness marks, the ring's ghost marks, lattice nodes and the mode-root chevron) are unchanged. They wait on the "Unified help panel" idea in BACKLOG.
