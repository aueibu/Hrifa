# Audit: stacked revisions in the workbench page folder (B0b, 2026-11-23)

Source: a read-only scout (grep and reads, no tests run), spot-checked by the orchestrator (importers of `ModulePatch`, `PacketInspector`, `ModuleLibrary`, `ChordPanelStandIn`, `savePatch`, `createDefaultPatch`, `evaluatePatch`, `loadSavedPatch`, and `compatibility`). Scope: `src/pages/composition-workbench/**` and `CompositionWorkbench.page.tsx`, 204 non-test files, about 42,900 lines (tests, about 30,000 lines, not audited). Paths below are relative to the page folder.

**Result: about 1,750 lines (4%) in 11 files are dead or legacy-read.** Baseline reset (W-51): none of it needs a migration. Verdicts: DEAD, LEGACY-READ, DUPLICATE, RENAME-ONLY, KEEP.

## R1. Dead files (no importer outside their own tests) — delete
| File | Lines | Note |
|---|---|---|
| `components/ModulePatch.tsx` | 192 | no importer at all |
| `components/PacketInspector.tsx` | 175 | no importer at all |
| `components/ModuleLibrary.tsx` | 56 | no importer |
| `chordInput/ChordPanelStandIn.tsx` | 13 | only 8 test files use it (update those tests) |
| `compatibility.ts` | 156 | tests only (`compatibility.test.ts`, `snippet.test.ts`); holds the duplicate `packetMatches` and the "Assign register" entry the ARCHITECTURE doc lists as "not built" |

## R2. The frozen demo patch chain — delete (the biggest item)
`registry.ts` (453), `evaluator.ts` (75), `persistence.ts` (67), `examples.ts` (59), `euclidean.ts` (49), and the patch types in `model.ts` (`PatchDocument`, `Connection`, `ModuleInstance`, `PatchEvaluation`, `EvaluatedModule`, `ModuleDefinition`). The page (`CompositionWorkbench.page.tsx` ~144, 225, 631-633) loads a constant demo patch (`createDefaultPatch`), evaluates it and shows its errors as red banners; **nothing ever saves the patch** (`savePatch` has no caller; `loadSavedPatch` reads a key nothing writes). It looks live and is not. Removing it also removes the second `moduleRegistry` (the Map in `registry.ts`; the live one is `runtime/moduleRegistry.tsx`) and the duplicate `acceptsPacket`. **Keep**: `acceptsPacket`'s logic must survive in the data-block types registry (B1); check what the live code uses for port acceptance before deleting (the scout found `compatibility.ts` and `registry.ts` to be the only two copies, both reachable only from dead paths, so the live acceptance check is elsewhere: builder confirms first).

## R3. Legacy read and migration code — delete
| Where | What |
|---|---|
| `deskStore.ts` 238-244, 261-262, 329-357; `desk.tsx` 213-229, 266-268, 590-592 | localStorage-to-IndexedDB desk migration and its plumbing |
| `projects.ts` 27, 271-311, 337-345, 353 | old snapshot file format (`hrifa-workbench-snapshots`); the duplicate parse branch |
| `compositionWorkspace.ts` 74-79, 101-113 | `{laneId, row}` placement upgrade (keep line 98's `snippetId` copy, a current field named `legacy`: rename the variable) |
| `layout/workbenchScreensets.ts` 73-97, 150-158, 213-249, 251-297, 323-336 | seeding from old layout keys, `upgradeChordsPlaces` (runs on every load), `readLegacyLayoutInputs`, `seedStoreFromStorage` |
| `editorStage.ts` (70 lines) | old editor Stage; only `migratedPickerRem` is live (used by the seeding above); its two test files go too |
| `noteEditorPreferences.ts` 64-68, 79, 138-144, 172-174 | `chordHost`, `chordDockWidth`, read only to seed screensets |
| `stateKeys.ts` 3, 4, 9, 10, 15-18 | dead keys (`selectedConstructionModule`, `moduleQuery`, `compositionModuleLanes`, `compositionModules`) and the retired-key group (`workspaceView`, `canvasSplit`, `detailCollapsed`); two sit in `unrecordedStateKeys` |
| `mist.ts` 49, 210-245; `runtime/moduleState/swirlingMists.ts` 4, 16 | `migrateMistSettings` (versions 1 to 3) |
| `components/InterferenceModule.tsx` 51-59 | `legacyDefaultMidiNote` |
| `usePersistentState.ts` 62-67 `compositionInstanceStateKey` | first instance of each module type keeps the unsuffixed key (compat); suffix every instance (11 module components, `runtime/moduleState.ts:54`, page `:122` follow) |
| `desk.tsx` 126-128, 505-545, 632-653; `snippet.ts` 666, 710 | `restoreSnippetVersionById` and `createClipFromVersionById`: on the context, no UI calls them (ARCHITECTURE 599 says they work). **Orchestrator note: keep unless the human wants the version-restore UI dropped; they are the base of the version tree's restore.** |

## R4. Duplicates that remain after R1 to R3
`signalTypes.ts:88-94` `signalTypeFor` restates the `matches` predicates instead of iterating `signalTypeRegistry` in order (fold in B1); `isReloading()` is re-implemented in five places (`history.ts`, `persistence.ts` (goes with R2), `projects.ts`, `compositionSettings.tsx`, `runtime/stateStore.ts`): one helper; duplicate string constants (`EDITOR_LAYOUT_KEY` and `EDITOR_STAGE_KEY`; `NOTE_EDITOR_KEY` twice) go with R3.

## R5. Rename-only (B1a to B1c)
Retired words in non-test files: clip 847 lines in 54 files; snippet 602 in 32; module 1,161 in 137; patch 117 in 35; screenset 143 in 9; lane 137 in 14 (mixer code: `MixerLane`, `laneView`, `lanePlayhead`: these are mixer channels, decide at B1c); instrument 92 in 10 (`audio/instrumentRegistry.ts` is about sounds: decide at B1c). `SpessaSynthProcessor` is a library name: keep. 48 file names carry a retired word.
- **Note-specific "clip" names** (take Notes names): `NoteClipEditor`, `noteClipEdits`, `noteClipboard`, `clipProperties`, `clipTime`, `ClipPropertiesPanel`, `clipActions`, `clipActionRunner`, `ClipActionsPanel`, `clipEditorSession`, `clipEditors` (11).
- **Generic stored-thing names** (take data-block names): `clipTypes` (to `dataBlockTypes`), `clipPreferences`, `NewClipPopover`, `ClipEditorSlot`, `ClipEditorSessionProvider`, `snippet.ts`, `runtime/evaluators/snippetSource.ts`, `SnippetPreview`, `SnippetSourceModule` (Make source, to the data-block node).
- **Node names** (module to node): 13 shared files (`Module*`, `moduleRegistry.tsx`, `moduleEvaluators`, `modulePorts`, `moduleState`, `useModuleEvaluation`, `useModulePreview`) and 13 module components (`ArithmeticModule` ... `SwirlingMistsModule`).

## R6. Comments and docs
153 history-narrating comments in 57 files (51 milestone tags such as M4b, M6a, R3b in 26 files). Misleading now: `editorStage.ts:2` says the editor Stage "is gone" while it is still called; `projects.ts:353` uses `isLegacySnapshot` as the guard for the current format; `workbenchScreensets.ts:226` "one-time upgrade (M6a)" runs on every load; `stateKeys.ts:16-17` says retired keys are "never read again" but they are. Most vanish with R3. The rest is swept as each file is renamed (one rule: a comment says what is true now, never how it got here).

Page `ARCHITECTURE.md` fixes (done in the milestone that removes the code, not separately): drop the patch-persistence sentence ("Browser persistence"), the `laneId` migration note (217), "Canvas takeover: removed (M6a)" (233), the "Not built:" list and "Assign register" (520), the localStorage desk migration (610) and snapshot-store sentence (612), "Since R3b" and R1/R2 references in "Module runtime" (396-440), the desk's "restore and create-from-version as a working path" (599) (only if those functions go); move "Direction: rolling playback and arrangement" (618-634) to a roadmap file or `arcs/workbench`; fix two broken links (171 to `arcs/workbench/SCENARIOS.M6.md`, 738 to `arcs/harmonic-field-lab/UI-CONVENTIONS.md`).

## Removal plan (orchestrator-decided; one builder step each, related tests only, gate once at the end of the group)
1. **R1 + R2** (dead files and the demo patch chain, the page's banner and `createDefaultPatch` wiring, their tests, the `model.ts` patch types). Builder first confirms where the live port-acceptance check lives.
2. **R3a** screenset seeding, `editorStage.ts`, the retired state keys, `chordHost`.
3. **R3b** desk, projects, workspace, mist, interference and instance-key legacy.
4. **R4** `signalTypeFor` and the `isReloading` helper (small; the orchestrator may do it directly).
Then B1a to B1c renames on what is left. Net effect: about 4% less code to rename and no history to carry across the new baseline.
