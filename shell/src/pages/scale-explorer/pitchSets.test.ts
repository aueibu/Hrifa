import { describe, expect, it } from 'vitest';
import { chordsOf, chordTally, spellPcs } from './chords';
import {
  analyze,
  canonRot,
  catalog,
  icvOf,
  icvText,
  invSymmetries,
  keyOf,
  linkInfo,
  modesOf,
  neighboursOf,
  pickRep,
  rangeVsExpected,
  semitoneStats,
  setStats,
  symmetries,
} from './pitchSets';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

describe('interval vector and prime form', () => {
  it('computes the diatonic interval vector', () => {
    expect(icvOf(MAJOR)).toEqual([2, 5, 4, 3, 6, 1]);
    expect(icvText(icvOf(MAJOR))).toBe('<254361>');
  });

  it('reduces to Rahn and Forte prime forms differently only on ties', () => {
    // set class 5-20: Rahn writes it 01378, Forte writes it 01568
    expect(canonRot([0, 1, 3, 7, 8], 'rahn')).toEqual([0, 1, 3, 7, 8]);
    expect(canonRot([0, 1, 5, 6, 8], 'rahn')).toEqual([0, 1, 3, 7, 8]);
    expect(canonRot([0, 1, 3, 7, 8], 'forte')).toEqual([0, 1, 5, 6, 8]);
    // a set with no tie reads the same either way
    expect(canonRot(MAJOR, 'forte')).toEqual(canonRot(MAJOR, 'rahn'));
    // transposition does not change the prime form
    expect(canonRot([3, 5, 7, 8, 10, 0, 2])).toEqual(canonRot(MAJOR));
  });

  it('merges mirror images only on request', () => {
    const minorTriad = [0, 3, 7];
    const majorTriad = [0, 4, 7];
    expect(pickRep(majorTriad, false).rep).not.toEqual(pickRep(minorTriad, false).rep);
    expect(pickRep(majorTriad, true).rep).toEqual(pickRep(minorTriad, true).rep);
    expect(pickRep(majorTriad, true).self).toBe(false);
    expect(pickRep([0, 4, 8], true).self).toBe(true);
  });
});

describe('catalog', () => {
  it('counts set classes by transposition', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => catalog(n, false, 'rahn').length)).toEqual([
      1, 6, 19, 43, 66, 80,
    ]);
  });

  it('counts set classes with mirror images merged', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => catalog(n, true, 'rahn').length)).toEqual([
      1, 6, 12, 29, 38, 50, 38,
    ]);
  });

  it('gives each catalog row the analysis fields', () => {
    const row = catalog(7, true, 'rahn').find((r) => r.key === keyOf(canonRot(MAJOR)));
    expect(row).toBeDefined();
    expect(row!.hem).toBe(2);
    expect(row!.modes).toBe(7);
    expect(row!.fr).toBe(42);
    expect(row!.rp5).toBe(6);
  });
});

describe('modes and fifths brightness', () => {
  it('lists seven modes of the major scale with Lydian brightest and Locrian darkest', () => {
    const { list, total } = modesOf(MAJOR, 'off');
    expect(total).toBe(7);
    expect(list).toHaveLength(7);
    expect([list[0].fs, list[3].fs, list[6].fs]).toEqual([14, 21, -21]);
    expect(Math.max(...list.map((m) => m.fs))).toBe(21);
    expect(Math.min(...list.map((m) => m.fs))).toBe(-21);
  });

  it('merges identical rotations of a symmetric set', () => {
    const dim = [0, 3, 6, 9];
    const { list, total } = modesOf(dim, 'off');
    expect(total).toBe(4);
    expect(list).toHaveLength(1);
    expect(list[0].ks).toEqual([1, 2, 3, 4]);
  });

  it('inverts around a fixed axis and records the source mode', () => {
    const { base, list, fixed } = modesOf(MAJOR, 'I4');
    expect(fixed).toBe(4);
    expect(base).toEqual([...MAJOR.map((p) => (4 - p + 12) % 12)].sort((a, b) => a - b));
    expect(list.every((m) => m.src !== undefined)).toBe(true);
  });

  it('inverts each mode about its own root', () => {
    const { list } = modesOf([0, 2, 3], 'root');
    expect(list[0].z).toEqual([0, 9, 10]);
  });
});

describe('semitones, symmetry, neighbours', () => {
  it('counts hemitonia and chaining', () => {
    const st = semitoneStats(MAJOR);
    expect([st.hem, st.coh, st.iso, st.chain]).toEqual([2, 0, 2, 0]);
    expect(st.runs).toEqual([2, 2]);
    const chroma = semitoneStats([0, 1, 2, 3]);
    expect([chroma.hem, chroma.coh, chroma.chain, chroma.iso]).toEqual([3, 2, 3, 0]);
    expect(semitoneStats([0, 2, 4, 6, 8, 10]).hem).toBe(0);
  });

  it('finds rotational and inversional symmetries', () => {
    expect(symmetries([0, 2, 4, 6, 8, 10])).toEqual([2, 4, 6, 8, 10]);
    expect(symmetries(MAJOR)).toEqual([]);
    expect(invSymmetries(MAJOR)).toEqual([4]);
  });

  it('links modes by how many notes differ', () => {
    const { list } = modesOf(MAJOR, 'off');
    const ionian = list[0];
    const lydian = list[3];
    expect(linkInfo(ionian, lydian).d).toBe(1);
    expect(linkInfo(ionian, lydian).one).toBe(true);
    const groups = neighboursOf(ionian, list, 2);
    expect(groups.map((g) => g.d)).toEqual([1, 2]);
    expect(groups[0].items.length).toBeGreaterThan(0);
  });
});

describe('range vs expected and set stats', () => {
  it('reports a finite z-score for the major scale', () => {
    const rve = rangeVsExpected(MAJOR);
    expect(rve).not.toBeNull();
    expect(Number.isFinite(rve!.z)).toBe(true);
    expect(rve!.fr).toBe(42);
  });

  it('reports the longest fifth chain and P5 counts for the major scale', () => {
    const st = setStats(MAJOR);
    expect(st.chainLen).toBe(7);
    expect(st.withP5).toHaveLength(6);
    expect(st.noP5).toEqual([11]);
  });

  it('finds Z-related partners', () => {
    expect(setStats([0, 1, 4, 6]).zRelated).toEqual(['0 1 3 7']);
  });

  it('analyzes a single set consistently with the catalog', () => {
    const a = analyze(canonRot(MAJOR));
    expect(a.icv).toEqual([2, 5, 4, 3, 6, 1]);
    expect(a.chain).toBe(7);
  });
});

describe('chords and spelling', () => {
  const ctx = (pcs: number[]) => ({ displayPcs: pcs, flats: false, nameMode: 'anchor' as const });

  it('spells the major scale with one letter per degree', () => {
    expect(spellPcs(MAJOR, false)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(spellPcs([0, 3, 5, 7, 10], true)).toEqual(['C', 'E♭', 'F', 'G', 'B♭']);
  });

  it('derives the diatonic triads and sevenths', () => {
    const [ionian] = modesOf(MAJOR, 'off').list;
    const triads = chordsOf(ionian, 3, 2, ctx(ionian.abs));
    expect(triads.map((c) => `${c.rootName} ${c.q}`)).toEqual([
      'C maj',
      'D min',
      'E min',
      'F maj',
      'G maj',
      'A min',
      'B dim',
    ]);
    expect(chordTally(triads)).toBe('maj ×3, min ×3, dim ×1');
    const sevenths = chordsOf(ionian, 4, 2, ctx(ionian.abs));
    expect(sevenths[0].q).toBe('maj7');
    expect(sevenths[4].q).toBe('7');
  });

  it('returns no chords when stacking wraps back onto a note', () => {
    const [m] = modesOf([0, 4, 7], 'off').list;
    expect(chordsOf(m, 4, 1, ctx(m.abs))).toEqual([]);
  });
});
