const canvas = document.querySelector("#polygon-canvas");
const context = canvas.getContext("2d");
const glowCanvas = document.querySelector("#crt-glow");
const glowContext = glowCanvas.getContext("2d");
const backgroundCanvas = document.createElement("canvas");
const backgroundContext = backgroundCanvas.getContext("2d");
const clock = document.querySelector("#clock");
const timezone = document.querySelector("#timezone");
const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const providerSelect = document.querySelector("#provider-select");
const modeSelect = document.querySelector("#mode-select");
const originModeSelect = document.querySelector("#origin-mode-select");
const collapseOffsetSelect = document.querySelector("#collapse-offset-select");
const activeLimitInput = document.querySelector("#active-limit");
const activeLimitValue = document.querySelector("#active-limit-value");
const performanceToggle = document.querySelector("#performance-toggle");
const performanceOverlay = document.querySelector("#performance-overlay");
const crtToggle = document.querySelector("#crt-toggle");
const animationDelayToggle = document.querySelector("#animation-delay-toggle");
const bookmarkTextSizeInput = document.querySelector("#bookmark-text-size");
const bookmarkTextSizeValue = document.querySelector("#bookmark-text-size-value");
const bookmarkFolderSelect = document.querySelector("#bookmark-folder-select");
const bookmarkLinks = document.querySelector("#bookmark-links");
const bookmarkFolderName = document.querySelector("#bookmark-folder-name");
const bookmarkListFrame = document.querySelector("#bookmark-list-frame");
const bookmarkList = document.querySelector("#bookmark-list");
const bookmarkScrollUp = document.querySelector("#bookmark-scroll-up");
const bookmarkScrollDown = document.querySelector("#bookmark-scroll-down");
const settingsPanel = document.querySelector("#settings-panel");

let points = [];
let nextPolygon = null;
let fadingPolygon = null;
let transitioningPolygon = null;
let fadeStartedAt = 0;
let activePolygons = [];
let collapseQueue = [];
let collapsingPolygon = null;
let animationMode = "background";
let pointGenerationMode = "current";
let activeLimit = 8;
let collapseOffsetEnabled = true;
let collapseCycleActive = false;
let collapseTriggerPending = false;
let pendingCollapseCount = 0;
let previousPolygonVertices = null;
let lastFrameTime = performance.now();
let dashedAccentCountdown = 20 + Math.floor(Math.random() * 16);
let dashedAccentPending = false;
let expansionHandoffTriggered = false;
let bookmarkItems = [];
let showPerformance = false;
let crtEnabled = true;
let delayAnimations = false;
let artworkStarted = false;
let performanceFrameCount = 0;
let performanceLastUpdate = performance.now();
let performanceLastFrameTime = 0;
let glowFrameCounter = 0;

const fadeDuration = 2200;
const growthDuration = 5.5;
const collapseDuration = 5.5;
const collapseThreshold = 0.8;
const collapsePhaseOffset = 2 / 3;
const expansionHandoffThreshold = 0.85;

function nextDashedAccentInterval() {
  // Average interval is about 27–28 polygons, with a range of 20–35.
  return 20 + Math.floor(Math.random() * 16);
}

const providers = {
  google: "https://www.google.com/search?q=",
  bing: "https://www.bing.com/search?q=",
  duckduckgo: "https://duckduckgo.com/?q=",
  brave: "https://search.brave.com/search?q=",
  ecosia: "https://www.ecosia.org/search?q="
};

function getSetting(key, fallback) {
  if (globalThis.chrome?.storage?.local) {
    return new Promise((resolve) => chrome.storage.local.get({ [key]: fallback }, (result) => resolve(result[key])));
  }
  return Promise.resolve(localStorage.getItem(key) || fallback);
}

function saveSetting(key, value) {
  if (globalThis.chrome?.storage?.local) chrome.storage.local.set({ [key]: value });
  else localStorage.setItem(key, value);
}

function bookmarkApiAvailable() {
  return Boolean(globalThis.chrome?.bookmarks?.getTree);
}

function getBookmarkTree() {
  return new Promise((resolve) => chrome.bookmarks.getTree(resolve));
}

function flattenBookmarkFolders(nodes, depth = 0, result = []) {
  nodes.forEach((node) => {
    if (!node.url && node.id !== "0") {
      result.push({ id: node.id, title: node.title || "Untitled folder", depth });
    }
    if (node.children) flattenBookmarkFolders(node.children, depth + 1, result);
  });
  return result;
}

async function renderBookmarkFolder(folderId) {
  if (!bookmarkApiAvailable() || !folderId) {
    bookmarkLinks.hidden = true;
    return;
  }
  const nodes = await new Promise((resolve) => chrome.bookmarks.getSubTree(folderId, resolve));
  const folder = nodes[0];
  if (!folder) return;
  const links = (folder.children || []).filter((node) => node.url);
  bookmarkItems = links;
  bookmarkFolderName.textContent = folder.title || "Bookmarks";
  renderBookmarkList();
  bookmarkLinks.hidden = links.length === 0;
  resetBookmarkScroll();
}

function renderBookmarkList() {
  bookmarkList.replaceChildren();
  bookmarkItems.forEach((bookmark) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = bookmark.url;
    link.textContent = bookmark.title || bookmark.url;
    link.title = bookmark.url;
    item.append(link);
    bookmarkList.append(item);
  });
  requestAnimationFrame(updateBookmarkScrollIndicators);
}

function updateBookmarkScrollIndicators() {
  if (!bookmarkListFrame) return;
  const maxScrollTop = Math.max(0, bookmarkListFrame.scrollHeight - bookmarkListFrame.clientHeight);
  bookmarkScrollUp.hidden = bookmarkListFrame.scrollTop <= 1;
  bookmarkScrollDown.hidden = bookmarkListFrame.scrollTop >= maxScrollTop - 1;
}

function resetBookmarkScroll() {
  if (!bookmarkListFrame) return;
  bookmarkListFrame.scrollTop = 0;
  requestAnimationFrame(updateBookmarkScrollIndicators);
}

function scrollBookmarks(direction) {
  if (!bookmarkListFrame) return;
  const amount = Math.max(48, Math.round(bookmarkListFrame.clientHeight * 0.6));
  bookmarkListFrame.scrollBy({ top: amount * direction, behavior: "smooth" });
}

async function loadBookmarkFolders() {
  if (!bookmarkApiAvailable()) return;
  const tree = await getBookmarkTree();
  const folders = flattenBookmarkFolders(tree);
  bookmarkFolderSelect.replaceChildren(new Option("None", ""));
  folders.forEach((folder) => {
    const option = new Option(`${"— ".repeat(Math.max(0, folder.depth - 1))}${folder.title}`, folder.id);
    bookmarkFolderSelect.append(option);
  });
  const savedFolder = await getSetting("bookmarkFolderId", "");
  const exists = folders.some((folder) => folder.id === savedFolder);
  bookmarkFolderSelect.value = exists ? savedFolder : "";
  renderBookmarkFolder(bookmarkFolderSelect.value);
}

function updatePerformanceOverlay(timestamp, deltaSeconds) {
  if (!showPerformance) return;
  performanceFrameCount += 1;
  if (timestamp - performanceLastUpdate < 500) return;
  const elapsed = timestamp - performanceLastUpdate;
  const fps = performanceFrameCount * 1000 / elapsed;
  performanceLastFrameTime = deltaSeconds * 1000;
  performanceOverlay.textContent = [
    `FPS       ${fps.toFixed(1)}`,
    `Frame     ${performanceLastFrameTime.toFixed(1)} ms`,
    `Canvas    ${canvas.width} × ${canvas.height}`,
    `Active    ${activePolygons.length}`,
    `Collapsing ${collapsingPolygon ? 1 : 0}  queued ${collapseQueue.length}`
  ].join("\n");
  performanceFrameCount = 0;
  performanceLastUpdate = timestamp;
}

function easeInOut(progress) {
  return progress * progress * (3 - 2 * progress);
}

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function randomDesaturatedColor() {
  const hue = Math.floor(Math.random() * 360);
  const saturation = 12 + Math.random() * 8;
  const lightness = 58 + Math.random() * 18;
  const chroma = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs(section % 2 - 1));
  const match = lightness / 100 - chroma / 2;
  let red = 0, green = 0, blue = 0;
  if (section < 1) [red, green, blue] = [chroma, secondary, 0];
  else if (section < 2) [red, green, blue] = [secondary, chroma, 0];
  else if (section < 3) [red, green, blue] = [0, chroma, secondary];
  else if (section < 4) [red, green, blue] = [0, secondary, chroma];
  else if (section < 5) [red, green, blue] = [secondary, 0, chroma];
  else [red, green, blue] = [chroma, 0, secondary];
  return {
    red: Math.round((red + match) * 255),
    green: Math.round((green + match) * 255),
    blue: Math.round((blue + match) * 255)
  };
}

function createHybridStyle() {
  const seed = Math.random() * 100000;
  const vertexCount = Math.floor(seededRandom(seed + 100) * 3);
  const segmentCount = Math.floor(seededRandom(seed + 101) * 3);
  const rankedIndices = (offset) => Array.from({ length: 8 }, (_, index) => index)
    .map((index) => ({ index, rank: seededRandom(seed + offset + index) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ index }) => index);
  const vertexIndices = rankedIndices(110).slice(0, vertexCount);
  const segmentIndices = rankedIndices(120).slice(0, segmentCount);
  return {
    fillOffsetX: (seededRandom(seed) - 0.5) * 20,
    fillOffsetY: (seededRandom(seed + 1) - 0.5) * 20,
    vertexOffsets: Array.from({ length: 8 }, (_, index) => ({
      x: vertexIndices.includes(index) ? (seededRandom(seed + index + 130) - 0.5) * 12 : 0,
      y: vertexIndices.includes(index) ? (seededRandom(seed + index + 140) - 0.5) * 12 : 0
    })),
    edges: Array.from({ length: 8 }, (_, index) => ({
      overshoot: segmentIndices.includes(index),
      start: 0.035 + seededRandom(seed + index + 10) * 0.06,
      end: 0.035 + seededRandom(seed + index + 20) * 0.06,
      drift: (seededRandom(seed + index + 30) - 0.5) * 5,
      alpha: 0.82 + seededRandom(seed + index + 40) * 0.18,
      width: 1.5 + seededRandom(seed + index + 50) * 0.9,
      graphiteX: (seededRandom(seed + index + 60) - 0.5) * 7,
      graphiteY: (seededRandom(seed + index + 70) - 0.5) * 7,
      graphiteWidth: 1.05 + seededRandom(seed + index + 80) * 0.45
    }))
  };
}

function cloneVertices(vertices) {
  const clone = vertices.map(({ x, y }) => ({ x, y }));
  clone.hybridStyle = vertices.hybridStyle || createHybridStyle();
  clone.fillColor = vertices.fillColor;
  clone.strokeDashed = vertices.strokeDashed || false;
  clone.dashPattern = vertices.dashPattern ? [...vertices.dashPattern] : null;
  clone.dashOffset = vertices.dashOffset || 0;
  return clone;
}

function updateClock() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absolute = Math.abs(offset);
  timezone.textContent = `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function resizeCanvas() {
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * scale);
  canvas.height = Math.floor(window.innerHeight * scale);
  // The glow does not need full-resolution detail. Rendering it at half
  // resolution makes the blur substantially cheaper while remaining soft.
  glowCanvas.width = Math.floor(canvas.width * 0.5);
  glowCanvas.height = Math.floor(canvas.height * 0.5);
  backgroundCanvas.width = canvas.width;
  backgroundCanvas.height = canvas.height;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  glowContext.setTransform(1, 0, 0, 1, 0, 0);
  backgroundContext.setTransform(scale, 0, 0, scale, 0, 0);
  resetArtwork();
}

function randomPoint(padding) {
  return {
    x: padding + Math.random() * Math.max(1, window.innerWidth - padding * 2),
    y: padding + Math.random() * Math.max(1, window.innerHeight - padding * 2)
  };
}

function randomNearbyPoint(origin, maxDistance, padding) {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * maxDistance;
  return {
    x: Math.min(window.innerWidth - padding, Math.max(padding, origin.x + Math.cos(angle) * distance)),
    y: Math.min(window.innerHeight - padding, Math.max(padding, origin.y + Math.sin(angle) * distance))
  };
}

function createPolygon(inheritedVertices = null) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const count = 3 + Math.floor(Math.random() * 6);
  const padding = Math.min(80, Math.max(24, Math.min(width, height) * 0.08));
  const clusterOrigin = randomPoint(padding);
  const inherited = inheritedVertices ? inheritedVertices.slice() : [];
  let selected = inherited;

  if (pointGenerationMode === "previous-points" && inherited.length) {
    const edgeStart = Math.floor(Math.random() * inherited.length);
    selected = [
      inherited[edgeStart],
      inherited[(edgeStart + 1) % inherited.length]
    ];
  } else if (inherited.length) {
    selected = inherited.slice(0, Math.min(3, count));
  }

  const polygonPoints = Array.from({ length: count }, (_, index) => {
    const inheritedPoint = pointGenerationMode === "previous-points" && selected.length
      ? selected[Math.floor(Math.random() * selected.length)]
      : selected[index];
    const start = inheritedPoint
      ? { x: inheritedPoint.x, y: inheritedPoint.y }
      : randomNearbyPoint(clusterOrigin, width / 16, padding);
    const target = randomNearbyPoint(start, width / 4, padding);
    return {
      x: start.x, y: start.y, startX: start.x, startY: start.y,
      targetX: target.x, targetY: target.y, elapsed: 0,
      duration: growthDuration * (0.95 + Math.random() * 0.1), arrived: false
    };
  });
  polygonPoints.hybridStyle = createHybridStyle();
  polygonPoints.fillColor = randomDesaturatedColor();
  return polygonPoints;
}

function initializePolygon() {
  points = nextPolygon || createPolygon(previousPolygonVertices);
  expansionHandoffTriggered = false;
  previousPolygonVertices = null;
  nextPolygon = createPolygon(points.map(({ targetX, targetY }) => ({ x: targetX, y: targetY })));
  if (dashedAccentPending) {
    nextPolygon.strokeDashed = true;
    nextPolygon.dashPattern = [2, 7 + Math.random() * 4];
    nextPolygon.dashOffset = Math.random() * 8;
    dashedAccentPending = false;
    dashedAccentCountdown = nextDashedAccentInterval();
  }
  drawScene();
}

function drawHybridFill(targetContext, vertices, opacity = 1, color = "rgba(180, 184, 192, 0.10)") {
  if (!vertices.length) return;
  const style = vertices.hybridStyle || (vertices.hybridStyle = createHybridStyle());
  targetContext.save();
  targetContext.globalAlpha = opacity;
  targetContext.beginPath();
  vertices.forEach((point, index) => {
    const x = point.x + style.fillOffsetX + (seededRandom(index + 71) - 0.5) * 10;
    const y = point.y + style.fillOffsetY + (seededRandom(index + 91) - 0.5) * 10;
    if (index === 0) targetContext.moveTo(x, y); else targetContext.lineTo(x, y);
  });
  targetContext.closePath();
  targetContext.fillStyle = color;
  targetContext.fill();
  targetContext.restore();
}

function drawHybridStroke(targetContext, vertices, color, opacity = 1, soften = false, blur = 0) {
  if (!vertices.length) return;
  const style = vertices.hybridStyle || (vertices.hybridStyle = createHybridStyle());
  targetContext.save();
  targetContext.strokeStyle = color;
  targetContext.lineCap = "round";
  targetContext.lineJoin = "round";
  targetContext.setLineDash(vertices.strokeDashed ? (vertices.dashPattern || [2, 8]) : []);
  targetContext.lineDashOffset = vertices.dashOffset || 0;
  targetContext.shadowColor = soften ? "rgba(170, 174, 182, 0.24)" : "transparent";
  targetContext.shadowBlur = blur;
  vertices.forEach((a, index) => {
    const b = vertices[(index + 1) % vertices.length];
    const edge = style.edges[index % style.edges.length];
    const aOffset = style.vertexOffsets[index];
    const nextIndex = (index + 1) % vertices.length;
    const bOffset = style.vertexOffsets[nextIndex];
    const ax = a.x + aOffset.x, ay = a.y + aOffset.y;
    const bx = b.x + bOffset.x, by = b.y + bOffset.y;
    const dx = bx - ax, dy = by - ay;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const startT = edge.overshoot ? -edge.start * 0.65 : 0;
    const endT = edge.overshoot ? 1 + edge.end * 0.65 : 1;
    const x1 = ax + dx * startT, y1 = ay + dy * startT;
    const x2 = ax + dx * endT, y2 = ay + dy * endT;
    const controlX = (x1 + x2) / 2 - (dy / length) * edge.drift;
    const controlY = (y1 + y2) / 2 + (dx / length) * edge.drift;
    // Plain single-pass stroke; graphite texture is temporarily disabled.
    targetContext.globalAlpha = opacity * edge.alpha * 0.82;
    targetContext.lineWidth = edge.width + (soften ? 0.35 : 0);
    targetContext.beginPath();
    targetContext.moveTo(x1, y1);
    targetContext.quadraticCurveTo(controlX, controlY, x2, y2);
    targetContext.stroke();
  });
  targetContext.restore();
}

function drawPath(targetContext, vertices, fill = false, soften = false, opacity = 1) {
  if (fill) drawHybridFill(targetContext, vertices, opacity);
  drawHybridStroke(targetContext, vertices, soften ? "rgba(170, 174, 182, 0.30)" : "rgba(170, 174, 182, 0.65)", opacity, soften, soften ? 50 : 0);
}

function drawEnteringPath(vertices, progress) {
  const dark = { red: 24, green: 25, blue: 28 };
  const bright = { red: 242, green: 238, blue: 230 };
  const muted = { red: 170, green: 174, blue: 182 };
  const phase = 0.55;
  const a = progress < phase ? dark : bright;
  const b = progress < phase ? bright : muted;
  const t = progress < phase ? progress / phase : (progress - phase) / (1 - phase);
  const red = Math.round(a.red + (b.red - a.red) * t);
  const green = Math.round(a.green + (b.green - a.green) * t);
  const blue = Math.round(a.blue + (b.blue - a.blue) * t);
  const opacity = progress < phase ? 0.05 + t * 0.65 : 0.70 - t * 0.05;
  drawHybridFill(context, vertices, progress);
  drawHybridStroke(context, vertices, `rgb(${red}, ${green}, ${blue})`, opacity);
}

function queueDashedAccentForNextPolygon() {
  dashedAccentCountdown -= 1;
  if (dashedAccentCountdown > 0) return;

  if (nextPolygon && nextPolygon.length >= 3) {
    nextPolygon.strokeDashed = true;
    nextPolygon.dashPattern = [2, 7 + Math.random() * 4];
    nextPolygon.dashOffset = Math.random() * 8;
    dashedAccentCountdown = nextDashedAccentInterval();
  } else {
    // A set boundary can briefly leave no cached polygon. Apply it as soon
    // as the next polygon is created, without tying the count to the reset.
    dashedAccentPending = true;
    dashedAccentCountdown = 20 + Math.floor(Math.random() * 16);
  }
}

function drawFadingPath(vertices, progress) {
  drawHybridFill(context, vertices, 1);
  drawHybridStroke(context, vertices, "rgba(170, 174, 182, 1)", 0.65 * (1 - progress));
  drawHybridStroke(context, vertices, "rgba(170, 174, 182, 1)", 0.30 * progress, true, 50);
}

function beginCollapseAnimation(polygon) {
  const center = polygon.vertices.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= polygon.vertices.length;
  center.y /= polygon.vertices.length;
  polygon.centroid = center;
  polygon.fillColor = randomDesaturatedColor();
  polygon.vertices.forEach((point) => {
    point.collapseStartX = point.x;
    point.collapseStartY = point.y;
    const dx = center.x - point.x, dy = center.y - point.y;
    const midX = (point.x + center.x) / 2, midY = (point.y + center.y) / 2;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const offset = (20 + Math.random() * 45) * (Math.random() < 0.5 ? -1 : 1);
    point.arcControlX = midX - (dy / length) * offset;
    point.arcControlY = midY + (dx / length) * offset;
    point.arcTargetX = point.x + dx * collapseThreshold;
    point.arcTargetY = point.y + dy * collapseThreshold;
    point.collapseElapsed = 0;
    point.collapsed = false;
  });
}

function updateCollapse(deltaSeconds) {
  if (!collapsingPolygon) return true;
  collapsingPolygon.vertices.forEach((point) => {
    if (point.collapsed) return;
    point.collapseElapsed += deltaSeconds;
    const raw = Math.min(point.collapseElapsed / collapseDuration, 1);
    const progress = easeInOut(raw);
    const inverse = 1 - progress;
    const startX = point.collapseStartX, startY = point.collapseStartY;
    point.x = inverse * inverse * startX + 2 * inverse * progress * point.arcControlX + progress * progress * point.arcTargetX;
    point.y = inverse * inverse * startY + 2 * inverse * progress * point.arcControlY + progress * progress * point.arcTargetY;
    if (raw >= 1) {
      point.x = point.arcTargetX;
      point.y = point.arcTargetY;
      point.collapsed = true;
    }
  });
  return collapsingPolygon.vertices.every((point) => point.collapsed);
}

function updateTransitioningPolygon(deltaSeconds, timestamp) {
  if (!transitioningPolygon) return;
  let arrived = true;
  transitioningPolygon.forEach((point) => {
    if (!point.arrived) {
      point.elapsed += deltaSeconds;
      const raw = Math.min(point.elapsed / point.duration, 1);
      const progress = easeInOut(raw);
      point.x = point.startX + (point.targetX - point.startX) * progress;
      point.y = point.startY + (point.targetY - point.startY) * progress;
      if (raw >= 1) {
        point.x = point.targetX;
        point.y = point.targetY;
        point.arrived = true;
      }
    }
    if (!point.arrived) arrived = false;
  });
  if (!arrived) return;

  if (animationMode === "background") {
    fadingPolygon = transitioningPolygon;
    fadeStartedAt = timestamp;
  }
  transitioningPolygon = null;
}

function drawCollapsingPath(targetContext, polygon) {
  const progress = Math.min(
    polygon.vertices.reduce((sum, point) => sum + Math.min(point.collapseElapsed / collapseDuration, 1), 0) /
      polygon.vertices.length,
    1
  );
  const fill = polygon.fillColor || randomDesaturatedColor();
  const grey = { red: 180, green: 184, blue: 192 };
  const fillRed = Math.round(grey.red + (fill.red - grey.red) * progress);
  const fillGreen = Math.round(grey.green + (fill.green - grey.green) * progress);
  const fillBlue = Math.round(grey.blue + (fill.blue - grey.blue) * progress);

  drawHybridFill(targetContext, polygon.vertices, 1, `rgba(${fillRed}, ${fillGreen}, ${fillBlue}, 0.10)`);
  drawHybridStroke(targetContext, polygon.vertices, "rgba(170, 174, 182, 1)", 0.70 - progress * 0.60, true, progress * 100);
}

function growthProgress() {
  return points.length ? points.reduce((sum, point) => sum + easeInOut(Math.min(point.elapsed / point.duration, 1)), 0) / points.length : 0;
}

function activateCached(progress = 0) {
  if (!nextPolygon) { initializePolygon(); return; }
  points = nextPolygon;
  expansionHandoffTriggered = false;
  points.forEach((point) => {
    point.elapsed = progress * point.duration;
    const eased = easeInOut(progress);
    point.x = point.startX + (point.targetX - point.startX) * eased;
    point.y = point.startY + (point.targetY - point.startY) * eased;
    point.arrived = false;
  });
  nextPolygon = createPolygon(points.map(({ targetX, targetY }) => ({ x: targetX, y: targetY })));
}

function startNextCollapse() {
  if (collapsingPolygon || pendingCollapseCount <= 0 || !collapseQueue.length) return;
  collapsingPolygon = collapseQueue.shift();
  pendingCollapseCount -= 1;
  beginCollapseAnimation(collapsingPolygon);
}

function startNextGeneration() {
  collapseQueue.push(...activePolygons);
  activePolygons = [];
  collapseCycleActive = true;
  previousPolygonVertices = null;
  nextPolygon = null;
  points = [];
  initializePolygon();
  pendingCollapseCount += 1;
  collapseTriggerPending = collapseOffsetEnabled;
  if (!collapseOffsetEnabled) startNextCollapse();
}

function drawScene() {
  context.clearRect(0, 0, window.innerWidth, window.innerHeight);
  context.drawImage(backgroundCanvas, 0, 0, window.innerWidth, window.innerHeight);
  if (collapsingPolygon) drawCollapsingPath(context, collapsingPolygon);
  collapseQueue.forEach((polygon) => drawPath(context, polygon.vertices, true, false));
  activePolygons.forEach((polygon) => drawPath(context, polygon.vertices, true, false));
  if (points.length) {
    drawEnteringPath(points, growthProgress());
  }
  if (transitioningPolygon && animationMode === "background") {
    const progress = transitioningPolygon.reduce(
      (sum, point) => sum + Math.min(point.elapsed / point.duration, 1), 0
    ) / transitioningPolygon.length;
    drawEnteringPath(transitioningPolygon, progress);
  }
  if (fadingPolygon) drawFadingPath(fadingPolygon, Math.min((performance.now() - fadeStartedAt) / fadeDuration, 1));

  if (crtEnabled) {
    // The glow is intentionally refreshed at about 20 FPS. Its blur makes
    // the lower refresh rate unobtrusive while avoiding a costly blur every
    // animation frame.
    glowFrameCounter += 1;
    if (glowFrameCounter % 3 === 0) {
      glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
      glowContext.save();
      glowContext.globalAlpha = 1;
      glowContext.filter = "blur(8px)";
      glowContext.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
      glowContext.restore();
    }
  }
}

function updatePoints(deltaSeconds) {
  let arrived = true;
  points.forEach((point) => {
    if (!point.arrived) {
      point.elapsed += deltaSeconds;
      const raw = Math.min(point.elapsed / point.duration, 1);
      const progress = easeInOut(raw);
      point.x = point.startX + (point.targetX - point.startX) * progress;
      point.y = point.startY + (point.targetY - point.startY) * progress;
      if (raw >= 1) { point.x = point.targetX; point.y = point.targetY; point.arrived = true; }
    }
    if (!point.arrived) arrived = false;
  });
  return arrived;
}

function completeGrowth(timestamp) {
  const completed = points;
  previousPolygonVertices = cloneVertices(points);
  queueDashedAccentForNextPolygon();
  transitioningPolygon = completed;
  if (animationMode === "active") {
    activePolygons.push({ vertices: completed, fillColor: points.fillColor });
    if (activePolygons.length >= activeLimit) startNextGeneration();
    else {
      if (collapseCycleActive) { pendingCollapseCount += 1; collapseTriggerPending = true; }
      activateCached(0);
    }
  } else {
    activateCached(0);
  }
}

function animate(timestamp) {
  const delta = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
  lastFrameTime = timestamp;
  updatePerformanceOverlay(timestamp, delta);
  if (fadingPolygon && timestamp - fadeStartedAt >= fadeDuration) {
    drawPath(backgroundContext, fadingPolygon, true, true);
    fadingPolygon = null;
  }
  updateTransitioningPolygon(delta, timestamp);
  const arrived = points.length ? updatePoints(delta) : false;
  if (points.length && !expansionHandoffTriggered && (growthProgress() >= expansionHandoffThreshold || arrived)) {
    expansionHandoffTriggered = true;
    completeGrowth(timestamp);
  }
  if (collapseTriggerPending && growthProgress() >= collapsePhaseOffset) {
    collapseTriggerPending = false;
    startNextCollapse();
  }
  if (collapsingPolygon && updateCollapse(delta)) {
    drawCollapsingPath(backgroundContext, collapsingPolygon);
    collapsingPolygon = null;
    startNextCollapse();
  }
  drawScene();
  requestAnimationFrame(animate);
}

function resetArtwork() {
  if (!artworkStarted) return;
  backgroundContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
  points = [];
  nextPolygon = null;
  fadingPolygon = null;
  transitioningPolygon = null;
  activePolygons = [];
  collapseQueue = [];
  collapsingPolygon = null;
  collapseCycleActive = false;
  collapseTriggerPending = false;
  pendingCollapseCount = 0;
  previousPolygonVertices = null;
  initializePolygon();
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  const provider = await getSetting("searchProvider", "google");
  window.location.href = providers[provider] + encodeURIComponent(query);
});

document.querySelector("#settings-button").addEventListener("click", () => {
  settingsPanel.classList.add("is-open");
  settingsPanel.setAttribute("aria-hidden", "false");
  providerSelect.focus();
});
document.querySelector("#close-settings").addEventListener("click", closeSettings);
settingsPanel.addEventListener("click", (event) => { if (event.target === settingsPanel) closeSettings(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSettings(); });
function closeSettings() { settingsPanel.classList.remove("is-open"); settingsPanel.setAttribute("aria-hidden", "true"); searchInput.focus(); }

function focusSearchInput() {
  if (!settingsPanel.classList.contains("is-open")) searchInput.focus();
}

function startArtwork() {
  if (artworkStarted) return;
  artworkStarted = true;
  resizeCanvas();
  requestAnimationFrame(animate);
}

function scheduleArtworkStart() {
  if (delayAnimations) setTimeout(startArtwork, 10000);
  else requestAnimationFrame(startArtwork);
}

providerSelect.addEventListener("change", () => saveSetting("searchProvider", providerSelect.value));
modeSelect.addEventListener("change", () => { animationMode = modeSelect.value; saveSetting("animationMode", animationMode); resetArtwork(); });
originModeSelect.addEventListener("change", () => { pointGenerationMode = originModeSelect.value; saveSetting("pointGenerationMode", pointGenerationMode); resetArtwork(); });
collapseOffsetSelect.addEventListener("change", () => {
  collapseOffsetEnabled = collapseOffsetSelect.value === "offset";
  saveSetting("collapseOffsetEnabled", collapseOffsetEnabled);
  resetArtwork();
});
activeLimitInput.addEventListener("input", () => { activeLimit = Number(activeLimitInput.value); activeLimitValue.textContent = activeLimit; saveSetting("activeLimit", activeLimit); });
performanceToggle.addEventListener("change", () => {
  showPerformance = performanceToggle.checked;
  performanceOverlay.classList.toggle("performance-visible", showPerformance);
  saveSetting("showPerformance", showPerformance);
});
crtToggle.addEventListener("change", () => {
  const enabled = crtToggle.checked;
  crtEnabled = enabled;
  document.body.classList.toggle("crt-disabled", !enabled);
  saveSetting("crtEnabled", enabled);
});
animationDelayToggle.addEventListener("change", () => {
  delayAnimations = animationDelayToggle.checked;
  saveSetting("delayAnimations", delayAnimations);
});
bookmarkTextSizeInput.addEventListener("input", () => {
  const size = Number(bookmarkTextSizeInput.value);
  document.documentElement.style.setProperty("--bookmark-text-size", `${size}px`);
  bookmarkTextSizeValue.textContent = `${size}px`;
  saveSetting("bookmarkTextSize", size);
  requestAnimationFrame(updateBookmarkScrollIndicators);
});
bookmarkFolderSelect.addEventListener("change", () => {
  saveSetting("bookmarkFolderId", bookmarkFolderSelect.value);
  renderBookmarkFolder(bookmarkFolderSelect.value);
});
bookmarkListFrame.addEventListener("scroll", updateBookmarkScrollIndicators);
bookmarkListFrame.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp") {
    event.preventDefault();
    scrollBookmarks(-1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    scrollBookmarks(1);
  }
});
bookmarkScrollUp.addEventListener("click", () => scrollBookmarks(-1));
bookmarkScrollDown.addEventListener("click", () => scrollBookmarks(1));

getSetting("searchProvider", "google").then((value) => { providerSelect.value = providers[value] ? value : "google"; });
getSetting("animationMode", "background").then((value) => { animationMode = value === "active" ? "active" : "background"; modeSelect.value = animationMode; });
getSetting("pointGenerationMode", "current").then((value) => {
  pointGenerationMode = value === "previous-points" ? value : "current";
  originModeSelect.value = pointGenerationMode;
  // The first artwork can be initialized before storage resolves. Rebuild it
  // once so the first set's precomputed polygon follows the selected mode.
  if (artworkStarted) resetArtwork();
});
getSetting("collapseOffsetEnabled", true).then((value) => {
  collapseOffsetEnabled = value !== false && value !== "false";
  collapseOffsetSelect.value = collapseOffsetEnabled ? "offset" : "immediate";
});
getSetting("activeLimit", 8).then((value) => { activeLimit = Math.min(25, Math.max(3, Number(value) || 8)); activeLimitInput.value = activeLimit; activeLimitValue.textContent = activeLimit; });
getSetting("bookmarkTextSize", 13).then((value) => {
  const size = Math.min(24, Math.max(10, Number(value) || 13));
  bookmarkTextSizeInput.value = size;
  bookmarkTextSizeValue.textContent = `${size}px`;
  document.documentElement.style.setProperty("--bookmark-text-size", `${size}px`);
});
getSetting("showPerformance", false).then((value) => {
  showPerformance = value === true || value === "true";
  performanceToggle.checked = showPerformance;
  performanceOverlay.classList.toggle("performance-visible", showPerformance);
});
getSetting("crtEnabled", true).then((value) => {
  const enabled = value !== false && value !== "false";
  crtEnabled = enabled;
  crtToggle.checked = enabled;
  document.body.classList.toggle("crt-disabled", !enabled);
});
loadBookmarkFolders();
if (globalThis.chrome?.bookmarks) {
  chrome.bookmarks.onCreated.addListener(loadBookmarkFolders);
  chrome.bookmarks.onRemoved.addListener(loadBookmarkFolders);
  chrome.bookmarks.onChanged.addListener(loadBookmarkFolders);
  chrome.bookmarks.onMoved.addListener(loadBookmarkFolders);
}

updateClock();
setInterval(updateClock, 1000);
window.addEventListener("resize", () => {
  if (artworkStarted) resizeCanvas();
  updateBookmarkScrollIndicators();
});
// Give the search UI first opportunity to receive focus before starting the
// canvas setup and animation work.
focusSearchInput();
window.addEventListener("load", () => setTimeout(focusSearchInput, 0), { once: true });
getSetting("delayAnimations", false).then((value) => {
  delayAnimations = value === true || value === "true";
  animationDelayToggle.checked = delayAnimations;
  scheduleArtworkStart();
});
