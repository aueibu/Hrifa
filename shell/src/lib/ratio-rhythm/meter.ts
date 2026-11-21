/**
 * Meter (Canon 4): divisive and additive hierarchies, pulse weights and syncopation
 * (Longuet-Higgins and Lee).
 *
 * Pitch-domain counterpart: the tonal hierarchy; the order of the factors is the choice of prime
 * limit (binary-first favors 2-power positions, ternary-first favors 1/9). The meter picks a side
 * of a comma the way a temperament does.
 */

/** A meter: the weight of every pulse of one cycle (pulse weights, slot 0 the downbeat). */
export interface Hierarchy {
  L: number;
  /** weights[p] for slot p; the downbeat is the largest. */
  weights: number[];
  /** Largest weight (the downbeat's). */
  top: number;
  /** Text name, such as `2×2×2×3×3` (a product) or `5+5+3` (a grouping). */
  name: string;
}

/** Prime factors of n in ascending order (n >= 2). */
export function primeFactors(n: number): number[] {
  const f: number[] = [];
  let x = n;
  for (let p = 2; p * p <= x; p++) {
    while (x % p === 0) {
      f.push(p);
      x /= p;
    }
  }
  if (x > 1) {
    f.push(x);
  }
  return f;
}

/**
 * Divisive hierarchy: factor L into levels in the given order; a pulse's weight is the number of
 * levels that start on it (the level sizes are L, L/f1, L/(f1 f2), ..., 1). The downbeat starts
 * every level.
 */
export function divisiveHierarchy(L: number, order: number[]): Hierarchy {
  const sizes = [L];
  let z = L;
  for (const f of order) {
    z /= f;
    sizes.push(z);
  }
  const top = sizes.length;
  const weights: number[] = [];
  for (let p = 0; p < L; p++) {
    if (p === 0) {
      weights.push(top);
      continue;
    }
    let c = 0;
    for (const s of sizes) {
      if (p % s === 0) {
        c++;
      }
    }
    weights.push(c);
  }
  return { L, weights, top, name: order.join('×') };
}

/** Additive hierarchy from a flat grouping: a group start weighs 2, every other pulse 1. */
export function additiveHierarchy(groups: number[], name?: string): Hierarchy {
  const L = groups.reduce((a, b) => a + b, 0);
  const weights: number[] = new Array(L).fill(1);
  let s = 0;
  for (const g of groups) {
    weights[s] = 2;
    s += g;
  }
  return { L, weights, top: 2, name: name ?? groups.join('+') };
}

export interface Syncopation {
  total: number;
  /** Score of each onset, in order. */
  per: number[];
  /** Weight at each onset. */
  weights: number[];
}

/**
 * Longuet-Higgins and Lee syncopation: an onset scores the weight difference when a stronger
 * pulse falls in the silence before the next onset (cyclic: the last onset looks up to the first
 * onset of the next cycle).
 */
export function syncopation(h: Hierarchy, onsets: number[]): Syncopation {
  const { L, weights } = h;
  const A = [...onsets].sort((a, b) => a - b);
  const per: number[] = [];
  let total = 0;
  A.forEach((a, i) => {
    const b = i + 1 < A.length ? A[i + 1] : A[0] + L;
    let mx = -1;
    for (let r = a + 1; r < b; r++) {
      mx = Math.max(mx, weights[r % L]);
    }
    const s = Math.max(0, mx - weights[a]);
    total += s;
    per.push(s);
  });
  return { total, per, weights: A.map((a) => weights[a]) };
}

/** True when the pulse is on the finest level only (weight 1): the weak side of a comma. */
export function isWeakPulse(h: Hierarchy, slot: number): boolean {
  return h.weights[((slot % h.L) + h.L) % h.L] === 1;
}

/** Distinct orderings of a multiset of factors (ascending order first), up to `cap`. */
export function uniquePermutations(arr: number[], cap = 100000): number[][] {
  const res: number[][] = [];
  const cnt = new Map<number, number>();
  for (const a of arr) {
    cnt.set(a, (cnt.get(a) ?? 0) + 1);
  }
  const keys = [...cnt.keys()].sort((a, b) => a - b);
  const cur: number[] = [];
  const rec = (): void => {
    if (res.length >= cap) {
      return;
    }
    if (cur.length === arr.length) {
      res.push(cur.slice());
      return;
    }
    for (const k of keys) {
      if ((cnt.get(k) ?? 0) > 0) {
        cnt.set(k, (cnt.get(k) ?? 0) - 1);
        cur.push(k);
        rec();
        cur.pop();
        cnt.set(k, (cnt.get(k) ?? 0) + 1);
      }
    }
  };
  rec();
  return res;
}

/** Level sizes of a divisive meter: L, L/f1, L/(f1 f2), ..., 1 (each divides the one before). */
function levelSizes(L: number, order: number[]): number[] {
  const sizes = [L];
  let z = L;
  for (const f of order) {
    z /= f;
    sizes.push(z);
  }
  return sizes;
}

/**
 * Syncopation of a divisive meter from its level sizes alone, in O(levels) per onset and with no
 * per-slot array. Same numbers as `syncopation(divisiveHierarchy(L, order), onsets)`.
 *
 * The levels divide one another, so a slot's weight is the number of levels from the coarsest
 * one that divides it down to the finest; the strongest slot in a silence is therefore the first
 * multiple of the coarsest level that falls inside it.
 */
export function divisiveSyncopation(L: number, sizes: number[], onsets: number[]): Syncopation {
  const A = [...onsets].sort((a, b) => a - b);
  const levels = sizes.length;
  const weightAt = (p: number): number => {
    let c = 0;
    for (const s of sizes) {
      if (p % s === 0) {
        c++;
      }
    }
    return c;
  };
  const per: number[] = [];
  const ws: number[] = [];
  let total = 0;
  A.forEach((a, i) => {
    const b = i + 1 < A.length ? A[i + 1] : A[0] + L;
    const wa = weightAt(a);
    let mx = -1;
    for (let j = 0; j < levels; j++) {
      const m = (Math.floor(a / sizes[j]) + 1) * sizes[j];
      if (m < b) {
        mx = levels - j;
        break;
      }
    }
    const s = Math.max(0, mx - wa);
    total += s;
    per.push(s);
    ws.push(wa);
  });
  return { total, per, weights: ws };
}

export interface MeterOrdering {
  order: number[];
  /** `2×2×2×3×3` */
  text: string;
  sync: Syncopation;
  /** Built on demand for one ordering (a full weights array of L slots; do not call it for all orderings). */
  readonly hierarchy: Hierarchy;
}

/**
 * Every ordering of the prime factors of L as a divisive meter, with its syncopation on the
 * onsets. Sorted by score. Scoring uses the level sizes only (no per-slot arrays are kept), so a
 * ring of 259,350 with 2,520 orderings is fast; `hierarchy` builds the weights on demand.
 */
export function meterOrderings(L: number, onsets: number[], cap = 5000): MeterOrdering[] {
  return uniquePermutations(primeFactors(L), cap)
    .map((order): MeterOrdering => {
      const sync = divisiveSyncopation(L, levelSizes(L, order), onsets);
      return {
        order,
        text: order.join('×'),
        sync,
        get hierarchy() {
          return divisiveHierarchy(L, order);
        },
      };
    })
    .sort((a, b) => a.sync.total - b.sync.total);
}

export interface AdditiveBest {
  /** One best grouping (fewest syncopations, then most onsets on group starts). */
  groups: number[];
  minSync: number;
  /** Histogram: syncopation score -> number of groupings with it. */
  dist: Array<[number, bigint]>;
  /** Total number of groupings of L into the sizes. */
  total: bigint;
}

/**
 * Dynamic programming over all groupings of L into the given sizes under the two-level weights
 * (group start 2, other pulses 1), without listing them. A group costs 1 when its last onset
 * after the group start is followed by a silent next group start.
 */
export function additiveSearch(onsets: number[], L: number, sizes: number[]): AdditiveBest | null {
  const on: boolean[] = new Array(L + 1).fill(false);
  for (const a of onsets) {
    on[a] = true;
  }
  const prevOn: number[] = new Array(L).fill(-1);
  let last = -1;
  for (let p = 0; p < L; p++) {
    if (on[p]) {
      last = p;
    }
    prevOn[p] = last;
  }
  const cost = (s: number, t: number): number => {
    const o = prevOn[t >= L ? L - 1 : t - 1];
    if (o <= s) {
      return 0;
    }
    return (t >= L ? on[0] : on[t]) ? 0 : 1;
  };
  const dist: Array<Map<number, bigint> | null> = new Array(L + 1).fill(null);
  const best: Array<{ sync: number; hits: number; len: number } | null> = new Array(L + 1).fill(
    null
  );
  dist[L] = new Map([[0, 1n]]);
  best[L] = { sync: 0, hits: 0, len: 0 };
  for (let st = L - 1; st >= 0; st--) {
    let m: Map<number, bigint> | null = null;
    let b: { sync: number; hits: number; len: number } | null = null;
    for (const len of sizes) {
      const t = st + len;
      const dt = dist[t];
      const bt = best[t];
      if (t > L || !dt || !bt) {
        continue;
      }
      const c = cost(st, t);
      m ??= new Map();
      for (const [v, n] of dt) {
        m.set(v + c, (m.get(v + c) ?? 0n) + n);
      }
      const cand = { sync: bt.sync + c, hits: bt.hits + (on[st] ? 1 : 0), len };
      if (!b || cand.sync < b.sync || (cand.sync === b.sync && cand.hits > b.hits)) {
        b = cand;
      }
    }
    dist[st] = m;
    best[st] = b;
  }
  const d0 = dist[0];
  const b0 = best[0];
  if (!d0 || !b0) {
    return null;
  }
  const groups: number[] = [];
  let x = 0;
  while (x < L) {
    const len = (best[x] as { len: number }).len;
    groups.push(len);
    x += len;
  }
  const d = [...d0.entries()].sort((a, b) => a[0] - b[0]);
  return {
    groups,
    minSync: b0.sync,
    dist: d,
    total: d.reduce((a, e) => a + e[1], 0n),
  };
}
