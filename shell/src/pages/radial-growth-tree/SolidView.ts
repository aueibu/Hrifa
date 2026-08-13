import * as THREE from 'three';
import { SOLIDS } from '../../data/polyhedra';
import type { SolidViewStyle } from '../../theme/diagram';
import { projectSourcePoints, type SourceOpts } from './pointPlacement';

/**
 * 3D solid view (Three.js). Shows the solid in its own frame, its projection
 * axis, the toroidal lattice plane, and — when enabled — drop lines from each
 * active source point down to its snapped lattice cell. Colors come entirely
 * from the shell theme via `resolveSolidViewStyle`; THREE.Color can't parse the
 * palette's oklch(), so each role color is converted to hex through a probe
 * canvas.
 */

let colorProbe: CanvasRenderingContext2D | null = null;
/** Convert any CSS color string (oklch/rgb/hex/named) to a THREE-friendly 0xRRGGBB. */
function toHex(color: string): number {
  if (!colorProbe) {
    colorProbe = document.createElement('canvas').getContext('2d');
  }
  if (!colorProbe) {
    return 0x808080;
  }
  colorProbe.canvas.width = 1;
  colorProbe.canvas.height = 1;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = '#808080';
  colorProbe.fillStyle = color;
  colorProbe.fillRect(0, 0, 1, 1);
  const [r, g, b] = colorProbe.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}

interface UpdateArgs {
  solidKey: string;
  n: number;
  opts: SourceOpts;
  showDropLines: boolean;
}

export class SolidView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly group: THREE.Group;
  private rotY = 0.6;
  private rotX = -0.35;
  private autoRotate = true;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private frame: number | null = null;
  private sizedW = 0;
  private sizedH = 0;
  private last: UpdateArgs | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: () => SolidViewStyle
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.55);
    dl.position.set(5, 8, 6);
    this.scene.add(dl);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointermove', this.onPointerMove);

    const animate = () => {
      this.frame = requestAnimationFrame(animate);
      this.syncSize();
      if (this.autoRotate) {
        this.rotY += 0.0035;
      }
      this.group.rotation.y = this.rotY;
      this.group.rotation.x = this.rotX;
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  /** Track the canvas's display size each frame, independent of ResizeObserver timing. */
  private syncSize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h || (this.sizedW === w && this.sizedH === h)) {
      return;
    }
    this.sizedW = w;
    this.sizedH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };
  private onPointerUp = () => {
    this.dragging = false;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) {
      return;
    }
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.rotY += dx * 0.008;
    this.rotX = Math.max(-1.4, Math.min(1.4, this.rotX + dy * 0.008));
    this.autoRotate = false;
    this.onAutoRotateOff?.();
  };

  /** Notifies the page when a drag disables auto-rotation, so its toggle can follow. */
  onAutoRotateOff: (() => void) | null = null;

  setAutoRotate(on: boolean) {
    this.autoRotate = on;
  }

  /** Re-apply the current theme (called on color-scheme change). */
  restyle() {
    if (this.last) {
      this.rebuild(this.last);
    }
  }

  update(args: UpdateArgs) {
    this.last = args;
    this.rebuild(args);
  }

  private rebuild({ solidKey, n, opts, showDropLines }: UpdateArgs) {
    const solid = SOLIDS[solidKey];
    if (!solid) {
      return;
    }
    const style = this.style();
    const group = this.group;
    while (group.children.length) {
      group.remove(group.children[0]);
    }

    // wireframe reference is always vertices+edges, regardless of source toggles
    const vertProj = projectSourcePoints(solidKey, n, {
      vertices: true,
      edges: false,
      faces: false,
    });
    const s = vertProj[0].scale;
    const c = vertProj[0].center;
    const planeHalf = c / s; // constant across N

    // scene axes: scene.X = solid.x, scene.Y = solid.z (drop axis), scene.Z = -solid.y
    const toScene = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

    const zVals = vertProj.map((p) => p.z);
    const maxAbsZ = Math.max(...zVals.map(Math.abs), 1e-6);
    const extent = Math.max(planeHalf, maxAbsZ);
    const planeY = -(maxAbsZ + extent * 0.55);

    // vertices (structural reference dots)
    const vertGeom = new THREE.SphereGeometry(Math.max(0.03, extent * 0.02), 12, 12);
    const vertMat = new THREE.MeshBasicMaterial({ color: toHex(style.wireframeVertex) });
    vertProj.forEach((p) => {
      const m = new THREE.Mesh(vertGeom, vertMat);
      m.position.copy(toScene(p.x, p.y, p.z));
      group.add(m);
    });

    // edges (solid wireframe)
    const edgeMat = new THREE.LineBasicMaterial({ color: toHex(style.wireframeEdge) });
    solid.edges.forEach(([i, j]) => {
      const a = solid.v[i];
      const b = solid.v[j];
      const g = new THREE.BufferGeometry().setFromPoints([
        toScene(a[0], a[1], a[2]),
        toScene(b[0], b[1], b[2]),
      ]);
      group.add(new THREE.Line(g, edgeMat));
    });

    // projection axis, dashed, through the whole vertical extent
    const axisMat = new THREE.LineDashedMaterial({
      color: toHex(style.axis),
      dashSize: 0.12,
      gapSize: 0.08,
    });
    const axisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, maxAbsZ * 1.3, 0),
      new THREE.Vector3(0, planeY - 0.2, 0),
    ]);
    const axisLine = new THREE.Line(axisGeom, axisMat);
    axisLine.computeLineDistances();
    group.add(axisLine);

    // grid plane (the toroidal lattice Z_N^2)
    const divisions = Math.max(4, Math.min(n, 48));
    const grid = new THREE.GridHelper(
      planeHalf * 2,
      divisions,
      toHex(style.gridMain),
      toHex(style.gridSub)
    );
    grid.position.set(0, planeY, 0);
    (grid.material as THREE.Material).opacity = style.opacity.gridPlane;
    (grid.material as THREE.Material).transparent = true;
    group.add(grid);

    // drop lines: source point -> continuous shadow -> snapped lattice cell
    if (showDropLines) {
      const originColors = style.originColors;
      const sourceProj = projectSourcePoints(solidKey, n, opts);
      const baseR = Math.max(0.03, extent * 0.022);
      const landCells = new Map<
        string,
        { snapped: THREE.Vector3; weight: number; origin: keyof typeof originColors }
      >();
      sourceProj.forEach((p) => {
        const colorHex = toHex(originColors[p.origin]);
        const dropMat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: style.opacity.dropLine,
        });
        const snapMat = new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: style.opacity.snapLine,
        });
        const top = toScene(p.x, p.y, p.z);
        const shadow = new THREE.Vector3(p.x, planeY, -p.y);
        const snappedX = (p.u - c) / s;
        const snappedZ = -(p.v - c) / s;
        const snapped = new THREE.Vector3(snappedX, planeY, snappedZ);

        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, shadow]), dropMat));
        if (shadow.distanceTo(snapped) > 1e-4) {
          group.add(
            new THREE.Line(new THREE.BufferGeometry().setFromPoints([shadow, snapped]), snapMat)
          );
        }
        const key = `${p.u},${p.v}|${p.origin}`;
        const existing = landCells.get(key);
        if (existing) {
          existing.weight += 1;
        } else {
          landCells.set(key, { snapped, weight: 1, origin: p.origin });
        }
      });

      // one landing marker per (cell, origin type), sized by sqrt(weight)
      landCells.forEach(({ snapped, weight, origin }) => {
        const r = baseR * Math.sqrt(weight);
        const landMark = new THREE.Mesh(
          new THREE.SphereGeometry(r, 12, 12),
          new THREE.MeshBasicMaterial({ color: toHex(originColors[origin]) })
        );
        landMark.position.copy(snapped);
        group.add(landMark);
      });
    }

    const dist = extent * 4.3;
    this.camera.position.set(dist * 0.62, dist * 0.5, dist * 0.75);
    this.camera.lookAt(0, planeY * 0.35, 0);
  }

  destroy() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
    }
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.dispose();
  }
}
