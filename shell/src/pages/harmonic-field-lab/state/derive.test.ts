import { describe, expect, it } from 'vitest';
import {
  MAX_CHORDS,
  MAX_KEYS_NOTES,
  MAX_SPECTRUM,
  chordModel,
  deriveBase,
  dissOf,
  edoOf,
  fieldRowsOf,
  fifthsFor,
  isoOf,
  keysOf,
  lattice2dOf,
  spectrumOf,
  stripDevs,
} from './derive';
import { defaultGen, genFromPreset, presetByName } from './generate';
import {
  activeTab,
  initialState,
  labReducer,
  makeTab,
  type Action,
  type LabState,
} from './labState';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const first = (s: LabState) => {
  const tab = activeTab(s);
  return { tab, base: deriveBase(tab) };
};
const major = () => run(initialState(), { type: 'sel/set', idx: [0, 1, 2, 4, 5, 6, 7] }); // no 11/8

describe('deriveBase', () => {
  it('reads the subset from the mode root', () => {
    const { base } = first(run(major(), { type: 'mode/set', mode: 2 }));
    expect(base.idx).toEqual([0, 1, 2, 4, 5, 6, 7]);
    expect(base.rel[0].src).toBe(2);
    expect(base.rel[0].c).toBe(0);
    expect(base.rootC).toBeCloseTo(386.31, 1);
    expect(base.ratios[2]).toBe('5/4');
    expect(base.repText).toBe('2/1');
    expect(base.analysis?.N).toBe(7);
  });

  it('an empty subset has no analysis but does not throw', () => {
    const { base } = first(run(initialState(), { type: 'sel/none' }));
    expect(base.rel).toEqual([]);
    expect(base.analysis).toBeNull();
    expect(base.rootC).toBe(0);
    expect(spectrumOf(base)).toBeNull();
    expect(chordModel(base)).toBeNull();
    expect(keysOf(base, 18)).toBeNull();
    expect(edoOf(base).rows).toHaveLength(68);
  });
});

describe('stripDevs (the tuner strip)', () => {
  it('measures against 12-EDO above the mode root: 5/4 (386.3 c) is 13.7 c flat of the piano major third (400 c)', () => {
    const { base, tab } = first(initialState());
    const { devs, caption } = stripDevs(base, tab);
    expect(caption).toMatch(/12-EDO/);
    expect(devs[2].ratio).toBe('5/4');
    expect(devs[2].dev).toBeCloseTo(-13.69, 1);
    expect(devs[2].label).toBe('M3');
    expect(devs[4].dev).toBeCloseTo(1.96, 1); // 3/2
    expect(devs).toHaveLength(8);
  });

  it('follows the mode root: with 9/8 as the root, the root itself is exactly on its target', () => {
    const s = run(initialState(), { type: 'sel/set', idx: [0, 1, 2, 4], mode: 1 });
    const { base, tab } = first(s);
    const d = stripDevs(base, tab).devs;
    expect(d[1].dev).toBeCloseTo(0, 6);
    expect(d[2].dev).toBeCloseTo(182.4 - 200, 0); // 5/4 is 182.4 c above 9/8
  });

  it('JI (odd limit), m-EDO and a picked scale', () => {
    let s = run(initialState(), { type: 'cmp/set', patch: { ref: 'ji', odd: 5 } });
    let r = first(s);
    expect(stripDevs(r.base, r.tab).caption).toMatch(/odd limit 5/);
    expect(stripDevs(r.base, r.tab).devs[2].dev).toBeCloseTo(0, 6); // 5/4 is exactly a 5-limit ratio
    s = run(initialState(), { type: 'cmp/set', patch: { ref: 'medo', m: 19 } });
    r = first(s);
    expect(stripDevs(r.base, r.tab).caption).toMatch(/19-EDO/);
    s = run(
      initialState(),
      { type: 'tab/add', gen: { ...defaultGen(), method: 'edo', edoN: 12 } },
      { type: 'pick/set', patch: { scale: 'w:Ionian (major)', kind: 'edo12' } },
      { type: 'pick/apply' }
    );
    r = first(s);
    const out = stripDevs(r.base, r.tab);
    expect(out.caption).toMatch(/Ionian/);
    // the notes the scale picked sit exactly on its targets (the other field notes are 100 c from the nearest one)
    expect(r.tab.sel.map((i) => Math.abs(out.devs[i].dev))).toEqual(
      r.tab.sel.map(() => expect.closeTo(0, 6))
    );
  });
});

describe('analyses and their size caps', () => {
  it('spectrum, chords and keys for the example subset (no 11/8, tolerance 18 c)', () => {
    const { base } = first(major());
    const sp = spectrumOf(base)!;
    expect(sp.spectrum).toHaveLength(6);
    const model = chordModel(base)!;
    expect(model.chordsAt(18).length).toBe(10);
    expect(model.ladder[0].tol).toBeGreaterThanOrEqual(0);
    expect(model.chipsAt(18).some((c) => !c.found)).toBe(true);
    expect(model.templateCount).toBeGreaterThan(5);
    const k = keysOf(base, 18)!;
    expect(k.keys).toHaveLength(8);
    expect(k.completeKeys).toHaveLength(1);
    expect(k.modeFit).toHaveLength(7);
    expect(k.modeFit[0].errs).toHaveLength(7);
    expect(k.modeFit[0].root).toBe('1/1');
    expect(k.modeFit[2].root).toBe('5/4');
    expect(k.keyRings).toHaveLength(8);
  });

  it("mode rows are the subset's own modes, whichever mode is current", () => {
    const a = keysOf(first(major()).base, 18)!;
    const b = keysOf(first(run(major(), { type: 'mode/set', mode: 3 })).base, 18)!;
    expect(b.modeFit.map((m) => m.root)).toEqual(a.modeFit.map((m) => m.root));
    expect(b.modeFit.map((m) => m.errs.length)).toEqual(a.modeFit.map((m) => m.errs.length));
  });

  it('applies the caps: spectrum 64, chords 128, keys 256 notes or too much work', () => {
    const big = (n: number) =>
      first(
        run(initialState(), { type: 'tab/add', gen: { ...defaultGen(), method: 'edo', edoN: n } })
      ).base;
    expect(spectrumOf(big(MAX_SPECTRUM))).not.toBeNull();
    expect(spectrumOf(big(MAX_SPECTRUM + 1))).toBeNull();
    expect(chordModel(big(MAX_CHORDS))).not.toBeNull();
    expect(chordModel(big(MAX_CHORDS + 1))).toBeNull();
    expect(keysOf(big(MAX_KEYS_NOTES + 1), 18)).toBeNull();
    // more than 32 notes: keys yes, the mode grid no
    const k = keysOf(big(40), 18)!;
    expect(k.modeFit).toEqual([]);
    expect(k.keys.length).toBe(40);
  });
});

describe('field table, ring, visualizers', () => {
  it('lists a row per field note with the step to the next and the repeat after the last', () => {
    const { base } = first(initialState());
    const rows = fieldRowsOf(base.field, base.repC);
    expect(rows).toHaveLength(8);
    expect(rows[0].step).toBeCloseTo(203.91, 1);
    expect(rows[7].step).toBeCloseTo(1200 - 1088.27, 1);
    expect(rows[3].monzo).toBe('2^-3 11');
    expect(rows[2].prime).toBe(5);
    expect(rows[2].odd).toBe('5');
    expect(rows[2].vs12).toBe('E -13.7');
  });

  it('the Fifths ring puts 5/4 on step +4 and falls back to 3/2 for a generator that does not parse', () => {
    const { base } = first(initialState());
    expect(fifthsFor(base.field, base.repC, '3/2', 12).notes[2].step).toBe(4);
    for (const bad of ['', 'junk', '0', '1/1', '-3/2']) {
      expect(fifthsFor(base.field, base.repC, bad, 12).notes[2].step).toBe(4);
    }
  });

  it('the 2D lattice places the field and does not fail on an empty or one-note field', () => {
    const { base } = first(initialState());
    expect(lattice2dOf(base.field, base.rep, null).pts).toHaveLength(8);
    const one = makeTab('t', { ...defaultGen(), method: 'edo', edoN: 1 });
    expect(() => lattice2dOf(one.field, one.rep, null)).not.toThrow();
    expect(() => lattice2dOf([], one.rep, null)).not.toThrow();
  });

  it('EDO fit, dissonance curve and the isomorphic grid', () => {
    const { base } = first(major());
    const e = edoOf(base);
    expect(e.rows[0].n).toBe(5);
    expect(e.rows.at(-1)?.n).toBe(72);
    expect(e.best.length).toBeGreaterThan(0);
    const d = dissOf(1200);
    expect(d.curve.cents).toHaveLength(1201);
    expect(d.dips.map((x) => x.ratio)).toEqual(expect.arrayContaining(['3/2', '5/4']));
    const cells = isoOf(base, '3/2', '2/1', 20);
    expect(cells).toHaveLength(60);
    // unreadable generators fall back instead of throwing
    expect(isoOf(base, 'x', '', 20)).toHaveLength(60);
  });

  it('a non-octave repeat flows through the base', () => {
    const g = { ...genFromPreset(presetByName('Harmonics 8–15')!), rep: '3/1', h: 9 };
    const t = makeTab('t', g);
    const base = deriveBase(t);
    expect(base.repText).toBe('3/1');
    expect(fieldRowsOf(base.field, base.repC).at(-1)?.step).toBeGreaterThan(0);
  });
});
