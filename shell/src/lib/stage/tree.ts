/**
 * The Stage split tree (version 2 layout): named leaf dockers holding tabs, nested row and column splits, and the
 * screenset that wraps a tree with the remembered places of its panels. Plain serialisable data plus the pure helpers
 * every other module here builds on. Panels live outside the tree, keyed by id (the registry); the tree holds ids and
 * numbers only. No React, no storage.
 *
 * Names: the design's `Node` is `TreeNode` here (`Node` is a DOM global) and its `Child` is `SplitChild`.
 *
 * Invariants (kept by `normalizeTree` and by the operations in ops.ts, enforced on parse in screenset.ts):
 *  - a split has two or more children (a one-child split is replaced by its child);
 *  - a split nested directly in a split of the same direction is merged into its parent only when the nested split's own
 *    size is a weight and every merged child is a weight (weights are rescaled so proportions hold); a split with any
 *    fixed `rem` child is never merged, so no size changes;
 *  - each panel id is in at most one docker of a screenset; dockers are never deleted when emptied.
 */
import type { ModuleId } from './registry';

export type PanelId = ModuleId;
export type DockerId = string;
export type ScreensetId = string;

export const SCREENSET_VERSION = 2;
export const SCREENSET_STORE_VERSION = 1;
/** The deepest a tree may nest on parse (a lone docker is depth 1). */
export const SPLIT_MAX_DEPTH = 6;

export interface Docker {
  kind: 'docker';
  /** Stable, generated, never shown. */
  id: DockerId;
  /** User-chosen and mutable; unique (case-insensitive) within a screenset. */
  name: string;
  /** Open panels in tab order; may be empty (the docker persists as a strip). */
  tabs: PanelId[];
  /** One of `tabs`, or null when empty. */
  active: PanelId | null;
}

export interface SplitChild {
  node: TreeNode;
  /** Fixed size along the split's axis, rem. */
  rem?: number;
  /** Share of the room left after fixed children (relative, > 0). Absent means 1. */
  weight?: number;
  /** An override upward of the derived minimum along the split's axis, rem. */
  min?: number;
}

export interface Split {
  kind: 'split';
  dir: 'row' | 'column';
  /** Two or more children. */
  children: SplitChild[];
}

export type TreeNode = Split | Docker;

/** Where a closed panel goes when it reopens: the docker's id AND its name at the time, and the tab index. */
export interface Place {
  docker: DockerId;
  name: string;
  index: number;
}

export interface Screenset {
  version: 2;
  id: ScreensetId;
  name: string;
  tree: TreeNode;
  /** Remembered place per panel, closed panels included. */
  lastDocker: Record<PanelId, Place>;
  collapsed?: DockerId[];
  defaultDocker?: DockerId;
}

/** One JSON value per project. */
export interface ScreensetStore {
  version: 1;
  active: ScreensetId;
  /** Meta-tab order. */
  order: ScreensetId[];
  screensets: Record<ScreensetId, Screenset>;
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';

/* ------------------------------------------------------------------------------------------------ construction */
export const makeDocker = (
  id: DockerId,
  name: string,
  tabs: readonly PanelId[] = [],
  active?: PanelId | null
): Docker => ({
  kind: 'docker',
  id,
  name,
  tabs: [...tabs],
  active: active === undefined ? (tabs[0] ?? null) : active,
});

export function makeScreenset(init: {
  id: ScreensetId;
  name: string;
  tree: TreeNode;
  lastDocker?: Record<PanelId, Place>;
  collapsed?: DockerId[];
  defaultDocker?: DockerId;
}): Screenset {
  const s: Screenset = {
    version: SCREENSET_VERSION,
    id: init.id,
    name: init.name,
    tree: init.tree,
    lastDocker: init.lastDocker ?? {},
  };
  if (init.collapsed && init.collapsed.length > 0) {
    s.collapsed = [...init.collapsed];
  }
  if (init.defaultDocker !== undefined) {
    s.defaultDocker = init.defaultDocker;
  }
  return s;
}

export function makeStore(screensets: readonly Screenset[], active?: ScreensetId): ScreensetStore {
  const record: Record<ScreensetId, Screenset> = {};
  for (const s of screensets) {
    record[s.id] = s;
  }
  const order = screensets.map((s) => s.id);
  return {
    version: SCREENSET_STORE_VERSION,
    active: active !== undefined && record[active] ? active : (order[0] ?? ''),
    order,
    screensets: record,
  };
}

/* ------------------------------------------------------------------------------------------------ reading */
export const isDocker = (n: TreeNode): n is Docker => n.kind === 'docker';

/** Every docker, depth first, left to right and top to bottom. */
export function treeDockers(n: TreeNode): Docker[] {
  return isDocker(n) ? [n] : n.children.flatMap((c) => treeDockers(c.node));
}

export const findDocker = (n: TreeNode, id: DockerId): Docker | null =>
  treeDockers(n).find((d) => d.id === id) ?? null;

export const dockerHolding = (n: TreeNode, panel: PanelId): Docker | null =>
  treeDockers(n).find((d) => d.tabs.includes(panel)) ?? null;

export const dockerByName = (n: TreeNode, name: string): Docker | null => {
  const key = name.trim().toLowerCase();
  return treeDockers(n).find((d) => d.name.trim().toLowerCase() === key) ?? null;
};

/** Every open panel id. */
export const openPanels = (n: TreeNode): PanelId[] => treeDockers(n).flatMap((d) => d.tabs);

export const containsDocker = (n: TreeNode, id: DockerId): boolean => findDocker(n, id) !== null;

/** The relative size of a child (its weight, 1 when absent). */
export const weightOf = (c: SplitChild): number =>
  c.weight !== undefined && Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 1;

/** A lone docker is depth 1. */
export const treeDepth = (n: TreeNode): number =>
  isDocker(n) ? 1 : 1 + Math.max(...n.children.map((c) => treeDepth(c.node)));

/** The node at `path` (child indexes from the root), or null. */
export function nodeAt(tree: TreeNode, path: readonly number[]): TreeNode | null {
  let cur: TreeNode = tree;
  for (const i of path) {
    if (isDocker(cur) || !cur.children[i]) {
      return null;
    }
    cur = cur.children[i].node;
  }
  return cur;
}

/* ------------------------------------------------------------------------------------------------ names and ids */
/** Every docker id the screenset has used or remembers (tree, places, collapsed, default). */
export function usedDockerIds(s: Screenset): Set<DockerId> {
  const ids = new Set<DockerId>(treeDockers(s.tree).map((d) => d.id));
  for (const p of Object.values(s.lastDocker)) {
    ids.add(p.docker);
  }
  for (const id of s.collapsed ?? []) {
    ids.add(id);
  }
  if (s.defaultDocker !== undefined) {
    ids.add(s.defaultDocker);
  }
  return ids;
}

/** `d<n>` with n one past the largest numeric id among `taken` (so a removed docker's id is never reused). */
export function nextDockerId(taken: Iterable<string>): DockerId {
  let max = 0;
  for (const id of taken) {
    const m = /^d(\d+)$/.exec(id);
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return `d${max + 1}`;
}

/** `base`, or `base 2`, `base 3`... the first not in `taken` (case-insensitive). */
export function uniqueName(taken: Iterable<string>, base: string): string {
  const set = new Set([...taken].map((n) => n.trim().toLowerCase()));
  if (!set.has(base.trim().toLowerCase())) {
    return base;
  }
  for (let n = 2; ; n++) {
    const name = `${base} ${n}`;
    if (!set.has(name.toLowerCase())) {
      return name;
    }
  }
}

/** The default name of a new docker: "Docker N". */
export function defaultDockerName(taken: readonly string[]): string {
  const set = new Set(taken.map((n) => n.trim().toLowerCase()));
  for (let n = taken.length + 1; ; n++) {
    if (!set.has(`docker ${n}`)) {
      return `Docker ${n}`;
    }
  }
}

/* ------------------------------------------------------------------------------------------------ rewriting */
/** Apply `fn` to the docker `id`; the same tree object when `fn` returns the same docker or the id is absent. */
export function mapDocker(tree: TreeNode, id: DockerId, fn: (d: Docker) => Docker): TreeNode {
  if (isDocker(tree)) {
    if (tree.id !== id) {
      return tree;
    }
    return fn(tree);
  }
  let changed = false;
  const children = tree.children.map((c) => {
    const node = mapDocker(c.node, id, fn);
    if (node === c.node) {
      return c;
    }
    changed = true;
    return { ...c, node };
  });
  return changed ? { ...tree, children } : tree;
}

/** Remove a docker node (its tabs go with it; the caller records places). Null when the root itself is removed. */
export function removeDockerNode(tree: TreeNode, id: DockerId): TreeNode | null {
  if (isDocker(tree)) {
    return tree.id === id ? null : tree;
  }
  let changed = false;
  const children: SplitChild[] = [];
  for (const c of tree.children) {
    const node = removeDockerNode(c.node, id);
    if (node === c.node) {
      children.push(c);
      continue;
    }
    changed = true;
    if (node) {
      children.push({ ...c, node });
    }
  }
  if (!changed) {
    return tree;
  }
  return children.length === 0 ? null : { ...tree, children };
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
const isWeightChild = (c: SplitChild) => c.rem === undefined;

/**
 * Normalise a tree: drop one-child splits (the child replaces the split and inherits its slot's size), and merge a
 * same-direction nested split into its parent only when the nested split's slot and every merged child are weights
 * (weights rescaled by the slot's weight share). Mixed rem and weight is never merged. Returns the same object when
 * nothing changes.
 */
export function normalizeTree(node: TreeNode): TreeNode {
  if (isDocker(node)) {
    return node;
  }
  let changed = false;
  const out: SplitChild[] = [];
  for (const child of node.children) {
    const inner = normalizeTree(child.node);
    if (inner !== child.node) {
      changed = true;
    }
    if (
      !isDocker(inner) &&
      inner.dir === node.dir &&
      isWeightChild(child) &&
      inner.children.every(isWeightChild)
    ) {
      const total = inner.children.reduce((a, c) => a + weightOf(c), 0);
      const slot = weightOf(child);
      for (const c of inner.children) {
        out.push({ ...c, weight: round6((weightOf(c) / total) * slot) });
      }
      changed = true;
      continue;
    }
    out.push(inner === child.node ? child : { ...child, node: inner });
  }
  if (out.length === 1) {
    return out[0].node;
  }
  return changed ? { ...node, children: out } : node;
}

/** Sizing for `splitTree` when the new docker is not simply given half of its neighbour's room. */
export interface SplitSizing {
  newRem?: number;
  newWeight?: number;
  besideWeight?: number;
  newMin?: number;
  /** Always put both dockers in a new inner split, even when the parent runs the same way. */
  wrap?: boolean;
}

/**
 * Put `node` (a docker) beside the docker `besideId` on `edge`. In a parent that runs the same way the new docker
 * takes half of the neighbour's room (rem or weight); otherwise (or with `wrap`) the neighbour is wrapped in a new
 * split of the matching direction that keeps its slot's size. Returns the same tree when `besideId` is absent.
 */
export function splitTree(
  tree: TreeNode,
  besideId: DockerId,
  edge: Edge,
  node: Docker,
  sizing: SplitSizing = {}
): TreeNode {
  const dir = edge === 'left' || edge === 'right' ? 'row' : 'column';
  const after = edge === 'right' || edge === 'bottom';
  const pair = (a: SplitChild, b: SplitChild): SplitChild[] => (after ? [a, b] : [b, a]);
  const min = sizing.newMin !== undefined ? { min: sizing.newMin } : {};
  const newInner = (): SplitChild => ({
    node,
    ...(sizing.newRem !== undefined ? { rem: sizing.newRem } : { weight: sizing.newWeight ?? 1 }),
    ...min,
  });
  const wrapped = (beside: Docker): Split => ({
    kind: 'split',
    dir,
    children: pair({ node: beside, weight: sizing.besideWeight ?? 1 }, newInner()),
  });

  if (isDocker(tree)) {
    return tree.id === besideId ? wrapped(tree) : tree;
  }
  const visit = (split: Split): Split => {
    let changed = false;
    const children: SplitChild[] = [];
    for (const c of split.children) {
      if (isDocker(c.node) && c.node.id === besideId) {
        changed = true;
        if (split.dir === dir && !sizing.wrap) {
          const half = c.rem !== undefined ? { rem: c.rem / 2 } : { weight: weightOf(c) / 2 };
          const { rem: _r, weight: _w, ...rest } = c;
          void _r;
          void _w;
          children.push(...pair({ ...rest, ...half }, { node, ...half, ...min }));
        } else {
          children.push({ ...c, node: wrapped(c.node) });
        }
      } else if (!isDocker(c.node)) {
        const inner = visit(c.node);
        if (inner !== c.node) {
          changed = true;
        }
        children.push(inner === c.node ? c : { ...c, node: inner });
      } else {
        children.push(c);
      }
    }
    return changed ? { ...split, children } : split;
  };
  return visit(tree);
}
