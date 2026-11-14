# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: One Stage for the workbench (`arcs/workbench`), approved 2026-11-14
- Current milestone: C0 (context scan), then M1 (design, human checkpoint)
- State: setup done, starting C0

## Where to look
- `ARC.md` (this arc). Archives of earlier workbench arcs: `ARC.chord-input.md`, `ARC.desk.md`, `ARC.clips.md` and their `PROGRESS.*` files.
- `STAGE-ADOPTION.md` (terms and the current nesting), `src/pages/stage/ARCHITECTURE.md` section 13, `../../BACKLOG.md` (items tagged `[stage]`, `[shared]` Stage items, `[workbench]` Stage adoption items).

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup (2026-11-14) | Done | none needed | ARC.md approved. No `check:` script needed: the arc uses the existing `check:workbench` and `check:stage` (plus `check:hfl` for shared-component changes). Human decisions at approval: a stack can contain a tab group; closing the last tab releases the group's space; one instance per panel id per Stage by default. Added by the human before approval: remembered placement (a closed panel reopens in its last place), Reaper-style tab groups, pop-out as a stretch milestone (M8). |

## Shared touches (locks taken)
None yet.

## Open questions for human
- None open. M1 asks about the area set, Send-to versus drag, the state boundary and pop-out.

## Next action
C0: read `shell/ARCHITECTURE.md`, `DECISIONS.md`, `BACKLOG.md`, the Status of `arcs/harmonic-field-lab`, `arcs/stage` and `arcs/structure`, and `arcs/LOCKS.md`; note who imports the Stage, kit and `NoteClipEditor`; record in this file. Then M1 (builder writes the design, reviewer checks it, human checkpoint).
