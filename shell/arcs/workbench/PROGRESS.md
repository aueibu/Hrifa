# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Timeline (`arcs/workbench`), DRAFT 2026-11-18, awaiting the human's approval of `ARC.md`
- Current milestone: none (C0 after approval)
- State: the previous arc is archived (`ARC.one-stage.md`, `PROGRESS.one-stage.md`; M7 and M8 parked in BACKLOG). No new check script needed (`check:workbench`). No locks held.

## Where to look
- `ARC.md` (this arc). The previous arc and its decisions: `ARC.one-stage.md` (Integration decisions D4 meta lane, D5 pitch), `PROGRESS.one-stage.md`. Earlier archives: `ARC.chord-input.md`, `ARC.desk.md`, `ARC.clips.md`.
- The workbench `src/pages/composition-workbench/ARCHITECTURE.md`: "The desk", "Direction: rolling playback and arrangement".

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft (2026-11-18) | ARC.md drafted | none needed | The human, after the M7 questions: needs "somewhere for them to go", a timeline with tracks, then the meta lanes; the three kinds of tools (instruments, processors, operations) frame it. |
| Draft revised (2026-11-18) | ARC.md rewritten | none needed | The human corrected the first draft (a timeline of finished note clips): material of any kind goes on the timeline and combines there ("put a pitch set on the timeline or a block chord and then somehow associate it with a rhythm block ... have those two interact and create the realization"). New milestones: T0 scenarios (association by overlap, link or realize block), T1 data, T2 lanes and material blocks, T3 realizations (reusing the module evaluators), T4 playback, T5 bake, T6a sections, T6b pitch context. |

## Shared touches (locks taken)
None yet.

## Open questions for human
- Approve the revised `ARC.md` (milestones C0, T0 to T6b).

## Next action
**RESUME HERE (2026-11-18, context cleared by the human):** the revised `ARC.md` (Timeline: material lanes and realizations) is a DRAFT the human has not approved yet; ask for approval first. NOT COMMITTED yet (path-scoped commit after approval: `arcs/workbench`, `BACKLOG.md`): the archive renames `ARC.md -> ARC.one-stage.md` and `PROGRESS.md -> PROGRESS.one-stage.md` are staged (git mv), the new `ARC.md`, `PROGRESS.md` and `SCENARIOS.M7.md` are untracked, and `BACKLOG.md` has the parked M7/M8 items. After approval: commit, C0 (context scan), then T0 scenarios (`SCENARIOS.T.md`), starting with how blocks get associated (overlap in time / explicit link / realize block, or a mix), each option shown with an example where they differ. Framing to keep: instruments (the lab: direct, never nodes) / processors (canvas modules, live) / operations (one-shot on a selection, some with options); realizations are processors placed in time and reuse the R2 evaluators; no timeline of finished note clips only. The human's dev server: http://127.0.0.1:5174.
