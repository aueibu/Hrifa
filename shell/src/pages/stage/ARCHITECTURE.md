# Stage: architecture (M1, documents only)

Status: **proposed**. Written at M1 of `arcs/stage` for the human checkpoint. The vocabulary, the size thresholds and the kit tokens below are proposals until the human confirms or changes them; the open questions are in section 7. Nothing in this folder is code yet. Colours follow `src/theme/THEMING.md` (roles such as `--panel`, `--text-muted`, `--mark-<hue>`; no hex, no palette shades).

Every number in section 5 is quoted from code with a `file:line` source. Where a value is not set by the lab it says "not set; Mantine default" or "not measured". Paths are relative to `shell/src/` unless they start with `arcs/`.

## 1. Vocabulary

- **Region**: a permanent part of the screen. Today there are two: the **Inspector** (left; its content follows what is selected) and the **Stage** (centre). A region is not a module and is not arranged by the user.
- **Module**: a self-contained view with an id and a title: piano roll, desk/canvas, chord picker, lineage graph, a lab panel. A module is written once and knows nothing about where it is shown.
- **Slot**: a named place on the Stage that holds one module at a time. Slots stack and move; a module in a slot is mounted once (section 3).
- **Layout**: the arrangement of slots (which modules, in which columns and stacks, with which splitter shares). Plain serialisable data with a version field; it holds module ids and numbers, never components.
- **Size**: the proportions of the room a slot gives its module, as a named class along each axis (width: `narrow` / `regular` / `wide`; height: `short` / `regular` / `tall`), measured from the slot itself and never from the window. A module declares the sizes it supports and renders differently per size, the way it already renders for light and dark. It never learns where it sits. ("Size" was chosen over "shape" by the human, 2026-11-13.)

A region contains slots. A slot contains one module. A layout lists the slots. A size is given to the module by the slot.

## 2. Size classes

Two independent axes. A module receives `{ width, height }`, for example `{ width: 'wide', height: 'short' }`. It never receives pixels.

### Measurement rule

The size is measured on the **slot body**: the area below the slot's header strip, border-box (padding included), by a `ResizeObserver` on that element. The window is never consulted. The slot publishes the result as a hook value and as `data-slot-size="<width>-<height>"` on the slot body so CSS can switch on it. Thresholds are named tokens defined once (in `src/lib/stage/`, M2), in rem, compared against the measured width converted to rem.

### Width

| class | proposed range | token | reason |
| --- | --- | --- | --- |
| `narrow` | below 24rem | `SIZE_WIDTH_REGULAR_MIN_REM = 24` | 24rem is the width of one lab pinned column (`grid-template-columns: 9.5rem minmax(0, 1fr) 24rem`, `components/lab.module.css:21`; the column plus its 0.25rem gap is `COLUMN_REM = 24.25`, `harmonic-field-lab/state/layout.ts:72`). The lab panels are designed for that width, so it is the reference **regular**. Note that below 70em the lab's own media query shrinks that column to 20rem (`lab.module.css:64-66`), so under the proposed threshold those panels would already be `narrow` there (Q2). |
| `regular` | 24rem up to 40rem | (between the two tokens) | Covers the lab column (24rem) and the chord dock's default width (30rem, `DEFAULT_CHORD_DOCK_WIDTH = 480` px, `composition-workbench/noteEditorPreferences.ts:49`, W-17). |
| `wide` | 40rem and above | `SIZE_WIDTH_WIDE_MIN_REM = 40` | Room for about two lab columns side by side (2 x 24rem = 48rem less padding), or a chord grid with several columns of chord names without wrapping. 40rem is also what the ARC's starting proposal says. It is a proposal: no code fixes it (open question Q2). |

The smallest width a slot may give is 14rem (`MIN_CHORD_DOCK_WIDTH = 224` px, `noteEditorPreferences.ts:48`: the narrowest the existing dock lets the user drag it). That is the proposed minimum for the width axis (`SIZE_WIDTH_MIN_REM = 14`). The dock's effective maximum is 60% of the width of the panel it sits in, or 960 px when that is unknown (`FALLBACK_MAX_WIDTH`, `ChordPickerHost.tsx:20,76-78`); `MAX_CHORD_DOCK_WIDTH = 1600` is only the clamp applied when the preference is stored (`noteEditorPreferences.ts:143,174`). Neither needs a size class of its own.

### Height

| class | proposed range | token | reason |
| --- | --- | --- | --- |
| `short` | below 12rem | `SIZE_HEIGHT_REGULAR_MIN_REM = 12` | A stacked lab panel may be squeezed to `max(6rem, 20%)` of its column (`SPLIT_MIN_REM = 6`, `SPLIT_MIN_SHARE = 0.2`, `state/layout.ts:325-327`; `stackRows`, `components/Panels.tsx:82-83`). With the 1.875rem header strip (`lab.module.css:316`) that leaves about 4.1rem of body at the minimum, one or two rows. Up to 12rem the body (about 10rem after the strip) holds roughly six 1.625rem inputs with their gaps, which is a short single-purpose strip, not a form. |
| `regular` | 12rem up to 28rem | between the tokens | The ordinary panel: a few sections with headings. |
| `tall` | 28rem and above | `SIZE_HEIGHT_TALL_MIN_REM = 28` | Room for a list that does not need to scroll (a chord grid with several rows, a full inspector panel). No code anchors 28rem; it is a proposal (open question Q3). |

The smallest slot height is 6rem **including its header strip** (`SPLIT_MIN_REM`, `state/layout.ts:327`), so the slot body, which is what the size is measured on, is at least about 4.1rem (6rem minus the 1.875rem strip). The workbench's own stage split uses a share (`MIN_SPLIT = 0.2`, `MAX_SPLIT = 0.8`, `composition-workbench/components/SplitStage.tsx:6-7`), not a rem figure; the Stage uses the lab's rem-and-share rule (the larger of the two).

### Hysteresis

A size class changes only when the measured value crosses a threshold by more than 0.5rem back the other way, so a splitter drag that hovers on a boundary does not make the module flicker between two renderings. (Proposal; the value is open question Q4.)

### What a module does at its minimum size

At `narrow`/`short` (about 14rem by 4rem of body) a module must still:
1. show its title or a one-line summary of its state (the header strip shows the title; the body may show a value);
2. never overflow the slot: no horizontal page scroll, no clipped controls; extra content scrolls inside the module's own body (the lab does this: `.panelBody` has `overflow-y: auto; overflow-x: hidden`, `components/panels.module.css:4-18`);
3. keep every control reachable (by scroll or by a menu), dropping labels and secondary readouts before dropping controls;
4. keep its state; shrinking is never a reason to unmount.

If a module cannot do that, its `minSize` says so and the layout refuses to give it less (section 3).

## 3. Module contract

```ts
interface StageModule {
  id: string;                   // unique, stable, never reused; persisted in layouts
  title: string;                // shown in the slot's header strip
  sizes: SizeSet;               // the size classes it has a rendering for
  minSize: Size;                // the smallest room it will accept
  render(size: Size): ReactNode;
}
```

The registry is an **open set of ids**: `registerModule(module)` adds one, and a layout may name any registered id. There is no `PanelId` union (the lab has one, `harmonic-field-lab/state/layout.ts`; see section 6). A stored layout naming an id that is not registered loads without it and never throws.

`sizes` is the set of classes the module has a deliberate rendering for. If the slot's measured size is not in the set, the slot passes the nearest supported size (the largest supported that fits, else the smallest supported) and the module is shown in that rendering with the leftover room as padding or scroll, never stretched in a way the module did not design for. `minSize` is the smallest `{ width, height }` the slot may be given; a move, stack or splitter drag that would go below it is refused or clamped.

### What a module may NOT do

- Read the layout, or know which column, side or stack position it is in.
- Assume a pixel width or height. It reads `size` only.
- Reach into its parent (query `parentElement`, measure it, or portal into an ancestor it was not given). The workbench's chord picker host does exactly this today: it reads `frameRef.current?.parentElement` and watches it with a `ResizeObserver` to limit the dock's width (`ChordPickerHost.tsx:60-73`); a Stage module has no such back door. If a module needs a bigger room it asks for a different slot through the Stage, not by reaching.
- Open its own floating window or free-positioned panel. The only floating element a module may use is a transient popover anchored to its own control (a Mantine `Menu`, `Popover` or `Tooltip`), as the lab's header menus do (`components/Panels.tsx`, the Stack menu).
- Persist its own position or size. The layout does.

### Mounted-once rule (moving keeps state)

A module instance is created once per slot id and **never unmounted by a move, stack, unstack or reorder**. The Stage keeps one stable React element per module id, keyed by the module id (not by column or index), and moves it between slots. A mechanism that can satisfy this in React is a portal into the slot's body element, created once per module and retargeted on a move; re-keying by position would remount the module and lose its state. Nothing today meets this rule: `ChordPickerHost` portals into the takeover slot (`useCanvasTakeoverElement()`, `ChordPickerHost.tsx:49-50`; `createPortal(frame, slot)`, `:172-174`) but switching between dock and takeover changes the element tree (a portal versus a fragment with splitter and frame), so the body remounts. It is not a precedent.

Why: a move is a change of room, not a change of content. A chord picker with a half-typed filter, a roll with its scroll and zoom, a text field with an uncommitted edit must survive being dragged from the side column to the top. This is also what makes the lock-in fear go away: arrangement is data and costs the module nothing. (Closing a module is the only action that unmounts it, and then its state is dropped on purpose.) A test in M3 and M5 asserts this for the chord stand-in.

The one exception that is not an exception: the module's **rendering** may differ per size (a different tree), but its **state** lives above the render function (in the module's own component, keyed by id), so a size change keeps the filter, selection and scroll that make sense in both renderings. A module author is responsible for keeping state out of the per-size branch.

## 4. Worked examples

### 4a. Chord picker: one body, two sizes

Today (the workbench, W-16/W-17): `ChordPickerHost` (`composition-workbench/chordInput/ChordPickerHost.tsx`) frames one `ChordPicker` body in one of two named slots, a fixed-width **dock** beside the roll (default 30rem = 480 px, min 14rem = 224 px, max 60% of the panel it sits in (960 px when unknown; the stored preference is clamped to 1600 px); draggable splitter with arrow-key nudges of 16 px, `KEY_STEP = 16`, `ChordPickerHost.tsx:19`) or the **canvas takeover** over the desk area. The body takes no host-specific props ("The body (ChordPicker) is the same in both and takes no host-specific props", `ChordPickerHost.tsx:27-29`), and the dock width and host are per-viewer prefs `chordDockWidth` and `chordHost` (W-10, W-17). The size is implied by which slot it is in, and the host knows it. That is the thing the Stage generalises: the body learns its size from the slot instead of the host choosing a frame.

On the Stage, one chord picker module with these renderings:

| slot size | where it typically sits | rendering |
| --- | --- | --- |
| `narrow` x `tall` (14 to 24rem wide) | a column beside the roll | one column of chord buttons, single role at a time (the role selector), the label strip collapsed to a one-line current-chord summary. |
| `regular` x `tall` (24 to 40rem wide) | the default dock (30rem) | today's dock rendering: the common-tone columns with sideways scroll below a minimum column width (W-19). |
| `wide` x `short` (40rem and up, under 12rem tall) | above the roll | a horizontal strip: roles as columns side by side, one row of chord buttons per role, scrolling sideways, no stacked rows. |
| `wide` x `tall` | the takeover, or a large slot | all roles as columns, every tier of chords visible (the takeover's rendering today). |

All four are one component (`render(size)` branches on `size`), the filter, the anchor, the selected chord and the keyboard state are held outside the branch, and moving the module from beside the roll to above it changes only the `size` argument. The picker's keyboard flow (W-20) is attached to the module, not to a position.

### 4b. Piano roll

The module wraps the shared `PianoRoll` (`components/PianoRoll/PianoRoll.tsx`), consumed only through its props. Props that matter for sizing: `fill` (the roll takes the full width and height its parent gives, `PianoRollProps.fill`), `detachedScroll` (one panel: keys outside the scroller, lane slot, one scrollbar), `showToolbar` (hide the zoom and follow controls), `height` (a fixed height when not in `fill`), `view`/`onViewChange` (the owner holds scroll and zoom, so they survive moves), `lane` (a velocity lane slot), `tools`/`actions`/`activeTool` (the palette), and the opt-in chord overlay props (`ghostNotes`, `onAnchorClick`, `onAnchorHover`, W-15 to W-18).

What it shows per size (proposed; all rendered with the same `view` state):

| slot size | rendering |
| --- | --- |
| `wide` x `tall` | full unified panel: `fill`, `detachedScroll`, toolbar, tool palette, velocity lane under the roll. |
| `wide` x `regular` | `fill`, `detachedScroll`, toolbar and palette; the velocity lane is hidden (it is the first thing dropped). |
| `regular` x any | `fill`, palette collapsed to a narrow set of tools; toolbar hidden (`showToolbar={false}`), view set by the owner. |
| `narrow` x any, or `short` | `fill`, a read-and-select roll: no palette, no lane, no toolbar; editing still works by keyboard. |
| minimum (`narrow` x `short`) | a compact roll with no toolbar, palette or lane, enough to see the notes under the playhead. (Hiding the keyboard column as well would need a new `PianoRoll` prop: out of this arc's scope, so not proposed.) |

These are proposals for M5; M1 only fixes the idea that one module renders those variants from one `view` state. `PianoRoll` is not changed by this arc.

## 5. Kit tokens measured from the lab

The lab's panels are written with Mantine components at explicit sizes and local CSS (the lab is not wrapped in a compact theme: `HarmonicFieldLabApp.tsx` has no `MantineThemeProvider`; the compact sizing lives in `composition-workbench/compactTheme.ts`, compared in 5b). Sources: `harmonic-field-lab/components/ui.tsx`, `lab.module.css` (`LAB`), `panels.module.css` (`PANELS`), `Panels.tsx`, `ChordsPanel.tsx`, `RetunerPanel.tsx`, `GeneratorColumn.tsx`. All under `src/pages/harmonic-field-lab/` and rem unless stated. One rem is 16 px.

### 5a. Token table

| token | value | unit | source | note |
| --- | --- | --- | --- | --- |
| `root-font-size` | 0.8125 | rem (13 px) | `LAB lab.module.css:11` | base text of the lab; `.panelBody` repeats it, `PANELS panels.module.css:11` |
| `root-line-height` | 1.3 | unitless | `LAB lab.module.css:13` | |
| `input-height-xs` | 1.625 | rem (26 px) | `LAB lab.module.css:7` (`--input-height-xs`) | the lab overrides Mantine's xs input height; every `size="xs"` input, select, number field and segmented control follows it. Mantine's own xs default is not set in this repo's code (not measured) |
| `font-size-sm` (panel body) | 0.75 | rem (12 px) | `PANELS panels.module.css:5` (`--mantine-font-size-sm`) | overrides Mantine inside `.panelBody` only |
| `font-size-xs` (panel body) | 0.6875 | rem (11 px) | `PANELS panels.module.css:6` (`--mantine-font-size-xs`) | |
| `font-size-small` | 0.75 | rem | `LAB lab.module.css` (25 occurrences of `0.75rem` in `lab.module.css`, e.g. `.paramNote`); `PANELS panels.module.css:36` (`.hint`) | the commonest secondary size |
| `font-size-tiny` | 0.6875 | rem | `PANELS` (`.tileName`, `panels.module.css:737`); 12 uses in `LAB` | labels inside tiles and readouts |
| `region-gap` | 0.25 | rem | `LAB lab.module.css:20` (`.grid` gap), `:1380` (`.pinStack` gap) | gap between panels in the grid, the "surface" showing between tier fills |
| `region-padding` | 0.25 | rem | `LAB lab.module.css:24` (`.grid` padding) | around the whole grid |
| `panel-radius` | `--radius-control` | role | `LAB lab.module.css:33` (`.rail, .workspace, .analysis, .pinned, .dock`) | a theme role, no number |
| `panel-background` | `--panel` | role | `LAB lab.module.css:32` | |
| `panel-padding` | 0.5 | rem | `PANELS panels.module.css:16` (`.panelBody`) | all four sides |
| `panel-body-gap` | 0.625 | rem | `PANELS panels.module.css:12` (`.panelBody` gap) | between blocks in a panel; each child keeps its natural height, the panel scrolls (`:20-22`) |
| `strip-height` | 1.875 | rem (30 px) | `LAB lab.module.css:316` (`.strip`) | header strip (`:1052` is a sparkline height and `:1078` the `.dock[data-open='false']` height, not strips) |
| `strip-background` | `--panel-header` | role | `LAB lab.module.css:311` | |
| `strip-radius` | `--radius-control` on the top corners, 0 on the bottom | role | `LAB lab.module.css:312` | |
| `strip-padding` | 0 0.5 | rem | `LAB lab.module.css:318` | |
| `strip-gap` (title to tools) | 0.5 | rem | `LAB lab.module.css:315` | |
| `strip-title-font` | 0.75 rem, weight 600, letter-spacing 0.02em, no wrap, margin 0, family inherited | | `LAB lab.module.css:321-328` (`.stripTitle`) | an `h2` (`ui.tsx:108`) |
| `strip-tools-gap` | 0.375 | rem | `LAB lab.module.css:330-334` (`.stripTools`) | tools sit right, the injected move/stack/unpin icons after them (`ui.tsx:111-114`, `PinActionsContext`) |
| `kv-grammar` | name left in `--text-muted`, value right in `--text`, flex, gap 0.5rem, `space-between` | | `LAB lab.module.css:294-307` (`.kv`, `.kvName`, `.kvValue`); component `Row`, `ui.tsx:86-93` | the parameter-list row: name muted, value text, right-aligned. The row has no height of its own: its height is the line height (1.3 x 0.8125rem, about 1.06rem); there is no row-height token in the lab |
| `num-font` | Mantine `Text ff="monospace"` (theme `fontFamilyMonospace: "DM Mono", monospace`, `theme/foundation.ts:26`), `font-size: 0.92em`, `font-variant-numeric: tabular-nums` | | `ui.tsx:77-83` (`Num` uses `Data`, `components/Data/Data.tsx` which uses `Mono`, `components/Mono/Mono.tsx`); `LAB lab.module.css:289-292` | muted variant via `c="dimmed"` |
| `sub-group` | background `--panel-inset`, radius `--radius-control`, gap 0.375, padding 0.375 0.5 0.5 (top, sides, bottom), nested `.sub` has no background or padding | rem | `PANELS panels.module.css:41-55` | one tier fill instead of a border, per THEMING.md divider budget |
| `sub-heading` | 0.75 rem, weight 600, `--text`, flex `space-between`, gap 0.5 | | `PANELS panels.module.css:56-66` (`.familyHead`), used by `Cluster` in `RetunerPanel.tsx:29-36` | |
| `family-gap` | 0.25 | rem | `PANELS panels.module.css:67-71` (`.family`) | rows inside a group |
| `inline-field-gap` | 0.375 0.75 (row, column), wrap | rem | `PANELS panels.module.css:715-721` (`.inlineField`, `.inlineControls`) | a label with its control on one line |
| `cluster-grid` | 2 equal columns, gap 0.5 0.75 | rem | `PANELS panels.module.css:709-713` (`.clusters`) | a panel's groups side by side; it is the grid that a narrow size would turn into one column (a gap, section 6) |
| `readout-tile` | background `--panel-slot`, radius `--radius-control`, padding 0.25 0.375; 3 equal columns, gap 0.25; name 0.6875rem muted; value 0.9375rem | rem | `PANELS panels.module.css:723-760` (`.readouts`, `.readout`, `.tileName`, `.readoutValue`) | |
| `tolerance-row` | flex wrap, gap 0.375; value cell min width 2.75, centred | rem | `PANELS panels.module.css:74-84` (`.tolRow`, `.tolValue`) | an ActionIcon, a number and an ActionIcon in a row |
| `splitter-thickness` | 0.5 | rem | `Panels.tsx:83` (`stackRows`, the row between panels is `0.5rem`); the stack's CSS gap is 0 so the splitter is the whole gap, `LAB lab.module.css:1391-1394` | invisible until hover or focus |
| `splitter-grip` | height 3px, width 2.5rem, `--text-subtle`, radius `--radius-control`, opacity 0 until hover, focus or drag | | `LAB lab.module.css:1411-1418` (`.splitGrip`) | hover and drag fill is `--panel-slot` (`:1420-1424`); focus ring 2px `--focus-ring`, offset -1px (`:1432`) |
| `splitter-minimum` | each panel at least `max(6rem, 20%)` | rem and share | `Panels.tsx:83`; `SPLIT_MIN_REM = 6`, `SPLIT_MIN_SHARE = 0.2`, `state/layout.ts:325-327` | the lab clamps drags and keyboard nudges to this (`state/layout.ts:335-340`) |
| `column-width` | 24 | rem | `LAB lab.module.css:21`; `COLUMN_REM = 24.25` with the 0.25 gap, `state/layout.ts:72` | pinned and switcher column width |
| `tooltip` | Mantine `Tooltip`, `multiline`, `w` 300 (glossary tips, `ui.tsx:41`) / 260 (`ChordsPanel.tsx:23`) / 240 (`RetunerPanel.tsx:51`), `openDelay` 250 / 250 / 200, `position="top"` only on the glossary tips (`ui.tsx:43`; the `ChordsPanel` and `RetunerPanel` tooltips set no position); glossary tips open on hover, focus and touch (`ui.tsx:44`); term in weight 600 on its own line then the text (`ui.tsx:47-50`) | px, ms | as listed | the lab sets no tooltip colours or radius: the look is Mantine's default with the shell theme. The three widths differ; the kit should fix one (Q6) |
| `tip-label` (term with a glossary tip) | dotted 1px underline in `--text-subtle`, `cursor: help`, no background, inherit font | | `LAB lab.module.css:270-279` (`.tip`); `ui.tsx:60` | |
| `focus-ring` | 2px solid `--focus-ring`, offset 1px | | `LAB lab.module.css:336-343` | for the lab's own buttons (`.tip`, `.switchChip` and others) |

### 5b. Controls

| control | props the lab uses | source | where the value comes from |
| --- | --- | --- | --- |
| Switch (Mantine) | `size="sm"`, `label`, default checked | `RetunerPanel.tsx:124` (`<Switch defaultChecked label="Retuner on" size="sm" />`) | size set at the call site; colours are the shell theme's. The only Mantine `Switch` in the lab, in the retuner mock panel |
| Switch-style toggle (the "switch class" chip) | a plain `<button type="button">` with `aria-pressed` and `data-on`; CSS below | `GeneratorColumn.tsx:64-74` (prime filter chips); CSS `LAB lab.module.css:397-413` | not a Mantine component. Off: background `--panel-slot`, 1px border `--control-border`, text `--text-muted`, radius `--radius-control`, font 0.75rem, padding 0.1875rem 0. On (`[data-on='true']`): background and border `--accent`, text `--mantine-primary-color-contrast`. Grid of chips: `repeat(auto-fill, minmax(2.25rem, 1fr))`, gap 0.1875rem (`LAB lab.module.css:391-394`). Focus ring shared with the lab's other buttons (`:341`). The comment on the CSS says "switch class: independent on/off that changes the material; accent fill while on" |
| SegmentedControl | `size="xs"`; `fullWidth` for a whole-row method switch | `GeneratorColumn.tsx:364-371`, `RetunerPanel.tsx:131-136,165-170`, `RingStats.tsx:203-205` | height from `--input-height-xs` (26 px); radius and colours are the theme's. Not set; Mantine default for everything but the size |
| NumberInput | `size="xs"`, `hideControls`, fixed `w` 64 (counts) or 72 (ms) | `RetunerPanel.tsx:188,194,204-209` | width fixed at the call site; the lab wraps editable ones in `CommitNumber` (`ui.tsx:182-210`, `allowDecimal={false}`, `clampBehavior="strict"`, commits after a 120 ms pause, `REGEN_DELAY_MS = 120`, `ui.tsx:135`) |
| Select (NativeSelect) | `size="xs"`, `w` 110 or full width | `RetunerPanel.tsx:151-156,176-180` | |
| TextInput | plain `TextInput size="xs"` (template editor, `ChordsPanel.tsx:79-81`); `DebouncedText` (`ui.tsx:213`) elsewhere, e.g. `GeneratorColumn.tsx` | `ChordsPanel.tsx:79-81`, `GeneratorColumn.tsx` | |
| ActionIcon | `size="sm"`, `variant="subtle" color="gray"` for header tools (`Panels.tsx:193-290`); `variant="default"` for in-body tools (`ChordsPanel.tsx:152,164`; `:87` is `subtle` gray, `GeneratorColumn.tsx:353`) | as listed | the pixel size of Mantine's `sm` ActionIcon is not set in the lab and not measured here: "Mantine default" |
| Button | `size="xs" variant="default"` (`RetunerPanel.tsx:107,140`, `ChordsPanel.tsx:99,107`); `size="compact-xs" variant="default"` for header actions (`ChordsPanel.tsx:139`, `GeneratorColumn.tsx:285`) | as listed | sizes only; no custom CSS |

Rule inferred from the lab (not written down anywhere): header strip tools are **subtle gray `sm` ActionIcons** or `compact-xs` default Buttons; in-body actions are `xs` default Buttons or `sm` default ActionIcons.

### 5c. Lab vs the workbench's `compactTheme.ts`

`composition-workbench/compactTheme.ts:29-39` sets component defaults through `MantineThemeProvider` (an explicit `size` at a call site wins): Button `compact-xs`, ActionIcon `sm`, Badge `sm`, TextInput `xs`, Textarea `xs`, NumberInput `xs`, Select `xs`, MultiSelect `xs`, SegmentedControl `xs`, Checkbox `xs`, Switch `xs`. It sets no spacing, no font size and no row heights, and (per its own comment) no radius.

Differences:
- **Switch**: workbench default `xs`; lab call site `sm` (`RetunerPanel.tsx:124`). The lab's real binary-option control is the custom `switchChip` button, which the workbench has no equivalent for.
- **Button**: workbench default `compact-xs` everywhere; the lab mixes `xs` (body) and `compact-xs` (header).
- **Inputs**: both use `xs`, but the lab also overrides the xs input height to 1.625rem (`LAB lab.module.css:7`); the workbench leaves Mantine's default (not measured).
- **Spacing, header strip, kv rows, text sizes, splitters**: the lab sets them in its own CSS (table 5a); the workbench has no equivalent in `compactTheme.ts` and relies on per-panel CSS and inline sizes (the Inspector, `CompositionInspector.tsx`, not measured by this milestone).
- **Where it applies**: the workbench sizes apply to a whole page through a provider; the lab applies sizes per call site. The Stage kit should fix sizes in the kit's wrappers (M4), with one density token set, so neither a provider nor call sites carry the sizes.

## 6. Gap list

### What the lab's layout does not do that the Stage needs

- **No size awareness.** The lab chooses between layouts by window width only (`fitColumns(widthRem)`, `state/layout.ts:77-83`, and the `@media (max-width: 70em)` rule, `lab.module.css:64`). No panel receives a size; each panel is built for 24rem. The Stage adds a per-slot `ResizeObserver` and the module-size contract.
- **Hardcoded `PanelId` union.** Panels, their labels (`panelLabel`), their render switch (`Panels.tsx:45`) and their default views are keyed to a closed union in `state/layout.ts`. The Stage needs an open registry of ids with a parser that drops unknown ids.
- **Page-local.** `state/layout.ts`, `Panels.tsx` and `ui.tsx` live inside the lab and import its state context (`useLab`, `useViz`, `ui.tsx:132`) and glossary (`TIPS`). Nothing outside the lab can use them; the kit's `Strip`, `Row`, `Num` are generic but are wired to `PinActionsContext` and the lab's tip texts. The Stage's kit has to be page-independent.
- **No shared components.** `Strip`, `Row`, `Num`, `Tip`, `CommitNumber`, `DebouncedText` are not in `src/components/`; the workbench re-implements the same ideas separately. Promotion is M6.
- **Fixed column model.** Columns are 24rem wide, one to three panels each (`MAX_STACK = 3`, `state/layout.ts:86`); there are no variable widths and no per-column minimum other than the fit rule.
- **No size-driven restructuring inside a panel.** A panel with a two-column cluster grid (`.clusters`, `panels.module.css:709`) has no narrow rendering.
- **No mounted-once guarantee for moves.** The lab remounts a panel when it changes column (its panels are re-rendered from the layout); the Stage needs the keyed, portal-based rule in section 3.
- **Splitters are vertical only** (between stacked panels); the Stage's splitters are the same idea (small adjustments, pointer and keyboard), and column-width splitters are not in the lab at all. Whether the Stage needs a horizontal splitter is open (Q12).

### What the workbench centre does today that the Stage would replace later (no migration plan here; that is M6)

- **`SplitStage`** (`composition-workbench/components/SplitStage.tsx`): a hardcoded vertical split of canvas above and bottom panel below, share clamped 0.2 to 0.8, 1rem grip with a 3px handle, keyboard support. One fixed arrangement, not a layout.
- **`ClipEditorSlot`** (`components/ClipEditorSlot.tsx`): a special-case slot the open clip's editor is placed in, rather than a module in a registered slot.
- **`canvasTakeover`** (`components/canvasTakeover.tsx`): a named slot over the desk area that an editor fills by portal, (the fallback to its own dock when no slot exists is in `ChordPickerHost`, `:28-29,50`, not here); the Stage's slots make this a normal case (the picker is one module that can sit anywhere).
- **Chord dock** (`ChordPickerHost.tsx`): a width-resizable dock beside the roll, per-viewer prefs `chordDockWidth` and `chordHost` (W-10, W-17). On the Stage the dock is a slot and its width a splitter share in the layout.

## 7. Open questions for the human checkpoint

Naming and vocabulary
- **Q1.** Confirm the five words: region, module, slot, layout, size. Confirm the size classes are named `narrow`/`regular`/`wide` and `short`/`regular`/`tall` (and the data attribute `data-slot-size="<width>-<height>"`).

Thresholds (none is fixed by code except where cited)
- **Q2.** Width: `narrow` below 24rem, `wide` from 40rem. The 24rem anchor is the lab column; the 40rem is a proposal (nothing in the code sets it). The 20rem media-query case above also bears on it. Keep, or move?
- **Q3.** Height: `short` below 12rem, `tall` from 28rem. Both are proposals with no code anchor, only the 6rem minimum and the 1.875rem strip. Keep, or measure on real modules in M3/M5 and set then?
- **Q4.** Hysteresis of 0.5rem before a class changes. Wanted, or simpler without it?
- **Q5.** Measure the border-box of the slot body (padding included, header strip excluded), or the content box? Proposed border-box.

Kit tokens
- **Q6.** Tooltip: the lab uses three widths (300, 260, 240) and two open delays (250, 200). Fix one (proposed: 300 wide, 250 ms delay, `position="top"`).
- **Q7.** Toggle: the lab has two binary controls, the custom `switchChip` button (accent fill while on) and one Mantine `Switch size="sm"`. The request names "switch-style toggle"; which is the one the kit wraps? Proposed: the `switchChip` look (a pressed button, `aria-pressed`) for a group of independent options (prime filter), and Mantine `Switch size="sm"` for a single labelled on/off setting.
- **Q8.** Density: the lab's values are the only density measured. Should the kit have a second density (the workbench's) or exactly one? ARC M4 says "one named density setting"; confirm.
- **Q9.** Row height: the lab has no row-height token (rows are the 1.3 line height, inputs are 1.625rem). Should the kit add one fixed row height (proposed 1.625rem to match `--input-height-xs`) so rows align across panels, or keep rows at line height?
- **Q10.** Header strip: 1.875rem, 0.75rem title. Used as is. Do the Stage's slot strips and the Inspector's panel strips share it (proposed: yes, one strip)?
- **Q11.** The workbench Inspector (`CompositionInspector.tsx`) was not measured in this milestone; the kit takes its numbers from the lab only. Confirm that is what is wanted, and whether the workbench's spacing should be compared at M4.
- **Q12.** Horizontal splitters (column width) are not in the lab. Needed in M2/M3, or only the vertical stack splitter?

## 8. What could not be verified

- Mantine's own default pixel sizes (ActionIcon `sm`, Switch `sm`, input `xs` default, SegmentedControl `xs`) were not looked up; the table says "Mantine default" where the lab does not set them.
- Several CSS values were quoted from reading the file section, with line numbers that may drift by a few lines when another arc edits the lab (a few citations are approximate). The lab is under active work by another arc.
- The workbench Inspector's own CSS and the chord picker's internal CSS were not measured.
- The piano-roll rendering table (4b) and the chord picker rendering table (4a) are proposals for M5, not measurements of existing behaviour, except where a W-decision is cited.
- No module in the lab or the workbench keeps its state when moved today: the lab remounts a panel when it changes column and when it moves to or from the top of a stack (`Panels.tsx:299`, `:308`), and the chord host remounts its body when switching between dock and takeover. The mounted-once rule is new code with no precedent.
