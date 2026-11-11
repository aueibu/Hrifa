# PROGRESS

## Status
- Human accepted M3 checkpoint (card look, wording, no audition). Human note for later: card actions (Make source, Duplicate, To pitch classes, Delete, ...) will need grouping into a menu or right-click menu; not in this ARC.
- Current milestone: M4 (built, awaiting human checkpoint). M5 (stretch) not started.
- State: M1 committed (8aabc96). M2, M3, Pitch List guard, M4 and the ARCHITECTURE.md desk update are built and uncommitted. Final-step reviewer over the full diff: PASS-WITH-HUMAN-CHECK. Final gate: see log.

## Log
| Milestone | Result | Test status | Notes / decisions made |
| --------- | ------ | ----------- | ---------------------- |
| M1 | Implemented (snippet.ts `editSnippetNote`, desk.tsx `setSnippetNote`, DeskView note input, CSS, 3 new tests). Uncommitted. | `check:workbench` green: typecheck, format, lint, stylelint, 49 files / 542 tests. | Gate failures were environmental, now fixed: Node 26 breaks jsdom localStorage (fixed via `--no-experimental-webstorage` in vite.config.mjs); CRLF working copies converted to LF repo-wide; workbench formatted with oxfmt and lint/style tidied. Gate is now scoped to the workbench (`check:workbench`). Builder decisions: borderless note input, placeholder "Add a note", saves on blur; blank note removes the key. |
| M2 | Implemented (snippet.ts `duplicateSnippet`, desk.tsx `duplicateSnippetById`, DeskView "Duplicate" button between Make source and Delete, 3 tests incl. provider reload). Uncommitted. | green, 49 files / 545 tests. Reviewer PASS. | Decisions: copy inserted right after original; note and origin copied; provenance parameters record sourceSnippetId; `sourceModuleInstance` falls back to 'desk' when no origin. Schema unchanged. Label/tooltip/position are new wording, for human glance at the M3 checkpoint. |
| M3 | Implemented, then revised to project EDO (snippet.ts `convertSnippetToPitchClass` with `edo`/`snap`, `PITCH_GRID_TOLERANCE_MIDICENTS = 0.5`; desk.tsx `convertToPitchClassById`; DeskView "To pitch classes" button plus Snap/Cancel Mantine Modal; SnippetPreview text; compatibility.ts any chromatic-N; DeskView.test.tsx new). Uncommitted. | green, 50 files / 563 tests (reviewer-run). Reviewer PASS-WITH-HUMAN-CHECK. | Resolution is project EDO; encoding `chromatic-<edo>`. On-grid converts directly; off-grid prompts and only snaps on confirm (provenance records `edo`, `snappedCount`); hard refusal for non-note, empty, non-finite. Audition disabled (no register). Copy name `<name> (pitch classes)`, inserted after original. |
| M4 | Mostly pre-existing: `SendToDeskButton` under every module output (ModuleHost `ModuleOutputsSection`) already captured a whole packet. Changed snippet.ts: `SnippetOrigin.itemIds` now optional and omitted for whole captures; whole capture `structuredClone`s the packet. 2 tests in snippet.test.ts. ARCHITECTURE.md updated. Uncommitted. | Touched tests + tsc green; final gate in log below. Reviewer PASS-WITH-HUMAN-CHECK. | Reused `capture-snippet` provenance. schemaVersion stays 1 (shape only loosened; nothing reads `origin.itemIds`). No new UI or wording. |

## Open questions for human
- M4 checkpoint: Send to desk on a non-roll module output should add an independent card; reload a desk saved before this change to confirm it still loads.
- Reviewer lows left: `structuredClone` in whole capture throws on non-cloneable values and SendToDeskButton has no try/catch (latent; packets are JSON-safe); `convertToPitchClassById` reads `snippets` from the render closure; EDO changing while the Snap prompt is open makes Snap use the new EDO.
- RESOLVED: Pitch List's upstream was domain-only. Human approved a defensive `kind === 'list'` guard (pitch.ts `interpretPitchList`, PitchListModule.tsx `inputDefinesFormat`, one test in pitch.test.ts). Pitch List has no inlet in the shipped app (CompositionWorkbench.page.tsx passes no `upstream`), so this only matters if one is added. Make source stays allowed on converted cards. Final gate (orchestrator-run): green, 50 files / 564 tests.
- Tolerance 0.5 midicent vs 1e-6 in pitch.ts: pitches within 0.5 cent are treated on-grid without a prompt. Acceptable?
- Wording/layout of the new buttons: "Duplicate" and "To pitch classes" (between Make source and Delete), tooltips, copy names.
- Is the note input's look/wording acceptable?
- `git status` still lists ~110 files as modified though `git diff` shows no content change (stale index stat data after the LF conversion); see wrap-up notes.

## Reviewer follow-ups
- Applied: `acceptsSnippets` now rejects a non-string `note`.
- Left: note input remounts if the stored note changes mid-typing (unlikely); no Enter/Escape handling (matches the name input).
- Human check: card placement/wording of the note field; reload the app to confirm persistence.

## Test-run policy (human decision)
Builders run only the test files they touched while iterating, with no full gate. Reviewers read the diff and do not run the gate. The orchestrator runs `check:workbench` once as the single final checkpoint before a milestone is advanced or the arc closes.

## Next action
Awaiting human checkpoint on M4. Then M5 (stretch, human checkpoint after) or commit. Nothing committed beyond M1.
