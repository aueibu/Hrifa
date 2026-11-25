# Focus–Vantage Radial Constructor — Full Codex Handoff

> Implementation note: the working prototype is `focus_vantage_radial_constructor_sidebar_status (1).html`.
> It is a single offline HTML file; no build step or external dependency is required.

Development files are now split into `index.html`, `styles.css`, and `app.js`. The original bundled HTML remains available as a standalone fallback.

## Project

**Focus–Vantage Radial Constructor**

A standalone client-side HTML applet using:

- HTML
- CSS
- Vanilla JavaScript
- Canvas 2D

No external libraries or build process.

Current files:

- `focus_vantage_radial_constructor_sidebar_status (1).html`

The current prototype combines:

1. Sidebar status placement
2. Corrected full-ray rendering
3. Canonical and exploration modes
4. Edge diagnostics and optional polyhedral skin

---

# Purpose

The app explores a geometric construction generated from:

- One primary focus `F`
- `N` cyclic vantage points `Vᵢ`
- A first polygon belt `B` (also called `B₁`)
- Edge-midpoint-guided rays
- An exo polygon `E`
- A second polygon belt `B₂`
- A secondary focus `F₂`

It provides both a planar construction view and a pseudo-3D wireframe view.

---

# Canonical Construction

The canonical construction should use fixed values:

```text
Edge-length transfer = 1.0
Outlook position = 0.5
```

These are part of the geometric definition, not merely defaults.

In canonical mode:

```js
transfer = 1.0;
outlookT = 0.5;
```

---

# Geometry

Assume cyclic indexing:

```text
V(n+1) = V1
```

For each edge:

```text
eᵢ = (Vᵢ, Vᵢ₊₁)
```

## 1. Edge Midpoint

```text
Mᵢ = (Vᵢ + Vᵢ₊₁) / 2
```

Equivalent:

```js
const m = midpoint(vantages[i], vantages[(i + 1) % n]);
```

---

## 2. Ray Direction

Ray begins at `F` and passes through `Mᵢ`.

```text
dᵢ = Mᵢ - F
```

```text
d̂ᵢ = dᵢ / |dᵢ|
```

---

## 3. Edge-Length Transfer

Measure:

```text
Lᵢ = |Vᵢ₊₁ - Vᵢ|
```

Place exo point:

```text
Rᵢ = F + d̂ᵢ Lᵢ
```

Generalized exploratory form:

```text
Rᵢ = F + d̂ᵢ (kLᵢ)
```

Canonical:

```text
k = 1
```

JavaScript:

```js
const edgeLength = distance(a, b);
const direction = normalize(subtract(midpoint, focus));
const r = add(focus, multiply(direction, edgeLength * transfer));
```

---

## 4. Outlook Point

Canonical:

```text
Oᵢ = (F + Rᵢ) / 2
```

Generalized:

```text
Oᵢ = F + t(Rᵢ - F)
```

Canonical:

```text
t = 0.5
```

---

## 5. Polygons

```text
B  = [V₁, V₂, ..., Vₙ]
E  = [R₁, R₂, ..., Rₙ]
B₂ = [O₁, O₂, ..., Oₙ]
```

---

## 6. Secondary Focus

Default:

```text
F₂ = (1/n) Σ Oᵢ
```

This is the **vertex centroid** of `B₂`.

Reason:

- Each ray contributes equally.
- Construction is discrete and relational.
- Polygon area should not alter weighting.

Optional comparison mode:

- Area centroid of `B₂`

---

# Ray Rendering Correction

The exo-point calculation is correct.

The original rendering only drew:

```js
line(focus, exoPoint);
```

This was visually misleading.

If:

```text
|FRᵢ| < |FMᵢ|
```

then `Rᵢ` lies before midpoint `Mᵢ`, making it appear that the ray does not pass through the midpoint.

The guide ray should extend beyond both `Mᵢ` and `Rᵢ`.

Suggested helper:

```js
function rayEndpointThrough(f, m, r, extra = 18) {
  const d = sub(m, f);
  const dLen = len(d);

  if (dLen < 1e-9) return r;

  const unit = mul(d, 1 / dLen);
  const farDistance =
    Math.max(dLen, len(sub(r, f))) + extra;

  return add(f, mul(unit, farDistance));
}
```

Render:

```js
const guideEnd = rayEndpointThrough(
  focus,
  midpoint,
  exoPoint
);

line(focus, guideEnd, faintColor, 1, [5, 5]);
```

Also render a small perpendicular tick at `Mᵢ`.

---

# Current UI

## Placement

- Place focus
- Add vantage
- Randomize
- Clear
- Random vantage count

## Radial Construction

- Edge-length transfer slider
- Outlook position slider
- Secondary focus method

## Wireframe Depth

- Focus height
- B₂ depth
- Rotation
- Tilt

## Display Toggles

- Edge midpoints and guide rays
- Exo polygon E
- Vantage belt B
- Outlook belt B₂
- Focus-to-belt braces
- Labels

## Polygon Statistics

For:

- B
- B₂
- E

Display:

- Area
- Perimeter
- Semiperimeter
- Mean edge length

Ratios:

- B₂ / B
- E / B
- E / B₂
- B / B₂
- B / E
- B₂ / E

For both:

- Area
- Perimeter

## Construction Status

Moved from floating canvas overlay into sidebar.

Displays:

- Number of vantages
- Current centroid method
- Transfer value
- Outlook value
- Explanatory note

## Legend

Colors for:

- F
- Vᵢ
- Mᵢ
- Rᵢ
- Oᵢ
- F₂

---

# Canvas Interaction

## Construction Mode

- Click to place focus
- Click to add vantages
- Drag points
- Live recalculation

## Wireframe Mode

- Pseudo-3D projection
- Drag empty canvas to rotate and tilt
- No WebGL

---

# Pseudo-3D Model

Approximate Z values:

```text
F₁       z = +focusHeight
B₁       z = 0
E ring   z = -b2Depth / 2
B₂       z = -b2Depth
F₂       z = -focusHeight
```

Projection:

1. Rotation
2. Tilt
3. Perspective scale

Visual only, not a rigorous embedding.

---

# Polyhedral Topology

Connectivity:

- F connected to every Vᵢ
- Belt edges VᵢVᵢ₊₁
- Vertical edges VᵢOᵢ
- Belt edges OᵢOᵢ₊₁
- F₂ connected to every Oᵢ

Per sector:

### Upper Triangle

```text
(F, Vᵢ, Vᵢ₊₁)
```

### Middle Quadrilateral

```text
(Vᵢ, Vᵢ₊₁, Oᵢ₊₁, Oᵢ)
```

### Lower Triangle

```text
(F₂, Oᵢ, Oᵢ₊₁)
```

Therefore:

```text
Faces = 3N
Vertices = 2N + 2
Edges = 5N
```

Euler:

```text
V - E + F = 2
```

The middle strip should remain quads unless explicitly triangulated.

---

# Core Geometry Function

```js
function geometry() {
  if (!focus || vantages.length < 2) return null;

  const mids = [];
  const exo = [];
  const outlook = [];

  for (let i = 0; i < vantages.length; i++) {
    const a = vantages[i];
    const b = vantages[(i + 1) % vantages.length];

    const m = midpoint(a, b);
    const d = sub(m, focus);
    const edgeLength = len(sub(b, a));
    const unit = normalize(d);

    const r = add(
      focus,
      mul(unit, edgeLength * transfer)
    );

    const o = add(
      focus,
      mul(sub(r, focus), outlookT)
    );

    mids.push(m);
    exo.push(r);
    outlook.push(o);
  }

  const f2 =
    centroidMode === 'area'
      ? areaCentroid(outlook)
      : vertexCentroid(outlook);

  return { mids, exo, outlook, f2 };
}
```

---

# Measurement Functions

## Area

Shoelace formula:

```js
function polygonArea(poly) {
  let sum = 0;

  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];

    sum += p.x * q.y - q.x * p.y;
  }

  return Math.abs(sum) * 0.5;
}
```

## Perimeter

```js
function polygonPerimeter(poly) {
  let total = 0;

  for (let i = 0; i < poly.length; i++) {
    total += distance(
      poly[i],
      poly[(i + 1) % poly.length]
    );
  }

  return total;
}
```

## Semiperimeter

```js
semiperimeter = perimeter / 2;
```

## Mean Edge Length

```js
meanEdge = perimeter / poly.length;
```

---

# Recommended Cleanup

1. Merge sidebar-status and ray-corrected versions.
2. Add Canonical vs Exploration mode.
3. Lock canonical values:
   - transfer = 1.0
   - outlookT = 0.5
4. Disable sliders in canonical mode.
5. Standardize naming:
   - B or B₁
6. Add polyhedral-skin toggle.
7. Keep middle regions as quads.
8. Separate construction rays from polyhedral edges.
9. Add diagnostics:
   - edge index
   - |VᵢVᵢ₊₁|
   - |FMᵢ|
   - |FRᵢ|
   - before/after midpoint
   - collinearity error
10. Add numerical collinearity test:

```js
cross(M - F, R - F)
```

Expected result approximately zero.

11. Validate/sort vantage order if users create crossings.
12. Preserve as a single offline HTML file.
