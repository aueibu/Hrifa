---
title: Hrifa Slice → Tree → Affine Focus Transform — arrival-generator handoff
date: 2026-08-10
status: arrival generation and tree growth stages built; AFT redesign not yet started
supersedes: a-stone-throw/polyhedra-master/Hrifa_Slice_Tree_AFT_Handoff.md (v1) for the arrival-generation section only — v1's AFT critique and proposed directions still stand unchanged. v1's tree-growth critique (starburst / lobe-to-arm) is superseded by the design note below, not by this file's mechanism.
---

# What this applet is

`index.html` is the working prototype for the **arrival generation** stage of the Slice → Tree → AFT pipeline (see the v1 handoff doc referenced above for the full pipeline design). Single self-contained file — Three.js loaded from CDN, everything else inline, no build step, no companion data files, no dependency on the `polyhedra-master` folder at runtime (the polyhedron dataset was extracted from it once, offline, and is embedded directly in this file).

Portal status: `experimental` — usable, but the model may still change substantially, per `APPLET_CONVENTIONS.md`.

# What changed since v1

v1 identified three broken pieces: arrival generation, tree growth/energy, and the AFT. This session rebuilt **arrival generation only**, end to end, through several rounds of real design problems (not just implementation). Tree growth and the AFT are untouched — see "Not yet started" below.

# What it does

- Seeds a toroidal `Z_N × Z_N` grid from a real solid's own structure — vertices, edge midpoints, and face centroids, each independently toggleable — instead of hand-placed points.
- 140 real solids to choose from (Platonic, Archimedean, 13 Catalan solids derived here as polar duals, 92 Johnson, Prisms, Antiprisms, plus one synthetic "Irregular/sheared" example), sourced from George Hart's *Virtual Polyhedra* dataset via `a-stone-throw/polyhedra-master`.
- Iterates a **generalized** integer mixing matrix `[[a,b],[c,d]]` (default `[[1,1],[1,2]]`, the textbook Arnold cat map, but that was always just a default, not a rule) over the seed on the lattice.
- "Accumulated arrivals" = the union of every position visited across iterations `0..t`, not just the final frame. This is the fix for a real sparsity problem: a highly symmetric solid's vertices can collapse to very few points on projection (e.g. a cube's 8 vertices → 7 shadow cells), and a bijective map never *creates* points, it only reshuffles the ones you started with — so no amount of iterating a final-frame-only view fixes that. Accumulating instead means richness scales directly with how long you let the field run.
- A 3D view sits next to the 2D grid, showing the solid, the axis it's being projected along, and drop-lines/landing-markers onto the grid — so the causal chain (solid → shadow → lattice cell) is inspectable, not just asserted.
- Click any arrival point to see its full lineage: which solid feature it came from (vertex/edge/face + index), how its weight was derived, and its trajectory history.

# Key design decisions (so they don't get re-derived from scratch)

1. **Weight (`w_i`) = shadow multiplicity.** When two source points project to the exact same lattice cell, that's counted as weight, not authored. This only holds up if the coincidence is *real* geometry, not a rounding artifact — see point 3.
2. **Projection axis is chosen per-solid, not globally fixed**, from the shape of the solid's own vertex covariance tensor: if all three eigenvalues are equal (isotropic — true for every Platonic solid and, empirically, every Archimedean solid here, since their symmetry groups act irreducibly on R³), there's no preferred axis, so the source data's own orientation is kept untouched. If one eigenvalue is distinctly different from the other two (an elongated or flattened shape), that axis is dropped. Otherwise (most Johnson solids, which mostly have low or no symmetry) it falls back to dropping the minimum-variance axis. This mattered because, unlike the Platonic/Archimedean data, Johnson-solid coordinates in the source dataset aren't given in any consistent orientation.
3. **A `resolutionMerged` flag distinguishes real structural coincidence from grid-too-coarse artifacts.** This caught a real bug during development: floating-point noise from the axis-rotation step left symmetric vertex pairs off by ~1e-6, which straddled the rounding boundary and got misread as coincidental rather than structural (or vice versa). Fixed with a snap-to-tolerance pass at build time. One solid (`sphenomegacorona`, a Johnson solid) still flags this at every practical N — confirmed by hand that two of its vertices really do land only ~0.00017 apart in the shadow, which is a genuine property of that solid, not a bug.
4. **Richness comes from two independent levers**, both additive to the vertex-only baseline: accumulating across iterations (see above), and seeding from edge midpoints / face centroids in addition to vertices (real, non-arbitrary structure, just less prone to symmetry-collapse than vertices are). Catalan solids only have vertex/edge seeding available — face centroids aren't derivable from the dual construction used here without extra work (tracking face-adjacency cycles around each original vertex), so that's flagged in the UI rather than silently omitted.
5. **The mixing matrix is a genuine free parameter**, with a live bijectivity check: bijective on the grid iff `gcd(det mod N, N) = 1` — the same principle already established for the AFT (`gcd(a,m)=1`), just applied via determinant for the 2D case. Non-bijective matrices are allowed on purpose (points converging is treated as meaningful in the AFT section of v1, so the same logic applies here) — flagged red, not blocked. A small separate "mixing preview" diagnostic (continuous torus, one fixed point, thousands of iterations) lets you see how a candidate matrix folds before committing it to real arrivals; it never feeds into the actual arrival data.

# Verification performed

All 140 solids run clean through every combination of source-point toggles (vertices/edges/faces) and multiple test matrices, zero exceptions. Weight always exactly equals the selected raw point count (vertex + edge + face counts, as applicable). Duality checks (edge count and vertex count) pass exactly for all 13 derived Catalan solids against their Archimedean parents. Edge lists cross-checked against known vertex/edge counts for spot-checked solids. Cat-map bijectivity/period logic checked against hand-computable cases (identity default matrix reproduces the previously-verified period of 24 at N=32; a singular matrix correctly reports no finite period and correctly collapses points without crashing).

Not yet exercised in a real browser (no headless Chromium available in the build environment) — syntax and logic were verified by extracting and running the pure functions under Node, and by numerically checking the 3D scene's geometry math (extents, camera framing, no NaNs) across all solids, but nobody has actually watched it render. Worth a real smoke pass per `SMOKE_TESTS.md` conventions before calling this "maintained" rather than "experimental."

# Tree growth stage (`radial-growth-tree.html`)

A separate self-contained file — its own full copy of the `radial-growth-field.html` prototype (a standalone O/P/Q circle-growth applet, developed independently of this project's earlier tree-growth attempts), with only its point generator swapped out. Everything about the applet's own visual language, controls, and interaction model is carried over unchanged: the sidebar fieldsets, dark theme, canvas pan/zoom/hover tooltips, the "Key" legend, the "sample 200 random origins" empirical check — all identical to the source applet.

**What's original to this file vs. what's borrowed:** the growth mechanism (nearest-neighbor circles O/P at an origin point, seed radius Q from a chosen formula, then each child hops outward via a directed-ray search with widening-cone or exclude-band angle windows, optional branching, optional annealing) is untouched from `radial-growth-field.html`. Everything taken from this project's own arrival-generation work is copied verbatim from `index.html`: `seedPoints`/`sourcePoints3D`/`trueShadowGroups`/`projectSourcePoints`/`mod` (point placement), and — as of this revision — the full cat-map pipeline too (`computeTrajectories`, `accumulateArrivals`, `catStep`, `matrixBijective`, `catMapPeriod`) plus the Three.js solid-visualization view (`initThreeScene`, `updateSolidView`, drop-lines onto the plane). A new "Grow tree from" control picks which layer feeds the O/P/Q engine — seed (t=0), final arrivals (t only), or accumulated (0..t), matching the three layers the arrival generator itself exposes. Grid size, iteration count, and the mixing matrix (with its live bijectivity check and mixing-preview diagnostic) are all user-controllable, same as in `index.html`.

Two earlier tree-growth lines of work are explicitly superseded, not built on:

- v1's "starburst" critique (lobe-counted-once-at-root) — the O/P/Q directed-ray mechanism sidesteps that failure mode by construction; it was never built the count-once-at-root way to begin with.
- A separate angular-histogram/energy-budget (later field-financed/support-based) tree engine, developed and iterated substantially in an earlier session, ended up going through several redesigns (energy-budget → field-financed with a confirmed step-size invariance bug → an evidence-based model, mid-tuning when that session ended). That work was deliberately discarded in favor of the O/P/Q mechanism above, per an explicit decision this session — it's not merged in here and isn't a dependency of this file.

Verified: the full `SOLIDS` dataset (140 solids, all 7 classes) loads correctly under this file's point generator; face-availability detection (disabling face-centroid seeding for solids without face data, e.g. Catalan solids) works; the seed → trajectories → accumulated pipeline produces the expected counts (tetrahedron vertices-only: 4 seed points, 4 at any single frame since the default matrix is bijective, 31 accumulated over t=0..10); the default matrix `[[1,1],[1,2]]` correctly reports bijective at N=32; switching the "grow from" layer changes the point count as expected; the empty-source case (all three toggles off) is guarded rather than crashing; and the unmodified O/P/Q algorithm runs end-to-end against all of the above. The Three.js scene code was exercised against a stubbed renderer (real object graph, no GPU) and throws no errors. Not yet watched render in a real browser — same caveat as `index.html` below.

# Not yet started

**AFT redesign** (the "shoehorned" feeling). Proposed direction: the transform `T_{f,a}(x) = f + a(x-f) mod m` needs a genuinely cyclic domain to mean anything, and a tree doesn't have one intrinsically — imposing one (a traversal order) is exactly the kind of authored structure the rest of the system avoids. Two real fixes discussed, neither built: (a) use the tree's own planar contour/Euler-tour walk as the site ordering, which keeps the real `Z_m` machinery but derives the order rather than authoring it; or (b) drop modular arithmetic entirely for a radial transform on path-distance-from-focus, which matches tree topology natively instead of borrowing a pitch-class formalism.

Neither of these has been implemented or tested — they're proposals from discussion, not working code.

Also worth noting: `index.html` still carries an earlier, incomplete "Tree growth (radial engine)" panel in its own sidebar (ids prefixed `tree*`, functions prefixed `rg*`) from a prior attempt at this same integration, done in-place rather than as a separate applet. It's superseded by `radial-growth-tree.html` above and was left untouched this session (out of scope — flagged here rather than silently removed). Worth deleting from `index.html` to avoid confusion, next time that file is touched.
