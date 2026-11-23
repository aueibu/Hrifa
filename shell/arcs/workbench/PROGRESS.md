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
| Draft revised again (2026-11-23) | ARC.md updated | none needed | The human read the Blender manual (`RESEARCH.blender.md`, on main as bde20d1) and asked to fold it in and to rework the data systems and packets toward Blender's data-block model for extensibility; and to give the orchestrator more room ("I just steer"). New: Working agreement section; milestones B0 (data-block design), B1 (references and users), B2 (ClipSelector, desk user counts) before T0; T0 to T2 carry the NLA answers (extrapolation, crop and repeat on the block, tweak mode, lane mute/solo/lock) and markers. Stage/Inspector ideas routed to a later arc (BACKLOG). |

## Shared touches (locks taken)
None yet.

## Open questions for human
- Approve the revised `ARC.md` (milestones C0, T0 to T6b).

## Next action
**RESUME HERE (2026-11-23):** (vocabulary decided, see `VOCABULARY.md` and W-51; baseline reset, no saved projects; B1a to B1c are the rename milestones) the revised `ARC.md` (now with B0 to B2 and the Working agreement) is a DRAFT awaiting the human's approval; ask for approval first. Then commit (path-scoped: `arcs/workbench`, `BACKLOG.md`), then C0 (read `RESEARCH.blender.md` first), then B0: write `DESIGN.data-blocks.md` with a recommended answer for every scenario row so the human only steers. The human's dev server: http://127.0.0.1:5174.
