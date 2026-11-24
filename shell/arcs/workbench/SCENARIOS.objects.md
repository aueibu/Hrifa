# Scenarios: scene, objects and modifiers (confirmed by the human, 2026-11-24)

Time is exact quarter notes ("beat" = quarter at 4/4). Example rhythm: **son clave**, attacks at pulses 0, 3, 6, 10, 12 of 16 sixteenths = quarters 0, 0.75, 1.5, 2.5, 3; its cycle is 4 quarters. Example object span: 64 quarters (16 bars).

| # | Scenario | Result (confirmed) |
|---|---|---|
| 1 | Clave in a 64-quarter object | **Loop** (default): 16 cycles, 80 attacks, last cycle starts at quarter 60. **Stretch**: one cycle scaled x16, 5 attacks at 0, 12, 24, 40, 48 (durations scale, pitch does not). **One-shot**: 5 attacks in quarters 0 to 3, then silence to 64 (the span stays 64) |
| 2 | Parent moves from 0 to 16, child relative start 4 | Child world start 4 becomes **20** (follows) |
| 3 | Delete the Pitch set a Harmonize modifier points to | The modifier's reference goes blank and the object goes **silent**; Properties says "Pitch set: missing" (same as Make source today). No fallback, no bypass |
| 4 | Apply on Rhythm + Melodicize (clave, 3-pitch set) | Bakes **one cycle** (5 notes, the pitches as the modifier's allocation sets) into a new Notes data-block, clears the modifiers, **keeps the mapping** (still Loop, 16 repeats); the Rhythm data-block stays on the desk with one user fewer |
| 5 | Scene with an Empty "Verse" (0 to 64) and a one-shot clave (0 to 4) | Play lasts to the **end of the objects' spans** (64 quarters, silent tail); the empty object contributes no sound and no error |
| 6 | Delete a parent object (child at relative 4, parent at 16) | Child **keeps its place** (world start 20), now a root-level object |
| 7 | A child longer than its parent's span | Played only **to the parent's end** (cut there) |

Also confirmed: hand-editing a modified object asks to Apply first (no override layer); references blank on delete, never fall back; empty objects are silent and visible; mapping is applied after the tree or modifiers produce one cycle; the scene has one root collection and no separate object list.

Not decided (do not build until asked): what a register span does to notes outside it (drop or fold); selection masks; per-event overrides.
