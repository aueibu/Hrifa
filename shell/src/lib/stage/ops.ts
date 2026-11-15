/**
 * Operations on a screenset (the split tree plus remembered places). Every one is pure: it returns a new Screenset and
 * never mutates its input; an unknown id or an impossible request returns the very same object (`next === prev` means
 * "did nothing"). Every operation that moves or closes a panel records its place in the same step. Named dockers
 * persist when emptied: only `removeDocker` deletes one. No React, no storage.
 */
import { recordPlace, resolvePlace } from './places';
import { splitChildSizes, nodeMin, type SolveOptions } from './solve';
import {
  defaultDockerName,
  dockerHolding,
  findDocker,
  isDocker,
  makeDocker,
  mapDocker,
  nextDockerId,
  nodeAt,
  normalizeTree,
  openPanels,
  removeDockerNode,
  splitTree,
  treeDockers,
  uniqueName,
  usedDockerIds,
  weightOf,
  type Docker,
  type DockerId,
  type Edge,
  type PanelId,
  type Screenset,
  type SplitChild,
  type TreeNode,
} from './tree';

const clampIndex = (i: number, len: number) =>
  Math.min(len, Math.max(0, Number.isFinite(i) ? Math.trunc(i) : len));

const withTree = (s: Screenset, tree: TreeNode): Screenset =>
  tree === s.tree ? s : { ...s, tree: normalizeTree(tree) };

/** A docker without `panel`; the active tab becomes the next one (the previous when it was the last). */
function withoutPanel(d: Docker, panel: PanelId): Docker {
  const at = d.tabs.indexOf(panel);
  if (at < 0) {
    return d;
  }
  const tabs = d.tabs.filter((t) => t !== panel);
  const active = d.active === panel ? (tabs[Math.min(at, tabs.length - 1)] ?? null) : d.active;
  return { ...d, tabs, active };
}

function withPanel(d: Docker, panel: PanelId, index: number): { docker: Docker; index: number } {
  const rest = d.tabs.filter((t) => t !== panel);
  const at = clampIndex(index, rest.length);
  const tabs = [...rest.slice(0, at), panel, ...rest.slice(at)];
  return { docker: { ...d, tabs, active: panel }, index: at };
}

/* ------------------------------------------------------------------------------------------------ send, move */
export type Target =
  | { kind: 'docker'; docker: DockerId; index?: number }
  | { kind: 'split'; beside: DockerId; edge: Edge; name?: string; min?: number };

/** A name that is free in the screenset: the wanted one made unique, or "Docker N". */
function freshName(s: Screenset, wanted: string | undefined): string {
  const names = treeDockers(s.tree).map((d) => d.name);
  const w = wanted?.trim();
  return w ? uniqueName(names, w) : defaultDockerName(names);
}

/**
 * Create an EMPTY docker beside `beside` on `edge` (it gets half of its neighbour's room). `name` defaults to
 * "Docker N" and is made unique; `min` sets the new slot's minimum.
 */
export function splitDocker(
  s: Screenset,
  beside: DockerId,
  edge: Edge,
  opts: { name?: string; min?: number } = {}
): { screenset: Screenset; docker: Docker } | null {
  if (!findDocker(s.tree, beside)) {
    return null;
  }
  const docker = makeDocker(nextDockerId(usedDockerIds(s)), freshName(s, opts.name));
  const tree = splitTree(s.tree, beside, edge, docker, { newMin: opts.min });
  return { screenset: withTree(s, tree), docker };
}

/**
 * Send a panel to a docker (as a tab) or into a new docker beside another. An open panel leaves its docker (which
 * persists, possibly empty); a closed panel opens. The destination place is recorded. A same-docker target with no
 * index change does nothing; one with an index reorders.
 */
export function sendTo(s: Screenset, panel: PanelId, target: Target): Screenset {
  const src = dockerHolding(s.tree, panel);
  if (target.kind === 'docker') {
    const dest = findDocker(s.tree, target.docker);
    if (!dest) {
      return s;
    }
    if (src && src.id === dest.id) {
      return target.index === undefined ? s : reorderTab(s, panel, target.index);
    }
    let tree = src ? mapDocker(s.tree, src.id, (d) => withoutPanel(d, panel)) : s.tree;
    const joined = withPanel(dest, panel, target.index ?? dest.tabs.length);
    tree = mapDocker(tree, dest.id, () => joined.docker);
    return recordPlace(withTree(s, tree), panel, joined.docker, joined.index);
  }
  const beside = findDocker(s.tree, target.beside);
  if (!beside || (src && src.id === beside.id && src.tabs.length === 1)) {
    return s;
  }
  const without = src ? mapDocker(s.tree, src.id, (d) => withoutPanel(d, panel)) : s.tree;
  const made = splitDocker({ ...s, tree: without }, beside.id, target.edge, {
    name: target.name,
    min: target.min,
  });
  if (!made) {
    return s;
  }
  const docker = { ...made.docker, tabs: [panel], active: panel };
  const tree = mapDocker(made.screenset.tree, docker.id, () => docker);
  return recordPlace({ ...made.screenset, tree }, panel, docker, 0);
}

/** Move an open panel to tab `index` of its own docker. */
export function reorderTab(s: Screenset, panel: PanelId, index: number): Screenset {
  const d = dockerHolding(s.tree, panel);
  if (!d) {
    return s;
  }
  const moved = withPanel(d, panel, index);
  if (moved.index === d.tabs.indexOf(panel) && d.active === panel) {
    return recordPlace(s, panel, d, moved.index);
  }
  const tree = mapDocker(s.tree, d.id, () => moved.docker);
  return recordPlace({ ...s, tree }, panel, d, moved.index);
}

/** Make `panel` the active tab of `docker`. */
export function setActive(s: Screenset, docker: DockerId, panel: PanelId): Screenset {
  const d = findDocker(s.tree, docker);
  if (!d || !d.tabs.includes(panel) || d.active === panel) {
    return s;
  }
  return withTree(
    s,
    mapDocker(s.tree, docker, (x) => ({ ...x, active: panel }))
  );
}

/* ------------------------------------------------------------------------------------------------ close, open */
/** Close a panel (it leaves its docker, which persists) and remember where it was. Not open: no-op. */
export function closePanel(s: Screenset, panel: PanelId): Screenset {
  const d = dockerHolding(s.tree, panel);
  if (!d) {
    return s;
  }
  const index = d.tabs.indexOf(panel);
  const tree = mapDocker(s.tree, d.id, (x) => withoutPanel(x, panel));
  return recordPlace({ ...s, tree }, panel, d, index);
}

/**
 * Open a panel at its remembered place (docker by id, then by name, then `opts.home` by name, then `defaultDocker`,
 * then the first docker; with no docker at all a root docker named `opts.rootName` is created). An already open panel
 * just becomes the active tab (nothing else changes and no place is recorded: it did not move). Opening never refuses and
 * is never guarded; a newly opened panel's place is recorded.
 */
export function openPanel(
  s: Screenset,
  panel: PanelId,
  opts: { home?: string; rootName?: string } = {}
): Screenset {
  const open = dockerHolding(s.tree, panel);
  if (open) {
    return setActive(s, open.id, panel);
  }
  const { docker, index } = resolvePlace(s, panel, opts.home);
  if (!docker) {
    const root = makeDocker(
      nextDockerId(usedDockerIds(s)),
      opts.rootName ?? 'Main',
      [panel],
      panel
    );
    return recordPlace({ ...s, tree: root }, panel, root, 0);
  }
  const joined = withPanel(docker, panel, index ?? docker.tabs.length);
  const next = withTree(
    s,
    mapDocker(s.tree, docker.id, () => joined.docker)
  );
  return recordPlace(next, panel, joined.docker, joined.index);
}

/* ------------------------------------------------------------------------------------------------ dockers */
/** Would `name` be a valid new name for `docker` (not empty, unique case-insensitively among the others)? */
export function canRenameDocker(s: Screenset, docker: DockerId, name: string): boolean {
  const n = name.trim();
  return (
    n !== '' &&
    findDocker(s.tree, docker) !== null &&
    !treeDockers(s.tree).some(
      (d) => d.id !== docker && d.name.trim().toLowerCase() === n.toLowerCase()
    )
  );
}

/** Rename a docker, keeping the unique-name rule (a clash or an empty name does nothing). Places follow the name. */
export function renameDocker(s: Screenset, docker: DockerId, name: string): Screenset {
  const d = findDocker(s.tree, docker);
  const n = name.trim();
  if (!d || d.name === n || !canRenameDocker(s, docker, n)) {
    return s;
  }
  const lastDocker = Object.fromEntries(
    Object.entries(s.lastDocker).map(([p, pl]) => [
      p,
      pl.docker === docker ? { ...pl, name: n } : pl,
    ])
  );
  return { ...s, tree: mapDocker(s.tree, docker, (x) => ({ ...x, name: n })), lastDocker };
}

/**
 * Explicitly remove a docker: its tabs close with their places recorded (pointing at the removed docker, so a docker
 * recreated under the same name takes them back) and the tree is normalised. The last docker cannot be removed.
 */
export function removeDocker(s: Screenset, docker: DockerId): Screenset {
  const d = findDocker(s.tree, docker);
  if (!d || treeDockers(s.tree).length <= 1) {
    return s;
  }
  const tree = removeDockerNode(s.tree, docker);
  if (!tree) {
    return s;
  }
  let next: Screenset = { ...s, tree: normalizeTree(tree) };
  d.tabs.forEach((p, i) => {
    next = recordPlace(next, p, d, i);
  });
  const collapsed = (s.collapsed ?? []).filter((id) => id !== docker);
  const { collapsed: _c, defaultDocker: _d, ...rest } = next;
  void _c;
  void _d;
  return {
    ...rest,
    ...(collapsed.length > 0 ? { collapsed } : {}),
    ...(s.defaultDocker !== undefined && s.defaultDocker !== docker
      ? { defaultDocker: s.defaultDocker }
      : {}),
  };
}

/** Collapse or expand a docker. */
export function setCollapsed(s: Screenset, docker: DockerId, collapsed: boolean): Screenset {
  if (!findDocker(s.tree, docker)) {
    return s;
  }
  const list = s.collapsed ?? [];
  if (list.includes(docker) === collapsed) {
    return s;
  }
  const next = collapsed ? [...list, docker] : list.filter((id) => id !== docker);
  const { collapsed: _c, ...rest } = s;
  void _c;
  return next.length > 0 ? { ...rest, collapsed: next } : rest;
}

/** Make the docker's slot fixed (`{ rem }`) or flexible (`{ weight }`). The root has no slot: no-op. */
export function setDockerSizing(
  s: Screenset,
  docker: DockerId,
  sizing: { rem: number } | { weight: number }
): Screenset {
  const value = 'rem' in sizing ? sizing.rem : sizing.weight;
  if (!Number.isFinite(value) || value <= 0) {
    return s;
  }
  let changed = false;
  const visit = (n: TreeNode): TreeNode => {
    if (isDocker(n)) {
      return n;
    }
    const children = n.children.map((c) => {
      if (isDocker(c.node) && c.node.id === docker) {
        const { rem: _r, weight: _w, ...rest } = c;
        void _r;
        void _w;
        const next: SplitChild =
          'rem' in sizing ? { ...rest, rem: value } : { ...rest, weight: value };
        if (c.rem === next.rem && c.weight === next.weight) {
          return c;
        }
        changed = true;
        return next;
      }
      const node = visit(c.node);
      if (node === c.node) {
        return c;
      }
      changed = true;
      return { ...c, node };
    });
    return changed ? { ...n, children } : n;
  };
  const tree = visit(s.tree);
  return changed ? withTree(s, tree) : s;
}

/** Make a docker the target for panels with no other place. `null` clears it. */
export function setDefaultDocker(s: Screenset, docker: DockerId | null): Screenset {
  if (docker === null) {
    if (s.defaultDocker === undefined) {
      return s;
    }
    const { defaultDocker: _d, ...rest } = s;
    void _d;
    return rest;
  }
  return findDocker(s.tree, docker) && s.defaultDocker !== docker
    ? { ...s, defaultDocker: docker }
    : s;
}

/* ------------------------------------------------------------------------------------------------ resize */
/**
 * Drag the splitter between children `index` and `index + 1` of the split at `path` so child `index` is `firstRem`
 * long. The pair trades size (their total is constant) and each keeps its minimum (the solver's, so panels' minimums
 * and strips count). `lengthRem` is the split's length along its axis. Two weighted children keep the pair's combined
 * weight; two fixed children both get a `rem`; with one fixed and one weighted the fixed child gets its `rem` and the
 * weighted one is re-weighted against the other flexible siblings, so those keep their sizes. Refused (no-op) when the minimums do not fit.
 */
export function resizeSplit(
  s: Screenset,
  path: readonly number[],
  index: number,
  firstRem: number,
  lengthRem: number,
  opts: SolveOptions = {}
): Screenset {
  const node = nodeAt(s.tree, path);
  if (!node || isDocker(node) || !node.children[index] || !node.children[index + 1]) {
    return s;
  }
  const sizeOpts = { collapsed: s.collapsed, ...opts };
  const sizes = splitChildSizes(node, lengthRem, sizeOpts);
  const a = node.children[index];
  const b = node.children[index + 1];
  const axis = node.dir === 'row' ? 'width' : 'height';
  const total = sizes[index] + sizes[index + 1];
  const lo = Math.max(nodeMin(a.node, axis, sizeOpts), a.min ?? 0);
  const hi = total - Math.max(nodeMin(b.node, axis, sizeOpts), b.min ?? 0);
  if (lo > hi || !Number.isFinite(firstRem)) {
    return s;
  }
  const first = Math.round(Math.min(hi, Math.max(lo, firstRem)) * 1e4) / 1e4;
  if (Math.abs(first - sizes[index]) < 1e-4) {
    return s;
  }
  const second = Math.round((total - first) * 1e4) / 1e4;
  const pairWeight = weightOf(a) + weightOf(b);
  const fixed = (c: typeof a, rem: number) => {
    const { weight: _w, ...rest } = c;
    void _w;
    return { ...rest, rem };
  };
  const flex = (c: typeof a, weight: number) => {
    const { rem: _r, ...rest } = c;
    void _r;
    return { ...rest, weight: Math.round(weight * 1e6) / 1e6 };
  };
  let na = a;
  let nb = b;
  if (a.rem !== undefined && b.rem !== undefined) {
    na = fixed(a, first);
    nb = fixed(b, second);
  } else if (a.rem !== undefined || b.rem !== undefined) {
    // One fixed, one weighted: the fixed child takes its new size and the weighted one is re-weighted so it keeps the
    // rest of the pair's room, which leaves the other flexible siblings exactly as they were.
    const aFixed = a.rem !== undefined;
    const collapsed = new Set(s.collapsed ?? []);
    const others = node.children
      .map((c, i) => ({ c, size: sizes[i], i }))
      .filter(
        ({ c, i }) =>
          i !== index &&
          i !== index + 1 &&
          c.rem === undefined &&
          !(isDocker(c.node) && (c.node.tabs.length === 0 || collapsed.has(c.node.id)))
      );
    const otherSize = others.reduce((t, o) => t + o.size, 0);
    const otherWeight = others.reduce((t, o) => t + weightOf(o.c), 0);
    const flexSize = aFixed ? second : first;
    const weight = otherSize > 0 ? (otherWeight * flexSize) / otherSize : weightOf(aFixed ? b : a);
    if (aFixed) {
      na = fixed(a, first);
      nb = flex(b, weight);
    } else {
      nb = fixed(b, second);
      na = flex(a, weight);
    }
  } else {
    na = flex(a, (pairWeight * first) / total);
    nb = flex(b, (pairWeight * second) / total);
  }
  if (na === a && nb === b) {
    return s;
  }
  const children = node.children.map((c, i) => (i === index ? na : i === index + 1 ? nb : c));
  const replace = (n: TreeNode, rest: readonly number[]): TreeNode => {
    if (rest.length === 0) {
      return { ...(n as typeof node), children };
    }
    const sp = n as typeof node;
    return {
      ...sp,
      children: sp.children.map((c, i) =>
        i === rest[0] ? { ...c, node: replace(c.node, rest.slice(1)) } : c
      ),
    };
  };
  return { ...s, tree: replace(s.tree, path) };
}

/* ------------------------------------------------------------------------------------------------ reconcile */
/**
 * Close every tab whose panel is not in `known` and drop its remembered place (the host calls this on every screenset
 * of a project when an instance is deleted). Dockers persist. The same object when nothing is unknown.
 */
export function reconcile(
  s: Screenset,
  known: ReadonlySet<string> | ReadonlyMap<string, unknown>
): Screenset {
  const gone = openPanels(s.tree).filter((p) => !known.has(p));
  let tree = s.tree;
  for (const p of gone) {
    const d = dockerHolding(tree, p);
    if (d) {
      tree = mapDocker(tree, d.id, (x) => withoutPanel(x, p));
    }
  }
  const stale = Object.keys(s.lastDocker).filter((p) => !known.has(p));
  if (tree === s.tree && stale.length === 0) {
    return s;
  }
  const lastDocker = { ...s.lastDocker };
  for (const p of stale) {
    delete lastDocker[p];
  }
  return { ...s, tree, lastDocker };
}
