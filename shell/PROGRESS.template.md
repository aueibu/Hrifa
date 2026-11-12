# PROGRESS

Copy to `arcs/<name>/PROGRESS.md` (`<name>` = workstream folder; archive any previous arc there as `PROGRESS.<topic>.md` first). Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: <name> (`arcs/<name>`)
- Current milestone: M?
- State: not started / building / in review / awaiting human / done

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |

## Shared touches (locks taken)
<One line per shared path edited: path, date taken, date released, and the `DECISIONS.md` id if one was logged. Written by the orchestrator, not the builder (nothing in ARC.md or PROGRESS.md is written by builders, reviewers or scouts). A lock still held is also a row in `arcs/LOCKS.md`; a row is released only after the path is committed. Add the commit hash.>

## Open questions for human
-

## Next action
<One sentence: exactly what to do next.>
