/**
 * Storage of the chord shelf: `hrifa.harmonic-field-lab.chordshelf.v1`.
 *
 * ```
 * { version: 1,
 *   chords: [{ id: 'c1', name, pitches: [{ m, c }],              // the exact pitches heard (monzo + cents, as H-6)
 *              template: '4:5:6' | null, rootDeg: 0 | null, pattern?: '2-2',   // pattern: M9 positional chord, absent = none
 *              tol: 18, date: ISO, refHz: 261.6256,
 *              frame: 'parallel' | 'relative', parent: 'c0' | null,
 *              source: { gen: <generation inputs>, tab: 'name',
 *                        subset: { pitches: [{ m, c }], root: { m, c } | null } } | null }],
 *   next: 2 }
 * ```
 * `gen` is the generation part of the tab snapshot (as in `generators.v1`). Plain JSON, self-contained. Selection, the
 * sketch row and the last stash / reload are runtime only and never stored.
 *
 * Rules: entry by entry; no write on mount (the caller compares identity); bad data falls back to an empty shelf. A chord
 * whose pitches are damaged (not 1 to 64 usable pitches) is dropped, because playing a different chord would be worse than
 * none; an unusable `source` only loses the source (the chord still plays, it cannot be reloaded); every other well-formed
 * entry is kept and written back, so a later save never drops it. Unknown extra fields are not kept.
 */
import { type Note } from '../../../lib/harmonic-field';
import {
  MAX_CHORDS,
  MAX_CHORD_PITCHES,
  MAX_TEMPLATE_CHARS,
  cleanTail,
  normalizeSource,
  sanitizePitch,
  emptyShelf,
  nextChordId,
  type Frame,
  type ShelfChord,
  type ShelfSource,
  type ShelfState,
} from './chordShelf';
import { cleanName } from './generatorLibrary';
import { genFromStored, genToStored } from './libraryStore';
import { canonicalPattern } from './patterns';
import { KEY_CHORDSHELF, readJson, writeJson } from './persist';

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const pitchOut = (p: Note) => ({ m: p.m ? { ...p.m } : null, c: p.c });

function sanitizeSource(raw: unknown): ShelfSource | null {
  if (!isObj(raw)) {
    return null;
  }
  const gen = genFromStored(raw.gen);
  const sub = isObj(raw.subset) ? raw.subset : null;
  if (!gen || !sub || !Array.isArray(sub.pitches)) {
    return null;
  }
  const tab = typeof raw.tab === 'string' ? cleanName(raw.tab) : '';
  const pitches = sub.pitches.map(sanitizePitch).filter((p): p is Note => p !== null);
  const root = sanitizePitch(sub.root);
  // the same normalising as a stash: capped, root repaired, null when no pitch is left
  return normalizeSource({ gen, subset: { pitches, root }, tab });
}

/**
 * Coerce a stored value into a shelf. Null when it is not a shelf at all (not an object with a `chords` list): the caller
 * then uses an empty shelf.
 */
export function sanitizeShelf(raw: unknown): ShelfState | null {
  if (!isObj(raw) || !Array.isArray(raw.chords)) {
    return null;
  }
  const chords: ShelfChord[] = [];
  const storedIds: unknown[] = [];
  for (const e of raw.chords) {
    if (!isObj(e) || chords.length >= MAX_CHORDS) {
      continue;
    }
    if (!Array.isArray(e.pitches) || e.pitches.length < 1 || e.pitches.length > MAX_CHORD_PITCHES) {
      continue;
    }
    const pitches = e.pitches.map(sanitizePitch);
    if (pitches.some((p) => p === null)) {
      continue;
    }
    const num = (v: unknown, d: number, lo: number, hi: number) =>
      typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : d;
    storedIds.push(e.id);
    chords.push({
      id: '',
      name: (typeof e.name === 'string' && cleanName(e.name)) || `Chord ${chords.length + 1}`,
      pitches: pitches as Note[],
      template:
        typeof e.template === 'string' && e.template.length <= MAX_TEMPLATE_CHARS
          ? e.template
          : null,
      rootDeg:
        typeof e.rootDeg === 'number' &&
        Number.isInteger(e.rootDeg) &&
        e.rootDeg >= 0 &&
        e.rootDeg < 1e6
          ? e.rootDeg
          : null,
      pattern: typeof e.pattern === 'string' ? canonicalPattern(e.pattern) : null,
      tail: cleanTail(e.tail),
      tol: num(e.tol, 18, 0, 1200),
      date: typeof e.date === 'string' ? e.date.slice(0, 40) : '',
      refHz: num(e.refHz, 261.6256, 1, 1e5),
      frame: (e.frame === 'relative' ? 'relative' : 'parallel') satisfies Frame,
      parent: typeof e.parent === 'string' && /^c\d{1,9}$/.test(e.parent) ? e.parent : null,
      source: sanitizeSource(e.source),
    });
  }
  // ids: a well-formed, first-seen stored id is kept; every other entry gets a fresh id past all ids in use and past the
  // stored counter (no collision with a later entry's id, no reuse)
  const seen = new Set<string>();
  const valid = chords.map((_c, i) => {
    const id = storedIds[i];
    if (typeof id === 'string' && /^c\d{1,9}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    return '';
  });
  const want =
    typeof raw.next === 'number' && Number.isInteger(raw.next) && raw.next < 1e9 ? raw.next : 1;
  let n = nextChordId(
    valid.filter(Boolean).map((id) => ({ id }) as ShelfChord),
    want
  );
  const out = chords.map((c, i) => ({ ...c, id: valid[i] || `c${n++}` }));
  return { ...emptyShelf(), chords: out, next: nextChordId(out, n) };
}

export function shelfToStored(s: ShelfState): Record<string, unknown> {
  return {
    version: 1,
    chords: s.chords.map((c) => ({
      id: c.id,
      name: c.name,
      pitches: c.pitches.map(pitchOut),
      template: c.template,
      rootDeg: c.rootDeg,
      // additive (M9): written only when set, so a shelf without positional chords is stored byte for byte as before
      ...(c.pattern ? { pattern: c.pattern } : {}),
      ...(c.tail ? { tail: c.tail } : {}),
      tol: c.tol,
      date: c.date,
      refHz: c.refHz,
      frame: c.frame,
      parent: c.parent,
      source: c.source
        ? {
            gen: genToStored(c.source.gen),
            tab: c.source.tab,
            subset: {
              pitches: c.source.subset.pitches.map(pitchOut),
              root: c.source.subset.root ? pitchOut(c.source.subset.root) : null,
            },
          }
        : null,
    })),
    next: s.next,
  };
}

/** The shelf for this page load: stored, else empty (nothing is written). */
export function loadShelf(): ShelfState {
  return sanitizeShelf(readJson(KEY_CHORDSHELF)) ?? emptyShelf();
}

/** Store the shelf; false when storage is unavailable or full. */
export function saveShelf(s: ShelfState): boolean {
  return writeJson(KEY_CHORDSHELF, shelfToStored(s));
}
