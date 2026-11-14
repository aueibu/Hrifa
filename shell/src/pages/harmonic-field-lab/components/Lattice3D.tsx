/**
 * The 3D lattice (three.js): notes as spheres at their prime-exponent coordinates, lattice steps as lines, billboarded
 * ratio labels (CSS2DRenderer, so the label colours are plain CSS), orbit controls. Colours are read from the theme's
 * CSS custom properties at run time and re-read when the colour scheme changes. Loaded lazily (three.js is large) and
 * only where WebGL exists. Every renderer, geometry and material is disposed on unmount.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { fmtHidden, type Lattice3d } from '../../../lib/harmonic-field';
import { markHue } from '../../../theme/diagram';
import { stemHue } from '../state/derive';
import classes from './panels.module.css';

/** Sphere radius in lattice units (one prime step is 1). */
const R = 0.14;

interface Palette {
  text: THREE.Color;
  muted: THREE.Color;
  subtle: THREE.Color;
  grid: THREE.Color;
  lit: THREE.Color;
  chord: THREE.Color;
  pin: THREE.Color;
}
const VARS: Record<keyof Palette, string> = {
  text: '--text',
  muted: '--text-muted',
  subtle: '--text-subtle',
  grid: '--grid',
  lit: '--mark-green',
  chord: '--mark-blue',
  pin: '--mark-yellow',
};

/**
 * A theme colour as a three.js colour. Categorical hues (`--mark-<hue>`) come from `markHue` (a hex string, as the
 * theme contract says); neutral roles can be color-mix() expressions, so they are resolved through computed style and a
 * 1 px canvas, which turns any CSS colour into RGB.
 */
function resolveColor(host: HTMLElement, varName: string): THREE.Color {
  const hueName = /^--mark-(.+)$/.exec(varName)?.[1];
  if (hueName) {
    const hex = markHue(host)(hueName);
    if (hex) {
      return new THREE.Color(hex);
    }
  }
  const probe = document.createElement('span');
  probe.style.color = `var(${varName})`;
  host.appendChild(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  const out = new THREE.Color();
  try {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return out.setRGB(0.5, 0.5, 0.5);
    }
    ctx.canvas.width = 1;
    ctx.canvas.height = 1;
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return out.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  } catch {
    return out.setRGB(0.5, 0.5, 0.5);
  }
}

export interface SceneState {
  hover: number | null;
  pin: number | null;
  chord: ReadonlySet<number>;
  lit: ReadonlySet<number>;
  on: ReadonlySet<number>;
  labels: boolean;
}
interface SceneCallbacks {
  onHover: (i: number | null) => void;
  /** `alt`: Alt was held (pin instead of toggle). */
  onPick: (i: number, alt: boolean) => void;
}
interface Node {
  i: number;
  folded: boolean;
  mesh: THREE.Mesh;
  chordHalo: THREE.Mesh;
  selHalo: THREE.Mesh;
  pinHalo: THREE.Mesh;
  label: CSS2DObject;
}

/** The whole scene behind one host element. Returns the handles the React component drives, and `dispose`. */
function createScene(host: HTMLElement, cb: SceneCallbacks, labelOf: (i: number) => string) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const overlay = new CSS2DRenderer();
  overlay.domElement.className = classes.lat3dOverlay;
  renderer.domElement.className = classes.lat3dCanvas;
  host.append(renderer.domElement, overlay.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  const group = new THREE.Group();
  scene.add(group);

  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const mats = {
    on: new THREE.MeshBasicMaterial(),
    off: new THREE.MeshBasicMaterial(),
    lit: new THREE.MeshBasicMaterial(),
    chord: new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    sel: new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    pin: new THREE.MeshBasicMaterial({ side: THREE.BackSide }),
    edgeOn: new THREE.LineBasicMaterial(),
    edgeOff: new THREE.LineBasicMaterial(),
    edgeChord: new THREE.LineBasicMaterial(),
    axis: new THREE.LineBasicMaterial(),
  };
  /** One dashed material per hidden prime, in that prime's hue. */
  const stemMats = new Map<number, THREE.LineDashedMaterial>();
  const stemMat = (prime: number) => {
    let m = stemMats.get(prime);
    if (!m) {
      m = new THREE.LineDashedMaterial({ dashSize: 0.12, gapSize: 0.08 });
      m.color.copy(resolveColor(host, `--mark-${stemHue(prime)}`));
      stemMats.set(prime, m);
    }
    return m;
  };
  const applyPalette = () => {
    const p = {} as Palette;
    for (const k of Object.keys(VARS) as (keyof Palette)[]) {
      p[k] = resolveColor(host, VARS[k]);
    }
    mats.on.color.copy(p.text);
    mats.off.color.copy(p.subtle);
    mats.lit.color.copy(p.lit);
    mats.chord.color.copy(p.chord);
    mats.sel.color.copy(p.text);
    mats.pin.color.copy(p.pin);
    mats.edgeOn.color.copy(p.muted);
    mats.edgeOff.color.copy(p.grid);
    mats.edgeChord.color.copy(p.chord);
    mats.axis.color.copy(p.subtle);
    stemMats.forEach((m, prime) => m.color.copy(resolveColor(host, `--mark-${stemHue(prime)}`)));
  };
  applyPalette();

  let frame = 0;
  let disposed = false;
  const render = () => {
    frame = 0;
    if (disposed) {
      return;
    }
    renderer.render(scene, camera);
    overlay.render(scene, camera);
  };
  const requestRender = () => {
    if (!frame && !disposed) {
      frame = requestAnimationFrame(render);
    }
  };
  controls.addEventListener('change', requestRender);

  /* ------------------------------------------------------------------------------------------- content */
  let nodes: Node[] = [];
  let data: Lattice3d | null = null;
  let edgeObjs: THREE.LineSegments[] = [];
  let axisObjs: (THREE.Line | CSS2DObject)[] = [];
  let stemObjs: (THREE.LineSegments | CSS2DObject)[] = [];
  let state: SceneState | null = null;
  let home = { pos: new THREE.Vector3(4, 3, 6), target: new THREE.Vector3() };
  let needFit = true;

  const clearContent = () => {
    nodes.forEach((n) => {
      group.remove(n.mesh);
      n.label.element.remove();
      n.mesh.remove(n.label);
    });
    nodes = [];
    edgeObjs.forEach((e) => {
      group.remove(e);
      e.geometry.dispose();
    });
    edgeObjs = [];
    axisObjs.forEach((o) => {
      group.remove(o);
      if (o instanceof THREE.Line) {
        o.geometry.dispose();
      } else {
        o.element.remove();
      }
    });
    axisObjs = [];
    stemObjs.forEach((o) => {
      group.remove(o);
      if (o instanceof THREE.LineSegments) {
        o.geometry.dispose();
      } else {
        o.element.remove();
      }
    });
    stemObjs = [];
  };

  const fit = () => {
    const box = new THREE.Box3();
    box.expandByPoint(new THREE.Vector3());
    nodes.forEach((n) => box.expandByPoint(n.mesh.position));
    data?.pts.forEach((p) => box.expandByPoint(new THREE.Vector3(...p.base)));
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(1, box.getBoundingSphere(new THREE.Sphere()).radius + 0.3);
    const aspect = camera.aspect || 1;
    const half = Math.min(
      THREE.MathUtils.degToRad(camera.fov) / 2,
      Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * aspect)
    );
    const dist = r / Math.sin(half);
    const dir = new THREE.Vector3(0.45, 0.7, 0.35).normalize();
    home = { pos: c.clone().addScaledVector(dir, dist), target: c };
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    camera.far = dist * 6;
    camera.updateProjectionMatrix();
    controls.update();
    requestRender();
  };

  const label = (text: string, cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    return new CSS2DObject(el);
  };

  const setData = (l: Lattice3d) => {
    clearContent();
    data = l;
    for (const p of l.pts) {
      const mesh = new THREE.Mesh(sphere, mats.on);
      mesh.position.set(...p.pos);
      mesh.userData.i = p.i;
      const chordHalo = new THREE.Mesh(sphere, mats.chord);
      const selHalo = new THREE.Mesh(sphere, mats.sel);
      const pinHalo = new THREE.Mesh(sphere, mats.pin);
      chordHalo.scale.setScalar(1.55);
      selHalo.scale.setScalar(2.1);
      pinHalo.scale.setScalar(2.5);
      pinHalo.visible = false;
      chordHalo.visible = false;
      selHalo.visible = false;
      mesh.add(chordHalo, selHalo, pinHalo);
      const lab = label(labelOf(p.i), classes.lat3dLabel);
      for (const h of p.hidden) {
        const chip = document.createElement('span');
        chip.className = classes.lat3dChip;
        chip.style.color = `var(--mark-${stemHue(h.prime)})`;
        chip.textContent = fmtHidden(h);
        lab.element.append(chip);
      }
      if (p.folded) {
        const ghost = new CSS2DObject(
          Object.assign(document.createElement('div'), { className: classes.lat3dGhost })
        );
        ghost.position.set(...p.base);
        group.add(ghost);
        stemObjs.push(ghost);
      }
      lab.position.set(0, 2.7, 0); // above the sphere (in sphere radii, the mesh is scaled)
      mesh.add(lab);
      group.add(mesh);
      nodes.push({ i: p.i, folded: p.folded, mesh, chordHalo, selHalo, pinHalo, label: lab });
    }
    // one dashed segment set per hidden prime
    const byPrime = new Map<number, THREE.Vector3[]>();
    for (const p of l.pts) {
      for (const sg of p.stems) {
        const list = byPrime.get(sg.prime) ?? [];
        list.push(new THREE.Vector3(...sg.from), new THREE.Vector3(...sg.to));
        byPrime.set(sg.prime, list);
      }
    }
    byPrime.forEach((pts, prime) => {
      const seg = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        stemMat(prime)
      );
      seg.computeLineDistances();
      group.add(seg);
      stemObjs.push(seg);
    });
    // the three axes, from the origin to just past the farthest note, each named by its prime
    const extent = [0, 1, 2].map((a) => Math.max(1, ...l.pts.map((p) => Math.abs(p.pos[a]))) + 0.7);
    l.axes.forEach((prime, a) => {
      const tip = new THREE.Vector3();
      tip.setComponent(a, extent[a]);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), tip]);
      const line = new THREE.Line(geo, mats.axis);
      const name = label(String(prime), classes.lat3dAxis);
      name.position.copy(tip);
      group.add(line, name);
      axisObjs.push(line, name);
    });
    needFit = true;
    if (renderer.domElement.clientWidth > 0) {
      fit();
      needFit = false;
    }
    if (state) {
      setState(state);
    }
  };

  const setState = (s: SceneState) => {
    state = s;
    const shown = s.hover;
    for (const n of nodes) {
      const lit = s.lit.has(n.i);
      const on = s.on.has(n.i);
      n.mesh.material = lit ? mats.lit : on ? mats.on : mats.off;
      const k = (lit ? 1.45 : on ? 1 : 0.7) * R;
      n.mesh.scale.setScalar(k);
      n.label.position.set(0, 2.7, 0);
      n.chordHalo.visible = s.chord.has(n.i);
      n.selHalo.visible = s.hover === n.i;
      n.pinHalo.visible = s.pin === n.i;
      n.label.visible = s.labels;
      n.label.element.dataset.on = String(on);
      n.label.element.dataset.lit = String(lit);
      n.label.element.dataset.sel = String(shown === n.i);
    }
    // edges: one geometry per class (chord, both ends in the subset, the rest), rebuilt because the classes change
    edgeObjs.forEach((e) => {
      group.remove(e);
      e.geometry.dispose();
    });
    edgeObjs = [];
    if (data) {
      const at = new Map(nodes.map((n) => [n.i, n.mesh.position]));
      const bucket: Record<'chord' | 'on' | 'off', THREE.Vector3[]> = {
        chord: [],
        on: [],
        off: [],
      };
      for (const [a, b] of data.edges) {
        const pa = at.get(a);
        const pb = at.get(b);
        if (!pa || !pb) {
          continue;
        }
        const cls =
          s.chord.has(a) && s.chord.has(b) ? 'chord' : s.on.has(a) && s.on.has(b) ? 'on' : 'off';
        bucket[cls].push(pa, pb);
      }
      for (const [cls, mat] of [
        ['off', mats.edgeOff],
        ['on', mats.edgeOn],
        ['chord', mats.edgeChord],
      ] as const) {
        if (bucket[cls].length) {
          const seg = new THREE.LineSegments(
            new THREE.BufferGeometry().setFromPoints(bucket[cls]),
            mat
          );
          group.add(seg);
          edgeObjs.push(seg);
        }
      }
    }
    requestRender();
  };

  const reset = () => {
    camera.position.copy(home.pos);
    controls.target.copy(home.target);
    controls.update();
    requestRender();
  };

  /* ------------------------------------------------------------------------------------- size, scheme */
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w < 2 || h < 2) {
      return;
    }
    renderer.setSize(w, h, false);
    overlay.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (needFit && nodes.length) {
      fit();
      needFit = false;
    }
    requestRender();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const onScheme = () => {
    applyPalette();
    requestRender();
  };
  const mo = new MutationObserver(onScheme);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-mantine-color-scheme', 'class', 'style'],
  });
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', onScheme);

  /* ----------------------------------------------------------------------------------------- pointing */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hit = (e: PointerEvent): number | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const found = ray.intersectObjects(
      nodes.map((n) => n.mesh),
      false
    )[0];
    return found ? (found.object.userData.i as number) : null;
  };
  let hovered: number | null = null;
  let down: { x: number; y: number } | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.buttons) {
      return; // dragging the camera
    }
    const i = hit(e);
    if (i !== hovered) {
      hovered = i;
      renderer.domElement.style.cursor = i === null ? '' : 'pointer';
      cb.onHover(i);
    }
  };
  const onLeave = () => {
    if (hovered !== null) {
      hovered = null;
      renderer.domElement.style.cursor = '';
      cb.onHover(null);
    }
  };
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && e.button === 0) {
      const i = hit(e);
      if (i !== null) {
        cb.onPick(i, e.altKey);
      }
    }
    down = null;
  };
  const el = renderer.domElement;
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);

  const dispose = () => {
    disposed = true;
    if (frame) {
      cancelAnimationFrame(frame);
    }
    ro.disconnect();
    mo.disconnect();
    media?.removeEventListener?.('change', onScheme);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    controls.removeEventListener('change', requestRender);
    controls.dispose();
    clearContent();
    sphere.dispose();
    Object.values(mats).forEach((m) => m.dispose());
    stemMats.forEach((m) => m.dispose());
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    overlay.domElement.remove();
  };

  return { setData, setState, reset, dispose };
}

interface Props {
  /** The lattice to draw (three prime axes; see `lattice3dOf`). */
  data: Lattice3d;
  /** Ratio text of each field note, by field index (the sphere labels). */
  names: readonly string[];
  /** What is lit, selected, highlighted, pointed at and pinned, and whether to show the labels. */
  scene: SceneState;
  onHover: (i: number | null) => void;
  onPick: (i: number, alt: boolean) => void;
  /** Called once when the renderer cannot be created (WebGL refused after all); the parent shows the 2D note instead. */
  onError?: () => void;
  /** Bump to put the camera back at its starting view. */
  resetKey: number;
  big?: boolean;
}

/**
 * The 3D lattice as a presentational component: everything it shows comes from props. The scene object (renderer,
 * camera) is created once; the data and the state are kept in refs and re-applied right after the scene is created, so
 * a recreated scene (a remount) is never left empty.
 */
export default function Lattice3D({
  data,
  names,
  scene: sceneState,
  onHover,
  onPick,
  onError,
  resetKey,
  big,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ReturnType<typeof createScene> | null>(null);
  const latest = useRef({ data, names, sceneState, onHover, onPick, onError });
  latest.current = { data, names, sceneState, onHover, onPick, onError };

  useEffect(() => {
    const el = host.current;
    if (!el) {
      return;
    }
    let scene: ReturnType<typeof createScene>;
    try {
      scene = createScene(
        el,
        {
          onHover: (i) => latest.current.onHover(i),
          onPick: (i, alt) => latest.current.onPick(i, alt),
        },
        (i) => latest.current.names[i] ?? ''
      );
    } catch {
      // the renderer could not be created (context limit, blocked GPU): fall back to the no-WebGL note
      latest.current.onError?.();
      return;
    }
    api.current = scene;
    scene.setData(latest.current.data);
    scene.setState(latest.current.sceneState);
    return () => {
      scene.dispose();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    api.current?.setData(data);
  }, [data, names]);
  useEffect(() => {
    api.current?.setState(sceneState);
  }, [sceneState, data, names]);
  const firstReset = useRef(resetKey);
  useEffect(() => {
    if (resetKey !== firstReset.current) {
      api.current?.reset();
    }
  }, [resetKey]);

  return (
    <div
      ref={host}
      className={classes.lat3dHost}
      data-big={big ? 'true' : undefined}
      role="group"
      aria-label="3D lattice of the field, notes placed by prime exponents"
    />
  );
}
