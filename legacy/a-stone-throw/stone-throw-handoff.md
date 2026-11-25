# A Stone's Throw — handoff for worldbuilding (Hrifa)

This is a status summary of "A Stone's Throw," a browser applet in the Hrifa project, written to hand off context to another chat. It is not a spec to implement — it's a description of a working tool and how its output currently feeds into worldbuilding, plus one idea being explored for extending it.

## What it is

A Stone's Throw drops a physically simulated object onto a surface, lets it bounce and settle under real physics (Rapier), and records where it comes to rest on a grid overlaid on the surface. The grid occupancy counts are then used, outside the app, as the basis for hand-drawn glyphs — small marks whose form is loosely derived from how many objects landed in a cell and which cells cluster together.

The point of running real physics rather than hand-composing grid values is that the glyphs' legitimacy comes from the fact that they trace an actual physical event: a real drop height, a real object material bouncing on a real surface material, governed by real density/stiffness/hardness data pulled from engineering references (ASM Handbook, CRC Handbook, USDA Wood Handbook, and others). The randomness in the pattern is physical randomness, not arbitrary randomness.

## Current in-world use

Right now the glyphs generated this way are visual objects that get placed onto the Hrifa world map / tiles. Their deeper in-world meaning (what they represent to a culture, whether they're inscriptions, wards, place-markers, etc.) is still open — this handoff isn't asserting an answer to that, just documenting how the mark itself is produced.

## Workflow (what actually happens in the app)

1. **Pick a surface**: a material (see roster below), a texture (smooth or rough — this scales friction and the visual/physical surface roughness), and an optional tilt from 0–30°.
2. **Pick an object**: a material (or a fully custom material with hand-set density/restitution/friction), a shape, and a target size (0.01–0.3 m). Shapes range from basic primitives and Platonic solids up through 8 prisms, 8 antiprisms, 13 Archimedean solids, 13 Catalan solids, and all 92 Johnson solids (143 shape options total) — or you can upload your own .obj/.stl mesh.
3. **Set drop height** (0.1–3 m) and **add items to a batch** (up to 60 at a time, materials/shapes can be mixed across the batch).
4. **Press Drop.** Rapier simulates every object falling, bouncing, and settling (or timing out after 12 seconds) on the surface.
5. **Read the grid.** The settle positions are binned into a grid (rows and cols each independently adjustable, 2–50; defaults to 10×10) laid over the drop surface. Each cell shows an occupancy count. The results panel also reports how many objects landed on vs. off the surface, and which cell was busiest.
6. **Export.** "Copy results" puts a plain-text grid (row-by-row counts) on the clipboard; "Export JSON" downloads the full result (surface/object config, grid dimensions, per-cell counts as an ASCII grid, on/off-surface totals, busiest cell) as a timestamped file.

## Material roster

Every material in the library can be used as either the dropped object or the surface (or both in the same drop). Restitution (bounciness) is *computed*, not looked up — from each material's density, elastic modulus, Poisson's ratio, and Vickers hardness, via a validated elastic-plastic yield model (Stronge/Johnson), at the actual impact speed implied by the chosen drop height. Friction uses real measured values where they exist (CRC Handbook), falling back to a hardness-ranked estimate otherwise.

- **18 pure elements**: tungsten, titanium, bismuth, carbon (graphite), aluminum, iron, copper, lead, zinc, vanadium, chromium, nickel, tin, antimony, zirconium, niobium, molybdenum, magnesium.
- **6 promoted non-metals**: cast iron (gray), granite, PMMA (acrylic), sapphire/alumina, nylon 6,6, PTFE (Teflon). These are outside the ductile yield model's validated range (brittle ceramics/rock or polymers), so their restitution/friction are flagged literature-informed estimates rather than computed values.
- **18 named wood species** (USDA Wood Handbook), including White Oak and Northern Red Oak: ash, beech, yellow birch, black cherry, shagbark hickory, sugar maple, red maple, black walnut, yellow-poplar, Coast Douglas-fir, loblolly pine, longleaf pine, ponderosa pine, Sitka spruce, old-growth redwood, western red cedar, and the two oaks. Wood is anisotropic and non-ductile, so its restitution is a density-based interpolation and friction is anchored on measured oak-on-oak sliding friction, not a per-species measurement.
- **Custom material**: a fully user-defined density/restitution/friction, for any object/surface not in the roster (e.g. a fictional Hrifa material).

Full sourcing (exact table/page per material) lives in `ASM_Material_Properties_Reference.xlsx` alongside the app.

## Grid → glyph logic

This is the interpretive layer, done outside the app, that turns a settled grid into a mark:

- 1 occupant in a cell → a small line or dot.
- 2 occupants → an open circle.
- 3 or more occupants → a closed dot or reinforced line.
- Adjacent occupied cells grow into a single connected, longer form rather than being drawn as separate marks.
- The final glyph is drawn by hand as a loose interpretation of the grid pattern — never a literal, mechanical cell-by-cell rendering. The grid is a scaffold for the mark, not the mark itself.

## Extension being explored: deriving sound from the same drop

Alongside the visual glyph, there's an idea to derive musical/sonic meaning from the *same* drop event — so a glyph and a short piece of sound would come from one shared physical instant rather than being generated independently. The current thinking:

- Each glyph would get three or more sonic **strata**, unique to that drop: a percussive texture, a drone, and a melodic or harmonic fragment.
- Candidate audio-descriptor parameters for shaping those strata: **spectral centroid**, **noise-to-pitch ratio**, and **spectral flux**, combined with **ADSR envelope**, **frequency**, and **volume**.
- Not yet decided: which physical outputs of the drop (object/surface material identity, computed restitution, friction, impact speed from drop height, grid occupancy counts, adjacency/cluster shape, on/off-surface ratio, etc.) would drive which audio parameters. This mapping is open design space — the app doesn't currently produce or export any audio-relevant data beyond what's already in the JSON export (materials, restitution, friction, grid counts).

This is a starting point for the other project to help think through, not a finished spec.
