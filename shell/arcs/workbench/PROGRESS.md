# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: One Stage for the workbench (`arcs/workbench`), approved 2026-11-14
- Current milestone: C0 done; M1 (design, human checkpoint) in progress
- State: building M1

## Where to look
- `ARC.md` (this arc). Archives of earlier workbench arcs: `ARC.chord-input.md`, `ARC.desk.md`, `ARC.clips.md` and their `PROGRESS.*` files.
- `STAGE-ADOPTION.md` (terms and the current nesting), `src/pages/stage/ARCHITECTURE.md` section 13, `../../BACKLOG.md` (items tagged `[stage]`, `[shared]` Stage items, `[workbench]` Stage adoption items).

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup (2026-11-14) | Done | none needed | ARC.md approved. No `check:` script needed: the arc uses the existing `check:workbench` and `check:stage` (plus `check:hfl` for shared-component changes). Human decisions at approval: a stack can contain a tab group; closing the last tab releases the group's space; one instance per panel id per Stage by default. Added by the human before approval: remembered placement (a closed panel reopens in its last place), Reaper-style tab groups, pop-out as a stretch milestone (M8). |
| C0 (2026-11-14) | Done | none run | Other arcs: `harmonic-field-lab` is active (its M7 is built and reviewed, waiting for the human's audio and feel checkpoint; it owns `src/pages/harmonic-field-lab/` and `src/lib/harmonic-field/`, and consumes shared components so `check:hfl` runs before committing any Stage, kit or `src/components/` change); `stage` and `structure` are finished. `arcs/LOCKS.md` has no rows. Importers: the Stage and kit are imported only by the `/stage` spike (`src/pages/stage/**`) and by `NoteClipEditor` through `editorStage.ts`; `NoteClipEditor` is imported by `clipEditors.ts` and `clipTypes.ts`; Scale Explorer depends on workbench audio and the Forte catalog, not on these. Relevant decisions: STAGE-1 to STAGE-19, W-16 to W-25, W-11 (opt-in PianoRoll props). Relevant backlog: the `[stage]` and `[shared]` Stage items, `[workbench]` lift the chord session, canvas takeover and `SplitStage` as slots. |

## Shared touches (locks taken)
None yet.

## Open questions for human
- None open. M1 asks about the area set, Send-to versus drag, the state boundary and pop-out.

## Next action
M1: builder writes `arcs/workbench/DESIGN.one-stage.md` (panel model, layout model options, remembered placement, tab groups, pop-out, state boundary, mapping of the current workbench centre, open questions with recommendations); reviewer checks it against the code; then the human checkpoint.
