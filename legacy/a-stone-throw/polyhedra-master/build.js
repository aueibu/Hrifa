// One-off build script: turns the raw finnp/polyhedra data (Archimedean +
// Johnson) into a single normalized JSON the drop-simulator app can fetch.
// Catalan solids aren't in this dataset -- they're computed here as the
// polar dual of each Archimedean solid (reciprocation about a sphere
// centered on the origin), which is the standard construction: since these
// Archimedean coordinate sets are symmetric about the origin, reciprocating
// each face to a point (unit outward normal * 1/distance-from-origin)
// produces one dual vertex per original face, in the correct combinatorial
// arrangement for the matching Catalan solid.
const fs = require('fs');
const path = require('path');

const archimedean = require('./data/archimedean.json');
const johnson = require('./data/johnson.json');
const prisms = require('./data/prisms.json');
const antiprisms = require('./data/antiprisms.json');

function vec3(a) { return { x: a[0], y: a[1], z: a[2] }; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function length(a) { return Math.sqrt(dot(a, a)); }
function normalize(a) { const l = length(a) || 1; return scale(a, 1 / l); }

function centroidOf(points) {
  let c = { x: 0, y: 0, z: 0 };
  points.forEach((p) => { c = add(c, p); });
  return scale(c, 1 / points.length);
}

// Recenter on centroid, then scale so circumradius (max vertex distance from
// the new center) is exactly 0.5 -- matches the existing app.js convention
// where Platonic solids are "built at exactly this circumradius" and
// estimateBoundingRadius() just returns targetSize/2 for them.
function normalizeToUnitCircumradius(rawVerts) {
  const pts = rawVerts.map(vec3);
  const c = centroidOf(pts);
  const centered = pts.map((p) => sub(p, c));
  let maxR = 0;
  centered.forEach((p) => { const r = length(p); if (r > maxR) maxR = r; });
  const s = 0.5 / (maxR || 1);
  return centered.map((p) => scale(p, s));
}

function toArr(points) {
  return points.map((p) => [round(p.x), round(p.y), round(p.z)]);
}
function round(n) { return Math.round(n * 1e6) / 1e6; }

function camelCase(label) {
  const base = label.replace(/\s*\([^)]*\)\s*$/, ''); // strip trailing "(J1)" etc.
  const words = base
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/);
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

// ---------- Archimedean (direct from source, just normalized) ----------
const archimedeanOut = {};
Object.values(archimedean).forEach((solid) => {
  const key = camelCase(solid.name);
  archimedeanOut[key] = { label: solid.name, vertices: toArr(normalizeToUnitCircumradius(solid.vertex)) };
});

// ---------- Catalan (dual of each Archimedean solid) ----------
const ARCHIMEDEAN_TO_CATALAN = {
  'Truncated Tetrahedron': 'Triakis Tetrahedron',
  'Truncated Cube': 'Triakis Octahedron',
  'Truncated Octahedron': 'Tetrakis Hexahedron',
  'Truncated Dodecahedron': 'Triakis Icosahedron',
  'Truncated Icosahedron': 'Pentakis Dodecahedron',
  'Cuboctahedron': 'Rhombic Dodecahedron',
  'Truncated Cuboctahedron': 'Disdyakis Dodecahedron',
  'Rhombicuboctahedron': 'Deltoidal Icositetrahedron',
  'Snub Cuboctahedron': 'Pentagonal Icositetrahedron',
  'Icosidodecahedron': 'Rhombic Triacontahedron',
  'Truncated Icosidodecahedron': 'Disdyakis Triacontahedron',
  'Rhombicosidodecahedron': 'Deltoidal Hexecontahedron',
  'Snub Icosidodecahedron': 'Pentagonal Hexecontahedron',
};

function dualVertices(solid) {
  const pts = solid.vertex.map(vec3);
  return solid.face.map((faceIdx) => {
    const faceVerts = faceIdx.map((i) => pts[i]);
    const c = centroidOf(faceVerts);
    // Newell's method for a robust face normal even if not perfectly planar.
    let n = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < faceVerts.length; i++) {
      const cur = faceVerts[i];
      const nxt = faceVerts[(i + 1) % faceVerts.length];
      n.x += (cur.y - nxt.y) * (cur.z + nxt.z);
      n.y += (cur.z - nxt.z) * (cur.x + nxt.x);
      n.z += (cur.x - nxt.x) * (cur.y + nxt.y);
    }
    n = normalize(n);
    // Ensure outward-pointing (solids are centered near the origin).
    if (dot(n, c) < 0) n = scale(n, -1);
    const d = dot(n, faceVerts[0]); // face's signed distance from origin along n
    const p = scale(n, 1 / d); // polar reciprocal point for this face
    return [p.x, p.y, p.z]; // normalizeToUnitCircumradius expects raw [x,y,z] arrays
  });
}

const catalanOut = {};
let missingCatalanSources = [];
Object.values(archimedean).forEach((solid) => {
  const catalanName = ARCHIMEDEAN_TO_CATALAN[solid.name];
  if (!catalanName) { missingCatalanSources.push(solid.name); return; }
  const dv = dualVertices(solid);
  const key = camelCase(catalanName);
  catalanOut[key] = { label: catalanName, vertices: toArr(normalizeToUnitCircumradius(dv)) };
});

// ---------- Johnson (direct from source, just normalized) ----------
const johnsonOut = {};
const usedKeys = new Set();
Object.entries(johnson).forEach(([jid, solid]) => {
  let key = camelCase(solid.name);
  if (usedKeys.has(key)) key = `${key}${jid}`; // disambiguate collisions
  usedKeys.add(key);
  johnsonOut[key] = { label: solid.name, vertices: toArr(normalizeToUnitCircumradius(solid.vertex)) };
});

// ---------- Prisms / Antiprisms (direct from source, just normalized) ----------
// "Square Prism (Cube)" and "Triangular Antiprism (Octahedron)" keep their
// source labels (which already self-disambiguate) but camelCase to
// "squarePrism"/"triangularAntiprism" -- the "(Cube)"/"(Octahedron)" suffix is
// stripped same as Johnson's "(Jn)" suffix, so no key collision with the
// existing hardcoded cube/octahedron shapes.
function buildDirectSet(source) {
  const outSet = {};
  Object.values(source).forEach((solid) => {
    const key = camelCase(solid.name);
    outSet[key] = { label: solid.name, vertices: toArr(normalizeToUnitCircumradius(solid.vertex)) };
  });
  return outSet;
}
const prismsOut = buildDirectSet(prisms);
const antiprismsOut = buildDirectSet(antiprisms);

const out = {
  archimedean: archimedeanOut,
  catalan: catalanOut,
  johnson: johnsonOut,
  prisms: prismsOut,
  antiprisms: antiprismsOut,
};
const outPath = path.join(__dirname, '..', 'polyhedra-data.json');
fs.writeFileSync(outPath, JSON.stringify(out));

// ---------- Verification ----------
console.log('archimedean count:', Object.keys(archimedeanOut).length);
console.log('catalan count:', Object.keys(catalanOut).length, missingCatalanSources.length ? `MISSING: ${missingCatalanSources}` : '');
console.log('johnson count:', Object.keys(johnsonOut).length);
console.log('prisms count:', Object.keys(prismsOut).length);
console.log('antiprisms count:', Object.keys(antiprismsOut).length);
console.log('output file size (bytes):', fs.statSync(outPath).size);

// collision check across every category's keys (they all end up merged into
// one flat lookup in app.js's POLYHEDRA_DATA)
const allKeys = [];
Object.values(out).forEach((cat) => allKeys.push(...Object.keys(cat)));
const dupes = allKeys.filter((k, i) => allKeys.indexOf(k) !== i);
console.log('cross-category key collisions:', dupes.length ? dupes : 'none');

// spot checks: known vertex counts
const checks = [
  ['archimedean', 'truncatedTetrahedron', 12],
  ['catalan', 'rhombicDodecahedron', 14],
  ['catalan', 'triakisTetrahedron', 8],
  ['johnson', 'squarePyramid', 5],
];
checks.forEach(([cat, key, expected]) => {
  const entry = out[cat][key];
  if (!entry) { console.log(`MISSING ${cat}.${key}`); return; }
  const n = entry.vertices.length;
  console.log(`${cat}.${key}: ${n} vertices (expected ${expected}) - ${n === expected ? 'OK' : 'MISMATCH'}`);
});

// circumradius sanity check across everything
let worstDelta = 0;
Object.values(out).forEach((cat) => {
  Object.values(cat).forEach((entry) => {
    entry.vertices.forEach(([x, y, z]) => {
      const r = Math.sqrt(x * x + y * y + z * z);
      const delta = Math.abs(r - 0.5);
      if (delta > worstDelta) worstDelta = delta;
    });
  });
});
console.log('worst circumradius deviation from 0.5:', worstDelta);
