# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: One Stage for the workbench (`arcs/workbench`), approved 2026-11-14
- Current milestone: M1 closed pending approval of the amended ARC.md; M2 next (needs open item O3 answered)
- State: awaiting human (approve the amended ARC.md; answer O3)

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

## Shared touches (locks taken)
None yet.

## Open questions for human
- None open. M1 asks about the area set, Send-to versus drag, the state boundary and pop-out.

## Next action
Human approves the amended ARC.md and answers design open item O3 (is the chord picker panel `transient`: open exactly while the Chords tool is on?). Then take the locks for M2 (`src/lib/stage/`, `src/components/Stage/stageOps.ts` and `registry.ts`; `src/pages/stage/` only if its ARCHITECTURE.md section 10 is edited), write the M2 builder brief from `DESIGN.one-stage.md` sections 2, 3 and 10, build, review, gate (`check:stage`, `check:workbench`, `check:hfl`), commit.
