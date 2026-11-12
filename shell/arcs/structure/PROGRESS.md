# PROGRESS

## Status
- Arc: arcs/structure (Multi-arc structure for shell/). Docs and instruction files only.
- Current milestone: none
- State: done (2026-11-12)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| M1 | Built: arcs/ with LOCKS.md, archives moved to arcs/workbench/ (pure renames), arcs/workbench/PROGRESS.md, shell/CLAUDE.md rewritten (layout, multi-milestone workflow, concurrency rules, per-checkout files, test-run policy added), root CLAUDE.md pointer, builder/reviewer/scout updated (arc folder from the prompt, shared files, Check command, locks, reviewer cross-arc question; models and tools untouched), ARC/PROGRESS templates (Owned/Shared paths, Check command, C0 context scan, Shared touches), BACKLOG tags, WORKFLOW_HANDOFF.md layout parts. Reviewer attempt 1 gaps fixed in attempt 2 after the human chose SAME CHECKOUT. | docs only, no gate | Human decisions: concurrent arcs wanted; tunings page under src/pages/; same checkout (2026-11-12). |
| M2 | Built: shell/ARCHITECTURE.md (layers, shared contracts, who consumes what, where a new page plugs in, Tunings and pitch, unverified claims) and shell/DECISIONS.md (W-1..W-12 from the clips/desk arcs, S-1..S-8 for this arc, prefix registry). Attempt 1 reviewer FAIL (incomplete `edo` reader list, understated non-12-EDO behaviour, several wrong pointers); attempt 2 fixed those plus procedure rules 13-16; final review found rule 15 (check scripts green before code) needed `--no-error-on-unmatched-pattern` and several procedure gaps (shared git index, inactive workstreams, errors caused by other arcs, consumer checks, lock race, setup order): fixed in a last docs pass. | docs only, no gate | Human checkpoint 2026-11-12: rules 13-16 confirmed ("that works for me"). Orchestrator defaults (a)-(f) for the human to veto later are in ARC.md and DECISIONS.md S-8. |
| Final | ARC.md and PROGRESS.md moved to arcs/structure/; committed with path-scoped adds. The last full reviewer pass was run before the final docs pass; the final docs pass was verified by grep/diff/path checks by the orchestrator, not by a second reviewer. | docs only | Shared touches: this arc edited standing shared paths (shell/CLAUDE.md, root CLAUDE.md, .claude/agents, templates) without lock rows: acceptable as the bootstrap that created the lock protocol. Root CLAUDE.md and .claude/agents are gitignored (per-checkout files; copies of the agents live in WORKFLOW_HANDOFF.md section 5). |

## Open questions for human
- Veto or adjust decisions (a)-(f) (DECISIONS.md S-8) when the tunings arc starts.

## Next action
None. Next: the human names a workstream (e.g. tunings) and the orchestrator follows CLAUDE.md rule 16.
