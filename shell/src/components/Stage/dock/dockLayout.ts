/**
 * Geometry of a split tree for the dock Stage (pure, no DOM): where every docker and every splitter sits in a box, in
 * rem, measured from the box's top-left corner. The component positions dockers ABSOLUTELY from these rectangles so a
 * docker's DOM element is keyed by its id and never remounts when the tree changes shape (a split wrapping it, a
 * neighbour appearing); that is what keeps a panel's scroll and focus across a move.
 *
 * Sizes come from the M2 solver (`splitChildSizes`, `solveTree`); nothing here decides a size.
 */
import {
  SIZE_MIN_HEIGHT_REM,
  SIZE_MIN_WIDTH_REM,
  SPLITTER_REM,
  SPLIT_MAX_DEPTH,
  dockerHolding,
  nodeMin,
  defaultDockerName,
  makeDocker,
  mapDocker,
  nextDockerId,
  recordPlace,
  usedDockerIds,
  solveTree,
  splitChildSizes,
  isDocker,
  treeDepth,
  treeDockers,
  type Docker,
  type Edge,
  type PanelId,
  type Target,
  type DockerState,
  type Screenset,
  type SolveOptions,
  type TreeNode,
} from '../../../lib/stage';

export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DockerPlacement extends DockRect {
  docker: Docker;
  state: DockerState;
  /** The direction of the split the docker sits in (a strip is thin along this axis); undefined for a lone root. */
  parentDir?: 'row' | 'column';
}

export interface SplitterPlacement extends DockRect {
  key: string;
  /** Child indexes from the root to the split. */
  path: number[];
  /** The splitter sits between children `index` and `index + 1`. */
  index: number;
  /** The split's direction: `row` splits get a vertical bar, `column` splits a horizontal one. */
  dir: 'row' | 'column';
  /** The split's length along its axis, rem (what `resizeSplit` wants). */
  length: number;
  /** The first child's size now, and the bounds it may take (rem). */
  now: number;
  min: number;
  max: number;
  /** Names of the first docker on each side, for the accessible label. */
  before: string;
  after: string;
}

export interface TreeGeometry {
  dockers: DockerPlacement[];
  splitters: SplitterPlacement[];
}

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** The geometry of `s.tree` in a `width` by `height` rem box. */
export function layoutTree(
  s: Pick<Screenset, 'tree' | 'collapsed'>,
  width: number,
  height: number,
  opts: SolveOptions = {}
): TreeGeometry {
  const sizeOpts: SolveOptions = { collapsed: s.collapsed, ...opts };
  const w0 = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h0 = Number.isFinite(height) ? Math.max(0, height) : 0;
  const boxes = solveTree(s.tree, w0, h0, sizeOpts);
  const dockers: DockerPlacement[] = [];
  const splitters: SplitterPlacement[] = [];

  const visit = (
    node: TreeNode,
    rect: DockRect,
    path: number[],
    parentDir: 'row' | 'column' | undefined
  ) => {
    if (isDocker(node)) {
      dockers.push({
        ...rect,
        docker: node,
        state: boxes.get(node.id)?.state ?? 'open',
        parentDir,
      });
      return;
    }
    const row = node.dir === 'row';
    const length = row ? rect.width : rect.height;
    const sizes = splitChildSizes(node, length, sizeOpts);
    const axis = row ? 'width' : 'height';
    let at = row ? rect.x : rect.y;
    node.children.forEach((c, i) => {
      const along = sizes[i];
      const childRect: DockRect = row
        ? { x: round4(at), y: rect.y, width: along, height: rect.height }
        : { x: rect.x, y: round4(at), width: rect.width, height: along };
      visit(c.node, childRect, [...path, i], node.dir);
      at += along;
      const next = node.children[i + 1];
      if (next) {
        const total = along + sizes[i + 1];
        const lo = Math.max(nodeMin(c.node, axis, sizeOpts), c.min ?? 0);
        const hi = total - Math.max(nodeMin(next.node, axis, sizeOpts), next.min ?? 0);
        splitters.push({
          key: `${path.join('.')}/${i}`,
          path,
          index: i,
          dir: node.dir,
          length,
          now: along,
          min: lo,
          max: Math.max(lo, hi),
          before: treeDockers(c.node)[0]?.name ?? '',
          after: treeDockers(next.node)[0]?.name ?? '',
          ...(row
            ? { x: round4(at), y: rect.y, width: SPLITTER_REM, height: rect.height }
            : { x: rect.x, y: round4(at), width: rect.width, height: SPLITTER_REM }),
        });
        at += SPLITTER_REM;
      }
    });
  };
  visit(s.tree, { x: 0, y: 0, width: w0, height: h0 }, [], undefined);
  return { dockers, splitters };
}

/* ------------------------------------------------------------------------------------------------ drag-to-dock */
/**
 * What a drop produces: a `Target` of the M2 `sendTo` (join as a tab, or a new docker beside a docker), or a split at the
 * Stage root (a new docker spanning a whole edge). The root split is not a `Target`: it is built from `sendTo` plus a
 * wrap of the whole tree (`sendToRoot`).
 */
export type DropTarget = Target | { kind: 'root'; edge: Edge };

export type DropZone = 'center' | 'tabs' | Edge | `root-${Edge}`;

/** The rectangles of one open docker's tab strip, in rem from the Stage root's corner (read from the DOM at drag start). */
export interface TabStripGeometry {
  strip: DockRect;
  /** One rectangle per tab, in tab order. */
  tabs: readonly DockRect[];
}

export interface DropInput {
  dockers: readonly DockerPlacement[];
  /** The Stage's size, rem. */
  stage: { width: number; height: number };
  /** Tab strips of the open dockers (a docker without one accepts a centre drop as append). */
  strips?: ReadonlyMap<string, TabStripGeometry>;
  /** The dragged panel (its docker decides what a same-docker drop means). */
  panel: PanelId;
  /** The pointer, rem from the Stage root's corner. */
  point: { x: number; y: number };
  /** What a docker needs along each axis to be worth splitting (default: the Stage minimum). */
  minWidth?: number;
  minHeight?: number;
}

export interface DropResult {
  target: DropTarget;
  /** The rectangle to preview, rem from the Stage root's corner. */
  preview: DockRect;
  /** The docker the pointer is over (undefined for a root-band drop). */
  docker?: string;
  zone: DropZone;
  /** Dropping would change nothing (same docker, same place): the UI shows no preview and applies nothing. */
  noop: boolean;
}

/** Width of the Stage root's outer band that splits at the root, rem. */
export const ROOT_BAND_REM = 1;
/** Edge bands are a quarter of the docker's smaller side, never thinner than this, rem. */
export const EDGE_BAND_MIN_REM = 1.5;
const EDGE_BAND_SHARE = 0.25;
const INSERT_MARK_REM = 0.125;

const EDGES: readonly Edge[] = ['left', 'right', 'top', 'bottom'];
const inside = (r: DockRect, p: { x: number; y: number }) =>
  p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

/** The half of `r` on `edge`. */
const half = (r: DockRect, edge: Edge): DockRect => {
  const w = r.width / 2;
  const h = r.height / 2;
  switch (edge) {
    case 'left':
      return { x: r.x, y: r.y, width: w, height: r.height };
    case 'right':
      return { x: r.x + w, y: r.y, width: w, height: r.height };
    case 'top':
      return { x: r.x, y: r.y, width: r.width, height: h };
    default:
      return { x: r.x, y: r.y + h, width: r.width, height: h };
  }
};

/**
 * Where a drop at `point` would go, and what to preview. Pure (no DOM). Order of decisions:
 * 1. outside the Stage: null;
 * 2. the Stage's outer band (ROOT_BAND_REM): a root split on the nearest edge, except over a tab strip or a docker
 *    that is only a strip (those keep their own drop);
 * 3. no docker under the pointer (a splitter, a gap): null;
 * 4. a docker that is not open (empty, collapsed, narrow-hidden): join only (append);
 * 5. an open docker: over its tab strip the join index comes from the tab positions; else an edge band (a quarter of
 *    the docker's smaller side, at least EDGE_BAND_MIN_REM) splits on that edge when both halves would still meet the
 *    minimum (and the dragged panel is not the only tab of that docker: `sendTo` refuses that); else the centre joins
 *    as the last tab.
 * The `index` of a docker target counts tabs WITHOUT the dragged panel (what `sendTo` expects).
 */
export function dropTarget(input: DropInput): DropResult | null {
  const { dockers, stage, strips, panel, point } = input;
  const minW = input.minWidth ?? SIZE_MIN_WIDTH_REM;
  const minH = input.minHeight ?? SIZE_MIN_HEIGHT_REM;
  if (!(point.x >= 0 && point.y >= 0 && point.x < stage.width && point.y < stage.height)) {
    return null;
  }
  const source = dockers.find((p) => p.docker.tabs.includes(panel));
  const onlyTab = (id: string) => source?.docker.id === id && source.docker.tabs.length === 1;

  // 2. the root band
  const toEdge = {
    left: point.x,
    right: stage.width - point.x,
    top: point.y,
    bottom: stage.height - point.y,
  };
  const rootEdge = EDGES.filter((e) => toEdge[e] < ROOT_BAND_REM).sort(
    (a, b) => toEdge[a] - toEdge[b]
  )[0];
  const canRoot = dockers.some((p) => !onlyTab(p.docker.id));
  // a tab strip (or a docker that is only a strip) at the Stage edge keeps its own drop: the band never covers it
  const under = dockers.find((p) => inside(p, point));
  const geoUnder = under ? strips?.get(under.docker.id) : undefined;
  const onStrip =
    !!under && (under.state !== 'open' || (!!geoUnder && inside(geoUnder.strip, point)));
  if (rootEdge && canRoot && !onStrip) {
    const row = rootEdge === 'left' || rootEdge === 'right';
    const thick = (row ? stage.width : stage.height) * EDGE_BAND_SHARE;
    const preview: DockRect = row
      ? {
          x: rootEdge === 'left' ? 0 : stage.width - thick,
          y: 0,
          width: thick,
          height: stage.height,
        }
      : {
          x: 0,
          y: rootEdge === 'top' ? 0 : stage.height - thick,
          width: stage.width,
          height: thick,
        };
    return {
      target: { kind: 'root', edge: rootEdge },
      preview,
      zone: `root-${rootEdge}`,
      noop: false,
    };
  }

  // 3. the docker under the pointer
  const over = dockers.find((p) => inside(p, point));
  if (!over) {
    return null;
  }
  const id = over.docker.id;
  const sameDocker = source?.docker.id === id;
  const join = (
    index: number | undefined,
    preview: DockRect,
    zone: DropZone,
    changes: boolean
  ): DropResult => ({
    target: { kind: 'docker', docker: id, index },
    preview,
    docker: id,
    zone,
    noop: sameDocker && !changes,
  });

  // 4. not open: a centre drop only
  if (over.state !== 'open') {
    return join(undefined, over, 'center', false);
  }

  // 5a. over the tab strip: the insertion index
  const geo = strips?.get(id);
  if (geo && inside(geo.strip, point)) {
    const tabs = geo.tabs;
    const pos = tabs.filter((t) => point.x > t.x + t.width / 2).length;
    const own = source && sameDocker ? source.docker.tabs.indexOf(panel) : -1;
    const index = own >= 0 && own < pos ? pos - 1 : pos;
    const last = tabs[tabs.length - 1];
    const markX = pos < tabs.length ? tabs[pos].x : last ? last.x + last.width : geo.strip.x;
    const mark: DockRect = {
      x: markX - INSERT_MARK_REM / 2,
      y: geo.strip.y,
      width: INSERT_MARK_REM,
      height: geo.strip.height,
    };
    return join(index, mark, 'tabs', own < 0 || index !== own);
  }

  // 5b. edge bands
  const band = Math.max(EDGE_BAND_MIN_REM, EDGE_BAND_SHARE * Math.min(over.width, over.height));
  const gap = {
    left: point.x - over.x,
    right: over.x + over.width - point.x,
    top: point.y - over.y,
    bottom: over.y + over.height - point.y,
  };
  const fits = (e: Edge) =>
    !onlyTab(id) &&
    (e === 'left' || e === 'right'
      ? (over.width - SPLITTER_REM) / 2 >= minW
      : (over.height - SPLITTER_REM) / 2 >= minH);
  const edge = EDGES.filter((e) => gap[e] < band && fits(e)).sort((a, b) => gap[a] - gap[b])[0];
  if (edge) {
    return {
      target: { kind: 'split', beside: id, edge },
      preview: half(over, edge),
      docker: id,
      zone: edge,
      noop: false,
    };
  }
  return join(undefined, over, 'center', false);
}

/**
 * A new docker holding `panel`, spanning the whole `edge` of the Stage, wrapped around the ORIGINAL tree: no existing
 * docker is resized or reordered (ids, names, rem and weights untouched). The panel leaves its docker (an emptied
 * docker stays as a strip); the new docker gets a quarter of the room. The same screenset object when it cannot be
 * done (the panel is the only tab of the only docker, or the depth limit would be exceeded).
 */
export function sendToRoot(s: Screenset, panel: PanelId, edge: Edge): Screenset {
  const src = dockerHolding(s.tree, panel);
  const dockers = treeDockers(s.tree);
  if (src && dockers.length === 1 && src.tabs.length === 1) {
    return s;
  }
  const rest = src
    ? mapDocker(s.tree, src.id, (d) => {
        const at = d.tabs.indexOf(panel);
        const tabs = d.tabs.filter((x) => x !== panel);
        const active =
          d.active === panel ? (tabs[Math.min(at, tabs.length - 1)] ?? null) : d.active;
        return { ...d, tabs, active };
      })
    : s.tree;
  const created = makeDocker(
    nextDockerId(usedDockerIds(s)),
    defaultDockerName(dockers.map((d) => d.name)),
    [panel],
    panel
  );
  const first = edge === 'left' || edge === 'top';
  const slots = [
    { node: created as TreeNode, weight: 1 },
    { node: rest, weight: 3 },
  ];
  const tree: TreeNode = {
    kind: 'split',
    dir: edge === 'left' || edge === 'right' ? 'row' : 'column',
    children: first ? slots : slots.reverse(),
  };
  if (treeDepth(tree) > SPLIT_MAX_DEPTH) {
    return s;
  }
  return recordPlace({ ...s, tree }, panel, created, 0);
}
