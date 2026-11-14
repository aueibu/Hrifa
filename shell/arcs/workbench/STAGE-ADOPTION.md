# Stage adoption in the workbench: terms, files, what moves where and why

Written 2026-11-14 for the human. It explains the words used in the Stage work, the files behind them, and how the
spike you tried at `/stage` becomes part of the real workbench. Sources: `src/pages/stage/ARCHITECTURE.md`,
`DECISIONS.md` (STAGE-1 to STAGE-19, W-23, W-24), `arcs/workbench/ARC.md` (M8, M9a, M9b).

## 1. The short answer

Will the workbench end up with the spike's styling and behaviour? **Only in part, and only in one place for now.**

| What you saw in the spike | In the workbench after M9b |
| --- | --- |
| Header strip on each panel with move, stack, close | Yes, on the roll and chord-picker panels inside the clip editor |
| Splitters (drag or keyboard) between columns and in stacks | Yes, in that same area |
| Last column fills spare width | Yes, in that area. The hidden-columns menu is spike-only (`StageApp`), so a column hidden by a narrow window cannot be brought back in the editor |
| Modules keep their state when moved | Yes (the picker keeps mode, voicing, pinned chord) |
| Layout saved and restored | Yes, under its own key |
| Chord picker 2x1 when narrow, 3x1 otherwise | Partly: the picker adapts to its own container width with a CSS container query at 720px, not to the Stage's size classes |
| Sketch and Audition presets (Alt+1, Alt+2) | No. Spike only |
| Left inspector with the dynamic "Clip" / "Selected note" panels, built from the kit | No. The workbench keeps its own inspector for now |
| Canvas and roll linked (click a clip, roll pans) | No. Demo data only |
| The canvas as a Stage slot, `SplitStage` replaced | No. Later steps |

Everything else in the workbench (canvas, desk, inspector, the top and bottom split, the canvas takeover) is
unchanged by this arc.

## 2. Terms

**Region.** A permanent part of the screen: the **Inspector** (left) and the **Stage** (centre). Not arranged by the user.

**Stage.** The centre area that arranges modules. It holds columns of slots. It owns no layout state; the page that
uses it holds the layout and passes an `update` function. It can measure its own width (M9a) or be given one.

**Module.** A self-contained view with an id and a title (piano roll, chord picker, canvas, a lab panel). It is written
once and never knows where it is shown. It is handed only its **size class**.

**Slot.** One place on the Stage that holds one module, with a header strip. A module is mounted once and keeps its
state when moved (the "mounted-once" rule, STAGE-7).

**Column.** A vertical band of slots. A column has a width in rem. The **last visible column fills the spare width**
(STAGE-15); its stored width is its minimum.

**Stack.** More than one slot in one column, one above another, with a splitter between them.

**Layout.** Plain saved data: columns, which modules are in each, widths, stack shares. It holds module ids and
numbers, never components. A stored layout with an unknown module is loaded without it.

**Size class.** The proportions of room a slot gives its module, measured from the slot itself (not the window), in
two axes: width `narrow` (under 30rem), `regular` (30 to under 42), `wide` (42 and over); height `short`, `regular`,
`tall` with the same limits. Base unit 6rem; minimum slot 12rem by 6rem; 0.5rem hysteresis so a drag near a boundary
does not flicker. A module declares which sizes it supports and renders differently for each, the way it already
renders for light and dark.

**Splitter.** A draggable (and arrow-key) divider. Two kinds: a **column splitter** between columns, and a **stack
splitter** between stacked slots. They clamp to each module's minimum size.

**Strip (header strip).** The thin bar on top of a slot or an inspector panel: title on the left, small tool buttons on
the right (move left or right, stack, unstack, close). One implementation is shared by both (STAGE-11).

**Hidden columns.** When the Stage is too narrow, columns are shown as a left-to-right prefix and the rest stay in the
layout, mounted but not visible. In the spike a "Hidden columns" menu brings one forward; the component itself has no such menu yet (BACKLOG). At least one column always shows.

**Preset.** A saved layout you switch to with a key or control (spike only: Sketch and Audition).

**Takeover.** Existing workbench feature, not part of the Stage: the chord picker can be moved out of the clip editor
and shown in the canvas area above. Unchanged by this arc.

**Dock.** Existing workbench name for the chord picker placed beside the roll with its own splitter. M9b replaces the
dock's hand-made splitter with a Stage slot and splitter.

**Kit (inspector kit).** A small set of shared UI pieces so every inspector-style panel looks alike:
`Panel`, `Strip`/`StripTool`, `Section`, `Row` (name left, value right, one fixed height), `Num` (number cell),
`Toggle` (the lab's pressed-button on/off), fixed-size fields (text, number, select, segmented), `Actions` (one
right-aligned row of a panel's commands, main one last), `Tip` (tooltip, default open delay 330 ms). Sizes live in one
table, `tokens.ts`, in one density, `compact` (the lab's measurements). Colours use theme roles only.

## 3. Files: what each is and where it lives now

### Pure core, `src/lib/stage/` (no React, stays where it is)
- `size.ts`: the size classes, thresholds, hysteresis, nearest supported size.
- `registry.ts`: module metadata types (`id`, `title`, supported `sizes`, `minSize`).
- `layout.ts`: the layout rules: add, remove, move, stack, unstack, widths, shares, how many columns fit.
- `splitters.ts`: clamping rules for both splitter kinds.
- `persist.ts`: parse and sanitise a stored layout; the storage key rules (`hrifa.stage.` prefix; M9a added the
  optional key).
- `README.md` and tests.

### Stage component, `src/components/Stage/` (promoted from `src/pages/stage/` in M8)
- `Stage.tsx`: renders the layout; measures itself (optional, M9a); fills the last column.
- `Slot.tsx`: one slot: header strip, measures its body, hands the module its size, focus restore.
- `Splitter.tsx`: the pointer and keyboard splitter.
- `stageOps.ts`: the operations the UI calls (move, stack, nudge, fill-room rule).
- `sizeState.ts`, `persistence.ts` (load and save), `registry.ts` (module with `render(size)`),
  `useWidthRem.ts`, `icons.tsx`, `stage.module.css`, `index.ts`.

### Inspector kit, `src/components/InspectorKit/` (promoted from `src/pages/stage/kit/` in M8)
- `Kit.tsx`: all the pieces. `tokens.ts`: every size, defined once. `settings.ts`: the tooltip-delay developer option
  (`hrifa.stage.tipDelay.v1`). `kit.module.css`, `index.ts`, tests.

### The spike page, `src/pages/stage/` (stays; the `/stage` demo)
- `StageApp.tsx` (spike shell: presets control, Developer popover, inspector on the left), `presets.ts`,
  `KitDemo.tsx`, `standins/` (throwaway modules), `spike/` (roll, canvas, chord picker, inspector with demo state),
  `ARCHITECTURE.md` (the design record, sections 1 to 13).
- It imports the Stage and kit from `src/components/` and is removed once a real page uses the Stage.

### Existing workbench files involved, `src/pages/composition-workbench/`
- `components/NoteClipEditor.tsx`: the clip editor. Owns the roll, the chord session (anchor, ghosts, voicing, mode,
  keyboard handling W-20) and the audition. **M9b puts a Stage inside it.**
- `chordInput/ChordPickerHost.tsx`: today shows the picker as a dock beside the roll or portals it into the canvas
  takeover. The dock part is what the Stage replaces; the takeover part stays.
- `chordInput/ChordPicker.tsx`: the picker body (modes, columns, voicing). Gets a size-aware layout like the spike.
- `noteEditorPreferences.ts`: per-viewer prefs `chordHost` and `chordDockWidth`. They are migrated once into the
  Stage's saved layout.
- Not touched: `SplitStage.tsx` (top and bottom split), `ClipEditorSlot.tsx`, `canvasTakeover.tsx`,
  `CompositionCanvas.tsx`, `CompositionInspector.tsx`, `compactTheme.ts`.

## 4. What is moving where, and why

| Step | What | From | To | Why | Status |
| --- | --- | --- | --- | --- | --- |
| Spike (stage arc M1 to M6) | Prove the system | n/a | `/stage` page | Show modules can be moved, stacked, resized and size-aware without being designed around a layout | Done |
| M8 | Stage component and kit | `src/pages/stage/` | `src/components/Stage/`, `src/components/InspectorKit/` | They are shared pieces; the workbench is the first real user | Done (`e113154`) |
| M9a | Stage measures its own width; layout key is a parameter | window-wide width, one fixed key | container width, per-use key | A Stage inside the clip editor must not use the window width or share the spike's saved layout | Done (`a7390b7`) |
| M9b | Roll and chord picker | A flex row in `NoteClipEditor` with a hand-made dock splitter | A Stage inside the editor with two modules | The picker already adapts to size; the Stage gives move, stack, resize, saved layout for free | In progress |
| Later | Canvas takeover and `SplitStage` | Hardcoded special cases | Stage slots | Remove the last hardcoded layout code in the workbench centre | Backlog |
| Later | Workbench inspector | `compactTheme.ts` plus per-panel CSS | The kit | One look and one place to change sizes | Backlog |
| Later | Lab | Its own layout | Kit only | Keep what works; share the look | Backlog |

### The design rule behind M9b
No state moves out of `NoteClipEditor`. A module only receives its size, but its render function can be built inside
the editor with access to the editor's state. So the roll and picker become Stage modules without extracting the
roll's roughly 40 props or the chord session. Extracting those is a larger separate step (BACKLOG).

### Behaviours that must not change
Hover ghost notes, click to audition, double-click or Enter to insert, the W-20 keyboard workflow, Esc, the canvas
takeover and its toggle, per-viewer memory of the choices. All existing chord-input tests must still pass.

## 5. What you will be able to try at the M9b checkpoint
- Use chord input exactly as before.
- Move the picker next to or above the roll; stack the two; resize with the splitter; close and reopen the picker (closing it from its strip is the same as leaving the Chords tool).
- Reload: the arrangement and picker width stay.
- Switch the canvas takeover on and off: the picker leaves and returns to the Stage.
- At the same time this is the combined review owed since the chord-input arc's M6d.

## 6. Known behaviours to judge at the checkpoint (from the M9b review)
- The roll now sits inside Stage chrome (surface background, small padding, a strip with move, stack and close). The roll's own close button does nothing.
- After you arrange the Stage once, the last column absorbs window resizing, so widening the editor grows the picker rather than the roll. Whether the roll should be the one that flexes is your decision.
- If the picker is moved left of the roll and the editor gets narrow, the roll is the column that can be hidden.
- The picker has two close buttons: the strip's X (leaves the Chords tool) and the picker's own header close (clears the anchor).
- Moving the roll to another position in the Stage loses its scroll position (state survives; DOM scroll does not).

## 7. Still open (carried in `shell/BACKLOG.md`)
Command channel to a module; one selection model with a parent chain; a shared time-to-pixel mapping; where selection
and project state live; where a module's pan and zoom live; lifting the chord session out of the editor; the roll as
its own module; scroll restore across a move; the inspector sitting outside the Stage's width model.
