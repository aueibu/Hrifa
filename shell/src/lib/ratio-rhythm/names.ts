/**
 * Gap-based names (Canon 6). Gaps are divided by their GCD first.
 *  - scale: the gaps written from the root (slot 0);
 *  - rhythm: the smallest rotation of the gap list (numeric lexicographic), direction kept;
 *  - class: the smallest of all rotations and reversals.
 * Written as in the Harmonic Field Lab's step patterns (`2-2 on 4`): gaps joined by hyphens at
 * every size, no brackets. The root is marked inside the rhythm name by a barline in place of the
 * hyphen before the root's gap (`1-1-3|3-3-4`; a leading `|` when the root's gap comes first).
 * The long class form is `L·k 1-1-3-3-3-4`. Decided by the human 2026-11-20 (ARC.md, M1).
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

/** Short form, used for scale, rhythm and class names: `3-3-4-1-1-3`, `8-1-9-18-36`. */
export function fmtShort(gaps: number[]): string {
  return gaps.join('-');
}

/** Long class name: `15·6 1-1-3-3-3-4`. */
export function fmtClassLong(name: RhythmName): string {
  return `${name.L}·${name.k} ${fmtShort(name.cls)}`;
}

/**
 * One-token form: the rhythm name with a barline in place of the hyphen before the root's gap,
 * `1-1-3|3-3-4`, `1-9-18-36|8`. When the root's gap comes first (rootAt 0, including a rhythm
 * with rotational symmetry) the barline leads: `|1-2-1-2-1-2`.
 */
export function fmtOneToken(name: RhythmName): string {
  const { rhythm, rootAt } = name;
  return `${fmtShort(rhythm.slice(0, rootAt))}|${fmtShort(rhythm.slice(rootAt))}`;
}

export interface ParsedName {
  gaps: number[];
  /** Index in `gaps` where the barline sat (the root's gap), or 0 when there was none. */
  bar: number;
}

/**
 * Parse a name: gaps separated by hyphens (or spaces), at most one barline, an optional `L·k`
 * prefix. Angle brackets are ignored, so the old artifact's spaced text (`⟨1 9 18 36⟩`) still
 * reads. A run of digits with no separator is one gap. Null if malformed.
 */
export function parseName(text: string): ParsedName | null {
  const inner = text
    .replace(/[⟨⟩]/g, ' ')
    .replace(/^\s*\d+\s*·\s*\d+\s+/, '')
    .trim();
  if (!inner) {
    return null;
  }
  const parts = inner.split('|');
  if (parts.length > 2) {
    return null;
  }
  const gaps: number[] = [];
  let bar = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    const items = part ? part.split(/\s*-\s*|\s+/) : [];
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
