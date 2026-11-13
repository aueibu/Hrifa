/** Acceptance criteria of milestone M1 (arcs/interval-placement/ARC.md) plus API behaviour. */
import { describe, expect, it } from 'vitest';
import { scoreRoughness } from '../harmonic-field/scorersMore';
import { edo12, ji, steps } from './testUtils';
import {
  DEFAULT_TIMBRE,
  EQUAL_WEIGHTS,
  TIMBRES,
  combine,
  flatScores,
  harmonicity,
  interference,
  pairwise,
  paretoFront,
  periodicity,
  scoreVoicing,
  standardise,
  timbre,
  timbreFromAmps,
  voicingFromSteps,
  voicingHz,
  type InterferenceModel,
} from './index';

const C2 = 65.40639132514966;
const C4 = 261.6255653005986;
const C6 = 1046.5022612023945;
const MODELS: InterferenceModel[] = ['hutchinson-knopoff', 'sethares'];

describe('register (same interval, different absolute pitch)', () => {
  it.each(MODELS)(
    '%s: a major third has more interference on C2 than on C4, and on C4 than on C6',
    (model) => {
      const at = (root: number) =>
        interference(edo12(root, [0, 4]), DEFAULT_TIMBRE, { model }).total;
      expect(at(C2)).toBeGreaterThan(at(C4));
      expect(at(C4)).toBeGreaterThan(at(C6));
    }
  );
});

describe('octave placement (compound intervals)', () => {
  it.each(MODELS)(
    '%s: M10 has less interference than M3 on the same root; m9 less than m2',
    (model) => {
      const total = (semis: number) =>
        interference(edo12(C4, [0, semis]), DEFAULT_TIMBRE, { model }).total;
      expect(total(16)).toBeLessThan(total(4));
      expect(total(13)).toBeLessThan(total(1));
    }
  );

  it('periodicity: M10 (5/2) is simpler than M3 (5/4); m9 equals m2 (32/15 and 16/15 share the denominator 15)', () => {
    const per = (semis: number) => periodicity(edo12(C4, [0, semis])).value;
    expect(per(16)).toBeCloseTo(1, 12); // seen from either note the period is 2
    expect(per(4)).toBeCloseTo(2, 12); // period 4 from either note
    expect(per(16)).toBeLessThan(per(4));
    expect(per(13)).toBeCloseTo(per(1), 12);
    expect(per(13)).toBeLessThanOrEqual(per(1));
    expect(per(1)).toBeCloseTo(Math.log2(15), 12);
  });
});

describe('harmonicity', () => {
  for (const space of ['pitch-class', 'pitch'] as const) {
    it(`${space}: JI 4:5:6 > 12-EDO major triad > the 0 1 2 cluster at 220 Hz`, () => {
      const h = (f: number[]) => harmonicity(f, { space }).value;
      const justTriad = h(ji(220, [1, 5 / 4, 3 / 2]));
      const edoTriad = h(edo12(220, [0, 4, 7]));
      const cluster = h(edo12(220, [0, 1, 2]));
      expect(justTriad).toBeGreaterThan(edoTriad);
      expect(edoTriad).toBeGreaterThan(cluster);
      // v2 regression: its harmonicity floored at 1/n, so the major triad and the cluster both read 0.333
      expect(edoTriad - cluster).toBeGreaterThan(0.1);
      expect(cluster).not.toBeCloseTo(1 / 3, 2);
      expect(edoTriad).not.toBeCloseTo(1 / 3, 2);
    });
  }

  it('pitch-class space is octave-blind; the pitch-space extension tells M10 from M3', () => {
    const pc = (s: number) => harmonicity(edo12(C4, [0, s])).value;
    const pitch = (s: number) => harmonicity(edo12(C4, [0, s]), { space: 'pitch' }).value;
    expect(pc(16)).toBeCloseTo(pc(4), 9);
    expect(Math.abs(pitch(16) - pitch(4))).toBeGreaterThan(0.01);
  });

  it('pitch space is transposition-invariant (octaves and other transpositions)', () => {
    const v = (root: number) => harmonicity(edo12(root, [0, 4, 7, 11]), { space: 'pitch' }).value;
    expect(v(55)).toBeCloseTo(v(440), 9);
    expect(v(55)).toBeCloseTo(v(1760), 9);
    expect(v(100)).toBeCloseTo(v(100 * 2 ** (7 / 12)), 2);
  });

  it('reports a virtual pitch: for 4:5:6 over 220 Hz it finds the root, 220 Hz, in both spaces', () => {
    for (const space of ['pitch-class', 'pitch'] as const) {
      expect(harmonicity(ji(220, [1, 5 / 4, 3 / 2]), { space }).virtualPitchHz).toBeCloseTo(220, 0);
    }
    // pitch-class space reports the pitch class in the octave at or just below the lowest note
    const r = harmonicity(ji(440, [1, 5 / 4, 3 / 2]));
    expect(r.virtualPitchHz).toBeLessThanOrEqual(440.5);
    expect(r.virtualPitchHz).toBeGreaterThan(220);
  });
});

describe('interference dyad curve (two harmonic tones, default timbre, 1-cent sweep)', () => {
  /** Local minima of the curve of a dyad above 220 Hz, swept from -50 to 1250 cents. */
  function minima(model: InterferenceModel): number[] {
    const curve: number[] = [];
    for (let c = -50; c <= 1250; c++) {
      curve.push(
        interference([220, 220 * 2 ** (c / 1200)], DEFAULT_TIMBRE, { model, decompose: false })
          .total
      );
    }
    const out: number[] = [];
    for (let i = 1; i < curve.length - 1; i++) {
      if (curve[i] < curve[i - 1] && curve[i] <= curve[i + 1]) {
        out.push(i - 50);
      }
    }
    return out;
  }
  const targets = [
    ['1/1', 1],
    ['6/5', 6 / 5],
    ['5/4', 5 / 4],
    ['4/3', 4 / 3],
    ['3/2', 3 / 2],
    ['5/3', 5 / 3],
    ['2/1', 2],
  ] as const;
  const hasMinimumAt = (mins: number[], ratio: number) => {
    const cents = 1200 * Math.log2(ratio);
    return mins.some((m) => Math.abs(m - cents) <= 5);
  };

  /** Names of the targets (among `names`) with no local minimum within 5 cents. */
  const missing = (mins: number[], skip: string[] = []) =>
    targets
      .filter(([name, r]) => !skip.includes(name) && !hasMinimumAt(mins, r))
      .map(([name]) => name);

  it('Sethares: local minima at 1/1, 6/5, 5/4, 4/3, 3/2, 5/3 and 2/1 (within 5 cents)', () => {
    expect(missing(minima('sethares'))).toEqual([]);
  });

  it('Hutchinson-Knopoff: local minima at 1/1, 5/4, 4/3, 3/2, 5/3 and 2/1 (within 5 cents)', () => {
    expect(missing(minima('hutchinson-knopoff'), ['6/5'])).toEqual([]);
  });

  // Orchestrator decision (recorded in the ARC): the ARC's "local minimum at 6/5" holds for the Sethares curve, but
  // Hutchinson-Knopoff's own curve has none there with the default timbre. This test documents what H&K actually does.
  it('Hutchinson-Knopoff: no local minimum within 280-340 c at 220 Hz with the default timbre; one near 6/5 appears with 6-8 harmonics', () => {
    const inWindow = minima('hutchinson-knopoff').filter((m) => m >= 280 && m <= 340);
    expect(inWindow).toEqual([]);
    for (const partials of [6, 8]) {
      const t = timbre({ partials, rolloff: 1 });
      const curve: number[] = [];
      for (let c = 250; c <= 380; c++) {
        curve.push(interference([220, 220 * 2 ** (c / 1200)], t, { decompose: false }).total);
      }
      const mins: number[] = [];
      for (let i = 1; i < curve.length - 1; i++) {
        if (curve[i] < curve[i - 1] && curve[i] <= curve[i + 1]) {
          mins.push(i + 250);
        }
      }
      expect(hasMinimumAt(mins, 6 / 5)).toBe(true);
    }
  });
});

describe('decomposition', () => {
  const chords: [string, number[]][] = [
    ['major triad 12-EDO', edo12(110, [0, 4, 7])],
    ['JI 4:5:6 (coincident partials)', ji(110, [1, 5 / 4, 3 / 2])],
    ['cluster', edo12(220, [0, 1, 2, 3])],
    ['open voicing with an octave', edo12(65.4, [0, 12, 19, 28])],
    ['unison pair', [220, 220]],
    ['single note', [440]],
  ];
  const cases = chords.flatMap(([name, f]) =>
    MODELS.flatMap((model) => [true, false].map((merge) => [name, f, model, merge] as const))
  );
  it.each(cases)(
    '%s, %s, merge=%s: total = sum of dyads + self, perNote = total - total without the note',
    (_n, f, model, merge) => {
      const r = interference(f, DEFAULT_TIMBRE, { model, mergeCoincident: merge });
      let sum = r.self.reduce((s, v) => s + v, 0);
      for (let i = 0; i < f.length; i++) {
        for (let j = i + 1; j < f.length; j++) {
          expect(r.dyads[i][j]).toBe(r.dyads[j][i]);
          sum += r.dyads[i][j];
        }
      }
      expect(Math.abs(sum - r.total)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(r.total)));
      f.forEach((_, i) => {
        const rest = interference(
          f.filter((__, j) => j !== i),
          DEFAULT_TIMBRE,
          { model, mergeCoincident: merge }
        ).total;
        expect(r.perNote[i]).toBeCloseTo(r.total - rest, 12);
      });
      expect(r.worst).toBeLessThanOrEqual(r.total + 1e-12);
    }
  );

  it('the worst relation is the largest dyad and is reported separately from the total', () => {
    const r = interference(edo12(220, [0, 1, 7]));
    expect(r.worst).toBe(Math.max(r.dyads[0][1], r.dyads[0][2], r.dyads[1][2]));
    expect(r.worst).toBe(r.dyads[0][1]); // the semitone is the harshest relation
  });

  it('decompose: false skips only the per-note marginals', () => {
    const a = interference(edo12(220, [0, 4, 7]));
    const b = interference(edo12(220, [0, 4, 7]), DEFAULT_TIMBRE, { decompose: false });
    expect(b.total).toBe(a.total);
    expect(b.dyads).toEqual(a.dyads);
    expect(b.worst).toBe(a.worst);
    expect(b.perNote).toEqual([]);
  });

  it('scoreVoicing gives per-note marginals for periodicity and harmonicity too', () => {
    const s = scoreVoicing({ refHz: 220, cents: [0, 400, 700] });
    expect(s.periodicity.perNote).toHaveLength(3);
    expect(s.harmonicity.pitchClass.perNote).toHaveLength(3);
    expect(s.harmonicity.pitch.perNote).toHaveLength(3);
  });
});

describe('EDO-agnostic scoring', () => {
  const chords = {
    '12-EDO major': steps(220, 12, [0, 4, 7]),
    '19-EDO major': steps(220, 19, [0, 6, 11]),
    '31-EDO major': steps(220, 31, [0, 10, 18]),
    '31-EDO 4:5:6:7': steps(220, 31, [0, 10, 18, 25]),
    'JI 4:5:6': ji(220, [1, 5 / 4, 3 / 2]),
  };
  it.each(Object.entries(chords))('%s: every score is finite', (_n, f) => {
    const values = [
      ...MODELS.map((model) => interference(f, DEFAULT_TIMBRE, { model }).total),
      periodicity(f).value,
      harmonicity(f, { space: 'pitch-class' }).value,
      harmonicity(f, { space: 'pitch' }).value,
    ];
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
  });

  it("31-EDO's 7/4 approximation has lower periodicity than a 12-EDO tritone", () => {
    const septimal = periodicity(steps(220, 31, [0, 25]));
    const tritone = periodicity(steps(220, 12, [0, 6]));
    expect(septimal.ratios).toEqual([4, 7]);
    expect(tritone.ratios).toEqual([5, 7]);
    expect(septimal.value).toBeLessThan(tritone.value);
  });

  it('19-EDO and 31-EDO triads are scored by the same functions and sit near 4:5:6 in periodicity and harmonicity', () => {
    const h = (f: number[]) => harmonicity(f).value;
    // 31-EDO major third is 387.1 c (JI 386.3), 12-EDO 400 c: the 31-EDO triad is the better template match
    expect(h(chords['31-EDO major'])).toBeGreaterThan(h(chords['12-EDO major']));
    // 19-EDO (378.9 c third, 694.7 c fifth) is also a close approximation: far above the cluster
    expect(h(chords['19-EDO major'])).toBeGreaterThan(h(edo12(220, [0, 1, 2])));
    for (const name of ['12-EDO major', '19-EDO major', '31-EDO major'] as const) {
      expect(periodicity(chords[name]).ratios).toEqual([4, 5, 6]);
    }
  });
});

describe('cross-check with the harmonic-field lab roughness (read-only import)', () => {
  // scoreRoughness: Sethares' MATLAB parameters, 7 harmonics at 0.88^(k-1), min-amplitude rule, no merging, no
  // normalisation, scaled by his factor 5. With the same timbre and merging off, our Sethares option differs only by
  // dycon's rounded parameters, so the ranking must be identical.
  const t = timbreFromAmps(Array.from({ length: 7 }, (_, i) => 0.88 ** i));
  const set: number[][] = [
    edo12(110, [0, 4, 7]),
    edo12(110, [0, 3, 7]),
    edo12(110, [0, 1, 2]),
    edo12(220, [0, 7]),
    edo12(220, [0, 1]),
    edo12(55, [0, 4]),
    edo12(440, [0, 4]),
    ji(220, [1, 5 / 4, 3 / 2]),
    edo12(110, [0, 4, 7, 11]),
    edo12(110, [0, 2, 4, 6, 8]),
    edo12(330, [0, 6]),
    edo12(110, [0, 12, 19]),
  ];
  const order = (xs: number[]) => xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);

  it('orders a fixed chord set the same way', () => {
    const ours = set.map(
      (f) =>
        interference(f, t, { model: 'sethares', mergeCoincident: false, decompose: false }).total
    );
    const theirs = set.map((f) => scoreRoughness(f).score);
    expect(order(ours)).toEqual(order(theirs));
    // and the values are proportional (about 1 / 5 of the lab's, from the factor 5 and the rounded parameters)
    const ratios = ours.map((v, i) => theirs[i] / v);
    expect(ratios.every((r) => Math.abs(r / ratios[0] - 1) < 0.02)).toBe(true);
  });
});

describe('harmonicity does not follow the playback timbre', () => {
  // Regression: the template once took its harmonics from the playback timbre, so a sine collapsed it to a function of
  // the note count only (P5 = tritone, triad = cluster = augmented): the v2 bug again.
  it.each(['sine', 'triangle', 'piano', 'guitar'] as const)(
    '%s: scoreVoicing orders chords by harmonicity as with any timbre',
    (name) => {
      const hp = (cents: number[]) =>
        scoreVoicing({ refHz: 220, cents }, { timbre: TIMBRES[name], decompose: false })
          .harmonicity;
      const base = (cents: number[]) =>
        scoreVoicing({ refHz: 220, cents }, { decompose: false }).harmonicity;
      const triad = [0, 386.3137, 701.955];
      const edoTriad = [0, 400, 700];
      const cluster = [0, 100, 200];
      expect(hp(triad).pitchClass.value).toBeGreaterThan(hp(edoTriad).pitchClass.value);
      expect(hp(edoTriad).pitchClass.value).toBeGreaterThan(hp(cluster).pitchClass.value);
      expect(hp(triad).pitch.value).toBeGreaterThan(hp(edoTriad).pitch.value);
      expect(hp(edoTriad).pitch.value).toBeGreaterThan(hp(cluster).pitch.value);
      expect(hp([0, 700]).pitchClass.value).not.toBeCloseTo(hp([0, 600]).pitchClass.value, 2);
      expect(hp([0, 400, 800]).pitchClass.value).not.toBeCloseTo(hp(cluster).pitchClass.value, 2);
      // identical to the default-timbre values
      expect(hp(edoTriad).pitchClass.value).toBe(base(edoTriad).pitchClass.value);
      expect(hp(edoTriad).pitch.value).toBe(base(edoTriad).pitch.value);
    }
  );

  it('can still be overridden by explicit options', () => {
    const f = edo12(220, [0, 4, 7]);
    expect(harmonicity(f, { harmonics: 12 }).value).not.toBeCloseTo(harmonicity(f).value, 6);
  });
});

describe('pairwise (isolated-pair roughness for the Relations view)', () => {
  it('scores each pair alone: M10 is smoother than M3, and the same M3 is rougher on C2 than on C4', () => {
    const m10 = pairwise(edo12(C4, [0, 16])).matrix[0][1];
    const m3 = pairwise(edo12(C4, [0, 4])).matrix[0][1];
    expect(m10).toBeLessThan(m3);
    expect(pairwise(edo12(C2, [0, 4])).matrix[0][1]).toBeGreaterThan(m3);
  });

  it('is symmetric, ignores the other notes and reports the worst pair', () => {
    const chord = edo12(220, [0, 1, 7]);
    const p = pairwise(chord);
    expect(p.matrix[0][1]).toBe(p.matrix[1][0]);
    expect(p.matrix[1][2]).toBeCloseTo(pairwise([chord[1], chord[2]]).matrix[0][1], 12);
    expect(p.worst).toBe(Math.max(p.matrix[0][1], p.matrix[0][2], p.matrix[1][2]));
    expect(p.worst).toBe(p.matrix[0][1]);
  });
});

describe('periodicity deduplicates pitches', () => {
  it('a repeated pitch does not change the value or the ratios', () => {
    const a = periodicity(edo12(C4, [0, 0, 1, 7]));
    const b = periodicity(edo12(C4, [0, 1, 7]));
    expect(a.value).toBeCloseTo(b.value, 12);
    expect(a.ratios).toEqual(b.ratios);
  });
});

describe('input validation', () => {
  it('rejects non-positive tolerances, sigma, harmonics and non-finite or non-positive frequencies', () => {
    const f = [220, 275];
    expect(() => periodicity(f, { toleranceCents: 0 })).toThrow(RangeError);
    expect(() => periodicity(f, { toleranceCents: -5 })).toThrow(RangeError);
    expect(() => periodicity(f, { toleranceCents: Number.NaN })).toThrow(RangeError);
    expect(() => harmonicity(f, { sigma: 0 })).toThrow(RangeError);
    expect(() => harmonicity(f, { sigma: -1 })).toThrow(RangeError);
    expect(() => harmonicity(f, { harmonics: 0 })).toThrow(RangeError);
    expect(() => harmonicity(f, { harmonics: 2.5 })).toThrow(RangeError);
    expect(() => harmonicity(f, { rho: Number.NaN })).toThrow(RangeError);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => interference([220, bad])).toThrow(RangeError);
      expect(() => periodicity([220, bad])).toThrow(RangeError);
      expect(() => harmonicity([220, bad])).toThrow(RangeError);
      expect(() => pairwise([220, bad])).toThrow(RangeError);
    }
  });
});

describe('timbres', () => {
  it('timbre({partials, rolloff}) gives amplitude 1 / n^rolloff', () => {
    const t = timbre({ partials: 4, rolloff: 2 });
    expect(t.amps).toEqual([1, 1 / 4, 1 / 9, 1 / 16]);
    expect(DEFAULT_TIMBRE.partials).toBe(11);
    expect(DEFAULT_TIMBRE.rolloff).toBe(1);
  });
  it('presets follow the page: sine, triangle (odd harmonics 1/n^2), piano (sonify.ts list), guitar', () => {
    expect(TIMBRES.sine.amps).toEqual([1]);
    expect(TIMBRES.triangle.amps.slice(0, 4)).toEqual([1, 0, 1 / 9, 0]);
    expect(TIMBRES.piano.amps).toEqual([1, 0.55, 0.3, 0.18, 0.1, 0.06]);
    expect(TIMBRES.guitar.partials).toBeGreaterThan(1);
  });
  it('the timbre changes the interference of the same chord', () => {
    const sine = interference(edo12(C4, [0, 3]), TIMBRES.sine).total;
    const rich = interference(edo12(C4, [0, 3]), DEFAULT_TIMBRE).total;
    expect(sine).toBeGreaterThan(0);
    expect(sine).not.toBeCloseTo(rich, 3);
  });
  it('rejects bad input', () => {
    expect(() => timbre({ partials: 0, rolloff: 1 })).toThrow();
    expect(() => interference([220, -5])).toThrow();
    expect(() => periodicity([0])).toThrow();
    expect(() => harmonicity([NaN])).toThrow();
  });
});

describe('scoreVoicing', () => {
  it('scores a {refHz, cents[]} voicing with every model, in absolute Hz', () => {
    const v = { refHz: C4, cents: [0, 400, 700] };
    const s = scoreVoicing(v);
    expect(s.freqsHz).toEqual(voicingHz(v));
    expect(s.interference.hutchinsonKnopoff.total).toBeCloseTo(0.1202426, 6);
    expect(s.interference.sethares.total).toBeGreaterThan(0);
    expect(s.periodicity.ratios).toEqual([4, 5, 6]);
    expect(s.harmonicity.pitchClass.value).toBeGreaterThan(0);
    const flat = flatScores(s);
    expect(flat.interference).toBe(s.interference.hutchinsonKnopoff.total);
    expect(flat.harmonicityPitch).toBe(s.harmonicity.pitch.value);
  });

  it('the same voicing moved to another reference scores differently in interference (register) but not in harmonicity', () => {
    const lo = scoreVoicing({ refHz: C2, cents: [0, 400, 700] }, { decompose: false });
    const hi = scoreVoicing({ refHz: C6, cents: [0, 400, 700] }, { decompose: false });
    expect(lo.interference.hutchinsonKnopoff.total).toBeGreaterThan(
      hi.interference.hutchinsonKnopoff.total
    );
    expect(lo.harmonicity.pitchClass.value).toBeCloseTo(hi.harmonicity.pitchClass.value, 9);
    expect(lo.periodicity.value).toBeCloseTo(hi.periodicity.value, 12);
  });

  it('voicingFromSteps converts EDO steps to cents', () => {
    expect(
      voicingFromSteps(100, [0, 10, 18], 31).cents.map((c) => Math.round(c * 10) / 10)
    ).toEqual([0, 387.1, 696.8]);
  });
});

describe('ranking helpers', () => {
  it('standardise gives mean 0 and sample sd 1; constants and singletons give zeros', () => {
    const z = standardise([1, 2, 3, 4, 10]);
    expect(z.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 12);
    expect(Math.sqrt(z.reduce((s, v) => s + v * v, 0) / 4)).toBeCloseTo(1, 12);
    expect(standardise([5, 5, 5])).toEqual([0, 0, 0]);
    expect(standardise([7])).toEqual([0]);
    expect(standardise([])).toEqual([]);
  });

  it('combine weights columns (negative weight for lower-is-better) and checks shapes', () => {
    const out = combine(
      [standardise([1, 2, 3]), standardise([3, 2, 1])],
      [EQUAL_WEIGHTS.interference, EQUAL_WEIGHTS.harmonicity]
    );
    // candidate 0 has the lowest interference and the highest harmonicity: best
    expect(out[0]).toBeGreaterThan(out[1]);
    expect(out[1]).toBeGreaterThan(out[2]);
    expect(out[0]).toBeCloseTo(-EQUAL_WEIGHTS.interference + EQUAL_WEIGHTS.harmonicity, 12);
    expect(() => combine([[1, 2]], [1, 2])).toThrow();
    expect(() => combine([[1, 2], [1]], [1, 1])).toThrow();
  });

  it('paretoFront returns the non-dominated indices; senses flip an axis; equal points stay', () => {
    const pts = [
      [1, 5],
      [2, 2],
      [3, 1],
      [3, 3], // dominated by [2,2]
      [2, 2], // equal to index 1: both stay
      [5, 0.5],
    ];
    expect(paretoFront(pts)).toEqual([0, 1, 2, 4, 5]);
    // maximise the second axis: [1,5] beats everything on it at the lowest first value
    expect(paretoFront(pts, ['min', 'max'])).toEqual([0]);
    expect(
      paretoFront([
        [1, Number.NaN],
        [2, 2],
      ])
    ).toEqual([1]);
    expect(paretoFront([])).toEqual([]);
  });
});
