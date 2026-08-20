---
title: Hrifa Marbled Slice Explorer — embedded-polygon slicing prototype
date: 2026-08-10
status: experimental — geometry fully verified under Node; not yet watched render in a real browser
relation: sibling to arrival-generator, not a stage of its Slice -> Tree -> AFT pipeline. Shares the same embedded 140-solid dataset (extracted once from arrival-generator/index.html, no runtime dependency on it) but is otherwise an independent tool.
---

# What this applet is

`marbled-slice-explorer.html` is a standalone prototype for a different question than arrival-generator's: instead of projecting a solid's own vertices onto a lattice, it embeds a whole population of independent flat 2D polygons inside a master 3D solid, then takes a finite-thickness slab through the whole assembly and shows which polygon fragments land inside it -- vanilla-and-chocolate batter, sliced.

Single self-contained file, matching this project's established conventions: Three.js loaded from CDN, everything else inline, no build step, no companion data files. The polyhedron dataset (140 solids -- Platonic, Archimedean, 13 Catalan, 92 Johnson, Prisms, Antiprisms, plus the synthetic "Sheared Tetrahedron") is embedded directly, copied byte-for-byte from arrival-generator's own copy so both files stay in sync with the same source data.

# What it does

- Pick any of the 140 solids as the master structure.
- Embed a configurable number of flat regular k-gons inside it -- random position (rejection-sampled inside the solid's real hull, not its bounding box), random plane orientation, random side count and scale within configurable ranges, random hue -- all deterministic from a seed.
- Move a slab through the structure: orientation (polar/azimuth angle), offset along that axis, and thickness are all live controls.
- The app computes two things every time the slab moves: the master solid's own cross-section outline, and every embedded polygon's fragment that falls inside the slab *and* inside the solid's own volume.
- The slice renders as filled, multiply-blended colored fragments over a pale "batter" background -- real color mixing where fragments overlap, not just alpha-stacking.
- Click any fragment for its lineage: source polygon id, side count, radius (absolute and relative to the solid's own scale), plane normal, center, and depth within the slab.
- A 3D view sits alongside the slice, showing the master solid's wireframe, the embedded polygons in their uncut/unclipped form (the "raw batter"), and the slab volume about to cut them -- so the causal chain from batter to slice is inspectable, the same principle arrival-generator uses for its drop-lines panel.

# Key design decisions (so they don't get re-derived from scratch)

1. **Master-hull containment is derived from the raw vertex cloud, not the given `faces` data.** 13 of the 140 solids -- the Catalan solids, derived as polar duals -- carry vertex and edge data but no `faces` array (arrival-generator's own README already flags this gap for face-centroid seeding). Rather than special-case those 13, a general incremental 3D convex hull (QuickHull-style: seed tetrahedron from extreme points, then repeatedly find visible faces for each remaining point, remove them, stitch new faces across the horizon) runs uniformly on every solid's vertex cloud. Cross-validated against the faces-derived planes for the 127 solids that do have `faces`: 3810 random test points across all of them, zero disagreements on inside/outside.
2. **Hull epsilon is scaled to the point cloud's own extent, not a fixed absolute tolerance.** Source coordinates are given to about 6 decimal places. An absolute epsilon anywhere near that precision misreads the resulting rounding noise on genuinely flat or near-flat regions as real geometry -- this blew one solid's hull up to 1599 spurious faces (and broke its containment test) before the fix. Epsilon is now scaled to the cloud's own max vertex magnitude instead.
3. **Embedded polygons are clipped against the master hull's own walls, not just the slab.** A polygon's center is placed inside the hull by rejection sampling, but a large polygon could still poke out through a lateral face without this. Each fragment is clipped, in one pass, against (every hull half-plane) union (the two slab boundary planes), all expressed as lines within the polygon's own local 2D plane.
4. **The master-outline-in-a-slab algorithm is provably complete with a single pass.** Because the slab's lower bound is by construction <= its upper bound, every point exactly on one boundary plane already satisfies the other bound -- so "original vertices satisfying both bounds, plus every original edge's crossing of either boundary plane" captures every vertex of the doubly-clipped convex polytope. No second-order crossings (one cut's boundary edge crossing the other cut) are geometrically possible. Verified directly: a slab that covers an entire solid returns exactly its original vertex count, with zero edge crossings fired.
5. **Hue is drawn continuously from the seeded PRNG (0-360 degrees), not chosen from a fixed small palette.** In keeping with this project's standing preference for structurally-derived values over hand-picked ones -- saturation and lightness are fixed so the palette still reads as coherent, but which hue any given polygon gets is not authored.
6. **Regenerating the batter and moving the knife are fully decoupled.** Changing the slab never reseeds the embedded polygons, and vice versa -- moving the slice plane shows the same batter from a different angle, matching the cake metaphor literally.

# Verification performed

- `geom_test.js` / `geom_test2.js` / `geom_test3.js`: every pure geometry function (hull construction, point-in-hull, master-outline slicing, polygon-vs-slab clipping including the parallel-plane degenerate case, generalized N-plane clipping) validated in isolation under Node -- hand-checkable synthetic cases first (cube, regular k-gons in known configurations), then cross-validated against the real 140-solid dataset.
- `smoke_harness.js`: the fully assembled app -- UI wiring, embedding generation, slice recomputation, 3D scene construction, 2D canvas draw, click-to-inspect hit-testing -- run headlessly under jsdom with a stub THREE.js/canvas layer, across one representative solid per class plus the sheared-tetrahedron synthetic example. Zero uncaught errors, zero failures.
- Extreme-parameter pass: max polygon count (600) against the largest solid in the set (truncated icosidodecahedron, 120 vertices / 236 hull faces after cleanup), thinnest and thickest slab settings, both offset extremes. All complete in under 25ms, no throws.
- Not yet watched render in a real browser -- no headless Chromium available in the build environment, same caveat arrival-generator's own README carries for the same reason. Worth a real smoke pass before calling this "maintained" rather than "experimental."

# Open questions / not yet done

- Embedded-polygon placement is uniform-random within the hull. Arrival-generator seeds from the solid's *own* structure (vertices/edges/faces) rather than arbitrary randomness -- whether the batter here should be similarly structurally derived (e.g. polygons centered on face centroids, or oriented relative to nearby hull faces) is an open question, not a decided one.
- Every embedded shape is a *regular* k-gon. Irregular polygons (independently varying edge lengths/vertex angles) were part of the original ask and would need a different, non-regular local-vertex generator -- straightforward to add, not built.
- Fragment draw order (back-to-front along the slab normal) is a visual choice for legibility, not derived from anything structural -- flagged here rather than presented as necessary.
