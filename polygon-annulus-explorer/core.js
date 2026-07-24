// core.js -- lattice / annulus / polygon enumeration engine.
// Pure functions, no DOM. Shared by the browser UI (app.js) and testable
// directly under Node.

(function (root) {
  const EPS = 1e-7;

  // ---------------- lattice ----------------

  function generateLattice(v1, v2, maxR) {
    const [a, b] = v1, [c, d] = v2;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-12) throw new Error("basis vectors are linearly dependent");
    const corners = [[-maxR, -maxR], [-maxR, maxR], [maxR, -maxR], [maxR, maxR]];
    let mLo = Infinity, mHi = -Infinity, nLo = Infinity, nHi = -Infinity;
    for (const [x, y] of corners) {
      const m = (d * x - c * y) / det;
      const n = (-b * x + a * y) / det;
      mLo = Math.min(mLo, m); mHi = Math.max(mHi, m);
      nLo = Math.min(nLo, n); nHi = Math.max(nHi, n);
    }
    mLo = Math.floor(mLo) - 1; mHi = Math.ceil(mHi) + 1;
    nLo = Math.floor(nLo) - 1; nHi = Math.ceil(nHi) + 1;
    const pts = [];
    const seen = new Set();
    for (let m = mLo; m <= mHi; m++) {
      for (let n = nLo; n <= nHi; n++) {
        const x = m * a + n * c, y = m * b + n * d;
        if (x * x + y * y <= maxR * maxR + 1e-9) {
          const key = round(x, 9) + "," + round(y, 9);
          if (!seen.has(key)) { seen.add(key); pts.push([round(x, 9), round(y, 9)]); }
        }
      }
    }
    return pts;
  }

  function annulusPoints(allPts, minR, maxR) {
    const lo2 = minR * minR, hi2 = maxR * maxR;
    return allPts.filter(([x, y]) => {
      const r2 = x * x + y * y;
      return r2 >= lo2 - 1e-9 && r2 <= hi2 + 1e-9;
    });
  }

  function round(v, d) {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
  }

  // ---------------- geometry primitives ----------------

  function cross(o, a, b) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  function onSegmentStrict(p, a, b) {
    if (Math.abs(cross(a, b, p)) > 1e-7) return false;
    const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
    const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    return dot > 1e-9 && dot < len2 - 1e-9;
  }

  function segmentsProperlyIntersect(p1, p2, p3, p4) {
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) &&
        ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
    function collinearOverlap(a, b, c, d) {
      if (Math.abs(cross(a, b, c)) > 1e-7) return false;
      return onSegmentStrict(c, a, b) || onSegmentStrict(d, a, b);
    }
    return collinearOverlap(p1, p2, p3, p4) || collinearOverlap(p3, p4, p1, p2);
  }

  // ---------------- containment-mode single-candidate polygon ----------------
  // Precondition for this whole approach: the polygon must contain the disk
  // of radius minR around the origin. That forces the origin to be strictly
  // interior, which forces vertices to appear in strictly monotonic angular
  // order around the origin (a segment's angular sweep as seen from an
  // exterior-to-it origin is one-signed, so a simple polygon winding once
  // around an interior point must visit vertices in angle order). So instead
  // of searching orderings, there's exactly one candidate cyclic order per
  // subset: sort by angle around the origin.
  //
  // This candidate is provably simple whenever no two points share an exact
  // angle (share a ray from the origin) AND the origin ends up inside it --
  // both verified explicitly below rather than assumed, since the "origin
  // inside" case is exactly what the containment check needs anyway.
  //
  // Returns the ordered vertex array, or null if no valid polygon exists for
  // this subset under the containment + edge-purity constraints.
  function containmentCandidate(subset, minR, latticeForEdgeCheck, checkEdges, rejectCollinear) {
    const withAngles = subset.map((p) => [p, Math.atan2(p[1], p[0])]);
    withAngles.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < withAngles.length; i++) {
      const a1 = withAngles[i][1];
      const a2 = withAngles[(i + 1) % withAngles.length][1];
      const diff = i === withAngles.length - 1 ? Math.abs(a1 - a2 + 2 * Math.PI) : Math.abs(a1 - a2);
      if (diff < 1e-9) return null; // two points on the same ray from the origin
    }
    const poly = withAngles.map((x) => x[0]);
    const n = poly.length;

    // A vertex collinear with both its neighbors isn't a real corner -- the
    // subset is really tracing a lower-sided shape through one of its own
    // straight edges (e.g. an n=8 subset that's actually a square traced
    // through its own edge midpoints). Edge purity alone doesn't catch this:
    // the "extra" point is one of the chosen vertices, not a foreign point
    // sitting on someone else's edge, so it never trips that check.
    if (rejectCollinear) {
      for (let i = 0; i < n; i++) {
        const prev = poly[(i - 1 + n) % n], cur = poly[i], next = poly[(i + 1) % n];
        if (Math.abs(cross(prev, cur, next)) < 1e-7) return null;
      }
    }

    // defensive simplicity check (proven redundant when containment holds,
    // kept cheap and explicit rather than assumed)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
        if (segmentsProperlyIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return null;
      }
    }

    if (!pointInPolygonStrict([0, 0], poly)) return null; // origin must be interior

    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      if (segMinDistToOrigin(a, b) < minR - 1e-9) return null;
    }

    if (checkEdges) {
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        for (const p of latticeForEdgeCheck) {
          if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1])) continue;
          if (onSegmentStrict(p, a, b)) return null;
        }
      }
    }

    return poly;
  }

  function segMinDistToOrigin(a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const len2 = abx * abx + aby * aby;
    const t = len2 < 1e-15 ? 0 : -(a[0] * abx + a[1] * aby) / len2;
    if (t <= 0) return Math.hypot(a[0], a[1]);
    if (t >= 1) return Math.hypot(b[0], b[1]);
    return Math.hypot(a[0] + t * abx, a[1] + t * aby);
  }

  function containmentFloorRatio(n) {
    // necessary condition: maxR/minR must be >= sec(pi/n) for ANY n-gon
    // (lattice or not) to have a chance of containing the disk of radius
    // minR while keeping all vertices within maxR. Not sufficient for a
    // specific lattice, but a fast reject.
    return 1 / Math.cos(Math.PI / n);
  }

  function keyOf(p) { return p[0] + "," + p[1]; }

  // ---------------- congruence signatures ----------------

  function polygonSignature(vertices, roundDp) {
    const n = vertices.length;
    const edges = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = vertices[i], [bx, by] = vertices[(i + 1) % n];
      edges.push([bx - ax, by - ay]);
    }
    const seq = [];
    for (let i = 0; i < n; i++) {
      const [ex, ey] = edges[i];
      const length = Math.hypot(ex, ey);
      const [ex2, ey2] = edges[(i + 1) % n];
      const cr = ex * ey2 - ey * ex2;
      const dt = ex * ex2 + ey * ey2;
      const turn = Math.atan2(cr, dt);
      seq.push([round(length, roundDp), round(turn, roundDp)]);
    }
    return seq;
  }

  function rotateCanonical(seq) {
    const n = seq.length;
    let best = null, bestStr = null;
    for (let r = 0; r < n; r++) {
      const cand = seq.slice(r).concat(seq.slice(0, r));
      const s = JSON.stringify(cand);
      if (best === null || s < bestStr) { best = cand; bestStr = s; }
    }
    return { seq: best, str: bestStr };
  }

  // Largest k (dividing n) such that rotating the polygon by 360/k degrees
  // maps it onto itself -- i.e. the (length, turn) sequence is periodic with
  // period n/k. Returns 1 when the polygon has no non-trivial rotational
  // symmetry. Values in seq are already rounded, so exact comparison is safe.
  function rotationalSymmetryOrder(seq) {
    const n = seq.length;
    for (let d = 1; d < n; d++) {
      if (n % d !== 0) continue;
      let periodic = true;
      for (let i = 0; i < n; i++) {
        const a = seq[i], b = seq[(i + d) % n];
        if (a[0] !== b[0] || a[1] !== b[1]) { periodic = false; break; }
      }
      if (periodic) return n / d;
    }
    return 1;
  }

  function mirrorVertices(vertices) {
    // Negating y alone flips the polygon's traversal handedness (CCW <-> CW)
    // without correcting for it, so the resulting turning-angle sequence
    // compares as "always opposite sign" to the original under rotation-only
    // canonicalization -- reversing the order here restores a matching
    // (consistently-oriented) traversal so achiral shapes correctly compare
    // equal to their own reflection.
    return vertices.map(([x, y]) => [x, -y]).reverse();
  }

  function fullSignature(vertices, roundDp) {
    const seq = polygonSignature(vertices, roundDp);
    const rot = rotateCanonical(seq);
    const mseq = polygonSignature(mirrorVertices(vertices), roundDp);
    const mrot = rotateCanonical(mseq);
    const chiral = rot.str !== mrot.str;
    const fullStr = rot.str < mrot.str ? rot.str : mrot.str;
    const rotationalSymmetry = rotationalSymmetryOrder(seq);
    return { properKey: rot.str, mirrorKey: mrot.str, fullKey: fullStr, chiral, rotationalSymmetry };
  }

  // ---------------- polygon stats ----------------

  function area(vertices) {
    let s = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = vertices[i], [x2, y2] = vertices[(i + 1) % n];
      s += x1 * y2 - x2 * y1;
    }
    return Math.abs(s) / 2;
  }

  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length <= 2) return pts;
    const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  function pointInPolygonStrict(pt, vertices) {
    // strict interior test (crossing number), point must not be on boundary
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
      if (onSegmentStrict(pt, vertices[j], vertices[i]) ||
          (pt[0] === xi && pt[1] === yi)) return false; // on boundary -> not strictly interior
      const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function polygonStats(vertices, fullLattice) {
    const a = area(vertices);
    const hull = convexHull(vertices);
    const hullArea = area(hull);
    const convexMeasure = hullArea > 1e-12 ? a / hullArea : 1;
    const isConvex = convexMeasure > 1 - 1e-6;

    const vKeys = new Set(vertices.map(keyOf));
    let boundaryExtra = 0; // should be 0 given edge-purity, but verify
    for (const p of fullLattice) {
      if (vKeys.has(keyOf(p))) continue;
      for (let i = 0; i < vertices.length; i++) {
        const a1 = vertices[i], b1 = vertices[(i + 1) % vertices.length];
        if (onSegmentStrict(p, a1, b1)) { boundaryExtra++; break; }
      }
    }
    const boundaryCount = vertices.length + boundaryExtra;

    let interior = 0;
    for (const p of fullLattice) {
      if (vKeys.has(keyOf(p))) continue;
      if (pointInPolygonStrict(p, vertices)) interior++;
    }

    return {
      area: a,
      convexMeasure: round(convexMeasure, 6),
      isConvex,
      boundaryCount,     // "B" in Pick's theorem
      interiorCount: interior, // "I" in Pick's theorem -- the "pick number"
    };
  }

  // ---------------- aggregation ----------------

  function nCrSafe(m, n) {
    if (n < 0 || n > m) return 0;
    n = Math.min(n, m - n);
    let r = 1;
    for (let i = 0; i < n; i++) {
      r = (r * (m - i)) / (i + 1);
      if (r > 1e15) return Infinity;
    }
    return Math.round(r);
  }

  // Lazy index-based combination generator -- does NOT materialize all
  // combinations in memory (that's what blew the heap at n=11 in testing
  // with a naive array-collecting version). Yields subsets of `arr`.
  function* combinationsGen(arr, k) {
    const n = arr.length;
    if (k > n) return;
    const idx = Array.from({ length: k }, (_, i) => i);
    while (true) {
      yield idx.map((i) => arr[i]);
      let i = k - 1;
      while (i >= 0 && idx[i] === i + n - k) i--;
      if (i < 0) return;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }

  // Combinatorial-number-system unranking: the rank-th k-combination of
  // {0,...,n-1} in the same lexicographic order combinationsGen produces,
  // computed directly in O(k*n) rather than by stepping through every
  // preceding combination. This is what lets a worker start scanning at an
  // arbitrary offset into the combination space instead of only at rank 0 --
  // the basis for splitting one search across several workers.
  function unrankCombination(n, k, rank) {
    const result = [];
    let r = rank, a = 0;
    for (let i = 0; i < k; i++) {
      for (let v = a; v < n; v++) {
        const c = nCrSafe(n - v - 1, k - i - 1);
        if (r < c) { result.push(v); a = v + 1; break; }
        r -= c;
      }
    }
    return result;
  }

  // Like combinationsGen, but yields only ranks [startRank, endRank) of the
  // full lexicographic sequence -- one unrank to find the starting point,
  // then the same cheap increment-based stepping as combinationsGen for the
  // rest of the range.
  function* combinationRangeGen(arr, k, startRank, endRank) {
    const n = arr.length;
    if (startRank >= endRank) return;
    const idx = unrankCombination(n, k, startRank);
    let count = startRank;
    while (true) {
      yield idx.map((i) => arr[i]);
      count++;
      if (count >= endRank) return;
      let i = k - 1;
      while (i >= 0 && idx[i] === i + n - k) i--;
      if (i < 0) return;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }

  // The per-subset scanning work, over one rank range of the combination
  // space -- containment filtering + congruence-signature grouping, with no
  // cross-range knowledge needed. This is the unit of work a worker runs;
  // running it once over the full [0, combosCount) range (what
  // computeClasses does below) is just the degenerate single-worker case.
  // Returns { totalValid, properMap } where properMap is properKey -> { rep,
  // count, fullKey, chiral, rotationalSymmetry } -- count is a per-range
  // partial orbit size, meant to be summed across ranges by mergeProperMaps.
  function scanRange({ annulus, fullLattice, n, minR, checkEdges, rejectCollinear, roundDp, startRank, endRank }) {
    let totalValid = 0;
    const properMap = new Map();
    for (const subset of combinationRangeGen(annulus, n, startRank, endRank)) {
      const poly = containmentCandidate(subset, minR, fullLattice, checkEdges, rejectCollinear);
      if (!poly) continue;
      totalValid++;
      const sig = fullSignature(poly, roundDp);
      if (!properMap.has(sig.properKey)) {
        properMap.set(sig.properKey, {
          rep: poly, count: 0, fullKey: sig.fullKey, chiral: sig.chiral,
          rotationalSymmetry: sig.rotationalSymmetry,
        });
      }
      properMap.get(sig.properKey).count++;
    }
    return { totalValid, properMap };
  }

  // Combines properMaps from any number of scanRange calls (e.g. one per
  // worker) into one, summing orbit counts for a properKey found in more
  // than one range. Which range's `rep`/`fullKey`/`chiral` survives for a
  // shared key is arbitrary -- by construction they describe the same
  // congruence class, so any of them is equally valid as the representative.
  function mergeProperMaps(maps) {
    const merged = new Map();
    for (const m of maps) {
      for (const [key, cls] of m.entries()) {
        if (!merged.has(key)) {
          merged.set(key, { rep: cls.rep, count: 0, fullKey: cls.fullKey, chiral: cls.chiral, rotationalSymmetry: cls.rotationalSymmetry });
        }
        merged.get(key).count += cls.count;
      }
    }
    return merged;
  }

  // The rest of the pipeline after scanning: proper-congruence class list,
  // mirror pairing via the rotation+reflection key, stats, and the
  // area-sorted id assignment. Operates purely on the (already merged)
  // properKey -> class map, independent of how many ranges/workers produced
  // it. Returns { classes, properKeyToIndex, fullClassCount }.
  function finalizeClasses(properMap, fullLattice) {
    const byFull = new Map();
    for (const [properKey, cls] of properMap.entries()) {
      if (!byFull.has(cls.fullKey)) byFull.set(cls.fullKey, []);
      byFull.get(cls.fullKey).push(properKey);
    }

    const classes = [];
    const properKeyToIndex = new Map();
    for (const [properKey, cls] of properMap.entries()) {
      const stats = polygonStats(cls.rep, fullLattice);
      classes.push({
        vertices: cls.rep, orbitSize: cls.count, chiral: cls.chiral,
        rotationalSymmetry: cls.rotationalSymmetry,
        fullKey: cls.fullKey, properKey, mirrorPartnerProperKey: null, ...stats,
      });
      properKeyToIndex.set(properKey, classes.length - 1);
    }
    for (const group of byFull.values()) {
      if (group.length === 2) {
        const [a, b] = group;
        classes[properKeyToIndex.get(a)].mirrorPartnerProperKey = b;
        classes[properKeyToIndex.get(b)].mirrorPartnerProperKey = a;
      }
    }
    classes.sort((a, b) => a.area - b.area);
    classes.forEach((c, i) => (c.id = i));
    // properKeyToIndex was built against pre-sort array positions; rebuild
    // it against final ids so a properKey always resolves to the correct
    // classes[] entry (app.js's mirror-partner lookup relies on this).
    properKeyToIndex.clear();
    classes.forEach((c) => properKeyToIndex.set(c.properKey, c.id));

    return { classes, properKeyToIndex, fullClassCount: byFull.size };
  }

  // Runs the full pipeline for one n: subset-count guard, containment
  // filtering, proper-congruence grouping (orbit size per class), mirror
  // pairing via the rotation+reflection key, and stats. Single-threaded --
  // scans the whole [0, combosCount) range itself. Returns
  // { skipped: reason } if the subset-count guard trips, otherwise
  // { totalSubsetsChecked, totalValid, classes, fullClassCount }. The
  // browser UI instead parallelizes by calling scanRange in several workers
  // over disjoint sub-ranges and combining with mergeProperMaps +
  // finalizeClasses; this function is the single-range special case of that
  // same pipeline, kept as the simple entry point for Node/tests.
  function computeClasses({ annulus, fullLattice, n, minR, checkEdges, rejectCollinear, maxCombos, roundDp = 6 }) {
    if (annulus.length < n) return { skipped: `only ${annulus.length} annulus points, need ${n}` };

    const combosCount = nCrSafe(annulus.length, n);
    if (combosCount > maxCombos) {
      return { skipped: `C(${annulus.length},${n})=${combosCount} exceeds guard (${maxCombos})` };
    }

    const { totalValid, properMap } = scanRange({
      annulus, fullLattice, n, minR, checkEdges, rejectCollinear, roundDp, startRank: 0, endRank: combosCount,
    });
    const { classes, properKeyToIndex, fullClassCount } = finalizeClasses(properMap, fullLattice);

    return { totalSubsetsChecked: combosCount, totalValid, classes, properKeyToIndex, fullClassCount };
  }

  const LatticeCore = {
    generateLattice, annulusPoints, cross, onSegmentStrict, segmentsProperlyIntersect,
    containmentCandidate, containmentFloorRatio, segMinDistToOrigin,
    polygonSignature, rotateCanonical, mirrorVertices, rotationalSymmetryOrder,
    fullSignature, area, convexHull, pointInPolygonStrict, polygonStats, round, keyOf,
    nCrSafe, combinationsGen, unrankCombination, combinationRangeGen,
    scanRange, mergeProperMaps, finalizeClasses, computeClasses,
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = LatticeCore;
  } else {
    root.LatticeCore = LatticeCore;
  }
})(typeof window !== "undefined" ? window : globalThis);
