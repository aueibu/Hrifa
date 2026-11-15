/**
 * Storage of the generator library: `hrifa.harmonic-field-lab.generators.v1`.
 *
 * ```
 * { version: 1,
 *   presets:  [{ id: 'p1', name, folder: 'A/B', gen: <generation inputs> }],
 *   untitled: [{ id: 'u1', gen: <generation inputs> }],
 *   subsets:  [{ id: 's1', owner: 'b:<built-in name>' | 'p:<id>' | 'u:<id>', name,
 *                pitches: [{ m: { '3': 1, '2': -1 } | null, c: 701.955 }], root: { m, c } | null }],
 *   recents:  ['b:...', 'p:p1'],
 *   next:     { preset, untitled, subset } }
 * ```
 * `gen` is the generation part of the tab snapshot (gen, rep, h, edoN, axes, shape, dist, bidir, cpsF, cpsK, custom, mask,
 * preset, keepNew). Plain JSON, self-contained: a subset carries its pitches, never field positions.
 *
 * Rules: entry by entry (a bad entry is dropped or repaired, the others are kept); an entry that is well formed but
 * unusable now (a subset whose owner is gone, a built-in name that no longer exists) is KEPT and written back, so a
 * later save never drops it; nothing is written on mount (the caller compares identity); bad data falls back to the
 * legacy list or to empty. Once `generators.v1` exists it is authoritative; `subsets.v1` is never touched.
 */
import { normalizeFolder, samePitch, type Note } from '../../../lib/harmonic-field';
import { sanitizePitch } from './chordShelf';
import type { GenSpec } from './generate';
import {
  OWNER_KEY_RE,
  cleanName,
  cloneGen,
  emptyLibrary,
  migrateSubsets,
  nextCounters,
  MAX_PITCHES,
  MAX_PRESETS,
  MAX_RECENTS,
  MAX_SUBSETS,
  MAX_UNTITLED,
  type GenLibrary,
  type LibSubset,
  type UntitledGen,
  type UserPreset,
} from './generatorLibrary';
import { defaultCmp, emptyPick } from './labState';
import {
  KEY_GENERATORS,
  readJson,
  sanitizeSnapshot,
  sanitizeSubsets,
  toSnapshot,
  writeJson,
  KEY_SUBSETS,
} from './persist';

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/* ----------------------------------------------------------------------------------------------- pitches */
export { sanitizePitch };

/* --------------------------------------------------------------------------------------------- generators */
const GEN_FIELDS = [
  'gen',
  'rep',
  'h',
  'edoN',
  'axes',
  'shape',
  'dist',
  'bidir',
  'cpsF',
  'cpsK',
  'custom',
  'mask',
  'preset',
  'keepNew',
  'snap',
] as const;

/** The generation part of a snapshot. */
export function genToStored(g: GenSpec): Record<string, unknown> {
  const snap = toSnapshot({
    gen: g,
    sel: [],
    field: [],
    mode: 0,
    cmp: defaultCmp(),
    pick: emptyPick(),
  }) as unknown as Record<string, unknown>;
  return Object.fromEntries(GEN_FIELDS.map((k) => [k, snap[k]]));
}
export function genFromStored(raw: unknown): GenSpec | null {
  const parts = sanitizeSnapshot(raw);
  return parts ? parts.gen : null;
}

/* ------------------------------------------------------------------------------------------------ library */
const uniqueId = (want: unknown, prefix: string, seen: Set<string>, count: number): string => {
  let id = typeof want === 'string' && new RegExp(`^${prefix}\\d{1,6}$`).test(want) ? want : '';
  if (!id || seen.has(id)) {
    let n = count + 1;
    id = `${prefix}${n}`;
    while (seen.has(id)) {
      n++;
      id = `${prefix}${n}`;
    }
  }
  seen.add(id);
  return id;
};

/**
 * Coerce a stored value into a library. Null when it is not a library at all (not an object, or none of presets /
 * untitled / subsets is a list): the caller then falls back to the legacy list or to empty.
 */
export function sanitizeLibrary(raw: unknown): GenLibrary | null {
  if (
    !isObj(raw) ||
    !(Array.isArray(raw.presets) || Array.isArray(raw.untitled) || Array.isArray(raw.subsets))
  ) {
    return null;
  }
  const presets: UserPreset[] = [];
  const seenP = new Set<string>();
  for (const e of Array.isArray(raw.presets) ? raw.presets : []) {
    const gen = isObj(e) ? genFromStored(e.gen) : null;
    if (!isObj(e) || !gen || presets.length >= MAX_PRESETS) {
      continue;
    }
    presets.push({
      id: uniqueId(e.id, 'p', seenP, presets.length),
      name: (typeof e.name === 'string' && cleanName(e.name)) || `Preset ${presets.length + 1}`,
      folder: typeof e.folder === 'string' ? normalizeFolder(e.folder) : '',
      gen: cloneGen(gen),
    });
  }
  const untitled: UntitledGen[] = [];
  const seenU = new Set<string>();
  for (const e of Array.isArray(raw.untitled) ? raw.untitled : []) {
    const gen = isObj(e) ? genFromStored(e.gen) : null;
    if (!isObj(e) || !gen || untitled.length >= MAX_UNTITLED) {
      continue;
    }
    untitled.push({ id: uniqueId(e.id, 'u', seenU, untitled.length), gen: cloneGen(gen) });
  }
  const subsets: LibSubset[] = [];
  const seenS = new Set<string>();
  for (const e of Array.isArray(raw.subsets) ? raw.subsets : []) {
    if (!isObj(e) || subsets.length >= MAX_SUBSETS) {
      continue;
    }
    if (typeof e.owner !== 'string' || !OWNER_KEY_RE.test(e.owner)) {
      continue;
    }
    const pitches = (Array.isArray(e.pitches) ? e.pitches.slice(0, MAX_PITCHES) : [])
      .map(sanitizePitch)
      .filter((p): p is Note => p !== null);
    const rootRaw = sanitizePitch(e.root);
    // a root that is not one of the pitches is repaired to none (the resolver then uses the lowest note)
    const root = rootRaw && pitches.some((p) => samePitch(p, rootRaw)) ? rootRaw : null;
    subsets.push({
      id: uniqueId(e.id, 's', seenS, subsets.length),
      owner: e.owner,
      name: (typeof e.name === 'string' && cleanName(e.name)) || `Subset ${subsets.length + 1}`,
      pitches,
      root,
    });
  }
  const recents: string[] = [];
  for (const k of Array.isArray(raw.recents) ? raw.recents : []) {
    if (typeof k === 'string' && OWNER_KEY_RE.test(k) && !recents.includes(k)) {
      recents.push(k);
    }
  }
  const base = { presets, untitled, subsets };
  const derived = nextCounters(base);
  const n = isObj(raw.next) ? raw.next : {};
  const atLeast = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isInteger(v) && v > d && v < 1e9 ? v : d;
  return {
    ...base,
    recents: recents.slice(0, MAX_RECENTS),
    next: {
      preset: atLeast(n.preset, derived.preset),
      untitled: atLeast(n.untitled, derived.untitled),
      subset: atLeast(n.subset, derived.subset),
    },
  };
}

export function libraryToStored(lib: GenLibrary): Record<string, unknown> {
  const pitch = (p: Note) => ({ m: p.m ? { ...p.m } : null, c: p.c });
  return {
    version: 1,
    presets: lib.presets.map((p) => ({
      id: p.id,
      name: p.name,
      folder: p.folder,
      gen: genToStored(p.gen),
    })),
    untitled: lib.untitled.map((u) => ({ id: u.id, gen: genToStored(u.gen) })),
    subsets: lib.subsets.map((s) => ({
      id: s.id,
      owner: s.owner,
      name: s.name,
      pitches: s.pitches.map(pitch),
      root: s.root ? pitch(s.root) : null,
    })),
    recents: lib.recents.slice(0, MAX_RECENTS),
    next: { ...lib.next },
  };
}

export type LibraryOrigin = 'stored' | 'migrated' | 'empty';

/**
 * The library for this page load. Stored `generators.v1` is authoritative; otherwise the legacy `subsets.v1` list is
 * migrated in memory (nothing is written: the first change writes `generators.v1`); otherwise empty.
 */
export function loadLibrary(): { library: GenLibrary; origin: LibraryOrigin } {
  const stored = sanitizeLibrary(readJson(KEY_GENERATORS));
  if (stored) {
    return { library: stored, origin: 'stored' };
  }
  const legacy = sanitizeSubsets(readJson(KEY_SUBSETS));
  return legacy.length
    ? { library: migrateSubsets(legacy), origin: 'migrated' }
    : { library: emptyLibrary(), origin: 'empty' };
}

/** Store the library; false when storage is unavailable or full. */
export function saveLibrary(lib: GenLibrary): boolean {
  return writeJson(KEY_GENERATORS, libraryToStored(lib));
}
