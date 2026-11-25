# Polygon Fold Expansion Explorer
## Codex Handoff Specification

### Purpose

Build a standalone client-side web application for exploring a polygon transformation system based on combinatorial folds, reflections, and exhaustive polygon generation.

The application should allow a user to:

1. Draw an arbitrary polygon by clicking vertices.
2. Compute a family of fold/crease constructions.
3. Reflect candidate vertices across those creases.
4. Generate all possible reflected-point candidates.
5. Exhaustively test insertion of reflected points into every original edge.
6. Construct candidate (n+1)-gons.
7. Browse and inspect the resulting hierarchy visually.

This is an exploratory geometry tool. The goal is not to enforce a single canonical result. The goal is to expose the entire construction space.

---

# Mathematical Construction

## Terminology

Given a polygon:

P = (V0, V1, ..., Vn-1)

Vertices are ordered cyclically.

Edges are:

Ei = (Vi, Vi+1)

(indices modulo n)

Edge midpoint:

Mi = midpoint(Ei)

---

# Opposite Edge Rule

For a vertex Vi:

1. Move to the next edge in the polygon ordering.
2. Advance floor(n/2) edges.
3. The resulting edge is the opposite edge.

Let:

k = floor(n/2)

Then:

OppositeEdge(i) = E(i+k)

(modulo n)

Let the midpoint of that edge be:

M*

---

# Crease Construction

Construct a crease line:

Li = line through Vi and M*

This is the fold axis.

Compute one crease for every vertex.

Total creases:

n

---

# Fold Directions

Each crease creates two fold directions:

Fi+
Fi-

Interpretation:

- Fi+ folds one combinatorial chain.
- Fi- folds the opposite combinatorial chain.

IMPORTANT:

This is NOT a physical paper simulation.

The fold side is determined combinatorially using polygon order.

We do not care if the line crosses the polygon multiple times.

This rule must work for concave polygons.

---

# Combinatorial Chain Rule

The crease vertex Vi and opposite edge split the boundary into two chains.

One chain is assigned "+"

The other is assigned "-"

For odd polygons:

n = 2k + 1

Each chain contains:

k

candidate source vertices.

---

# Reflection

For a selected fold:

Fi+
or
Fi-

Reflect every source vertex on that chain across crease Li.

Standard geometric reflection.

For each reflected source vertex:

Wij

produce reflected point:

Xij

---

# Reflected Point Candidates

Every reflected point is considered a candidate.

DO NOT select a canonical point.

Generate all candidates.

For odd n:

Each fold produces:

floor(n/2)

candidate reflected points.

Total reflected candidates:

2 * n * floor(n/2)

before filtering.

---

# Polygon Expansion

Each reflected point X is treated as a potential new vertex.

The goal is to create an (n+1)-gon.

However:

The reflected point alone does not determine the new boundary.

An insertion edge must also be selected.

---

# Exhaustive Insertion Rule

For each reflected point:

X

attempt insertion into EVERY original edge.

For edge:

Ee = (Ve, Ve+1)

create:

(Ve, X)
(X, Ve+1)

This yields candidate:

P(i,j,e,+/-)

---

# Candidate Validation

For every insertion candidate compute:

- Is simple polygon?
- Self intersections?
- Degenerate edges?
- Duplicate vertices?
- Zero area?
- Orientation preserved?
- Convex?
- Concave?

Store all results.

Do not automatically discard invalid results.

Flag them.

---

# Concave Polygon Support

Required.

Use combinatorial chains.

Do NOT attempt physical fold simulation.

Do NOT determine fold side geometrically.

The construction pipeline should remain deterministic for:

- convex polygons
- concave polygons

Reflection remains geometric.

Chain selection remains combinatorial.

---

# User Interface

## Main Layout

Three primary regions:

### Left Control Panel

### Center Geometry Canvas

### Right Result Browser

---

# Canvas

User can:

- Add vertex
- Move vertex
- Delete vertex
- Close polygon
- Clear polygon

Display:

- vertices
- edge labels
- midpoint labels
- crease lines
- reflected points
- candidate polygons

---

# Construction Layers

Toggle:

- Polygon
- Vertex labels
- Edge labels
- Midpoints
- Creases
- Fold chains
- Reflection arcs
- Reflected points
- Candidate polygons

---

# Hierarchical Result Browser

## Level 1

Fold Matrix

Rows:

crease index i

Columns:

reflected-point index j

Separate sections:

Fi+
Fi-

Example for pentagon:

5 rows
2 columns

Each tile displays:

- miniature geometry
- reflected point
- candidate id

Example:

F3+, j=2

Also display:

- reflected distance
- inside/outside classification
- valid insertion count

---

# Level 2

Click a reflection tile.

Expand to inspection view.

Show:

- source polygon
- selected crease
- folded chain
- reflected source vertex
- reflected point X

Also show all insertion opportunities.

---

# Level 3

Insertion Grid

One tile per original edge.

Each tile represents:

P(i,j,e,+/-)

Display:

- resulting polygon
- inserted vertex highlighted
- edge chosen
- validity status
- area
- perimeter
- convexity
- self-intersections

Color coding:

Green:
valid

Amber:
degenerate

Red:
self-intersecting

---

# Candidate Naming

Fold:

Fi+
Fi-

Reflected point:

X(i,j,+/-)

Polygon:

P(i,j,e,+/-)

Example:

P(2,1,4,-)

means:

- crease 2
- reflected candidate 1
- inserted into edge 4
- negative fold chain

---

# Geometry Engine Requirements

Implement robust:

- segment intersection testing
- polygon simplicity testing
- orientation testing
- area computation
- perimeter computation
- reflection across arbitrary line
- midpoint generation
- cyclic indexing

Support floating point tolerance.

---

# Data Model

```javascript
{
  sourcePolygon: {
    vertices: []
  },

  folds: [
    {
      creaseIndex: i,
      direction: "+",

      crease: {
        vertexIndex: i,
        midpointEdgeIndex: e
      },

      chainVertices: [],

      reflections: [
        {
          reflectedIndex: j,

          sourceVertexIndex: v,

          reflectedPoint: {
            x: 0,
            y: 0
          },

          locationClass: "inside",

          insertions: [
            {
              edgeIndex: e,

              polygonVertices: [],

              isSimple: true,
              isConvex: false,
              selfIntersectionCount: 0,

              area: 0,
              perimeter: 0
            }
          ]
        }
      ]
    }
  ]
}
```

---

# Technical Requirements

Preferred:

- HTML
- CSS
- JavaScript
- SVG rendering

SVG is preferred because:

- every vertex remains selectable
- every crease remains selectable
- every candidate tile can be generated easily

No backend required.

Entire application should run from:

index.html

with local files only.

---

# Development Goal

The application is intended as a research tool.

Do not optimize toward one "correct" resulting polygon.

Expose the full combinatorial structure:

Polygon
→ Fold
→ Reflected Point
→ Insertion Edge
→ Candidate Polygon

Every stage should be inspectable independently.
