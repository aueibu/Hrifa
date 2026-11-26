import { STORAGE_KEY as settingsStorageKey } from './compositionSettings';
import { acceptsDataBlocks } from './dataBlock';
import type { StoredDataBlock } from './dataBlocks/registry';
import type { ReplaceDeskOptions } from './desk';
import {
  describeStorageError,
  getProject,
  putProjects,
  type ProjectRecord,
  type StoredProject,
} from './deskStore';
import { setReloading } from './reloading';
import { migrateStoredBlocks } from './scene/sceneMigration';
import { migrateTracks } from './scene/trackMigration';

/**
 * Saved projects. Everything the workbench remembers (nodes, their settings, routes, the
 * node tree, transport, voices, UI state) lives in localStorage under one prefix, and the
 * desk, with every data-block's version history, lives in IndexedDB. A project is a copy of both, kept in
 * IndexedDB (`deskStore.ts`). Opening one replaces the whole workbench like opening a file: the raw
 * keys are written back and the desk is replaced (nothing merges), then the page reloads.
 */
export const workbenchStoragePrefix = 'hrifa.composition-workbench.';

/** Which project this workbench is on, and whether it has unsaved changes. Outside the prefix. */
export const currentProjectKey = 'hrifa.workbench-current-project.v1';

const projectFileFormat = 'hrifa-workbench-projects';

export interface RestoreOptions {
  /** Also restore the transport and preview voices; off keeps the current ones. */
  includeSettings: boolean;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function workbenchKeys(storage: KeyValueStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(workbenchStoragePrefix)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Every workbench entry currently stored, as raw strings by key. */
export function captureWorkbenchState(storage: KeyValueStorage = localStorage) {
  const entries: Record<string, string> = {};
  workbenchKeys(storage).forEach((key) => {
    const value = storage.getItem(key);
    if (value !== null) {
      entries[key] = value;
    }
  });
  return entries;
}

/**
 * Replaces the workbench's stored state with a project's. Entries the project lacks are removed, so
 * nodes added since then disappear and missing settings fall back to defaults. Reload afterwards:
 * mounted nodes don't re-read storage.
 */
export function restoreWorkbenchState(
  entries: Record<string, string>,
  { includeSettings }: RestoreOptions,
  storage: KeyValueStorage = localStorage
) {
  const keep = (key: string) => !includeSettings && key === settingsStorageKey;
  workbenchKeys(storage)
    .filter((key) => !keep(key))
    .forEach((key) => storage.removeItem(key));
  Object.entries(entries)
    .filter(([key]) => key.startsWith(workbenchStoragePrefix) && !keep(key))
    .forEach(([key, value]) => storage.setItem(key, value));
}

export function newProjectId(now = new Date()) {
  return `project-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The unnamed project's name, after the time. */
export const defaultProjectName = (now: Date) => `Project ${now.toLocaleString()}`;

/** The desk as the project holds it: null when the desk was not readable, so open leaves it alone. */
export type ProjectDesk = StoredDataBlock[] | null;

export function createProject(
  name: string,
  desk: ProjectDesk,
  storage: KeyValueStorage = localStorage,
  now = new Date()
): ProjectRecord {
  return {
    id: newProjectId(now),
    name: name.trim() || defaultProjectName(now),
    savedAt: now.toISOString(),
    entries: captureWorkbenchState(storage),
    desk,
  };
}

export interface CurrentProject {
  id: string;
  name: string;
  /** Changes were recorded since the last save or open. */
  dirty: boolean;
}

export function readCurrentProject(storage: KeyValueStorage = localStorage): CurrentProject | null {
  try {
    const parsed = JSON.parse(
      storage.getItem(currentProjectKey) ?? 'null'
    ) as CurrentProject | null;
    return parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.dirty === 'boolean'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function writeCurrentProject(
  current: CurrentProject | null,
  storage: KeyValueStorage = localStorage
) {
  try {
    if (current) {
      storage.setItem(currentProjectKey, JSON.stringify(current));
    } else {
      storage.removeItem(currentProjectKey);
    }
  } catch {
    // The marker is a convenience; the project itself is stored in IndexedDB.
  }
}

export type ProjectResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Saves the workbench (raw keys, and the desk when given) as a project. With `existing`, and a name
 * that is empty or unchanged, that project is overwritten in place; otherwise a new project is made.
 */
export async function saveProject({
  name,
  existing,
  desk,
  storage = localStorage,
  now = new Date(),
}: {
  name: string;
  existing: { id: string; name: string } | null;
  desk: ProjectDesk;
  storage?: KeyValueStorage;
  now?: Date;
}): Promise<ProjectResult<{ project: { id: string; name: string } }>> {
  const trimmed = name.trim();
  const overwrite = existing && (!trimmed || trimmed === existing.name) ? existing : null;
  const record = createProject(overwrite ? overwrite.name : trimmed, desk, storage, now);
  if (overwrite) {
    record.id = overwrite.id;
  }
  try {
    await putProjects([record]);
  } catch (error) {
    return { ok: false, error: `The project could not be saved. ${describeStorageError(error)}` };
  }
  return { ok: true, project: { id: record.id, name: record.name } };
}

export interface OpenableDesk {
  allDataBlocks: StoredDataBlock[];
  loading: boolean;
  locked: boolean;
  replaceDesk(
    dataBlocks: StoredDataBlock[],
    options?: ReplaceDeskOptions
  ): Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * Opens a project: replaces the desk (when the project has one) and every workbench key. It either
 * does all of it or leaves everything as it was, with the reason; the caller reloads on `ok`.
 * Nothing is touched while the desk is loading or unreadable, and the desk is written before
 * localStorage; if localStorage then fails, both are put back.
 */
export async function openProject({
  id,
  desk,
  includeSettings,
  storage = localStorage,
}: {
  id: string;
  desk: OpenableDesk | undefined;
  includeSettings: boolean;
  storage?: KeyValueStorage;
}): Promise<ProjectResult<{ project: { id: string; name: string } }>> {
  if (desk?.loading) {
    return { ok: false, error: 'The desk is still loading, so nothing was opened.' };
  }
  let project: ProjectRecord | null;
  try {
    project = await getProject(id);
  } catch (error) {
    return { ok: false, error: `The project could not be read. ${describeStorageError(error)}` };
  }
  if (!project) {
    return { ok: false, error: 'That project no longer exists, so nothing was opened.' };
  }
  const projectDesk = project.desk;
  const replacing = desk !== undefined && projectDesk !== null;
  if (replacing && desk.locked) {
    return {
      ok: false,
      error: 'The saved desk could not be read, so nothing was opened and the desk is untouched.',
    };
  }
  const previousDesk = desk?.allDataBlocks;
  const previousEntries = captureWorkbenchState(storage);
  // From here the old page must not write anything (see reloading.ts); undone on every failure.
  setReloading(true);
  if (replacing) {
    const written = await desk.replaceDesk(projectDesk, { reloading: true });
    if (!written.ok) {
      setReloading(false);
      return {
        ok: false,
        error: `The desk could not be saved, so nothing was opened. ${written.error}`,
      };
    }
  }
  try {
    restoreWorkbenchState(project.entries, { includeSettings }, storage);
  } catch (error) {
    try {
      restoreWorkbenchState(previousEntries, { includeSettings: true }, storage);
    } catch {
      // Storage is failing; the page keeps running from memory.
    }
    let deskRestored = true;
    let deskError = '';
    if (replacing && previousDesk) {
      const back = await desk.replaceDesk(previousDesk, { restore: true });
      if (!back.ok) {
        deskRestored = false;
        deskError = back.error;
      }
    }
    setReloading(false);
    if (!deskRestored) {
      return {
        ok: false,
        error: `Browser storage is full, so nothing was opened, but the desk in storage could not be put back. ${deskError} The desk on screen is intact and will be saved on the next change.`,
      };
    }
    return {
      ok: false,
      error: `Browser storage is full, so nothing was opened. ${describeStorageError(error)}`,
    };
  }
  return { ok: true, project: { id: project.id, name: project.name } };
}

function isProjectShape(value: unknown): value is ProjectRecord {
  const project = value as ProjectRecord;
  return (
    Boolean(project) &&
    typeof project === 'object' &&
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.savedAt === 'string' &&
    Boolean(project.entries) &&
    typeof project.entries === 'object' &&
    Object.values(project.entries).every((entry) => typeof entry === 'string')
  );
}

/** A project file: every project with its desk and lineage, so it can be moved between browsers. */
export function projectFileText(projects: ProjectRecord[]) {
  return JSON.stringify({ format: projectFileFormat, version: 1, projects }, null, 2);
}

/**
 * Reads an exported project file. Imported projects get fresh
 * ids so they never replace saved ones; entries outside the workbench prefix are dropped, and a desk
 * that is not a valid desk is left out.
 */
export function parseProjectFile(text: string): ProjectRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = parsed as {
    format?: unknown;
    version?: unknown;
    projects?: unknown;
  };
  const stamp = Date.now().toString(36);
  if (!file || file.format !== projectFileFormat || !Array.isArray(file.projects)) {
    throw new Error('That file is not a workbench project export.');
  }
  if (file.version !== 1) {
    throw new Error(`Unsupported project file version: ${String(file.version)}.`);
  }
  return (file.projects as ProjectRecord[]).filter(isProjectShape).map((project, index) => {
    // Objects saved with strips are unwrapped to one placement each before the desk is checked (W-77).
    const desk = Array.isArray(project.desk)
      ? migrateTracks(migrateStoredBlocks(project.desk))
      : project.desk;
    return {
      id: `project-${stamp}-import-${index}`,
      name: project.name,
      savedAt: project.savedAt,
      entries: Object.fromEntries(
        Object.entries(project.entries).filter(([key]) => key.startsWith(workbenchStoragePrefix))
      ),
      desk: acceptsDataBlocks(desk) ? desk : null,
    };
  });
}

export type { StoredProject };
