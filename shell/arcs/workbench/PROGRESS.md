# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: One Stage for the workbench (`arcs/workbench`), approved 2026-11-14
- Current milestone: M2 committed; M3a (the tree Stage component beside the old one) next, then your checkpoint at `/stage`
- State: ready for M3a

## Where to look
- `ARC.md` (this arc). Archives of earlier workbench arcs: `ARC.chord-input.md`, `ARC.desk.md`, `ARC.clips.md` and their `PROGRESS.*` files.
- `STAGE-ADOPTION.md` (terms and the current nesting), `src/pages/stage/ARCHITECTURE.md` section 13, `../../BACKLOG.md` (items tagged `[stage]`, `[shared]` Stage items, `[workbench]` Stage adoption items).

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup (2026-11-14) | Done | none needed | ARC.md approved. No `check:` script needed: the arc uses the existing `check:workbench` and `check:stage` (plus `check:hfl` for shared-component changes). Human decisions at approval: a stack can contain a tab group; closing the last tab releases the group's space; one instance per panel id per Stage by default. Added by the human before approval: remembered placement (a closed panel reopens in its last place), Reaper-style tab groups, pop-out as a stretch milestone (M8). |
| C0 (2026-11-14) | Done | none run | Other arcs: `harmonic-field-lab` is active (its M7 is built and reviewed, waiting for the human's audio and feel checkpoint; it owns `src/pages/harmonic-field-lab/` and `src/lib/harmonic-field/`, and consumes shared components so `check:hfl` runs before committing any Stage, kit or `src/components/` change); `stage` and `structure` are finished. `arcs/LOCKS.md` has no rows. Importers: the Stage and kit are imported only by the `/stage` spike (`src/pages/stage/**`) and by `NoteClipEditor` through `editorStage.ts`; `NoteClipEditor` is imported by `clipEditors.ts` and `clipTypes.ts`; Scale Explorer depends on workbench audio and the Forte catalog, not on these. Relevant decisions: STAGE-1 to STAGE-19, W-16 to W-25, W-11 (opt-in PianoRoll props). Relevant backlog: the `[stage]` and `[shared]` Stage items, `[workbench]` lift the chord session, canvas takeover and `SplitStage` as slots. |
| M1 (2026-11-14) | Document written, reviewed twice (first FAIL, second FAIL on one contradiction between question 5 and 6(a)), human checkpoint answers received | none run | `DESIGN.one-stage.md` (24 open questions). Human answered all (see ARC.md M1 Checkpoint decisions): wants dockers named by the user and far more arrangement freedom than top and bottom (probably a split tree of named dockers), saved workspaces, docker shortcuts then tab cycling, multiple instances for some modules, chord picker state at page level, and a longer vision of draggable data drops. Research on docking layout systems launched. The design document must be revised to match; that is a post-checkpoint revision driven by the human, not a builder retry. |
| M1 final (2026-11-14) | Closed pending the human's approval of the amended ARC.md | none run | Design revised three times (reviews 2 to 4); human decisions after the checkpoint: build our own tree, per-project screensets as meta-tabs, pin in this arc, the new milestone order. ARC.md amended: M3 split into M3a and M3c, M4 into M4a and M4b (size), M2 waits for the human's answer on design open item O3 (`transient`), M5 and M6 test retirements listed, chord place seeded at M5 with a one-time upgrade at M6, v1 Stage removal moved to the M8 decision. Last consistency review found no code facts wrong (13 of 13 held). |
| M2 (2026-11-14) | Done, reviewed (PASS with 3 should-fix, all fixed), committed | `check:stage` green (18 files, 227 tests), `check:workbench` green (86 files, 1414 tests), `check:hfl` green (37 files, 851 tests) | Pure core in `src/lib/stage/` (new: `tree.ts`, `places.ts`, `solve.ts`, `ops.ts`, `migrate.ts`, `screenset.ts`, `fixtures.ts`, five test files) plus additive edits to `lib/stage/registry.ts` and `index.ts`, `components/Stage/registry.ts` and `stageOps.ts` (`dockerMinOf`, `treeMinProblems`, `guardedTree`). The old v1 API, the editor's Stage and the spike are untouched. Fixed after review: rename (roll to clip-editor) runs before the unknown-id filter on the v1 parse path, the guard no longer refuses a send that only causes a narrow collapse (never guards open/show), `resizeSplit` is a true pair trade, `version` handling. DECISIONS W-26 to W-30. Notes: `foldEditorLayout` is generic (takes a base screenset), the old per-project keys and the workspace-view seeding are M5; `stageOps.tree.test.ts` sits in `src/lib/stage/` (it tests `components/Stage` code; moving it needs a lock on that folder). |

## Shared touches (locks taken)
None yet.

## Open questions for human
- None open. M1 asks about the area set, Send-to versus drag, the state boundary and pop-out.

## Next action
M3a: take locks (`src/components/Stage/dock/` new, `src/pages/stage/`, `src/components/InspectorKit/` conditional), write the builder brief from `DESIGN.one-stage.md` sections 2.5, 4, 5 and 10.1 (M3a row; keyboard, Panels menu, dynamic registry and the meta-tab strip are M3c, drag is M3b), build in `src/components/Stage/dock/` beside the old Stage (the old Stage and `NoteClipEditor.stage.test.tsx` stay untouched), reviewer, `check:stage` + `check:workbench` + `check:hfl`, commit, then the human checkpoint at `/stage`. Pass `selected` to `guardedTree` (W-30).
