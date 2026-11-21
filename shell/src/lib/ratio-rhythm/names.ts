/**
 * Gap-based names (Canon 6). Gaps are divided by their GCD first.
 *  - scale: the gaps written from the root (slot 0);
 *  - rhythm: the smallest rotation of the gap list (numeric lexicographic), direction kept;
 *  - class: the smallest of all rotations and reversals.
 * Short forms run digits together when every gap is below 10, otherwise gaps are space-separated.
 * The long class form is `L·k ⟨g g g⟩` (always spaced).
 */
import { gcdAll, type Ratio } from './ratios';
import { gapsOf, slotRatio, slotsOfGaps } from './ring';

export interface RhythmName {
  /** Ring size after dividing the gaps by their GCD. */
  L: number;
  k: number;
  /** The common factor that was divided out. */
  factor: number;
  /** Scale name: reduced gaps from the root. */
  scale: number[];
  /** Rhythm name: smallest rotation. */
  rhythm: number[];
  /** Class name: smallest rotation or reversal. */
  cls: number[];
  /** True when the class is a reversal (mirror image) of the rhythm. */
  mirrored: boolean;
  /**
   * Position of the root's gap inside `rhythm`, 0-based. For a rhythm with rotational symmetry
   * this is the first equivalent position (smallest).
   */
  rootAt: number;
}

export function cmpGaps(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

export function rotateGaps(g: number[], r: number): number[] {
  const k = g.length;
  const s = ((r % k) + k) % k;
  return g.slice(s).concat(g.slice(0, s));
}

function minRotation(g: number[]): { gaps: number[]; at: number } {
  let best = g;
  let at = 0;
  for (let r = 1; r < g.length; r++) {
    const t = rotateGaps(g, r);
    if (cmpGaps(t, best) < 0) {
      best = t;
      at = r;
    }
  }
  return { gaps: best, at };
}

/** Smallest period of a gap list under rotation (divides k). */
function rotationalPeriod(g: number[]): number {
  const k = g.length;
  for (let p = 1; p < k; p++) {
    if (k % p === 0 && cmpGaps(rotateGaps(g, p), g) === 0) {
      return p;
    }
  }
  return k;
}

/** Names of a rhythm given as sorted onset slots on a ring of L. The root is the onset on slot 0 (or the first onset). */
export function nameOf(slots: number[], L: number): RhythmName {
  const sorted = [...slots].sort((a, b) => a - b);
  const raw = gapsOf(sorted, L);
  const factor = Number(gcdAll(raw.map(BigInt)));
  const g = raw.map((x) => x / factor);
  const k = g.length;
  const ri = Math.max(0, sorted.indexOf(0));
  const min = minRotation(g);
  let cls = min.gaps;
  let mirrored = false;
  const rev = [...g].reverse();
  for (let r = 0; r < k; r++) {
    const t = rotateGaps(rev, r);
    if (cmpGaps(t, cls) < 0) {
      cls = t;
      mirrored = true;
    }
  }
  const p = rotationalPeriod(min.gaps);
  const rootAt = ((((ri - min.at) % k) + k) % k) % p;
  return {
    L: L / factor,
    k,
    factor,
    scale: rotateGaps(g, ri),
    rhythm: min.gaps,
    cls,
    mirrored,
    rootAt,
  };
}

/** Inner text of a short form: digits run together when every gap < 10, else space-separated. */
export function gapText(gaps: number[]): string {
  return gaps.every((g) => g < 10) ? gaps.join('') : gaps.join(' ');
}

/** Short form, used for scale, rhythm and class names: `⟨334113⟩` or `⟨8 1 9 18 36⟩`. */
export function fmtShort(gaps: number[]): string {
  return `⟨${gapText(gaps)}⟩`;
}

/** Long class name: `15·6 ⟨1 1 3 3 3 4⟩`. */
export function fmtClassLong(name: RhythmName): string {
  return `${name.L}·${name.k} ⟨${name.cls.join(' ')}⟩`;
}

/**
 * One-token form: the rhythm string with a barline before the root's gap, `⟨113|334⟩`.
 * With spaced gaps the barline is set off by spaces: `⟨1 9 18 36 | 8⟩`. When the root's gap
 * is the first one (rootAt 0) no barline is written, so the string reads as the rhythm itself.
 */
export function fmtOneToken(name: RhythmName): string {
  const { rhythm, rootAt } = name;
  if (rootAt === 0) {
    return fmtShort(rhythm);
  }
  const head = rhythm.slice(0, rootAt);
  const tail = rhythm.slice(rootAt);
  if (rhythm.every((g) => g < 10)) {
    return `⟨${head.join('')}|${tail.join('')}⟩`;
  }
  return `⟨${head.join(' ')} | ${tail.join(' ')}⟩`;
}

export interface ParsedName {
  gaps: number[];
  /** Index in `gaps` where the barline sat (the root's gap), or 0 when there was none. */
  bar: number;
}

/**
 * Parse a short name (angle brackets optional; with brackets, an `L·k` prefix before them is
 * ignored). Whitespace anywhere inside means the gaps are space-separated; otherwise each
 * character is one digit. Null if malformed.
 */
export function parseName(text: string): ParsedName | null {
  const open = text.indexOf('⟨');
  const close = text.indexOf('⟩');
  let inner = open >= 0 && close > open ? text.slice(open + 1, close) : text;
  inner = inner.trim();
  if (!inner) {
    return null;
  }
  // The digit-run form never contains whitespace, so any whitespace (even only around the
  // barline, as in `⟨1 | 12⟩`) means the gaps are space-separated.
  const spaced = /\s/.test(inner);
  const parts = inner.split('|');
  if (parts.length > 2) {
    return null;
  }
  const gaps: number[] = [];
  let bar = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    const items = part ? (spaced ? part.split(/\s+/) : part.split('')) : [];
    for (const it of items) {
      if (!/^\d+$/.test(it) || Number(it) < 1) {
        return null;
      }
      gaps.push(Number(it));
    }
    if (i === 0) {
      bar = gaps.length;
    }
  }
  if (parts.length === 1) {
    bar = 0;
  }
  return gaps.length ? { gaps, bar } : null;
}

export interface DecodedScale {
  L: number;
  slots: number[];
  ratios: Ratio[];
}

/** Decode a scale name (gaps from the root): slots from 0, ratios (L + s) / L. */
export function decodeScale(gaps: number[]): DecodedScale {
  const L = gaps.reduce((a, b) => a + b, 0);
  const slots = slotsOfGaps(gaps);
  return { L, slots, ratios: slots.map((s) => slotRatio(L, s)) };
}

/** Decode a one-token name (rhythm with a barline): the gaps restart at the barline. */
export function decodeOneToken(text: string): DecodedScale | null {
  const p = parseName(text);
  return p ? decodeScale(rotateGaps(p.gaps, p.bar)) : null;
}
