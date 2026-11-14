# Research note: Bitwig Studio note editor vs composition-workbench

Date: 2026-11-12. Read-only study, no shell code changed. Outcome: nine items added to `shell/BACKLOG.md` (top of "Next arc candidates", block headed "Bitwig study").

## Caveats
- Almost all of Bitwig's code is obfuscated (`zsx`, `JHy`, `Vxa`). Only `com/bitwig/flt/widget/core/timeline/interaction/*DragAction` class names, localization keys and the theme file are readable.

## Where the evidence is (Bitwig install, `C:\Program Files\Bitwig Studio`)
- `resources/localization/Bitwig Studio-resources.properties`: user-facing action, tool, mouse-gesture (`mouse.*.desc`), snap and quantize strings. The best source for "what can it do".
- `resources/themes/default.theme`: colour roles (loop region fill/stroke, time-selection states, grid lines). It is a JSON-like file; named colours have `absolute_color` data.
- `bin/bitwig.jar` (readable with `javap -cp ... -p -c -constants <class>` from a JDK). `bin/libs.jar` holds libraries. `jar xf` fails on Windows (reserved name `PRN.class`); extract with .NET `ZipFile` or Python `zipfile` and skip failures.
- Finding which class uses a string: scan extracted `.class` bytes for the localization key (constant pool strings are uncompressed).

## What was established
- Drag actions share a base (`interaction/JHy`): `beginEventEditing`, `updateEditEvents`, `finishEventEditing`, `cancelEventEditing`; 5 DIP drag threshold; per-action modifier toggles ("disable/enable snap", "fine adjustment") listed to the user; optional cursor lock, mouse-speed scaling, drag tooltip.
- Velocity: `NoteVelocityDragAction` (absolute, from y position scaled by zoom, 200 ms audition retrigger, remembers last velocity; off-velocity variant). `AdjustNoteVelocityDragAction` (relative, about 0.005 per pixel).
- Other note drags exist for random velocity spread, chance, repeat velocity ramp and curve, gain, fades, stretch, start, end, slide content and expression spread.
- Loop/clip strip: `ClipCueMarkerTimelineWidget` with `LoopRegionStartOrEndDragAction` (start, end or whole region), launch-quantize anchor toggle; separate clip end and loop length drags.
- Tools: Pointer, Pencil (single note, pitches, pattern, step mode, velocity draw, velocity ramp), Knife, Eraser, Spray Can, Step Input, Time Selection. Snap options: time, grid, grid-relative, other events, key lock.
- Theme: separate styles for selected / implicit / not-selected / standby / inactive time selections and for normal vs selected loop regions.
- Screenshot (human supplied, not stored here): flag handles for loop start and end in a header strip, darker shading beyond the loop, per-note colours, pitch name inside notes, black-key rows darker, C rows emphasised, velocity stems coloured to match notes, a button column for lanes and a second thin lane under velocity. The purple "S1" header bar was not identified.

## Not established (unknown)
- How Bitwig draws and edits microtonal pitch. Only strings were seen: "Pitch / Transpose" note expression with "Snap to semitones", "Tuning Files" (Scala), MPE pitch-bend range. Inference only, not traced.
- Default hotkey map (not found in readable form).
- Exact modifier meanings per gesture (only that toggles are advertised).

## shell side (audited by a subagent; spot-check before relying on it)
Editor is DOM-based (`src/components/PianoRoll/PianoRoll.tsx`, `VelocityLane.tsx`), pitch in midicents with continuous y, fixed 12-TET 128-row axis, mouse edits quantised to 100 cents, tools on keys 1-6, transforms only as inspector buttons. Full detail is in the audit; re-run it if needed.

## Cleanup
Working copies (extracted classes, `javap` output, helper scripts) were left in the session scratchpad, a temp folder. They are Bitwig class files; delete them rather than copying them into the repo.
