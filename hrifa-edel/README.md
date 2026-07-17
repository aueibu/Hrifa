# Hrifa Relic Constructor

Open `index.html` in a modern browser. On Android, serve the folder through a local HTTP server so `app.js` and `style.css` load reliably.

## Indexed attachment workflow

1. Choose the parent polygon.
2. Choose a parent feature type and exact feature ID.
3. Choose a child feature type and exact feature ID.
4. Choose a relation, Anchor Frame, and angle offset.
5. Press **Anchor polygon**.

Features are numbered clockwise:

- Vertices: `V0`, `V1`, …
Edges remain numbered for edge-language styling; they are not separate attachment features.
- Edge midpoints: `M0`, `M1`, …, where `Mi` is the midpoint of `Ei`

Enable **Feature labels** above the canvas to display the IDs directly on the relic.

The default **Anchor** relation places the selected child feature at exactly the same coordinate as the selected parent feature. The **Anchor Frame** supplies the direction used for relation displacement and initial child facing. For a vertex or edge attachment, the selected child feature faces back toward the parent, so the child polygon projects along the chosen direction. Choose **Away from parent**, **Toward parent**, **Along boundary clockwise**, **Along boundary counterclockwise**, or **Canvas north**. **Angle offset** is applied after the frame has been chosen.

Attachments are live constraints. The saved attachment stores its feature pair, relation, orientation, angle offset, and relative scale; when a parent polygon moves, rotates, or scales, every attached descendant is recomputed from those values. Attached polygons cannot be moved or wheel-rotated directly. Move or transform their parent instead.

## Edge language

Select an edge on the canvas and assign single, removed, double, or hash styling. Double edges can be placed inside or outside the polygon. Hash edges support adjustable mark count and length.

Exports: SVG, PNG, and a readable Hrifa Edel v3 JSON document.

## Edel JSON

The JSON save format records groups, polygons, edge language, and attachment rules. Free polygons save their shape and transform. Attached polygons save their shape and attachment rule; their position, rotation, and radius are recalculated from the parent when the file is loaded. The current app loads only the Hrifa Edel version 3 format.

## Ghost preview

Scale is relative to the currently selected parent polygon: `1.00×` creates a child with the same circumradius as its parent, `0.50×` creates half the radius, and `2.00×` creates double the radius.

The proposed attached polygon is shown as a semi-transparent dashed outline before it is committed. The preview updates live when the parent, feature types and IDs, relation, orientation, angle, scale, role, or side count changes. Use the **Ghost preview** toggle above the canvas to hide or show it.


## Canvas views

- **Construction**: editing markers, polygon IDs, attachments, and optional feature/role labels.
- **Skeleton**: clean edge-only geometry.
- **Membrane**: edge geometry with polygon fills.
- **Graph**: polygon IDs, attachment links and relation labels, with optional polygon role labels.

The redundant Relic view has been removed.

## Canvas-driven selection

Canvas clicks now update the Attach panel directly:

- Vertex click selects the polygon as Parent, selects the matching vertex ID, and targets both incident edges.
- Edge midpoint click selects the matching midpoint and its edge.
- Edge click selects the matching edge feature and edge.
- Center click selects the center feature and targets all polygon edges.

Edge-language styles apply to every targeted edge. Opposite and alternating rules use the active edge target as their reference; center selection provides a whole-polygon target.

## Transform and duplicate-transform

The Transform panel can modify the existing structure or create a fully remapped duplicate first. Whole-structure duplication assigns new polygon IDs and remaps internal parent and attachment references. Rotation, mirroring, and scaling can reference the structure center, canvas center, selected polygon center, or selected parent feature.

Angle offsets and the default rotation snap now support 5-degree increments.

## Undo and redo

- Undo/redo records complete operation snapshots, not individual polygon or edge mutations.
- A multi-edge rule, grouped polygon creation, attachment, duplication, deletion, drag, or committed structure transform is reversed as one action.
- Keyboard shortcuts: Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo; Q/W decrease/increase candidate sides; E/R decrease/increase child scale by 0.25; A/S cycle child attachment features; Z/X cycle Anchor Frames; K/L cycle edge-language types; Up/Down cycle parent points (including center); Left/Right cycle parent edges (including center); Alt+Up/Down cycle parent polygons; Enter anchors the candidate polygon; and 1 toggles the ghost preview. Shortcuts do not run while a form field has focus.

## Polygon groups

- The Polygons & Groups panel lists every polygon and permits checkbox-based multi-selection.
- Selected polygons can be grouped or ungrouped.
- The initial construction is `Structure I`.
- Every committed duplicate + transform creates the next automatic structure group (`Structure II`, `Structure III`, and so on).
- The active group determines the transform target; `Whole structure` targets all polygons.

## Transform preview

- Transform buttons now create a dashed ghost preview.
- Repeated transform buttons compound within the same preview; for example, five 5-degree rotations preview a 25-degree rotation.
- The source geometry remains unchanged until `Commit preview` is pressed.
- `Cancel` or Escape discards the preview.
- Duplicate previews reserve new IDs only on commit and remap internal parent/child attachment references.
