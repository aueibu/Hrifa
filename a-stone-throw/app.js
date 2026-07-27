import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GROUND_SIZE = 2;
const SETTLE_LINEAR = 0.03;
const SETTLE_ANGULAR = 0.05;
const SETTLE_FRAMES = 40;
const MAX_ROUND_MS = 12000;
const OFF_SURFACE_Y = -0.25;
const HEIGHTFIELD_SEGMENTS = 24;
const MAX_BUMP_HEIGHT = 0.03; // meters, at roughness 1.0
const MIN_SUBSTEPS = 4;
const MAX_SUBSTEPS = 96;

const MATERIALS = {
  copper: { label: 'Copper', density: 8960, restitution: 0.55, friction: 0.4, color: '#b5651d', metal: true },
  steel: { label: 'Steel', density: 7850, restitution: 0.75, friction: 0.3, color: '#c7c9cc', metal: true },
  tungsten: { label: 'Tungsten', density: 19300, restitution: 0.45, friction: 0.35, color: '#4d4d4d', metal: true },
  aluminum: { label: 'Aluminum', density: 2700, restitution: 0.6, friction: 0.4, color: '#d6d6d6', metal: true },
  balsa: { label: 'Balsa wood (Janka 90)', density: 160, janka: 90, color: '#f0dcb0' },
  pine: { label: 'Pine wood (Janka 420)', density: 450, janka: 420, color: '#d8b878' },
  oak: { label: 'Oak wood (Janka 1290)', density: 750, janka: 1290, color: '#a97845' },
  hickory: { label: 'Hickory wood (Janka 1820)', density: 830, janka: 1820, color: '#8a5a2e' },
  ipe: { label: 'Ipe wood (Janka 3510)', density: 1075, janka: 3510, color: '#5c3a21' },
  custom: { label: 'Custom (Hrifa material)', density: 2000, restitution: 0.4, friction: 0.4, color: '#5aa9e6', custom: true },
};

// Woods don't share a single hardness metric with metals, so we derive
// restitution/friction from Janka hardness (lbf) instead of hand-tuning each species.
function resolveMaterialPhysics(mat) {
  if (mat.janka !== undefined) {
    const t = Math.min(1, mat.janka / 3600);
    return { restitution: 0.15 + t * 0.4, friction: 0.65 - t * 0.25 };
  }
  return { restitution: mat.restitution, friction: mat.friction };
}

const PRIMITIVE_SHAPES = {
  sphere: { label: 'Sphere' },
  box: { label: 'Box' },
  cylinder: { label: 'Cylinder (coin/disc)' },
};

const SURFACE_PRESETS = {
  blanket: { label: 'Blanket', friction: 0.85, roughness: 0.5, restitution: 0.05, base: '#4d3a63', accent: '#6b4f8a' },
  grass: { label: 'Grass', friction: 0.7, roughness: 0.75, restitution: 0.1, base: '#356134', accent: '#4c8c4a' },
  tile: { label: 'Tile', friction: 0.15, roughness: 0.05, restitution: 0.45, base: '#bcbcb4', accent: '#d8d8d0' },
  paper: { label: 'Paper', friction: 0.3, roughness: 0.1, restitution: 0.1, base: '#e4ddc6', accent: '#f5f0e1' },
  wood: { label: 'Wood', friction: 0.4, roughness: 0.2, restitution: 0.3, base: '#8a5f37', accent: '#b5834f' },
  concrete: { label: 'Concrete', friction: 0.55, roughness: 0.6, restitution: 0.35, base: '#7d7d75', accent: '#9a9a92' },
};

const TEXTURE_MULT = {
  smooth: { friction: 0.75, roughness: 0.4 },
  rough: { friction: 1.25, roughness: 1.6 },
};

let scene, camera, renderer, controls;
let groundMesh, groundTexture, heatmapCanvas, heatCtx;
let world, groundBody;

let surfaceSelect, textureSelect, angleSlider, angleValue, heightSlider, heightValue, colsInput, rowsInput;
let shapeSelect, sizeSlider, sizeValue, meshUpload, uploadStatusEl;
let materialSelect, materialInfoEl, customPropsEl, densitySlider, densityValue, hardnessSlider, hardnessValue, frictionSlider, frictionValue;
let countInput, addItemBtn, batchListEl;
let dropBtn, resetBtn, copyBtn, statusEl, resultsSummaryEl, resultsGridEl;

const customShapes = {};
let batch = [];
let activeObjects = [];
let previewObjects = []; // { mesh, itemDef, x, y, z } — the pre-drop "in hand" arrangement
let currentSlopeAngle = 0;
let currentSubsteps = MIN_SUBSTEPS;
let running = false;
let roundTimeout = null;
let lastResult = null;

boot();

async function boot() {
  try {
    await RAPIER.init();
    init();
  } catch (err) {
    const box = document.createElement('div');
    box.id = '__booterr';
    box.style.cssText = 'position:fixed;top:0;left:0;background:red;color:white;z-index:99999;font-size:14px;padding:8px;white-space:pre-wrap;max-width:100vw;';
    box.textContent = String((err && err.stack) || err);
    document.body.appendChild(box);
  }
}

function init() {
  wireDom();
  populateSelects();
  setupScene();
  setupPhysicsWorld(getSurface(), currentAngleRad());
  drawGroundTexture();
  updateMaterialInfo();
  updateAdvancedLabels();
  dropBtn.disabled = true;
  requestAnimationFrame(animate);
}

function wireDom() {
  surfaceSelect = document.getElementById('surfaceSelect');
  textureSelect = document.getElementById('textureSelect');
  angleSlider = document.getElementById('angleSlider');
  angleValue = document.getElementById('angleValue');
  heightSlider = document.getElementById('heightSlider');
  heightValue = document.getElementById('heightValue');
  colsInput = document.getElementById('colsInput');
  rowsInput = document.getElementById('rowsInput');

  shapeSelect = document.getElementById('shapeSelect');
  sizeSlider = document.getElementById('sizeSlider');
  sizeValue = document.getElementById('sizeValue');
  meshUpload = document.getElementById('meshUpload');
  uploadStatusEl = document.getElementById('uploadStatus');

  materialSelect = document.getElementById('materialSelect');
  materialInfoEl = document.getElementById('materialInfo');
  customPropsEl = document.getElementById('customMaterialProps');
  densitySlider = document.getElementById('densitySlider');
  densityValue = document.getElementById('densityValue');
  hardnessSlider = document.getElementById('hardnessSlider');
  hardnessValue = document.getElementById('hardnessValue');
  frictionSlider = document.getElementById('frictionSlider');
  frictionValue = document.getElementById('frictionValue');

  countInput = document.getElementById('countInput');
  addItemBtn = document.getElementById('addItemBtn');
  batchListEl = document.getElementById('batchList');

  dropBtn = document.getElementById('dropBtn');
  resetBtn = document.getElementById('resetBtn');
  copyBtn = document.getElementById('copyBtn');
  statusEl = document.getElementById('status');
  resultsSummaryEl = document.getElementById('resultsSummary');
  resultsGridEl = document.getElementById('resultsGrid');

  angleSlider.addEventListener('input', () => {
    angleValue.textContent = `${angleSlider.value}°`;
    updateGroundVisualTilt(currentAngleRad());
  });
  heightSlider.addEventListener('input', () => {
    heightValue.textContent = `${parseFloat(heightSlider.value).toFixed(1)} m`;
    updatePreview();
  });
  sizeSlider.addEventListener('input', () => {
    sizeValue.textContent = `${parseFloat(sizeSlider.value).toFixed(2)} m`;
  });
  surfaceSelect.addEventListener('change', drawGroundTexture);
  textureSelect.addEventListener('change', drawGroundTexture);
  colsInput.addEventListener('change', drawGroundTexture);
  rowsInput.addEventListener('change', drawGroundTexture);

  materialSelect.addEventListener('change', updateMaterialInfo);
  [densitySlider, hardnessSlider, frictionSlider].forEach((el) => {
    el.addEventListener('input', () => {
      updateAdvancedLabels();
      updateMaterialInfo();
    });
  });

  meshUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleMeshUpload(file);
  });

  addItemBtn.addEventListener('click', addBatchItem);
  dropBtn.addEventListener('click', dropAll);
  resetBtn.addEventListener('click', resetAll);
  copyBtn.addEventListener('click', copyResults);
}

function populateSelects() {
  Object.entries(SURFACE_PRESETS).forEach(([key, preset]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = preset.label;
    surfaceSelect.appendChild(opt);
  });

  Object.entries(PRIMITIVE_SHAPES).forEach(([key, preset]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = preset.label;
    shapeSelect.appendChild(opt);
  });

  Object.entries(MATERIALS).forEach(([key, preset]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = preset.label;
    materialSelect.appendChild(opt);
  });
}

function currentAngleRad() {
  return (parseFloat(angleSlider.value) || 0) * (Math.PI / 180);
}

function getSurface() {
  const preset = SURFACE_PRESETS[surfaceSelect.value];
  const mult = TEXTURE_MULT[textureSelect.value];
  return {
    ...preset,
    friction: preset.friction * mult.friction,
    roughness: preset.roughness * mult.roughness,
  };
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function clampInt(val, min, max, fallback) {
  const n = parseInt(val, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---------- Three.js scene ----------

function setupScene() {
  const container = document.getElementById('sceneContainer');
  const w = container.clientWidth || 720;
  const h = container.clientHeight || 560;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d10);

  camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
  camera.position.set(0, 1.8, 1.9);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.minDistance = 0.4;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
  dirLight.position.set(1.5, 3, 1.2);
  scene.add(dirLight);

  heatmapCanvas = document.createElement('canvas');
  heatmapCanvas.width = 512;
  heatmapCanvas.height = 512;
  heatCtx = heatmapCanvas.getContext('2d');
  groundTexture = new THREE.CanvasTexture(heatmapCanvas);

  const groundGeom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
  groundGeom.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  groundMesh = new THREE.Mesh(groundGeom, groundMat);
  scene.add(groundMesh);
}

function updateGroundVisualTilt(angleRad) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angleRad);
  groundMesh.quaternion.copy(q);
}

// Smooth deterministic bump field: a small sum of sine waves rather than per-vertex
// random noise, so adjacent heightfield cells (and the matching visual mesh) don't
// have jagged discontinuities. seed (0..1) varies the pattern per surface/texture.
function terrainNoise(u, v, seed) {
  const a = Math.sin((u * 3 + seed) * Math.PI * 2) * Math.cos((v * 2 + seed * 1.3) * Math.PI * 2);
  const b = Math.sin((u * 5 * v * 7 + seed * 2.1) * Math.PI * 2);
  const c = Math.sin((v * 7 + seed * 0.7) * Math.PI * 2);
  return 0.5 * a + 0.3 * b + 0.2 * c;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

// nsubdivs is the number of grid CELLS per side; the heights matrix has
// (nsubdivs + 1) samples per side, matching Rapier's own heightfield demo.
function buildHeightfieldSamples(nsubdivs, amplitude, seed) {
  const heights = new Float32Array((nsubdivs + 1) * (nsubdivs + 1));
  let k = 0;
  for (let i = 0; i <= nsubdivs; i++) {
    const u = i / nsubdivs;
    for (let j = 0; j <= nsubdivs; j++) {
      const v = j / nsubdivs;
      heights[k++] = terrainNoise(u, v, seed) * amplitude;
    }
  }
  return heights;
}

function buildGroundVisualGeometry(nrows, ncols, amplitude, seed) {
  const geom = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, ncols, nrows);
  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / GROUND_SIZE + 0.5;
    const v = pos.getY(i) / GROUND_SIZE + 0.5;
    pos.setZ(i, terrainNoise(u, v, seed) * amplitude);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.rotateX(-Math.PI / 2);
  return geom;
}

function updateGroundVisualGeometry(nrows, ncols, amplitude, seed) {
  const newGeom = buildGroundVisualGeometry(nrows, ncols, amplitude, seed);
  groundMesh.geometry.dispose();
  groundMesh.geometry = newGeom;
}

// Rapier has no rolling-resistance model: a rigid sphere on ANY incline keeps
// accelerating forever (real round objects lose energy to deformation at the
// contact patch, which rigid-body physics doesn't capture). Velocity-proportional
// damping alone can't fix this — it only produces a nonzero terminal creep speed,
// since the slope's driving force never stops pushing. This applies a constant
// angular deceleration instead (Coulomb-style, not speed-proportional), which
// *can* fully cancel the slope's driving torque below some critical angle and
// let grippy objects genuinely stall, like real static friction would. The
// deceleration ignores each shape's actual radius/inertia (a stylized
// approximation, consistent with the rest of this app's material model).
const ROLL_RESIST_SCALE = 100;

function applyRollingResistance(dt) {
  if (activeObjects.length === 0) return;
  const normalScale = Math.cos(currentSlopeAngle);
  activeObjects.forEach((obj) => {
    if (obj.settled || obj.offSurface) return;
    const body = obj.body;
    const av = body.angvel();
    const angSpeed = Math.hypot(av.x, av.y, av.z);
    if (angSpeed < 1e-4) return;
    const decel = (body.__friction ?? 0.3) * ROLL_RESIST_SCALE * normalScale * dt;
    const newSpeed = Math.max(0, angSpeed - decel);
    const scale = newSpeed / angSpeed;
    body.setAngvel({ x: av.x * scale, y: av.y * scale, z: av.z * scale }, true);
  });
}

function animate() {
  requestAnimationFrame(animate);
  if (world) {
    // Rapier's CCD sweep doesn't reliably catch small fast shapes against a
    // heightfield collider, so a sphere falling from any real height can skip
    // past the surface within a single 1/60s step. Substepping keeps each
    // step's travel distance well under the smallest object's size instead;
    // currentSubsteps is sized per-drop for the batch's smallest item and
    // drop height (see computeRequiredSubsteps).
    const subDt = 1 / 60 / currentSubsteps;
    for (let i = 0; i < currentSubsteps; i++) {
      applyRollingResistance(subDt);
      world.step();
    }
  }
  checkRoundProgress();
  activeObjects.forEach((obj) => {
    if (obj.offSurface) return;
    const t = obj.body.translation();
    const r = obj.body.rotation();
    obj.mesh.position.set(t.x, t.y, t.z);
    obj.mesh.quaternion.set(r.x, r.y, r.z, r.w);
  });
  controls.update();
  renderer.render(scene, camera);
}

// ---------- Physics world ----------

function setupPhysicsWorld(surface, angleRad) {
  world = new RAPIER.World({ x: 0, y: -9.82, z: 0 });
  world.timestep = 1 / 60 / currentSubsteps;

  const amplitude = clamp01(surface.roughness / 1.2) * MAX_BUMP_HEIGHT;
  const seed = hashSeed(surfaceSelect.value + textureSelect.value);
  const heights = buildHeightfieldSamples(HEIGHTFIELD_SEGMENTS, amplitude, seed);

  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angleRad);
  const groundBodyDesc = RAPIER.RigidBodyDesc.fixed().setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  groundBody = world.createRigidBody(groundBodyDesc);

  const groundColliderDesc = RAPIER.ColliderDesc.heightfield(
    HEIGHTFIELD_SEGMENTS,
    HEIGHTFIELD_SEGMENTS,
    heights,
    { x: GROUND_SIZE, y: 1, z: GROUND_SIZE }
  )
    .setFriction(surface.friction)
    .setRestitution(surface.restitution)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average);
  world.createCollider(groundColliderDesc, groundBody);

  if (groundMesh) updateGroundVisualGeometry(HEIGHTFIELD_SEGMENTS, HEIGHTFIELD_SEGMENTS, amplitude, seed);
}

// ---------- Shapes ----------

function buildPrimitiveGeometryAndShape(kind, sizeMeters) {
  if (kind === 'sphere') {
    const r = sizeMeters / 2;
    return { three: new THREE.SphereGeometry(r, 20, 16), colliderDesc: RAPIER.ColliderDesc.ball(r) };
  }
  if (kind === 'cylinder') {
    const r = sizeMeters / 2;
    const hgt = sizeMeters * 0.35;
    return {
      three: new THREE.CylinderGeometry(r, r, hgt, 24),
      colliderDesc: RAPIER.ColliderDesc.cylinder(hgt / 2, r),
    };
  }
  const s = sizeMeters;
  const depth = s * 0.8;
  return {
    three: new THREE.BoxGeometry(s, depth, depth),
    colliderDesc: RAPIER.ColliderDesc.cuboid(s / 2, depth / 2, depth / 2),
  };
}

function registerCustomShape(name, points) {
  const sampled = points.length > 4000 ? samplePoints(points, 4000) : points;
  if (sampled.length < 4) throw new Error('Shape has no volume');

  const centroid = new THREE.Vector3();
  sampled.forEach((v) => centroid.add(v));
  centroid.divideScalar(sampled.length);
  const centered = sampled.map((v) => v.clone().sub(centroid));

  const box = new THREE.Box3().setFromPoints(centered);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const normVertices = centered.map((v) => v.clone().divideScalar(maxDim));

  const geometry = new ConvexGeometry(normVertices);
  geometry.computeVertexNormals();

  const id = `mesh_${Date.now()}`;
  customShapes[id] = { id, label: name, normVertices, geometry };

  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = `Imported: ${name}`;
  shapeSelect.appendChild(opt);
  shapeSelect.value = id;
  uploadStatusEl.textContent = `Loaded "${name}" — normalized to a 1 m bounding box.`;
}

function samplePoints(points, n) {
  const out = [];
  const step = points.length / n;
  for (let i = 0; i < n; i++) out.push(points[Math.floor(i * step)]);
  return out;
}

function handleMeshUpload(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'obj' && ext !== 'stl') {
    uploadStatusEl.textContent = 'Only .obj and .stl files are supported.';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const points = [];
      if (ext === 'obj') {
        const obj = new OBJLoader().parse(e.target.result);
        obj.traverse((child) => {
          if (child.isMesh) {
            const pos = child.geometry.getAttribute('position');
            for (let i = 0; i < pos.count; i++) points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
          }
        });
      } else {
        const geom = new STLLoader().parse(e.target.result);
        const pos = geom.getAttribute('position');
        for (let i = 0; i < pos.count; i++) points.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      }
      if (points.length < 4) throw new Error('not enough geometry to build a convex shape');
      registerCustomShape(file.name, points);
    } catch (err) {
      uploadStatusEl.textContent = `Import failed: ${err.message}`;
    }
  };
  reader.onerror = () => { uploadStatusEl.textContent = 'Could not read file.'; };
  if (ext === 'obj') reader.readAsText(file);
  else reader.readAsArrayBuffer(file);
}

// ---------- Materials / advanced UI ----------

function updateAdvancedLabels() {
  densityValue.textContent = densitySlider.value;
  hardnessValue.textContent = parseFloat(hardnessSlider.value).toFixed(2);
  frictionValue.textContent = parseFloat(frictionSlider.value).toFixed(2);
}

function updateMaterialInfo() {
  const preset = MATERIALS[materialSelect.value];
  customPropsEl.style.display = preset.custom ? 'block' : 'none';
  if (preset.custom) {
    materialInfoEl.textContent = `Density ${densitySlider.value} kg/m³ · Restitution ${parseFloat(hardnessSlider.value).toFixed(2)} · Friction ${parseFloat(frictionSlider.value).toFixed(2)}`;
  } else {
    const phys = resolveMaterialPhysics(preset);
    const jankaNote = preset.janka !== undefined ? ` (derived from Janka ${preset.janka})` : '';
    materialInfoEl.textContent = `Density ${preset.density} kg/m³ · Restitution ${phys.restitution.toFixed(2)} · Friction ${phys.friction.toFixed(2)}${jankaNote}`;
  }
}

function resolveCurrentMaterial() {
  const key = materialSelect.value;
  const preset = MATERIALS[key];
  if (preset.custom) {
    return {
      label: 'Custom',
      density: parseFloat(densitySlider.value),
      restitution: parseFloat(hardnessSlider.value),
      friction: parseFloat(frictionSlider.value),
      color: preset.color,
      metal: false,
    };
  }
  const phys = resolveMaterialPhysics(preset);
  return { label: preset.label, density: preset.density, restitution: phys.restitution, friction: phys.friction, color: preset.color, metal: !!preset.metal };
}

// ---------- Batch ----------

function buildItemDefFromControls() {
  const shapeVal = shapeSelect.value;
  const isMesh = !!customShapes[shapeVal];
  const material = resolveCurrentMaterial();
  const shapeLabel = isMesh ? customShapes[shapeVal].label : PRIMITIVE_SHAPES[shapeVal].label;
  return {
    shapeKind: isMesh ? 'mesh' : shapeVal,
    meshId: isMesh ? shapeVal : undefined,
    sizeMeters: parseFloat(sizeSlider.value) || 0.06,
    material,
    label: `${material.label} ${shapeLabel}`,
  };
}

function addBatchItem() {
  const count = Math.max(1, Math.min(60, parseInt(countInput.value, 10) || 1));
  const itemDef = buildItemDefFromControls();
  batch.push({ itemDef, count });
  renderBatchList();
}

function renderBatchList() {
  batchListEl.innerHTML = '';
  batch.forEach((entry) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${entry.itemDef.label} × ${entry.count}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      batch = batch.filter((b) => b !== entry);
      renderBatchList();
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    batchListEl.appendChild(li);
  });
  dropBtn.disabled = batch.length === 0;
  updatePreview();
}

// Roughness also jitters each object's own friction/restitution and gives it a
// small random tumble, layered on top of the real bump geometry in the heightfield.
function jitterMaterialForRoughness(material, roughness) {
  if (!roughness) return material;
  return {
    ...material,
    friction: clamp01(material.friction + (Math.random() - 0.5) * roughness * 0.4),
    restitution: clamp01(material.restitution + (Math.random() - 0.5) * roughness * 0.25),
  };
}

function createBodyFromItemDef(itemDef, x, y, z, roughness) {
  let colliderDesc, threeGeom;
  const jitteredMaterial = jitterMaterialForRoughness(itemDef.material, roughness);

  if (itemDef.shapeKind === 'mesh') {
    const shapeData = customShapes[itemDef.meshId];
    const scale = itemDef.sizeMeters;
    const flat = new Float32Array(shapeData.normVertices.length * 3);
    shapeData.normVertices.forEach((v, i) => {
      flat[i * 3] = v.x * scale;
      flat[i * 3 + 1] = v.y * scale;
      flat[i * 3 + 2] = v.z * scale;
    });
    colliderDesc = RAPIER.ColliderDesc.convexHull(flat);
    if (!colliderDesc) {
      // Degenerate point cloud (e.g. near-planar mesh) — fall back to its bounding box.
      const box = new THREE.Box3().setFromBufferAttribute(shapeData.geometry.getAttribute('position'));
      const size = new THREE.Vector3();
      box.getSize(size);
      colliderDesc = RAPIER.ColliderDesc.cuboid(
        Math.max(0.005, (size.x * scale) / 2),
        Math.max(0.005, (size.y * scale) / 2),
        Math.max(0.005, (size.z * scale) / 2)
      );
    }
    threeGeom = shapeData.geometry;
  } else {
    const built = buildPrimitiveGeometryAndShape(itemDef.shapeKind, itemDef.sizeMeters);
    colliderDesc = built.colliderDesc;
    threeGeom = built.three;
  }

  colliderDesc
    .setDensity(itemDef.material.density)
    .setFriction(jitteredMaterial.friction)
    .setRestitution(jitteredMaterial.restitution)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average);

  const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
  const initialQuat = new THREE.Quaternion().setFromAxisAngle(axis, Math.random() * Math.PI * 2);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setRotation({ x: initialQuat.x, y: initialQuat.y, z: initialQuat.z, w: initialQuat.w })
    .setLinearDamping(0.05)
    .setAngularDamping(0.15)
    .setCcdEnabled(true);
  const body = world.createRigidBody(bodyDesc);
  world.createCollider(colliderDesc, body);

  if (roughness > 0) {
    body.setAngvel(
      { x: (Math.random() - 0.5) * roughness * 4, y: (Math.random() - 0.5) * roughness * 4, z: (Math.random() - 0.5) * roughness * 4 },
      true
    );
  }
  body.__friction = jitteredMaterial.friction;

  const mesh = createVisualMesh(itemDef, threeGeom);
  scene.add(mesh);

  return { body, mesh };
}

function createVisualMesh(itemDef, threeGeomOverride) {
  const threeGeom = threeGeomOverride
    || (itemDef.shapeKind === 'mesh'
      ? customShapes[itemDef.meshId].geometry
      : buildPrimitiveGeometryAndShape(itemDef.shapeKind, itemDef.sizeMeters).three);
  const meshMaterial = new THREE.MeshStandardMaterial({
    color: itemDef.material.color,
    metalness: itemDef.material.metal ? 0.8 : 0.05,
    roughness: itemDef.material.metal ? 0.35 : 0.75,
  });
  const mesh = new THREE.Mesh(threeGeom, meshMaterial);
  if (itemDef.shapeKind === 'mesh') mesh.scale.setScalar(itemDef.sizeMeters);
  return mesh;
}

// ---------- Round lifecycle ----------

// Approximate half-diagonal of each shape's bounding box, used only to keep
// spawn positions from overlapping — doesn't need to be exact, just not smaller
// than the real shape.
function estimateBoundingRadius(itemDef) {
  const s = itemDef.sizeMeters;
  if (itemDef.shapeKind === 'sphere') return s / 2;
  if (itemDef.shapeKind === 'cylinder') return 0.5 * Math.hypot(s, s * 0.35);
  if (itemDef.shapeKind === 'mesh') return s * 0.75;
  const depth = s * 0.8;
  return 0.5 * Math.hypot(s, depth, depth);
}

// Packs items into a clustered, varied-height pile (like a handful being
// dropped) using rejection sampling with a 3D distance check against every
// already-placed item, so nothing spawns overlapping — real solids can't
// interpenetrate, even clasped tightly together. Falls back to widening the
// cluster if an item can't find a free spot after enough attempts, so dense
// batches still terminate instead of looping forever.
function packClusterPositions(items, heightMeters) {
  const positions = [];
  const baseRadius = Math.max(0.015, ...items.map((it) => it.radius));
  let clusterRadius = baseRadius * 1.5 + Math.cbrt(items.length) * baseRadius * 0.7;
  const maxAttempts = 80;

  items.forEach((item) => {
    let attempts = 0;
    while (true) {
      attempts++;
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * clusterRadius;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;
      const y = Math.max(item.radius + 0.005, heightMeters + (Math.random() - 0.5) * heightMeters * 0.5);

      let overlaps = false;
      for (const p of positions) {
        const minDist = (p.radius + item.radius) * 1.02;
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        if (dx * dx + dy * dy + dz * dz < minDist * minDist) { overlaps = true; break; }
      }
      if (!overlaps) {
        positions.push({ x, y, z, radius: item.radius });
        break;
      }
      if (attempts >= maxAttempts) {
        clusterRadius *= 1.2;
        attempts = 0;
      }
    }
  });

  return positions;
}

// Shows the packed "in hand" arrangement in the scene as plain (non-physics)
// meshes before Drop is pressed, so the cluster is visible ahead of time.
// Drop then reuses these exact positions instead of re-rolling new ones.
function clearPreview() {
  previewObjects.forEach((p) => scene.remove(p.mesh));
  previewObjects = [];
}

function updatePreview() {
  clearPreview();
  if (running || batch.length === 0) return;

  const heightMeters = parseFloat(heightSlider.value) || 1;
  const items = [];
  batch.forEach((entry) => {
    for (let i = 0; i < entry.count; i++) {
      items.push({ itemDef: entry.itemDef, radius: estimateBoundingRadius(entry.itemDef) });
    }
  });
  const positions = packClusterPositions(items, heightMeters);

  items.forEach((item, idx) => {
    const { x, y, z } = positions[idx];
    const mesh = createVisualMesh(item.itemDef);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    previewObjects.push({ mesh, itemDef: item.itemDef, x, y, z });
  });
}

// Fast falling objects can skip clean through the heightfield within a single
// physics step if the step's travel distance approaches the object's own size
// (see the substepping note in animate()). Sizing substeps to the batch's
// smallest item and actual fall height means small objects or big drops
// automatically get finer steps, instead of a fixed count that's only safe
// for one particular size/height combination.
function computeRequiredSubsteps(dropHeightMeters, minRadius) {
  const vMax = Math.sqrt(2 * 9.82 * Math.max(0.05, dropHeightMeters));
  const safetyFactor = 0.4;
  const subDtNeeded = (safetyFactor * minRadius) / vMax;
  const steps = Math.ceil(1 / 60 / subDtNeeded);
  return Math.min(MAX_SUBSTEPS, Math.max(MIN_SUBSTEPS, steps));
}

function dropAll() {
  if (batch.length === 0) return;
  teardownRound();
  if (previewObjects.length === 0) updatePreview();

  const minRadius = Math.min(...batch.map((e) => estimateBoundingRadius(e.itemDef)));
  const maxSpawnHeight = Math.max(...previewObjects.map((p) => p.y));
  currentSubsteps = computeRequiredSubsteps(maxSpawnHeight, minRadius);

  const surface = getSurface();
  const angleRad = currentAngleRad();
  currentSlopeAngle = angleRad;
  setupPhysicsWorld(surface, angleRad);
  updateGroundVisualTilt(angleRad);

  // Release the exact arrangement already shown in the preview, so what the
  // user saw before hitting Drop is exactly what falls.
  const spawnList = previewObjects.map((p) => ({ itemDef: p.itemDef, x: p.x, y: p.y, z: p.z }));
  clearPreview();

  spawnList.forEach((item) => {
    const { body, mesh } = createBodyFromItemDef(item.itemDef, item.x, item.y, item.z, surface.roughness);
    activeObjects.push({ body, mesh, settled: false, offSurface: false, stableFrames: 0 });
  });

  running = true;
  lastResult = null;
  dropBtn.disabled = true;
  statusEl.textContent = `Dropping ${activeObjects.length} item(s)…`;
  resultsSummaryEl.textContent = 'Simulating…';
  resultsGridEl.innerHTML = '';
  drawGroundTexture();

  clearTimeout(roundTimeout);
  roundTimeout = setTimeout(() => {
    if (running) finishRound(true);
  }, MAX_ROUND_MS);
}

function freezeBody(obj) {
  obj.settled = true;
  obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  obj.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
}

function checkRoundProgress() {
  if (!running) return;
  let stillActive = false;
  activeObjects.forEach((obj) => {
    if (obj.settled || obj.offSurface) return;
    const t = obj.body.translation();
    if (t.y < OFF_SURFACE_Y) {
      obj.offSurface = true;
      world.removeRigidBody(obj.body);
      scene.remove(obj.mesh);
      return;
    }
    const lin = obj.body.linvel();
    const ang = obj.body.angvel();
    const linSpeed = Math.hypot(lin.x, lin.y, lin.z);
    const angSpeed = Math.hypot(ang.x, ang.y, ang.z);
    if (linSpeed < SETTLE_LINEAR && angSpeed < SETTLE_ANGULAR) {
      obj.stableFrames += 1;
      if (obj.stableFrames > SETTLE_FRAMES) {
        freezeBody(obj);
        return;
      }
    } else {
      obj.stableFrames = 0;
    }
    stillActive = true;
  });
  if (!stillActive) finishRound(false);
}

function finishRound(timedOut) {
  running = false;
  clearTimeout(roundTimeout);
  dropBtn.disabled = false;

  activeObjects.forEach((obj) => {
    if (!obj.settled && !obj.offSurface) freezeBody(obj);
  });

  const result = computeGridCounts();
  lastResult = result;
  renderResultsPanel(result);
  drawGroundTexture();

  const offCount = activeObjects.filter((o) => o.offSurface).length;
  const onCount = activeObjects.length - offCount;
  statusEl.textContent = `${timedOut ? 'Settled (timeout). ' : 'Settled. '}${onCount} on surface, ${offCount} off surface.`;
}

function computeGridCounts() {
  const cols = clampInt(colsInput.value, 2, 50, 6);
  const rows = clampInt(rowsInput.value, 2, 50, 6);
  const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
  const gr = groundBody.rotation();
  const invQ = new THREE.Quaternion(gr.x, gr.y, gr.z, gr.w).invert();

  activeObjects.forEach((obj) => {
    if (obj.offSurface) return;
    const t = obj.body.translation();
    const rel = new THREE.Vector3(t.x, t.y, t.z);
    rel.applyQuaternion(invQ);
    let col = Math.floor(((rel.x + GROUND_SIZE / 2) / GROUND_SIZE) * cols);
    let row = Math.floor(((rel.z + GROUND_SIZE / 2) / GROUND_SIZE) * rows);
    col = Math.min(cols - 1, Math.max(0, col));
    row = Math.min(rows - 1, Math.max(0, row));
    counts[row][col] += 1;
  });

  return { counts, rows, cols };
}

function renderResultsPanel(result) {
  const { counts, rows, cols } = result;
  let total = 0;
  let max = 0;
  let maxCell = null;
  counts.forEach((rowArr, r) => rowArr.forEach((c, colIdx) => {
    total += c;
    if (c > max) { max = c; maxCell = [r, colIdx]; }
  }));

  const offCount = activeObjects.filter((o) => o.offSurface).length;
  resultsSummaryEl.textContent =
    `On surface: ${total}\nOff surface: ${offCount}\n` +
    (maxCell ? `Busiest cell: row ${maxCell[0] + 1}, col ${maxCell[1] + 1} (${max})` : '');

  resultsGridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  resultsGridEl.innerHTML = '';
  counts.forEach((rowArr) => rowArr.forEach((c) => {
    const cell = document.createElement('div');
    cell.className = 'cell' + (c > 0 ? ' has-count' : '');
    cell.textContent = c > 0 ? c : '';
    resultsGridEl.appendChild(cell);
  }));
}

function teardownRound() {
  activeObjects.forEach((obj) => {
    if (!obj.offSurface && world) world.removeRigidBody(obj.body);
    scene.remove(obj.mesh);
  });
  activeObjects = [];
  running = false;
  clearTimeout(roundTimeout);
}

function resetAll() {
  teardownRound();
  lastResult = null;
  statusEl.textContent = batch.length ? 'Ready to drop.' : 'Add items to the batch, then drop.';
  resultsSummaryEl.textContent = 'No drops yet.';
  resultsGridEl.innerHTML = '';
  dropBtn.disabled = batch.length === 0;
  drawGroundTexture();
  updatePreview();
}

function copyResults() {
  if (!lastResult) return;
  const { counts, rows, cols } = lastResult;
  const lines = [`Surface: ${SURFACE_PRESETS[surfaceSelect.value].label} (${textureSelect.value}), tilt ${angleSlider.value}°, drop height ${parseFloat(heightSlider.value).toFixed(1)} m`];
  lines.push(`Grid: ${cols} cols × ${rows} rows`);
  counts.forEach((rowArr, r) => lines.push(`row ${r + 1}: ${rowArr.join(' ')}`));
  const offCount = activeObjects.filter((o) => o.offSurface).length;
  lines.push(`Off surface: ${offCount}`);
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = original; }, 1200);
  });
}

// ---------- Ground texture (grid + heatmap) ----------

function drawGroundTexture() {
  const preset = SURFACE_PRESETS[surfaceSelect.value];
  const mult = TEXTURE_MULT[textureSelect.value];
  const roughnessVisual = preset.roughness * mult.roughness;
  const cols = clampInt(colsInput.value, 2, 50, 6);
  const rows = clampInt(rowsInput.value, 2, 50, 6);
  const w = heatmapCanvas.width, h = heatmapCanvas.height;

  heatCtx.clearRect(0, 0, w, h);
  heatCtx.fillStyle = preset.base;
  heatCtx.fillRect(0, 0, w, h);

  heatCtx.globalAlpha = 0.3;
  heatCtx.fillStyle = preset.accent;
  const seedCount = Math.round(roughnessVisual * 220);
  let seed = 12345;
  for (let i = 0; i < seedCount; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const rx = (seed / 233280) * w;
    seed = (seed * 9301 + 49297) % 233280;
    const ry = (seed / 233280) * h;
    heatCtx.beginPath();
    heatCtx.arc(rx, ry, 2, 0, Math.PI * 2);
    heatCtx.fill();
  }
  heatCtx.globalAlpha = 1;

  if (lastResult) {
    const { counts, rows: r2, cols: c2 } = lastResult;
    let max = 1;
    counts.forEach((rowArr) => rowArr.forEach((c) => { if (c > max) max = c; }));
    const cellW = w / c2, cellH = h / r2;
    counts.forEach((rowArr, ri) => rowArr.forEach((c, ci) => {
      if (c === 0) return;
      const alpha = 0.2 + 0.6 * (c / max);
      heatCtx.fillStyle = `rgba(230, 57, 70, ${alpha})`;
      heatCtx.fillRect(ci * cellW, ri * cellH, cellW, cellH);
    }));
  }

  heatCtx.strokeStyle = 'rgba(255,255,255,0.3)';
  heatCtx.lineWidth = 2;
  for (let c = 1; c < cols; c++) {
    const x = (w / cols) * c;
    heatCtx.beginPath(); heatCtx.moveTo(x, 0); heatCtx.lineTo(x, h); heatCtx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    const y = (h / rows) * r;
    heatCtx.beginPath(); heatCtx.moveTo(0, y); heatCtx.lineTo(w, y); heatCtx.stroke();
  }
  heatCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  heatCtx.strokeRect(1, 1, w - 2, h - 2);

  groundTexture.needsUpdate = true;
}
