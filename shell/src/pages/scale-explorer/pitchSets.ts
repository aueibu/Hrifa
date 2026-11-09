/**
 * Pitch-class-set math for the Scale Explorer: modes, prime forms, interval vectors, fifths brightness,
 * semitone chaining, symmetry, and the all-sets catalog. Ported from the original single-file artifact
 * without behavior changes; the only structural change is that selection is passed in explicitly (a sorted
 * number[] of pitch classes) instead of living in module globals.
 */

import {
  findForteEntry,
  forteCatalog,
  intervalClassVector,
} from '../composition-workbench/forteCatalog';

export type PrimeConvention = 'rahn' | 'forte';

/** Position on the line of fifths for each interval (semitones) above the root. The tritone (6) is resolved per mode. */
export const FIF = [0, -5, 2, -3, 4, -1, 0, 1, -4, 3, -2, 5];

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const byValue = (a: number, b: number) => a - b;

export interface Mode {
  /** 1-based rotation number of the sorted set (before any inversion). */
  k: number;
  /** Absolute pitch classes, starting on the mode's root. */
  abs: number[];
  /** The same notes with the root set to 0. */
  z: number[];
  /** Semitone distance from each note to the next (the last wraps to the octave). */
  d: number[];
  /** For each note, the note a perfect fifth above if present, else null. */
  fm: (number | null)[];
  p5root: boolean;
  /** "note_distance" labels. */
  dl: string[];
  /** Fifths-brightness contribution of each note. */
  f: number[];
  /** Fifths brightness: the sum of `f`. */
  fs: number;
  ttTie: boolean;
  /** Merged duplicates: every rotation number / start note / inversion source that gave the same z. */
  ks: number[];
  starts: number[];
  srcs: number[];
  src?: number;
}

export function buildMode(k: number, abs: number[]): Mode {
  const n = abs.length;
  const z = abs.map((x) => mod12(x - abs[0]));
  const d = z.map((x, i) => (i < n - 1 ? z[i + 1] : 12) - x);
  const has7 = z.includes(7);
  // The tritone sits on either end of the line of fifths (+6 as a sharp 4th, -6 as a flat 5th). It goes to the end
  // that keeps the chain of the other notes shortest, like picking a prime form; a tie counts as 0.
  let tt = 0;
  let ttTie = false;
  if (z.includes(6)) {
    const others = z.filter((x) => x !== 6).map((x) => FIF[x]);
    const lo = Math.min(...others);
    const hi = Math.max(...others);
    const up = Math.max(hi, 6) - lo;
    const dn = hi - Math.min(lo, -6);
    tt = up < dn ? 6 : dn < up ? -6 : 0;
    ttTie = up === dn;
  }
  const f = z.map((x) => (x === 6 ? tt : FIF[x]));
  const fs = f.reduce((a, v) => a + v, 0);
  const fm = z.map((x) => {
    const y = (x + 7) % 12;
    return z.includes(y) ? y : null;
  });
  return {
    k,
    abs,
    z,
    d,
    fm,
    p5root: has7,
    dl: z.map((x, i) => `${x}_${d[i]}`),
    f,
    fs,
    ttTie,
    ks: [k],
    starts: [abs[0]],
    srcs: [],
  };
}

/** Interval vector; shared with the Composition Workbench's Forte catalog so both agree. */
export const icvOf = (pcs: number[]): number[] => intervalClassVector(pcs);

export function icvText(v: number[]): string {
  return `<${v.join(Math.max(...v) > 9 ? ' ' : '')}>`;
}

// ---------- prime form helpers ----------

/** Order two zero-based rotations of equal length: smaller last interval first, then ties from the left (Rahn) or right (Forte). */
export function compareRotations(a: number[], b: number[], conv: PrimeConvention): number {
  const n = a.length;
  if (a[n - 1] !== b[n - 1]) {
    return a[n - 1] - b[n - 1];
  }
  if (conv === 'forte') {
    for (let i = n - 2; i >= 1; i--) {
      if (a[i] !== b[i]) {
        return a[i] - b[i];
      }
    }
  } else {
    for (let i = 1; i < n - 1; i++) {
      if (a[i] !== b[i]) {
        return a[i] - b[i];
      }
    }
  }
  return 0;
}

/** The most compact rotation of a set, starting on 0. */
export function canonRot(pcs: number[], conv: PrimeConvention = 'rahn'): number[] {
  const n = pcs.length;
  let best: number[] | null = null;
  for (let k = 0; k < n; k++) {
    const z: number[] = [];
    for (let i = 0; i < n; i++) {
      z.push(mod12(pcs[(k + i) % n] - pcs[k]));
    }
    if (!best || compareRotations(z, best, conv) < 0) {
      best = z;
    }
  }
  return best ?? [];
}

export function mirrorOf(pcs: number[]): number[] {
  return pcs.map((p) => (12 - p) % 12).sort(byValue);
}

export const keyOf = (z: number[]) => z.join(' ');

export function pickRep(pcs: number[], merge: boolean, conv: PrimeConvention = 'rahn') {
  const a = canonRot(pcs, conv);
  const b = canonRot(mirrorOf(a), conv);
  return {
    rep: merge && compareRotations(b, a, conv) < 0 ? b : a,
    mirror: b,
    self: keyOf(a) === keyOf(b),
    a,
  };
}

// ---------- per-set analysis (catalog rows) ----------

export interface SetAnalysis {
  z: number[];
  n: number;
  icv: number[];
  hem: number;
  coh: number;
  ratio: number;
  run: number;
  modes: number;
  fr: number;
  p5: number;
  chain: number;
  rp5: number;
}

/** Length of the longest chain of consecutive fifths (7 semitones) among the set's notes. */
export function longestFifthChain(set: ReadonlySet<number>, n: number): number {
  if (n === 12) {
    return 12;
  }
  const flags: boolean[] = [];
  for (let x = 0; x < 12; x++) {
    flags.push(set.has((7 * x) % 12));
  }
  let chain = 0;
  for (let x = 0; x < 12; x++) {
    if (flags[x] && !flags[(x + 11) % 12]) {
      let cl = 1;
      while (flags[(x + cl) % 12]) {
        cl++;
      }
      chain = Math.max(chain, cl);
    }
  }
  return chain;
}

export function analyze(z: number[]): SetAnalysis {
  const n = z.length;
  const set = new Set(z);
  let hem = 0;
  let coh = 0;
  for (let x = 0; x < 12; x++) {
    if (set.has(x) && set.has((x + 1) % 12)) {
      hem++;
    }
    if (set.has(x) && set.has((x + 1) % 12) && set.has((x + 2) % 12)) {
      coh++;
    }
  }
  let run = 1;
  if (n === 12) {
    run = 12;
  } else {
    for (let x = 0; x < 12; x++) {
      if (set.has(x) && !set.has((x + 11) % 12)) {
        let len = 1;
        while (set.has((x + len) % 12)) {
          len++;
        }
        run = Math.max(run, len);
      }
    }
  }
  const seen = new Set<string>();
  const fs: number[] = [];
  let rp5 = 0;
  for (let k = 0; k < n; k++) {
    const abs: number[] = [];
    for (let i = 0; i < n; i++) {
      abs.push(z[(k + i) % n]);
    }
    const m = buildMode(k + 1, abs);
    const key = m.z.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      fs.push(m.fs);
      if (m.p5root) {
        rp5++;
      }
    }
  }
  const p5 = z.filter((p) => set.has((p + 7) % 12)).length;
  return {
    z,
    n,
    icv: icvOf(z),
    hem,
    coh,
    ratio: hem ? coh / hem : 0,
    run,
    modes: fs.length,
    fr: Math.max(...fs) - Math.min(...fs),
    p5,
    chain: longestFifthChain(set, n),
    rp5,
  };
}

// ---------- range vs expected ----------

interface RangeFitEntry {
  sl: number;
  ic: number;
  sd: number;
  N: number;
  my: number;
  sdy: number;
}

let rangeFitCache: Record<number, RangeFitEntry> | null = null;

/** For each set size, fit fifths range against P5 count over every set class of that size. */
export function rangeFit(): Record<number, RangeFitEntry> {
  if (rangeFitCache) {
    return rangeFitCache;
  }
  const by: Record<number, [number, number][]> = {};
  const seen = new Set<string>();
  for (let mask = 1; mask < 4096; mask++) {
    const pcs: number[] = [];
    for (let i = 0; i < 12; i++) {
      if ((mask >> i) & 1) {
        pcs.push(i);
      }
    }
    if (pcs.length < 3 || pcs.length > 10) {
      continue;
    }
    const z = canonRot(pcs, 'rahn');
    const key = z.join(',');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const a = analyze(z);
    (by[z.length] ??= []).push([a.p5, a.fr]);
  }
  const out: Record<number, RangeFitEntry> = {};
  Object.entries(by).forEach(([n, d]) => {
    const N = d.length;
    let mx = 0;
    let my = 0;
    d.forEach((r) => {
      mx += r[0];
      my += r[1];
    });
    mx /= N;
    my /= N;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    d.forEach((r) => {
      sxy += (r[0] - mx) * (r[1] - my);
      sxx += (r[0] - mx) * (r[0] - mx);
      syy += (r[1] - my) * (r[1] - my);
    });
    const sl = sxx ? sxy / sxx : 0;
    const ic = my - sl * mx;
    let sse = 0;
    d.forEach((r) => {
      const e = r[1] - (ic + sl * r[0]);
      sse += e * e;
    });
    out[Number(n)] = {
      sl,
      ic,
      sd: Math.sqrt(sse / Math.max(1, N - 2)),
      N,
      my,
      sdy: Math.sqrt(syy / Math.max(1, N - 1)),
    };
  });
  rangeFitCache = out;
  return out;
}

export interface RangeVsExpected {
  /** z-score of the fifths range against the range expected for this P5 count. */
  z: number;
  /** z-score of the fifths range among all sets of this size. */
  zs: number;
  avg: number;
  fr: number;
  exp: number;
  p5: number;
  n: number;
}

export function rangeVsExpectedFrom(
  a: Pick<SetAnalysis, 'n' | 'p5' | 'fr'>
): RangeVsExpected | null {
  const f = rangeFit()[a.n];
  if (!f || !f.sd) {
    return null;
  }
  const exp = f.ic + f.sl * a.p5;
  return {
    z: (a.fr - exp) / f.sd,
    zs: f.sdy ? (a.fr - f.my) / f.sdy : 0,
    avg: f.my,
    fr: a.fr,
    exp,
    p5: a.p5,
    n: a.n,
  };
}

export const rangeVsExpected = (pcs: number[]) =>
  rangeVsExpectedFrom(analyze(canonRot(pcs, 'rahn')));

// ---------- catalog ----------

export interface CatalogRow extends SetAnalysis {
  key: string;
  self: boolean;
  rve: number | null;
  zsz: number | null;
  mirrorKey: string;
  /** Forte number of the set class (e.g. "7-35"), from the shared Forte catalog. */
  forte: string | null;
  /** Position in the Forte catalog, for sorting in Forte's own order. */
  forteOrder: number;
}

const catalogCache = new Map<string, CatalogRow[]>();

/** Every set class of n notes (by transposition, or with mirror images merged). */
export function catalog(n: number, merge: boolean, conv: PrimeConvention): CatalogRow[] {
  const cacheKey = `${n}:${merge}:${conv}`;
  const cached = catalogCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const seen = new Set<string>();
  const rows: CatalogRow[] = [];
  for (let mask = 1; mask < 4096; mask += 2) {
    const pcs: number[] = [];
    for (let b = 0; b < 12; b++) {
      if (mask & (1 << b)) {
        pcs.push(b);
      }
    }
    if (pcs.length !== n) {
      continue;
    }
    const r = pickRep(pcs, merge, conv);
    const key = keyOf(r.rep);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const row = analyze(r.rep);
    const rv = rangeVsExpectedFrom(row);
    const forte = findForteEntry(r.rep);
    rows.push({
      ...row,
      key,
      self: r.self,
      rve: rv ? rv.z : null,
      zsz: rv ? rv.zs : null,
      mirrorKey: keyOf(key === keyOf(r.a) ? r.mirror : r.a),
      forte: forte?.forteNumber ?? null,
      forteOrder: forte ? forteCatalog.indexOf(forte) : -1,
    });
  }
  catalogCache.set(cacheKey, rows);
  return rows;
}

export function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) {
    r = (r * (n - k + i)) / i;
  }
  return Math.round(r);
}

// ---------- modes of a selection ----------

/** 'off', 'root' (each mode inverted around its own root), or 'I<q>' (the whole set inverted around axis q). */
export type InversionMode = 'off' | 'root' | `I${number}`;

export function fixedAxis(inv: InversionMode): number | null {
  return /^I\d+$/.test(inv) ? Number(inv.slice(1)) : null;
}

export interface ModeSet {
  total: number;
  list: Mode[];
  /** Pitch classes of the inverted base set (when inverting around a fixed axis). */
  inv: Set<number>;
  base: number[];
  fixed: number | null;
}

/** All distinct modes of the selected set, merging rotations that give the same pattern. */
export function modesOf(s: number[], invMode: InversionMode): ModeSet {
  const n = s.length;
  const fixed = fixedAxis(invMode);
  const inv = new Set<number>();
  let base = s;
  if (fixed !== null) {
    base = s.map((p) => mod12(fixed - p)).sort(byValue);
    base.forEach((p) => inv.add(p));
  }
  const raw = base.map((_, k) => {
    const abs: number[] = [];
    for (let i = 0; i < n; i++) {
      abs.push(base[(k + i) % n]);
    }
    let m = buildMode(k + 1, abs);
    if (invMode === 'root') {
      const z2 = m.z.map((x) => (12 - x) % 12).sort(byValue);
      m = buildMode(
        k + 1,
        z2.map((x) => (abs[0] + x) % 12)
      );
    }
    if (fixed !== null) {
      m.src = s.indexOf(mod12(fixed - abs[0])) + 1;
    }
    return m;
  });
  const seen = new Map<string, number>();
  const list: Mode[] = [];
  raw.forEach((m) => {
    const key = m.z.join(',');
    const at = seen.get(key);
    if (at !== undefined) {
      const g = list[at];
      g.ks.push(m.k);
      g.starts.push(m.abs[0]);
      if (m.src) {
        g.srcs.push(m.src);
      }
    } else {
      seen.set(key, list.length);
      m.ks = [m.k];
      m.starts = [m.abs[0]];
      m.srcs = m.src ? [m.src] : [];
      list.push(m);
    }
  });
  return { total: raw.length, list, inv, base, fixed };
}

export function invSymmetries(s: number[]): number[] {
  const set = new Set(s);
  const out: number[] = [];
  for (let q = 0; q < 12; q++) {
    if (s.every((p) => set.has(mod12(q - p)))) {
      out.push(q);
    }
  }
  return out;
}

export function symmetries(s: number[]): number[] {
  const set = new Set(s);
  const out: number[] = [];
  for (let k = 1; k < 12; k++) {
    if (s.every((p) => set.has((p + k) % 12))) {
      out.push(k);
    }
  }
  return out;
}

export interface SemitoneStats {
  hem: number;
  coh: number;
  iso: number;
  chain: number;
  /** Each adjacent semitone pair: `x` is the lower pitch class, `ch` whether it is chained to another semitone. */
  edges: { x: number; ch: boolean }[];
  /** Lengths of runs of consecutive pitch classes (>= 2), longest first. */
  runs: number[];
}

export function semitoneStats(s: number[]): SemitoneStats {
  const set = new Set(s);
  let hem = 0;
  let coh = 0;
  let iso = 0;
  let chain = 0;
  const edges: { x: number; ch: boolean }[] = [];
  const runs: number[] = [];
  let all = true;
  for (let x = 0; x < 12; x++) {
    if (!set.has(x)) {
      all = false;
    }
    if (set.has(x) && set.has((x + 1) % 12)) {
      hem++;
      const ch = set.has((x + 11) % 12) || set.has((x + 2) % 12);
      if (ch) {
        chain++;
      } else {
        iso++;
      }
      edges.push({ x, ch });
    }
    if (set.has(x) && set.has((x + 1) % 12) && set.has((x + 2) % 12)) {
      coh++;
    }
  }
  if (all) {
    runs.push(12);
  } else {
    for (let x = 0; x < 12; x++) {
      if (set.has(x) && !set.has((x + 11) % 12)) {
        let len = 1;
        while (set.has((x + len) % 12)) {
          len++;
        }
        if (len >= 2) {
          runs.push(len);
        }
      }
    }
  }
  runs.sort((a, b) => b - a);
  return { hem, coh, iso, chain, edges, runs };
}

// ---------- modal neighbours ----------

export interface LinkInfo {
  c: number;
  rem: number[];
  add: number[];
  d: number;
  one: boolean;
}

/** How two modes (same root) differ: common tones, notes removed, notes added. */
export function linkInfo(a: Mode, b: Mode): LinkInfo {
  const sb = new Set(b.z);
  const sa = new Set(a.z);
  let c = 0;
  const rem: number[] = [];
  const add: number[] = [];
  a.z.forEach((x) => {
    if (sb.has(x)) {
      c++;
    } else {
      rem.push(x);
    }
  });
  b.z.forEach((x) => {
    if (!sa.has(x)) {
      add.push(x);
    }
  });
  return { c, rem, add, d: rem.length, one: rem.length === 1 && add.length === 1 };
}

export function relText(li: LinkInfo): string {
  const r = [...li.rem].sort(byValue);
  const a = [...li.add].sort(byValue);
  return r.map((x, i) => `${x}→${a[i]}`).join(', ');
}

export interface NeighbourGroup {
  d: number;
  items: { o: Mode; rel: string }[];
}

/** Neighbours of a mode grouped by number of notes away, up to the chosen distance. */
export function neighboursOf(m: Mode, view: Mode[], pathMax: number): NeighbourGroup[] {
  const maxD = Math.min(6, m.z.length - 1);
  const lim = Math.max(1, Math.min(pathMax, maxD));
  const groups: NeighbourGroup[] = [];
  for (let d = 1; d <= lim; d++) {
    groups.push({ d, items: [] });
  }
  view.forEach((o) => {
    if (o === m) {
      return;
    }
    const li = linkInfo(m, o);
    if (li.d >= 1 && li.d <= lim) {
      groups[li.d - 1].items.push({ o, rel: relText(li) });
    }
  });
  return groups;
}

// ---------- whole-set statistics for the summary ----------

export interface SetStats {
  s: number[];
  semis: SemitoneStats;
  rotSym: number[];
  invSym: number[];
  density: number;
  withP5: number[];
  noP5: number[];
  chainLen: number;
  rve: RangeVsExpected | null;
  /** Other set classes (4-8 notes) sharing this interval vector, as prime-form keys. */
  zRelated: string[];
}

export function setStats(s: number[], conv: PrimeConvention = 'rahn'): SetStats {
  const set = new Set(s);
  const semis = semitoneStats(s);
  const withP5 = s.filter((p) => set.has((p + 7) % 12));
  const noP5 = s.filter((p) => !set.has((p + 7) % 12));
  let chainLen = 0;
  const flags: boolean[] = [];
  for (let ci = 0; ci < 12; ci++) {
    flags.push(set.has((7 * ci) % 12));
  }
  if (withP5.length === 0 || (noP5.length === 0 && s.length === 12)) {
    chainLen = s.length === 12 ? 12 : 1;
  } else {
    for (let c0 = 0; c0 < 12; c0++) {
      if (flags[c0] && !flags[(c0 + 11) % 12]) {
        let cl = 1;
        while (flags[(c0 + cl) % 12]) {
          cl++;
        }
        chainLen = Math.max(chainLen, cl);
      }
    }
  }
  let zRelated: string[] = [];
  if (s.length >= 4 && s.length <= 8) {
    const mykey = keyOf(pickRep(s, true, conv).rep);
    const myv = icvText(icvOf(s));
    zRelated = catalog(s.length, true, conv)
      .filter((r) => r.key !== mykey && icvText(r.icv) === myv)
      .map((r) => r.key);
  }
  return {
    s,
    semis,
    rotSym: symmetries(s),
    invSym: invSymmetries(s),
    density: semis.hem / s.length,
    withP5,
    noP5,
    chainLen,
    rve: rangeVsExpected(s),
    zRelated,
  };
}
