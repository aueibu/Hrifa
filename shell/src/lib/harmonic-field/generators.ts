/** Field generators. Each returns unreduced notes; `buildField` (field.ts) reduces, filters and sorts them. Pure. */
import { EPS, MAXN, centsNote, mulNotes, parseInterval, ratioNote, reduceInto } from './intervals';
import type { AdditiveAxis, Note, OrthoplexAxis } from './types';

/** Harmonic segment (Infinitone FUN_180466800): k/H for k = H ... while k/H < repeat. Subharmonic: H/k reduced. */
export function genHarmonic(H: number, rep: Note, sub: boolean): Note[] {
  const out: Note[] = [];
  for (let k = H; out.length <= MAXN; k++) {
    const n = ratioNote(k, H);
    if (n.c >= rep.c - 1e-9) {
      break;
    }
    out.push(sub ? reduceInto(ratioNote(H, k), rep) : n);
  }
  return out;
}

/** Equal division of the repeat. Kept irrational (cents); Infinitone stores Stern-Brocot approximations instead. */
export function genEdo(N: number, rep: Note): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < N; i++) {
    out.push(centsNote((i * rep.c) / N));
  }
  return out;
}

/** Box lattice (N-Orthotope): axis i spans g_i^(j - ctr_i), j = 0 ... n_i-1. Records exponents in `x`. */
export function genAdditive(axes: AdditiveAxis[]): Note[] {
  let notes: Note[] = [{ m: {}, c: 0, x: [] }];
  let total = 1;
  for (const ax of axes) {
    total *= ax.n;
    if (total > MAXN) {
      throw new Error(`Lattice exceeds ${MAXN} notes`);
    }
    const next: Note[] = [];
    for (const base of notes) {
      for (let j = 0; j < ax.n; j++) {
        next.push({
          ...mulNotes(base, ax.g, j - ax.ctr),
          x: [...(base.x as number[]), j - ax.ctr],
        });
      }
    }
    notes = next;
  }
  return notes;
}

/** Diamond (N-Orthoplex): every x in Z^d with sum|x_i| <= D (x_i >= 0 when one-directional). */
export function genOrthoplex(axes: OrthoplexAxis[], D: number, bidir: boolean): Note[] {
  const out: Note[] = [];
  const rec = (i: number, left: number, acc: Note): void => {
    if (out.length > MAXN) {
      throw new Error(`Diamond exceeds ${MAXN} notes`);
    }
    if (i === axes.length) {
      out.push(acc);
      return;
    }
    for (let e = bidir ? -left : 0; e <= left; e++) {
      rec(i + 1, left - Math.abs(e), {
        ...mulNotes(acc, axes[i].g, e),
        x: [...(acc.x as number[]), e],
      });
    }
  };
  rec(0, D, { m: {}, c: 0, x: [] });
  return out;
}

/**
 * Combination product set: all k-element products of the factors, normalised so the lowest product is 1/1.
 * Each note records the factor indices it uses in `f` (sorted).
 */
export function genCps(factors: Note[], k: number): Note[] {
  const out: Note[] = [];
  const rec = (start: number, left: number, acc: Note): void => {
    if (left === 0) {
      out.push(acc);
      return;
    }
    for (let i = start; i < factors.length; i++) {
      rec(i + 1, left - 1, { ...mulNotes(acc, factors[i]), f: [...(acc.f as number[]), i] });
    }
  };
  rec(0, k, { m: {}, c: 0, f: [] });
  if (!out.length) {
    throw new Error('k larger than number of factors');
  }
  const low = out.reduce((a, b) => (a.c <= b.c ? a : b));
  return out.map((n) => ({ ...mulNotes(n, low, -1), f: n.f }));
}

/** Custom interval text: 1/1 is always added; an entry equal to the repeat is dropped. */
export function parseCustom(txt: string, rep: Note): Note[] {
  const toks = txt.split(/[\s,]+/).filter(Boolean);
  const out: Note[] = [{ m: {}, c: 0 }];
  for (const t of toks) {
    const n = parseInterval(t);
    if (!n) {
      throw new Error(`Cannot read "${t}"`);
    }
    if (Math.abs(n.c - rep.c) > EPS) {
      out.push(n);
    }
  }
  return out;
}
