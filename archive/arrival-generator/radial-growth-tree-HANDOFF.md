---
title: Radial Growth Tree — handoff for TSX/Mantine port
date: 2026-08-10
source file: radial-growth-tree.html (single self-contained HTML/JS prototype)
scope: this document only. Ignore other files in this folder (index.html, marbled-slice-explorer.html) — out of scope.
---

# What this app is

A toroidal-lattice tree-growth visualizer. Points are placed on a `Z_N × Z_N` torus by projecting a chosen Platonic/Archimedean/Catalan/Johnson/Prism/Antiprism/Irregular solid's vertices/edge-midpoints/face-centroids onto a plane (optionally iterated through a cat-map mixing matrix), then a directed-ray growth algorithm walks outward from a chosen origin point, producing a branching tree. Two views: a 3D view of the solid + its projection onto the grid, and a 2D view of the grid + the grown tree, with full pan/zoom/hover interaction.

Three logically distinct subsystems, in pipeline order:

1. **Point placement** — solid → lattice points (`SOLIDS` data, `seedPoints`, `computeTrajectories`, `accumulateArrivals`).
2. **Growth engine** — O/P/Q circle construction + directed-ray tree walk over whatever point set subsystem 1 produced (`nearestDistinctRadii`, `applyQFormula`, `applyChildFormula`, `runAlgorithm`).
3. **Rendering/interaction** — 3D solid view (Three.js), 2D canvas rendering of points + tree, pan/zoom, hover tooltips, origin selection.

These are cleanly separable — the growth engine only ever consumes a plain array of `{x, y}` points and a grid size `n`; it has no knowledge of solids, projection, or mixing. Worth preserving that boundary in the port (e.g. as separate modules/hooks), since it's what let point placement be swapped out earlier without touching the growth engine at all.

---

# 1. Point placement

## 1.1 Solid data

`SOLIDS`: an object keyed by solid id (e.g. `"tetrahedron"`, `"cube"`, `"sphenomegacorona"`), 140 entries total. Each entry:

```
{
  klass: 'Platonic' | 'Archimedean' | 'Catalan' | 'Johnson' | 'Prism' | 'Antiprism' | 'Irregular',
  label: string,               // display name
  v: [[x,y,z], ...],           // vertex coordinates, already canonicalized (recentered on centroid,
                                // rotated so a structurally meaningful axis is z — see source comments
                                // for the axis-selection rule; this is baked into the data, not computed live)
  edges: [[i,j], ...],          // vertex index pairs
  faces?: [[i,j,k,...], ...],   // vertex index loops; ABSENT for Catalan solids (no face data in source dataset)
}
```

Class counts: 5 Platonic, 13 Archimedean, 13 Catalan (derived as polar duals of the Archimedean set — vertex/edge only, no faces), 92 Johnson, 8 Prism, 8 Antiprism, 1 Irregular (`shearedTetrahedron`, a hand-added affine-sheared example).

This data is large (~140 solids of coordinate data) and static — port it as a JSON asset or a generated TS const, not hand-transcribed.

## 1.2 Source points from a solid

```
sourcePoints3D(solidKey, opts: {vertices, edges, faces}) → [{ pos: [x,y,z], origin: 'vertex'|'edge'|'face', originIdx: number }]
```

Vertices are used as-is. Edge points are edge midpoints (`midpoint3`). Face points are face centroids (`centroid3`, mean of the face's vertices). `originIdx` is the index into `solid.edges`/`solid.faces`/`solid.v` respectively — kept for provenance, not currently surfaced in this app's UI (it was in the sibling arrival-generator app's click-to-inspect panel; not reproduced here).

## 1.3 Projection onto the lattice

The z axis is dropped (it's the solid's own canonical projection axis, already baked into the data). Given grid size `N`:

```
scale s = (N * 0.36) / maxAbs      // maxAbs = max |x| or |y| over all VERTEX coords (not edge/face points)
center c = N / 2
continuous position: (c + x*s, c + y*s)
snapped lattice cell: (mod(round(c + x*s), N), mod(round(c + y*s), N))
```

`maxAbs`/`s`/`c` are always computed from vertices only, even when vertex seeding is toggled off — this keeps the frame from jumping when edge/face toggles change independent of the solid's own scale. `mod(a,n) = ((a % n) + n) % n` (handles negative inputs).

`projectSourcePoints(solidKey, N, opts)` returns this per-point (continuous + snapped position, both), used for the 3D drop-line visualization. `seedPoints(solidKey, N, opts)` (below) is the one that actually produces the point set the rest of the app consumes.

## 1.4 True shadow groups → weighted lattice points (`seedPoints`)

Before any lattice/rounding exists, source points are grouped by **exact** `(x,y)` coincidence (`x.toFixed(9) + ',' + y.toFixed(9)` as the group key — this is a real-geometry equality check, not a rounding-tolerance one). This is `trueShadowGroups(solidKey, opts)`, and it's independent of `N` — a property of the solid alone.

Each true group is then rounded to a lattice cell **once** (never per-member-point), and groups that land on the same cell are merged:

```
seedPoints(solidKey, N, opts) → {
  points: [{ u, v, weight, members: [{origin, originIdx}, ...], resolutionMerged: bool, structuralGroups: number }],
  trueGroupCount: number,   // N-independent
  rawPointCount: number,    // total source points before grouping
}
```

`weight` = number of source points that coincide there — real structural multiplicity, not authored. `resolutionMerged: true` flags a cell where **two distinct true groups** (different real (x,y) positions) both rounded onto the same lattice cell — a grid-too-coarse artifact, not real symmetry. This distinction matters if you ever want to surface "is this weight structural or a resolution collision" in the UI; the current UI doesn't display it but the data carries it.

## 1.5 Cat-map mixing (optional iteration)

A user-configurable integer matrix `M = {a,b,c,d}` (default `[[1,1],[1,2]]`, the textbook Arnold cat map — presented as a default, not a hard rule).

```
catStep(u, v, N, M) = ( mod(M.a*u + M.b*v, N), mod(M.c*u + M.d*v, N) )

computeTrajectories(seeds, t, N, M) → frames[0..t]
  frames[0] = seeds (each tagged with a seedIdx)
  frames[k] = frames[k-1] stepped once via catStep, same weight/seedIdx carried through

accumulateArrivals(frames) → [{ u, v, weight, visits, seedIdxs: [...], iterations: [...] }]
  unions every (u,v) touched across ALL frames 0..t (not just the final one), summing weight
  and visit count per cell. Rationale (from the sibling app's design notes, still valid here):
  a bijective map never creates points, it only reshuffles the ones you started with, so a
  final-frame-only view stays exactly as sparse as the seed no matter how long you iterate.
  Accumulating is what actually gets richer with more iterations.
```

Bijectivity diagnostic (matters for interpreting the matrix, not required for correctness — a non-bijective matrix is allowed on purpose, points are just allowed to converge):

```
matrixBijective(M, N) = { det: M.a*M.d - M.b*M.c, detModN: mod(det, N), bijective: gcd(detModN, N) === 1 }
```

`catMapPeriod(N, M, cap)` finds the smallest `k` with `M^k ≡ I (mod N)` by repeated matrix multiplication mod N, up to `cap` iterations; returns `null` if not found within cap (correct behavior for non-bijective matrices, which have no period). Present in the code, not currently wired into the UI — available if the port wants a period readout.

The small "mixing preview" canvas is a pure diagnostic, decoupled from real data: one fixed irrational-ish point `(0.70710678, 0.61803399)` iterated 4000 times on the continuous `[0,1)×[0,1)` torus under the current matrix, plotted as scatter. Never feeds into the actual point set.

## 1.6 Which layer feeds the tree

Three choices, user-selectable ("Grow tree from"):

- `seed` — `frames[0]`, i.e. `seedPoints` output directly, t=0.
- `final` — `frames[t]`, the last iteration only.
- `accumulated` — union across `frames[0..t]` (default; richest layer).

Whichever is chosen gets mapped to the growth engine's input shape: `{ x: u, y: v, weight }` per point. **`weight` is carried through but not currently used by the growth engine itself** — it's informational only in this app (unlike the sibling arrival-generator app, which doesn't have a tree engine to feed).

**Edge case**: if all three source toggles (vertices/edges/faces) are off, `seedPoints` returns zero points, and the pipeline correctly produces an empty point set. The render layer must guard this (see §3.6) rather than assume `points.length > 0`.

---

# 2. Growth engine

Pure function of `(points: {x,y}[], n: number, originIdx: number)` plus a set of formula/mode parameters (below). No knowledge of solids or the mixing pipeline.

## 2.1 Toroidal distance

```
torDelta(ax, ay, bx, by, gridN, wrap):
  dx = bx-ax, dy = by-ay
  if wrap: dx -= gridN * round(dx/gridN); dy -= gridN * round(dy/gridN)   // minimum-image convention
  return {dx, dy}
```

`wrap` is a user toggle (default on). When off, this collapses to a flat (non-toroidal) delta.

## 2.2 O and P radii at a point

For an origin point `A`, look at every other point's toroidal distance from `A`. `radiusO` = the smallest distance present. `radiusP` = the smallest distance **strictly greater than radiusO by exact squared-distance comparison** (`d2 = dx²+dy²`, compared as integers since coordinates are integers — avoids float epsilon issues on ties, which are common on an integer lattice).

```
nearestDistinctRadii(originAbs, excludeSet?) → { radiusO, radiusP }
```

If the origin has no other points to compare against (field exhausted around it — can happen with `excludeSet` active), returns `{radiusO: 0, radiusP: 0}`; the search from that node will then correctly dead-end rather than crash.

`excludeSet`, when provided, removes already-visited points from consideration — used by the "only consider unused points" option (see §2.5).

## 2.3 Circle Q (seed radius) and child search radius

Both are formulas over `(radiusO, radiusP)`, user-selectable via dropdown:

**Circle Q radius** (`applyQFormula`) — determines which points near the origin become gen-1 children:
| id | formula |
|---|---|
| `OP` (default) | `radiusO * radiusP` |
| `OPSUM` | `radiusO + radiusP` |
| `DIASUM` | `2*radiusO + 2*radiusP` |
| `OP2` | `(radiusO * radiusP)²` |
| `P2` | `radiusP²` |
| `O3` | `radiusO³` |

**Child search radius** (`applyChildFormula`) — the radius each node searches within for its own next hop:
| id | formula |
|---|---|
| `P` (default) | `radiusP` |
| `2P` | `2 * radiusP` |
| `P2` | `radiusP²` |
| `OP` | `radiusO * radiusP` |

## 2.4 The walk

**Gen-1 (children of A):** every point within `radiusQ` of the origin `A` becomes a top-level child. Each starts its own walk, direction initialized as the vector from `A` to that child.

**Per-hop candidate search** (`collectCandidates`), given a current node, its incoming direction, and a visited-set:

- Candidates are filtered to unvisited points within the child search radius of the current node.
- Angle to each candidate is measured relative to the current direction (`angleBetween`, via dot product / magnitudes, `acos`, degrees).
- Two angle-window modes (user-selectable):
  - **Widening cone** (default): try `theta = 0, step, 2*step, ...` up to `maxDeg`; use the **first** theta step that yields ≥1 candidate. (`step`, `maxDeg` are user params, defaults 10°/50°.)
  - **Exclude-ray band**: a single fixed window, points with angle in `[excludeDeg, spanDeg]` from the current direction (both sides — mirrored, i.e. it's actually two symmetric wedges). Defaults 20°/90°.
- The search "area" (`theta_radians * searchRadius²` for widen mode, `(spanDeg-excludeDeg)_radians * searchRadius²` for exclude mode) is computed alongside the candidate list — used for the branching density decision (§2.6), not just diagnostics.
- **Quenched vs. annealed** (`annealToggle`, default off/quenched): quenched = `radiusO/P/Q`/search radius are computed once at `A` and reused unchanged for every node in the tree. Annealed = recomputed fresh from each node's own local neighbors at every hop. Annealed mode has a sub-option, "only consider unused points" (`excludeVisitedToggle`) — when on, the O/P recomputation at each node excludes points the walk has already consumed, so local radii reflect actual remaining density rather than the field's total ambient density (radii tend to grow as a region empties out).
- **Special gen-1-first-hop rule**: a top-level child's own very first search treats `A` as an available candidate (normally excluded — a child shouldn't walk back to origin, except this once) while explicitly excluding its **sibling** gen-1 children (so siblings don't immediately walk into each other). This rule applies only to that one search, never again deeper in the tree.

**Decision at each node**, once candidates are found:

- `localDensity = candidateCount / searchArea` (or `Infinity` if area is 0).
- If `maxBranches > 1` AND `localDensity >= branchDensityThreshold`: keep the `maxBranches` closest candidates (branch). Otherwise: keep only the single closest candidate (continue straight).
- If more than one candidate is kept, that node is recorded as a **branch point**.
- All kept candidates are reserved in the visited-set **before** recursing into any of them (prevents two siblings from claiming the same next point in the same generation).
- **Visited-set scope**: `shareVisitedToggle` (default off) controls whether all gen-1 branches from `A` share one visited-set (on — a point consumed by one branch becomes unavailable to all others) or each branch gets its own independent visited-set (off — separate branches can legitimately reach the same point).

**Termination per node** — one of:
- **Dead end**: zero candidates found → recorded as an *endpoint*.
- **Depth cap**: `hopsRemaining` (from `maxDepth`, default 12) reaches 0 → recorded as *depth-capped* (distinct from a dead end — it's still "going", just out of hop budget).
- **Safety cap**: total segment count across the whole run hits `SEGMENT_SAFETY_CAP = 4000` → remaining nodes recorded as depth-capped. This is a render/compute cost guard, not a correctness requirement — termination is already guaranteed (visited-set exclusion bounds total edges by `points.length - 1` per branch), this cap just keeps pathological large-field/high-branching runs tractable.

## 2.5 Output shape

```
runAlgorithm(idx = originIdx) → {
  A,                          // origin point object
  others: [{rel, abs}],       // every other point, positioned in the "unrolled" local frame (see §3.2)
  radiusO, radiusP, radiusQ, searchRadius,  // quenched values computed at A
  annealed: bool,
  children: [{x,y}],          // gen-1 children, relative positions
  segments: [{ from, to, fromAbs, toAbs, dir, theta, mode, excludeDeg, spanDeg,
               searchRadius, radiusO, radiusP, radiusQ, generation }],
  endpoints: [{ rel, abs, dir, theta, mode, ..., generation }],       // dead ends
  truncatedPoints: [{ rel, abs, generation }],                        // depth/safety-capped
  truncated: number,          // truncatedPoints.length
  branchPoints: [{ rel }],
  fieldMeanDensity: points.length / n²,
  n,
}
```

`rel` positions are in an **unrolled local frame**: `A` sits at `(0,0)`, and every other point's position is the cumulative minimum-image step from wherever it was reached — i.e. this is the universal-cover unrolling of the torus, so a path that crosses a seam draws as a straight continuous line rather than jumping across the canvas. This is a rendering convenience baked into the algorithm's output, not just a view-layer transform — worth keeping in the port rather than re-deriving.

---

# 3. Rendering & interaction

This section describes **behavior/intent** to preserve, not literal canvas draw calls — the actual pixel-pushing will be redone for the new stack (though a canvas layer is probably still the right tool for the 2D torus view; Mantine/React would wrap it, not replace it with DOM nodes).

## 3.1 Two views, side by side

**3D view** (Three.js): the solid in its own canonical frame, wireframe (vertices as small spheres, edges as lines), a dashed axis line showing the projection direction, a grid plane (`GridHelper`) representing the toroidal lattice at the correct relative scale, and — when "show drop lines" is on — for every active source point: a line from the point down to its continuous shadow position on the plane, then (if the shadow doesn't already coincide with its snapped cell) a second line from shadow to snapped lattice cell, colored by origin type (vertex/edge/face — distinct colors), plus a sphere marker at each landing cell sized by `sqrt(weight)`. Auto-rotates by default; drag to rotate manually (disables auto-rotate on interaction). Rebuilding this scene (clearing and re-adding all children) is relatively expensive — only do it when the solid, N, source toggles, or "show drop lines" change, not on every growth-parameter tweak.

**2D view** (canvas): the grid, tree, and all growth-algorithm diagnostics. This is the performance-sensitive, frequently-redrawn view (redraws on every growth-parameter slider tweak, pan, zoom, and hover).

## 3.2 2D view rendering, in z-order (back to front)

1. Torus seam guide lines (faint dashed grid at every multiple of `n`, only when wrap is on and helpers are on) — shows where the "unrolled" view wraps back onto itself.
2. All points not part of the tree, tiled across every periodic copy that falls within the current view (see §3.4) — small filled dots.
3. Points the tree *has* touched — same tiling, but rendered as hollow rings instead of filled dots (visually "used" vs "unused"), matched by object identity (`===`), not position (a deep node's unrolled position can legitimately diverge from a naive single-hop projection from `A`, so position-matching would be wrong).
4. (helpers on) Circle Q (filled, very faint + dashed outline), circle O, circle P — all centered on `A`.
5. (helpers on) Faint rays from `A` through each gen-1 child, extended to the view edge.
6. (helpers on) Search cones/bands for every segment and endpoint: a filled wedge (widen mode) or two mirrored wedges (exclude mode) from that node's position, oriented along its incoming direction, out to its search radius — this is "the actual angular window that hop used," not a generic indicator.
7. Segments (the tree edges themselves) as lines, with a small found-endpoint marker; optionally (helpers on) a faint full circle at the child search radius around each segment's start.
8. Gen-1 children markers (filled white dots).
9. Endpoints (dead ends) — open circles, coral/red.
10. Branch points — open circles, violet, drawn wherever `walkNode` kept >1 candidate.
11. Depth-capped/truncated points — dashed open circles, distinct from dead ends.
12. `A` itself — filled dot + halo ring, drawn last (always on top).

Color roles (carry the *meaning*, exact hex values are re-themeable): amber = A/origin, cyan = circle O, violet = circle P, halo/lavender = circle Q, green = tree segments + found points, coral = dead ends, white/neutral = unused points + gen-1 markers, dim gray = used-point rings + depth-capped.

## 3.3 View transform

User-controlled `viewZoom` (multiplicative, clamped `[0.15, 30]`) and `viewPanX/Y` (pixel offset), composed on top of an auto-fit "base scale" computed each draw from the actual extent of what's being shown (`radiusQ` and every point's unrolled position, ×1.15 margin) so the view frames itself sensibly at the default zoom regardless of field size. World→screen: `screenX = W/2 + panX + worldX*scale`, `screenY = H/2 + panY + worldY*scale` (canvas Y grows downward, kept as-is).

## 3.4 Periodic tiling

Because the view can extend past one full `n`-wide tile (via zoom/pan), a single point's "nearest image" position isn't sufficient — its periodic copies at every `±k*n` offset may also be visible. Points (and their used/unused hover-hit-testing) are tiled up to `min(4, ceil(viewCornerReach/n) + 1)` tile-widths out from center, capped to keep render cost bounded even at extreme zoom-out.

## 3.5 Interaction

- **Pan**: click-drag on the 2D canvas (a real drag, threshold 4px before it counts as a drag rather than a click).
- **Zoom**: mouse wheel, exponential (`1.0016^-deltaY`), anchored so the world point under the cursor stays under the cursor.
- **Origin selection**: `Ctrl`+click a point on the 2D canvas → nearest actual point (toroidal distance) becomes the new origin. Camera position is preserved across the origin change (re-derives the new auto-fit scale, then corrects `viewZoom`/`pan` so nothing visually jumps).
- **Hover**: nearest point within 10px (checked across all visible periodic copies) shows a tooltip with grid coords, delta from `A`, distance, generation number, role (branched/dead end/depth-capped), and — if the node actually got to search — its local search radius and local O/P radii, plus a live overlay drawing that specific node's own O/P circles on top of the base scene (throttled to one redraw per animation frame).
- **Reroll origin** button: picks a new random origin index from the current point set (no camera preservation — this one does reset the view).
- **Reset pan/zoom** button: `viewZoom=1, pan=(0,0)`.

## 3.6 Empty point set guard

If the active point set is empty (all three source toggles off), the 2D render must skip `runAlgorithm`/draw entirely and show a message instead — `A = points[idx]` on an empty array is `undefined`, and everything downstream assumes `A` exists.

## 3.7 Readout / diagnostics panel

Text summary shown alongside the controls: point count, growth model (quenched/annealed), `r(O)`/`r(P)`/`r(Q)` at `A` (with which formula produced `r(Q)`), child search radius (with formula), annealed search-radius range across the tree (min–max, only shown when annealed), active search window description, child count, total segment count, branch point count, dead-end count, depth-capped count.

Separately, an "empirical check" control samples up to 200 random origins across the current point set and reports mean/stddev/min/max of gen-1 child count — a quick way to see how sensitive child-count is to where `A` lands, independent of any particular origin choice.

---

# 4. Full control inventory

| Control | id | Type | Range/options | Default | Effect |
|---|---|---|---|---|---|
| Solid class | `solidClass` | select | Platonic/Archimedean/Catalan/Johnson/Prism/Antiprism/Irregular | Platonic | filters `solidSelect` options |
| Solid | `solidSelect` | select | (all solids in the chosen class) | first in class | which solid to project |
| Vertices | `srcVertices` | checkbox | — | on | include vertex source points |
| Edge midpoints | `srcEdges` | checkbox | — | off | include edge-midpoint source points |
| Face centroids | `srcFaces` | checkbox | — | off | include face-centroid source points; auto-disabled + unchecked when the selected solid has no face data |
| Grid size (N) | `nRange`/`nNum` | range+number | 8–96 | 32 | lattice size |
| Iterations (t) | `tRange`/`tNum` | range+number | 0–80 | 10 | cat-map iteration count |
| Matrix a/b/c/d | `matA`/`matB`/`matC`/`matD` | number | integer | 1/1/1/2 | mixing matrix entries |
| reset to [[1,1],[1,2]] | `matReset` | button | — | — | resets matrix to default |
| Grow tree from | `growFrom` | select | seed / final / accumulated | accumulated | which layer feeds the growth engine |
| Auto-rotate solid | `autoRotate` | checkbox | — | on | 3D view auto-rotation |
| Show drop lines to grid | `showDropLines` | checkbox | — | on | 3D view drop-line rendering |
| Reroll origin (A) | `rerollABtn` | button | — | — | random new origin, resets view |
| Toroidal wrap | `wrapToggle` | checkbox | — | on | wrap-aware distance in the growth engine |
| Reset pan/zoom | `resetViewBtn` | button | — | — | resets 2D view transform |
| Show construction helpers | `helpersToggle` | checkbox | — | on | toggles O/P/Q circles, rays, search cones |
| Circle Q formula | `qFormula` | select | OP/OPSUM/DIASUM/OP2/P2/O3 | OP | see §2.3 |
| Child search formula | `childFormula` | select | P/2P/P2/OP | P | see §2.3 |
| Max chain depth | `depthRange`/`depthNum` | range+number | 1–40 | 12 | max hops per branch |
| Search angle mode | `searchMode` | select | widen / exclude | widen | see §2.4 |
| Step ° (widen) | `stepDeg` | number | 1–45 | 10 | widening cone step size |
| Max ° (widen) | `maxDeg` | number | 1–180 | 50 | widening cone cap |
| Exclude ± ° (exclude) | `excludeDeg` | number | 0–90 | 20 | exclude-band inner bound |
| Span ° (exclude) | `spanDeg` | number | 1–180 | 90 | exclude-band outer bound |
| Anneal O/P/Q | `annealToggle` | checkbox | — | off | quenched vs. annealed (§2.4) |
| Only consider unused points | `excludeVisitedToggle` | checkbox | — | off | sub-option of anneal, only shown when anneal is on |
| Max branches per node | `maxBranches` | number | 1–8 | 1 | branching cap |
| Branch density threshold | `branchDensity` | number | ≥0, step 0.001 | 0.125 | local density needed to branch |
| match field mean density | `matchDensityBtn` | button | — | — | sets branch density threshold to current field's mean density |
| Branches share visited-set | `shareVisitedToggle` | checkbox | — | off | see §2.4 |
| Sample 200 random origins | `sampleBtn` | button | — | — | runs the empirical check (§3.7) |

Recompute cost tiers, worth preserving as a distinction in the port's state management: changing **point-source controls** (solid/class/src toggles/N/t/matrix/growFrom/showDropLines) triggers the full pipeline (reproject → mix → accumulate → pick layer → rebuild 3D scene → re-run growth). Changing **growth-only controls** (Q formula, child formula, depth, search mode/angles, anneal, branching, wrap, helpers) only re-runs the growth engine + redraws the 2D canvas — the point set and 3D scene are untouched. Conflating these tiers (e.g. rebuilding the 3D scene on every slider tick) is the main perf trap to avoid.

---

# 5. Known limitations / things not to "fix" without asking

- `weight` is carried through the point pipeline but unused by the growth engine — intentional for now, not a bug.
- `resolutionMerged`/`structuralGroups` on seed points, and `catMapPeriod`, are computed but not surfaced in this app's UI — available if useful, not currently wired up.
- The gen-1-first-hop special case (origin `A` available as a candidate only for a child's very first search, siblings excluded only for that one search) is intentional, not an inconsistency — see §2.4.
- `SEGMENT_SAFETY_CAP = 4000` is a compute/render guard, not a correctness bound — don't remove it without separately confirming render cost at large N / high branching.
