# PROGRESS

## Status
- Arc: ARC.md (Clips and the clip editor). The previous desk arc is archived in `ARC.desk.md` / `PROGRESS.desk.md` (committed at 39bb1af).
- Current milestone: K2b (desk storage in IndexedDB), added 2026-11-11
- State: K1 and K1b committed (415e5e3), K1b checkpoint accepted. K2 built, uncommitted, reviewed PASS-WITH-HUMAN-CHECK (gate green 54 / 626). Human decided the lineage tree should persist like Google Docs version history and chose full snapshots in IndexedDB over session-only or diff-based history; new milestone K2b added to ARC.md. K2 checkpoint is combined with K2b's.

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| K1 | Implemented: desk.tsx single `applyChange` recording path with bounded (50) session-only past/future history, `undo`/`redo`/`canUndo`/`canRedo` on the desk context; TransportBar Undo/Redo buttons (own "History" group at the left of the bar, before Play, per human) plus Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; desk.test.tsx (16 tests). Uncommitted. | Orchestrator gate before the button move: green, 51 files / 581 tests. After the move: desk.test.tsx 16/16, oxfmt and tsc clean (full gate not re-run). Reviewer PASS-WITH-HUMAN-CHECK. | Stored desk shape unchanged; history not persisted. Human moved Undo/Redo out of the playback icon group to the left of the bar. Shortcut is ignored while any button has focus (incl. after clicking Undo); works in every view, including canvas. Disabled buttons show no tooltip (Mantine). |

| K1b | Implemented (history.ts recorder; usePersistentState records and registers setters; desk, compositionSettings, module add/remove and canvas via the shared recorder; Ctrl+Z works in text inputs; history.test.tsx, history.page.test.tsx). Uncommitted. Reviewer PASS-WITH-HUMAN-CHECK; the 4 medium issues were fixed in attempt 2 of 2 (fold-into-removal, folds after undo/redo, playback settings excluded via virtual `#authored` key, connect test, no-op burst keeps redo, stale inspector target). | Final gate (orchestrator, after fixes): green, 53 files / 611 tests. | Coalesce 500 ms (same key or same tick, closed by pointerup/pointercancel/focusout). Transient keys excluded by `unrecordedStateKeys`. Auto-resets fold into the triggering step. Builder added two page effects (active-module fallback, prune outputs of vanished modules) needed for undoing an add. Undone add leaves per-instance keys orphaned until redo or reload (leak only). |

| K2 | Implemented (snippet.ts `lineage` tree, `commitSnippetEdit`, `restoreSnippetVersion`, `createClipFromVersion`, `pruneLineage`; desk.tsx actions via `applyChange`; derivedFrom on Duplicate/To pitch classes; snippetEdit.test.tsx; ARCHITECTURE.md). Uncommitted. Reviewer PASS-WITH-HUMAN-CHECK: all acceptance met; storage cap unsafe. | Gate green, 54 files / 626 tests. | Storage findings: desk save failures are silently swallowed (usePersistentState.ts:225-231, history.ts:224-234), so a reload restores a stale desk and a full origin silently blocks every other key; 2M-char cap per clip (~4 MB real) means ~2 edited 200-note clips fill the 5 MB origin; a 4096-event clip becomes unsaveable after one edit (root + head unprunable); snapshots copy the whole desk, lineage included. Proposed fix: rename to MAX_LINEAGE_CHARS and lower to ~400K; desk-wide lineage budget (~1.5M) pruned in applyChange; opt-in onPersistError so the desk prunes and retries on quota, then sets a `persistError` flag; warning UI needs human wording. Lows: desk.tsx:39-40 comment, unused rootId, per-clip budget ignores the head packet. |

| K2b | Implemented, attempt 1 (deskStore.ts IndexedDB wrapper with serial queue, migration, persist(); desk.tsx `loading`/`persistError`/`flushDesk`/`restoreDeskHeads`, snippet-level undo values in history.ts; snapshots strip lineage and restore via `restore-snapshot` head versions; DeskView loading text and yellow Alert; caps 500 versions / MAX_LINEAGE_CHARS 20M incl. head; coalesce key, 500 ms; fake-indexeddb dev dep; deskStorage.test.tsx 21 tests). Uncommitted. | Builder-run gate green: 55 files / 647 tests (2 existing lint warnings). | Builder decisions: changes refused while loading; unreadable IDB desk starts empty and is never overwritten; failed migration keeps the localStorage key; empty `[]` not migrated; snapshot restore aborts if the desk can't save; desk-wide budget and prune-and-retry dropped as unnecessary with IDB. Human items: warning wording/look ("⚠" placeholder icon), "Loading the desk…" text, Make-source shows "Missing snippet" briefly during load, Undo/Redo not disabled while loading. |

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

## K2/K2b checkpoint answers so far (human, 2026-11-11)
- Q3 (snapshot restore dropping lineage) superseded: snapshots become saved projects that replace the workbench on open (K2c).
- Version granularity: too fine; versions only at capture/transform/restore/end of edit session (K2c).
- Q5 (failed restore leaves snapshot clips on screen) superseded by K2c's replace-on-open with nothing changed on failure.
- Still open: Q1 wording (warning, conflict, loading), Q2 "Missing snippet" flash during load, Q4 edits on a locked desk (recommend block). K2/K2b not committed yet.

## History of K2b/K2c attempts
K2b reviewer FAIL (1 high: two tabs can leave the stored desk unloadable; 3 medium; 6 low). Builder attempt 2 of 2 done: all fixed except #9 (human item); `rev` conflict check in desk-meta, tolerant load ("repaired" warning), WeakMap version sizes + head-only validation, 1000 ms gesture debounce, SnapshotMenu disabled while loading, restoreDeskHeads/flushDesk report refusal, tx abort, blocked-open close, legacy key retry, coalesce-key-scoped undo merge, ARCHITECTURE wording. Builder-run gate green 55 / 659. Orchestrator gate green 55 / 659 (2 pre-existing lint warnings in untouched tests). Re-review PASS-WITH-HUMAN-CHECK, no new data-loss path. Two lows open: a snapshot restore that fails to save still leaves the snapshot's clips on screen (and ARCHITECTURE.md:438 says it aborts untouched); edits on a locked desk are accepted but never saved. Builder budget for K2b used up. Human approved new milestone K2c (saved projects + coarse versions); K2c attempt 1 built (projects.ts + ProjectMenu.tsx replace snapshots; IDB v2 with projects/project-desks stores; replaceDesk + endEditSession; edit sessions amend head for `edit-*` ops, idle 3 min; dirty flag via history change count; current-project marker key `hrifa.workbench-current-project.v1`; export/import kept). Builder-run gate green 56 / 667. Reviewer FAIL: 1 high (after a successful open, the old page can keep writing before reload; module auto-resets overwrite restored keys and mark the OLD project dirty, so a later Save overwrites project A with B), 3 medium (migration drops invalid entries then removes store; failed rollback misreported; migration re-run can overwrite newer saves), lows. K2c attempt 2 of 2 built: snapshot migration dropped per human (old store untouched; #2/#4 moot); reloading.ts flag freezes all writes/recording after a successful open; replaceDesk {reloading}/{restore}; rollback failure message; handEdit option replaces the edit-* name rule; blocked-open retries; "· no desk" row note. Builder-run gate green 56 / 670. #7 (voices/metronome/count-in not marking dirty) left for human. Orchestrator gate green 56 / 670. Re-review PASS-WITH-HUMAN-CHECK. Lows left (budget used; need human OK): module removal not guarded by the reloading flag (page.tsx:222-232); a throw in stopAll/reload after a successful open freezes the page silently (ProjectMenu.tsx:193-199); edits during the in-flight open aren't recorded; open() lacks a busy check at entry; no try/catch safety net around openProject. STOPPED at combined K2 + K2b + K2c human checkpoint. Nothing committed. Checkpoint now combined K2 + K2b + K2c. Nothing committed. Then one orchestrator `check:workbench` run, then stop for the combined K2 + K2b human checkpoint.

## K2/K2b/K2c checkpoint (human, 2026-11-11): accepted
- Text and appearance fine. Buttons in the project menu looked too round: portals (popovers, menus, modals) rendered outside `.workbench` and fell back to Mantine's default radius; CompositionWorkbench.module.css now applies the workbench radii to `[data-portal]` while the workbench is on the page.
- Edits on a locked desk are now refused (applyChange and the undo applier check writableRef); the warning adds "Changes to the desk are turned off until it can be read."
- K2c lows fixed by the orchestrator with approval: module removal skips while reloading; open() has a busy guard, a try/catch safety net that clears the reloading flag, reload before stopAll (wrapped), and a stall message after 4 s; edits during an in-flight open are accepted as is.
- Gate green 56 / 670. Committed.

## Follow-up before K3 (human, 2026-11-11)
- Transport and sounds (metronome, count-in, voices and their volumes/sounds) are part of a project: always saved, restored on open by default.
- The "Open transport and sounds too" switch moves out of the project menu into a new "Developer" menu button on the top bar (temporary; human may move or remove it later).
- Changing any of those settings marks the project unsaved AND is undoable (reverses K1b's authored-only rule). Slider drags/typing coalesce into one step as elsewhere.

- Done: every compositionSettings field is recorded via one virtual `#settings` history key (replaces `#authored`), so playback changes are undoable and mark the project unsaved; Developer button + popover on the top bar (DeveloperMenu.tsx, developerOptions.ts, key `hrifa.developer-options.v1`, outside projects and history). Gate green 57 / 678. Committed.

## Next action
Start K3 (generalise the bottom panel) with a builder.
