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

// Short bibliography backing the friction/restitution numbers below. Every
// non-custom material/surface cites one of these via frictionRef/restitutionRef,
// shown to the user in the material/surface info line. `verified: true` means the
// number was pulled from the actual page/table this session (fetched and read);
// without it, the citation is a well-known reference category we could not
// directly confirm the text of (paywalled, or the fetch returned unreadable
// binary — noted per-entry). Real friction/restitution vary with finish,
// moisture, and impact velocity regardless of source.
const SOURCES = {
  crcSteelSteel: {
    short: 'CRC Handbook of Physical Quantities (1997), steel-on-steel',
    full: 'CRC Handbook of Physical Quantities (1997), μk=0.57 for dry steel-on-steel — confirmed via hypertextbook.com/facts/2005/steel.shtml, which compiles this figure alongside 4 other textbook sources ranging 0.09–0.6',
    verified: true,
  },
  schoolForChampionsCopperSteel: {
    short: 'School for Champions friction reference, copper-on-steel',
    full: 'School for Champions compiled friction table, μ=0.44 for copper-on-steel — confirmed via hypertextbook.com/facts/2005/steel.shtml',
    verified: true,
  },
  mechguruAlSteel: {
    short: 'MechGuru compiled friction table, aluminum-on-steel',
    full: 'mechguru.com, "Typical Coefficient of Friction Values for Common Materials" — aluminum-steel μs=0.35/μk=0.25, aluminum-aluminum μs=0.42/μk=0.34 (compiled from multiple engineering sources, page itself flags the values as approximate)',
    verified: true,
  },
  physicsFactbookDropTest: {
    short: 'Physics Factbook drop-test (Midwood HS, 2005)',
    full: 'J. Bennett & R. Meepagala, Midwood HS Science Research Program (2005), via hypertextbook.com/facts/2006/restitution.shtml — measured, dropped from 92cm onto a concrete floor: golf ball 0.858, rubber-band ball 0.828, billiard ball 0.804, hand ball 0.752, hard plastic ball 0.688, glass marble 0.658, wooden ball 0.603, steel ball bearing 0.597. Also used to anchor the concrete surface\'s own restitution baseline (0.6, close to the steel/wood figures) - since this app models material and surface restitution as separate values that get averaged, and this dataset already reports combined (object+surface) results, there is some double-counting inherent in the model; 0.6 was chosen so the average of concrete (0.6) and steel (0.6) reproduces the measured 0.597 almost exactly.',
    verified: true,
  },
  wearHardMetalEstimate: {
    short: 'interpolated from hard-metal friction/restitution trend',
    full: 'No direct published friction/restitution figures found for pure (non-carbide) tungsten this session; value is interpolated within the hard-metal range bounded by the verified steel and aluminum figures above, not a directly measured number',
    verified: false,
  },
  ductileMetalEstimate: {
    short: 'interpolated from ductility/hardness trend',
    full: 'No directly measured restitution figure found for this metal this session; estimated relative to the verified steel/wood drop-test values by ductility (softer, more energy-absorbing metals bounce less)',
    verified: false,
  },
  woodFrictionCompiled: {
    short: 'compiled wood-friction sources (0.25-0.55 range)',
    full: 'Compiled from mechguru.com (wood-wood μs=0.25), hypertextbook.com/facts/2005/wood.shtml (student incline-plane tests, wood-on-copper μs=0.26), and general textbook consensus (wood-on-wood dry range 0.25-0.55, mean measured ≈0.38). The primary USDA Forest Products Laboratory Wood Handbook chapter PDF was fetched this session but returned as unreadable encoded binary, so its specific table could not be directly confirmed and is not cited here.',
    verified: true,
  },
  turfFriction: {
    short: 'natural turf friction (unsourced estimate)',
    full: 'No usable object-on-grass friction figure found yet. Nigg & Herzog, Biomechanics of the Musculo-Skeletal System was checked directly (index has no traction/turf/playing-surface entries) and ruled out. Remaining candidates are sports-surface-engineering papers (e.g. FIFA Quality Programme turf test methods) rather than biomechanics texts, since those measure shoe/cleat traction (a different, stud-penetration-driven number) rather than plain sliding friction.',
    verified: false,
  },
  softSurfaceBounce: {
    short: 'cushioned-surface bounce testing (not verified this session)',
    full: 'General sports-surface engineering literature on soft/cushioned surface coefficients of restitution (foam, carpet, textile underlay). Referenced from general knowledge of this literature category; not fetched/confirmed this session.',
    verified: false,
  },
  textileFriction: {
    short: 'KES-F "MIU" steel-probe-on-fabric friction (~0.1-0.45)',
    full: 'KES-F (Kawabata Evaluation System for Fabrics) "MIU" parameter: a smooth-steel-probe-on-fabric friction coefficient, the direct analog to a rigid object sliding on our blanket surface (unlike fabric-on-fabric friction, see below). Multiple independent published measurements converge on cotton woven fabric MIU ~0.1-0.3, smooth fibers (Tencel/soy) ~0.2-0.3, coarser fiber (hemp) ~0.45. These figures come from search-result summaries of several papers (e.g. studies using the KES-FB4 AUTO tester); direct fetches of the source pages (MDPI, ResearchGate) returned HTTP 403 each time this session, so treat as corroborated-by-convergence rather than a single primary source read in full. Cross-checked against B.S. Gupta, "Friction in Textile Materials" (Woodhead Publishing), Ch.5, Table 5.3 (book p.207, directly read this session): measured fabric-ON-FABRIC kinetic friction of 5 woven fabrics (C6-C10) under a 25 gf sled load gave mu ~ 1.96-2.40 - much higher because soft-on-soft contact has far more real contact area than a rigid probe on fabric, confirming MIU-type values are the right regime for this surface.',
    verified: true,
  },
  engToolboxRestitution: {
    short: 'Engineering ToolBox — restitution coefficients (not verified this session)',
    full: 'Engineering ToolBox, "Coefficients of Restitution," engineeringtoolbox.com/restitution-coefficients-d_622.html. Direct fetch returned HTTP 403 this session, so figures are not directly confirmed.',
    verified: false,
  },
  engToolboxFriction: {
    short: 'Engineering ToolBox — friction coefficients (not verified this session)',
    full: 'Engineering ToolBox, "Friction and Friction Coefficients for Various Material Combinations," engineeringtoolbox.com/friction-coefficients-d_778.html. Direct fetch returned HTTP 403 this session, so figures are not directly confirmed.',
    verified: false,
  },
  glassFrictionProxy: {
    short: 'Physics Factbook glass friction (glaze proxy)',
    full: 'Physics Factbook (M. Caban, W. Daniel, A. Grisales, 2005), via hypertextbook.com/facts/2005/glass.shtml, directly fetched: static friction on glass — steel (key chain) 0.19, copper (penny) 0.15, paper (card) 0.22. Used as a proxy for glazed ceramic tile, since a glaze is essentially a fused glass surface. Not a direct tile measurement, but the same hard-smooth-surface regime.',
    verified: true,
  },
  iso10545TileRestitution: {
    short: 'ISO 10545-5 ceramic tile impact resilience (0.85-0.88)',
    full: 'ISO 10545-5 (impact resistance of ceramic tiles): a steel ball is dropped onto the tile under a fixed low impact energy (0.27 J) and the resilience/restitution coefficient is measured. A study reported via search-result summary (qualicer.org conference paper) found conventional and glass-ceramic glazes both measured 0.85-0.88, with little difference between glaze types. The primary PDF was fetched this session but returned unreadable encoded/scanned content, so this is confirmed via a secondary summary of the paper, not a direct read of the standard or the data table itself.',
    verified: true,
  },
  hypertextboxConcreteFriction: {
    short: 'Physics Factbook concrete friction (rubber-on-concrete only)',
    full: 'Physics Factbook, via hypertextbook.com/facts/2006/MatthewMichaels.shtml, directly fetched: the only concrete pairing with data is rubber-on-concrete, kinetic mu 0.6-0.85 dry (Engineering ToolBox and School for Champions compiled figures cited on that page) down to 0.25-0.3 wet (Simon Fraser University 2001). No hard-object (metal/wood/glass) on-concrete friction figure was found this session. Rubber runs substantially higher friction than hard objects on the same surface (the same gap seen between rubber-tile ~0.6-0.85 and glass-tile ~0.15-0.22), so this value is used here as an upper-bound estimate, likely an overestimate for the rigid objects this sim actually drops.',
    verified: true,
  },
  none: { short: 'user-defined', full: 'No literature reference — set directly by the user.', verified: false },
};

// Metal friction is dry/kinetic against steel (the common reference surface in the
// cited tables); restitution is a solid-ball drop-test value. Copper and steel
// numbers below are directly verified (see SOURCES); aluminum's friction is
// verified via a compiled table, but its restitution and all of tungsten's values
// are estimates — flagged as such in their SOURCES entries.
const MATERIALS = {
  copper: {
    label: 'Copper', density: 8960, restitution: 0.4, friction: 0.44, color: '#b5651d', metal: true,
    frictionRef: 'schoolForChampionsCopperSteel', restitutionRef: 'ductileMetalEstimate',
  },
  steel: {
    label: 'Steel', density: 7850, restitution: 0.6, friction: 0.57, color: '#c7c9cc', metal: true,
    frictionRef: 'crcSteelSteel', restitutionRef: 'physicsFactbookDropTest',
  },
  tungsten: {
    label: 'Tungsten', density: 19300, restitution: 0.55, friction: 0.45, color: '#4d4d4d', metal: true,
    frictionRef: 'wearHardMetalEstimate', restitutionRef: 'wearHardMetalEstimate',
  },
  aluminum: {
    label: 'Aluminum', density: 2700, restitution: 0.5, friction: 0.3, color: '#d6d6d6', metal: true,
    frictionRef: 'mechguruAlSteel', restitutionRef: 'ductileMetalEstimate',
  },
  balsa: { label: 'Balsa wood (Janka 90)', density: 160, janka: 90, color: '#f0dcb0' },
  pine: { label: 'Pine wood (Janka 420)', density: 450, janka: 420, color: '#d8b878' },
  oak: { label: 'Oak wood (Janka 1290)', density: 750, janka: 1290, color: '#a97845' },
  hickory: { label: 'Hickory wood (Janka 1820)', density: 830, janka: 1820, color: '#8a5a2e' },
  ipe: { label: 'Ipe wood (Janka 3510)', density: 1075, janka: 3510, color: '#5c3a21' },
  custom: {
    label: 'Custom (Hrifa material)', density: 2000, restitution: 0.4, friction: 0.4, color: '#5aa9e6', custom: true,
    frictionRef: 'none', restitutionRef: 'none',
  },
};

// Woods don't share a single hardness metric with metals, so we derive
// restitution/friction from Janka hardness (lbf) instead of hand-tuning each species.
// The friction endpoints (0.3-0.55) match the compiled wood-friction range in
// woodFrictionCompiled. The restitution endpoints are a modeled interpolation
// between a soft/porous low-bounce limit and the verified "wooden ball on concrete"
// drop-test value (0.603, physicsFactbookDropTest) as the dense-hardwood limit —
// there's no published restitution-vs-hardness curve for wood, so the curve shape
// itself is our own model, anchored at one verified endpoint.
function resolveMaterialPhysics(mat) {
  if (mat.janka !== undefined) {
    const t = Math.min(1, mat.janka / 3600);
    return { restitution: 0.15 + t * 0.4, friction: 0.55 - t * 0.25 };
  }
  return { restitution: mat.restitution, friction: mat.friction };
}

const PRIMITIVE_SHAPES = {
  sphere: { label: 'Sphere' },
  box: { label: 'Box' },
  cylinder: { label: 'Cylinder (coin/disc)' },
};

// friction/restitution are literature-informed midpoints (see SOURCES); roughness
// is purely a visual/physical bump-scale design parameter with no literature
// source — it drives the heightfield amplitude and canvas texture density, not a
// measured surface-finish quantity.
const SURFACE_PRESETS = {
  blanket: {
    label: 'Blanket', friction: 0.4, roughness: 0.5, restitution: 0.05, base: '#4d3a63', accent: '#6b4f8a',
    frictionRef: 'textileFriction', restitutionRef: 'softSurfaceBounce',
  },
  grass: {
    label: 'Grass', friction: 0.55, roughness: 0.75, restitution: 0.15, base: '#356134', accent: '#4c8c4a',
    frictionRef: 'turfFriction', restitutionRef: 'engToolboxRestitution',
  },
  tile: {
    label: 'Tile', friction: 0.2, roughness: 0.05, restitution: 0.85, base: '#bcbcb4', accent: '#d8d8d0',
    frictionRef: 'glassFrictionProxy', restitutionRef: 'iso10545TileRestitution',
  },
  paper: {
    label: 'Paper', friction: 0.35, roughness: 0.1, restitution: 0.2, base: '#e4ddc6', accent: '#f5f0e1',
    frictionRef: 'engToolboxFriction', restitutionRef: 'engToolboxRestitution',
  },
  wood: {
    label: 'Wood', friction: 0.45, roughness: 0.2, restitution: 0.55, base: '#8a5f37', accent: '#b5834f',
    frictionRef: 'woodFrictionCompiled', restitutionRef: 'physicsFactbookDropTest',
  },
  concrete: {
    label: 'Concrete', friction: 0.6, roughness: 0.6, restitution: 0.6, base: '#7d7d75', accent: '#9a9a92',
    frictionRef: 'hypertextboxConcreteFriction', restitutionRef: 'physicsFactbookDropTest',
  },
};

const TEXTURE_MULT = {
  smooth: { friction: 0.75, roughness: 0.4 },
  rough: { friction: 1.25, roughness: 1.6 },
};

let scene, camera, renderer, controls, sceneContainerEl;
let groundMesh, groundTexture, heatmapCanvas, heatCtx;
let world, groundBody;

let surfaceSelect, textureSelect, surfaceInfoEl, surfaceFrictionEl, surfaceRestitutionEl, angleSlider, angleValue, heightSlider, heightValue, speedSlider, speedValue, colsInput, rowsInput;
let fpsCounterEl;
let shapeSelect, sizeSlider, sizeValue, meshUpload, uploadStatusEl;
let materialSelect, materialInfoEl, materialDensityEl, materialRestitutionEl, materialFrictionEl, customPropsEl, densitySlider, densityValue, hardnessSlider, hardnessValue, frictionSlider, frictionValue;
let countInput, addItemBtn, batchListEl;
let dropBtn, resetBtn, copyBtn, exportBtn, statusEl, resultsSummaryEl, resultsGridEl;

const customShapes = {};
let batch = [];
let lastRoundConfig = null; // snapshot of surface/texture/tilt/height/batch at the moment a round was dropped
let activeObjects = []; // { body, group, instanceId, scale, settled, offSurface, stableFrames }
let previewObjects = []; // { itemDef, x, y, z } — the pre-drop "in hand" arrangement
let previewGroups = []; // InstancedMesh objects backing previewObjects
let currentSlopeAngle = 0;
let currentSubsteps = MIN_SUBSTEPS;
let roundMinRadius = 0.02; // smallest item's bounding radius for the active round
let running = false;
let roundSimSeconds = 0; // simulated (not wall-clock) time elapsed in the current round
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
  updateSurfaceInfo();
  updateMaterialInfo();
  updateAdvancedLabels();
  renderBatchList();
  dropBtn.disabled = true;
  requestAnimationFrame(animate);
}

function wireDom() {
  surfaceSelect = document.getElementById('surfaceSelect');
  textureSelect = document.getElementById('textureSelect');
  surfaceInfoEl = document.getElementById('surfaceInfo');
  surfaceFrictionEl = document.getElementById('surfaceFriction');
  surfaceRestitutionEl = document.getElementById('surfaceRestitution');
  angleSlider = document.getElementById('angleSlider');
  angleValue = document.getElementById('angleValue');
  heightSlider = document.getElementById('heightSlider');
  heightValue = document.getElementById('heightValue');
  speedSlider = document.getElementById('speedSlider');
  speedValue = document.getElementById('speedValue');
  colsInput = document.getElementById('colsInput');
  rowsInput = document.getElementById('rowsInput');
  fpsCounterEl = document.getElementById('fpsCounter');

  shapeSelect = document.getElementById('shapeSelect');
  sizeSlider = document.getElementById('sizeSlider');
  sizeValue = document.getElementById('sizeValue');
  meshUpload = document.getElementById('meshUpload');
  uploadStatusEl = document.getElementById('uploadStatus');

  materialSelect = document.getElementById('materialSelect');
  materialInfoEl = document.getElementById('materialInfo');
  materialDensityEl = document.getElementById('materialDensity');
  materialRestitutionEl = document.getElementById('materialRestitution');
  materialFrictionEl = document.getElementById('materialFriction');
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
  exportBtn = document.getElementById('exportBtn');
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
  speedSlider.addEventListener('input', () => {
    speedValue.textContent = `${parseFloat(speedSlider.value).toFixed(1)}×`;
  });
  sizeSlider.addEventListener('input', () => {
    sizeValue.textContent = `${parseFloat(sizeSlider.value).toFixed(2)} m`;
  });
  surfaceSelect.addEventListener('change', drawGroundTexture);
  textureSelect.addEventListener('change', drawGroundTexture);
  surfaceSelect.addEventListener('change', updateSurfaceInfo);
  textureSelect.addEventListener('change', updateSurfaceInfo);
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
  exportBtn.addEventListener('click', exportResultsJson);

  window.addEventListener('keydown', handleHotkey);
}

// D drops, R resets — ignored while typing in a field, and no modifiers so
// browser/OS shortcuts (Ctrl+R, Cmd+D, ...) still work as expected.
function handleHotkey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const key = e.key.toLowerCase();
  if (key === 'd' && !dropBtn.disabled) {
    e.preventDefault();
    dropAll();
  } else if (key === 'r') {
    e.preventDefault();
    resetAll();
  }
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
  sceneContainerEl = document.getElementById('sceneContainer');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0d10);

  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.set(0, 1.8, 1.9);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  sceneContainerEl.appendChild(renderer.domElement);

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

  resizeStage();
  window.addEventListener('resize', resizeStage);
}

// Keeps the canvas a perfect square sized to fill the stage panel's available
// height (the binding constraint once the side panels claim their width),
// rather than a fixed box with leftover padding around it.
function resizeStage() {
  const stageEl = sceneContainerEl.parentElement;
  const size = Math.max(280, Math.floor(stageEl.clientHeight || window.innerHeight * 0.7));
  sceneContainerEl.style.width = `${size}px`;
  sceneContainerEl.style.height = `${size}px`;
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  renderer.setSize(size, size);
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

let fpsFrameCount = 0;
let fpsLastSampleTime = 0;

function updateFpsCounter(now) {
  fpsFrameCount++;
  if (now - fpsLastSampleTime >= 250) {
    const fps = (fpsFrameCount * 1000) / (now - fpsLastSampleTime);
    fpsCounterEl.textContent = `${fps.toFixed(0)} FPS`;
    fpsFrameCount = 0;
    fpsLastSampleTime = now;
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  updateFpsCounter(now);

  if (world) {
    // Rapier's CCD sweep doesn't reliably catch small fast shapes against a
    // heightfield collider, so a sphere falling from any real height can skip
    // past the surface within a single simulated step. Substepping keeps each
    // step's travel distance well under the smallest object's size instead.
    // Recomputed every frame from the current fastest active object (not a
    // fixed worst-case guess for the whole round), so a large batch runs at
    // MIN_SUBSTEPS once everything has settled instead of paying the falling
    // -phase cost for the entire round.
    const simSpeed = parseFloat(speedSlider.value) || 1;
    const frameDt = (1 / 60) * simSpeed;
    let maxSpeed = 0;
    activeObjects.forEach((obj) => {
      if (obj.settled || obj.offSurface) return;
      const v = obj.body.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > maxSpeed) maxSpeed = speed;
    });
    currentSubsteps = substepsForVelocity(maxSpeed, roundMinRadius, frameDt);
    world.timestep = frameDt / currentSubsteps;
    const subDt = world.timestep;
    for (let i = 0; i < currentSubsteps; i++) {
      applyRollingResistance(subDt);
      world.step();
    }
    if (running) roundSimSeconds += frameDt;
  }
  checkRoundProgress();
  // Settled bodies are fixed and no longer move, so their last-written matrix
  // is still correct — skip re-writing it every frame once a batch has landed.
  const touchedGroups = new Set();
  activeObjects.forEach((obj) => {
    if (obj.offSurface || obj.settled) return;
    const t = obj.body.translation();
    const r = obj.body.rotation();
    setInstanceTransform(obj.group, obj.instanceId, t.x, t.y, t.z, r.x, r.y, r.z, r.w, obj.scale);
    touchedGroups.add(obj.group);
  });
  touchedGroups.forEach((g) => { g.instanceMatrix.needsUpdate = true; });
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

// Short "(source)" suffix for a friction/restitution pair. Woods cite the compiled
// wood-friction sources for the friction range but note the restitution curve is
// our own model (see resolveMaterialPhysics), since no per-species restitution
// data exists.
function citeMaterial(preset) {
  if (preset.custom) return SOURCES.none.short;
  if (preset.janka !== undefined) return `friction: ${SOURCES.woodFrictionCompiled.short}; restitution: modeled from Janka hardness, not directly measured`;
  return `friction: ${SOURCES[preset.frictionRef].short}; restitution: ${SOURCES[preset.restitutionRef].short}`;
}

function updateMaterialInfo() {
  const preset = MATERIALS[materialSelect.value];
  customPropsEl.style.display = preset.custom ? 'block' : 'none';
  let density, restitution, friction, jankaNote = '';
  if (preset.custom) {
    density = parseFloat(densitySlider.value);
    restitution = parseFloat(hardnessSlider.value);
    friction = parseFloat(frictionSlider.value);
  } else {
    const phys = resolveMaterialPhysics(preset);
    density = preset.density;
    restitution = phys.restitution;
    friction = phys.friction;
    if (preset.janka !== undefined) jankaNote = ` (Janka ${preset.janka})`;
  }
  materialDensityEl.textContent = `${density} kg/m³`;
  materialRestitutionEl.textContent = restitution.toFixed(2);
  materialFrictionEl.textContent = `${friction.toFixed(2)}${jankaNote}`;
  materialInfoEl.textContent = citeMaterial(preset);
}

function updateSurfaceInfo() {
  const surface = getSurface();
  const preset = SURFACE_PRESETS[surfaceSelect.value];
  surfaceFrictionEl.textContent = surface.friction.toFixed(2);
  surfaceRestitutionEl.textContent = surface.restitution.toFixed(2);
  surfaceInfoEl.textContent = `friction: ${SOURCES[preset.frictionRef].short}; restitution: ${SOURCES[preset.restitutionRef].short}`;
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
    shapeLabel,
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
  if (batch.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'No items yet';
    batchListEl.appendChild(empty);
  }
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

// Creates the Rapier body+collider only — rendering is handled separately via
// a shared InstancedMesh per batch entry (see createInstancedGroup), since a
// large batch as one Mesh per object means one draw call per object.
function createPhysicsBody(itemDef, x, y, z, roughness) {
  let colliderDesc;
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
  } else {
    colliderDesc = buildPrimitiveGeometryAndShape(itemDef.shapeKind, itemDef.sizeMeters).colliderDesc;
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

  return body;
}

// One InstancedMesh per batch entry (all its instances share shape/material),
// used for both the pre-drop preview and the live drop. Custom-mesh geometry
// is shared with customShapes and must not be disposed; primitive geometry is
// built fresh per group and is safe to dispose with it.
function createInstancedGroup(itemDef, count) {
  const threeGeom = itemDef.shapeKind === 'mesh'
    ? customShapes[itemDef.meshId].geometry
    : buildPrimitiveGeometryAndShape(itemDef.shapeKind, itemDef.sizeMeters).three;
  const material = new THREE.MeshStandardMaterial({
    color: itemDef.material.color,
    metalness: itemDef.material.metal ? 0.8 : 0.05,
    roughness: itemDef.material.metal ? 0.35 : 0.75,
  });
  const instancedMesh = new THREE.InstancedMesh(threeGeom, material, count);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instancedMesh.userData.disposeGeometry = itemDef.shapeKind !== 'mesh';
  scene.add(instancedMesh);
  return instancedMesh;
}

function disposeGroup(instancedMesh) {
  instancedMesh.material.dispose();
  if (instancedMesh.userData.disposeGeometry) instancedMesh.geometry.dispose();
}

const _instMatrix = new THREE.Matrix4();
const _instPos = new THREE.Vector3();
const _instQuat = new THREE.Quaternion();
const _instScale = new THREE.Vector3();

function setInstanceTransform(instancedMesh, instanceId, x, y, z, qx, qy, qz, qw, scale) {
  _instPos.set(x, y, z);
  _instQuat.set(qx, qy, qz, qw);
  _instScale.set(scale, scale, scale);
  _instMatrix.compose(_instPos, _instQuat, _instScale);
  instancedMesh.setMatrixAt(instanceId, _instMatrix);
}

function hideInstance(obj) {
  _instMatrix.makeScale(0, 0, 0);
  obj.group.setMatrixAt(obj.instanceId, _instMatrix);
  obj.group.instanceMatrix.needsUpdate = true;
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
  previewGroups.forEach((g) => { scene.remove(g); disposeGroup(g); });
  previewGroups = [];
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

  let idx = 0;
  batch.forEach((entry) => {
    const instancedMesh = createInstancedGroup(entry.itemDef, entry.count);
    const scale = entry.itemDef.shapeKind === 'mesh' ? entry.itemDef.sizeMeters : 1;
    for (let i = 0; i < entry.count; i++) {
      const { x, y, z } = positions[idx];
      setInstanceTransform(instancedMesh, i, x, y, z, 0, 0, 0, 1, scale);
      previewObjects.push({ itemDef: entry.itemDef, x, y, z });
      idx++;
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    previewGroups.push(instancedMesh);
  });
}

// Fast falling objects can skip clean through the heightfield within a single
// physics step if the step's travel distance approaches the object's own size
// (see the substepping note in animate()). Sizing substeps to the current
// fastest object and the batch's smallest item means slow/settled rounds run
// cheap while fast falls still get fine enough steps to not tunnel. Using the
// *previous* frame's velocity to size *this* frame's steps is safe here:
// gravity only changes speed by ~0.16 m/s per frame, and collisions can't
// increase speed (restitution <= 1), so velocity never jumps enough between
// frames for last frame's estimate to undersize the step that matters.
function substepsForVelocity(maxSpeed, minRadius, frameDt) {
  if (maxSpeed < 1e-4 || !minRadius) return MIN_SUBSTEPS;
  const safetyFactor = 0.4;
  const subDtNeeded = (safetyFactor * minRadius) / maxSpeed;
  const steps = Math.ceil(frameDt / subDtNeeded);
  return Math.min(MAX_SUBSTEPS, Math.max(MIN_SUBSTEPS, steps));
}

function dropAll() {
  if (batch.length === 0) return;
  teardownRound();
  if (previewObjects.length === 0) updatePreview();

  roundMinRadius = Math.min(...batch.map((e) => estimateBoundingRadius(e.itemDef)));

  const surface = getSurface();
  const angleRad = currentAngleRad();
  currentSlopeAngle = angleRad;
  setupPhysicsWorld(surface, angleRad);
  updateGroundVisualTilt(angleRad);

  lastRoundConfig = {
    surfaceLabel: SURFACE_PRESETS[surfaceSelect.value].label,
    texture: textureSelect.value,
    tiltDeg: parseFloat(angleSlider.value),
    dropHeightM: parseFloat(heightSlider.value),
    batch: batch.map((entry) => ({
      material: entry.itemDef.material.label,
      shape: entry.itemDef.shapeLabel,
      count: entry.count,
    })),
  };

  // Release the exact arrangement already shown in the preview, so what the
  // user saw before hitting Drop is exactly what falls. previewObjects is laid
  // out in contiguous per-entry blocks (built by the same batch.forEach order
  // in updatePreview), so it can be sliced back into one InstancedMesh group
  // per entry rather than one Mesh per object.
  const spawnPositions = previewObjects.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  clearPreview();

  let idx = 0;
  batch.forEach((entry) => {
    const instancedMesh = createInstancedGroup(entry.itemDef, entry.count);
    const scale = entry.itemDef.shapeKind === 'mesh' ? entry.itemDef.sizeMeters : 1;
    for (let i = 0; i < entry.count; i++) {
      const { x, y, z } = spawnPositions[idx];
      idx++;
      const body = createPhysicsBody(entry.itemDef, x, y, z, surface.roughness);
      activeObjects.push({ body, group: instancedMesh, instanceId: i, scale, settled: false, offSurface: false, stableFrames: 0 });
    }
  });

  running = true;
  roundSimSeconds = 0;
  lastResult = null;
  dropBtn.disabled = true;
  statusEl.textContent = `Dropping ${activeObjects.length} item(s)…`;
  resultsSummaryEl.textContent = 'Simulating…';
  resultsGridEl.innerHTML = '';
  drawGroundTexture();
}

function freezeBody(obj) {
  obj.settled = true;
  obj.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  obj.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  obj.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
}

function checkRoundProgress() {
  if (!running) return;
  if (roundSimSeconds > MAX_ROUND_MS / 1000) {
    finishRound(true);
    return;
  }
  let stillActive = false;
  activeObjects.forEach((obj) => {
    if (obj.settled || obj.offSurface) return;
    const t = obj.body.translation();
    if (t.y < OFF_SURFACE_Y) {
      obj.offSurface = true;
      world.removeRigidBody(obj.body);
      hideInstance(obj);
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
  dropBtn.disabled = false;

  activeObjects.forEach((obj) => {
    if (!obj.settled && !obj.offSurface) freezeBody(obj);
  });

  const { counts, rows, cols } = computeGridCounts();
  const offSurface = activeObjects.filter((o) => o.offSurface).length;
  const onSurface = activeObjects.length - offSurface;
  const busiestCell = computeBusiestCell(counts);

  lastResult = { counts, rows, cols, onSurface, offSurface, busiestCell, timedOut, config: lastRoundConfig };
  renderResultsPanel(lastResult);
  drawGroundTexture();

  statusEl.textContent = `${timedOut ? 'Settled (timeout). ' : 'Settled. '}${onSurface} on surface, ${offSurface} off surface.`;
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

// 1-indexed row/col, matching the labeling already shown in the results panel.
function computeBusiestCell(counts) {
  let max = 0;
  let cell = null;
  counts.forEach((rowArr, r) => rowArr.forEach((c, colIdx) => {
    if (c > max) { max = c; cell = { row: r + 1, col: colIdx + 1, count: c }; }
  }));
  return cell;
}

function renderResultsPanel(result) {
  const { counts, rows, cols, onSurface, offSurface, busiestCell } = result;
  resultsSummaryEl.textContent =
    `On surface: ${onSurface}\nOff surface: ${offSurface}\n` +
    (busiestCell ? `Busiest cell: row ${busiestCell.row}, col ${busiestCell.col} (${busiestCell.count})` : '');

  resultsGridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  resultsGridEl.innerHTML = '';
  counts.forEach((rowArr) => rowArr.forEach((c) => {
    const cell = document.createElement('div');
    cell.className = 'cell' + (c > 0 ? ' has-count' : '');
    cell.textContent = c > 0 ? c : '-';
    resultsGridEl.appendChild(cell);
  }));
}

function teardownRound() {
  const groups = new Set();
  activeObjects.forEach((obj) => {
    if (!obj.offSurface && world) world.removeRigidBody(obj.body);
    groups.add(obj.group);
  });
  groups.forEach((g) => { scene.remove(g); disposeGroup(g); });
  activeObjects = [];
  running = false;
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
  const { counts, rows, cols, offSurface, config } = lastResult;
  const lines = [`Surface: ${config.surfaceLabel} (${config.texture}), tilt ${config.tiltDeg}°, drop height ${config.dropHeightM.toFixed(1)} m`];
  lines.push(`Grid: ${cols} cols × ${rows} rows`);
  counts.forEach((rowArr, r) => lines.push(`row ${r + 1}: ${rowArr.join(' ')}`));
  lines.push(`Off surface: ${offSurface}`);
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const original = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = original; }, 1200);
  });
}

// n (as a number) for occupied cells, "-" for empty ones — a quick-scan text
// readout of the grid that doesn't require parsing the numeric array.
function buildAsciiGrid(counts) {
  return counts.map((rowArr) => rowArr.map((c) => (c > 0 ? String(c) : '-')).join(' '));
}

function exportResultsJson() {
  if (!lastResult) return;
  const { counts, rows, cols, onSurface, offSurface, busiestCell, config } = lastResult;
  const payload = {
    surface: {
      type: config.surfaceLabel,
      texture: config.texture,
      tiltDeg: config.tiltDeg,
      dropHeightM: config.dropHeightM,
    },
    batch: config.batch,
    grid: { rows, cols },
    onSurface,
    offSurface,
    busiestCell,
    asciiGrid: buildAsciiGrid(counts),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stone-throw-results-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  const original = exportBtn.textContent;
  exportBtn.textContent = 'Exported!';
  setTimeout(() => { exportBtn.textContent = original; }, 1200);
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
