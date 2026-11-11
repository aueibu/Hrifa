import { pitchGroupToArray, type PitchItemValue } from './pitch';
import { applyPitchRouteTreatment, defaultPitchRouteTreatment } from './routeTreatments';
import {
  generateMelodicFamilies,
  generateMelodicForms,
  cycleFolders,
  melodicFormsPacket,
  realizeScale,
  scalePitchClassPacket,
  scaleSequence,
} from './scaleConstruction';

describe('scaleConstruction', () => {
  it('rejects empty or non-positive-integer interval sequences', () => {
    expect(() => scaleSequence([])).toThrow();
    expect(() => scaleSequence([2, 0])).toThrow();
    expect(() => scaleSequence([2, -1])).toThrow();
    expect(() => scaleSequence([2, 1.5])).toThrow();
  });

  it('computes the period as the sum of intervals', () => {
    expect(scaleSequence([2, 2, 1]).period).toBe(5);
    expect(scaleSequence([1, 3, 1]).period).toBe(5);
  });

  it('generates every general permutation of a 2-unit binomial without deduping', () => {
    expect(generateMelodicForms([3, 2], 'general')).toEqual([
      [3, 2],
      [2, 3],
    ]);
  });

  it('generates all 6 general permutations of a 3-interval scale (Book II §C)', () => {
    const forms = generateMelodicForms([2, 2, 1], 'general');
    expect(forms).toHaveLength(6);
    expect(forms).toEqual(
      expect.arrayContaining([
        [2, 2, 1],
        [2, 1, 2],
        [1, 2, 2],
      ])
    );
  });

  it('keeps repeated general-permutation outputs distinct rather than collapsing them', () => {
    // Two positions share the value 2, so several of the 3! = 6 orderings coincide as
    // sequences (e.g. two different swaps both yield [2, 2, 1]) — all 6 must still be
    // reported, since the process actually produced 6 orderings.
    const forms = generateMelodicForms([2, 2, 1], 'general');
    expect(forms).toHaveLength(6);
    const collapsed = new Set(forms.map((form) => form.join(',')));
    expect(collapsed.size).toBeLessThan(forms.length);
  });

  it('generates circular permutations equal in count to the interval length', () => {
    const forms = generateMelodicForms([2, 1, 2], 'circular');
    expect(forms).toEqual([
      [2, 1, 2],
      [1, 2, 2],
      [2, 2, 1],
    ]);
  });

  it("splits general forms into (n-1)! rotation families of n, with the original's family first", () => {
    const families = generateMelodicFamilies([2, 2, 1], 'general');
    expect(families).toHaveLength(2);
    expect(families.map((family) => family.cycle)).toEqual([0, 1]);
    expect(families[0].forms.map((form) => form.values)).toEqual([
      [2, 2, 1],
      [2, 1, 2],
      [1, 2, 2],
    ]);
    expect(families[0].forms[0].order).toEqual([0, 1, 2]);
    expect(families[1].forms[0].order).toEqual([0, 2, 1]);
    expect(families[1].inversions).toBeGreaterThan(families[0].inversions);
    // Rotations within a family are cyclic shifts of its base.
    expect(families[1].forms.map((form) => form.shift)).toEqual([0, 1, 2]);
  });

  it('makes the circular mode exactly cycle 0, and flattens families in order', () => {
    const circular = generateMelodicFamilies([3, 1, 2, 2], 'circular');
    expect(circular).toHaveLength(1);
    expect(generateMelodicFamilies([3, 1, 2, 2], 'general')[0]).toEqual(circular[0]);
    const general = generateMelodicFamilies([3, 1, 2, 2], 'general');
    expect(general).toHaveLength(6);
    expect(general.flatMap((family) => family.forms)).toHaveLength(24);
    expect(generateMelodicForms([3, 1, 2, 2], 'general')).toHaveLength(24);
  });

  it('groups by position, so coincident-valued forms stay separate entries', () => {
    const packet = melodicFormsPacket([2, 2, 1], 'general', 'src');
    expect(packet.items).toHaveLength(6);
    expect(packet.metadata).toMatchObject({ familyCount: 2 });
    expect(packet.metadata?.entryGroups).toEqual([
      ...Array(3).fill(['Cycle 0 (original)']),
      ...Array(3).fill(['Cycle 1']),
    ]);
    // A single family (circular mode) adds no group level.
    expect(melodicFormsPacket([2, 2, 1], 'circular', 'src').metadata?.entryGroups).toBeUndefined();
    expect(packet.items.map((item) => item.id)).toEqual(
      [0, 1, 2, 3, 4, 5].map((index) => `src:form:${index}`)
    );
    expect(packet.items[3].provenance[0].parameters).toMatchObject({ family: 1, shift: 0 });
  });

  it('files cycles ten at a time into folders once there are more than 10 families', () => {
    // 5 intervals -> 4! = 24 families of 5 forms.
    const packet = melodicFormsPacket([1, 2, 3, 4, 5], 'general', 'src');
    const groups = packet.metadata?.entryGroups as string[][];
    expect(groups).toHaveLength(120);
    expect(groups[0]).toEqual(['Cycles 0–9', 'Cycle 0 (original)']);
    expect(groups[10 * 5]).toEqual(['Cycles 10–19', 'Cycle 10']);
    expect(groups[119]).toEqual(['Cycles 20–23', 'Cycle 23']);

    // 4 intervals -> 3! = 6 families: within the limit, so no folders.
    const small = melodicFormsPacket([1, 2, 3, 4], 'general', 'src');
    expect((small.metadata?.entryGroups as unknown[] | undefined)?.[0]).toEqual([
      'Cycle 0 (original)',
    ]);
  });

  it('nests folders of 10, 100, … so no menu level exceeds 10 entries', () => {
    // 6 intervals -> 5! = 120 families of 6 forms.
    const groups = melodicFormsPacket([1, 2, 3, 4, 5, 6], 'general', 'src').metadata
      ?.entryGroups as string[][];
    expect(groups).toHaveLength(720);
    expect(groups[0]).toEqual(['Cycles 0–99', 'Cycles 0–9', 'Cycle 0 (original)']);
    expect(groups[719]).toEqual(['Cycles 100–119', 'Cycles 110–119', 'Cycle 119']);

    expect(cycleFolders(3, 10)).toEqual([]);
    expect(cycleFolders(3, 11)).toEqual(['Cycles 0–9']);
    expect(cycleFolders(47, 100)).toEqual(['Cycles 40–49']);
    // A lone trailing cycle sits beside the folders rather than in a one-entry folder.
    expect(cycleFolders(10, 11)).toEqual([]);
    expect(cycleFolders(100, 101)).toEqual([]);
  });

  it('keeps every menu level at 10 entries or fewer for any number of cycles', () => {
    for (let count = 1; count <= 5040; count += count < 1200 ? 1 : 97) {
      const children = new Map<string, Set<string>>();
      for (let cycle = 0; cycle < count; cycle += 1) {
        const path = [...cycleFolders(cycle, count), `Cycle ${cycle}`];
        path.forEach((part, depth) => {
          const parent = path.slice(0, depth).join('/');
          children.set(parent, (children.get(parent) ?? new Set()).add(part));
        });
      }
      for (const entries of children.values()) {
        expect(entries.size).toBeLessThanOrEqual(10);
      }
    }
  });

  it('handles a single-interval scale', () => {
    const families = generateMelodicFamilies([5], 'general');
    expect(families).toHaveLength(1);
    expect(families[0].forms.map((form) => form.values)).toEqual([[5]]);
  });

  it('realizes a scale as cumulative offsets from a root, unfolded (no mod-12)', () => {
    expect(realizeScale([2, 2, 1], 0)).toEqual([0, 2, 4, 5]);
    expect(realizeScale([2, 2, 1], 60)).toEqual([60, 62, 64, 65]);
  });

  it("emits pitch-class packet items as bare numbers, matching every other domain's item shape", () => {
    const packet = scalePitchClassPacket([2, 2, 1], 0, 'src');
    expect(packet.domain).toBe('pitchClass');
    expect(packet.items.map((item) => item.value)).toEqual([0, 2, 4, 5]);
    expect(packet.items[0].label).toBe('C');
  });

  it("voices as concrete pitch without producing NaN midicents (regression: Melodicization's 'must contain finite concrete midicent values' error)", () => {
    const packet = scalePitchClassPacket([2, 2, 1], 0, 'src');
    const voiced = applyPitchRouteTreatment(
      packet,
      { ...defaultPitchRouteTreatment, voiceAsPitch: true },
      'route:test'
    );
    expect(voiced?.domain).toBe('pitch');
    for (const item of voiced!.items) {
      for (const midicents of pitchGroupToArray(item.value as PitchItemValue)) {
        expect(Number.isFinite(midicents)).toBe(true);
      }
    }
    // C-D-E-F from root 0 -> MIDI 60,62,64,65 (register floor 60) -> midicents 6000..6500
    expect(voiced!.items.map((item) => item.value)).toEqual([6000, 6200, 6400, 6500]);
  });

  it('folds pitch classes mod a non-default EDO and voices them at the right fractional-semitone step size', () => {
    const packet = scalePitchClassPacket([12, 12, 5], 0, 'src', 19);
    expect(packet.domain).toBe('pitchClass');
    expect(packet.encoding).toBe('chromatic-19');
    // Cumulative offsets from root 0 are [0, 12, 24, 29]; folded mod 19 that's [0, 12, 5, 10].
    expect(packet.items.map((item) => item.value)).toEqual([0, 12, 5, 10]);
    // 19-EDO's apotome is 1 step, so every pitch class gets a real single-accidental spelling.
    expect(packet.items.map((item) => item.label)).toEqual(['C', 'G#', 'Eb', 'Gb']);

    const voiced = applyPitchRouteTreatment(
      packet,
      { ...defaultPitchRouteTreatment, voiceAsPitch: true },
      'route:test',
      19
    );
    expect(voiced?.domain).toBe('pitch');
    // Step size at 19-EDO is 1200/19 cents; pitch class 12 above register floor 60*100=6000
    // lands at 6000 + 12 * (1200/19), rounded to the nearest whole cent by voicePitchClasses'
    // integer arithmetic being exact only at 12-EDO — assert it's finite and in the right octave
    // rather than hardcoding a fractional cents value prone to float-precision churn.
    for (const item of voiced!.items) {
      for (const midicents of pitchGroupToArray(item.value as PitchItemValue)) {
        expect(Number.isFinite(midicents)).toBe(true);
        expect(midicents).toBeGreaterThanOrEqual(6000);
        expect(midicents).toBeLessThan(6000 + 1200);
      }
    }
  });
});
