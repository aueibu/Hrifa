# UI rules (standing; read before ANY UI work in shell/)

**Order of authority (the human, 2026-11-24).** When two sources disagree, the lower number wins:
1. **Blender**: UI, terminology and data models (how the app is structured and named: editors, data-blocks, outliner, operators, modifiers).
2. **Bitwig**: UI, tooltips and hover help, and audio decisions (how a music tool behaves: transport, timeline, piano roll, devices, audio). Bitwig's guide has no tooltips by that name: hover help is the footer, so for tooltip wording use Blender's `tooltips.md` and for where hover help appears use Bitwig's footer.
3. **The human's own ideas**: where Blender and Bitwig are silent, or a deviation the human states on purpose.
4. **Existing overrides and plans** in the repo (`DECISIONS.md`, arc plans, older conventions, the code as it stands): they yield to 1 to 3 and are revisited when they conflict.
A live instruction from the human in the current conversation always wins; when it deviates from 1 or 2, it is recorded in `DECISIONS.md` as a deviation so it is not undone later. Check what Blender and Bitwig do first; invent only where they are silent, and say so. A builder brief for UI says "read `shell/UI-RULES.md`" and adds only what is specific to the task.

Sources (quoted below; re-fetch when in doubt):
- **Local clones (preferred: grep these first; read-only reference, outside the repo, refresh with `git pull`)**: `C:/Users/apoor/reference/blender-developer-docs` (ALL text, no images; the HIG is under `docs/features/interface/human_interface_guidelines/`, plus `outliner.md`, `views/tree_views.md`, `operators.md`, `preferences_and_defaults.md`) and `C:/Users/apoor/reference/blender-manual` (ALL text, no images; Blender's user-facing behavior: `editors/outliner/editing.rst` Delete versus Delete Hierarchy, `editors/nla/`, `editors/video_sequencer/sequencer/` and `editors/timeline.rst` for time views). Cloned 2026-11-24 with `git clone --filter=blob:none --no-checkout` and a no-cone sparse set that leaves out image folders and binaries; `git pull` refreshes them.
- **Bitwig user guide, local mirror**: `C:/Users/apoor/reference/bitwig-user-guide/text/<page>.txt` (plain text, first line is the source URL; grep this) and `.../html/` (pages as served), 104 pages of `bitwig.com/userguide/latest/`, plus the full guide as a PDF in the same folder. Personal reading copy, not in the repo; refresh by re-running a crawl of the same prefix.
- **Blender HIG**, source files `projects.blender.org/blender/blender-developer-docs/raw/branch/main/docs/features/interface/human_interface_guidelines/<page>.md` (the published site refuses automated fetches). The HIG says it is "still in development ... a lot of content is still missing", and it gives NO spacing or pixel values.
- **Bitwig user guide**, `bitwig.com/userguide/latest/` (`user_interfacing`, `the_window_body`, `the_window_footer`, `the_edit_view`; Inspector and Device Panel from `bws44-504`). On undo it says only that the Edit menu provides "standard "edit" commands for your current selection ... as well as to undo (or redo) recent actions taken across the program" (`the_window_menus_transport_area`); it never uses the word tooltip (hover help is the footer).
- Bitwig's installed resources (`C:\Program Files\Bitwig Studio`, see `arcs/workbench/RESEARCH.bitwig-note-editor.md`) and Blender's manual notes (`arcs/workbench/RESEARCH.blender.md`) for editor behavior.

## 1. Calm: no flicker, no popping (Blender HIG best_practices; the human's meaning)
- Blender: "Keep the UI calm. Avoid strong changes in colors, big jumps in layouts, or popping elements on simple interactions." And: "strong mouse hover highlights can be very flashy and cause distracting visual noise; some subtle changes can be okay." Color: "The UI should remain calm with subtle contrasts unless there's a good reason not to." "Avoid accent colors when there's no need to grab the user's attention." Animation: "should never get in the way or be used just for the sake of it."
- The human, on "no jumping text": no flicker, nothing that appears jerky. Things may move and scroll (scrolling, a list growing because the person added something, panels the person resizes, a value changing in place). NOT "nothing may ever move".
- Our practice: changing values get a stable box (fixed or minimum width, tabular numerals); an empty state is the same box with nothing in it; transient messages are overlays or a slot that is always there; no unmount and remount (a flash); hover and selection are subtle. Judge in a real browser, the whole page.

## 2. Panels follow the selection; one focus (Bitwig)
- "The Inspector Panel follows the active panel's selection, displaying all properties of that selection." "the parameters displayed in the Inspector Panel can change dramatically depending on what you have clicked on." So a Properties panel SHOWS different content for different selections; do not keep dead controls for what is not selected.
- "Only one visible panel will ever have focus at a given time." "Focus follows the panel that was last clicked or activated." "Key commands that target a specific panel are available only when that panel is in focus."
- "Going forward, we will primarily use the Inspector Panel for viewing or altering parameters and the context menu for executing functions." Right-click shows "relevant actions that can be taken".
- "The central panel cannot be hidden"; when a panel is hidden, "the central and secondary panels simply reclaim the space."
- The window never scrolls as a whole; every panel scrolls its own content (the human's rule).

## 3. Controls (Bitwig user_interfacing)
- Drag a control up or down to change it; "Double-clicking on the control restores its default value"; Ctrl-click or double-click on a numeric control types a value; "Any control at all can be fine-tuned with the mouse by SHIFT-clicking the control and dragging." "When a button is tinted orange, that control is active."
- `ScrubNumber` (our Blender `wcol_num` numeric control): **all numeric parameter fields use `ScrubNumber`, never `NumberInput`**. Rests on raised `--panel-slot` with `ew-resize` horizontal drag (Shift for 0.1x), single-click (or Enter/Space) switches to recessed `--input-bg` text entry, double-click resets to `defaultValue`. Pass `range={[min, max]}` only for a genuinely bounded range (draws the `--accent` fill bar, bipolar from zero when signed); pass `clamp={[min, max]}` for a safety clamp with no fill bar.
- Footer help: "any interactive object that is hovered over will display information and available mouse functions here" (Bitwig's equivalent of our ready line and hints).
- Blender: "Enums should be represented as dropdown if: It contains more than 2-3 items." A property that defines a panel's function is a full-width mode toggle at the top. "Related properties should be grouped with headings where possible." "The use of subpanels is generally preferred over a single label button in a row above a block of buttons." Editor header: mode toggle on the left, display options on the right, data selector in the center. "Try to establish a left-to-right, top-to-bottom reading flow." "Do not use "fancy" spacial layouts to communicate meaning."
- Blender: "The default choice is a label." Icons: "When using an icon without label, give it a tooltip." "One icon for one thing." "Avoid using color as the only way of communicating status or other important meaning" (pair color with a shape, icon or label).

## 4. State and feedback (Blender)
- A disabled button explains why: "If a button is disabled, this text will explain why" (tooltips.md). Our ready line (`ARCHITECTURE.md`, "Ready line") is the panel-level version.
- "Blender doesn't pop up requesters that require the user to fill in data before things execute." "Modal dialogs are not great design and should be avoided"; they must not be the only protection against data loss.
- Blocking work "should be clearly indicated and allow an immediate exit"; background work reads "Importing USD..." (gerund, sentence case, ellipsis).
- Undo: one program-wide undo and redo in the Edit menu (Bitwig: "recent actions taken across the program"). Blender pushes an undo step when scene selection changes. Not adopted here for per-viewer selection state (decided in O2a: selection is session state, not history); data edits are undoable.
- Nothing sounds unless the person asks (the human's rule). What is open stays open: deleting leaves a blank placeholder, never another thing (the human's rule).

## 5. Words (Blender writing_style, tooltips)
- "Use American English." "Keep text short and to the point." Titles in title case; "Do not capitalize mesh, object, vertex group, etc." in running text. No abbreviations ("verts", "loc", "rot"), no contractions, no pronouns ("Do not use pronouns, such as you. This sounds like an accusation towards the user"). No implementation words (flag, string, ID): say "data-block".
- Verbs over nouns: "Emphasize actions, not things." Checkbox labels have no "Enable", "Use", "Is": "Transparency", not "Use Transparency". "Append an ellipsis ("...") to labels when an operation expects further input from the user"; never on an item that just opens a sub-menu. "Prepend an asterisk" when something related has been modified (Bitwig: "An asterisk (*) will be appended to any project's name if unsaved changes have been made").
- Tooltips: "Tooltips should first and foremost be helpful." Start with a verb; no trailing period unless several sentences; describe only the positive state of a toggle ("Show in Viewport"); do not document defaults.
- Ours: Blender's vocabulary where adopted (`arcs/workbench/VOCABULARY.md`); in JI and pitch-set contexts never use tonal words (major, minor, triad, inversion): use a:b:c, 1/(a:b:c), monzos, midicents.

## 6. Reuse, never invent (the human, repeatedly)
When a view should look or behave like an existing one, open that component and its CSS and reuse its exact classes, sizes and values (or import the shared piece). Never invent dimensions, chips, toggles or chart colors: grep for the existing control of that kind. Colors are theme roles (`src/theme/THEMING.md`), never palette shades or hex. Blender and Bitwig give no pixel values, so spacing and sizes always come from the existing components.

## 7. How a look change is delivered (the human)
Thin slice first: the smallest working version, then STOP and tell the person exactly what to click and what to look at. No reviewer, gate, decision row or commit for a look until they have tried it. Design questions come before building, with an example where the options differ and one recommendation, in plain words.

## 8. Briefing a builder for UI (orchestrator checklist)
1. Quote the human's own words about placement and behavior; mark any placement detail that is mine.
2. Name the reference component(s) with file and line, and the exact values to reuse.
3. State the layout shape the human gave (what sits side by side, what scrolls).
4. Say "read `shell/UI-RULES.md`". Never restate section 1 as "nothing moves".
5. When a Blender or Bitwig convention applies, name the section here, not a paraphrase.
