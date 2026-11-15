# Design: one Stage for the workbench (a split tree of named dockers, panels, per-project screensets)

Milestone M1 of `arcs/workbench/ARC.md`, third revision 2026-11-14, after the human's checkpoint answers (ARC.md, M1 "Checkpoint decisions"), `arcs/workbench/RESEARCH.docking-layouts.md`, and the human's later decisions on milestone order, screensets and pinning. A design document, no production code. Terms follow `STAGE-ADOPTION.md` section 0 except where this document changes them. **Paths are relative to `shell/`** (`src/...`, `arcs/...`, `DECISIONS.md`). "Verified" means read in the code; anything not verified is marked **(unverified)** and collected in section 11.

## Vocabulary (decided)

| Term | Meaning |
| --- | --- |
| **Docker** | The container that holds tabs. Stable `id`, user-chosen mutable `name` (REAPER's word). A leaf of the layout tree. |
| **Panel** | The content shown in one tab of a docker (the clip editor, the chord picker, the canvas, a module). Earlier drafts' "slot" and "tab group" are now a docker. |
| **Split** | A tree node laying out its children in a row or column. A stack is a vertical split of dockers. |
| **Screenset** | A named, saved arrangement (the tree plus where each panel last was), stored **per project**. A project has an active screenset and a list of them. |
| **Meta-tab** | A tab in the strip at the bottom of the window that switches the active screenset. Meta-tabs replace today's canvas and desk view tabs. |
| **Place** | Where a closed panel goes when it reopens: a docker id, the docker's name, and a tab index. |
| **Workbench module** | One of the composition tools (Arithmetic, Mixer, ...). |
| **Region** | The inspector and the settings panel stay regions outside the tree. |

## Plain-language notes

**What a "command" is.** A command is a plain function you call to make something happen; naming them just means choosing the words. The Stage offers a few through one hook, `useStageApi()`: `show(panel)` brings a panel to the front (picks its tab, opens its docker if collapsed); `open(panel)` puts a closed panel back where it last was; `close(panel)` closes it and remembers where it was; `sendTo(panel, target)` moves it to another docker or into a new one; `isOpen(panel)` and `isShown(panel)` ask whether it is open and in front. Panels also receive messages from their host, called panel commands: `reveal` scrolls the roll so a note or clip is in view, `clearAnchor` clears the chord picker's anchor, `focus` moves focus into a panel. Nothing here is a general message bus. The human asked what "command names" meant; the names above are the proposal and are listed to confirm (open item O7).

**What "chrome" means.** Chrome is the framing around a panel's content. Today the desk, canvas and module area have no frame; only the editor's two panels have a small header strip. In the new design every docker has a thin strip on top: its name, a tab per panel, and a menu button (Send to, rename, collapse). The note clip editor's own header (clip name, note count, Tool and Grid menus) becomes the top of the clip editor panel so it travels with the panel. That changes the look of the whole workbench. Recommendation: accept it and review the look at the M5 checkpoint (open item O7).

## Scope summary

In scope: remembered placement, named dockers with tabs, per-project screensets with meta-tabs, pinning a module into its own docker, drag-to-dock (after the menu). Deferred: pop-out (a stretch after M8); the format must not preclude it (section 6).

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
| Keys today: project state under `hrifa.composition-workbench.`: `ui.canvas-split.v1`, `ui.detail-collapsed.v1`, `ui.workspace-view.v1`, `ui.editor-clip-target.v1`, `ui.active-composition-module.v1`, `ui.inspector-target.v1`, `ui.inspector-open.v1`, `ui.settings-open.v1`; per viewer: `hrifa.note-editor.v1` (holds `chordHost`, `chordDockWidth`, grid, entry length, velocity lane); `hrifa.stage.layout.workbench-editor.v1`. | `usePersistentState.ts` lines 12-30; `noteEditorPreferences.ts`; `editorStage.ts` |
| Page providers that wrap the whole centre: `CompositionSettingsProvider`, `DeskProvider`, `AudioEngineProvider`, `PreviewRegistryProvider`, the compact theme. A Stage mounted inside them gives every panel those contexts (portals keep the React context of where `Stage` is rendered). | page lines 598-603 |
| `SplitStage` collapse hides the bottom with the `hidden` attribute, which is `display: none`: a collapsed pane has a zero box. | `components/SplitStage.tsx` line 107 |
| `PresetStore` (the spike's presets) is `{ active, layouts }` with no version of its own; each layout is read through `parseLayout`. | `pages/stage/presets.ts` lines 20-23, 86 |
| No `useStageApi`, no named containers, no tree: the Stage takes `layout` and `update` and renders columns of stacked slots. | `components/Stage/Stage.tsx` |
| Project state: every key under `hrifa.composition-workbench.` is saved, opened and copied with a project (the three view keys `ui.canvas-split`, `ui.detail-collapsed`, `ui.workspace-view` are among them) and the view keys are listed in `unrecordedStateKeys` so they are never undo steps. | `projects.ts` lines 41, 77, 307, 359; `usePersistentState.ts` lines 118-147; DECISIONS W-10 |
| `usePersistentState` reads storage synchronously in its `useState` initialiser, so persisted instance lists exist at the first render. | `usePersistentState.ts` line 202 |
| The old Stage's root `.root` has no `position: relative` and no `overflow: hidden` (only the inner `.columns` has `overflow-x: auto`). | `components/Stage/stage.module.css` lines 5-17 and 21-26 |
| The footer status bar holds the canvas and desk view toggle as `view` and `onView` props. | `components/WorkbenchStatusBar.tsx`; page lines 957-958 |
| `check:stage` globs `src/lib/stage`, `src/pages/stage`, `src/components/Stage` and `src/components/InspectorKit`. | `package.json` line 21 |

## 1. Panel model

A panel is a Stage module (`StageModule` in `src/components/Stage/registry.ts`) plus the data below. The contract stays: a panel receives its size class and nothing else (STAGE-2, STAGE-4, `src/pages/stage/ARCHITECTURE.md` section 3), is mounted once and keeps its state when moved (STAGE-7).

### 1.1 Registration data

```ts
// src/lib/stage/registry.ts (data only; render is attached in the component). In code the type stays `ModuleMeta`.
interface PanelMeta {
  id: PanelId;                // stable, persisted, never reused; instances use `<kind>:<instanceKey>` (1.4)
  title: string;
  sizes: readonly SlotSize[];
  minSize: SlotSize;          // drives the docker's derived minimum
  home?: string;              // NEW: the NAME of the docker it normally lives in ("Detail", "Tools"); a hint (3.3)
  multiple?: boolean;         // NEW: the kind may have several instances (1.4)
  transient?: boolean;        // NEW: open only while a host claims it; never saved as open (3.6; open item O3)
  keepMounted?: boolean;      // NEW: stays mounted, parked, when closed, hidden, or not in the active screenset (2.5)
}
```

Not in the metadata, on purpose: `fills`, `neverHidden`, `closable` (earlier per-panel flags). The human rejected them: which docker flexes, what may be hidden and what may be closed are user and screenset choices (2.4). `keepMounted` and `transient` are technical properties of a panel kind, not working-style choices; `transient` is put to the human as O3.

### 1.2 The workbench's panels

| Panel id | Title | Home docker | Minimum (proposal) | Notes |
| --- | --- | --- | --- | --- |
| `canvas` | Canvas | Canvas | narrow x short | `CompositionCanvas`. `keepMounted` so flipping screensets keeps it alive, as today. |
| `desk` | Desk | Canvas | narrow x short | `DeskView`. `keepMounted`. |
| `clip-editor` | Clip editor | Detail | narrow x short | What `ClipEditorSlot` is: shows `clipEditorFor(snippet)` (the note clip editor with its piano roll for note clips), "No editor for this clip yet" for a type without an editor, a blank floor when no clip is open (`ClipEditorSlot.tsx` lines 38-53, verified). "Piano roll" means the note clip editor's roll only. In M5 it still contains the editor's own v1 Stage (roll and chords); in M6 they become panels and the old id `roll` maps to `clip-editor`. |
| `module-detail` | Modules | Detail | narrow x short | Follower for unpinned modules (8.3). `keepMounted`: the module editors must keep publishing outputs in any screenset, including one without this panel. |
| `module:<instanceId>` | the instance's label | Detail | narrow x short | A pinned module instance (M7). `multiple`, `keepMounted`. |
| `chords` | Chords | Tools | narrow x short today | `transient`, single instance. |

Both editor panels declare `minSize narrow x short` today (`NoteClipEditor.tsx` lines 1486-1499, verified); keeping that until M6 shows whether the roll is usable that small is a tuning.

### 1.3 The chord picker follows the active chord target

The picker must work with no piano roll (the human's examples: insert a chord, as pitch classes in a bracket, into an empty list in a module; insert a set of notes into a module for analysis). Decided: the picker is a context-free body reading a **page-level chord session** and acting on the **active chord target**.

- `ChordSession` is a page-level store, **separate from the per-clip `ClipEditorSession`** (7.2): the picker's state (anchor, override, voicing, mode, tier, continuous, all-pitches, hover and pinned chord, hover cell, the picker control handle) and the keyboard workflow.
- A host (the clip editor, a module such as a progression list) **claims** the target with a `ChordTarget` and **releases** it when it stops being the open item (lifetime: 7.2). **Last claim wins.** The session resets when the active target changes.
- The picker is open iff the active claim wants it: for the clip editor "the Chords tool is on"; a list module decides for itself. **The ChordSession is the only caller of `open('chords')` and `close('chords')`**; when the user closes the picker's tab, the Stage reports it to the session, which forwards it to the active claim's host (the clip editor leaves the Chords tool). With no active claim, the picker stays closed and `show('chords')` does nothing.
- A host that is not a clip works: `noteAt` returns null, the anchor comes from its own selection.

One picker means one remembered place and one set of keys (W-20); the cost is that two hosts cannot show it at once (a second picker would need a `multiple` kind).

### 1.4 Instances

Decided: the clip editor and the chord picker are single instances (state is page-level, one is enough). A kind may declare `multiple: true`: several instances with ids `<kind>:<instanceKey>`, where the key is an id the **host persists** in its own project data (for modules: `compositionInstances`, so `module:<instanceId>`). Examples: a set browser or voicing catalog, two modules showing different Carter hexachords, a subset combiner.

Registry rules (owned by M3): the registry is **rebuilt** when the host's instance list changes (a new `StageRegistry` value; hosts are keyed by panel id so panels whose id survives keep their state; a removed instance's host is dropped); panel ids for instances **exist before `parseScreenset` runs**: in the workbench the instance list is persisted state read synchronously in the page's first render (`usePersistentState` initialises with `useState(() => localStorage.getItem(...))`, `usePersistentState.ts` line 202, verified), so the registry is built from it and the stored screensets are parsed against it; when an instance is deleted the host calls `reconcile(screenset, known)` on **every screenset of the project** (a normal pure operation that closes the gone panel's tabs and drops its places).

### 1.5 What a host must provide to a panel

| Need | Provided by | Notes |
| --- | --- | --- |
| Size class | The Stage (`render(size)`) | The only argument. |
| State | Providers above the Stage (`WorkbenchSessions`) | The clip editor session and chord session stores (7). |
| Layout functions | `useStageApi()` | Plain functions (Plain-language notes). |
| Selection | A selection context with a parent chain | 7.4. |
| Key scope | `data-note-editor-scope` on a clip editor panel root; `data-chord-scope` on the picker frame and on any non-clip host panel that wants the keyboard workflow | One scope helper reads both (7.2). |
| Theme and compact Mantine defaults | Page provider | Unchanged. |

### 1.6 What a panel must never assume

Which docker it is in, whether other panels are visible, that a specific other panel exists, that it is visible (inactive tabs and parked dockers stay mounted at their last size), that it can close itself, pixel sizes, its own storage key for position, floating windows (STAGE-3), or that its DOM scroll survives a move or a parking (keep scroll in state; backlog "restore scroll").

## 2. Layout model: a split tree with named dockers (decided)

The human declined a library (dockview was considered, `RESEARCH.docking-layouts.md`) and chose to build on the existing Stage core. Every docking system models a layout as a tree; all three arrangements the human named are nested splits with leaf dockers; today's columns of stacked slots is a depth-2 tree, so migration is lossless.

### 2.1 Data

```ts
type PanelId = string;
type DockerId = string;
type ScreensetId = string;

interface Docker {
  kind: 'docker';
  id: DockerId;            // stable, generated, never shown
  name: string;            // user-chosen, mutable, unique within the screenset
  tabs: PanelId[];         // open panels, in tab order; may be empty (the docker persists as a strip)
  active: PanelId | null;
}
interface Child {
  node: Node;
  rem?: number;            // fixed size along the split's axis, rem
  weight?: number;         // share of the room left after fixed children (relative, > 0)
  min?: number;            // optional override upward of the derived minimum, rem
}
interface Split { kind: 'split'; dir: 'row' | 'column'; children: Child[] }   // 2 or more children
type Node = Split | Docker;

interface Place { docker: DockerId; name: string; index: number }              // BOTH id and name are stored

interface Screenset {
  version: 2;
  id: ScreensetId;
  name: string;
  tree: Node;
  lastDocker: Record<PanelId, Place>;   // includes closed panels
  collapsed?: DockerId[];
  defaultDocker?: DockerId;
}
interface ScreensetStore {              // ONE JSON value per project
  version: 1;
  active: ScreensetId;
  order: ScreensetId[];                 // meta-tab order
  screensets: Record<ScreensetId, Screenset>;
}
```

Panels live **outside** the tree, keyed by id (the registry): the tree holds ids and numbers only. A panel is open if its id is in some docker's `tabs`. Rules: at least two children per split (a one-child split is replaced by its child); each panel id in at most one docker of a screenset; at least one docker; depth capped at 6 on parse; **dockers are never deleted when emptied**, only by an explicit remove. **Merging same-direction nested splits:** a split nested directly in a split of the same direction is merged into its parent **only when the parent child's size is a weight and all merged children are weights** (their weights are rescaled by the parent child's weight share so proportions are kept); a split with any fixed `rem` child is **not** merged (no mixed rem and weight merging), so no size changes.

`parseScreensetStore(raw, known, config)` never throws: unknown panel ids and repeats dropped, bad numbers repaired, an invalid store falls back to the config's default screensets, an `active` that does not exist falls back to the first.

**Per project, not per viewer.** The store is **project state**, like today's `ui.canvas-split`, `ui.detail-collapsed` and `ui.workspace-view`: it lives under the key `hrifa.composition-workbench.ui.screensets.v1`, so it is saved, opened and copied with the project (every key under `hrifa.composition-workbench.` is, `projects.ts` lines 41, 77, 307, 359, verified; W-10), and it is added to `unrecordedStateKeys` so changing it is never an undo step (`usePersistentState.ts` lines 118-147, verified). Because it is project state the page reads and writes it with `usePersistentState`, not with the Stage's own `loadLayout`/`saveLayout` (which require a `hrifa.stage.` key, `src/lib/stage/persist.ts`); the Stage component itself holds no storage. **Per-viewer** applies only to what is not project data: the `/stage` spike's keys, the editor key being migrated, `hrifa.note-editor.v1`, and the user's possible template library (open item O1). `lastDocker` (remembered places) lives inside each screenset, so it is project state too. This changes the ARC's persistence parameter ("layout and per-viewer choices under `hrifa.stage.` keys only") for the workbench; a DECISIONS row records it (10.1, M2 and M5).

### 2.2 The three target arrangements, as data

(a) A top docker over a bottom area whose right-hand docker holds three tabs:

```ts
{ kind:'split', dir:'column', children:[
  { weight: 0.55, node: { kind:'docker', id:'d1', name:'Canvas', tabs:['canvas'], active:'canvas' } },
  { weight: 0.45, node: { kind:'split', dir:'row', children:[
      { weight: 1, node: { kind:'docker', id:'d2', name:'Detail', tabs:['clip-editor'], active:'clip-editor' } },
      { rem: 30,   node: { kind:'docker', id:'d3', name:'Tools',  tabs:['chords','sets','voicings'], active:'chords' } } ] } } ] }
```

(b) Left, centre and right dockers with one tab each:

```ts
{ kind:'split', dir:'row', children:[
  { rem: 20,   node: { kind:'docker', id:'d1', name:'Library',    tabs:['sets'],       active:'sets' } },
  { weight: 1, node: { kind:'docker', id:'d2', name:'Canvas',     tabs:['canvas'],     active:'canvas' } },
  { rem: 24,   node: { kind:'docker', id:'d3', name:'Visualizer', tabs:['visualizer'], active:'visualizer' } } ] }
```

(c) A top docker over a bottom split into left and right:

```ts
{ kind:'split', dir:'column', children:[
  { weight: 0.5, node: { kind:'docker', id:'d1', name:'Canvas', tabs:['canvas','desk'], active:'canvas' } },
  { weight: 0.5, node: { kind:'split', dir:'row', children:[
      { weight: 0.5, node: { kind:'docker', id:'d2', name:'Detail', tabs:['clip-editor'], active:'clip-editor' } },
      { weight: 0.5, node: { kind:'docker', id:'d3', name:'Tools',  tabs:[], active:null } } ] } } ] }
```

(`sets` and `visualizer` are illustrative panel ids.) In (c) `Tools` is empty: a thin labelled strip that accepts drops.

### 2.3 Migration from version 1 (columns of stacks)

A version-1 layout is `{ version:1, columns:[{ slots, width?, shares? }] }`; the type is `Layout` in `src/lib/stage/layout.ts` line 41 (verified). M2 adds `export type LayoutV1 = Layout` as an alias; the type is **not renamed** until the old Stage is retired (M8), because the old Stage must stay untouched. Pure core function: **`layoutV1ToScreenset(layout, opts): Screenset`** (returns the tree and `lastDocker`; `opts` carries the registry, name, id and the transient panel ids). Mapping:

- A column becomes a child of a root **row** split. **A column with no `width` means the default 36rem, clamped to 12 to 96** (`columnWidth` in `layout.ts`, `DEFAULT_COLUMN_REM`; verified). Its width becomes `rem`, except the last column: `weight: 1` with `min` = its (defaulted, clamped) width (version 1: the last column fills, its width is its minimum, ARCHITECTURE section 10). A single column yields a lone docker, not a split.
- A stack becomes a column split of dockers; `shares` become `weight`s (no shares: even weights).
- Each slot becomes a docker with one tab named from its panel's title (naming: open item O4).
- Transient panels leave `tabs`; their docker stays (empty) and `lastDocker[panel] = { docker, name, index: 0 }`.

Version-1 literals that remain valid input (non-test code): `DEFAULT_LAYOUT` (`layout.ts`), `defaultEditorLayout` (`editorStage.ts` line 54), `NO_STORED_LAYOUT` (`NoteClipEditor.tsx` line 471), `pages/stage/presets.ts` lines 35 and 86, `pages/stage/spike/index.tsx` lines 47 and 58, `pages/stage/standins/index.tsx` line 52. **Because the old Stage and `NoteClipEditor.stage.test.tsx` stay untouched and green until M6, none of these code paths changes before M6**; the migration is exercised on stored data and in the new component.

**The spike's keys.** `hrifa.stage.layout.v1` and `hrifa.stage.presets.v1` (`presets.ts` line 11) belong to the old spike mode and are **not migrated** while the old Stage stays (M3 adds a new tree spike beside it with its own key `hrifa.stage.screensets.spike.v1`; the old spike is untouched). `PresetStore` is `{ active, layouts }`, no version of its own (verified, `presets.ts` lines 20-23).

**The editor key and old project state seed the first screenset set of a project.** When a project has no `hrifa.composition-workbench.ui.screensets.v1`, the page builds the default screensets (8.1) and seeds them; **nothing is lost and no history entries are written** (the key is unrecorded, 2.1, and the old keys stay in the project, unread afterwards). Workbench code (a successor of `editorStage.ts`, owned) does it in this **order** (the id rename applies to places too, so it comes first):

1. Read the viewer's editor key `hrifa.stage.layout.workbench-editor.v1` (per viewer, so every project seeds from the same editor arrangement), and rename ids: `roll` becomes `clip-editor`. A version-1 editor key has **no `lastDocker`**; the place is derived in step 4.
2. Validate against the registry (unknown ids dropped).
3. `layoutV1ToScreenset` (generic).
4. Fold into the `Detail` and `Tools` dockers of every default screenset (8.1): the editor key holds `roll` and `chords` in **either order and in either shape**: side by side (two columns) or **stacked** in one column (roll over chords, or chords over roll): in every shape the `clip-editor` panel becomes the `Detail` docker's tab beside `module-detail` and `chords` becomes the `Tools` docker's remembered place (`lastDocker.chords = { docker: Tools, name:'Tools', index:0 }`); a swapped order (chords left of roll) or a stack only changes whether `Tools` is placed left of, right of or below `Detail` in the seeded screensets (the migration puts `Tools` on the same side as the stored order and uses the stored `rem` width; a stack becomes a column split), and the picker column width carries as `Tools`' `rem`.
5. Seed from the old per-project keys (8.5) and from `chordHost`, `chordDockWidth` (per viewer): the split share into the top weight of every default screenset, `ui.detail-collapsed` into `collapsed` (`Detail`) of every default screenset, `ui.workspace-view` into the **active screenset** (`desk` becomes `Desk`, `canvas` becomes `Canvas`; this retires `workspace-view` semantics, 8.1).

**Which source wins for the `chords` place**, in that order: (1) `chordHost === 'takeover'` wins (the live choice that decides where the picker shows today): the migration **wraps the `Canvas` docker in a row split** (`{ kind:'split', dir:'row', children:[ {weight:1, node: Canvas docker}, {weight:1, min:<default picker width>, node: new empty docker 'Chords'} ] }`, a new row split because the parent is a column split) and sets `lastDocker.chords` to the new docker (the human accepted "own column", Q19); (2) otherwise the editor key's place (`Tools`); (3) otherwise home `Tools` with `chordDockWidth` (px, `migratedPickerRem`) as `rem`. The editor key is left in place (rollback) and is not read again once the project has a screenset store. It remains a per-viewer key and is never rewritten.

**M2 test expectation (generic part, editor shape as a fixture, `chords` transient):** `{ version:1, columns:[ {slots:['roll'], width:40}, {slots:['chords'], width:30} ] }` becomes a row split with first child `{ rem: 40, node: docker(tabs:['roll']) }` and second `{ weight: 1, min: 30, node: docker(tabs: [], active: null) }`, and `lastDocker.chords = { docker: <the second docker's id>, name: <its name>, index: 0 }`. A column with no width yields 36. A stack `['roll','chords']` in one column yields a column split of two dockers with weights from the shares, the transient one empty. An unknown id is dropped. (Version 1's last column fills, so the generic mapping puts the weight there; the workbench step 4 then makes `Detail` flex and gives `Tools` `rem: 30`, the rule of 2.4.)

### 2.4 Sizing: fixed, flexible, minimums

- A child has either a fixed `rem` or a `weight`. **Which docker flexes is data**, set from a "Flexible / Fixed size" item on the docker menu; the default screensets make `Detail` flex so the piano roll flexes and the picker keeps its width (the human's stated preference), and the user can change it per screenset.
- **Minimum** of a docker: derived at solve time from its **active** panel's `minSize` using the existing floors (`minWidthRem`, `minHeightRem`, `src/components/Stage/stageOps.ts`), at least the Stage minimum (12rem by 6rem); a split's minimum along its axis is the sum of its children's minimums plus splitters, across its axis the largest; `Child.min` raises it.
- The pure solver (`solve.ts`) gives fixed children their `rem` clamped to their minimum, flexible children the remainder by weight clamped to their minimum, repeated until stable; when minimums do not fit the narrow rule applies (2.5). Drags and nudges reuse `dragSplitter`, `clampShares`, `columnSplitterRange` (`src/lib/stage/splitters.ts`) on two neighbouring children.
- An **empty docker** is drawn as a strip (about 1.5rem across the split axis) with its name; its stored `rem` or `weight` is kept for when it gets a panel. Emptying releases the space except for the strip.
- **What may be hidden and what can be closed are user choices:** any docker can be collapsed; any panel can be closed and reopened from the Panels menu (except `transient` panels, 5.2).

### 2.5 Hidden, collapsed, narrow and not-in-this-screenset: how measured panels stay alive

The canvas measures its box and refits badly if it goes to zero (page comment, section 0). Today: `SplitStage` collapse uses the `hidden` attribute, which is `display: none` (`SplitStage.tsx` line 107); the old Stage detaches hidden columns' hosts (`Stage.tsx` header comment; STAGE-7, which says hidden columns "stay mounted with detached hosts at their last measured size"). The new component supersedes that (DECISIONS row, M3). Rule (technical robustness, for every panel):

- A collapsed docker, a docker the narrow rule hides, and every `keepMounted` panel that is not in the active screenset's tree are **parked**: the host stays attached in a parking box inside the Stage root, **absolutely positioned and sized to the panel's last measured size**, `opacity: 0`, `pointer-events: none`, `visibility: hidden`, `inert`. Never `display: none`, never detached. Inactive tabs of a docker are parked the same way (4.3).
- **The Stage root does not clip today**: `.root` in `stage.module.css` has no `position: relative` and no `overflow: hidden` (lines 5-17, verified; only the inner `.columns` has `overflow-x: auto`). The new component's root therefore gets `position: relative; overflow: hidden` so parked boxes cannot show through or add scroll. Opacity 0 is what hides the canvas's own elements (page comment: they set `visibility: visible`).
- **Parking is a re-parent**, and a re-parent loses DOM scroll (STAGE-7 limit). So parking and scroll restore are one design item: the new component captures `scrollTop` and `scrollLeft` of the host before it is parked or moved and restores them after adoption (M3, the backlog "restore scroll" items), or parks **in place** (the host stays in its docker body and only the docker body is made invisible and kept at its size) where possible. Recommendation: park in place for inactive tabs and collapsed dockers (no re-parent, no scroll loss), and use the Stage-root parking box only for panels that are not in any docker (another screenset's panels, closed `keepMounted` panels).
- **Last measured size may not exist**: a docker collapsed at load, or a `keepMounted` panel not yet shown, has never been measured. Fallback: the **solver's size** for that docker (what it would get if expanded), else the Stage minimum; the first real measurement replaces it.
- **Narrow window** (research, judgement; O5): each docker gets at least its minimum; when a split's minimums do not fit, children are collapsed to strips from the far end, never the docker the user last selected, until the rest fit; if one docker does not fit it is shown alone, the others strips. Expanding a strip swaps it in. The solver clamps; nothing overflows.
- **Unverified in practice** (section 11): that a parked box keeps `ResizeObserver` quiet and the canvas from refitting.

## 3. Remembered placement

### 3.1 What is stored

`Screenset.lastDocker: Record<PanelId, Place>`, `Place = { docker: DockerId; name: string; index: number }`: the docker id, the docker's **name** at the time, and the tab index. Per screenset (a panel can live in different dockers in different screensets), inside the project's screenset store, so it is project state and costs no extra write.

### 3.2 When a place is recorded

Every pure operation that moves or closes a panel records its place in the same step: `sendTo`, `closePanel`, tab reordering, and removing a docker (each tab records its place first; those places then point to a removed docker). There is no separate record-at-close step and no exception for transient panels (never saved as open, 3.6; their place is in the map from the last move or close). **On a screenset switch** nothing is recorded: switching changes which screenset is active, each with its own map. Open panels of the screenset being left: `keepMounted` ones stay mounted and parked (2.5), the others unmount (their state lives in page-level stores or the panel's own persisted keys); an **open transient panel** (`chords`) is re-resolved by the ChordSession in the new screenset (`open('chords')` at that screenset's place, else home, else default) if the claim still wants it.

### 3.3 Resolution on reopen

`openPanel(screenset, meta, id)` (pure; the Stage also expands and brings the docker forward):

1. `lastDocker[id]`: a docker with that **id** exists, join it at `min(index, tabs.length)`, active tab.
2. Otherwise a docker with that **name** (the stored `name`, case-insensitive; the docker may have been removed and recreated, or the ids regenerated by an import) exists, join it.
3. Otherwise the panel's `home` (a docker name), looked up the same way.
4. Otherwise `defaultDocker`, else the first docker in depth-first order.
5. If there is no docker at all, create one root docker (named from the config) and join it.

Opening never refuses: tabs mean there is always room.

### 3.4 Releasing space, reset

An emptied docker stays as a strip (2.4); only **Remove docker** deletes it (its tabs close, places recorded, the tree normalised); the last docker cannot be removed. **Reset screenset** restores the shipped default of that screenset (for a user-created one, a snapshot taken when it was created); there is no reset-all.

### 3.5 How a tool reopens its panel, and how it differs from `toolBeforeChords`

Today (verified): `tool === 'chords'` makes `chordsActive`; the picker is in the displayed layout only then (`pickerInStage`, derived each render); the arrangement is a `useState<Layout | null>` that keeps the picker's place and is not edited while it is hidden; `toolBeforeChords` is a ref, and the strip's Close runs `setTool(toolBeforeChords.current)`.

Proposed: the clip editor host's claim carries `wantsPicker = (tool === 'chords')`; the **ChordSession** turns a change into `open('chords')` or `close('chords')` (the only caller, 1.3). A close the user makes on the picker's tab reaches the session as `onPanelClosed`, which forwards it to the active claim's host: the clip editor leaves the Chords tool (`setTool(toolBefore)`, unchanged behaviour); a `close` the session made does not call back (no race). `toolBeforeChords` stays tool state in the clip editor session. The picker's place lives in `lastDocker`, so it works when a screenset never contained the picker.

### 3.6 `transient`: openness is not persisted (SUPERSEDED 2026-11-14: the human chose O3(b), see below)

> **Decision (2026-11-14, human):** the chord picker is an ORDINARY panel. There is no `transient` flag; openness is saved like any other panel. The Chords tool (menu or hotkey 7) calls `show('chords')` so the panel is shown if it is not; closing the panel while the Chords tool is active leaves the tool (the `toolBeforeChords` rule); other tools leave the panel alone. The rest of this section is kept as the record of the option not chosen; where it conflicts, this note wins.

Decision proposed (O3): `chords` is `transient`: it is open iff the active claim wants it, and **it is never saved as open** (the saver strips it from `tabs`; its place is already in `lastDocker`). Consequence: the user cannot keep the picker open while the Chords tool is off; a saved or switched-to screenset never reopens it by itself; closing its tab is leaving the tool. Reason: the tool (per-clip session state, `NoteClipEditor.tsx` line 481, reset on clip change because the body is keyed by clip id) stays the single source, so tool and layout cannot disagree.

| Event | Result |
| --- | --- |
| Reload | No claim yet, picker closed; the screenset lists no `chords`; its place is in `lastDocker`. |
| Tool turned to Chords | The session calls `open('chords')` (3.3). |
| Tool changed away | The session calls `close('chords')`; the place stays recorded. |
| Clip switch | The old claim is released and a new one made; the chord session resets; the picker closes unless the new claim wants it. |
| Screenset switch | 3.2. |
| No clip, no claim | No target: the picker is closed; `show('chords')` does nothing; it is not in the Panels menu. |
| A stored screenset with `chords` in `tabs` (hand-edited) | The loader moves it to `lastDocker`; it reopens only when a claim wants it. |

## 4. Dockers: tabs, keyboard, calling a panel forward

### 4.1 Model

A docker is the tab group (2.1) with zero, one or many tabs; `active` is one of `tabs` or null when empty; closing the active tab activates the next (the previous at the end). Its minimum derives from the active panel; its measured size goes to the active panel and to every other tab when it becomes active. A stack is a column split of dockers, so a stack contains tab groups by construction. **The earlier pre-decision "closing the last tab releases the group" is replaced** (named dockers persist when emptied; DECISIONS row, M2).

### 4.2 Joining and leaving

By the Send-to menu (5.2) or by drag (5.3): a panel joins another docker as a tab, or leaves into a new docker. Tabs reorder with Alt+Left and Alt+Right on a focused tab or by drag in the strip.

### 4.3 Mounted once, inactive tabs

All panels are mounted once (the Stage renders each at its root through `createPortal` into a stable host). A docker's body holds the hosts of **all** its tabs in one grid cell: the active host shown; the others **`opacity: 0`, `pointer-events: none`, `visibility: hidden` and `inert`** (the page's `inactiveViewStyle` plus `inert`, `CompositionWorkbench.page.tsx` lines 250-255 and 687-723, verified), parked in place (2.5). `visibility` alone is not enough (the canvas's elements set `visibility: visible`); `display: none` and detaching are not used. One body, one measured size for all tabs.

### 4.4 Keyboard (decided: select a docker first, then tabs; manual activation)

Each docker is a labelled region (`role="region"`, `aria-label` = its name, the name also visible in the strip); its strip is `role="tablist"` with `role="tab"` buttons and roving tabindex; the body is `role="tabpanel"` labelled by its tab (WAI-ARIA tabs, from the research file, not re-read).

1. **Select a docker** by shortcut: cycle between dockers (O6), jump by number (tree order), or pick by name from a "Go to docker" list. The selected docker is ringed and focus moves to its active tab.
2. **Then:** Left and Right move focus between its tabs **without** activating; Enter or Space activates; Home and End jump to the ends; Delete closes the tab; Alt+Left and Alt+Right reorder; the docker menu opens with Enter or Space on its button.
3. Escape returns focus to the active panel body. Panel key handling (the roll, W-20, Esc) is scoped by panel-root scope attributes, so it does not see keys pressed on a strip.

### 4.5 Calling a panel to the front

`show(panel)`: open it if closed (3.3), make it the docker's active tab, expand or un-park its docker, never change the layout otherwise, move focus only with `{ focus: true }`. Called only for an explicit user action (selecting a module, opening a clip, clicking a meta-tab), never as a fallback: deleting the open item blanks the panel, nothing is promoted.

## 5. Send-to, drag-to-dock, meta-tabs

### 5.1 One data operation

```ts
type Target =
  | { kind: 'docker'; docker: DockerId; index?: number }                                       // join as a tab
  | { kind: 'split'; beside: DockerId; edge: 'left' | 'right' | 'top' | 'bottom'; name?: string }; // new docker
sendTo(screenset, panelId, target): Screenset   // pure; same object when it does nothing
```

A same-docker `docker` target with no changed index does nothing. `split` creates a new named docker (default "Docker N", or the typed name) beside `beside` in a split of the matching direction (wrapping `beside` in a new split if its parent runs the other way), moves the panel in, and gives it half of `beside`'s room. The menu and the drag UI both call `sendTo`; `guarded` (minimums, `stageOps.ts`) refuses a send that would leave a docker below its minimum.

### 5.2 The Send-to menu (first)

On each docker strip's menu button (a Mantine `Menu`; keyboard behaviour from memory):

| Entry | Effect | Disabled when |
| --- | --- | --- |
| **Send `<panel>` to `<docker name>`** (one per other docker, by name) | `sendTo(..., {kind:'docker'})`, active tab there | one docker |
| **Send to new docker...** > Left, Right, Above, Below (asks a name, default "Docker N") | `sendTo(..., {kind:'split'})` | `guarded` refuses |
| Close `<panel>` | `closePanel` (records the place) | never |
| Move tab left / right | reorder | at the end |

Docker items: **Rename docker...**, **Flexible / Fixed size**, **Collapse / Expand**, **Remove docker** (explicit; disabled for the last docker; with tabs it closes them; layout changes are not undoable in this design, so Remove docker carries a plain confirmation instead of an undo, O4). A **Panels** menu lists every registered panel **except `transient` ones**: open panels are `show`n, closed ones open in their remembered place. This is the hidden-panel switcher and the way back for anything closed.

### 5.3 Drag-to-dock (after the menu, in scope; M3b)

Dragging a tab starts a pointer drag (pointer capture, not HTML drag and drop). A **transparent shield** covers the Stage while dragging so canvases and iframes cannot swallow the pointer. Over a docker an overlay shows five zones: the **centre joins** as a tab (index from the pointer over the strip), four **edge zones split** in that direction (translucent preview; a minimum thickness so a small docker still has them). Dropping on an empty strip joins it. A same-docker centre drop does nothing. Escape cancels. The drop produces a `Target` and calls `sendTo`: no new data. The keyboard alternative is the Send-to menu. Touch: unverified.

### 5.4 Meta-tabs (screenset switching)

A strip at the bottom of the window (in the footer, replacing the status bar's canvas and desk toggle, `WorkbenchStatusBar` props `view` and `onView`, page lines 957-958, verified) shows one tab per screenset (`order`), the active one in front. Click or keyboard (the same tab pattern: arrows move focus, Enter or Space activates) switches `active`. A "+" adds a screenset (copy of the current one, named "Screenset N"), and a tab menu offers **Rename**, **Duplicate**, **Delete** (not the last one), and **Reset**. M3 builds the strip as a UI skeleton in the new component; M5 puts it in the footer.

### 5.5 The Stage functions

`useStageApi()` returns `open`, `show`, `close`, `sendTo`, `isOpen`, `isShown` (decided: a Stage function, not a general channel). Panel commands (`reveal`, `clearAnchor`, `focus`) go through the sessions (7.3).

## 6. Pop-out (deferred, stretch after M8)

Not built in this arc. It would need a floating slot (`floating: { panel, x, y, w, h }[]` on the screenset), z-order, clamping inside the screen on load and resize, pointer and keyboard move and resize, a re-dock action that returns the panel to its place (3.3), a narrow-page rule, persistence, and a z-index plan against Mantine portals. It relaxes the earlier rule (STAGE-3 "no free-form windows"; `src/pages/stage/ARCHITECTURE.md` section 3): the Stage, not a panel, would own the floating slot, and a DECISIONS row would say so. **The format does not preclude it:** `Screenset` is an object, an optional `floating` array can be added later, and panels are independent of the tree, so a floating window is one more place a host can hang. A browser window (`window.open`) is not recommended (copying styles, key scope, background throttling; unverified). Risks: focus and key scope, overlap with menus, off-screen windows after a monitor change.

## 7. State boundary: what must leave `NoteClipEditor`

### 7.1 What is inside today (verified list)

| State | Today | Who needs it |
| --- | --- | --- |
| Open clip, packet, commit | `useDesk()` in the body; `commitSnippetEditById`, `latestSnippetById` | roll, chords target (insert), inspector |
| `tool`, `toolBeforeChords`, `pick`, `rampState`, `rotationState` | `useState`/`useRef` | roll (about 40 `PianoRoll` props), inspector channel |
| `view` (scroll and zoom) | `useState(openingView(packet))` | roll; survives moves only because the owner holds it |
| selection (`selectionState`: ids, range, kind, `basis`, `moves`), `selectionRef` (assigned during render, flagged in BACKLOG "Code hygiene") | state plus ref | roll, inspector channel, keyboard actions |
| `reveal` (one-shot token) | `useState` | roll |
| chord session (16 values, section 0) | state and refs | roll (ghosts, anchor, hover), picker, W-20 keys, audition; moves to its own page-level store (7.2) |
| `preferences` (grid, entry length, `chordHost`, lane collapsed) | `useNoteEditorPreferences()` | roll, picker host |
| the header (title, note count badge, notice, Tool menu, Grid menu) | rendered by the editor | not part of either panel today |
| `announcement` (live region) | state | roll keyboard |

About 1,950 lines; the roll's JSX alone spans lines 1559-1800.

### 7.2 Proposed boundary (decided in outline)

**No React `key` above the Stage anywhere.** A key above the Stage would remount the canvas, desk and every workbench module editor, which must stay mounted to publish outputs (`SplitStage.tsx` lines 24-25; the module list in the page). Two stores, mounted by an **owned wrapper component `src/pages/composition-workbench/WorkbenchSessions.tsx`** (no entry-file edit before M5: tests wrap it themselves in M4; the page wraps the Stage in it in M5):

1. **`ClipEditorSession`** (per open clip, inside the wrapper): tool, `toolBeforeChords`, pick, ramp, rotation, view, selection (with `basis` and `moves`), reveal, announcement, preference access, commit functions through the desk. It resets per clip **internally**: it holds the open clip id and a state object per clip, disposing the old on a change (the `endEditSession` cleanup `ClipEditorSlot` runs today, listeners, `publishNoteEditor` withdrawal) and creating a fresh one, equal in behaviour to `key={snippet.id}` today. Only the **clip editor panel's content** is keyed by clip id, as `NoteClipEditor` is (`NoteClipEditor.tsx` lines 1946-1948).
2. **`ChordSession`** (page level, **separate** from 1): anchor, override, voicing, mode, ctrl-open, continuous, all-pitches, tier, hover and pinned chord, the control handle, reselect flags, **`hoverCell` and `hoverBlocked`**, the W-20 `keydown`/`keyup` listeners (capture phase, installed while an active claim wants the picker and an anchor exists), Escape, and **audition**. It resets when the active target changes.

**Single owners (decided here):**
- **`hoverCell` and `hoverBlocked`: the ChordSession owns both**; the roll host feeds `onAnchorHover` into `chordSession.setHoverCell(cell)` (the blocked-cell rule lives inside the session) and **reads** the cell to build the ghosts together with the anchor, hover and pinned chord. The clip editor session holds neither.
- **Audition: the ChordSession owns it.** It mounts `ChordAudition` while a claim wants the picker (as the editor does with `chordsActive`, `NoteClipEditor.tsx` line 1938) and holds the `auditionRef` and the `chordPreviewGate` developer option; the picker, the keyboard workflow and a host all call `chordSession.audition(notes, velocity)`. `ChordTarget` therefore has **no `audition`**.
- **`pointerInside` and the pointer-held tracker move to a shared scope helper**, `src/pages/composition-workbench/inputScope.ts` (owned): one window-level tracker (`pointerdown`, `pointerup`, `pointercancel`, `pointermove`, `lostpointercapture`, `blur`; today `NoteClipEditor.tsx` lines 573-600) installed by `WorkbenchSessions`, plus `pointerInside` = "the pointer is inside any element carrying `data-note-editor-scope` or `data-chord-scope`", reset on window `blur`. Both stores and the roll read it. The ramp Escape listener (lines 636-640) and the pick-pitch Escape and Enter listener (lines 682-686) stay with the roll (`useRollSession`) and read the helper.

**`ChordTarget` and claims:**

```ts
interface ChordTarget {
  pitchSet: ProjectPitchSet;                                          // today settings.pitchSet
  noteAt(cell): { duration; velocity?; pitchMidicents } | null;       // today noteAtCell; a list host returns null
  insert(chord, anchor, voicing, options): void;                      // today insertChord (a desk commit for the roll host)
  onAnchor?(anchor: { pitchMidicents: number; onset: number }): void; // today onChordAnchor (the page does not pass it)
  visible?(): boolean;                                                // is the host's panel in front (8.4)
  onPanelClosed?(): void;                                             // the user closed the picker's tab: the host leaves its tool
}
chordSession.claim(hostId, target, { wantsPicker }): release          // last claim wins
```

**Claim lifetime.** A claim lasts as long as its host is the **open item**, not as long as its panel is shown: the clip editor claims while a clip target is set (`editorClipTarget`, regardless of which tab is in front); a module claims while it is the **selected instance** (selection is exclusive: selecting another module or a clip releases it). Where several modules are visible (one pinned beside another), **only the selected one holds the claim**; clicking inside a pinned module panel selects it (calls `selectCompositionModule`, which today also clears the clip target, the existing exclusive-target rule), so the claim follows the user's attention. Last claim wins; releasing the last leaves no target; an earlier claim still held becomes active again (its host never released), which is not promotion of something the user closed.

**Keys.** `data-note-editor-scope` stays on the clip editor panel; **`data-chord-scope`** is carried by the picker frame and by any non-clip host panel that wants the keyboard workflow; the scope helper treats them as one scope, and the Escape row of 7.6 uses both.

**M4's second consumer is proven in a test only** (no spike lock): a minimal progression-list host component inside the test claims the target (no notes, `insert` appends to an array, a `data-chord-scope` root), the chord picker panel opens and inserts into it, Esc clears, the picker follows a later clip editor claim (last claim wins), and releasing returns to the list.

### 7.3 Panel commands and Stage functions

Two kinds, kept apart: **Stage functions** (`useStageApi`, 5.5) change layout and work before any clip is open; **panel commands** go through a session: `session.dispatch({ type: 'reveal', ... })` with `useCommand(session, 'reveal', handler)` in the receiving panel. `reveal` keeps today's one-shot token (`PianoRollProps['reveal']`, a nonce so a repeat counts) and replaces the spike's `{ clipId, nonce }` in shared state. Names: Stage functions `open`, `show`, `close`, `sendTo`, `isOpen`, `isShown`; panel commands `reveal`, `clearAnchor`, `focus` (the session the command goes to implies the panel; no prefix).

### 7.4 Selection model with a parent chain

Today the selection is three separate shapes in three places: the page's inspector target (`CompositionInspectorTarget`: canvas, module, route) and `editorClipTarget` (persisted page state), and the editor's note selection (transient). Proposed: a read-only **selection chain** exposed from a `WorkbenchSelection` context at the page: `[note-or-time selection, clip, module-or-canvas]` derived from those stored shapes (`parent(sel)` walks note to clip to project), so the inspector, canvas and roll read one thing. The stored shapes and their semantics do not change in M4 (the note selection keeps its `basis` and `moves` so a band survives an undo; the clip session owns it because it depends on the packet). Unifying the stored shapes is a larger step and is deferred; the chain makes consumers independent of where each part is stored. The checkpoint chose the minimal version (read-only chain, D13); full unification is a separate arc.

### 7.5 What the clip editor panel needs from a host

The clip editor session slice, the chord session, the desk (`useDesk`), `CompositionSettings` (pitch set, meter, EDO), `AudioEngineProvider`, the per-viewer note preferences, and `useStageApi()` (the Tool menu's Chords entry turns the claim's `wantsPicker` on). The editor header (clip name, note count, notice, Tool and Grid menus) becomes the top of the clip editor panel (M6; in M5 it stays inside the editor as today).

### 7.6 Behaviour that must not change (explicit requirements)

| Behaviour | Where it lives after M4 | Constraint |
| --- | --- | --- |
| Hover ghosts (a one-step ghost under the pointer while Chords is active; hidden after a keyed anchor move until the pointer reports another cell) | `ChordSession` (`hoverCell`, `hoverBlocked`); clip editor panel feeds `onAnchorHover` | `onAnchorHover` fires only with the Chords tool active; unchanged snapping to the EDO grid |
| Click to audition | `ChordSession` audition (it owns `ChordAudition` and the gate; `ChordTarget` has no audition) | gate by the developer option `chordPreviewGate` as now; silent hover |
| Insert (double-click or Enter) | `ChordTarget.insert`, one undo step | goes through the desk commit, so history and undo are unchanged; the session is never in history |
| W-20 keyboard workflow | the chord session's capture-phase `keydown` listener, installed while an active claim wants the picker, an anchor exists and the claim's `visible()` is true | capture phase so the picker's keys precede the roll's arrow handling; scope: editor, picker (also in any host), page body; Alt-arrow keyup guard (`altArrowHandled`) moves with it |
| Esc | chord session Escape handler | only when not typing, in `[data-note-editor-scope]` or `[data-chord-scope]` or body, and no open `dialog`, `alertdialog` or `menu` |
| Undo and history | desk | unchanged: nothing in the session is recorded |
| Anchor click on an existing note | `ChordTarget.noteAt` (W-22) | stacking uses that note's length and velocity |
| Shift+arrow reselect and silent auto-repeat | session flags (`chordReselect`, `chordReselectSounds`) | unchanged |
| Reveal scrolling the note into view | `reveal` command to the roll | once per press |
| Inspector actions read the live selection | `publishNoteEditor` published by the session | unchanged channel and semantics |

Existing tests (`NoteClipEditor.test.tsx`, `.chords`, `.chordKeys`, `.reveal`, `.stack`, `.stage`) are the guard; M4's acceptance already forbids weakening assertions.

## 7.7 Placement modes: the Chords tool versus the chord panel alone (CONFIRMED by the human 2026-11-14: anchor and selection modes in M6; cursor and drop later)

The human's question (2026-11-14): with the chord picker as an ordinary panel, what is different in the piano roll when the Chords tool is selected versus using the chord panel while another tool (the pointer) is active? This is the scaffold for pickers and generators that come later (a gesture picker, a voicing catalog).

**The idea.** Separate three things that are tangled today: the **source** (a panel that makes a payload, here a chord), the **target** (the host that can receive it, claimed through the active chord target) and the **way a position is chosen**. A chord needs a target and a position (a pitch anchor and an onset). The Chords tool is only one way to choose the position; the panel always works against the active target.

| Position source (placement mode) | Chosen by | Roll behaviour | When |
| --- | --- | --- | --- |
| **Anchor mode** | clicking or arrowing in the roll | The Chords tool: hover ghost and anchor ghost drawn on the roll, click sets the anchor, keys move it (W-20), continuous insert advances it. | The Chords tool is active. Exactly today's behaviour. |
| **Selection mode** | the roll's current selection | Pointer tool, no new gestures: the panel acts on the selected notes: a chord stacks onto the selected note (the M7 stack rule, anchor = the selected note's pitch and onset), several selected notes are each an anchor or the lowest one is, nothing selected means the panel only auditions. | A non-Chords tool and a target with a selection. |
| **Cursor mode** (later) | the playhead or an explicit cursor | Insert at the playhead and the last used pitch. | Later, if wanted. |
| **Drop mode** (later) | dragging the chord from the panel onto the roll | The roll is a drop target that accepts a chord payload; the drop position is the anchor. | The later drops system (the human's vision); it fits because the panel already produces a payload. |

**Rules that keep it in step**
- The panel always shows which mode applies ("Anchor: click in the roll", "Selection: 2 notes", "No target") and what Insert will do.
- Selecting the Chords tool forces the panel into view (above); the panel is never required for the tool to work in the roll (it just is the usual place to pick a chord).
- Audition always works (a target is not needed to hear a chord).
- Insert is disabled with a one-line reason when no position can be derived. It never guesses.
- The roll does not know about the panel: it publishes selection and hover through the chord target and consumes anchors and ghosts; the panel does not know about the roll: it talks to the active chord target.

**Why this is better than "tool on or off".** A binary tool conflates source, target and position. With placement modes: the picker works for a list module (its target supplies the position by its own rule, for example "append"), the roll offers anchor mode (today) and selection mode (new, cheap), and drag-and-drop later is just a fourth way to choose a position. It also gives M7 stacking (stack onto a selected note) a natural home.

**Open questions**: whether selection mode ships in M6 or later; whether Cursor mode is wanted; what the panel shows when no clip is open and no host claims. Recommendation: anchor mode (unchanged) and selection mode in M6; the rest later.

## 8. Mapping today's workbench centre onto the model

### 8.1 Default screensets (derived from today's canvas and desk views and default arrangement)

The app ships these screensets for every project (seeded when a project has none, 2.3). All share today's arrangement (canvas or desk above, modules and the clip editor below, an empty `Tools` strip), differing in what is in front or how space is split:

| Screenset | Derived from | Dockers |
| --- | --- | --- |
| **Canvas** | today's canvas view (`workspaceView = canvas`) | `Canvas` [canvas] weight 0.6 over a row: `Detail` [module-detail, clip-editor] flexible, `Tools` [] 30rem |
| **Desk** | today's desk view (`workspaceView = desk`) | the same, with `Canvas` replaced by `Desk` [desk] (the docker is named "Desk") |
| **Edit** | clip editing: a short canvas, a tall editor | `Canvas` [canvas] weight 0.3 over the same bottom row at weight 0.7 |
| *(Harmonic)* | proposal, not shipped now | arrives with the harmonic lab panels (no such panels exist yet); open item O2 |

`canvas` and `desk` are `keepMounted`, so flipping between **Canvas** and **Desk** keeps both alive exactly as today (the old toggle kept both mounted, page lines 687-723). **How the old toggle maps:** `ui.workspace-view` is retired: `desk` becomes active screenset **Desk**, `canvas` becomes **Canvas**; `ui.canvas-split` becomes the top weight in all three; `ui.detail-collapsed` becomes `collapsed: [Detail]` in all three. **How old projects migrate:** a project with none of the new key seeds the three screensets on first open from those three old keys (and the editor key, 2.3), nothing is lost, no history entries; the old keys stay in the project and are no longer read. Users add, rename, duplicate and delete their own screensets from the meta-tabs (5.4); a new one starts as a copy of the current one.

Data of **Canvas**:

```ts
{ version:2, id:'canvas', name:'Canvas', defaultDocker:'d2', lastDocker:{ chords:{docker:'d3', name:'Tools', index:0} },
  tree:{ kind:'split', dir:'column', children:[
    { weight:0.6, node:{ kind:'docker', id:'d1', name:'Canvas', tabs:['canvas'], active:'canvas' } },
    { weight:0.4, node:{ kind:'split', dir:'row', children:[
      { weight:1, node:{ kind:'docker', id:'d2', name:'Detail', tabs:['module-detail','clip-editor'], active:'clip-editor' } },
      { rem:30,   node:{ kind:'docker', id:'d3', name:'Tools',  tabs:[], active:null } } ] } } ] } }
```

```
Page (AppShell.Main) -> compositionWorkspace grid
├─ inspectorColumn           REGION (CompositionInspector)
├─ Stage (the centre)        the active screenset's tree (above)
└─ settingsColumn            REGION
Footer: [inspector toggle] ... [meta-tabs: Canvas | Desk | Edit | + ] ...
```

The empty `Tools` strip is visible by default (new chrome, O2).

### 8.2 Pieces

| Today | Becomes | Notes |
| --- | --- | --- |
| `SplitStage` divider and share (0.2 to 0.8) | the splitter between the two root children | weights, derived minimums (2.4). |
| collapse button | **Collapse** on the `Detail` docker's menu | parked (2.5), not display none; `selectCompositionModule` and `openClipEditor` call `show`, which expands it (today `setDetailCollapsed(false)`). |
| desk and canvas in one cell, the status-bar toggle | `canvas` and `desk` as `keepMounted` panels in the **Canvas** and **Desk** screensets, meta-tabs in the footer | 8.1. |
| `ClipEditorSlot` | the `clip-editor` panel | `endEditSession` and `onMissing` move to the session store (7.2). |
| the module list | `module-detail` (follower) and pinned `module:<id>` panels | 8.3. |
| the editor's Stage (W-25) | M5: unchanged, inside the `clip-editor` panel; M6: `clip-editor` and `chords` panels in the page Stage | `editorStage.ts` removed in M6. |
| canvas takeover | M5: a takeover slot rendered inside the `canvas` panel, the provider wrapping the Stage, `available` false while the canvas is not shown or `Detail` is collapsed; M6: removed (the picker is sent to any docker) | the slot context (`canvasTakeover.tsx`) must keep working in M5 because the editor still uses it. |
| left inspector, settings panel | stay regions | the Stage measures its own container beside them (W-24). |

### 8.3 Workbench modules: pin ships in this arc (M7), hybrid (decided)

Facts (page lines 326-333 and 742-940, verified): placed instances are persisted data (`compositionInstances`, generated ids); all stay mounted (the `hidden` attribute) because they publish outputs through `onOutputsChange`; the open target is exclusive (a clip open means `shownInstanceId` is null). The human asked for several instances at once (two Carter hexachord views, a subset combiner).

Decided (hybrid): **`module-detail` is the default follower panel**: it hosts the **selected, unpinned** module instance (and keeps unselected unpinned instances mounted hidden, exactly as the module list does today). The user can **pin** an instance into its own docker as a `module:<instanceId>` panel (a `multiple`, `keepMounted` kind, ids per 1.4). While pinned, the instance leaves `module-detail`'s list, which shows a short placeholder with an Unpin button if it is the selected one. Pin ids are project data (instance ids), so a screenset naming `module:<id>` is per project, which fits per-project storage; deleting the instance removes its tabs from every screenset (`reconcile`, 1.4). The registry is rebuilt as instances change and the ids exist before the screensets are parsed (1.4).

Mechanism and cost: a pinned instance's React element **remounts** when it moves between `module-detail` and its own panel (a React subtree cannot change parent without remounting; research item). Module hooks read persisted state once at mount (page comment, line 228), so persisted state returns; anything unpersisted is lost, and outputs are re-published through `onOutputsChange` on mount. Accepted for M7; the alternative (instances always rendered as `module:<id>` panels and `module-detail` adopting the selected one's host) avoids the remount at the price of a new "follow another panel's host" Stage concept, and is the fallback if the remount proves unacceptable (unverified: whether any module has unpersisted state that matters). `ModuleInspectorContent` only portals the active module's setup controls (`ModuleActiveContext`, `ModuleHost.tsx`), so a pinned but unselected module's controls are not in the inspector: clicking a pinned panel selects it (7.2), which brings them in.

### 8.4 Clip editor and modules in one docker: consequences and edge cases

Today the bottom pane shows exactly one of: the open module, the open clip's editor, a blank floor. `Detail` holds `module-detail` and `clip-editor`; `selectCompositionModule` calls `show('module-detail')`, `openClipEditor` calls `show('clip-editor')`, both expand a collapsed docker.

- **The tabs duplicate the exclusive target** (`editorClipTarget` versus the active module, page lines 326-333): a tab click calls `show` only and does not change the target.
- **Clicking "Modules" while a clip is open shows a blank module panel**, and "Clip editor" while a module is open shows the blank floor: today's blank placeholders, now reachable by a click.
- **If they are in different dockers**, both are visible and one is always blank.
- **Tab click on "Modules" while a clip is open with the Chords tool on:** the picker stays open (in `Tools`, claim unchanged), the roll is parked and invisible. The clip editor's `ChordTarget.visible()` reports false (`isShown('clip-editor')`), the W-20 keys are not captured while it is false, the claim is kept (no tool change, no promotion), and clicking back on "Clip editor" restores everything.
- Chrome appears where there was none (Plain-language notes).

### 8.5 Existing keys, and how each migrates (per project versus per viewer)

| Key | Scope | Today | After |
| --- | --- | --- | --- |
| `hrifa.composition-workbench.ui.canvas-split.v1` | project (W-10, prefix) | split share | seeds the top weight of the default screensets once; then unread |
| `...ui.detail-collapsed.v1` | project | bottom collapsed | seeds `collapsed: [Detail]`; then unread |
| `...ui.workspace-view.v1` | project | `canvas` or `desk` | seeds the active screenset (`Canvas` or `Desk`); retired |
| `...ui.editor-clip-target.v1`, `active-composition-module.v1`, `inspector-target.v1`, `inspector-open.v1`, `settings-open.v1` | project | selection and region state | unchanged |
| **new** `hrifa.composition-workbench.ui.screensets.v1` | **project** | n/a | the `ScreensetStore` (screensets, order, active, each with `lastDocker`); added to `unrecordedStateKeys` |
| `hrifa.stage.layout.workbench-editor.v1` | per viewer | the editor Stage's layout | read once to seed the default screensets of each project (2.3); never rewritten or deleted; M6 stops reading it |
| `hrifa.note-editor.v1` `chordHost`, `chordDockWidth` | per viewer (W-10) | dock or takeover; dock width | seeded once into `lastDocker.chords` and the `Tools` docker's width at M5 (2.3), with a one-time upgrade in M6 for stores that have no `chords` place; the key is left in place until it is retired |
| `hrifa.stage.layout.v1`, `hrifa.stage.presets.v1` | per viewer | the old `/stage` spike | untouched (old spike); the new tree spike uses `hrifa.stage.screensets.spike.v1` |
| optional `hrifa.stage.screenset-templates.v1` | per viewer | n/a | the user's template library, if O1 adopts it |

## 9. Decisions and open items

### 9.1 Decisions made

| # | Decision | Where used |
| --- | --- | --- |
| D1 | Build our own layout: a split tree with named leaf dockers on the existing Stage core; no library. | 2 |
| D2 | Vocabulary: docker, panel, split, screenset, meta-tab, place. | Vocabulary |
| D3 | Named dockers persist when emptied (thin labelled strip that accepts drops); only an explicit remove deletes one. Replaces the pre-decision "closing the last tab releases the group". | 2.1, 4.1 |
| D4 | Send-to targets dockers by name plus "New docker..." with a direction. A remembered place stores **both docker id and docker name** plus tab index; resolve by id, then name, then the panel's home docker, then a default docker. | 3, 5 |
| D5 | Screensets (saved named workspaces) are in scope and **per project**: stored with the project like `ui.canvas-split` (W-10 prefix `hrifa.composition-workbench.`), unrecorded in history; each project has an active screenset and a list; users add, rename, duplicate, delete; the app ships defaults. Which docker flexes, what may be hidden and what can be closed are user and screenset choices, not per-panel flags. `lastDocker` lives in the project's screenset. | 2.1, 8.1 |
| D6 | Screensets appear as **meta-tabs** at the bottom, replacing the canvas and desk view tabs; `ui.workspace-view` is retired and maps onto the Canvas and Desk default screensets. | 5.4, 8.1 |
| D7 | Menu first, then drag-to-dock (centre joins, edges split, shield, same-docker no-op); both call `sendTo`. | 5 |
| D8 | Pop-out stays deferred (a stretch after M8); the format does not preclude it. | 6 |
| D9 | Keyboard: select a docker by shortcut, then arrows between its tabs, manual activation; docker = labelled region. | 4.4 |
| D10 | Page-level sessions through an owned wrapper, no React key above the Stage; the chord session is a separate page store; the picker follows the active chord target (claim and release, last claim wins; lifetime = open item); ChordSession owns `hoverCell`, `hoverBlocked` and audition; the ChordSession is the only caller of `open`/`close('chords')`. | 7.2 |
| D11 | Single instances for the clip editor and chord picker; a per-panel `multiple` option; ids `<kind>:<instanceKey>`. | 1.4 |
| D12 | **Pin ships in this arc (M7):** `module-detail` follower plus pin to its own docker as `module:<instanceId>`; ids exist before parse; the registry is rebuilt as instances change. | 8.3 |
| D13 | "Show this panel" is a Stage function (`useStageApi`), not a general channel (Q4); clip editor and modules share a docker by default (Q8); inactive tabs laid out but invisible (Q10); picker follows the Stage size class (Q12); tabs make "home with no space" safe (Q14); selection is a read-only chain (Q17); takeover migrates to an own docker (Q19); the picker's own Close becomes Clear (Q21). | 7.4, 8 |
| D14 | `src/components/Stage/stageOps.ts` and `registry.ts` join M2's lock (Q24). | 10 |
| D15 | **Milestone order (10.1):** new tree Stage built beside the old Stage; the page moves in M5 with the editor's v1 Stage inside the clip editor panel; independent panels in M6; pin and screenset polish in M7. | 10 |

### 9.2 Still open (options, a recommendation, a consequence)

| # | Question | Options | Recommendation | Consequence of the other choice |
| --- | --- | --- | --- | --- |
| O1 | **A user template library across projects.** Screensets are per project; may the user keep a per-viewer list of screenset templates to reuse in other projects? | (a) none: copy only by duplicating within a project; (b) a per-viewer list (`hrifa.stage.screenset-templates.v1`, name plus tree, with `module:<id>` tabs and `lastDocker` stripped because they are project data), "Save as template" and "New from template"; (c) export and import a JSON file. | (b), after M7, small. | (a) means rebuilding a favourite arrangement in every project; (c) is explicit but clunkier. A per-viewer list is per viewer by W-10, since it is not project data. |
| O2 | **Default screenset contents.** | The three in 8.1 (Canvas, Desk, Edit) now, with Harmonic later; or four now with a guessed Harmonic. | Ship Canvas, Desk, Edit; add Harmonic when the lab panels exist. | A guessed Harmonic bakes in an arrangement for panels that do not exist; the empty visible `Tools` strip in each is the price of persistent named dockers (D3). |
| O3 (ANSWERED 2026-11-14: option (b), ordinary panel; the tool or hotkey forces it into view) | **`transient` panels** (the chord picker): openness is owned by its host claim and never saved (3.6). | (a) transient as proposed; (b) the picker is an ordinary panel the user opens and closes freely, with the tool following it. | (a): tool and layout cannot disagree. | (b) lets the picker stay open with the tool off, but then the picker would need an empty state and tool state must follow the layout; the Panels menu would list it. |
| O4 | **Docker naming defaults and Remove docker.** | Names: the panel's title at migration, "Docker N" for new ones, rename from the menu. Remove: close its tabs (places kept) with a plain confirmation; or move tabs to the default docker; or an undo. | Panel title and "Docker N"; Remove closes the tabs after a confirmation. Layout changes are not in history today; an undo would be a new mechanism, not proposed. | Moving tabs hides the user's decision; an undo notice needs that new mechanism. |
| O5 | **Narrow-window rule** (2.5). | Collapse far dockers to strips; show a single docker; or scroll (the old behaviour). | Collapse from the far end to strips, never the selected docker, with parking. | Scroll breaks the size classes; single-docker mode hides the arrangement. |
| O6 | **Docker-selection shortcut keys** (4.4). | F6 and Shift+F6 (VS Code; the browser also uses F6 for its address bar: whether a page can take it is unverified); Ctrl+Alt+digit (AltGr conflict on some layouts); a "Go to docker" list; Alt+digit (taken by the spike's presets). | F6 cycling if the browser lets the page have it, with the "Go to docker" list as the always-available route; digits after testing. | A shortcut the browser steals is a dead feature; the list is slower but always works. |
| O7 | **Plain-language items the human has not yet seen:** the command names (Q16) and the chrome (Q18). | Accept the names in the Plain-language notes and the chrome as described, review the look at the M5 checkpoint. | Accept. | A chrome-less default hides the strip that holds Send-to and tabs; other names are a rename in M3. |

## 10. Milestone outline, locks, DECISIONS rows, backlog mapping

### 10.1 Milestones (the human's order)

The **old Stage** (`src/components/Stage/`, `Stage.tsx`, `Slot.tsx`, `Splitter.tsx`, `persistence.ts`, `index.ts`, `stage.module.css`) and `NoteClipEditor.stage.test.tsx` stay **untouched and green until M6**. The new tree component is a **separate folder beside it**, `src/components/Stage/dock/` (exports from `dock/index.ts`; the old `index.ts` is not edited). The folder sits under `src/components/Stage/`, so `check:stage`'s globs already cover it and `package.json` is not touched (if a glob proves not to match, `package.json` needs a lock to widen it).

**Shared with the old Stage, imported unchanged:** `Splitter.tsx`, `icons.tsx`, `sizeState.ts` (`withMeasure`), the `StageStorage` type and `browserStorage` from `persistence.ts`, `InspectorKit` (`KitScope`, `Strip`, `StripTool`), `src/lib/stage/size.ts` and `splitters.ts`, and the pure functions added to `stageOps.ts`/`registry.ts` in M2 (additive; existing exports unchanged). **Duplicated in `dock/` on purpose:** the host and portal mechanism and focus memo from `Stage.tsx`/`Slot.tsx` (so `keepMounted` and parking can change them: the old host-drop effect, `Stage.tsx` lines 129-138, and the portal list, lines 371-378, are duplicated and **changed** in `dock/`), and the CSS tokens (`dock.module.css`, since CSS-module classes are not shared across components).

| Milestone | Scope | Files | Locks | DECISIONS rows |
| --- | --- | --- | --- | --- |
| **M2** Pure core | tree types and normalisation (incl. the merge rule), docker operations (`sendTo`, `openPanel`, `closePanel`, reorder, rename, remove, collapse, weights), `reconcile`, `Screenset` and `ScreensetStore` with parse and serialise, the solver with minimums and the narrow rule, `layoutV1ToScreenset`, `LayoutV1` alias, the `PanelMeta` fields; additive pure rules in `stageOps.ts` (docker minimums, `guarded` for trees) and `registry.ts` (new meta fields passed through; the old `createStageRegistry` unchanged for the old Stage). No React. | `src/lib/stage/` (new `tree.ts`, `screenset.ts`, `solve.ts`, `migrate.ts`, `registry.ts` edit, tests), `src/components/Stage/stageOps.ts`, `src/components/Stage/registry.ts` | `src/lib/stage/`, the two files in `src/components/Stage/` | v2 screenset format supersedes STAGE-5, STAGE-15 and the visible-prefix part of STAGE-8; named persistent dockers replace the "closing the last tab releases the group" pre-decision; vocabulary (docker, panel, screenset); place by id and name; per-project screenset storage under `hrifa.composition-workbench.` (changes the ARC persistence parameter) |
| **M3** (ARC splits it into M3a: render, dockers, tabs, Send-to, parking, `useStageApi`; and M3c: keyboard, Panels menu, dynamic registry, meta-tab skeleton) Tree Stage component | `dock/`: render the tree, docker strips and tabs, Send-to and docker menus, empty-docker strips, parking (changes to the host-drop and portal list as above), `keepMounted`, keyboard (docker selection, manual tabs), `useStageApi`, the **dynamic registry** (rebuilt as instances change, 1.4), scroll restore tied to parking, the screenset meta-tab strip UI skeleton, the `Panels` menu; a new tree spike beside the old one. **Human checkpoint** (spike). | `src/components/Stage/dock/**` (new), `src/pages/stage/` (new `DockSpike.tsx` and files, reached from inside that folder; old spike untouched; `src/pages/Stage.page.tsx` is not touched) | `src/components/Stage/dock/`, `src/pages/stage/` | dockers and parking supersede STAGE-7's "hidden columns detached" and STAGE-8's switcher; the keyboard model; `useStageApi`; `keepMounted`, dynamic registry and `multiple` |
| **M3b** Drag-to-dock | drop overlay, shield, tab drag; calls `sendTo`. | `src/components/Stage/dock/**` | same | none beyond M3 |
| **M4** Sessions | `WorkbenchSessions.tsx` wrapper, `ClipEditorSession` and `ChordSession` stores, claim and release, `inputScope.ts`, panel commands, selection chain; `NoteClipEditor` uses them with no UI change; second consumer **in a test only**. | `src/pages/composition-workbench/**` (new `WorkbenchSessions.tsx`, `chordInput/ChordSession.ts`, `ClipEditorSession.ts`, `inputScope.ts`; edits to `NoteClipEditor.tsx`) | none (owned) | session boundary, claim lifetime, `hoverCell`/`hoverBlocked` and audition ownership, `data-chord-scope`, no key above the Stage |
| **M5** The page on the tree Stage | the page runs on `dock/`: `canvas`, `desk`, `clip-editor` (still containing its own v1 editor Stage with roll and chords, unchanged) and `module-detail` in dockers; **replaces `SplitStage` and `ClipEditorSlot`**; the takeover slot moves into the `canvas` panel; footer meta-tabs replace the canvas and desk toggle; the project's `ui.screensets.v1` key, default screensets, seeding of old keys; `unrecordedStateKeys` updated. **Human checkpoint** (look, chrome, flipping screensets). | `src/pages/CompositionWorkbench.page.tsx`, owned workbench files (`usePersistentState.ts`, `WorkbenchStatusBar.tsx`, new `workbenchStage.ts`, `workbenchScreensets.ts`), `shell/ARCHITECTURE.md` | `src/pages/CompositionWorkbench.page.tsx`, `shell/ARCHITECTURE.md` (a row in `arcs/LOCKS.md`) | key moves (per-project screensets, retired `ui.workspace-view`); `SplitStage` and `ClipEditorSlot` replaced |
| **M6** Independent panels | the piano roll (clip editor) and chord picker become independent panels; the editor's v1 Stage and the **canvas takeover are removed**, superseding W-16 and W-25; `chordHost` and `chordDockWidth` and the editor key migrate. Tests retired or rewritten (the human is told which): `NoteClipEditor.stage.test.tsx` and `editorStage.test.ts` (the editor Stage), the takeover cases in `ChordPickerHost.test.tsx`, `ChordPicker.test.tsx` and `NoteClipEditor.chords.test.tsx`, and `SplitStage.test.tsx` (already retired at M5); the behaviour they guard (chord picker survives moves, layout restores) is re-asserted against the panels. | owned workbench files; `src/pages/CompositionWorkbench.page.tsx` | entry file (if touched) | W-16 and W-25 superseded; key moves |
| **M7** Pin and screenset polish | pin a module into its own docker (`module:<instanceId>`), reconcile on delete, rename/duplicate/delete UI, defaults polish, the template library if O1 says so. | owned workbench files; `dock/` as needed | `src/components/Stage/dock/`; `src/components/InspectorKit/` only if the kit needs a change | pin ids and registry rebuild |
| **M8** Close-out | docs; decide whether the old Stage and old spike are removed (needs the human's OK: the old Stage has no consumer after M6 except the old spike); `shell/ARCHITECTURE.md` final; locks released. | docs | `shell/ARCHITECTURE.md` | none |
| **M9** (stretch) Pop-out | section 6 | `dock/`, screenset | on the human's go-ahead | relaxes STAGE-3 |

`check:workbench` and `check:stage` run at each milestone, once, before the commit; `check:hfl` before committing M2, M3, M3b and M7 (the lab consumes shared components).

### 10.2 Backlog mapping

| Item (tag, short name) | Mapped to |
| --- | --- |
| [stage] Debounce layout saves | M3 (the new component debounces drag writes before calling the page's `update`) and M5 (the page writes the screenset store with `usePersistentState`) |
| [stage] Restore scroll position across a reparent | M3, tied to parking (2.5): park in place where possible, else capture and restore `scrollTop` and `scrollLeft` |
| [stage] Where selection and project state live | M4 (selection chain, 7.4; project state stays in the desk and page) |
| [stage] The inspector is outside the Stage's width model | Deferred: the inspector stays a region (arc non-goal); the Stage measures its own container (already true since W-24) |
| [stage] Presets are implicit snapshots | Superseded in part: per-project screensets (M2 core, M3 skeleton, M5 page). The spike's presets keep working unchanged. |
| [stage] Modules cannot influence slot heights | Deferred: docker weights do not solve it; revisit if the roll needs "one row" sizing |
| [stage] Alt+digit is a window listener in `StageApp` | Deferred (spike only); the docker shortcuts (O6) must not clash with it |
| [stage] Mantine controls leak their own sizes into the kit | M3: apply the same check to the Send-to menu button and the tab buttons |
| [stage] Modules need a command channel | M3 (Stage functions via `useStageApi`: open, show, close, sendTo, isOpen, isShown) and M4 (panel commands `reveal`, `clearAnchor`, `focus` on the sessions), per 5.5 and 7.3 |
| [stage] One selection model with a parent chain | M4 |
| [stage] A shared time-to-pixel mapping | Deferred: needs the canvas time axis, not needed by this arc (unified roll with clips is a separate arc) |
| [workbench] Unified roll with clips | Deferred: separate arc (the human's note: needs workbench and `PianoRoll` work, not Stage) |
| [workbench] Adopt step 1: chord dock and canvas takeover | M6 (the takeover is removed and the picker is a panel; `chordHost` and `chordDockWidth` migrate, 2.3 and 8.5) |
| [workbench] Adopt step 2: `SplitStage` | M5 |
| [workbench] Adopt step 3: `ClipEditorSlot` and the inspector on the kit | `ClipEditorSlot`: M5. Inspector on the kit: deferred (arc non-goal) |
| [workbench] Canvas takeover and `SplitStage` as Stage slots | M5 (`SplitStage`; the takeover slot moves into the canvas panel) and M6 (takeover removed) |
| [workbench] Lift the chord session out of `NoteClipEditor`, make the roll its own panel | M4 (the two page-level stores), M6 (independent panels) |
| [shared] Promote the Stage component and kit to `src/components/` | Already done (W-23); no action |
| [shared] Remove the `/stage` spike page | Deferred: the spike stays as the test bed (ARC non-goal); decide at M7 |
| [shared] Stage rows and a "Send to" menu | M2 (tree, `sendTo`, `Target`), M3 (menu), M3b (drag to dock) |
| [shared] Stage: hidden-columns switcher in the component | M3 (collapsed and narrow-hidden dockers are strips; the `Panels` menu and docker list) |
| [shared] Stage: choose which column fills the spare width, never hide the roll | Superseded by D5: which docker flexes is screenset data (M2) with a menu item (M3); "never hidden" is replaced by parking (2.5), no per-panel flag |
| [shared] Stage: per-module non-closable flag | Superseded by D5: any panel can be closed; `keepMounted` (M2 meta, M3 behaviour) covers panels that must keep running |
| [shared] Stage: restore roll scroll across a move | M3 (see "restore scroll") |
| [workbench] Picker size-class rendering | M6 (D13: the picker follows the Stage size class; the switch moves from the 720px container query, 45rem, to the 30rem of `regular`) |
| [workbench] Remove the legacy `chordDockWidth` preference after the migration window | Deferred to M7 as a new backlog item (keep reading it through M6) |
| [workbench] Throttle layout saves while dragging | M3 (as the first row) |
| [workbench] Picker's own header close versus the strip close | M6 (D13: the picker's own Close becomes Clear) |
| [workbench] Stale code comment in `clipTypes.ts` (`onChordAnchor` pitch) | M4, if the milestone edits `clipTypes.ts` for `ChordTarget.onAnchor`; otherwise unchanged |
| [workbench] Chord picker polish (second note editor sharing the takeover slot) | Resolved by M6: the takeover slot is gone; one clip editor session at a time |
| [workbench] Code hygiene: `selectionRef` assigned during render | M4 (the clip editor session store replaces the ref) |
| [workbench] Escape / Enter scoping: `pointerInside` can stay true after alt-tab | M4: `pointerInside` moves to the shared scope helper `inputScope.ts` and is reset on window `blur` (7.2) |
| [workbench] Pointer tracker: lifting one of two touch points clears the "held" flag | M4: the tracker (`NoteClipEditor.tsx` lines 573-600) moves to `inputScope.ts`; fix only if cheap, else keep as an open item |
| [workbench] Bring Melodicization and Mixer onto the new roll conventions | Deferred (not part of this arc) |
| [shared] Roll edge: `reveal` only correct in the detached roll | Deferred (no effect today) |
| [harmonic-field-lab] Adopt the kit only | Not this arc |
| [shared] Per-project screensets and meta-tabs (new, from the checkpoint) | M2 (store, validation), M3 (meta-tab strip skeleton), M5 (the page), M7 (polish, templates) |
| [shared] Drag to drop zones | M3b |

New backlog items at close-out (M8): remove `chordDockWidth`; the follower-host alternative to the pin remount; a Harmonic screenset; the drop system for pickers and generators (Direction); the user template library if not built; pop-out.

## Direction, not in this arc

The human's wider vision: pickers and generators **produce payloads** (a chord as pitch classes, a set of notes, a gesture curve) that can be **dragged onto targets**: a list in a module, a velocity lane, a rhythm list (a curve scaling durations); a curve may become an automation lane or written, generated data. This arc builds no drop system and must not preclude one: `ChordTarget` (claim, `insert`, `noteAt`) is the first narrow instance of "something that accepts a payload"; the drag code (5.3) already turns a pointer drop into a typed `Target` and a data operation; panels never assume what they are dropped into. A later arc can generalise `ChordTarget` into payload targets and reuse the drop overlay for payloads. Capture as a backlog item.

## 11. Could not verify (read the code, but not tested or not read)

- Parking (2.5): that a box kept at the last measured size, `opacity: 0`, `inert`, keeps `ResizeObserver` quiet and the canvas from refitting; parking in place versus a Stage-root parking box; scroll restore after parking. The page's `inactiveViewStyle` is verified; the parking box is new.
- That unmounting a non-`keepMounted` panel on a screenset switch loses nothing that matters (canvas and desk are `keepMounted`; the clip editor's state is in the session store; other panels were not checked).
- The remount on pin and unpin (8.3): whether any module has unpersisted state that matters; whether `onOutputsChange` on remount causes a visible flicker in other modules.
- F6 and other shortcuts in browsers (O6); Mantine `Menu` keyboard behaviour; the ARIA tabs pattern is from the research file, not re-read.
- That the W-20 keys, Esc and audition work from page-level stores with the roll parked, and that the hover-ownership change keeps ghosts in sync; read from the code, not run.
- That every key under `hrifa.composition-workbench.` is copied by project save and open exactly as for the other ui keys (read from `projects.ts` lines 41, 77, 307, 359; not run), and that a project saved before this change opens with the seeded screensets and writes no history entries (the key is unrecorded; not run).
- The piano roll's `view` fields (whether vertical scroll is in state); `CompositionCanvas` and `DeskView` internals beyond the page comment; the Stage tests' use of tool labels and of `version: 1` literals.
- That `check:stage`'s globs cover `src/components/Stage/dock/` (they name `src/components/Stage/**`, `package.json` line 21; the vitest scope of the script was not read).
- The text of W-20 and W-25 in `DECISIONS.md` beyond their first columns; the behaviour list in 7.6 is from the code. Test files named in 10.1 were identified by `grep` for "takeover" and by name, not read in full.
- Drag on touch devices; `window.open` pop-out drawbacks (general knowledge).
- That the Chords tool resets on a clip switch: read from the code (`tool` is `useState` in a body keyed by clip id), not run.

