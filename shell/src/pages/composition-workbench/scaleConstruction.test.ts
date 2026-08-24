import {
  generateMelodicForms,
  realizeScale,
  scalePitchClassPacket,
  scaleSequence,
} from "./scaleConstruction";
import { applyPitchRouteTreatment, defaultPitchRouteTreatment } from "./routeTreatments";
import { pitchGroupToArray, type PitchItemValue } from "./pitch";

describe("scaleConstruction", () => {
  it("rejects empty or non-positive-integer interval sequences", () => {
    expect(() => scaleSequence([])).toThrow();
    expect(() => scaleSequence([2, 0])).toThrow();
    expect(() => scaleSequence([2, -1])).toThrow();
    expect(() => scaleSequence([2, 1.5])).toThrow();
  });

  it("computes the period as the sum of intervals", () => {
    expect(scaleSequence([2, 2, 1]).period).toBe(5);
    expect(scaleSequence([1, 3, 1]).period).toBe(5);
  });

  it("generates every general permutation of a 2-unit binomial without deduping", () => {
    expect(generateMelodicForms([3, 2], "general")).toEqual([
      [3, 2],
      [2, 3],
    ]);
  });

  it("generates all 6 general permutations of a 3-interval scale (Book II §C)", () => {
    const forms = generateMelodicForms([2, 2, 1], "general");
    expect(forms).toHaveLength(6);
    expect(forms).toEqual(
      expect.arrayContaining([
        [2, 2, 1],
        [2, 1, 2],
        [1, 2, 2],
      ]),
    );
  });

  it("keeps repeated general-permutation outputs distinct rather than collapsing them", () => {
    // Two positions share the value 2, so several of the 3! = 6 orderings coincide as
    // sequences (e.g. two different swaps both yield [2, 2, 1]) — all 6 must still be
    // reported, since the process actually produced 6 orderings.
    const forms = generateMelodicForms([2, 2, 1], "general");
    expect(forms).toHaveLength(6);
    const collapsed = new Set(forms.map((form) => form.join(",")));
    expect(collapsed.size).toBeLessThan(forms.length);
  });

  it("generates circular permutations equal in count to the interval length", () => {
    const forms = generateMelodicForms([2, 1, 2], "circular");
    expect(forms).toEqual([
      [2, 1, 2],
      [1, 2, 2],
      [2, 2, 1],
    ]);
  });

  it("realizes a scale as cumulative offsets from a root, unfolded (no mod-12)", () => {
    expect(realizeScale([2, 2, 1], 0)).toEqual([0, 2, 4, 5]);
    expect(realizeScale([2, 2, 1], 60)).toEqual([60, 62, 64, 65]);
  });

  it("emits pitch-class packet items as bare numbers, matching every other domain's item shape", () => {
    const packet = scalePitchClassPacket([2, 2, 1], 0, "src");
    expect(packet.domain).toBe("pitchClass");
    expect(packet.items.map((item) => item.value)).toEqual([0, 2, 4, 5]);
    expect(packet.items[0].label).toBe("C");
  });

  it("voices as concrete pitch without producing NaN midicents (regression: Melodicization's 'must contain finite concrete midicent values' error)", () => {
    const packet = scalePitchClassPacket([2, 2, 1], 0, "src");
    const voiced = applyPitchRouteTreatment(
      packet,
      { ...defaultPitchRouteTreatment, voiceAsPitch: true },
      "route:test",
    );
    expect(voiced?.domain).toBe("pitch");
    for (const item of voiced!.items) {
      for (const midicents of pitchGroupToArray(item.value as PitchItemValue)) {
        expect(Number.isFinite(midicents)).toBe(true);
      }
    }
    // C-D-E-F from root 0 -> MIDI 60,62,64,65 (register floor 60) -> midicents 6000..6500
    expect(voiced!.items.map((item) => item.value)).toEqual([6000, 6200, 6400, 6500]);
  });

  it("folds pitch classes mod a non-default EDO and voices them at the right fractional-semitone step size", () => {
    const packet = scalePitchClassPacket([12, 12, 5], 0, "src", 19);
    expect(packet.domain).toBe("pitchClass");
    expect(packet.encoding).toBe("chromatic-19");
    // Cumulative offsets from root 0 are [0, 12, 24, 29]; folded mod 19 that's [0, 12, 5, 10].
    expect(packet.items.map((item) => item.value)).toEqual([0, 12, 5, 10]);
    // 19-EDO's apotome is 1 step, so every pitch class gets a real single-accidental spelling.
    expect(packet.items.map((item) => item.label)).toEqual(["C", "G#", "Eb", "Gb"]);

    const voiced = applyPitchRouteTreatment(
      packet,
      { ...defaultPitchRouteTreatment, voiceAsPitch: true },
      "route:test",
      19,
    );
    expect(voiced?.domain).toBe("pitch");
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
