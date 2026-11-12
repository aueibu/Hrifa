# BACKLOG

Small things and ideas left over from finished arcs. Not scheduled. Anyone starting a new arc should skim this first and pull in what fits. Add new items at the top of the matching section; delete an item when it ships (note the commit).

Tags: every item starts with its workstream folder name under `arcs/` (e.g. `[workbench]`, `[tunings]`) or `[shared]` (shared = concerns PianoRoll, theme, desk or other code several arcs read). An arc pulls in only items for its own tag, or `[shared]` ones after taking the lock in `arcs/LOCKS.md` for the code they touch. Adding or removing your own backlog items needs no lock (any session may `git add` this file; another session's items riding along in your commit are accepted).

Source arc: **Clips and the clip editor** (archived in `arcs/workbench/ARC.clips.md` / `arcs/workbench/PROGRESS.clips.md`, last commit `8ee3cc4`).

## Next arc candidates
- [workbench] **Bring Melodicization and Mixer onto the new roll/lane conventions.** They were left unchanged on purpose (every new `PianoRoll`/`VelocityLane` prop is opt-in). Update them to use the unified panel, detached scroll, grid-density function, cursors, velocity lane, selection model and the clip-type registry. Melodicization's cyclic note packets are currently excluded from clip properties and actions; that module will be reworked on top of the clip editor.
- [workbench] **Multi-pitch chord items** as a real feature (today same-onset notes are separate single-pitch items; transforms treat same-onset items as one chord slot).

## Interaction ideas
- [workbench] **Alt+drag swaps Pencil and Paint temporarily** (Bitwig does this). Optional, only if cheap.
- [workbench] **Click-and-vertical-drag on number fields** (bars.beats.ticks fields in the inspector): choose sensitivity by where the press landed (bars vs beats vs ticks), like Bitwig.
- [workbench] Rotate-in-time notices: a note already crossing the span end before the first press is cut on that press (a full cycle then leaves two touching pieces).
- [workbench] The `-1/+1` buttons next to the rotation amount only step the field; they do not apply a rotation. Revisit if that feels wrong.
- [shared] Roll rows are 12-EDO and ignore the `edo` setting (which only colours notes); pitch step is 100 midicents, octave 1200. Revisit if the roll should follow the EDO setting.
- [workbench] Arrow keys do nothing for a time selection (kind `time`).
- [workbench] Lane time move shows a band preview and a Copy/Merge label but no ghost notes (the roll shows ghosts).
- [workbench] `Make all pitches equal` on separate same-onset notes merges them into one note under the overlap rule (decided: same as Bitwig).

## Known small issues (low severity, none lose notes)
- [workbench] **Tests:** the speed tests in `noteKeyboard.test.ts` / `noteClipEdits.overlap.test.ts` use loose bounds (3 s / 5 s; the old O(n^2) code measured 1574 ms / 227 ms), so they are smoke tests, not regression guards. Tighten the bounds or grow n. The keyboard test "is fast and leaves no overlap" is a no-op (nothing overlaps; it only checks the item count). The lane test at `VelocityLane.test.tsx:~792` remounts the lane, so "fresh left ramp press" is covered end to end only by the editor test.
- [workbench] **Performance:** one quadratic path remains in `resolveSamePitchOverlaps` when many touched notes sit inside one long untouched note (about 61 ms at n=1000, 896 ms at n=4000). `Ctrl/Cmd` resize and the rest are fine.
- [workbench] **Overlap rule corner:** a weaker touched note can erase an untouched note in a region that a stronger touched note, exempt as a pre-existing overlapping pair, later takes. Consistent with the design; revisit only if it bites.
- [workbench] **Same-onset ties** among touched same-pitch notes are decided by packet order (documented), so results are not fully order-independent there.
- [workbench] **Escape / Enter scoping:** `pointerInside` can stay true after alt-tab, so Escape could clear a velocity ramp from a top-bar control. Body focus counts as in scope for Enter during a pitch pick (harmless in practice).
- [workbench] **Code hygiene:** `selectionRef` is assigned during render in `NoteClipEditor.tsx` (concurrent-render caveat; works because the desk updates synchronously). `OverlapResult.created`/`.removed` are used only by tests. `rotation` rest-slot and multi-pitch edge cases are documented in `ARCHITECTURE.md`.
- [shared] **Theming:** raw `white`/`black` keywords inside `color-mix` for the time band, lane borders and cursor art (`PianoRoll.module.css`, `VelocityLane.module.css`, `toolCursors.ts`). Likely an approved look; replace with theme roles if THEMING.md is enforced strictly.
- [workbench] **Firefox:** cancelling the Alt keyup to stop the menu bar after Alt+arrow was verified only on Chrome/Windows.
- [workbench] **Pointer tracker:** with two touch points, lifting one finger clears the "held" flag while the other is still down; keys stay dead until the mouse moves after a release outside the page.
- [workbench] **Provenance:** every commit stamps provenance again, so provenance arrays grow with each rotate press (pieces themselves are rebuilt from originals).
- [shared] **Roll edge:** `reveal` (scroll note into view) is only correct in the detached roll; its right-edge check ignores the keyboard width in a non-detached roll (no effect today).

## Known behaviours worth remembering (not bugs)
- [workbench] A velocity-only or label-only edit never triggers overlap resolution; pairs that already overlapped in the clip are left exactly as they were; only new overlaps resolve (K5d).
- [workbench] While a velocity ramp is armed in the Paint tool, the browser menu does not open on the lane (right drag curves; a plain right click also curves).
- [workbench] Time move in Alt (merge) mode still overwrites same-pitch notes at the destination; transforms and keyboard moves overwrite same-pitch neighbours they land on in clean clips.
- [workbench] Whole selected legato run + Ctrl+Right: each note grows one unit, later onsets overwrite earlier ones' overlap, so only the last note keeps the extra unit.
- [workbench] A mid-air stale dev page (hot reload) can make module state look broken: hard-refresh or restart the dev server before reporting a dead control (two incidents this arc: an empty cached `HorizontalScrollbar.tsx`, and a stale editor publishing old channel state).
- [shared] Workflow files: `WORKFLOW_HANDOFF.md` is committed (3041593); it is a portable workflow doc and also holds copies of the gitignored agent definitions.
