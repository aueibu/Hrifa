/**
 * The pure solver: sizes in rem for every docker of a tree in a box of a given width and height.
 *
 * - Children of a split are fixed (`rem`) or flexible (`weight`); flexible children share what is left after the fixed
 *   ones and the splitters, by weight, each clamped to its minimum, repeated until stable.
 * - A docker's minimum comes from its ACTIVE panel (`SolveOptions.minOf`, the React layer's stageOps supplies it from
 *   the registry); the floor is the Stage minimum (12 rem by 6 rem). A split's minimum along its axis is the sum of its
 *   children's minimums plus splitters, across its axis the largest; `SplitChild.min` raises a child's minimum.
 * - An empty or collapsed docker is a strip (DOCKER_STRIP_REM along the parent's axis); its stored size is kept in the
 *   data but not used while it is a strip.
 * - Narrow rule: when the minimums do not fit, children are collapsed to strips from the far end, never the one holding
 *   the selected docker, until the rest fit (state `narrow`). If even then they do not fit, the remaining open children
 *   shrink toward a strip so nothing overflows.
 * No React, no DOM.
 */
import { SIZE_MIN_HEIGHT_REM, SIZE_MIN_WIDTH_REM } from './size';
import {
  containsDocker,
  isDocker,
  weightOf,
  type Docker,
  type DockerId,
  type Split,
  type SplitChild,
  type TreeNode,
} from './tree';

/** The thickness of an empty, collapsed or narrow-hidden docker along its parent's split axis, rem. */
export const DOCKER_STRIP_REM = 1.5;
/** The splitter between two children, rem. */
export const SPLITTER_REM = 0.5;

export interface DockerMin {
  width: number;
  height: number;
}

export interface SolveOptions {
  /** A docker's own minimum (from its active panel). Default: the Stage minimum. */
  minOf?: (d: Docker) => DockerMin;
  /** Dockers shown as strips by the user. */
  collapsed?: Iterable<DockerId>;
  /** The docker the narrow rule never collapses (the one the user last selected). */
  selected?: DockerId;
}

export type DockerState = 'open' | 'empty' | 'collapsed' | 'narrow';

export interface DockerBox {
  width: number;
  height: number;
  state: DockerState;
}

type Axis = 'width' | 'height';
const axisOf = (dir: Split['dir']): Axis => (dir === 'row' ? 'width' : 'height');
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const EPS = 1e-6;

const STAGE_MIN: DockerMin = { width: SIZE_MIN_WIDTH_REM, height: SIZE_MIN_HEIGHT_REM };

interface Ctx {
  minOf: (d: Docker) => DockerMin;
  collapsed: Set<DockerId>;
  selected: DockerId | undefined;
}

const ctxOf = (opts: SolveOptions): Ctx => ({
  minOf: opts.minOf ?? (() => STAGE_MIN),
  collapsed: new Set(opts.collapsed ?? []),
  selected: opts.selected,
});

const stateOf = (d: Docker, ctx: Ctx): DockerState =>
  ctx.collapsed.has(d.id) ? 'collapsed' : d.tabs.length === 0 ? 'empty' : 'open';

const isStrip = (n: TreeNode, ctx: Ctx): boolean => isDocker(n) && stateOf(n, ctx) !== 'open';

function minOfNode(node: TreeNode, axis: Axis, ctx: Ctx): number {
  if (isDocker(node)) {
    if (stateOf(node, ctx) !== 'open') {
      return DOCKER_STRIP_REM;
    }
    const m = ctx.minOf(node);
    return Math.max(axis === 'width' ? STAGE_MIN.width : STAGE_MIN.height, m[axis]);
  }
  const mins = node.children.map((c) => childMin(node, c, axis, ctx));
  return axisOf(node.dir) === axis
    ? mins.reduce((a, b) => a + b, 0) + SPLITTER_REM * (node.children.length - 1)
    : Math.max(...mins);
}

/** A child's minimum along `axis`; `SplitChild.min` only applies along the parent's own axis and not to strips. */
function childMin(parent: Split, c: SplitChild, axis: Axis, ctx: Ctx): number {
  const derived = minOfNode(c.node, axis, ctx);
  if (isStrip(c.node, ctx) || axisOf(parent.dir) !== axis) {
    return derived;
  }
  return Math.max(derived, c.min ?? 0);
}

/** The least size (rem) a node needs along `axis`. */
export const nodeMin = (node: TreeNode, axis: Axis, opts: SolveOptions = {}): number =>
  minOfNode(node, axis, ctxOf(opts));

function sizeChildren(
  split: Split,
  length: number,
  ctx: Ctx
): { sizes: number[]; narrow: boolean[] } {
  const axis = axisOf(split.dir);
  const n = split.children.length;
  const avail = Math.max(0, length - SPLITTER_REM * (n - 1));
  const mins = split.children.map((c) => childMin(split, c, axis, ctx));
  const strip = split.children.map((c) => isStrip(c.node, ctx));
  const narrow: boolean[] = split.children.map(() => false);

  let total = mins.reduce((a, b) => a + b, 0);
  for (let i = n - 1; i >= 0 && total > avail + EPS; i--) {
    if (
      strip[i] ||
      (ctx.selected !== undefined && containsDocker(split.children[i].node, ctx.selected))
    ) {
      continue;
    }
    narrow[i] = true;
    strip[i] = true;
    total += DOCKER_STRIP_REM - mins[i];
    mins[i] = DOCKER_STRIP_REM;
  }

  const sizes = new Array<number>(n).fill(0);
  const flexible = split.children.map((c, i) => !strip[i] && c.rem === undefined);
  if (!flexible.some(Boolean)) {
    // Nothing flexes: the last open child (else the last child) fills, as the last column did in version 1.
    let last = n - 1;
    for (let i = n - 1; i >= 0; i--) {
      if (!strip[i]) {
        last = i;
        break;
      }
    }
    flexible[last] = true;
  }
  split.children.forEach((c, i) => {
    if (flexible[i]) {
      return;
    }
    sizes[i] = strip[i] ? DOCKER_STRIP_REM : Math.max(c.rem ?? mins[i], mins[i]);
  });
  let free = avail - sizes.reduce((a, b) => a + b, 0);
  const open = new Set(flexible.map((f, i) => (f ? i : -1)).filter((i) => i >= 0));
  for (;;) {
    const weightSum = [...open].reduce((a, i) => a + weightOf(split.children[i]), 0);
    let lockedOne = false;
    for (const i of [...open]) {
      const share = (free * weightOf(split.children[i])) / weightSum;
      if (share < mins[i] - EPS) {
        sizes[i] = mins[i];
        free -= mins[i];
        open.delete(i);
        lockedOne = true;
      }
    }
    if (!lockedOne) {
      for (const i of open) {
        sizes[i] = (free * weightOf(split.children[i])) / weightSum;
      }
      break;
    }
    if (open.size === 0) {
      break;
    }
  }
  // Overflow (fixed children too big, or minimums that cannot fit): take it from the far end, down to the minimum,
  // then down to a strip, so nothing overflows.
  for (const floor of [mins, mins.map(() => DOCKER_STRIP_REM)]) {
    let over = sizes.reduce((a, b) => a + b, 0) - avail;
    for (let i = n - 1; i >= 0 && over > EPS; i--) {
      const give = Math.min(over, Math.max(0, sizes[i] - Math.min(floor[i], sizes[i])));
      sizes[i] -= give;
      over -= give;
    }
  }
  return { sizes: sizes.map(round4), narrow };
}

/** The sizes (rem) a split's children get along its axis when it is `length` rem long. */
export const splitChildSizes = (split: Split, length: number, opts: SolveOptions = {}): number[] =>
  sizeChildren(split, length, ctxOf(opts)).sizes;

/** The size and state of every docker in a `width` by `height` (rem) box. */
export function solveTree(
  tree: TreeNode,
  width: number,
  height: number,
  opts: SolveOptions = {}
): Map<DockerId, DockerBox> {
  const ctx = ctxOf(opts);
  const out = new Map<DockerId, DockerBox>();
  const visit = (node: TreeNode, w: number, h: number, forceNarrow: boolean) => {
    if (isDocker(node)) {
      out.set(node.id, {
        width: round4(Math.max(0, w)),
        height: round4(Math.max(0, h)),
        state: forceNarrow ? 'narrow' : stateOf(node, ctx),
      });
      return;
    }
    const axis = axisOf(node.dir);
    const { sizes, narrow } = sizeChildren(node, axis === 'width' ? w : h, ctx);
    node.children.forEach((c, i) => {
      const along = sizes[i];
      visit(
        c.node,
        axis === 'width' ? along : w,
        axis === 'width' ? h : along,
        forceNarrow || narrow[i]
      );
    });
  };
  visit(tree, Number.isFinite(width) ? width : 0, Number.isFinite(height) ? height : 0, false);
  return out;
}
