# PROGRESS

## Status
- Arc: stage (`arcs/stage`)
- Current milestone: setup (check:stage), then C0
- State: building (ARC.md approved 2026-11-13)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Pre-arc audit (read-only, 2026-11-13) | Done | none run | Lab layout: pure `state/layout.ts` (pin, stack, move, splitters, `fitColumns`), `PinnedColumn`, header strip with injected buttons, shared `ui.tsx` kit; no size awareness, hardcoded `PanelId`, page-local. Workbench centre: hardcoded `SplitStage` plus `ClipEditorSlot` and `canvasTakeover`; inspector has per-panel CSS and inline sizes on top of `compactTheme.ts`. |

## Shared touches (locks taken)
None yet. Planned: `package.json` (setup, `check:stage`), then `src/pages/Stage.page.tsx`, `src/Router.tsx`, `src/data/applets.ts` (M3), `shell/ARCHITECTURE.md` (M3, M6).

## Open questions for human
- Approve `ARC.md` (or change it). In particular: the vocabulary (region, module, slot, layout, size), building only in new folders with no edits to the workbench or the lab, and the milestone order with checkpoints after M1, M3, M4, M5 and M6.
- DECISIONS prefix `STAGE` (the registry has W, S, H; single letters are taken or reserved, T for tunings).

## Next action
After the human approves `ARC.md`: take the `package.json` lock, add `check:stage` (modelled on `check:hfl`), commit `arcs/stage/` and `package.json` path-scoped, release the lock, then run C0.
