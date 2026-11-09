import { describe, expect, it } from 'vitest';
import {
  analyzeRaga,
  chainSteps,
  gamutLargeGaps,
  imperfections,
  mirrorGamut,
  negativeGamut,
  pitchClassSet,
  purvangaUttaranga,
  tokenMap,
  tritones,
} from './theory';

// Kanakāngi (melakarta 1): S R1 G1 M1 P D1 N1 S / S N1 D1 P M1 G1 R1 S -- every field here was cross-checked by
// hand against raga_theory.py's own output during development (see raga-explorer/docs, canonical-chain sections).
const KANAKANGI_AROHA = 'S R1 G1 M1 P D1 N1 S';
const KANAKANGI_AVAROHA = 'S N1 D1 P M1 G1 R1 S';

// Kalyani (melakarta 65): the textbook tritone raga, S to M2.
const KALYANI_AROHA = 'S R2 G3 M2 P D2 N3 S';
const KALYANI_AVAROHA = 'S N3 D2 P G3 R2 S';

describe('pitchClassSet / tokenMap', () => {
  it('reads Kanakāngi as {0,1,2,5,7,8,9}', () => {
    const { pcset, str } = pitchClassSet(KANAKANGI_AROHA, KANAKANGI_AVAROHA);
    expect(pcset).toEqual([0, 1, 2, 5, 7, 8, 9]);
    expect(str).toBe('{0,1,2,5,7,8,9}');
  });

  it("uses the raga's own token for an ambiguous pitch class, not a guess", () => {
    const tm = tokenMap(KANAKANGI_AROHA, KANAKANGI_AVAROHA);
    expect(tm.get(2)).toEqual(new Set(['G1'])); // Kanakāngi uses G1, not R2, at pc 2
  });
});

describe('tritones', () => {
  it("finds both of Kanakāngi's tritones: R1-P and G1-D1", () => {
    const { pcset } = pitchClassSet(KANAKANGI_AROHA, KANAKANGI_AVAROHA);
    const tm = tokenMap(KANAKANGI_AROHA, KANAKANGI_AVAROHA);
    expect(tritones(pcset, tm)).toBe('R1(1)-P(7); G1(2)-D1(8)');
  });

  it("finds Kalyani's defining tritone, S-M2", () => {
    const { pcset } = pitchClassSet(KALYANI_AROHA, KALYANI_AVAROHA);
    const tm = tokenMap(KALYANI_AROHA, KALYANI_AVAROHA);
    expect(tritones(pcset, tm)).toBe('S(0)-M2(6)');
  });
});

describe('imperfections', () => {
  it('flags D1 and N1 in Kanakāngi (no perfect fifth above either)', () => {
    const { pcset } = pitchClassSet(KANAKANGI_AROHA, KANAKANGI_AVAROHA);
    const tm = tokenMap(KANAKANGI_AROHA, KANAKANGI_AVAROHA);
    expect(imperfections(pcset, tm)).toBe('D1(8) N1(9)');
  });

  it('flags M2 in Kalyani', () => {
    const { pcset } = pitchClassSet(KALYANI_AROHA, KALYANI_AVAROHA);
    const tm = tokenMap(KALYANI_AROHA, KALYANI_AVAROHA);
    expect(imperfections(pcset, tm)).toBe('M2(6)');
  });
});

describe('purvangaUttaranga', () => {
  it('splits Kanakāngi at Ma/Pa', () => {
    const { lower, upper } = purvangaUttaranga(KANAKANGI_AROHA, KANAKANGI_AVAROHA);
    expect(lower).toBe('S(0) R1(1) G1(2) M1(5)');
    expect(upper).toBe('P(7) D1(8) N1(9)');
  });
});

describe('gamutLargeGaps', () => {
  it("finds no structural gap in Kalyani's whole scale even though its avaroha skips M2", () => {
    const { pcset } = pitchClassSet(KALYANI_AROHA, KALYANI_AVAROHA);
    const tm = tokenMap(KALYANI_AROHA, KALYANI_AVAROHA);
    // Kalyani's avaroha has a melodic gap (P->G3 skips M2), but M2 is present elsewhere in the scale, so the
    // *gamut* (the whole pitch-class set closed to one octave) has no real gap.
    expect(gamutLargeGaps(pcset, tm)).toBe('');
  });
});

describe('mirror / negative', () => {
  it('mirrors Kanakāngi around Sa correctly in both directions', () => {
    const a = mirrorGamut(pitchClassSet(KANAKANGI_AROHA, KANAKANGI_AVAROHA).pcset);
    expect(a.pcset).toEqual([0, 3, 4, 5, 7, 10, 11]);
  });

  it("Kanakāngi's negative (complement) scale is R3/G2 G3 M2 D3/N2 N3", () => {
    const neg = negativeGamut(pitchClassSet(KANAKANGI_AROHA, KANAKANGI_AVAROHA).pcset);
    expect(neg.pcset).toEqual([3, 4, 6, 10, 11]);
    expect(neg.names).toBe('R3/G2(3) G3(4) M2(6) D3/N2(10) N3(11)');
  });
});

describe('chainSteps', () => {
  it('is the signed consecutive difference of a chain', () => {
    expect(chainSteps([0, 1, 5, 9, 10, 4, 7, 12])).toEqual([1, 4, 4, 1, -6, 3, 5]);
  });
});

describe('analyzeRaga', () => {
  it('returns null for a blank scale (the two Pravagam Chayalaka rows have no printed scale)', () => {
    expect(analyzeRaga('', '', [], [])).toBeNull();
  });

  it('ties everything together for Kanakāngi, matching the masterlist theory columns exactly', () => {
    const chain = [0, 1, 2, 5, 7, 8, 9, 12];
    const t = analyzeRaga(KANAKANGI_AROHA, KANAKANGI_AVAROHA, chain, [...chain].reverse());
    expect(t).not.toBeNull();
    expect(t!.pcsetStr).toBe('{0,1,2,5,7,8,9}');
    expect(t!.pitchesPlayed).toBe(16);
    expect(t!.uniquePitches).toBe(7);
    expect(t!.detachedSwaras).toBe('');
  });
});
