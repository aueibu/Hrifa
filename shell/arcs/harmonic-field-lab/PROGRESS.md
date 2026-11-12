# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: Dynamic retuner + move into the Hrifa shell + encyclopaedia UI (`arcs/harmonic-field-lab`)
- Current milestone: C0
- State: not started (Setup done)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Draft | ARC written 2026-11-12 (Infinitone repo) | prototype GREEN, 221 | Human chose: new card list, all four scorers, mock-first UI. Based on `notes/AUTORETUNER.md`. |
| Approval | ARC approved 2026-11-12 | prototype GREEN, 221 | Default scorer = Sethares roughness; scorer checkpoint dropped; UI milestones approved. |
| Re-plan | Hrifa move added 2026-11-12 | prototype GREEN, 221 | Move to the shell (core to TS, UI rebuilt in React, shell theme), prototype frozen. Ultimate goal: join the Composition Workbench piece by piece. The lab stays a standalone page; the Workbench reuses its core and sections. |
| Setup | Moved into `arcs/harmonic-field-lab/` 2026-11-12 | prototype GREEN, 221; `check:hfl` see below | Human: start in Hrifa now; write the retuner once in TS after the core port (old M1 is now M2, old M2 is M1); prototype frozen now. Approved defaults: folder `harmonic-field-lab`, gate `check:hfl`, DECISIONS prefix H, lock on `src/pages/Home.page.test.tsx` for the applet count. Infinitone repo `ARC.md`/`PROGRESS.md` now point here. |

## Shared touches (locks taken)
- `package.json`: taken 2026-11-12 (Setup, add `check:hfl`), released 2026-11-12 after the setup commit.

## Open questions for human
- None now (per-milestone questions are in ARC.md).

## Next action
C0: from a session in `C:\Data Files\Projects\Hrifa\shell`, run the context scan (ARC.md C0), record it here, run `corepack yarn test` once for the baseline, then brief a `builder` for M1 (core to TS + empty themed page) after taking the M1 lock rows.
