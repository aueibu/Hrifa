/** Common scales: the 72 melakartas, a Western scale library, and "pick the nearest field notes". Pure. */
import { EPS, mod, parseInterval } from './intervals';
import type { Note } from './types';

/** The 72 melakarta names (standard Katapayadi names, common transliteration; index = number - 1). */
export const MELA_NAMES = [
  'Kanakangi',
  'Ratnangi',
  'Ganamurti',
  'Vanaspati',
  'Manavati',
  'Tanarupi',
  'Senavati',
  'Hanumatodi',
  'Dhenuka',
  'Natakapriya',
  'Kokilapriya',
  'Rupavati',
  'Gayakapriya',
  'Vakulabharanam',
  'Mayamalavagowla',
  'Chakravakam',
  'Suryakantam',
  'Hatakambari',
  'Jhankaradhvani',
  'Natabhairavi',
  'Keeravani',
  'Kharaharapriya',
  'Gaurimanohari',
  'Varunapriya',
  'Mararanjani',
  'Charukesi',
  'Sarasangi',
  'Harikambhoji',
  'Dheerasankarabharanam',
  'Naganandini',
  'Yagapriya',
  'Ragavardhini',
  'Gangeyabhushani',
  'Vagadheeshwari',
  'Shulini',
  'Chalanata',
  'Salagam',
  'Jalarnavam',
  'Jhalavarali',
  'Navaneetam',
  'Pavani',
  'Raghupriya',
  'Gavambhodi',
  'Bhavapriya',
  'Shubhapantuvarali',
  'Shadvidamargini',
  'Suvarnangi',
  'Divyamani',
  'Dhavalambari',
  'Namanarayani',
  'Kamavardhini',
  'Ramapriya',
  'Gamanashrama',
  'Vishwambari',
  'Shyamalangi',
  'Shanmukhapriya',
  'Simhendramadhyamam',
  'Hemavati',
  'Dharmavati',
  'Neetimati',
  'Kantamani',
  'Rishabhapriya',
  'Latangi',
  'Vachaspati',
  'Mechakalyani',
  'Chitrambari',
  'Sucharitra',
  'Jyotiswarupini',
  'Dhatuvardhini',
  'Nasikabhushani',
  'Kosalam',
  'Rasikapriya',
];

const MELA_CHAKRAS = [
  'Indu',
  'Netra',
  'Agni',
  'Veda',
  'Bana',
  'Rutu',
  'Rishi',
  'Vasu',
  'Brahma',
  'Disi',
  'Rudra',
  'Aditya',
];

/**
 * The ONE 5-limit just-intonation table used for every JI target (semitone -> ratio). Swaras: R1 16/15, R2=G1 9/8,
 * R3=G2 6/5, G3 5/4, M1 4/3, M2 45/32, P 3/2, D1 8/5, D2=N1 5/3, D3=N2 9/5 (not 16/9), N3 15/8. Sruti traditions
 * differ; this is one convention.
 */
export const JI12 = [
  '1/1',
  '16/15',
  '9/8',
  '6/5',
  '5/4',
  '4/3',
  '45/32',
  '3/2',
  '8/5',
  '5/3',
  '9/5',
  '15/8',
];

type SwaraPair = [string, string, number, number];

const RG_PAIRS: SwaraPair[] = [
  ['R1', 'G1', 1, 2],
  ['R1', 'G2', 1, 3],
  ['R1', 'G3', 1, 4],
  ['R2', 'G2', 2, 3],
  ['R2', 'G3', 2, 4],
  ['R3', 'G3', 3, 4],
];
const DN_PAIRS: SwaraPair[] = [
  ['D1', 'N1', 8, 9],
  ['D1', 'N2', 8, 10],
  ['D1', 'N3', 8, 11],
  ['D2', 'N2', 9, 10],
  ['D2', 'N3', 9, 11],
  ['D3', 'N3', 10, 11],
];

export interface Melakarta {
  n: number;
  name: string;
  chakra: number;
  chakraName: string;
  ma: 'M1' | 'M2';
  swaras: string[];
  /** Semitones above S. */
  edo12: number[];
  /** Ratio strings from `JI12`. */
  ji: string[];
}

/**
 * Melakarta n (1..72), or null. Ma1 for 1-36, Ma2 for 37-72; a chakra = 6 consecutive scales sharing the R/G pair
 * (order R1G1 R1G2 R1G3 R2G2 R2G3 R3G3); inside a chakra the D/N pair steps in the same order.
 */
export function melakarta(n: number): Melakarta | null {
  if (!Number.isInteger(n) || n < 1 || n > 72) {
    return null;
  }
  const k = n - 1;
  const ma2 = k >= 36;
  const r = k % 36;
  const ch = Math.floor(r / 6);
  const w = r % 6;
  const rg = RG_PAIRS[ch];
  const dn = DN_PAIRS[w];
  const edo12 = [0, rg[2], rg[3], ma2 ? 6 : 5, 7, dn[2], dn[3]];
  return {
    n,
    name: MELA_NAMES[k],
    chakra: Math.floor(k / 6) + 1,
    chakraName: MELA_CHAKRAS[Math.floor(k / 6)],
    ma: ma2 ? 'M2' : 'M1',
    swaras: ['S', rg[0], rg[1], ma2 ? 'M2' : 'M1', 'P', dn[0], dn[1]],
    edo12,
    ji: edo12.map((s) => JI12[s]),
  };
}

/** Melakarta number -> Western or other name of the same notes. */
export const MELA_WESTERN: Record<number, string> = {
  8: 'Phrygian mode',
  10: 'Dorian ♭2 mode (also called Phrygian ♮6)',
  14: 'Phrygian dominant scale',
  57: 'Hungarian minor scale',
  64: 'Lydian dominant scale (the acoustic scale)',
  15: 'double harmonic scale (the "Byzantine" or "Arabic" scale)',
  20: 'natural minor (Aeolian)',
  21: 'harmonic minor',
  22: 'Dorian mode',
  23: 'ascending melodic minor',
  26: 'Mixolydian with a lowered 6th (the "Hindu" scale)',
  28: 'Mixolydian mode',
  29: 'major scale (Ionian)',
  65: 'Lydian mode',
};

/** One plain-language paragraph about melakarta n; '' for an invalid n. */
export function melakartaDesc(n: number): string {
  const m = melakarta(n);
  if (!m) {
    return '';
  }
  const w = MELA_WESTERN[n];
  return (
    `Melakarta ${n} (chakra ${m.chakra}, ${m.chakraName}). Swaras ${m.swaras.join(' ')} = ${m.edo12.join(' ')} semitones above S.${w ? ' Same notes as the ' + w + '.' : ''} ` +
    `${m.ma === 'M1' ? 'Uses the natural 4th (Ma1)' : 'Uses the raised 4th (Ma2)'}. The JI version uses one 5-limit table; sruti traditions differ.`
  );
}

const SC_TAIL = ' JI version: one 5-limit convention (Ptolemy-based); others exist.';

type WesternRow = [name: string, edo12: number[], ji: string[] | null, desc: string];

const WESTERN: WesternRow[] = [
  [
    'Ionian (major)',
    [0, 2, 4, 5, 7, 9, 11],
    ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'],
    'The major scale: whole, whole, half, whole, whole, whole, half. Bright; the white keys from C to C.',
  ],
  [
    'Dorian',
    [0, 2, 3, 5, 7, 9, 10],
    ['1/1', '10/9', '32/27', '4/3', '40/27', '5/3', '16/9'],
    'A minor scale with a raised 6th (the white keys from D). Common in folk, jazz and modal rock. In JI (Ptolemy’s rotation) its 5th is 40/27 (680.4 c), a syntonic comma (21.5 c) flat of 3/2; melakarta 22 has the same notes with a pure 3/2.',
  ],
  [
    'Phrygian',
    [0, 1, 3, 5, 7, 8, 10],
    ['1/1', '16/15', '6/5', '4/3', '3/2', '8/5', '9/5'],
    'A minor scale with a lowered 2nd (the white keys from E). Dark, flamenco-like.',
  ],
  [
    'Lydian',
    [0, 2, 4, 6, 7, 9, 11],
    ['1/1', '9/8', '5/4', '45/32', '3/2', '27/16', '15/8'],
    'A major scale with a raised 4th (the white keys from F). Floating, dreamy.',
  ],
  [
    'Mixolydian',
    [0, 2, 4, 5, 7, 9, 10],
    ['1/1', '10/9', '5/4', '4/3', '3/2', '5/3', '16/9'],
    'A major scale with a lowered 7th (the white keys from G). Bluesy; common in folk and rock.',
  ],
  [
    'Aeolian (natural minor)',
    [0, 2, 3, 5, 7, 8, 10],
    ['1/1', '9/8', '6/5', '27/20', '3/2', '8/5', '9/5'],
    'The natural minor scale (the white keys from A): lowered 3rd, 6th and 7th. In JI (Ptolemy’s rotation) its 4th is 27/20, a syntonic comma (21.5 c) sharp of 4/3.',
  ],
  [
    'Locrian',
    [0, 1, 3, 5, 6, 8, 10],
    ['1/1', '16/15', '6/5', '4/3', '64/45', '8/5', '16/9'],
    'A minor-type scale with a lowered 2nd and a lowered 5th (the white keys from B). Unstable: its fifth is a tritone.',
  ],
  [
    'Harmonic minor',
    [0, 2, 3, 5, 7, 8, 11],
    null,
    'Natural minor with the 7th raised a semitone, leaving an augmented 2nd between the 6th and 7th.',
  ],
  [
    'Melodic minor (ascending)',
    [0, 2, 3, 5, 7, 9, 11],
    null,
    'Minor with both the 6th and 7th raised: a minor 3rd under a major-sounding top. Also called the jazz minor.',
  ],
  [
    'Harmonic major',
    [0, 2, 4, 5, 7, 8, 11],
    null,
    'The major scale with a lowered 6th, again leaving an augmented 2nd between the 6th and 7th.',
  ],
  [
    'Major pentatonic',
    [0, 2, 4, 7, 9],
    null,
    'Five notes: the major scale without its 4th and 7th. No semitones, so it is hard to hit a clashing note.',
  ],
  [
    'Minor pentatonic',
    [0, 3, 5, 7, 10],
    null,
    'Five notes: the natural minor scale without its 2nd and 6th. The backbone of blues and rock solos.',
  ],
  [
    'Whole-tone',
    [0, 2, 4, 6, 8, 10],
    null,
    'Six notes, every step a whole tone (200 c in 12-EDO). Only two transpositions exist and it has no perfect fifth, so it sounds ambiguous. The JI form is only an approximation: no exact 5-limit whole-tone scale exists.',
  ],
  [
    'Octatonic (whole-half)',
    [0, 2, 3, 5, 6, 8, 9, 11],
    null,
    'Eight notes alternating whole tone, semitone (the diminished scale). It is built from two diminished-seventh chords.',
  ],
  [
    'Octatonic (half-whole)',
    [0, 1, 3, 4, 6, 7, 9, 10],
    null,
    'Eight notes alternating semitone, whole tone (the dominant diminished scale). Common over dominant chords in jazz.',
  ],
  [
    'Blues (hexatonic)',
    [0, 3, 5, 6, 7, 10],
    null,
    'The minor pentatonic plus the lowered 5th, the "blue note" a semitone below the 5th. Six notes.',
  ],
];

export interface LibraryScale {
  name: string;
  family: 'Western';
  edo12: number[];
  ji: string[];
  desc: string;
}

export const SCALE_LIBRARY: LibraryScale[] = WESTERN.map(([name, edo12, ji, desc]) => ({
  name,
  family: 'Western' as const,
  edo12,
  ji: ji || edo12.map((s) => JI12[s]),
  desc: desc + SC_TAIL,
}));

/** Anything with 12-EDO semitones and JI ratio strings: a library scale or a melakarta. */
export interface ScaleLike {
  edo12: number[];
  ji: string[];
  swaras?: string[];
}

/**
 * Target cents (above the root) of a library scale or a melakarta. kind 'edo12' -> 100 c per semitone; 'ji' -> cents
 * of the ratios. stretchRepC (> 0): multiply every target by stretchRepC/1200, so the scale's octave lands on the
 * field's repeat (e.g. 3/1 -> x1.585).
 */
export function scaleTargets(sc: ScaleLike, kind: 'ji' | 'edo12', stretchRepC?: number): number[] {
  const c =
    kind === 'ji' ? sc.ji.map((r) => (parseInterval(r) as Note).c) : sc.edo12.map((s) => s * 100);
  return stretchRepC !== undefined && stretchRepC > 0 ? c.map((x) => (x * stretchRepC) / 1200) : c;
}

export type NearestScaleSubset =
  | {
      ok: true;
      /** Field index per target, in the order the targets were given. */
      idx: number[];
      errors: number[];
      maxErr: number;
      meanAbsErr: number;
      window: number;
    }
  | {
      ok: false;
      reason: string;
      idx: number[];
      errors: number[];
      maxErr: null;
      meanAbsErr: null;
      window: number;
    };

/**
 * Choose DISTINCT field notes for the scale. Field notes are ordered by their cents above the root (mod repC; the root
 * is first, at 0); the targets (cents above the root, wrapped into the repeat, sorted ascending) get strictly
 * increasing notes in that order (a monotone assignment). Among all such assignments it minimises the WORST |error|
 * first, then the MEAN |error| (error = note - target, in cents, not wrapped).
 *
 * Method: each target considers only its K nearest field notes (K starts at 8, doubles while that makes the
 * assignment impossible); the smallest worst-error M is found by binary search over the candidate errors with a
 * greedy feasibility test (O(N*K) each); then a DP over the candidates within M minimises the sum of |errors|.
 * Ties in the mean keep the lower field notes. A target that is 0 maps to the root.
 */
export function nearestScaleSubset(
  field: Note[],
  targetCents: number[],
  repC: number,
  rootIdx: number
): NearestScaleSubset {
  const fail = (reason: string): NearestScaleSubset => ({
    ok: false,
    reason,
    idx: [],
    errors: [],
    maxErr: null,
    meanAbsErr: null,
    window: 0,
  });
  const N = targetCents.length;
  const F = field.length;
  if (!N) {
    return fail('The scale has no notes.');
  }
  if (!(repC > 0)) {
    return fail('The repeat is not a positive interval.');
  }
  if (!field[rootIdx]) {
    return fail('There is no root note in the field.');
  }
  if (N > F) {
    return fail(
      `The field has only ${F} note${F === 1 ? '' : 's'} per repeat, but this scale needs ${N} different ones.`
    );
  }
  const rc = field[rootIdx].c;
  const dAll = field.map((n) => mod(n.c - rc, repC));
  const order = field.map((_, i) => i).sort((a, b) => dAll[a] - dAll[b] || a - b);
  const D = order.map((i) => dAll[i]);
  const tIdx = targetCents
    .map((_, i) => i)
    .sort((a, b) => mod(targetCents[a], repC) - mod(targetCents[b], repC) || a - b);
  const T = tIdx.map((i) => mod(targetCents[i], repC));
  const lowerBound = (x: number): number => {
    let lo = 0;
    let hi = F;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (D[m] < x) {
        lo = m + 1;
      } else {
        hi = m;
      }
    }
    return lo;
  };
  const windowOf = (k: number, K: number): [number, number] => {
    if (k === 0 && T[0] < EPS) {
      return [0, 0];
    }
    let b = lowerBound(T[k]);
    let a = b - 1;
    let n = 0;
    let lo = F;
    let hi = -1;
    while (n < K && (a >= 0 || b < F)) {
      let p: number;
      if (b >= F || (a >= 0 && T[k] - D[a] <= D[b] - T[k])) {
        p = a;
        a--;
      } else {
        p = b;
        b++;
      }
      lo = Math.min(lo, p);
      hi = Math.max(hi, p);
      n++;
    }
    return [lo, hi];
  };
  let K = 8;
  for (;;) {
    const W = T.map((_, k) => windowOf(k, K));
    // greedy feasibility: smallest increasing positions with every error <= M
    const feas = (M: number): boolean => {
      let prev = -1;
      for (let k = 0; k < N; k++) {
        let a = W[k][0];
        let b = W[k][1];
        while (a <= b && Math.abs(D[a] - T[k]) > M + 1e-9) {
          a++;
        }
        while (b >= a && Math.abs(D[b] - T[k]) > M + 1e-9) {
          b--;
        }
        const p = Math.max(a, prev + 1);
        if (p > b) {
          return false;
        }
        prev = p;
      }
      return true;
    };
    if (feas(Infinity)) {
      const cand: number[] = [];
      for (let k = 0; k < N; k++) {
        for (let p = W[k][0]; p <= W[k][1]; p++) {
          cand.push(Math.abs(D[p] - T[k]));
        }
      }
      cand.sort((x, y) => x - y);
      let lo = 0;
      let hi = cand.length - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (feas(cand[m])) {
          hi = m;
        } else {
          lo = m + 1;
        }
      }
      const M = cand[lo];
      // DP over candidates within M: cost[k][j] for position W[k][0]+j
      const cost: number[][] = [];
      const par: number[][] = [];
      for (let k = 0; k < N; k++) {
        const a = W[k][0];
        const b = W[k][1];
        cost.push(new Array<number>(b - a + 1).fill(Infinity));
        par.push(new Array<number>(b - a + 1).fill(-1));
        let q = 0;
        let best = Infinity;
        let bestP = -1;
        for (let p = a; p <= b; p++) {
          const e = Math.abs(D[p] - T[k]);
          if (e > M + 1e-9) {
            continue;
          }
          if (k === 0) {
            cost[k][p - a] = e;
            continue;
          }
          const pa = W[k - 1][0];
          const pb = W[k - 1][1];
          while (pa + q <= pb && pa + q < p) {
            const c = cost[k - 1][q];
            if (c < best) {
              best = c;
              bestP = pa + q;
            }
            q++;
          }
          if (bestP >= 0) {
            cost[k][p - a] = best + e;
            par[k][p - a] = bestP;
          }
        }
      }
      let bp = -1;
      let bc = Infinity;
      const la = W[N - 1][0];
      cost[N - 1].forEach((c, j) => {
        if (c < bc) {
          bc = c;
          bp = la + j;
        }
      });
      const pos: number[] = Array<number>(N);
      for (let k = N - 1; k >= 0; k--) {
        pos[k] = bp;
        bp = par[k][pos[k] - W[k][0]];
      }
      const idx: number[] = Array<number>(N);
      const errors: number[] = Array<number>(N);
      for (let k = 0; k < N; k++) {
        idx[tIdx[k]] = order[pos[k]];
        errors[tIdx[k]] = D[pos[k]] - T[k];
      }
      return {
        ok: true,
        idx,
        errors,
        maxErr: Math.max(...errors.map(Math.abs)),
        meanAbsErr: errors.reduce((a, e) => a + Math.abs(e), 0) / N,
        window: K,
      };
    }
    if (K >= F) {
      return fail('The scale cannot be fitted onto distinct notes of this field.');
    }
    K *= 2;
  }
}
