/**
 * The chord library (M7 of the harmonic-field-lab arc). Pure.
 *
 * The data is `chordLibraryData.ts`, generated from Scala's `chordnam.par` (colon-ratio entries only, 399 lines). This
 * module merges, groups, filters and adds them; see README.md ("Chord library").
 *
 * How the counts read (the header of the dialog), in a 2/1 repeat: the file has 399 lines (`lines`). Lines with the same
 * root and the same notes once folded into the repeat (`1:3:5:15` and `8:10:12:15`) are ONE entry with the names joined
 * (`templateKey`, the finder's own duplicate rule, so the root of an undertone line is its lowest pitch: `1/(3:4:5:7)`,
 * `1/(4:5:6:7)` and `60:70:84:105` are one entry). That leaves 360 rooted entries plus the 16 that fold (two notes on
 * the same pitch, like `1:2:3`): 376 entries in all (`entries`). Ignoring which note is the root, the 360 rooted
 * entries make 297 shapes (`rooted`); each of the 16 folding entries is its own shape, so there are 313 shapes in all
 * (`shapes`). The scenario sentence "399 entries, 297 shapes" counts lines and rooted shapes: `librarySummary` returns
 * every figure and the dialog chooses the words.
 */
import { CHORD_LIBRARY_DATA, type RawChordEntry } from './chordLibraryData';
import { parseTemplate, templateFolds, templateKey, type ChordTemplate } from './chords';

export const CHORD_LIBRARY_CREDIT = 'Chord list by Manuel Op de Coul, from Scala (chordnam.par)';

/** The family of an entry that matches no rule (the same word the build script writes). */
export const LIBRARY_FAMILY = 'Library';

/** Why a folding entry cannot be added or checked. */
export const FOLD_REASON =
  'Two notes land on the same pitch in this repeat, so it cannot be found.';

/** The most templates the chord finder keeps (the lab's `MAX_TEMPLATES`). */
export const TEMPLATE_LIMIT = 64;

/** A stored template name is cut to this many characters (`sanitizeTemplates`); an added name is shortened to fit. */
export const TEMPLATE_NAME_MAX = 60;

export interface LibraryEntry {
  /** The lab's template text, from the first line listed (`4:5:6`, or `1/(1:2:3)` for an undertone line). */
  text: string;
  /** Every name the file gives these notes (same root, same notes in the repeat), the first listed first. */
  names: string[];
  /** The family of the first line listed (see the build script for the rules). */
  family: string;
  /** Number of notes, the root included. */
  notes: number;
  /** The largest odd part of the numbers in lowest terms (an undertone line uses the numbers of its colon form). */
  oddLimit: number;
  /** The largest prime among those numbers. */
  primeLimit: number;
  /** `templateKey` in the repeat (a folding entry: `fold:` and the text). */
  key: string;
  /** Two notes land on the same pitch in this repeat: the finder can never find it. */
  folds: boolean;
  /** How many lines of the file this entry stands for (1, or more when lines were merged). */
  lines: number;
}

export interface LibraryShape {
  /** The rotation-invariant key (a folding entry: `fold:` and its text). */
  id: string;
  /** Root position first, then the other roots in the order of the inversions (1st, 2nd, ...). */
  entries: LibraryEntry[];
}

/* ---------------------------------------------------------------------------------------------------- numbers */
function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** The numbers of a template text: `4:5:6` gives 4, 5, 6 and `1/(4:5:6)` too. Null when it is not a template. */
function numbersOf(text: string): number[] | null {
  const pt = parseTemplate(text);
  if (!pt.ok) {
    return null;
  }
  const body = pt.utonal ? pt.text.slice(3, -1) : pt.text;
  return body.split(':').map(Number);
}

function largestPrime(n: number): number {
  let m = n;
  let big = 1;
  for (let p = 2; p * p <= m; p++) {
    while (m % p === 0) {
      big = p;
      m /= p;
    }
  }
  return m > 1 ? m : big;
}

/**
 * Note count, odd limit and prime limit of a template text, from its numbers in lowest terms (an undertone text such as
 * `1/(1:2:3:4)` uses the numbers of its colon form: odd limit 3, prime limit 3). Null when the text does not parse.
 */
export function entryInfo(
  text: string
): { notes: number; oddLimit: number; primeLimit: number } | null {
  const nums = numbersOf(text);
  if (!nums) {
    return null;
  }
  const g = nums.reduce(gcd);
  const ints = nums.map((x) => x / g);
  let odd = 1;
  let prime = 1;
  for (const x of ints) {
    let o = x;
    while (o % 2 === 0) {
      o /= 2;
    }
    odd = Math.max(odd, o);
    prime = Math.max(prime, largestPrime(x));
  }
  return { notes: ints.length, oddLimit: odd, primeLimit: prime };
}

/* ---------------------------------------------------------------------------------------------------- entries */
const cache = new Map<number, LibraryEntry[]>();

/**
 * The library for one repeat: every line of the data in file order, lines with the same `templateKey` merged (names
 * joined, the text and family of the first listed), a folding line kept as its own entry with `folds` set.
 */
export function libraryEntries(
  repC: number,
  data: readonly RawChordEntry[] = CHORD_LIBRARY_DATA
): LibraryEntry[] {
  const useCache = data === CHORD_LIBRARY_DATA;
  const hit = useCache ? cache.get(repC) : undefined;
  if (hit) {
    return hit;
  }
  const out: LibraryEntry[] = [];
  const byKey = new Map<string, LibraryEntry>();
  for (const raw of data) {
    const pt = parseTemplate(raw.text);
    const info = entryInfo(raw.text);
    if (!pt.ok || !info) {
      continue;
    }
    const folds = templateFolds(pt, repC);
    const key = folds ? `fold:${raw.text}` : templateKey(pt, repC);
    const same = byKey.get(key);
    if (same) {
      same.lines++;
      if (!same.names.includes(raw.name)) {
        same.names.push(raw.name);
      }
      continue;
    }
    const entry: LibraryEntry = {
      text: raw.text,
      names: [raw.name],
      family: raw.family,
      ...info,
      key,
      folds,
      lines: 1,
    };
    byKey.set(key, entry);
    out.push(entry);
  }
  if (useCache) {
    cache.set(repC, out);
  }
  return out;
}

/* ---------------------------------------------------------------------------------------------------- shapes */
const round4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** The entry's notes in cents above its root, reduced into the repeat, sorted, rounded to 4 decimals. */
function rootedCents(text: string, repC: number): number[] {
  const pt = parseTemplate(text);
  if (!pt.ok) {
    return [];
  }
  return pt.cents.map((c) => round4(((c % repC) + repC) % repC)).sort((a, b) => a - b);
}

/** The same notes read from note `j` as the root (rounded, sorted). */
function rotated(c: number[], j: number, repC: number): number[] {
  return c.map((v) => round4((((v - c[j]) % repC) + repC) % repC)).sort((a, b) => a - b);
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i];
    }
  }
  return false;
}

/** Rotation-invariant key: the smallest of the key read from each note as the root. */
function shapeKey(text: string, repC: number): string {
  const c = rootedCents(text, repC);
  let best: number[] | null = null;
  for (let j = 0; j < c.length; j++) {
    const k = rotated(c, j, repC);
    if (best === null || lexLess(k, best)) {
      best = k;
    }
  }
  return (best ?? []).join(',');
}

/** The largest number of an entry in lowest terms (the "size" of its numbers). */
function span(e: LibraryEntry): number {
  const nums = numbersOf(e.text) ?? [0];
  const g = nums.reduce(gcd);
  return Math.max(...nums) / g;
}

const INVERSION = /inversion/i;

/**
 * Groups the usable entries into shapes (the same notes whichever is the root) and gives each folding entry a shape of
 * its own, all in the order of first appearance. In a shape the root position comes first: an entry none of whose names
 * says "inversion" before one that does, then the smaller numbers, then the text. The others follow in the order of the
 * inversions (the root moved to the 2nd, 3rd, ... note of the root position).
 */
export function libraryShapes(entries: readonly LibraryEntry[], repC: number): LibraryShape[] {
  const order: (LibraryShape | string)[] = [];
  const groups = new Map<string, LibraryEntry[]>();
  for (const e of entries) {
    if (e.folds) {
      order.push({ id: `fold:${e.text}`, entries: [e] });
      continue;
    }
    const id = shapeKey(e.text, repC);
    const g = groups.get(id);
    if (g) {
      g.push(e);
    } else {
      groups.set(id, [e]);
      order.push(id);
    }
  }
  return order.map((item) => {
    if (typeof item !== 'string') {
      return item;
    }
    const g = groups.get(item) as LibraryEntry[];
    const rank = (e: LibraryEntry): [number, number, string] => [
      e.names.some((n) => INVERSION.test(n)) ? 1 : 0,
      span(e),
      e.text,
    ];
    const head = g.slice().sort((a, b) => {
      const x = rank(a);
      const y = rank(b);
      return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
    })[0];
    const h = rootedCents(head.text, repC);
    const turn = (e: LibraryEntry): number => {
      const c = rootedCents(e.text, repC);
      let best = Infinity;
      let at = h.length;
      for (let j = 0; j < h.length; j++) {
        const r = rotated(h, j, repC);
        const d = r.reduce((s, v, i) => s + Math.abs(v - c[i]), 0);
        if (d < best) {
          best = d;
          at = j;
        }
      }
      return at;
    };
    const rest = g
      .filter((e) => e !== head)
      .map((e) => ({ e, t: turn(e) }))
      .sort((a, b) => a.t - b.t || (a.e.text < b.e.text ? -1 : a.e.text > b.e.text ? 1 : 0))
      .map((x) => x.e);
    return { id: item, entries: [head, ...rest] };
  });
}

/* ---------------------------------------------------------------------------------------------------- filter */
export interface LibraryFilter {
  /** Matches a name or the ratio text, ignoring case; empty matches all. */
  search?: string;
  notesMin?: number | null;
  notesMax?: number | null;
  oddMax?: number | null;
  primeMax?: number | null;
  /** A family name (exact); null or empty: all. */
  family?: string | null;
}

export type FlaggedEntry = LibraryEntry & { match: boolean };

export interface FilteredShape {
  id: string;
  /** Every entry of the shape; `match` marks the ones that pass the search and the filters. */
  entries: FlaggedEntry[];
}

export function entryMatches(e: LibraryEntry, f: LibraryFilter): boolean {
  const q = (f.search ?? '').trim().toLowerCase();
  if (q && !e.text.toLowerCase().includes(q) && !e.names.some((n) => n.toLowerCase().includes(q))) {
    return false;
  }
  if (typeof f.notesMin === 'number' && e.notes < f.notesMin) {
    return false;
  }
  if (typeof f.notesMax === 'number' && e.notes > f.notesMax) {
    return false;
  }
  if (typeof f.oddMax === 'number' && e.oddLimit > f.oddMax) {
    return false;
  }
  if (typeof f.primeMax === 'number' && e.primeLimit > f.primeMax) {
    return false;
  }
  return !f.family || e.family === f.family;
}

/** The shapes with at least one matching entry; every entry of a kept shape stays, the matching ones flagged. */
export function filterLibrary(shapes: readonly LibraryShape[], f: LibraryFilter): FilteredShape[] {
  const out: FilteredShape[] = [];
  for (const s of shapes) {
    const entries = s.entries.map((e) => ({ ...e, match: entryMatches(e, f) }));
    if (entries.some((e) => e.match)) {
      out.push({ id: s.id, entries });
    }
  }
  return out;
}

export interface LibrarySummary {
  /** Entries (rows), a merged entry counted once. */
  entries: number;
  /** Lines of the file behind them (every name counted): 399. */
  lines: number;
  /** Shapes, a folding entry being a shape of its own. */
  shapes: number;
  /** Shapes that have at least one usable entry. */
  rooted: number;
  /** Entries that fold in this repeat. */
  folding: number;
}

/** The figures of the dialog header (see the top of this file for how each is counted). */
export function librarySummary(shapes: readonly LibraryShape[]): LibrarySummary {
  let entries = 0;
  let lines = 0;
  let rooted = 0;
  let folding = 0;
  for (const s of shapes) {
    entries += s.entries.length;
    if (s.entries.some((e) => !e.folds)) {
      rooted++;
    }
    for (const e of s.entries) {
      lines += e.lines;
      if (e.folds) {
        folding++;
      }
    }
  }
  return { entries, lines, shapes: shapes.length, rooted, folding };
}

/* ---------------------------------------------------------------------------------------------------- adding */
/** The names joined with " / " and kept within `TEMPLATE_NAME_MAX`: whole names, as many as fit (the first is cut with an ellipsis if it alone is too long). */
export function joinNames(names: readonly string[], max = TEMPLATE_NAME_MAX): string {
  let out = '';
  for (const n of names) {
    const next = out ? `${out} / ${n}` : n;
    if (next.length > max) {
      return out || `${n.slice(0, max - 1)}…`;
    }
    out = next;
  }
  return out;
}

export interface AddLibraryResult {
  /** The list after the add (the same array when refused). */
  templates: ChordTemplate[];
  /** The templates appended, in order (empty when refused). */
  added: ChordTemplate[];
  /** The sentence for the person when nothing was added. */
  refused?: string;
}

/**
 * Adds library entries to the finder's templates, all or nothing. Refused (first reason found, checked in this order for
 * each entry, then the cap): an entry that folds in this repeat (`FOLD_REASON`); an entry with the same `templateKey` as a
 * template already in the list or as an earlier entry of this add ("Same notes as 4:5:6 already in your templates.", with
 * that template's own text); more entries than free places ("Needs 3 free places; you have 1."). A new template is
 * `{ text, name: joinNames(names), family }`. The fold and key are recomputed here for `repC`, so an entry built for
 * another repeat is judged correctly.
 */
export function addLibraryEntries(
  templates: readonly ChordTemplate[],
  entries: readonly LibraryEntry[],
  repC: number,
  max: number = TEMPLATE_LIMIT
): AddLibraryResult {
  const refuse = (refused: string): AddLibraryResult => ({
    templates: templates as ChordTemplate[],
    added: [],
    refused,
  });
  const known = new Map<string, string>();
  for (const t of templates) {
    const pt = parseTemplate(t.text);
    if (pt.ok) {
      const k = templateKey(pt, repC);
      if (!known.has(k)) {
        known.set(k, t.text.trim());
      }
    }
  }
  const added: ChordTemplate[] = [];
  for (const e of entries) {
    const pt = parseTemplate(e.text);
    if (!pt.ok || templateFolds(pt, repC)) {
      return refuse(FOLD_REASON);
    }
    const k = templateKey(pt, repC);
    const dup = known.get(k);
    if (dup !== undefined) {
      return refuse(`Same notes as ${dup} already in your templates.`);
    }
    known.set(k, e.text);
    added.push({ text: e.text, name: joinNames(e.names), family: e.family });
  }
  const free = Math.max(0, max - templates.length);
  if (added.length > free) {
    return refuse(
      `Needs ${added.length} free ${added.length === 1 ? 'place' : 'places'}; you have ${free}.`
    );
  }
  return { templates: [...templates, ...added], added };
}
