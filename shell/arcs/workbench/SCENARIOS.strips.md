# Scenarios: objects, strips and tracks (DRAFT for the human, 2026-11-24)

The human's steer: "A" (Blender's NLA layout: objects are the rows; each object holds strips; strips that overlap go on extra tracks inside the object's row) and "for parents, strip to strip". A row needing several blocks is a DAW fundamental. Blender source: `manual/editors/nla/strips.rst` and `sidebar.rst` (a strip has start, end, crop, Playback Scale, Repeat; "Multiple strips can reference the same action"). Bitwig: a track holds many clips, each with its own loop settings.

Words (from `VOCABULARY.md`): **Strip** = one placement of a data-block in time; **Track** = a layer of strips inside one object's row; **Object** = the thing in the Outliner (name, collection, strips).

Example throughout: the son clave (cycle 4 quarters; attacks at 0, 0.75, 1.5, 2.5, 3), a pitch set P = 6000, 6400, 6700, an object **Clave** with strip **S1** (data Clave, start 4, duration 8, Loop).

## Who owns what

| Field | Lives on | Was |
|---|---|---|
| name, mute, collection membership, register span (still unapplied) | object | object |
| list of strips, each with an id and a track number | object | new |
| data reference, start, duration, mapping, content offset (W-74), mute, modifier stack, parent | strip | object |

Strips are not data-blocks (as in Blender, they belong to the object). A strip's data reference and modifier references count as users, as the object's did.

## Scenarios

| # | Steps | Result |
|---|---|---|
| 1 | Outliner **Add Empty** | An object with ONE strip: no data, start 0, duration 4 quarters, Loop, silent. Same as today, so nothing visible changes. Delete the strip: the object stays (an object with no strips is a silent Empty, like Blender's Empty). |
| 2 | **Clave** has S1 (4 to 12). Select S1 in the Arranger, then **Duplicate Strip** or **Duplicate Linked** (Properties or the strip's right-click menu) | **Duplicate Strip** (independent, like Blender's Shift+D and a normal Bitwig copy): S2 appears in the first free space after S1, with its OWN copy of the data-block ("Clave (copy)"), the same mapping and a copy of the modifier stack. **Duplicate Linked** (Blender's Alt+D; Bitwig's linked clip or clip alias, which "can be freely repositioned"): S2 shares the SAME data-block (Clave shows "Used by 2"), so editing the notes changes both; its mapping and modifiers are its own. **Make single user** (already built) detaches a linked strip, like Bitwig's Make Unique. Either way S2 can then be dragged freely. |
| 3 | S1 stays Loop. Set S2 to Stretch, duration 4, add Melodicize with P | Plays: S1 loops the clave from 4 to 12 unchanged; S2 fits ONE cycle into 4 quarters with the pitches from P. Editing S2's mapping or modifiers never changes S1. Your "one stretched, one recolored" case with ONE object. |
| 4 | **No overlap in a row (human: a hybrid of B).** S1 is 4 to 12, S2 is 12 to 20 (they touch). Hover the shared edge | The cursor becomes the split cursor, `<][>` (two arrows around a double bar, like a Windows split-pane divider; the CSS `col-resize` cursor, no custom image). Drag it right by 2: S1 becomes 4 to 14 and S2 becomes 14 to 20, together (S1 extends, S2's left edge trims in, as in W-74). Drag it left by 2: the reverse. Minimum one beat each, so it stops there. |
| 4b | Strips with a gap: S1 4 to 12, S2 16 to 24 | Drag S1's right edge toward 16: it stops at 16 (now touching), it never pushes S2. Drag the whole S2 left over S1: it stops where it touches (12). Dropping or duplicating where there is no room is refused with "No room here"; Duplicate goes to the first free space that fits. |
| 4c | **Move a strip to another row (human).** Drag S2 (Clave, 16 to 24) straight down onto the row of object **Bass**, which has a strip at 0 to 8 | S2 leaves Clave and joins Bass's strips at the same time position (16 to 24), keeping its data, mapping, modifiers and parent. Dropped where Bass has no room, it snaps back to where it was ("No room here"). Dropped on a collection row or off the rows: snaps back. Clave stays as an object even if it has no strips left. A drag that moves sideways and down at once does both in one step; the whole move is ONE undo step. Children parented to S2 follow by strip id and keep their world start. |
| 5 | (Dropped.) Two tracks in one row | Not needed now: with no overlap there is one lane per object row, so the Arranger looks as it does today with several blocks. Two sounds at once means two objects (two rows). Tracks inside a row come back only if something needs them (automation, layering). |
| 6 | Parent: strip **C1** (object Child) with parent strip **S1**, C1 start relative 4; move S1 from 4 to 20 | C1's world start follows: from 8 to **24**. A child strip is played only to its parent strip's end (cut there, hatched, as now). |
| 7 | Delete strip S1 (or the whole object Clave) that is a parent | The child strip keeps its place (world start 24 stays 24), becomes unparented. Deleting an object deletes its strips, so the same rule applies to each of them. |
| 8 | Click a strip in the Arranger | Properties follows the selection: a **Strip** section (Data, Start, Duration, Mapping, Offset, Parent, Modifiers, Mute) plus the object's own **Object** section (Name, Mute). Click an Outliner row: Properties shows the **Object** section only, plus a short list of its strips to pick from. |
| 9 | Mute the object **Clave** / mute only S2 | Object mute silences every strip in it. Strip mute silences just that one. |
| 10 | **Apply** on S2's top modifier | Bakes ONE cycle of S2's data and stack into a new Notes data-block "<data> (applied)" and points S2 at it, as now. S1 is untouched. |
| 11 | The O2d edge drags (left edge out on a Loop, trim on a One-shot, Stretch refit) and the O2c note bars | Work per strip, exactly as built. |
| 12 | Open the stored scene from before this change | **Recommendation: migrate on load.** Each existing object becomes an object with ONE strip carrying its old start, duration, mapping, offset, data, modifiers and mute; a parent object becomes "parent strip = that object's first strip". Alternative: reset the dev scenes, as in earlier baseline resets (no migration code). |

## Not in this milestone

Several tracks inside one row (row 5); track mute, solo and lock; blend modes between layered tracks; strip-level versus object-level modifiers (only strip-level now); collapsing a row (Blender's expand); showing strips in the Outliner; a "content moves with the edge" key (BACKLOG).

## Proposed milestones (for the arc)

- **S0 (pure, no UI):** strip type and validation, evaluator over strips, ops (add, duplicate, delete, move to track, set parent), migration, tests from this table; DECISIONS row.
- **S1 (UI thin slice, human checkpoint):** Arranger draws strips per row with tracks, selection of a strip, drag per strip, Properties split into Object and Strip sections, Duplicate Strip.
- **S2:** Apply and modifiers per strip; the rest of the Outliner and Properties text; review and gate.

## Answers so far (human, 2026-11-24)

Rows 1, 3, 7, 8, 9, 10, 11 and 12 (migrate on load) confirmed. Row 2: Duplicate is independent, plus a linked option like Bitwig's clip alias. Row 4: no overlap, split cursor on a shared edge (hybrid of B). Row 5: dropped (no tracks inside a row yet). Row 6 (parent strip to strip): approved, "I'll need to see this one" (shown in the S1 thin slice).
