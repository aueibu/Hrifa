/**
 * The preset browser's tree (M7b step 2), pure: built from the generator library and the built-in folder table.
 * Roots: Built-in (groups, subfolders), My presets (user folder paths), Recent (last 8 owners), Untitled (generators that
 * hold subsets but have no name). Also the visible-row list for the keyboard and the flat search.
 */
import { PRESETS, splitFolder } from '../../../lib/harmonic-field';
import { BUILTIN_SUBFOLDERS, builtinFolders } from './builtinFolders';
import { autoName } from './generate';
import {
  AUTO_SAVED,
  builtinKey,
  ownerExists,
  parseOwner,
  subsetCount,
  untitledKey,
  userKey,
  type GenLibrary,
  type OwnerKey,
} from './generatorLibrary';

export interface FolderNode {
  kind: 'folder';
  id: string;
  label: string;
  /** Folders from the root to this one, inclusive. */
  path: string[];
  children: TreeNode[];
  /** Subsets of every preset below. */
  count: number;
  info: string;
  /** A user folder path (`A/B`) when this folder sits under My presets (the root itself is ''), else null. */
  userPath: string | null;
  /** M5: the folder's description (user folders with a record only). */
  description?: string;
}
export interface PresetNode {
  kind: 'preset';
  id: string;
  owner: OwnerKey;
  label: string;
  /** Folders above it (root first). */
  path: string[];
  count: number;
  /** One line: a built-in's description, else where it sits. */
  info: string;
  /** Id of the user preset (`p:` owners only). */
  userId: string | null;
  /** Its folder path under My presets (user presets only). */
  folder: string;
  /** M5: the user preset's description (absent = none; built-ins keep their read-only `info`). */
  description?: string;
}
export type TreeNode = FolderNode | PresetNode;

export const ROOT_BUILTIN = 'Built-in';
export const ROOT_MINE = 'My presets';
export const ROOT_RECENT = 'Recent';
export const ROOT_UNTITLED = AUTO_SAVED;

const SEP = ' > ';
export const nodeId = (kind: 'f' | 'p', path: string[], owner = '') =>
  `${kind}:${path.join(SEP)}${owner ? `@${owner}` : ''}`;

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

function folder(
  path: string[],
  children: TreeNode[],
  info: string,
  userPath: string | null = null,
  description?: string
): FolderNode {
  return {
    kind: 'folder',
    id: nodeId('f', path),
    label: path[path.length - 1],
    path,
    children,
    count: children.reduce((n, c) => n + c.count, 0),
    info,
    userPath,
    ...(description ? { description } : {}),
  };
}

/** The path shown for an owner: folders then its name (`['Equal divisions', 'Non-octave', 'Carlos Alpha (9 ED 3/2)']`). */
export function ownerPath(lib: GenLibrary, key: OwnerKey): string[] {
  const o = parseOwner(key);
  if (!o) {
    return [];
  }
  if (o.kind === 'builtin') {
    return [...builtinFolders(o.ref), o.ref];
  }
  if (o.kind === 'user') {
    const p = lib.presets.find((x) => x.id === o.ref);
    return p ? [ROOT_MINE, ...splitFolder(p.folder), p.name] : [];
  }
  const u = lib.untitled.find((x) => x.id === o.ref);
  return u ? [ROOT_UNTITLED, autoName(u.gen)] : [];
}

function leaf(lib: GenLibrary, key: OwnerKey, path: string[], idPrefix = ''): PresetNode | null {
  const o = parseOwner(key);
  if (!o || !ownerExists(lib, key)) {
    return null;
  }
  const full = ownerPath(lib, key);
  const label = full[full.length - 1] ?? o.ref;
  const builtin = o.kind === 'builtin' ? PRESETS.find((p) => p.name === o.ref) : undefined;
  const user = o.kind === 'user' ? lib.presets.find((p) => p.id === o.ref) : undefined;
  return {
    kind: 'preset',
    id: nodeId('p', idPrefix ? [idPrefix, ...path] : path, key),
    owner: key,
    label,
    path,
    count: subsetCount(lib, key),
    info: builtin ? builtin.info : full.slice(0, -1).join(SEP) || label,
    userId: user ? user.id : null,
    folder: user ? user.folder : '',
    ...(user?.description ? { description: user.description } : {}),
  };
}

interface Dir {
  folders: Map<string, Dir>;
  presets: string[];
}

export function buildTree(lib: GenLibrary): FolderNode[] {
  // Built-in: subfolders first (in table order), then the group's loose presets
  const groups: string[] = [];
  for (const p of PRESETS) {
    if (!groups.includes(p.group)) {
      groups.push(p.group);
    }
  }
  const builtin = groups.map((g) => {
    const subs = BUILTIN_SUBFOLDERS[g] ?? {};
    const placed = new Set(Object.values(subs).flat());
    const subNodes = Object.entries(subs).map(([sub, names]) =>
      folder(
        [ROOT_BUILTIN, g, sub],
        names.flatMap((n) => leaf(lib, builtinKey(n), [ROOT_BUILTIN, g, sub]) ?? []),
        `${g}, ${sub}.`
      )
    );
    const loose = PRESETS.filter((p) => p.group === g && !placed.has(p.name)).flatMap(
      (p) => leaf(lib, builtinKey(p.name), [ROOT_BUILTIN, g]) ?? []
    );
    return folder([ROOT_BUILTIN, g], [...subNodes, ...loose], `${g}.`);
  });

  // My presets: nested user folders, folders before presets, both by name. A folder record (M5) makes its folder exist
  // while empty (count 0); a record's parents are implied folders, as a preset's folder parents are.
  const root: Dir = { folders: new Map(), presets: [] };
  const dirOf = (path: string): Dir => {
    let d = root;
    for (const seg of splitFolder(path)) {
      let next = d.folders.get(seg);
      if (!next) {
        next = { folders: new Map(), presets: [] };
        d.folders.set(seg, next);
      }
      d = next;
    }
    return d;
  };
  const described = new Map<string, string>();
  for (const f of lib.folders) {
    dirOf(f.path);
    if (f.description) {
      described.set(f.path, f.description);
    }
  }
  for (const p of lib.presets) {
    dirOf(p.folder).presets.push(p.id);
  }
  const mine = (d: Dir, path: string[], rel: string[]): TreeNode[] => [
    ...[...d.folders.keys()].sort(byName).map((seg) => {
      const sub = d.folders.get(seg)!;
      return folder(
        [...path, seg],
        mine(sub, [...path, seg], [...rel, seg]),
        `Your folder ${[...rel, seg].join('/')}.`,
        [...rel, seg].join('/'),
        described.get([...rel, seg].join('/'))
      );
    }),
    ...d.presets
      .map((id) => lib.presets.find((p) => p.id === id)!)
      .sort((a, b) => byName(a.name, b.name))
      .flatMap((p) => leaf(lib, userKey(p.id), path) ?? []),
  ];

  const recent = lib.recents.flatMap((k) => leaf(lib, k, [ROOT_RECENT], 'r') ?? []);
  const untitled = lib.untitled
    .filter((u) => subsetCount(lib, untitledKey(u.id)) > 0)
    .flatMap((u) => leaf(lib, untitledKey(u.id), [ROOT_UNTITLED]) ?? []);

  return [
    folder([ROOT_BUILTIN], builtin, 'The ready-made presets, grouped by kind.'),
    folder(
      [ROOT_MINE],
      mine(root, [ROOT_MINE], []),
      lib.presets.length === 0
        ? 'Your own presets. None yet: Save as new puts one here.'
        : 'Your own presets, in the folders you gave them.',
      ''
    ),
    folder([ROOT_RECENT], recent, 'The last 8 generators you opened or added subsets to.'),
    folder(
      [ROOT_UNTITLED],
      untitled,
      'Generators that hold subsets but have no name. Save as new gives one a name.'
    ),
  ];
}

export interface Row {
  node: TreeNode;
  depth: number;
  expanded: boolean;
  /** Id of the folder this row sits in (null at the root). */
  parent: string | null;
}

/** The rows on screen with no search: roots, then the children of every expanded folder. */
export function visibleRows(roots: readonly TreeNode[], open: ReadonlySet<string>): Row[] {
  const out: Row[] = [];
  const walk = (nodes: readonly TreeNode[], depth: number, parent: string | null) => {
    for (const node of nodes) {
      const expanded = node.kind === 'folder' && open.has(node.id);
      out.push({ node, depth, expanded, parent });
      if (node.kind === 'folder' && expanded) {
        walk(node.children, depth + 1, node.id);
      }
    }
  };
  walk(roots, 0, null);
  return out;
}

function searchNodes(
  roots: readonly FolderNode[],
  query: string,
  withFolders: boolean
): TreeNode[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const out: TreeNode[] = [];
  const walk = (nodes: readonly TreeNode[]) => {
    for (const n of nodes) {
      const mine = n.kind === 'folder' && n.userPath !== null && n.userPath !== '';
      if (n.kind === 'preset' || (withFolders && mine)) {
        // M5: the description is searched too (a user preset's, a user folder's)
        const hay = `${n.label} ${n.path.join(' ')} ${n.description ?? ''}`.toLowerCase();
        if (words.every((w) => hay.includes(w))) {
          out.push(n);
        }
      }
      if (n.kind === 'folder') {
        walk(n.children);
      }
    }
  };
  walk(roots.filter((r) => r.path[0] !== ROOT_RECENT));
  return out;
}

/**
 * Flat search: every preset (Recent excluded, it repeats the others) whose name, folder path or description (M5) holds every
 * word.
 */
export const searchPresets = (roots: readonly FolderNode[], query: string): PresetNode[] =>
  searchNodes(roots, query, false) as PresetNode[];

/**
 * M5: the same flat search, plus the user folders (under My presets, never built-in folders) whose name, path or description
 * holds every word; a folder comes before the presets inside it. What the browser shows once it lists folders in a search.
 */
export const searchTree = (roots: readonly FolderNode[], query: string): TreeNode[] =>
  searchNodes(roots, query, true);

/** The ids of the folders to open so the owner's row shows (the Built-in root when there is no owner). */
export function foldersAbove(lib: GenLibrary, key: OwnerKey | null): string[] {
  if (key === null) {
    return [nodeId('f', [ROOT_BUILTIN])];
  }
  const o = parseOwner(key);
  const full = ownerPath(lib, key);
  const path = o?.kind === 'builtin' ? [ROOT_BUILTIN, ...full] : full;
  const dirs = path.slice(0, -1);
  return dirs.map((_, i) => nodeId('f', dirs.slice(0, i + 1)));
}
