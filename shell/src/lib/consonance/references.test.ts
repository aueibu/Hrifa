/**
 * Reproduction of the reference implementations (R, MIT, Peter M. C. Harrison): `dycon`, `stolz15`, `har18`, `hrep`,
 * `incon`. Every expected number is either (a) a value printed in the R package's own tests or README, or (b) derived
 * by hand from the R code's formulas, as the comment above it says; none was produced by this library.
 */
import { describe, expect, it } from 'vitest';
import { doubleFraction, fraction, halfFraction, rationalInterval } from './periodicity';
import { midiChord } from './testUtils';
import {
  harmonicity,
  hutchCbw,
  hutchG,
  hutchGOfY,
  hutchRoughnessOfPartials,
  interference,
  midiToHz,
  periodicity,
  setharesRoughnessOfPartials,
  timbreFromAmps,
  INCON_COEFFICIENTS,
  inconComposite,
  inconCompositeOfFreqs,
  roundHalfEven,
} from './index';

/** 11 harmonics, amplitude 1 / n (`hrep::sparse_fr_spectrum` defaults used by `incon`), or `n` harmonics. */
const harmonicAmps = (n: number) =>
  timbreFromAmps(Array.from({ length: n }, (_, i) => 1 / (i + 1)));

describe('Hutchinson & Knopoff (dycon::roughness_hutch)', () => {
  it('dissonance factor g(y) = ((y/a) exp(1 - y/a))^b: dycon test-hutch.R values', () => {
    // dycon/tests/testthat/test-hutch.R: hutch_g(1) = 0.0397, hutch_g(0.5) = 0.5413, hutch_g(1.5) = 0 (cut-off 1.2).
    expect(hutchGOfY(1)).toBeCloseTo(0.0397, 4);
    expect(hutchGOfY(0.5)).toBeCloseTo(0.5413, 4);
    expect(hutchGOfY(1.5)).toBe(0);
    // by hand: y = 0.25 is the peak, ((1) * e^0)^2 = 1
    expect(hutchGOfY(0.25)).toBeCloseTo(1, 12);
    // by hand: y = 0.5 -> (2 e^-1)^2 = 4 e^-2
    expect(hutchGOfY(0.5)).toBeCloseTo(4 * Math.exp(-2), 12);
  });

  it('critical bandwidth 1.72 * mean^0.65: dycon test-hutch.R values', () => {
    expect(hutchCbw(400, 440)).toBeCloseTo(87.225, 3);
    expect(hutchCbw(400, 380)).toBeCloseTo(83.123, 3);
  });

  it('two pure tones: roughness = g(y) a1 a2 / (a1^2 + a2^2) (hand-derived from the R code)', () => {
    // MIDI 60 and 61, one harmonic each, amplitude 1: denominator 2, numerator g(y).
    const [f1, f2] = [midiToHz(60), midiToHz(61)];
    const y = (f2 - f1) / (1.72 * ((f1 + f2) / 2) ** 0.65);
    const g = ((y / 0.25) * Math.exp(1 - y / 0.25)) ** 2;
    const r = interference(midiChord([60, 61]), harmonicAmps(1)).total;
    expect(r).toBeCloseTo(g / 2, 12);
    // dycon test-hutch.R (tolerance 1e-3): "60 61" 0.499 and "69 70" 0.491 with num_harmonics = 1
    expect(r).toBeCloseTo(0.499, 3);
    expect(interference(midiChord([69, 70]), harmonicAmps(1)).total).toBeCloseTo(0.491, 3);
    expect(hutchG(f1, f2)).toBeCloseTo(g, 12);
  });

  it('chords with 11 harmonics: dycon test-hutch.R and incon README values', () => {
    const t = harmonicAmps(11);
    expect(interference(midiChord([60, 61]), t).total).toBeCloseTo(0.484, 3);
    // incon README: incon(c(60, 64, 67)) = 0.1202426 and incon(c(60, 63, 67), "hutch_78_roughness") = 0.1300830
    expect(interference(midiChord([60, 64, 67]), t).total).toBeCloseTo(0.1202426, 6);
    expect(interference(midiChord([60, 63, 67]), t).total).toBeCloseTo(0.130083, 6);
  });

  it('merging coincident partials sums squared amplitudes (hrep collapse_summing_amplitudes)', () => {
    // An octave dyad with 11 harmonics: harmonic 2k of the low note is harmonic k of the high one, so they coincide.
    // Hand-build the merged spectrum: amplitude of coinciding partials = sqrt(a^2 + b^2) (incoherent sum).
    const f = midiToHz(60);
    const byHz = new Map<number, number>(); // k * f -> squared amplitude
    for (let n = 1; n <= 11; n++) {
      byHz.set(n, (byHz.get(n) ?? 0) + 1 / n ** 2);
    } // low note: n f, amplitude 1/n
    for (let n = 1; n <= 11; n++) {
      byHz.set(2 * n, (byHz.get(2 * n) ?? 0) + 1 / n ** 2);
    } // high note: 2n f
    const list = [...byHz].map(([k, sq]) => ({ f: k * f, a: Math.sqrt(sq) }));
    const merged = interference([f, 2 * f], harmonicAmps(11)).total;
    expect(merged).toBeCloseTo(hutchRoughnessOfPartials(list), 12);
    expect(merged).toBeGreaterThan(0);
    // not merging keeps both partials, which gives a different total
    const separate = interference([f, 2 * f], harmonicAmps(11), { mergeCoincident: false }).total;
    expect(Math.abs(separate - merged)).toBeGreaterThan(1e-4);
  });
});

describe('Sethares (dycon::roughness_seth)', () => {
  // dycon/tests/testthat/test-sethares.R: values from Sethares's MATLAB dissmeasure.m, relative to the (440, 460) dyad,
  // tolerance 1e-2 (the MATLAB code uses s1 = 0.0207, s2 = 18.96, a = 3.51; dycon rounds them).
  const rel = (f: number[], a: number[]) => {
    const parts = (ff: number[], aa: number[]) => ff.map((x, i) => ({ f: x, a: aa[i] }));
    return (
      setharesRoughnessOfPartials(parts(f, a)) /
      setharesRoughnessOfPartials(parts([440, 460], [1, 1]))
    );
  };
  it.each([
    [[440, 460, 480], [1, 1, 1], 2.9194],
    [[440, 460, 480], [1, 2, 3], 3.9161],
    [[440, 460, 480], [3, 2, 1], 3.9194],
    [[300, 250, 275, 425], [1.5, 2, 9, 4], 4.8657],
  ])('%j with amplitudes %j scores %f relative to the 440/460 dyad', (f, a, expected) => {
    expect(Math.abs(rel(f, a) / expected - 1)).toBeLessThan(1e-2);
  });
});

describe('Stolzenburg 2015 (stolz15 / incon::smooth_log_periodicity)', () => {
  it('approximating fractions: Table 1 of the paper, via stolz15 tests', () => {
    expect(fraction(1.059, 0.01)).toEqual([16, 15]);
    expect(fraction(1.122, 0.01)).toEqual([9, 8]);
    expect(fraction(1.189, 0.01)).toEqual([6, 5]);
    expect(fraction(1.26, 0.01)).toEqual([5, 4]);
    expect(fraction(1.335, 0.011)).toEqual([4, 3]);
    expect(fraction(1.414, 0.011)).toEqual([7, 5]);
    expect(fraction(1.498, 0.011)).toEqual([3, 2]);
    expect(fraction(1.587, 0.011)).toEqual([8, 5]);
  });

  it('double, halve and octave handling: stolz15 tests', () => {
    expect(doubleFraction([3, 4])).toEqual([3, 2]);
    expect(doubleFraction([3, 7])).toEqual([6, 7]);
    expect(halfFraction([6, 5])).toEqual([3, 5]);
    expect(halfFraction([3, 7])).toEqual([3, 14]);
    const d = 0.011;
    expect(rationalInterval(0, d)).toEqual([1, 1]);
    expect(rationalInterval(12, d)).toEqual([2, 1]);
    expect(rationalInterval(-3, d)).toEqual([5, 6]);
    expect(rationalInterval(-9, d)).toEqual([3, 5]);
    expect(rationalInterval(-6, d)).toEqual([7, 10]);
  });

  it('smoothed log periodicity of whole chords: stolz15 tests', () => {
    const p = (m: number[]) => periodicity(midiChord(m)).value;
    expect(p([60, 63, 69])).toBeCloseTo(3.7, 1);
    expect(p([48, 64, 67])).toBeCloseTo(1, 12);
    expect(p([60, 63, 67])).toBeCloseTo(Math.log2(10), 12);
    expect(p(Array.from({ length: 12 }, (_, i) => 60 + i))).toBeCloseTo(7.4, 1);
  });

  // By hand for the dyad C-G (7 semitones, 3/2): seen from C the chord is 1/1 and 3/2, lcm of denominators 2, period 2;
  // seen from G it is 2/3 and 1/1, lcm 3, times the first ratio 2/3 = 2; mean of log2 2 and log2 2 = 1.
  it('dyad by hand: the perfect fifth is 1 and the major third 2', () => {
    expect(periodicity(midiChord([60, 67])).value).toBeCloseTo(1, 12);
    expect(periodicity(midiChord([60, 64])).value).toBeCloseTo(2, 12);
  });

  // incon/inst/stolz15/data-formatted.csv column periodicity.stolz_smooth_t2_log (rows sampled every 64th, 3 decimals),
  // chord = pitch classes above middle C; incon's own regression test uses tolerance 1e-3 on all 2048 rows (all of
  // which the builder also checked against this port).
  const CSV: [number[], number][] = [
    [[0], 0.0],
    [[0, 7], 1.0],
    [[0, 9], 1.585],
    [[0, 5], 1.585],
    [[0, 4], 2.0],
    [[0, 3], 2.322],
    [[0, 10, 11], 6.466],
    [[0, 3, 6, 10], 4.859],
    [[0, 2, 3, 9], 5.869],
    [[0, 3, 5, 7, 10], 4.959],
    [[0, 2, 5, 8, 11], 5.476],
    [[0, 2, 6, 8, 9], 5.857],
    [[0, 1, 2, 4, 10], 6.193],
    [[0, 3, 5, 10, 11], 6.624],
    [[0, 2, 4, 5, 7, 9], 5.431],
    [[0, 3, 4, 6, 9, 11], 5.95],
    [[0, 2, 4, 5, 8, 10], 6.146],
    [[0, 4, 7, 9, 10, 11], 6.343],
    [[0, 4, 5, 9, 10, 11], 6.538],
    [[0, 1, 6, 9, 10, 11], 6.727],
    [[0, 1, 2, 3, 5, 9], 6.964],
    [[0, 2, 4, 5, 7, 9, 11], 5.701],
    [[0, 1, 3, 5, 7, 8, 11], 6.32],
    [[0, 1, 2, 5, 6, 8, 9], 6.513],
    [[0, 3, 4, 7, 9, 10, 11], 6.672],
    [[0, 2, 4, 5, 6, 7, 9], 6.803],
    [[0, 1, 2, 5, 6, 8, 11], 6.941],
    [[0, 3, 4, 5, 6, 7, 8], 7.082],
    [[0, 1, 2, 4, 5, 6, 11], 7.278],
    [[0, 2, 4, 5, 6, 8, 9, 11], 6.691],
    [[0, 1, 3, 5, 6, 7, 8, 9], 6.871],
    [[0, 1, 2, 4, 5, 8, 9, 11], 6.994],
    [[0, 1, 2, 3, 6, 7, 10, 11], 7.114],
    [[0, 1, 3, 4, 5, 6, 7, 11], 7.269],
    [[0, 1, 2, 4, 5, 8, 9, 10, 11], 7.003],
    [[0, 1, 5, 6, 7, 8, 9, 10, 11], 7.156],
    [[0, 1, 2, 3, 5, 6, 8, 9, 10, 11], 7.048],
  ];
  it.each(CSV)('incon regression data: pitch classes %j -> %f', (pcs, expected) => {
    const v = periodicity(midiChord(pcs.map((p) => 60 + p))).value;
    expect(Math.abs(v - expected)).toBeLessThan(1e-3 * Math.max(1, expected));
  });

  it('prints the approximating ratio chord relative to the lowest note', () => {
    expect(periodicity([220, 275, 330]).ratios).toEqual([4, 5, 6]);
    // the 12-EDO major triad is within tolerance of 4:5:6, the minor triad of 10:12:15
    expect(periodicity(midiChord([60, 64, 67])).ratios).toEqual([4, 5, 6]);
    expect(periodicity(midiChord([60, 63, 67])).ratios).toEqual([10, 12, 15]);
  });

  it('honours the tolerance (the R code ignores its d argument)', () => {
    // 12-EDO major third is 400 c: within 18.9 c of 5/4 (386 c) but not within 5 c.
    expect(periodicity(midiChord([60, 64]), { toleranceCents: 5 }).value).toBeGreaterThan(2);
  });
});

describe('harmonic template, pitch-class space (har18::pc_harmonicity)', () => {
  const pcs = (p: number[], o = {}) =>
    harmonicity(midiChord(p.map((x) => 60 + x)), { harmonics: 12, rho: 0.75, ...o }).value;

  // har18/tests/testthat/test-harmonicity.R: reference values `ref` (from HarmonyStats) for ten pitch-class sets given
  // by id in the hrep alphabet (the ids cannot be decoded without R). The distinct values below are reproduced to
  // 1e-9 by the transposition classes named here, found by searching all pc sets of up to six notes: the classes are
  // a consequence of the match, not an input to it. Single note (id 1): 1.56025992760304.
  it.each([
    [[0], 1.56025992760304],
    [[0, 1, 4], 0.763094086276816],
    [[0, 3, 4], 0.763094086276816],
    [[0, 1, 3, 6], 0.699233982570559],
    [[0, 1, 2, 3, 4, 6], 0.525533347758732],
    [[0, 2, 6, 8], 0.649556486732275],
    [[0, 1, 2, 7], 0.774127828829956],
  ])('pitch classes %j score %f as in the har18 reference table', (set, expected) => {
    expect(pcs(set)).toBeCloseTo(expected, 9);
  });

  /** Dense reference written from the R code (`sweep_template(legacy = TRUE)` and `kl_div_from_uniform`). */
  function denseHar18(
    pcSemitones: number[],
    harmonics: number,
    rho: number,
    sigma: number
  ): number {
    const N = 1200;
    const limit = Math.floor(sigma * 12);
    const dnorm = (x: number) =>
      Math.exp(-(x * x) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
    const spectrum = (pcList: number[]) => {
      const out = new Array<number>(N).fill(0);
      for (const pc of pcList) {
        for (let i = 1; i <= harmonics; i++) {
          const mean = (pc * 100 + 1200 * Math.log2(i)) % 1200;
          const origin = roundHalfEven(mean) % N;
          for (let k = -limit; k <= limit; k++) {
            out[(((origin + k) % N) + N) % N] += dnorm(k) / i ** rho;
          }
        }
      }
      return out;
    };
    const x = spectrum(pcSemitones);
    const tmpl = spectrum([0]);
    const cos = (a: number[], b: number[]) => {
      let s = 0;
      let aa = 0;
      let bb = 0;
      for (let i = 0; i < N; i++) {
        s += a[i] * b[i];
        aa += a[i] ** 2;
        bb += b[i] ** 2;
      }
      return s / Math.sqrt(aa * bb);
    };
    const res = Array.from({ length: N }, (_, o) =>
      cos(
        tmpl,
        x.map((_v, i) => x[(i + o) % N])
      )
    );
    const sum = res.reduce((s, v) => s + v, 0);
    return res.reduce((s, v) => s + (v / sum) * Math.log2((v / sum) * N), 0);
  }

  it('matches a dense re-implementation of the R algorithm, including a non-12-EDO chord', () => {
    for (const set of [
      [0, 4, 7],
      [0, 3, 7],
      [0, 3, 6],
      [0, 4, 7, 10],
      [0, 3.86, 7.02],
    ]) {
      expect(pcs(set)).toBeCloseTo(denseHar18(set, 12, 0.75, 6.83), 9);
    }
  });

  it('uses the incon defaults (11 harmonics, rho 0.75), whatever the playback timbre', () => {
    const chord = midiChord([60, 64, 67]);
    expect(harmonicity(chord).value).toBeCloseTo(denseHar18([0, 4, 7], 11, 0.75, 6.83), 9);
  });

  it('is octave-invariant in pitch-class space and unaffected by doubled pitch classes', () => {
    expect(harmonicity(midiChord([60, 64, 67])).value).toBeCloseTo(
      harmonicity(midiChord([48, 76, 79, 91])).value,
      9
    );
  });
});

describe('composite model (incon::har_19_composite)', () => {
  it('coefficients are the published unstandardised ones (Harrison & Pearce 2020, Table 2)', () => {
    expect(INCON_COEFFICIENTS.intercept).toBeCloseTo(0.628, 3);
    expect(INCON_COEFFICIENTS.chordSize).toBeCloseTo(0.422, 3);
    expect(INCON_COEFFICIENTS.interference).toBeCloseTo(-1.62001, 5);
    expect(INCON_COEFFICIENTS.harmonicity).toBeCloseTo(1.77992, 5);
    expect(INCON_COEFFICIENTS.culture).toBeCloseTo(-0.089, 3);
  });

  it('inconComposite is the R arithmetic on raw values; the chord-size term is off unless asked for', () => {
    const f = { interference: 0.2, harmonicity: 1.1, chordSize: 3 };
    // R: sum(coef * c(1, chord_size * 0, roughness, harmonicity, corpus = 0))
    const expected = 0.628434666589357 - 1.62001025973261 * 0.2 + 1.77992362857478 * 1.1;
    expect(inconComposite(f)).toBeCloseTo(expected, 12);
    expect(inconComposite(f, { chordSize: true })).toBeCloseTo(
      expected + 0.422267698605598 * 3,
      12
    );
  });

  it('of a chord: raw H&K roughness (incon README 0.1202426) and pc harmonicity (dense R re-implementation) in the formula', () => {
    // C major triad, MIDI 60 64 67. roughness from the incon README; harmonicity is the library value, which the
    // 'incon defaults' test above ties to the dense R re-implementation (11 harmonics, rho 0.75 = what har_19_composite passes with its num_harmonics = 11, roll_off = 1).
    const har = (() => {
      const f = midiChord([60, 64, 67]);
      return harmonicity(f).value;
    })();
    const expected = 0.628434666589357 - 1.62001025973261 * 0.1202426 + 1.77992362857478 * har;
    expect(inconCompositeOfFreqs(midiChord([60, 64, 67]))).toBeCloseTo(expected, 6);
    // and with chord size: 3 distinct pitch classes
    expect(inconCompositeOfFreqs(midiChord([60, 64, 67]), { chordSize: true })).toBeCloseTo(
      expected + 0.422267698605598 * 3,
      6
    );
    // octave doublings add no pitch class
    expect(inconCompositeOfFreqs(midiChord([48, 64, 67, 72]), { chordSize: true })).toBeCloseTo(
      inconCompositeOfFreqs(midiChord([48, 64, 67, 72]), { chordSize: false }) +
        0.422267698605598 * 3,
      12
    );
  });
});
