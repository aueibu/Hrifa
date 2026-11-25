# DIGEST: workbench arc (current state only)

Rules for this file: OVERWRITE, never append; hard cap 100 lines; when a design is replaced (L0 replaced S0) delete the old rule, never strike it through; pointers over prose. The orchestrator refreshes it in the milestone-end step (`shell/CLAUDE.md` rule 4) if data shapes, contracts or locks changed. If it disagrees with a source file, the source wins: report it. Refreshed 2026-11-25 (before L2).

Builders: read this file and your milestone section in `arcs/workbench/ARC.md`. Grep `DECISIONS.md` or the page `ARCHITECTURE.md` for ONE id or heading only when a pointer below says so.

## 1. Current contracts and shapes
Page root `src/pages/composition-workbench/` (below: `pw/`).
- Records: `pw/scene/sceneTypes.ts` (scene, collection, object; `ObjectData` = ONE placement, W-77). Registry: `pw/dataBlocks/registry.ts`; refs and users: `pw/dataBlocks/dataBlockRefs.ts`. Desk: `pw/desk.tsx` (`allDataBlocks` = all stored blocks, `dataBlocks` = packets only; edits via `applyDataBlockList`, one undo step).
- Evaluation: `pw/scene/evaluateScene.ts`; ops: `pw/scene/sceneOps.ts`; modifiers: `pw/scene/modifiers/`; migration of old stored objects: `pw/scene/sceneMigration.ts`.
- Binding rules (ids in `shell/DECISIONS.md`):
  1. W-66/W-77: scene has ONE root collection; Collection = one Arranger lane; object = `primaryDataRef` (null = Empty), `timeSpan`, `registerSpan`, `mapping` (loop | stretch | one-shot), required `contentOffset`, `modifiers`, `parentRef`, `mute`.
  2. W-67: evaluate = parent chain, base packet, modifier stack on ONE cycle, THEN mapping, then span/parent-end cuts; two-stage memo; missing ref silences its object and Properties names it.
  3. W-66/W-70: a child's start is relative to its parent; a deleted parent leaves the child in its world place; a child plays only to its parent's end; refs blank on delete, never fall back.
  4. W-72/W-73: `ModifierInstance` = `{ id, type, mute, params, refs }`; Apply only on the top modifier, bakes one cycle into a new Notes block; Apply All bakes the stack.
  5. W-68: users are computed, never stored; records have no desk card (Outliner shows them).
  6. W-71/W-77: Arranger edits never create an overlap (clamp or nearest free slot); parent-induced overlap uses auto sub-lanes; selection and row heights are per-viewer session state (`pw/scene/sceneSession.ts`).
  7. Contracts untouched without the human: `DataPacket`, exact-rational quarter-note time, midicent pitch (non-12-EDO is core: exact cents with a period), version tree, PianoRoll, audio engine.

## 2. Boundaries
- Owned: `pw/**`, `arcs/workbench/`. Shared (need a lock row the orchestrator holds, else stop and report): `src/pages/CompositionWorkbench.page.tsx`, `src/components/`, `src/theme/`, `package.json`, `vite.config.mjs`, `.claude/agents/`, `CLAUDE.md` files. Active locks: see `arcs/LOCKS.md` (read it before touching a shared path).
- Builder checks, once: `corepack yarn check:fast <changed files>` and `corepack yarn typecheck`. Never the gate, never a test folder, never a barrel file into `check:fast`. Orchestrator: `corepack yarn check:workbench` once per milestone.
- Human's rules: look or sound = thin slice then STOP; no tonal language (pitch set, members, voices); American spelling; nothing sounds without asking.

## 3. Key file map (active phase: Arranger lanes, then node trees)
- `pw/components/ArrangerPanel.tsx` (panel, about 900 lines) and `.module.css`; pure geometry in `pw/scene/arrangerGeometry.ts`, `arrangerLanes.ts`, `arrangerDrop.ts`, `arrangerRelations.ts`, `arrangerPreview.ts`.
- `pw/components/ScenePanels.tsx` (Outliner and Properties; `PropertiesBody`), `pw/scene/outlinerRows.ts`, `pw/scene/useScenePlayback.ts`.
- Node runtime for O4a: `pw/runtime/NodeEvaluationRunner.tsx`, `pw/runtime/useNodeEvaluation.ts`.
- Confirmed scenario tables: `arcs/workbench/SCENARIOS.objects.md`, `SCENARIOS.modifiers.md`; vocabulary: `VOCABULARY.md`.
- Status truth: `arcs/workbench/PROGRESS.md` "Next action" (L1a/L1b built, uncommitted, awaiting the human; then L2, then O4a to O4c).

## 4. UI only
If the milestone touches UI, read `shell/UI-RULES.md` (and `src/theme/THEMING.md` for color). Skip both for pure-TS milestones.
