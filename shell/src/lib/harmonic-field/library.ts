/**
 * Generator library core (M7b): what identifies a generator, subsets as PITCHES (not field positions), matching a pitch
 * set against any field, the Update / Save-as-new / Import report with its undo data, and folder-path helpers.
 * Pure: no React, no DOM, no storage. See README.md ("Generator library").
 */
import { parseInterval } from './intervals';
import type { Monzo, Note } from './types';

/* ------------------------------------------------------------------------------------------ identity */
/** The inputs of a generator that the lab edits (structurally the page's `GenSpec`, minus the preset label and keepNew). */
export interface GeneratorInputs {
  method: 'harmonic' | 'sub' | 'edo' | 'lattice' | 'cps' | 'custom';
  rep: string;
  h: number;
  edoN: number;
  shape: 'box' | 'diamond';
  axes: { on: boolean; g: string; n: number; ctr: number }[];
  dist: number;
  bidir: boolean;
  cpsF: string;
  cpsK: number;
  custom: string;
  mask: boolean[];
}

/**
 * The canonical identity of a generator: exactly the inputs that decide the field. Two generators with the same key
 * build the same field. Left out: the preset label, the keepNew switch, and the inputs of the other methods (a diamond
 * ignores the axis counts and centres; harmonic ignores the EDO count). Intervals are compared by pitch, so "2" and
 * "2/1" are one repeat. An unreadable interval stays as typed (prefixed `?`).
 */
export function generatorKey(g: GeneratorInputs): string {
  const iv = (t: string) => {
    const n = parseInterval(t);
    return n ? `${n.c.toFixed(6)}` : `?${t.trim()}`;
  };
  const common = { m: g.method, r: iv(g.rep), k: g.mask.map((b) => (b ? 1 : 0)).join('') };
  switch (g.method) {
    case 'harmonic':
    case 'sub':
      return JSON.stringify({ ...common, h: g.h });
    case 'edo':
      return JSON.stringify({ ...common, n: g.edoN });
    case 'lattice': {
      const axes = g.axes.filter((a, i) => i === 0 || a.on);
      return g.shape === 'diamond'
        ? JSON.stringify({ ...common, s: 'd', a: axes.map((a) => iv(a.g)), d: g.dist, b: g.bidir })
        : JSON.stringify({ ...common, s: 'b', a: axes.map((a) => [iv(a.g), a.n, a.ctr]) });
    }
    case 'cps':
      return JSON.stringify({
        ...common,
        f: g.cpsF
          .trim()
          .split(/[\s,]+/)
          .map(iv),
        ck: g.cpsK,
      });
    default:
      return JSON.stringify({ ...common, t: g.custom.trim().split(/\s+/).map(iv) });
  }
}

/* -------------------------------------------------------------------------------------------- pitches */
/** Default matching tolerance (cents) when a pitch set is re-resolved against a field. */
export const MATCH_TOL = 0.5;
/** Two pitches without a shared exact monzo are "the same" within this many cents (as the old saved-subset loader). */
export const SAME_TOL = 0.01;

/** A subset as pitches: notes (monzo + cents above 1/1) and the mode root as a pitch too. */
export interface PitchSet {
  pitches: Note[];
  root: Note | null;
}

const clonePitch = (n: Note): Note => ({ m: n.m ? { ...n.m } : null, c: n.c });

/** Exact monzo equality (zero exponents are ignored). */
export function monzoEq(a: Monzo, b: Monzo): boolean {
  const ka = Object.keys(a).filter((k) => a[k] !== 0);
  const kb = Object.keys(b).filter((k) => b[k] !== 0);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

/** The same pitch: exact monzos when both have one, else cents within `SAME_TOL`. */
export function samePitch(a: Note, b: Note): boolean {
  return a.m && b.m ? monzoEq(a.m, b.m) : Math.abs(a.c - b.c) < SAME_TOL;
}

/** The selected field notes (ascending indices) as a pitch set; `mode` indexes `sel` and picks the root. */
export function subsetFromSelection(
  field: readonly Note[],
  sel: readonly number[],
  mode = 0
): PitchSet {
  const idx = [...new Set(sel)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < field.length)
    .sort((a, b) => a - b);
  const pitches = idx.map((i) => clonePitch(field[i]));
  const root = pitches[mode >= 0 && mode < pitches.length ? mode : 0] ?? null;
  return { pitches, root: root ? clonePitch(root) : null };
}

/** The same pitch set and the same mode root (the duplicate test of Add). */
export function samePitchSet(a: PitchSet, b: PitchSet): boolean {
  if (a.pitches.length !== b.pitches.length) {
    return false;
  }
  const byC = (x: Note, y: Note) => x.c - y.c;
  const pa = [...a.pitches].sort(byC);
  const pb = [...b.pitches].sort(byC);
  if (!pa.every((p, i) => samePitch(p, pb[i]))) {
    return false;
  }
  return a.root && b.root ? samePitch(a.root, b.root) : a.root === b.root;
}

/** The first of `sets` with the same pitch set and mode root as `candidate`, or null. */
export function findDuplicate<T extends PitchSet>(
  sets: readonly T[],
  candidate: PitchSet
): T | null {
  return sets.find((s) => samePitchSet(s, candidate)) ?? null;
}

/** A field prepared for repeated matching (built once, used for many subsets). */
export interface FieldIndex {
  field: readonly Note[];
  byMonzo: Map<string, number>;
  /** Field indices ordered by cents, and those cents. */
  order: number[];
  cents: number[];
}

const monzoId = (m: Monzo) =>
  Object.keys(m)
    .filter((k) => m[k] !== 0)
    .sort((x, y) => Number(x) - Number(y))
    .map((k) => `${k}^${m[k]}`)
    .join(' ');

export function indexField(field: readonly Note[]): FieldIndex {
  const byMonzo = new Map<string, number>();
  field.forEach((n, i) => {
    if (n.m) {
      const id = monzoId(n.m);
      if (!byMonzo.has(id)) {
        byMonzo.set(id, i);
      }
    }
  });
  const order = field.map((_, i) => i).sort((a, b) => field[a].c - field[b].c);
  return { field, byMonzo, order, cents: order.map((i) => field[i].c) };
}

export interface PitchResolution {
  /** Matched field index of each pitch (null: no match). */
  match: (number | null)[];
  /** Distinct matched field indices, ascending. */
  indices: number[];
  /** Positions in the pitch list that were found / not found. */
  found: number[];
  missing: number[];
}

/** Nearest field note by cents within `tol` (inclusive), or null. */
function nearestByCents(ix: FieldIndex, c: number, tol: number): number | null {
  let lo = 0;
  let hi = ix.cents.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ix.cents[mid] < c) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  let best: number | null = null;
  let bestD = Infinity;
  for (const k of [lo - 1, lo]) {
    if (k >= 0 && k < ix.cents.length) {
      const d = Math.abs(ix.cents[k] - c);
      if (d <= tol && d < bestD) {
        best = ix.order[k];
        bestD = d;
      }
    }
  }
  return best;
}

/** `resolvePitches` against a prepared index. Exact monzo first, else the nearest note within `tol` cents. */
export function resolvePitchesIn(
  ix: FieldIndex,
  pitches: readonly Note[],
  tol = MATCH_TOL
): PitchResolution {
  const match = pitches.map((p) => {
    if (p.m) {
      const hit = ix.byMonzo.get(monzoId(p.m));
      if (hit !== undefined) {
        return hit;
      }
    }
    return Number.isFinite(p.c) ? nearestByCents(ix, p.c, tol) : null;
  });
  const found: number[] = [];
  const missing: number[] = [];
  match.forEach((m, i) => (m === null ? missing : found).push(i));
  const indices = [...new Set(match.filter((m): m is number => m !== null))].sort((a, b) => a - b);
  return { match, indices, found, missing };
}

/**
 * Which field notes a pitch list lands on: a pitch with a monzo matches the field note with exactly that monzo; otherwise
 * (no monzo, or none such) the nearest note within `tol` cents (default 0.5). Works against any field.
 */
export function resolvePitches(
  field: readonly Note[],
  pitches: readonly Note[],
  tol = MATCH_TOL
): PitchResolution {
  return resolvePitchesIn(indexField(field), pitches, tol);
}

export interface ResolvedSubset extends PitchResolution {
  /** Selected field indices (ascending) and the mode (index into them; 0 when the root was not found). */
  sel: number[];
  mode: number;
  rootFound: boolean;
}

export function resolveSubset(
  field: readonly Note[],
  set: PitchSet,
  tol = MATCH_TOL
): ResolvedSubset {
  return resolveSubsetIn(indexField(field), set, tol);
}
export function resolveSubsetIn(ix: FieldIndex, set: PitchSet, tol = MATCH_TOL): ResolvedSubset {
  const r = resolvePitchesIn(ix, set.pitches, tol);
  const rootAt = set.root ? resolvePitchesIn(ix, [set.root], tol).match[0] : null;
  const at = rootAt === null ? -1 : r.indices.indexOf(rootAt);
  return { ...r, sel: r.indices, mode: at >= 0 ? at : 0, rootFound: at >= 0 };
}

/* ------------------------------------------------------------------------------------------ update report */
/** What happened to one subset that lost pitches (the data of a later "Show removed" view). */
export interface AffectedSubset {
  id: string;
  name: string;
  /** Pitches that matched, as the new field's notes (empty when the whole subset was removed: then the old ones). */
  kept: Note[];
  /** Pitches with no match. */
  lost: Note[];
  /** The subset's root before the change. */
  root: Note | null;
  /** True when no pitch matched and the subset was removed. */
  removed: boolean;
}

export interface UpdateReport {
  /** Subsets before the change. */
  subsetsTotal: number;
  /** Subsets that remain (every one re-resolved). */
  updatedSubsets: number;
  /** Subsets removed because no pitch matched: the count and which. */
  removedSubsets: number;
  removed: { id: string; name: string }[];
  /** Surviving subsets that lost at least one pitch ("the other subsets lost a.b pitches on average (most: m)"). */
  affectedSubsets: number;
  affectedAverageLost: number;
  mostLost: number;
  /** Over all subsets, removed ones included. */
  pitchesFound: number;
  pitchesTotal: number;
  /** Every subset that lost something, with what was kept and lost (removed ones flagged). */
  detail: AffectedSubset[];
}

/** A subset with an id and a label: the part of a stored subset this module needs. */
export interface NamedPitchSet extends PitchSet {
  id: string;
  name: string;
}

export interface UpdateResult<T extends NamedPitchSet> {
  /** The surviving subsets, pitches rewritten to the new field's notes, roots repaired. Same order, same ids. */
  subsets: T[];
  report: UpdateReport;
  /** The exact previous subsets (deep copy): restoring them undoes the change. */
  undo: T[];
}

const cloneSet = <T extends NamedPitchSet>(s: T): T => ({
  ...s,
  pitches: s.pitches.map(clonePitch),
  root: s.root ? clonePitch(s.root) : null,
});

/**
 * Re-resolve every subset against `field` (the edited generator's field): unmatched pitches are removed, subsets left
 * with no matching pitch are removed. Returns the new subsets, the report numbers and the undo data. The same function
 * serves Save-as-new with copied subsets and a later Import (give it the imported subsets).
 */
export function applyUpdate<T extends NamedPitchSet>(
  subsets: readonly T[],
  field: readonly Note[],
  tol = MATCH_TOL
): UpdateResult<T> {
  const ix = indexField(field);
  const out: T[] = [];
  const detail: AffectedSubset[] = [];
  const removed: { id: string; name: string }[] = [];
  let found = 0;
  let total = 0;
  let affected = 0;
  let lostSum = 0;
  let most = 0;
  for (const s of subsets) {
    const r = resolveSubsetIn(ix, s, tol);
    found += r.found.length;
    total += s.pitches.length;
    const lost = r.missing.map((i) => clonePitch(s.pitches[i]));
    if (r.indices.length === 0) {
      removed.push({ id: s.id, name: s.name });
      detail.push({
        id: s.id,
        name: s.name,
        kept: [],
        lost: s.pitches.map(clonePitch),
        root: s.root ? clonePitch(s.root) : null,
        removed: true,
      });
      continue;
    }
    const pitches = r.indices.map((i) => clonePitch(field[i]));
    out.push({ ...s, pitches, root: pitches[r.mode] ? clonePitch(pitches[r.mode]) : null });
    if (lost.length > 0) {
      affected++;
      lostSum += lost.length;
      most = Math.max(most, lost.length);
      detail.push({
        id: s.id,
        name: s.name,
        kept: pitches.map(clonePitch),
        lost,
        root: s.root ? clonePitch(s.root) : null,
        removed: false,
      });
    }
  }
  return {
    subsets: out,
    undo: subsets.map(cloneSet),
    report: {
      subsetsTotal: subsets.length,
      updatedSubsets: out.length,
      removedSubsets: removed.length,
      removed,
      affectedSubsets: affected,
      affectedAverageLost: affected ? lostSum / affected : 0,
      mostLost: most,
      pitchesFound: found,
      pitchesTotal: total,
      detail,
    },
  };
}

/** The Update notice sentence (no markup): "n subsets had no matching pitches and were removed. The other ...". */
export function reportSentence(name: string, r: UpdateReport): string {
  const parts = [`Updated '${name}'.`];
  if (r.removedSubsets > 0) {
    parts.push(
      `${r.removedSubsets} subset${r.removedSubsets === 1 ? '' : 's'} had no matching pitches and ${r.removedSubsets === 1 ? 'was' : 'were'} removed.`
    );
  }
  if (r.affectedSubsets > 0) {
    parts.push(
      `${r.removedSubsets > 0 ? 'The other subsets' : r.affectedSubsets === 1 ? 'One subset' : 'Subsets'} lost ${r.affectedAverageLost.toFixed(1)} pitches on average (most: ${r.mostLost}).`
    );
  }
  if (r.removedSubsets === 0 && r.affectedSubsets === 0) {
    parts.push('Every subset kept all its pitches.');
  }
  return parts.join(' ');
}

/* --------------------------------------------------------------------------------------------- folders */
export const MAX_FOLDER_DEPTH = 6;
export const MAX_FOLDER_SEGMENT = 40;

/** A folder path as written by the user into the stored form: trimmed segments joined by `/`, no empty segment. */
export function normalizeFolder(path: string): string {
  return path
    .split('/')
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_SEGMENT).trim())
    .filter((s) => s !== '' && s !== '.' && s !== '..')
    .slice(0, MAX_FOLDER_DEPTH)
    .join('/');
}
export const splitFolder = (path: string): string[] => {
  const p = normalizeFolder(path);
  return p ? p.split('/') : [];
};
export const joinFolder = (...parts: string[]): string => normalizeFolder(parts.join('/'));
/** "A/B" gives "A"; a top-level folder or "" gives "". */
export const parentFolder = (path: string): string => splitFolder(path).slice(0, -1).join('/');
/** The last segment ("A/B" gives "B"). */
export const folderName = (path: string): string => splitFolder(path).slice(-1)[0] ?? '';
/** True when `path` is `folder` itself or inside it. */
export function inFolder(path: string, folder: string): boolean {
  const p = splitFolder(path);
  const f = splitFolder(folder);
  return f.length <= p.length && f.every((s, i) => s === p[i]);
}
/** Every folder implied by the paths, ancestors included, unique, sorted by name (case-insensitive, parents first). */
export function listFolders(paths: readonly string[]): string[] {
  const all = new Set<string>();
  for (const p of paths) {
    const parts = splitFolder(p);
    for (let i = 1; i <= parts.length; i++) {
      all.add(parts.slice(0, i).join('/'));
    }
  }
  return [...all].sort(
    (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : 1)
  );
}
/** The direct sub-folders of `folder` ("" = top level) among the paths. */
export const childFolders = (paths: readonly string[], folder: string): string[] =>
  listFolders(paths).filter((f) => parentFolder(f) === normalizeFolder(folder));
