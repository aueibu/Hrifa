(function(){
"use strict";

// ---------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------
// Screen space is y-down (standard SVG), so sweeping an angle from 0
// toward positive degrees moves visually clockwise. That's what makes
// alteration_cw (positive) read as "clockwise" and alteration_ccw
// (negative) as "counter-clockwise" without any extra sign flip.
function polarPoint(radius, angleDeg){
  const th = angleDeg*Math.PI/180;
  return {x: radius*Math.cos(th), y: radius*Math.sin(th)};
}
function step5(min, max){
  const steps = Math.round((max-min)/5);
  return min + 5*Math.floor(Math.random()*(steps+1));
}
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function roundTo5(v){ return Math.round(v/5)*5; }
// Smallest angle between two directions, folded into [0,180] — the
// astrological "orb" comparisons (aspects, below) work on this, not raw
// signed angle difference.
function angularDiff(a, b){
  const d = Math.abs(a-b) % 360;
  return d > 180 ? 360-d : d;
}
// Unsigned interior angle (0-180°) between two vectors emanating from the
// same point, via atan2(|cross|, dot) — numerically steadier near 0°/180°
// than acos(dot/(|u||v|)). Used by Bend_CCW/Bend_CW (below) to measure the
// actual geometric angle at a P1 vertex between the ray back to the origin
// and the edge to a neighboring vertex.
function unsignedAngleBetween(u, v){
  const cross = u.x*v.y - u.y*v.x;
  const dot = u.x*v.x + u.y*v.y;
  return Math.abs(Math.atan2(cross, dot) * 180/Math.PI);
}

// ---------------------------------------------------------------
// Aspects — the classic five angular relationships from astrological/orrery
// charts. R3 becomes the "wheel" these are drawn against: every generated
// point (P1 vertex, Drift_CCW point, Drift_CW point) is a body at some
// angle, and any pair whose angular separation lands within `orb` degrees
// of one of these gets a chord drawn between their R3-projected positions.
// Purely derived from angles that already exist — no new random seeding.
const ASPECT_DEFS = [
  {name:'Conjunction', angle:0,   key:'aspectConjunction'},
  {name:'Sextile',     angle:60,  key:'aspectSextile'},
  {name:'Square',      angle:90,  key:'aspectSquare'},
  {name:'Trine',       angle:120, key:'aspectTrine'},
  {name:'Opposition',  angle:180, key:'aspectOpposition'}
];

// ---------------------------------------------------------------
// Polylabel — the "pole of inaccessibility": the point inside a polygon
// that sits as far as possible from every edge, found via adaptive grid
// refinement (this app's own implementation of the well-known technique
// popularized by Mapbox's polylabel library, written fresh since this app
// has no dependencies). Returns that point plus its distance to the
// nearest edge, which doubles as the radius of the largest circle that
// fits inside the polygon without crossing any side.
// ---------------------------------------------------------------
function pointToSegmentDistance(px, py, ax, ay, bx, by){
  let dx = bx-ax, dy = by-ay;
  if (dx!==0 || dy!==0){
    const t = ((px-ax)*dx + (py-ay)*dy) / (dx*dx+dy*dy);
    if (t>1){ ax=bx; ay=by; } else if (t>0){ ax+=dx*t; ay+=dy*t; }
  }
  dx = px-ax; dy = py-ay;
  return Math.hypot(dx, dy);
}
function pointInRing(px, py, ring){
  let inside = false;
  for (let i=0, j=ring.length-1; i<ring.length; j=i++){
    const xi=ring[i].x, yi=ring[i].y, xj=ring[j].x, yj=ring[j].y;
    if (((yi>py)!==(yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi)) inside = !inside;
  }
  return inside;
}
// Signed distance from (px,py) to the ring's boundary: positive inside, negative outside.
function pointToRingDistance(px, py, ring){
  let minDist = Infinity;
  for (let i=0, j=ring.length-1; i<ring.length; j=i++){
    const d = pointToSegmentDistance(px, py, ring[i].x, ring[i].y, ring[j].x, ring[j].y);
    if (d<minDist) minDist = d;
  }
  return pointInRing(px, py, ring) ? minDist : -minDist;
}
function polylabel(ring, precision){
  precision = precision || 0.5;
  if (!ring || ring.length<3) return {x:0, y:0, distance:0};
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  ring.forEach(p=>{ minX=Math.min(minX,p.x); minY=Math.min(minY,p.y); maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y); });
  const width = maxX-minX, height = maxY-minY;
  if (width<=0 || height<=0) return {x:minX, y:minY, distance:0};
  const cellSize = Math.min(width, height);
  let h = cellSize/2;
  function makeCell(x,y,h){
    const d = pointToRingDistance(x,y,ring);
    return {x, y, h, d, max: d + h*Math.SQRT2};
  }
  // A plain array acting as a priority queue (linear-scan for the max) —
  // simple and plenty fast at this app's polygon sizes (N<=12 vertices,
  // a few hundred cells at most for this precision).
  let cells = [];
  for (let x=minX; x<maxX; x+=cellSize) for (let y=minY; y<maxY; y+=cellSize) cells.push(makeCell(x+h, y+h, h));
  // Seed the search with the centroid and the bbox center — either can
  // beat every grid cell outright for star-shaped/convex polygons, and
  // starting the "best so far" bar high prunes the search much faster.
  let cx=0, cy=0;
  ring.forEach(p=>{ cx+=p.x; cy+=p.y; });
  let best = makeCell(cx/ring.length, cy/ring.length, 0);
  const bboxCell = makeCell(minX+width/2, minY+height/2, 0);
  if (bboxCell.d > best.d) best = bboxCell;
  let guard = 0;
  while (cells.length && guard++ < 20000){
    let bi = 0;
    for (let i=1;i<cells.length;i++) if (cells[i].max > cells[bi].max) bi = i;
    const cell = cells[bi];
    cells[bi] = cells[cells.length-1]; cells.pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue; // this cell (and everything smaller) can't beat the current best
    const half = cell.h/2;
    cells.push(makeCell(cell.x-half, cell.y-half, half));
    cells.push(makeCell(cell.x+half, cell.y-half, half));
    cells.push(makeCell(cell.x-half, cell.y+half, half));
    cells.push(makeCell(cell.x+half, cell.y+half, half));
  }
  return {x:best.x, y:best.y, distance:Math.max(0,best.d)};
}

// ---------------------------------------------------------------
// Max-touching circle — the circle passing through the largest number of
// points in a given set. Any 3 non-collinear points determine exactly one
// circle (their circumcircle), so every possible triple is tried; for
// each one, every other point in the set is checked against it within a
// tolerance (exact coincidence is essentially never hit by chance on
// continuous coordinates, so "touching" needs a small band). The triple
// with the most points on its circle wins; ties break toward the larger
// radius. Point sets here stay small (well under 50 points), so brute-
// forcing every triple is cheap — no need for anything cleverer.
// ---------------------------------------------------------------
function circumcircle(A, B, C){
  const d = 2*(A.x*(B.y-C.y) + B.x*(C.y-A.y) + C.x*(A.y-B.y));
  if (Math.abs(d) < 1e-9) return null; // collinear, no circle
  const aSq = A.x*A.x+A.y*A.y, bSq = B.x*B.x+B.y*B.y, cSq = C.x*C.x+C.y*C.y;
  const ux = (aSq*(B.y-C.y) + bSq*(C.y-A.y) + cSq*(A.y-B.y)) / d;
  const uy = (aSq*(C.x-B.x) + bSq*(A.x-C.x) + cSq*(B.x-A.x)) / d;
  return {x:ux, y:uy, radius: Math.hypot(A.x-ux, A.y-uy)};
}
function maxTouchingCircle(points, tolerance, maxRadius){
  let best = null;
  for (let i=0;i<points.length;i++){
    for (let j=i+1;j<points.length;j++){
      for (let k=j+1;k<points.length;k++){
        const cc = circumcircle(points[i], points[j], points[k]);
        // Skip both exact collinearity (cc===null) and near-collinearity:
        // three almost-straight points still produce a *finite* circumcircle,
        // just an enormous, numerically unstable one that's practically a
        // straight line — and a huge near-flat arc can spuriously "touch"
        // many unrelated points within the tolerance band. maxRadius throws
        // those degenerate triples out before they can win.
        if (!cc || cc.radius > maxRadius) continue;
        let count = 0;
        for (let m=0;m<points.length;m++){
          if (Math.abs(Math.hypot(points[m].x-cc.x, points[m].y-cc.y) - cc.radius) <= tolerance) count++;
        }
        if (!best || count>best.count || (count===best.count && cc.radius>best.radius)) best = {...cc, count};
      }
    }
  }
  return best || {x:0, y:0, radius:0, count:0};
}

// ---------------------------------------------------------------
// Circle inversion — maps a point P through a circle (center O, radius r)
// to P' = O + (r²/|P-O|²)·(P-O): same ray from O, distance flipped so
// near-O points land far away and far points land close in. Used below to
// invert the five polylabel points through each max-touching circle.
// Undefined exactly at O itself (point "at infinity") — returns null there.
// ---------------------------------------------------------------
function invertPoint(p, circle){
  const dx = p.x-circle.x, dy = p.y-circle.y;
  const distSq = dx*dx+dy*dy;
  if (distSq < 1e-9 || circle.radius <= 0) return null;
  const k = (circle.radius*circle.radius) / distSq;
  return {x: circle.x + dx*k, y: circle.y + dy*k};
}

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
let radii = [40, 90, 150]; // R1, R2, R3 — always kept ascending
let seedCount = 6;         // N, 3-12
let seeds = [];             // [{angle: 0-355 step5, radius: 0-R1 step5}, ...] length N, in original seed order
let alterations = [];       // [{cw: 0..90 step5, ccw: -90..0 step5}, ...] aligned to angle-sorted vertex order

let showRays = true;
let showAlterationLines = true;
let showP1Labels = true;
let showDriftPoints = true;
let showTriangles = false;
let showDataTable = true;
let showDriftCCW = true;
let showDriftCW = true;

let alterationMode = 'random';  // 'random' | 'structured'
let alterationFraction = 50;    // percent (0-100, step 5) of the neighbor-gap used in 'structured' mode

let showAspects = true;
let aspectOrb = 5;          // degrees (0-30, step 5) — how close to an exact aspect angle counts as a match
let aspectIncludeP1 = true;
let aspectIncludeDriftCCW = true;
let aspectIncludeDriftCW = true;
let showDriftLabels = false;   // numeric labels on Drift_CCW/Drift_CW points, matching their origin vertex's #k

let driftRadiusMode = 'R2';       // 'R2' | 'multiplier'
let driftRadiusMultiplier = 1;    // used when mode==='multiplier': radius = clamp(radius * multiplier, 0, R3)

let showBend = true;   // Bend_CCW / Bend_CW secondary polygons
let bendRadiusMode = 'p2';   // 'p2' (reuse Drift radial placement) | 'midpoint' (origin -> midpoint of the same edge the turn angle was measured from)
let showBendPoints = true;   // dots at each Bend_CCW/Bend_CW point
let showBendLabels = false;  // numeric labels on Bend_CCW/Bend_CW points, matching their origin vertex's #k

let showDriftIncircle = true;  // per-vertex incircle (of triangle P1[k],Drift_CW[k],Drift_CCW[k]), centered at the Drift_CW/Drift_CCW midpoint
let showBendIncircle = true;   // same idea, for the triangle P1[k],Bend_CW[k],Bend_CCW[k]

let showPolylabel = true;   // pole of inaccessibility + its inscribed-circle radius, one per polygon (P1, Drift_CW/CCW, Bend_CW/CCW)

let showMaxCircleDrift = false;  // circle through the most Drift_CW/Drift_CCW points
let showMaxCircleBend = false;   // circle through the most Bend_CW/Bend_CCW points
let showMaxCircleBoth = false;   // circle through the most points across all four sets combined

let showInversionDrift = false;  // the 5 polylabel points, inverted through the Drift max-touching circle
let showInversionBend = false;   // ...through the Bend max-touching circle
let showInversionBoth = false;   // ...through the "both" max-touching circle

function regenerateRadii(){
  const pool = [];
  for (let v=10; v<=300; v+=5) pool.push(v);
  const picked = [];
  while (picked.length<3){
    const v = pool[Math.floor(Math.random()*pool.length)];
    if (!picked.includes(v)) picked.push(v);
  }
  radii = picked.sort((a,b)=>a-b);
}
function regenerateSeeds(n){
  seedCount = n;
  seeds = [];
  for (let i=0;i<n;i++) seeds.push({ angle: step5(0,355), radius: step5(0, radii[0]) });
  applyAlterations();
}
function regenerateAlterations(){
  alterations = seeds.map(()=>({ cw: step5(0,90), ccw: -step5(0,90) }));
}
// Structured alternative to regenerateAlterations(): instead of an
// independent 0-90 random draw per vertex, alteration_cw/ccw are a fraction
// of the angular gap to that vertex's own neighbors in P1 (already-sorted
// vertex order) — so a vertex's drift is derived from spacing that's
// already present in the structure, rather than being fully random.
// alteration_cw takes a fraction of the gap to the NEXT vertex, alteration_ccw
// takes a fraction of the gap to the PREVIOUS vertex.
// Unlike random mode, these are NOT clamped to [0,90]: at 100% fraction that
// lets alteration_cw_k land exactly on vertex (k+1)'s angle and alteration_ccw_k
// exactly on vertex (k-1)'s angle for every k, however wide a gap gets — which
// is what makes Drift_CCW and Drift_CW coincide exactly at 100%, regardless of
// P1's shape.
function computeStructuredAlterations(){
  const verts = vertexOrder();
  const n = verts.length;
  if (n === 0) { alterations = []; return; }
  const frac = alterationFraction/100;
  alterations = verts.map((v,k) => {
    const next = verts[(k+1)%n], prev = verts[(k-1+n)%n];
    const gapNext = ((next.angle - v.angle)%360+360)%360;
    const gapPrev = ((v.angle - prev.angle)%360+360)%360;
    const cw = roundTo5(frac*gapNext);
    const ccw = -roundTo5(frac*gapPrev);
    return {cw, ccw};
  });
}
function applyAlterations(){
  if (alterationMode === 'structured') computeStructuredAlterations();
  else regenerateAlterations();
}
function clampSeedsToRadii(){
  seeds.forEach(s=>{ s.radius = clamp(roundTo5(s.radius), 0, radii[0]); });
}

// Angle-sorted vertex order — this is what makes P1 star-shaped (and
// therefore always simple/non-self-intersecting) regardless of the
// random angle/radius draws. Ties broken by original seed index for stability.
function vertexOrder(){
  return seeds.map((s,idx)=>({...s, idx})).sort((x,y)=> x.angle-y.angle || x.idx-y.idx);
}

function derive(){
  const R1=radii[0], R2=radii[1], R3=radii[2];
  const verts = vertexOrder();
  const p1 = verts.map(v => ({...polarPoint(v.radius, v.angle), angle:v.angle, radius:v.radius, idx:v.idx}));
  const rays = verts.map(v => ({from:{x:0,y:0}, to: polarPoint(R3, v.angle)}));
  // driftCW/driftCCW stay aligned to P1's vertex order (index k <-> p1[k])
  // so the dashed alteration lines always connect a vertex to its own
  // offspring. Each point also carries vk — the index of the P1 vertex it
  // came from — so the fan triangles (built below, after the ring re-sort)
  // can still find their way back to the right vertex.
  // Radius is either fixed at R2, or (in 'multiplier' mode) derived from
  // that same vertex's own radius — the one place a vertex's own radius
  // gets used past shaping P1 itself — clamped to R3 so a large multiplier
  // can't push points off the drawable area.
  function driftRadius(radius){
    return driftRadiusMode === 'multiplier' ? clamp(radius*driftRadiusMultiplier, 0, R3) : R2;
  }
  const driftCW = verts.map((v,k) => {
    const ang = ((v.angle + (alterations[k]?alterations[k].cw:0))%360+360)%360;
    const rad = driftRadius(v.radius);
    return {...polarPoint(rad, ang), angle: ang, radius: rad, vk: k};
  });
  const driftCCW = verts.map((v,k) => {
    const ang = ((v.angle + (alterations[k]?alterations[k].ccw:0))%360+360)%360;
    const rad = driftRadius(v.radius);
    return {...polarPoint(rad, ang), angle: ang, radius: rad, vk: k};
  });
  // Separate copies, each re-sorted by its own resulting angle, so
  // Drift_CCW and Drift_CW are drawn as simple (non-self-intersecting)
  // polygons like P1 — independent of P1's vertex order and of each other.
  const driftCWRing = driftCW.slice().sort((x,y)=>x.angle-y.angle);
  const driftCCWRing = driftCCW.slice().sort((x,y)=>x.angle-y.angle);

  // Incircle: for each vertex index k, take the triangle formed by P1[k]
  // and a CW/CCW pair (Drift or Bend), and compute the diameter of ITS
  // incircle (the largest circle tangent to all three sides) via the
  // standard radius = area / semiperimeter formula. The circle actually
  // drawn is NOT centered at that triangle's true incenter, though — it's
  // centered at the midpoint of the CW–CCW segment instead, using only the
  // incircle's computed SIZE, not its true position.
  function incircleFromTriangle(A, B, C, k){
    const a = Math.hypot(B.x-C.x, B.y-C.y); // side opposite A (i.e. B-C, the CW/CCW segment)
    const b = Math.hypot(A.x-C.x, A.y-C.y); // side opposite B
    const c = Math.hypot(A.x-B.x, A.y-B.y); // side opposite C
    const s = (a+b+c)/2;
    const area = Math.sqrt(Math.max(0, s*(s-a)*(s-b)*(s-c))); // Heron's formula; clamped against tiny negative floating-point noise
    const radius = s>1e-9 ? area/s : 0;
    const cx = (B.x+C.x)/2, cy = (B.y+C.y)/2; // midpoint of the CW/CCW pair, not the true incenter
    const centerAngle = ((Math.atan2(cy,cx)*180/Math.PI)+360)%360;
    const centerRadius = Math.hypot(cx,cy);
    return {x:cx, y:cy, angle:centerAngle, radius:centerRadius, sideA:a, sideB:b, sideC:c, area, incircleRadius:radius, incircleDiameter:radius*2, vk:k};
  }
  const driftIncircles = p1.map((v,k) => incircleFromTriangle(p1[k], driftCW[k], driftCCW[k], k));

  // Fan triangles: for each ring point (born from vertex V_k), a triangle
  // V_k -> point -> next-point-in-ring-order -> back to V_k. The "next"
  // point generally belongs to a different original vertex, since ring
  // order is by the point's own angle, not by V_k's neighbor in P1 — that
  // mismatch is exactly what makes this a fan rather than a plain edge set.
  function fanTriangles(ring){
    return ring.map((pt, i) => {
      const next = ring[(i+1)%ring.length];
      return [p1[pt.vk], pt, next];
    });
  }
  const driftCWTriangles = fanTriangles(driftCWRing);
  const driftCCWTriangles = fanTriangles(driftCCWRing);

  // Bend_CW / Bend_CCW: a second, independent way of deriving the
  // alteration offset, using real triangle geometry instead of a random
  // draw or a gap-fraction. At vertex V_k, draw the ray back to the origin
  // and the edge to a neighboring P1 vertex; the angle actually formed
  // between those two lines (unsigned, 0-180°) becomes the turn angle —
  // applied clockwise (added to V_k's own angle) using the NEXT vertex for
  // Bend_CW, counter-clockwise (subtracted) using the PREVIOUS vertex for
  // Bend_CCW. Unlike every other generated value in this piece, this turn
  // angle is NOT snapped to a multiple of 5 — it's a real measured angle,
  // not a random/structured draw, so it keeps whatever precision the
  // geometry produces.
  //
  // The point itself is NOT placed at (distance, angle) from the origin —
  // it's V_k stepped outward by a distance in the turn-angle-rotated
  // direction. So Bend_CW/Bend_CCW are vertex-local constructions (step
  // from where P1 already put you), not origin-relative placements like
  // Drift_CW/Drift_CCW are. That step distance is either the same
  // R2/multiplier toggle Drift_CW/Drift_CCW use, or (in 'midpoint' mode)
  // the origin's distance to the midpoint of that exact same edge the turn
  // angle was just measured against — which keeps Bend_CCW/Bend_CW
  // entirely self-derived from P1, no external radius input at all.
  // Points are free to land beyond R3; nothing here is clamped.
  function bendPoint(k, neighborIdx, sign){
    const Vi = p1[k], Vn = p1[neighborIdx];
    const vecOrigin = {x:-Vi.x, y:-Vi.y};
    const vecNeighbor = {x: Vn.x-Vi.x, y: Vn.y-Vi.y};
    const magOrigin = Math.hypot(vecOrigin.x, vecOrigin.y);
    const magNeighbor = Math.hypot(vecNeighbor.x, vecNeighbor.y);
    const turnAngle = (magOrigin<1e-9 || magNeighbor<1e-9) ? 0 : unsignedAngleBetween(vecOrigin, vecNeighbor);
    const stepAngle = ((Vi.angle + sign*turnAngle)%360+360)%360; // direction to step in, from V_k's own angle
    // Deliberately NOT driftRadius(Vi.radius) here — that clamps to R3,
    // which is correct for Drift_CW/Drift_CCW (an origin-relative
    // placement) but wrong for a step distance, which should be free to
    // carry a point past R3.
    const stepDistance = bendRadiusMode === 'midpoint'
      ? Math.hypot((Vi.x+Vn.x)/2, (Vi.y+Vn.y)/2)
      : (driftRadiusMode === 'multiplier' ? Vi.radius*driftRadiusMultiplier : R2);
    const th = stepAngle*Math.PI/180;
    const px = Vi.x + stepDistance*Math.cos(th), py = Vi.y + stepDistance*Math.sin(th);
    const trueAngle = ((Math.atan2(py,px)*180/Math.PI)+360)%360;
    const trueRadius = Math.hypot(px,py);
    return {x:px, y:py, angle: trueAngle, radius: trueRadius, vk: k, turnAngle: (sign*turnAngle)+0, stepAngle, stepDistance}; // +0 avoids a signed-zero display glitch (-0.00)
  }
  const nV = p1.length;
  const bendCW = p1.map((v,k) => bendPoint(k, (k+1)%nV, 1));
  const bendCCW = p1.map((v,k) => bendPoint(k, (k-1+nV)%nV, -1));
  const bendCWRing = bendCW.slice().sort((x,y)=>x.angle-y.angle);
  const bendCCWRing = bendCCW.slice().sort((x,y)=>x.angle-y.angle);

  const bendIncircles = p1.map((v,k) => incircleFromTriangle(p1[k], bendCW[k], bendCCW[k], k));

  // Polylabel, one per polygon this piece generates — each one's own pole
  // of inaccessibility, entirely independent of the incircle work above
  // (that's per-vertex triangles; this is the whole polygon at once).
  function polylabelOf(ring){
    const pl = polylabel(ring);
    const angle = ((Math.atan2(pl.y,pl.x)*180/Math.PI)+360)%360;
    const radiusFromOrigin = Math.hypot(pl.x,pl.y);
    return {x:pl.x, y:pl.y, angle, radiusFromOrigin, distance:pl.distance};
  }
  const polylabels = {
    p1: polylabelOf(p1),
    driftCW: polylabelOf(driftCWRing),
    driftCCW: polylabelOf(driftCCWRing),
    bendCW: polylabelOf(bendCWRing),
    bendCCW: polylabelOf(bendCCWRing)
  };

  // Max-touching circles: how many Drift/Bend points a single circle can
  // pass through, tried over Drift alone, Bend alone, and everything
  // combined. Tolerance is 0.5% of R3 — tight enough to mean something,
  // loose enough to catch near-alignments that floating point would
  // otherwise miss by a hair.
  const touchTolerance = R3*0.005;
  const touchMaxRadius = R3*20; // rejects near-collinear triples' blown-up, practically-a-line circumcircles
  const maxCircleDrift = maxTouchingCircle(driftCW.concat(driftCCW), touchTolerance, touchMaxRadius);
  const maxCircleBend = maxTouchingCircle(bendCW.concat(bendCCW), touchTolerance, touchMaxRadius);
  const maxCircleBoth = maxTouchingCircle(driftCW.concat(driftCCW, bendCW, bendCCW), touchTolerance, touchMaxRadius);

  // Invert the five polylabel points (P1's own, plus one per Drift/Bend
  // ring) through each max-touching circle in turn. Each is an independent
  // "lens" — the same five source points, three different inversions.
  const polylabelList = [
    {label:'P1', p:polylabels.p1},
    {label:'Drift_CW', p:polylabels.driftCW},
    {label:'Drift_CCW', p:polylabels.driftCCW},
    {label:'Bend_CW', p:polylabels.bendCW},
    {label:'Bend_CCW', p:polylabels.bendCCW}
  ];
  function invertPolylabels(circle){
    return polylabelList.map(({label,p}) => {
      const inv = invertPoint(p, circle);
      if (!inv) return {label, x:null, y:null, angle:null, radiusFromOrigin:null};
      const angle = ((Math.atan2(inv.y,inv.x)*180/Math.PI)+360)%360;
      return {label, x:inv.x, y:inv.y, angle, radiusFromOrigin: Math.hypot(inv.x,inv.y)};
    });
  }
  const inversionDrift = invertPolylabels(maxCircleDrift);
  const inversionBend = invertPolylabels(maxCircleBend);
  const inversionBoth = invertPolylabels(maxCircleBoth);

  const aspects = computeAspects(p1, driftCCW, driftCW);

  return {R1,R2,R3, verts, p1, rays, driftCW, driftCCW, driftCWRing, driftCCWRing, driftCWTriangles, driftCCWTriangles,
    bendCW, bendCCW, bendCWRing, bendCCWRing, driftIncircles, bendIncircles, polylabels,
    maxCircleDrift, maxCircleBend, maxCircleBoth, inversionDrift, inversionBend, inversionBoth, aspects};
}

// Every included point-set contributes "bodies" (an angle + a source label).
// Any pair of bodies whose angular separation lands within `aspectOrb`
// degrees of one of the five classic aspect angles gets recorded; ties are
// broken by nearest aspect angle so a pair is never double-counted.
function computeAspects(p1, driftCCW, driftCW){
  // num = 1-based vertex number, matching the "#k" labels already drawn on
  // P1 (and the same k that ties a Drift_CCW/Drift_CW point back to its
  // origin vertex via .vk) — so a hover/table reference like "Drift_CW #5"
  // points at the same vertex a viewer can already find on the canvas.
  const bodies = [];
  if (aspectIncludeP1) p1.forEach((p,k) => bodies.push({angle: p.angle, src:'P1', num:k+1}));
  if (aspectIncludeDriftCCW) driftCCW.forEach((p,k) => bodies.push({angle: p.angle, src:'Drift_CCW', num:k+1}));
  if (aspectIncludeDriftCW) driftCW.forEach((p,k) => bodies.push({angle: p.angle, src:'Drift_CW', num:k+1}));
  const aspects = [];
  for (let i=0;i<bodies.length;i++){
    for (let j=i+1;j<bodies.length;j++){
      const sep = angularDiff(bodies[i].angle, bodies[j].angle);
      let best=null, bestDelta=Infinity;
      ASPECT_DEFS.forEach(def => {
        const delta = Math.abs(sep-def.angle);
        if (delta<=aspectOrb && delta<bestDelta) { best=def; bestDelta=delta; }
      });
      if (best) aspects.push({
        angleA: bodies[i].angle, angleB: bodies[j].angle,
        srcA: bodies[i].src, srcB: bodies[j].src,
        numA: bodies[i].num, numB: bodies[j].num,
        separation: sep, delta: bestDelta, type: best
      });
    }
  }
  return aspects;
}

// ---------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------
const STATE_KEY = 'hrifaConcentricPolygonDriftState_v1';
function saveState(){
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      v:1, radii, seedCount, seeds, alterations,
      showRays, showAlterationLines, showP1Labels, showDriftPoints, showTriangles, showDataTable,
      showDriftCCW, showDriftCW, alterationMode, alterationFraction,
      showAspects, aspectOrb, aspectIncludeP1, aspectIncludeDriftCCW, aspectIncludeDriftCW, showDriftLabels,
      driftRadiusMode, driftRadiusMultiplier, showBend, bendRadiusMode, showBendPoints, showBendLabels,
      showDriftIncircle, showBendIncircle, showPolylabel,
      showMaxCircleDrift, showMaxCircleBend, showMaxCircleBoth,
      showInversionDrift, showInversionBend, showInversionBoth
    }));
  } catch(err) {}
}
function loadState(){
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || s.v!==1) return false;
    if (Array.isArray(s.radii) && s.radii.length===3) radii = s.radii;
    if (typeof s.seedCount==='number') seedCount = s.seedCount;
    if (Array.isArray(s.seeds)) seeds = s.seeds;
    if (Array.isArray(s.alterations)) alterations = s.alterations;
    if (typeof s.showRays==='boolean') showRays = s.showRays;
    if (typeof s.showAlterationLines==='boolean') showAlterationLines = s.showAlterationLines;
    if (typeof s.showP1Labels==='boolean') showP1Labels = s.showP1Labels;
    if (typeof s.showDriftPoints==='boolean') showDriftPoints = s.showDriftPoints;
    if (typeof s.showTriangles==='boolean') showTriangles = s.showTriangles;
    if (typeof s.showDataTable==='boolean') showDataTable = s.showDataTable;
    if (typeof s.showDriftCCW==='boolean') showDriftCCW = s.showDriftCCW;
    if (typeof s.showDriftCW==='boolean') showDriftCW = s.showDriftCW;
    if (s.alterationMode==='random' || s.alterationMode==='structured') alterationMode = s.alterationMode;
    if (typeof s.alterationFraction==='number') alterationFraction = s.alterationFraction;
    if (typeof s.showAspects==='boolean') showAspects = s.showAspects;
    if (typeof s.aspectOrb==='number') aspectOrb = s.aspectOrb;
    if (typeof s.aspectIncludeP1==='boolean') aspectIncludeP1 = s.aspectIncludeP1;
    if (typeof s.aspectIncludeDriftCCW==='boolean') aspectIncludeDriftCCW = s.aspectIncludeDriftCCW;
    if (typeof s.aspectIncludeDriftCW==='boolean') aspectIncludeDriftCW = s.aspectIncludeDriftCW;
    if (typeof s.showDriftLabels==='boolean') showDriftLabels = s.showDriftLabels;
    if (s.driftRadiusMode==='R2' || s.driftRadiusMode==='multiplier') driftRadiusMode = s.driftRadiusMode;
    if (typeof s.driftRadiusMultiplier==='number') driftRadiusMultiplier = s.driftRadiusMultiplier;
    if (typeof s.showBend==='boolean') showBend = s.showBend;
    if (s.bendRadiusMode==='p2' || s.bendRadiusMode==='midpoint') bendRadiusMode = s.bendRadiusMode;
    if (typeof s.showBendPoints==='boolean') showBendPoints = s.showBendPoints;
    if (typeof s.showBendLabels==='boolean') showBendLabels = s.showBendLabels;
    if (typeof s.showDriftIncircle==='boolean') showDriftIncircle = s.showDriftIncircle;
    if (typeof s.showBendIncircle==='boolean') showBendIncircle = s.showBendIncircle;
    if (typeof s.showPolylabel==='boolean') showPolylabel = s.showPolylabel;
    if (typeof s.showMaxCircleDrift==='boolean') showMaxCircleDrift = s.showMaxCircleDrift;
    if (typeof s.showMaxCircleBend==='boolean') showMaxCircleBend = s.showMaxCircleBend;
    if (typeof s.showMaxCircleBoth==='boolean') showMaxCircleBoth = s.showMaxCircleBoth;
    if (typeof s.showInversionDrift==='boolean') showInversionDrift = s.showInversionDrift;
    if (typeof s.showInversionBend==='boolean') showInversionBend = s.showInversionBend;
    if (typeof s.showInversionBoth==='boolean') showInversionBoth = s.showInversionBoth;
    return seeds.length>0;
  } catch(err) { return false; }
}
function clearSavedState(){ try { localStorage.removeItem(STATE_KEY); } catch(err){} }
function startOver(){
  if (!confirm('Start over? This generates a fresh random construction.')) return;
  regenerateRadii(); regenerateSeeds(seedCount); clearSavedState();
  render(); renderSidebar();
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------
const svg = document.getElementById('svg');
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs){
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function readTheme(){
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    ring1: v('--ring-1'), ring2: v('--ring-2'), ring3: v('--ring-3'),
    ink: v('--p1-ink'), driftCCW: v('--drift-ccw'), driftCW: v('--drift-cw'),
    rayMuted: v('--ray-muted'), pointIdle: v('--point-idle'),
    text: v('--neutral-text'), muted: v('--neutral-text-muted'),
    panel: v('--neutral-surface-raised'), bg: v('--neutral-surface-bg'),
    aspectConjunction: v('--aspect-conjunction'), aspectSextile: v('--aspect-sextile'),
    aspectSquare: v('--aspect-square'), aspectTrine: v('--aspect-trine'), aspectOpposition: v('--aspect-opposition'),
    bendCW: v('--bend-cw'), bendCCW: v('--bend-ccw'),
    driftIncircle: v('--drift-incircle'), bendIncircle: v('--bend-incircle'),
    polylabel: v('--polylabel'),
    maxCircleDrift: v('--max-circle-drift'), maxCircleBend: v('--max-circle-bend'), maxCircleBoth: v('--max-circle-both')
  };
}
let theme = readTheme();

const VB_W = 800, VB_H = 600;
let currentTransform = null;
// extent: the largest distance-from-origin anything actually drawn needs to
// reach. Usually that's just R3, but Bend_CCW/Bend_CW points are vertex-local
// steps with no clamp, so they can land past R3 — the view has to grow to
// keep them on screen instead of letting svgWrap's overflow:hidden clip them.
function computeTransform(extent){
  const R3 = radii[2];
  const bound = Math.max(R3, extent||0);
  const pad = bound*0.16 + 10;
  const half = bound+pad;
  const scale = Math.min(VB_W/(half*2), VB_H/(half*2));
  const offX = VB_W/2, offY = VB_H/2;
  return {
    toScreen: p => ({x: p.x*scale+offX, y: p.y*scale+offY}),
    toWorld: p => ({x: (p.x-offX)/scale, y: (p.y-offY)/scale}),
    scale
  };
}

// Converts a raw mouse/pointer event's clientX/clientY (actual on-screen CSS
// pixels) into the SVG's internal user-space coordinates (the VB_W x VB_H
// logical space), accounting for however the browser is scaling the viewBox.
function screenEventToSvgSpace(clientX, clientY){
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return {x:0,y:0};
  const p = pt.matrixTransform(ctm.inverse());
  return {x:p.x, y:p.y};
}

function drawRing(parent, radius, color, label){
  const s = currentTransform.toScreen({x:0,y:0});
  const r = radius*currentTransform.scale;
  parent.appendChild(el('circle', {cx:s.x, cy:s.y, r, fill:'none', stroke:color, 'stroke-width':1.2, opacity:0.8}));
  const lbl = el('text', {x:s.x, y:s.y-r-4, 'font-size':10, fill:color, 'text-anchor':'middle', opacity:0.9});
  lbl.textContent = label+' ('+radius+')';
  parent.appendChild(lbl);
}
// Like drawRing, but centered anywhere (not just the origin) — for the
// per-vertex incircles, whose centers are Drift/Bend segment midpoints.
function drawCircleAt(parent, center, radius, color, width, opacity, dashed){
  const s = currentTransform.toScreen(center);
  const r = radius*currentTransform.scale;
  const attrs = {cx:s.x, cy:s.y, r, fill:'none', stroke:color, 'stroke-width':width||1.2, opacity:opacity!=null?opacity:0.8};
  if (dashed) attrs['stroke-dasharray'] = '4,3';
  parent.appendChild(el('circle', attrs));
}
function polyPointsAttr(pts){
  return pts.map(p=>{ const s=currentTransform.toScreen(p); return s.x.toFixed(2)+','+s.y.toFixed(2); }).join(' ');
}
function drawPolygon(parent, pts, color, opts){
  opts = opts || {};
  if (!pts || pts.length<3) return;
  const poly = el('polygon', {
    points: polyPointsAttr(pts), fill: color, 'fill-opacity': opts.fillOpacity!=null?opts.fillOpacity:0.05,
    stroke: color, 'stroke-width': opts.strokeWidth||2, opacity: opts.opacity!=null?opts.opacity:1
  });
  if (opts.dashed) poly.setAttribute('stroke-dasharray','5,4');
  parent.appendChild(poly);
}
function drawLine(parent, a, b, color, dashed, width){
  const sa = currentTransform.toScreen(a), sb = currentTransform.toScreen(b);
  const line = el('line', {x1:sa.x, y1:sa.y, x2:sb.x, y2:sb.y, stroke:color, 'stroke-width':width||1, opacity: dashed?0.7:0.55});
  if (dashed) line.setAttribute('stroke-dasharray','3,3');
  parent.appendChild(line);
}
// Aspect chord with hover feedback: a fat invisible hit-line (easy to land
// the cursor on) sits under the visible one, both wrapped in a group. The
// visible line has pointer-events disabled — otherwise its own 1px-wide
// stroke sits on top of the hit target and steals hover exactly where a
// user would actually aim (dead center), leaving only the hit target's
// margin responsive. With it disabled, hover works anywhere across the
// full hit width, including directly on the visible line itself. A CSS
// :hover rule (see .aspect-group in style.css) thickens the visible line,
// and mouse events drive a custom tooltip (not the native title bubble,
// which is slow to appear and shows an unwanted "?" cursor) that appears
// immediately and follows the pointer.
function drawAspectLine(parent, a, b, color, width, opacity, asp){
  const sa = currentTransform.toScreen(a), sb = currentTransform.toScreen(b);
  const g = el('g', {'class':'aspect-group'});
  const hit = el('line', {x1:sa.x, y1:sa.y, x2:sb.x, y2:sb.y, stroke:'transparent', 'stroke-width':10, 'class':'aspect-hit'});
  const line = el('line', {x1:sa.x, y1:sa.y, x2:sb.x, y2:sb.y, stroke:color, 'stroke-width':width, opacity, 'class':'aspect-visible', 'pointer-events':'none'});
  g.appendChild(hit); g.appendChild(line);
  hit.addEventListener('mouseenter', (ev)=> showAspectTooltip(asp, ev.clientX, ev.clientY));
  hit.addEventListener('mousemove', (ev)=> moveAspectTooltip(ev.clientX, ev.clientY));
  hit.addEventListener('mouseleave', hideAspectTooltip);
  parent.appendChild(g);
}

const aspectTooltip = document.getElementById('aspectTooltip');
const TOOLTIP_OFFSET = 14;
function showAspectTooltip(asp, clientX, clientY){
  const fit = asp.delta===0 ? 'exact' : ('±'+asp.delta+'° off');
  aspectTooltip.innerHTML =
    '<div class="row1">'+asp.type.name+' ('+asp.type.angle+'°)</div>'
    + '<div class="row2">'+asp.srcA+' #'+asp.numA+' ('+asp.angleA+'°) ↔ '+asp.srcB+' #'+asp.numB+' ('+asp.angleB+'°)</div>'
    + '<div class="row2">separation '+asp.separation+'° ('+fit+')</div>';
  aspectTooltip.style.display = 'block';
  moveAspectTooltip(clientX, clientY);
}
function moveAspectTooltip(clientX, clientY){
  aspectTooltip.style.left = (clientX+TOOLTIP_OFFSET)+'px';
  aspectTooltip.style.top = (clientY+TOOLTIP_OFFSET)+'px';
}
function hideAspectTooltip(){
  aspectTooltip.style.display = 'none';
}
function drawDot(parent, p, color, r){
  const s = currentTransform.toScreen(p);
  parent.appendChild(el('circle', {cx:s.x, cy:s.y, r: r||3.2, fill:color, stroke:theme.panel, 'stroke-width':1}));
}
function drawLabel(parent, p, text, color){
  const s = currentTransform.toScreen(p);
  parent.appendChild(el('text', {x:s.x+6, y:s.y-6, 'font-size':10, fill:color, 'text-anchor':'start'})).textContent = text;
}

// Draggable P1 vertex: a larger transparent hit target sits under the visible
// dot so it's easy to grab. Dragging updates that seed's angle/radius in
// radial (polar) space, snapping both to the nearest multiple of 5 exactly
// like every other generated value — so a dragged point is indistinguishable
// from a freshly-seeded one, just user-placed instead of random.
// The move/up listeners bind to `svg` (never destroyed by render()'s
// svg.innerHTML='') rather than to `hit` (recreated every render() call),
// so the drag session survives the live re-render on every move event.
function drawP1Handle(parent, p, seedIdx, color, dotR){
  const s = currentTransform.toScreen(p);
  const g = el('g', {});
  const hit = el('circle', {cx:s.x, cy:s.y, r:10, fill:'transparent', cursor:'grab'});
  // pointer-events:none so the visible dot on top doesn't steal pointerdown
  // from the hit target beneath it — same fix as the aspect-line hover bug.
  const dot = el('circle', {cx:s.x, cy:s.y, r: dotR||3.4, fill:color, stroke:theme.panel, 'stroke-width':1, 'pointer-events':'none'});
  g.appendChild(hit); g.appendChild(dot);
  parent.appendChild(g);

  hit.addEventListener('pointerdown', (ev)=>{
    ev.preventDefault();
    svg.setPointerCapture(ev.pointerId);
    svg.style.cursor = 'grabbing';
    function move(e2){
      e2.preventDefault();
      const sp = screenEventToSvgSpace(e2.clientX, e2.clientY);
      const w = currentTransform.toWorld(sp);
      const rawAngle = (Math.atan2(w.y, w.x)*180/Math.PI + 360) % 360;
      const angle = Math.round(rawAngle/5)*5 % 360;
      const radius = clamp(roundTo5(Math.hypot(w.x, w.y)), 0, radii[0]);
      seeds[seedIdx].angle = angle;
      seeds[seedIdx].radius = radius;
      if (alterationMode === 'structured') computeStructuredAlterations();
      render();
    }
    function up(e2){
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      try { svg.releasePointerCapture(ev.pointerId); } catch(err){}
      svg.style.cursor = 'default';
      renderSidebar();
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
  });
}

// Same fixed order derive() built its polylabelList/inversion arrays in —
// needed here to pair each inverted point back to the source it came from.
function polylabelSources(d){
  return [
    {label:'P1', p:d.polylabels.p1},
    {label:'Drift_CW', p:d.polylabels.driftCW},
    {label:'Drift_CCW', p:d.polylabels.driftCCW},
    {label:'Bend_CW', p:d.polylabels.bendCW},
    {label:'Bend_CCW', p:d.polylabels.bendCCW}
  ];
}

function render(){
  theme = readTheme();
  svg.innerHTML='';
  hideAspectTooltip(); // the hovered element (if any) is about to be destroyed and rebuilt

  const d = derive();
  let extent = showBend
    ? Math.max(0, ...d.bendCW.map(p=>p.radius), ...d.bendCCW.map(p=>p.radius))
    : 0;
  // Incircle centers/radii can also reach past R3 (Drift incircles rarely
  // do, but Bend incircles inherit Bend's unclamped reach), so both are
  // folded into the same extent the canvas sizes itself around.
  if (showDriftIncircle) extent = Math.max(extent, ...d.driftIncircles.map(c=>c.radius+c.incircleRadius));
  if (showBendIncircle) extent = Math.max(extent, ...d.bendIncircles.map(c=>c.radius+c.incircleRadius));
  if (showPolylabel) extent = Math.max(extent, ...Object.values(d.polylabels).map(p=>p.radiusFromOrigin+p.distance));
  const maxCircleReach = c => Math.hypot(c.x,c.y)+c.radius;
  if (showMaxCircleDrift) extent = Math.max(extent, maxCircleReach(d.maxCircleDrift));
  if (showMaxCircleBend) extent = Math.max(extent, maxCircleReach(d.maxCircleBend));
  if (showMaxCircleBoth) extent = Math.max(extent, maxCircleReach(d.maxCircleBoth));
  // Inversion can send a point very far out if its source sat close to the
  // inversion circle's center — real behavior, not a bug, but one outlier
  // shouldn't be allowed to zoom the whole canvas out to uselessness.
  // Threshold: 3x the R3 diameter (6xR3). Points inside it can still pull
  // the view out to fit them; points beyond it don't touch the zoom at
  // all — drawInversion (below) skips their dot and just lets the dashed
  // line run off the edge of the canvas, which the SVG clips for free.
  const inversionExtentCap = d.R3*6;
  function inversionExtent(list){
    return Math.max(0, ...list.filter(p=>p.radiusFromOrigin!=null && p.radiusFromOrigin<=inversionExtentCap).map(p=>p.radiusFromOrigin));
  }
  if (showInversionDrift) extent = Math.max(extent, inversionExtent(d.inversionDrift));
  if (showInversionBend) extent = Math.max(extent, inversionExtent(d.inversionBend));
  if (showInversionBoth) extent = Math.max(extent, inversionExtent(d.inversionBoth));
  currentTransform = computeTransform(extent);
  const g = el('g', {});
  svg.appendChild(g);

  // Concentric rings, smallest to largest.
  drawRing(g, d.R3, theme.ring3, 'R3');
  drawRing(g, d.R2, theme.ring2, 'R2');
  drawRing(g, d.R1, theme.ring1, 'R1');

  // Aspect wheel: every pair of bodies (P1/Drift_CCW/Drift_CW points, per
  // the include toggles) whose angular separation lands near a classic
  // aspect angle gets a chord across R3 — the outer ring's actual job in
  // this piece, drawn first so it reads as the chart's backdrop rather
  // than sitting on top.
  if (showAspects) {
    d.aspects.forEach(asp => {
      const pa = polarPoint(d.R3, asp.angleA), pb = polarPoint(d.R3, asp.angleB);
      drawAspectLine(g, pa, pb, theme[asp.type.key], asp.type.angle===0 ? 0.8 : 1, 0.55, asp);
    });
  }

  // Fan triangles: V_k -> point -> next-in-ring -> back to V_k. Drawn early
  // (thin, low opacity, outline only) so the crisper rays/dashed-lines/ring
  // polygons drawn afterward stay legible on top. Each ring's triangles are
  // gated by that same ring's own visibility toggle.
  if (showTriangles && showDriftCCW) d.driftCCWTriangles.forEach(tri => drawPolygon(g, tri, theme.driftCCW, {fillOpacity:0, strokeWidth:1, opacity:0.55}));
  if (showTriangles && showDriftCW) d.driftCWTriangles.forEach(tri => drawPolygon(g, tri, theme.driftCW, {fillOpacity:0, strokeWidth:1, opacity:0.55}));

  // Origin -> R3 rays through each P1 vertex angle, drawn first so
  // everything else layers on top of these muted construction lines.
  if (showRays) d.rays.forEach(r => drawLine(g, r.from, r.to, theme.rayMuted, false, 1));

  // Dashed alteration lines from each P1 vertex to its Drift_CCW/Drift_CW offspring point.
  if (showAlterationLines) {
    d.p1.forEach((p, k) => {
      if (showDriftCCW) drawLine(g, p, d.driftCCW[k], theme.driftCCW, true, 1.1);
      if (showDriftCW) drawLine(g, p, d.driftCW[k], theme.driftCW, true, 1.1);
    });
  }

  // Drift_CCW / Drift_CW polygons — each connected in its own ascending-
  // angle order (not P1's vertex order), so both stay simple/non-self-intersecting.
  if (showDriftCCW) drawPolygon(g, d.driftCCWRing, theme.driftCCW, {fillOpacity:0.06, strokeWidth:2});
  if (showDriftCW) drawPolygon(g, d.driftCWRing, theme.driftCW, {fillOpacity:0.06, strokeWidth:2});
  if (showDriftPoints) {
    if (showDriftCCW) d.driftCCW.forEach((p,k) => {
      drawDot(g, p, theme.driftCCW, 2.6);
      if (showDriftLabels) drawLabel(g, p, String(k+1), theme.driftCCW);
    });
    if (showDriftCW) d.driftCW.forEach((p,k) => {
      drawDot(g, p, theme.driftCW, 2.6);
      if (showDriftLabels) drawLabel(g, p, String(k+1), theme.driftCW);
    });
  }

  // Per-vertex incircle of triangle(P1[k], Drift_CW[k], Drift_CCW[k]) —
  // sized by the true incircle formula, but centered at the Drift_CW/
  // Drift_CCW midpoint rather than the triangle's actual incenter.
  if (showDriftIncircle) d.driftIncircles.forEach(c => drawCircleAt(g, c, c.incircleRadius, theme.driftIncircle, 1.2, 0.7));

  // Bend_CCW / Bend_CW — a second, geometry-derived pair of polygons: each
  // point's offset from its own vertex's ray is the real angle formed
  // between the ray back to the origin and the edge to a neighboring P1
  // vertex, not a random draw or a gap-fraction. Same connect-in-own-angle-
  // order rule as Drift_CCW/Drift_CW, so these stay simple polygons too.
  if (showBend) {
    d.p1.forEach((p, k) => {
      drawLine(g, p, d.bendCCW[k], theme.bendCCW, true, 1.1);
      drawLine(g, p, d.bendCW[k], theme.bendCW, true, 1.1);
    });
    drawPolygon(g, d.bendCCWRing, theme.bendCCW, {fillOpacity:0.06, strokeWidth:2});
    drawPolygon(g, d.bendCWRing, theme.bendCW, {fillOpacity:0.06, strokeWidth:2});
    if (showBendPoints) {
      d.bendCCW.forEach((p,k) => {
        drawDot(g, p, theme.bendCCW, 2.6);
        if (showBendLabels) drawLabel(g, p, String(k+1), theme.bendCCW);
      });
      d.bendCW.forEach((p,k) => {
        drawDot(g, p, theme.bendCW, 2.6);
        if (showBendLabels) drawLabel(g, p, String(k+1), theme.bendCW);
      });
    }
  }

  // Per-vertex incircle of triangle(P1[k], Bend_CW[k], Bend_CCW[k]) — same
  // procedure as the Drift incircle above, applied to the Bend triangle.
  if (showBendIncircle) d.bendIncircles.forEach(c => drawCircleAt(g, c, c.incircleRadius, theme.bendIncircle, 1.2, 0.7));

  // Polylabel: one pole-of-inaccessibility marker per polygon (P1, both
  // Drift rings, both Bend rings) — dashed and in a single neutral color
  // so all five read as the same kind of marker rather than five new
  // meanings, distinct from the solid per-vertex incircles above.
  if (showPolylabel) {
    Object.values(d.polylabels).forEach(pl => {
      drawCircleAt(g, pl, pl.distance, theme.polylabel, 1.1, 0.75, true);
      drawDot(g, pl, theme.polylabel, 2.2);
    });
  }

  // Max-touching circles: the circle passing through the most points in a
  // given set (Drift alone, Bend alone, or all four combined). Off by
  // default — these are exploratory and can trivially coincide with R2
  // itself when Drift radial placement is left fixed, since every
  // Drift_CW/Drift_CCW point then already sits on that one circle.
  if (showMaxCircleDrift) drawCircleAt(g, d.maxCircleDrift, d.maxCircleDrift.radius, theme.maxCircleDrift, 1.3, 0.75);
  if (showMaxCircleBend) drawCircleAt(g, d.maxCircleBend, d.maxCircleBend.radius, theme.maxCircleBend, 1.3, 0.75);
  if (showMaxCircleBoth) drawCircleAt(g, d.maxCircleBoth, d.maxCircleBoth.radius, theme.maxCircleBoth, 1.3, 0.75);

  // Inversion: the five polylabel points, each mapped through a max-
  // touching circle. Colored to match that circle's own color, so a dot's
  // color says which "lens" produced it. A thin dashed line ties each
  // inverted point back to the polylabel point it came from.
  function drawInversion(list, source, color){
    list.forEach((inv, i) => {
      if (inv.x==null) return; // undefined at the inversion circle's own center
      drawLine(g, source[i].p, inv, color, true, 0.9); // beyond the cap, this just runs off-canvas — the SVG clips it for free
      if (inv.radiusFromOrigin <= inversionExtentCap) drawDot(g, inv, color, 2.4);
    });
  }
  if (showInversionDrift) drawInversion(d.inversionDrift, polylabelSources(d), theme.maxCircleDrift);
  if (showInversionBend) drawInversion(d.inversionBend, polylabelSources(d), theme.maxCircleBend);
  if (showInversionBoth) drawInversion(d.inversionBoth, polylabelSources(d), theme.maxCircleBoth);

  // P1 — the ink-stroked construction polygon, drawn last (aside from its
  // own points/labels) so its outline and vertices stay crisp on top.
  // Vertices are draggable: grab a point and move it in radial space,
  // snapping angle/radius back to their multiple-of-5 rules on every move.
  drawPolygon(g, d.p1, theme.ink, {fillOpacity:0.04, strokeWidth:2.2});
  d.p1.forEach((p, k) => {
    drawP1Handle(g, p, p.idx, theme.ink, 3.4);
    if (showP1Labels) drawLabel(g, p, String(k+1), theme.ink);
  });

  renderLegend();
  saveState();
}

function renderLegend(){
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  const items = [
    ['R1 / R2 / R3', theme.ring1],
    ['P1 (ink)', theme.ink],
    ['Drift_CCW — alteration_ccw', theme.driftCCW],
    ['Drift_CW — alteration_cw', theme.driftCW],
    ['origin rays', theme.rayMuted]
  ];
  if (showBend) {
    items.push(['Bend_CCW — origin/prev-edge angle', theme.bendCCW]);
    items.push(['Bend_CW — origin/next-edge angle', theme.bendCW]);
  }
  if (showDriftIncircle) items.push(['Drift incircle', theme.driftIncircle]);
  if (showBendIncircle) items.push(['Bend incircle', theme.bendIncircle]);
  if (showPolylabel) items.push(['Polylabel (pole of inaccessibility)', theme.polylabel]);
  if (showMaxCircleDrift) items.push(['Max-touching circle (Drift)', theme.maxCircleDrift]);
  if (showMaxCircleBend) items.push(['Max-touching circle (Bend)', theme.maxCircleBend]);
  if (showMaxCircleBoth) items.push(['Max-touching circle (both)', theme.maxCircleBoth]);
  if (showInversionDrift) items.push(['Polylabel inversion (Drift circle)', theme.maxCircleDrift]);
  if (showInversionBend) items.push(['Polylabel inversion (Bend circle)', theme.maxCircleBend]);
  if (showInversionBoth) items.push(['Polylabel inversion (both circle)', theme.maxCircleBoth]);
  if (showAspects) {
    ASPECT_DEFS.forEach(def => items.push([def.name+' ('+def.angle+'°)', theme[def.key]]));
  }
  items.forEach(([label,color])=>{
    const span = document.createElement('span');
    span.innerHTML = '<span class="swatch" style="background:'+color+'"></span>'+label;
    legend.appendChild(span);
  });
}

// ---------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------
const sidebar = document.getElementById('sidebar');
function block(title, container){
  const d = document.createElement('div'); d.className='block';
  if (title){ const h = document.createElement('h2'); h.className='stageTitle'; h.textContent=title; d.appendChild(h); }
  (container || sidebar).appendChild(d);
  return d;
}
function row(parent, labelText, inputEl){
  const r = document.createElement('div'); r.className='row';
  const l = document.createElement('label'); l.textContent = labelText;
  r.appendChild(l); r.appendChild(inputEl); parent.appendChild(r); return r;
}
function note(parent, text){
  const p = document.createElement('div'); p.className='note'; p.textContent=text; parent.appendChild(p); return p;
}
function btn(text, onClick, cls){
  const b = document.createElement('button'); b.textContent=text; if(cls) b.className=cls;
  b.addEventListener('click', onClick); return b;
}
function checkboxRow(parent, labelText, checked, onChange){
  const r = document.createElement('div'); r.className='checkboxRow';
  const cb = document.createElement('input'); cb.type='checkbox'; cb.checked=checked;
  cb.addEventListener('change', ()=>onChange(cb.checked));
  const l = document.createElement('label'); l.textContent = labelText;
  r.appendChild(cb); r.appendChild(l); parent.appendChild(r); return r;
}

function renderSidebar(){
  sidebar.innerHTML='';

  const rb = block('Radii (R1 < R2 < R3)');
  note(rb, 'Multiples of 5, from 10 to 300. P1’s seed points are bounded by R1; Drift_CCW/Drift_CW sit on R2 by default (see “Drift radial placement” below to change that); the construction rays extend to R3.');
  [0,1,2].forEach(i=>{
    const inp = document.createElement('input'); inp.type='number'; inp.min=10; inp.max=300; inp.step=5; inp.value=radii[i];
    inp.addEventListener('change', ()=>{
      radii[i] = clamp(roundTo5(parseFloat(inp.value)||radii[i]), 10, 300);
      radii = radii.slice().sort((a,b)=>a-b);
      clampSeedsToRadii();
      render(); renderSidebar();
    });
    row(rb, 'R'+(i+1), inp);
  });
  rb.appendChild(btn('🎲 Randomize radii', ()=>{
    regenerateRadii(); clampSeedsToRadii(); render(); renderSidebar();
  }, 'full'));

  const sb = block('P1 — seeded points');
  note(sb, 'N is the seed count (3–12). Each index gets a random angle (0–355, step 5) and a random radius along R1 (0–R1, step 5); connecting them in angle order forms the non-intersecting polygon P1. Drag a vertex on the canvas to place it by hand — it still snaps to the same multiple-of-5 grid.');
  const nInp = document.createElement('input'); nInp.type='number'; nInp.min=3; nInp.max=12; nInp.step=1; nInp.value=seedCount;
  nInp.addEventListener('change', ()=>{
    const n = clamp(Math.round(parseFloat(nInp.value)||seedCount), 3, 12);
    regenerateSeeds(n);
    render(); renderSidebar();
  });
  row(sb, 'Seed count N', nInp);
  sb.appendChild(btn('🎲 Randomize P1 (new N + points)', ()=>{
    const n = 3 + Math.floor(Math.random()*10);
    regenerateSeeds(n);
    render(); renderSidebar();
  }, 'full'));
  sb.appendChild(btn('🎲 Re-seed P1 (keep N)', ()=>{
    regenerateSeeds(seedCount);
    render(); renderSidebar();
  }, 'full'));

  const ab = block('Drift_CCW / Drift_CW — alterations');
  note(ab, 'Each P1 vertex needs two offsets: alteration_cw (→ Drift_CW) and alteration_ccw (→ Drift_CCW). Rotating the origin→vertex ray by that amount and landing on R2 gives the new point.');
  const modeSel = document.createElement('select');
  modeSel.appendChild(new Option('Random (independent draws)', 'random'));
  modeSel.appendChild(new Option('Neighbor-gap (structured)', 'structured'));
  modeSel.value = alterationMode;
  modeSel.addEventListener('change', ()=>{
    alterationMode = modeSel.value;
    applyAlterations();
    render(); renderSidebar();
  });
  row(ab, 'Mode', modeSel);

  if (alterationMode === 'structured') {
    note(ab, 'alteration_cw is a fraction of the angular gap to the NEXT vertex; alteration_ccw is that same fraction of the gap to the PREVIOUS vertex — so drift is derived from spacing already present in P1, instead of drawn independently. Not clamped to 90°: at 100%, Drift_CW lands exactly on the next vertex’s angle and Drift_CCW on the previous vertex’s angle for every vertex, so Drift_CCW and Drift_CW always coincide exactly, regardless of P1’s shape.');
    const fracInp = document.createElement('input');
    fracInp.type = 'number'; fracInp.min = 0; fracInp.max = 100; fracInp.step = 5; fracInp.value = alterationFraction;
    fracInp.addEventListener('change', ()=>{
      alterationFraction = clamp(roundTo5(parseFloat(fracInp.value)||0), 0, 100);
      computeStructuredAlterations();
      render(); renderSidebar();
    });
    row(ab, 'Gap fraction (%)', fracInp);
    ab.appendChild(btn('🎲 Randomize gap fraction', ()=>{
      alterationFraction = step5(0,100);
      computeStructuredAlterations();
      render(); renderSidebar();
    }, 'full'));
  } else {
    note(ab, 'Independent random draws, 0–90 step 5.');
    ab.appendChild(btn('🎲 Randomize alterations', ()=>{
      regenerateAlterations();
      render(); renderSidebar();
    }, 'full'));
  }

  const prb = block('Drift radial placement');
  note(prb, 'By default Drift_CCW/Drift_CW sit exactly on R2. Switching to a multiplier instead places each point at radius × multiplier along its rotated angle — bringing the vertex’s own radial position back into play, clamped to R3 so it can’t run off the drawable area.');
  const radModeSel = document.createElement('select');
  radModeSel.appendChild(new Option('Fixed at R2', 'R2'));
  radModeSel.appendChild(new Option('Multiplier of vertex radius', 'multiplier'));
  radModeSel.value = driftRadiusMode;
  radModeSel.addEventListener('change', ()=>{
    driftRadiusMode = radModeSel.value;
    render(); renderSidebar();
  });
  row(prb, 'Radius', radModeSel);
  if (driftRadiusMode === 'multiplier') {
    const multInp = document.createElement('input');
    multInp.type = 'number'; multInp.min = 0.1; multInp.max = 10; multInp.step = 0.1; multInp.value = driftRadiusMultiplier;
    multInp.addEventListener('change', ()=>{
      driftRadiusMultiplier = clamp(parseFloat(multInp.value)||1, 0.1, 10);
      render(); renderSidebar();
    });
    row(prb, 'Multiplier ×', multInp);
  }

  const irb = block('Bend_CCW / Bend_CW step distance');
  note(irb, 'Bend_CCW/Bend_CW points are V_k stepped outward by this distance, in the turn-angle-rotated direction — not placed at this distance from the origin. By default the step reuses the Drift radial placement setting above (R2 or radius × multiplier). Switching to midpoint instead steps by the origin’s distance to the midpoint of the very edge the turn angle was measured against (i↔i+1 for Bend_CW, i↔i-1 for Bend_CCW) — so the step, like the angle, comes entirely from P1 itself. Points are free to land past R3; the canvas grows to fit them.');
  const bendRadSel = document.createElement('select');
  bendRadSel.appendChild(new Option('Same as Drift radial placement', 'p2'));
  bendRadSel.appendChild(new Option('Origin → edge midpoint distance', 'midpoint'));
  bendRadSel.value = bendRadiusMode;
  bendRadSel.addEventListener('change', ()=>{
    bendRadiusMode = bendRadSel.value;
    render(); renderSidebar();
  });
  row(irb, 'Step', bendRadSel);

  const eb = block(null);
  eb.appendChild(btn('🎲 Randomize everything', ()=>{
    regenerateRadii();
    const n = 3 + Math.floor(Math.random()*10);
    regenerateSeeds(n);
    render(); renderSidebar();
  }, 'full primary'));
  eb.appendChild(btn('Export SVG', exportSVG, 'full'));
  eb.appendChild(btn('Export JSON (parameters)', exportJSON, 'full'));

  renderAspectsPanel();
  renderDisplayPanel();
  renderDataTable();
}

// ---------------------------------------------------------------
// Bottom panel row — aspects controls, display toggles, and the data
// table live here (not the right sidebar) so the sidebar stays short and
// these three, which are more "read the numbers" than "set up the shape,"
// sit side by side below the canvas instead of stacking into a long scroll.
// ---------------------------------------------------------------
const aspectsPanelEl = document.getElementById('aspectsPanel');
function renderAspectsPanel(){
  aspectsPanelEl.innerHTML = '';
  const asb = block('Aspects (R3)', aspectsPanelEl);
  note(asb, 'R3 is the aspect wheel: every pair of points below whose angular separation lands near 0° (conjunction), 60° (sextile), 90° (square), 120° (trine) or 180° (opposition) gets a chord drawn between their R3-projected positions — like a natal chart’s aspect grid. Nothing here is randomly placed; it’s derived entirely from angles already generated.');
  checkboxRow(asb, 'Show aspect wheel', showAspects, v=>{ showAspects=v; render(); renderSidebar(); });
  checkboxRow(asb, 'Include P1 vertices', aspectIncludeP1, v=>{ aspectIncludeP1=v; render(); renderSidebar(); });
  checkboxRow(asb, 'Include Drift_CCW points', aspectIncludeDriftCCW, v=>{ aspectIncludeDriftCCW=v; render(); renderSidebar(); });
  checkboxRow(asb, 'Include Drift_CW points', aspectIncludeDriftCW, v=>{ aspectIncludeDriftCW=v; render(); renderSidebar(); });
  const orbInp = document.createElement('input');
  orbInp.type='number'; orbInp.min=0; orbInp.max=30; orbInp.step=5; orbInp.value=aspectOrb;
  orbInp.addEventListener('change', ()=>{
    aspectOrb = clamp(roundTo5(parseFloat(orbInp.value)||0), 0, 30);
    render(); renderSidebar();
  });
  row(asb, 'Orb (±°)', orbInp);
  if (showAspects) {
    const count = derive().aspects.length;
    note(asb, count + ' aspect' + (count===1?'':'s') + ' found at the current orb.');
  }
}

const displayPanelEl = document.getElementById('displayPanel');
function renderDisplayPanel(){
  displayPanelEl.innerHTML = '';
  const db = block('Display', displayPanelEl);
  checkboxRow(db, 'Show origin → R3 rays', showRays, v=>{ showRays=v; render(); });
  checkboxRow(db, 'Show alteration lines', showAlterationLines, v=>{ showAlterationLines=v; render(); });
  checkboxRow(db, 'Show P1 vertex labels', showP1Labels, v=>{ showP1Labels=v; render(); });
  checkboxRow(db, 'Show Drift_CCW/Drift_CW points', showDriftPoints, v=>{ showDriftPoints=v; render(); });
  checkboxRow(db, 'Show Drift_CCW/Drift_CW vertex labels', showDriftLabels, v=>{ showDriftLabels=v; render(); });
  checkboxRow(db, 'Show V→alteration→next fan triangles', showTriangles, v=>{ showTriangles=v; render(); });
  checkboxRow(db, 'Show Drift_CCW (blue)', showDriftCCW, v=>{ showDriftCCW=v; render(); });
  checkboxRow(db, 'Show Drift_CW (orange)', showDriftCW, v=>{ showDriftCW=v; render(); });
  checkboxRow(db, 'Show Bend_CCW / Bend_CW', showBend, v=>{ showBend=v; render(); });
  checkboxRow(db, 'Show Bend_CCW/Bend_CW points', showBendPoints, v=>{ showBendPoints=v; render(); });
  checkboxRow(db, 'Show Bend_CCW/Bend_CW vertex labels', showBendLabels, v=>{ showBendLabels=v; render(); });
  checkboxRow(db, 'Show Drift incircle', showDriftIncircle, v=>{ showDriftIncircle=v; render(); });
  checkboxRow(db, 'Show Bend incircle', showBendIncircle, v=>{ showBendIncircle=v; render(); });
  checkboxRow(db, 'Show polylabel', showPolylabel, v=>{ showPolylabel=v; render(); });
  checkboxRow(db, 'Show max-touching circle (Drift)', showMaxCircleDrift, v=>{ showMaxCircleDrift=v; render(); renderSidebar(); });
  checkboxRow(db, 'Show max-touching circle (Bend)', showMaxCircleBend, v=>{ showMaxCircleBend=v; render(); renderSidebar(); });
  checkboxRow(db, 'Show max-touching circle (both)', showMaxCircleBoth, v=>{ showMaxCircleBoth=v; render(); renderSidebar(); });
  checkboxRow(db, 'Show polylabel inversion (Drift circle)', showInversionDrift, v=>{ showInversionDrift=v; render(); renderSidebar(); });
  checkboxRow(db, 'Show polylabel inversion (Bend circle)', showInversionBend, v=>{ showInversionBend=v; render(); renderSidebar(); });
  checkboxRow(db, 'Show polylabel inversion (both circle)', showInversionBoth, v=>{ showInversionBoth=v; render(); renderSidebar(); });
}

// ---------------------------------------------------------------
// Data table — exposes every generated value (seeds, angles, alterations,
// resulting Drift_CCW/Drift_CW angles) per P1 vertex, in the same
// angle-sorted order used to build P1 and the fan triangles.
// ---------------------------------------------------------------
const dataPanelEl = document.getElementById('dataPanel');
function renderDataTable(){
  dataPanelEl.innerHTML = '';
  const tb = block(null, dataPanelEl);
  const header = document.createElement('div');
  header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.alignItems = 'center';
  const h = document.createElement('h2'); h.className = 'stageTitle'; h.style.margin = '0';
  h.textContent = 'Data (N=' + seedCount + ')';
  header.appendChild(h);
  const toggle = btn(showDataTable ? 'Hide' : 'Show', ()=>{ showDataTable = !showDataTable; render(); renderSidebar(); });
  header.appendChild(toggle);
  tb.appendChild(header);
  if (!showDataTable) return;

  note(tb, 'Radii: R1=' + radii[0] + ', R2=' + radii[1] + ', R3=' + radii[2] + '. Rows are in P1’s angle-sorted vertex order (#1..#' + seedCount + ').');

  const d = derive();
  const table = document.createElement('table');
  table.className = 'dataTable';
  const thead = document.createElement('tr');
  ['#','angle','radius','alt_cw','Drift_CW angle','Drift_CW radius','alt_ccw','Drift_CCW angle','Drift_CCW radius'].forEach(txt=>{
    const th = document.createElement('th'); th.textContent = txt; thead.appendChild(th);
  });
  table.appendChild(thead);
  d.p1.forEach((p, k) => {
    const tr = document.createElement('tr');
    const cells = [k+1, p.angle, p.radius, alterations[k].cw, d.driftCW[k].angle, d.driftCW[k].radius, alterations[k].ccw, d.driftCCW[k].angle, d.driftCCW[k].radius];
    cells.forEach(val=>{ const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
    table.appendChild(tr);
  });
  tb.appendChild(table);
  if (driftRadiusMode === 'multiplier') note(tb, 'Drift_CW radius / Drift_CCW radius = vertex radius × ' + driftRadiusMultiplier + ', clamped to R3 (' + radii[2] + ').');

  const ih = document.createElement('h2'); ih.className = 'stageTitle'; ih.style.margin = '14px 0 4px';
  ih.textContent = 'Bend_CCW / Bend_CW';
  tb.appendChild(ih);
  note(tb, 'Turn angle = the real angle formed at vertex #k between the ray back to the origin and the edge to its next vertex (Bend_CW) / previous vertex (Bend_CCW) — not snapped to 5°, a measured geometric angle. The point itself is V_k stepped by "step distance" in that direction (NOT placed at that distance from the origin), so "angle"/"radius" below are the resulting position’s own angle/distance from the origin, recomputed after the step — points are free to land past R3, nothing here is clamped. Step source: ' + (bendRadiusMode==='midpoint' ? 'origin → edge midpoint distance.' : 'same as Drift radial placement.'));
  const itable = document.createElement('table');
  itable.className = 'dataTable';
  const ithead = document.createElement('tr');
  ['#','CW turn angle','CW step distance','Bend_CW angle','Bend_CW radius','CCW turn angle','CCW step distance','Bend_CCW angle','Bend_CCW radius'].forEach(txt=>{
    const th = document.createElement('th'); th.textContent = txt; ithead.appendChild(th);
  });
  itable.appendChild(ithead);
  d.p1.forEach((p, k) => {
    const tr = document.createElement('tr');
    const cells = [
      k+1,
      d.bendCW[k].turnAngle.toFixed(2), d.bendCW[k].stepDistance.toFixed(1), d.bendCW[k].angle.toFixed(2), d.bendCW[k].radius.toFixed(1),
      d.bendCCW[k].turnAngle.toFixed(2), d.bendCCW[k].stepDistance.toFixed(1), d.bendCCW[k].angle.toFixed(2), d.bendCCW[k].radius.toFixed(1)
    ];
    cells.forEach(val=>{ const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
    itable.appendChild(tr);
  });
  tb.appendChild(itable);

  // Incircle tables: same layout for both the Drift and Bend triangle
  // (P1[k], CW[k], CCW[k]) — size from the true incircle formula, center
  // at the CW/CCW midpoint, not the triangle's actual incenter.
  function incircleTable(title, circles){
    const hh = document.createElement('h2'); hh.className = 'stageTitle'; hh.style.margin = '14px 0 4px';
    hh.textContent = title;
    tb.appendChild(hh);
    const ctable = document.createElement('table');
    ctable.className = 'dataTable';
    const chead = document.createElement('tr');
    ['#','side CW–CCW','side P1–CCW','side P1–CW','area','incircle radius','incircle diameter'].forEach(txt=>{
      const th = document.createElement('th'); th.textContent = txt; chead.appendChild(th);
    });
    ctable.appendChild(chead);
    circles.forEach((c,k) => {
      const tr = document.createElement('tr');
      const cells = [k+1, c.sideA.toFixed(1), c.sideB.toFixed(1), c.sideC.toFixed(1), c.area.toFixed(1), c.incircleRadius.toFixed(2), c.incircleDiameter.toFixed(2)];
      cells.forEach(val=>{ const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
      ctable.appendChild(tr);
    });
    tb.appendChild(ctable);
  }
  note(tb, 'Incircle of triangle(P1[k], CW[k], CCW[k]) — sized by area÷semiperimeter, but drawn centered at the CW/CCW midpoint rather than the triangle’s true incenter.');
  incircleTable('Drift incircle (' + d.driftIncircles.length + ')', d.driftIncircles);
  incircleTable('Bend incircle (' + d.bendIncircles.length + ')', d.bendIncircles);

  const ph = document.createElement('h2'); ph.className = 'stageTitle'; ph.style.margin = '14px 0 4px';
  ph.textContent = 'Polylabel';
  tb.appendChild(ph);
  note(tb, 'One pole-of-inaccessibility point per polygon — the interior point farthest from every edge, found by adaptive grid search. "distance" is also the radius of the largest circle that fits inside that polygon.');
  const ptable = document.createElement('table');
  ptable.className = 'dataTable';
  const phead = document.createElement('tr');
  ['Polygon','angle','radius','distance to edge'].forEach(txt=>{
    const th = document.createElement('th'); th.textContent = txt; phead.appendChild(th);
  });
  ptable.appendChild(phead);
  [['P1', d.polylabels.p1], ['Drift_CW', d.polylabels.driftCW], ['Drift_CCW', d.polylabels.driftCCW],
   ['Bend_CW', d.polylabels.bendCW], ['Bend_CCW', d.polylabels.bendCCW]].forEach(([label, pl]) => {
    const tr = document.createElement('tr');
    const cells = [label, pl.angle.toFixed(2), pl.radiusFromOrigin.toFixed(2), pl.distance.toFixed(2)];
    cells.forEach(val=>{ const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
    ptable.appendChild(tr);
  });
  tb.appendChild(ptable);

  const mh = document.createElement('h2'); mh.className = 'stageTitle'; mh.style.margin = '14px 0 4px';
  mh.textContent = 'Max-touching circles';
  tb.appendChild(mh);
  note(tb, 'The circle (any center/radius) passing through the most points in a set, found by trying every 3-point circumcircle and counting how many other points land on it within a 0.5%-of-R3 tolerance. "Fixed at R2" Drift trivially maxes out — every Drift_CW/Drift_CCW point already sits on that one circle.');
  const mtable = document.createElement('table');
  mtable.className = 'dataTable';
  const mhead = document.createElement('tr');
  ['Set','points touched','angle','radius','circle radius'].forEach(txt=>{
    const th = document.createElement('th'); th.textContent = txt; mhead.appendChild(th);
  });
  mtable.appendChild(mhead);
  [['Drift', d.maxCircleDrift, d.driftCW.length+d.driftCCW.length], ['Bend', d.maxCircleBend, d.bendCW.length+d.bendCCW.length], ['Both', d.maxCircleBoth, d.driftCW.length+d.driftCCW.length+d.bendCW.length+d.bendCCW.length]].forEach(([label, c, total]) => {
    const tr = document.createElement('tr');
    const angle = ((Math.atan2(c.y,c.x)*180/Math.PI)+360)%360;
    const radiusFromOrigin = Math.hypot(c.x,c.y);
    const cells = [label, c.count+' / '+total, angle.toFixed(2), radiusFromOrigin.toFixed(2), c.radius.toFixed(2)];
    cells.forEach(val=>{ const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
    mtable.appendChild(tr);
  });
  tb.appendChild(mtable);

  function inversionTable(title, list){
    const hh = document.createElement('h2'); hh.className = 'stageTitle'; hh.style.margin = '14px 0 4px';
    hh.textContent = title;
    tb.appendChild(hh);
    const itbl = document.createElement('table');
    itbl.className = 'dataTable';
    const ihead = document.createElement('tr');
    ['source point','angle','radius'].forEach(txt=>{
      const th = document.createElement('th'); th.textContent = txt; ihead.appendChild(th);
    });
    itbl.appendChild(ihead);
    list.forEach(inv => {
      const tr = document.createElement('tr');
      const cells = [inv.label, inv.angle==null?'—':inv.angle.toFixed(2), inv.radiusFromOrigin==null?'—':inv.radiusFromOrigin.toFixed(2)];
      cells.forEach(val=>{ const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
      itbl.appendChild(tr);
    });
    tb.appendChild(itbl);
  }
  note(tb, 'Each of the 5 polylabel points, inverted through a max-touching circle: P′ = center + (radius²/|P−center|²)·(P−center). Points near a circle’s center invert far away; points already far away invert in close. “—” marks a point sitting exactly on the inversion circle’s own center, where inversion is undefined.');
  inversionTable('Polylabel inversion (Drift circle)', d.inversionDrift);
  inversionTable('Polylabel inversion (Bend circle)', d.inversionBend);
  inversionTable('Polylabel inversion (both circle)', d.inversionBoth);

  const ah = document.createElement('h2'); ah.className = 'stageTitle'; ah.style.margin = '14px 0 4px';
  ah.textContent = 'Aspects (' + d.aspects.length + ')';
  tb.appendChild(ah);
  note(tb, 'Every pairing of included bodies (see the Aspects (R3) controls above) whose angular separation lands within the current orb of an aspect angle — the same relationships drawn as chords on R3. Body numbers match the #k labels on P1 and each point’s origin vertex for Drift_CCW/Drift_CW.');
  if (d.aspects.length === 0) {
    note(tb, 'None at the current orb/include settings.');
  } else {
    const atable = document.createElement('table');
    atable.className = 'dataTable';
    const athead = document.createElement('tr');
    ['Aspect','Body A','Body B','Sep.','Δ'].forEach(txt=>{
      const th = document.createElement('th'); th.textContent = txt; athead.appendChild(th);
    });
    atable.appendChild(athead);
    d.aspects.forEach(asp => {
      const tr = document.createElement('tr');
      const cells = [
        asp.type.name+' ('+asp.type.angle+'°)',
        asp.srcA+' #'+asp.numA+' ('+asp.angleA+'°)',
        asp.srcB+' #'+asp.numB+' ('+asp.angleB+'°)',
        asp.separation+'°',
        (asp.delta===0?'exact':'±'+asp.delta+'°')
      ];
      cells.forEach(val=>{ const td = document.createElement('td'); td.textContent = val; tr.appendChild(td); });
      atable.appendChild(tr);
    });
    tb.appendChild(atable);
  }
}

// ---------------------------------------------------------------
// Export
// ---------------------------------------------------------------
function exportTimestamp(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2,'0');
  return d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate())
    + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
function exportSVG(){
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('width', svg.clientWidth); clone.setAttribute('height', svg.clientHeight);
  const bgRect = el('rect', {x:0,y:0,width:svg.clientWidth,height:svg.clientHeight,fill:theme.bg});
  clone.insertBefore(bgRect, clone.firstChild);
  const src = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([src], {type:'image/svg+xml'});
  downloadBlob(blob, 'concentric-polygon-drift-'+exportTimestamp()+'.svg');
}
function exportJSON(){
  const data = { radii, seedCount, seeds, alterations };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  downloadBlob(blob, 'concentric-polygon-drift-'+exportTimestamp()+'.json');
}
function downloadBlob(blob, name){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const startOverButton = document.getElementById('startOverButton');
if (startOverButton) startOverButton.addEventListener('click', startOver);

// ---------------------------------------------------------------
// Theme
// ---------------------------------------------------------------
const THEME_STORAGE_KEY = 'hrifa-concentric-polygon-drift-theme-v1';
const themeButton = document.getElementById('themeButton');
function applyTheme(dark){
  document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  if (themeButton) { themeButton.setAttribute('aria-pressed', String(dark)); themeButton.textContent = dark?'Light':'Dark'; }
}
function setTheme(dark){
  applyTheme(dark);
  try { localStorage.setItem(THEME_STORAGE_KEY, String(dark)); } catch(err) {}
  render();
}
function restoreTheme(){
  let dark = false;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    dark = saved===null ? matchMedia('(prefers-color-scheme: dark)').matches : saved==='true';
  } catch(err) {}
  applyTheme(dark);
}
if (themeButton) themeButton.addEventListener('click', ()=> setTheme(document.documentElement.dataset.theme !== 'dark'));

window.addEventListener('resize', render);
restoreTheme();
if (!loadState()) { regenerateRadii(); regenerateSeeds(seedCount); }
render(); renderSidebar();
})();
