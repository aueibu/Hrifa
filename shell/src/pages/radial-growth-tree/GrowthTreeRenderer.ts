import type { GrowthTreeStyle } from '../../theme/diagram';
import { type GrowthParams, type GrowthResult, runAlgorithm, torDelta } from './growthEngine';
import type { FieldPoint } from './pointPlacement';

/**
 * 2D torus view + interaction for the Radial Growth Tree. Owns the canvas, the
 * current origin, pan/zoom, hover, and ctrl-click origin selection; runs the
 * growth engine and draws the full z-ordered scene. All colors come from the
 * shell theme via the injected `style()` resolver. Hover text and readout data
 * flow to React through callbacks so the page owns the DOM presentation.
 */

export interface HoverInfo {
  clientX: number;
  clientY: number;
  isOrigin: boolean;
  gridX: number;
  gridY: number;
  dx: number;
  dy: number;
  dist: number;
  generation: number | null;
  role: string | null;
  searchRadius: number | null;
  radiusO: number | null;
  radiusP: number | null;
}

export interface ReadoutInfo {
  result: GrowthResult;
  pointCount: number;
}

interface Callbacks {
  onReadout: (info: ReadoutInfo | null) => void;
  onHover: (info: HoverInfo | null) => void;
}

const VIEW_ZOOM_MIN = 0.15;
const VIEW_ZOOM_MAX = 30;
const MAX_TILE_RADIUS = 4;
const DRAG_THRESHOLD_PX = 4;
const HOVER_RADIUS_PX = 10;

interface Transform {
  A: FieldPoint;
  scale: number;
  cx: number;
  cy: number;
}

export class GrowthTreeRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private points: FieldPoint[] = [];
  private n = 32;
  private originIdx = 0;
  private params: GrowthParams | null = null;
  private helpersOn = true;
  private gridOn = false;

  private viewZoom = 1;
  private viewPanX = 0;
  private viewPanY = 0;

  private lastResult: GrowthResult | null = null;
  private lastTransform: Transform | null = null;

  private isDragging = false;
  private justDragged = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPanX = 0;
  private dragStartPanY = 0;

  private hoverOverlay: {
    screenX: number;
    screenY: number;
    scale: number;
    radiusO: number;
    radiusP: number;
  } | null = null;
  /** The hovered cell, so its periodic torus images can be highlighted. */
  private hoveredAbs: FieldPoint | null = null;
  private hoverRAF: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: () => GrowthTreeStyle,
    private readonly callbacks: Callbacks
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D rendering is unavailable.');
    }
    this.ctx = ctx;

    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(canvas);

    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mousemove', this.onWindowMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('mousemove', this.onHoverMove);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  /**
   * Match the drawing buffer to the canvas's current display size. Called at the
   * start of every draw (as PointConstructionEngine does), so the buffer always
   * tracks layout regardless of ResizeObserver timing. Setting width/height
   * clears the canvas, so it only runs when the size actually changed.
   */
  private syncSize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round((this.canvas.clientWidth || 0) * dpr);
    const h = Math.round((this.canvas.clientHeight || 0) * dpr);
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  setField(points: FieldPoint[], n: number) {
    // Preserve the origin's lattice cell across rebuilds when it still exists,
    // so sweeping a point-source control (e.g. iterations) doesn't relocate A.
    // A fresh random origin is chosen only when that cell is gone or the field
    // was empty; "Reroll origin" is the explicit way to move it.
    const prev = this.points[this.originIdx];
    this.points = points;
    this.n = n;
    const preserved = prev ? points.findIndex((p) => p.x === prev.x && p.y === prev.y) : -1;
    if (preserved >= 0) {
      this.originIdx = preserved;
    } else {
      this.originIdx = points.length ? Math.floor(Math.random() * points.length) : 0;
    }
    this.render();
  }

  setParams(params: GrowthParams, helpers: boolean, grid: boolean) {
    this.params = params;
    this.helpersOn = helpers;
    this.gridOn = grid;
    this.render();
  }

  rerollOrigin() {
    this.originIdx = this.points.length ? Math.floor(Math.random() * this.points.length) : 0;
    // Reroll resets the view (unlike ctrl-click, which preserves the camera).
    this.viewZoom = 1;
    this.viewPanX = 0;
    this.viewPanY = 0;
    this.render();
  }

  resetView() {
    this.viewZoom = 1;
    this.viewPanX = 0;
    this.viewPanY = 0;
    if (this.lastResult) {
      this.draw(this.lastResult);
    }
  }

  /** Redraw with a freshly-resolved theme (color-scheme change). */
  restyle() {
    if (this.lastResult) {
      this.draw(this.lastResult);
    }
  }

  private render() {
    if (!this.params || !this.points.length) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.lastResult = null;
      this.lastTransform = null;
      this.callbacks.onReadout(null);
      return;
    }
    const result = runAlgorithm(this.points, this.n, this.originIdx, this.params);
    this.lastResult = result;
    this.draw(result);
    this.callbacks.onReadout({ result, pointCount: this.points.length });
  }

  private draw(result: GrowthResult) {
    const {
      A,
      others,
      radiusO,
      radiusP,
      radiusQ,
      searchRadius,
      children,
      segments,
      endpoints,
      truncatedPoints,
      branchPoints,
      n: gridN,
    } = result;
    this.syncSize();
    const ctx = this.ctx;
    const S = this.style();
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // fit view: symmetric bounds around origin, before user pan/zoom
    let maxAbs = radiusQ;
    for (const p of others) {
      maxAbs = Math.max(maxAbs, Math.abs(p.rel.x), Math.abs(p.rel.y));
    }
    for (const s of segments) {
      maxAbs = Math.max(maxAbs, Math.abs(s.to.x), Math.abs(s.to.y));
    }
    maxAbs *= 1.15;
    const baseScale = Math.min(W, H) / (2 * maxAbs);
    const scale = baseScale * this.viewZoom;
    const cx = W / 2 + this.viewPanX;
    const cy = H / 2 + this.viewPanY;
    const tx = (x: number) => cx + x * scale;
    const ty = (y: number) => cy + y * scale;
    this.lastTransform = { A, scale, cx, cy };

    const worldMinX = (0 - cx) / scale;
    const worldMaxX = (W - cx) / scale;
    const worldMinY = (0 - cy) / scale;
    const worldMaxY = (H - cy) / scale;
    const viewCornerReach = Math.max(
      Math.abs(worldMinX),
      Math.abs(worldMaxX),
      Math.abs(worldMinY),
      Math.abs(worldMaxY)
    );

    // optional unit lattice: one faint line per grid cell across the visible
    // extent (lattice lines sit at integer world coords since A is a lattice
    // cell). Capped so a zoomed-out view can't flood the canvas with lines.
    if (this.gridOn && worldMaxX - worldMinX <= 400 && worldMaxY - worldMinY <= 400) {
      ctx.save();
      ctx.strokeStyle = S.muted;
      ctx.globalAlpha = S.base.grid.opacity;
      ctx.lineWidth = S.base.grid.lineWidth;
      for (let gx = Math.ceil(worldMinX); gx <= worldMaxX; gx++) {
        ctx.beginPath();
        ctx.moveTo(tx(gx), 0);
        ctx.lineTo(tx(gx), H);
        ctx.stroke();
      }
      for (let gy = Math.ceil(worldMinY); gy <= worldMaxY; gy++) {
        ctx.beginPath();
        ctx.moveTo(0, ty(gy));
        ctx.lineTo(W, ty(gy));
        ctx.stroke();
      }
      ctx.restore();
    }

    // torus seam guide lines (tile boundaries every N — stronger than the grid)
    if (this.params!.wrap && this.helpers) {
      ctx.save();
      ctx.strokeStyle = S.seam;
      ctx.globalAlpha = S.seamOpacity;
      ctx.lineWidth = 1;
      ctx.setLineDash(S.base.guide.dash);
      let seamX0 = -(((A.x % gridN) + gridN) % gridN);
      seamX0 -= gridN * Math.ceil((seamX0 - worldMinX) / gridN);
      for (let sx = seamX0; sx <= worldMaxX; sx += gridN) {
        ctx.beginPath();
        ctx.moveTo(tx(sx), 0);
        ctx.lineTo(tx(sx), H);
        ctx.stroke();
      }
      let seamY0 = -(((A.y % gridN) + gridN) % gridN);
      seamY0 -= gridN * Math.ceil((seamY0 - worldMinY) / gridN);
      for (let sy = seamY0; sy <= worldMaxY; sy += gridN) {
        ctx.beginPath();
        ctx.moveTo(0, ty(sy));
        ctx.lineTo(W, ty(sy));
        ctx.stroke();
      }
      ctx.restore();
    }

    // points the tree has touched (by object identity), for hollow-ring rendering
    const usedAbs = new Set<FieldPoint>();
    for (const s of segments) {
      usedAbs.add(s.fromAbs);
      usedAbs.add(s.toAbs);
    }
    for (const e of endpoints) {
      usedAbs.add(e.abs);
    }
    for (const t of truncatedPoints) {
      if (t.abs) {
        usedAbs.add(t.abs);
      }
    }

    const tileRadius = Math.min(MAX_TILE_RADIUS, Math.ceil(viewCornerReach / gridN) + 1);
    for (const p of others) {
      const isUsed = usedAbs.has(p.abs);
      for (let k = -tileRadius; k <= tileRadius; k++) {
        for (let m = -tileRadius; m <= tileRadius; m++) {
          const px = p.rel.x + k * gridN;
          const py = p.rel.y + m * gridN;
          if (px < worldMinX || px > worldMaxX || py < worldMinY || py > worldMaxY) {
            continue;
          }
          if (isUsed) {
            ctx.save();
            ctx.globalAlpha = S.base.guide.opacity;
            ctx.beginPath();
            ctx.arc(tx(px), ty(py), S.base.sourcePoint.radius * 0.75, 0, Math.PI * 2);
            ctx.strokeStyle = S.muted;
            ctx.lineWidth = S.base.grid.lineWidth * 2;
            ctx.stroke();
            ctx.restore();
          } else {
            ctx.save();
            ctx.globalAlpha = S.base.grid.opacity;
            ctx.beginPath();
            ctx.arc(tx(px), ty(py), S.base.sourcePoint.radius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = S.muted;
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    if (this.helpers) {
      // circle Q halo (filled, faint)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radiusQ * scale, 0, Math.PI * 2);
      ctx.globalAlpha = S.fillFaint;
      ctx.fillStyle = S.circleQ;
      ctx.fill();
      ctx.globalAlpha = S.base.guide.opacity;
      ctx.strokeStyle = S.circleQ;
      ctx.lineWidth = S.base.guide.lineWidth;
      ctx.setLineDash(S.base.guide.dash);
      ctx.stroke();
      ctx.restore();

      // circles O and P
      ctx.save();
      ctx.globalAlpha = S.base.guide.opacity;
      ctx.lineWidth = S.base.guide.lineWidth;
      ctx.setLineDash(S.base.guide.dash);
      ctx.beginPath();
      ctx.arc(cx, cy, radiusO * scale, 0, Math.PI * 2);
      ctx.strokeStyle = S.circleO;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radiusP * scale, 0, Math.PI * 2);
      ctx.strokeStyle = S.circleP;
      ctx.stroke();
      ctx.restore();

      // rays from A through each child, extended to view edge
      ctx.save();
      ctx.globalAlpha = S.base.guide.opacity;
      ctx.strokeStyle = S.text;
      ctx.lineWidth = S.base.guide.lineWidth;
      for (const c of children) {
        const ang = Math.atan2(c.y, c.x);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * Math.max(W, H), cy + Math.sin(ang) * Math.max(W, H));
        ctx.stroke();
      }
      ctx.restore();
    }

    // search cones for each segment / endpoint
    const drawCone = (
      ox: number,
      oy: number,
      dirX: number,
      dirY: number,
      thetaDeg: number,
      r: number,
      fill: string,
      edge: string,
      fa: number,
      ea: number
    ) => {
      if (thetaDeg <= 0 || r <= 0) {
        return;
      }
      const base = Math.atan2(dirY, dirX);
      const half = (thetaDeg * Math.PI) / 180;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, r, base - half, base + half);
      ctx.closePath();
      ctx.globalAlpha = fa;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = ea;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    };
    const drawConeBand = (
      ox: number,
      oy: number,
      dirX: number,
      dirY: number,
      exDeg: number,
      spDeg: number,
      r: number,
      fill: string,
      edge: string,
      fa: number,
      ea: number
    ) => {
      if (r <= 0 || spDeg <= exDeg) {
        return;
      }
      const base = Math.atan2(dirY, dirX);
      const exRad = (exDeg * Math.PI) / 180;
      const spRad = (spDeg * Math.PI) / 180;
      for (const sign of [1, -1]) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        if (sign > 0) {
          ctx.arc(ox, oy, r, base + exRad, base + spRad);
        } else {
          ctx.arc(ox, oy, r, base - spRad, base - exRad);
        }
        ctx.closePath();
        ctx.globalAlpha = fa;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = ea;
        ctx.strokeStyle = edge;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    };
    const drawSearchCone = (
      ox: number,
      oy: number,
      dirX: number,
      dirY: number,
      entry: { mode: string; theta: number; excludeDeg: number; spanDeg: number },
      r: number,
      fill: string,
      edge: string,
      fa: number,
      ea: number
    ) => {
      if (entry.mode === 'exclude') {
        drawConeBand(ox, oy, dirX, dirY, entry.excludeDeg, entry.spanDeg, r, fill, edge, fa, ea);
      } else {
        drawCone(ox, oy, dirX, dirY, entry.theta, r, fill, edge, fa, ea);
      }
    };
    if (this.helpers) {
      for (const s of segments) {
        drawSearchCone(
          tx(s.from.x),
          ty(s.from.y),
          s.dir.x,
          s.dir.y,
          s,
          (s.searchRadius ?? searchRadius) * scale,
          S.tree,
          S.tree,
          S.fillFaint,
          S.base.guide.opacity
        );
      }
      for (const e of endpoints) {
        drawSearchCone(
          tx(e.rel.x),
          ty(e.rel.y),
          e.dir.x,
          e.dir.y,
          e,
          (e.searchRadius ?? searchRadius) * scale,
          S.deadEnd,
          S.deadEnd,
          S.fillFaint,
          S.base.guide.opacity
        );
      }
    }

    // segments (tree edges)
    for (const s of segments) {
      ctx.save();
      ctx.strokeStyle = S.tree;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx(s.from.x), ty(s.from.y));
      ctx.lineTo(tx(s.to.x), ty(s.to.y));
      ctx.stroke();
      ctx.restore();
      if (this.helpers) {
        ctx.save();
        ctx.globalAlpha = S.base.grid.opacity;
        ctx.beginPath();
        ctx.arc(
          tx(s.from.x),
          ty(s.from.y),
          (s.searchRadius ?? searchRadius) * scale,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = S.tree;
        ctx.lineWidth = S.base.guide.lineWidth;
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(tx(s.to.x), ty(s.to.y), S.base.sourcePoint.radius * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = S.tree;
      ctx.fill();
    }

    // gen-1 children markers
    for (const c of children) {
      ctx.beginPath();
      ctx.arc(tx(c.x), ty(c.y), S.base.sourcePoint.radius, 0, Math.PI * 2);
      ctx.fillStyle = S.text;
      ctx.fill();
    }

    // endpoints (dead ends)
    for (const e of endpoints) {
      ctx.beginPath();
      ctx.arc(tx(e.rel.x), ty(e.rel.y), S.base.hoverPoint.radius * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = S.deadEnd;
      ctx.lineWidth = S.base.hoverPoint.lineWidth;
      ctx.stroke();
    }

    // branch points
    for (const b of branchPoints) {
      ctx.beginPath();
      ctx.arc(tx(b.rel.x), ty(b.rel.y), S.base.hoverPoint.radius * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = S.branch;
      ctx.lineWidth = S.base.hoverPoint.lineWidth;
      ctx.stroke();
    }

    // depth-capped chains (distinct from real dead ends)
    for (const t of truncatedPoints) {
      ctx.save();
      ctx.globalAlpha = S.base.grid.opacity;
      ctx.beginPath();
      ctx.arc(tx(t.rel.x), ty(t.rel.y), S.base.hoverPoint.radius * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = S.muted;
      ctx.lineWidth = S.base.hoverPoint.lineWidth;
      ctx.setLineDash(S.base.guide.dash);
      ctx.stroke();
      ctx.restore();
    }

    // point A (always on top)
    ctx.beginPath();
    ctx.arc(cx, cy, S.base.hoverPoint.radius * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = S.origin;
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = S.base.guide.opacity;
    ctx.beginPath();
    ctx.arc(cx, cy, S.base.hoverPoint.radius * 1.15, 0, Math.PI * 2);
    ctx.strokeStyle = S.origin;
    ctx.lineWidth = S.base.guide.lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  private get helpers(): boolean {
    return this.helpersOn;
  }

  private findNodeSearchInfo(absPoint: FieldPoint) {
    if (!this.lastResult) {
      return null;
    }
    for (const s of this.lastResult.segments) {
      if (s.fromAbs === absPoint) {
        return {
          searchRadius: s.searchRadius,
          radiusO: s.radiusO,
          radiusP: s.radiusP,
          role: 'branched',
          generation: s.generation,
        };
      }
    }
    for (const e of this.lastResult.endpoints) {
      if (e.abs === absPoint) {
        return {
          searchRadius: e.searchRadius,
          radiusO: e.radiusO,
          radiusP: e.radiusP,
          role: 'dead end',
          generation: e.generation,
        };
      }
    }
    for (const t of this.lastResult.truncatedPoints) {
      if (t.abs === absPoint) {
        return {
          searchRadius: null,
          radiusO: null,
          radiusP: null,
          role: 'depth-capped',
          generation: t.generation,
        };
      }
    }
    return null;
  }

  // ---- pan / zoom / origin-select / hover ----

  private canvasCoords(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      px: (clientX - rect.left) * (this.canvas.width / rect.width),
      py: (clientY - rect.top) * (this.canvas.height / rect.height),
      scaleFix: this.canvas.width / rect.width,
    };
  }

  private onMouseDown = (evt: MouseEvent) => {
    this.isDragging = true;
    this.justDragged = false;
    this.dragStartX = evt.clientX;
    this.dragStartY = evt.clientY;
    this.dragStartPanX = this.viewPanX;
    this.dragStartPanY = this.viewPanY;
    this.canvas.style.cursor = 'grabbing';
  };

  private onWindowMouseMove = (evt: MouseEvent) => {
    if (!this.isDragging) {
      return;
    }
    const dx = evt.clientX - this.dragStartX;
    const dy = evt.clientY - this.dragStartY;
    if (!this.justDragged && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      this.justDragged = true;
    }
    if (this.justDragged) {
      const scaleFix = this.canvas.width / this.canvas.getBoundingClientRect().width;
      this.viewPanX = this.dragStartPanX + dx * scaleFix;
      this.viewPanY = this.dragStartPanY + dy * scaleFix;
      this.callbacks.onHover(null);
      if (this.lastResult) {
        this.draw(this.lastResult);
      }
    }
  };

  private onMouseUp = () => {
    this.isDragging = false;
    this.canvas.style.cursor = 'grab';
  };

  private onWheel = (evt: WheelEvent) => {
    if (!this.lastTransform || !this.lastResult) {
      return;
    }
    evt.preventDefault();
    const { px, py } = this.canvasCoords(evt.clientX, evt.clientY);
    const { scale: oldScale, cx: oldCx, cy: oldCy } = this.lastTransform;
    const worldX = (px - oldCx) / oldScale;
    const worldY = (py - oldCy) / oldScale;

    const zoomFactor = 1.0016 ** -evt.deltaY;
    this.viewZoom = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, this.viewZoom * zoomFactor));

    this.draw(this.lastResult); // recompute transform at the new zoom, old pan
    const { scale: newScale, cx: newCx, cy: newCy } = this.lastTransform;
    this.viewPanX += px - (newCx + worldX * newScale);
    this.viewPanY += py - (newCy + worldY * newScale);
    this.draw(this.lastResult);
  };

  private onClick = (evt: MouseEvent) => {
    if (!this.lastTransform || !this.params) {
      return;
    }
    if (this.justDragged) {
      this.justDragged = false;
      return;
    }
    if (!evt.ctrlKey) {
      return;
    }
    const { px, py } = this.canvasCoords(evt.clientX, evt.clientY);
    const { A, scale, cx, cy } = this.lastTransform;
    let gx = (px - cx) / scale + A.x;
    let gy = (py - cy) / scale + A.y;
    gx = ((gx % this.n) + this.n) % this.n;
    gy = ((gy % this.n) + this.n) % this.n;

    let bestIdx = this.originIdx;
    let bestD = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const { x: dx, y: dy } = torDelta(
        gx,
        gy,
        this.points[i].x,
        this.points[i].y,
        this.n,
        this.params.wrap
      );
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    this.selectOriginKeepingCamera(bestIdx, px, py);
  };

  private selectOriginKeepingCamera(newIdx: number, anchorPx: number, anchorPy: number) {
    if (newIdx === this.originIdx || !this.lastTransform || !this.params) {
      this.originIdx = newIdx;
      this.render();
      return;
    }
    const oldFinalScale = this.lastTransform.scale;
    const viewZoomBefore = this.viewZoom;

    this.originIdx = newIdx;
    const result = runAlgorithm(this.points, this.n, this.originIdx, this.params);
    this.lastResult = result;

    this.draw(result); // throwaway: read the new auto-fit baseScale
    const newBaseScale = this.lastTransform.scale / viewZoomBefore;
    this.viewZoom = Math.min(VIEW_ZOOM_MAX, Math.max(VIEW_ZOOM_MIN, oldFinalScale / newBaseScale));
    this.viewPanX = anchorPx - this.canvas.width / 2;
    this.viewPanY = anchorPy - this.canvas.height / 2;

    this.draw(result);
    this.callbacks.onReadout({ result, pointCount: this.points.length });
  }

  private onHoverMove = (evt: MouseEvent) => {
    if (!this.lastTransform || this.isDragging) {
      this.callbacks.onHover(null);
      return;
    }
    const { px, py } = this.canvasCoords(evt.clientX, evt.clientY);
    const { A, scale, cx, cy } = this.lastTransform;

    const TILE_CHECK_RADIUS = MAX_TILE_RADIUS;
    let bestPx = Infinity;
    let bestScreenX = 0;
    let bestScreenY = 0;
    let bestAbs: FieldPoint | null = null;
    for (let i = 0; i < this.points.length; i++) {
      if (this.points[i] === A) {
        continue;
      }
      const { x: dx, y: dy } = torDelta(
        A.x,
        A.y,
        this.points[i].x,
        this.points[i].y,
        this.n,
        this.params!.wrap
      );
      for (let k = -TILE_CHECK_RADIUS; k <= TILE_CHECK_RADIUS; k++) {
        for (let m = -TILE_CHECK_RADIUS; m <= TILE_CHECK_RADIUS; m++) {
          const sx = cx + (dx + k * this.n) * scale;
          const sy = cy + (dy + m * this.n) * scale;
          const d = Math.hypot(sx - px, sy - py);
          if (d < bestPx) {
            bestPx = d;
            bestScreenX = sx;
            bestScreenY = sy;
            bestAbs = this.points[i];
          }
        }
      }
    }
    const dA = Math.hypot(cx - px, cy - py);
    if (dA < bestPx) {
      bestPx = dA;
      bestScreenX = cx;
      bestScreenY = cy;
      bestAbs = A;
    }

    if (bestAbs && bestPx <= HOVER_RADIUS_PX) {
      this.hoveredAbs = bestAbs;
      const { x: dx, y: dy } = torDelta(A.x, A.y, bestAbs.x, bestAbs.y, this.n, this.params!.wrap);
      const dist = Math.hypot(dx, dy);
      const isOrigin = bestAbs === A;
      let info: HoverInfo = {
        clientX: evt.clientX,
        clientY: evt.clientY,
        isOrigin,
        gridX: bestAbs.x,
        gridY: bestAbs.y,
        dx,
        dy,
        dist,
        generation: isOrigin ? 0 : null,
        role: null,
        searchRadius: null,
        radiusO: null,
        radiusP: null,
      };
      if (isOrigin) {
        this.hoverOverlay = null;
      } else {
        const node = this.findNodeSearchInfo(bestAbs);
        if (node) {
          info = {
            ...info,
            generation: node.generation,
            role: node.role,
            searchRadius: node.searchRadius,
            radiusO: node.radiusO,
            radiusP: node.radiusP,
          };
          if (node.searchRadius != null && node.radiusO != null && node.radiusP != null) {
            this.hoverOverlay = {
              screenX: bestScreenX,
              screenY: bestScreenY,
              scale,
              radiusO: node.radiusO,
              radiusP: node.radiusP,
            };
          } else {
            this.hoverOverlay = null;
          }
        } else {
          this.hoverOverlay = null;
        }
      }
      this.callbacks.onHover(info);
    } else {
      this.callbacks.onHover(null);
      this.hoverOverlay = null;
      this.hoveredAbs = null;
    }
    this.scheduleHoverRedraw();
  };

  private onMouseLeave = () => {
    this.callbacks.onHover(null);
    this.hoverOverlay = null;
    this.hoveredAbs = null;
    this.scheduleHoverRedraw();
  };

  private scheduleHoverRedraw() {
    if (this.hoverRAF !== null) {
      return;
    }
    this.hoverRAF = requestAnimationFrame(() => {
      this.hoverRAF = null;
      if (!this.lastResult) {
        return;
      }
      this.draw(this.lastResult);
      // Highlight every periodic image of the hovered cell, so its recurrence
      // across the unrolled torus (the wrapping) is visible at a glance.
      if (this.hoveredAbs && this.lastTransform) {
        const S = this.style();
        const ctx = this.ctx;
        const { A, scale, cx, cy } = this.lastTransform;
        const base = torDelta(
          A.x,
          A.y,
          this.hoveredAbs.x,
          this.hoveredAbs.y,
          this.n,
          this.params?.wrap ?? true
        );
        const R = S.base.hoverPoint.radius;
        ctx.save();
        ctx.strokeStyle = S.relation;
        ctx.lineWidth = S.base.hoverPoint.lineWidth;
        for (let k = -MAX_TILE_RADIUS; k <= MAX_TILE_RADIUS; k++) {
          for (let m = -MAX_TILE_RADIUS; m <= MAX_TILE_RADIUS; m++) {
            const sx = cx + (base.x + k * this.n) * scale;
            const sy = cy + (base.y + m * this.n) * scale;
            if (sx < -R || sx > this.canvas.width + R || sy < -R || sy > this.canvas.height + R) {
              continue;
            }
            ctx.beginPath();
            ctx.arc(sx, sy, R, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      if (this.hoverOverlay) {
        const S = this.style();
        const { screenX, screenY, scale, radiusO, radiusP } = this.hoverOverlay;
        const ctx = this.ctx;
        ctx.save();
        ctx.setLineDash(S.base.guide.dash);
        ctx.lineWidth = S.base.hoverPoint.lineWidth;
        ctx.beginPath();
        ctx.arc(screenX, screenY, radiusO * scale, 0, Math.PI * 2);
        ctx.strokeStyle = S.circleO;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(screenX, screenY, radiusP * scale, 0, Math.PI * 2);
        ctx.strokeStyle = S.circleP;
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(screenX, screenY, S.base.sourcePoint.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = S.text;
        ctx.fill();
      }
    });
  }

  destroy() {
    this.resizeObserver?.disconnect();
    if (this.hoverRAF) {
      cancelAnimationFrame(this.hoverRAF);
    }
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mousemove', this.onWindowMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('mousemove', this.onHoverMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
  }
}
