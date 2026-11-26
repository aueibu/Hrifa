/**
 * Z-relations on a ring (Canon 6): two rhythms that share every circular distance count (the
 * interval vector) and are not rotations or mirror images of each other. On a fixed ring this
 * is pitch-class set theory ({0, 1, 4, 6} and {0, 1, 3, 7} on 12 are 4-Z15 and 4-Z29); on the
 * linear ring it is a voicing-level relation specific to one rooting.
 *
 * Pitch-domain counterpart: the interval vector and Z-relation (Forte); homometry, equal DFT
 * magnitudes with different phases (Lewin, Quinn, Amiot).
 */
import { modeTable, rerootMode } from './modes';
import { cmpRatio, type Ratio } from './ratios';
import { distanceCounts } from './spectrum';

/** Same folded distance counts (same ring, same number of onsets). */
export function sameDistances(a: number[], b: number[], L: number): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const x = distanceCounts(a, L);
  const y = distanceCounts(b, L);
  return x.every((v, i) => v === y[i]);
}

/** Smallest string over every rotation and both mirror images: equal exactly for equivalent rhythms. */
export function canonKey(S: number[], L: number): string {
  let best: string | null = null;
  for (const sg of [1, -1]) {
    const s = S.map((x) => (((sg * x) % L) + L) % L);
    for (const a of s) {
      const t = s
        .map((x) => (x - a + L) % L)
        .sort((x, y) => x - y)
        .join(',');
      if (best === null || t < best) {
        best = t;
      }
    }
  }
  return best as string;
}

/** Two rhythms are Z-related when their distance counts agree and they are not rotation or mirror equivalent. */
export function isZRelated(a: number[], b: number[], L: number): boolean {
  return sameDistances(a, b, L) && canonKey(a, L) !== canonKey(b, L);
}

export interface ZSearch {
  /** One canonical representative (smallest rotation or mirror, starting at 0) per partner class. */
  partners: number[][];
  /** The search stopped on its step budget or on `shouldStop`: the list may be incomplete. */
  aborted: boolean;
  steps: number;
}

export interface ZSearchOptions {
  /** Step budget (candidate onsets tried). Default 300,000 (the lab's). */
  cap?: number;
  /** Polled every 1,024 steps; return true to stop (a deadline injected by the caller). */
  shouldStop?: () => boolean;
}

/**
 * Every Z-partner of A on a ring of L, up to rotation and mirror image, by a pruned search for
 * sets whose distance counts never exceed A's. Complete unless `aborted`.
 */
export function zPartners(A: number[], L: number, opts: ZSearchOptions = {}): ZSearch {
  const cap = opts.cap ?? 300_000;
  const k = A.length;
  const target = distanceCounts(A, L);
  const cnt: number[] = new Array(target.length).fill(0);
  const cur: number[] = [0];
  const found = new Map<string, number[]>();
  const me = canonKey(A, L);
  let steps = 0;
  let aborted = false;
  const rec = (start: number): void => {
    if (aborted) {
      return;
    }
    if (cur.length === k) {
      const key = canonKey(cur, L);
      if (key !== me && !found.has(key)) {
        found.set(key, key.split(',').map(Number));
      }
      return;
    }
    for (let x = start; x < L; x++) {
      steps++;
      if (steps > cap || (opts.shouldStop && steps % 1024 === 0 && opts.shouldStop())) {
        aborted = true;
        return;
      }
      let bad = false;
      for (const y of cur) {
        const d = Math.min(x - y, L - x + y);
        cnt[d]++;
        if (cnt[d] > target[d]) {
          bad = true;
        }
      }
      if (!bad) {
        cur.push(x);
        rec(x + 1);
        cur.pop();
      }
      for (const y of cur) {
        const d = Math.min(x - y, L - x + y);
        cnt[d]--;
      }
      if (aborted) {
        return;
      }
    }
  };
  rec(1);
  return { partners: [...found.values()], aborted, steps };
}

export interface Alignment {
  /** The partner placed to share as many onsets with A as it can (then keeping slot 0, then moving least). */
  Q: number[];
  mirrored: boolean;
  shared: number;
}

/** Rotate or mirror a partner P onto A: most shared onsets, then 1/1 kept, then least movement, then not mirrored. */
export function alignTo(A: number[], P: number[], L: number): Alignment {
  const As = new Set(A);
  let best: { Q: number[]; sc: number[]; mirrored: boolean; shared: number } | null = null;
  for (const sg of [1, -1]) {
    for (let sh = 0; sh < L; sh++) {
      const Q = P.map((x) => (((sg * x + sh) % L) + L) % L).sort((a, b) => a - b);
      const lost = A.filter((x) => !Q.includes(x)).sort((a, b) => a - b);
      const gain = Q.filter((x) => !As.has(x)).sort((a, b) => a - b);
      let dist = 0;
      lost.forEach((x, i) => {
        const dd = Math.abs(x - gain[i]);
        dist += Math.min(dd, L - dd);
      });
      const shared = Q.filter((x) => As.has(x)).length;
      const sc = [shared, Q.includes(0) ? 1 : 0, -dist, sg === 1 ? 1 : 0];
      let better = !best;
      if (best) {
        for (let i = 0; i < sc.length; i++) {
          if (sc[i] !== best.sc[i]) {
            better = sc[i] > best.sc[i];
            break;
          }
        }
      }
      if (better) {
        best = { Q, sc, mirrored: sg === -1, shared };
      }
    }
  }
  const b = best as { Q: number[]; mirrored: boolean; shared: number };
  return { Q: b.Q, mirrored: b.mirrored, shared: b.shared };
}

export interface RootingReport {
  root: Ratio;
  /** Ring size of the first scale rooted here. */
  L: number;
  /** Slots of the first scale rooted here. */
  slots: number[];
  /** The second scale contains this root, so it can be rooted on it too. */
  otherHasRoot: boolean;
  /** Both scales rooted here share distance counts on this ring and are not equivalent. */
  holds: boolean;
}

/**
 * Do two ratio sets form a Z-pair on the linear ring of each rooting? For every note of the first
 * set, root both sets on it (the second only if it has that note) and compare slot distance counts
 * on the linear ring. A linear-ring pair is two voicings with the same difference tones.
 */
export function linearRingPair(a: Ratio[], b: Ratio[]): RootingReport[] {
  const out: RootingReport[] = [];
  for (const m of modeTable(a)) {
    const other = b.some((r) => cmpRatio(r, m.root) === 0) ? rerootMode(b, m.root) : null;
    out.push({
      root: m.root,
      L: m.ring.L,
      slots: m.ring.slots,
      otherHasRoot: other !== null,
      holds:
        other !== null &&
        other.ring.L === m.ring.L &&
        isZRelated(m.ring.slots, other.ring.slots, m.ring.L),
    });
  }
  return out;
}
