# PROGRESS

## Status
- Arc: stage (`arcs/stage`)
- Current milestone: M1 (vocabulary, size contract, kit measurements; documents only)
- State: building (setup and C0 done)

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| Pre-arc audit (read-only, 2026-11-13) | Done | none run | Lab layout: pure `state/layout.ts` (pin, stack, move, splitters, `fitColumns`), `PinnedColumn`, header strip with injected buttons, shared `ui.tsx` kit; no size awareness, hardcoded `PanelId`, page-local. Workbench centre: hardcoded `SplitStage` plus `ClipEditorSlot` and `canvasTakeover`; inspector has per-panel CSS and inline sizes on top of `compactTheme.ts`. |
| Setup (2026-11-13) | Done | `check:stage` green with no code | `check:stage` added under a `package.json` lock; ARC.md approved with three edits (word "size", prefix `STAGE`, stand-in spike modules OK). Commit `9484348`; lock released. |
| C0 (2026-11-13) | Done | none run | Other arcs: workbench (chord input, M7 committed, awaiting human review then M8) and harmonic-field-lab (M5 approved, M6 next) are both active; structure is finished. `arcs/LOCKS.md` has no rows. Nothing imports the lab's `state/layout.ts` or `components/ui.tsx`. Workbench `SplitStage`, `canvasTakeover`, `ClipEditorSlot`, `compactTheme` are used only inside `composition-workbench/` and `CompositionWorkbench.page.tsx`. Relevant decisions: W-11 (opt-in roll props), W-15 to W-17 (chord-input ghost notes, dock beside the roll and canvas takeover as named slots; per-viewer prefs `chordHost`, `chordDockWidth`), W-10 (per-viewer prefs outside the project prefix), H-1/H-2 (lab pitch and colour roles). Relevant backlog: "Bring Melodicization and Mixer onto the new roll/lane conventions", "Tuning-aware pitch axis" and the non-12-EDO umbrella (roll rows), chord picker polish and the chord label strip (need a roll header strip, shared `PianoRoll`). No conflicts with this arc's owned paths. |

## Shared touches (locks taken)
`package.json`: taken and released 2026-11-13 (setup, commit `9484348`). Planned: `package.json` (setup, `check:stage`), then `src/pages/Stage.page.tsx`, `src/Router.tsx`, `src/data/applets.ts` (M3), `shell/ARCHITECTURE.md` (M3, M6).

## Open questions for human
- None open. The M1 checkpoint will ask about the size thresholds and the kit tokens.

## Next action
Run M1: a builder writes `src/pages/stage/ARCHITECTURE.md` (vocabulary, size set and thresholds, module contract, worked examples, kit tokens measured from the lab, gap list) and appends DECISIONS rows STAGE-1 to STAGE-3; a reviewer checks it; then stop at the M1 human checkpoint.
