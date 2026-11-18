import { describe, expect, it } from 'vitest';
import {
  applyFocusTransform,
  computeImmediateFamily,
  getPresetGamut,
  isBijectiveMultiplier,
  mod,
  parseCustomGamut,
  parseSeedInput,
  signedMod,
  type TransformConfig,
} from './index';

function baseConfig(overrides: Partial<TransformConfig> = {}): TransformConfig {
  return {
    gamut: getPresetGamut('12-edo'),
    domain: 'gamut-steps',
    rule: 'single-focus',
    multiplier: 5,
    multiplierPlus: 1,
    multiplierMinus: -1,
    multipliers: [1, 5, 7],
    dualConstraint: 'swap',
    offsetMode: 'positive',
    folding: 'folded',
    quantize: 'exact',
    identity: 'unordered-set',
    focusPolicy: 'current-members',
    customFoci: [],
    ...overrides,
  };
}

describe('affine-focus M1: pure mathematical engine', () => {
  describe('modular arithmetic and parsing', () => {
    it('normalizes negative values with mod and signedMod', () => {
      expect(mod(-1, 12)).toBe(11);
      expect(mod(14, 12)).toBe(2);
      expect(signedMod(8, 12)).toBe(-4);
      expect(signedMod(3, 12)).toBe(3);
    });

    it('detects bijective vs degenerate multipliers', () => {
      expect(isBijectiveMultiplier(5, 12)).toBe(true);
      expect(isBijectiveMultiplier(7, 12)).toBe(true);
      expect(isBijectiveMultiplier(11, 12)).toBe(true);
      expect(isBijectiveMultiplier(6, 12)).toBe(false);
      expect(isBijectiveMultiplier(0, 12)).toBe(false);
    });

    it('parses step indices, ratios, note names, and custom gamuts', () => {
      const edo12 = getPresetGamut('12-edo');
      const fromNotes = parseSeedInput('C, E, G', edo12, true);
      expect(fromNotes.pitches.map((p) => p.label)).toEqual(['0', '4', '7']);

      const ji7 = getPresetGamut('7-ji-ptolemy');
      const fromRatios = parseSeedInput('1/1, 5/4, 3/2', ji7);
      expect(fromRatios.pitches.map((p) => p.label)).toEqual(['1/1', '5/4', '3/2']);
      expect(fromRatios.pitches.map((p) => p.index)).toEqual([0, 2, 4]);

      const custom = parseCustomGamut('1/1 9/8 5/4 3/2 7/4', '2/1', 'Septimal Pentatonic');
      expect(custom.error).toBeUndefined();
      expect(custom.gamut.pitches.map((p) => p.label)).toEqual(['1/1', '9/8', '5/4', '3/2', '7/4']);
    });
  });

  describe('Confirmed Scenario Table A: 4 Transform Domains on 7-note JI Diatonic (1/1, 5/4, 3/2) with f = 1/1, a = 2', () => {
    const ji7 = getPresetGamut('7-ji-ptolemy');
    const seed = parseSeedInput('1/1, 5/4, 3/2', ji7).pitches;
    const focus1 = [seed[0]]; // 1/1

    it('1. Gamut Steps (mod 7): [0, 2, 4] -> [0, 4, 1], unfolded (1/1, 3/2, 9/4), folded {1/1, 9/8, 3/2}', () => {
      const cfgFolded = baseConfig({
        gamut: ji7,
        domain: 'gamut-steps',
        multiplier: 2,
        folding: 'folded',
        identity: 'unordered-set',
      });
      const resFolded = applyFocusTransform(seed, focus1, cfgFolded);
      expect(resFolded.unfoldedPitches.map((p) => p.label)).toEqual(['1/1', '3/2', '9/4']);
      expect(resFolded.outputPitches.map((p) => p.label)).toEqual(['1/1', '9/8', '3/2']);

      const cfgUnfolded = baseConfig({
        gamut: ji7,
        domain: 'gamut-steps',
        multiplier: 2,
        folding: 'unfolded',
        identity: 'ordered-tuple',
      });
      const resUnfolded = applyFocusTransform(seed, focus1, cfgUnfolded);
      expect(resUnfolded.outputPitches.map((p) => p.label)).toEqual(['1/1', '3/2', '9/4']);
    });

    it('2. Log Pitch (Cents / Ratio^a): unfolded (1/1, 25/16, 9/4), folded {1/1, 9/8, 25/16}', () => {
      const cfgFolded = baseConfig({
        gamut: ji7,
        domain: 'log-pitch',
        multiplier: 2,
        folding: 'folded',
        quantize: 'exact',
      });
      const resFolded = applyFocusTransform(seed, focus1, cfgFolded);
      expect(resFolded.unfoldedPitches.map((p) => p.label)).toEqual(['1/1', '25/16', '9/4']);
      expect(resFolded.outputPitches.map((p) => p.label)).toEqual(['1/1', '9/8', '25/16']);
      // 25/16 is off-gamut (-1), while 1/1 and 9/8 are in-gamut (0, 1)
      expect(resFolded.outputPitches.map((p) => p.index)).toEqual([0, 1, -1]);
    });

    it('3. Linear Freq (Hz / Otonal): unfolded (1/1, 3/2, 2/1), folded {1/1, 3/2}; and f = 3/2, a = -1 yields {1/1, 3/2, 7/4}', () => {
      const cfgFolded = baseConfig({
        gamut: ji7,
        domain: 'linear-freq',
        multiplier: 2,
        folding: 'folded',
        quantize: 'exact',
      });
      const resFolded = applyFocusTransform(seed, focus1, cfgFolded);
      expect(resFolded.unfoldedPitches.map((p) => p.label)).toEqual(['1/1', '3/2', '2/1']);
      expect(resFolded.outputPitches.map((p) => p.label)).toEqual(['1/1', '3/2']);
      expect(resFolded.collapsedCardinality).toBe(true);

      // Reflecting around focus f = 3/2 with a = -1 generates 7/4
      const focus32 = [seed[2]]; // 3/2
      const resReflect = applyFocusTransform(
        seed,
        focus32,
        baseConfig({
          gamut: ji7,
          domain: 'linear-freq',
          multiplier: -1,
          folding: 'folded',
          quantize: 'exact',
        })
      );
      expect(resReflect.unfoldedPitches.map((p) => p.label)).toEqual(['2/1', '7/4', '3/2']);
      expect(resReflect.outputPitches.map((p) => p.label)).toEqual(['1/1', '3/2', '7/4']);
    });

    it('4. Subharmonic (1/Hz / Utonal): unfolded (1/1, 5/3, 3/1), folded {1/1, 3/2, 5/3}', () => {
      const cfgFolded = baseConfig({
        gamut: ji7,
        domain: 'subharmonic',
        multiplier: 2,
        folding: 'folded',
        quantize: 'exact',
      });
      const resFolded = applyFocusTransform(seed, focus1, cfgFolded);
      expect(resFolded.unfoldedPitches.map((p) => p.label)).toEqual(['1/1', '5/3', '3/1']);
      expect(resFolded.outputPitches.map((p) => p.label)).toEqual(['1/1', '3/2', '5/3']);
    });

    it('snaps off-gamut results to nearest gamut pitch and reports signed cents error', () => {
      const cfgSnapped = baseConfig({
        gamut: ji7,
        domain: 'log-pitch',
        multiplier: -1,
        folding: 'folded',
        quantize: 'snap-to-gamut',
        identity: 'ordered-tuple',
      });
      // In log-pitch, f=1/1, a=-1 on (1/1, 5/4, 3/2) produces exact (1/1, 8/5, 4/3).
      // 8/5 (813.69 c) snaps to 5/3 (884.36 c) in Ptolemy 7-note JI with error +70.67 c.
      const res = applyFocusTransform(seed, focus1, cfgSnapped);
      expect(res.outputPitches.map((p) => p.label)).toEqual(['1/1', '5/3', '4/3']);
      expect(res.outputPitches[1].idealLabel).toBe('8/5');
      expect(res.outputPitches[1].snapErrorCents).toBeCloseTo(70.67, 1);
      expect(res.maxSnapErrorCents).toBeCloseTo(70.67, 1);
    });
  });

  describe('Confirmed Scenario Table B: 5 Rule Families on 12-EDO (0, 4, 7)', () => {
    const edo12 = getPresetGamut('12-edo');
    const seed = parseSeedInput('0, 4, 7', edo12).pitches;

    it('1. Single-Focus Reflection (f = 0, a = -1) -> (0, 8, 5) / {0, 5, 8} (F minor)', () => {
      const res = applyFocusTransform(
        seed,
        [seed[0]],
        baseConfig({
          gamut: edo12,
          rule: 'single-focus',
          multiplier: -1,
        })
      );
      expect(res.foldedPitches.map((p) => p.index)).toEqual([0, 8, 5]);
      expect(res.outputPitches.map((p) => p.index)).toEqual([0, 5, 8]);
    });

    it('2. Dual-Focus Edge Reflection (f1 <-> f2, a = -1) yields P, L, R on (0, 4, 7)', () => {
      const cfg = baseConfig({
        gamut: edo12,
        rule: 'dual-focus',
      });
      // {0, 7} -> {0, 3, 7} (C minor, P)
      const resP = applyFocusTransform(seed, [seed[0], seed[2]], cfg);
      expect(resP.foldedPitches.map((p) => p.index)).toEqual([7, 3, 0]);
      expect(resP.outputPitches.map((p) => p.index)).toEqual([0, 3, 7]);

      // {4, 7} -> {4, 7, 11} (E minor, L)
      const resL = applyFocusTransform(seed, [seed[1], seed[2]], cfg);
      expect(resL.outputPitches.map((p) => p.index)).toEqual([4, 7, 11]);

      // {0, 4} -> {0, 4, 9} (A minor, R)
      const resR = applyFocusTransform(seed, [seed[0], seed[1]], cfg);
      expect(resR.outputPitches.map((p) => p.index)).toEqual([0, 4, 9]);
    });

    it('3. Focus Dilation (f = 4, a = 5) -> (8, 4, 7) / {4, 7, 8}', () => {
      const res = applyFocusTransform(
        seed,
        [seed[1]],
        baseConfig({
          gamut: edo12,
          rule: 'single-focus',
          multiplier: 5,
        })
      );
      expect(res.foldedPitches.map((p) => p.index)).toEqual([8, 4, 7]);
      expect(res.outputPitches.map((p) => p.index)).toEqual([4, 7, 8]);
    });

    it('4. Perspective / Zero-Anchor (f = 4, a = 1) -> (8, 0, 3) / {0, 3, 8}', () => {
      const res = applyFocusTransform(
        seed,
        [seed[1]],
        baseConfig({
          gamut: edo12,
          rule: 'perspective',
          multiplier: 1,
        })
      );
      expect(res.foldedPitches.map((p) => p.index)).toEqual([8, 0, 3]);
      expect(res.outputPitches.map((p) => p.index)).toEqual([0, 3, 8]);
    });

    it('5. Bilateral / Fold (f = 4, a+ = 1, a- = -1, signed d in [-6, 6)) -> (8, 4, 7) / {4, 7, 8}', () => {
      const res = applyFocusTransform(
        seed,
        [seed[1]],
        baseConfig({
          gamut: edo12,
          rule: 'bilateral',
          multiplierPlus: 1,
          multiplierMinus: -1,
          offsetMode: 'signed',
        })
      );
      expect(res.foldedPitches.map((p) => p.index)).toEqual([8, 4, 7]);
      expect(res.outputPitches.map((p) => p.index)).toEqual([4, 7, 8]);
    });

    it('preserves authoritative AFT properties: focus invariance, identity (a=1), collapse (a=0)', () => {
      const s = parseSeedInput('0, 1, 4, 6', edo12).pitches;
      // Example from Affine Focus Transform.md: S = {0,1,4,6}, f = 1, a = 5 -> {1,2,4,8}
      const ex = applyFocusTransform(s, [s[1]], baseConfig({ multiplier: 5 }));
      expect(ex.outputPitches.map((p) => p.index)).toEqual([1, 2, 4, 8]);

      // Identity a = 1
      const id = applyFocusTransform(s, [s[1]], baseConfig({ multiplier: 1 }));
      expect(id.outputPitches.map((p) => p.index)).toEqual([0, 1, 4, 6]);
      expect(id.isSelfLoop).toBe(true);

      // Collapse a = 0 -> {1}
      const col = applyFocusTransform(s, [s[1]], baseConfig({ multiplier: 0 }));
      expect(col.outputPitches.map((p) => p.index)).toEqual([1]);
      expect(col.collapsedCardinality).toBe(true);
    });

    it('computes immediate family for multi-multiplier mode', () => {
      const family = computeImmediateFamily(
        seed,
        seed,
        baseConfig({
          rule: 'multi-multiplier',
          multipliers: [1, 5],
          focusPolicy: 'current-members',
        })
      );
      // 3 current members * 2 multipliers = 6 operations
      expect(family).toHaveLength(6);
    });
  });
});
