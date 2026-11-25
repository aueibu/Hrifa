# Browser smoke tests

Run these checks after a meaningful UI or runtime change. Serve sibling applets
over local HTTP when testing Edel's ink export; direct `file:` pages cannot use
every cross-frame browser capability.

## Workbench portal

1. Open the root `index.html` and confirm that 16 applet cards appear.
2. Select **simulation** and confirm that Grid Traversal and A Stone's Throw
   remain.
3. Search for `PDF Ingest`; confirm one card and its `Local Python service`
   runtime label.
4. Open the PDF Ingest card and confirm that it explains the local start
   command rather than attempting to process files on Pages.

## Grid Traversal

1. Place a token and confirm the directional placement affordance appears.
2. Hover a placement option and confirm the preview does not mutate the board.
3. Resolve a short run, inspect a timeline point, then export config and PNG.

## Hrifa Edel and Lines & Marks

1. Create or select an attached polygon and confirm that moving its parent
   updates the child constraint.
2. Apply each edge language (Solid, Parallel, Hash) and confirm it persists in
   an Edel JSON export/import round trip.
3. Use **Export Ink PNG** while both sibling folders are served together;
   confirm a downloaded ink rendering rather than a cross-origin-frame error.

## A Stone's Throw

1. Run a standard drop with the default material/surface settings.
2. Confirm the simulated object settles and its landing result is rendered.
3. Change one material or surface property and confirm the next run is treated
   as a distinct configuration rather than silently reusing the prior result.

## Triangle Construction

1. In Setup, confirm the three default radii load and Start construction advances to Stage 1.
2. Drag the A2 or A3 handle and confirm its placement arc/point set updates without shifting A1.
3. Pick 3 intersection points, confirm T1 locks, and advance through Stage 2 and Stage 3 the same
   way.
4. In the finished view, toggle construction circles, anchor points, and vertices, then export SVG
   and JSON and confirm both downloads are non-empty.
5. Refresh the page mid-construction and confirm the saved stage and choices are restored.

## PDF Ingest

1. Start `pdf-ingest` with its documented local command.
2. Open `http://localhost:5000`, choose a small non-sensitive PDF, and process
   one page.
3. Confirm the output Markdown is readable and that no source PDF or output is
   staged for Git.

Record the browser, date, and any failure in the relevant applet's README or
handoff note. The automated `Verify` workflow complements this checklist but
does not replace browser interaction testing.
