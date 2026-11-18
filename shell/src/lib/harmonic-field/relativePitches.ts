/**
 * Relative pitches (M8a of the Scala-tools arc, H-33): the pure logic of the "Relative pitches" generator. The field is the
 * notes the user placed; a note is placed by picking a ratio from another note (above or below it), by dialing a monzo, or by
 * typing a ratio or cents. Everything folds into the repeat. No React, no storage.
 *
 * A note is stored as pitch text: the reduced ratio `p/q`, or cents as `700 c` (see `parsePitchText`).
 */
import { parsePitchText } from './addedPitches';
import {
  EPS,
  centsNote,
  fmtRatio,
  mkNote,
  mulNotes,
  parseInterval,
  ratioNote,
  reduceInto,
} from './intervals';
import type { Monzo, Note } from './types';

/* ------------------------------------------------------------------------------------------------ rings */
/** The radial menu always has four rings. */
export const RELATIVE_RING_COUNT = 4;
/** The default odd-limit step between rings (Developer option `relativeRingStep`). */
export const RELATIVE_RING_STEP = 5;
/** The Developer option's range (whole numbers). */
export const RELATIVE_RING_STEP_MIN = 2;
export const RELATIVE_RING_STEP_MAX = 10;
/** At most this many notes in a Relative pitches generator. */
export const RELATIVE_MAX_NOTES = 256;

export interface RingRatio {
  /** The exact ratio, strictly between 1/1 and 2/1. */
  note: Note;
  /** `p/q`. */
  text: string;
  /** Its odd limit (the larger odd part of numerator and denominator), at least 3. */
  odd: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** `p/q` for odd p and q folded by powers of two into (1, 2). */
function fold(p: number, q: number): [number, number] {
  let n = p;
  let d = q;
  while (n >= 2 * d) {
    d *= 2;
  }
  while (n < d) {
    n *= 2;
  }
  return [n, d];
}

/** A whole number step in the Developer range; anything else is the default. */
export function cleanRingStep(x: unknown): number {
  const n = typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : RELATIVE_RING_STEP;
  return Math.min(RELATIVE_RING_STEP_MAX, Math.max(RELATIVE_RING_STEP_MIN, n));
}

const ringCache = new Map<number, RingRatio[][]>();

/**
 * The four rings of the radial menu: every ratio strictly between 1/1 and 2/1, grouped by odd limit. Ring k (1 to 4) holds the
 * odd limits in (step * (k - 1), step * k], sorted by pitch. With the default step 5: 3 to 5, 7 to 9, 11 to 15, 17 to 19
 * (an odd limit of 10 or 20 does not exist, so the last bands lose nothing).
 */
export function relativeRings(step: number = RELATIVE_RING_STEP): RingRatio[][] {
  const s = cleanRingStep(step);
  const hit = ringCache.get(s);
  if (hit) {
    return hit;
  }
  const top = s * RELATIVE_RING_COUNT;
  const rings: RingRatio[][] = Array.from({ length: RELATIVE_RING_COUNT }, () => []);
  for (let a = 1; a <= top; a += 2) {
    for (let b = 1; b <= top; b += 2) {
      if (a === b || gcd(a, b) !== 1) {
        continue;
      }
      const [n, d] = fold(a, b);
      const odd = Math.max(a, b);
      const ring = Math.ceil(odd / s) - 1;
      if (ring < 0 || ring >= RELATIVE_RING_COUNT) {
        continue;
      }
      rings[ring].push({ note: ratioNote(n, d), text: `${n}/${d}`, odd });
    }
  }
  for (const r of rings) {
    r.sort((x, y) => x.note.c - y.note.c);
  }
  ringCache.set(s, rings);
  return rings;
}

/* ------------------------------------------------------------------------------------------- ring sequence */
/** The default odd cap of `relativeRingSequence` (a finite listing for tests and tools; the menu itself has no end). */
export const RELATIVE_MAX_ODD = 63;
/** At most this many ratios on one ring; a bigger odd limit is dealt over several rings. */
export const RELATIVE_RING_MAX = 48;

/** One ring of the radial menu: the ratios of one odd limit, or of the odd limits of one of the first three levels. */
export interface RingGroup {
  /** Stable id: `3-5`, `17`, `53a`. */
  key: string;
  /** What the ring's tag says: `3–5` (en dash) for a range, `17` for one odd limit, `53a` for a part of a split one. */
  label: string;
  /** The odd limits it holds, ascending. */
  odds: number[];
  /** The level: ceil(odd limit / step), so 17 and 19 are level 4, 21 to 25 level 5 (step 5). */
  level: number;
  /** True for the first three levels (ranges of odd limits), false for the single odd-limit rings after them. */
  levelGroup: boolean;
  /** Which part of a split odd limit this is (0 = `a`), and how many parts there are (1 when not split). */
  part: number;
  parts: number;
  /** Every ratio strictly between 1/1 and 2/1, sorted by pitch (a split ring holds every k-th ratio of the full list). */
  ratios: RingRatio[];
}

interface RingStore {
  rings: RingGroup[];
  /** The next odd limit to generate. */
  nextOdd: number;
  step: number;
}

const ringStores = new Map<number, RingStore>();

/** The ratios whose odd limit is exactly `g` (odd, at least 3), folded into (1, 2), sorted by pitch. */
function ratiosOfOdd(g: number): RingRatio[] {
  const out: RingRatio[] = [];
  for (let b = 1; b < g; b += 2) {
    if (gcd(g, b) !== 1) {
      continue;
    }
    for (const [x, y] of [
      [g, b],
      [b, g],
    ]) {
      const [n, d] = fold(x, y);
      out.push({ note: ratioNote(n, d), text: `${n}/${d}`, odd: g });
    }
  }
  return out.sort((x, y) => x.note.c - y.note.c);
}

/** Push a group, dealing it over ceil(n / RELATIVE_RING_MAX) rings when it is too big: ratio i goes to part i mod k. */
function pushGroup(
  store: RingStore,
  base: { key: string; label: string; odds: number[]; level: number; levelGroup: boolean },
  ratios: RingRatio[]
): void {
  const k = Math.max(1, Math.ceil(ratios.length / RELATIVE_RING_MAX));
  for (let j = 0; j < k; j++) {
    const suffix = k > 1 ? String.fromCharCode(97 + j) : '';
    store.rings.push({
      ...base,
      key: base.key + suffix,
      label: base.label + suffix,
      part: j,
      parts: k,
      ratios: k > 1 ? ratios.filter((_, i) => i % k === j) : ratios,
    });
  }
}

function ringStore(step: number): RingStore {
  const s = cleanRingStep(step);
  const hit = ringStores.get(s);
  if (hit) {
    return hit;
  }
  const store: RingStore = { rings: [], nextOdd: 0, step: s };
  const split = s * 3;
  const level = (odd: number) => Math.max(1, Math.ceil(odd / s));
  for (let lv = 1; lv <= 3; lv++) {
    const odds: number[] = [];
    for (let g = 3; g <= split; g += 2) {
      if (level(g) === lv) {
        odds.push(g);
      }
    }
    const ratios = odds.flatMap(ratiosOfOdd).sort((x, y) => x.note.c - y.note.c);
    if (ratios.length === 0) {
      continue;
    }
    const label = odds.length === 1 ? String(odds[0]) : `${odds[0]}–${odds[odds.length - 1]}`;
    pushGroup(
      store,
      { key: label.replace('–', '-'), label, odds, level: lv, levelGroup: true },
      ratios
    );
  }
  store.nextOdd = split + 1 + (split % 2 === 0 ? 0 : 1);
  ringStores.set(s, store);
  return store;
}

/**
 * Ring number `index` (0 = the simplest) of the radial menu's endless sequence. Levels 1 to 3 are one ring each (odd limits in
 * (step * (L - 1), step * L]); from level 4 on every odd number is its own ring (`17`, `19`, `21`, ...), and a ring over
 * `RELATIVE_RING_MAX` ratios is dealt over several (`53a`, `53b`). Rings are made on demand and kept.
 */
export function relativeRingAt(step: number, index: number): RingGroup {
  const store = ringStore(step);
  const i = Math.max(0, Math.floor(index));
  while (store.rings.length <= i) {
    const g = store.nextOdd;
    store.nextOdd += 2;
    pushGroup(
      store,
      {
        key: String(g),
        label: String(g),
        odds: [g],
        level: Math.ceil(g / store.step),
        levelGroup: false,
      },
      ratiosOfOdd(g)
    );
  }
  return store.rings[i];
}

/** The rings with an odd limit up to `maxOdd`, simplest first: a finite listing (the menu uses `relativeRingAt`, which has no end). */
export function relativeRingSequence(
  step: number = RELATIVE_RING_STEP,
  maxOdd: number = RELATIVE_MAX_ODD
): RingGroup[] {
  const cap = Math.max(3, Math.floor(maxOdd));
  const out: RingGroup[] = [];
  for (let i = 0; ; i++) {
    const g = relativeRingAt(step, i);
    if (g.odds[0] > cap) {
      return out;
    }
    out.push(g);
  }
}

const isPrime = (n: number): boolean => {
  if (n < 2) {
    return false;
  }
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) {
      return false;
    }
  }
  return true;
};

/** True for the first ring (`a`) of a prime odd limit after the first three levels: where the prime jumps land. */
const isPrimeRingStart = (g: RingGroup): boolean =>
  !g.levelGroup && g.part === 0 && isPrime(g.odds[0]);

/**
 * The ring index to put in the innermost place after jumping `count` prime rings from ring `from`: forward (dir 1) lands on the
 * next ring whose odd limit is prime (a split prime's part `a`), strictly after `from`, `count` times; backward (dir -1) the
 * same way back, and past the first one it goes to ring 0. From 0 one jump forward is the ring of 17 (step 5).
 */
export function primeRingIndex(step: number, from: number, dir: 1 | -1, count = 1): number {
  let i = Math.max(0, Math.floor(from));
  for (let c = 0; c < count; c++) {
    if (dir > 0) {
      i += 1;
      while (!isPrimeRingStart(relativeRingAt(step, i))) {
        i += 1;
      }
    } else {
      let j = i - 1;
      while (j >= 0 && !isPrimeRingStart(relativeRingAt(step, j))) {
        j -= 1;
      }
      if (j < 0) {
        return 0;
      }
      i = j;
    }
  }
  return i;
}

/* ----------------------------------------------------------------------------------------------- landing */
export type Direction = 'above' | 'below';

/**
 * Where a ratio lands from a note: the ratio above multiplies, below divides, folded into the repeat. Exact stays exact
 * (monzo arithmetic); when either side has no ratio (cents) it is plain cents arithmetic and the result has no ratio.
 */
export function landingPitch(from: Note, ratio: Note, dir: Direction, rep: Note): Note {
  return reduceInto(mulNotes(from, ratio, dir === 'above' ? 1 : -1), rep);
}

/** A note as stored text: the ratio `p/q` for an exact note, else cents `700 c` (up to 6 decimals, trailing zeros dropped). */
export function noteText(n: Note): string {
  return n.m ? fmtRatio(n) : `${Number(n.c.toFixed(6))} c`;
}

/** A stored note text read back, or null. A bare number is cents; a slash or colon makes it a ratio. */
export function readNoteText(text: string): Note | null {
  const p = parsePitchText(text);
  if (p === null || p === 'bad') {
    return null;
  }
  return /[/:]/.test(text) ? parseInterval(p.canon) : centsNote(p.c);
}

/** `fmtRatio` for an exact note, else `700.0 c`. */
const pitchLabel = (n: Note, dp = 1) => (n.m ? fmtRatio(n) : `${n.c.toFixed(dp)} c`);

/**
 * The hover readout: `11/6 below 3/2 = 18/11 (852.6 c)`. A landing with no ratio reads `700 c above 1/1 = 700.0 c`.
 * `ratioLabel` is how the step is named (the ratio text, the typed text, or the monzo's folded ratio).
 */
export function landingReadout(ratioLabel: string, dir: Direction, from: Note, to: Note): string {
  const where = to.m ? `${fmtRatio(to)} (${to.c.toFixed(1)} c)` : `${to.c.toFixed(1)} c`;
  return `${ratioLabel} ${dir} ${pitchLabel(from)} = ${where}`;
}

/* -------------------------------------------------------------------------------------------------- monzo */
/**
 * The primes the Monzo mode dials: 2 and the first 12 odd primes, for every repeat (human, 2026-11-17). With a 2/1 repeat
 * the 2 strip has no effect (folding removes it); with 3/1 it is the 3 strip that has none, and 2 places real notes.
 */
export const MONZO_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41] as const;
export type MonzoPrime = (typeof MONZO_PRIMES)[number];
/** Each exponent runs from -MONZO_RANGE to +MONZO_RANGE. */
export const MONZO_RANGE = 12;
export type MonzoExps = Record<MonzoPrime, number>;

export const zeroMonzo = (): MonzoExps =>
  Object.fromEntries(MONZO_PRIMES.map((p) => [p, 0])) as MonzoExps;

/** One exponent, a whole number clamped to -12..+12 (junk is 0). */
export const clampExp = (x: unknown): number =>
  typeof x === 'number' && Number.isFinite(x)
    ? Math.min(MONZO_RANGE, Math.max(-MONZO_RANGE, Math.round(x)))
    : 0;

export const isZeroMonzo = (e: MonzoExps): boolean =>
  MONZO_PRIMES.every((p) => clampExp(e[p]) === 0);

/** The exponents as an exact note (not folded). */
export function monzoNote(e: MonzoExps): Note {
  const m: Monzo = {};
  for (const p of MONZO_PRIMES) {
    const x = clampExp(e[p]);
    if (x) {
      m[String(p)] = x;
    }
  }
  return mkNote(m);
}

export interface MonzoStep {
  /** The step as a ratio folded into the repeat, always read in the direction named: `7/4 above` (7 at +1 or 1/7 at -1 both give 7/4). */
  ratio: Note;
  /** The sign of the dialed interval's size: positive is above the clicked note, negative below. */
  dir: Direction;
}

/**
 * The dialed monzo as a named step, or null when every exponent is 0 (the ghost dot then sits on the clicked note). The
 * direction is the sign of the exponent vector's size (7 at +1 is above, 7 at -1 is below; mixed: whichever is larger).
 */
export function monzoStep(e: MonzoExps, rep: Note): MonzoStep | null {
  if (isZeroMonzo(e)) {
    return null;
  }
  const v = monzoNote(e);
  const dir: Direction = v.c >= 0 ? 'above' : 'below';
  const mag = dir === 'above' ? v : mulNotes({ m: {}, c: 0 }, v, -1);
  return { ratio: reduceInto(mag, rep), dir };
}

/**
 * Where the dialed monzo lands from the clicked note: the note times the vector, folded (the sign of each exponent is its
 * own direction, so no above or below). All zero gives the clicked note itself.
 */
export function monzoLanding(from: Note, e: MonzoExps, rep: Note): Note {
  return isZeroMonzo(e) ? from : reduceInto(mulNotes(from, monzoNote(e)), rep);
}

/* ------------------------------------------------------------------------------------------ typed input */
/** The message for typed text that is neither a ratio nor cents. */
export const TYPED_STEP_ERROR = 'Type a ratio such as 3/2, or cents such as 700';

export type TypedStep = { ok: true; ratio: Note; label: string } | { ok: false; message: string };

/**
 * The typed box: text with a slash or colon is a ratio (exact, at least one side nonzero; `3/0` is refused), anything else is
 * cents (`700`, `700 c`, `-100`). The cents step has no ratio. Zero cents (`0`) is refused: it would land on the note itself.
 * Empty text and junk give the message.
 */
export function parseTypedStep(text: string): TypedStep {
  const bad: TypedStep = { ok: false, message: TYPED_STEP_ERROR };
  const t = text.trim();
  const p = parsePitchText(t);
  if (p === null || p === 'bad') {
    return bad;
  }
  if (/[/:]/.test(t)) {
    const n = parseInterval(t);
    return n && n.m ? { ok: true, ratio: n, label: fmtRatio(n) } : bad;
  }
  if (Math.abs(p.c) < EPS) {
    return bad;
  }
  return { ok: true, ratio: centsNote(p.c), label: `${Number(p.c.toFixed(6))} c` };
}

/* ------------------------------------------------------------------------------------------------ notes */
/** `cents` of a note folded into the repeat, to compare pitches. */
const placeOf = (n: Note, rep: Note): number => reduceInto(n, rep).c;

/** True when `text` reads as a pitch that is already among `notes` (folded into the repeat, within EPS). */
export function hasPitch(notes: readonly string[], text: string, rep: Note): boolean {
  const n = readNoteText(text);
  if (!n) {
    return false;
  }
  const c = placeOf(n, rep);
  return notes.some((t) => {
    const x = readNoteText(t);
    return x !== null && Math.abs(placeOf(x, rep) - c) < EPS;
  });
}

export const ALREADY_IN_FIELD = 'That pitch is already in the field.';
/** 1/1 is the field's reference and cannot be rebuilt from the other notes, so it always stays (human, 2026-11-17). */
export const KEEP_UNISON = '1/1 is the reference and always stays.';
export const AT_MAX_NOTES = `At most ${RELATIVE_MAX_NOTES} notes.`;

export interface NotesEdit {
  /** The notes after the edit (the same array when nothing changed). */
  notes: string[];
  /** A quiet line for the page when nothing changed, else null. */
  message: string | null;
}

/**
 * Add a note (any readable pitch text) to the generator's notes, stored folded into the repeat. A pitch that is already there
 * (folded, within EPS), an unreadable text, or the 256 cap changes nothing and says why.
 */
export function addRelativeNote(notes: string[], text: string, rep: Note): NotesEdit {
  const n = readNoteText(text);
  if (!n) {
    return { notes, message: TYPED_STEP_ERROR };
  }
  if (hasPitch(notes, text, rep)) {
    return { notes, message: ALREADY_IN_FIELD };
  }
  if (notes.length >= RELATIVE_MAX_NOTES) {
    return { notes, message: AT_MAX_NOTES };
  }
  return { notes: [...notes, noteText(reduceInto(n, rep))], message: null };
}

/**
 * Remove the note at this place (cents in [0, repeat), a field note's `c`): every stored note that folds to it goes, nothing
 * else. Removing 1/1 (place 0) is refused: like every method, a Relative pitches field always holds 1/1.
 */
export function removeRelativePitch(notes: string[], placeC: number, rep: Note): NotesEdit {
  if (Math.abs(placeC) < EPS) {
    return { notes, message: KEEP_UNISON };
  }
  const kept = notes.filter((t) => {
    const n = readNoteText(t);
    return !n || Math.abs(placeOf(n, rep) - placeC) >= EPS;
  });
  if (kept.length === notes.length) {
    return { notes, message: null };
  }
  return { notes: kept, message: null };
}

/**
 * The stored notes cleaned: keeps the readable ones as canonical text (a ratio `p/q`, cents `700 c`), drops duplicates of the
 * same text, cuts at 256. `1/1` is always first: added when the stored list lacks it (empty or not a list gives `['1/1']`).
 */
export function sanitizeRelativeNotes(raw: unknown): string[] {
  const out: string[] = ['1/1'];
  if (Array.isArray(raw)) {
    const seen = new Set<string>(['1/1']);
    for (const v of raw) {
      if (typeof v !== 'string' || v.length > 700) {
        continue;
      }
      const n = readNoteText(v);
      if (!n) {
        continue;
      }
      const t = noteText(n);
      if (seen.has(t)) {
        continue;
      }
      seen.add(t);
      out.push(t);
      if (out.length >= RELATIVE_MAX_NOTES) {
        break;
      }
    }
  }
  return out;
}

/** The generator's notes as `Note`s (unfolded); an unreadable entry throws a sentence (the page shows it inline). */
export function relativeNotes(texts: readonly string[]): Note[] {
  return texts.map((t) => {
    const n = readNoteText(t);
    if (!n) {
      throw new Error(`Relative pitches: cannot read "${t}"`);
    }
    return n;
  });
}
