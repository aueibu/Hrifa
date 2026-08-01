# Three-Radii Triangle Construction

A dependency-free interactive tool implementing a compass-based generative process: three fixed
circle radii, reused across three sequential "generations" of circles, each generation constrained
relative to the one before it, yielding three triangles (T1, T2, T3) stacked from a bounded rule
set with open-ended variety.

Open `index.html` directly in a browser — no build step, no install, no server required.

## The rule set

Pick three radii once (e.g. 20mm, 30mm, 50mm). They're reused, one each, across every generation.

**Triangle 1 (A1, A2, A3).** A1 is a freely placed base circle using one of the three radii. A2
and A3 each use one of the remaining two radii and are centered somewhere on A1's circumference.
Three of the up-to-four A1∩A2 / A1∩A3 intersection points are chosen and connected into T1.

**Triangle 2 (B1, B2, B3).** Each B circle again draws one radius from the same pool. B1 is
centered on A2 or A3's circumference *and* must fall inside T1. B2 is centered on any A_x's
circumference *and* must fall inside a different A_y. B3 is centered on any A_x's circumference
*and* must intersect a chosen A_y. Three points are chosen from the resulting B∩A intersections to
form T2.

**Triangle 3 (C1, C2, C3).** Same radius pool again. C1 is centered on a B_n's circumference and
must intersect a chosen A_n. C2 mirrors that against a different B/A pair. C3 is centered on a B_j
and must intersect a chosen B_k. Points are drawn from C∩A (for C1/C2) and C∩B (for C3) to form T3.

## What the tool enforces automatically

- Only geometrically valid choices are exposed — invalid anchor circles (e.g. A1 for B1, since T1
  is inscribed in A1 and can never contain a point of it) are excluded outright rather than left
  in as silent dead ends.
- Valid placement arcs are computed live (numeric sampling) and highlighted on whichever circle
  you're anchoring to; dragging is clamped to that arc.
- Near-collinear (degenerate) point selections are flagged before you can lock a triangle.
- Progress auto-saves to the browser's local storage, namespaced as
  `hrifaTriangleConstructionState_v1`; a page refresh resumes exactly where you left off.
- A finished-design view stacks the three triangles as opaque layers (T1 front, T2 middle, T3
  back), with toggles for the construction scaffold, anchor-point markers, and vertex dots.
- Export to clean SVG, or to JSON capturing every choice made (radii, assignments, angles, chosen
  points) for exact reproducibility.

## A few things that turn out to be true about it

Some structural properties fell out of testing this rather than being designed in:

- T1 is always inscribed in A1 — its circumradius is exactly whatever radius got assigned to the
  base circle.
- For a base circle of radius R and a secondary circle of radius r centered on its edge, the two
  intersection points always sit at a fixed angular separation of `2·arccos(1 − r²/2R²)`,
  regardless of rotational placement. That separation is exactly 180° (antipodal) when `r = R√2`.
- T1's actual *shape* (side lengths/angles, not position) depends on only one continuous
  parameter — the relative angle between A2 and A3's placement — not two, even though there are
  two independent angle controls; global rotation doesn't affect shape.
- Among the six B/C placement rules, only B1 tests "inside a triangle" and only B2 tests "inside a
  circle" — the other four (B3, C1, C2, C3) all test the much more permissive "intersects."
  Empirically (300-trial sample), that made B1 the tightest constraint in the whole system —
  single-digit-to-teens percent arc coverage on average, sometimes no valid position at all — while
  the "intersects" rules typically leave ~60% of the anchor circle open. B1 functions as a real
  gatekeeper: the one place in the rule set where the *result* (not just the machinery) gets
  tested, and where the construction can genuinely hit a dead end.

## Notes for future iteration

- Base-radius choice for A1 matters: pick a radius R such that both other radii are `< 2R`, or
  just default to the largest of the three, to guarantee A1 actually intersects A2 and A3.
- If B1's dead-end rate ever feels like friction rather than a feature, it's the single
  highest-leverage rule to relax (e.g. loosen "inside T1" to something less strict).
