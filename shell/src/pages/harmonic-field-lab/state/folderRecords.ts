/**
 * M5 folder records (H-26), pure: the user folders of the preset browser as data. A folder EXISTS when a record names it, or
 * when a preset's `folder` text names it or sits below it (the implied folders, as before M5). A record is what lets a folder
 * stay while empty and carry a description. Built-in folders (`builtinFolders.ts`) are never recorded, renamed or deleted.
 *
 * Every action returns `{ lib, refused? }`: on a refusal `lib` is the SAME object and `refused` is the plain sentence to show
 * (the reducer puts it in `LabState.refusal`, as the other library actions do). A call that changes nothing and refuses
 * nothing returns the same `lib` without `refused`.
 */
import {
  MAX_FOLDER_DEPTH,
  inFolder,
  joinFolder,
  listFolders,
  normalizeFolder,
  splitFolder,
} from '../../../lib/harmonic-field';
import { isBuiltinFolderPath } from './builtinFolders';
import {
  cleanDescription,
  deletePreset,
  userKey,
  type FolderRecord,
  type GenLibrary,
  type OwnerKey,
} from './generatorLibrary';

/** In-memory cap, equal to the load cap in libraryStore (what a session accepts, a reload keeps). */
export const MAX_FOLDERS = 500;

export interface FolderResult {
  lib: GenLibrary;
  refused?: string;
}

const refuse = (lib: GenLibrary, reason: string): FolderResult => ({ lib, refused: reason });

/** Every folder path the library names: each preset's folder and each record (ancestors are added by `listFolders`). */
export const folderPaths = (lib: GenLibrary): string[] => [
  ...lib.presets.map((p) => p.folder),
  ...lib.folders.map((f) => f.path),
];

/** Every user folder, ancestors included, unique, sorted as `listFolders` sorts: the list the browser and its pickers use. */
export const folderList = (lib: GenLibrary): string[] => listFolders(folderPaths(lib));

/**
 * The folder suggestions for a Folder box: it NEVER filters. The folder named by the typed text goes first (the exact match,
 * ignoring case), then the folders whose path starts with it, then the folders that contain it, each group in the order of
 * `folders` (the normal order); every other folder follows, also in the normal order. An empty box gives `folders` as it is.
 */
export function orderFolderSuggestions(folders: readonly string[], typed: string): string[] {
  const t = typed.trim().toLowerCase();
  if (t === '') {
    return [...folders];
  }
  const rank = (f: string): number => {
    const l = f.toLowerCase();
    return l === t ? 0 : l.startsWith(t) ? 1 : l.includes(t) ? 2 : 3;
  };
  return folders
    .map((f, i) => ({ f, i, r: rank(f) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.f);
}

/** True when this user folder exists now (a record, or implied by a preset or a record below it). */
export function folderExists(lib: GenLibrary, path: string): boolean {
  const p = normalizeFolder(path);
  return p !== '' && folderList(lib).includes(p);
}

/** The record of a folder, if it has one. */
export const folderRecord = (lib: GenLibrary, path: string): FolderRecord | undefined => {
  const p = normalizeFolder(path);
  return lib.folders.find((f) => f.path === p);
};

/** The description of a folder (undefined when none, or when the folder has no record). */
export const folderDescription = (lib: GenLibrary, path: string): string | undefined =>
  folderRecord(lib, path)?.description;

/** How many presets sit in this folder or below it. */
export const presetsInFolder = (lib: GenLibrary, path: string): number =>
  lib.presets.reduce((n, p) => n + (inFolder(p.folder, path) ? 1 : 0), 0);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------------------------------------ sanitizing */
/**
 * The records of a stored value: not a list gives none; entry by entry (not an object, no string path, an empty path after
 * `normalizeFolder`, a built-in folder path, or a path seen before is dropped); at most `MAX_FOLDERS`; descriptions cleaned.
 */
export function sanitizeFolderRecords(raw: unknown): FolderRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: FolderRecord[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (out.length >= MAX_FOLDERS) {
      break;
    }
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      continue;
    }
    const rec = e as Record<string, unknown>;
    const path = typeof rec.path === 'string' ? normalizeFolder(rec.path) : '';
    if (path === '' || isBuiltinFolderPath(path) || seen.has(path)) {
      continue;
    }
    seen.add(path);
    const description = cleanDescription(rec.description);
    out.push(description ? { path, description } : { path });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------- actions */
/** New folder: a record for a path that does not exist yet (nested paths make their parents implied folders). */
export function createFolder(lib: GenLibrary, path: string): FolderResult {
  const p = normalizeFolder(path);
  if (p === '') {
    return refuse(lib, 'Give the folder a name.');
  }
  if (isBuiltinFolderPath(p)) {
    return refuse(lib, `${p} is a built-in folder: the name is taken.`);
  }
  if (folderExists(lib, p)) {
    return refuse(lib, `A folder named ${p} already exists.`);
  }
  if (lib.folders.length >= MAX_FOLDERS) {
    return refuse(lib, `Too many folders (${MAX_FOLDERS}).`);
  }
  return { lib: { ...lib, folders: [...lib.folders, { path: p }] } };
}

/**
 * Set or clear a folder's description. A folder that exists only through presets gets a record when a description is set (so
 * the described folder stays when its presets leave). Clearing keeps the record (a folder made with New folder stays until it
 * is deleted); clearing a folder that has no record changes nothing.
 */
export function describeFolder(lib: GenLibrary, path: string, description: string): FolderResult {
  const p = normalizeFolder(path);
  if (p === '' || !folderExists(lib, p)) {
    return refuse(lib, p === '' ? 'Pick a folder first.' : `There is no folder named ${p}.`);
  }
  if (isBuiltinFolderPath(p)) {
    return refuse(lib, `${p} is a built-in folder and cannot be changed.`);
  }
  const d = cleanDescription(description);
  const cur = lib.folders.find((f) => f.path === p);
  if (!cur) {
    if (!d) {
      return { lib };
    }
    if (lib.folders.length >= MAX_FOLDERS) {
      return refuse(lib, `Too many folders (${MAX_FOLDERS}).`);
    }
    return { lib: { ...lib, folders: [...lib.folders, { path: p, description: d }] } };
  }
  if (cur.description === d) {
    return { lib };
  }
  const rec: FolderRecord = d ? { path: p, description: d } : { path: p };
  return { lib: { ...lib, folders: lib.folders.map((f) => (f === cur ? rec : f)) } };
}

/** Delete a folder: only a folder with no presets (here or below) and no subfolders (records or implied). Removes its record. */
export function deleteFolder(lib: GenLibrary, path: string): FolderResult {
  const p = normalizeFolder(path);
  if (p === '' || !folderExists(lib, p)) {
    return refuse(lib, p === '' ? 'Pick a folder first.' : `There is no folder named ${p}.`);
  }
  if (isBuiltinFolderPath(p)) {
    return refuse(lib, `${p} is a built-in folder and cannot be deleted.`);
  }
  const presets = presetsInFolder(lib, p);
  if (presets > 0) {
    return refuse(
      lib,
      `${p} has ${plural(presets, 'preset', 'presets')}. Move ${presets === 1 ? 'it' : 'them'} out first.`
    );
  }
  const subs = folderList(lib).filter((f) => f !== p && inFolder(f, p)).length;
  if (subs > 0) {
    return refuse(
      lib,
      `${p} has ${plural(subs, 'subfolder', 'subfolders')}. Delete ${subs === 1 ? 'it' : 'them'} first.`
    );
  }
  return { lib: { ...lib, folders: lib.folders.filter((f) => f.path !== p) } };
}

/** What deleting a folder takes with it: the user presets in it or below it and the subfolders below it (records or implied). */
export function folderContents(
  lib: GenLibrary,
  path: string
): { presets: number; folders: number } {
  const p = normalizeFolder(path);
  return {
    presets: presetsInFolder(lib, p),
    folders: folderList(lib).filter((f) => f !== p && inFolder(f, p)).length,
  };
}

/** The sentence that asks before a folder goes, naming exactly what goes with it (singular and plural right). */
export function deleteFolderQuestion(lib: GenLibrary, path: string): string {
  const p = normalizeFolder(path);
  const { presets, folders } = folderContents(lib, p);
  const inside = [
    presets > 0 ? plural(presets, 'preset', 'presets') : '',
    folders > 0 ? plural(folders, 'folder', 'folders') : '',
  ].filter(Boolean);
  const what = inside.length > 0 ? `${p}, its ${inside.join(' and ')}` : p;
  return `Delete ${what}?${presets > 0 ? ' Subsets stay under Auto-saved.' : ''}`;
}

export interface FolderTreeResult extends FolderResult {
  /** Each deleted preset's owner key and where its subsets went (null: it had none). Empty on a refusal. */
  moved: { from: string; to: OwnerKey | null }[];
}

/**
 * Delete a folder WITH what is inside it: its record, the records of every subfolder, and every user preset whose folder is
 * this folder or lies below it. Each preset goes through `deletePreset`, so its subsets stay under Auto-saved exactly as when
 * one preset is deleted (`moved` says where, for the tabs linked to it). Folders that exist only through those presets vanish
 * with them. Refused: a built-in folder, a folder that does not exist, or a preset whose subsets have nowhere to go (nothing
 * changes then). `deleteFolder` (empty folders only) stays for callers that must not take anything with it.
 */
export function deleteFolderTree(lib: GenLibrary, path: string): FolderTreeResult {
  const p = normalizeFolder(path);
  const none = (reason: string): FolderTreeResult => ({ lib, refused: reason, moved: [] });
  if (p === '' || !folderExists(lib, p)) {
    return none(p === '' ? 'Pick a folder first.' : `There is no folder named ${p}.`);
  }
  if (isBuiltinFolderPath(p)) {
    return none(`${p} is a built-in folder and cannot be deleted.`);
  }
  let cur = lib;
  const moved: FolderTreeResult['moved'] = [];
  for (const preset of lib.presets.filter((x) => inFolder(x.folder, p))) {
    const r = deletePreset(cur, preset.id);
    if (r.refused !== undefined) {
      return none(r.refused);
    }
    cur = r.lib;
    moved.push({ from: userKey(preset.id), to: r.moved });
  }
  return {
    lib: { ...cur, folders: cur.folders.filter((f) => !inFolder(f.path, p)) },
    moved,
  };
}

/**
 * Rename a folder: `to` is the folder's NEW FULL PATH. Every preset inside `from` or below it has its `folder` text rewritten
 * (`from/x` becomes `to/x`), and the record of `from` and the records of its subfolders move the same way (descriptions are
 * kept; nothing is copied between a folder and its presets). Refused: an empty name, a built-in `from` or `to`, a `from` that
 * does not exist, a `to` that already exists as a folder (record or implied) or lies inside `from`, and a result deeper than
 * `MAX_FOLDER_DEPTH` (it would merge folders). Renaming to the same path changes nothing.
 */
export function renameFolder(lib: GenLibrary, from: string, to: string): FolderResult {
  const f = normalizeFolder(from);
  const t = normalizeFolder(to);
  if (f === '' || !folderExists(lib, f)) {
    return refuse(lib, f === '' ? 'Pick a folder first.' : `There is no folder named ${f}.`);
  }
  if (isBuiltinFolderPath(f)) {
    return refuse(lib, `${f} is a built-in folder and cannot be renamed.`);
  }
  if (t === '') {
    return refuse(lib, 'Give the folder a name.');
  }
  if (t === f) {
    return { lib };
  }
  if (isBuiltinFolderPath(t)) {
    return refuse(lib, `${t} is a built-in folder: the name is taken.`);
  }
  if (inFolder(t, f)) {
    return refuse(lib, `A folder cannot be moved inside itself (${t}).`);
  }
  if (folderExists(lib, t)) {
    return refuse(lib, `A folder named ${t} already exists.`);
  }
  const fromDepth = splitFolder(f).length;
  const deepest = Math.max(
    fromDepth,
    ...folderPaths(lib)
      .filter((x) => inFolder(x, f))
      .map((x) => splitFolder(x).length)
  );
  if (splitFolder(t).length + (deepest - fromDepth) > MAX_FOLDER_DEPTH) {
    return refuse(
      lib,
      `Folders can go ${MAX_FOLDER_DEPTH} levels deep: that name is too long a path.`
    );
  }
  const reroot = (path: string): string => joinFolder(t, ...splitFolder(path).slice(fromDepth));
  return {
    lib: {
      ...lib,
      presets: lib.presets.map((p) =>
        inFolder(p.folder, f) ? { ...p, folder: reroot(p.folder) } : p
      ),
      folders: lib.folders.map((r) => (inFolder(r.path, f) ? { ...r, path: reroot(r.path) } : r)),
    },
  };
}
