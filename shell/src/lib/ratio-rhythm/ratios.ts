/**
 * Exact ratios as bigint numerator and denominator, plus local gcd, lcm and LCD.
 * Pure. Imports from harmonic-field by file only (`intervals.ts`).
 */
import { parseInterval, ratioNote } from '../harmonic-field/intervals';

/** A positive exact ratio n/d in lowest terms. */
export interface Ratio {
  n: bigint;
  d: bigint;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function lcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) {
    return 0n;
  }
  return (a / gcd(a, b)) * b;
}

export function gcdAll(values: bigint[]): bigint {
  return values.reduce((g, v) => gcd(g, v), 0n);
}

export function lcmAll(values: bigint[]): bigint {
  return values.reduce((l, v) => lcm(l, v), 1n);
}

/** A ratio in lowest terms, no equave reduction. Returns null unless both parts are positive. */
export function makeRatio(n: bigint, d: bigint): Ratio | null {
  if (n <= 0n || d <= 0n) {
    return null;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

/** A ratio octave-reduced into [1, 2) (equave 2/1) and put in lowest terms. */
export function reduceOctave(n: bigint, d: bigint): Ratio | null {
  if (n <= 0n || d <= 0n) {
    return null;
  }
  let a = n;
  let b = d;
  while (a < b) {
    a *= 2n;
  }
  while (a >= 2n * b) {
    b *= 2n;
  }
  return makeRatio(a, b);
}

/** Negative, zero or positive: a < b, a = b, a > b. */
export function cmpRatio(a: Ratio, b: Ratio): number {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}

export function ratioEq(a: Ratio, b: Ratio): boolean {
  return a.n === b.n && a.d === b.d;
}

export function ratioStr(r: Ratio): string {
  return `${r.n}/${r.d}`;
}

/** Derived display value only. */
export function ratioCents(r: Ratio): number {
  return ratioNote(r.n, r.d).c;
}

/** Least common denominator of the ratios (bigint, never overflows). */
export function lcdOf(rs: Ratio[]): bigint {
  return lcmAll(rs.map((r) => r.d));
}

/** Divide every ratio by the root and octave-reduce; sorted ascending. */
export function rerootRatios(rs: Ratio[], root: Ratio): Ratio[] {
  const out: Ratio[] = [];
  for (const r of rs) {
    const x = reduceOctave(r.n * root.d, r.d * root.n);
    if (x) {
      out.push(x);
    }
  }
  return out.sort(cmpRatio);
}

export interface ParsedRatios {
  ratios: Ratio[];
  /** Tokens that are not exact ratios (cents, decimals, EDO steps, zero, junk). */
  bad: string[];
  /** 1/1 was missing and was added. */
  added: boolean;
  /** More than `max` ratios were given and the list was cut. */
  cut: boolean;
}

export interface ParseOptions {
  /** Cut the list to this many ratios (the lab's cap is 24). Default 24. */
  max?: number;
  /** Octave-reduce into [1, 2). Default true; the rates reading passes false. */
  reduce?: boolean;
}

const TOKEN = /^(\d+)(?:\s*[/:]\s*(\d+))?$/;

/** Parse "n/d", "n:d" or "n" tokens separated by space, comma or semicolon. Exact input only. */
export function parseRatios(text: string, opts: ParseOptions = {}): ParsedRatios {
  const max = opts.max ?? 24;
  const reduce = opts.reduce ?? true;
  const out: Ratio[] = [];
  const bad: string[] = [];
  for (const tok of text.split(/[\s,;]+/).filter(Boolean)) {
    const note = parseInterval(tok);
    const m = TOKEN.exec(tok);
    if (!note || note.m === null || !m) {
      bad.push(tok);
      continue;
    }
    const n = BigInt(m[1]);
    const d = m[2] ? BigInt(m[2]) : 1n;
    const r = reduce ? reduceOctave(n, d) : makeRatio(n, d);
    if (!r) {
      bad.push(tok);
      continue;
    }
    if (!out.some((x) => ratioEq(x, r))) {
      out.push(r);
    }
  }
  let added = false;
  if (!out.some((x) => x.n === 1n && x.d === 1n)) {
    out.push({ n: 1n, d: 1n });
    added = true;
  }
  out.sort(cmpRatio);
  return { ratios: out.slice(0, max), bad, added, cut: out.length > max };
}
