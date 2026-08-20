import type { IntervalPlacementStyle } from '../../theme/diagram';
import {
  anchorsForPerm,
  type IntervalPlacementParams,
  type OddBiasDirection,
  type PlacementRecord,
  quantizeInterval,
} from './engine';
import { hueForInterval, intervalLightness } from './visuals';

export interface IntervalPlotScene {
  record: PlacementRecord;
  L: number;
  edoSteps: number;
  params: IntervalPlacementParams;
  oddBias: OddBiasDirection[];
}

interface Callbacks {
  onHoverPitch: (pitch: number | null) => void;
}

interface HoverPoint {
  pitch: number;
  x: number;
  y: number;
}

const HIT_RADIUS = 10;

function endpointsListFromEndpoints(endpoints: Array<[number, number]>): number[] {
  return endpoints.flat().sort((a, b) => a - b);
}

/**
 * Canvas 2D plot for a single placement record: the per-interval endpoint
 * columns, the composite pitch column, and (in prefix-slack mode) the
 * alpha=0 / beta=0 comparison overlays. Ported from the Composition
 * Toolbox's `drawPlotOnCanvas`; hover now flows both ways — the canvas
 * hit-tests its own drawn points and reports hits via `onHoverPitch`, and
 * the page pushes the authoritative hover pitch back in via `setHoverPitch`
 * so it stays in sync with the keyboard/fretboard/counts panels.
 */
export class IntervalPlotRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scene: IntervalPlotScene | null = null;
  private hoverPitch: number | null = null;
  private hoverPoints: HoverPoint[] = [];
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: () => IntervalPlacementStyle,
    private readonly callbacks: Callbacks
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D rendering is unavailable.');
    }
    this.ctx = ctx;

    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);

    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
  }

  setScene(scene: IntervalPlotScene | null) {
    this.scene = scene;
    this.draw();
  }

  setHoverPitch(pitch: number | null) {
    if (this.hoverPitch === pitch) {
      return;
    }
    this.hoverPitch = pitch;
    this.draw();
  }

  restyle() {
    this.draw();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
  }

  private syncSize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round((this.canvas.clientWidth || 0) * dpr);
    const h = Math.round((this.canvas.clientHeight || 0) * dpr);
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private onMouseMove = (evt: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const mx = (evt.clientX - rect.left) * (this.canvas.width / rect.width);
    const my = (evt.clientY - rect.top) * (this.canvas.height / rect.height);
    let nearest: HoverPoint | null = null;
    let nearestDist = HIT_RADIUS;
    this.hoverPoints.forEach((p) => {
      const dist = Math.hypot(p.x - mx, p.y - my);
      if (dist <= nearestDist) {
        nearestDist = dist;
        nearest = p;
      }
    });
    this.callbacks.onHoverPitch(nearest ? (nearest as HoverPoint).pitch : null);
  };

  private onMouseLeave = () => {
    this.callbacks.onHoverPitch(null);
  };

  private overlayPitches(anchorAlpha: number | null, anchorBeta: number | null): number[] | null {
    if (!this.scene) {
      return null;
    }
    const { record: rec, L, params, oddBias } = this.scene;
    const overlayParams: IntervalPlacementParams = {
      ...params,
      anchorAlpha: anchorAlpha ?? params.anchorAlpha,
      anchorBeta: anchorBeta ?? params.anchorBeta,
    };
    const anchorData = anchorsForPerm(L, rec.perm, overlayParams, oddBias);
    if (!anchorData) {
      return null;
    }
    const endpoints = anchorData.anchorFloats.map((a, idx) => {
      const d = rec.perm[idx];
      const bias = oddBias[idx];
      const { low, high } = quantizeInterval(a, d, params.anchorRho, bias);
      return [low, high] as [number, number];
    });
    return endpointsListFromEndpoints(endpoints);
  }

  private draw() {
    this.syncSize();
    const ctx = this.ctx;
    const canvas = this.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.scene) {
      this.hoverPoints = [];
      return;
    }
    const style = this.style();
    const { record: rec, L, edoSteps, params } = this.scene;
    const textFont = `12px ${style.fontFamily}`;

    const pad = 48;
    const width = canvas.width - pad * 2;
    const height = canvas.height - pad * 2;
    const intervalCols = rec.endpoints.length;
    const quarter = width / 4;
    const intervalWidth = quarter;
    const intervalLeft = pad;
    const auxLeft = pad + 2 * quarter;
    const compositeX = pad + 3 * quarter;

    const yToPx = (y: number) => canvas.height - pad - (y / L) * height;
    const xIntervalToPx = (i: number) => {
      if (intervalCols <= 0) {
        return intervalLeft + intervalWidth / 2;
      }
      const span = intervalWidth / (intervalCols + 1);
      return intervalLeft + (i + 1) * span;
    };

    ctx.lineWidth = 1;
    ctx.strokeStyle = style.grid;
    for (let y = 0; y <= L; y++) {
      const px = yToPx(y);
      ctx.beginPath();
      ctx.moveTo(pad, px);
      ctx.lineTo(canvas.width - pad, px);
      ctx.stroke();
    }

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = style.octaveGrid;
    for (let y = 0; y <= L; y += edoSteps) {
      const px = yToPx(y);
      ctx.beginPath();
      ctx.moveTo(pad, px);
      ctx.lineTo(canvas.width - pad, px);
      ctx.stroke();
    }

    if (rec.anchorRange) {
      const top = yToPx(rec.anchorRange.max);
      const bottom = yToPx(rec.anchorRange.min);
      const bandY = Math.min(top, bottom);
      const bandH = Math.abs(bottom - top);
      ctx.save();
      ctx.globalAlpha = style.anchorRangeOpacity;
      ctx.fillStyle = style.anchorRangeFill;
      ctx.fillRect(pad, bandY, canvas.width - pad * 2, bandH);
      ctx.restore();
    }

    ctx.fillStyle = style.neutral;
    ctx.font = textFont;
    const hoverPoints: HoverPoint[] = [];

    rec.endpoints.forEach(([lo, hi], idx) => {
      const x = xIntervalToPx(idx);
      ctx.strokeStyle = style.neutral;
      ctx.fillStyle = style.neutral;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, yToPx(lo));
      ctx.lineTo(x, yToPx(hi));
      ctx.stroke();

      const a = rec.anchors ? rec.anchors[idx] : Math.round(rec.anchorFloats[idx]);
      ctx.beginPath();
      ctx.arc(x, yToPx(lo), 3.5, 0, Math.PI * 2);
      ctx.fill();
      hoverPoints.push({ pitch: lo, x, y: yToPx(lo) });
      ctx.beginPath();
      ctx.arc(x, yToPx(hi), 3.5, 0, Math.PI * 2);
      ctx.fill();
      hoverPoints.push({ pitch: hi, x, y: yToPx(hi) });

      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(x, yToPx(a), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const aFloat = rec.anchorFloats[idx];
      ctx.save();
      ctx.strokeStyle = style.anchorFloatRing;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, yToPx(aFloat), 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = style.neutral;
      ctx.fillText(`a=${a}`, x + 6, yToPx(a) + 4);
      ctx.fillText(`lo=${lo}`, x + 6, yToPx(lo) + 12);
      ctx.fillText(`hi=${hi}`, x + 6, yToPx(hi) - 4);
    });

    const xAll = compositeX;
    const xAlpha = auxLeft + quarter / 3;
    const xBeta = auxLeft + (2 * quarter) / 3;

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = style.grid;
    rec.endpoints.forEach(([lo, hi], idx) => {
      const x = xIntervalToPx(idx);
      [lo, hi].forEach((p) => {
        const y = yToPx(p);
        ctx.beginPath();
        ctx.moveTo(xAll, y);
        ctx.lineTo(x, y);
        ctx.stroke();
      });
    });
    ctx.restore();

    ctx.fillStyle = style.neutral;
    rec.pitches.forEach((p) => {
      const y = yToPx(p);
      hoverPoints.push({ pitch: p, x: xAll, y });
      ctx.beginPath();
      ctx.arc(xAll, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`${p}`, xAll + 6, y + 4);
    });

    this.hoverPoints = hoverPoints;

    if (this.hoverPitch !== null) {
      const y = yToPx(this.hoverPitch);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = style.base.hoverHighlight;
      ctx.beginPath();
      ctx.arc(xAll, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = style.base.hoverHighlight;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    const drawOverlay = (
      x: number,
      endpointList: number[] | null,
      color: string,
      linkColor: string,
      label: string
    ) => {
      if (!endpointList) {
        return;
      }
      const pitches = Array.from(new Set(endpointList)).sort((a, b) => a - b);
      const compositeList = endpointsListFromEndpoints(rec.endpoints);
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.font = textFont;
      pitches.forEach((p) => {
        const y = yToPx(p);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const text = `${p}`;
        const metrics = ctx.measureText(text);
        ctx.fillText(text, x - metrics.width - 6, y + 3);
      });
      const count = Math.min(endpointList.length, compositeList.length);
      ctx.strokeStyle = linkColor;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < count; i++) {
        const yFrom = yToPx(endpointList[i]);
        const yTo = yToPx(compositeList[i]);
        ctx.beginPath();
        ctx.moveTo(x + 3, yFrom);
        ctx.lineTo(xAll - 3, yTo);
        ctx.stroke();
      }
      ctx.font = textFont;
      const metrics = ctx.measureText(label);
      const paddingX = 6;
      const paddingY = 4;
      const boxW = metrics.width + paddingX * 2;
      const boxH = 16 + paddingY;
      const boxX = x - boxW / 2;
      const boxY = pad - boxH - 8;
      ctx.fillStyle = style.labelBackground;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = color;
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = color;
      ctx.fillText(label, boxX + paddingX, boxY + boxH - 6);
      ctx.restore();
    };

    if (params.placementMode === 'v2' && this.hoverPitch !== null) {
      drawOverlay(
        xBeta,
        this.overlayPitches(null, 0),
        style.betaZero,
        style.betaZeroLink,
        'beta=0'
      );
      drawOverlay(
        xAlpha,
        this.overlayPitches(0, null),
        style.alphaZero,
        style.betaZeroLink,
        'alpha=0'
      );
    }

    if (this.hoverPitch !== null) {
      const base = this.hoverPitch;
      const spineBase = xAll + 20;
      const upItems = rec.pitches
        .filter((p) => p > base)
        .map((p) => ({ p, interval: Math.abs(p - base) }))
        .sort((a, b) => a.interval - b.interval);
      const downItems = rec.pitches
        .filter((p) => p < base)
        .map((p) => ({ p, interval: Math.abs(p - base) }))
        .sort((a, b) => a.interval - b.interval);
      const spineStep = 15;
      const drawSet = (items: Array<{ p: number; interval: number }>) => {
        items.forEach((item, idx) => {
          const y1 = yToPx(base);
          const y2 = yToPx(item.p);
          const dx = idx * spineStep;
          const hue = hueForInterval(item.interval, edoSteps);
          const lightness = intervalLightness(item.interval, edoSteps, style.isDark);
          ctx.strokeStyle = `hsla(${hue}, 60%, ${lightness}%, 0.85)`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xAll, y2);
          ctx.lineTo(spineBase + dx, y2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(spineBase + dx, y1);
          ctx.lineTo(spineBase + dx, y2);
          ctx.stroke();

          const midY = (y1 + y2) / 2;
          const label = `${item.interval}`;
          const labelX = spineBase + dx;
          ctx.font = textFont;
          const metrics = ctx.measureText(label);
          const paddingX = 4;
          const paddingY = 4;
          const boxW = metrics.width + paddingX * 2;
          const boxH = 16 + paddingY;
          ctx.fillStyle = style.labelBackground;
          ctx.fillRect(labelX - boxW / 2, midY - boxH / 2, boxW, boxH);
          ctx.strokeStyle = `hsla(${hue}, 60%, ${lightness}%, 0.85)`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(labelX - boxW / 2, midY - boxH / 2, boxW, boxH);
          const textLightness = style.isDark
            ? Math.min(95, lightness + 15)
            : Math.max(20, lightness - 10);
          ctx.fillStyle = `hsla(${hue}, 60%, ${textLightness}%, 0.95)`;
          ctx.fillText(label, labelX - metrics.width / 2, midY + 4);
        });
      };
      drawSet(upItems);
      drawSet(downItems);
    }
  }
}
