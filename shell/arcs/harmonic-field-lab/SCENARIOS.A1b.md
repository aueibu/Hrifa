# A1b scenarios: Partials and Rolloff in the Sound settings popover

DRAFT 2026-11-17, not yet confirmed by the human. Nothing is built.

## Today

The Sound settings popover (speaker icon in the top bar) holds Wave, 1/1 Hz, Volume, Reverb and Scale preview. The sound's partials are the Roughness Partials and Rolloff (one lab-wide set, `scorerOpts.harmonics` and `scorerOpts.rolloff`), but those two boxes exist only in the Retuner panel, Scorer cluster, and only while the Scorer is Roughness. The Developer toggle "Sound follows Roughness Partials and Rolloff" (default on) links the sound to them. The Wave select already reads `Harmonic (7 partials)`.

## Proposal

Add two boxes, Partials and Rolloff, to the Sound settings popover directly under Wave. They are the SAME two values as the Roughness boxes (not copies): changing one changes the other.

Baseline for every row: Roughness Partials 7, Rolloff 0.88, link on, Wave Harmonic.

| # | Setup | Action | Result |
| - | ----- | ------ | ------ |
| 1 | Baseline | Open Sound settings | Under Wave: Partials 7, Rolloff 0.88. |
| 2 | Baseline | Type Partials 3 in the popover, Enter | Wave reads `Harmonic (3 partials)`. The next note has 3 partials (amplitudes 1, 0.88, 0.7744). The Retuner panel's Partials box (Scorer Roughness) now shows 3 and the Roughness scores use 3. |
| 3 | Baseline | In the Retuner panel set Partials 12, then open Sound settings | The popover shows 12. |
| 4 | Scorer is Lattice (the Roughness boxes are hidden) | Open Sound settings, set Partials 5 | Works: the next note has 5 partials. The Roughness boxes show 5 when the Scorer is switched back to Roughness. |
| 5 | Baseline | Type Partials 20 | The box stops at 16 (same limit as the Roughness box). |
| 6 | Baseline | Press Play on a held note, then change Partials to 3 | The held note keeps its 7 partials; the next note has 3 (as today). |
| 7 | Link off (Developer) | Open Sound settings | D1. |
| 8 | Wave Sine | Open Sound settings | D2. |
| 9 | Baseline | Type Rolloff 0.3 | D3. |

## Decisions (each shown with an example where the options differ)

**D1: link off.** Today link off means the sound stays at 7 and 0.88 whatever Roughness says.
- A (recommended): the two boxes stay visible but disabled, showing 7 and 0.88, with the hint "Linked off in Developer: the sound uses 7 and 0.88." Example: Roughness Partials 3, link off: the popover shows 7 (disabled); Roughness shows 3; the sound has 7.
- B: the boxes are editable and become sound-only values (new stored fields, separate from Roughness). Example: link off, type Partials 3 in the popover: the sound has 3, Roughness stays at 7. This removes the Developer toggle's meaning, because the toggle would just pick which set the sound reads.

**D2: Wave Sine.** Sine has no partials.
- A (recommended): the boxes are hidden.
- B: shown disabled. Example: Wave Sine, open the popover: A shows only Wave, 1/1 Hz, Volume; B shows two greyed boxes.

**D3: Rolloff range.** The Roughness box accepts 0.01 to 1; the sound clamps to 0.5 to 1.
- A (recommended): the same box limits as Roughness (0.01 to 1), and under the box a note appears only when the value is under 0.5: "The sound uses 0.5." Example: type 0.3: Roughness scores use 0.3, the sound uses 0.5, the note shows.
- B: the popover box stops at 0.5. Example: type 0.3: the box snaps to 0.5, and so does Roughness (a scoring input changed by an audio limit).

## Consequence to know

With the shared values, changing Partials in this popover also changes Roughness scores and retuner results (that is what "same value" means). If you want a sound-only Partials that does not touch Roughness, that is D1 B.

## Look-judged

Placement, the disabled style and the note wording are looked at by the human first: thin slice, STOP, then tests.
