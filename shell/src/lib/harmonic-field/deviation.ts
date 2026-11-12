/** Deviation of notes from a target tuning (tuner strip, "vs JI"): nearest just ratio, reference builders. Pure. */
import { mod } from './intervals';
import { scaleTargets, type ScaleLike } from './scales';

/** Interval names for 0..11 semitones. */
export const INTERVAL_NAMES = [
  'P1',
  'm2',
  'M2',
  'm3',
  'M3',
  'P4',
  'TT',
  'P5',
  'm6',
  'M6',
  'm7',
  'M7',
];

/** Signed one-decimal text: "+13.7", "-0.3", and "0.0" (never "-0.0" or "+0.0"). Rounds first. */
export function fmtSigned(x: number, dp = 1): string {
  const t = x.toFixed(dp);
  const z = Number(t) === 0;
  return z ? (0).toFixed(dp) : (x > 0 ? '+' : '') + t;
}

interface RatioCandidate {
  c: number;
  ratio: string;
  /** Tenney height log2(a*b). */
  h: number;
}

/**
 * Candidate list for nearestRatio, cached per (oddLim, repC): every ratio a/b whose odd limit (odd parts of a and b,
 * the larger) is <= oddLim, at every octave position (x2^k) whose cents lie in [0, repC). Sorted by cents.
 */
const nrCache = new Map<string, RatioCandidate[]>();

function gcd(x: number, y: number): number {
  let a = x;
  let b = y;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function ratioList(L: number, repC: number): RatioCandidate[] {
  const key = `${L}|${repC}`;
  let list = nrCache.get(key);
  if (list) {
    return list;
  }
  list = [];
  for (let a = 1; a <= L; a += 2) {
    for (let b = 1; b <= L; b += 2) {
      if (gcd(a, b) !== 1) {
        continue;
      }
      // scale a/b by powers of 2 until its cents are in [0, 1200); then step up by octaves while below repC
      let n = a;
      let d = b;
      while (n < d) {
        n *= 2;
      }
      while (n >= 2 * d) {
        d *= 2;
      }
      const h = Math.log2(a * b);
      for (let nn = n, dd = d; ; nn *= 2) {
        const c = 1200 * Math.log2(nn / dd);
        if (c >= repC - 1e-9) {
          break;
        }
        list.push({ c, ratio: `${nn}/${dd}`, h });
      }
    }
  }
  list.sort((x, y) => x.c - y.c || x.h - y.h);
  if (nrCache.size > 8) {
    nrCache.clear();
  }
  nrCache.set(key, list);
  return list;
}

export interface NearestRatio {
  ratio: string;
  /** Cents of the ratio, in [0, repC). */
  cents: number;
  /** cents - target, wrapped into [-repC/2, repC/2). */
  err: number;
}

/**
 * Nearest just ratio (odd limit <= oddLim) to `cents`, comparing around the repeat (a note at 1195 c in a 1200 c repeat
 * is 5 c flat of 1/1 at the repeat). Ties (within 1e-9 c) go to the lower Tenney height.
 */
export function nearestRatio(cents: number, oddLim: number, repC: number): NearestRatio {
  const L = Math.max(1, Math.floor(oddLim) || 1);
  const list = ratioList(L, repC);
  const wrap = (d: number): number => mod(d + repC / 2, repC) - repC / 2;
  const x = mod(cents, repC);
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (list[m].c < x) {
      lo = m + 1;
    } else {
      hi = m;
    }
  }
  let best: RatioCandidate | null = null;
  let be = Infinity;
  for (const j of [
    lo - 2,
    lo - 1,
    lo,
    lo + 1,
    lo % list.length,
    (lo - 1 + list.length) % list.length,
  ]) {
    const e = list[j];
    if (!e) {
      continue;
    }
    const er = Math.abs(wrap(x - e.c));
    if (er < be - 1e-9 || (Math.abs(er - be) <= 1e-9 && e.h < (best as RatioCandidate).h)) {
      best = e;
      be = er;
    }
  }
  const b = best as RatioCandidate;
  return { ratio: b.ratio, cents: b.c, err: wrap(x - b.c) };
}

/** A target tuning point above the mode root. */
export interface TargetPoint {
  c: number;
  label: string;
}

/** What a deviation row needs from a subset note (a `rotateSubset` result satisfies it). */
export interface DeviationNote {
  c: number;
  src?: number;
}

export interface Deviation {
  k: number;
  src: number | undefined;
  /** The target's cents. */
  target: number;
  label: string;
  /** note - target (positive = sharp). */
  dev: number;
}

/**
 * Deviation of each subset note from its nearest target. rel = rotateSubset result (cents above the mode root), ref =
 * target cents above the mode root. Distance is measured mod repC, wrapped, so a note at 1190 c can match the target at
 * 0 (dev -10). Two notes may share one target. [] when ref is empty.
 */
export function deviations(
  rel: DeviationNote[],
  ref: TargetPoint[] | null | undefined,
  repC: number
): Deviation[] {
  if (!ref || !ref.length || !(repC > 0)) {
    return [];
  }
  const wrap = (d: number): number => mod(d + repC / 2, repC) - repC / 2;
  return rel.map((n, k) => {
    let bi = 0;
    let bd = Infinity;
    ref.forEach((t, i) => {
      const d = wrap(n.c - t.c);
      if (Math.abs(d) < Math.abs(bd) - 1e-9) {
        bd = d;
        bi = i;
      }
    });
    return { k, src: n.src, target: ref[bi].c, label: ref[bi].label, dev: bd };
  });
}

/** JI reference, per note: nearestRatio of the note's cents above the mode root. Same shape as `deviations`. */
export function deviationsJI(rel: DeviationNote[], oddLim: number, repC: number): Deviation[] {
  return rel.map((n, k) => {
    const r = nearestRatio(n.c, oddLim, repC);
    return { k, src: n.src, target: r.cents, label: r.ratio, dev: r.err };
  });
}

/** Semitones above the mode root below the repeat: interval names for k < 12 (P1 m2 ... M7), then 'k st'. */
export function semitoneTargets(repC: number): TargetPoint[] {
  const out: TargetPoint[] = [];
  for (let k = 0; k * 100 < repC - 1e-6; k++) {
    out.push({ c: k * 100, label: k < 12 ? INTERVAL_NAMES[k] : `${k} st` });
  }
  return out;
}

/** m equal steps of the repeat above the root. Labels: 12 steps of 1200 c use interval names, otherwise "k\m". */
export function edoTargets(mIn: number, repC: number): TargetPoint[] {
  const m = Math.max(1, Math.floor(mIn) || 12);
  const names = m === 12 && Math.abs(repC - 1200) < 0.01;
  return Array.from({ length: m }, (_, k) => ({
    c: (k * repC) / m,
    label: names ? INTERVAL_NAMES[k] : `${k}\\${m}`,
  }));
}

/**
 * scaleTargets with labels (same cents). Label = the swara for a melakarta (S R1 G3 ...), else the JI ratio ('ji') or
 * the 12-EDO interval name ('edo12').
 */
export function scaleTargetsLabeled(
  sc: ScaleLike,
  kind: 'ji' | 'edo12',
  stretchRepC?: number
): TargetPoint[] {
  const c = scaleTargets(sc, kind, stretchRepC);
  return c.map((x, i) => ({
    c: x,
    label: sc.swaras
      ? sc.swaras[i]
      : kind === 'ji'
        ? sc.ji[i]
        : INTERVAL_NAMES[mod(sc.edo12[i], 12)],
  }));
}

/** "vs JI" table cell text: nearest ratio within the odd limit and its error, e.g. "5/4 +13.7" or "3/2 0.0". */
export function vsJI(c: number, oddLim: number, repC: number): string {
  const r = nearestRatio(c, oddLim, repC);
  return `${r.ratio} ${fmtSigned(r.err, 1)}`;
}
