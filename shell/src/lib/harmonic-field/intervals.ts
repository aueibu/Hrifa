/** Exact interval math: monzos, notes, interval text, reduction into the repeat, prime filter. Pure. */
import type { Monzo, Note, PrimeMask } from './types';

/** Infinitone's prime table; slot 24 is the shared "97+" switch. */
export const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89,
];
/** Cents tolerance for "same pitch". */
export const EPS = 1e-6;
/** Infinitone's note cap. */
export const MAXN = 2048;

export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export function mAdd(a: Monzo, b: Monzo, k = 1): Monzo {
  const r: Monzo = { ...a };
  for (const p in b) {
    const v = (r[p] || 0) + k * b[p];
    if (v) {
      r[p] = v;
    } else {
      delete r[p];
    }
  }
  return r;
}

export function mCents(m: Monzo): number {
  let c = 0;
  for (const p in m) {
    c += m[p] * 1200 * Math.log2(Number(p));
  }
  return c;
}

export function mFrac(m: Monzo): [bigint, bigint] {
  let n = 1n;
  let d = 1n;
  for (const p in m) {
    const e = m[p];
    const bp = BigInt(p);
    if (e > 0) {
      n *= bp ** BigInt(e);
    } else {
      d *= bp ** BigInt(-e);
    }
  }
  return [n, d];
}

export function factorInt(input: bigint | number | string): Monzo {
  let x = BigInt(input);
  const m: Monzo = {};
  for (let p = 2n; p * p <= x && p < 2000000n; p += p === 2n ? 1n : 2n) {
    while (x % p === 0n) {
      const key = String(p);
      m[key] = (m[key] || 0) + 1;
      x /= p;
    }
  }
  if (x > 1n) {
    const key = String(x);
    m[key] = (m[key] || 0) + 1;
  }
  return m;
}

export function mkNote(m: Monzo): Note {
  return { m, c: mCents(m) };
}

export function ratioNote(n: bigint | number | string, d: bigint | number | string): Note {
  return mkNote(mAdd(factorInt(n), factorInt(d), -1));
}

export function centsNote(c: number): Note {
  return { m: Math.abs(c) < EPS ? {} : null, c };
}

/** a * b^k. Irrational times anything is irrational. */
export function mulNotes(a: Note, b: Note, k = 1): Note {
  return { m: a.m && b.m ? mAdd(a.m, b.m, k) : null, c: a.c + k * b.c };
}

/**
 * Interval text: "3/2", "3:2", "3" (integer ratio), "701.96" (Scala rule: a dot means cents),
 * "701.96c", "7\12" (EDO steps of 2/1). Zero and junk give null.
 */
export function parseInterval(input: string): Note | null {
  const s = String(input).trim();
  let r: RegExpMatchArray | null;
  if (!s) {
    return null;
  }
  if ((r = s.match(/^(\d+)\s*[/:]\s*(\d+)$/))) {
    if (/^0+$/.test(r[1]) || /^0+$/.test(r[2])) {
      return null;
    }
    return ratioNote(r[1], r[2]);
  }
  if ((r = s.match(/^(-?\d+)\s*\\\s*(\d+)$/))) {
    if (Number(r[2]) === 0) {
      return null;
    }
    return centsNote((1200 * Number(r[1])) / Number(r[2]));
  }
  if ((r = s.match(/^(-?\d*\.?\d+)\s*c$/i))) {
    return centsNote(Number(r[1]));
  }
  if (/^-?\d*\.\d*$/.test(s) && /\d/.test(s)) {
    return centsNote(Number(s));
  }
  if (/^\d+$/.test(s) && !/^0+$/.test(s)) {
    return ratioNote(s, 1);
  }
  return null;
}

/** Reduce into [0, repeat). Keeps extra fields (e.g. lattice coordinates `x`) on the note. */
export function reduceInto(n: Note, rep: Note): Note {
  const k = Math.floor(n.c / rep.c + 1e-9);
  if (k === 0) {
    return n;
  }
  return { ...n, ...mulNotes(n, rep, -k) };
}

export function fmtRatio(n: Note): string {
  if (!n.m) {
    return '—';
  }
  const [a, b] = mFrac(n.m);
  return `${a}/${b}`;
}

export function primeLimit(n: Note): number | null {
  if (!n.m) {
    return null;
  }
  let L = 1;
  for (const p in n.m) {
    L = Math.max(L, Number(p));
  }
  return L;
}

/** Larger of the odd parts of numerator and denominator, or null for an irrational note. */
export function oddLimit(n: Note): bigint | null {
  if (!n.m) {
    return null;
  }
  let [a, b] = mFrac(n.m);
  while (a % 2n === 0n) {
    a /= 2n;
  }
  while (b % 2n === 0n) {
    b /= 2n;
  }
  return a > b ? a : b;
}

export function tenneyHeight(n: Note): number | null {
  if (!n.m) {
    return null;
  }
  let h = 0;
  for (const p in n.m) {
    h += Math.abs(n.m[p]) * Math.log2(Number(p));
  }
  return h;
}

export function slotOf(p: number | string): number {
  const i = PRIMES.indexOf(Number(p));
  return i < 0 ? 24 : i;
}

/** Infinitone rule: every prime with a non-zero net exponent must be enabled. Irrational notes always pass. */
export function passesMask(n: Note, mask: PrimeMask): boolean {
  if (!n.m) {
    return true;
  }
  for (const p in n.m) {
    if (!mask[slotOf(p)]) {
      return false;
    }
  }
  return true;
}

/** A usable odd limit setting: a whole number of at least 1, else null (no filter). */
export function cleanOddLimit(x: unknown): number | null {
  return typeof x === 'number' && Number.isInteger(x) && x >= 1 ? x : null;
}

/**
 * The odd limit filter (M6): a note passes when its odd limit (`oddLimit`) is at most `limit`. A note with no exact ratio
 * (EDO or cents) always passes, as in the prime filter (human decision D2).
 */
export function passesOddLimit(n: Note, limit: number): boolean {
  const o = oddLimit(n);
  return o === null || o <= BigInt(limit);
}

/** Sort by cents and drop notes within EPS of the previous one (a rational note wins over an irrational one). */
export function dedupeSort(input: Note[]): Note[] {
  const ns = input.slice().sort((a, b) => a.c - b.c);
  const out: Note[] = [];
  for (const n of ns) {
    const l = out[out.length - 1];
    if (l && Math.abs(l.c - n.c) < EPS) {
      if (!l.m && n.m) {
        out[out.length - 1] = n;
      }
    } else {
      out.push(n);
    }
  }
  return out;
}

export const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Nearest 12-EDO note name with a cents offset, e.g. "E -13.7". */
export function vs12(c: number): string {
  const s = Math.round(c / 100);
  const d = c - s * 100;
  return NAMES[mod(s, 12)] + (d >= 0 ? ' +' : ' ') + d.toFixed(1);
}

/* ---------------------------------------------------------------------------- prime factorization text */
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (e: number): string =>
  e === 1
    ? ''
    : String(e)
        .split('')
        .map((d) => SUP[Number(d)])
        .join('');

/** Every prime from 2 up to `max` (the lib table first, trial division beyond it). */
function primesUpTo(max: number): number[] {
  const out: number[] = [];
  for (let p = 2; p <= max; p++) {
    if (out.every((q) => p % q !== 0)) {
      out.push(p);
    }
  }
  return out;
}

/** The nonzero exponents, ascending by prime. */
function monzoTerms(n: Note): [number, number][] {
  return Object.entries(n.m ?? {})
    .map(([p, e]): [number, number] => [Number(p), e])
    .filter(([, e]) => e !== 0)
    .sort((a, b) => a[0] - b[0]);
}

/** Monzo vector text `[-3 1 1⟩`: exponents of every prime from 2 to the highest used, zeros included. 1/1 is `[ ⟩`; null without a monzo. */
export function fmtMonzoVector(n: Note): string | null {
  if (!n.m) {
    return null;
  }
  const t = monzoTerms(n);
  if (!t.length) {
    return '[ ⟩';
  }
  const hi = t[t.length - 1][0];
  const e = new Map(t);
  return `[${primesUpTo(hi)
    .map((p) => e.get(p) ?? 0)
    .join(' ')}⟩`;
}

const side = (t: [number, number][]): string =>
  t.length ? t.map(([p, e]) => `${p}${sup(e)}`).join('·') : '1';

/** Top / bottom text `3·5 / 2³` (primes joined by `·`, superscript exponents); an empty side is `1`, 1/1 is `1`; null without a monzo. */
export function fmtTopBottom(n: Note): string | null {
  if (!n.m) {
    return null;
  }
  const t = monzoTerms(n);
  if (!t.length) {
    return '1';
  }
  const top = t.filter(([, e]) => e > 0);
  const bot = t.filter(([, e]) => e < 0).map(([p, e]): [number, number] => [p, -e]);
  return `${side(top)} / ${side(bot)}`;
}

const sayList = (xs: string[]): string =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Words for the top / bottom text: "3 to the 2, over 2 to the 3". */
export function nameTopBottom(n: Note): string | null {
  if (!n.m) {
    return null;
  }
  const t = monzoTerms(n);
  if (!t.length) {
    return '1';
  }
  const say = (s: [number, number][]): string =>
    s.length ? s.map(([p, e]) => (e === 1 ? `${p}` : `${p} to the ${e}`)).join(' times ') : '1';
  const top = t.filter(([, e]) => e > 0);
  const bot = t.filter(([, e]) => e < 0).map(([p, e]): [number, number] => [p, -e]);
  return `${say(top)}, over ${say(bot)}`;
}

/** Words for the monzo vector: "monzo: exponents of 2 and 3, minus 3 and 2". */
export function nameMonzoVector(n: Note): string | null {
  if (!n.m) {
    return null;
  }
  const t = monzoTerms(n);
  if (!t.length) {
    return 'monzo: no exponents, the ratio is 1/1';
  }
  const hi = t[t.length - 1][0];
  const e = new Map(t);
  const ps = primesUpTo(hi);
  const vals = ps.map((p) => {
    const v = e.get(p) ?? 0;
    return v < 0 ? `minus ${-v}` : String(v);
  });
  return `monzo: exponent${ps.length > 1 ? 's' : ''} of ${sayList(ps.map(String))}, ${sayList(vals)}`;
}

/** Tenney height with two decimals (the Stats panel's rounding); null without a monzo. */
export function fmtTenney(n: Note): string | null {
  const h = tenneyHeight(n);
  return h === null ? null : h.toFixed(2);
}
