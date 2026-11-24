# Design: channels, shapes and operators (2026-11-24, human answered in section 6; M3 and the audio-capabilities side discussion open)

Why: the registry's types should follow what music varies along and what a composer does to it. The human, 2026-11-24: pitch is frequency; rhythm is onsets in time; amplitude is volume; articulation blends onset, sounding duration and tone color; timbre is the tone color of a sound. Ideas to support: a **lattice** applied to a melody (drag segments like a photo editor's warp mesh over time and pitch) and a **mask** (one stream silences or accents another; accent "spills" from the rhythm domain into amplitude). No tonal-theory terms are used here.

## 1. What a note carries today (scout, 2026-11-24)

| Channel | Today | Where |
|---|---|---|
| Onset | exact rational, in quarter notes | `NoteEventValue.onset` (`musicalTime.ts`) |
| Inter-onset (slot to next attack) | exact rational | `interOnset` |
| Sounding duration | exact rational; differs from the slot only when an operator sets it (Melodicization: slot x articulation percent) | `duration` |
| Pitch | bare midicents (a JS number, fractional allowed); one item holds a simultaneous group | `pitches: number[]` |
| Amplitude | 0..1 per item, already reaches the audio engine | `velocity` (editor edits, Mixer and engine read it) |
| Timbre | none per note: the instrument is per plan source and per bus | `PerformanceEventBase.instrumentId` exists on the engine event, not on the note |
| Articulation | none as a field: it is the result of duration, velocity and instrument together | Melodicization's `articulationPercent`, the Gate % controls |

Not present anywhere in the workbench: mask, lattice, warp. (The Harmonic Field Lab's "lattice" is a pitch lattice of prime exponents, a different thing: we should not reuse the word for the deformation grid. Working name here: **warp grid**.) Affine-focus (`lib/affine-focus`) does pitch transforms with exact fractions, but is not wired into workbench packets.

## 2. The model

1. **Channels** are what a value measures: onset, sounding duration, pitch, amplitude, timbre (a reference to a sound, not a number). Pitch and rhythm exist apart: a Pitch set carries only pitch, a Rhythm only onset (and inter-onset), Notes carry pitch, onset, duration and amplitude together.
2. **Bundles** combine channels under a name. Articulation is a bundle: onset, sounding duration, amplitude and timbre treatment together (Blender: a Material bundles properties). Not a base channel; it is a data-block or an operator setting that writes several channels.
3. **Shapes** say how values are arranged: list, events along time, curve, steps, warp grid, mask stream.
4. **Data-block types** (registry): a shape plus the channels it carries, for things a composer keeps, edits and hears as a unit. Meaning stays a channel tag on the data (the packet `domain`), not a type per meaning. Types have a `family` field for browsing (Pitch, Time, Placed, Composite, Generic); it does no typing.
5. **Operators** (and modifiers) declare which channels they **read** and which they **write**, and which data-blocks they take as parameters (a warp grid, a mask). The registry checks this the way it checks `accepts`. An operator that reads one channel of a stream and writes another channel of a different stream is a **cross-channel mapping**: never silent, always a visible choice (the rule from the human's answers to A6 and S8).

## 3. Scenarios (a recommended answer in every row; mark "ok" or change by number)

Cast: **Melody** = C4 D4 E4 G4, quarters on beats 0, 1, 2, 3, velocity 0.7. **Mask** = a Rhythm with onsets on beats 0 and 2 (it has no pitch).

| # | Case | Options and what each gives for the cast | Recommended |
|---|---|---|---|
| M1 | **Mask as a gate.** Melody is gated by Mask. | **a. Silence**: all four notes stay in the data, D4 and G4 get amplitude 0, so C4 and E4 sound. **b. Remove**: D4 and G4 are deleted (two notes remain; a later "cycle across the notes" sees two). | **a** by default, **b** as an explicit option (silencing keeps the data and can be undone by changing the mask; removing changes the count). |
| M2 | **What counts as "inside the mask".** | **a. Same onset exactly**: beats 0 and 2 match. **b. Onset within a window** (say 1/8 beat): a Melody note at 2.05 still matches. **c. The mask note's whole span** (a mask note on beat 0 lasting 1.5 beats covers the Melody onset at beat 1). | **a** by default with the window setting (b) when the mask comes from a different rhythm; **c** only when the mask has sounding durations. |
| M3 | **Mask pitches.** If the mask is Notes (C5 on beat 0, F5 on beat 2) instead of a Rhythm. | **a. Ignore them** (only onsets, and maybe durations, are read). **b. Match pitch too** (silence Melody notes not at the same pitch class). | **a**: reading onsets of another stream is the rhythm-domain reading; reading its pitches would be a second, separate operator. |
| M4 | **Mask as an accent.** | Mask hits get amplitude x gain (default 1.3, capped at 1): C4 and E4 0.7 becomes 0.91; D4 and G4 stay 0.7. Alternative: set to a fixed level (C4 and E4 = 1.0). | **Multiply** by default, "Set to" as an option. This is the "rhythm spills into amplitude" case. |
| M5 | **Inverse mask.** | Keep the notes where the mask does NOT hit: D4 and G4 sound, C4 and E4 are silenced. | An **Invert** toggle on the same operator. |
| M6 | **Warp grid on Melody** (time x pitch). A grid of control points; dragging one moves the notes around it. | **a. Piecewise-linear** between rational control points: onsets stay exact rationals, pitches become fractional midicents (allowed). **b. Smooth (spline)**: onsets become irrational, so they would be rounded to the nearest fraction (continued fractions, max denominator 1e6), losing exact identity. | **a** (keeps the exact-time contract). Smooth later only with an explicit rounding setting. |
| M7 | **Warp grid on two other channels** (time x amplitude). | The same operator over a different channel pair: a swell is a warp of amplitude against time. | One warp operator parameterized by the channel pair; the grid is a data-block (Blender: Lattice modifier + Lattice data-block), so many melodies can reference one grid and "make single user" works. |
| M8 | **Operator declares channels.** | Mask-gate reads: mask onset (and duration in c); writes: target amplitude. Warp reads and writes: onset and pitch. Articulation scale reads: slot; writes: duration. The registry refuses to wire an operator whose read channel is absent from its input (a Rhythm has no pitch to warp) and says why. | As described: reads/writes declared per operator, used by the same picker that uses `accepts`. |
| M9 | **Articulation as a bundle.** | An "Articulation" setting sets sounding duration as a percent of the slot, a velocity treatment, and an instrument, for chosen notes. Writes three channels at once. | A named operator that writes several channels; timbre per note needs a note-level instrument field, which does not exist today (see Q1). |

## 4. Questions for the human
- **Q1.** Timbre per note: today the instrument belongs to a plan source or a bus, not to a note. Should a note carry its own instrument reference (needed for M9 and any "this note in another voice")? Recommended: not yet; keep timbre as a property of the voice or bus until a case needs per-note timbre.
- **Q2.** Is amplitude a channel of every Notes block (as `velocity` is today), with Melodicization's hardcoded velocity 1 replaced by a real input? Recommended: yes, as it is today; Melodicization's fixed 1 becomes a default setting.
- **Q3.** Confirm the working name **warp grid** (not lattice) so the word does not collide with the Harmonic Field Lab's pitch lattice.

## 5. What this changes in the registry plan
- Types gain a `family` and carry which channels they hold (used by the operator read/write check).
- Operators become registry citizens with declared reads and writes (the node layer, phase B, uses the same declarations).
- List and Bank generic types follow the Blender Text precedent, as agreed in discussion; they hold domain-tagged lists with no special editor.
- New data-block types are added only when a kept thing needs its own editor or audition: warp grid (shape: grid of control points), mask is not a type (a Rhythm or Notes block used by the mask operator).
- Nothing here changes `DataPacket`, exact time, midicent pitch or the evaluators.

## 6. Human answers (2026-11-24)
- **M1** agreed: gate by silencing by default, removing as an explicit option.
- **M2** revised: the mask operator gets **reach controls**, a width for each item of the mask (a "hitbox" before and after each mask onset, in beats), not only exact onset. Width 0 is the exact-onset case. **Touch** is a toggle: any note whose sounding span overlaps a mask item's span at any point is affected (the old option c). The user also chooses what the mask is (a Rhythm, or Notes used for their onsets and durations).
- **M3** open: the human needs clearer musical examples before deciding whether a mask reads the mask stream's pitches (see the examples in the session reply; to be added here once settled).
- **M4** agreed: Multiply and Set to are both options.
- **M5** yes: Invert toggle.
- **M6** agreed: piecewise-linear now; smooth later. Pitch results will need a choice between free pitch and snap to the project or section tuning (EDO or scale); the warp's pitch output is a good first test of how that snap works.
- **M7** yes: one warp operator over a chosen channel pair; the grid is a data-block.
- **M8, M9** ok.
- **Q1**: not yet: timbre stays on the voice or bus. The human raised a larger question: filters and other sound parameters, and the app's total audio playback capability versus MIDI out. Side discussion, not in this arc's scope.
- **Q2**: yes, amplitude is a channel of every Notes block, and the DAW **0 to 127** scale replaces today's 0 to 1 for ease of cross use. Default: 64 or a project setting. This changes a stored contract (see the session reply for the migration question); decide the storage rule before implementing.
- **Q3**: "warp grid" is fine for now.
