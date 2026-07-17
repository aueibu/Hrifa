const canvas = document.getElementById('inkCanvas');
const ctx = canvas.getContext('2d');

const toolButtons = Array.from(document.querySelectorAll('.tool-btn'));
const controls = {
  width: document.getElementById('width'),
  density: document.getElementById('density'),
  jitter: document.getElementById('jitter'),
  drift: document.getElementById('drift'),
  feather: document.getElementById('feather'),
  pooling: document.getElementById('pooling'),
  dryness: document.getElementById('dryness'),
  texture: document.getElementById('texture'),
  smoothing: document.getElementById('smoothing'),
  seed: document.getElementById('seed')
};
const labels = {
  width: document.getElementById('widthValue'),
  density: document.getElementById('densityValue'),
  jitter: document.getElementById('jitterValue'),
  drift: document.getElementById('driftValue'),
  feather: document.getElementById('featherValue'),
  pooling: document.getElementById('poolingValue'),
  dryness: document.getElementById('drynessValue'),
  texture: document.getElementById('textureValue'),
  smoothing: document.getElementById('smoothingValue')
};
const randomSeedBtn = document.getElementById('randomSeed');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearBtn = document.getElementById('clearBtn');
const exportPngBtn = document.getElementById('exportPngBtn');
const exportSvgBtn = document.getElementById('exportSvgBtn');

const getPerfectStroke = (() => {
  if (window.perfectFreehand) return window.perfectFreehand.getStroke || window.perfectFreehand.default || window.perfectFreehand;
  if (window.PerfectFreehand) return window.PerfectFreehand.getStroke || window.PerfectFreehand.default || window.PerfectFreehand;
  return null;
})();

const state = {
  tool: 'freehand',
  isDrawing: false,
  currentMark: null,
  marks: [],
  history: [],
  redoStack: []
};

let roughCanvas = null;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function setCanvasSize() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1280, rect.width) * ratio;
  const height = Math.max(760, rect.height) * ratio;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (window.paper) {
    paper.setup(canvas);
    paper.view.viewSize = new paper.Size(canvas.width, canvas.height);
  }
  roughCanvas = window.rough ? rough.canvas(canvas) : null;
  redraw();
}

function noiseSeeded(x, y, seed) {
  if (window.SimplexNoise) {
    const noise = new window.SimplexNoise(seed);
    return noise.noise2D(x, y);
  }
  return Math.sin(x * 12.9898 + y * 78.233 + seed * 0.1) * 0.5;
}

function updateLabels() {
  Object.entries(labels).forEach(([key, label]) => {
    const input = controls[key];
    if (!input || !label) return;
    label.textContent = input.type === 'range' ? Number(input.value).toFixed(2) : input.value;
  });
}

function getStyle() {
  return {
    width: Number(controls.width.value),
    density: Number(controls.density.value),
    jitter: Number(controls.jitter.value),
    drift: Number(controls.drift.value),
    feather: Number(controls.feather.value),
    pooling: Number(controls.pooling.value),
    dryness: Number(controls.dryness.value),
    texture: Number(controls.texture.value),
    smoothing: Number(controls.smoothing.value),
    seed: Number(controls.seed.value)
  };
}

function pushHistory() {
  state.history.push(JSON.stringify(state.marks));
  if (state.history.length > 40) state.history.shift();
  state.redoStack.length = 0;
}

function undo() {
  if (!state.history.length) return;
  state.redoStack.push(JSON.stringify(state.marks));
  state.marks = JSON.parse(state.history.pop());
  redraw();
}

function redo() {
  if (!state.redoStack.length) return;
  state.history.push(JSON.stringify(state.marks));
  state.marks = JSON.parse(state.redoStack.pop());
  redraw();
}

function clearCanvas() {
  state.marks = [];
  state.history = [];
  state.redoStack = [];
  redraw();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  return {
    x: ((event.clientX - rect.left) / rect.width) * (canvas.width / ratio),
    y: ((event.clientY - rect.top) / rect.height) * (canvas.height / ratio)
  };
}

function sampleShape(type, start, end) {
  if (window.paper) {
    const startPt = new paper.Point(start.x, start.y);
    const endPt = new paper.Point(end.x, end.y);
    let path;

    if (type === 'line') {
      path = new paper.Path.Line(startPt, endPt);
    } else if (type === 'rect') {
      path = new paper.Path.Rectangle(new paper.Rectangle(startPt, endPt));
    } else if (type === 'ellipse') {
      const center = new paper.Point((start.x + end.x) / 2, (start.y + end.y) / 2);
      const radius = new paper.Size(Math.abs((end.x - start.x) / 2), Math.abs((end.y - start.y) / 2));
      path = new paper.Path.Ellipse({ center, radius });
    } else if (type === 'arc') {
      const mid = new paper.Point((start.x + end.x) / 2, Math.min(start.y, end.y) - dist(start, end) * 0.25);
      path = new paper.Path.Arc(startPt, mid, endPt);
    } else if (type === 'polygon') {
      const center = new paper.Point((start.x + end.x) / 2, (start.y + end.y) / 2);
      const radius = dist(start, end) / 2;
      path = new paper.Path.RegularPolygon(center, 6, radius);
    } else {
      path = new paper.Path.Line(startPt, endPt);
    }

    const points = path.segments.map((segment) => ({ x: segment.point.x, y: segment.point.y }));
    path.remove();
    return points;
  }

  return [start, end];
}

function createPathD(points, closed = false) {
  if (!window.d3 || !points.length) return '';
  const lineGenerator = d3.line()
    .curve(closed ? d3.curveBasisClosed : d3.curveBasis)
    .x((p) => p.x)
    .y((p) => p.y);
  return lineGenerator(points) || '';
}

function drawInkDot(x, y, radius, alpha) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(24, 20, 16, ${alpha})`);
  gradient.addColorStop(1, `rgba(24, 20, 16, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function renderInkStroke(points, style) {
  if (!points || points.length < 2) return;
  const simplex = new window.SimplexNoise(style.seed || 1);
  const baseRadius = Math.max(1, style.width * 0.34);

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const segment = dist(a, b);
    const steps = Math.max(3, Math.ceil(segment / 4));

    for (let j = 0; j <= steps; j += 1) {
      const t = j / Math.max(steps, 1);
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      const jitter = simplex.noise2D(x * 0.02, y * 0.02) * style.jitter * 6;
      const drift = simplex.noise2D(x * 0.03 + 12, y * 0.03 + 24) * style.drift * 8;
      const px = x + jitter + drift * (t - 0.5);
      const py = y + jitter - drift * (t - 0.5);
      const alpha = style.density * (0.26 + 0.2 * (1 - Math.abs(t - 0.5))) * (1 - style.dryness * 0.3);
      const radius = baseRadius * (0.75 + style.pooling * 0.25 + Math.abs(simplex.noise2D(t * 7, style.seed * 0.3)) * 0.15);

      if (Math.random() > style.dryness * 0.6) {
        drawInkDot(px, py, radius, alpha);
      }
      if (Math.random() > 0.72) {
        drawInkDot(px + simplex.noise2D(t * 9, style.seed * 0.4) * style.feather * 2,
          py + simplex.noise2D(t * 11, style.seed * 0.2) * style.feather * 2,
          radius * 0.55,
          alpha * 0.4);
      }
    }
  }
}

function renderFreehand(mark) {
  const style = mark.style;
  const rawPoints = mark.points;
  const generator = getPerfectStroke;

  if (generator && rawPoints.length > 1) {
    const coords = rawPoints.map((p) => [p.x, p.y]);
    const stroke = generator(coords, {
      size: style.width * 1.2,
      thinning: 0.4,
      smoothing: style.smoothing * 0.8,
      streamline: 0.4,
      taperStart: style.pooling * 0.25,
      taperEnd: style.pooling * 0.25,
      last: true
    });

    if (stroke && stroke.length) {
      const shape = stroke.map(([x, y]) => ({ x, y }));
      const pathD = createPathD(shape, true);
      if (roughCanvas && pathD) {
        roughCanvas.path(pathD, {
          stroke: '#211c16',
          strokeWidth: Math.max(1, style.width * 0.7),
          roughness: 1.5 + style.jitter,
          bowing: 0.4 + style.drift,
          fill: `rgba(24, 20, 16, ${Math.min(0.14, style.density * 0.35)})`,
          fillStyle: 'solid',
          curveFitting: 0.6,
          simplifyThreshold: 0.5
        });
      }
    }
  }
  renderInkStroke(rawPoints, style);
}

function renderShape(mark, preview = false) {
  const style = mark.style;
  const points = sampleShape(mark.type, mark.start, mark.end);
  if (points.length < 2) return;
  const closed = mark.type !== 'line' && mark.type !== 'arc';
  const pathD = createPathD(points, closed);

  if (roughCanvas && pathD) {
    roughCanvas.path(pathD, {
      stroke: '#211c16',
      strokeWidth: Math.max(1, style.width * 0.9),
      roughness: 1.2 + style.jitter,
      bowing: 0.5 + style.drift,
      fill: closed ? `rgba(24, 20, 16, ${Math.min(0.1, style.density * 0.2)})` : 'transparent',
      fillStyle: 'solid',
      curveFitting: 0.6,
      simplifyThreshold: 0.5
    });
  }

  renderInkStroke(points, style);

  if (preview) {
    ctx.save();
    ctx.strokeStyle = 'rgba(25, 20, 17, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    points.forEach((pt, index) => {
      if (index === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

function drawMark(mark, preview = false) {
  if (mark.type === 'freehand') {
    renderFreehand(mark);
  } else {
    renderShape(mark, preview);
  }
}

function redraw() {
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f7f3e5';
  ctx.fillRect(0, 0, width, height);
  state.marks.forEach((mark) => drawMark(mark));
  if (state.currentMark) drawMark(state.currentMark, true);
}

function startDrawing(event) {
  const point = getCanvasPoint(event);
  state.isDrawing = true;
  state.currentMark = {
    type: state.tool,
    start: point,
    end: point,
    points: state.tool === 'freehand' ? [point] : [],
    style: getStyle(),
    seed: Number(controls.seed.value)
  };
}

function continueDrawing(event) {
  if (!state.isDrawing || !state.currentMark) return;
  const point = getCanvasPoint(event);
  state.currentMark.end = point;
  if (state.tool === 'freehand') {
    const last = state.currentMark.points[state.currentMark.points.length - 1];
    if (!last || dist(last, point) > 4) state.currentMark.points.push(point);
  }
  redraw();
}

function finishDrawing(event) {
  if (!state.isDrawing || !state.currentMark) return;
  const point = getCanvasPoint(event);
  state.currentMark.end = point;
  if (state.tool === 'freehand') state.currentMark.points.push(point);
  state.currentMark.style = getStyle();
  state.currentMark.seed = Number(controls.seed.value);
  if (state.tool !== 'eraser') state.marks.push(state.currentMark);
  else state.marks = [];
  pushHistory();
  state.currentMark = null;
  state.isDrawing = false;
  redraw();
}

function exportSvg() {
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#f7f3e5"/>`];
  state.marks.forEach((mark) => {
    if (mark.type === 'freehand') {
      const path = mark.points.map((pt, index) => `${index === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
      svg.push(`<path d="${path}" fill="none" stroke="#211c16" stroke-width="${mark.style.width}" opacity="${mark.style.density}" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else {
      const points = sampleShape(mark.type, mark.start, mark.end);
      const path = createPathD(points, mark.type !== 'line' && mark.type !== 'arc');
      if (path) {
        svg.push(`<path d="${path}" fill="none" stroke="#211c16" stroke-width="${mark.style.width}" opacity="${mark.style.density}" stroke-linecap="round" stroke-linejoin="round"/>`);
      }
    }
  });
  svg.push('</svg>');
  const blob = new Blob([svg.join('\n')], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'inkline-export.svg';
  link.click();
  URL.revokeObjectURL(url);
}

function registerEvents() {
  toolButtons.forEach((button) => {
    button.addEventListener('click', () => {
      toolButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      state.tool = button.dataset.tool;
    });
  });
  Object.values(controls).forEach((input) => input.addEventListener('input', updateLabels));
  randomSeedBtn.addEventListener('click', () => {
    controls.seed.value = String(Math.floor(Math.random() * 9000 + 1000));
    updateLabels();
  });
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  clearBtn.addEventListener('click', clearCanvas);
  exportPngBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'inkline-export.png';
    link.click();
  });
  exportSvgBtn.addEventListener('click', exportSvg);
  canvas.addEventListener('pointerdown', (event) => {
    if (state.tool === 'eraser') {
      clearCanvas();
      return;
    }
    startDrawing(event);
  });
  canvas.addEventListener('pointermove', continueDrawing);
  canvas.addEventListener('pointerup', finishDrawing);
  canvas.addEventListener('pointerleave', finishDrawing);
}

function init() {
  setCanvasSize();
  updateLabels();
  registerEvents();
  redraw();
}

window.addEventListener('resize', setCanvasSize);
init();
