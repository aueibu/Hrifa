import { nearestRatio } from './deviation';
/**
 * Pure geometry and fit maths behind the lab's visualizer views: the 3D lattice, EDO fit, the dissonance curve and the
 * isomorphic keyboard. No React, no DOM, no three.js (the page turns these numbers into pictures).
 */
import { latticeCoords, latticeEdges } from './field';
import { PRIMES, mod } from './intervals';
import { scoreRoughness, type RoughnessOpts } from './scorersMore';
import type { Note } from './types';

/* ------------------------------------------------------------------------------------- 3D and 2D lattice */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/** A prime that is not an axis, with the note's signed exponent of it. */
export interface HiddenPrime {
  prime: number;
  exp: number;
}

/** One stem segment: one hidden prime's part of the stem, from `from` to `to` (length |exp| lattice steps). */
export interface StemSeg<V> {
  prime: number;
  from: V;
  to: V;
}

/**
 * A note on a lattice. `base` is where its coordinates on the chosen axes put it (drawn as a small hollow ring when the
 * note is off-axis). `stems` run from there, one segment per hidden prime in ascending prime order, each chained on the
 * end of the one before; `pos` (the tip) is where the note itself is drawn. A note fully on the axes has no stems and
 * `pos` equals `base`.
 */
export interface LatticePt<V> {
  /** Field index. */
  i: number;
  base: V;
  pos: V;
  stems: StemSeg<V>[];
  hidden: HiddenPrime[];
  /** True when the note has hidden primes (it is drawn on a stem). */
  folded: boolean;
}

export type Lattice3dPoint = LatticePt<Vec3>;

export interface LatticeView<V> {
  /** The primes on the axes (x, y, z for 3D; three directions for 2D; shorter when the field has fewer primes). */
  axes: number[];
  /** Every prime the field uses (the repeat's own prime excluded), ascending: the choices for an axis. */
  available: number[];
  pts: LatticePt<V>[];
  /** [fieldIndexA, fieldIndexB, axisPrime] for every pair one prime step apart (any prime, hidden ones included). */
  edges: [number, number, number][];
  /** Notes with no monzo (EDO steps), left out. */
  skipped: number;
}
export type Lattice3d = LatticeView<Vec3>;
export type Lattice2d = LatticeView<Vec2>;

/** The three default axes: 3, 5, 7 where the field has them, topped up with the next primes it uses. */
export function defaultAxes3d(available: readonly number[]): number[] {
  const out = [3, 5, 7].filter((p) => available.includes(p));
  for (const p of available) {
    if (out.length < 3 && !out.includes(p)) {
      out.push(p);
    }
  }
  return out.slice(0, 3);
}

/** Every way to pick three of the primes, in order of usefulness (the default first), for an axes picker. */
export function axisChoices3d(available: readonly number[]): number[][] {
  const first = defaultAxes3d(available);
  const out: number[][] = [first];
  const n = available.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        const t = [available[a], available[b], available[c]];
        if (t.join() !== first.join()) {
          out.push(t);
        }
      }
    }
  }
  return out;
}

/** One way to pick the three axes, scored against the selected notes. */
export interface AxisRank {
  axes: number[];
  /** Selected notes (with a monzo) that sit on the grid with no stem: every prime they use is one of the axes. */
  onGrid: number;
  /** Selected notes with a monzo (the denominator of the fit). */
  total: number;
  /** Sum over those notes of the exponents' absolute values on the axis primes (how far from 1/1 on the grid). */
  distance: number;
}

/**
 * Every three-prime axes choice ranked by fit to the selected notes: most notes on the grid first; a tie goes to the
 * smaller total exponent distance from 1/1, then to the order of `axisChoices3d` (the 3, 5, 7 default first). Only the
 * selected notes count (`sel` = field indices); notes without a monzo are left out. With no selection every choice
 * scores 0 and the order is `axisChoices3d`'s. The repeat's own prime is not an axis (as in `latticeCoords3d`).
 */
export function rankAxes3d(field: Note[], rep: Note, sel: readonly number[]): AxisRank[] {
  const L = latticeCoords(field, rep, 'prime');
  if (!L || !L.axes || L.axes.length === 0) {
    return [];
  }
  const primes = L.axes;
  const at = new Map(L.pts.map((p) => [p.i, p.x]));
  const rows = sel.flatMap((i) => {
    const x = at.get(i);
    return x ? [x] : [];
  });
  return axisChoices3d(primes)
    .map((axes, order) => {
      const slot = axes.map((p) => primes.indexOf(p));
      let onGrid = 0;
      let distance = 0;
      for (const x of rows) {
        distance += slot.reduce((t, k) => t + Math.abs(x[k]), 0);
        if (x.every((e, k) => e === 0 || slot.includes(k))) {
          onGrid++;
        }
      }
      return { axes, onGrid, total: rows.length, distance, order };
    })
    .sort((a, b) => b.onGrid - a.onGrid || a.distance - b.distance || a.order - b.order)
    .map(({ axes, onGrid, total, distance }) => ({ axes, onGrid, total, distance }));
}

/**
 * The axes a lattice view uses: the picked triple when `ranks` still offers it, otherwise the best-ranked one (Auto, or a
 * stored pick the field no longer has). `picked` says which of the two it is.
 */
export function chooseAxes3d(
  ranks: readonly AxisRank[],
  pick: readonly number[] | null
): { axes: number[] | null; picked: boolean } {
  const hit = pick ? ranks.find((r) => r.axes.join() === pick.join()) : undefined;
  return { axes: (hit ?? ranks[0])?.axes ?? null, picked: hit !== undefined };
}

/** Place of a prime in the table of primes: the key for its stem direction and its colour (stable per prime). */
export function primeSlot(prime: number): number {
  const k = PRIMES.indexOf(prime);
  return k >= 0 ? k : prime;
}

/**
 * Fixed 3D stem direction (a unit vector) for a prime: a golden-angle spiral over the sphere, never along an axis (every
 * component is non-zero) and different for every prime.
 */
export function stemDir3d(prime: number): Vec3 {
  const k = primeSlot(prime);
  const y = 1 - ((k % 8) + 0.5) / 4; // spread along y over (-1, 1), never 0
  const r = Math.sqrt(1 - y * y);
  let a = k * 2.39996 + 5.4;
  while (Math.abs(Math.cos(a)) < 0.3 || Math.abs(Math.sin(a)) < 0.3) {
    a += 0.3; // keep clear of the planes through the axes
  }
  return [r * Math.cos(a), y, r * Math.sin(a)];
}

/** Fixed screen angle in degrees (counter-clockwise from the right) of a prime's 2D stem, at least 10 degrees off the three axis lines. */
export function stemAngle2d(prime: number): number {
  const k = primeSlot(prime);
  let a = (20 + k * 137.5) % 360;
  const off = a % 60;
  if (off < 10 || off > 50) {
    a = (a + 25) % 360; // the axes run at 0, 60 and 120 degrees (and back): stay between them
  }
  return a;
}

/** The three 2D axis directions: 0, 60 and 120 degrees, a little shorter each, so the three never line up. */
const AXES_2D: Vec2[] = [0, 1, 2].map((a): Vec2 => {
  const len = 1 - 0.1 * a;
  const t = (Math.PI * a) / 3;
  return [len * Math.cos(t), len * Math.sin(t)];
});
const AXES_3D: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const stemVec2d = (prime: number): Vec2 => {
  const t = (stemAngle2d(prime) * Math.PI) / 180;
  return [Math.cos(t), Math.sin(t)];
};

function buildLattice<V extends number[]>(
  field: Note[],
  rep: Note,
  axes: readonly number[] | undefined,
  axisVec: readonly V[],
  stemVec: (prime: number) => V
): LatticeView<V> {
  const L = latticeCoords(field, rep, 'prime');
  if (!L || !L.axes) {
    return { axes: [], available: [], pts: [], edges: [], skipped: field.length };
  }
  const available = L.axes;
  const chosen = (axes ?? defaultAxes3d(available))
    .filter((p) => available.includes(p))
    .slice(0, axisVec.length);
  const slot = chosen.map((p) => available.indexOf(p));
  const rest = available.map((p, k) => ({ p, k })).filter(({ k }) => !slot.includes(k));
  const dim = axisVec[0].length;
  const zero = () => Array<number>(dim).fill(0) as V;
  const pts = L.pts.map(({ i, x }): LatticePt<V> => {
    const base = zero();
    slot.forEach((k, a) => {
      for (let d = 0; d < dim; d++) {
        base[d] += x[k] * axisVec[a][d];
      }
    });
    const stems: StemSeg<V>[] = [];
    const hidden: HiddenPrime[] = [];
    let at = base.slice() as V;
    for (const { p, k } of rest) {
      if (x[k] === 0) {
        continue;
      }
      const dir = stemVec(p);
      const to = at.map((v, d) => v + x[k] * dir[d]) as V;
      stems.push({ prime: p, from: at, to });
      hidden.push({ prime: p, exp: x[k] });
      at = to;
    }
    return { i, base, pos: at, stems, hidden, folded: hidden.length > 0 };
  });
  return {
    axes: chosen,
    available,
    pts,
    edges: latticeEdges(L.pts, 'step').map(([a, b, ax]) => [a, b, available[ax]]),
    skipped: L.skipped,
  };
}

/**
 * Positions for the field's notes on three prime axes. A note's coordinate on an axis is its exponent of that prime
 * (3/2 is one step on the 3 axis, 5/4 one on the 5 axis). The repeat's prime (2 for an octave) is folded into the repeat
 * and not drawn. A note that uses a prime that is not an axis is drawn on a stem: its base (coordinates on the axes only)
 * is where a hollow ring goes, and each hidden prime then adds one segment of |exponent| steps along its own fixed
 * direction (reversed for a negative exponent), so the note never lands on a real grid point. Edges join notes exactly
 * one step of any prime apart.
 */
export function latticeCoords3d(field: Note[], rep: Note, axes?: readonly number[]): Lattice3d {
  return buildLattice<Vec3>(field, rep, axes, AXES_3D, stemDir3d);
}

/**
 * The same layout flattened to a plane (y up): three prime axes at 0, 60 and 120 degrees, hidden primes as stems at fixed
 * screen angles (`stemAngle2d`). One lattice step is one unit.
 */
export function latticeCoords2d(field: Note[], rep: Note, axes?: readonly number[]): Lattice2d {
  return buildLattice<Vec2>(field, rep, axes, AXES_2D, stemVec2d);
}

const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
};
/** A hidden prime as a label chip: "11" with its signed exponent raised, e.g. 11 with +1 is 11 plus-one, 11 with -2 is 11 minus-two. */
export function fmtHidden(h: HiddenPrime): string {
  const sign = h.exp < 0 ? '-' : '+';
  return `${h.prime}${[...`${sign}${Math.abs(h.exp)}`].map((c) => SUP[c]).join('')}`;
}

/* --------------------------------------------------------------------------------------------------- EDO fit */
export interface EdoFitRow {
  n: number;
  /** Step size in cents. */
  step: number;
  /** Largest |error| over the notes, in cents. */
  worst: number;
  /** Mean |error| over the notes, in cents. */
  mean: number;
  /** worst / step: 0.5 is as bad as it gets, 0 is exact. */
  worstRel: number;
}

/** Signed error (cents, wrapped) of each note against its nearest step of n equal divisions of the repeat. */
export function edoErrors(cents: readonly number[], repC: number, n: number): number[] {
  const step = repC / n;
  return cents.map((c) => {
    const x = mod(c, repC);
    return x - Math.round(x / step) * step;
  });
}

/** Fit of the notes to every n-EDO from `nMin` to `nMax` (5 to 72 by default): worst and mean |error|. */
export function edoFit(cents: readonly number[], repC: number, nMin = 5, nMax = 72): EdoFitRow[] {
  const rows: EdoFitRow[] = [];
  for (let n = nMin; n <= nMax; n++) {
    const step = repC / n;
    const errs = edoErrors(cents, repC, n).map(Math.abs);
    const worst = errs.length ? Math.max(...errs) : 0;
    const mean = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
    rows.push({ n, step, worst, mean, worstRel: worst / step });
  }
  return rows;
}

/**
 * The few n worth naming. Larger n always fit better in cents, so a plain "lowest error" would just say 72. Instead:
 * keep the n whose worst error beats every smaller n (the "records"; which n are records depends on the notes: a
 * subset of just 5-limit notes gets few, a subset that is already a 12-EDO scale gets 12), then
 * take the `k` of them with the smallest error relative to their own step size. Returned ascending by n.
 */
export function bestEdos(rows: readonly EdoFitRow[], k = 4): number[] {
  const records: EdoFitRow[] = [];
  let low = Infinity;
  for (const r of rows) {
    if (r.worst < low - 1e-9) {
      records.push(r);
      low = r.worst;
    }
  }
  return records
    .sort((a, b) => a.worstRel - b.worstRel || a.n - b.n)
    .slice(0, k)
    .map((r) => r.n)
    .sort((a, b) => a - b);
}

/* -------------------------------------------------------------------------------------- dissonance curve */
export interface DissonanceCurve {
  /** 0, step, 2*step ... up to the repeat (cents). */
  cents: number[];
  /** Roughness between the base tone and a tone that many cents above it. */
  values: number[];
  max: number;
}

/**
 * Sethares roughness of two harmonic tones, one fixed at `baseHz` and one swept from the unison up through the repeat
 * (default 1200 c in 1 c steps). Only the roughness BETWEEN the two tones is counted (each tone's own partials
 * contribute a constant). Defaults are the lab's timbre: 7 partials falling off by 0.88 per partial.
 */
export function dissonanceCurve(
  baseHzIn = 261.63,
  repCIn = 1200,
  stepCIn = 1,
  opts: RoughnessOpts = {}
): DissonanceCurve {
  // guards: anything that is not a finite number above 0 falls back to its default (a zero or NaN step would never end)
  const ok = (x: number) => Number.isFinite(x) && x > 0;
  const baseHz = ok(baseHzIn) ? baseHzIn : 261.63;
  const repC = ok(repCIn) ? repCIn : 1200;
  // at most 20000 points, however small the step
  const stepC = Math.max(ok(stepCIn) ? stepCIn : 1, repC / 20000);
  const cents: number[] = [];
  const values: number[] = [];
  for (let c = 0; c <= repC + 1e-9; c += stepC) {
    const f = baseHz * 2 ** (c / 1200);
    const detail = scoreRoughness([baseHz, f], opts).detail as {
      pairs: { roughness: number }[];
    };
    cents.push(c);
    values.push(detail.pairs[0].roughness);
  }
  return { cents, values, max: Math.max(...values) };
}

export interface CurveDip {
  /** Index into the curve. */
  idx: number;
  c: number;
  d: number;
  /** Nearest simple ratio (odd limit 15), e.g. "5/4". */
  ratio: string;
}

/**
 * Local minima of the curve that stand out: lower than both neighbours and with a rise of at least `prominence`
 * (a share of the curve's range, 2% by default) before the curve falls below them again on each side. The ends count
 * as minima when they are low (the unison and the octave).
 */
export function curveMinima(curve: DissonanceCurve, prominence = 0.02, oddLimit = 15): CurveDip[] {
  const v = curve.values;
  const range = Math.max(...v) - Math.min(...v);
  const need = prominence * range;
  const out: CurveDip[] = [];
  for (let i = 0; i < v.length; i++) {
    const left = i === 0 ? Infinity : v[i - 1];
    const right = i === v.length - 1 ? Infinity : v[i + 1];
    if (!(v[i] < left && v[i] <= right)) {
      continue;
    }
    let lm = v[i];
    for (let j = i - 1; j >= 0 && v[j] >= v[i]; j--) {
      lm = Math.max(lm, v[j]);
    }
    let rm = v[i];
    for (let j = i + 1; j < v.length && v[j] >= v[i]; j++) {
      rm = Math.max(rm, v[j]);
    }
    const rise = i === 0 ? rm - v[i] : i === v.length - 1 ? lm - v[i] : Math.min(lm, rm) - v[i];
    if (rise > 0 && rise >= need) {
      const c = curve.cents[i];
      const repC = curve.cents[curve.cents.length - 1];
      out.push({ idx: i, c, d: v[i], ratio: nearestRatio(c, oddLimit, repC).ratio });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------- isomorphic keyboard */
export interface IsoCell {
  col: number;
  /** Row from the bottom (0). */
  row: number;
  /** Axial hex coordinates: q steps of g1 (right), r steps of g2 (up-right) from the origin cell. */
  q: number;
  r: number;
  /** Pitch above 1/1 in cents, not reduced (so a row up of 2/1 reads 1200 higher). */
  pitch: number;
  /** Field index of the nearest field note within the tolerance, or null. */
  note: number | null;
  /** Signed cents from that note (pitch - note), 0 when none. */
  err: number;
}

export interface IsoOpts {
  /** First generator in cents: one hex to the right. */
  g1: number;
  /** Second generator in cents: one hex up and to the right. */
  g2: number;
  cols?: number;
  rows?: number;
  /** Cents within which a hex shows a field note. */
  tol?: number;
  /** The cell holding 1/1, as [col, row] (default [3, 1]). */
  origin?: [number, number];
}

/** Axial q for an offset-layout cell: odd rows sit half a hex right, so q = col - floor(row / 2). */
export const isoQ = (col: number, row: number): number => col - Math.floor(row / 2);

/** Pitch of the hex at axial (q, r) relative to the origin hex (qo, ro): (q - qo) * g1 + (r - ro) * g2. */
export const isoPitch = (q: number, r: number, g1: number, g2: number, qo = 0, ro = 0): number =>
  (q - qo) * g1 + (r - ro) * g2;

/** Nearest field note to a pitch (circular distance around the repeat), within `tol`. */
export function nearestFieldNote(
  pitch: number,
  fieldCents: readonly number[],
  repC: number,
  tol: number
): { note: number | null; err: number } {
  const x = mod(pitch, repC);
  let best = -1;
  let bestErr = Infinity;
  fieldCents.forEach((c, i) => {
    const e = mod(x - c + repC / 2, repC) - repC / 2;
    if (Math.abs(e) < Math.abs(bestErr) - 1e-9) {
      best = i;
      bestErr = e;
    }
  });
  return best >= 0 && Math.abs(bestErr) <= tol + 1e-9
    ? { note: best, err: bestErr }
    : { note: null, err: 0 };
}

/**
 * The hex grid: `rows` x `cols` cells (6 x 10 by default), row 0 at the bottom. Moving right is g1, moving up and to
 * the right is g2 (so up and to the left is g2 - g1). Every cell holds its pitch and the field note nearest to it
 * within the tolerance (null: blank).
 */
export function isoGrid(fieldCents: readonly number[], repC: number, o: IsoOpts): IsoCell[] {
  const { g1, g2, cols = 10, rows = 6, tol = 20, origin = [3, 1] } = o;
  const qo = isoQ(origin[0], origin[1]);
  const out: IsoCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const q = isoQ(col, row);
      const pitch = isoPitch(q, row, g1, g2, qo, origin[1]);
      out.push({ col, row, q, r: row, pitch, ...nearestFieldNote(pitch, fieldCents, repC, tol) });
    }
  }
  return out;
}
