/** TypeScript port of raga-explorer/scripts/raga_theory.py — keep the two in sync by hand; there is no code generation
 * between them. Pure functions on a raga's aroha/avaroha sargam text; no I/O, no React. See the Python module for the
 * full rationale (purvanga/uttaranga split, tritones, perfect-fifth "imperfection"/"detached" swaras, the melodic
 * mirror and the negative/complement scale). Semitone mapping (Sa = 0):
 *   S R1 R2 R3 G1 G2 G3 M1 M2 P D1 D2 D3 N1 N2 N3
 *   0  1  2  3  2  3  4  5  6 7  8  9 10  9 10 11
 */

export const SEMI: Record<string, number> = {
  S: 0,
  R1: 1,
  R2: 2,
  R3: 3,
  G1: 2,
  G2: 3,
  G3: 4,
  M1: 5,
  M2: 6,
  P: 7,
  D1: 8,
  D2: 9,
  D3: 10,
  N1: 9,
  N2: 10,
  N3: 11,
};

export const NAMES: Record<number, string[]> = {
  0: ['S'],
  1: ['R1'],
  2: ['R2', 'G1'],
  3: ['R3', 'G2'],
  4: ['G3'],
  5: ['M1'],
  6: ['M2'],
  7: ['P'],
  8: ['D1'],
  9: ['D2', 'N1'],
  10: ['D3', 'N2'],
  11: ['N3'],
};

const MARKS = /[',=]/g;

/** JS `%` keeps the sign of its left operand (`-1 % 12 === -1`); this always returns 0..11. */
export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function toks(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(MARKS, ''));
}

export function pcsOf(text: string): number[] {
  return toks(text)
    .filter((t) => t in SEMI)
    .map((t) => SEMI[t]);
}

export type TokenMap = Map<number, Set<string>>;

export function tokenMap(aroha: string, avaroha: string): TokenMap {
  const m: TokenMap = new Map();
  for (const t of [...toks(aroha), ...toks(avaroha)]) {
    if (t in SEMI) {
      const pc = SEMI[t];
      if (!m.has(pc)) {
        m.set(pc, new Set());
      }
      m.get(pc)!.add(t);
    }
  }
  return m;
}

/** This raga's own name(s) for a pitch class if it has one, else every enharmonic name for that semitone,
 * always followed by the bare pitch class: `R2/G1(2)`. */
export function label(pc: number, tm?: TokenMap): string {
  const names = tm?.get(pc);
  const list = names && names.size ? [...names].sort() : NAMES[pc];
  return `${list.join('/')}(${pc})`;
}

export function tokLabel(token: string): string {
  return token in SEMI ? `${token}(${SEMI[token]})` : token;
}

export function purvangaUttaranga(
  aroha: string,
  avaroha: string
): { lower: string; upper: string } {
  const tm = tokenMap(aroha, avaroha);
  const pcset = [...tm.keys()].sort((a, b) => a - b);
  const lower = pcset
    .filter((p) => p <= 6)
    .map((p) => label(p, tm))
    .join(' ');
  const upper = pcset
    .filter((p) => p >= 7)
    .map((p) => label(p, tm))
    .join(' ');
  return { lower, upper };
}

export function pitchClassSet(aroha: string, avaroha: string): { pcset: number[]; str: string } {
  const pcset = [...new Set([...pcsOf(aroha), ...pcsOf(avaroha)])].sort((a, b) => a - b);
  return { pcset, str: `{${pcset.join(',')}}` };
}

export function tritones(pcset: number[], tm: TokenMap): string {
  const s = new Set(pcset);
  const out: string[] = [];
  for (const p of pcset) {
    const q = (p + 6) % 12;
    if (s.has(q) && p < q) {
      out.push(`${label(p, tm)}-${label(q, tm)}`);
    }
  }
  return out.join('; ');
}

export interface StepPair {
  a: string;
  b: string;
  step: number;
}

function pairs(tokens: string[], steps: number[]): StepPair[] {
  const out: StepPair[] = [];
  for (let i = 0; i < tokens.length - 1 && i < steps.length; i++) {
    out.push({ a: tokens[i], b: tokens[i + 1], step: steps[i] });
  }
  return out;
}

export function intervalListing(tokens: string[], steps: number[]): string {
  return pairs(tokens, steps)
    .map((p) => `${tokLabel(p.a)}-${tokLabel(p.b)}:${p.step >= 0 ? '+' : ''}${p.step}`)
    .join(' ');
}

export function largeGaps(tokens: string[], steps: number[], threshold = 3): string {
  return pairs(tokens, steps)
    .filter((p) => Math.abs(p.step) >= threshold)
    .map((p) => `${tokLabel(p.a)}-${tokLabel(p.b)}:${p.step >= 0 ? '+' : ''}${p.step}`)
    .join('; ');
}

export function gamutLargeGaps(pcset: number[], tm: TokenMap, threshold = 3): string {
  if (pcset.length === 0) {
    return '';
  }
  const s = [...pcset].sort((a, b) => a - b);
  const withWrap: [number, number][] = s.slice(0, -1).map((p, i) => [p, s[i + 1]]);
  withWrap.push([s[s.length - 1], s[0] + 12]);
  return withWrap
    .filter(([a, b]) => b - a >= threshold)
    .map(([a, b]) => `${label(a % 12, tm)}-${label(b % 12, tm)}:+${b - a}`)
    .join('; ');
}

export function imperfections(pcset: number[], tm: TokenMap): string {
  const s = new Set(pcset);
  return pcset
    .filter((p) => !s.has((p + 7) % 12))
    .map((p) => label(p, tm))
    .join(' ');
}

export function detachedSwaras(pcset: number[], tm: TokenMap): string {
  const s = new Set(pcset);
  return pcset
    .filter((p) => !s.has((p + 7) % 12) && !s.has((p + 5) % 12))
    .map((p) => label(p, tm))
    .join(' ');
}

export function pitchCounts(aroha: string, avaroha: string): { played: number; unique: number } {
  const played = toks(aroha).length + toks(avaroha).length;
  const unique = new Set([...pcsOf(aroha), ...pcsOf(avaroha)]).size;
  return { played, unique };
}

/** The melodic inversion around Sa: each pitch class p becomes (-p mod 12), same token order. */
export function mirrorSeq(tokens: string[]): string {
  return tokens.map((t) => (t in SEMI ? label(mod12(-SEMI[t])) : t)).join(' ');
}

export function mirrorGamut(pcset: number[]): { pcset: number[]; str: string; names: string } {
  const mpcs = [...new Set(pcset.map((p) => (12 - p) % 12))].sort((a, b) => a - b);
  return { pcset: mpcs, str: `{${mpcs.join(',')}}`, names: mpcs.map((p) => label(p)).join(' ') };
}

export function negativeGamut(pcset: number[]): { pcset: number[]; str: string; names: string } {
  const used = new Set(pcset);
  const neg = Array.from({ length: 12 }, (_, i) => i).filter((p) => !used.has(p));
  return { pcset: neg, str: `{${neg.join(',')}}`, names: neg.map((p) => label(p)).join(' ') };
}

export function negativeSeq(negPcs: number[]): { asc: string; desc: string } {
  if (negPcs.length === 0) {
    return { asc: '', desc: '' };
  }
  const asc = negPcs.map((p) => label(p)).join(' ');
  const desc = [...negPcs]
    .reverse()
    .map((p) => label(p))
    .join(' ');
  return { asc, desc };
}

export interface RagaTheory {
  tm: TokenMap;
  pcset: number[];
  pcsetStr: string;
  purvanga: string;
  uttaranga: string;
  tritones: string;
  arohaIntervals: string;
  avarohaIntervals: string;
  arohaLargeGaps: string;
  avarohaLargeGaps: string;
  gamutLargeGaps: string;
  imperfections: string;
  detachedSwaras: string;
  pitchesPlayed: number;
  uniquePitches: number;
  mirrorAroha: string;
  mirrorAvaroha: string;
  mirrorPcset: number[];
  mirrorPcsetStr: string;
  mirrorNames: string;
  negativePcset: number[];
  negativePcsetStr: string;
  negativeNames: string;
  negativeAroha: string;
  negativeAvaroha: string;
}

/** Consecutive differences of a canonical semitone chain (Sa..Sa positions) -- the signed melodic step size between
 * each pair of neighbouring notes. Mirrors canonical_chain.py's `steps()`. */
export function chainSteps(positions: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    out.push(positions[i + 1] - positions[i]);
  }
  return out;
}

/** Everything the detail/theory panels need, computed once from a raga's own aroha/avaroha text plus its canonical
 * semitone chain (RagaVariant.arohaChain/avarohaChain, already computed by canonical_chain.py at export time). */
export function analyzeRaga(
  aroha: string,
  avaroha: string,
  arohaChain: number[],
  avarohaChain: number[]
): RagaTheory | null {
  if (!aroha.trim() || !avaroha.trim()) {
    return null;
  }
  const arohaSteps = chainSteps(arohaChain);
  const avarohaSteps = chainSteps(avarohaChain);
  const tm = tokenMap(aroha, avaroha);
  const { lower, upper } = purvangaUttaranga(aroha, avaroha);
  const { pcset, str: pcsetStr } = pitchClassSet(aroha, avaroha);
  const aTok = toks(aroha);
  const vTok = toks(avaroha);
  const { played, unique } = pitchCounts(aroha, avaroha);
  const mirror = mirrorGamut(pcset);
  const negative = negativeGamut(pcset);
  const negSeq = negativeSeq(negative.pcset);
  return {
    tm,
    pcset,
    pcsetStr,
    purvanga: lower,
    uttaranga: upper,
    tritones: tritones(pcset, tm),
    arohaIntervals: intervalListing(aTok, arohaSteps),
    avarohaIntervals: intervalListing(vTok, avarohaSteps),
    arohaLargeGaps: largeGaps(aTok, arohaSteps),
    avarohaLargeGaps: largeGaps(vTok, avarohaSteps),
    gamutLargeGaps: gamutLargeGaps(pcset, tm),
    imperfections: imperfections(pcset, tm),
    detachedSwaras: detachedSwaras(pcset, tm),
    pitchesPlayed: played,
    uniquePitches: unique,
    mirrorAroha: mirrorSeq(aTok),
    mirrorAvaroha: mirrorSeq(vTok),
    mirrorPcset: mirror.pcset,
    mirrorPcsetStr: mirror.str,
    mirrorNames: mirror.names,
    negativePcset: negative.pcset,
    negativePcsetStr: negative.str,
    negativeNames: negative.names,
    negativeAroha: negSeq.asc,
    negativeAvaroha: negSeq.desc,
  };
}
