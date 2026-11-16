/**
 * The generator library (M7b): named generator presets that OWN their subsets. Pure functions over `GenLibrary`, no React
 * and no storage (persist/libraryStore.ts stores it as `hrifa.harmonic-field-lab.generators.v1`).
 *
 * An OWNER is a generator that can own subsets, named by an `OwnerKey`:
 *   `b:<preset name>`  a built-in preset (its data lives in the lib's `PRESETS`; only its subsets are stored here)
 *   `p:<id>`           a user preset `{ id, name, folder, gen }`
 *   `u:<id>`           an Untitled generator `{ id, gen }`: a generator that got a subset before it was named
 * A subset stores PITCHES (monzo + cents, and the mode root as a pitch), never field positions, so it re-resolves
 * against any field (lib `resolvePitches`). Subsets live in one flat list, each with its owner key.
 */
import {
  PRESETS,
  applyUpdate,
  findDuplicate,
  indexField,
  normalizeFolder,
  resolvePitchesIn,
  type NamedPitchSet,
  type Note,
  type PitchSet,
  type UpdateReport,
} from '../../../lib/harmonic-field';
import {
  autoName,
  genFromPreset,
  genKey,
  generateField,
  presetByName,
  type GenSpec,
} from './generate';

export type OwnerKey = string;
export const MAX_RECENTS = 8;
/** In-memory caps, equal to the load caps in libraryStore: what the session accepts, a reload keeps. */
export const MAX_PRESETS = 2000;
export const MAX_UNTITLED = 2000;
export const MAX_SUBSETS = 20000;
export const MAX_PITCHES = 4096;

export interface UserPreset {
  id: string;
  name: string;
  /** Plain folder path such as `Pools/Seven`; '' is the top of My presets. */
  folder: string;
  gen: GenSpec;
}
export interface UntitledGen {
  id: string;
  gen: GenSpec;
}
export interface LibSubset extends NamedPitchSet {
  /** The generator that owns this subset. */
  owner: OwnerKey;
}
export interface GenLibrary {
  presets: UserPreset[];
  untitled: UntitledGen[];
  subsets: LibSubset[];
  /** Owner keys, most recent first, at most `MAX_RECENTS`. */
  recents: OwnerKey[];
  /** Id counters (never reused while the library lives). */
  next: { preset: number; untitled: number; subset: number };
}

export const emptyLibrary = (): GenLibrary => ({
  presets: [],
  untitled: [],
  subsets: [],
  recents: [],
  next: { preset: 1, untitled: 1, subset: 1 },
});

export const cleanName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 60);

/* ------------------------------------------------------------------------------------------------- keys */
export const builtinKey = (name: string): OwnerKey => `b:${name}`;
export const userKey = (id: string): OwnerKey => `p:${id}`;
export const untitledKey = (id: string): OwnerKey => `u:${id}`;
export type OwnerKind = 'builtin' | 'user' | 'untitled';
export function parseOwner(key: OwnerKey): { kind: OwnerKind; ref: string } | null {
  const m = /^([bpu]):(.+)$/s.exec(key);
  if (!m) {
    return null;
  }
  return { kind: m[1] === 'b' ? 'builtin' : m[1] === 'p' ? 'user' : 'untitled', ref: m[2] };
}
export const OWNER_KEY_RE = /^[bpu]:.{1,120}$/s;

export function cloneGen(g: GenSpec, preset = ''): GenSpec {
  return { ...g, preset, axes: g.axes.map((a) => ({ ...a })), mask: g.mask.slice() };
}

const builtinKeys = new Map<string, string>();
/** `genKey` of a built-in preset's generator (memoized: the presets are constants). */
export function builtinGenKey(name: string): string | null {
  const hit = builtinKeys.get(name);
  if (hit !== undefined) {
    return hit;
  }
  const p = presetByName(name);
  if (!p) {
    return null;
  }
  const k = genKey(genFromPreset(p));
  builtinKeys.set(name, k);
  return k;
}
/** Names of the built-in presets whose generator has this `genKey`, in preset order. */
export const builtinsWithKey = (key: string): string[] =>
  PRESETS.filter((p) => builtinGenKey(p.name) === key).map((p) => p.name);

/* ---------------------------------------------------------------------------------------------- lookups */
export function ownerExists(lib: GenLibrary, key: OwnerKey): boolean {
  const o = parseOwner(key);
  if (!o) {
    return false;
  }
  return o.kind === 'builtin'
    ? presetByName(o.ref) !== undefined
    : o.kind === 'user'
      ? lib.presets.some((p) => p.id === o.ref)
      : lib.untitled.some((u) => u.id === o.ref);
}

/** The generator of an owner (a fresh object), or null when it does not exist. */
export function ownerGen(lib: GenLibrary, key: OwnerKey): GenSpec | null {
  const o = parseOwner(key);
  if (!o) {
    return null;
  }
  if (o.kind === 'builtin') {
    const p = presetByName(o.ref);
    return p ? genFromPreset(p) : null;
  }
  const g =
    o.kind === 'user'
      ? lib.presets.find((p) => p.id === o.ref)?.gen
      : lib.untitled.find((u) => u.id === o.ref)?.gen;
  return g ? cloneGen(g) : null;
}

/** What the user sees for the Untitled generators (the stored `u:` keys and `untitled` list keep their names). */
export const AUTO_SAVED = 'Auto-saved';

/** The name an owner shows (Auto-saved generators are named by their inputs). */
export function ownerLabel(lib: GenLibrary, key: OwnerKey): string {
  const o = parseOwner(key);
  if (!o) {
    return key;
  }
  if (o.kind === 'builtin') {
    return o.ref;
  }
  if (o.kind === 'user') {
    return lib.presets.find((p) => p.id === o.ref)?.name ?? o.ref;
  }
  const u = lib.untitled.find((x) => x.id === o.ref);
  return u ? `${AUTO_SAVED}: ${autoName(u.gen)}` : AUTO_SAVED;
}

/** Where an owner sits in the preset browser: `['Built-in', group]`, `['My presets', ...folder]`, `['Auto-saved']`. */
export function ownerCrumbs(lib: GenLibrary, key: OwnerKey): string[] {
  const o = parseOwner(key);
  if (!o) {
    return [];
  }
  if (o.kind === 'builtin') {
    const p = presetByName(o.ref);
    return p ? ['Built-in', p.group] : ['Built-in'];
  }
  if (o.kind === 'user') {
    const p = lib.presets.find((x) => x.id === o.ref);
    return ['My presets', ...(p && p.folder ? p.folder.split('/') : [])];
  }
  return [AUTO_SAVED];
}

export const subsetsOf = (lib: GenLibrary, key: OwnerKey | null): LibSubset[] =>
  key === null ? [] : lib.subsets.filter((s) => s.owner === key);
export const subsetCount = (lib: GenLibrary, key: OwnerKey): number =>
  lib.subsets.reduce((n, s) => n + (s.owner === key ? 1 : 0), 0);

/** What a tab needs to find its owner. */
export interface TabLink {
  gen: GenSpec;
  link?: OwnerKey;
}

/**
 * The generator a tab belongs to: its explicit link when that still exists; else the built-in preset named by
 * `gen.preset`; else a user preset, an Untitled generator or a built-in preset with the same `genKey`; else null (an
 * unsaved generator: it has no subsets yet).
 */
export function ownerOfTab(lib: GenLibrary, t: TabLink): OwnerKey | null {
  if (t.link && ownerExists(lib, t.link)) {
    return t.link;
  }
  if (t.gen.preset && presetByName(t.gen.preset)) {
    return builtinKey(t.gen.preset);
  }
  const k = genKey(t.gen);
  const u = lib.presets.find((p) => genKey(p.gen) === k);
  if (u) {
    return userKey(u.id);
  }
  const un = lib.untitled.find((x) => genKey(x.gen) === k);
  if (un) {
    return untitledKey(un.id);
  }
  const b = builtinsWithKey(k)[0];
  return b !== undefined ? builtinKey(b) : null;
}

/** The "modified" flag: the tab is linked to a generator but its inputs no longer build that generator's field. */
export function isModified(lib: GenLibrary, t: TabLink): boolean {
  const key = ownerOfTab(lib, t);
  const g = key === null ? null : ownerGen(lib, key);
  return g !== null && genKey(g) !== genKey(t.gen);
}

/* ------------------------------------------------------------------------------------------------ helpers */
const bump = (lib: GenLibrary, k: keyof GenLibrary['next']): [GenLibrary, string] => {
  const n = lib.next[k];
  const prefix = k === 'preset' ? 'p' : k === 'untitled' ? 'u' : 's';
  return [{ ...lib, next: { ...lib.next, [k]: n + 1 } }, `${prefix}${n}`];
};

/** Push an owner to the front of Recent (deduped, at most 8). */
export function pushRecent(lib: GenLibrary, key: OwnerKey): GenLibrary {
  if (lib.recents[0] === key) {
    return lib;
  }
  return { ...lib, recents: [key, ...lib.recents.filter((k) => k !== key)].slice(0, MAX_RECENTS) };
}

const replaceRecent = (recents: OwnerKey[], from: OwnerKey, to: OwnerKey | null): OwnerKey[] => {
  const out: OwnerKey[] = [];
  for (const k of recents) {
    const next = k === from ? to : k;
    if (next !== null && !out.includes(next)) {
      out.push(next);
    }
  }
  return out;
};

/* ------------------------------------------------------------------------------------------------ subsets */
export interface AddResult {
  lib: GenLibrary;
  id: string;
  /** True when an identical subset (same pitch set and mode root) already existed: nothing was added. */
  duplicate: boolean;
  /** Set (and nothing added) when a cap is reached: the reason to show. */
  refused?: string;
}

/** The next free "Subset N" label of an owner. */
export function autoLabel(lib: GenLibrary, key: OwnerKey): string {
  const names = new Set(subsetsOf(lib, key).map((s) => s.name));
  let n = subsetsOf(lib, key).length + 1;
  while (names.has(`Subset ${n}`)) {
    n++;
  }
  return `Subset ${n}`;
}

/**
 * Add: the pitch set becomes the owner's next row (label "Subset N" unless a name is given). An identical subset (same
 * pitch set and mode root) returns the existing row's id and adds nothing. No cap.
 */
export function addSubset(lib: GenLibrary, key: OwnerKey, set: PitchSet, name?: string): AddResult {
  const dup = findDuplicate(subsetsOf(lib, key), set);
  if (dup) {
    return { lib, id: dup.id, duplicate: true };
  }
  if (lib.subsets.length >= MAX_SUBSETS) {
    return {
      lib,
      id: '',
      duplicate: false,
      refused: `The library is full (${MAX_SUBSETS} subsets).`,
    };
  }
  if (set.pitches.length > MAX_PITCHES) {
    return {
      lib,
      id: '',
      duplicate: false,
      refused: `A subset holds at most ${MAX_PITCHES} pitches.`,
    };
  }
  const [next, id] = bump(lib, 'subset');
  const row: LibSubset = {
    id,
    owner: key,
    name: (name && cleanName(name)) || autoLabel(lib, key),
    pitches: set.pitches.map((p) => ({ m: p.m ? { ...p.m } : null, c: p.c })),
    root: set.root ? { m: set.root.m ? { ...set.root.m } : null, c: set.root.c } : null,
  };
  return { lib: { ...next, subsets: [...next.subsets, row] }, id, duplicate: false };
}

/** Rename (an empty name changes nothing). */
export function renameSubset(lib: GenLibrary, id: string, name: string): GenLibrary {
  const nm = cleanName(name);
  if (!nm || !lib.subsets.some((s) => s.id === id && s.name !== nm)) {
    return lib;
  }
  return { ...lib, subsets: lib.subsets.map((s) => (s.id === id ? { ...s, name: nm } : s)) };
}
export function deleteSubset(lib: GenLibrary, id: string): GenLibrary {
  return lib.subsets.some((s) => s.id === id)
    ? { ...lib, subsets: lib.subsets.filter((s) => s.id !== id) }
    : lib;
}

/* ------------------------------------------------------------------------------------------------ presets */
/** The Untitled generator with these inputs (created when there is none). */
export function ensureUntitled(
  lib: GenLibrary,
  gen: GenSpec
): { lib: GenLibrary; key: OwnerKey | null; refused?: string } {
  const k = genKey(gen);
  const hit = lib.untitled.find((u) => genKey(u.gen) === k);
  if (hit) {
    return { lib, key: untitledKey(hit.id) };
  }
  if (lib.untitled.length >= MAX_UNTITLED) {
    return { lib, key: null, refused: `Too many Auto-saved generators (${MAX_UNTITLED}).` };
  }
  const [next, id] = bump(lib, 'untitled');
  return {
    lib: { ...next, untitled: [...next.untitled, { id, gen: cloneGen(gen) }] },
    key: untitledKey(id),
  };
}

/** A new user preset (no subsets). The name defaults to the generator's automatic name. */
export function saveUserPreset(
  lib: GenLibrary,
  p: { name: string; folder: string; gen: GenSpec }
): { lib: GenLibrary; key: OwnerKey | null; refused?: string } {
  if (lib.presets.length >= MAX_PRESETS) {
    return { lib, key: null, refused: `Too many presets (${MAX_PRESETS}).` };
  }
  const [next, id] = bump(lib, 'preset');
  const preset: UserPreset = {
    id,
    name: cleanName(p.name) || cleanName(autoName(p.gen)) || 'Preset',
    folder: normalizeFolder(p.folder),
    gen: cloneGen(p.gen),
  };
  return { lib: { ...next, presets: [...next.presets, preset] }, key: userKey(id) };
}

/** Name an Untitled generator: it becomes a user preset and its subsets move with it. */
export function promoteUntitled(
  lib: GenLibrary,
  uid: string,
  p: { name: string; folder: string }
): { lib: GenLibrary; key: OwnerKey } | null {
  const u = lib.untitled.find((x) => x.id === uid);
  if (!u) {
    return null;
  }
  const saved = saveUserPreset(lib, { ...p, gen: u.gen });
  const from = untitledKey(uid);
  if (saved.key === null) {
    return null;
  }
  const to = saved.key;
  return {
    key: to,
    lib: {
      ...saved.lib,
      untitled: saved.lib.untitled.filter((x) => x.id !== uid),
      subsets: saved.lib.subsets.map((s) => (s.owner === from ? { ...s, owner: to } : s)),
      recents: replaceRecent(saved.lib.recents, from, to),
    },
  };
}

const patchPreset = (lib: GenLibrary, id: string, patch: Partial<UserPreset>): GenLibrary => {
  const cur = lib.presets.find((p) => p.id === id);
  if (!cur) {
    return lib;
  }
  return { ...lib, presets: lib.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
};
export function renamePreset(lib: GenLibrary, id: string, name: string): GenLibrary {
  const nm = cleanName(name);
  return nm ? patchPreset(lib, id, { name: nm }) : lib;
}
export const movePreset = (lib: GenLibrary, id: string, folder: string): GenLibrary =>
  patchPreset(lib, id, { folder: normalizeFolder(folder) });

/**
 * Delete a user preset. Its subsets are KEPT under an Untitled generator with the preset's inputs (an existing Untitled
 * generator with the same inputs is reused). `moved` is that owner (null when the preset had no subsets).
 */
export function deletePreset(
  lib: GenLibrary,
  id: string
): { lib: GenLibrary; moved: OwnerKey | null; refused?: string } {
  const p = lib.presets.find((x) => x.id === id);
  if (!p) {
    return { lib, moved: null };
  }
  const from = userKey(id);
  const without = { ...lib, presets: lib.presets.filter((x) => x.id !== id) };
  if (subsetCount(lib, from) === 0) {
    return { lib: { ...without, recents: replaceRecent(lib.recents, from, null) }, moved: null };
  }
  const u = ensureUntitled(without, p.gen);
  const to = u.key;
  if (to === null) {
    // nowhere to keep the subsets: the preset stays
    return { lib, moved: null, refused: u.refused };
  }
  return {
    moved: to,
    lib: {
      ...u.lib,
      subsets: u.lib.subsets.map((s) => (s.owner === from ? { ...s, owner: to } : s)),
      recents: replaceRecent(u.lib.recents, from, to),
    },
  };
}

/* ------------------------------------------------------------------------------------------------- Update */
/** Everything Undo needs, per subset the Update rewrote or removed. Runtime only. */
export interface UndoEntry {
  /** The subset before the update, and where it sat in the flat list. */
  before: LibSubset;
  at: number;
  /** What the update left in its place (null: the update removed it). */
  after: LibSubset | null;
}
export interface UpdateUndo {
  owner: OwnerKey;
  /** The owner's generator before the update, and the `genKey` the update gave it. */
  gen: GenSpec;
  newGenKey: string;
  /** Only the subsets the update changed. */
  entries: UndoEntry[];
}
export interface UpdateOutcome {
  lib: GenLibrary;
  report: UpdateReport;
  undo: UpdateUndo;
}

const sameRow = (a: LibSubset, b: LibSubset): boolean =>
  a.id === b.id &&
  a.owner === b.owner &&
  a.name === b.name &&
  JSON.stringify([a.pitches, a.root]) === JSON.stringify([b.pitches, b.root]);

/**
 * Update preset: the owner (a user preset or an Untitled generator) takes `gen`, and each of its subsets re-resolves
 * against `field` (the edited generator's field): unmatched pitches go, subsets left empty go. Built-in presets cannot be
 * updated (null): the edit stays a "modified" tab, or is saved as new. An empty field is refused (null).
 */
export function updateOwner(
  lib: GenLibrary,
  key: OwnerKey,
  gen: GenSpec,
  field: readonly Note[]
): UpdateOutcome | null {
  const o = parseOwner(key);
  const old = ownerGen(lib, key);
  if (!o || o.kind === 'builtin' || !old || field.length === 0) {
    return null;
  }
  const mine = subsetsOf(lib, key);
  const at = new Map(lib.subsets.map((s, i) => [s.id, i]));
  const res = applyUpdate(mine, field);
  const byId = new Map(res.subsets.map((s) => [s.id, s]));
  const entries: UndoEntry[] = [];
  for (const before of res.undo) {
    const after = byId.get(before.id) ?? null;
    if (after === null || !sameRow(before, after)) {
      entries.push({ before, at: at.get(before.id) ?? lib.subsets.length, after });
    }
  }
  const newGen = cloneGen(gen);
  const withGen =
    o.kind === 'user'
      ? {
          ...lib,
          presets: lib.presets.map((p) => (p.id === o.ref ? { ...p, gen: newGen } : p)),
        }
      : {
          ...lib,
          untitled: lib.untitled.map((u) => (u.id === o.ref ? { ...u, gen: newGen } : u)),
        };
  return {
    lib: {
      ...withGen,
      subsets: lib.subsets.flatMap((s) =>
        s.owner !== key ? [s] : byId.has(s.id) ? [byId.get(s.id)!] : []
      ),
    },
    report: res.report,
    undo: { owner: key, gen: old, newGenKey: genKey(newGen), entries },
  };
}

const copyRow = (s: LibSubset): LibSubset => ({
  ...s,
  pitches: s.pitches.map((p) => ({ m: p.m ? { ...p.m } : null, c: p.c })),
  root: s.root ? { m: s.root.m ? { ...s.root.m } : null, c: s.root.c } : null,
});

/**
 * Undo an Update, touching only what it changed: each subset it rewrote comes back if it still is what the update left
 * (one changed or deleted since is left alone), each subset it removed comes back, and the generator returns if it still
 * is what the update set. Subsets that were not part of the update (added, copied or synced since) are never touched.
 */
export function undoUpdate(lib: GenLibrary, undo: UpdateUndo): GenLibrary {
  const o = parseOwner(undo.owner);
  if (!o || o.kind === 'builtin' || !ownerExists(lib, undo.owner)) {
    return lib;
  }
  const cur = ownerGen(lib, undo.owner);
  const gen = cloneGen(undo.gen);
  const withGen =
    cur && genKey(cur) === undo.newGenKey
      ? o.kind === 'user'
        ? { ...lib, presets: lib.presets.map((p) => (p.id === o.ref ? { ...p, gen } : p)) }
        : { ...lib, untitled: lib.untitled.map((u) => (u.id === o.ref ? { ...u, gen } : u)) }
      : lib;
  const byId = new Map(undo.entries.map((e) => [e.before.id, e]));
  const out = withGen.subsets.map((s) => {
    const e = byId.get(s.id);
    return e && e.after && sameRow(s, e.after) ? copyRow(e.before) : s;
  });
  const present = new Set(out.map((s) => s.id));
  // subsets the update removed come back at their old positions (unless the id is somehow taken)
  const removed = undo.entries
    .filter((e) => e.after === null && !present.has(e.before.id))
    .sort((a, b) => a.at - b.at);
  for (const e of removed) {
    out.splice(Math.min(e.at, out.length), 0, copyRow(e.before));
  }
  return { ...withGen, subsets: out };
}

/**
 * Copy `from`'s subsets to `to`, re-resolved against `field` (Save as new with Shift; a later Import calls the same
 * thing with another owner's subsets). Unmatched pitches and empty subsets are dropped; copies get new ids.
 */
export function copySubsetsTo(
  lib: GenLibrary,
  from: OwnerKey,
  to: OwnerKey,
  field: readonly Note[]
): { lib: GenLibrary; report: UpdateReport; refused?: string } {
  const res = applyUpdate(subsetsOf(lib, from), field);
  if (lib.subsets.length + res.subsets.length > MAX_SUBSETS) {
    return {
      lib,
      report: res.report,
      refused: `The copy would pass the library limit (${MAX_SUBSETS} subsets).`,
    };
  }
  let cur = lib;
  const rows: LibSubset[] = [];
  for (const s of res.subsets) {
    const [next, id] = bump(cur, 'subset');
    cur = next;
    rows.push({ ...s, id, owner: to });
  }
  return { lib: { ...cur, subsets: [...cur.subsets, ...rows] }, report: res.report };
}

/* ------------------------------------------------------------------------------------------------ migration */
/** An entry of the legacy flat `subsets.v1` list (what `sanitizeSubsets` returns). */
export interface LegacySaved {
  id: string;
  name: string;
  gen: GenSpec;
  selCents: number[];
  mode: number;
}

const idNum = (id: string) => Number(id.slice(1)) || 0;
/** Counters that clear every existing id. */
export function nextCounters(
  lib: Pick<GenLibrary, 'presets' | 'untitled' | 'subsets'>
): GenLibrary['next'] {
  const top = (xs: { id: string }[]) => xs.reduce((m, x) => Math.max(m, idNum(x.id)), 0) + 1;
  return { preset: top(lib.presets), untitled: top(lib.untitled), subset: top(lib.subsets) };
}

/**
 * Convert the legacy flat list into a library: subsets grouped by their generation inputs (`genKey`); a group equal to a
 * built-in preset's inputs is owned by that preset (the one the entries name, else the first), every other group becomes
 * an Untitled generator. Pitches come from each entry's stored `selCents` looked up in the field the entry's generator
 * builds: a note found within 0.01 c carries its exact monzo, one not found (or a generator that no longer builds)
 * stays a cents-only pitch, so nothing is dropped. The mode root is the pitch at the stored mode (0 when out of range),
 * counted in ascending cents as the old loader did. Every entry appears once, with its id and name; order is kept.
 * Pure and idempotent (the caller derives it at load and writes nothing).
 */
export function migrateSubsets(legacy: readonly LegacySaved[]): GenLibrary {
  const groups = new Map<string, { s: LegacySaved; i: number }[]>();
  legacy.forEach((s, i) => {
    const k = genKey(s.gen);
    groups.set(k, [...(groups.get(k) ?? []), { s, i }]);
  });
  const untitled: UntitledGen[] = [];
  const subsets: LibSubset[] = [];
  const ownerOfGroup = new Map<string, OwnerKey>();
  const pitchesOf: { pitches: Note[]; root: Note | null }[] = [];
  for (const [k, group] of groups) {
    const cands = builtinsWithKey(k);
    const named = group.map((e) => e.s.gen.preset).find((n) => cands.includes(n));
    let owner: OwnerKey;
    if (cands.length > 0) {
      owner = builtinKey(named ?? cands[0]);
    } else {
      const id = `u${untitled.length + 1}`;
      untitled.push({ id, gen: cloneGen(group[0].s.gen) });
      owner = untitledKey(id);
    }
    ownerOfGroup.set(k, owner);
    const built = generateField(group[0].s.gen);
    const ix = indexField(built.ok ? built.field : []);
    for (const { s, i } of group) {
      const cents = [...s.selCents].sort((a, b) => a - b);
      const raw = cents.map((c): Note => {
        const hit = resolvePitchesIn(ix, [{ m: null, c }], 0.0099999).match[0];
        return hit === null
          ? { m: null, c }
          : { m: ix.field[hit].m ? { ...ix.field[hit].m } : null, c: ix.field[hit].c };
      });
      const pitches = raw.filter((p, i) => i === 0 || Math.abs(p.c - raw[i - 1].c) > 1e-9);
      const mode = Number.isInteger(s.mode) && s.mode >= 0 && s.mode < pitches.length ? s.mode : 0;
      pitchesOf[i] = {
        pitches,
        root: pitches[mode]
          ? { m: pitches[mode].m ? { ...pitches[mode].m } : null, c: pitches[mode].c }
          : null,
      };
    }
  }
  legacy.forEach((s, i) => {
    const p = pitchesOf[i];
    subsets.push({
      id: s.id,
      owner: ownerOfGroup.get(genKey(s.gen)) ?? untitledKey('u0'),
      name: s.name,
      pitches: p.pitches,
      root: p.root,
    });
  });
  const lib: GenLibrary = {
    presets: [],
    untitled,
    subsets,
    recents: [],
    next: emptyLibrary().next,
  };
  return { ...lib, next: nextCounters(lib) };
}

/* ------------------------------------------------------------------------------------------------ selectors */
/** Subsets whose owner no longer exists (a renamed built-in, a preset removed elsewhere): stored, written back, loadable. */
export const orphanSubsets = (lib: GenLibrary): LibSubset[] =>
  lib.subsets.filter((s) => !ownerExists(lib, s.owner));

/**
 * Why "Update preset" would do nothing for this tab, or null when it can run: no generator, a built-in preset (save as
 * new instead), nothing modified, a generator that does not build, or an empty field.
 */
export function updateBlocker(lib: GenLibrary, t: TabLink): string | null {
  const key = ownerOfTab(lib, t);
  const o = key === null ? null : parseOwner(key);
  if (key === null || !o) {
    return 'This generator is not saved yet: add a subset or save it as a preset first.';
  }
  if (o.kind === 'builtin') {
    return 'Built-in presets cannot be changed. Save as new instead.';
  }
  if (!isModified(lib, t)) {
    return 'Nothing has changed since this preset was saved.';
  }
  const built = generateField(t.gen);
  if (!built.ok) {
    return `The generator does not build: ${built.err}`;
  }
  return built.field.length === 0 ? 'The generator has no notes.' : null;
}
