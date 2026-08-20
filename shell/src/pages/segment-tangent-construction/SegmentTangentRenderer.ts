import type { SegmentTangentStyle } from '../../theme/diagram';
import {
  angleNorm,
  boundaryComboPoints,
  computeBoundaries,
  excircles,
  findSegment,
  incircle,
  inversiveDual,
  lineChordT,
  lineCircleS,
  lineRayS,
  type Point,
  segmentQuad,
  segmentTriangle,
  triangleBoundaryCrossingCount,
  triangleMetrics,
} from './geometry';

export type BoundaryChoice = 'own' | 'neighbor';

export interface LayerToggles {
  rays: boolean;
  arcs: boolean;
  perp: boolean;
  perpOpp: boolean;
  mid: boolean;
  radials: boolean;
  ratios: boolean;
  reproj: boolean;
  inversion: boolean;
  apexTri: boolean;
  quad: boolean;
  triCenters: boolean;
  excircles: boolean;
  incircle: boolean;
  boundaryPoly: boolean;
}

export interface SceneInput {
  n: number;
  radii: number[];
  widthWeights: number[];
  boundaryChoice: BoundaryChoice[];
  layers: LayerToggles;
  fillOpacity: number;
}

export interface TangentCrossings {
  purpleA0: number | null;
  purpleA1: number | null;
  blueA0: number | null;
  blueA1: number | null;
}

export interface SegmentRatioPoint {
  ratioArc: number;
  rust: number | null;
  cyan: number | null;
  kind: 'blue' | 'purple';
  tangentChord: number | null;
  reprojRatio: number | null;
}

export interface SegmentTangentReadout {
  letters: string[];
  counts: number[];
  segGroups: SegmentRatioPoint[][];
  tangentTs: TangentCrossings[];
  focusSeg: number | null;
  triCross: { segLetter: string; code: string; count: number } | null;
}

interface Callbacks {
  onReadout: (info: SegmentTangentReadout) => void;
}

/**
 * Canvas 2D scene + interaction for the segment/arc/tangent construction. Owns
 * hover/click segment focus-lock and the always-on ratio/chord data
 * computation (decoupled from which layers are visible, matching the source
 * tool's own "data layer independent of canvas overlays" design). All colors
 * come from the injected style resolver; readout data flows to React via a
 * callback so the page owns table/panel presentation.
 */
export class SegmentTangentRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scene: SceneInput | null = null;
  private focusSeg: number | null = null;
  private lockedSeg: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: () => SegmentTangentStyle,
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
    canvas.addEventListener('click', this.onClick);
    canvas.style.cursor = 'pointer';
  }

  setScene(scene: SceneInput) {
    this.scene = scene;
    this.draw();
  }

  restyle() {
    this.draw();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('click', this.onClick);
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

  private geom() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.35;
    return { W, H, cx, cy, R };
  }

  private hitTestSegment(clientX: number, clientY: number): number | null {
    if (!this.scene) {
      return null;
    }
    const { n, widthWeights } = this.scene;
    const angles = computeBoundaries(n, widthWeights);
    const rect = this.canvas.getBoundingClientRect();
    const { cx, cy, R } = this.geom();
    const mx = (clientX - rect.left) * (this.canvas.width / rect.width);
    const my = (clientY - rect.top) * (this.canvas.height / rect.height);
    const dx = mx - cx;
    const dy = my - cy;
    if (Math.hypot(dx, dy) > R + 50) {
      return null;
    }
    return findSegment(angleNorm(dx, dy), angles, n);
  }

  private onMouseMove = (evt: MouseEvent) => {
    if (this.lockedSeg !== null) {
      return;
    }
    const seg = this.hitTestSegment(evt.clientX, evt.clientY);
    if (seg !== this.focusSeg) {
      this.focusSeg = seg;
      this.draw();
    }
  };

  private onMouseLeave = () => {
    if (this.lockedSeg !== null) {
      return;
    }
    if (this.focusSeg !== null) {
      this.focusSeg = null;
      this.draw();
    }
  };

  private onClick = (evt: MouseEvent) => {
    const seg = this.hitTestSegment(evt.clientX, evt.clientY);
    if (seg === null) {
      if (this.lockedSeg !== null) {
        this.lockedSeg = null;
        this.focusSeg = null;
        this.draw();
      }
      return;
    }
    this.lockedSeg = this.lockedSeg === seg ? null : seg;
    this.focusSeg = this.lockedSeg;
    this.draw();
  };

  private draw() {
    if (!this.scene) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    this.syncSize();
    const ctx = this.ctx;
    const S = this.style();
    const { W, H, cx, cy, R } = this.geom();
    const { n, radii, widthWeights, boundaryChoice, layers, fillOpacity } = this.scene;
    const angles = computeBoundaries(n, widthWeights);
    const letters = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    const segAlpha = (i: number) => (this.focusSeg === null || i === this.focusSeg ? 1 : 0.12);

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // outer circle
    ctx.strokeStyle = S.neutral;
    ctx.lineWidth = S.outline.thick;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    if (layers.rays) {
      ctx.strokeStyle = S.neutral;
      ctx.lineWidth = S.outline.thin;
      for (let i = 0; i < n; i++) {
        const a = angles[i];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
        ctx.stroke();
      }
    }

    if (layers.arcs) {
      ctx.strokeStyle = S.neutral;
      ctx.lineWidth = S.outline.thick;
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = segAlpha(i);
        ctx.beginPath();
        ctx.arc(cx, cy, radii[i] * R, angles[i], angles[i + 1]);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    if (layers.inversion) {
      ctx.strokeStyle = S.focus;
      ctx.lineWidth = S.outline.thin;
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = segAlpha(i);
        const r = radii[i] * R;
        if (r < 1) {
          continue;
        }
        [angles[i], angles[i + 1]].forEach((theta) => {
          const { center, radius } = inversiveDual(r, theta, R);
          ctx.beginPath();
          ctx.arc(cx + center[0], cy + center[1], radius, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      ctx.globalAlpha = 1;
    }

    if (layers.apexTri || layers.triCenters || layers.excircles || layers.incircle || layers.quad) {
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = segAlpha(i);
        const a0 = angles[i];
        const a1 = angles[i + 1];
        const r = radii[i] * R;
        if (r >= R || r < 1) {
          continue;
        }
        const { apex, blueA0, blueA1 } = segmentTriangle(a0, a1, r, R);
        const A: Point = [cx + apex[0], cy + apex[1]];
        const B: Point = [cx + blueA0[0], cy + blueA0[1]];
        const C: Point = [cx + blueA1[0], cy + blueA1[1]];

        if (layers.apexTri) {
          ctx.strokeStyle = S.apexTriangle;
          ctx.lineWidth = S.outline.normal;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(A[0], A[1]);
          ctx.lineTo(B[0], B[1]);
          ctx.lineTo(C[0], C[1]);
          ctx.closePath();
          if (fillOpacity > 0) {
            ctx.globalAlpha = segAlpha(i) * fillOpacity;
            ctx.fillStyle = S.apexTriangle;
            ctx.fill();
            ctx.globalAlpha = segAlpha(i);
          }
          ctx.stroke();
        }

        if (layers.quad) {
          const quadPts = segmentQuad(a0, a1, r, R).map((p): Point => [cx + p[0], cy + p[1]]);
          ctx.strokeStyle = S.quad;
          ctx.lineWidth = S.outline.normal;
          ctx.setLineDash([]);
          ctx.beginPath();
          quadPts.forEach((p, idx) =>
            idx === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])
          );
          ctx.closePath();
          if (fillOpacity > 0) {
            ctx.globalAlpha = segAlpha(i) * fillOpacity;
            ctx.fillStyle = S.quad;
            ctx.fill();
            ctx.globalAlpha = segAlpha(i);
          }
          ctx.stroke();
        }

        if (layers.triCenters) {
          const centerX = (A[0] + B[0] + C[0]) / 3;
          const centerY = (A[1] + B[1] + C[1]) / 3;
          ctx.fillStyle = S.apexTriangle;
          ctx.beginPath();
          ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        if (layers.excircles || layers.incircle) {
          const m = triangleMetrics(A, B, C);
          if (layers.excircles && m.area > 1e-6) {
            ctx.strokeStyle = S.excircle;
            ctx.lineWidth = S.outline.thin * 0.8;
            ctx.setLineDash(S.dash.excircle);
            excircles(A, B, C, m).forEach((ex) => {
              if (!Number.isFinite(ex.center[0]) || !Number.isFinite(ex.radius) || ex.radius <= 0) {
                return;
              }
              ctx.beginPath();
              ctx.arc(ex.center[0], ex.center[1], ex.radius, 0, Math.PI * 2);
              if (fillOpacity > 0) {
                ctx.globalAlpha = segAlpha(i) * fillOpacity;
                ctx.fillStyle = S.excircle;
                ctx.fill();
                ctx.globalAlpha = segAlpha(i);
              }
              ctx.stroke();
            });
            ctx.setLineDash([]);
          }
          if (layers.incircle && m.area > 1e-6) {
            const { center, radius } = incircle(A, B, C, m);
            ctx.strokeStyle = S.incircle;
            ctx.lineWidth = S.outline.thin;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(center[0], center[1], radius, 0, Math.PI * 2);
            if (fillOpacity > 0) {
              ctx.globalAlpha = segAlpha(i) * fillOpacity;
              ctx.fillStyle = S.incircle;
              ctx.fill();
              ctx.globalAlpha = segAlpha(i);
            }
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    let triCross: SegmentTangentReadout['triCross'] = null;
    if (layers.boundaryPoly && boundaryChoice.length === n) {
      const bits = boundaryChoice.map((c) => (c === 'own' ? 0 : 1));
      const bPtsUnit = boundaryComboPoints(n, angles, radii, bits);
      const bPts = bPtsUnit.map((p): Point => [cx + p[0] * R, cy + p[1] * R]);
      ctx.strokeStyle = S.boundaryPolygon;
      ctx.lineWidth = S.outline.normal;
      ctx.setLineDash([]);
      ctx.beginPath();
      bPts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
      ctx.closePath();
      if (fillOpacity > 0) {
        ctx.fillStyle = S.boundaryPolygon;
        ctx.globalAlpha = fillOpacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.stroke();

      if (this.focusSeg !== null) {
        const fi = this.focusSeg;
        const fa0 = angles[fi];
        const fa1 = angles[fi + 1];
        const fr = radii[fi] * R;
        if (fr < R && fr >= 1) {
          const { apex, blueA0, blueA1 } = segmentTriangle(fa0, fa1, fr, R);
          const triPts: Point[] = [
            [cx + apex[0], cy + apex[1]],
            [cx + blueA0[0], cy + blueA0[1]],
            [cx + blueA1[0], cy + blueA1[1]],
          ];
          const count = triangleBoundaryCrossingCount(triPts, bPts);
          triCross = { segLetter: letters[fi], code: bits.join(''), count };
        }
      }
    }

    // segment letters
    ctx.font = 'bold 13px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = segAlpha(i);
      ctx.fillStyle = this.focusSeg === i ? S.focus : S.neutral;
      const mid = (angles[i] + angles[i + 1]) / 2;
      ctx.fillText(letters[i], cx + (R - 18) * Math.cos(mid), cy + (R - 18) * Math.sin(mid));
    }
    ctx.globalAlpha = 1;

    if (layers.perp || layers.perpOpp) {
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = segAlpha(i);
        const a0 = angles[i];
        const a1 = angles[i + 1];
        const r = radii[i] * R;
        if (r >= R) {
          continue;
        }
        const t = Math.sqrt(R * R - r * r);
        const ends = [
          {
            p: [cx + r * Math.cos(a1), cy + r * Math.sin(a1)] as Point,
            d: [-Math.sin(a1), Math.cos(a1)],
          },
          {
            p: [cx + r * Math.cos(a0), cy + r * Math.sin(a0)] as Point,
            d: [Math.sin(a0), -Math.cos(a0)],
          },
        ];
        ends.forEach(({ p, d }) => {
          const [px, py] = p;
          const [dx, dy] = d;
          if (layers.perp) {
            ctx.strokeStyle = S.tangentBlue;
            ctx.lineWidth = S.outline.normal;
            ctx.setLineDash(S.dash.tangent);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + t * dx, py + t * dy);
            ctx.stroke();
          }
          if (layers.perpOpp) {
            ctx.strokeStyle = S.tangentOpposite;
            ctx.lineWidth = S.outline.normal;
            ctx.setLineDash(S.dash.tangent);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - t * dx, py - t * dy);
            ctx.stroke();
          }
        });
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    if (layers.mid) {
      ctx.strokeStyle = S.midpoint;
      ctx.lineWidth = S.outline.normal;
      ctx.setLineDash(S.dash.midpoint);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = angles[i];
        const rHere = radii[i];
        const rPrev = radii[(i - 1 + n) % n];
        const rMid = ((rHere + rPrev) / 2) * R;
        const px = cx + rMid * Math.cos(a);
        const py = cy + rMid * Math.sin(a);
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      if (fillOpacity > 0) {
        ctx.fillStyle = S.midpoint;
        ctx.globalAlpha = fillOpacity;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const { segGroups, tangentTs, counts } = this.computeRatioData(
      n,
      angles,
      radii,
      R,
      cx,
      cy,
      S,
      layers,
      segAlpha
    );

    ctx.font = '14px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = segAlpha(i);
      ctx.fillStyle = S.neutral;
      const mid = (angles[i] + angles[i + 1]) / 2;
      ctx.fillText(String(counts[i]), cx + (R + 14) * Math.cos(mid), cy + (R + 14) * Math.sin(mid));
    }
    ctx.globalAlpha = 1;

    this.callbacks.onReadout({
      letters,
      counts,
      segGroups,
      tangentTs,
      focusSeg: this.focusSeg,
      triCross,
    });
  }

  /**
   * Ratio/chord data is always computed, independent of which layers are
   * visible — the source tool's data panel works even with the canvas
   * overlays switched off. Rendering (radials/reprojection/ratio labels) is
   * still gated by its own toggle inside this same pass.
   */
  private computeRatioData(
    n: number,
    angles: number[],
    radii: number[],
    R: number,
    cx: number,
    cy: number,
    S: SegmentTangentStyle,
    layers: LayerToggles,
    segAlpha: (i: number) => number
  ) {
    const ctx = this.ctx;
    interface RawPt {
      x: number;
      y: number;
      kind: 'blue' | 'purple';
      originAngle: number;
      origin: number;
    }
    const pts: RawPt[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = angles[i];
      const a1 = angles[i + 1];
      const r = radii[i] * R;
      if (r >= R) {
        continue;
      }
      const delta = Math.acos(r / R);
      const p1 = a1 + delta;
      const p2 = a0 - delta;
      pts.push({
        x: R * Math.cos(p1),
        y: R * Math.sin(p1),
        kind: 'blue',
        originAngle: a1,
        origin: i,
      });
      pts.push({
        x: R * Math.cos(p2),
        y: R * Math.sin(p2),
        kind: 'blue',
        originAngle: a0,
        origin: i,
      });
      const q1 = a1 - delta;
      const q2 = a0 + delta;
      pts.push({
        x: R * Math.cos(q1),
        y: R * Math.sin(q1),
        kind: 'purple',
        originAngle: a1,
        origin: i,
      });
      pts.push({
        x: R * Math.cos(q2),
        y: R * Math.sin(q2),
        kind: 'purple',
        originAngle: a0,
        origin: i,
      });
    }

    const counts = new Array(n).fill(0);
    const homes = pts.map((pt) => {
      const a = angleNorm(pt.x, pt.y);
      const idx = findSegment(a, angles, n);
      counts[idx]++;
      return idx;
    });

    const segGroups: SegmentRatioPoint[][] = Array.from({ length: n }, () => []);
    ctx.lineWidth = 1.1;

    pts.forEach((pt, k) => {
      ctx.globalAlpha = segAlpha(pt.origin);
      const j = homes[k];
      const a0 = angles[j];
      const a1 = angles[j + 1];
      const rj = radii[j] * R;
      const Qx = pt.x;
      const Qy = pt.y;
      const C0x = R * Math.cos(a0);
      const C0y = R * Math.sin(a0);
      const C1x = R * Math.cos(a1);
      const C1y = R * Math.sin(a1);
      const chordTs: { rust: number | null; cyan: number | null } = { rust: null, cyan: null };

      (
        [
          [a0, a1, S.radialCw, 'rust'],
          [a1, a0, S.radialCcw, 'cyan'],
        ] as const
      ).forEach(([mine, other, color, key]) => {
        let ux = Math.cos(mine);
        let uy = Math.sin(mine);
        if (ux * Qx + uy * Qy > 0) {
          ux = -ux;
          uy = -uy;
        }

        let bestS = Infinity;
        let bestPt: { x: number; y: number } | null = null;
        for (const s of lineCircleS(Qx, Qy, ux, uy, rj)) {
          if (s > 1e-6) {
            const px = Qx + s * ux;
            const py = Qy + s * uy;
            const a = angleNorm(px, py);
            const rel = (((a - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
            if (rel <= a1 - a0 + 1e-6 && s < bestS) {
              bestS = s;
              bestPt = { x: px, y: py };
            }
          }
        }
        const hit = lineRayS(Qx, Qy, ux, uy, other);
        if (hit && hit.s > 1e-6 && hit.m >= -1e-6 && hit.m <= R + 1e-6 && hit.s < bestS) {
          bestS = hit.s;
          bestPt = { x: Qx + hit.s * ux, y: Qy + hit.s * uy };
        }
        if (bestPt === null) {
          const s2 = -2 * (Qx * ux + Qy * uy);
          if (s2 > 1e-6) {
            bestS = s2;
            bestPt = { x: Qx + s2 * ux, y: Qy + s2 * uy };
          }
        }

        if (layers.radials && bestPt) {
          ctx.strokeStyle = color;
          ctx.setLineDash(S.dash.radial);
          ctx.beginPath();
          ctx.moveTo(cx + pt.x, cy + pt.y);
          ctx.lineTo(cx + bestPt.x, cy + bestPt.y);
          ctx.stroke();
        }
        chordTs[key] = lineChordT(Qx, Qy, ux, uy, C0x, C0y, C1x, C1y);
      });

      const wj = a1 - a0;
      const theta = (((angleNorm(Qx, Qy) - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const tux = -Math.sin(pt.originAngle);
      const tuy = Math.cos(pt.originAngle);
      const tangentChord = lineChordT(Qx, Qy, tux, tuy, C0x, C0y, C1x, C1y);
      let reprojRatio: number | null = null;
      if (tangentChord !== null) {
        const chordPtX = C0x + tangentChord * (C1x - C0x);
        const chordPtY = C0y + tangentChord * (C1y - C0y);
        const reprojAngle = angleNorm(chordPtX, chordPtY);
        const rel = (((reprojAngle - a0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        reprojRatio = rel / wj;

        if (layers.reproj) {
          const outX = R * Math.cos(reprojAngle);
          const outY = R * Math.sin(reprojAngle);
          const color = pt.kind === 'blue' ? S.tangentBlue : S.tangentOpposite;
          ctx.strokeStyle = color;
          ctx.lineWidth = S.outline.thin;
          ctx.setLineDash(S.dash.reproj);
          ctx.beginPath();
          ctx.moveTo(cx + chordPtX, cy + chordPtY);
          ctx.lineTo(cx + outX, cy + outY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cx + chordPtX, cy + chordPtY, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx + outX, cy + outY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      segGroups[j].push({
        ratioArc: theta / wj,
        rust: chordTs.rust,
        cyan: chordTs.cyan,
        kind: pt.kind,
        tangentChord,
        reprojRatio,
      });
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // per-segment guide chords + tangent crossing points against neighbor chords
    const tangentTs: TangentCrossings[] = [];
    if (layers.ratios) {
      ctx.strokeStyle = S.neutral;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash(S.dash.ratioGuide);
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.4 * segAlpha(i);
        const a0 = angles[i];
        const a1 = angles[i + 1];
        ctx.beginPath();
        ctx.moveTo(cx + R * Math.cos(a0), cy + R * Math.sin(a0));
        ctx.lineTo(cx + R * Math.cos(a1), cy + R * Math.sin(a1));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < n; i++) {
      const a0 = angles[i];
      const a1 = angles[i + 1];
      const ri = radii[i] * R;
      const C0x = R * Math.cos(a0);
      const C0y = R * Math.sin(a0);
      const C1x = R * Math.cos(a1);
      const C1y = R * Math.sin(a1);
      const prev = (i - 1 + n) % n;
      const next = (i + 1) % n;
      const PC0x = R * Math.cos(angles[prev]);
      const PC0y = R * Math.sin(angles[prev]);
      const PC1x = C0x;
      const PC1y = C0y;
      const NC0x = C1x;
      const NC0y = C1y;
      const NC1x = R * Math.cos(angles[next + 1]);
      const NC1y = R * Math.sin(angles[next + 1]);

      const P0x = ri * Math.cos(a0);
      const P0y = ri * Math.sin(a0);
      const purpleA0 = lineChordT(P0x, P0y, -Math.sin(a0), Math.cos(a0), C0x, C0y, C1x, C1y);
      const blueA0 = lineChordT(P0x, P0y, Math.sin(a0), -Math.cos(a0), PC0x, PC0y, PC1x, PC1y);

      const P1x = ri * Math.cos(a1);
      const P1y = ri * Math.sin(a1);
      const purpleA1 = lineChordT(P1x, P1y, Math.sin(a1), -Math.cos(a1), C0x, C0y, C1x, C1y);
      const blueA1 = lineChordT(P1x, P1y, -Math.sin(a1), Math.cos(a1), NC0x, NC0y, NC1x, NC1y);

      tangentTs.push({ purpleA0, purpleA1, blueA0, blueA1 });

      const chordDot = (t: number | null, cx0: number, cy0: number, cx1: number, cy1: number) => {
        if (t !== null && t >= 0 && t <= 1) {
          const mx = cx + cx0 + t * (cx1 - cx0);
          const my = cy + cy0 + t * (cy1 - cy0);
          ctx.beginPath();
          ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      if (layers.ratios) {
        ctx.globalAlpha = segAlpha(i);
        ctx.fillStyle = S.tangentOpposite;
        chordDot(purpleA0, C0x, C0y, C1x, C1y);
        chordDot(purpleA1, C0x, C0y, C1x, C1y);
        ctx.fillStyle = S.tangentBlue;
        chordDot(blueA0, PC0x, PC0y, PC1x, PC1y);
        chordDot(blueA1, NC0x, NC0y, NC1x, NC1y);
      }
    }
    ctx.globalAlpha = 1;

    return { segGroups, tangentTs, counts };
  }
}
