# DIGEST: workbench arc (read this instead of DECISIONS.md, ARCHITECTURE.md and the whole ARC.md)

One page for builders. Orchestrator: refresh it at the end of every milestone (rows that changed, the active milestone, the pointer list). If this page and a source disagree, the source wins: report the mismatch. Last refreshed 2026-11-25 (after L1a/L1b, before L2).

## Read order for a builder
1. This file.
2. Only the active milestone's section in `arcs/workbench/ARC.md` (named in the brief), plus its Owned and Shared paths and Check command.
3. `shell/UI-RULES.md` for UI milestones only; `src/theme/THEMING.md` for color work.
4. The source files the brief points at. Grep `DECISIONS.md` and the page `ARCHITECTURE.md` for ONE id or heading when this page points there; never read them whole.

## Paths
- Owned: `src/pages/composition-workbench/**`, `arcs/workbench/`.
- Shared (need a lock row the orchestrator already holds, else stop): `src/pages/CompositionWorkbench.page.tsx`, `src/components/`, `src/theme/`, `package.json`, `vite.config.mjs`, `.claude/agents/`, `CLAUDE.md` files.
- Gate (orchestrator only): `corepack yarn check:workbench`. Builders: `corepack yarn check:fast <changed files>` plus `corepack yarn typecheck`, once.

## Data contracts that hold (do not change without the human)
- `DataPacket` (kind, domain, frame, items with provenance), exact-rational time in quarter notes, midicent pitch (fractional allowed; non-12-EDO is a core rule: exact cents with a period), the version tree, PianoRoll, the audio engine. Page `ARCHITECTURE.md` "The three axes" and "Packet contract".
- One registry (`dataBlocks/`): packet types (notes, pitch-set, pitch-classes, rhythm, values, list, bank) and record types (scene, collection, object). A stored block has `typeId`, `schemaVersion` 2, `payload` or record `data`, slot-keyed refs (`refs`, `mapRefs`, `onRefDeleted`). Users are computed, never stored. References blank on delete, never fall back. Baseline reset: no saved-project compatibility except what a milestone states. (W-52 to W-65)
- Desk (`desk.tsx`): `allDataBlocks` = every stored block (records and packets); `dataBlocks` = packets only (cards, pickers). Edits go through `desk.applyDataBlockList` (one undo step; desk first, instances after, inside one `recordGroup`). (W-68)

## Scene model (W-66, W-67, W-69, W-72 to W-77)
- `scene` has ONE root collection. `collection`: name, `memberRefs` (objects and child collections), mute (a muted collection silences everything under it). Collection = one Arranger lane.
- `object` = ONE placement (W-77 reversed the strip layer; W-75/W-76 are historical): `name`, `primaryDataRef` (null = Empty, silent but visible), `timeSpan` and `registerSpan`, `mapping` (`loop` default | `stretch` | `one-shot`), required `contentOffset` (W-74), `modifiers`, `parentRef: Ref|null`, `mute`. Child start is relative to the parent; a deleted parent leaves the child in its world place; a child plays only to its parent's end; a muted object does not silence its children.
- Evaluation (`scene/evaluateScene.ts`, pure, two-stage memo): parent chain to world start, base packet, modifier stack on ONE cycle, THEN mapping, then span/register/parent-end cuts, merge unmuted. Scene length = end of the spans, empties included. A missing reference silences its object and Properties names it. Apply bakes one cycle into a new Notes block, keeps the mapping; Apply is only on the top modifier, Apply All bakes the stack.
- Modifiers (`scene/modifiers/`): Melodicize, Snap to Pitch Set, Harmonize. `ModifierInstance` = `{ id, type, mute, params, refs }`, slot keys `modifier:<id>:<slot>`.
- Ops (`scene/sceneOps.ts`): pure, return the whole block list; object ops include duplicate, duplicate linked, `placeObjectNearest`, `resizeSharedEdge`, `moveToCollection`, `objectRoom`. Stored W-75 strip objects are unwrapped by `scene/sceneMigration.ts` on raw lists before validation.
- Arranger geometry is pure (`arrangerGeometry.ts`, `arrangerLanes.ts`, `arrangerDrop.ts`, `arrangerRelations.ts`, `arrangerPreview.ts`); the panel is `components/ArrangerPanel.tsx`. Direct edits never create an overlap: drags clamp or land in the nearest free slot; overlap from a parent moving its children draws on auto sub-lanes. Selection and row heights are per-viewer session state (`scene/sceneSession.ts`), not project data, not undoable.

## Active constraints (from the human)
- UI: Blender, then Bitwig, then the human's ideas decide; no flicker or popping (not "nothing moves"); the page fits the window and panels scroll inside; plain words, exact button names; theme roles only. `UI-RULES.md` has the rest.
- No tonal language (pitch set, members, voices; no major, minor, triad); American spelling; nothing sounds without asking; look or sound changes are a thin slice then STOP for the human.
- Tests: related files only, once. A flaky test is a defect (`waitFor` on settled state). Node 24 portable on PATH; never bulk-format.

## Status and pointers
- Active: L1a and L1b built, uncommitted, awaiting the human's look; then L2 (one reviewer, gate, commit); then O4a to O4c. Truth: `PROGRESS.md` "Next action".
- Superseded, do not build from: S0 to S2 strips, T0 to T6b, R4. Removed from ARC.md on 2026-11-25; recover from git history if needed.
- Where things live: `SCENARIOS.objects.md`, `SCENARIOS.modifiers.md` (confirmed tables); `VOCABULARY.md` (Blender words); `HANDOFF.data-model.md`; DECISIONS ids W-66 to W-77 for the scene; page `ARCHITECTURE.md` sections "The desk", "References and users", "Outliner and Properties", "Arranger", "Data-block registry".
