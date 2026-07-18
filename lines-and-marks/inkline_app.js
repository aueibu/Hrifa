import alea from "https://cdn.jsdelivr.net/npm/alea@1.0.1/+esm";
import { createNoise2D } from "https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/+esm";
import { generateHatchSegments, makeHatchRegion } from "./hatch_regions.js";

const paperCanvas = document.getElementById("paperCanvas");
const inkCanvas = document.getElementById("inkCanvas");
const previewCanvas = document.getElementById("previewCanvas");
const paperCtx = paperCanvas.getContext("2d", { alpha: false });
const inkCtx = inkCanvas.getContext("2d");
const previewCtx = previewCanvas.getContext("2d");
const statusText = document.getElementById("statusText");
const debugReadout = document.getElementById("debugReadout");
const presetNameInput = document.getElementById("presetName");
const presetSelect = document.getElementById("presetSelect");
let renderCtx = inkCtx;

const controls = {
  width: document.getElementById("width"),
  pressure: document.getElementById("pressure"),
  pressureVarianceRate: document.getElementById("pressureVarianceRate"),
  pressureVarianceIntensity: document.getElementById("pressureVarianceIntensity"),
  widthVarianceRate: document.getElementById("widthVarianceRate"),
  widthVarianceIntensity: document.getElementById("widthVarianceIntensity"),
  dryness: document.getElementById("dryness"),
  bristles: document.getElementById("bristles"),
  jitter: document.getElementById("jitter"),
  drift: document.getElementById("drift"),
  smoothing: document.getElementById("smoothing"),
  rendererMode: document.getElementById("rendererMode"),
  regionLineCount: document.getElementById("regionLineCount"),
  regionLineMode: document.getElementById("regionLineMode"),
  regionBrushWidth: document.getElementById("regionBrushWidth"),
  regionAngle: document.getElementById("regionAngle"),
  regionShape: document.getElementById("regionShape"),
  density: document.getElementById("density"),
  wetness: document.getElementById("wetness"),
  pooling: document.getElementById("pooling"),
  poolWidth: document.getElementById("poolWidth"),
  poolSpread: document.getElementById("poolSpread"),
  straightPooling: document.getElementById("straightPooling"),
  curveThreshold: document.getElementById("curveThreshold"),
  curveWidth: document.getElementById("curveWidth"),
  curveSpread: document.getElementById("curveSpread"),
  flow: document.getElementById("flow"),
  granulation: document.getElementById("granulation"),
  texture: document.getElementById("texture"),
  relief: document.getElementById("relief"),
  toothScale: document.getElementById("toothScale"),
  fiberStrength: document.getElementById("fiberStrength"),
  absorbency: document.getElementById("absorbency"),
  seed: document.getElementById("seed")
};

const labels = {
  width: document.getElementById("widthValue"),
  pressure: document.getElementById("pressureValue"),
  dryness: document.getElementById("drynessValue"),
  bristles: document.getElementById("bristlesValue"),
  jitter: document.getElementById("jitterValue"),
  drift: document.getElementById("driftValue"),
  smoothing: document.getElementById("smoothingValue"),
  regionLineCount: document.getElementById("regionLineCountValue"),
  regionBrushWidth: document.getElementById("regionBrushWidthValue"),
  regionAngle: document.getElementById("regionAngleValue"),
  density: document.getElementById("densityValue"),
  wetness: document.getElementById("wetnessValue"),
  pooling: document.getElementById("poolingValue"),
  poolWidth: document.getElementById("poolWidthValue"),
  poolSpread: document.getElementById("poolSpreadValue"),
  straightPooling: document.getElementById("straightPoolingValue"),
  curveThreshold: document.getElementById("curveThresholdValue"),
  curveWidth: document.getElementById("curveWidthValue"),
  curveSpread: document.getElementById("curveSpreadValue"),
  flow: document.getElementById("flowValue"),
  granulation: document.getElementById("granulationValue"),
  texture: document.getElementById("textureValue"),
  relief: document.getElementById("reliefValue"),
  toothScale: document.getElementById("toothScaleValue"),
  fiberStrength: document.getElementById("fiberStrengthValue"),
  absorbency: document.getElementById("absorbencyValue")
};

const xyOutputs = {
  pressureVariance: document.getElementById("pressureVarianceValue"),
  widthVariance: document.getElementById("widthVarianceValue")
};

const paperControlIds = new Set(["texture", "relief", "toothScale", "fiberStrength", "absorbency"]);

const state = {
  tool: "freehand",
  marks: [],
  regions: [],
  undoStack: [],
  redoStack: [],
  currentMark: null,
  polygonDraft: null,
  regionDraft: null,
  pointer: null,
  markCounter: 0,
  viewWidth: 1400,
  viewHeight: 900,
  redrawQueued: false,
  inkDirty: true,
  debugMode: "none",
  pixelRatio: 1
};

const PAPER_SEED = 18341;
let INK = { r: 24, g: 21, b: 17 };
let PAPER = { r: 246, g: 239, b: 225 };
const HEIGHT_CONTRAST = 1.85;
const HEIGHT_SPLOTCH_SCALE = 1;
const TOOTH_CONTACT_THRESHOLD = 0.5;
const TOOTH_CONTACT_SOFTNESS = 0.14;
const PAPER_FIELD_STEP = 1;
const PATH_SAMPLE_GAP = 2;
const STORAGE_KEY = "linesAndMarksSettings.v1";
const PRESETS_KEY = "linesAndMarksPresets.v1";
const noiseCache = new Map();
const perlinCache = new Map();
const paperFieldCache = new Map();
const debugOverlayCache = {
  key: "",
  canvas: null
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function noiseFor(seed) {
  const key = String(Math.floor(seed));
  if (!noiseCache.has(key)) {
    noiseCache.set(key, createNoise2D(alea(key)));
  }
  return noiseCache.get(key);
}

function fbm(x, y, seed, octaves = 4) {
  const noise = noiseFor(seed);
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function perlinFor(seed) {
  const key = String(Math.floor(seed));
  if (perlinCache.has(key)) return perlinCache.get(key);

  const rng = alea(key);
  const p = Array.from({ length: 256 }, (_, index) => index);
  for (let i = p.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = Array.from({ length: 512 }, (_, index) => p[index & 255]);
  perlinCache.set(key, perm);
  return perm;
}

function perlinGrad(hashValue, x, y) {
  switch (hashValue & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

function perlin2(x, y, seed) {
  const perm = perlinFor(seed);
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);

  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];

  const x1 = lerp(perlinGrad(aa, xf, yf), perlinGrad(ba, xf - 1, yf), u);
  const x2 = lerp(perlinGrad(ab, xf, yf - 1), perlinGrad(bb, xf - 1, yf - 1), u);
  return clamp(lerp(x1, x2, v), -1, 1);
}

function perlinFbm(x, y, seed, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    total += perlin2(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / norm;
}

function getStyle() {
  const brush = {
    width: Number(controls.width.value),
    pressure: Number(controls.pressure.value),
    pressureVariance: {
      rate: Number(controls.pressureVarianceRate.value),
      intensity: Number(controls.pressureVarianceIntensity.value)
    },
    widthVariance: {
      rate: Number(controls.widthVarianceRate.value),
      intensity: Number(controls.widthVarianceIntensity.value)
    },
    dryness: Number(controls.dryness.value),
    bristles: Number(controls.bristles.value),
    jitter: Number(controls.jitter.value),
    drift: Number(controls.drift.value),
    smoothing: Number(controls.smoothing.value),
    rendererMode: controls.rendererMode.value
  };
  const pigment = {
    density: Number(controls.density.value),
    wetness: Number(controls.wetness.value),
    pooling: Number(controls.pooling.value),
    poolWidth: Number(controls.poolWidth.value),
    poolSpread: Number(controls.poolSpread.value),
    straightPooling: Number(controls.straightPooling.value),
    curveThreshold: Number(controls.curveThreshold.value),
    curveWidth: Number(controls.curveWidth.value),
    curveSpread: Number(controls.curveSpread.value),
    flow: Number(controls.flow.value),
    granulation: Number(controls.granulation.value)
  };
  const paper = {
    influence: Number(controls.texture.value),
    relief: Number(controls.relief.value),
    toothScale: Number(controls.toothScale.value),
    fiberStrength: Number(controls.fiberStrength.value),
    absorbency: Number(controls.absorbency.value)
  };

  return {
    brush,
    pigment,
    paper,
    width: brush.width,
    pressure: brush.pressure,
    pressureVarianceRate: brush.pressureVariance.rate,
    pressureVarianceIntensity: brush.pressureVariance.intensity,
    widthVarianceRate: brush.widthVariance.rate,
    widthVarianceIntensity: brush.widthVariance.intensity,
    dryness: brush.dryness,
    bristles: brush.bristles,
    jitter: brush.jitter,
    drift: brush.drift,
    smoothing: brush.smoothing,
    rendererMode: brush.rendererMode,
    density: pigment.density,
    wetness: pigment.wetness,
    pooling: pigment.pooling,
    poolWidth: pigment.poolWidth,
    poolSpread: pigment.poolSpread,
    straightPooling: pigment.straightPooling,
    curveThreshold: pigment.curveThreshold,
    curveWidth: pigment.curveWidth,
    curveSpread: pigment.curveSpread,
    flow: pigment.flow,
    granulation: pigment.granulation,
    texture: paper.influence,
    relief: paper.relief,
    toothScale: paper.toothScale,
    fiberStrength: paper.fiberStrength,
    seed: Number(controls.seed.value)
  };
}

function updateLabels() {
  Object.entries(labels).forEach(([key, output]) => {
    const value = Number(controls[key].value);
    if (
      key === "width" ||
      key === "poolWidth" ||
      key === "poolSpread" ||
      key === "curveSpread" ||
      key === "regionLineCount" ||
      key === "regionBrushWidth" ||
      key === "regionAngle"
    ) {
      output.textContent = String(value);
    } else if (key === "curveThreshold") {
      output.textContent = value.toFixed(3);
    } else {
      output.textContent = value.toFixed(2);
    }
  });
  const regionLinesLabel = controls.regionLineCount?.closest(".slider-row")?.querySelector("span");
  if (regionLinesLabel) {
    regionLinesLabel.textContent = controls.regionLineMode.value === "per100" ? "Lines/100" : "Reg lines";
  }
  updateXyLabels();
}

function updateXyLabels() {
  Object.entries(xyOutputs).forEach(([prefix, output]) => {
    if (!output) return;
    const rate = Number(controls[`${prefix}Rate`].value);
    const intensity = Number(controls[`${prefix}Intensity`].value);
    output.textContent = `r ${rate.toFixed(2)} / i ${intensity.toFixed(2)}`;
  });
}

function syncXyPads() {
  document.querySelectorAll(".xy-pad").forEach((pad) => {
    const rate = clamp(Number(controls[pad.dataset.rate].value), 0, 1);
    const intensity = clamp(Number(controls[pad.dataset.intensity].value), 0, 1);
    const handle = pad.querySelector(".xy-handle");
    if (handle) {
      handle.style.left = `${rate * 100}%`;
      handle.style.top = `${(1 - intensity) * 100}%`;
    }
    pad.setAttribute("aria-valuetext", `rate ${rate.toFixed(2)}, intensity ${intensity.toFixed(2)}`);
  });
  updateXyLabels();
}

function setXyPadFromPointer(pad, event) {
  const rect = pad.getBoundingClientRect();
  const rate = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const intensity = clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1);
  controls[pad.dataset.rate].value = rate.toFixed(3);
  controls[pad.dataset.intensity].value = intensity.toFixed(3);
  syncXyPads();
  if (state.currentMark) state.currentMark.style = getStyle();
  if (state.polygonDraft) state.polygonDraft.style = getStyle();
  saveSettings();
  requestRedraw();
}

function collectSettings() {
  const values = {};
  Object.entries(controls).forEach(([key, input]) => {
    values[key] = input.value;
  });
  return {
    tool: state.tool,
    debugMode: state.debugMode,
    values
  };
}

function applySettings(settings) {
  if (!settings || !settings.values) return;
  Object.entries(settings.values).forEach(([key, value]) => {
    if (controls[key]) controls[key].value = value;
  });
  if (settings.tool) state.tool = settings.tool;
  if (settings.debugMode) state.debugMode = settings.debugMode;
  updateLabels();
  syncXyPads();
  syncActiveButtons();
  rebuildPaperTexture();
  state.inkDirty = true;
  requestRedraw();
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectSettings()));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    applySettings(saved);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function loadPresets() {
  try {
    const presets = JSON.parse(localStorage.getItem(PRESETS_KEY) || "{}");
    return presets && typeof presets === "object" ? presets : {};
  } catch (error) {
    localStorage.removeItem(PRESETS_KEY);
    return {};
  }
}

function savePresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function refreshPresetSelect(selectedName = "") {
  if (!presetSelect) return;
  const presets = loadPresets();
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  presetSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = names.length ? "Select preset" : "No presets";
  presetSelect.appendChild(placeholder);
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    presetSelect.appendChild(option);
  });
  presetSelect.value = selectedName && presets[selectedName] ? selectedName : "";
}

function savePreset() {
  const name = (presetNameInput?.value || "").trim();
  if (!name) return;
  const presets = loadPresets();
  presets[name] = {
    ...collectSettings(),
    savedAt: new Date().toISOString()
  };
  savePresets(presets);
  refreshPresetSelect(name);
}

function loadPreset() {
  const name = presetSelect?.value;
  if (!name) return;
  const presets = loadPresets();
  if (!presets[name]) return;
  applySettings(presets[name]);
  saveSettings();
}

function deletePreset() {
  const name = presetSelect?.value;
  if (!name) return;
  const presets = loadPresets();
  delete presets[name];
  savePresets(presets);
  refreshPresetSelect();
}

function syncActiveButtons() {
  document.querySelectorAll(".tool-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.tool);
  });
  document.querySelectorAll(".debug-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.debug === state.debugMode);
  });
}

function snapshot() {
  state.undoStack.push(JSON.stringify({
    marks: state.marks,
    regions: state.regions,
    markCounter: state.markCounter
  }));
  if (state.undoStack.length > 80) state.undoStack.shift();
  state.redoStack.length = 0;
}

function restore(serialized) {
  const data = JSON.parse(serialized);
  state.marks = data.marks || [];
  state.regions = data.regions || [];
  state.markCounter = data.markCounter || state.marks.length;
  state.currentMark = null;
  state.polygonDraft = null;
  state.regionDraft = null;
  state.inkDirty = true;
  requestRedraw();
}

function commitMark(mark) {
  if (!mark) return;
  const enoughPoints = mark.type !== "freehand" || mark.points.length > 1;
  let enoughSize = true;
  if (mark.type === "polygon") {
    enoughSize = mark.points.length >= 2 && distance(mark.points[0], mark.points[mark.points.length - 1]) > 2;
  } else if (mark.type !== "freehand") {
    enoughSize = distance(mark.start, mark.end) > 2;
  }
  if (!enoughPoints || !enoughSize) {
    state.currentMark = null;
    requestRedraw();
    return;
  }
  snapshot();
  state.marks.push(mark);
  state.markCounter += 1;
  state.currentMark = null;
  renderCommittedMark(mark);
  clearLayer(previewCtx);
  requestRedraw();
}

function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(JSON.stringify({
    marks: state.marks,
    regions: state.regions,
    markCounter: state.markCounter
  }));
  restore(state.undoStack.pop());
}

function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(JSON.stringify({
    marks: state.marks,
    regions: state.regions,
    markCounter: state.markCounter
  }));
  restore(state.redoStack.pop());
}

function clearAll() {
  if (!state.marks.length && !state.currentMark && !state.polygonDraft) return;
  snapshot();
  state.marks = [];
  state.regions = [];
  state.currentMark = null;
  state.polygonDraft = null;
  state.regionDraft = null;
  state.inkDirty = true;
  requestRedraw();
}

function canvasPoint(event) {
  const rect = previewCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * state.viewWidth,
    y: ((event.clientY - rect.top) / rect.height) * state.viewHeight
  };
}

function simplifyPoints(points, minGap) {
  if (points.length < 3) return points.slice();
  const simplified = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (distance(points[i], simplified[simplified.length - 1]) >= minGap) {
      simplified.push(points[i]);
    }
  }
  simplified.push(points[points.length - 1]);
  return simplified;
}

function smoothPath(points, amount) {
  if (points.length < 3 || amount <= 0.01) return points.slice();
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    const next = points[i + 1];
    result.push({
      x: lerp(point.x, (prev.x + point.x + next.x) / 3, amount),
      y: lerp(point.y, (prev.y + point.y + next.y) / 3, amount)
    });
  }
  result.push(points[points.length - 1]);
  return result;
}

function samplePolyline(points, gap = 4) {
  if (points.length < 2) return points.slice();
  const sampled = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const len = distance(a, b);
    const steps = Math.max(1, Math.ceil(len / gap));
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      sampled.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
    }
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

function sampleLine(start, end) {
  return samplePolyline([start, end], PATH_SAMPLE_GAP);
}

function sampleRect(start, end) {
  const points = [
    { x: start.x, y: start.y },
    { x: end.x, y: start.y },
    { x: end.x, y: end.y },
    { x: start.x, y: end.y },
    { x: start.x, y: start.y },
    { x: lerp(start.x, end.x, 0.1), y: start.y }
  ];
  return samplePolyline(points, PATH_SAMPLE_GAP);
}

function sampleEllipse(start, end, seed) {
  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  const rx = Math.max(1, Math.abs(end.x - start.x) / 2);
  const ry = Math.max(1, Math.abs(end.y - start.y) / 2);
  const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = clamp(Math.ceil(circumference / PATH_SAMPLE_GAP), 64, 620);
  const startAngle = hash(seed + 18.2) * Math.PI * 2;
  const overlap = 0.08 + hash(seed + 99.4) * 0.08;
  const points = [];

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = startAngle + t * (Math.PI * 2 + overlap);
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return points;
}

function sampleArc(start, end, seed) {
  const chord = distance(start, end);
  const bend = chord * (0.22 + hash(seed + 7) * 0.24);
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - bend };
  const steps = clamp(Math.ceil(chord / PATH_SAMPLE_GAP), 28, 320);
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = { x: lerp(start.x, mid.x, t), y: lerp(start.y, mid.y, t) };
    const b = { x: lerp(mid.x, end.x, t), y: lerp(mid.y, end.y, t) };
    points.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  }
  return points;
}

function withPathDistance(points) {
  if (!points.length) return points;
  let length = 0;
  const measured = points.map((point, index) => {
    if (index > 0) length += distance(points[index - 1], point);
    return { ...point, s: length };
  });
  const total = length || 1;
  return measured.map((point, index) => ({
    ...point,
    t: points.length <= 1 ? 0 : index / (points.length - 1),
    pathLength: total
  }));
}

function sampleMark(mark) {
  let sampled = [];
  if (mark.type === "freehand") {
    const minGap = Math.max(1.8, mark.style.width * 0.18);
    const points = simplifyPoints(mark.points, minGap);
    sampled = smoothPath(samplePolyline(points, PATH_SAMPLE_GAP), mark.style.smoothing * 0.75);
  } else if (mark.type === "line") {
    sampled = sampleLine(mark.start, mark.end);
  } else if (mark.type === "arc") {
    sampled = sampleArc(mark.start, mark.end, mark.seed);
  } else if (mark.type === "ellipse") {
    sampled = sampleEllipse(mark.start, mark.end, mark.seed);
  } else if (mark.type === "rect") {
    sampled = sampleRect(mark.start, mark.end);
  } else if (mark.type === "polygon") {
    const closed = mark.closed ? mark.points.concat([mark.points[0], mark.points[1] || mark.points[0]]) : mark.points;
    sampled = samplePolyline(closed, PATH_SAMPLE_GAP);
  }
  return withPathDistance(sampled);
}

function perturbPoints(points, mark) {
  const style = mark.style;
  const driftPhase = hash(mark.seed + 42) * 100;
  return points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const wobble = fbm(point.x * 0.028, point.y * 0.028, mark.seed, 3) * style.jitter * style.width * 0.62;
    const drift = fbm(index * 0.035 + driftPhase, mark.seed * 0.013, mark.seed + 81, 4) * style.drift * style.width * 0.9;
    return {
      x: point.x + nx * wobble + dx / len * drift,
      y: point.y + ny * wobble + dy / len * drift,
      t: point.t ?? (points.length <= 1 ? 0 : index / (points.length - 1)),
      s: point.s ?? 0,
      pathLength: point.pathLength ?? 1
    };
  });
}

function paperSettings(style) {
  return style && style.paper ? style.paper : getStyle().paper;
}

function paperFieldKey(style) {
  const paper = paperSettings(style);
  return [
    state.viewWidth,
    state.viewHeight,
    PAPER_FIELD_STEP,
    paper.relief,
    paper.toothScale,
    paper.fiberStrength,
    paper.absorbency,
    HEIGHT_CONTRAST,
    HEIGHT_SPLOTCH_SCALE
  ].map((value) => Number(value).toFixed(4)).join("|");
}

function paperHeightAt(x, y, style) {
  const paper = paperSettings(style);
  const broad = perlinFbm(x * 0.022 * HEIGHT_SPLOTCH_SCALE, y * 0.022 * HEIGHT_SPLOTCH_SCALE, PAPER_SEED, 4) * 0.5 + 0.5;
  const fiberRelief = perlinFbm(x * 0.05 * HEIGHT_SPLOTCH_SCALE, y * 0.012 * HEIGHT_SPLOTCH_SCALE, PAPER_SEED + 300, 3) * 0.5 + 0.5;
  const toothProfile = paper.toothScale;
  const reliefAmount = paper.relief * (0.08 + toothProfile * 1.35);
  const reliefMix = broad * (0.86 - toothProfile * 0.18) + fiberRelief * (0.14 + toothProfile * 0.18);
  return clamp(0.5 + (reliefMix - 0.5) * reliefAmount * HEIGHT_CONTRAST, 0, 1);
}

function rawSamplePaperField(x, y, style) {
  const paperStyle = paperSettings(style);
  const height = paperHeightAt(x, y, style);
  const left = paperHeightAt(x - 2, y, style);
  const right = paperHeightAt(x + 2, y, style);
  const up = paperHeightAt(x, y - 2, style);
  const down = paperHeightAt(x, y + 2, style);
  const dx = right - left;
  const dy = down - up;
  const toothProfile = paperStyle.toothScale;
  const slope = clamp(Math.hypot(dx, dy) * (2.2 + toothProfile * 7.8), 0, 1);
  const grainScale = 0.018 + toothProfile * 0.12;
  const fineGrain = perlinFbm(x * grainScale + 11, y * grainScale - 8, PAPER_SEED + 101, 3) * 0.5 + 0.5;
  const fiber = perlinFbm(x * 0.026, y * 0.007, PAPER_SEED + 300, 3) * 0.5 + 0.5;
  const tooth = clamp(0.03 + slope * (0.18 + toothProfile * 0.45) + fineGrain * toothProfile * 0.34 + fiber * paperStyle.fiberStrength * toothProfile * 0.18, 0, 1);
  const absorbency = clamp(0.08 + paperStyle.absorbency * (0.2 + tooth * 0.32 + (1 - height) * 0.24 + fiber * 0.24), 0, 1);
  const edge = clamp(slope * (0.3 + toothProfile * 1.05) + Math.abs(height - 0.5) * 0.16, 0, 1);
  const fiberAngle = perlinFbm(x * 0.009, y * 0.009, PAPER_SEED + 900, 2) * 0.55 * paperStyle.fiberStrength * toothProfile;
  return { height, tooth, absorbency, edge, fiber, fiberAngle };
}

function buildPaperField(style) {
  const step = PAPER_FIELD_STEP;
  const cols = Math.ceil(state.viewWidth / step) + 1;
  const rows = Math.ceil(state.viewHeight / step) + 1;
  const length = cols * rows;
  const field = {
    key: paperFieldKey(style),
    step,
    cols,
    rows,
    height: new Float32Array(length),
    tooth: new Float32Array(length),
    absorbency: new Float32Array(length),
    edge: new Float32Array(length),
    fiber: new Float32Array(length),
    fiberAngle: new Float32Array(length)
  };

  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(state.viewHeight, row * step);
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(state.viewWidth, col * step);
      const index = row * cols + col;
      const sample = rawSamplePaperField(x, y, style);
      field.height[index] = sample.height;
      field.tooth[index] = sample.tooth;
      field.absorbency[index] = sample.absorbency;
      field.edge[index] = sample.edge;
      field.fiber[index] = sample.fiber;
      field.fiberAngle[index] = sample.fiberAngle;
    }
  }

  return field;
}

function cachedPaperField(style) {
  const key = paperFieldKey(style);
  if (!paperFieldCache.has(key)) {
    paperFieldCache.set(key, buildPaperField(style));
    if (paperFieldCache.size > 12) {
      const oldestKey = paperFieldCache.keys().next().value;
      paperFieldCache.delete(oldestKey);
    }
  }
  return paperFieldCache.get(key);
}

function samplePaperField(x, y, style) {
  const field = cachedPaperField(style);
  const gx = clamp(x / field.step, 0, field.cols - 1);
  const gy = clamp(y / field.step, 0, field.rows - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(field.cols - 1, x0 + 1);
  const y1 = Math.min(field.rows - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const i00 = y0 * field.cols + x0;
  const i10 = y0 * field.cols + x1;
  const i01 = y1 * field.cols + x0;
  const i11 = y1 * field.cols + x1;

  return {
    height: lerp(lerp(field.height[i00], field.height[i10], tx), lerp(field.height[i01], field.height[i11], tx), ty),
    tooth: lerp(lerp(field.tooth[i00], field.tooth[i10], tx), lerp(field.tooth[i01], field.tooth[i11], tx), ty),
    absorbency: lerp(lerp(field.absorbency[i00], field.absorbency[i10], tx), lerp(field.absorbency[i01], field.absorbency[i11], tx), ty),
    edge: lerp(lerp(field.edge[i00], field.edge[i10], tx), lerp(field.edge[i01], field.edge[i11], tx), ty),
    fiber: lerp(lerp(field.fiber[i00], field.fiber[i10], tx), lerp(field.fiber[i01], field.fiber[i11], tx), ty),
    fiberAngle: lerp(lerp(field.fiberAngle[i00], field.fiberAngle[i10], tx), lerp(field.fiberAngle[i01], field.fiberAngle[i11], tx), ty)
  };
}

function sampleStrokeContact(x, y, style = getStyle()) {
  const paper = samplePaperField(x, y, style);
  const pressure = style.pressure;
  const contact = paper.tooth;
  const toothEffect = clamp(style.dryness * (1 - style.wetness) * style.texture, 0, 1);
  const softness = TOOTH_CONTACT_SOFTNESS * (0.45 + style.wetness * 0.55);
  const toothAcceptance = smoothstep(TOOTH_CONTACT_THRESHOLD - softness, TOOTH_CONTACT_THRESHOLD + softness, contact);
  const acceptance = lerp(1, toothAcceptance, toothEffect);
  return { paper, pressure, contact, acceptance };
}

function debugValueAt(x, y, mode, style = getStyle()) {
  const sample = sampleStrokeContact(x, y, style);
  if (mode === "height") return sample.paper.height;
  if (mode === "tooth") return sample.paper.tooth;
  if (mode === "absorbency") return sample.paper.absorbency;
  if (mode === "edge") return sample.paper.edge;
  if (mode === "fiber") return sample.paper.fiber;
  if (mode === "contact") return sample.acceptance;
  return 0;
}

function debugColor(value, mode) {
  const v = clamp(value, 0, 1);
  if (mode === "contact") {
    const r = Math.round(255 * (1 - v));
    const g = Math.round(225 * v);
    const b = Math.round(70 + 70 * v);
    return [r, g, b];
  }
  if (mode === "edge") {
    return [Math.round(40 + v * 215), Math.round(54 + v * 150), Math.round(75 + v * 80)];
  }
  if (mode === "fiber") {
    return [Math.round(70 + v * 120), Math.round(90 + v * 135), Math.round(105 + v * 115)];
  }
  const c = Math.round(v * 255);
  return [c, c, c];
}

function debugOverlayKey(mode, style) {
  return [
    mode,
    paperFieldKey(style),
    style.dryness.toFixed(4),
    style.wetness.toFixed(4),
    style.texture.toFixed(4)
  ].join("|");
}

function pathNormal(points, index) {
  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function seededDistanceLfo(s, rate, seed, phaseOffset) {
  const wavelength = lerp(180, 12, clamp(rate, 0, 1));
  const phase = hash(seed + phaseOffset);
  const cycles = s / wavelength;
  const primary = Math.sin((cycles + phase) * Math.PI * 2);
  const secondary = Math.sin((cycles * 0.47 + phase * 0.71 + 0.19) * Math.PI * 2) * 0.35;
  return clamp((primary + secondary) / 1.35, -1, 1);
}

function pressureModAt(point, style, seed) {
  const intensity = clamp(style.pressureVarianceIntensity || 0, 0, 1);
  if (intensity <= 0) return 1;
  return clamp(1 + seededDistanceLfo(point.s || 0, style.pressureVarianceRate || 0, seed, 907) * intensity * 0.58, 0.28, 1.62);
}

function widthModAt(point, style, seed) {
  const intensity = clamp(style.widthVarianceIntensity || 0, 0, 1);
  if (intensity <= 0) return 1;
  return clamp(1 + seededDistanceLfo(point.s || 0, style.widthVarianceRate || 0, seed, 1307) * intensity * 0.48, 0.34, 1.52);
}

function curvatureAt(points, index, span = 1) {
  if (index <= 0 || index >= points.length - 1) return 0;
  const prev = points[Math.max(0, index - span)];
  const point = points[index];
  const next = points[Math.min(points.length - 1, index + span)];
  const ax = point.x - prev.x;
  const ay = point.y - prev.y;
  const bx = next.x - point.x;
  const by = next.y - point.y;
  const aLen = Math.hypot(ax, ay) || 1;
  const bLen = Math.hypot(bx, by) || 1;
  const dot = clamp((ax * bx + ay * by) / (aLen * bLen), -1, 1);
  return clamp((1 - dot) * 0.5, 0, 1);
}

function signedCurvatureAt(points, index, span = 1) {
  if (index <= 0 || index >= points.length - 1) return 0;
  const prev = points[Math.max(0, index - span)];
  const point = points[index];
  const next = points[Math.min(points.length - 1, index + span)];
  const ax = point.x - prev.x;
  const ay = point.y - prev.y;
  const bx = next.x - point.x;
  const by = next.y - point.y;
  const aLen = Math.hypot(ax, ay) || 1;
  const bLen = Math.hypot(bx, by) || 1;
  return clamp((ax * by - ay * bx) / (aLen * bLen), -1, 1);
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function segmentIntersection(a, b, c, d) {
  const rX = b.x - a.x;
  const rY = b.y - a.y;
  const sX = d.x - c.x;
  const sY = d.y - c.y;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 0.00001) return null;
  const cax = c.x - a.x;
  const cay = c.y - a.y;
  const t = (cax * sY - cay * sX) / denom;
  const u = (cax * rY - cay * rX) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * rX, y: a.y + t * rY };
}

function segmentSegmentDistance(a, b, c, d) {
  if (segmentIntersection(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b)
  );
}

function addDeposit(mark, x, y, radius, amount, type, index = 0, extra = {}) {
  if (!mark.deposits) mark.deposits = [];
  if (amount <= 0.015 || radius <= 0.5) return;
  const last = mark.deposits[mark.deposits.length - 1];
  if (last && last.type === type && distance(last, { x, y }) < Math.max(3, radius * 0.35)) {
    last.amount = clamp(Math.max(last.amount, amount), 0, 1);
    last.radius = Math.max(last.radius, radius);
    return;
  }
  mark.deposits.push({
    x,
    y,
    radius,
    amount: clamp(amount, 0, 1),
    type,
    index,
    ...extra,
    seed: mark.seed + mark.deposits.length * 379
  });
}

function addLiveDeposits(mark, point) {
  if (!mark || mark.type !== "freehand" || mark.style.pooling <= 0.001) return;
  const points = mark.points;
  const index = points.length - 1;
  const style = mark.style;
  if (index < 1) return;

  const prev = points[index - 1];

  const skip = Math.max(8, Math.round(style.width / PATH_SAMPLE_GAP));
  const reach = Math.max(style.width * (0.55 + style.straightPooling * 1.65), 8);
  for (let i = 0; i < points.length - skip - 1; i += 1) {
    const olderA = points[i];
    const olderB = points[i + 1];
    const intersection = segmentIntersection(prev, point, olderA, olderB);
    const d = intersection ? 0 : segmentSegmentDistance(prev, point, olderA, olderB);
    if (d < reach) {
      const strength = intersection ? 1 : (1 - d / reach) * style.straightPooling;
      const x = intersection ? intersection.x : (point.x + olderA.x + olderB.x) / 3;
      const y = intersection ? intersection.y : (point.y + olderA.y + olderB.y) / 3;
      addDeposit(
        mark,
        x,
        y,
        style.width * (0.65 + strength * 1.05),
        strength,
        "overlap",
        index,
        { otherIndex: i }
      );
      break;
    }
  }
}

function annotatePooling(points, style) {
  if (style.pooling <= 0.001) {
    return points.map((point) => ({ ...point, poolDeposit: 0, poolCurve: 0 }));
  }
  const raw = points.map((point, index) => {
    const curveSpan = clamp(Math.round(style.width * 0.55 / PATH_SAMPLE_GAP), 3, 28);
    const curve = curvatureAt(points, index, curveSpan);
    const signedCurve = signedCurvatureAt(points, index, curveSpan);
    const curveThreshold = Math.max(0.001, style.curveThreshold);
    const tightCurve = smoothstep(curveThreshold, curveThreshold * 5.7, curve);
    const curvePool = clamp(Math.pow(tightCurve, 0.82), 0, 1);
    const poolSignal = clamp(curvePool + style.flow * Math.pow(tightCurve, 0.9) * 0.42, 0, 1);
    return {
      ...point,
      poolDeposit: poolSignal,
      poolCurve: curvePool,
      poolCurveSide: signedCurve >= 0 ? 1 : -1,
      poolCauseCurve: tightCurve
    };
  });

  return raw.map((point, index) => {
    let poolDeposit = 0;
    let poolCurve = 0;
    let signedSide = 0;
    let sideWeight = 0;
    const radius = Math.max(0, Math.round(style.curveSpread));
    for (let offset = -radius; offset <= radius; offset += 1) {
      const sample = raw[index + offset];
      if (!sample) continue;
      const weight = 1 - Math.abs(offset) / (radius + 1);
      poolDeposit += sample.poolDeposit * weight;
      poolCurve += sample.poolCurve * weight;
      signedSide += sample.poolCurveSide * sample.poolCurve * weight;
      sideWeight += weight;
    }
    const norm = sideWeight || 1;
    return {
      ...point,
      poolDeposit: clamp(poolDeposit / norm, 0, 1),
      poolCurve: clamp(poolCurve / norm, 0, 1),
      poolCurveSide: signedSide >= 0 ? 1 : -1
    };
  });
}

function applyStoredDepositWidth(points, deposits, style) {
  if (!deposits || !deposits.length || style.pooling <= 0.001) return points;
  return points.map((point, index) => {
    let depositWidth = 0;
    let storedDeposit = 0;
    deposits.forEach((deposit) => {
      const isOverlap = deposit.type === "overlap";
      const spatialReach = isOverlap
        ? Math.max(style.poolSpread, style.width * 0.5, 8)
        : Math.max(deposit.radius * 0.85, style.width * 0.55);
      const spatial = Math.max(0, 1 - distance(point, deposit) / spatialReach);
      if (spatial <= 0) return;
      const widthScale = isOverlap ? style.poolWidth / 100 : 0.16;
      const amount = clamp(deposit.amount * style.pooling * widthScale * spatial, 0, isOverlap ? 1.5 : 0.24);
      depositWidth = Math.max(depositWidth, amount);
      storedDeposit = Math.max(storedDeposit, clamp(deposit.amount * spatial, 0, 1));
    });
    return { ...point, depositWidth, storedDeposit };
  });
}

function strokeRadiusAt(point, style, seed, side = 0) {
  const t = point.t || 0;
  const nearEnd = Math.max(0, 1 - Math.min(t, 1 - t) / 0.1);
  const widthMod = widthModAt(point, style, seed);
  const pressureMod = pressureModAt(point, style, seed);
  const taper = clamp(1 - nearEnd * 0.5, 0.34, 1);
  const curvePool = point.poolCurve || 0;
  const curveSide = point.poolCurveSide || 0;
  const insideCurvePool = side !== 0 && side === curveSide ? curvePool * style.pooling * style.curveWidth : 0;
  const pooled = 1 + insideCurvePool + (point.depositWidth || 0);
  return Math.max(0.5, style.width * widthMod * pressureMod * taper * pooled * 0.5);
}

function buildRibbonPolygon(points, style, seed) {
  const left = [];
  const right = [];
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const normal = pathNormal(points, i);
    const leftRadius = strokeRadiusAt(point, style, seed, 1);
    const rightRadius = strokeRadiusAt(point, style, seed, -1);
    left.push({ x: point.x + normal.x * leftRadius, y: point.y + normal.y * leftRadius });
    right.push({ x: point.x - normal.x * rightRadius, y: point.y - normal.y * rightRadius });
  }
  return left.concat(right.reverse());
}

function segmentNormal(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function drawRibbonJoint(context, points, index, style, seed, bounds) {
  if (index <= 0 || index >= points.length - 1) return;
  const prev = points[index - 1];
  const point = points[index];
  const next = points[index + 1];
  const prevNormal = segmentNormal(prev, point);
  const nextNormal = segmentNormal(point, next);
  const leftRadius = strokeRadiusAt(point, style, seed, 1);
  const rightRadius = strokeRadiusAt(point, style, seed, -1);

  drawSideFan(context, point, prevNormal, nextNormal, leftRadius, 1, bounds);
  drawSideFan(context, point, prevNormal, nextNormal, rightRadius, -1, bounds);
}

function drawSideFan(context, point, prevNormal, nextNormal, radius, side, bounds) {
  const ax = prevNormal.x * side;
  const ay = prevNormal.y * side;
  const bx = nextNormal.x * side;
  const by = nextNormal.y * side;
  const dot = clamp(ax * bx + ay * by, -1, 1);
  const angle = Math.acos(dot);
  const steps = Math.max(3, Math.ceil(angle / 0.18));
  const cross = ax * by - ay * bx;
  const direction = cross >= 0 ? 1 : -1;
  const start = Math.atan2(ay, ax);

  context.beginPath();
  context.moveTo(point.x - bounds.x, point.y - bounds.y);
  for (let i = 0; i <= steps; i += 1) {
    const theta = start + direction * angle * (i / steps);
    context.lineTo(
      point.x + Math.cos(theta) * radius - bounds.x,
      point.y + Math.sin(theta) * radius - bounds.y
    );
  }
  context.closePath();
  context.fill();
}

function drawRibbonMaskPath(context, polygon, points, style, seed, bounds) {
  if (points.length < 2) return;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const an = pathNormal(points, i);
    const bn = pathNormal(points, i + 1);
    const al = strokeRadiusAt(a, style, seed, 1);
    const ar = strokeRadiusAt(a, style, seed, -1);
    const bl = strokeRadiusAt(b, style, seed, 1);
    const br = strokeRadiusAt(b, style, seed, -1);

    context.beginPath();
    context.moveTo(a.x + an.x * al - bounds.x, a.y + an.y * al - bounds.y);
    context.lineTo(b.x + bn.x * bl - bounds.x, b.y + bn.y * bl - bounds.y);
    context.lineTo(b.x - bn.x * br - bounds.x, b.y - bn.y * br - bounds.y);
    context.lineTo(a.x - an.x * ar - bounds.x, a.y - an.y * ar - bounds.y);
    context.closePath();
    context.fill();
  }

  for (let i = 1; i < points.length - 1; i += 1) {
    drawRibbonJoint(context, points, i, style, seed, bounds);
  }

  const first = points[0];
  const last = points[points.length - 1];
  const closed = distance(first, last) < Math.max(2, style.width * 0.4);
  if (!closed) {
    [first, last].forEach((point) => {
      const radius = Math.max(strokeRadiusAt(point, style, seed, 1), strokeRadiusAt(point, style, seed, -1));
      context.beginPath();
      context.arc(point.x - bounds.x, point.y - bounds.y, radius, 0, Math.PI * 2);
      context.fill();
    });
  }
}

function ribbonBounds(polygon, points, style, seed) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  polygon.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  points.forEach((point) => {
    const radius = Math.max(strokeRadiusAt(point, style, seed, 1), strokeRadiusAt(point, style, seed, -1));
    minX = Math.min(minX, point.x - radius);
    minY = Math.min(minY, point.y - radius);
    maxX = Math.max(maxX, point.x + radius);
    maxY = Math.max(maxY, point.y + radius);
  });
  const pad = Math.ceil(style.width * 0.2 + 4);
  minX = clamp(Math.floor(minX - pad), 0, state.viewWidth);
  minY = clamp(Math.floor(minY - pad), 0, state.viewHeight);
  maxX = clamp(Math.ceil(maxX + pad), 0, state.viewWidth);
  maxY = clamp(Math.ceil(maxY + pad), 0, state.viewHeight);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function expandBoundsForDeposits(bounds, deposits, style, preview) {
  if (!deposits || !deposits.length) return bounds;
  let minX = bounds.x;
  let minY = bounds.y;
  let maxX = bounds.x + bounds.width;
  let maxY = bounds.y + bounds.height;
  deposits.forEach((deposit) => {
    const radius = depositFootprintRadius(deposit, style, preview);
    minX = Math.min(minX, deposit.x - radius);
    minY = Math.min(minY, deposit.y - radius);
    maxX = Math.max(maxX, deposit.x + radius);
    maxY = Math.max(maxY, deposit.y + radius);
  });
  minX = clamp(Math.floor(minX - 2), 0, state.viewWidth);
  minY = clamp(Math.floor(minY - 2), 0, state.viewHeight);
  maxX = clamp(Math.ceil(maxX + 2), 0, state.viewWidth);
  maxY = clamp(Math.ceil(maxY + 2), 0, state.viewHeight);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function depositFootprintRadius(deposit, style, preview) {
  if (deposit.type === "overlap") {
    const spread = Math.max(style.poolSpread, style.width * (1 + style.poolWidth / 100));
    return Math.max(0, spread * deposit.amount * (preview ? 0.9 : 1));
  }
  return deposit.radius * (0.42 + deposit.amount * 0.42) * (preview ? 0.9 : 1);
}

function drawRibbonInkStroke(mark, points, baseWidth, style, markSeed, preview) {
  if (points.length < 2) return;
  const deposits = mark.deposits && mark.deposits.length ? mark.deposits : [];
  const pooledPoints = applyStoredDepositWidth(annotatePooling(points, style), deposits, style);
  const polygon = buildRibbonPolygon(pooledPoints, style, markSeed);
  const bounds = expandBoundsForDeposits(ribbonBounds(polygon, pooledPoints, style, markSeed), deposits, style, preview);
  if (bounds.width <= 1 || bounds.height <= 1) return;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = bounds.width;
  maskCanvas.height = bounds.height;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskCtx.fillStyle = "#000";
  drawRibbonMaskPath(maskCtx, polygon, pooledPoints, style, markSeed, bounds);

  const mask = maskCtx.getImageData(0, 0, bounds.width, bounds.height).data;
  const paintCanvas = document.createElement("canvas");
  paintCanvas.width = bounds.width;
  paintCanvas.height = bounds.height;
  const paintCtx = paintCanvas.getContext("2d", { willReadFrequently: true });
  const image = paintCtx.createImageData(bounds.width, bounds.height);
  const data = image.data;
  const dryEffect = clamp(style.dryness * (1 - style.wetness) * style.texture, 0, 1);
  const wetBridge = clamp(style.wetness, 0, 1);
  const softness = TOOTH_CONTACT_SOFTNESS * (0.32 + wetBridge * 0.9);
  const localPoolReach = Math.max(baseWidth * 0.55, 7);
  const baseAlpha = style.density * (preview ? 0.42 : 0.92);

  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const index = (y * bounds.width + x) * 4;
      const maskAlpha = mask[index + 3] / 255;
      if (maskAlpha <= 0) continue;

      const worldX = bounds.x + x;
      const worldY = bounds.y + y;
      const paper = samplePaperField(worldX, worldY, style);
      const toothAcceptance = smoothstep(TOOTH_CONTACT_THRESHOLD - softness, TOOTH_CONTACT_THRESHOLD + softness, paper.tooth);
      const heightAcceptance = smoothstep(0.36 - softness, 0.62 + softness, paper.height);
      const dryAcceptance = clamp(toothAcceptance * 0.72 + heightAcceptance * 0.28, 0, 1);
      const contact = lerp(1, dryAcceptance, dryEffect);
      const bristleNoise = perlinFbm(worldX * 0.11, worldY * 0.11 + markSeed * 0.003, markSeed + 710, 3) * 0.5 + 0.5;
      const bristleContact = lerp(1, smoothstep(0.18, 0.78, bristleNoise), dryEffect * style.bristles);
      let localPathPool = 0;
      for (let i = 0; i < pooledPoints.length; i += 4) {
        const point = pooledPoints[i];
        const pointPool = Math.max(point.poolDeposit || 0, point.storedDeposit || 0);
        if (!pointPool) continue;
        const d = Math.hypot(worldX - point.x, worldY - point.y);
        if (d < localPoolReach) {
          localPathPool = Math.max(localPathPool, pointPool * (1 - d / localPoolReach));
        }
      }
      const poolBoost = style.pooling * localPathPool * 0.34;
      const alpha = clamp(maskAlpha * baseAlpha * contact * bristleContact * (1 + poolBoost), 0, preview ? 0.55 : 0.96);

      data[index] = INK.r;
      data[index + 1] = INK.g;
      data[index + 2] = INK.b;
      data[index + 3] = Math.round(alpha * 255);
    }
  }

  paintCtx.putImageData(image, 0, 0);
  renderCtx.drawImage(paintCanvas, bounds.x, bounds.y, bounds.width, bounds.height);
}

function drawToothBodyStroke(points, baseWidth, style, markSeed, preview) {
  if (points.length < 2) return;
  const wetness = style.wetness;
  const toothEffect = clamp(style.dryness * (1 - wetness) * style.texture, 0, 1);
  const bristleEffect = clamp(style.bristles * (style.dryness * 0.5 + toothEffect * 0.35) + toothEffect * 0.62, 0, 1);
  const solidAlpha = clamp(style.density * (preview ? 0.42 : 0.96) * (1 - toothEffect * 0.96) * (1 - bristleEffect * 0.32), 0, preview ? 0.55 : 0.96);
  const basePressureContact = clamp(0.2 + style.pressure * 0.78 + wetness * 0.18 - style.dryness * 0.22, 0.04, 1);
  const taperAmount = 0.55 - style.pooling * 0.16;

  renderCtx.save();
  renderCtx.lineCap = "round";
  renderCtx.lineJoin = "round";

  if (solidAlpha > 0.025) {
    renderCtx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${solidAlpha})`;
    if ((style.widthVarianceIntensity || 0) <= 0.01 && (style.pressureVarianceIntensity || 0) <= 0.01) {
      renderCtx.lineWidth = baseWidth;
      renderCtx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) renderCtx.moveTo(point.x, point.y);
        else renderCtx.lineTo(point.x, point.y);
      });
      renderCtx.stroke();
    } else {
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        const t = (a.t + b.t) / 2;
        const mid = { s: ((a.s || 0) + (b.s || 0)) / 2 };
        const nearEnd = Math.max(0, 1 - Math.min(t, 1 - t) / 0.1);
        const widthMod = widthModAt(mid, style, markSeed);
        const pressureMod = pressureModAt(mid, style, markSeed);
        const taper = clamp(1 - nearEnd * taperAmount, 0.28, 1);
        renderCtx.lineWidth = baseWidth * widthMod * pressureMod * taper;
        renderCtx.beginPath();
        renderCtx.moveTo(a.x, a.y);
        renderCtx.lineTo(b.x, b.y);
        renderCtx.stroke();
      }
    }
  }

  if (bristleEffect <= 0.025) {
    renderCtx.restore();
    return;
  }

  const laneDensity = 0.34 + bristleEffect * 0.72;
  const laneCount = Math.round(clamp(baseWidth * laneDensity, 6, 150));
  const spread = baseWidth * (0.88 + bristleEffect * 0.08);
  const laneWidth = clamp(baseWidth / laneCount * (0.42 + bristleEffect * 0.42), 0.16, 0.9);
  const bristleAlpha = clamp(style.density * bristleEffect * (preview ? 0.18 : 0.62), 0, preview ? 0.28 : 0.72);

  for (let lane = 0; lane < laneCount; lane += 1) {
    const laneIdentity = fbm(lane * 0.37, markSeed * 0.011, markSeed + 1301, 2) * 0.5 + 0.5;
    const u = laneCount <= 1 ? 0.5 : lane / (laneCount - 1);
    const centered = u - 0.5;
    const edge = Math.abs(centered) * 2;
    const pressureReach = clamp(basePressureContact + wetness * 0.12 - edge * (0.08 + (1 - style.pressure) * 0.35), 0, 1);
    if (laneIdentity > pressureReach) continue;

    let pathOpen = false;
    let last = null;
    let lastNormal = null;
    let lastIndex = -1;

    renderCtx.strokeStyle = `rgba(${INK.r}, ${INK.g}, ${INK.b}, ${bristleAlpha * (0.72 + laneIdentity * 0.28)})`;
    renderCtx.lineWidth = laneWidth * (0.85 + laneIdentity * 0.3);
    renderCtx.beginPath();

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const normal = pathNormal(points, i);
      const t = point.t || (points.length <= 1 ? 0 : i / (points.length - 1));
      const nearEnd = Math.max(0, 1 - Math.min(t, 1 - t) / 0.09);
      const pressureMod = pressureModAt(point, style, markSeed);
      const widthMod = widthModAt(point, style, markSeed);
      const taper = clamp(1 - nearEnd * taperAmount, 0.22, 1);
      const localWidth = baseWidth * widthMod * pressureMod * taper;
      const laneJitter = fbm(t * 3.6, lane * 0.19, markSeed + 801, 2) * baseWidth * 0.018 * bristleEffect;
      const offset = centered * spread * (localWidth / Math.max(baseWidth, 1)) + laneJitter;
      const x = point.x + normal.x * offset;
      const y = point.y + normal.y * offset;
      const paper = samplePaperField(x, y, style);
      const softness = TOOTH_CONTACT_SOFTNESS * (0.45 + wetness * 0.55);
      const rawToothContact = smoothstep(TOOTH_CONTACT_THRESHOLD - softness, TOOTH_CONTACT_THRESHOLD + softness, paper.tooth);
      const toothContact = lerp(1, rawToothContact, toothEffect);
      const acceptsInk = toothContact > lerp(0.015, 0.46, toothEffect);

      if (!acceptsInk) {
        if (pathOpen) renderCtx.stroke();
        renderCtx.beginPath();
        pathOpen = false;
        last = null;
        lastNormal = null;
        lastIndex = -1;
        continue;
      }

      const current = { x, y };
      if (!pathOpen) {
        renderCtx.moveTo(x, y);
        pathOpen = true;
      } else {
        const jump = distance(last, current);
        const normalTurn = lastNormal ? lastNormal.x * normal.x + lastNormal.y * normal.y : 1;
        if (i - lastIndex > 1 || jump > 6 || normalTurn < 0.6) {
          renderCtx.stroke();
          renderCtx.beginPath();
          renderCtx.moveTo(x, y);
        } else {
          renderCtx.lineTo(x, y);
        }
      }
      last = current;
      lastNormal = normal;
      lastIndex = i;
    }
    if (pathOpen) renderCtx.stroke();
  }

  renderCtx.restore();
}

function renderInkStroke(mark, preview = false) {
  const source = sampleMark(mark);
  if (source.length < 2) return;
  const style = mark.style;
  const points = perturbPoints(source, mark);
  const baseWidth = style.width;

  renderCtx.save();
  renderCtx.globalCompositeOperation = "multiply";

  if (style.rendererMode === "roundCap") {
    drawToothBodyStroke(points, baseWidth, style, mark.seed, preview);
  } else {
    drawRibbonInkStroke(mark, points, baseWidth, style, mark.seed, preview);
  }

  renderCtx.restore();
}

function renderPreviewGuides(mark) {
  const points = sampleMark(mark);
  if (points.length < 2) return;
  renderCtx.save();
  renderCtx.setLineDash([5, 7]);
  renderCtx.strokeStyle = "rgba(45, 37, 29, 0.22)";
  renderCtx.lineWidth = 1;
  renderCtx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) renderCtx.moveTo(point.x, point.y);
    else renderCtx.lineTo(point.x, point.y);
  });
  renderCtx.stroke();
  renderCtx.restore();
}

function renderRegionGuides(points, options) {
  if (points.length < 2) return;
  const previewPolygon = points.length >= 3 ? points : [];
  previewCtx.save();
  previewCtx.globalCompositeOperation = "source-over";
  previewCtx.lineWidth = 1;
  previewCtx.setLineDash([6, 5]);
  previewCtx.strokeStyle = "rgba(30, 92, 124, 0.74)";
  previewCtx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) previewCtx.moveTo(point.x, point.y);
    else previewCtx.lineTo(point.x, point.y);
  });
  previewCtx.stroke();

  if (previewPolygon.length >= 3) {
    previewCtx.setLineDash([]);
    previewCtx.strokeStyle = "rgba(30, 92, 124, 0.28)";
    generateHatchSegments(previewPolygon, options).forEach((segment) => {
      previewCtx.beginPath();
      previewCtx.moveTo(segment.start.x, segment.start.y);
      previewCtx.lineTo(segment.end.x, segment.end.y);
      previewCtx.stroke();
    });
  }
  previewCtx.restore();
}

function renderCursorPreview() {
  if (!state.pointer) return;
  const width = Number(controls.width.value);
  const radius = width / 2;
  previewCtx.save();
  previewCtx.globalCompositeOperation = "source-over";
  previewCtx.fillStyle = "rgba(32, 28, 22, 0.035)";
  previewCtx.strokeStyle = "rgba(32, 28, 22, 0.34)";
  previewCtx.lineWidth = 1;
  previewCtx.setLineDash([4, 4]);
  previewCtx.beginPath();
  previewCtx.arc(state.pointer.x, state.pointer.y, radius, 0, Math.PI * 2);
  previewCtx.fill();
  previewCtx.stroke();
  previewCtx.setLineDash([]);
  previewCtx.strokeStyle = "rgba(246, 239, 225, 0.58)";
  previewCtx.beginPath();
  previewCtx.arc(state.pointer.x, state.pointer.y, radius + 1, 0, Math.PI * 2);
  previewCtx.stroke();
  previewCtx.restore();
}

function renderDebugOverlay() {
  if (state.debugMode === "none") return;
  if (state.debugMode === "pool") {
    renderPoolDebugOverlay();
    return;
  }
  const style = getStyle();
  const cacheKey = debugOverlayKey(state.debugMode, style);
  if (debugOverlayCache.key === cacheKey && debugOverlayCache.canvas) {
    previewCtx.save();
    previewCtx.globalCompositeOperation = "source-over";
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(debugOverlayCache.canvas, 0, 0, state.viewWidth, state.viewHeight);
    previewCtx.restore();
    return;
  }

  const step = 3;
  const cols = Math.ceil(state.viewWidth / step);
  const rows = Math.ceil(state.viewHeight / step);
  const overlay = document.createElement("canvas");
  overlay.width = cols;
  overlay.height = rows;
  const overlayCtx = overlay.getContext("2d");
  const image = overlayCtx.createImageData(cols, rows);
  const data = image.data;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const value = debugValueAt(x * step, y * step, state.debugMode, style);
      const [r, g, b] = debugColor(value, state.debugMode);
      const index = (y * cols + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 180;
    }
  }

  overlayCtx.putImageData(image, 0, 0);
  previewCtx.save();
  previewCtx.globalCompositeOperation = "source-over";
  previewCtx.imageSmoothingEnabled = false;
  previewCtx.drawImage(overlay, 0, 0, state.viewWidth, state.viewHeight);
  previewCtx.restore();
  debugOverlayCache.key = cacheKey;
  debugOverlayCache.canvas = overlay;
}

function renderPoolDebugOverlay() {
  previewCtx.save();
  previewCtx.globalCompositeOperation = "source-over";

  const marks = state.currentMark ? state.marks.concat([state.currentMark]) : state.marks;
  marks.forEach((mark) => {
    const style = mark.style || getStyle();
    const deposits = mark.deposits || [];

    if (style.rendererMode !== "ribbon") return;
    const source = sampleMark(mark);
    if (source.length < 2) return;
    const points = perturbPoints(source, mark);
    const pooledPoints = applyStoredDepositWidth(annotatePooling(points, style), deposits, style);

    for (let i = 0; i < pooledPoints.length - 1; i += 1) {
      const a = pooledPoints[i];
      const b = pooledPoints[i + 1];
      const curveValue = Math.max(a.poolCurve || 0, b.poolCurve || 0) * style.pooling;
      if (curveValue > 0.04) {
        previewCtx.strokeStyle = "rgba(57, 255, 20, 0.62)";
        previewCtx.lineWidth = Math.max(2, style.width * 0.14 * curveValue);
        previewCtx.lineCap = "butt";
        previewCtx.beginPath();
        previewCtx.moveTo(a.x, a.y);
        previewCtx.lineTo(b.x, b.y);
        previewCtx.stroke();
      }

      const poolValue = Math.max(a.storedDeposit || 0, b.storedDeposit || 0);
      if (poolValue > 0.08) {
        previewCtx.strokeStyle = "rgba(57, 255, 20, 0.7)";
        previewCtx.lineWidth = Math.max(2, style.width * 0.16 * poolValue);
        previewCtx.lineCap = "butt";
        previewCtx.beginPath();
        previewCtx.moveTo(a.x, a.y);
        previewCtx.lineTo(b.x, b.y);
        previewCtx.stroke();
      }

      const widthValue = Math.max(a.depositWidth || 0, b.depositWidth || 0, curveValue * style.curveWidth);
      if (widthValue <= 0.01) continue;
      previewCtx.strokeStyle = "rgba(255, 122, 0, 0.88)";
      previewCtx.lineWidth = Math.max(2, style.width * widthValue);
      previewCtx.lineCap = "butt";
      previewCtx.beginPath();
      previewCtx.moveTo(a.x, a.y);
      previewCtx.lineTo(b.x, b.y);
      previewCtx.stroke();
    }
  });

  previewCtx.restore();
}

function updateDebugReadout() {
  if (!debugReadout) return;
  if (state.debugMode === "none" || !state.pointer) {
    debugReadout.textContent = state.debugMode === "none" ? "Debug off" : "Move over canvas";
    return;
  }
  const { x, y } = state.pointer;
  const sample = sampleStrokeContact(x, y);
  debugReadout.textContent = [
    `mode        ${state.debugMode}`,
    `x y         ${x.toFixed(1)} ${y.toFixed(1)}`,
    `height      ${sample.paper.height.toFixed(3)}`,
    `tooth       ${sample.paper.tooth.toFixed(3)}`,
    `absorbency  ${sample.paper.absorbency.toFixed(3)}`,
    `edge        ${sample.paper.edge.toFixed(3)}`,
    `fiber       ${sample.paper.fiber.toFixed(3)}`,
    `fiberAngle  ${sample.paper.fiberAngle.toFixed(3)}`,
    `pressure    ${sample.pressure.toFixed(3)}`,
    `contact     ${sample.contact.toFixed(3)}`,
    `acceptance  ${sample.acceptance.toFixed(3)}`
  ].join("\n");
}

function rebuildPaperTexture() {
  const style = getStyle();
  paperCtx.fillStyle = `rgb(${PAPER.r}, ${PAPER.g}, ${PAPER.b})`;
  paperCtx.fillRect(0, 0, state.viewWidth, state.viewHeight);

  const field = cachedPaperField(style);
  const pixelRatio = state.pixelRatio;
  const pixelWidth = Math.round(state.viewWidth * pixelRatio);
  const pixelHeight = Math.round(state.viewHeight * pixelRatio);
  paperCtx.save();
  paperCtx.setTransform(1, 0, 0, 1, 0, 0);
  const image = paperCtx.getImageData(0, 0, pixelWidth, pixelHeight);
  const data = image.data;
  for (let py = 0; py < pixelHeight; py += 1) {
    const y = py / pixelRatio;
    const row = Math.min(field.rows - 1, Math.round(y / field.step));
    for (let px = 0; px < pixelWidth; px += 1) {
      const x = px / pixelRatio;
      const col = Math.min(field.cols - 1, Math.round(x / field.step));
      const sampleIndex = row * field.cols + col;
      const toothProfile = style.toothScale;
      const height = field.height[sampleIndex];
      const tooth = field.tooth[sampleIndex];
      const fiber = field.fiber[sampleIndex];
      const edge = field.edge[sampleIndex];
      const visibleTooth = clamp((height - 0.36) * 2.15, 0, 1);
      const shade = Math.round(
        (height - 0.5) * (6 + toothProfile * 15) +
        (visibleTooth - 0.5) * style.texture * toothProfile * 9 +
        (tooth - 0.5) * style.texture * toothProfile * 10 +
        (fiber - 0.5) * style.fiberStrength * toothProfile * 9 +
        edge * toothProfile * 4
      );
      const index = (py * pixelWidth + px) * 4;
      data[index] = clamp(PAPER.r + shade, 0, 255);
      data[index + 1] = clamp(PAPER.g + shade, 0, 255);
      data[index + 2] = clamp(PAPER.b + shade, 0, 255);
      data[index + 3] = 255;
    }
  }
  paperCtx.putImageData(image, 0, 0);
  paperCtx.restore();
}

function clearLayer(context) {
  context.clearRect(0, 0, state.viewWidth, state.viewHeight);
}

function withRenderContext(context, draw) {
  const previous = renderCtx;
  renderCtx = context;
  draw();
  renderCtx = previous;
}

function rebuildInkLayer() {
  clearLayer(inkCtx);
  withRenderContext(inkCtx, () => {
    state.marks.forEach((mark) => renderInkStroke(mark));
  });
  state.inkDirty = false;
}

function renderCommittedMark(mark) {
  withRenderContext(inkCtx, () => renderInkStroke(mark));
}

function redraw() {
  if (state.inkDirty) rebuildInkLayer();
  clearLayer(previewCtx);
  renderDebugOverlay();
  if (state.regionDraft) {
    const previewPoints = state.regionDraft.shape === "polygon" && state.pointer
      ? state.regionDraft.points.concat([state.pointer])
      : regionShapePoints(state.regionDraft);
    renderRegionGuides(previewPoints, state.regionDraft.options);
  }
  withRenderContext(previewCtx, () => {
    if (state.polygonDraft) {
      const previewPoints = state.pointer ? state.polygonDraft.points.concat([state.pointer]) : state.polygonDraft.points;
      renderInkStroke({ ...state.polygonDraft, points: previewPoints, closed: false }, true);
      renderPreviewGuides({ ...state.polygonDraft, points: previewPoints, closed: false });
    }
    if (state.currentMark) {
      renderInkStroke(state.currentMark, true);
      renderPreviewGuides(state.currentMark);
    }
  });
  renderCursorPreview();
  updateDebugReadout();
}

function requestRedraw() {
  if (state.redrawQueued) return;
  state.redrawQueued = true;
  requestAnimationFrame(() => {
    state.redrawQueued = false;
    redraw();
  });
}

function resizeCanvas() {
  const rect = previewCanvas.getBoundingClientRect();
  state.viewWidth = Math.max(640, Math.round(rect.width));
  state.viewHeight = Math.max(420, Math.round(rect.height));
  state.pixelRatio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

  [paperCanvas, inkCanvas, previewCanvas].forEach((layer) => {
    layer.width = Math.round(state.viewWidth * state.pixelRatio);
    layer.height = Math.round(state.viewHeight * state.pixelRatio);
  });
  [paperCtx, inkCtx, previewCtx].forEach((context) => {
    context.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  });

  rebuildPaperTexture();
  state.inkDirty = true;
  requestRedraw();
}

function nextSeed() {
  const baseSeed = Number(controls.seed.value) || 1;
  return baseSeed + state.markCounter * 1009 + Math.floor(hash(baseSeed + state.markCounter) * 997);
}

function regionOptions() {
  return {
    count: Number(controls.regionLineCount.value),
    lineMode: controls.regionLineMode.value,
    width: Number(controls.regionBrushWidth.value),
    angle: Number(controls.regionAngle.value),
    shape: controls.regionShape.value,
    seed: nextSeed()
  };
}

function rectRegionPoints(start, end) {
  return [
    { x: start.x, y: start.y },
    { x: end.x, y: start.y },
    { x: end.x, y: end.y },
    { x: start.x, y: end.y }
  ];
}

function ellipseRegionPoints(start, end, steps = 96) {
  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  const rx = Math.abs(end.x - start.x) / 2;
  const ry = Math.abs(end.y - start.y) / 2;
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    points.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
  }
  return points;
}

function regionShapePoints(draft) {
  if (!draft) return [];
  if (draft.shape === "rect" && draft.start && draft.end) return rectRegionPoints(draft.start, draft.end);
  if (draft.shape === "ellipse" && draft.start && draft.end) return ellipseRegionPoints(draft.start, draft.end);
  return draft.points || [];
}

function regionToMarks(region) {
  const segments = generateHatchSegments(region.polygon, region.hatch);
  return segments.map((segment, index) => {
    const baseStyle = getStyle();
    const style = {
      ...baseStyle,
      brush: { ...baseStyle.brush, width: region.hatch.width },
      width: region.hatch.width
    };
    return {
      type: "line",
      start: segment.start,
      end: segment.end,
      points: [],
      deposits: [],
      style,
      seed: region.seed + index * 997,
      generatedFrom: region.seed
    };
  });
}

function commitRegion(region) {
  const marks = regionToMarks(region);
  if (!marks.length) {
    state.regionDraft = null;
    requestRedraw();
    return;
  }
  snapshot();
  state.regions.push(region);
  state.marks.push(...marks);
  state.markCounter += marks.length + 1;
  state.regionDraft = null;
  state.inkDirty = true;
  requestRedraw();
}

function startDrag(event) {
  if (state.tool === "polygon") return;
  const point = canvasPoint(event);
  if (state.tool === "region") {
    if (controls.regionShape.value === "polygon") return;
    previewCanvas.setPointerCapture(event.pointerId);
    state.regionDraft = {
      shape: controls.regionShape.value,
      start: point,
      end: point,
      points: [],
      options: regionOptions()
    };
    state.pointer = point;
    requestRedraw();
    return;
  }
  previewCanvas.setPointerCapture(event.pointerId);
  state.currentMark = {
    type: state.tool,
    start: point,
    end: point,
    points: state.tool === "freehand" ? [point] : [],
    deposits: [],
    style: getStyle(),
    seed: nextSeed()
  };
  requestRedraw();
}

function continueDrag(event) {
  state.pointer = canvasPoint(event);
  if (state.regionDraft && state.regionDraft.shape !== "polygon") {
    state.regionDraft.end = state.pointer;
    requestRedraw();
    return;
  }
  if (!state.currentMark) {
    requestRedraw();
    return;
  }
  const point = state.pointer;
  state.currentMark.end = point;
  if (state.currentMark.type === "freehand") {
    const last = state.currentMark.points[state.currentMark.points.length - 1];
    if (!last || distance(last, point) > 2) {
      state.currentMark.points.push(point);
      addLiveDeposits(state.currentMark, point);
    }
  }
  requestRedraw();
}

function finishDrag(event) {
  if (state.regionDraft && state.regionDraft.shape !== "polygon") {
    state.regionDraft.end = canvasPoint(event);
    if (event.pointerId !== undefined) previewCanvas.releasePointerCapture(event.pointerId);
    finishRegion();
    return;
  }
  if (!state.currentMark) return;
  const point = canvasPoint(event);
  state.currentMark.end = point;
  if (state.currentMark.type === "freehand") {
    state.currentMark.points.push(point);
    addLiveDeposits(state.currentMark, point);
  }
  previewCanvas.releasePointerCapture(event.pointerId);
  commitMark(state.currentMark);
}

function addPolygonPoint(event) {
  const point = canvasPoint(event);
  if (!state.polygonDraft) {
    state.polygonDraft = {
      type: "polygon",
      points: [point],
      closed: true,
      deposits: [],
      style: getStyle(),
      seed: nextSeed()
    };
  } else {
    state.polygonDraft.points.push(point);
  }
  state.pointer = point;
  requestRedraw();
}

function finishPolygon() {
  if (!state.polygonDraft) return;
  const points = state.polygonDraft.points;
  if (points.length > 2 && distance(points[points.length - 1], points[points.length - 2]) < 3) {
    points.pop();
  }
  if (state.polygonDraft.points.length >= 2) {
    commitMark(state.polygonDraft);
  }
  state.polygonDraft = null;
  requestRedraw();
}

function addRegionPoint(event) {
  const point = canvasPoint(event);
  if (!state.regionDraft) {
    state.regionDraft = {
      points: [point],
      options: regionOptions(),
      shape: controls.regionShape.value
    };
  } else {
    state.regionDraft.points.push(point);
  }
  state.pointer = point;
  requestRedraw();
}

function finishRegion() {
  if (!state.regionDraft) return;
  const points = regionShapePoints(state.regionDraft).slice();
  if (points.length > 2 && distance(points[points.length - 1], points[points.length - 2]) < 3) {
    points.pop();
  }
  if (points.length >= 3) {
    commitRegion(makeHatchRegion(points, state.regionDraft.options));
  } else {
    state.regionDraft = null;
    requestRedraw();
  }
}

function pathToSvg(mark) {
  const points = sampleMark(mark);
  if (!points.length) return "";
  const commands = points.map((point, index) => {
    const cmd = index === 0 ? "M" : "L";
    return `${cmd}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  });
  return commands.join(" ");
}

function exportPng() {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = paperCanvas.width;
  exportCanvas.height = paperCanvas.height;
  const exportCtx = exportCanvas.getContext("2d", { alpha: false });
  exportCtx.drawImage(paperCanvas, 0, 0);
  exportCtx.drawImage(inkCanvas, 0, 0);
  const link = document.createElement("a");
  link.download = "lines-and-marks-ink.png";
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

function exportSvg() {
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${state.viewWidth} ${state.viewHeight}">`,
    `<rect width="100%" height="100%" fill="rgb(${PAPER.r},${PAPER.g},${PAPER.b})"/>`
  ];
  state.marks.forEach((mark) => {
    const path = pathToSvg(mark);
    if (!path) return;
    svg.push(`<path d="${path}" fill="none" stroke="rgb(${INK.r},${INK.g},${INK.b})" stroke-width="${mark.style.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${mark.style.density.toFixed(2)}"/>`);
  });
  svg.push("</svg>");
  const blob = new Blob([svg.join("\n")], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "lines-and-marks-source.svg";
  link.click();
  URL.revokeObjectURL(url);
}

function setTool(tool) {
  state.tool = tool;
  state.currentMark = null;
  if (tool !== "polygon") state.polygonDraft = null;
  if (tool !== "region") state.regionDraft = null;
  syncActiveButtons();
  const messages = {
    freehand: "Freehand: drag to draw.",
    line: "Line: drag from start to end.",
    arc: "Arc: drag a bowed stroke from start to end.",
    ellipse: "Ellipse: drag a box for a hand-drawn closed stroke.",
    rect: "Rect: drag a box for a wobbly closed stroke.",
    polygon: "Polygon: click points, double-click or Enter to finish.",
    region: controls.regionShape.value === "polygon"
      ? "Region: click polygon points, double-click or Enter to generate straight hatch marks."
      : "Region: drag a boundary shape to generate clipped straight hatch marks."
  };
  statusText.textContent = messages[tool] || "";
  saveSettings();
  requestRedraw();
}

function registerEvents() {
  document.querySelectorAll(".tool-btn").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  document.querySelectorAll(".debug-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.debugMode = button.dataset.debug;
      syncActiveButtons();
      saveSettings();
      requestRedraw();
    });
  });

  document.querySelectorAll(".xy-pad").forEach((pad) => {
    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pad.setPointerCapture(event.pointerId);
      setXyPadFromPointer(pad, event);
    });
    pad.addEventListener("pointermove", (event) => {
      if (!pad.hasPointerCapture(event.pointerId)) return;
      setXyPadFromPointer(pad, event);
    });
    pad.addEventListener("pointerup", (event) => {
      if (pad.hasPointerCapture(event.pointerId)) pad.releasePointerCapture(event.pointerId);
    });
    pad.addEventListener("pointercancel", (event) => {
      if (pad.hasPointerCapture(event.pointerId)) pad.releasePointerCapture(event.pointerId);
    });
  });

  const handleControlChange = (input) => {
      updateLabels();
      syncXyPads();
      if (state.currentMark) state.currentMark.style = getStyle();
      if (state.polygonDraft) state.polygonDraft.style = getStyle();
      if (state.regionDraft) state.regionDraft.options = regionOptions();
      if (input.id === "regionShape" && state.tool === "region") setTool("region");
      if (paperControlIds.has(input.id)) rebuildPaperTexture();
      saveSettings();
      requestRedraw();
  };

  Object.values(controls).forEach((input) => {
    input.addEventListener("input", () => handleControlChange(input));
    input.addEventListener("change", () => handleControlChange(input));
  });

  document.getElementById("randomSeed").addEventListener("click", () => {
    controls.seed.value = String(Math.floor(Math.random() * 999999));
    updateLabels();
    saveSettings();
  });
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("redoBtn").addEventListener("click", redo);
  document.getElementById("clearBtn").addEventListener("click", clearAll);
  document.getElementById("exportPngBtn").addEventListener("click", exportPng);
  document.getElementById("exportSvgBtn").addEventListener("click", exportSvg);
  document.getElementById("savePresetBtn").addEventListener("click", savePreset);
  document.getElementById("loadPresetBtn").addEventListener("click", loadPreset);
  document.getElementById("deletePresetBtn").addEventListener("click", deletePreset);
  presetSelect.addEventListener("change", () => {
    if (presetNameInput && presetSelect.value) presetNameInput.value = presetSelect.value;
  });
  presetNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") savePreset();
  });

  previewCanvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (state.tool === "polygon") addPolygonPoint(event);
    else if (state.tool === "region" && controls.regionShape.value === "polygon") addRegionPoint(event);
    else startDrag(event);
  });
  previewCanvas.addEventListener("pointermove", continueDrag);
  previewCanvas.addEventListener("pointerleave", () => {
    state.pointer = null;
    requestRedraw();
  });
  previewCanvas.addEventListener("pointerup", finishDrag);
  previewCanvas.addEventListener("pointercancel", finishDrag);
  previewCanvas.addEventListener("dblclick", (event) => {
    event.preventDefault();
    if (state.tool === "polygon") finishPolygon();
    else if (state.tool === "region") finishRegion();
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault();
      redo();
    } else if (key === "enter" && state.tool === "polygon") {
      finishPolygon();
    } else if (key === "enter" && state.tool === "region") {
      finishRegion();
    } else if (key === "escape") {
      state.currentMark = null;
      state.polygonDraft = null;
      state.regionDraft = null;
      requestRedraw();
    }
  });
  window.addEventListener("resize", resizeCanvas);
}

function init() {
  loadSettings();
  updateLabels();
  syncXyPads();
  refreshPresetSelect();
  registerEvents();
  syncActiveButtons();
  setTool(state.tool);
  resizeCanvas();
}

init();

window.renderEdelInkPng = ({ width, height, lines, settings = {}, paperColor = { r: 249, g: 245, b: 240 }, inkColor = { r: 32, g: 32, b: 31 } }) => {
  Object.entries(settings).forEach(([key, value]) => {
    if (controls[key]) controls[key].value = String(value);
  });
  updateLabels();
  syncXyPads();
  state.viewWidth = Math.max(1, Math.round(width));
  state.viewHeight = Math.max(1, Math.round(height));
  state.pixelRatio = 1;
  [paperCanvas, inkCanvas, previewCanvas].forEach((layer) => {
    layer.width = state.viewWidth;
    layer.height = state.viewHeight;
  });
  [paperCtx, inkCtx, previewCtx].forEach((context) => context.setTransform(1, 0, 0, 1, 0, 0));
  PAPER = { ...paperColor };
  INK = { ...inkColor };
  paperFieldCache.clear();
  const style = getStyle();
  const seed = Number(settings.seed) || 2357;
  state.marks = lines.map((line, index) => ({
    type: "line",
    start: line.start,
    end: line.end,
    points: [],
    deposits: [],
    style,
    seed: seed + index * 997
  }));
  rebuildPaperTexture();
  rebuildInkLayer();
  const output = document.createElement("canvas");
  output.width = state.viewWidth;
  output.height = state.viewHeight;
  const outputCtx = output.getContext("2d", { alpha: false });
  outputCtx.drawImage(paperCanvas, 0, 0);
  outputCtx.drawImage(inkCanvas, 0, 0);
  return output.toDataURL("image/png");
};

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.type !== "hrifa-edel-render-ink") return;
  try {
    event.source?.postMessage({
      type: "hrifa-edel-rendered-ink",
      requestId: message.requestId,
      dataUrl: window.renderEdelInkPng(message.payload)
    }, "*");
  } catch (error) {
    event.source?.postMessage({
      type: "hrifa-edel-rendered-ink",
      requestId: message.requestId,
      error: error?.message || "Could not render the ink PNG."
    }, "*");
  }
});
