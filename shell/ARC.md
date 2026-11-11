# ARC: Clips and the clip editor

> Adopted. The desk arc is archived as `ARC.desk.md`. Proposals below came from the design discussion; edit freely.

## Goal
Let a composer start from a blank clip and edit it directly, without a module feeding it. A clip is a desk snippet with a type; double-clicking it opens its editor in the bottom panel, as in a DAW's clip editor. Edits are tracked so they can be undone and so a clip's history can be traced. This subsumes the old M5 (blank clip).

## Design decisions already made (from the human)
- Module device editing (parameters you move) and clip editing (viewing and editing a result) are two independent things. A blank clip needs only the clip editor.
- Editing a clip commits to the same snippet id, so Make-source modules pointing at it update live. A family-tree trace of how things were derived is wanted (later milestone).
- Undo/redo is wanted, with buttons on the top bar beside Play/Stop.
- The layout has four regions: left inspector, right params (both collapsible), an upper stage (canvas or desk today; timeline and arranger later) and a bottom editor panel. The bottom panel must become general: module edit, clip edit, and more later. It is already visible in both canvas and desk views.
- Clip types come in levels of detail: rhythm is duration only, the piano roll adds pitch, a pitch list is values with no placement in time (grouping like `[1 2 3]` is allowed). Some types can open in more than one editor.

## Parameters
- Primary scope: `src/pages/composition-workbench/`. Explicitly also allowed, because the editors and panel live there: `src/components/PianoRoll/`, `src/components/EditorPalette/`, and `src/pages/CompositionWorkbench.page.tsx` (layout only).
- Snippet packets stay JSON-safe `DataPacket`s. An edit replaces a snippet's packet atomically (a new frozen packet, never mutated in place) and adds a provenance step naming the operation.
- If the stored snippet shape changes, bump `schemaVersion`, add a migration, keep `acceptsSnippets` rejecting corrupt or newer desks, and keep existing v1 desks loading.
- Colors use THEMING.md roles. Editor chrome reuses `EditorPalette` tools and actions.
- Preserve the hidden-view rule (opacity, visibility, pointer-events, inert; never `display: none`) and keep every module mounted so it keeps publishing outputs.
- Test policy: builders run only the test files they touch; reviewers read the diff without running the gate; the orchestrator runs `check:workbench` once before a milestone advances.

## Preconditions
- The desk arc (M1-M4) is committed or the human has said to build on the uncommitted state.
- `corepack yarn check:workbench` is green at the start (565 tests at the end of the desk arc). If red, stop and report.

## Non-goals
- No timeline or arranger in this arc (the upper stage only needs to stay extensible).
- No plug-in or VST hosting, no music21 analysis, no modulation or process chains on clips.
- No change to module math.

## Milestones

### K1: History foundation (desk)
- Scope: an undo/redo history for desk snippet changes (add, remove, rename, note, duplicate, convert, and later edits). Undo and Redo buttons on the top bar next to `TransportBar`, disabled when empty. Bounded depth. History is session-only; the desk's persisted shape does not change.
- Acceptance:
  - [ ] Test: each existing desk mutation can be undone and redone, restoring the exact prior snippets
  - [ ] Test: a new change after an undo clears the redo stack
  - [ ] Test: history does not affect `acceptsSnippets` or the stored desk
  - [ ] Undo and Redo are keyboard-reachable
- Human checkpoint after: no

### K1b: Workbench-wide undo/redo
- Why: the human expects ordinary undo (a generator value changed from 5 to 6 undoes back to 5), not desk-only history. K1's desk history is absorbed into this.
- Scope: scout first to list state that bypasses `usePersistentState` (canvas node positions, cables and patch persistence, plain component state). Then one workbench-wide history, built on K1's single recording path, covering module parameters, the canvas patch and the desk. Requires: coalescing so one slider drag or typing burst is one step; exclusion of transient state (playback, hover, selection, view/scroll); bounded depth; session-only (no stored-shape change). Undo applies regardless of which view is visible (human decision: acting on a hidden view is fine). Undo/Redo buttons and shortcuts stay where K1 put them. The shortcut must work everywhere, including while focus is in a text box or number input (generator values are text boxes; Ctrl+Z after editing one must undo that change), so it calls preventDefault and uses the workbench history instead of the browser's per-field undo. Only skip it for events already default-prevented or with Alt held.
- Scout findings (2026-11-11) that fix the design:
  - Feasible without refactoring modules: record inside `usePersistentState` (setter value or updater, one `useState` per hook, persistence by effect). It has no external write path today, so add a module-level registry of `key -> setter` filled on mount; undo writes the previous raw value through the registered setter (and to localStorage if the hook is unmounted).
  - Record `(key, previousRaw, nextRaw)` per write; coalesce by time window and pointer-up, because no `onChangeEnd` exists anywhere (volume sliders, number inputs, text keystrokes, curve drag and piano roll view all write per tick).
  - Exclude by a flag on the key, not per module: mount/migration writes, and the transient keys (activeCompositionModule, compositionInspectorTarget, canvasSplit, detailCollapsed, workspaceView, inspectorOpen, settingsOpen, every roll/view/zoom/scroll/follow key, preview volumes/steps/units/gates/sounds, audition and selection keys).
  - Auto-resets (Interference `groupingId` reset, Mixer `channelState` prune and `framed` reset, Melodicization `framed` reset) must not create their own entries: exclude or fold into the triggering action.
  - Outside the hook and needing explicit wiring: global `compositionSettings` (transport, sounds); module delete (`removeCompositionInstanceStorage` removes raw localStorage keys directly, so undoing a delete must restore those raw values before the module remounts, since the hook reads storage only in its initializer); canvas positions commit on drag stop already, so they record once per drag.
  - Decision: the desk joins the global history and K1's `pastRef`/`futureRef` are retired; `applyChange` becomes a thin wrapper over the global recorder. There is one Ctrl+Z binding.
  - Pre-existing issues to fix on the way: two orphaned per-instance keys missing from the removal list (`pitchConvertOnChange`, `scaleConstructionIntervals.text`). Dead keys and the unused `savePatch` stay untouched.
- Acceptance:
  - [ ] Test: changing a module parameter (e.g. a generator value 5 to 6) then Undo restores 5, Redo restores 6
  - [ ] Test: a drag or typing burst coalesces into one undo step
  - [ ] Test: adding/removing a module and moving or connecting on the canvas are undoable
  - [ ] Test: desk changes remain undoable through the same history
  - [ ] Test: transient state (playback, selection, view) creates no history entries
  - [ ] Test: history is not persisted and does not change any stored shape
  - [ ] Scout report lists any state that cannot be covered, with a decision on each
- Human checkpoint after: yes (does undo feel like undo in other software?)
- Stop and ask if full coverage needs refactoring modules beyond routing their state through the shared hook.

### K2: Edit contract
- Scope: `commitSnippetEdit(snippet, newPacket, operation)` replaces the packet on the same id, adds an `edit-clip` (or named) provenance step to affected (added/modified) items, and goes through K1's history. Do not build the tree viewer here (K7).
- Version model (human decision, 2026-11-11): a clip keeps a stored derivation tree of snapshots, so any earlier state can be viewed, inspected and returned to at any time. Additive optional field on `Snippet` (no schema bump; v1 desks must still load): `lineage?: { head: string; versions: SnippetVersion[]; derivedFrom?: { snippetId; versionId; operation } }` where `SnippetVersion = { id; parentId: string | null; at: ISO string; operation: string; packet }` (design details are the builder's, but: a tree via `parentId`; the current packet is the head version; editing after returning to an earlier version creates a branch). Bounded per clip (count and/or size) with a pruning policy that keeps the tree connected and never drops the head. Never-edited clips store no lineage. Cross-clip derivation: Duplicate and Convert-to-pitch-classes record `derivedFrom` on the new clip. An edit may NOT change `kind`, `domain` or `encoding` (that is a new clip with `derivedFrom`, not an edit).
- Data operations in K2 (no UI): `commitSnippetEdit`, `restoreSnippetVersion` (same id, head moves to that version, undoable), and `createClipFromVersion` (new clip with `derivedFrom`). All through `applyChange`.
- Acceptance:
  - [ ] Test: an edit keeps the id, `createdAt` and name, changes the packet, and appends provenance
  - [ ] Test: a Make-source module for that snippet publishes the new packet after an edit
  - [ ] Test: the edit is undoable
  - [ ] Stored shape unchanged, or migrated per Parameters (stop-and-ask if a migration is needed)
- Human checkpoint after: yes (confirm the version/lineage model before building on it)

### K3: Generalise the bottom panel
- Scope: replace "active module id" as the only thing the bottom panel shows with an editor target (module instance or clip). Modules stay mounted and hidden as today. Add an editor slot for clips. A desk card double-click sets the target to that clip and expands the panel. Until an editor exists for a clip type the slot shows a clear "no editor for this clip yet" state.
- Acceptance:
  - [ ] Test: selecting a module still shows its editor exactly as before
  - [ ] Test: double-clicking a desk card targets that clip and expands a collapsed panel
  - [ ] Test: the panel works in both canvas and desk views and the hidden-view rule is unchanged
- Human checkpoint after: yes (layout and wording)

### K4: Clip types and New clip
- Scope: a clip-type registry (`kind`, `domain`, blank factory, editor id, playable flag). A "New clip" action on the desk with a type picker (notes first; add pitches, rhythm, list when their editors exist). Blank note clip: empty `events | note`, chosen length, linear frame, origin 0.
- Acceptance:
  - [ ] Test: every registered blank clip is a valid packet accepted by `acceptsSnippets`
  - [ ] Test: unsupported actions on an empty clip (convert, audition) refuse or disable cleanly
  - [ ] Test: adding a type to the registry needs no desk or persistence change
- Human checkpoint after: yes (type picker wording and placement)

### K5: Note clip editor
- Scope: extend `PianoRoll` with edit callbacks (add, move, resize, delete, velocity) so a clip editor can own no state beyond the packet; a `NoteClipEditor` that reads the clip's packet, applies edits via K2, and reuses `EditorPalette` tools and actions. Melodicization's roll must behave exactly as before.
- Acceptance:
  - [ ] Test: drawing, moving, resizing and deleting notes commit edits to the clip and are undoable
  - [ ] Test: existing roll consumers (Melodicization, Mixer) are unchanged
  - [ ] Test: edited notes keep stable item ids
  - [ ] A blank note clip can be filled from nothing and auditioned from the desk
- Human checkpoint after: yes (does it feel like a clip editor?)

### K6 (stretch): Rhythm and list clip editors
- Scope: scout first. The rhythm editor today is program/rule driven (`RhythmEditModule`) and the curve editor is prop-driven (`CurveEditor`). Decide which primitive editor each clip type needs (duration strip, value list) before building.
- Acceptance: to be written after scouting.
- Human checkpoint after: yes

### K7 (stretch): Lineage viewer
- Scope: a "History" button on a clip that opens a panel on the right showing the family tree of how the clip got there (K2's `lineage`: versions, branches and `derivedFrom` links), with preview/inspect of any version and Restore here, Create from this, and Open for comparison, using K2's data operations. Layout and wording are the human's call (checkpoint).
- Human checkpoint after: yes

## Final step
Update the desk and workbench-frame sections of `ARCHITECTURE.md` (clips, edit contract, editor slot, history), then run `reviewer` over the full diff.

## Stop-and-ask conditions
- A criterion can't be met after 2 builder attempts.
- A change would alter an existing persisted shape in a way that breaks saved desks (K2 may need this).
- Any change outside the scopes listed under Parameters, or to module math.
- Any decision about layout, wording or look beyond reusing existing patterns.

## Budget
Max 2 builder attempts per milestone, then stop and report.

## Facts from scouting (2026-11-11)
- `PianoRoll` is prop-driven but reports only selection and view; it has no note-edit callback. Used by Melodicization and Mixer.
- `CurveEditor` is pure props (points in, onChange out) and used only by Swirling Mists.
- `RhythmEditModule` (943 lines) is program/rule driven with about 12 persisted keys per instance; not a direct-manipulation grid as far as scouted.
- Bottom panel: `SplitStage`; active module is `activeCompositionInstanceId`; all modules stay mounted and are `hidden` when inactive; the panel is a sibling of the view grid, so it shows in both canvas and desk views. Nothing opens a desk card into it yet.
- No undo/redo anywhere in the workbench. Desk snippets live in `DeskProvider` as a plain array persisted under `hrifa.composition-workbench.desk.snippets.v1`.
- `TransportBar` (Play selected module, Stop all previews) is the top bar to extend for Undo/Redo.
- `Snippet.origin` and per-item provenance exist but nothing displays them; `PacketInspector` is unused.
