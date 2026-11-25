# Hrifa Edel UI Behavior

**Status:** Working reference. Update this document when an Edel interaction or state treatment changes.

## Button hierarchy

### Primary buttons

Examples: **Add free polygon**, **Anchor polygon**, **Export SVG**, **Export PNG**, **Export Ink PNG**, and **Commit preview**.

- Resting: solid semantic primary color (`--primary-color`), paper text, and a matching border. The default primary color is deep blue (`#124E78`).
- Hover: remain in that primary color family; receive a 24% paper wash mixed into it (`--primary-lift`). This is a light-catching effect, not a conversion into a ghost button.
- Hover also lifts the button by 1 px and adds a small carbon offset shadow.
- Focus: deep-blue 3 px outline with a 2 px offset.
- Disabled: 40% opacity, default cursor, no lift or shadow.
- A primary can declare an approved semantic color by setting `--primary-color`; for example, **Commit preview** uses button orange (`#833D25`). Its hover wash is calculated from the same generic rule.

### Ghost / secondary buttons

Examples: Undo, Redo, New, Import JSON, Export JSON, Duplicate, transform operations, and edge cut/restore actions.

- Resting: paper/transparent surface with deep-blue text and border.
- Hover: paper surface with a light transparent blue wash (`--blue-hover`), carbon text, and blue border.
- Hover lifts by 1 px and gains the same small carbon offset shadow as a primary button.
- Focus and disabled behavior follow the primary-button rules.

### Destructive buttons

Example: Delete.

- Resting: paper/transparent surface with oxblood (`#A0140F`) text and border.
- Hover: solid oxblood surface with paper text and carbon offset shadow.
- Use only for genuinely destructive actions.

### Segmented controls

Examples: Edge mark, parallel placement, and canvas view modes.

- Resting segments are paper/transparent with deep-blue text.
- Hover uses the same light blue wash as ghost buttons, without the lift/shadow.
- A pressed Edge Mark or Parallel Placement segment is solid deep blue with paper text.
- Canvas view-mode segments use a carbon active state to remain legible over the stage.

## Boxes, panels, and fields

- The application rests on paper (`#F9F5F0`) with carbon (`#20201F`) text and rules.
- Panels use thin carbon-derived rules and square corners; they are structural divisions, not floating cards.
- Readout and selection boxes are paper with a carbon-derived border and DM Mono data text.
- Pair readouts use a green left rule to indicate an attachment/reference relationship.
- Selects and numeric fields are paper with a carbon-derived border. Their hover state adds a deep-blue border and blue left inset.
- Range inputs use deep-blue accent color; selection and canvas accent orange remain `#C0522E`.
- Textareas use DM Mono and the same paper field treatment.

## Selection, preview, and canvas feedback

- Canvas points, centers, and edges use a deep-blue hover with a pointer cursor.
- The active selected geometry uses orange (`#C0522E`); the anchor/reference cue uses green (`#215B3A`).
- Ghost and transform previews use dashed orange geometry; the attachment-point ring is deep blue.
- Polygon-list hover uses a green surface; the active row uses an orange inset/border.
- Edge-mark controls disable when no edge target exists. Undo and Redo disable when their history is unavailable.

## Focus, status, and persistence

- Keyboard focus is always visible through the deep-blue outline; color is not the only state cue because buttons also use border, shadow, position, pressed state, or disabled opacity.
- The Greyscale control is a persistent pressed-state toggle: **Greyscale** enables it; **Color** indicates it is active.
- Export Ink PNG temporarily disables itself and reads **Rendering ink…** while the renderer works.

## Typography

- Fraunces: app title and section headings.
- Figtree: controls, labels, instructions, and general operational UI.
- DM Mono: readouts, values, identifiers, status, and selection records.

## Review notes

This file describes the current implementation, including the orange selected/preview treatment. If the design philosophy’s later plum-selection rule becomes the chosen source of truth, update both the implementation and this document together.
