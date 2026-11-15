/**
 * Geometry of a split tree for the dock Stage (pure, no DOM): where every docker and every splitter sits in a box, in
 * rem, measured from the box's top-left corner. The component positions dockers ABSOLUTELY from these rectangles so a
 * docker's DOM element is keyed by its id and never remounts when the tree changes shape (a split wrapping it, a
 * neighbour appearing); that is what keeps a panel's scroll and focus across a move.
 *
 * Sizes come from the M2 solver (`splitChildSizes`, `solveTree`); nothing here decides a size.
 */
import {
  SPLITTER_REM,
  nodeMin,
  solveTree,
  splitChildSizes,
  isDocker,
  treeDockers,
  type Docker,
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
