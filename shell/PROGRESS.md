# PROGRESS

## Status
- Arc: ARC.md (Clips and the clip editor). The previous desk arc is archived in `ARC.desk.md` / `PROGRESS.desk.md` (committed at 39bb1af).
- Current milestone: K2
- State: K1 and K1b committed (415e5e3), K1b checkpoint accepted. K2 builder running.

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| K1 | Implemented: desk.tsx single `applyChange` recording path with bounded (50) session-only past/future history, `undo`/`redo`/`canUndo`/`canRedo` on the desk context; TransportBar Undo/Redo buttons (own "History" group at the left of the bar, before Play, per human) plus Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; desk.test.tsx (16 tests). Uncommitted. | Orchestrator gate before the button move: green, 51 files / 581 tests. After the move: desk.test.tsx 16/16, oxfmt and tsc clean (full gate not re-run). Reviewer PASS-WITH-HUMAN-CHECK. | Stored desk shape unchanged; history not persisted. Human moved Undo/Redo out of the playback icon group to the left of the bar. Shortcut is ignored while any button has focus (incl. after clicking Undo); works in every view, including canvas. Disabled buttons show no tooltip (Mantine). |

| K1b | Implemented (history.ts recorder; usePersistentState records and registers setters; desk, compositionSettings, module add/remove and canvas via the shared recorder; Ctrl+Z works in text inputs; history.test.tsx, history.page.test.tsx). Uncommitted. Reviewer PASS-WITH-HUMAN-CHECK; the 4 medium issues were fixed in attempt 2 of 2 (fold-into-removal, folds after undo/redo, playback settings excluded via virtual `#authored` key, connect test, no-op burst keeps redo, stale inspector target). | Final gate (orchestrator, after fixes): green, 53 files / 611 tests. | Coalesce 500 ms (same key or same tick, closed by pointerup/pointercancel/focusout). Transient keys excluded by `unrecordedStateKeys`. Auto-resets fold into the triggering step. Builder added two page effects (active-module fallback, prune outputs of vanished modules) needed for undoing an add. Undone add leaves per-instance keys orphaned until redo or reload (leak only). |

## State that undo does NOT cover (K1b scout list, decisions)
- Plain component state (React Flow node state in CompositionCanvas, ForteCatalogBrowser query/selection, Melodicization selection and tool, SwirlingMists editingCurve, ModuleLibrary query, SnapshotMenu's own store): not authored workbench data or kept elsewhere; not undoable.
- Derived `compositionOutputs`: recomputed, never recorded.
- Snapshot store (`snapshots.ts`) and the unused `savePatch`: excluded.
- Local field drafts that commit on blur/Enter: Ctrl+Z undoes the last workbench change, not the draft text (human to confirm).
- Dead keys in `compositionStateKeys`: untouched.

## Open questions for human
- K1b checkpoint: does undo feel like undo in other software? Typing pause over 500 ms starts a new step; Ctrl+Z inside a draft/search field undoes the last workbench change, not the draft text.
- Left from the desk arc: card actions will need grouping into a menu or right-click menu; canvas toolbar layout left as is.

## Reviewer follow-ups

## Test-run policy (human decision)
Builders run only the test files they touched while iterating, with no full gate. Reviewers read the diff and do not run the gate. The orchestrator runs `check:workbench` once before a milestone is advanced or the arc closes.

## Next action
Start K1 (history foundation for the desk) with a builder.
