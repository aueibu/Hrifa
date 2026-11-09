/** Chord naming, note spelling, and chord derivation by stacked expansion. Ported unchanged from the artifact. */
import type { Mode } from './pitchSets';

export type ChordFamily =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'sus'
  | 'quartal'
  | 'quintal'
  | 'aug6'
  | 'cluster'
  | 'other';

/** [name, family, optional alternate name ("~" prefix hides the alternate from chips)] */
export type ChordEntry = [string, ChordFamily, string?];

/** Shape (semitones above the chord root, stacked upward) -> name. */
export const CHORDS: Record<string, ChordEntry> = {
  // three notes
  '0,1,2': ['cluster', 'cluster', '012'],
  '0,2,4': ['whole-tone 024', 'other'],
  '0,1,6': ['Viennese 016', 'other'],
  '0,5,6': ['Viennese 056', 'other'],
  '0,2,6': ['It+6 (026)', 'aug6', 'sus2♭5'],
  '0,4,6': ['It+6 (046)', 'aug6', 'maj♭5'],
  '0,3,6': ['dim', 'dim'],
  '0,3,7': ['min', 'min'],
  '0,4,7': ['maj', 'maj'],
  '0,4,8': ['aug', 'aug'],
  '0,2,7': ['sus2', 'sus', '027'],
  '0,5,7': ['sus4', 'sus', '057'],
  '0,5,10': ['quartal', 'quartal'],
  '0,7,14': ['quintal', 'quintal'],
  '0,4,10': ['7(no5)', 'other', 'It+6'],
  '0,3,10': ['min7(no5)', 'min'],
  '0,4,11': ['maj7(no5)', 'maj'],
  '0,3,11': ['mMaj7(no5)', 'min'],
  // four notes
  '0,1,2,3': ['chromatic tetrad', 'cluster'],
  '0,3,6,9': ['dim7', 'dim'],
  '0,3,6,10': ['m7♭5', 'dim', '~Tristan'],
  '0,3,6,11': ['dim(maj7)', 'dim'],
  '0,3,7,9': ['min6', 'min'],
  '0,3,7,10': ['min7', 'min'],
  '0,3,7,11': ['mMaj7', 'min'],
  '0,3,7,14': ['min(add9)', 'min'],
  '0,4,5,7': ['maj(add11)', 'maj'],
  '0,4,6,7': ['maj(add♯11)', 'maj'],
  '0,3,5,7': ['min(add11)', 'min'],
  '0,3,6,7': ['min(add♯11)', 'min'],
  '0,4,6,10': ['7♭5', 'maj', '~Fr+6'],
  '0,4,6,11': ['maj7♭5', 'maj'],
  '0,4,7,9': ['maj6', 'maj'],
  '0,4,7,10': ['7', 'maj', '~Ger+6'],
  '0,4,7,11': ['maj7', 'maj'],
  '0,4,7,14': ['add9', 'maj'],
  '0,4,8,10': ['7♯5', 'aug'],
  '0,4,8,11': ['maj7♯5', 'aug'],
  '0,2,7,9': ['6sus2', 'sus'],
  '0,2,7,10': ['7sus2', 'sus'],
  '0,2,7,11': ['maj7sus2', 'sus'],
  '0,5,7,9': ['6sus4', 'sus'],
  '0,5,7,10': ['7sus4', 'sus'],
  '0,5,7,11': ['maj7sus4', 'sus'],
  '0,5,10,15': ['quartal (4 notes)', 'quartal'],
  '0,7,14,21': ['quintal (4 notes)', 'quintal'],
};

/** Compact (within one octave) lookup built from the table above. */
export const COMPACT: Record<string, ChordEntry> = (() => {
  const out: Record<string, ChordEntry> = {};
  const keys = Object.keys(CHORDS);
  for (let pass = 0; pass < 2; pass++) {
    for (const key of keys) {
      const nums = key.split(',').map(Number);
      const wide = nums.some((x) => x > 11);
      if ((pass === 0) === wide) {
        continue;
      }
      const c = nums.map((x) => x % 12).sort((a, b) => a - b);
      if (new Set(c).size !== c.length) {
        continue;
      }
      const ck = c.join(',');
      if (!out[ck] && !(pass === 1 && CHORDS[ck])) {
        out[ck] = CHORDS[key];
      }
    }
  }
  return out;
})();

const FAMILY_RANK: Record<ChordFamily, number> = {
  maj: 0,
  min: 0,
  dim: 0,
  aug: 0,
  sus: 1,
  quartal: 2,
  quintal: 2,
  aug6: 2,
  cluster: 3,
  other: 3,
};

const isPartial = (hit: ChordEntry) => hit[0].includes('(no5)');

/** How many notes beyond a plain triad or seventh a name carries (lower is simpler). */
const CHORD_COMPLEXITY: Record<string, number> = {
  maj: 0,
  min: 0,
  dim: 0,
  aug: 0,
  maj7: 0,
  '7': 0,
  min7: 0,
  'm7♭5': 0,
  dim7: 0,
  mMaj7: 0,
  sus2: 1,
  sus4: 1,
  maj6: 1,
  min6: 1,
  '7♭5': 1,
  'maj7♯5': 1,
  '7♯5': 1,
  'maj7♭5': 1,
  'dim(maj7)': 1,
  '7sus4': 1,
  '7sus2': 1,
  add9: 2,
  'min(add9)': 2,
  'maj(add11)': 2,
  'min(add11)': 2,
  'maj(add♯11)': 2,
  'min(add♯11)': 2,
  '6sus2': 2,
  '6sus4': 2,
  maj7sus2: 2,
  maj7sus4: 2,
  quartal: 2,
  quintal: 2,
  'It+6 (026)': 2,
  'It+6 (046)': 2,
};

const complexityOf = (hit: ChordEntry) => CHORD_COMPLEXITY[hit[0]] ?? 3;

export interface NamePick {
  j: number;
  hit: ChordEntry;
}

/** Choose the root giving the most complete, then simplest, then most familiar name; ties go to the lowest note. */
export function pickName(rel: number[], cpcs: number[]): NamePick | null {
  const exact = CHORDS[rel.join(',')];
  const cands: NamePick[] = [];
  if (exact) {
    cands.push({ j: 0, hit: exact });
  }
  for (let j = 0; j < cpcs.length; j++) {
    if (j === 0 && exact) {
      continue;
    }
    const key = cpcs
      .map((p) => (p - cpcs[j] + 12) % 12)
      .sort((a, b) => a - b)
      .join(',');
    if (COMPACT[key]) {
      cands.push({ j, hit: COMPACT[key] });
    }
  }
  if (!cands.length) {
    return null;
  }
  cands.sort(
    (a, b) =>
      Number(isPartial(a.hit)) - Number(isPartial(b.hit)) ||
      (a.j === 0 && exact ? 0 : 1) - (b.j === 0 && exact ? 0 : 1) ||
      complexityOf(a.hit) - complexityOf(b.hit) ||
      FAMILY_RANK[a.hit[1]] - FAMILY_RANK[b.hit[1]] ||
      a.j - b.j
  );
  return cands[0];
}

// ---------- spelling ----------

const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteNames = (flats: boolean) => (flats ? FLAT : SHARP);

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const spellCache = new Map<string, string[]>();

const accidental = (a: number) => (a === 0 ? '' : a > 0 ? '♯'.repeat(a) : '♭'.repeat(-a));

/** Give each degree its own letter when that is cheap, otherwise repeat a letter. */
export function spellPcs(pcs: number[], flats: boolean): string[] {
  const n = pcs.length;
  const cacheKey = `${pcs.join(',')}|${flats ? 1 : 0}`;
  const hit = spellCache.get(cacheKey);
  if (hit) {
    return hit;
  }
  const nm = noteNames(flats);
  if (n > 8) {
    const out = pcs.map((p) => nm[p]);
    spellCache.set(cacheKey, out);
    return out;
  }
  let best: { cost: number; seq: number[]; rl: number } | null = null;
  const seq: number[] = [];
  const accOf = (pc: number, li: number) => ((pc - NATURAL_PC[li] + 6 + 120) % 12) - 6;
  function cost(a: number, li: number, isRoot: boolean) {
    const m = Math.abs(a);
    let c = m === 0 ? 0 : m === 1 ? 1 : 4;
    // E♯, B♯, F♭, C♭ are avoided, especially on the root
    if ((a === 1 && (li === 2 || li === 6)) || (a === -1 && (li === 0 || li === 3))) {
      c += isRoot ? 3 : 1;
    }
    if (a > 0 && flats) {
      c += 0.05;
    }
    if (a < 0 && !flats) {
      c += 0.05;
    }
    return c;
  }
  function rec(k: number, rl: number, prev: number, c: number) {
    if (best && c >= best.cost) {
      return;
    }
    if (k === n) {
      best = { cost: c, seq: seq.slice(), rl };
      return;
    }
    for (let off = prev; off <= 6; off++) {
      const li = (rl + off) % 7;
      const a = accOf(pcs[k], li);
      if (Math.abs(a) > 2) {
        continue;
      }
      seq[k] = off;
      rec(k + 1, rl, off, c + cost(a, li, false) + (off === prev ? 3.5 : 0));
    }
  }
  for (let rl = 0; rl < 7; rl++) {
    const a0 = accOf(pcs[0], rl);
    if (Math.abs(a0) > 2) {
      continue;
    }
    seq[0] = 0;
    rec(1, rl, 0, cost(a0, rl, true));
  }
  const found = best as { cost: number; seq: number[]; rl: number } | null;
  const out = found
    ? pcs.map((p, k) => {
        const li = (found.rl + found.seq[k]) % 7;
        return LETTERS[li] + accidental(accOf(p, li));
      })
    : pcs.map((p) => nm[p]);
  spellCache.set(cacheKey, out);
  return out;
}

// ---------- derived chords ----------

export type NameMode = 'anchor' | 'tertian';

export interface DerivedChord {
  /** Degree index (0-based) the chord is stacked from. */
  i: number;
  /** Absolute stacked pitches in semitones above the mode root (may exceed 11). */
  P: number[];
  rel: number[];
  q: string;
  fam: ChordFamily;
  alt: string;
  altHidden: boolean;
  rootName: string;
  bassName: string;
  reading: string;
  notes: string;
}

export interface ChordContext {
  /** The mode's pitch classes as displayed (rotation: original pitches; zero: relative to the chosen root). */
  displayPcs: number[];
  flats: boolean;
  nameMode: NameMode;
}

/** Chords made by stacking every `step`-th note of the mode, `size` notes high, from each degree. */
export function chordsOf(m: Mode, size: number, step: number, ctx: ChordContext): DerivedChord[] {
  const n = m.z.length;
  const offs: number[] = [];
  const seen = new Set<number>();
  for (let j = 0; j < size; j++) {
    offs.push(step * j);
    seen.add((step * j) % n);
  }
  if (seen.size !== size) {
    return [];
  }
  const sp = spellPcs(ctx.displayPcs, ctx.flats);
  return m.z.map((_, i) => {
    const P = offs.map((o) => {
      const ii = i + o;
      return m.z[ii % n] + 12 * Math.floor(ii / n);
    });
    const rel = P.map((p) => p - P[0]);
    const deg = offs.map((o) => (i + o) % n);
    const cpcs = deg.map((d) => ctx.displayPcs[d]);
    const pick = pickName(rel, cpcs);
    let hit: ChordEntry | null = pick ? pick.hit : null;
    let rj = pick ? pick.j : 0;
    let reading = '';
    if (ctx.nameMode === 'anchor') {
      const red = cpcs
        .map((p) => (p - cpcs[0] + 12) % 12)
        .sort((a, b) => a - b)
        .join(',');
      const ah = CHORDS[rel.join(',')] ?? COMPACT[red] ?? null;
      if (pick && (pick.j !== 0 || !ah || pick.hit[0] !== ah[0])) {
        reading = `${sp[deg[pick.j]]} ${pick.hit[0]}${pick.j ? `/${sp[deg[0]]}` : ''}`;
      }
      hit = ah;
      rj = 0;
    }
    const alt = hit?.[2] ? hit[2].replace('~', '') : '';
    return {
      i,
      P,
      rel,
      q: hit ? hit[0] : rel.join('-'),
      fam: hit ? hit[1] : 'other',
      alt,
      altHidden: !!(hit?.[2] && hit[2].startsWith('~')),
      rootName: sp[deg[rj]],
      bassName: rj ? sp[deg[0]] : '',
      reading,
      notes: deg.map((d) => sp[d]).join(' '),
    };
  });
}

/** "maj ×3, min ×4" style tally of chord qualities. */
export function chordTally(chords: DerivedChord[]): string {
  const counts = new Map<string, number>();
  chords.forEach((c) => counts.set(c.q, (counts.get(c.q) ?? 0) + 1));
  return counts.size ? [...counts].map(([q, c]) => `${q} ×${c}`).join(', ') : 'n/a';
}
