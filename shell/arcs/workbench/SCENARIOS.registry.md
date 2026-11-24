# Scenarios: the registry, ground up (B1-ii, then the node layer)

Status: CONFIRMED 2026-11-24 (human's row-by-row answers plus A2, A5, A7 defaults). One open item left for later: read the OpenMusic manual before the composite (voices) step (R4). The old code is not consulted for shape; only the contracts stay (`DataPacket`, exact-rational time, midicent pitch, evaluators' math, version tree, PianoRoll, audio engine).

Rules from the human's answers (apply to every row):
- **No tonal theory in the audition.** A pitch set plays exactly the pitches it holds: `0 1 4 6` is those four pitches and nothing else. No octave is added, no scale is "finished", nothing is called major, minor, chord or progression.
- **Audition follows the project (or section) tempo and meter.** Clicks and notes use the same tempo as everything else.
- **Never a silent reinterpretation.** A type that cannot be heard as itself refuses, and the user may explicitly choose "Hear as ...".
- **Hearing choices are the listener's, not the data's.** Audition settings (sequence or together, base octave, offset) are per viewer and never change the stored data-block.

## Part 1: what you hear on Play (default audition)

Settings on the audition control (per viewer, remembered): **Play: in sequence | together**; **base octave**; **offset** (see A4).

| # | Data-block | Plays as | Decision |
|---|---|---|---|
| A1 | Notes "Melody" (C4 D4 E4 G4, quarters) | As written, at the project tempo (120 bpm: 2 s). | Confirmed. |
| A2 | Pitch set `0 1 4 6` (stored as midicents 6000, 6100, 6400, 6600) | **In sequence** (default): those four pitches, ascending by pitch, one quarter each at the project tempo, no octave added. **Together**: the same four pitches as one simultaneous sound. | Human: play it alone; both sequence and together are useful. Default: in sequence (human, 2026-11-24: confirmed). |
| A3 | Pitch set at 19-EDO | Same as A2, in 19-EDO through the pitch contract. | Same rule. |
| A4 | Pitch classes `{0, 4, 7}` | Needs a register, so it plays with a **base octave** (default 4, middle-C octave) and an **offset** (a transposition: the number of steps added to every pitch class, default 0). `{0,4,7}` with offset 3 plays pitch classes 3, 7, 10. The offset is a hearing choice, not stored in the data-block, and not the project key or tuning. When sections exist, a section may supply the default offset (a root), but the audition never writes it back. | Human open to discussion; recommended as written. Set theory calls this **transposition** (T_n). |
| A5 | Rhythm "Clave" | A rhythm is stored as inter-onset durations (exact rationals) with an optional frame: linear or cyclic, an extent, and an optional grouping (units and boundaries); a meter is not required. It plays as dry clicks on one pitch at the project tempo, one cycle (the extent if there is one, else the sum of its durations). Grouping is not needed to play it. | Human: clicks follow tempo; asked how a rhythm is stored (answered here). Human, 2026-11-24: **loop while held, toggleable** (a Loop toggle on the audition control, per viewer; off plays one cycle). |
| A6 | Values `3, 5, 8` | Refuses with "Values have no sound of their own." The audition control offers an explicit **Hear as MIDI note numbers** (3 plays MIDI note 3 and so on) the user chooses; nothing is picked silently. | Human: the explicit reinterpret override is valuable; the choice must be the user's. |
| A7 | Collection C1 (rhythm = Clave, pitch set = Ring A) | Ring A's pitches are placed on Clave's onsets with a setting **When lengths differ: cycle the shorter across the longer \| stop at the shortest**. Ring A of 3 pitches over 5 onsets: cycle gives `p1 p2 p3 p1 p2`; stop at shortest gives `p1 p2 p3`. Uses the Melodicization evaluator (no second copy). | Human: both modes are useful. Default: cycle (human, 2026-11-24: confirmed). |
| A8 | Empty data-block | Refuses: empty, nothing to play. | Confirmed. |

## Part 2: the registry

| # | Case | What happens | Decision |
|---|---|---|---|
| R1 | A new type | One registration (id, label, payload shape, `accepts`, blank, preview, audition). Desk, picker, delete confirm and node inputs need no change. Example: **Curve**. A "chord progression" is not a type: it is Notes with simultaneous pitches. | Human: no tonal terms; confirmed otherwise. |
| R2 | A node input that takes Pitch sets | One `accepts` filters the picker and the connection check; other types appear under "Reinterpret as" with what the conversion does. | Confirmed. |
| R3 | A type with no audition | Play is disabled with the reason. | Confirmed. |
| R4 | Collection limits | A collection holds named entries (role, reference). Two entries of the same role name are allowed. A missing reference shows as missing and never blocks saving. **Two melodies in one collection:** both are Notes entries, each with its own rhythm; recommended: they sound together, layered from the same start (like a polyphony of independent lines), and the collection does no counterpoint checking. The composite model beyond this (voices, groups of voices) follows OpenMusic's `voice` and `poly` objects, to be read before the composite step is designed. | Human: take guidance from OpenMusic as composites grow. OPEN: read the OpenMusic manual before the composite step. |

## Part 3: the node layer (phase B)

| # | Case | What happens | Decision |
|---|---|---|---|
| N1 | A node declares its inputs | Name, accepted types, one or several. Example: Melodicization "rhythm" accepts Rhythm; "pitches" accepts Pitch set and Pitch classes. | Confirmed. |
| N2 | Connect a Pitch set into a Rhythm input | Refused with the reason "This input needs a Rhythm." | Confirmed. |
| N3 | A node's output | Declared as a type; derived, never stored; "Bake" writes a data-block with `derivedFrom`. | Confirmed. |
| N4 | The Make source node (the node that puts a desk data-block on the canvas) | It outputs the type of its data-block. Example: Make source "Clave" is wired into Melodicization's "rhythm" input. You swap it to "Ring A" (a Pitch set): that wire no longer fits, so it is removed and the node says "Disconnected from Melodicization: rhythm needs a Rhythm". The alternative (keep the wire and show an error) would leave a broken graph. | Human unclear on the use; this is the explanation. Recommended as written. |
| N5 | Audition a node's output | Same audition as a data-block of that output type. | Confirmed, "wonderful". |
