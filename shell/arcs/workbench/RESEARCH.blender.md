# Research: what the workbench can take from Blender (2026-11-23)

**Status: research note, no decisions.** Written at the human's request after they read the Blender manual: "I particularly like their method to move 'areas' around and split, expand, swap etc. I also like the inspector with its inline folding menus ... I'm looking at things like their collections as a way for us to have the same storage for a rhythm + pitch + voicing etc. The timeline, graph editor, and NLA editor also look like great resources as we work on the meta lanes and header bars." And on the data-block page: "just this page alone helps answer so many of the ideas that have been floating around. data block menu and assignment also look really promising."

**Source.** docs.blender.org refuses automated fetches (HTTP 403), so the pages were read from the manual's reStructuredText source at `https://projects.blender.org/blender/blender-manual/raw/branch/main/manual/<path>.rst` (branch `main`, read 2026-11-23). The published page for a source path is `https://docs.blender.org/manual/en/latest/<path>.html`. Pages read are listed at the end.

**Labels.** **(manual)**: stated on a page read in this session. **(judgement)**: the researcher's opinion about Hrifa. Hrifa facts come from `src/pages/composition-workbench/ARCHITECTURE.md` ("The desk"), `arcs/workbench/ARC.md` (Timeline draft), `PROPOSAL.derivation-graph.md` and `DESIGN.one-stage.md`.

## Summary: adopt, adapt, skip

| Blender idea | Hrifa target | Verdict (judgement) |
|---|---|---|
| Data-blocks with a user count; click the count to make a single-user copy | Desk clips used by Make source modules, Timeline blocks and derivation inputs | **Adopt.** Answers Timeline T0 "reference or copy, and make unique". |
| Data-block menu (type icon, browse with previews, name, user count, shield, new, unlink, Shift-unlink deletes) and the select-only Data ID field | One shared clip selector for every place that points at a clip | **Adopt.** The biggest single reusable piece. |
| Type-filtered pickers (a slot list shows only slots whose type matches) | Clip lists filtered by what the input accepts (`clipTypeOf`, `acceptsPacket`) | **Adopt.** |
| Remap Users (replace a data-block everywhere it is used) | "Replace everywhere" for a clip | **Adopt**, with the count shown first. |
| Zero-user data is dropped on save; the shield keeps it | Desk | **Skip the automatic part.** The desk is material the composer chose to keep. Adapt only an "Unused" filter plus a manual Purge. |
| Collections (group, one object in many) and collection instances (place a whole group as one) | Bundles: rhythm + pitch set + voicing kept and placed together | **Adapt** (references, with role names). |
| Action slots (one action holds named parts, each with a type) | Same need, seen from the other side | **Adapt** for a module that produces several parts at once. |
| Library overrides (local edits on linked data; unedited properties keep following the library) | Derived clips and realizations | **Consider, do not adopt yet.** It is the opposite of the derivation proposal's "pin and flag, never auto-follow"; see section 4. |
| NLA: strips reference actions; Tweak mode (Tab) edits the referenced action in place; crop, repeat, scale, reverse, extrapolation, blend and influence, mute, solo, lock, meta strips | Timeline blocks and realizations | **Adopt the model** for T0 scenarios. |
| Markers shared by every time editor; pose markers local to an action | Meta lane sections; cue points inside a clip | **Adopt.** |
| F-curve modifier stack (mute, influence, restricted range with blend in and out; Cycles, Noise, Generator, Stepped) | Curve-type meta lanes (tempo, density, register) | **Adapt** later. |
| Dope Sheet summary row with expandable channels | Header bars over lane groups | **Adapt.** |
| Area split, join, swap, replace; Ctrl+Space Maximize; Ctrl+Alt+Space Focus Mode | Dock Stage | **Adopt** swap, join, Maximize, Focus. **Skip** floating windows (STAGE-3). |
| Workspaces as tabs at the top; duplicate, reorder, templates; per-workspace settings | Screensets | **Adopt** the placement and the menu (a look change: human first). |
| Panels: fold by click, Ctrl+click accordion, drag over headers, grip to reorder, pin, presets | InspectorKit sections | **Adopt.** |
| Properties editor: context path breadcrumb, Pin ID, display filter (Ctrl+F), visible tabs per workspace | Inspector and reference panels | **Adopt** the breadcrumb, the pin and the filter. |
| Adjust Last Operation (change the options of the operation you just ran) | Operations with options (x2, invert, affine) | **Adopt.** |

## 1. Data-blocks and the desk

**What Blender does (manual, `files/data_blocks`).**
- "The base unit for any Blender project is the data-block." Data-blocks "can reference each other, for reuse and instancing", names are unique per type, and "not all data in Blender is a data-block" (bones belong to an armature, strips to a scene).
- **Users.** "Every data-block has its usage counted (reference count), when there is more than one, you can see the number of current users ... to the right of its name." Sharing examples: "Sharing meshes between objects (instances)", "Sharing animated actions between objects, for example to make all the lights dim together."
- **Make single user.** "Click on the user count button to the right of its name. This will duplicate that data-block and assign the newly created copy to that usage only."
- **Life time.** Zero-user data-blocks are skipped when the file is written. The shield ("fake user", now called Protected) keeps one anyway.
- **Unlink versus delete.** Unlink (the X) means "its user won't use it anymore". Delete (Shift-click the X) "directly erases it from the blend-file, automatically unlinking it from all of its users". Warning: deleting object data also deletes the objects that use it.
- **Hidden data.** Names starting with `.` are hidden from most pickers: "commonly used for internal, temporary, or helper data", still counted and saved.
- **Outliner views (manual, `editors/outliner/interface`).** "Blender File" lists all data with a user count; "Unused Data" lists data with no users; Purge removes them, optionally recursively ("data-blocks only used by unused data-blocks").

**What Hrifa has.** A desk clip (`Snippet`) is already a data-block in all but name: an id, a name, a packet of any kind, an `origin` and a `lineage` with `derivedFrom`. Make source places a clip on the canvas **by reference** (`snippetId`); if the clip is deleted the module publishes nothing and receivers show a missing source. Duplicate as variation is a full copy that shares nothing (Blender's plain duplicate). What is missing: nobody can see **who uses a clip**, there is no "make this use its own copy", and deleting a used clip does not say what will break.

**Proposal (judgement).**
1. **Users are computed, never stored.** A clip's users are the places that reference its id: Make source instances today; Timeline blocks and derivation inputs later. A pure function `clipUsers(id)` over project state returns them with a label for each.
2. **Show the count wherever a clip is named** (desk card, clip selector, inspector header) when it is above 1, as Blender does.
3. **Click the count: Make unique.** It duplicates the clip (`derivedFrom` set, as today's Duplicate) and points only *this* user at the copy. This is the T0 "make unique" answer, with Blender's precedent and gesture.
4. **Delete says what it breaks.** The desk's two-click delete lists the users ("Used by 3: Ring A (canvas), bar 9 (timeline), Fit 2 (input 'chord')"). Unlink (remove from one user) and Delete (remove the clip) stay separate actions.
5. **No automatic cleanup.** The desk is a keep list, so the shield is implicit for every desk clip. Material that is not on the desk (derived snapshots, realization caches, if those are ever stored) is the "hidden data" case: kept and counted but not listed unless a "Show hidden" filter is on. An **Unused** filter on the desk plus a manual Purge covers the rest.

## 2. The data-block menu and assignment

**What Blender does (manual, `interface/controls/templates/data_block`).** The data-block menu "lets you select a data-block (such as a material) in order to link it to something else (such as an object)". Its parts:
- **Type icon**: opens the list; "dragging the image lets you apply the data-block to something else" (drag a material onto an object to assign it; dropping onto ID fields also works).
- **List**: the data-blocks of that type, with preview images, a search field and state icons (linked, override, asset).
- **Name**: rename in place.
- **User count**: shown above 1; "clicking it will create a single-user copy" ("the object would receive its very own copy of the material, which can be modified independently of the original that's still used by the other two").
- **Shield** (fake user), **New** ("creates a new data-block (or duplicates the current one) and selects it"), **X** unlink, **Shift-X** "set the users to zero allowing the data to be fully deleted".
- **Data ID field**: the select-only variant, "only for selecting (and not for other features like creating new data or managing users)": a type icon, a name field that searches ("press Tab to auto-complete"), a list, sometimes an eyedropper, and an X to clear. **ID sub-data**: after picking an armature, a second field picks one of its bones.
- **Assignment and filtering (manual, `animation/actions`).** An animated data-block picks an action *and* a slot; "Blender limits that dropdown to the slots with an associated type that matches the data-block". **Replace Action** swaps an action on the objects directly using it; **Remap Users** "will replace the usage on *all* users ... Use with caution."

**Proposal (judgement): one shared `ClipSelector` component.**
- Parts: clip-type icon (drag it onto a target to assign), the list with `SnippetPreview` thumbnails and search, the name (rename), the user count (click: Make unique), New (a blank clip of the accepted type, or duplicate the current one), and X (unlink). Shift on X deletes only after the confirm from 1.4.
- A **select-only** variant (Blender's Data ID) for inputs: a realization's "pitch source" and "rhythm source", a derivation input's role ("chord", "span"), Make source's clip. The list is **filtered by what the input accepts** (`clipTypeOf`, `acceptsPacket`, `signalTypes.ts`), the way slot lists are filtered by type.
- **Sub-data field**: after a clip, an optional second field picks a version (the lineage already stores versions), which is the derivation proposal's "pinned to a version".
- **Swap in place**: Make source gets this selector in its header, so changing which clip it plays no longer means deleting and re-adding the module.
- **Replace everywhere** (Remap Users) as a desk card action, showing the user list first.
- It belongs in `src/components/` only if it stays free of workbench types (the `src/components` rule); otherwise in the workbench page folder with a pure core.

## 3. Grouping: collections, collection instances and action slots

**What Blender does.**
- **Collections (manual, `scene_layout/collections/collections`).** "Objects can be grouped together without any kind of transformation relationship ... Objects can belong to one or multiple collections." Move to Collection (M) versus Link to Collection (Shift-M, "without removing them from their existing collections").
- **Collection instances (manual, `scene_layout/object/properties/instancing/collection`).** Add a Collection Instance: an empty object shows the whole collection; duplicate the empty for more copies. "Make Instances Real" converts an instance into regular objects you can edit.
- **Action slots (manual, `animation/actions`).** "The Action name describes the animation, the Slot names describe the subjects of that animation." One action can hold an object's animation and its material's animation; each slot has a name and an associated type, and a user picks action + slot.

**What Hrifa needs.** The human: "the same storage for a rhythm + pitch + voicing". The derivation proposal already records `inputs: [{ role, clip, version, pick }]`; a Timeline realization needs a pitch source and a rhythm source.

**Proposal (judgement).**
- **A bundle is a collection, not a container of copies.** A bundle is a named list of `{ role, clipId, version? }` entries: "rhythm", "pitch set", "voicing". The parts stay desk clips with their own user counts, so one rhythm can sit in three bundles (Blender's Link to Collection).
- **The bundle record and the derivation record are the same shape.** A realization's inputs are a bundle; a derived clip's recipe names a bundle of inputs. Designing them together saves a second schema.
- **Placing a bundle** on the timeline places one block (a collection instance) that realizes from its roles. **Make real** splits it into separate blocks, each still referencing the same clips.
- **Slots** fit the other direction: a module that produces several parts at once (Interval Placement: a pitch set plus its hung tones) could publish one clip with typed parts. Recommendation: start with collection-style bundles only, and add slots if a producer needs them.

## 4. Linking and library overrides: an alternative to "pin and flag"

**What Blender does (manual, `files/linked_libraries/library_overrides`).** Overrides allow "editing linked data, while keeping it in sync with the original library data ... When the library data changes, unmodified properties of the overridden one will be updated accordingly." Several independent overrides of one source can coexist.

**Hrifa today.** The derivation proposal says "pin and flag, never auto-follow": when an input changes, the child keeps its pitches and shows "source changed" with Rebuild from latest. The workbench rule is "do not silently reinterpret".

**Judgement.** Overrides work per *property*, not per result. A middle path worth putting to the human as a scenario: a realization's **parameters** could follow a source preset except where edited locally (an override), while its **output** stays pinned and flagged. Do not adopt without a T0 row showing a case where the two give different results.

## 5. The NLA editor and the Timeline arc

**What Blender does (manual, `editors/nla/*`, `animation/actions`).**
- "Tracks ... work like layers in an image editing program. Higher tracks take precedence over lower ones, although you can also choose to blend them." Each track holds strips, "typically Action Strips, which are instances of actions."
- "**Multiple strips can reference the same action**, so that you can potentially change multiple parts of the animation by editing a single set of keyframes."
- **Action Track** (top, orange): the material being edited now. **Push Down** turns it into a strip on a new track and leaves the Action Track empty.
- **Tweak Mode** (Tab on a strip): edits that strip's action in place; the strip is shown both in its track and in the Action Track. Its **Pin** toggle shows keys at the action's own times or at their mapped times in the strip.
- **Strip settings (Sidebar):** Frame Start and End (moving keeps the length; changing End crops or extends); Action Clip Start and End ("how much of the action to use"); Sync Length (refit to the action's keys when leaving Tweak Mode); Playback Scale; Repeat; Reversed; Cyclic Strip Time; **Extrapolation** Hold, Hold Forward ("the values at its last keyframe also apply to the later frames (up to the next strip)"), Nothing; **Blending** Replace, Combine, Add, Subtract, Multiply, with Influence (`result = mix(previous, previous (+-x) value, influence)`); Blend In and Out, Auto Blend; Animated Influence; Mute per strip.
- **Track controls:** Mute, Lock ("prevents changes"), Solo ("mutes all other tracks").
- **Strip types:** Action, Transition (interpolates between neighbors), Sound, Meta ("groups other strips together, letting you move, scale, and copy them as one combined unit").
- **View:** Sync Visible Range ("synchronizes the horizontal panning and scale ... with other time-based editors"), Set Preview Range (P), Show Local Markers, snapping to frame, second or nearest marker.

**What it answers in Timeline T0 (judgement).**
| T0 question | NLA answer to put to the human as a scenario |
|---|---|
| A block as a reference to its desk clip, or a copy, and "make unique" | Reference by default (many strips, one action), user count, Make unique from the count (section 1). |
| Pitch and rhythm blocks of different lengths or starts | **Extrapolation per block:** a pitch-set block with Hold Forward stays in force until the next pitch block, so a short chord block can govern a long rhythm block. Nothing means silence outside the block. |
| How a block uses part of a clip, or repeats it | Clip Start and End (crop), Repeat, Scale, Reversed live on the **block**, never on the clip. |
| How lanes combine | Precedence by lane order plus a blend mode. For pitch: Replace (the upper lane wins) or Add (transpose on top), with influence later. |
| Editing a block's material without leaving the arrangement | **Tweak mode:** double-click a block to edit its clip in the clip editor while the timeline shows where it sits; a Pin toggle shows clip time or timeline time. T2 already says "double-click a note block opens the clip editor". |
| Grouping blocks | Meta blocks (move, scale and copy as one). A placed bundle (section 3) may be the same thing. |
| What a lane owns | Mute, Solo, Lock per lane; Mute per block. |
| Bake | Close to Push Down in reverse: freeze a realization into a note clip, then the block references that clip. |

## 6. Markers and the meta lane

**What Blender does (manual, `animation/markers`).** Markers "denote frames with key points or significant events"; "a marker created in one of these editors will also appear in all others that support them." M adds, F2 renames, G or drag moves, Shift-D duplicates (names unchanged), Ctrl-B binds a camera so the marker switches the active camera at that frame. **Pose markers** belong to one action, not the scene, and show inside its NLA strip.

**Proposal (judgement).** The meta lane's first version (named sections) is timeline markers: shared by every time view (timeline, clip editor ruler). **Binding** is the model for pitch context per section (D4): a marker bound to a pitch context switches the EDO, key or scale from that point, as a camera marker switches cameras. Clip-local markers (pose markers) give cue points inside a clip that travel with it.

## 7. Graph Editor, Dope Sheet and header bars

**What Blender does.**
- **F-curve modifiers (manual, `editors/graph_editor/fcurves/modifiers`):** "non-destructive effects that can be adjusted at any time and layered", evaluated top to bottom and reordered by dragging; each has Mute, Delete, **Influence** and **Restrict Frame Range** with Blend In and Out. Types include Generator (polynomial), Cycles, Noise, Envelope, Stepped, Limits. NLA strips can carry modifiers that apply to all curves in the strip.
- **Dope Sheet (manual, `editors/dope_sheet/introduction`):** "a bird's-eye view of the keyframes"; a stack of channels with keys along time; key color and shape carry meaning (selected, keyframe type, handle type, held key as a gray bar).

**Proposal (judgement).**
- **Curve meta lanes** (tempo, density, register) are F-curves: points plus interpolation, then a small modifier stack with influence and a restricted range. Cycles and Stepped are the first useful ones musically.
- **Header bars** are the Dope Sheet's summary rows: one row per lane group that shows where anything happens, expanding into the lanes below. Use shape and color for meaning only (the theme rule).

## 8. Areas and the dock Stage

**What Blender does (manual, `interface/window_system/areas`).**
- Resize by dragging a border; **Ctrl snaps** to convenient sizes; **Shift moves aligned borders together**.
- From an area corner (cursor becomes a cross): drag into a neighbor to **join**; drag left or right, up or down to **split**; drag into the middle of another area to **replace** it; Esc or right-click cancels.
- **Right-click a border: Area Options**: Vertical or Horizontal Split (an indicator line, Tab flips direction), Join Up, Down, Left, Right, **Swap Areas**.
- **Swap contents:** Ctrl-drag from a corner to any area in the same window.
- **Toggle Maximize Area (Ctrl-Space):** fills the window "keeping only the editor's menu bar and status bar visible ... without changing your workspace layout"; return with the same key or a "Back to Previous" button in the top bar.
- **Focus Mode (Ctrl-Alt-Space):** also hides the top bar, status bar and the editor's secondary regions.
- Shortcuts depend on the area under the pointer.

**Hrifa today.** The dock Stage splits by dragging a tab to an edge zone, sends panels between dockers, resizes splitters, cycles focus, and has per-panel key scopes. It has no swap, join, Maximize or Focus.

**Proposal (judgement).**
- Add **Swap** and **Join** to the docker menu first (menus are easy to find); a corner gesture can come later.
- **Maximize** is a view state outside the screenset: never saved, Esc or the same key returns, and a "Back to previous" chip in the top bar. Check that the key does not clash on Windows (Ctrl-Space switches input methods on some keyboards).
- **Focus** is Maximize without the top bar and status bar.
- Splitter **Shift-drag moves aligned borders together** fits the Stage's split tree.
- **Skip** "Duplicate Area into New Window" and Shift-drag new windows: STAGE-3 says no floating windows.

## 9. Workspaces and screensets

**What Blender does (manual, `interface/window_system/workspaces`).** Workspace tabs sit in the top bar; double-click renames; + adds from templates; right-click: Duplicate, Delete (never the last), Reorder to Front or Back, Delete Other Workspaces; Ctrl-PageUp and Ctrl-PageDown cycle. Each workspace can remember a scene and a **mode** to switch to when activated, and can **filter add-ons**.

**Proposal (judgement).** Move screenset tabs from the status bar to the top (a look change: a thin slice for the human first). Add Duplicate, templates ("New from: Canvas, Desk, Edit, Arrange") and the cycle keys. "Mode when activated" maps to a screenset remembering a tool (for example the Edit screenset entering the clip editor's last tool).

## 10. Panels, the Properties editor and the inspector

**What Blender does.**
- **Panels (manual, `interface/window_system/tabs_panels`):** click a header to fold or unfold; A over a header toggles it; **Ctrl-click a collapsed header: expand it and collapse all others**; Ctrl-click an expanded header toggles its subpanels; **drag over headers to fold or unfold many at once**; drag the grip (`::::`) to reorder; **pin** a panel so it stays visible whichever tab is chosen (in the Sidebar, not the Properties editor); a **Presets** menu in the header stores and applies settings.
- **Tabs:** Ctrl-Wheel switches vertical tabs; Ctrl-Tab cycles.
- **Properties editor (manual, `editors/properties_editor`):** tabs follow context (scene, object, data, material); **Visible Tabs** hides tabs per workspace; **Display Filter (Ctrl-F)** searches properties by name, grays out the others and jumps to the first match's tab; a **Data Context Path** breadcrumb ("Cube (Object) > Mesh > Material"); **Toggle Pin ID** "lock[s] the editor to the current data-block, preventing it from changing when the selection updates".

**Proposal (judgement).**
- **InspectorKit sections fold**, with Blender's exact gestures (click, Ctrl-click accordion, drag across headers) and fold state per section id, remembered per viewer. These sections also become the inside of a module's full view.
- **Grip reorder** of sections uses `components/Sortable` (already the shell's drag layer).
- **Breadcrumb + pin** in the inspector header: "Clip *Ring A* > version 4 > note 12", and a pin that freezes it. The same pin is the "follow, with a pin" rule for reference panels.
- **Display filter** (Ctrl-F) in any inspector with many settings, such as the Harmonic Field Lab's.
- **Presets** in a section header for modules with many parameters.

## 11. Small things worth taking

- **Adjust Last Operation (manual, `editors/nla/introduction`):** "a pop-up panel to alter properties of the last completed operation." For the Timeline arc's "operations" (x2, invert, affine): run it at once with defaults, then adjust its options in place, as one undo step. Better than a dialog before running.
- **Sync Visible Range:** time views that opt in share panning and zoom (timeline and clip editor ruler).
- **Preview Range (P):** a loop region for playback, which the Timeline plan already needs.
- **Realtime Updates** toggle: whether other views update while dragging, a fallback if realizations are slow to recompute.

## Where Blender conflicts with Hrifa decisions

- **Automatic cleanup of unused data** conflicts with the desk as a keep list: adopt only the filter and a manual Purge.
- **Library overrides follow the source**; the derivation proposal pins and flags. Keep pin and flag unless a scenario shows otherwise.
- **Floating windows** conflict with STAGE-3.
- **`.001` renaming** and dot-prefixed hidden names: Hrifa names variations `<name> (variation)` and should mark hidden material with a flag, not a name prefix.
- Hrifa's **version tree per clip** has no counterpart in Blender's data-blocks. Keep it: the selector's version sub-field (section 2) builds on it.

## Suggested routing (judgement)

1. **Timeline T0 scenarios:** sections 1 (users, make unique, delete), 3 (bundles), 5 (NLA table) and 6 (markers, binding). These are the decisions T0 is waiting on.
2. **Derivation-graph proposal:** sections 3 (bundle = inputs record) and 4 (overrides as an alternative), added as notes.
3. **A small Stage and Inspector arc:** sections 8 (swap, join, Maximize, Focus), 9 (top tabs), 10 (folding sections, breadcrumb, pin, filter) and 11 (Adjust Last Operation). Look changes go to the human first.
4. **The `ClipSelector`** (section 2) is wanted by both 1 and 3; design it in Timeline T1 or T2, where its first real users appear.

## Pages read (manual source paths)

`files/data_blocks`, `interface/controls/templates/data_block`, `interface/window_system/areas`, `interface/window_system/workspaces`, `interface/window_system/tabs_panels`, `editors/properties_editor`, `editors/outliner/interface` (display modes and Purge only), `scene_layout/collections/collections`, `scene_layout/object/properties/instancing/collection`, `files/linked_libraries/library_overrides` (introduction only), `editors/nla/introduction`, `editors/nla/tracks`, `editors/nla/strips`, `editors/nla/sidebar`, `animation/actions`, `animation/markers`, `editors/graph_editor/fcurves/modifiers` (interface and list only), `editors/dope_sheet/introduction`. Downloaded but not used here: `interface/window_system/regions`, `files/linked_libraries/link_append`, `files/asset_libraries/introduction`, `editors/graph_editor/introduction`. Not found at the guessed path: `editors/nla/tweaking` (Tweak Mode is described in the NLA introduction and tracks pages).
