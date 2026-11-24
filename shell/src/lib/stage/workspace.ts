/**
 * The stored shape of the workspaces: ONE JSON value per project (`WorkspaceStore`). No storage access here: the page
 * owns reading and writing the string (per project, M5). Parsing never throws and sanitises entry by entry: unknown
 * panel ids and repeats are dropped, bad numbers repaired, malformed dockers and splits repaired or dropped, an invalid
 * store falls back to the config's default store, an `active` that does not exist falls back to the first workspace.
 * A workspace is accepted as is (sanitised). A bare workspace in place of a store becomes a store of one.
 */
import type { ModuleRegistry } from './registry';
import {
  WORKSPACE_STORE_VERSION,
  WORKSPACE_VERSION,
  SPLIT_MAX_DEPTH,
  isDocker,
  makeDocker,
  makeWorkspace,
  nextDockerId,
  normalizeTree,
  treeDockers,
  uniqueName,
  type Docker,
  type Place,
  type Workspace,
  type WorkspaceStore,
  type SplitChild,
  type TreeNode,
} from './tree';

type Known = ReadonlySet<string> | ModuleRegistry | undefined;
const isKnown = (known: Known, id: string): boolean => (known ? known.has(id) : true);

export interface WorkspaceParseConfig {
  /** The store used when nothing valid can be read (the shipped default workspaces). */
  fallback: WorkspaceStore;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const posNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

interface SanitizeCtx {
  known: Known;
  panels: Set<string>;
  ids: Set<string>;
  names: Set<string>;
}

function sanitizeDocker(raw: Record<string, unknown>, ctx: SanitizeCtx): Docker {
  const tabs: string[] = [];
  if (Array.isArray(raw.tabs)) {
    for (const t of raw.tabs) {
      if (typeof t === 'string' && t !== '' && isKnown(ctx.known, t) && !ctx.panels.has(t)) {
        ctx.panels.add(t);
        tabs.push(t);
      }
    }
  }
  const id = typeof raw.id === 'string' && raw.id !== '' && !ctx.ids.has(raw.id) ? raw.id : '';
  if (id) {
    ctx.ids.add(id);
  }
  const wanted = typeof raw.name === 'string' ? raw.name.trim() : '';
  const name = uniqueName(ctx.names, wanted || 'Docker');
  ctx.names.add(name.toLowerCase());
  const active =
    typeof raw.active === 'string' && tabs.includes(raw.active) ? raw.active : (tabs[0] ?? null);
  return makeDocker(id, name, tabs, active);
}

function sanitizeNode(raw: unknown, ctx: SanitizeCtx, depth: number): TreeNode | null {
  if (!isObj(raw) || depth > 64) {
    return null;
  }
  if (raw.kind === 'docker' || (raw.kind === undefined && Array.isArray(raw.tabs))) {
    return sanitizeDocker(raw, ctx);
  }
  if (
    raw.kind !== 'split' ||
    (raw.dir !== 'row' && raw.dir !== 'column') ||
    !Array.isArray(raw.children)
  ) {
    return null;
  }
  const children: SplitChild[] = [];
  for (const c of raw.children) {
    if (!isObj(c)) {
      continue;
    }
    const node = sanitizeNode(c.node, ctx, depth + 1);
    if (!node) {
      continue;
    }
    const child: SplitChild = { node };
    if (posNum(c.rem)) {
      child.rem = round6(c.rem);
    } else if (posNum(c.weight)) {
      child.weight = round6(c.weight);
    }
    if (typeof c.min === 'number' && Number.isFinite(c.min) && c.min >= 0) {
      child.min = round6(c.min);
    }
    children.push(child);
  }
  return children.length === 0 ? null : { kind: 'split', dir: raw.dir, children };
}

/** Replace a split at or past the depth cap with one docker holding every panel below it. */
function capDepth(node: TreeNode, level: number): TreeNode {
  if (isDocker(node)) {
    return node;
  }
  if (level >= SPLIT_MAX_DEPTH) {
    const all = treeDockers(node);
    const first = all[0];
    const tabs = all.flatMap((d) => d.tabs);
    return {
      ...first,
      tabs,
      active: first.active && tabs.includes(first.active) ? first.active : (tabs[0] ?? null),
    };
  }
  return {
    ...node,
    children: node.children.map((c) => ({ ...c, node: capDepth(c.node, level + 1) })),
  };
}

function sanitizeWorkspace(
  raw: Record<string, unknown>,
  known: Known,
  id: string
): Workspace | null {
  const ctx: SanitizeCtx = {
    known,
    panels: new Set(),
    ids: new Set(),
    names: new Set(),
  };
  const node = sanitizeNode(raw.tree, ctx, 0);
  if (!node) {
    return null;
  }
  const taken = new Set(ctx.ids);
  const capped = capDepth(node, 1);
  // Dockers with a missing or repeated id (left as '' by sanitizeDocker) get fresh ones.
  const fixIds = (n: TreeNode): TreeNode => {
    if (isDocker(n)) {
      if (n.id !== '') {
        return n;
      }
      const fresh = nextDockerId(taken);
      taken.add(fresh);
      return { ...n, id: fresh };
    }
    return { ...n, children: n.children.map((c) => ({ ...c, node: fixIds(c.node) })) };
  };
  const tree = normalizeTree(fixIds(capped));
  const ids = new Set(treeDockers(tree).map((d) => d.id));

  const lastDocker: Record<string, Place> = {};
  if (isObj(raw.lastDocker)) {
    for (const [panel, p] of Object.entries(raw.lastDocker)) {
      if (
        isKnown(known, panel) &&
        isObj(p) &&
        typeof p.docker === 'string' &&
        typeof p.name === 'string' &&
        typeof p.index === 'number' &&
        Number.isFinite(p.index)
      ) {
        lastDocker[panel] = {
          docker: p.docker,
          name: p.name,
          index: Math.max(0, Math.trunc(p.index)),
        };
      }
    }
  }
  const collapsed = Array.isArray(raw.collapsed)
    ? [...new Set(raw.collapsed.filter((x): x is string => typeof x === 'string' && ids.has(x)))]
    : [];
  const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : id;
  return makeWorkspace({
    id,
    name,
    tree,
    lastDocker,
    collapsed,
    defaultDocker:
      typeof raw.defaultDocker === 'string' && ids.has(raw.defaultDocker)
        ? raw.defaultDocker
        : undefined,
  });
}

/**
 * Read one stored workspace: sanitised. Null when it is not one or nothing usable remains. `id` is the key it is stored under.
 */
export function parseWorkspace(raw: unknown, known: Known, id: string): Workspace | null {
  try {
    if (!isObj(raw)) {
      return null;
    }
    if (raw.version === WORKSPACE_VERSION && raw.tree !== undefined) {
      return sanitizeWorkspace(raw, known, id);
    }
    return null;
  } catch {
    return null;
  }
}

/** Read the project's workspace store from a stored string (or an already parsed value). Never throws. */
export function parseWorkspaceStore(
  raw: string | null | undefined | unknown,
  known: Known,
  config: WorkspaceParseConfig
): WorkspaceStore {
  try {
    let value: unknown = raw;
    if (typeof raw === 'string') {
      value = JSON.parse(raw);
    }
    if (!isObj(value)) {
      return config.fallback;
    }
    const workspaces: Record<string, Workspace> = {};
    let order: string[] = [];
    if (isObj(value.workspaces)) {
      if (value.version !== WORKSPACE_STORE_VERSION) {
        return config.fallback;
      }
      const keys = [
        ...(Array.isArray(value.order)
          ? value.order.filter((k): k is string => typeof k === 'string')
          : []),
        ...Object.keys(value.workspaces),
      ];
      for (const key of keys) {
        if (workspaces[key] || !Object.hasOwn(value.workspaces, key)) {
          continue;
        }
        const s = parseWorkspace(value.workspaces[key], known, key);
        if (s) {
          workspaces[key] = s;
          order.push(key);
        }
      }
    } else {
      const id = typeof value.id === 'string' && value.id !== '' ? value.id : 'main';
      const s = parseWorkspace(value, known, id);
      if (s) {
        workspaces[s.id] = s;
        order = [s.id];
      }
    }
    if (order.length === 0) {
      return config.fallback;
    }
    const active =
      typeof value.active === 'string' && workspaces[value.active] ? value.active : order[0];
    return { version: WORKSPACE_STORE_VERSION, active, order, workspaces: workspaces };
  } catch {
    return config.fallback;
  }
}

/** The string to store for a store. */
export const serializeWorkspaceStore = (store: WorkspaceStore): string => JSON.stringify(store);
