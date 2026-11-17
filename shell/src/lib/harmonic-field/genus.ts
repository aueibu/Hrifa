/**
 * Euler-Fokker genus (M6): the notes of a whole number n are every divisor of n, each folded into the repeat. The lab builds
 * one from a typed number (`45`, `3^2*5`, `3 3 5`). Everything here is exact (monzos, BigInt) and pure: no React, no storage.
 *
 * Limits: the field cap (`MAXN` notes, counted BEFORE anything is built), exponents up to `GENUS_MAX_EXP`, and primes up to
 * `GENUS_MAX_PRIME` (the last prime of the lab's prime table; 97 and larger share one switch in the prime filter).
 */
import { MAXN, PRIMES, dedupeSort, mkNote, ratioNote, reduceInto } from './intervals';
import type { Monzo, Note } from './types';

/** The sentence for text that is not a whole number. */
export const GENUS_HINT = 'Type a whole number such as 45 or 3^2*5.';
/** The largest prime a genus may use: the last entry of the lab's prime table (89). */
export const GENUS_MAX_PRIME = PRIMES[PRIMES.length - 1];
/** The largest exponent of one prime. */
export const GENUS_MAX_EXP = 4095;
/** The longest stored number (digits): enough for any genus that passes the note cap. */
export const GENUS_MAX_DIGITS = 6000;
/** The longest single typed number (digits). */
const MAX_TOKEN_DIGITS = 1000;

export interface GenusFactor {
  p: number;
  e: number;
}

/** A readable genus: the number, its prime factors (ascending, exponent at least 1) and the note count in the octave. */
export interface GenusInfo {
  n: bigint;
  factors: GenusFactor[];
  notes: number;
}

export type GenusParse = GenusInfo | { error: string };

const OCTAVE = ratioNote(2, 1);

/**
 * The prime whose every power vanishes in this repeat: the repeat's single prime when the repeat is that prime itself
 * (2/1 gives 2, 3/1 gives 3); none for 4/1, 3/2 or a cents repeat. No repeat means the octave.
 */
function vanishingPrime(rep: Note | undefined): number | null {
  if (!rep) {
    return 2;
  }
  const ks = rep.m ? Object.keys(rep.m).filter((k) => rep.m?.[k] !== 0) : [];
  return ks.length === 1 && rep.m?.[ks[0]] === 1 ? Number(ks[0]) : null;
}

/**
 * How many divisor classes the genus has in this repeat: the product of (e + 1) over the primes that do not vanish. In the
 * octave the powers of 2 vanish, so 32 counts 1 and 45 counts 6. (Never fewer than the notes: two classes can still land on
 * one note for a multi-prime repeat, which the field builder de-duplicates.)
 */
export function genusCount(factors: readonly GenusFactor[], rep?: Note): bigint {
  const skip = vanishingPrime(rep);
  let c = 1n;
  for (const f of factors) {
    if (f.p !== skip) {
      c *= BigInt(f.e + 1);
    }
  }
  return c;
}

const capText = (count: bigint) => `This genus has ${count} notes, the limit is ${MAXN}.`;

/** Divide out every prime of the table; what is left is 1 when n only uses allowed primes. */
function splitSmall(a: bigint): { exps: Map<number, number>; rest: bigint } {
  const exps = new Map<number, number>();
  let x = a;
  for (const p of PRIMES) {
    const bp = BigInt(p);
    while (x % bp === 0n) {
      exps.set(p, (exps.get(p) ?? 0) + 1);
      x /= bp;
    }
  }
  return { exps, rest: x };
}

const bigPrimeText = (rest: bigint): string => {
  const s = rest.toString();
  return `The largest prime allowed in a genus is ${GENUS_MAX_PRIME}; ${
    s.length <= 12 ? s : 'a larger part'
  } is left after dividing out the primes 2 to ${GENUS_MAX_PRIME}.`;
};

/** Checks on the combined exponents (exponent cap, then note cap), then the result. */
function finish(exps: ReadonlyMap<number, number>, rep?: Note): GenusParse {
  const factors: GenusFactor[] = [...exps]
    .filter(([, e]) => e > 0)
    .map(([p, e]) => ({ p, e }))
    .sort((a, b) => a.p - b.p);
  if (factors.some((f) => f.e > GENUS_MAX_EXP)) {
    return { error: `Exponents above ${GENUS_MAX_EXP} are not accepted.` };
  }
  const count = genusCount(factors, rep);
  if (count > BigInt(MAXN)) {
    return { error: capText(count) };
  }
  let n = 1n;
  for (const f of factors) {
    n *= BigInt(f.p) ** BigInt(f.e);
  }
  return { n, factors, notes: Number(count) };
}

/**
 * The number typed for a genus, understood. Accepts `45`, `3^2*5`, `3 3 5`, `3^2 x 5` and `3^2 5` (factors separated by
 * `*`, `x`, a middle dot or spaces; any factor may itself be a composite number). Returns `{ n, factors, notes }`, or
 * `{ error }` with a plain sentence for text that is not a whole number of at least 1, a prime above 89, an exponent above
 * 4095, or a genus with more notes than the field limit (`notes` is counted as the product of (e + 1) before anything is
 * built; powers of 2 are accepted and vanish in the octave). `rep` defaults to the octave.
 */
export function parseGenusN(text: string, rep?: Note): GenusParse {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/\s*\^\s*/g, '^');
  if (!s || !/^[0-9^*x×·\s]+$/.test(s)) {
    return { error: GENUS_HINT };
  }
  const tokens = s.split(/[\s*x×·]+/).filter(Boolean);
  if (!tokens.length) {
    return { error: GENUS_HINT };
  }
  const total = new Map<number, number>();
  for (const tok of tokens) {
    const r = /^(\d+)(?:\^(\d+))?$/.exec(tok);
    if (!r) {
      return { error: GENUS_HINT };
    }
    const base = r[1].replace(/^0+(?=\d)/, '');
    if (/^0+$/.test(base)) {
      return { error: GENUS_HINT };
    }
    if (base.length > MAX_TOKEN_DIGITS || (r[2] ?? '').length > 6) {
      return { error: 'This number is too large.' };
    }
    const k = r[2] === undefined ? 1 : Number(r[2]);
    if (k > GENUS_MAX_EXP) {
      return { error: `Exponents above ${GENUS_MAX_EXP} are not accepted.` };
    }
    const { exps, rest } = splitSmall(BigInt(base));
    if (rest !== 1n) {
      return { error: bigPrimeText(rest) };
    }
    for (const [p, e] of exps) {
      total.set(p, (total.get(p) ?? 0) + e * k);
    }
  }
  return finish(total, rep);
}

/**
 * A stored genus number as canonical decimal digits (a string, since 3^12 x 5^12 x 7^12 does not fit a JS number), or null.
 * A safe integer of at least 1 is accepted too (an older or hand-written value).
 */
export function cleanGenusN(x: unknown): string | null {
  if (typeof x === 'number') {
    return Number.isSafeInteger(x) && x >= 1 ? String(x) : null;
  }
  if (typeof x !== 'string') {
    return null;
  }
  const s = x.trim();
  return /^[1-9]\d*$/.test(s) && s.length <= GENUS_MAX_DIGITS ? s : null;
}

/** `parseGenusN` for a stored number (digits): the same checks and sentences, counted in `rep` (default the octave). */
export function genusFromN(n: unknown, rep?: Note): GenusParse {
  const s = cleanGenusN(n);
  if (s === null) {
    return { error: GENUS_HINT };
  }
  const { exps, rest } = splitSmall(BigInt(s));
  return rest !== 1n ? { error: bigPrimeText(rest) } : finish(exps, rep);
}

/** "3^2 x 5" (1 for n = 1). */
export function fmtGenus(factors: readonly GenusFactor[]): string {
  return factors.length
    ? factors.map((f) => (f.e === 1 ? `${f.p}` : `${f.p}^${f.e}`)).join(' x ')
    : '1';
}

/** "3^2 x 5, 6 notes": what the lab shows under the box. */
export function genusSummary(g: GenusInfo): string {
  return `${fmtGenus(g.factors)}, ${g.notes} ${g.notes === 1 ? 'note' : 'notes'}`;
}

/**
 * The genus of n: every divisor as an exact ratio (monzo), each folded into the repeat by powers of the repeat (so it lies in
 * [1, repeat)), de-duplicated and sorted ascending. `rep` defaults to the octave. Throws (with the sentence of
 * `parseGenusN`) for a number that is not usable or a genus over the field cap; the caller turns that into a refusal.
 */
export function genusNotes(n: bigint | string | number, rep: Note = OCTAVE): Note[] {
  const g = genusFromN(typeof n === 'bigint' ? n.toString() : n, rep);
  if ('error' in g) {
    throw new Error(g.error);
  }
  const skip = vanishingPrime(rep);
  let monzos: Monzo[] = [{}];
  for (const { p, e } of g.factors) {
    if (p === skip) {
      continue;
    }
    const next: Monzo[] = [];
    for (const m of monzos) {
      for (let j = 0; j <= e; j++) {
        next.push(j ? { ...m, [p]: j } : { ...m });
      }
    }
    monzos = next;
  }
  return dedupeSort(monzos.map((m) => reduceInto(mkNote(m), rep)));
}
