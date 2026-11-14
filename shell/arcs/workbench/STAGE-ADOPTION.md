# Stage adoption in the workbench: terms, files, what moves where and why

Written 2026-11-14 for the human, rewritten the same day with fuller names. It explains the words used in the Stage
work, the files behind them, and how the spike you tried at `/stage` becomes part of the real workbench. Sources:
`src/pages/stage/ARCHITECTURE.md`, `DECISIONS.md` (STAGE-1 to STAGE-19, W-23 to W-25), `arcs/workbench/ARC.md`
(M8, M9a, M9b).

## 0. Naming used in this document

The word "module" means two different things in this codebase, so this document avoids the bare word.

| Say this | It means | Examples |
| --- | --- | --- |
| **Workbench module** | One of the composition tools that the workbench lists and hosts through `ModuleHost` in the bottom pane | Arithmetic, Mixer, Melodicization, Pitch List |
| **Panel** | One thing the Stage can place, move, stack and resize. The code calls it a "Stage module"; this document says panel | the piano roll panel, the chord picker panel, the canvas panel (spike) |
| **Slot** | The place on the Stage that holds one panel, with its header strip | each panel sits in one slot |
| **Note clip editor** | The editor opened for a note clip (`NoteClipEditor.tsx`) that contains the piano roll | shows in the bottom pane |
| **Piano roll** | The grid where notes are drawn (`src/components/PianoRoll`) | |
| **Chord picker** | The Chords tool's picker: chord buttons by role, voicing controls (`ChordPicker.tsx`) | |
| **Canvas takeover** | The existing feature that moves the chord picker out of the note clip editor into the canvas area above | |

## 1. The short answer

Will the workbench end up with the spike's styling and behaviour? **Only in part, and only in one place for now.**

| What you saw in the spike | In the workbench after M9b |
| --- | --- |
| Header strip on each panel with move, stack, close | Yes, on the piano roll and chord picker panels inside the note clip editor |
| Splitters (drag or keyboard) between columns and in stacks | Yes, in that same area |
| Last column fills spare width | Yes, in that area. The "Hidden columns" menu is spike-only (`StageApp`), so a column hidden by a narrow window cannot be brought back in the note clip editor |
| Panels keep their state when moved | Yes (the chord picker keeps mode, voicing, pinned chord) |
| Layout saved and restored | Yes, under its own key |
| Chord picker 2x1 when narrow, 3x1 otherwise | Partly: the chord picker adapts to its own container width with a CSS container query at 720px, not to the Stage's size classes |
| Sketch and Audition presets (Alt+1, Alt+2) | No. Spike only |
| Left inspector with the dynamic "Clip" and "Selected note" panels, built from the kit | No. The workbench keeps its own inspector for now |
| Canvas and piano roll linked (click a clip, the roll pans) | No. Demo data only |
| The canvas as a slot, the top and bottom split replaced | No. Later steps |

Everything else in the workbench (canvas, desk, left inspector, the top and bottom split, the canvas takeover,
workbench modules) is unchanged by this arc.

### What contains what today

```
Workbench page
├─ Left inspector
├─ Top pane: desk / canvas (and the canvas takeover area)
└─ Bottom pane
   ├─ Workbench modules (Arithmetic, Mixer, ...)
   └─ Note clip editor
      └─ Stage                       <- added in M9b
         ├─ Piano roll panel
         └─ Chord picker panel
```

The chord picker is its own panel, but the Stage that holds it lives inside the note clip editor. So the chord picker
panel can only move within that one Stage (next to or above the piano roll); it cannot go to the inspector or the top
pane. The only way out is the canvas takeover, which is the old mechanism.

## 2. Terms

**Region.** A permanent part of the screen: the **inspector** (left) and the **Stage** (centre). Not arranged by the
user.

**Stage.** The component that arranges panels. It holds columns of slots. It owns no layout state; the page that uses
it holds the layout and passes an `update` function. It can measure its own width (M9a) or be given one.

**Panel (Stage module).** A self-contained view with an id and a title. It is written once and never knows where it is
shown. It is handed only its **size class**.

**Slot.** One place on the Stage that holds one panel, with a header strip. A panel is mounted once and keeps its
state when moved (the "mounted-once" rule, STAGE-7).

**Column.** A vertical band of slots. A column has a width in rem. The **last visible column fills the spare width**
(STAGE-15); its stored width is its minimum.

**Stack.** More than one slot in one column, one above another, with a splitter between them.

**Layout.** Plain saved data: columns, which panels are in each, widths, stack shares. It holds panel ids and numbers,
never components. A stored layout with an unknown panel id is loaded without it.

**Size class.** The proportions of room a slot gives its panel, measured from the slot itself (not the window), in two
axes: width `narrow` (under 30rem), `regular` (30 to under 42), `wide` (42 and over); height `short`, `regular`, `tall`
with the same limits. Base unit 6rem; minimum slot 12rem by 6rem; 0.5rem hysteresis so a drag near a boundary does not
flicker. A panel declares which sizes it supports and renders differently for each, the way it already renders for
light and dark. This standard unit is the "standard proportions" idea.

**Splitter.** A draggable (and keyboard) divider. Two kinds: a **column splitter** between columns, and a **stack
splitter** between stacked slots. They clamp to each panel's minimum size.

**Header strip.** The thin bar on top of a slot or an inspector panel: title on the left, small tool buttons on the
right (move left or right, stack, unstack, close). One implementation is shared by both (STAGE-11).

**Hidden columns.** When the Stage is too narrow, columns are shown as a left-to-right prefix and the rest stay in the
layout, mounted but not visible. In the spike a "Hidden columns" menu brings one forward; the component itself has no
such menu yet (BACKLOG). At least one column always shows.

**Preset.** A saved layout you switch to with a key or control (spike only: Sketch and Audition).

**Canvas takeover.** Existing workbench feature, not part of the Stage: the chord picker can be moved out of the note
clip editor and shown in the canvas area above. Unchanged by this arc.

**Dock.** The old workbench name for the chord picker placed beside the piano roll with its own hand-made splitter.
M9b replaces it with a Stage slot and splitter.

**Inspector kit.** A small set of shared UI pieces so every inspector-style panel looks alike: `Panel`,
`Strip`/`StripTool`, `Section`, `Row` (name left, value right, one fixed height), `Num` (number cell), `Toggle` (the
lab's pressed-button on/off), fixed-size fields (text, number, select, segmented), `Actions` (one right-aligned row of
a panel's commands, main one last), `Tip` (tooltip, default open delay 330 ms). Sizes live in one table, `tokens.ts`,
in one density, `compact` (the lab's measurements). Colours use theme roles only. Note: the kit's `Panel` is an
inspector panel, not the same thing as a Stage panel.

## 3. Files: what each is and where it lives now

### Pure core, `src/lib/stage/` (no React, stays where it is)
- `size.ts`: the size classes, thresholds, hysteresis, nearest supported size.
- `registry.ts`: panel metadata types (`id`, `title`, supported `sizes`, `minSize`).
- `layout.ts`: the layout rules: add, remove, move, stack, unstack, widths, shares, how many columns fit.
- `splitters.ts`: clamping rules for both splitter kinds.
- `persist.ts`: parse and sanitise a stored layout; the storage key rules (`hrifa.stage.` prefix; M9a added the
  optional key).
- `README.md` and tests.

### Stage component, `src/components/Stage/` (promoted from `src/pages/stage/` in M8)
- `Stage.tsx`: renders the layout; measures itself (optional, M9a); fills the last column.
- `Slot.tsx`: one slot: header strip, measures its body, hands the panel its size, focus restore.
- `Splitter.tsx`: the pointer and keyboard splitter.
- `stageOps.ts`: the operations the UI calls (move, stack, nudge, fill-room rule).
- `sizeState.ts`, `persistence.ts` (load and save), `registry.ts` (a panel with `render(size)`), `useWidthRem.ts`,
  `icons.tsx`, `stage.module.css`, `index.ts`.

### Inspector kit, `src/components/InspectorKit/` (promoted from `src/pages/stage/kit/` in M8)
- `Kit.tsx`: all the pieces. `tokens.ts`: every size, defined once. `settings.ts`: the tooltip-delay developer option
  (`hrifa.stage.tipDelay.v1`). `kit.module.css`, `index.ts`, tests.

### The spike page, `src/pages/stage/` (stays; the `/stage` demo)
- `StageApp.tsx` (spike shell: presets control, Developer popover, inspector on the left), `presets.ts`,
  `KitDemo.tsx`, `standins/` (throwaway panels), `spike/` (piano roll, canvas, chord picker, inspector with demo
  state), `ARCHITECTURE.md` (the design record, sections 1 to 13).
- It imports the Stage and kit from `src/components/` and is removed once a real page uses the Stage.

### Existing workbench files involved, `src/pages/composition-workbench/`
- `components/NoteClipEditor.tsx`: the note clip editor. Owns the piano roll, the chord session (anchor, ghost notes,
  voicing, mode, keyboard handling W-20) and the audition. **M9b puts a Stage inside it.**
- `editorStage.ts` (new in M9b): the Stage's panel ids, layout key, default layout, the migration of the old dock
  width.
- `chordInput/ChordPickerHost.tsx`: now only the frame around the chord picker (used in the Stage slot or in the canvas
  takeover). The old dock splitter and width logic are gone.
- `chordInput/ChordPicker.tsx`: the chord picker body (modes, columns, voicing).
- `noteEditorPreferences.ts`: per-viewer preferences `chordHost` and `chordDockWidth`. The width is migrated once into
  the Stage's saved layout.
- Not touched: `SplitStage.tsx` (the top and bottom split), `ClipEditorSlot.tsx`, `canvasTakeover.tsx`,
  `CompositionCanvas.tsx`, `CompositionInspector.tsx`, `compactTheme.ts`.

## 4. What is moving where, and why

| Step | What | From | To | Why | Status |
| --- | --- | --- | --- | --- | --- |
| Spike (stage arc M1 to M6) | Prove the system | n/a | `/stage` page | Show panels can be moved, stacked, resized and size-aware without being designed around a layout | Done |
| M8 | Stage component and kit | `src/pages/stage/` | `src/components/Stage/`, `src/components/InspectorKit/` | They are shared pieces; the workbench is the first real user | Done (`e113154`) |
| M9a | Stage measures its own width; the layout key is a parameter | window-wide width, one fixed key | container width, a key per use | A Stage inside the note clip editor must not use the window width or share the spike's saved layout | Done (`a7390b7`) |
| M9b | Piano roll and chord picker | A flex row in the note clip editor with a hand-made dock splitter | A Stage inside the note clip editor with two panels | The chord picker already adapts to size; the Stage gives move, stack, resize and a saved layout | Done, awaiting your checkpoint (`4c205d0`) |
| Later | Canvas takeover and the top and bottom split | Hardcoded special cases | One page-level Stage with rows | Remove the last hardcoded layout code in the workbench centre | Backlog |
| Later | Workbench inspector | `compactTheme.ts` plus per-panel CSS | The inspector kit | One look, one place to change sizes | Backlog |
| Later | Harmonic field lab | Its own layout | Kit only | Keep what works; share the look | Backlog |

### The design rule behind M9b
No state moved out of the note clip editor. A panel only receives its size, but its render function can be built inside
the editor with access to the editor's state. So the piano roll and chord picker became panels without extracting the
piano roll's roughly 40 props or the chord session. Extracting those is a larger separate step (BACKLOG), and it is
what stands between this and one Stage for the whole workbench.

### Behaviours that must not change
Hover ghost notes, click to audition, double-click or Enter to insert, the W-20 keyboard workflow, Esc, the canvas
takeover and its toggle, per-viewer memory of the choices. All existing chord-input tests pass.

## 5. What to try at the M9b checkpoint
- Use chord input exactly as before.
- Move the chord picker panel next to or above the piano roll; stack the two; resize with the splitter; close and
  reopen the chord picker (closing it from its strip is the same as leaving the Chords tool).
- Reload: the arrangement and the chord picker's width stay.
- Switch the canvas takeover on and off: the chord picker leaves and returns to the Stage.
- This is also the combined review owed since the chord-input arc's M6d.

## 6. Known behaviours to judge at the checkpoint (from the M9b review)
- The piano roll now sits inside Stage chrome (surface background, small padding, a header strip with move, stack and
  close). The piano roll panel's own close button does nothing.
- After you arrange the Stage once, the last column absorbs window resizing, so widening the note clip editor grows the
  chord picker rather than the piano roll. Whether the piano roll should be the one that flexes is your decision.
- If the chord picker is moved left of the piano roll and the editor gets narrow, the piano roll is the column that can
  be hidden.
- The chord picker has two close buttons: the strip's X (leaves the Chords tool) and the chord picker's own header
  close (clears the anchor).
- Moving the piano roll to another position loses its scroll position (state survives; DOM scroll does not).
- Compared with the old dock: no double-click reset on the splitter, no 60% width cap, a 12rem minimum instead of
  14rem, and the arrow-key direction on the splitter may be reversed.

## 7. Still open (carried in `shell/BACKLOG.md`)
Rows and a "Send to" menu so the top and bottom split can become a user-defined arrangement; one Stage for the whole
workbench (the canvas takeover, the desk and canvas, and the split as panels and slots); lifting the chord session out
of the note clip editor and making the piano roll its own panel; a command channel to a panel; one selection model
with a parent chain; a shared time-to-pixel mapping; where selection and project state live; where a panel's pan and
zoom live; scroll restore across a move; the inspector sitting outside the Stage's width model.
