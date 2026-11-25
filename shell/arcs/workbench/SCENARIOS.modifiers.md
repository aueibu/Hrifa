# Scenarios: modifiers and Apply (confirmed by the human, 2026-11-24)

Example used throughout: the son clave (attacks at quarters 0, 0.75, 1.5, 2.5, 3; cycle 4 quarters) and the pitch set **P = 6000, 6400, 6700** (midicents). Every modifier works on ONE cycle; the object's Loop, Stretch or One-shot repeats the result afterward (W-67).

**Core rule (human, 2026-11-24): non-12-EDO is a core point.** The pitch modifiers work in exact cents with a PERIOD (default 1200, editable). Nothing assumes 12 steps or 1200 cents except that default. A Pitch classes block brings its own EDO (its `chromatic-N` encoding, 12 if absent) and, being classes, repeats every period by definition.

| # | Steps | Result (confirmed) |
|---|---|---|
| 1 | In Properties click **Add Modifier**, choose one | Added at the BOTTOM, runs last (Blender: "New modifiers are always added at the bottom of the stack (i.e. will be applied last)"). Modifiers run top to bottom, each on the previous result, on one cycle, before the mapping repeats it |
| 2 | Rhythm object + **Melodicize** with P | Five notes at the five clave attack times: 6000, 6400, 6700, 6000, 6400. Settings are the Melodicization node's (Allocation with its four options `cycle`, `cycle-rhythm`, `zip`, `cartesian`, default `cycle`; articulation) and the same `melodicize` function (no copy) |
| 3 | Notes at 6250 and 7250 + **Snap to Pitch Set** with P | Each pitch moves to the nearest member of P, ties to the lower pitch. **Repeat every octave ON (default)**: P repeats every Period (1200): 6250 to 6400, 7250 to 7200. **OFF**: only the three listed pitches: 6250 to 6400, 7250 to 6700. Period is editable in cents (default 1200) so non-octave sets work; distances are in cents, never in steps of 12 |
| 4 | A note at 6000 and one at 6400 + **Harmonize** (Voices 3, Step 1) with P | Each note keeps its pitch and gains the next set members ABOVE it: 6000 gives 6000, 6400, 6700; 6400 gives 6400, 6700, 7200 (set repeating every Period). With Step 2 the members are skipped alternately: 6000 gives 6000, 6700, 7600. Added pitches copy the source note's start, length and amplitude. Repeat and Period behave as in row 3. **Expect tuning of these options after the human hears it** |
| 5 | Stack Rhythm, Harmonize, Melodicize (wrong order) | The object goes SILENT and Properties says "Harmonize needs Notes; the data so far is a Rhythm" (same treatment as a missing input, row 3 of `SCENARIOS.objects.md`) |
| 6 | Stack Rhythm, Melodicize, Harmonize; mute Harmonize | Five single notes. A muted modifier is skipped |
| 7 | Same stack, **Apply** | Apply is enabled only on the TOP modifier (a lower one is disabled with the reason "Apply the modifiers above it first", Blender: applying one that is not first "will ignore the stack order ... and may produce undesired results"). Applying Melodicize gives a 5-note Notes block and leaves Harmonize in the stack. **Apply All** bakes the whole stack (15 pitches in 5 events), clears it, keeps the mapping; the original data-blocks stay on the desk, the new Notes block is named "<data name> (applied)" and the object points at it |

Also: a modifier's pitch set is a reference (counts as a user; deleting the pitch set blanks it and the object goes silent with "Pitch set: missing"); inputs accepted: Pitch set (exact midicents) and Pitch classes (placed as the audition does: base octave 4, EDO from the block); naming: **Snap to Pitch Set** (not "Transpose to pitch set": a transpose shifts every note by the same amount).

Not in this milestone: arpeggio or spread for Harmonize, per-modifier amplitude, the node tree modifier (O4), the look of the modifier list (judged on the first thin slice).
