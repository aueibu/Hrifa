# Design: one Stage for the workbench (panels with a home, areas, tab groups, remembered placement)

Milestone M1 of `arcs/workbench/ARC.md`. A design document, no production code. Written 2026-11-14 for the human checkpoint. Terms follow `STAGE-ADOPTION.md` section 0 (panel, workbench module, note clip editor, piano roll, chord picker, slot, column, stack, canvas takeover). New terms used here: **area** (a named part of the Stage that holds columns, section 2), **tab group** (several panels in one slot, one visible), **home** (the area a panel normally lives in), **place** (where a panel was last put). These words are a vocabulary proposal for the human to confirm (question 11, section 9).

**Scope summary (ARC M1 acceptance: each added idea in scope or deferred).** Remembered placement: **in scope** (M2 core, M3 component, M5/M6 use). Tab groups: **in scope** (M2 core, M3 component, M6 use). Pop-out: **deferred** (section 6; M8 only if the human asks).

Paths are relative to `shell/src/` unless they start with `arcs/`. "Verified" means read in the code in this milestone; anything not verified is marked **(unverified)** and collected in section 11.

## 0. What the code does today (the facts this design rests on)

| Fact | Where (verified) |
| --- | --- |
| The page is `AppShell`; the centre is a grid `compositionWorkspace`: `inspectorColumn` (when open), `SplitStage`, `settingsColumn` (when open). The inspector and the settings panel are docked regions, outside any layout. | `pages/CompositionWorkbench.page.tsx` lines 654-947 |
| `SplitStage` is a vertical split: top pane, a divider (grip plus collapse button), bottom pane. Split share clamped 0.2 to 0.8, arrow keys 0.05. Collapsing hides the bottom with the `hidden` attribute (never unmounts: "the module editors inside must stay mounted because they publish their outputs"). | `components/SplitStage.tsx` |
| The top pane holds the desk and the canvas in one grid cell. Both stay mounted; the inactive one gets `inactiveViewStyle = { opacity: 0, pointerEvents: 'none', visibility: 'hidden' }` plus the `inert` attribute, never `display: none`. The page's own comment says `visibility` alone is not enough: the canvas's elements set `visibility: visible`, which wins over a hidden parent, so they showed through the desk. The canvas measures its box (collapsing it made it refit to a tiny view). The status bar toggles `workspaceView` (`canvas` or `desk`). | page lines 250-255 and 680-740 |
| The canvas takeover is a context plus a slot `div` placed last in the top pane (`position: relative` area); `ChordPickerHost` portals its frame into it when `chordHost === 'takeover'` and a slot exists. `available` is false while the bottom is collapsed, so the picker falls back to the dock. | `components/canvasTakeover.tsx`, `chordInput/ChordPickerHost.tsx`, `SplitStage.tsx` line 63 |
| The bottom pane renders `ClipEditorSlot` (the open clip's editor, or a blank floor) plus one `moduleHost` div per placed workbench module instance, each with the `hidden` attribute unless it is the open one. All instances stay mounted (they publish outputs through `onOutputsChange`). The open target is exclusive: a clip open means `shownInstanceId` is null. | page lines 742-940 |
| `ClipEditorSlot` ends the clip's hand-edit session (`endEditSession`) when the target moves off the clip and calls `onMissing` when the clip is gone. | `components/ClipEditorSlot.tsx` |
| `NoteClipEditor` is keyed by clip id (`NoteClipEditor` returns `<NoteClipEditorBody key={snippet.id}>`), so opening another clip resets its view and chord session. | `NoteClipEditor.tsx` line 1946-1948 |
| The note clip editor's own Stage holds two panels, `roll` and `chords`, registered with every size and `minSize { narrow, short }`; their render functions are closures read from `stageNodes.current` (refreshed each render). The arrangement is `useState<Layout \| null>` (null = derived default), saved under `hrifa.stage.layout.workbench-editor.v1`. The picker is in the displayed layout only while the Chords tool is active and its host is the dock (`removeModule(fullStageLayout, CHORDS_MODULE)`); the stored arrangement keeps its place. Closing the picker from its strip calls `leaveChords` = `setTool(toolBeforeChords.current)`. Closing the roll is refused. | `NoteClipEditor.tsx` lines 1455-1556; `editorStage.ts` |
| The Stage renders each panel once at its root through `createPortal` into a persistent host element per id; slots adopt the host. Hidden columns keep their host mounted but detached (no measured size). Closing (leaving the layout) unmounts. Columns are `{slots: string[] (1 to 3), width?, shares?}`; the last visible column flexes; `parseLayout` drops unknown ids. | `components/Stage/Stage.tsx`, `src/lib/stage/layout.ts`, `persist.ts` |
| The chord session lives in `NoteClipEditorBody` as 16 state and ref values (anchor, override, voicing, mode, ctrl-open, continuous, `chordControl`, reselect flags, all-pitches, tier, hover and pinned chord, hover cell, `hoverBlocked`, `auditionRef`) plus a capture-phase window `keydown`/`keyup` listener while the picker is open and an Escape handler. The roll's `selectionState` carries a `basis` packet and `moves` (so a band survives undo); `reveal` is one-shot state. | `NoteClipEditor.tsx` lines 473-615, 1385-1453 |
| An editor-to-inspector channel already exists: `publishNoteEditor(snippetId, {selection, gridUnit, snapUnit, adopt, rotation, picking, beginPick, cancelPick})`, a module-level store on `globalThis` keyed by clip id. | `noteEditorChannel.ts` |
| The chord picker takes about 17 props (`anchor`, `onNote`, `noteOffsetCents`, `pitchSet`, `override`, `controlRef`, `continuous`, `mode`, `tier`, `allPitches`, `voicing`, `previewGate`, `onHover`, `onPin`, `onInsert`, `onClose`, and the matching `on...Change`). Its frame already carries `data-note-editor-scope` (the Escape/keys scope). Its 3x1 rendering is a CSS container query at `min-width: 720px` (45rem), not a Stage size class. | `NoteClipEditor.tsx` lines 1801-1855; `ChordPickerHost.tsx` line 39; `chordInput/ChordPicker.module.css` line 182 |
| `onChordAnchor` is a prop of `ClipEditorProps` the page does not pass (the page renders `<Editor snippet={snippet} />`). | `clipTypes.ts` line 23; `ClipEditorSlot.tsx` line 44 |
| Per-viewer keys today: `hrifa.composition-workbench.ui.canvas-split.v1`, `...detail-collapsed.v1`, `...workspace-view.v1`, `...editor-clip-target.v1`, `...active-composition-module.v1`, `...inspector-target.v1`, `...inspector-open.v1`, `...settings-open.v1`; `hrifa.note-editor.v1` (holds `chordHost`, `chordDockWidth`, grid, entry length, velocity lane); `hrifa.stage.layout.workbench-editor.v1`. | `usePersistentState.ts` lines 12-30; `noteEditorPreferences.ts`; `editorStage.ts` |
| Page providers that wrap the whole centre: `CompositionSettingsProvider`, `DeskProvider`, `AudioEngineProvider`, `PreviewRegistryProvider`, the compact theme. A Stage mounted inside them gives every panel those contexts (portals keep the React context of where `Stage` is rendered). | page lines 598-603 |

## 1. Panel model

A panel is a Stage module (`StageModule` in `components/Stage/registry.ts`) plus the extra data below. The contract stays: a panel receives its size class and nothing else (STAGE-2 and STAGE-4 for the size-only contract, `src/pages/stage/ARCHITECTURE.md` section 3, and STAGE-7: mounted once, moving keeps state).

### 1.1 Registration data

```ts
// src/lib/stage/registry.ts (data only; the render function is attached in components/Stage)
interface PanelMeta {
  id: PanelId;                 // existing ModuleId; unique, stable, persisted, never reused
  title: string;
  sizes: readonly SlotSize[];  // size classes it has a rendering for
  minSize: SlotSize;           // smallest room; Stage refuses moves below it (guarded())
  home: AreaId;                // NEW: the area it opens in when it has no remembered place
  closable?: boolean;          // NEW: default true; false hides the strip's Close
  fills?: boolean;             // NEW: this panel's column is the one that flexes (section 2.6)
  neverHidden?: boolean;       // NEW: its column is never the one a narrow window hides (the clip editor, and panels that measure their box such as the canvas: 2.6)
  transient?: boolean;         // NEW: open only while a tool wants it; never saved as open, its place goes to the memory (3.6)
  // instances: always one per id (section 1.4); no field
}
```

`home`, `closable`, `fills`, `neverHidden` and `transient` are data, so the pure core can read them (the layout core needs `home` for migration and the fallback, `closable` for the Close tool, `fills`/`neverHidden` for column rules). In code the type keeps the name `ModuleMeta` (STAGE-2 and `src/lib/stage/registry.ts`); this document calls the extended shape `PanelMeta` and `StageModule` stays the React-layer type. No rename in M2.

### 1.2 The workbench's panels (proposed ids, titles, homes)

| Panel id | Title | Home | Sizes and minimum (proposal) | Closable | Notes |
| --- | --- | --- | --- | --- | --- |
| `canvas` | Canvas | top | all; min narrow x short | no | The composition canvas (`CompositionCanvas`). Needs its box measured, so `neverHidden` (2.6) and its tab stays laid out (4.3). |
| `desk` | Desk | top | all; min narrow x short | no | `DeskView`. Same tab group as the canvas by default, replacing the `workspaceView` toggle. |
| `module-detail` | Modules | bottom | all; min narrow x short | no | The whole `moduleHost` list as one panel (section 8.3): one panel, not one per module instance. |
| `clip-editor` | Clip editor | bottom | all; min narrow x short (see below) | no | What `ClipEditorSlot` is today: it shows `clipEditorFor(snippet)` for the open clip (the note clip editor with its piano roll for note clips), "No editor for this clip yet" for a clip type without an editor, and a blank floor when no clip is open (`ClipEditorSlot.tsx` lines 38-53, verified). The piano roll is inside it; "piano roll" in this document means the note clip editor's roll only. The old editor-Stage id `roll` maps to `clip-editor` on migration (8.5). |
| `chords` | Chords | bottom | all; min narrow x short today | yes (`transient`) | Keeps the existing id `chords`. Context-free (1.3). Opens when the Chords tool is on. |

Today both editor panels declare `minSize narrow x short` (12rem by 6rem including the strip), which lets a roll shrink to 12rem. The piano clip editor panel's rendering table in `src/pages/stage/ARCHITECTURE.md` section 4b says narrow renders a read-and-select roll. Recommendation: keep `narrow x short` as the declared minimum until M5 shows whether the roll is usable that small; this is a tuning, not a decision for the checkpoint.

### 1.3 Context-free reuse (the chord picker in another host)

The chord picker panel must work where there is no piano roll (a future chord progression list constructor). Today the picker's props are closed over `NoteClipEditorBody`. Rule: a panel is a React component whose inputs are **a size class and contexts it reads**, never props the host passes at registration. Contexts a host must provide above the Stage (they pass through the Stage's portals because the Stage root sits below them):

- `ChordSession` (store plus actions, section 7.2): anchor, override, voicing, mode, tier, continuous, all-pitches, hover and pinned chord, the picker control handle.
- `ChordTarget` (an interface the host implements, section 7.2): what to do with a chord when the user inserts, auditions or pins it; the pitch set; resolving a cell to an existing note.
- The workbench-wide providers the page already has (`CompositionSettingsProvider` for the pitch set, `AudioEngineProvider` for audition).

A progression-list host supplies its own `ChordTarget` (its insert appends a chord to its list; audition plays it; `noteAt` returns null). The picker neither knows nor imports the roll, the desk or `NoteClipEditor`.

**This is not settled by the context-free picker alone.** The human's reuse example is a future chord progression list *workbench module* using the chord picker panel. That module lives in `module-detail`, not in the clip editor panel, and there is one `chords` panel (one instance per id). If that one panel reads the page-level roll session, it can only ever serve the roll. Two ways to meet the example, both consistent with a context-free picker body, are **open question 6** (section 9): (a) the page-level session routes the single picker panel to the *active chord target* (hosts claim and release the target); (b) per-session panel instances `chords:<id>`. Neither is chosen here. This is the same split the picker already has between `ChordPicker` (body, "takes no host-specific props") and `ChordPickerHost` (frame).

### 1.4 One instance per id per Stage, and what many would need

Default (confirmed pre-decision): one instance per id per Stage. This is already enforced by `locate`/`addModule` (a repeated id is a no-op) and by `parseLayout` (repeats dropped), and the mounted-once mechanism keys everything by id.

Do any workbench cases need two instances? Checked:

- Two note clip editors open at once: not a case. One clip is open at a time (exclusive target), and the session is per open clip.
- The chord picker used by two hosts (the clip editor's roll and a progression list module): the future case the human named. It is **not decided** here whether it is met by routing one `chords` panel to an active target (keeps one instance per id) or by per-session instances (`chords:<id>`, so ids are per session and the registry must create ids at runtime). See open question 6.
- Workbench modules (Arithmetic, Mixer, ...): these are many instances (`compositionInstances`, ids like `arithmetic-3`). They are not Stage panels (section 8.3), so the dynamic-id problem does not arise.

What multiple instances would need, so the consequence is clear: (1) a registry that can create a panel for an id not known at module scope (`createStageRegistry` is built once; `parseLayout` drops unknown ids at load, so dynamic ids need the registry factory to run before the layout is parsed, as the instances are persisted before the layout); (2) `PanelMeta` as a template (`kind` plus instance id); (3) the remembered-place map keyed by kind or by id (decision); (4) titles that tell instances apart. Not recommended for this arc.

### 1.5 What a host must provide to a panel

| Need | Provided by | Notes |
| --- | --- | --- |
| Size class | The Stage (`render(size)`) | Only thing passed as an argument. |
| Session / state | A provider above the Stage, read with a hook | Section 7. Panels never receive state from the Stage. |
| Commands (reveal a note, show a panel, close the picker) | A command channel from the session or a Stage API object | Section 7.3, section 4.6. |
| Selection | A selection context with a parent chain | Section 7.4. |
| Window-level key handling | The panel's own effect, scoped by `data-note-editor-scope` on its root | Today `ChordPickerHost` already marks its frame (`ChordPickerHost.tsx` line 39); the clip editor panel's root would carry it too. |
| Theme roles, compact Mantine defaults | Page provider | Unchanged. |

### 1.6 What a panel must never assume

- Which area, column, stack or tab group it is in, or whether another panel is visible (STAGE contract, `ARCHITECTURE.md` section 3). The picker must not read `parentElement` (the old dock did; the Stage-hosted picker already does not).
- That a specific other panel exists. The picker works with no roll open; the roll works with no picker.
- That it is visible: a panel in an inactive tab or hidden column stays mounted and may be measured at its last size (or at zero). It must render safely at any size class it declares and survive being reparented.
- That it can close itself: closing is the Stage's action (strip Close or command), and a panel flagged `closable: false` is never closed.
- Pixel sizes, its own storage key for position or size (the layout owns them), floating windows (section 6).
- That its scroll position survives a move (DOM scroll is lost on reparent; keep scroll in state, or see backlog item "restore scroll", section 10).

## 2. Layout model options

Common to all three options: the saved data holds only panel ids and numbers; the parser drops unknown ids and never throws; the same registry meta (`minSize`) guards edits; a version bump with migration of version 1.

### 2.1 Option (a): areas with homes (recommended)

A small named set of areas, stacked vertically in a fixed order. Each area is what a version 1 layout is today (a row of columns, each column a stack of slots), plus slots may be tab groups.

```ts
type AreaId = string;                     // declared by the Stage's config, e.g. 'top' | 'bottom'
type PanelId = string;
interface TabGroup { tabs: PanelId[]; active: PanelId }      // 2 or more tabs
type SlotEntry = PanelId | TabGroup;                         // an entry is a panel or a group
interface Column { slots: SlotEntry[]; width?: number; shares?: number[] }  // 1..MAX_STACK entries
interface Area { columns: Column[]; collapsed?: boolean }    // collapsed: mounted, not shown
interface StageLayout {
  version: 2;
  areas: Partial<Record<AreaId, Area>>;   // an absent or empty area is released (no space)
  shares?: Partial<Record<AreaId, number>>; // vertical shares among shown areas, sum 1; absent = even
}
interface StageConfig { areas: readonly { id: AreaId; label: string }[] } // top to bottom
```

A Stage declares its area set in its config (the workbench: `top`, `bottom`; the `/stage` spike: the same, so M3 can show the top and bottom arrangement). The layout lists only areas that hold panels.

**Migration from version 1** (`{ version: 1, columns }`). Generic part, in the pure core: `migrateV1(layout, intoArea)` places all columns, unchanged (widths, shares, order), in the area the caller names; nothing is redistributed by `home`. Signature change: `parseLayout(raw, known?, fallback?)` (verified `src/lib/stage/persist.ts` line 94) gains a config argument `{ areas, v1Area }` naming the Stage's areas and the area a version 1 input goes into. Its two callers change with it: `components/Stage/persistence.ts` line 45 (`loadLayout`) and `pages/stage/presets.ts` line 86. It accepts version 1 and returns version 2; `saveLayout` writes version 2. Version-1 literals that stay valid because parsing migrates them (and are converted or typed as `LayoutV1` in M2/M3): `DEFAULT_LAYOUT` (`layout.ts`), `defaultEditorLayout` (`editorStage.ts` line 54), `NO_STORED_LAYOUT` (`NoteClipEditor.tsx` line 471), the preset layouts and the empty layout (`pages/stage/presets.ts` lines 35 and 86), the spike's defaults (`pages/stage/spike/index.tsx` lines 47 and 58) and the stand-ins' default (`pages/stage/standins/index.tsx` line 52).

**The spike keeps its keys.** `hrifa.stage.layout.v1` and `hrifa.stage.presets.v1` (`presets.ts` line 11; each preset's layout is read through `parseLayout`) are read, migrated into the spike's first area (`v1Area`) and written back as version 2 under the same keys. They are never abandoned.

**The workbench-specific part lives in owned workbench code** (a successor of `editorStage.ts`), not in the core. The editor key `hrifa.stage.layout.workbench-editor.v1` always holds both `roll` and `chords` (`hasBothModules` discards a layout without both). Its mapping, with the expected result M2/M5 test:

| Stored (editor key) | Becomes |
| --- | --- |
| `{ version: 1, columns: [ {slots:['roll'], width: 40}, {slots:['chords'], width: 30} ] }` | `areas.bottom.columns = [ {slots:[ {tabs:['module-detail','clip-editor'], active:'clip-editor'} ], width: 40} ]`, plus the default `top` area; `chords` is **not** in the visible layout: `places.chords = { area:'bottom', column:1, index:0, neighbours:[], width:30 }` |
| `roll` id | renamed `clip-editor` (a migration id map; section 1.2) |
| `chords` entry | removed from the visible layout and recorded as a remembered place (`chords` is `transient`, 3.6) |
| `module-detail` | joins the `clip-editor` entry as a tab (the group above), since the editor key never held it |
| a stack such as `['roll','chords']` in one column | `chords` leaves the stack: place `{ neighbours:['clip-editor'] }`; the clip editor entry keeps its column |

**Which source wins for the `chords` place.** Three sources can seed it: the editor key (an explicit arrangement), and `chordHost` and `chordDockWidth` in `hrifa.note-editor.v1`. Order: (1) `chordHost === 'takeover'` wins, because it is the live choice that decides where the picker shows today (the dock place in the layout is then stale): place `{ area:'top' }` as its own column; (2) otherwise the editor key's place; (3) otherwise the home, with `chordDockWidth` (px) carried as the width (`migratedPickerRem`). `chordDockWidth` is spent to null as today once a layout is stored.

**Old keys.** The editor key is left in place (rollback) and is **not read again once the new page layout key exists**; this sentence applies to the editor key only.

**Core test expectation (M2).** The generic migration is tested with the editor layout's shape as a fixture (ids are opaque to the core): the version-1 columns land unchanged in the named area, nothing is dropped, a panel the registry flags `transient` (here `chords`) is moved to the place memory with its column index, neighbours and width, and an id the registry does not know is dropped. The id rename and the tab-group join above are workbench code, tested in M5/M6.

**Widths, shares, fill.** Per area, as today: column width in rem (default 36, clamp 12 to 96), stack shares per column, column splitters, hidden-column prefix rule (`shownColumnCount`). New: the flexing column is chosen by `PanelMeta.fills` (leftmost column in the area holding a `fills` panel; else the last visible, which is today's rule), so the piano roll can flex and the picker stay fixed (section 2.6). Vertically, areas share the Stage height by `shares`, with the same splitter rule as a stack (each area at least the larger of 6rem and 20%; the code in `src/lib/stage/splitters.ts` is reused as is). An area whose `columns` is empty is dropped from `shares`, so its neighbours fill the height. A collapsed area keeps its panels mounted and gives its space to the others except for its divider strip.

**Effect on the pure core (`src/lib/stage`).** `layout.ts` per-area operations (`addModule`, `removeModule`, `moveColumn`, `stackOnto`, `unstack`, `moveInStack`, widths, shares, `fitColumns`) keep working on one area's `{columns}`: the cheapest option. Changes: `Column.slots` widens to `SlotEntry[]` (so `locate`, `moduleIds`, `stackOnto`, `stackTargets`, `cleanColumns` in `persist.ts` learn tab groups; string-only slots stay valid); new files `areas.ts` (cross-area `sendTo`, area shares, collapse, migration), `tabs.ts` (group operations), `places.ts` (section 3). `stageOps.ts` (guarded, minimums, `shownColumnCount`, fill) gets an area loop; it, `registry.ts` (`createStageRegistry` currently keeps only `{id, title, sizes, minSize}` and must pass the new meta fields through) and `Stage.tsx` live in `src/components/Stage/`, not in `src/lib/stage/` (milestone note in section 10). `Stage.tsx` renders areas top to bottom with a stack-style splitter between them.

**UI controls.** Strip: Send-to menu (section 5), Close. Between areas: a splitter (reuse `Splitter`) and a collapse button (replaces `SplitStage`'s divider). Per slot with tabs: a tab strip (section 4). A hidden-panel switcher (backlog). No tree editor.

### 2.2 Option (b): rows of columns

```ts
interface Row { columns: Column[]; share?: number }
interface StageLayoutB { version: 2; rows: Row[] }   // any number of rows
```

Same idea as (a) but rows are anonymous and ordered, not named. Migration from version 1 is one row. Core effect: nearly the same as (a). Why not: a panel's **home** needs a stable address, and "row 0" stops meaning "top" when a user adds or empties a row, so home resolution and remembered places need heuristics (the nth row may not exist). Named areas make "home" and "release the space when an area empties" trivial. The one thing (b) gives that (a) does not is a user-chosen number of rows; the workbench has no case for three or more.

### 2.3 Option (c): a general tree

```ts
type Node =
  | { kind: 'split'; dir: 'row' | 'column'; children: Node[]; shares?: number[] }
  | { kind: 'leaf'; entry: SlotEntry };
interface StageLayoutC { version: 2; root: Node }
```

Migration from version 1: a row split of column splits. Fully general, matches IDE docking, and a panel can sit anywhere. Cost: every rule in `src/lib/stage` and `components/Stage/stageOps.ts` is rewritten for paths instead of (column, index): `locate`, the fit rule (a prefix of columns has no meaning in a tree: what is hidden when narrow?), `minSize` propagation (a split's minimum is the sum or max of its children, recursively), splitters at every depth, keyboard navigation of splitters, remembered places (a path breaks when the tree changes), Send-to targets (every leaf edge). The tests (`layout.test.ts` 317 lines, `persist.test.ts`, `stageOps.test.ts`) mostly do not carry over. No current need justifies it.

### 2.4 Comparison

| | (a) areas | (b) rows | (c) tree |
| --- | --- | --- | --- |
| Saved data | named areas of columns | anonymous rows of columns | recursive nodes |
| Migration from version 1 | one area | one row | one split |
| Pure core change | additive plus one type widening | additive | rewrite |
| Home / remembered place | by area id (stable) | by index (fragile) | by path (fragile) |
| Releasing space when empty | an absent area | an empty row is removed | prune and collapse |
| Narrow window (hidden columns) | per-area prefix rule, unchanged | same | undefined, needs a new rule |
| Fits the workbench centre | yes (top, bottom) | yes | yes |
| Risk | low | medium | high |

### 2.5 Recommended area set

Recommend **two areas, `top` and `bottom`**, in a fixed vertical order. They reproduce today's centre exactly (desk and canvas above, modules and the clip editor below), the divider becomes the area splitter, the collapse button becomes `bottom.collapsed`, and the canvas takeover disappears because "above" is now just where the chord picker can be sent. A third area (`main` between them, the ARC's candidate) adds nothing the workbench uses today, and the area set is config data, so adding one later changes no saved format: unknown areas are dropped on load, a new area is simply absent from old layouts. Open question 2 (section 9) asks the human.

### 2.6 Which column flexes, and which is never hidden

Today the last visible column flexes (STAGE-15) and the roll is the column that can be hidden when the picker is moved left of it and the editor is narrow (known behaviour). Rule: in each area the flexing column is the leftmost one holding a panel with `fills: true` (the clip editor panel), else the last visible column (today's behaviour, so the spike is unchanged).

The hidden-column prefix rule (`shownColumnCount`, `components/Stage/stageOps.ts`) is amended: a column holding a `neverHidden` panel is always in the visible set; the others are hidden from the far end. `neverHidden` is set for the clip editor panel (its roll must stay reachable) **and for panels that measure their own box, the canvas**: a hidden column detaches its host (`Stage.tsx` header comment; `ARCHITECTURE.md` section 10), the slot loses its measurement, and the canvas is known to refit badly when its box goes to zero. The top group (canvas, desk) can end up as a hidden column after a Send-to or in a narrow window, which is why the rule covers it. Limit: if two `neverHidden` columns in one area cannot both fit (the user sent the canvas group to `bottom` beside the clip editor, in a narrow window), the later one is hidden anyway and detached; whether the canvas refits correctly on re-attach is **unverified** (section 11). Open question 13. No stored data, so no format cost.

## 3. Remembered placement

### 3.1 What is stored

A per-viewer map, separate from the visible layout (the layout lists only open panels):

```ts
interface Place {
  area: AreaId;
  column: number;               // column index in the area when closed (a hint, not an address)
  index: number;                // slot index in the column's stack (hint)
  neighbours: PanelId[];        // other panels in its column or group when it closed (the anchor)
  asTab?: true;                 // it was a tab in a group with `neighbours`
  width?: number;               // its column's width (rem) when it had a column of its own
  share?: number;               // its stack share when stacked
}
interface PlaceMemory { version: 1; places: Record<PanelId, Place> }
```

Stored per Stage under `hrifa.stage.places.<stage>.v1` (the `hrifa.stage.` prefix is required by `stageStorageKey`; the workbench: `hrifa.stage.places.workbench.v1`). The Stage owns neither state: the page (or a `useStageState` hook, section 8.5) holds both layout and memory and passes them in, as it does for the layout today.

### 3.2 When a place is recorded

One pure function `closePanel(layout, memory, id) -> { layout, memory }` is the only way a panel leaves the layout, so every path records: the strip's Close, a tool turning its panel off (the Chords tool), a command. It records at the moment of leaving, from the layout as it then is. It also records on a move? Recommendation: **at close only**. A panel that is open is its own memory (the layout). Recording on every move would write to storage on every drag and add nothing: reopening an open panel just brings it forward.

### 3.3 Resolution on reopen

`openPanel(layout, memory, meta, id) -> layout` (pure; also un-collapses its area and brings its column to the front if hidden). Order of tries:

1. **Rejoin by neighbour.** If any `neighbours` id is open, join that panel's column (as a stack member below it, or as a tab in its group if `asTab`), subject to `MAX_STACK` and the minimum sizes (`guarded`).
2. **Re-create the column.** If the remembered area exists in the Stage config, insert a column at `min(column, count)` with the remembered `width` (clamped to the panel minimum and to the room) and `share`.
3. **Fall back to home.** A new column at the end of the home area at the panel's minimum width (or its default).
4. If even that does not fit (a narrow window), still open it: it becomes a hidden column reachable by the hidden-panel switcher. Opening never refuses, because a tool the user just turned on must not do nothing. The one exception: opening never hides a `neverHidden` panel's column (2.6): the new column is the one that stays hidden.

A remembered area that is not in the config, an unknown panel id in the memory, or a malformed entry is dropped on load (same parser rule as the layout).

### 3.4 Releasing space, reset

- When a panel's removal empties a column, the column goes (existing `removeModule` rule). When it empties an area, the area leaves `areas` and `shares` renormalise: the other areas fill the height. When the last open panel of the whole Stage would go, a non-closable panel prevents that (all workbench panels but `chords` are non-closable).
- **Reset layout** clears the layout to the default and clears the memory, so the next open goes home. There is no per-panel reset in M2 to M6 (YAGNI); the Send-to menu moves a panel anywhere, which is the per-panel reset.

### 3.5 How a tool reopens its panel, and how this differs from `toolBeforeChords`

Today (verified): the Chords tool and the picker are one state in `NoteClipEditorBody`. `tool === 'chords'` makes `chordsActive`; the picker is in the displayed layout only then (`pickerInStage`); the arrangement `useState<Layout | null>` always contains the picker's place and is never edited while the picker is hidden (`updateStageLayout` returns early). `toolBeforeChords` is a ref holding the tool to return to; the strip's Close handler does `setTool(toolBeforeChords.current)` (`leaveChords`). So the "remembered place" is implicit, exists for this one panel, is not a map, and is lost if the viewer's saved layout lacks the picker (`hasBothModules` check discards it).

Proposed: the tool state remains the source of truth (`tool === 'chords'`) and the panel's openness follows it, but through the Stage API and the place map:

```
tool -> 'chords'          : stage.open('chords')     // resolves place or home
tool leaves 'chords'      : stage.close('chords')    // records the place
strip Close on 'chords'   : Stage calls the host's onPanelClosed('chords')
                            -> the Chords tool handler runs setTool(toolBeforeChords) (unchanged behaviour)
```

`toolBeforeChords` stays as tool state (in the session, section 7); it is not a layout concern. The difference: the picker no longer has to live in the stored arrangement while hidden; its place lives in the memory, so it also works when the viewer's layout never contained it, and the same mechanism serves any panel. The two directions must not race: `stage.close` called from a tool change must not fire `onPanelClosed` back into the tool (the callback fires only for closes the Stage initiates from the strip or a Stage command, not for `close` calls the host made).

### 3.6 Is `chords` openness persisted? (tool state versus layout)

Today `pickerInStage` is re-derived from `tool` on every render (`chordsActive && !pickerInTakeover`), and `tool` is per-clip session state: a `useState` in `NoteClipEditorBody` (`NoteClipEditor.tsx` line 481: `pointer`, or `pencil` on an empty clip), reset whenever the clip changes because the body is keyed by clip id. Proposed rule: `chords` is `transient` (1.1): **it is never saved as open**, and it is open if and only if the Chords tool is active in the current clip session.

| Event | Result |
| --- | --- |
| Reload | The session starts fresh, the tool is not Chords, the panel is closed; the saved layout lists no `chords` (the saver strips a `transient` panel and records its place instead). Its place is in the memory. |
| Tool turned to Chords | `stage.open('chords')` resolves the place, else home (3.3). |
| Tool changed away | `stage.close('chords')` records the place. |
| Clip switch | A new session, tool reset, panel closed (its place recorded); as today, where the picker disappears with the editor. |
| No clip open | No session, no tool, the panel is closed. |
| A stored layout that contains `chords` open (an old save) | On load the host closes it at once, which records its place; the visible layout never shows it before the tool asks. |

This is the one place where tool state and layout meet; the Stage never reopens `chords` on its own.

## 4. Tab groups

### 4.1 Model

A tab group is a slot entry `{ tabs: PanelId[]; active: PanelId }` (type in 2.1). It occupies one entry of a column's stack. Rules (pure core, `tabs.ts`):

- Two or more tabs. A group of one collapses to a plain panel entry; a group whose last tab is closed disappears and releases its slot and the column if empty (pre-decision). With three tabs, closing one leaves a group of two.
- `active` is one of `tabs`; closing the active tab makes the next tab (or the previous at the end) active.
- The group's minimum size is the largest minimum among its tabs (like a column's `columnMinWidth`); the slot size class is measured once per group body and handed to the active tab, and to the others when they become active.
- Persistence: the whole group, including `active`, is in the layout, so the active tab survives reload.

### 4.2 Joining and leaving

By the Send-to menu (section 5): "Tab with `<panel>`" (join the group of that panel, or create a group of the two), "Leave tab group" (becomes its own column right of the group's column, as `unstack` does). A panel can be a member of a group only once and only one group at a time (one slot). Tabs can be reordered with the tab strip's keyboard (Alt+Left/Right) or a "Move tab left/right" item; drag reorder is later with drag-to-drop-zones.

### 4.3 Mounted once, inactive tabs

All tabs are mounted (the Stage already renders every panel once at its root). The group's slot body adopts the hosts of **all** its tabs, stacked in one grid cell, as the page does today for desk and canvas. The active host is shown. The others get **`opacity: 0`, `pointer-events: none`, `visibility: hidden` and the `inert` attribute**, the page's `inactiveViewStyle` plus `inert` (`CompositionWorkbench.page.tsx` lines 250-255 and 687-723), never `visibility` alone (the canvas's own elements set `visibility: visible` and showed through; the page's comment says so), and never `display: none` or detached. This is required because the canvas measures its box and refit to a tiny view when it was collapsed to zero. One group body means one measured size for all tabs, with no stale size. Detaching (what hidden columns do) is not used for tabs, but a **hidden column** still detaches all its hosts, tabs included: that is why a column holding a measuring tab is `neverHidden` (2.6). Cost: inactive tabs still take layout and paint cost (invisible but laid out); for the workbench the inactive tabs are the desk or canvas (already like this), the module list, and the clip editor. Risk noted in section 11.

### 4.4 Keyboard

Tab strip is `role="tablist"` with `role="tab"` buttons and `aria-controls` the body; one tab stop for the list (roving tabindex): Left and Right move between tabs and activate (automatic activation: switching is cheap because every tab is mounted), Home and End jump to the ends, Delete closes a closable tab, and Enter or Space on the Send-to button of the strip opens the menu. The panel body is `role="tabpanel"` labelled by its tab. Following the WAI-ARIA tabs pattern from memory (not looked up in this milestone). The existing slot tools stay buttons with accessible names (`TOOL_LABEL`, `Slot.tsx`).

### 4.5 Strip with tabs

One header strip per group: the tabs on the left (each with its title), the active tab's tools on the right (Send-to and Close apply to the **active tab's panel**; there is no "close group", closing is per panel).

### 4.6 Calling a panel to the front (the command)

A Stage-level API object, not a panel command:

```ts
interface StageApi {
  open(id: PanelId): void;     // not open: resolve place (3.3); open and visible: same as show
  show(id: PanelId): void;     // activate its tab, bring a hidden column forward, un-collapse its area
  close(id: PanelId): void;    // records the place (3.2)
  isOpen(id: PanelId): boolean;
  sendTo(id: PanelId, target: Target): void; // section 5
}
```

`show` does not move focus unless called with `{ focus: true }` (a tool opening its picker may want it; a selection change must not steal focus from the roll). It never changes the layout otherwise (never moves a panel), and it is only called for an explicit user action (selecting a module or opening a clip), never as a fallback. This keeps the no-auto-promote rule: deleting the open item blanks the panel, nothing is promoted. Naming is open question 16.

### 4.7 Stacks and groups together

A column's `slots` entries are panels or groups, up to `MAX_STACK` (3) entries. A stack may contain a tab group (pre-decision): its share is one share of the column; its splitter works as for any entry. A group cannot contain a stack or another group. "Stack onto" targets entries (a panel or a group); stacking a panel onto a group entry adds it as a stacked entry, while "Tab with" adds it as a tab: two different menu items, never ambiguous.

## 5. Send-to menu

Replaces the strip's separate stack, unstack and column-move buttons with one menu **Send to** (the existing left/right/up/down buttons stay in M3 so no behaviour or accessible name disappears; folding them into the menu is a later tidy, since the strip is narrow at 12rem). The menu is the Mantine `Menu` the strip already uses for "Stack onto" (`Slot.tsx`); it opens with Enter or Space, items by arrow keys, Escape closes (Mantine behaviour, unverified in this milestone).

| Entry | Effect on the layout | Disabled when |
| --- | --- | --- |
| Send to top / Send to bottom (one per area in the config other than the current one) | Remove from the current place and add a new column at the end of that area, at the panel's minimum width (always a new column: the user chose the area, not a remembered spot) | `guarded` refuses (area too narrow for the panel's minimum) |
| Move left / Move right | Swap its column with the neighbour in the area (`moveColumn`) | at the edge |
| Move up / Move down (in a stack) | `moveInStack` | single entry or at the end |
| Stack onto `<panel or group>` | `stackOnto` | target column full (3) or `guarded` refuses |
| Unstack (own column) | `unstackWithMin` | not stacked |
| New column (right of this one) | takes the panel out of a stack or group into its own column right of the current one | already alone in its column |
| Tab with `<panel>` | `tabs.join` | a group is the target and the panel is already in it |
| Leave tab group | `tabs.leave` | not in a group |
| Close | `closePanel` (records the place) | `closable: false` |

Keyboard: the strip's Send-to button is a tab stop; the menu follows the strip's existing tool pattern, and after a move focus returns to the same tool in the new slot (the Stage's `pendingFocus` mechanism, `Stage.tsx`; it finds the tool by accessible name, so the Send-to button's name must be stable: `Send <title> to`).

**Drag later, same data.** Dragging a strip to drop zones produces the same `Target`:

```ts
type Target =
  | { kind: 'area'; area: AreaId }                      // new column at the end of the area
  | { kind: 'column'; area: AreaId; index: number }     // new column before this index
  | { kind: 'stack'; onto: PanelId }                    // bottom of that column's stack
  | { kind: 'tab'; with: PanelId };                     // into that panel's group
```

`sendTo(layout, id, target)` is the one pure operation; the menu and a later drag UI both call it, so adding drag changes no saved data and no core code.

## 6. Pop-out (stretch, M8)

**What it would need.** A new slot kind: `floating: { panel: PanelId; x: number; y: number; w: number; h: number }[]` in the layout (fractions of the Stage or rem), z-order (list order), clamping on load and on window resize so a stored window comes back inside the screen and never covers the app header, pointer drag and resize with pointer capture, keyboard move and resize (Alt+arrows) for access, a re-dock action that returns the panel to its remembered place (3.3, the same function), role and labelling (`role="dialog"` is wrong for a non-modal tool window: `role="group"` with `aria-label`), what to do when the page is narrow (below some width a pop-out docks again or is full-width), persistence, a z-index plan against Mantine portals (menus and tooltips must stay above). The Stage already keeps a panel mounted while it changes host element, so reparenting a panel into a floating body is the mounted-once mechanism unchanged.

**What it relaxes.** The earlier rule (`src/pages/stage/ARCHITECTURE.md` section 3, "What a module may NOT do": open its own floating window or free-positioned panel; the only floating element a module may use is a transient popover anchored to its own control), and the chord-input arc's rule. The rule is STAGE-3 ("no free-form windows") and is written about what a **module** may do. A Stage-owned floating slot does not let a panel float itself; it is a new kind of slot owned by the Stage. A `DECISIONS.md` row is still required (ARC non-goal), and the earlier wording would be updated to "a panel never floats itself; the Stage may host a floating slot".

**A browser window (`window.open`) instead of an in-app window.** Not recommended: React can portal into another window's document, but Mantine's CSS variables and the CSS modules would have to be copied into it, focus and keyboard scope (`data-note-editor-scope`, window-level key handlers in the chord session, which attach to `window` of the page, not the pop-up) break, and audio contexts and timers throttle in a background window **(unverified: from general knowledge, not tested here)**.

**Recommendation: defer.** Do not build it in M2 to M6, but keep the layout format able to take it: `floating` is an optional additive key a later parser version reads; version 2 readers that do not know the key drop it (the parser already ignores unknown keys), so adding it later costs a bump only if old readers must keep the floats (they need not). Risks if built: focus and key scope for floating panels, overlap with Mantine popovers, the narrow-page fallback, and the new "where is my panel" problem (a floating window off-screen after a monitor change). If the human asks for it after M6 it is a milestone of its own (M8 in the ARC).

## 7. State boundary: what must leave `NoteClipEditor`

### 7.1 What is inside today (verified list)

| State | Today | Who needs it |
| --- | --- | --- |
| Open clip, packet, commit | `useDesk()` in the body; `commitSnippetEditById`, `latestSnippetById` | roll, chords target (insert), inspector |
| `tool`, `toolBeforeChords`, `pick`, `rampState`, `rotationState` | `useState`/`useRef` | roll (about 40 `PianoRoll` props), inspector channel |
| `view` (scroll and zoom) | `useState(openingView(packet))` | roll; survives moves only because the owner holds it |
| selection (`selectionState`: ids, range, kind, `basis`, `moves`), `selectionRef` (assigned during render, flagged in BACKLOG "Code hygiene") | state plus ref | roll, inspector channel, keyboard actions |
| `reveal` (one-shot token) | `useState` | roll |
| chord session (16 values, section 0) | state and refs | roll (ghosts, anchor, hover), picker, W-20 keys, audition |
| `preferences` (grid, entry length, `chordHost`, lane collapsed) | `useNoteEditorPreferences()` | roll, picker host |
| the header (title, note count badge, notice, Tool menu, Grid menu) | rendered by the editor | not part of either panel today |
| `announcement` (live region) | state | roll keyboard |

About 1,950 lines; the roll's JSX alone spans lines 1559-1800.

### 7.2 Proposed boundary

Three pieces, none a Stage concern:

1. **`NoteEditorSession`**, created by a provider `NoteEditorSessionProvider` mounted **above the Stage** (page level). The provider must **not** carry a React `key` on the clip id: a key above the Stage would remount everything below it, the canvas, the desk and every workbench module editor, which must stay mounted to publish their outputs (`SplitStage.tsx` lines 24-25; the module list in the page). Instead the **store** resets per clip internally: it holds the open clip id and a per-clip state object keyed by that id; when the clip changes it disposes the old state (the `endEditSession` cleanup that `ClipEditorSlot` runs today, listeners, `publishNoteEditor` withdrawal) and creates a fresh one (tool, view, selection, chord session), so behaviour equals `key={snippet.id}` today. Only the **clip editor panel's content** is keyed by clip id, as `NoteClipEditor` already is (`NoteClipEditor.tsx` lines 1946-1948), so the roll's DOM and local state remount per clip; the panel itself, its place and every other panel do not. It holds everything in the table above except the chord session, plus the chord session as a sub-store. Accessed through hooks that return slices, so a panel subscribes to only what it needs: `useRollSession()` (view, selection, tool, pick, ramp, rotation, reveal, preferences, commit functions, `publishNoteEditor` publishing) and `useChordSession()`.
2. **`ChordSession`** (a store, `useSyncExternalStore` or a reducer in the provider): anchor, override, voicing, mode, ctrl-open, continuous, all-pitches, tier, hover chord, pinned chord, hover cell, plus actions (`setAnchor`, `pin`, `hover`, `clear`, `setMode`...), the picker control handle (`controlRef`), the reselect flags, and the W-20 key handler registration. The window listeners the editor installs today move to the provider, per session: the pointer-held tracker (`pointerdown`, `pointerup`, `pointercancel`, `pointermove`, `lostpointercapture`, `blur`; `NoteClipEditor.tsx` lines 573-600) and `pointerInside` (set by `onPointerEnter`/`onPointerLeave` on the editor root, lines 1864-1870; with separate panels there is no single root, so it becomes "the pointer is inside any element with `data-note-editor-scope`", reset on window `blur`). The ramp Escape listener (lines 636-640) and the pick-pitch Escape/Enter listener (lines 682-686) stay with the roll (`useRollSession`), because ramp and pick are roll-level state. The W-20 `keydown`/`keyup` listeners, Escape and `ChordAudition` move with the chord session (the provider installs them while `anchor !== null && tool === 'chords'`; they are scoped by `data-note-editor-scope`, so the clip editor panel root and the chord picker frame must both carry it).
3. **`ChordTarget`**, an interface a host implements and passes to its session provider:

```ts
interface ChordTarget {
  pitchSet: ProjectPitchSet;                         // today settings.pitchSet
  noteAt(cell): { duration; velocity?; pitchMidicents } | null;  // today noteAtCell(notes, anchor)
  insert(chord, anchor, voicing, options): void;     // today insertChord (commits notes through the desk)
  audition(notes: PlacedNote[], velocity?: number): void;       // today ChordAudition / auditionRef
  onAnchor?(anchor: { pitchMidicents: number; onset: number }): void; // today onChordAnchor
}
```

The roll host implements `ChordTarget` with the desk commit and the roll's note list. A second consumer (a chord progression list) implements it with its own list: this is what makes the picker panel context-free (1.3). The picker body takes `ChordSession` actions and `ChordTarget` only.

### 7.3 Command channel

Two layers, because the two kinds of command differ:

- **Layout commands** (`open`, `show`, `close`, `sendTo`) are the `StageApi` object (4.6), obtained with `useStageApi()`; a tool or the page calls them. They are synchronous and affect only layout state.
- **Panel commands** (reveal a note or clip, clear the anchor, focus the roll) are typed messages on the session: `session.dispatch({ type: 'reveal', ... })` with `useCommand(session, 'reveal', handler)` in the receiving panel. Message shape keeps today's one-shot token (`reveal` carries a nonce so a repeat counts; `PianoRollProps['reveal']` stays as the roll's prop, the clip editor panel turns the command into it). It replaces the spike's `{ clipId, nonce }` in shared state (BACKLOG) without a global string-keyed registry.

Do not merge them: layout commands need no session and must work before any clip is open.

### 7.4 Selection model with a parent chain

Today the selection is three separate shapes in three places: the page's inspector target (`CompositionInspectorTarget`: canvas, module, route) and `editorClipTarget` (persisted page state), and the editor's note selection (transient). Proposed: a read-only **selection chain** exposed from a `WorkbenchSelection` context at the page: `[note-or-time selection, clip, module-or-canvas]` derived from those stored shapes (`parent(sel)` walks note to clip to project), so the inspector, canvas and roll read one thing. The stored shapes and their semantics do not change in M4 (the note selection keeps its `basis` and `moves` so a band survives an undo; the clip session owns it because it depends on the packet). Unifying the stored shapes is a larger step and is deferred; the chain makes consumers independent of where each part is stored. Open question 17 offers the minimal and the full version.

### 7.5 What the clip editor panel needs from a host

`useRollSession()` (above), the desk (`useDesk`), `CompositionSettings` (pitch set, meter, EDO), `AudioEngineProvider` (note audition), the per-viewer note preferences, and the `StageApi` (the Tool menu's Chords entry calls `stage.open('chords')`). The editor header (title, badge, notice, Tool menu, Grid menu) is not part of the roll today; recommended: it becomes the clip editor panel's top bar inside the clip editor panel (the clip editor panel is the editor), so the clip name and tool menu travel with it. If the clip editor panel is moved, its header moves with it.

### 7.6 Behaviour that must not change (explicit requirements)

| Behaviour | Where it lives after M4 | Constraint |
| --- | --- | --- |
| Hover ghosts (a one-step ghost under the pointer while Chords is active; hidden after a keyed anchor move until the pointer reports another cell) | `ChordSession` (`hoverCell`, `hoverBlocked`); clip editor panel feeds `onAnchorHover` | `onAnchorHover` fires only with the Chords tool active; unchanged snapping to the EDO grid |
| Click to audition | `ChordTarget.audition` through `ChordAudition` | gate by the developer option `chordPreviewGate` as now; silent hover |
| Insert (double-click or Enter) | `ChordTarget.insert`, one undo step | goes through the desk commit, so history and undo are unchanged; the session is never in history |
| W-20 keyboard workflow | the session's capture-phase `keydown` listener, installed while the picker is open | capture phase so the picker's keys precede the roll's arrow handling; scope: editor, picker (also in any host), page body; Alt-arrow keyup guard (`altArrowHandled`) moves with it |
| Esc | session Escape handler | only when not typing, in `[data-note-editor-scope]` or body, and no open `dialog`, `alertdialog` or `menu` |
| Undo and history | desk | unchanged: nothing in the session is recorded |
| Anchor click on an existing note | `ChordTarget.noteAt` (W-22) | stacking uses that note's length and velocity |
| Shift+arrow reselect and silent auto-repeat | session flags (`chordReselect`, `chordReselectSounds`) | unchanged |
| Reveal scrolling the note into view | `reveal` command to the roll | once per press |
| Inspector actions read the live selection | `publishNoteEditor` published by the session | unchanged channel and semantics |

Existing tests (`NoteClipEditor.test.tsx`, `.chords`, `.chordKeys`, `.reveal`, `.stack`, `.stage`) are the guard; M4's acceptance already forbids weakening assertions.

## 8. Mapping today's workbench centre onto the model

### 8.1 Default layout (equals today's look)

```
Page (AppShell.Main) -> compositionWorkspace grid
├─ inspectorColumn           REGION (stays; not a panel; CompositionInspector)
├─ Stage (the centre)        area set: top, bottom
│  ├─ top    [ tab group (canvas, desk) ]            active = workspaceView
│  └─ bottom [ tab group (module-detail, roll) ] [ chords (only while Chords tool) ]
└─ settingsColumn            REGION (stays; docked settings panel)
```

The Stage fills the grid cell `SplitStage` fills now and measures its own box (`widthRem` absent, W-24).

### 8.2 Pieces

| Today | Becomes | Notes |
| --- | --- | --- |
| `SplitStage` divider and share (0.2 to 0.8) | the area splitter and `shares` | Same clamp rule (stack-share rule: larger of 6rem and 20%; for a typical height this is close to 0.2 to 0.8). |
| collapse button | `bottom.collapsed` plus the divider's button | Collapsed areas stay rendered with `hidden`, not detached (4.3, 8.4). |
| desk + canvas in one cell | tab group `top` (`canvas`, `desk`) | The inactive tab stays laid out, `opacity: 0`, `pointer-events: none`, `visibility: hidden` and `inert` (4.3). The status bar view toggle calls `stage.show('desk' \| 'canvas')`. |
| `ClipEditorSlot` | the `clip-editor` panel, its content chosen by the open clip; a missing clip blanks the clip editor panel | The `endEditSession` cleanup and `onMissing` move to the session provider (7.2). |
| the module list (`moduleHost` per instance) | one panel `module-detail` | See 8.3. |
| clip editor area (roll and picker in the editor's own Stage, W-25) | `clip-editor` and `chords` panels in the page Stage | The editor's Stage and `editorStage.ts` are removed in M5/M6. |
| canvas takeover | the `chords` panel sent to `top` | `canvasTakeover.tsx` and the `ChordPickerHost` takeover branch are removed; the "Dock beside roll" / "Expand over canvas" button becomes the Send-to menu. |
| left inspector, settings panel | stay regions | BACKLOG `[stage]` "the inspector is outside the Stage's width model" stays open; the Stage measures its own container beside them (W-24). |

### 8.3 Why the workbench modules are one panel

The placed instances are persisted data (`compositionInstances`) with generated ids and must stay mounted all the time because they publish outputs to other modules (verified in `SplitStage.tsx` and the page: `hidden` attribute, never unmount). As Stage panels they would need dynamic ids (1.4) and would unmount when closed, which breaks the routing. Recommendation: the `module-detail` panel's content is exactly today's `detailBody` (the list of `moduleHost` divs, `ModuleActiveContext`, `ModuleInspectorSlotContext`), which keeps module state, routing and the inspector's setup-controls portal (`ModuleInspectorContent`) untouched. The module panel is non-closable.

### 8.4 Roll and modules share a tab group: what that means, and the alternative

Today the bottom pane shows exactly one of: the open module, the open clip's editor, or a blank floor. Default: one tab group `module-detail` + `clip-editor`. `selectCompositionModule` calls `show('module-detail')`; `openClipEditor` calls `show('clip-editor')`; both un-collapse the bottom (today's `setDetailCollapsed(false)`). The clip editor panel is always open and non-closable; with no clip open it shows the blank floor, and `module-detail` shows blank while a clip is open, as today (the open target is exclusive and nothing is promoted).

Consequences the human should know:

- **The tabs duplicate the exclusive open target.** The page already decides what the bottom shows from `editorClipTarget` versus the active module (`moduleShown`, `shownInstanceId`; page lines 326-333). A tab strip is a second control for the same fact. Rule needed: does clicking a tab change the target? Recommended: a tab click calls `show` only (which tab is in front) and does **not** change `editorClipTarget` or the active module; the target changes only through the canvas, desk and inspector as today.
- **Clicking "Modules" while a clip is open shows a blank module panel** (no module is shown while `editorClipTarget` is set), and clicking "Clip editor" while a module is open shows the blank floor. Both are today's blank-placeholder behaviour, now reachable by a click.
- **If the two are split across areas instead** (the user sends one to `top`), both are visible and opening a clip blanks the visible module panel (opening a module blanks the visible clip editor panel): layout does not change the exclusive target, so a split layout always shows one blank panel.
- A tab strip appears where today there is no strip (new chrome on every panel, not only these; question 18 is the look), and both tabs are always there.
- **Alternative:** the clip editor is closed while no clip is open and opens (in its remembered place) when a clip opens. That is more faithful to "editor only when a clip is open" but needs a Stage flag to keep a closed panel mounted (`module-detail` must never unmount when it is the one closed) or a different split of mounting from showing; not recommended for M6.

Collapsed area and mounting: the collapsed bottom must keep modules mounted. Today `hidden` keeps the host in the DOM. The Stage's hidden columns detach hosts (no measured size). Recommendation: a collapsed area renders its slots with `hidden` (hosts stay attached, sizes keep their last value); only columns not fitting the width are detached. **(unverified: whether any workbench module editor measures its own box at mount and would misbehave when attached to a hidden parent; today's `hidden` attribute on the bottom pane already has the same effect, so no new case is expected.)**

### 8.5 Existing per-viewer preferences and keys, and how each migrates

| Key / preference | Today | After | Migration |
| --- | --- | --- | --- |
| `hrifa.stage.layout.workbench-editor.v1` | the editor Stage's layout (`roll` and `chords` columns, widths) | superseded by the page layout `hrifa.stage.layout.workbench.v2` | If the new key is absent: the workbench migration in 2.1 (columns into `bottom`, `roll` renamed `clip-editor`, `module-detail` joined as a tab, `chords` becomes a remembered place), then the default `top` area. Widths carry. The editor key is left in place and not read again once the new key exists. |
| `hrifa.stage.layout.v1` and `hrifa.stage.presets.v1` (the `/stage` spike) | spike layout and presets | unchanged keys, parsed as version 1 or 2 | `parseLayout` with the spike's `v1Area` (2.1); written back as version 2 under the same keys; never abandoned |
| `hrifa.composition-workbench.ui.canvas-split.v1` | split share, default 0.6 | `layout.shares` (top share) | seed `shares` once if the new layout is absent; clamp 0.2 to 0.8 |
| `...detail-collapsed.v1` | bottom collapsed | `areas.bottom.collapsed` | seed once |
| `...workspace-view.v1` | `canvas` or `desk` | active tab of the `top` group | seed once; the status bar view toggle reads and calls `show` |
| `hrifa.note-editor.v1` `chordHost` (`dock` or `takeover`) | where the picker shows | seeds the `chords` remembered place | `takeover` becomes place `{ area: 'top' }` (own column) and wins over the editor key's place (2.1); `dock` leaves the editor key's place, else the home. Kept readable; no longer written. |
| `hrifa.note-editor.v1` `chordDockWidth` (px) | dock width, spent into the Stage layout and set to null (W-25) | the place's `width` | `migratedPickerRem` carries over as today when the layout is first created; the existing spend-to-null behaviour stays until the field is retired (backlog, after the migration window) |
| `...editor-clip-target.v1`, `active-composition-module.v1`, `inspector-target.v1`, `inspector-open.v1`, `settings-open.v1` | page selection and region state | unchanged | none (selection state, not layout) |
| new `hrifa.stage.places.workbench.v1` | n/a | remembered places | created on first close |

All new keys start with `hrifa.stage.` (`stageStorageKey` throws otherwise, `src/lib/stage/persist.ts`). A `useStageState` hook in `components/Stage` (proposed for M3) owns load, migration, debounced save and reset so the page does not repeat that code (it also answers the backlog item on throttling layout saves).

## 9. Open questions for the human (each with a recommendation and a consequence)

None of the recommendations below is decided; the checkpoint decides. Several were folded into the text above as recommendations and are listed here as questions so they are not decided by omission.

| # | Question | Recommendation | Consequence of the other choice |
| --- | --- | --- | --- |
| 1 | **Layout model:** (a) named areas, (b) anonymous rows, (c) a general tree (section 2). | (a). | (b) makes "home" and remembered places depend on a row index that stops meaning "top" when rows change. (c) rewrites the pure core, the fit rule and most existing tests for a generality the workbench does not use. |
| 2 | **Area set.** `top` and `bottom`, or add `main` between them? | `top` and `bottom` (2.5). | A `main` area now costs a splitter and a third area in every test for something unused; adding it later is config data (no format change). |
| 3 | **Send-to versus drag.** Menu first, drag later? | Menu first; both call `sendTo(layout, id, Target)` (section 5), so drag is additive. | Drag first is more build (hit testing, drop zones, touch, a keyboard alternative still needed) and delays M3. |
| 4 | **How "show this panel" is called.** (a) a Stage API object (`useStageApi().show(id)`) separate from panel commands, or (b) one command of a single general channel that panels and the Stage both subscribe to. Naming is question 16. | (a): layout commands need no session and must work before any clip is open (7.3). | (b) is one mechanism to learn, but layout commands would depend on the session or a global registry, and a channel keyed by strings invites collisions; it would also make the Stage depend on the channel. |
| 5 | **State boundary** (section 7): a page-level `NoteEditorSessionProvider` with per-clip internal reset (no React key), the `ChordSession` store, the `ChordTarget` interface, and the editor header (title, badge, notice, Tool and Grid menus) becoming the clip editor panel's top bar. The header move is also a look change. | Adopt as written in 7.2 and 7.5. | Keeping the header outside the panels leaves the Tool menu with nowhere to live when the panel moves. Keeping the session inside `NoteClipEditor` leaves the picker unable to work without it (the arc's goal fails). A page-level key instead of an internal reset remounts the canvas, desk and every module editor (7.2). |
| 6 | **Chord picker reused by a second host** (the human's example: a chord progression list workbench module). (a) the page-level session routes the single `chords` panel to the *active chord target* (a host claims the target when it becomes the open item and releases it when it stops; the last claim wins; nothing is promoted when a target goes away; the panel shows a short empty state with no target); (b) per-session instances `chords:<id>`, one panel per host. | (a) for this arc. It keeps one instance per id and one remembered place for the picker, and the second consumer in M4's test is exactly a host that claims the target. Revisit (b) only if two hosts must show a picker at once. | (b) allows two pickers at once but breaks "one instance per id" unless ids are per session: the registry must create ids at runtime and before `parseLayout` runs (the layout is parsed at load, instances are persisted before it), places are keyed by kind, titles must tell instances apart, and `closable`/`transient` flags apply per instance. Under (a) as stated a host that never claims the target cannot use the panel. |
| 7 | **Workbench modules as ONE `module-detail` panel** (8.3). | One panel: the placed instances must stay mounted to publish outputs and have generated ids. | It rules out two module editors side by side and sending one module elsewhere. One panel per instance needs dynamic ids and a keep-mounted-when-closed rule, and unmounting would stop publishing and break routing. |
| 8 | **Clip editor and modules in one tab group** (8.4), or split, or the editor closed when no clip is open. | One group, the clip editor always open, a tab click calls `show` only. | One group has the duplicate-target and blank-panel consequences in 8.4. Split across areas always shows one blank panel. Closing the editor needs a keep-mounted flag. |
| 9 | **Remembered-placement rules** (section 3): record at close only; resolve by neighbour first, then area and column, then home; Send-to always makes a new column at the panel's minimum width. | As written. | Recording on every move writes storage on every drag and adds nothing for open panels. Resolving by index only breaks when columns change. Send-to resuming a remembered spot would surprise a user who just chose an area. |
| 10 | **Inactive tabs stay laid out but invisible** (`opacity: 0`, `pointer-events: none`, `visibility: hidden`, `inert`; 4.3), and a column holding a measuring panel (the canvas) is `neverHidden` (2.6). | Yes. | Detaching or `display: none` inactive tabs loses their measurement and refits the canvas (page comment). Hidden columns that detach the canvas have the same problem; without `neverHidden` the canvas group can be the hidden column after a Send-to. Cost of laid-out tabs: layout and paint (unmeasured). |
| 11 | **Vocabulary:** area, tab group, home, place (and panel, slot, stack, column from `STAGE-ADOPTION.md`). | Confirm as written (STAGE-1 and STAGE-4 already fixed region, module, slot, layout, size). | "Dock", "pane" or "row" are already used elsewhere in the workbench (the old chord dock, the top and bottom pane); reusing them would blur meanings. |
| 12 | **Chord picker rendering: the Stage size class or its own container?** | The Stage size class, reconciled in M5. | The workbench picker switches at a container query of 720px (45rem, `ChordPicker.module.css` line 182). The spike's picker maps `size.width !== 'narrow'` to 3x1 (`pages/stage/spike/ChordPicker.tsx` line 25, STAGE-13), which means 3x1 from `regular` (30rem), not only `wide` (42rem). Moving the workbench picker to the size class shifts the switch from 45rem to 30rem: a default dock of 30rem would render 3x1 where the container query renders the other layout. Keeping the container query makes the picker the one panel that ignores the size contract. |
| 13 | **Which column flexes, which is never hidden.** `fills` and `neverHidden` as in 2.6. | `fills` on the clip editor panel; `neverHidden` on the clip editor panel and the canvas. | Without them the picker flexes when widened and the roll or the canvas can be the hidden, detached column (the human prefers the roll flexing). Two `neverHidden` columns that cannot both fit still hide the later one. |
| 14 | **What "home" means when a panel has no space there.** | Open anyway; it may become a hidden column behind the switcher, but never the `neverHidden` column (3.3). | Refusing to open makes a tool switch silently do nothing in a narrow window; opening in another area breaks the meaning of home. |
| 15 | **Per-panel closable flag.** | Default true; false for `canvas`, `desk`, `module-detail`, `clip-editor`; true for `chords`. | A closable desk or canvas unmounts its UI and needs an add-panel menu, which the Stage component does not have (only the spike's Modules menu). |
| 16 | **Command names.** | Stage API: `open`, `show`, `close`, `sendTo`, `isOpen`. Panel commands on the session: `roll.reveal`, `chords.clearAnchor`, `roll.focus`; typed messages, not strings. | Bare verbs collide as soon as a second panel kind needs `reveal`; namespaced strings invite a global registry. |
| 17 | **Selection model scope.** | A read-only chain over today's three stored shapes in M4 (7.4). | Full unification changes the persisted `editorClipTarget` and the inspector target and touches canvas, desk and inspector: a separate arc. |
| 18 | **New chrome.** Every panel gets a strip, the bottom group a tab strip; the header becomes part of the clip editor panel. | Accept; revisit the look at the M6 checkpoint. | A chrome-less option hides the very strip that holds Send-to, so it needs another entry point. |
| 19 | **Takeover migration target** (see 2.1: a stored `chordHost: 'takeover'` wins). Own column in `top`, or a tab over the canvas? | Own column in `top`. | A tab reproduces "covers the area" but hides the canvas while chords are open and adds a group to the top. |
| 20 | **Pop-out.** | Defer; keep the format able to take it (section 6). Remembered placement and tab groups are in scope (scope summary above). | Building pop-out now delays the core milestones for a floating window with known focus and key-scope risks. |
| 21 | **Picker has two close controls** (the strip X leaves the tool; the picker's own Close clears the anchor). | Rename the picker's own Close to "Clear"; the strip X stays the only Close. | Keeping both "Close" keeps the confusion noted at the M9b checkpoint. |
| 22 | **Tab activation** (automatic on arrow keys versus manual Enter). | Automatic. | Manual avoids accidental switches but needs a second key for a cheap action. |
| 23 | **Instance model.** One instance per id (the pre-decision) with no dynamic ids. | Yes, subject to question 6. | If question 6 is answered (b), dynamic ids are needed after all. |
| 24 | **Milestone scope and locks.** Fill, hidden-column, `guarded` and minimum rules and `createStageRegistry` live in `src/components/Stage/` (`stageOps.ts`, `registry.ts`), not `src/lib/stage/`. ARC M2 names only `src/lib/stage/`. | Move the rule enforcement and registry pass-through to M3, and test only the pure-core rules (areas, tabs, places, migration, `transient`) in M2; or have the orchestrator add `src/components/Stage/stageOps.ts` and `registry.ts` to M2's lock. | If M2 stays `src/lib/stage/` only and still claims "minimum sizes are respected", the criterion cannot be met there (the minimum rules are in `stageOps.ts`). |

## 10. Backlog mapping

Items from `shell/BACKLOG.md` relevant to this arc, mapped to a milestone or explicitly deferred. "M2" is the pure layout core, "M3" the Stage component and spike, "M4" the session lift, "M5" the independent panels, "M6" the workbench page, "M7" close-out, "M8" pop-out.

| Item (tag, short name) | Mapped to |
| --- | --- |
| [stage] Debounce layout saves | M3 (the Stage state hook debounces the layout and places writes; drag end flushes) |
| [stage] Restore scroll position across a reparent | M3, small and opt-in: the Stage captures `scrollTop`/`scrollLeft` of the host before the move and restores them after adoption (the human called losing the roll's scroll "not ideal"); if it grows, defer to M7 |
| [stage] Where selection and project state live | M4 (selection chain, 7.4; project state stays in the desk and page) |
| [stage] The inspector is outside the Stage's width model | Deferred: the inspector stays a region (arc non-goal); the Stage measures its own container (already true since W-24) |
| [stage] Presets are implicit snapshots | Deferred: spike only; areas do not change this |
| [stage] Modules cannot influence slot heights | Deferred: areas and shares do not solve it; revisit if the roll needs "one row" sizing |
| [stage] Alt+digit is a window listener in `StageApp` | Deferred (spike only); M3 must not add any Alt+digit shortcut of its own, and the tab keys above avoid it |
| [stage] Mantine controls leak their own sizes into the kit | M3: apply the same check to the Send-to menu button and the tab buttons |
| [stage] Modules need a command channel | M3 (Stage API: open, show, close, sendTo) and M4 (panel commands on the session), per 7.3 |
| [stage] One selection model with a parent chain | M4 |
| [stage] A shared time-to-pixel mapping | Deferred: needs the canvas time axis, not needed by this arc (unified roll with clips is a separate arc) |
| [workbench] Unified roll with clips | Deferred: separate arc (the human's note: needs workbench and `PianoRoll` work, not Stage) |
| [workbench] Adopt step 1: chord dock and canvas takeover | M5 (the takeover replaced by Send-to `top`; `chordHost` and `chordDockWidth` migrate, 8.5) |
| [workbench] Adopt step 2: `SplitStage` | M6 |
| [workbench] Adopt step 3: `ClipEditorSlot` and the inspector on the kit | `ClipEditorSlot`: M6. Inspector on the kit: deferred (arc non-goal) |
| [workbench] Canvas takeover and `SplitStage` as Stage slots | M5 (takeover) and M6 (`SplitStage`) |
| [workbench] Lift the chord session out of `NoteClipEditor`, make the roll its own panel | M4 (session lift), M5 (clip editor panel) |
| [shared] Promote the Stage component and kit to `src/components/` | Already done (W-23); no action |
| [shared] Remove the `/stage` spike page | Deferred: the spike stays as the test bed (ARC non-goal); decide at M7 |
| [shared] Stage rows and a "Send to" menu | M2 (areas replace rows; `sendTo`, `Target`) and M3 (menu); drag deferred to a later arc |
| [shared] Stage: hidden-columns switcher in the component | M3 |
| [shared] Stage: choose which column fills the spare width, never hide the roll | M2 (meta fields `fills`, `neverHidden`, `transient`, `closable`, `home` in `src/lib/stage`); M3 (the rules in `shownColumnCount`, fill, `createStageRegistry` pass-through, in `src/components/Stage`; question 24) |
| [shared] Stage: per-module non-closable flag | M2 (`closable` in meta) and M3 (strip hides Close; `createStageRegistry` passes it through) |
| [shared] Stage: restore roll scroll across a move | M3 (see "restore scroll") |
| [workbench] Picker size-class rendering | M5 (open question 12) |
| [workbench] Remove the legacy `chordDockWidth` preference after the migration window | Deferred to M7 as a new backlog item (keep reading it through M6) |
| [workbench] Throttle layout saves while dragging | M3 (as the first row) |
| [workbench] Picker's own header close versus the strip close | M5 (open question 21) |
| [workbench] Stale code comment in `clipTypes.ts` (`onChordAnchor` pitch) | M4, if the milestone edits `clipTypes.ts` for `ChordTarget.onAnchor`; otherwise unchanged |
| [workbench] Chord picker polish (second note editor sharing the takeover slot) | Resolved by M5: the takeover slot is gone; one session per open clip makes a second editor on the same Stage impossible |
| [workbench] Code hygiene: `selectionRef` assigned during render | M4 (the session store replaces the ref) |
| [workbench] Escape / Enter scoping: `pointerInside` can stay true after alt-tab | M4: `pointerInside` is re-homed in the session provider ("pointer inside any `data-note-editor-scope` element") and reset on window `blur` (7.2) |
| [workbench] Pointer tracker: lifting one of two touch points clears the "held" flag | M4: the tracker (`NoteClipEditor.tsx` lines 573-600) moves to the provider; fix only if cheap, else keep as an open item |
| [workbench] Bring Melodicization and Mixer onto the new roll conventions | Deferred (not part of this arc) |
| [shared] Roll edge: `reveal` only correct in the detached roll | Deferred (no effect today) |
| [harmonic-field-lab] Adopt the kit only | Not this arc |

**Milestone scope note (question 24).** The layout core (areas, tabs, places, migration, parse signature) is `src/lib/stage` (M2). `stageOps.ts` (guarded, minimums, `shownColumnCount`, fill, splitter bounds), `registry.ts` and `Stage.tsx` are in `src/components/Stage` and `persistence.ts` calls `parseLayout`: they are M3 unless the human has M2 take that lock too.

New items to add to the backlog at close-out (M7): remove `chordDockWidth`; fold the strip's move buttons into Send-to; drag to drop zones; third area `main` if wanted; per-panel reset place; the keep-mounted flag for closed panels if the alternative in 8.4 is ever chosen.

## 11. Could not verify (read the code, but not tested or not read)

- `CompositionCanvas` and `DeskView` internals (measurement code, whether a canvas refits on re-attach): I rely on the page's own comment that "the canvas measures its box", which I read; I did not read `CompositionCanvas.tsx` beyond its props.
- Whether any workbench module editor misbehaves when its host is attached to a `hidden` parent after a layout change (8.4): same condition as today's `hidden` attribute, but not tested.
- Whether inactive tabs laid out with `visibility: hidden` cost noticeable paint time for the heavy panels (canvas, roll): from general knowledge, not measured; the desk and canvas already behave this way today.
- Mantine `Menu` keyboard behaviour (arrows, Escape, focus return) and the WAI-ARIA tabs pattern (roving tabindex, automatic activation): stated from memory, not looked up.
- The piano roll's `view` fields (whether vertical scroll is in `view` and survives a move): not read; the adoption doc says DOM scroll is lost on reparent.
- Whether the Stage test files assert accessible names of the existing tool buttons (`Move X left`, `Stack X onto`): I did not read `Stage.test.tsx`; keeping the buttons in M3 is a precaution.
- The text of W-25 and W-20 in `DECISIONS.md` beyond their first columns; the behaviour lists in 7.6 are taken from the code (listeners, comments), not from the decision rows.
- The tests listed in 7.6 as the guard: names taken from the directory listing, contents not read.
- `window.open` pop-out drawbacks (section 6): general knowledge, not tested.
- Whether the canvas refits correctly when its host is detached by a hidden column and re-attached (2.6): the page comment describes the refit after collapsing to zero, which is not the same event; not tested.
- Whether `opacity: 0` plus `inert` is sufficient for every panel type as an inactive tab (4.3): it is what the page does for desk and canvas today; other panels (the clip editor with its window-level key listeners) were not checked.
- That the Chords tool state is reset on a clip switch: read from the code (`tool` is `useState` in a body keyed by clip id), not run.
- The `pages/stage/presets.ts` store shape beyond lines 5-14, 30-38 and 80-90; the claim that it can be written back as version 2 under the same key assumes its own `version` field is separate from the layout's, not checked.
- Whether `Stage.test.tsx` or the spike tests construct `version: 1` layouts directly (the literals listed in 2.1 are from non-test code).
