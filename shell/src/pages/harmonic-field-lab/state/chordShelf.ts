/**
 * The chord shelf (M8a): stashed chords with the exact pitches heard and where they came from, plus the sketch row's
 * state (template, root degree, armed chord). Pure: no React, no storage (shelfStore.ts stores it as
 * `hrifa.harmonic-field-lab.chordshelf.v1`). Actions that need the tabs or the library (`shelf/stash`, `shelf/reload`)
 * are handled in labState.ts, which calls the helpers here.
 *
 * PITCH FRAME RULE (human decision): a chord's stored `pitches` are FIELD-ABSOLUTE, the field's own pitches above 1/1, identical
 * whether it was stashed in Parallel or Relative. Relative playback plays them as stored; Parallel playback divides them by the
 * source subset's mode root (`source.subset.root`), see `chordPitchesFor`. Example: mode root 3/2, stored 3/2, 15/8, 9/4 -> Relative
 * plays those, Parallel plays 1/1, 5/4, 3/2. `frame` records the switch at stash time only; it never changes the stored pitches.
 *
 * A stashed chord is plain, self-contained data (a later Workbench hand-off can read it): `pitches` are monzo + cents
 * (H-1), `source` is the generator inputs, the subset as pitches and its tab name (null when the stored source was
 * unusable: the chord still plays, it just cannot be reloaded), the rest is scalar provenance.
 */
import {
  mulNotes,
  samePitch,
  type Monzo,
  type Note,
  type PitchSet,
} from '../../../lib/harmonic-field';
import type { GenSpec } from './generate';
import { cleanName } from './generatorLibrary';

/** In-memory caps, equal to the load caps in shelfStore (what a session accepts, a reload keeps). */
export const MAX_CHORDS = 2000;
export const MAX_CHORD_PITCHES = 64;
export const MAX_SOURCE_PITCHES = 4096;
export const MAX_TEMPLATE_CHARS = 80;

function isPrime(n: number): boolean {
  if (!Number.isSafeInteger(n) || n < 2) {
    return false;
  }
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) {
      return false;
    }
  }
  return true;
}

/** One stored or stashed pitch made plain: finite cents, a monzo only when it is plain (else cents only). Null when unusable. */
export function sanitizePitch(raw: unknown): Note | null {
  const r = raw as { m?: unknown; c?: unknown } | null;
  if (
    typeof r !== 'object' ||
    r === null ||
    Array.isArray(r) ||
    typeof r.c !== 'number' ||
    !Number.isFinite(r.c) ||
    Math.abs(r.c) > 1e7
  ) {
    return null;
  }
  let m: Monzo | null = null;
  if (typeof r.m === 'object' && r.m !== null && !Array.isArray(r.m)) {
    const mm = r.m as Record<string, unknown>;
    const keys = Object.keys(mm);
    const ok =
      keys.length <= 64 &&
      keys.every((k) => /^\d+$/.test(k) && isPrime(Number(k))) &&
      keys.every((k) => {
        const v = mm[k];
        return typeof v === 'number' && Number.isInteger(v) && v !== 0 && Math.abs(v) <= 10000;
      });
    m = ok ? { ...(r.m as Monzo) } : null;
  }
  return { m, c: r.c };
}

/**
 * A source made plain, as load does it: unusable pitches dropped, capped, a root that is not one of the pitches repaired
 * to none; null when no pitch is left (nothing to reload). Used for both a stash and a stored entry.
 */
export function normalizeSource(src: ShelfSource): ShelfSource | null {
  const pitches = src.subset.pitches
    .slice(0, MAX_SOURCE_PITCHES)
    .map(sanitizePitch)
    .filter((p): p is Note => p !== null);
  if (!pitches.length) {
    return null;
  }
  const rootRaw = src.subset.root ? sanitizePitch(src.subset.root) : null;
  const root = rootRaw && pitches.some((p) => samePitch(p, rootRaw)) ? rootRaw : null;
  return { gen: src.gen, subset: { pitches, root }, tab: src.tab };
}

export type Frame = 'parallel' | 'relative';

export interface ShelfSource {
  gen: GenSpec;
  /** The tab's subset as pitches, with its mode root as a pitch. */
  subset: PitchSet;
  /** The name of the tab the chord was stashed from. */
  tab: string;
}

export interface ShelfChord {
  id: string;
  name: string;
  /** The exact pitches heard, in the order played (root first), as monzo + cents above 1/1. */
  pitches: Note[];
  /** The template text the chord was made from (null for a free selection). */
  template: string | null;
  /** The root's degree in the source subset read from its mode root (0 = the mode root); null when unknown. */
  rootDeg: number | null;
  /** The chord finder's tolerance in cents when stashed. */
  tol: number;
  /** ISO date-time of the stash. */
  date: string;
  /** The reference frame when stashed: 1/1 in Hz and Parallel | Relative. */
  refHz: number;
  frame: Frame;
  /** The shelf chord this one was made from (its reloaded source tab), or null. Ids are never reused. */
  parent: string | null;
  source: ShelfSource | null;
}

export interface Sketch {
  /** The sketch row's template text; null until one is picked or armed. */
  template: string | null;
  /** The sketch row's root degree: 0 to N-1 in the active subset read from its mode root. */
  rootDeg: number;
  /** True when the template was armed from a chord chip (or a shelf chord), not typed by hand. */
  armed: boolean;
}

export interface ShelfState {
  chords: ShelfChord[];
  /** Id counter (`c<N>`, never reused while the shelf lives). */
  next: number;
  /** Selected slot ids, in the order selected (runtime only). */
  selected: string[];
  sketch: Sketch;
  /** The slot the last stash made (runtime only). */
  lastStashed: string | null;
  /** The last reload: how many of the source subset's pitches the rebuilt field had (runtime only). */
  lastReload: { id: string; found: number; missing: number } | null;
  /** Set when an action was refused (a cap, an unbuildable source); cleared by the next shelf action. */
  refusal: { reason: string } | null;
}

export const emptySketch = (): Sketch => ({ template: null, rootDeg: 0, armed: false });

export const emptyShelf = (): ShelfState => ({
  chords: [],
  next: 1,
  selected: [],
  sketch: emptySketch(),
  lastStashed: null,
  lastReload: null,
  refusal: null,
});

/** The pieces a stash adds (the id and the default name are made here). */
export interface StashInput {
  name?: string;
  pitches: Note[];
  template: string | null;
  rootDeg: number | null;
  tol: number;
  date: string;
  refHz: number;
  frame: Frame;
  parent: string | null;
  source: ShelfSource | null;
}

const clonePitch = (p: Note): Note => ({ m: p.m ? { ...p.m } : null, c: p.c });

export const cloneSource = (s: ShelfSource): ShelfSource => ({
  gen: { ...s.gen, axes: s.gen.axes.map((a) => ({ ...a })), mask: s.gen.mask.slice() },
  subset: {
    pitches: s.subset.pitches.map(clonePitch),
    root: s.subset.root ? clonePitch(s.subset.root) : null,
  },
  tab: s.tab,
});

/**
 * The pitches to play for a frame: Relative = as stored (field-absolute); Parallel = each divided by the source's mode root, so
 * the chord starts from the 1/1 the way a mode preview does. A chord with no source or no root is played as stored.
 */
export function chordPitchesFor(chord: ShelfChord, frame: Frame): Note[] {
  const root = chord.source?.subset.root;
  return chord.pitches.map((p) =>
    frame === 'parallel' && root ? mulNotes(p, root, -1) : { m: p.m ? { ...p.m } : null, c: p.c }
  );
}

/** The next free "Chord N" label. */
export function autoChordName(chords: readonly ShelfChord[]): string {
  const names = new Set(chords.map((c) => c.name));
  let n = chords.length + 1;
  while (names.has(`Chord ${n}`)) {
    n++;
  }
  return `Chord ${n}`;
}

/** `shelf.next` raised past every id in use (the counter never reuses an id). */
export function nextChordId(chords: readonly ShelfChord[], want = 1): number {
  let n = Math.max(1, want);
  for (const c of chords) {
    const k = /^c(\d+)$/.exec(c.id);
    if (k && Number(k[1]) >= n) {
      n = Number(k[1]) + 1;
    }
  }
  return n;
}

const refuse = (s: ShelfState, reason: string): ShelfState => ({ ...s, refusal: { reason } });

/** Add a chord at the end of the shelf; refused (state + reason) at the caps. */
export function stashChord(s: ShelfState, input: StashInput): ShelfState {
  if (!input.pitches.length) {
    return refuse(s, 'A chord needs at least one note.');
  }
  if (input.pitches.length > MAX_CHORD_PITCHES) {
    return refuse(s, `A chord holds at most ${MAX_CHORD_PITCHES} notes.`);
  }
  if (s.chords.length >= MAX_CHORDS) {
    return refuse(s, `The shelf is full (${MAX_CHORDS} chords).`);
  }
  if (input.source && input.source.subset.pitches.length > MAX_SOURCE_PITCHES) {
    return refuse(s, `A source subset holds at most ${MAX_SOURCE_PITCHES} pitches.`);
  }
  // the same sanitising as load, so what a session holds is what a reload gives back
  const pitches = input.pitches.map(sanitizePitch);
  if (pitches.some((p) => p === null)) {
    return refuse(s, 'A chord note is not a usable pitch.');
  }
  const src = input.source ? normalizeSource(cloneSource(input.source)) : null;
  const template =
    input.template !== null && input.template.length <= MAX_TEMPLATE_CHARS ? input.template : null;
  const id = `c${s.next}`;
  const chord: ShelfChord = {
    id,
    name: (input.name && cleanName(input.name)) || autoChordName(s.chords),
    pitches: pitches as Note[],
    template,
    rootDeg: input.rootDeg,
    tol: input.tol,
    date: input.date,
    refHz: input.refHz,
    frame: input.frame,
    parent: input.parent,
    source: src,
  };
  return { ...s, chords: [...s.chords, chord], next: s.next + 1, lastStashed: id, refusal: null };
}

export type ShelfAction =
  | { type: 'shelf/rename'; id: string; name: string }
  | { type: 'shelf/move'; id: string; to: number }
  | { type: 'shelf/delete'; id: string }
  /** Plain: select only this slot (the only selected one again clears). Additive: toggle it in the selection. */
  | { type: 'shelf/select'; id: string; additive?: boolean }
  | { type: 'shelf/selectAll' }
  | { type: 'shelf/selectNone' }
  /** Another window saved the shelf: take its chords (selection and sketch are kept where they still apply). */
  | { type: 'shelf/sync'; shelf: ShelfState }
  | { type: 'sketch/set'; patch: Partial<Pick<Sketch, 'template' | 'rootDeg'>> }
  /** Arm a template from a chord chip or a shelf chord; the root degree is left as it is unless given. */
  | { type: 'sketch/arm'; template: string; rootDeg?: number }
  | { type: 'sketch/disarm' };

/** Actions of the pure slice (stash and reload need the tabs and library and are in labState.ts). */
export function shelfReduce(s: ShelfState, a: ShelfAction): ShelfState {
  switch (a.type) {
    case 'shelf/rename': {
      const name = cleanName(a.name);
      if (!name || !s.chords.some((c) => c.id === a.id && c.name !== name)) {
        return s;
      }
      return {
        ...s,
        chords: s.chords.map((c) => (c.id === a.id ? { ...c, name } : c)),
        refusal: null,
      };
    }
    case 'shelf/move': {
      const from = s.chords.findIndex((c) => c.id === a.id);
      if (from < 0 || !Number.isInteger(a.to)) {
        return s;
      }
      const to = Math.min(Math.max(a.to, 0), s.chords.length - 1);
      if (to === from) {
        return s;
      }
      const chords = s.chords.slice();
      const [c] = chords.splice(from, 1);
      chords.splice(to, 0, c);
      return { ...s, chords, refusal: null };
    }
    case 'shelf/delete': {
      if (!s.chords.some((c) => c.id === a.id)) {
        return s;
      }
      // lineage keeps pointing at the deleted id (ids are never reused); the UI shows an unknown parent as gone
      return {
        ...s,
        chords: s.chords.filter((c) => c.id !== a.id),
        selected: s.selected.filter((x) => x !== a.id),
        lastStashed: s.lastStashed === a.id ? null : s.lastStashed,
        lastReload: s.lastReload?.id === a.id ? null : s.lastReload,
        refusal: null,
      };
    }
    case 'shelf/select': {
      if (!s.chords.some((c) => c.id === a.id)) {
        return s;
      }
      const on = s.selected.includes(a.id);
      const selected = a.additive
        ? on
          ? s.selected.filter((x) => x !== a.id)
          : [...s.selected, a.id]
        : on && s.selected.length === 1
          ? []
          : [a.id];
      return { ...s, selected };
    }
    case 'shelf/selectAll':
      return s.selected.length === s.chords.length &&
        s.chords.every((c, i) => s.selected[i] === c.id)
        ? s
        : { ...s, selected: s.chords.map((c) => c.id) };
    case 'shelf/selectNone':
      return s.selected.length ? { ...s, selected: [] } : s;
    case 'shelf/sync': {
      const have = new Set(a.shelf.chords.map((c) => c.id));
      return {
        ...s,
        chords: a.shelf.chords,
        next: Math.max(s.next, a.shelf.next),
        selected: s.selected.filter((x) => have.has(x)),
        lastStashed: s.lastStashed && have.has(s.lastStashed) ? s.lastStashed : null,
        lastReload: s.lastReload && have.has(s.lastReload.id) ? s.lastReload : null,
        refusal: null,
      };
    }
    case 'sketch/set': {
      const sk = s.sketch;
      const template = a.patch.template === undefined ? sk.template : a.patch.template;
      const rootDeg =
        a.patch.rootDeg === undefined
          ? sk.rootDeg
          : Number.isInteger(a.patch.rootDeg) && a.patch.rootDeg >= 0
            ? a.patch.rootDeg
            : sk.rootDeg;
      // choosing a template by hand is no longer "armed from a chip"
      const armed =
        a.patch.template !== undefined && a.patch.template !== sk.template ? false : sk.armed;
      return template === sk.template && rootDeg === sk.rootDeg && armed === sk.armed
        ? s
        : { ...s, sketch: { template, rootDeg, armed } };
    }
    case 'sketch/arm': {
      const rootDeg =
        a.rootDeg !== undefined && Number.isInteger(a.rootDeg) && a.rootDeg >= 0
          ? a.rootDeg
          : s.sketch.rootDeg;
      const sk = s.sketch;
      return sk.template === a.template && sk.rootDeg === rootDeg && sk.armed
        ? s
        : { ...s, sketch: { template: a.template, rootDeg, armed: true } };
    }
    case 'sketch/disarm':
      return s.sketch.armed ? { ...s, sketch: { ...s.sketch, armed: false } } : s;
  }
}
