# PROGRESS

Orchestrator updates after every milestone step. After a compaction, resume from here, not from memory.

## Status
- Arc: harmonic-field-lab, native tooltips arc (`arcs/harmonic-field-lab`)
- Current milestone: none. Arc COMPLETE after M1 (human scope cut, M2 and M3 dropped)
- State: finished

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Setup | ARC.md approved as drafted; PROGRESS.md created | no code, no gate | Gate policy: sparing (standing). No `package.json` change needed. |
| C0 | Context scan done 2026-11-16, no code, no gate | n/a | Nothing outside the lab imports `components/`, `texts.ts` or `markup.ts`; `arcs/LOCKS.md` has no active locks; `stage` and `structure` finished, `workbench` active (ready for M4b, a different page). DECISIONS: next id `H-17`; BACKLOG has the item "Native `title=` and SVG `<title>` tooltips still in place" this arc works on. Finding: the glossary entry `shape` is about scale regularity, not the Shape / Pitch register (see ARC Checkpoint decisions). |
| M1 | Built (builder), reviewed (reviewer PASS-WITH-HUMAN-CHECK), one behavior fix by the orchestrator, gated | see the commit | All seven `title=` attributes are `Hint`s; guard test: no `title=` on a lowercase JSX tag under `components/`. Review found one behavior change: the strip caption on the whole plot would pop a 300 px bubble over the strip while sweeping to play; moved to the axis labels (gutter), the plot is a `role="group"` named by the caption. `live.test.tsx` strip test now hovers the gutter and proves the plot opens nothing. Docs: page ARCHITECTURE, UI-CONVENTIONS, DECISIONS H-16 amended, BACKLOG item narrowed to the SVG `<title>`s. `CHECKPOINT.native-tooltips.md` written. |

## Shared touches (locks taken)
None.

## Open questions for human
- M1 checkpoint: hover the seven tooltips and approve their wording.
- None beyond the M1 checkpoint: the human cut the arc after M1 (M2 and M3 dropped; the SVG tooltips wait for the unified help panel idea in BACKLOG).

## Next action
None: the arc is complete. Open items for the human: hover the seven tooltips (`CHECKPOINT.native-tooltips.md`); the SVG `<title>`s wait on the unified help panel idea (BACKLOG).
